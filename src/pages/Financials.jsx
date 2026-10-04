import React, { useState, useEffect, useRef } from 'react';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { Trash2, ArrowUpRight, ArrowDownRight, Edit2, Filter, CalendarCheck, Plus, X, Search, TrendingUp, TrendingDown, Wallet } from 'lucide-react';
import { useSettingsStore } from '../lib/store';
import { startOfMonth, endOfMonth, format } from 'date-fns';
import { useNavigate } from 'react-router-dom';

export default function Financials() {
  const navigate = useNavigate();
  const formContainerRef = useRef(null);
  const { session, activeResortId } = useSettingsStore();
  const [incomes, setIncomes] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [cottages, setCottages] = useState([]);
  const [selectedCottageId, setSelectedCottageId] = useState('all');
  const [loading, setLoading] = useState(true);

  const [newIncome, setNewIncome] = useState({ date: format(new Date(), 'yyyy-MM-dd'), source: 'Room Rent', amount: 0, payment_mode: 'UPI', notes: '', reference_number: '', cottage_id: '' });
  const [newExpense, setNewExpense] = useState({ date: format(new Date(), 'yyyy-MM-dd'), category: 'Maintenance', amount: 0, vendor_name: '', payment_mode: 'Cash', notes: '', cottage_id: '' });
  const [editingExpenseId, setEditingExpenseId] = useState(null);
  const [editingIncomeId, setEditingIncomeId] = useState(null);
  
  const [activeMobileTab, setActiveMobileTab] = useState('income');
  const [showIncomeForm, setShowIncomeForm] = useState(false);
  const [showExpenseForm, setShowExpenseForm] = useState(false);
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);
  const [windowWidth, setWindowWidth] = useState(window.innerWidth);
  
  const [searchQuery, setSearchQuery] = useState('');
  const [periodType, setPeriodType] = useState('full_year');
  const [range, setRange] = useState({
    start: `${new Date().getFullYear()}-01-01`,
    end: `${new Date().getFullYear()}-12-31`
  });

  const filteredIncomes = React.useMemo(() => {
    let result = incomes;
    if (selectedCottageId !== 'all') {
      result = result.filter(i => {
        const cId = i.cottage_id || i.bookings?.cottage_id;
        return cId === selectedCottageId;
      });
    }
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter(i => 
        i.source?.toLowerCase().includes(q) || 
        i.notes?.toLowerCase().includes(q) || 
        i.amount?.toString().includes(q) ||
        i.bookings?.guest_name?.toLowerCase().includes(q) ||
        i.bookings?.reference_number?.toLowerCase().includes(q)
      );
    }
    return result;
  }, [incomes, selectedCottageId, searchQuery]);

  const filteredExpenses = React.useMemo(() => {
    let result = expenses;
    if (selectedCottageId !== 'all') {
      result = result.filter(e => e.cottage_id === selectedCottageId);
    }
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter(e => 
        e.category?.toLowerCase().includes(q) || 
        e.custom_category?.toLowerCase().includes(q) || 
        e.description?.toLowerCase().includes(q) || 
        e.amount?.toString().includes(q)
      );
    }
    return result;
  }, [expenses, selectedCottageId, searchQuery]);

  const stats = React.useMemo(() => {
    const totalInc = filteredIncomes.reduce((sum, i) => sum + Number(i.amount), 0);
    const totalExp = filteredExpenses.reduce((sum, e) => sum + Number(e.amount), 0);
    return { totalInc, totalExp, net: totalInc - totalExp };
  }, [filteredIncomes, filteredExpenses]);

  const handlePeriodChange = (e) => {
    const val = e.target.value;
    setPeriodType(val);
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();
    
    if (val === 'full_year') {
      setRange({ start: `${year}-01-01`, end: `${year}-12-31` });
    } else if (val === 'this_month') {
      setRange({ 
        start: format(new Date(year, month, 1), 'yyyy-MM-dd'), 
        end: format(endOfMonth(new Date(year, month, 1)), 'yyyy-MM-dd') 
      });
    } else if (val === 'last_month') {
      const lastMonth = month === 0 ? 11 : month - 1;
      const lastMonthYear = month === 0 ? year - 1 : year;
      setRange({ 
        start: format(new Date(lastMonthYear, lastMonth, 1), 'yyyy-MM-dd'), 
        end: format(endOfMonth(new Date(lastMonthYear, lastMonth, 1)), 'yyyy-MM-dd') 
      });
    }
  };

  useEffect(() => {
    fetchData();
    const handleResize = () => {
      setWindowWidth(window.innerWidth);
      setIsMobile(window.innerWidth <= 768);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [activeResortId, range]);

  const fetchData = async () => {
    if (!isSupabaseConfigured() || !activeResortId) { setLoading(false); return; }
    try {
      const [inc, exp, cot] = await Promise.all([
        supabase.from('incomes').select('*, bookings(reference_number, guest_name, cottage_id)').eq('resort_id', activeResortId).gte('date', range.start).lte('date', range.end).order('date', { ascending: false }),
        supabase.from('expenses').select('*').eq('resort_id', activeResortId).gte('date', range.start).lte('date', range.end).order('date', { ascending: false }),
        supabase.from('cottages').select('*').eq('resort_id', activeResortId).order('name')
      ]);
      setIncomes(inc.data || []);
      setExpenses(exp.data || []);
      setCottages(cot.data || []);
    } catch(err) {
      console.error(err);
    } finally { setLoading(false); }
  };

  const handleIncomeSubmit = async (e) => {
    e.preventDefault();
    try {
      const payload = { ...newIncome, tenant_id: session.user.id, resort_id: activeResortId };
      if (payload.source === 'Other') payload.source = payload.custom_source || 'Other';
      if (payload.cottage_id === '' || payload.cottage_id === 'general') payload.cottage_id = null;
      
      let refNum = payload.reference_number?.trim();
      delete payload.custom_source;
      delete payload.reference_number;
      
      if (refNum) {
        const { data: bData } = await supabase.from('bookings').select('id, reference_number').eq('reference_number', refNum).eq('resort_id', activeResortId).single();
        if (bData) {
          payload.booking_id = bData.id;
        } else {
          payload.notes = `Ref: ${refNum}` + (payload.notes ? ` - ${payload.notes}` : '');
          payload.booking_id = null;
        }
      } else {
        payload.booking_id = null;
      }

      if (editingIncomeId) {
        const { data, error } = await supabase.from('incomes').update(payload).eq('id', editingIncomeId).select('*, bookings(reference_number, guest_name, cottage_id)');
        if (error) throw error;
        setIncomes(incomes.map(inc => inc.id === editingIncomeId ? data[0] : inc));
        setEditingIncomeId(null);
      } else {
        const { data, error } = await supabase.from('incomes').insert([payload]).select('*, bookings(reference_number, guest_name, cottage_id)');
        if (error) throw error;
        const savedIncome = data[0];
        setIncomes([savedIncome, ...incomes]);
        
        if (savedIncome.booking_id) {
          supabase.functions.invoke('send-notification', {
            body: { 
              type: 'receipt', 
              booking_id: savedIncome.booking_id, 
              resort_id: activeResortId,
              custom_payload: { amount: savedIncome.amount }
            }
          }).catch(err => console.error("Receipt Notification Error:", err));
        }
      }

      setNewIncome({ date: format(new Date(), 'yyyy-MM-dd'), source: 'Room Rent', amount: 0, payment_mode: 'UPI', notes: '', reference_number: '', custom_source: '', cottage_id: '' });
      setShowIncomeForm(false);
    } catch(err) { alert(err.message); }
  };

  const loadIncomeForEdit = (inc) => {
    setEditingIncomeId(inc.id);
    let refNum = '';
    if (inc.booking_id && inc.bookings?.reference_number) {
        refNum = inc.bookings.reference_number;
    } else if (inc.notes?.startsWith('Ref: ')) {
        refNum = inc.notes.split(' ')[1];
    }

    setNewIncome({
      date: inc.date,
      source: inc.source,
      amount: inc.amount,
      payment_mode: inc.payment_mode || 'UPI',
      notes: inc.notes || '',
      reference_number: refNum,
      cottage_id: inc.cottage_id || '',
      custom_source: ''
    });
    setShowIncomeForm(true);
  };

  const handleExpenseSubmit = async (e) => {
    e.preventDefault();
    try {
      const payload = { ...newExpense, tenant_id: session.user.id, resort_id: activeResortId };
      if (payload.category === 'Other') payload.category = payload.custom_category || 'Other';
      if (payload.cottage_id === '' || payload.cottage_id === 'general') payload.cottage_id = null;
      delete payload.custom_category;
      
      if (editingExpenseId) {
        const { data, error } = await supabase.from('expenses').update(payload).eq('id', editingExpenseId).select();
        if (error) throw error;
        setExpenses(expenses.map(exp => exp.id === editingExpenseId ? data[0] : exp));
        setEditingExpenseId(null);
      } else {
        const { data, error } = await supabase.from('expenses').insert([payload]).select();
        if (error) throw error;
        setExpenses([data[0], ...expenses]);
      }
      
      setNewExpense({ date: format(new Date(), 'yyyy-MM-dd'), category: 'Maintenance', amount: 0, vendor_name: '', payment_mode: 'Cash', notes: '', custom_category: '', cottage_id: '' });
      setShowExpenseForm(false);
    } catch(err) { alert(err.message); }
  };

  const loadExpenseForEdit = (exp) => {
    setEditingExpenseId(exp.id);
    setNewExpense({
      date: exp.date,
      category: exp.category,
      amount: exp.amount,
      vendor_name: exp.vendor_name || '',
      payment_mode: exp.payment_mode || 'Cash',
      notes: exp.notes || '',
      cottage_id: exp.cottage_id || '',
      custom_category: ''
    });
    setShowExpenseForm(true);
  };

  const deleteRecord = async (table, id) => {
    if(!window.confirm('Delete record?')) return;

    if (table === 'incomes') {
      const income = incomes.find(i => i.id === id);
      if (income && income.booking_id) {
         const { data: bData } = await supabase.from('bookings').select('*').eq('id', income.booking_id).single();
         if (bData) {
            const isSettlement = income.notes?.toLowerCase().includes('settlement');
            if (isSettlement) {
               const match = income.notes?.match(/\[Discount:\s*₹?(\d+)\]/i);
               const discount = match ? Number(match[1]) : 0;
               
               const restoredTotal = Number(bData.total_amount) + discount;
               const restoredBalance = Number(bData.balance_amount) + Number(income.amount) + discount;
               
               await supabase.from('bookings').update({ 
                  total_amount: restoredTotal,
                  balance_amount: restoredBalance,
                  status: 'Checked-out' 
               }).eq('id', income.booking_id);
            } else {
               const newAdvance = Number(bData.advance_paid) - Number(income.amount);
               await supabase.from('bookings').update({ 
                  advance_paid: newAdvance, 
                  balance_amount: Number(bData.total_amount) - newAdvance,
                  status: 'Confirmed' 
               }).eq('id', income.booking_id);
            }
         }
      }
    }

    await supabase.from(table).delete().eq('id', id);
    if(table === 'incomes') setIncomes(incomes.filter(i => i.id !== id));
    else setExpenses(expenses.filter(e => e.id !== id));
  };

  const formatDateShort = (dateStr) => {
    const d = new Date(dateStr);
    return isMobile ? d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }) : d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  };

  if(loading) return <div style={{ padding: '2rem' }}>Loading...</div>;

  return (
    <div className="settings-container financials-container" style={{ maxWidth: '1400px', width: '100%', margin: '0 auto', paddingBottom: '3rem' }}>
      
      {/* PAGE HEADER */}
      <header style={{ marginBottom: '0.25rem' }}>
        <h1 className="settings-header-title">Financials</h1>
        <p className="settings-header-subtitle">
          Track income, expenses and profitability across your properties.
        </p>
      </header>

      {/* FILTER TOOLBAR */}
      <div className="settings-card" style={{ padding: '1rem 1.25rem' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: '1rem' }}>
          
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flex: 1, minWidth: '250px', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Filter size={16} style={{ color: 'var(--primary)', flexShrink: 0 }} />
              <select 
                className="form-select" 
                style={{ width: '160px', height: '38px', fontSize: '0.875rem', fontWeight: 600, margin: 0 }} 
                value={periodType} 
                onChange={handlePeriodChange}
              >
                <option value="full_year">Full Year</option>
                <option value="this_month">This Month</option>
                <option value="last_month">Last Month</option>
                <option value="custom">Custom Range</option>
              </select>
            </div>

            <div style={{ position: 'relative', display: 'flex', alignItems: 'center', minWidth: '220px', flex: 1, maxWidth: '320px' }}>
              <Search size={16} color="var(--text-muted)" style={{ position: 'absolute', left: '12px', pointerEvents: 'none' }} />
              <input 
                type="text" 
                className="form-input" 
                placeholder="Search records..." 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{ height: '38px', paddingLeft: '36px', fontSize: '0.875rem', width: '100%', margin: 0 }}
              />
            </div>

            {periodType === 'custom' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                  <small style={{ fontWeight: 700, color: 'var(--text-muted)', fontSize: '0.75rem' }}>FROM</small>
                  <input type="date" className="form-input" style={{ width: '135px', height: '38px', fontSize: '0.85rem', margin: 0 }} value={range.start} onChange={e => setRange({...range, start: e.target.value})} />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                  <small style={{ fontWeight: 700, color: 'var(--text-muted)', fontSize: '0.75rem' }}>TO</small>
                  <input type="date" className="form-input" style={{ width: '135px', height: '38px', fontSize: '0.85rem', margin: 0 }} value={range.end} onChange={e => setRange({...range, end: e.target.value})} />
                </div>
              </div>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <small style={{ fontWeight: 700, color: 'var(--text-muted)', fontSize: '0.75rem', letterSpacing: '0.04em' }}>PROPERTY</small>
            <select 
              className="form-select" 
              style={{ width: '170px', height: '38px', fontSize: '0.875rem', fontWeight: 600, margin: 0 }} 
              value={selectedCottageId} 
              onChange={e => setSelectedCottageId(e.target.value)}
            >
              <option value="all">All Properties</option>
              {cottages.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

        </div>
      </div>
      
      {/* 3 SUMMARY KPI CARDS */}
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, 1fr)', gap: '1.25rem' }}>
        
        {/* CARD 1: TOTAL INCOME */}
        <div className="settings-card" style={{ padding: '1.25rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.05em' }}>TOTAL INCOME</span>
            <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: 'rgba(16, 185, 129, 0.12)', border: '1px solid rgba(16, 185, 129, 0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#10b981' }}>
              <TrendingUp size={18} />
            </div>
          </div>
          <div style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--text-main)', letterSpacing: '-0.02em', marginBottom: '0.25rem', fontVariantNumeric: 'tabular-nums' }}>
            ₹{stats.totalInc.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Income received</div>
        </div>

        {/* CARD 2: TOTAL EXPENSES */}
        <div className="settings-card" style={{ padding: '1.25rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.05em' }}>TOTAL EXPENSES</span>
            <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: 'rgba(239, 68, 68, 0.12)', border: '1px solid rgba(239, 68, 68, 0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ef4444' }}>
              <TrendingDown size={18} />
            </div>
          </div>
          <div style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--text-main)', letterSpacing: '-0.02em', marginBottom: '0.25rem', fontVariantNumeric: 'tabular-nums' }}>
            ₹{stats.totalExp.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Total spending</div>
        </div>

        {/* CARD 3: NET PROFIT / NET LOSS */}
        <div className="settings-card" style={{ padding: '1.25rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.05em' }}>
              {stats.net >= 0 ? 'NET PROFIT' : 'NET LOSS'}
            </span>
            <div style={{ 
              width: '36px', 
              height: '36px', 
              borderRadius: '10px', 
              background: stats.net >= 0 ? 'rgba(16, 185, 129, 0.12)' : 'rgba(239, 68, 68, 0.12)', 
              border: stats.net >= 0 ? '1px solid rgba(16, 185, 129, 0.25)' : '1px solid rgba(239, 68, 68, 0.25)', 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'center', 
              color: stats.net >= 0 ? '#10b981' : '#ef4444' 
            }}>
              <Wallet size={18} />
            </div>
          </div>
          <div style={{ 
            fontSize: '1.75rem', 
            fontWeight: 800, 
            color: stats.net >= 0 ? '#10b981' : '#ef4444', 
            letterSpacing: '-0.02em', 
            marginBottom: '0.25rem',
            fontVariantNumeric: 'tabular-nums' 
          }}>
            ₹{stats.net.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Income − expenses</div>
        </div>

      </div>
        
      {/* MOBILE TAB SWITCHER */}
      {isMobile && (
        <div style={{ display: 'flex', background: 'var(--bg-secondary)', borderRadius: '10px', padding: '0.25rem', border: '1px solid var(--border)' }}>
          <button 
            onClick={() => setActiveMobileTab('income')} 
            style={{ 
              flex: 1, 
              padding: '0.6rem', 
              borderRadius: '8px', 
              border: 'none', 
              background: activeMobileTab === 'income' ? '#10b981' : 'transparent', 
              color: activeMobileTab === 'income' ? 'white' : 'var(--text-muted)', 
              fontWeight: 700, 
              fontSize: '0.85rem',
              cursor: 'pointer' 
            }}
          >
            Income (₹{stats.totalInc.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })})
          </button>
          <button 
            onClick={() => setActiveMobileTab('expense')} 
            style={{ 
              flex: 1, 
              padding: '0.6rem', 
              borderRadius: '8px', 
              border: 'none', 
              background: activeMobileTab === 'expense' ? '#ef4444' : 'transparent', 
              color: activeMobileTab === 'expense' ? 'white' : 'var(--text-muted)', 
              fontWeight: 700, 
              fontSize: '0.85rem',
              cursor: 'pointer' 
            }}
          >
            Expenses (₹{stats.totalExp.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })})
          </button>
        </div>
      )}

      {/* TWO COLUMN GRID: INCOMES & EXPENSES */}
      <div ref={formContainerRef} style={{ display: 'grid', gridTemplateColumns: windowWidth < 1024 ? '1fr' : 'repeat(2, 1fr)', gap: '22px' }}>
        
        {/* INCOMES SECTION */}
        <div style={{ display: (activeMobileTab === 'income' || !isMobile) ? 'block' : 'none' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', minHeight: '38px', flexWrap: 'nowrap', gap: '0.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
              <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: 'rgba(16, 185, 129, 0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#10b981', flexShrink: 0 }}>
                <ArrowUpRight size={18} />
              </div>
              <div>
                <h2 style={{ fontSize: '1.15rem', fontWeight: 700, margin: 0, color: 'var(--text-main)', lineHeight: '1.2' }}>
                  Income
                </h2>
                <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#10b981', fontVariantNumeric: 'tabular-nums' }}>
                  ₹{stats.totalInc.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
            </div>
            <button 
              className="btn btn-primary" 
              style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.45rem 0.85rem', fontSize: '0.85rem', fontWeight: 600, height: '36px', whiteSpace: 'nowrap', flexShrink: 0 }} 
              onClick={() => { setShowIncomeForm(!showIncomeForm); if (!showIncomeForm) { setTimeout(() => formContainerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100); } }}
            >
              {showIncomeForm ? <X size={16} /> : <Plus size={16} />} {showIncomeForm ? 'Close' : 'Add Income'}
            </button>
          </div>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            {showIncomeForm && (
              <div className="settings-card" style={{ padding: '1.5rem' }}>
                <form onSubmit={handleIncomeSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                    <div className="form-group"><label className="form-label">Date</label><input type="date" required className="form-input" value={newIncome.date} onChange={e => setNewIncome({...newIncome, date: e.target.value})} /></div>
                    <div className="form-group">
                      <label className="form-label">Amount (₹)</label>
                      <input type="number" required className="form-input" placeholder="0.00" value={newIncome.amount} onChange={e => setNewIncome({...newIncome, amount: e.target.value})} />
                    </div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                    <div className="form-group">
                      <label className="form-label">Source</label>
                      <select className="form-select" value={newIncome.source} onChange={e => setNewIncome({...newIncome, source: e.target.value})}>
                        <option>Room Rent</option><option>Food</option><option>Activities</option><option>Other</option>
                      </select>
                    </div>
                    <div className="form-group">
                      <label className="form-label">Property</label>
                      <select required className="form-select" value={newIncome.cottage_id || ''} onChange={e => setNewIncome({...newIncome, cottage_id: e.target.value})}>
                        <option value="">-- Select Property --</option>
                        <option value="general">General / Resort-wide</option>
                        {cottages.map(c => (
                          <option key={c.id} value={c.id}>{c.name}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                  {newIncome.source === 'Other' ? (
                    <div className="form-group"><label className="form-label">Details of Income</label><input type="text" required className="form-input" placeholder="E.g., Event hosting, Extra bed" value={newIncome.custom_source || ''} onChange={e => setNewIncome({...newIncome, custom_source: e.target.value})} /></div>
                  ) : (
                    <div className="form-group"><label className="form-label">Ref #</label><input type="text" className="form-input" placeholder="Booking Ref" value={newIncome.reference_number || ''} onChange={e => setNewIncome({...newIncome, reference_number: e.target.value})} /></div>
                  )}
                  <div style={{ display: 'flex', gap: '1rem', marginTop: '0.5rem' }}>
                    <button type="button" className="btn btn-outline" style={{ flex: 1 }} onClick={() => { setShowIncomeForm(false); setEditingIncomeId(null); }}>Cancel</button>
                    <button type="submit" className="btn btn-primary" style={{ flex: 2 }}>{editingIncomeId ? 'Update' : 'Save Income'}</button>
                  </div>
                </form>
              </div>
            )}

            <div className="settings-card" style={{ padding: 0, overflow: 'hidden' }}>
              {filteredIncomes.length === 0 ? (
                <div style={{ padding: '3rem 1.5rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                  <p style={{ margin: 0, fontSize: '0.9rem', fontWeight: 500 }}>No income records found for this period.</p>
                </div>
              ) : isMobile ? (
                <div style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  {filteredIncomes.map(i => {
                    const propName = cottages.find(c => c.id === (i.cottage_id || i.bookings?.cottage_id))?.name || 'General';
                    return (
                      <div key={i.id} style={{ background: 'var(--bg-color)', borderRadius: '12px', padding: '1rem', border: '1px solid var(--border)', position: 'relative' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem' }}>
                          <div>
                             <div style={{ fontWeight: 700, color: 'var(--text-main)', fontSize: '0.95rem' }}>{i.source}</div>
                             <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem', marginTop: '2px' }}>{formatDateShort(i.date)} &bull; {propName}</div>
                             {(i.notes?.toLowerCase().includes('advance') || i.notes?.toLowerCase().includes('settlement') || i.notes?.toLowerCase().includes('adjustment')) && (
                                <div style={{ marginTop: '0.4rem', display: 'flex', gap: '0.25rem', flexWrap: 'wrap' }}>
                                  {i.notes?.toLowerCase().includes('advance') && <span style={{ fontSize: '0.65rem', padding: '2px 6px', borderRadius: '4px', background: 'rgba(59, 130, 246, 0.1)', color: '#3b82f6', fontWeight: 700 }}>Advance</span>}
                                  {i.notes?.toLowerCase().includes('ota settlement') ? (
                                    <span style={{ fontSize: '0.65rem', padding: '2px 6px', borderRadius: '4px', background: 'rgba(245, 158, 11, 0.1)', color: '#d97706', fontWeight: 700 }}>OTA Settlement</span>
                                  ) : i.notes?.toLowerCase().includes('settlement') ? (
                                    <span style={{ fontSize: '0.65rem', padding: '2px 6px', borderRadius: '4px', background: 'rgba(139, 92, 246, 0.1)', color: '#8b5cf6', fontWeight: 700 }}>Settlement</span>
                                  ) : null}
                                  {i.notes?.toLowerCase().includes('adjustment') && <span style={{ fontSize: '0.65rem', padding: '2px 6px', borderRadius: '4px', background: 'rgba(239, 68, 68, 0.1)', color: 'var(--danger)', fontWeight: 700 }}>Adjustment</span>}
                                </div>
                             )}
                             {i.bookings?.reference_number && (
                                <div style={{ marginTop: '0.5rem' }}>
                                  <div style={{ color: 'var(--text-main)', fontWeight: '700', fontSize: '0.8rem' }}>{i.bookings.guest_name}</div>
                                  <div style={{ color: 'var(--primary)', fontWeight: '800', fontSize: '0.7rem' }}>REF: {i.bookings.reference_number}</div>
                                </div>
                             )}
                          </div>
                          <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.5rem' }}>
                            <div style={{ color: '#10b981', fontWeight: 800, fontSize: '1.1rem', fontVariantNumeric: 'tabular-nums' }}>₹{Number(i.amount).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                            <div style={{ display: 'flex', gap: '0.4rem' }}>
                               <button onClick={() => loadIncomeForEdit(i)} title="Edit Income" style={{ color: 'var(--primary)', padding: '0.4rem', background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: '6px', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}><Edit2 size={14}/></button>
                               <button onClick={() => deleteRecord('incomes', i.id)} title="Delete Income" style={{ color: '#ef4444', padding: '0.4rem', background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: '6px', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}><Trash2 size={14}/></button>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="table-container" style={{ maxHeight: '700px', overflowY: 'auto' }}>
                  <table className="table" style={{ margin: 0, width: '100%', tableLayout: 'fixed' }}>
                    <colgroup>
                      <col style={{ width: '90px' }} />
                      <col style={{ width: 'auto' }} />
                      <col style={{ width: '120px' }} />
                      <col style={{ width: '75px' }} />
                    </colgroup>
                    <thead style={{ position: 'sticky', top: 0, background: 'var(--bg-secondary)', zIndex: 1, borderBottom: '1px solid var(--border)' }}>
                      <tr style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-muted)', letterSpacing: '0.04em' }}>
                          <th style={{ padding: '0.85rem 0.75rem', textAlign: 'left' }}>Date</th>
                          <th style={{ padding: '0.85rem 0.75rem', textAlign: 'left' }}>Details</th>
                          <th style={{ textAlign: 'right', padding: '0.85rem 0.75rem' }}>Amount</th>
                          <th style={{ textAlign: 'center', padding: '0.85rem 0.5rem' }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredIncomes.map(i => (
                        <tr key={i.id} className="table-row-hover" style={{ borderBottom: '1px solid var(--border)' }}>
                          <td style={{ fontSize: '0.825rem', padding: '0.85rem 0.75rem', verticalAlign: 'top', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                            {formatDateShort(i.date)}
                          </td>
                          <td style={{ padding: '0.85rem 0.75rem', verticalAlign: 'top' }}>
                            <div style={{ fontWeight: '700', fontSize: '0.925rem', color: 'var(--text-main)', lineHeight: '1.25' }}>{i.source}</div>
                            <div style={{ marginTop: '4px', display: 'flex', gap: '0.35rem', flexWrap: 'wrap', alignItems: 'center' }}>
                              <span style={{ fontSize: '0.7rem', padding: '2px 7px', borderRadius: '6px', background: 'var(--bg-secondary)', color: 'var(--text-muted)', border: '1px solid var(--border)', fontWeight: 600, whiteSpace: 'nowrap' }}>
                                {cottages.find(c => c.id === (i.cottage_id || i.bookings?.cottage_id))?.name || 'General'}
                              </span>
                              {i.notes?.toLowerCase().includes('advance') && (
                                <span style={{ fontSize: '0.7rem', padding: '2px 7px', borderRadius: '6px', background: 'rgba(59, 130, 246, 0.1)', color: '#3b82f6', border: '1px solid rgba(59, 130, 246, 0.2)', fontWeight: 700, whiteSpace: 'nowrap' }}>
                                  Advance
                                </span>
                              )}
                              {i.notes?.toLowerCase().includes('ota settlement') ? (
                                <span style={{ fontSize: '0.7rem', padding: '2px 7px', borderRadius: '6px', background: 'rgba(245, 158, 11, 0.1)', color: '#d97706', border: '1px solid rgba(245, 158, 11, 0.2)', fontWeight: 700, whiteSpace: 'nowrap' }}>
                                  OTA Settlement
                                </span>
                              ) : i.notes?.toLowerCase().includes('settlement') ? (
                                <span style={{ fontSize: '0.7rem', padding: '2px 7px', borderRadius: '6px', background: 'rgba(139, 92, 246, 0.1)', color: '#8b5cf6', border: '1px solid rgba(139, 92, 246, 0.2)', fontWeight: 700, whiteSpace: 'nowrap' }}>
                                  Settlement
                                </span>
                              ) : null}
                              {i.notes?.toLowerCase().includes('adjustment') && (
                                <span style={{ fontSize: '0.7rem', padding: '2px 7px', borderRadius: '6px', background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', border: '1px solid rgba(239, 68, 68, 0.2)', fontWeight: 700, whiteSpace: 'nowrap' }}>
                                  Adjustment
                                </span>
                              )}
                            </div>
                            {i.bookings?.reference_number && (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', marginTop: '6px' }}>
                                <span style={{ color: 'var(--text-main)', fontWeight: '600', fontSize: '0.8rem' }}>{i.bookings.guest_name}</span>
                                <span style={{ color: 'var(--primary)', fontWeight: '700', fontSize: '0.75rem' }}>REF: {i.bookings.reference_number}</span>
                              </div>
                            )}
                          </td>
                          <td style={{ color: '#10b981', fontWeight: '800', fontSize: '0.95rem', padding: '0.85rem 0.75rem', verticalAlign: 'top', textAlign: 'right', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                            ₹{Number(i.amount).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </td>
                          <td style={{ textAlign: 'center', padding: '0.85rem 0.5rem', verticalAlign: 'top' }}>
                            <div style={{ display: 'flex', gap: '0.35rem', justifyContent: 'center', alignItems: 'center' }}>
                              <button onClick={() => loadIncomeForEdit(i)} title="Edit Income" style={{ color: 'var(--text-main)', padding: '0.35rem', background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: '6px', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}><Edit2 size={14}/></button>
                              <button onClick={() => deleteRecord('incomes', i.id)} title="Delete Income" style={{ color: '#ef4444', padding: '0.35rem', background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: '6px', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}><Trash2 size={14}/></button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* EXPENSES SECTION */}
        <div style={{ display: (activeMobileTab === 'expense' || !isMobile) ? 'block' : 'none' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', minHeight: '38px', flexWrap: 'nowrap', gap: '0.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
              <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: 'rgba(239, 68, 68, 0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ef4444', flexShrink: 0 }}>
                <ArrowDownRight size={18} />
              </div>
              <div>
                <h2 style={{ fontSize: '1.15rem', fontWeight: 700, margin: 0, color: 'var(--text-main)', lineHeight: '1.2' }}>
                  Expenses
                </h2>
                <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#ef4444', fontVariantNumeric: 'tabular-nums' }}>
                  ₹{stats.totalExp.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
            </div>
            <button 
              className="btn" 
              style={{ background: '#ef4444', color: '#ffffff', display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.45rem 0.85rem', fontSize: '0.85rem', border: 'none', borderRadius: '8px', fontWeight: 600, cursor: 'pointer', height: '36px', whiteSpace: 'nowrap', flexShrink: 0 }} 
              onClick={() => { setShowExpenseForm(!showExpenseForm); if (!showExpenseForm) { setTimeout(() => formContainerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100); } }}
            >
              {showExpenseForm ? <X size={16} /> : <Plus size={16} />} {showExpenseForm ? 'Close' : 'Add Expense'}
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            {showExpenseForm && (
              <div className="settings-card" style={{ padding: '1.5rem' }}>
                <form onSubmit={handleExpenseSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                    <div className="form-group"><label className="form-label">Date</label><input type="date" required className="form-input" value={newExpense.date} onChange={e => setNewExpense({...newExpense, date: e.target.value})} /></div>
                    <div className="form-group">
                      <label className="form-label">Amount (₹)</label>
                      <input type="number" required className="form-input" placeholder="0.00" value={newExpense.amount} onChange={e => setNewExpense({...newExpense, amount: e.target.value})} />
                    </div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                    <div className="form-group">
                      <label className="form-label">Category</label>
                      <select className="form-select" value={newExpense.category} onChange={e => setNewExpense({...newExpense, category: e.target.value})}>
                        <option>Maintenance</option><option>Salary</option><option>Utilities</option><option>Supplies</option><option>Other</option>
                      </select>
                    </div>
                    <div className="form-group">
                      <label className="form-label">Property</label>
                      <select required className="form-select" value={newExpense.cottage_id || ''} onChange={e => setNewExpense({...newExpense, cottage_id: e.target.value})}>
                        <option value="">-- Select Property --</option>
                        <option value="general">General / Resort-wide</option>
                        {cottages.map(c => (
                          <option key={c.id} value={c.id}>{c.name}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                  {newExpense.category === 'Other' && (
                    <div className="form-group">
                      <label className="form-label">Details of Expense</label>
                      <input type="text" required className="form-input" placeholder="Specify expense type" value={newExpense.custom_category || ''} onChange={e => setNewExpense({...newExpense, custom_category: e.target.value})} />
                    </div>
                  )}
                  <div className="form-group">
                    <label className="form-label">
                      {newExpense.category === 'Salary' ? 'Employee Name' : 
                       newExpense.category === 'Utilities' ? 'Provider Name' : 
                       newExpense.category === 'Supplies' ? 'Supplier Name' : 
                       'Vendor Name'}
                    </label>
                    <input type="text" className="form-input" placeholder="Name" value={newExpense.vendor_name || ''} onChange={e => setNewExpense({...newExpense, vendor_name: e.target.value})} />
                  </div>
                  <div style={{ display: 'flex', gap: '1rem', marginTop: '0.5rem' }}>
                    <button type="button" className="btn btn-outline" style={{ flex: 1 }} onClick={() => { setShowExpenseForm(false); setEditingExpenseId(null); }}>Cancel</button>
                    <button type="submit" className="btn btn-primary" style={{ flex: 2, background: '#ef4444', borderColor: '#ef4444' }}>{editingExpenseId ? 'Update' : 'Save Expense'}</button>
                  </div>
                </form>
              </div>
            )}

            <div className="settings-card" style={{ padding: 0, overflow: 'hidden' }}>
              {filteredExpenses.length === 0 ? (
                <div style={{ padding: '3rem 1.5rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                  <p style={{ margin: 0, fontSize: '0.9rem', fontWeight: 500 }}>No expense records found for this period.</p>
                </div>
              ) : isMobile ? (
                <div style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  {filteredExpenses.map(e => {
                    const propName = cottages.find(c => c.id === e.cottage_id)?.name || 'General';
                    return (
                      <div key={e.id} style={{ background: 'var(--bg-color)', borderRadius: '12px', padding: '1rem', border: '1px solid var(--border)', position: 'relative' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem' }}>
                          <div>
                             <div style={{ fontWeight: 700, color: 'var(--text-main)', fontSize: '0.95rem' }}>{e.category}</div>
                             <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem', marginTop: '2px' }}>{formatDateShort(e.date)} &bull; {propName}</div>
                             <div style={{ color: 'var(--text-muted)', fontWeight: 600, fontSize: '0.8rem', marginTop: '0.4rem' }}>{e.vendor_name || 'General'}</div>
                          </div>
                          <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.5rem' }}>
                            <div style={{ color: '#ef4444', fontWeight: 800, fontSize: '1.1rem', fontVariantNumeric: 'tabular-nums' }}>₹{Number(e.amount).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                            <div style={{ display: 'flex', gap: '0.4rem' }}>
                               <button onClick={() => loadExpenseForEdit(e)} title="Edit Expense" style={{ color: 'var(--primary)', padding: '0.4rem', background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: '6px', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}><Edit2 size={14}/></button>
                               <button onClick={() => deleteRecord('expenses', e.id)} title="Delete Expense" style={{ color: '#ef4444', padding: '0.4rem', background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: '6px', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}><Trash2 size={14}/></button>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="table-container" style={{ maxHeight: '700px', overflowY: 'auto' }}>
                  <table className="table" style={{ margin: 0, width: '100%', tableLayout: 'fixed' }}>
                    <colgroup>
                      <col style={{ width: '90px' }} />
                      <col style={{ width: 'auto' }} />
                      <col style={{ width: '120px' }} />
                      <col style={{ width: '75px' }} />
                    </colgroup>
                    <thead style={{ position: 'sticky', top: 0, background: 'var(--bg-secondary)', zIndex: 1, borderBottom: '1px solid var(--border)' }}>
                      <tr style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-muted)', letterSpacing: '0.04em' }}>
                          <th style={{ padding: '0.85rem 0.75rem', textAlign: 'left' }}>Date</th>
                          <th style={{ padding: '0.85rem 0.75rem', textAlign: 'left' }}>Details</th>
                          <th style={{ textAlign: 'right', padding: '0.85rem 0.75rem' }}>Amount</th>
                          <th style={{ textAlign: 'center', padding: '0.85rem 0.5rem' }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredExpenses.map(e => (
                        <tr key={e.id} className="table-row-hover" style={{ borderBottom: '1px solid var(--border)' }}>
                          <td style={{ fontSize: '0.825rem', padding: '0.85rem 0.75rem', verticalAlign: 'top', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                            {formatDateShort(e.date)}
                          </td>
                          <td style={{ padding: '0.85rem 0.75rem', verticalAlign: 'top' }}>
                            <div style={{ fontWeight: '700', fontSize: '0.925rem', color: 'var(--text-main)', lineHeight: '1.25' }}>{e.category}</div>
                            <div style={{ marginTop: '4px', marginBottom: '2px' }}>
                              <span style={{ fontSize: '0.7rem', padding: '2px 7px', borderRadius: '6px', background: 'var(--bg-secondary)', color: 'var(--text-muted)', border: '1px solid var(--border)', fontWeight: 600, whiteSpace: 'nowrap' }}>
                                {cottages.find(c => c.id === e.cottage_id)?.name || 'General'}
                              </span>
                            </div>
                            <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem', display: 'block' }}>{e.vendor_name || 'General'}</span>
                          </td>
                          <td style={{ color: '#ef4444', fontWeight: '800', fontSize: '0.95rem', padding: '0.85rem 0.75rem', verticalAlign: 'top', textAlign: 'right', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                            ₹{Number(e.amount).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </td>
                          <td style={{ textAlign: 'center', padding: '0.85rem 0.5rem', verticalAlign: 'top' }}>
                            <div style={{ display: 'flex', gap: '0.35rem', justifyContent: 'center', alignItems: 'center' }}>
                              <button onClick={() => loadExpenseForEdit(e)} title="Edit Expense" style={{ color: 'var(--text-main)', padding: '0.35rem', background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: '6px', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}><Edit2 size={14}/></button>
                              <button onClick={() => deleteRecord('expenses', e.id)} title="Delete Expense" style={{ color: '#ef4444', padding: '0.35rem', background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: '6px', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}><Trash2 size={14}/></button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}

