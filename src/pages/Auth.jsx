import React, { useState, useEffect } from 'react';
import { useLocation, Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useSettingsStore } from '../lib/store';
import { LogIn, UserPlus, ShieldCheck, Mail, Lock, User, KeyRound, Eye, EyeOff } from 'lucide-react';
import { Preferences } from '@capacitor/preferences';

export default function Auth() {
  const { isRecovering, setIsRecovering } = useSettingsStore();
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);
  const [isLogin, setIsLogin] = useState(true);

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


  useEffect(() => {
    const initAuth = async () => {
      const savedEmail = await Preferences.get({ key: 'rememberMeEmail' });
      const savedPassword = await Preferences.get({ key: 'rememberMePassword' });
      if (savedEmail.value && savedPassword.value) {
        setFormData(prev => ({ ...prev, email: savedEmail.value, password: savedPassword.value }));
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
        
        if (rememberMe) {
          await Preferences.set({ key: 'rememberMeEmail', value: loginEmail });
          await Preferences.set({ key: 'rememberMePassword', value: formData.password });
        } else {
          await Preferences.remove({ key: 'rememberMeEmail' });
          await Preferences.remove({ key: 'rememberMePassword' });
        }
      } else {
        if (formData.password !== formData.confirmPassword) {
          throw new Error("Passwords do not match");
        }
        const { data: authData, error: authError } = await supabase.auth.signUp({
          email: formData.email,
          password: formData.password,
          options: {
            data: {
              full_name: formData.fullName,
              role: 'tenant_admin'
            }
          }
        });
        if (authError) throw authError;

        // Supabase returns an empty identities array if the email is already taken 
        // (when "Prevent Email Enumeration" is enabled in settings)
        if (authData?.user?.identities && authData.user.identities.length === 0) {
          throw new Error("An account with this email already exists. Please sign in instead.");
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
        justifyContent: 'center'
      }}>
        <div style={{ textAlign: 'center', marginBottom: isMobile ? '1.5rem' : '2rem' }}>
          <div style={{ margin: isMobile ? '0 auto 1.5rem' : '0 auto 2rem', display: 'flex', justifyContent: 'center' }}>
            <Link to="/" style={{ 
              display: 'inline-block', 
              background: '#ffffff', 
              padding: '1.25rem', 
              borderRadius: '24px', 
              boxShadow: '0 10px 25px -5px rgba(0,0,0,0.1), 0 8px 10px -6px rgba(0,0,0,0.05)',
              border: '1px solid rgba(0,0,0,0.05)'
            }}>
              <img src="/stay-pilot-logo-full.jpg" alt="Stay Pilot Logo" style={{ width: '100%', maxWidth: isMobile ? '120px' : '180px', height: 'auto', objectFit: 'contain', display: 'block' }} />
            </Link>
          </div>
          <h1 style={{ fontSize: isMobile ? '1.5rem' : '2rem', color: 'var(--text-main)', marginBottom: '0.5rem' }}>
            {isRecovering ? 'Reset Password' : (isForgotPassword ? 'Reset Password' : (isLogin ? 'Welcome to Stay Pilot' : 'Create an Account'))}
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: isMobile ? '0.9rem' : '1rem' }}>
            {isRecovering 
              ? 'Enter your new secure password below'
              : (isForgotPassword 
                ? 'Enter your email to receive a reset link' 
                : (isLogin ? 'Sign in to manage your property.' : 'Register your hotel owner account to get started'))}
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
            {loading ? 'Processing...' : (isRecovering ? 'Update Password' : (isForgotPassword ? 'Send Reset Link' : (isLogin ? <><LogIn size={20} /> Sign In</> : <><UserPlus size={20} /> Create Account</>)))}
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
                onClick={() => setIsLogin(!isLogin)}
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
