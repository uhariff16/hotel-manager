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

// Format currency helper (INR)
export const formatINR = (paiseOrRupees, isPaise = false) => {
  const amount = isPaise ? Number(paiseOrRupees || 0) / 100 : Number(paiseOrRupees || 0);
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0
  }).format(amount);
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
