import React, { useState, useEffect } from 'react';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, AreaChart, Area } from 'recharts';
import { Wallet, BedDouble, CalendarCheck, TrendingUp, CreditCard } from 'lucide-react';
import { format, differenceInDays } from 'date-fns';

import { useSettingsStore } from '../lib/store';

export default function Dashboard() {
  const { activeResortId } = useSettingsStore();
  const [stats, setStats] = useState({ revenue: 0, collections: 0, expenses: 0, profit: 0, totalBookings: 0, occupancy: 0 });
  const [chartData, setChartData] = useState([]);
  const [recentCheckins, setRecentCheckins] = useState([]);
  const [loading, setLoading] = useState(true);

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
        
        // Collection = Actual payments received
        const yearlyCollections = (inc.data || []).filter(i => i.date >= startOfYearStr).reduce((sum, item) => sum + Number(item.amount), 0);
        const yearlyExpr = (exp.data || []).filter(e => e.date >= startOfYearStr).reduce((sum, item) => sum + Number(item.amount), 0);
        
        // Booking Revenue = Total value of valid bookings
        const yearlyBookingRevenue = (bks.data || []).filter(b => b.status !== 'Cancelled' && b.check_in_date >= startOfYearStr).reduce((sum, item) => sum + Number(item.total_amount), 0);

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
          revenue: yearlyBookingRevenue,
          collections: yearlyCollections,
          expenses: yearlyExpr,
          profit: yearlyCollections - yearlyExpr,
          totalBookings: (bks.data || []).filter(b => b.check_in_date >= startOfYearStr).length,
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

  const kpis = [
    { title: 'Yearly Revenue', value: `₹${stats.revenue.toLocaleString()}`, icon: <Wallet size={24}/>, color: 'linear-gradient(135deg, #2f855a 0%, #48bb78 100%)' },
    { title: 'Yearly Collections', value: `₹${stats.collections.toLocaleString()}`, icon: <CreditCard size={24}/>, color: 'linear-gradient(135deg, #3182ce 0%, #63b3ed 100%)' },
    { title: 'Yearly Expenses', value: `₹${stats.expenses.toLocaleString()}`, icon: <TrendingUp size={24}/>, color: 'linear-gradient(135deg, #e53e3e 0%, #fc8181 100%)' },
    { title: 'Yearly Profit', value: `₹${stats.profit.toLocaleString()}`, icon: <TrendingUp size={24} style={{ rotate: '45deg' }}/>, color: 'linear-gradient(135deg, #d69e2e 0%, #ecc94b 100%)' },
    { title: 'Yearly Bookings', value: stats.totalBookings, icon: <CalendarCheck size={24}/>, color: 'linear-gradient(135deg, #3182ce 0%, #63b3ed 100%)' },
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
              <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-muted)' }}>Revenue vs Expenses performance for the last week</p>
            </div>
            <div style={{ display: 'flex', gap: '1rem', fontSize: '0.8rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <div style={{ width: '12px', height: '12px', background: 'var(--primary)', borderRadius: '3px' }}></div>
                <span>Revenue</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <div style={{ width: '12px', height: '12px', background: 'var(--danger)', borderRadius: '3px' }}></div>
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
        <div className="card" style={{ padding: '1.5rem' }}>
          <h3 style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <BedDouble size={20} color="var(--primary)"/> Active & Upcoming
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
                gap: '1rem',
                padding: '1rem', 
                background: 'var(--bg-color)', 
                borderRadius: '12px', 
                border: '1px solid var(--border)',
                transition: 'transform 0.2s ease',
                position: 'relative'
              }}>
                <div style={{ 
                  width: '10px', 
                  height: '40px', 
                  background: b.status === 'Checked-in' ? 'var(--success)' : 'var(--primary)',
                  borderRadius: '10px'
                }}></div>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <div style={{ fontWeight: '700', fontSize: '0.95rem' }}>{b.guest_name}</div>
                    <div style={{ display: 'flex', gap: '0.4rem', marginTop: '0.2rem' }}>
                        <span style={{ 
                        fontSize: '0.65rem', 
                        padding: '2px 6px', 
                        borderRadius: '4px', 
                        background: b.status === 'Checked-in' ? 'rgba(72, 187, 120, 0.1)' : 'rgba(49, 130, 206, 0.1)',
                        color: b.status === 'Checked-in' ? 'var(--success)' : 'var(--primary)',
                        fontWeight: '700',
                        textTransform: 'uppercase'
                        }}>
                        {b.status === 'Checked-in' ? 'Active' : 'Upcoming'}
                        </span>
                        <span style={{ fontSize: '0.65rem', padding: '2px 6px', borderRadius: '4px', background: 'rgba(99, 102, 241, 0.1)', color: '#6366f1', fontWeight: 800 }}>{b.booking_source || 'Direct'}</span>
                    </div>
                  </div>
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
