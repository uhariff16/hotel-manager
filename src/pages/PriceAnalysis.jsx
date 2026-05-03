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
    <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
      <header style={{ marginBottom: '2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 style={{ marginBottom: '0.25rem', fontSize: '1.75rem' }}>Investment & Pricing</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>Based on {data.rental_model === 'property' ? 'Property' : `${totalUnits} Rooms`} ({data.expected_occupancy_rate}% goal).</p>
        </div>
        <button className="btn btn-primary" onClick={handleSave} disabled={saving} style={{ flex: '1 1 auto' }}>
          <Save size={18} /> {saving ? 'Saving...' : 'Save Configuration'}
        </button>
      </header>

      <div className="grid-2" style={{ gridTemplateColumns: '1fr 1.5fr', gap: '2rem' }}>
        {/* Left Col: Inputs */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          <section className="card">
            <h3 style={{ marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Calculator size={20} color="var(--primary)" /> Input Parameters
            </h3>

            <div className="form-group" style={{ marginBottom: '1.5rem' }}>
              <label className="form-label">Rental Model</label>
              <div className="grid-2" style={{ gap: '0.5rem', background: 'rgba(0,0,0,0.03)', padding: '0.25rem', borderRadius: '8px' }}>
                <button 
                  className={`btn ${data.rental_model === 'room' ? 'btn-primary' : 'btn-link'}`} 
                  style={{ fontSize: '0.8rem', padding: '0.5rem' }}
                  onClick={() => setData({...data, rental_model: 'room'})}
                >
                  Individual Rooms
                </button>
                <button 
                  className={`btn ${data.rental_model === 'property' ? 'btn-primary' : 'btn-link'}`} 
                  style={{ fontSize: '0.8rem', padding: '0.5rem' }}
                  onClick={() => setData({...data, rental_model: 'property'})}
                >
                  Entire Property
                </button>
              </div>
            </div>
            
            <div className="form-group" style={{ marginBottom: '1rem' }}>
              <label className="form-label">Annual Lease Amount / Investment (₹)</label>
              <div style={{ position: 'relative' }}>
              <div style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', fontWeight: 600 }}>₹</div>
                <input 
                  type="number" 
                  className="form-input" 
                  style={{ paddingLeft: '35px' }}
                  value={data.total_investment} 
                  onChange={e => setData({...data, total_investment: Number(e.target.value)})} 
                />
              </div>
              <small style={{ color: 'var(--text-muted)' }}>Annual lease cost or capital investment for this year</small>
            </div>

            <div className="form-group" style={{ marginBottom: '1rem' }}>
              <label className="form-label">Total Number of Rooms</label>
              <div style={{ position: 'relative' }}>
                <Home size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                <input 
                  type="number" 
                  className="form-input" 
                  style={{ paddingLeft: '35px' }}
                  value={data.total_rooms} 
                  onChange={e => setData({...data, total_rooms: Number(e.target.value)})} 
                />
              </div>
              <small style={{ color: 'var(--text-muted)' }}>Manual entry override for room count</small>
            </div>

            <div className="grid-2" style={{ gap: '1rem' }}>
              <div className="form-group">
                <label className="form-label">Monthly Operating (₹)</label>
                <input 
                  type="number" 
                  className="form-input" 
                  value={data.monthly_operating_expenses} 
                  onChange={e => setData({...data, monthly_operating_expenses: Number(e.target.value)})} 
                />
                <small style={{ fontSize: '0.7rem' }}>Staff, Electricity, Water</small>
              </div>
              <div className="form-group">
                <label className="form-label">Annual Fixed (₹)</label>
                <input 
                  type="number" 
                  className="form-input" 
                  value={data.annual_fixed_expenses} 
                  onChange={e => setData({...data, annual_fixed_expenses: Number(e.target.value)})} 
                />
                <small style={{ fontSize: '0.7rem' }}>Taxes, Insurance</small>
              </div>
            </div>

            <div className="grid-2" style={{ gap: '1rem', marginTop: '1rem' }}>
              <div className="form-group">
                <label className="form-label">Target Annual ROI (%)</label>
                <input 
                  type="number" 
                  className="form-input" 
                  value={data.target_roi_percentage} 
                  onChange={e => setData({...data, target_roi_percentage: Number(e.target.value)})} 
                />
              </div>
              <div className="form-group">
                <label className="form-label">Expected Occupancy (%)</label>
                <input 
                  type="number" 
                  className="form-input" 
                  value={data.expected_occupancy_rate} 
                  onChange={e => setData({...data, expected_occupancy_rate: Number(e.target.value)})} 
                />
              </div>
            </div>
          </section>

          <div className="alert alert-info" style={{ display: 'flex', gap: '1rem', padding: '1rem', borderRadius: '8px', background: 'rgba(59, 130, 246, 0.05)', border: '1px solid rgba(59, 130, 246, 0.2)' }}>
            <Info size={24} color="var(--primary)" style={{ flexShrink: 0 }} />
            <p style={{ fontSize: '0.85rem', margin: 0 }}>
              Calculations are based on <strong>{propertyInfo.totalRooms} rooms</strong> currently configured in your property management settings.
            </p>
          </div>
        </div>

        {/* Right Col: Results */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          <div className="card" style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)' }}>
            <h3 style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <TrendingUp size={20} color="var(--success)" /> Financial Projections
            </h3>

            <div className="grid-2" style={{ gap: '1.5rem' }}>
              <div style={{ padding: '1.25rem', background: 'var(--bg-color)', borderRadius: '12px', border: '1px solid var(--border)' }}>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginBottom: '0.5rem' }}>Break-even Rate ({data.rental_model === 'property' ? 'Full Property' : 'Per Room'})</p>
                <h2 style={{ color: 'var(--warning)', margin: 0 }}>₹{Math.ceil(breakEvenDailyRatePerRoom).toLocaleString()}</h2>
                <small style={{ color: 'var(--text-muted)' }}>To cover all operating + lease costs</small>
              </div>
              <div style={{ padding: '1.25rem', background: 'var(--primary)', borderRadius: '12px', color: 'white', boxShadow: '0 10px 15px -3px rgba(59, 130, 246, 0.4)' }}>
                <p style={{ opacity: 0.8, fontSize: '0.875rem', marginBottom: '0.5rem' }}>Suggested Rate ({data.rental_model === 'property' ? 'Full Property' : 'Per Room'})</p>
                <h2 style={{ margin: 0 }}>₹{Math.ceil(suggestedDailyRatePerRoom).toLocaleString()}</h2>
                <small style={{ opacity: 0.8 }}>To reach target profit at {data.expected_occupancy_rate}% occupancy</small>
              </div>
            </div>

            <div className="grid-2" style={{ marginTop: '1.5rem', gap: '1rem' }}>
              <div style={{ padding: '1rem', background: 'rgba(59, 130, 246, 0.05)', borderRadius: '12px', border: '1px solid rgba(59, 130, 246, 0.1)' }}>
                <p style={{ color: 'var(--primary)', fontSize: '0.75rem', margin: '0 0 0.5rem 0', fontWeight: 600, textTransform: 'uppercase' }}>Yearly Average Goal</p>
                <h3 style={{ margin: 0 }}>₹{Math.ceil(requiredGrossAnnualRevenue / 365).toLocaleString()} <span style={{ fontSize: '0.8rem', fontWeight: 400 }}>/day</span></h3>
                <small style={{ color: 'var(--text-muted)', fontSize: '0.7rem' }}>Avg revenue needed every day of the year</small>
              </div>
              <div style={{ padding: '1rem', background: 'rgba(16, 185, 129, 0.05)', borderRadius: '12px', border: '1px solid rgba(16, 185, 129, 0.1)' }}>
                <p style={{ color: 'var(--success)', fontSize: '0.75rem', margin: '0 0 0.5rem 0', fontWeight: 600, textTransform: 'uppercase' }}>Active Day Target</p>
                <h3 style={{ margin: 0 }}>₹{Math.ceil(suggestedDailyRatePerRoom * (data.rental_model === 'property' ? 1 : totalUnits)).toLocaleString()} <span style={{ fontSize: '0.8rem', fontWeight: 400 }}>/day</span></h3>
                <small style={{ color: 'var(--text-muted)', fontSize: '0.7rem' }}>Required revenue on days you have guests</small>
              </div>
            </div>

            <div style={{ marginTop: '2rem' }}>
              <h4 style={{ marginBottom: '1rem', fontSize: '1rem' }}>Annual Summary</h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.75rem', borderBottom: '1px solid var(--border)' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Operating & Fixed Expenses</span>
                  <span style={{ fontWeight: 600 }}>₹{(annualOperatingExpense + annualTotalFixed).toLocaleString()}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.75rem', borderBottom: '1px solid var(--border)' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Annual Lease Recovery</span>
                  <span style={{ fontWeight: 600 }}>₹{leaseInvestment.toLocaleString()}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.75rem', borderBottom: '1px solid var(--border)' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Target Net Profit ({data.target_roi_percentage}% ROI)</span>
                  <span style={{ fontWeight: 600, color: 'var(--success)' }}>+ ₹{targetAnnualNetProfit.toLocaleString()}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '1rem', background: 'rgba(0,0,0,0.03)', borderRadius: '4px' }}>
                  <span style={{ fontWeight: 700 }}>Required Annual Revenue</span>
                  <span style={{ fontWeight: 700, fontSize: '1.1rem' }}>₹{requiredGrossAnnualRevenue.toLocaleString()}</span>
                </div>
              </div>
            </div>
          </div>

          <div className="card" style={{ background: 'rgba(16, 185, 129, 0.03)', borderColor: 'rgba(16, 185, 129, 0.2)' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '1rem' }}>
              <div style={{ background: 'rgba(16, 185, 129, 0.1)', padding: '0.75rem', borderRadius: '12px' }}>
                <PieChart size={24} color="var(--success)" />
              </div>
              <div style={{ flex: 1 }}>
                <h4 style={{ margin: '0 0 1rem 0' }}>Efficiency Metrics</h4>
                <div className="grid-2" style={{ gap: '1rem' }}>
                  <div>
                    <small style={{ color: 'var(--text-muted)', display: 'block' }}>Annual {data.rental_model === 'property' ? 'Property' : 'Room'} Nights Available</small>
                    <span style={{ fontWeight: 600 }}>{totalAvailableNights} nights</span>
                  </div>
                  <div>
                    <small style={{ color: 'var(--text-muted)', display: 'block' }}>Target {data.rental_model === 'property' ? 'Property' : 'Room'} Sales</small>
                    <span style={{ fontWeight: 600 }}>{Math.floor(sellableRoomNights)} nights</span>
                  </div>
                </div>
                <div style={{ marginTop: '1.5rem', paddingTop: '1rem', borderTop: '1px solid rgba(16, 185, 129, 0.2)' }}>
                   <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <small style={{ color: 'var(--text-muted)' }}>Break-even Occupancy</small>
                      <span style={{ fontWeight: 700, color: 'var(--success)', fontSize: '1.1rem' }}>{Math.ceil(breakEvenOccupancyPercent)}%</span>
                   </div>
                   <div style={{ height: '8px', background: 'rgba(16, 185, 129, 0.1)', borderRadius: '4px', marginTop: '0.5rem', overflow: 'hidden' }}>
                      <div style={{ width: `${Math.min(100, breakEvenOccupancyPercent)}%`, height: '100%', background: 'var(--success)' }}></div>
                   </div>
                   <small style={{ display: 'block', marginTop: '0.5rem', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                      You need to sell {Math.ceil(breakEvenNightsNeeded)} nights annually at your suggested rate to cover all costs.
                   </small>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="card" style={{ marginTop: '2rem', borderLeft: '4px solid var(--warning)' }}>
        <div style={{ display: 'flex', gap: '1rem' }}>
          <AlertCircle color="var(--warning)" size={20} />
          <div>
            <h4 style={{ margin: 0 }}>Analysis Disclaimer</h4>
            <p style={{ margin: '0.5rem 0 0 0', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
              This calculator provides estimates based on averaged inputs. Market demand, seasonality, and competitor pricing are not factored into these suggestions. Use these rates as a baseline strategy for long-term sustainability.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
