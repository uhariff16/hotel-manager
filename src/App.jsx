import React, { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { supabase } from './lib/supabase';
import { useSettingsStore } from './lib/store';
import AppLayout from './layouts/AppLayout';

// Mock empty pages for now
const Dashboard = React.lazy(() => import('./pages/Dashboard'));
const CottagesRooms = React.lazy(() => import('./pages/CottagesRooms'));
const Bookings = React.lazy(() => import('./pages/Bookings'));
const CalendarView = React.lazy(() => import('./pages/CalendarView'));
const Financials = React.lazy(() => import('./pages/Financials'));
const Settings = React.lazy(() => import('./pages/Settings'));
const Reports = React.lazy(() => import('./pages/Reports'));
const Resorts = React.lazy(() => import('./pages/Resorts'));
const Subscription = React.lazy(() => import('./pages/Subscription'));
const SuperAdmin = React.lazy(() => import('./pages/SuperAdmin'));
const Staff = React.lazy(() => import('./pages/Staff'));
const Auth = React.lazy(() => import('./pages/Auth'));

function App() {
  const { theme, session, profile, setSession, setProfile, setResorts, setActiveResortId } = useSettingsStore();

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  useEffect(() => {
    // Auth Listener
    supabase.auth.getSession().then(({ data: { session } }) => {
      handleAuthChange(session);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      handleAuthChange(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleAuthChange = async (session) => {
    setSession(session);
    if (session) {
      // Fetch profile first to get the correct role and tenant_id
      const { data: profile } = await supabase.from('profiles').select('*').eq('id', session.user.id).single();
      
      if (profile) {
        setProfile(profile);
        
        // Only fetch resorts if the user actually belongs to a tenant (Owners and Staff)
        if (profile.tenant_id) {
          const { data: resorts } = await supabase
            .from('resorts')
            .select('*')
            .eq('tenant_id', profile.tenant_id);
          
          setResorts(resorts || []);
          if (resorts?.length > 0) {
            setActiveResortId(resorts[0].id);
          }
        } else {
          setResorts([]);
          setActiveResortId(null);
        }
      }
    } else {
      // Clear all state on logout
      setProfile(null);
      setResorts([]);
      setActiveResortId(null);
    }
  };

  if (session && profile?.subscription_status === 'suspended') {
    return (
      <div style={{ 
        height: '100vh', 
        display: 'flex', 
        flexDirection: 'column', 
        alignItems: 'center', 
        justifyContent: 'center', 
        background: '#111418', 
        color: 'white', 
        textAlign: 'center', 
        padding: '2rem' 
      }}>
        <div style={{ background: 'rgba(229, 62, 62, 0.1)', padding: '2rem', borderRadius: '1rem', border: '1px solid var(--danger)' }}>
          <h1 style={{ fontSize: '3rem', color: '#e53e3e', marginBottom: '1rem' }}>Account Suspended</h1>
          <p style={{ fontSize: '1.2rem', color: 'rgba(255,255,255,0.6)' }}>Your access to Cheerful Chalet Manager has been restricted.</p>
          <p style={{ marginTop: '1rem' }}>Please contact global administration or settle your outstanding dues.</p>
          <button 
            className="btn btn-outline" 
            style={{ marginTop: '2.5rem', color: 'white', borderColor: 'rgba(255,255,255,0.2)' }} 
            onClick={() => { supabase.auth.signOut(); }}
          >
            Logout From Account
          </button>
        </div>
      </div>
    );
  }

  return (
    <BrowserRouter>
      <React.Suspense fallback={<div style={{ padding: '2rem' }}>Loading...</div>}>
        <Routes>
          <Route path="/auth" element={session ? <Navigate to="/dashboard" replace /> : <Auth />} />
          
          <Route path="/" element={session ? <AppLayout /> : <Navigate to="/auth" replace />}>
            <Route index element={profile?.role === 'staff' ? <Navigate to="/bookings" replace /> : <Navigate to="/dashboard" replace />} />
            <Route path="dashboard" element={profile?.role === 'staff' ? <Navigate to="/bookings" replace /> : <Dashboard />} />
            <Route path="setup" element={<CottagesRooms />} />
            <Route path="bookings" element={<Bookings />} />
            <Route path="calendar" element={<CalendarView />} />
            <Route path="financials" element={<Financials />} />
            <Route path="reports" element={<Reports />} />
            <Route path="resorts" element={<Resorts />} />
            <Route path="staff" element={<Staff />} />
            <Route path="subscription" element={<Subscription />} />
            <Route path="admin" element={<SuperAdmin />} />
            <Route path="settings" element={<Settings />} />
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </React.Suspense>
    </BrowserRouter>
  );
}

export default App;
