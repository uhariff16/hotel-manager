import React, { useState, useEffect } from 'react';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { Plus, Trash2, CheckCircle2, AlertTriangle, X, Search, Filter, Phone, Calendar, Home, CreditCard, Edit2, MoreVertical, Send, RotateCcw } from 'lucide-react';
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
  const [sortConfig, setSortConfig] = useState({ key: 'check_in_date', direction: 'ascending' });
  const [searchTerm, setSearchTerm] = useState('');

  const [settlingBooking, setSettlingBooking] = useState(null);
  const [settlementData, setSettlementData] = useState({ discount: 0, allSettled: false });
  
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);

  useEffect(() => {
    fetchData();
    const handleResize = () => setIsMobile(window.innerWidth <= 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
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

  const handleRevertToCheckIn = async (b) => {
    if (!window.confirm(`Are you sure you want to revert ${b.guest_name} to 'Checked-in'? This will DELETE the settlement record from Financials.`)) return;
    
    try {
      // 1. Calculate restored balance (Total - Advance)
      // Note: We might need to fetch all incomes for this booking to be super accurate, 
      // but usually balance = total - advance_paid (which stores all previous payments).
      const restoredBalance = b.total_amount - b.advance_paid;

      // 2. Delete the settlement income
      await supabase.from('incomes').delete().eq('booking_id', b.id).ilike('notes', '%Settlement%');

      // 3. Update booking status and balance
      const { error } = await supabase.from('bookings').update({ 
          status: 'Checked-in',
          balance_amount: restoredBalance
      }).eq('id', b.id);
      
      if (error) throw error;

      setBookings(prev => prev.map(x => x.id === b.id ? { ...x, status: 'Checked-in', balance_amount: restoredBalance } : x));
      alert("Booking reverted and settlement record removed.");
    } catch (err) {
      alert("Error reverting status: " + err.message);
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
      
      const { error: bookingErr } = await supabase
        .from('bookings')
        .update({ status: 'Completed', balance_amount: 0 })
        .eq('id', settlingBooking.id);
      if (bookingErr) throw bookingErr;

      if (finalBalance > 0) {
        await supabase.from('incomes').insert([{
          resort_id: activeResortId,
          tenant_id: profile?.tenant_id,
          booking_id: settlingBooking.id,
          amount: finalBalance,
          source: 'Room Rent',
          notes: `Settlement: ${settlingBooking.guest_name} (${settlingBooking.reference_number})`,
          date: new Date().toISOString().split('T')[0],
          payment_mode: 'UPI'
        }]);
      }

      setBookings(prev => prev.map(x => x.id === settlingBooking.id ? { ...x, status: 'Completed', balance_amount: 0 } : x));
      setSettlingBooking(null);
      
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

    if (sortConfig.key === 'check_in_date' && sortConfig.direction === 'ascending') {
      const priority = { 'Checked-in': 1, 'Confirmed': 2, 'Pending': 3, 'Completed': 4, 'Cancelled': 5 };
      items.sort((a, b) => {
        const pA = priority[a.status] || 99;
        const pB = priority[b.status] || 99;
        if (pA !== pB) return pA - pB;
        return new Date(a.check_in_date) - new Date(b.check_in_date);
      });
    } else if (sortConfig !== null) {
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

  const bookingStats = React.useMemo(() => {
    const visible = sortedAndFilteredBookings;
    const totalValue = visible.reduce((sum, b) => sum + Number(b.total_amount || 0), 0);
    const totalBalance = visible.reduce((sum, b) => sum + Number(b.balance_amount || 0), 0);
    const totalPaid = totalValue - totalBalance;
    return { totalValue, totalPaid, totalBalance };
  }, [sortedAndFilteredBookings]);

  const requestSort = (key) => {
    let direction = 'ascending';
    if (sortConfig.key === key && sortConfig.direction === 'ascending') {
      direction = 'descending';
    }
    setSortConfig({ key, direction });
  };

  if (loading) return <div style={{ padding: '2rem' }}>Loading Bookings...</div>;

  return (
    <div className="container" style={{ padding: isMobile ? '1rem' : '2rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: isMobile ? '1.5rem' : '2rem' }}>
        <h1 style={{ margin: 0, fontSize: isMobile ? '1.5rem' : '2.25rem', fontWeight: 800 }}>Bookings</h1>
        <button className="btn btn-primary" onClick={() => navigate('/bookings/new')} style={{ padding: isMobile ? '0.6rem 1rem' : '0.8rem 1.6rem', borderRadius: 'var(--radius-md)', fontWeight: 700 }}>
          <Plus size={20} /> <span className="desktop-only">New Booking</span>
        </button>
      </div>

      {error && <div className="card" style={{ background: 'rgba(239, 68, 68, 0.1)', color: 'var(--danger)', padding: '1rem', border: '1px solid var(--danger)', marginBottom: '1rem' }}>{error}</div>}

      {/* Modern Filter Header */}
      <div className="card" style={{ padding: isMobile ? '1rem' : '1.5rem', marginBottom: '1.5rem', overflow: 'visible' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: '250px' }}>
            <div className="search-bar" style={{ position: 'relative' }}>
              <Search size={18} style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
              <input 
                type="text" 
                className="form-input" 
                placeholder="Search guest, ref #, phone..." 
                value={searchTerm} 
                onChange={e => setSearchTerm(e.target.value)}
                style={{ padding: '0.7rem 1rem 0.7rem 2.75rem', fontSize: '0.95rem', background: 'var(--bg-color)', border: '1px solid var(--border)' }}
              />
            </div>
          </div>
          
          {selectedBookings.length > 0 && (profile?.role === 'tenant_admin' || profile?.role === 'super_admin') && (
            <button className="btn btn-primary" onClick={bulkDeleteSelected} style={{ background: 'var(--danger)', borderColor: 'var(--danger)', padding: '0.6rem 1.2rem' }}>
              <Trash2 size={16} /> Delete {selectedBookings.length}
            </button>
          )}

          <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
            <div style={{ background: 'rgba(16, 185, 129, 0.08)', padding: '0.5rem 1rem', borderRadius: '12px', border: '1px solid rgba(16, 185, 129, 0.2)' }}>
              <small style={{ display: 'block', color: 'var(--success)', fontSize: '0.65rem', fontWeight: 800, textTransform: 'uppercase' }}>Paid</small>
              <span style={{ fontWeight: 800, fontSize: '1rem' }}>₹{bookingStats.totalPaid.toLocaleString()}</span>
            </div>
            <div style={{ background: 'rgba(245, 158, 11, 0.08)', padding: '0.5rem 1rem', borderRadius: '12px', border: '1px solid rgba(245, 158, 11, 0.2)' }}>
              <small style={{ display: 'block', color: 'var(--warning)', fontSize: '0.65rem', fontWeight: 800, textTransform: 'uppercase' }}>Balance</small>
              <span style={{ fontWeight: 800, fontSize: '1rem' }}>₹{bookingStats.totalBalance.toLocaleString()}</span>
            </div>
            <div style={{ background: 'var(--bg-secondary)', padding: '0.5rem 1rem', borderRadius: '12px', border: '1px solid var(--border)' }}>
              <small style={{ display: 'block', color: 'var(--text-muted)', fontSize: '0.65rem', fontWeight: 800, textTransform: 'uppercase' }}>Total Value</small>
              <span style={{ fontWeight: 800, fontSize: '1rem' }}>₹{bookingStats.totalValue.toLocaleString()}</span>
            </div>
          </div>
        </div>

        {/* Status Tabs */}
        <div style={{ display: 'flex', gap: '0.4rem', marginTop: '1.25rem', overflowX: 'auto', paddingBottom: '0.25rem', scrollbarWidth: 'none' }}>
          {statusOptions.map(opt => {
            const isActive = activeTab === opt.label;
            const count = getStatusCount(opt.label);
            return (
              <button
                key={opt.label}
                onClick={() => setActiveTab(opt.label)}
                style={{
                  padding: '0.5rem 1rem',
                  borderRadius: 'var(--radius-md)',
                  fontSize: '0.85rem',
                  fontWeight: 700,
                  border: 'none',
                  background: isActive ? opt.color : 'var(--bg-color)',
                  color: isActive ? 'white' : 'var(--text-muted)',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  transition: 'all 0.2s',
                  whiteSpace: 'nowrap',
                  border: isActive ? `1px solid ${opt.color}` : '1px solid var(--border)'
                }}
              >
                {opt.label}
                <span style={{ 
                  fontSize: '0.7rem', 
                  background: isActive ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.05)', 
                  padding: '0.1rem 0.4rem', 
                  borderRadius: '10px'
                }}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* MOBILE CARD LIST VIEW */}
      {isMobile ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {sortedAndFilteredBookings.length === 0 ? (
            <div className="card" style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>No bookings found.</div>
          ) : sortedAndFilteredBookings.map((b) => {
            const cname = cottages.find(x => x.id === b.cottage_id)?.name || 'Unknown';
            const rname = b.booking_type === 'Entire Property' ? 'Entire Property' : (b.room_ids || []).map(id => rooms.find(r => r.id === id)?.name).filter(Boolean).join(', ');
            const opt = statusOptions.find(o => o.label === b.status) || statusOptions[1];
            
            return (
              <div key={b.id} className="card" style={{ padding: 0, overflow: 'hidden', borderLeft: `6px solid ${opt.color}`, opacity: b.status === 'Cancelled' ? 0.7 : 1 }}>
                <div style={{ padding: '1rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem' }}>
                    <div>
                      <small style={{ color: 'var(--primary)', fontWeight: 800, fontSize: '0.75rem' }}>{b.reference_number}</small>
                      <h3 style={{ margin: '0.1rem 0 0.25rem 0', fontSize: '1.1rem' }}>{b.guest_name}</h3>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginTop: '0.25rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                            <Phone size={14} /> {b.phone_number}
                        </div>
                      </div>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', alignItems: 'flex-end' }}>
                      <span style={{ padding: '0.3rem 0.75rem', borderRadius: '20px', fontSize: '0.7rem', fontWeight: 700, background: opt.bg, color: opt.color, border: `1px solid ${opt.color}44`, width: 'fit-content' }}>
                        {b.status}
                      </span>
                      <span style={{ fontSize: '0.65rem', padding: '2px 8px', borderRadius: '4px', background: 'rgba(99, 102, 241, 0.1)', color: '#6366f1', fontWeight: 800, border: '1px solid rgba(99, 102, 241, 0.2)' }}>
                        {b.booking_source || 'Direct'}
                      </span>
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', padding: '0.75rem 0', borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border)', marginBottom: '0.75rem' }}>
                    <div>
                      <small style={{ color: 'var(--text-muted)', textTransform: 'uppercase', fontSize: '0.65rem', fontWeight: 700 }}>Check-in</small>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.9rem', fontWeight: 600 }}>
                        <Calendar size={14} className="text-primary" /> {formatDateShort(b.check_in_date)}
                      </div>
                    </div>
                    <div>
                      <small style={{ color: 'var(--text-muted)', textTransform: 'uppercase', fontSize: '0.65rem', fontWeight: 700 }}>Stay</small>
                      <div style={{ fontSize: '0.9rem', fontWeight: 600 }}>{b.night_count} Nights</div>
                    </div>
                    <div style={{ gridColumn: 'span 2' }}>
                      <small style={{ color: 'var(--text-muted)', textTransform: 'uppercase', fontSize: '0.65rem', fontWeight: 700 }}>Unit / Room</small>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.9rem', fontWeight: 600 }}>
                        <Home size={14} /> {cname} - <span style={{ color: 'var(--primary)' }}>{rname}</span>
                      </div>
                    </div>
                  </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--bg-color)', padding: '0.75rem', borderRadius: '12px', marginTop: '0.5rem' }}>
                      <div style={{ textAlign: 'center' }}>
                        <small style={{ fontSize: '0.6rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Paid</small>
                        <div style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--success)' }}>₹{b.total_amount - b.balance_amount}</div>
                      </div>
                      <div style={{ textAlign: 'center' }}>
                        <small style={{ fontSize: '0.6rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Balance</small>
                        <div style={{ fontSize: '0.95rem', fontWeight: 900, color: b.balance_amount > 0 ? 'var(--warning)' : 'var(--success)' }}>₹{b.balance_amount}</div>
                      </div>
                      <div style={{ textAlign: 'center' }}>
                        <small style={{ fontSize: '0.6rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Total</small>
                        <div style={{ fontSize: '0.85rem', fontWeight: 700 }}>₹{b.total_amount}</div>
                      </div>
                    </div>
                    
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <button onClick={() => navigate(`/bookings/edit/${b.id}`)} className="btn-icon" style={{ background: 'var(--bg-color)', border: '1px solid var(--border)' }}><Edit2 size={18} /></button>
                      {b.status === 'Confirmed' && (
                        <button onClick={() => handleCheckIn(b)} className="btn btn-primary" style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem' }}>Check-in</button>
                      )}
                      {b.status === 'Checked-in' && (
                        <button onClick={() => settleBooking(b)} className="btn btn-primary" style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem', background: '#6366f1' }}>Checkout</button>
                      )}
                      {b.status === 'Completed' && (
                        <button onClick={() => handleRevertToCheckIn(b)} className="btn-icon" title="Revert to Check-in" style={{ background: 'rgba(99, 102, 241, 0.1)', color: '#6366f1' }}><RotateCcw size={18} /></button>
                      )}
                    </div>
                  </div>
                </div>
              );
          })}
        </div>
      ) : (
        /* DESKTOP TABLE VIEW */
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div className="table-container" style={{ maxHeight: '800px', overflowY: 'auto' }}>
            <table className="table" style={{ margin: 0 }}>
              <thead style={{ position: 'sticky', top: 0, background: 'var(--bg-secondary)', zSubstitute: 1, borderBottom: '2px solid var(--border)' }}>
                <tr>
                  <th style={{ width: '50px' }}>
                    <input 
                      type="checkbox" 
                      onChange={toggleSelectAll} 
                      checked={sortedAndFilteredBookings.length > 0 && selectedBookings.length === sortedAndFilteredBookings.length}
                    />
                  </th>
                  <th onClick={() => requestSort('guest_name')} style={{ cursor: 'pointer' }}>Guest</th>
                  <th onClick={() => requestSort('check_in_date')} style={{ cursor: 'pointer' }}>Stay Dates</th>
                  <th onClick={() => requestSort('cottage_id')} style={{ cursor: 'pointer' }}>Unit / Room</th>
                  <th onClick={() => requestSort('booking_source')} style={{ cursor: 'pointer' }}>Source</th>
                  <th onClick={() => requestSort('advance_paid')} style={{ cursor: 'pointer', textAlign: 'right' }}>Paid</th>
                  <th onClick={() => requestSort('balance_amount')} style={{ cursor: 'pointer', textAlign: 'right' }}>Balance</th>
                  <th onClick={() => requestSort('total_amount')} style={{ cursor: 'pointer', textAlign: 'right' }}>Total</th>
                  <th style={{ textAlign: 'center' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {sortedAndFilteredBookings.length === 0 ? (
                  <tr><td colSpan="7" style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>No bookings found.</td></tr>
                ) : sortedAndFilteredBookings.map((b) => {
                  const cname = cottages.find(x => x.id === b.cottage_id)?.name || 'Unknown';
                  const rname = b.booking_type === 'Entire Property' ? 'Entire Property' : (b.room_ids || []).map(id => rooms.find(r => r.id === id)?.name).filter(Boolean).join(', ');
                  const opt = statusOptions.find(o => o.label === b.status) || statusOptions[1];

                  return (
                    <tr key={b.id} className="table-row-hover" style={{ opacity: b.status === 'Cancelled' ? 0.6 : 1 }}>
                      <td>
                        <input type="checkbox" checked={selectedBookings.includes(b.id)} onChange={() => toggleSelectBooking(b.id)} />
                      </td>
                      <td>
                        <small style={{ color: 'var(--primary)', fontWeight: 800 }}>{b.reference_number}</small>
                        <div style={{ fontWeight: 700, fontSize: '1rem' }}>{b.guest_name}</div>
                        <small style={{ color: 'var(--text-muted)' }}><Phone size={12} style={{ verticalAlign: 'middle' }} /> {b.phone_number}</small>
                      </td>
                      <td>
                        <div style={{ fontWeight: 600 }}><Calendar size={14} /> {new Date(b.check_in_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</div>
                        <small style={{ color: 'var(--text-muted)' }}>{b.night_count} nights stay</small>
                      </td>
                      <td>
                        <div style={{ fontWeight: 600 }}><Home size={14} /> {cname}</div>
                        <small style={{ color: 'var(--primary)' }}>{rname}</small>
                      </td>
                      <td>
                        <span style={{ fontSize: '0.75rem', fontWeight: 800, padding: '0.3rem 0.6rem', borderRadius: '8px', background: 'rgba(99, 102, 241, 0.1)', color: '#6366f1' }}>{b.booking_source || 'Direct'}</span>
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--success)' }}>₹{(b.total_amount - b.balance_amount).toLocaleString()}</div>
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: '1.1rem', fontWeight: 800, color: b.balance_amount > 0 ? 'var(--warning)' : 'var(--success)' }}>₹{b.balance_amount.toLocaleString()}</div>
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: '1rem', fontWeight: 700 }}>₹{b.total_amount.toLocaleString()}</div>
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: '0.4rem', justifyContent: 'center' }}>
                          {b.status === 'Confirmed' && (
                            <button onClick={() => handleCheckIn(b)} className="btn btn-primary" style={{ padding: '0.4rem 0.75rem', fontSize: '0.75rem' }}>Check-in</button>
                          )}
                          {b.status === 'Checked-in' && (
                            <button onClick={() => settleBooking(b)} className="btn btn-primary" style={{ padding: '0.4rem 0.75rem', fontSize: '0.75rem', background: '#6366f1' }}>Checkout</button>
                          )}
                          {b.status === 'Completed' && (
                            <button onClick={() => handleRevertToCheckIn(b)} className="btn-icon" title="Revert to Check-in" style={{ color: '#6366f1' }}><RotateCcw size={16} /></button>
                          )}
                          <button onClick={() => navigate(`/bookings/edit/${b.id}`)} className="btn-icon"><Edit2 size={16} /></button>
                          {(b.status === 'Pending' || b.status === 'Confirmed') && (
                            <button onClick={() => deleteBooking(b.id)} className="btn-icon" style={{ color: 'var(--danger)' }}><Trash2 size={16} /></button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Settlement Modal */}
      {settlingBooking && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '400px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
              <h2 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '1.25rem' }}>
                <CheckCircle2 color="var(--success)" /> Final Settlement
              </h2>
              <button className="btn-icon" onClick={() => setSettlingBooking(null)}><X size={20} /></button>
            </div>
            <div style={{ textAlign: 'center', marginBottom: '1.5rem', padding: '1.5rem', background: 'var(--bg-color)', borderRadius: 'var(--radius-md)' }}>
              <p style={{ color: 'var(--text-muted)', marginBottom: '0.5rem', fontSize: '0.9rem' }}>Balance due from <strong>{settlingBooking.guest_name}</strong></p>
              <div style={{ fontSize: '2rem', fontWeight: 900, color: 'var(--text-main)' }}>₹{settlingBooking.balance_amount - settlementData.discount}</div>
            </div>
            <div className="form-group">
              <label className="form-label">Discount Amount (₹)</label>
              <input type="number" className="form-input" value={settlementData.discount} onChange={e => setSettlementData({ ...settlementData, discount: Number(e.target.value) })} />
            </div>
            <div style={{ marginTop: '1.5rem' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', cursor: 'pointer', fontSize: '0.9rem' }}>
                <input type="checkbox" checked={settlementData.allSettled} onChange={e => setSettlementData({ ...settlementData, allSettled: e.target.checked })} style={{ width: '18px', height: '18px' }} />
                <span>I confirm that all payments are received.</span>
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

function formatDateShort(dateStr) {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
}
