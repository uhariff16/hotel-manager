import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { createClient } from '@supabase/supabase-js';
import { UserPlus, Trash2, Shield, Mail, Lock, User, Edit2 } from 'lucide-react';
import { useSettingsStore } from '../lib/store';

// Secondary client for creating users without affecting the admin session
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const secondarySupabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: { persistSession: false }
});

export default function Staff() {
  const { profile } = useSettingsStore();
  const [staff, setStaff] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState({ id: '', email: '', password: '', fullName: '' });
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchStaff();
  }, [profile]);

  const fetchStaff = async () => {
    if (!profile?.tenant_id) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('tenant_id', profile.tenant_id)
        .eq('role', 'staff');
      if (error) throw error;
      setStaff(data || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setFormData({ id: '', email: '', password: '', fullName: '' });
    setShowForm(false);
    setIsEditing(false);
    setError(null);
  };

  const handleEdit = (member) => {
    setFormData({ 
      id: member.id, 
      email: member.id, // Email is masked in profiles usually, but we use it for identification
      fullName: member.full_name,
      password: '' 
    });
    setIsEditing(true);
    setShowForm(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      if (isEditing) {
        // Update existing profile
        const { error } = await supabase
          .from('profiles')
          .update({ full_name: formData.fullName })
          .eq('id', formData.id);
        if (error) throw error;
        alert("Staff updated successfully!");
      } else {
        // 1. Sign up the new user using the secondary client
        const { error: authError } = await secondarySupabase.auth.signUp({
          email: formData.email,
          password: formData.password,
          options: {
            data: {
              full_name: formData.fullName,
              tenant_id: profile.tenant_id,
              role: 'staff'
            }
          }
        });
        if (authError) throw authError;
        alert(`Staff account created for ${formData.email}!`);
      }

      resetForm();
      fetchStaff();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const [confirmingDelete, setConfirmingDelete] = useState(null);

  const removeStaff = async (staffId) => {
    if (confirmingDelete !== staffId) {
      setConfirmingDelete(staffId);
      return;
    }
    
    setLoading(true);
    try {
      const { error } = await supabase.from('profiles').delete().eq('id', staffId);
      if (error) throw error;
      setStaff(staff.filter(s => s.id !== staffId));
      setConfirmingDelete(null);
    } catch (err) {
      alert("Error removing staff: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  if (loading && staff.length === 0) return <div>Loading Staff...</div>;

  return (
    <div style={{ maxWidth: '1000px', margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <div>
          <h1 style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>Staff Management</h1>
          <p style={{ color: 'var(--text-muted)' }}>Create and oversee the personnel working at your property</p>
        </div>
        {!showForm && (
          <button className="btn btn-primary" onClick={() => setShowForm(true)}>
            <UserPlus size={20} /> Add New Staff
          </button>
        )}
      </div>

      {showForm && (
        <div className="card" style={{ marginBottom: '2rem', animation: 'slideDown 0.3s ease-out' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
            <h2 style={{ fontSize: '1.25rem' }}>{isEditing ? 'Edit Staff Details' : 'Register New Staff Member'}</h2>
            <button className="btn btn-outline" onClick={resetForm}>Cancel</button>
          </div>
          
          {error && <div style={{ color: 'var(--danger)', marginBottom: '1rem', background: 'rgba(239, 68, 68, 0.1)', padding: '0.75rem', borderRadius: '8px' }}>{error}</div>}

          <form onSubmit={handleSubmit} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
            <div className="form-group" style={{ gridColumn: 'span 2' }}>
              <label className="form-label">Full Name</label>
              <div style={{ position: 'relative' }}>
                <User size={18} style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                <input type="text" className="form-input" required style={{ paddingLeft: '2.5rem' }} value={formData.fullName} onChange={e => setFormData({...formData, fullName: e.target.value})} placeholder="e.g. John Doe" />
              </div>
            </div>
            
            {!isEditing && (
              <>
                <div className="form-group">
                  <label className="form-label">Email Address</label>
                  <div style={{ position: 'relative' }}>
                    <Mail size={18} style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                    <input type="email" className="form-input" required style={{ paddingLeft: '2.5rem' }} value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} placeholder="staff@example.com" />
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label">Default Password</label>
                  <div style={{ position: 'relative' }}>
                    <Lock size={18} style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                    <input type="password" minLength={6} className="form-input" required style={{ paddingLeft: '2.5rem' }} value={formData.password} onChange={e => setFormData({...formData, password: e.target.value})} placeholder="••••••••" />
                  </div>
                </div>
              </>
            )}

            <div style={{ gridColumn: 'span 2' }}>
              <button type="submit" className="btn btn-primary" style={{ width: '100%', height: '50px' }} disabled={loading}>
                {loading ? 'Processing...' : (isEditing ? 'Save Changes' : 'Create Staff Account')}
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="card">
        <h3 style={{ marginBottom: '1.5rem' }}>Active Personnel</h3>
        {staff.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '3rem 0', opacity: 0.5 }}>
            <User size={48} style={{ marginBottom: '1rem' }} />
            <p>No staff identified. Use the button above to register your team.</p>
          </div>
        ) : (
          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  <th>Identity</th>
                  <th>Permission Level</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {staff.map(member => (
                  <tr key={member.id}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <div style={{ width: 32, height: 32, background: 'var(--primary)', color: 'white', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold' }}>
                          {member.full_name?.charAt(0)}
                        </div>
                        <div>
                          <strong>{member.full_name}</strong>
                          <br/><small style={{ color: 'var(--text-muted)' }}>Ref: {member.id.split('-')[0]}</small>
                        </div>
                      </div>
                    </td>
                    <td>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', color: 'var(--primary)', background: 'rgba(59, 130, 246, 0.1)', padding: '0.2rem 0.6rem', borderRadius: '20px', fontSize: '0.8rem', fontWeight: '600' }}>
                        <Shield size={14} /> OPERATIONAL STAFF
                      </span>
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <button className="btn btn-outline" style={{ padding: '0.4rem' }} onClick={() => handleEdit(member)}>
                          <Edit2 size={18} />
                        </button>
                        <button 
                          className="btn btn-outline" 
                          style={{ 
                            color: confirmingDelete === member.id ? 'white' : 'var(--danger)', 
                            background: confirmingDelete === member.id ? 'var(--danger)' : 'transparent',
                            padding: '0.4rem' 
                          }} 
                          onClick={() => removeStaff(member.id)}
                        >
                          <Trash2 size={18} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
