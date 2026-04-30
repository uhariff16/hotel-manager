import React, { useState, useEffect } from 'react';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { Plus, Trash2, CalendarCheck, CheckCircle2, AlertTriangle, X } from 'lucide-react';
import { differenceInDays, eachDayOfInterval, isWeekend, startOfMonth, format } from 'date-fns';
import { useSettingsStore } from '../lib/store';
import { useLocation, useNavigate } from 'react-router-dom';

export default function Bookings() {
  const location = useLocation();
  const navigate = useNavigate();
  const { session, activeResortId } = useSettingsStore();
  const [bookings, setBookings] = useState([]);
  const [cottages, setCottages] = useState([]);
  const [rooms, setRooms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [statusFilter, setStatusFilter] = useState({
    Confirmed: true,
    Pending: true,
    'Checked-in': true,
    Completed: true,
    Cancelled: true
  });
  const [sortConfig, setSortConfig] = useState({ key: 'created_at', direction: 'descending' });
  const today = new Date().toISOString().split('T')[0];



  const [bookingForm, setBookingForm] = useState({
    guest_name: '', phone_number: '', check_in_date: '', check_out_date: '', adults_count: 1, kids_count: 0,
    booking_type: 'Entire Property', cottage_id: '', room_ids: [],
    night_count: 0, price_type: 'Calculated', base_amount: 0, extra_guest_charges: 0, addons_cost: 0,
    total_amount: 0, advance_paid: 0, balance_amount: 0, booking_source: 'Direct', status: 'Confirmed', is_loading_edit: false,
    reference_number: '', vehicle_number: '', id_proof_type: 'Aadhar', id_proof_number: ''
  });
  const [editingBookingId, setEditingBookingId] = useState(null);
  const [settlingBooking, setSettlingBooking] = useState(null);
  const [settlementData, setSettlementData] = useState({ discount: 0, allSettled: false });

  const loadBookingForEdit = (b) => {
    setEditingBookingId(b.id);
    setBookingForm({
      guest_name: b.guest_name,
      phone_number: b.phone_number,
      check_in_date: b.check_in_date.split('T')[0],
      check_out_date: b.check_out_date.split('T')[0],
      adults_count: b.adults_count || b.number_of_guests || 1,
      kids_count: b.kids_count || 0,
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
      vehicle_number: b.vehicle_number || '',
      id_proof_type: b.id_proof_type || 'Aadhar',
      id_proof_number: b.id_proof_number || '',
      price_type: b.price_type || 'Calculated',
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
    if (location.state?.prefill && !editingBookingId) {
      setBookingForm(prev => ({
        ...prev,
        ...location.state.prefill
      }));
      // Prevent loop on re-renders while allowing normal operation
      navigate(location.pathname, { replace: true });
    }
    if (location.state?.editBookingId && bookings.length > 0) {
      const b = bookings.find(x => x.id === location.state.editBookingId);
      if (b) {
        loadBookingForEdit(b);
        // Clear state so it doesn't re-trigger
        navigate(location.pathname, { replace: true });
      }
    }
  }, [location.state, editingBookingId, bookings, navigate]);

  useEffect(() => {
    fetchData();
  }, [activeResortId]);

  const fetchData = async () => {
    if (!isSupabaseConfigured()) {
      setError('Supabase is not configured.');
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

  const checkConflict = (checkIn, checkOut, type, cottageId, roomIds, ignoreId = null) => {
    const inStr = checkIn.split('T')[0];
    const outStr = checkOut.split('T')[0];
    let softConflicts = [];
    
    for (let b of bookings) {
      if (b.status === 'Cancelled') continue;
      if (b.id === (ignoreId || editingBookingId)) continue;
      
      const bInStr = b.check_in_date.split('T')[0];
      const bOutStr = b.check_out_date.split('T')[0];
      
      if (inStr < bOutStr && outStr > bInStr) {
        const isSoft = b.status === 'Pending';
        
        if (type === 'Entire Property' && b.cottage_id === cottageId) {
          if (!isSoft) return { type: 'hard', message: `Conflict: Property is already BOOKED between ${bInStr} and ${bOutStr}` };
          softConflicts.push(b.id);
        }
        
        if (type === 'Room' && b.cottage_id === cottageId) {
          if (b.booking_type === 'Entire Property') {
            if (!isSoft) return { type: 'hard', message: `Conflict: Entire Property is BOOKED between ${bInStr} and ${bOutStr}` };
            softConflicts.push(b.id);
          }
          if (b.booking_type === 'Room') {
            const bRooms = b.room_ids || (b.room_id ? [b.room_id] : []);
            const conflictMatch = roomIds.some(id => bRooms.includes(id));
            if (conflictMatch) {
              if (!isSoft) return { type: 'hard', message: `Conflict: Selected rooms are BOOKED between ${bInStr} and ${bOutStr}` };
              softConflicts.push(b.id);
            }
          }
        }
      }
    }
    
    if (softConflicts.length > 0) {
      return { type: 'soft', message: 'Contains overlapping PENDING bookings.', conflictIds: softConflicts };
    }
    
    return { type: null };
  };

  const calculateBasePrice = () => {
    const { check_in_date, check_out_date, booking_type, cottage_id, room_ids } = bookingForm;
    if (!check_in_date || !check_out_date || !cottage_id) return;

    const start = new Date(check_in_date);
    const end = new Date(check_out_date);
    if (end <= start) return;

    const days = eachDayOfInterval({ start, end: new Date(end.getTime() - 24*60*60*1000) });
    const nightCount = days.length;

    if (bookingForm.is_loading_edit) {
      setBookingForm(prev => ({ ...prev, night_count: nightCount, is_loading_edit: false }));
      return;
    }

    let itemPricingArray = [];
    if (booking_type === 'Entire Property') {
      const c = cottages.find(c => c.id === cottage_id);
      if (c) itemPricingArray.push(c);
    } else {
      if (!room_ids || room_ids.length === 0) return;
      itemPricingArray = room_ids.map(id => rooms.find(r => r.id === id)).filter(Boolean);
    }
    if (itemPricingArray.length === 0) return;

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
    if (bookingForm.is_loading_edit) return; // Wait until initial load is done

    const total = Number(bookingForm.base_amount) + Number(bookingForm.addons_cost || 0);
    const balance = total - Number(bookingForm.advance_paid || 0);
    setBookingForm(prev => ({
      ...prev,
      total_amount: total,
      balance_amount: balance
    }));
  }, [bookingForm.base_amount, bookingForm.addons_cost, bookingForm.advance_paid]);

  const displayError = (msg) => {
    setError(msg);
    window.scrollTo({ top: 0, behavior: 'smooth' });
    setTimeout(() => setError(null), 5000);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!bookingForm.cottage_id) return displayError('Select a Property');
    if (bookingForm.booking_type === 'Room' && (!bookingForm.room_ids || bookingForm.room_ids.length === 0)) return displayError('Select at least one Room');
    
    // Past date validation (Only for NEW bookings)
    const monthStart = format(startOfMonth(new Date()), 'yyyy-MM-dd');
    if (bookingForm.check_in_date < monthStart && !editingBookingId) {
      return displayError('Cannot create a booking for a date before the current month.');
    }
    
    const conflictResult = checkConflict(bookingForm.check_in_date, bookingForm.check_out_date, bookingForm.booking_type, bookingForm.cottage_id, bookingForm.room_ids, editingBookingId);
    
    if (conflictResult.type === 'hard') return displayError(conflictResult.message);
    
    if (conflictResult.type === 'soft') {
      if (bookingForm.status === 'Pending') {
        return displayError("Cannot place a PENDING booking here - there is already another PENDING reservation for these dates.");
      }
      
      const confirmOverride = window.confirm(`There are overlapping PENDING bookings. If you proceed, they will be automatically CANCELLED. Continue?`);
      if (!confirmOverride) return;

      setIsSubmitting(true);
      try {
        const { error: cancelError } = await supabase
          .from('bookings')
          .update({ 
            status: 'Cancelled',
            booking_source: 'Overridden Pending' 
          })
          .in('id', conflictResult.conflictIds);
          
        if (cancelError) throw cancelError;
        
        setBookings(prev => prev.map(b => 
          conflictResult.conflictIds.includes(b.id) 
            ? { ...b, status: 'Cancelled', booking_source: 'Overridden Pending' } 
            : b
        ));
      } catch (err) {
        setIsSubmitting(false);
        return displayError("Failed to cancel overlapping pending bookings: " + err.message);
      }
    } else {
      setIsSubmitting(true);
    }

    try {
      const payload = { ...bookingForm, tenant_id: session.user.id, resort_id: activeResortId };
      payload.number_of_guests = (bookingForm.adults_count || 1) + (bookingForm.kids_count || 0);
      
      if (payload.booking_type === 'Entire Property') {
        payload.room_ids = [];
        delete payload.room_id; // Ensure legacy room_id is not sent as empty string or at all
      } else {
        payload.room_id = payload.room_ids.length > 0 ? payload.room_ids[0] : null;
      }

      if (payload.booking_source === 'Other') {
        payload.booking_source = payload.custom_booking_source || 'Other';
      }
      delete payload.custom_booking_source;
      delete payload.is_loading_edit;

      if (editingBookingId) {
        const oldBooking = bookings.find(b => b.id === editingBookingId);
        const oldAdvance = Number(oldBooking?.advance_paid || 0);
        const newAdvance = Number(payload.advance_paid || 0);

        const { data, error } = await supabase.from('bookings').update(payload).eq('id', editingBookingId).select();
        if (error) throw error;
        
        if (newAdvance > oldAdvance) {
          const diff = newAdvance - oldAdvance;
          await supabase.from('incomes').insert([{
            date: new Date().toISOString().split('T')[0],
            source: `Advance Payment (Updated): ${payload.guest_name}`,
            booking_id: editingBookingId,
            amount: diff,
            payment_mode: 'Cash',
            notes: 'Auto-added from Edit Booking',
            tenant_id: session.user.id,
            resort_id: activeResortId
          }]);
        }

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
            notes: 'Auto-added from New Booking',
            tenant_id: session.user.id,
            resort_id: activeResortId
          }]);
        }
        alert('Booking Confirmed Successfully!');
      }

      setEditingBookingId(null);
      setBookingForm({
        ...bookingForm, guest_name: '', phone_number: '', check_in_date: '', check_out_date: '',
        night_count: 0, base_amount: 0, extra_guest_charges: 0, addons_cost: 0, total_amount: 0, advance_paid: 0, balance_amount: 0, custom_booking_source: '', is_loading_edit: false,
        price_type: 'Calculated',
        reference_number: generateReference(),
        vehicle_number: '', id_proof_type: 'Aadhar', id_proof_number: '', adults_count: 1, kids_count: 0
      });
    } catch (e) {
      displayError("Error saving booking: " + e.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCheckIn = async (b) => {
    const todayStr = new Date().toISOString().split('T')[0];
    if (b.check_in_date > todayStr) {
      return alert(`Cannot check-in yet. The scheduled check-in date is ${new Date(b.check_in_date).toLocaleDateString()}.`);
    }
    if (!window.confirm(`Check-in guest: ${b.guest_name}?`)) return;
    try {
      await supabase.from('bookings').update({ status: 'Checked-in' }).eq('id', b.id);
      setBookings(bookings.map(item => item.id === b.id ? { ...item, status: 'Checked-in' } : item));
      alert("Guest Checked-in successfully!");
    } catch(err) {
      alert("Error during check-in: " + err.message);
    }
  };

  const handleExtend = async (b) => {
    const newOutDate = window.prompt(`Currently checking out on ${new Date(b.check_out_date).toLocaleDateString()}.\nEnter NEW Checkout Date (YYYY-MM-DD):`, b.check_out_date.split('T')[0]);
    if (!newOutDate || newOutDate === b.check_out_date.split('T')[0]) return;

    if (newOutDate <= b.check_in_date.split('T')[0]) return alert("New checkout date must be after check-in date!");

    const extensionFeeRaw = window.prompt(`Enter additional fee for the extended nights (₹):`, "0");
    if (extensionFeeRaw === null) return;
    const extensionFee = Number(extensionFeeRaw) || 0;

    const conflictResult = checkConflict(b.check_in_date, newOutDate, b.booking_type, b.cottage_id, b.room_ids, b.id);
    if (conflictResult.type === 'hard') return alert(conflictResult.message);
    if (conflictResult.type === 'soft') return alert("Cannot extend: Extended period overlaps with another PENDING booking. Cancel it first.");

    try {
      const newTotal = Number(b.total_amount) + extensionFee;
      const newBalance = Number(b.balance_amount) + extensionFee;
      const newNights = differenceInDays(new Date(newOutDate), new Date(b.check_in_date));

      const { data, error } = await supabase.from('bookings')
        .update({ 
          check_out_date: newOutDate, 
          base_amount: Number(b.base_amount) + extensionFee,
          total_amount: newTotal, 
          balance_amount: newBalance,
          night_count: newNights 
        })
        .eq('id', b.id)
        .select();
      
      if (error) throw error;
      setBookings(bookings.map(item => item.id === b.id ? data[0] : item));
      alert(`Booking extended successfully to ${newOutDate}! Added ₹${extensionFee} to total.`);
    } catch (err) {
      alert("Error extending booking: " + err.message);
    }
  };

  const settleBooking = (b) => {
    setSettlingBooking(b);
    setSettlementData({ discount: 0, allSettled: false });
  };

  const confirmSettlement = async () => {
    if (!settlingBooking) return;
    const b = settlingBooking;
    const { discount, allSettled } = settlementData;

    if (!allSettled) return alert("Please confirm that all items are settled.");
    if (discount > b.balance_amount) return alert("Discount cannot be greater than the balance!");
    
    setLoading(true);
    try {
      const newTotal = Number(b.total_amount) - discount;
      const amountToCollect = Number(b.balance_amount) - discount;

      if (amountToCollect > 0) {
        await supabase.from('incomes').insert([{
          date: new Date().toISOString().split('T')[0],
          source: `Balance Payment: ${b.guest_name}`,
          booking_id: b.id,
          amount: amountToCollect,
          payment_mode: 'Cash',
          notes: `Settled during Check-out`,
          tenant_id: session.user.id,
          resort_id: activeResortId
        }]);
      }
      
      const updatePayload = { 
        status: 'Completed', 
        total_amount: newTotal, 
        balance_amount: 0, 
        advance_paid: newTotal 
      };

      await supabase.from('bookings').update(updatePayload).eq('id', b.id);
      setBookings(bookings.map(item => item.id === b.id ? { ...item, ...updatePayload } : item));
      setSettlingBooking(null);
      alert(`Check-out successful!`);
    } catch(err) {
      alert(`Error during check-out: ` + err.message);
    } finally {
      setLoading(false);
    }
  };

  const deleteBooking = async (id) => {
    if (!window.confirm("Cancel this booking?")) return;
    await supabase.from('bookings').update({ status: 'Cancelled' }).eq('id', id);
    setBookings(bookings.map(b => b.id === id ? { ...b, status: 'Cancelled' } : b));
  };

  const handleRefund = async (b) => {
    if (!window.confirm(`Refund advance payment of ₹${b.advance_paid} to ${b.guest_name}?`)) return;
    
    try {
      setLoading(true);
      // 1. Create Expense Record
      const { error: expError } = await supabase.from('expenses').insert([{
        date: new Date().toISOString().split('T')[0],
        category: 'Refund',
        amount: b.advance_paid,
        vendor_name: `Guest: ${b.guest_name}`,
        payment_mode: 'Cash',
        notes: `Refund for Cancelled Booking Ref: ${b.reference_number}`,
        tenant_id: session.user.id,
        resort_id: activeResortId
      }]);
      
      if (expError) throw expError;

      // 2. Update Booking
      const { error: bError } = await supabase.from('bookings').update({
        advance_paid: 0,
        balance_amount: b.total_amount
      }).eq('id', b.id);
      
      if (bError) throw bError;

      // 3. Update Local State
      setBookings(bookings.map(item => item.id === b.id ? { ...item, advance_paid: 0, balance_amount: item.total_amount } : item));
      alert("Refund recorded successfully as an expense.");
    } catch (err) {
      alert("Error recording refund: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  const sortedAndFilteredBookings = React.useMemo(() => {
    let sortableItems = [...bookings.filter(b => statusFilter[b.status])];
    if (sortConfig !== null) {
      sortableItems.sort((a, b) => {
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
    return sortableItems;
  }, [bookings, statusFilter, sortConfig]);

  if (loading) return <div>Loading...</div>;

  const relevantRooms = rooms.filter(r => r.cottage_id === bookingForm.cottage_id);

  const requestSort = (key) => {
    let direction = 'ascending';
    if (sortConfig.key === key && sortConfig.direction === 'ascending') {
      direction = 'descending';
    }
    setSortConfig({ key, direction });
  };

  return (
    <>
      <div className="grid-2 bookings-layout" style={{ display: 'grid', gridTemplateColumns: '1.2fr 2fr', gap: '2rem' }}>
        {/* Booking Form */}
        <div className="card">
          <h2 style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <CalendarCheck size={24} /> {editingBookingId ? `Editing: ${bookingForm.reference_number}` : 'New Booking'}
          </h2>
          {error && <div style={{ color: 'var(--danger)', marginBottom: '1rem' }}>{error}</div>}
          
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div className="grid-4" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(100px, 1fr))', gap: '1rem' }}>
              <div className="form-group"><label className="form-label">Guest Name</label><input type="text" required className="form-input" value={bookingForm.guest_name} onChange={e => setBookingForm({...bookingForm, guest_name: e.target.value})} /></div>
              <div className="form-group"><label className="form-label">Phone</label><input type="text" required className="form-input" value={bookingForm.phone_number} onChange={e => setBookingForm({...bookingForm, phone_number: e.target.value})} /></div>
              <div className="form-group"><label className="form-label">Reference #</label><input type="text" required className="form-input" style={{ fontWeight: 'bold', color: 'var(--primary)' }} value={bookingForm.reference_number} onChange={e => setBookingForm({...bookingForm, reference_number: e.target.value})} /></div>
              <div className="form-group">
                <label className="form-label">Occupants (Adults / Kids)</label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                  <input type="number" min="1" placeholder="Adults" className="form-input" value={bookingForm.adults_count} onChange={e => setBookingForm({...bookingForm, adults_count: Number(e.target.value) || 1})} title="Adults" />
                  <input type="number" min="0" placeholder="Kids" className="form-input" value={bookingForm.kids_count} onChange={e => setBookingForm({...bookingForm, kids_count: Number(e.target.value) || 0})} title="Kids" />
                </div>
              </div>
            </div>
            
            <div className="grid-3" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '1rem' }}>
              <div className="form-group">
                <label className="form-label">Check-in</label>
                <input type="date" required className="form-input" value={bookingForm.check_in_date} onChange={e => {
                  const newInDate = e.target.value;
                  if (!newInDate) {
                    setBookingForm({...bookingForm, check_in_date: ''});
                    return;
                  }
                  const inDate = new Date(newInDate);
                  const outDate = new Date(inDate);
                  outDate.setDate(outDate.getDate() + 1);
                  const newOutDate = outDate.toISOString().split('T')[0];
                  
                  setBookingForm({...bookingForm, check_in_date: newInDate, check_out_date: newOutDate});
                }} />
                <small style={{ color: 'var(--text-muted)', fontSize: '0.7rem' }}>Standard Check-in: 1:00 PM</small>
              </div>
              <div className="form-group">
                <label className="form-label">Check-out</label>
                <input type="date" required className="form-input" value={bookingForm.check_out_date} onChange={e => setBookingForm({...bookingForm, check_out_date: e.target.value})} />
                <small style={{ color: 'var(--text-muted)', fontSize: '0.7rem' }}>Check-out till: 11:00 AM</small>
              </div>
              <div className="form-group">
                <label className="form-label">Vehicle Number</label>
                <input type="text" className="form-input" placeholder="e.g. KA-01-AB-1234" value={bookingForm.vehicle_number || ''} onChange={e => setBookingForm({...bookingForm, vehicle_number: e.target.value})} />
                <small style={{ color: 'var(--text-muted)', fontSize: '0.7rem' }}>Optional</small>
              </div>
            </div>

            <div className="grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '1rem' }}>
              <div className="form-group">
                <label className="form-label">ID Proof Type</label>
                <select className="form-select" value={bookingForm.id_proof_type || 'Aadhar'} onChange={e => setBookingForm({...bookingForm, id_proof_type: e.target.value})}>
                  <option value="Aadhar">Aadhar</option>
                  <option value="Pan Card">Pan Card</option>
                  <option value="Driving License">Driving License</option>
                  <option value="Voter ID">Voter ID</option>
                  <option value="Passport">Passport</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">ID Proof Number</label>
                <input type="text" className="form-input" placeholder="Enter ID number" value={bookingForm.id_proof_number || ''} onChange={e => setBookingForm({...bookingForm, id_proof_number: e.target.value})} />
              </div>
            </div>

            <div className="grid-3" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '1rem' }}>
              <div className="form-group">
                <label className="form-label">Booking Status</label>
                <select className="form-select" value={bookingForm.status} onChange={e => setBookingForm({...bookingForm, status: e.target.value})}>
                  <option value="Confirmed">Confirmed</option>
                  <option value="Pending">Pending</option>
                  <option value="Checked-in">Checked-in</option>
                  <option value="Completed">Completed</option>
                  <option value="Cancelled">Cancelled</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Type</label>
                <select className="form-select" value={bookingForm.booking_type} onChange={e => setBookingForm({...bookingForm, booking_type: e.target.value})}>
                  <option value="Entire Property">Entire Property</option>
                  <option value="Room">Room Only</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Property</label>
                <select className="form-select" required value={bookingForm.cottage_id} onChange={e => setBookingForm({...bookingForm, cottage_id: e.target.value, room_ids: []})}>
                  <option value="">Select...</option>
                  {cottages.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div className="form-group" style={{ gridColumn: 'span 3' }}>
                <label className="form-label">Rooms</label>
                {bookingForm.booking_type === 'Entire Property' ? (
                  <div style={{ color: 'var(--text-muted)', padding: '0.5rem' }}>N/A (Entire Property Selected)</div>
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
              <div className="grid-3" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(100px, 1fr))', gap: '1rem', marginTop: '1rem' }}>
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
              <button type="submit" className="btn btn-primary" disabled={isSubmitting} style={{ flex: 1, fontSize: '1.1rem', padding: '1rem' }}>
                <CheckCircle2 /> {isSubmitting ? 'Processing...' : (editingBookingId ? 'Update Booking' : 'Confirm Booking')}
              </button>
              {editingBookingId && (
                <button type="button" className="btn btn-outline" style={{ fontSize: '1.1rem', padding: '1rem' }} onClick={() => {
                  setEditingBookingId(null);
                  setBookingForm({ ...bookingForm, guest_name: '', phone_number: '', check_in_date: '', check_out_date: '', night_count: 0, base_amount: 0, addons_cost: 0, advance_paid: 0, total_amount: 0, balance_amount: 0, is_loading_edit: false, vehicle_number: '', id_proof_type: 'Aadhar', id_proof_number: '', number_of_guests: 1 });
                }}>Cancel Edit</button>
              )}
            </div>
          </form>
        </div>

        {/* Bookings List */}
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
            <h2 style={{ margin: 0 }}>Recent Bookings</h2>
            <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', background: 'var(--bg-color)', padding: '0.5rem 1rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)', fontSize: '0.85rem', alignItems: 'center' }}>
              <span style={{ fontWeight: '600', color: 'var(--text-muted)', marginRight: '0.2rem' }}>Filter:</span>
              
              <button 
                type="button" 
                style={{ background: 'transparent', border: 'none', color: 'var(--primary)', cursor: 'pointer', fontSize: '0.8rem', padding: 0, textDecoration: 'underline' }}
                onClick={() => setStatusFilter({ Confirmed: true, Pending: true, 'Checked-in': true, Completed: true, Cancelled: true })}
              >All</button>
              <span style={{ color: 'var(--border)' }}>|</span>
              <button 
                type="button" 
                style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '0.8rem', padding: 0, textDecoration: 'underline' }}
                onClick={() => setStatusFilter({ Confirmed: false, Pending: false, 'Checked-in': false, Completed: false, Cancelled: false })}
              >None</button>

              <div style={{ width: '1px', height: '1rem', background: 'var(--border)', margin: '0 0.5rem' }}></div>

              {Object.keys(statusFilter).map(status => (
                <label key={status} style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', cursor: 'pointer' }}>
                  <input 
                    type="checkbox" 
                    checked={statusFilter[status]} 
                    onChange={e => setStatusFilter({ ...statusFilter, [status]: e.target.checked })} 
                  />
                  {status}
                </label>
              ))}
            </div>
          </div>
          
          <div className="table-container" style={{ maxHeight: '800px', overflowY: 'auto' }}>
            <table className="table">
              <thead style={{ position: 'sticky', top: 0, background: 'var(--bg-color)', zIndex: 1 }}>
                <tr>
                  <th onClick={() => requestSort('guest_name')} style={{ cursor: 'pointer', userSelect: 'none' }}>Guest {sortConfig.key === 'guest_name' && (sortConfig.direction === 'ascending' ? '▲' : '▼')}</th>
                  <th onClick={() => requestSort('check_in_date')} style={{ cursor: 'pointer', userSelect: 'none' }}>Dates {sortConfig.key === 'check_in_date' && (sortConfig.direction === 'ascending' ? '▲' : '▼')}</th>
                  <th onClick={() => requestSort('booking_type')} style={{ cursor: 'pointer', userSelect: 'none' }}>Unit {sortConfig.key === 'booking_type' && (sortConfig.direction === 'ascending' ? '▲' : '▼')}</th>
                  <th onClick={() => requestSort('status')} style={{ cursor: 'pointer', userSelect: 'none' }}>Status {sortConfig.key === 'status' && (sortConfig.direction === 'ascending' ? '▲' : '▼')}</th>
                  <th onClick={() => requestSort('balance_amount')} style={{ cursor: 'pointer', userSelect: 'none' }}>Balance {sortConfig.key === 'balance_amount' && (sortConfig.direction === 'ascending' ? '▲' : '▼')}</th>
                  <th>Act</th>
                </tr>
              </thead>
              <tbody>
                {sortedAndFilteredBookings.length === 0 ? (
                  <tr><td colSpan="6" style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>No bookings found for the selected filters.</td></tr>
                ) : sortedAndFilteredBookings.map(b => {
                  const cname = cottages.find(x => x.id === b.cottage_id)?.name || 'Unknown';
                  let rname = '';
                  if (b.booking_type === 'Entire Property') { rname = 'Entire Property'; }
                  else {
                    const arr = b.room_ids || (b.room_id ? [b.room_id] : []);
                    rname = arr.map(id => rooms.find(r => r.id === id)?.name).filter(Boolean).join(', ');
                  }

                  return (
                    <tr key={b.id} style={{ 
                      opacity: b.status === 'Cancelled' ? 0.5 : 1,
                      background: b.id === editingBookingId ? 'rgba(59, 130, 246, 0.1)' : (b.status === 'Pending' ? 'rgba(245, 158, 11, 0.05)' : 'inherit'),
                      borderLeft: b.id === editingBookingId ? '4px solid var(--primary)' : 'none',
                      transition: 'all 0.2s ease'
                    }}>
                      <td>
                        <small style={{ color: 'var(--primary)', fontWeight: 'bold' }}>{b.reference_number || 'No Ref'}</small><br/>
                        <strong>{b.guest_name}</strong>
                        <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginLeft: '0.5rem' }}>
                          ({b.adults_count || b.number_of_guests || 1} Adult{(b.adults_count || b.number_of_guests || 1) > 1 ? 's' : ''}{b.kids_count ? `, ${b.kids_count} Kid${b.kids_count > 1 ? 's' : ''}` : ''})
                        </span>
                        <br/>
                        <small>{b.phone_number}</small>
                        {b.vehicle_number && <><br/><small style={{ color: 'var(--text-main)', fontWeight: 'bold' }}>🚗 {b.vehicle_number}</small></>}
                        {b.id_proof_number && <><br/><small style={{ color: 'var(--primary)', fontSize: '0.75rem' }}>🪪 {b.id_proof_type}: {b.id_proof_number}</small></>}
                        <br/>
                        <small style={{ 
                          color: b.booking_source === 'Overridden Pending' ? 'var(--danger)' : 'var(--text-muted)',
                          fontWeight: b.booking_source === 'Overridden Pending' ? 700 : 400 
                        }}>
                          Source: {b.booking_source}
                        </small>
                      </td>
                      <td>{new Date(b.check_in_date).toLocaleDateString()} <br/>{new Date(b.check_out_date).toLocaleDateString()}</td>
                      <td>{cname} <br/><small className="badge badge-success">{rname}</small></td>
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
                        <strong style={{ color: b.balance_amount > 0 ? 'var(--warning)' : 'var(--success)' }}>Bal: ₹{b.balance_amount}</strong><br/>
                        Total: ₹{b.total_amount}<br/>
                        <span style={{ color: 'var(--success)', fontWeight: 'bold', fontSize: '0.8rem' }}>Advance: ₹{b.advance_paid || 0}</span>
                      </td>
                      <td style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                        {b.status === 'Confirmed' && (
                          <button className="btn btn-primary" style={{ padding: '0.2rem', fontSize: '0.75rem', background: 'var(--primary)' }} onClick={() => handleCheckIn(b)}>Check-in</button>
                        )}
                        {b.status === 'Checked-in' && (
                          <button className="btn btn-primary" style={{ padding: '0.2rem', fontSize: '0.75rem', background: '#6366f1' }} onClick={() => settleBooking(b)}>Check-out</button>
                        )}
                        {(b.status === 'Confirmed' || b.status === 'Checked-in') && (
                          <button className="btn btn-outline" style={{ padding: '0.2rem', fontSize: '0.75rem', color: 'var(--primary)' }} onClick={() => handleExtend(b)}>Extend Stay</button>
                        )}
                        
                        <button className="btn btn-outline" style={{ padding: '0.2rem', fontSize: '0.75rem', color: 'var(--text-muted)' }} onClick={() => loadBookingForEdit(b)}>Edit Details</button>
                        {(b.status === 'Pending' || b.status === 'Confirmed') && (
                          <button className="btn btn-outline" style={{ padding: '0.2rem', fontSize: '0.75rem', color: 'var(--danger)' }} onClick={() => deleteBooking(b.id)}>Cancel</button>
                        )}
                        {b.status === 'Cancelled' && (b.advance_paid || 0) > 0 && (
                          <button className="btn btn-outline" style={{ padding: '0.2rem', fontSize: '0.75rem', color: 'var(--danger)', borderColor: 'var(--danger)' }} onClick={() => handleRefund(b)}>Refund Advance</button>
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
              <div className="balance-due-large pulse-warning">
                ₹{settlingBooking.balance_amount - settlementData.discount}
              </div>
            </div>

            <div className="discount-highlight">
              <h3><AlertTriangle size={20} /> Any discount!</h3>
              <div className="form-group" style={{ margin: 0 }}>
                <input 
                  type="number" 
                  className="form-input" 
                  placeholder="Enter discount amount..."
                  value={settlementData.discount}
                  onChange={e => setSettlementData({ ...settlementData, discount: Number(e.target.value) })}
                  style={{ textAlign: 'center', fontSize: '1.1rem', fontWeight: 'bold' }}
                />
              </div>
            </div>

            <div className="settlement-footer">
              <label className="checkbox-group">
                <input 
                  type="checkbox" 
                  checked={settlementData.allSettled} 
                  onChange={e => setSettlementData({ ...settlementData, allSettled: e.target.checked })}
                />
                <span style={{ fontWeight: '600' }}>All settled up? (Confirm final payment)</span>
              </label>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <button className="btn btn-outline" onClick={() => setSettlingBooking(null)}>Cancel</button>
                <button 
                  className="btn btn-primary" 
                  disabled={!settlementData.allSettled || loading}
                  onClick={confirmSettlement}
                >
                  {loading ? 'Processing...' : 'Complete Check-out'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
