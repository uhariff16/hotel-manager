import React, { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { BookOpenCheck, CalendarDays, Wallet, TrendingUp, Users, Zap } from 'lucide-react';

export default function Features() {
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  return (
    <div style={{ fontFamily: 'var(--font-sans, system-ui, sans-serif)', overflowX: 'hidden' }}>
      <style>{`
        .bento-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          grid-auto-rows: 250px;
          gap: 1.5rem;
        }
        .bento-item {
          background: #ffffff;
          border: 1px solid #e2e8f0;
          border-radius: 24px;
          padding: 2rem;
          display: flex;
          flex-direction: column;
          overflow: hidden;
          position: relative;
          box-shadow: 0 10px 30px -10px rgba(0,0,0,0.05);
          transition: transform 0.3s ease;
        }
        .bento-item:hover {
          transform: translateY(-5px);
          box-shadow: 0 20px 40px -10px rgba(0,0,0,0.1);
        }
        .bento-item.large {
          grid-column: span 2;
        }
        @media (max-width: 768px) {
          .bento-grid {
            grid-template-columns: 1fr;
            grid-auto-rows: auto;
          }
          .bento-item.large {
            grid-column: span 1;
          }
        }
      `}</style>

      {/* Header */}
      {/* Header */}
      <header style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center', 
        padding: '1.25rem 2rem', 
        background: 'rgba(255, 255, 255, 0.75)',
        backdropFilter: 'blur(16px)',
        borderBottom: '1px solid rgba(255, 255, 255, 0.4)',
        position: 'sticky',
        top: 0,
        zIndex: 50,
        boxShadow: '0 4px 30px rgba(0, 0, 0, 0.02)'
      }}>
        <Link to="/" style={{ display: 'flex', alignItems: 'center', textDecoration: 'none' }}>
          <img src="/stay-pilot-logo.png" alt="Stay Pilot Logo" style={{ height: '36px', width: 'auto', display: 'block' }} />
        </Link>
        
        <nav className="desktop-nav" style={{ display: 'flex', gap: '2.5rem', alignItems: 'center', fontWeight: 600, color: '#334155', fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
          <Link to="/" style={{ color: 'inherit', textDecoration: 'none', transition: 'color 0.2s' }} onMouseOver={e => e.target.style.color = '#059669'} onMouseOut={e => e.target.style.color = 'inherit'}>Home</Link>
          <Link to="/features" style={{ color: '#059669', textDecoration: 'none' }}>Features</Link>
          <Link to="/how-it-works" style={{ color: 'inherit', textDecoration: 'none', transition: 'color 0.2s' }} onMouseOver={e => e.target.style.color = '#059669'} onMouseOut={e => e.target.style.color = 'inherit'}>How It Works</Link>
          <Link to="/pricing" style={{ color: 'inherit', textDecoration: 'none', transition: 'color 0.2s' }} onMouseOver={e => e.target.style.color = '#059669'} onMouseOut={e => e.target.style.color = 'inherit'}>Pricing</Link>
        </nav>

        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          <Link to="/auth" className="desktop-btn" style={{ padding: '0.5rem 1rem', fontWeight: 600, color: '#0F2C59', textDecoration: 'none', fontFamily: "'Plus Jakarta Sans', sans-serif" }}>Sign In</Link>
          <Link to="/auth?mode=signup" className="btn" style={{ padding: '0.65rem 1.6rem', fontWeight: 700, borderRadius: '8px', color: 'white', background: 'linear-gradient(135deg, #059669 0%, #10b981 100%)', border: 'none', boxShadow: '0 4px 15px rgba(5, 150, 105, 0.25)', textDecoration: 'none', fontFamily: "'Plus Jakarta Sans', sans-serif" }}>Get Started</Link>
        </div>
      </header>

      {/* HERO SECTION FOR FEATURES (DARK) */}
      <section style={{ padding: '5rem 2rem 8rem', textAlign: 'center', background: 'radial-gradient(circle at top center, #064e3b 0%, #020617 100%)', color: 'white', position: 'relative' }}>
        <div style={{ maxWidth: '800px', margin: '0 auto', position: 'relative', zIndex: 1 }}>
          <h1 style={{ fontSize: 'clamp(2.5rem, 5vw, 3.8rem)', fontWeight: 800, color: 'white', lineHeight: 1.15, marginBottom: '1.5rem', fontFamily: "'Outfit', sans-serif", letterSpacing: '-0.02em', background: 'linear-gradient(135deg, #34d399 0%, #38bdf8 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>
            Everything you need to scale.
          </h1>
          <p style={{ fontSize: '1.25rem', color: '#94a3b8', lineHeight: 1.6, maxWidth: '600px', margin: '0 auto', fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
            Stop managing your property in pieces. Bring your bookings, finances, and team into one powerful platform.
          </p>
        </div>
        
        {/* Curved SVG Divider to blend into light section */}
        <div style={{ position: 'absolute', bottom: 0, left: 0, width: '100%', overflow: 'hidden', lineHeight: 0, transform: 'translateY(1px)' }}>
          <svg viewBox="0 0 1200 120" preserveAspectRatio="none" style={{ position: 'relative', display: 'block', width: 'calc(100% + 1.3px)', height: '60px' }}>
            <path d="M321.39,56.44c58-10.79,114.16-30.13,172-41.86,82.39-16.72,168.19-17.73,250.45-.39C823.78,31,906.67,72,985.66,92.83c70.05,18.48,146.53,26.09,214.34,3V120H0V0C52.42,28.17,133.72,67.6,214.34,71.2,251.69,72.84,288.08,62.6,321.39,56.44Z" fill="#f8fafc"></path>
          </svg>
        </div>
      </section>

      {/* FEATURES GRID */}
      <section style={{ 
        padding: '6rem 1.5rem', 
        backgroundColor: '#f8fafc',
        backgroundImage: `
          radial-gradient(at 0% 0%, rgba(99, 102, 241, 0.12) 0px, transparent 50%),
          radial-gradient(at 100% 0%, rgba(14, 165, 233, 0.12) 0px, transparent 50%),
          radial-gradient(at 100% 100%, rgba(16, 185, 129, 0.12) 0px, transparent 50%),
          radial-gradient(at 0% 100%, rgba(244, 63, 94, 0.12) 0px, transparent 50%)
        `,
        minHeight: '100vh', 
        position: 'relative', 
        overflow: 'hidden' 
      }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto', position: 'relative', zIndex: 1 }}>
          <div className="bento-grid">
            {[
              { 
                icon: <BookOpenCheck size={28} strokeWidth={2} />, 
                title: 'Smart Reservations', 
                desc: 'Centralized booking management with live status tracking.', 
                color: '#10b981', 
                large: true,
                symbolicArt: (
                  <svg width="200" height="150" viewBox="0 0 200 150" style={{ position: 'absolute', right: '-10%', bottom: '-10%', opacity: 0.8 }}>
                    <rect x="50" y="20" width="120" height="40" rx="8" fill="rgba(16, 185, 129, 0.05)" stroke="rgba(16, 185, 129, 0.2)" strokeWidth="2" />
                    <rect x="70" y="40" width="60" height="8" rx="4" fill="rgba(16, 185, 129, 0.2)" />
                    <rect x="30" y="70" width="140" height="40" rx="8" fill="rgba(16, 185, 129, 0.1)" stroke="rgba(16, 185, 129, 0.3)" strokeWidth="2" />
                    <circle cx="150" cy="90" r="12" fill="#10b981" opacity="0.2" />
                    <path d="M145 90 L148 93 L155 86" stroke="#10b981" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" fill="none" />
                    <rect x="60" y="120" width="110" height="40" rx="8" fill="rgba(16, 185, 129, 0.05)" stroke="rgba(16, 185, 129, 0.2)" strokeWidth="2" />
                  </svg>
                )
              },
              { 
                icon: <CalendarDays size={28} strokeWidth={2} />, 
                title: 'Visual Calendar', 
                desc: 'Prevent double-bookings with our intuitive timeline view.', 
                color: '#0ea5e9',
                symbolicArt: (
                  <svg width="150" height="150" viewBox="0 0 150 150" style={{ position: 'absolute', right: '-5%', bottom: '-5%', opacity: 0.8 }}>
                    {[0,1,2].map(row => 
                      [0,1,2].map(col => (
                        <rect key={`${row}-${col}`} x={20 + col * 45} y={20 + row * 45} width="35" height="35" rx="8" 
                          fill={row === 1 && col === 1 ? "rgba(14, 165, 233, 0.15)" : "rgba(14, 165, 233, 0.03)"} 
                          stroke={row === 1 && col === 1 ? "rgba(14, 165, 233, 0.4)" : "rgba(14, 165, 233, 0.1)"} strokeWidth="2" />
                      ))
                    )}
                    <circle cx="82.5" cy="82.5" r="4" fill="#0ea5e9" />
                  </svg>
                )
              },
              { 
                icon: <Wallet size={28} strokeWidth={2} />, 
                title: 'Financial Tracking', 
                desc: 'Log expenses and track revenue automatically.', 
                color: '#f59e0b',
                symbolicArt: (
                  <svg width="160" height="120" viewBox="0 0 160 120" style={{ position: 'absolute', right: '0', bottom: '0', opacity: 0.8 }}>
                    <rect x="20" y="80" width="25" height="40" rx="4" fill="rgba(245, 158, 11, 0.1)" stroke="rgba(245, 158, 11, 0.2)" strokeWidth="2" />
                    <rect x="60" y="50" width="25" height="70" rx="4" fill="rgba(245, 158, 11, 0.15)" stroke="rgba(245, 158, 11, 0.3)" strokeWidth="2" />
                    <rect x="100" y="20" width="25" height="100" rx="4" fill="rgba(245, 158, 11, 0.25)" stroke="rgba(245, 158, 11, 0.5)" strokeWidth="2" />
                  </svg>
                )
              },
              { 
                icon: <TrendingUp size={28} strokeWidth={2} />, 
                title: 'ROI Analysis', 
                desc: 'Deep insights into your property investment health.', 
                color: '#8b5cf6', 
                large: true,
                symbolicArt: (
                  <svg width="300" height="150" viewBox="0 0 300 150" style={{ position: 'absolute', right: '0', bottom: '0', opacity: 0.8 }}>
                    <path d="M-20 120 C 40 120, 80 80, 140 90 C 200 100, 240 40, 320 20 L 320 160 L -20 160 Z" fill="rgba(139, 92, 246, 0.08)" />
                    <path d="M-20 120 C 40 120, 80 80, 140 90 C 200 100, 240 40, 320 20" fill="none" stroke="#8b5cf6" strokeWidth="3" strokeLinecap="round" opacity="0.6" />
                    <circle cx="240" cy="40" r="6" fill="#ffffff" stroke="#8b5cf6" strokeWidth="3" />
                  </svg>
                )
              },
              { 
                icon: <Users size={28} strokeWidth={2} />, 
                title: 'Staff Access', 
                desc: 'Role-based access for your managers and receptionists.', 
                color: '#f43f5e',
                symbolicArt: (
                  <svg width="150" height="120" viewBox="0 0 150 120" style={{ position: 'absolute', right: '-10%', bottom: '5%', opacity: 0.8 }}>
                    <circle cx="50" cy="60" r="30" fill="rgba(244, 63, 94, 0.05)" stroke="rgba(244, 63, 94, 0.2)" strokeWidth="2" />
                    <circle cx="80" cy="60" r="30" fill="rgba(244, 63, 94, 0.1)" stroke="rgba(244, 63, 94, 0.3)" strokeWidth="2" />
                    <circle cx="110" cy="60" r="30" fill="rgba(244, 63, 94, 0.15)" stroke="rgba(244, 63, 94, 0.4)" strokeWidth="2" />
                  </svg>
                )
              },
              { 
                icon: <Zap size={28} strokeWidth={2} />, 
                title: 'Instant Sync', 
                desc: 'Changes reflect instantly across web and mobile apps.', 
                color: '#3b82f6',
                symbolicArt: (
                  <svg width="140" height="140" viewBox="0 0 140 140" style={{ position: 'absolute', right: '-5%', bottom: '-5%', opacity: 0.8 }}>
                    <path d="M30 70 A40 40 0 1 1 110 70" fill="none" stroke="rgba(59, 130, 246, 0.2)" strokeWidth="4" strokeLinecap="round" strokeDasharray="10 15" />
                    <path d="M110 70 A40 40 0 1 1 30 70" fill="none" stroke="rgba(59, 130, 246, 0.4)" strokeWidth="4" strokeLinecap="round" strokeDasharray="10 15" />
                    <path d="M100 60 L110 70 L120 60" fill="none" stroke="rgba(59, 130, 246, 0.4)" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
                    <path d="M40 80 L30 70 L20 80" fill="none" stroke="rgba(59, 130, 246, 0.2)" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )
              },
            ].map((feat, i) => (
              <div key={i} className={`bento-item ${feat.large ? 'large' : ''}`} style={{ 
                background: 'rgba(255, 255, 255, 0.85)', 
                border: '1px solid rgba(255, 255, 255, 1)',
                boxShadow: '0 20px 40px -20px rgba(0,0,0,0.1), inset 0 0 0 1px rgba(255,255,255,0.5)',
                backdropFilter: 'blur(20px)',
                WebkitBackdropFilter: 'blur(20px)',
                position: 'relative',
                overflow: 'hidden',
                borderRadius: '24px'
              }}>
                {/* Symbolic Ambient Inner Glow */}
                <div style={{ position: 'absolute', top: '-20%', right: '-20%', width: '150px', height: '150px', background: `radial-gradient(circle, ${feat.color}15 0%, transparent 70%)`, filter: 'blur(20px)', pointerEvents: 'none' }}></div>
                
                {/* Custom Elegant Symbolic Vector Art */}
                {feat.symbolicArt}

                <div style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', height: '100%', padding: '1rem' }}>
                  <div style={{ 
                    width: '48px', height: '48px', borderRadius: '14px', 
                    background: '#ffffff',
                    border: `1px solid ${feat.color}20`,
                    boxShadow: `0 8px 16px -8px ${feat.color}50`,
                    color: feat.color, 
                    display: 'flex', alignItems: 'center', justifyContent: 'center', 
                    marginBottom: '1.5rem'
                  }}>
                    {feat.icon}
                  </div>
                  <h3 style={{ fontSize: '1.4rem', fontWeight: 700, marginBottom: '0.5rem', color: '#0f172a', letterSpacing: '-0.02em' }}>{feat.title}</h3>
                  <p style={{ color: '#475569', lineHeight: 1.6, margin: 0, fontSize: '1.05rem', fontWeight: 400 }}>{feat.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer style={{ 
        padding: '3rem 2rem 2rem', 
        borderTop: '1px solid rgba(0,0,0,0.05)',
        background: '#f8fafc',
        color: '#64748b',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '2rem'
      }}>
        <div style={{ display: 'flex', gap: '2rem', flexWrap: 'wrap', justifyContent: 'center', fontWeight: 600 }}>
          <Link to="/" style={{ color: 'inherit', textDecoration: 'none' }}>Home</Link>
          <Link to="/how-it-works" style={{ color: 'inherit', textDecoration: 'none' }}>How It Works</Link>
          <Link to="/pricing" style={{ color: 'inherit', textDecoration: 'none' }}>Pricing</Link>
          <Link to="/privacy" style={{ color: 'inherit', textDecoration: 'none' }}>Privacy Policy</Link>
        </div>
        <div style={{ fontSize: '0.9rem' }}>
           © {new Date().getFullYear()} StayPilot. All rights reserved.
        </div>
      </footer>
    </div>
  );
}
