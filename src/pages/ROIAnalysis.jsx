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
  AlertCircle
} from 'lucide-react';
import { format } from 'date-fns';

export default function ROIAnalysis() {
  const { activeResortId, profile } = useSettingsStore();
  const [loading, setLoading] = useState(true);
  const [investmentData, setInvestmentData] = useState(null);
  const [financials, setFinancials] = useState({ incomes: [], expenses: [] });
  
  const [range, setRange] = useState({
    start: `${new Date().getFullYear()}-01-01`,
    end: `${new Date().getFullYear()}-12-31`
  });

  useEffect(() => {
    if (activeResortId) {
      fetchData();
    }
  }, [activeResortId, range]);

  const fetchData = async () => {
    if (!isSupabaseConfigured() || !activeResortId) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const [inv, inc, exp] = await Promise.all([
        supabase.from('investments').select('*').eq('resort_id', activeResortId).maybeSingle(),
        supabase.from('incomes').select('*').eq('resort_id', activeResortId).gte('date', range.start).lte('date', range.end),
        supabase.from('expenses').select('*').eq('resort_id', activeResortId).gte('date', range.start).lte('date', range.end)
      ]);

      setInvestmentData(inv.data);
      setFinancials({
        incomes: inc.data || [],
        expenses: exp.data || []
      });
    } catch (err) {
      console.error("Error fetching ROI data:", err);
    } finally {
      setLoading(false);
    }
  };

  // --- CALCULATIONS ---
  const stats = useMemo(() => {
    const totalIncome = financials.incomes.reduce((sum, i) => sum + Number(i.amount), 0);
    const totalOperatingExpenses = financials.expenses.reduce((sum, e) => sum + Number(e.amount), 0);
    
    // Pro-rate fixed expenses if investment data exists
    const annualFixed = Number(investmentData?.annual_fixed_expenses || 0);
    const capitalOutlay = Number(investmentData?.total_investment || 0);
    const targetROIPercent = Number(investmentData?.target_roi_percentage || 0);
    
    // Calculate period duration in months to pro-rate annual fixed costs
    const start = new Date(range.start);
    const end = new Date(range.end);
    const months = (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth()) + 1;
    const proRatedFixed = (annualFixed / 12) * months;
    
    const totalExpenses = totalOperatingExpenses + proRatedFixed;
    const netProfit = totalIncome - totalExpenses;
    
    const actualROI = capitalOutlay > 0 ? (netProfit / capitalOutlay) * 100 : 0;
    const paybackProgress = capitalOutlay > 0 ? (netProfit / capitalOutlay) * 100 : 0;
    
    // Projected ROI from PriceAnalysis
    const targetAnnualProfit = capitalOutlay * (targetROIPercent / 100);
    const targetPeriodProfit = (targetAnnualProfit / 12) * months;
    
    return {
      totalIncome,
      totalExpenses,
      netProfit,
      actualROI,
      paybackProgress,
      capitalOutlay,
      targetROIPercent,
      targetPeriodProfit,
      performanceRatio: targetPeriodProfit > 0 ? (netProfit / targetPeriodProfit) * 100 : 0
    };
  }, [financials, investmentData, range]);

  if (loading) return <div style={{ padding: '2rem' }}>Analyzing ROI...</div>;

  if (!investmentData) {
    return (
      <div className="card" style={{ textAlign: 'center', padding: '4rem', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1.5rem' }}>
        <AlertCircle size={48} color="var(--warning)" />
        <div>
          <h2 style={{ margin: 0 }}>Investment Data Missing</h2>
          <p style={{ color: 'var(--text-muted)', marginTop: '0.5rem' }}>Please configure your investment details in the Price Analysis page first.</p>
        </div>
        <button className="btn btn-primary" onClick={() => window.location.href = '/price-analysis'}>Go to Price Analysis</button>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      
      {/* Header Section */}
      <div className="card" style={{ padding: '1.5rem', background: 'linear-gradient(135deg, var(--primary) 0%, #312e81 100%)', color: 'white', border: 'none' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <h1 style={{ margin: 0, fontSize: '1.75rem', fontWeight: 800 }}>ROI Performance Analytics</h1>
            <p style={{ margin: '0.5rem 0 0', opacity: 0.8, fontSize: '0.9rem' }}>
              Actual Return on Investment based on real-time Income & Expenses
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', background: 'rgba(255,255,255,0.1)', padding: '0.5rem 1rem', borderRadius: '12px', backdropFilter: 'blur(10px)' }}>
            <Calendar size={18} />
            <span style={{ fontWeight: 700, fontSize: '0.85rem' }}>{format(new Date(range.start), 'MMM yyyy')} - {format(new Date(range.end), 'MMM yyyy')}</span>
          </div>
        </div>
      </div>

      {/* Primary KPI Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.5rem' }}>
        
        {/* ROI CARD */}
        <div className="card" style={{ position: 'relative', overflow: 'hidden' }}>
          <div style={{ position: 'absolute', right: '-10px', top: '-10px', opacity: 0.05 }}><TrendingUp size={120} /></div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem', fontWeight: 700, textTransform: 'uppercase' }}>Actual ROI</span>
            <div style={{ background: 'rgba(16, 185, 129, 0.1)', color: 'var(--success)', padding: '0.25rem 0.5rem', borderRadius: '6px', fontSize: '0.7rem', fontWeight: 800 }}>REAL-TIME</div>
          </div>
          <div style={{ fontSize: '2.5rem', fontWeight: 900, color: 'var(--primary)' }}>{stats.actualROI.toFixed(1)}%</div>
          <div style={{ marginTop: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Target size={14} color="var(--text-muted)" />
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Target: <strong>{stats.targetROIPercent}%</strong></span>
          </div>
        </div>

        {/* NET PROFIT CARD */}
        <div className="card">
          <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem', fontWeight: 700, textTransform: 'uppercase' }}>Net Profit</span>
          <div style={{ fontSize: '2.5rem', fontWeight: 900, color: stats.netProfit >= 0 ? 'var(--success)' : 'var(--danger)', marginTop: '0.5rem' }}>
            ₹{stats.netProfit.toLocaleString()}
          </div>
          <div style={{ marginTop: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Zap size={14} color={stats.performanceRatio >= 100 ? 'var(--success)' : 'var(--warning)'} />
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              {stats.performanceRatio.toFixed(0)}% of periodic goal
            </span>
          </div>
        </div>

        {/* PAYBACK CARD */}
        <div className="card">
          <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem', fontWeight: 700, textTransform: 'uppercase' }}>Capital Recovery</span>
          <div style={{ fontSize: '2.5rem', fontWeight: 900, marginTop: '0.5rem' }}>{Math.max(0, stats.paybackProgress).toFixed(1)}%</div>
          <div style={{ marginTop: '1rem' }}>
            <div style={{ height: '8px', background: 'var(--bg-secondary)', borderRadius: '4px', overflow: 'hidden' }}>
              <div style={{ width: `${Math.min(100, Math.max(0, stats.paybackProgress))}%`, height: '100%', background: 'var(--primary)', borderRadius: '4px' }}></div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.5rem', fontSize: '0.7rem', color: 'var(--text-muted)' }}>
              <span>Recouped: ₹{Math.max(0, stats.netProfit).toLocaleString()}</span>
              <span>Total: ₹{stats.capitalOutlay.toLocaleString()}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Analysis Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '2rem' }}>
        
        {/* Financial Breakdown */}
        <div className="card" style={{ padding: '2rem' }}>
          <h3 style={{ margin: '0 0 2rem 0', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <Activity size={20} color="var(--primary)" /> Profitability Breakdown
          </h3>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <div style={{ background: 'rgba(16, 185, 129, 0.1)', padding: '0.75rem', borderRadius: '12px' }}><ArrowUpRight color="var(--success)" /></div>
                <div>
                  <div style={{ fontWeight: 700 }}>Gross Revenue</div>
                  <small style={{ color: 'var(--text-muted)' }}>Total bookings & services</small>
                </div>
              </div>
              <div style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--success)' }}>+ ₹{stats.totalIncome.toLocaleString()}</div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <div style={{ background: 'rgba(239, 68, 68, 0.1)', padding: '0.75rem', borderRadius: '12px' }}><ArrowDownRight color="var(--danger)" /></div>
                <div>
                  <div style={{ fontWeight: 700 }}>Total Expenses</div>
                  <small style={{ color: 'var(--text-muted)' }}>Operating + Pro-rated Fixed Costs</small>
                </div>
              </div>
              <div style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--danger)' }}>- ₹{stats.totalExpenses.toLocaleString()}</div>
            </div>

            <div style={{ marginTop: '1rem', padding: '1.5rem', background: 'var(--bg-secondary)', borderRadius: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Period Net Profit</div>
                <div style={{ fontSize: '1.5rem', fontWeight: 900, color: 'var(--primary)' }}>₹{stats.netProfit.toLocaleString()}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Profit Margin</div>
                <div style={{ fontSize: '1.5rem', fontWeight: 900, color: 'var(--primary)' }}>
                  {stats.totalIncome > 0 ? ((stats.netProfit / stats.totalIncome) * 100).toFixed(1) : 0}%
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Actionable Insights */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          <div className="card" style={{ background: 'var(--bg-secondary)', border: 'none' }}>
            <h4 style={{ margin: '0 0 1rem 0', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Target size={18} color="var(--primary)" /> Insights
            </h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div style={{ display: 'flex', gap: '0.75rem', fontSize: '0.85rem' }}>
                <CheckCircle2 size={16} color="var(--success)" style={{ marginTop: '2px', flexShrink: 0 }} />
                <p style={{ margin: 0 }}>
                  {stats.performanceRatio >= 100 
                    ? "You are currently exceeding your planned ROI targets for this period."
                    : "Performance is slightly below target. Consider reviewing occupancy rates."}
                </p>
              </div>
              <div style={{ display: 'flex', gap: '0.75rem', fontSize: '0.85rem' }}>
                <Zap size={16} color="var(--primary)" style={{ marginTop: '2px', flexShrink: 0 }} />
                <p style={{ margin: 0 }}>
                  At this current rate, you will achieve full capital recovery in 
                  <strong> {stats.netProfit > 0 ? (stats.capitalOutlay / (stats.netProfit / 12)).toFixed(1) : "???"} months</strong>.
                </p>
              </div>
            </div>
          </div>

          <div className="card" style={{ textAlign: 'center' }}>
            <div style={{ background: 'rgba(59, 130, 246, 0.1)', width: '48px', height: '48px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1rem' }}>
              <Briefcase size={24} color="var(--primary)" />
            </div>
            <h4 style={{ margin: '0 0 0.5rem 0' }}>Investment Recovery</h4>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>
              You have recovered <strong>₹{Math.max(0, stats.netProfit).toLocaleString()}</strong> of your <strong>₹{stats.capitalOutlay.toLocaleString()}</strong> initial investment.
            </p>
            <button className="btn btn-outline" style={{ width: '100%', fontSize: '0.8rem' }} onClick={() => window.location.href = '/reports'}>
              View Detailed Reports
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
