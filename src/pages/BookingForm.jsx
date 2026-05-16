import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { CalendarCheck, CheckCircle2, ArrowLeft } from 'lucide-react';
import { eachDayOfInterval, isWeekend } from 'date-fns';
import { useSettingsStore } from '../lib/store';

export default function BookingForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { activeResortId, profile } = useSettingsStore();
  
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [originalStatus, setOriginalStatus] = useState(null);
  
  const [cottages, setCottages] = useState([]);
  const [rooms, setRooms] = useState([]);

  const [bookingForm, setBookingForm] = useState({
    guest_name: '', guest_email: '', phone_number: '', check_in_date: '', check_out_date: '', adults_count: 1, kids_count: 0,
    booking_type: 'Entire Property', cottage_id: '', room_ids: [],
    night_count: 0, price_type: 'Calculated', base_amount: 0, extra_guest_charges: 0, addons_cost: 0,
    total_amount: 0, advance_paid: 0, balance_amount: 0, booking_source: 'Direct', status: 'Confirmed', is_loading_edit: false,
    reference_number: '', vehicle_number: '', id_proof_type: 'Aadhar', id_proof_number: '',
    addon_selections: [], addon_others: ''
  });

  useEffect(() => {
    fetchData();
  }, [activeResortId]);

  useEffect(() => {
    if (location.state?.prefill && !id) {
      setBookingForm(prev => ({
        ...prev,
        ...location.state.prefill
      }));
      // Clear state to prevent re-prefilling if they refresh or navigate back
      navigate(location.pathname, { replace: true });
    }
  }, [location.state, id, navigate]);

  const fetchData = async () => {
    if (!activeResortId) return;
    try {
      const [cts, rms] = await Promise.all([
        supabase.from('cottages').select('*').eq('resort_id', activeResortId),
        supabase.from('rooms').select('*').eq('resort_id', activeResortId)
      ]);
      setCottages(cts.data || []);
      setRooms(rms.data || []);

      if (id) {
        // Fetch existing booking for edit
        const { data: b, error: fetchErr } = await supabase
          .from('bookings')
          .select('*')
          .eq('id', id)
          .single();
        
        if (fetchErr) throw fetchErr;
        if (b) {
          let selections = [];
          let othersText = [];
          if (b.addon_details) {
            const parts = b.addon_details.split(',').map(s => s.trim());
            parts.forEach(p => {
              if (['Food', 'Fire camp', 'BBQ'].includes(p)) selections.push(p);
              else if (p) othersText.push(p);
            });
          }
          if (othersText.length > 0) selections.push('Others');

          setBookingForm({
            guest_name: b.guest_name,
            guest_email: b.guest_email || '',
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
            addon_selections: selections,
            addon_others: othersText.join(', '),
            is_loading_edit: true
          });
          setOriginalStatus(b.status);
        }
      } else {
        // Generate new reference if not editing
        setBookingForm(prev => ({ ...prev, reference_number: generateReference() }));
      }
    } catch (err) {
      console.error(err);
      setError('Error fetching data.');
    } finally {
      setLoading(false);
    }
  };

  const generateReference = () => {
    const datePart = new Date().toISOString().slice(2,10).replace(/-/g, '');
    const randomPart = Math.floor(1000 + Math.random() * 9000);
    return `BK-${datePart}-${randomPart}`;
  };

  const calculateBasePrice = () => {
    const { check_in_date, check_out_date, booking_type, cottage_id, room_ids } = bookingForm;
    if (!check_in_date || !check_out_date) return;

    const start = new Date(check_in_date);
    const end = new Date(check_out_date);
    if (end <= start) {
      setBookingForm(prev => ({ ...prev, night_count: 0 }));
      return;
    }

    const days = eachDayOfInterval({ start, end: new Date(end.getTime() - 24*60*60*1000) });
    const nightCount = days.length;

    if (bookingForm.is_loading_edit) {
      setBookingForm(prev => ({ ...prev, night_count: nightCount, is_loading_edit: false }));
      return;
    }

    if (!cottage_id) {
      setBookingForm(prev => ({ ...prev, night_count: nightCount }));
      return;
    }

    let itemPricingArray = [];
    if (booking_type === 'Entire Property') {
      const c = cottages.find(c => c.id === cottage_id);
      if (c) itemPricingArray.push(c);
    } else {
      if (!room_ids || room_ids.length === 0) {
        setBookingForm(prev => ({ ...prev, night_count: nightCount }));
        return;
      }
      itemPricingArray = room_ids.map(id => rooms.find(r => r.id === id)).filter(Boolean);
    }

    if (itemPricingArray.length === 0) {
      setBookingForm(prev => ({ ...prev, night_count: nightCount }));
      return;
    }

    let base = 0;
    days.forEach(d => {
      let daily = 0;
      itemPricingArray.forEach(item => {
        if (isWeekend(d)) daily += Number(item.weekend_price || 0);
        else daily += Number(item.weekday_price || 0);
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
  }, [bookingForm.check_in_date, bookingForm.check_out_date, bookingForm.booking_type, bookingForm.cottage_id, JSON.stringify(bookingForm.room_ids), cottages, rooms]);

  useEffect(() => {
    const total = Number(bookingForm.base_amount || 0) + Number(bookingForm.addons_cost || 0) + Number(bookingForm.extra_guest_charges || 0);
    const balance = total - Number(bookingForm.advance_paid || 0);
    setBookingForm(prev => ({
      ...prev,
      total_amount: total,
      balance_amount: balance
    }));
  }, [bookingForm.base_amount, bookingForm.addons_cost, bookingForm.advance_paid, bookingForm.extra_guest_charges]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (isSubmitting) return;
    setIsSubmitting(true);
    setError(null);

    try {
      const bookingData = {
        resort_id: activeResortId,
        tenant_id: profile.tenant_id,
        guest_name: bookingForm.guest_name,
        guest_email: bookingForm.guest_email || null,
        phone_number: bookingForm.phone_number,
        check_in_date: bookingForm.check_in_date,
        check_out_date: bookingForm.check_out_date,
        adults_count: bookingForm.adults_count,
        kids_count: bookingForm.kids_count,
        number_of_guests: Number(bookingForm.adults_count || 0) + Number(bookingForm.kids_count || 0),
        booking_type: bookingForm.booking_type,
        cottage_id: bookingForm.cottage_id,
        room_ids: bookingForm.booking_type === 'Room' ? bookingForm.room_ids : null,
        room_id: bookingForm.booking_type === 'Room' && bookingForm.room_ids.length > 0 ? bookingForm.room_ids[0] : null,
        night_count: bookingForm.night_count,
        base_amount: bookingForm.base_amount,
        addons_cost: bookingForm.addons_cost,
        total_amount: bookingForm.total_amount,
        advance_paid: bookingForm.advance_paid,
        balance_amount: bookingForm.balance_amount,
        status: bookingForm.status,
        reference_number: bookingForm.reference_number,
        vehicle_number: bookingForm.vehicle_number,
        id_proof_type: bookingForm.id_proof_type,
        id_proof_number: bookingForm.id_proof_number,
        addon_details: bookingForm.addon_selections.map(s => s === 'Others' ? bookingForm.addon_others : s).filter(Boolean).join(', '),
        booking_source: bookingForm.booking_source === 'Other' ? bookingForm.custom_booking_source : bookingForm.booking_source,
        price_type: bookingForm.price_type
      };
      
      // If status was Completed and now it's NOT, delete the auto-settled income record
      if (id && originalStatus === 'Completed' && bookingForm.status !== 'Completed') {
          // Delete any income record that was created as a settlement for this booking
          await supabase.from('incomes').delete().eq('booking_id', id).ilike('notes', '%Settlement%');
      }

      let result;
      if (id) {
        result = await supabase.from('bookings').update(bookingData).eq('id', id);
      } else {
        result = await supabase.from('bookings').insert([bookingData]).select().single();
      }

      if (result.error) throw result.error;

      // Trigger notification
      const triggerType = id ? 'booking_updated' : 'booking_confirmed';
      const targetId = id || result.data.id;
      
      fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-notification`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`
        },
        body: JSON.stringify({
          bookingId: targetId,
          type: triggerType
        })
      }).catch(err => console.error("Notification Trigger Error:", err));

      navigate('/bookings');
    } catch (err) {
      console.error(err);
      setError(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading) return <div style={{ padding: '2rem' }}>Loading Form...</div>;

  const relevantRooms = rooms.filter(r => r.cottage_id === bookingForm.cottage_id);

  return (
    <div className="container" style={{ maxWidth: '800px', margin: '0 auto', padding: '2rem' }}>
      <button className="btn btn-outline" onClick={() => navigate('/bookings')} style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <ArrowLeft size={18} /> Back to Bookings
      </button>

      <div className="card" style={{ padding: '2rem' }}>
        <h2 style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <CalendarCheck size={24} /> {id ? `Edit Booking: ${bookingForm.reference_number}` : 'New Booking'}
        </h2>
        
        {error && <div style={{ color: 'var(--danger)', marginBottom: '1rem', padding: '1rem', background: 'rgba(229, 62, 62, 0.1)', borderRadius: '0.5rem' }}>{error}</div>}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {/* Guest Info */}
          <div className="grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
            <div className="form-group"><label className="form-label">Guest Name</label><input type="text" required className="form-input" value={bookingForm.guest_name} onChange={e => setBookingForm({...bookingForm, guest_name: e.target.value})} /></div>
            <div className="form-group"><label className="form-label">Email Address</label><input type="email" className="form-input" placeholder="guest@email.com" value={bookingForm.guest_email} onChange={e => setBookingForm({...bookingForm, guest_email: e.target.value})} /></div>
            <div className="form-group"><label className="form-label">Phone</label><input type="text" required className="form-input" value={bookingForm.phone_number} onChange={e => setBookingForm({...bookingForm, phone_number: e.target.value})} /></div>
            <div className="form-group"><label className="form-label">Reference #</label><input type="text" required className="form-input" style={{ fontWeight: 'bold', color: 'var(--primary)' }} value={bookingForm.reference_number} onChange={e => setBookingForm({...bookingForm, reference_number: e.target.value})} /></div>
          </div>

          <div className="grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
            <div className="form-group">
              <label className="form-label">Occupants (Adults / Kids)</label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                <input type="number" min="1" placeholder="Adults" className="form-input" value={bookingForm.adults_count} onChange={e => setBookingForm({...bookingForm, adults_count: Number(e.target.value) || 1})} />
                <input type="number" min="0" placeholder="Kids" className="form-input" value={bookingForm.kids_count} onChange={e => setBookingForm({...bookingForm, kids_count: Number(e.target.value) || 0})} />
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Vehicle Number</label>
              <input type="text" className="form-input" placeholder="Optional" value={bookingForm.vehicle_number || ''} onChange={e => setBookingForm({...bookingForm, vehicle_number: e.target.value})} />
            </div>
          </div>

          <div className="grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '1.5rem' }}>
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

          {/* Dates */}
          <div className="grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
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
            </div>
            <div className="form-group">
              <label className="form-label">Check-out</label>
              <input type="date" required className="form-input" value={bookingForm.check_out_date} onChange={e => setBookingForm({...bookingForm, check_out_date: e.target.value})} />
            </div>
          </div>

          {/* Unit selection */}
          <div className="grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
            <div className="form-group">
              <label className="form-label">Booking Type</label>
              <select className="form-select" value={bookingForm.booking_type} onChange={e => setBookingForm({...bookingForm, booking_type: e.target.value, room_ids: []})}>
                <option value="Entire Property">Entire Property</option>
                <option value="Room">Individual Rooms</option>
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Property</label>
              <select className="form-select" value={bookingForm.cottage_id} onChange={e => setBookingForm({...bookingForm, cottage_id: e.target.value})}>
                <option value="">Select Property...</option>
                {cottages.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          </div>

          {bookingForm.booking_type === 'Room' && (
            <div className="form-group">
              <label className="form-label">Select Rooms</label>
              <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', padding: '1rem', background: 'rgba(0,0,0,0.02)', borderRadius: 'var(--radius-md)' }}>
                {relevantRooms.length === 0 ? <small>Select a property first</small> : relevantRooms.map(r => (
                  <label key={r.id} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer' }}>
                    <input type="checkbox" checked={bookingForm.room_ids.includes(r.id)} onChange={e => {
                      const newIds = e.target.checked ? [...bookingForm.room_ids, r.id] : bookingForm.room_ids.filter(id => id !== r.id);
                      setBookingForm({...bookingForm, room_ids: newIds});
                    }} />
                    {r.name}
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* Add-ons and Source */}
          <div className="grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
            <div className="form-group">
              <label className="form-label">Add-ons Selection</label>
              <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', padding: '0.5rem', background: 'rgba(0,0,0,0.02)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)' }}>
                {['Food', 'Fire camp', 'BBQ'].map(addon => (
                  <label key={addon} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer', fontSize: '0.9rem' }}>
                    <input type="checkbox" checked={bookingForm.addon_selections?.includes(addon)} onChange={e => {
                      const newSels = e.target.checked 
                        ? [...(bookingForm.addon_selections || []), addon] 
                        : (bookingForm.addon_selections || []).filter(a => a !== addon);
                      setBookingForm({...bookingForm, addon_selections: newSels});
                    }} />
                    {addon}
                  </label>
                ))}
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer', fontSize: '0.9rem' }}>
                  <input type="checkbox" checked={bookingForm.addon_selections?.includes('Others')} onChange={e => {
                    const newSels = e.target.checked 
                      ? [...(bookingForm.addon_selections || []), 'Others'] 
                      : (bookingForm.addon_selections || []).filter(a => a !== 'Others');
                    setBookingForm({...bookingForm, addon_selections: newSels});
                  }} />
                  Others
                </label>
                {bookingForm.addon_selections?.includes('Others') && (
                  <input type="text" className="form-input" style={{ width: '100%', marginTop: '0.5rem' }} placeholder="Specify others..." value={bookingForm.addon_others || ''} onChange={e => setBookingForm({...bookingForm, addon_others: e.target.value})} />
                )}
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Booking Source</label>
              <select className="form-select" value={bookingForm.booking_source} onChange={e => setBookingForm({...bookingForm, booking_source: e.target.value})}>
                <option value="Direct">Direct</option>
                <option value="Airbnb">Airbnb</option>
                <option value="Booking.com">Booking.com</option>
                <option value="Agent">Agent</option>
                <option value="Other">Other...</option>
              </select>
              {bookingForm.booking_source === 'Other' && (
                <input 
                  type="text" 
                  className="form-input" 
                  style={{ marginTop: '0.5rem' }} 
                  placeholder="Specify source" 
                  value={bookingForm.custom_booking_source || ''} 
                  onChange={e => setBookingForm({...bookingForm, custom_booking_source: e.target.value})} 
                  required
                />
              )}
            </div>
          </div>

          {/* Billing */}
          <div style={{ background: 'rgba(0,0,0,0.02)', padding: '1.5rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)' }}>
            <h4 style={{ marginBottom: '1rem', color: 'var(--text-main)', borderBottom: '1px solid var(--border)', paddingBottom: '0.5rem' }}>Billing Auto-Calc</h4>
            <div className="grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                <span className="form-label">Nights:</span> <strong style={{ fontSize: '1.2rem' }}>{bookingForm.night_count}</strong>
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label">Base Amount (₹)</label>
                <input type="number" className="form-input" value={bookingForm.base_amount} onChange={e => setBookingForm({...bookingForm, base_amount: Number(e.target.value)})} />
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label">Advance Paid</label>
                <input type="number" className="form-input" value={bookingForm.advance_paid} onChange={e => setBookingForm({...bookingForm, advance_paid: Number(e.target.value)})} />
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label">Status</label>
                <select className="form-select" value={bookingForm.status} onChange={e => setBookingForm({...bookingForm, status: e.target.value})}>
                  <option value="Confirmed">Confirmed</option>
                  <option value="Pending">Pending</option>
                  <option value="Checked-in">Checked-in</option>
                  <option value="Completed">Completed</option>
                  <option value="Cancelled">Cancelled</option>
                </select>
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label">Add-ons Cost (₹)</label>
                <input type="number" className="form-input" value={bookingForm.addons_cost} onChange={e => setBookingForm({...bookingForm, addons_cost: Number(e.target.value)})} />
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label">Extra Guest Charges (₹)</label>
                <input type="number" className="form-input" value={bookingForm.extra_guest_charges} onChange={e => setBookingForm({...bookingForm, extra_guest_charges: Number(e.target.value)})} />
              </div>
            </div>

            <div style={{ marginTop: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem', background: 'white', borderRadius: '0.5rem' }}>
              <span className="form-label mb-0">Total: <strong style={{ fontSize: '1.5rem', color: 'var(--primary)' }}>₹{bookingForm.total_amount}</strong></span>
              <span className="form-label mb-0">Balance: <strong style={{ fontSize: '1.5rem', color: 'var(--warning)' }}>₹{bookingForm.balance_amount}</strong></span>
            </div>
          </div>

          <button type="submit" className="btn btn-primary" disabled={isSubmitting} style={{ padding: '1rem', fontSize: '1.1rem' }}>
            <CheckCircle2 /> {isSubmitting ? 'Processing...' : (id ? 'Update Booking' : 'Confirm Booking')}
          </button>
        </form>
      </div>
    </div>
  );
}
