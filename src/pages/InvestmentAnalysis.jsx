// Updated: 2026-10-04 - StayPilot Investment & Performance Analysis Modern UI & Responsive Android Architecture
import React, { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useSettingsStore } from '../lib/store';
import { supabase } from '../lib/supabase';
import {
  Loader2,
  TrendingUp, 
  DollarSign, 
  PieChart, 
  Activity, 
  ArrowUpRight, 
  ArrowDownRight, 
  Target, 
  Calendar,
  Briefcase,
  Zap,
  CheckCircle2,
  AlertCircle, 
  Clock,
  Calculator,
  Save,
  Home,
  Info,
  Building2,
  ShieldCheck,
  Percent,
  Wallet,
  TrendingDown,
  Layers
} from 'lucide-react';
import { format } from 'date-fns';

// --- SUB-COMPONENT: PRICE ANALYSIS (PLANNER) ---
const PricePlanner = ({ data, setData, propertyInfo, saving, onSave, windowWidth }) => {
  const annualOperatingExpense = data.monthly_operating_expenses * 12;
  const annualTotalFixed = Number(data.annual_fixed_expenses);
  const leaseInvestment = Number(data.total_investment || 0);
  
  let recoveryYears = Number(data.recovery_period_years || 1);
  if (data.property_ownership === 'leased' && data.lease_start_date && data.lease_end_date) {
    const start = new Date(data.lease_start_date);
    const end = new Date(data.lease_end_date);
    if (!isNaN(start.getTime()) && !isNaN(end.getTime())) {
      const diffDays = Math.round(Math.abs(end - start) / (1000 * 60 * 60 * 24)) + 1;
      const diffYears = diffDays / 365;
      recoveryYears = diffYears > 0 ? diffYears : 1;
    }
  }
  
  const annualCapitalCost = leaseInvestment / recoveryYears;
  const totalAnnualCost = annualOperatingExpense + annualTotalFixed + annualCapitalCost;
  const targetAnnualNetProfit = leaseInvestment * (data.target_roi_percentage / 100);
  const requiredGrossAnnualRevenue = totalAnnualCost + targetAnnualNetProfit;
  
  const totalUnits = data.rental_model === 'property' ? 1 : (data.total_rooms || propertyInfo.totalRooms || 1); 
  const totalAvailableNights = totalUnits * 365;
  const sellableRoomNights = totalAvailableNights * (data.expected_occupancy_rate / 100);
  
  const breakEvenDailyRatePerRoom = sellableRoomNights > 0 ? totalAnnualCost / sellableRoomNights : 0;
  const suggestedDailyRatePerRoom = sellableRoomNights > 0 ? requiredGrossAnnualRevenue / sellableRoomNights : 0;

  const breakEvenNightsNeeded = suggestedDailyRatePerRoom > 0 ? totalAnnualCost / suggestedDailyRatePerRoom : 0;
  const breakEvenOccupancyPercent = totalAvailableNights > 0 ? (breakEvenNightsNeeded / totalAvailableNights) * 100 : 0;

  const isDesktop = windowWidth >= 1024;

  return (
    <div style={{ display: 'grid', gridTemplateColumns: isDesktop ? 'minmax(0, 58%) minmax(0, 42%)' : '1fr', gap: '1.25rem', alignItems: 'start' }}>
      
      {/* LEFT COLUMN: Input Configuration Workspace */}
      <aside style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', width: '100%', minWidth: 0 }}>
        
        {/* 2x2 CONFIGURATION CARD GRID */}
        <div style={{ display: 'grid', gridTemplateColumns: windowWidth < 640 ? '1fr' : 'repeat(2, 1fr)', gap: '1.25rem', width: '100%', minWidth: 0 }}>
          
          {/* GROUP 1: PROPERTY CONFIGURATION */}
          <div className="settings-card" style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', boxSizing: 'border-box' }}>
            <h3 style={{ fontSize: '0.95rem', fontWeight: 700, marginBottom: '1rem', color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '0.5rem', borderBottom: '1px solid var(--border)', paddingBottom: '0.6rem' }}>
              <Building2 size={16} style={{ color: 'var(--primary)' }} /> 1. Property Configuration
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginTop: 'auto' }}>
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label" style={{ fontSize: '0.75rem', fontWeight: 700 }}>Rental Model</label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.35rem', background: 'var(--bg-secondary)', padding: '0.25rem', borderRadius: '8px', border: '1px solid var(--border)' }}>
                  <button 
                    className={`btn ${data.rental_model === 'room' ? 'btn-primary' : 'btn-outline'}`} 
                    style={{ fontSize: '0.75rem', padding: '0.45rem', borderRadius: '6px', fontWeight: 700, minHeight: '40px', border: data.rental_model === 'room' ? 'none' : '1px solid transparent' }} 
                    onClick={() => setData({...data, rental_model: 'room'})}
                  >
                    Rooms
                  </button>
                  <button 
                    className={`btn ${data.rental_model === 'property' ? 'btn-primary' : 'btn-outline'}`} 
                    style={{ fontSize: '0.75rem', padding: '0.45rem', borderRadius: '6px', fontWeight: 700, minHeight: '40px', border: data.rental_model === 'property' ? 'none' : '1px solid transparent' }} 
                    onClick={() => setData({...data, rental_model: 'property'})}
                  >
                    Property
                  </button>
                </div>
              </div>

              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label" style={{ fontSize: '0.75rem', fontWeight: 700 }}>Property Ownership</label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.35rem', background: 'var(--bg-secondary)', padding: '0.25rem', borderRadius: '8px', border: '1px solid var(--border)' }}>
                  <button 
                    className={`btn ${data.property_ownership === 'owned' ? 'btn-primary' : 'btn-outline'}`} 
                    style={{ fontSize: '0.75rem', padding: '0.45rem', borderRadius: '6px', fontWeight: 700, minHeight: '40px', border: data.property_ownership === 'owned' ? 'none' : '1px solid transparent' }} 
                    onClick={() => setData({...data, property_ownership: 'owned', recovery_period_years: data.recovery_period_years === 1 ? 5 : data.recovery_period_years})}
                  >
                    Owned
                  </button>
                  <button 
                    className={`btn ${data.property_ownership === 'leased' ? 'btn-primary' : 'btn-outline'}`} 
                    style={{ fontSize: '0.75rem', padding: '0.45rem', borderRadius: '6px', fontWeight: 700, minHeight: '40px', border: data.property_ownership === 'leased' ? 'none' : '1px solid transparent' }} 
                    onClick={() => setData({...data, property_ownership: 'leased', recovery_period_years: data.recovery_period_years === 5 ? 1 : data.recovery_period_years})}
                  >
                    Leased
                  </button>
                </div>
              </div>

              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label" style={{ fontSize: '0.75rem', fontWeight: 700 }}>Unit Count</label>
                <input 
                  type="number" 
                  className="form-input" 
                  style={{ height: '40px', fontSize: '0.875rem' }}
                  value={data.total_rooms} 
                  onChange={e => setData({...data, total_rooms: e.target.value === '' ? '' : Number(e.target.value)})} 
                />
              </div>
            </div>
          </div>

          {/* GROUP 2: INVESTMENT & TIMELINE */}
          <div className="settings-card" style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', boxSizing: 'border-box' }}>
            <h3 style={{ fontSize: '0.95rem', fontWeight: 700, marginBottom: '1rem', color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '0.5rem', borderBottom: '1px solid var(--border)', paddingBottom: '0.6rem' }}>
              <Wallet size={16} style={{ color: 'var(--primary)' }} /> 2. Investment & Timeline
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label" style={{ fontSize: '0.75rem', fontWeight: 700 }}>Total Investment (₹)</label>
                <div style={{ position: 'relative' }}>
                  <div style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', fontWeight: 700, fontSize: '0.875rem' }}>₹</div>
                  <input 
                    type="number" 
                    className="form-input" 
                    style={{ paddingLeft: '36px', height: '40px', fontSize: '0.875rem', fontVariantNumeric: 'tabular-nums' }} 
                    value={data.total_investment} 
                    onChange={e => setData({...data, total_investment: e.target.value === '' ? '' : Number(e.target.value)})} 
                  />
                </div>
              </div>

              {data.property_ownership === 'owned' ? (
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label" style={{ fontSize: '0.75rem', fontWeight: 700 }}>Recovery Period (Years)</label>
                  <input 
                    type="number" 
                    className="form-input" 
                    style={{ height: '40px', fontSize: '0.875rem' }}
                    value={data.recovery_period_years} 
                    onChange={e => setData({...data, recovery_period_years: e.target.value === '' ? '' : Number(e.target.value)})} 
                    min="1" 
                    step="0.5" 
                  />
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: windowWidth < 400 ? '1fr' : '1fr 1fr', gap: '0.75rem' }}>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label className="form-label" style={{ fontSize: '0.75rem', fontWeight: 700 }}>Lease Start</label>
                    <input 
                      type="date" 
                      className="form-input" 
                      style={{ height: '40px', fontSize: '0.8rem', padding: '0.4rem 0.5rem', width: '100%', boxSizing: 'border-box' }} 
                      value={data.lease_start_date} 
                      onChange={e => setData({...data, lease_start_date: e.target.value})} 
                    />
                  </div>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label className="form-label" style={{ fontSize: '0.75rem', fontWeight: 700 }}>Lease End</label>
                    <input 
                      type="date" 
                      className="form-input" 
                      style={{ height: '40px', fontSize: '0.8rem', padding: '0.4rem 0.5rem', width: '100%', boxSizing: 'border-box' }} 
                      value={data.lease_end_date} 
                      onChange={e => setData({...data, lease_end_date: e.target.value})} 
                    />
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* GROUP 3: OPERATING COSTS */}
          <div className="settings-card" style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', boxSizing: 'border-box' }}>
            <h3 style={{ fontSize: '0.95rem', fontWeight: 700, marginBottom: '1rem', color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '0.5rem', borderBottom: '1px solid var(--border)', paddingBottom: '0.6rem' }}>
              <TrendingDown size={16} style={{ color: 'var(--danger)' }} /> 3. Operating Costs
            </h3>
            <div style={{ display: 'grid', gridTemplateColumns: windowWidth < 400 ? '1fr' : '1fr 1fr', gap: '0.75rem' }}>
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label" style={{ fontSize: '0.75rem', fontWeight: 700 }}>Monthly OpExp (₹)</label>
                <input 
                  type="number" 
                  className="form-input" 
                  style={{ height: '40px', fontSize: '0.875rem', fontVariantNumeric: 'tabular-nums' }}
                  value={data.monthly_operating_expenses} 
                  onChange={e => setData({...data, monthly_operating_expenses: e.target.value === '' ? '' : Number(e.target.value)})} 
                />
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label" style={{ fontSize: '0.75rem', fontWeight: 700 }}>Annual Fixed (₹)</label>
                <input 
                  type="number" 
                  className="form-input" 
                  style={{ height: '40px', fontSize: '0.875rem', fontVariantNumeric: 'tabular-nums' }}
                  value={data.annual_fixed_expenses} 
                  onChange={e => setData({...data, annual_fixed_expenses: e.target.value === '' ? '' : Number(e.target.value)})} 
                />
              </div>
            </div>
          </div>

          {/* GROUP 4: STRATEGIC GOALS */}
          <div className="settings-card" style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', boxSizing: 'border-box' }}>
            <h3 style={{ fontSize: '0.95rem', fontWeight: 700, marginBottom: '1rem', color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '0.5rem', borderBottom: '1px solid var(--border)', paddingBottom: '0.6rem' }}>
              <Target size={16} style={{ color: 'var(--primary)' }} /> 4. Strategic Goals
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div style={{ display: 'grid', gridTemplateColumns: windowWidth < 400 ? '1fr' : '1fr 1fr', gap: '0.75rem' }}>
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label" style={{ fontSize: '0.75rem', fontWeight: 700 }}>Target ROI (%)</label>
                  <input 
                    type="number" 
                    className="form-input" 
                    style={{ height: '40px', fontSize: '0.875rem' }}
                    value={data.target_roi_percentage} 
                    onChange={e => setData({...data, target_roi_percentage: e.target.value === '' ? '' : Number(e.target.value)})} 
                  />
                </div>
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label" style={{ fontSize: '0.75rem', fontWeight: 700 }}>Occupancy Goal (%)</label>
                  <input 
                    type="number" 
                    className="form-input" 
                    style={{ height: '40px', fontSize: '0.875rem' }}
                    value={data.expected_occupancy_rate} 
                    onChange={e => setData({...data, expected_occupancy_rate: e.target.value === '' ? '' : Number(e.target.value)})} 
                  />
                </div>
              </div>

              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label" style={{ fontSize: '0.75rem', fontWeight: 700 }}>Expected Avg. Selling Price (₹)</label>
                <div style={{ position: 'relative' }}>
                  <div style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', fontWeight: 700, fontSize: '0.875rem' }}>₹</div>
                  <input 
                    type="number" 
                    className="form-input" 
                    style={{ paddingLeft: '36px', height: '40px', fontSize: '0.875rem', fontVariantNumeric: 'tabular-nums' }} 
                    value={data.average_selling_price} 
                    onChange={e => setData({...data, average_selling_price: e.target.value === '' ? '' : Number(e.target.value)})} 
                    placeholder="Optional for scenario testing" 
                  />
                </div>
              </div>
            </div>
          </div>

        </div>

        {/* SAVE CONFIGURATION CTA */}
        <button 
          className="btn btn-primary" 
          style={{ width: '100%', minHeight: '44px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', fontWeight: 700, fontSize: '0.9rem', borderRadius: '10px' }} 
          onClick={onSave} 
          disabled={saving}
        >
          <Save size={18}/> {saving ? 'Saving...' : 'Save Configuration'}
        </button>

      </aside>

      {/* RIGHT COLUMN: Strategy Projections */}
      <main style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', width: '100%', minWidth: 0 }}>
        <div className="settings-card" style={{ padding: '1.5rem', width: '100%', boxSizing: 'border-box' }}>
          <h3 style={{ marginBottom: '1.25rem', fontSize: '1.1rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-main)' }}>
            <TrendingUp size={20} style={{ color: '#10b981' }} /> Strategy Projections
          </h3>

          <div style={{ display: 'grid', gridTemplateColumns: windowWidth < 640 ? '1fr' : 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1.25rem' }}>
            
            {/* BREAK-EVEN RATE */}
            <div style={{ padding: '1.25rem', background: 'rgba(245, 158, 11, 0.06)', borderRadius: '12px', border: '1px solid rgba(245, 158, 11, 0.25)', textAlign: 'center', display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
              <span style={{ color: '#d97706', fontSize: '0.75rem', textTransform: 'uppercase', fontWeight: 800, letterSpacing: '0.04em' }}>Break-even Rate</span>
              <div style={{ color: '#d97706', margin: 0, fontSize: '2rem', fontWeight: 800, display: 'flex', alignItems: 'baseline', justifyContent: 'center', gap: '0.25rem', fontVariantNumeric: 'tabular-nums' }}>
                ₹{Math.ceil(breakEvenDailyRatePerRoom).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: 600 }}>/ night</span>
              </div>
              <span style={{ display: 'block', fontSize: '0.725rem', color: 'var(--text-muted)', lineHeight: '1.4', marginTop: 'auto', paddingTop: '0.4rem' }}>
                Minimum average room rate required to cover operating costs and recover your investment at the target occupancy.
              </span>
            </div>
            
            {/* SUGGESTED RATE */}
            <div style={{ padding: '1.25rem', background: 'rgba(16, 185, 129, 0.06)', borderRadius: '12px', border: '1px solid rgba(16, 185, 129, 0.25)', textAlign: 'center', display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
              <span style={{ color: '#10b981', fontSize: '0.75rem', textTransform: 'uppercase', fontWeight: 800, letterSpacing: '0.04em' }}>Suggested Rate</span>
              <div style={{ color: '#10b981', margin: 0, fontSize: '2rem', fontWeight: 800, display: 'flex', alignItems: 'baseline', justifyContent: 'center', gap: '0.25rem', fontVariantNumeric: 'tabular-nums' }}>
                ₹{Math.ceil(suggestedDailyRatePerRoom).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: 600 }}>/ night</span>
              </div>
              <span style={{ display: 'block', fontSize: '0.725rem', color: 'var(--text-muted)', lineHeight: '1.4', marginTop: 'auto', paddingTop: '0.4rem' }}>
                Average room rate required to cover costs, recover your investment and achieve the target ROI.
              </span>
            </div>
            
            {/* OPTIONAL REQUIRED OCCUPANCY */}
            {Number(data.average_selling_price) > 0 && (
              <div style={{ padding: '1.25rem', background: 'rgba(59, 130, 246, 0.06)', borderRadius: '12px', border: '1px solid rgba(59, 130, 246, 0.25)', textAlign: 'center', display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                <span style={{ color: '#3b82f6', fontSize: '0.75rem', textTransform: 'uppercase', fontWeight: 800, letterSpacing: '0.04em' }}>Required Occupancy</span>
                <div style={{ color: '#3b82f6', margin: 0, fontSize: '2rem', fontWeight: 800, display: 'flex', alignItems: 'baseline', justifyContent: 'center', gap: '0.25rem', fontVariantNumeric: 'tabular-nums' }}>
                  {((requiredGrossAnnualRevenue / Number(data.average_selling_price)) / totalAvailableNights * 100).toFixed(1)}%
                </div>
                <span style={{ display: 'block', fontSize: '0.725rem', color: 'var(--text-muted)', lineHeight: '1.4', marginTop: 'auto', paddingTop: '0.4rem' }}>
                  (Scenario) Required occupancy if selling at expected avg price of ₹{Number(data.average_selling_price).toLocaleString('en-IN')}.
                </span>
              </div>
            )}
            
          </div>
          
          {/* ANNUAL FINANCIAL TARGETS */}
          <div style={{ marginTop: '1.5rem', background: 'var(--bg-secondary)', padding: '1.25rem', borderRadius: '12px', border: '1px solid var(--border)' }}>
            <h4 style={{ marginBottom: '1rem', fontSize: '0.95rem', fontWeight: 700, borderBottom: '1px solid var(--border)', paddingBottom: '0.6rem', color: 'var(--text-main)' }}>
              Annual Financial Targets
            </h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem', fontSize: '0.875rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem' }}>
                <span style={{ color: 'var(--text-muted)' }}>Total Operational & Fixed Costs</span>
                <span style={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>₹{Math.ceil(annualOperatingExpense + annualTotalFixed).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem' }}>
                <span style={{ color: 'var(--text-muted)' }}>Capital Recovery</span>
                <span style={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>₹{Math.ceil(annualCapitalCost).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem' }}>
                <span style={{ color: 'var(--text-muted)' }}>Target Profit ({data.target_roi_percentage}% ROI)</span>
                <span style={{ fontWeight: 700, color: '#10b981', fontVariantNumeric: 'tabular-nums' }}>+ ₹{Math.ceil(targetAnnualNetProfit).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.5rem', padding: '0.85rem 1rem', background: 'rgba(16, 185, 129, 0.08)', borderRadius: '10px', border: '1px solid rgba(16, 185, 129, 0.2)', flexWrap: 'wrap', gap: '0.5rem' }}>
                <span style={{ fontWeight: 800, color: 'var(--text-main)', fontSize: '0.9rem' }}>Required Revenue</span>
                <span style={{ fontWeight: 800, color: '#10b981', fontSize: '1.35rem', fontVariantNumeric: 'tabular-nums' }}>₹{Math.ceil(requiredGrossAnnualRevenue).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
              </div>
            </div>
          </div>

        </div>
      </main>
    </div>
  );
};

// --- SUB-COMPONENT: ROI ANALYSIS (PERFORMANCE) ---
const ROIPerformance = ({ investmentData, financials, range, windowWidth }) => {
  const stats = useMemo(() => {
    const capitalOutlay = Number(investmentData?.total_investment || 0);
    const targetROIPercent = Number(investmentData?.target_roi_percentage || 0);
    
    const filterStart = new Date(range.start);
    const filterEnd = new Date(range.end);
    const today = new Date();
    
    const leaseStart = investmentData?.lease_start_date ? new Date(investmentData.lease_start_date) : null;
    const leaseEnd = investmentData?.lease_end_date ? new Date(investmentData.lease_end_date) : null;

    // Authoritative Performance Period Bounds:
    // performanceStart: max(lease_start_date, range.start) if leaseStart is valid
    let perfStart = filterStart;
    if (leaseStart && !isNaN(leaseStart.getTime())) {
      perfStart = leaseStart > filterStart ? leaseStart : filterStart;
    }

    // performanceEnd: min(today, lease_end_date, range.end)
    let perfEnd = today < filterEnd ? today : filterEnd;
    if (leaseEnd && !isNaN(leaseEnd.getTime())) {
      perfEnd = perfEnd < leaseEnd ? perfEnd : leaseEnd;
    }

    const isFutureLease = perfStart > today;
    if (perfEnd < perfStart) {
      perfEnd = perfStart;
    }

    // Total Lease / Investment Period Duration (inclusive days)
    let totalLeaseDays = 365;
    if (leaseStart && leaseEnd && !isNaN(leaseStart.getTime()) && !isNaN(leaseEnd.getTime())) {
      totalLeaseDays = Math.max(1, Math.round((leaseEnd - leaseStart) / (1000 * 60 * 60 * 24)) + 1);
    } else {
      totalLeaseDays = Math.max(1, Math.round((Number(investmentData?.recovery_period_years) || 1) * 365));
    }

    // Exact Elapsed Investment Days (inclusive)
    let elapsedLeaseDays = 0;
    if (!isFutureLease && perfEnd >= perfStart) {
      elapsedLeaseDays = Math.round((perfEnd - perfStart) / (1000 * 60 * 60 * 24)) + 1;
      elapsedLeaseDays = Math.min(totalLeaseDays, Math.max(0, elapsedLeaseDays));
    }

    const elapsedFraction = totalLeaseDays > 0 ? (elapsedLeaseDays / totalLeaseDays) : 0;
    const capitalRecoveryToDate = capitalOutlay * elapsedFraction;

    // Filter incomes & expenses strictly within effective performance period (perfStart to perfEnd)
    const validIncomes = (financials.incomes || []).filter(inc => {
      const d = new Date(inc.date);
      return d >= perfStart && d <= perfEnd;
    });

    const validExpenses = (financials.expenses || []).filter(exp => {
      const d = new Date(exp.date);
      return d >= perfStart && d <= perfEnd;
    });

    const totalIncome = validIncomes.reduce((sum, i) => sum + Number(i.amount), 0);
    const totalOperatingExpenses = validExpenses.reduce((sum, e) => sum + Number(e.amount), 0);
    const netProfit = totalIncome - totalOperatingExpenses;

    // Break-Even Target To Date = Capital Recovery To Date + Actual Expenses To Date
    const breakEvenRevenueTarget = capitalRecoveryToDate + totalOperatingExpenses;
    const achievedBreakEven = totalIncome >= breakEvenRevenueTarget;
    const breakEvenVariance = totalIncome - breakEvenRevenueTarget;
    const breakEvenAchievementPercent = breakEvenRevenueTarget > 0 ? (totalIncome / breakEvenRevenueTarget) * 100 : 0;

    // Strategic Target To Date = Actual Expenses To Date + Capital Recovery To Date + Prorated ROI Profit Target
    const fullROITarget = capitalOutlay * (targetROIPercent / 100);
    const roiTargetToDate = fullROITarget * elapsedFraction;
    const strategicTargetToDate = breakEvenRevenueTarget + roiTargetToDate;

    // Capital Recovered = Net Operating Profit available toward investment recovery (max 100% of capitalOutlay)
    const capitalRecovered = Math.max(0, Math.min(capitalOutlay, netProfit));
    const capitalRecoveryPercent = capitalOutlay > 0 ? Math.min(100, (capitalRecovered / capitalOutlay) * 100) : 0;
    const actualROI = capitalOutlay > 0 ? (netProfit / capitalOutlay) * 100 : 0;

    // Payback period calculation at current run rate
    const elapsedYears = elapsedLeaseDays / 365;
    const annualRunRateProfit = elapsedYears > 0 ? netProfit / elapsedYears : 0;
    const yearsToPayback = (capitalOutlay > 0 && annualRunRateProfit > 0) ? (capitalOutlay / annualRunRateProfit) : 0;

    // Planned Monthly Targets & Annual Baseline
    const annualOperatingExpense = Number(investmentData?.monthly_operating_expenses || 0) * 12;
    const annualTotalFixed = Number(investmentData?.annual_fixed_expenses || 0);
    const recoveryYears = totalLeaseDays / 365;
    const annualCapitalCost = capitalOutlay / (recoveryYears > 0 ? recoveryYears : 1);
    const totalAnnualCost = annualOperatingExpense + annualTotalFixed + annualCapitalCost;

    const monthlyOperatingExpTarget = Number(investmentData?.monthly_operating_expenses || 0);
    const monthlyFixedExpTarget = annualTotalFixed / 12;
    const monthlyCapitalRecoveryTarget = annualCapitalCost / 12;
    const breakEvenMonthlyTarget = monthlyOperatingExpTarget + monthlyFixedExpTarget + monthlyCapitalRecoveryTarget;
    const monthlyROIGoal = fullROITarget / 12;
    const monthlyCapitalRecoveryGoal = monthlyCapitalRecoveryTarget;
    
    // Monthly Strategic Revenue Target (Planned):
    // Operating Expenses + Fixed Expenses + Capital Recovery + Target ROI Contribution
    const totalMonthlyRevenueTarget = breakEvenMonthlyTarget + monthlyROIGoal;

    // Actual Historical Averages (Safe Division - Prevents NaN / Infinity)
    const elapsedMonths = elapsedLeaseDays / 30.416;
    const rawMonthlyAverageRevenue = elapsedMonths > 0 ? (totalIncome / elapsedMonths) : 0;
    const monthlyAverageRevenue = (isNaN(rawMonthlyAverageRevenue) || !isFinite(rawMonthlyAverageRevenue)) ? 0 : rawMonthlyAverageRevenue;

    const rawMonthlyAverageExpense = elapsedMonths > 0 ? (totalOperatingExpenses / elapsedMonths) : 0;
    const monthlyAverageExpense = (isNaN(rawMonthlyAverageExpense) || !isFinite(rawMonthlyAverageExpense)) ? 0 : rawMonthlyAverageExpense;

    const rawMonthlyAverageProfit = elapsedMonths > 0 ? (netProfit / elapsedMonths) : 0;
    const monthlyAverageProfit = (isNaN(rawMonthlyAverageProfit) || !isFinite(rawMonthlyAverageProfit)) ? 0 : rawMonthlyAverageProfit;

    const requiredGrossAnnualRevenue = totalAnnualCost + fullROITarget;
    const totalUnits = investmentData?.rental_model === 'property' ? 1 : (investmentData?.total_rooms || 1); 
    const sellableRoomNights = (totalUnits * 365) * (Number(investmentData?.expected_occupancy_rate || 60) / 100);
    const suggestedRate = sellableRoomNights > 0 ? requiredGrossAnnualRevenue / sellableRoomNights : 0;
    const breakEvenRate = sellableRoomNights > 0 ? totalAnnualCost / sellableRoomNights : 0;

    // Bookings & Occupancy strictly for effective performance period
    const validBookings = (financials.bookings || []).filter(b => {
      if (b.status === 'cancelled' || b.status === 'no_show' || b.status === 'Cancelled') return false;
      if (!b.check_in_date) return false;
      const cin = new Date(b.check_in_date);
      return cin >= perfStart && cin <= perfEnd;
    });

    let totalNightsSold = 0;
    const monthlyPerformance = {};
    const initMonth = (date) => {
      const monthKey = `${date.getFullYear()}-${date.getMonth()}`;
      if (!monthlyPerformance[monthKey]) {
        monthlyPerformance[monthKey] = { 
          label: date.toLocaleString('default', { month: 'short', year: '2-digit' }), 
          revenue: 0, 
          nightsSold: 0,
          year: date.getFullYear(), 
          month: date.getMonth() 
        };
      }
      return monthKey;
    };

    validIncomes.forEach(inc => {
      const monthKey = initMonth(new Date(inc.date));
      monthlyPerformance[monthKey].revenue += Number(inc.amount);
    });

    validBookings.forEach(b => {
      let nights = Number(b.night_count);
      if (!(nights > 0)) {
        const cin = new Date(b.check_in_date);
        const cout = new Date(b.check_out_date);
        nights = Math.max(1, Math.round((cout - cin) / (1000 * 60 * 60 * 24)));
      }
      
      let roomsCount = 1;
      if (investmentData?.rental_model !== 'property' && b.room_ids && Array.isArray(b.room_ids) && b.room_ids.length > 0) {
        roomsCount = b.room_ids.length;
      }
      const roomNights = nights * roomsCount;
      totalNightsSold += roomNights;
      
      if (b.check_in_date) {
        const monthKey = initMonth(new Date(b.check_in_date));
        monthlyPerformance[monthKey].nightsSold += roomNights;
      }
    });

    const actualADR = totalNightsSold > 0 ? (totalIncome / totalNightsSold) : 0;
    const effectiveADR = Number(investmentData?.average_selling_price) > 0 
      ? Number(investmentData.average_selling_price) 
      : (actualADR > 0 ? actualADR : suggestedRate);

    const requiredOccupancyRate = effectiveADR > 0 
      ? (totalMonthlyRevenueTarget / effectiveADR) / (totalUnits * 30.4) * 100 
      : 0;
      
    const breakEvenOccupancyRate = effectiveADR > 0
      ? (breakEvenMonthlyTarget / effectiveADR) / (totalUnits * 30.4) * 100
      : 0;

    const monthlyBreakdown = Object.values(monthlyPerformance).sort((a, b) => {
      if (a.year !== b.year) return a.year - b.year;
      return a.month - b.month;
    }).map(m => {
      const occRate = (m.nightsSold / (totalUnits * 30.4)) * 100;
      let status = 'failed';
      if (m.revenue >= breakEvenMonthlyTarget) {
        status = 'achieved';
      } else if (occRate >= breakEvenOccupancyRate) {
        status = 'on_track';
      }
      
      return {
        ...m,
        occupancyRate: occRate,
        status: status,
        achieved: status === 'achieved' || status === 'on_track'
      };
    });
      
    const totalAvailableNightsElapsed = totalUnits * elapsedLeaseDays;
    const actualOccupancyRate = totalAvailableNightsElapsed > 0 ? (totalNightsSold / totalAvailableNightsElapsed) * 100 : 0;

    // Overall Performance Health Indicator Logic
    let healthStatus = {
      code: 'NOT_STARTED',
      label: 'NOT STARTED',
      bg: 'rgba(148, 163, 184, 0.12)',
      color: '#94a3b8',
      border: 'rgba(148, 163, 184, 0.25)',
      message: 'Performance tracking will begin when the active period starts.'
    };

    if (isFutureLease || elapsedLeaseDays <= 0) {
      healthStatus = {
        code: 'NOT_STARTED',
        label: 'NOT STARTED',
        bg: 'rgba(148, 163, 184, 0.12)',
        color: '#94a3b8',
        border: 'rgba(148, 163, 184, 0.25)',
        message: 'Performance tracking will begin when the active period starts.'
      };
    } else if (netProfit <= 0) {
      healthStatus = {
        code: 'CRITICAL',
        label: 'CRITICAL',
        bg: 'rgba(239, 68, 68, 0.12)',
        color: '#ef4444',
        border: 'rgba(239, 68, 68, 0.25)',
        message: 'Operating at a loss and below the break-even recovery target.'
      };
    } else if (totalIncome >= strategicTargetToDate && netProfit > 0) {
      healthStatus = {
        code: 'HEALTHY',
        label: 'HEALTHY',
        bg: 'rgba(16, 185, 129, 0.12)',
        color: '#10b981',
        border: 'rgba(16, 185, 129, 0.25)',
        message: 'Revenue and profitability are meeting the strategic target.'
      };
    } else if (totalIncome >= breakEvenRevenueTarget && totalIncome < strategicTargetToDate && netProfit > 0) {
      healthStatus = {
        code: 'STABLE',
        label: 'STABLE',
        bg: 'rgba(59, 130, 246, 0.12)',
        color: '#3b82f6',
        border: 'rgba(59, 130, 246, 0.25)',
        message: 'Break-even target achieved; strategic ROI target is still in progress.'
      };
    } else if (totalIncome < breakEvenRevenueTarget && netProfit > 0) {
      healthStatus = {
        code: 'NEEDS_ATTENTION',
        label: 'NEEDS ATTENTION',
        bg: 'rgba(245, 158, 11, 0.12)',
        color: '#d97706',
        border: 'rgba(245, 158, 11, 0.25)',
        message: 'Profitable, but revenue is currently below the break-even recovery target.'
      };
    }

    return {
      healthStatus,
      perfStart: perfStart.toISOString().split('T')[0],
      perfEnd: perfEnd.toISOString().split('T')[0],
      totalLeaseDays,
      elapsedLeaseDays,
      elapsedFraction,
      capitalRecoveryToDate,
      totalIncome,
      totalOperatingExpenses,
      netProfit,
      actualROI,
      capitalOutlay, 
      targetROIPercent,
      fullROITarget,
      roiTargetToDate,
      strategicTargetToDate,
      capitalRecovered,
      capitalRecoveryPercent,
      yearsToPayback,
      monthlyCapitalRecoveryGoal,
      monthlyROIGoal, 
      monthlyAverageRevenue,
      monthlyAverageExpense,
      monthlyAverageProfit,
      totalMonthlyRevenueTarget,
      suggestedRate,
      breakEvenRate,
      breakEvenRevenueTarget,
      achievedBreakEven,
      breakEvenVariance,
      breakEvenAchievementPercent,
      totalAnnualCost,
      breakEvenMonthlyTarget,
      monthlyBreakdown,
      monthlyOperatingExpTarget,
      monthlyFixedExpTarget,
      monthlyCapitalRecoveryTarget,
      actualADR,
      effectiveADR,
      requiredOccupancyRate,
      breakEvenOccupancyRate,
      actualOccupancyRate
    };
  }, [financials, investmentData, range]);

  const kpiColumns = windowWidth >= 1024 ? 'repeat(4, 1fr)' : (windowWidth >= 640 ? 'repeat(2, 1fr)' : '1fr');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', width: '100%', maxWidth: '100%', minWidth: 0, boxSizing: 'border-box' }}>
      
      {/* OVERALL PERFORMANCE HEALTH INDICATOR BAR */}
      <div className="settings-card" style={{ padding: '0.85rem 1.25rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem', width: '100%', minWidth: 0, boxSizing: 'border-box' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <span style={{ fontSize: '0.875rem', fontWeight: 800, color: 'var(--text-main)', letterSpacing: '0.01em' }}>Overall Performance</span>
            <div title="Overall Performance compares revenue, break-even progress, profitability and strategic targets to provide a simple view of property financial health." style={{ display: 'inline-flex', cursor: 'pointer', color: 'var(--text-muted)' }}>
              <Info size={15} />
            </div>
          </div>
          <span style={{ 
            padding: '0.3rem 0.75rem', 
            borderRadius: '20px', 
            fontSize: '0.75rem', 
            fontWeight: 800, 
            background: stats.healthStatus.bg, 
            color: stats.healthStatus.color, 
            border: `1px solid ${stats.healthStatus.border}`,
            letterSpacing: '0.03em',
            whiteSpace: 'nowrap'
          }}>
            {stats.healthStatus.label}
          </span>
        </div>
        <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600, flexShrink: 1 }}>
          {stats.healthStatus.message}
        </span>
      </div>

      {/* SECTION 1: TOP PERFORMANCE KPI CARDS */}
      <div style={{ display: 'grid', gridTemplateColumns: kpiColumns, gap: '1.25rem', width: '100%', minWidth: 0 }}>
        
        {/* KPI 1: ACTUAL ROI */}
        <div className="settings-card" style={{ padding: '1.25rem', minWidth: 0, boxSizing: 'border-box' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.04em', textTransform: 'uppercase' }}>Return on Investment (ROI)</span>
            <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: 'rgba(16, 185, 129, 0.12)', border: '1px solid rgba(16, 185, 129, 0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#10b981' }}>
              <TrendingUp size={18} />
            </div>
          </div>
          <div style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--text-main)', letterSpacing: '-0.02em', marginBottom: '0.25rem', fontVariantNumeric: 'tabular-nums' }}>
            {stats.actualROI.toFixed(1)}%
          </div>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Target: {stats.targetROIPercent}%</div>
        </div>

        {/* KPI 2: NET PROFIT / CAPITAL RECOVERED */}
        <div className="settings-card" style={{ padding: '1.25rem', minWidth: 0, boxSizing: 'border-box' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.04em', textTransform: 'uppercase' }}>CAPITAL RECOVERED</span>
            <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: 'rgba(59, 130, 246, 0.12)', border: '1px solid rgba(59, 130, 246, 0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#3b82f6' }}>
              <Wallet size={18} />
            </div>
          </div>
          <div style={{ fontSize: '1.75rem', fontWeight: 800, color: stats.netProfit >= 0 ? '#10b981' : '#ef4444', letterSpacing: '-0.02em', marginBottom: '0.25rem', fontVariantNumeric: 'tabular-nums' }}>
            ₹{stats.netProfit.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            {Math.max(0, stats.actualROI).toFixed(1)}% of ₹{stats.capitalOutlay.toLocaleString('en-IN')}
          </div>
        </div>

        {/* KPI 3: ACTUAL OCCUPANCY */}
        <div className="settings-card" style={{ padding: '1.25rem', minWidth: 0, boxSizing: 'border-box' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.04em', textTransform: 'uppercase' }}>Occupancy Rate</span>
            <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: 'rgba(245, 158, 11, 0.12)', border: '1px solid rgba(245, 158, 11, 0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#d97706' }}>
              <Percent size={18} />
            </div>
          </div>
          <div style={{ fontSize: '1.75rem', fontWeight: 800, color: stats.actualOccupancyRate >= stats.breakEvenOccupancyRate ? '#10b981' : '#d97706', letterSpacing: '-0.02em', marginBottom: '0.25rem', fontVariantNumeric: 'tabular-nums' }}>
            {stats.actualOccupancyRate.toFixed(1)}%
          </div>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Required: {stats.breakEvenOccupancyRate.toFixed(1)}%</div>
        </div>

        {/* KPI 4: ESTIMATED PAYBACK TIME */}
        <div className="settings-card" style={{ padding: '1.25rem', minWidth: 0, boxSizing: 'border-box' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.04em', textTransform: 'uppercase' }}>Estimated Payback Period</span>
            <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: 'rgba(139, 92, 246, 0.12)', border: '1px solid rgba(139, 92, 246, 0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#8b5cf6' }}>
              <Clock size={18} />
            </div>
          </div>
          <div style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--text-main)', letterSpacing: '-0.02em', marginBottom: '0.25rem', fontVariantNumeric: 'tabular-nums' }}>
            {stats.yearsToPayback > 0 ? `${stats.yearsToPayback.toFixed(1)} Yrs` : 'N/A'}
          </div>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>At current run rate</div>
        </div>

      </div>

      {/* SECTION 2: BREAK-EVEN STATUS (YTD) */}
      <div className="settings-card" style={{ padding: '1.25rem', width: '100%', minWidth: 0, boxSizing: 'border-box' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.75rem' }}>
          <div>
            <h3 style={{ fontSize: '1rem', fontWeight: 700, margin: 0, color: 'var(--text-main)' }}>Break-Even Progress</h3>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>YTD Revenue vs Break-Even Target</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '1.5rem', fontWeight: 800, color: stats.achievedBreakEven ? '#10b981' : '#d97706', fontVariantNumeric: 'tabular-nums' }}>
              {stats.breakEvenAchievementPercent.toFixed(1)}%
            </span>
            <span style={{ padding: '0.35rem 0.75rem', borderRadius: '20px', fontSize: '0.75rem', fontWeight: 800, background: stats.achievedBreakEven ? 'rgba(16, 185, 129, 0.12)' : 'rgba(245, 158, 11, 0.12)', color: stats.achievedBreakEven ? '#10b981' : '#d97706', border: stats.achievedBreakEven ? '1px solid rgba(16, 185, 129, 0.25)' : '1px solid rgba(245, 158, 11, 0.25)' }}>
              {stats.achievedBreakEven ? 'ACHIEVED' : 'NOT ACHIEVED'}
            </span>
          </div>
        </div>

        {/* PROGRESS BAR */}
        <div style={{ height: '8px', background: 'var(--bg-secondary)', borderRadius: '4px', overflow: 'hidden', marginBottom: '1.25rem', border: '1px solid var(--border)' }}>
          <div style={{ width: `${Math.min(100, Math.max(0, stats.breakEvenRevenueTarget > 0 ? (stats.totalIncome / stats.breakEvenRevenueTarget) * 100 : 0))}%`, height: '100%', background: stats.achievedBreakEven ? '#10b981' : '#d97706', transition: 'width 0.4s ease' }}></div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: windowWidth < 640 ? '1fr' : 'repeat(3, 1fr)', gap: '1rem', padding: '1rem', background: 'var(--bg-secondary)', borderRadius: '10px', border: '1px solid var(--border)', width: '100%', minWidth: 0, boxSizing: 'border-box' }}>
          <div style={{ minWidth: 0 }}>
            <span style={{ color: 'var(--text-muted)', display: 'block', fontSize: '0.7rem', textTransform: 'uppercase', fontWeight: 700, marginBottom: '0.25rem' }}>Revenue to Date</span>
            <div style={{ fontSize: '1.15rem', fontWeight: 800, color: 'var(--text-main)', fontVariantNumeric: 'tabular-nums' }}>
              ₹{Math.ceil(stats.totalIncome).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <small style={{ fontSize: '0.75rem', fontWeight: 700, color: stats.totalIncome >= stats.breakEvenRevenueTarget ? '#10b981' : '#d97706' }}>
              {stats.breakEvenRevenueTarget > 0 ? ((stats.totalIncome / stats.breakEvenRevenueTarget) * 100).toFixed(1) : 0}% Achieved
            </small>
          </div>
          <div style={{ minWidth: 0 }}>
            <span style={{ color: 'var(--text-muted)', display: 'block', fontSize: '0.7rem', textTransform: 'uppercase', fontWeight: 700, marginBottom: '0.25rem' }}>Break-Even Revenue to Date</span>
            <div style={{ fontSize: '1.15rem', fontWeight: 800, color: 'var(--text-main)', fontVariantNumeric: 'tabular-nums' }}>
              ₹{Math.ceil(stats.breakEvenRevenueTarget).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <small style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>0% Profit Baseline</small>
          </div>
          <div style={{ minWidth: 0 }}>
            <span style={{ color: 'var(--text-muted)', display: 'block', fontSize: '0.7rem', textTransform: 'uppercase', fontWeight: 700, marginBottom: '0.25rem' }}>Variance</span>
            <div style={{ fontSize: '1.15rem', fontWeight: 800, color: stats.achievedBreakEven ? '#10b981' : '#ef4444', fontVariantNumeric: 'tabular-nums' }}>
              {stats.achievedBreakEven ? '+' : '-'}₹{Math.abs(stats.totalIncome - stats.breakEvenRevenueTarget).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <small style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Difference from target</small>
          </div>
        </div>
      </div>

      {/* SECTION 3: MONTHLY TARGETS */}
      <div style={{ display: 'grid', gridTemplateColumns: windowWidth < 1024 ? '1fr' : 'repeat(2, 1fr)', gap: '1.25rem', width: '100%', minWidth: 0 }}>
        
        {/* GOAL 1 — BREAK-EVEN TARGET */}
        <div className="settings-card" style={{ padding: '1.25rem', minWidth: 0, boxSizing: 'border-box' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
            <span style={{ color: '#d97706', fontWeight: 800, textTransform: 'uppercase', fontSize: '0.8rem', letterSpacing: '0.04em' }}>
              Goal 1: Break-Even Target
            </span>
            <span style={{ padding: '0.25rem 0.5rem', borderRadius: '6px', fontSize: '0.7rem', background: 'rgba(245, 158, 11, 0.1)', color: '#d97706', fontWeight: 700, maxWidth: '100%', wordBreak: 'break-word' }}>
              Operating Costs + Capital Recovery
            </span>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '0.5rem', minWidth: 0 }}>
            <div>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.25rem' }}>Monthly Break-Even Revenue</span>
              <div style={{ fontSize: '1.85rem', fontWeight: 800, color: '#d97706', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
                ₹{Math.ceil(stats.breakEvenMonthlyTarget).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.25rem' }}>Average Monthly Revenue</span>
              <div style={{ fontSize: '1.15rem', fontWeight: 800, color: (stats.monthlyAverageRevenue || 0) >= stats.breakEvenMonthlyTarget ? '#10b981' : '#ef4444', fontVariantNumeric: 'tabular-nums' }}>
                ₹{Math.ceil(stats.monthlyAverageRevenue || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
            </div>
          </div>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem', borderTop: '1px solid var(--border)', paddingTop: '0.85rem', fontSize: '0.85rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-muted)' }}>Operating Expenses</span>
              <span style={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>₹{Math.ceil(stats.monthlyOperatingExpTarget).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-muted)' }}>Fixed Expenses</span>
              <span style={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>₹{Math.ceil(stats.monthlyFixedExpTarget).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-muted)' }}>Capital Recovery</span>
              <span style={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>₹{Math.ceil(stats.monthlyCapitalRecoveryTarget).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
            </div>
          </div>
        </div>
        
        {/* GOAL 2 — STRATEGIC TARGET */}
        <div className="settings-card" style={{ padding: '1.25rem', minWidth: 0, boxSizing: 'border-box' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
            <span style={{ color: 'var(--primary)', fontWeight: 800, textTransform: 'uppercase', fontSize: '0.8rem', letterSpacing: '0.04em' }}>
              Goal 2: Strategic Target
            </span>
            <span style={{ padding: '0.25rem 0.5rem', borderRadius: '6px', fontSize: '0.7rem', background: 'rgba(59, 130, 246, 0.1)', color: 'var(--primary)', fontWeight: 700, maxWidth: '100%', wordBreak: 'break-word' }}>
              Operating Costs + Capital Recovery + ROI
            </span>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '0.5rem', minWidth: 0 }}>
            <div>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.25rem' }}>Target / Month</span>
              <div style={{ fontSize: '1.85rem', fontWeight: 800, color: 'var(--primary)', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
                ₹{Math.ceil(stats.totalMonthlyRevenueTarget).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.25rem' }}>Current Status</span>
              <span style={{ display: 'inline-block', fontSize: '0.75rem', fontWeight: 800, padding: '0.35rem 0.65rem', borderRadius: '6px', background: (stats.monthlyAverageRevenue || 0) >= stats.totalMonthlyRevenueTarget ? 'rgba(16, 185, 129, 0.12)' : 'rgba(239, 68, 68, 0.12)', color: (stats.monthlyAverageRevenue || 0) >= stats.totalMonthlyRevenueTarget ? '#10b981' : '#ef4444' }}>
                {(stats.monthlyAverageRevenue || 0) >= stats.totalMonthlyRevenueTarget ? 'ON TRACK' : 'ACTION REQUIRED'}
              </span>
            </div>
          </div>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem', borderTop: '1px solid var(--border)', paddingTop: '0.85rem', fontSize: '0.85rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-muted)' }}>Operating Expenses</span>
              <span style={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>₹{Math.ceil(stats.monthlyOperatingExpTarget).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-muted)' }}>Fixed Expenses</span>
              <span style={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>₹{Math.ceil(stats.monthlyFixedExpTarget).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-muted)' }}>Capital Recovery</span>
              <span style={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>₹{Math.ceil(stats.monthlyCapitalRecoveryGoal).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-muted)' }}>Target ROI Contribution</span>
              <span style={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>₹{Math.ceil(stats.monthlyROIGoal).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
            </div>
          </div>
        </div>
        
      </div>

      {/* SECTION 4: OPERATIONAL METRICS & MONTHLY TIMELINE */}
      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: windowWidth < 1150 ? '1fr' : 'minmax(300px, 0.35fr) minmax(0, 0.65fr)', 
        gap: '1.25rem',
        width: '100%',
        maxWidth: '100%',
        minWidth: 0
      }}>
        
        {/* OPERATIONAL METRICS CARD */}
        <div className="settings-card" style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem', width: '100%', minWidth: 0, boxSizing: 'border-box' }}>
          <h3 style={{ fontSize: '1rem', fontWeight: 700, margin: 0, color: 'var(--text-main)' }}>Operating Performance</h3>
          
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', minWidth: 0 }}>
            <div style={{ minWidth: 0 }}>
              <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', display: 'block', wordBreak: 'break-word' }}>Average Daily Rate (ADR)</span>
              <div style={{ fontSize: windowWidth <= 430 ? '1.25rem' : '1.5rem', fontWeight: 800, color: 'var(--text-main)', fontVariantNumeric: 'tabular-nums', marginTop: '0.2rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                ₹{Math.ceil(stats.actualADR).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
              <small style={{ color: 'var(--text-muted)', fontSize: '0.75rem', display: 'block' }}>Historical avg</small>
            </div>
            <div style={{ minWidth: 0 }}>
              <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', display: 'block', wordBreak: 'break-word' }}>Occupancy Rate</span>
              <div style={{ fontSize: windowWidth <= 430 ? '1.25rem' : '1.5rem', fontWeight: 800, color: stats.actualOccupancyRate >= stats.breakEvenOccupancyRate ? '#10b981' : '#d97706', fontVariantNumeric: 'tabular-nums', marginTop: '0.2rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {stats.actualOccupancyRate.toFixed(1)}%
              </div>
              <small style={{ color: 'var(--text-muted)', fontSize: '0.75rem', display: 'block' }}>Historical avg</small>
            </div>
          </div>
          
          <div style={{ background: 'var(--bg-secondary)', padding: '0.85rem 1rem', borderRadius: '8px', border: '1px solid var(--border)', width: '100%', minWidth: 0, boxSizing: 'border-box' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.85rem', marginBottom: '0.4rem', gap: '0.5rem', minWidth: 0 }}>
              <span style={{ color: 'var(--text-muted)', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>Break-Even Occupancy:</span>
              <span style={{ fontWeight: 700, flexShrink: 0 }}>{stats.breakEvenOccupancyRate.toFixed(1)}%</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.85rem', gap: '0.5rem', minWidth: 0 }}>
              <span style={{ color: 'var(--text-muted)', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>Target Occupancy:</span>
              <span style={{ fontWeight: 700, flexShrink: 0 }}>{stats.requiredOccupancyRate.toFixed(1)}%</span>
            </div>
          </div>
        </div>

        {/* MONTHLY BREAK-EVEN TIMELINE CARD */}
        {stats.monthlyBreakdown && stats.monthlyBreakdown.length > 0 && (
          <div className="settings-card" style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', width: '100%', maxWidth: '100%', minWidth: 0, overflow: 'hidden', boxSizing: 'border-box' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.85rem', gap: '0.5rem', minWidth: 0 }}>
              <h3 style={{ fontSize: '1rem', fontWeight: 700, margin: 0, color: 'var(--text-main)', flexShrink: 0 }}>Monthly Performance</h3>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', whiteSpace: 'nowrap', flexShrink: 0 }}>
                {windowWidth <= 768 ? 'Swipe horizontally →' : 'Scroll horizontally →'}
              </span>
            </div>

            <div style={{ 
              overflowX: 'auto', 
              overflowY: 'hidden', 
              WebkitOverflowScrolling: 'touch', 
              paddingBottom: '0.5rem', 
              display: 'flex', 
              gap: '0.65rem', 
              maxWidth: '100%', 
              width: '100%', 
              minWidth: 0 
            }}>
              {stats.monthlyBreakdown.map((m, idx) => {
                let bgColor = 'rgba(245, 158, 11, 0.08)';
                let fgColor = '#d97706';
                let borderColor = 'rgba(245, 158, 11, 0.25)';
                let Icon = AlertCircle;
                
                if (m.status === 'achieved') {
                  bgColor = 'rgba(16, 185, 129, 0.08)';
                  fgColor = '#10b981';
                  borderColor = 'rgba(16, 185, 129, 0.25)';
                  Icon = CheckCircle2;
                } else if (m.status === 'on_track') {
                  bgColor = 'rgba(59, 130, 246, 0.08)';
                  fgColor = '#3b82f6';
                  borderColor = 'rgba(59, 130, 246, 0.25)';
                  Icon = Clock;
                }
                
                return (
                  <div 
                    key={idx} 
                    title={`Required: ₹${Math.ceil(stats.breakEvenMonthlyTarget).toLocaleString('en-IN')} Revenue or ${stats.breakEvenOccupancyRate.toFixed(1)}% Occupancy`} 
                    style={{ 
                      minWidth: windowWidth <= 480 ? '120px' : '130px',
                      flexShrink: 0,
                      padding: '0.75rem', 
                      borderRadius: '8px', 
                      background: bgColor,
                      color: fgColor,
                      border: `1px solid ${borderColor}`,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '0.35rem'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span style={{ fontSize: '0.75rem', fontWeight: 800, textTransform: 'uppercase' }}>{m.label}</span>
                      <Icon size={14} />
                    </div>
                    <div style={{ fontSize: '0.9rem', fontWeight: 800, color: 'var(--text-main)', fontVariantNumeric: 'tabular-nums' }}>
                      ₹{Math.ceil(m.revenue).toLocaleString('en-IN')}
                    </div>
                    {m.occupancyRate > 0 && (
                      <span style={{ fontSize: '0.725rem', fontWeight: 700, color: 'var(--text-muted)' }}>
                        {m.occupancyRate.toFixed(1)}% Occ
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

      </div>

      {/* SECTION 5: PROFITABILITY BREAKDOWN */}
      <div className="settings-card" style={{ padding: '1.25rem', width: '100%', minWidth: 0, boxSizing: 'border-box' }}>
        <h3 style={{ margin: '0 0 1rem 0', fontSize: '1rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-main)' }}>
          <Activity size={18} style={{ color: 'var(--primary)' }} /> Profitability Summary
        </h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem', fontSize: '0.875rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: 'var(--text-muted)' }}>Total Revenue</span>
            <span style={{ fontWeight: 700, color: '#10b981', fontVariantNumeric: 'tabular-nums' }}>+ ₹{stats.totalIncome.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: 'var(--text-muted)' }}>Total Expenses</span>
            <span style={{ fontWeight: 700, color: '#ef4444', fontVariantNumeric: 'tabular-nums' }}>- ₹{stats.totalOperatingExpenses.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.85rem 1rem', background: 'var(--bg-secondary)', borderRadius: '10px', border: '1px solid var(--border)', flexWrap: 'wrap', gap: '0.5rem' }}>
            <span style={{ fontWeight: 800, color: 'var(--text-main)' }}>Net Profit</span>
            <span style={{ fontWeight: 800, fontSize: '1.25rem', color: stats.netProfit >= 0 ? '#10b981' : '#ef4444', fontVariantNumeric: 'tabular-nums' }}>
              ₹{stats.netProfit.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>
        </div>
      </div>

    </div>
  );
};

// --- MAIN PAGE COMPONENT ---
export default function InvestmentHub() {
  const { activeResortId, profile, globalPlans, isDataLoaded } = useSettingsStore();
  const [view, setView] = useState('planner'); // Default to 'planner'
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [windowWidth, setWindowWidth] = useState(window.innerWidth);

  const [investmentData, setInvestmentData] = useState({
    total_investment: 1000000,
    monthly_operating_expenses: 50000,
    annual_fixed_expenses: 20000,
    target_roi_percentage: 12,
    expected_occupancy_rate: 60,
    total_rooms: 0,
    rental_model: 'room',
    property_ownership: 'leased',
    recovery_period_years: 1,
    lease_start_date: new Date().toLocaleDateString('en-CA'),
    lease_end_date: new Date(new Date().setFullYear(new Date().getFullYear() + 1)).toLocaleDateString('en-CA'),
    average_selling_price: ''
  });
  const [financials, setFinancials] = useState({ incomes: [], expenses: [], bookings: [] });
  const [propertyInfo, setPropertyInfo] = useState({ totalRooms: 0 });

  const [range, setRange] = useState({
    start: '2026-04-01',
    end: '2027-03-31'
  });

  useEffect(() => {
    const handleResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Evaluate entitlement parameters safely
  const isSuper = profile?.role === 'super_admin';
  const isPreview = typeof window !== 'undefined' && window.location.search.includes('preview=true');
  const userPlan = profile?.plan_type || 'free';
  const planData = globalPlans?.[userPlan] || {};
  const isEntitlementLoading = !isDataLoaded;
  const hasInvestmentAccess = isSuper
    || isPreview
    || planData.reports?.investment === true
    || profile?.feature_investment_enabled === true;

  // STRICT SEQUENCE: Data queries fire ONLY if entitlements are loaded AND access is granted
  useEffect(() => {
    if ((activeResortId || isPreview) && !isEntitlementLoading && hasInvestmentAccess) {
      fetchData();
      fetchPropertyStats();
    } else if (!activeResortId && isPreview) {
      setLoading(false);
    }
  }, [activeResortId, isEntitlementLoading, hasInvestmentAccess, isPreview]);

  const fetchData = async () => {
    try {
      setLoading(true);
      if (activeResortId) {
        const [inv, inc, exp, bkg] = await Promise.all([
          supabase.from('investments').select('*').eq('resort_id', activeResortId).maybeSingle(),
          supabase.from('incomes').select('*').eq('resort_id', activeResortId).gte('date', range.start).lte('date', range.end),
          supabase.from('expenses').select('*').eq('resort_id', activeResortId).gte('date', range.start).lte('date', range.end),
          supabase.from('bookings').select('check_in_date, check_out_date, total_amount, night_count, status, room_ids')
            .eq('resort_id', activeResortId)
            .gte('check_in_date', range.start)
            .lte('check_in_date', range.end)
        ]);

        if (inv.data) {
          setInvestmentData({
            ...inv.data,
            property_ownership: inv.data.property_ownership || 'leased',
            recovery_period_years: inv.data.recovery_period_years || 1,
            lease_start_date: inv.data.lease_start_date || new Date().toLocaleDateString('en-CA'),
            lease_end_date: inv.data.lease_end_date || new Date(new Date().setFullYear(new Date().getFullYear() + 1)).toLocaleDateString('en-CA'),
            average_selling_price: inv.data.average_selling_price || ''
          });
        }
        setFinancials({ incomes: inc.data || [], expenses: exp.data || [], bookings: bkg.data || [] });
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const fetchPropertyStats = async () => {
    if (!activeResortId) return;
    const { count } = await supabase.from('rooms').select('id', { count: 'exact' }).eq('resort_id', activeResortId);
    setPropertyInfo({ totalRooms: count || 0 });
    if (investmentData.total_rooms === 0) setInvestmentData(prev => ({ ...prev, total_rooms: count || 0 }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const { id, created_at, updated_at, ...dbPayload } = investmentData;
      
      if (dbPayload.average_selling_price === '') dbPayload.average_selling_price = null;
      if (dbPayload.lease_start_date === '') dbPayload.lease_start_date = null;
      if (dbPayload.lease_end_date === '') dbPayload.lease_end_date = null;

      const { error } = await supabase.from('investments').upsert({
        tenant_id: profile.id,
        resort_id: activeResortId,
        ...dbPayload,
        updated_at: new Date().toISOString()
      }, { onConflict: 'tenant_id,resort_id' });
      if (error) throw error;
      alert("Investment configuration saved!");
    } catch (err) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  };

  // 1. Loading entitlement state -> render spinner
  if (isEntitlementLoading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
        <Loader2 className="animate-spin" size={32} color="#10b981" />
        <p style={{ marginTop: '1rem', color: 'var(--text-muted)', fontWeight: 600 }}>Loading permissions...</p>
      </div>
    );
  }

  // 2. Entitlements loaded but access denied -> render upgrade screen
  if (!hasInvestmentAccess) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', padding: '3rem', textAlign: 'center' }}>
        <TrendingUp size={56} color="#cbd5e1" style={{ marginBottom: '1.5rem' }} />
        <h2 style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--text-main)', marginBottom: '0.75rem' }}>Investment & Performance Analysis</h2>
        <p style={{ color: 'var(--text-muted)', maxWidth: '380px', lineHeight: 1.6, marginBottom: '1.5rem' }}>
          Investment & Performance Analysis is available on the Growth and Stay Master plans.
          Upgrade to unlock property ROI tracking and investment performance tools.
        </p>
        <Link to="/subscription" style={{ display: 'inline-block', padding: '0.85rem 2rem', background: '#10b981', color: 'white', borderRadius: '10px', fontWeight: 700, textDecoration: 'none', fontSize: '1rem' }}>
          View Upgrade Options
        </Link>
      </div>
    );
  }

  if (loading) return <div style={{ padding: '2rem', color: 'var(--text-muted)' }}>Loading Analysis Hub...</div>;

  return (
    <div className="settings-container investment-container" style={{ maxWidth: '1400px', width: '100%', margin: '0 auto', paddingBottom: '3rem' }}>
      
      {/* PAGE HEADER */}
      <header style={{ marginBottom: '1.25rem' }}>
        <h1 className="settings-header-title">Investment & Performance Analysis</h1>
        <p className="settings-header-subtitle">
          Plan your investment and measure actual property performance.
        </p>
      </header>

      {/* PLANNER / PERFORMANCE NAVIGATION TABS */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.5rem' }}>
        <div className="settings-card" style={{ padding: '0.35rem', display: 'flex', gap: '0.35rem', width: windowWidth <= 480 ? '100%' : '320px' }}>
          <button 
            onClick={() => setView('planner')}
            style={{ 
              flex: 1,
              padding: '0.55rem 1rem', 
              borderRadius: '8px', 
              fontSize: '0.875rem', 
              fontWeight: 700,
              border: 'none',
              cursor: 'pointer',
              minHeight: '44px',
              background: view === 'planner' ? '#10b981' : 'transparent',
              color: view === 'planner' ? '#ffffff' : 'var(--text-muted)',
              transition: 'all 0.2s'
            }}
          >
            Planner
          </button>
          <button 
            onClick={() => setView('roi')}
            style={{ 
              flex: 1,
              padding: '0.55rem 1rem', 
              borderRadius: '8px', 
              fontSize: '0.875rem', 
              fontWeight: 700,
              border: 'none',
              cursor: 'pointer',
              minHeight: '44px',
              background: view === 'roi' ? '#10b981' : 'transparent',
              color: view === 'roi' ? '#ffffff' : 'var(--text-muted)',
              transition: 'all 0.2s'
            }}
          >
            Performance
          </button>
        </div>

        {/* Date Filter Badge (Only for Performance View) */}
        {view === 'roi' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'var(--bg-secondary)', padding: '0.45rem 1rem', borderRadius: '20px', border: '1px solid var(--border)' }}>
            <Calendar size={15} style={{ color: 'var(--primary)' }} />
            <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-main)', fontVariantNumeric: 'tabular-nums' }}>
              FY {range.start.split('-')[0]} - {range.end.split('-')[0]}
            </span>
          </div>
        )}
      </div>

      {/* CONDITIONAL VIEW RENDER */}
      {view === 'planner' ? (
        <PricePlanner 
          data={investmentData} 
          setData={setInvestmentData} 
          propertyInfo={propertyInfo} 
          saving={saving}
          onSave={handleSave}
          windowWidth={windowWidth}
        />
      ) : (
        <ROIPerformance 
          investmentData={investmentData} 
          financials={financials} 
          range={range}
          windowWidth={windowWidth}
        />
      )}
    </div>
  );
}
