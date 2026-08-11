import React, { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Home, Calendar, IndianRupee, Receipt, BarChart3, TrendingUp, Smartphone, FileSpreadsheet, Calculator, ArrowRight } from 'lucide-react';

export default function HowItWorks() {
  
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  const workflowSteps = [
    {
      num: '01',
      icon: <Home size={32} />,
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
    <div style={{ fontFamily: "'Inter', sans-serif", color: '#172033', background: 'linear-gradient(135deg, #f0fdf4 0%, #e0f2fe 50%, #f8fafc 100%)', minHeight: '100vh', overflowX: 'hidden' }}>
      
      {/* GLOBAL STYLES FOR TIMELINE AND HOVER EFFECTS */}
      <style dangerouslySetInnerHTML={{__html: `
        .hiw-nav {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 1rem 2rem;
          background: rgba(255, 255, 255, 0.85);
          backdrop-filter: blur(12px);
          border-bottom: 1px solid rgba(255, 255, 255, 0.3);
          position: sticky;
          top: 0;
          z-index: 100;
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
          background: #E8F7F1;
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
          background: rgba(255, 255, 255, 0.9);
          backdrop-filter: blur(10px);
          padding: 1.5rem;
          border-radius: 16px;
          border: 1px solid rgba(255, 255, 255, 0.5);
          box-shadow: 0 4px 15px rgba(0,0,0,0.02);
          transition: all 0.3s ease;
          margin-left: 20px;
          margin-right: 20px;
        }

        .step-icon-wrap {
          width: 60px;
          height: 60px;
          border-radius: 12px;
          background: #E8F7F1;
          color: #0A9F72;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          transition: all 0.3s ease;
          border: 2px solid white;
          box-shadow: 0 0 0 2px #0A9F72;
        }

        .step-content {
          flex: 1;
        }

        .step-num {
          font-size: 0.9rem;
          font-weight: 700;
          color: #0A9F72;
          margin-bottom: 0.25rem;
        }

        .step-points {
          display: none;
          margin-top: 1rem;
          padding-top: 1rem;
          border-top: 1px solid #E5EAF0;
          list-style: none;
          padding-left: 0;
        }

        .step-points li {
          font-size: 0.9rem;
          color: #64748B;
          margin-bottom: 0.5rem;
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }
        
        .step-points li::before {
          content: '';
          width: 6px;
          height: 6px;
          background: #0A9F72;
          border-radius: 50%;
        }

        /* Hover States for Desktop */
        .step-card:hover {
          transform: translateY(-5px);
          box-shadow: 0 20px 40px rgba(5, 150, 105, 0.1) !important;
          border-color: #0A9F72;
        }
        
        .step-card:hover .step-icon-wrap {
          background: #0A9F72;
          color: white;
          transform: scale(1.1);
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
            background: #E8F7F1;
            z-index: -1;
            border-radius: 4px;
          }

          /* Interactive line highlighting */
          .step-card:hover:not(:nth-child(3n))::after {
            background: #0A9F72;
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
          box-shadow: 0 4px 15px rgba(5, 150, 105, 0.3);
        }
        .btn-primary:hover {
          transform: translateY(-2px);
          box-shadow: 0 8px 25px rgba(5, 150, 105, 0.4);
        }
        .btn-outline {
          background: rgba(255,255,255,0.9);
          backdrop-filter: blur(10px);
          color: #123B6D;
          border: 1px solid #cbd5e1;
        }
        .btn-outline:hover {
          border-color: #123B6D;
        }
      `}} />

      {/* HEADER */}
      <header className="hiw-nav">
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <Link to="/" style={{ display: 'flex', alignItems: 'center', textDecoration: 'none' }}>
            <span style={{ fontSize: '1.25rem', fontWeight: 800, letterSpacing: '0.05em', color: '#123B6D' }}>
              STAY PILOT
            </span>
          </Link>
        </div>
        
        <nav className="desktop-links" style={{ gap: '2rem', fontWeight: 600, color: '#64748B' }}>
          <Link to="/" style={{ color: 'inherit', textDecoration: 'none' }}>Home</Link>
          <a href="/#features" style={{ color: 'inherit', textDecoration: 'none' }}>Features</a>
          <Link to="/how-it-works" style={{ color: '#0A9F72', textDecoration: 'none' }}>How It Works</Link>
          <a href="/#pricing" style={{ color: 'inherit', textDecoration: 'none' }}>Pricing</a>
        </nav>
        
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          <Link to="/auth" style={{ padding: '0.5rem 1rem', fontWeight: 600, color: '#123B6D', textDecoration: 'none' }}>Sign In</Link>
          <Link to="/auth?mode=signup" className="btn btn-primary" style={{ padding: '0.6rem 1.2rem' }}>Get Started Free</Link>
        </div>
      </header>

      {/* MAIN WORKFLOW SECTION */}
      <section style={{ padding: '6rem 0', background: 'transparent' }}>
        <div style={{ textAlign: 'center', marginBottom: '3rem', padding: '0 2rem' }}>
          <h2 style={{ fontSize: '2.5rem', fontWeight: 800, color: '#123B6D', marginBottom: '1rem' }}>The Stay Pilot Workflow</h2>
          <p style={{ fontSize: '1.15rem', color: '#64748B', maxWidth: '600px', margin: '0 auto' }}>
            Everything you need to manage your stay business, from setting up your property to making better decisions.
          </p>
        </div>

        <div className="timeline-container">
          {workflowSteps.map((step, idx) => (
            <div key={idx} className="step-card">
              <div className="step-icon-wrap">
                {step.icon}
              </div>
              <div className="step-content">
                <div className="step-num">STEP {step.num}</div>
                <h3 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#123B6D', marginBottom: '0.25rem' }}>{step.title}</h3>
                <div style={{ color: '#0A9F72', fontWeight: 600, fontSize: '0.95rem', marginBottom: '0.75rem' }}>{step.short}</div>
                <p style={{ color: '#172033', lineHeight: 1.5, fontSize: '0.95rem' }}>{step.desc}</p>
                <ul className="step-points">
                  {step.points.map((pt, i) => (
                    <li key={i}>{pt}</li>
                  ))}
                </ul>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* HERO SECTION */}
      <section style={{ padding: '5rem 2rem 4rem', textAlign: 'center', position: 'relative' }}>
        {/* Background ambient blobs */}
        <div style={{ position: 'absolute', top: '10%', left: '15%', width: '300px', height: '300px', background: 'rgba(5, 150, 105, 0.15)', filter: 'blur(80px)', borderRadius: '50%', zIndex: 0, pointerEvents: 'none' }}></div>
        <div style={{ position: 'absolute', top: '30%', right: '15%', width: '350px', height: '350px', background: 'rgba(56, 189, 248, 0.15)', filter: 'blur(80px)', borderRadius: '50%', zIndex: 0, pointerEvents: 'none' }}></div>
        
        <div style={{ maxWidth: '800px', margin: '0 auto', position: 'relative', zIndex: 1 }}>
          <div style={{ 
            display: 'inline-block', 
            padding: '0.4rem 1rem', 
            background: 'rgba(10, 159, 114, 0.1)', 
            color: '#0A9F72', 
            borderRadius: '20px', 
            fontSize: '0.875rem', 
            fontWeight: 700,
            letterSpacing: '0.05em',
            marginBottom: '1.5rem'
          }}>
            HOW STAY PILOT WORKS
          </div>
          <h1 style={{ fontSize: 'clamp(2.5rem, 5vw, 4rem)', fontWeight: 800, color: '#123B6D', lineHeight: 1.1, marginBottom: '1.5rem' }}>
            From Booking to Better Business.
          </h1>
          <p style={{ fontSize: '1.25rem', color: '#334155', lineHeight: 1.6, marginBottom: '2.5rem' }}>
            Stay Pilot connects your property, bookings and finances in one simple workflow — helping you know what is booked, what you earn, what you spend and what you make.
          </p>
          <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', flexWrap: 'wrap' }}>
            <Link to="/auth?mode=signup" className="btn btn-primary" style={{ padding: '1.2rem 3rem', fontSize: '1.1rem' }}>
              Get Started Free
            </Link>
            <Link to="/auth" className="btn btn-outline" style={{ padding: '1.2rem 3rem', fontSize: '1.1rem' }}>
              Sign In
            </Link>
          </div>
        </div>
      </section>



      {/* THE BIGGER PICTURE */}
      <section style={{ padding: '6rem 2rem', background: 'transparent' }}>
        <div style={{ maxWidth: '1000px', margin: '0 auto', textAlign: 'center' }}>
          <h2 style={{ fontSize: '2.5rem', fontWeight: 800, color: '#123B6D', marginBottom: '2rem' }}>One Workflow. One Clear Picture.</h2>
          <p style={{ fontSize: '1.25rem', color: '#64748B', lineHeight: 1.6, maxWidth: '600px', margin: '0 auto 1.5rem' }}>
            Your bookings tell you what is happening.<br/>
            Your income tells you what you earn.<br/>
            Your expenses tell you what you spend.<br/>
            Your profit tells you how your business is performing.
          </p>
          <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#0A9F72', marginBottom: '4rem' }}>
            Stay Pilot brings them together.
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1.5rem' }}>
            <div style={{ background: 'rgba(255, 255, 255, 0.9)', backdropFilter: 'blur(10px)', padding: '2rem', borderRadius: '16px', border: '1px solid rgba(255, 255, 255, 0.5)' }}>
              <h4 style={{ color: '#123B6D', fontWeight: 800, fontSize: '1.1rem', marginBottom: '0.5rem' }}>BOOKINGS</h4>
              <p style={{ color: '#64748B', margin: 0, fontSize: '0.95rem' }}>Know what's happening.</p>
            </div>
            <div style={{ background: 'rgba(255, 255, 255, 0.9)', backdropFilter: 'blur(10px)', padding: '2rem', borderRadius: '16px', border: '1px solid rgba(255, 255, 255, 0.5)' }}>
              <h4 style={{ color: '#123B6D', fontWeight: 800, fontSize: '1.1rem', marginBottom: '0.5rem' }}>INCOME</h4>
              <p style={{ color: '#64748B', margin: 0, fontSize: '0.95rem' }}>Know what you earn.</p>
            </div>
            <div style={{ background: 'rgba(255, 255, 255, 0.9)', backdropFilter: 'blur(10px)', padding: '2rem', borderRadius: '16px', border: '1px solid rgba(255, 255, 255, 0.5)' }}>
              <h4 style={{ color: '#123B6D', fontWeight: 800, fontSize: '1.1rem', marginBottom: '0.5rem' }}>EXPENSES</h4>
              <p style={{ color: '#64748B', margin: 0, fontSize: '0.95rem' }}>Know what you spend.</p>
            </div>
            <div style={{ background: 'rgba(255, 255, 255, 0.9)', backdropFilter: 'blur(10px)', padding: '2rem', borderRadius: '16px', border: '1px solid rgba(255, 255, 255, 0.5)' }}>
              <h4 style={{ color: '#123B6D', fontWeight: 800, fontSize: '1.1rem', marginBottom: '0.5rem' }}>PROFIT</h4>
              <p style={{ color: '#64748B', margin: 0, fontSize: '0.95rem' }}>Know what you make.</p>
            </div>
          </div>
        </div>
      </section>

      {/* FINAL VALUE SECTION */}
      <section style={{ padding: '6rem 2rem', background: 'transparent', textAlign: 'center', borderTop: '1px solid rgba(255, 255, 255, 0.5)' }}>
        <div style={{ maxWidth: '800px', margin: '0 auto' }}>
          <h2 style={{ fontSize: '2.5rem', fontWeight: 800, color: '#123B6D', marginBottom: '1rem' }}>Stop Managing Your Property in Pieces.</h2>
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

            <div style={{ padding: '2rem 3rem', background: '#123B6D', borderRadius: '16px', color: 'white', boxShadow: '0 20px 40px rgba(18,59,109,0.15)' }}>
              <div style={{ fontSize: '1.5rem', fontWeight: 800, letterSpacing: '0.05em', marginBottom: '1rem' }}>STAY PILOT</div>
              <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', justifyContent: 'center', color: '#cbd5e1' }}>
                <span>Dashboard</span> &bull; <span>Calendar</span> &bull; <span>Financials</span> &bull; <span>Reports</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* FINAL CTA */}
      <section style={{ padding: '6rem 2rem', background: 'transparent', textAlign: 'center' }}>
        <div style={{ maxWidth: '800px', margin: '0 auto' }}>
          <h2 style={{ fontSize: '2.5rem', fontWeight: 800, color: '#123B6D', marginBottom: '1.5rem' }}>Ready to Know Your Bookings and Your Numbers?</h2>
          <p style={{ fontSize: '1.25rem', color: '#0A9F72', marginBottom: '3rem', fontWeight: 500 }}>
            Set up your property, manage your stays, track your finances and make better decisions with Stay Pilot.
          </p>
          <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', flexWrap: 'wrap', marginBottom: '1rem' }}>
            <Link to="/auth?mode=signup" className="btn btn-primary" style={{ padding: '1.2rem 3rem', fontSize: '1.1rem' }}>
              Get Started Free
            </Link>
            <Link to="/auth" className="btn btn-outline" style={{ padding: '1.2rem 3rem', fontSize: '1.1rem' }}>
              Sign In
            </Link>
          </div>
          <p style={{ color: '#64748B', fontSize: '0.9rem' }}>Simple tools for smarter stay management.</p>
        </div>
      </section>

      {/* FOOTER */}
      <footer style={{ padding: '4rem 2rem 2rem', background: 'rgba(255, 255, 255, 0.7)', backdropFilter: 'blur(10px)', borderTop: '1px solid rgba(255, 255, 255, 0.5)' }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto', display: 'flex', flexWrap: 'wrap', gap: '4rem', justifyContent: 'space-between', marginBottom: '3rem' }}>
          <div>
            <div style={{ fontSize: '1.25rem', fontWeight: 800, letterSpacing: '0.05em', color: '#123B6D', marginBottom: '1rem' }}>
              STAY PILOT
            </div>
            <p style={{ color: '#0A9F72', fontWeight: 600, marginBottom: '0.25rem' }}>Know Your Bookings. Know Your Numbers.</p>
            <p style={{ color: '#64748B', margin: 0 }}>Bookings. Income. Expenses. Simplified.</p>
          </div>
          
          <div style={{ display: 'flex', gap: '3rem' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <Link to="/" style={{ color: '#64748B', textDecoration: 'none' }}>Home</Link>
              <Link to="/#features" style={{ color: '#64748B', textDecoration: 'none' }}>Features</Link>
              <Link to="/how-it-works" style={{ color: '#64748B', textDecoration: 'none' }}>How It Works</Link>
              <Link to="/#pricing" style={{ color: '#64748B', textDecoration: 'none' }}>Pricing</Link>
              <Link to="/auth" style={{ color: '#64748B', textDecoration: 'none' }}>Sign In</Link>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
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
