import React, { useState, useEffect, useMemo } from 'react';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { Download, FileText, Filter, Table as TableIcon, CreditCard, Wallet, TrendingDown, CalendarCheck, CheckCircle2, UserCheck, Users, Search } from 'lucide-react';
import html2pdf from 'html2pdf.js';
import { useSettingsStore } from '../lib/store';
import { startOfMonth, endOfMonth, format } from 'date-fns';

export default function Reports() {
  const { activeResortId, resorts, session } = useSettingsStore();
  const activeResort = resorts.find(r => r.id === activeResortId);
  
  const [data, setData] = useState({ incomes: [], expenses: [], bookings: [], cottages: [], rooms: [] });
  const [loading, setLoading] = useState(true);
  const [reportType, setReportType] = useState('summary'); // 'summary' | 'bookings' | 'guests' | 'finance'
  
  const [range, setRange] = useState({
    start: `${new Date().getFullYear()}-01-01`,
    end: `${new Date().getFullYear()}-12-31`
  });

  // Filters state
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [sourceFilter, setSourceFilter] = useState('All');
  const [paymentMethodFilter, setPaymentMethodFilter] = useState('All');
  const [expenseCategoryFilter, setExpenseCategoryFilter] = useState('All');

  useEffect(() => {
    fetchReports();
  }, [activeResortId, range]);

  const fetchReports = async () => {
    if (!isSupabaseConfigured() || !activeResortId) { setLoading(false); return; }
    try {
      setLoading(true);
      const [inc, exp, bks, cts, rms] = await Promise.all([
        supabase.from('incomes').select('*, bookings(reference_number, guest_name)').eq('resort_id', activeResortId).gte('date', range.start).lte('date', range.end),
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
      console.error("fetchReports error:", err);
    } finally { setLoading(false); }
  };

  // Base metrics for sidebar & summary view
  const totalCollections = data.incomes.reduce((acc, curr) => acc + Number(curr.amount || 0), 0);
  const totalExpenses = data.expenses.reduce((acc, curr) => acc + Number(curr.amount || 0), 0);
  const netProfit = totalCollections - totalExpenses;

  const validBookings = data.bookings.filter(b => b.status !== 'Cancelled');
  const completedBookings = data.bookings.filter(b => b.status === 'Completed');
  const completedValue = completedBookings.reduce((acc, b) => acc + Number(b.total_amount || 0), 0);
  const completedGuests = completedBookings.reduce((acc, b) => acc + (Number(b.adults_count || 0) + Number(b.kids_count || 0)), 0);

  // Sorting configs
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

  // Dynamic booking sources
  const bookingSources = useMemo(() => {
    const sources = new Set(data.bookings.map(b => b.booking_source || 'Direct'));
    return ['All', ...Array.from(sources)];
  }, [data.bookings]);

  // Filtered lists
  const filteredBookings = useMemo(() => {
    return data.bookings.filter(b => {
      const matchesSearch = (b.guest_name?.toLowerCase().includes(searchTerm.toLowerCase()) || 
                             b.reference_number?.toLowerCase().includes(searchTerm.toLowerCase()));
      const matchesStatus = statusFilter === 'All' || b.status === statusFilter;
      const matchesSource = sourceFilter === 'All' || (b.booking_source || 'Direct') === sourceFilter;
      return matchesSearch && matchesStatus && matchesSource;
    });
  }, [data.bookings, searchTerm, statusFilter, sourceFilter]);

  // Aggregate Guest Contacts
  const guestContacts = useMemo(() => {
    const contactsMap = {};
    data.bookings.forEach(b => {
      if (!b.guest_name) return;
      const key = `${b.guest_name.trim().toLowerCase()}_${b.phone_number?.trim() || ''}`;
      if (!contactsMap[key]) {
        contactsMap[key] = {
          name: b.guest_name,
          email: b.guest_email || '-',
          phone: b.phone_number || '-',
          bookingsCount: 0,
          latestBookingDate: b.check_in_date,
          latestRef: b.reference_number
        };
      }
      contactsMap[key].bookingsCount += 1;
      if (new Date(b.check_in_date) > new Date(contactsMap[key].latestBookingDate)) {
        contactsMap[key].latestBookingDate = b.check_in_date;
        contactsMap[key].latestRef = b.reference_number;
      }
    });

    return Object.values(contactsMap).filter(g => 
      g.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      g.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      g.phone.includes(searchTerm)
    );
  }, [data.bookings, searchTerm]);

  // Filtered Incomes
  const filteredIncomes = useMemo(() => {
    return data.incomes.filter(i => {
      const matchesSearch = i.bookings?.guest_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                            i.bookings?.reference_number?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                            (i.notes && i.notes.toLowerCase().includes(searchTerm.toLowerCase()));
      const matchesMethod = paymentMethodFilter === 'All' || i.payment_method === paymentMethodFilter;
      return matchesSearch && matchesMethod;
    });
  }, [data.incomes, searchTerm, paymentMethodFilter]);

  // Filtered Expenses
  const filteredExpenses = useMemo(() => {
    return data.expenses.filter(e => {
      const matchesSearch = e.category?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                            (e.description && e.description.toLowerCase().includes(searchTerm.toLowerCase())) ||
                            (e.paid_to && e.paid_to.toLowerCase().includes(searchTerm.toLowerCase()));
      const matchesCategory = expenseCategoryFilter === 'All' || e.category === expenseCategoryFilter;
      return matchesSearch && matchesCategory;
    });
  }, [data.expenses, searchTerm, expenseCategoryFilter]);

  // Unique lists for filters
  const paymentMethods = useMemo(() => {
    const methods = new Set(data.incomes.map(i => i.payment_method).filter(Boolean));
    return ['All', ...Array.from(methods)];
  }, [data.incomes]);

  const expenseCategories = useMemo(() => {
    const categories = new Set(data.expenses.map(e => e.category).filter(Boolean));
    return ['All', ...Array.from(categories)];
  }, [data.expenses]);

  const sortedBookings = useMemo(() => genericSort(filteredBookings, bookingSort), [filteredBookings, bookingSort]);
  const sortedIncomes = useMemo(() => genericSort(filteredIncomes, incomeSort), [filteredIncomes, incomeSort]);
  const sortedExpenses = useMemo(() => genericSort(filteredExpenses, expenseSort), [filteredExpenses, expenseSort]);

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
    if (d.getMonth() === dEnd.getMonth() && d.getFullYear() === dEnd.getFullYear()) {
        return d.getMonth();
    }
    return -1;
  }, [range.start, range.end]);

  const isFullYear = useMemo(() => {
    const year = new Date().getFullYear();
    return range.start === `${year}-01-01` && range.end === `${year}-12-31`;
  }, [range.start, range.end]);

  const requestSort = (key) => {
    let direction = 'ascending';
    if (bookingSort.key === key && bookingSort.direction === 'ascending') direction = 'descending';
    setBookingSort({ key, direction });
  };

  const SortIcon = ({ column }) => {
    if (bookingSort.key !== column) return <span style={{ opacity: 0.2, marginLeft: '4px' }}>↕</span>;
    return <span style={{ marginLeft: '4px', color: 'var(--primary)' }}>{bookingSort.direction === 'ascending' ? '↑' : '↓'}</span>;
  };

  const handleExportPDF = () => {
    const element = document.getElementById('report-container');
    const resortName = activeResort?.name || 'Hotel_Manager';
    const opt = {
      margin: [0.5, 0.5],
      filename: `${resortName.replace(/\s+/g, '_')}_${reportType}_Report_${range.start}_to_${range.end}.pdf`,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true },
      jsPDF: { unit: 'in', format: 'letter', orientation: 'portrait' }
    };
    html2pdf().set(opt).from(element).save();
  };

  const handleExportExcel = async () => {
    const XLSX = await import('xlsx-js-style');
    const workbook = XLSX.utils.book_new();

    const createStyledSheet = (dataAOA, colWidths, hasTotalRow = false) => {
      const sheet = XLSX.utils.aoa_to_sheet(dataAOA);
      const range = XLSX.utils.decode_range(sheet['!ref']);
      
      for (let C = range.s.c; C <= range.e.c; ++C) {
        const cellAddress = XLSX.utils.encode_cell({ r: 0, c: C });
        if (!sheet[cellAddress]) continue;
        sheet[cellAddress].s = {
          font: { bold: true, color: { rgb: "FFFFFF" }, name: "Arial", sz: 10 },
          fill: { fgColor: { rgb: "059669" } },
          alignment: { horizontal: "center", vertical: "center" },
          border: {
            top: { style: "thin", color: { rgb: "CCCCCC" } },
            bottom: { style: "thin", color: { rgb: "CCCCCC" } },
            left: { style: "thin", color: { rgb: "CCCCCC" } },
            right: { style: "thin", color: { rgb: "CCCCCC" } }
          }
        };
      }
      
      for (let R = 1; R <= range.e.r; ++R) {
        for (let C = range.s.c; C <= range.e.c; ++C) {
          const cellAddress = XLSX.utils.encode_cell({ r: R, c: C });
          if (!sheet[cellAddress]) continue;
          
          let s = {
             font: { name: "Arial", sz: 9 },
             border: {
               top: { style: "thin", color: { rgb: "EEEEEE" } },
               bottom: { style: "thin", color: { rgb: "EEEEEE" } },
               left: { style: "thin", color: { rgb: "EEEEEE" } },
               right: { style: "thin", color: { rgb: "EEEEEE" } }
             }
          };

          if (hasTotalRow && R === range.e.r) {
            s.font = { bold: true, name: "Arial", sz: 10 };
            s.fill = { fgColor: { rgb: "F8F9FA" } };
            s.border.top = { style: "medium", color: { rgb: "DDDDDD" } };
            s.border.bottom = { style: "medium", color: { rgb: "DDDDDD" } };
          }
          sheet[cellAddress].s = s;
        }
      }

      sheet['!cols'] = colWidths;
      return sheet;
    };

    const resortStr = (activeResort?.name || 'Hotel').replace(/\s+/g, '_');
    const periodStr = `${format(new Date(range.start), 'MMM_dd_yyyy')}_to_${format(new Date(range.end), 'MMM_dd_yyyy')}`;

    if (reportType === 'summary') {
      const summaryData = [
        ["Report Type", "Financial Performance Summary"],
        ["Resort", activeResort?.name || "N/A"],
        ["Period", `${format(new Date(range.start), 'dd MMM yyyy')} to ${format(new Date(range.end), 'dd MMM yyyy')}`],
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
      const summarySheet = XLSX.utils.aoa_to_sheet(summaryData);
      summarySheet['!cols'] = [{ wch: 25 }, { wch: 30 }];
      const sumRange = XLSX.utils.decode_range(summarySheet['!ref']);
      for(let r = 0; r <= sumRange.e.r; r++) {
         const cell = summarySheet[XLSX.utils.encode_cell({r, c:0})];
         if(cell) cell.s = { font: { bold: true, name: "Arial", sz: 10 } };
      }
      XLSX.utils.book_append_sheet(workbook, summarySheet, "Summary");
      XLSX.writeFile(workbook, `${resortStr}_Summary_Report_${periodStr}.xlsx`);

    } else if (reportType === 'bookings') {
      const bookingsHeaders = ["Ref #", "Guest Name", "Source", "Status", "Check-in", "Check-out", "Total Value", "Paid", "Balance"];
      const bookingsRows = sortedBookings.map(b => {
        const total = Number(b.total_amount || 0);
        const paid = Number(b.advance_paid || 0);
        return [
          b.reference_number,
          b.guest_name,
          b.booking_source || 'Direct',
          b.status,
          b.check_in_date,
          b.check_out_date,
          total,
          paid,
          total - paid
        ];
      });
      const totalBookingValue = bookingsRows.reduce((sum, r) => sum + r[6], 0);
      const totalBookingPaid = bookingsRows.reduce((sum, r) => sum + r[7], 0);
      const totalBookingBalance = bookingsRows.reduce((sum, r) => sum + r[8], 0);
      const bookingsAOA = [bookingsHeaders, ...bookingsRows, ["", "", "", "", "", "TOTAL", totalBookingValue, totalBookingPaid, totalBookingBalance]];
      XLSX.utils.book_append_sheet(workbook, createStyledSheet(bookingsAOA, [{wch:15}, {wch:25}, {wch:15}, {wch:12}, {wch:12}, {wch:12}, {wch:12}, {wch:12}, {wch:12}], true), "Bookings");
      XLSX.writeFile(workbook, `${resortStr}_Bookings_Report_${periodStr}.xlsx`);

    } else if (reportType === 'guests') {
      const guestHeaders = ["Guest Name", "Email", "Phone", "Bookings Count", "Latest Booking Ref", "Latest Stay Date"];
      const guestRows = guestContacts.map(g => [
        g.name,
        g.email,
        g.phone,
        g.bookingsCount,
        g.latestRef,
        g.latestBookingDate
      ]);
      XLSX.utils.book_append_sheet(workbook, createStyledSheet([guestHeaders, ...guestRows], [{wch:25}, {wch:30}, {wch:20}, {wch:15}, {wch:20}, {wch:15}]), "Guests Directory");
      XLSX.writeFile(workbook, `${resortStr}_Guest_Contacts_${periodStr}.xlsx`);

    } else if (reportType === 'finance') {
      const incomeHeaders = ["Date", "Ref #", "Guest Name", "Amount (₹)", "Method", "Notes"];
      const incomeRows = sortedIncomes.map(i => [
        i.date,
        i.bookings?.reference_number || '-',
        i.bookings?.guest_name || '-',
        Number(i.amount),
        i.payment_method || '-',
        i.notes || '-'
      ]);
      const totalIncome = incomeRows.reduce((sum, r) => sum + r[3], 0);
      const incomeAOA = [incomeHeaders, ...incomeRows, ["", "", "TOTAL COLLECTIONS", totalIncome, "", ""]];
      XLSX.utils.book_append_sheet(workbook, createStyledSheet(incomeAOA, [{wch:12}, {wch:15}, {wch:25}, {wch:15}, {wch:15}, {wch:30}], true), "Income Log");

      const expenseHeaders = ["Date", "Category", "Amount (₹)", "Paid To", "Notes"];
      const expenseRows = sortedExpenses.map(e => [
        e.date,
        e.category,
        Number(e.amount),
        e.paid_to || '-',
        e.description || '-'
      ]);
      const totalExpenseAmount = expenseRows.reduce((sum, r) => sum + r[2], 0);
      const expenseAOA = [expenseHeaders, ...expenseRows, ["", "TOTAL EXPENSES", totalExpenseAmount, "", ""]];
      XLSX.utils.book_append_sheet(workbook, createStyledSheet(expenseAOA, [{wch:12}, {wch:20}, {wch:15}, {wch:20}, {wch:35}], true), "Expense Log");

      XLSX.writeFile(workbook, `${resortStr}_Financials_${periodStr}.xlsx`);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', minHeight: '100vh', background: 'var(--bg-color)' }}>
      {/* Hide controls during PDF generation */}
      <style>{`
        @media print {
          .no-print { display: none !important; }
          .reports-layout { display: block !important; }
          aside { display: none !important; }
          main { width: 100% !important; }
        }
      `}</style>

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
          
          {/* Select Report View */}
          <div className="card" style={{ border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.05)', padding: '1.25rem' }}>
            <h3 style={{ fontSize: '0.95rem', marginBottom: '1rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <FileText size={16} color="var(--primary)"/> Report Type
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
              {[
                { id: 'summary', label: 'Performance Summary' },
                { id: 'bookings', label: 'Booking Details' },
                { id: 'guests', label: 'Guest Contacts' },
                { id: 'finance', label: 'Income & Expenses' }
              ].map(opt => (
                <button
                  key={opt.id}
                  onClick={() => {
                    setReportType(opt.id);
                    setSearchTerm('');
                  }}
                  style={{
                    width: '100%',
                    padding: '0.75rem 1rem',
                    borderRadius: '8px',
                    border: 'none',
                    textAlign: 'left',
                    background: reportType === opt.id ? 'rgba(5, 150, 105, 0.08)' : 'transparent',
                    color: reportType === opt.id ? 'var(--primary)' : 'var(--text-main)',
                    fontWeight: reportType === opt.id ? 800 : 500,
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                    borderLeft: reportType === opt.id ? '4px solid var(--primary)' : '4px solid transparent'
                  }}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Date Picker Range */}
          <div className="card" style={{ border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.05)' }}>
            <h3 style={{ fontSize: '0.95rem', marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 700 }}>
              <Filter size={18} color="var(--primary)"/> Select Period
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

          {/* Quick Metrics */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div className="card" style={{ border: 'none', background: 'linear-gradient(135deg, #2f855a 0%, #48bb78 100%)', color: 'white', padding: '1.25rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                <span style={{ fontSize: '0.75rem', fontWeight: 700, opacity: 0.8 }}>COLLECTIONS</span>
                <Wallet size={20} opacity={0.8} />
              </div>
              <h2 style={{ fontSize: '1.75rem', fontWeight: 800, margin: 0 }}>₹{(totalCollections || 0).toLocaleString()}</h2>
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
                <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--primary)' }}>NET PROFIT</span>
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
              <p style={{ color: 'var(--text-muted)' }}>Generating report data...</p>
            </div>
          ) : (
            <div id="report-container" className="card" style={{ padding: '2rem', background: 'white', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.05)' }}>
              
              {/* Header section */}
              <div style={{ textAlign: 'center', marginBottom: '2.5rem', borderBottom: '1px solid #eee', paddingBottom: '2rem' }}>
                {activeResort?.logo_url && <img src={activeResort.logo_url} alt="Logo" style={{ maxHeight: '80px', marginBottom: '1.5rem' }} />}
                <h1 style={{ margin: 0, fontSize: '1.85rem', fontWeight: 800, color: 'var(--text-main)' }}>{activeResort?.name || 'Cheerful Chalet'}</h1>
                <p style={{ color: 'var(--text-muted)', fontSize: '1rem', margin: '0.5rem 0' }}>
                  {reportType === 'summary' && 'Stay & Financial Performance Report'}
                  {reportType === 'bookings' && 'Booking Details Report'}
                  {reportType === 'guests' && 'Guest Contacts Directory'}
                  {reportType === 'finance' && 'Financial Performance Log (Income & Expenses)'}
                </p>
                <div style={{ display: 'inline-block', padding: '0.4rem 1.25rem', background: 'var(--bg-secondary)', borderRadius: '50px', fontSize: '0.8rem', fontWeight: 700, color: 'var(--primary)', marginTop: '0.5rem' }}>
                  {format(new Date(range.start), 'MMM dd, yyyy')} — {format(new Date(range.end), 'MMM dd, yyyy')}
                </div>
              </div>

              {/* REPORT VIEW: SUMMARY */}
              {reportType === 'summary' && (
                <div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem', marginBottom: '2rem' }}>
                    <div style={{ background: '#f8fafc', padding: '1rem', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                      <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)' }}>STAYS FINALIZED</span>
                      <h3 style={{ fontSize: '1.5rem', fontWeight: 800, margin: '0.25rem 0 0' }}>{completedBookings.length}</h3>
                    </div>
                    <div style={{ background: '#f8fafc', padding: '1rem', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                      <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)' }}>TOTAL VALUE</span>
                      <h3 style={{ fontSize: '1.5rem', fontWeight: 800, margin: '0.25rem 0 0' }}>₹{completedValue.toLocaleString()}</h3>
                    </div>
                    <div style={{ background: '#f8fafc', padding: '1rem', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                      <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)' }}>GUESTS SERVED</span>
                      <h3 style={{ fontSize: '1.5rem', fontWeight: 800, margin: '0.25rem 0 0' }}>{completedGuests}</h3>
                    </div>
                  </div>

                  <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '1.1rem', fontWeight: 800, marginBottom: '1rem' }}>
                    <CalendarCheck size={18} color="var(--primary)" /> Bookings & Collections Summary
                  </h3>
                  
                  <div className="table-container" style={{ border: '1px solid #f0f0f0', borderRadius: '12px', overflowX: 'auto', overflowY: 'auto', maxHeight: '450px', marginBottom: '2.5rem' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                      <thead style={{ background: '#fafafa' }}>
                        <tr style={{ borderBottom: '2px solid #f0f0f0' }}>
                          <th style={{ padding: '0.8rem', textAlign: 'left' }}>Ref #</th>
                          <th style={{ padding: '0.8rem', textAlign: 'left' }}>Guest Name</th>
                          <th style={{ padding: '0.8rem', textAlign: 'left' }}>Check In</th>
                          <th style={{ padding: '0.8rem', textAlign: 'center' }}>Status</th>
                          <th style={{ padding: '0.8rem', textAlign: 'right' }}>Total Amount</th>
                        </tr>
                      </thead>
                      <tbody>
                        {validBookings.slice(0, 10).map(b => (
                          <tr key={b.id} style={{ borderBottom: '1px solid #f9f9f9' }}>
                            <td style={{ padding: '0.8rem', fontWeight: 700, color: 'var(--primary)' }}>{b.reference_number}</td>
                            <td style={{ padding: '0.8rem' }}>{b.guest_name}</td>
                            <td style={{ padding: '0.8rem' }}>{b.check_in_date}</td>
                            <td style={{ padding: '0.8rem', textAlign: 'center' }}>
                              <span className={`badge badge-${b.status === 'Completed' ? 'success' : 'info'}`} style={{ fontSize: '0.65rem' }}>{b.status}</span>
                            </td>
                            <td style={{ padding: '0.8rem', textAlign: 'right', fontWeight: 700 }}>₹{Number(b.total_amount || 0).toLocaleString()}</td>
                          </tr>
                        ))}
                        {validBookings.length > 10 && (
                          <tr>
                            <td colSpan="5" style={{ textAlign: 'center', padding: '0.75rem', color: 'var(--text-muted)', fontSize: '0.75rem', fontStyle: 'italic' }}>
                              Showing top 10 bookings. View 'Booking Details' tab for the complete list.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* REPORT VIEW: BOOKING DETAILS */}
              {reportType === 'bookings' && (
                <div>
                  <div className="no-print" style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginBottom: '1.5rem', background: '#f8fafc', padding: '1rem', borderRadius: '8px' }}>
                    <div style={{ flex: 1, minWidth: '200px', position: 'relative' }}>
                      <input 
                        type="text" 
                        placeholder="Search guest or ref..." 
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                        style={{ padding: '0.5rem 1rem', paddingLeft: '2.25rem', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '0.85rem', width: '100%' }}
                      />
                      <Search size={14} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: '#a0aec0' }} />
                    </div>
                    <div>
                      <select className="form-select" style={{ fontSize: '0.85rem', padding: '0.5rem' }} value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
                        <option value="All">All Statuses</option>
                        <option value="Confirmed">Confirmed</option>
                        <option value="Checked-in">Checked-in</option>
                        <option value="Completed">Completed</option>
                        <option value="Cancelled">Cancelled</option>
                      </select>
                    </div>
                    <div>
                      <select className="form-select" style={{ fontSize: '0.85rem', padding: '0.5rem' }} value={sourceFilter} onChange={e => setSourceFilter(e.target.value)}>
                        {bookingSources.map(src => (
                          <option key={src} value={src}>{src === 'All' ? 'All Sources' : src}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="table-container" style={{ border: '1px solid #f0f0f0', borderRadius: '12px', overflowX: 'auto', overflowY: 'auto', maxHeight: '600px' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                      <thead style={{ background: '#fafafa' }}>
                        <tr style={{ borderBottom: '2px solid #f0f0f0' }}>
                          <th onClick={() => requestSort('reference_number')} style={{ padding: '0.8rem', textAlign: 'left', cursor: 'pointer' }}>REF # <SortIcon column="reference_number"/></th>
                          <th onClick={() => requestSort('guest_name')} style={{ padding: '0.8rem', textAlign: 'left', cursor: 'pointer' }}>GUEST NAME <SortIcon column="guest_name"/></th>
                          <th style={{ padding: '0.8rem', textAlign: 'left' }}>SOURCE</th>
                          <th style={{ padding: '0.8rem', textAlign: 'center' }}>STATUS</th>
                          <th style={{ padding: '0.8rem', textAlign: 'left' }}>CHECK-IN</th>
                          <th style={{ padding: '0.8rem', textAlign: 'left' }}>CHECK-OUT</th>
                          <th onClick={() => requestSort('total_amount')} style={{ padding: '0.8rem', textAlign: 'right', cursor: 'pointer' }}>TOTAL <SortIcon column="total_amount"/></th>
                          <th style={{ padding: '0.8rem', textAlign: 'right' }}>PAID</th>
                          <th style={{ padding: '0.8rem', textAlign: 'right' }}>BALANCE</th>
                        </tr>
                      </thead>
                      <tbody>
                        {sortedBookings.length === 0 ? (
                          <tr><td colSpan="9" style={{ textAlign: 'center', padding: '3rem', color: '#ccc' }}>No bookings found for the selected filters.</td></tr>
                        ) : sortedBookings.map(b => {
                          const total = Number(b.total_amount || 0);
                          const paid = Number(b.advance_paid || 0);
                          return (
                            <tr key={b.id} style={{ borderBottom: '1px solid #f9f9f9' }}>
                              <td style={{ padding: '0.8rem', fontWeight: 700, color: 'var(--primary)' }}>{b.reference_number}</td>
                              <td style={{ padding: '0.8rem' }}>{b.guest_name}</td>
                              <td style={{ padding: '0.8rem' }}>
                                <span style={{ fontSize: '0.7rem', padding: '2px 6px', borderRadius: '4px', background: '#f0f4ff', color: '#5a67d8', fontWeight: 700 }}>
                                  {b.booking_source || 'Direct'}
                                </span>
                              </td>
                              <td style={{ padding: '0.8rem', textAlign: 'center' }}>
                                <span className={`badge badge-${b.status === 'Cancelled' ? 'danger' : b.status === 'Completed' ? 'success' : 'info'}`} style={{ fontSize: '0.65rem' }}>{b.status}</span>
                              </td>
                              <td style={{ padding: '0.8rem' }}>{b.check_in_date}</td>
                              <td style={{ padding: '0.8rem' }}>{b.check_out_date}</td>
                              <td style={{ padding: '0.8rem', textAlign: 'right', fontWeight: 700 }}>₹{total.toLocaleString()}</td>
                              <td style={{ padding: '0.8rem', textAlign: 'right', color: 'var(--success)' }}>₹{paid.toLocaleString()}</td>
                              <td style={{ padding: '0.8rem', textAlign: 'right', color: (total - paid) > 0 ? 'var(--danger)' : 'var(--text-muted)' }}>₹{(total - paid).toLocaleString()}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* REPORT VIEW: GUEST CONTACTS */}
              {reportType === 'guests' && (
                <div>
                  <div className="no-print" style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem', background: '#f8fafc', padding: '1rem', borderRadius: '8px' }}>
                    <div style={{ flex: 1, position: 'relative' }}>
                      <input 
                        type="text" 
                        placeholder="Search by guest name, email, or phone number..." 
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                        style={{ padding: '0.5rem 1rem', paddingLeft: '2.25rem', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '0.85rem', width: '100%' }}
                      />
                      <Search size={14} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: '#a0aec0' }} />
                    </div>
                  </div>

                  <div className="table-container" style={{ border: '1px solid #f0f0f0', borderRadius: '12px', overflowX: 'auto', overflowY: 'auto', maxHeight: '600px' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                      <thead style={{ background: '#fafafa' }}>
                        <tr style={{ borderBottom: '2px solid #f0f0f0' }}>
                          <th style={{ padding: '0.8rem', textAlign: 'left' }}>GUEST NAME</th>
                          <th style={{ padding: '0.8rem', textAlign: 'left' }}>EMAIL ADDRESS</th>
                          <th style={{ padding: '0.8rem', textAlign: 'left' }}>PHONE NUMBER</th>
                          <th style={{ padding: '0.8rem', textAlign: 'center' }}>TOTAL STAYS</th>
                          <th style={{ padding: '0.8rem', textAlign: 'left' }}>LATEST REF #</th>
                          <th style={{ padding: '0.8rem', textAlign: 'left' }}>LATEST STAY DATE</th>
                        </tr>
                      </thead>
                      <tbody>
                        {guestContacts.length === 0 ? (
                          <tr><td colSpan="6" style={{ textAlign: 'center', padding: '3rem', color: '#ccc' }}>No guest contacts found.</td></tr>
                        ) : guestContacts.map((g, idx) => (
                          <tr key={idx} style={{ borderBottom: '1px solid #f9f9f9' }}>
                            <td style={{ padding: '0.8rem', fontWeight: 800 }}>{g.name}</td>
                            <td style={{ padding: '0.8rem' }}>{g.email}</td>
                            <td style={{ padding: '0.8rem' }}>{g.phone}</td>
                            <td style={{ padding: '0.8rem', textAlign: 'center', fontWeight: 700 }}>{g.bookingsCount}</td>
                            <td style={{ padding: '0.8rem', fontWeight: 700, color: 'var(--primary)' }}>{g.latestRef}</td>
                            <td style={{ padding: '0.8rem' }}>{g.latestBookingDate}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* REPORT VIEW: FINANCIAL DETAILS (INCOME & EXPENSES) */}
              {reportType === 'finance' && (
                <div>
                  {/* Financial Aggregates Row */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem', marginBottom: '2.5rem' }}>
                    <div style={{ background: 'rgba(37, 99, 235, 0.04)', padding: '1rem', borderRadius: '8px', border: '1px solid rgba(37, 99, 235, 0.1)' }}>
                      <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#2563eb' }}>TOTAL INCOMES</span>
                      <h3 style={{ fontSize: '1.5rem', fontWeight: 800, margin: '0.25rem 0 0', color: '#2563eb' }}>₹{totalCollections.toLocaleString()}</h3>
                    </div>
                    <div style={{ background: 'rgba(220, 38, 38, 0.04)', padding: '1rem', borderRadius: '8px', border: '1px solid rgba(220, 38, 38, 0.1)' }}>
                      <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#dc2626' }}>TOTAL EXPENSES</span>
                      <h3 style={{ fontSize: '1.5rem', fontWeight: 800, margin: '0.25rem 0 0', color: '#dc2626' }}>₹{totalExpenses.toLocaleString()}</h3>
                    </div>
                    <div style={{ background: netProfit >= 0 ? 'rgba(5, 150, 105, 0.04)' : 'rgba(220, 38, 38, 0.04)', padding: '1rem', borderRadius: '8px', border: netProfit >= 0 ? '1px solid rgba(5, 150, 105, 0.1)' : '1px solid rgba(220, 38, 38, 0.1)' }}>
                      <span style={{ fontSize: '0.75rem', fontWeight: 700, color: netProfit >= 0 ? 'var(--primary)' : '#dc2626' }}>NET CASH FLOW</span>
                      <h3 style={{ fontSize: '1.5rem', fontWeight: 800, margin: '0.25rem 0 0', color: netProfit >= 0 ? 'var(--primary)' : '#dc2626' }}>₹{netProfit.toLocaleString()}</h3>
                    </div>
                  </div>

                  <div className="no-print" style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginBottom: '1.5rem', background: '#f8fafc', padding: '1rem', borderRadius: '8px' }}>
                    <div style={{ flex: 1, minWidth: '200px', position: 'relative' }}>
                      <input 
                        type="text" 
                        placeholder="Search logs by ref, categories, names..." 
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                        style={{ padding: '0.5rem 1rem', paddingLeft: '2.25rem', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '0.85rem', width: '100%' }}
                      />
                      <Search size={14} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: '#a0aec0' }} />
                    </div>
                    <div>
                      <select className="form-select" style={{ fontSize: '0.85rem', padding: '0.5rem' }} value={paymentMethodFilter} onChange={e => setPaymentMethodFilter(e.target.value)}>
                        <option value="All">All Pay Methods</option>
                        {paymentMethods.filter(m => m !== 'All').map(m => (
                          <option key={m} value={m}>{m}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <select className="form-select" style={{ fontSize: '0.85rem', padding: '0.5rem' }} value={expenseCategoryFilter} onChange={e => setExpenseCategoryFilter(e.target.value)}>
                        <option value="All">All Categories</option>
                        {expenseCategories.filter(c => c !== 'All').map(c => (
                          <option key={c} value={c}>{c}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
                    
                    {/* Incomes Log Column */}
                    <div>
                      <h4 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 800, color: 'var(--success)', marginBottom: '1rem' }}>
                        Incomes
                      </h4>
                      <div className="table-container" style={{ border: '1px solid #f0f0f0', borderRadius: '12px', overflowX: 'auto', overflowY: 'auto', maxHeight: '500px' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.75rem' }}>
                          <thead style={{ background: '#fafafa' }}>
                            <tr>
                              <th style={{ padding: '0.6rem', textAlign: 'left' }}>DATE</th>
                              <th style={{ padding: '0.6rem', textAlign: 'left' }}>GUEST / REF</th>
                              <th style={{ padding: '0.6rem', textAlign: 'left' }}>METHOD</th>
                              <th style={{ padding: '0.6rem', textAlign: 'right' }}>AMOUNT</th>
                            </tr>
                          </thead>
                          <tbody>
                            {sortedIncomes.length === 0 ? (
                              <tr><td colSpan="4" style={{ textAlign: 'center', padding: '2rem', color: '#ccc' }}>No incomes logged.</td></tr>
                            ) : sortedIncomes.map(i => (
                              <tr key={i.id} style={{ borderBottom: '1px solid #f9f9f9' }}>
                                <td style={{ padding: '0.6rem' }}>{i.date}</td>
                                <td style={{ padding: '0.6rem' }}>
                                  <div style={{ fontWeight: 700 }}>{i.bookings?.guest_name || 'Direct Deposit'}</div>
                                  <div style={{ fontSize: '0.65rem', opacity: 0.7 }}>{i.bookings?.reference_number || '-'}</div>
                                </td>
                                <td style={{ padding: '0.6rem' }}>{i.payment_method || '-'}</td>
                                <td style={{ padding: '0.6rem', textAlign: 'right', fontWeight: 700, color: 'var(--success)' }}>+₹{Number(i.amount).toLocaleString()}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    {/* Expenses Log Column */}
                    <div>
                      <h4 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 800, color: 'var(--danger)', marginBottom: '1rem' }}>
                        Expenses
                      </h4>
                      <div className="table-container" style={{ border: '1px solid #f0f0f0', borderRadius: '12px', overflowX: 'auto', overflowY: 'auto', maxHeight: '500px' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.75rem' }}>
                          <thead style={{ background: '#fafafa' }}>
                            <tr>
                              <th style={{ padding: '0.6rem', textAlign: 'left' }}>DATE</th>
                              <th style={{ padding: '0.6rem', textAlign: 'left' }}>CATEGORY</th>
                              <th style={{ padding: '0.6rem', textAlign: 'left' }}>PAID TO</th>
                              <th style={{ padding: '0.6rem', textAlign: 'right' }}>AMOUNT</th>
                            </tr>
                          </thead>
                          <tbody>
                            {sortedExpenses.length === 0 ? (
                              <tr><td colSpan="4" style={{ textAlign: 'center', padding: '2rem', color: '#ccc' }}>No expenses logged.</td></tr>
                            ) : sortedExpenses.map(e => (
                              <tr key={e.id} style={{ borderBottom: '1px solid #f9f9f9' }}>
                                <td style={{ padding: '0.6rem' }}>{e.date}</td>
                                <td style={{ padding: '0.6rem', fontWeight: 700 }}>{e.category}</td>
                                <td style={{ padding: '0.6rem' }}>{e.paid_to || '-'}</td>
                                <td style={{ padding: '0.6rem', textAlign: 'right', fontWeight: 700, color: 'var(--danger)' }}>-₹{Number(e.amount).toLocaleString()}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>

                  </div>
                </div>
              )}

              {/* PDF Footer details */}
              <div style={{ marginTop: '5rem', borderTop: '2px solid #f0f0f0', paddingTop: '1.5rem', display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: '#bbb', fontWeight: 600 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <UserCheck size={14} /> Generated by: {session?.user?.email}
                </div>
                <div>Timestamp: {format(new Date(), 'yyyy-MM-dd HH:mm:ss')}</div>
              </div>

            </div>
          )}
        </main>
      </div>
    </div>
  );
}
