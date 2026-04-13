import React, { useState, useEffect } from 'react';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, AreaChart, Area } from 'recharts';
import { Wallet, BedDouble, CalendarCheck, TrendingUp } from 'lucide-react';
import { format, differenceInDays } from 'date-fns';

import { useSettingsStore } from '../lib/store';

export default function Dashboard() {
  const { activeResortId } = useSettingsStore();
  const [stats, setStats] = useState({ revenue: 0, expenses: 0, profit: 0, totalBookings: 0 });
  const [chartData, setChartData] = useState([]);
  const [recentCheckins, setRecentCheckins] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      if (!isSupabaseConfigured() || !activeResortId) { setLoading(false); return; }
      try {
        const [inc, exp, bks] = await Promise.all([
          supabase.from('incomes').select('amount, date').eq('resort_id', activeResortId),
          supabase.from('expenses').select('amount').eq('resort_id', activeResortId),
          supabase.from('bookings').select('*').eq('resort_id', activeResortId).order('check_in_date', { ascending: true })
        ]);
        
        const rev = (inc.data || []).reduce((sum, item) => sum + Number(item.amount), 0);
        const expr = (exp.data || []).reduce((sum, item) => sum + Number(item.amount), 0);
        
        setStats({
          revenue: rev,
          expenses: expr,
          profit: rev - expr,
          totalBookings: (bks.data || []).length
        });

        // Chart Data (Group income by date)
        const dailyIncome = {};
        (inc.data || []).forEach(item => {
          const d = item.date;
          dailyIncome[d] = (dailyIncome[d] || 0) + Number(item.amount);
        });

        const sortedDates = Object.keys(dailyIncome).sort();
        setChartData(sortedDates.slice(-7).map(d => ({ name: format(new Date(d), 'MMM dd'), Revenue: dailyIncome[d] })));

        // Today/upcoming checkins
        const todayStr = new Date().toISOString().split('T')[0];
        setRecentCheckins((bks.data || []).filter(b => b.check_in_date >= todayStr).slice(0, 5));

      } catch (err) {
        console.error(err);
      } finally { setLoading(false); }
    };

    fetchData();
  }, [activeResortId]);

  if(loading) return <div>Loading...</div>;

  const kpis = [
    { title: 'Total Revenue', value: `₹${stats.revenue.toLocaleString()}`, icon: <Wallet size={24}/>, color: 'linear-gradient(135deg, #2f855a 0%, #48bb78 100%)' },
    { title: 'Total Expenses', value: `₹${stats.expenses.toLocaleString()}`, icon: <TrendingUp size={24}/>, color: 'linear-gradient(135deg, #e53e3e 0%, #fc8181 100%)' },
    { title: 'Net Profit', value: `₹${stats.profit.toLocaleString()}`, icon: <TrendingUp size={24} style={{ rotate: '45deg' }}/>, color: 'linear-gradient(135deg, #d69e2e 0%, #ecc94b 100%)' },
    { title: 'Total Bookings', value: stats.totalBookings, icon: <CalendarCheck size={24}/>, color: 'linear-gradient(135deg, #3182ce 0%, #63b3ed 100%)' },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2.5rem' }}>
      {/* KPI Section */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1.5rem' }}>
        {kpis.map((k, i) => (
          <div key={i} className="card" style={{ 
            background: k.color, 
            color: 'white', 
            border: 'none',
            display: 'flex', 
            flexDirection: 'column',
            justifyContent: 'space-between',
            padding: '1.5rem',
            height: '140px',
            boxShadow: '0 10px 20px rgba(0,0,0,0.1)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <span style={{ fontSize: '0.9rem', fontWeight: '500', opacity: 0.9 }}>{k.title}</span>
              <div style={{ background: 'rgba(255,255,255,0.2)', padding: '0.5rem', borderRadius: '10px' }}>{k.icon}</div>
            </div>
            <div style={{ fontSize: '2rem', fontWeight: '800', letterSpacing: '-0.5px' }}>{k.value}</div>
          </div>
        ))}
      </div>

      <div className="grid-2" style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '2rem' }}>
        {/* Sales Analytic Chart */}
        <div className="card" style={{ padding: '2rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
            <div>
              <h3 style={{ margin: 0 }}>Revenue Breakdown</h3>
              <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-muted)' }}>Visualized performance for the last week</p>
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
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} scale="point" padding={{ left: 10, right: 10 }} stroke="var(--text-muted)" fontSize={12} />
                  <YAxis axisLine={false} tickLine={false} stroke="var(--text-muted)" fontSize={12} />
                  <Tooltip 
                    contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px rgba(0,0,0,0.1)', background: 'var(--bg-secondary)' }}
                    itemStyle={{ color: 'var(--primary)', fontWeight: 'bold' }}
                  />
                  <Area type="monotone" dataKey="Revenue" stroke="var(--primary)" strokeWidth={3} fillOpacity={1} fill="url(#colorRev)" />
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
        <div className="card" style={{ padding: '1.5rem' }}>
          <h3 style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <BedDouble size={20} color="var(--primary)"/> Active Check-ins
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            {recentCheckins.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '2rem 0', opacity: 0.5 }}>
                <CalendarCheck size={48} style={{ marginBottom: '1rem' }} />
                <p>No arrivals scheduled</p>
              </div>
            ) : null}
            {recentCheckins.map(b => (
              <div key={b.id} style={{ 
                display: 'flex', 
                alignItems: 'center',
                gap: '1rem',
                padding: '1rem', 
                background: 'var(--bg-color)', 
                borderRadius: '12px', 
                border: '1px solid var(--border)',
                transition: 'transform 0.2s ease'
              }}>
                <div style={{ 
                  width: '10px', 
                  height: '40px', 
                  background: b.balance_amount > 0 ? 'var(--warning)' : 'var(--success)',
                  borderRadius: '10px'
                }}></div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: '700', fontSize: '0.95rem' }}>{b.guest_name}</div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>In: {format(new Date(b.check_in_date), 'MMM dd')}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                   <div style={{ fontSize: '0.85rem', fontWeight: 'bold', color: b.balance_amount > 0 ? 'var(--danger)' : 'var(--success)' }}>
                    ₹{b.balance_amount.toLocaleString()}
                  </div>
                  <span style={{ fontSize: '0.7rem', textTransform: 'uppercase', fontWeight: '700', opacity: 0.6 }}>Balance</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
