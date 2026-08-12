import React, { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Home as HomeIcon, Calendar, IndianRupee, Receipt, BarChart3, TrendingUp, Smartphone, FileSpreadsheet, Calculator, ArrowRight, Sparkles } from 'lucide-react';

export default function HowItWorks() {
  
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  const workflowSteps = [
    {
      num: '01',
      icon: <HomeIcon size={32} />,
      title: 'Set Up',
      short: 'Your property',
      desc: 'Start by setting up your property and the basic information you need to manage your stay business.',
      points: ['Property details', 'Units / cottages / rooms', 'Pricing', 'Basic settings']
    },
    {
      num: '02',
      icon: <Calendar size={32} />,
      title: 'Book',
      short: 'Add your stays',
      desc: 'Add your bookings and keep your guest and stay information organized in one place.',
      points: ['Guest details', 'Check-in & check-out', 'Booking amount', 'Booking status', 'Payment details']
    },
    {
      num: '03',
      icon: <IndianRupee size={32} />,
      title: 'Collect',
      short: 'Track your income',
      desc: 'Record collections and payments so you always know how much your property is earning.',
      points: ['Booking income', 'Advance payments', 'Balance payments', 'Total collections']
    },
    {
      num: '04',
      icon: <Receipt size={32} />,
      title: 'Spend',
      short: 'Record expenses',
      desc: 'Keep track of the money you spend to operate and maintain your property.',
      points: ['Utilities', 'Cleaning', 'Maintenance', 'Supplies', 'Repairs', 'Other expenses']
    },
    {
      num: '05',
      icon: <BarChart3 size={32} />,
      title: 'Analyze',
      short: 'Understand performance',
      desc: 'Bring your income and expenses together to understand your property\'s financial performance.',
      points: ['Income', 'Expenses', 'Profit', 'Monthly performance', 'Yearly performance', 'Booking trends']
    },
    {
      num: '06',
      icon: <TrendingUp size={32} />,
      title: 'Improve',
      short: 'Make better decisions',
      desc: 'Use your numbers and business insights to make smarter decisions for your property.',
      points: ['Identify trends', 'Control expenses', 'Improve profitability', 'Understand investment', 'Plan with confidence']
    }
  ];

  return (
    <div style={{ 
      fontFamily: "'Outfit', 'Inter', system-ui, sans-serif", 
      color: '#475569', 
      background: 'linear-gradient(135deg, #f0fdf4 0%, #e0f2fe 35%, #eef2ff 70%, #faf5ff 100%)', 
      minHeight: '100vh', 
      overflowX: 'hidden' 
    }}>
      
      {/* GLOBAL STYLES FOR TIMELINE AND HOVER EFFECTS */}
      <style dangerouslySetInnerHTML={{__html: `
        @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700;800&family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap');
        
        .hiw-nav {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 1.25rem 2rem;
          background: rgba(255, 255, 255, 0.75);
          backdrop-filter: blur(16px);
          border-bottom: 1px solid rgba(255, 255, 255, 0.4);
          position: sticky;
          top: 0;
          z-index: 100;
          box-shadow: 0 4px 30px rgba(0, 0, 0, 0.02);
        }
        
        .desktop-links {
          display: none;
        }

        .timeline-container {
          display: flex;
          flex-direction: column;
          gap: 2rem;
          position: relative;
          max-width: 1200px;
          margin: 0 auto;
          padding: 2rem 0;
        }

        /* Mobile Vertical Timeline Line */
        .timeline-container::before {
          content: '';
          position: absolute;
          left: 48px;
          top: 0;
          bottom: 0;
          width: 4px;
          background: rgba(5, 150, 105, 0.1);
          border-radius: 4px;
          z-index: 0;
        }

        .step-card {
          position: relative;
          z-index: 1;
          display: flex;
          flex-direction: row;
          align-items: flex-start;
          gap: 1.5rem;
          background: rgba(255, 255, 255, 0.75);
          backdrop-filter: blur(10px);
          padding: 1.5rem;
          border-radius: 16px;
          border: 1px solid rgba(255, 255, 255, 0.4);
          box-shadow: 0 10px 30px rgba(15, 44, 89, 0.02);
          transition: all 0.3s ease;
          margin-left: 20px;
          margin-right: 20px;
        }

        .step-icon-wrap {
          width: 60px;
          height: 60px;
          border-radius: 12px;
          background: rgba(5, 150, 105, 0.08);
          color: #059669;
          display: flex;
          align-items: center;
          justifyContent: center;
          flex-shrink: 0;
          transition: all 0.3s ease;
          border: 2px solid white;
          box-shadow: 0 0 0 2px #059669;
        }

        .step-content {
          flex: 1;
        }

        .step-num {
          font-size: 0.9rem;
          font-weight: 700;
          color: #059669;
          margin-bottom: 0.25rem;
        }

        .step-points {
          display: none;
          margin: 0.5rem 0 0;
          padding-left: 1.2rem;
          color: #64748B;
          font-size: 0.85rem;
        }

        .step-card:hover {
          transform: translateY(-4px);
          box-shadow: 0 15px 35px rgba(15, 44, 89, 0.06);
          border-color: rgba(5, 150, 105, 0.25);
          background: rgba(255, 255, 255, 0.95);
        }

        .step-card:hover .step-icon-wrap {
          background: #059669;
          color: white;
        }

        .step-card:hover .step-points {
          display: block;
        }

        @media (min-width: 992px) {
          .desktop-links {
            display: flex;
          }
          /* Switch to Horizontal Timeline on Desktop */
          .timeline-container {
            flex-direction: row;
            flex-wrap: wrap;
            gap: 2rem 0;
            padding: 4rem 2rem;
            justify-content: center;
          }
          
          /* Remove mobile vertical line */
          .timeline-container::before {
            display: none;
          }

          .step-card {
            flex-direction: column;
            width: calc(33.333% - 2rem);
            margin: 0 1rem;
            padding: 2.5rem;
            align-items: flex-start;
          }

          /* Connectors for horizontal layout */
          .step-card:not(:nth-child(3n))::after {
            content: '';
            position: absolute;
            top: 55px; /* Aligned with icon center */
            right: -2rem;
            width: calc(2rem + 40px); /* Span the gap */
            height: 4px;
            background: rgba(5, 150, 105, 0.08);
            z-index: -1;
            border-radius: 4px;
          }

          /* Interactive line highlighting */
          .step-card:hover:not(:nth-child(3n))::after {
            background: #059669;
            transition: background 0.3s ease;
          }
        }

        .btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          padding: 0.8rem 1.8rem;
          border-radius: 8px;
          font-weight: 600;
          text-decoration: none;
          transition: all 0.2s;
          border: none;
          cursor: pointer;
        }
        .btn-primary {
          background: linear-gradient(135deg, #059669 0%, #10b981 100%);
          color: white;
          box-shadow: 0 4px 15px rgba(5, 150, 105, 0.25);
        }
        .btn-primary:hover {
          transform: translateY(-2px);
          box-shadow: 0 8px 25px rgba(5, 150, 105, 0.35);
        }
        .btn-outline {
          background: rgba(255,255,255,0.9);
          backdrop-filter: blur(10px);
          color: #0F2C59;
          border: 1px solid #cbd5e1;
        }
        .btn-outline:hover {
          border-color: #0F2C59;
        }
      `}} />

      {/* HEADER */}
      <header className="hiw-nav">
        <Link to="/" style={{ display: 'flex', alignItems: 'center', textDecoration: 'none' }}>
          <img src="/stay-pilot-logo.png" alt="Stay Pilot Logo" style={{ height: '36px', width: 'auto', display: 'block' }} />
        </Link>
        
        <nav className="desktop-links" style={{ gap: '2.5rem', alignItems: 'center', fontWeight: 600, color: '#334155', fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
          <Link to="/" style={{ color: 'inherit', textDecoration: 'none' }}>Home</Link>
          <Link to="/#features" style={{ color: 'inherit', textDecoration: 'none' }}>Features</Link>
          <Link to="/how-it-works" style={{ color: '#059669', textDecoration: 'none' }}>How It Works</Link>
          <Link to="/pricing" style={{ color: 'inherit', textDecoration: 'none' }}>Pricing</Link>
        </nav>
        
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          <Link to="/auth" style={{ padding: '0.5rem 1rem', fontWeight: 600, color: '#0F2C59', textDecoration: 'none', fontFamily: "'Plus Jakarta Sans', sans-serif" }}>Sign In</Link>
          <Link to="/auth?mode=signup" className="btn btn-primary" style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}>Get Started Free</Link>
        </div>
      </header>

      {/* Background ambient blobs */}
      <div style={{ position: 'relative' }}>
        <div style={{ position: 'absolute', top: '100px', left: '5%', width: '350px', height: '350px', background: 'rgba(5, 150, 105, 0.1)', filter: 'blur(90px)', borderRadius: '50%', zIndex: 0, pointerEvents: 'none' }}></div>
        <div style={{ position: 'absolute', top: '400px', right: '5%', width: '400px', height: '400px', background: 'rgba(56, 189, 248, 0.1)', filter: 'blur(90px)', borderRadius: '50%', zIndex: 0, pointerEvents: 'none' }}></div>
      </div>

      {/* HERO TITLE SECTION */}
      <section style={{ padding: '5rem 2rem 4rem', textAlign: 'center', position: 'relative', zIndex: 1 }}>
        <div style={{ maxWidth: '800px', margin: '0 auto' }}>
          <div style={{ 
            display: 'inline-flex', 
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
            marginBottom: '1.5rem'
          }}>
            <Sparkles size={14} /> How Stay Pilot Works
          </div>
          <h1 style={{ fontSize: 'clamp(2.5rem, 5vw, 3.8rem)', fontWeight: 800, color: '#0F2C59', lineHeight: 1.15, marginBottom: '1.5rem', fontFamily: "'Outfit', sans-serif", letterSpacing: '-0.02em' }}>
            From Booking to Better Business.
          </h1>
          <p style={{ fontSize: '1.25rem', color: '#475569', lineHeight: 1.6, marginBottom: '2.5rem', fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
            Stay Pilot connects your property, bookings, and finances in one simple workflow — helping you know what is booked, what you earn, what you spend, and what you make.
          </p>
          <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', flexWrap: 'wrap' }}>
            <Link to="/auth?mode=signup" className="btn btn-primary" style={{ padding: '1.1rem 2.8rem', fontSize: '1.1rem', fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
              Get Started Free
            </Link>
            <Link to="/auth" className="btn btn-outline" style={{ padding: '1.1rem 2.8rem', fontSize: '1.1rem', fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
              Sign In
            </Link>
          </div>
        </div>
      </section>

      {/* MAIN WORKFLOW TIMELINE SECTION */}
      <section style={{ padding: '4rem 0', background: 'transparent', position: 'relative', zIndex: 1 }}>
        <div style={{ textAlign: 'center', marginBottom: '3rem', padding: '0 2rem' }}>
          <h2 style={{ fontSize: '2.4rem', fontWeight: 800, color: '#0F2C59', marginBottom: '1rem', fontFamily: "'Outfit', sans-serif" }}>The Stay Pilot Workflow</h2>
          <p style={{ fontSize: '1.15rem', color: '#475569', maxWidth: '600px', margin: '0 auto', fontFamily: "'Plus Jakarta Sans', sans-serif", lineHeight: 1.6 }}>
            Everything you need to manage your stay business, from setting up your property to making better decisions.
          </p>
        </div>

        <div className="timeline-container">
          {workflowSteps.map((step, idx) => (
            <div key={idx} className="step-card">
              <div className="step-icon-wrap">
                {step.icon}
              </div>
              <div className="step-content" style={{ textAlign: 'left' }}>
                <div className="step-num">STEP {step.num}</div>
                <h3 style={{ fontSize: '1.45rem', fontWeight: 800, color: '#0F2C59', marginBottom: '0.25rem', fontFamily: "'Outfit', sans-serif" }}>{step.title}</h3>
                <div style={{ color: '#059669', fontWeight: 600, fontSize: '0.95rem', marginBottom: '0.75rem', fontFamily: "'Plus Jakarta Sans', sans-serif" }}>{step.short}</div>
                <p style={{ color: '#475569', lineHeight: 1.5, fontSize: '0.95rem', fontFamily: "'Plus Jakarta Sans', sans-serif" }}>{step.desc}</p>
                <ul className="step-points" style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontWeight: 500 }}>
                  {step.points.map((pt, i) => (
                    <li key={i} style={{ marginBottom: '0.25rem' }}>{pt}</li>
                  ))}
                </ul>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* THE BIGGER PICTURE */}
      <section style={{ padding: '6rem 2rem', background: 'transparent', position: 'relative', zIndex: 1 }}>
        <div style={{ maxWidth: '1000px', margin: '0 auto', textAlign: 'center' }}>
          <h2 style={{ fontSize: '2.4rem', fontWeight: 800, color: '#0F2C59', marginBottom: '2rem', fontFamily: "'Outfit', sans-serif" }}>One Workflow. One Clear Picture.</h2>
          <p style={{ fontSize: '1.25rem', color: '#475569', lineHeight: 1.6, maxWidth: '600px', margin: '0 auto 1.5rem', fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
            Your bookings tell you what is happening.<br/>
            Your income tells you what you earn.<br/>
            Your expenses tell you what you spend.<br/>
            Your profit tells you how your business is performing.
          </p>
          <div style={{ fontSize: '1.45rem', fontWeight: 800, color: '#059669', marginBottom: '4rem', fontFamily: "'Outfit', sans-serif" }}>
            Stay Pilot brings them together.
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1.5rem' }}>
            <div style={{ background: 'rgba(255, 255, 255, 0.75)', backdropFilter: 'blur(10px)', padding: '2rem', borderRadius: '16px', border: '1px solid rgba(255, 255, 255, 0.4)', boxShadow: '0 10px 25px rgba(15, 44, 89, 0.02)' }}>
              <h4 style={{ color: '#0F2C59', fontWeight: 800, fontSize: '1.1rem', marginBottom: '0.5rem', fontFamily: "'Outfit', sans-serif" }}>BOOKINGS</h4>
              <p style={{ color: '#475569', margin: 0, fontSize: '0.95rem', fontFamily: "'Plus Jakarta Sans', sans-serif", fontWeight: 500 }}>Know what's happening.</p>
            </div>
            <div style={{ background: 'rgba(255, 255, 255, 0.75)', backdropFilter: 'blur(10px)', padding: '2rem', borderRadius: '16px', border: '1px solid rgba(255, 255, 255, 0.4)', boxShadow: '0 10px 25px rgba(15, 44, 89, 0.02)' }}>
              <h4 style={{ color: '#0F2C59', fontWeight: 800, fontSize: '1.1rem', marginBottom: '0.5rem', fontFamily: "'Outfit', sans-serif" }}>INCOME</h4>
              <p style={{ color: '#475569', margin: 0, fontSize: '0.95rem', fontFamily: "'Plus Jakarta Sans', sans-serif", fontWeight: 500 }}>Know what you earn.</p>
            </div>
            <div style={{ background: 'rgba(255, 255, 255, 0.75)', backdropFilter: 'blur(10px)', padding: '2rem', borderRadius: '16px', border: '1px solid rgba(255, 255, 255, 0.4)', boxShadow: '0 10px 25px rgba(15, 44, 89, 0.02)' }}>
              <h4 style={{ color: '#0F2C59', fontWeight: 800, fontSize: '1.1rem', marginBottom: '0.5rem', fontFamily: "'Outfit', sans-serif" }}>EXPENSES</h4>
              <p style={{ color: '#475569', margin: 0, fontSize: '0.95rem', fontFamily: "'Plus Jakarta Sans', sans-serif", fontWeight: 500 }}>Know what you spend.</p>
            </div>
            <div style={{ background: 'rgba(255, 255, 255, 0.75)', backdropFilter: 'blur(10px)', padding: '2rem', borderRadius: '16px', border: '1px solid rgba(255, 255, 255, 0.4)', boxShadow: '0 10px 25px rgba(15, 44, 89, 0.02)' }}>
              <h4 style={{ color: '#0F2C59', fontWeight: 800, fontSize: '1.1rem', marginBottom: '0.5rem', fontFamily: "'Outfit', sans-serif" }}>PROFIT</h4>
              <p style={{ color: '#475569', margin: 0, fontSize: '0.95rem', fontFamily: "'Plus Jakarta Sans', sans-serif", fontWeight: 500 }}>Know what you make.</p>
            </div>
          </div>
        </div>
      </section>

      {/* COMPARISON PROPOSITION SECTION */}
      <section style={{ padding: '6rem 2rem', background: 'transparent', textAlign: 'center', borderTop: '1px solid rgba(255, 255, 255, 0.3)', position: 'relative', zIndex: 1 }}>
        <div style={{ maxWidth: '800px', margin: '0 auto' }}>
          <h2 style={{ fontSize: '2.4rem', fontWeight: 800, color: '#0F2C59', marginBottom: '1rem', fontFamily: "'Outfit', sans-serif" }}>Stop Managing Your Property in Pieces.</h2>
          <p style={{ fontSize: '1.15rem', color: '#475569', marginBottom: '4rem', fontFamily: "'Plus Jakarta Sans', sans-serif", lineHeight: 1.6 }}>
            Move away from scattered notebooks, spreadsheets and payment records. Stay Pilot gives you one simple place to manage your bookings and understand your numbers.
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2rem' }}>
            <div style={{ display: 'flex', gap: '1.25rem', flexWrap: 'wrap', justifyContent: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '0.85rem 1.5rem', background: 'white', borderRadius: '12px', color: '#64748B', fontWeight: 600, boxShadow: '0 4px 15px rgba(0,0,0,0.02)', border: '1px solid #e2e8f0' }}>
                <Smartphone size={18} color="#25D366" /> WhatsApp
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '0.85rem 1.5rem', background: 'white', borderRadius: '12px', color: '#64748B', fontWeight: 600, boxShadow: '0 4px 15px rgba(0,0,0,0.02)', border: '1px solid #e2e8f0' }}>
                <Receipt size={18} color="#f59e0b" /> Notebook
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '0.85rem 1.5rem', background: 'white', borderRadius: '12px', color: '#64748B', fontWeight: 600, boxShadow: '0 4px 15px rgba(0,0,0,0.02)', border: '1px solid #e2e8f0' }}>
                <FileSpreadsheet size={18} color="#10b981" /> Spreadsheet
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '0.85rem 1.5rem', background: 'white', borderRadius: '12px', color: '#64748B', fontWeight: 600, boxShadow: '0 4px 15px rgba(0,0,0,0.02)', border: '1px solid #e2e8f0' }}>
                <Calculator size={18} color="#0ea5e9" /> Calculator
              </div>
            </div>

            <ArrowRight size={32} color="#cbd5e1" style={{ transform: 'rotate(90deg)' }} />

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
              <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap', justifyContent: 'center', color: '#cbd5e1', fontSize: '1.05rem', fontWeight: 600 }}>
                <span>Dashboard</span> &bull; <span>Calendar</span> &bull; <span>Financials</span> &bull; <span>Reports</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* FINAL CTA SECTION */}
      <section style={{ padding: '6rem 2rem', background: 'transparent', textAlign: 'center', position: 'relative', zIndex: 1 }}>
        <div style={{ maxWidth: '800px', margin: '0 auto' }}>
          <h2 style={{ fontSize: '2.4rem', fontWeight: 800, color: '#0F2C59', marginBottom: '1.5rem', fontFamily: "'Outfit', sans-serif" }}>Ready to Know Your Bookings and Your Numbers?</h2>
          <p style={{ fontSize: '1.25rem', color: '#059669', marginBottom: '3rem', fontWeight: 600, fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
            Set up your property, manage your stays, track your finances and make better decisions with Stay Pilot.
          </p>
          <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', flexWrap: 'wrap', marginBottom: '1.5rem' }}>
            <Link to="/auth?mode=signup" className="btn btn-primary" style={{ padding: '1.1rem 2.8rem', fontSize: '1.1rem', fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
              Get Started Free
            </Link>
            <Link to="/auth" className="btn btn-outline" style={{ padding: '1.1rem 2.8rem', fontSize: '1.1rem', fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
              Sign In
            </Link>
          </div>
          <p style={{ color: '#64748B', fontSize: '0.9rem', fontWeight: 600 }}>Simple tools for smarter stay management.</p>
        </div>
      </section>

      {/* FOOTER */}
      <footer style={{ 
        padding: '4rem 2rem 3rem', 
        borderTop: '1px solid rgba(255,255,255,0.4)',
        background: 'rgba(255, 255, 255, 0.7)',
        backdropFilter: 'blur(10px)',
        color: '#64748b',
        fontSize: '0.95rem',
        fontFamily: "'Plus Jakarta Sans', sans-serif"
      }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto', display: 'flex', flexWrap: 'wrap', gap: '4rem', justifyContent: 'space-between', marginBottom: '3rem', alignItems: 'center' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: '1rem' }}>
              <img src="/stay-pilot-logo.png" alt="Stay Pilot Logo" style={{ height: '24px', width: 'auto', marginRight: '0.5rem' }} />
              <span style={{ fontSize: '1.1rem', fontWeight: 800, color: '#0F2C59', letterSpacing: '0.05em' }}>STAY PILOT</span>
            </div>
            <p style={{ color: '#059669', fontWeight: 600, marginBottom: '0.25rem' }}>Know Your Bookings. Know Your Numbers.</p>
            <p style={{ color: '#64748B', margin: 0 }}>Bookings. Income. Expenses. Simplified.</p>
          </div>
          
          <div style={{ display: 'flex', gap: '3rem' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', fontWeight: 600 }}>
              <Link to="/" style={{ color: '#64748B', textDecoration: 'none' }}>Home</Link>
              <a href="/#features" style={{ color: '#64748B', textDecoration: 'none' }}>Features</a>
              <Link to="/how-it-works" style={{ color: '#64748B', textDecoration: 'none' }}>How It Works</Link>
              <Link to="/pricing" style={{ color: '#64748B', textDecoration: 'none' }}>Pricing</Link>
              <Link to="/auth" style={{ color: '#64748B', textDecoration: 'none' }}>Sign In</Link>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', fontWeight: 600 }}>
              <a href="#" style={{ color: '#64748B', textDecoration: 'none' }}>Privacy Policy</a>
              <a href="#" style={{ color: '#64748B', textDecoration: 'none' }}>Terms of Service</a>
            </div>
          </div>
        </div>
        <div style={{ textAlign: 'center', color: '#94a3b8', fontSize: '0.875rem', paddingTop: '2rem', borderTop: '1px solid rgba(255, 255, 255, 0.5)' }}>
          &copy; {new Date().getFullYear()} Stay Pilot. All rights reserved.
        </div>
      </footer>
    </div>
  );
}
