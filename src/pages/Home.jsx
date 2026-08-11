import React from 'react';
import { Link } from 'react-router-dom';
import { useSettingsStore } from '../lib/store';

export default function Home() {
  const { landingPageContent } = useSettingsStore();

  const DEFAULT_CONTENT = {
    headline: "Know Your Bookings. Know Your Numbers.",
    subheadline: "Bookings. Income. Expenses. Simplified. The ultimate property management software for modern hosts.",
    features: [
      { title: "Smart Dashboard", description: "All your metrics at a glance." },
      { title: "Integrated Calendar", description: "Manage all bookings effortlessly." },
      { title: "Financial Reports", description: "Track income and expenses easily." }
    ]
  };

  const content = landingPageContent || DEFAULT_CONTENT;

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', background: '#f8fafc', color: '#0f172a' }}>
      {/* Header */}
      <header style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center', 
        padding: '1rem 2rem', 
        background: 'white',
        borderBottom: '1px solid #e2e8f0',
        boxShadow: '0 2px 10px rgba(0,0,0,0.02)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <img 
            src="/stay-pilot-logo-full.jpg" 
            alt="Stay Pilot" 
            style={{ height: '48px', objectFit: 'contain' }} 
          />
        </div>
        <nav style={{ display: 'flex', gap: '1rem' }}>
          <Link to="/auth" className="btn btn-outline" style={{ padding: '0.5rem 1.5rem', fontWeight: 600 }}>Sign In</Link>
          <Link to="/auth?mode=signup" className="btn btn-primary" style={{ padding: '0.5rem 1.5rem', fontWeight: 600 }}>Sign Up</Link>
        </nav>
      </header>

      {/* Hero Section */}
      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '6rem 2rem', textAlign: 'center' }}>
        <h1 style={{ 
          fontSize: '3.5rem', 
          fontWeight: 800, 
          color: '#0F2C59', 
          maxWidth: '800px', 
          lineHeight: 1.2,
          marginBottom: '1.5rem'
        }}>
          {content.headline}
        </h1>
        
        <p style={{ 
          fontSize: '1.25rem', 
          color: '#475569', 
          maxWidth: '600px', 
          lineHeight: 1.6,
          marginBottom: '3rem'
        }}>
          {content.subheadline}
        </p>

        <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center' }}>
          <Link to="/auth?mode=signup" className="btn btn-primary" style={{ padding: '1rem 2.5rem', fontSize: '1.1rem', fontWeight: 700, borderRadius: '8px' }}>
            Get Started for Free
          </Link>
          <Link to="/auth" className="btn btn-outline" style={{ padding: '1rem 2.5rem', fontSize: '1.1rem', fontWeight: 700, borderRadius: '8px', background: 'white' }}>
            Sign In to Dashboard
          </Link>
        </div>

        {/* Features Grid */}
        <div style={{ 
          display: 'grid', 
          gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', 
          gap: '2rem', 
          width: '100%', 
          maxWidth: '1000px', 
          marginTop: '6rem' 
        }}>
          {content.features?.map((feature, idx) => (
            <div key={idx} style={{ 
              background: 'white', 
              padding: '2rem', 
              borderRadius: '12px', 
              boxShadow: '0 4px 20px rgba(0,0,0,0.05)',
              border: '1px solid #f1f5f9',
              textAlign: 'left'
            }}>
              <div style={{ 
                width: '48px', 
                height: '48px', 
                background: 'rgba(5, 150, 105, 0.1)', 
                borderRadius: '8px', 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'center',
                marginBottom: '1.5rem',
                color: '#059669',
                fontWeight: 'bold',
                fontSize: '1.5rem'
              }}>
                {idx + 1}
              </div>
              <h3 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '0.75rem', color: '#0F2C59' }}>{feature.title}</h3>
              <p style={{ color: '#64748b', lineHeight: 1.5, margin: 0 }}>{feature.description}</p>
            </div>
          ))}
        </div>
      </main>

      {/* Footer */}
      <footer style={{ 
        padding: '2rem', 
        textAlign: 'center', 
        borderTop: '1px solid #e2e8f0',
        background: 'white',
        color: '#94a3b8',
        fontSize: '0.9rem'
      }}>
        &copy; {new Date().getFullYear()} Stay Pilot. All rights reserved.
      </footer>
    </div>
  );
}
