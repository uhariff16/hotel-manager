import React, { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { 
  BookOpenCheck, CalendarDays, Wallet, TrendingUp, Users, Zap, Shield, 
  MessageSquare, Send, ArrowRight, Sparkles 
} from 'lucide-react';

export default function Features() {
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  const featuresList = [
    { 
      icon: <BookOpenCheck size={26} strokeWidth={2} />, 
      title: 'Smart Reservations', 
      desc: 'Centralized booking management with real-time status tracking for check-ins, check-outs, and guest details.', 
      category: 'Operations',
      color: '#059669', 
      bg: 'rgba(5, 150, 105, 0.08)'
    },
    { 
      icon: <CalendarDays size={26} strokeWidth={2} />, 
      title: 'Visual Calendar', 
      desc: "See room availability and rate plans at a glance, so you always know your property's schedule.", 
      category: 'Operations',
      color: '#0ea5e9',
      bg: 'rgba(14, 165, 233, 0.08)'
    },
    { 
      icon: <Zap size={26} strokeWidth={2} />, 
      title: 'AI ID Scanning', 
      desc: 'Scan guest IDs using the mobile app to automatically extract details and auto-fill check-in records in seconds.', 
      category: 'Automation',
      color: '#8b5cf6',
      bg: 'rgba(139, 92, 246, 0.08)'
    },
    { 
      icon: <Wallet size={26} strokeWidth={2} />, 
      title: 'Financial Tracking', 
      desc: 'Track daily booking revenue alongside manual income and expense logs to keep accurate financial records.', 
      category: 'Finances',
      color: '#d97706',
      bg: 'rgba(217, 119, 6, 0.08)'
    },
    { 
      icon: <TrendingUp size={26} strokeWidth={2} />, 
      title: 'ROI & Performance Reports', 
      desc: 'Monitor property performance, occupancy trends, and profit margins with clear financial analytics.', 
      category: 'Analytics',
      color: '#2563eb', 
      bg: 'rgba(37, 99, 235, 0.08)'
    },
    { 
      icon: <Users size={26} strokeWidth={2} />, 
      title: 'Staff Access Controls', 
      desc: 'Grant team members secure, role-based access to reception and management tools without compromising sensitive data.', 
      category: 'Team',
      color: '#e11d48',
      bg: 'rgba(225, 29, 72, 0.08)'
    },
    { 
      icon: <MessageSquare size={26} strokeWidth={2} />, 
      title: 'Quick Enquiries', 
      desc: 'Capture and organize incoming guest inquiries so your team can respond quickly and secure bookings.', 
      category: 'Leads',
      color: '#0d9488',
      bg: 'rgba(13, 148, 136, 0.08)'
    },
    { 
      icon: <Send size={26} strokeWidth={2} />, 
      title: 'WhatsApp Messaging', 
      desc: 'Send instant booking confirmations and updates directly to guest WhatsApp accounts with one tap.', 
      category: 'Communication',
      color: '#16a34a',
      bg: 'rgba(22, 163, 74, 0.08)'
    },
    { 
      icon: <Shield size={26} strokeWidth={2} />, 
      title: 'Secure Data Management', 
      desc: 'Safely manage guest identification documents and property records with secure storage and simple data management.', 
      category: 'Security',
      color: '#db2777',
      bg: 'rgba(219, 39, 119, 0.08)'
    }
  ];

  return (
    <div style={{ fontFamily: 'var(--font-sans, system-ui, sans-serif)', overflowX: 'hidden', background: '#f8fafc', color: '#0f172a' }}>
      <style>{`
        .gradient-text {
          background: linear-gradient(135deg, #34d399 0%, #38bdf8 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
        }
        .hero-bg {
          background: radial-gradient(circle at top center, #064e3b 0%, #020617 100%);
          color: white;
        }
        .features-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 1.75rem;
        }
        .feature-card {
          background: #ffffff;
          border: 1px solid #e2e8f0;
          border-radius: 16px;
          padding: 2rem;
          display: flex;
          flex-direction: column;
          min-height: 240px;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.03);
          transition: transform 0.25s ease, box-shadow 0.25s ease, border-color 0.25s ease;
          position: relative;
        }
        @media (hover: hover) and (pointer: fine) {
          .feature-card:hover {
            transform: translateY(-4px);
            box-shadow: 0 16px 32px -8px rgba(5, 150, 105, 0.12);
            border-color: #cbd5e1;
          }
        }
        @media (prefers-reduced-motion: reduce) {
          .feature-card {
            transition: none !important;
          }
          .feature-card:hover {
            transform: none !important;
          }
        }
        .icon-wrapper {
          width: 52px;
          height: 52px;
          border-radius: 14px;
          display: flex;
          align-items: center;
          justify-content: center;
          margin-bottom: 1.25rem;
          flex-shrink: 0;
        }
        @media (max-width: 991px) {
          .features-grid {
            grid-template-columns: repeat(2, 1fr);
            gap: 1.5rem;
          }
        }
        @media (max-width: 640px) {
          .desktop-nav { display: none !important; }
          .desktop-btn { display: none !important; }
          .features-grid {
            grid-template-columns: 1fr;
            gap: 1.25rem;
          }
          .feature-card {
            padding: 1.5rem;
            min-height: auto;
          }
          .hero-title {
            font-size: 2.25rem !important;
            line-height: 1.15 !important;
          }
        }
      `}</style>

      {/* Header */}
      <header style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center', 
        padding: '1.25rem 2rem', 
        background: 'rgba(255, 255, 255, 0.75)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
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
          <Link to="/pricing" className="btn" style={{ padding: '0.65rem 1.6rem', fontWeight: 700, borderRadius: '8px', color: 'white', background: 'linear-gradient(135deg, #059669 0%, #10b981 100%)', border: 'none', boxShadow: '0 4px 15px rgba(5, 150, 105, 0.25)', textDecoration: 'none', fontFamily: "'Plus Jakarta Sans', sans-serif" }}>Get Started</Link>
        </div>
      </header>

      {/* HERO SECTION */}
      <section className="hero-bg" style={{ padding: '4.5rem 1.5rem 7rem', textAlign: 'center', position: 'relative' }}>
        <div style={{ maxWidth: '800px', margin: '0 auto', position: 'relative', zIndex: 1 }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', background: 'rgba(52, 211, 153, 0.15)', color: '#34d399', padding: '6px 16px', borderRadius: '30px', fontSize: '0.85rem', fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: '1.25rem', border: '1px solid rgba(52, 211, 153, 0.25)' }}>
            <Sparkles size={15} /> STAY PILOT FEATURES
          </div>
          
          <h1 className="hero-title gradient-text" style={{ fontSize: '3.8rem', fontWeight: 800, margin: '0 0 1.25rem 0', letterSpacing: '-0.03em', lineHeight: 1.15 }}>
            Everything You Need<br/>to Run Your Property
          </h1>
          
          <p style={{ fontSize: '1.25rem', color: '#94a3b8', lineHeight: 1.6, maxWidth: '620px', margin: '0 auto', fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
            Manage bookings, availability, finances and day-to-day operations from one simple, unified platform.
          </p>
        </div>
        
        {/* Curved SVG Divider */}
        <div style={{ position: 'absolute', bottom: 0, left: 0, width: '100%', overflow: 'hidden', lineHeight: 0, transform: 'translateY(1px)' }}>
          <svg viewBox="0 0 1200 120" preserveAspectRatio="none" style={{ position: 'relative', display: 'block', width: 'calc(100% + 1.3px)', height: '60px' }}>
            <path d="M321.39,56.44c58-10.79,114.16-30.13,172-41.86,82.39-16.72,168.19-17.73,250.45-.39C823.78,31,906.67,72,985.66,92.83c70.05,18.48,146.53,26.09,214.34,3V120H0V0C52.42,28.17,133.72,67.6,214.34,71.2,251.69,72.84,288.08,62.6,321.39,56.44Z" fill="#f8fafc"></path>
          </svg>
        </div>
      </section>

      {/* FEATURES GRID SECTION */}
      <section style={{ padding: '3.5rem 1.5rem 6rem', position: 'relative' }}>
        <div style={{ maxWidth: '1150px', margin: '0 auto' }}>
          
          {/* Section Subheading */}
          <div style={{ textAlign: 'center', marginBottom: '3rem' }}>
            <h2 style={{ fontSize: '2rem', fontWeight: 800, color: '#0f172a', letterSpacing: '-0.02em', marginBottom: '0.5rem' }}>
              Built for Modern Hospitality
            </h2>
            <p style={{ fontSize: '1.05rem', color: '#64748b', maxWidth: '550px', margin: '0 auto' }}>
              Purpose-built tools designed to streamline daily tasks, boost occupancy, and keep your property running smoothly.
            </p>
          </div>

          {/* 3x3 Grid */}
          <div className="features-grid">
            {featuresList.map((feat, i) => (
              <div key={i} className="feature-card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div className="icon-wrapper" style={{ background: feat.bg, color: feat.color }}>
                    {feat.icon}
                  </div>
                  <span style={{ 
                    fontSize: '0.75rem', 
                    fontWeight: 700, 
                    color: feat.color, 
                    background: feat.bg, 
                    padding: '4px 10px', 
                    borderRadius: '20px', 
                    letterSpacing: '0.03em',
                    textTransform: 'uppercase'
                  }}>
                    {feat.category}
                  </span>
                </div>
                
                <h3 style={{ fontSize: '1.3rem', fontWeight: 700, color: '#0f172a', marginBottom: '0.6rem', letterSpacing: '-0.01em' }}>
                  {feat.title}
                </h3>
                
                <p style={{ fontSize: '0.975rem', color: '#475569', lineHeight: 1.55, margin: 0, flexGrow: 1 }}>
                  {feat.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FINAL CONVERSION CTA */}
      <section style={{ padding: '5rem 1.5rem', background: '#ffffff', textAlign: 'center', borderTop: '1px solid #e2e8f0' }}>
        <div style={{ maxWidth: '800px', margin: '0 auto' }}>
          <h2 style={{ fontSize: 'clamp(2rem, 4vw, 2.75rem)', fontWeight: 800, color: '#0f172a', marginBottom: '1rem', letterSpacing: '-0.02em', fontFamily: "'Outfit', sans-serif" }}>
            Ready to simplify your property management?
          </h2>
          <p style={{ fontSize: '1.2rem', color: '#64748b', marginBottom: '2.5rem', lineHeight: 1.6, maxWidth: '600px', marginInline: 'auto' }}>
            Manage bookings, finances, and property performance from one simple, unified platform.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.75rem' }}>
            <Link to="/pricing" className="btn btn-primary" style={{ padding: '16px 36px', fontSize: '1.1rem', fontWeight: 700, borderRadius: '8px', background: 'linear-gradient(135deg, #059669 0%, #10b981 100%)', border: 'none', color: '#fff', boxShadow: '0 10px 25px -5px rgba(5, 150, 105, 0.35)', display: 'inline-flex', alignItems: 'center', gap: '8px', textDecoration: 'none' }}>
              Start 30-Day Free Trial <ArrowRight size={20} />
            </Link>
            <span style={{ fontSize: '0.875rem', color: '#94a3b8', fontWeight: 500 }}>
              No credit card required • Setup in minutes
            </span>
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
