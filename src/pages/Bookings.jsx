import React, { useState, useEffect } from 'react';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { Plus, Trash2, CheckCircle2, AlertTriangle, X, Search, Filter, Phone, Calendar, Home, CreditCard } from 'lucide-react';
import { startOfMonth, format } from 'date-fns';
import { useSettingsStore } from '../lib/store';
import { useNavigate } from 'react-router-dom';

export default function Bookings() {
  const navigate = useNavigate();
  const { activeResortId, profile } = useSettingsStore();
  const [bookings, setBookings] = useState([]);
  const [cottages, setCottages] = useState([]);
  const [rooms, setRooms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [selectedBookings, setSelectedBookings] = useState([]);
  const [sortConfig, setSortConfig] = useState({ key: 'created_at', direction: 'descending' });
  const [searchTerm, setSearchTerm] = useState('');

  const [settlingBooking, setSettlingBooking] = useState(null);
  const [settlementData, setSettlementData] = useState({ discount: 0, allSettled: false });

  useEffect(() => {
    fetchData();
  }, [activeResortId]);

  const fetchData = async () => {
    if (!activeResortId || !isSupabaseConfigured()) {
      setLoading(false);
      return;
    }
    
    try {
      const [bks, cts, rms] = await Promise.all([
        supabase.from('bookings').select('*').eq('resort_id', activeResortId).order('created_at', { ascending: false }),
        supabase.from('cottages').select('*').eq('resort_id', activeResortId),
        supabase.from('rooms').select('*').eq('resort_id', activeResortId)
      ]);
      setBookings(bks.data || []);
      setCottages(cts.data || []);
      setRooms(rms.data || []);
    } catch (err) {
      console.error(err);
      setError('Error fetching data.');
    } finally {
      setLoading(false);
    }
  };

  const getStatusCount = (status) => {
    if (status === 'All') return bookings.length;
    return bookings.filter(b => b.status === status).length;
  };

  const statusOptions = [
    { label: 'All', color: 'var(--text-main)', bg: 'var(--bg-secondary)' },
    { label: 'Pending', color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.1)' },
    { label: 'Confirmed', color: '#3b82f6', bg: 'rgba(59, 130, 246, 0.1)' },
    { label: 'Checked-in', color: '#6366f1', bg: 'rgba(99, 102, 241, 0.1)' },
    { label: 'Completed', color: '#10b981', bg: 'rgba(16, 185, 129, 0.1)' },
    { label: 'Cancelled', color: '#ef4444', bg: 'rgba(239, 68, 68, 0.1)' }
  ];

  const [activeTab, setActiveTab] = useState('All');

  const handleCheckIn = async (b) => {
    try {
      const { error } = await supabase.from('bookings').update({ status: 'Checked-in' }).eq('id', b.id);
      if (error) throw error;
      setBookings(prev => prev.map(x => x.id === b.id ? { ...x, status: 'Checked-in' } : x));
    } catch (err) {
      alert("Error during check-in: " + err.message);
    }
  };

  const settleBooking = (b) => {
    setSettlingBooking(b);
    setSettlementData({ discount: 0, allSettled: false });
  };

  const handleFinalSettlement = async () => {
    if (!settlementData.allSettled) {
      alert("Please confirm that all payments are settled.");
      return;
    }

    try {
      const finalBalance = settlingBooking.balance_amount - settlementData.discount;
      
      // Update booking status
      const { error: bookingErr } = await supabase
        .from('bookings')
        .update({ status: 'Completed', balance_amount: 0 })
        .eq('id', settlingBooking.id);
      if (bookingErr) throw bookingErr;

      // Add income record if there was a balance
      if (finalBalance > 0) {
        await supabase.from('incomes').insert([{
          resort_id: activeResortId,
          booking_id: settlingBooking.id,
          amount: finalBalance,
          category: 'Stay Settlement',
          description: `Final settlement for ${settlingBooking.guest_name}`,
          date: new Date().toISOString()
        }]);
      }

      setBookings(prev => prev.map(x => x.id === settlingBooking.id ? { ...x, status: 'Completed', balance_amount: 0 } : x));
      setSettlingBooking(null);
      
      // Trigger notification
      fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-notification`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`
        },
        body: JSON.stringify({
          bookingId: settlingBooking.id,
          type: 'payment_receipt'
        })
      }).catch(err => console.error("Notification Trigger Error:", err));

    } catch (err) {
      alert("Error during settlement: " + err.message);
    }
  };

  const deleteBooking = async (id) => {
    if (!window.confirm("Are you sure you want to cancel this booking?")) return;
    try {
      const { error } = await supabase.from('bookings').update({ status: 'Cancelled' }).eq('id', id);
      if (error) throw error;
      setBookings(prev => prev.map(x => x.id === id ? { ...x, status: 'Cancelled' } : x));
    } catch (err) {
      alert("Error cancelling booking: " + err.message);
    }
  };

  const bulkDeleteSelected = async () => {
    const isAdmin = profile?.role === 'tenant_admin' || profile?.role === 'super_admin';
    if (!isAdmin) return alert("Only admins can perform bulk deletion.");
    if (selectedBookings.length === 0) return;
    if (!window.confirm(`⚠️ DANGER: Are you sure you want to PERMANENTLY DELETE ${selectedBookings.length} selected bookings and all their associated payments?`)) return;

    setLoading(true);
    try {
      await supabase.from('incomes').delete().in('booking_id', selectedBookings);
      const { error } = await supabase.from('bookings').delete().in('id', selectedBookings);
      if (error) throw error;
      setBookings(prev => prev.filter(b => !selectedBookings.includes(b.id)));
      setSelectedBookings([]);
      alert(`Successfully deleted ${selectedBookings.length} bookings.`);
    } catch (err) {
      alert("Error during bulk delete: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  const sendReminder = async (b) => {
    try {
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-notification`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`
        },
        body: JSON.stringify({ bookingId: b.id, type: 'reminder' })
      });
      if (!res.ok) throw new Error("Failed to trigger edge function");
      alert("Reminder sent successfully!");
    } catch (err) {
      alert("Failed to send reminder: " + err.message);
    }
  };

  const toggleSelectAll = (e) => {
    if (e.target.checked) {
      const allIds = sortedAndFilteredBookings.map(b => b.id);
      setSelectedBookings(allIds);
    } else {
      setSelectedBookings([]);
    }
  };

  const toggleSelectBooking = (id) => {
    setSelectedBookings(prev => 
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const sortedAndFilteredBookings = React.useMemo(() => {
    let items = bookings.filter(b => {
      const matchesStatus = activeTab === 'All' || b.status === activeTab;
      const matchesSearch = b.guest_name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                            (b.reference_number || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
                            (b.phone_number || '').includes(searchTerm);
      return matchesStatus && matchesSearch;
    });

    if (sortConfig !== null) {
      items.sort((a, b) => {
        let valA = a[sortConfig.key];
        let valB = b[sortConfig.key];
        if (typeof valA === 'string' && typeof valB === 'string') {
          valA = valA.toLowerCase(); valB = valB.toLowerCase();
        }
        if (valA < valB) return sortConfig.direction === 'ascending' ? -1 : 1;
        if (valA > valB) return sortConfig.direction === 'ascending' ? 1 : -1;
        return 0;
      });
    }
    return items;
  }, [bookings, activeTab, sortConfig, searchTerm]);

  const requestSort = (key) => {
    let direction = 'ascending';
    if (sortConfig.key === key && sortConfig.direction === 'ascending') {
      direction = 'descending';
    }
    setSortConfig({ key, direction });
  };

  if (loading) return <div style={{ padding: '2rem' }}>Loading Bookings...</div>;

  return (
    <div className="container" style={{ padding: '2rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <h1 style={{ margin: 0, fontSize: '2rem' }}>Bookings Management</h1>
        <button className="btn btn-primary" onClick={() => navigate('/bookings/new')} style={{ padding: '0.75rem 1.5rem', fontSize: '1rem' }}>
          <Plus size={20} /> New Booking
        </button>
      </div>

      {error && <div style={{ color: 'var(--danger)', marginBottom: '1rem' }}>{error}</div>}

      <div className="card" style={{ padding: '1.5rem', overflow: 'visible' }}>
        {/* Modern Filter Header */}
        <div style={{ marginBottom: '2rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: '1.5rem', flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: '300px' }}>
              <div className="search-bar" style={{ position: 'relative' }}>
                <Search size={20} style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                <input 
                  type="text" 
                  className="form-input" 
                  placeholder="Search bookings..." 
                  value={searchTerm} 
                  onChange={e => setSearchTerm(e.target.value)}
                  style={{ padding: '0.8rem 1rem 0.8rem 3rem', fontSize: '1rem', background: 'var(--bg-secondary)', border: 'none', borderRadius: 'var(--radius-md)' }}
                />
              </div>
            </div>
            
            {selectedBookings.length > 0 && (profile?.role === 'tenant_admin' || profile?.role === 'super_admin') && (
              <button 
                className="btn btn-primary" 
                onClick={bulkDeleteSelected}
                style={{ background: 'var(--danger)', borderColor: 'var(--danger)', padding: '0.6rem 1.2rem' }}
              >
                <Trash2 size={16} /> Delete {selectedBookings.length} Selected
              </button>
            )}
          </div>

          {/* Status Tabs */}
          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1.5rem', overflowX: 'auto', paddingBottom: '0.5rem', borderBottom: '1px solid var(--border)' }}>
            {statusOptions.map(opt => {
              const isActive = activeTab === opt.label;
              const count = getStatusCount(opt.label);
              return (
                <button
                  key={opt.label}
                  onClick={() => setActiveTab(opt.label)}
                  style={{
                    padding: '0.6rem 1.2rem',
                    borderRadius: 'var(--radius-md) var(--radius-md) 0 0',
                    fontSize: '0.9rem',
                    fontWeight: 600,
                    border: 'none',
                    background: isActive ? opt.bg : 'transparent',
                    color: isActive ? opt.color : 'var(--text-muted)',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.6rem',
                    transition: 'all 0.2s',
                    borderBottom: isActive ? `3px solid ${opt.color}` : '3px solid transparent',
                    whiteSpace: 'nowrap'
                  }}
                >
                  {opt.label}
                  <span style={{ 
                    fontSize: '0.75rem', 
                    background: isActive ? 'white' : 'var(--bg-secondary)', 
                    padding: '0.1rem 0.5rem', 
                    borderRadius: '10px',
                    opacity: count === 0 && !isActive ? 0.5 : 1
                  }}>
                    {count}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Table View */}
        <div className="table-container" style={{ maxHeight: '800px', overflowY: 'auto' }}>
          <table className="table">
            <thead style={{ position: 'sticky', top: 0, background: 'var(--bg-color)', zIndex: 1 }}>
              <tr>
                <th style={{ width: '40px' }}>
                  <input 
                    type="checkbox" 
                    onChange={toggleSelectAll} 
                    checked={sortedAndFilteredBookings.length > 0 && selectedBookings.length === sortedAndFilteredBookings.length}
                  />
                </th>
                <th onClick={() => requestSort('guest_name')} style={{ cursor: 'pointer', userSelect: 'none' }}>Guest {sortConfig.key === 'guest_name' && (sortConfig.direction === 'ascending' ? '▲' : '▼')}</th>
                <th onClick={() => requestSort('check_in_date')} style={{ cursor: 'pointer', userSelect: 'none' }}>Dates {sortConfig.key === 'check_in_date' && (sortConfig.direction === 'ascending' ? '▲' : '▼')}</th>
                <th onClick={() => requestSort('booking_type')} style={{ cursor: 'pointer', userSelect: 'none' }}>Unit {sortConfig.key === 'booking_type' && (sortConfig.direction === 'ascending' ? '▲' : '▼')}</th>
                <th onClick={() => requestSort('status')} style={{ cursor: 'pointer', userSelect: 'none' }}>Status {sortConfig.key === 'status' && (sortConfig.direction === 'ascending' ? '▲' : '▼')}</th>
                <th onClick={() => requestSort('balance_amount')} style={{ cursor: 'pointer', userSelect: 'none' }}>Balance {sortConfig.key === 'balance_amount' && (sortConfig.direction === 'ascending' ? '▲' : '▼')}</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {sortedAndFilteredBookings.length === 0 ? (
                <tr><td colSpan="7" style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>No bookings found.</td></tr>
              ) : sortedAndFilteredBookings.map(b => {
                const cname = cottages.find(x => x.id === b.cottage_id)?.name || 'Unknown';
                let rname = b.booking_type === 'Entire Property' ? 'Entire Property' : (b.room_ids || []).map(id => rooms.find(r => r.id === id)?.name).filter(Boolean).join(', ');

                return (
                  <tr key={b.id} style={{ opacity: b.status === 'Cancelled' ? 0.5 : 1 }}>
                    <td>
                      <input 
                        type="checkbox" 
                        checked={selectedBookings.includes(b.id)}
                        onChange={() => toggleSelectBooking(b.id)}
                      />
                    </td>
                    <td>
                      <small style={{ color: 'var(--primary)', fontWeight: 'bold' }}>{b.reference_number}</small><br/>
                      <strong>{b.guest_name}</strong><br/>
                      <small>{b.phone_number}</small>
                    </td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem' }}>
                        <Calendar size={14} /> {new Date(b.check_in_date).toLocaleDateString()}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                        <X size={12} /> {b.night_count} nights
                      </div>
                    </td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}><Home size={14} /> {cname}</div>
                      <small style={{ color: 'var(--text-muted)' }}>{rname}</small>
                    </td>
                    <td>
                      <span className={`badge ${
                        b.status === 'Cancelled' ? 'badge-danger' : 
                        b.status === 'Pending' ? 'badge-warning' : 
                        b.status === 'Checked-in' ? 'badge-indigo' :
                        b.status === 'Completed' ? 'badge-success' :
                        'badge-info'
                      }`}>
                        {b.status}
                      </span>
                    </td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                        <CreditCard size={14} color={b.balance_amount > 0 ? 'var(--warning)' : 'var(--success)'} />
                        <strong style={{ color: b.balance_amount > 0 ? 'var(--warning)' : 'var(--success)' }}>₹{b.balance_amount}</strong>
                      </div>
                    </td>
                    <td style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                      {b.status === 'Confirmed' && (
                        <>
                          <button className="btn btn-primary" style={{ padding: '0.2rem', fontSize: '0.75rem' }} onClick={() => handleCheckIn(b)}>Check-in</button>
                          <button className="btn btn-outline" style={{ padding: '0.2rem', fontSize: '0.75rem', color: '#0ea5e9', borderColor: '#0ea5e9' }} onClick={() => sendReminder(b)}>Send Reminder</button>
                        </>
                      )}
                      {b.status === 'Checked-in' && (
                        <button className="btn btn-primary" style={{ padding: '0.2rem', fontSize: '0.75rem', background: '#6366f1' }} onClick={() => settleBooking(b)}>Check-out</button>
                      )}
                      <button className="btn btn-outline" style={{ padding: '0.2rem', fontSize: '0.75rem', color: 'var(--text-muted)' }} onClick={() => navigate(`/bookings/edit/${b.id}`)}>Edit Details</button>
                      {(b.status === 'Pending' || b.status === 'Confirmed') && (
                        <button className="btn btn-outline" style={{ padding: '0.2rem', fontSize: '0.75rem', color: 'var(--danger)' }} onClick={() => deleteBooking(b.id)}>Cancel</button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Settlement Modal */}
      {settlingBooking && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
              <h2 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <CheckCircle2 color="var(--success)" /> Final Settlement
              </h2>
              <button className="btn-outline" style={{ padding: '0.5rem', borderRadius: '50%' }} onClick={() => setSettlingBooking(null)}>
                <X size={20} />
              </button>
            </div>
            <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
              <p style={{ color: 'var(--text-muted)', marginBottom: '0.5rem' }}>Balance due from <strong>{settlingBooking.guest_name}</strong></p>
              <div className="balance-due-large">₹{settlingBooking.balance_amount - settlementData.discount}</div>
            </div>
            <div className="form-group">
              <label className="form-label">Discount Amount (₹)</label>
              <input type="number" className="form-input" value={settlementData.discount} onChange={e => setSettlementData({ ...settlementData, discount: Number(e.target.value) })} />
            </div>
            <div className="settlement-footer">
              <label className="checkbox-group">
                <input type="checkbox" checked={settlementData.allSettled} onChange={e => setSettlementData({ ...settlementData, allSettled: e.target.checked })} />
                <span>Confirm payment settlement</span>
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginTop: '1.5rem' }}>
                <button className="btn btn-outline" onClick={() => setSettlingBooking(null)}>Cancel</button>
                <button className="btn btn-primary" onClick={handleFinalSettlement}>Confirm & Close</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
