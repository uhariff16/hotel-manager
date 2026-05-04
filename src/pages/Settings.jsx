import React, { useState, useEffect } from 'react';
import { useSettingsStore } from '../lib/store';
import { supabase } from '../lib/supabase';
import { AlertTriangle, User, Palette, ShieldAlert, Mail, MessageCircle, Settings as SettingsIcon, Save } from 'lucide-react';

export default function Settings() {
  const { profile, setProfile, theme, toggleTheme, session, activeResortId } = useSettingsStore();
  const [userName, setUserName] = useState(profile?.full_name || '');
  const [loading, setLoading] = useState(false);
  const [savingComm, setSavingComm] = useState(false);
  
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
    auto_payment_receipt: false
  });

  useEffect(() => {
    if (activeResortId) {
      fetchCommSettings();
    }
  }, [activeResortId]);

  const fetchCommSettings = async () => {
    try {
      const { data, error } = await supabase
        .from('tenant_integrations')
        .select('*')
        .eq('resort_id', activeResortId)
        .maybeSingle();
      
      if (data) {
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
          auto_payment_receipt: data.auto_payment_receipt || false
        });
      }
    } catch (err) {
      console.error("Error fetching comm settings:", err);
    }
  };

  const saveCommSettings = async (e) => {
    e.preventDefault();
    setSavingComm(true);
    try {
      const { error } = await supabase
        .from('tenant_integrations')
        .upsert({
          tenant_id: profile.id,
          resort_id: activeResortId,
          ...commSettings,
          updated_at: new Date().toISOString()
        }, { onConflict: 'resort_id' });

      if (error) throw error;
      alert("Communication settings saved successfully!");
    } catch (err) {
      alert("Error saving settings: " + err.message);
    } finally {
      setSavingComm(false);
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

  const testConnection = async (type) => {
    if (!activeResortId) return;
    
    setLoading(true);
    try {
      // In a real scenario, this would call your Supabase Edge Function
      // For now, we'll simulate the logic or provide a placeholder alert
      const { data, error } = await supabase.functions.invoke('send-test-notification', {
        body: { 
          type, 
          resort_id: activeResortId,
          settings: commSettings 
        }
      });

      if (error) {
        if (error.message.includes('Function not found')) {
          alert(`To test ${type}, you first need to deploy the 'send-test-notification' Edge Function to your Supabase project.`);
        } else {
          throw error;
        }
      } else {
        alert(`${type.toUpperCase()} test initiated successfully! Check your inbox/phone.`);
      }
    } catch (err) {
      alert(`Error testing ${type}: ` + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: '1000px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      
      <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr', gap: '2rem' }}>
        {/* Sidebar Nav */}
        <aside style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
           <div style={{ padding: '0.75rem 1rem', background: 'var(--primary)', color: 'white', borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
             <SettingsIcon size={18} /> General Settings
           </div>
           <div style={{ padding: '0.75rem 1rem', color: 'var(--text-muted)', borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
             <ShieldAlert size={18} /> Security
           </div>
        </aside>

        <main style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
          {/* 1. User Profile Section */}
          <div className="card">
            <h2 style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <User size={24} color="var(--primary)" /> User Profile
            </h2>
            <form onSubmit={updateProfile}>
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
              <button type="submit" className="btn btn-primary" disabled={loading}>
                {loading ? 'Saving...' : 'Update Profile'}
              </button>
            </form>
          </div>

          {/* 2. Communications Section */}
          {(profile?.role === 'tenant_admin' || profile?.role === 'super_admin') && (
            <div className="card">
              <h2 style={{ marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <Mail size={24} color="var(--primary)" /> Communications & Automations
              </h2>
              <p style={{ color: 'var(--text-muted)', marginBottom: '1.5rem', fontSize: '0.9rem' }}>Configure how you interact with your guests automatically.</p>
              
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
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                      <button type="button" onClick={() => testConnection('email')} className="btn btn-outline" style={{ height: '32px', fontSize: '0.75rem', padding: '0 0.75rem' }} disabled={!commSettings.email_api_key}>
                        Send Test Email
                      </button>
                      <label className="switch">
                        <input type="checkbox" checked={commSettings.email_enabled} onChange={e => setCommSettings({...commSettings, email_enabled: e.target.checked})} />
                        <span className="slider round"></span>
                      </label>
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
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                      <button type="button" onClick={() => testConnection('whatsapp')} className="btn btn-outline" style={{ height: '32px', fontSize: '0.75rem', padding: '0 0.75rem' }} disabled={!commSettings.whatsapp_access_token}>
                        Send Test WhatsApp
                      </button>
                      <label className="switch">
                        <input type="checkbox" checked={commSettings.whatsapp_enabled} onChange={e => setCommSettings({...commSettings, whatsapp_enabled: e.target.checked})} />
                        <span className="slider round"></span>
                      </label>
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
                  <Save size={18} /> {savingComm ? 'Saving Integration Settings...' : 'Save Communication Configuration'}
                </button>
              </form>
            </div>
          )}

          {/* 3. Appearance Section */}
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

          {/* 4. Danger Zone */}
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
        </main>
      </div>
    </div>
  );
}
