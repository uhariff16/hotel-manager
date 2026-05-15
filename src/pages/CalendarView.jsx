import React, { useState, useEffect, useMemo, useRef } from 'react';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { addDays, format, differenceInDays, isWithinInterval, startOfDay, startOfMonth, endOfMonth, addMonths, subMonths, eachDayOfInterval, isSameDay, startOfWeek, endOfWeek, isToday } from 'date-fns';
import { ChevronLeft, ChevronRight, User, Phone, Calendar, Car, IdCard, Users, CheckCircle2, Clock, MapPin, Globe, LayoutGrid, List, Columns, Info, Search, X, Home, Navigation, Map, Edit2 } from 'lucide-react';
import { useSettingsStore } from '../lib/store';
import { useNavigate } from 'react-router-dom';
import CalendarTooltip from '../components/CalendarTooltip';
import * as XLSX from 'xlsx';

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
  const [searchTerm, setSearchTerm] = useState('');
  
  const [hoveredBooking, setHoveredBooking] = useState(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });
  
  const timelineRef = useRef(null);

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
    let booking = null;

    for (let b of bookings) {
      const bIn = startOfDay(new Date(b.check_in_date));
      const bOut = startOfDay(new Date(b.check_out_date));
      
      if (date >= bIn && date < bOut) {
        if (type === 'Property') {
          if (b.cottage_id === itemId) {
            isBooked = true;
            bookingId = b.id;
            booking = b;
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
              booking = b;
              blockColor = b.status === 'Pending' ? 'var(--pending-block)' : 'var(--cottage-block)';
              label = `${b.guest_name}\nRef: ${b.reference_number || 'N/A'}\nStatus: ${b.status}`;
            } else {
              const bRooms = b.room_ids || (b.room_id ? [b.room_id] : []);
              if (bRooms.includes(itemId)) {
                isBooked = true;
                bookingId = b.id;
                booking = b;
                blockColor = b.status === 'Pending' ? 'var(--pending-block)' : 'var(--room-block)';
                label = `${b.guest_name}\nRef: ${b.reference_number || 'N/A'}\nStatus: ${b.status}`;
              }
            }
          }
        }
      }
    }

    return { isBooked, blockColor, label, bookingId, booking };
  };

  const handleMouseDown = (date, type, itemId, bookingId, cottageId) => {
    if (bookingId) {
      const b = bookings.find(x => x.id === bookingId);
      setSelectedBooking(b);
      return;
    }
    setSelectedBooking(null);
    if (startOfDay(date) < startOfDay(new Date())) return; // Can't book in past (relaxed from startOfMonth to startOfDay)
    setDragSelection({ startDate: date, endDate: date, type, cottageId, itemIds: [itemId], startItemId: itemId });
  };

  const handleMouseEnter = (e, date, type, itemId, bookingId, cottageId) => {
    if (bookingId) {
        const b = bookings.find(x => x.id === bookingId);
        setHoveredBooking(b);
        setTooltipPos({ x: e.clientX, y: e.clientY });
    } else {
        setHoveredBooking(null);
    }

    if (!dragSelection) return;
    if (dragSelection.type !== type || dragSelection.cottageId !== cottageId) return;
    if (bookingId) return;
    if (startOfDay(date) < startOfDay(new Date())) return;
    
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

  const goToToday = () => {
    setCurrentDate(startOfMonth(new Date()));
    // Optionally scroll to today in timeline
  };

  const filteredBookings = useMemo(() => {
    if (!searchTerm) return bookings;
    return bookings.filter(b => 
      b.guest_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (b.reference_number || '').toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [bookings, searchTerm]);

  const occupancyStats = useMemo(() => {
    const today = new Date();
    today.setHours(0,0,0,0);
    
    const totalUnits = cottages.length + rooms.length;
    const todayBookings = bookings.filter(b => {
        if (b.status === 'Cancelled') return false;
        const start = new Date(b.check_in_date);
        const end = new Date(b.check_out_date);
        start.setHours(0,0,0,0);
        end.setHours(0,0,0,0);
        return today >= start && today < end;
    });
    
    const occupiedUnits = todayBookings.reduce((acc, b) => {
        if (b.booking_type === 'Entire Property') {
            const cottageRooms = rooms.filter(r => r.cottage_id === b.cottage_id).length;
            return acc + 1 + cottageRooms;
        } else {
            return acc + (b.room_ids?.length || 1);
        }
    }, 0);

    return {
        occupied: todayBookings.length,
        percent: totalUnits > 0 ? Math.round((occupiedUnits / totalUnits) * 100) : 0,
        arrivals: bookings.filter(b => isSameDay(new Date(b.check_in_date), today) && b.status !== 'Cancelled').length,
        departures: bookings.filter(b => isSameDay(new Date(b.check_out_date), today) && b.status !== 'Cancelled').length
    };
  }, [bookings, cottages, rooms]);

  const handleExport = () => {
    const exportData = bookings.map(b => ({
      'Guest Name': b.guest_name,
      'Phone': b.phone_number,
      'Check-in': b.check_in_date,
      'Check-out': b.check_out_date,
      'Reference': b.reference_number,
      'Status': b.status,
      'Total Amount': b.total_amount,
      'Type': b.booking_type,
      'Property': cottages.find(c => c.id === b.cottage_id)?.name || 'N/A'
    }));

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Bookings');
    XLSX.writeFile(wb, `Bookings_Calendar_Export_${format(new Date(), 'yyyy-MM-dd')}.xlsx`);
  };

  if (loading) return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '80vh', gap: '1rem', color: 'var(--text-muted)' }}><Clock className="animate-spin" /> Loading Availability...</div>;

  const legendItems = [
    { label: 'Available', color: 'var(--available)' },
    { label: 'Entire Property', color: 'var(--cottage-block)' },
    { label: 'Room Booking', color: 'var(--room-block)' },
    { label: 'Pending', color: 'var(--pending-block)' },
    { label: 'Selected', color: 'var(--primary)' },
  ];

  return (
    <div className="calendar-page" style={{ height: '100%', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      
      {/* HEADER SECTION */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: '1.5rem' }}>
        <div style={{ display: 'flex', gap: '2rem', alignItems: 'center' }}>
          <div>
            <h1 style={{ fontSize: '2.25rem', marginBottom: '0.5rem', fontWeight: 800 }}>Availability Calendar</h1>
            <p style={{ color: 'var(--text-muted)', margin: 0 }}>Monitor and manage resort occupancy across all units</p>
          </div>
          
          <div style={{ display: 'flex', gap: '1rem', padding: '0.75rem 1.5rem', background: 'var(--bg-secondary)', borderRadius: '20px', border: '1px solid var(--border)', boxShadow: 'var(--shadow-sm)' }}>
             <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '0.65rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Occupancy</div>
                <div style={{ fontSize: '1.1rem', fontWeight: 900, color: 'var(--primary)' }}>{occupancyStats.percent}%</div>
             </div>
             <div style={{ width: '1px', background: 'var(--border)' }}></div>
             <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '0.65rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Arrivals</div>
                <div style={{ fontSize: '1.1rem', fontWeight: 900, color: '#6366f1' }}>{occupancyStats.arrivals}</div>
             </div>
             <div style={{ width: '1px', background: 'var(--border)' }}></div>
             <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '0.65rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Departures</div>
                <div style={{ fontSize: '1.1rem', fontWeight: 900, color: 'var(--warning)' }}>{occupancyStats.departures}</div>
             </div>
          </div>
        </div>
        
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
           <div className="search-bar" style={{ position: 'relative', width: '300px' }}>
              <Search size={18} style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
              <input 
                type="text" 
                className="form-input" 
                placeholder="Find guest or reference..." 
                value={searchTerm} 
                onChange={e => setSearchTerm(e.target.value)}
                style={{ paddingLeft: '2.75rem', height: '44px', background: 'var(--bg-secondary)', border: '1px solid var(--border)' }}
              />
           </div>
           <button className="btn btn-primary" onClick={() => navigate('/bookings/new')} style={{ height: '44px' }}>
             <Calendar size={18} /> New Booking
           </button>
        </div>
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column', flex: 1, minHeight: '70vh', border: '1px solid var(--border)', boxShadow: 'var(--shadow-lg)' }}>
        
        {/* CONTROL BAR */}
        <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border)', background: 'var(--bg-secondary)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
             <button className="btn btn-outline" onClick={handleExport} style={{ height: '38px', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Globe size={16} /> Export Excel
             </button>
             <div className="view-switcher" style={{ display: 'flex', background: 'var(--bg-color)', padding: '0.25rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)' }}>
                <button onClick={() => setViewType('timeline')} style={{ padding: '0.5rem 1rem', border: 'none', borderRadius: 'var(--radius-md)', background: viewType === 'timeline' ? 'var(--primary)' : 'transparent', color: viewType === 'timeline' ? 'white' : 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 700, fontSize: '0.85rem', transition: 'all 0.2s' }}>
                    <Columns size={16} /> Timeline
                </button>
                <button onClick={() => setViewType('monthly')} style={{ padding: '0.5rem 1rem', border: 'none', borderRadius: 'var(--radius-md)', background: viewType === 'monthly' ? 'var(--primary)' : 'transparent', color: viewType === 'monthly' ? 'white' : 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 700, fontSize: '0.85rem', transition: 'all 0.2s' }}>
                    <LayoutGrid size={16} /> Month
                </button>
                <button onClick={() => setViewType('agenda')} style={{ padding: '0.5rem 1rem', border: 'none', borderRadius: 'var(--radius-md)', background: viewType === 'agenda' ? 'var(--primary)' : 'transparent', color: viewType === 'agenda' ? 'white' : 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 700, fontSize: '0.85rem', transition: 'all 0.2s' }}>
                    <List size={16} /> Agenda
                </button>
             </div>

             <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                {legendItems.map(item => (
                    <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)' }}>
                        <div style={{ width: '12px', height: '12px', borderRadius: '3px', background: item.color }}></div>
                        {item.label}
                    </div>
                ))}
             </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <button className="btn btn-outline" style={{ padding: '0.5rem', height: '38px', minWidth: '38px' }} onClick={() => setCurrentDate(subMonths(currentDate, 1))}><ChevronLeft size={20}/></button>
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
               <input type="month" className="form-input" style={{ width: '160px', fontWeight: '800', height: '38px', paddingRight: '2.5rem' }} value={format(currentDate, 'yyyy-MM')} onChange={e => { if(e.target.value) setCurrentDate(new Date(e.target.value + "-01T00:00:00")) }} />
            </div>
            <button className="btn btn-outline" style={{ padding: '0.5rem', height: '38px', minWidth: '38px' }} onClick={() => setCurrentDate(addMonths(currentDate, 1))}><ChevronRight size={20}/></button>
            <button className="btn btn-outline" style={{ height: '38px', fontSize: '0.85rem', fontWeight: 700, padding: '0 1rem' }} onClick={goToToday}>Today</button>
          </div>
        </div>

        {/* RENDER VIEWS */}
        <div style={{ flex: 1, overflow: 'auto', background: 'var(--bg-color)' }}>
          {viewType === 'timeline' && (
            <div ref={timelineRef} style={{ overflowX: 'auto', height: '100%' }} onMouseUp={handleMouseUpWrapper} onMouseLeave={() => { setDragSelection(null); setHoveredBooking(null); }}>
              <div style={{ display: 'inline-block', minWidth: '100%', userSelect: 'none' }}>
                <div style={{ display: 'flex', borderBottom: '2px solid var(--border)', background: 'var(--bg-secondary)', position: 'sticky', top: 0, zIndex: 20 }}>
                  <div style={{ width: '220px', flexShrink: 0, padding: '1rem', fontWeight: '800', borderRight: '1px solid var(--border)', position: 'sticky', left: 0, background: 'inherit', color: 'var(--primary)', textTransform: 'uppercase', letterSpacing: '0.05em', fontSize: '0.75rem' }}>Units / Rooms</div>
                  {dates.map((d, i) => {
                    const isTodayDate = isToday(d);
                    return (
                      <div key={i} style={{ width: '54px', flexShrink: 0, padding: '0.75rem 0', textAlign: 'center', borderRight: '1px solid var(--border)', background: isTodayDate ? 'rgba(5, 150, 105, 0.08)' : 'inherit' }}>
                        <div style={{ fontSize: '0.65rem', fontWeight: 800, color: isTodayDate ? 'var(--primary)' : 'var(--text-muted)', textTransform: 'uppercase' }}>{format(d, 'eee')}</div>
                        <div style={{ fontSize: '1rem', fontWeight: 800, color: isTodayDate ? 'var(--primary)' : 'var(--text-main)' }}>{format(d, 'dd')}</div>
                      </div>
                    );
                  })}
                </div>

                {cottages.map(c => (
                  <React.Fragment key={c.id}>
                    {/* Cottage Row */}
                    <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', background: 'var(--bg-secondary)' }}>
                      <div style={{ width: '220px', flexShrink: 0, padding: '1rem', fontWeight: '700', borderRight: '1px solid var(--border)', position: 'sticky', left: 0, background: 'var(--bg-secondary)', zIndex: 10, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                         <Home size={16} color="var(--primary)" /> {c.name}
                      </div>
                      {dates.map((d, i) => {
                        const { blockColor, label, bookingId, booking } = getCellStatus(d, 'Property', c.id);
                        const isPast = startOfDay(d) < startOfDay(new Date());
                        const isSelected = dragSelection?.type === 'Property' && dragSelection.itemIds.includes(c.id) && d >= Math.min(dragSelection.startDate, dragSelection.endDate) && d <= Math.max(dragSelection.startDate, dragSelection.endDate);
                        const isHighlighted = hoveredBooking?.id === bookingId && bookingId !== null;
                        const isSearchMatch = searchTerm && booking && (booking.guest_name.toLowerCase().includes(searchTerm.toLowerCase()) || (booking.reference_number || '').toLowerCase().includes(searchTerm.toLowerCase()));

                        return (
                          <div key={i} 
                               onMouseDown={() => handleMouseDown(d, 'Property', c.id, bookingId, c.id)} 
                               onClick={() => bookingId && setSelectedBooking(bookings.find(x => x.id === bookingId))}
                               onMouseEnter={(e) => handleMouseEnter(e, d, 'Property', c.id, bookingId, c.id)} 
                               onDoubleClick={() => bookingId && navigate(`/bookings/edit/${bookingId}`)} 
                               style={{ width: '54px', flexShrink: 0, borderRight: '1px solid var(--border)', padding: '5px', cursor: isPast && !bookingId ? 'not-allowed' : 'pointer', background: isToday(d) ? 'rgba(5, 150, 105, 0.03)' : 'transparent', transition: 'all 0.2s' }}>
                            <div style={{ 
                                width: '100%', height: '34px', borderRadius: '6px', 
                                background: isSelected ? 'var(--primary)' : blockColor, 
                                opacity: (isPast && !bookingId) ? 0.3 : 1,
                                border: isHighlighted ? '2px solid white' : (isSearchMatch ? '3px solid var(--warning)' : 'none'),
                                boxShadow: isHighlighted ? '0 0 10px rgba(0,0,0,0.2)' : 'none',
                                transform: isHighlighted ? 'scale(1.1)' : 'scale(1)',
                                zIndex: isHighlighted ? 15 : 1,
                                position: 'relative'
                            }}>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    
                    {/* Room Rows */}
                    {rooms.filter(r => r.cottage_id === c.id).map(r => (
                      <div key={r.id} style={{ display: 'flex', borderBottom: '1px solid var(--border)', background: 'var(--bg-color)' }}>
                        <div style={{ width: '220px', flexShrink: 0, padding: '0.75rem 1rem 0.75rem 3rem', fontSize: '0.85rem', fontWeight: 600, borderRight: '1px solid var(--border)', position: 'sticky', left: 0, background: 'var(--bg-color)', zIndex: 10, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                           <Navigation size={12} style={{ transform: 'rotate(90deg)' }} /> {r.name}
                        </div>
                        {dates.map((d, i) => {
                          const { blockColor, label, bookingId, booking } = getCellStatus(d, 'Room', r.id);
                          const isPast = startOfDay(d) < startOfDay(new Date());
                          const isSelected = dragSelection?.type === 'Room' && dragSelection.itemIds.includes(r.id) && d >= Math.min(dragSelection.startDate, dragSelection.endDate) && d <= Math.max(dragSelection.startDate, dragSelection.endDate);
                          const isHighlighted = hoveredBooking?.id === bookingId && bookingId !== null;
                          const isSearchMatch = searchTerm && booking && (booking.guest_name.toLowerCase().includes(searchTerm.toLowerCase()) || (booking.reference_number || '').toLowerCase().includes(searchTerm.toLowerCase()));

                          return (
                            <div key={i} 
                                 onMouseDown={() => handleMouseDown(d, 'Room', r.id, bookingId, r.cottage_id)} 
                                 onClick={() => bookingId && setSelectedBooking(bookings.find(x => x.id === bookingId))}
                                 onMouseEnter={(e) => handleMouseEnter(e, d, 'Room', r.id, bookingId, r.cottage_id)} 
                                 onDoubleClick={() => bookingId && navigate(`/bookings/edit/${bookingId}`)} 
                                 style={{ width: '54px', flexShrink: 0, borderRight: '1px solid var(--border)', padding: '6px', cursor: isPast && !bookingId ? 'not-allowed' : 'pointer', background: isToday(d) ? 'rgba(5, 150, 105, 0.03)' : 'transparent' }}>
                              <div style={{ 
                                  width: '100%', height: '28px', borderRadius: '5px', 
                                  background: isSelected ? 'var(--primary)' : blockColor, 
                                  opacity: (isPast && !bookingId) ? 0.3 : 1,
                                  border: isHighlighted ? '2px solid white' : (isSearchMatch ? '3px solid var(--warning)' : 'none'),
                                  boxShadow: isHighlighted ? '0 0 10px rgba(0,0,0,0.2)' : 'none',
                                  transform: isHighlighted ? 'scale(1.1)' : 'scale(1)',
                                  zIndex: isHighlighted ? 15 : 1,
                                  position: 'relative'
                              }}>
                              </div>
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
            <div style={{ padding: '1.5rem', height: '100%' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '1px', background: 'var(--border)', border: '1px solid var(--border)', borderRadius: '12px', overflow: 'hidden', boxShadow: 'var(--shadow)' }}>
                {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
                  <div key={day} style={{ padding: '1rem', background: 'var(--bg-secondary)', fontWeight: '800', textAlign: 'center', color: 'var(--primary)', textTransform: 'uppercase', fontSize: '0.75rem', letterSpacing: '0.1em' }}>{day}</div>
                ))}
                {(() => {
                  const start = startOfWeek(startOfMonth(currentDate));
                  const end = endOfWeek(endOfMonth(currentDate));
                  const calendarDates = eachDayOfInterval({ start, end });
                  return calendarDates.map(d => {
                    const isCurrentMonth = d.getMonth() === currentDate.getMonth();
                    const isTodayDate = isToday(d);
                    const dayBookings = filteredBookings.filter(b => isWithinInterval(d, { start: startOfDay(new Date(b.check_in_date)), end: startOfDay(new Date(b.check_out_date)) }));
                    
                    return (
                      <div key={d.toString()} style={{ minHeight: '140px', padding: '0.75rem', background: isCurrentMonth ? 'white' : 'var(--bg-color)', opacity: isCurrentMonth ? 1 : 0.4, position: 'relative', transition: 'all 0.2s' }}>
                        <div style={{ fontWeight: '900', marginBottom: '0.75rem', fontSize: '1.1rem', color: isTodayDate ? 'var(--primary)' : 'var(--text-main)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            {format(d, 'd')}
                            {isTodayDate && <span style={{ fontSize: '0.6rem', background: 'var(--primary)', color: 'white', padding: '2px 6px', borderRadius: '10px', textTransform: 'uppercase' }}>Today</span>}
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                          {dayBookings.slice(0, 4).map(b => (
                            <div key={b.id} 
                                 onClick={() => setSelectedBooking(b)} 
                                 onMouseEnter={(e) => { setHoveredBooking(b); setTooltipPos({ x: e.clientX, y: e.clientY }); }}
                                 onMouseLeave={() => setHoveredBooking(null)}
                                 style={{ 
                                    fontSize: '0.75rem', padding: '0.35rem 0.6rem', borderRadius: '6px', 
                                    background: b.status === 'Checked-in' ? 'rgba(99, 102, 241, 0.1)' : 'rgba(16, 185, 129, 0.1)', 
                                    color: b.status === 'Checked-in' ? '#6366f1' : '#10b981', 
                                    borderLeft: `4px solid ${b.status === 'Checked-in' ? '#6366f1' : '#10b981'}`, 
                                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', cursor: 'pointer',
                                    fontWeight: 700,
                                    transform: hoveredBooking?.id === b.id ? 'translateX(4px)' : 'none',
                                    transition: 'transform 0.2s'
                                 }}>
                              {b.guest_name}
                            </div>
                          ))}
                          {dayBookings.length > 4 && <small style={{ color: 'var(--text-muted)', fontWeight: 700, textAlign: 'center', display: 'block', marginTop: '0.25rem' }}>+ {dayBookings.length - 4} more</small>}
                        </div>
                      </div>
                    );
                  });
                })()}
              </div>
            </div>
          )}

          {viewType === 'agenda' && (
            <div style={{ padding: '2rem', maxWidth: '800px', margin: '0 auto' }}>
               <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                 {filteredBookings.filter(b => new Date(b.check_in_date) >= startOfMonth(currentDate) && new Date(b.check_in_date) <= endOfMonth(currentDate)).sort((a,b) => new Date(a.check_in_date) - new Date(b.check_in_date)).map(b => (
                   <div key={b.id} className="card" onClick={() => setSelectedBooking(b)} style={{ padding: '1.25rem', cursor: 'pointer', borderLeft: `8px solid ${b.status === 'Checked-in' ? '#6366f1' : (b.status === 'Confirmed' ? 'var(--primary)' : 'var(--warning)')}`, transition: 'all 0.2s' }}>
                     <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
                            <div style={{ textAlign: 'center', minWidth: '60px', padding: '0.5rem', background: 'var(--bg-color)', borderRadius: '12px', border: '1px solid var(--border)' }}>
                                <div style={{ fontSize: '0.7rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase' }}>{format(new Date(b.check_in_date), 'MMM')}</div>
                                <div style={{ fontSize: '1.25rem', fontWeight: 900 }}>{format(new Date(b.check_in_date), 'dd')}</div>
                            </div>
                            <div>
                                <div style={{ fontWeight: 800, fontSize: '1.25rem', marginBottom: '0.25rem' }}>{b.guest_name}</div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', color: 'var(--text-muted)', fontSize: '0.85rem', fontWeight: 600 }}>
                                    <span style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}><Calendar size={14} /> {format(new Date(b.check_in_date), 'dd MMM')} - {format(new Date(b.check_out_date), 'dd MMM')}</span>
                                    <span style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}><Home size={14} /> {cottages.find(c => c.id === b.cottage_id)?.name}</span>
                                </div>
                            </div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', alignItems: 'flex-end' }}>
                            <span style={{ padding: '0.2rem 0.75rem', borderRadius: '12px', fontSize: '0.65rem', fontWeight: 800, background: 'rgba(99, 102, 241, 0.1)', color: '#6366f1', border: '1px solid rgba(99, 102, 241, 0.2)' }}>{b.booking_source || 'Direct'}</span>
                            <span className={`badge badge-${b.status === 'Cancelled' ? 'danger' : b.status === 'Completed' ? 'success' : 'info'}`} style={{ fontSize: '0.65rem' }}>{b.status}</span>
                          </div>
                          <div style={{ marginTop: '0.75rem', fontWeight: 900, fontSize: '1.25rem', color: 'var(--primary)' }}>₹{b.total_amount?.toLocaleString()}</div>
                        </div>
                     </div>
                   </div>
                 ))}
                 {filteredBookings.length === 0 && (
                    <div style={{ textAlign: 'center', padding: '5rem 2rem', color: 'var(--text-muted)', background: 'var(--bg-secondary)', borderRadius: '20px', border: '2px dashed var(--border)' }}>
                        <Calendar size={48} style={{ marginBottom: '1rem', opacity: 0.3 }} />
                        <h3 style={{ margin: 0 }}>No bookings found</h3>
                        <p>Adjust your search or change the month to see results.</p>
                    </div>
                 )}
               </div>
            </div>
          )}
        </div>

        {/* DETAILS DRAWER / PANEL */}
        {selectedBooking && (
          <div style={{ padding: '2rem', borderTop: '2px solid var(--border)', background: 'var(--bg-secondary)', position: 'relative', animation: 'slideUp 0.3s ease-out' }}>
            <button className="btn-icon" style={{ position: 'absolute', right: '1.5rem', top: '1.5rem', background: 'var(--bg-color)' }} onClick={() => setSelectedBooking(null)}><X size={20}/></button>
            
            <div style={{ display: 'flex', gap: '2.5rem', alignItems: 'flex-start', flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: '300px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1rem' }}>
                        <div style={{ width: '56px', height: '56px', borderRadius: '16px', background: 'var(--primary)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.5rem', fontWeight: 800 }}>{selectedBooking.guest_name.charAt(0)}</div>
                        <div>
                            <h2 style={{ margin: 0, fontSize: '1.75rem' }}>{selectedBooking.guest_name}</h2>
                            <span style={{ padding: '0.2rem 0.6rem', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 800, background: 'rgba(5, 150, 105, 0.1)', color: 'var(--primary)', border: '1px solid rgba(5, 150, 105, 0.2)' }}>{selectedBooking.status}</span>
                        </div>
                    </div>
                    
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1.5rem', marginTop: '1.5rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                            <div style={{ background: 'var(--bg-color)', p: '0.5rem', borderRadius: '8px' }}><Phone size={20} color="var(--primary)" /></div>
                            <div>
                                <small style={{ display: 'block', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', fontSize: '0.65rem' }}>Phone Number</small>
                                <strong style={{ fontSize: '1rem' }}>{selectedBooking.phone_number}</strong>
                            </div>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                            <div style={{ background: 'var(--bg-color)', p: '0.5rem', borderRadius: '8px' }}><Calendar size={20} color="var(--success)" /></div>
                            <div>
                                <small style={{ display: 'block', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', fontSize: '0.65rem' }}>Stay Period</small>
                                <strong style={{ fontSize: '1rem' }}>{format(new Date(selectedBooking.check_in_date), 'dd MMM')} - {format(new Date(selectedBooking.check_out_date), 'dd MMM')}</strong>
                            </div>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                            <div style={{ background: 'var(--bg-color)', p: '0.5rem', borderRadius: '8px' }}><Globe size={20} color="var(--primary)" /></div>
                            <div>
                                <small style={{ display: 'block', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', fontSize: '0.65rem' }}>Booking Source</small>
                                <strong style={{ fontSize: '1rem' }}>{selectedBooking.booking_source || 'Direct'}</strong>
                            </div>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                            <div style={{ background: 'var(--bg-color)', p: '0.5rem', borderRadius: '8px' }}><Home size={20} color="var(--warning)" /></div>
                            <div>
                                <small style={{ display: 'block', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', fontSize: '0.65rem' }}>Property</small>
                                <strong style={{ fontSize: '1rem' }}>{cottages.find(c => c.id === selectedBooking.cottage_id)?.name}</strong>
                            </div>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                            <div style={{ background: 'var(--bg-color)', p: '0.5rem', borderRadius: '8px' }}><IdCard size={20} color="var(--primary)" /></div>
                            <div>
                                <small style={{ display: 'block', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', fontSize: '0.65rem' }}>Reference #</small>
                                <strong style={{ fontSize: '1rem' }}>{selectedBooking.reference_number || 'N/A'}</strong>
                            </div>
                        </div>
                    </div>
                </div>
                
                <div style={{ width: '280px', background: 'var(--bg-color)', padding: '1.5rem', borderRadius: '20px', border: '1px solid var(--border)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem' }}>
                        <span style={{ fontWeight: 600, color: 'var(--text-muted)' }}>Total Amount</span>
                        <span style={{ fontWeight: 900, fontSize: '1.1rem' }}>₹{selectedBooking.total_amount?.toLocaleString()}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
                        <span style={{ fontWeight: 600, color: 'var(--text-muted)' }}>Balance Due</span>
                        <span style={{ fontWeight: 900, fontSize: '1.25rem', color: selectedBooking.balance_amount > 0 ? 'var(--danger)' : 'var(--success)' }}>₹{selectedBooking.balance_amount?.toLocaleString()}</span>
                    </div>
                    <button className="btn btn-primary" style={{ width: '100%', marginBottom: '0.75rem' }} onClick={() => navigate(`/bookings/edit/${selectedBooking.id}`)}>
                        <Edit2 size={18} /> Manage Booking
                    </button>
                </div>
            </div>
          </div>
        )}
      </div>

      {hoveredBooking && (
        <CalendarTooltip 
            booking={hoveredBooking} 
            cottageName={cottages.find(c => c.id === hoveredBooking.cottage_id)?.name} 
            rooms={rooms}
            position={tooltipPos}
        />
      )}

      <style>{`
        @keyframes slideUp {
          from { transform: translateY(100%); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
        .timeline-cell:hover {
            transform: scale(1.05);
            z-index: 10;
        }
        .form-input:focus {
            box-shadow: 0 0 0 3px rgba(5, 150, 105, 0.1);
            border-color: var(--primary) !important;
        }
        ::-webkit-scrollbar {
            height: 10px;
            width: 8px;
        }
        ::-webkit-scrollbar-thumb {
            background: #cbd5e1;
            border-radius: 10px;
        }
        ::-webkit-scrollbar-thumb:hover {
            background: #94a3b8;
        }
      `}</style>
    </div>
  );
}
