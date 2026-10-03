import React, { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { 
  Home as HomeIcon, Calendar, IndianRupee, Receipt, BarChart3, TrendingUp, 
  Smartphone, FileSpreadsheet, Calculator, ArrowRight, Sparkles, CheckCircle2,
  ChevronRight, ArrowDown
} from 'lucide-react';

export default function HowItWorks() {
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  const workflowSteps = [
    {
      num: '01',
      icon: <HomeIcon size={26} strokeWidth={2} />,
      title: 'Set Up',
      short: 'Property & Rooms',
      desc: 'Create your property structure, rooms, rate plans, and basic business settings in minutes.',
      points: ['Property details', 'Room categories & numbers', 'Base rates', 'Property settings']
    },
    {
      num: '02',
      icon: <Calendar size={26} strokeWidth={2} />,
      title: 'Book',
      short: 'Add & Manage Stays',
      desc: 'Add reservations, view room availability on the calendar, and track check-ins effortlessly.',
      points: ['Guest details', 'Check-in & check-out dates', 'Rate calculation', 'Booking status tracking']
    },
    {
      num: '03',
      icon: <IndianRupee size={26} strokeWidth={2} />,
      title: 'Collect',
      short: 'Track Booking Revenue',
      desc: 'Record booking collections, advance deposits, and balance payments accurately.',
      points: ['Advance deposits', 'Balance collections', 'Payment methods', 'Total revenue logging']
    },
    {
      num: '04',
      icon: <Receipt size={26} strokeWidth={2} />,
      title: 'Spend',
      short: 'Record Operating Expenses',
      desc: 'Log property operating expenses so you know exactly where your business funds go.',
      points: ['Utilities & bills', 'Cleaning & maintenance', 'Staff & supplies', 'Property repairs']
    },
    {
      num: '05',
      icon: <BarChart3 size={26} strokeWidth={2} />,
      title: 'Analyze',
      short: 'Understand Performance',
      desc: 'Bring revenue and expenses together to see clear profit margins and occupancy trends.',
      points: ['Income vs expenses', 'Net profit calculation', 'Monthly revenue trends', 'Occupancy statistics']
    },
    {
      num: '06',
      icon: <TrendingUp size={26} strokeWidth={2} />,
      title: 'Improve',
      short: 'Smarter Operations',
      desc: 'Use accurate financial numbers to make confident decisions and grow your business.',
      points: ['Identify peak periods', 'Control unwanted expenses', 'Maximize room profit', 'Scale operations']
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
        .workflow-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 1.75rem;
        }
        .workflow-card {
          background: #ffffff;
          border: 1px solid #e2e8f0;
          border-radius: 16px;
          padding: 2rem;
          display: flex;
          flex-direction: column;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.03);
          transition: transform 0.25s ease, box-shadow 0.25s ease, border-color 0.25s ease;
          position: relative;
        }
        @media (hover: hover) and (pointer: fine) {
          .workflow-card:hover {
            transform: translateY(-4px);
            box-shadow: 0 16px 32px -8px rgba(5, 150, 105, 0.12);
            border-color: #cbd5e1;
          }
        }
        @media (prefers-reduced-motion: reduce) {
          .workflow-card {
            transition: none !important;
          }
          .workflow-card:hover {
            transform: none !important;
          }
        }
        .step-badge {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          font-size: 0.75rem;
          font-weight: 800;
          color: #059669;
          background: rgba(5, 150, 105, 0.1);
          padding: 4px 12px;
          border-radius: 20px;
          letterSpacing: 0.05em;
          text-transform: uppercase;
        }
        .flow-container {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 1.25rem;
        }
        .flow-card {
          background: #ffffff;
          border: 1px solid #e2e8f0;
          border-radius: 16px;
          padding: 1.75rem 1.25rem;
          text-align: center;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.03);
          transition: transform 0.2s ease;
        }
        .flow-card:hover {
          transform: translateY(-3px);
          box-shadow: 0 12px 24px -6px rgba(0, 0, 0, 0.06);
        }
        @media (max-width: 991px) {
          .workflow-grid {
            grid-template-columns: repeat(2, 1fr);
            gap: 1.5rem;
          }
          .flow-container {
            grid-template-columns: repeat(2, 1fr);
            gap: 1.25rem;
          }
        }
        @media (max-width: 640px) {
          .desktop-nav { display: none !important; }
          .desktop-btn { display: none !important; }
          .workflow-grid {
            grid-template-columns: 1fr;
            gap: 1.5rem;
          }
          .flow-container {
            grid-template-columns: 1fr;
            gap: 1rem;
          }
          .workflow-card {
            padding: 1.5rem;
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
          <Link to="/features" style={{ color: 'inherit', textDecoration: 'none', transition: 'color 0.2s' }} onMouseOver={e => e.target.style.color = '#059669'} onMouseOut={e => e.target.style.color = 'inherit'}>Features</Link>
          <Link to="/how-it-works" style={{ color: '#059669', textDecoration: 'none' }}>How It Works</Link>
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
            <Sparkles size={15} /> HOW STAY PILOT WORKS
          </div>
          
          <h1 className="hero-title gradient-text" style={{ fontSize: '3.8rem', fontWeight: 800, margin: '0 0 1.25rem 0', letterSpacing: '-0.03em', lineHeight: 1.15 }}>
            From Booking to<br/>Better Business
          </h1>
          
          <p style={{ fontSize: '1.25rem', color: '#94a3b8', lineHeight: 1.6, maxWidth: '640px', margin: '0 auto 2.5rem', fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
            Stay Pilot connects property setup, bookings, collections, expenses, and performance into one simple, unified workflow.
          </p>

          <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', flexWrap: 'wrap', alignItems: 'center' }}>
            <Link to="/pricing" style={{ padding: '14px 32px', fontSize: '1.1rem', fontWeight: 700, borderRadius: '8px', background: 'linear-gradient(135deg, #059669 0%, #10b981 100%)', color: 'white', textDecoration: 'none', boxShadow: '0 10px 25px -5px rgba(5, 150, 105, 0.4)' }}>
              Start 30-Day Free Trial
            </Link>
            <Link to="/auth" className="desktop-btn" style={{ padding: '14px 28px', fontSize: '1.1rem', fontWeight: 600, borderRadius: '8px', background: 'rgba(255, 255, 255, 0.1)', color: 'white', border: '1px solid rgba(255, 255, 255, 0.2)', textDecoration: 'none' }}>
              Sign In
            </Link>
          </div>
        </div>
        
        {/* Curved SVG Divider */}
        <div style={{ position: 'absolute', bottom: 0, left: 0, width: '100%', overflow: 'hidden', lineHeight: 0, transform: 'translateY(1px)' }}>
          <svg viewBox="0 0 1200 120" preserveAspectRatio="none" style={{ position: 'relative', display: 'block', width: 'calc(100% + 1.3px)', height: '60px' }}>
            <path d="M321.39,56.44c58-10.79,114.16-30.13,172-41.86,82.39-16.72,168.19-17.73,250.45-.39C823.78,31,906.67,72,985.66,92.83c70.05,18.48,146.53,26.09,214.34,3V120H0V0C52.42,28.17,133.72,67.6,214.34,71.2,251.69,72.84,288.08,62.6,321.39,56.44Z" fill="#f8fafc"></path>
          </svg>
        </div>
      </section>

      {/* WORKFLOW STEPS SECTION */}
      <section style={{ padding: '3.5rem 1.5rem 5rem', position: 'relative' }}>
        <div style={{ maxWidth: '1150px', margin: '0 auto' }}>
          
          {/* Section Header */}
          <div style={{ textAlign: 'center', marginBottom: '3.5rem' }}>
            <h2 style={{ fontSize: '2.25rem', fontWeight: 800, color: '#0f172a', letterSpacing: '-0.02em', marginBottom: '0.75rem' }}>
              The Stay Pilot Workflow
            </h2>
            <p style={{ fontSize: '1.1rem', color: '#64748b', maxWidth: '620px', margin: '0 auto', lineHeight: 1.6 }}>
              Everything you need to manage your stay business, from setting up your property to making better decisions.
            </p>
          </div>

          {/* 3x2 Workflow Grid */}
          <div className="workflow-grid">
            {workflowSteps.map((step, idx) => (
              <div key={idx} className="workflow-card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
                  <div style={{ 
                    width: '48px', height: '48px', borderRadius: '12px', 
                    background: 'rgba(5, 150, 105, 0.08)', color: '#059669', 
                    display: 'flex', alignItems: 'center', justifyContent: 'center' 
                  }}>
                    {step.icon}
                  </div>
                  <span className="step-badge">
                    STEP {step.num}
                  </span>
                </div>

                <h3 style={{ fontSize: '1.4rem', fontWeight: 800, color: '#0f172a', marginBottom: '0.25rem', letterSpacing: '-0.01em' }}>
                  {step.title}
                </h3>
                
                <div style={{ color: '#059669', fontWeight: 700, fontSize: '0.9rem', marginBottom: '0.75rem' }}>
                  {step.short}
                </div>

                <p style={{ fontSize: '0.975rem', color: '#475569', lineHeight: 1.55, marginBottom: '1.25rem', flexGrow: 1 }}>
                  {step.desc}
                </p>

                <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: '1rem' }}>
                  <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                    {step.points.map((pt, i) => (
                      <li key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem', color: '#64748b', fontWeight: 500 }}>
                        <CheckCircle2 size={14} color="#059669" /> {pt}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ONE WORKFLOW. ONE CLEAR PICTURE. */}
      <section style={{ padding: '5rem 1.5rem', background: '#ffffff', borderTop: '1px solid #e2e8f0', borderBottom: '1px solid #e2e8f0' }}>
        <div style={{ maxWidth: '1150px', margin: '0 auto', textAlign: 'center' }}>
          
          <span style={{ fontSize: '0.85rem', fontWeight: 800, color: '#059669', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '0.5rem', display: 'block' }}>
            UNIFIED DASHBOARD
          </span>
          <h2 style={{ fontSize: '2.25rem', fontWeight: 800, color: '#0f172a', marginBottom: '1rem', letterSpacing: '-0.02em' }}>
            One Workflow. One Clear Picture.
          </h2>
          
          <div style={{ maxWidth: '680px', margin: '0 auto 3rem', color: '#475569', fontSize: '1.1rem', lineHeight: 1.7 }}>
            <p style={{ margin: '0 0 0.25rem 0' }}>Your <strong>bookings</strong> tell you what's happening.</p>
            <p style={{ margin: '0 0 0.25rem 0' }}>Your <strong>income</strong> tells you what you earn.</p>
            <p style={{ margin: '0 0 0.25rem 0' }}>Your <strong>expenses</strong> tell you what you spend.</p>
            <p style={{ margin: 0 }}>Your <strong>profit</strong> tells you how your business is performing.</p>
          </div>

          {/* Bookings -> Income -> Expenses -> Profit Flow */}
          <div className="flow-container">
            <div className="flow-card">
              <div style={{ fontSize: '0.8rem', fontWeight: 800, color: '#0ea5e9', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.5rem' }}>STEP 1</div>
              <h3 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#0f172a', marginBottom: '0.4rem' }}>BOOKINGS</h3>
              <p style={{ fontSize: '0.925rem', color: '#64748b', margin: 0 }}>Know what's happening.</p>
            </div>

            <div className="flow-card">
              <div style={{ fontSize: '0.8rem', fontWeight: 800, color: '#059669', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.5rem' }}>STEP 2</div>
              <h3 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#0f172a', marginBottom: '0.4rem' }}>INCOME</h3>
              <p style={{ fontSize: '0.925rem', color: '#64748b', margin: 0 }}>Know what you earn.</p>
            </div>

            <div className="flow-card">
              <div style={{ fontSize: '0.8rem', fontWeight: 800, color: '#d97706', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.5rem' }}>STEP 3</div>
              <h3 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#0f172a', marginBottom: '0.4rem' }}>EXPENSES</h3>
              <p style={{ fontSize: '0.925rem', color: '#64748b', margin: 0 }}>Know what you spend.</p>
            </div>

            <div className="flow-card" style={{ border: '2px solid #059669', background: 'rgba(5, 150, 105, 0.03)' }}>
              <div style={{ fontSize: '0.8rem', fontWeight: 800, color: '#059669', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.5rem' }}>RESULT</div>
              <h3 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#059669', marginBottom: '0.4rem' }}>PROFIT</h3>
              <p style={{ fontSize: '0.925rem', color: '#475569', margin: 0, fontWeight: 600 }}>Know what you make.</p>
            </div>
          </div>
        </div>
      </section>

      {/* STOP MANAGING YOUR PROPERTY IN PIECES */}
      <section style={{ padding: '5rem 1.5rem', background: '#f8fafc', textAlign: 'center' }}>
        <div style={{ maxWidth: '850px', margin: '0 auto' }}>
          
          <h2 style={{ fontSize: '2.25rem', fontWeight: 800, color: '#0f172a', marginBottom: '1rem', letterSpacing: '-0.02em' }}>
            Stop Managing Your Property in Pieces.
          </h2>
          
          <p style={{ fontSize: '1.15rem', color: '#475569', lineHeight: 1.6, maxWidth: '680px', margin: '0 auto 3rem' }}>
            Move away from scattered notebooks, spreadsheets, and separate calculations. Stay Pilot gives you one simple place to manage your bookings and understand your numbers.
          </p>

          {/* Fragmented Tools -> Stay Pilot Unified Box */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1.5rem' }}>
            
            {/* Fragmented Tools Row */}
            <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', justifyContent: 'center', width: '100%' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.75rem 1.25rem', background: '#ffffff', borderRadius: '12px', color: '#475569', fontWeight: 600, fontSize: '0.95rem', border: '1px solid #e2e8f0', boxShadow: '0 2px 8px rgba(0,0,0,0.02)' }}>
                <Smartphone size={18} color="#25D366" /> WhatsApp
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.75rem 1.25rem', background: '#ffffff', borderRadius: '12px', color: '#475569', fontWeight: 600, fontSize: '0.95rem', border: '1px solid #e2e8f0', boxShadow: '0 2px 8px rgba(0,0,0,0.02)' }}>
                <Receipt size={18} color="#d97706" /> Notebook
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.75rem 1.25rem', background: '#ffffff', borderRadius: '12px', color: '#475569', fontWeight: 600, fontSize: '0.95rem', border: '1px solid #e2e8f0', boxShadow: '0 2px 8px rgba(0,0,0,0.02)' }}>
                <FileSpreadsheet size={18} color="#059669" /> Spreadsheet
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.75rem 1.25rem', background: '#ffffff', borderRadius: '12px', color: '#475569', fontWeight: 600, fontSize: '0.95rem', border: '1px solid #e2e8f0', boxShadow: '0 2px 8px rgba(0,0,0,0.02)' }}>
                <Calculator size={18} color="#0ea5e9" /> Calculator
              </div>
            </div>

            {/* Down Arrow Indicator */}
            <div style={{ color: '#059669', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
              <span style={{ fontSize: '0.75rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#64748b' }}>Replaced By One System</span>
              <ArrowDown size={24} color="#059669" />
            </div>

            {/* STAY PILOT Unified Box */}
            <div style={{ 
              padding: '2rem 3rem', 
              background: 'linear-gradient(135deg, #064e3b 0%, #020617 100%)', 
              borderRadius: '20px', 
              color: 'white', 
              boxShadow: '0 20px 40px -10px rgba(6, 78, 59, 0.4)',
              width: '100%',
              maxWidth: '620px'
            }}>
              <div style={{ fontSize: '1.5rem', fontWeight: 800, letterSpacing: '0.03em', marginBottom: '0.5rem' }} className="gradient-text">
                STAY PILOT UNIFIED PLATFORM
              </div>
              <div style={{ display: 'flex', gap: '1.25rem', flexWrap: 'wrap', justifyContent: 'center', color: '#cbd5e1', fontSize: '0.975rem', fontWeight: 600 }}>
                <span>Bookings</span> &bull; <span>Income</span> &bull; <span>Expenses</span> &bull; <span>Performance</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* FINAL CONVERSION CTA */}
      <section style={{ padding: '5rem 1.5rem', background: '#ffffff', textAlign: 'center', borderTop: '1px solid #e2e8f0' }}>
        <div style={{ maxWidth: '800px', margin: '0 auto' }}>
          <h2 style={{ fontSize: 'clamp(2rem, 4vw, 2.75rem)', fontWeight: 800, color: '#0f172a', marginBottom: '1rem', letterSpacing: '-0.02em' }}>
            Ready to simplify your property management?
          </h2>
          <p style={{ fontSize: '1.2rem', color: '#64748b', marginBottom: '2.5rem', lineHeight: 1.6, maxWidth: '600px', marginInline: 'auto' }}>
            Manage bookings, finances, and property performance from one simple, unified platform.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.75rem' }}>
            <Link to="/pricing" style={{ padding: '16px 36px', fontSize: '1.1rem', fontWeight: 700, borderRadius: '8px', background: 'linear-gradient(135deg, #059669 0%, #10b981 100%)', color: '#fff', textDecoration: 'none', boxShadow: '0 10px 25px -5px rgba(5, 150, 105, 0.35)', display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
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
          <Link to="/features" style={{ color: 'inherit', textDecoration: 'none' }}>Features</Link>
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
