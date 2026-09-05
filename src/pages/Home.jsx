import React, { useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useSettingsStore } from '../lib/store';
import { 
  ArrowRight, LayoutDashboard, BookOpenCheck, CalendarDays, Wallet, 
  FileText, TrendingUp, Users, CreditCard, Sparkles, CheckCircle2, 
  Shield, Zap, Smartphone, Play, Globe, Check
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

  const PLAY_STORE_LINK = "https://play.google.com/store/apps/details?id=com.staypilot.app";

  return (
    <div style={{ fontFamily: 'var(--font-sans, system-ui, sans-serif)', overflowX: 'hidden' }}>
      <style>{`
        .gradient-text {
          background: linear-gradient(135deg, var(--primary) 0%, #0369a1 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
        }
        .hero-bg {
          background: radial-gradient(circle at top center, rgba(5, 150, 105, 0.05) 0%, rgba(3, 105, 161, 0.05) 100%);
        }
        .glass-card {
          background: rgba(255, 255, 255, 0.7);
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
          border: 1px solid rgba(255, 255, 255, 0.5);
          box-shadow: 0 10px 30px -10px rgba(0, 0, 0, 0.05);
          transition: transform 0.3s ease, box-shadow 0.3s ease;
        }
        .glass-card:hover {
          transform: translateY(-5px);
          box-shadow: 0 20px 40px -10px rgba(5, 150, 105, 0.1);
        }
        .play-store-btn {
          display: flex;
          align-items: center;
          gap: 12px;
          background: #000;
          color: #fff;
          padding: 10px 24px;
          border-radius: 8px;
          text-decoration: none;
          transition: transform 0.2s, background 0.2s;
          border: 1px solid #333;
        }
        .play-store-btn:hover {
          transform: scale(1.02);
          background: #111;
        }
        .app-section {
          background: linear-gradient(135deg, #0f172a 0%, #0c4a6e 100%);
          color: white;
          position: relative;
          overflow: hidden;
        }
        .float-anim {
          animation: float 6s ease-in-out infinite;
        }
        .float-anim-delayed {
          animation: float 6s ease-in-out infinite 3s;
        }
        @keyframes float {
          0% { transform: translateY(0px); }
          50% { transform: translateY(-20px); }
          100% { transform: translateY(0px); }
        }
        .mockup-container {
          position: relative;
          width: 100%;
          max-width: 1000px;
          margin: 0 auto;
          margin-top: 4rem;
        }
        .web-mockup {
          width: 100%;
          border-radius: 16px;
          box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
          border: 1px solid rgba(255,255,255,0.1);
          background: #f8fafc;
          aspect-ratio: 16/9;
          overflow: hidden;
          position: relative;
        }
        .mobile-mockup {
          position: absolute;
          bottom: -10%;
          right: -5%;
          width: 25%;
          min-width: 200px;
          aspect-ratio: 9/19.5;
          background: #fff;
          border-radius: 32px;
          box-shadow: -10px 20px 40px rgba(0,0,0,0.3);
          border: 6px solid #1e293b;
          overflow: hidden;
          z-index: 10;
        }
        /* Mobile responsive adjustments */
        @media (max-width: 768px) {
          .mockup-container { margin-top: 2rem; }
          .mobile-mockup { right: 5%; bottom: -5%; width: 35%; border-width: 4px; border-radius: 20px; }
          .hero-title { font-size: 2.5rem !important; line-height: 1.2 !important; }
        }
      `}</style>

      {/* HERO SECTION */}
      <section className="hero-bg" style={{ padding: '6rem 1.5rem', textAlign: 'center', minHeight: '90vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ maxWidth: '800px', margin: '0 auto', zIndex: 2 }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', background: 'rgba(5, 150, 105, 0.1)', color: 'var(--primary)', padding: '6px 16px', borderRadius: '30px', fontSize: '0.9rem', fontWeight: 600, marginBottom: '2rem' }}>
            <Sparkles size={16} /> New: StayPilot Android App is Live!
          </div>
          
          <h1 className="hero-title gradient-text" style={{ fontSize: '4.5rem', fontWeight: 800, margin: '0 0 1.5rem 0', letterSpacing: '-0.03em', lineHeight: 1.1 }}>
            Know Your Bookings.<br/>Know Your Numbers.
          </h1>
          
          <p style={{ fontSize: '1.25rem', color: '#475569', margin: '0 0 2.5rem 0', lineHeight: 1.6, maxWidth: '600px', marginInline: 'auto' }}>
            The all-in-one platform built for independent properties. Manage reservations, track financials, and scale your business effortlessly from any device.
          </p>

          <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', flexWrap: 'wrap', alignItems: 'center' }}>
            <Link to="/auth" className="btn btn-primary" style={{ padding: '14px 32px', fontSize: '1.1rem', borderRadius: '8px', boxShadow: '0 10px 25px -5px rgba(5, 150, 105, 0.4)' }}>
              Start for Free
            </Link>
            <a href={PLAY_STORE_LINK} target="_blank" rel="noopener noreferrer" className="play-store-btn">
              <img src="https://upload.wikimedia.org/wikipedia/commons/7/78/Google_Play_Store_badge_EN.svg" alt="Get it on Google Play" style={{ height: '32px' }} />
            </a>
          </div>
        </div>

        {/* MOCKUP SHOWCASE */}
        <div className="mockup-container float-anim">
          <div className="web-mockup">
            <div style={{ background: '#e2e8f0', padding: '12px', display: 'flex', gap: '8px', borderBottom: '1px solid #cbd5e1' }}>
              <div style={{ width: 12, height: 12, borderRadius: '50%', background: '#ef4444' }}></div>
              <div style={{ width: 12, height: 12, borderRadius: '50%', background: '#f59e0b' }}></div>
              <div style={{ width: 12, height: 12, borderRadius: '50%', background: '#10b981' }}></div>
            </div>
            {/* REPLACE THIS DIV WITH AN IMG TAG FOR WEB SCREENSHOT */}
            <div style={{ width: '100%', height: '100%', background: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', fontSize: '1.5rem' }}>
              [ Placeholder: Replace with Web App High-Res Screenshot ]
              {/* <img src="/assets/web-screenshot.png" alt="StayPilot Web Dashboard" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> */}
            </div>
          </div>
          
          <div className="mobile-mockup float-anim-delayed">
            {/* REPLACE THIS DIV WITH AN IMG TAG FOR MOBILE SCREENSHOT */}
            <div style={{ width: '100%', height: '100%', background: '#e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b', textAlign: 'center', padding: '1rem' }}>
              [ Mobile App Screenshot ]
              {/* <img src="/assets/mobile-screenshot.png" alt="StayPilot Mobile App" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> */}
            </div>
          </div>
        </div>
      </section>

      {/* PARTNERS / TRUST SECTION */}
      <section style={{ padding: '3rem 1.5rem', background: '#fff', borderTop: '1px solid #f1f5f9', borderBottom: '1px solid #f1f5f9', textAlign: 'center' }}>
        <p style={{ textTransform: 'uppercase', letterSpacing: '2px', color: '#64748b', fontSize: '0.85rem', fontWeight: 600, marginBottom: '2rem' }}>
          Trusted by modern properties worldwide
        </p>
        <div style={{ display: 'flex', justifyContent: 'center', gap: '3rem', flexWrap: 'wrap', opacity: 0.6 }}>
          {['Cottages', 'Villas', 'Boutique Hotels', 'Guest Houses', 'Homestays'].map((type, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '1.25rem', fontWeight: 700, color: '#334155' }}>
              <CheckCircle2 size={24} color="var(--primary)" /> {type}
            </div>
          ))}
        </div>
      </section>

      {/* FEATURES GRID */}
      <section style={{ padding: '6rem 1.5rem', background: '#f8fafc' }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: '4rem' }}>
            <h2 style={{ fontSize: '2.5rem', fontWeight: 800, color: '#0f172a', marginBottom: '1rem' }}>Everything you need to scale.</h2>
            <p style={{ fontSize: '1.1rem', color: '#64748b', maxWidth: '600px', margin: '0 auto' }}>Stop managing your property in pieces. Bring your bookings, finances, and team into one powerful platform.</p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '2rem' }}>
            {[
              { icon: <BookOpenCheck />, title: 'Smart Reservations', desc: 'Centralized booking management with live status tracking.', color: '#059669' },
              { icon: <CalendarDays />, title: 'Visual Calendar', desc: 'Prevent double-bookings with our intuitive timeline view.', color: '#0369a1' },
              { icon: <Wallet />, title: 'Financial Tracking', desc: 'Log expenses and track revenue automatically.', color: '#b45309' },
              { icon: <TrendingUp />, title: 'ROI Analysis', desc: 'Deep insights into your property investment health.', color: '#6d28d9' },
              { icon: <Users />, title: 'Staff Access', desc: 'Role-based access for your managers and receptionists.', color: '#be123c' },
              { icon: <Zap />, title: 'Instant Sync', desc: 'Changes reflect instantly across web and mobile apps.', color: '#1d4ed8' },
            ].map((feat, i) => (
              <div key={i} className="glass-card" style={{ padding: '2rem', borderRadius: '16px' }}>
                <div style={{ width: '50px', height: '50px', borderRadius: '12px', background: feat.color + '15', color: feat.color, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '1.5rem' }}>
                  {feat.icon}
                </div>
                <h3 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '0.75rem', color: '#1e293b' }}>{feat.title}</h3>
                <p style={{ color: '#64748b', lineHeight: 1.6, margin: 0 }}>{feat.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* DEDICATED MOBILE APP SECTION */}
      <section className="app-section" style={{ padding: '6rem 1.5rem' }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto', display: 'flex', alignItems: 'center', gap: '4rem', flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 400px' }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', padding: '6px 16px', borderRadius: '30px', fontSize: '0.9rem', fontWeight: 600, marginBottom: '1.5rem' }}>
              <Smartphone size={16} /> Manage From Anywhere
            </div>
            <h2 style={{ fontSize: '3rem', fontWeight: 800, marginBottom: '1.5rem', lineHeight: 1.1 }}>
              Your entire property in your pocket.
            </h2>
            <p style={{ fontSize: '1.15rem', opacity: 0.9, marginBottom: '2rem', lineHeight: 1.6 }}>
              Don't stay chained to the front desk. With the StayPilot Android App, you can manage bookings, check in guests, and monitor your daily revenue from anywhere in the world.
            </p>
            <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 2.5rem 0', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {['Live push notifications for new bookings', 'Instantly update room statuses', 'Secure PIN & biometric login', 'Offline caching for poor connections'].map((item, i) => (
                <li key={i} style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '1.1rem' }}>
                  <CheckCircle2 color="#34d399" size={20} /> {item}
                </li>
              ))}
            </ul>
            <a href={PLAY_STORE_LINK} target="_blank" rel="noopener noreferrer" className="play-store-btn" style={{ display: 'inline-flex', background: '#fff', color: '#000' }}>
              <img src="https://upload.wikimedia.org/wikipedia/commons/7/78/Google_Play_Store_badge_EN.svg" alt="Get it on Google Play" style={{ height: '36px' }} />
            </a>
          </div>
          <div style={{ flex: '1 1 400px', display: 'flex', justifyContent: 'center' }}>
            {/* LARGE MOBILE MOCKUP PLACEHOLDER */}
            <div style={{ width: '300px', height: '600px', background: '#0f172a', borderRadius: '40px', border: '8px solid #1e293b', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)', overflow: 'hidden', position: 'relative' }}>
              <div style={{ width: '40%', height: '25px', background: '#1e293b', position: 'absolute', top: 0, left: '30%', borderBottomLeftRadius: '12px', borderBottomRightRadius: '12px', zIndex: 2 }}></div>
              <div style={{ width: '100%', height: '100%', background: '#334155', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', textAlign: 'center', padding: '2rem' }}>
                [ High-Res App Screenshot (Home Tab) ]
                {/* <img src="/assets/app-home.png" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> */}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA FOOTER */}
      <section style={{ padding: '6rem 1.5rem', background: '#fff', textAlign: 'center' }}>
        <div style={{ maxWidth: '800px', margin: '0 auto' }}>
          <h2 style={{ fontSize: '3rem', fontWeight: 800, color: '#0f172a', marginBottom: '1.5rem', letterSpacing: '-0.02em' }}>
            Ready to simplify your business?
          </h2>
          <p style={{ fontSize: '1.25rem', color: '#64748b', marginBottom: '3rem' }}>
            Join the smart properties using StayPilot to maximize revenue and minimize headaches.
          </p>
          <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', flexWrap: 'wrap' }}>
            <Link to="/auth" className="btn btn-primary" style={{ padding: '16px 40px', fontSize: '1.2rem', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '10px' }}>
              Create Free Account <ArrowRight size={20} />
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
