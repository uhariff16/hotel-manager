import { format } from 'date-fns';

/**
 * PURE presentation helper for trial & subscription lifecycle state.
 *
 * @param {Object} params
 * @param {Object} params.profile User profile from useSettingsStore
 * @param {Object} params.activeSubscription Active saas_subscription record (if any)
 * @param {Object} params.globalPlans Pricing plans map from useSettingsStore
 * @param {Object} params.tenantAdminData Owning tenant admin profile (for staff users)
 * @returns {Object} Structured presentation state
 */
export function getTrialPresentationState({ profile, activeSubscription, globalPlans, tenantAdminData }) {
  if (!profile) {
    return {
      isActiveTrial: false,
      isExpired: false,
      isPaid: false,
      isLegacy: false,
      isSuspended: false,
      isStaff: false,
      isSuper: false,
      daysRemaining: 0,
      formattedStartDate: '',
      formattedEndDate: '',
      urgencyLevel: 'none',
      planName: '',
      planKey: 'free',
      price: 0,
      offerPrice: 0,
      isPromoActive: false,
      priceText: '₹0',
      offerPriceText: '₹0',
      effectiveMonthlyPrice: 0,
      effectivePriceText: '₹0'
    };
  }

  const role = profile.role || 'tenant_admin';
  const isSuper = role === 'super_admin';
  const isStaff = role === 'staff';

  // For staff users, trial dates and plan_type come from owning tenant admin profile if available
  const effectiveProfile = isStaff ? (tenantAdminData || {}) : profile;

  const planKey = effectiveProfile.plan_type || profile.plan_type || 'free';
  const isFreePlan = planKey === 'free';
  const isLegacy = effectiveProfile.is_legacy_account === true || profile.is_legacy_account === true;
  const isSuspended = profile.subscription_status === 'suspended' || effectiveProfile.subscription_status === 'suspended';

  // Paid state is determined by active saas_subscriptions record
  const isPaid = activeSubscription?.status === 'active';

  // Plan metadata from global_settings.pricing
  const planConfig = globalPlans?.[planKey] || {};
  const planName = planConfig.name || (planKey === 'custom_1786983013013' ? 'Solo' : (planKey === 'pro' ? 'Growth' : (planKey === 'premium' ? 'Stay Master' : planKey.toUpperCase())));

  // Promotional pricing logic
  const isPromoActive = planConfig.offerActive === true && Number(planConfig.offerPrice) > 0;
  const price = Number(planConfig.price || 0);
  const offerPrice = Number(planConfig.offerPrice || 0);
  const effectiveMonthlyPrice = isPromoActive ? offerPrice : price;
  const priceText = `₹${price.toLocaleString('en-IN')}`;
  const offerPriceText = `₹${offerPrice.toLocaleString('en-IN')}`;
  const effectivePriceText = `₹${effectiveMonthlyPrice.toLocaleString('en-IN')}`;

  // Trial dates authority
  const trialStartedAt = effectiveProfile.trial_started_at;
  const trialEndsAt = effectiveProfile.trial_ends_at;

  const formattedStartDate = trialStartedAt ? format(new Date(trialStartedAt), 'dd MMM yyyy') : '';
  const formattedEndDate = trialEndsAt ? format(new Date(trialEndsAt), 'dd MMM yyyy') : '';

  // Expiry check from server RPC flag or timestamp
  const isServerExpired = profile.is_trial_expired_server === true;
  const hasTrialDates = Boolean(trialEndsAt);
  const endDateMs = trialEndsAt ? new Date(trialEndsAt).getTime() : 0;
  const nowMs = Date.now();
  const msRemaining = endDateMs - nowMs;

  const isTimestampExpired = hasTrialDates && msRemaining <= 0;
  const isExpired = isServerExpired || isTimestampExpired;

  // Active trial eligibility
  const isActiveTrial = !isSuper
    && !isFreePlan
    && !isSuspended
    && !isLegacy
    && !isPaid
    && hasTrialDates
    && !isExpired;

  // Calculate presentation remaining days cleanly using Math.ceil
  let daysRemaining = 0;
  let urgencyLevel = 'none';

  if (isExpired && !isFreePlan && !isSuper && !isLegacy && !isPaid && !isSuspended) {
    urgencyLevel = 'expired';
    daysRemaining = 0;
  } else if (isActiveTrial && trialEndsAt) {
    daysRemaining = Math.max(1, Math.ceil(msRemaining / (1000 * 60 * 60 * 24)));

    if (msRemaining <= 1000 * 60 * 60 * 24) {
      urgencyLevel = 'lastDay';
    } else if (daysRemaining <= 3) {
      urgencyLevel = 'urgent';
    } else if (daysRemaining <= 7) {
      urgencyLevel = 'endingSoon';
    } else {
      urgencyLevel = 'normal';
    }
  }

  return {
    isActiveTrial,
    isExpired,
    isPaid,
    isLegacy,
    isSuspended,
    isStaff,
    isSuper,
    daysRemaining,
    formattedStartDate,
    formattedEndDate,
    urgencyLevel,
    planName,
    planKey,
    price,
    offerPrice,
    isPromoActive,
    priceText,
    offerPriceText,
    effectiveMonthlyPrice,
    effectivePriceText
  };
}
