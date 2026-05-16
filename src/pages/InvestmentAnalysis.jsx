import React, { useState, useEffect, useMemo } from 'react';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { useSettingsStore } from '../lib/store';
import { 
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
  Calculator,
  LayoutDashboard,
  Save,
  Home,
  Info
} from 'lucide-react';
import { format } from 'date-fns';

// --- SUB-COMPONENT: PRICE ANALYSIS (PLANNER) ---
const PricePlanner = ({ data, setData, propertyInfo, saving, onSave }) => {
  const annualOperatingExpense = data.monthly_operating_expenses * 12;
  const annualTotalFixed = Number(data.annual_fixed_expenses);
  const leaseInvestment = Number(data.total_investment);
  
  const totalAnnualCost = annualOperatingExpense + annualTotalFixed + leaseInvestment;
  const targetAnnualNetProfit = leaseInvestment * (data.target_roi_percentage / 100);
  const requiredGrossAnnualRevenue = totalAnnualCost + targetAnnualNetProfit;
  
  const totalUnits = data.rental_model === 'property' ? 1 : (data.total_rooms || propertyInfo.totalRooms || 1); 
  const totalAvailableNights = totalUnits * 365;
  const sellableRoomNights = totalAvailableNights * (data.expected_occupancy_rate / 100);
  
  const breakEvenDailyRatePerRoom = sellableRoomNights > 0 ? totalAnnualCost / sellableRoomNights : 0;
  const suggestedDailyRatePerRoom = sellableRoomNights > 0 ? requiredGrossAnnualRevenue / sellableRoomNights : 0;

  const breakEvenNightsNeeded = suggestedDailyRatePerRoom > 0 ? totalAnnualCost / suggestedDailyRatePerRoom : 0;
  const breakEvenOccupancyPercent = totalAvailableNights > 0 ? (breakEvenNightsNeeded / totalAvailableNights) * 100 : 0;

  return (
    <div className="analysis-layout" style={{ display: 'grid', gridTemplateColumns: '1fr 1.5fr', gap: '2rem', alignItems: 'start' }}>
      <aside style={{ position: 'sticky', top: '1rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        <section className="card">
          <h3 style={{ fontSize: '1.1rem', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem', borderBottom: '1px solid var(--border)', paddingBottom: '0.75rem' }}>
            <Calculator size={18} color="var(--primary)" /> Input Parameters
          </h3>
          <div className="form-group" style={{ marginBottom: '1.5rem' }}>
            <label className="form-label" style={{ fontSize: '0.8rem' }}>Rental Model</label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', background: 'var(--bg-color)', padding: '0.35rem', borderRadius: '10px', border: '1px solid var(--border)' }}>
              <button className={`btn ${data.rental_model === 'room' ? 'btn-primary' : 'btn-link'}`} style={{ fontSize: '0.75rem', padding: '0.5rem', borderRadius: '8px' }} onClick={() => setData({...data, rental_model: 'room'})}>Rooms</button>
              <button className={`btn ${data.rental_model === 'property' ? 'btn-primary' : 'btn-link'}`} style={{ fontSize: '0.75rem', padding: '0.5rem', borderRadius: '8px' }} onClick={() => setData({...data, rental_model: 'property'})}>Property</button>
            </div>
          </div>
          <div className="form-group" style={{ marginBottom: '1.25rem' }}>
            <label className="form-label" style={{ fontSize: '0.8rem' }}>Annual Investment/Lease (₹)</label>
            <div style={{ position: 'relative' }}>
              <div style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', fontWeight: 600 }}>₹</div>
              <input type="number" className="form-input" style={{ paddingLeft: '35px' }} value={data.total_investment} onChange={e => setData({...data, total_investment: Number(e.target.value)})} />
            </div>
          </div>
          <div className="form-group" style={{ marginBottom: '1.25rem' }}>
            <label className="form-label" style={{ fontSize: '0.8rem' }}>Unit Count</label>
            <input type="number" className="form-input" value={data.total_rooms} onChange={e => setData({...data, total_rooms: Number(e.target.value)})} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.25rem' }}>
            <div className="form-group"><label className="form-label" style={{ fontSize: '0.8rem' }}>Monthly OpExp</label><input type="number" className="form-input" value={data.monthly_operating_expenses} onChange={e => setData({...data, monthly_operating_expenses: Number(e.target.value)})} /></div>
            <div className="form-group"><label className="form-label" style={{ fontSize: '0.8rem' }}>Annual Fixed</label><input type="number" className="form-input" value={data.annual_fixed_expenses} onChange={e => setData({...data, annual_fixed_expenses: Number(e.target.value)})} /></div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div className="form-group"><label className="form-label" style={{ fontSize: '0.8rem' }}>Target ROI (%)</label><input type="number" className="form-input" value={data.target_roi_percentage} onChange={e => setData({...data, target_roi_percentage: Number(e.target.value)})} /></div>
            <div className="form-group"><label className="form-label" style={{ fontSize: '0.8rem' }}>Occupancy Goal (%)</label><input type="number" className="form-input" value={data.expected_occupancy_rate} onChange={e => setData({...data, expected_occupancy_rate: Number(e.target.value)})} /></div>
          </div>
          <button className="btn btn-primary" style={{ width: '100%', marginTop: '1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }} onClick={onSave} disabled={saving}><Save size={18}/> {saving ? 'Saving...' : 'Save Configuration'}</button>
        </section>
      </aside>

      <main style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        <div className="card">
          <h3 style={{ marginBottom: '1.5rem', fontSize: '1.2rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}><TrendingUp size={20} color="var(--success)" /> Strategy Projections</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
            <div style={{ padding: '1.5rem', background: 'var(--bg-color)', borderRadius: '16px', border: '1px solid var(--border)', textAlign: 'center' }}>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '0.5rem', textTransform: 'uppercase', fontWeight: 700 }}>Break-even Rate</p>
              <h2 style={{ color: 'var(--warning)', margin: 0, fontSize: '2rem' }}>₹{Math.ceil(breakEvenDailyRatePerRoom).toLocaleString()}</h2>
            </div>
            <div style={{ padding: '1.5rem', background: 'linear-gradient(135deg, var(--primary) 0%, #1e40af 100%)', borderRadius: '16px', color: 'white', textAlign: 'center' }}>
              <p style={{ opacity: 0.9, fontSize: '0.85rem', marginBottom: '0.5rem', textTransform: 'uppercase', fontWeight: 700 }}>Suggested Rate</p>
              <h2 style={{ margin: 0, fontSize: '2rem' }}>₹{Math.ceil(suggestedDailyRatePerRoom).toLocaleString()}</h2>
            </div>
          </div>
          <div style={{ marginTop: '2rem', background: 'var(--bg-color)', padding: '1.5rem', borderRadius: '16px', border: '1px solid var(--border)' }}>
            <h4 style={{ marginBottom: '1.25rem', fontSize: '1rem', borderBottom: '1px solid var(--border)', paddingBottom: '0.75rem' }}>Annual Summary</h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Total Operational & Fixed Costs</span><span style={{ fontWeight: 600 }}>₹{(annualOperatingExpense + annualTotalFixed).toLocaleString()}</span></div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Lease/Investment Recovery</span><span style={{ fontWeight: 600 }}>₹{leaseInvestment.toLocaleString()}</span></div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Target Net Profit ({data.target_roi_percentage}% ROI)</span><span style={{ fontWeight: 600, color: 'var(--success)' }}>+ ₹{targetAnnualNetProfit.toLocaleString()}</span></div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '1rem', background: 'rgba(0,0,0,0.03)', borderRadius: '12px' }}><span style={{ fontWeight: 800 }}>Required Gross Revenue</span><span style={{ fontWeight: 900, color: 'var(--primary)', fontSize: '1.25rem' }}>₹{requiredGrossAnnualRevenue.toLocaleString()}</span></div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

// --- SUB-COMPONENT: ROI ANALYSIS (PERFORMANCE) ---
const ROIPerformance = ({ investmentData, financials, range }) => {
  const stats = useMemo(() => {
    const totalIncome = financials.incomes.reduce((sum, i) => sum + Number(i.amount), 0);
    const totalOperatingExpenses = financials.expenses.reduce((sum, e) => sum + Number(e.amount), 0);
    const capitalOutlay = Number(investmentData?.total_investment || 0);
    const targetROIPercent = Number(investmentData?.target_roi_percentage || 0);
    
    const start = new Date(range.start);
    const end = new Date(range.end);
    const monthsElapsed = (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth()) + 1;
    
    const totalExpenses = totalOperatingExpenses;
    const netProfit = totalIncome - totalExpenses;
    const actualROI = capitalOutlay > 0 ? (netProfit / capitalOutlay) * 100 : 0;
    
    const targetAnnualProfit = capitalOutlay * (targetROIPercent / 100);
    const targetPeriodProfit = (targetAnnualProfit / 12) * monthsElapsed;
    const monthlyAverageProfit = netProfit / monthsElapsed;
    const yearsToPayback = monthlyAverageProfit > 0 ? (capitalOutlay / (monthlyAverageProfit * 12)) : 0;

    const today = new Date();
    
    // Actual months elapsed from start of range to today (capped at range end)
    const effectiveToday = today > end ? end : (today < start ? start : today);
    const actualMonthsElapsed = (effectiveToday.getFullYear() - start.getFullYear()) * 12 + (effectiveToday.getMonth() - start.getMonth()) + 1;

    const monthlyCapitalRecoveryGoal = capitalOutlay / 12;
    const monthlyROIGoal = (capitalOutlay * (targetROIPercent / 100)) / 12;
    
    // Use actual elapsed months for average expense to show true "Run Rate"
    const averageMonthlyExpense = totalOperatingExpenses / actualMonthsElapsed;
    
    // Revenue Goal = Recovery + ROI + Current Run Rate Expenses
    const totalMonthlyRevenueTarget = monthlyCapitalRecoveryGoal + monthlyROIGoal + averageMonthlyExpense;

    // Calculate the suggested rate for sales targeting
    const annualOperatingExpense = Number(investmentData?.monthly_operating_expenses || 0) * 12;
    const annualTotalFixed = Number(investmentData?.annual_fixed_expenses || 0);
    const leaseInvestment = Number(investmentData?.total_investment || 0);
    const totalAnnualCost = annualOperatingExpense + annualTotalFixed + leaseInvestment;
    const targetAnnualNetProfit = leaseInvestment * (targetROIPercent / 100);
    const requiredGrossAnnualRevenue = totalAnnualCost + targetAnnualNetProfit;
    const totalUnits = investmentData?.rental_model === 'property' ? 1 : (investmentData?.total_rooms || 1); 
    const sellableRoomNights = (totalUnits * 365) * (Number(investmentData?.expected_occupancy_rate || 60) / 100);
    const suggestedRate = sellableRoomNights > 0 ? requiredGrossAnnualRevenue / sellableRoomNights : 0;

    return {
      totalIncome, totalOperatingExpenses, netProfit, actualROI, capitalOutlay, 
      targetROIPercent, targetPeriodProfit, monthlyAverageProfit, yearsToPayback,
      monthlyCapitalRecoveryGoal, monthlyROIGoal, 
      averageMonthlyExpense, totalMonthlyRevenueTarget, actualMonthsElapsed,
      suggestedRate,
      performanceRatio: targetPeriodProfit > 0 ? (netProfit / targetPeriodProfit) * 100 : 0
    };
  }, [financials, investmentData, range]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.5rem' }}>
        <div className="card">
          <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem', fontWeight: 700, textTransform: 'uppercase' }}>Actual ROI</span>
          <div style={{ fontSize: '2.5rem', fontWeight: 900, color: 'var(--primary)' }}>{stats.actualROI.toFixed(1)}%</div>
          <small style={{ color: 'var(--text-muted)' }}>Target: {stats.targetROIPercent}%</small>
        </div>
        <div className="card">
          <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem', fontWeight: 700, textTransform: 'uppercase' }}>Net Profit</span>
          <div style={{ fontSize: '2.5rem', fontWeight: 900, color: stats.netProfit >= 0 ? 'var(--success)' : 'var(--danger)' }}>₹{stats.netProfit.toLocaleString()}</div>
        </div>
        <div className="card">
          <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem', fontWeight: 700, textTransform: 'uppercase' }}>Capital Recovery</span>
          <div style={{ fontSize: '2.5rem', fontWeight: 900 }}>{Math.max(0, stats.actualROI).toFixed(1)}%</div>
          <div style={{ height: '6px', background: 'var(--bg-secondary)', borderRadius: '3px', marginTop: '1rem', overflow: 'hidden' }}>
            <div style={{ width: `${Math.min(100, Math.max(0, stats.actualROI))}%`, height: '100%', background: 'var(--primary)' }}></div>
          </div>
        </div>
      </div>

      <div className="card" style={{ borderLeft: '4px solid var(--primary)', background: 'rgba(59, 130, 246, 0.02)' }}>
        <h3 style={{ margin: '0 0 1.5rem 0', display: 'flex', alignItems: 'center', gap: '0.75rem', fontSize: '1.1rem' }}><Target size={20} color="var(--primary)" /> Monthly Strategic Targets</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '2rem' }}>
          <div>
            <small style={{ color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase' }}>Min. Recovery</small>
            <div style={{ fontSize: '1.5rem', fontWeight: 800 }}>₹{Math.ceil(stats.monthlyCapitalRecoveryGoal).toLocaleString()}</div>
          </div>
          <div>
            <small style={{ color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase' }}>Target ROI Profit</small>
            <div style={{ fontSize: '1.5rem', fontWeight: 800 }}>₹{Math.ceil(stats.monthlyROIGoal).toLocaleString()}</div>
          </div>
          <div style={{ background: 'rgba(59, 130, 246, 0.05)', padding: '1.25rem', borderRadius: '16px', border: '1px solid rgba(59, 130, 246, 0.1)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <small style={{ color: 'var(--primary)', fontWeight: 800, textTransform: 'uppercase' }}>Monthly Revenue Goal</small>
              <span style={{ 
                padding: '0.25rem 0.6rem', 
                borderRadius: '50px', 
                fontSize: '0.65rem', 
                fontWeight: 900,
                background: (stats.totalIncome / (stats.totalIncome / stats.monthlyAverageProfit || 1)) >= stats.totalMonthlyRevenueTarget ? 'var(--success)' : 'var(--danger)',
                color: 'white'
              }}>
                {(stats.totalIncome / (stats.totalIncome / stats.monthlyAverageProfit || 1)) >= stats.totalMonthlyRevenueTarget ? 'ON TRACK' : 'ACTION REQUIRED'}
              </span>
            </div>
            <div style={{ fontSize: '2rem', fontWeight: 900, color: 'var(--primary)', marginBottom: '1.25rem' }}>₹{Math.ceil(stats.totalMonthlyRevenueTarget).toLocaleString()}</div>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', borderTop: '1px solid rgba(59, 130, 246, 0.1)', paddingTop: '1rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem' }}>
                <span style={{ color: 'var(--text-muted)' }}>Avg. Monthly Expenses <small>(over {stats.actualMonthsElapsed} mos)</small></span>
                <span style={{ fontWeight: 600 }}>₹{Math.ceil(stats.averageMonthlyExpense).toLocaleString()}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem' }}>
                <span style={{ color: 'var(--text-muted)' }}>Min. Capital Recovery</span>
                <span style={{ fontWeight: 600 }}>₹{Math.ceil(stats.monthlyCapitalRecoveryGoal).toLocaleString()}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem' }}>
                <span style={{ color: 'var(--text-muted)' }}>ROI Profit Target</span>
                <span style={{ fontWeight: 600 }}>₹{Math.ceil(stats.monthlyROIGoal).toLocaleString()}</span>
              </div>
              <div style={{ marginTop: '0.5rem', padding: '0.75rem', background: 'var(--bg-color)', borderRadius: '8px', fontSize: '0.75rem', textAlign: 'center' }}>
                <span style={{ color: 'var(--text-muted)' }}>Required Sales: </span>
                <strong style={{ color: 'var(--primary)' }}>
                  {Math.ceil(stats.totalMonthlyRevenueTarget / (stats.suggestedRate || 1))} Bookings
                </strong>
                <span style={{ color: 'var(--text-muted)' }}> @ ₹{Math.ceil(stats.suggestedRate).toLocaleString()} avg rate</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="card">
        <h3 style={{ margin: '0 0 1.5rem 0', display: 'flex', alignItems: 'center', gap: '0.75rem' }}><Activity size={20} color="var(--primary)" /> Profitability Breakdown</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Gross Revenue</span><span style={{ fontWeight: 700, color: 'var(--success)' }}>+ ₹{stats.totalIncome.toLocaleString()}</span></div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Total Expenses</span><span style={{ fontWeight: 700, color: 'var(--danger)' }}>- ₹{stats.totalOperatingExpenses.toLocaleString()}</span></div>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '1rem', background: 'var(--bg-secondary)', borderRadius: '12px' }}><span style={{ fontWeight: 800 }}>Net Period Profit</span><span style={{ fontWeight: 900, fontSize: '1.25rem', color: 'var(--primary)' }}>₹{stats.netProfit.toLocaleString()}</span></div>
        </div>
      </div>
    </div>
  );
};

// --- MAIN PAGE COMPONENT ---
export default function InvestmentHub() {
  const { activeResortId, profile } = useSettingsStore();
  const [view, setView] = useState('roi'); // 'planner' or 'roi'
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [investmentData, setInvestmentData] = useState({
    total_investment: 1000000,
    monthly_operating_expenses: 50000,
    annual_fixed_expenses: 20000,
    target_roi_percentage: 12,
    expected_occupancy_rate: 60,
    total_rooms: 0,
    rental_model: 'room'
  });
  const [financials, setFinancials] = useState({ incomes: [], expenses: [] });
  const [propertyInfo, setPropertyInfo] = useState({ totalRooms: 0 });

  const [range, setRange] = useState({
    start: '2026-04-01',
    end: '2027-03-31'
  });

  useEffect(() => {
    if (activeResortId) {
      fetchData();
      fetchPropertyStats();
    }
  }, [activeResortId]);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [inv, inc, exp] = await Promise.all([
        supabase.from('investments').select('*').eq('resort_id', activeResortId).maybeSingle(),
        supabase.from('incomes').select('*').eq('resort_id', activeResortId).gte('date', range.start).lte('date', range.end),
        supabase.from('expenses').select('*').eq('resort_id', activeResortId).gte('date', range.start).lte('date', range.end)
      ]);

      if (inv.data) setInvestmentData(inv.data);
      setFinancials({ incomes: inc.data || [], expenses: exp.data || [] });
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const fetchPropertyStats = async () => {
    const { count } = await supabase.from('rooms').select('id', { count: 'exact' }).eq('resort_id', activeResortId);
    setPropertyInfo({ totalRooms: count || 0 });
    if (investmentData.total_rooms === 0) setInvestmentData(prev => ({ ...prev, total_rooms: count || 0 }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const { error } = await supabase.from('investments').upsert({
        tenant_id: profile.id,
        resort_id: activeResortId,
        ...investmentData,
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

  if (loading) return <div style={{ padding: '2rem' }}>Loading Analysis Hub...</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Dynamic Header */}
      <div className="card" style={{ padding: '1rem 1.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <div style={{ background: 'rgba(59, 130, 246, 0.1)', padding: '0.75rem', borderRadius: '12px' }}>
               {view === 'planner' ? <Calculator color="var(--primary)" /> : <Activity color="var(--primary)" />}
            </div>
            <div>
              <h2 style={{ margin: 0, fontSize: '1.25rem' }}>Investment & Yield Analysis</h2>
              <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                {view === 'planner' ? 'Strategic Pricing Planner' : 'Actual Performance Review'}
              </p>
            </div>
          </div>

          {/* Toggle Button Group */}
          <div style={{ display: 'flex', background: 'var(--bg-secondary)', padding: '0.35rem', borderRadius: '12px', border: '1px solid var(--border)' }}>
             <button 
                onClick={() => setView('planner')}
                style={{ 
                  padding: '0.5rem 1.25rem', 
                  borderRadius: '10px', 
                  fontSize: '0.85rem', 
                  fontWeight: 700,
                  border: 'none',
                  cursor: 'pointer',
                  background: view === 'planner' ? 'var(--primary)' : 'transparent',
                  color: view === 'planner' ? 'white' : 'var(--text-muted)',
                  transition: 'all 0.2s'
                }}
             >
               Planner
             </button>
             <button 
                onClick={() => setView('roi')}
                style={{ 
                  padding: '0.5rem 1.25rem', 
                  borderRadius: '10px', 
                  fontSize: '0.85rem', 
                  fontWeight: 700,
                  border: 'none',
                  cursor: 'pointer',
                  background: view === 'roi' ? 'var(--primary)' : 'transparent',
                  color: view === 'roi' ? 'white' : 'var(--text-muted)',
                  transition: 'all 0.2s'
                }}
             >
               Performance
             </button>
          </div>
        </div>
      </div>

      {/* Date Filter (Only for Performance View) */}
      {view === 'roi' && (
        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', background: 'var(--bg-secondary)', padding: '0.5rem 1.5rem', borderRadius: '50px', border: '1px solid var(--border)' }}>
            <Calendar size={16} color="var(--primary)" />
            <span style={{ fontSize: '0.85rem', fontWeight: 700 }}>FY {range.start.split('-')[0]} - {range.end.split('-')[0]}</span>
          </div>
        </div>
      )}

      {/* Conditional View Rendering */}
      {view === 'planner' ? (
        <PricePlanner 
          data={investmentData} 
          setData={setInvestmentData} 
          propertyInfo={propertyInfo} 
          saving={saving}
          onSave={handleSave}
        />
      ) : (
        <ROIPerformance 
          investmentData={investmentData} 
          financials={financials} 
          range={range}
        />
      )}
    </div>
  );
}
