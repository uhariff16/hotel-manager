import React, { useState, useEffect } from 'react';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { Plus, Trash2, ArrowUpRight, ArrowDownRight } from 'lucide-react';

export default function Financials() {
  const [incomes, setIncomes] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [loading, setLoading] = useState(true);

  const [newIncome, setNewIncome] = useState({ date: new Date().toISOString().split('T')[0], source: 'Room Rent', amount: 0, payment_mode: 'UPI', notes: '' });
  const [newExpense, setNewExpense] = useState({ date: new Date().toISOString().split('T')[0], category: 'Maintenance', amount: 0, vendor_name: '', payment_mode: 'Cash', notes: '' });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    if (!isSupabaseConfigured()) { setLoading(false); return; }
    try {
      const [inc, exp] = await Promise.all([
        supabase.from('incomes').select('*, bookings(reference_number)').order('date', { ascending: false }),
        supabase.from('expenses').select('*').order('date', { ascending: false })
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
      const payload = { ...newIncome };
      if (payload.source === 'Other') payload.source = payload.custom_source || 'Other';
      delete payload.custom_source;
      const { data, error } = await supabase.from('incomes').insert([payload]).select();
      if (error) throw error;
      setIncomes([data[0], ...incomes]);
      setNewIncome({ ...newIncome, amount: 0, notes: '', custom_source: '' });
    } catch(err) { alert(err.message); }
  };

  const handleExpenseSubmit = async (e) => {
    e.preventDefault();
    try {
      const payload = { ...newExpense };
      if (payload.category === 'Other') payload.category = payload.custom_category || 'Other';
      delete payload.custom_category;
      const { data, error } = await supabase.from('expenses').insert([payload]).select();
      if (error) throw error;
      setExpenses([data[0], ...expenses]);
      setNewExpense({ ...newExpense, amount: 0, vendor_name: '', notes: '', custom_category: '' });
    } catch(err) { alert(err.message); }
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
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
      {/* INCOMES */}
      <div className="card">
        <h2 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--success)', marginBottom: '1.5rem' }}>
          <ArrowUpRight /> Income
        </h2>
        <form onSubmit={handleIncomeSubmit} style={{ background: 'var(--bg-color)', padding: '1rem', borderRadius: 'var(--radius-md)', marginBottom: '1.5rem' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
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
          </div>
          <button type="submit" className="btn btn-primary" style={{ width: '100%', marginTop: '1rem' }}>Add Income</button>
        </form>

        <div className="table-container">
          <table className="table">
            <thead><tr><th>Date</th><th>Details</th><th>Amount</th><th>Act</th></tr></thead>
            <tbody>
              {incomes.map(i => (
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
                  <td><button className="btn btn-outline" style={{ padding: '0.2rem 0.5rem' }} onClick={() => deleteRecord('incomes', i.id)}><Trash2 size={16}/></button></td>
                </tr>
              ))}
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
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
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
          <button type="submit" className="btn btn-primary" style={{ width: '100%', marginTop: '1rem', background: 'var(--danger)', borderColor: 'var(--danger)' }}>Add Expense</button>
        </form>

        <div className="table-container">
          <table className="table">
            <thead><tr><th>Date</th><th>Details</th><th>Amount</th><th>Act</th></tr></thead>
            <tbody>
              {expenses.map(e => (
                <tr key={e.id}>
                  <td>{e.date}</td>
                  <td><strong>{e.category}</strong><br/><small>{e.vendor_name}</small></td>
                  <td style={{ color: 'var(--danger)', fontWeight: 'bold' }}>-₹{e.amount}</td>
                  <td><button className="btn btn-outline" style={{ padding: '0.2rem 0.5rem' }} onClick={() => deleteRecord('expenses', e.id)}><Trash2 size={16}/></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
