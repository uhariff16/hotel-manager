import React, { useState, useEffect, useMemo } from 'react';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { Download, FileText, Filter, Table as TableIcon, CreditCard, Wallet, TrendingDown, CalendarCheck, CheckCircle2, UserCheck } from 'lucide-react';
import html2pdf from 'html2pdf.js';
import * as XLSX from 'xlsx';
import { useSettingsStore } from '../lib/store';
import { startOfMonth, endOfMonth, format } from 'date-fns';

export default function Reports() {
  const { activeResortId, resorts, session, profile } = useSettingsStore();
  const activeResort = resorts.find(r => r.id === activeResortId);
  
  const [data, setData] = useState({ incomes: [], expenses: [], bookings: [], cottages: [], rooms: [] });
  const [loading, setLoading] = useState(true);
  
  const [range, setRange] = useState({
    start: `${new Date().getFullYear()}-01-01`,
    end: `${new Date().getFullYear()}-12-31`
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

  const totalCollections = data.incomes.reduce((acc, curr) => acc + Number(curr.amount || 0), 0);
  const totalExpenses = data.expenses.reduce((acc, curr) => acc + Number(curr.amount || 0), 0);
  const netProfit = totalCollections - totalExpenses;

  const validBookings = data.bookings.filter(b => b.status !== 'Cancelled');
  const completedBookings = data.bookings.filter(b => b.status === 'Completed');
  const completedValue = completedBookings.reduce((acc, b) => acc + Number(b.total_amount || 0), 0);
  const completedGuests = completedBookings.reduce((acc, b) => acc + (Number(b.adults_count || 0) + Number(b.kids_count || 0)), 0);

  const [bookingSort, setBookingSort] = useState({ key: 'check_in_date', direction: 'ascending' });
  const [incomeSort, setIncomeSort] = useState({ key: 'date', direction: 'descending' });
  const [expenseSort, setExpenseSort] = useState({ key: 'date', direction: 'descending' });

  const genericSort = (dataArray, config) => {
    let sortableItems = [...(dataArray || [])];
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

  const [searchTerm, setSearchTerm] = useState('');
  
  const filteredBookings = useMemo(() => {
    return data.bookings.filter(b => 
      (b.guest_name?.toLowerCase().includes(searchTerm.toLowerCase()) || 
       b.reference_number?.toLowerCase().includes(searchTerm.toLowerCase()))
    );
  }, [data.bookings, searchTerm]);

  const requestSort = (key) => {
    let direction = 'ascending';
    if (bookingSort.key === key && bookingSort.direction === 'ascending') direction = 'descending';
    setBookingSort({ key, direction });
  };

  const sortedBookings = useMemo(() => genericSort(filteredBookings, bookingSort), [filteredBookings, bookingSort]);
  const sortedIncomes = useMemo(() => genericSort(data.incomes, incomeSort), [data.incomes, incomeSort]);
  const sortedExpenses = useMemo(() => genericSort(data.expenses, expenseSort), [data.expenses, expenseSort]);

  const setMonthRange = (monthIdx) => {
    const year = new Date().getFullYear();
    const start = format(new Date(year, monthIdx, 1), 'yyyy-MM-dd');
    const end = format(endOfMonth(new Date(year, monthIdx, 1)), 'yyyy-MM-dd');
    setRange({ start, end });
  };

  const setYearRange = () => {
    const year = new Date().getFullYear();
    setRange({ start: `${year}-01-01`, end: `${year}-12-31` });
  };

  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const currentMonthIdx = useMemo(() => {
    const d = new Date(range.start);
    const dEnd = new Date(range.end);
    // Only highlight month if it's a single month range
    if (d.getMonth() === dEnd.getMonth() && d.getFullYear() === dEnd.getFullYear()) {
        return d.getMonth();
    }
    return -1;
  }, [range.start, range.end]);

  const isFullYear = useMemo(() => {
    const year = new Date().getFullYear();
    return range.start === `${year}-01-01` && range.end === `${year}-12-31`;
  }, [range.start, range.end]);

  const SortIcon = ({ column }) => {
    if (bookingSort.key !== column) return <span style={{ opacity: 0.2, marginLeft: '4px' }}>↕</span>;
    return <span style={{ marginLeft: '4px', color: 'var(--primary)' }}>{bookingSort.direction === 'ascending' ? '↑' : '↓'}</span>;
  };

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
    const summaryData = [
      ["Report Type", "Financial Performance Summary"],
      ["Resort", activeResort?.name || "N/A"],
      ["Period", `${range.start} to ${range.end}`],
      ["Generated At", new Date().toLocaleString()],
      [],
      ["Metric", "Value (₹)"],
      ["Total Collections (Cash)", totalCollections],
      ["Total Expenses", totalExpenses],
      ["Net Cash Profit", netProfit],
      [],
      ["Stay Metrics", "Count"],
      ["Valid Bookings", validBookings.length],
      ["Completed Stays", completedBookings.length],
      ["Total Guests Served", completedGuests]
    ];
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(summaryData), "Summary");

    const bookingsData = data.bookings.map(b => {
      const total = Number(b.total_amount || 0);
      const paid = Number(b.advance_paid || 0);
      return {
        "Ref #": b.reference_number,
        "Guest Name": b.guest_name,
        "Status": b.status,
        "Check-in": b.check_in_date,
        "Check-out": b.check_out_date,
        "Total Value": total,
        "Paid": paid,
        "Balance": total - paid
      };
    });
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(bookingsData), "Bookings_Detail");
    XLSX.writeFile(workbook, `${(activeResort?.name || 'Hotel').replace(/\s+/g, '_')}_Report.xlsx`);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', minHeight: '100vh', background: 'var(--bg-color)' }}>
      <div className="card" style={{ padding: '1rem 1.5rem', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.05)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
          <h2 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.75rem', fontSize: '1.5rem', fontWeight: 800 }}>
            <FileText size={28} color="var(--primary)" /> Reports & Analytics
          </h2>
          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <button className="btn btn-outline" onClick={handleExportExcel} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <TableIcon size={18}/> <span className="desktop-only">Export Excel</span>
            </button>
            <button className="btn btn-primary" onClick={handleExportPDF} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Download size={18}/> <span className="desktop-only">Export PDF</span>
            </button>
          </div>
        </div>
      </div>

      <div className="reports-layout" style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: '2rem', alignItems: 'start' }}>
        <aside style={{ position: 'sticky', top: '2rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          <div className="card" style={{ border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.05)' }}>
            <h3 style={{ fontSize: '1rem', marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 700 }}>
              <Filter size={18} color="var(--primary)"/> Report Range
            </h3>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '1.5rem' }}>
              <button 
                onClick={setYearRange}
                style={{ 
                  width: '100%',
                  padding: '0.6rem', 
                  fontSize: '0.8rem', 
                  fontWeight: 800, 
                  borderRadius: '8px',
                  border: isFullYear ? '1px solid var(--primary)' : '1px solid var(--border)',
                  background: isFullYear ? 'var(--primary)' : 'var(--bg-secondary)',
                  color: isFullYear ? 'white' : 'var(--text-main)',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '0.5rem'
                }}
              >
                <CalendarCheck size={16} /> Full Year {new Date().getFullYear()}
              </button>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.5rem' }}>
                {months.map((m, i) => (
                  <button 
                    key={m} 
                    onClick={() => setMonthRange(i)}
                    style={{ 
                      padding: '0.4rem 0.2rem', 
                      fontSize: '0.7rem', 
                      fontWeight: 700, 
                      borderRadius: '6px',
                      border: currentMonthIdx === i ? '1px solid var(--primary)' : '1px solid var(--border)',
                      background: currentMonthIdx === i ? 'var(--primary)' : 'white',
                      color: currentMonthIdx === i ? 'white' : 'var(--text-main)',
                      cursor: 'pointer',
                      transition: 'all 0.2s'
                    }}
                  >
                    {m}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', borderTop: '1px solid var(--border)', paddingTop: '1.5rem' }}>
              <div className="form-group">
                <label className="form-label" style={{ fontSize: '0.75rem', fontWeight: 700 }}>START DATE</label>
                <input type="date" className="form-input" value={range.start} onChange={e => setRange({...range, start: e.target.value})} />
              </div>
              <div className="form-group">
                <label className="form-label" style={{ fontSize: '0.75rem', fontWeight: 700 }}>END DATE</label>
                <input type="date" className="form-input" value={range.end} onChange={e => setRange({...range, end: e.target.value})} />
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div className="card" style={{ border: 'none', background: 'linear-gradient(135deg, #2f855a 0%, #48bb78 100%)', color: 'white', padding: '1.25rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                <span style={{ fontSize: '0.75rem', fontWeight: 700, opacity: 0.8 }}>COLLECTIONS</span>
                <Wallet size={20} opacity={0.8} />
              </div>
              <h2 style={{ fontSize: '1.75rem', fontWeight: 800, margin: 0 }}>₹{(totalCollections || 0).toLocaleString()}</h2>
              <p style={{ fontSize: '0.7rem', margin: '0.5rem 0 0', opacity: 0.8 }}>Actual cash received in this period</p>
            </div>

            <div className="card" style={{ border: 'none', background: 'white', padding: '1.25rem', boxShadow: '0 4px 12px rgba(0,0,0,0.05)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)' }}>COMPLETED VALUE</span>
                <CheckCircle2 size={20} color="var(--success)" />
              </div>
              <h2 style={{ fontSize: '1.5rem', fontWeight: 800, margin: 0, color: 'var(--text-main)' }}>₹{(completedValue || 0).toLocaleString()}</h2>
              <p style={{ fontSize: '0.7rem', margin: '0.5rem 0 0', color: 'var(--text-muted)' }}>{completedBookings.length} stays finalized</p>
            </div>

            <div className="card" style={{ border: 'none', background: 'white', padding: '1.25rem', boxShadow: '0 4px 12px rgba(0,0,0,0.05)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)' }}>EXPENSES</span>
                <TrendingDown size={20} color="var(--danger)" />
              </div>
              <h2 style={{ fontSize: '1.5rem', fontWeight: 800, margin: 0, color: 'var(--text-main)' }}>₹{(totalExpenses || 0).toLocaleString()}</h2>
            </div>

            <div className="card" style={{ border: 'none', background: 'var(--bg-secondary)', padding: '1.25rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--primary)' }}>NET PROFIT (CASH)</span>
                <CreditCard size={20} color="var(--primary)" />
              </div>
              <h2 style={{ fontSize: '1.5rem', fontWeight: 800, margin: 0, color: netProfit >= 0 ? 'var(--primary)' : 'var(--danger)' }}>
                ₹{(netProfit || 0).toLocaleString()}
              </h2>
            </div>
          </div>
        </aside>

        <main>
          {loading ? (
            <div className="card" style={{ textAlign: 'center', padding: '5rem', border: 'none' }}>
              <div className="animate-spin" style={{ width: '40px', height: '40px', border: '4px solid var(--primary)', borderTopColor: 'transparent', borderRadius: '50%', margin: '0 auto 1rem' }}></div>
              <p style={{ color: 'var(--text-muted)' }}>Analyzing resort performance...</p>
            </div>
          ) : (
            <div id="report-container" className="card" style={{ padding: '2rem', background: 'white', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.05)' }}>
              <div style={{ textAlign: 'center', marginBottom: '3rem', borderBottom: '1px solid #eee', paddingBottom: '2rem' }}>
                {activeResort?.logo_url && <img src={activeResort.logo_url} alt="Logo" style={{ maxHeight: '80px', marginBottom: '1.5rem' }} />}
                <h1 style={{ margin: 0, fontSize: '2rem', fontWeight: 800, color: 'var(--text-main)' }}>{activeResort?.name || 'Cheerful Chalet'}</h1>
                <p style={{ color: 'var(--text-muted)', fontSize: '1.1rem', margin: '0.5rem 0' }}>Stay & Financial Performance Report</p>
                <div style={{ display: 'inline-block', padding: '0.5rem 1.5rem', background: 'var(--bg-secondary)', borderRadius: '50px', fontSize: '0.85rem', fontWeight: 700, color: 'var(--primary)', marginTop: '0.5rem' }}>
                  {format(new Date(range.start), 'MMM dd, yyyy')} — {format(new Date(range.end), 'MMM dd, yyyy')}
                </div>
              </div>

              <section style={{ marginBottom: '4rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                  <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', margin: 0, fontSize: '1.25rem', fontWeight: 800 }}>
                    <CalendarCheck size={22} color="var(--primary)" /> Booking & Stay Details
                  </h3>
                  <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                    <div style={{ position: 'relative' }}>
                      <input 
                        type="text" 
                        placeholder="Search guest or ref..." 
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                        style={{ padding: '0.5rem 1rem', paddingLeft: '2.25rem', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '0.85rem', width: '240px' }}
                      />
                      <Filter size={14} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: '#a0aec0' }} />
                    </div>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                      {sortedBookings.length} records found
                    </span>
                  </div>
                </div>
                
                <div className="table-container" style={{ borderRadius: '12px', border: '1px solid #f0f0f0', overflowY: 'auto', maxHeight: '600px' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                    <thead style={{ position: 'sticky', top: 0, zIndex: 10, background: '#fcfcfc' }}>
                      <tr style={{ borderBottom: '2px solid #f0f0f0' }}>
                        <th onClick={() => requestSort('guest_name')} style={{ padding: '1rem', textAlign: 'left', cursor: 'pointer', whiteSpace: 'nowrap' }}>GUEST / REF <SortIcon column="guest_name"/></th>
                        <th onClick={() => requestSort('check_in_date')} style={{ padding: '1rem', textAlign: 'left', cursor: 'pointer', whiteSpace: 'nowrap' }}>DATES <SortIcon column="check_in_date"/></th>
                        <th style={{ padding: '1rem', textAlign: 'left' }}>SOURCE</th>
                        <th style={{ padding: '1rem', textAlign: 'center' }}>STATUS</th>
                        <th style={{ padding: '1rem', textAlign: 'right' }}>PAYMENT PROGRESS</th>
                        <th onClick={() => requestSort('total_amount')} style={{ padding: '1rem', textAlign: 'right', cursor: 'pointer', whiteSpace: 'nowrap' }}>TOTAL <SortIcon column="total_amount"/></th>
                      </tr>
                    </thead>
                    <tbody>
                      {sortedBookings.length === 0 ? (
                        <tr><td colSpan="6" style={{ textAlign: 'center', padding: '3rem', color: '#ccc' }}>No matching bookings found</td></tr>
                      ) : sortedBookings.map(b => {
                        const paid = Number(b.advance_paid || 0);
                        const total = Number(b.total_amount || 0);
                        const progress = total > 0 ? Math.min((paid / total) * 100, 100) : 0;
                        
                        return (
                          <tr key={b.id} className="table-row-hover" style={{ borderBottom: '1px solid #f9f9f9', transition: 'background 0.2s' }}>
                            <td style={{ padding: '1rem' }}>
                              <div style={{ fontWeight: 800 }}>{b.guest_name}</div>
                              <div style={{ fontSize: '0.7rem', color: 'var(--primary)', fontWeight: 700 }}>{b.reference_number}</div>
                            </td>
                            <td style={{ padding: '1rem', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                              {format(new Date(b.check_in_date), 'MMM dd')} - {format(new Date(b.check_out_date), 'MMM dd')}
                            </td>
                            <td style={{ padding: '1rem' }}>
                              <span style={{ fontSize: '0.7rem', padding: '3px 8px', borderRadius: '4px', background: '#f0f4ff', color: '#5a67d8', fontWeight: 800 }}>
                                {b.booking_source || 'Direct'}
                              </span>
                            </td>
                            <td style={{ padding: '1rem', textAlign: 'center' }}>
                              <span className={`badge badge-${b.status === 'Cancelled' ? 'danger' : b.status === 'Completed' ? 'success' : 'info'}`} style={{ fontSize: '0.65rem', padding: '4px 10px' }}>
                                {b.status}
                              </span>
                            </td>
                            <td style={{ padding: '1rem', textAlign: 'right' }}>
                               <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
                                 <div style={{ fontSize: '0.7rem', fontWeight: 700 }}>₹{paid.toLocaleString()} <span style={{ opacity: 0.5 }}>/ ₹{total.toLocaleString()}</span></div>
                                 <div style={{ width: '100px', height: '6px', background: '#eee', borderRadius: '10px', overflow: 'hidden' }}>
                                   <div style={{ width: `${progress}%`, height: '100%', background: progress >= 100 ? 'var(--success)' : 'var(--primary)' }}></div>
                                 </div>
                               </div>
                            </td>
                            <td style={{ padding: '1rem', textAlign: 'right', fontWeight: 800 }}>₹{total.toLocaleString()}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </section>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2.5rem' }}>
                <section>
                  <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.5rem', fontSize: '1.1rem', fontWeight: 800 }}>
                    <Wallet size={20} color="var(--success)" /> Income Log
                  </h3>
                  <div style={{ borderRadius: '12px', border: '1px solid #f0f0f0', overflow: 'hidden' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                      <thead style={{ background: '#fafafa' }}>
                        <tr>
                          <th style={{ padding: '0.75rem', textAlign: 'left' }}>DATE</th>
                          <th style={{ padding: '0.75rem', textAlign: 'left' }}>REF #</th>
                          <th style={{ padding: '0.75rem', textAlign: 'right' }}>AMOUNT</th>
                        </tr>
                      </thead>
                      <tbody>
                        {sortedIncomes.map(i => (
                          <tr key={i.id} style={{ borderBottom: '1px solid #f9f9f9' }}>
                            <td style={{ padding: '0.75rem' }}>{format(new Date(i.date), 'MMM dd')}</td>
                            <td style={{ padding: '0.75rem', fontWeight: 700, color: 'var(--primary)' }}>{i.bookings?.reference_number || 'N/A'}</td>
                            <td style={{ padding: '0.75rem', textAlign: 'right', fontWeight: 800, color: 'var(--success)' }}>+₹{Number(i.amount).toLocaleString()}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr style={{ background: '#fcfcfc', fontWeight: 800 }}>
                          <td colSpan="2" style={{ padding: '1rem' }}>TOTAL COLLECTIONS</td>
                          <td style={{ padding: '1rem', textAlign: 'right', color: 'var(--success)', fontSize: '1rem' }}>₹{totalCollections.toLocaleString()}</td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </section>

                <section>
                  <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.5rem', fontSize: '1.1rem', fontWeight: 800 }}>
                    <TrendingDown size={20} color="var(--danger)" /> Expense Log
                  </h3>
                  <div style={{ borderRadius: '12px', border: '1px solid #f0f0f0', overflow: 'hidden' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                      <thead style={{ background: '#fafafa' }}>
                        <tr>
                          <th style={{ padding: '0.75rem', textAlign: 'left' }}>DATE</th>
                          <th style={{ padding: '0.75rem', textAlign: 'left' }}>CATEGORY</th>
                          <th style={{ padding: '0.75rem', textAlign: 'right' }}>AMOUNT</th>
                        </tr>
                      </thead>
                      <tbody>
                        {sortedExpenses.map(e => (
                          <tr key={e.id} style={{ borderBottom: '1px solid #f9f9f9' }}>
                            <td style={{ padding: '0.75rem' }}>{format(new Date(e.date), 'MMM dd')}</td>
                            <td style={{ padding: '0.75rem' }}>{e.category}</td>
                            <td style={{ padding: '0.75rem', textAlign: 'right', fontWeight: 800, color: 'var(--danger)' }}>-₹{Number(e.amount).toLocaleString()}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr style={{ background: '#fcfcfc', fontWeight: 800 }}>
                          <td colSpan="2" style={{ padding: '1rem' }}>TOTAL EXPENSES</td>
                          <td style={{ padding: '1rem', textAlign: 'right', color: 'var(--danger)', fontSize: '1rem' }}>₹{totalExpenses.toLocaleString()}</td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </section>
              </div>

              <div style={{ marginTop: '5rem', borderTop: '2px solid #f0f0f0', paddingTop: '1.5rem', display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: '#bbb', fontWeight: 600 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <UserCheck size={14} /> Generated by: {session?.user?.email}
                </div>
                <div>System Timestamp: {format(new Date(), 'yyyy-MM-dd HH:mm:ss')}</div>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
