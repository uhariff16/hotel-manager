import React, { useEffect } from 'react';
import { ArrowLeft, Shield } from 'lucide-react';
import { useNavigate, Link } from 'react-router-dom';

export default function PrivacyPolicy() {
  const navigate = useNavigate();

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  return (
    <div style={{ 
      minHeight: '100vh', 
      display: 'flex', 
      flexDirection: 'column', 
      background: 'linear-gradient(135deg, #f0fdf4 0%, #e0f2fe 35%, #eef2ff 70%, #faf5ff 100%)', 
      color: '#0f172a', 
      fontFamily: "'Outfit', 'Inter', system-ui, sans-serif" 
    }}>
      
      {/* Header */}
      <header style={{ 
        position: 'sticky', top: 0, zIndex: 100,
        display: 'flex', justifyContent: 'flex-start', alignItems: 'center', gap: '1rem',
        padding: '1.25rem 2rem',
        background: 'rgba(255, 255, 255, 0.7)',
        backdropFilter: 'blur(10px)',
        borderBottom: '1px solid rgba(255,255,255,0.4)',
        boxShadow: '0 4px 30px rgba(0, 0, 0, 0.03)'
      }}>
        <button 
          onClick={() => navigate('/')}
          style={{ 
            padding: '0.5rem', display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'white', border: '1px solid #e2e8f0', borderRadius: '8px', cursor: 'pointer', color: '#0f172a'
          }}
          title="Back to Home"
        >
          <ArrowLeft size={18} />
        </button>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Shield size={22} color="#059669" />
          <h1 style={{ fontSize: '1.2rem', fontWeight: 800, margin: 0, color: '#0F2C59' }}>Privacy Policy</h1>
        </div>
      </header>

      {/* Content */}
      <main style={{ flex: 1, maxWidth: '800px', width: '100%', margin: '0 auto', padding: '3rem 1.5rem', lineHeight: 1.6 }}>
        <div style={{ 
          padding: '2.5rem', 
          background: 'rgba(255, 255, 255, 0.7)', 
          backdropFilter: 'blur(20px)',
          border: '1px solid rgba(255, 255, 255, 0.4)', 
          borderRadius: '16px', 
          boxShadow: '0 20px 40px rgba(15, 44, 89, 0.05)' 
        }}>
          <p style={{ fontSize: '0.9rem', color: '#64748b', marginBottom: '2rem', fontWeight: 500 }}><strong>Last Updated:</strong> August 2026</p>

          <h2 style={{ fontSize: '1.6rem', fontWeight: 800, marginTop: '2rem', marginBottom: '1rem', color: '#0F2C59' }}>1. Introduction</h2>
          <p style={{ marginBottom: '1rem', color: '#334155' }}>
            Welcome to StayPilot. We respect your privacy and are committed to protecting your personal data. This privacy policy will inform you as to how we look after your personal data when you visit our website or use our application, and tell you about your privacy rights and how the law protects you.
          </p>

          <h2 style={{ fontSize: '1.6rem', fontWeight: 800, marginTop: '2rem', marginBottom: '1rem', color: '#0F2C59' }}>2. Data We Collect</h2>
          <p style={{ marginBottom: '1rem', color: '#334155' }}>We may collect, use, store and transfer different kinds of personal data about you which we have grouped together as follows:</p>
          <ul style={{ marginLeft: '1.5rem', marginBottom: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem', color: '#334155' }}>
            <li><strong style={{ color: '#0f172a' }}>Identity Data:</strong> includes first name, last name, username or similar identifier, and government-issued identification numbers or documents uploaded by you or on your behalf.</li>
            <li><strong style={{ color: '#0f172a' }}>Contact Data:</strong> includes billing address, email address, and telephone numbers.</li>
            <li><strong style={{ color: '#0f172a' }}>Property Data:</strong> includes details about accommodations, room assignments, and booking references.</li>
            <li><strong style={{ color: '#0f172a' }}>Other Personal Info:</strong> includes vehicle registration numbers or license plate information recorded during stays.</li>
          </ul>

          <h2 style={{ fontSize: '1.6rem', fontWeight: 800, marginTop: '2rem', marginBottom: '1rem', color: '#0F2C59' }}>3. How We Use Your Data</h2>
          <p style={{ marginBottom: '1rem', color: '#334155' }}>We will only use your personal data when the law allows us to. Most commonly, we will use your personal data in the following circumstances:</p>
          <ul style={{ marginLeft: '1.5rem', marginBottom: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem', color: '#334155' }}>
            <li>Where we need to perform the contract we are about to enter into or have entered into with you (e.g., providing hotel management software functionality).</li>
            <li>Where it is necessary for our legitimate interests (or those of a third party) and your interests and fundamental rights do not override those interests.</li>
            <li>Where we need to comply with a legal obligation.</li>
          </ul>
          
          <div style={{ background: 'rgba(5, 150, 105, 0.08)', padding: '1.5rem', borderRadius: '12px', borderLeft: '4px solid #059669', margin: '2rem 0' }}>
            <h3 style={{ fontSize: '1.15rem', fontWeight: 700, margin: '0 0 0.5rem 0', color: '#059669' }}>Data Processing on Behalf of Third Parties (Hotel Managers)</h3>
            <p style={{ margin: 0, fontSize: '0.95rem', color: '#0f172a', lineHeight: 1.6 }}>
              StayPilot provides software to hotel and resort managers. When our clients (the managers) use StayPilot to record information about their guests (such as government-issued IDs, vehicle registration details, and contact information), StayPilot acts as a Data Processor. We securely store this data strictly for the purpose of providing application functionality to our clients, and we do not sell or share this data with unauthorized third parties.
            </p>
          </div>

          <h2 style={{ fontSize: '1.6rem', fontWeight: 800, marginTop: '2rem', marginBottom: '1rem', color: '#0F2C59' }}>4. Data Security</h2>
          <p style={{ marginBottom: '1rem', color: '#334155' }}>
            We have put in place appropriate security measures to prevent your personal data from being accidentally lost, used or accessed in an unauthorized way, altered, or disclosed. In addition, we limit access to your personal data to those employees, agents, contractors, and other third parties who have a business need to know.
          </p>

          <h2 style={{ fontSize: '1.6rem', fontWeight: 800, marginTop: '2rem', marginBottom: '1rem', color: '#0F2C59' }}>5. Your Legal Rights</h2>
          <p style={{ marginBottom: '1rem', color: '#334155' }}>
            Under certain circumstances, you have rights under data protection laws in relation to your personal data, including the right to request access, correction, erasure, restriction, transfer, to object to processing, to portability of data and (where the lawful ground of processing is consent) to withdraw consent.
          </p>

          <h2 style={{ fontSize: '1.6rem', fontWeight: 800, marginTop: '2rem', marginBottom: '1rem', color: '#0F2C59' }}>6. Contact Us</h2>
          <p style={{ marginBottom: '1rem', color: '#334155' }}>
            If you have any questions about this privacy policy or our privacy practices, please contact us at uhariff@live.com.
          </p>
        </div>
      </main>
      
      {/* Footer */}
      <footer style={{ 
        padding: '3rem 2rem', 
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
