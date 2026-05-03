import React, { useState, useEffect } from 'react';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { Plus, Trash2, ArrowUpRight, ArrowDownRight, Edit2 } from 'lucide-react';
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
    <div className="grid-2" style={{ gap: '2rem' }}>
      {/* INCOMES */}
      <div className="card">
        <h2 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--success)', marginBottom: '1.5rem' }}>
          <ArrowUpRight /> Income
        </h2>
        <form onSubmit={handleIncomeSubmit} style={{ background: 'var(--bg-color)', padding: '1rem', borderRadius: 'var(--radius-md)', marginBottom: '1.5rem' }}>
          <div className="grid-2" style={{ gap: '1rem' }}>
            <div className="form-group"><label className="form-label">Date</label><input type="date" required className="form-input" value={newIncome.date} onChange={e => setNewIncome({...newIncome, date: e.target.value})} /></div>
            <div className="form-group">
              <label className="form-label">Source</label>
              <select className="form-select" value={newIncome.source} onChange={e => setNewIncome({...newIncome, source: e.target.value})}>
                <option>Room Rent</option><option>Food</option><option>Activities</option><option>Other</option>
              </select>
              {newIncome.source === 'Other' && (
                 <input type="text" className="form-input" style={{ marginTop: '0.5rem' }} placeholder="Specify custom income" value={newIncome.custom_source || ''} onChange={e => setNewIncome({...newIncome, custom_source: e.target.value})} required/>
              )}
            </div>
            <div className="form-group"><label className="form-label">Amount (₹)</label><input type="number" required className="form-input" value={newIncome.amount} onChange={e => setNewIncome({...newIncome, amount: e.target.value})} /></div>
            <div className="form-group">
              <label className="form-label">Payment Mode</label>
              <select className="form-select" value={newIncome.payment_mode} onChange={e => setNewIncome({...newIncome, payment_mode: e.target.value})}>
                <option>Cash</option><option>UPI</option><option>Card</option><option>Bank Transfer</option>
              </select>
            </div>
            <div className="form-group" style={{ gridColumn: 'span 2' }}>
              <label className="form-label">Booking Reference (Optional)</label>
              <input type="text" className="form-input" placeholder="e.g. BK-260425-9469" value={newIncome.reference_number || ''} onChange={e => setNewIncome({...newIncome, reference_number: e.target.value})} />
            </div>
          </div>
          <button type="submit" className="btn btn-primary" style={{ width: '100%', marginTop: '1rem' }}>
            {editingIncomeId ? 'Update Income' : 'Add Income'}
          </button>
          {editingIncomeId && (
            <button type="button" className="btn btn-outline" style={{ width: '100%', marginTop: '0.5rem' }} onClick={() => {
              setEditingIncomeId(null);
              setNewIncome({ date: new Date().toISOString().split('T')[0], source: 'Room Rent', amount: 0, payment_mode: 'UPI', notes: '', reference_number: '' });
            }}>
              Cancel Edit
            </button>
          )}
        </form>

        <div className="mobile-only" style={{ display: 'none' }}>
          {incomes.map(i => {
            const isAutoGenerated = i.booking_id && (i.notes?.includes('Auto-added') || i.notes?.includes('Settled') || i.notes?.includes('Refund'));
            return (
              <div key={i.id} className="card" style={{ marginBottom: '0.75rem', padding: '1rem', background: 'var(--bg-color)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{i.date}</div>
                    <strong style={{ fontSize: '1.1rem' }}>{i.source}</strong>
                    {i.bookings?.reference_number && (
                      <div style={{ fontSize: '0.8rem', color: 'var(--primary)', fontWeight: 'bold' }}>Ref: {i.bookings.reference_number}</div>
                    )}
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ color: 'var(--success)', fontWeight: 'bold', fontSize: '1.1rem' }}>+₹{i.amount}</div>
                    <small style={{ color: 'var(--text-muted)' }}>{i.payment_mode}</small>
                  </div>
                </div>
                {!isAutoGenerated && (
                  <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem', borderTop: '1px solid var(--border)', paddingTop: '0.5rem' }}>
                    <button className="btn btn-outline" style={{ flex: 1, padding: '0.4rem' }} onClick={() => loadIncomeForEdit(i)}><Edit2 size={16}/></button>
                    <button className="btn btn-outline" style={{ flex: 1, padding: '0.4rem' }} onClick={() => deleteRecord('incomes', i.id)}><Trash2 size={16}/></button>
                  </div>
                )}
              </div>
            );
          })}
          {incomes.length === 0 && <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>No income records.</div>}
        </div>

        <div className="table-container desktop-only">
          <table className="table">
            <thead><tr><th>Date</th><th>Details</th><th>Amount</th><th>Act</th></tr></thead>
            <tbody>
              {incomes.map(i => {
                const isAutoGenerated = i.booking_id && (i.notes?.includes('Auto-added') || i.notes?.includes('Settled') || i.notes?.includes('Refund'));
                return (
                <tr key={i.id}>
                  <td>{i.date}</td>
                  <td>
                    <strong>{i.source}</strong>
                    {i.bookings?.reference_number && (
                      <div style={{ fontSize: '0.8rem', color: 'var(--primary)', fontWeight: 'bold' }}>
                        Ref: {i.bookings.reference_number}
                      </div>
                    )}
                    <br/><small>{i.payment_mode}</small>
                  </td>
                  <td style={{ color: 'var(--success)', fontWeight: 'bold' }}>+₹{i.amount}</td>
                  <td>
                    {isAutoGenerated ? (
                      <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }} title="Manage from Bookings page">Auto-generated</span>
                    ) : (
                      <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <button className="btn btn-outline" style={{ padding: '0.2rem 0.5rem', color: 'var(--primary)' }} onClick={() => loadIncomeForEdit(i)}><Edit2 size={16}/></button>
                        <button className="btn btn-outline" style={{ padding: '0.2rem 0.5rem' }} onClick={() => deleteRecord('incomes', i.id)}><Trash2 size={16}/></button>
                      </div>
                    )}
                  </td>
                </tr>
              )})}
            </tbody>
          </table>
        </div>
      </div>

      {/* EXPENSES */}
      <div className="card">
        <h2 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--danger)', marginBottom: '1.5rem' }}>
          <ArrowDownRight /> Expenses
        </h2>
        <form onSubmit={handleExpenseSubmit} style={{ background: 'var(--bg-color)', padding: '1rem', borderRadius: 'var(--radius-md)', marginBottom: '1.5rem' }}>
          <div className="grid-2" style={{ gap: '1rem' }}>
            <div className="form-group"><label className="form-label">Date</label><input type="date" required className="form-input" value={newExpense.date} onChange={e => setNewExpense({...newExpense, date: e.target.value})} /></div>
            <div className="form-group">
              <label className="form-label">Category</label>
              <select className="form-select" value={newExpense.category} onChange={e => setNewExpense({...newExpense, category: e.target.value})}>
                <option>Maintenance</option><option>Salary</option><option>Utilities</option><option>Supplies</option><option>Marketing</option><option>Other</option>
              </select>
              {newExpense.category === 'Other' && (
                 <input type="text" className="form-input" style={{ marginTop: '0.5rem' }} placeholder="Specify custom expense" value={newExpense.custom_category || ''} onChange={e => setNewExpense({...newExpense, custom_category: e.target.value})} required/>
              )}
            </div>
            <div className="form-group"><label className="form-label">Vendor</label><input type="text" className="form-input" value={newExpense.vendor_name} onChange={e => setNewExpense({...newExpense, vendor_name: e.target.value})} /></div>
            <div className="form-group"><label className="form-label">Amount (₹)</label><input type="number" required className="form-input" value={newExpense.amount} onChange={e => setNewExpense({...newExpense, amount: e.target.value})} /></div>
            <div className="form-group" style={{ gridColumn: 'span 2' }}>
              <label className="form-label">Payment Mode</label>
              <select className="form-select" value={newExpense.payment_mode} onChange={e => setNewExpense({...newExpense, payment_mode: e.target.value})}>
                <option>Cash</option><option>UPI</option><option>Card</option><option>Bank Transfer</option>
              </select>
            </div>
          </div>
          <button type="submit" className="btn btn-primary" style={{ width: '100%', marginTop: '1rem', background: 'var(--danger)', borderColor: 'var(--danger)' }}>
            {editingExpenseId ? 'Update Expense' : 'Add Expense'}
          </button>
          {editingExpenseId && (
            <button type="button" className="btn btn-outline" style={{ width: '100%', marginTop: '0.5rem' }} onClick={() => {
              setEditingExpenseId(null);
              setNewExpense({ date: new Date().toISOString().split('T')[0], category: 'Maintenance', amount: 0, vendor_name: '', payment_mode: 'Cash', notes: '' });
            }}>
              Cancel Edit
            </button>
          )}
        </form>

        <div className="mobile-only" style={{ display: 'none' }}>
          {expenses.map(e => (
            <div key={e.id} className="card" style={{ marginBottom: '0.75rem', padding: '1rem', background: 'var(--bg-color)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{e.date}</div>
                  <strong style={{ fontSize: '1.1rem' }}>{e.category}</strong>
                  <div style={{ fontSize: '0.85rem' }}>{e.vendor_name}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ color: 'var(--danger)', fontWeight: 'bold', fontSize: '1.1rem' }}>-₹{e.amount}</div>
                  <small style={{ color: 'var(--text-muted)' }}>{e.payment_mode}</small>
                </div>
              </div>
              <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem', borderTop: '1px solid var(--border)', paddingTop: '0.5rem' }}>
                <button className="btn btn-outline" style={{ flex: 1, padding: '0.4rem' }} onClick={() => loadExpenseForEdit(e)}><Edit2 size={16}/></button>
                <button className="btn btn-outline" style={{ flex: 1, padding: '0.4rem' }} onClick={() => deleteRecord('expenses', e.id)}><Trash2 size={16}/></button>
              </div>
            </div>
          ))}
          {expenses.length === 0 && <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>No expense records.</div>}
        </div>

        <div className="table-container desktop-only">
          <table className="table">
            <thead><tr><th>Date</th><th>Details</th><th>Amount</th><th>Act</th></tr></thead>
            <tbody>
              {expenses.map(e => (
                <tr key={e.id}>
                  <td>{e.date}</td>
                  <td><strong>{e.category}</strong><br/><small>{e.vendor_name}</small></td>
                  <td style={{ color: 'var(--danger)', fontWeight: 'bold' }}>-₹{e.amount}</td>
                  <td style={{ display: 'flex', gap: '0.5rem' }}>
                    <button className="btn btn-outline" style={{ padding: '0.2rem 0.5rem', color: 'var(--primary)' }} onClick={() => loadExpenseForEdit(e)}><Edit2 size={16}/></button>
                    <button className="btn btn-outline" style={{ padding: '0.2rem 0.5rem' }} onClick={() => deleteRecord('expenses', e.id)}><Trash2 size={16}/></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
