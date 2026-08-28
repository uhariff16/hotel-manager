import React, { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { supabase } from './lib/supabase';
import { useSettingsStore } from './lib/store';
import AppLayout from './layouts/AppLayout';
import toast, { Toaster } from 'react-hot-toast';

// Mock empty pages for now
const Dashboard = React.lazy(() => import('./pages/Dashboard'));
const CottagesRooms = React.lazy(() => import('./pages/CottagesRooms'));
const Bookings = React.lazy(() => import('./pages/Bookings'));
const BookingForm = React.lazy(() => import('./pages/BookingForm'));
const CalendarView = React.lazy(() => import('./pages/CalendarView'));
const Financials = React.lazy(() => import('./pages/Financials'));
const Settings = React.lazy(() => import('./pages/Settings'));
const Reports = React.lazy(() => import('./pages/Reports'));
const Resorts = React.lazy(() => import('./pages/Resorts'));
const Subscription = React.lazy(() => import('./pages/Subscription'));
const SuperAdmin = React.lazy(() => import('./pages/SuperAdmin'));
const InvestmentAnalysis = React.lazy(() => import('./pages/InvestmentAnalysis'));
const Staff = React.lazy(() => import('./pages/Staff'));
const Support = React.lazy(() => import('./pages/Support'));
const Auth = React.lazy(() => import('./pages/Auth'));
const Home = React.lazy(() => import('./pages/Home'));
const HowItWorks = React.lazy(() => import('./pages/HowItWorks'));
const Pricing = React.lazy(() => import('./pages/Pricing'));
const PrivacyPolicy = React.lazy(() => import('./pages/PrivacyPolicy'));
const OnboardingWizard = React.lazy(() => import('./components/OnboardingWizard'));

function App() {
  const { theme, session, profile, isRecovering, setSession, setProfile, setResorts, setActiveResortId, setIsRecovering, setGlobalPlans, setLandingPageContent, setWebsitePricing, setOnboardingWizardEnabled, setIsDataLoaded } = useSettingsStore();
  const [isNewlyVerified, setIsNewlyVerified] = React.useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    
    const applyTheme = () => {
      const isSystemDark = mediaQuery.matches;
      const appliedTheme = theme === 'system' || !theme ? (isSystemDark ? 'dark' : 'light') : theme;
      document.documentElement.setAttribute('data-theme', appliedTheme);
      
      if (window.Capacitor?.isNativePlatform()) {
        if (window.Capacitor.getPlatform() === 'android') {
          document.body.classList.add('capacitor-android');
        }
        import('@capacitor/status-bar').then(({ StatusBar, Style }) => {
          StatusBar.setStyle({ style: appliedTheme === 'dark' ? Style.Dark : Style.Light }).catch(() => {});
        }).catch(() => {});
      }
    };

    applyTheme();
    
    const listener = () => applyTheme();
    mediaQuery.addEventListener('change', listener);
    return () => mediaQuery.removeEventListener('change', listener);
  }, [theme]);

  useEffect(() => {
    if (window.location.href.includes('type=signup') || window.location.href.includes('type=invite')) {
      setIsNewlyVerified(true);
    }

    // Auth Listener
    setIsDataLoaded(false);
    supabase.auth.getSession().then(({ data: { session } }) => {
      handleAuthChange(session);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY' || window.location.hash.includes('type=recovery')) {
        setIsRecovering(true);
      }
      
      const { profile } = useSettingsStore.getState();
      
      if (event === 'SIGNED_OUT' || event === 'INITIAL_SESSION') {
        if (event === 'INITIAL_SESSION' && session?.user?.id) {
          // Update last login on page load if session exists
          supabase.from('profiles').update({ last_login_at: new Date().toISOString() }).eq('id', session.user.id).then();
        }
        if (!profile) setIsDataLoaded(false);
        handleAuthChange(session);
      } else if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
        if (event === 'SIGNED_IN' && session?.user?.id) {
          // Update last login
          supabase.from('profiles').update({ last_login_at: new Date().toISOString() }).eq('id', session.user.id).then();
        }
        // If we already have a profile, DO ABSOLUTELY NOTHING.
        // Updating the Zustand store causes a full app re-render (shivering).
        // The Supabase client internally manages the refreshed token anyway.
        if (!profile) {
           setIsDataLoaded(false);
           handleAuthChange(session);
        }
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleAuthChange = async (session) => {
    setSession(session);

    // Fetch global settings (pricing, landing page) for all users regardless of auth
    try {
      const { data: superAdmins } = await supabase.from('profiles').select('global_settings').eq('role', 'super_admin').order('created_at', { ascending: true }).limit(1);
      if (superAdmins && superAdmins.length > 0) {
        const settings = superAdmins[0].global_settings || {};
        if (settings.pricing) {
          setGlobalPlans(settings.pricing);
        }
        if (settings.landing_page) {
          setLandingPageContent(settings.landing_page);
        }
        if (settings.website_pricing) {
          setWebsitePricing(settings.website_pricing);
        }
        if (settings.onboarding_wizard_enabled !== undefined) {
          setOnboardingWizardEnabled(settings.onboarding_wizard_enabled !== false);
        }
      }
    } catch (err) {
      console.error("Failed to fetch global settings:", err);
    }

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
          
          if (resorts && resorts.length > 0) {
            try {
              const [{ count: cottagesCount }, { count: roomsCount }] = await Promise.all([
                supabase.from('cottages').select('*', { count: 'exact', head: true }).eq('resort_id', resorts[0].id),
                supabase.from('rooms').select('*', { count: 'exact', head: true }).eq('resort_id', resorts[0].id)
              ]);
              resorts[0].cottagesCount = cottagesCount || 0;
              resorts[0].roomsCount = roomsCount || 0;
            } catch (err) {
              console.error("Error fetching onboarding counts:", err);
            }
            setResorts(resorts);
            setActiveResortId(resorts[0].id);
          } else {
            setResorts([]);
            setActiveResortId(null);
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
      setIsRecovering(false);
      setSession(null);
    }
    
    setIsDataLoaded(true);
  };

  if (isNewlyVerified) {
    return (
      <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#f8fafc' }}>
        <div style={{ background: 'white', padding: '3rem', borderRadius: '1rem', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)', textAlign: 'center', maxWidth: '400px', width: '90%' }}>
          <div style={{ background: '#10b981', color: 'white', width: '64px', height: '64px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1.5rem auto' }}>
            <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
          </div>
          <h1 style={{ fontSize: '2rem', fontWeight: 'bold', color: '#0f172a', marginBottom: '1rem' }}>Email Verified!</h1>
          <p style={{ color: '#64748b', marginBottom: '2rem', fontSize: '1.1rem' }}>Your email has been successfully confirmed.</p>
          <button 
            onClick={() => setIsNewlyVerified(false)}
            style={{ background: '#0F2C59', color: 'white', padding: '0.75rem 2rem', borderRadius: '0.5rem', fontWeight: 'bold', border: 'none', cursor: 'pointer', fontSize: '1rem', width: '100%' }}
          >
            Continue to Setup
          </button>
        </div>
      </div>
    );
  }

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
      <Toaster position="top-right" />
      <React.Suspense fallback={<div style={{ padding: '2rem' }}>Loading...</div>}>
        <Routes>
          <Route 
            path="/auth" 
            element={session && !isRecovering && !window.location.hash.includes('type=recovery') ? <Navigate to="/dashboard" replace /> : <Auth />} 
          />
          
          <Route path="/" element={!session ? (window.Capacitor?.isNativePlatform() ? <Navigate to="/auth" replace /> : <Home />) : (profile?.role === 'staff' ? <Navigate to="/bookings" replace /> : <Navigate to="/dashboard" replace />)} />
          <Route path="/how-it-works" element={<HowItWorks />} />
          <Route path="/pricing" element={<Pricing />} />
          <Route path="/privacy" element={<PrivacyPolicy />} />
          
          <Route element={session ? <AppLayout /> : <Navigate to="/auth" replace />}>
            <Route path="dashboard" element={profile?.role === 'staff' ? <Navigate to="/bookings" replace /> : <Dashboard />} />
            <Route path="setup" element={<CottagesRooms />} />
            <Route path="bookings" element={<Bookings />} />
            <Route path="bookings/new" element={<BookingForm />} />
            <Route path="bookings/edit/:id" element={<BookingForm />} />
            <Route path="calendar" element={<CalendarView />} />
            <Route path="financials" element={<Financials />} />
            <Route path="reports" element={<Reports />} />
            <Route path="resorts" element={<Resorts />} />
            <Route path="staff" element={<Staff />} />
            <Route path="support" element={<Support />} />
            <Route path="subscription" element={<Subscription />} />
            <Route path="admin" element={<SuperAdmin />} />
            <Route path="investment-analysis" element={<InvestmentAnalysis />} />
            <Route path="settings" element={<Settings />} />
          </Route>

          <Route path="/wizard" element={session ? <OnboardingWizard /> : <Navigate to="/auth" replace />} />

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </React.Suspense>
    </BrowserRouter>
  );
}

export default App;
