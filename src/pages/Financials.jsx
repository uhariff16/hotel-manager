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

  if(loading) return <div>Loading...</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      {/* GLOBAL SUMMARY DASHBOARD */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1.5rem' }}>
        <div className="card" style={{ background: 'var(--bg-secondary)', borderLeft: '6px solid var(--success)' }}>
          <small style={{ color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700, fontSize: '0.7rem' }}>Total Income</small>
          <div style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--success)', marginTop: '0.5rem' }}>₹{stats.totalInc.toLocaleString()}</div>
        </div>
        <div className="card" style={{ background: 'var(--bg-secondary)', borderLeft: '6px solid var(--danger)' }}>
          <small style={{ color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700, fontSize: '0.7rem' }}>Total Expenses</small>
          <div style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--danger)', marginTop: '0.5rem' }}>₹{stats.totalExp.toLocaleString()}</div>
        </div>
        <div className="card" style={{ background: stats.net >= 0 ? 'var(--success)' : 'var(--danger)', color: 'white' }}>
          <small style={{ opacity: 0.8, textTransform: 'uppercase', fontWeight: 700, fontSize: '0.7rem' }}>Net Profit/Loss</small>
          <div style={{ fontSize: '1.75rem', fontWeight: 800, marginTop: '0.5rem' }}>₹{stats.net.toLocaleString()}</div>
        </div>
      </div>

      {/* MOBILE TAB SWITCHER */}
      <div className="mobile-only" style={{ display: 'flex', background: 'var(--bg-secondary)', borderRadius: 'var(--radius-md)', padding: '0.3rem', border: '1px solid var(--border)', marginBottom: '1rem' }}>
        <button onClick={() => setActiveMobileTab('income')} style={{ flex: 1, padding: '0.75rem', borderRadius: 'var(--radius-md)', border: 'none', background: activeMobileTab === 'income' ? 'var(--success)' : 'transparent', color: activeMobileTab === 'income' ? 'white' : 'var(--text-muted)', fontWeight: 700 }}>Income</button>
        <button onClick={() => setActiveMobileTab('expense')} style={{ flex: 1, padding: '0.75rem', borderRadius: 'var(--radius-md)', border: 'none', background: activeMobileTab === 'expense' ? 'var(--danger)' : 'transparent', color: activeMobileTab === 'expense' ? 'white' : 'var(--text-muted)', fontWeight: 700 }}>Expenses</button>
      </div>

      <div className="financials-main-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: '2rem' }}>
        
        {/* INCOMES SECTION */}
        <div style={{ display: (activeMobileTab === 'income' || window.innerWidth > 768) ? 'block' : 'none' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h2 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--success)', fontSize: '1.25rem' }}><ArrowUpRight size={24} /> Incomes</h2>
            <button className="mobile-only btn btn-outline" style={{ height: '36px', padding: '0 1rem', fontSize: '0.8rem' }} onClick={() => setShowIncomeForm(!showIncomeForm)}>
              {showIncomeForm ? 'Close Form' : '+ Add New'}
            </button>
          </div>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            <div className={`card ${!showIncomeForm ? 'desktop-only' : ''}`} style={{ padding: '1.25rem' }}>
              <form onSubmit={handleIncomeSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.8rem' }}>
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
              <div className="table-container" style={{ maxHeight: '600px', overflowY: 'auto' }}>
                <table className="table" style={{ margin: 0, width: '100%', minWidth: '500px' }}>
                  <thead style={{ position: 'sticky', top: 0, background: 'var(--bg-secondary)', zIndex: 1 }}>
                    <tr><th>Date</th><th>Details</th><th>Amount</th><th style={{ textAlign: 'center' }}>Action</th></tr>
                  </thead>
                  <tbody>
                    <tr style={{ background: 'rgba(16, 185, 129, 0.05)', fontWeight: 'bold' }}>
                      <td colSpan="2" style={{ color: 'var(--text-muted)', fontSize: '0.8rem', textTransform: 'uppercase' }}>Total Income</td>
                      <td style={{ color: 'var(--success)', fontSize: '1.1rem' }}>₹{stats.totalInc.toLocaleString()}</td>
                      <td></td>
                    </tr>
                    {incomes.map(i => {
                      const isAutoGenerated = i.booking_id && (i.notes?.includes('Auto-added') || i.notes?.includes('Settled') || i.notes?.includes('Refund'));
                      return (
                      <tr key={i.id}>
                        <td style={{ whiteSpace: 'nowrap', fontSize: '0.85rem' }}>{i.date}</td>
                        <td>
                          <div style={{ fontWeight: '700', fontSize: '0.9rem' }}>{i.source}</div>
                          {i.bookings?.reference_number && <small style={{ color: 'var(--primary)', fontWeight: '800' }}>REF: {i.bookings.reference_number}</small>}
                        </td>
                        <td style={{ color: 'var(--success)', fontWeight: '800' }}>+₹{i.amount.toLocaleString()}</td>
                        <td style={{ textAlign: 'center' }}>
                          {!isAutoGenerated && (
                            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center' }}>
                              <button className="btn btn-outline" style={{ padding: '0.3rem', color: 'var(--primary)' }} onClick={() => loadIncomeForEdit(i)}><Edit2 size={14}/></button>
                              <button className="btn btn-outline" style={{ padding: '0.3rem', color: 'var(--danger)' }} onClick={() => deleteRecord('incomes', i.id)}><Trash2 size={14}/></button>
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
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h2 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--danger)', fontSize: '1.25rem' }}><ArrowDownRight size={24} /> Expenses</h2>
            <button className="mobile-only btn btn-outline" style={{ height: '36px', padding: '0 1rem', fontSize: '0.8rem' }} onClick={() => setShowExpenseForm(!showExpenseForm)}>
              {showExpenseForm ? 'Close Form' : '+ Add New'}
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            <div className={`card ${!showExpenseForm ? 'desktop-only' : ''}`} style={{ padding: '1.25rem' }}>
              <form onSubmit={handleExpenseSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.8rem' }}>
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
              <div className="table-container" style={{ maxHeight: '600px', overflowY: 'auto' }}>
                <table className="table" style={{ margin: 0, width: '100%', minWidth: '500px' }}>
                  <thead style={{ position: 'sticky', top: 0, background: 'var(--bg-secondary)', zIndex: 1 }}>
                    <tr><th>Date</th><th>Details</th><th>Amount</th><th style={{ textAlign: 'center' }}>Action</th></tr>
                  </thead>
                  <tbody>
                    <tr style={{ background: 'rgba(239, 68, 68, 0.05)', fontWeight: 'bold' }}>
                      <td colSpan="2" style={{ color: 'var(--text-muted)', fontSize: '0.8rem', textTransform: 'uppercase' }}>Total Expenses</td>
                      <td style={{ color: 'var(--danger)', fontSize: '1.1rem' }}>₹{stats.totalExp.toLocaleString()}</td>
                      <td></td>
                    </tr>
                    {expenses.map(e => (
                      <tr key={e.id}>
                        <td style={{ whiteSpace: 'nowrap', fontSize: '0.85rem' }}>{e.date}</td>
                        <td>
                          <div style={{ fontWeight: '700', fontSize: '0.9rem' }}>{e.category}</div>
                          <small style={{ color: 'var(--text-muted)' }}>{e.vendor_name || 'General'}</small>
                        </td>
                        <td style={{ color: 'var(--danger)', fontWeight: '800' }}>-₹{e.amount.toLocaleString()}</td>
                        <td style={{ textAlign: 'center' }}>
                          <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center' }}>
                            <button className="btn btn-outline" style={{ padding: '0.3rem', color: 'var(--primary)' }} onClick={() => loadExpenseForEdit(e)}><Edit2 size={14}/></button>
                            <button className="btn btn-outline" style={{ padding: '0.3rem', color: 'var(--danger)' }} onClick={() => deleteRecord('expenses', e.id)}><Trash2 size={14}/></button>
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
