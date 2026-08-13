import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { createClient } from '@supabase/supabase-js';
import { useSettingsStore } from '../lib/store';
import { Users, Hotel, TrendingUp, DollarSign, Search, ShieldAlert, CheckCircle, XCircle, UserPlus, Trash2, Mail, Lock, Shield, MessageCircle } from 'lucide-react';
import WebsitePricingTab from '../components/WebsitePricingTab';

// Secondary client for creating users without affecting the admin session
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const secondarySupabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: { persistSession: false }
});

export default function SuperAdmin() {
  const { profile, setWebsitePricing } = useSettingsStore();
  const [stats, setStats] = useState({ users: 0, properties: 0, bookings: 0, revenue: 0 });
  const [tenants, setTenants] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);

  const DEFAULT_PLANS = {
    free: {
      name: 'Free Starter',
      description: 'Perfect for small properties',
      enabled: true,
      price: 0,
      maxResorts: 1,
      maxRooms: 5,
      maxStaff: 1,
      color: '#a0aec0',
      reports: { summary: false, bookings: true, guests: false, finance: true, exportExcel: false, exportPdf: false },
      features: [
        { name: '1 Resort Limit', enabled: true },
        { name: 'Up to 5 Rooms', enabled: true },
        { name: 'Basic Reports', enabled: true },
        { name: 'Community Support', enabled: true }
      ]
    },
    pro: {
      name: 'Pro Manager',
      description: 'For growing businesses',
      enabled: true,
      price: 1999,
      offerPrice: 1499,
      offerActive: false,
      offerStartDate: '',
      offerEndDate: '',
      maxResorts: 5,
      maxRooms: 999999,
      maxStaff: 5,
      color: 'var(--primary)',
      popular: true,
      reports: { summary: true, bookings: true, guests: true, finance: false, exportExcel: true, exportPdf: true },
      features: [
        { name: 'Up to 5 Resorts', enabled: true },
        { name: 'Unlimited Rooms', enabled: true },
        { name: 'Advanced Analytics', enabled: true },
        { name: 'Email Automation', enabled: true },
        { name: 'Priority Support', enabled: true }
      ]
    },
    premium: {
      name: 'Luxury Premium',
      description: 'Total control for hotel chains',
      enabled: true,
      price: 5999,
      offerPrice: 4999,
      offerActive: false,
      offerStartDate: '',
      offerEndDate: '',
      maxResorts: 999999,
      maxRooms: 999999,
      maxStaff: 999999,
      color: '#d4af37',
      reports: { summary: true, bookings: true, guests: true, finance: true, exportExcel: true, exportPdf: true },
      features: [
        { name: 'Unlimited Resorts', enabled: true },
        { name: 'Custom Branding', enabled: true },
        { name: 'Super Admin Panel', enabled: true },
        { name: 'WhatsApp Notifications', enabled: true },
        { name: '24/7 Dedicated Support', enabled: true }
      ]
    }
  };

  const [pricingConfig, setPricingConfig] = useState(DEFAULT_PLANS);
  const [pricingTab, setPricingTab] = useState('plans'); // 'plans', 'website', 'history'
  const DEFAULT_WEBSITE_PRICING = {
    draft: {},
    published: {},
    history: [],
    currentVersion: 0
  };
  const [websitePricingConfig, setWebsitePricingConfig] = useState(DEFAULT_WEBSITE_PRICING);
  const [editingWebsitePlanKey, setEditingWebsitePlanKey] = useState(null);
  const [showWebsitePublishModal, setShowWebsitePublishModal] = useState(false);
  
  const [globalCommEnabled, setGlobalCommEnabled] = useState(true);
  const [globalTemplatesEnabled, setGlobalTemplatesEnabled] = useState(true);
  const [globalOnboardingWizardEnabled, setGlobalOnboardingWizardEnabled] = useState(true);
  
  const DEFAULT_LANDING_CONTENT = {
    headline: "Know Your Bookings. Know Your Numbers.",
    subheadline: "Bookings. Income. Expenses. Simplified. The ultimate property management software for modern hosts.",
    features: [
      { title: "Smart Dashboard", description: "All your metrics at a glance." },
      { title: "Integrated Calendar", description: "Manage all bookings effortlessly." },
      { title: "Financial Reports", description: "Track income and expenses easily." }
    ]
  };
  const [landingContent, setLandingContent] = useState(DEFAULT_LANDING_CONTENT);

  // Modal states
  const [showUserForm, setShowUserForm] = useState(false);
  const [userFormData, setUserFormData] = useState({ 
    email: '', 
    password: '', 
    fullName: '', 
    role: 'tenant_admin',
    tenantId: '' 
  });
  const [formError, setFormError] = useState(null);

  // Management modal states
  const [editingUser, setEditingUser] = useState(null);
  const [isUpdating, setIsUpdating] = useState(false);
  const [adminActiveTab, setAdminActiveTab] = useState('overview');

  useEffect(() => {
    if (profile?.role !== 'super_admin') return;
    fetchGlobalData();
  }, [profile]);

  const fetchGlobalData = async () => {
    setLoading(true);
    try {
      const [{ data: u }, { data: r }, { data: b }, { data: inc }] = await Promise.all([
        supabase.from('profiles').select('*').order('created_at', { ascending: false }),
        supabase.from('resorts').select('id, tenant_id, name'),
        supabase.from('bookings').select('id, tenant_id'),
        supabase.from('incomes').select('amount')
      ]);

      const tenantsWithData = (u || []).map(user => {
        const owner = user.role === 'staff' 
          ? (u || []).find(p => p.id === user.tenant_id) 
          : null;
          
        const tenantResorts = user.role === 'tenant_admin' ? (r || []).filter(res => res.tenant_id === user.id) : [];
        const resortNamesList = tenantResorts.map(res => res.name || 'Unnamed Resort');

        return {
          ...user,
          ownerName: owner ? owner.full_name : 'Self',
          propertyCount: resortNamesList.length,
          propertyNames: resortNamesList,
          bookingCount: user.role === 'tenant_admin' ? (b || []).filter(book => book.tenant_id === user.id).length : 0
        };
      });

      const superAdminProfile = (u || []).find(user => user.id === profile.id);
      if (superAdminProfile?.global_settings?.pricing) {
        const loaded = superAdminProfile.global_settings.pricing;
        
        // Merge loaded pricing with DEFAULT_PLANS defaults for missing fields
        const mergedPricing = {};
        for (const [key, plan] of Object.entries(loaded)) {
           mergedPricing[key] = {
             ...(DEFAULT_PLANS[key] || {}),
             ...plan,
             features: plan.features || (DEFAULT_PLANS[key]?.features || []),
             reports: plan.reports || (DEFAULT_PLANS[key]?.reports || { summary: true, bookings: true, guests: true, finance: true, exportExcel: true, exportPdf: true })
           };
        }
        
        // Ensure all DEFAULT_PLANS exist if they were completely missing
        for (const [key, plan] of Object.entries(DEFAULT_PLANS)) {
          if (!mergedPricing[key]) {
            mergedPricing[key] = { ...plan };
          }
        }
        
        setPricingConfig(mergedPricing);
      }

      if (superAdminProfile?.global_settings?.website_pricing) {
        setWebsitePricingConfig(superAdminProfile.global_settings.website_pricing);
      }

      if (superAdminProfile?.global_settings) {
        setGlobalCommEnabled(superAdminProfile.global_settings.comm_features_enabled !== false);
        setGlobalTemplatesEnabled(superAdminProfile.global_settings.templates_enabled !== false);
        setGlobalOnboardingWizardEnabled(superAdminProfile.global_settings.onboarding_wizard_enabled !== false);
        if (superAdminProfile.global_settings.landing_page) {
          setLandingContent({
            ...DEFAULT_LANDING_CONTENT,
            ...superAdminProfile.global_settings.landing_page,
            features: superAdminProfile.global_settings.landing_page.features || DEFAULT_LANDING_CONTENT.features
          });
        }
      }

      setTenants(tenantsWithData.filter(t => t.id !== profile.id));
      
      setStats({
        users: u?.filter(u => u.role === 'tenant_admin').length || 0,
        staffCount: u?.filter(u => u.role === 'staff').length || 0,
        properties: r?.length || 0,
        bookings: b?.length || 0,
        revenue: (inc || []).reduce((sum, item) => sum + Number(item.amount), 0)
      });
    } catch (err) {
      console.error("SuperAdmin Fetch Error:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateUser = async (e) => {
    e.preventDefault();
    if (!editingUser) return;
    setIsUpdating(true);
    
    try {
      let payload = { 
        email: editingUser.email,
        plan_type: editingUser.plan_type,
        subscription_status: editingUser.subscription_status,
        feature_investment_enabled: editingUser.feature_investment_enabled,
        feature_comm_enabled: editingUser.feature_comm_enabled !== false
      };
      
      let { error } = await supabase
        .from('profiles')
        .update(payload)
        .eq('id', editingUser.id);
        
      if (error && (error.message?.includes('column') || error.code === '42703')) {
        console.warn("feature_comm_enabled column missing. Saving other columns.");
        delete payload.feature_comm_enabled;
        const retry = await supabase
          .from('profiles')
          .update(payload)
          .eq('id', editingUser.id);
        if (retry.error) throw retry.error;
        alert("Account updated successfully! (Note: feature_comm_enabled column is missing in DB. Please run the add_comm_feature.sql script in Supabase SQL editor.)");
      } else if (error) {
        throw error;
      } else {
        alert("Account updated successfully!");
      }
      
      setTenants(prev => prev.map(t => t.id === editingUser.id ? editingUser : t));
      setEditingUser(null);
    } catch (err) {
      alert("Update failed: " + err.message);
    } finally {
      setIsUpdating(false);
    }
  };

  const handleCreateUser = async (e) => {
    e.preventDefault();
    setLoading(true);
    setFormError(null);

    try {
      if (userFormData.role === 'staff' && !userFormData.tenantId) {
        throw new Error("Staff must be assigned to an existing Tenant.");
      }

      const { data, error: authError } = await secondarySupabase.auth.signUp({
        email: userFormData.email,
        password: userFormData.password,
        options: {
          data: {
            full_name: userFormData.fullName,
            role: userFormData.role,
            tenant_id: userFormData.role === 'staff' ? userFormData.tenantId : undefined
          }
        }
      });

      if (authError) throw authError;

      if (data?.user?.id) {
        await supabase
          .from('profiles')
          .update({ email: userFormData.email })
          .eq('id', data.user.id);
      }

      alert(`${userFormData.role === 'tenant_admin' ? 'Tenant' : 'Staff'} account created!`);
      setUserFormData({ email: '', password: '', fullName: '', role: 'tenant_admin', tenantId: '' });
      setShowUserForm(false);
      fetchGlobalData();
    } catch (err) {
      setFormError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const deleteAccount = async (userId, name) => {
    if (!confirmingDelete) {
      setConfirmingDelete(true);
      return;
    }
    
    setIsUpdating(true);
    try {
      const { error } = await supabase.from('profiles').delete().eq('id', userId);
      if (error) throw error;
      setTenants(tenants.filter(t => t.id !== userId));
      setEditingUser(null);
      setConfirmingDelete(false);
      alert("Account removed successfully.");
      fetchGlobalData();
    } catch (err) { 
      alert("Delete failed: " + err.message); 
    } finally {
      setIsUpdating(false);
    }
  };

  const handleSavePricing = async () => {
    try {
      setIsUpdating(true);
      const settings = profile.global_settings || {};
      settings.pricing = pricingConfig;
      
      const { error } = await supabase.from('profiles').update({ global_settings: settings }).eq('id', profile.id);
      if (error) throw error;
      alert("Global pricing configuration updated successfully!");
    } catch (err) {
      alert("Failed to save pricing: " + err.message);
    } finally {
      setIsUpdating(false);
    }
  };

  const handleSaveWebsiteDraft = async (newDraftData) => {
    try {
      setIsUpdating(true);
      const settings = profile.global_settings || {};
      const updatedWebsitePricing = {
        ...websitePricingConfig,
        draft: newDraftData
      };
      settings.website_pricing = updatedWebsitePricing;
      
      const { error } = await supabase.from('profiles').update({ global_settings: settings }).eq('id', profile.id);
      if (error) throw error;
      setWebsitePricingConfig(updatedWebsitePricing);
      setWebsitePricing(updatedWebsitePricing);
    } catch (err) {
      alert("Failed to save draft: " + err.message);
    } finally {
      setIsUpdating(false);
    }
  };

  const handlePublishWebsitePricing = async () => {
    try {
      setIsUpdating(true);
      const settings = profile.global_settings || {};
      const newVersionNum = (websitePricingConfig.currentVersion || 0) + 1;
      
      const historyEntry = {
        version: newVersionNum,
        publishedAt: new Date().toISOString(),
        publishedBy: profile.full_name || 'Super Admin',
        plans: websitePricingConfig.draft
      };

      const updatedWebsitePricing = {
        ...websitePricingConfig,
        published: websitePricingConfig.draft,
        history: [historyEntry, ...(websitePricingConfig.history || [])],
        currentVersion: newVersionNum
      };
      
      settings.website_pricing = updatedWebsitePricing;
      
      const { error } = await supabase.from('profiles').update({ global_settings: settings }).eq('id', profile.id);
      if (error) throw error;
      
      setWebsitePricingConfig(updatedWebsitePricing);
      setWebsitePricing(updatedWebsitePricing);
      setShowWebsitePublishModal(false);
      alert("Website Pricing Published Successfully!");
    } catch (err) {
      alert("Failed to publish: " + err.message);
    } finally {
      setIsUpdating(false);
    }
  };

  const handleRollbackWebsitePricing = async (versionIndex) => {
    if (!confirm("Roll back to this version? This will become the new active draft and immediately publish to the website.")) return;
    try {
      setIsUpdating(true);
      const settings = profile.global_settings || {};
      const historyVersion = websitePricingConfig.history[versionIndex];
      const newVersionNum = (websitePricingConfig.currentVersion || 0) + 1;
      
      const historyEntry = {
        version: newVersionNum,
        publishedAt: new Date().toISOString(),
        publishedBy: profile.full_name || 'Super Admin',
        plans: historyVersion.plans,
        note: `Rolled back from v${historyVersion.version}`
      };

      const updatedWebsitePricing = {
        ...websitePricingConfig,
        draft: historyVersion.plans,
        published: historyVersion.plans,
        history: [historyEntry, ...(websitePricingConfig.history || [])],
        currentVersion: newVersionNum
      };
      
      settings.website_pricing = updatedWebsitePricing;
      
      const { error } = await supabase.from('profiles').update({ global_settings: settings }).eq('id', profile.id);
      if (error) throw error;
      
      setWebsitePricingConfig(updatedWebsitePricing);
      setWebsitePricing(updatedWebsitePricing);
      alert(`Successfully rolled back to version ${historyVersion.version}!`);
    } catch (err) {
      alert("Failed to roll back: " + err.message);
    } finally {
      setIsUpdating(false);
    }
  };

  const handleSaveGlobalFeatures = async () => {
    try {
      setIsUpdating(true);
      const settings = profile.global_settings || {};
      settings.comm_features_enabled = globalCommEnabled;
      settings.templates_enabled = globalTemplatesEnabled;
      settings.onboarding_wizard_enabled = globalOnboardingWizardEnabled;
      
      const { error } = await supabase.from('profiles').update({ global_settings: settings }).eq('id', profile.id);
      if (error) throw error;
      alert("Global feature settings updated successfully!");
    } catch (err) {
      alert("Failed to save global features: " + err.message);
    } finally {
      setIsUpdating(false);
    }
  };

  const handleSaveLandingPage = async () => {
    try {
      setIsUpdating(true);
      const settings = profile.global_settings || {};
      settings.landing_page = landingContent;
      
      const { error } = await supabase.from('profiles').update({ global_settings: settings }).eq('id', profile.id);
      if (error) throw error;
      alert("Landing page content updated successfully!");
    } catch (err) {
      alert("Failed to save landing page: " + err.message);
    } finally {
      setIsUpdating(false);
    }
  };

  if (profile?.role !== 'super_admin') {
    return (
      <div style={{ textAlign: 'center', padding: '100px 20px' }}>
        <ShieldAlert size={64} color="var(--danger)" style={{ marginBottom: '1.5rem' }} />
        <h1>Access Denied</h1>
        <p style={{ color: 'var(--text-muted)' }}>You do not have administrative privileges to access this global dashboard.</p>
      </div>
    );
  }

  if (loading && tenants.length === 0) return <div>Loading Global Control Panel...</div>;

  return (
    <div>
      {/* Page Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem' }}>
        <div>
          <h1 style={{ marginBottom: '0.25rem', fontSize: '1.75rem', fontWeight: 800, color: '#0F2C59', fontFamily: "'Outfit', sans-serif" }}>Global Control Panel</h1>
          <p style={{ color: 'var(--text-muted)', margin: 0, fontSize: '0.9rem' }}>Oversee all platform Tenants, Staff, Plans, and Website configuration.</p>
        </div>
      </div>

      {/* Elegant Sub-navigation Tabs */}
      <div style={{ 
        display: 'flex', 
        gap: '0.5rem', 
        borderBottom: '1px solid #cbd5e1', 
        marginBottom: '2rem', 
        paddingBottom: '0.1rem',
        overflowX: 'auto',
        flexWrap: 'nowrap'
      }}>
        {[
          { id: 'overview', label: 'Dashboard Overview', icon: <TrendingUp size={16} /> },
          { id: 'accounts', label: `Accounts & Tenants (${tenants.length})`, icon: <Users size={16} /> },
          { id: 'plans', label: 'Subscription Plans', icon: <DollarSign size={16} /> },
          { id: 'settings', label: 'Platform Settings', icon: <Shield size={16} /> }
        ].map(tab => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setAdminActiveTab(tab.id)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              padding: '0.75rem 1.5rem',
              background: 'transparent',
              border: 'none',
              borderBottom: adminActiveTab === tab.id ? '3px solid #059669' : '3px solid transparent',
              color: adminActiveTab === tab.id ? '#0F2C59' : '#64748B',
              fontWeight: 700,
              fontSize: '0.95rem',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              transition: 'all 0.2s',
              fontFamily: "'Outfit', sans-serif"
            }}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* TAB 1: OVERVIEW & STATS */}
      {adminActiveTab === 'overview' && (
        <div style={{ animation: 'fadeIn 0.2s ease-out' }}>
          {/* Global Stats Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1.5rem', marginBottom: '2.5rem' }}>
            <div className="card" style={{ background: 'white', borderRadius: '16px', border: '1px solid rgba(15, 44, 89, 0.08)', boxShadow: '0 10px 30px rgba(15, 44, 89, 0.02)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--text-muted)', fontWeight: 600 }}>Tenants / Staff</p>
                  <h2 style={{ margin: '0.25rem 0', color: '#0F2C59', fontWeight: 800 }}>{stats.users} / {stats.staffCount}</h2>
                </div>
                <div style={{ padding: '0.75rem', borderRadius: '12px', background: 'rgba(59, 130, 246, 0.1)', color: 'var(--primary)' }}>
                  <Users size={24} />
                </div>
              </div>
            </div>
            <div className="card" style={{ background: 'white', borderRadius: '16px', border: '1px solid rgba(15, 44, 89, 0.08)', boxShadow: '0 10px 30px rgba(15, 44, 89, 0.02)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--text-muted)', fontWeight: 600 }}>Global Properties</p>
                  <h2 style={{ margin: '0.25rem 0', color: '#0F2C59', fontWeight: 800 }}>{stats.properties}</h2>
                </div>
                <div style={{ padding: '0.75rem', borderRadius: '12px', background: 'rgba(16, 185, 129, 0.1)', color: '#059669' }}>
                  <Hotel size={24} />
                </div>
              </div>
            </div>
            <div className="card" style={{ background: 'white', borderRadius: '16px', border: '1px solid rgba(15, 44, 89, 0.08)', boxShadow: '0 10px 30px rgba(15, 44, 89, 0.02)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--text-muted)', fontWeight: 600 }}>Global Bookings</p>
                  <h2 style={{ margin: '0.25rem 0', color: '#0F2C59', fontWeight: 800 }}>{stats.bookings}</h2>
                </div>
                <div style={{ padding: '0.75rem', borderRadius: '12px', background: 'rgba(14, 165, 233, 0.1)', color: '#0ea5e9' }}>
                  <TrendingUp size={24} />
                </div>
              </div>
            </div>
            <div className="card" style={{ background: 'white', borderRadius: '16px', border: '1px solid rgba(15, 44, 89, 0.08)', boxShadow: '0 10px 30px rgba(15, 44, 89, 0.02)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--text-muted)', fontWeight: 600 }}>Platform Revenue</p>
                  <h2 style={{ margin: '0.25rem 0', color: '#059669', fontWeight: 800 }}>₹{stats.revenue.toLocaleString()}</h2>
                </div>
                <div style={{ padding: '0.75rem', borderRadius: '12px', background: 'rgba(245, 158, 11, 0.1)', color: '#f59e0b' }}>
                  <DollarSign size={24} />
                </div>
              </div>
            </div>
          </div>

          {/* Quick Start Card */}
          <div className="card" style={{ padding: '2.5rem', background: 'white', borderRadius: '16px', border: '1px solid rgba(15, 44, 89, 0.08)', textAlign: 'left' }}>
            <h3 style={{ color: '#0F2C59', fontWeight: 800, marginBottom: '1rem', fontFamily: "'Outfit', sans-serif" }}>Platform Overview & Activities</h3>
            <p style={{ color: '#475569', lineHeight: 1.6, marginBottom: '1.5rem', fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
              Welcome back to your Stay Pilot administrative hub. From this dashboard, you can control the subscription plans, adjust pricing drafts for the landing page, enable/disable system-wide integrations, and oversee all active accounts.
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1.5rem', marginTop: '2rem' }}>
              <div style={{ background: '#f8fafc', padding: '1.25rem', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                <h4 style={{ color: '#0F2C59', fontWeight: 700, fontSize: '0.95rem', marginBottom: '0.5rem' }}>Accounts Hub</h4>
                <p style={{ color: '#64748B', fontSize: '0.85rem', margin: 0 }}>Review registrations, edit permissions, change packages, or create accounts.</p>
                <button type="button" className="btn btn-link" style={{ padding: 0, marginTop: '0.75rem', fontSize: '0.85rem', color: '#059669', fontWeight: 700 }} onClick={() => setAdminActiveTab('accounts')}>Manage Accounts &rarr;</button>
              </div>
              <div style={{ background: '#f8fafc', padding: '1.25rem', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                <h4 style={{ color: '#0F2C59', fontWeight: 700, fontSize: '0.95rem', marginBottom: '0.5rem' }}>Plans & Pricing</h4>
                <p style={{ color: '#64748B', fontSize: '0.85rem', margin: 0 }}>Configure platform subscription tiers, features list, and edit public marketing rates.</p>
                <button type="button" className="btn btn-link" style={{ padding: 0, marginTop: '0.75rem', fontSize: '0.85rem', color: '#059669', fontWeight: 700 }} onClick={() => setAdminActiveTab('plans')}>Update Plans &rarr;</button>
              </div>
              <div style={{ background: '#f8fafc', padding: '1.25rem', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                <h4 style={{ color: '#0F2C59', fontWeight: 700, fontSize: '0.95rem', marginBottom: '0.5rem' }}>Global Settings</h4>
                <p style={{ color: '#64748B', fontSize: '0.85rem', margin: 0 }}>Toggle platform feature locks and edit landing page headlines and features.</p>
                <button type="button" className="btn btn-link" style={{ padding: 0, marginTop: '0.75rem', fontSize: '0.85rem', color: '#059669', fontWeight: 700 }} onClick={() => setAdminActiveTab('settings')}>Modify Settings &rarr;</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: ACCOUNTS & TENANTS */}
      {adminActiveTab === 'accounts' && (
        <div style={{ animation: 'fadeIn 0.2s ease-out' }}>
          
          {/* Header Controls for accounts list */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
            <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
              <h3 style={{ margin: 0, color: '#0F2C59', fontWeight: 800, fontFamily: "'Outfit', sans-serif" }}>Platform User Accounts</h3>
            </div>
            <button className="btn btn-primary" onClick={() => setShowUserForm(!showUserForm)}>
              <UserPlus size={20} /> {showUserForm ? 'Hide Creator' : 'Create New Account'}
            </button>
          </div>

          {/* Account Creator Form Card */}
          {showUserForm && (
            <div className="card" style={{ marginBottom: '2rem', animation: 'slideDown 0.3s ease-out', border: '1px solid rgba(5, 150, 105, 0.15)', background: 'rgba(255, 255, 255, 0.95)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                <h2 style={{ fontSize: '1.25rem', color: '#0F2C59', fontWeight: 800, fontFamily: "'Outfit', sans-serif" }}>Create New {userFormData.role === 'tenant_admin' ? 'Tenant' : 'Staff'} Account</h2>
              </div>
              
              {formError && <div style={{ color: 'var(--danger)', marginBottom: '1rem', background: 'rgba(239, 68, 68, 0.1)', padding: '0.75rem', borderRadius: '8px', fontWeight: 600 }}>{formError}</div>}

              <form onSubmit={handleCreateUser} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '1.5rem', textAlign: 'left' }}>
                <div className="form-group">
                  <label className="form-label">Full Name</label>
                  <input type="text" className="form-input" required value={userFormData.fullName} onChange={e => setUserFormData({...userFormData, fullName: e.target.value})} placeholder="e.g. Michael Smith" />
                </div>
                <div className="form-group">
                  <label className="form-label">Email Address</label>
                  <input type="email" className="form-input" required value={userFormData.email} onChange={e => setUserFormData({...userFormData, email: e.target.value})} placeholder="email@example.com" />
                </div>
                <div className="form-group">
                  <label className="form-label">Default Password</label>
                  <input type="password" minLength={6} className="form-input" required value={userFormData.password} onChange={e => setUserFormData({...userFormData, password: e.target.value})} placeholder="••••••••" />
                </div>
                <div className="form-group">
                  <label className="form-label">Account Role</label>
                  <select className="form-select" value={userFormData.role} onChange={e => setUserFormData({...userFormData, role: e.target.value, tenantId: ''})}>
                    <option value="tenant_admin">Tenant (Property Owner)</option>
                    <option value="staff">Staff (Operational)</option>
                  </select>
                </div>
                
                {userFormData.role === 'staff' && (
                  <div className="form-group" style={{ gridColumn: 'span 2' }}>
                    <label className="form-label">Assign to Tenant (Owner)</label>
                    <select className="form-select" required value={userFormData.tenantId} onChange={e => setUserFormData({...userFormData, tenantId: e.target.value})}>
                      <option value="">-- Select Tenant --</option>
                      {tenants.filter(t => t.role === 'tenant_admin').map(t => (
                        <option key={t.id} value={t.id}>{t.full_name} ({t.id.split('-')[0]})</option>
                      ))}
                    </select>
                  </div>
                )}

                <div style={{ gridColumn: 'span 2', marginTop: '0.5rem' }}>
                  <button type="submit" className="btn btn-primary" style={{ width: '100%', height: '48px', fontWeight: 700 }} disabled={loading}>
                    {loading ? 'Creating...' : `Create ${userFormData.role === 'tenant_admin' ? 'Tenant' : 'Staff'} Account`}
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* Accounts Search & List Table Card */}
          <div className="card" style={{ background: 'white', borderRadius: '16px', border: '1px solid rgba(15, 44, 89, 0.08)', boxShadow: '0 10px 30px rgba(15, 44, 89, 0.02)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
              <h4 style={{ margin: 0, color: '#0F2C59', fontWeight: 800, fontFamily: "'Outfit', sans-serif" }}>Registered Accounts List</h4>
              <div style={{ position: 'relative' }}>
                <Search size={18} style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                <input 
                  type="text" 
                  className="form-input" 
                  placeholder="Search tenants or staff..." 
                  style={{ paddingLeft: '2.5rem', width: '300px' }} 
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
            </div>
            
            <div className="table-container" style={{ overflowX: 'auto' }}>
              <table className="table" style={{ width: '100%', minWidth: '1000px', borderCollapse: 'collapse', textAlign: 'left' }}>
                <thead>
                  <tr>
                    <th>User Details</th>
                    <th>Role & Associated Properties</th>
                    <th>Sub Plan & Stats</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {tenants.filter(t => 
                    t.full_name?.toLowerCase().includes(searchTerm.toLowerCase()) || 
                    t.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                    t.id?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                    t.role?.toLowerCase().includes(searchTerm.toLowerCase())
                  ).map(tenant => (
                    <tr key={tenant.id}>
                      <td style={{ verticalAlign: 'top' }}>
                        <div style={{ fontWeight: 800, fontSize: '0.95rem', color: '#0F2C59' }}>{tenant.full_name}</div>
                        <div style={{ color: 'var(--primary)', fontSize: '0.8rem', fontWeight: 600, marginTop: '0.1rem' }}>{tenant.email}</div>
                        {tenant.created_at && (
                          <div style={{ fontSize: '0.75rem', color: '#64748B', marginTop: '0.2rem', fontWeight: 500 }}>
                            Joined: {new Date(tenant.created_at).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}
                          </div>
                        )}
                        <small style={{ color: '#94a3b8', fontSize: '0.7rem', display: 'block', marginTop: '0.25rem' }}>ID: {tenant.id}</small>
                      </td>
                      <td style={{ verticalAlign: 'top' }}>
                        <span style={{ 
                          display: 'inline-flex', 
                          alignItems: 'center', 
                          gap: '0.4rem', 
                          fontSize: '0.7rem', 
                          fontWeight: '800',
                          padding: '0.25rem 0.65rem',
                          borderRadius: '20px',
                          background: tenant.role === 'tenant_admin' ? 'rgba(5, 150, 105, 0.08)' : 'rgba(107, 114, 128, 0.08)',
                          color: tenant.role === 'tenant_admin' ? '#059669' : '#64748B',
                          border: tenant.role === 'tenant_admin' ? '1px solid rgba(5, 150, 105, 0.15)' : '1px solid rgba(107, 114, 128, 0.15)'
                        }}>
                          {tenant.role === 'tenant_admin' ? <Hotel size={12} /> : <Users size={12} />}
                          {tenant.role === 'tenant_admin' ? 'TENANT' : 'STAFF'}
                        </span>
                        
                        {tenant.role === 'staff' && (
                          <div style={{ marginTop: '0.4rem', fontSize: '0.75rem', color: '#475569' }}>
                            Under: <strong>{tenant.ownerName}</strong>
                          </div>
                        )}

                        {tenant.role === 'tenant_admin' && (
                          <div style={{ marginTop: '0.5rem', fontSize: '0.75rem', color: '#475569', lineHeight: 1.4 }}>
                            <strong style={{ color: '#0F2C59' }}>Resorts:</strong> {tenant.propertyNames && tenant.propertyNames.length > 0 ? (
                              <span style={{ color: '#059669', fontWeight: 600 }}>{tenant.propertyNames.join(', ')}</span>
                            ) : (
                              <span style={{ color: '#94a3b8', fontStyle: 'italic' }}>No properties created</span>
                            )}
                          </div>
                        )}
                      </td>
                      <td style={{ verticalAlign: 'top' }}>
                        {tenant.role === 'tenant_admin' ? (
                          <>
                            <span className={`badge ${tenant.plan_type === 'premium' ? 'badge-primary' : (tenant.plan_type === 'pro' ? 'badge-success' : 'badge-outline')}`}>
                              {pricingConfig[tenant.plan_type]?.name?.toUpperCase() || tenant.plan_type?.toUpperCase() || 'FREE'}
                            </span>
                            <div style={{ marginTop: '0.4rem', fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                              Props Count: <strong>{tenant.propertyCount}</strong> <br />
                              Bookings Count: <strong>{tenant.bookingCount}</strong>
                            </div>
                          </>
                        ) : (
                          <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem', fontStyle: 'italic' }}>Operational account</span>
                        )}
                      </td>
                      <td style={{ verticalAlign: 'top' }}>
                        <div style={{ 
                          display: 'inline-flex', 
                          alignItems: 'center', 
                          gap: '0.35rem', 
                          color: tenant.subscription_status === 'active' ? '#059669' : '#ef4444', 
                          fontSize: '0.8rem',
                          fontWeight: 700,
                          background: tenant.subscription_status === 'active' ? 'rgba(5, 150, 105, 0.08)' : 'rgba(239, 68, 68, 0.08)',
                          padding: '0.25rem 0.65rem',
                          borderRadius: '20px',
                          border: tenant.subscription_status === 'active' ? '1px solid rgba(5, 150, 105, 0.15)' : '1px solid rgba(239, 68, 68, 0.15)'
                        }}>
                          {tenant.subscription_status === 'active' ? <CheckCircle size={12} /> : <XCircle size={12} />}
                          {tenant.subscription_status === 'active' ? 'Active' : 'Suspended'}
                        </div>
                      </td>
                      <td style={{ verticalAlign: 'top' }}>
                        <button 
                          className="btn btn-outline" 
                          style={{ padding: '0.35rem 0.9rem', fontSize: '0.75rem', fontWeight: 700, borderRadius: '6px' }} 
                          onClick={() => {
                            console.log("Manage button clicked. Setting editingUser to:", tenant);
                            setEditingUser(tenant);
                          }}
                        >
                          Manage
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: PLANS & PRICING */}
      {adminActiveTab === 'plans' && (
        <div style={{ animation: 'fadeIn 0.2s ease-out' }}>
          
          <div className="card" style={{ marginBottom: '2.5rem', background: 'white', border: '1px solid rgba(15, 44, 89, 0.08)', borderRadius: '16px', boxShadow: '0 10px 30px rgba(15, 44, 89, 0.02)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', borderBottom: '1px solid #cbd5e1', paddingBottom: '1rem', flexWrap: 'wrap', gap: '1rem' }}>
              <div style={{ display: 'flex', gap: '2rem' }}>
                <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: pricingTab === 'plans' ? '#0F2C59' : '#64748b', margin: 0, cursor: 'pointer', borderBottom: pricingTab === 'plans' ? '3px solid var(--primary)' : '3px solid transparent', paddingBottom: '0.5rem', fontWeight: 800, fontFamily: "'Outfit', sans-serif" }} onClick={() => setPricingTab('plans')}>
                  <DollarSign size={18} /> Internal Pricing Tiers
                </h3>
                <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: pricingTab === 'website' ? '#0F2C59' : '#64748b', margin: 0, cursor: 'pointer', borderBottom: pricingTab === 'website' ? '3px solid var(--primary)' : '3px solid transparent', paddingBottom: '0.5rem', fontWeight: 800, fontFamily: "'Outfit', sans-serif" }} onClick={() => setPricingTab('website')}>
                  Website Pricing (Marketing)
                </h3>
              </div>
              {pricingTab === 'plans' && (
                <button className="btn btn-outline" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 700 }} onClick={() => {
                  const newId = `custom_${Date.now()}`;
                  setPricingConfig({
                    ...pricingConfig,
                    [newId]: {
                      name: 'New Custom Plan',
                      description: 'Description here',
                      enabled: true,
                      price: 999,
                      maxResorts: 1,
                      maxRooms: 10,
                      color: 'var(--primary)',
                      features: [{ name: 'New Feature', enabled: true }]
                    }
                  });
                }}>
                  + Create New Plan
                </button>
              )}
            </div>
            
            {pricingTab === 'plans' && (
              <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '2rem', textAlign: 'left' }}>
              
              {Object.entries(pricingConfig).map(([planKey, plan]) => {
                const titleColor = plan.color || 'var(--primary)';
                const titleName = plan.name || planKey.toUpperCase();
                
                return (
                  <div key={planKey} style={{ background: '#f8fafc', padding: '2rem 1.5rem', borderRadius: '12px', border: '1px solid #cbd5e1', opacity: plan.enabled ? 1 : 0.6, transition: 'all 0.3s' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', borderBottom: '2px solid #cbd5e1', paddingBottom: '0.75rem' }}>
                      <h4 style={{ color: titleColor, margin: 0, fontSize: '1.2rem', fontWeight: 800, fontFamily: "'Outfit', sans-serif" }}>{titleName}</h4>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <input 
                          type="checkbox" 
                          id={`enable-${planKey}`}
                          checked={plan.enabled}
                          onChange={e => setPricingConfig({...pricingConfig, [planKey]: {...plan, enabled: e.target.checked}})}
                        />
                        <label htmlFor={`enable-${planKey}`} style={{ fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer' }}>Enabled</label>
                      </div>
                    </div>

                    <div className="form-group" style={{ marginBottom: '1rem' }}>
                      <label className="form-label">Plan Name</label>
                      <input type="text" className="form-input" value={plan.name || ''} onChange={e => setPricingConfig({...pricingConfig, [planKey]: {...plan, name: e.target.value}})} disabled={!plan.enabled} />
                    </div>
                    
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.5rem', marginBottom: '1rem' }}>
                      <div className="form-group">
                        <label className="form-label" style={{ fontSize: '0.75rem' }}>Max Properties</label>
                        <input type="number" className="form-input" value={plan.maxResorts === 999999 ? '' : plan.maxResorts} onChange={e => setPricingConfig({...pricingConfig, [planKey]: {...plan, maxResorts: e.target.value ? Number(e.target.value) : 999999}})} placeholder="Unlimited" disabled={!plan.enabled} />
                      </div>
                      <div className="form-group">
                        <label className="form-label" style={{ fontSize: '0.75rem' }}>Max Rooms</label>
                        <input type="number" className="form-input" value={plan.maxRooms === 999999 ? '' : plan.maxRooms} onChange={e => setPricingConfig({...pricingConfig, [planKey]: {...plan, maxRooms: e.target.value ? Number(e.target.value) : 999999}})} placeholder="Unlimited" disabled={!plan.enabled} />
                      </div>
                      <div className="form-group">
                        <label className="form-label" style={{ fontSize: '0.75rem' }}>Max Staff</label>
                        <input type="number" className="form-input" value={plan.maxStaff === 999999 ? '' : plan.maxStaff} onChange={e => setPricingConfig({...pricingConfig, [planKey]: {...plan, maxStaff: e.target.value ? Number(e.target.value) : 999999}})} placeholder="Unlimited" disabled={!plan.enabled} />
                      </div>
                    </div>

                    {planKey !== 'free' && (
                      <>
                        <div className="form-group">
                          <label className="form-label">Base Rate (₹/month)</label>
                          <input type="number" className="form-input" value={plan.price} onChange={e => setPricingConfig({...pricingConfig, [planKey]: {...plan, price: Number(e.target.value)}})} disabled={!plan.enabled} />
                        </div>
                        <div className="form-group" style={{ marginTop: '1rem' }}>
                          <label className="form-label">Promotional Offer Rate (₹/month)</label>
                          <input type="number" className="form-input" value={plan.offerPrice} onChange={e => setPricingConfig({...pricingConfig, [planKey]: {...plan, offerPrice: Number(e.target.value)}})} disabled={!plan.enabled} />
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginTop: '1rem' }}>
                          <div className="form-group">
                            <label className="form-label">Offer Starts</label>
                            <input type="date" className="form-input" value={plan.offerStartDate || ''} onChange={e => setPricingConfig({...pricingConfig, [planKey]: {...plan, offerStartDate: e.target.value}})} disabled={!plan.offerActive || !plan.enabled} />
                          </div>
                          <div className="form-group">
                            <label className="form-label">Offer Ends</label>
                            <input type="date" className="form-input" value={plan.offerEndDate || ''} onChange={e => setPricingConfig({...pricingConfig, [planKey]: {...plan, offerEndDate: e.target.value}})} disabled={!plan.offerActive || !plan.enabled} />
                          </div>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '1.25rem', background: plan.offerActive ? 'rgba(5, 150, 105, 0.08)' : 'transparent', padding: '0.5rem', borderRadius: '6px', border: plan.offerActive ? '1px solid rgba(5, 150, 105, 0.15)' : 'none' }}>
                          <input type="checkbox" id={`offer-${planKey}`} checked={plan.offerActive} onChange={e => setPricingConfig({...pricingConfig, [planKey]: {...plan, offerActive: e.target.checked}})} style={{ width: '18px', height: '18px' }} disabled={!plan.enabled} />
                          <label htmlFor={`offer-${planKey}`} style={{ fontWeight: 'bold', color: plan.offerActive ? '#059669' : 'var(--text-muted)', cursor: 'pointer', fontSize: '0.85rem' }}>Activate Offer</label>
                        </div>
                      </>
                    )}
                    
                    <div style={{ marginTop: '1.5rem', paddingTop: '1.5rem', borderTop: '1px solid #cbd5e1' }}>
                      <h5 style={{ marginBottom: '1rem', color: '#0F2C59', fontSize: '0.85rem', textTransform: 'uppercase', fontWeight: 800 }}>Enabled Reports</h5>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                        {[
                          { id: 'summary', label: 'Performance Summary' },
                          { id: 'bookings', label: 'Booking Details' },
                          { id: 'guests', label: 'Guest Contacts' },
                          { id: 'finance', label: 'Income & Expenses' }
                        ].map(report => (
                          <div key={report.id} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <input 
                              type="checkbox" 
                              id={`report-${planKey}-${report.id}`}
                              checked={plan.reports?.[report.id] ?? true}
                              onChange={(e) => {
                                const newReports = { ...(plan.reports || {}), [report.id]: e.target.checked };
                                setPricingConfig({...pricingConfig, [planKey]: {...plan, reports: newReports}});
                              }}
                              disabled={!plan.enabled}
                            />
                            <label htmlFor={`report-${planKey}-${report.id}`} style={{ fontSize: '0.85rem', cursor: 'pointer', fontWeight: 600, color: '#475569' }}>{report.label}</label>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div style={{ marginTop: '1.5rem', paddingTop: '1.5rem', borderTop: '1px solid #cbd5e1' }}>
                      <h5 style={{ marginBottom: '1rem', color: '#0F2C59', fontSize: '0.85rem', textTransform: 'uppercase', fontWeight: 800 }}>Export Permissions</h5>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                        {[
                          { id: 'exportExcel', label: 'Allow Export to Excel' },
                          { id: 'exportPdf', label: 'Allow Export to PDF' }
                        ].map(exportOption => (
                          <div key={exportOption.id} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <input 
                              type="checkbox" 
                              id={`export-${planKey}-${exportOption.id}`}
                              checked={plan.reports?.[exportOption.id] ?? true}
                              onChange={(e) => {
                                const newReports = { ...(plan.reports || {}), [exportOption.id]: e.target.checked };
                                setPricingConfig({...pricingConfig, [planKey]: {...plan, reports: newReports}});
                              }}
                              disabled={!plan.enabled}
                            />
                            <label htmlFor={`export-${planKey}-${exportOption.id}`} style={{ fontSize: '0.85rem', cursor: 'pointer', fontWeight: 600, color: '#475569' }}>{exportOption.label}</label>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div style={{ marginTop: '1.5rem', paddingTop: '1.5rem', borderTop: '1px solid #cbd5e1' }}>
                      <h5 style={{ marginBottom: '1rem', color: '#0F2C59', fontSize: '0.85rem', textTransform: 'uppercase', fontWeight: 800 }}>Included Features</h5>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                        {plan.features.map((feat, idx) => (
                          <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <input 
                              type="checkbox" 
                              checked={feat.enabled} 
                              onChange={(e) => {
                                const newFeats = [...plan.features];
                                newFeats[idx] = { ...newFeats[idx], enabled: e.target.checked };
                                setPricingConfig({...pricingConfig, [planKey]: {...plan, features: newFeats}});
                              }}
                              disabled={!plan.enabled}
                            />
                            <input 
                              type="text" 
                              className="form-input" 
                              value={feat.name}
                              onChange={(e) => {
                                const newFeats = [...plan.features];
                                newFeats[idx] = { ...newFeats[idx], name: e.target.value };
                                setPricingConfig({...pricingConfig, [planKey]: {...plan, features: newFeats}});
                              }}
                              style={{ padding: '0.35rem 0.5rem', fontSize: '0.85rem' }}
                              disabled={!plan.enabled}
                            />
                            <button 
                              type="button"
                              className="btn-outline" 
                              style={{ padding: '0.35rem', color: 'var(--danger)', border: 'none', background: 'transparent' }}
                              onClick={() => {
                                const newFeats = plan.features.filter((_, i) => i !== idx);
                                setPricingConfig({...pricingConfig, [planKey]: {...plan, features: newFeats}});
                              }}
                              disabled={!plan.enabled}
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        ))}
                        <button 
                          type="button"
                          className="btn btn-outline" 
                          style={{ marginTop: '0.5rem', fontSize: '0.8rem', padding: '0.5rem', fontWeight: 700 }}
                          onClick={() => {
                            const newFeats = [...plan.features, { name: 'New Feature', enabled: true }];
                            setPricingConfig({...pricingConfig, [planKey]: {...plan, features: newFeats}});
                          }}
                          disabled={!plan.enabled}
                        >
                          + Add Feature
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div style={{ marginTop: '1.5rem', textAlign: 'right' }}>
              <button className="btn btn-primary" onClick={handleSavePricing} disabled={isUpdating} style={{ padding: '0.75rem 2rem', fontWeight: 700 }}>
                {isUpdating ? 'Saving Changes...' : 'Broadcast Prices Globally'}
              </button>
            </div>
              </>
            )}

            {pricingTab === 'website' && (
              <WebsitePricingTab 
                internalPricing={pricingConfig}
                websitePricingConfig={websitePricingConfig}
                onSaveDraft={handleSaveWebsiteDraft}
                onPublish={handlePublishWebsitePricing}
                onRollback={handleRollbackWebsitePricing}
              />
            )}
          </div>
        </div>
      )}

      {/* TAB 4: PLATFORM CONFIGURATION */}
      {adminActiveTab === 'settings' && (
        <div style={{ animation: 'fadeIn 0.2s ease-out' }}>
          {/* Global Feature Controls */}
          <div className="card" style={{ marginBottom: '2.5rem', background: 'white', border: '1px solid rgba(15, 44, 89, 0.08)', borderRadius: '16px', boxShadow: '0 10px 30px rgba(15, 44, 89, 0.02)', textAlign: 'left' }}>
            <h3 style={{ marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#0F2C59', fontWeight: 800, fontFamily: "'Outfit', sans-serif" }}>
              <Shield size={20} /> Global Feature Toggles
            </h3>
            <p style={{ color: 'var(--text-muted)', marginBottom: '1.5rem', fontSize: '0.9rem' }}>Enable or disable system features platform-wide for all resorts.</p>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem', background: '#f8fafc', padding: '1rem 1.5rem', borderRadius: '8px', border: '1px solid #cbd5e1' }}>
                <input 
                  type="checkbox" 
                  id="global_comm" 
                  checked={globalCommEnabled} 
                  onChange={e => setGlobalCommEnabled(e.target.checked)} 
                  style={{ width: '20px', height: '20px', cursor: 'pointer' }}
                />
                <label htmlFor="global_comm" style={{ fontWeight: 'bold', color: '#1e293b', cursor: 'pointer', fontSize: '0.9rem' }}>
                  {"Enable General Setting -> Communications & Automations Globally"}
                </label>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem', background: '#f8fafc', padding: '1rem 1.5rem', borderRadius: '8px', border: '1px solid #cbd5e1' }}>
                <input 
                  type="checkbox" 
                  id="global_templates" 
                  checked={globalTemplatesEnabled} 
                  onChange={e => setGlobalTemplatesEnabled(e.target.checked)} 
                  style={{ width: '20px', height: '20px', cursor: 'pointer' }}
                />
                <label htmlFor="global_templates" style={{ fontWeight: 'bold', color: '#1e293b', cursor: 'pointer', fontSize: '0.9rem' }}>
                  {"Enable Settings -> Template Management Globally"}
                </label>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem', background: '#f8fafc', padding: '1rem 1.5rem', borderRadius: '8px', border: '1px solid #cbd5e1' }}>
                <input 
                  type="checkbox" 
                  id="global_onboarding" 
                  checked={globalOnboardingWizardEnabled} 
                  onChange={e => setGlobalOnboardingWizardEnabled(e.target.checked)} 
                  style={{ width: '20px', height: '20px', cursor: 'pointer' }}
                />
                <label htmlFor="global_onboarding" style={{ fontWeight: 'bold', color: '#1e293b', cursor: 'pointer', fontSize: '0.9rem' }}>
                  {"Enable Onboarding Wizard for New Tenants"}
                </label>
              </div>
            </div>

            <div style={{ marginTop: '1.5rem', textAlign: 'right' }}>
              <button className="btn btn-primary" onClick={handleSaveGlobalFeatures} disabled={isUpdating} style={{ padding: '0.75rem 2rem', fontWeight: 700 }}>
                {isUpdating ? 'Saving...' : 'Broadcast Feature Controls'}
              </button>
            </div>
          </div>

          {/* Landing Page CMS */}
          <div className="card" style={{ marginBottom: '2.5rem', background: 'white', border: '1px solid rgba(15, 44, 89, 0.08)', borderRadius: '16px', boxShadow: '0 10px 30px rgba(15, 44, 89, 0.02)', textAlign: 'left' }}>
            <h3 style={{ marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#0F2C59', fontWeight: 800, fontFamily: "'Outfit', sans-serif" }}>
              <MessageCircle size={20} /> Landing Page Content (CMS)
            </h3>
            <p style={{ color: 'var(--text-muted)', marginBottom: '1.5rem', fontSize: '0.9rem' }}>Customize the public marketing page content seen by unauthenticated visitors.</p>
            
            <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '1.5rem' }}>
              <div className="form-group">
                <label className="form-label">Main Headline</label>
                <input 
                  type="text" 
                  className="form-input" 
                  value={landingContent.headline} 
                  onChange={e => setLandingContent({...landingContent, headline: e.target.value})} 
                />
              </div>
              <div className="form-group">
                <label className="form-label">Sub-headline / Description</label>
                <textarea 
                  className="form-input" 
                  style={{ minHeight: '80px', resize: 'vertical' }}
                  value={landingContent.subheadline} 
                  onChange={e => setLandingContent({...landingContent, subheadline: e.target.value})} 
                />
              </div>
              
              <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: '1.5rem', marginTop: '0.5rem' }}>
                <h4 style={{ marginBottom: '1.25rem', color: '#0F2C59', fontWeight: 800, fontFamily: "'Outfit', sans-serif" }}>Feature Highlights</h4>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1.5rem' }}>
                  {(landingContent.features || []).map((feature, idx) => (
                    <div key={idx} style={{ background: '#f8fafc', padding: '1.5rem', borderRadius: '12px', border: '1px solid #cbd5e1' }}>
                      <div className="form-group" style={{ marginBottom: '0.75rem' }}>
                        <label className="form-label" style={{ fontSize: '0.75rem' }}>Feature {idx + 1} Title</label>
                        <input 
                          type="text" 
                          className="form-input" 
                          value={feature.title} 
                          onChange={e => {
                            const newFeats = [...landingContent.features];
                            newFeats[idx].title = e.target.value;
                            setLandingContent({...landingContent, features: newFeats});
                          }} 
                        />
                      </div>
                      <div className="form-group">
                        <label className="form-label" style={{ fontSize: '0.75rem' }}>Feature {idx + 1} Description</label>
                        <textarea 
                          className="form-input" 
                          style={{ minHeight: '60px' }}
                          value={feature.description} 
                          onChange={e => {
                            const newFeats = [...landingContent.features];
                            newFeats[idx].description = e.target.value;
                            setLandingContent({...landingContent, features: newFeats});
                          }} 
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div style={{ marginTop: '1.5rem', textAlign: 'right' }}>
              <button className="btn btn-primary" onClick={handleSaveLandingPage} disabled={isUpdating} style={{ padding: '0.75rem 2rem', fontWeight: 700 }}>
                {isUpdating ? 'Saving...' : 'Save Landing Page Content'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Account Management Modal */}
      {editingUser && (
        <div className="modal-overlay" style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.7)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="card" style={{ width: '420px', maxWidth: '90%', animation: 'scaleUp 0.2s ease-out', textAlign: 'left', borderRadius: '16px', padding: '2rem' }}>
            <h2 style={{ marginBottom: '1.5rem', color: '#0F2C59', fontWeight: 800, fontFamily: "'Outfit', sans-serif" }}>Manage Account</h2>
            <div style={{ marginBottom: '1.5rem', padding: '1rem', background: 'rgba(15, 44, 89, 0.05)', borderRadius: '8px', border: '1px solid rgba(15, 44, 89, 0.1)' }}>
              <p style={{ margin: 0, fontWeight: 800, color: '#0F2C59' }}>{editingUser.full_name}</p>
              <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--primary)', fontWeight: 600 }}>{editingUser.email}</p>
              <p style={{ margin: '0.25rem 0 0', fontSize: '0.75rem', color: 'var(--text-muted)' }}>ID: {editingUser.id}</p>
            </div>

            <form onSubmit={handleUpdateUser}>
              <div className="form-group" style={{ marginBottom: '1rem' }}>
                <label className="form-label">Email Address</label>
                <input 
                  type="email" 
                  className="form-input" 
                  value={editingUser.email || ''} 
                  onChange={e => setEditingUser({...editingUser, email: e.target.value})}
                  placeholder="e.g. email@example.com"
                />
              </div>

              <div className="form-group" style={{ marginBottom: '1rem' }}>
                <label className="form-label">Subscription Plan</label>
                <select 
                  className="form-select" 
                  value={editingUser.plan_type} 
                  onChange={e => setEditingUser({...editingUser, plan_type: e.target.value})}
                  disabled={editingUser.role === 'staff'}
                >
                  {Object.entries(pricingConfig).map(([planKey, planVal]) => (
                    <option key={planKey} value={planKey}>{planVal.name?.toUpperCase() || planKey.toUpperCase()}</option>
                  ))}
                </select>
                {editingUser.role === 'staff' && <small style={{ color: 'var(--text-muted)' }}>Plans apply to Tenants only</small>}
              </div>

              <div className="form-group" style={{ marginBottom: '1.5rem' }}>
                <label className="form-label">Account Status</label>
                <select 
                  className="form-select" 
                  value={editingUser.subscription_status || 'active'} 
                  onChange={e => setEditingUser({...editingUser, subscription_status: e.target.value})}
                >
                  <option value="active">Active</option>
                  <option value="suspended">Suspended</option>
                </select>
              </div>

              <div className="form-group" style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.8rem', padding: '0.8rem', background: 'rgba(5, 150, 105, 0.04)', borderRadius: '8px', border: '1px solid rgba(5, 150, 105, 0.1)' }}>
                <input 
                  type="checkbox" 
                  id="feat_inv" 
                  checked={!!editingUser.feature_investment_enabled} 
                  onChange={e => setEditingUser({...editingUser, feature_investment_enabled: e.target.checked})} 
                  style={{ width: '20px', height: '20px', cursor: 'pointer' }}
                />
                <label htmlFor="feat_inv" style={{ fontWeight: 600, cursor: 'pointer', fontSize: '0.85rem', color: '#0F2C59' }}>Enable Investment Analysis</label>
              </div>

              <div className="form-group" style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.8rem', padding: '0.8rem', background: 'rgba(5, 150, 105, 0.04)', borderRadius: '8px', border: '1px solid rgba(5, 150, 105, 0.1)' }}>
                <input 
                  type="checkbox" 
                  id="feat_comm" 
                  checked={editingUser.feature_comm_enabled !== false} 
                  onChange={e => setEditingUser({...editingUser, feature_comm_enabled: e.target.checked})} 
                  style={{ width: '20px', height: '20px', cursor: 'pointer' }}
                />
                <label htmlFor="feat_comm" style={{ fontWeight: 600, cursor: 'pointer', fontSize: '0.85rem', color: '#0F2C59' }}>Enable Communications & Automations</label>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <button 
                  type="button" 
                  className={`btn ${confirmingDelete ? 'btn-primary' : 'btn-outline'}`} 
                  style={{ color: confirmingDelete ? 'white' : 'var(--danger)', background: confirmingDelete ? 'var(--danger)' : 'transparent', fontSize: '0.9rem', fontWeight: 700 }} 
                  onClick={() => deleteAccount(editingUser.id, editingUser.full_name)}
                >
                  {confirmingDelete ? 'Confirm Delete' : 'Delete Account'}
                </button>
                <button type="submit" className="btn btn-primary" style={{ fontSize: '0.9rem', fontWeight: 700 }} disabled={isUpdating || confirmingDelete}>
                  {isUpdating ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
              <button type="button" className="btn btn-link" style={{ width: '100%', marginTop: '1rem', fontWeight: 600 }} onClick={() => {
                setEditingUser(null);
                setConfirmingDelete(false);
              }}>
                Cancel
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
