import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import {
  CreditCard, Search, RefreshCw, AlertTriangle, AlertCircle, CheckCircle,
  Eye, X, Copy, Check, Filter, ExternalLink, Calendar, User, Hotel,
  DollarSign, Clock, ShieldAlert, ArrowRight, ShieldCheck, ChevronLeft, ChevronRight, Info
} from 'lucide-react';
import {
  evaluateSubscriptionEntitlement,
  resolveEffectiveSubscription,
  parseVerifiedDate
} from '../lib/subscriptionEntitlement.js';
import {
  formatINR,
  formatDateStr,
  detectSubscriptionDiscrepancies,
  synthesizeHistoricalInventory,
  calculateSubscriptionMetrics
} from '../lib/subscriptionDiscrepancies.js';
import toast from 'react-hot-toast';

export default function SubscriptionMonitoringTab({
  profile,
  globalPlans = {},
  initialSubscriptions = null,
  initialPayments = null,
  initialInvoices = null,
  initialProfiles = null
}) {
  // Authorization Guard
  const isAuthorized = profile?.role === 'super_admin' || profile?.role === 'billing_admin';

  // State
  const [subscriptions, setSubscriptions] = useState(initialSubscriptions || []);
  const [payments, setPayments] = useState(initialPayments || []);
  const [invoices, setInvoices] = useState(initialInvoices || []);
  const [profilesList, setProfilesList] = useState(initialProfiles || []);
  const [resortsList, setResortsList] = useState([]);
  const [loading, setLoading] = useState(!initialSubscriptions);
  const [refreshing, setRefreshing] = useState(false);
  const [fetchError, setFetchError] = useState(null);

  // Filters State
  const [envFilter, setEnvFilter] = useState('live'); // 'live' (default) | 'test' | 'all'
  const [searchTerm, setSearchTerm] = useState('');
  const [planFilter, setPlanFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [attentionFilter, setAttentionFilter] = useState('all'); // 'all' | 'attention_only' | 'clean_only'

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);

  // Detail Modal
  const [selectedSub, setSelectedSub] = useState(null);
  const [copiedId, setCopiedId] = useState(null);

  // Copy to clipboard helper
  const handleCopy = (text, id) => {
    navigator.clipboard?.writeText(text);
    setCopiedId(id);
    toast.success('Copied to clipboard');
    setTimeout(() => setCopiedId(null), 2000);
  };

  // Fetch full inventory
  const fetchInventory = async () => {
    setRefreshing(true);
    setFetchError(null);
    try {
      // Primary: Use dedicated least-privilege RPC
      const { data: rpcData, error: rpcError } = await supabase.rpc('get_saas_subscription_monitoring_inventory');

      if (!rpcError && rpcData) {
        setSubscriptions(rpcData.subscriptions || []);
        setPayments(rpcData.payments || []);
        setInvoices(rpcData.invoices || []);
        setProfilesList(rpcData.profiles || []);
        setResortsList(rpcData.resorts || []);
      } else {
        // Fallback for Super Admin if RPC is not yet applied
        const [subsRes, payRes, invRes, profRes, resRes] = await Promise.all([
          supabase.from('saas_subscriptions').select('*').order('created_at', { ascending: false }),
          supabase.from('saas_payments').select('*').order('created_at', { ascending: false }),
          supabase.from('saas_invoices').select('*').order('created_at', { ascending: false }),
          supabase.from('profiles').select('id, full_name, email, role, plan_type, trial_started_at, trial_ends_at, subscription_status, is_legacy_account'),
          supabase.from('resorts').select('id, tenant_id, name')
        ]);

        const errs = [];
        if (subsRes.error) errs.push(`Subscriptions: ${subsRes.error.message}`);
        if (payRes.error) errs.push(`Payments: ${payRes.error.message}`);
        if (invRes.error) errs.push(`Invoices: ${invRes.error.message}`);
        if (profRes.error) errs.push(`Profiles: ${profRes.error.message}`);
        if (resRes.error) errs.push(`Properties: ${resRes.error.message}`);

        if (errs.length > 0) {
          setFetchError(errs.join(' | '));
        }

        setSubscriptions(subsRes.data || []);
        setPayments(payRes.data || []);
        setInvoices(invRes.data || []);
        setProfilesList(profRes.data || []);
        setResortsList(resRes.data || []);
      }
    } catch (e) {
      console.error('Failed to load subscription inventory:', e);
      setFetchError(e.message || 'An unexpected error occurred while loading subscription data.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    if (!initialSubscriptions) {
      fetchInventory();
    }
  }, []);

  // Reset page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [envFilter, searchTerm, planFilter, statusFilter, attentionFilter]);

  // Profiles Map by ID
  const profilesMap = useMemo(() => {
    const map = new Map();
    (profilesList || []).forEach(p => map.set(p.id, p));
    return map;
  }, [profilesList]);

  // Resorts Map by Tenant ID
  const resortsMap = useMemo(() => {
    const map = new Map();
    (resortsList || []).forEach(r => {
      if (!map.has(r.tenant_id)) map.set(r.tenant_id, []);
      map.get(r.tenant_id).push(r.name);
    });
    return map;
  }, [resortsList]);

  // Combine saas_subscriptions with historical invoices (Phase G)
  const combinedInventory = useMemo(() => {
    return synthesizeHistoricalInventory({ subscriptions, invoices });
  }, [subscriptions, invoices]);

  // Group subscriptions by tenant_id for duplicate detection
  const subsByTenant = useMemo(() => {
    const map = new Map();
    combinedInventory.forEach(s => {
      if (!s.tenant_id) return;
      if (!map.has(s.tenant_id)) map.set(s.tenant_id, []);
      map.get(s.tenant_id).push(s);
    });
    return map;
  }, [combinedInventory]);

  // Enriched inventory items
  const enrichedInventory = useMemo(() => {
    const now = new Date();
    return combinedInventory.map(sub => {
      const tenant = profilesMap.get(sub.tenant_id);
      const tenantResorts = resortsMap.get(sub.tenant_id) || [];
      const tenantSubs = subsByTenant.get(sub.tenant_id) || [];

      // Entitlement Evaluation using Stage 12B.1 Engine
      const entitlement = evaluateSubscriptionEntitlement({
        subscription: sub,
        evaluationTime: now
      });

      // Discrepancy Detection
      const discrepancies = detectSubscriptionDiscrepancies({
        subscription: sub,
        tenantProfile: tenant,
        allTenantSubscriptions: tenantSubs,
        evaluationTime: now
      });

      const hasActionableDiscrepancy = discrepancies.some(d => d.severity === 'warning' || d.severity === 'error');

      // Matching payments
      const subPayments = (payments || []).filter(
        p => p.razorpay_subscription_id === sub.razorpay_subscription_id ||
             (p.tenant_id === sub.tenant_id && sub.tenant_id)
      );

      // Matching invoices
      const subInvoices = (invoices || []).filter(
        inv => inv.subscription_id === sub.razorpay_subscription_id ||
               (inv.tenant_id === sub.tenant_id && sub.tenant_id)
      );

      return {
        ...sub,
        tenant,
        tenantResorts,
        entitlement,
        discrepancies,
        hasActionableDiscrepancy,
        subPayments,
        subInvoices,
        displayPlan: sub.staypilot_plan_type || tenant?.plan_type || 'solo'
      };
    });
  }, [combinedInventory, profilesMap, resortsMap, subsByTenant, payments, invoices]);

  // Environment-Filtered Inventory
  const environmentFilteredInventory = useMemo(() => {
    return enrichedInventory.filter(sub => {
      const subEnv = String(sub.environment || 'test').toLowerCase();
      if (envFilter === 'live') return subEnv === 'live';
      if (envFilter === 'test') return subEnv === 'test';
      return true; // 'all'
    });
  }, [enrichedInventory, envFilter]);

  // Summary Metrics (Strictly respecting selected Environment)
  const summaryMetrics = useMemo(() => {
    const list = environmentFilteredInventory;
    const activeCount = list.filter(s => s.status === 'active').length;
    const cancelledCount = list.filter(s => s.status === 'cancelled').length;
    const cancelledPaidThroughCount = list.filter(s => s.status === 'cancelled' && s.entitlement.isPaidThrough).length;
    const pendingHaltedCount = list.filter(s =>
      ['created', 'pending', 'authenticated', 'checkout_pending', 'halted', 'paused'].includes(s.status)
    ).length;
    const attentionCount = list.filter(s => s.hasActionableDiscrepancy).length;

    return {
      activeCount,
      cancelledCount,
      cancelledPaidThroughCount,
      pendingHaltedCount,
      attentionCount,
      totalCount: list.length
    };
  }, [environmentFilteredInventory]);

  // Applied Search & Filtered List
  const filteredList = useMemo(() => {
    return environmentFilteredInventory.filter(item => {
      // 1. Search filter
      if (searchTerm.trim()) {
        const query = searchTerm.toLowerCase().trim();
        const tenantName = (item.tenant?.full_name || '').toLowerCase();
        const tenantEmail = (item.tenant?.email || '').toLowerCase();
        const subId = (item.razorpay_subscription_id || '').toLowerCase();
        const resortsStr = (item.tenantResorts || []).join(' ').toLowerCase();

        const matchesSearch =
          tenantName.includes(query) ||
          tenantEmail.includes(query) ||
          subId.includes(query) ||
          resortsStr.includes(query);

        if (!matchesSearch) return false;
      }

      // 2. Plan filter
      if (planFilter !== 'all') {
        const pKey = String(item.displayPlan || '').toLowerCase();
        if (planFilter === 'solo' && !['solo', 'custom_1786983013013'].includes(pKey)) return false;
        if (planFilter === 'growth' && !['growth', 'pro'].includes(pKey)) return false;
        if (planFilter === 'premium' && !['premium', 'stay_master', 'stay master'].includes(pKey)) return false;
      }

      // 3. Status filter
      if (statusFilter !== 'all') {
        if (item.status !== statusFilter) return false;
      }

      // 4. Attention filter
      if (attentionFilter === 'attention_only') {
        if (!item.hasActionableDiscrepancy) return false;
      } else if (attentionFilter === 'clean_only') {
        if (item.hasActionableDiscrepancy) return false;
      }

      return true;
    });
  }, [environmentFilteredInventory, searchTerm, planFilter, statusFilter, attentionFilter]);

  // Pagination calculations
  const totalPages = Math.max(1, Math.ceil(filteredList.length / itemsPerPage));
  const paginatedList = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filteredList.slice(start, start + itemsPerPage);
  }, [filteredList, currentPage, itemsPerPage]);

  // Reset all filters action
  const handleResetFilters = () => {
    setEnvFilter('live');
    setSearchTerm('');
    setPlanFilter('all');
    setStatusFilter('all');
    setAttentionFilter('all');
    setCurrentPage(1);
  };

  // Authorization Check Guard Render
  if (!isAuthorized) {
    return (
      <div style={{ padding: '3rem 2rem', textAlign: 'center', background: '#fff', borderRadius: '16px', border: '1px solid #fee2e2' }}>
        <ShieldAlert size={48} style={{ color: '#ef4444', marginBottom: '1rem' }} />
        <h3 style={{ color: '#991b1b', marginBottom: '0.5rem', fontWeight: 800 }}>Access Denied</h3>
        <p style={{ color: '#64748b', maxWidth: '480px', margin: '0 auto', fontSize: '0.95rem' }}>
          Subscription Monitoring is strictly restricted to authorized Super Admin and Billing Admin accounts.
        </p>
      </div>
    );
  }

  return (
    <div className="subscription-monitoring-container" style={{ padding: '0.5rem 0', fontFamily: "'Outfit', sans-serif" }}>
      {/* ------------------------------------------------------------- */}
      {/* Header & Controls Bar */}
      {/* ------------------------------------------------------------- */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.75rem' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <h3 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 800, color: '#0F2C59' }}>
              Subscription Monitoring
            </h3>
            <span style={{ fontSize: '0.75rem', fontWeight: 700, padding: '0.2rem 0.6rem', borderRadius: '12px', background: '#dbeafe', color: '#1e40af' }}>
              READ-ONLY AUDIT
            </span>
          </div>
          <p style={{ margin: '0.25rem 0 0', color: '#64748B', fontSize: '0.9rem' }}>
            Independent inventory, Test vs. Live environment segregation, paid-through tracking, and discrepancy detection.
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
          {/* Environment Selector Pills */}
          <div style={{ display: 'inline-flex', background: '#F1F5F9', padding: '0.25rem', borderRadius: '10px', border: '1px solid #CBD5E1' }}>
            <button
              type="button"
              id="env-filter-live-btn"
              onClick={() => setEnvFilter('live')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.35rem',
                padding: '0.45rem 0.85rem',
                borderRadius: '8px',
                border: 'none',
                fontWeight: 700,
                fontSize: '0.825rem',
                cursor: 'pointer',
                background: envFilter === 'live' ? '#059669' : 'transparent',
                color: envFilter === 'live' ? '#FFFFFF' : '#475569',
                transition: 'all 0.15s ease'
              }}
            >
              <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: envFilter === 'live' ? '#A7F3D0' : '#059669', display: 'inline-block' }} />
              Live Mode (Default)
            </button>

            <button
              type="button"
              id="env-filter-test-btn"
              onClick={() => setEnvFilter('test')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.35rem',
                padding: '0.45rem 0.85rem',
                borderRadius: '8px',
                border: 'none',
                fontWeight: 700,
                fontSize: '0.825rem',
                cursor: 'pointer',
                background: envFilter === 'test' ? '#7C3AED' : 'transparent',
                color: envFilter === 'test' ? '#FFFFFF' : '#475569',
                transition: 'all 0.15s ease'
              }}
            >
              <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: envFilter === 'test' ? '#DDD6FE' : '#7C3AED', display: 'inline-block' }} />
              Test Mode
            </button>

            <button
              type="button"
              id="env-filter-all-btn"
              onClick={() => setEnvFilter('all')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.35rem',
                padding: '0.45rem 0.85rem',
                borderRadius: '8px',
                border: 'none',
                fontWeight: 700,
                fontSize: '0.825rem',
                cursor: 'pointer',
                background: envFilter === 'all' ? '#0F2C59' : 'transparent',
                color: envFilter === 'all' ? '#FFFFFF' : '#475569',
                transition: 'all 0.15s ease'
              }}
            >
              All Envs
            </button>
          </div>

          {/* Refresh Button */}
          <button
            type="button"
            id="refresh-inventory-btn"
            onClick={fetchInventory}
            disabled={refreshing}
            className="btn btn-outline"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
              padding: '0.45rem 0.9rem',
              fontSize: '0.85rem',
              fontWeight: 700,
              borderRadius: '8px',
              border: '1px solid #CBD5E1',
              background: '#FFFFFF',
              color: '#0F2C59'
            }}
          >
            <RefreshCw size={15} className={refreshing ? 'animate-spin' : ''} />
            {refreshing ? 'Syncing...' : 'Refresh'}
          </button>
        </div>
      </div>

      {fetchError && (
        <div style={{ padding: '0.85rem 1.25rem', marginBottom: '1.25rem', background: '#FFF1F2', border: '1px solid #FECDD3', borderRadius: '10px', color: '#BE123C', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
          <AlertCircle size={18} style={{ flexShrink: 0 }} />
          <span><strong>Notice:</strong> {fetchError}</span>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* Summary Metrics Cards (Phase B) */}
      {/* ------------------------------------------------------------- */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
        gap: '1rem',
        marginBottom: '1.75rem'
      }}>
        {/* Active Subscriptions */}
        <div style={{ background: '#FFFFFF', padding: '1.25rem', borderRadius: '12px', border: '1px solid #E2E8F0', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
            <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Active Subscriptions
            </span>
            <span style={{ width: '32px', height: '32px', borderRadius: '8px', background: '#ECFDF5', color: '#059669', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <CheckCircle size={18} />
            </span>
          </div>
          <div style={{ fontSize: '2rem', fontWeight: 900, color: '#059669', lineHeight: 1.1 }}>
            {summaryMetrics.activeCount}
          </div>
          <div style={{ marginTop: '0.4rem', fontSize: '0.775rem', color: '#64748B' }}>
            In {envFilter === 'all' ? 'all environments' : `${envFilter.toUpperCase()} Mode`}
          </div>
        </div>

        {/* Cancelled Subscriptions */}
        <div style={{ background: '#FFFFFF', padding: '1.25rem', borderRadius: '12px', border: '1px solid #E2E8F0', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
            <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Cancelled
            </span>
            <span style={{ width: '32px', height: '32px', borderRadius: '8px', background: '#FEF3C7', color: '#D97706', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Clock size={18} />
            </span>
          </div>
          <div style={{ fontSize: '2rem', fontWeight: 900, color: '#D97706', lineHeight: 1.1 }}>
            {summaryMetrics.cancelledCount}
          </div>
          <div style={{ marginTop: '0.4rem', fontSize: '0.775rem', color: '#64748B' }}>
            {summaryMetrics.cancelledPaidThroughCount} retaining paid-through access
          </div>
        </div>

        {/* Pending / Halted */}
        <div style={{ background: '#FFFFFF', padding: '1.25rem', borderRadius: '12px', border: '1px solid #E2E8F0', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
            <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Pending / Halted
            </span>
            <span style={{ width: '32px', height: '32px', borderRadius: '8px', background: '#F1F5F9', color: '#475569', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <AlertCircle size={18} />
            </span>
          </div>
          <div style={{ fontSize: '2rem', fontWeight: 900, color: '#475569', lineHeight: 1.1 }}>
            {summaryMetrics.pendingHaltedCount}
          </div>
          <div style={{ marginTop: '0.4rem', fontSize: '0.775rem', color: '#64748B' }}>
            Checkouts created or suspended
          </div>
        </div>

        {/* Attention Required / Discrepancies */}
        <div style={{ background: '#FFFFFF', padding: '1.25rem', borderRadius: '12px', border: summaryMetrics.attentionCount > 0 ? '1px solid #FCA5A5' : '1px solid #E2E8F0', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
            <span style={{ fontSize: '0.85rem', fontWeight: 700, color: summaryMetrics.attentionCount > 0 ? '#DC2626' : '#64748B', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Attention Required
            </span>
            <span style={{ width: '32px', height: '32px', borderRadius: '8px', background: summaryMetrics.attentionCount > 0 ? '#FEE2E2' : '#F1F5F9', color: summaryMetrics.attentionCount > 0 ? '#DC2626' : '#94A3B8', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <AlertTriangle size={18} />
            </span>
          </div>
          <div style={{ fontSize: '2rem', fontWeight: 900, color: summaryMetrics.attentionCount > 0 ? '#DC2626' : '#0F2C59', lineHeight: 1.1 }}>
            {summaryMetrics.attentionCount}
          </div>
          <div style={{ marginTop: '0.4rem', fontSize: '0.775rem', color: summaryMetrics.attentionCount > 0 ? '#DC2626' : '#64748B' }}>
            {summaryMetrics.attentionCount > 0 ? 'Overdue, duplicate, or unmapped' : 'All records reconciled'}
          </div>
        </div>
      </div>

      {/* ------------------------------------------------------------- */}
      {/* Search & Filters Bar (Phase D) */}
      {/* ------------------------------------------------------------- */}
      <div style={{
        background: '#FFFFFF',
        padding: '1.25rem',
        borderRadius: '12px',
        border: '1px solid #E2E8F0',
        marginBottom: '1.25rem',
        display: 'flex',
        flexWrap: 'wrap',
        gap: '0.85rem',
        alignItems: 'center',
        justifyContent: 'space-between'
      }}>
        {/* Search input */}
        <div style={{ position: 'relative', flex: '1 1 280px' }}>
          <Search size={16} style={{ position: 'absolute', left: '0.85rem', top: '50%', transform: 'translateY(-50%)', color: '#94A3B8' }} />
          <input
            type="text"
            id="sub-search-input"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search tenant name, email, property, or subscription ID..."
            style={{
              width: '100%',
              padding: '0.55rem 0.85rem 0.55rem 2.4rem',
              borderRadius: '8px',
              border: '1px solid #CBD5E1',
              fontSize: '0.875rem',
              outline: 'none',
              fontFamily: "'Outfit', sans-serif"
            }}
          />
        </div>

        {/* Dropdown Filters */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.6rem', alignItems: 'center' }}>
          {/* Plan Filter */}
          <select
            id="sub-plan-filter"
            value={planFilter}
            onChange={(e) => setPlanFilter(e.target.value)}
            style={{
              padding: '0.5rem 0.75rem',
              borderRadius: '8px',
              border: '1px solid #CBD5E1',
              fontSize: '0.85rem',
              background: '#FFFFFF',
              color: '#0F2C59',
              fontWeight: 600,
              fontFamily: "'Outfit', sans-serif"
            }}
          >
            <option value="all">All Plans</option>
            <option value="solo">Solo Plan</option>
            <option value="growth">Growth Plan</option>
            <option value="premium">Stay Master</option>
          </select>

          {/* Status Filter */}
          <select
            id="sub-status-filter"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            style={{
              padding: '0.5rem 0.75rem',
              borderRadius: '8px',
              border: '1px solid #CBD5E1',
              fontSize: '0.85rem',
              background: '#FFFFFF',
              color: '#0F2C59',
              fontWeight: 600,
              fontFamily: "'Outfit', sans-serif"
            }}
          >
            <option value="all">All Statuses</option>
            <option value="active">Active</option>
            <option value="cancelled">Cancelled</option>
            <option value="created">Created</option>
            <option value="pending">Pending</option>
            <option value="halted">Halted</option>
            <option value="historical_invoice">Historical Invoice</option>
          </select>

          {/* Attention Filter */}
          <select
            id="sub-attention-filter"
            value={attentionFilter}
            onChange={(e) => setAttentionFilter(e.target.value)}
            style={{
              padding: '0.5rem 0.75rem',
              borderRadius: '8px',
              border: '1px solid #CBD5E1',
              fontSize: '0.85rem',
              background: '#FFFFFF',
              color: attentionFilter === 'attention_only' ? '#DC2626' : '#0F2C59',
              fontWeight: 600,
              fontFamily: "'Outfit', sans-serif"
            }}
          >
            <option value="all">All Records</option>
            <option value="attention_only">Attention Required Only</option>
            <option value="clean_only">Reconciled / Normal</option>
          </select>

          {/* Reset Filters */}
          {(searchTerm || planFilter !== 'all' || statusFilter !== 'all' || attentionFilter !== 'all' || envFilter !== 'live') && (
            <button
              type="button"
              id="sub-reset-filters-btn"
              onClick={handleResetFilters}
              style={{
                padding: '0.5rem 0.85rem',
                borderRadius: '8px',
                border: '1px solid #E2E8F0',
                background: '#F8FAFC',
                color: '#64748B',
                fontSize: '0.825rem',
                fontWeight: 700,
                cursor: 'pointer'
              }}
            >
              Reset Filters
            </button>
          )}
        </div>
      </div>

      {/* ------------------------------------------------------------- */}
      {/* Subscriptions Table (Phase B & C) */}
      {/* ------------------------------------------------------------- */}
      <div style={{
        background: '#FFFFFF',
        borderRadius: '12px',
        border: '1px solid #E2E8F0',
        boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
        overflow: 'hidden'
      }}>
        {loading ? (
          <div style={{ padding: '3.5rem 2rem', textAlign: 'center', color: '#64748B' }}>
            <RefreshCw size={28} className="animate-spin" style={{ margin: '0 auto 0.75rem', color: '#059669' }} />
            <div style={{ fontWeight: 700, fontSize: '0.95rem' }}>Loading subscription inventory...</div>
          </div>
        ) : filteredList.length === 0 ? (
          <div style={{ padding: '3.5rem 2rem', textAlign: 'center', color: '#64748B' }}>
            <Filter size={32} style={{ margin: '0 auto 0.75rem', color: '#CBD5E1' }} />
            <div style={{ fontWeight: 800, fontSize: '1.05rem', color: '#0F2C59', marginBottom: '0.25rem' }}>
              No subscriptions match your criteria
            </div>
            <p style={{ margin: '0 auto 1rem', maxWidth: '380px', fontSize: '0.85rem' }}>
              Try adjusting your search terms, changing the status filter, or switching between Live and Test Mode.
            </p>
            <button
              type="button"
              onClick={handleResetFilters}
              className="btn btn-outline"
              style={{ fontSize: '0.85rem', fontWeight: 700, padding: '0.45rem 1rem' }}
            >
              Reset to Live Default
            </button>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.875rem' }}>
              <thead>
                <tr style={{ background: '#F8FAFC', borderBottom: '1px solid #E2E8F0', color: '#64748B', fontWeight: 700, fontSize: '0.775rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  <th style={{ padding: '0.85rem 1rem' }}>Tenant</th>
                  <th style={{ padding: '0.85rem 1rem' }}>Account</th>
                  <th style={{ padding: '0.85rem 1rem' }}>Plan</th>
                  <th style={{ padding: '0.85rem 1rem' }}>Env</th>
                  <th style={{ padding: '0.85rem 1rem' }}>Subscription ID</th>
                  <th style={{ padding: '0.85rem 1rem' }}>Recorded Status</th>
                  <th style={{ padding: '0.85rem 1rem' }}>Paid Through</th>
                  <th style={{ padding: '0.85rem 1rem' }}>Next Billing</th>
                  <th style={{ padding: '0.85rem 1rem' }}>Reconciliation</th>
                  <th style={{ padding: '0.85rem 1rem', textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {paginatedList.map((item, idx) => {
                  const isLive = String(item.environment || '').toLowerCase() === 'live';
                  const isCancelled = item.status === 'cancelled';
                  const isPaidThrough = item.entitlement.isPaidThrough;
                  const isExpired = item.entitlement.isExpired;

                  return (
                    <tr
                      key={item.id || idx}
                      style={{
                        borderBottom: '1px solid #F1F5F9',
                        transition: 'background 0.15s',
                        background: item.hasActionableDiscrepancy ? '#FEF2F2' : 'transparent'
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.background = item.hasActionableDiscrepancy ? '#FEE2E2' : '#F8FAFC'}
                      onMouseLeave={(e) => e.currentTarget.style.background = item.hasActionableDiscrepancy ? '#FEF2F2' : 'transparent'}
                    >
                      {/* Tenant */}
                      <td style={{ padding: '0.85rem 1rem', verticalAlign: 'middle' }}>
                        <div style={{ fontWeight: 700, color: '#0F2C59' }}>
                          {item.tenant?.full_name || 'Unmapped Tenant'}
                        </div>
                        {item.tenantResorts.length > 0 && (
                          <div style={{ fontSize: '0.775rem', color: '#64748B', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                            <Hotel size={12} />
                            {item.tenantResorts[0]}
                            {item.tenantResorts.length > 1 && ` (+${item.tenantResorts.length - 1})`}
                          </div>
                        )}
                      </td>

                      {/* Account */}
                      <td style={{ padding: '0.85rem 1rem', verticalAlign: 'middle' }}>
                        <div style={{ fontSize: '0.825rem', color: '#334155' }}>
                          {item.tenant?.email || '—'}
                        </div>
                        <div style={{ fontSize: '0.725rem', color: '#94A3B8', fontFamily: 'monospace' }}>
                          {item.tenant_id ? `${item.tenant_id.slice(0, 8)}...` : 'No Tenant ID'}
                        </div>
                      </td>

                      {/* Plan */}
                      <td style={{ padding: '0.85rem 1rem', verticalAlign: 'middle' }}>
                        <span style={{
                          display: 'inline-block',
                          padding: '0.25rem 0.6rem',
                          borderRadius: '6px',
                          fontSize: '0.75rem',
                          fontWeight: 700,
                          background: item.displayPlan === 'premium' || item.displayPlan === 'stay_master' ? '#FEF3C7' :
                                      item.displayPlan === 'growth' || item.displayPlan === 'pro' ? '#DBEAFE' : '#F1F5F9',
                          color: item.displayPlan === 'premium' || item.displayPlan === 'stay_master' ? '#92400E' :
                                 item.displayPlan === 'growth' || item.displayPlan === 'pro' ? '#1E40AF' : '#475569'
                        }}>
                          {item.displayPlan === 'custom_1786983013013' || item.displayPlan === 'solo' ? 'Solo' :
                           item.displayPlan === 'growth' || item.displayPlan === 'pro' ? 'Growth' :
                           item.displayPlan === 'premium' || item.displayPlan === 'stay_master' ? 'Stay Master' :
                           item.displayPlan.toUpperCase()}
                        </span>
                      </td>

                      {/* Environment */}
                      <td style={{ padding: '0.85rem 1rem', verticalAlign: 'middle' }}>
                        <span style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.25rem',
                          padding: '0.2rem 0.55rem',
                          borderRadius: '6px',
                          fontSize: '0.725rem',
                          fontWeight: 800,
                          background: isLive ? '#ECFDF5' : '#F5F3FF',
                          color: isLive ? '#065F46' : '#6D28D9',
                          border: isLive ? '1px solid #A7F3D0' : '1px solid #DDD6FE'
                        }}>
                          <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: isLive ? '#059669' : '#7C3AED' }} />
                          {isLive ? 'LIVE' : 'TEST'}
                        </span>
                      </td>

                      {/* Subscription ID */}
                      <td style={{ padding: '0.85rem 1rem', verticalAlign: 'middle' }}>
                        {item.razorpay_subscription_id ? (
                          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', background: '#F8FAFC', padding: '0.2rem 0.45rem', borderRadius: '4px', border: '1px solid #E2E8F0' }}>
                            <span style={{ fontFamily: 'monospace', fontSize: '0.775rem', color: '#1E293B' }}>
                              {item.razorpay_subscription_id}
                            </span>
                            <button
                              type="button"
                              onClick={() => handleCopy(item.razorpay_subscription_id, item.id)}
                              title="Copy Subscription ID"
                              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: '#94A3B8' }}
                            >
                              {copiedId === item.id ? <Check size={12} style={{ color: '#059669' }} /> : <Copy size={12} />}
                            </button>
                          </div>
                        ) : (
                          <span style={{ color: '#94A3B8', fontSize: '0.8rem' }}>None</span>
                        )}
                      </td>

                      {/* Recorded Status */}
                      <td style={{ padding: '0.85rem 1rem', verticalAlign: 'middle' }}>
                        <span style={{
                          display: 'inline-block',
                          padding: '0.25rem 0.6rem',
                          borderRadius: '6px',
                          fontSize: '0.75rem',
                          fontWeight: 800,
                          background: item.status === 'active' ? '#ECFDF5' :
                                      item.status === 'cancelled' ? '#FEF3C7' :
                                      item.status === 'historical_invoice' ? '#F1F5F9' : '#F1F5F9',
                          color: item.status === 'active' ? '#047857' :
                                 item.status === 'cancelled' ? '#B45309' :
                                 item.status === 'historical_invoice' ? '#64748B' : '#475569'
                        }}>
                          {item.status === 'historical_invoice' ? 'Historical Invoice' : item.status.toUpperCase()}
                        </span>
                      </td>

                      {/* Paid Through */}
                      <td style={{ padding: '0.85rem 1rem', verticalAlign: 'middle' }}>
                        {item.entitlement.periodEnd ? (
                          <div>
                            <div style={{ fontWeight: 700, color: isPaidThrough ? '#0F2C59' : '#DC2626' }}>
                              {formatDateStr(item.entitlement.periodEnd)}
                            </div>
                            <div style={{ fontSize: '0.725rem', color: isPaidThrough ? '#059669' : '#DC2626' }}>
                              {isPaidThrough ? `${item.entitlement.daysRemaining} days left` : 'Expired'}
                            </div>
                          </div>
                        ) : (
                          <span style={{ color: '#94A3B8', fontSize: '0.8rem' }}>Unverified</span>
                        )}
                      </td>

                      {/* Next Billing */}
                      <td style={{ padding: '0.85rem 1rem', verticalAlign: 'middle' }}>
                        {isCancelled || item.cancel_at_period_end ? (
                          <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#D97706', background: '#FEF3C7', padding: '0.2rem 0.5rem', borderRadius: '4px' }}>
                            Renewal Stopped
                          </span>
                        ) : item.status === 'active' && item.entitlement.periodEnd ? (
                          <span style={{ fontSize: '0.825rem', color: '#0F2C59' }}>
                            {formatDateStr(item.entitlement.periodEnd)}
                          </span>
                        ) : (
                          <span style={{ color: '#94A3B8', fontSize: '0.8rem' }}>—</span>
                        )}
                      </td>

                      {/* Reconciliation / Discrepancy */}
                      <td style={{ padding: '0.85rem 1rem', verticalAlign: 'middle' }}>
                        {item.hasActionableDiscrepancy ? (
                          <span style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.3rem',
                            padding: '0.25rem 0.55rem',
                            borderRadius: '6px',
                            background: '#FEE2E2',
                            color: '#DC2626',
                            fontWeight: 700,
                            fontSize: '0.725rem'
                          }}>
                            <AlertTriangle size={13} />
                            Attention ({item.discrepancies.filter(d => d.severity === 'warning').length})
                          </span>
                        ) : isCancelled && isPaidThrough ? (
                          <span style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.3rem',
                            padding: '0.25rem 0.55rem',
                            borderRadius: '6px',
                            background: '#FEF3C7',
                            color: '#D97706',
                            fontWeight: 700,
                            fontSize: '0.725rem'
                          }}>
                            <Info size={13} />
                            Paid Grace
                          </span>
                        ) : (
                          <span style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.3rem',
                            padding: '0.25rem 0.55rem',
                            borderRadius: '6px',
                            background: '#F0FDF4',
                            color: '#16A34A',
                            fontWeight: 700,
                            fontSize: '0.725rem'
                          }}>
                            <CheckCircle size={13} />
                            Normal
                          </span>
                        )}
                      </td>

                      {/* Actions */}
                      <td style={{ padding: '0.85rem 1rem', verticalAlign: 'middle', textAlign: 'right' }}>
                        <button
                          type="button"
                          id={`view-details-${item.id}`}
                          onClick={() => setSelectedSub(item)}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.35rem',
                            padding: '0.4rem 0.75rem',
                            borderRadius: '6px',
                            border: '1px solid #CBD5E1',
                            background: '#FFFFFF',
                            color: '#0F2C59',
                            fontWeight: 700,
                            fontSize: '0.775rem',
                            cursor: 'pointer'
                          }}
                        >
                          <Eye size={14} />
                          Details
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* ------------------------------------------------------------- */}
        {/* Pagination Bar */}
        {/* ------------------------------------------------------------- */}
        {!loading && filteredList.length > 0 && (
          <div style={{
            padding: '0.85rem 1.25rem',
            borderTop: '1px solid #E2E8F0',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '0.75rem',
            background: '#F8FAFC'
          }}>
            <div style={{ fontSize: '0.825rem', color: '#64748B' }}>
              Showing <strong>{((currentPage - 1) * itemsPerPage) + 1}</strong> to <strong>{Math.min(currentPage * itemsPerPage, filteredList.length)}</strong> of <strong>{filteredList.length}</strong> records ({summaryMetrics.totalCount} total in {envFilter.toUpperCase()})
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <button
                type="button"
                id="pagination-prev-btn"
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  padding: '0.35rem 0.65rem',
                  borderRadius: '6px',
                  border: '1px solid #CBD5E1',
                  background: currentPage === 1 ? '#F1F5F9' : '#FFFFFF',
                  color: currentPage === 1 ? '#94A3B8' : '#0F2C59',
                  cursor: currentPage === 1 ? 'not-allowed' : 'pointer',
                  fontWeight: 600,
                  fontSize: '0.8rem'
                }}
              >
                <ChevronLeft size={16} /> Prev
              </button>

              <span style={{ fontSize: '0.825rem', fontWeight: 700, color: '#0F2C59', padding: '0 0.5rem' }}>
                Page {currentPage} of {totalPages}
              </span>

              <button
                type="button"
                id="pagination-next-btn"
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  padding: '0.35rem 0.65rem',
                  borderRadius: '6px',
                  border: '1px solid #CBD5E1',
                  background: currentPage === totalPages ? '#F1F5F9' : '#FFFFFF',
                  color: currentPage === totalPages ? '#94A3B8' : '#0F2C59',
                  cursor: currentPage === totalPages ? 'not-allowed' : 'pointer',
                  fontWeight: 600,
                  fontSize: '0.8rem'
                }}
              >
                Next <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ------------------------------------------------------------- */}
      {/* Read-Only Subscription Detail Modal (Phase E) */}
      {/* ------------------------------------------------------------- */}
      {selectedSub && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(15, 23, 42, 0.6)',
          backdropFilter: 'blur(4px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          padding: '1.5rem'
        }}>
          <div style={{
            background: '#FFFFFF',
            borderRadius: '16px',
            maxWidth: '750px',
            width: '100%',
            maxHeight: '90vh',
            display: 'flex',
            flexDirection: 'column',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
            border: '1px solid #CBD5E1',
            overflow: 'hidden'
          }}>
            {/* Modal Header */}
            <div style={{
              padding: '1.25rem 1.5rem',
              borderBottom: '1px solid #E2E8F0',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              background: '#F8FAFC'
            }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <h4 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800, color: '#0F2C59' }}>
                    Subscription Inspection
                  </h4>
                  <span style={{
                    fontSize: '0.725rem',
                    fontWeight: 800,
                    padding: '0.2rem 0.55rem',
                    borderRadius: '6px',
                    background: selectedSub.environment === 'live' ? '#ECFDF5' : '#F5F3FF',
                    color: selectedSub.environment === 'live' ? '#065F46' : '#6D28D9',
                    border: selectedSub.environment === 'live' ? '1px solid #A7F3D0' : '1px solid #DDD6FE'
                  }}>
                    {String(selectedSub.environment || 'test').toUpperCase()}
                  </span>
                </div>
                <div style={{ fontSize: '0.8rem', color: '#64748B', marginTop: '0.2rem', fontFamily: 'monospace' }}>
                  ID: {selectedSub.razorpay_subscription_id || selectedSub.id}
                </div>
              </div>

              <button
                type="button"
                id="close-sub-detail-btn"
                onClick={() => setSelectedSub(null)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#64748B',
                  cursor: 'pointer',
                  padding: '0.4rem',
                  borderRadius: '6px'
                }}
              >
                <X size={20} />
              </button>
            </div>

            {/* Modal Body */}
            <div style={{ padding: '1.5rem', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              {/* Discrepancy Alert Banner if present */}
              {selectedSub.discrepancies.length > 0 && (
                <div style={{
                  background: selectedSub.hasActionableDiscrepancy ? '#FEF2F2' : '#F0FDF4',
                  border: selectedSub.hasActionableDiscrepancy ? '1px solid #FECDD3' : '1px solid #BBF7D0',
                  borderRadius: '10px',
                  padding: '1rem 1.25rem'
                }}>
                  <div style={{ fontWeight: 800, fontSize: '0.875rem', color: selectedSub.hasActionableDiscrepancy ? '#DC2626' : '#16A34A', display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.4rem' }}>
                    {selectedSub.hasActionableDiscrepancy ? <AlertTriangle size={16} /> : <CheckCircle size={16} />}
                    {selectedSub.hasActionableDiscrepancy ? 'Reconciliation Warnings Detected' : 'Reconciliation Status: Normal'}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                    {selectedSub.discrepancies.map((d, dIdx) => (
                      <div key={dIdx} style={{ fontSize: '0.8rem', color: d.severity === 'warning' ? '#991B1B' : '#475569' }}>
                        <strong>[{d.code}] {d.title}:</strong> {d.description}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 1. Tenant Information */}
              <div style={{ border: '1px solid #E2E8F0', borderRadius: '10px', padding: '1.1rem', background: '#FFFFFF' }}>
                <div style={{ fontSize: '0.8rem', fontWeight: 800, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <User size={14} /> Tenant Identity
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.75rem', fontSize: '0.85rem' }}>
                  <div>
                    <span style={{ color: '#64748B', display: 'block', fontSize: '0.775rem' }}>Tenant / Business Name</span>
                    <strong style={{ color: '#0F2C59' }}>{selectedSub.tenant?.full_name || 'Unmapped'}</strong>
                  </div>
                  <div>
                    <span style={{ color: '#64748B', display: 'block', fontSize: '0.775rem' }}>Account Email</span>
                    <strong style={{ color: '#0F2C59' }}>{selectedSub.tenant?.email || '—'}</strong>
                  </div>
                  <div>
                    <span style={{ color: '#64748B', display: 'block', fontSize: '0.775rem' }}>Tenant UUID</span>
                    <span style={{ fontFamily: 'monospace', fontSize: '0.775rem', color: '#475569' }}>{selectedSub.tenant_id || '—'}</span>
                  </div>
                  <div>
                    <span style={{ color: '#64748B', display: 'block', fontSize: '0.775rem' }}>Configured Plan / Role</span>
                    <strong style={{ color: '#0F2C59' }}>{selectedSub.tenant?.plan_type || 'free'} ({selectedSub.tenant?.role || 'tenant_admin'})</strong>
                  </div>
                </div>
              </div>

              {/* 2. Subscription Information */}
              <div style={{ border: '1px solid #E2E8F0', borderRadius: '10px', padding: '1.1rem', background: '#FFFFFF' }}>
                <div style={{ fontSize: '0.8rem', fontWeight: 800, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <CreditCard size={14} /> Subscription Details
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.75rem', fontSize: '0.85rem' }}>
                  <div>
                    <span style={{ color: '#64748B', display: 'block', fontSize: '0.775rem' }}>Razorpay Subscription ID</span>
                    <span style={{ fontFamily: 'monospace', fontWeight: 700, color: '#0F2C59' }}>{selectedSub.razorpay_subscription_id || '—'}</span>
                  </div>
                  <div>
                    <span style={{ color: '#64748B', display: 'block', fontSize: '0.775rem' }}>Razorpay Customer ID</span>
                    <span style={{ fontFamily: 'monospace', color: '#475569' }}>{selectedSub.razorpay_customer_id || '—'}</span>
                  </div>
                  <div>
                    <span style={{ color: '#64748B', display: 'block', fontSize: '0.775rem' }}>Recorded Status</span>
                    <strong style={{ color: selectedSub.status === 'active' ? '#059669' : selectedSub.status === 'cancelled' ? '#D97706' : '#475569' }}>
                      {selectedSub.status.toUpperCase()}
                    </strong>
                  </div>
                  <div>
                    <span style={{ color: '#64748B', display: 'block', fontSize: '0.775rem' }}>Created Timestamp</span>
                    <span style={{ color: '#0F2C59' }}>{formatDateStr(selectedSub.created_at, true)}</span>
                  </div>
                  <div>
                    <span style={{ color: '#64748B', display: 'block', fontSize: '0.775rem' }}>Verified Period End</span>
                    <strong style={{ color: selectedSub.entitlement.isPaidThrough ? '#059669' : '#DC2626' }}>
                      {selectedSub.entitlement.periodEnd ? formatDateStr(selectedSub.entitlement.periodEnd, true) : 'Not Verified'}
                    </strong>
                  </div>
                  <div>
                    <span style={{ color: '#64748B', display: 'block', fontSize: '0.775rem' }}>Scheduled Cancellation</span>
                    <span style={{ color: '#0F2C59' }}>{selectedSub.cancel_at_period_end ? 'Yes (End of Period)' : 'No'}</span>
                  </div>
                </div>
              </div>

              {/* 3. Payment & Invoicing Information */}
              <div style={{ border: '1px solid #E2E8F0', borderRadius: '10px', padding: '1.1rem', background: '#FFFFFF' }}>
                <div style={{ fontSize: '0.8rem', fontWeight: 800, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <DollarSign size={14} /> Payment & Invoices
                </div>
                <div style={{ fontSize: '0.85rem' }}>
                  <div style={{ marginBottom: '0.6rem', color: '#475569' }}>
                    Linked Payments: <strong>{selectedSub.subPayments.length}</strong> | Linked Invoices: <strong>{selectedSub.subInvoices.length}</strong>
                  </div>

                  {selectedSub.subPayments.length > 0 ? (
                    <div style={{ background: '#F8FAFC', borderRadius: '8px', padding: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                      {selectedSub.subPayments.map((p, pIdx) => (
                        <div key={pIdx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.8rem' }}>
                          <div>
                            <span style={{ fontFamily: 'monospace', color: '#0F2C59', fontWeight: 700 }}>{p.razorpay_payment_id}</span>
                            <span style={{ color: '#64748B', marginLeft: '0.5rem' }}>({formatDateStr(p.created_at)})</span>
                          </div>
                          <div>
                            <strong style={{ color: '#059669' }}>{formatINR(p.amount)}</strong>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div style={{ fontSize: '0.8rem', color: '#94A3B8' }}>
                      No payment records found for this subscription.
                    </div>
                  )}
                </div>
              </div>

              {/* 4. Audit & Verification Policy Note */}
              <div style={{ background: '#F8FAFC', borderRadius: '10px', padding: '0.85rem 1rem', border: '1px solid #E2E8F0', fontSize: '0.775rem', color: '#64748B' }}>
                <strong>Audit Boundary Notice:</strong> This inspection panel operates in strict read-only mode. No subscription mutation, cancellation, resumption, or payment collection actions are permitted from this screen.
              </div>
            </div>

            {/* Modal Footer */}
            <div style={{
              padding: '1rem 1.5rem',
              borderTop: '1px solid #E2E8F0',
              display: 'flex',
              justifyContent: 'flex-end',
              background: '#F8FAFC'
            }}>
              <button
                type="button"
                onClick={() => setSelectedSub(null)}
                style={{
                  padding: '0.5rem 1.25rem',
                  borderRadius: '8px',
                  border: '1px solid #CBD5E1',
                  background: '#FFFFFF',
                  color: '#0F2C59',
                  fontWeight: 700,
                  fontSize: '0.85rem',
                  cursor: 'pointer'
                }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
