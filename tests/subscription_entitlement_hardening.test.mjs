import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  parseVerifiedDate,
  evaluateSubscriptionEntitlement,
  resolveEffectiveSubscription,
  evaluateAccountEntitlement,
} from '../src/lib/subscriptionEntitlement.js';

import {
  getTrialPresentationState,
} from '../src/lib/trial.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const BASE_NOW = new Date('2026-11-17T12:00:00Z');
const FUTURE_DATE = new Date('2026-12-17T12:00:00Z').toISOString();
const PAST_DATE = new Date('2026-11-10T12:00:00Z').toISOString();

test('Stage 12B.1: Subscription Paid-Through Entitlement Hardening Suite', async (t) => {
  // --------------------------------------------------------------------------
  // Group 1: Date Parsing & Fail-Closed Safety
  // --------------------------------------------------------------------------
  await t.test('1. Date Parsing: Handles valid ISO, timestamps, nulls, and malformed dates safely', () => {
    assert.ok(parseVerifiedDate(FUTURE_DATE) instanceof Date);
    assert.equal(parseVerifiedDate(null), null);
    assert.equal(parseVerifiedDate(undefined), null);
    assert.equal(parseVerifiedDate(''), null);
    assert.equal(parseVerifiedDate('invalid-date-string'), null);
    assert.equal(parseVerifiedDate(NaN), null);
    assert.equal(parseVerifiedDate({}), null);

    // Unix epoch seconds (Razorpay raw payload format)
    const epochSec = 1797422400; // Future date
    const parsedEpoch = parseVerifiedDate(epochSec);
    assert.ok(parsedEpoch instanceof Date);
    assert.equal(parsedEpoch.getTime(), epochSec * 1000);
  });

  // --------------------------------------------------------------------------
  // Group 2: Pure Subscription Entitlement Evaluator Matrix
  // --------------------------------------------------------------------------
  await t.test('2. Matrix S1: Active paid subscription with future date grants access', () => {
    const sub = {
      id: 'sub_active_1',
      status: 'active',
      cancel_at_period_end: false,
      current_period_end: FUTURE_DATE,
    };
    const res = evaluateSubscriptionEntitlement({ subscription: sub, evaluationTime: BASE_NOW });
    assert.equal(res.hasPaidEntitlement, true);
    assert.equal(res.status, 'active');
    assert.equal(res.reason, 'active_paid');
    assert.equal(res.isCancelledPaidThrough, false);
    assert.equal(res.isScheduledCancellation, false);
    assert.ok(res.paidThroughDate instanceof Date);
  });

  await t.test('3. Matrix S2: Active subscription scheduled for end-of-cycle cancellation grants access', () => {
    const sub = {
      id: 'sub_sched_1',
      status: 'active',
      cancel_at_period_end: true,
      current_period_end: FUTURE_DATE,
    };
    const res = evaluateSubscriptionEntitlement({ subscription: sub, evaluationTime: BASE_NOW });
    assert.equal(res.hasPaidEntitlement, true);
    assert.equal(res.status, 'active');
    assert.equal(res.isScheduledCancellation, true);
    assert.equal(res.isCancelledPaidThrough, false);
    assert.equal(res.reason, 'active_scheduled_cancellation');
  });

  await t.test('4. Matrix S3: Cancelled subscription with verified future paid-through date GRANTS ACCESS', () => {
    const sub = {
      id: 'sub_cancelled_paid_1',
      status: 'cancelled',
      cancel_at_period_end: false,
      current_period_end: FUTURE_DATE,
    };
    const res = evaluateSubscriptionEntitlement({ subscription: sub, evaluationTime: BASE_NOW });
    assert.equal(res.hasPaidEntitlement, true, 'Cancelled subscription with future paid-through date must grant access');
    assert.equal(res.status, 'cancelled');
    assert.equal(res.isCancelledPaidThrough, true);
    assert.equal(res.isScheduledCancellation, false);
    assert.equal(res.reason, 'cancelled_paid_through');
  });

  await t.test('5. Matrix S4: Cancelled subscription with expired paid-through date DENIES ACCESS', () => {
    const sub = {
      id: 'sub_cancelled_exp_1',
      status: 'cancelled',
      cancel_at_period_end: false,
      current_period_end: PAST_DATE,
    };
    const res = evaluateSubscriptionEntitlement({ subscription: sub, evaluationTime: BASE_NOW });
    assert.equal(res.hasPaidEntitlement, false);
    assert.equal(res.isCancelledPaidThrough, false);
    assert.equal(res.reason, 'cancelled_period_expired');
  });

  await t.test('6. Matrix S5: Cancelled subscription without verified date DENIES ACCESS (Fail-closed)', () => {
    const subNull = {
      id: 'sub_cancelled_null_1',
      status: 'cancelled',
      current_period_end: null,
    };
    const resNull = evaluateSubscriptionEntitlement({ subscription: subNull, evaluationTime: BASE_NOW });
    assert.equal(resNull.hasPaidEntitlement, false);
    assert.equal(resNull.reason, 'cancelled_missing_period_end');

    const subInvalid = {
      id: 'sub_cancelled_inv_1',
      status: 'cancelled',
      current_period_end: 'corrupted-timestamp',
    };
    const resInvalid = evaluateSubscriptionEntitlement({ subscription: subInvalid, evaluationTime: BASE_NOW });
    assert.equal(resInvalid.hasPaidEntitlement, false);
    assert.equal(resInvalid.reason, 'cancelled_missing_period_end');
  });

  await t.test('7. Matrix S6 & S7: Active subscription with expired or missing period DENIES ACCESS', () => {
    const subExpired = {
      id: 'sub_active_exp',
      status: 'active',
      current_period_end: PAST_DATE,
    };
    const resExp = evaluateSubscriptionEntitlement({ subscription: subExpired, evaluationTime: BASE_NOW });
    assert.equal(resExp.hasPaidEntitlement, false);
    assert.equal(resExp.reason, 'active_period_expired');

    const subNull = {
      id: 'sub_active_null',
      status: 'active',
      current_period_end: null,
    };
    const resNull = evaluateSubscriptionEntitlement({ subscription: subNull, evaluationTime: BASE_NOW });
    assert.equal(resNull.hasPaidEntitlement, false);
    assert.equal(resNull.reason, 'active_missing_period_end');
  });

  await t.test('8. Matrix S10 & S11: Halted, Created, and Pending checkouts DENY ACCESS', () => {
    const subHalted = {
      id: 'sub_halted_1',
      status: 'halted',
      current_period_end: PAST_DATE,
    };
    const resHalted = evaluateSubscriptionEntitlement({ subscription: subHalted, evaluationTime: BASE_NOW });
    assert.equal(resHalted.hasPaidEntitlement, false);

    const subCreated = {
      id: 'sub_created_1',
      status: 'created',
      current_period_end: null,
    };
    const resCreated = evaluateSubscriptionEntitlement({ subscription: subCreated, evaluationTime: BASE_NOW });
    assert.equal(resCreated.hasPaidEntitlement, false);
    assert.equal(resCreated.reason, 'pre_payment_created');

    const subPending = {
      id: 'sub_pending_1',
      status: 'pending',
      current_period_end: null,
    };
    const resPending = evaluateSubscriptionEntitlement({ subscription: subPending, evaluationTime: BASE_NOW });
    assert.equal(resPending.hasPaidEntitlement, false);
    assert.equal(resPending.reason, 'pre_payment_pending');
  });

  // --------------------------------------------------------------------------
  // Group 3: Multiple Subscription Candidate Ranking / Resolution
  // --------------------------------------------------------------------------
  await t.test('9. Candidate Resolution: Ranks valid Active Paid over Cancelled Paid-Through', () => {
    const subs = [
      { id: 'sub_canc', status: 'cancelled', current_period_end: FUTURE_DATE, created_at: '2026-11-01' },
      { id: 'sub_act', status: 'active', current_period_end: FUTURE_DATE, created_at: '2026-11-15' },
    ];
    const resolved = resolveEffectiveSubscription(subs, BASE_NOW);
    assert.equal(resolved?.id, 'sub_act', 'Active paid must take precedence over cancelled paid-through');
  });

  await t.test('10. Candidate Resolution: Ranks Cancelled Paid-Through over Abandoned Created checkout', () => {
    const subs = [
      { id: 'sub_abandoned', status: 'created', current_period_end: null, created_at: '2026-11-17T11:00:00Z' },
      { id: 'sub_canc_paid', status: 'cancelled', current_period_end: FUTURE_DATE, created_at: '2026-11-01T00:00:00Z' },
    ];
    const resolved = resolveEffectiveSubscription(subs, BASE_NOW);
    assert.equal(resolved?.id, 'sub_canc_paid', 'Cancelled paid-through must take precedence over abandoned checkout');
  });

  await t.test('11. Candidate Resolution: Ranks Cancelled Paid-Through over Expired Active or Cancelled', () => {
    const subs = [
      { id: 'sub_old_exp', status: 'active', current_period_end: PAST_DATE, created_at: '2026-10-01' },
      { id: 'sub_canc_paid', status: 'cancelled', current_period_end: FUTURE_DATE, created_at: '2026-11-01' },
    ];
    const resolved = resolveEffectiveSubscription(subs, BASE_NOW);
    assert.equal(resolved?.id, 'sub_canc_paid');
  });

  await t.test('12. Candidate Resolution: Selects furthest future date among multiple cancelled subscriptions', () => {
    const subs = [
      { id: 'sub_canc_near', status: 'cancelled', current_period_end: '2026-11-25T12:00:00Z', created_at: '2026-10-25' },
      { id: 'sub_canc_far', status: 'cancelled', current_period_end: '2026-12-25T12:00:00Z', created_at: '2026-11-10' },
    ];
    const resolved = resolveEffectiveSubscription(subs, BASE_NOW);
    assert.equal(resolved?.id, 'sub_canc_far', 'Candidate with furthest paid period should win tie-break');
  });

  await t.test('13. Candidate Resolution: Handles empty or invalid candidate list gracefully', () => {
    assert.equal(resolveEffectiveSubscription([], BASE_NOW), null);
    assert.equal(resolveEffectiveSubscription(null, BASE_NOW), null);
    assert.equal(resolveEffectiveSubscription(undefined, BASE_NOW), null);
  });

  // --------------------------------------------------------------------------
  // Group 4: Account-Level Entitlement (Super Admin, Legacy, Staff, Trials)
  // --------------------------------------------------------------------------
  await t.test('14. Account Evaluation: Super Admin bypasses trial and subscription restrictions', () => {
    const res = evaluateAccountEntitlement({
      profile: { role: 'super_admin' },
      subscription: null,
      tenantAdminData: null,
      evaluationTime: BASE_NOW,
    });
    assert.equal(res.hasAccess, true);
    assert.equal(res.reason, 'super_admin');
    assert.equal(res.isSuperAdmin, true);
  });

  await t.test('15. Account Evaluation: Grandfathered lifetime account retains access', () => {
    const res = evaluateAccountEntitlement({
      profile: { role: 'tenant_admin', is_legacy_account: true, trial_ends_at: PAST_DATE },
      subscription: null,
      tenantAdminData: null,
      evaluationTime: BASE_NOW,
    });
    assert.equal(res.hasAccess, true);
    assert.equal(res.reason, 'legacy_account');
    assert.equal(res.isLegacyAccount, true);
  });

  await t.test('16. Account Evaluation: Staff account correctly inherits tenant paid entitlement', () => {
    const staffProfile = { role: 'staff', tenant_id: 'tenant_123' };
    const tenantAdminData = {
      id: 'tenant_123',
      role: 'tenant_admin',
      trial_ends_at: PAST_DATE,
    };
    const tenantSubscription = {
      id: 'sub_tenant_paid',
      status: 'cancelled',
      current_period_end: FUTURE_DATE,
    };

    const res = evaluateAccountEntitlement({
      profile: staffProfile,
      subscription: tenantSubscription,
      tenantAdminData,
      evaluationTime: BASE_NOW,
    });
    assert.equal(res.hasAccess, true, 'Staff must inherit valid cancelled-paid-through entitlement');
    assert.equal(res.isStaff, true);
    assert.equal(res.inheritedFromTenant, true);
  });

  await t.test('17. Account Evaluation: Staff account denied when tenant has expired subscription and expired trial', () => {
    const staffProfile = { role: 'staff', tenant_id: 'tenant_123' };
    const tenantAdminData = {
      id: 'tenant_123',
      role: 'tenant_admin',
      trial_ends_at: PAST_DATE,
    };
    const expiredSub = {
      id: 'sub_tenant_exp',
      status: 'cancelled',
      current_period_end: PAST_DATE,
    };

    const res = evaluateAccountEntitlement({
      profile: staffProfile,
      subscription: expiredSub,
      tenantAdminData,
      evaluationTime: BASE_NOW,
    });
    assert.equal(res.hasAccess, false, 'Staff must be denied when tenant has no valid entitlement');
    assert.equal(res.reason, 'trial_expired_no_paid_subscription');
  });

  await t.test('18. Account Evaluation: Valid 30-day trial allows access for tenant with no subscription', () => {
    const res = evaluateAccountEntitlement({
      profile: { role: 'tenant_admin', trial_ends_at: FUTURE_DATE },
      subscription: null,
      tenantAdminData: null,
      evaluationTime: BASE_NOW,
    });
    assert.equal(res.hasAccess, true);
    assert.equal(res.isActiveTrial, true);
    assert.equal(res.reason, 'active_trial');
  });

  // --------------------------------------------------------------------------
  // Group 5: Trial Presentation State Integration (`src/lib/trial.js`)
  // --------------------------------------------------------------------------
  await t.test('19. Presentation State: Cancelled subscription with future paid period returns isPaid=true', () => {
    const profile = { role: 'tenant_admin', trial_ends_at: PAST_DATE, plan_type: 'solo' };
    const sub = {
      id: 'sub_canc_paid',
      status: 'cancelled',
      current_period_end: FUTURE_DATE,
    };

    const presentation = getTrialPresentationState({ profile, activeSubscription: sub });
    assert.equal(presentation.isPaid, true, 'isPaid must be true for cancelled subscription in paid period');
    assert.equal(presentation.isCancelledPaidThrough, true);
    assert.equal(presentation.isScheduledCancellation, false);
    assert.ok(presentation.paidPeriodEndFormatted.length > 0);
  });

  await t.test('20. Presentation State: Scheduled cancellation returns isPaid=true and scheduled flags', () => {
    const profile = { role: 'tenant_admin', trial_ends_at: PAST_DATE, plan_type: 'growth' };
    const sub = {
      id: 'sub_sched_canc',
      status: 'active',
      cancel_at_period_end: true,
      current_period_end: FUTURE_DATE,
    };

    const presentation = getTrialPresentationState({ profile, activeSubscription: sub });
    assert.equal(presentation.isPaid, true);
    assert.equal(presentation.isScheduledCancellation, true);
    assert.equal(presentation.isCancelledPaidThrough, false);
    assert.ok(presentation.paidPeriodEndFormatted.length > 0);
  });

  await t.test('21. Presentation State: Expired cancelled subscription yields isPaid=false and reflects trial expiry', () => {
    const profile = { role: 'tenant_admin', trial_ends_at: PAST_DATE, plan_type: 'solo' };
    const sub = {
      id: 'sub_canc_expired',
      status: 'cancelled',
      current_period_end: PAST_DATE,
    };

    const presentation = getTrialPresentationState({ profile, activeSubscription: sub });
    assert.equal(presentation.isPaid, false);
    assert.equal(presentation.isCancelledPaidThrough, false);
    assert.equal(presentation.isExpired, true);
    assert.equal(presentation.urgencyLevel, 'expired');
  });

  // --------------------------------------------------------------------------
  // Group 6: Source Code Call Site Inspection & Security Boundaries
  // --------------------------------------------------------------------------
  await t.test('22. AppLayout.jsx: Queries candidate statuses and resolves effective subscription', () => {
    const appLayoutPath = path.resolve(rootDir, 'src/layouts/AppLayout.jsx');
    const content = fs.readFileSync(appLayoutPath, 'utf8');

    assert.ok(
      content.includes('resolveEffectiveSubscription'),
      'AppLayout.jsx must import and use resolveEffectiveSubscription'
    );
    assert.ok(
      content.includes(".in('status', ['active', 'cancelled', 'created', 'halted'])"),
      'AppLayout.jsx must query candidate statuses rather than only active'
    );
    assert.ok(
      !content.includes(".eq('status', 'active').limit(1).maybeSingle()"),
      'AppLayout.jsx must no longer discard cancelled subscriptions at DB query level'
    );
  });

  await t.test('23. Subscription.jsx: Resolves candidate subscriptions and renders grace banner', () => {
    const subPagePath = path.resolve(rootDir, 'src/pages/Subscription.jsx');
    const content = fs.readFileSync(subPagePath, 'utf8');

    assert.ok(
      content.includes('resolveEffectiveSubscription'),
      'Subscription.jsx must import and use resolveEffectiveSubscription'
    );
    assert.ok(
      content.includes(".in('status', ['active', 'cancelled', 'created', 'halted'])"),
      'Subscription.jsx must query candidate statuses'
    );
    assert.ok(
      content.includes('trialState.isCancelledPaidThrough'),
      'Subscription.jsx must render banner for cancelled-paid-through state'
    );
    assert.ok(
      content.includes('trialState.isScheduledCancellation'),
      'Subscription.jsx must render banner for scheduled cancellation state'
    );
  });
});
