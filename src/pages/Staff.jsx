import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { createClient } from '@supabase/supabase-js';
import { UserPlus, Trash2, Shield, Lock, User, Edit2, Building2, UserCheck, X } from 'lucide-react';
import { useSettingsStore } from '../lib/store';
import { getTenantEntitlements } from '../utils/planEntitlements';

// Secondary client for creating users without affecting the admin session
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const secondarySupabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: { persistSession: false }
});

export default function Staff() {
  const { profile, session, activeResortId, globalPlans } = useSettingsStore();
  const [staff, setStaff] = useState([]);
  const [cottages, setCottages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState({ id: '', username: '', password: '', fullName: '', cottage_id: '' });
  const [error, setError] = useState(null);
  const [confirmingDelete, setConfirmingDelete] = useState(null);
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);

  const entitlements = useMemo(() => {
    return getTenantEntitlements({
      profile,
      globalPlans,
      staff
    });
  }, [profile, globalPlans, staff]);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth <= 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    if (profile) {
      fetchStaff();
      fetchCottages();
    }
  }, [profile]);

  const fetchCottages = async () => {
    if (!profile?.tenant_id) return;
    try {
      const { data, error } = await supabase
        .from('cottages')
        .select('*')
        .eq('tenant_id', profile.tenant_id);
      if (error) throw error;
      setCottages(data || []);
    } catch (err) {
      console.error("fetchCottages error:", err);
    }
  };

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
    setFormData({ id: '', username: '', password: '', fullName: '', cottage_id: '' });
    setShowForm(false);
    setIsEditing(false);
    setError(null);
  };

  const handleEdit = (member) => {
    setFormData({ 
      id: member.id, 
      username: member.username || '',
      fullName: member.full_name,
      cottage_id: member.cottage_id || '',
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
          .update({ 
            full_name: formData.fullName,
            cottage_id: formData.cottage_id || null
          })
          .eq('id', formData.id);
        if (error) throw error;
        alert("Staff updated successfully!");
      } else {
        // Plan Gate Check
        if (!entitlements.canCreate.staff) {
          if (entitlements.isUnknownPlan) {
            alert(entitlements.reason);
          } else if (entitlements.isSuspended) {
            alert("Your account is currently suspended. Please contact support.");
          } else {
            alert(`Staff Limit Reached: Your ${entitlements.planName} plan allows only ${entitlements.limits.maxStaff} staff accounts (excluding Owner). Please upgrade on our website for more.`);
          }
          setLoading(false);
          return;
        }

        // 1. Sign up the new user using the secondary client
        const syntheticEmail = `${formData.username.trim()}@staff.local`;
        const { data, error: authError } = await secondarySupabase.auth.signUp({
          email: syntheticEmail,
          password: formData.password,
          options: {
            data: {
              full_name: formData.fullName,
              tenant_id: profile.tenant_id,
              role: 'staff',
              cottage_id: formData.cottage_id || null,
              username: formData.username.trim()
            }
          }
        });
        if (authError) throw authError;

        // 2. Perform fallback profile update to ensure cottage_id is set
        if (data?.user?.id) {
          const { error: profileErr } = await supabase
            .from('profiles')
            .update({ cottage_id: formData.cottage_id || null, username: formData.username.trim() })
            .eq('id', data.user.id);
            
          if (profileErr) console.warn("Failed to update profile username (SQL migration missing?):", profileErr);
        }

        alert(`Staff account created for username ${formData.username.trim()}!`);
      }

      resetForm();
      fetchStaff();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

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

  if (loading && staff.length === 0) {
    return (
      <div style={{ maxWidth: '1100px', margin: '0 auto', padding: '2rem 0', textAlign: 'center', color: 'var(--text-muted)' }}>
        Loading Staff...
      </div>
    );
  }

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
            Staff Management
          </h1>
          <p style={{ margin: '0.25rem 0 0 0', color: 'var(--text-muted)', fontSize: '0.95rem' }}>
            Manage team members and their access to Stay Pilot.
          </p>
        </div>
        {!showForm && (
          <button className="btn btn-primary" onClick={() => {
            if (entitlements.isUnknownPlan) {
              return alert(entitlements.reason);
            }
            if (entitlements.isSuspended) {
              return alert("Your account is currently suspended. Please contact support.");
            }
            if (!entitlements.canCreate.staff) {
              const maxS = entitlements.limits.maxStaff >= 999999 ? 'Unlimited' : entitlements.limits.maxStaff;
              const staffWord = entitlements.limits.maxStaff === 1 ? 'staff member' : 'staff members';
              return alert(`Staff Limit Reached\n\nYour ${entitlements.planName} plan supports up to ${maxS} ${staffWord} (excluding Owner). Current usage: ${entitlements.usage.staff} / ${maxS}.\n\nPlease upgrade your plan on our website for additional staff seats.`);
            }
            setShowForm(true);
          }} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 600, width: isMobile ? '100%' : 'auto', justifyContent: 'center' }}>
            <UserPlus size={18} /> Add Staff
          </button>
        )}
      </div>

      {/* Register/Edit Staff Form */}
      {showForm && (
        <div className="card" style={{ marginBottom: '2rem', padding: isMobile ? '1.25rem' : '2rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', borderBottom: '1px solid var(--border)', paddingBottom: '1rem' }}>
            <h2 style={{ fontSize: '1.25rem', margin: 0, color: 'var(--text-main)' }}>{isEditing ? 'Edit Staff Details' : 'Register New Staff Member'}</h2>
            <button className="btn btn-outline" onClick={resetForm}>Cancel</button>
          </div>
          
          {error && (
            <div style={{ color: 'var(--danger)', marginBottom: '1rem', background: 'rgba(239, 68, 68, 0.1)', padding: '0.75rem 1rem', borderRadius: '8px', fontSize: '0.9rem' }}>
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '1.25rem' }}>
            <div className="form-group" style={{ gridColumn: isMobile ? 'span 1' : 'span 2' }}>
              <label className="form-label">Full Name</label>
              <div style={{ position: 'relative' }}>
                <User size={18} style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                <input type="text" className="form-input" required style={{ paddingLeft: '2.5rem' }} value={formData.fullName} onChange={e => setFormData({...formData, fullName: e.target.value})} placeholder="e.g. John Doe" />
              </div>
            </div>

            <div className="form-group" style={{ gridColumn: isMobile ? 'span 1' : 'span 2' }}>
              <label className="form-label">Assign Property</label>
              <select 
                className="form-select" 
                value={formData.cottage_id || ''} 
                onChange={e => setFormData({...formData, cottage_id: e.target.value})}
              >
                <option value="">All Properties (General Staff)</option>
                {cottages.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            
            {!isEditing && (
              <>
                <div className="form-group">
                  <label className="form-label">Username</label>
                  <div style={{ position: 'relative' }}>
                    <User size={18} style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                    <input type="text" className="form-input" required style={{ paddingLeft: '2.5rem' }} value={formData.username} onChange={e => setFormData({...formData, username: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '')})} placeholder="staffuser123" />
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

            <div style={{ gridColumn: isMobile ? 'span 1' : 'span 2', marginTop: '0.5rem' }}>
              <button type="submit" className="btn btn-primary" style={{ width: '100%', height: '48px', fontWeight: 700 }} disabled={loading}>
                {loading ? 'Processing...' : (isEditing ? 'Save Changes' : 'Create Staff Account')}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Staff List View */}
      <div className="card" style={{ padding: isMobile ? '1.25rem' : '1.75rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
          <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 700, color: 'var(--text-main)' }}>Active Personnel</h3>
          <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: 600 }}>
            {staff.length} {staff.length === 1 ? 'member' : 'members'}
          </span>
        </div>

        {staff.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '3.5rem 1rem' }}>
            <User size={48} style={{ marginBottom: '1rem', color: 'var(--primary)', opacity: 0.3 }} />
            <h4 style={{ margin: '0 0 0.5rem 0', fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-main)' }}>No Staff Added Yet</h4>
            <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.9rem' }}>Use the button above to register team members and manage their access.</p>
          </div>
        ) : isMobile ? (
          /* Mobile / Android Staff Cards View */
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {staff.map(member => {
              const assignedCottageName = member.cottage_id 
                ? (cottages.find(c => c.id === member.cottage_id)?.name || 'Loading...')
                : 'All Properties';
              const isDeletingThis = confirmingDelete === member.id;

              return (
                <div key={member.id} style={{ 
                  background: 'rgba(15, 44, 89, 0.02)',
                  border: '1px solid var(--border)',
                  borderRadius: '12px',
                  padding: '1rem',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.85rem'
                }}>
                  {/* Top Row: Avatar & Identity */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                      <div style={{ 
                        width: 40, 
                        height: 40, 
                        background: 'var(--primary)', 
                        color: 'white', 
                        borderRadius: '50%', 
                        display: 'flex', 
                        alignItems: 'center', 
                        justifyContent: 'center', 
                        fontWeight: 700,
                        fontSize: '1rem'
                      }}>
                        {member.full_name?.charAt(0).toUpperCase() || 'S'}
                      </div>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--text-main)' }}>{member.full_name}</div>
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>@{member.username || member.id.split('-')[0]}</div>
                      </div>
                    </div>

                    <span style={{ 
                      display: 'inline-flex', 
                      alignItems: 'center', 
                      gap: '0.3rem', 
                      color: 'var(--primary)', 
                      background: 'rgba(59, 130, 246, 0.1)', 
                      padding: '0.2rem 0.55rem', 
                      borderRadius: '20px', 
                      fontSize: '0.75rem', 
                      fontWeight: '700' 
                    }}>
                      <Shield size={12} /> OPERATIONAL STAFF
                    </span>
                  </div>

                  {/* Property Info Row */}
                  <div style={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'space-between',
                    padding: '0.5rem 0.75rem',
                    background: 'var(--bg-main, #fff)',
                    borderRadius: '8px',
                    border: '1px solid var(--border)',
                    fontSize: '0.85rem'
                  }}>
                    <span style={{ color: 'var(--text-muted)', fontWeight: 600 }}>Assigned Property</span>
                    <span style={{ fontWeight: 700, color: 'var(--text-main)' }}>{assignedCottageName}</span>
                  </div>

                  {/* Actions Row */}
                  <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.25rem' }}>
                    <button 
                      className="btn btn-outline" 
                      style={{ flex: 1, padding: '0.45rem', fontSize: '0.85rem', fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.35rem' }} 
                      onClick={() => handleEdit(member)}
                    >
                      <Edit2 size={15} /> Edit
                    </button>
                    <button 
                      className="btn btn-outline" 
                      style={{ 
                        flex: isDeletingThis ? 1.5 : 1, 
                        color: isDeletingThis ? 'white' : 'var(--danger)', 
                        background: isDeletingThis ? 'var(--danger)' : 'transparent',
                        borderColor: isDeletingThis ? 'var(--danger)' : 'var(--border)',
                        padding: '0.45rem', 
                        fontSize: '0.85rem',
                        fontWeight: 600,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '0.35rem'
                      }} 
                      onClick={() => removeStaff(member.id)}
                    >
                      <Trash2 size={15} /> {isDeletingThis ? 'Confirm Delete?' : 'Delete'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          /* Desktop Table View */
          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  <th>Identity</th>
                  <th>Assigned Property</th>
                  <th>Permission Level</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {staff.map(member => (
                  <tr key={member.id}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <div style={{ width: 36, height: 36, background: 'var(--primary)', color: 'white', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold' }}>
                          {member.full_name?.charAt(0).toUpperCase() || 'S'}
                        </div>
                        <div>
                          <strong style={{ color: 'var(--text-main)' }}>{member.full_name}</strong>
                          <br/><small style={{ color: 'var(--text-muted)' }}>Username: {member.username || member.id.split('-')[0]}</small>
                        </div>
                      </div>
                    </td>
                    <td>
                      <span style={{ fontSize: '0.85rem', fontWeight: '700', color: 'var(--text-main)' }}>
                        {member.cottage_id ? (cottages.find(c => c.id === member.cottage_id)?.name || 'Loading...') : 'All Properties'}
                      </span>
                    </td>
                    <td>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', color: 'var(--primary)', background: 'rgba(59, 130, 246, 0.1)', padding: '0.2rem 0.6rem', borderRadius: '20px', fontSize: '0.8rem', fontWeight: '600' }}>
                        <Shield size={14} /> OPERATIONAL STAFF
                      </span>
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                        <button className="btn btn-outline" style={{ padding: '0.4rem 0.6rem', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }} onClick={() => handleEdit(member)}>
                          <Edit2 size={16} /> Edit
                        </button>
                        <button 
                          className="btn btn-outline" 
                          style={{ 
                            color: confirmingDelete === member.id ? 'white' : 'var(--danger)', 
                            background: confirmingDelete === member.id ? 'var(--danger)' : 'transparent',
                            borderColor: confirmingDelete === member.id ? 'var(--danger)' : 'var(--border)',
                            padding: '0.4rem 0.6rem',
                            fontSize: '0.85rem',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.3rem'
                          }} 
                          onClick={() => removeStaff(member.id)}
                        >
                          <Trash2 size={16} /> {confirmingDelete === member.id ? 'Confirm?' : ''}
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
