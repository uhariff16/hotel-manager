import React, { useState, useEffect } from 'react';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { addDays, format, differenceInDays, isWithinInterval, startOfDay, startOfMonth, endOfMonth, addMonths, subMonths, eachDayOfInterval } from 'date-fns';
import { ChevronLeft, ChevronRight, User, Phone, Calendar, Car, IdCard, Users, CheckCircle2, Clock, MapPin, Globe } from 'lucide-react';
import { useSettingsStore } from '../lib/store';
import { useNavigate } from 'react-router-dom';

export default function CalendarView() {
  const navigate = useNavigate();
  const { activeResortId } = useSettingsStore();
  const [bookings, setBookings] = useState([]);
  const [cottages, setCottages] = useState([]);
  const [rooms, setRooms] = useState([]);
  const [loading, setLoading] = useState(true);

  const [currentDate, setCurrentDate] = useState(startOfMonth(new Date()));
  const [dragSelection, setDragSelection] = useState(null);
  const [selectedBooking, setSelectedBooking] = useState(null);

  const dates = eachDayOfInterval({ start: startOfMonth(currentDate), end: endOfMonth(currentDate) });

  useEffect(() => {
    const fetchData = async () => {
      if (!isSupabaseConfigured() || !activeResortId) { setLoading(false); return; }
      try {
        const [bks, cts, rms] = await Promise.all([
          supabase.from('bookings').select('*').eq('resort_id', activeResortId).neq('status', 'Cancelled'),
          supabase.from('cottages').select('*').eq('resort_id', activeResortId).order('name'),
          supabase.from('rooms').select('*').eq('resort_id', activeResortId).order('name')
        ]);
        setBookings(bks.data || []);
        setCottages(cts.data || []);
        setRooms(rms.data || []);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [activeResortId]);

  const getCellStatus = (date, type, itemId) => {
    let isBooked = false;
    let blockColor = 'var(--available)'; // Default Green
    let label = '';
    let bookingId = null;

    for (let b of bookings) {
      const bIn = startOfDay(new Date(b.check_in_date));
      const bOut = startOfDay(new Date(b.check_out_date));
      
      if (date >= bIn && date < bOut) {
        if (type === 'Property') {
          if (b.cottage_id === itemId) {
            isBooked = true;
            bookingId = b.id;
            blockColor = b.status === 'Pending' ? 'var(--pending-block)' : (b.booking_type === 'Entire Property' ? 'var(--cottage-block)' : 'var(--room-block)');
            label = `${b.guest_name}\nRef: ${b.reference_number || 'N/A'}\nStatus: ${b.status}`;
            break;
          }
        } else if (type === 'Room') {
          const room = rooms.find(r => r.id === itemId);
          if (b.cottage_id === room?.cottage_id) {
            if (b.booking_type === 'Entire Property') {
              isBooked = true;
              bookingId = b.id;
              blockColor = b.status === 'Pending' ? 'var(--pending-block)' : 'var(--cottage-block)';
              label = `${b.guest_name}\nRef: ${b.reference_number || 'N/A'}\nStatus: ${b.status}`;
            } else {
              const bRooms = b.room_ids || (b.room_id ? [b.room_id] : []);
              if (bRooms.includes(itemId)) {
                isBooked = true;
                bookingId = b.id;
                blockColor = b.status === 'Pending' ? 'var(--pending-block)' : 'var(--room-block)';
                label = `${b.guest_name}\nRef: ${b.reference_number || 'N/A'}\nStatus: ${b.status}`;
              }
            }
          }
        }
      }
    }

    return { isBooked, blockColor, label, bookingId };
  };

  const handleMouseDown = (date, type, itemId, bookingId, cottageId) => {
    if (bookingId) {
      const b = bookings.find(x => x.id === bookingId);
      setSelectedBooking(b);
      return;
    }
    setSelectedBooking(null);
    if (startOfDay(date) < startOfMonth(new Date())) {
      return;
    }
    setDragSelection({ startDate: date, endDate: date, type, cottageId, itemIds: [itemId], startItemId: itemId });
  };

  const handleMouseEnter = (date, type, itemId, bookingId, cottageId) => {
    if (!dragSelection) return;
    if (dragSelection.type !== type || dragSelection.cottageId !== cottageId) return;
    if (bookingId) return;
    if (startOfDay(date) < startOfMonth(new Date())) return;
    
    let newItemIds = [...dragSelection.itemIds];
    if (type === 'Room') {
      const relevantRooms = rooms.filter(r => r.cottage_id === cottageId);
      const startIdx = relevantRooms.findIndex(r => r.id === dragSelection.startItemId);
      const currentIdx = relevantRooms.findIndex(r => r.id === itemId);
      if (startIdx !== -1 && currentIdx !== -1) {
        const minIdx = Math.min(startIdx, currentIdx);
        const maxIdx = Math.max(startIdx, currentIdx);
        newItemIds = relevantRooms.slice(minIdx, maxIdx + 1).map(r => r.id);
      }
    } else {
      newItemIds = [dragSelection.startItemId];
    }
    setDragSelection(prev => ({ ...prev, endDate: date, itemIds: newItemIds }));
  };

  const handleMouseUpWrapper = () => {
    if (!dragSelection) return;
    const datesArr = [dragSelection.startDate, dragSelection.endDate].sort((a,b) => a - b);
    const inDate = datesArr[0];
    const outDate = addDays(datesArr[1], 1);
    let prefill = {
       check_in_date: format(inDate, 'yyyy-MM-dd'),
       check_out_date: format(outDate, 'yyyy-MM-dd')
    };
    if (dragSelection.type === 'Property') {
      prefill.booking_type = 'Entire Property';
      prefill.cottage_id = dragSelection.cottageId;
    } else {
      prefill.booking_type = 'Room';
      prefill.cottage_id = dragSelection.cottageId;
      prefill.room_ids = dragSelection.itemIds;
      const propertyRooms = rooms.filter(r => r.cottage_id === dragSelection.cottageId);
      if (dragSelection.itemIds.length === propertyRooms.length && propertyRooms.length > 0) {
        prefill.booking_type = 'Entire Property';
        delete prefill.room_ids;
      }
    }
    setDragSelection(null);
    navigate('/bookings', { state: { prefill } });
  };

  if (loading) return <div>Loading...</div>;

  return (
    <div className="card" style={{ padding: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ padding: '1.5rem', borderBottom: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
          <h2 style={{ margin: 0 }}>Availability Timeline</h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <button className="btn btn-outline" style={{ padding: '0.4rem', color: 'var(--text-main)' }} onClick={() => setCurrentDate(subMonths(currentDate, 1))}><ChevronLeft size={20}/></button>
            <input type="month" className="form-input" style={{ width: 'auto', fontWeight: 'bold' }} value={format(currentDate, 'yyyy-MM')} onChange={e => { if(e.target.value) setCurrentDate(new Date(e.target.value + "-01T00:00:00")) }} />
            <button className="btn btn-outline" style={{ padding: '0.4rem', color: 'var(--text-main)' }} onClick={() => setCurrentDate(addMonths(currentDate, 1))}><ChevronRight size={20}/></button>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '1rem', fontSize: '0.875rem' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}><div style={{ width: 12, height: 12, background: 'var(--available)', borderRadius: '2px' }}/> Available</span>
          <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}><div style={{ width: 12, height: 12, background: 'var(--room-block)', borderRadius: '2px' }}/> Room Booked</span>
          <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}><div style={{ width: 12, height: 12, background: 'var(--cottage-block)', borderRadius: '2px' }}/> Property Booked</span>
          <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}><div style={{ width: 12, height: 12, background: 'var(--pending-block)', borderRadius: '2px' }}/> Pending</span>
        </div>
      </div>

      <div style={{ overflowX: 'auto', flex: 1, position: 'relative' }} onMouseUp={handleMouseUpWrapper} onMouseLeave={() => setDragSelection(null)}>
        <div style={{ display: 'inline-block', minWidth: '100%', userSelect: 'none' }}>
          <div style={{ display: 'flex', borderBottom: '2px solid var(--border)', background: 'var(--bg-color)', position: 'sticky', top: 0, zIndex: 10 }}>
            <div style={{ width: '200px', flexShrink: 0, padding: '1rem', fontWeight: 'bold', borderRight: '1px solid var(--border)', position: 'sticky', left: 0, background: 'inherit' }}>Unit</div>
            {dates.map((d, i) => (
              <div key={i} style={{ width: '50px', flexShrink: 0, padding: '0.5rem', textAlign: 'center', borderRight: '1px solid var(--border)', fontSize: '0.75rem', fontWeight: 'bold' }}>
                {format(d, 'ccc')}<br/>{format(d, 'dd')}
              </div>
            ))}
          </div>

          {cottages.map(c => (
            <React.Fragment key={c.id}>
              <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', background: 'rgba(0,0,0,0.02)' }}>
                <div style={{ width: '200px', flexShrink: 0, padding: '0.75rem 1rem', fontWeight: '600', borderRight: '1px solid var(--border)', position: 'sticky', left: 0, background: 'var(--bg-secondary)', zIndex: 5 }}>
                  {c.name}
                </div>
                {dates.map((d, i) => {
                  const { blockColor, label, bookingId } = getCellStatus(d, 'Property', c.id);
                  const isPast = startOfDay(d) < startOfMonth(new Date());
                  const isSelected = dragSelection && dragSelection.type === 'Property' && dragSelection.itemIds.includes(c.id) 
                    && d >= Math.min(dragSelection.startDate, dragSelection.endDate) 
                    && d <= Math.max(dragSelection.startDate, dragSelection.endDate);

                  return (
                    <div 
                      key={i} 
                      title={isPast ? 'Past Date' : (label || 'Available')} 
                      onMouseDown={() => handleMouseDown(d, 'Property', c.id, bookingId, c.id)}
                      onMouseEnter={() => handleMouseEnter(d, 'Property', c.id, bookingId, c.id)}
                      onDoubleClick={() => { if(bookingId) navigate('/bookings', { state: { editBookingId: bookingId } }); }}
                      style={{ 
                        width: '50px', flexShrink: 0, borderRight: '1px solid var(--border)', padding: '4px', cursor: isPast ? 'not-allowed' : (bookingId ? 'pointer' : 'crosshair')
                      }}
                    >
                      <div style={{ 
                        width: '100%', height: '100%', borderRadius: '4px', 
                        background: isSelected ? 'var(--primary)' : blockColor,
                        opacity: (isPast && !bookingId) ? 0.4 : 1,
                        filter: (isPast && !bookingId) ? 'grayscale(0.6)' : 'none',
                        transition: 'all 0.1s ease',
                        transform: isSelected ? 'scale(1.05)' : 'none'
                      }}></div>
                    </div>
                  );
                })}
              </div>

              {rooms.filter(r => r.cottage_id === c.id).map(r => (
                <div key={r.id} style={{ display: 'flex', borderBottom: '1px solid var(--border)' }}>
                  <div style={{ width: '200px', flexShrink: 0, padding: '0.5rem 1rem 0.5rem 2.5rem', fontSize: '0.875rem', borderRight: '1px solid var(--border)', position: 'sticky', left: 0, background: 'var(--bg-secondary)', zIndex: 5 }}>
                    ↳ {r.name}
                  </div>
                  {dates.map((d, i) => {
                    const { blockColor, label, bookingId } = getCellStatus(d, 'Room', r.id);
                    const isPast = startOfDay(d) < startOfMonth(new Date());
                    const isSelected = dragSelection && dragSelection.type === 'Room' && dragSelection.itemIds.includes(r.id) 
                      && d >= Math.min(dragSelection.startDate, dragSelection.endDate) 
                      && d <= Math.max(dragSelection.startDate, dragSelection.endDate);

                    return (
                      <div 
                        key={i} 
                        title={isPast ? 'Past Date' : (label || 'Available')} 
                        onMouseDown={() => handleMouseDown(d, 'Room', r.id, bookingId, r.cottage_id)}
                        onMouseEnter={() => handleMouseEnter(d, 'Room', r.id, bookingId, r.cottage_id)}
                        onDoubleClick={() => { if(bookingId) navigate('/bookings', { state: { editBookingId: bookingId } }); }}
                        style={{ 
                          width: '50px', flexShrink: 0, borderRight: '1px solid var(--border)', padding: '6px', cursor: isPast ? 'not-allowed' : (bookingId ? 'pointer' : 'crosshair')
                        }}
                      >
                        <div style={{ 
                          width: '100%', height: '100%', borderRadius: '4px', 
                          background: isSelected ? 'var(--primary)' : blockColor,
                          opacity: (isPast && !bookingId) ? 0.4 : 1,
                          filter: (isPast && !bookingId) ? 'grayscale(0.6)' : 'none',
                          transition: 'all 0.1s ease',
                          transform: isSelected ? 'scale(1.05)' : 'none'
                        }}></div>
                      </div>
                    );
                  })}
                </div>
              ))}
            </React.Fragment>
          ))}
        </div>
      </div>

      {/* Booking Details Panel */}
      {selectedBooking && (
        <div style={{ padding: '1.5rem', borderTop: '2px solid var(--border)', background: 'var(--bg-secondary)', animation: 'slideUp 0.3s ease' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
            <div>
              <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <User size={20} color="var(--primary)" /> {selectedBooking.guest_name}
              </h3>
              <small style={{ color: 'var(--text-muted)' }}>Ref: {selectedBooking.reference_number}</small>
            </div>
            <div className={`badge ${selectedBooking.status === 'Confirmed' ? 'badge-primary' : 'badge-warning'}`} style={{ fontSize: '0.75rem', padding: '0.3rem 0.6rem' }}>
              {selectedBooking.status}
            </div>
          </div>

          <div className="grid-4" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <div style={{ background: 'rgba(59, 130, 246, 0.1)', padding: '0.5rem', borderRadius: '8px' }}><Phone size={18} color="var(--primary)" /></div>
              <div><small style={{ display: 'block', color: 'var(--text-muted)', fontSize: '0.7rem' }}>Phone</small><strong>{selectedBooking.phone_number}</strong></div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <div style={{ background: 'rgba(16, 185, 129, 0.1)', padding: '0.5rem', borderRadius: '8px' }}><Calendar size={18} color="var(--success)" /></div>
              <div><small style={{ display: 'block', color: 'var(--text-muted)', fontSize: '0.7rem' }}>Stay Period</small><strong>{new Date(selectedBooking.check_in_date).toLocaleDateString()} - {new Date(selectedBooking.check_out_date).toLocaleDateString()}</strong></div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <div style={{ background: 'rgba(245, 158, 11, 0.1)', padding: '0.5rem', borderRadius: '8px' }}><Users size={18} color="var(--warning)" /></div>
              <div><small style={{ display: 'block', color: 'var(--text-muted)', fontSize: '0.7rem' }}>Occupants</small><strong>{selectedBooking.number_of_guests || 1} Pax</strong></div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <div style={{ background: 'rgba(139, 92, 246, 0.1)', padding: '0.5rem', borderRadius: '8px' }}><MapPin size={18} color="var(--indigo)" /></div>
              <div><small style={{ display: 'block', color: 'var(--text-muted)', fontSize: '0.7rem' }}>Property</small><strong>{cottages.find(c => c.id === selectedBooking.cottage_id)?.name || 'N/A'}</strong></div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '2rem', marginTop: '1rem', padding: '1rem', background: 'rgba(0,0,0,0.02)', borderRadius: '8px', border: '1px solid var(--border)' }}>
            {selectedBooking.vehicle_number && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Car size={16} color="var(--text-muted)" /> <small>Vehicle:</small> <strong>{selectedBooking.vehicle_number}</strong>
              </div>
            )}
            {selectedBooking.id_proof_number && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <IdCard size={16} color="var(--text-muted)" /> <small>{selectedBooking.id_proof_type}:</small> <strong>{selectedBooking.id_proof_number}</strong>
              </div>
            )}
            {selectedBooking.booking_source && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Globe size={16} color="var(--text-muted)" /> <small>Source:</small> <strong>{selectedBooking.booking_source}</strong>
              </div>
            )}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginLeft: 'auto' }}>
              <span style={{ fontSize: '0.875rem' }}>Total Amount: <strong style={{ color: 'var(--primary)' }}>₹{selectedBooking.total_amount}</strong></span>
              <button 
                className="btn btn-outline" 
                style={{ fontSize: '0.75rem', padding: '0.3rem 0.6rem', marginLeft: '1rem' }}
                onClick={() => navigate('/bookings', { state: { editBookingId: selectedBooking.id } })}
              >
                View Full Details
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
