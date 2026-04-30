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
        supabase.from('incomes').select('*').eq('resort_id', activeResortId).gte('date', range.start).lte('date', range.end),
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
      ...data.incomes.map(i => ({ Type: 'Income', Date: i.date, Details: i.source, Mode: i.payment_mode, Amount: i.amount })),
      ...data.expenses.map(e => ({ Type: 'Expense', Date: e.date, Details: e.category, Mode: e.payment_mode, Amount: -e.amount }))
    ].sort((a,b) => new Date(a.Date) - new Date(b.Date));
    
    const financialSheet = XLSX.utils.json_to_sheet(financialRows);
    XLSX.utils.book_append_sheet(workbook, financialSheet, "Financials Log");

    const fileName = `${(activeResort?.name || 'Hotel').replace(/\s+/g, '_')}_Report.xlsx`;
    XLSX.writeFile(workbook, fileName);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      {/* Controls Card */}
      <div className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
          <h2 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}><FileText /> Reports</h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'var(--bg-color)', padding: '0.5rem 1rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)' }}>
             <Filter size={16} color="var(--primary)" />
             <input type="date" className="form-input" style={{ border: 'none', padding: 0, background: 'transparent' }} value={range.start} onChange={e => setRange({...range, start: e.target.value})} />
             <span>to</span>
             <input type="date" className="form-input" style={{ border: 'none', padding: 0, background: 'transparent' }} value={range.end} onChange={e => setRange({...range, end: e.target.value})} />
          </div>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <button className="btn btn-outline" onClick={profile?.plan_type === 'free' ? () => alert('Please upgrade to Pro or Premium to use Excel Export') : handleExportExcel} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', opacity: profile?.plan_type === 'free' ? 0.5 : 1 }}>
            <TableIcon size={18}/> {profile?.plan_type === 'free' ? 'Excel (Pro+)' : 'Export Excel'}
          </button>
          <button className="btn btn-primary" onClick={handleExportPDF} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Download size={18}/> Export PDF
          </button>
        </div>
      </div>

      {loading ? <div className="card" style={{ textAlign: 'center', padding: '3rem' }}>Loading report data...</div> : (
        <div id="report-container" style={{ padding: '1.5rem', background: 'white', borderRadius: '12px' }}>
          <div style={{ textAlign: 'center', marginBottom: '2.5rem', borderBottom: '2px solid #eee', paddingBottom: '1.5rem' }}>
            {activeResort?.logo_url && <img src={activeResort.logo_url} alt="Logo" style={{ maxHeight: '70px', marginBottom: '1rem' }} />}
            <h1 style={{ margin: 0, color: '#1a202c', fontSize: '2.2rem' }}>{activeResort?.name || 'Hotel Manager'}</h1>
            <p style={{ color: '#718096', marginTop: '0.5rem', fontSize: '1.1rem' }}>Financial Performance Report</p>
            <p style={{ color: '#a0aec0', fontSize: '0.9rem' }}>Period: {range.start} to {range.end}</p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1.5rem', marginBottom: '3rem' }}>
            <div style={{ padding: '1.5rem', border: '1px solid #e2e8f0', borderRadius: '12px', textAlign: 'center' }}>
              <div style={{ color: '#4a5568', fontSize: '0.9rem', textTransform: 'uppercase', fontWeight: 'bold', marginBottom: '0.5rem' }}>Total Revenue</div>
              <h2 style={{ color: '#2f855a', margin: 0, fontSize: '2rem' }}>₹{totalRevenue.toLocaleString()}</h2>
            </div>
            <div style={{ padding: '1.5rem', border: '1px solid #e2e8f0', borderRadius: '12px', textAlign: 'center' }}>
              <div style={{ color: '#4a5568', fontSize: '0.9rem', textTransform: 'uppercase', fontWeight: 'bold', marginBottom: '0.5rem' }}>Total Expenses</div>
              <h2 style={{ color: '#c53030', margin: 0, fontSize: '2rem' }}>₹{totalExpenses.toLocaleString()}</h2>
            </div>
            <div style={{ padding: '1.5rem', background: '#f7fafc', border: '1px solid #e2e8f0', borderRadius: '12px', textAlign: 'center' }}>
              <div style={{ color: '#4a5568', fontSize: '0.9rem', textTransform: 'uppercase', fontWeight: 'bold', marginBottom: '0.5rem' }}>Net Profit</div>
              <h2 style={{ color: '#3182ce', margin: 0, fontSize: '2rem' }}>₹{netProfit.toLocaleString()}</h2>
            </div>
            <div style={{ padding: '1.5rem', border: '1px solid #e2e8f0', borderRadius: '12px', textAlign: 'center' }}>
              <div style={{ color: '#4a5568', fontSize: '0.9rem', textTransform: 'uppercase', fontWeight: 'bold', marginBottom: '0.5rem' }}>Units Booked</div>
              <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: '0.25rem' }}>
                <div style={{ fontSize: '1.1rem', fontWeight: 'bold', color: '#2d3748' }}>{entirePropertyCount} <span style={{fontSize: '0.8rem', fontWeight: 'normal', color: '#718096'}}>Properties</span></div>
                <div style={{ fontSize: '1.1rem', fontWeight: 'bold', color: '#2d3748' }}>{roomsCount} <span style={{fontSize: '0.8rem', fontWeight: 'normal', color: '#718096'}}>Rooms</span></div>
              </div>
            </div>
          </div>

          {/* Bookings Table */}
          <div style={{ marginBottom: '3rem' }}>
            <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', borderBottom: '2px solid #edf2f7', paddingBottom: '0.75rem', marginBottom: '1rem', color: '#2d3748' }}>
              <CalendarCheck size={20} /> Booking Details
            </h3>
            <div style={{ maxHeight: '420px', overflowY: 'auto', border: '1px solid #edf2f7', borderRadius: '8px' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                <thead style={{ position: 'sticky', top: 0, zIndex: 1, background: '#f8fafc' }}>
                  <tr style={{ background: '#f8fafc' }}>
                    <th onClick={() => requestSort('booking', 'reference_number')} style={{ padding: '0.75rem', textAlign: 'left', borderBottom: '1px solid #e2e8f0', cursor: 'pointer', userSelect: 'none' }}>Ref # {bookingSort.key === 'reference_number' && (bookingSort.direction === 'ascending' ? '▲' : '▼')}</th>
                    <th onClick={() => requestSort('booking', 'guest_name')} style={{ padding: '0.75rem', textAlign: 'left', borderBottom: '1px solid #e2e8f0', cursor: 'pointer', userSelect: 'none' }}>Guest {bookingSort.key === 'guest_name' && (bookingSort.direction === 'ascending' ? '▲' : '▼')}</th>
                    <th onClick={() => requestSort('booking', 'check_in_date')} style={{ padding: '0.75rem', textAlign: 'left', borderBottom: '1px solid #e2e8f0', cursor: 'pointer', userSelect: 'none' }}>Dates {bookingSort.key === 'check_in_date' && (bookingSort.direction === 'ascending' ? '▲' : '▼')}</th>
                    <th onClick={() => requestSort('booking', 'booking_type')} style={{ padding: '0.75rem', textAlign: 'left', borderBottom: '1px solid #e2e8f0', cursor: 'pointer', userSelect: 'none' }}>Type & Details {bookingSort.key === 'booking_type' && (bookingSort.direction === 'ascending' ? '▲' : '▼')}</th>
                    <th onClick={() => requestSort('booking', 'status')} style={{ padding: '0.75rem', textAlign: 'left', borderBottom: '1px solid #e2e8f0', cursor: 'pointer', userSelect: 'none' }}>Status {bookingSort.key === 'status' && (bookingSort.direction === 'ascending' ? '▲' : '▼')}</th>
                    <th onClick={() => requestSort('booking', 'total_amount')} style={{ padding: '0.75rem', textAlign: 'right', borderBottom: '1px solid #e2e8f0', cursor: 'pointer', userSelect: 'none' }}>Total {bookingSort.key === 'total_amount' && (bookingSort.direction === 'ascending' ? '▲' : '▼')}</th>
                    <th onClick={() => requestSort('booking', 'advance_paid')} style={{ padding: '0.75rem', textAlign: 'right', borderBottom: '1px solid #e2e8f0', cursor: 'pointer', userSelect: 'none' }}>Advance {bookingSort.key === 'advance_paid' && (bookingSort.direction === 'ascending' ? '▲' : '▼')}</th>
                    <th onClick={() => requestSort('booking', 'balance_amount')} style={{ padding: '0.75rem', textAlign: 'right', borderBottom: '1px solid #e2e8f0', cursor: 'pointer', userSelect: 'none' }}>Balance {bookingSort.key === 'balance_amount' && (bookingSort.direction === 'ascending' ? '▲' : '▼')}</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedBookings.length === 0 ? <tr><td colSpan="8" style={{ textAlign: 'center', padding: '2rem', color: '#a0aec0' }}>No bookings in this range</td></tr> : sortedBookings.map(b => {
                    const cname = data.cottages.find(x => x.id === b.cottage_id)?.name || 'Unknown';
                    let rname = '';
                    if (b.booking_type === 'Entire Property') { rname = 'Entire Property'; }
                    else {
                      const arr = b.room_ids || (b.room_id ? [b.room_id] : []);
                      rname = arr.map(id => data.rooms.find(r => r.id === id)?.name).filter(Boolean).join(', ');
                    }
                    
                    return (
                    <tr key={b.id}>
                      <td style={{ padding: '0.75rem', borderBottom: '1px solid #edf2f7', fontWeight: 'bold', color: '#3182ce' }}>{b.reference_number || 'N/A'}</td>
                      <td style={{ padding: '0.75rem', borderBottom: '1px solid #edf2f7' }}>{b.guest_name}</td>
                      <td style={{ padding: '0.75rem', borderBottom: '1px solid #edf2f7' }}>
                        <div style={{ fontSize: '0.85rem' }}>{new Date(b.check_in_date).toLocaleDateString()}</div>
                        <div style={{ fontSize: '0.75rem', color: '#718096' }}>to {new Date(b.check_out_date).toLocaleDateString()}</div>
                      </td>
                      <td style={{ padding: '0.75rem', borderBottom: '1px solid #edf2f7' }}>
                         <div style={{ fontSize: '0.85rem', fontWeight: '500' }}>{b.booking_type}</div>
                         <div style={{ fontSize: '0.75rem', color: '#718096' }}>{cname} {rname !== 'Entire Property' ? `- ${rname}` : ''}</div>
                      </td>
                      <td style={{ padding: '0.75rem', borderBottom: '1px solid #edf2f7' }}>
                        <span className={`badge ${
                          b.status === 'Cancelled' ? 'badge-danger' : 
                          b.status === 'Pending' ? 'badge-warning' : 
                          b.status === 'Checked-in' ? 'badge-indigo' :
                          b.status === 'Completed' ? 'badge-success' :
                          'badge-info'
                        }`} style={{ fontSize: '0.7rem', padding: '0.2rem 0.5rem' }}>
                          {b.status}
                        </span>
                      </td>
                      <td style={{ padding: '0.75rem', borderBottom: '1px solid #edf2f7', textAlign: 'right' }}>₹{b.total_amount}</td>
                      <td style={{ padding: '0.75rem', borderBottom: '1px solid #edf2f7', textAlign: 'right', color: '#2f855a' }}>₹{b.advance_paid}</td>
                      <td style={{ padding: '0.75rem', borderBottom: '1px solid #edf2f7', textAlign: 'right', fontWeight: 'bold' }}>₹{b.balance_amount}</td>
                    </tr>
                  )})}
                </tbody>
              </table>
            </div>
          </div>

          {profile?.plan_type === 'free' ? (
            <div style={{ padding: '2rem', background: '#fffbeb', border: '1px dashed #d97706', borderRadius: '8px', textAlign: 'center' }}>
              <h3 style={{ color: '#b45309', marginBottom: '0.5rem' }}>Advanced Analytics Locked</h3>
              <p style={{ color: '#92400e', fontSize: '0.9rem' }}>Detailed Income and Expense tracking is available on the Pro and Premium plans.</p>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
              {/* Income Table */}
              <div>
                <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', borderBottom: '2px solid #edf2f7', paddingBottom: '0.75rem', marginBottom: '1rem', color: '#2d3748' }}>
                  <Wallet size={20} color="#2f855a" /> Incomes
                </h3>
                <div style={{ maxHeight: '420px', overflowY: 'auto', border: '1px solid #edf2f7', borderRadius: '8px' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                    <thead style={{ position: 'sticky', top: 0, zIndex: 1, background: '#f8fafc' }}>
                      <tr style={{ background: '#f8fafc' }}>
                        <th onClick={() => requestSort('income', 'date')} style={{ padding: '0.75rem', textAlign: 'left', borderBottom: '1px solid #e2e8f0', cursor: 'pointer', userSelect: 'none' }}>Date {incomeSort.key === 'date' && (incomeSort.direction === 'ascending' ? '▲' : '▼')}</th>
                        <th onClick={() => requestSort('income', 'source')} style={{ padding: '0.75rem', textAlign: 'left', borderBottom: '1px solid #e2e8f0', cursor: 'pointer', userSelect: 'none' }}>Source {incomeSort.key === 'source' && (incomeSort.direction === 'ascending' ? '▲' : '▼')}</th>
                        <th onClick={() => requestSort('income', 'amount')} style={{ padding: '0.75rem', textAlign: 'right', borderBottom: '1px solid #e2e8f0', cursor: 'pointer', userSelect: 'none' }}>Amount {incomeSort.key === 'amount' && (incomeSort.direction === 'ascending' ? '▲' : '▼')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sortedIncomes.length === 0 ? <tr><td colSpan="3" style={{ textAlign: 'center', padding: '1rem', color: '#a0aec0' }}>None</td></tr> : sortedIncomes.map(i => (
                        <tr key={i.id}>
                          <td style={{ padding: '0.75rem', borderBottom: '1px solid #edf2f7' }}>{i.date}</td>
                          <td style={{ padding: '0.75rem', borderBottom: '1px solid #edf2f7' }}>{i.source}</td>
                          <td style={{ padding: '0.75rem', borderBottom: '1px solid #edf2f7', textAlign: 'right', color: '#2f855a', fontWeight: 'bold' }}>+₹{i.amount}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Expense Table */}
              <div>
                <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', borderBottom: '2px solid #edf2f7', paddingBottom: '0.75rem', marginBottom: '1rem', color: '#2d3748' }}>
                  <TrendingDown size={20} color="#c53030" /> Expenses
                </h3>
                <div style={{ maxHeight: '420px', overflowY: 'auto', border: '1px solid #edf2f7', borderRadius: '8px' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                    <thead style={{ position: 'sticky', top: 0, zIndex: 1, background: '#f8fafc' }}>
                      <tr style={{ background: '#f8fafc' }}>
                        <th onClick={() => requestSort('expense', 'date')} style={{ padding: '0.75rem', textAlign: 'left', borderBottom: '1px solid #e2e8f0', cursor: 'pointer', userSelect: 'none' }}>Date {expenseSort.key === 'date' && (expenseSort.direction === 'ascending' ? '▲' : '▼')}</th>
                        <th onClick={() => requestSort('expense', 'category')} style={{ padding: '0.75rem', textAlign: 'left', borderBottom: '1px solid #e2e8f0', cursor: 'pointer', userSelect: 'none' }}>Category {expenseSort.key === 'category' && (expenseSort.direction === 'ascending' ? '▲' : '▼')}</th>
                        <th onClick={() => requestSort('expense', 'amount')} style={{ padding: '0.75rem', textAlign: 'right', borderBottom: '1px solid #e2e8f0', cursor: 'pointer', userSelect: 'none' }}>Amount {expenseSort.key === 'amount' && (expenseSort.direction === 'ascending' ? '▲' : '▼')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sortedExpenses.length === 0 ? <tr><td colSpan="3" style={{ textAlign: 'center', padding: '1rem', color: '#a0aec0' }}>None</td></tr> : sortedExpenses.map(e => (
                        <tr key={e.id}>
                          <td style={{ padding: '0.75rem', borderBottom: '1px solid #edf2f7' }}>{e.date}</td>
                          <td style={{ padding: '0.75rem', borderBottom: '1px solid #edf2f7' }}>{e.category}</td>
                          <td style={{ padding: '0.75rem', borderBottom: '1px solid #edf2f7', textAlign: 'right', color: '#c53030', fontWeight: 'bold' }}>-₹{e.amount}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          <div style={{ marginTop: '5rem', borderTop: '1px solid #edf2f7', paddingTop: '1rem', display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', color: '#a0aec0' }}>
            <span>Generated By: {session?.user?.email}</span>
            <span>Ref: {format(new Date(), 'yyyy-MM-dd HH:mm:ss')}</span>
          </div>
        </div>
      )}
    </div>
  );
}
