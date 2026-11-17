/**
 * STAYPILOT — Subscription Paid-Through Entitlement Evaluator
 * File: src/lib/subscriptionEntitlement.js
 *
 * Deterministic, pure entitlement evaluation engine for StayPilot SaaS subscriptions.
 * Zero network calls, zero database mutations, zero side effects.
 *
 * Enforces strict fail-closed boundary rules:
 * - Active subscriptions within verified paid period -> Granted access
 * - Scheduled-cancellation subscriptions within paid period -> Granted access
 * - Cancelled subscriptions within verified future paid-through date -> Granted access
 * - Cancelled or active subscriptions with expired period -> Denied paid access
 * - Missing or invalid billing dates -> Fail closed (Denied)
 * - Pre-payment statuses ('created', 'pending', 'authenticated') -> Denied paid access
 * - 'halted' and 'completed' statuses -> Denied paid access
 * - Resolves multiple subscription candidates deterministically (prioritizes active paid over cancelled/abandoned)
 */

/**
 * Safely parses and validates a date value.
 * Returns null for missing, non-string/non-date, or invalid timestamps (e.g. NaN).
 *
 * @param {string|number|Date|null|undefined} dateVal
 * @returns {Date|null} Valid Date instance or null
 */
export function parseVerifiedDate(dateVal) {
  if (dateVal === null || dateVal === undefined || dateVal === '') {
    return null;
  }
  if (typeof dateVal === 'number') {
    if (isNaN(dateVal) || dateVal <= 0) return null;
    // Unix epoch seconds (e.g. Razorpay timestamps < 1e11) vs milliseconds
    const ms = dateVal < 1e11 ? dateVal * 1000 : dateVal;
    const d = new Date(ms);
    return isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(dateVal);
  const time = d.getTime();
  if (isNaN(time)) {
    return null;
  }
  return d;
}

/**
 * Evaluates the paid-through entitlement of a single subscription row.
 *
 * @param {Object} params
 * @param {Object|null|undefined} params.subscription A saas_subscriptions database row
 * @param {Date} [params.evaluationTime] Reference timestamp (defaults to current time)
 * @returns {Object} Structured entitlement result
 */
export function evaluateSubscriptionEntitlement({ subscription, evaluationTime = new Date() }) {
  const evalDate = parseVerifiedDate(evaluationTime) || new Date();
  const nowMs = evalDate.getTime();

  if (!subscription || typeof subscription !== 'object') {
    return {
      hasPaidEntitlement: false,
      isPaidThrough: false,
      isExpired: false,
      isScheduledCancellation: false,
      isCancelledPaidThrough: false,
      status: 'none',
      periodEnd: null,
      paidThroughDate: null,
      periodEndMs: null,
      daysRemaining: 0,
      reason: 'no_subscription'
    };
  }

  const status = String(subscription.status || '').toLowerCase().trim();
  const cancelAtPeriodEnd = subscription.cancel_at_period_end === true;
  const periodEndDate = parseVerifiedDate(subscription.current_period_end);
  const periodEndMs = periodEndDate ? periodEndDate.getTime() : null;

  // Calculate days remaining safely
  let daysRemaining = 0;
  const isFuture = periodEndMs !== null && periodEndMs > nowMs;
  if (isFuture) {
    const diffMs = periodEndMs - nowMs;
    daysRemaining = Math.max(1, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
  }

  // 1. Pre-payment statuses never grant paid entitlement
  if (['created', 'pending', 'authenticated'].includes(status)) {
    return {
      hasPaidEntitlement: false,
      isPaidThrough: false,
      isExpired: false,
      isScheduledCancellation: false,
      isCancelledPaidThrough: false,
      status,
      periodEnd: periodEndDate,
      paidThroughDate: periodEndDate,
      periodEndMs,
      daysRemaining: 0,
      reason: `pre_payment_${status}`
    };
  }

  // 2. Terminal non-paid statuses
  if (['halted', 'completed'].includes(status)) {
    return {
      hasPaidEntitlement: false,
      isPaidThrough: false,
      isExpired: true,
      isScheduledCancellation: false,
      isCancelledPaidThrough: false,
      status,
      periodEnd: periodEndDate,
      paidThroughDate: periodEndDate,
      periodEndMs,
      daysRemaining: 0,
      reason: `terminal_${status}`
    };
  }

  // 3. Active Subscription handling
  if (status === 'active') {
    // Missing or invalid period end fails closed
    if (periodEndMs === null) {
      return {
        hasPaidEntitlement: false,
        isPaidThrough: false,
        isExpired: false,
        isScheduledCancellation: cancelAtPeriodEnd,
        isCancelledPaidThrough: false,
        status,
        periodEnd: null,
        paidThroughDate: null,
        periodEndMs: null,
        daysRemaining: 0,
        reason: 'active_missing_period_end'
      };
    }

    // Active subscription whose paid period has elapsed (overdue/unrenewed)
    if (!isFuture) {
      return {
        hasPaidEntitlement: false,
        isPaidThrough: false,
        isExpired: true,
        isScheduledCancellation: cancelAtPeriodEnd,
        isCancelledPaidThrough: false,
        status,
        periodEnd: periodEndDate,
        paidThroughDate: periodEndDate,
        periodEndMs,
        daysRemaining: 0,
        reason: 'active_period_expired'
      };
    }

    // Active and legitimately within paid period
    return {
      hasPaidEntitlement: true,
      isPaidThrough: true,
      isExpired: false,
      isScheduledCancellation: cancelAtPeriodEnd,
      isCancelledPaidThrough: false,
      status,
      periodEnd: periodEndDate,
      paidThroughDate: periodEndDate,
      periodEndMs,
      daysRemaining,
      reason: cancelAtPeriodEnd ? 'active_scheduled_cancellation' : 'active_paid'
    };
  }

  // 4. Cancelled Subscription handling
  if (status === 'cancelled') {
    // Missing or invalid period end fails closed
    if (periodEndMs === null) {
      return {
        hasPaidEntitlement: false,
        isPaidThrough: false,
        isExpired: false,
        isScheduledCancellation: false,
        isCancelledPaidThrough: false,
        status,
        periodEnd: null,
        paidThroughDate: null,
        periodEndMs: null,
        daysRemaining: 0,
        reason: 'cancelled_missing_period_end'
      };
    }

    // Cancelled and period has passed
    if (!isFuture) {
      return {
        hasPaidEntitlement: false,
        isPaidThrough: false,
        isExpired: true,
        isScheduledCancellation: false,
        isCancelledPaidThrough: false,
        status,
        periodEnd: periodEndDate,
        paidThroughDate: periodEndDate,
        periodEndMs,
        daysRemaining: 0,
        reason: 'cancelled_period_expired'
      };
    }

    // Cancelled but within verified paid-through period (CRITICAL HARDENING FIX)
    return {
      hasPaidEntitlement: true,
      isPaidThrough: true,
      isExpired: false,
      isScheduledCancellation: false,
      isCancelledPaidThrough: true,
      status,
      periodEnd: periodEndDate,
      paidThroughDate: periodEndDate,
      periodEndMs,
      daysRemaining,
      reason: 'cancelled_paid_through'
    };
  }

  // 5. Catch-all fail-closed for any unrecognized status
  return {
    hasPaidEntitlement: false,
    isPaidThrough: false,
    isExpired: false,
    isScheduledCancellation: false,
    isCancelledPaidThrough: false,
    status: status || 'unknown',
    periodEnd: periodEndDate,
    paidThroughDate: periodEndDate,
    periodEndMs,
    daysRemaining: 0,
    reason: `unrecognized_status_${status || 'unknown'}`
  };
}

/**
 * Deterministically ranks and selects the effective subscription from an array of
 * candidates belonging to a single tenant.
 *
 * Selection rules:
 * 1. Subscriptions with valid paid entitlement (hasPaidEntitlement === true) ALWAYS
 *    take precedence over non-entitled subscriptions.
 * 2. Among paid candidates:
 *    - Prefer status 'active' without cancellation schedule
 *    - Then prefer status 'active' with cancellation schedule
 *    - Then prefer status 'cancelled' with future paid-through date
 *    - Tie-break: Later periodEndMs, then newer createdAtMs
 * 3. Among non-paid candidates:
 *    - Prefer recently expired 'active' over 'cancelled' over 'halted' over 'created'
 *    - Tie-break: Newer createdAtMs
 *
 * @param {Array<Object>} subscriptions List of saas_subscriptions rows
 * @param {Date} [evaluationTime] Reference timestamp
 * @returns {Object|null} The single effective subscription row, or null
 */
export function resolveEffectiveSubscription(subscriptions, evaluationTime = new Date()) {
  if (!Array.isArray(subscriptions) || subscriptions.length === 0) {
    return null;
  }

  // Filter out non-objects
  const validSubs = subscriptions.filter(s => s && typeof s === 'object');
  if (validSubs.length === 0) return null;
  if (validSubs.length === 1) return validSubs[0];

  const evalDate = parseVerifiedDate(evaluationTime) || new Date();

  // Evaluate each candidate
  const evaluated = validSubs.map((sub, index) => {
    const entitlement = evaluateSubscriptionEntitlement({ subscription: sub, evaluationTime: evalDate });
    const createdAt = parseVerifiedDate(sub.created_at);
    const createdAtMs = createdAt ? createdAt.getTime() : 0;

    let subTier = 0;
    if (entitlement.hasPaidEntitlement) {
      if (entitlement.status === 'active' && !entitlement.isScheduledCancellation) {
        subTier = 100; // Tier 1: Pure active paid
      } else if (entitlement.status === 'active' && entitlement.isScheduledCancellation) {
        subTier = 90;  // Tier 2: Active scheduled for cancellation
      } else if (entitlement.isCancelledPaidThrough) {
        subTier = 80;  // Tier 3: Cancelled with paid-through access
      }
    } else {
      if (entitlement.status === 'active') {
        subTier = 40;  // Overdue active
      } else if (entitlement.status === 'cancelled') {
        subTier = 30;  // Expired cancelled
      } else if (entitlement.status === 'halted') {
        subTier = 20;  // Halted
      } else if (['created', 'pending', 'authenticated'].includes(entitlement.status)) {
        subTier = 10;  // Abandoned / pending checkout
      } else {
        subTier = 5;
      }
    }

    return {
      sub,
      index,
      tier: subTier,
      hasPaidEntitlement: entitlement.hasPaidEntitlement,
      periodEndMs: entitlement.periodEndMs || 0,
      createdAtMs
    };
  });

  // Sort descending by:
  // 1. Tier (higher is better)
  // 2. periodEndMs (later is better)
  // 3. createdAtMs (newer is better)
  // 4. Stable original array index
  evaluated.sort((a, b) => {
    if (b.tier !== a.tier) return b.tier - a.tier;
    if (b.periodEndMs !== a.periodEndMs) return b.periodEndMs - a.periodEndMs;
    if (b.createdAtMs !== a.createdAtMs) return b.createdAtMs - a.createdAtMs;
    return a.index - b.index;
  });

  return evaluated[0].sub;
}

/**
 * Comprehensive account-level entitlement evaluator reconciling Profile, Role,
 * Trial, Legacy, and Subscription state into a unified access decision.
 *
 * @param {Object} params
 * @param {Object} params.profile User profile
 * @param {Object|null} [params.subscription] Single subscription row OR array of rows
 * @param {Object|null} [params.tenantAdminData] Owning tenant profile (for staff)
 * @param {Date} [params.evaluationTime] Reference timestamp
 * @returns {Object} Complete access evaluation
 */
export function evaluateAccountEntitlement({
  profile,
  subscription = null,
  tenantAdminData = null,
  evaluationTime = new Date()
}) {
  const evalDate = parseVerifiedDate(evaluationTime) || new Date();
  const nowMs = evalDate.getTime();

  if (!profile || typeof profile !== 'object') {
    return {
      canAccess: false,
      isSuper: false,
      isLegacy: false,
      isStaff: false,
      isSuspended: false,
      isPaid: false,
      isActiveTrial: false,
      isTrialExpired: true,
      planKey: 'unknown',
      effectiveSubscription: null,
      reason: 'no_profile'
    };
  }

  const role = String(profile.role || 'tenant_admin').trim();
  const isSuper = role === 'super_admin';
  const isStaff = role === 'staff';

  // Staff accounts inherit entitlement context from owning Tenant Admin
  const effectiveProfile = isStaff ? (tenantAdminData || profile) : profile;

  // 1. Super Admin invariant: Always authorized
  if (isSuper) {
    return {
      canAccess: true,
      hasAccess: true,
      isSuper: true,
      isSuperAdmin: true,
      isLegacy: false,
      isLegacyAccount: false,
      isStaff: false,
      isSuspended: false,
      isPaid: false,
      isActiveTrial: false,
      isTrialExpired: false,
      planKey: profile.plan_type || 'premium',
      effectiveSubscription: null,
      reason: 'super_admin'
    };
  }

  // 2. Suspended account: Immediate block
  const isSuspended = profile.subscription_status === 'suspended' ||
                      effectiveProfile.subscription_status === 'suspended';
  if (isSuspended) {
    return {
      canAccess: false,
      hasAccess: false,
      isSuper: false,
      isSuperAdmin: false,
      isLegacy: false,
      isLegacyAccount: false,
      isStaff,
      isSuspended: true,
      isPaid: false,
      isActiveTrial: false,
      isTrialExpired: true,
      planKey: effectiveProfile.plan_type || 'free',
      effectiveSubscription: null,
      reason: 'account_suspended'
    };
  }

  // 3. Grandfathered Legacy Account invariant: Permanent Stay Master access
  const isLegacy = effectiveProfile.is_legacy_account === true || profile.is_legacy_account === true;
  if (isLegacy) {
    return {
      canAccess: true,
      hasAccess: true,
      isSuper: false,
      isSuperAdmin: false,
      isLegacy: true,
      isLegacyAccount: true,
      isStaff,
      isSuspended: false,
      isPaid: false,
      isActiveTrial: false,
      isTrialExpired: false,
      planKey: effectiveProfile.plan_type || 'premium',
      effectiveSubscription: null,
      reason: 'legacy_account'
    };
  }

  // 4. Resolve Effective Subscription from parameter (supports array or single row)
  let effectiveSub = null;
  if (Array.isArray(subscription)) {
    effectiveSub = resolveEffectiveSubscription(subscription, evalDate);
  } else if (subscription && typeof subscription === 'object') {
    effectiveSub = subscription;
  }

  // 5. Evaluate Paid Entitlement
  const subEntitlement = evaluateSubscriptionEntitlement({
    subscription: effectiveSub,
    evaluationTime: evalDate
  });
  const isPaid = subEntitlement.hasPaidEntitlement;

  // 6. Trial evaluation
  const trialEndsAtDate = parseVerifiedDate(effectiveProfile.trial_ends_at);
  const trialEndsAtMs = trialEndsAtDate ? trialEndsAtDate.getTime() : 0;
  const isServerTrialExpired = profile.is_trial_expired_server === true;
  const isTimestampExpired = !trialEndsAtDate || trialEndsAtMs <= nowMs;
  const isTrialExpired = isServerTrialExpired || isTimestampExpired;

  const hasTrialDates = Boolean(trialEndsAtDate);
  const planKey = isPaid && effectiveSub?.staypilot_plan_type
    ? effectiveSub.staypilot_plan_type
    : (effectiveProfile.plan_type || (hasTrialDates ? 'solo' : 'free'));
  const isFreePlan = planKey === 'free' && !hasTrialDates;

  const isActiveTrial = !isFreePlan && !isPaid && !isTrialExpired && hasTrialDates;

  // 7. Overall access decision
  const canAccess = isPaid || isActiveTrial;

  let reason = 'unknown';
  if (isPaid) {
    reason = `paid_subscription_${subEntitlement.reason}`;
  } else if (isActiveTrial) {
    reason = 'active_trial';
  } else if (isTrialExpired) {
    reason = 'trial_expired_no_paid_subscription';
  } else if (isFreePlan) {
    reason = 'free_plan_no_entitlement';
  }

  return {
    canAccess,
    hasAccess: canAccess,
    isSuper: false,
    isSuperAdmin: false,
    isLegacy: false,
    isLegacyAccount: false,
    isStaff,
    inheritedFromTenant: isStaff,
    isSuspended: false,
    isPaid,
    isActiveTrial,
    isTrialExpired,
    planKey,
    effectiveSubscription: effectiveSub,
    subEntitlement,
    daysRemaining: isPaid ? subEntitlement.daysRemaining : (isActiveTrial ? Math.max(1, Math.ceil((trialEndsAtMs - nowMs) / (1000 * 60 * 60 * 24))) : 0),
    reason
  };
}
