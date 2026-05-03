import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useSettingsStore } from '../lib/store';
import { TrendingUp, DollarSign, Calculator, PieChart, Home, ArrowRight, Save, Info, AlertCircle } from 'lucide-react';

export default function PriceAnalysis() {
  const { activeResortId, profile } = useSettingsStore();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [data, setData] = useState({
    total_investment: 1000000,
    monthly_operating_expenses: 50000,
    annual_fixed_expenses: 20000,
    target_roi_percentage: 12,
    expected_occupancy_rate: 60,
    total_rooms: 0,
    rental_model: 'room' // 'room' or 'property'
  });

  const [propertyInfo, setPropertyInfo] = useState({
    totalRooms: 0,
    resortName: ''
  });

  useEffect(() => {
    if (activeResortId) {
      fetchAnalysisData();
      fetchPropertyStats();
    }
  }, [activeResortId]);

  const fetchAnalysisData = async () => {
    try {
      const { data: inv, error } = await supabase
        .from('investments')
        .select('*')
        .eq('resort_id', activeResortId)
        .maybeSingle();
      
      if (inv) {
        setData({
          total_investment: Number(inv.total_investment),
          monthly_operating_expenses: Number(inv.monthly_operating_expenses),
          annual_fixed_expenses: Number(inv.annual_fixed_expenses),
          target_roi_percentage: Number(inv.target_roi_percentage),
          expected_occupancy_rate: Number(inv.expected_occupancy_rate),
          total_rooms: Number(inv.total_rooms || 0),
          rental_model: inv.rental_model || 'room'
        });
      }
    } catch (err) {
      console.error("Error fetching analysis data:", err);
    } finally {
      setLoading(false);
    }
  };

  const fetchPropertyStats = async () => {
    try {
      const [resortRes, roomsRes] = await Promise.all([
        supabase.from('resorts').select('name').eq('id', activeResortId).single(),
        supabase.from('rooms').select('id', { count: 'exact' }).eq('resort_id', activeResortId)
      ]);
      
      setPropertyInfo({
        totalRooms: roomsRes.count || 0,
        resortName: resortRes.data?.name || ''
      });
      // Set default total_rooms if not already set by fetched data
      setData(prev => {
        if (prev.total_rooms === 0) return { ...prev, total_rooms: roomsRes.count || 0 };
        return prev;
      });
    } catch (err) {
      console.error("Error fetching property stats:", err);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from('investments')
        .upsert({
          tenant_id: profile.id,
          resort_id: activeResortId,
          ...data,
          updated_at: new Date().toISOString()
        }, { onConflict: 'tenant_id,resort_id' });

      if (error) throw error;
      alert("Analysis data saved successfully!");
    } catch (err) {
      alert("Failed to save: " + err.message);
    } finally {
      setSaving(false);
    }
  };

  // Calculations
  const annualOperatingExpense = data.monthly_operating_expenses * 12;
  const annualTotalFixed = Number(data.annual_fixed_expenses);
  const leaseInvestment = Number(data.total_investment);
  
  // Total cost to recover = OpExp + Fixed + Lease (since non-refundable)
  const totalAnnualCost = annualOperatingExpense + annualTotalFixed + leaseInvestment;
  const targetAnnualNetProfit = leaseInvestment * (data.target_roi_percentage / 100);
  const requiredGrossAnnualRevenue = totalAnnualCost + targetAnnualNetProfit;
  
  const totalUnits = data.rental_model === 'property' ? 1 : (data.total_rooms || propertyInfo.totalRooms || 1); 
  const totalAvailableNights = totalUnits * 365;
  const sellableRoomNights = totalAvailableNights * (data.expected_occupancy_rate / 100);
  
  const breakEvenDailyRatePerRoom = sellableRoomNights > 0 ? totalAnnualCost / sellableRoomNights : 0;
  const suggestedDailyRatePerRoom = sellableRoomNights > 0 ? requiredGrossAnnualRevenue / sellableRoomNights : 0;

  // Break-even Occupancy: At suggested rate, how many nights must be sold to cover costs?
  const breakEvenNightsNeeded = suggestedDailyRatePerRoom > 0 ? totalAnnualCost / suggestedDailyRatePerRoom : 0;
  const breakEvenOccupancyPercent = totalAvailableNights > 0 ? (breakEvenNightsNeeded / totalAvailableNights) * 100 : 0;

  if (loading) return <div style={{ padding: '2rem' }}>Loading Pricing Engine...</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Page Header */}
      <div className="card" style={{ padding: '1rem 1.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <Calculator size={32} color="var(--primary)" />
            <div>
              <h2 style={{ margin: 0, fontSize: '1.5rem' }}>Price & Investment Analysis</h2>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', margin: 0 }}>
                {data.rental_model === 'property' ? 'Property Model' : `${totalUnits} Units Model`} • {data.expected_occupancy_rate}% Occupancy Goal
              </p>
            </div>
          </div>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Save size={18} /> {saving ? 'Saving...' : 'Save Configuration'}
          </button>
        </div>
      </div>

      <div className="analysis-layout" style={{ display: 'grid', gridTemplateColumns: '1fr 1.2fr', gap: '2rem', alignItems: 'start' }}>
        {/* Left Column: Input sidebar */}
        <aside style={{ position: 'sticky', top: '2rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          <section className="card" style={{ height: '100%' }}>
            <h3 style={{ fontSize: '1.1rem', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem', borderBottom: '1px solid var(--border)', paddingBottom: '0.75rem' }}>
              <Calculator size={18} color="var(--primary)" /> Input Parameters
            </h3>

            <div className="form-group" style={{ marginBottom: '1.5rem' }}>
              <label className="form-label" style={{ fontSize: '0.8rem' }}>Rental Model</label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', background: 'var(--bg-color)', padding: '0.35rem', borderRadius: '10px', border: '1px solid var(--border)' }}>
                <button 
                  className={`btn ${data.rental_model === 'room' ? 'btn-primary' : 'btn-link'}`} 
                  style={{ fontSize: '0.75rem', padding: '0.5rem', borderRadius: '8px' }}
                  onClick={() => setData({...data, rental_model: 'room'})}
                >
                  Rooms
                </button>
                <button 
                  className={`btn ${data.rental_model === 'property' ? 'btn-primary' : 'btn-link'}`} 
                  style={{ fontSize: '0.75rem', padding: '0.5rem', borderRadius: '8px' }}
                  onClick={() => setData({...data, rental_model: 'property'})}
                >
                  Property
                </button>
              </div>
            </div>
            
            <div className="form-group" style={{ marginBottom: '1.25rem' }}>
              <label className="form-label" style={{ fontSize: '0.8rem' }}>Annual Investment (₹)</label>
              <div style={{ position: 'relative' }}>
                <div style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', fontWeight: 600 }}>₹</div>
                <input type="number" className="form-input" style={{ paddingLeft: '35px' }} value={data.total_investment} onChange={e => setData({...data, total_investment: Number(e.target.value)})} />
              </div>
              <small style={{ color: 'var(--text-muted)', fontSize: '0.7rem' }}>Annual lease or capital cost</small>
            </div>

            <div className="form-group" style={{ marginBottom: '1.25rem' }}>
              <label className="form-label" style={{ fontSize: '0.8rem' }}>Unit Count Override</label>
              <div style={{ position: 'relative' }}>
                <Home size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                <input type="number" className="form-input" style={{ paddingLeft: '35px' }} value={data.total_rooms} onChange={e => setData({...data, total_rooms: Number(e.target.value)})} />
              </div>
              <small style={{ color: 'var(--text-muted)', fontSize: '0.7rem' }}>Defaults to {propertyInfo.totalRooms} rooms</small>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.25rem' }}>
              <div className="form-group">
                <label className="form-label" style={{ fontSize: '0.8rem' }}>Monthly OpExp</label>
                <input type="number" className="form-input" value={data.monthly_operating_expenses} onChange={e => setData({...data, monthly_operating_expenses: Number(e.target.value)})} />
              </div>
              <div className="form-group">
                <label className="form-label" style={{ fontSize: '0.8rem' }}>Annual Fixed</label>
                <input type="number" className="form-input" value={data.annual_fixed_expenses} onChange={e => setData({...data, annual_fixed_expenses: Number(e.target.value)})} />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div className="form-group">
                <label className="form-label" style={{ fontSize: '0.8rem' }}>Target ROI (%)</label>
                <input type="number" className="form-input" value={data.target_roi_percentage} onChange={e => setData({...data, target_roi_percentage: Number(e.target.value)})} />
              </div>
              <div className="form-group">
                <label className="form-label" style={{ fontSize: '0.8rem' }}>Occupancy Goal</label>
                <input type="number" className="form-input" value={data.expected_occupancy_rate} onChange={e => setData({...data, expected_occupancy_rate: Number(e.target.value)})} />
              </div>
            </div>
          </section>

          <div style={{ padding: '1.25rem', background: 'rgba(59, 130, 246, 0.03)', borderRadius: '16px', border: '1px solid rgba(59, 130, 246, 0.1)', display: 'flex', gap: '0.75rem' }}>
            <Info size={18} color="var(--primary)" style={{ flexShrink: 0 }} />
            <p style={{ fontSize: '0.75rem', margin: 0, color: 'var(--text-muted)' }}>
              Pricing suggestions are calculated dynamically based on your expenses and desired profit margin.
            </p>
          </div>
        </aside>

        {/* Right Column: Projections */}
        <main style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          <div className="card">
            <h3 style={{ marginBottom: '1.5rem', fontSize: '1.2rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <TrendingUp size={20} color="var(--success)" /> Financial Projections
            </h3>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
              <div style={{ padding: '1.5rem', background: 'var(--bg-color)', borderRadius: '16px', border: '1px solid var(--border)', textAlign: 'center' }}>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '0.5rem', textTransform: 'uppercase', fontWeight: 600 }}>Break-even Rate</p>
                <h2 style={{ color: 'var(--warning)', margin: 0, fontSize: '2rem' }}>₹{Math.ceil(breakEvenDailyRatePerRoom).toLocaleString()}</h2>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.75rem', marginTop: '0.5rem' }}>{data.rental_model === 'property' ? 'Per Day' : 'Per Room/Day'}</p>
              </div>
              <div style={{ padding: '1.5rem', background: 'linear-gradient(135deg, var(--primary) 0%, #1e40af 100%)', borderRadius: '16px', color: 'white', textAlign: 'center', boxShadow: '0 10px 15px -3px rgba(59, 130, 246, 0.3)' }}>
                <p style={{ opacity: 0.9, fontSize: '0.85rem', marginBottom: '0.5rem', textTransform: 'uppercase', fontWeight: 600 }}>Suggested Rate</p>
                <h2 style={{ margin: 0, fontSize: '2rem' }}>₹{Math.ceil(suggestedDailyRatePerRoom).toLocaleString()}</h2>
                <p style={{ opacity: 0.9, fontSize: '0.75rem', marginTop: '0.5rem' }}>Target profit at {data.expected_occupancy_rate}% occupancy</p>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', marginTop: '2rem' }}>
              <div style={{ padding: '1.25rem', background: 'rgba(59, 130, 246, 0.05)', borderRadius: '12px', border: '1px solid rgba(59, 130, 246, 0.1)' }}>
                <p style={{ color: 'var(--primary)', fontSize: '0.75rem', margin: '0 0 0.5rem 0', fontWeight: 700, textTransform: 'uppercase' }}>Daily Revenue Goal</p>
                <h3 style={{ margin: 0 }}>₹{Math.ceil(requiredGrossAnnualRevenue / 365).toLocaleString()} <span style={{ fontSize: '0.8rem', fontWeight: 400 }}>/day</span></h3>
                <small style={{ color: 'var(--text-muted)', fontSize: '0.7rem' }}>Averaged over 365 days</small>
              </div>
              <div style={{ padding: '1.25rem', background: 'rgba(16, 185, 129, 0.05)', borderRadius: '12px', border: '1px solid rgba(16, 185, 129, 0.1)' }}>
                <p style={{ color: 'var(--success)', fontSize: '0.75rem', margin: '0 0 0.5rem 0', fontWeight: 700, textTransform: 'uppercase' }}>Active Day Goal</p>
                <h3 style={{ margin: 0 }}>₹{Math.ceil(suggestedDailyRatePerRoom * (data.rental_model === 'property' ? 1 : totalUnits)).toLocaleString()} <span style={{ fontSize: '0.8rem', fontWeight: 400 }}>/day</span></h3>
                <small style={{ color: 'var(--text-muted)', fontSize: '0.7rem' }}>When occupied at suggested rate</small>
              </div>
            </div>

            <div style={{ marginTop: '2.5rem', background: 'var(--bg-color)', padding: '1.5rem', borderRadius: '16px', border: '1px solid var(--border)' }}>
              <h4 style={{ marginBottom: '1.25rem', fontSize: '1rem', borderBottom: '1px solid var(--border)', paddingBottom: '0.75rem' }}>Annual Financial Summary</h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>Operating & Fixed Expenses</span>
                  <span style={{ fontWeight: 600 }}>₹{(annualOperatingExpense + annualTotalFixed).toLocaleString()}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>Annual Lease/Investment Recovery</span>
                  <span style={{ fontWeight: 600 }}>₹{leaseInvestment.toLocaleString()}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>Target Net Profit ({data.target_roi_percentage}% ROI)</span>
                  <span style={{ fontWeight: 600, color: 'var(--success)' }}>+ ₹{targetAnnualNetProfit.toLocaleString()}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.5rem', padding: '1.25rem', background: 'rgba(0,0,0,0.03)', borderRadius: '12px' }}>
                  <span style={{ fontWeight: 700, fontSize: '1rem' }}>Required Annual Gross Revenue</span>
                  <span style={{ fontWeight: 800, fontSize: '1.35rem', color: 'var(--primary)' }}>₹{requiredGrossAnnualRevenue.toLocaleString()}</span>
                </div>
              </div>
            </div>
          </div>

          <div className="card" style={{ background: 'rgba(16, 185, 129, 0.03)', borderColor: 'rgba(16, 185, 129, 0.2)' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '1.25rem' }}>
              <div style={{ background: 'rgba(16, 185, 129, 0.1)', padding: '1rem', borderRadius: '16px' }}>
                <PieChart size={32} color="var(--success)" />
              </div>
              <div style={{ flex: 1 }}>
                <h4 style={{ margin: '0 0 1.25rem 0', fontSize: '1.1rem' }}>Efficiency & Occupancy Metrics</h4>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
                  <div>
                    <small style={{ color: 'var(--text-muted)', display: 'block', marginBottom: '0.25rem' }}>Total Capacity</small>
                    <span style={{ fontWeight: 700, fontSize: '1.1rem' }}>{totalAvailableNights} <span style={{ fontWeight: 400, fontSize: '0.8rem' }}>nights/year</span></span>
                  </div>
                  <div>
                    <small style={{ color: 'var(--text-muted)', display: 'block', marginBottom: '0.25rem' }}>Target Sales</small>
                    <span style={{ fontWeight: 700, fontSize: '1.1rem' }}>{Math.floor(sellableRoomNights)} <span style={{ fontWeight: 400, fontSize: '0.8rem' }}>nights/year</span></span>
                  </div>
                </div>
                <div style={{ marginTop: '2rem', paddingTop: '1.5rem', borderTop: '1px dotted rgba(16, 185, 129, 0.3)' }}>
                   <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                      <span style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>Break-even Occupancy Goal</span>
                      <span style={{ fontWeight: 800, color: 'var(--success)', fontSize: '1.5rem' }}>{Math.ceil(breakEvenOccupancyPercent)}%</span>
                   </div>
                   <div style={{ height: '12px', background: 'rgba(16, 185, 129, 0.1)', borderRadius: '6px', overflow: 'hidden' }}>
                      <div style={{ width: `${Math.min(100, breakEvenOccupancyPercent)}%`, height: '100%', background: 'var(--success)', borderRadius: '6px' }}></div>
                   </div>
                   <p style={{ marginTop: '1rem', fontSize: '0.8rem', color: 'var(--text-muted)', lineHeight: '1.5' }}>
                      To sustain this model and cover all costs, you must sell a minimum of <strong>{Math.ceil(breakEvenNightsNeeded)} nights</strong> annually across your units at the suggested rate.
                   </p>
                </div>
              </div>
            </div>
          </div>

          <div className="card" style={{ borderLeft: '4px solid var(--warning)', background: 'var(--bg-color)' }}>
            <div style={{ display: 'flex', gap: '1rem' }}>
              <AlertCircle color="var(--warning)" size={24} style={{ flexShrink: 0 }} />
              <div>
                <h4 style={{ margin: 0, fontSize: '1rem' }}>Analysis Disclaimer</h4>
                <p style={{ margin: '0.5rem 0 0 0', fontSize: '0.85rem', color: 'var(--text-muted)', lineHeight: '1.6' }}>
                  These calculations provide a baseline for financial sustainability. Market dynamics, competitor pricing, and seasonal demand should be considered when setting final rates.
                </p>
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
