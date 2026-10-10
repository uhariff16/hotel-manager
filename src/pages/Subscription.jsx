import React, { useState, useEffect } from 'react';
import { useSettingsStore } from '../lib/store';
import { Check, Zap, Crown, CreditCard, Shield, X, Lock, Sparkles, ArrowRight, FileText } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { createPortal } from 'react-dom';
import { getTrialPresentationState } from '../lib/trial';
import { resolveEffectivePlan } from '../utils/planEntitlements';
import { useLocation, useNavigate } from 'react-router-dom';
import PlanComparison, { getSanitizedFeatures } from '../components/PlanComparison';
import SaaSInvoiceModal from '../components/SaaSInvoiceModal';

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
  const { profile, setProfile, globalPlans, websitePricing, globalTaxSettings } = useSettingsStore();
  const [loading, setLoading] = useState(null);
  const [subDataLoading, setSubDataLoading] = useState(true);
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);
  const [expandedFeatures, setExpandedFeatures] = useState({});
  
  const [checkoutModal, setCheckoutModal] = useState({ isOpen: false, planId: null });
  const [checkoutError, setCheckoutError] = useState(null);
  const [switchTrialModal, setSwitchTrialModal] = useState({ isOpen: false, targetPlanKey: null });
  const [switchSuccessMessage, setSwitchSuccessMessage] = useState(null);
  const [selectedInvoicePayment, setSelectedInvoicePayment] = useState(null);

  const [activeSubscription, setActiveSubscription] = useState(null);
  const [paymentHistory, setPaymentHistory] = useState([]);

  const trialState = getTrialPresentationState({
    profile,
    activeSubscription,
    globalPlans
  });

  const hasBillingHistory = paymentHistory && paymentHistory.length > 0;

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth <= 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    if (profile?.id) {
       fetchSubscriptionData();
    } else {
       setSubDataLoading(false);
    }
  }, [profile?.id]);

  const location = useLocation();
  const navigate = useNavigate();

  // Direct #billing-history navigation check: fallback gracefully if no billing records exist
  useEffect(() => {
    if (location.hash === '#billing-history' && !subDataLoading && !hasBillingHistory) {
      window.history.replaceState({}, '', '/subscription');
    }
  }, [location.hash, subDataLoading, hasBillingHistory]);

  const searchParams = new URLSearchParams(location.search);
  const checkoutPlan = searchParams.get('checkout') || sessionStorage.getItem('staypilot_checkout_intent');
  const hasAutoCheckoutRun = React.useRef(false);

  const clearCheckoutIntent = () => {
    sessionStorage.removeItem('staypilot_checkout_intent');
    if (window.location.search.includes('checkout=') || window.location.search.includes('intent=')) {
      window.history.replaceState({}, '', '/subscription');
    }
  };

  const getPlanName = (planKey) => {
    const config = globalPlans?.[planKey] || {};
    return config.name || (planKey === 'custom_1786983013013' ? 'Solo' : (planKey === 'pro' ? 'Growth' : (planKey === 'premium' ? 'Stay Master' : planKey.toUpperCase())));
  };

  useEffect(() => {
    const initAutoCheckout = async () => {
      if (!checkoutPlan || hasAutoCheckoutRun.current || !profile?.id || !globalPlans || subDataLoading) return;

      const userRole = profile?.role;
      if (userRole !== 'tenant_admin') {
        clearCheckoutIntent();
        if (userRole === 'staff') {
          alert("Only property owners (Tenant Admins) can manage or purchase subscriptions.");
        } else if (userRole === 'super_admin') {
          alert("Super Admins manage global settings and cannot subscribe to plans.");
        } else {
          alert("Subscription purchase is restricted to property owners (Tenant Admins).");
        }
        navigate('/subscription', { replace: true });
        return;
      }

      if (profile.subscription_status === 'suspended') {
        clearCheckoutIntent();
        alert("Your account is suspended. Please contact support.");
        navigate('/subscription', { replace: true });
        return;
      }

      const resolved = resolveEffectivePlan(checkoutPlan, globalPlans);
      if (resolved.isUnknownPlan || !resolved.planConfig || resolved.planConfig.enabled === false || resolved.planKey === 'free') {
        clearCheckoutIntent();
        alert("Selected plan is invalid or unavailable for purchase.");
        navigate('/subscription', { replace: true });
        return;
      }

      if (activeSubscription?.status === 'active') {
        clearCheckoutIntent();
        const activePlanName = getPlanName(activeSubscription.staypilot_plan_type);
        alert(`You already have an active subscription for ${activePlanName}. Subscriptions can be managed below.`);
        navigate('/subscription', { replace: true });
        return;
      }

      hasAutoCheckoutRun.current = true;
      clearCheckoutIntent();
      handleSubscribe(resolved.planKey);
    };

    initAutoCheckout();
  }, [checkoutPlan, profile?.id, profile?.role, profile?.subscription_status, globalPlans, activeSubscription, subDataLoading]);

  useEffect(() => {
    const handleOpenCheckoutEvent = (e) => {
      const targetPlan = e.detail?.planId || profile?.plan_type || 'pro';
      handleSubscribe(targetPlan);
    };
    window.addEventListener('staypilot:open-checkout', handleOpenCheckoutEvent);
    return () => window.removeEventListener('staypilot:open-checkout', handleOpenCheckoutEvent);
  }, [profile?.plan_type, activeSubscription, trialState]);

  const fetchSubscriptionData = async () => {
     setSubDataLoading(true);
     try {
       const { data: subData } = await supabase.from('saas_subscriptions')
         .select('*')
         .eq('tenant_id', profile.id)
         .eq('status', 'active')
         .order('created_at', { ascending: false })
         .limit(1)
         .maybeSingle();
       setActiveSubscription(subData || null);

       const { data: payData } = await supabase.from('saas_payments')
         .select('*').eq('tenant_id', profile.id).order('created_at', { ascending: false });
       if (payData) setPaymentHistory(payData);
     } catch (e) {
       console.error("Failed to load subscription data", e);
     } finally {
       setSubDataLoading(false);
     }
  };

  const handleSwitchTrialPlanClick = (targetPlanKey) => {
    if (!trialState.isActiveTrial || trialState.isPaid || trialState.isExpired || trialState.isStaff || trialState.isSuper || trialState.isLegacy || trialState.isSuspended) {
      alert("Trial switching is only available for active, unpaid free trials.");
      return;
    }
    if (targetPlanKey === profile?.plan_type || targetPlanKey === 'free') return;
    if (globalPlans?.[targetPlanKey]?.enabled === false) {
      alert("Selected plan is not available.");
      return;
    }

    setSwitchTrialModal({ isOpen: true, targetPlanKey });
  };

  const confirmSwitchTrialPlan = async (targetPlanKey) => {
    const planName = getPlanName(targetPlanKey);
    setLoading(targetPlanKey);
    try {
      const { data, error } = await supabase.rpc('switch_trial_plan', {
        p_destination_plan: targetPlanKey
      });

      if (error) throw error;
      if (!data?.success) {
        throw new Error(data?.error || "Failed to switch trial plan");
      }

      if (data.changed) {
        setProfile({ ...profile, plan_type: data.plan_type });
        setSwitchSuccessMessage(`Your free trial has been switched to ${planName}. Your trial still ends on ${trialState.formattedEndDate}.`);
      }

      setSwitchTrialModal({ isOpen: false, targetPlanKey: null });
    } catch (err) {
      alert("Failed to switch trial plan: " + err.message);
    } finally {
      setLoading(null);
    }
  };

  const handleCancelSubscription = async () => {
     if (!window.confirm("Are you sure you want to cancel your subscription? You will retain paid access until the end of your current billing period.")) return;
     
     setLoading('cancel');
      try {
        const { data, error } = await supabase.functions.invoke('razorpay-cancel-subscription');
        
        if (error || data?.error) {
          throw new Error(error?.message || data?.error || "Unknown error occurred");
        }

        const formattedEnd = activeSubscription?.current_period_end 
          ? new Date(activeSubscription.current_period_end).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
          : 'the end of your current period';

        alert(`Subscription cancellation scheduled. Your paid access continues until ${formattedEnd}.`);
        window.location.reload();
      } catch (err) {
        alert("Failed to cancel subscription: " + err.message);
      } finally {
        setLoading(null);
     }
  };

  const isOfferValid = (planConfig) => {
    if (!planConfig || !planConfig.offerActive) return false;
    const today = new Date().toLocaleDateString('en-CA');
    if (planConfig.offerStartDate && today < planConfig.offerStartDate) return false;
    if (planConfig.offerEndDate && today > planConfig.offerEndDate) return false;
    return true;
  };

  const getRecurringBillingAmount = () => {
    if (!activeSubscription || activeSubscription.status !== 'active') return null;

    // 1. Direct amount property on activeSubscription if present and positive
    if (activeSubscription.amount && Number(activeSubscription.amount) > 0) {
      const numAmt = Number(activeSubscription.amount);
      return numAmt > 10000 ? Math.round(numAmt / 100) : numAmt;
    }

    // 2. Captured payment strictly belonging to THIS active Razorpay subscription ID
    if (activeSubscription.razorpay_subscription_id && paymentHistory?.length > 0) {
      const subPayment = paymentHistory.find(
        (p) => p.razorpay_subscription_id === activeSubscription.razorpay_subscription_id && p.status === 'captured' && Number(p.amount) > 0
      );
      if (subPayment && Number(subPayment.amount) > 0) {
        const numAmt = Number(subPayment.amount);
        return numAmt > 10000 ? Math.round(numAmt / 100) : numAmt;
      }
    }

    // 3. Fallback to current configured price for activeSubscription.staypilot_plan_type from globalPlans
    const planKey = activeSubscription.staypilot_plan_type || profile?.plan_type;
    if (planKey && globalPlans?.[planKey]) {
      const config = globalPlans[planKey];
      const offerActive = isOfferValid(config);
      const effectivePrice = offerActive && config.offerPrice !== undefined
        ? Math.min(Number(config.price || 0), Number(config.offerPrice || 0))
        : Number(config.price || 0);
      if (effectivePrice > 0) {
        return effectivePrice;
      }
    }

    // 4. Return null (displays "Unavailable" in UI) if amount cannot be authoritatively determined
    return null;
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
          name: config.name || (id === 'custom_1786983013013' ? 'Solo' : (id === 'pro' ? 'Growth' : (id === 'premium' ? 'Stay Master' : id.toUpperCase()))),
          description: config.description || '',
          price: rawActive === 0 ? '₹0' : `₹${rawActive.toLocaleString('en-IN')}`,
          rawPrice: rawActive,
          basePrice: rawBase ? `₹${rawBase.toLocaleString('en-IN')}` : null,
          discountPercent,
          offerEndDate: offerActive && config.offerEndDate ? config.offerEndDate : null,
          period: id === 'free' ? '' : '/month',
          color: config.color || 'var(--primary)',
          popular: config.popular || false,
          icon: id === 'free' ? <Zap size={22} /> : (id === 'premium' ? <Shield size={22} /> : <Crown size={22} />),
          features: getSanitizedFeatures(config)
        };
      })
      .sort((a, b) => {
        const orderA = websitePricing?.published?.[a.id]?.displayOrder || 99;
        const orderB = websitePricing?.published?.[b.id]?.displayOrder || 99;
        return orderA - orderB;
      });
  };

  const plansList = getPlansList();

  const activePromoDates = plansList
    .filter(p => p.offerEndDate)
    .map(p => p.offerEndDate);
  const globalPromoEndDate = activePromoDates.length > 0 ? activePromoDates[0] : null;

  const toggleExpandFeatures = (planId) => {
    setExpandedFeatures(prev => ({
      ...prev,
      [planId]: !prev[planId]
    }));
  };

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
    if (planId === profile?.plan_type && trialState.isPaid) return;

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

    setCheckoutModal({ isOpen: true, planId });
  };

  const processPayment = async (planId) => {
    if (loading === planId) return;
    setLoading(planId);
    setCheckoutError(null);
    try {
      const res = await loadRazorpayScript();
      if (!res) throw new Error("Razorpay SDK failed to load. Are you online?");

      let { data: { session }, error: sessionErr } = await supabase.auth.getSession();
      
      if (!session || !session.access_token) {
        const { data: refreshData, error: refreshErr } = await supabase.auth.refreshSession();
        session = refreshData?.session;
        if (refreshErr || !session?.access_token) {
          throw new Error("Unauthorized: Auth session missing! Please sign in again.");
        }
      }

      const { data, error } = await supabase.functions.invoke('razorpay-create-subscription', {
        body: { plan_type: planId },
        headers: {
          Authorization: `Bearer ${session.access_token}`
        }
      });

      if (error || (data && data.error)) {
        let errMsg = data?.error;
        if (!errMsg && error) {
          if (error.context && typeof error.context.clone === 'function' && !error.context.bodyUsed) {
            try {
              const clonedRes = error.context.clone();
              const errJson = await clonedRes.json();
              errMsg = errJson?.error || errJson?.message;
            } catch {
              try {
                const clonedResText = error.context.clone();
                const text = await clonedResText.text();
                if (text && !text.includes('<html') && text.trim().length > 0) {
                  errMsg = text.trim();
                }
              } catch {
                // Ignore secondary text cloning failure
              }
            }
          }
          if (!errMsg) {
            errMsg = error.message;
          }
        }
        throw new Error(errMsg || 'Failed to initialize checkout');
      }

      const options = {
        key: data.key_id,
        subscription_id: data.subscription_id,
        name: "Stay Pilot",
        description: `Subscription for ${getPlanName(planId)}`,
        prefill: {
          name: profile?.full_name || '',
          email: session?.user?.email || profile?.email || '',
          contact: profile?.phone || ''
        },
        handler: async function (response) {
          try {
            const { data: { session: currentSession } } = await supabase.auth.getSession();
            const token = currentSession?.access_token || session?.access_token || '';
            const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://lubkdxhqnnghnjhrebat.supabase.co';

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
            setProfile({...profile, plan_type: planId});
            window.location.reload();
          } catch (err) {
            console.error(err);
            setCheckoutError("Verification error: " + err.message);
          }
        },
        modal: {
          ondismiss: function() {
            setLoading(null);
          }
        },
        prefill: {
          name: profile?.full_name || '',
          email: profile?.email || '',
          contact: profile?.phone_number || '9999999999',
        },
        theme: {
          color: "#0F2C59"
        }
      };

      const rzp = new window.Razorpay(options);
      rzp.on('payment.failed', function (response) {
        setCheckoutError("Payment failed: " + (response.error?.description || 'Transaction cancelled or declined.'));
        setLoading(null);
      });
      rzp.open();
    } catch (err) {
      console.error("Checkout initialization failed:", err);
      setCheckoutError(err.message);
    } finally {
      setLoading(null);
    }
  };

  if (!globalPlans) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '60vh', gap: '1rem' }}>
        <div className="animate-spin" style={{ border: '3px solid rgba(255,255,255,0.1)', borderTop: '3px solid var(--primary)', borderRadius: '50%', width: '40px', height: '40px' }}></div>
        <p style={{ color: 'var(--text-muted)', fontSize: '1.1rem' }}>Loading subscription plans...</p>
      </div>
    );
  }

  return (
    <div style={{ width: '100%', maxWidth: '1200px', margin: '0 auto', boxSizing: 'border-box' }}>
      
      {/* Authenticated Page Header */}
      <div style={{ marginBottom: '1.75rem' }}>
        <h2 style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--text-main)', margin: '0 0 0.25rem 0', letterSpacing: '-0.01em' }}>
          Plans & Billing
        </h2>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', margin: 0 }}>
          Manage your subscription, plan and billing history.
        </p>
      </div>

      {/* Switch Success Banner */}
      {switchSuccessMessage && (
        <div className="card" style={{ 
          marginBottom: '1.5rem', padding: '1rem 1.25rem', borderRadius: '12px',
          background: 'rgba(16, 185, 129, 0.1)', border: '1px solid var(--success)',
          color: 'var(--success)', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          fontSize: '0.9rem'
        }}>
          <div style={{ fontWeight: 600 }}>✓ {switchSuccessMessage}</div>
          <button onClick={() => setSwitchSuccessMessage(null)} style={{ background: 'none', border: 'none', color: 'var(--success)', cursor: 'pointer', fontWeight: 700 }}>✕</button>
        </div>
      )}

      {/* SECTION 1: YOUR SUBSCRIPTION SUMMARY CARD */}
      <div className="card" style={{ 
        marginBottom: '2rem', 
        padding: '1.5rem 1.75rem', 
        borderRadius: '16px',
        background: 'var(--card-bg)',
        border: '1px solid var(--border)',
        boxShadow: '0 4px 12px rgba(0,0,0,0.03)'
      }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '1.25rem' }}>
          <div>
            <div style={{ fontSize: '0.75rem', fontWeight: 800, letterSpacing: '0.05em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '0.35rem' }}>
              Your Subscription
            </div>
            
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '0.4rem' }}>
              <h3 style={{ fontSize: '1.4rem', fontWeight: 800, margin: 0, color: 'var(--text-main)' }}>
                {getPlanName(activeSubscription ? activeSubscription.staypilot_plan_type : profile?.plan_type)}
              </h3>

              <span style={{ 
                padding: '0.25rem 0.75rem', 
                borderRadius: '20px', 
                fontSize: '0.75rem', 
                fontWeight: 800, 
                letterSpacing: '0.04em',
                textTransform: 'uppercase',
                background: trialState.isActiveTrial 
                  ? 'rgba(245, 158, 11, 0.12)' 
                  : (activeSubscription?.cancel_at_period_end
                      ? 'rgba(245, 158, 11, 0.12)'
                      : (activeSubscription?.status === 'active' || profile?.is_legacy_account || trialState.isLegacy ? 'rgba(16, 185, 129, 0.12)' : 'rgba(100, 116, 139, 0.12)')),
                color: trialState.isActiveTrial 
                  ? '#d97706' 
                  : (activeSubscription?.cancel_at_period_end
                      ? '#d97706'
                      : (activeSubscription?.status === 'active' || profile?.is_legacy_account || trialState.isLegacy ? '#10b981' : 'var(--text-muted)')),
                border: trialState.isActiveTrial 
                  ? '1px solid rgba(245, 158, 11, 0.3)' 
                  : (activeSubscription?.cancel_at_period_end
                      ? '1px solid rgba(245, 158, 11, 0.3)'
                      : (activeSubscription?.status === 'active' || profile?.is_legacy_account || trialState.isLegacy ? '1px solid rgba(16, 185, 129, 0.3)' : '1px solid var(--border)'))
              }}>
                {trialState.isActiveTrial 
                  ? 'FREE TRIAL' 
                  : (activeSubscription?.cancel_at_period_end
                      ? 'CANCELLATION SCHEDULED'
                      : (activeSubscription?.status === 'active' || profile?.is_legacy_account || trialState.isLegacy ? 'ACTIVE' : 'STANDARD'))}
              </span>
            </div>

            <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)', display: 'flex', flexWrap: 'wrap', gap: '1rem', fontVariantNumeric: 'tabular-nums' }}>
              {activeSubscription?.status === 'active' ? (
                activeSubscription?.cancel_at_period_end ? (
                  <>
                    <span>Access Until: <strong>{activeSubscription.current_period_end ? new Date(activeSubscription.current_period_end).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : 'End of Billing Cycle'}</strong></span>
                    <span>•</span>
                    <span>Status: <strong>No Auto-Renewal • Paid Features Preserved</strong></span>
                  </>
                ) : (
                  <>
                    <span>Billing: <strong>{getRecurringBillingAmount() ? `₹${getRecurringBillingAmount().toLocaleString('en-IN')} / month` : 'Unavailable'}</strong></span>
                    <span>•</span>
                    <span>Next Renewal: <strong>{activeSubscription.current_period_end ? new Date(activeSubscription.current_period_end).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : 'Processing'}</strong></span>
                  </>
                )
              ) : trialState.isActiveTrial ? (
                <>
                  <span>Trial Period: <strong>{trialState.daysRemaining} {trialState.daysRemaining === 1 ? 'Day' : 'Days'} Remaining</strong> (Ends {trialState.formattedEndDate})</span>
                </>
              ) : (profile?.is_legacy_account || trialState.isLegacy) ? (
                <>
                  <span>Account Type: <strong>Legacy Access • Legacy Account</strong></span>
                </>
              ) : (
                <>
                  <span>Account Status: <strong>{trialState.isExpired ? 'Trial Expired' : 'Standard Free Starter Account'}</strong></span>
                </>
              )}
            </div>

            {activeSubscription?.status === 'active' && activeSubscription?.cancel_at_period_end && (
              <div style={{ marginTop: '0.75rem', fontSize: '0.825rem', color: '#d97706', background: 'rgba(245, 158, 11, 0.08)', padding: '0.5rem 0.85rem', borderRadius: '8px', border: '1px solid rgba(245, 158, 11, 0.2)', display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
                <span>Your subscription is scheduled for cancellation. Full paid features remain active through {activeSubscription.current_period_end ? new Date(activeSubscription.current_period_end).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : 'the end of your current billing period'} and automatic renewal has stopped.</span>
              </div>
            )}
          </div>

          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
            <a 
              href="#available-plans"
              className="btn btn-outline"
              style={{ padding: '0.6rem 1.1rem', fontSize: '0.875rem', fontWeight: 700, borderRadius: '8px', minHeight: '40px', textDecoration: 'none' }}
            >
              {activeSubscription?.status === 'active' ? 'Manage Plan' : 'Explore Plans'}
            </a>
            {hasBillingHistory && (
              <a 
                href="#billing-history"
                className="btn btn-outline"
                style={{ padding: '0.6rem 1.1rem', fontSize: '0.875rem', fontWeight: 700, borderRadius: '8px', minHeight: '40px', textDecoration: 'none' }}
              >
                Billing History
              </a>
            )}
          </div>
        </div>
      </div>

      {/* SECTION 2: PROMOTIONAL BANNER (WHEN ACTIVE) */}
      {globalPromoEndDate && (
        <div style={{ 
          marginBottom: '1.5rem', 
          padding: '0.85rem 1.25rem', 
          borderRadius: '12px',
          background: 'linear-gradient(90deg, rgba(245, 158, 11, 0.12), rgba(245, 158, 11, 0.04))',
          border: '1px solid rgba(245, 158, 11, 0.3)',
          color: '#d97706',
          display: 'flex',
          alignItems: 'center',
          gap: '0.75rem',
          fontSize: '0.875rem',
          fontWeight: 600
        }}>
          <Zap size={18} fill="currentColor" style={{ flexShrink: 0 }} />
          <div>
            <strong>⚡ Limited-time promotional pricing:</strong> Special pricing available until {formatOfferDate(globalPromoEndDate)}.
          </div>
        </div>
      )}

      {/* SECTION 3: AVAILABLE PLANS */}
      <div id="available-plans" style={{ marginBottom: '3.5rem' }}>
        <div style={{ marginBottom: '1.5rem' }}>
          <h3 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--text-main)', margin: '0 0 0.25rem 0' }}>
            Available Plans
          </h3>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', margin: 0 }}>
            Choose the plan that best fits your property and business needs.
          </p>
        </div>

        {/* Pricing Cards Grid */}
        <div style={{ 
          display: 'grid', 
          gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fit, minmax(300px, 1fr))', 
          gap: '1.5rem', 
          alignItems: 'stretch' 
        }}>
          {plansList.map((plan) => {
            const isCurrentPlan = profile?.plan_type === plan.id;
            const isPaidCurrentPlan = isCurrentPlan && (trialState.isPaid || activeSubscription?.status === 'active');
            const isTrialingThisPlan = isCurrentPlan && trialState.isActiveTrial && !trialState.isPaid && !trialState.isLegacy;
            const canSwitchTrial = trialState.isActiveTrial && !trialState.isLegacy && !isCurrentPlan && plan.id !== 'free';

            const isExpanded = expandedFeatures[plan.id] || false;
            const displayFeatures = (isMobile && !isExpanded && plan.features.length > 4) 
              ? plan.features.slice(0, 4) 
              : plan.features;

            const rawConfig = globalPlans?.[plan.id] || {};
            const maxResorts = rawConfig.maxResorts ?? rawConfig.max_resorts ?? rawConfig.resortLimit;
            const maxRooms = rawConfig.maxRooms ?? rawConfig.max_rooms ?? rawConfig.roomLimit;
            const maxStaff = rawConfig.maxStaff ?? rawConfig.max_staff ?? rawConfig.staffLimit;

            const limitsList = [];
            if (maxResorts !== undefined && maxResorts !== null) {
              limitsList.push(Number(maxResorts) >= 999999 ? 'Unlimited Properties' : `${maxResorts} ${Number(maxResorts) === 1 ? 'Property' : 'Properties'}`);
            }
            if (maxRooms !== undefined && maxRooms !== null) {
              limitsList.push(Number(maxRooms) >= 999999 ? 'Unlimited Rooms' : `Up to ${maxRooms} Rooms`);
            }
            if (maxStaff !== undefined && maxStaff !== null) {
              limitsList.push(Number(maxStaff) >= 999999 ? 'Unlimited Staff' : `Up to ${maxStaff} Staff`);
            }

            return (
              <div key={plan.id} className="card" style={{ 
                display: 'flex', 
                flexDirection: 'column',
                padding: '1.75rem',
                borderRadius: '16px',
                position: 'relative',
                background: 'var(--card-bg)',
                border: isCurrentPlan ? '2px solid #10b981' : (plan.popular ? '2px solid var(--primary)' : '1px solid var(--border)'),
                boxShadow: isCurrentPlan ? '0 10px 25px -5px rgba(16, 185, 129, 0.15)' : (plan.popular ? '0 10px 25px -5px rgba(0, 0, 0, 0.08)' : '0 2px 8px rgba(0,0,0,0.02)'),
                transition: 'all 0.25s ease',
                boxSizing: 'border-box'
              }}>
                {/* Badges Header Area */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', minHeight: '26px' }}>
                  {plan.popular ? (
                    <span style={{ 
                      background: 'var(--primary)', 
                      color: 'white', 
                      padding: '0.25rem 0.75rem', 
                      borderRadius: '20px', 
                      fontSize: '0.725rem', 
                      fontWeight: 800,
                      letterSpacing: '0.04em',
                      textTransform: 'uppercase'
                    }}>
                      MOST POPULAR
                    </span>
                  ) : <span />}

                  {isCurrentPlan && (
                    <span style={{ 
                      background: 'rgba(16, 185, 129, 0.12)', 
                      color: '#10b981', 
                      border: '1px solid rgba(16, 185, 129, 0.3)',
                      padding: '0.25rem 0.75rem', 
                      borderRadius: '20px', 
                      fontSize: '0.725rem', 
                      fontWeight: 800,
                      letterSpacing: '0.04em',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.35rem'
                    }}>
                      <Check size={13} /> CURRENT PLAN
                    </span>
                  )}
                </div>

                {/* Title & Description */}
                <div style={{ marginBottom: '1.25rem' }}>
                  <h3 style={{ fontSize: '1.35rem', fontWeight: 800, margin: '0 0 0.35rem 0', color: 'var(--text-main)' }}>
                    {plan.name}
                  </h3>
                  <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-muted)', lineHeight: '1.4', minHeight: '2.8em' }}>
                    {plan.description}
                  </p>
                </div>

                {/* Pricing Area */}
                <div style={{ marginBottom: '1.25rem', paddingBottom: '1.25rem', borderBottom: '1px solid var(--border)' }}>
                  {plan.basePrice && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                      <span style={{ textDecoration: 'line-through', color: 'var(--danger)', fontSize: '1.1rem', fontWeight: '600', opacity: 0.8 }}>
                        {plan.basePrice}/mo
                      </span>
                      {plan.discountPercent && (
                        <span style={{ background: 'rgba(16, 185, 129, 0.12)', color: '#10b981', padding: '0.15rem 0.5rem', borderRadius: '12px', fontSize: '0.75rem', fontWeight: 800 }}>
                          SAVE {plan.discountPercent}%
                        </span>
                      )}
                    </div>
                  )}
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.25rem' }}>
                    <span style={{ fontSize: '2.5rem', fontWeight: 800, color: 'var(--text-main)', fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.03em' }}>
                      {plan.price}
                    </span>
                    {plan.period && <span style={{ color: 'var(--text-muted)', fontSize: '1rem', fontWeight: '600' }}>{plan.period}</span>}
                  </div>
                  {globalTaxSettings?.enabled && plan.id !== 'free' && (
                    <div style={{ color: 'var(--text-muted)', fontSize: '0.775rem', fontWeight: '600', marginTop: '0.2rem' }}>
                      + {globalTaxSettings.rate}% GST
                    </div>
                  )}
                </div>

                {/* PLAN LIMITS (PROMINENT) */}
                {limitsList.length > 0 && (
                  <div style={{ marginBottom: '1.25rem', padding: '0.75rem 0.9rem', background: 'var(--bg-secondary)', borderRadius: '10px', border: '1px solid var(--border)' }}>
                    <div style={{ fontSize: '0.7rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', marginBottom: '0.35rem' }}>
                      Plan Limits
                    </div>
                    <div style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-main)', display: 'flex', flexWrap: 'wrap', gap: '0.4rem 0.75rem' }}>
                      {limitsList.map((lim, idx) => (
                        <span key={idx} style={{ display: 'inline-flex', alignItems: 'center' }}>
                          {idx > 0 && <span style={{ color: 'var(--text-muted)', marginRight: '0.75rem' }}>•</span>}
                          {lim}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* FEATURES INCLUDED */}
                <div style={{ flex: 1, marginBottom: '1.5rem' }}>
                  <div style={{ fontSize: '0.7rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', marginBottom: '0.75rem' }}>
                    What's Included
                  </div>
                  <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
                    {displayFeatures.map((feature, i) => (
                      <li key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: '0.55rem', fontSize: '0.875rem', color: 'var(--text-main)', lineHeight: '1.35' }}>
                        <Check size={16} style={{ color: '#10b981', flexShrink: 0, marginTop: '2px' }} />
                        <span>{feature}</span>
                      </li>
                    ))}
                  </ul>

                  {isMobile && plan.features.length > 4 && (
                    <button
                      type="button"
                      onClick={() => toggleExpandFeatures(plan.id)}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: '#10b981',
                        fontSize: '0.8rem',
                        fontWeight: 700,
                        cursor: 'pointer',
                        padding: '0.5rem 0 0 0',
                        marginTop: '0.5rem',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.25rem'
                      }}
                    >
                      {isExpanded ? 'Show less features' : `View all ${plan.features.length} features ↓`}
                    </button>
                  )}
                </div>

                {/* CTA ACTIONS */}
                <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  <button 
                    className="btn"
                    style={{ 
                      width: '100%', 
                      height: '46px', 
                      fontSize: '0.925rem',
                      fontWeight: 700,
                      borderRadius: '10px',
                      border: isPaidCurrentPlan ? '1px solid var(--border)' : 'none',
                      background: isPaidCurrentPlan ? 'var(--bg-secondary)' : '#10b981',
                      color: isPaidCurrentPlan ? 'var(--text-muted)' : '#ffffff',
                      opacity: (loading === plan.id || isPaidCurrentPlan) ? 0.7 : 1,
                      cursor: (loading === plan.id || isPaidCurrentPlan) ? 'not-allowed' : 'pointer',
                      transition: 'all 0.2s ease',
                      boxShadow: isPaidCurrentPlan ? 'none' : '0 2px 6px rgba(16, 185, 129, 0.25)'
                    }}
                    onClick={() => {
                      if (!isPaidCurrentPlan) handleSubscribe(plan.id);
                    }}
                    disabled={loading === plan.id || isPaidCurrentPlan}
                  >
                    {isPaidCurrentPlan 
                      ? 'Current Plan' 
                      : (loading === plan.id 
                          ? 'Connecting...' 
                          : (plan.id === 'free' ? 'Downgrade' : `Subscribe to ${plan.name}`))}
                  </button>

                  {canSwitchTrial && (
                    <button
                      type="button"
                      style={{
                        width: '100%',
                        padding: '0.4rem 0',
                        background: 'none',
                        border: 'none',
                        color: '#10b981',
                        fontSize: '0.825rem',
                        fontWeight: 700,
                        cursor: 'pointer',
                        textAlign: 'center',
                        transition: 'opacity 0.2s',
                        opacity: loading === plan.id ? 0.6 : 1,
                        minHeight: '36px'
                      }}
                      onClick={() => handleSwitchTrialPlanClick(plan.id)}
                      disabled={loading === plan.id}
                    >
                      Switch Trial to {plan.name}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* SECTION 4: DETAILED PLAN COMPARISON TABLE */}
      <div style={{ marginBottom: '3.5rem' }}>
        <PlanComparison 
          title="Compare Plans"
          subtitle="Detailed breakdown of features, limits, and support levels across all plans."
        />
      </div>

      {/* SECTION 5: BILLING & PAYMENT HISTORY (Conditional rendering based on authoritative billing records) */}
      {hasBillingHistory && (
        <div id="billing-history" className="card" style={{ 
          marginBottom: '2.5rem', 
          padding: '1.5rem 1.75rem', 
          borderRadius: '16px',
          background: 'var(--card-bg)',
          border: '1px solid var(--border)'
        }}>
          <h3 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--text-main)', margin: '0 0 1rem 0' }}>
            Billing & Payment History
          </h3>

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid var(--border)', textAlign: 'left', color: 'var(--text-muted)' }}>
                  <th style={{ padding: '0.75rem 0.5rem' }}>Date</th>
                  <th style={{ padding: '0.75rem 0.5rem' }}>Amount</th>
                  <th style={{ padding: '0.75rem 0.5rem' }}>Status</th>
                  <th style={{ padding: '0.75rem 0.5rem' }}>Transaction ID</th>
                  <th style={{ padding: '0.75rem 0.5rem', textAlign: 'right' }}>Invoice</th>
                </tr>
              </thead>
              <tbody>
                {paymentHistory.slice(0, 10).map(payment => (
                  <tr key={payment.id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '0.85rem 0.5rem', color: 'var(--text-main)', fontVariantNumeric: 'tabular-nums' }}>
                      {new Date(payment.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </td>
                    <td style={{ padding: '0.85rem 0.5rem', fontWeight: 700, color: 'var(--text-main)', fontVariantNumeric: 'tabular-nums' }}>
                      ₹{payment.amount ? (payment.amount / 100).toLocaleString('en-IN') : '0'}
                    </td>
                    <td style={{ padding: '0.85rem 0.5rem' }}>
                      <span style={{
                        padding: '0.2rem 0.55rem',
                        borderRadius: '12px',
                        fontSize: '0.7rem',
                        fontWeight: 800,
                        letterSpacing: '0.03em',
                        textTransform: 'uppercase',
                        background: payment.status === 'captured' ? 'rgba(16, 185, 129, 0.12)' : 'rgba(239, 68, 68, 0.12)',
                        color: payment.status === 'captured' ? '#10b981' : '#ef4444',
                        border: payment.status === 'captured' ? '1px solid rgba(16, 185, 129, 0.25)' : '1px solid rgba(239, 68, 68, 0.25)'
                      }}>
                        {payment.status === 'captured' ? 'SUCCESSFUL' : payment.status.toUpperCase()}
                      </span>
                    </td>
                    <td style={{ padding: '0.85rem 0.5rem', fontFamily: 'monospace', color: 'var(--text-muted)', fontSize: '0.825rem' }}>
                      {payment.razorpay_payment_id || payment.id.split('-')[0]}
                    </td>
                    <td style={{ padding: '0.85rem 0.5rem', textAlign: 'right' }}>
                      <button
                        type="button"
                        className="btn btn-outline"
                        style={{ padding: '0.3rem 0.65rem', fontSize: '0.8rem', borderRadius: '6px', display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}
                        onClick={() => setSelectedInvoicePayment(payment)}
                      >
                        <FileText size={14} /> Tax Invoice
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* SaaS Subscription Tax Invoice Modal */}
      <SaaSInvoiceModal
        isOpen={Boolean(selectedInvoicePayment)}
        onClose={() => setSelectedInvoicePayment(null)}
        payment={selectedInvoicePayment}
        profile={profile}
        globalTaxSettings={globalTaxSettings}
      />

      {/* SECTION 6: REASSURANCE FOOTER */}
      <div style={{
        padding: '1.25rem 1.5rem',
        borderRadius: '12px',
        background: 'var(--bg-secondary)',
        border: '1px solid var(--border)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '1rem',
        fontSize: '0.875rem',
        color: 'var(--text-muted)',
        marginBottom: isMobile ? '80px' : '0'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Shield size={18} style={{ color: '#10b981' }} />
          <span><strong>Secure Payments:</strong> Transactions are encrypted with 256-bit SSL security.</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem', flexWrap: 'wrap' }}>
          {activeSubscription && !activeSubscription.cancel_at_period_end && (
            <button
              onClick={handleCancelSubscription}
              disabled={loading === 'cancel'}
              style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', textDecoration: 'underline', fontSize: '0.85rem' }}
            >
              {loading === 'cancel' ? 'Cancelling...' : 'Cancel Subscription'}
            </button>
          )}
          <button
            onClick={() => navigate('/support')}
            style={{ background: 'none', border: 'none', color: '#10b981', cursor: 'pointer', fontWeight: 700, fontSize: '0.875rem', display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}
          >
            Need help choosing? Contact Support <ArrowRight size={14} />
          </button>
        </div>
      </div>

      {/* Trial Switch Confirmation Modal */}
      {switchTrialModal.isOpen && createPortal(
        <div className="modal-overlay" style={{ zIndex: 9999 }}>
          <div className="modal-content" style={{ maxWidth: '480px', padding: '2rem', textAlign: 'center' }}>
            <div style={{ width: '56px', height: '56px', borderRadius: '50%', background: 'rgba(5, 150, 105, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1rem', color: '#059669' }}>
              <Zap size={28} />
            </div>
            <h3 style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--text-main)', margin: '0 0 0.75rem 0' }}>
              Switch your free trial to {getPlanName(switchTrialModal.targetPlanKey)}?
            </h3>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.95rem', lineHeight: 1.6, margin: '0 0 1.5rem 0' }}>
              You'll get <strong>{getPlanName(switchTrialModal.targetPlanKey)}</strong> features for the remainder of your existing free trial.<br /><br />
              Your trial still ends on <strong>{trialState.formattedEndDate}</strong>.<br />
              <span style={{ color: '#059669', fontWeight: 700 }}>No payment will be taken.</span>
            </p>
            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center' }}>
              <button 
                type="button" 
                className="btn btn-outline" 
                style={{ flex: 1, padding: '0.75rem', fontWeight: 600 }}
                onClick={() => setSwitchTrialModal({ isOpen: false, targetPlanKey: null })}
              >
                Cancel
              </button>
              <button 
                type="button" 
                className="btn btn-primary" 
                style={{ flex: 1, padding: '0.75rem', fontWeight: 700 }}
                onClick={() => confirmSwitchTrialPlan(switchTrialModal.targetPlanKey)}
                disabled={loading === switchTrialModal.targetPlanKey}
              >
                {loading === switchTrialModal.targetPlanKey ? 'Switching...' : `Switch to ${getPlanName(switchTrialModal.targetPlanKey)}`}
              </button>
            </div>
          </div>
        </div>
      , document.body)}

      {/* Checkout Modal */}
      {checkoutModal.isOpen && createPortal(
        <div className="modal-overlay" style={{ zIndex: 9999 }}>
          <div className="modal-content" style={{ maxWidth: '500px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
              <h2 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                {window.location.protocol === 'capacitor:' ? <Crown color="var(--primary)" /> : <Lock color="var(--success)" />} 
                {window.location.protocol === 'capacitor:' ? 'Upgrade to Pro/Premium' : 'Secure Checkout'}
              </h2>
              <button type="button" className="btn-outline" style={{ padding: '0.5rem', borderRadius: '50%' }} 
                onClick={() => {
                  setCheckoutError(null);
                  setCheckoutModal({ isOpen: false, planId: null });
                }}
              >
                <X size={20} />
              </button>
            </div>
            
            {checkoutError && (
              <div style={{ 
                marginBottom: '1.25rem', 
                padding: '0.75rem 1rem', 
                borderRadius: '8px', 
                background: 'rgba(239, 68, 68, 0.1)', 
                border: '1px solid rgba(239, 68, 68, 0.3)', 
                color: '#ef4444', 
                fontSize: '0.875rem', 
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem'
              }}>
                <span>⚠️ {checkoutError}</span>
              </div>
            )}
            
            <div style={{ marginBottom: '1.5rem', background: 'rgba(0,0,0,0.03)', padding: '1rem', borderRadius: 'var(--radius-md)' }}>
              <h3 style={{ margin: '0 0 0.5rem 0' }}>{plansList.find(p => p.id === checkoutModal.planId)?.name}</h3>
              <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: 'var(--primary)' }}>
                {plansList.find(p => p.id === checkoutModal.planId)?.price} 
                <span style={{ fontSize: '1rem', color: 'var(--text-muted)' }}>{plansList.find(p => p.id === checkoutModal.planId)?.period || ''}</span>
              </div>
              {globalTaxSettings?.enabled && (
                <div style={{ fontSize: '0.9rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                  + {globalTaxSettings.rate}% GST will be added during checkout.
                </div>
              )}
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
                  💡 Once your payment is complete on the web, this mobile app will immediately unlock all your premium features.
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

            {window.location.protocol !== 'capacitor:' && (() => {
              const selectedPlan = plansList.find(p => p.id === checkoutModal.planId);
              if (!selectedPlan) return null;
              
              const basePricePaise = Math.round((selectedPlan.rawPrice || 0) * 100);
              const isGstActive = Boolean(globalTaxSettings?.enabled) && Number(globalTaxSettings?.rate || 0) > 0;
              const gstRate = isGstActive ? Number(globalTaxSettings.rate) : 0;
              const gstAmountPaise = isGstActive ? Math.round(basePricePaise * (gstRate / 100)) : 0;
              const totalAmountPaise = basePricePaise + gstAmountPaise;

              const rawPriceDisplay = (basePricePaise / 100).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
              const gstAmountDisplay = (gstAmountPaise / 100).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
              const totalAmountDisplay = (totalAmountPaise / 100).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 });

              return (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                  <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: '8px', padding: '1.25rem' }}>
                    <h4 style={{ margin: '0 0 1rem 0', color: 'var(--text-main)', borderBottom: '1px solid var(--border)', paddingBottom: '0.5rem' }}>Payment Breakdown</h4>
                    
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem', color: 'var(--text-muted)' }}>
                      <span>Base Subscription Price ({selectedPlan.name})</span>
                      <span>{'₹' + rawPriceDisplay}</span>
                    </div>
                    
                    {isGstActive && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem', color: 'var(--text-muted)' }}>
                        <span>GST ({gstRate}%)</span>
                        <span>{'₹' + gstAmountDisplay}</span>
                      </div>
                    )}

                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem', color: 'var(--text-muted)' }}>
                      <span>Billing Frequency</span>
                      <span>Monthly Recurring</span>
                    </div>
                    
                    {trialState?.isActiveTrial && !trialState?.isExpired && (
                      <div style={{ margin: '0.75rem 0', padding: '0.5rem 0.75rem', background: 'rgba(16, 185, 129, 0.08)', borderRadius: '6px', border: '1px solid rgba(16, 185, 129, 0.2)', fontSize: '0.825rem', color: '#10b981' }}>
                        💡 Proceeding to payment will start your paid subscription immediately and transition your account from trial to active status upon successful payment capture.
                      </div>
                    )}
                    
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '1rem', paddingTop: '1rem', borderTop: '1px dashed var(--border)', fontWeight: 'bold', color: 'var(--text-main)', fontSize: '1.1rem' }}>
                      <span>Final Recurring Charge</span>
                      <span>{'₹' + totalAmountDisplay} / month</span>
                    </div>
                  </div>
                  
                  <button 
                    type="button" 
                    className="btn btn-primary" 
                    style={{ width: '100%', height: '50px', fontSize: '1.1rem', marginTop: '1rem', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.5rem' }}
                    onClick={() => processPayment(checkoutModal.planId)}
                    disabled={loading === checkoutModal.planId}
                  >
                    {loading === checkoutModal.planId ? 'Connecting to Razorpay...' : 'Proceed to Payment (₹' + totalAmountDisplay + ')'}
                  </button>
                </div>
              );
            })()}
          </div>
        </div>
      , document.body)}
    </div>
  );
}
