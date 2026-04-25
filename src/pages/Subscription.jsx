import React, { useState, useEffect } from 'react';
import { useSettingsStore } from '../lib/store';
import { Check, Zap, Crown, CreditCard, Shield, X, Lock } from 'lucide-react';
import { supabase } from '../lib/supabase';

const PLANS = [
  {
    id: 'free',
    name: 'Free Starter',
    price: '₹0',
    description: 'Perfect for small properties',
    features: ['1 Resort Limit', 'Up to 5 Rooms', 'Basic Reports', 'Community Support'],
    icon: <Zap size={24} />,
    color: '#a0aec0'
  },
  {
    id: 'pro',
    name: 'Pro Manager',
    price: '₹1,999',
    period: '/mo',
    description: 'For growing businesses',
    features: ['Up to 5 Resorts', 'Unlimited Rooms', 'Advanced Analytics', 'Email Automation', 'Priority Support'],
    icon: <Crown size={24} />,
    color: 'var(--primary)',
    popular: true
  },
  {
    id: 'premium',
    name: 'Luxury Premium',
    price: '₹5,999',
    period: '/mo',
    description: 'Total control for hotel chains',
    features: ['Unlimited Resorts', 'Custom Branding', 'Super Admin Panel', 'WhatsApp Notifications', '24/7 Dedicated Support'],
    icon: <Shield size={24} />,
    color: '#d4af37'
  }
];

const formatOfferDate = (dateString) => {
  if (!dateString) return '';
  const date = new Date(dateString);
  const day = date.getDate();
  const getOrdinal = (n) => {
    if (n > 3 && n < 21) return 'th';
    switch (n % 10) {
      case 1:  return "st";
      case 2:  return "nd";
      case 3:  return "rd";
      default: return "th";
    }
  };
  const month = date.toLocaleString('en-GB', { month: 'long' });
  const year = date.getFullYear();
  return `${day}${getOrdinal(day)} ${month} ${year}`;
};

export default function Subscription() {
  const { profile, setProfile } = useSettingsStore();
  const [loading, setLoading] = useState(null);
  
  const [checkoutModal, setCheckoutModal] = useState({ isOpen: false, planId: null });
  const [paymentForm, setPaymentForm] = useState({ cardNumber: '', expiry: '', cvc: '', name: '' });
  const [plansList, setPlansList] = useState(PLANS);

  useEffect(() => {
    const fetchDynamicPricing = async () => {
      try {
        const { data, error } = await supabase.from('profiles').select('global_settings').eq('role', 'super_admin').limit(1);
        if (error) throw error;
        const adminSettings = data?.[0]?.global_settings?.pricing;

        const isOfferValid = (planConfig) => {
          if (!planConfig || !planConfig.offerActive) return false;
          const today = new Date().toISOString().split('T')[0];
          if (planConfig.offerStartDate && today < planConfig.offerStartDate) return false;
          if (planConfig.offerEndDate && today > planConfig.offerEndDate) return false;
          return true;
        };

        if (adminSettings) {
          setPlansList(PLANS.map(p => {
            if (p.id === 'pro' && adminSettings.pro) {
              const offerActive = isOfferValid(adminSettings.pro);
              return {
                ...p,
                price: offerActive ? `₹${adminSettings.pro.offerPrice}` : `₹${adminSettings.pro.price}`,
                basePrice: offerActive ? `₹${adminSettings.pro.price}` : null,
                offerEndDate: offerActive && adminSettings.pro.offerEndDate ? adminSettings.pro.offerEndDate : null
              };
            }
            if (p.id === 'premium' && adminSettings.premium) {
              const offerActive = isOfferValid(adminSettings.premium);
              return {
                ...p,
                price: offerActive ? `₹${adminSettings.premium.offerPrice}` : `₹${adminSettings.premium.price}`,
                basePrice: offerActive ? `₹${adminSettings.premium.price}` : null,
                offerEndDate: offerActive && adminSettings.premium.offerEndDate ? adminSettings.premium.offerEndDate : null
              };
            }
            return p;
          }));
        }
      } catch (e) {
        console.error("Failed to load dynamic pricing", e);
      }
    };
    fetchDynamicPricing();
  }, []);

  const handleSubscribe = (planId) => {
    if (planId === profile?.plan_type) return;
    setCheckoutModal({ isOpen: true, planId });
  };

  const handlePaymentSubmit = async (e) => {
    e.preventDefault();
    const planId = checkoutModal.planId;
    setLoading(planId);
    
    // Simulate payment process
    setTimeout(async () => {
      try {
        const { data, error } = await supabase
          .from('profiles')
          .update({ plan_type: planId })
          .eq('id', profile.id)
          .select();
        
        if (error) throw error;
        setProfile(data[0]);
        alert(`Payment Success! Your account has been upgraded to the ${planId.toUpperCase()} plan.`);
        setCheckoutModal({ isOpen: false, planId: null });
        setPaymentForm({ cardNumber: '', expiry: '', cvc: '', name: '' });
      } catch (err) {
        alert("Payment processing failed: " + err.message);
      } finally {
        setLoading(null);
      }
    }, 2000);
  };

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '2rem 0' }}>
      <div style={{ textAlign: 'center', marginBottom: '4rem' }}>
        <h1 style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>Choose Your Plan</h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '1.2rem' }}>
          Flexible pricing designed to scale with your hotel business.
        </p>
        <div style={{ marginTop: '1.5rem', display: 'flex', justifyContent: 'center', gap: '1rem' }}>
          <span className={`badge ${profile?.plan_type === 'free' ? 'badge-success' : ''}`} style={{ padding: '0.5rem 1rem' }}>Current: {profile?.plan_type.toUpperCase()} Account</span>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '2rem' }}>
        {plansList.map((plan) => (
          <div key={plan.id} className="card" style={{ 
            display: 'flex', 
            flexDirection: 'column',
            padding: '2.5rem',
            position: 'relative',
            border: profile?.plan_type === plan.id ? '2px solid var(--success)' : (plan.popular ? '2px solid var(--primary)' : '1px solid var(--border)'),
            transform: profile?.plan_type === plan.id || plan.popular ? 'scale(1.05)' : 'none',
            zIndex: profile?.plan_type === plan.id || plan.popular ? 2 : 1,
            boxShadow: profile?.plan_type === plan.id || plan.popular ? '0 20px 25px -5px rgba(0, 0, 0, 0.4)' : ''
          }}>
            {profile?.plan_type === plan.id ? (
              <div style={{ 
                position: 'absolute', 
                top: '-15px', 
                left: '50%', 
                transform: 'translateX(-50%)',
                background: 'var(--success)',
                color: 'white',
                padding: '0.35rem 1.5rem',
                borderRadius: '20px',
                fontSize: '0.8rem',
                fontWeight: 'bold',
                boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
                display: 'flex',
                alignItems: 'center',
                gap: '0.4rem'
              }}>
                <Check size={14} /> YOUR CURRENT PLAN
              </div>
            ) : plan.popular && (
              <div style={{ 
                position: 'absolute', 
                top: '-15px', 
                left: '50%', 
                transform: 'translateX(-50%)',
                background: 'var(--primary)',
                color: 'white',
                padding: '0.25rem 1rem',
                borderRadius: '20px',
                fontSize: '0.8rem',
                fontWeight: 'bold'
              }}>
                MOST POPULAR
              </div>
            )}

            <div style={{ marginBottom: '2rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <div style={{ 
                width: '48px', 
                height: '48px', 
                background: 'rgba(255,255,255,0.05)', 
                borderRadius: '12px', 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'center',
                color: plan.color
              }}>
                {plan.icon}
              </div>
              <div>
                <h3 style={{ margin: 0 }}>{plan.name}</h3>
                <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--text-muted)' }}>{plan.description}</p>
              </div>
            </div>

            <div style={{ marginBottom: '2.5rem' }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.25rem' }}>
                <span style={{ fontSize: '2.5rem', fontWeight: 'bold' }}>{plan.price}</span>
                {plan.period && <span style={{ color: 'var(--text-muted)' }}>{plan.period}</span>}
              </div>
              {plan.basePrice && (
                <div style={{ marginTop: '0.5rem' }}>
                  <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '0.5rem' }}>
                    <span style={{ textDecoration: 'line-through' }}>{plan.basePrice}</span>/mo 
                  </div>
                  <div className="animated-offer-badge">
                    <Zap size={14} fill="currentColor" />
                    LIMITED TIME OFFER {plan.offerEndDate && `• ENDS ${formatOfferDate(plan.offerEndDate).toUpperCase()}`}
                  </div>
                </div>
              )}
            </div>

            <div style={{ flex: 1, marginBottom: '2.5rem' }}>
              <h4 style={{ fontSize: '0.875rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', marginBottom: '1.25rem' }}>
                What's included
              </h4>
              <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {plan.features.map((feature, i) => (
                  <li key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', fontSize: '0.95rem' }}>
                    <Check size={18} color="var(--success)" />
                    {feature}
                  </li>
                ))}
              </ul>
            </div>

            <button 
              className={`btn ${plan.popular ? 'btn-primary' : 'btn-outline'}`}
              style={{ width: '100%', height: '50px', fontSize: '1rem' }}
              onClick={() => handleSubscribe(plan.id)}
              disabled={loading === plan.id || profile?.plan_type === plan.id}
            >
              {profile?.plan_type === plan.id ? 'Active Plan' : (loading === plan.id ? 'Connecting...' : 'Upgrade Now')}
            </button>
          </div>
        ))}
      </div>

      <div className="card" style={{ marginTop: '4rem', padding: '2rem', display: 'flex', alignItems: 'center', gap: '1.5rem', background: 'rgba(0,0,0,0.1)' }}>
        <div style={{ background: 'rgba(255,255,255,0.05)', padding: '1rem', borderRadius: '50%', color: 'var(--primary)' }}>
          <Shield size={32} />
        </div>
        <div>
          <h3 style={{ margin: 0 }}>Secure Payments</h3>
          <p style={{ margin: 0, color: 'var(--text-muted)' }}>Your transactions are secured by 256-bit SSL encryption and processed via world-class gateways.</p>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: '1rem', opacity: 0.6 }}>
          <CreditCard size={32} />
        </div>
      </div>

      {/* Checkout Modal */}
      {checkoutModal.isOpen && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '500px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
              <h2 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Lock color="var(--success)" /> Secure Checkout
              </h2>
              <button type="button" className="btn-outline" style={{ padding: '0.5rem', borderRadius: '50%' }} 
                onClick={() => setCheckoutModal({ isOpen: false, planId: null })}
              >
                <X size={20} />
              </button>
            </div>
            
            <div style={{ marginBottom: '1.5rem', background: 'rgba(0,0,0,0.03)', padding: '1rem', borderRadius: 'var(--radius-md)' }}>
              <h3 style={{ margin: '0 0 0.5rem 0' }}>{plansList.find(p => p.id === checkoutModal.planId)?.name}</h3>
              <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: 'var(--primary)' }}>
                {plansList.find(p => p.id === checkoutModal.planId)?.price} 
                <span style={{ fontSize: '1rem', color: 'var(--text-muted)' }}>{plansList.find(p => p.id === checkoutModal.planId)?.period || ''}</span>
              </div>
            </div>

            <form onSubmit={handlePaymentSubmit}>
              <div className="form-group">
                <label className="form-label">Name on Card</label>
                <input type="text" className="form-input" required 
                  placeholder="e.g. John Doe"
                  value={paymentForm.name} onChange={e => setPaymentForm({...paymentForm, name: e.target.value})} 
                />
              </div>
              <div className="form-group">
                <label className="form-label">Card Number</label>
                <div style={{ position: 'relative' }}>
                  <input type="text" className="form-input" style={{ paddingLeft: '2.5rem' }} required 
                    placeholder="0000 0000 0000 0000" maxLength="19"
                    value={paymentForm.cardNumber} 
                    onChange={e => {
                      const val = e.target.value.replace(/\D/g, '').replace(/(\d{4})/g, '$1 ').trim();
                      setPaymentForm({...paymentForm, cardNumber: val});
                    }}
                  />
                  <CreditCard size={18} style={{ position: 'absolute', left: '0.8rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                </div>
              </div>
              
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div className="form-group">
                  <label className="form-label">Expiry (MM/YY)</label>
                  <input type="text" className="form-input" required 
                    placeholder="MM/YY" maxLength="5"
                    value={paymentForm.expiry} onChange={e => {
                      let val = e.target.value.replace(/\D/g, '');
                      if (val.length >= 2) val = val.slice(0,2) + '/' + val.slice(2,4);
                      setPaymentForm({...paymentForm, expiry: val})
                    }} 
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">CVC</label>
                  <input type="text" className="form-input" required 
                    placeholder="123" maxLength="4"
                    value={paymentForm.cvc} onChange={e => setPaymentForm({...paymentForm, cvc: e.target.value.replace(/\D/g, '')})} 
                  />
                </div>
              </div>

              <div style={{ marginTop: '2rem' }}>
                <button type="submit" className="btn btn-primary" style={{ width: '100%', height: '50px', fontSize: '1.1rem' }} disabled={loading}>
                  {loading ? 'Processing Payment...' : 'Confirm Payment'}
                </button>
                <div style={{ textAlign: 'center', marginTop: '1rem', fontSize: '0.8rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.3rem' }}>
                  <Shield size={14} /> Mock Mode (Cards not charged)
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
