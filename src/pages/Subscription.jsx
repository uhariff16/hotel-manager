import React, { useState } from 'react';
import { useSettingsStore } from '../lib/store';
import { Check, Zap, Crown, CreditCard, Shield } from 'lucide-react';
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

export default function Subscription() {
  const { profile, setProfile } = useSettingsStore();
  const [loading, setLoading] = useState(null);

  const handleSubscribe = async (planId) => {
    if (planId === profile?.plan_type) return;
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
        alert(`Success! Your account has been upgraded to the ${planId.toUpperCase()} plan.`);
      } catch (err) {
        alert("Payment simulation failed: " + err.message);
      } finally {
        setLoading(null);
      }
    }, 1500);
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
        {PLANS.map((plan) => (
          <div key={plan.id} className="card" style={{ 
            display: 'flex', 
            flexDirection: 'column',
            padding: '2.5rem',
            position: 'relative',
            border: plan.popular ? '2px solid var(--primary)' : '1px solid var(--border)',
            transform: plan.popular ? 'scale(1.05)' : 'none',
            zIndex: plan.popular ? 2 : 1,
            boxShadow: plan.popular ? '0 20px 25px -5px rgba(0, 0, 0, 0.4)' : ''
          }}>
            {plan.popular && (
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
          <p style={{ margin: 0, color: 'var(--text-muted)' }}>Your transactions are secured by 256-bit SSL encryption and processed via world-class gateways like Stripe and Razorpay.</p>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: '1rem', opacity: 0.6 }}>
          <CreditCard size={32} />
        </div>
      </div>
    </div>
  );
}
