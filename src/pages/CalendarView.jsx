import React, { useState, useEffect } from 'react';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { addDays, format, differenceInDays, isWithinInterval, startOfDay, startOfMonth, endOfMonth, addMonths, subMonths, eachDayOfInterval } from 'date-fns';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useSettingsStore } from '../lib/store';

export default function CalendarView() {
  const { activeResortId } = useSettingsStore();
  const [bookings, setBookings] = useState([]);
  const [cottages, setCottages] = useState([]);
  const [rooms, setRooms] = useState([]);
  const [loading, setLoading] = useState(true);

  const [currentDate, setCurrentDate] = useState(startOfMonth(new Date()));

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

    for (let b of bookings) {
      const bIn = startOfDay(new Date(b.check_in_date));
      const bOut = startOfDay(new Date(b.check_out_date));
      
      // If date is within CheckIn <= date < CheckOut
      // CheckOut day is technically free to check in, so we only block if date < CheckOut
      if (date >= bIn && date < bOut) {
        if (type === 'Property') {
          // If this property corresponds
          if (b.cottage_id === itemId) {
            isBooked = true;
            blockColor = b.booking_type === 'Entire Property' ? 'var(--cottage-block)' : 'var(--room-block)';
            label = b.guest_name;
            break; // Highest precedence
          }
        } else if (type === 'Room') {
          const room = rooms.find(r => r.id === itemId);
          if (b.cottage_id === room?.cottage_id) {
            if (b.booking_type === 'Entire Property') {
              isBooked = true;
              blockColor = 'var(--cottage-block)'; // Blocked transitively
              label = b.guest_name;
            } else {
              const bRooms = b.room_ids || (b.room_id ? [b.room_id] : []);
              if (bRooms.includes(itemId)) {
                isBooked = true;
                blockColor = 'var(--room-block)';
                label = b.guest_name;
              }
            }
          }
        }
      }
    }

    return { isBooked, blockColor, label };
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
        </div>
      </div>

      <div style={{ overflowX: 'auto', flex: 1, position: 'relative' }}>
        <div style={{ display: 'inline-block', minWidth: '100%' }}>
          {/* Header Row */}
          <div style={{ display: 'flex', borderBottom: '2px solid var(--border)', background: 'var(--bg-color)', position: 'sticky', top: 0, zIndex: 10 }}>
            <div style={{ width: '200px', flexShrink: 0, padding: '1rem', fontWeight: 'bold', borderRight: '1px solid var(--border)', position: 'sticky', left: 0, background: 'inherit' }}>Unit</div>
            {dates.map((d, i) => (
              <div key={i} style={{ width: '50px', flexShrink: 0, padding: '0.5rem', textAlign: 'center', borderRight: '1px solid var(--border)', fontSize: '0.75rem', fontWeight: 'bold' }}>
                {format(d, 'ccc')}<br/>{format(d, 'dd')}
              </div>
            ))}
          </div>

          {/* Rows */}
          {cottages.map(c => (
            <React.Fragment key={c.id}>
              {/* Cottage Row */}
              <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', background: 'rgba(0,0,0,0.02)' }}>
                <div style={{ width: '200px', flexShrink: 0, padding: '0.75rem 1rem', fontWeight: '600', borderRight: '1px solid var(--border)', position: 'sticky', left: 0, background: 'var(--bg-secondary)', zIndex: 5 }}>
                  {c.name}
                </div>
                {dates.map((d, i) => {
                  const { blockColor, label } = getCellStatus(d, 'Property', c.id);
                  return (
                    <div key={i} title={label} style={{ width: '50px', flexShrink: 0, borderRight: '1px solid var(--border)', padding: '4px' }}>
                      <div style={{ width: '100%', height: '100%', borderRadius: '4px', background: blockColor }}></div>
                    </div>
                  );
                })}
              </div>

              {/* Its Rooms Rows */}
              {rooms.filter(r => r.cottage_id === c.id).map(r => (
                <div key={r.id} style={{ display: 'flex', borderBottom: '1px solid var(--border)' }}>
                  <div style={{ width: '200px', flexShrink: 0, padding: '0.5rem 1rem 0.5rem 2.5rem', fontSize: '0.875rem', borderRight: '1px solid var(--border)', position: 'sticky', left: 0, background: 'var(--bg-secondary)', zIndex: 5 }}>
                    ↳ {r.name}
                  </div>
                  {dates.map((d, i) => {
                    const { blockColor, label } = getCellStatus(d, 'Room', r.id);
                    return (
                      <div key={i} title={label} style={{ width: '50px', flexShrink: 0, borderRight: '1px solid var(--border)', padding: '6px' }}>
                        <div style={{ width: '100%', height: '100%', borderRadius: '4px', background: blockColor }}></div>
                      </div>
                    );
                  })}
                </div>
              ))}
            </React.Fragment>
          ))}
        </div>
      </div>
    </div>
  );
}
