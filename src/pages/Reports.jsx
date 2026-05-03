import React, { useState, useEffect } from 'react';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { Download, FileText, Filter, Table as TableIcon, CreditCard, Wallet, TrendingDown, CalendarCheck } from 'lucide-react';
import html2pdf from 'html2pdf.js';
import * as XLSX from 'xlsx';
import { useSettingsStore } from '../lib/store';
import { startOfMonth, endOfMonth, format } from 'date-fns';

export default function Reports() {
  const { activeResortId, resorts, session, profile } = useSettingsStore();
  const activeResort = resorts.find(r => r.id === activeResortId);
  
  const [data, setData] = useState({ incomes: [], expenses: [], bookings: [], cottages: [], rooms: [] });
  const [loading, setLoading] = useState(true);
  
  // Date range state
  const [range, setRange] = useState({
    start: format(startOfMonth(new Date()), 'yyyy-MM-dd'),
    end: format(endOfMonth(new Date()), 'yyyy-MM-dd')
  });

  useEffect(() => {
    fetchReports();
  }, [activeResortId, range]);

  const fetchReports = async () => {
    if (!isSupabaseConfigured() || !activeResortId) { setLoading(false); return; }
    try {
      setLoading(true);
      const [inc, exp, bks, cts, rms] = await Promise.all([
        supabase.from('incomes').select('*, bookings(reference_number)').eq('resort_id', activeResortId).gte('date', range.start).lte('date', range.end),
        supabase.from('expenses').select('*').eq('resort_id', activeResortId).gte('date', range.start).lte('date', range.end),
        supabase.from('bookings').select('*').eq('resort_id', activeResortId).gte('check_in_date', range.start).lte('check_in_date', range.end),
        supabase.from('cottages').select('*').eq('resort_id', activeResortId),
        supabase.from('rooms').select('*').eq('resort_id', activeResortId)
      ]);
      
      setData({
        incomes: inc.data || [],
        expenses: exp.data || [],
        bookings: bks.data || [],
        cottages: cts.data || [],
        rooms: rms.data || []
      });
    } catch(err) {
      console.error(err);
    } finally { setLoading(false); }
  };

  const totalRevenue = data.incomes.reduce((acc, curr) => acc + Number(curr.amount), 0);
  const totalExpenses = data.expenses.reduce((acc, curr) => acc + Number(curr.amount), 0);
  const netProfit = totalRevenue - totalExpenses;

  // Aggregate Units Booked
  const validBookings = data.bookings.filter(b => b.status !== 'Cancelled');
  const entirePropertyCount = validBookings.filter(b => b.booking_type === 'Entire Property').length;
  const roomBookings = validBookings.filter(b => b.booking_type === 'Room');
  const roomsCount = roomBookings.reduce((acc, b) => acc + (b.room_ids?.length || (b.room_id ? 1 : 0)), 0);

  // Sorting States
  const [bookingSort, setBookingSort] = useState({ key: 'check_in_date', direction: 'ascending' });
  const [incomeSort, setIncomeSort] = useState({ key: 'date', direction: 'descending' });
  const [expenseSort, setExpenseSort] = useState({ key: 'date', direction: 'descending' });

  const requestSort = (type, key) => {
    let direction = 'ascending';
    if (type === 'booking') {
      if (bookingSort.key === key && bookingSort.direction === 'ascending') direction = 'descending';
      setBookingSort({ key, direction });
    } else if (type === 'income') {
      if (incomeSort.key === key && incomeSort.direction === 'ascending') direction = 'descending';
      setIncomeSort({ key, direction });
    } else if (type === 'expense') {
      if (expenseSort.key === key && expenseSort.direction === 'ascending') direction = 'descending';
      setExpenseSort({ key, direction });
    }
  };

  const genericSort = (dataArray, config) => {
    let sortableItems = [...dataArray];
    if (config !== null) {
      sortableItems.sort((a, b) => {
        let valA = a[config.key];
        let valB = b[config.key];
        if (typeof valA === 'string' && typeof valB === 'string') {
          valA = valA.toLowerCase(); valB = valB.toLowerCase();
        }
        if (valA < valB) return config.direction === 'ascending' ? -1 : 1;
        if (valA > valB) return config.direction === 'ascending' ? 1 : -1;
        return 0;
      });
    }
    return sortableItems;
  };

  const sortedBookings = React.useMemo(() => genericSort(data.bookings, bookingSort), [data.bookings, bookingSort]);
  const sortedIncomes = React.useMemo(() => genericSort(data.incomes, incomeSort), [data.incomes, incomeSort]);
  const sortedExpenses = React.useMemo(() => genericSort(data.expenses, expenseSort), [data.expenses, expenseSort]);


  const handleExportPDF = () => {
    const element = document.getElementById('report-container');
    const resortName = activeResort?.name || 'Hotel_Manager';
    const opt = {
      margin: [0.5, 0.5],
      filename: `${resortName.replace(/\s+/g, '_')}_Report_${range.start}_to_${range.end}.pdf`,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true },
      jsPDF: { unit: 'in', format: 'letter', orientation: 'portrait' }
    };
    html2pdf().set(opt).from(element).save();
  };

  const handleExportExcel = () => {
    const workbook = XLSX.utils.book_new();

    // 1. Summary Sheet
    const summaryData = [
      ["Report Type", "Financial Summary"],
      ["Resort", activeResort?.name || "N/A"],
      ["Period", `${range.start} to ${range.end}`],
      ["Generated By", session?.user?.email || "Admin"],
      ["Generated At", new Date().toLocaleString()],
      [],
      ["Metric", "Value (₹)"],
      ["Total Revenue", totalRevenue],
      ["Total Expenses", totalExpenses],
      ["Net Profit", netProfit]
    ];
    const summarySheet = XLSX.utils.aoa_to_sheet(summaryData);
    XLSX.utils.book_append_sheet(workbook, summarySheet, "Summary");

    // 2. Bookings Sheet
    const bookingsData = data.bookings.map(b => ({
      "Ref #": b.reference_number,
      "Guest Name": b.guest_name,
      "Phone": b.phone_number,
      "Check-in": b.check_in_date,
      "Check-out": b.check_out_date,
      "Status": b.status,
      "Total Amount": b.total_amount,
      "Advance Paid": b.advance_paid,
      "Balance": b.balance_amount
    }));
    const bookingsSheet = XLSX.utils.json_to_sheet(bookingsData);
    XLSX.utils.book_append_sheet(workbook, bookingsSheet, "Bookings");

    // 3. Financials Sheet (Combined Incomes & Expenses)
    const financialRows = [
      ...data.incomes.map(i => ({ Type: 'Income', Date: i.date, "Ref #": i.bookings?.reference_number || 'N/A', Details: i.source, Mode: i.payment_mode, Amount: i.amount })),
      ...data.expenses.map(e => ({ Type: 'Expense', Date: e.date, "Ref #": 'N/A', Details: e.category, Mode: e.payment_mode, Amount: -e.amount }))
    ].sort((a,b) => new Date(a.Date) - new Date(b.Date));
    
    const financialSheet = XLSX.utils.json_to_sheet(financialRows);
    XLSX.utils.book_append_sheet(workbook, financialSheet, "Financials Log");

    const fileName = `${(activeResort?.name || 'Hotel').replace(/\s+/g, '_')}_Report.xlsx`;
    XLSX.writeFile(workbook, fileName);
  };  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Page Header */}
      <div className="card" style={{ padding: '1rem 1.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
          <h2 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.75rem', fontSize: '1.5rem' }}><FileText size={28} color="var(--primary)" /> Reports & Analytics</h2>
          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <button className="btn btn-outline" onClick={profile?.plan_type === 'free' ? () => alert('Please upgrade to Pro or Premium to use Excel Export') : handleExportExcel} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', opacity: profile?.plan_type === 'free' ? 0.5 : 1 }}>
              <TableIcon size={18}/> <span className="desktop-only">{profile?.plan_type === 'free' ? 'Excel (Pro+)' : 'Export Excel'}</span>
            </button>
            <button className="btn btn-primary" onClick={handleExportPDF} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Download size={18}/> <span className="desktop-only">Export PDF</span>
            </button>
          </div>
        </div>
      </div>

      <div className="reports-layout" style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: '2rem', alignItems: 'start' }}>
        {/* Sidebar: Controls & Summary */}
        <aside style={{ position: 'sticky', top: '2rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {/* Filters */}
          <div className="card">
            <h3 style={{ fontSize: '1rem', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}><Filter size={18}/> Date Filter</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <div className="form-group">
                <label className="form-label" style={{ fontSize: '0.75rem' }}>Start Date</label>
                <input type="date" className="form-input" value={range.start} onChange={e => setRange({...range, start: e.target.value})} />
              </div>
              <div className="form-group">
                <label className="form-label" style={{ fontSize: '0.75rem' }}>End Date</label>
                <input type="date" className="form-input" value={range.end} onChange={e => setRange({...range, end: e.target.value})} />
              </div>
            </div>
          </div>

          {/* Summary Vertical Stack */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ padding: '1.25rem', border: '1px solid #e2e8f0', borderRadius: '16px', background: '#fff', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
                <Wallet color="#2f855a" size={20}/>
                <span style={{ color: '#718096', fontSize: '0.75rem', textTransform: 'uppercase', fontWeight: '800', letterSpacing: '0.05em' }}>Revenue</span>
              </div>
              <h2 style={{ color: '#2d3748', margin: 0, fontSize: '1.5rem', fontWeight: '800' }}>₹{totalRevenue.toLocaleString()}</h2>
            </div>

            <div style={{ padding: '1.25rem', border: '1px solid #e2e8f0', borderRadius: '16px', background: '#fff', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
                <TrendingDown color="#e53e3e" size={20}/>
                <span style={{ color: '#718096', fontSize: '0.75rem', textTransform: 'uppercase', fontWeight: '800', letterSpacing: '0.05em' }}>Expenses</span>
              </div>
              <h2 style={{ color: '#2d3748', margin: 0, fontSize: '1.5rem', fontWeight: '800' }}>₹{totalExpenses.toLocaleString()}</h2>
            </div>

            <div style={{ padding: '1.25rem', background: 'linear-gradient(135deg, #ebf8ff 0%, #fff 100%)', border: '1px solid #bee3f8', borderRadius: '16px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
                <CreditCard color="#3182ce" size={20}/>
                <span style={{ color: '#718096', fontSize: '0.75rem', textTransform: 'uppercase', fontWeight: '800', letterSpacing: '0.05em' }}>Net Profit</span>
              </div>
              <h2 style={{ color: netProfit >= 0 ? '#2b6cb0' : '#c53030', margin: 0, fontSize: '1.5rem', fontWeight: '800' }}>₹{netProfit.toLocaleString()}</h2>
            </div>

            <div style={{ padding: '1.25rem', border: '1px solid #e2e8f0', borderRadius: '16px', background: '#fff', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
                <CalendarCheck color="#805ad5" size={20}/>
                <span style={{ color: '#718096', fontSize: '0.75rem', textTransform: 'uppercase', fontWeight: '800', letterSpacing: '0.05em' }}>Occupancy</span>
              </div>
              <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                <div><span style={{ fontSize: '1.1rem', fontWeight: '800' }}>{entirePropertyCount}</span> <span style={{ fontSize: '0.65rem', color: '#718096', fontWeight: 'bold' }}>PROP</span></div>
                <div style={{ width: '1px', height: '15px', background: '#e2e8f0' }}></div>
                <div><span style={{ fontSize: '1.1rem', fontWeight: '800' }}>{roomsCount}</span> <span style={{ fontSize: '0.65rem', color: '#718096', fontWeight: 'bold' }}>ROOMS</span></div>
              </div>
            </div>
          </div>
        </aside>

        {/* Main Content: Tables */}
        <main>
          {loading ? (
            <div className="card" style={{ textAlign: 'center', padding: '5rem' }}>
              <div className="spinner" style={{ marginBottom: '1rem' }}></div>
              <p style={{ color: 'var(--text-muted)' }}>Preparing your report...</p>
            </div>
          ) : (
            <div id="report-container" className="card" style={{ padding: '2rem', background: 'white' }}>
              {/* Report Branding (Visible in PDF) */}
              <div style={{ textAlign: 'center', marginBottom: '2.5rem', borderBottom: '2px solid #eee', paddingBottom: '1.5rem' }}>
                {activeResort?.logo_url && <img src={activeResort.logo_url} alt="Logo" style={{ maxHeight: '60px', marginBottom: '1rem' }} />}
                <h1 style={{ margin: 0, color: '#1a202c', fontSize: '1.75rem' }}>{activeResort?.name || 'Hotel Manager'}</h1>
                <p style={{ color: '#718096', marginTop: '0.25rem', fontSize: '1rem', fontWeight: '500' }}>Financial Performance Report</p>
                <p style={{ color: '#a0aec0', fontSize: '0.85rem' }}>Period: {range.start} to {range.end}</p>
              </div>

              {/* Bookings Table */}
              <div style={{ marginBottom: '3rem' }}>
                <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', borderBottom: '2px solid #edf2f7', paddingBottom: '0.75rem', marginBottom: '1rem', color: '#2d3748', fontSize: '1.1rem' }}>
                  <CalendarCheck size={20} color="var(--primary)" /> Booking Details
                </h3>
                <div className="table-container" style={{ border: '1px solid #edf2f7', borderRadius: '8px' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                    <thead>
                      <tr style={{ background: '#f8fafc' }}>
                        <th onClick={() => requestSort('booking', 'reference_number')} style={{ padding: '0.75rem', textAlign: 'left', borderBottom: '1px solid #e2e8f0', cursor: 'pointer' }}>Ref #</th>
                        <th onClick={() => requestSort('booking', 'guest_name')} style={{ padding: '0.75rem', textAlign: 'left', borderBottom: '1px solid #e2e8f0', cursor: 'pointer' }}>Guest</th>
                        <th style={{ padding: '0.75rem', textAlign: 'left', borderBottom: '1px solid #e2e8f0' }}>Dates</th>
                        <th style={{ padding: '0.75rem', textAlign: 'left', borderBottom: '1px solid #e2e8f0' }}>Unit</th>
                        <th style={{ padding: '0.75rem', textAlign: 'left', borderBottom: '1px solid #e2e8f0' }}>Status</th>
                        <th style={{ padding: '0.75rem', textAlign: 'right', borderBottom: '1px solid #e2e8f0' }}>Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sortedBookings.length === 0 ? <tr><td colSpan="6" style={{ textAlign: 'center', padding: '2rem', color: '#a0aec0' }}>No bookings found</td></tr> : sortedBookings.map(b => (
                        <tr key={b.id}>
                          <td style={{ padding: '0.75rem', borderBottom: '1px solid #edf2f7', fontWeight: 'bold', color: '#3182ce' }}>{b.reference_number || 'N/A'}</td>
                          <td style={{ padding: '0.75rem', borderBottom: '1px solid #edf2f7' }}>{b.guest_name}</td>
                          <td style={{ padding: '0.75rem', borderBottom: '1px solid #edf2f7', fontSize: '0.75rem' }}>{b.check_in_date} to {b.check_out_date}</td>
                          <td style={{ padding: '0.75rem', borderBottom: '1px solid #edf2f7', fontSize: '0.75rem' }}>{b.booking_type}</td>
                          <td style={{ padding: '0.75rem', borderBottom: '1px solid #edf2f7' }}>
                            <span className={`badge badge-${b.status === 'Cancelled' ? 'danger' : b.status === 'Completed' ? 'success' : 'info'}`} style={{ fontSize: '0.65rem' }}>{b.status}</span>
                          </td>
                          <td style={{ padding: '0.75rem', borderBottom: '1px solid #edf2f7', textAlign: 'right', fontWeight: 'bold' }}>₹{b.total_amount}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="grid-2" style={{ gap: '2rem' }}>
                {/* Income Table */}
                <div>
                  <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', borderBottom: '2px solid #edf2f7', paddingBottom: '0.75rem', marginBottom: '1rem', color: '#2d3748', fontSize: '1.1rem' }}>
                    <Wallet size={20} color="#2f855a" /> Incomes
                  </h3>
                  <div className="table-container" style={{ border: '1px solid #edf2f7', borderRadius: '8px' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                      <thead style={{ background: '#f8fafc' }}>
                        <tr>
                          <th style={{ padding: '0.6rem', textAlign: 'left' }}>Date</th>
                          <th style={{ padding: '0.6rem', textAlign: 'left' }}>Ref #</th>
                          <th style={{ padding: '0.6rem', textAlign: 'right' }}>Amount</th>
                        </tr>
                      </thead>
                      <tbody>
                        {sortedIncomes.map(i => (
                          <tr key={i.id}>
                            <td style={{ padding: '0.6rem', borderBottom: '1px solid #edf2f7' }}>{i.date}</td>
                            <td style={{ padding: '0.6rem', borderBottom: '1px solid #edf2f7', fontWeight: '600', color: '#3182ce' }}>{i.bookings?.reference_number || 'N/A'}</td>
                            <td style={{ padding: '0.6rem', borderBottom: '1px solid #edf2f7', textAlign: 'right', color: '#2f855a', fontWeight: 'bold' }}>+₹{i.amount}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Expense Table */}
                <div>
                  <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', borderBottom: '2px solid #edf2f7', paddingBottom: '0.75rem', marginBottom: '1rem', color: '#2d3748', fontSize: '1.1rem' }}>
                    <TrendingDown size={20} color="#c53030" /> Expenses
                  </h3>
                  <div className="table-container" style={{ border: '1px solid #edf2f7', borderRadius: '8px' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                      <thead style={{ background: '#f8fafc' }}>
                        <tr>
                          <th style={{ padding: '0.6rem', textAlign: 'left' }}>Date</th>
                          <th style={{ padding: '0.6rem', textAlign: 'left' }}>Category</th>
                          <th style={{ padding: '0.6rem', textAlign: 'right' }}>Amount</th>
                        </tr>
                      </thead>
                      <tbody>
                        {sortedExpenses.map(e => (
                          <tr key={e.id}>
                            <td style={{ padding: '0.6rem', borderBottom: '1px solid #edf2f7' }}>{e.date}</td>
                            <td style={{ padding: '0.6rem', borderBottom: '1px solid #edf2f7' }}>{e.category}</td>
                            <td style={{ padding: '0.6rem', borderBottom: '1px solid #edf2f7', textAlign: 'right', color: '#c53030', fontWeight: 'bold' }}>-₹{e.amount}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

              {/* Footer */}
              <div style={{ marginTop: '4rem', borderTop: '1px solid #edf2f7', paddingTop: '1rem', display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', color: '#a0aec0' }}>
                <span>Report Generated By: {session?.user?.email}</span>
                <span>Timestamp: {format(new Date(), 'yyyy-MM-dd HH:mm:ss')}</span>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
