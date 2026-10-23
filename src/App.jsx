import React, { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { supabase } from './lib/supabase';
import { useSettingsStore } from './lib/store';
import AppLayout from './layouts/AppLayout';
import ErrorBoundary from './components/ErrorBoundary';
import toast, { Toaster } from 'react-hot-toast';
import { Capacitor } from '@capacitor/core';
import { AppShortcuts } from '@capawesome/capacitor-app-shortcuts';

// Lazy loaded pages
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
const EnquiriesBoard = React.lazy(() => import('./pages/EnquiriesBoard'));
const QuickEnquiryMobile = React.lazy(() => import('./pages/QuickEnquiryMobile'));
const Home = React.lazy(() => import('./pages/Home'));
const HowItWorks = React.lazy(() => import('./pages/HowItWorks'));
const Features = React.lazy(() => import('./pages/Features'));
const Pricing = React.lazy(() => import('./pages/Pricing'));
const PrivacyPolicy = React.lazy(() => import('./pages/PrivacyPolicy'));
const OnboardingWizard = React.lazy(() => import('./components/OnboardingWizard'));
const EmailVerification = React.lazy(() => import('./pages/EmailVerification'));
import { App as CapApp } from '@capacitor/app';

function App() {

  React.useEffect(() => {
    if (Capacitor.isNativePlatform()) {
      AppShortcuts.set({
        shortcuts: [
          {
            id: 'quick_enquiry',
            title: 'Quick Enquiry',
            description: 'Log a Quick Enquiry'
          }
        ]
      }).catch(console.error);

      AppShortcuts.addListener('click', (event) => {
        if (event.shortcutId === 'quick_enquiry') {
          window.location.href = '/enquiries/quick';
        }
      });

      CapApp.addListener('appUrlOpen', (event) => {
        if (event.url.includes('/auth') || event.url.startsWith('staypilot://auth')) {
          window.location.href = '/auth';
        }
      });
    }
  }, []);

  const { theme, session, profile, isRecovering, setSession, setProfile, setResorts, setActiveResortId, setIsRecovering, setGlobalPlans, setLandingPageContent, setWebsitePricing, setGlobalTaxSettings, setOnboardingWizardEnabled, setIsDataLoaded, setResortsLoadError } = useSettingsStore();
  const checkHasVerificationContext = () => {
    if (typeof window === 'undefined') return false;
    const hash = window.location.hash || '';
    const search = window.location.search || '';
    if (hash.includes('type=signup') || hash.includes('type=invite') || hash.includes('type=email_change')) return true;
    if (search.includes('type=signup') || search.includes('type=invite') || search.includes('type=email_change')) return true;
    if (hash.includes('error_code=') || search.includes('error_code=')) return true;
    if (hash.includes('error=') || search.includes('error=')) return true;
    if (sessionStorage.getItem('staypilot_email_verified') === 'true') return true;
    return false;
  };
  const [hasPendingVerification, setHasPendingVerification] = React.useState(checkHasVerificationContext());

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
    // Verification context handled via hasPendingVerification & EmailVerification

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
          supabase.from('profiles').update({ last_login_at: new Date().toISOString() }).eq('id', session.user.id).then();
        }
        if (!profile) setIsDataLoaded(false);
        handleAuthChange(session);
      } else if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
        if (event === 'SIGNED_IN' && session?.user?.id) {
          supabase.from('profiles').update({ last_login_at: new Date().toISOString() }).eq('id', session.user.id).then();
        }
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

    try {
      const { data: config, error: configErr } = await supabase.rpc('get_public_website_config');
      if (config) {
        if (config.pricing) setGlobalPlans(config.pricing);
        if (config.landing_page !== undefined) {
          if (config.landing_page && typeof config.landing_page === 'object') {
            const rawLp = Array.isArray(config.landing_page)
              ? (config.landing_page.find(x => x && typeof x === 'object') || null)
              : config.landing_page;
            if (rawLp) setLandingPageContent(rawLp);
          } else if (config.landing_page === null) {
            setLandingPageContent(null);
          }
        }
        if (config.website_pricing) setWebsitePricing(config.website_pricing);
        if (config.tax_settings) setGlobalTaxSettings(config.tax_settings);
        if (config.onboarding_wizard_enabled !== undefined) {
          setOnboardingWizardEnabled(config.onboarding_wizard_enabled !== false);
        }
      } else if (configErr) {
        console.warn("Public config RPC notice:", configErr.message);
      }
    } catch (err) {
      console.error("Failed to fetch global settings:", err);
    }

    if (session) {
      const { data: profile } = await supabase.from('profiles').select('*').eq('id', session.user.id).single();
      
      if (profile) {
        const { data: isExpired } = await supabase.rpc('is_trial_expired');
        profile.is_trial_expired_server = isExpired;
        setProfile(profile);

        if (profile.tenant_id) {
          const { data: resorts, error: resortsError } = await supabase
            .from('resorts')
            .select('*')
            .eq('tenant_id', profile.tenant_id);
          
          if (resortsError) {
            console.error("Error fetching tenant resorts:", resortsError);
            setResortsLoadError(resortsError.message || "Failed to load property data");
          } else if (resorts && resorts.length > 0) {
            try {
              const [
                { count: cottagesCount, error: cottagesError }, 
                { count: roomsCount, error: roomsError }
              ] = await Promise.all([
                supabase.from('cottages').select('*', { count: 'exact', head: true }).eq('resort_id', resorts[0].id),
                supabase.from('rooms').select('*', { count: 'exact', head: true }).eq('resort_id', resorts[0].id)
              ]);

              if (cottagesError || roomsError) {
                const countErr = cottagesError || roomsError;
                console.error("Error fetching onboarding counts:", countErr);
                setResortsLoadError(countErr.message || "Failed to load cottage/room counts");
                setResorts(resorts);
                setActiveResortId(resorts[0].id);
              } else {
                resorts[0].cottagesCount = cottagesCount ?? 0;
                resorts[0].roomsCount = roomsCount ?? 0;
                setResortsLoadError(null);
                setResorts(resorts);
                setActiveResortId(resorts[0].id);
              }
            } catch (err) {
              console.error("Exception fetching onboarding counts:", err);
              setResortsLoadError(err.message || "Exception loading property counts");
              setResorts(resorts);
              setActiveResortId(resorts[0].id);
            }
          } else {
            setResortsLoadError(null);
            setResorts([]);
            setActiveResortId(null);
          }
        } else {
          setResortsLoadError(null);
          setResorts([]);
          setActiveResortId(null);
        }
      }
    } else {
      setProfile(null);
      setResorts([]);
      setActiveResortId(null);
      setIsRecovering(false);
      setSession(null);
      setResortsLoadError(null);
    }
    
    setIsDataLoaded(true);
  };

    if (hasPendingVerification) {
    return (
      <BrowserRouter>
        <Toaster position="top-right" />
        <React.Suspense fallback={<div style={{ padding: '2rem' }}>Loading...</div>}>
          <EmailVerification onDismissVerification={() => setHasPendingVerification(false)} />
        </React.Suspense>
      </BrowserRouter>
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

  const isPreview = typeof window !== 'undefined' && window.location.search.includes('preview=true');
  const activeSession = session || (isPreview ? { user: { id: 'demo-user', email: 'admin@staypilot.com' } } : null);
  const activeProfile = profile || (isPreview ? { role: 'tenant_admin', full_name: 'Resort Admin' } : null);

  return (
    <BrowserRouter>
      <Toaster position="top-right" />
      <ErrorBoundary>
      <React.Suspense fallback={<div style={{ padding: '2rem' }}>Loading...</div>}>
        <Routes>
          <Route 
            path="/auth" 
            element={
              activeSession && !isRecovering && !window.location.hash.includes('type=recovery') 
                ? <Navigate to={sessionStorage.getItem('staypilot_checkout_intent') ? `/subscription?checkout=${sessionStorage.getItem('staypilot_checkout_intent')}&intent=subscribe` : "/dashboard"} replace /> 
                : <Auth />
            } 
          />
          <Route path="/how-it-works" element={<HowItWorks />} />
          <Route path="/features" element={<Features />} />
          <Route path="/pricing" element={<Pricing />} />
          <Route path="/verify-email" element={<EmailVerification onDismissVerification={() => setHasPendingVerification(false)} />} />
          <Route path="/privacy" element={<PrivacyPolicy />} />
          
          <Route element={activeSession || isPreview ? <AppLayout /> : <Navigate to="/auth" replace />}>
            <Route path="dashboard" element={profile?.role === 'staff' ? <Navigate to="/bookings" replace /> : <Dashboard />} />
            <Route path="setup" element={<CottagesRooms />} />
            <Route path="bookings" element={<Bookings />} />
            <Route path="bookings/new" element={<BookingForm />} />
            <Route path="enquiries" element={<EnquiriesBoard />} />
            <Route path="enquiries/quick" element={<QuickEnquiryMobile />} />
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
            <Route path="settings" element={profile?.role === 'staff' ? <Navigate to="/bookings" replace /> : <Settings />} />
          </Route>

          <Route path="/" element={!activeSession && !isPreview ? (window.Capacitor?.isNativePlatform() ? <Navigate to="/auth" replace /> : <Home />) : (activeProfile?.role === 'staff' ? <Navigate to="/bookings" replace /> : <Navigate to="/dashboard" replace />)} />
          <Route path="/wizard" element={session ? <OnboardingWizard /> : <Navigate to="/auth" replace />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </React.Suspense>
      </ErrorBoundary>
    </BrowserRouter>
  );
}

export default App;
