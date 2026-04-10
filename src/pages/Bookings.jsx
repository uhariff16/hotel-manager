import React, { useState, useEffect } from 'react';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { Plus, Trash2, CalendarCheck, CheckCircle2 } from 'lucide-react';
import { differenceInDays, eachDayOfInterval, isWeekend } from 'date-fns';

export default function Bookings() {
  const [bookings, setBookings] = useState([]);
  const [cottages, setCottages] = useState([]);
  const [rooms, setRooms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [bookingForm, setBookingForm] = useState({
    guest_name: '', phone_number: '', check_in_date: '', check_out_date: '', number_of_guests: 1,
    booking_type: 'Entire Cottage', cottage_id: '', room_ids: [],
    night_count: 0, price_type: 'Calculated', base_amount: 0, extra_guest_charges: 0, addons_cost: 0,
    total_amount: 0, advance_paid: 0, balance_amount: 0, booking_source: 'Direct', status: 'Confirmed', is_loading_edit: false,
    reference_number: ''
  });
  const [editingBookingId, setEditingBookingId] = useState(null);

  const loadBookingForEdit = (b) => {
    setEditingBookingId(b.id);
    setBookingForm({
      guest_name: b.guest_name,
      phone_number: b.phone_number,
      check_in_date: b.check_in_date.split('T')[0],
      check_out_date: b.check_out_date.split('T')[0],
      number_of_guests: b.number_of_guests || 1,
      booking_type: b.booking_type,
      cottage_id: b.cottage_id,
      room_ids: b.room_ids || (b.room_id ? [b.room_id] : []),
      night_count: b.night_count || 0,
      base_amount: b.base_amount || 0,
      extra_guest_charges: b.extra_guest_charges || 0,
      addons_cost: b.addons_cost || 0,
      total_amount: b.total_amount || 0,
      advance_paid: b.advance_paid || 0,
      balance_amount: b.balance_amount || 0,
      booking_source: b.booking_source || 'Direct',
      status: b.status,
      reference_number: b.reference_number || '',
      is_loading_edit: true
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const generateReference = () => {
    const datePart = new Date().toISOString().slice(2,10).replace(/-/g, '');
    const randomPart = Math.floor(1000 + Math.random() * 9000);
    return `BK-${datePart}-${randomPart}`;
  };

  useEffect(() => {
    if (!editingBookingId && !bookingForm.reference_number) {
      setBookingForm(prev => ({ ...prev, reference_number: generateReference() }));
    }
  }, [editingBookingId]);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    if (!isSupabaseConfigured()) {
      setError('Supabase is not configured.');
      setLoading(false);
      return;
    }
    
    try {
      const [bks, cts, rms] = await Promise.all([
        supabase.from('bookings').select('*').order('created_at', { ascending: false }),
        supabase.from('cottages').select('*'),
        supabase.from('rooms').select('*')
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

  // Helper: check for booking conflicts before allowing a booking
  const checkConflict = (checkIn, checkOut, type, cottageId, roomIds) => {
    const inDate = new Date(checkIn);
    const outDate = new Date(checkOut);
    
    for (let b of bookings) {
      if (b.status === 'Cancelled') continue;
      if (b.id === editingBookingId) continue; // Skip self when editing
      
      const bIn = new Date(b.check_in_date);
      const bOut = new Date(b.check_out_date);
      
      // Check date overlap
      if (inDate < bOut && outDate > bIn) {
        // If Entire Cottage requested, it conflicts if ANY booking exists for this cottage (entire or room)
        if (type === 'Entire Cottage' && b.cottage_id === cottageId) {
          return `Conflict: Cottage is already booked (partially or fully) between ${b.check_in_date} and ${b.check_out_date}`;
        }
        
        // If Room requested
        if (type === 'Room' && b.cottage_id === cottageId) {
          if (b.booking_type === 'Entire Cottage') {
            return `Conflict: Entire Cottage is booked between ${b.check_in_date} and ${b.check_out_date}`;
          }
          if (b.booking_type === 'Room') {
            const bRooms = b.room_ids || (b.room_id ? [b.room_id] : []);
            const conflictMatch = roomIds.some(id => bRooms.includes(id));
            if (conflictMatch) {
              return `Conflict: One or more selected rooms are already booked between ${b.check_in_date} and ${b.check_out_date}`;
            }
          }
        }
      }
    }
    return null; // No conflict
  };

  const calculateBasePrice = () => {
    if (bookingForm.is_loading_edit) {
      setBookingForm(prev => ({ ...prev, is_loading_edit: false }));
      return;
    }
    const { check_in_date, check_out_date, booking_type, cottage_id, room_ids } = bookingForm;
    if (!check_in_date || !check_out_date || !cottage_id) return;

    const start = new Date(check_in_date);
    const end = new Date(check_out_date);
    if (end <= start) return; // Invalid dates

    let itemPricingArray = [];
    if (booking_type === 'Entire Cottage') {
      const c = cottages.find(c => c.id === cottage_id);
      if (c) itemPricingArray.push(c);
    } else {
      if (!room_ids || room_ids.length === 0) return;
      itemPricingArray = room_ids.map(id => rooms.find(r => r.id === id)).filter(Boolean);
    }
    if (itemPricingArray.length === 0) return;

    const days = eachDayOfInterval({ start, end: new Date(end.getTime() - 24*60*60*1000) }); // Exclude checkout day from nights
    const nightCount = days.length;
    
    let base = 0;
    days.forEach(d => {
      let daily = 0;
      itemPricingArray.forEach(item => {
        if (isWeekend(d)) daily += Number(item.weekend_price);
        else daily += Number(item.weekday_price);
      });
      base += daily;
    });

    setBookingForm(prev => ({
      ...prev,
      night_count: nightCount,
      base_amount: base
    }));
  };

  useEffect(() => {
    calculateBasePrice();
  }, [bookingForm.check_in_date, bookingForm.check_out_date, bookingForm.booking_type, bookingForm.cottage_id, JSON.stringify(bookingForm.room_ids)]);

  useEffect(() => {
    const total = Number(bookingForm.base_amount) + Number(bookingForm.addons_cost || 0);
    const balance = total - Number(bookingForm.advance_paid || 0);
    setBookingForm(prev => ({
      ...prev,
      total_amount: total,
      balance_amount: balance
    }));
  }, [bookingForm.base_amount, bookingForm.addons_cost, bookingForm.advance_paid]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!bookingForm.cottage_id) return alert('Select a Cottage');
    if (bookingForm.booking_type === 'Room' && (!bookingForm.room_ids || bookingForm.room_ids.length === 0)) return alert('Select at least one Room');
    
    const conflict = checkConflict(bookingForm.check_in_date, bookingForm.check_out_date, bookingForm.booking_type, bookingForm.cottage_id, bookingForm.room_ids);
    if (conflict) return alert(conflict);

    try {
      const payload = { ...bookingForm };
      
      // Handle room fields for database compatibility
      if (payload.booking_type === 'Entire Cottage') {
        payload.room_id = null;
        payload.room_ids = [];
      } else {
        // For 'Room' type, set room_id to the first selected room for legacy support
        payload.room_id = payload.room_ids.length > 0 ? payload.room_ids[0] : null;
      }

      // Cleanup UI-only fields
      if (payload.booking_source === 'Other') {
        payload.booking_source = payload.custom_booking_source || 'Other';
      }
      delete payload.custom_booking_source;
      delete payload.is_loading_edit;
      delete payload.room_id_internal; // in case it was there

      if (editingBookingId) {
        const { data, error } = await supabase.from('bookings').update(payload).eq('id', editingBookingId).select();
        if (error) throw error;
        setBookings(bookings.map(b => b.id === editingBookingId ? data[0] : b));
        alert('Booking Updated Successfully!');
      } else {
        const { data, error } = await supabase.from('bookings').insert([payload]).select();
        if (error) throw error;
        setBookings([data[0], ...bookings]);
        if (payload.advance_paid > 0) {
          await supabase.from('incomes').insert([{
            date: new Date().toISOString().split('T')[0],
            source: `Advance Payment: ${payload.guest_name}`,
            booking_id: data[0].id,
            amount: payload.advance_paid,
            payment_mode: 'Cash',
            notes: 'Auto-added from New Booking'
          }]);
        }
        alert('Booking Confirmed Successfully!');
      }

      setEditingBookingId(null);
      setBookingForm({
        ...bookingForm, guest_name: '', phone_number: '', check_in_date: '', check_out_date: '',
        night_count: 0, base_amount: 0, extra_guest_charges: 0, addons_cost: 0, total_amount: 0, advance_paid: 0, balance_amount: 0, custom_booking_source: '', is_loading_edit: false,
        reference_number: generateReference()
      });
    } catch (e) {
      alert("Error saving booking: " + e.message);
    }
  };

  const settleBooking = async (b) => {
    const rawDiscount = window.prompt(`Settle balance of ₹${b.balance_amount}.\nEnter any DISCOUNT amount to apply (leave 0 for no discount):`, "0");
    if (rawDiscount === null) return; // Cancelled
    
    const discount = Number(rawDiscount) || 0;
    if (discount > b.balance_amount) return alert("Discount cannot be greater than the balance!");
    if (discount < 0) return alert("Discount cannot be negative!");
    
    const newTotal = Number(b.total_amount) - discount;
    const amountToCollect = Number(b.balance_amount) - discount;

    const confirmMsg = discount > 0 ? `Apply ₹${discount} discount and collect final ₹${amountToCollect}?` : `Collect balance of ₹${amountToCollect} and complete booking?`;
    if (!window.confirm(confirmMsg)) return;

    try {
      if (amountToCollect > 0) {
        await supabase.from('incomes').insert([{
          date: new Date().toISOString().split('T')[0],
          source: `Balance Payment: ${b.guest_name}`,
          booking_id: b.id,
          amount: amountToCollect,
          payment_mode: 'Cash',
          notes: 'Auto-settled from Bookings'
        }]);
      }
      await supabase.from('bookings').update({ status: 'Completed', total_amount: newTotal, balance_amount: 0, advance_paid: newTotal }).eq('id', b.id);
      setBookings(bookings.map(item => item.id === b.id ? { ...item, status: 'Completed', total_amount: newTotal, balance_amount: 0, advance_paid: newTotal } : item));
    } catch(err) {
      alert("Error settling booking: " + err.message);
    }
  };

  const deleteBooking = async (id) => {
    if (!window.confirm("Cancel this booking?")) return;
    await supabase.from('bookings').update({ status: 'Cancelled' }).eq('id', id);
    setBookings(bookings.map(b => b.id === id ? { ...b, status: 'Cancelled' } : b));
  };

  if (loading) return <div>Loading...</div>;

  const relevantRooms = rooms.filter(r => r.cottage_id === bookingForm.cottage_id);

  return (
    <div className="grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '2rem' }}>
      {/* Booking Form */}
      <div className="card">
        <h2 style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}><CalendarCheck size={24} /> New Booking</h2>
        {error && <div style={{ color: 'var(--danger)', marginBottom: '1rem' }}>{error}</div>}
        
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div className="grid-3" style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr 1fr', gap: '1rem' }}>
            <div className="form-group"><label className="form-label">Guest Name</label><input type="text" required className="form-input" value={bookingForm.guest_name} onChange={e => setBookingForm({...bookingForm, guest_name: e.target.value})} /></div>
            <div className="form-group"><label className="form-label">Phone</label><input type="text" required className="form-input" value={bookingForm.phone_number} onChange={e => setBookingForm({...bookingForm, phone_number: e.target.value})} /></div>
            <div className="form-group"><label className="form-label">Reference #</label><input type="text" required className="form-input" style={{ fontWeight: 'bold', color: 'var(--primary)' }} value={bookingForm.reference_number} onChange={e => setBookingForm({...bookingForm, reference_number: e.target.value})} /></div>
          </div>
          
          <div className="grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div className="form-group"><label className="form-label">Check-in</label><input type="date" required className="form-input" value={bookingForm.check_in_date} onChange={e => setBookingForm({...bookingForm, check_in_date: e.target.value})} /></div>
            <div className="form-group"><label className="form-label">Check-out</label><input type="date" required className="form-input" value={bookingForm.check_out_date} onChange={e => setBookingForm({...bookingForm, check_out_date: e.target.value})} /></div>
          </div>

          <div className="grid-3" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem' }}>
            <div className="form-group">
              <label className="form-label">Type</label>
              <select className="form-select" value={bookingForm.booking_type} onChange={e => setBookingForm({...bookingForm, booking_type: e.target.value, room_id: ''})}>
                <option value="Entire Cottage">Entire Cottage</option>
                <option value="Room">Room Only</option>
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Cottage</label>
              <select className="form-select" required value={bookingForm.cottage_id} onChange={e => setBookingForm({...bookingForm, cottage_id: e.target.value, room_id: ''})}>
                <option value="">Select...</option>
                {cottages.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Rooms</label>
              {bookingForm.booking_type === 'Entire Cottage' ? (
                <div style={{ color: 'var(--text-muted)', padding: '0.5rem' }}>N/A (Entire Cottage Selected)</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', background: 'rgba(0,0,0,0.02)', padding: '0.5rem', borderRadius: '4px', border: '1px solid var(--border)', maxHeight: '150px', overflowY: 'auto' }}>
                  {relevantRooms.length === 0 ? <small>No rooms available</small> : relevantRooms.map(r => (
                    <label key={r.id} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.9rem', cursor: 'pointer' }}>
                      <input type="checkbox" checked={bookingForm.room_ids.includes(r.id)} onChange={e => {
                        const newIds = e.target.checked ? [...bookingForm.room_ids, r.id] : bookingForm.room_ids.filter(id => id !== r.id);
                        setBookingForm({...bookingForm, room_ids: newIds});
                      }} />
                      {r.name}
                    </label>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div style={{ background: 'rgba(0,0,0,0.02)', padding: '1rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)' }}>
            <h4 style={{ marginBottom: '1rem', color: 'var(--text-main)', borderBottom: '1px solid var(--border)', paddingBottom: '0.5rem' }}>Billing Auto-Calc</h4>
            <div className="grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                <span className="form-label">Nights:</span> <strong>{bookingForm.night_count}</strong>
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label">Base Amount (₹)</label>
                <input type="number" className="form-input" value={bookingForm.base_amount} onChange={e => setBookingForm({...bookingForm, base_amount: Number(e.target.value)})} />
              </div>
            </div>
            <div className="grid-3" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem', marginTop: '1rem' }}>
              <div className="form-group"><label className="form-label">Add-ons (Food)</label><input type="number" className="form-input" value={bookingForm.addons_cost} onChange={e => setBookingForm({...bookingForm, addons_cost: Number(e.target.value)})} /></div>
              <div className="form-group"><label className="form-label">Advance Paid</label><input type="number" className="form-input" value={bookingForm.advance_paid} onChange={e => setBookingForm({...bookingForm, advance_paid: Number(e.target.value)})} /></div>
              <div className="form-group">
                <label className="form-label">Referred By</label>
                <select className="form-select" value={bookingForm.booking_source} onChange={e => setBookingForm({...bookingForm, booking_source: e.target.value})}>
                  <option value="Direct">Direct</option><option value="Airbnb">Airbnb</option><option value="Booking.com">Booking.com</option><option value="Agent">Agent</option><option value="Other">Other...</option>
                </select>
                {bookingForm.booking_source === 'Other' && (
                  <input type="text" className="form-input" style={{ marginTop: '0.5rem' }} placeholder="Specify source" value={bookingForm.custom_booking_source || ''} onChange={e => setBookingForm({...bookingForm, custom_booking_source: e.target.value})} required/>
                )}
              </div>
            </div>
            <div style={{ marginTop: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span className="form-label mb-0">Total: <strong style={{ fontSize: '1.25rem', color: 'var(--primary)' }}>₹{bookingForm.total_amount}</strong></span>
              <span className="form-label mb-0">Balance: <strong style={{ fontSize: '1.25rem', color: 'var(--warning)' }}>₹{bookingForm.balance_amount}</strong></span>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
            <button type="submit" className="btn btn-primary" style={{ flex: 1, fontSize: '1.1rem', padding: '1rem' }}>
              <CheckCircle2 /> {editingBookingId ? 'Update Booking' : 'Confirm Booking'}
            </button>
            {editingBookingId && (
              <button type="button" className="btn btn-outline" style={{ fontSize: '1.1rem', padding: '1rem' }} onClick={() => {
                setEditingBookingId(null);
                setBookingForm({ ...bookingForm, guest_name: '', phone_number: '', check_in_date: '', check_out_date: '', night_count: 0, base_amount: 0, addons_cost: 0, advance_paid: 0, total_amount: 0, balance_amount: 0, is_loading_edit: false });
              }}>Cancel Edit</button>
            )}
          </div>
        </form>
      </div>

      {/* Bookings List */}
      <div className="card">
        <h2 style={{ marginBottom: '1.5rem' }}>Recent Bookings</h2>
        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <th>Guest</th>
                <th>Dates</th>
                <th>Unit</th>
                <th>Status</th>
                <th>Balance</th>
                <th>Act</th>
              </tr>
            </thead>
            <tbody>
              {bookings.map(b => {
                const cname = cottages.find(x => x.id === b.cottage_id)?.name || 'Unknown';
                let rname = '';
                if (b.booking_type === 'Entire Cottage') { rname = 'Entire Cottage'; }
                else {
                  const arr = b.room_ids || (b.room_id ? [b.room_id] : []);
                  rname = arr.map(id => rooms.find(r => r.id === id)?.name).filter(Boolean).join(', ');
                }

                return (
                  <tr key={b.id} style={{ opacity: b.status === 'Cancelled' ? 0.5 : 1 }}>
                    <td>
                      <small style={{ color: 'var(--primary)', fontWeight: 'bold' }}>{b.reference_number || 'No Ref'}</small><br/>
                      <strong>{b.guest_name}</strong><br/>
                      <small>{b.phone_number}</small><br/>
                      <small style={{ color: 'var(--text-muted)' }}>Source: {b.booking_source}</small>
                    </td>
                    <td>{new Date(b.check_in_date).toLocaleDateString()} <br/>{new Date(b.check_out_date).toLocaleDateString()}</td>
                    <td>{cname} <br/><small className="badge badge-success">{rname}</small></td>
                    <td>
                      <span className={`badge ${b.status === 'Cancelled' ? 'badge-danger' : 'badge-success'}`}>{b.status}</span>
                    </td>
                    <td>
                      <strong style={{ color: b.balance_amount > 0 ? 'var(--warning)' : 'var(--success)' }}>Bal: ₹{b.balance_amount}</strong><br/>
                      Total: ₹{b.total_amount}<br/>
                      <span style={{ color: 'var(--success)', fontWeight: 'bold', fontSize: '0.8rem' }}>Advance: ₹{b.advance_paid || 0}</span>
                    </td>
                    <td style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                      {(b.status === 'Confirmed' || b.status === 'Checked-in') && b.balance_amount > 0 && (
                        <button className="btn btn-primary" style={{ padding: '0.2rem', fontSize: '0.75rem' }} onClick={() => settleBooking(b)}>Settle Bal</button>
                      )}
                      {b.status !== 'Completed' && b.status !== 'Cancelled' && (
                        <button className="btn btn-outline" style={{ padding: '0.2rem', fontSize: '0.75rem', color: 'var(--primary)' }} onClick={() => loadBookingForEdit(b)}>Edit</button>
                      )}
                      {b.status !== 'Cancelled' && b.status !== 'Completed' && (
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
    </div>
  );
}
