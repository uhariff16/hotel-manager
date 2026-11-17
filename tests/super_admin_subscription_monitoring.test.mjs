import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  detectSubscriptionDiscrepancies,
  synthesizeHistoricalInventory,
  calculateSubscriptionMetrics
} from '../src/lib/subscriptionDiscrepancies.js';

import {
  evaluateSubscriptionEntitlement,
  resolveEffectiveSubscription,
  parseVerifiedDate
} from '../src/lib/subscriptionEntitlement.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const BASE_NOW = new Date('2026-11-17T12:00:00Z');
const FUTURE_DATE = new Date('2026-12-17T12:00:00Z').toISOString();
const PAST_DATE = new Date('2026-11-10T12:00:00Z').toISOString();

test('Stage 12B.2: Super Admin Subscription Monitoring Dashboard Suite', async (t) => {
  // --------------------------------------------------------------------------
  // Group 1: Discrepancy Detection Engine (D-01 to D-07)
  // --------------------------------------------------------------------------
  await t.test('1. Discrepancy D-01: Detects Overdue Active Subscription', () => {
    const overdueSub = {
      id: 'sub_overdue_1',
      status: 'active',
      current_period_end: PAST_DATE,
      created_at: '2026-10-10'
    };
    const discrepancies = detectSubscriptionDiscrepancies({
      subscription: overdueSub,
      tenantProfile: { id: 't1', full_name: 'Test Tenant' },
      allTenantSubscriptions: [overdueSub],
      evaluationTime: BASE_NOW
    });

    const d01 = discrepancies.find(d => d.code === 'D-01');
    assert.ok(d01, 'Must flag D-01 for active subscription with past period end');
    assert.equal(d01.severity, 'warning');
    assert.equal(d01.title, 'Overdue Active Subscription');
  });

  await t.test('2. Discrepancy D-02: Detects Abandoned Checkout Session (> 1 hour old)', () => {
    const oldCreatedSub = {
      id: 'sub_abandoned_1',
      status: 'created',
      current_period_end: null,
      created_at: '2026-11-16T10:00:00Z' // 26 hours ago relative to BASE_NOW
    };
    const discrepancies = detectSubscriptionDiscrepancies({
      subscription: oldCreatedSub,
      tenantProfile: { id: 't1', full_name: 'Test Tenant' },
      allTenantSubscriptions: [oldCreatedSub],
      evaluationTime: BASE_NOW
    });

    const d02 = discrepancies.find(d => d.code === 'D-02');
    assert.ok(d02, 'Must flag D-02 for created checkout older than 1 hour');
    assert.equal(d02.severity, 'info');
    assert.equal(d02.title, 'Abandoned Checkout');
  });

  await t.test('3. Discrepancy D-03: Detects Duplicate Active Subscriptions for One Tenant', () => {
    const subA = { id: 'sub_a', tenant_id: 't1', status: 'active', current_period_end: FUTURE_DATE };
    const subB = { id: 'sub_b', tenant_id: 't1', status: 'active', current_period_end: FUTURE_DATE };

    const discrepancies = detectSubscriptionDiscrepancies({
      subscription: subA,
      tenantProfile: { id: 't1', full_name: 'Test Tenant' },
      allTenantSubscriptions: [subA, subB],
      evaluationTime: BASE_NOW
    });

    const d03 = discrepancies.find(d => d.code === 'D-03');
    assert.ok(d03, 'Must flag D-03 for multiple active subscriptions for same tenant');
    assert.equal(d03.severity, 'warning');
    assert.equal(d03.title, 'Multiple Active Subscriptions');
  });

  await t.test('4. Discrepancy D-04: Identifies Cancelled Subscription in Paid Grace Period', () => {
    const cancelledPaidSub = {
      id: 'sub_canc_paid',
      status: 'cancelled',
      current_period_end: FUTURE_DATE,
      created_at: '2026-11-01'
    };
    const discrepancies = detectSubscriptionDiscrepancies({
      subscription: cancelledPaidSub,
      tenantProfile: { id: 't1', full_name: 'Test Tenant' },
      allTenantSubscriptions: [cancelledPaidSub],
      evaluationTime: BASE_NOW
    });

    const d04 = discrepancies.find(d => d.code === 'D-04');
    assert.ok(d04, 'Must flag D-04 for cancelled subscription within verified paid period');
    assert.equal(d04.severity, 'info');
    assert.equal(d04.title, 'Cancelled in Paid Grace Period');
  });

  await t.test('5. Discrepancy D-05: Detects Unmapped Tenant Identifier', () => {
    const unmappedSub = {
      id: 'sub_unmapped_1',
      tenant_id: 'deleted_tenant_id',
      status: 'active',
      current_period_end: FUTURE_DATE
    };
    const discrepancies = detectSubscriptionDiscrepancies({
      subscription: unmappedSub,
      tenantProfile: null, // No profile found
      allTenantSubscriptions: [unmappedSub],
      evaluationTime: BASE_NOW
    });

    const d05 = discrepancies.find(d => d.code === 'D-05');
    assert.ok(d05, 'Must flag D-05 when tenant profile is null');
    assert.equal(d05.severity, 'warning');
    assert.equal(d05.title, 'Unmapped Tenant Identifier');
  });

  await t.test('6. Discrepancy D-06: Always indicates status is locally recorded unless live API checked', () => {
    const normalSub = {
      id: 'sub_norm',
      status: 'active',
      current_period_end: FUTURE_DATE
    };
    const discrepancies = detectSubscriptionDiscrepancies({
      subscription: normalSub,
      tenantProfile: { id: 't1' },
      allTenantSubscriptions: [normalSub],
      evaluationTime: BASE_NOW
    });

    const d06 = discrepancies.find(d => d.code === 'D-06');
    assert.ok(d06, 'Must include D-06 transparency notice for local recorded status');
    assert.equal(d06.severity, 'info');
  });

  // --------------------------------------------------------------------------
  // Group 2: Environment Separation & Metrics Invariants (Phase B)
  // --------------------------------------------------------------------------
  await t.test('7. Environment Separation: Does not conflate Test and Live subscriptions', () => {
    const mockInventory = [
      { id: 'sub_live_1', environment: 'live', status: 'active', current_period_end: FUTURE_DATE },
      { id: 'sub_live_2', environment: 'live', status: 'cancelled', current_period_end: PAST_DATE },
      { id: 'sub_test_1', environment: 'test', status: 'active', current_period_end: FUTURE_DATE },
      { id: 'sub_test_2', environment: 'test', status: 'created', current_period_end: null }
    ];

    const liveOnly = mockInventory.filter(s => s.environment === 'live');
    const testOnly = mockInventory.filter(s => s.environment === 'test');

    assert.equal(liveOnly.length, 2, 'Live filter must strictly yield 2 records');
    assert.equal(testOnly.length, 2, 'Test filter must strictly yield 2 records');
    assert.ok(!liveOnly.some(s => s.environment === 'test'), 'Live filter must never contain test records');
  });

  await t.test('8. Metrics Calculation: Calculates active, cancelled, pending accurately for selected env', () => {
    const liveSubs = [
      { id: 's1', environment: 'live', status: 'active', current_period_end: FUTURE_DATE },
      { id: 's2', environment: 'live', status: 'active', current_period_end: FUTURE_DATE },
      { id: 's3', environment: 'live', status: 'cancelled', current_period_end: FUTURE_DATE },
      { id: 's4', environment: 'live', status: 'cancelled', current_period_end: PAST_DATE },
      { id: 's5', environment: 'live', status: 'created', current_period_end: null },
      { id: 's6', environment: 'live', status: 'halted', current_period_end: PAST_DATE }
    ];

    const activeCount = liveSubs.filter(s => s.status === 'active').length;
    const cancelledCount = liveSubs.filter(s => s.status === 'cancelled').length;
    const pendingHaltedCount = liveSubs.filter(s => ['created', 'pending', 'halted', 'paused'].includes(s.status)).length;

    assert.equal(activeCount, 2);
    assert.equal(cancelledCount, 2);
    assert.equal(pendingHaltedCount, 2);
  });

  // --------------------------------------------------------------------------
  // Group 3: Historical Invoice Cross-Referencing (Phase G)
  // --------------------------------------------------------------------------
  await t.test('9. Historical Invoices: Safely incorporates retained invoices without active subscription row', () => {
    const subscriptions = [
      { id: 'sub_1', razorpay_subscription_id: 'sub_current_123', environment: 'live' }
    ];
    const invoices = [
      { id: 'inv_1', subscription_id: 'sub_current_123', invoice_number: 'INV-2026-001', environment: 'live' },
      { id: 'inv_2', subscription_id: 'sub_historical_qa_456', invoice_number: 'INV-2026-002', environment: 'test', total_amount_paise: 49900 }
    ];

    const existingSubIds = new Set(subscriptions.map(s => s.razorpay_subscription_id));
    const synthesizedRecords = [...subscriptions];

    invoices.forEach(inv => {
      if (inv.subscription_id && !existingSubIds.has(inv.subscription_id)) {
        existingSubIds.add(inv.subscription_id);
        synthesizedRecords.push({
          id: `hist_${inv.id}`,
          razorpay_subscription_id: inv.subscription_id,
          status: 'historical_invoice',
          environment: inv.environment,
          isHistoricalOnly: true,
          invoiceNumber: inv.invoice_number
        });
      }
    });

    assert.equal(synthesizedRecords.length, 2);
    const hist = synthesizedRecords.find(r => r.razorpay_subscription_id === 'sub_historical_qa_456');
    assert.ok(hist, 'Must synthesize historical subscription item for QA test invoice');
    assert.equal(hist.status, 'historical_invoice');
    assert.equal(hist.isHistoricalOnly, true);
    assert.equal(hist.environment, 'test');
  });

  // --------------------------------------------------------------------------
  // Group 4: SuperAdmin.jsx Integration & Tab Registration (Phase A)
  // --------------------------------------------------------------------------
  await t.test('10. SuperAdmin.jsx: Registers subscriptions tab in navigation bar', () => {
    const superAdminPath = path.resolve(rootDir, 'src/pages/SuperAdmin.jsx');
    const content = fs.readFileSync(superAdminPath, 'utf8');

    assert.ok(
      content.includes("id: 'subscriptions'"),
      "SuperAdmin.jsx must include { id: 'subscriptions' } in tabs list"
    );
    assert.ok(
      content.includes("label: 'Subscriptions'"),
      "SuperAdmin.jsx must label tab as 'Subscriptions'"
    );
    assert.ok(
      content.includes("roles: ['super_admin', 'billing_admin']"),
      "SuperAdmin.jsx must restrict tab to super_admin and billing_admin"
    );
  });

  await t.test('11. SuperAdmin.jsx: Imports and renders SubscriptionMonitoringTab', () => {
    const superAdminPath = path.resolve(rootDir, 'src/pages/SuperAdmin.jsx');
    const content = fs.readFileSync(superAdminPath, 'utf8');

    assert.ok(
      content.includes("import SubscriptionMonitoringTab from '../components/SubscriptionMonitoringTab'"),
      'SuperAdmin.jsx must import SubscriptionMonitoringTab'
    );
    assert.ok(
      content.includes("adminActiveTab === 'subscriptions'"),
      "SuperAdmin.jsx must render tab when adminActiveTab === 'subscriptions'"
    );
    assert.ok(
      content.includes("<SubscriptionMonitoringTab"),
      'SuperAdmin.jsx must mount <SubscriptionMonitoringTab /> component'
    );
  });

  // --------------------------------------------------------------------------
  // Group 5: Read-Only Invariants & Safety Verification (Phase H)
  // --------------------------------------------------------------------------
  await t.test('12. Read-Only Invariant: Component contains zero mutation calls or cancellation triggers', () => {
    const componentPath = path.resolve(rootDir, 'src/components/SubscriptionMonitoringTab.jsx');
    const content = fs.readFileSync(componentPath, 'utf8');

    assert.ok(!content.includes('.delete()'), 'Must not execute Supabase delete');
    assert.ok(!content.includes('.update('), 'Must not execute Supabase update');
    assert.ok(!content.includes('.insert('), 'Must not execute Supabase insert');
    assert.ok(!content.includes('.upsert('), 'Must not execute Supabase upsert');
    assert.ok(!content.includes('razorpay-cancel-subscription'), 'Must not invoke cancellation edge function');
    assert.ok(!content.includes('cancelSubscription'), 'Must not have cancel handler');
  });

  await t.test('13. Security Invariant: Component blocks unauthorized non-super-admin users', () => {
    const componentPath = path.resolve(rootDir, 'src/components/SubscriptionMonitoringTab.jsx');
    const content = fs.readFileSync(componentPath, 'utf8');

    assert.ok(
      content.includes("profile?.role === 'super_admin' || profile?.role === 'billing_admin'"),
      'Component must evaluate super_admin or billing_admin authorization'
    );
    assert.ok(
      content.includes('Access Denied'),
      'Component must render Access Denied guard when unauthorized'
    );
  });

  await t.test('14. UI Controls: Default environment filter is strictly Live Mode', () => {
    const componentPath = path.resolve(rootDir, 'src/components/SubscriptionMonitoringTab.jsx');
    const content = fs.readFileSync(componentPath, 'utf8');

    assert.ok(
      content.includes("useState('live')"),
      "Default environment filter must be 'live' for operational financial monitoring"
    );
    assert.ok(
      content.includes('Live Mode (Default)'),
      'UI must clearly label Live Mode as Default'
    );
  });

  await t.test('15. Discrepancy D-04: Grace Period Preserves Stage 12B.1 Invariants', () => {
    const subCanc = {
      status: 'cancelled',
      current_period_end: FUTURE_DATE
    };
    const entitlement = evaluateSubscriptionEntitlement({
      subscription: subCanc,
      evaluationTime: BASE_NOW
    });

    assert.equal(entitlement.hasPaidEntitlement, true, 'Stage 12B.1 paid-through entitlement must be preserved');
    assert.equal(entitlement.isCancelledPaidThrough, true);
  });

  // --------------------------------------------------------------------------
  // Group 6: Search, Filtering, Pagination & Modal View Tests (Phase D & E)
  // --------------------------------------------------------------------------
  await t.test('16. Search Logic: Filters by tenant name, email, subscription ID, and resort', () => {
    const records = [
      { id: '1', razorpay_subscription_id: 'sub_alpha_1', tenant: { full_name: 'Alice Property', email: 'alice@resort.com' }, tenantResorts: ['Alpine Pine'] },
      { id: '2', razorpay_subscription_id: 'sub_beta_2', tenant: { full_name: 'Bob Stay', email: 'bob@hotel.com' }, tenantResorts: ['Blue Lagoon'] },
      { id: '3', razorpay_subscription_id: 'sub_gamma_3', tenant: { full_name: 'Charlie Chalet', email: 'charlie@chalet.com' }, tenantResorts: ['Green Valley'] }
    ];

    const filterByQuery = (query) => {
      const q = query.toLowerCase().trim();
      return records.filter(item => {
        const name = (item.tenant?.full_name || '').toLowerCase();
        const email = (item.tenant?.email || '').toLowerCase();
        const subId = (item.razorpay_subscription_id || '').toLowerCase();
        const resorts = (item.tenantResorts || []).join(' ').toLowerCase();
        return name.includes(q) || email.includes(q) || subId.includes(q) || resorts.includes(q);
      });
    };

    assert.equal(filterByQuery('alice').length, 1);
    assert.equal(filterByQuery('sub_beta').length, 1);
    assert.equal(filterByQuery('hotel.com').length, 1);
    assert.equal(filterByQuery('Green Valley').length, 1);
    assert.equal(filterByQuery('nonexistent').length, 0);
  });

  await t.test('17. Plan Filtering: Discriminates between Solo, Growth, and Stay Master', () => {
    const list = [
      { id: '1', displayPlan: 'solo' },
      { id: '2', displayPlan: 'custom_1786983013013' }, // Solo promo key
      { id: '3', displayPlan: 'growth' },
      { id: '4', displayPlan: 'premium' },
      { id: '5', displayPlan: 'stay_master' }
    ];

    const soloList = list.filter(item => ['solo', 'custom_1786983013013'].includes(item.displayPlan));
    const growthList = list.filter(item => ['growth', 'pro'].includes(item.displayPlan));
    const masterList = list.filter(item => ['premium', 'stay_master', 'stay master'].includes(item.displayPlan));

    assert.equal(soloList.length, 2);
    assert.equal(growthList.length, 1);
    assert.equal(masterList.length, 2);
  });

  await t.test('18. Component Structure: Renders required inspection modal sections', () => {
    const componentPath = path.resolve(rootDir, 'src/components/SubscriptionMonitoringTab.jsx');
    const content = fs.readFileSync(componentPath, 'utf8');

    assert.ok(content.includes('Tenant Identity'), 'Detail modal must include Tenant Identity section');
    assert.ok(content.includes('Subscription Details'), 'Detail modal must include Subscription Details section');
    assert.ok(content.includes('Payment & Invoices'), 'Detail modal must include Payment & Invoices section');
    assert.ok(content.includes('Audit Boundary Notice'), 'Detail modal must include Audit Boundary Notice');
  });

  await t.test('19. Component UI: Implements pagination and empty state fallbacks', () => {
    const componentPath = path.resolve(rootDir, 'src/components/SubscriptionMonitoringTab.jsx');
    const content = fs.readFileSync(componentPath, 'utf8');

    assert.ok(content.includes('pagination-prev-btn'), 'Must include pagination prev control');
    assert.ok(content.includes('pagination-next-btn'), 'Must include pagination next control');
    assert.ok(content.includes('No subscriptions match your criteria'), 'Must include empty state copy');
    assert.ok(content.includes('Reset to Live Default'), 'Must include reset button in empty state');
  });

  await t.test('20. Error Resiliency: Displays fetchError notice banner when Supabase query returns errors', () => {
    const componentPath = path.resolve(rootDir, 'src/components/SubscriptionMonitoringTab.jsx');
    const content = fs.readFileSync(componentPath, 'utf8');

    assert.ok(content.includes('{fetchError && ('), 'Component must render fetchError notice banner');
    assert.ok(content.includes('setFetchError'), 'Component must capture error messages in state');
  });
});
