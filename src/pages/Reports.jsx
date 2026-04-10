import React, { useState, useEffect } from 'react';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { Download, FileText } from 'lucide-react';
import html2pdf from 'html2pdf.js';
import { useSettingsStore } from '../lib/store';

export default function Reports() {
  const { resortName, logoUrl } = useSettingsStore();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchReports = async () => {
      if (!isSupabaseConfigured()) { setLoading(false); return; }
      try {
        const [inc, exp, bks] = await Promise.all([
          supabase.from('incomes').select('*'),
          supabase.from('expenses').select('*'),
          supabase.from('bookings').select('*')
        ]);
        
        setData({
          incomes: inc.data || [],
          expenses: exp.data || [],
          bookings: bks.data || []
        });
      } catch(err) {
        console.error(err);
      } finally { setLoading(false); }
    };
    fetchReports();
  }, []);

  const totalRevenue = data?.incomes.reduce((acc, curr) => acc + Number(curr.amount), 0) || 0;
  const totalExpenses = data?.expenses.reduce((acc, curr) => acc + Number(curr.amount), 0) || 0;
  const netProfit = totalRevenue - totalExpenses;

  const handleExportPDF = () => {
    const element = document.getElementById('report-container');
    const opt = {
      margin: 1,
      filename: `${resortName.replace(/\s+/g, '_')}_Report.pdf`,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { scale: 2 },
      jsPDF: { unit: 'in', format: 'letter', orientation: 'portrait' }
    };
    html2pdf().set(opt).from(element).save();
  };

  if(loading) return <div>Loading...</div>;

  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <h2 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}><FileText /> Financial & Booking Reports</h2>
        <button className="btn btn-primary" onClick={handleExportPDF}><Download size={18}/> Export PDF</button>
      </div>

      <div id="report-container" style={{ padding: '0 1rem' }}>
        <div style={{ textAlign: 'center', marginBottom: '2rem', borderBottom: '2px solid var(--border)', paddingBottom: '1rem' }}>
          {logoUrl && <img src={logoUrl} alt="Logo" style={{ maxHeight: '60px', marginBottom: '1rem' }} />}
          <h1 style={{ margin: 0, color: 'var(--text-main)' }}>{resortName}</h1>
          <p style={{ color: 'var(--text-muted)' }}>Financial Summary Report</p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem', marginBottom: '2rem' }}>
          <div style={{ padding: '1rem', background: 'var(--bg-color)', borderRadius: 'var(--radius-md)' }}>
            <h4 style={{ color: 'var(--text-muted)' }}>Total Revenue</h4>
            <h2 style={{ color: 'var(--success)' }}>₹{totalRevenue.toLocaleString()}</h2>
          </div>
          <div style={{ padding: '1rem', background: 'var(--bg-color)', borderRadius: 'var(--radius-md)' }}>
            <h4 style={{ color: 'var(--text-muted)' }}>Total Expenses</h4>
            <h2 style={{ color: 'var(--danger)' }}>₹{totalExpenses.toLocaleString()}</h2>
          </div>
          <div style={{ padding: '1rem', background: 'var(--bg-color)', borderRadius: 'var(--radius-md)' }}>
            <h4 style={{ color: 'var(--text-muted)' }}>Net Profit</h4>
            <h2 style={{ color: 'var(--primary)' }}>₹{netProfit.toLocaleString()}</h2>
          </div>
        </div>

        <h3 style={{ borderBottom: '1px solid var(--border)', paddingBottom: '0.5rem', marginBottom: '1rem', marginTop: '2rem' }}>Recent Bookings</h3>
        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '2rem', fontSize: '0.875rem' }}>
          <thead>
            <tr style={{ background: 'var(--bg-color)' }}>
              <th style={{ padding: '0.5rem', textAlign: 'left', borderBottom: '1px solid var(--border)' }}>Ref #</th>
              <th style={{ padding: '0.5rem', textAlign: 'left', borderBottom: '1px solid var(--border)' }}>Guest</th>
              <th style={{ padding: '0.5rem', textAlign: 'left', borderBottom: '1px solid var(--border)' }}>Dates</th>
              <th style={{ padding: '0.5rem', textAlign: 'right', borderBottom: '1px solid var(--border)' }}>Total</th>
            </tr>
          </thead>
          <tbody>
            {data?.bookings.slice(0, 10).map(b => (
              <tr key={b.id}>
                <td style={{ padding: '0.5rem', borderBottom: '1px solid var(--border)', fontWeight: 'bold', color: 'var(--primary)' }}>{b.reference_number || 'N/A'}</td>
                <td style={{ padding: '0.5rem', borderBottom: '1px solid var(--border)' }}>{b.guest_name}</td>
                <td style={{ padding: '0.5rem', borderBottom: '1px solid var(--border)' }}>{new Date(b.check_in_date).toLocaleDateString()}</td>
                <td style={{ padding: '0.5rem', borderBottom: '1px solid var(--border)', textAlign: 'right' }}>₹{b.total_amount}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <h3 style={{ borderBottom: '1px solid var(--border)', paddingBottom: '0.5rem', marginBottom: '1rem' }}>Recent Expenses</h3>
        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '2rem', fontSize: '0.875rem' }}>
          <thead>
            <tr style={{ background: 'var(--bg-color)' }}>
              <th style={{ padding: '0.5rem', textAlign: 'left', borderBottom: '1px solid var(--border)' }}>Date</th>
              <th style={{ padding: '0.5rem', textAlign: 'left', borderBottom: '1px solid var(--border)' }}>Category</th>
              <th style={{ padding: '0.5rem', textAlign: 'right', borderBottom: '1px solid var(--border)' }}>Amount</th>
            </tr>
          </thead>
          <tbody>
            {data?.expenses.slice(0, 10).map(e => (
              <tr key={e.id}>
                <td style={{ padding: '0.5rem', borderBottom: '1px solid var(--border)' }}>{e.date}</td>
                <td style={{ padding: '0.5rem', borderBottom: '1px solid var(--border)' }}>{e.category}</td>
                <td style={{ padding: '0.5rem', borderBottom: '1px solid var(--border)', textAlign: 'right' }}>₹{e.amount}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <p style={{ textAlign: 'center', fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '3rem' }}>
          Generated by Hotel Manager on {new Date().toLocaleDateString()}
        </p>
      </div>
    </div>
  );
}
