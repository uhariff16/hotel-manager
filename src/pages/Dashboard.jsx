import React, { useState, useEffect } from 'react';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, AreaChart, Area } from 'recharts';
import { Wallet, BedDouble, CalendarCheck, TrendingUp, CreditCard } from 'lucide-react';
import { format, differenceInDays } from 'date-fns';

import { useSettingsStore } from '../lib/store';

export default function Dashboard() {
  const { activeResortId } = useSettingsStore();
  const [stats, setStats] = useState({ 
    monthlyCollections: 0, 
    monthlyExpenses: 0,
    monthlyProfit: 0,
    monthlyBookings: 0,
    collections: 0, 
    expenses: 0, 
    profit: 0, 
    totalBookings: 0, 
    occupancy: 0 
  });
  const [chartData, setChartData] = useState([]);
  const [recentCheckins, setRecentCheckins] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);
  
  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth <= 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    const fetchData = async () => {
      if (!isSupabaseConfigured() || !activeResortId) { setLoading(false); return; }
      try {
        const [inc, exp, bks, cts, rms] = await Promise.all([
          supabase.from('incomes').select('amount, date').eq('resort_id', activeResortId),
          supabase.from('expenses').select('amount, date').eq('resort_id', activeResortId),
          supabase.from('bookings').select('*').eq('resort_id', activeResortId).order('check_in_date', { ascending: true }),
          supabase.from('cottages').select('id').eq('resort_id', activeResortId),
          supabase.from('rooms').select('id, cottage_id').eq('resort_id', activeResortId)
        ]);
        
        const rev = (inc.data || []).reduce((sum, item) => sum + Number(item.amount), 0);
        const expr = (exp.data || []).reduce((sum, item) => sum + Number(item.amount), 0);
        
        // Yearly stats for KPIs
        const now = new Date();
        const startOfYearStr = new Date(now.getFullYear(), 0, 1).toISOString().split('T')[0];
        const endOfYearStr = new Date(now.getFullYear(), 11, 31).toISOString().split('T')[0];
        const startOfMonthStr = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
        const endOfMonthStr = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];
        
        const yearlyCollections = (inc.data || []).filter(i => i.date >= startOfYearStr && i.date <= endOfYearStr).reduce((sum, item) => sum + Number(item.amount), 0);
        const monthlyCollections = (inc.data || []).filter(i => i.date >= startOfMonthStr && i.date <= endOfMonthStr).reduce((sum, item) => sum + Number(item.amount), 0);
        
        const yearlyExpr = (exp.data || []).filter(e => e.date >= startOfYearStr && e.date <= endOfYearStr).reduce((sum, item) => sum + Number(item.amount), 0);
        const monthlyExpr = (exp.data || []).filter(e => e.date >= startOfMonthStr && e.date <= endOfMonthStr).reduce((sum, item) => sum + Number(item.amount), 0);

        // Calculate Today's Occupancy % correctly
        const today = new Date();
        today.setHours(0,0,0,0);
        
        const totalUnits = (cts.data?.length || 0) + (rms.data?.length || 0);
        
        // Filter bookings that span TODAY and are not cancelled
        const todayBookings = (bks.data || []).filter(b => {
            if (b.status === 'Cancelled') return false;
            const start = new Date(b.check_in_date);
            const end = new Date(b.check_out_date);
            start.setHours(0,0,0,0);
            end.setHours(0,0,0,0);
            return today >= start && today < end; 
        });

        const occupiedUnits = todayBookings.reduce((acc, b) => {
            if (b.booking_type === 'Entire Property') {
                const cottageRooms = (rms.data || []).filter(r => r.cottage_id === b.cottage_id).length;
                return acc + 1 + cottageRooms; 
            } else {
                return acc + (b.room_ids?.length || 1);
            }
        }, 0);

        setStats({
          monthlyCollections,
          monthlyExpenses: monthlyExpr,
          monthlyProfit: monthlyCollections - monthlyExpr,
          monthlyBookings: (bks.data || []).filter(b => b.check_in_date >= startOfMonthStr && b.check_in_date <= endOfMonthStr).length,
          collections: yearlyCollections,
          expenses: yearlyExpr,
          profit: yearlyCollections - yearlyExpr,
          totalBookings: (bks.data || []).filter(b => b.check_in_date >= startOfYearStr && b.check_in_date <= endOfYearStr).length,
          occupancy: totalUnits > 0 ? Math.round((occupiedUnits / totalUnits) * 100) : 0
        });

        // Chart Data (Group income & expenses by date)
        const dailyData = {};
        (inc.data || []).forEach(item => {
          const d = item.date;
          if (!dailyData[d]) dailyData[d] = { Revenue: 0, Expenses: 0 };
          dailyData[d].Revenue += Number(item.amount);
        });
        (exp.data || []).forEach(item => {
          const d = item.date;
          if (!dailyData[d]) dailyData[d] = { Revenue: 0, Expenses: 0 };
          dailyData[d].Expenses += Number(item.amount);
        });

        const sortedDates = Object.keys(dailyData).sort();
        setChartData(sortedDates.slice(-7).map(d => ({ 
          name: format(new Date(d), 'MMM dd'), 
          Revenue: dailyData[d].Revenue,
          Expenses: dailyData[d].Expenses
        })));

        // Active check-ins + Upcoming arrivals
        const todayStr = new Date().toISOString().split('T')[0];
        const active = (bks.data || []).filter(b => b.status === 'Checked-in');
        const upcoming = (bks.data || []).filter(b => b.status === 'Confirmed' && b.check_in_date >= todayStr);
        setRecentCheckins([...active, ...upcoming].slice(0, 5));

      } catch (err) {
        console.error(err);
      } finally { setLoading(false); }
    };

    fetchData();
  }, [activeResortId]);

  if(loading) return <div>Loading...</div>;

  const monthlyKpis = [
    { title: 'Collections', subtitle: format(new Date(), 'MMM yyyy'), value: `₹${stats.monthlyCollections.toLocaleString()}`, icon: <Wallet size={20}/>, color: 'linear-gradient(135deg, #059669 0%, #10b981 100%)' },
    { title: 'Expenses', subtitle: format(new Date(), 'MMM yyyy'), value: `₹${stats.monthlyExpenses.toLocaleString()}`, icon: <TrendingUp size={20}/>, color: 'linear-gradient(135deg, #e53e3e 0%, #f87171 100%)' },
    { title: 'Profit', subtitle: format(new Date(), 'MMM yyyy'), value: `₹${stats.monthlyProfit.toLocaleString()}`, icon: <TrendingUp size={20} style={{ rotate: '45deg' }}/>, color: 'linear-gradient(135deg, #0284c7 0%, #38bdf8 100%)' },
    { title: 'Bookings', subtitle: format(new Date(), 'MMM yyyy'), value: stats.monthlyBookings, icon: <CalendarCheck size={20}/>, color: 'linear-gradient(135deg, #4b5563 0%, #9ca3af 100%)' },
  ];

  const yearlyKpis = [
    { title: 'Collections', subtitle: `${new Date().getFullYear()} Year`, value: `₹${stats.collections.toLocaleString()}`, icon: <CreditCard size={20}/>, color: 'linear-gradient(135deg, #3182ce 0%, #63b3ed 100%)' },
    { title: 'Expenses', subtitle: `${new Date().getFullYear()} Year`, value: `₹${stats.expenses.toLocaleString()}`, icon: <TrendingUp size={20}/>, color: 'linear-gradient(135deg, #b91c1c 0%, #ef4444 100%)' },
    { title: 'Profit', subtitle: `${new Date().getFullYear()} Year`, value: `₹${stats.profit.toLocaleString()}`, icon: <TrendingUp size={20} style={{ rotate: '45deg' }}/>, color: 'linear-gradient(135deg, #d97706 0%, #fbbf24 100%)' },
    { title: 'Bookings', subtitle: `${new Date().getFullYear()} Year`, value: stats.totalBookings, icon: <CalendarCheck size={20}/>, color: 'linear-gradient(135deg, #4b5563 0%, #9ca3af 100%)' },
  ];

  const renderKpiGrid = (kpis) => (
    <div style={{ 
      display: 'grid', 
      gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(auto-fit, minmax(200px, 1fr))', 
      gap: isMobile ? '0.75rem' : '1rem' 
    }}>
        {kpis.map((k, i) => (
          <div key={i} className="card" style={{ 
            background: k.color, 
            color: 'white', 
            border: 'none',
            display: 'flex', 
            flexDirection: 'column',
            justifyContent: 'space-between',
            padding: isMobile ? '0.75rem' : '1.25rem',
            height: isMobile ? '100px' : '130px',
            boxShadow: '0 8px 15px rgba(0,0,0,0.08)',
            overflow: 'hidden'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.25rem' }}>
              <div style={{ minWidth: 0 }}>
                <span style={{ 
                  fontSize: isMobile ? '0.6rem' : '0.75rem', 
                  fontWeight: '700', 
                  opacity: 0.9, 
                  textTransform: 'uppercase', 
                  letterSpacing: '0.02em', 
                  display: 'block',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis'
                }}>{k.title}</span>
                <span style={{ fontSize: isMobile ? '0.55rem' : '0.65rem', opacity: 0.7, fontWeight: '600' }}>{k.subtitle}</span>
              </div>
              <div style={{ background: 'rgba(255,255,255,0.2)', padding: isMobile ? '0.25rem' : '0.4rem', borderRadius: '6px' }}>
                {React.cloneElement(k.icon, { size: isMobile ? 16 : 20 })}
              </div>
            </div>
            <div style={{ 
              fontSize: isMobile ? '1.1rem' : '1.4rem', 
              fontWeight: '900', 
              letterSpacing: '-0.5px',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis'
            }}>{k.value}</div>
          </div>
        ))}
      </div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: isMobile ? '1.5rem' : '2.5rem' }}>
      
      {/* Monthly Section */}
      <section>
        <h2 style={{ fontSize: isMobile ? '0.9rem' : '1.1rem', fontWeight: '800', marginBottom: '1rem', color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <div style={{ width: '4px', height: isMobile ? '14px' : '18px', background: 'var(--primary)', borderRadius: '4px' }}></div>
            Monthly Performance
        </h2>
        {renderKpiGrid(monthlyKpis)}
      </section>

      {/* Yearly Section */}
      <section>
        <h2 style={{ fontSize: isMobile ? '0.9rem' : '1.1rem', fontWeight: '800', marginBottom: '1rem', color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <div style={{ width: '4px', height: isMobile ? '14px' : '18px', background: '#3182ce', borderRadius: '4px' }}></div>
            Yearly Performance
        </h2>
        {renderKpiGrid(yearlyKpis)}
      </section>

      <div className="grid-2" style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '2fr 1fr', gap: isMobile ? '1.5rem' : '2rem' }}>
        {/* Sales Analytic Chart */}
        <div className="card" style={{ padding: isMobile ? '1rem' : '2rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem', flexWrap: 'wrap', gap: '1rem' }}>
            <div>
              <h3 style={{ margin: 0, fontSize: isMobile ? '1rem' : '1.25rem' }}>Revenue Breakdown</h3>
              <p style={{ margin: 0, fontSize: isMobile ? '0.75rem' : '0.85rem', color: 'var(--text-muted)' }}>Revenue vs Expenses performance</p>
            </div>
            <div style={{ display: 'flex', gap: '0.75rem', fontSize: isMobile ? '0.7rem' : '0.8rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <div style={{ width: '10px', height: '10px', background: 'var(--primary)', borderRadius: '3px' }}></div>
                <span>Revenue</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <div style={{ width: '10px', height: '10px', background: 'var(--danger)', borderRadius: '3px' }}></div>
                <span>Expenses</span>
              </div>
            </div>
          </div>
          <div style={{ width: '100%', height: 320 }}>
            {chartData.length > 0 ? (
              <ResponsiveContainer>
                <AreaChart data={chartData}>
                  <defs>
                    <linearGradient id="colorRev" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="var(--primary)" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="var(--primary)" stopOpacity={0}/>
                    </linearGradient>
                    <linearGradient id="colorExp" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="var(--danger)" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="var(--danger)" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} scale="point" padding={{ left: 10, right: 10 }} stroke="var(--text-muted)" fontSize={12} />
                  <YAxis axisLine={false} tickLine={false} stroke="var(--text-muted)" fontSize={12} />
                  <Tooltip 
                    contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px rgba(0,0,0,0.1)', background: 'var(--bg-secondary)' }}
                    itemStyle={{ fontWeight: 'bold' }}
                  />
                  <Area type="monotone" dataKey="Revenue" stroke="var(--primary)" strokeWidth={3} fillOpacity={1} fill="url(#colorRev)" />
                  <Area type="monotone" dataKey="Expenses" stroke="var(--danger)" strokeWidth={3} fillOpacity={1} fill="url(#colorExp)" />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-color)', borderRadius: '12px', opacity: 0.6 }}>
                Not enough data to generate trends
              </div>
            )}
          </div>
        </div>

        {/* Activity Feed */}
        <div className="card" style={{ padding: isMobile ? '1.25rem' : '1.5rem' }}>
          <h3 style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.75rem', fontSize: isMobile ? '1rem' : '1.25rem' }}>
            <BedDouble size={isMobile ? 18 : 20} color="var(--primary)"/> Active & Upcoming
          </h3>
          
          {/* Occupancy Progress Bar */}
          <div style={{ marginBottom: '2rem', padding: '1rem', background: 'var(--bg-secondary)', borderRadius: '12px', border: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem', fontSize: '0.85rem', fontWeight: 700 }}>
                <span>Today's Occupancy</span>
                <span style={{ color: 'var(--primary)' }}>{stats.occupancy}%</span>
            </div>
            <div style={{ width: '100%', height: '8px', background: 'var(--bg-color)', borderRadius: '10px', overflow: 'hidden' }}>
                <div style={{ 
                    width: `${stats.occupancy}%`, 
                    height: '100%', 
                    background: 'var(--primary)',
                    borderRadius: '10px',
                    transition: 'width 0.5s ease-out'
                }}></div>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            {recentCheckins.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '2rem 0', opacity: 0.5 }}>
                <CalendarCheck size={48} style={{ marginBottom: '1rem' }} />
                <p>No active or upcoming guests</p>
              </div>
            ) : null}
            {recentCheckins.map(b => (
              <div key={b.id} style={{ 
                display: 'flex', 
                alignItems: 'center',
                gap: isMobile ? '0.75rem' : '1rem',
                padding: isMobile ? '0.75rem' : '1rem', 
                background: 'var(--bg-color)', 
                borderRadius: '12px', 
                border: '1px solid var(--border)',
                transition: 'transform 0.2s ease',
                position: 'relative'
              }}>
                <div style={{ 
                  width: isMobile ? '4px' : '10px', 
                  height: '40px', 
                  background: b.status === 'Checked-in' ? 'var(--success)' : 'var(--primary)',
                  borderRadius: '10px'
                }}></div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', alignItems: isMobile ? 'flex-start' : 'center', gap: isMobile ? '2px' : '0.5rem' }}>
                    <div style={{ fontWeight: '700', fontSize: isMobile ? '0.85rem' : '0.95rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%' }}>{b.guest_name}</div>
                    <div style={{ display: 'flex', gap: '0.3rem' }}>
                        <span style={{ 
                        fontSize: isMobile ? '0.55rem' : '0.65rem', 
                        padding: '1px 4px', 
                        borderRadius: '4px', 
                        background: b.status === 'Checked-in' ? 'rgba(72, 187, 120, 0.1)' : 'rgba(49, 130, 206, 0.1)',
                        color: b.status === 'Checked-in' ? 'var(--success)' : 'var(--primary)',
                        fontWeight: '700',
                        textTransform: 'uppercase'
                        }}>
                        {b.status === 'Checked-in' ? 'Active' : 'Upcoming'}
                        </span>
                        <span style={{ fontSize: isMobile ? '0.55rem' : '0.65rem', padding: '1px 4px', borderRadius: '4px', background: 'rgba(99, 102, 241, 0.1)', color: '#6366f1', fontWeight: 800 }}>{b.booking_source || 'Direct'}</span>
                    </div>
                  </div>
                  <div style={{ fontSize: isMobile ? '0.7rem' : '0.8rem', color: 'var(--text-muted)', marginTop: isMobile ? '2px' : 0 }}>In: {format(new Date(b.check_in_date), 'MMM dd')}</div>
                </div>
                <div style={{ textAlign: 'right', minWidth: 'fit-content' }}>
                   <div style={{ fontSize: isMobile ? '0.75rem' : '0.85rem', fontWeight: 'bold', color: b.balance_amount > 0 ? 'var(--danger)' : 'var(--success)' }}>
                    ₹{b.balance_amount.toLocaleString()}
                  </div>
                  <span style={{ fontSize: '0.6rem', textTransform: 'uppercase', fontWeight: '700', opacity: 0.6 }}>Bal</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
