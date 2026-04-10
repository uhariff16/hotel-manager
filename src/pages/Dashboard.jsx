import React, { useState, useEffect } from 'react';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, AreaChart, Area } from 'recharts';
import { Wallet, BedDouble, CalendarCheck, TrendingUp } from 'lucide-react';
import { format, differenceInDays } from 'date-fns';

export default function Dashboard() {
  const [stats, setStats] = useState({ revenue: 0, expenses: 0, profit: 0, totalBookings: 0 });
  const [chartData, setChartData] = useState([]);
  const [recentCheckins, setRecentCheckins] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      if (!isSupabaseConfigured()) { setLoading(false); return; }
      try {
        const [inc, exp, bks] = await Promise.all([
          supabase.from('incomes').select('amount, date'),
          supabase.from('expenses').select('amount'),
          supabase.from('bookings').select('*').order('check_in_date', { ascending: true })
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
  }, []);

  if(loading) return <div>Loading...</div>;

  const kpis = [
    { title: 'Total Revenue', value: `₹${stats.revenue.toLocaleString()}`, icon: <Wallet color="var(--success)"/> },
    { title: 'Total Expenses', value: `₹${stats.expenses.toLocaleString()}`, icon: <TrendingUp color="var(--danger)"/> },
    { title: 'Net Profit', value: `₹${stats.profit.toLocaleString()}`, icon: <Wallet color="var(--primary)"/> },
    { title: 'Total Bookings', value: stats.totalBookings, icon: <CalendarCheck color="var(--warning)"/> },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1.5rem' }}>
        {kpis.map((k, i) => (
          <div key={i} className="card" style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <div style={{ padding: '1rem', background: 'var(--bg-color)', borderRadius: '50%' }}>{k.icon}</div>
            <div>
              <div style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>{k.title}</div>
              <div style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>{k.value}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="grid-2" style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '1.5rem' }}>
        {/* Chart */}
        <div className="card">
          <h3 style={{ marginBottom: '1.5rem' }}>Revenue Trend (Last 7 Days)</h3>
          <div style={{ width: '100%', height: 300 }}>
            {chartData.length > 0 ? (
              <ResponsiveContainer>
                <AreaChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="name" stroke="var(--text-muted)" fontSize={12} />
                  <YAxis stroke="var(--text-muted)" fontSize={12} />
                  <Tooltip contentStyle={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border)' }} />
                  <Area type="monotone" dataKey="Revenue" stroke="var(--primary)" fill="var(--primary)" fillOpacity={0.2} />
                </AreaChart>
              </ResponsiveContainer>
            ) : <p style={{ color: 'var(--text-muted)' }}>Not enough data to display chart.</p>}
          </div>
        </div>

        {/* Upcoming Check-ins */}
        <div className="card">
          <h3 style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <BedDouble size={20}/> Upcoming Check-ins
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {recentCheckins.length === 0 ? <p style={{ color: 'var(--text-muted)' }}>No upcoming check-ins.</p> : null}
            {recentCheckins.map(b => (
              <div key={b.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '1rem', background: 'var(--bg-color)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)' }}>
                <div>
                  <div style={{ fontWeight: 'bold' }}>{b.guest_name}</div>
                  <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>{format(new Date(b.check_in_date), 'MMM dd, yyyy')}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <span className="badge badge-warning">{b.booking_type}</span>
                  <div style={{ fontSize: '0.875rem', marginTop: '0.25rem', color: b.balance_amount > 0 ? 'var(--danger)' : 'var(--success)' }}>
                    Bal: ₹{b.balance_amount}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
