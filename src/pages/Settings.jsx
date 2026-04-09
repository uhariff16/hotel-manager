import React from 'react';
import { useSettingsStore } from '../lib/store';
import { supabase } from '../lib/supabase';
import { AlertTriangle } from 'lucide-react';

export default function Settings() {
  const { theme, toggleTheme } = useSettingsStore();

  const wipeData = async () => {
    const pw = window.prompt("WARNING: This will permanently delete ALL Bookings, Incomes, and Expenses.\n\nEnter master password to confirm:");
    if (pw !== "admin123") {
      if (pw !== null) alert("Incorrect password.");
      return;
    }
    
    try {
      // Use inequality to delete all records
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      <div className="card">
        <h1 style={{ marginBottom: '1rem' }}>Settings & Branding</h1>
        
        <div className="form-group">
          <label className="form-label">Current Theme: <strong>{theme}</strong></label>
          <button className="btn btn-outline" onClick={toggleTheme}>
            Switch to {theme === 'light' ? 'Dark (Luxury)' : 'Light (Eco)'} Theme
          </button>
        </div>
      </div>

      <div className="card" style={{ border: '1px solid var(--danger)' }}>
        <h2 style={{ marginBottom: '1rem', color: 'var(--danger)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <AlertTriangle /> Danger Zone
        </h2>
        <p style={{ color: 'var(--text-muted)', marginBottom: '1.5rem' }}>This action will permanently delete all transactional history (Bookings, Incomes, Expenses) from the database. Cottages & Rooms will be preserved.</p>
        <button className="btn" style={{ background: 'var(--danger)', color: 'white', borderColor: 'var(--danger)' }} onClick={wipeData}>
          Clear All Transactions (Factory Reset)
        </button>
      </div>
    </div>
  );
}
