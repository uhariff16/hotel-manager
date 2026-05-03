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
    <div style={{ display: 'flex', flexDirection: 'column', gap: '3rem' }}>
      {/* INCOMES SECTION */}
      <div>
        <h2 style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', color: 'var(--success)', marginBottom: '1.5rem', fontSize: '1.75rem' }}>
          <ArrowUpRight size={28} /> Income Management
        </h2>
        
        <div className="financials-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '2rem' }}>
          {/* Income Form */}
          <div className="card" style={{ height: 'fit-content', position: 'sticky', top: '2rem' }}>
            <h3 style={{ marginBottom: '1.25rem', fontSize: '1.1rem' }}>{editingIncomeId ? 'Edit Income' : 'Add New Entry'}</h3>
            <form onSubmit={handleIncomeSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
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
              <div className="form-group">
                <label className="form-label">Booking Reference (Optional)</label>
                <input type="text" className="form-input" placeholder="e.g. BK-260425-9469" value={newIncome.reference_number || ''} onChange={e => setNewIncome({...newIncome, reference_number: e.target.value})} />
              </div>
              <button type="submit" className="btn btn-primary" style={{ width: '100%', marginTop: '0.5rem', padding: '0.8rem' }}>
                {editingIncomeId ? 'Update Income' : 'Save Income'}
              </button>
              {editingIncomeId && (
                <button type="button" className="btn btn-outline" style={{ width: '100%' }} onClick={() => {
                  setEditingIncomeId(null);
                  setNewIncome({ date: new Date().toISOString().split('T')[0], source: 'Room Rent', amount: 0, payment_mode: 'UPI', notes: '', reference_number: '' });
                }}>
                  Cancel Edit
                </button>
              )}
            </form>
          </div>

          {/* Income Table */}
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <div className="table-container" style={{ maxHeight: '600px', overflowY: 'auto' }}>
              <table className="table" style={{ margin: 0 }}>
                <thead style={{ position: 'sticky', top: 0, background: 'var(--bg-secondary)', zIndex: 1 }}>
                  <tr><th>Date</th><th>Details</th><th>Amount</th><th style={{ textAlign: 'center' }}>Action</th></tr>
                </thead>
                <tbody>
                  {incomes.map(i => {
                    const isAutoGenerated = i.booking_id && (i.notes?.includes('Auto-added') || i.notes?.includes('Settled') || i.notes?.includes('Refund'));
                    return (
                    <tr key={i.id}>
                      <td style={{ whiteSpace: 'nowrap' }}>{i.date}</td>
                      <td>
                        <div style={{ fontWeight: '700' }}>{i.source}</div>
                        {i.bookings?.reference_number && (
                          <div style={{ fontSize: '0.75rem', color: 'var(--primary)', fontWeight: '800', marginTop: '2px' }}>
                            REF: {i.bookings.reference_number}
                          </div>
                        )}
                        <small style={{ color: 'var(--text-muted)' }}>{i.payment_mode}</small>
                      </td>
                      <td style={{ color: 'var(--success)', fontWeight: '800' }}>+₹{i.amount.toLocaleString()}</td>
                      <td>
                        <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center' }}>
                          {isAutoGenerated ? (
                            <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: '700' }}>Auto</span>
                          ) : (
                            <>
                              <button className="btn btn-outline" style={{ padding: '0.3rem', color: 'var(--primary)' }} onClick={() => loadIncomeForEdit(i)} title="Edit"><Edit2 size={14}/></button>
                              <button className="btn btn-outline" style={{ padding: '0.3rem', color: 'var(--danger)' }} onClick={() => deleteRecord('incomes', i.id)} title="Delete"><Trash2 size={14}/></button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  )})}
                  {incomes.length === 0 && <tr><td colSpan="4" style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>No income records found.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      {/* EXPENSES SECTION */}
      <div>
        <h2 style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', color: 'var(--danger)', marginBottom: '1.5rem', fontSize: '1.75rem' }}>
          <ArrowDownRight size={28} /> Expense Management
        </h2>

        <div className="financials-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '2rem' }}>
          {/* Expense Form */}
          <div className="card" style={{ height: 'fit-content', position: 'sticky', top: '2rem' }}>
            <h3 style={{ marginBottom: '1.25rem', fontSize: '1.1rem' }}>{editingExpenseId ? 'Edit Expense' : 'Add New Entry'}</h3>
            <form onSubmit={handleExpenseSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
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
              <div className="form-group"><label className="form-label">Vendor</label><input type="text" className="form-input" placeholder="Vendor/Payee name" value={newExpense.vendor_name} onChange={e => setNewExpense({...newExpense, vendor_name: e.target.value})} /></div>
              <div className="form-group"><label className="form-label">Amount (₹)</label><input type="number" required className="form-input" value={newExpense.amount} onChange={e => setNewExpense({...newExpense, amount: e.target.value})} /></div>
              <div className="form-group">
                <label className="form-label">Payment Mode</label>
                <select className="form-select" value={newExpense.payment_mode} onChange={e => setNewExpense({...newExpense, payment_mode: e.target.value})}>
                  <option>Cash</option><option>UPI</option><option>Card</option><option>Bank Transfer</option>
                </select>
              </div>
              <button type="submit" className="btn btn-primary" style={{ width: '100%', marginTop: '0.5rem', padding: '0.8rem', background: 'var(--danger)', borderColor: 'var(--danger)' }}>
                {editingExpenseId ? 'Update Expense' : 'Save Expense'}
              </button>
              {editingExpenseId && (
                <button type="button" className="btn btn-outline" style={{ width: '100%' }} onClick={() => {
                  setEditingExpenseId(null);
                  setNewExpense({ date: new Date().toISOString().split('T')[0], category: 'Maintenance', amount: 0, vendor_name: '', payment_mode: 'Cash', notes: '' });
                }}>
                  Cancel Edit
                </button>
              )}
            </form>
          </div>

          {/* Expense Table */}
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <div className="table-container" style={{ maxHeight: '600px', overflowY: 'auto' }}>
              <table className="table" style={{ margin: 0 }}>
                <thead style={{ position: 'sticky', top: 0, background: 'var(--bg-secondary)', zIndex: 1 }}>
                  <tr><th>Date</th><th>Details</th><th>Amount</th><th style={{ textAlign: 'center' }}>Action</th></tr>
                </thead>
                <tbody>
                  {expenses.map(e => (
                    <tr key={e.id}>
                      <td style={{ whiteSpace: 'nowrap' }}>{e.date}</td>
                      <td>
                        <div style={{ fontWeight: '700' }}>{e.category}</div>
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{e.vendor_name || 'General'} • {e.payment_mode}</div>
                      </td>
                      <td style={{ color: 'var(--danger)', fontWeight: '800' }}>-₹{e.amount.toLocaleString()}</td>
                      <td>
                        <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center' }}>
                          <button className="btn btn-outline" style={{ padding: '0.3rem', color: 'var(--primary)' }} onClick={() => loadExpenseForEdit(e)} title="Edit"><Edit2 size={14}/></button>
                          <button className="btn btn-outline" style={{ padding: '0.3rem', color: 'var(--danger)' }} onClick={() => deleteRecord('expenses', e.id)} title="Delete"><Trash2 size={14}/></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {expenses.length === 0 && <tr><td colSpan="4" style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>No expense records found.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
