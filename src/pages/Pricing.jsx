import React, { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Check, Loader2 } from 'lucide-react';
import { useSettingsStore } from '../lib/store';

export default function Pricing() {
  const { websitePricing, profile, globalPlans, globalTaxSettings } = useSettingsStore();
  const location = useLocation();
  const navigate = useNavigate();
  const [processingPlanId, setProcessingPlanId] = useState(null);
  
  const searchParams = new URLSearchParams(location.search);
  const isPreviewParam = searchParams.get('preview') === 'true';
  const isPreview = isPreviewParam && profile?.role === 'super_admin';

  const handlePlanClick = (plan) => {
    setProcessingPlanId(plan.id);
    setTimeout(() => {
      navigate(plan.highlightPlan ? "/auth?mode=signup" : "/auth");
    }, 1200);
  };

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  const getPlansToDisplay = () => {
    if (!websitePricing) return [];
    
    // Choose source data based on preview state
    const sourceData = isPreview ? (websitePricing.draft || {}) : (websitePricing.published || {});
    
    // Filter and sort plans
    const activePlans = Object.entries(sourceData)
      .map(([key, plan]) => {
        if (isPreview && globalPlans) {
          const internal = globalPlans[key] || {};
          return {
            key,
            ...plan,
            monthlyPrice: internal.price || 0,
            originalPrice: internal.offerPrice ? internal.price : '',
            promotionalPrice: internal.offerPrice || '',
            offerText: internal.offerPrice && internal.price ? `Save ${Math.round(((internal.price - internal.offerPrice) / internal.price) * 100)}%` : '',
            offerStartDate: internal.offerStartDate || '',
            offerEndDate: internal.offerEndDate || '',
            offerActive: internal.offerActive || false,
            publicFeatures: internal.features 
              ? internal.features.filter(f => f.enabled !== false).map(f => f.name)
              : plan.publicFeatures,
          };
        }
        return { key, ...plan };
      })
      .filter(plan => plan.showOnWebsite !== false)
      .sort((a, b) => (a.displayOrder || 99) - (b.displayOrder || 99));

    return activePlans;
  };

  const isPromoActive = (plan) => {
    console.log("Checking promo for", plan.key, plan);
    if (!plan.promotionalPrice) {
      console.log("Failed: no promotionalPrice");
      return false;
    }
    if (plan.offerActive === false) {
      console.log("Failed: offerActive is false");
      return false;
    }
    
    const now = new Date().setHours(0,0,0,0);
    
    if (plan.offerStartDate) {
      const start = new Date(plan.offerStartDate).setHours(0,0,0,0);
      if (now < start) {
        console.log("Failed: now < start", new Date(now), new Date(start));
        return false;
      }
    }
    
    if (plan.offerEndDate) {
      const end = new Date(plan.offerEndDate).setHours(23,59,59,999);
      if (now > end) {
        console.log("Failed: now > end", new Date(now), new Date(end));
        return false;
      }
    }
    
    console.log("Success: Promo is active!");
    return true;
  };

  const plans = getPlansToDisplay();

  return (
    <div style={{ 
      fontFamily: "'Outfit', 'Inter', system-ui, sans-serif", 
      color: '#475569', 
      background: 'linear-gradient(135deg, #f0fdf4 0%, #e0f2fe 35%, #eef2ff 70%, #faf5ff 100%)', 
      minHeight: '100vh', 
      display: 'flex', 
      flexDirection: 'column' 
    }}>
      
      <style>
          {`
            @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700;800&family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap');
            
            @keyframes flash {
              0% { opacity: 1; transform: scale(1); }
              50% { opacity: 0.5; transform: scale(1.05); }
              100% { opacity: 1; transform: scale(1); }
            }
            .flash-animation {
              animation: flash 2s infinite ease-in-out;
            }

            @keyframes spin {
              0% { transform: rotate(0deg); }
              100% { transform: rotate(360deg); }
            }
            .spin-animation {
              animation: spin 1s linear infinite;
            }

            .btn-elegant {
              display: flex;
              align-items: center;
              justify-content: center;
              gap: 0.5rem;
              width: 100%;
              padding: 1.1rem;
              border-radius: 12px;
              font-weight: 700;
              font-size: 1.1rem;
              font-family: 'Plus Jakarta Sans', sans-serif;
              cursor: pointer;
              transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
              border: none;
              outline: none;
            }
            .btn-elegant:active {
              transform: scale(0.96);
            }
            .btn-elegant.primary {
              background: linear-gradient(135deg, #059669 0%, #10b981 100%);
              color: white;
              box-shadow: 0 4px 15px rgba(5, 150, 105, 0.25);
            }
            .btn-elegant.primary:hover {
              box-shadow: 0 8px 25px rgba(5, 150, 105, 0.4);
              transform: translateY(-2px);
            }
            .btn-elegant.secondary {
              background: #f8fafc;
              color: #0F2C59;
              border: 1px solid #cbd5e1;
              box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);
            }
            .btn-elegant.secondary:hover {
              background: white;
              border-color: #059669;
              color: #059669;
              box-shadow: 0 10px 15px -3px rgba(5, 150, 105, 0.1);
              transform: translateY(-2px);
            }
            .btn-elegant.processing {
              opacity: 0.8;
              pointer-events: none;
            }
          `}
      </style>

      {isPreview && (
        <div style={{ background: '#f59e0b', color: 'white', textAlign: 'center', padding: '0.75rem', fontWeight: 700, letterSpacing: '0.05em', zIndex: 1000, position: 'sticky', top: 0 }}>
          PREVIEW — THIS VERSION IS NOT LIVE (DRAFT MODE)
        </div>
      )}

      {/* HEADER */}
      <header style={{ 
        display: 'flex', justifyContent: 'space-between', alignItems: 'center', 
        padding: '1.25rem 2rem', background: 'rgba(255, 255, 255, 0.75)', backdropFilter: 'blur(16px)',
        borderBottom: '1px solid rgba(255, 255, 255, 0.4)', position: 'sticky', top: isPreview ? '44px' : '0', zIndex: 100,
        boxShadow: '0 4px 30px rgba(0, 0, 0, 0.02)'
      }}>
        <Link to="/" style={{ display: 'flex', alignItems: 'center', textDecoration: 'none' }}>
          <img src="/stay-pilot-logo.png" alt="Stay Pilot Logo" style={{ height: '36px', width: 'auto', display: 'block' }} />
        </Link>
        
        <nav className="desktop-nav" style={{ display: 'flex', gap: '2.5rem', alignItems: 'center', fontWeight: 600, color: '#334155', fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
          <Link to="/" style={{ color: 'inherit', textDecoration: 'none', transition: 'color 0.2s' }} onMouseOver={e => e.target.style.color = '#059669'} onMouseOut={e => e.target.style.color = 'inherit'}>Home</Link>
          <Link to="/features" style={{ color: 'inherit', textDecoration: 'none', transition: 'color 0.2s' }} onMouseOver={e => e.target.style.color = '#059669'} onMouseOut={e => e.target.style.color = 'inherit'}>Features</Link>
          <Link to="/how-it-works" style={{ color: 'inherit', textDecoration: 'none', transition: 'color 0.2s' }} onMouseOver={e => e.target.style.color = '#059669'} onMouseOut={e => e.target.style.color = 'inherit'}>How It Works</Link>
          <Link to="/pricing" style={{ color: '#059669', textDecoration: 'none' }}>Pricing</Link>
        </nav>
        
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          <Link to="/auth" className="desktop-btn" style={{ padding: '0.5rem 1rem', fontWeight: 600, color: '#0F2C59', textDecoration: 'none', fontFamily: "'Plus Jakarta Sans', sans-serif" }}>Sign In</Link>
          <Link to="/auth?mode=signup" className="btn" style={{ 
            padding: '0.65rem 1.6rem', background: 'linear-gradient(135deg, #059669 0%, #10b981 100%)', 
            color: 'white', borderRadius: '8px', fontWeight: 700, textDecoration: 'none',
            boxShadow: '0 4px 15px rgba(5, 150, 105, 0.25)', fontFamily: "'Plus Jakarta Sans', sans-serif"
          }}>Get Started Free</Link>
        </div>
      </header>

      {/* Background ambient blobs */}
      <div style={{ position: 'relative' }}>
        <div style={{ position: 'absolute', top: '100px', left: '10%', width: '350px', height: '350px', background: 'rgba(5, 150, 105, 0.1)', filter: 'blur(90px)', borderRadius: '50%', zIndex: 0, pointerEvents: 'none' }}></div>
        <div style={{ position: 'absolute', top: '300px', right: '10%', width: '400px', height: '400px', background: 'rgba(56, 189, 248, 0.1)', filter: 'blur(90px)', borderRadius: '50%', zIndex: 0, pointerEvents: 'none' }}></div>
      </div>

      {/* HERO TITLE SECTION */}
      <section style={{ padding: '3rem 2rem 5.5rem', textAlign: 'center', position: 'relative', zIndex: 1, background: 'radial-gradient(circle at top center, #064e3b 0%, #020617 100%)', color: 'white', marginTop: '-1px' }}>
        <div style={{ maxWidth: '800px', margin: '0 auto', position: 'relative', zIndex: 1 }}>
          <h1 style={{ fontSize: 'clamp(2.5rem, 5vw, 3.8rem)', fontWeight: 800, color: 'white', lineHeight: 1.15, marginBottom: '1.5rem', fontFamily: "'Outfit', sans-serif", letterSpacing: '-0.025em', background: 'linear-gradient(135deg, #34d399 0%, #38bdf8 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>
            Simple Pricing. No Complications.
          </h1>
          <p style={{ fontSize: '1.25rem', color: '#94a3b8', lineHeight: 1.6, fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
            Choose a plan that fits your property and manage your bookings, income and expenses with confidence.
          </p>
        </div>

        {/* Curved SVG Divider to blend into light section */}
        <div style={{ position: 'absolute', bottom: 0, left: 0, width: '100%', overflow: 'hidden', lineHeight: 0, transform: 'translateY(1px)' }}>
          <svg viewBox="0 0 1200 120" preserveAspectRatio="none" style={{ position: 'relative', display: 'block', width: 'calc(100% + 1.3px)', height: '60px' }}>
            <path d="M321.39,56.44c58-10.79,114.16-30.13,172-41.86,82.39-16.72,168.19-17.73,250.45-.39C823.78,31,906.67,72,985.66,92.83c70.05,18.48,146.53,26.09,214.34,3V120H0V0C52.42,28.17,133.72,67.6,214.34,71.2,251.69,72.84,288.08,62.6,321.39,56.44Z" fill="#f0fdf4"></path>
          </svg>
        </div>
      </section>

      {/* MAIN CONTENT */}
      <main style={{ flex: 1, padding: '2.5rem 2rem 8rem', textAlign: 'center', position: 'relative', zIndex: 1 }}>

        {plans.length === 0 ? (
          <div style={{ padding: '4rem', background: 'rgba(255,255,255,0.7)', backdropFilter: 'blur(10px)', borderRadius: '16px', border: '1px solid rgba(255,255,255,0.4)', maxWidth: '600px', margin: '0 auto' }}>
            <p style={{ fontSize: '1.2rem', color: '#64748B', fontWeight: 600 }}>Pricing information is currently being updated.</p>
          </div>
        ) : (
          <div style={{ 
            display: 'flex', 
            flexWrap: 'wrap', 
            gap: '1.5rem', 
            justifyContent: 'center', 
            maxWidth: '1400px', 
            margin: '0 auto',
            alignItems: 'stretch'
          }}>
            {plans.map((plan) => {
              const promoActive = isPromoActive(plan);
              const currentPrice = promoActive ? plan.promotionalPrice : plan.monthlyPrice;
              const originalPrice = promoActive && plan.originalPrice ? plan.originalPrice : (promoActive && plan.monthlyPrice > currentPrice ? plan.monthlyPrice : null);
              const offerText = promoActive ? (plan.offerText || (originalPrice > currentPrice ? `Save ${Math.round(((originalPrice - currentPrice) / originalPrice) * 100)}%` : null)) : null;
              
              return (
                <div key={plan.key} style={{ 
                  flex: '1 1 250px',
                  maxWidth: '380px',
                  background: plan.highlightPlan ? 'linear-gradient(135deg, #0F2C59 0%, #173b75 100%)' : 'rgba(255, 255, 255, 0.75)', 
                  backdropFilter: 'blur(10px)',
                  borderRadius: '24px', 
                  padding: '2.5rem 2rem', 
                  border: plan.highlightPlan ? '1px solid rgba(255,255,255,0.1)' : '1px solid rgba(255, 255, 255, 0.4)', 
                  boxShadow: plan.highlightPlan ? '0 20px 45px rgba(15, 44, 89, 0.18)' : '0 10px 30px rgba(15, 44, 89, 0.02)',
                  display: 'flex',
                  flexDirection: 'column',
                  position: 'relative',
                  zIndex: plan.highlightPlan ? 2 : 1,
                  transition: 'all 0.3s ease'
                }}>
                  
                  {plan.pricingLabel && (
                    <div style={{ 
                      position: 'absolute', top: '-15px', left: '50%', transform: 'translateX(-50%)',
                      background: plan.highlightPlan ? '#059669' : '#0F2C59', color: 'white',
                      padding: '0.4rem 1.5rem', borderRadius: '20px', fontSize: '0.8rem', fontWeight: 800, letterSpacing: '0.05em',
                      boxShadow: '0 4px 10px rgba(0,0,0,0.1)'
                    }}>
                      {plan.pricingLabel.toUpperCase()}
                    </div>
                  )}

                  <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
                    <h3 style={{ fontSize: '1.5rem', fontWeight: 800, color: plan.highlightPlan ? 'white' : '#0F2C59', margin: '0 0 0.5rem 0', fontFamily: "'Outfit', sans-serif" }}>
                      {plan.displayPlanName}
                    </h3>
                    {plan.shortDescription && (
                      <p style={{ color: plan.highlightPlan ? '#cbd5e1' : '#64748B', fontSize: '0.95rem', margin: 0, fontFamily: "'Plus Jakarta Sans', sans-serif", fontWeight: 500 }}>
                        {plan.shortDescription}
                      </p>
                    )}
                  </div>

                  <div style={{ textAlign: 'center', marginBottom: '2.5rem', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                    
                    {/* ORIGINAL PRICE */}
                    {promoActive && originalPrice && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                        <span style={{ 
                          color: plan.highlightPlan ? '#fca5a5' : '#ef4444', 
                          fontSize: '0.85rem', 
                          fontWeight: 800, 
                          textTransform: 'uppercase', 
                          letterSpacing: '0.05em' 
                        }}>
                          Was
                        </span>
                        <span style={{ 
                          textDecoration: 'line-through', 
                          textDecorationThickness: '2px',
                          color: plan.highlightPlan ? '#fca5a5' : '#ef4444', 
                          fontSize: '1.5rem', 
                          fontWeight: 800,
                          lineHeight: 1
                        }}>
                          ₹{originalPrice}
                        </span>
                      </div>
                    )}
                    
                    {/* OFFER PRICE */}
                    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'center', gap: '0.25rem' }}>
                      <span style={{ 
                        fontSize: '3.5rem', 
                        fontWeight: 900, 
                        color: plan.highlightPlan ? 'white' : '#0F2C59', 
                        lineHeight: 1,
                        letterSpacing: '-0.02em',
                        textShadow: plan.highlightPlan ? '0 2px 10px rgba(0,0,0,0.1)' : 'none',
                        fontFamily: "'Outfit', sans-serif"
                      }}>
                        ₹{currentPrice}
                      </span>
                      <span style={{ color: plan.highlightPlan ? '#cbd5e1' : '#64748B', fontWeight: 600, fontSize: '1.1rem', fontFamily: "'Plus Jakarta Sans', sans-serif" }}>/mo</span>
                    </div>

                    {globalTaxSettings?.enabled && currentPrice > 0 && (
                      <div style={{ textAlign: 'center', color: plan.highlightPlan ? 'rgba(255,255,255,0.7)' : '#94a3b8', fontSize: '0.85rem', fontWeight: 600, fontFamily: "'Plus Jakarta Sans', sans-serif", marginTop: '0.25rem' }}>
                        + {globalTaxSettings.rate}% GST
                      </div>
                    )}

                    {/* SAVE % BADGE */}
                    {promoActive && offerText && (
                      <div className="flash-animation" style={{ 
                        marginTop: '1rem', 
                        color: 'white', 
                        fontWeight: 800, 
                        fontSize: '0.95rem',
                        display: 'inline-block',
                        padding: '0.4rem 1rem',
                        background: '#059669',
                        borderRadius: '20px',
                        boxShadow: '0 4px 10px rgba(5, 150, 105, 0.25)',
                        textTransform: 'uppercase',
                        letterSpacing: '0.05em'
                      }}>
                        {offerText}
                      </div>
                    )}

                    {/* VALID TILL */}
                    {promoActive && plan.offerEndDate && (
                      <div style={{ 
                        marginTop: '0.75rem', 
                        color: plan.highlightPlan ? '#fca5a5' : '#ef4444', 
                        fontSize: '0.85rem', 
                        fontWeight: 700 
                      }}>
                        ⏳ Valid till {new Date(plan.offerEndDate).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}
                      </div>
                    )}
                  </div>

                  <div style={{ flex: 1, marginBottom: '2.5rem' }}>
                    <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '1rem', textAlign: 'left' }}>
                      {plan.publicFeatures?.map((feat, idx) => (
                        <li key={idx} style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem', color: plan.highlightPlan ? '#f1f5f9' : '#334155', fontSize: '0.95rem', fontFamily: "'Plus Jakarta Sans', sans-serif", fontWeight: 500 }}>
                          <Check size={18} color={plan.highlightPlan ? '#10b981' : '#059669'} style={{ flexShrink: 0, marginTop: '2px' }} />
                          <span>{feat}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div style={{ marginTop: 'auto' }}>
                    <button 
                      onClick={() => handlePlanClick(plan)}
                      className={`btn-elegant ${plan.highlightPlan ? 'primary' : 'secondary'} ${processingPlanId === plan.id ? 'processing' : ''}`}
                    >
                      {processingPlanId === plan.id ? (
                        <>
                          <Loader2 size={20} className="spin-animation" />
                          Processing...
                        </>
                      ) : (
                        plan.ctaButtonText || 'Choose Plan'
                      )}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* FOOTER */}
      <footer style={{ 
        padding: '4rem 2rem 2rem', 
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
              <Link to="/features" style={{ color: '#64748B', textDecoration: 'none' }}>Features</Link>
              <Link to="/how-it-works" style={{ color: '#64748B', textDecoration: 'none' }}>How It Works</Link>
              <Link to="/pricing" style={{ color: '#64748B', textDecoration: 'none' }}>Pricing</Link>
              <Link to="/auth" style={{ color: '#64748B', textDecoration: 'none' }}>Sign In</Link>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', fontWeight: 600 }}>
              <Link to="/privacy" style={{ color: '#64748B', textDecoration: 'none' }}>Privacy Policy</Link>
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

