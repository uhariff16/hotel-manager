import toast from 'react-hot-toast';
import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { CalendarCheck, CheckCircle2, ArrowLeft, User, Users, Calendar, Info, Globe, Wallet, Edit2, Save, ChevronUp, ChevronDown, ListCollapse, Trash2, Search, X, Lock, Camera } from 'lucide-react';
import { eachDayOfInterval, isWeekend, format } from 'date-fns';
import { useSettingsStore } from '../lib/store';
import IDScanner from '../components/IDScanner';

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
  const { activeResortId, profile, globalPlans } = useSettingsStore();
  
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const frontScannerRef = useRef();
  const [collapsedSections, setCollapsedSections] = useState({ 1: false, 2: false, 3: false, 4: false, 5: false, 6: false });
  const toggleSection = (id) => setCollapsedSections(prev => ({ ...prev, [id]: !prev[id] }));
  const focusTarget = new URLSearchParams(location.search).get('focus');
  useEffect(() => {
    if (focusTarget === 'checkout' && !loading) {
      setIsEditing(true);
      setTimeout(() => {
        const el = document.getElementById('check-out-date-input');
        if (el) {
          el.focus();
          try {
            el.showPicker();
          } catch(e) {}
        }
      }, 300);
    }
  }, [focusTarget, loading]);
  
  const handleClearForm = () => {
    setBookingForm({
      guest_name: '', guest_email: '', guest_company_name: '', guest_gstin: '', gst_amount: 0, gst_rate: 0, phone_number: '', phone_code: '+91', phone_raw: '', check_in_date: '', check_out_date: '', adults_count: 1, kids_count: 0,
      booking_type: 'Room', cottage_id: '', room_ids: [],
      night_count: 0, price_type: 'Calculated', base_amount: 0, extra_guest_charges: 0, addons_cost: 0,
      total_amount: 0, advance_paid: 0, balance_amount: 0, booking_source: 'Direct', status: 'Pending', is_loading_edit: false,
      reference_number: '', vehicle_number: '', id_proof_type: 'Aadhar', id_proof_other_type: '', id_proof_number: '', id_front_image_url: '', id_back_image_url: '', guest_address: '',
      addon_selections: [], addon_others: '', addon_costs_itemized: {},
      room_type: 'Deluxe',
      room_types_map: {},
      breakfast: 'NA',
      agent_name: '',
      agent_phone: '',
      is_custom_agent: false,
      additional_guests: [],
      is_ota_collected: false,
      ota_payment_status: 'Not Applicable',
      ota_channel: 'Airbnb',
      custom_ota_channel: ''
    });
    toast.success('Form cleared successfully');
  };

  const [isSearchingGuest, setIsSearchingGuest] = useState(false);
  const handleSearchGuest = async () => {
    const fullPhone = bookingForm.phone_code + bookingForm.phone_raw;
    if (!bookingForm.phone_raw) {
      toast.error('Please enter a phone number to search.');
      return;
    }
    
    setIsSearchingGuest(true);
    try {
      const { data, error } = await supabase
        .from('bookings')
        .select('guest_name, guest_email, id_proof_type, id_proof_number, vehicle_number, id_front_image_url, id_back_image_url, guest_door_no, guest_street, guest_city, guest_state, guest_pincode')
        .eq('tenant_id', profile?.tenant_id)
        .eq('phone_number', fullPhone)
        .order('created_at', { ascending: false })
        .limit(1);
        
      if (error) throw error;
      
      if (data && data.length > 0) {
        const guest = data[0];
        
        const standardTypes = ['Aadhar', 'Pan Card', 'Driving License', 'Voter ID', 'Passport'];
        const isStandard = standardTypes.includes(guest.id_proof_type || 'Aadhar');
        
        setBookingForm(prev => ({
          ...prev,
          guest_name: guest.guest_name || prev.guest_name,
          guest_email: guest.guest_email || prev.guest_email,
          vehicle_number: guest.vehicle_number || prev.vehicle_number, guest_door_no: guest.guest_door_no || prev.guest_door_no, guest_street: guest.guest_street || prev.guest_street, guest_city: guest.guest_city || prev.guest_city, guest_state: guest.guest_state || prev.guest_state, guest_pincode: guest.guest_pincode || prev.guest_pincode,
          id_proof_type: isStandard ? (guest.id_proof_type || 'Aadhar') : 'Other',
          id_proof_other_type: isStandard ? prev.id_proof_other_type : (guest.id_proof_type || ''),
          id_proof_number: guest.id_proof_number || prev.id_proof_number, id_front_image_url: guest.id_front_image_url || prev.id_front_image_url, id_back_image_url: guest.id_back_image_url || prev.id_back_image_url
        }));
        toast.success('Guest details found and populated!');
      } else {
        toast.error('No past guest found with this phone number.');
      }
    } catch (err) {
      toast.error('Failed to search guest details.');
    } finally {
      setIsSearchingGuest(false);
    }
  };

  const handleSaveAgent = async () => {
    if (!profile?.tenant_id || !bookingForm.agent_name) return;
    try {
      const { error } = await supabase.from('agents').upsert({
        tenant_id: profile.tenant_id,
        name: bookingForm.agent_name.trim(),
        phone: bookingForm.agent_phone ? bookingForm.agent_phone.trim() : null
      }, { onConflict: 'tenant_id,name' });
      if (error) throw error;
      toast.success("Agent saved to directory");
      
      // Update local state
      if (!agents.includes(bookingForm.agent_name.trim())) {
        setAgents([...agents, bookingForm.agent_name.trim()].sort());
      }
      setAgentPhones(prev => ({...prev, [bookingForm.agent_name.trim()]: bookingForm.agent_phone || ''}));
    } catch (e) {
      console.error(e);
      toast.error("Failed to save agent");
    }
  };

  const handleDeleteAgent = async () => {
    if (!profile?.tenant_id || !bookingForm.agent_name) return;
    if (!window.confirm("Are you sure you want to delete this agent from your directory?")) return;
    
    try {
      const { error } = await supabase.from('agents')
        .delete()
        .eq('tenant_id', profile.tenant_id)
        .eq('name', bookingForm.agent_name.trim());
      if (error) throw error;
      toast.success("Agent deleted from directory");
      
      setAgents(agents.filter(a => a !== bookingForm.agent_name.trim()));
      const newPhones = {...agentPhones};
      delete newPhones[bookingForm.agent_name.trim()];
      setAgentPhones(newPhones);
      
      setBookingForm({...bookingForm, agent_name: '', agent_phone: ''});
    } catch (e) {
      console.error(e);
      toast.error("Failed to delete agent");
    }
  };

  const toggleAllSections = () => {
    const anyCollapsed = Object.values(collapsedSections).some(v => v);
    if (anyCollapsed) setCollapsedSections({ 1: false, 2: false, 3: false, 4: false, 5: false, 6: false });
    else setCollapsedSections({ 1: true, 2: true, 3: true, 4: true, 5: true, 6: true });
  };

  const [isEditing, setIsEditing] = useState(!id || new URLSearchParams(location.search).get('edit') === 'true');
  const [financialsLocked, setFinancialsLocked] = useState(true);
  const [originalStatus, setOriginalStatus] = useState(null);
  const [settlementPaid, setSettlementPaid] = useState(0);
  
  const [cottages, setCottages] = useState([]);
  const [globalAddonPricing, setGlobalAddonPricing] = useState({});
  const [rooms, setRooms] = useState([]);
  const [activeBookings, setActiveBookings] = useState([]);

  const handleIDScanComplete = ({ side, url, aiData }) => {
    setBookingForm(prev => {
      const next = { ...prev };
      if (side === 'front') next.id_front_image_url = url;
      if (side === 'back') next.id_back_image_url = url;
      
      if (aiData) {
        // Extract everything found on the image, regardless of side
        if (aiData.name) {
          next.guest_name = aiData.name;
          next.highlight_guest_name = true;
        }
        if (aiData.idType) {
          next.id_proof_type = aiData.idType;
          next.highlight_id_proof_type = true;
        }
        if (aiData.idNumber) {
          next.id_proof_number = aiData.idNumber;
          next.highlight_id_proof_number = true;
        }
        if (aiData.door_no) {
          next.guest_door_no = aiData.door_no;
          next.highlight_guest_door_no = true;
        }
        if (aiData.street) {
          next.guest_street = aiData.street;
          next.highlight_guest_street = true;
        }
        if (aiData.city) {
          next.guest_city = aiData.city;
          next.highlight_guest_city = true;
        }
        if (aiData.state) {
          next.guest_state = aiData.state;
          next.highlight_guest_state = true;
        }
        if (aiData.pincode) {
          next.guest_pincode = aiData.pincode;
          next.highlight_guest_pincode = true;
        }
      }
      return next;
    });
  };
  const handleAdditionalGuestIDScanComplete = (index, { side, url, aiData }) => {
    setBookingForm(prev => {
      const guests = [...(prev.additional_guests || [])];
      const g = { ...guests[index] };
      
      if (side === 'front') g.id_front_image_url = url;
      if (side === 'back') g.id_back_image_url = url;
      
      if (aiData) {
        if (aiData.name) { g.name = aiData.name; g.highlight_name = true; }
        if (aiData.idType) { g.id_proof_type = aiData.idType; g.highlight_id_type = true; }
        if (aiData.idNumber) { g.id_proof_number = aiData.idNumber; g.highlight_id_number = true; }
        if (aiData.door_no) { g.guest_door_no = aiData.door_no; g.highlight_guest_door_no = true; }
          if (aiData.street) { g.guest_street = aiData.street; g.highlight_guest_street = true; }
          if (aiData.city) { g.guest_city = aiData.city; g.highlight_guest_city = true; }
          if (aiData.state) { g.guest_state = aiData.state; g.highlight_guest_state = true; }
          if (aiData.pincode) { g.guest_pincode = aiData.pincode; g.highlight_guest_pincode = true; }
      }
      
      guests[index] = g;
      return { ...prev, additional_guests: guests };
    });
  };


    const [bookingForm, setBookingForm] = useState({
    guest_name: '', guest_email: '', guest_company_name: '', guest_gstin: '', gst_amount: 0, gst_rate: 0, phone_number: '', phone_code: '+91', phone_raw: '', check_in_date: '', check_out_date: '', adults_count: 1, kids_count: 0,
    booking_type: 'Room', cottage_id: '', room_ids: [],
    night_count: 0, price_type: 'Calculated', base_amount: 0, extra_guest_charges: 0, addons_cost: 0,
    total_amount: 0, advance_paid: 0, balance_amount: 0, discount_amount: 0, booking_source: 'Direct', status: 'Pending', is_loading_edit: false,
    reference_number: '', vehicle_number: '', id_proof_type: 'Aadhar', id_proof_other_type: '', id_proof_number: '',
    addon_selections: [], addon_others: '', addon_costs_itemized: {},
    room_type: 'Deluxe',
    room_types_map: {},
    breakfast: 'NA',
    agent_name: '',
    agent_phone: '',
    is_custom_agent: false,
    additional_guests: [],
    is_ota_collected: false,
    ota_payment_status: 'Not Applicable',
    ota_channel: 'Airbnb',
    custom_ota_channel: ''
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

      const [cts, rms, plansRes, ratesRes, propRatesRes, resortRes] = await Promise.all([
        cottagesQuery,
        roomsQuery,
        supabase.from('rate_plans').select('*').eq('resort_id', activeResortId),
        supabase.from('category_rates').select('*, rate_plans!inner(resort_id)').eq('rate_plans.resort_id', activeResortId),
        supabase.from('property_rates').select('*, rate_plans!inner(resort_id)').eq('rate_plans.resort_id', activeResortId),
        supabase.from('resorts').select('addon_pricing').eq('id', activeResortId).single()
      ]);
      setCottages(cts.data || []);
      setRooms(rms.data || []);
      if (resortRes.data?.addon_pricing) {
        setGlobalAddonPricing(resortRes.data.addon_pricing);
      }
      
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

      // Fetch agents from the new agents table
      let fetchedAgents = [];
      try {
        if (profile?.tenant_id) {
          const { data: dbAgents, error: agentsErr } = await supabase
            .from('agents')
            .select('name, phone')
            .eq('tenant_id', profile.tenant_id);
            
          if (!agentsErr && dbAgents) {
            const dbAgentsMap = {};
            dbAgents.forEach(a => {
              if (a.name) dbAgentsMap[a.name] = a.phone || '';
            });
            fetchedAgents = dbAgents.map(a => a.name).sort();
            setAgentPhones(dbAgentsMap);
          }
        }
      } catch (e) {
        console.warn("Could not load agents from table:", e);
      }
      setAgents(fetchedAgents);

      // Fetch active bookings
      try {
        const { data: bks, error: bksErr } = await supabase
          .from('bookings')
          .select('id, cottage_id, room_ids, booking_type, status, check_in_date, check_out_date, booking_source')
          .eq('resort_id', activeResortId)
          .neq('status', 'Cancelled')
          .neq('status', 'Checked-out')
          .neq('status', 'Completed');
          
        if (!bksErr && bks) {
          setActiveBookings(bks);
        }
      } catch (e) {
        console.warn("Could not load active bookings:", e);
      }

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
                  const pgPhone = parsePhone(g.phone || g.phone_number || (g.phone_code ? g.phone_code+g.phone_raw : ''));
                  return {
                    name: g.name || '',
                    email: g.email || '',
                    phone_code: g.phone_code || pgPhone.code,
                    phone_raw: g.phone_raw || pgPhone.raw,
                    id_proof_type: g.id_proof_type || 'Aadhar',
                    id_proof_number: g.id_proof_number || '',
                    guest_door_no: g.guest_door_no || '',
                    guest_street: g.guest_street || '',
                    guest_city: g.guest_city || '',
                    guest_state: g.guest_state || '',
                    guest_pincode: g.guest_pincode || '',
                    id_front_image_url: g.id_front_image_url || '',
                    id_back_image_url: g.id_back_image_url || ''
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
            discount_amount: b.discount_amount || 0,
            balance_amount: b.balance_amount || 0,
            booking_source: (() => {
              if (!b.booking_source) return 'Direct';
              if (b.booking_source.startsWith('Agent')) return 'Agent';
              if (b.booking_source === 'Direct') return 'Direct';
              const otas = ['Airbnb', 'Booking.com', 'Agoda', 'MakeMyTrip', 'Goibibo', 'Expedia', 'Cleartrip', 'EaseMyTrip'];
              if (otas.includes(b.booking_source) || (b.ota_payment_status && b.ota_payment_status !== 'Not Applicable')) return 'OTA';
              return 'Other';
            })(),
            ota_channel: (() => {
              const otas = ['Airbnb', 'Booking.com', 'Agoda', 'MakeMyTrip', 'Goibibo', 'Expedia', 'Cleartrip', 'EaseMyTrip'];
              if (otas.includes(b.booking_source)) return b.booking_source;
              if (b.ota_payment_status && b.ota_payment_status !== 'Not Applicable') return 'Other OTA';
              return 'Airbnb';
            })(),
            custom_ota_channel: (() => {
              const otas = ['Airbnb', 'Booking.com', 'Agoda', 'MakeMyTrip', 'Goibibo', 'Expedia', 'Cleartrip', 'EaseMyTrip'];
              if (b.ota_payment_status && b.ota_payment_status !== 'Not Applicable' && !otas.includes(b.booking_source)) return b.booking_source;
              return '';
            })(),
            agent_name: (() => {
              const { isAgent, name } = parseAgentSource(b.booking_source);
              return isAgent ? name : '';
            })(),
            agent_phone: (() => {
              const { isAgent, phone } = parseAgentSource(b.booking_source);
              return isAgent ? phone : '';
            })(),
            is_custom_agent: false,
            custom_booking_source: (() => {
              if (!b.booking_source) return '';
              if (b.booking_source.startsWith('Agent') || b.booking_source === 'Direct') return '';
              const otas = ['Airbnb', 'Booking.com', 'Agoda', 'MakeMyTrip', 'Goibibo', 'Expedia', 'Cleartrip', 'EaseMyTrip'];
              if (otas.includes(b.booking_source) || (b.ota_payment_status && b.ota_payment_status !== 'Not Applicable')) return '';
              return b.booking_source;
            })(),
            status: b.status,
            reference_number: b.reference_number || '',
            vehicle_number: b.vehicle_number || '',
            id_proof_type: ['Aadhar', 'Pan Card', 'Driving License', 'Voter ID', 'Passport'].includes(b.id_proof_type || 'Aadhar') ? (b.id_proof_type || 'Aadhar') : 'Other',
            id_proof_other_type: ['Aadhar', 'Pan Card', 'Driving License', 'Voter ID', 'Passport'].includes(b.id_proof_type || 'Aadhar') ? '' : (b.id_proof_type || ''),
            id_proof_number: b.id_proof_number || '', guest_address: b.guest_address || '', id_front_image_url: b.id_front_image_url || '', id_back_image_url: b.id_back_image_url || '',
              guest_door_no: b.guest_door_no || '',
              guest_street: b.guest_street || '',
              guest_city: b.guest_city || '',
              guest_state: b.guest_state || '',
              guest_pincode: b.guest_pincode || '',
            price_type: b.price_type || 'Calculated',
            addon_selections: selections,
            addon_costs_itemized: b.addon_costs_itemized || {},
            addon_others: othersText.join(', '),
            is_loading_edit: true,
            room_type: b.room_type || 'Deluxe',
            room_types_map: initialMap,
            breakfast: b.breakfast || 'NA',
            additional_guests: rawAdditionalGuests,
            is_ota_collected: b.ota_payment_status === 'Pending OTA Settlement' || b.ota_payment_status === 'Settled',
            ota_payment_status: b.ota_payment_status || 'Not Applicable'
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
          
          setSettlementPaid(totalSettled);
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
    if (!check_in_date || !check_out_date) {  return; }

    const start = new Date(check_in_date);
    const end = new Date(check_out_date);
    if (end <= start) { setBookingForm(prev => ({ ...prev, night_count: 0 })); return; }

    const days = eachDayOfInterval({ start, end: new Date(end.getTime() - 24*60*60*1000) });
    const nightCount = days.length;

    if (bookingForm.is_loading_edit) { setBookingForm(prev => ({ ...prev, night_count: nightCount, is_loading_edit: false })); return; }

    if (!cottage_id) { setBookingForm(prev => ({ ...prev, night_count: nightCount, base_amount: 0 })); return; }

    let itemPricingArray = [];
    if (booking_type === 'Entire Property') {
      const c = cottages.find(c => String(c.id) === String(cottage_id));
      if (c) itemPricingArray.push(c);
    } else {
      if (!room_ids || room_ids.length === 0) { setBookingForm(prev => ({ ...prev, night_count: nightCount, base_amount: 0 })); return; }
      itemPricingArray = room_ids.map(id => rooms.find(r => String(r.id) === String(id))).filter(Boolean);
    }

    if (itemPricingArray.length === 0) { setBookingForm(prev => ({ ...prev, night_count: nightCount })); return; }

    let base = 0;
    const ratePlans = window.__bookingRatePlans || [];
    const catRates = window.__bookingCategoryRates || [];
    const propRates = window.__bookingPropertyRates || [];

    let appliedPlansSet = new Set();

    days.forEach(d => {
      let daily = 0;
      const isWknd = (d.getDay() === 5 || d.getDay() === 6);
      const dayOfWeek = d.getDay();
      
      const dateStr = [
        d.getFullYear(),
        String(d.getMonth() + 1).padStart(2, '0'),
        String(d.getDate()).padStart(2, '0')
      ].join('-');

      const activePlans = ratePlans.filter(rp => {
        if (rp.start_date && dateStr < rp.start_date) return false;
        if (rp.end_date && dateStr > rp.end_date) return false;
        if (rp.days_of_week && rp.days_of_week.length > 0 && !rp.days_of_week.includes(dayOfWeek)) return false;
        return true;
      }).sort((a, b) => (b.priority || 0) - (a.priority || 0));

      if (activePlans.length === 0) {
        const legacyName = isWknd ? 'weekend' : 'weekday';
        const legacyPlan = ratePlans.find(rp => rp.name && rp.name.toLowerCase() === legacyName);
        if (legacyPlan) activePlans.push(legacyPlan);
      }
      
      itemPricingArray.forEach(item => {
        let foundPrice = false;

        if (booking_type === 'Entire Property') {
          for (const plan of activePlans) {
            const propRateRecord = propRates.find(r => r.cottage_id === item.id && r.rate_plan_id === plan.id);
            if (propRateRecord) {
              daily += Number(propRateRecord.price || 0);
              appliedPlansSet.add(plan.name || 'Unnamed Plan');
              foundPrice = true;
              break;
            }
          }
        } else {
          for (const plan of activePlans) {
            if (item.category_id) {
              const rateRecord = catRates.find(r => r.category_id === item.category_id && r.rate_plan_id === plan.id);
              if (rateRecord) {
                daily += Number(rateRecord.price || 0);
                appliedPlansSet.add(plan.name);
                foundPrice = true;
                break;
              }
            }
          }
        }
        
        if (!foundPrice) {
          if (isWknd) {
             daily += Number(item.weekend_price || 0);
             appliedPlansSet.add('Base Weekend');
          } else {
             daily += Number(item.weekday_price || 0);
             appliedPlansSet.add('Base Weekday');
          }
        }
      });
      base += daily;
    });

    const appliedPlans = Array.from(appliedPlansSet).join(', ');

    
    setBookingForm(prev => ({
      ...prev,
      night_count: nightCount,
      base_amount: base,
      applied_rate_plans: appliedPlans
    }));
  };

  useEffect(() => {
    calculateBasePrice();
  }, [bookingForm.check_in_date, bookingForm.check_out_date, bookingForm.booking_type, bookingForm.cottage_id, JSON.stringify(bookingForm.room_ids), cottages, rooms]);

  useEffect(() => {
    const cottagePricing = cottages.find(c => c.id === bookingForm.cottage_id)?.addon_pricing || {};
    const effectivePricing = { ...globalAddonPricing, ...cottagePricing };
    const totalGuests = Number(bookingForm.adults_count || 0) + Number(bookingForm.kids_count || 0);

    let updatedItemized = { ...(bookingForm.addon_costs_itemized || {}) };
    let totalCost = 0;
    
    // Check if guest count changed to trigger recalculation for per-person items
    const guestsChanged = updatedItemized['_last_guests'] !== undefined && updatedItemized['_last_guests'] !== totalGuests;

    const processAddon = (item, isSelected, isPerPerson = false) => {
      if (isSelected) {
        if (updatedItemized[item] === undefined || (isPerPerson && guestsChanged)) {
           const basePrice = effectivePricing[item] || 0;
           updatedItemized[item] = isPerPerson ? basePrice * Math.max(1, totalGuests) : basePrice;
        }
        totalCost += Number(updatedItemized[item] || 0);
      } else {
        delete updatedItemized[item];
      }
    };

    processAddon('breakfast', bookingForm.breakfast === 'Included', true);
    
    ['Fire camp', 'BBQ', 'Food'].forEach(addon => {
      // Assuming Food is also per person? The user only specified Breakfast, but let's just keep others as flat unless specified. 
      // User said "Like-wise other add-ons as well" - meaning if they are selected, they should be highlighted and cost included (which we did).
      // We will make Food per-person as well just in case, and BBQ/Fire camp flat.
      processAddon(addon, (bookingForm.addon_selections || []).includes(addon), addon === 'Food');
    });
    
    const isOthers = (bookingForm.addon_selections || []).includes('Others');
    if (isOthers) {
      if (updatedItemized['Others'] === undefined) updatedItemized['Others'] = 0;
      totalCost += Number(updatedItemized['Others'] || 0);
    } else {
      delete updatedItemized['Others'];
    }

    updatedItemized['_last_guests'] = totalGuests;

    if (JSON.stringify(updatedItemized) !== JSON.stringify(bookingForm.addon_costs_itemized) || totalCost !== bookingForm.addons_cost) {
      setBookingForm(prev => ({ ...prev, addon_costs_itemized: updatedItemized, addons_cost: totalCost }));
    }
  }, [bookingForm.cottage_id, JSON.stringify(bookingForm.addon_selections), bookingForm.breakfast, JSON.stringify(bookingForm.addon_costs_itemized), JSON.stringify(globalAddonPricing), cottages, bookingForm.adults_count, bookingForm.kids_count]);

  useEffect(() => {
    const base = Number(bookingForm.base_amount || 0);
    const addons = Number(bookingForm.addons_cost || 0);
    const extraGuests = Number(bookingForm.extra_guest_charges || 0);
    
    let rawTotal = base + addons + extraGuests;
    
    const tenantGst = profile?.global_settings?.tenant_gst || {};
    let computedGstAmount = 0;
    let computedGstRate = 0;
    
    if (tenantGst.enabled) {
      const nights = Number(bookingForm.night_count) || 1;
      const numRooms = bookingForm.booking_type === 'Entire Property' ? 1 : Math.max(1, bookingForm.room_ids?.length || 1);
      const roomValuePerDay = base / nights / numRooms;
      
      const threshold = Number(tenantGst.slabThreshold) || 7500;
      const lowerRate = Number(tenantGst.lowerRate) || 5;
      const higherRate = Number(tenantGst.higherRate) || 18;

      computedGstRate = roomValuePerDay <= threshold ? lowerRate : higherRate;
      computedGstAmount = Math.round(rawTotal * (computedGstRate / 100));
      rawTotal += computedGstAmount;
    }
    
    const discountedTotal = Math.max(0, rawTotal - Number(bookingForm.discount_amount || 0));
    let balance = Math.max(0, discountedTotal - Number(bookingForm.advance_paid || 0));
    
    if (bookingForm.is_ota_collected) {
      // OTA only owes base + their portion of GST. Guest owes extra guests + addons + their GST
      let guestLiabilityRaw = addons + extraGuests;
      let otaLiabilityRaw = base;
      
      let otaGst = 0;
      let guestGst = 0;
      if (tenantGst.enabled) {
          const ratio = (computedGstAmount > 0 && rawTotal > 0) ? (computedGstAmount / rawTotal) : 0;
          otaGst = Math.round(otaLiabilityRaw * ratio);
          guestGst = computedGstAmount - otaGst;
      }
      
      const discountedGuestLiability = Math.max(0, guestLiabilityRaw + guestGst - Number(bookingForm.discount_amount || 0));
      balance = Math.max(0, discountedGuestLiability - Number(bookingForm.advance_paid || 0));
    }
    
    setBookingForm(prev => ({
      ...prev,
      gst_amount: computedGstAmount,
      gst_rate: computedGstRate,
      total_amount: discountedTotal,
      balance_amount: balance
    }));
  }, [bookingForm.base_amount, bookingForm.addons_cost, bookingForm.advance_paid, bookingForm.extra_guest_charges, bookingForm.night_count, bookingForm.booking_type, bookingForm.room_ids, bookingForm.is_ota_collected, bookingForm.discount_amount, settlementPaid, profile]);

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
    
    if (bookingForm.booking_type === 'Entire Property') {
       const unavailableRooms = relevantRooms.filter(r => !r.isAvailable);
       if (unavailableRooms.length > 0) {
          setError(`Cannot book Entire Property. The following rooms are already booked for these dates: ${unavailableRooms.map(r => r.name).join(', ')}`);
          window.scrollTo(0, 0);
          return;
       }
    } else if (bookingForm.booking_type === 'Room' && bookingForm.room_ids.length === 0) {
       setError("Please select at least one room.");
       window.scrollTo(0, 0);
       return;
    }

    if (isSubmitting) return;
    setIsSubmitting(true);
    setError(null);

    try {
      const formattedAdditionalGuests = (bookingForm.additional_guests || []).map(g => ({
          name: g.name,
          email: g.email || '',
          phone: g.phone_code + g.phone_raw,
          phone_code: g.phone_code,
          phone_raw: g.phone_raw,
          id_proof_type: g.id_proof_type === 'Other' ? g.id_proof_other_type : (g.id_proof_type || 'Aadhar'),
          id_proof_number: g.id_proof_number || '',
          guest_door_no: g.guest_door_no || '',
          guest_street: g.guest_street || '',
          guest_city: g.guest_city || '',
          guest_state: g.guest_state || '',
          guest_pincode: g.guest_pincode || '',
          id_front_image_url: g.id_front_image_url || '',
          id_back_image_url: g.id_back_image_url || ''
        }));

      // Auto-upsert Agent if applicable
      if (bookingForm.booking_source === 'Agent' && profile?.tenant_id) {
        const agName = (bookingForm.agent_name || agents[0] || 'Unknown').trim();
        const agPhone = bookingForm.agent_phone ? bookingForm.agent_phone.trim() : null;
        if (agName && agName !== 'Unknown' && agName !== 'Other') {
          supabase.from('agents').upsert({
            tenant_id: profile.tenant_id,
            name: agName,
            phone: agPhone
          }, { onConflict: 'tenant_id,name' }).then(({ error }) => {
            if (error) console.error("Auto-upsert agent error:", error);
          });
        }
      }

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
        discount_amount: bookingForm.discount_amount,
        balance_amount: bookingForm.balance_amount,
        status: bookingForm.status,
        reference_number: bookingForm.reference_number,
        vehicle_number: bookingForm.vehicle_number,
        id_proof_type: bookingForm.id_proof_type === 'Other' ? bookingForm.id_proof_other_type : bookingForm.id_proof_type,
        id_proof_number: bookingForm.id_proof_number,
        addon_costs_itemized: bookingForm.addon_costs_itemized,
        addon_details: bookingForm.addon_selections.map(s => s === 'Others' ? bookingForm.addon_others : s).filter(Boolean).join(', '),
        booking_source: bookingForm.booking_source === 'OTA' ? (bookingForm.ota_channel === 'Other OTA' ? bookingForm.custom_ota_channel : bookingForm.ota_channel)
                      : bookingForm.booking_source === 'Other' ? bookingForm.custom_booking_source 
                      : bookingForm.booking_source === 'Agent' ? `Agent: ${(bookingForm.agent_name || agents[0] || 'Unknown').trim()}${bookingForm.agent_phone ? ' | ' + bookingForm.agent_phone.trim() : ''}`
                      : bookingForm.booking_source,
        price_type: bookingForm.price_type,
        room_type: bookingForm.room_type,
        breakfast: bookingForm.breakfast,
        additional_guests: formattedAdditionalGuests,
        guest_door_no: bookingForm.guest_door_no,
          guest_street: bookingForm.guest_street,
          guest_city: bookingForm.guest_city,
          guest_state: bookingForm.guest_state,
          guest_pincode: bookingForm.guest_pincode,
          id_front_image_url: bookingForm.id_front_image_url,
          id_back_image_url: bookingForm.id_back_image_url,
        guest_company_name: bookingForm.guest_company_name,
        guest_gstin: bookingForm.guest_gstin,
        gst_amount: bookingForm.gst_amount,
        gst_rate: bookingForm.gst_rate,
        payment_method: bookingForm.is_ota_collected ? 'OTA' : 'Direct',
        ota_payment_status: bookingForm.is_ota_collected 
          ? (bookingForm.ota_payment_status === 'Settled' ? 'Settled' : 'Pending OTA Settlement')
          : 'Not Applicable'
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
          const { room_type, breakfast, additional_guests, guest_door_no, guest_street, guest_city, guest_state, guest_pincode, guest_company_name, guest_gstin, gst_amount, gst_rate, addon_costs_itemized, ...cleanData } = bookingData;
          result = await supabase.from('bookings').update(cleanData).eq('id', id);
        }
      } else {
        result = await supabase.from('bookings').insert([bookingData]).select();
        if (result.error && (result.error.message?.includes('column') || result.error.code === '42703')) {
          alert("Notice: Room Type, Breakfast, Additional Guests, or Guest Address columns could not be saved to the database. Please run the SQL migration scripts in your Supabase SQL Editor to add these columns.");
          console.warn("DB columns missing. Retrying save without them.");
          const { room_type, breakfast, additional_guests, guest_door_no, guest_street, guest_city, guest_state, guest_pincode, guest_company_name, guest_gstin, gst_amount, gst_rate, addon_costs_itemized, ...cleanData } = bookingData;
          result = await supabase.from('bookings').insert([cleanData]).select();
        }
      }

      if (result.error) throw result.error;

      const targetId = id || result.data?.[0]?.id;
      
      // Synchronize advance payment with incomes table
      if (targetId) {
        try {
          const { data: existingIncomes } = await supabase
            .from('incomes')
            .select('id, amount, notes')
            .eq('booking_id', targetId);
            
          const guestIncomes = (existingIncomes || []).filter(inc => {
            const notes = inc.notes?.toLowerCase() || '';
            if (notes.includes('ota settlement')) return false;
            return notes.includes('advance') || notes.includes('adjustment') || notes.includes('refund') || notes.includes('settlement');
          });
          
          const totalLogged = guestIncomes.reduce((sum, inc) => sum + Number(inc.amount), 0);
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
              date: new Date().toLocaleDateString('en-CA'),
              payment_mode: 'UPI'
            }]);
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
    
        return baseRooms.map(r => ({ ...r, isAvailable: !bookedRoomIds.has(r.id) || bookingForm.room_ids.includes(r.id) }));
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

  // Helper derived state for Masked Guest Receipt (OTA bookings)
  let guestGstReceipt = 0;
  if (bookingForm.is_ota_collected && bookingForm.gst_rate > 0) {
      const guestLiabilityRaw = Number(bookingForm.addons_cost || 0) + Number(bookingForm.extra_guest_charges || 0);
      guestGstReceipt = Math.round(guestLiabilityRaw * (bookingForm.gst_rate / 100));
  }
  const guestTotalReceipt = Math.max(0, Number(bookingForm.addons_cost || 0) + Number(bookingForm.extra_guest_charges || 0) + guestGstReceipt - Number(bookingForm.discount_amount || 0));

  return (
    <div className="container" style={{ maxWidth: '1200px', margin: '0 auto', padding: '2rem 1.5rem', fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
      

      <button 
        className="btn btn-outline" 
        onClick={() => navigate('/bookings')} 
        style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem', borderRadius: '8px', padding: '0.5rem 1rem' }}
      >
        <ArrowLeft size={16} /> Back to Reservations
      </button>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
          <h2 className="booking-page-title" style={{ margin: 0 }}>
            <CalendarCheck size={28} /> {id ? `Reservation: ${bookingForm.reference_number || ''}` : 'Create New Reservation'}
          </h2>
          <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
            {!id && (
              <button 
                type="button" 
                className="btn btn-outline" 
                onClick={handleClearForm}
                style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', borderRadius: '8px', padding: '0.5rem 1rem', color: 'var(--danger)', borderColor: 'rgba(239, 68, 68, 0.3)' }}
              >
                <Trash2 size={16} /> Clear Form
              </button>
            )}
            {id && (
              <button 
                type="button" 
                className={`btn-edit-toggle ${isEditing ? 'mode-save' : 'mode-edit'}`} 
                onClick={(e) => {
                  e.preventDefault();
                  if (isEditing) {
                    const form = document.getElementById('booking-form-main');
                    if (form) {
                      form.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
                    }
                  } else {
                    setIsEditing(true);
                  }
                }}
                
              >
                {isEditing ? <Save size={16} /> : <Edit2 size={16} />}
                {isEditing ? 'Save Changes' : 'Edit Booking'}
              </button>
            )}
          </div>
      </div>
      
      {error && (
        <div style={{ color: 'var(--danger)', marginBottom: '1.5rem', padding: '1rem', background: 'rgba(229, 62, 62, 0.08)', borderRadius: '8px', border: '1px solid rgba(229, 62, 62, 0.15)', fontSize: '0.9rem' }}>
          {error}
        </div>
      )}

      {id && bookingForm.status === 'Completed' && isEditing && (
        <div style={{ marginBottom: '1.5rem', padding: '1rem', background: '#fff3cd', color: '#856404', borderRadius: '8px', border: '1px solid #ffeeba', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <strong style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Lock size={18} /> This booking is Completed and fully settled.
          </strong>
          <span style={{ fontSize: '0.9rem' }}>Editing a completed booking may alter financial records and historical receipts. Please confirm before making changes.</span>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontWeight: 600, marginTop: '0.5rem' }}>
            <input type="checkbox" checked={!financialsLocked} onChange={() => setFinancialsLocked(!financialsLocked)} style={{ accentColor: '#856404', width: '16px', height: '16px' }} />
            Unlock booking for editing
          </label>
        </div>
      )}

      <form id="booking-form-main" onSubmit={handleSubmit} className="booking-layout">
        <fieldset disabled={!isEditing || (bookingForm.status === 'Completed' && financialsLocked)} style={{ border: 'none', padding: 0, margin: 0, display: 'contents' }}>
          {/* LEFT COLUMN: FORM DETAILS */}
        <div className="form-left-col">

          {/* RESERVATION STATUS AT TOP */}
          <div className="form-section-card" style={{ padding: '1.5rem 2.25rem', border: '1px solid var(--primary)', background: 'rgba(16, 185, 129, 0.02)' }}>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="premium-label" style={{ fontWeight: 800, fontSize: '0.85rem', color: 'var(--primary)', textTransform: 'uppercase' }}>Reservation Booking Status</label>
              <select disabled={!isEditing} className="premium-select" style={{ border: '2px solid rgba(16,185,129,0.3) !important' }} value={bookingForm.status} onChange={e => setBookingForm({...bookingForm, status: e.target.value})}>
                <option value="Confirmed">Confirmed</option>
                <option value="Pending">Pending</option>
                {id && originalStatus !== 'Pending' && (
                  <>
                    <option value="Checked-in">Checked-in</option>
                    <option value="Checked-out">Checked-out</option>
                    <option value="Completed">Completed</option>
                  </>
                )}
                {id && <option value="Cancelled">Cancelled</option>}
              </select>
            </div>
          </div>

          
          {/* SECTION 1: PRIMARY GUEST & OCCUPANCY DETAILS */}
          <div className={`form-section-card ${collapsedSections[1] ? 'collapsed' : ''}`}>
            <h3 className="form-section-title" onClick={() => toggleSection(1)}>
              <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><User size={18} style={{ color: 'var(--primary)' }} /> Primary Guest & Occupancy Details</span>
              {collapsedSections[1] ? <ChevronDown size={20} style={{ color: 'var(--text-muted)' }} /> : <ChevronUp size={20} style={{ color: 'var(--text-muted)' }} />}
            </h3>
              <div style={{ background: 'rgba(34, 197, 94, 0.05)', border: '1px dashed #22c55e', borderRadius: '12px', padding: '1.25rem', marginBottom: '1.5rem', marginTop: '1.5rem' }}>
                  <label className="premium-label" style={{ color: 'var(--primary)', fontSize: '1rem', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <Camera size={18} /> AI Smart Capture (Auto-Fill)
                  </label>
                  <p style={{ margin: '0 0 1rem 0', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                    Take a photo of the guest's ID to instantly auto-fill the form. <strong>Start with the Front page.</strong>
                  </p>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem' }}>
                    <IDScanner 
                      ref={frontScannerRef}
                      side="front" 
                      tenantId={profile?.tenant_id} 
                      existingUrl={bookingForm.id_front_image_url}
                      onScanComplete={handleIDScanComplete} 
                    />
                    <IDScanner 
                      side="back" 
                      tenantId={profile?.tenant_id} 
                      existingUrl={bookingForm.id_back_image_url}
                      onScanComplete={handleIDScanComplete} 
                    />
                  </div>
              </div>
            
            <div className="grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem', marginBottom: '1.25rem' }}>
              <div className="form-group">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.25rem' }}>
                    <label className="premium-label" style={{ marginBottom: 0 }}>Primary Guest Full Name {bookingForm.highlight_guest_name && <span style={{marginLeft:'5px'}} title="Auto-filled by AI">✨</span>}</label>
                  </div>
                <input disabled={!isEditing} 
                  type="text" 
                  required 
                  className={`premium-input ${bookingForm.highlight_guest_name ? 'ai-highlight' : ''}`}
                    placeholder="Enter guest's first & last name"
                  style={{ backgroundColor: bookingForm.highlight_guest_name ? '#ecfdf5' : '' }}
                  value={bookingForm.guest_name} 
                  onChange={e => setBookingForm({...bookingForm, guest_name: e.target.value, highlight_guest_name: false})} 
                />
              </div>
              <div className="form-group">
                <label className="premium-label">Email Address (Optional)</label>
                <input disabled={!isEditing} 
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
                <label className="premium-label" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span>Mobile Contact Number</span>
                  {bookingForm.phone_raw && (
                    <button 
                      type="button" 
                      onClick={handleSearchGuest} 
                      disabled={isSearchingGuest || !isEditing}
                      style={{ background: 'none', border: 'none', color: 'var(--primary)', cursor: 'pointer', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.25rem', padding: 0 }}
                    >
                      <Search size={14} /> {isSearchingGuest ? 'Searching...' : 'Search Past Guest'}
                    </button>
                  )}
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: '100px 1fr', gap: '0.5rem' }}>
                  <input disabled={!isEditing} 
                    list="country-codes"
                    className="premium-input" 
                    value={bookingForm.phone_code || '+91'} 
                    placeholder="Code (e.g. +91)"
                    onChange={e => setBookingForm(prev => ({ ...prev, phone_code: e.target.value, phone_number: e.target.value + prev.phone_raw }))}
                  />
                  <input disabled={!isEditing} 
                    type="tel" inputMode="tel" required className="premium-input" placeholder="9876543210" value={bookingForm.phone_raw || ''} 
                    onChange={e => setBookingForm(prev => ({ ...prev, phone_raw: e.target.value, phone_number: prev.phone_code + e.target.value }))} 
                  />
                </div>
              </div>
              <div className="form-group">
                <label className="premium-label" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span>Booking Reference Number</span>
                  {isEditing && (
                    <button 
                      type="button" 
                      onClick={() => setBookingForm({...bookingForm, reference_number: generateReference()})}
                      style={{ background: 'none', border: 'none', color: 'var(--primary)', cursor: 'pointer', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.25rem', padding: 0, textDecoration: 'underline' }}
                    >
                      Generate New
                    </button>
                  )}
                </label>
                <input disabled={!isEditing} 
                  type="text" 
                  required 
                  className="premium-input" 
                  style={{ fontWeight: '700', color: 'var(--primary)' }} 
                  value={bookingForm.reference_number} 
                  onChange={e => setBookingForm({...bookingForm, reference_number: e.target.value})} 
                />
              </div>
            </div>

            <div style={{ borderTop: '1px dashed var(--border)', paddingTop: '1.5rem', marginTop: '1.5rem', marginBottom: '1rem' }}>
                <h4 style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--primary)', marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  Occupancy & Document Details
                </h4>
<div className="grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem', marginBottom: '1.25rem' }}>
              <div className="form-group">
                <label className="premium-label">Number of Guests (Adults & Children)</label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                  <input disabled={!isEditing} type="number" min="1" placeholder="Adults" className="premium-input" value={bookingForm.adults_count} onChange={e => setBookingForm({...bookingForm, adults_count: e.target.value === '' ? '' : Number(e.target.value)})} />
                  <input disabled={!isEditing} type="number" min="0" placeholder="Kids" className="premium-input" value={bookingForm.kids_count} onChange={e => setBookingForm({...bookingForm, kids_count: e.target.value === '' ? '' : Number(e.target.value)})} />
                </div>
              </div>
              <div className="form-group">
                <label className="premium-label">Guest Vehicle Number (Optional)</label>
                <input disabled={!isEditing} type="text" className="premium-input" placeholder="E.g. KA-01-MX-1234" value={bookingForm.vehicle_number || ''} onChange={e => setBookingForm({...bookingForm, vehicle_number: e.target.value})} />
              </div>
            </div>

            <div className="grid-2" style={{ display: 'grid', gridTemplateColumns: bookingForm.id_proof_type === 'Other' ? '1fr 1fr 2fr' : '1fr 2fr', gap: '1.25rem' }}>
              <div className="form-group">
                <label className="premium-label">Identification Document (ID Type)</label>
                <select disabled={!isEditing} className="premium-select" value={bookingForm.id_proof_type || 'Aadhar'} onChange={e => {
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
                  <input disabled={!isEditing} type="text" className="premium-input" placeholder="E.g. Company ID" value={bookingForm.id_proof_other_type || ''} onChange={e => setBookingForm({...bookingForm, id_proof_other_type: e.target.value})} />
                </div>
              )}
              <div className="form-group">
                <label className="premium-label">ID Document Number {bookingForm.highlight_id_proof_number && <span style={{marginLeft:'5px'}} title="Auto-filled by AI">✨</span>}</label>                  <input disabled={!isEditing} 
                    type={bookingForm.id_proof_type === 'Aadhar' ? 'tel' : 'text'}
                    inputMode={bookingForm.id_proof_type === 'Aadhar' ? 'numeric' : 'text'}
                    className={`premium-input ${bookingForm.highlight_id_proof_number ? 'ai-highlight' : ''}`}
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

              {/* Guest Address - Structured */}
              <div style={{ marginTop: '1.5rem', marginBottom: '0.5rem', fontWeight: '600', color: 'var(--primary)', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem' }}>
                Address Details
              </div>
              <div className="form-grid">
                <div className="form-group">
                  <label className="premium-label">
                    Door / Building No. 
                    {bookingForm.highlight_guest_door_no && <span style={{marginLeft:'5px'}} title="Auto-filled by AI">✨</span>}
                  </label>
                  <input 
                    type="text" 
                    disabled={!isEditing} 
                    className={`premium-input ${bookingForm.highlight_guest_door_no ? 'ai-highlight' : ''}`}
                    value={bookingForm.guest_door_no || ''} 
                    onChange={e => setBookingForm({...bookingForm, guest_door_no: e.target.value, highlight_guest_door_no: false})} 
                  />
                </div>
                <div className="form-group">
                  <label className="premium-label">
                    Street Name / Locality
                    {bookingForm.highlight_guest_street && <span style={{marginLeft:'5px'}} title="Auto-filled by AI">✨</span>}
                  </label>
                  <input 
                    type="text" 
                    disabled={!isEditing} 
                    className={`premium-input ${bookingForm.highlight_guest_street ? 'ai-highlight' : ''}`}
                    value={bookingForm.guest_street || ''} 
                    onChange={e => setBookingForm({...bookingForm, guest_street: e.target.value, highlight_guest_street: false})} 
                  />
                </div>
              </div>
              <div className="form-grid">
                <div className="form-group">
                  <label className="premium-label">
                    City / Town
                    {bookingForm.highlight_guest_city && <span style={{marginLeft:'5px'}} title="Auto-filled by AI">✨</span>}
                  </label>
                  <input 
                    type="text" 
                    disabled={!isEditing} 
                    className={`premium-input ${bookingForm.highlight_guest_city ? 'ai-highlight' : ''}`}
                    value={bookingForm.guest_city || ''} 
                    onChange={e => setBookingForm({...bookingForm, guest_city: e.target.value, highlight_guest_city: false})} 
                  />
                </div>
                <div className="form-group">
                  <label className="premium-label">
                    State
                    {bookingForm.highlight_guest_state && <span style={{marginLeft:'5px'}} title="Auto-filled by AI">✨</span>}
                  </label>
                  <input 
                    type="text" 
                    disabled={!isEditing} 
                    className={`premium-input ${bookingForm.highlight_guest_state ? 'ai-highlight' : ''}`}
                    value={bookingForm.guest_state || ''} 
                    onChange={e => setBookingForm({...bookingForm, guest_state: e.target.value, highlight_guest_state: false})} 
                  />
                </div>
              </div>
              <div className="form-grid">
                <div className="form-group">
                  <label className="premium-label">
                    Pincode
                    {bookingForm.highlight_guest_pincode && <span style={{marginLeft:'5px'}} title="Auto-filled by AI">✨</span>}
                  </label>
                  <input 
                    type="text" 
                    disabled={!isEditing} 
                    className={`premium-input ${bookingForm.highlight_guest_pincode ? 'ai-highlight' : ''}`}
                    value={bookingForm.guest_pincode || ''} 
                    onChange={e => setBookingForm({...bookingForm, guest_pincode: e.target.value, highlight_guest_pincode: false})} 
                  />
                </div>
              </div>
          
            {/* ADDITIONAL OCCUPANTS MERGED */}
            <div style={{ marginTop: '2rem', paddingTop: '1.5rem', borderTop: '1px dashed var(--border)' }}>
              <h4 style={{ margin: '0 0 1.25rem 0', fontSize: '0.9rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Users size={16} /> Additional Occupants / Contacts
              </h4>
              {bookingForm.additional_guests && bookingForm.additional_guests.map((guest, index) => (
                <div key={index} style={{ border: '1px solid var(--border)', padding: '1.25rem', borderRadius: '12px', background: 'var(--bg-primary)', position: 'relative', marginBottom: '1.5rem' }}>
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
                  
                  <div style={{ background: 'rgba(34, 197, 94, 0.05)', border: '1px dashed #22c55e', borderRadius: '12px', padding: '1.25rem', marginBottom: '1.5rem', marginTop: '1rem' }}>
                    <label className="premium-label" style={{ color: 'var(--primary)', fontSize: '0.9rem', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <Camera size={16} /> AI Smart Capture for Occupant #{index + 2}
                    </label>
                    <p style={{ margin: '0 0 1rem 0', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                      Take a photo of the guest's ID to auto-fill their details.
                    </p>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem' }}>
                      <IDScanner 
                        side="front" 
                        tenantId={profile?.tenant_id} 
                        existingUrl={guest.id_front_image_url}
                        onScanComplete={(res) => handleAdditionalGuestIDScanComplete(index, res)} 
                      />
                      <IDScanner 
                        side="back" 
                        tenantId={profile?.tenant_id} 
                        existingUrl={guest.id_back_image_url}
                        onScanComplete={(res) => handleAdditionalGuestIDScanComplete(index, res)} 
                      />
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '1rem' }}>
                    <div className="form-group">
                      <label className="premium-label" style={{ fontSize: '0.7rem' }}>Guest Name {guest.highlight_name && <span style={{marginLeft:'5px'}} title="Auto-filled by AI">o"</span>}</label>
                      <input disabled={!isEditing} type="text" required className={`premium-input ${guest.highlight_name ? 'ai-highlight' : ''}`} style={{ backgroundColor: guest.highlight_name ? '#ecfdf5' : '' }} placeholder="Name" value={guest.name} onChange={e => { handleUpdateAdditionalGuest(index, 'name', e.target.value); handleUpdateAdditionalGuest(index, 'highlight_name', false); }} />
                    </div>
                    <div className="form-group">
                      <label className="premium-label" style={{ fontSize: '0.7rem' }}>Email Address</label>
                      <input disabled={!isEditing} type="email" className="premium-input" placeholder="Email" value={guest.email} onChange={e => handleUpdateAdditionalGuest(index, 'email', e.target.value)} />
                    </div>
                    <div className="form-group">
                      <label className="premium-label" style={{ fontSize: '0.7rem' }}>Mobile Number</label>
                      <div style={{ display: 'grid', gridTemplateColumns: '80px 1fr', gap: '0.4rem' }}>
                        <input disabled={!isEditing} list="country-codes" className="premium-input" value={guest.phone_code || '+91'} placeholder="Code" onChange={e => handleUpdateAdditionalGuest(index, 'phone_code', e.target.value)} />
                        <input disabled={!isEditing} type="tel" inputMode="tel" className="premium-input" placeholder="Phone" value={guest.phone_raw} onChange={e => handleUpdateAdditionalGuest(index, 'phone_raw', e.target.value)} />
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: guest.id_proof_type === 'Other' ? '1fr 1fr 2fr' : '1fr 2fr', gap: '1rem', marginBottom: '1rem' }}>
                    <div className="form-group">
                      <label className="premium-label" style={{ fontSize: '0.7rem' }}>ID Type</label>
                      <select disabled={!isEditing} className="premium-select" value={guest.id_proof_type || 'Aadhar'} onChange={e => {
                          const type = e.target.value;
                          let val = guest.id_proof_number || '';
                          if (type === 'Aadhar') {
                            val = val.replace(/\D/g, '').substring(0, 12);
                            val = val.match(/.{1,4}/g)?.join('-') || val;
                          } else if (type === 'Driving License') {
                            val = val.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
                            if (val.length > 4) val = val.substring(0, 4) + '-' + val.substring(4);
                          }
                          handleUpdateAdditionalGuest(index, 'id_proof_type', type);
                          handleUpdateAdditionalGuest(index, 'id_proof_number', val);
                        }}>
                        <option value="Aadhar">Aadhar Card</option>
                        <option value="Pan Card">Pan Card</option>
                        <option value="Driving License">Driving License</option>
                        <option value="Voter ID">Voter ID</option>
                        <option value="Passport">Passport</option>
                        <option value="Other">Other</option>
                      </select>
                    </div>
                    {guest.id_proof_type === 'Other' && (
                      <div className="form-group">
                        <label className="premium-label" style={{ fontSize: '0.7rem' }}>Specify Document</label>
                        <input disabled={!isEditing} type="text" className="premium-input" placeholder="E.g. Company ID" value={guest.id_proof_other_type || ''} onChange={e => handleUpdateAdditionalGuest(index, 'id_proof_other_type', e.target.value)} />
                      </div>
                    )}
                    <div className="form-group">
                      <label className="premium-label" style={{ fontSize: '0.7rem' }}>ID Number {guest.highlight_id_number && <span style={{marginLeft:'5px'}} title="Auto-filled by AI">o"</span>}</label>
                      <input disabled={!isEditing} type={guest.id_proof_type === 'Aadhar' ? 'tel' : 'text'} inputMode={guest.id_proof_type === 'Aadhar' ? 'numeric' : 'text'} className={`premium-input ${guest.highlight_id_number ? 'ai-highlight' : ''}`} placeholder="ID Number" value={guest.id_proof_number || ''} onChange={e => {
                        let val = e.target.value;
                        if (guest.id_proof_type === 'Aadhar') {
                          val = val.replace(/\D/g, '').substring(0, 12);
                          val = val.match(/.{1,4}/g)?.join('-') || val;
                        } else if (guest.id_proof_type === 'Driving License') {
                          val = val.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
                          if (val.length > 4) val = val.substring(0, 4) + '-' + val.substring(4);
                        }
                        handleUpdateAdditionalGuest(index, 'id_proof_number', val);
                        handleUpdateAdditionalGuest(index, 'highlight_id_number', false);
                      }} />
                    </div>
                  </div>

                  <div className="form-group">
                    <label className="premium-label" style={{ fontSize: '0.7rem' }}>Address Details</label>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '0.5rem', marginBottom: '0.5rem' }}>
                      <input disabled={!isEditing} type="text" className={`premium-input ${guest.highlight_guest_door_no ? 'ai-highlight' : ''}`} style={{ backgroundColor: guest.highlight_guest_door_no ? '#ecfdf5' : '' }} placeholder="Door No / Apt" value={guest.guest_door_no || ''} onChange={e => { handleUpdateAdditionalGuest(index, 'guest_door_no', e.target.value); handleUpdateAdditionalGuest(index, 'highlight_guest_door_no', false); }} />
                        <input disabled={!isEditing} type="text" className={`premium-input ${guest.highlight_guest_street ? 'ai-highlight' : ''}`} style={{ backgroundColor: guest.highlight_guest_street ? '#ecfdf5' : '' }} placeholder="Street Name / Area" value={guest.guest_street || ''} onChange={e => { handleUpdateAdditionalGuest(index, 'guest_street', e.target.value); handleUpdateAdditionalGuest(index, 'highlight_guest_street', false); }} />
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 100px', gap: '0.5rem' }}>
                        <input disabled={!isEditing} type="text" className={`premium-input ${guest.highlight_guest_city ? 'ai-highlight' : ''}`} style={{ backgroundColor: guest.highlight_guest_city ? '#ecfdf5' : '' }} placeholder="City" value={guest.guest_city || ''} onChange={e => { handleUpdateAdditionalGuest(index, 'guest_city', e.target.value); handleUpdateAdditionalGuest(index, 'highlight_guest_city', false); }} />
                        <input disabled={!isEditing} type="text" className={`premium-input ${guest.highlight_guest_state ? 'ai-highlight' : ''}`} style={{ backgroundColor: guest.highlight_guest_state ? '#ecfdf5' : '' }} placeholder="State" value={guest.guest_state || ''} onChange={e => { handleUpdateAdditionalGuest(index, 'guest_state', e.target.value); handleUpdateAdditionalGuest(index, 'highlight_guest_state', false); }} />
                        <input disabled={!isEditing} type="text" className={`premium-input ${guest.highlight_guest_pincode ? 'ai-highlight' : ''}`} style={{ backgroundColor: guest.highlight_guest_pincode ? '#ecfdf5' : '' }} placeholder="Pincode" value={guest.guest_pincode || ''} onChange={e => { handleUpdateAdditionalGuest(index, 'guest_pincode', e.target.value); handleUpdateAdditionalGuest(index, 'highlight_guest_pincode', false); }} />
                    </div>
                  </div>
                </div>
              ))}
            
            
            <div style={{ textAlign: 'center' }}>
                <button 
                type="button" 
                className="btn btn-outline" 
                onClick={handleAddAdditionalGuest} 
                style={{ height: '38px', width: 'auto', padding: '0 1.25rem', fontSize: '0.8rem', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem', borderStyle: 'dashed', borderRadius: '8px', fontWeight: 700, marginTop: '0.5rem' }}
                >
                + Add More Guest / Contact Detail
                </button>
            </div>
          
            </div>

          
              </div>

          

          <datalist id="country-codes">
            {COUNTRY_CODES.map(c => (
              <option key={`${c.code}-${c.name}`} value={c.code}>{`${c.name} (${c.code})`}</option>
            ))}
          </datalist>

          {/* SECTION 3: STAY SCHEDULE */}
          <div className={`form-section-card ${collapsedSections[3] ? 'collapsed' : ''}`}>
            <h3 className="form-section-title" onClick={() => toggleSection(3)}>
              <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><Calendar size={18} style={{ color: 'var(--primary)' }} /> Booking Schedule & Property</span>
              {collapsedSections[3] ? <ChevronDown size={20} style={{ color: 'var(--text-muted)' }} /> : <ChevronUp size={20} style={{ color: 'var(--text-muted)' }} />}
            </h3>
            
            <div className="grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem', marginBottom: '1.25rem' }}>
              <div className="form-group">
                <label className="premium-label">Check-in Date</label>
                <input disabled={!isEditing} 
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
                    const newOutDate = outDate.toLocaleDateString('en-CA');
                    setBookingForm(prev => ({...prev, check_in_date: newInDate, check_out_date: newOutDate, is_loading_edit: false}));
                  }} 
                />
              </div>
              <div className="form-group">
                <label className="premium-label">Check-out Date</label>
                <input disabled={!isEditing} id="check-out-date-input" type="date" required className="premium-input" value={bookingForm.check_out_date} 
                  onChange={e => { const val = e.target.value; setBookingForm(prev => ({...prev, check_out_date: val, is_loading_edit: false})); }} 
                />
              </div>
            </div>

            <div className="grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem', marginBottom: '1.25rem' }}>
              <div className="form-group">
                <label className="premium-label">Accommodation Booking Scope</label>
                <select disabled={!isEditing} className="premium-select" value={bookingForm.booking_type} onChange={e => setBookingForm({...bookingForm, booking_type: e.target.value, room_ids: []})}>
                  <option value="Entire Property">Entire Property Booking</option>
                  <option value="Room">Individual Rooms Booking</option>
                </select>
              </div>
              <div className="form-group">
                <label className="premium-label">Select Property / Cottage</label>
                <select disabled={!isEditing} className="premium-select" value={bookingForm.cottage_id} onChange={e => setBookingForm({...bookingForm, cottage_id: e.target.value, room_ids: [], room_types_map: {}, room_type: 'Deluxe' })}>
                  <option value="">Choose property...</option>
                  {cottages.filter(c => c.status === 'Available' || c.status === 'Active' || c.id === bookingForm.cottage_id).map(c => <option key={c.id} value={c.id} disabled={c.isPlanLocked}>{c.name} {c.isPlanLocked ? '(Locked by Plan)' : ''}</option>)}
                </select>
              </div>
            </div>

            {(bookingForm.booking_type === 'Room' || bookingForm.booking_type === 'Entire Property') && (
              <div className="form-group" style={{ marginBottom: '1.25rem' }}>
                <label className="premium-label">
                  {bookingForm.booking_type === 'Entire Property' ? 'Rooms Included (All assigned automatically)' : 'Assign Specific Rooms (Available for Entire Stay)'}
                </label>
                <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', padding: '1.25rem', background: 'var(--bg-secondary)', borderRadius: '12px', border: '1px solid var(--border)' }}>
                  {relevantRooms.length === 0 ? (
                    <span style={{ fontSize: '0.85rem', color: !bookingForm.cottage_id ? 'var(--text-muted)' : 'var(--danger)', fontStyle: !bookingForm.cottage_id ? 'italic' : 'normal', fontWeight: !bookingForm.cottage_id ? 'normal' : '600' }}>{!bookingForm.cottage_id ? 'Please select a property/cottage first' : 'No rooms available for the entire selected duration.'}</span>
                  ) : relevantRooms.map(r => {
                    const isSelected = bookingForm.booking_type === 'Entire Property' ? r.isAvailable : bookingForm.room_ids.includes(r.id);
                    const isAvail = r.isAvailable;
                    
                    let overrideStyle = {};
                    if (r.isPlanLocked) {
                      overrideStyle = { opacity: 0.5, cursor: 'not-allowed', background: '#f1f5f9' };
                    } else if (!isAvail) {
                      overrideStyle = { cursor: 'not-allowed', background: 'rgba(239, 68, 68, 0.1)', borderColor: 'var(--danger)', color: 'var(--danger)' };
                    } else if (isSelected) {
                      overrideStyle = { background: 'var(--success)', borderColor: 'var(--success)', color: '#fff' };
                    } else {
                      overrideStyle = { background: 'transparent', borderColor: 'var(--success)', color: 'var(--success)' };
                    }

                    return (
                    <label 
                      key={r.id} 
                      className={`badge-room ${isSelected ? 'selected' : ''}`}
                      style={overrideStyle}
                      title={r.isPlanLocked ? 'Locked by current plan limit' : (!isAvail ? 'Not available for selected dates' : 'Available')}
                    >
                      <input 
                        type="checkbox" 
                        style={{ display: 'none' }}
                        disabled={r.isPlanLocked || !isAvail || bookingForm.booking_type === 'Entire Property'}
                        checked={isSelected} 
                        onChange={e => {
                          if (bookingForm.booking_type === 'Entire Property') return;
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
                      {!isAvail && <X size={14} style={{ marginLeft: '4px' }} />}
                      </label>
                    );
                  })}
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

            <div className="grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '1.25rem' }}>
              <div className="form-group">
                <label className="premium-label">Breakfast Inclusions</label>
                <div 
                  className="addon-card" 
                  style={{ 
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1rem', 
                    border: bookingForm.breakfast === 'Included' ? '2px solid var(--primary)' : '1px solid var(--border)', 
                    borderRadius: '8px', background: bookingForm.breakfast === 'Included' ? 'rgba(16, 185, 129, 0.05)' : 'var(--bg-secondary)',
                    cursor: isEditing ? 'pointer' : 'default', transition: 'all 0.2s'
                  }}
                  onClick={() => {
                    if (!isEditing) return;
                    setBookingForm({...bookingForm, breakfast: bookingForm.breakfast === 'Included' ? 'NA' : 'Included'});
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <div style={{ width: '20px', height: '20px', borderRadius: '50%', border: bookingForm.breakfast === 'Included' ? 'none' : '2px solid #cbd5e1', background: bookingForm.breakfast === 'Included' ? 'var(--primary)' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      {bookingForm.breakfast === 'Included' && <CheckCircle2 size={14} color="#fff" />}
                    </div>
                    <span style={{ fontWeight: bookingForm.breakfast === 'Included' ? 700 : 500, color: bookingForm.breakfast === 'Included' ? 'var(--primary)' : 'inherit' }}>Breakfast Included</span>
                  </div>
                  {bookingForm.breakfast === 'Included' && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }} onClick={e => e.stopPropagation()}>
                      <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)' }}>Cost (₹):</span>
                      <input 
                        type="number" 
                        disabled={!isEditing}
                        value={bookingForm.addon_costs_itemized?.['breakfast'] ?? ''} 
                        onChange={e => {
                          const oldVal = Number(bookingForm.addon_costs_itemized?.['breakfast'] || 0);
                          const newVal = Number(e.target.value);
                          setBookingForm({
                            ...bookingForm, 
                            addon_costs_itemized: { ...bookingForm.addon_costs_itemized, 'breakfast': newVal },
                            addons_cost: (bookingForm.addons_cost || 0) - oldVal + newVal
                          });
                        }}
                        style={{ width: '80px', padding: '0.25rem 0.5rem', borderRadius: '6px', border: '1px solid #cbd5e1', fontWeight: 700, color: 'var(--primary)', textAlign: 'right' }}
                      />
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* SECTION 5: SERVICES & RESERVATION CHANNEL */}
          <div className={`form-section-card ${collapsedSections[5] ? 'collapsed' : ''}`}>
            <h3 className="form-section-title" onClick={() => toggleSection(5)}>
              <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><Globe size={18} style={{ color: 'var(--primary)' }} /> Services & Distribution Channels</span>
              {collapsedSections[5] ? <ChevronDown size={20} style={{ color: 'var(--text-muted)' }} /> : <ChevronUp size={20} style={{ color: 'var(--text-muted)' }} />}
            </h3>

            <div className="grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem' }}>
              <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                <label className="premium-label">Extra Add-on Services</label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1rem' }}>
                  {['Food', 'Fire camp', 'BBQ', 'Others'].map(addon => {
                    const isSelected = bookingForm.addon_selections?.includes(addon);
                    return (
                      <div 
                        key={addon}
                        className="addon-card" 
                        style={{ 
                          display: 'flex', flexDirection: 'column', padding: '1rem', 
                          border: isSelected ? '2px solid var(--primary)' : '1px solid var(--border)', 
                          borderRadius: '8px', background: isSelected ? 'rgba(16, 185, 129, 0.05)' : 'var(--bg-secondary)',
                          cursor: isEditing ? 'pointer' : 'default', transition: 'all 0.2s', gap: '0.75rem'
                        }}
                        onClick={() => {
                          if (!isEditing) return;
                          const newSels = isSelected 
                            ? (bookingForm.addon_selections || []).filter(a => a !== addon)
                            : [...(bookingForm.addon_selections || []), addon];
                          setBookingForm({...bookingForm, addon_selections: newSels});
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                          <div style={{ width: '20px', height: '20px', borderRadius: '50%', border: isSelected ? 'none' : '2px solid #cbd5e1', background: isSelected ? 'var(--primary)' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                            {isSelected && <CheckCircle2 size={14} color="#fff" />}
                          </div>
                          <span style={{ fontWeight: isSelected ? 700 : 500, color: isSelected ? 'var(--primary)' : 'inherit' }}>{addon}</span>
                        </div>
                        
                        {isSelected && addon === 'Others' && (
                          <input disabled={!isEditing} type="text" className="premium-input" style={{ width: '100%', marginTop: '0.25rem', padding: '0.4rem 0.5rem', fontSize: '0.85rem' }} placeholder="Specify custom add-on..." value={bookingForm.addon_others || ''} onClick={e => e.stopPropagation()} onChange={e => setBookingForm({...bookingForm, addon_others: e.target.value})} />
                        )}

                        {isSelected && (
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem', borderTop: '1px solid var(--border)', paddingTop: '0.75rem', marginTop: '0.25rem' }} onClick={e => e.stopPropagation()}>
                            <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)' }}>Cost (₹):</span>
                            <input 
                              type="number" 
                              disabled={!isEditing}
                              value={bookingForm.addon_costs_itemized?.[addon] ?? ''} 
                              onChange={e => {
                                const oldVal = Number(bookingForm.addon_costs_itemized?.[addon] || 0);
                                const newVal = Number(e.target.value);
                                setBookingForm({
                                  ...bookingForm, 
                                  addon_costs_itemized: { ...bookingForm.addon_costs_itemized, [addon]: newVal },
                                  addons_cost: (bookingForm.addons_cost || 0) - oldVal + newVal
                                });
                              }}
                              style={{ width: '100px', padding: '0.25rem 0.5rem', borderRadius: '6px', border: '1px solid #cbd5e1', fontWeight: 700, color: 'var(--primary)', textAlign: 'right' }}
                            />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {profile?.global_settings?.tenant_gst?.enabled && (
                <div className="grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem', gridColumn: '1 / -1' }}>
                  <div className="form-group">
                    <label className="premium-label">Guest Company Name (B2B)</label>
                    <input disabled={!isEditing} 
                      type="text" 
                      className="premium-input" 
                      placeholder="Optional"
                      value={bookingForm.guest_company_name || ''} 
                      onChange={e => setBookingForm({...bookingForm, guest_company_name: e.target.value})} 
                    />
                  </div>
                  <div className="form-group">
                    <label className="premium-label">Guest GSTIN (B2B)</label>
                    <input disabled={!isEditing} 
                      type="text" 
                      className="premium-input" 
                      placeholder="Optional"
                      value={bookingForm.guest_gstin || ''} 
                      onChange={e => setBookingForm({...bookingForm, guest_gstin: e.target.value})} 
                    />
                  </div>
                </div>
              )}

              <div className="form-group">
                <label className="premium-label">Booking Source Channel</label>
                <select disabled={!isEditing} className="premium-select" value={bookingForm.booking_source} onChange={e => {
                  const src = e.target.value;
                  const defName = bookingForm.agent_name || agents[0] || '';
                  setBookingForm({
                    ...bookingForm,
                    booking_source: src,
                    agent_name: src === 'Agent' ? defName : '',
                    agent_phone: src === 'Agent' ? (bookingForm.agent_phone || agentPhones[defName] || '') : '',
                    is_ota_collected: (src === 'OTA') ? bookingForm.is_ota_collected : false
                  });
                }}>
                  <option value="Direct">Direct Booking</option>
                  <option value="OTA">OTA (Online Travel Agency)</option>
                  <option value="Agent">Agent Booking</option>
                  <option value="Other">Other Channel</option>
                </select>

                {bookingForm.booking_source === 'OTA' && (
                  <div style={{ marginTop: '0.5rem' }}>
                    <select disabled={!isEditing} className="premium-select" value={bookingForm.ota_channel} onChange={e => setBookingForm({...bookingForm, ota_channel: e.target.value})}>
                      <option value="Airbnb">Airbnb</option>
                      <option value="Booking.com">Booking.com</option>
                      <option value="Agoda">Agoda</option>
                      <option value="MakeMyTrip">MakeMyTrip</option>
                      <option value="Goibibo">Goibibo</option>
                      <option value="Expedia">Expedia</option>
                      <option value="Cleartrip">Cleartrip</option>
                      <option value="EaseMyTrip">EaseMyTrip</option>
                      <option value="Other OTA">Other OTA</option>
                    </select>
                    {bookingForm.ota_channel === 'Other OTA' && (
                      <input disabled={!isEditing} 
                        type="text" 
                        className="premium-input" 
                        style={{ marginTop: '0.5rem' }} 
                        placeholder="Specify OTA Name" 
                        value={bookingForm.custom_ota_channel || ''} 
                        onChange={e => setBookingForm({...bookingForm, custom_ota_channel: e.target.value})} 
                        required
                      />
                    )}
                  </div>
                )}

                {(bookingForm.booking_source === 'OTA' || bookingForm.booking_source === 'Other' || bookingForm.booking_source === 'Agent') && (
                  <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-color)', marginTop: '0.75rem' }}>
                    <input disabled={!isEditing} 
                      type="checkbox" 
                      style={{ accentColor: 'var(--primary)' }}
                      checked={bookingForm.is_ota_collected} 
                      onChange={e => setBookingForm({...bookingForm, is_ota_collected: e.target.checked})} 
                    />
                    Payment collected by OTA/Channel (Pending Settlement)
                  </label>
                )}
                
                {bookingForm.booking_source === 'Agent' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '0.5rem' }}>
                    <select disabled={!isEditing} 
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
                      <input disabled={!isEditing} 
                        type="text" 
                        className="premium-input" 
                        placeholder="Enter new agent's name" 
                        value={bookingForm.agent_name} 
                        onChange={e => setBookingForm({...bookingForm, agent_name: e.target.value})} 
                        required 
                      />
                    )}
                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                      <input disabled={!isEditing} 
                        type="tel" inputMode="tel" className="premium-input" placeholder="Agent's contact number" value={bookingForm.agent_phone || ''} 
                        onChange={e => setBookingForm({...bookingForm, agent_phone: e.target.value})} 
                        style={{ flex: 1 }}
                      />
                      {isEditing && (
                        <>
                          <button type="button" onClick={handleSaveAgent} title="Save Agent" className="btn" style={{ padding: '0.65rem', background: 'var(--bg-secondary)', color: 'var(--primary)', border: '1px solid var(--border-color)', borderRadius: '0.5rem' }}>
                            <Save size={18} />
                          </button>
                          <button type="button" onClick={handleDeleteAgent} title="Delete Agent" className="btn" style={{ padding: '0.65rem', background: 'var(--bg-secondary)', color: 'red', border: '1px solid var(--border-color)', borderRadius: '0.5rem' }}>
                            <Trash2 size={18} />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                )}
                {bookingForm.booking_source === 'Other' && (
                  <input disabled={!isEditing} 
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
          <div className={`form-section-card ${collapsedSections[6] ? 'collapsed' : ''}`}>
            <h3 className="form-section-title" onClick={() => toggleSection(6)}>
              <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><Wallet size={18} style={{ color: 'var(--primary)' }} /> Financial Adjustments & Status</span>
              {collapsedSections[6] ? <ChevronDown size={20} style={{ color: 'var(--text-muted)' }} /> : <ChevronUp size={20} style={{ color: 'var(--text-muted)' }} />}
            </h3>
            
            <div className="grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem', marginBottom: '1.25rem' }}>
              <div className="form-group">
                <label className="premium-label">Base Accommodation Charge (₹)</label>
                  <div style={{fontSize: '0.75rem', color: 'var(--primary)', marginBottom: '4px'}}>
                    Applied: {bookingForm.applied_rate_plans || 'None'}
                  </div>
                <input disabled={!isEditing} type="number" className="premium-input" value={bookingForm.base_amount} onChange={e => setBookingForm({...bookingForm, base_amount: e.target.value === '' ? '' : Number(e.target.value)})} />
              </div>
              <div className="form-group">
                <label className="premium-label">Total Amount Paid (₹)</label>
                <input disabled={!isEditing} type="number" className="premium-input" value={bookingForm.advance_paid} onChange={e => setBookingForm({...bookingForm, advance_paid: e.target.value === '' ? '' : Number(e.target.value)})} />
              </div>
            </div>

            <div className="grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem', marginBottom: '1.25rem' }}>
              <div className="form-group">
                <label className="premium-label">Total Add-on Services Cost (₹)</label>
                <input readOnly type="number" className="premium-input" value={bookingForm.addons_cost} style={{ background: 'var(--bg-secondary)', color: 'var(--text-muted)' }} />
              </div>
              <div className="form-group">
                <label className="premium-label">Extra Guest / Occupancy Charges (₹)</label>
                <input disabled={!isEditing} type="number" className="premium-input" value={bookingForm.extra_guest_charges} onChange={e => setBookingForm({...bookingForm, extra_guest_charges: e.target.value === '' ? '' : Number(e.target.value)})} />
              </div>
            </div>

            <div className="grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem', marginBottom: '1.25rem' }}>
              <div className="form-group">
                <label className="premium-label">Discount Amount (₹)</label>
                <input disabled={!isEditing} type="number" className="premium-input" value={bookingForm.discount_amount} onChange={e => setBookingForm({...bookingForm, discount_amount: e.target.value === '' ? '' : Number(e.target.value)})} />
              </div>
              <div className="form-group">
                {/* Empty placeholder for alignment */}
              </div>
            </div>
            
          </div>
          
          {isEditing && !window.Capacitor?.isNativePlatform() && (
            <div style={{ marginTop: '2rem' }}>
              <button 
                type="submit" 
                className="btn btn-primary" 
                disabled={isSubmitting} 
                style={{ width: '100%', padding: '1.1rem', fontSize: '1.05rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.6rem', borderRadius: '12px', fontWeight: 800, boxShadow: '0 4px 15px rgba(5, 150, 105, 0.2)' }}
              >
                <CheckCircle2 size={20} /> {isSubmitting ? 'Processing...' : (id ? 'Save Reservation' : 'Confirm Booking')}
              </button>
            </div>
          )}

        </div>

        {/* RIGHT COLUMN: STICKY RESERVATION RECEIPT */}
        <div className="form-right-col">
          <div className="sticky-receipt">
            <div className="receipt-header">
              <span>{bookingForm.is_ota_collected ? "Guest Add-on Receipt" : "Booking Summary"}</span>
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
            {!bookingForm.is_ota_collected && (
              <div className="receipt-row">
                <span>Base Accommodation:</span>
                <span>₹{(bookingForm.base_amount || 0).toLocaleString()}</span>
              </div>
            )}
            {Number(bookingForm.extra_guest_charges || 0) > 0 && (
              <div className="receipt-row">
                <span>Extra Guest Fee:</span>
                <span>₹{Number(bookingForm.extra_guest_charges).toLocaleString()}</span>
              </div>
            )}
            {Number(bookingForm.addons_cost || 0) > 0 && (
              <>
                {Object.entries(bookingForm.addon_costs_itemized || {}).map(([key, val]) => {
                  if (key !== '_last_guests' && Number(val) > 0) {
                    return (
                      <div key={key} className="receipt-row" style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                        <span style={{ textTransform: 'capitalize' }}>+ {key}:</span>
                        <span>₹{Number(val).toLocaleString()}</span>
                      </div>
                    );
                  }
                  return null;
                })}
                <div className="receipt-row" style={{ fontWeight: 600 }}>
                  <span>Total Add-ons:</span>
                  <span>₹{Number(bookingForm.addons_cost).toLocaleString()}</span>
                </div>
              </>
            )}

            {Number(bookingForm.discount_amount || 0) > 0 && (
              <div className="receipt-row" style={{ color: 'var(--danger)' }}>
                <span>Discount Applied:</span>
                <span>- ₹{Number(bookingForm.discount_amount || 0).toLocaleString()}</span>
              </div>
            )}
            
            {profile?.global_settings?.tenant_gst?.enabled && (
              <div className="receipt-row" style={{ color: 'var(--text-muted)' }}>
                <span>{bookingForm.is_ota_collected ? "GST (On Add-ons):" : `GST (${bookingForm.gst_rate || 0}%):`}</span>
                <span>₹{(bookingForm.is_ota_collected ? guestGstReceipt : (bookingForm.gst_amount || 0)).toLocaleString()}</span>
              </div>
            )}

            <div className="receipt-total-box">
              <div className="receipt-row bold" style={{ fontSize: '1rem', marginBottom: '0.5rem' }}>
                <span>{bookingForm.is_ota_collected ? "Guest Payable Total:" : "Gross Total:"}</span>
                <span style={{ color: 'var(--primary)', fontSize: '1.2rem', fontWeight: 800 }}>
                  ₹{(bookingForm.is_ota_collected ? guestTotalReceipt : (bookingForm.total_amount || 0)).toLocaleString()}
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
              {bookingForm.is_ota_collected && (
                <div style={{ marginTop: '0.75rem', fontSize: '0.75rem', color: 'var(--text-muted)', fontStyle: 'italic', textAlign: 'center' }}>
                  *Room accommodation charges are prepaid and settled separately via {bookingForm.ota_channel || 'OTA'}.
                </div>
              )}
            </div>

            {isEditing && (
            <button 
              type="submit" 
              className="btn btn-primary" 
              disabled={isSubmitting} 
              style={{ width: '100%', padding: '1.1rem', fontSize: '1.05rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.6rem', borderRadius: '12px', fontWeight: 800, boxShadow: '0 4px 15px rgba(5, 150, 105, 0.2)' }}
            >
              <CheckCircle2 size={20} /> {isSubmitting ? 'Processing...' : (id ? 'Save Reservation' : 'Confirm Booking')}
            </button>
            )}
          </div>
        </div>

        
        </fieldset>
      </form>
    </div>
  );
}
