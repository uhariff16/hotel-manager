import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { useSettingsStore } from '../lib/store';
import { Plus, Hotel, MapPin, Globe, Phone, Mail, Trash2, Edit3, Image, Shield, Building2 } from 'lucide-react';
import { getTenantEntitlements } from '../utils/planEntitlements';

export default function Resorts() {
  const { session, resorts, setResorts, activeResortId, setActiveResortId, profile, globalPlans } = useSettingsStore();
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingResortId, setEditingResortId] = useState(null);
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);

  const entitlements = useMemo(() => {
    return getTenantEntitlements({
      profile,
      globalPlans,
      resorts
    });
  }, [profile, globalPlans, resorts]);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth <= 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);
  
  const [resortForm, setResortForm] = useState({
    name: '',
    address: '',
    phone: '',
    email: '',
    timezone: 'Asia/Kolkata',
    currency: 'INR',
    logo_url: '',
    owner_name: ''
  });

  const handleOpenForm = (resort = null) => {
    if (resort) {
      setEditingResortId(resort.id);
      setResortForm({
        name: resort.name,
        address: resort.address || '',
        phone: resort.phone || '',
        email: resort.email || '',
        timezone: resort.timezone || 'Asia/Kolkata',
        currency: resort.currency || 'INR',
        logo_url: resort.logo_url || '',
        owner_name: resort.owner_name || ''
      });
    } else {
      setEditingResortId(null);
      setResortForm({
        name: '', address: '', phone: '', email: '', timezone: 'Asia/Kolkata', currency: 'INR', logo_url: '', owner_name: ''
      });
    }
    setShowForm(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    setLoading(true);
    try {
      const isDuplicate = resorts.some(r => r.name.toLowerCase().trim() === resortForm.name.toLowerCase().trim() && r.id !== editingResortId);
      if (isDuplicate) {
        throw new Error("A business entity with this name already exists.");
      }

      if (editingResortId) {
        const { data, error } = await supabase.from('resorts').update(resortForm).eq('id', editingResortId).select();
        if (error) throw error;
        
        setResorts(resorts.map(r => r.id === editingResortId ? data[0] : r));
        alert("Business Profile updated successfully!");
      } else {
        // Account Structural Rule: 1 Business Profile parent per tenant account
        if (resorts.length >= 1) {
          alert("Business Profile Limit\n\nYour account maintains 1 Business Profile parent. To manage properties and rooms under your business, please use Property Management.");
          setLoading(false);
          return;
        }

        const payload = { ...resortForm, tenant_id: session.user.id };
        const { data, error } = await supabase.from('resorts').insert([payload]).select();
        if (error) throw error;
        
        const updatedResorts = [...resorts, data[0]];
        setResorts(updatedResorts);
        if (!activeResortId) setActiveResortId(data[0].id);
        alert("Business Profile added successfully!");
      }
      
      setShowForm(false);
      setEditingResortId(null);
      setResortForm({
        name: '', address: '', phone: '', email: '', timezone: 'Asia/Kolkata', currency: 'INR', logo_url: '', owner_name: ''
      });
    } catch (err) {
      alert(err.message);
    } finally {
      setLoading(false);
    }
  };

  const deleteResort = async (id) => {
    if (resorts.length <= 1) return alert("You must have at least one business entity.");
    if (!window.confirm("ARE YOU SURE? This will delete the business entity and ALL its data (Properties, Rooms, Bookings, Financials) permanently.")) return;
    
    try {
      await supabase.from('resorts').delete().eq('id', id);
      const updated = resorts.filter(r => r.id !== id);
      setResorts(updated);
      if (activeResortId === id) setActiveResortId(updated[0].id);
    } catch (err) {
      alert(err.message);
    }
  };

  return (
    <div style={{ maxWidth: '1100px', margin: '0 auto', padding: isMobile ? '0.5rem 0' : '1rem 0' }}>
      {/* Shared Page Header Shell */}
      <div style={{ 
        display: 'flex', 
        flexDirection: isMobile ? 'column' : 'row',
        justifyContent: 'space-between', 
        alignItems: isMobile ? 'flex-start' : 'center', 
        gap: '1rem',
        marginBottom: '2rem' 
      }}>
        <div>
          <h1 style={{ fontSize: isMobile ? '1.5rem' : '1.85rem', fontWeight: 800, margin: 0, color: 'var(--text-main)' }}>
            Business Profile
          </h1>
          <p style={{ margin: '0.25rem 0 0 0', color: 'var(--text-muted)', fontSize: '0.95rem' }}>
            Manage your business information and operating preferences.
          </p>
        </div>
        {!showForm && profile?.role === 'super_admin' && (
          <button className="btn btn-primary" onClick={() => handleOpenForm()} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 600 }}>
            <Plus size={18} /> Add New Business
          </button>
        )}
      </div>

      {showForm && (
        <div className="card" style={{ marginBottom: '2rem', padding: isMobile ? '1.25rem' : '2rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', borderBottom: '1px solid var(--border)', paddingBottom: '1rem' }}>
            <h2 style={{ fontSize: '1.25rem', margin: 0, color: 'var(--text-main)' }}>{editingResortId ? 'Edit Business Profile' : 'New Business Profile'}</h2>
            <button className="btn btn-outline" onClick={() => setShowForm(false)}>Cancel</button>
          </div>
          <form onSubmit={handleSubmit} style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '1.25rem' }}>
            <div className="form-group" style={{ gridColumn: isMobile ? 'span 1' : 'span 2' }}>
              <label className="form-label">Business Name</label>
              <input type="text" required className="form-input" value={resortForm.name} onChange={e => setResortForm({...resortForm, name: e.target.value})} placeholder="e.g. Cheerful Chalet & Resort" />
            </div>
            <div className="form-group" style={{ gridColumn: isMobile ? 'span 1' : 'span 2' }}>
              <label className="form-label">Owner / Administrator Name</label>
              <input type="text" className="form-input" value={resortForm.owner_name} onChange={e => setResortForm({...resortForm, owner_name: e.target.value})} placeholder="e.g. Umai Zahid" />
            </div>
            <div className="form-group">
              <label className="form-label">Contact Phone</label>
              <input type="text" className="form-input" value={resortForm.phone} onChange={e => setResortForm({...resortForm, phone: e.target.value})} placeholder="+91 9876543210" />
            </div>
            <div className="form-group">
              <label className="form-label">Contact Email</label>
              <input type="email" className="form-input" value={resortForm.email} onChange={e => setResortForm({...resortForm, email: e.target.value})} placeholder="contact@cheerfulchalet.com" />
            </div>
            <div className="form-group" style={{ gridColumn: isMobile ? 'span 1' : 'span 2' }}>
              <label className="form-label">Full Address</label>
              <input type="text" className="form-input" value={resortForm.address} onChange={e => setResortForm({...resortForm, address: e.target.value})} placeholder="Property street address, city, state" />
            </div>
            <div className="form-group">
              <label className="form-label">Timezone</label>
              <select className="form-select" value={resortForm.timezone} onChange={e => setResortForm({...resortForm, timezone: e.target.value})}>
                <option value="Asia/Kolkata">Asia/Kolkata (IST)</option>
                <option value="UTC">UTC</option>
                <option value="America/New_York">EST</option>
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Currency</label>
              <select className="form-select" value={resortForm.currency} onChange={e => setResortForm({...resortForm, currency: e.target.value})}>
                <option value="INR">₹ INR</option>
                <option value="USD">$ USD</option>
                <option value="EUR">€ EUR</option>
              </select>
            </div>
            <div className="form-group" style={{ gridColumn: isMobile ? 'span 1' : 'span 2' }}>
              <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                Business Logo (Max 2MB)
                {profile?.plan_type !== 'premium' && (
                  <span className="badge badge-warning" style={{ fontSize: '0.7rem' }}>Premium Only</span>
                )}
              </label>
              <input 
                type="file" 
                accept="image/*" 
                className="form-input" 
                disabled={profile?.plan_type !== 'premium'}
                onChange={e => {
                  const file = e.target.files[0];
                  if (!file) return;
                  if (file.size > 2 * 1024 * 1024) return alert("Logo must be under 2MB");
                  
                  const reader = new FileReader();
                  reader.onload = (event) => {
                    setResortForm({...resortForm, logo_url: event.target.result});
                  };
                  reader.readAsDataURL(file);
                }} 
              />
              {resortForm.logo_url && (
                <div style={{ marginTop: '0.5rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
                  <img src={resortForm.logo_url} alt="Preview" style={{ height: '40px', objectFit: 'contain' }} />
                  <button type="button" className="btn btn-outline" style={{ padding: '0.2rem 0.5rem', fontSize: '0.8rem', color: 'var(--danger)' }} onClick={() => setResortForm({...resortForm, logo_url: ''})}>Clear</button>
                </div>
              )}
            </div>
            <div style={{ gridColumn: isMobile ? 'span 1' : 'span 2', marginTop: '0.5rem' }}>
              <button type="submit" className="btn btn-primary" style={{ width: '100%', height: '48px', fontWeight: 700 }} disabled={loading}>
                {loading ? 'Saving Changes...' : (editingResortId ? 'Update Business Profile' : 'Save Business Profile')}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Business Profile Cards Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill, minmax(480px, 1fr))', gap: '1.5rem' }}>
        {resorts.map(resort => {
          const isActive = activeResortId === resort.id;
          return (
            <div key={resort.id} className="card" style={{ 
              border: isActive ? '2px solid var(--primary)' : '1px solid var(--border)',
              padding: isMobile ? '1.25rem' : '1.75rem',
              position: 'relative',
              borderRadius: '14px',
              boxShadow: isActive ? '0 4px 20px rgba(5, 150, 105, 0.08)' : '0 2px 8px rgba(0,0,0,0.02)'
            }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '1rem', marginBottom: '1.25rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                  <div style={{ 
                    width: '56px', 
                    height: '56px', 
                    background: 'rgba(15, 44, 89, 0.04)', 
                    borderRadius: '12px', 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'center',
                    overflow: 'hidden',
                    flexShrink: 0
                  }}>
                    {resort.logo_url ? (
                      <img src={resort.logo_url} alt="Logo" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                    ) : (
                      <Building2 size={26} color="var(--primary)" />
                    )}
                  </div>
                  <div>
                    <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800, color: 'var(--text-main)' }}>{resort.name}</h2>
                    <div style={{ marginTop: '0.25rem', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                      Owner / Admin: <strong style={{ color: 'var(--text-main)' }}>{resort.owner_name || 'Not specified'}</strong>
                    </div>
                  </div>
                </div>
                {isActive && (
                  <span className="badge badge-success" style={{ fontSize: '0.75rem', padding: '0.3rem 0.75rem', fontWeight: 700 }}>
                    ACTIVE
                  </span>
                )}
              </div>

              {/* Information Grid / List */}
              <div style={{ 
                display: 'grid', 
                gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', 
                gap: '0.85rem', 
                fontSize: '0.9rem', 
                color: 'var(--text-main)', 
                marginBottom: '1.5rem',
                background: 'rgba(15, 44, 89, 0.02)',
                padding: '1rem',
                borderRadius: '10px',
                border: '1px solid var(--border)'
              }}>
                <div>
                  <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 700, letterSpacing: '0.04em' }}>Business ID</div>
                  <div style={{ fontFamily: 'monospace', fontWeight: 700, marginTop: '0.2rem', color: 'var(--primary)' }}>
                    {resort.id.substring(0, 8).toUpperCase()}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 700, letterSpacing: '0.04em' }}>Operating Currency</div>
                  <div style={{ fontWeight: 600, marginTop: '0.2rem' }}>{resort.currency || 'INR'} ({resort.timezone || 'Asia/Kolkata'})</div>
                </div>
                <div>
                  <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 700, letterSpacing: '0.04em' }}>Phone</div>
                  <div style={{ fontWeight: 600, marginTop: '0.2rem' }}>{resort.phone || 'Not provided'}</div>
                </div>
                <div>
                  <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 700, letterSpacing: '0.04em' }}>Email</div>
                  <div style={{ fontWeight: 600, marginTop: '0.2rem', overflow: 'hidden', textOverflow: 'ellipsis' }}>{resort.email || 'Not provided'}</div>
                </div>
                <div style={{ gridColumn: isMobile ? 'span 1' : 'span 2' }}>
                  <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 700, letterSpacing: '0.04em' }}>Address</div>
                  <div style={{ fontWeight: 600, marginTop: '0.2rem' }}>{resort.address || 'No address configured'}</div>
                </div>
              </div>

              {/* Action Buttons */}
              <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                {!isActive && (
                  <button 
                    className="btn btn-primary" 
                    style={{ flex: 1, height: '42px', fontWeight: 600 }}
                    onClick={() => setActiveResortId(resort.id)}
                  >
                    Switch to Business
                  </button>
                )}
                <button 
                  className="btn btn-outline" 
                  style={{ flex: isActive ? 1 : 'none', height: '42px', fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem' }}
                  onClick={() => handleOpenForm(resort)}
                >
                  <Edit3 size={16} /> Edit Profile
                </button>
                {resorts.length > 1 && (
                  <button 
                    className="btn btn-outline" 
                    style={{ height: '42px', color: 'var(--danger)', padding: '0 0.85rem' }}
                    onClick={() => deleteResort(resort.id)}
                    title="Delete Business"
                  >
                    <Trash2 size={16} />
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {resorts.length === 0 && (
        <div className="card" style={{ textAlign: 'center', padding: '4rem 1rem' }}>
          <Hotel size={56} style={{ opacity: 0.2, marginBottom: '1rem', color: 'var(--primary)' }} />
          <h3 style={{ fontSize: '1.25rem', fontWeight: 700, margin: '0 0 0.5rem 0' }}>No Business Profile Configured</h3>
          <p style={{ color: 'var(--text-muted)', margin: '0 0 1.5rem 0' }}>Please create your business profile to get started.</p>
          <button className="btn btn-primary" onClick={() => handleOpenForm()}>
            <Plus size={18} /> Create Business Profile
          </button>
        </div>
      )}
    </div>
  );
}
