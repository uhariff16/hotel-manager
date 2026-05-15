import React, { useState, useEffect } from 'react';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { Trash2, ArrowUpRight, ArrowDownRight, Edit2, Filter, CalendarCheck } from 'lucide-react';
import { useSettingsStore } from '../lib/store';
import { startOfMonth, endOfMonth, format } from 'date-fns';

export default function Financials() {
  const { session, activeResortId } = useSettingsStore();
  const [incomes, setIncomes] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [loading, setLoading] = useState(true);

  const [newIncome, setNewIncome] = useState({ date: new Date().toISOString().split('T')[0], source: 'Room Rent', amount: 0, payment_mode: 'UPI', notes: '', reference_number: '' });
  const [newExpense, setNewExpense] = useState({ date: new Date().toISOString().split('T')[0], category: 'Maintenance', amount: 0, vendor_name: '', payment_mode: 'Cash', notes: '' });
  const [editingExpenseId, setEditingExpenseId] = useState(null);
  const [editingIncomeId, setEditingIncomeId] = useState(null);
  
  const [activeMobileTab, setActiveMobileTab] = useState('income');
  const [showIncomeForm, setShowIncomeForm] = useState(false);
  const [showExpenseForm, setShowExpenseForm] = useState(false);
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);
  
  const [range, setRange] = useState({
    start: `${new Date().getFullYear()}-01-01`,
    end: `${new Date().getFullYear()}-12-31`
  });

  const stats = React.useMemo(() => {
    const totalInc = incomes.reduce((sum, i) => sum + Number(i.amount), 0);
    const totalExp = expenses.reduce((sum, e) => sum + Number(e.amount), 0);
    return { totalInc, totalExp, net: totalInc - totalExp };
  }, [incomes, expenses]);

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
  
  const currentMonthIdx = React.useMemo(() => {
    const d = new Date(range.start);
    const dEnd = new Date(range.end);
    if (d.getMonth() === dEnd.getMonth() && d.getFullYear() === dEnd.getFullYear()) {
        return d.getMonth();
    }
    return -1;
  }, [range.start, range.end]);

  const isFullYear = React.useMemo(() => {
    const year = new Date().getFullYear();
    return range.start === `${year}-01-01` && range.end === `${year}-12-31`;
  }, [range.start, range.end]);

  useEffect(() => {
    fetchData();
    const handleResize = () => setIsMobile(window.innerWidth <= 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [activeResortId, range]);

  const fetchData = async () => {
    if (!isSupabaseConfigured() || !activeResortId) { setLoading(false); return; }
    try {
      const [inc, exp] = await Promise.all([
        supabase.from('incomes').select('*, bookings(reference_number, guest_name)').eq('resort_id', activeResortId).gte('date', range.start).lte('date', range.end).order('date', { ascending: false }),
        supabase.from('expenses').select('*').eq('resort_id', activeResortId).gte('date', range.start).lte('date', range.end).order('date', { ascending: false })
      ]);
      setIncomes(inc.data || []);
      setExpenses(exp.data || []);
    } catch(err) {
      console.error(err);
    } finally { setLoading(false); }
  };

  const handleIncomeSubmit = async (e) => {
    e.preventDefault();
    try {
      const payload = { ...newIncome, tenant_id: session.user.id, resort_id: activeResortId };
      if (payload.source === 'Other') payload.source = payload.custom_source || 'Other';
      
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
        const { data, error } = await supabase.from('incomes').update(payload).eq('id', editingIncomeId).select('*, bookings(reference_number, guest_name)');
        if (error) throw error;
        setIncomes(incomes.map(inc => inc.id === editingIncomeId ? data[0] : inc));
        setEditingIncomeId(null);
      } else {
        const { data, error } = await supabase.from('incomes').insert([payload]).select('*, bookings(reference_number, guest_name)');
        if (error) throw error;
        setIncomes([data[0], ...incomes]);
      }

      setNewIncome({ date: new Date().toISOString().split('T')[0], source: 'Room Rent', amount: 0, payment_mode: 'UPI', notes: '', reference_number: '', custom_source: '' });
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
      custom_source: ''
    });
    setShowIncomeForm(true);
  };

  const handleExpenseSubmit = async (e) => {
    e.preventDefault();
    try {
      const payload = { ...newExpense, tenant_id: session.user.id, resort_id: activeResortId };
      if (payload.category === 'Other') payload.category = payload.custom_category || 'Other';
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
      
      setNewExpense({ date: new Date().toISOString().split('T')[0], category: 'Maintenance', amount: 0, vendor_name: '', payment_mode: 'Cash', notes: '', custom_category: '' });
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
      custom_category: ''
    });
    setShowExpenseForm(true);
  };

  const deleteRecord = async (table, id) => {
    if(!window.confirm('Delete record?')) return;

    if (table === 'incomes') {
      const income = incomes.find(i => i.id === id);
      if (income && income.booking_id) {
         const { data: bData } = await supabase.from('bookings').select('total_amount, advance_paid, balance_amount, status').eq('id', income.booking_id).single();
         if (bData) {
            const newAdvance = Number(bData.advance_paid) - Number(income.amount);
            await supabase.from('bookings').update({ 
               advance_paid: newAdvance, 
               balance_amount: Number(bData.total_amount) - newAdvance,
               status: 'Confirmed' 
            }).eq('id', income.booking_id);
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
      
      {/* FILTER SECTION */}
      <div className="card" style={{ padding: '1rem 1.5rem', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.05)' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: '1.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flex: 1, minWidth: '300px' }}>
            <h3 style={{ margin: 0, fontSize: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem', whiteSpace: 'nowrap' }}>
              <Filter size={18} color="var(--primary)"/> Period:
            </h3>
            <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                <button 
                  onClick={setYearRange}
                  style={{ 
                    padding: '0.4rem 0.75rem', fontSize: '0.75rem', fontWeight: 800, borderRadius: '6px', cursor: 'pointer',
                    border: isFullYear ? '1px solid var(--primary)' : '1px solid var(--border)',
                    background: isFullYear ? 'var(--primary)' : 'white',
                    color: isFullYear ? 'white' : 'var(--text-main)'
                  }}
                >
                  Full Year
                </button>
                {months.map((m, i) => (
                  <button 
                    key={m} onClick={() => setMonthRange(i)}
                    style={{ 
                      padding: '0.4rem 0.6rem', fontSize: '0.75rem', fontWeight: 700, borderRadius: '6px', cursor: 'pointer',
                      border: currentMonthIdx === i ? '1px solid var(--primary)' : '1px solid var(--border)',
                      background: currentMonthIdx === i ? 'var(--primary)' : 'white',
                      color: currentMonthIdx === i ? 'white' : 'var(--text-main)'
                    }}
                  >
                    {m}
                  </button>
                ))}
            </div>
          </div>
          <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <small style={{ fontWeight: 700, opacity: 0.6 }}>FROM</small>
              <input type="date" className="form-input" style={{ width: '130px', height: '32px', fontSize: '0.8rem' }} value={range.start} onChange={e => setRange({...range, start: e.target.value})} />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <small style={{ fontWeight: 700, opacity: 0.6 }}>TO</small>
              <input type="date" className="form-input" style={{ width: '130px', height: '32px', fontSize: '0.8rem' }} value={range.end} onChange={e => setRange({...range, end: e.target.value})} />
            </div>
          </div>
        </div>
      </div>
      {/* GLOBAL SUMMARY DASHBOARD */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1.5rem' }}>
        <div className="card" style={{ background: 'var(--bg-secondary)', borderLeft: '6px solid var(--success)', padding: isMobile ? '0.75rem' : '1.25rem' }}>
          <small style={{ color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700, fontSize: isMobile ? '0.65rem' : '0.8rem' }}>Total Income</small>
          <div style={{ fontSize: isMobile ? '1.5rem' : '2rem', fontWeight: 800, color: 'var(--success)', marginTop: '0.5rem' }}>₹{stats.totalInc.toLocaleString()}</div>
        </div>
        <div className="card" style={{ background: 'var(--bg-secondary)', borderLeft: '6px solid var(--danger)', padding: isMobile ? '0.75rem' : '1.25rem' }}>
          <small style={{ color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700, fontSize: isMobile ? '0.65rem' : '0.8rem' }}>Total Expenses</small>
          <div style={{ fontSize: isMobile ? '1.5rem' : '2rem', fontWeight: 800, color: 'var(--danger)', marginTop: '0.5rem' }}>₹{stats.totalExp.toLocaleString()}</div>
        </div>
        <div className="card" style={{ background: stats.net >= 0 ? 'var(--success)' : 'var(--danger)', color: 'white', padding: isMobile ? '0.75rem' : '1.25rem' }}>
          <small style={{ opacity: 0.8, textTransform: 'uppercase', fontWeight: 700, fontSize: isMobile ? '0.65rem' : '0.8rem' }}>Net Profit/Loss</small>
          <div style={{ fontSize: isMobile ? '1.5rem' : '2rem', fontWeight: 800, marginTop: '0.5rem' }}>₹{stats.net.toLocaleString()}</div>
        </div>
      </div>

      {/* MOBILE TAB SWITCHER */}
      <div className="mobile-only" style={{ display: 'flex', background: 'var(--bg-secondary)', borderRadius: 'var(--radius-md)', padding: '0.3rem', border: '1px solid var(--border)', marginBottom: '0.5rem' }}>
        <button onClick={() => setActiveMobileTab('income')} style={{ flex: 1, padding: '0.6rem', borderRadius: 'var(--radius-md)', border: 'none', background: activeMobileTab === 'income' ? 'var(--success)' : 'transparent', color: activeMobileTab === 'income' ? 'white' : 'var(--text-muted)', fontWeight: 700, fontSize: '0.85rem' }}>Income</button>
        <button onClick={() => setActiveMobileTab('expense')} style={{ flex: 1, padding: '0.6rem', borderRadius: 'var(--radius-md)', border: 'none', background: activeMobileTab === 'expense' ? 'var(--danger)' : 'transparent', color: activeMobileTab === 'expense' ? 'white' : 'var(--text-muted)', fontWeight: 700, fontSize: '0.85rem' }}>Expenses</button>
      </div>

      <div className="financials-main-grid" style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fit, minmax(500px, 1fr))', gap: '2rem' }}>
        
        {/* INCOMES SECTION */}
        <div style={{ display: (activeMobileTab === 'income' || !isMobile) ? 'block' : 'none' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
            <h2 style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', color: 'var(--success)', fontSize: isMobile ? '1.15rem' : '1.5rem' }}><ArrowUpRight size={isMobile ? 20 : 28} /> Incomes</h2>
            <button className="mobile-only btn btn-outline" style={{ height: '32px', padding: '0 0.75rem', fontSize: '0.75rem' }} onClick={() => setShowIncomeForm(!showIncomeForm)}>
              {showIncomeForm ? 'Close Form' : '+ Add New'}
            </button>
          </div>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            <div className={`card ${!showIncomeForm && isMobile ? 'desktop-only' : ''}`} style={{ padding: '1.5rem' }}>
              <form onSubmit={handleIncomeSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                  <div className="form-group"><label className="form-label">Date</label><input type="date" required className="form-input" value={newIncome.date} onChange={e => setNewIncome({...newIncome, date: e.target.value})} /></div>
                  <div className="form-group">
                    <label className="form-label">Amount</label>
                    <input type="number" required className="form-input" placeholder="₹" value={newIncome.amount} onChange={e => setNewIncome({...newIncome, amount: e.target.value})} />
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label">Source</label>
                  <select className="form-select" value={newIncome.source} onChange={e => setNewIncome({...newIncome, source: e.target.value})}>
                    <option>Room Rent</option><option>Food</option><option>Activities</option><option>Other</option>
                  </select>
                </div>
                <div className="form-group"><label className="form-label">Ref #</label><input type="text" className="form-input" placeholder="Booking Ref" value={newIncome.reference_number || ''} onChange={e => setNewIncome({...newIncome, reference_number: e.target.value})} /></div>
                <button type="submit" className="btn btn-primary" style={{ width: '100%' }}>{editingIncomeId ? 'Update' : 'Save Income'}</button>
              </form>
            </div>

            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
              <div className="table-container" style={{ maxHeight: '700px', overflowY: 'auto' }}>
                <table className="table" style={{ margin: 0, width: '100%', tableLayout: 'fixed' }}>
                  <colgroup>
                    <col style={{ width: isMobile ? '45px' : '110px' }} />
                    <col style={{ width: 'auto' }} />
                    <col style={{ width: isMobile ? '70px' : '120px' }} />
                    <col style={{ width: isMobile ? '45px' : '100px' }} />
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
                    {incomes.map(i => {
                      const isAutoGenerated = i.booking_id && (i.notes?.includes('Auto') || i.notes?.includes('Settled') || i.notes?.includes('Refund') || i.notes?.includes('Settlement'));
                      return (
                      <tr key={i.id} className="table-row-hover">
                        <td style={{ fontSize: isMobile ? '0.6rem' : '0.9rem', padding: isMobile ? '0.4rem 0.15rem' : '1rem', verticalAlign: 'top', color: 'var(--text-muted)' }}>{formatDateShort(i.date)}</td>
                        <td style={{ padding: isMobile ? '0.4rem 0.15rem' : '1rem', verticalAlign: 'top' }}>
                          <div style={{ fontWeight: '700', fontSize: isMobile ? '0.75rem' : '1rem', wordBreak: 'break-word', lineHeight: '1.2' }}>{i.source}</div>
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
            </div>
          </div>
        </div>

        {/* EXPENSES SECTION */}
        <div style={{ display: (activeMobileTab === 'expense' || !isMobile) ? 'block' : 'none' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
            <h2 style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', color: 'var(--danger)', fontSize: isMobile ? '1.15rem' : '1.5rem' }}><ArrowDownRight size={isMobile ? 20 : 28} /> Expenses</h2>
            <button className="mobile-only btn btn-outline" style={{ height: '32px', padding: '0 0.75rem', fontSize: '0.75rem' }} onClick={() => setShowExpenseForm(!showExpenseForm)}>
              {showExpenseForm ? 'Close Form' : '+ Add New'}
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            <div className={`card ${!showExpenseForm && isMobile ? 'desktop-only' : ''}`} style={{ padding: '1.5rem' }}>
              <form onSubmit={handleExpenseSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                  <div className="form-group"><label className="form-label">Date</label><input type="date" required className="form-input" value={newExpense.date} onChange={e => setNewExpense({...newExpense, date: e.target.value})} /></div>
                  <div className="form-group">
                    <label className="form-label">Amount</label>
                    <input type="number" required className="form-input" placeholder="₹" value={newExpense.amount} onChange={e => setNewExpense({...newExpense, amount: e.target.value})} />
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label">Category</label>
                  <select className="form-select" value={newExpense.category} onChange={e => setNewExpense({...newExpense, category: e.target.value})}>
                    <option>Maintenance</option><option>Salary</option><option>Utilities</option><option>Supplies</option><option>Other</option>
                  </select>
                </div>
                <div className="form-group"><label className="form-label">Vendor</label><input type="text" className="form-input" placeholder="Name" value={newExpense.vendor_name} onChange={e => setNewExpense({...newExpense, vendor_name: e.target.value})} /></div>
                <button type="submit" className="btn btn-primary" style={{ width: '100%', background: 'var(--danger)', borderColor: 'var(--danger)' }}>{editingExpenseId ? 'Update' : 'Save Expense'}</button>
              </form>
            </div>

            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
              <div className="table-container" style={{ maxHeight: '700px', overflowY: 'auto' }}>
                <table className="table" style={{ margin: 0, width: '100%', tableLayout: 'fixed' }}>
                  <colgroup>
                    <col style={{ width: isMobile ? '45px' : '110px' }} />
                    <col style={{ width: 'auto' }} />
                    <col style={{ width: isMobile ? '70px' : '120px' }} />
                    <col style={{ width: isMobile ? '45px' : '100px' }} />
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
                    {expenses.map(e => (
                      <tr key={e.id} className="table-row-hover">
                        <td style={{ fontSize: isMobile ? '0.6rem' : '0.9rem', padding: isMobile ? '0.4rem 0.15rem' : '1rem', verticalAlign: 'top', color: 'var(--text-muted)' }}>{formatDateShort(e.date)}</td>
                        <td style={{ padding: isMobile ? '0.4rem 0.15rem' : '1rem', verticalAlign: 'top' }}>
                          <div style={{ fontWeight: '700', fontSize: isMobile ? '0.75rem' : '1rem', wordBreak: 'break-word', lineHeight: '1.2' }}>{e.category}</div>
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
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
