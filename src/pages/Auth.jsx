import React, { useState, useEffect, useMemo } from 'react';
import { useLocation, Link, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useSettingsStore } from '../lib/store';
import { LogIn, UserPlus, ShieldCheck, Mail, Lock, User, KeyRound, Eye, EyeOff, Loader2, CheckCircle2, Sparkles } from 'lucide-react';
import { Preferences } from '@capacitor/preferences';
import { resolveEffectivePlan } from '../utils/planEntitlements';

export default function Auth() {
  const location = useLocation();
  const navigate = useNavigate();
  const { isRecovering, setIsRecovering, isDataLoaded, globalPlans } = useSettingsStore();
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);
  const [isLogin, setIsLogin] = useState(() => {
    return !(location.search.includes('mode=signup') || location.state?.isSignUp);
  });

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth <= 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);
  const [isForgotPassword, setIsForgotPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [message, setMessage] = useState(null);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    confirmPassword: '',
    fullName: ''
  });

  const [rememberMe, setRememberMe] = useState(false);

  const isPromoActive = (plan) => {
    if (!plan || !plan.offerPrice || plan.offerActive === false) return false;
    const now = new Date().setHours(0, 0, 0, 0);
    if (plan.offerStartDate) {
      const start = new Date(plan.offerStartDate).setHours(0, 0, 0, 0);
      if (now < start) return false;
    }
    if (plan.offerEndDate) {
      const end = new Date(plan.offerEndDate).setHours(23, 59, 59, 999);
      if (now > end) return false;
    }
    return true;
  };

  const planParam = new URLSearchParams(location.search).get('plan');
  const intentParam = new URLSearchParams(location.search).get('intent');
  const isSubscribeIntent = intentParam === 'subscribe' || Boolean(sessionStorage.getItem('staypilot_checkout_intent'));

  const planInfo = useMemo(() => {
    if (!planParam || !isDataLoaded || !globalPlans) return null;
    const resolved = resolveEffectivePlan(planParam, globalPlans);
    if (!resolved || resolved.isUnknownPlan || !resolved.planConfig) {
      return null;
    }
    const config = resolved.planConfig;

    if (config.enabled === false || config.status === 'disabled' || resolved.planKey === 'free' || config.key === 'free') {
      return null;
    }

    const promoActive = isPromoActive(config);
    const regularPrice = Number(config.price || 0);
    const promoPrice = Number(config.offerPrice || 0);
    const currentPrice = promoActive && promoPrice > 0 ? promoPrice : regularPrice;
    const trialDays = config.trialDurationDays ? Number(config.trialDurationDays) : 30;

    return {
      key: resolved.planKey,
      name: config.name || resolved.planKey,
      regularPrice,
      promoPrice,
      hasPromo: promoActive && promoPrice > 0,
      currentPrice,
      trialDays,
      maxProperties: config.maxResorts ?? config.maxProperties ?? 1,
      maxRooms: config.maxRooms ?? 'Unlimited',
      maxStaff: config.maxStaff ?? 'Unlimited',
    };
  }, [planParam, globalPlans, isDataLoaded]);

  useEffect(() => {
    if (!isLogin && !isForgotPassword && !isRecovering && isDataLoaded) {
      if (!planInfo) {
        navigate('/pricing', { replace: true });
      }
    }
  }, [isLogin, isForgotPassword, isRecovering, isDataLoaded, planInfo, navigate]);


  useEffect(() => {
    const initAuth = async () => {
      const savedEmail = await Preferences.get({ key: 'rememberMeEmail' });
      const savedPassword = await Preferences.get({ key: 'rememberMePassword' });
      if (savedEmail.value && savedPassword.value) {
        let displayValue = savedEmail.value;
        if (displayValue.endsWith('@staff.local')) {
          displayValue = displayValue.replace('@staff.local', '');
        }
        setFormData(prev => ({ ...prev, email: displayValue, password: savedPassword.value }));
        setRememberMe(true);
      }
    };
    initAuth();
  }, []);

  const handleAuth = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setMessage(null);

    try {
      if (isRecovering) {
        if (formData.password !== formData.confirmPassword) {
          throw new Error("Passwords do not match");
        }
        const { error } = await supabase.auth.updateUser({ 
          password: formData.password 
        });
        if (error) throw error;
        
        // Force sign out so user has to log in with new password
        await supabase.auth.signOut();
        
        setMessage("Password updated successfully! Please sign in with your new password.");
        setIsRecovering(false);
        setIsLogin(true);
        setFormData(prev => ({ ...prev, password: '', confirmPassword: '' }));
      } else if (isForgotPassword) {
        const { error } = await supabase.auth.resetPasswordForEmail(formData.email, {
          redirectTo: `${window.location.origin}/auth`,
        });
        if (error) throw error;
        setMessage("Password reset link sent to your email!");
      } else if (isLogin) {
        let loginEmail = formData.email.trim();
        if (!loginEmail.includes('@')) {
          loginEmail = `${loginEmail.toLowerCase()}@staff.local`;
        }
        const { error } = await supabase.auth.signInWithPassword({
          email: loginEmail,
          password: formData.password,
        });
        if (error) throw error;
        
        const storedIntentPlan = sessionStorage.getItem('staypilot_checkout_intent') || planParam;
        if (isSubscribeIntent && storedIntentPlan) {
          if (rememberMe) {
            await Preferences.set({ key: 'rememberMeEmail', value: formData.email.trim() });
            await Preferences.set({ key: 'rememberMePassword', value: formData.password });
          }
          navigate(`/subscription?checkout=${storedIntentPlan}&intent=subscribe`, { replace: true });
          return;
        }

        if (rememberMe) {
          await Preferences.set({ key: 'rememberMeEmail', value: formData.email.trim() });
          await Preferences.set({ key: 'rememberMePassword', value: formData.password });
        } else {
          await Preferences.remove({ key: 'rememberMeEmail' });
          await Preferences.remove({ key: 'rememberMePassword' });
        }
      } else {
        const planFromUrl = new URLSearchParams(location.search).get('plan');
        if (!planFromUrl) {
          throw new Error("No plan selected. Please go to the Pricing page and choose a plan to get started.");
        }

        if (formData.password !== formData.confirmPassword) {
          throw new Error("Passwords do not match");
        }

        const { data: authData, error: authError } = await supabase.auth.signUp({
          email: formData.email,
          password: formData.password,
          options: {
            data: {
              full_name: formData.fullName,
              role: 'tenant_admin',
              plan_type: planFromUrl
            }
          }
        });
        if (authError) throw authError;

        // Supabase returns an empty identities array if the email is already taken 
        // (when "Prevent Email Enumeration" is enabled in settings)
        if (authData?.user?.identities && authData.user.identities.length === 0) {
          throw new Error("An account with this email already exists. Please sign in instead.");
        }

        if (isSubscribeIntent && planFromUrl) {
          sessionStorage.setItem('staypilot_checkout_intent', planFromUrl);
        }
        setMessage("Signup successful! Please check your email for a verification link before signing in.");
        setIsLogin(true);
        setFormData(prev => ({ ...prev, password: '', confirmPassword: '' }));
      }
    } catch (err) {
      if (err.message === 'Email not confirmed') {
        setError('Please verify your email address before signing in.');
      } else {
        setError(err.message);
      }
    } finally {
      setLoading(false);
    }
  };

  if (!isLogin && !isForgotPassword && !isRecovering && !isDataLoaded) {
    return (
      <div style={{ 
        minHeight: '100vh', 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center', 
        background: isMobile 
          ? 'var(--bg-color)' 
          : 'linear-gradient(rgba(17,20,24,0.6), rgba(17,20,24,0.8)), url(/hotel_auth_bg.jpg) center/cover no-repeat',
        padding: isMobile ? '0' : '1.5rem'
      }}>
        <div className="card" style={{ 
          width: '100%', 
          maxWidth: isMobile ? '100%' : '450px', 
          minHeight: isMobile ? '100vh' : 'auto',
          padding: isMobile ? '2rem 1.5rem' : '2.5rem', 
          border: isMobile ? 'none' : undefined,
          boxShadow: isMobile ? 'none' : undefined,
          borderRadius: isMobile ? '0' : undefined,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '1rem',
          textAlign: 'center'
        }}>
          <Loader2 className="animate-spin" size={36} style={{ color: 'var(--primary)' }} />
          <p style={{ color: 'var(--text-muted)', fontSize: '0.95rem' }}>Loading plan information...</p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ 
      minHeight: '100vh', 
      display: 'flex', 
      alignItems: 'center', 
      justifyContent: 'center', 
      background: isMobile 
        ? 'var(--bg-color)' 
        : 'linear-gradient(135deg, rgba(11, 26, 20, 0.88) 0%, rgba(15, 44, 89, 0.92) 100%), url(/hotel_auth_bg.jpg) center/cover no-repeat fixed',
      padding: isMobile ? '1rem 0.75rem' : '2.5rem 1.5rem',
      paddingTop: 'calc(1rem + env(safe-area-inset-top, 0px))',
      paddingBottom: 'calc(1rem + env(safe-area-inset-bottom, 0px))'
    }}>
      <div className="card" style={{ 
        width: '100%', 
        maxWidth: isMobile ? '100%' : (isLogin || isForgotPassword || isRecovering ? '460px' : '560px'), 
        background: 'var(--card-bg)',
        padding: isMobile ? '1.5rem 1.25rem' : '2.5rem 2.25rem', 
        border: isMobile ? '1px solid rgba(0,0,0,0.06)' : '1px solid rgba(255, 255, 255, 0.1)',
        boxShadow: isMobile ? '0 4px 20px rgba(0,0,0,0.04)' : '0 25px 50px -12px rgba(0, 0, 0, 0.25), 0 0 1px 1px rgba(255, 255, 255, 0.1)',
        borderRadius: isMobile ? '16px' : '20px',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center'
      }}>
        <div style={{ textAlign: 'center', marginBottom: isMobile ? '1.5rem' : '2rem' }}>
          <div style={{ margin: isMobile ? '0 auto 1.5rem' : '0 auto 2rem', display: 'flex', justifyContent: 'center' }}>
            <Link to="/" style={{ 
              display: 'inline-block', 
              background: 'var(--bg-secondary)', 
              padding: '0.65rem 1.15rem', 
              borderRadius: '16px', 
              boxShadow: '0 4px 12px rgba(0,0,0,0.04)',
              border: '1px solid rgba(0,0,0,0.06)'
            }}>
              <img src="/stay-pilot-logo-full.jpg" alt="Stay Pilot Logo" style={{ width: isMobile ? '110px' : '135px', height: 'auto', display: 'block' }} />
            </Link>
          </div>
          <h1 style={{ fontSize: isMobile ? '1.5rem' : '2rem', color: 'var(--text-main)', marginBottom: '0.5rem' }}>
            {isRecovering ? 'Set New Password' : (isForgotPassword ? 'Reset Password' : (isLogin ? 'Welcome to Stay Pilot' : 'Create Your Account'))}
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: isMobile ? '0.9rem' : '1rem' }}>
            {isRecovering 
              ? 'Enter your new secure password below'
              : (isForgotPassword 
                ? 'Enter your email to receive a reset link' 
                : (isLogin ? 'Sign in to manage your property.' : (isSubscribeIntent ? 'Create your account to continue to secure payment.' : 'Start your Stay Pilot trial and set up your property.')))}
          </p>
        </div>

        {error && (
          <div style={{ 
            background: 'rgba(229, 62, 62, 0.1)', 
            border: '1px solid var(--danger)', 
            color: 'var(--danger)', 
            padding: '1rem', 
            borderRadius: 'var(--radius-md)', 
            marginBottom: '1.5rem',
            fontSize: '0.875rem'
          }}>
            {error}
          </div>
        )}

        {message && (
          <div style={{ 
            background: 'rgba(72, 187, 120, 0.1)', 
            border: '1px solid #48bb78', 
            color: '#48bb78', 
            padding: '1rem', 
            borderRadius: 'var(--radius-md)', 
            marginBottom: '1.5rem',
            fontSize: '0.875rem'
          }}>
            {message}
          </div>
        )}

        {!isLogin && !isForgotPassword && !isRecovering && planInfo && (
          <div style={{
            background: 'rgba(255, 255, 255, 0.04)',
            border: '1px solid var(--border-color, rgba(255,255,255,0.12))',
            borderRadius: '12px',
            padding: '1rem 1.25rem',
            marginBottom: '1.25rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.75rem'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.5rem' }}>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
                  <span style={{ fontWeight: '700', fontSize: '1.05rem', color: 'var(--text-main)' }}>
                    {planInfo.name} Plan
                  </span>
                  {planInfo.hasPromo && (
                    <span style={{
                      background: 'rgba(234, 179, 8, 0.15)',
                      color: '#eab308',
                      fontSize: '0.75rem',
                      fontWeight: '600',
                      padding: '0.15rem 0.5rem',
                      borderRadius: '999px',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.25rem',
                      whiteSpace: 'nowrap'
                    }}>
                      <Sparkles size={12} /> Special Offer
                    </span>
                  )}
                </div>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '0.25rem', margin: 0 }}>
                  {planInfo.maxProperties} {planInfo.maxProperties === 1 ? 'Property' : 'Properties'} • {planInfo.maxRooms} Rooms • {planInfo.maxStaff} Staff
                </p>
              </div>
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                <div style={{ fontSize: '1.1rem', fontWeight: '700', color: 'var(--primary)', whiteSpace: 'nowrap' }}>
                  ₹{planInfo.currentPrice.toLocaleString('en-IN')}
                  <span style={{ fontSize: '0.75rem', fontWeight: 'normal', color: 'var(--text-muted)' }}>/mo</span>
                </div>
                {planInfo.hasPromo && planInfo.regularPrice > 0 && (
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textDecoration: 'line-through', whiteSpace: 'nowrap' }}>
                    ₹{planInfo.regularPrice.toLocaleString('en-IN')}/mo
                  </div>
                )}
              </div>
            </div>

            <div style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: '0.5rem 1rem',
              fontSize: '0.8rem',
              color: 'var(--text-muted)',
              paddingTop: '0.5rem',
              borderTop: '1px dashed var(--border-color, rgba(255,255,255,0.1))'
            }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', color: '#48bb78', fontWeight: '500' }}>
                <CheckCircle2 size={14} /> {isSubscribeIntent ? 'Direct Paid Subscription Setup' : `${planInfo.trialDays}-day free trial`}
              </span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                <CheckCircle2 size={14} /> {isSubscribeIntent ? 'Secure Razorpay Checkout Next' : 'No card required today'}
              </span>
            </div>

            <div style={{ textAlign: 'right', marginTop: '-0.25rem' }}>
              <button
                type="button"
                onClick={() => navigate('/pricing')}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--primary)',
                  fontSize: '0.8rem',
                  fontWeight: '600',
                  cursor: 'pointer',
                  padding: 0,
                  textDecoration: 'underline'
                }}
              >
                Change Plan
              </button>
            </div>
          </div>
        )}

        <form onSubmit={handleAuth} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {!isLogin && !isForgotPassword && !isRecovering && (
            <div className="form-group">
              <label className="form-label">Full Name</label>
              <div style={{ position: 'relative' }}>
                <span style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }}>
                  <User size={18} />
                </span>
                <input 
                  type="text" 
                  required 
                  className="form-input" 
                  style={{ paddingLeft: '3rem' }}
                  placeholder="John Doe"
                  value={formData.fullName}
                  onChange={e => setFormData({...formData, fullName: e.target.value})}
                />
              </div>
            </div>
          )}

          {!isRecovering && (
            <div className="form-group">
              <label className="form-label">{isLogin ? 'Email or Username' : 'Email Address'}</label>
              <div style={{ position: 'relative' }}>
                <span style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }}>
                  {isLogin && !formData.email.includes('@') && formData.email.length > 0 ? <User size={18} /> : <Mail size={18} />}
                </span>
                <input 
                  type={isLogin ? "text" : "email"} 
                  required 
                  className="form-input" 
                  style={{ paddingLeft: '3rem' }}
                  placeholder={isLogin ? "email@example.com or username" : "name@company.com"}
                  value={formData.email}
                  onChange={e => setFormData({...formData, email: e.target.value})}
                />
              </div>
            </div>
          )}

          {!isForgotPassword && (
            <div className="form-group">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                <label className="form-label" style={{ marginBottom: 0 }}>
                  {isRecovering ? 'New Password' : 'Password'}
                </label>
                {isLogin && (
                  <button 
                    type="button"
                    onClick={() => setIsForgotPassword(true)}
                    style={{ background: 'none', border: 'none', color: 'var(--primary)', fontSize: '0.875rem', cursor: 'pointer', padding: 0 }}
                  >
                    Forgot Password?
                  </button>
                )}
              </div>
              <div style={{ position: 'relative' }}>
                <span style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }}>
                  <Lock size={18} />
                </span>
                <input 
                  type={showPassword ? "text" : "password"} 
                  required 
                  className="form-input" 
                  style={{ paddingLeft: '3rem', paddingRight: '3rem' }}
                  placeholder="••••••••"
                  value={formData.password}
                  onChange={e => setFormData({...formData, password: e.target.value})}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  style={{
                    position: 'absolute',
                    right: '1rem',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'none',
                    border: 'none',
                    color: 'var(--text-muted)',
                    cursor: 'pointer',
                    padding: 0,
                    display: 'flex',
                    alignItems: 'center'
                  }}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
              {isLogin && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.75rem' }}>
                  <input 
                    type="checkbox" 
                    id="rememberMe" 
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                    style={{ width: 'auto', margin: 0, accentColor: 'var(--primary)' }}
                  />
                  <label htmlFor="rememberMe" style={{ fontSize: '0.875rem', color: 'var(--text-muted)', cursor: 'pointer' }}>
                    Remember Me
                  </label>
                </div>
              )}
            </div>
          )}

          {(isRecovering || (!isLogin && !isForgotPassword)) && (
            <div className="form-group">
              <label className="form-label">Confirm Password</label>
              <div style={{ position: 'relative' }}>
                <span style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }}>
                  <Lock size={18} />
                </span>
                <input 
                  type={showConfirmPassword ? "text" : "password"} 
                  required 
                  className="form-input" 
                  style={{ paddingLeft: '3rem', paddingRight: '3rem' }}
                  placeholder="••••••••"
                  value={formData.confirmPassword}
                  onChange={e => setFormData({...formData, confirmPassword: e.target.value})}
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  style={{
                    position: 'absolute',
                    right: '1rem',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'none',
                    border: 'none',
                    color: 'var(--text-muted)',
                    cursor: 'pointer',
                    padding: 0,
                    display: 'flex',
                    alignItems: 'center'
                  }}
                >
                  {showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>
          )}

          <button 
            type="submit" 
            className="btn btn-primary" 
            style={{ width: '100%', height: '50px', fontSize: '1rem', marginTop: '1rem' }}
            disabled={loading}
          >
            {loading ? 'Processing...' : (isRecovering ? 'Update Password' : (isForgotPassword ? 'Send Reset Link' : (isLogin ? <><LogIn size={20} /> Sign In</> : (isSubscribeIntent ? <><UserPlus size={20} /> Create Account & Continue to Payment</> : <><UserPlus size={20} /> Create Account & Start Free Trial</>))))}
          </button>
        </form>

        <div style={{ marginTop: '2rem', textAlign: 'center', fontSize: '0.875rem' }}>
          {isForgotPassword || isRecovering ? (
            <button 
              onClick={() => {
                setIsForgotPassword(false);
                setIsRecovering(false);
                setIsLogin(true);
              }}
              style={{ background: 'none', border: 'none', color: 'var(--primary)', fontWeight: '600', cursor: 'pointer', padding: '0' }}
            >
              Back to Login
            </button>
          ) : (
            <>
              <span style={{ color: 'var(--text-muted)' }}>
                {isLogin ? "Don't have an account? " : "Already have an account? "}
              </span>
              <button 
                onClick={() => {
                  if (isLogin) {
                    navigate('/pricing');
                  } else {
                    setIsLogin(true);
                  }
                }}
                style={{ 
                  background: 'none', 
                  border: 'none', 
                  color: 'var(--primary)', 
                  fontWeight: '600', 
                  cursor: 'pointer',
                  padding: '0'
                }}
              >
                {isLogin ? 'Sign Up' : 'Log In'}
              </button>
            </>
          )}
        </div>
        <div style={{ marginTop: '1.5rem', textAlign: 'center' }}>
          <Link to="/" style={{ color: 'var(--text-muted)', fontSize: '0.875rem', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
            &larr; Back to Home
          </Link>
        </div>
      </div>
    </div>
  );
}
