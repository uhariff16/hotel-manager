import React, { useState, useEffect } from 'react';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { Trash2, ArrowUpRight, ArrowDownRight, Edit2 } from 'lucide-react';
import { useSettingsStore } from '../lib/store';

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

  const stats = React.useMemo(() => {
    const totalInc = incomes.reduce((sum, i) => sum + Number(i.amount), 0);
    const totalExp = expenses.reduce((sum, e) => sum + Number(e.amount), 0);
    return { totalInc, totalExp, net: totalInc - totalExp };
  }, [incomes, expenses]);

  useEffect(() => {
    fetchData();
  }, [activeResortId]);

  const fetchData = async () => {
    if (!isSupabaseConfigured()) { setLoading(false); return; }
    try {
      const [inc, exp] = await Promise.all([
        supabase.from('incomes').select('*, bookings(reference_number)').eq('resort_id', activeResortId).order('date', { ascending: false }),
        supabase.from('expenses').select('*').eq('resort_id', activeResortId).order('date', { ascending: false })
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
        const { data, error } = await supabase.from('incomes').update(payload).eq('id', editingIncomeId).select('*, bookings(reference_number)');
        if (error) throw error;
        setIncomes(incomes.map(inc => inc.id === editingIncomeId ? data[0] : inc));
        setEditingIncomeId(null);
      } else {
        const { data, error } = await supabase.from('incomes').insert([payload]).select('*, bookings(reference_number)');
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
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
  };

  if(loading) return <div>Loading...</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      {/* GLOBAL SUMMARY DASHBOARD */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
        <div className="card" style={{ background: 'var(--bg-secondary)', borderLeft: '6px solid var(--success)', padding: '0.75rem' }}>
          <small style={{ color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700, fontSize: '0.65rem' }}>Total Income</small>
          <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--success)' }}>₹{stats.totalInc.toLocaleString()}</div>
        </div>
        <div className="card" style={{ background: 'var(--bg-secondary)', borderLeft: '6px solid var(--danger)', padding: '0.75rem' }}>
          <small style={{ color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700, fontSize: '0.65rem' }}>Total Expenses</small>
          <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--danger)' }}>₹{stats.totalExp.toLocaleString()}</div>
        </div>
        <div className="card" style={{ background: stats.net >= 0 ? 'var(--success)' : 'var(--danger)', color: 'white', padding: '0.75rem' }}>
          <small style={{ opacity: 0.8, textTransform: 'uppercase', fontWeight: 700, fontSize: '0.65rem' }}>Net Profit/Loss</small>
          <div style={{ fontSize: '1.5rem', fontWeight: 800 }}>₹{stats.net.toLocaleString()}</div>
        </div>
      </div>

      {/* MOBILE TAB SWITCHER */}
      <div className="mobile-only" style={{ display: 'flex', background: 'var(--bg-secondary)', borderRadius: 'var(--radius-md)', padding: '0.3rem', border: '1px solid var(--border)', marginBottom: '0.5rem' }}>
        <button onClick={() => setActiveMobileTab('income')} style={{ flex: 1, padding: '0.6rem', borderRadius: 'var(--radius-md)', border: 'none', background: activeMobileTab === 'income' ? 'var(--success)' : 'transparent', color: activeMobileTab === 'income' ? 'white' : 'var(--text-muted)', fontWeight: 700, fontSize: '0.85rem' }}>Income</button>
        <button onClick={() => setActiveMobileTab('expense')} style={{ flex: 1, padding: '0.6rem', borderRadius: 'var(--radius-md)', border: 'none', background: activeMobileTab === 'expense' ? 'var(--danger)' : 'transparent', color: activeMobileTab === 'expense' ? 'white' : 'var(--text-muted)', fontWeight: 700, fontSize: '0.85rem' }}>Expenses</button>
      </div>

      <div className="financials-main-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.5rem' }}>
        
        {/* INCOMES SECTION */}
        <div style={{ display: (activeMobileTab === 'income' || window.innerWidth > 768) ? 'block' : 'none' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
            <h2 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--success)', fontSize: '1.15rem' }}><ArrowUpRight size={20} /> Incomes</h2>
            <button className="mobile-only btn btn-outline" style={{ height: '32px', padding: '0 0.75rem', fontSize: '0.75rem' }} onClick={() => setShowIncomeForm(!showIncomeForm)}>
              {showIncomeForm ? 'Close' : '+ Add'}
            </button>
          </div>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div className={`card ${!showIncomeForm ? 'desktop-only' : ''}`} style={{ padding: '1rem' }}>
              <form onSubmit={handleIncomeSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.8rem' }}>
                  <div className="form-group"><label className="form-label" style={{ fontSize: '0.75rem' }}>Date</label><input type="date" required className="form-input" style={{ padding: '0.5rem' }} value={newIncome.date} onChange={e => setNewIncome({...newIncome, date: e.target.value})} /></div>
                  <div className="form-group">
                    <label className="form-label" style={{ fontSize: '0.75rem' }}>Amount</label>
                    <input type="number" required className="form-input" style={{ padding: '0.5rem' }} placeholder="₹" value={newIncome.amount} onChange={e => setNewIncome({...newIncome, amount: e.target.value})} />
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label" style={{ fontSize: '0.75rem' }}>Source</label>
                  <select className="form-select" style={{ padding: '0.5rem' }} value={newIncome.source} onChange={e => setNewIncome({...newIncome, source: e.target.value})}>
                    <option>Room Rent</option><option>Food</option><option>Activities</option><option>Other</option>
                  </select>
                </div>
                <div className="form-group"><label className="form-label" style={{ fontSize: '0.75rem' }}>Ref #</label><input type="text" className="form-input" style={{ padding: '0.5rem' }} placeholder="Booking Ref" value={newIncome.reference_number || ''} onChange={e => setNewIncome({...newIncome, reference_number: e.target.value})} /></div>
                <button type="submit" className="btn btn-primary" style={{ width: '100%', padding: '0.6rem' }}>{editingIncomeId ? 'Update' : 'Save Income'}</button>
              </form>
            </div>

            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
              <div className="table-container" style={{ maxHeight: '600px', overflowY: 'auto' }}>
                <table className="table" style={{ margin: 0, width: '100%', tableLayout: 'fixed' }}>
                  <colgroup>
                    <col style={{ width: '60px' }} />
                    <col style={{ width: 'auto' }} />
                    <col style={{ width: '85px' }} />
                    <col style={{ width: '60px' }} />
                  </colgroup>
                  <thead style={{ position: 'sticky', top: 0, background: 'var(--bg-secondary)', zIndex: 1 }}>
                    <tr style={{ fontSize: '0.7rem' }}><th>Date</th><th>Details</th><th>Amount</th><th style={{ textAlign: 'center' }}>Act</th></tr>
                  </thead>
                  <tbody>
                    <tr style={{ background: 'rgba(16, 185, 129, 0.05)', fontWeight: 'bold' }}>
                      <td colSpan="2" style={{ color: 'var(--text-muted)', fontSize: '0.65rem', textTransform: 'uppercase', padding: '0.4rem' }}>Total Income</td>
                      <td style={{ color: 'var(--success)', fontSize: '0.85rem', padding: '0.4rem' }}>₹{stats.totalInc.toLocaleString()}</td>
                      <td></td>
                    </tr>
                    {incomes.map(i => {
                      const isAutoGenerated = i.booking_id && (i.notes?.includes('Auto-added') || i.notes?.includes('Settled') || i.notes?.includes('Refund'));
                      return (
                      <tr key={i.id}>
                        <td style={{ fontSize: '0.65rem', padding: '0.5rem 0.2rem', verticalAlign: 'top' }}>{formatDateShort(i.date)}</td>
                        <td style={{ padding: '0.5rem 0.2rem', verticalAlign: 'top' }}>
                          <div style={{ fontWeight: '700', fontSize: '0.8rem', wordBreak: 'break-word', lineHeight: '1.2' }}>{i.source}</div>
                          {i.bookings?.reference_number && <small style={{ color: 'var(--primary)', fontWeight: '800', fontSize: '0.6rem', display: 'block' }}>#{i.bookings.reference_number.slice(-4)}</small>}
                        </td>
                        <td style={{ color: 'var(--success)', fontWeight: '800', fontSize: '0.85rem', padding: '0.5rem 0.2rem', verticalAlign: 'top' }}>+₹{i.amount}</td>
                        <td style={{ textAlign: 'center', padding: '0.5rem 0.2rem', verticalAlign: 'top' }}>
                          {!isAutoGenerated && (
                            <div style={{ display: 'flex', gap: '0.2rem', justifyContent: 'center' }}>
                              <button onClick={() => loadIncomeForEdit(i)} style={{ border: 'none', background: 'transparent', color: 'var(--primary)', padding: '0.1rem' }}><Edit2 size={12}/></button>
                              <button onClick={() => deleteRecord('incomes', i.id)} style={{ border: 'none', background: 'transparent', color: 'var(--danger)', padding: '0.1rem' }}><Trash2 size={12}/></button>
                            </div>
                          )}
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
        <div style={{ display: (activeMobileTab === 'expense' || window.innerWidth > 768) ? 'block' : 'none' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
            <h2 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--danger)', fontSize: '1.15rem' }}><ArrowDownRight size={20} /> Expenses</h2>
            <button className="mobile-only btn btn-outline" style={{ height: '32px', padding: '0 0.75rem', fontSize: '0.75rem' }} onClick={() => setShowExpenseForm(!showExpenseForm)}>
              {showExpenseForm ? 'Close' : '+ Add'}
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div className={`card ${!showExpenseForm ? 'desktop-only' : ''}`} style={{ padding: '1rem' }}>
              <form onSubmit={handleExpenseSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.8rem' }}>
                  <div className="form-group"><label className="form-label" style={{ fontSize: '0.75rem' }}>Date</label><input type="date" required className="form-input" style={{ padding: '0.5rem' }} value={newExpense.date} onChange={e => setNewExpense({...newExpense, date: e.target.value})} /></div>
                  <div className="form-group">
                    <label className="form-label" style={{ fontSize: '0.75rem' }}>Amount</label>
                    <input type="number" required className="form-input" style={{ padding: '0.5rem' }} placeholder="₹" value={newExpense.amount} onChange={e => setNewExpense({...newExpense, amount: e.target.value})} />
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label" style={{ fontSize: '0.75rem' }}>Category</label>
                  <select className="form-select" style={{ padding: '0.5rem' }} value={newExpense.category} onChange={e => setNewExpense({...newExpense, category: e.target.value})}>
                    <option>Maintenance</option><option>Salary</option><option>Utilities</option><option>Supplies</option><option>Other</option>
                  </select>
                </div>
                <div className="form-group"><label className="form-label" style={{ fontSize: '0.75rem' }}>Vendor</label><input type="text" className="form-input" style={{ padding: '0.5rem' }} placeholder="Name" value={newExpense.vendor_name} onChange={e => setNewExpense({...newExpense, vendor_name: e.target.value})} /></div>
                <button type="submit" className="btn btn-primary" style={{ width: '100%', background: 'var(--danger)', borderColor: 'var(--danger)', padding: '0.6rem' }}>{editingExpenseId ? 'Update' : 'Save Expense'}</button>
              </form>
            </div>

            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
              <div className="table-container" style={{ maxHeight: '600px', overflowY: 'auto' }}>
                <table className="table" style={{ margin: 0, width: '100%', tableLayout: 'fixed' }}>
                  <colgroup>
                    <col style={{ width: '60px' }} />
                    <col style={{ width: 'auto' }} />
                    <col style={{ width: '85px' }} />
                    <col style={{ width: '60px' }} />
                  </colgroup>
                  <thead style={{ position: 'sticky', top: 0, background: 'var(--bg-secondary)', zIndex: 1 }}>
                    <tr style={{ fontSize: '0.7rem' }}><th>Date</th><th>Details</th><th>Amount</th><th style={{ textAlign: 'center' }}>Act</th></tr>
                  </thead>
                  <tbody>
                    <tr style={{ background: 'rgba(239, 68, 68, 0.05)', fontWeight: 'bold' }}>
                      <td colSpan="2" style={{ color: 'var(--text-muted)', fontSize: '0.65rem', textTransform: 'uppercase', padding: '0.4rem' }}>Total Expenses</td>
                      <td style={{ color: 'var(--danger)', fontSize: '0.85rem', padding: '0.4rem' }}>₹{stats.totalExp.toLocaleString()}</td>
                      <td></td>
                    </tr>
                    {expenses.map(e => (
                      <tr key={e.id}>
                        <td style={{ fontSize: '0.65rem', padding: '0.5rem 0.2rem', verticalAlign: 'top' }}>{formatDateShort(e.date)}</td>
                        <td style={{ padding: '0.5rem 0.2rem', verticalAlign: 'top' }}>
                          <div style={{ fontWeight: '700', fontSize: '0.8rem', wordBreak: 'break-word', lineHeight: '1.2' }}>{e.category}</div>
                          <small style={{ color: 'var(--text-muted)', fontSize: '0.6rem', display: 'block' }}>{e.vendor_name || 'General'}</small>
                        </td>
                        <td style={{ color: 'var(--danger)', fontWeight: '800', fontSize: '0.85rem', padding: '0.5rem 0.2rem', verticalAlign: 'top' }}>-₹{e.amount}</td>
                        <td style={{ textAlign: 'center', padding: '0.5rem 0.2rem', verticalAlign: 'top' }}>
                          <div style={{ display: 'flex', gap: '0.2rem', justifyContent: 'center' }}>
                            <button onClick={() => loadExpenseForEdit(e)} style={{ border: 'none', background: 'transparent', color: 'var(--primary)', padding: '0.1rem' }}><Edit2 size={12}/></button>
                            <button onClick={() => deleteRecord('expenses', e.id)} style={{ border: 'none', background: 'transparent', color: 'var(--danger)', padding: '0.1rem' }}><Trash2 size={12}/></button>
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
