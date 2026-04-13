import React, { useState } from 'react';
import { useSettingsStore } from '../lib/store';
import { supabase } from '../lib/supabase';
import { AlertTriangle, User, Palette, ShieldAlert } from 'lucide-react';

export default function Settings() {
  const { profile, setProfile, theme, toggleTheme, session } = useSettingsStore();
  const [userName, setUserName] = useState(profile?.full_name || '');
  const [loading, setLoading] = useState(false);

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

  return (
    <div style={{ maxWidth: '800px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      
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

      {/* 2. Appearance Section */}
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

      {/* 3. Danger Zone (Admin Only) */}
      {(profile?.role === 'tenant_admin' || profile?.role === 'super_admin') && (
        <div className="card" style={{ border: '1px solid var(--danger)' }}>
          <h2 style={{ marginBottom: '1rem', color: 'var(--danger)', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <ShieldAlert size={24} /> Danger Zone
          </h2>
          <p style={{ color: 'var(--text-muted)', marginBottom: '1.5rem' }}>
            Factory Reset: This action will permanently delete all transactional history (Bookings, Incomes, Expenses) from the database. 
            Properties, Rooms, and Tenant settings will be preserved.
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

      {/* 4. Super Admin Debug Console (Temporary Diagnostic) */}
      <div className="card" style={{ background: '#1a1f26', border: '1px solid #334155' }}>
        <h2 style={{ marginBottom: '1rem', color: '#94a3b8', fontSize: '1rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <ShieldAlert size={20} /> Super Admin Debug Console
        </h2>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', fontSize: '0.85rem' }}>
          <div style={{ padding: '1rem', background: '#0f172a', borderRadius: '8px', border: '1px solid #1e293b' }}>
            <p style={{ color: '#64748b', marginBottom: '0.5rem' }}>Current Session Data:</p>
            <pre style={{ color: profile?.role === 'super_admin' ? '#4ade80' : '#f87171' }}>
              {JSON.stringify({ 
                email: session?.user?.email,
                role: profile?.role,
                tenant_id: profile?.tenant_id 
              }, null, 2)}
            </pre>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <p style={{ color: '#94a3b8' }}>If the role says "tenant_admin" above, your SQL sync didn't take effect or your session is stale.</p>
            <button 
              className="btn btn-primary" 
              style={{ width: '100%' }}
              onClick={() => {
                localStorage.clear();
                window.location.href = '/auth';
              }}
            >
              Force Re-Sync & Re-Login
            </button>
            <p style={{ fontSize: '0.75rem', color: '#64748b' }}>This button will clear your browser cache and force a fresh login to pick up new database permissions.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
