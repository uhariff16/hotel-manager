import React, { useState, useEffect } from 'react';
import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom';
import { LayoutDashboard, Home, CalendarDays, Wallet, Settings as SettingsIcon, BookOpenCheck, FileText, Menu, X, Hotel, LogOut, CreditCard, ShieldAlert, Users, TrendingUp, Activity, Database, LifeBuoy } from 'lucide-react';
import { useSettingsStore } from '../lib/store';
import { Capacitor } from '@capacitor/core';

import { supabase } from '../lib/supabase';
import OnboardingWizard from '../components/OnboardingWizard';

export default function AppLayout() {
  const { resortName, logoUrl, profile, resorts, activeResortId, setActiveResortId, logout, onboardingWizardEnabled, isDataLoaded, globalPlans } = useSettingsStore();
  const [isSidebarOpen, setIsSidebarOpen] = React.useState(false);
  const location = useLocation();
  const navigate = useNavigate();

  const isManagementActive = ['/resorts', '/setup', '/staff'].includes(location.pathname);
  const [isManagementOpen, setIsManagementOpen] = React.useState(isManagementActive);
  const [supportUnreadCount, setSupportUnreadCount] = useState(0);

  useEffect(() => {
    if (profile && profile.role !== 'super_admin') {
      fetchUnreadTickets();
      const unreadSub = supabase
        .channel('tenant-unread')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'support_tickets' }, () => {
          fetchUnreadTickets();
        })
        .subscribe();
      return () => {
        supabase.removeChannel(unreadSub);
      };
    }
  }, [profile]);
  useEffect(() => {
    const autoMigrateTemplates = async () => {
      if (profile && profile.role === 'super_admin' && profile.global_settings) {
        const settings = profile.global_settings || {};
        const emailTemplates = settings.email_templates || {};
        let updated = false;

        const cleanTemplate = (html) => {
          if (!html) return html;
          let newHtml = html;
          
          if (newHtml.includes('linear-gradient')) {
            newHtml = newHtml
              .replace(/background-color:\s*#0F2C59;\s*background:\s*linear-gradient\([^)]+\);?/gi, 'background-color: #0F2C59;')
              .replace(/background-color:\s*#10b981;\s*background:\s*linear-gradient\([^)]+\);?/gi, 'background-color: #10b981;')
              .replace(/background-color:\s*#475569;\s*background:\s*linear-gradient\([^)]+\);?/gi, 'background-color: #475569;')
              .replace(/background:\s*linear-gradient\(135deg,\s*#0F2C59\s+0%,\s*#1a4a8f\s+100%\);?/gi, 'background-color: #0F2C59;')
              .replace(/background:\s*linear-gradient\(135deg,\s*#10b981\s+0%,\s*#059669\s+100%\);?/gi, 'background-color: #10b981;')
              .replace(/background:\s*linear-gradient\(135deg,\s*#475569\s+0%,\s*#1e293b\s+100%\);?/gi, 'background-color: #475569;')
              .replace(/background:\s*linear-gradient\([^)]+\);?/gi, 'background-color: #0F2C59;');
            updated = true;
          }
          return newHtml;
        };

        if (emailTemplates.welcome) {
          const oldHtml = emailTemplates.welcome.html;
          const newHtml = cleanTemplate(oldHtml);
          if (oldHtml !== newHtml) {
            emailTemplates.welcome.html = newHtml;
            updated = true;
          }
        }
        if (emailTemplates.subscription_activated) {
          const oldHtml = emailTemplates.subscription_activated.html;
          const newHtml = cleanTemplate(oldHtml);
          if (oldHtml !== newHtml) {
            emailTemplates.subscription_activated.html = newHtml;
            updated = true;
          }
        }
        if (emailTemplates.subscription_cancelled) {
          const oldHtml = emailTemplates.subscription_cancelled.html;
          const newHtml = cleanTemplate(oldHtml);
          if (oldHtml !== newHtml) {
            emailTemplates.subscription_cancelled.html = newHtml;
            updated = true;
          }
        }

        if (updated) {
          settings.email_templates = emailTemplates;
          const { error } = await supabase
            .from('profiles')
            .update({ global_settings: settings })
            .eq('id', profile.id);
          
          if (!error) {
            console.log("Successfully migrated email templates to solid backgrounds via auto-updater!");
          } else {
            console.error("Auto-migration of templates failed:", error);
          }
        }
      }
    };
    autoMigrateTemplates();
  }, [profile]);

  const fetchUnreadTickets = async () => {
    if (!profile) return;
    const { count } = await supabase
      .from('support_tickets')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', profile.tenant_id || profile.id)
      .eq('tenant_unread', true);
    setSupportUnreadCount(count || 0);
  };

  React.useEffect(() => {
    if (isManagementActive) {
      setIsManagementOpen(true);
    }
  }, [location.pathname]);

  React.useEffect(() => {
    setIsSidebarOpen(false);
  }, [location.pathname]);

  const activeResort = (resorts || []).find(r => r.id === activeResortId) || null;

  const isStaff = profile?.role === 'staff';
  const isAdmin = profile?.role === 'tenant_admin';
  const isSuper = profile?.role === 'super_admin';

  const needsOnboarding = onboardingWizardEnabled !== false && profile?.role === 'tenant_admin' && (
    !resorts || resorts.length === 0 || 
    (resorts.length === 1 && resorts[0] && (resorts[0].cottagesCount === 0 || resorts[0].roomsCount === 0))
  );

  if (!isDataLoaded) {
    return <div style={{ display: 'flex', height: '100vh', justifyContent: 'center', alignItems: 'center' }}>
      <div className="spinner" style={{ width: '40px', height: '40px', border: '3px solid var(--border)', borderTopColor: 'var(--primary)', borderRadius: '50%', animation: 'spin 1s linear infinite' }}></div>
      <style>{`
        @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
      `}</style>
    </div>;
  }

  if (needsOnboarding) {
    return <OnboardingWizard />;
  }

  const userPlan = profile?.plan_type || 'free';
  const planData = globalPlans?.[userPlan] || {};
  const enabledFeatures = (planData.features || []).filter(f => f.enabled).map(f => f.name.toLowerCase());
  const hasFeature = (keyword) => enabledFeatures.some(f => f.includes(keyword.toLowerCase()));
  const hasInvestmentAccess = planData.reports?.investment || profile?.feature_investment_enabled;

  let navLinks = [];

  if (isStaff) {
    // Staff only see Bookings, Calendar, and Settings
    if (hasFeature('booking')) navLinks.push({ to: '/bookings', label: 'Bookings', icon: <BookOpenCheck size={20} /> });
    if (hasFeature('booking') || hasFeature('calendar')) navLinks.push({ to: '/calendar', label: 'Calendar', icon: <CalendarDays size={20} /> });
  } else {
    // Tenants and Super Admins
    if (hasFeature('dashboard') || isSuper) navLinks.push({ to: '/dashboard', label: 'Dashboard', icon: <LayoutDashboard size={20} /> });
    if (hasFeature('booking') || isSuper) {
      navLinks.push({ to: '/bookings', label: 'Bookings', icon: <BookOpenCheck size={20} /> });
      navLinks.push({ to: '/calendar', label: 'Calendar', icon: <CalendarDays size={20} /> });
    }
    if (hasFeature('financial') || isSuper) navLinks.push({ to: '/financials', label: 'Financials', icon: <Wallet size={20} /> });
    if (hasFeature('report') || isSuper) navLinks.push({ to: '/reports', label: 'Reports', icon: <FileText size={20} /> });
    const managementMenu = { 
      label: 'Management', 
      icon: <Activity size={20} />, 
      isSubmenu: true,
      children: [
        { to: '/resorts', label: 'Tenant Management', icon: <Hotel size={16} /> },
        { to: '/setup', label: 'Property Management', icon: <Home size={16} /> },
        { to: '/staff', label: 'Staff Management', icon: <Users size={16} /> },
      ]
    };

    if (hasFeature('tenant') || hasFeature('staff') || isSuper) {
      navLinks.push(managementMenu);
    }
    
    if (!Capacitor.isNativePlatform()) {
      navLinks.push({ to: '/subscription', label: 'Plans & Billing', icon: <CreditCard size={20} /> });
    }
    navLinks.push({ to: '/support', label: `Help & Support ${supportUnreadCount > 0 ? `(${supportUnreadCount})` : ''}`, icon: <LifeBuoy size={20} /> });
  }

  // Settings is shared but will be simplified in its own page logic
  navLinks.push({ to: '/settings', label: 'Settings', icon: <SettingsIcon size={20} /> });

  if (hasInvestmentAccess || isSuper) {
    navLinks.push({ to: '/investment-analysis', label: 'Investment Analysis', icon: <TrendingUp size={20} /> });
  }

  // Add Super Admin link if user has the role
  if (isSuper) {
    navLinks.push({ to: '/admin', label: 'System Admin', icon: <ShieldAlert size={20} color="var(--danger)" /> });
  }



  return (
    <div className="app-container">
      {/* Sidebar Overlay (Mobile only) */}
      <div 
         className={`sidebar-overlay ${isSidebarOpen ? 'open' : ''}`} 
        onClick={() => setIsSidebarOpen(false)}
      ></div>

      {/* Sidebar */}
      <aside className={`sidebar ${isSidebarOpen ? 'open' : ''}`}>
        <div className="brand" style={{ padding: '1rem', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', width: '100%', padding: '0.25rem 0' }}>
            <img src="/stay-pilot-logo.png" alt="Stay Pilot" style={{ height: 'auto', width: '100%', maxWidth: '240px', objectFit: 'contain' }} />
          </div>
          
          <button 
            className="menu-toggle" 
            onClick={() => setIsSidebarOpen(false)}
            style={{ padding: '0.5rem' }}
          >
            <X size={20} />
          </button>
        </div>

        {(resorts || []).length > 1 && (
          <div style={{ padding: '0 1rem 1rem' }}>
            <select 
              className="form-select" 
              style={{ fontSize: '0.8rem', padding: '0.5rem' }}
              value={activeResortId || ''}
              onChange={(e) => setActiveResortId(e.target.value)}
            >
              {(resorts || []).map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          </div>
        )}

        <nav className="nav-links" style={{ flex: 1 }}>
          {navLinks.map((link) => {
            if (link.isSubmenu) {
              return (
                <div key={link.label} style={{ display: 'flex', flexDirection: 'column' }}>
                  <button
                    onClick={() => setIsManagementOpen(!isManagementOpen)}
                    className="nav-item"
                    style={{
                      width: '100%',
                      background: 'none',
                      border: 'none',
                      textAlign: 'left',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      color: isManagementActive ? 'var(--primary)' : 'var(--text-muted)',
                      fontWeight: isManagementActive ? 700 : 500,
                      padding: '0.75rem 1rem',
                      font: 'inherit'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                      {link.icon}
                      <span>{link.label}</span>
                    </div>
                    <span style={{ 
                      fontSize: '0.6rem', 
                      transform: isManagementOpen ? 'rotate(90deg)' : 'rotate(0deg)', 
                      transition: 'transform 0.2s',
                      opacity: 0.6
                    }}>
                      ▶
                    </span>
                  </button>
                  {isManagementOpen && (
                    <div className="submenu-links" style={{ paddingLeft: '1rem', display: 'flex', flexDirection: 'column', gap: '0.25rem', marginTop: '0.25rem', marginBottom: '0.25rem', borderLeft: '1px solid var(--border)', marginLeft: '1.75rem' }}>
                      {link.children.map((child) => (
                        <NavLink
                          key={child.to}
                          to={child.to}
                          className="nav-item"
                          style={({ isActive }) => ({
                            fontSize: '0.85rem',
                            padding: '0.6rem 1rem',
                            color: isActive ? 'var(--primary)' : 'var(--text-muted)',
                            background: isActive ? 'rgba(5, 150, 105, 0.08)' : 'transparent',
                            fontWeight: isActive ? 700 : 500,
                            borderRadius: 'var(--radius-md)',
                            transition: 'all 0.2s'
                          })}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                            {child.icon}
                            <span>{child.label}</span>
                          </div>
                        </NavLink>
                      ))}
                    </div>
                  )}
                </div>
              );
            }

            return (
              <NavLink
                key={link.to}
                to={link.to}
                className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
              >
                {link.icon}
                {link.label}
              </NavLink>
            );
          })}
        </nav>

        <div className="sidebar-footer" style={{ padding: '1rem', borderTop: '1px solid var(--border)' }}>
          <button 
            className="nav-item" 
            style={{ width: '100%', background: 'none', border: 'none', color: 'var(--danger)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '1rem', padding: '0.75rem 1rem', borderRadius: 'var(--radius-md)' }}
            onClick={() => { if(window.confirm('Logout?')) { sessionStorage.setItem('justLoggedOut', 'true'); supabase.auth.signOut(); logout(); } }}
          >
            <LogOut size={20} />
            <span style={{ fontWeight: 600 }}>Logout</span>
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="main-content">
        <header className="top-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <button className="menu-toggle" onClick={() => setIsSidebarOpen(true)}>
              <Menu size={24} />
            </button>
            <div className="header-brand-wrap" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <style dangerouslySetInnerHTML={{__html: `
                @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700;800&family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap');
                
                @media (max-width: 640px) {
                  .header-brand-sep, .header-brand-tag {
                    display: none !important;
                  }
                }
              `}} />
              <h2 style={{ fontSize: '1.25rem', margin: 0, fontWeight: 800, color: 'var(--text-main)', fontFamily: "'Outfit', sans-serif", whiteSpace: 'nowrap', flexShrink: 0 }}>Stay Pilot</h2>
              <span className="header-brand-sep" style={{ color: '#cbd5e1', fontWeight: 300 }}>|</span>
              <span className="header-brand-tag" style={{ fontSize: '0.9rem', color: '#059669', fontWeight: 600, fontFamily: "'Plus Jakarta Sans', sans-serif", letterSpacing: '0.02em', marginTop: '2px', whiteSpace: 'nowrap' }}>
                Know Your Bookings. Know Your Numbers.
              </span>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', minWidth: 0 }}>
            <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', fontSize: '0.75rem', minWidth: 0 }}>
              <span style={{ fontWeight: 'bold', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '130px' }}>{profile?.full_name}</span>
              <span style={{ color: 'var(--text-muted)', textTransform: 'capitalize', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '130px' }}>{profile?.role?.replace('_', ' ') || ''}</span>
            </div>
            <button 
              className="btn btn-outline" 
              style={{ padding: '0.5rem' }} 
              onClick={() => { sessionStorage.setItem('justLoggedOut', 'true'); supabase.auth.signOut(); logout(); }}
              title="Logout"
            >
              <LogOut size={18} />
            </button>
          </div>
        </header>

        <div className="page-content">
          <Outlet />
        </div>

        {/* Mobile Bottom Navigation */}
        <nav className="mobile-bottom-nav">
          {!isStaff && (hasFeature('dashboard') || isSuper) && (
            <NavLink to="/dashboard" className={({ isActive }) => `mobile-nav-item ${isActive ? 'active' : ''}`}>
              <LayoutDashboard size={24} />
              <span>Dashboard</span>
            </NavLink>
          )}
          {(hasFeature('booking') || isSuper) && (
            <NavLink to="/bookings" className={({ isActive }) => `mobile-nav-item ${isActive ? 'active' : ''}`}>
              <BookOpenCheck size={24} />
              <span>Bookings</span>
            </NavLink>
          )}
          {(hasFeature('booking') || isSuper) && (
            <NavLink to="/calendar" className={({ isActive }) => `mobile-nav-item ${isActive ? 'active' : ''}`}>
              <CalendarDays size={24} />
              <span>Calendar</span>
            </NavLink>
          )}
          {!isStaff && (hasFeature('financial') || isSuper) && (
            <NavLink to="/financials" className={({ isActive }) => `mobile-nav-item ${isActive ? 'active' : ''}`}>
              <Wallet size={24} />
              <span>Finance</span>
            </NavLink>
          )}
          <button 
            className="mobile-nav-item" 
            style={{ background: 'none', border: 'none', padding: 0 }}
            onClick={() => setIsSidebarOpen(true)}
          >
            <Menu size={24} />
            <span>Menu</span>
          </button>
        </nav>
      </main>
    </div>
  );
}
