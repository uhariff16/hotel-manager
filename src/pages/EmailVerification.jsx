import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useSettingsStore } from '../lib/store';
import { CheckCircle2, AlertTriangle, Mail, ArrowRight, Loader2, RefreshCw } from 'lucide-react';
import toast from 'react-hot-toast';

export default function EmailVerification({ onDismissVerification }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { session, profile, resorts } = useSettingsStore();

  const [status, setStatus] = useState('verifying'); // 'verifying' | 'success' | 'error' | 'idle'
  const [errorMessage, setErrorMessage] = useState('');
  const [verifiedEmail, setVerifiedEmail] = useState('');
  const [resendEmail, setResendEmail] = useState('');
  const [isResending, setIsResending] = useState(false);
  const [resendSuccess, setResendSuccess] = useState(false);
  const [isMobile, setIsMobile] = useState(typeof window !== 'undefined' && window.innerWidth <= 768);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth <= 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    let mounted = true;

    const parseVerification = async () => {
      // 1. Parse hash and query parameters safely
      const hash = window.location.hash ? window.location.hash.replace(/^#/, '') : '';
      const search = window.location.search ? window.location.search.replace(/^\?/, '') : '';
      const hashParams = new URLSearchParams(hash);
      const searchParams = new URLSearchParams(search);

      const error = hashParams.get('error') || searchParams.get('error');
      const errorCode = hashParams.get('error_code') || searchParams.get('error_code');
      const errorDesc = hashParams.get('error_description') || searchParams.get('error_description');
      const type = hashParams.get('type') || searchParams.get('type');
      const accessToken = hashParams.get('access_token') || searchParams.get('access_token');
      const code = hashParams.get('code') || searchParams.get('code');

      // Check session storage for persisting verified state across reloads
      const storedSuccess = sessionStorage.getItem('staypilot_email_verified');
      const storedEmail = sessionStorage.getItem('staypilot_verified_email');

      // 2. Handle Explicit Error from Supabase Auth (e.g. otp_expired, access_denied)
      if (error || errorCode) {
        if (!mounted) return;
        setStatus('error');
        const formattedDesc = errorDesc 
          ? decodeURIComponent(errorDesc.replace(/\+/g, ' '))
          : (errorCode === 'otp_expired' ? 'This verification link has expired.' : 'The verification link is invalid or has already been used.');
        setErrorMessage(formattedDesc);
        // Clean URL history to avoid exposing error params or replay attacks
        window.history.replaceState({}, document.title, window.location.pathname);
        return;
      }

      // 3. Handle Active Verification Tokens (type=signup, type=invite, type=email_change, code, or access_token)
      if (type === 'signup' || type === 'invite' || type === 'email_change' || accessToken || code) {
        try {
          // Give Supabase client a moment to parse hash into session
          const { data: { session: currentSession }, error: sessionErr } = await supabase.auth.getSession();

          if (sessionErr) {
            if (!mounted) return;
            setStatus('error');
            setErrorMessage(sessionErr.message || 'Unable to complete verification.');
            window.history.replaceState({}, document.title, window.location.pathname);
            return;
          }

          if (currentSession?.user) {
            if (!mounted) return;
            const email = currentSession.user.email || '';
            setStatus('success');
            setVerifiedEmail(email);
            sessionStorage.setItem('staypilot_email_verified', 'true');
            sessionStorage.setItem('staypilot_verified_email', email);
            // Clean up access_token and refresh_token from browser address bar immediately
            window.history.replaceState({}, document.title, window.location.pathname);
            return;
          } else {
            // Check via onAuthStateChange listener
            const { data: { subscription } } = supabase.auth.onAuthStateChange((event, authSession) => {
              if (!mounted) return;
              if ((event === 'SIGNED_IN' || event === 'USER_UPDATED') && authSession?.user) {
                setStatus('success');
                const userEmail = authSession.user.email || '';
                setVerifiedEmail(userEmail);
                sessionStorage.setItem('staypilot_email_verified', 'true');
                sessionStorage.setItem('staypilot_verified_email', userEmail);
                window.history.replaceState({}, document.title, window.location.pathname);
                subscription.unsubscribe();
              }
            });

            // Timeout fallback: if no session was resolved after 3.5 seconds
            setTimeout(() => {
              if (mounted && status === 'verifying') {
                setStatus('error');
                setErrorMessage('Email verification link is invalid, expired, or has already been processed.');
                window.history.replaceState({}, document.title, window.location.pathname);
              }
            }, 3500);
            return;
          }
        } catch (e) {
          if (!mounted) return;
          setStatus('error');
          setErrorMessage('Unexpected error during email verification.');
          window.history.replaceState({}, document.title, window.location.pathname);
          return;
        }
      }

      // 4. Handle Page Refresh with Stored Verification
      if (storedSuccess === 'true') {
        if (!mounted) return;
        setStatus('success');
        setVerifiedEmail(storedEmail || session?.user?.email || '');
        return;
      }

      // 5. Direct access without verification proof
      if (!mounted) return;
      setStatus('idle');
    };

    parseVerification();

    return () => {
      mounted = false;
    };
  }, []);

  const handleSignInClick = (e) => {
    // Clear session storage flags
    sessionStorage.removeItem('staypilot_email_verified');
    sessionStorage.removeItem('staypilot_verified_email');

    if (onDismissVerification) {
      onDismissVerification();
    }

    // Determine destination
    const currentSession = session || useSettingsStore.getState().session;
    const currentProfile = profile || useSettingsStore.getState().profile;
    const currentResorts = resorts || useSettingsStore.getState().resorts;

    const hasExistingProperties = Boolean(
      currentResorts && currentResorts.length > 0 &&
      (currentResorts.length > 1 || (currentResorts[0] && (currentResorts[0].cottagesCount > 0 || currentResorts[0].roomsCount > 0)))
    );

    // If on native platform (Android Capacitor)
    if (window.Capacitor?.isNativePlatform()) {
      navigate('/auth', { replace: true });
      return;
    }

    // If an authenticated session exists, transition to the authenticated journey
    if (currentSession) {
      if (currentProfile?.role === 'tenant_admin' && !hasExistingProperties) {
        navigate('/dashboard', { replace: true }); // AppLayout will cleanly present OnboardingWizard post sign-in
      } else {
        navigate('/dashboard', { replace: true });
      }
    } else {
      // Unauthenticated: navigate to /auth sign-in screen
      navigate('/auth', { replace: true });
    }
  };

  const handleResendVerification = async (e) => {
    e.preventDefault();
    if (!resendEmail || !resendEmail.includes('@')) {
      toast.error('Please enter a valid email address');
      return;
    }

    setIsResending(true);
    try {
      const { error } = await supabase.auth.resend({
        type: 'signup',
        email: resendEmail.trim(),
        options: {
          emailRedirectTo: `${window.location.origin}/verify-email`
        }
      });

      if (error) throw error;
      setResendSuccess(true);
      toast.success('Verification link resent successfully! Please check your email.');
    } catch (err) {
      toast.error(err.message || 'Failed to resend verification email.');
    } finally {
      setIsResending(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'linear-gradient(135deg, rgba(11, 26, 20, 0.88) 0%, rgba(15, 44, 89, 0.92) 100%), url(/hotel_auth_bg.jpg) center/cover no-repeat fixed',
      padding: isMobile ? '1.5rem 1rem' : '2.5rem 1.5rem',
      fontFamily: "'Plus Jakarta Sans', sans-serif"
    }}>
      <div style={{
        width: '100%',
        maxWidth: isMobile ? '100%' : '460px',
        background: '#ffffff',
        borderRadius: '20px',
        padding: isMobile ? '2rem 1.5rem' : '2.75rem 2.25rem',
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25), 0 0 1px 1px rgba(255, 255, 255, 0.1)',
        textAlign: 'center',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center'
      }}>
        {/* Stay Pilot Branding */}
        <div style={{ marginBottom: '2rem' }}>
          <div style={{
            display: 'inline-block',
            background: '#f8fafc',
            padding: '0.65rem 1.15rem',
            borderRadius: '16px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.04)',
            border: '1px solid rgba(0,0,0,0.06)'
          }}>
            <img 
              src="/stay-pilot-logo-full.jpg" 
              alt="Stay Pilot" 
              style={{ width: isMobile ? '115px' : '135px', height: 'auto', display: 'block' }} 
            />
          </div>
        </div>

        {/* 1. VERIFYING STATE */}
        {status === 'verifying' && (
          <div style={{ padding: '1.5rem 0' }}>
            <Loader2 
              className="animate-spin" 
              size={48} 
              style={{ color: '#10b981', margin: '0 auto 1.5rem auto' }} 
            />
            <h1 style={{ fontSize: '1.5rem', fontWeight: '700', color: '#0f172a', marginBottom: '0.75rem' }}>
              Verifying Your Email...
            </h1>
            <p style={{ color: '#64748b', fontSize: '0.95rem', lineHeight: '1.5' }}>
              Please wait while we confirm your Stay Pilot account.
            </p>
          </div>
        )}

        {/* 2. SUCCESS STATE */}
        {status === 'success' && (
          <div style={{ width: '100%' }}>
            {/* Success Icon */}
            <div style={{
              background: '#ecfdf5',
              border: '2px solid #a7f3d0',
              color: '#059669',
              width: '72px',
              height: '72px',
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 1.5rem auto'
            }}>
              <CheckCircle2 size={40} strokeWidth={2.5} />
            </div>

            {/* Heading */}
            <h1 style={{ 
              fontSize: isMobile ? '1.5rem' : '1.75rem', 
              fontWeight: '800', 
              color: '#0f172a', 
              marginBottom: '0.75rem',
              letterSpacing: '-0.02em'
            }}>
              Email Verified Successfully!
            </h1>

            {/* Description */}
            <p style={{ 
              color: '#475569', 
              fontSize: '1rem', 
              lineHeight: '1.6', 
              marginBottom: '1.75rem' 
            }}>
              Your Stay Pilot account has been verified. You can now sign in to continue.
            </p>

            {verifiedEmail && (
              <div style={{
                background: '#f8fafc',
                border: '1px solid #e2e8f0',
                borderRadius: '10px',
                padding: '0.6rem 1rem',
                marginBottom: '1.75rem',
                fontSize: '0.875rem',
                color: '#334155',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.5rem'
              }}>
                <Mail size={16} color="#64748b" />
                <span style={{ fontWeight: '600' }}>{verifiedEmail}</span>
              </div>
            )}

            {/* Primary Sign-In Button with Android App Link */}
            <a
              href="https://staypilot.co.in/auth"
              onClick={handleSignInClick}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.5rem',
                width: '100%',
                background: '#0F2C59',
                color: '#ffffff',
                padding: '0.875rem 1.5rem',
                borderRadius: '12px',
                fontWeight: '700',
                fontSize: '1rem',
                textDecoration: 'none',
                boxShadow: '0 4px 14px rgba(15, 44, 89, 0.25)',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                border: 'none',
                boxSizing: 'border-box'
              }}
            >
              <span>Sign In to Stay Pilot</span>
              <ArrowRight size={18} />
            </a>
          </div>
        )}

        {/* 3. ERROR STATE */}
        {status === 'error' && (
          <div style={{ width: '100%' }}>
            {/* Error Icon */}
            <div style={{
              background: '#fef2f2',
              border: '2px solid #fecaca',
              color: '#dc2626',
              width: '72px',
              height: '72px',
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 1.5rem auto'
            }}>
              <AlertTriangle size={38} strokeWidth={2.2} />
            </div>

            {/* Heading */}
            <h1 style={{ 
              fontSize: isMobile ? '1.4rem' : '1.65rem', 
              fontWeight: '800', 
              color: '#0f172a', 
              marginBottom: '0.75rem',
              letterSpacing: '-0.02em'
            }}>
              Verification Link Expired or Invalid
            </h1>

            {/* Description */}
            <p style={{ 
              color: '#64748b', 
              fontSize: '0.95rem', 
              lineHeight: '1.5', 
              marginBottom: '1.5rem' 
            }}>
              {errorMessage || 'This email verification link is invalid, has expired, or has already been used. Please sign in or request a new verification link below.'}
            </p>

            {/* Primary Action: Go to Sign In */}
            <a
              href="https://staypilot.co.in/auth"
              onClick={(e) => {
                e.preventDefault();
                navigate('/auth', { replace: true });
              }}
              style={{
                display: 'block',
                width: '100%',
                background: '#0F2C59',
                color: '#ffffff',
                padding: '0.875rem 1.5rem',
                borderRadius: '12px',
                fontWeight: '700',
                fontSize: '1rem',
                textDecoration: 'none',
                boxShadow: '0 4px 14px rgba(15, 44, 89, 0.25)',
                cursor: 'pointer',
                marginBottom: '1.25rem',
                boxSizing: 'border-box'
              }}
            >
              Sign In to Stay Pilot
            </a>

            {/* Resend Verification Form */}
            <div style={{
              background: '#f8fafc',
              border: '1px solid #e2e8f0',
              borderRadius: '14px',
              padding: '1.25rem',
              marginTop: '0.5rem',
              textAlign: 'left'
            }}>
              <p style={{ 
                fontSize: '0.875rem', 
                fontWeight: '600', 
                color: '#334155', 
                marginBottom: '0.75rem' 
              }}>
                Need a new verification link?
              </p>
              
              {resendSuccess ? (
                <div style={{ 
                  color: '#059669', 
                  fontSize: '0.85rem', 
                  fontWeight: '600',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.4rem'
                }}>
                  <CheckCircle2 size={16} />
                  <span>New verification email sent! Check your inbox.</span>
                </div>
              ) : (
                <form onSubmit={handleResendVerification} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  <input
                    type="email"
                    placeholder="Enter your email address"
                    value={resendEmail}
                    onChange={(e) => setResendEmail(e.target.value)}
                    required
                    style={{
                      width: '100%',
                      padding: '0.65rem 0.85rem',
                      borderRadius: '8px',
                      border: '1px solid #cbd5e1',
                      fontSize: '0.875rem',
                      boxSizing: 'border-box'
                    }}
                  />
                  <button
                    type="submit"
                    disabled={isResending}
                    style={{
                      background: '#10b981',
                      color: '#ffffff',
                      border: 'none',
                      padding: '0.65rem 1rem',
                      borderRadius: '8px',
                      fontWeight: '700',
                      fontSize: '0.875rem',
                      cursor: isResending ? 'not-allowed' : 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '0.4rem'
                    }}
                  >
                    {isResending ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={15} />}
                    <span>{isResending ? 'Sending...' : 'Resend Verification Email'}</span>
                  </button>
                </form>
              )}
            </div>
          </div>
        )}

        {/* 4. IDLE / DIRECT ACCESS WITHOUT PROOF */}
        {status === 'idle' && (
          <div style={{ width: '100%' }}>
            <div style={{
              background: '#f0f9ff',
              border: '2px solid #bae6fd',
              color: '#0284c7',
              width: '72px',
              height: '72px',
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 1.5rem auto'
            }}>
              <Mail size={38} strokeWidth={2.2} />
            </div>

            <h1 style={{ 
              fontSize: isMobile ? '1.4rem' : '1.65rem', 
              fontWeight: '800', 
              color: '#0f172a', 
              marginBottom: '0.75rem' 
            }}>
              Verify Your Email
            </h1>

            <p style={{ 
              color: '#64748b', 
              fontSize: '0.95rem', 
              lineHeight: '1.5', 
              marginBottom: '1.75rem' 
            }}>
              Please click the confirmation link sent to your email address to verify your account.
            </p>

            <a
              href="https://staypilot.co.in/auth"
              onClick={(e) => {
                e.preventDefault();
                navigate('/auth', { replace: true });
              }}
              style={{
                display: 'block',
                width: '100%',
                background: '#0F2C59',
                color: '#ffffff',
                padding: '0.875rem 1.5rem',
                borderRadius: '12px',
                fontWeight: '700',
                fontSize: '1rem',
                textDecoration: 'none',
                boxShadow: '0 4px 14px rgba(15, 44, 89, 0.25)',
                cursor: 'pointer',
                boxSizing: 'border-box'
              }}
            >
              Sign In to Stay Pilot
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
