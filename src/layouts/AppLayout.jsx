import React from 'react';
import { Outlet, NavLink } from 'react-router-dom';
import { LayoutDashboard, Home, CalendarDays, Wallet, Settings as SettingsIcon, BookOpenCheck, FileText, Menu, X, Hotel, LogOut, CreditCard, ShieldAlert, Users, TrendingUp } from 'lucide-react';
import { useSettingsStore } from '../lib/store';
import { useLocation } from 'react-router-dom';
import { supabase } from '../lib/supabase';

export default function AppLayout() {
  const { resortName, logoUrl, profile, resorts, activeResortId, setActiveResortId, logout } = useSettingsStore();
  const [isSidebarOpen, setIsSidebarOpen] = React.useState(false);
  const location = useLocation();

  const activeResort = resorts.find(r => r.id === activeResortId);

  const isStaff = profile?.role === 'staff';
  const isAdmin = profile?.role === 'tenant_admin';
  const isSuper = profile?.role === 'super_admin';

  let navLinks = [];

  if (isStaff) {
    // Staff only see Bookings, Calendar, and Settings
    navLinks = [
      { to: '/bookings', label: 'Bookings', icon: <BookOpenCheck size={20} /> },
      { to: '/calendar', label: 'Calendar', icon: <CalendarDays size={20} /> },
    ];
  } else {
    // Tenants and Super Admins see the full dashboard
    navLinks = [
      { to: '/dashboard', label: 'Dashboard', icon: <LayoutDashboard size={20} /> },
      { to: '/bookings', label: 'Bookings', icon: <BookOpenCheck size={20} /> },
      { to: '/calendar', label: 'Calendar', icon: <CalendarDays size={20} /> },
      { to: '/financials', label: 'Financials', icon: <Wallet size={20} /> },
      { to: '/reports', label: 'Reports', icon: <FileText size={20} /> },
      { to: '/resorts', label: 'Tenant Management', icon: <Hotel size={20} /> },
      { to: '/staff', label: 'Staff Management', icon: <Users size={20} /> },
      { to: '/setup', label: 'Property Management', icon: <Home size={20} /> },
      { to: '/subscription', label: 'Plans & Billing', icon: <CreditCard size={24} /> },
    ];
  }

  // Settings is shared but will be simplified in its own page logic
  navLinks.push({ to: '/settings', label: 'Settings', icon: <SettingsIcon size={20} /> });

  if (profile?.feature_investment_enabled) {
    navLinks.push({ to: '/price-analysis', label: 'Price Analysis', icon: <TrendingUp size={20} /> });
  }

  // Add Super Admin link if user has the role
  if (isSuper) {
    navLinks.push({ to: '/admin', label: 'System Admin', icon: <ShieldAlert size={20} color="var(--danger)" /> });
  }

  // Close sidebar on navigation change (for mobile)
  React.useEffect(() => {
    setIsSidebarOpen(false);
  }, [location.pathname]);

  return (
    <div className="app-container">
      {/* Sidebar Overlay (Mobile only) */}
      <div 
        className={`sidebar-overlay ${isSidebarOpen ? 'open' : ''}`} 
        onClick={() => setIsSidebarOpen(false)}
      ></div>

      {/* Sidebar */}
      <aside className={`sidebar ${isSidebarOpen ? 'open' : ''}`}>
        <div className="brand" style={{ position: 'relative' }}>
          {activeResort?.logo_url || logoUrl ? (
            <img src={activeResort?.logo_url || logoUrl} alt="Logo" className="brand-logo" />
          ) : (
            <div className="brand-logo" style={{ background: 'var(--primary)', borderRadius: '4px' }}></div>
          )}
          <span className="brand-text">{activeResort?.name || resortName}</span>
          
          <button 
            className="menu-toggle" 
            style={{ position: 'absolute', right: '1rem' }}
            onClick={() => setIsSidebarOpen(false)}
          >
            <X size={24} />
          </button>
        </div>

        {resorts.length > 1 && (
          <div style={{ padding: '0 1rem 1rem' }}>
            <select 
              className="form-select" 
              style={{ fontSize: '0.8rem', padding: '0.5rem' }}
              value={activeResortId || ''}
              onChange={(e) => setActiveResortId(e.target.value)}
            >
              {resorts.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          </div>
        )}

        <nav className="nav-links">
          {navLinks.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
            >
              {link.icon}
              {link.label}
            </NavLink>
          ))}
        </nav>
      </aside>

      {/* Main Content */}
      <main className="main-content">
        <header className="top-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <button className="menu-toggle" onClick={() => setIsSidebarOpen(true)}>
              <Menu size={24} />
            </button>
            <h2 style={{ fontSize: '1.25rem' }}>{activeResort?.name || 'Welcome'}</h2>
          </div>
          <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
            <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', fontSize: '0.75rem' }}>
              <span style={{ fontWeight: 'bold' }}>{profile?.full_name}</span>
              <span style={{ color: 'var(--text-muted)', textTransform: 'capitalize' }}>{profile?.role.replace('_', ' ')}</span>
            </div>
            <button 
              className="btn btn-outline" 
              style={{ padding: '0.5rem' }} 
              onClick={() => { supabase.auth.signOut(); logout(); }}
              title="Logout"
            >
              <LogOut size={18} />
            </button>
          </div>
        </header>

        <div className="page-content">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
