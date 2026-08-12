import React, { useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useSettingsStore } from '../lib/store';
import { 
  Smartphone, Receipt, FileSpreadsheet, Calculator, ArrowRight,
  LayoutDashboard, BookOpenCheck, CalendarDays, Wallet, FileText, 
  TrendingUp, Users, CreditCard, Sparkles, CheckCircle2, Home as HomeIcon, Phone, Calendar
} from 'lucide-react';

export default function Home() {
  const { landingPageContent } = useSettingsStore();
  const location = useLocation();

  useEffect(() => {
    if (location.hash) {
      const id = location.hash.replace('#', '');
      const element = document.getElementById(id);
      if (element) {
        setTimeout(() => {
          element.scrollIntoView({ behavior: 'smooth' });
        }, 100);
      }
    } else {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, [location]);

  const DEFAULT_CONTENT = {
    headline: "Know Your Bookings. Know Your Numbers.",
    subheadline: "Bookings. Income. Expenses. Simplified.",
    description: "Stay Pilot makes it simple to manage your property bookings, track income and expenses, and understand your business — all in one place.",
    target: "Built for cottages, homestays, villas, guest houses and independent stays.",
    features: [
      { title: "Smart Dashboard", description: "Real-time metrics, monthly performance, and revenue breakdowns at a glance." },
      { title: "Booking Management", description: "Track, manage, and organize all your guest reservations effortlessly." },
      { title: "Integrated Calendar", description: "Visual calendar to instantly see property availability and upcoming stays." },
      { title: "Financial Tracking", description: "Monitor collections, log expenses, and automatically calculate your profit." },
      { title: "Comprehensive Reports", description: "Generate deep insights and exportable reports to understand business growth." },
      { title: "Investment Analysis", description: "Specialized tools to analyze property ROI and track investment health." },
      { title: "Property & Staff Management", description: "Oversee multiple properties and manage staff access from one central hub." },
      { title: "Plans & Billing", description: "Built-in subscription management and automated billing features." }
    ]
  };

  const content = {
    ...DEFAULT_CONTENT,
    ...(landingPageContent || {}),
    features: landingPageContent?.features?.length > 3 ? landingPageContent.features : DEFAULT_CONTENT.features
  };

  // Helper to map dynamic icons to the features list
  const getFeatureIcon = (title) => {
    const t = title.toLowerCase();
    if (t.includes('dashboard')) return <LayoutDashboard size={24} />;
    if (t.includes('booking')) return <BookOpenCheck size={24} />;
    if (t.includes('calendar')) return <CalendarDays size={24} />;
    if (t.includes('financial') || t.includes('tracking')) return <Wallet size={24} />;
    if (t.includes('report') || t.includes('insight')) return <FileText size={24} />;
    if (t.includes('investment') || t.includes('roi')) return <TrendingUp size={24} />;
    if (t.includes('staff') || t.includes('property')) return <Users size={24} />;
    if (t.includes('plan') || t.includes('bill')) return <CreditCard size={24} />;
    return <Sparkles size={24} />;
  };

  // Helper to get color schemes for feature cards
  const getFeatureColors = (idx) => {
    const colors = [
      { bg: 'rgba(5, 150, 105, 0.08)', text: '#059669', border: 'rgba(5, 150, 105, 0.15)', glow: 'rgba(5, 150, 105, 0.4)' }, // Emerald
      { bg: 'rgba(3, 105, 161, 0.08)', text: '#0369a1', border: 'rgba(3, 105, 161, 0.15)', glow: 'rgba(3, 105, 161, 0.4)' }, // Sky
      { bg: 'rgba(180, 83, 9, 0.08)', text: '#b45309', border: 'rgba(180, 83, 9, 0.15)', glow: 'rgba(180, 83, 9, 0.4)' },  // Amber
      { bg: 'rgba(109, 40, 217, 0.08)', text: '#6d28d9', border: 'rgba(109, 40, 217, 0.15)', glow: 'rgba(109, 40, 217, 0.4)' } // Purple
    ];
    return colors[idx % colors.length];
  };

  return (
    <div style={{ 
      minHeight: '100vh', 
      display: 'flex', 
      flexDirection: 'column', 
      background: 'linear-gradient(135deg, #f0fdf4 0%, #e0f2fe 35%, #eef2ff 70%, #faf5ff 100%)', 
      color: '#0f172a', 
      fontFamily: "'Outfit', 'Inter', system-ui, sans-serif" 
    }}>
      
      {/* Google Font Link */}
      <style dangerouslySetInnerHTML={{__html: `
        @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700;800&family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap');
        
        .d-md-flex { display: none !important; }
        .hero-grid {
          display: grid;
          grid-template-columns: 1fr;
          gap: 3rem;
          width: 100%;
          max-width: 1200px;
          align-items: center;
          padding: 2rem 0;
        }

        @media (min-width: 768px) {
          .d-md-flex { display: flex !important; }
        }
        @media (min-width: 992px) {
          .hero-grid {
            grid-template-columns: 1.1fr 0.9fr;
          }
        }
        
        .feature-card {
          background: rgba(255, 255, 255, 0.7) !important;
          backdrop-filter: blur(20px);
          border: 1px solid rgba(255, 255, 255, 0.4) !important;
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        }
        .feature-card:hover {
          transform: translateY(-6px);
          background: rgba(255, 255, 255, 0.95) !important;
          box-shadow: 0 20px 40px rgba(15, 44, 89, 0.08) !important;
          border-color: rgba(5, 150, 105, 0.3) !important;
        }

        @keyframes float {
          0% { transform: translateY(0px); }
          50% { transform: translateY(-10px); }
          100% { transform: translateY(0px); }
        }

        @keyframes pulse-glow {
          0% { box-shadow: 0 0 15px rgba(5, 150, 105, 0.15); }
          50% { box-shadow: 0 0 30px rgba(5, 150, 105, 0.3); }
          100% { box-shadow: 0 0 15px rgba(5, 150, 105, 0.15); }
        }
      `}} />

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
        
        {/* Desktop Navigation (Center) */}
        <nav style={{ gap: '2.5rem', alignItems: 'center', fontWeight: 600, color: '#334155', fontFamily: "'Plus Jakarta Sans', sans-serif" }} className="d-md-flex">
          <Link to="/" style={{ color: '#059669', textDecoration: 'none' }}>Home</Link>
          <Link to="/#features" style={{ color: 'inherit', textDecoration: 'none', transition: 'color 0.2s' }} onMouseOver={e => e.target.style.color = '#059669'} onMouseOut={e => e.target.style.color = 'inherit'}>Features</Link>
          <Link to="/how-it-works" style={{ color: 'inherit', textDecoration: 'none', transition: 'color 0.2s' }} onMouseOver={e => e.target.style.color = '#059669'} onMouseOut={e => e.target.style.color = 'inherit'}>How It Works</Link>
          <Link to="/pricing" style={{ color: 'inherit', textDecoration: 'none', transition: 'color 0.2s' }} onMouseOver={e => e.target.style.color = '#059669'} onMouseOut={e => e.target.style.color = 'inherit'}>Pricing</Link>
        </nav>

        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          <Link to="/auth" style={{ padding: '0.5rem 1rem', fontWeight: 600, color: '#0F2C59', textDecoration: 'none', fontFamily: "'Plus Jakarta Sans', sans-serif" }}>Sign In</Link>
          <Link to="/auth?mode=signup" className="btn" style={{ padding: '0.65rem 1.6rem', fontWeight: 700, borderRadius: '8px', color: 'white', background: 'linear-gradient(135deg, #059669 0%, #10b981 100%)', border: 'none', boxShadow: '0 4px 15px rgba(5, 150, 105, 0.25)', textDecoration: 'none', fontFamily: "'Plus Jakarta Sans', sans-serif" }}>Get Started</Link>
        </div>
      </header>

      {/* Main Hero Section */}
      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '3rem 2rem 8rem', position: 'relative' }}>
        
        {/* Background ambient blobs */}
        <div style={{ position: 'absolute', top: '10%', left: '5%', width: '400px', height: '400px', background: 'rgba(5, 150, 105, 0.12)', filter: 'blur(100px)', borderRadius: '50%', zIndex: 0, pointerEvents: 'none' }}></div>
        <div style={{ position: 'absolute', top: '25%', right: '5%', width: '450px', height: '450px', background: 'rgba(56, 189, 248, 0.12)', filter: 'blur(100px)', borderRadius: '50%', zIndex: 0, pointerEvents: 'none' }}></div>
        <div style={{ position: 'absolute', top: '50%', left: '30%', width: '350px', height: '350px', background: 'rgba(99, 102, 241, 0.08)', filter: 'blur(90px)', borderRadius: '50%', zIndex: 0, pointerEvents: 'none' }}></div>

        <div className="hero-grid" style={{ position: 'relative', zIndex: 1 }}>
          
          {/* Left Hero Column */}
          <div style={{ textAlign: 'left', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            
            {/* Brand Tagline Badge */}
            <div style={{ 
              display: 'flex', 
              alignItems: 'center', 
              gap: '0.5rem', 
              padding: '0.4rem 0.8rem', 
              background: 'rgba(5, 150, 105, 0.08)', 
              border: '1px solid rgba(5, 150, 105, 0.15)', 
              borderRadius: '20px', 
              color: '#059669', 
              fontWeight: 700, 
              fontSize: '0.75rem', 
              textTransform: 'uppercase', 
              letterSpacing: '0.05em', 
              width: 'fit-content' 
            }}>
              <Sparkles size={14} /> All-in-One Stay Manager
            </div>

            {/* Main Title Heading */}
            <h1 style={{ 
              fontSize: 'clamp(2.5rem, 5.5vw, 3.8rem)', 
              fontWeight: 800, 
              color: '#0F2C59', 
              lineHeight: 1.15,
              margin: 0,
              letterSpacing: '-0.025em',
              fontFamily: "'Outfit', sans-serif"
            }}>
              Know Your Bookings. <br />
              Know Your <span style={{ 
                background: 'linear-gradient(135deg, #059669 0%, #0ea5e9 100%)', 
                WebkitBackgroundClip: 'text', 
                WebkitTextFillColor: 'transparent',
                display: 'inline-block' 
              }}>Numbers.</span>
            </h1>

            {/* Sub-headline Text */}
            <h2 style={{ 
              fontSize: '1.25rem', 
              fontWeight: 600, 
              color: '#059669', 
              margin: 0,
              fontFamily: "'Plus Jakarta Sans', sans-serif"
            }}>
              {content.subheadline || DEFAULT_CONTENT.subheadline}
            </h2>

            {/* Main Description */}
            <p style={{ 
              fontSize: '1.15rem', 
              color: '#475569', 
              lineHeight: 1.6,
              margin: 0,
              fontFamily: "'Plus Jakarta Sans', sans-serif"
            }}>
              {DEFAULT_CONTENT.description}
            </p>

            {/* Small built-for target */}
            <p style={{ 
              fontSize: '0.95rem', 
              color: '#64748b', 
              lineHeight: 1.5,
              fontWeight: 500,
              margin: '0 0 0.5rem 0'
            }}>
              ✨ {DEFAULT_CONTENT.target}
            </p>

            {/* Key checklists */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', margin: '0.5rem 0 1rem 0' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.95rem', color: '#334155', fontWeight: 600 }}>
                <CheckCircle2 size={16} color="#059669" /> Visual bookings calendar & room layouts
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.95rem', color: '#334155', fontWeight: 600 }}>
                <CheckCircle2 size={16} color="#059669" /> Complete collections & operational expense log
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.95rem', color: '#334155', fontWeight: 600 }}>
                <CheckCircle2 size={16} color="#059669" /> Automated profit reports & investment ROI analyses
              </div>
            </div>

            {/* CTA Controls */}
            <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
              <Link to="/auth?mode=signup" className="btn" style={{ padding: '1.1rem 2.8rem', fontSize: '1.1rem', fontWeight: 700, borderRadius: '8px', color: 'white', background: 'linear-gradient(135deg, #059669 0%, #10b981 100%)', border: 'none', boxShadow: '0 10px 25px rgba(5, 150, 105, 0.25)', textDecoration: 'none', fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
                Get Started Free
              </Link>
              <Link to="/auth" className="btn" style={{ padding: '1.1rem 2.8rem', fontSize: '1.1rem', fontWeight: 700, borderRadius: '8px', background: 'white', color: '#0F2C59', border: '1px solid #cbd5e1', boxShadow: '0 4px 12px rgba(0,0,0,0.02)', textDecoration: 'none', fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
                Sign In
              </Link>
            </div>

            <div style={{ color: '#64748b', fontSize: '0.85rem', fontWeight: 600, marginLeft: '0.25rem' }}>
              No credit card required. Cancel anytime.
            </div>

          </div>

          {/* Right Hero Column (Visual Dashboard Graphic Mockup) */}
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', position: 'relative', minHeight: '400px' }}>
            
            {/* Ambient Circle Glow */}
            <div style={{ 
              position: 'absolute', 
              width: '280px', 
              height: '280px', 
              borderRadius: '50%', 
              background: 'radial-gradient(circle, rgba(5,150,105,0.2) 0%, rgba(14,165,233,0.1) 70%, transparent 100%)',
              filter: 'blur(30px)',
              zIndex: 0
            }}></div>

            {/* Central mockup window displaying Stay Pilot full logo */}
            <div style={{ 
              width: '360px', 
              background: 'rgba(255, 255, 255, 0.75)', 
              backdropFilter: 'blur(20px)',
              border: '1px solid rgba(255, 255, 255, 0.6)', 
              borderRadius: '20px',
              boxShadow: '0 25px 50px rgba(15, 44, 89, 0.08)',
              zIndex: 1,
              animation: 'float 6s ease-in-out infinite, pulse-glow 6s infinite',
              overflow: 'hidden'
            }}>
              {/* Mock Browser Header Bar */}
              <div style={{ 
                background: 'rgba(241, 245, 249, 0.8)', 
                borderBottom: '1px solid rgba(226, 232, 240, 0.8)',
                padding: '0.75rem 1rem', 
                display: 'flex', 
                alignItems: 'center', 
                gap: '0.4rem' 
              }}>
                <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#ff5f56' }}></div>
                <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#ffbd2e' }}></div>
                <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#27c93f' }}></div>
                <div style={{ 
                  margin: '0 auto', 
                  background: 'white', 
                  borderRadius: '6px', 
                  padding: '0.15rem 2rem', 
                  fontSize: '0.65rem', 
                  color: '#64748b', 
                  fontWeight: 600,
                  border: '1px solid #e2e8f0',
                  letterSpacing: '0.02em'
                }}>
                  staypilot.co.in
                </div>
              </div>
              {/* Logo Frame */}
              <div style={{ padding: '1.25rem', display: 'flex', justifyContent: 'center', alignItems: 'center', background: 'white' }}>
                <img 
                  src="/stay-pilot-logo-full.jpg" 
                  alt="Stay Pilot Full Logo" 
                  style={{ 
                    width: '100%', 
                    height: 'auto',
                    objectFit: 'contain',
                    display: 'block',
                    borderRadius: '8px'
                  }} 
                />
              </div>
            </div>

            {/* Floating Card 1: Mock Reservation (Top-Left) */}
            <div style={{ 
              position: 'absolute', 
              top: '15px', 
              left: '-20px', 
              background: 'rgba(255, 255, 255, 0.9)', 
              backdropFilter: 'blur(10px)',
              borderRadius: '12px', 
              padding: '0.85rem 1.15rem', 
              boxShadow: '0 10px 25px rgba(0, 0, 0, 0.05)', 
              border: '1px solid rgba(255, 255, 255, 0.8)',
              display: 'flex', 
              flexDirection: 'column', 
              gap: '0.35rem', 
              width: '210px', 
              zIndex: 2,
              animation: 'float 6s ease-in-out infinite 0.7s',
              textAlign: 'left'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.65rem', fontWeight: 800, color: 'var(--primary)' }}>BK-260808-9790</span>
                <span style={{ fontSize: '0.6rem', fontWeight: 800, background: '#e0f2fe', color: '#0369a1', padding: '0.15rem 0.4rem', borderRadius: '8px' }}>Confirmed</span>
              </div>
              <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#0F2C59' }}>Swathiswaren S.</span>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.2rem', borderTop: '1px solid #f1f5f9', paddingTop: '0.25rem' }}>
                <span style={{ fontSize: '0.65rem', color: '#64748b', fontWeight: 500 }}>Unit 101</span>
                <span style={{ fontSize: '0.8rem', fontWeight: 800, color: '#0f172a' }}>₹8,000</span>
              </div>
            </div>

            {/* Floating Card 2: Revenue Trend (Bottom-Right) */}
            <div style={{ 
              position: 'absolute', 
              bottom: '15px', 
              right: '-10px', 
              background: 'rgba(255, 255, 255, 0.9)', 
              backdropFilter: 'blur(10px)',
              borderRadius: '12px', 
              padding: '0.85rem 1.15rem', 
              boxShadow: '0 10px 25px rgba(0, 0, 0, 0.05)', 
              border: '1px solid rgba(255, 255, 255, 0.8)',
              display: 'flex', 
              flexDirection: 'column', 
              gap: '0.2rem', 
              width: '180px', 
              zIndex: 2,
              animation: 'float 6s ease-in-out infinite 1.5s',
              textAlign: 'left'
            }}>
              <span style={{ fontSize: '0.65rem', color: '#64748b', fontWeight: 700, textTransform: 'uppercase' }}>Net Profit</span>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.35rem' }}>
                <span style={{ fontSize: '1.15rem', fontWeight: 800, color: '#059669' }}>₹3,37,659</span>
                <span style={{ fontSize: '0.65rem', color: '#059669', fontWeight: 700 }}>+24%</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.65rem', color: '#64748b', marginTop: '0.2rem' }}>
                <TrendingUp size={12} color="#059669" /> Healthy occupancy
              </div>
            </div>

          </div>

        </div>

        {/* COMPARISON VALUE PROPOSITION SECTION */}
        <section style={{ 
          padding: '6rem 2rem 4rem', 
          background: 'transparent', 
          textAlign: 'center', 
          position: 'relative', 
          zIndex: 1, 
          width: '100%' 
        }}>
          <div style={{ maxWidth: '900px', margin: '0 auto' }}>
            <h2 style={{ fontSize: '2.4rem', fontWeight: 800, color: '#0F2C59', marginBottom: '1rem', fontFamily: "'Outfit', sans-serif" }}>
              Stop Managing Your Property in Pieces.
            </h2>
            <p style={{ fontSize: '1.15rem', color: '#475569', marginBottom: '4rem', fontFamily: "'Plus Jakarta Sans', sans-serif", lineHeight: 1.6 }}>
              Move away from scattered notebooks, messy spreadsheets, and payment records. Stay Pilot provides you with one clean, unified environment to manage your bookings and understand your numbers.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2rem' }}>
              
              {/* Scattered Pieces Row */}
              <div style={{ display: 'flex', gap: '1.25rem', flexWrap: 'wrap', justifyContent: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '0.85rem 1.5rem', background: 'white', borderRadius: '12px', color: '#64748B', fontWeight: 600, boxShadow: '0 4px 15px rgba(0,0,0,0.02)', border: '1px solid #e2e8f0' }}>
                  <Smartphone size={18} color="#25D366" /> WhatsApp Chats
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '0.85rem 1.5rem', background: 'white', borderRadius: '12px', color: '#64748B', fontWeight: 600, boxShadow: '0 4px 15px rgba(0,0,0,0.02)', border: '1px solid #e2e8f0' }}>
                  <Receipt size={18} color="#f59e0b" /> Paper Notebooks
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '0.85rem 1.5rem', background: 'white', borderRadius: '12px', color: '#64748B', fontWeight: 600, boxShadow: '0 4px 15px rgba(0,0,0,0.02)', border: '1px solid #e2e8f0' }}>
                  <FileSpreadsheet size={18} color="#10b981" /> Spreadsheets
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '0.85rem 1.5rem', background: 'white', borderRadius: '12px', color: '#64748B', fontWeight: 600, boxShadow: '0 4px 15px rgba(0,0,0,0.02)', border: '1px solid #e2e8f0' }}>
                  <Calculator size={18} color="#0ea5e9" /> Physical Calculators
                </div>
              </div>

              {/* Animated/Arrow transition */}
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.25rem', color: '#cbd5e1' }}>
                <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Replaced By</span>
                <ArrowRight size={28} color="#059669" style={{ transform: 'rotate(90deg)', animation: 'float 3s infinite' }} />
              </div>

              {/* STAY PILOT Unified Box */}
              <div style={{ 
                padding: '2.5rem 4rem', 
                background: 'linear-gradient(135deg, #0F2C59 0%, #173b75 100%)', 
                borderRadius: '24px', 
                color: 'white', 
                boxShadow: '0 25px 50px rgba(15, 44, 89, 0.15)',
                border: '1px solid rgba(255,255,255,0.08)',
                width: '100%',
                maxWidth: '650px'
              }}>
                <div style={{ fontSize: '1.6rem', fontWeight: 800, letterSpacing: '0.05em', marginBottom: '0.5rem', fontFamily: "'Outfit', sans-serif" }}>STAY PILOT</div>
                <div style={{ fontSize: '0.9rem', color: '#a5f3fc', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '1.5rem' }}>One Unified System</div>
                <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap', justifyContent: 'center', color: '#cbd5e1', fontSize: '1.05rem', fontWeight: 600 }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}><LayoutDashboard size={16} color="#059669" /> Dashboard</span>
                  <span>&bull;</span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}><CalendarDays size={16} color="#0ea5e9" /> Calendar</span>
                  <span>&bull;</span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}><Wallet size={16} color="#f59e0b" /> Financials</span>
                  <span>&bull;</span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}><FileText size={16} color="#10b981" /> Reports</span>
                </div>
              </div>

            </div>
          </div>
        </section>

        {/* FEATURES GRID SECTION */}
        <div id="features" style={{ width: '100%', maxWidth: '1150px', marginTop: '6rem', position: 'relative', zIndex: 1, scrollMarginTop: '120px' }}>
          
          <div style={{ textAlign: 'center', marginBottom: '4rem' }}>
            
            <div style={{ 
              display: 'inline-flex', 
              alignItems: 'center', 
              gap: '0.5rem', 
              padding: '0.35rem 0.75rem', 
              background: 'rgba(5, 150, 105, 0.08)', 
              borderRadius: '20px', 
              color: '#059669', 
              fontWeight: 700, 
              fontSize: '0.75rem', 
              marginBottom: '1rem',
              textTransform: 'uppercase'
            }}>
              ⚡ Feature Highlights
            </div>

            <h2 style={{ fontSize: '2.5rem', fontWeight: 800, color: '#0F2C59', marginBottom: '1rem', fontFamily: "'Outfit', sans-serif" }}>
              Everything You Need to Succeed
            </h2>
            <p style={{ fontSize: '1.15rem', color: '#475569', maxWidth: '600px', margin: '0 auto', fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
              Powerful tools built specifically for managing independent properties and staying on top of your financials.
            </p>
          </div>

          <div style={{ 
            display: 'grid', 
            gridTemplateColumns: 'repeat(auto-fit, minmax(270px, 1fr))', 
            gap: '2rem'
          }}>
            {content.features?.map((feature, idx) => {
              const colorScheme = getFeatureColors(idx);

              return (
                <div key={idx} className="feature-card" style={{ 
                  padding: '2.5rem', 
                  borderRadius: '20px', 
                  textAlign: 'left',
                  position: 'relative',
                  overflow: 'hidden'
                }}>
                  {/* Top colored line indicator */}
                  <div style={{ 
                    position: 'absolute', 
                    top: 0, 
                    left: 0, 
                    right: 0, 
                    height: '4px', 
                    background: colorScheme.text 
                  }}></div>

                  {/* Icon container */}
                  <div style={{ 
                    width: '56px', 
                    height: '56px', 
                    background: colorScheme.bg,
                    borderRadius: '14px', 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'center',
                    marginBottom: '1.5rem',
                    color: colorScheme.text,
                    boxShadow: `0 8px 20px -6px ${colorScheme.glow}`
                  }}>
                    {getFeatureIcon(feature.title)}
                  </div>

                  {/* Title */}
                  <h3 style={{ 
                    fontSize: '1.3rem', 
                    fontWeight: 800, 
                    marginBottom: '0.75rem', 
                    color: '#0F2C59',
                    fontFamily: "'Outfit', sans-serif"
                  }}>
                    {feature.title}
                  </h3>

                  {/* Description */}
                  <p style={{ 
                    color: '#475569', 
                    lineHeight: 1.6, 
                    margin: 0, 
                    fontSize: '1rem', 
                    fontWeight: 500,
                    fontFamily: "'Plus Jakarta Sans', sans-serif"
                  }}>
                    {feature.description}
                  </p>
                </div>
              );
            })}
          </div>

        </div>

      </main>

      {/* Footer */}
      <footer style={{ 
        padding: '4rem 2rem 3rem', 
        borderTop: '1px solid rgba(255,255,255,0.4)',
        background: 'rgba(255, 255, 255, 0.7)',
        backdropFilter: 'blur(10px)',
        color: '#64748b',
        fontSize: '0.95rem',
        fontFamily: "'Plus Jakarta Sans', sans-serif"
      }}>
        <div style={{ maxWidth: '1150px', margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '2rem' }}>
          
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <img src="/stay-pilot-logo.png" alt="Stay Pilot Logo" style={{ height: '24px', width: 'auto', marginRight: '0.5rem' }} />
            <span style={{ fontSize: '1.1rem', fontWeight: 800, color: '#0F2C59', letterSpacing: '0.05em' }}>STAY PILOT</span>
          </div>

          <div style={{ display: 'flex', gap: '2.5rem', flexWrap: 'wrap', fontWeight: 600 }}>
            <Link to="/" style={{ color: 'inherit', textDecoration: 'none' }}>Home</Link>
            <a href="#features" style={{ color: 'inherit', textDecoration: 'none' }}>Features</a>
            <Link to="/how-it-works" style={{ color: 'inherit', textDecoration: 'none' }}>How It Works</Link>
            <Link to="/pricing" style={{ color: 'inherit', textDecoration: 'none' }}>Pricing</Link>
          </div>

          <div style={{ color: '#94a3b8' }}>
            &copy; {new Date().getFullYear()} Stay Pilot. All rights reserved.
          </div>

        </div>
      </footer>
    </div>
  );
}
