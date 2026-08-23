import React, { useState, useEffect, useRef } from 'react';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { Trash2, ArrowUpRight, ArrowDownRight, Edit2, Filter, CalendarCheck, Plus, X } from 'lucide-react';
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

  const [newIncome, setNewIncome] = useState({ date: new Date().toISOString().split('T')[0], source: 'Room Rent', amount: 0, payment_mode: 'UPI', notes: '', reference_number: '', cottage_id: '' });
  const [newExpense, setNewExpense] = useState({ date: new Date().toISOString().split('T')[0], category: 'Maintenance', amount: 0, vendor_name: '', payment_mode: 'Cash', notes: '', cottage_id: '' });
  const [editingExpenseId, setEditingExpenseId] = useState(null);
  const [editingIncomeId, setEditingIncomeId] = useState(null);
  
  const [activeMobileTab, setActiveMobileTab] = useState('income');
  const [showIncomeForm, setShowIncomeForm] = useState(false);
  const [showExpenseForm, setShowExpenseForm] = useState(false);
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);
  
  const [periodType, setPeriodType] = useState('full_year');
  const [range, setRange] = useState({
    start: `${new Date().getFullYear()}-01-01`,
    end: `${new Date().getFullYear()}-12-31`
  });

  const filteredIncomes = React.useMemo(() => {
    if (selectedCottageId === 'all') return incomes;
    return incomes.filter(i => {
      const cId = i.cottage_id || i.bookings?.cottage_id;
      return cId === selectedCottageId;
    });
  }, [incomes, selectedCottageId]);

  const filteredExpenses = React.useMemo(() => {
    if (selectedCottageId === 'all') return expenses;
    return expenses.filter(e => e.cottage_id === selectedCottageId);
  }, [expenses, selectedCottageId]);

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
    const handleResize = () => setIsMobile(window.innerWidth <= 768);
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
      if (payload.cottage_id === '') payload.cottage_id = null;
      
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
        
        // Trigger notification if linked to a booking
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

      setNewIncome({ date: new Date().toISOString().split('T')[0], source: 'Room Rent', amount: 0, payment_mode: 'UPI', notes: '', reference_number: '', custom_source: '', cottage_id: '' });
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
      if (payload.cottage_id === '') payload.cottage_id = null;
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
      
      setNewExpense({ date: new Date().toISOString().split('T')[0], category: 'Maintenance', amount: 0, vendor_name: '', payment_mode: 'Cash', notes: '', custom_category: '', cottage_id: '' });
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
               // Parsing discount if any
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
               // Advance payment deletion
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

  if(loading) return <div>Loading...</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      
      {/* ACTION BUTTONS MOVED TO SECTIONS */}

      {/* FILTER SECTION */}
      <div className="card" style={{ padding: '1rem 1.5rem', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.05)' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: '1.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flex: 1, minWidth: '250px' }}>
            <h3 style={{ margin: 0, fontSize: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem', whiteSpace: 'nowrap' }}>
              <Filter size={18} color="var(--primary)"/> Period:
            </h3>
            <select className="form-select" style={{ width: '180px', height: '36px', fontSize: '0.9rem', fontWeight: 600 }} value={periodType} onChange={handlePeriodChange}>
              <option value="full_year">Full Year</option>
              <option value="this_month">This Month</option>
              <option value="last_month">Last Month</option>
              <option value="custom">Custom Range</option>
            </select>
          </div>
          <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <small style={{ fontWeight: 700, opacity: 0.6 }}>PROPERTY</small>
              <select className="form-select" style={{ width: '160px', height: '36px', fontSize: '0.85rem' }} value={selectedCottageId} onChange={e => setSelectedCottageId(e.target.value)}>
                <option value="all">All Properties</option>
                {cottages.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            {periodType === 'custom' && (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <small style={{ fontWeight: 700, opacity: 0.6 }}>FROM</small>
                  <input type="date" className="form-input" style={{ width: '130px', height: '36px', fontSize: '0.85rem' }} value={range.start} onChange={e => setRange({...range, start: e.target.value})} />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <small style={{ fontWeight: 700, opacity: 0.6 }}>TO</small>
                  <input type="date" className="form-input" style={{ width: '130px', height: '36px', fontSize: '0.85rem' }} value={range.end} onChange={e => setRange({...range, end: e.target.value})} />
                </div>
              </>
            )}
          </div>
        </div>
      </div>
      
      {/* GLOBAL SUMMARY DASHBOARD */}
      <div className="card" style={{ padding: isMobile ? '1.25rem' : '1.75rem', border: 'none', background: 'var(--bg-secondary)', position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', top: 0, left: 0, width: '6px', height: '100%', background: stats.net >= 0 ? 'var(--primary)' : 'var(--danger)' }}></div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          <div>
             <small style={{ color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 800, fontSize: '0.75rem', letterSpacing: '0.05em' }}>Net Profit / Loss</small>
             <div style={{ fontSize: isMobile ? '2.5rem' : '3.5rem', fontWeight: 900, color: stats.net >= 0 ? 'var(--primary)' : 'var(--danger)', marginTop: '0.25rem', letterSpacing: '-0.02em', lineHeight: 1 }}>₹{stats.net.toLocaleString()}</div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', borderTop: '1px solid var(--border)', paddingTop: '1.5rem' }}>
             <div>
                <small style={{ color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 800, fontSize: '0.7rem' }}>Total Income</small>
                <div style={{ fontSize: isMobile ? '1.25rem' : '1.75rem', fontWeight: 800, color: 'var(--success)', marginTop: '0.25rem' }}>₹{stats.totalInc.toLocaleString()}</div>
             </div>
             <div>
                <small style={{ color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 800, fontSize: '0.7rem' }}>Total Expenses</small>
                <div style={{ fontSize: isMobile ? '1.25rem' : '1.75rem', fontWeight: 800, color: 'var(--danger)', marginTop: '0.25rem' }}>₹{stats.totalExp.toLocaleString()}</div>
             </div>
          </div>
        </div>
      </div>
        
          {/* MOBILE TAB SWITCHER */}
        <div className="mobile-only" style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <div style={{ display: 'flex', background: 'var(--bg-secondary)', borderRadius: 'var(--radius-md)', padding: '0.3rem', border: '1px solid var(--border)' }}>
            <button onClick={() => setActiveMobileTab('income')} style={{ flex: 1, padding: '0.6rem', borderRadius: 'var(--radius-md)', border: 'none', background: activeMobileTab === 'income' ? 'var(--success)' : 'transparent', color: activeMobileTab === 'income' ? 'white' : 'var(--text-muted)', fontWeight: 700, fontSize: '0.85rem' }}>Income</button>
            <button onClick={() => setActiveMobileTab('expense')} style={{ flex: 1, padding: '0.6rem', borderRadius: 'var(--radius-md)', border: 'none', background: activeMobileTab === 'expense' ? 'var(--danger)' : 'transparent', color: activeMobileTab === 'expense' ? 'white' : 'var(--text-muted)', fontWeight: 700, fontSize: '0.85rem' }}>Expenses</button>
          </div>
        </div>

      <div ref={formContainerRef} className="financials-main-grid" style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fit, minmax(500px, 1fr))', gap: '2rem', scrollMarginTop: '80px' }}>
        
        {/* INCOMES SECTION */}
        <div style={{ display: (activeMobileTab === 'income' || !isMobile) ? 'block' : 'none' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
            <h2 style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', color: 'var(--success)', fontSize: isMobile ? '1.15rem' : '1.5rem', margin: 0 }}><ArrowUpRight size={isMobile ? 20 : 28} /> Incomes</h2>
            <button className="btn" style={{ background: 'var(--success)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', fontWeight: 'bold', padding: '0.4rem 0.8rem', fontSize: '0.9rem' }} onClick={() => { setShowIncomeForm(!showIncomeForm); if (!showIncomeForm) { setTimeout(() => formContainerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100); } }}>
              {showIncomeForm ? <X size={16} /> : <Plus size={16} />} {showIncomeForm ? 'Close' : 'Add Income'}
            </button>
          </div>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            {showIncomeForm && (
            <div className="card" style={{ padding: '1.5rem' }}>
              <form onSubmit={handleIncomeSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                  <div className="form-group"><label className="form-label">Date</label><input type="date" required className="form-input" value={newIncome.date} onChange={e => setNewIncome({...newIncome, date: e.target.value})} /></div>
                  <div className="form-group">
                    <label className="form-label">Amount</label>
                    <input type="number" required className="form-input" placeholder="₹" value={newIncome.amount} onChange={e => setNewIncome({...newIncome, amount: e.target.value})} />
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
                    <label className="form-label">Property (Optional)</label>
                    <select className="form-select" value={newIncome.cottage_id || ''} onChange={e => setNewIncome({...newIncome, cottage_id: e.target.value})}>
                      <option value="">General / All Properties</option>
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

            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
              {isMobile ? (
                <div style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem', background: 'var(--bg-secondary)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: '0.5rem', borderBottom: '1px solid var(--border)', fontWeight: 700, color: 'var(--text-muted)', fontSize: '0.75rem', textTransform: 'uppercase' }}>
                    <span>Total Income</span>
                    <span style={{ color: 'var(--success)', fontSize: '1rem' }}>₹{stats.totalInc.toLocaleString()}</span>
                  </div>
                  {filteredIncomes.map(i => {
                    const propName = cottages.find(c => c.id === (i.cottage_id || i.bookings?.cottage_id))?.name || 'General';
                    return (
                      <div key={i.id} style={{ background: 'var(--bg-color)', borderRadius: '12px', padding: '1rem', border: '1px solid var(--border)', position: 'relative' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem' }}>
                          <div>
                             <div style={{ fontWeight: 800, color: 'var(--text-main)', fontSize: '1rem' }}>{i.source}</div>
                             <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem', marginTop: '2px' }}>{formatDateShort(i.date)} &bull; {propName}</div>
                             {(i.notes?.toLowerCase().includes('advance') || i.notes?.toLowerCase().includes('settlement') || i.notes?.toLowerCase().includes('adjustment')) && (
                                <div style={{ marginTop: '0.4rem', display: 'flex', gap: '0.25rem', flexWrap: 'wrap' }}>
                                  {i.notes?.toLowerCase().includes('advance') && <span style={{ fontSize: '0.65rem', padding: '2px 6px', borderRadius: '4px', background: 'rgba(59, 130, 246, 0.1)', color: '#3b82f6', fontWeight: 700 }}>Advance</span>}
                                  {i.notes?.toLowerCase().includes('settlement') && <span style={{ fontSize: '0.65rem', padding: '2px 6px', borderRadius: '4px', background: 'rgba(139, 92, 246, 0.1)', color: '#8b5cf6', fontWeight: 700 }}>Settlement</span>}
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
                            <div style={{ color: 'var(--success)', fontWeight: 900, fontSize: '1.2rem' }}>₹{i.amount.toLocaleString()}</div>
                            <div style={{ display: 'flex', gap: '0.5rem' }}>
                               <button onClick={() => loadIncomeForEdit(i)} className="btn-icon" style={{ color: 'var(--primary)', padding: '0.4rem', background: 'var(--bg-secondary)', borderRadius: '6px' }}><Edit2 size={14}/></button>
                               <button onClick={() => deleteRecord('incomes', i.id)} className="btn-icon" style={{ color: 'var(--danger)', padding: '0.4rem', background: 'var(--bg-secondary)', borderRadius: '6px' }}><Trash2 size={14}/></button>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="table-container" style={{ maxHeight: '700px', overflowY: 'auto', overflowX: 'auto' }}>
                  <table className="table" style={{ margin: 0, width: '100%', tableLayout: isMobile ? 'auto' : 'fixed', minWidth: isMobile ? '350px' : '100%' }}>
                    <colgroup>
                      <col style={{ width: isMobile ? '15%' : '110px' }} />
                      <col style={{ width: isMobile ? '45%' : 'auto' }} />
                      <col style={{ width: isMobile ? '25%' : '120px' }} />
                      <col style={{ width: isMobile ? '15%' : '100px' }} />
                    </colgroup>
                    <thead style={{ position: 'sticky', top: 0, background: 'var(--bg-secondary)', zIndex: 1, borderBottom: '2px solid var(--border)' }}>
                      <tr style={{ fontSize: isMobile ? '0.7rem' : '0.85rem' }}>
                          <th style={{ padding: isMobile ? '0.4rem' : '1rem' }}>Date</th>
                          <th style={{ padding: isMobile ? '0.4rem' : '1rem' }}>Details</th>
                          <th style={{ textAlign: 'right', padding: isMobile ? '0.4rem' : '1rem' }}>Amount</th>
                          <th style={{ textAlign: 'center', padding: isMobile ? '0.4rem' : '1rem' }}>Act</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr style={{ background: 'rgba(16, 185, 129, 0.05)', fontWeight: 'bold' }}>
                        <td colSpan="2" style={{ color: 'var(--text-muted)', fontSize: isMobile ? '0.65rem' : '0.85rem', textTransform: 'uppercase', padding: isMobile ? '0.4rem' : '1rem' }}>Total Section</td>
                        <td style={{ color: 'var(--success)', fontSize: isMobile ? '0.85rem' : '1.15rem', padding: isMobile ? '0.4rem' : '1rem', textAlign: 'right' }}>₹{stats.totalInc.toLocaleString()}</td>
                        <td></td>
                      </tr>
                      {filteredIncomes.map(i => {
                        const isAutoGenerated = i.booking_id && (i.notes?.includes('Auto') || i.notes?.includes('Settled') || i.notes?.includes('Refund') || i.notes?.includes('Settlement'));
                        return (
                        <tr key={i.id} className="table-row-hover">
                          <td style={{ fontSize: isMobile ? '0.6rem' : '0.9rem', padding: isMobile ? '0.4rem 0.15rem' : '1rem', verticalAlign: 'top', color: 'var(--text-muted)' }}>{formatDateShort(i.date)}</td>
                          <td style={{ padding: isMobile ? '0.4rem 0.15rem' : '1rem', verticalAlign: 'top' }}>
                            <div style={{ fontWeight: '700', fontSize: isMobile ? '0.75rem' : '1rem', wordBreak: 'break-word', lineHeight: '1.2' }}>{i.source}</div>
                            <div style={{ marginTop: '2px', display: 'flex', gap: '0.25rem', flexWrap: 'wrap' }}>
                              <span style={{ fontSize: '0.65rem', padding: '1px 6px', borderRadius: '4px', background: 'rgba(0,0,0,0.05)', color: 'var(--text-muted)', fontWeight: 700 }}>
                                Prop: {cottages.find(c => c.id === (i.cottage_id || i.bookings?.cottage_id))?.name || 'General'}
                              </span>
                              {i.notes?.toLowerCase().includes('advance') && (
                                <span style={{ fontSize: '0.65rem', padding: '1px 6px', borderRadius: '4px', background: 'rgba(59, 130, 246, 0.1)', color: '#3b82f6', fontWeight: 700 }}>
                                  Advance
                                </span>
                              )}
                              {i.notes?.toLowerCase().includes('settlement') && (
                                <span style={{ fontSize: '0.65rem', padding: '1px 6px', borderRadius: '4px', background: 'rgba(139, 92, 246, 0.1)', color: '#8b5cf6', fontWeight: 700 }}>
                                  Settlement
                                </span>
                              )}
                              {i.notes?.toLowerCase().includes('adjustment') && (
                                <span style={{ fontSize: '0.65rem', padding: '1px 6px', borderRadius: '4px', background: 'rgba(239, 68, 68, 0.1)', color: 'var(--danger)', fontWeight: 700 }}>
                                  Adjustment
                                </span>
                              )}
                            </div>
                            {i.bookings?.reference_number && (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', marginTop: '4px' }}>
                                <small style={{ color: 'var(--text-main)', fontWeight: '700', fontSize: isMobile ? '0.65rem' : '0.85rem' }}>{i.bookings.guest_name}</small>
                                <small style={{ color: 'var(--primary)', fontWeight: '800', fontSize: isMobile ? '0.55rem' : '0.75rem' }}>REF: {i.bookings.reference_number}</small>
                              </div>
                            )}
                          </td>
                          <td style={{ color: 'var(--success)', fontWeight: '800', fontSize: isMobile ? '0.8rem' : '1.1rem', padding: isMobile ? '0.4rem 0.15rem' : '1rem', verticalAlign: 'top', textAlign: 'right' }}>₹{i.amount.toLocaleString()}</td>
                          <td style={{ textAlign: 'center', padding: isMobile ? '0.4rem 0.15rem' : '1rem', verticalAlign: 'top' }}>
                            <div style={{ display: 'flex', gap: isMobile ? '0.1rem' : '0.5rem', justifyContent: 'center' }}>
                              <button onClick={() => loadIncomeForEdit(i)} className="btn-icon" style={{ color: 'var(--primary)' }}><Edit2 size={isMobile ? 10 : 16}/></button>
                              <button onClick={() => deleteRecord('incomes', i.id)} className="btn-icon" style={{ color: 'var(--danger)' }}><Trash2 size={isMobile ? 10 : 16}/></button>
                            </div>
                          </td>
                        </tr>
                      )})}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* EXPENSES SECTION */}
        <div style={{ display: (activeMobileTab === 'expense' || !isMobile) ? 'block' : 'none' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
            <h2 style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', color: 'var(--danger)', fontSize: isMobile ? '1.15rem' : '1.5rem', margin: 0 }}><ArrowDownRight size={isMobile ? 20 : 28} /> Expenses</h2>
            <button className="btn" style={{ background: 'var(--danger)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', fontWeight: 'bold', padding: '0.4rem 0.8rem', fontSize: '0.9rem' }} onClick={() => { setShowExpenseForm(!showExpenseForm); if (!showExpenseForm) { setTimeout(() => formContainerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100); } }}>
              {showExpenseForm ? <X size={16} /> : <Plus size={16} />} {showExpenseForm ? 'Close' : 'Add Expense'}
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            {showExpenseForm && (
            <div className="card" style={{ padding: '1.5rem' }}>
              <form onSubmit={handleExpenseSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                  <div className="form-group"><label className="form-label">Date</label><input type="date" required className="form-input" value={newExpense.date} onChange={e => setNewExpense({...newExpense, date: e.target.value})} /></div>
                  <div className="form-group">
                    <label className="form-label">Amount</label>
                    <input type="number" required className="form-input" placeholder="₹" value={newExpense.amount} onChange={e => setNewExpense({...newExpense, amount: e.target.value})} />
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
                    <label className="form-label">Property (Optional)</label>
                    <select className="form-select" value={newExpense.cottage_id || ''} onChange={e => setNewExpense({...newExpense, cottage_id: e.target.value})}>
                      <option value="">General / All Properties</option>
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
                  <button type="submit" className="btn btn-primary" style={{ flex: 2, background: 'var(--danger)', borderColor: 'var(--danger)' }}>{editingExpenseId ? 'Update' : 'Save Expense'}</button>
                </div>
              </form>
            </div>
            )}

            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
              {isMobile ? (
                <div style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem', background: 'var(--bg-secondary)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: '0.5rem', borderBottom: '1px solid var(--border)', fontWeight: 700, color: 'var(--text-muted)', fontSize: '0.75rem', textTransform: 'uppercase' }}>
                    <span>Total Expenses</span>
                    <span style={{ color: 'var(--danger)', fontSize: '1rem' }}>₹{stats.totalExp.toLocaleString()}</span>
                  </div>
                  {filteredExpenses.map(e => {
                    const propName = cottages.find(c => c.id === e.cottage_id)?.name || 'General';
                    return (
                      <div key={e.id} style={{ background: 'var(--bg-color)', borderRadius: '12px', padding: '1rem', border: '1px solid var(--border)', position: 'relative' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem' }}>
                          <div>
                             <div style={{ fontWeight: 800, color: 'var(--text-main)', fontSize: '1rem' }}>{e.category}</div>
                             <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem', marginTop: '2px' }}>{formatDateShort(e.date)} &bull; {propName}</div>
                             <div style={{ color: 'var(--text-muted)', fontWeight: 600, fontSize: '0.8rem', marginTop: '0.4rem' }}>{e.vendor_name || 'General'}</div>
                          </div>
                          <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.5rem' }}>
                            <div style={{ color: 'var(--danger)', fontWeight: 900, fontSize: '1.2rem' }}>₹{e.amount.toLocaleString()}</div>
                            <div style={{ display: 'flex', gap: '0.5rem' }}>
                               <button onClick={() => loadExpenseForEdit(e)} className="btn-icon" style={{ color: 'var(--primary)', padding: '0.4rem', background: 'var(--bg-secondary)', borderRadius: '6px' }}><Edit2 size={14}/></button>
                               <button onClick={() => deleteRecord('expenses', e.id)} className="btn-icon" style={{ color: 'var(--danger)', padding: '0.4rem', background: 'var(--bg-secondary)', borderRadius: '6px' }}><Trash2 size={14}/></button>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="table-container" style={{ maxHeight: '700px', overflowY: 'auto', overflowX: 'auto' }}>
                  <table className="table" style={{ margin: 0, width: '100%', tableLayout: isMobile ? 'auto' : 'fixed', minWidth: isMobile ? '350px' : '100%' }}>
                    <colgroup>
                      <col style={{ width: isMobile ? '15%' : '110px' }} />
                      <col style={{ width: isMobile ? '45%' : 'auto' }} />
                      <col style={{ width: isMobile ? '25%' : '120px' }} />
                      <col style={{ width: isMobile ? '15%' : '100px' }} />
                    </colgroup>
                    <thead style={{ position: 'sticky', top: 0, background: 'var(--bg-secondary)', zIndex: 1, borderBottom: '2px solid var(--border)' }}>
                      <tr style={{ fontSize: isMobile ? '0.7rem' : '0.85rem' }}>
                          <th style={{ padding: isMobile ? '0.4rem' : '1rem' }}>Date</th>
                          <th style={{ padding: isMobile ? '0.4rem' : '1rem' }}>Details</th>
                          <th style={{ textAlign: 'right', padding: isMobile ? '0.4rem' : '1rem' }}>Amount</th>
                          <th style={{ textAlign: 'center', padding: isMobile ? '0.4rem' : '1rem' }}>Act</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr style={{ background: 'rgba(239, 68, 68, 0.05)', fontWeight: 'bold' }}>
                        <td colSpan="2" style={{ color: 'var(--text-muted)', fontSize: isMobile ? '0.65rem' : '0.85rem', textTransform: 'uppercase', padding: isMobile ? '0.4rem' : '1rem' }}>Total Section</td>
                        <td style={{ color: 'var(--danger)', fontSize: isMobile ? '0.85rem' : '1.15rem', padding: isMobile ? '0.4rem' : '1rem', textAlign: 'right' }}>₹{stats.totalExp.toLocaleString()}</td>
                        <td></td>
                      </tr>
                      {filteredExpenses.map(e => (
                        <tr key={e.id} className="table-row-hover">
                          <td style={{ fontSize: isMobile ? '0.6rem' : '0.9rem', padding: isMobile ? '0.4rem 0.15rem' : '1rem', verticalAlign: 'top', color: 'var(--text-muted)' }}>{formatDateShort(e.date)}</td>
                          <td style={{ padding: isMobile ? '0.4rem 0.15rem' : '1rem', verticalAlign: 'top' }}>
                            <div style={{ fontWeight: '700', fontSize: isMobile ? '0.75rem' : '1rem', wordBreak: 'break-word', lineHeight: '1.2' }}>{e.category}</div>
                            <div style={{ marginTop: '2px', marginBottom: '2px' }}>
                              <span style={{ fontSize: '0.65rem', padding: '1px 6px', borderRadius: '4px', background: 'rgba(0,0,0,0.05)', color: 'var(--text-muted)', fontWeight: 700 }}>
                                Prop: {cottages.find(c => c.id === e.cottage_id)?.name || 'General'}
                              </span>
                            </div>
                            <small style={{ color: 'var(--text-muted)', fontSize: isMobile ? '0.55rem' : '0.8rem', display: 'block' }}>{e.vendor_name || 'General'}</small>
                          </td>
                          <td style={{ color: 'var(--danger)', fontWeight: '800', fontSize: isMobile ? '0.8rem' : '1.1rem', padding: isMobile ? '0.4rem 0.15rem' : '1rem', verticalAlign: 'top', textAlign: 'right' }}>₹{e.amount.toLocaleString()}</td>
                          <td style={{ textAlign: 'center', padding: isMobile ? '0.4rem 0.15rem' : '1rem', verticalAlign: 'top' }}>
                            <div style={{ display: 'flex', gap: isMobile ? '0.1rem' : '0.5rem', justifyContent: 'center' }}>
                              <button onClick={() => loadExpenseForEdit(e)} className="btn-icon" style={{ color: 'var(--primary)' }}><Edit2 size={isMobile ? 10 : 16}/></button>
                              <button onClick={() => deleteRecord('expenses', e.id)} className="btn-icon" style={{ color: 'var(--danger)' }}><Trash2 size={10}/></button>
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
