import React from 'react';
import { Link } from 'react-router-dom';
import { useSettingsStore } from '../lib/store';
import { Smartphone, Receipt, FileSpreadsheet, Calculator, ArrowRight } from 'lucide-react';

export default function Home() {
  const { landingPageContent } = useSettingsStore();

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

  // Force using the expanded default features for now, but preserve custom headlines if set.
  const content = {
    ...DEFAULT_CONTENT,
    ...(landingPageContent || {}),
    features: landingPageContent?.features?.length > 3 ? landingPageContent.features : DEFAULT_CONTENT.features
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', background: 'linear-gradient(135deg, #f0fdf4 0%, #e0f2fe 50%, #f8fafc 100%)', color: '#0f172a', fontFamily: "'Inter', system-ui, sans-serif" }}>
      {/* Header */}
      <header style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center', 
        padding: '1rem 2rem', 
        background: 'rgba(255, 255, 255, 0.85)',
        backdropFilter: 'blur(12px)',
        borderBottom: '1px solid rgba(255, 255, 255, 0.3)',
        position: 'sticky',
        top: 0,
        zIndex: 50
      }}>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <span style={{ fontSize: '1.25rem', fontWeight: 800, letterSpacing: '0.05em', color: '#0F2C59' }}>
            STAY PILOT
          </span>
        </div>
        
        {/* Desktop Navigation (Center) */}
        <nav style={{ display: 'none', gap: '2.5rem', alignItems: 'center', fontWeight: 600, color: '#334155' }} className="d-md-flex">
          <Link to="/" style={{ color: '#059669', textDecoration: 'none' }}>Home</Link>
          <a href="#features" style={{ color: 'inherit', textDecoration: 'none', transition: 'color 0.2s' }} onMouseOver={e => e.target.style.color = '#059669'} onMouseOut={e => e.target.style.color = 'inherit'}>Features</a>
          <Link to="/how-it-works" style={{ color: 'inherit', textDecoration: 'none', transition: 'color 0.2s' }} onMouseOver={e => e.target.style.color = '#059669'} onMouseOut={e => e.target.style.color = 'inherit'}>How It Works</Link>
          <Link to="/pricing" style={{ color: 'inherit', textDecoration: 'none', transition: 'color 0.2s' }} onMouseOver={e => e.target.style.color = '#059669'} onMouseOut={e => e.target.style.color = 'inherit'}>Pricing</Link>
        </nav>
        
        {/* Media Query simulation in React (inline styles workaround for desktop nav) */}
        <style dangerouslySetInnerHTML={{__html: `
          @media (min-width: 768px) {
            .d-md-flex { display: flex !important; }
          }
          .feature-card:hover {
            transform: translateY(-5px);
            box-shadow: 0 20px 40px rgba(5, 150, 105, 0.1) !important;
          }
        `}} />

        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          <Link to="/auth" style={{ padding: '0.5rem 1rem', fontWeight: 600, color: '#0F2C59', textDecoration: 'none' }}>Sign In</Link>
          <Link to="/auth?mode=signup" className="btn btn-primary" style={{ padding: '0.6rem 1.5rem', fontWeight: 600, borderRadius: '8px', background: 'linear-gradient(135deg, #059669 0%, #10b981 100%)', border: 'none', boxShadow: '0 4px 15px rgba(5, 150, 105, 0.3)' }}>Get Started</Link>
        </div>
      </header>

      {/* Hero Section */}
      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '3rem 2rem 8rem', textAlign: 'center', position: 'relative' }}>
        
        {/* Background ambient blobs */}
        <div style={{ position: 'absolute', top: '10%', left: '15%', width: '300px', height: '300px', background: 'rgba(5, 150, 105, 0.15)', filter: 'blur(80px)', borderRadius: '50%', zIndex: 0, pointerEvents: 'none' }}></div>
        <div style={{ position: 'absolute', top: '30%', right: '15%', width: '350px', height: '350px', background: 'rgba(56, 189, 248, 0.15)', filter: 'blur(80px)', borderRadius: '50%', zIndex: 0, pointerEvents: 'none' }}></div>

        {/* LARGE STAY PILOT LOGO */}
        <div style={{ marginBottom: '0', marginTop: '1rem', position: 'relative', zIndex: 1, mixBlendMode: 'multiply' }}>
          <img 
            src="/stay-pilot-logo-full.jpg" 
            alt="Stay Pilot Logo" 
            style={{ 
              width: '100%', 
              maxWidth: '450px', 
              height: 'auto',
              objectFit: 'contain',
              display: 'block',
              margin: '0 auto'
            }} 
          />
        </div>

        {/* Main Tagline */}
        <h1 style={{ 
          fontSize: 'clamp(2rem, 5vw, 3.5rem)', 
          fontWeight: 800, 
          color: '#0F2C59', 
          maxWidth: '100%', 
          whiteSpace: 'nowrap',
          lineHeight: 1.2,
          marginBottom: '1rem',
          letterSpacing: '-0.02em',
          position: 'relative',
          zIndex: 1
        }}>
          {content.headline || DEFAULT_CONTENT.headline}
        </h1>
        
        {/* Sub-headline */}
        <h2 style={{ 
          fontSize: '1.8rem', 
          fontWeight: 600, 
          color: '#059669', // matching the logo/brand accent color 
          marginBottom: '1.5rem',
          maxWidth: '800px',
          position: 'relative',
          zIndex: 1
        }}>
          {content.subheadline || DEFAULT_CONTENT.subheadline}
        </h2>

        {/* Description */}
        <p style={{ 
          fontSize: '1.25rem', 
          color: '#334155', 
          maxWidth: '750px', 
          lineHeight: 1.6,
          marginBottom: '1.5rem',
          position: 'relative',
          zIndex: 1
        }}>
          {DEFAULT_CONTENT.description}
        </p>

        {/* Target Audience / Built For */}
        <p style={{ 
          fontSize: '1.1rem', 
          color: '#64748b', 
          maxWidth: '750px', 
          lineHeight: 1.6,
          marginBottom: '3.5rem',
          fontWeight: 500,
          position: 'relative',
          zIndex: 1
        }}>
          {DEFAULT_CONTENT.target}
        </p>

        {/* CTA Buttons */}
        <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', flexWrap: 'wrap', position: 'relative', zIndex: 1 }}>
          <Link to="/auth?mode=signup" className="btn btn-primary" style={{ padding: '1.2rem 3rem', fontSize: '1.15rem', fontWeight: 700, borderRadius: '8px', background: 'linear-gradient(135deg, #059669 0%, #10b981 100%)', border: 'none', boxShadow: '0 10px 25px rgba(5, 150, 105, 0.3)' }}>
            Get Started Free
          </Link>
          <Link to="/auth" className="btn btn-outline" style={{ padding: '1.2rem 3rem', fontSize: '1.15rem', fontWeight: 700, borderRadius: '8px', background: 'rgba(255,255,255,0.9)', backdropFilter: 'blur(10px)', color: '#0F2C59', borderColor: '#cbd5e1' }}>
            Sign In
          </Link>
        </div>
        
        {/* Trust Statement */}
        <div style={{ marginTop: '2rem', color: '#64748b', fontSize: '0.9rem', fontWeight: 600, position: 'relative', zIndex: 1 }}>
          No credit card required. Cancel anytime.
        </div>

        {/* FINAL VALUE SECTION */}
        <section style={{ padding: '6rem 2rem', background: 'transparent', textAlign: 'center', position: 'relative', zIndex: 1, width: '100%' }}>
          <div style={{ maxWidth: '800px', margin: '0 auto' }}>
            <h2 style={{ fontSize: '2.5rem', fontWeight: 800, color: '#0F2C59', marginBottom: '1rem' }}>Stop Managing Your Property in Pieces.</h2>
            <p style={{ fontSize: '1.15rem', color: '#64748B', marginBottom: '4rem' }}>
              Move away from scattered notebooks, spreadsheets and payment records. Stay Pilot gives you one simple place to manage your bookings and understand your numbers.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2rem' }}>
              <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', justifyContent: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.75rem 1.25rem', background: 'rgba(255, 255, 255, 0.9)', backdropFilter: 'blur(5px)', borderRadius: '8px', color: '#64748B', fontWeight: 500 }}>
                  <Smartphone size={18} /> WhatsApp
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.75rem 1.25rem', background: 'rgba(255, 255, 255, 0.9)', backdropFilter: 'blur(5px)', borderRadius: '8px', color: '#64748B', fontWeight: 500 }}>
                  <Receipt size={18} /> Notebook
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.75rem 1.25rem', background: 'rgba(255, 255, 255, 0.9)', backdropFilter: 'blur(5px)', borderRadius: '8px', color: '#64748B', fontWeight: 500 }}>
                  <FileSpreadsheet size={18} /> Spreadsheet
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.75rem 1.25rem', background: 'rgba(255, 255, 255, 0.9)', backdropFilter: 'blur(5px)', borderRadius: '8px', color: '#64748B', fontWeight: 500 }}>
                  <Calculator size={18} /> Calculator
                </div>
              </div>

              <ArrowRight size={32} color="#cbd5e1" style={{ transform: 'rotate(90deg)' }} />

              <div style={{ padding: '2rem 3rem', background: '#0F2C59', borderRadius: '16px', color: 'white', boxShadow: '0 20px 40px rgba(15, 44, 89, 0.15)' }}>
                <div style={{ fontSize: '1.5rem', fontWeight: 800, letterSpacing: '0.05em', marginBottom: '1rem' }}>STAY PILOT</div>
                <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', justifyContent: 'center', color: '#cbd5e1' }}>
                  <span>Dashboard</span> &bull; <span>Calendar</span> &bull; <span>Financials</span> &bull; <span>Reports</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Features Section */}
        <div id="features" style={{ width: '100%', maxWidth: '1100px', marginTop: '8rem', position: 'relative', zIndex: 1, scrollMarginTop: '120px' }}>
          <div style={{ textAlign: 'center', marginBottom: '4rem' }}>
            <h2 style={{ fontSize: '2.5rem', fontWeight: 800, color: '#0F2C59', marginBottom: '1rem' }}>Everything You Need to Succeed</h2>
            <p style={{ fontSize: '1.15rem', color: '#64748B', maxWidth: '600px', margin: '0 auto' }}>Powerful tools built specifically for managing independent properties and staying on top of your financials.</p>
          </div>
          <div style={{ 
            display: 'grid', 
            gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', 
            gap: '2.5rem'
          }}>
          {content.features?.map((feature, idx) => {
            const colors = [
              { bg: 'linear-gradient(135deg, #dcfce7 0%, #bbf7d0 100%)', text: '#166534', icon: '#15803d' },
              { bg: 'linear-gradient(135deg, #e0f2fe 0%, #bae6fd 100%)', text: '#075985', icon: '#0369a1' },
              { bg: 'linear-gradient(135deg, #fef3c7 0%, #fde68a 100%)', text: '#92400e', icon: '#b45309' }
            ];
            const colorScheme = colors[idx % colors.length];

            return (
              <div key={idx} className="feature-card" style={{ 
                background: 'rgba(255, 255, 255, 0.9)', 
                backdropFilter: 'blur(10px)',
                padding: '2.5rem', 
                borderRadius: '20px', 
                boxShadow: '0 10px 30px rgba(0,0,0,0.03)',
                border: '1px solid rgba(255,255,255,0.5)',
                textAlign: 'left',
                transition: 'all 0.3s ease'
              }}>
                <div style={{ 
                  width: '64px', 
                  height: '64px', 
                  background: colorScheme.bg,
                  borderRadius: '16px', 
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'center',
                  marginBottom: '1.5rem',
                  color: colorScheme.icon,
                  fontWeight: 800,
                  fontSize: '1.75rem',
                  boxShadow: '0 4px 15px rgba(0,0,0,0.05)'
                }}>
                  {idx + 1}
                </div>
                <h3 style={{ fontSize: '1.4rem', fontWeight: 800, marginBottom: '0.75rem', color: '#0F2C59' }}>{feature.title}</h3>
                <p style={{ color: '#475569', lineHeight: 1.6, margin: 0, fontSize: '1.05rem', fontWeight: 500 }}>{feature.description}</p>
              </div>
            );
          })}
          </div>
        </div>
      </main>



      {/* Footer */}
      <footer style={{ 
        padding: '3rem 2rem', 
        textAlign: 'center', 
        borderTop: '1px solid #f1f5f9',
        background: 'white',
        color: '#94a3b8',
        fontSize: '0.95rem'
      }}>
        &copy; {new Date().getFullYear()} Stay Pilot. All rights reserved.
      </footer>
    </div>
  );
}
