import React, { useState, useEffect } from 'react';
import { useSettingsStore } from '../lib/store';
import { supabase } from '../lib/supabase';
import { AlertTriangle, User, Palette, ShieldAlert, Mail, MessageCircle, Settings as SettingsIcon, Save, CheckCircle2, XCircle, Loader2 } from 'lucide-react';

const DEFAULT_CONFIRM_TEMPLATE = `🏡 Booking Confirmed – {resort_name}

Dear {guest_name},

Thank you for choosing {resort_name}.

We are pleased to confirm your reservation:

🔖 Booking ID: {booking_id}
📅 Check-in Date & Time : {check_in_date} & {check_in_time}
📅 Check-out Date & Time: {check_out_date} & {check_out_time}
🌙 Duration of Stay: {duration_of_stay}
🛏 Room Type: {room_type}
🏠 Number of Rooms: {num_rooms}
👥 Number of Guests: {num_guests}
👨 Adults: {adults_count}
👧 Kids: {kids_count}
🍳 Breakfast: {breakfast}

💰 Total Amount: ₹{total_amount}
✅ Advance Paid: ₹{advance_paid}
💳 Balance Amount: ₹{balance_amount} (Payable at Check-in)

Your reservation has been successfully confirmed. We look forward to welcoming you and ensuring a pleasant stay.

📞 For any queries or assistance, please contact: {resort_phone}`;

const DEFAULT_RECEIPT_TEMPLATE = `Dear {guest_name},

We have received your payment for booking {booking_id}.
Amount Paid: ₹{payment_amount}
Balance Amount: ₹{balance_amount}

Thank you!`;

const DEFAULT_REMINDER_TEMPLATE = `Dear {guest_name},

This is a friendly reminder for your upcoming stay at {resort_name}.
Booking ID: {booking_id}
Check-in Date & Time: {check_in_date} & {check_in_time}
Accommodation: {room_type}
Vehicle: {vehicle_number}

We look forward to hosting you!`;

const DEFAULT_REVIEW_TEMPLATE = `Dear {guest_name},

Thank you for choosing {resort_name}. We hope you had a wonderful stay!

We would highly appreciate it if you could take a moment to share your feedback and review your stay with us:

⭐ Review Link: https://g.page/r/...

Thank you again, and we look forward to welcoming you back soon!

📞 Contact: {resort_phone}`;

export default function Settings() {
  const { profile, setProfile, theme, toggleTheme, session, activeResortId } = useSettingsStore();
  const [userName, setUserName] = useState(profile?.full_name || '');
  const [globalCommEnabled, setGlobalCommEnabled] = useState(true);
  const [globalTemplatesEnabled, setGlobalTemplatesEnabled] = useState(true);
  const [loading, setLoading] = useState(false);
  const [savingComm, setSavingComm] = useState(false);
  const [savingResort, setSavingResort] = useState(false);
  const [savingGeneral, setSavingGeneral] = useState(false);
  const [activeTab, setActiveTab] = useState('general');
  const [resortName, setResortName] = useState('');
  const [resortPhone, setResortPhone] = useState('');
  const [wifiPassword, setWifiPassword] = useState('chalet2026');
  const [testStatus, setTestStatus] = useState({
    email: { loading: false, success: null, message: '' },
    whatsapp: { loading: false, success: null, message: '' }
  });
  
  // Integration Settings State
  const [commSettings, setCommSettings] = useState({
    email_enabled: false,
    email_api_key: '',
    email_from_address: '',
    email_from_name: '',
    whatsapp_enabled: false,
    whatsapp_access_token: '',
    whatsapp_phone_number_id: '',
    whatsapp_business_account_id: '',
    auto_booking_confirmation: false,
    auto_checkin_reminder: false,
    auto_payment_receipt: false,
    whatsapp_confirm_msg_template: DEFAULT_CONFIRM_TEMPLATE,
    whatsapp_receipt_msg_template: DEFAULT_RECEIPT_TEMPLATE,
    whatsapp_reminder_msg_template: DEFAULT_REMINDER_TEMPLATE,
    whatsapp_review_msg_template: DEFAULT_REVIEW_TEMPLATE
  });

  // Custom Tags Manager State
  const [customTags, setCustomTags] = useState([
    { key: 'wifi_password', value: 'chalet2026' }
  ]);

  const [newTagKey, setNewTagKey] = useState('');
  const [newTagVal, setNewTagVal] = useState('');

  const handleAddCustomTag = (e) => {
    e.preventDefault();
    if (!newTagKey.trim()) return;
    const cleanKey = newTagKey.trim().toLowerCase().replace(/[^a-z0-9_]/g, '');
    if (!cleanKey) return;
    
    const defaultTagKeys = ['guest_name', 'booking_id', 'check_in_date', 'check_in_time', 'check_out_date', 'check_out_time', 'duration_of_stay', 'room_type', 'num_rooms', 'num_guests', 'adults_count', 'kids_count', 'breakfast', 'total_amount', 'advance_paid', 'balance_amount', 'vehicle_number', 'payment_amount', 'resort_name', 'resort_phone', 'agent_name', 'agent_phone', 'booking_source'];
    if (defaultTagKeys.includes(cleanKey) || customTags.some(t => t.key === cleanKey)) {
      alert("This tag key already exists.");
      return;
    }

    const updated = [...customTags, { key: cleanKey, value: newTagVal }];
    setCustomTags(updated);
    setNewTagKey('');
    setNewTagVal('');
  };

  const handleRemoveCustomTag = (keyToRemove) => {
    const updated = customTags.filter(t => t.key !== keyToRemove);
    setCustomTags(updated);
  };

  // Keep track of which template textarea is currently focused/active
  const [activeTextarea, setActiveTextarea] = useState('confirm');

  const insertTag = (tag) => {
    const fieldName = activeTextarea === 'confirm' ? 'whatsapp_confirm_msg_template' 
                    : activeTextarea === 'receipt' ? 'whatsapp_receipt_msg_template'
                    : activeTextarea === 'reminder' ? 'whatsapp_reminder_msg_template'
                    : 'whatsapp_review_msg_template';
                    
    const textarea = document.getElementById(fieldName);
    if (!textarea) return;

    const startPos = textarea.selectionStart;
    const endPos = textarea.selectionEnd;
    const text = commSettings[fieldName] || '';
    const newText = text.substring(0, startPos) + tag + text.substring(endPos);
    
    setCommSettings({
      ...commSettings,
      [fieldName]: newText
    });
    
    // Focus back and set selection
    setTimeout(() => {
      textarea.focus();
      textarea.selectionStart = textarea.selectionEnd = startPos + tag.length;
    }, 10);
  };

  const handleClearTemplate = (type) => {
    const fieldName = type === 'confirm' ? 'whatsapp_confirm_msg_template' 
                    : type === 'receipt' ? 'whatsapp_receipt_msg_template'
                    : type === 'reminder' ? 'whatsapp_reminder_msg_template'
                    : 'whatsapp_review_msg_template';
    setCommSettings(prev => ({ ...prev, [fieldName]: '' }));
  };

  const handleResetTemplate = (type) => {
    const fieldName = type === 'confirm' ? 'whatsapp_confirm_msg_template' 
                    : type === 'receipt' ? 'whatsapp_receipt_msg_template'
                    : type === 'reminder' ? 'whatsapp_reminder_msg_template'
                    : 'whatsapp_review_msg_template';
    const defaultValue = type === 'confirm' ? DEFAULT_CONFIRM_TEMPLATE 
                        : type === 'receipt' ? DEFAULT_RECEIPT_TEMPLATE
                        : type === 'reminder' ? DEFAULT_REMINDER_TEMPLATE
                        : DEFAULT_REVIEW_TEMPLATE;
    setCommSettings(prev => ({ ...prev, [fieldName]: defaultValue }));
  };

  const fetchResortDetails = async () => {
    if (!activeResortId) return;
    try {
      const { data, error } = await supabase
        .from('resorts')
        .select('name, phone')
        .eq('id', activeResortId)
        .maybeSingle();
      if (data) {
        setResortName(data.name || '');
        setResortPhone(data.phone || '');
      }
    } catch (e) {
      console.error("Error fetching resort details:", e);
    }
  };

  useEffect(() => {
    if (activeResortId) {
      fetchCommSettings();
      fetchResortDetails();
      fetchGlobalSettings();
    }
  }, [activeResortId]);

  useEffect(() => {
    fetchGlobalSettings();
  }, [session]);

  const fetchGlobalSettings = async () => {
    try {
      const { data: adminList } = await supabase.from('profiles').select('global_settings').eq('role', 'super_admin').limit(1);
      if (adminList && adminList.length > 0) {
        const data = adminList[0];
        if (data && data.global_settings) {
          setGlobalCommEnabled(data.global_settings.comm_features_enabled !== false);
          setGlobalTemplatesEnabled(data.global_settings.templates_enabled !== false);
        }
      }
      
      // Fetch latest profile to ensure toggles/permissions are fresh
      if (session?.user?.id) {
        const { data: latestProfile, error } = await supabase.from('profiles').select('*').eq('id', session.user.id).maybeSingle();
        if (latestProfile && !error) {
          setProfile(latestProfile);
        }
      }
    } catch (e) {
      console.error("Error fetching global settings:", e);
    }
  };

  const fetchCommSettings = async () => {
    try {
      const { data, error } = await supabase
        .from('tenant_integrations')
        .select('*')
        .eq('resort_id', activeResortId)
        .maybeSingle();
      
      if (data) {
        const confirm_tpl = data.whatsapp_confirm_msg_template || DEFAULT_CONFIRM_TEMPLATE;
        const receipt_tpl = data.whatsapp_receipt_msg_template || DEFAULT_RECEIPT_TEMPLATE;
        const reminder_tpl = data.whatsapp_reminder_msg_template || DEFAULT_REMINDER_TEMPLATE;
        const review_tpl = data.whatsapp_review_msg_template || DEFAULT_REVIEW_TEMPLATE;
        setCommSettings({
          email_enabled: data.email_enabled || false,
          email_api_key: data.email_api_key || '',
          email_from_address: data.email_from_address || '',
          email_from_name: data.email_from_name || '',
          whatsapp_enabled: data.whatsapp_enabled || false,
          whatsapp_access_token: data.whatsapp_access_token || '',
          whatsapp_phone_number_id: data.whatsapp_phone_number_id || '',
          whatsapp_business_account_id: data.whatsapp_business_account_id || '',
          auto_booking_confirmation: data.auto_booking_confirmation || false,
          auto_checkin_reminder: data.auto_checkin_reminder || false,
          auto_payment_receipt: data.auto_payment_receipt || false,
          whatsapp_confirm_msg_template: confirm_tpl,
          whatsapp_receipt_msg_template: receipt_tpl,
          whatsapp_reminder_msg_template: reminder_tpl,
          whatsapp_review_msg_template: review_tpl
        });
        if (data.whatsapp_custom_tags) {
          try {
            const tags = typeof data.whatsapp_custom_tags === 'string' ? JSON.parse(data.whatsapp_custom_tags) : data.whatsapp_custom_tags;
            setCustomTags(tags);
            const wifiTag = tags.find(t => t.key === 'wifi_password');
            if (wifiTag) {
              setWifiPassword(wifiTag.value || '');
            }
          } catch (e) {
            console.error("Failed to parse custom tags:", e);
          }
        }
      }
    } catch (err) {
      console.error("Error fetching comm settings:", err);
    }
  };

  const saveResortDetails = async (e) => {
    e.preventDefault();
    setSavingResort(true);
    try {
      const { error: resortError } = await supabase
        .from('resorts')
        .update({ name: resortName, phone: resortPhone })
        .eq('id', activeResortId);
      if (resortError) throw resortError;

      const updatedTags = [...customTags];
      const wifiIndex = updatedTags.findIndex(t => t.key === 'wifi_password');
      if (wifiIndex !== -1) {
        updatedTags[wifiIndex] = { key: 'wifi_password', value: wifiPassword };
      } else {
        updatedTags.push({ key: 'wifi_password', value: wifiPassword });
      }
      setCustomTags(updatedTags);

      const payload = {
        tenant_id: profile.id,
        resort_id: activeResortId,
        ...commSettings,
        whatsapp_custom_tags: updatedTags,
        updated_at: new Date().toISOString()
      };

      const { error: commError } = await supabase
        .from('tenant_integrations')
        .upsert(payload, { onConflict: 'resort_id' });
      if (commError) throw commError;

      alert("Resort details and Wi-Fi password updated successfully!");
    } catch (err) {
      alert("Error saving resort info: " + err.message);
    } finally {
      setSavingResort(false);
    }
  };

  const saveCommSettings = async (e) => {
    e.preventDefault();
    setSavingComm(true);
    try {
      const updatedTags = [...customTags];
      const wifiIndex = updatedTags.findIndex(t => t.key === 'wifi_password');
      if (wifiIndex !== -1) {
        updatedTags[wifiIndex] = { key: 'wifi_password', value: wifiPassword };
      } else {
        updatedTags.push({ key: 'wifi_password', value: wifiPassword });
      }
      setCustomTags(updatedTags);

      const payload = {
        tenant_id: profile.id,
        resort_id: activeResortId,
        ...commSettings,
        whatsapp_custom_tags: updatedTags,
        updated_at: new Date().toISOString()
      };

      const { error } = await supabase
        .from('tenant_integrations')
        .upsert(payload, { onConflict: 'resort_id' });

      if (error) {
        // Fallback: If DB columns do not exist, try upserting without template columns
        if (error.message && (error.message.includes('column') || error.code === '42703')) {
          console.warn("DB template columns missing. Saving other configuration in database.");
          const { whatsapp_confirm_msg_template, whatsapp_receipt_msg_template, whatsapp_reminder_msg_template, whatsapp_review_msg_template, ...cleanSettings } = commSettings;
          const retryPayload = {
            tenant_id: profile.id,
            resort_id: activeResortId,
            ...cleanSettings,
            updated_at: new Date().toISOString()
          };
          const { error: retryError } = await supabase
            .from('tenant_integrations')
            .upsert(retryPayload, { onConflict: 'resort_id' });
          if (retryError) throw retryError;
        } else {
          throw error;
        }
      }
      alert("Communication settings saved successfully!");
    } catch (err) {
      alert("Error saving settings: " + err.message);
    } finally {
      setSavingComm(false);
    }
  };

  const saveGeneralSettings = async (e) => {
    e.preventDefault();
    setSavingGeneral(true);
    try {
      // Update Profile (User Name)
      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .update({ full_name: userName })
        .eq('id', profile.id)
        .select();
      if (profileError) throw profileError;
      if (profileData && profileData.length > 0) {
        setProfile(profileData[0]);
      }
      alert("Profile updated successfully!");
    } catch (err) {
      alert("Error updating profile: " + err.message);
    } finally {
      setSavingGeneral(false);
    }
  };

  const updateProfile = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('profiles')
        .update({ full_name: userName })
        .eq('id', profile.id)
        .select();
      
      if (error) throw error;
      setProfile(data[0]);
      alert("Profile updated successfully!");
    } catch (err) {
      alert("Error updating profile: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  const wipeData = async () => {
    const pw = window.prompt("WARNING: This will permanently delete ALL Bookings, Incomes, and Expenses.\n\nEnter master password to confirm:");
    if (pw !== "admin123") {
      if (pw !== null) alert("Incorrect password.");
      return;
    }
    
    try {
      await supabase.from('incomes').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      await supabase.from('expenses').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      await supabase.from('bookings').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      
      alert("All transactional data has been completely wiped!");
      window.location.reload();
    } catch(err) {
      alert("Error wiping data: " + err.message);
    }
  };

  const [testEmail, setTestEmail] = useState('');
  const [testPhone, setTestPhone] = useState('');

  const testConnection = async (type) => {
    if (!activeResortId) return;
    if (type === 'email' && !testEmail) return alert('Please enter a test recipient email');
    if (type === 'whatsapp' && !testPhone) return alert('Please enter a test recipient phone number');
    
    setTestStatus(prev => ({ ...prev, [type]: { loading: true, success: null, message: 'Sending test...' } }));
    
    try {
      const { data, error } = await supabase.functions.invoke('send-notification', {
        body: { 
          type: 'test_' + type, 
          resort_id: activeResortId,
          test_recipient: type === 'email' ? testEmail : testPhone
        }
      });

      if (error) {
        let msg = error.message;
        if (msg.includes('Function not found')) {
          msg = `Edge Function 'send-notification' not deployed.`;
        }
        setTestStatus(prev => ({ ...prev, [type]: { loading: false, success: false, message: msg } }));
      } else {
        // Check for specific API errors (Meta/Resend)
        const waError = data?.results?.whatsapp?.error;
        const emailError = data?.results?.email?.errors?.[0];

        if (waError) {
          setTestStatus(prev => ({ ...prev, [type]: { loading: false, success: false, message: `WhatsApp Error: ${waError.message}` } }));
        } else if (emailError) {
          setTestStatus(prev => ({ ...prev, [type]: { loading: false, success: false, message: `Email Error: ${emailError.message}` } }));
        } else {
          setTestStatus(prev => ({ ...prev, [type]: { loading: false, success: true, message: `${type === 'email' ? 'Email' : 'WhatsApp'} test successful!` } }));
        }
      }
    } catch (err) {
      setTestStatus(prev => ({ ...prev, [type]: { loading: false, success: false, message: err.message } }));
    }
  };

  return (
    <div style={{ maxWidth: '1000px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      
      <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr', gap: '2rem' }}>
        {/* Sidebar Nav */}
        <aside style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <button 
            type="button"
            onClick={() => setActiveTab('general')}
            style={{ 
              padding: '0.75rem 1rem', 
              background: activeTab === 'general' ? 'var(--primary)' : 'transparent', 
              color: activeTab === 'general' ? 'white' : 'var(--text-muted)', 
              borderRadius: '8px', 
              cursor: 'pointer', 
              display: 'flex', 
              alignItems: 'center', 
              gap: '0.75rem',
              border: 'none',
              textAlign: 'left',
              width: '100%',
              fontSize: '0.95rem',
              fontWeight: 500,
              transition: 'all 0.2s'
            }}
          >
            <SettingsIcon size={18} /> General Settings
          </button>

          {(profile?.role === 'super_admin' || (profile?.role === 'tenant_admin' && globalTemplatesEnabled && profile?.feature_comm_enabled !== false)) && (
            <button 
              type="button"
              onClick={() => setActiveTab('templates')}
              style={{ 
                padding: '0.75rem 1rem', 
                background: activeTab === 'templates' ? 'var(--primary)' : 'transparent', 
                color: activeTab === 'templates' ? 'white' : 'var(--text-muted)', 
                borderRadius: '8px', 
                cursor: 'pointer', 
                display: 'flex', 
                alignItems: 'center', 
                gap: '0.75rem',
                border: 'none',
                textAlign: 'left',
                width: '100%',
                fontSize: '0.95rem',
                fontWeight: 500,
                transition: 'all 0.2s'
              }}
            >
              <MessageCircle size={18} /> Templates Management
            </button>
          )}

          <button 
            type="button"
            onClick={() => setActiveTab('security')}
            style={{ 
              padding: '0.75rem 1rem', 
              background: activeTab === 'security' ? 'var(--primary)' : 'transparent', 
              color: activeTab === 'security' ? 'white' : 'var(--text-muted)', 
              borderRadius: '8px', 
              cursor: 'pointer', 
              display: 'flex', 
              alignItems: 'center', 
              gap: '0.75rem',
              border: 'none',
              textAlign: 'left',
              width: '100%',
              fontSize: '0.95rem',
              fontWeight: 500,
              transition: 'all 0.2s'
            }}
          >
            <ShieldAlert size={18} /> Security
          </button>
        </aside>

        <main style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
          {/* GENERAL SETTINGS TAB */}
          {activeTab === 'general' && (
            <>
              <div style={{ marginBottom: '1rem' }}>
                <h1 style={{ fontSize: '1.75rem', marginBottom: '0.25rem' }}>General Settings</h1>
                <p style={{ color: 'var(--text-muted)', margin: 0, fontSize: '0.9rem' }}>Manage your personal profile and resort configurations.</p>
              </div>

              {/* User Profile Card */}
              <div className="card">
                <h2 style={{ marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.75rem', fontSize: '1.25rem' }}>
                  <User size={24} color="var(--primary)" /> User Profile
                </h2>
                <p style={{ color: 'var(--text-muted)', marginBottom: '1.5rem', fontSize: '0.9rem' }}>Update your personal identity details and account contact name.</p>
                <form onSubmit={saveGeneralSettings}>
                  <div className="form-group">
                    <label className="form-label">Full Name</label>
                    <input 
                      type="text" 
                      className="form-input" 
                      value={userName} 
                      onChange={e => setUserName(e.target.value)} 
                      required 
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Email Address (Read-only)</label>
                    <input 
                      type="text" 
                      className="form-input" 
                      value={session?.user?.email || ''} 
                      disabled 
                      style={{ opacity: 0.6, cursor: 'not-allowed' }} 
                    />
                  </div>
                  <button type="submit" className="btn btn-primary" disabled={savingGeneral}>
                    {savingGeneral ? 'Saving...' : 'Update Profile'}
                  </button>
                </form>
              </div>

              {/* Communications API Configurations */}
              {(profile?.role === 'super_admin' || (profile?.role === 'tenant_admin' && globalCommEnabled && profile?.feature_comm_enabled !== false)) && (
                <div className="card">
                  <h2 style={{ marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <Mail size={24} color="var(--primary)" /> Communications & Automations
                  </h2>
                  <p style={{ color: 'var(--text-muted)', marginBottom: '1.5rem', fontSize: '0.9rem' }}>Configure API settings and automated actions.</p>
                  
                  <form onSubmit={saveCommSettings}>
                    {/* Email (Resend) */}
                    <div style={{ border: '1px solid var(--border)', borderRadius: '12px', padding: '1.5rem', marginBottom: '1.5rem' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                          <div style={{ background: 'rgba(59, 130, 246, 0.1)', padding: '0.5rem', borderRadius: '8px' }}>
                            <Mail size={20} color="var(--primary)" />
                          </div>
                          <h3 style={{ margin: 0, fontSize: '1.1rem' }}>Email Integration (Resend)</h3>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.5rem' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <input 
                              type="email" 
                              placeholder="Test Email..." 
                              className="form-input" 
                              style={{ height: '32px', width: '160px', fontSize: '0.75rem' }} 
                              value={testEmail} 
                              onChange={e => setTestEmail(e.target.value)} 
                            />
                            <button type="button" onClick={() => testConnection('email')} className="btn btn-outline" style={{ height: '32px', fontSize: '0.75rem', padding: '0 0.75rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }} disabled={!commSettings.email_api_key || testStatus.email.loading}>
                              {testStatus.email.loading ? <Loader2 size={14} className="animate-spin" /> : 'Send Test'}
                            </button>
                            <button 
                              type="button" 
                              onClick={() => setCommSettings({...commSettings, email_enabled: !commSettings.email_enabled})}
                              className={`btn ${commSettings.email_enabled ? 'btn-primary' : 'btn-outline'}`}
                              style={{ 
                                height: '32px', 
                                fontSize: '0.75rem', 
                                padding: '0 0.75rem', 
                                minWidth: '80px',
                                background: commSettings.email_enabled ? 'var(--primary)' : 'transparent',
                                color: commSettings.email_enabled ? 'white' : 'var(--text-main)',
                                border: commSettings.email_enabled ? 'none' : '1px solid var(--border)'
                              }}
                            >
                              {commSettings.email_enabled ? 'Active' : 'Inactive'}
                            </button>
                          </div>
                          {testStatus.email.message && (
                            <div style={{ 
                              fontSize: '0.75rem', 
                              display: 'flex', 
                              alignItems: 'center', 
                              gap: '0.5rem',
                              color: testStatus.email.success === null ? 'var(--text-muted)' : (testStatus.email.success ? '#10b981' : '#ef4444'),
                              background: testStatus.email.success === null ? 'rgba(0,0,0,0.05)' : (testStatus.email.success ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)'),
                              padding: '6px 10px',
                              borderRadius: '6px',
                              width: 'fit-content'
                            }}>
                              {testStatus.email.loading ? <Loader2 size={12} className="animate-spin" /> : (testStatus.email.success ? <CheckCircle2 size={12} /> : <XCircle size={12} />)}
                              {testStatus.email.message}
                            </div>
                          )}
                        </div>
                      </div>
                      
                      <div className="grid-2" style={{ gap: '1.5rem' }}>
                        <div className="form-group">
                          <label className="form-label">Resend API Key</label>
                          <input type="password" placeholder="re_..." className="form-input" value={commSettings.email_api_key} onChange={e => setCommSettings({...commSettings, email_api_key: e.target.value})} />
                        </div>
                        <div className="form-group">
                          <label className="form-label">Sender Email Address</label>
                          <input type="email" placeholder="info@yourdomain.com" className="form-input" value={commSettings.email_from_address} onChange={e => setCommSettings({...commSettings, email_from_address: e.target.value})} />
                        </div>
                        <div className="form-group">
                          <label className="form-label">Sender Name</label>
                          <input type="text" placeholder="Cheerful Chalet" className="form-input" value={commSettings.email_from_name} onChange={e => setCommSettings({...commSettings, email_from_name: e.target.value})} />
                        </div>
                      </div>
                    </div>

                    {/* WhatsApp (Meta) */}
                    <div style={{ border: '1px solid var(--border)', borderRadius: '12px', padding: '1.5rem', marginBottom: '1.5rem' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                          <div style={{ background: 'rgba(34, 197, 94, 0.1)', padding: '0.5rem', borderRadius: '8px' }}>
                            <MessageCircle size={20} color="#22c55e" />
                          </div>
                          <h3 style={{ margin: 0, fontSize: '1.1rem' }}>WhatsApp Integration (Meta Cloud)</h3>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.5rem' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <input 
                              type="text" 
                              placeholder="Test Phone..." 
                              className="form-input" 
                              style={{ height: '32px', width: '150px', fontSize: '0.75rem' }} 
                              value={testPhone} 
                              onChange={e => setTestPhone(e.target.value)} 
                            />
                            <button type="button" onClick={() => testConnection('whatsapp')} className="btn btn-outline" style={{ height: '32px', fontSize: '0.75rem', padding: '0 0.75rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }} disabled={!commSettings.whatsapp_access_token || testStatus.whatsapp.loading}>
                              {testStatus.whatsapp.loading ? <Loader2 size={14} className="animate-spin" /> : 'Send Test'}
                            </button>
                            <button 
                              type="button" 
                              onClick={() => setCommSettings({...commSettings, whatsapp_enabled: !commSettings.whatsapp_enabled})}
                              className={`btn ${commSettings.whatsapp_enabled ? 'btn-primary' : 'btn-outline'}`}
                              style={{ 
                                height: '32px', 
                                fontSize: '0.75rem', 
                                padding: '0 0.75rem', 
                                minWidth: '80px',
                                background: commSettings.whatsapp_enabled ? '#22c55e' : 'transparent',
                                color: commSettings.whatsapp_enabled ? 'white' : 'var(--text-main)',
                                border: commSettings.whatsapp_enabled ? 'none' : '1px solid var(--border)'
                              }}
                            >
                              {commSettings.whatsapp_enabled ? 'Active' : 'Inactive'}
                            </button>
                          </div>
                          {testStatus.whatsapp.message && (
                            <div style={{ 
                              fontSize: '0.75rem', 
                              display: 'flex', 
                              alignItems: 'center', 
                              gap: '0.5rem',
                              color: testStatus.whatsapp.success === null ? 'var(--text-muted)' : (testStatus.whatsapp.success ? '#10b981' : '#ef4444'),
                              background: testStatus.whatsapp.success === null ? 'rgba(0,0,0,0.05)' : (testStatus.whatsapp.success ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)'),
                              padding: '6px 10px',
                              borderRadius: '6px',
                              width: 'fit-content'
                            }}>
                              {testStatus.whatsapp.loading ? <Loader2 size={12} className="animate-spin" /> : (testStatus.whatsapp.success ? <CheckCircle2 size={12} /> : <XCircle size={12} />)}
                              {testStatus.whatsapp.message}
                            </div>
                          )}
                        </div>
                      </div>
                      
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                        <div className="form-group">
                          <label className="form-label">Permanent Access Token</label>
                          <input type="password" placeholder="EAAB..." className="form-input" value={commSettings.whatsapp_access_token} onChange={e => setCommSettings({...commSettings, whatsapp_access_token: e.target.value})} />
                        </div>
                        <div className="grid-2" style={{ gap: '1.5rem' }}>
                          <div className="form-group">
                            <label className="form-label">Phone Number ID</label>
                            <input type="text" placeholder="10555..." className="form-input" value={commSettings.whatsapp_phone_number_id} onChange={e => setCommSettings({...commSettings, whatsapp_phone_number_id: e.target.value})} />
                          </div>
                          <div className="form-group">
                            <label className="form-label">Business Account ID</label>
                            <input type="text" placeholder="12345..." className="form-input" value={commSettings.whatsapp_business_account_id} onChange={e => setCommSettings({...commSettings, whatsapp_business_account_id: e.target.value})} />
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Automation Toggles */}
                    <div style={{ background: 'rgba(0,0,0,0.02)', padding: '1.5rem', borderRadius: '12px', marginBottom: '1.5rem' }}>
                      <h3 style={{ fontSize: '1rem', marginBottom: '1rem' }}>Automated Guest Notifications</h3>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '1rem', cursor: 'pointer' }}>
                          <input type="checkbox" checked={commSettings.auto_booking_confirmation} onChange={e => setCommSettings({...commSettings, auto_booking_confirmation: e.target.checked})} />
                          <div>
                            <span style={{ fontWeight: 600, display: 'block' }}>Booking Confirmation</span>
                            <small style={{ color: 'var(--text-muted)' }}>Send details immediately after a new booking is created.</small>
                          </div>
                        </label>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '1rem', cursor: 'pointer' }}>
                          <input type="checkbox" checked={commSettings.auto_checkin_reminder} onChange={e => setCommSettings({...commSettings, auto_checkin_reminder: e.target.checked})} />
                          <div>
                            <span style={{ fontWeight: 600, display: 'block' }}>Check-in Reminder</span>
                            <small style={{ color: 'var(--text-muted)' }}>Send welcome info 24 hours before guest arrival.</small>
                          </div>
                        </label>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '1rem', cursor: 'pointer' }}>
                          <input type="checkbox" checked={commSettings.auto_payment_receipt} onChange={e => setCommSettings({...commSettings, auto_payment_receipt: e.target.checked})} />
                          <div>
                            <span style={{ fontWeight: 600, display: 'block' }}>Payment Receipt</span>
                            <small style={{ color: 'var(--text-muted)' }}>Send an official receipt whenever a payment is logged.</small>
                          </div>
                        </label>
                      </div>
                    </div>

                    <button type="submit" className="btn btn-primary" disabled={savingComm} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', width: '100%', justifyContent: 'center', padding: '1rem' }}>
                      <Save size={18} /> {savingComm ? 'Saving Settings...' : 'Save API Configuration'}
                    </button>
                  </form>
                </div>
              )}

              {/* Appearance Section */}
              <div className="card">
                <h2 style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <Palette size={24} color="var(--primary)" /> Appearance & Theme
                </h2>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <p style={{ margin: 0, fontWeight: '500' }}>Current Mode: {theme === 'light' ? 'Light (Eco)' : 'Dark (Luxury)'}</p>
                    <p style={{ margin: '0.25rem 0 0', fontSize: '0.875rem', color: 'var(--text-muted)' }}>Customize how the dashboard looks on your screen.</p>
                  </div>
                  <button className="btn btn-outline" onClick={toggleTheme}>
                    Toggle Theme
                  </button>
                </div>
              </div>
            </>
          )}

          {/* TEMPLATES MANAGEMENT TAB */}
          {activeTab === 'templates' && (profile?.role === 'tenant_admin' || profile?.role === 'super_admin') && (
            <div className="card">
              <h2 style={{ marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <MessageCircle size={24} color="var(--primary)" /> Templates Management
              </h2>
              <p style={{ color: 'var(--text-muted)', marginBottom: '1.5rem', fontSize: '0.9rem' }}>Customize templates and variables for client-side WhatsApp messaging.</p>

              <form onSubmit={saveCommSettings}>
                {/* WhatsApp Text Templates */}
                <div style={{ background: 'rgba(0,0,0,0.02)', padding: '1.5rem', borderRadius: '12px', marginBottom: '1.5rem', border: '1px solid var(--border)' }}>
                  <h3 style={{ fontSize: '1.1rem', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <MessageCircle size={18} color="#22c55e" /> Client-Side WhatsApp Templates
                  </h3>
                  <p style={{ color: 'var(--text-muted)', marginBottom: '1rem', fontSize: '0.8rem' }}>
                    Customize the messages generated on the Bookings page. Placeholders will be replaced automatically.
                  </p>
                  
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '1.25rem', padding: '0.75rem', background: 'var(--bg-secondary)', borderRadius: '8px', border: '1px solid var(--border)' }}>
                    <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', display: 'inline-flex', alignItems: 'center' }}>
                      Click to Add Placeholder Tag to {activeTextarea === 'confirm' ? 'Confirmation' : activeTextarea === 'receipt' ? 'Receipt' : activeTextarea === 'reminder' ? 'Reminder' : 'Review/Thanks'}:
                    </span>
                    {[
                      '{guest_name}', '{booking_id}', '{check_in_date}', '{check_in_time}', 
                      '{check_out_date}', '{check_out_time}', '{duration_of_stay}', '{room_type}', 
                      '{num_rooms}', '{num_guests}', '{adults_count}', '{kids_count}', '{breakfast}', 
                      '{total_amount}', '{advance_paid}', '{balance_amount}', '{vehicle_number}', 
                      '{payment_amount}', '{resort_name}', '{resort_phone}', '{agent_name}',
                      '{agent_phone}', '{booking_source}',
                      ...customTags.map(t => `{${t.key}}`)
                    ].map(tag => (
                      <button
                        type="button"
                        key={tag}
                        onClick={() => insertTag(tag)}
                        style={{
                          fontSize: '0.7rem',
                          padding: '3px 8px',
                          background: 'var(--bg-color)',
                          borderRadius: '4px',
                          border: '1px solid var(--border)',
                          fontFamily: 'monospace',
                          color: 'var(--primary)',
                          cursor: 'pointer',
                          fontWeight: 600,
                          transition: 'all 0.15s'
                        }}
                        onMouseOver={e => e.currentTarget.style.borderColor = 'var(--primary)'}
                        onMouseOut={e => e.currentTarget.style.borderColor = 'var(--border)'}
                      >
                        {tag}
                      </button>
                    ))}
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                    {/* Booking Confirmation */}
                    <div className="form-group" style={{ margin: 0 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                        <label className="form-label" style={{ fontWeight: 600, margin: 0 }}>Booking Confirmation Template</label>
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                          <button type="button" onClick={() => handleClearTemplate('confirm')} style={{ fontSize: '0.75rem', color: 'var(--danger)', background: 'transparent', border: 'none', cursor: 'pointer', fontWeight: 500 }}>Clear</button>
                          <span style={{ color: 'var(--border)' }}>|</span>
                          <button type="button" onClick={() => handleResetTemplate('confirm')} style={{ fontSize: '0.75rem', color: 'var(--primary)', background: 'transparent', border: 'none', cursor: 'pointer', fontWeight: 500 }}>Reset</button>
                        </div>
                      </div>
                      <textarea 
                        id="whatsapp_confirm_msg_template"
                        className="form-input" 
                        rows={7} 
                        style={{ fontFamily: 'inherit', resize: 'vertical', padding: '0.75rem', height: 'auto', border: activeTextarea === 'confirm' ? '1px solid var(--primary)' : '1px solid var(--border)' }}
                        value={commSettings.whatsapp_confirm_msg_template} 
                        onChange={e => setCommSettings({...commSettings, whatsapp_confirm_msg_template: e.target.value})} 
                        onFocus={() => setActiveTextarea('confirm')}
                      />
                    </div>
                    
                    {/* Payment Receipt */}
                    <div className="form-group" style={{ margin: 0 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                        <label className="form-label" style={{ fontWeight: 600, margin: 0 }}>Payment Receipt Template</label>
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                          <button type="button" onClick={() => handleClearTemplate('receipt')} style={{ fontSize: '0.75rem', color: 'var(--danger)', background: 'transparent', border: 'none', cursor: 'pointer', fontWeight: 500 }}>Clear</button>
                          <span style={{ color: 'var(--border)' }}>|</span>
                          <button type="button" onClick={() => handleResetTemplate('receipt')} style={{ fontSize: '0.75rem', color: 'var(--primary)', background: 'transparent', border: 'none', cursor: 'pointer', fontWeight: 500 }}>Reset</button>
                        </div>
                      </div>
                      <textarea 
                        id="whatsapp_receipt_msg_template"
                        className="form-input" 
                        rows={6} 
                        style={{ fontFamily: 'inherit', resize: 'vertical', padding: '0.75rem', height: 'auto', border: activeTextarea === 'receipt' ? '1px solid var(--primary)' : '1px solid var(--border)' }}
                        value={commSettings.whatsapp_receipt_msg_template} 
                        onChange={e => setCommSettings({...commSettings, whatsapp_receipt_msg_template: e.target.value})} 
                        onFocus={() => setActiveTextarea('receipt')}
                      />
                    </div>

                    {/* Check-in Reminder */}
                    <div className="form-group" style={{ margin: 0 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                        <label className="form-label" style={{ fontWeight: 600, margin: 0 }}>Check-in Reminder Template</label>
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                          <button type="button" onClick={() => handleClearTemplate('reminder')} style={{ fontSize: '0.75rem', color: 'var(--danger)', background: 'transparent', border: 'none', cursor: 'pointer', fontWeight: 500 }}>Clear</button>
                          <span style={{ color: 'var(--border)' }}>|</span>
                          <button type="button" onClick={() => handleResetTemplate('reminder')} style={{ fontSize: '0.75rem', color: 'var(--primary)', background: 'transparent', border: 'none', cursor: 'pointer', fontWeight: 500 }}>Reset</button>
                        </div>
                      </div>
                      <textarea 
                        id="whatsapp_reminder_msg_template"
                        className="form-input" 
                        rows={6} 
                        style={{ fontFamily: 'inherit', resize: 'vertical', padding: '0.75rem', height: 'auto', border: activeTextarea === 'reminder' ? '1px solid var(--primary)' : '1px solid var(--border)' }}
                        value={commSettings.whatsapp_reminder_msg_template} 
                        onChange={e => setCommSettings({...commSettings, whatsapp_reminder_msg_template: e.target.value})} 
                        onFocus={() => setActiveTextarea('reminder')}
                      />
                    </div>

                    {/* Thanks & Review */}
                    <div className="form-group" style={{ margin: 0 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                        <label className="form-label" style={{ fontWeight: 600, margin: 0 }}>Thanks & Review Template</label>
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                          <button type="button" onClick={() => handleClearTemplate('review')} style={{ fontSize: '0.75rem', color: 'var(--danger)', background: 'transparent', border: 'none', cursor: 'pointer', fontWeight: 500 }}>Clear</button>
                          <span style={{ color: 'var(--border)' }}>|</span>
                          <button type="button" onClick={() => handleResetTemplate('review')} style={{ fontSize: '0.75rem', color: 'var(--primary)', background: 'transparent', border: 'none', cursor: 'pointer', fontWeight: 500 }}>Reset</button>
                        </div>
                      </div>
                      <textarea 
                        id="whatsapp_review_msg_template"
                        className="form-input" 
                        rows={6} 
                        style={{ fontFamily: 'inherit', resize: 'vertical', padding: '0.75rem', height: 'auto', border: activeTextarea === 'review' ? '1px solid var(--primary)' : '1px solid var(--border)' }}
                        value={commSettings.whatsapp_review_msg_template} 
                        onChange={e => setCommSettings({...commSettings, whatsapp_review_msg_template: e.target.value})} 
                        onFocus={() => setActiveTextarea('review')}
                      />
                    </div>
                  </div>

                  {/* Custom Template Variables */}
                  <div style={{ marginTop: '1.5rem', borderTop: '1px solid var(--border)', paddingTop: '1.5rem' }}>
                    <h4 style={{ fontSize: '0.95rem', fontWeight: 700, marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      Manage Custom Tags
                    </h4>
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginBottom: '1rem' }}>
                      Add custom tags (e.g. <code>wifi_password</code>) and define their values. They will appear in the quick tags list above.
                    </p>

                    {/* Add Custom Tag Form */}
                    <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
                      <div style={{ flex: 1, minWidth: '150px' }}>
                        <input 
                          type="text" 
                          className="form-input" 
                          style={{ height: '36px', fontSize: '0.85rem', padding: '0 0.5rem' }} 
                          placeholder="Tag Key (e.g. wifi_password)" 
                          value={newTagKey}
                          onChange={e => setNewTagKey(e.target.value)}
                        />
                      </div>
                      <div style={{ flex: 2, minWidth: '200px' }}>
                        <input 
                          type="text" 
                          className="form-input" 
                          style={{ height: '36px', fontSize: '0.85rem', padding: '0 0.5rem' }} 
                          placeholder="Tag Value (e.g. chalet2026)" 
                          value={newTagVal}
                          onChange={e => setNewTagVal(e.target.value)}
                        />
                      </div>
                      <button 
                        type="button" 
                        onClick={handleAddCustomTag}
                        className="btn btn-outline"
                        style={{ height: '36px', padding: '0 1rem', fontSize: '0.85rem', display: 'inline-flex', alignItems: 'center' }}
                      >
                        Add Tag
                      </button>
                    </div>

                    {/* Custom Tags List */}
                    {customTags.length > 0 ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', background: 'var(--bg-color)', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--border)' }}>
                        {customTags.map(tag => (
                          <div key={tag.key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.25rem 0' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                              <code style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--primary)', fontFamily: 'monospace' }}>{`{${tag.key}}`}</code>
                              <span style={{ color: 'var(--text-muted)' }}>:</span>
                              <span style={{ fontSize: '0.85rem', fontWeight: 500 }}>{tag.value}</span>
                            </div>
                            <button 
                              type="button" 
                              onClick={() => handleRemoveCustomTag(tag.key)} 
                              style={{ fontSize: '0.75rem', color: 'var(--danger)', background: 'transparent', border: 'none', cursor: 'pointer', fontWeight: 500 }}
                            >
                              Remove
                            </button>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <small style={{ color: 'var(--text-muted)', display: 'block', fontStyle: 'italic' }}>No custom tags added yet.</small>
                    )}
                  </div>
                </div>

                <button type="submit" className="btn btn-primary" disabled={savingComm} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', width: '100%', justifyContent: 'center', padding: '1rem' }}>
                  <Save size={18} /> {savingComm ? 'Saving Templates...' : 'Save Templates & Custom Tags'}
                </button>
              </form>
            </div>
          )}

          {/* SECURITY TAB */}
          {activeTab === 'security' && (
            <>
              {/* Danger Zone */}
              {(profile?.role === 'tenant_admin' || profile?.role === 'super_admin') && (
                <div className="card" style={{ border: '1px solid var(--danger)' }}>
                  <h2 style={{ marginBottom: '1rem', color: 'var(--danger)', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <ShieldAlert size={24} /> Danger Zone
                  </h2>
                  <p style={{ color: 'var(--text-muted)', marginBottom: '1.5rem' }}>
                    Factory Reset: This action will permanently delete all transactional history (Bookings, Incomes, Expenses). 
                  </p>
                  <button 
                    className="btn" 
                    style={{ background: 'var(--danger)', color: 'white', border: 'none' }} 
                    onClick={wipeData}
                  >
                    Reset Transactional Data
                  </button>
                </div>
              )}
            </>
          )}
        </main>
      </div>
    </div>
  );
}
