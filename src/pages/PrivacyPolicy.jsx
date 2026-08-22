import React from 'react';
import { ArrowLeft, Shield } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export default function PrivacyPolicy() {
  const navigate = useNavigate();

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-color)', color: 'var(--text-main)', display: 'flex', flexDirection: 'column' }}>
      
      {/* Header */}
      <header style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg-secondary)', padding: '1.25rem 2rem', display: 'flex', alignItems: 'center', gap: '1rem', position: 'sticky', top: 0, zIndex: 10 }}>
        <button 
          onClick={() => navigate('/')}
          className="btn btn-outline"
          style={{ padding: '0.5rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          title="Back to Home"
        >
          <ArrowLeft size={18} />
        </button>
        <Shield size={24} color="var(--primary)" />
        <h1 style={{ fontSize: '1.25rem', fontWeight: 800, margin: 0, color: 'var(--primary)' }}>Privacy Policy</h1>
      </header>

      {/* Content */}
      <main style={{ flex: 1, maxWidth: '800px', margin: '0 auto', padding: '3rem 1.5rem', lineHeight: 1.6 }}>
        <div className="card" style={{ padding: '2.5rem', background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: '12px', boxShadow: 'var(--shadow-sm)' }}>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '2rem' }}><strong>Last Updated:</strong> August 2026</p>

          <h2 style={{ fontSize: '1.5rem', fontWeight: 800, marginTop: '2rem', marginBottom: '1rem', color: 'var(--primary)' }}>1. Introduction</h2>
          <p style={{ marginBottom: '1rem' }}>
            Welcome to StayPilot. We respect your privacy and are committed to protecting your personal data. This privacy policy will inform you as to how we look after your personal data when you visit our website or use our application, and tell you about your privacy rights and how the law protects you.
          </p>

          <h2 style={{ fontSize: '1.5rem', fontWeight: 800, marginTop: '2rem', marginBottom: '1rem', color: 'var(--primary)' }}>2. Data We Collect</h2>
          <p style={{ marginBottom: '1rem' }}>We may collect, use, store and transfer different kinds of personal data about you which we have grouped together as follows:</p>
          <ul style={{ marginLeft: '1.5rem', marginBottom: '1rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <li><strong>Identity Data:</strong> includes first name, last name, username or similar identifier, and government-issued identification numbers (such as Aadhar cards or passports) uploaded by you or on your behalf.</li>
            <li><strong>Contact Data:</strong> includes billing address, email address, and telephone numbers.</li>
            <li><strong>Property Data:</strong> includes details about accommodations, room assignments, and booking references.</li>
            <li><strong>Other Personal Info:</strong> includes vehicle registration numbers or license plate information recorded during stays.</li>
          </ul>

          <h2 style={{ fontSize: '1.5rem', fontWeight: 800, marginTop: '2rem', marginBottom: '1rem', color: 'var(--primary)' }}>3. How We Use Your Data</h2>
          <p style={{ marginBottom: '1rem' }}>We will only use your personal data when the law allows us to. Most commonly, we will use your personal data in the following circumstances:</p>
          <ul style={{ marginLeft: '1.5rem', marginBottom: '1rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <li>Where we need to perform the contract we are about to enter into or have entered into with you (e.g., providing hotel management software functionality).</li>
            <li>Where it is necessary for our legitimate interests (or those of a third party) and your interests and fundamental rights do not override those interests.</li>
            <li>Where we need to comply with a legal obligation.</li>
          </ul>
          
          <div style={{ background: 'rgba(5, 150, 105, 0.05)', padding: '1.5rem', borderRadius: '8px', borderLeft: '4px solid var(--primary)', margin: '1.5rem 0' }}>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 700, margin: '0 0 0.5rem 0' }}>Data Processing on Behalf of Third Parties (Hotel Managers)</h3>
            <p style={{ margin: 0, fontSize: '0.9rem' }}>
              StayPilot provides software to hotel and resort managers. When our clients (the managers) use StayPilot to record information about their guests (such as Aadhar numbers, Vehicle numbers, and contact details), StayPilot acts as a Data Processor. We securely store this data strictly for the purpose of providing application functionality to our clients, and we do not sell or share this data with unauthorized third parties.
            </p>
          </div>

          <h2 style={{ fontSize: '1.5rem', fontWeight: 800, marginTop: '2rem', marginBottom: '1rem', color: 'var(--primary)' }}>4. Data Security</h2>
          <p style={{ marginBottom: '1rem' }}>
            We have put in place appropriate security measures to prevent your personal data from being accidentally lost, used or accessed in an unauthorized way, altered, or disclosed. In addition, we limit access to your personal data to those employees, agents, contractors, and other third parties who have a business need to know.
          </p>

          <h2 style={{ fontSize: '1.5rem', fontWeight: 800, marginTop: '2rem', marginBottom: '1rem', color: 'var(--primary)' }}>5. Your Legal Rights</h2>
          <p style={{ marginBottom: '1rem' }}>
            Under certain circumstances, you have rights under data protection laws in relation to your personal data, including the right to request access, correction, erasure, restriction, transfer, to object to processing, to portability of data and (where the lawful ground of processing is consent) to withdraw consent.
          </p>

          <h2 style={{ fontSize: '1.5rem', fontWeight: 800, marginTop: '2rem', marginBottom: '1rem', color: 'var(--primary)' }}>6. Contact Us</h2>
          <p style={{ marginBottom: '1rem' }}>
            If you have any questions about this privacy policy or our privacy practices, please contact us.
          </p>
        </div>
      </main>
      
      <footer style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem', borderTop: '1px solid var(--border)', background: 'var(--bg-secondary)' }}>
        &copy; {new Date().getFullYear()} StayPilot. All rights reserved.
      </footer>
    </div>
  );
}
