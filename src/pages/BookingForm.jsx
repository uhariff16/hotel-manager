import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { CalendarCheck, CheckCircle2, ArrowLeft, User, Users, Calendar, Info, Globe, Wallet } from 'lucide-react';
import { eachDayOfInterval, isWeekend, format } from 'date-fns';
import { useSettingsStore } from '../lib/store';

const parseAgentSource = (sourceStr) => {
  if (!sourceStr) return { isAgent: false, name: '', phone: '' };
  
  const str = sourceStr.trim();
  if (!str.startsWith('Agent:')) {
    return { isAgent: false, name: str, phone: '' };
  }
  
  const cleaned = str.replace(/^Agent:\s*/i, '').trim();
  
  // Pattern 1: Agent: Name | Phone
  if (cleaned.includes('|')) {
    const [n, p] = cleaned.split('|');
    return { isAgent: true, name: (n || '').trim(), phone: (p || '').trim() };
  }
  
  // Pattern 2: Agent: Name (Contact: Phone)
  const bracketMatch = cleaned.match(/^([^(]+)\(\s*Contact:\s*([^)]+)\)/i);
  if (bracketMatch) {
    return { 
      isAgent: true, 
      name: bracketMatch[1].trim(), 
      phone: bracketMatch[2].trim() 
    };
  }
  
  // Pattern 3: Agent: Name Contact: Phone (without brackets)
  const contactMatch = cleaned.match(/^([\s\S]+?)\s*Contact:\s*(.+)$/i);
  if (contactMatch) {
    return {
      isAgent: true,
      name: contactMatch[1].trim(),
      phone: contactMatch[2].trim()
    };
  }
  
  return { isAgent: true, name: cleaned, phone: '' };
};

const parsePhone = (fullPhone) => {
  if (!fullPhone) return { code: '+91', raw: '' };
  const codes = ['+91', '+1', '+44', '+971', '+61', '+65', '+60', '+63', '+94', '+977'];
  for (let c of codes) {
    if (fullPhone.startsWith(c)) {
      return { code: c, raw: fullPhone.slice(c.length).trim() };
    }
  }
  if (fullPhone.startsWith('+')) {
    const match = fullPhone.match(/^(\+\d{1,4})/);
    if (match) {
      return { code: match[1], raw: fullPhone.slice(match[1].length).trim() };
    }
  }
  return { code: '+91', raw: fullPhone };
};

const COUNTRY_CODES = [
  { code: '+91', name: 'India' },
  { code: '+1', name: 'United States / Canada' },
  { code: '+44', name: 'United Kingdom' },
  { code: '+971', name: 'United Arab Emirates' },
  { code: '+65', name: 'Singapore' },
  { code: '+60', name: 'Malaysia' },
  { code: '+63', name: 'Philippines' },
  { code: '+61', name: 'Australia' },
  { code: '+64', name: 'New Zealand' },
  { code: '+94', name: 'Sri Lanka' },
  { code: '+977', name: 'Nepal' },
  { code: '+880', name: 'Bangladesh' },
  { code: '+966', name: 'Saudi Arabia' },
  { code: '+968', name: 'Oman' },
  { code: '+974', name: 'Qatar' },
  { code: '+965', name: 'Kuwait' },
  { code: '+973', name: 'Bahrain' },
  { code: '+960', name: 'Maldives' },
  { code: '+49', name: 'Germany' },
  { code: '+33', name: 'France' },
  { code: '+39', name: 'Italy' },
  { code: '+34', name: 'Spain' },
  { code: '+31', name: 'Netherlands' },
  { code: '+41', name: 'Switzerland' },
  { code: '+27', name: 'South Africa' },
  { code: '+86', name: 'China' },
  { code: '+81', name: 'Japan' },
  { code: '+82', name: 'South Korea' },
  { code: '+66', name: 'Thailand' },
  { code: '+62', name: 'Indonesia' },
  { code: '+84', name: 'Vietnam' },
  { code: '+353', name: 'Ireland' },
  { code: '+7', name: 'Russia' },
  { code: '+55', name: 'Brazil' },
  { code: '+52', name: 'Mexico' },
  { code: '+90', name: 'Turkey' },
  { code: '+32', name: 'Belgium' },
  { code: '+46', name: 'Sweden' },
  { code: '+47', name: 'Norway' },
  { code: '+45', name: 'Denmark' },
  { code: '+351', name: 'Portugal' },
  { code: '+30', name: 'Greece' },
  { code: '+43', name: 'Austria' },
  { code: '+48', name: 'Poland' },
  { code: '+358', name: 'Finland' },
  { code: '+420', name: 'Czech Republic' },
  { code: '+36', name: 'Hungary' },
  { code: '+40', name: 'Romania' },
  { code: '+380', name: 'Ukraine' },
  { code: '+972', name: 'Israel' },
  { code: '+20', name: 'Egypt' },
  { code: '+234', name: 'Nigeria' },
  { code: '+254', name: 'Kenya' }
];

export default function BookingForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { activeResortId, profile } = useSettingsStore();
  
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [originalStatus, setOriginalStatus] = useState(null);
  const [settlementPaid, setSettlementPaid] = useState(0);
  const [settlementDiscount, setSettlementDiscount] = useState(0);
  
  const [cottages, setCottages] = useState([]);
  const [rooms, setRooms] = useState([]);
  const [activeBookings, setActiveBookings] = useState([]);

  const [bookingForm, setBookingForm] = useState({
    guest_name: '', guest_email: '', phone_number: '', phone_code: '+91', phone_raw: '', check_in_date: '', check_out_date: '', adults_count: 1, kids_count: 0,
    booking_type: 'Room', cottage_id: '', room_ids: [],
    night_count: 0, price_type: 'Calculated', base_amount: 0, extra_guest_charges: 0, addons_cost: 0,
    total_amount: 0, advance_paid: 0, balance_amount: 0, booking_source: 'Direct', status: 'Pending', is_loading_edit: false,
    reference_number: '', vehicle_number: '', id_proof_type: 'Aadhar', id_proof_other_type: '', id_proof_number: '',
    addon_selections: [], addon_others: '',
    room_type: 'Deluxe',
    room_types_map: {},
    breakfast: 'NA',
    agent_name: '',
    agent_phone: '',
    is_custom_agent: false,
    additional_guests: []
  });

  const [agents, setAgents] = useState([]);
  const [agentPhones, setAgentPhones] = useState({});

  useEffect(() => {
    fetchData();
  }, [activeResortId, profile?.cottage_id, profile?.role]);

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
      let cottagesQuery = supabase.from('cottages').select('*').eq('resort_id', activeResortId);
      let roomsQuery = supabase.from('rooms').select('*').eq('resort_id', activeResortId);

      if (profile?.role === 'staff' && profile?.cottage_id) {
        cottagesQuery = cottagesQuery.eq('id', profile.cottage_id);
        roomsQuery = roomsQuery.eq('cottage_id', profile.cottage_id);
      }

      const [cts, rms, plansRes, ratesRes, propRatesRes] = await Promise.all([
        cottagesQuery,
        roomsQuery,
        supabase.from('rate_plans').select('*').eq('resort_id', activeResortId),
        supabase.from('category_rates').select('*, rate_plans!inner(resort_id)').eq('rate_plans.resort_id', activeResortId),
        supabase.from('property_rates').select('*, rate_plans!inner(resort_id)').eq('rate_plans.resort_id', activeResortId)
      ]);
      setCottages(cts.data || []);
      setRooms(rms.data || []);
      
      // Store globally for calculateBasePrice
      window.__bookingRatePlans = plansRes.data || [];
      window.__bookingCategoryRates = ratesRes.data || [];
      window.__bookingPropertyRates = propRatesRes.data || [];

      // If restricted staff, prefill the cottage_id
      if (profile?.role === 'staff' && profile?.cottage_id && !id) {
        setBookingForm(prev => ({
          ...prev,
          cottage_id: profile.cottage_id
        }));
      }

      // Fetch agents and active bookings from existing bookings
      let fetchedAgents = [];
      try {
        const { data: bks, error: bksErr } = await supabase
          .from('bookings')
          .select('id, cottage_id, room_ids, booking_type, status, check_in_date, check_out_date, booking_source')
          .eq('resort_id', activeResortId)
          .neq('status', 'Cancelled')
          .neq('status', 'Checked Out');
          
        if (!bksErr && bks) {
          setActiveBookings(bks);
          const dbAgentsMap = {};
           bks.forEach(b => {
             const { isAgent, name, phone } = parseAgentSource(b.booking_source);
             if (isAgent && name) {
               dbAgentsMap[name] = phone;
             }
           });
           fetchedAgents = Array.from(new Set([...fetchedAgents, ...Object.keys(dbAgentsMap)]));
           setAgentPhones(dbAgentsMap);
        }      } catch (e) {
        console.warn("Could not load agents from bookings:", e);
      }
      setAgents(fetchedAgents);

      if (id) {
        // Fetch existing booking for edit
        const { data: b, error: fetchErr } = await supabase
          .from('bookings')
          .select('*')
          .eq('id', id)
          .single();
        
        if (fetchErr) throw fetchErr;
        if (b) {
          // Check if restricted staff has access to this booking
          if (profile?.role === 'staff' && profile?.cottage_id && b.cottage_id !== profile.cottage_id) {
            alert("You are not authorized to edit this booking.");
            navigate('/bookings');
            return;
          }

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

          const selectedRoomIds = b.room_ids || (b.room_id ? [b.room_id] : []);
          const roomTypeParts = (b.room_type || '').split(',').map(s => s.trim()).filter(Boolean);
          const initialMap = {};
          selectedRoomIds.forEach((rid, index) => {
            initialMap[rid] = roomTypeParts[index] || b.room_type || 'Deluxe';
          });

          const parsedPhone = parsePhone(b.phone_number);
          let rawAdditionalGuests = [];
          if (b.additional_guests) {
            try {
              const parsedGuests = typeof b.additional_guests === 'string' ? JSON.parse(b.additional_guests) : b.additional_guests;
              if (Array.isArray(parsedGuests)) {
                rawAdditionalGuests = parsedGuests.map(g => {
                  const pgPhone = parsePhone(g.phone || g.phone_number);
                  return {
                    name: g.name || '',
                    email: g.email || '',
                    phone_code: pgPhone.code,
                    phone_raw: pgPhone.raw
                  };
                });
              }
            } catch (e) {
              console.error("Failed to parse additional guests:", e);
            }
          }

          setBookingForm({
            guest_name: b.guest_name,
            guest_email: b.guest_email || '',
            phone_number: b.phone_number,
            phone_code: parsedPhone.code,
            phone_raw: parsedPhone.raw,
            check_in_date: b.check_in_date.split('T')[0],
            check_out_date: b.check_out_date.split('T')[0],
            adults_count: b.adults_count || b.number_of_guests || 1,
            kids_count: b.kids_count || 0,
            booking_type: b.booking_type,
            cottage_id: b.cottage_id,
            room_ids: selectedRoomIds,
            night_count: b.night_count || 0,
            base_amount: b.base_amount || 0,
            extra_guest_charges: b.extra_guest_charges || 0,
            addons_cost: b.addons_cost || 0,
            total_amount: b.total_amount || 0,
            advance_paid: b.advance_paid || 0,
            balance_amount: b.balance_amount || 0,
            booking_source: b.booking_source ? (b.booking_source.startsWith('Agent') ? 'Agent' : (['Direct', 'Airbnb', 'Booking.com', 'Agent'].includes(b.booking_source) ? b.booking_source : 'Other')) : 'Direct',
            agent_name: (() => {
              const { isAgent, name } = parseAgentSource(b.booking_source);
              return isAgent ? name : '';
            })(),
            agent_phone: (() => {
              const { isAgent, phone } = parseAgentSource(b.booking_source);
              return isAgent ? phone : '';
            })(),
            is_custom_agent: false,
            custom_booking_source: b.booking_source && !['Direct', 'Airbnb', 'Booking.com', 'Agent'].includes(b.booking_source) && !b.booking_source.startsWith('Agent') ? b.booking_source : '',
            status: b.status,
            reference_number: b.reference_number || '',
            vehicle_number: b.vehicle_number || '',
            id_proof_type: ['Aadhar', 'Pan Card', 'Driving License', 'Voter ID', 'Passport'].includes(b.id_proof_type || 'Aadhar') ? (b.id_proof_type || 'Aadhar') : 'Other',
            id_proof_other_type: ['Aadhar', 'Pan Card', 'Driving License', 'Voter ID', 'Passport'].includes(b.id_proof_type || 'Aadhar') ? '' : (b.id_proof_type || ''),
            id_proof_number: b.id_proof_number || '',
            price_type: b.price_type || 'Calculated',
            addon_selections: selections,
            addon_others: othersText.join(', '),
            is_loading_edit: true,
            room_type: b.room_type || 'Deluxe',
            room_types_map: initialMap,
            breakfast: b.breakfast || 'NA',
            additional_guests: rawAdditionalGuests
          });
          setOriginalStatus(b.status);

          // Fetch settlement incomes and discounts to prevent balance override
          const { data: bookingIncomes } = await supabase
            .from('incomes')
            .select('amount, notes')
            .eq('booking_id', id);
            
          const totalSettled = (bookingIncomes || [])
            .filter(inc => inc.notes?.toLowerCase().includes('settlement'))
            .reduce((sum, inc) => sum + Number(inc.amount), 0);
            
          let totalDiscount = 0;
          (bookingIncomes || []).forEach(inc => {
            const match = inc.notes?.match(/\[Discount:\s*₹?(\d+)\]/i);
            if (match) {
              totalDiscount += Number(match[1]);
            }
          });
          
          setSettlementPaid(totalSettled);
          setSettlementDiscount(totalDiscount);
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
    const ratePlans = window.__bookingRatePlans || [];
    const catRates = window.__bookingCategoryRates || [];
    const propRates = window.__bookingPropertyRates || [];
    
    // Find Weekday and Weekend Rate Plans (fallback to null if not found)
    const weekdayPlan = ratePlans.find(rp => rp.name.toLowerCase() === 'weekday');
    const weekendPlan = ratePlans.find(rp => rp.name.toLowerCase() === 'weekend');

    days.forEach(d => {
      let daily = 0;
      const isWknd = isWeekend(d);
      
      itemPricingArray.forEach(item => {
        const planToUse = isWknd ? weekendPlan : weekdayPlan;

        // If it's an Entire Property booking
        if (booking_type === 'Entire Property' && (weekdayPlan || weekendPlan)) {
          if (planToUse) {
            const propRateRecord = propRates.find(r => r.cottage_id === item.id && r.rate_plan_id === planToUse.id);
            if (propRateRecord) {
              daily += Number(propRateRecord.price || 0);
              return;
            }
          }
        }

        // If it's a room with a category_id, use Rate Plans
        if (booking_type === 'Room' && item.category_id && (weekdayPlan || weekendPlan)) {
          if (planToUse) {
            const rateRecord = catRates.find(r => r.category_id === item.category_id && r.rate_plan_id === planToUse.id);
            if (rateRecord) {
              daily += Number(rateRecord.price || 0);
              return;
            }
          }
        }
        
        // Fallback to legacy pricing (or Cottage pricing which hasn't been migrated yet)
        if (isWknd) daily += Number(item.weekend_price || 0);
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
    const rawTotal = Number(bookingForm.base_amount || 0) + Number(bookingForm.addons_cost || 0) + Number(bookingForm.extra_guest_charges || 0);
    const discountedTotal = Math.max(0, rawTotal - settlementDiscount);
    const balance = Math.max(0, discountedTotal - Number(bookingForm.advance_paid || 0) - settlementPaid);
    setBookingForm(prev => ({
      ...prev,
      total_amount: discountedTotal,
      balance_amount: balance
    }));
  }, [bookingForm.base_amount, bookingForm.addons_cost, bookingForm.advance_paid, bookingForm.extra_guest_charges, settlementPaid, settlementDiscount]);

  const handleAddAdditionalGuest = () => {
    setBookingForm(prev => ({
      ...prev,
      additional_guests: [...(prev.additional_guests || []), { name: '', email: '', phone_code: '+91', phone_raw: '' }]
    }));
  };

  const handleRemoveAdditionalGuest = (index) => {
    setBookingForm(prev => ({
      ...prev,
      additional_guests: prev.additional_guests.filter((_, idx) => idx !== index)
    }));
  };

  const handleUpdateAdditionalGuest = (index, field, value) => {
    setBookingForm(prev => {
      const updated = [...prev.additional_guests];
      updated[index] = { ...updated[index], [field]: value };
      return { ...prev, additional_guests: updated };
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (isSubmitting) return;
    setIsSubmitting(true);
    setError(null);

    try {
      const formattedAdditionalGuests = (bookingForm.additional_guests || []).map(g => ({
        name: g.name,
        email: g.email || '',
        phone: g.phone_code + g.phone_raw
      }));

      const bookingData = {
        resort_id: activeResortId || null,
        tenant_id: profile?.tenant_id || profile?.id || null,
        guest_name: bookingForm.guest_name,
        guest_email: bookingForm.guest_email || null,
        phone_number: bookingForm.phone_code + bookingForm.phone_raw,
        check_in_date: bookingForm.check_in_date,
        check_out_date: bookingForm.check_out_date,
        adults_count: bookingForm.adults_count,
        kids_count: bookingForm.kids_count,
        number_of_guests: Number(bookingForm.adults_count || 0) + Number(bookingForm.kids_count || 0),
        booking_type: bookingForm.booking_type,
        cottage_id: bookingForm.cottage_id || null,
        room_ids: bookingForm.booking_type === 'Entire Property' ? rooms.filter(r => r.cottage_id === bookingForm.cottage_id).map(r => r.id) : bookingForm.room_ids,
        room_id: bookingForm.booking_type === 'Entire Property' ? (rooms.find(r => r.cottage_id === bookingForm.cottage_id)?.id || null) : (bookingForm.room_ids.length > 0 ? bookingForm.room_ids[0] : null),
        night_count: bookingForm.night_count,
        base_amount: bookingForm.base_amount,
        addons_cost: bookingForm.addons_cost,
        total_amount: bookingForm.total_amount,
        advance_paid: bookingForm.advance_paid,
        balance_amount: bookingForm.balance_amount,
        status: bookingForm.status,
        reference_number: bookingForm.reference_number,
        vehicle_number: bookingForm.vehicle_number,
        id_proof_type: bookingForm.id_proof_type === 'Other' ? bookingForm.id_proof_other_type : bookingForm.id_proof_type,
        id_proof_number: bookingForm.id_proof_number,
        addon_details: bookingForm.addon_selections.map(s => s === 'Others' ? bookingForm.addon_others : s).filter(Boolean).join(', '),
        booking_source: bookingForm.booking_source === 'Other' ? bookingForm.custom_booking_source 
                      : bookingForm.booking_source === 'Agent' ? `Agent: ${(bookingForm.agent_name || agents[0] || 'Unknown').trim()}${bookingForm.agent_phone ? ' | ' + bookingForm.agent_phone.trim() : ''}`
                      : bookingForm.booking_source,
        price_type: bookingForm.price_type,
        room_type: bookingForm.room_type,
        breakfast: bookingForm.breakfast,
        additional_guests: formattedAdditionalGuests,
        guest_address: bookingForm.guest_address
      };
      
      // If status was Completed and now it's NOT, delete the auto-settled income record
      if (id && originalStatus === 'Completed' && bookingForm.status !== 'Completed') {
          // Delete any income record that was created as a settlement for this booking
          await supabase.from('incomes').delete().eq('booking_id', id).ilike('notes', '%Settlement%');
      }

      let result;
      if (id) {
        result = await supabase.from('bookings').update(bookingData).eq('id', id);
        if (result.error && (result.error.message?.includes('column') || result.error.code === '42703')) {
          alert("Notice: Room Type, Breakfast, Additional Guests, or Guest Address columns could not be saved to the database. Please run the SQL migration scripts in your Supabase SQL Editor to add these columns.");
          console.warn("DB columns missing. Retrying save without them.");
          const { room_type, breakfast, additional_guests, guest_address, ...cleanData } = bookingData;
          result = await supabase.from('bookings').update(cleanData).eq('id', id);
        }
      } else {
        result = await supabase.from('bookings').insert([bookingData]).select();
        if (result.error && (result.error.message?.includes('column') || result.error.code === '42703')) {
          alert("Notice: Room Type, Breakfast, Additional Guests, or Guest Address columns could not be saved to the database. Please run the SQL migration scripts in your Supabase SQL Editor to add these columns.");
          console.warn("DB columns missing. Retrying save without them.");
          const { room_type, breakfast, additional_guests, guest_address, ...cleanData } = bookingData;
          result = await supabase.from('bookings').insert([cleanData]).select();
        }
      }

      if (result.error) throw result.error;

      const targetId = id || result.data?.[0]?.id;
      
      // Synchronize advance payment with incomes table
      if (targetId) {
        try {
          if (bookingForm.status === 'Pending') {
            // Delete any existing advance payment records if status is set to Pending
            await supabase
              .from('incomes')
              .delete()
              .eq('booking_id', targetId)
              .or('notes.ilike.%Advance%,notes.ilike.%Adjustment%,notes.ilike.%Refund%');
          } else {
            const { data: existingIncomes } = await supabase
              .from('incomes')
              .select('id, amount')
              .eq('booking_id', targetId)
              .or('notes.ilike.%Advance%,notes.ilike.%Adjustment%,notes.ilike.%Refund%');
              
            const totalLogged = (existingIncomes || []).reduce((sum, inc) => sum + Number(inc.amount), 0);
            const difference = Number(bookingForm.advance_paid || 0) - totalLogged;
            
            if (difference !== 0) {
              await supabase.from('incomes').insert([{
                resort_id: activeResortId,
                tenant_id: profile?.tenant_id,
                booking_id: targetId,
                amount: difference,
                source: 'Room Rent',
                notes: difference > 0 
                  ? `Advance Payment: ${bookingForm.guest_name} (${bookingForm.reference_number})`
                  : `Adjustment/Refund: ${bookingForm.guest_name} (${bookingForm.reference_number})`,
                date: new Date().toISOString().split('T')[0],
                payment_mode: 'UPI'
              }]);
            }
          }
        } catch (syncErr) {
          console.error("Error syncing advance payment to incomes:", syncErr);
        }
      }

      // Trigger notification
      supabase.functions.invoke('send-notification', {
        body: { 
          booking_id: targetId, 
          type: 'confirmation',
          resort_id: activeResortId
        }
      }).catch(err => console.error("Notification Trigger Error:", err));

      navigate('/bookings');
    } catch (err) {
      console.error(err);
      setError(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const relevantRooms = React.useMemo(() => {
    let baseRooms = rooms.filter(r => r.cottage_id === bookingForm.cottage_id && (r.status === 'Available' || r.status === 'Active' || bookingForm.room_ids.includes(r.id)));
    if (!bookingForm.check_in_date || !bookingForm.check_out_date || !bookingForm.cottage_id) return baseRooms;
    
    const start = new Date(bookingForm.check_in_date);
    const end = new Date(bookingForm.check_out_date);
    start.setHours(0,0,0,0);
    end.setHours(0,0,0,0);
    
    if (end <= start) return baseRooms;

    const bookedRoomIds = new Set();
    
    activeBookings.forEach(b => {
      if (b.id === id) return; // skip current editing booking
      if (b.cottage_id !== bookingForm.cottage_id) return;
      
      const bStart = new Date(b.check_in_date);
      const bEnd = new Date(b.check_out_date);
      bStart.setHours(0,0,0,0);
      bEnd.setHours(0,0,0,0);
      
      // Overlap condition: start1 < end2 && end1 > start2
      if (bStart < end && bEnd > start) {
         if (b.booking_type === 'Entire Property' || !b.room_ids || b.room_ids.length === 0) {
            baseRooms.forEach(r => bookedRoomIds.add(r.id));
         } else {
            b.room_ids.forEach(rid => bookedRoomIds.add(rid));
         }
      }
    });
    
    return baseRooms.filter(r => !bookedRoomIds.has(r.id) || bookingForm.room_ids.includes(r.id));
  }, [rooms, bookingForm.cottage_id, bookingForm.check_in_date, bookingForm.check_out_date, bookingForm.room_ids, activeBookings, id]);

  const dailyAvailability = React.useMemo(() => {
    if (!bookingForm.check_in_date || !bookingForm.check_out_date || !bookingForm.cottage_id) return [];
    
    let baseRooms = rooms.filter(r => r.cottage_id === bookingForm.cottage_id && (r.status === 'Available' || r.status === 'Active'));
    const start = new Date(bookingForm.check_in_date);
    const end = new Date(bookingForm.check_out_date);
    start.setHours(0,0,0,0);
    end.setHours(0,0,0,0);
    
    if (end <= start) return [];

    const days = eachDayOfInterval({ start, end: new Date(end.getTime() - 24*60*60*1000) });
    if (days.length <= 1) return [];

    return days.map(d => {
      const bookedRoomIds = new Set();
      
      activeBookings.forEach(b => {
        if (b.id === id) return;
        if (b.cottage_id !== bookingForm.cottage_id) return;
        
        const bStart = new Date(b.check_in_date);
        const bEnd = new Date(b.check_out_date);
        bStart.setHours(0,0,0,0);
        bEnd.setHours(0,0,0,0);
        
        if (bStart <= d && bEnd > d) {
           if (b.booking_type === 'Entire Property' || !b.room_ids || b.room_ids.length === 0) {
              baseRooms.forEach(r => bookedRoomIds.add(r.id));
           } else {
              b.room_ids.forEach(rid => bookedRoomIds.add(rid));
           }
        }
      });
      
      return {
        date: d,
        availableRooms: baseRooms.filter(r => !bookedRoomIds.has(r.id))
      };
    });
  }, [rooms, bookingForm.cottage_id, bookingForm.check_in_date, bookingForm.check_out_date, activeBookings, id]);

  if (loading) return <div style={{ padding: '2rem' }}>Loading Form...</div>;

  if (!id && (cottages.length === 0 || rooms.length === 0)) {
    return (
      <div className="container" style={{ maxWidth: '600px', margin: '4rem auto' }}>
        <div className="card text-center" style={{ padding: '3rem', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1.5rem' }}>
          <div style={{ backgroundColor: 'rgba(229, 62, 62, 0.1)', padding: '1rem', borderRadius: '50%', color: 'var(--danger)', display: 'inline-flex', justifyContent: 'center', alignItems: 'center' }}>
            <CalendarCheck size={48} />
          </div>
          <h2 style={{ fontSize: '1.75rem', fontWeight: 700 }}>Setup Required</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.95rem', lineHeight: '1.5', margin: 0 }}>
            You cannot create a booking until you configure at least one Property and Room under Property Management.
          </p>
          <button className="btn btn-primary" onClick={() => navigate('/setup')} style={{ padding: '0.75rem 2rem', fontWeight: 600 }}>
            Go to Property Management
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="container" style={{ maxWidth: '1200px', margin: '0 auto', padding: '2rem 1.5rem', fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;500;600;700;800&display=swap');
        
        .booking-page-title {
          font-family: 'Plus Jakarta Sans', sans-serif;
          font-size: 1.85rem;
          font-weight: 800;
          color: var(--text-color);
          margin-bottom: 2rem;
          display: flex;
          align-items: center;
          gap: 0.75rem;
        }
        
        .booking-layout {
          display: grid;
          grid-template-columns: 7fr 4fr;
          gap: 2.5rem;
          align-items: start;
        }
        
        .form-section-card {
          background: var(--bg-secondary);
          border: 1px solid var(--border);
          border-radius: 16px;
          padding: 2.25rem;
          margin-bottom: 2rem;
          box-shadow: 0 4px 20px -2px rgba(15, 44, 89, 0.03);
          transition: all 0.2s;
        }
        
        .form-section-card:hover {
          box-shadow: 0 10px 30px -5px rgba(15, 44, 89, 0.05);
        }
        
        .form-section-title {
          font-size: 1.15rem;
          color: var(--primary);
          font-weight: 700;
          margin: 0 0 1.5rem 0;
          display: flex;
          align-items: center;
          gap: 0.6rem;
          border-bottom: 1px solid var(--border);
          padding-bottom: 0.75rem;
          text-transform: tracking-tight;
        }
        
        .premium-label {
          display: block;
          font-size: 0.75rem;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.06em;
          color: var(--text-muted);
          margin-bottom: 0.5rem;
        }
        
        .premium-input, .premium-select {
          width: 100%;
          padding: 0.8rem 1rem;
          border-radius: 10px;
          border: 1.5px solid var(--border);
          background-color: var(--bg-color);
          color: var(--text-color);
          font-family: 'Plus Jakarta Sans', sans-serif;
          font-size: 0.9rem;
          font-weight: 500;
          transition: all 0.2s;
        }
        
        .premium-input:focus, .premium-select:focus {
          outline: none;
          border-color: var(--primary);
          box-shadow: 0 0 0 4px rgba(5, 150, 105, 0.1);
        }
        
        /* Check-in / Check-out Timeline widget */
        .timeline-widget {
          display: flex;
          align-items: center;
          justify-content: space-between;
          background: var(--bg-secondary);
          border: 1px dashed var(--border);
          border-radius: 12px;
          padding: 1.25rem;
          margin-bottom: 1.5rem;
        }
        .timeline-col {
          display: flex;
          flex-direction: column;
          gap: 0.25rem;
        }
        .timeline-label {
          font-size: 0.7rem;
          font-weight: 700;
          color: var(--text-muted);
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }
        .timeline-val {
          font-size: 0.95rem;
          font-weight: 800;
          color: var(--text-color);
        }
        
        .sticky-receipt {
          position: sticky;
          top: 2rem;
          background: var(--bg-secondary);
          border: 1px solid var(--border);
          border-radius: 16px;
          padding: 2.25rem;
          box-shadow: 0 15px 35px rgba(15, 44, 89, 0.06);
        }
        
        .receipt-header {
          font-size: 1rem;
          font-weight: 800;
          color: var(--text-muted);
          text-transform: uppercase;
          letter-spacing: 0.08em;
          border-bottom: 2px solid var(--border);
          padding-bottom: 0.75rem;
          margin-bottom: 1.5rem;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        
        .receipt-row {
          display: flex;
          justify-content: space-between;
          font-size: 0.9rem;
          color: var(--text-muted);
          margin-bottom: 0.85rem;
          font-weight: 500;
        }
        .receipt-row.bold {
          font-weight: 700;
          color: var(--text-color);
        }
        
        .receipt-total-box {
          background: var(--bg-secondary);
          border-radius: 12px;
          padding: 1.25rem;
          margin: 1.5rem 0;
          border: 1px solid var(--border);
        }
        
        .badge-room {
          display: inline-flex;
          align-items: center;
          gap: 0.4rem;
          background: var(--bg-secondary);
          border: 1.5px solid var(--border);
          color: var(--text-color);
          font-size: 0.85rem;
          font-weight: 600;
          padding: 0.4rem 1rem;
          border-radius: 20px;
          cursor: pointer;
          transition: all 0.2s;
        }
        .badge-room.selected {
          background: rgba(5, 150, 105, 0.08);
          border-color: var(--primary);
          color: var(--primary);
        }
        
        @media (max-width: 991px) {
          .booking-layout {
            grid-template-columns: 1fr;
          }
          .sticky-receipt {
            position: relative;
            top: 0;
          }
        }
      `}</style>

      <button 
        className="btn btn-outline" 
        onClick={() => navigate('/bookings')} 
        style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem', borderRadius: '8px', padding: '0.5rem 1rem' }}
      >
        <ArrowLeft size={16} /> Back to Reservations
      </button>

      <h2 className="booking-page-title">
        <CalendarCheck size={28} /> {id ? `Update Reservation: ${bookingForm.reference_number}` : 'Create New Reservation'}
      </h2>
      
      {error && (
        <div style={{ color: 'var(--danger)', marginBottom: '1.5rem', padding: '1rem', background: 'rgba(229, 62, 62, 0.08)', borderRadius: '8px', border: '1px solid rgba(229, 62, 62, 0.15)', fontSize: '0.9rem' }}>
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="booking-layout">
        
        {/* LEFT COLUMN: FORM DETAILS */}
        <div className="form-left-col">
          
          {/* SECTION 1: PRIMARY GUEST DETAILS */}
          <div className="form-section-card">
            <h3 className="form-section-title">
              <User size={18} style={{ color: 'var(--primary)' }} /> Primary Guest Details
            </h3>
            
            <div className="grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem', marginBottom: '1.25rem' }}>
              <div className="form-group">
                <label className="premium-label">Primary Guest Full Name</label>
                <input 
                  type="text" 
                  required 
                  className="premium-input" 
                  placeholder="Enter guest's first & last name"
                  value={bookingForm.guest_name} 
                  onChange={e => setBookingForm({...bookingForm, guest_name: e.target.value})} 
                />
              </div>
              <div className="form-group">
                <label className="premium-label">Email Address (Optional)</label>
                <input 
                  type="email" 
                  className="premium-input" 
                  placeholder="guest@email.com" 
                  value={bookingForm.guest_email} 
                  onChange={e => setBookingForm({...bookingForm, guest_email: e.target.value})} 
                />
              </div>
            </div>

            <div className="grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem' }}>
              <div className="form-group">
                <label className="premium-label">Mobile Contact Number (5/5 Layout)</label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                  <input 
                    list="country-codes"
                    className="premium-input" 
                    value={bookingForm.phone_code || '+91'} 
                    placeholder="Code (e.g. +91)"
                    onChange={e => setBookingForm(prev => ({ ...prev, phone_code: e.target.value, phone_number: e.target.value + prev.phone_raw }))}
                  />
                  <input 
                    type="text" 
                    required 
                    className="premium-input" 
                    placeholder="9876543210" 
                    value={bookingForm.phone_raw || ''} 
                    onChange={e => setBookingForm(prev => ({ ...prev, phone_raw: e.target.value, phone_number: prev.phone_code + e.target.value }))} 
                  />
                </div>
              </div>
              <div className="form-group">
                <label className="premium-label">Booking Reference Number</label>
                <input 
                  type="text" 
                  required 
                  className="premium-input" 
                  style={{ fontWeight: '700', color: 'var(--primary)' }} 
                  value={bookingForm.reference_number} 
                  onChange={e => setBookingForm({...bookingForm, reference_number: e.target.value})} 
                />
              </div>
            </div>

            <div className="form-group" style={{ marginTop: '1.25rem' }}>
              <label className="premium-label">Guest Address (Optional)</label>
              <textarea 
                className="premium-input" 
                placeholder="Enter guest's full address"
                rows="2"
                value={bookingForm.guest_address || ''} 
                onChange={e => setBookingForm({...bookingForm, guest_address: e.target.value})} 
                style={{ resize: 'vertical' }}
              />
            </div>
          </div>

          {/* SECTION 2: ADDITIONAL CONTACTS */}
          <div className="form-section-card" style={{ background: 'var(--bg-secondary)' }}>
            <h3 className="form-section-title">
              <Users size={18} style={{ color: 'var(--primary)' }} /> Additional Occupants / Contacts
            </h3>
            
            {bookingForm.additional_guests && bookingForm.additional_guests.map((guest, index) => (
              <div key={index} style={{ border: '1px solid var(--border)', padding: '1.25rem', borderRadius: '12px', background: 'var(--bg-primary)', position: 'relative', marginBottom: '1rem' }}>
                <div style={{ position: 'absolute', top: '0.75rem', right: '0.75rem' }}>
                  <button 
                    type="button" 
                    onClick={() => handleRemoveAdditionalGuest(index)} 
                    style={{ color: 'var(--danger)', background: 'transparent', border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}
                  >
                    Remove
                  </button>
                </div>
                <h4 style={{ margin: '0 0 1rem 0', fontSize: '0.85rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Occupant #{index + 2}</h4>
                
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
                  <div className="form-group">
                    <label className="premium-label" style={{ fontSize: '0.7rem' }}>Guest Name</label>
                    <input type="text" required className="premium-input" placeholder="Name" value={guest.name} onChange={e => handleUpdateAdditionalGuest(index, 'name', e.target.value)} />
                  </div>
                  <div className="form-group">
                    <label className="premium-label" style={{ fontSize: '0.7rem' }}>Email Address</label>
                    <input type="email" className="premium-input" placeholder="Email" value={guest.email} onChange={e => handleUpdateAdditionalGuest(index, 'email', e.target.value)} />
                  </div>
                  <div className="form-group">
                    <label className="premium-label" style={{ fontSize: '0.7rem' }}>Mobile Number</label>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.4rem' }}>
                      <input 
                        list="country-codes"
                        className="premium-input" 
                        value={guest.phone_code || '+91'} 
                        placeholder="Code"
                        onChange={e => handleUpdateAdditionalGuest(index, 'phone_code', e.target.value)}
                      />
                      <input type="text" className="premium-input" placeholder="Phone" value={guest.phone_raw} onChange={e => handleUpdateAdditionalGuest(index, 'phone_raw', e.target.value)} />
                    </div>
                  </div>
                </div>
              </div>
            ))}
            
            <button 
              type="button" 
              className="btn btn-outline" 
              onClick={handleAddAdditionalGuest} 
              style={{ height: '42px', width: '100%', fontSize: '0.85rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem', borderStyle: 'dashed', borderRadius: '10px', fontWeight: 600 }}
            >
              + Add More Guest / Contact Detail
            </button>
          </div>

          <datalist id="country-codes">
            {COUNTRY_CODES.map(c => (
              <option key={`${c.code}-${c.name}`} value={c.code}>{`${c.name} (${c.code})`}</option>
            ))}
          </datalist>

          {/* SECTION 3: STAY SCHEDULE */}
          <div className="form-section-card">
            <h3 className="form-section-title">
              <Calendar size={18} style={{ color: 'var(--primary)' }} /> Booking Schedule & Property
            </h3>
            
            <div className="grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem', marginBottom: '1.25rem' }}>
              <div className="form-group">
                <label className="premium-label">Check-in Date</label>
                <input 
                  type="date" 
                  required 
                  className="premium-input" 
                  value={bookingForm.check_in_date} 
                  onChange={e => {
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
                  }} 
                />
              </div>
              <div className="form-group">
                <label className="premium-label">Check-out Date</label>
                <input 
                  type="date" 
                  required 
                  className="premium-input" 
                  value={bookingForm.check_out_date} 
                  onChange={e => setBookingForm({...bookingForm, check_out_date: e.target.value})} 
                />
              </div>
            </div>

            <div className="grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem', marginBottom: '1.25rem' }}>
              <div className="form-group">
                <label className="premium-label">Accommodation Booking Scope</label>
                <select className="premium-select" value={bookingForm.booking_type} onChange={e => setBookingForm({...bookingForm, booking_type: e.target.value, room_ids: []})}>
                  <option value="Entire Property">Entire Property Booking</option>
                  <option value="Room">Individual Rooms Booking</option>
                </select>
              </div>
              <div className="form-group">
                <label className="premium-label">Select Property / Cottage</label>
                <select className="premium-select" value={bookingForm.cottage_id} onChange={e => setBookingForm({...bookingForm, cottage_id: e.target.value})}>
                  <option value="">Choose property...</option>
                  {cottages.filter(c => c.status === 'Available' || c.status === 'Active' || c.id === bookingForm.cottage_id).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
            </div>

            {bookingForm.booking_type === 'Room' && (
              <div className="form-group" style={{ marginBottom: '1.25rem' }}>
                <label className="premium-label">Assign Specific Rooms (Available for Entire Stay)</label>
                <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', padding: '1.25rem', background: 'var(--bg-secondary)', borderRadius: '12px', border: '1px solid var(--border)' }}>
                  {relevantRooms.length === 0 ? (
                    <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>{(!bookingForm.cottage_id) ? 'Please select a property/cottage first' : 'No rooms available for the entire selected duration.'}</span>
                  ) : relevantRooms.map(r => (
                    <label 
                      key={r.id} 
                      className={`badge-room ${bookingForm.room_ids.includes(r.id) ? 'selected' : ''}`}
                    >
                      <input 
                        type="checkbox" 
                        style={{ display: 'none' }}
                        checked={bookingForm.room_ids.includes(r.id)} 
                        onChange={e => {
                          const newIds = e.target.checked ? [...bookingForm.room_ids, r.id] : bookingForm.room_ids.filter(id => id !== r.id);
                          const newMap = { ...bookingForm.room_types_map };
                          if (e.target.checked) {
                            newMap[r.id] = r.room_type || 'Deluxe';
                          } else {
                            delete newMap[r.id];
                          }
                          const roomTypesString = newIds.map(id => {
                            const roomObj = rooms.find(room => room.id === id);
                            return roomObj ? (roomObj.room_type || 'Deluxe') : 'Deluxe';
                          }).join(', ');
                          setBookingForm({
                            ...bookingForm,
                            room_ids: newIds,
                            room_types_map: newMap,
                            room_type: roomTypesString || 'Deluxe'
                          });
                        }} 
                      />
                      {r.name}
                    </label>
                  ))}
                </div>

                {dailyAvailability.length > 0 && (
                  <div style={{ padding: '1rem', background: 'var(--bg-secondary)', borderRadius: '12px', border: '1px dashed var(--border)', marginTop: '1rem' }}>
                    <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '0.75rem' }}>Daily Room Availability</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                      {dailyAvailability.map(dayInfo => (
                        <div key={dayInfo.date.toISOString()} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                          <span style={{ fontWeight: 600, color: 'var(--text-color)' }}>{format(dayInfo.date, 'MMM d, yyyy')}</span>
                          <span style={{ color: dayInfo.availableRooms.length > 0 ? 'var(--success)' : 'var(--danger)', fontWeight: 500 }}>
                            {dayInfo.availableRooms.length > 0 ? dayInfo.availableRooms.map(r => r.name).join(', ') : 'Fully Booked'}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem' }}>
              <div className="form-group">
                <label className="premium-label">Breakfast Inclusions</label>
                <select className="premium-select" value={bookingForm.breakfast} onChange={e => setBookingForm({...bookingForm, breakfast: e.target.value})}>
                  <option value="NA">No Breakfast (NA)</option>
                  <option value="Included">Breakfast Included</option>
                </select>
              </div>
            </div>
          </div>

          {/* SECTION 4: OCCUPANCY DETAILS */}
          <div className="form-section-card">
            <h3 className="form-section-title">
              <Info size={18} style={{ color: 'var(--primary)' }} /> Occupancy & Document Details
            </h3>

            <div className="grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem', marginBottom: '1.25rem' }}>
              <div className="form-group">
                <label className="premium-label">Number of Guests (Adults & Children)</label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                  <input type="number" min="1" placeholder="Adults" className="premium-input" value={bookingForm.adults_count} onChange={e => setBookingForm({...bookingForm, adults_count: e.target.value === '' ? '' : Number(e.target.value)})} />
                  <input type="number" min="0" placeholder="Kids" className="premium-input" value={bookingForm.kids_count} onChange={e => setBookingForm({...bookingForm, kids_count: e.target.value === '' ? '' : Number(e.target.value)})} />
                </div>
              </div>
              <div className="form-group">
                <label className="premium-label">Guest Vehicle Number (Optional)</label>
                <input type="text" className="premium-input" placeholder="E.g. KA-01-MX-1234" value={bookingForm.vehicle_number || ''} onChange={e => setBookingForm({...bookingForm, vehicle_number: e.target.value})} />
              </div>
            </div>

            <div className="grid-2" style={{ display: 'grid', gridTemplateColumns: bookingForm.id_proof_type === 'Other' ? '1fr 1fr 2fr' : '1fr 2fr', gap: '1.25rem' }}>
              <div className="form-group">
                <label className="premium-label">Identification Document (ID Type)</label>
                <select className="premium-select" value={bookingForm.id_proof_type || 'Aadhar'} onChange={e => {
                  const type = e.target.value;
                  let val = bookingForm.id_proof_number || '';
                  if (type === 'Aadhar') {
                    val = val.replace(/\D/g, '').substring(0, 12);
                    val = val.match(/.{1,4}/g)?.join('-') || val;
                  } else if (type === 'Driving License') {
                    val = val.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
                    if (val.length > 4) val = val.substring(0, 4) + '-' + val.substring(4);
                  }
                  setBookingForm({...bookingForm, id_proof_type: type, id_proof_number: val});
                }}>
                  <option value="Aadhar">Aadhar Card</option>
                  <option value="Pan Card">Pan Card</option>
                  <option value="Driving License">Driving License</option>
                  <option value="Voter ID">Voter ID</option>
                  <option value="Passport">Passport</option>
                  <option value="Other">Other</option>
                </select>
              </div>
              {bookingForm.id_proof_type === 'Other' && (
                <div className="form-group">
                  <label className="premium-label">Specify Document Type</label>
                  <input type="text" className="premium-input" placeholder="E.g. Company ID" value={bookingForm.id_proof_other_type || ''} onChange={e => setBookingForm({...bookingForm, id_proof_other_type: e.target.value})} />
                </div>
              )}
              <div className="form-group">
                <label className="premium-label">ID Document Number</label>
                <input 
                  type="text" 
                  className="premium-input" 
                  placeholder="Enter identification card number" 
                  value={bookingForm.id_proof_number || ''} 
                  onChange={e => {
                    let val = e.target.value;
                    if (bookingForm.id_proof_type === 'Aadhar') {
                      val = val.replace(/\D/g, '').substring(0, 12);
                      val = val.match(/.{1,4}/g)?.join('-') || val;
                    } else if (bookingForm.id_proof_type === 'Driving License') {
                      val = val.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
                      if (val.length > 4) val = val.substring(0, 4) + '-' + val.substring(4);
                    }
                    setBookingForm({...bookingForm, id_proof_number: val});
                  }} 
                />
              </div>
            </div>
          </div>

          {/* SECTION 5: SERVICES & RESERVATION CHANNEL */}
          <div className="form-section-card">
            <h3 className="form-section-title">
              <Globe size={18} style={{ color: 'var(--primary)' }} /> Services & Distribution Channels
            </h3>

            <div className="grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem' }}>
              <div className="form-group">
                <label className="premium-label">Extra Add-on Services</label>
                <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', padding: '1rem', background: 'var(--bg-secondary)', borderRadius: '12px', border: '1px solid var(--border)' }}>
                  {['Food', 'Fire camp', 'BBQ'].map(addon => (
                    <label key={addon} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-color)' }}>
                      <input 
                        type="checkbox" 
                        style={{ accentColor: 'var(--primary)' }}
                        checked={bookingForm.addon_selections?.includes(addon)} 
                        onChange={e => {
                          const newSels = e.target.checked 
                            ? [...(bookingForm.addon_selections || []), addon] 
                            : (bookingForm.addon_selections || []).filter(a => a !== addon);
                          setBookingForm({...bookingForm, addon_selections: newSels});
                        }} 
                      />
                      {addon}
                    </label>
                  ))}
                  <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-color)' }}>
                    <input 
                      type="checkbox" 
                      style={{ accentColor: 'var(--primary)' }}
                      checked={bookingForm.addon_selections?.includes('Others')} 
                      onChange={e => {
                        const newSels = e.target.checked 
                          ? [...(bookingForm.addon_selections || []), 'Others'] 
                          : (bookingForm.addon_selections || []).filter(a => a !== 'Others');
                        setBookingForm({...bookingForm, addon_selections: newSels});
                      }} 
                    />
                    Others
                  </label>
                  {bookingForm.addon_selections?.includes('Others') && (
                    <input type="text" className="premium-input" style={{ width: '100%', marginTop: '0.5rem' }} placeholder="Specify custom add-on..." value={bookingForm.addon_others || ''} onChange={e => setBookingForm({...bookingForm, addon_others: e.target.value})} />
                  )}
                </div>
              </div>

              <div className="form-group">
                <label className="premium-label">Booking Source Channel</label>
                <select className="premium-select" value={bookingForm.booking_source} onChange={e => {
                  const src = e.target.value;
                  const defName = bookingForm.agent_name || agents[0] || '';
                  setBookingForm({
                    ...bookingForm,
                    booking_source: src,
                    agent_name: src === 'Agent' ? defName : '',
                    agent_phone: src === 'Agent' ? (bookingForm.agent_phone || agentPhones[defName] || '') : ''
                  });
                }}>
                  <option value="Direct">Direct Booking</option>
                  <option value="Airbnb">Airbnb</option>
                  <option value="Booking.com">Booking.com</option>
                  <option value="Agent">Agent Booking</option>
                  <option value="Other">Other Channel</option>
                </select>
                
                {bookingForm.booking_source === 'Agent' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '0.5rem' }}>
                    <select 
                      className="premium-select" 
                      value={agents.includes(bookingForm.agent_name) ? bookingForm.agent_name : (bookingForm.agent_name ? 'Other' : '')} 
                      onChange={e => {
                        const val = e.target.value;
                        setBookingForm({
                          ...bookingForm,
                          agent_name: val === 'Other' ? '' : val,
                          agent_phone: val && val !== 'Other' && agentPhones[val] ? agentPhones[val] : '',
                          is_custom_agent: val === 'Other'
                        });
                      }}
                      required
                    >
                      <option value="">Select registered agent...</option>
                      {agents.map(a => <option key={a} value={a}>{a}</option>)}
                      <option value="Other">+ Register New Agent...</option>
                    </select>
                    
                    {(bookingForm.is_custom_agent || (!agents.includes(bookingForm.agent_name) && bookingForm.agent_name)) && (
                      <input 
                        type="text" 
                        className="premium-input" 
                        placeholder="Enter new agent's name" 
                        value={bookingForm.agent_name} 
                        onChange={e => setBookingForm({...bookingForm, agent_name: e.target.value})} 
                        required 
                      />
                    )}
                    <input 
                      type="text" 
                      className="premium-input" 
                      placeholder="Agent's contact number" 
                      value={bookingForm.agent_phone || ''} 
                      onChange={e => setBookingForm({...bookingForm, agent_phone: e.target.value})} 
                    />
                  </div>
                )}
                {bookingForm.booking_source === 'Other' && (
                  <input 
                    type="text" 
                    className="premium-input" 
                    style={{ marginTop: '0.5rem' }} 
                    placeholder="Specify booking source channel" 
                    value={bookingForm.custom_booking_source || ''} 
                    onChange={e => setBookingForm({...bookingForm, custom_booking_source: e.target.value})} 
                    required
                  />
                )}
              </div>
            </div>
          </div>

          {/* SECTION 6: FINANCIAL ADJUSTMENTS */}
          <div className="form-section-card">
            <h3 className="form-section-title">
              <Wallet size={18} style={{ color: 'var(--primary)' }} /> Financial Adjustments & Status
            </h3>
            
            <div className="grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem', marginBottom: '1.25rem' }}>
              <div className="form-group">
                <label className="premium-label">Base Accommodation Charge (₹)</label>
                <input type="number" className="premium-input" value={bookingForm.base_amount} onChange={e => setBookingForm({...bookingForm, base_amount: e.target.value === '' ? '' : Number(e.target.value)})} />
              </div>
              <div className="form-group">
                <label className="premium-label">Advance Deposit Received (₹)</label>
                <input type="number" className="premium-input" value={bookingForm.advance_paid} onChange={e => setBookingForm({...bookingForm, advance_paid: e.target.value === '' ? '' : Number(e.target.value)})} />
              </div>
            </div>

            <div className="grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem', marginBottom: '1.25rem' }}>
              <div className="form-group">
                <label className="premium-label">Total Add-on Services Cost (₹)</label>
                <input type="number" className="premium-input" value={bookingForm.addons_cost} onChange={e => setBookingForm({...bookingForm, addons_cost: e.target.value === '' ? '' : Number(e.target.value)})} />
              </div>
              <div className="form-group">
                <label className="premium-label">Extra Guest / Occupancy Charges (₹)</label>
                <input type="number" className="premium-input" value={bookingForm.extra_guest_charges} onChange={e => setBookingForm({...bookingForm, extra_guest_charges: e.target.value === '' ? '' : Number(e.target.value)})} />
              </div>
            </div>

            <div className="grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem' }}>
              <div className="form-group">
                <label className="premium-label">Reservation Booking Status</label>
                <select className="premium-select" value={bookingForm.status} onChange={e => setBookingForm({...bookingForm, status: e.target.value})}>
                  <option value="Confirmed">Confirmed</option>
                  <option value="Pending">Pending</option>
                  {id && originalStatus !== 'Pending' && (
                    <>
                      <option value="Checked-in">Checked-in</option>
                      <option value="Checked-out">Checked-out</option>
                      <option value="Completed">Completed</option>
                    </>
                  )}
                  <option value="Cancelled">Cancelled</option>
                </select>
              </div>
            </div>
          </div>
          
        </div>

        {/* RIGHT COLUMN: STICKY RESERVATION RECEIPT */}
        <div className="form-right-col">
          <div className="sticky-receipt">
            <div className="receipt-header">
              <span>Booking Summary</span>
              <span className={`badge badge-${bookingForm.status === 'Confirmed' || bookingForm.status === 'Completed' ? 'success' : (bookingForm.status === 'Pending' ? 'warning' : 'danger')}`} style={{ fontSize: '0.75rem', padding: '0.25rem 0.75rem' }}>
                {bookingForm.status}
              </span>
            </div>

            {/* Dates widget */}
            <div className="timeline-widget">
              <div className="timeline-col">
                <span className="timeline-label">Check In</span>
                <span className="timeline-val">{bookingForm.check_in_date || '--'}</span>
              </div>
              <div style={{ color: '#cbd5e1', fontSize: '1.25rem', fontWeight: 600 }}>➔</div>
              <div className="timeline-col" style={{ textAlign: 'right' }}>
                <span className="timeline-label">Check Out</span>
                <span className="timeline-val">{bookingForm.check_out_date || '--'}</span>
              </div>
            </div>

            {/* General details */}
            <div className="receipt-row bold">
              <span>Property:</span>
              <span>{cottages.find(c => c.id === bookingForm.cottage_id)?.name || '--'}</span>
            </div>
            
            <div className="receipt-row">
              <span>Booking Scope:</span>
              <span>{bookingForm.booking_type}</span>
            </div>

            {bookingForm.booking_type === 'Room' && (
              <div className="receipt-row">
                <span>Rooms Assigned:</span>
                <span>
                  {bookingForm.room_ids.length > 0 
                    ? bookingForm.room_ids.map(rid => rooms.find(room => room.id === rid)?.name).filter(Boolean).join(', ')
                    : 'None selected'
                  }
                </span>
              </div>
            )}

            <div className="receipt-row">
              <span>Duration of Stay:</span>
              <span style={{ fontWeight: 700, color: 'var(--primary)' }}>
                {bookingForm.night_count} {bookingForm.night_count === 1 ? 'Night' : 'Nights'}
              </span>
            </div>

            <div className="receipt-row">
              <span>Total Occupants:</span>
              <span>{Number(bookingForm.adults_count || 1) + Number(bookingForm.kids_count || 0)} Guests</span>
            </div>

            <div style={{ width: '100%', height: '1px', background: '#cbd5e1', margin: '1.25rem 0' }}></div>

            {/* Financials list */}
            <div className="receipt-row">
              <span>Base Accommodation:</span>
              <span>₹{(bookingForm.base_amount || 0).toLocaleString()}</span>
            </div>
            {Number(bookingForm.extra_guest_charges || 0) > 0 && (
              <div className="receipt-row">
                <span>Extra Guest Fee:</span>
                <span>₹{Number(bookingForm.extra_guest_charges).toLocaleString()}</span>
              </div>
            )}
            {Number(bookingForm.addons_cost || 0) > 0 && (
              <div className="receipt-row">
                <span>Add-on Amenities:</span>
                <span>₹{Number(bookingForm.addons_cost).toLocaleString()}</span>
              </div>
            )}

            <div className="receipt-total-box">
              <div className="receipt-row bold" style={{ fontSize: '1rem', marginBottom: '0.5rem' }}>
                <span>Gross Total:</span>
                <span style={{ color: '#0F2C59', fontSize: '1.2rem', fontWeight: 800 }}>
                  ₹{(bookingForm.total_amount || 0).toLocaleString()}
                </span>
              </div>
              <div className="receipt-row" style={{ fontSize: '0.85rem', marginBottom: '0.5rem' }}>
                <span>Advance Paid:</span>
                <span style={{ color: 'var(--success)', fontWeight: 600 }}>
                  ₹{(bookingForm.advance_paid || 0).toLocaleString()}
                </span>
              </div>
              <div className="receipt-row bold" style={{ fontSize: '1rem', marginBottom: 0, borderTop: '1px solid #cbd5e1', paddingTop: '0.5rem', marginTop: '0.5rem' }}>
                <span>Balance Due:</span>
                <span style={{ color: bookingForm.balance_amount > 0 ? 'var(--danger)' : 'var(--success)', fontSize: '1.2rem', fontWeight: 800 }}>
                  ₹{(bookingForm.balance_amount || 0).toLocaleString()}
                </span>
              </div>
            </div>

            <button 
              type="submit" 
              className="btn btn-primary" 
              disabled={isSubmitting} 
              style={{ width: '100%', padding: '1.1rem', fontSize: '1.05rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.6rem', borderRadius: '12px', fontWeight: 800, boxShadow: '0 4px 15px rgba(5, 150, 105, 0.2)' }}
            >
              <CheckCircle2 size={20} /> {isSubmitting ? 'Processing...' : (id ? 'Save Reservation' : 'Confirm Booking')}
            </button>
          </div>
        </div>

      </form>
    </div>
  );
}
