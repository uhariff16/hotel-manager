import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveAccountPresentation,
  calculateSubscriptionMetrics
} from '../src/lib/subscriptionDiscrepancies.js';

describe('Stage 12B.3B.3: Legacy Account Discovery & Entitlement Verification Suite', () => {

  const PRICING_CONFIG = {
    free: { name: 'Free Starter' },
    custom_1786983013013: { name: 'Solo' },
    pro: { name: 'Growth' },
    premium: { name: 'Stay Master' }
  };

  test('Fixture 1: Cheerful Chalet — Stay Master, active legacy with accidental Solo TEST checkout', () => {
    const user = {
      id: '3797dba7-a7fd-4ca6-86cb-b45519953947',
      full_name: 'Cheerful Chalet',
      role: 'tenant_admin',
      plan_type: 'premium',
      subscription_status: 'active',
      is_legacy_account: true,
      entitlement_source: 'super_admin_manual',
      assignment_reason: 'Restore grandfathered Stay Master entitlement after accidental TEST checkout.',
      global_settings: {}
    };

    const subscriptions = [
      {
        id: 'sub-created-1',
        tenant_id: user.id,
        staypilot_plan_type: 'custom_1786983013013',
        status: 'created',
        environment: 'test',
        current_period_end: null
      },
      {
        id: 'sub-cancelled-1',
        tenant_id: user.id,
        staypilot_plan_type: 'custom_1786983013013',
        status: 'cancelled',
        environment: 'test',
        current_period_end: null
      }
    ];

    const presentation = resolveAccountPresentation({
      user,
      tenantSubscriptions: subscriptions,
      pricingConfig: PRICING_CONFIG
    });

    assert.equal(presentation.effectivePlanKey, 'premium', 'Must resolve to premium plan key');
    assert.equal(presentation.effectivePlanName, 'Stay Master', 'Must resolve to Stay Master display name');
    assert.equal(presentation.effectiveStatus, 'active', 'Must maintain active status despite stale created sub');
    assert.equal(presentation.entitlementCategory, 'active_legacy', 'Must be categorized as active_legacy');
    assert.equal(presentation.isGrandfathered, true, 'Must flag as grandfathered');
    assert.equal(presentation.hasHistoricalSubscriptionMismatch, true, 'Must flag historical sub mismatch');
    assert.match(presentation.mismatchExplanation, /grandfathered Stay Master/, 'Must provide explicit mismatch note');
  });

  test('Fixture 2: Active legacy account with zero subscriptions', () => {
    const user = {
      id: 'leg-002',
      full_name: 'Grandfathered Estate',
      role: 'tenant_admin',
      plan_type: 'premium',
      subscription_status: 'active',
      is_legacy_account: true,
      entitlement_source: 'standard'
    };

    const presentation = resolveAccountPresentation({
      user,
      tenantSubscriptions: [],
      pricingConfig: PRICING_CONFIG
    });

    assert.equal(presentation.effectivePlanName, 'Stay Master');
    assert.equal(presentation.effectiveStatus, 'active');
    assert.equal(presentation.entitlementCategory, 'active_legacy');
    assert.equal(presentation.hasHistoricalSubscriptionMismatch, false);
  });

  test('Fixture 3: Legacy account with historical cancelled subscription', () => {
    const user = {
      id: 'leg-003',
      full_name: 'Historic Resort',
      role: 'tenant_admin',
      plan_type: 'pro',
      subscription_status: 'active',
      is_legacy_account: true,
      entitlement_source: 'standard'
    };

    const subscriptions = [
      {
        id: 'sub-canc-old',
        tenant_id: user.id,
        staypilot_plan_type: 'custom_1786983013013',
        status: 'cancelled',
        environment: 'test',
        current_period_end: '2026-08-01T00:00:00Z'
      }
    ];

    const presentation = resolveAccountPresentation({
      user,
      tenantSubscriptions: subscriptions,
      pricingConfig: PRICING_CONFIG
    });

    assert.equal(presentation.effectivePlanName, 'Growth', 'Legacy Pro plan must not be downgraded to cancelled Solo');
    assert.equal(presentation.effectiveStatus, 'active', 'Must remain active');
    assert.equal(presentation.entitlementCategory, 'active_legacy');
    assert.equal(presentation.hasHistoricalSubscriptionMismatch, true);
  });

  test('Fixture 4: Legacy account with historical LIVE subscription', () => {
    const user = {
      id: 'leg-004',
      full_name: 'Legacy Live Pioneer',
      role: 'tenant_admin',
      plan_type: 'premium',
      subscription_status: 'active',
      is_legacy_account: true,
      entitlement_source: 'super_admin_manual'
    };

    const subscriptions = [
      {
        id: 'sub-live-old',
        tenant_id: user.id,
        staypilot_plan_type: 'custom_1786983013013',
        status: 'cancelled',
        environment: 'live',
        current_period_end: '2026-09-01T00:00:00Z'
      }
    ];

    const presentation = resolveAccountPresentation({
      user,
      tenantSubscriptions: subscriptions,
      pricingConfig: PRICING_CONFIG
    });

    assert.equal(presentation.effectivePlanName, 'Stay Master', 'Must preserve Stay Master assignment');
    assert.equal(presentation.effectiveStatus, 'active');
    assert.equal(presentation.entitlementCategory, 'active_legacy');
  });

  test('Fixture 5: Legacy account with administrative suspension / disable (e.g. GNANASEKARAN T)', () => {
    const user = {
      id: 'f1303db2-cf8d-4695-8c3d-3c7db8cb7f41',
      full_name: 'GNANASEKARAN T',
      role: 'tenant_admin',
      plan_type: 'pro',
      subscription_status: 'active',
      is_legacy_account: true,
      entitlement_source: 'standard',
      global_settings: { is_disabled: true }
    };

    const presentation = resolveAccountPresentation({
      user,
      tenantSubscriptions: [],
      pricingConfig: PRICING_CONFIG
    });

    assert.equal(presentation.effectivePlanName, 'Growth');
    assert.equal(presentation.effectiveStatus, 'disabled', 'is_disabled must override active status');
    assert.equal(presentation.entitlementCategory, 'legacy_restricted', 'Must categorize as legacy_restricted');
  });

  test('Fixture 6: Legacy account with missing plan metadata', () => {
    const user = {
      id: 'leg-006',
      full_name: 'Legacy Missing Plan',
      role: 'tenant_admin',
      plan_type: null,
      subscription_status: 'active',
      is_legacy_account: true
    };

    const presentation = resolveAccountPresentation({
      user,
      tenantSubscriptions: [],
      pricingConfig: PRICING_CONFIG
    });

    assert.equal(presentation.effectivePlanName, 'Stay Master', 'Must default to Stay Master for legacy without plan');
    assert.equal(presentation.effectiveStatus, 'active');
    assert.equal(presentation.entitlementCategory, 'active_legacy');
  });

  test('Fixture 7: Standard paid tenant (e.g. Stay master test)', () => {
    const futureDate = new Date(Date.now() + 10 * 24 * 3600 * 1000).toISOString();
    const user = {
      id: '1707818e-79ff-4a0c-9f99-7d991cc27842',
      full_name: 'Stay master test',
      role: 'tenant_admin',
      plan_type: 'custom_1786983013013',
      subscription_status: 'active',
      is_legacy_account: false
    };

    const subscriptions = [
      {
        id: 'sub-active-live',
        tenant_id: user.id,
        staypilot_plan_type: 'custom_1786983013013',
        status: 'active',
        environment: 'live',
        current_period_end: futureDate
      }
    ];

    const presentation = resolveAccountPresentation({
      user,
      tenantSubscriptions: subscriptions,
      pricingConfig: PRICING_CONFIG
    });

    assert.equal(presentation.effectivePlanName, 'Solo');
    assert.equal(presentation.effectiveStatus, 'active');
    assert.equal(presentation.entitlementCategory, 'subscription_paid');
    assert.equal(presentation.hasHistoricalSubscriptionMismatch, false);
  });

  test('Fixture 8: Trial tenant — Active vs Expired', () => {
    const futureDate = new Date(Date.now() + 5 * 24 * 3600 * 1000).toISOString();
    const pastDate = new Date(Date.now() - 5 * 24 * 3600 * 1000).toISOString();

    const activeTrialUser = {
      id: 'trial-active',
      role: 'tenant_admin',
      plan_type: 'pro',
      subscription_status: 'active',
      is_legacy_account: false,
      trial_started_at: '2026-11-01T00:00:00Z',
      trial_ends_at: futureDate
    };

    const expiredTrialUser = {
      id: 'trial-expired',
      role: 'tenant_admin',
      plan_type: 'pro',
      subscription_status: 'active',
      is_legacy_account: false,
      trial_started_at: '2026-10-01T00:00:00Z',
      trial_ends_at: pastDate
    };

    const presActive = resolveAccountPresentation({
      user: activeTrialUser,
      pricingConfig: PRICING_CONFIG
    });
    assert.equal(presActive.entitlementCategory, 'trial_active');
    assert.equal(presActive.effectivePlanName, 'Growth');

    const presExpired = resolveAccountPresentation({
      user: expiredTrialUser,
      pricingConfig: PRICING_CONFIG
    });
    assert.equal(presExpired.entitlementCategory, 'trial_expired');
    assert.equal(presExpired.effectivePlanName, 'Growth');
  });

  test('Fixture 9: Staff account inheriting legacy tenant', () => {
    const owner = {
      id: '3797dba7-a7fd-4ca6-86cb-b45519953947',
      full_name: 'Cheerful Chalet',
      role: 'tenant_admin',
      plan_type: 'premium',
      is_legacy_account: true
    };

    const staffUser = {
      id: 'staff-cc-1',
      full_name: 'ccstaff1',
      role: 'staff',
      tenant_id: owner.id,
      plan_type: 'free',
      subscription_status: 'active'
    };

    const presentation = resolveAccountPresentation({
      user: staffUser,
      pricingConfig: PRICING_CONFIG,
      ownerProfile: owner
    });

    assert.equal(presentation.effectivePlanName, 'Operational Account');
    assert.equal(presentation.effectiveStatus, 'active');
    assert.equal(presentation.entitlementCategory, 'staff_operational');
  });

  test('Metric Isolation: Legacy accounts are NOT counted as active paid subscriptions', () => {
    const inventory = [
      {
        id: 'sub-live-1',
        environment: 'live',
        status: 'active',
        hasActionableDiscrepancy: false,
        entitlement: { hasPaidEntitlement: true, isPaidThrough: true }
      },
      {
        id: 'sub-test-created',
        environment: 'test',
        status: 'created',
        hasActionableDiscrepancy: false,
        entitlement: { hasPaidEntitlement: false, isPaidThrough: false }
      }
    ];

    const liveMetrics = calculateSubscriptionMetrics({ inventory, envFilter: 'live' });
    assert.equal(liveMetrics.activeCount, 1, 'Only genuine active subscriptions counted');
    assert.equal(liveMetrics.totalCount, 1);

    const testMetrics = calculateSubscriptionMetrics({ inventory, envFilter: 'test' });
    assert.equal(testMetrics.activeCount, 0, 'Created test checkout not counted as active');
    assert.equal(testMetrics.pendingHaltedCount, 1, 'Correctly counted in pending/halted');
  });
});
