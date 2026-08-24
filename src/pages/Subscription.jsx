import React, { useState, useEffect } from 'react';
import { useSettingsStore } from '../lib/store';
import { Check, Zap, Crown, CreditCard, Shield, X, Lock } from 'lucide-react';
import { supabase } from '../lib/supabase';

// Dynamic plans are now loaded from the global state

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
  const { profile, setProfile, globalPlans, websitePricing } = useSettingsStore();
  const [loading, setLoading] = useState(null);
  
  const [checkoutModal, setCheckoutModal] = useState({ isOpen: false, planId: null });
  const [paymentForm, setPaymentForm] = useState({ cardNumber: '', expiry: '', cvc: '', name: '' });
  
  const [activeSubscription, setActiveSubscription] = useState(null);
  const [paymentHistory, setPaymentHistory] = useState([]);

  useEffect(() => {
    if (profile?.id) {
       fetchSubscriptionData();
    }
  }, [profile?.id]);

  const fetchSubscriptionData = async () => {
     try {
       const { data: subData } = await supabase.from('saas_subscriptions')
         .select('*').eq('tenant_id', profile.id)
         .order('created_at', { ascending: false })
         .limit(1)
         .maybeSingle();
       if (subData) setActiveSubscription(subData);

       const { data: payData } = await supabase.from('saas_payments')
         .select('*').eq('tenant_id', profile.id).order('created_at', { ascending: false });
       if (payData) setPaymentHistory(payData);
     } catch (e) {
       console.error("Failed to load subscription data", e);
     }
  };

  const handleCancelSubscription = async () => {
     if (!window.confirm("Are you sure you want to cancel your subscription? You will be reverted to the Free Starter plan.")) return;
     
     setLoading('cancel');
      try {
        const { data, error } = await supabase.functions.invoke('razorpay-cancel-subscription');
        
        if (error || data?.error) {
          throw new Error(error?.message || data?.error || "Unknown error occurred");
        }

        alert("Subscription cancelled successfully.");
        
        // Optimistic update
        setProfile({...profile, plan_type: 'free'});
        window.location.reload();
      } catch (err) {
        alert("Failed to cancel subscription: " + err.message);
      } finally {
        setLoading(null);
     }
  };

  const isOfferValid = (planConfig) => {
    if (!planConfig || !planConfig.offerActive) return false;
    const today = new Date().toISOString().split('T')[0];
    if (planConfig.offerStartDate && today < planConfig.offerStartDate) return false;
    if (planConfig.offerEndDate && today > planConfig.offerEndDate) return false;
    return true;
  };

  const getPlansList = () => {
    if (!globalPlans) return [];
    
    return Object.entries(globalPlans)
      .filter(([id, config]) => config.enabled !== false)
      .map(([id, config]) => {
        const offerActive = isOfferValid(config);
        const rawActive = offerActive && config.offerPrice !== undefined ? Math.min(Number(config.price || 0), Number(config.offerPrice || 0)) : (config.price === 0 ? 0 : Number(config.price || 0));
        const rawBase = offerActive && config.price !== undefined ? Math.max(Number(config.price || 0), Number(config.offerPrice || 0)) : null;
        const discountPercent = rawBase && rawBase > rawActive ? Math.round(((rawBase - rawActive) / rawBase) * 100) : null;

        return {
          id,
          name: config.name || id.toUpperCase(),
          description: config.description || '',
          price: rawActive === 0 ? '₹0' : `₹${rawActive}`,
          basePrice: rawBase ? `₹${rawBase}` : null,
          discountPercent,
          offerEndDate: offerActive && config.offerEndDate ? config.offerEndDate : null,
          period: id === 'free' ? '' : '/mo',
          color: config.color || 'var(--primary)',
          popular: config.popular || false,
          icon: id === 'free' ? <Zap size={24} /> : (id === 'premium' ? <Shield size={24} /> : <Crown size={24} />),
          features: Array.isArray(config.features) 
            ? config.features.filter(f => f.enabled !== false).map(f => f.name)
            : []
        };
      })
      .sort((a, b) => {
        const orderA = websitePricing?.published?.[a.id]?.displayOrder || 99;
        const orderB = websitePricing?.published?.[b.id]?.displayOrder || 99;
        return orderA - orderB;
      });
  };

  const plansList = getPlansList();

  const loadRazorpayScript = () => {
    return new Promise((resolve) => {
      if (window.Razorpay) return resolve(true);
      const script = document.createElement('script');
      script.src = 'https://checkout.razorpay.com/v1/checkout.js';
      script.onload = () => resolve(true);
      script.onerror = () => resolve(false);
      document.body.appendChild(script);
    });
  };

  const handleSubscribe = async (planId) => {
    if (planId === profile?.plan_type) return;

    if (window.location.protocol === 'capacitor:') {
       setCheckoutModal({ isOpen: true, planId });
       return;
    }

    if (planId === 'free') {
       if (window.confirm("Are you sure you want to downgrade to Free Starter? This will remove access to paid features.")) {
          setLoading(planId);
          try {
             const { data, error } = await supabase.functions.invoke('razorpay-cancel-subscription');
             if (error || data?.error) throw new Error(error?.message || data?.error || "Unknown error");
             setProfile({...profile, plan_type: 'free'});
             alert("Account downgraded to Free.");
          } catch (e) {
             alert(e.message);
          } finally {
             setLoading(null);
          }
       }
       return;
    }

    setLoading(planId);
    try {
      const res = await loadRazorpayScript();
      if (!res) throw new Error("Razorpay SDK failed to load. Are you online?");

      const { data, error } = await supabase.functions.invoke('razorpay-create-subscription', {
        body: { plan_type: planId }
      });

      if (error || (data && data.error)) throw new Error(error?.message || data?.error || 'Unknown error');

      const options = {
        key: data.key_id,
        subscription_id: data.subscription_id,
        name: "Stay Pilot",
        description: `Subscription for ${planId}`,
        handler: async function (response) {
          try {
            // Instant Verify using direct fetch to capture 400 errors
            const { data: { session } } = await supabase.auth.getSession();
            const token = session?.access_token || '';
            const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://lubkdxhqnnghnjhrebat.supabase.co';
            const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

            const res = await fetch(`${supabaseUrl}/functions/v1/razorpay-verify`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
              },
              body: JSON.stringify({ 
                subscription_id: response.razorpay_subscription_id,
                payment_id: response.razorpay_payment_id,
                signature: response.razorpay_signature
              })
            });

            const verifyData = await res.json();

            if (!res.ok || verifyData.error) {
              throw new Error(verifyData.error || "Verification failed");
            }

            alert("Payment successful! Your plan has been upgraded.");
            // Optimistic update
            setProfile({...profile, plan_type: planId});
            
            // Reload page to ensure all components pick up the new plan
            window.location.reload();
          } catch (err) {
            console.error(err);
            alert("Verification error: " + err.message);
          }
        },
        prefill: {
          name: profile?.full_name || '',
          email: '',
        },
        theme: {
          color: "#0F2C59"
        }
      };

      const rzp = new window.Razorpay(options);
      rzp.on('payment.failed', function (response) {
        alert("Payment failed: " + response.error.description);
      });
      rzp.open();
    } catch (err) {
      alert("Failed to initialize checkout: " + err.message);
    } finally {
      setLoading(null);
    }
  };

  if (!globalPlans) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '60vh', gap: '1rem' }}>
        <div className="animate-spin" style={{ border: '3px solid rgba(255,255,255,0.1)', borderTop: '3px solid var(--primary)', borderRadius: '50%', width: '40px', height: '40px' }}></div>
        <p style={{ color: 'var(--text-muted)', fontSize: '1.1rem' }}>Loading plans and pricing...</p>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '2rem 0' }}>
      <div style={{ textAlign: 'center', marginBottom: '4rem' }}>
        <h1 style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>Choose Your Plan</h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '1.2rem' }}>
          Flexible pricing designed to scale with your hotel business.
        </p>
        <div style={{ marginTop: '1.5rem', display: 'flex', justifyContent: 'center', gap: '1rem' }}>
          <span className={`badge ${profile?.plan_type === 'free' ? 'badge-success' : ''}`} style={{ padding: '0.5rem 1rem' }}>Current: {plansList.find(p => p.id === profile?.plan_type)?.name || profile?.plan_type.toUpperCase()} Account</span>
        </div>
      </div>

      {activeSubscription && (
        <div className="card" style={{ marginBottom: '3rem', padding: '2rem', border: '1px solid rgba(59, 130, 246, 0.3)', background: 'rgba(59, 130, 246, 0.03)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
            <div>
              <h2 style={{ fontSize: '1.5rem', margin: '0 0 0.5rem 0', color: 'var(--primary)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Check size={24} /> Active Subscription
              </h2>
              <p style={{ margin: '0 0 1rem 0', color: 'var(--text-muted)' }}>
                You are currently subscribed to the <strong>{plansList.find(p => p.id === activeSubscription.staypilot_plan_type)?.name || activeSubscription.staypilot_plan_type.toUpperCase()}</strong> plan.
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: 'auto auto', gap: '1rem', fontSize: '0.9rem' }}>
                <div style={{ color: 'var(--text-muted)' }}>Status:</div>
                <div style={{ fontWeight: 'bold', color: 'var(--success)' }}>{activeSubscription.status.toUpperCase()}</div>
                <div style={{ color: 'var(--text-muted)' }}>Period Ends:</div>
                <div style={{ fontWeight: 'bold' }}>{activeSubscription.current_period_end ? new Date(activeSubscription.current_period_end).toLocaleDateString() : 'Pending (Updates shortly)'}</div>
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', minWidth: '200px' }}>
              <button className="btn btn-outline" style={{ color: 'var(--danger)', borderColor: 'var(--danger)' }} onClick={handleCancelSubscription} disabled={loading === 'cancel'}>
                {loading === 'cancel' ? 'Cancelling...' : 'Cancel Subscription'}
              </button>
            </div>
          </div>
          {/* Payment History is moved out of this card */}
        </div>
      )}

      {paymentHistory.length > 0 && (
        <div className="card" style={{ marginBottom: '3rem', padding: '2rem', border: '1px solid var(--border)' }}>
          <h3 style={{ fontSize: '1.25rem', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <CreditCard size={20} /> Payment History
          </h3>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.95rem' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid var(--border)', textAlign: 'left', color: 'var(--text-muted)' }}>
                  <th style={{ padding: '0.75rem 0.5rem' }}>Date</th>
                  <th style={{ padding: '0.75rem 0.5rem' }}>Amount</th>
                  <th style={{ padding: '0.75rem 0.5rem' }}>Status</th>
                  <th style={{ padding: '0.75rem 0.5rem' }}>Transaction ID</th>
                </tr>
              </thead>
              <tbody>
                {paymentHistory.slice(0, 10).map(payment => (
                  <tr key={payment.id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '1rem 0.5rem' }}>{new Date(payment.created_at).toLocaleDateString()}</td>
                    <td style={{ padding: '1rem 0.5rem', fontWeight: 600 }}>₹{payment.amount / 100}</td>
                    <td style={{ padding: '1rem 0.5rem' }}>
                      <span className={`badge ${payment.status === 'captured' ? 'badge-success' : 'badge-danger'}`}>{payment.status.toUpperCase()}</span>
                    </td>
                    <td style={{ padding: '1rem 0.5rem', fontFamily: 'monospace', color: 'var(--text-muted)' }}>{payment.razorpay_payment_id || payment.id.split('-')[0]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1.5rem', justifyContent: 'center', alignItems: 'stretch' }}>
        {plansList.map((plan) => (
          <div key={plan.id} className="card" style={{ 
            display: 'flex', 
            flexDirection: 'column',
            flex: '1 1 250px',
            maxWidth: '380px',
            padding: '2.5rem',
            position: 'relative',
            border: profile?.plan_type === plan.id ? '2px solid #3b82f6' : (plan.popular ? '2px solid var(--primary)' : '1px solid var(--border)'),
            zIndex: profile?.plan_type === plan.id || plan.popular ? 2 : 1,
            transition: 'all 0.3s ease',
            boxShadow: profile?.plan_type === plan.id ? '0 20px 25px -5px rgba(59, 130, 246, 0.25)' : (plan.popular ? '0 20px 25px -5px rgba(0, 0, 0, 0.4)' : '')
          }}>
            {profile?.plan_type === plan.id ? (
              <div style={{ 
                position: 'absolute', 
                top: '-15px', 
                left: '50%', 
                transform: 'translateX(-50%)',
                background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
                color: 'white',
                padding: '0.35rem 1.5rem',
                borderRadius: '20px',
                fontSize: '0.8rem',
                fontWeight: 'bold',
                boxShadow: '0 4px 10px rgba(59, 130, 246, 0.3)',
                display: 'flex',
                alignItems: 'center',
                gap: '0.4rem',
                whiteSpace: 'nowrap'
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
              {plan.basePrice && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
                  <span style={{ textDecoration: 'line-through', color: 'var(--danger)', fontSize: '1.25rem', fontWeight: '600', opacity: 0.8 }}>{plan.basePrice}/mo</span>
                  {plan.discountPercent && (
                    <span style={{ background: 'rgba(34, 197, 94, 0.15)', color: 'var(--success)', padding: '0.2rem 0.6rem', borderRadius: '20px', fontSize: '0.8rem', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                      <Zap size={12} fill="currentColor" /> SAVE {plan.discountPercent}%
                    </span>
                  )}
                </div>
              )}
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.25rem' }}>
                <span style={{ fontSize: '3rem', fontWeight: '800', color: 'var(--text)', letterSpacing: '-0.05em' }}>{plan.price}</span>
                {plan.period && <span style={{ color: 'var(--text-muted)', fontSize: '1.1rem', fontWeight: '500' }}>{plan.period}</span>}
              </div>
              
              {plan.basePrice && (
                <div style={{ marginTop: '0.75rem' }}>
                  <div style={{ 
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.4rem',
                    background: 'linear-gradient(90deg, rgba(245, 158, 11, 0.1), rgba(245, 158, 11, 0.05))',
                    border: '1px solid rgba(245, 158, 11, 0.2)',
                    color: '#d97706',
                    padding: '0.4rem 0.8rem',
                    borderRadius: '6px',
                    fontSize: '0.75rem',
                    fontWeight: 'bold',
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em'
                  }}>
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

            <div style={{ marginTop: 'auto' }}>
              <button 
                className={`btn`}
                style={{ 
                  width: '100%', 
                  height: '50px', 
                  fontSize: '1rem',
                  fontWeight: 700,
                  border: profile?.plan_type === plan.id ? '2px solid var(--success)' : (plan.popular ? 'none' : '2px solid var(--primary)'),
                  background: profile?.plan_type === plan.id ? 'rgba(16, 185, 129, 0.1)' : (plan.popular ? 'var(--primary)' : 'transparent'),
                  color: profile?.plan_type === plan.id ? 'var(--success)' : (plan.popular ? 'white' : 'var(--primary)'),
                  opacity: loading === plan.id ? 0.7 : 1,
                  cursor: (loading === plan.id || profile?.plan_type === plan.id) ? 'not-allowed' : 'pointer'
                }}
                onClick={() => {
                  if (profile?.plan_type !== plan.id) handleSubscribe(plan.id);
                }}
                disabled={loading === plan.id || profile?.plan_type === plan.id}
              >
                {profile?.plan_type === plan.id ? 'Active Plan' : (loading === plan.id ? 'Connecting...' : 'Upgrade Now')}
              </button>
            </div>
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
                {window.location.protocol === 'capacitor:' ? <Crown color="var(--primary)" /> : <Lock color="var(--success)" />} 
                {window.location.protocol === 'capacitor:' ? 'Upgrade to Pro/Premium' : 'Secure Checkout'}
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

            {window.location.protocol === 'capacitor:' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                <p style={{ lineHeight: 1.5, margin: 0 }}>
                  To comply with Play Store guidelines, native in-app purchases are not supported inside the app. You can easily upgrade your account from our web portal.
                </p>
                <div style={{ background: 'rgba(255,255,255,0.03)', padding: '1.25rem', borderRadius: '0.5rem', border: '1px solid var(--border)' }}>
                  <h4 style={{ margin: '0 0 0.75rem 0', color: 'var(--primary)' }}>How to Upgrade:</h4>
                  <ol style={{ paddingLeft: '1.2rem', margin: 0, display: 'flex', flexDirection: 'column', gap: '0.5rem', fontSize: '0.95rem' }}>
                    <li>Open your web browser and go to <strong>cheerfulchalet.com</strong></li>
                    <li>Sign in using your current email and password.</li>
                    <li>Go to the <strong>Subscription</strong> tab and complete your payment.</li>
                  </ol>
                </div>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontStyle: 'italic', margin: 0 }}>
                  ℹ️ Once your payment is complete on the web, this mobile app will immediately unlock all your premium features.
                </p>
                <button 
                  type="button" 
                  className="btn btn-primary" 
                  style={{ width: '100%', height: '50px', fontSize: '1.1rem', marginTop: '1rem' }}
                  onClick={() => setCheckoutModal({ isOpen: false, planId: null })}
                >
                  Got It
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
