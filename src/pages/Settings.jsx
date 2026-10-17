import React, { useState, useEffect } from 'react';
import { useSettingsStore } from '../lib/store';
import { supabase } from '../lib/supabase';
import { AlertTriangle, User, Palette, ShieldAlert, Mail, MessageCircle, Settings as SettingsIcon, Save, CheckCircle2, CheckCircle, XCircle, Loader2, Database, Trash2, FileText, Fingerprint, Sun, Moon, Monitor, X, Tag, Receipt, ReceiptText, PackagePlus, UserRound, Building2, Lock, AlertCircle, Info, CreditCard } from 'lucide-react';
import { NativeBiometric } from '@capgo/capacitor-native-biometric';
import { Preferences } from '@capacitor/preferences';
import { Capacitor } from '@capacitor/core';
import { INDIAN_STATES, getStateCodeByName } from '../lib/indianStates';
import { validateTenantBilling, formatFullAddress, loadTenantBillingProfile, saveTenantBillingProfile, saveTenantGuestGstSettings } from '../lib/tenantBilling';

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

const DEFAULT_PAYMENT_REMINDER_TEMPLATE = `Dear {guest_name},

This is a gentle reminder that there is a pending balance of ₹{balance_amount} for your upcoming stay at {resort_name}.
Booking ID: {booking_id}

Please clear the dues at your earliest convenience to ensure a smooth check-in.

📞 Contact: {resort_phone}`;

// Add-on & Pricing Settings Component
export const PricingSettings = ({ activeResortId, resorts }) => {
  const [globalPricing, setGlobalPricing] = useState({ breakfast: '', 'Fire camp': '', 'BBQ': '', 'Food': '' });
  const [cottages, setCottages] = useState([]);
  const [selectedCottage, setSelectedCottage] = useState('global');
  const [propertyPricing, setPropertyPricing] = useState({ breakfast: '', 'Fire camp': '', 'BBQ': '', 'Food': '' });
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState({ text: '', type: '' });

  useEffect(() => {
    fetchPricing();
  }, [activeResortId, selectedCottage]);

  const fetchPricing = async () => {
    if (!activeResortId) return;
    
    // Fetch global pricing
    if (selectedCottage === 'global') {
      const { data, error } = await supabase.from('resorts').select('addon_pricing').eq('id', activeResortId).single();
      if (!error && data) {
        setGlobalPricing(data.addon_pricing || { breakfast: '', 'Fire camp': '', 'BBQ': '', 'Food': '' });
      }
    } else {
      // Fetch property pricing
      const { data, error } = await supabase.from('cottages').select('addon_pricing').eq('id', selectedCottage).single();
      if (!error && data) {
        setPropertyPricing(data.addon_pricing || { breakfast: '', 'Fire camp': '', 'BBQ': '', 'Food': '' });
      }
    }

    // Load cottages list once
    if (cottages.length === 0) {
      const { data } = await supabase.from('cottages').select('id, name').eq('resort_id', activeResortId);
      if (data) setCottages(data);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setMsg({ text: '', type: '' });
    
    try {
      if (selectedCottage === 'global') {
        const { error } = await supabase.from('resorts').update({ addon_pricing: globalPricing }).eq('id', activeResortId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('cottages').update({ addon_pricing: propertyPricing }).eq('id', selectedCottage);
        if (error) throw error;
      }
      setMsg({ text: 'Pricing saved successfully!', type: 'success' });
      setTimeout(() => setMsg({ text: '', type: '' }), 3000);
    } catch (e) {
      setMsg({ text: e.message, type: 'error' });
    }
    
    setSaving(false);
  };

  const currentPricing = selectedCottage === 'global' ? globalPricing : propertyPricing;
  const setPricing = selectedCottage === 'global' ? setGlobalPricing : setPropertyPricing;

  const handlePriceChange = (key, val) => {
    setPricing({ ...currentPricing, [key]: val === '' ? '' : Number(val) });
  };

  return (
    <div className="settings-card">
      <div className="card-header">
        <h3 className="card-title"><Tag size={20} /> Add-ons & Pricing Configuration</h3>
        <p className="card-description">Set global default prices for add-ons, or override them for specific properties.</p>
      </div>
      <div className="card-body">
        
        <div className="form-group" style={{ marginBottom: '2rem' }}>
          <label className="premium-label">Configuration Level</label>
          <select className="premium-select" value={selectedCottage} onChange={(e) => setSelectedCottage(e.target.value)}>
            <option value="global">🌍 Global Default (All Properties)</option>
            {cottages.map(c => (
              <option key={c.id} value={c.id}>🏠 Property: {c.name}</option>
            ))}
          </select>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '1.5rem', marginBottom: '2rem' }}>
          {['breakfast', 'Fire camp', 'BBQ', 'Food'].map(addon => (
            <div key={addon} className="form-group">
              <label className="premium-label" style={{ textTransform: 'capitalize' }}>{addon} Price (₹)</label>
              <input 
                type="number" 
                className="premium-input" 
                placeholder="0" 
                value={currentPricing[addon] ?? ''} 
                onChange={(e) => handlePriceChange(addon, e.target.value)} 
              />
            </div>
          ))}
        </div>

        {msg.text && (
          <div style={{ padding: '0.75rem', marginBottom: '1.5rem', borderRadius: '8px', background: msg.type === 'success' ? '#d1fae5' : '#fee2e2', color: msg.type === 'success' ? '#065f46' : '#991b1b', fontSize: '0.9rem' }}>
            {msg.text}
          </div>
        )}

        <button onClick={handleSave} disabled={saving} className="btn btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          {saving ? <Loader2 size={16} className="spin" /> : <Save size={16} />} 
          Save {selectedCottage === 'global' ? 'Global' : 'Property'} Pricing
        </button>
      </div>
    </div>
  );
};

export default function Settings() {
  const { profile, setProfile, theme, updateSettings, session, activeResortId, resorts } = useSettingsStore();
  const [userName, setUserName] = useState(profile?.full_name || '');
  const [billingDetails, setBillingDetails] = useState({
    companyName: profile?.global_settings?.tenant_billing?.companyName || '',
    gstin: profile?.global_settings?.tenant_billing?.gstin || '',
    address: profile?.global_settings?.tenant_billing?.address || ''
  });
  const [idRetentionDays, setIdRetentionDays] = useState(profile?.global_settings?.id_retention_days || 30);
  const [tenantGst, setTenantGst] = useState({
    enabled: profile?.global_settings?.tenant_gst?.enabled || false,
    slabThreshold: profile?.global_settings?.tenant_gst?.slabThreshold ?? 7500,
    lowerRate: profile?.global_settings?.tenant_gst?.lowerRate ?? 5,
    higherRate: profile?.global_settings?.tenant_gst?.higherRate ?? 18
  });

  // Stay Pilot Subscription Billing Profile State
  const [subscriptionBilling, setSubscriptionBilling] = useState(() => loadTenantBillingProfile(profile));
  const [subscriptionBillingErrors, setSubscriptionBillingErrors] = useState({});
  const [savingSubscriptionBilling, setSavingSubscriptionBilling] = useState(false);
  const [subscriptionBillingSuccess, setSubscriptionBillingSuccess] = useState(false);
  const [subscriptionBillingError, setSubscriptionBillingError] = useState(null);

  // Guest GST Settings Save States
  const [savingGuestGst, setSavingGuestGst] = useState(false);
  const [guestGstSuccess, setGuestGstSuccess] = useState(false);
  const [guestGstError, setGuestGstError] = useState(null);

  // Synchronize state when store profile changes/loads
  useEffect(() => {
    if (profile) {
      if (!userName && profile.full_name) {
        setUserName(profile.full_name);
      }
      setBillingDetails({
        companyName: profile?.global_settings?.tenant_billing?.companyName || '',
        gstin: profile?.global_settings?.tenant_billing?.gstin || '',
        address: profile?.global_settings?.tenant_billing?.address || ''
      });
      setTenantGst({
        enabled: profile?.global_settings?.tenant_gst?.enabled || false,
        slabThreshold: profile?.global_settings?.tenant_gst?.slabThreshold ?? 7500,
        lowerRate: profile?.global_settings?.tenant_gst?.lowerRate ?? 5,
        higherRate: profile?.global_settings?.tenant_gst?.higherRate ?? 18
      });
      setSubscriptionBilling(loadTenantBillingProfile(profile));
    }
  }, [profile]);

  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth <= 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);
  const [globalCommEnabled, setGlobalCommEnabled] = useState(true);
  const [globalTemplatesEnabled, setGlobalTemplatesEnabled] = useState(true);
  const [loading, setLoading] = useState(false);
  const [savingComm, setSavingComm] = useState(false);
  const [savingResort, setSavingResort] = useState(false);
  const [savingGeneral, setSavingGeneral] = useState(false);
  const [activeTab, setActiveTab] = useState(() => {
    return new URLSearchParams(window.location.search).get('tab') || 'general';
  });

  useEffect(() => {
    const urlTheme = new URLSearchParams(window.location.search).get('theme');
    if (urlTheme) {
      document.documentElement.setAttribute('data-theme', urlTheme);
    }
  }, []);
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
    whatsapp_review_msg_template: DEFAULT_REVIEW_TEMPLATE,
    whatsapp_payment_reminder_msg_template: DEFAULT_PAYMENT_REMINDER_TEMPLATE
  });

  // Data Manager (Cleanup) State
  const [cleanupYear, setCleanupYear] = useState(new Date().getFullYear() - 1);
  const [cleanupStats, setCleanupStats] = useState(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isCleaning, setIsCleaning] = useState(false);

  // Invoice Settings State
  const [cottages, setCottages] = useState([]);
  const [selectedInvoiceCottageId, setSelectedInvoiceCottageId] = useState(null);
  const [invoiceSettings, setInvoiceSettings] = useState({
    format: 'A4',
    email: '',
    phone: '',
    logo_url: ''
  });
  const [savingInvoice, setSavingInvoice] = useState(false);

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
                    : activeTextarea === 'payment_reminder' ? 'whatsapp_payment_reminder_msg_template'
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
                    : type === 'payment_reminder' ? 'whatsapp_payment_reminder_msg_template'
                    : 'whatsapp_review_msg_template';
    const defaultValue = type === 'confirm' ? DEFAULT_CONFIRM_TEMPLATE 
                        : type === 'receipt' ? DEFAULT_RECEIPT_TEMPLATE
                        : type === 'reminder' ? DEFAULT_REMINDER_TEMPLATE
                        : type === 'payment_reminder' ? DEFAULT_PAYMENT_REMINDER_TEMPLATE
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
      
      // Fetch cottages
      const { data: cottagesData } = await supabase
        .from('cottages')
        .select('*')
        .eq('resort_id', activeResortId);
      
      if (cottagesData) {
        setCottages(cottagesData);
        if (cottagesData.length > 0 && !selectedInvoiceCottageId) {
          setSelectedInvoiceCottageId(cottagesData[0].id);
        }
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
      const { data: globalSettings, error: rpcErr } = await supabase.rpc('get_published_global_settings');
      if (globalSettings && !rpcErr) {
        setGlobalCommEnabled(globalSettings.comm_features_enabled !== false);
        setGlobalTemplatesEnabled(globalSettings.templates_enabled !== false);
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

  useEffect(() => {
    if (cottages.length > 0 && !selectedInvoiceCottageId) {
      setSelectedInvoiceCottageId(cottages[0].id);
    }
  }, [cottages]);

  useEffect(() => {
    if (profile?.global_settings && selectedInvoiceCottageId) {
      const prefs = profile.global_settings.invoice_preferences || {};
      const currentPrefs = prefs[selectedInvoiceCottageId] || { format: 'A4', email: '', phone: '', logo_url: '' };
      setInvoiceSettings(currentPrefs);
    }
  }, [profile?.global_settings, selectedInvoiceCottageId]);

  const saveInvoiceSettings = async (e) => {
    e.preventDefault();
    setSavingInvoice(true);
    try {
      const globalSettings = profile?.global_settings || {};
      const invoicePrefs = globalSettings.invoice_preferences || {};
      
      const newGlobalSettings = {
        ...globalSettings,
        invoice_preferences: {
          ...invoicePrefs,
          [selectedInvoiceCottageId]: invoiceSettings
        }
      };

      const { data, error } = await supabase
        .from('profiles')
        .update({ global_settings: newGlobalSettings })
        .eq('id', session.user.id)
        .select();

      if (error) throw error;
      setProfile(data[0]);
      alert("Invoice settings saved successfully!");
    } catch (e) {
      alert("Error saving invoice settings: " + e.message);
    } finally {
      setSavingInvoice(false);
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
        const payment_tpl = data.whatsapp_payment_reminder_msg_template || DEFAULT_PAYMENT_REMINDER_TEMPLATE;
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
          whatsapp_review_msg_template: review_tpl,
          whatsapp_payment_reminder_msg_template: payment_tpl
        });
        if (data.whatsapp_custom_tags) {
          try {
            const tags = typeof data.whatsapp_custom_tags === 'string' ? JSON.parse(data.whatsapp_custom_tags) : data.whatsapp_custom_tags;
            setCustomTags(tags.filter(t => t.key !== 'wifi_password' && !t.key.startsWith('__template_')));
            
            const wifiTag = tags.find(t => t.key === 'wifi_password');
            if (wifiTag) setWifiPassword(wifiTag.value);

            const storedConfirm = tags.find(t => t.key === '__template_confirm');
            if (storedConfirm && !data.whatsapp_confirm_msg_template) {
               setCommSettings(prev => ({ ...prev, whatsapp_confirm_msg_template: storedConfirm.value }));
            }
            const storedReceipt = tags.find(t => t.key === '__template_receipt');
            if (storedReceipt && !data.whatsapp_receipt_msg_template) {
               setCommSettings(prev => ({ ...prev, whatsapp_receipt_msg_template: storedReceipt.value }));
            }
            const storedReminder = tags.find(t => t.key === '__template_reminder');
            if (storedReminder && !data.whatsapp_reminder_msg_template) {
               setCommSettings(prev => ({ ...prev, whatsapp_reminder_msg_template: storedReminder.value }));
            }
            const storedReview = tags.find(t => t.key === '__template_review');
            if (storedReview && !data.whatsapp_review_msg_template) {
               setCommSettings(prev => ({ ...prev, whatsapp_review_msg_template: storedReview.value }));
            }
            const storedPaymentReminder = tags.find(t => t.key === '__template_payment_reminder');
            if (storedPaymentReminder && !data.whatsapp_payment_reminder_msg_template) {
               setCommSettings(prev => ({ ...prev, whatsapp_payment_reminder_msg_template: storedPaymentReminder.value }));
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

      // Hide the payment template in custom tags so it gets saved without needing a DB migration
      const paymentTemplateTagIndex = updatedTags.findIndex(t => t.key === '__template_payment_reminder');
      if (paymentTemplateTagIndex !== -1) {
        updatedTags[paymentTemplateTagIndex] = { key: '__template_payment_reminder', value: commSettings.whatsapp_payment_reminder_msg_template };
      } else {
        updatedTags.push({ key: '__template_payment_reminder', value: commSettings.whatsapp_payment_reminder_msg_template });
      }

      setCustomTags(updatedTags.filter(t => t.key !== '__template_payment_reminder'));

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
          const { whatsapp_confirm_msg_template, whatsapp_receipt_msg_template, whatsapp_reminder_msg_template, whatsapp_review_msg_template, whatsapp_payment_reminder_msg_template, ...cleanSettings } = commSettings;
          const retryPayload = {
            tenant_id: profile.id,
            resort_id: activeResortId,
            ...cleanSettings,
            whatsapp_custom_tags: updatedTags,
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
      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .update({ full_name: userName })
        .eq('id', profile.id)
        .select();
      if (profileError) throw profileError;
      if (profileData && profileData.length > 0) {
        setProfile({ ...profile, full_name: profileData[0].full_name });
      }
      alert("Profile name updated successfully!");
    } catch (err) {
      alert("Error updating profile: " + err.message);
    } finally {
      setSavingGeneral(false);
    }
  };

  const handleSaveGuestGst = async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    setSavingGuestGst(true);
    setGuestGstError(null);
    setGuestGstSuccess(false);
    try {
      await saveTenantGuestGstSettings(supabase, {
        tenantGst: {
          enabled: Boolean(tenantGst.enabled),
          slabThreshold: Number(tenantGst.slabThreshold) || 7500,
          lowerRate: Number(tenantGst.lowerRate) || 5,
          higherRate: Number(tenantGst.higherRate) || 18
        },
        tenantBilling: {
          companyName: (billingDetails.companyName || '').trim(),
          gstin: (billingDetails.gstin || '').trim().toUpperCase(),
          address: (billingDetails.address || '').trim()
        }
      });
      const currentGlobal = profile?.global_settings || {};
      setProfile({
        ...profile,
        global_settings: {
          ...currentGlobal,
          tenant_gst: tenantGst,
          tenant_billing: billingDetails
        }
      });
      setGuestGstSuccess(true);
      setTimeout(() => setGuestGstSuccess(false), 4000);
    } catch (err) {
      setGuestGstError(err.message || "Failed to update guest GST settings.");
    } finally {
      setSavingGuestGst(false);
    }
  };

  const handleSaveSubscriptionBilling = async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    const validation = validateTenantBilling(subscriptionBilling);
    setSubscriptionBillingErrors(validation.errors);
    if (!validation.isValid) {
      const firstError = Object.values(validation.errors)[0] || 'Please resolve the highlighted billing errors.';
      setSubscriptionBillingError(firstError);
      return;
    }

    setSavingSubscriptionBilling(true);
    setSubscriptionBillingError(null);
    setSubscriptionBillingSuccess(false);
    try {
      const savedBilling = await saveTenantBillingProfile(supabase, subscriptionBilling);
      const currentGlobal = profile?.global_settings || {};
      setProfile({
        ...profile,
        global_settings: {
          ...currentGlobal,
          billing: savedBilling
        }
      });
      setSubscriptionBillingSuccess(true);
      setTimeout(() => setSubscriptionBillingSuccess(false), 4000);
    } catch (err) {
      setSubscriptionBillingError(err.message || "Failed to update billing profile.");
    } finally {
      setSavingSubscriptionBilling(false);
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

  const saveRetentionPolicy = async () => {
    try {
      const currentGlobalSettings = profile?.global_settings || {};
      const updatedGlobal = {
        ...currentGlobalSettings,
        id_retention_days: idRetentionDays
      };
      const { error } = await supabase.from('profiles').update({ global_settings: updatedGlobal }).eq('id', profile.id);
      if (error) throw error;
      alert('Retention policy saved successfully!');
    } catch (err) {
      alert('Failed to save policy: ' + err.message);
    }
  };

    const wipeData = async () => {
    const pw = window.prompt("WARNING: This will permanently delete ALL Bookings, Incomes, Expenses, AND guest ID images.\n\nEnter master password to confirm:");
    if (pw !== "admin123") {
      if (pw !== null) alert("Incorrect password.");
      return;
    }
    
    try {
      // 1. Delete textual data
      await supabase.from('incomes').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      await supabase.from('expenses').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      await supabase.from('bookings').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      
      // 2. Delete all ID images for this tenant
      if (profile?.tenant_id) {
        const { data: files } = await supabase.storage.from('guest_ids').list(profile.tenant_id, { limit: 1000 });
        if (files && files.length > 0) {
          const filePaths = files.map(f => `${profile.tenant_id}/${f.name}`);
          await supabase.storage.from('guest_ids').remove(filePaths);
        }
      }

      alert("All transactional data and ID images have been completely wiped!");
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
    <div className="settings-container">
      <header>
        <h1 className="settings-header-title">Settings</h1>
        <p className="settings-header-subtitle">
          Manage your user profile, billing details, communications, and system preferences.
        </p>
      </header>

      <div className="settings-nav-bar">
        <button 
          type="button"
          onClick={() => setActiveTab('general')}
          className={`settings-nav-button ${activeTab === 'general' ? 'active' : ''}`}
        >
          <SettingsIcon size={18} /> General
        </button>

        <button 
          type="button"
          onClick={() => setActiveTab('billing_gst')}
          className={`settings-nav-button ${activeTab === 'billing_gst' ? 'active' : ''}`}
        >
          <Building2 size={18} /> Billing & GST
        </button>

        {(profile?.role === 'super_admin' || (profile?.role === 'tenant_admin' && globalTemplatesEnabled && profile?.feature_comm_enabled !== false)) && (
          <button 
            type="button"
            onClick={() => setActiveTab('templates')}
            className={`settings-nav-button ${activeTab === 'templates' ? 'active' : ''}`}
          >
            <MessageCircle size={18} /> Templates
          </button>
        )}

        {(profile?.role === 'tenant_admin' || profile?.role === 'super_admin') && (
          <button 
            type="button"
            onClick={() => setActiveTab('data_manager')}
            className={`settings-nav-button ${activeTab === 'data_manager' ? 'active' : ''}`}
          >
            <Database size={18} /> Data
          </button>
        )}

        {(profile?.role === 'tenant_admin' || profile?.role === 'super_admin') && !Capacitor.isNativePlatform() && (
          <button 
            type="button"
            onClick={() => setActiveTab('invoice')}
            className={`settings-nav-button ${activeTab === 'invoice' ? 'active' : ''}`}
          >
            <Receipt size={18} /> Invoices
          </button>
        )}
      </div>

      <main style={{ display: 'flex', flexDirection: 'column', gap: '1.75rem' }}>
        {/* GENERAL SETTINGS TAB */}
        {activeTab === 'general' && (
            <>
            {/* User Profile Card */}
            <div className="settings-card">
              <div className="settings-card-header">
                <div className="settings-card-icon">
                  <UserRound size={20} />
                </div>
                <div>
                  <h2 className="settings-card-title">User Profile</h2>
                  <p className="settings-card-desc">Update your personal identity details and account contact name.</p>
                </div>
              </div>
              <form onSubmit={saveGeneralSettings} style={{ maxWidth: '720px', width: '100%' }}>
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
                <div className="form-group" style={{ marginBottom: '1.5rem' }}>
                  <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                    Email Address <span style={{ fontSize: '0.75rem', fontWeight: 500, color: 'var(--text-muted)', display: 'inline-flex', alignItems: 'center', gap: '0.2rem', marginLeft: '0.25rem' }}><Lock size={12} /> Read-only</span>
                  </label>
                  <div style={{ position: 'relative' }}>
                    <input 
                      type="text" 
                      className="form-input" 
                      value={session?.user?.email || ''} 
                      disabled 
                      style={{ opacity: 0.7, cursor: 'not-allowed', backgroundColor: 'var(--bg-secondary)', paddingRight: '2.5rem' }} 
                    />
                    <Lock size={16} style={{ position: 'absolute', right: '0.85rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }} />
                  </div>
                </div>

                <button type="submit" className="btn btn-primary" disabled={savingGeneral}>
                  {savingGeneral ? 'Saving...' : 'Save Changes'}
                </button>
              </form>
            </div>


              {/* Communications API Configurations */}
              {(profile?.role === 'super_admin' || (profile?.role === 'tenant_admin' && globalCommEnabled && profile?.feature_comm_enabled !== false)) && (
                <div className="settings-card">
                  <div className="settings-card-header">
                    <div className="settings-card-icon">
                      <Mail size={20} />
                    </div>
                    <div>
                      <h2 className="settings-card-title">Communications & Automations</h2>
                      <p className="settings-card-desc">Configure API settings and automated actions.</p>
                    </div>
                  </div>
                  
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
              <div className="settings-card">
                <div className="settings-card-header">
                  <div className="settings-card-icon">
                    <Palette size={20} />
                  </div>
                  <div>
                    <h2 className="settings-card-title">Appearance & Theme</h2>
                    <p className="settings-card-desc">Customize how the dashboard looks on your screen.</p>
                  </div>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <p style={{ margin: 0, fontWeight: '500' }}>Theme Preference</p>
                    <p style={{ margin: '0.25rem 0 0', fontSize: '0.875rem', color: 'var(--text-muted)' }}>Customize how the dashboard looks on your screen.</p>
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem', background: 'var(--bg-secondary)', padding: '0.25rem', borderRadius: '12px' }}>
                    <button 
                      onClick={() => updateSettings({ theme: 'light' })}
                      style={{ 
                        background: theme === 'light' ? 'var(--primary)' : 'transparent', 
                        color: theme === 'light' ? '#fff' : 'var(--text-muted)', 
                        border: 'none', borderRadius: '8px', padding: '0.5rem 1rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.875rem', fontWeight: '500', transition: 'all 0.2s' 
                      }}
                    >
                      <Sun size={16} /> Light
                    </button>
                    <button 
                      onClick={() => updateSettings({ theme: 'dark' })}
                      style={{ 
                        background: theme === 'dark' ? 'var(--primary)' : 'transparent', 
                        color: theme === 'dark' ? '#fff' : 'var(--text-muted)', 
                        border: 'none', borderRadius: '8px', padding: '0.5rem 1rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.875rem', fontWeight: '500', transition: 'all 0.2s' 
                      }}
                    >
                      <Moon size={16} /> Dark
                    </button>
                    <button 
                      onClick={() => updateSettings({ theme: 'system' })}
                      style={{ 
                        background: theme === 'system' ? 'var(--primary)' : 'transparent', 
                        color: theme === 'system' ? '#fff' : 'var(--text-muted)', 
                        border: 'none', borderRadius: '8px', padding: '0.5rem 1rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.875rem', fontWeight: '500', transition: 'all 0.2s' 
                      }}
                    >
                      <Monitor size={16} /> System
                    </button>
                  </div>
                </div>
              </div>
            </>
          )}

        {/* BILLING & GST TAB */}
        {activeTab === 'billing_gst' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
            {/* SECTION A: Guest Booking GST Settings */}
            <form onSubmit={handleSaveGuestGst} style={{ display: 'flex', flexDirection: 'column', gap: '1.75rem' }}>
              <div className="settings-card">
                <div className="settings-card-header">
                  <div className="settings-card-icon" style={{ background: 'rgba(59, 130, 246, 0.1)', color: '#3b82f6' }}>
                    <ReceiptText size={20} />
                  </div>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                      <h2 className="settings-card-title">Property Guest GST Settings</h2>
                      <span style={{ fontSize: '0.75rem', fontWeight: 600, padding: '2px 8px', borderRadius: '12px', background: 'rgba(59, 130, 246, 0.1)', color: '#3b82f6', border: '1px solid rgba(59, 130, 246, 0.2)' }}>
                        Guest Receipts
                      </span>
                    </div>
                    <p className="settings-card-desc">Configure GST rates and property details that appear on receipts and folios YOU issue to YOUR GUESTS.</p>
                  </div>
                </div>

                {guestGstSuccess && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.75rem 1rem', borderRadius: '8px', background: 'rgba(16, 185, 129, 0.1)', border: '1px solid rgba(16, 185, 129, 0.25)', color: '#059669', fontSize: '0.875rem', fontWeight: 600, marginBottom: '1.25rem' }}>
                    <CheckCircle2 size={18} />
                    <span>Property Guest GST settings updated successfully.</span>
                  </div>
                )}

                {guestGstError && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.75rem 1rem', borderRadius: '8px', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.25)', color: '#ef4444', fontSize: '0.875rem', fontWeight: 600, marginBottom: '1.25rem' }}>
                    <AlertTriangle size={18} />
                    <span>{guestGstError}</span>
                  </div>
                )}

                <div style={{ padding: '1.25rem', borderRadius: '12px', background: 'var(--bg-secondary)', border: '1px solid var(--border)', marginBottom: '1.5rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', marginBottom: '0.35rem' }}>
                    <label className="form-label" style={{ margin: 0, fontSize: '0.95rem', fontWeight: 600, color: 'var(--text-main)' }}>Enable Guest GST Billing</label>
                    <label className="switch" style={{ margin: 0 }}>
                      <input 
                        type="checkbox" 
                        checked={tenantGst.enabled}
                        onChange={e => setTenantGst({...tenantGst, enabled: e.target.checked})}
                      />
                      <span className="slider round"></span>
                    </label>
                  </div>
                  <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-muted)' }}>Apply GST to eligible guest bookings and invoices based on the applicable room tariff slab.</p>
                </div>

                {tenantGst.enabled && (
                  <div style={{ background: 'var(--bg-color)', padding: '1.25rem', borderRadius: '12px', border: '1px solid var(--border)', marginBottom: '1.5rem' }}>
                    <h4 style={{ margin: '0 0 1rem 0', fontSize: '1rem', color: 'var(--text-main)', fontWeight: 700 }}>GST Slab Configuration</h4>
                    
                    <div className="form-group">
                      <label className="form-label">Tariff Slab Threshold (₹)</label>
                      <p style={{ margin: '0 0 0.5rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}>What is the maximum Per-Room-Per-Night price before the higher tax bracket applies?</p>
                      <input 
                        type="number" 
                        className="form-input" 
                        value={tenantGst.slabThreshold} 
                        onChange={e => setTenantGst({...tenantGst, slabThreshold: e.target.value})}
                      />
                    </div>

                    <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                      <div className="form-group" style={{ flex: 1, minWidth: '200px' }}>
                        <label className="form-label">Lower GST Rate (%)</label>
                        <p style={{ margin: '0 0 0.5rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}>For rooms priced <strong>at or below</strong> ₹{tenantGst.slabThreshold || 0}</p>
                        <input 
                          type="number" 
                          className="form-input" 
                          value={tenantGst.lowerRate} 
                          onChange={e => setTenantGst({...tenantGst, lowerRate: e.target.value})}
                        />
                      </div>
                      <div className="form-group" style={{ flex: 1, minWidth: '200px' }}>
                        <label className="form-label">Higher GST Rate (%)</label>
                        <p style={{ margin: '0 0 0.5rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}>For rooms priced <strong>above</strong> ₹{tenantGst.slabThreshold || 0}</p>
                        <input 
                          type="number" 
                          className="form-input" 
                          value={tenantGst.higherRate} 
                          onChange={e => setTenantGst({...tenantGst, higherRate: e.target.value})}
                        />
                      </div>
                    </div>
                  </div>
                )}

                {/* Property Identity for Guest Receipts */}
                <h4 style={{ margin: '0 0 0.75rem 0', fontSize: '0.95rem', color: 'var(--text-main)', fontWeight: 700 }}>Property Identity for Guest Invoices</h4>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1.25rem', marginBottom: '1.25rem' }}>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label className="form-label">Property / Legal Name</label>
                    <input 
                      type="text" 
                      className="form-input" 
                      value={billingDetails.companyName} 
                      onChange={e => setBillingDetails({...billingDetails, companyName: e.target.value})} 
                      placeholder="e.g. Grand Resort Pvt Ltd" 
                    />
                  </div>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label className="form-label">Property GSTIN (Optional)</label>
                    <input 
                      type="text" 
                      className="form-input" 
                      value={billingDetails.gstin} 
                      onChange={e => setBillingDetails({...billingDetails, gstin: e.target.value})} 
                      placeholder="e.g. 29GGGGG1314R9Z6" 
                    />
                  </div>
                </div>

                <div className="form-group" style={{ marginBottom: '1.25rem' }}>
                  <label className="form-label">Property Registered Address</label>
                  <textarea 
                    className="form-input" 
                    value={billingDetails.address} 
                    onChange={e => setBillingDetails({...billingDetails, address: e.target.value})} 
                    placeholder="Registered business address printed on guest receipts"
                    rows={2}
                  />
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
                  <button type="submit" className="btn btn-primary" disabled={savingGuestGst} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}>
                    {savingGuestGst ? <Loader2 size={16} className="spin" /> : <Save size={16} />}
                    {savingGuestGst ? 'Saving Guest GST...' : 'Save Guest GST Settings'}
                  </button>
                </div>
              </div>
            </form>

            {/* SECTION B: Stay Pilot Subscription Billing Profile */}
            <form onSubmit={handleSaveSubscriptionBilling} style={{ display: 'flex', flexDirection: 'column', gap: '1.75rem' }}>
              <div className="settings-card" style={{ border: '1px solid rgba(16, 185, 129, 0.3)' }}>
                <div className="settings-card-header">
                  <div className="settings-card-icon" style={{ background: 'rgba(16, 185, 129, 0.1)', color: '#059669' }}>
                    <Building2 size={20} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', flexWrap: 'wrap' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                        <h2 className="settings-card-title">Stay Pilot Subscription Billing Profile</h2>
                        <span style={{ fontSize: '0.75rem', fontWeight: 600, padding: '2px 8px', borderRadius: '12px', background: 'rgba(16, 185, 129, 0.1)', color: '#059669', border: '1px solid rgba(16, 185, 129, 0.2)' }}>
                          SaaS Invoices
                        </span>
                      </div>
                      <div>
                        {validateTenantBilling(subscriptionBilling).isValid ? (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.8rem', fontWeight: 700, padding: '4px 10px', borderRadius: '12px', background: 'rgba(16, 185, 129, 0.15)', color: '#059669', border: '1px solid rgba(16, 185, 129, 0.3)' }}>
                            <CheckCircle2 size={14} /> Profile Complete
                          </span>
                        ) : (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.8rem', fontWeight: 700, padding: '4px 10px', borderRadius: '12px', background: 'rgba(245, 158, 11, 0.15)', color: '#d97706', border: '1px solid rgba(245, 158, 11, 0.3)' }}>
                            <AlertTriangle size={14} /> Incomplete — Required for Paid Subscriptions
                          </span>
                        )}
                      </div>
                    </div>
                    <p className="settings-card-desc">
                      Authoritative legal identity and tax address used on commercial payment acknowledgments and invoices issued by <strong>Stay Pilot to YOU</strong>.
                    </p>
                  </div>
                </div>

                <div style={{ padding: '0.875rem 1rem', borderRadius: '10px', background: 'rgba(59, 130, 246, 0.05)', border: '1px solid rgba(59, 130, 246, 0.2)', marginBottom: '1.25rem', display: 'flex', alignItems: 'flex-start', gap: '0.65rem' }}>
                  <Info size={18} style={{ color: '#2563eb', flexShrink: 0, marginTop: '2px' }} />
                  <div style={{ fontSize: '0.825rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>
                    Under Indian commercial accounting guidelines, official SaaS payment acknowledgments require customer legal name, verified email, physical address, state, and 6-digit PIN code. Completing this profile ensures instantaneous tax receipt generation upon subscription payment.
                  </div>
                </div>

                {subscriptionBillingSuccess && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.75rem 1rem', borderRadius: '8px', background: 'rgba(16, 185, 129, 0.1)', border: '1px solid rgba(16, 185, 129, 0.25)', color: '#059669', fontSize: '0.875rem', fontWeight: 600, marginBottom: '1.25rem' }}>
                    <CheckCircle2 size={18} />
                    <span>Subscription billing profile saved successfully.</span>
                  </div>
                )}

                {subscriptionBillingError && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.75rem 1rem', borderRadius: '8px', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.25)', color: '#ef4444', fontSize: '0.875rem', fontWeight: 600, marginBottom: '1.25rem' }}>
                    <AlertTriangle size={18} />
                    <span>{subscriptionBillingError}</span>
                  </div>
                )}

                {/* Form Fields */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '1.25rem', marginBottom: '1.25rem' }}>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label className="form-label" style={{ fontWeight: 600 }}>Customer / Business Name <span style={{ color: '#ef4444' }}>*</span></label>
                    <input 
                      type="text" 
                      className={`form-input ${subscriptionBillingErrors.name ? 'is-invalid' : ''}`}
                      value={subscriptionBilling.name || ''} 
                      onChange={e => {
                        setSubscriptionBilling({ ...subscriptionBilling, name: e.target.value });
                        if (subscriptionBillingErrors.name) setSubscriptionBillingErrors({ ...subscriptionBillingErrors, name: null });
                      }}
                      placeholder="e.g. Acme Resorts Pvt Ltd or John Doe" 
                      required
                    />
                    {subscriptionBillingErrors.name && (
                      <span style={{ fontSize: '0.75rem', color: '#ef4444', marginTop: '0.25rem', display: 'block' }}>{subscriptionBillingErrors.name}</span>
                    )}
                  </div>

                  <div className="form-group" style={{ margin: 0 }}>
                    <label className="form-label" style={{ fontWeight: 600 }}>Billing Email <span style={{ color: '#ef4444' }}>*</span></label>
                    <input 
                      type="email" 
                      className={`form-input ${subscriptionBillingErrors.email ? 'is-invalid' : ''}`}
                      value={subscriptionBilling.email || ''} 
                      onChange={e => {
                        setSubscriptionBilling({ ...subscriptionBilling, email: e.target.value });
                        if (subscriptionBillingErrors.email) setSubscriptionBillingErrors({ ...subscriptionBillingErrors, email: null });
                      }}
                      placeholder="e.g. accounts@acmeresorts.com" 
                      required
                    />
                    {subscriptionBillingErrors.email && (
                      <span style={{ fontSize: '0.75rem', color: '#ef4444', marginTop: '0.25rem', display: 'block' }}>{subscriptionBillingErrors.email}</span>
                    )}
                  </div>
                </div>

                <div className="form-group" style={{ marginBottom: '1.25rem' }}>
                  <label className="form-label" style={{ fontWeight: 600 }}>Address Line 1 <span style={{ color: '#ef4444' }}>*</span></label>
                  <input 
                    type="text" 
                    className={`form-input ${subscriptionBillingErrors.address_line1 || subscriptionBillingErrors.address ? 'is-invalid' : ''}`}
                    value={subscriptionBilling.address_line1 || ''} 
                    onChange={e => {
                      setSubscriptionBilling({ ...subscriptionBilling, address_line1: e.target.value });
                      if (subscriptionBillingErrors.address_line1 || subscriptionBillingErrors.address) {
                        setSubscriptionBillingErrors({ ...subscriptionBillingErrors, address_line1: null, address: null });
                      }
                    }}
                    placeholder="Flat / Building / Plot No., Street Name" 
                    required
                  />
                  {(subscriptionBillingErrors.address_line1 || subscriptionBillingErrors.address) && (
                    <span style={{ fontSize: '0.75rem', color: '#ef4444', marginTop: '0.25rem', display: 'block' }}>{subscriptionBillingErrors.address_line1 || subscriptionBillingErrors.address}</span>
                  )}
                </div>

                <div className="form-group" style={{ marginBottom: '1.25rem' }}>
                  <label className="form-label" style={{ fontWeight: 600 }}>Address Line 2 (Optional)</label>
                  <input 
                    type="text" 
                    className="form-input" 
                    value={subscriptionBilling.address_line2 || ''} 
                    onChange={e => setSubscriptionBilling({ ...subscriptionBilling, address_line2: e.target.value })}
                    placeholder="Locality, Landmark, Area" 
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1.25rem', marginBottom: '1.25rem' }}>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label className="form-label" style={{ fontWeight: 600 }}>City <span style={{ color: '#ef4444' }}>*</span></label>
                    <input 
                      type="text" 
                      className={`form-input ${subscriptionBillingErrors.city ? 'is-invalid' : ''}`}
                      value={subscriptionBilling.city || ''} 
                      onChange={e => {
                        setSubscriptionBilling({ ...subscriptionBilling, city: e.target.value });
                        if (subscriptionBillingErrors.city) setSubscriptionBillingErrors({ ...subscriptionBillingErrors, city: null });
                      }}
                      placeholder="e.g. Bengaluru" 
                      required
                    />
                    {subscriptionBillingErrors.city && (
                      <span style={{ fontSize: '0.75rem', color: '#ef4444', marginTop: '0.25rem', display: 'block' }}>{subscriptionBillingErrors.city}</span>
                    )}
                  </div>

                  <div className="form-group" style={{ margin: 0 }}>
                    <label className="form-label" style={{ fontWeight: 600 }}>State / Union Territory <span style={{ color: '#ef4444' }}>*</span></label>
                    <select
                      className={`form-input ${subscriptionBillingErrors.state ? 'is-invalid' : ''}`}
                      value={subscriptionBilling.state || ''}
                      onChange={e => {
                        const val = e.target.value;
                        const code = getStateCodeByName(val) || '';
                        setSubscriptionBilling({
                          ...subscriptionBilling,
                          state: val,
                          state_code: code
                        });
                        if (subscriptionBillingErrors.state) setSubscriptionBillingErrors({ ...subscriptionBillingErrors, state: null });
                      }}
                      required
                    >
                      <option value="">-- Select State / UT --</option>
                      {INDIAN_STATES.map(s => (
                        <option key={s.code} value={s.name}>
                          {s.name} ({s.code})
                        </option>
                      ))}
                    </select>
                    {subscriptionBillingErrors.state && (
                      <span style={{ fontSize: '0.75rem', color: '#ef4444', marginTop: '0.25rem', display: 'block' }}>{subscriptionBillingErrors.state}</span>
                    )}
                  </div>

                  <div className="form-group" style={{ margin: 0 }}>
                    <label className="form-label" style={{ fontWeight: 600 }}>PIN Code <span style={{ color: '#ef4444' }}>*</span></label>
                    <input 
                      type="text" 
                      maxLength={6}
                      className={`form-input ${subscriptionBillingErrors.pincode ? 'is-invalid' : ''}`}
                      value={subscriptionBilling.pincode || ''} 
                      onChange={e => {
                        const digits = e.target.value.replace(/\D/g, '').slice(0, 6);
                        setSubscriptionBilling({ ...subscriptionBilling, pincode: digits });
                        if (subscriptionBillingErrors.pincode) setSubscriptionBillingErrors({ ...subscriptionBillingErrors, pincode: null });
                      }}
                      placeholder="e.g. 560001" 
                      required
                    />
                    {subscriptionBillingErrors.pincode && (
                      <span style={{ fontSize: '0.75rem', color: '#ef4444', marginTop: '0.25rem', display: 'block' }}>{subscriptionBillingErrors.pincode}</span>
                    )}
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1.25rem', marginBottom: '1.5rem' }}>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label className="form-label" style={{ fontWeight: 600 }}>Country</label>
                    <input 
                      type="text" 
                      className="form-input" 
                      value={subscriptionBilling.country || 'India'} 
                      readOnly 
                      style={{ backgroundColor: 'var(--bg-secondary)', cursor: 'not-allowed' }}
                    />
                  </div>

                  <div className="form-group" style={{ margin: 0 }}>
                    <label className="form-label" style={{ fontWeight: 600 }}>
                      Business GSTIN <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 'normal' }}>(Optional)</span>
                    </label>
                    <input 
                      type="text" 
                      maxLength={15}
                      className={`form-input ${subscriptionBillingErrors.gstin ? 'is-invalid' : ''}`}
                      value={subscriptionBilling.gstin || ''} 
                      onChange={e => {
                        const val = e.target.value.toUpperCase();
                        setSubscriptionBilling({ ...subscriptionBilling, gstin: val });
                        if (subscriptionBillingErrors.gstin) setSubscriptionBillingErrors({ ...subscriptionBillingErrors, gstin: null });
                      }}
                      placeholder="e.g. 29AAAAA0000A1Z5" 
                    />
                    {subscriptionBillingErrors.gstin && (
                      <span style={{ fontSize: '0.75rem', color: '#ef4444', marginTop: '0.25rem', display: 'block' }}>{subscriptionBillingErrors.gstin}</span>
                    )}
                  </div>

                  <div className="form-group" style={{ margin: 0 }}>
                    <label className="form-label" style={{ fontWeight: 600 }}>GST State Code</label>
                    <input 
                      type="text" 
                      className="form-input" 
                      value={subscriptionBilling.state_code || getStateCodeByName(subscriptionBilling.state) || '--'} 
                      readOnly 
                      style={{ backgroundColor: 'var(--bg-secondary)', cursor: 'not-allowed' }}
                    />
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
                  <button type="submit" className="btn btn-primary" disabled={savingSubscriptionBilling} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}>
                    {savingSubscriptionBilling ? <Loader2 size={16} className="spin" /> : <Save size={16} />}
                    {savingSubscriptionBilling ? 'Saving Billing Profile...' : 'Save Subscription Billing Profile'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        )}

          {/* TEMPLATES MANAGEMENT TAB */}
          {activeTab === 'pricing' && (
            <PricingSettings activeResortId={activeResortId} resorts={resorts} />
          )}

          {activeTab === 'templates' && (profile?.role === 'tenant_admin' || profile?.role === 'super_admin') && (
            <div className="settings-card">
              <div className="settings-card-header">
                <div className="settings-card-icon">
                  <MessageCircle size={20} />
                </div>
                <div>
                  <h2 className="settings-card-title">Templates Management</h2>
                  <p className="settings-card-desc">Customize templates and variables for client-side WhatsApp messaging.</p>
                </div>
              </div>

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
                    
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                        <label className="form-label" style={{ fontWeight: 600, margin: 0 }}>Payment Reminder Template</label>
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                          <button type="button" onClick={() => handleClearTemplate('payment_reminder')} style={{ fontSize: '0.75rem', color: 'var(--danger)', background: 'transparent', border: 'none', cursor: 'pointer', fontWeight: 500 }}>Clear</button>
                          <span style={{ color: 'var(--border)' }}>|</span>
                          <button type="button" onClick={() => handleResetTemplate('payment_reminder')} style={{ fontSize: '0.75rem', color: 'var(--primary)', background: 'transparent', border: 'none', cursor: 'pointer', fontWeight: 500 }}>Reset</button>
                        </div>
                      </div>
                      <textarea 
                        id="whatsapp_payment_reminder_msg_template"
                        className="form-input" 
                        rows={6} 
                        style={{ fontFamily: 'inherit', resize: 'vertical', padding: '0.75rem', height: 'auto', border: activeTextarea === 'payment_reminder' ? '1px solid var(--primary)' : '1px solid var(--border)' }}
                        value={commSettings.whatsapp_payment_reminder_msg_template} 
                        onChange={e => setCommSettings({...commSettings, whatsapp_payment_reminder_msg_template: e.target.value})} 
                        onFocus={() => setActiveTextarea('payment_reminder')}
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

          {/* DATA MANAGER TAB */}
          {activeTab === 'data_manager' && (
            <>
              {(profile?.role === 'tenant_admin' || profile?.role === 'super_admin') && (
                <div className="settings-card">
                  <div className="settings-card-header">
                    <div className="settings-card-icon" style={{ background: 'rgba(239, 68, 68, 0.1)', color: 'var(--danger)', borderColor: 'rgba(239, 68, 68, 0.25)' }}>
                      <Database size={20} />
                    </div>
                    <div>
                      <h2 className="settings-card-title">Data Manager & Retention Policy</h2>
                      <p className="settings-card-desc">Manage data retention policies and safely purge archived operational records.</p>
                    </div>
                  </div>
                    
                    <div style={{ background: 'var(--bg-secondary)', padding: '1rem', borderRadius: '8px', marginBottom: '1.5rem' }}>
                      <h3 style={{ fontSize: '1rem', margin: '0 0 0.5rem 0', color: 'var(--text-main)' }}>Guest ID Retention Policy</h3>
                      <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', margin: '0 0 1rem 0' }}>
                        To minimize PII liability, uploaded guest ID images will be automatically purged from the cloud storage after this many days.
                      </p>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                        <input 
                          type="range" 
                          min="30" 
                          max="90" 
                          step="1"
                          value={idRetentionDays}
                          onChange={(e) => setIdRetentionDays(Number(e.target.value))}
                          style={{ flex: 1 }}
                        />
                        <span style={{ fontWeight: 'bold', minWidth: '60px' }}>{idRetentionDays} days</span>
                        <button className="btn-primary" onClick={saveRetentionPolicy} style={{ padding: '0.5rem 1rem', fontSize: '0.85rem' }}>Save Policy</button>
                      </div>
                    </div>
                  
                  <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-end', marginBottom: '1.5rem' }}>
                    <div style={{ flex: 1 }}>
                      <label className="form-label">Select Year for Cleanup</label>
                      <select 
                        className="form-control" 
                        value={cleanupYear} 
                        onChange={(e) => { setCleanupYear(e.target.value === '' ? '' : Number(e.target.value)); setCleanupStats(null); }}
                      >
                        {[...Array(10)].map((_, i) => {
                          const year = new Date().getFullYear() - i;
                          return <option key={year} value={year}>{year}</option>;
                        })}
                      </select>
                    </div>
                    <button 
                      className="btn btn-primary" 
                      style={{ minWidth: '150px' }}
                      onClick={async () => {
                        setIsAnalyzing(true);
                        setCleanupStats(null);
                        try {
                          const startDate = `${cleanupYear}-01-01T00:00:00Z`;
                          const endDate = `${cleanupYear}-12-31T23:59:59Z`;
                          
                          const [bks, inc, exp] = await Promise.all([
                            supabase.from('bookings').select('id, status', { count: 'exact' }).eq('resort_id', activeResortId).gte('check_in_date', startDate).lte('check_in_date', endDate),
                            supabase.from('incomes').select('id', { count: 'exact' }).eq('resort_id', activeResortId).gte('date', startDate).lte('date', endDate),
                            supabase.from('expenses').select('id', { count: 'exact' }).eq('resort_id', activeResortId).gte('date', startDate).lte('date', endDate)
                          ]);
                          
                          setCleanupStats({
                            bookings: bks.count || 0,
                            incomes: inc.count || 0,
                            expenses: exp.count || 0,
                            total: (bks.count || 0) + (inc.count || 0) + (exp.count || 0)
                          });
                        } catch (err) {
                          alert("Error analyzing data: " + err.message);
                        } finally {
                          setIsAnalyzing(false);
                        }
                      }}
                      disabled={isAnalyzing || isCleaning}
                    >
                      {isAnalyzing ? <Loader2 size={16} className="spin" /> : 'Analyze Data'}
                    </button>
                  </div>

                  {cleanupStats && (
                    <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: '12px', padding: '1.5rem', marginBottom: '1.5rem' }}>
                      <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '1rem', color: 'var(--text-color)' }}>
                        Analysis Results for {cleanupYear}
                      </h3>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
                        <div style={{ background: 'var(--bg-color)', padding: '1rem', borderRadius: '8px', border: '1px solid var(--border)', textAlign: 'center' }}>
                          <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: 'var(--primary)' }}>{cleanupStats.bookings}</div>
                          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Bookings</div>
                        </div>
                        <div style={{ background: 'var(--bg-color)', padding: '1rem', borderRadius: '8px', border: '1px solid var(--border)', textAlign: 'center' }}>
                          <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#10b981' }}>{cleanupStats.incomes}</div>
                          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Income Records</div>
                        </div>
                        <div style={{ background: 'var(--bg-color)', padding: '1rem', borderRadius: '8px', border: '1px solid var(--border)', textAlign: 'center' }}>
                          <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#ef4444' }}>{cleanupStats.expenses}</div>
                          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Expense Records</div>
                        </div>
                        <div style={{ background: 'var(--bg-color)', padding: '1rem', borderRadius: '8px', border: '1px solid var(--border)', textAlign: 'center' }}>
                          <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: 'var(--text-color)' }}>{cleanupStats.total}</div>
                          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Total Records</div>
                        </div>
                      </div>
                      
                      {cleanupStats.total > 0 ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', alignItems: 'center' }}>
                          <div style={{ padding: '0.75rem 1rem', background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', borderRadius: '8px', fontSize: '0.85rem', textAlign: 'center' }}>
                            <AlertTriangle size={16} style={{ display: 'inline', verticalAlign: 'text-bottom', marginRight: '4px' }} /> 
                            <strong>Warning:</strong> Cleaning up will permanently delete these {cleanupStats.total} records from your database. This action cannot be undone.
                          </div>
                          <button 
                            className="btn btn-danger"
                            style={{ width: '100%', maxWidth: '300px', background: '#ef4444', color: 'white', display: 'flex', justifyContent: 'center', gap: '0.5rem' }}
                            disabled={isCleaning}
                            onClick={async () => {
                              if (!window.confirm(`Are you absolutely sure you want to permanently delete ${cleanupStats.total} records from ${cleanupYear}?`)) return;
                              
                              setIsCleaning(true);
                              try {
                                const startDate = `${cleanupYear}-01-01T00:00:00Z`;
                                const endDate = `${cleanupYear}-12-31T23:59:59Z`;
                                
                                await Promise.all([
                                  supabase.from('bookings').delete().eq('resort_id', activeResortId).gte('check_in_date', startDate).lte('check_in_date', endDate),
                                  supabase.from('incomes').delete().eq('resort_id', activeResortId).gte('date', startDate).lte('date', endDate),
                                  supabase.from('expenses').delete().eq('resort_id', activeResortId).gte('date', startDate).lte('date', endDate)
                                ]);
                                
                                alert(`Successfully cleaned up data for ${cleanupYear}`);
                                setCleanupStats(null);
                              } catch (err) {
                                alert("Error cleaning data: " + err.message);
                              } finally {
                                setIsCleaning(false);
                              }
                            }}
                          >
                            {isCleaning ? <Loader2 size={16} className="spin" /> : 'Permanently Delete ' + cleanupYear + ' Data'}
                          </button>
                        </div>
                      ) : (
                        <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '1rem' }}>
                          No records found for {cleanupYear}. Your system is clean!
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
          {activeTab === 'invoice' && (profile?.role === 'tenant_admin' || profile?.role === 'super_admin') && !Capacitor.isNativePlatform() && (
            <div className="settings-card">
              <div className="settings-card-header">
                <div className="settings-card-icon">
                  <Receipt size={20} />
                </div>
                <div>
                  <h2 className="settings-card-title">Invoice & Receipt Settings</h2>
                  <p className="settings-card-desc">Manage property contact details and layout settings for printable guest receipts.</p>
                </div>
              </div>

              <div style={{ marginBottom: '1.5rem', paddingBottom: '1.25rem', borderBottom: '1px solid var(--border)' }}>
                <label className="form-label" style={{ fontWeight: 600 }}>Select Property (Cottage) for Invoice Settings</label>
                <select 
                  className="form-input" 
                  value={selectedInvoiceCottageId || ''} 
                  onChange={e => setSelectedInvoiceCottageId(e.target.value)}
                >
                  {cottages.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
                <form onSubmit={saveInvoiceSettings}>
                  <div className="form-group" style={{ marginBottom: '1.5rem' }}>
                    <label className="form-label" style={{ fontWeight: 600 }}>Invoice Format</label>
                    <div style={{ display: 'flex', gap: '1.5rem', marginTop: '0.5rem' }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                        <input 
                          type="radio" 
                          name="invoiceFormat" 
                          value="A4" 
                          checked={invoiceSettings.format === 'A4'}
                          onChange={() => setInvoiceSettings({ ...invoiceSettings, format: 'A4' })}
                          style={{ width: '1.2rem', height: '1.2rem', accentColor: 'var(--primary)' }}
                        />
                        <span style={{ fontSize: '0.95rem' }}>A4 (Full Page)</span>
                      </label>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                        <input 
                          type="radio" 
                          name="invoiceFormat" 
                          value="A5" 
                          checked={invoiceSettings.format === 'A5'}
                          onChange={() => setInvoiceSettings({ ...invoiceSettings, format: 'A5' })}
                          style={{ width: '1.2rem', height: '1.2rem', accentColor: 'var(--primary)' }}
                        />
                        <span style={{ fontSize: '0.95rem' }}>A5 (Half Page)</span>
                      </label>
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
                    <div className="form-group">
                      <label className="form-label">Invoice Phone</label>
                      <input 
                        type="text" 
                        className="form-input" 
                        placeholder="e.g. +91 98765 43210"
                        value={invoiceSettings.phone} 
                        onChange={e => setInvoiceSettings({ ...invoiceSettings, phone: e.target.value })} 
                      />
                      <small style={{ color: 'var(--text-muted)' }}>If blank, falls back to property default.</small>
                    </div>
                    
                    <div className="form-group">
                      <label className="form-label">Invoice Email</label>
                      <input 
                        type="email" 
                        className="form-input" 
                        placeholder="e.g. billing@cheerfulchalet.com"
                        value={invoiceSettings.email} 
                        onChange={e => setInvoiceSettings({ ...invoiceSettings, email: e.target.value })} 
                      />
                      </div>
                    </div>
                      
                    <div className="form-group" style={{ marginBottom: '1.5rem' }}>
                      <label className="form-label">Invoice Logo (Max 2MB)</label>
                    <input 
                      type="file" 
                      accept="image/*"
                      className="form-input" 
                      onChange={(e) => {
                        const file = e.target.files[0];
                        if (file) {
                          if (file.size > 2 * 1024 * 1024) return alert("Logo must be under 2MB");
                          const reader = new FileReader();
                          reader.onload = (event) => {
                            setInvoiceSettings({...invoiceSettings, logo_url: event.target.result});
                          };
                          reader.readAsDataURL(file);
                        }
                      }}
                      style={{ padding: '0.4rem' }}
                    />
                    <small style={{ color: 'var(--text-muted)' }}>Upload your company logo for the receipt header. If blank, falls back to property default.</small>
                  </div>

                  {invoiceSettings.logo_url && (
                    <div style={{ marginTop: '1rem', padding: '1rem', background: 'var(--bg-color)', border: '1px solid var(--border)', borderRadius: '8px', display: 'inline-flex', flexDirection: 'column', gap: '0.5rem', alignItems: 'flex-start' }}>
                      <p style={{ margin: '0', fontSize: '0.8rem', color: 'var(--text-muted)' }}>Logo Preview:</p>
                      <img src={invoiceSettings.logo_url} alt="Invoice Logo" style={{ maxHeight: '80px', maxWidth: '200px', objectFit: 'contain' }} onError={(e) => e.target.style.display = 'none'} />
                      <button 
                        type="button" 
                        className="btn btn-outline" 
                        style={{ padding: '0.2rem 0.5rem', fontSize: '0.8rem', color: 'var(--danger)', borderColor: 'var(--danger)' }} 
                        onClick={() => setInvoiceSettings({...invoiceSettings, logo_url: ''})}
                      >
                        Clear Logo
                      </button>
                    </div>
                  )}

                  <div style={{ marginTop: '2rem', display: 'flex', justifyContent: 'flex-end' }}>
                    <button type="submit" className="btn btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }} disabled={savingInvoice}>
                      {savingInvoice ? <Loader2 size={16} className="spin" /> : <Save size={16} />} 
                      Save Invoice Settings
                    </button>
                  </div>
                </form>
              </div>
            )}


          </main>
    </div>
  );
}
