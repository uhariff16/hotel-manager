import React from 'react';
import { Outlet, NavLink } from 'react-router-dom';
import { LayoutDashboard, Home, CalendarDays, Wallet, Settings as SettingsIcon, BookOpenCheck, FileText } from 'lucide-react';
import { useSettingsStore } from '../lib/store';

export default function AppLayout() {
  const { resortName, logoUrl } = useSettingsStore();

  const navLinks = [
    { to: '/dashboard', label: 'Dashboard', icon: <LayoutDashboard size={20} /> },
    { to: '/bookings', label: 'Bookings', icon: <BookOpenCheck size={20} /> },
    { to: '/calendar', label: 'Calendar', icon: <CalendarDays size={20} /> },
    { to: '/financials', label: 'Financials', icon: <Wallet size={20} /> },
    { to: '/reports', label: 'Reports', icon: <FileText size={20} /> },
    { to: '/setup', label: 'Setup', icon: <Home size={20} /> },
    { to: '/settings', label: 'Settings', icon: <SettingsIcon size={20} /> },
  ];

  return (
    <div className="app-container">
      {/* Sidebar */}
      <aside className="sidebar">
        <div className="brand">
          {logoUrl ? (
            <img src={logoUrl} alt="Logo" className="brand-logo" />
          ) : (
            <div className="brand-logo" style={{ background: 'var(--primary)', borderRadius: '4px' }}></div>
          )}
          <span className="brand-text">{resortName}</span>
        </div>
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
          <h2 style={{ fontSize: '1.25rem' }}>Welcome, Admin</h2>
          <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
            <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: 'var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              👤
            </div>
          </div>
        </header>

        <div className="page-content">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
