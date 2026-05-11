import React, { useState, useEffect, useMemo } from 'react';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { addDays, format, differenceInDays, isWithinInterval, startOfDay, startOfMonth, endOfMonth, addMonths, subMonths, eachDayOfInterval, isSameDay, startOfWeek, endOfWeek } from 'date-fns';
import { ChevronLeft, ChevronRight, User, Phone, Calendar, Car, IdCard, Users, CheckCircle2, Clock, MapPin, Globe, LayoutGrid, List, Columns } from 'lucide-react';
import { useSettingsStore } from '../lib/store';
import { useNavigate } from 'react-router-dom';

export default function CalendarView() {
  const navigate = useNavigate();
  const { activeResortId } = useSettingsStore();
  const [bookings, setBookings] = useState([]);
  const [cottages, setCottages] = useState([]);
  const [rooms, setRooms] = useState([]);
  const [loading, setLoading] = useState(true);

  const [viewType, setViewType] = useState('timeline'); // 'timeline', 'monthly', 'agenda'
  const [currentDate, setCurrentDate] = useState(startOfMonth(new Date()));
  const [dragSelection, setDragSelection] = useState(null);
  const [selectedBooking, setSelectedBooking] = useState(null);

  const dates = useMemo(() => eachDayOfInterval({ start: startOfMonth(currentDate), end: endOfMonth(currentDate) }), [currentDate]);

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
    let blockColor = 'var(--available)'; 
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
    if (startOfDay(date) < startOfMonth(new Date())) return;
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
    }
    setDragSelection(null);
    navigate('/bookings/new', { state: { prefill } });
  };

  if (loading) return <div>Loading...</div>;

  return (
    <div className="card" style={{ padding: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column', height: '100%', minHeight: '80vh' }}>
      <div style={{ padding: '1.5rem', borderBottom: '1px solid var(--border)', background: 'var(--bg-secondary)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
             <h2 style={{ margin: 0 }}>Availability</h2>
             <div className="view-switcher" style={{ display: 'flex', background: 'var(--bg-color)', padding: '0.2rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)' }}>
                <button onClick={() => setViewType('timeline')} style={{ padding: '0.4rem 0.8rem', border: 'none', borderRadius: 'var(--radius-md)', background: viewType === 'timeline' ? 'var(--primary)' : 'transparent', color: viewType === 'timeline' ? 'white' : 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.4rem', fontWeight: 600, fontSize: '0.85rem' }}>
                    <Columns size={16} /> Timeline
                </button>
                <button onClick={() => setViewType('monthly')} style={{ padding: '0.4rem 0.8rem', border: 'none', borderRadius: 'var(--radius-md)', background: viewType === 'monthly' ? 'var(--primary)' : 'transparent', color: viewType === 'monthly' ? 'white' : 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.4rem', fontWeight: 600, fontSize: '0.85rem' }}>
                    <LayoutGrid size={16} /> Month
                </button>
                <button onClick={() => setViewType('agenda')} style={{ padding: '0.4rem 0.8rem', border: 'none', borderRadius: 'var(--radius-md)', background: viewType === 'agenda' ? 'var(--primary)' : 'transparent', color: viewType === 'agenda' ? 'white' : 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.4rem', fontWeight: 600, fontSize: '0.85rem' }}>
                    <List size={16} /> Agenda
                </button>
             </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <button className="btn btn-outline" style={{ padding: '0.4rem' }} onClick={() => setCurrentDate(subMonths(currentDate, 1))}><ChevronLeft size={20}/></button>
            <input type="month" className="form-input" style={{ width: 'auto', fontWeight: 'bold' }} value={format(currentDate, 'yyyy-MM')} onChange={e => { if(e.target.value) setCurrentDate(new Date(e.target.value + "-01T00:00:00")) }} />
            <button className="btn btn-outline" style={{ padding: '0.4rem' }} onClick={() => setCurrentDate(addMonths(currentDate, 1))}><ChevronRight size={20}/></button>
          </div>
        </div>
      </div>

      {/* RENDER VIEWS */}
      <div style={{ flex: 1, overflow: 'auto' }}>
        {viewType === 'timeline' && (
          <div style={{ overflowX: 'auto' }} onMouseUp={handleMouseUpWrapper} onMouseLeave={() => setDragSelection(null)}>
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
                    <div style={{ width: '200px', flexShrink: 0, padding: '0.75rem 1rem', fontWeight: '600', borderRight: '1px solid var(--border)', position: 'sticky', left: 0, background: 'var(--bg-secondary)', zIndex: 5 }}>{c.name}</div>
                    {dates.map((d, i) => {
                      const { blockColor, label, bookingId } = getCellStatus(d, 'Property', c.id);
                      const isPast = startOfDay(d) < startOfMonth(new Date());
                      const isSelected = dragSelection?.type === 'Property' && dragSelection.itemIds.includes(c.id) && d >= Math.min(dragSelection.startDate, dragSelection.endDate) && d <= Math.max(dragSelection.startDate, dragSelection.endDate);
                      return (
                        <div key={i} title={label || 'Available'} onMouseDown={() => handleMouseDown(d, 'Property', c.id, bookingId, c.id)} onMouseEnter={() => handleMouseEnter(d, 'Property', c.id, bookingId, c.id)} onDoubleClick={() => bookingId && navigate(`/bookings/edit/${bookingId}`)} style={{ width: '50px', flexShrink: 0, borderRight: '1px solid var(--border)', padding: '4px', cursor: isPast ? 'not-allowed' : 'pointer' }}>
                          <div style={{ width: '100%', height: '100%', borderRadius: '4px', background: isSelected ? 'var(--primary)' : blockColor, opacity: (isPast && !bookingId) ? 0.4 : 1 }}></div>
                        </div>
                      );
                    })}
                  </div>
                  {rooms.filter(r => r.cottage_id === c.id).map(r => (
                    <div key={r.id} style={{ display: 'flex', borderBottom: '1px solid var(--border)' }}>
                      <div style={{ width: '200px', flexShrink: 0, padding: '0.5rem 1rem 0.5rem 2.5rem', fontSize: '0.875rem', borderRight: '1px solid var(--border)', position: 'sticky', left: 0, background: 'var(--bg-secondary)', zIndex: 5 }}>↳ {r.name}</div>
                      {dates.map((d, i) => {
                        const { blockColor, label, bookingId } = getCellStatus(d, 'Room', r.id);
                        const isPast = startOfDay(d) < startOfMonth(new Date());
                        const isSelected = dragSelection?.type === 'Room' && dragSelection.itemIds.includes(r.id) && d >= Math.min(dragSelection.startDate, dragSelection.endDate) && d <= Math.max(dragSelection.startDate, dragSelection.endDate);
                        return (
                          <div key={i} title={label || 'Available'} onMouseDown={() => handleMouseDown(d, 'Room', r.id, bookingId, r.cottage_id)} onMouseEnter={() => handleMouseEnter(d, 'Room', r.id, bookingId, r.cottage_id)} onDoubleClick={() => bookingId && navigate(`/bookings/edit/${bookingId}`)} style={{ width: '50px', flexShrink: 0, borderRight: '1px solid var(--border)', padding: '6px', cursor: isPast ? 'not-allowed' : 'pointer' }}>
                            <div style={{ width: '100%', height: '100%', borderRadius: '4px', background: isSelected ? 'var(--primary)' : blockColor, opacity: (isPast && !bookingId) ? 0.4 : 1 }}></div>
                          </div>
                        );
                      })}
                    </div>
                  ))}
                </React.Fragment>
              ))}
            </div>
          </div>
        )}

        {viewType === 'monthly' && (
          <div style={{ padding: '1rem' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', border: '1px solid var(--border)', borderRadius: '8px', overflow: 'hidden' }}>
              {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
                <div key={day} style={{ padding: '1rem', background: 'var(--bg-secondary)', fontWeight: 'bold', textAlign: 'center', borderBottom: '1px solid var(--border)', borderRight: '1px solid var(--border)' }}>{day}</div>
              ))}
              {(() => {
                const start = startOfWeek(startOfMonth(currentDate));
                const end = endOfWeek(endOfMonth(currentDate));
                const calendarDates = eachDayOfInterval({ start, end });
                return calendarDates.map(d => {
                  const isCurrentMonth = d.getMonth() === currentDate.getMonth();
                  const dayBookings = bookings.filter(b => isWithinInterval(d, { start: startOfDay(new Date(b.check_in_date)), end: startOfDay(new Date(b.check_out_date)) }));
                  return (
                    <div key={d.toString()} style={{ minHeight: '120px', padding: '0.5rem', background: isCurrentMonth ? 'white' : 'rgba(0,0,0,0.02)', borderRight: '1px solid var(--border)', borderBottom: '1px solid var(--border)', opacity: isCurrentMonth ? 1 : 0.5 }}>
                      <div style={{ fontWeight: 'bold', marginBottom: '0.5rem' }}>{format(d, 'd')}</div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                        {dayBookings.slice(0, 3).map(b => (
                          <div key={b.id} onClick={() => setSelectedBooking(b)} style={{ fontSize: '0.7rem', padding: '0.2rem 0.4rem', borderRadius: '4px', background: b.status === 'Checked-in' ? 'rgba(99, 102, 241, 0.1)' : 'rgba(16, 185, 129, 0.1)', color: b.status === 'Checked-in' ? '#6366f1' : '#10b981', borderLeft: `3px solid ${b.status === 'Checked-in' ? '#6366f1' : '#10b981'}`, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', cursor: 'pointer' }}>
                            {b.guest_name}
                          </div>
                        ))}
                        {dayBookings.length > 3 && <small style={{ color: 'var(--text-muted)' }}>+ {dayBookings.length - 3} more</small>}
                      </div>
                    </div>
                  );
                });
              })()}
            </div>
          </div>
        )}

        {viewType === 'agenda' && (
          <div style={{ padding: '1rem' }}>
             <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
               {bookings.filter(b => new Date(b.check_in_date) >= startOfMonth(currentDate) && new Date(b.check_in_date) <= endOfMonth(currentDate)).sort((a,b) => new Date(a.check_in_date) - new Date(b.check_in_date)).map(b => (
                 <div key={b.id} className="card" onClick={() => setSelectedBooking(b)} style={{ padding: '1rem', cursor: 'pointer', borderLeft: `6px solid ${b.status === 'Checked-in' ? '#6366f1' : '#3b82f6'}` }}>
                   <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <div>
                        <div style={{ fontWeight: 'bold', fontSize: '1.1rem' }}>{b.guest_name}</div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                          <Calendar size={14} /> {format(new Date(b.check_in_date), 'dd MMM')} - {format(new Date(b.check_out_date), 'dd MMM yyyy')}
                        </div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <span style={{ padding: '0.3rem 0.8rem', borderRadius: '20px', fontSize: '0.75rem', fontWeight: 'bold', background: 'rgba(0,0,0,0.05)' }}>{b.status}</span>
                        <div style={{ marginTop: '0.5rem', fontWeight: 'bold', color: 'var(--primary)' }}>₹{b.total_amount}</div>
                      </div>
                   </div>
                 </div>
               ))}
               {bookings.length === 0 && <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>No bookings for this month.</div>}
             </div>
          </div>
        )}
      </div>

      {/* Details Panel */}
      {selectedBooking && (
        <div style={{ padding: '1.5rem', borderTop: '2px solid var(--border)', background: 'var(--bg-secondary)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
            <div>
              <h3 style={{ margin: 0 }}>{selectedBooking.guest_name}</h3>
              <small style={{ color: 'var(--text-muted)' }}>Ref: {selectedBooking.reference_number}</small>
            </div>
            <button className="btn btn-outline" style={{ color: 'var(--danger)' }} onClick={() => setSelectedBooking(null)}><X size={16}/></button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}><Phone size={18} color="var(--primary)" /> <strong>{selectedBooking.phone_number}</strong></div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}><Calendar size={18} color="var(--success)" /> <strong>{format(new Date(selectedBooking.check_in_date), 'dd MMM')} - {format(new Date(selectedBooking.check_out_date), 'dd MMM')}</strong></div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}><Home size={18} color="var(--warning)" /> <strong>{cottages.find(c => c.id === selectedBooking.cottage_id)?.name}</strong></div>
            <button className="btn btn-primary" style={{ width: '100%' }} onClick={() => navigate(`/bookings/edit/${selectedBooking.id}`)}>Edit Booking</button>
          </div>
        </div>
      )}
    </div>
  );
}
