import React, { useState, useEffect } from 'react';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { Plus, Trash2, CheckCircle2, AlertTriangle, X, Search, Filter, Phone, Calendar, Home, CreditCard, Edit2, MoreVertical, Send, RotateCcw, Copy, Check, MessageSquare, Mail } from 'lucide-react';
import { startOfMonth, format } from 'date-fns';
import { useSettingsStore } from '../lib/store';
import { useNavigate } from 'react-router-dom';

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

const DEFAULT_CONFIRM_TEMPLATE = `Dear {guest_name},

Thank you for choosing Cheerful Chalet! Your booking is confirmed.
Reference: {reference_number}
Dates: {check_in_date} to {check_out_date} ({night_count} nights)
Accommodation: {room_name}
Total Amount: ₹{total_amount}
Advance Paid: ₹{advance_paid}
Balance: ₹{balance_amount}

We look forward to welcoming you!`;

const DEFAULT_RECEIPT_TEMPLATE = `Dear {guest_name},

We have received your payment for booking {reference_number}.
Amount Paid: ₹{payment_amount}
Balance Amount: ₹{balance_amount}

Thank you!`;

const DEFAULT_REMINDER_TEMPLATE = `Dear {guest_name},

This is a friendly reminder for your upcoming stay at Cheerful Chalet.
Reference: {reference_number}
Check-in Date: {check_in_date}
Check-in Time: 1:00 PM
Accommodation: {room_name}
Vehicle: {vehicle_number}

We look forward to hosting you!`;

const DEFAULT_REVIEW_TEMPLATE = `Dear {guest_name},

Thank you for choosing {resort_name}. We hope you had a wonderful stay!

We would highly appreciate it if you could take a moment to share your feedback and review your stay with us:

⭐ Review Link: https://g.page/r/...

Thank you again, and we look forward to welcoming you back soon!

📞 Contact: {resort_phone}`;

export default function Bookings() {
  const navigate = useNavigate();
  const { activeResortId, profile } = useSettingsStore();
  const [bookings, setBookings] = useState([]);
  const [cottages, setCottages] = useState([]);
  const [rooms, setRooms] = useState([]);
  const [activeResort, setActiveResort] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [selectedBookings, setSelectedBookings] = useState([]);
  const [sortConfig, setSortConfig] = useState({ key: 'check_in_date', direction: 'ascending' });
  const [searchTerm, setSearchTerm] = useState('');

  const [settlingBooking, setSettlingBooking] = useState(null);
  const [settlementData, setSettlementData] = useState({ discount: 0, allSettled: false });
  
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);

  // New States for Booking Details and WhatsApp templates
  const [selectedDetailedBooking, setSelectedDetailedBooking] = useState(null);
  const [copyStatus, setCopyStatus] = useState({ type: null, text: '' });
  const [whatsappGenerator, setWhatsappGenerator] = useState({
    open: false,
    templateType: 'confirm', // 'confirm', 'receipt' or 'reminder'
    messageText: '',
    paymentAmount: '',
    paymentOption: 'property' // 'online' | 'agent' | 'property'
  });
  const [whatsappTemplates, setWhatsappTemplates] = useState({
    confirm: DEFAULT_CONFIRM_TEMPLATE,
    receipt: DEFAULT_RECEIPT_TEMPLATE,
    reminder: DEFAULT_REMINDER_TEMPLATE,
    review: DEFAULT_REVIEW_TEMPLATE
  });
  const [customTags, setCustomTags] = useState([]);
  const [globalCommEnabled, setGlobalCommEnabled] = useState(true);
  const [tenantCommEnabled, setTenantCommEnabled] = useState(true);

  useEffect(() => {
    fetchData();
    const handleResize = () => setIsMobile(window.innerWidth <= 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [activeResortId, profile?.cottage_id, profile?.role]);

  const fetchData = async () => {
    if (!activeResortId || !isSupabaseConfigured()) {
      setLoading(false);
      return;
    }
    
    try {
      let bookingsQuery = supabase.from('bookings').select('*').eq('resort_id', activeResortId);
      let cottagesQuery = supabase.from('cottages').select('*').eq('resort_id', activeResortId);
      let roomsQuery = supabase.from('rooms').select('*').eq('resort_id', activeResortId);

      if (profile?.role === 'staff' && profile?.cottage_id) {
        bookingsQuery = bookingsQuery.eq('cottage_id', profile.cottage_id);
        cottagesQuery = cottagesQuery.eq('id', profile.cottage_id);
        roomsQuery = roomsQuery.eq('cottage_id', profile.cottage_id);
      }

      const [bks, cts, rms, integrationsRes, resortRes] = await Promise.all([
        bookingsQuery.order('created_at', { ascending: false }),
        cottagesQuery,
        roomsQuery,
        supabase.from('tenant_integrations').select('whatsapp_confirm_msg_template, whatsapp_receipt_msg_template, whatsapp_reminder_msg_template, whatsapp_review_msg_template, whatsapp_custom_tags').eq('resort_id', activeResortId).maybeSingle(),
        supabase.from('resorts').select('*').eq('id', activeResortId).maybeSingle()
      ]);
      setBookings(bks.data || []);
      setCottages(cts.data || []);
      setRooms(rms.data || []);
      setActiveResort(resortRes?.data || null);

      const dbConfirm = integrationsRes?.data?.whatsapp_confirm_msg_template;
      const dbReceipt = integrationsRes?.data?.whatsapp_receipt_msg_template;
      const dbReminder = integrationsRes?.data?.whatsapp_reminder_msg_template;
      const dbReview = integrationsRes?.data?.whatsapp_review_msg_template;
      const dbCustomTags = integrationsRes?.data?.whatsapp_custom_tags;
      
      setWhatsappTemplates({
        confirm: dbConfirm || DEFAULT_CONFIRM_TEMPLATE,
        receipt: dbReceipt || DEFAULT_RECEIPT_TEMPLATE,
        reminder: dbReminder || DEFAULT_REMINDER_TEMPLATE,
        review: dbReview || DEFAULT_REVIEW_TEMPLATE
      });

      if (dbCustomTags) {
        try {
          setCustomTags(typeof dbCustomTags === 'string' ? JSON.parse(dbCustomTags) : dbCustomTags);
        } catch (e) {
          console.error("Failed to parse custom tags:", e);
        }
      }

      // Fetch global and tenant communication setting
      let gComm = true;
      let tComm = true;
      try {
        const { data: superAdminDataList } = await supabase.from('profiles').select('global_settings').eq('email', 'uhariff@gmail.com').limit(1);
        if (superAdminDataList && superAdminDataList.length > 0) {
          const superAdminData = superAdminDataList[0];
          if (superAdminData && superAdminData.global_settings) {
            gComm = superAdminData.global_settings.comm_features_enabled !== false;
          }
        }
        
        if (profile?.tenant_id) {
          const { data: tenantProfile } = await supabase.from('profiles').select('feature_comm_enabled').eq('id', profile.tenant_id).maybeSingle();
          if (tenantProfile) {
            tComm = tenantProfile.feature_comm_enabled !== false;
          }
        }
      } catch (err) {
        console.error("Error fetching feature flags in Bookings:", err);
      }
      setGlobalCommEnabled(gComm);
      setTenantCommEnabled(tComm);

    } catch (err) {
      console.error(err);
      setError('Error fetching data.');
    } finally {
      setLoading(false);
    }
  };

  const handleCopyToClipboard = (text, type) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopyStatus({ type, text: 'Copied!' });
      setTimeout(() => setCopyStatus({ type: null, text: '' }), 2000);
    }).catch(err => {
      console.error('Could not copy text: ', err);
    });
  };

  const compileWhatsAppTemplate = (template, booking, customPaymentAmount = '', paymentOption = '') => {
    if (!template || !booking) return '';
    const cname = cottages.find(x => x.id === booking.cottage_id)?.name || 'Unknown';
    const rname = booking.booking_type === 'Entire Property' ? 'Entire Property' : (booking.room_ids || []).map(id => rooms.find(r => r.id === id)?.name).filter(Boolean).join(', ');
    
    // Custom logic for extra tags
    const checkInDateFormatted = new Date(booking.check_in_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
    const checkOutDateFormatted = new Date(booking.check_out_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
    
    const duration = booking.night_count === 1 ? '1 Night' : `${booking.night_count || 0} Nights`;
    const numRoomsVal = booking.booking_type === 'Entire Property' ? 1 : (booking.room_ids?.length || 1);
    const numGuestsVal = booking.number_of_guests || (Number(booking.adults_count || 1) + Number(booking.kids_count || 0));
    
    const hasBreakfast = (booking.addon_details || '').toLowerCase().includes('food') || (booking.addon_details || '').toLowerCase().includes('breakfast');
    const breakfastVal = booking.breakfast || (hasBreakfast ? 'Included' : 'NA');

    const cottageObj = cottages.find(x => x.id === booking.cottage_id);
    const resName = cottageObj?.name || activeResort?.name || 'Cheerful Chalet';
    const resPhone = cottageObj?.phone || activeResort?.phone || '+91 8220320178';
    const wifiPasswordVal = cottageObj?.wifi_password || customTags.find(t => t.key === 'wifi_password')?.value || 'chalet2026';

    const roomTypeVal = booking.room_type || rname;

    let compiled = template
      .replace(/{guest_name}/g, booking.guest_name || 'Guest')
      .replace(/{booking_id}/g, booking.reference_number || '')
      .replace(/{reference_number}/g, booking.reference_number || '')
      .replace(/{check_in_date}/g, checkInDateFormatted)
      .replace(/{check_in_time}/g, '12:00 PM')
      .replace(/{check_out_date}/g, checkOutDateFormatted)
      .replace(/{check_out_time}/g, '10:00 AM')
      .replace(/{duration_of_stay}/g, duration)
      .replace(/{room_type}/g, roomTypeVal)
      .replace(/{room_name}/g, rname)
      .replace(/{property_name}/g, cname)
      .replace(/{num_rooms}/g, numRoomsVal.toString())
      .replace(/{num_guests}/g, numGuestsVal.toString())
      .replace(/{adults_count}/g, (booking.adults_count || 1).toString())
      .replace(/{kids_count}/g, (booking.kids_count || 0).toString())
      .replace(/{breakfast}/g, breakfastVal)
      .replace(/{night_count}/g, (booking.night_count || '0').toString())
      .replace(/{total_amount}/g, (booking.total_amount || 0).toLocaleString())
      .replace(/{advance_paid}/g, (booking.advance_paid || 0).toLocaleString())
      .replace(/{balance_amount}/g, (booking.balance_amount || 0).toLocaleString())
      .replace(/{vehicle_number}/g, booking.vehicle_number || 'N/A')
      .replace(/{resort_name}/g, resName)
      .replace(/{resort_phone}/g, resPhone)
      .replace(/{wifi_password}/g, wifiPasswordVal)
      .replace(/{agent_name}/g, (() => {
        const { isAgent, name } = parseAgentSource(booking.booking_source);
        return isAgent ? name : 'N/A';
      })())
      .replace(/{agent_phone}/g, (() => {
        const { isAgent, phone } = parseAgentSource(booking.booking_source);
        return isAgent && phone ? phone : 'N/A';
      })())
      .replace(/{booking_source}/g, (() => {
        const { isAgent, name, phone } = parseAgentSource(booking.booking_source);
        if (isAgent) {
          return `Agent: ${name}${phone ? `, Contact: ${phone}` : ''}`;
        }
        return booking.booking_source || 'Direct';
      })())
      .replace(/{payment_amount}/g, customPaymentAmount || (booking.total_amount - booking.balance_amount || 0).toLocaleString());

    // Substitute custom tags dynamically
    try {
      customTags.forEach(t => {
        const regex = new RegExp(`{${t.key}}`, 'g');
        compiled = compiled.replace(regex, t.value || '');
      });
    } catch (e) {
      console.error("Error compiling custom tags:", e);
    }

    const isAgent = booking.booking_source && (booking.booking_source.startsWith('Agent') || booking.booking_source.toLowerCase().includes('agent'));
    const finalOption = paymentOption || (isAgent ? 'agent' : (booking.balance_amount === 0 ? 'online' : 'property'));

    if (finalOption === 'agent') {
      compiled = compiled.replace(/^.*Total/i, 'Total'); // standard safety strip
      compiled = compiled.replace(/^.*Total Amount:.*$/gmi, 'Payment: Payable to Agent');
      compiled = compiled.replace(/^.*Total Amount\s*:.*$/gmi, 'Payment: Payable to Agent');
      compiled = compiled.replace(/^.*Advance Paid:.*$\n?/gmi, '');
      compiled = compiled.replace(/^.*Advance Paid\s*:.*$\n?/gmi, '');
      compiled = compiled.replace(/^.*Balance Amount:.*$\n?/gmi, '');
      compiled = compiled.replace(/^.*Balance Amount\s*:.*$\n?/gmi, '');
    } else if (finalOption === 'online') {
      compiled = compiled.replace(/^.*Total/i, 'Total'); // standard safety strip
      compiled = compiled.replace(/^.*Total Amount:.*$/gmi, 'Payment: ONLINE');
      compiled = compiled.replace(/^.*Total Amount\s*:.*$/gmi, 'Payment: ONLINE');
      compiled = compiled.replace(/^.*Advance Paid:.*$\n?/gmi, '');
      compiled = compiled.replace(/^.*Advance Paid\s*:.*$\n?/gmi, '');
      compiled = compiled.replace(/^.*Balance Amount:.*$\n?/gmi, '');
      compiled = compiled.replace(/^.*Balance Amount\s*:.*$\n?/gmi, '');
    } else if (finalOption === 'property') {
      compiled = compiled.replace(/Balance Amount:.*$/gmi, `Balance Amount: ₹${(booking.balance_amount || 0).toLocaleString()} (Payable at property during check-in)`);
      compiled = compiled.replace(/(Balance Amount\s*:).*$/gmi, `$1 ₹${(booking.balance_amount || 0).toLocaleString()} (Payable at property during check-in)`);
    }

    return compiled;
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
    { label: 'Pending Payment', color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.1)' },
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
      // 1. Delete the settlement income record first
      await supabase
        .from('incomes')
        .delete()
        .eq('booking_id', b.id)
        .ilike('notes', '%Settlement%');

      // 2. Fetch ALL remaining income records for this booking to get the REAL paid amount
      const { data: allIncomes } = await supabase
        .from('incomes')
        .select('amount')
        .eq('booking_id', b.id);

      const totalRealPaid = (allIncomes || []).reduce((sum, inc) => sum + Number(inc.amount), 0);
      const restoredBalance = Number(b.total_amount) - totalRealPaid;

      // 3. Update the booking with the true recalculated values
      const { error: bookingErr } = await supabase.from('bookings').update({ 
          status: 'Checked-in',
          advance_paid: totalRealPaid,
          balance_amount: restoredBalance
      }).eq('id', b.id);
      
      if (bookingErr) throw bookingErr;

      setBookings(prev => prev.map(x => x.id === b.id ? { 
          ...x, 
          status: 'Checked-in', 
          advance_paid: totalRealPaid,
          balance_amount: restoredBalance 
      } : x));

      alert("Booking reverted. Financials and Balance have been synchronized.");
    } catch (err) {
      alert("Error reverting status: " + err.message);
    }
  };

  const settleBooking = (b) => {
    setSettlingBooking(b);
    setSettlementData({ discount: 0, allSettled: false, pendingOTA: false });
  };

  const handleFinalSettlement = async () => {
    if (!settlementData.allSettled && !settlementData.pendingOTA) {
      alert("Please either confirm payment is received or mark it as a Pending OTA Payment.");
      return;
    }

    try {
      if (settlementData.pendingOTA) {
        // Mark as Completed but keep the balance for later (UI will show as Pending payment)
        const { error: bookingErr } = await supabase
          .from('bookings')
          .update({ status: 'Completed' })
          .eq('id', settlingBooking.id);
        if (bookingErr) throw bookingErr;

        setBookings(prev => prev.map(x => x.id === settlingBooking.id ? { ...x, status: 'Completed' } : x));
        setSettlingBooking(null);
        return;
      }
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
      const displayStatus = (b.status === 'Completed' && b.balance_amount > 0) ? 'Pending Payment' : b.status;
      const matchesStatus = activeTab === 'All' || displayStatus === activeTab;
      const matchesSearch = b.guest_name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                            (b.reference_number || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
                            (b.phone_number || '').includes(searchTerm);
      return matchesStatus && matchesSearch;
    });

    if (sortConfig.key === 'check_in_date' && sortConfig.direction === 'ascending') {
      const getPriority = (b) => {
        const displayStatus = (b.status === 'Completed' && b.balance_amount > 0) ? 'Pending Payment' : b.status;
        if (displayStatus === 'Checked-in') return 1;
        if (displayStatus === 'Pending Payment') return 2;
        if (displayStatus === 'Confirmed') return 3;
        if (displayStatus === 'Pending') return 4;
        if (displayStatus === 'Completed') return 5; // Fully settled
        if (displayStatus === 'Cancelled') return 6;
        return 99;
      };
      items.sort((a, b) => {
        const pA = getPriority(a);
        const pB = getPriority(b);
        if (pA !== pB) return pA - pB;
        if (pA === 5 || pA === 2) {
          // Completed or Pending payment: latest checkout date first
          return new Date(b.check_out_date) - new Date(a.check_out_date);
        }
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
            const displayStatus = (b.status === 'Completed' && b.balance_amount > 0) ? 'Pending Payment' : b.status;
            const opt = statusOptions.find(o => o.label === displayStatus) || statusOptions[1];
            
            return (
              <div key={b.id} className="card animate-card" onClick={(e) => { if (e.target.tagName !== 'INPUT' && !e.target.closest('button') && !e.target.closest('.btn-icon') && !e.target.closest('a')) setSelectedDetailedBooking(b); }} style={{ padding: 0, overflow: 'hidden', borderLeft: `6px solid ${opt.color}`, opacity: b.status === 'Cancelled' ? 0.7 : 1, cursor: 'pointer' }}>
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
                        {displayStatus}
                      </span>
                      <span style={{ fontSize: '0.65rem', padding: '2px 8px', borderRadius: '4px', background: 'rgba(99, 102, 241, 0.1)', color: '#6366f1', fontWeight: 800, border: '1px solid rgba(99, 102, 241, 0.2)' }}>
                        {(() => {
                          const { isAgent, name, phone } = parseAgentSource(b.booking_source);
                          if (isAgent) {
                            return (
                              <span onClick={(e) => e.stopPropagation()}>
                                Agent: {name} {phone && (
                                  <>
                                    {', Contact: '}
                                    <a href={`tel:${phone}`} style={{ color: '#6366f1', textDecoration: 'underline' }}>
                                      {phone}
                                    </a>
                                  </>
                                )}
                              </span>
                            );
                          }
                          return b.booking_source || 'Direct';
                        })()}
                      </span>
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', padding: '0.75rem 0', borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border)', marginBottom: '0.75rem' }}>
                    <div style={{ gridColumn: 'span 2' }}>
                      <small style={{ color: 'var(--text-muted)', textTransform: 'uppercase', fontSize: '0.65rem', fontWeight: 700 }}>Stay Dates ({b.night_count} Nights)</small>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.9rem', fontWeight: 600 }}>
                        <Calendar size={14} className="text-primary" /> 
                        {formatDateShort(b.check_in_date)} <span style={{ color: 'var(--text-muted)', margin: '0 4px' }}>→</span> {formatDateShort(b.check_out_date)}
                      </div>
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
                      {b.status === 'Completed' && b.balance_amount > 0 && (
                        <button onClick={() => settleBooking(b)} className="btn btn-primary" style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem', background: '#f59e0b', borderColor: '#f59e0b' }}>Receive Pay</button>
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
                  <th onClick={() => requestSort('status')} style={{ cursor: 'pointer' }}>Status</th>
                  <th onClick={() => requestSort('advance_paid')} style={{ cursor: 'pointer', textAlign: 'right' }}>Paid</th>
                  <th onClick={() => requestSort('balance_amount')} style={{ cursor: 'pointer', textAlign: 'right' }}>Balance</th>
                  <th onClick={() => requestSort('total_amount')} style={{ cursor: 'pointer', textAlign: 'right' }}>Total</th>
                  <th style={{ textAlign: 'center' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {sortedAndFilteredBookings.length === 0 ? (
                  <tr><td colSpan="8" style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>No bookings found.</td></tr>
                ) : sortedAndFilteredBookings.map((b) => {
                  const cname = cottages.find(x => x.id === b.cottage_id)?.name || 'Unknown';
                  const rname = b.booking_type === 'Entire Property' ? 'Entire Property' : (b.room_ids || []).map(id => rooms.find(r => r.id === id)?.name).filter(Boolean).join(', ');
                  const displayStatus = (b.status === 'Completed' && b.balance_amount > 0) ? 'Pending Payment' : b.status;
                  const opt = statusOptions.find(o => o.label === displayStatus) || statusOptions[1];

                  return (
                    <tr key={b.id} className="table-row-hover" onClick={(e) => { if (e.target.tagName !== 'INPUT' && !e.target.closest('button') && !e.target.closest('.btn-icon') && !e.target.closest('a')) setSelectedDetailedBooking(b); }} style={{ opacity: b.status === 'Cancelled' ? 0.6 : 1, cursor: 'pointer' }}>
                      <td>
                        <input type="checkbox" checked={selectedBookings.includes(b.id)} onChange={() => toggleSelectBooking(b.id)} />
                      </td>
                      <td>
                        <small style={{ color: 'var(--primary)', fontWeight: 800 }}>{b.reference_number}</small>
                        <div style={{ fontWeight: 700, fontSize: '1rem' }}>{b.guest_name}</div>
                        <small style={{ color: 'var(--text-muted)' }}><Phone size={12} style={{ verticalAlign: 'middle' }} /> {b.phone_number}</small>
                      </td>
                      <td>
                        <div style={{ fontWeight: 600, fontSize: '0.85rem' }}>
                           <Calendar size={14} style={{ verticalAlign: 'middle', marginRight: '4px' }} />
                           {new Date(b.check_in_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })} 
                           <span style={{ color: 'var(--text-muted)', margin: '0 4px' }}>→</span> 
                           {new Date(b.check_out_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                        </div>
                        <small style={{ color: 'var(--text-muted)', fontWeight: 600 }}>{b.night_count} nights stay</small>
                      </td>
                      <td>
                        <div style={{ fontWeight: 600 }}><Home size={14} /> {cname}</div>
                        <small style={{ color: 'var(--primary)' }}>{rname}</small>
                      </td>
                      <td>
                        <span style={{ fontSize: '0.75rem', fontWeight: 800, padding: '0.3rem 0.6rem', borderRadius: '8px', background: 'rgba(99, 102, 241, 0.1)', color: '#6366f1' }}>
                          {(() => {
                            const { isAgent, name, phone } = parseAgentSource(b.booking_source);
                            if (isAgent) {
                              return (
                                <span onClick={(e) => e.stopPropagation()}>
                                  Agent: {name} {phone && (
                                    <>
                                      {', Contact: '}
                                      <a href={`tel:${phone}`} style={{ color: '#6366f1', textDecoration: 'underline' }}>
                                        {phone}
                                      </a>
                                    </>
                                  )}
                                </span>
                              );
                            }
                            return b.booking_source || 'Direct';
                          })()}
                        </span>
                      </td>
                      <td>
                        <span style={{ padding: '0.3rem 0.6rem', borderRadius: '20px', fontSize: '0.7rem', fontWeight: 700, background: opt.bg, color: opt.color, border: `1px solid ${opt.color}44`, display: 'inline-block', whiteSpace: 'nowrap' }}>
                          {displayStatus}
                        </span>
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
                          {b.status === 'Completed' && b.balance_amount > 0 && (
                            <button onClick={() => settleBooking(b)} className="btn btn-primary" style={{ padding: '0.4rem 0.75rem', fontSize: '0.75rem', background: '#f59e0b', borderColor: '#f59e0b' }}>Receive Pay</button>
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
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', cursor: 'pointer', fontSize: '0.9rem' }}>
                  <input type="radio" name="settlementType" checked={settlementData.allSettled} onChange={() => setSettlementData({ ...settlementData, allSettled: true, pendingOTA: false })} style={{ width: '18px', height: '18px', accentColor: 'var(--success)' }} />
                  <span style={{ fontWeight: 600 }}>Payment Received Now (Cash/UPI/Card)</span>
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', cursor: 'pointer', fontSize: '0.9rem' }}>
                  <input type="radio" name="settlementType" checked={settlementData.pendingOTA} onChange={() => setSettlementData({ ...settlementData, allSettled: false, pendingOTA: true })} style={{ width: '18px', height: '18px', accentColor: 'var(--warning)' }} />
                  <span style={{ fontWeight: 600 }}>Payment Pending from OTA (Agoda/Booking.com)</span>
                </label>
              </div>
              
              {settlementData.pendingOTA && (
                <div style={{ marginTop: '1rem', padding: '0.75rem', background: 'rgba(245, 158, 11, 0.1)', color: '#b45309', borderRadius: '8px', fontSize: '0.8rem', border: '1px solid rgba(245, 158, 11, 0.2)' }}>
                  This will mark the booking as Pending payment. You can record the payment later once received from the OTA.
                </div>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginTop: '1.5rem' }}>
                <button className="btn btn-outline" onClick={() => setSettlingBooking(null)}>Cancel</button>
                <button className="btn btn-primary" onClick={handleFinalSettlement}>Confirm & Close</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Booking Details Modal */}
      {selectedDetailedBooking && (
        <div className="modal-overlay" onClick={() => setSelectedDetailedBooking(null)}>
          <div className="modal-content" style={{ maxWidth: '650px', width: '90%' }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', borderBottom: '1px solid var(--border)', paddingBottom: '1rem' }}>
              <div>
                <small style={{ color: 'var(--primary)', fontWeight: 800, fontSize: '0.8rem' }}>{selectedDetailedBooking.reference_number}</small>
                <h2 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 800 }}>Booking Details</h2>
              </div>
              <button className="btn-icon" onClick={() => setSelectedDetailedBooking(null)}><X size={20} /></button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '1.5rem', marginBottom: '1.5rem' }}>
              {/* Guest Details */}
              <div>
                <h3 style={{ fontSize: '1rem', marginBottom: '0.75rem', borderBottom: '1px solid var(--border)', paddingBottom: '0.25rem', color: 'var(--primary)' }}>Guest Information</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  <div>
                    <small style={{ color: 'var(--text-muted)', display: 'block', textTransform: 'uppercase', fontSize: '0.65rem', fontWeight: 700 }}>Guest Name</small>
                    <span style={{ fontWeight: 700, fontSize: '1.1rem' }}>{selectedDetailedBooking.guest_name}</span>
                  </div>
                  <div>
                    <small style={{ color: 'var(--text-muted)', display: 'block', textTransform: 'uppercase', fontSize: '0.65rem', fontWeight: 700 }}>Mobile Number</small>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.1rem' }}>
                      <Phone size={14} style={{ color: 'var(--text-muted)' }} />
                      <span style={{ fontWeight: 600 }}>{selectedDetailedBooking.phone_number}</span>
                      <button 
                        onClick={() => handleCopyToClipboard(selectedDetailedBooking.phone_number, 'phone')} 
                        className="btn-icon" 
                        title="Copy phone number" 
                        style={{ padding: '0.2rem', display: 'inline-flex', background: 'rgba(0,0,0,0.03)', border: '1px solid var(--border)', borderRadius: '4px' }}
                      >
                        {copyStatus.type === 'phone' ? <Check size={12} style={{ color: 'var(--success)' }} /> : <Copy size={12} />}
                      </button>
                      {copyStatus.type === 'phone' && <span style={{ fontSize: '0.65rem', color: 'var(--success)', fontWeight: 600 }}>{copyStatus.text}</span>}
                    </div>
                  </div>
                  <div>
                    <small style={{ color: 'var(--text-muted)', display: 'block', textTransform: 'uppercase', fontSize: '0.65rem', fontWeight: 700 }}>Email ID</small>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.1rem' }}>
                      <Mail size={14} style={{ color: 'var(--text-muted)' }} />
                      <span style={{ fontWeight: 600 }}>{selectedDetailedBooking.guest_email || 'No email provided'}</span>
                      {selectedDetailedBooking.guest_email && (
                        <>
                          <button 
                            onClick={() => handleCopyToClipboard(selectedDetailedBooking.guest_email, 'email')} 
                            className="btn-icon" 
                            title="Copy email address" 
                            style={{ padding: '0.2rem', display: 'inline-flex', background: 'rgba(0,0,0,0.03)', border: '1px solid var(--border)', borderRadius: '4px' }}
                          >
                            {copyStatus.type === 'email' ? <Check size={12} style={{ color: 'var(--success)' }} /> : <Copy size={12} />}
                          </button>
                          {copyStatus.type === 'email' && <span style={{ fontSize: '0.65rem', color: 'var(--success)', fontWeight: 600 }}>{copyStatus.text}</span>}
                        </>
                      )}
                    </div>
                  </div>
                  <div>
                    <small style={{ color: 'var(--text-muted)', display: 'block', textTransform: 'uppercase', fontSize: '0.65rem', fontWeight: 700 }}>ID Proof</small>
                    <span style={{ fontWeight: 600 }}>
                      {selectedDetailedBooking.id_proof_type || 'Aadhar'}: {selectedDetailedBooking.id_proof_number || 'Not provided'}
                    </span>
                  </div>
                  <div>
                    <small style={{ color: 'var(--text-muted)', display: 'block', textTransform: 'uppercase', fontSize: '0.65rem', fontWeight: 700 }}>Vehicle Number</small>
                    <span style={{ fontWeight: 600 }}>{selectedDetailedBooking.vehicle_number || 'None'}</span>
                  </div>
                  <div>
                    <small style={{ color: 'var(--text-muted)', display: 'block', textTransform: 'uppercase', fontSize: '0.65rem', fontWeight: 700 }}>Booking Source</small>
                    <span style={{ fontWeight: 600 }}>
                      {(() => {
                        const { isAgent, name, phone } = parseAgentSource(selectedDetailedBooking.booking_source);
                        if (isAgent) {
                          return (
                            <span>
                              Agent: {name} {phone && (
                                <>
                                  {' | '}
                                  <a href={`tel:${phone}`} style={{ color: 'var(--primary)', textDecoration: 'underline' }} onClick={(e) => e.stopPropagation()}>
                                    {phone}
                                  </a>
                                </>
                              )}
                            </span>
                          );
                        }
                        return selectedDetailedBooking.booking_source || 'Direct';
                      })()}
                    </span>
                  </div>
                  {selectedDetailedBooking.additional_guests && (() => {
                    let guests = [];
                    try {
                      guests = typeof selectedDetailedBooking.additional_guests === 'string' 
                        ? JSON.parse(selectedDetailedBooking.additional_guests) 
                        : selectedDetailedBooking.additional_guests;
                    } catch (e) {
                      console.error("Failed to parse additional guests:", e);
                    }
                    if (!Array.isArray(guests) || guests.length === 0) return null;
                    return (
                      <div style={{ marginTop: '0.5rem' }}>
                        <small style={{ color: 'var(--text-muted)', display: 'block', textTransform: 'uppercase', fontSize: '0.65rem', fontWeight: 700, marginBottom: '0.25rem' }}>Additional Guests</small>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                          {guests.map((g, idx) => (
                            <div key={idx} style={{ padding: '0.5rem', background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: '6px', fontSize: '0.85rem' }}>
                              <div style={{ fontWeight: 700, color: 'var(--text-main)' }}>{g.name}</div>
                              {g.phone && <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem', marginTop: '0.1rem' }}>Phone: {g.phone}</div>}
                              {g.email && <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>Email: {g.email}</div>}
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })()}
                </div>
              </div>

              {/* Stay Details */}
              <div>
                <h3 style={{ fontSize: '1rem', marginBottom: '0.75rem', borderBottom: '1px solid var(--border)', paddingBottom: '0.25rem', color: 'var(--primary)' }}>Stay Information</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  <div>
                    <small style={{ color: 'var(--text-muted)', display: 'block', textTransform: 'uppercase', fontSize: '0.65rem', fontWeight: 700 }}>Cottage / Property</small>
                    <span style={{ fontWeight: 600 }}>
                      {cottages.find(x => x.id === selectedDetailedBooking.cottage_id)?.name || 'Unknown'}
                    </span>
                  </div>
                  <div>
                    <small style={{ color: 'var(--text-muted)', display: 'block', textTransform: 'uppercase', fontSize: '0.65rem', fontWeight: 700 }}>Room(s) Assigned</small>
                    <span style={{ fontWeight: 700, color: 'var(--primary)' }}>
                      {selectedDetailedBooking.booking_type === 'Entire Property' ? 'Entire Property' : (selectedDetailedBooking.room_ids || []).map(id => rooms.find(r => r.id === id)?.name).filter(Boolean).join(', ') || 'N/A'}
                    </span>
                  </div>
                  <div>
                    <small style={{ color: 'var(--text-muted)', display: 'block', textTransform: 'uppercase', fontSize: '0.65rem', fontWeight: 700 }}>Stay Dates</small>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontWeight: 600, fontSize: '0.95rem' }}>
                      <Calendar size={14} style={{ color: 'var(--primary)' }} />
                      {new Date(selectedDetailedBooking.check_in_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                      <span style={{ color: 'var(--text-muted)' }}>→</span>
                      {new Date(selectedDetailedBooking.check_out_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                      <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 500 }}>({selectedDetailedBooking.night_count} nights)</span>
                    </div>
                  </div>
                  <div>
                    <small style={{ color: 'var(--text-muted)', display: 'block', textTransform: 'uppercase', fontSize: '0.65rem', fontWeight: 700 }}>Occupants</small>
                    <span style={{ fontWeight: 600 }}>{selectedDetailedBooking.adults_count || 1} Adults, {selectedDetailedBooking.kids_count || 0} Kids</span>
                  </div>
                  <div>
                    <small style={{ color: 'var(--text-muted)', display: 'block', textTransform: 'uppercase', fontSize: '0.65rem', fontWeight: 700 }}>Add-ons Details</small>
                    <span style={{ fontWeight: 600 }}>{selectedDetailedBooking.addon_details || 'None selected'}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Financial Summary */}
            <div style={{ background: 'var(--bg-color)', padding: '1.25rem', borderRadius: '12px', marginBottom: '1.5rem', border: '1px solid var(--border)' }}>
              <h3 style={{ fontSize: '0.95rem', marginBottom: '0.75rem', borderBottom: '1px solid var(--border)', paddingBottom: '0.5rem', fontWeight: 700 }}>Financial Summary</h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem', textAlign: 'center', marginBottom: '0.75rem' }}>
                <div>
                  <small style={{ color: 'var(--text-muted)', display: 'block', fontSize: '0.65rem', textTransform: 'uppercase' }}>Base Cost</small>
                  <span style={{ fontWeight: 600 }}>₹{(selectedDetailedBooking.base_amount || 0).toLocaleString()}</span>
                </div>
                <div>
                  <small style={{ color: 'var(--text-muted)', display: 'block', fontSize: '0.65rem', textTransform: 'uppercase' }}>Add-ons Cost</small>
                  <span style={{ fontWeight: 600 }}>₹{(selectedDetailedBooking.addons_cost || 0).toLocaleString()}</span>
                </div>
                <div>
                  <small style={{ color: 'var(--text-muted)', display: 'block', fontSize: '0.65rem', textTransform: 'uppercase' }}>Extra Guest</small>
                  <span style={{ fontWeight: 600 }}>₹{(selectedDetailedBooking.extra_guest_charges || 0).toLocaleString()}</span>
                </div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '0.75rem', borderTop: '1px dashed var(--border)', flexWrap: 'wrap', gap: '0.5rem' }}>
                <span style={{ fontWeight: 700 }}>Total Value: <span style={{ color: 'var(--text-main)', fontSize: '1.2rem' }}>₹{(selectedDetailedBooking.total_amount || 0).toLocaleString()}</span></span>
                <span style={{ fontWeight: 700 }}>Paid: <span style={{ color: 'var(--success)', fontSize: '1.2rem' }}>₹{(selectedDetailedBooking.total_amount - selectedDetailedBooking.balance_amount || 0).toLocaleString()}</span></span>
                <span style={{ fontWeight: 700 }}>Balance: <span style={{ color: selectedDetailedBooking.balance_amount > 0 ? 'var(--warning)' : 'var(--success)', fontSize: '1.2rem' }}>₹{(selectedDetailedBooking.balance_amount || 0).toLocaleString()}</span></span>
              </div>
            </div>

            {/* Modal Actions */}
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', flexWrap: 'wrap', borderTop: '1px solid var(--border)', paddingTop: '1.25rem' }}>
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                <button 
                  onClick={() => {
                    const isAgent = selectedDetailedBooking.booking_source && (selectedDetailedBooking.booking_source.startsWith('Agent') || selectedDetailedBooking.booking_source.toLowerCase().includes('agent'));
                    const defaultOption = isAgent ? 'agent' : (selectedDetailedBooking.balance_amount === 0 ? 'online' : 'property');
                    const text = compileWhatsAppTemplate(whatsappTemplates.confirm, selectedDetailedBooking, '', defaultOption);
                    setWhatsappGenerator({
                      open: true,
                      templateType: 'confirm',
                      messageText: text,
                      paymentAmount: '',
                      paymentOption: defaultOption
                    });
                  }} 
                  className="btn btn-outline" 
                  style={{ borderColor: '#22c55e', color: '#15803d', display: 'flex', alignItems: 'center', gap: '0.4rem', height: '40px', padding: '0 0.8rem', fontSize: '0.85rem' }}
                >
                  <MessageSquare size={16} /> WhatsApp Confirm
                </button>
                
                <button 
                  onClick={() => {
                    const defaultAmount = (selectedDetailedBooking.total_amount - selectedDetailedBooking.balance_amount || 0).toLocaleString();
                    const text = compileWhatsAppTemplate(whatsappTemplates.receipt, selectedDetailedBooking, defaultAmount);
                    setWhatsappGenerator({
                      open: true,
                      templateType: 'receipt',
                      messageText: text,
                      paymentAmount: defaultAmount
                    });
                  }} 
                  className="btn btn-outline" 
                  style={{ borderColor: '#3b82f6', color: '#1d4ed8', display: 'flex', alignItems: 'center', gap: '0.4rem', height: '40px', padding: '0 0.8rem', fontSize: '0.85rem' }}
                >
                  <MessageSquare size={16} /> WhatsApp Receipt
                </button>

                <button 
                  onClick={() => {
                    const text = compileWhatsAppTemplate(whatsappTemplates.reminder, selectedDetailedBooking);
                    setWhatsappGenerator({
                      open: true,
                      templateType: 'reminder',
                      messageText: text,
                      paymentAmount: ''
                    });
                  }} 
                  className="btn btn-outline" 
                  style={{ borderColor: '#f59e0b', color: '#b45309', display: 'flex', alignItems: 'center', gap: '0.4rem', height: '40px', padding: '0 0.8rem', fontSize: '0.85rem' }}
                >
                  <MessageSquare size={16} /> WhatsApp Reminder
                </button>

                <button 
                  onClick={() => {
                    const text = compileWhatsAppTemplate(whatsappTemplates.review, selectedDetailedBooking);
                    setWhatsappGenerator({
                      open: true,
                      templateType: 'review',
                      messageText: text,
                      paymentAmount: ''
                    });
                  }} 
                  className="btn btn-outline" 
                  style={{ borderColor: '#8b5cf6', color: '#6d28d9', display: 'flex', alignItems: 'center', gap: '0.4rem', height: '40px', padding: '0 0.8rem', fontSize: '0.85rem' }}
                >
                  <MessageSquare size={16} /> WhatsApp Review
                </button>
              </div>

              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button 
                  onClick={() => {
                    setSelectedDetailedBooking(null);
                    navigate(`/bookings/edit/${selectedDetailedBooking.id}`);
                  }} 
                  className="btn btn-outline" 
                  style={{ height: '40px', padding: '0 1rem', fontSize: '0.85rem' }}
                >
                  <Edit2 size={16} /> Edit Booking
                </button>
                <button 
                  onClick={() => setSelectedDetailedBooking(null)} 
                  className="btn btn-primary" 
                  style={{ height: '40px', padding: '0 1.2rem', fontSize: '0.85rem' }}
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* WhatsApp Message Generator Sub-Modal */}
      {whatsappGenerator.open && selectedDetailedBooking && (
        <div className="modal-overlay" style={{ zIndex: 1100 }} onClick={() => setWhatsappGenerator({ ...whatsappGenerator, open: false })}>
          <div className="modal-content" style={{ maxWidth: '500px', width: '90%' }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', borderBottom: '1px solid var(--border)', paddingBottom: '0.75rem' }}>
              <h2 style={{ margin: 0, fontSize: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <MessageSquare color="#22c55e" size={20} /> WhatsApp Generator
              </h2>
              <button className="btn-icon" onClick={() => setWhatsappGenerator({ ...whatsappGenerator, open: false })}><X size={20} /></button>
            </div>

            {whatsappGenerator.templateType === 'receipt' && (
              <div className="form-group" style={{ marginBottom: '1rem' }}>
                <label className="form-label" style={{ fontWeight: 600 }}>Payment Amount Received (₹)</label>
                <input 
                  type="text" 
                  className="form-input" 
                  style={{ height: '40px' }}
                  value={whatsappGenerator.paymentAmount} 
                  onChange={(e) => {
                    const amt = e.target.value;
                    const text = compileWhatsAppTemplate(whatsappTemplates.receipt, selectedDetailedBooking, amt);
                    setWhatsappGenerator({
                      ...whatsappGenerator,
                      paymentAmount: amt,
                      messageText: text
                    });
                  }} 
                />
              </div>
            )}

            {whatsappGenerator.templateType === 'confirm' && (
              <div className="form-group" style={{ marginBottom: '1.25rem' }}>
                <label className="form-label" style={{ fontWeight: 600, marginBottom: '0.5rem', display: 'block' }}>Payment Option</label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.5rem' }}>
                  {[
                    { id: 'online', label: 'Online Payment' },
                    { id: 'agent', label: 'Payable to Agent' },
                    { id: 'property', label: 'Pay at Property' }
                  ].map(opt => {
                    const isSelected = whatsappGenerator.paymentOption === opt.id;
                    return (
                      <button
                        type="button"
                        key={opt.id}
                        onClick={() => {
                          const text = compileWhatsAppTemplate(whatsappTemplates.confirm, selectedDetailedBooking, '', opt.id);
                          setWhatsappGenerator({
                            ...whatsappGenerator,
                            paymentOption: opt.id,
                            messageText: text
                          });
                        }}
                        style={{
                          padding: '0.5rem',
                          fontSize: '0.8rem',
                          fontWeight: 600,
                          borderRadius: '8px',
                          border: isSelected ? '1px solid var(--primary)' : '1px solid var(--border)',
                          background: isSelected ? 'rgba(34, 197, 94, 0.1)' : 'var(--bg-secondary)',
                          color: isSelected ? 'var(--primary)' : 'var(--text-muted)',
                          cursor: 'pointer',
                          textAlign: 'center',
                          transition: 'all 0.15s'
                        }}
                      >
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="form-group">
              <label className="form-label" style={{ fontWeight: 600 }}>Message Text Preview</label>
              <textarea 
                className="form-input" 
                rows={9} 
                style={{ fontFamily: 'inherit', resize: 'vertical', height: 'auto', padding: '0.75rem', fontSize: '0.9rem', marginBottom: '1rem' }}
                value={whatsappGenerator.messageText} 
                onChange={(e) => setWhatsappGenerator({ ...whatsappGenerator, messageText: e.target.value })}
              />
            </div>

            {/* Contact Selector if additional guests exist */}
            {(() => {
              let guests = [];
              try {
                guests = typeof selectedDetailedBooking.additional_guests === 'string' 
                  ? JSON.parse(selectedDetailedBooking.additional_guests) 
                  : selectedDetailedBooking.additional_guests;
              } catch (e) {
                console.error(e);
              }
              
              const contacts = [
                { name: `${selectedDetailedBooking.guest_name} (Primary)`, phone: selectedDetailedBooking.phone_number, guestNameOnly: selectedDetailedBooking.guest_name },
                ...(Array.isArray(guests) ? guests : []).map(g => ({ name: g.name, phone: g.phone || g.phone_number, guestNameOnly: g.name })).filter(c => c.phone)
              ];

              if (contacts.length <= 1) return null;

              return (
                <div className="form-group" style={{ marginBottom: '1rem' }}>
                  <label className="form-label" style={{ fontWeight: 600, color: 'var(--primary)' }}>Send to Contact</label>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    {contacts.map((contact, idx) => (
                      <button
                        key={idx}
                        onClick={() => {
                          let rawPhone = contact.phone || '';
                          let cleanedPhone = rawPhone.replace(/\D/g, '');
                          if (!rawPhone.trim().startsWith('+') && cleanedPhone.length === 10) {
                            cleanedPhone = '91' + cleanedPhone;
                          }
                          
                          let textToSend = whatsappGenerator.messageText;
                          if (contact.guestNameOnly && contact.guestNameOnly !== selectedDetailedBooking.guest_name) {
                            textToSend = textToSend.split(selectedDetailedBooking.guest_name).join(contact.guestNameOnly);
                          }
                          
                          const encodedText = encodeURIComponent(textToSend);
                          const waUrl = `https://api.whatsapp.com/send?phone=${cleanedPhone}&text=${encodedText}`;
                          window.open(waUrl, '_blank');
                        }}
                        className="btn btn-outline"
                        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.6rem 1rem', fontSize: '0.85rem', height: 'auto', textAlign: 'left', borderColor: '#22c55e', background: 'rgba(34, 197, 94, 0.03)' }}
                      >
                        <div>
                          <strong style={{ color: 'var(--text-main)' }}>{contact.name}</strong>
                          <span style={{ marginLeft: '0.5rem', color: 'var(--text-muted)' }}>({contact.phone})</span>
                        </div>
                        <span style={{ color: '#22c55e', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                          Send <Send size={12} />
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              );
            })()}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginTop: '1.5rem' }}>
              <button 
                onClick={() => {
                  navigator.clipboard.writeText(whatsappGenerator.messageText);
                  alert("Message copied to clipboard!");
                }} 
                className="btn btn-outline"
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem', height: '40px' }}
              >
                <Copy size={16} /> Copy Message
              </button>
              
              {(() => {
                let guests = [];
                try {
                  guests = typeof selectedDetailedBooking.additional_guests === 'string' 
                    ? JSON.parse(selectedDetailedBooking.additional_guests) 
                    : selectedDetailedBooking.additional_guests;
                } catch (e) {}
                const hasAdditional = Array.isArray(guests) && guests.some(g => g.phone || g.phone_number);
                if (hasAdditional) return null; // Recipients are selected individually above

                return (
                  <button 
                    onClick={() => {
                      const rawPhone = selectedDetailedBooking.phone_number || '';
                      let cleanedPhone = rawPhone.replace(/\D/g, '');
                      if (!rawPhone.trim().startsWith('+') && cleanedPhone.length === 10) {
                        cleanedPhone = '91' + cleanedPhone;
                      }
                      const encodedText = encodeURIComponent(whatsappGenerator.messageText);
                      const waUrl = `https://api.whatsapp.com/send?phone=${cleanedPhone}&text=${encodedText}`;
                      window.open(waUrl, '_blank');
                    }} 
                    className="btn btn-primary"
                    style={{ background: '#22c55e', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem', height: '40px' }}
                  >
                    <Send size={16} /> Send via WhatsApp
                  </button>
                );
              })()}
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
