import React, { useState } from 'react';
import { supabase } from '../lib/supabase';
import { useSettingsStore } from '../lib/store';
import { Plus, Hotel, MapPin, Globe, Phone, Mail, Trash2, Edit3, Image } from 'lucide-react';

export default function Resorts() {
  const { session, resorts, setResorts, activeResortId, setActiveResortId, profile } = useSettingsStore();
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingResortId, setEditingResortId] = useState(null);
  
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
      if (editingResortId) {
        const { data, error } = await supabase.from('resorts').update(resortForm).eq('id', editingResortId).select();
        if (error) throw error;
        
        setResorts(resorts.map(r => r.id === editingResortId ? data[0] : r));
        alert("Tenant updated successfully!");
      } else {
        // Plan Gate Check
        const resortLimit = profile?.plan_type === 'free' ? 1 : (profile?.plan_type === 'pro' ? 3 : 100);
        if (resorts.length >= resortLimit) {
          alert(`Limit Reached: Your current ${profile.plan_type} plan allows only ${resortLimit} tenant(s). Please upgrade for more.`);
          return;
        }

        const payload = { ...resortForm, tenant_id: session.user.id };
        const { data, error } = await supabase.from('resorts').insert([payload]).select();
        if (error) throw error;
        
        const updatedResorts = [...resorts, data[0]];
        setResorts(updatedResorts);
        if (!activeResortId) setActiveResortId(data[0].id);
        alert("Tenant added successfully!");
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
    if (resorts.length <= 1) return alert("You must have at least one tenant.");
    if (!window.confirm("ARE YOU SURE? This will delete the tenant and ALL its data (Properties, Rooms, Bookings, Financials) permanently.")) return;
    
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
    <div style={{ maxWidth: '1000px', margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <div>
          <h1 style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>Tenant Management</h1>
          <p style={{ color: 'var(--text-muted)' }}>View and manage your business profile and settings</p>
        </div>
        {!showForm && profile?.role === 'super_admin' && (
          <button className="btn btn-primary" onClick={() => handleOpenForm()}>
            <Plus size={20} /> Add New Tenant
          </button>
        )}
      </div>

      {showForm && (
        <div className="card" style={{ marginBottom: '2rem', animation: 'slideDown 0.3s ease-out' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
            <h2>{editingResortId ? 'Edit Profile Details' : 'New Tenant Profile Details'}</h2>
            <button className="btn btn-outline" onClick={() => setShowForm(false)}>Cancel</button>
          </div>
          <form onSubmit={handleSubmit} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
            <div className="form-group" style={{ gridColumn: 'span 2' }}>
              <label className="form-label">Entity Name</label>
              <input type="text" required className="form-input" value={resortForm.name} onChange={e => setResortForm({...resortForm, name: e.target.value})} />
            </div>
            <div className="form-group" style={{ gridColumn: 'span 2' }}>
              <label className="form-label">Owner's Name</label>
              <input type="text" className="form-input" value={resortForm.owner_name} onChange={e => setResortForm({...resortForm, owner_name: e.target.value})} />
            </div>
            <div className="form-group">
              <label className="form-label">Contact Phone</label>
              <input type="text" className="form-input" value={resortForm.phone} onChange={e => setResortForm({...resortForm, phone: e.target.value})} />
            </div>
            <div className="form-group">
              <label className="form-label">Contact Email</label>
              <input type="email" className="form-input" value={resortForm.email} onChange={e => setResortForm({...resortForm, email: e.target.value})} />
            </div>
            <div className="form-group" style={{ gridColumn: 'span 2' }}>
              <label className="form-label">Full Address</label>
              <input type="text" className="form-input" value={resortForm.address} onChange={e => setResortForm({...resortForm, address: e.target.value})} />
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
            <div className="form-group" style={{ gridColumn: 'span 2' }}>
              <label className="form-label">Logo URL (Transparent PNG Recommended)</label>
              <input type="text" className="form-input" placeholder="https://..." value={resortForm.logo_url} onChange={e => setResortForm({...resortForm, logo_url: e.target.value})} />
            </div>
            <div style={{ gridColumn: 'span 2' }}>
              <button type="submit" className="btn btn-primary" style={{ width: '100%', height: '50px' }} disabled={loading}>
                {loading ? 'Processing...' : (editingResortId ? 'Update Profile' : 'Register Profile')}
              </button>
            </div>
          </form>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '1.5rem' }}>
        {resorts.map(resort => (
          <div key={resort.id} className="card" style={{ 
            border: activeResortId === resort.id ? '2px solid var(--primary)' : '1px solid var(--border)',
            position: 'relative',
            transition: 'transform 0.2s',
            cursor: 'default'
          }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '1rem', marginBottom: '1.5rem' }}>
              <div style={{ 
                width: '60px', 
                height: '60px', 
                background: 'var(--bg-secondary)', 
                borderRadius: '12px', 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'center',
                overflow: 'hidden'
              }}>
                {resort.logo_url ? (
                  <img src={resort.logo_url} alt="Logo" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                ) : (
                  <Hotel size={24} color="var(--primary)" />
                )}
              </div>
              <div style={{ flex: 1 }}>
                <h3 style={{ margin: 0 }}>{resort.name}</h3>
                <div style={{ color: 'var(--primary)', fontWeight: 'bold', fontSize: '0.9rem', marginBottom: '0.2rem' }}>
                  Owner: {resort.owner_name || 'Not set'}
                </div>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>ID: {resort.id}</span>
              </div>
              {activeResortId === resort.id && (
                <div style={{ 
                  background: 'var(--primary)', 
                  color: 'white', 
                  fontSize: '0.7rem', 
                  padding: '0.25rem 0.5rem', 
                  borderRadius: '20px',
                  fontWeight: 'bold'
                }}>
                  ACTIVE
                </div>
              )}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', fontSize: '0.9rem', color: 'var(--text-main)', marginBottom: '1.5rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <MapPin size={16} color="var(--text-muted)" /> {resort.address || 'No address set'}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Phone size={16} color="var(--text-muted)" /> {resort.phone || 'N/A'}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Globe size={16} color="var(--text-muted)" /> {resort.timezone} ({resort.currency})
              </div>
            </div>

            <div style={{ display: 'flex', gap: '0.75rem' }}>
              {activeResortId !== resort.id && (
                <button 
                  className="btn btn-primary" 
                  style={{ flex: 1, height: '40px' }}
                  onClick={() => setActiveResortId(resort.id)}
                >
                  Switch To
                </button>
              )}
              <button 
                className="btn btn-outline" 
                style={{ height: '40px' }}
                onClick={() => handleOpenForm(resort)}
              >
                <Edit3 size={18} />
              </button>
              <button 
                className="btn btn-outline" 
                style={{ height: '40px', color: 'var(--danger)' }}
                onClick={() => deleteResort(resort.id)}
              >
                <Trash2 size={18} />
              </button>
            </div>
          </div>
        ))}
      </div>

      {resorts.length === 0 && (
        <div style={{ textAlign: 'center', padding: '4rem 0' }}>
          <Hotel size={64} style={{ opacity: 0.1, marginBottom: '1.5rem' }} />
          <h3>No tenants found</h3>
          <p>Please create your first tenant to get started.</p>
        </div>
      )}
    </div>
  );
}
