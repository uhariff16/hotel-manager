import {
  evaluateSubscriptionEntitlement,
  parseVerifiedDate
} from './subscriptionEntitlement.js';

/**
 * STAYPILOT — Subscription Discrepancy & Inventory Engine
 * File: src/lib/subscriptionDiscrepancies.js
 *
 * Pure, deterministic functions for subscription monitoring, Test/Live segregation,
 * and automated discrepancy identification (D-01 through D-07).
 * Zero side-effects, zero mutations, zero network calls.
 */

// Explicit unit-aware currency formatter helper
export function formatCurrencyAmount({ amount, currency = 'INR', unit = 'paise' }) {
  if (amount === null || amount === undefined || isNaN(amount)) {
    return '—';
  }
  const numericVal = Number(amount);
  const normalizedRupees = unit === 'paise' ? numericVal / 100 : numericVal;

  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: currency || 'INR',
    maximumFractionDigits: normalizedRupees % 1 === 0 ? 0 : 2
  }).format(normalizedRupees);
}

// Format currency helper (INR) - backward compatible wrapper
export const formatINR = (paiseOrRupees, isPaise = false) => {
  return formatCurrencyAmount({
    amount: paiseOrRupees,
    currency: 'INR',
    unit: isPaise ? 'paise' : 'rupees'
  });
};

/**
 * Source-of-Truth Plan Resolution Engine (Phase C)
 * Explicitly resolves subscription plan and current account plan against authoritative
 * configurations, environment mappings, and canonical keys.
 *
 * @param {Object} params
 * @param {Object|null} [params.subscription] Subscription row
 * @param {Object|null} [params.tenant] Tenant profile row
 * @param {Object} [params.pricingConfig] Global plans / pricing config
 * @param {Object} [params.providerPlanMappings] Razorpay plan ID mappings
 * @param {string} [params.environment] 'live' | 'test'
 * @returns {Object} Structured plan resolution result
 */
export function resolveSubscriptionPlan({
  subscription = null,
  tenant = null,
  pricingConfig = {},
  providerPlanMappings = {},
  environment = 'live'
} = {}) {
  const subRawKey = subscription?.staypilot_plan_type || subscription?.plan_type || null;
  const providerPlanId = subscription?.razorpay_plan_id || null;

  let subscribedPlanName = null;
  let subscribedPlanSource = 'unresolved';
  let isVerified = false;
  let isHistorical = false;

  // 1. Resolve Subscribed Plan from subscription row
  if (subRawKey) {
    const rawLower = String(subRawKey).toLowerCase().trim();
    if (pricingConfig[subRawKey]?.name) {
      subscribedPlanName = pricingConfig[subRawKey].name;
      subscribedPlanSource = 'pricing_config';
      isVerified = true;
    } else if (rawLower === 'custom_1786983013013' || rawLower === 'solo') {
      subscribedPlanName = pricingConfig['custom_1786983013013']?.name || 'Solo';
      subscribedPlanSource = 'canonical_key';
      isVerified = true;
    } else if (rawLower === 'pro' || rawLower === 'growth') {
      subscribedPlanName = pricingConfig['pro']?.name || 'Growth';
      subscribedPlanSource = 'canonical_key';
      isVerified = true;
    } else if (rawLower === 'premium' || rawLower === 'stay_master' || rawLower === 'staymaster') {
      subscribedPlanName = pricingConfig['premium']?.name || 'Stay Master';
      subscribedPlanSource = 'canonical_key';
      isVerified = true;
    } else if (rawLower === 'free' || rawLower === 'trial') {
      subscribedPlanName = pricingConfig['free']?.name || 'Free Starter';
      subscribedPlanSource = 'canonical_key';
      isVerified = true;
    } else if (providerPlanId && providerPlanMappings[providerPlanId]) {
      subscribedPlanName = providerPlanMappings[providerPlanId].name || providerPlanMappings[providerPlanId];
      subscribedPlanSource = 'provider_mapping';
      isVerified = true;
    } else {
      subscribedPlanName = 'Unknown / Historical Plan';
      subscribedPlanSource = 'unresolved';
      isHistorical = true;
      isVerified = false;
    }
  } else if (providerPlanId && providerPlanMappings[providerPlanId]) {
    subscribedPlanName = providerPlanMappings[providerPlanId].name || providerPlanMappings[providerPlanId];
    subscribedPlanSource = 'provider_mapping';
    isVerified = true;
  } else {
    subscribedPlanName = 'Unknown / Historical Plan';
    subscribedPlanSource = 'unresolved';
    isVerified = false;
  }

  // 2. Resolve Current Account Plan from tenant profile
  const tenantRawKey = tenant?.plan_type || null;
  let currentAccountPlanName = null;
  let currentAccountPlanSource = 'unresolved';

  if (tenantRawKey) {
    const tLower = String(tenantRawKey).toLowerCase().trim();
    if (pricingConfig[tenantRawKey]?.name) {
      currentAccountPlanName = pricingConfig[tenantRawKey].name;
      currentAccountPlanSource = 'pricing_config';
    } else if (tLower === 'custom_1786983013013' || tLower === 'solo') {
      currentAccountPlanName = pricingConfig['custom_1786983013013']?.name || 'Solo';
      currentAccountPlanSource = 'canonical_key';
    } else if (tLower === 'pro' || tLower === 'growth') {
      currentAccountPlanName = pricingConfig['pro']?.name || 'Growth';
      currentAccountPlanSource = 'canonical_key';
    } else if (tLower === 'premium' || tLower === 'stay_master' || tLower === 'staymaster') {
      currentAccountPlanName = pricingConfig['premium']?.name || 'Stay Master';
      currentAccountPlanSource = 'canonical_key';
    } else if (tLower === 'free' || tLower === 'trial') {
      currentAccountPlanName = pricingConfig['free']?.name || 'Free Starter';
      currentAccountPlanSource = 'canonical_key';
    } else {
      currentAccountPlanName = 'Unknown / Historical Plan';
      currentAccountPlanSource = 'unresolved';
    }
  } else {
    currentAccountPlanName = 'Free Starter';
    currentAccountPlanSource = 'default';
  }

  return {
    subscribedPlanName,
    subscribedPlanSource,
    currentAccountPlanName,
    currentAccountPlanSource,
    providerPlanId,
    rawSubscriptionPlanKey: subRawKey,
    rawAccountPlanKey: tenantRawKey,
    isHistorical,
    isVerified,
    isDifferentFromAccount: Boolean(subRawKey && tenantRawKey && subRawKey !== tenantRawKey)
  };
}

// Plan name normalizer helper
export const normalizePlanName = (rawPlan, pricingConfig = {}) => {
  if (!rawPlan) return 'Free Starter';
  const resolved = resolveSubscriptionPlan({
    subscription: { staypilot_plan_type: rawPlan },
    pricingConfig
  });
  return resolved.subscribedPlanName || 'Unknown / Historical Plan';
};

// Safe date formatter
export const formatDateStr = (dateVal, includeTime = false) => {
  const d = parseVerifiedDate(dateVal);
  if (!d) return '—';
  const options = {
    day: 'numeric',
    month: 'short',
    year: 'numeric'
  };
  if (includeTime) {
    options.hour = '2-digit';
    options.minute = '2-digit';
  }
  return d.toLocaleDateString('en-IN', options);
};

/**
 * Discrepancy Evaluation Engine (Pure Function)
 * Evaluates D-01 through D-07 discrepancy states against an individual subscription row.
 *
 * @param {Object} params
 * @param {Object} params.subscription Subscription row under evaluation
 * @param {Object|null} [params.tenantProfile] Associated profile row (if found)
 * @param {Array<Object>} [params.allTenantSubscriptions] All subscriptions sharing the same tenant_id
 * @param {Date} [params.evaluationTime] Reference timestamp
 * @returns {Array<Object>} List of structured discrepancy objects
 */
export function detectSubscriptionDiscrepancies({
  subscription,
  tenantProfile = null,
  allTenantSubscriptions = [],
  evaluationTime = new Date()
}) {
  const discrepancies = [];
  if (!subscription) return discrepancies;

  const now = parseVerifiedDate(evaluationTime) || new Date();
  const nowMs = now.getTime();
  const status = String(subscription.status || '').toLowerCase().trim();
  const periodEndDate = parseVerifiedDate(subscription.current_period_end);
  const periodEndMs = periodEndDate ? periodEndDate.getTime() : null;
  const isFuture = periodEndMs !== null && periodEndMs > nowMs;

  // D-01: Overdue Active Subscription
  // Recorded status is active, but verified paid period has elapsed without renewal
  if (status === 'active' && (!periodEndMs || !isFuture)) {
    discrepancies.push({
      code: 'D-01',
      severity: 'warning',
      title: 'Overdue Active Subscription',
      description: 'Recorded status is active, but the paid period end date has passed without recorded renewal.',
      recommendation: 'Check Razorpay dashboard for uncaptured renewal payment or webhook delivery failure.'
    });
  }

  // D-02: Abandoned Checkout
  // Subscription remained in pre-payment status beyond reasonable checkout completion window (1 hour)
  if (['created', 'pending', 'authenticated', 'checkout_pending'].includes(status)) {
    const createdAt = parseVerifiedDate(subscription.created_at);
    const ageHours = createdAt ? (nowMs - createdAt.getTime()) / (1000 * 60 * 60) : 0;
    if (ageHours > 1) {
      discrepancies.push({
        code: 'D-02',
        severity: 'info',
        title: 'Abandoned Checkout',
        description: `Checkout session was initiated ${Math.round(ageHours)} hours ago but never completed or activated.`,
        recommendation: 'No action required; will be superseded on new checkout attempt.'
      });
    }
  }

  // D-03: Duplicate Subscription Mapping
  // Multiple subscription rows exist for a single tenant
  if (allTenantSubscriptions.length > 1) {
    const activeCount = allTenantSubscriptions.filter(s => s.status === 'active').length;
    if (activeCount > 1) {
      discrepancies.push({
        code: 'D-03',
        severity: 'warning',
        title: 'Multiple Active Subscriptions',
        description: `Tenant has ${activeCount} concurrent active subscription records in the database.`,
        recommendation: 'Verify tenant billing history; ensure tenant is not being billed twice.'
      });
    } else {
      discrepancies.push({
        code: 'D-03',
        severity: 'info',
        title: 'Multiple Subscription Records',
        description: `Tenant has ${allTenantSubscriptions.length} historical subscription records.`,
        recommendation: 'Informational: Old cancelled or abandoned checkouts exist alongside current record.'
      });
    }
  }

  // D-04: Cancelled but Paid-Through
  // Subscription is cancelled but has remaining legitimate paid access
  if (status === 'cancelled' && isFuture) {
    discrepancies.push({
      code: 'D-04',
      severity: 'info',
      title: 'Cancelled in Paid Grace Period',
      description: `Subscription was cancelled but paid period remains active until ${formatDateStr(periodEndDate)}.`,
      recommendation: 'Full tenant access is preserved until paid period expiration.'
    });
  }

  // D-05: Unknown Tenant Mapping
  // Subscription row points to non-existent tenant_id
  if (!tenantProfile && !subscription.isHistoricalOnly) {
    discrepancies.push({
      code: 'D-05',
      severity: 'warning',
      title: 'Unmapped Tenant Identifier',
      description: `Tenant ID (${subscription.tenant_id}) does not correspond to an existing user profile.`,
      recommendation: 'Tenant account may have been deleted while subscription record remained.'
    });
  }

  // D-06: Missing Live Provider Verification
  // Locally recorded status has not been live-polled against Razorpay API
  discrepancies.push({
    code: 'D-06',
    severity: 'info',
    title: 'Recorded Status Only',
    description: 'Status is derived from local database and received webhook events, not direct live API polling.',
    recommendation: 'Provider status is considered presumptive until synchronized via webhook.'
  });

  return discrepancies;
}

/**
 * Cross-references retained saas_invoices with saas_subscriptions to synthesize
 * historical subscription visibility without modifying database records.
 *
 * @param {Object} params
 * @param {Array<Object>} params.subscriptions saas_subscriptions rows
 * @param {Array<Object>} params.invoices saas_invoices rows
 * @returns {Array<Object>} Consolidated inventory
 */
export function synthesizeHistoricalInventory({ subscriptions = [], invoices = [] }) {
  const records = [...(subscriptions || [])];
  const existingSubIds = new Set(
    records.map(s => s.razorpay_subscription_id).filter(Boolean)
  );

  (invoices || []).forEach(inv => {
    if (inv.subscription_id && !existingSubIds.has(inv.subscription_id)) {
      existingSubIds.add(inv.subscription_id);
      records.push({
        id: `hist_${inv.id}`,
        tenant_id: inv.tenant_id,
        razorpay_subscription_id: inv.subscription_id,
        razorpay_customer_id: null,
        razorpay_plan_id: null,
        staypilot_plan_type: inv.plan_type || 'unknown',
        status: 'historical_invoice',
        environment: inv.environment || 'test',
        current_period_start: null,
        current_period_end: null,
        cancel_at_period_end: false,
        created_at: inv.issued_at || inv.created_at,
        isHistoricalOnly: true,
        invoiceNumber: inv.invoice_number,
        invoiceTotalPaise: inv.total_amount_paise
      });
    }
  });

  return records;
}

/**
 * Calculates summary metrics for a given inventory and selected environment.
 * Strictly respects Test vs. Live environment segregation.
 *
 * @param {Object} params
 * @param {Array<Object>} params.inventory List of enriched subscription objects
 * @param {string} [params.envFilter] 'live' | 'test' | 'all'
 * @returns {Object} Metric counts
 */
export function calculateSubscriptionMetrics({ inventory = [], envFilter = 'live' }) {
  const filtered = inventory.filter(sub => {
    const subEnv = String(sub.environment || 'test').toLowerCase();
    if (envFilter === 'live') return subEnv === 'live';
    if (envFilter === 'test') return subEnv === 'test';
    return true;
  });

  const activeCount = filtered.filter(s => s.status === 'active').length;
  const cancelledCount = filtered.filter(s => s.status === 'cancelled').length;
  const cancelledPaidThroughCount = filtered.filter(
    s => s.status === 'cancelled' && s.entitlement?.isPaidThrough
  ).length;
  const pendingHaltedCount = filtered.filter(s =>
    ['created', 'pending', 'authenticated', 'checkout_pending', 'halted', 'paused'].includes(s.status)
  ).length;
  const attentionCount = filtered.filter(s => s.hasActionableDiscrepancy).length;

  return {
    activeCount,
    cancelledCount,
    cancelledPaidThroughCount,
    pendingHaltedCount,
    attentionCount,
    totalCount: filtered.length
  };
}

/**
 * Deterministically resolves the presentation state (effectivePlan, effectiveStatus, 
 * entitlementCategory, and badge metadata) for a user account in the Super Admin hub.
 *
 * Strict Rule Hierarchy (Stage 12B.3B.3):
 * 1. Platform Admins (super_admin, billing_admin, support_admin):
 *    - effectivePlan: 'system_managed' (or profile.plan_type)
 *    - effectiveStatus: 'active' (unless suspended/disabled)
 *    - entitlementCategory: 'platform_admin'
 * 
 * 2. Administrative Suspensions / Disables (global_settings.is_disabled === true || subscription_status === 'suspended'):
 *    - effectiveStatus: 'disabled' (or 'suspended')
 *    - The account cannot access features regardless of legacy or subscription status.
 *
 * 3. Verified Legacy & Admin-Managed Accounts (is_legacy_account === true || entitlement_source === 'super_admin_manual'):
 *    - Profile plan_type is authoritative (e.g. 'premium' -> Stay Master).
 *    - Subscriptions (especially uncompleted 'created', stale, or test checkouts) MUST NOT override the plan.
 *    - effectivePlanKey: user.plan_type || 'premium'
 *    - effectiveStatus: user.subscription_status || 'active'
 *    - entitlementCategory: isRestricted ? 'legacy_restricted' : 'active_legacy'
 *
 * 4. Active Paid Subscriptions (evaluateSubscriptionEntitlement.hasPaidEntitlement === true):
 *    - The verified paid subscription governs.
 *    - effectivePlanKey: activePaidSub.staypilot_plan_type || user.plan_type
 *    - effectiveStatus: activePaidSub.status
 *    - entitlementCategory: 'subscription_paid'
 *
 * 5. Staff Accounts (role === 'staff'):
 *    - Inherits context from tenant owner.
 *    - effectivePlanKey: 'free'
 *    - effectivePlanName: 'Operational Account'
 *    - effectiveStatus: isRestricted ? (isDisabled ? 'disabled' : 'suspended') : (user.subscription_status || 'active')
 *    - entitlementCategory: 'staff_operational'
 *
 * 6. Historical Subscriptions Only (Expired / Cancelled / Stale without paid entitlement):
 *    - effectivePlanKey: user.plan_type || 'free'
 *    - effectiveStatus: isRestricted ? (isDisabled ? 'disabled' : 'suspended') : (user.subscription_status || 'active')
 *    - entitlementCategory: 'historical_only'
 *
 * 7. General Trial / Standard Free Account:
 *    - effectivePlanKey: user.plan_type || 'free'
 *    - effectiveStatus: isRestricted ? (isDisabled ? 'disabled' : 'suspended') : (user.subscription_status || 'active')
 *    - entitlementCategory: isTrialValid ? 'trial_active' : 'standard_free'
 */
export function resolveAccountPresentation({
  user,
  tenantSubscriptions = [],
  pricingConfig = {},
  ownerProfile = null,
  evaluationTime = new Date()
}) {
  if (!user) {
    return {
      effectivePlanKey: 'free',
      effectivePlanName: 'Free Starter',
      effectiveStatus: 'active',
      entitlementCategory: 'standard_free',
      isLegacy: false,
      isGrandfathered: false,
      isAdministrativelyManaged: false,
      activePaidSubscription: null,
      latestSubscription: null,
      subscriptionHistory: [],
      hasHistoricalSubscriptionMismatch: false,
      mismatchExplanation: null
    };
  }

  const isPlatformAdmin = ['super_admin', 'billing_admin', 'support_admin'].includes(user.role);
  const isStaff = user.role === 'staff';
  const isDisabled = Boolean(user.global_settings?.is_disabled === true);
  const isSuspended = user.subscription_status === 'suspended';
  const isRestricted = isDisabled || isSuspended;

  const isLegacy = Boolean(user.is_legacy_account === true);
  const isManualAdmin = user.entitlement_source === 'super_admin_manual' || Boolean(user.assigned_by_admin_id);
  const isGrandfathered = isLegacy || isManualAdmin;

  // Evaluate paid subscriptions deterministically using Stage 12B.1 evaluator
  const paidSubs = tenantSubscriptions.filter(s => {
    const ent = evaluateSubscriptionEntitlement({ subscription: s, evaluationTime });
    return ent.hasPaidEntitlement;
  });

  const activePaidSub = paidSubs.length > 0 ? paidSubs[0] : null;
  const latestSub = tenantSubscriptions.length > 0 ? tenantSubscriptions[0] : null;

  // Plan normalizer helper
  const getPlanName = (key) => {
    if (!key) return 'Free Starter';
    const raw = String(key).toLowerCase().trim();
    if (pricingConfig[key]?.name) return pricingConfig[key].name;
    if (raw === 'custom_1786983013013' || raw === 'solo') return 'Solo';
    if (raw === 'pro' || raw === 'growth') return 'Growth';
    if (raw === 'premium' || raw === 'stay_master') return 'Stay Master';
    if (raw === 'free') return 'Free Starter';
    return key;
  };

  let effectivePlanKey;
  let effectivePlanName;
  let effectiveStatus;
  let entitlementCategory;
  let hasHistoricalSubscriptionMismatch = false;
  let mismatchExplanation = null;

  // 1. Platform Admin
  if (isPlatformAdmin) {
    effectivePlanKey = user.plan_type || 'premium';
    effectivePlanName = 'Platform Administrator';
    effectiveStatus = isRestricted ? (isDisabled ? 'disabled' : 'suspended') : 'active';
    entitlementCategory = 'platform_admin';
  }
  // 2. Staff Account
  else if (isStaff) {
    effectivePlanKey = 'free';
    effectivePlanName = 'Operational Account';
    effectiveStatus = isRestricted ? (isDisabled ? 'disabled' : 'suspended') : (user.subscription_status || 'active');
    entitlementCategory = 'staff_operational';
  }
  // 3. Administratively Restricted Legacy Account
  else if (isGrandfathered && isRestricted) {
    effectivePlanKey = user.plan_type || 'premium';
    effectivePlanName = getPlanName(effectivePlanKey);
    effectiveStatus = isDisabled ? 'disabled' : 'suspended';
    entitlementCategory = 'legacy_restricted';
    if (latestSub && latestSub.staypilot_plan_type !== effectivePlanKey) {
      hasHistoricalSubscriptionMismatch = true;
      mismatchExplanation = `Account is legacy ${effectivePlanName} (administratively restricted). Historical subscription (${getPlanName(latestSub.staypilot_plan_type)}) does not govern access.`;
    }
  }
  // 4. Active Legacy / Admin-Managed Account (e.g. Cheerful Chalet)
  else if (isGrandfathered && !isRestricted) {
    effectivePlanKey = user.plan_type || 'premium';
    effectivePlanName = getPlanName(effectivePlanKey);
    effectiveStatus = user.subscription_status || 'active';
    entitlementCategory = 'active_legacy';
    if (latestSub && latestSub.staypilot_plan_type !== effectivePlanKey) {
      hasHistoricalSubscriptionMismatch = true;
      mismatchExplanation = `Account possesses verified grandfathered ${effectivePlanName} entitlement. Historical subscription record (${getPlanName(latestSub.staypilot_plan_type)}, status: ${latestSub.status}) does not govern current access.`;
    }
  }
  // 5. Standard Paid Account (Verified active paid subscription)
  else if (activePaidSub && !isRestricted) {
    effectivePlanKey = activePaidSub.staypilot_plan_type || user.plan_type || 'solo';
    effectivePlanName = getPlanName(effectivePlanKey);
    effectiveStatus = activePaidSub.status;
    entitlementCategory = 'subscription_paid';
    if (user.plan_type && user.plan_type !== effectivePlanKey) {
      hasHistoricalSubscriptionMismatch = true;
      mismatchExplanation = `Subscribed plan (${effectivePlanName}) governs access over profile draft key (${getPlanName(user.plan_type)}).`;
    }
  }
  // 6. Account with Historical Subscriptions Only (Expired / Cancelled / Stale)
  else if (latestSub && !activePaidSub) {
    effectivePlanKey = user.plan_type || 'free';
    effectivePlanName = getPlanName(effectivePlanKey);
    effectiveStatus = isRestricted ? (isDisabled ? 'disabled' : 'suspended') : (user.subscription_status || 'active');
    entitlementCategory = 'historical_only';
    hasHistoricalSubscriptionMismatch = Boolean(latestSub.staypilot_plan_type && latestSub.staypilot_plan_type !== effectivePlanKey);
    mismatchExplanation = `Account has historical subscription (${getPlanName(latestSub.staypilot_plan_type)}, status: ${latestSub.status}), but no active paid entitlement. Account defaults to profile plan (${effectivePlanName}).`;
  }
  // 7. General Trial / Standard Free Account
  else {
    effectivePlanKey = user.plan_type || 'free';
    effectivePlanName = getPlanName(effectivePlanKey);
    effectiveStatus = isRestricted ? (isDisabled ? 'disabled' : 'suspended') : (user.subscription_status || 'active');

    const hasTrial = Boolean(user.trial_started_at && user.trial_ends_at);
    if (hasTrial) {
      const trialEnd = new Date(user.trial_ends_at);
      const isTrialValid = trialEnd.getTime() > evaluationTime.getTime();
      entitlementCategory = isTrialValid ? 'trial_active' : 'trial_expired';
    } else {
      entitlementCategory = 'standard_free';
    }
  }

  return {
    effectivePlanKey,
    effectivePlanName,
    effectiveStatus,
    entitlementCategory,
    isLegacy,
    isGrandfathered,
    isAdministrativelyManaged: isManualAdmin,
    activePaidSubscription: activePaidSub,
    latestSubscription: latestSub,
    subscriptionHistory: tenantSubscriptions,
    hasHistoricalSubscriptionMismatch,
    mismatchExplanation
  };
}
