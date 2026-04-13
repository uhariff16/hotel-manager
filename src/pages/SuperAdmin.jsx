import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { createClient } from '@supabase/supabase-js';
import { useSettingsStore } from '../lib/store';
import { Users, Hotel, TrendingUp, DollarSign, Search, ShieldAlert, CheckCircle, XCircle, UserPlus, Trash2, Mail, Lock, Shield } from 'lucide-react';

// Secondary client for creating users without affecting the admin session
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const secondarySupabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: { persistSession: false }
});

export default function SuperAdmin() {
  const { profile } = useSettingsStore();
  const [stats, setStats] = useState({ users: 0, properties: 0, bookings: 0, revenue: 0 });
  const [tenants, setTenants] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  
  // Modal states
  const [showUserForm, setShowUserForm] = useState(false);
  const [userFormData, setUserFormData] = useState({ 
    email: '', 
    password: '', 
    fullName: '', 
    role: 'tenant_admin',
    tenantId: '' 
  });
  const [formError, setFormError] = useState(null);

  // Management modal states
  const [editingUser, setEditingUser] = useState(null);
  const [isUpdating, setIsUpdating] = useState(false);

  useEffect(() => {
    if (profile?.role !== 'super_admin') return;
    fetchGlobalData();
  }, [profile]);

  const fetchGlobalData = async () => {
    setLoading(true);
    try {
      const [{ data: u }, { data: r }, { data: b }, { data: inc }] = await Promise.all([
        supabase.from('profiles').select('*').order('created_at', { ascending: false }),
        supabase.from('resorts').select('id, tenant_id'),
        supabase.from('bookings').select('id, tenant_id'),
        supabase.from('incomes').select('amount')
      ]);

      const tenantsWithData = (u || []).map(user => {
        const owner = user.role === 'staff' 
          ? (u || []).find(p => p.id === user.tenant_id) 
          : null;
          
        return {
          ...user,
          ownerName: owner ? owner.full_name : 'Self',
          propertyCount: user.role === 'tenant_admin' ? (r || []).filter(res => res.tenant_id === user.id).length : 0,
          bookingCount: user.role === 'tenant_admin' ? (b || []).filter(book => book.tenant_id === user.id).length : 0
        };
      });

      setTenants(tenantsWithData.filter(t => t.id !== profile.id));
      
      setStats({
        users: u?.filter(u => u.role === 'tenant_admin').length || 0,
        staffCount: u?.filter(u => u.role === 'staff').length || 0,
        properties: r?.length || 0,
        bookings: b?.length || 0,
        revenue: (inc || []).reduce((sum, item) => sum + Number(item.amount), 0)
      });
    } catch (err) {
      console.error("SuperAdmin Fetch Error:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateUser = async (e) => {
    e.preventDefault();
    if (!editingUser) return;
    setIsUpdating(true);
    
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ 
          plan_type: editingUser.plan_type,
          subscription_status: editingUser.subscription_status
        })
        .eq('id', editingUser.id);
        
      if (error) throw error;
      
      setTenants(prev => prev.map(t => t.id === editingUser.id ? editingUser : t));
      setEditingUser(null);
      alert("Account updated successfully!");
    } catch (err) {
      alert("Update failed: " + err.message);
    } finally {
      setIsUpdating(false);
    }
  };

  const handleCreateUser = async (e) => {
    e.preventDefault();
    setLoading(true);
    setFormError(null);

    try {
      if (userFormData.role === 'staff' && !userFormData.tenantId) {
        throw new Error("Staff must be assigned to an existing Tenant.");
      }

      const { error: authError } = await secondarySupabase.auth.signUp({
        email: userFormData.email,
        password: userFormData.password,
        options: {
          data: {
            full_name: userFormData.fullName,
            role: userFormData.role,
            tenant_id: userFormData.role === 'staff' ? userFormData.tenantId : undefined
          }
        }
      });

      if (authError) throw authError;

      alert(`${userFormData.role === 'tenant_admin' ? 'Tenant' : 'Staff'} account created!`);
      setUserFormData({ email: '', password: '', fullName: '', role: 'tenant_admin', tenantId: '' });
      setShowUserForm(false);
      fetchGlobalData();
    } catch (err) {
      setFormError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const deleteAccount = async (userId, name) => {
    if (!confirmingDelete) {
      setConfirmingDelete(true);
      return;
    }
    
    setIsUpdating(true);
    try {
      const { error } = await supabase.from('profiles').delete().eq('id', userId);
      if (error) throw error;
      setTenants(tenants.filter(t => t.id !== userId));
      setEditingUser(null);
      setConfirmingDelete(false);
      alert("Account removed successfully.");
      fetchGlobalData();
    } catch (err) { 
      alert("Delete failed: " + err.message); 
    } finally {
      setIsUpdating(false);
    }
  };

  if (profile?.role !== 'super_admin') {
    return (
      <div style={{ textAlign: 'center', padding: '100px 20px' }}>
        <ShieldAlert size={64} color="var(--danger)" style={{ marginBottom: '1.5rem' }} />
        <h1>Access Denied</h1>
        <p style={{ color: 'var(--text-muted)' }}>You do not have administrative privileges to access this global dashboard.</p>
      </div>
    );
  }

  if (loading && tenants.length === 0) return <div>Loading Global Control Panel...</div>;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '2rem' }}>
        <div>
          <h1 style={{ marginBottom: '0.25rem' }}>Global Control Panel</h1>
          <p style={{ color: 'var(--text-muted)' }}>Oversee all platform Tenants and Staff ({tenants.length} total accounts)</p>
        </div>
        <div style={{ display: 'flex', gap: '1rem' }}>
          <button className="btn btn-primary" onClick={() => setShowUserForm(true)}>
            <UserPlus size={20} /> Create New Account
          </button>
        </div>
      </div>

      {/* Global Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1.5rem', marginBottom: '2.5rem' }}>
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--text-muted)' }}>Tenants / Staff</p>
              <h2 style={{ margin: '0.25rem 0' }}>{stats.users} / {stats.staffCount}</h2>
            </div>
            <Users color="var(--primary)" size={24} />
          </div>
        </div>
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--text-muted)' }}>Global Properties</p>
              <h2 style={{ margin: '0.25rem 0' }}>{stats.properties}</h2>
            </div>
            <Hotel color="var(--primary)" size={24} />
          </div>
        </div>
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--text-muted)' }}>Global Bookings</p>
              <h2 style={{ margin: '0.25rem 0' }}>{stats.bookings}</h2>
            </div>
            <TrendingUp color="var(--primary)" size={24} />
          </div>
        </div>
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--text-muted)' }}>Platform Revenue</p>
              <h2 style={{ margin: '0.25rem 0' }}>₹{stats.revenue.toLocaleString()}</h2>
            </div>
            <DollarSign color="var(--success)" size={24} />
          </div>
        </div>
      </div>

      {/* Account Management Modal */}
      {editingUser && (
        <div className="modal-overlay" style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.7)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="card" style={{ width: '400px', maxWidth: '90%', animation: 'scaleUp 0.2s ease-out' }}>
            <h2 style={{ marginBottom: '1.5rem' }}>Manage Account</h2>
            <div style={{ marginBottom: '1.5rem', padding: '1rem', background: 'rgba(59, 130, 246, 0.1)', borderRadius: '8px' }}>
              <p style={{ margin: 0, fontWeight: 700 }}>{editingUser.full_name}</p>
              <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--primary)', fontWeight: 600 }}>{editingUser.email}</p>
              <p style={{ margin: '0.25rem 0 0', fontSize: '0.75rem', color: 'var(--text-muted)' }}>ID: {editingUser.id}</p>
            </div>

            <form onSubmit={handleUpdateUser}>
              <div className="form-group" style={{ marginBottom: '1rem' }}>
                <label className="form-label">Subscription Plan</label>
                <select 
                  className="form-select" 
                  value={editingUser.plan_type} 
                  onChange={e => setEditingUser({...editingUser, plan_type: e.target.value})}
                  disabled={editingUser.role === 'staff'}
                >
                  <option value="free">FREE</option>
                  <option value="pro">PRO</option>
                  <option value="premium">PREMIUM</option>
                </select>
                {editingUser.role === 'staff' && <small style={{ color: 'var(--text-muted)' }}>Plans apply to Tenants only</small>}
              </div>

              <div className="form-group" style={{ marginBottom: '1.5rem' }}>
                <label className="form-label">Account Status</label>
                <select 
                  className="form-select" 
                  value={editingUser.subscription_status || 'active'} 
                  onChange={e => setEditingUser({...editingUser, subscription_status: e.target.value})}
                >
                  <option value="active">Active</option>
                  <option value="suspended">Suspended</option>
                </select>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <button 
                  type="button" 
                  className={`btn ${confirmingDelete ? 'btn-primary' : 'btn-outline'}`} 
                  style={{ color: confirmingDelete ? 'white' : 'var(--danger)', background: confirmingDelete ? 'var(--danger)' : 'transparent' }} 
                  onClick={() => deleteAccount(editingUser.id, editingUser.full_name)}
                >
                  {confirmingDelete ? 'Click to Confirm DELETE' : 'Delete Account'}
                </button>
                <button type="submit" className="btn btn-primary" disabled={isUpdating || confirmingDelete}>
                  {isUpdating ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
              <button type="button" className="btn btn-link" style={{ width: '100%', marginTop: '1rem' }} onClick={() => setEditingUser(null)}>
                Cancel
              </button>
            </form>
          </div>
        </div>
      )}

      {showUserForm && (
        <div className="card" style={{ marginBottom: '2rem', animation: 'slideDown 0.3s ease-out' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
            <h2 style={{ fontSize: '1.25rem' }}>Create New {userFormData.role === 'tenant_admin' ? 'Tenant' : 'Staff'}</h2>
            <button className="btn btn-outline" onClick={() => setShowUserForm(false)}>Cancel</button>
          </div>
          
          {formError && <div style={{ color: 'var(--danger)', marginBottom: '1rem', background: 'rgba(239, 68, 68, 0.1)', padding: '0.75rem', borderRadius: '8px' }}>{formError}</div>}

          <form onSubmit={handleCreateUser} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
            <div className="form-group">
              <label className="form-label">Full Name</label>
              <input type="text" className="form-input" required value={userFormData.fullName} onChange={e => setUserFormData({...userFormData, fullName: e.target.value})} placeholder="e.g. Michael Smith" />
            </div>
            <div className="form-group">
              <label className="form-label">Email Address</label>
              <input type="email" className="form-input" required value={userFormData.email} onChange={e => setUserFormData({...userFormData, email: e.target.value})} placeholder="email@example.com" />
            </div>
            <div className="form-group">
              <label className="form-label">Default Password</label>
              <input type="password" minLength={6} className="form-input" required value={userFormData.password} onChange={e => setUserFormData({...userFormData, password: e.target.value})} placeholder="••••••••" />
            </div>
            <div className="form-group">
              <label className="form-label">Account Role</label>
              <select className="form-select" value={userFormData.role} onChange={e => setUserFormData({...userFormData, role: e.target.value, tenantId: ''})}>
                <option value="tenant_admin">Tenant (Property Owner)</option>
                <option value="staff">Staff (Operational)</option>
              </select>
            </div>
            
            {userFormData.role === 'staff' && (
              <div className="form-group" style={{ gridColumn: 'span 2' }}>
                <label className="form-label">Assign to Tenant (Owner)</label>
                <select className="form-select" required value={userFormData.tenantId} onChange={e => setUserFormData({...userFormData, tenantId: e.target.value})}>
                  <option value="">-- Select Tenant --</option>
                  {tenants.filter(t => t.role === 'tenant_admin').map(t => (
                    <option key={t.id} value={t.id}>{t.full_name} ({t.id.split('-')[0]})</option>
                  ))}
                </select>
              </div>
            )}

            <div style={{ gridColumn: 'span 2' }}>
              <button type="submit" className="btn btn-primary" style={{ width: '100%', height: '50px' }} disabled={loading}>
                {loading ? 'Creating...' : `Create ${userFormData.role === 'tenant_admin' ? 'Tenant' : 'Staff'} Account`}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Tenants Table */}
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
          <h3>All Platform Accounts</h3>
          <div style={{ position: 'relative' }}>
            <Search size={18} style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
            <input 
              type="text" 
              className="form-input" 
              placeholder="Search users..." 
              style={{ paddingLeft: '2.5rem', width: '300px' }} 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>
        
        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <th>User Details</th>
                <th>Role & Ownership</th>
                <th>Plan & Scale</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {tenants.filter(t => 
                t.full_name?.toLowerCase().includes(searchTerm.toLowerCase()) || 
                t.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                t.id?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                t.role?.toLowerCase().includes(searchTerm.toLowerCase())
              ).map(tenant => (
                <tr key={tenant.id}>
                  <td>
                    <div style={{ fontWeight: 700, fontSize: '0.9rem' }}>{tenant.full_name}</div>
                    <div style={{ color: 'var(--primary)', fontSize: '0.8rem', fontWeight: 600 }}>{tenant.email}</div>
                    <small style={{ color: 'var(--text-muted)', fontSize: '0.7rem' }}>{tenant.id}</small>
                  </td>
                  <td>
                    <span style={{ 
                      display: 'inline-flex', 
                      alignItems: 'center', 
                      gap: '0.4rem', 
                      fontSize: '0.75rem', 
                      fontWeight: '700',
                      padding: '0.2rem 0.6rem',
                      borderRadius: '12px',
                      background: tenant.role === 'tenant_admin' ? 'rgba(59, 130, 246, 0.1)' : 'rgba(107, 114, 128, 0.1)',
                      color: tenant.role === 'tenant_admin' ? 'var(--primary)' : 'var(--text-muted)'
                    }}>
                      {tenant.role === 'tenant_admin' ? <Hotel size={14} /> : <Users size={14} />}
                      {tenant.role === 'tenant_admin' ? 'TENANT' : 'STAFF'}
                    </span>
                    {tenant.role === 'staff' && (
                      <div style={{ marginTop: '0.4rem', fontSize: '0.75rem' }}>
                        Under: <strong>{tenant.ownerName}</strong>
                      </div>
                    )}
                  </td>
                  <td>
                    {tenant.role === 'tenant_admin' ? (
                      <>
                        <span className={`badge ${tenant.plan_type === 'premium' ? 'badge-primary' : (tenant.plan_type === 'pro' ? 'badge-success' : 'badge-outline')}`}>
                          {tenant.plan_type?.toUpperCase() || 'FREE'}
                        </span>
                        <div style={{ marginTop: '0.4rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                          Props: <strong>{tenant.propertyCount}</strong> | Books: <strong>{tenant.bookingCount}</strong>
                        </div>
                      </>
                    ) : (
                      <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>Operational</span>
                    )}
                  </td>
                  <td>
                    <div style={{ 
                      display: 'flex', 
                      alignItems: 'center', 
                      gap: '0.4rem', 
                      color: tenant.subscription_status === 'active' ? 'var(--success)' : 'var(--danger)', 
                      fontSize: '0.85rem' 
                    }}>
                      {tenant.subscription_status === 'active' ? <CheckCircle size={14} /> : <XCircle size={14} />}
                      {tenant.subscription_status === 'active' ? 'Active' : 'Suspended'}
                    </div>
                  </td>
                  <td>
                    <button 
                      className="btn btn-outline" 
                      style={{ padding: '0.25rem 0.8rem', fontSize: '0.75rem' }} 
                      onClick={() => setEditingUser(tenant)}
                    >
                      Manage
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
