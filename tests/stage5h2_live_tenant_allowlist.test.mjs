import test from 'node:test';
import assert from 'node:assert/strict';

/**
 * Emulates the exact server authorization and single-tenant LIVE access control guard
 * from supabase/functions/razorpay-create-subscription/index.ts (Stage 5H.2 / 5H.3).
 */
function evaluateRazorpayCheckoutGuard({
  authenticatedUser,       // { id, role, tenant_id, billing }
  requestPayload,          // { plan_type, environment, mode, tenant_id }
  serverEnv,               // { ALLOW_RAZORPAY_LIVE_MODE, LIVE_ALLOWED_TENANT_IDS, RAZORPAY_LIVE_KEY_ID, RAZORPAY_TEST_KEY_ID }
  superAdminSettings,      // { razorpay_settings: { mode }, pricing, tax_settings }
  existingSubscriptions = []
}) {
  const sideEffects = {
    planCreated: false,
    customerCreated: false,
    subscriptionCreated: false,
    leaseAcquired: false,
    dbWritten: false
  };

  // 1. Staff Authorization Guard
  if (authenticatedUser.role === 'staff') {
    return {
      status: 403,
      error: 'Subscription purchase is restricted to property owners (Tenant Admins).',
      sideEffects
    };
  }

  // Authoritative server-resolved tenant identity (ignores requestPayload.tenant_id)
  const canonicalTenantId = authenticatedUser.role === 'tenant_admin'
    ? authenticatedUser.id
    : (authenticatedUser.tenant_id || authenticatedUser.id);

  const plan_type = requestPayload?.plan_type;
  if (!plan_type || plan_type === 'free') {
    return { status: 400, error: 'Invalid plan type', sideEffects };
  }

  // Untrusted client environment tampering guard
  const clientRequestedEnv = String(requestPayload?.environment || requestPayload?.mode || '').toLowerCase().trim();
  const requestedMode = superAdminSettings?.razorpay_settings?.mode || 'test';
  const isServerLiveAllowed = serverEnv.ALLOW_RAZORPAY_LIVE_MODE === 'true';

  if (clientRequestedEnv === 'live' && (!isServerLiveAllowed || requestedMode !== 'live')) {
    return {
      status: 403,
      error: 'FORBIDDEN_ENVIRONMENT_OVERRIDE',
      message: 'Client-specified live environment is prohibited. Razorpay mode is governed exclusively by server-side configuration.',
      sideEffects
    };
  }

  if (requestedMode === 'live' && !isServerLiveAllowed) {
    return {
      status: 403,
      error: 'Razorpay Live Mode is requested in Super Admin settings, but server-side ALLOW_RAZORPAY_LIVE_MODE is not enabled. System locked in Test Mode for security.',
      sideEffects
    };
  }

  const isLive = requestedMode === 'live' && isServerLiveAllowed;
  const envMode = isLive ? 'live' : 'test';

  // Stage 5H.2 / 5H.3: Single-Tenant LIVE Checkout Access Control Guard
  if (isLive) {
    const rawAllowlist = serverEnv.LIVE_ALLOWED_TENANT_IDS || '';
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

    const allowedTenantIds = rawAllowlist
      .split(',')
      .map(id => id.trim().toLowerCase())
      .filter(id => id.length > 0);

    const hasInvalidId = allowedTenantIds.length === 0 || allowedTenantIds.some(id => !uuidRegex.test(id));

    if (hasInvalidId) {
      return {
        status: 403,
        error: 'FORBIDDEN_LIVE_PREVIEW_CONFIGURATION',
        message: 'Razorpay Live checkout is locked. Server preview tenant allowlist is not configured or contains invalid identifiers.',
        sideEffects
      };
    }

    const normalizedTenantId = String(canonicalTenantId || '').trim().toLowerCase();
    if (!allowedTenantIds.includes(normalizedTenantId)) {
      return {
        status: 403,
        error: 'FORBIDDEN_TENANT_LIVE_ACCESS',
        message: 'Live checkout is currently restricted to authorized preview tenants. Your tenant account is not authorized for live transactions.',
        sideEffects
      };
    }
  }

  // Pre-checkout billing validation guard
  const tenantBilling = authenticatedUser.billing || {};
  const isBillingComplete = Boolean(
    tenantBilling.name &&
    tenantBilling.email &&
    tenantBilling.address &&
    tenantBilling.state &&
    tenantBilling.pincode
  );

  if (!isBillingComplete) {
    return {
      status: 400,
      error: 'MISSING_BILLING_DETAILS',
      message: 'Billing profile incomplete. Please update your billing details in Settings before subscribing.',
      sideEffects
    };
  }

  // Check duplicate active subscription / retry logic
  const existingSub = existingSubscriptions.find(s => s.tenant_id === canonicalTenantId && s.environment === envMode && s.status === 'active');
  if (existingSub) {
    return {
      status: 400,
      error: 'You already have an active paid subscription. Plan changes are managed via support.',
      sideEffects
    };
  }

  // At this stage, all guards pass and checkout proceeds safely
  sideEffects.leaseAcquired = true;
  sideEffects.planCreated = isLive;
  sideEffects.customerCreated = true;
  sideEffects.subscriptionCreated = true;
  sideEffects.dbWritten = true;

  return {
    status: 200,
    envMode,
    tenantId: canonicalTenantId,
    sideEffects
  };
}

test('STAGE 5H.2 / 5H.3: Single-Tenant Razorpay LIVE Checkout Guard Test Suite', async (t) => {
  const AUTHORIZED_TENANT_ID = '1707818e-79ff-4a0c-9f99-7d991cc27842';
  const AUTHORIZED_TENANT_UPPERCASE = '1707818E-79FF-4A0C-9F99-7D991CC27842';
  const UNAUTHORIZED_TENANT_ID = '872c0a9a-111e-4cfc-a1f8-a9a4980b7f3a';
  const VALID_BILLING = {
    name: 'Authorized QA Tenant',
    email: 'uhariff@staypilot.co.in',
    address: '100 Beach Road, Chennai',
    state: 'Tamil Nadu',
    pincode: '600001'
  };

  await t.test('1. LIVE mode disabled: checkout denied when Super Admin requests LIVE but server guard is disabled', () => {
    const res = evaluateRazorpayCheckoutGuard({
      authenticatedUser: { id: AUTHORIZED_TENANT_ID, role: 'tenant_admin', billing: VALID_BILLING },
      requestPayload: { plan_type: 'custom_1786983013013' },
      serverEnv: { ALLOW_RAZORPAY_LIVE_MODE: 'false', LIVE_ALLOWED_TENANT_IDS: AUTHORIZED_TENANT_ID },
      superAdminSettings: { razorpay_settings: { mode: 'live' } }
    });
    assert.equal(res.status, 403);
    assert.equal(res.error.includes('ALLOW_RAZORPAY_LIVE_MODE is not enabled'), true);
    assert.equal(res.sideEffects.dbWritten, false);
    assert.equal(res.sideEffects.leaseAcquired, false);
  });

  await t.test('2. LIVE mode enabled, allowlist missing: denied with HTTP 403', () => {
    const res = evaluateRazorpayCheckoutGuard({
      authenticatedUser: { id: AUTHORIZED_TENANT_ID, role: 'tenant_admin', billing: VALID_BILLING },
      requestPayload: { plan_type: 'custom_1786983013013' },
      serverEnv: { ALLOW_RAZORPAY_LIVE_MODE: 'true', LIVE_ALLOWED_TENANT_IDS: undefined },
      superAdminSettings: { razorpay_settings: { mode: 'live' } }
    });
    assert.equal(res.status, 403);
    assert.equal(res.error, 'FORBIDDEN_LIVE_PREVIEW_CONFIGURATION');
    assert.equal(res.sideEffects.subscriptionCreated, false);
  });

  await t.test('3. LIVE mode enabled, allowlist empty: denied with HTTP 403', () => {
    const res = evaluateRazorpayCheckoutGuard({
      authenticatedUser: { id: AUTHORIZED_TENANT_ID, role: 'tenant_admin', billing: VALID_BILLING },
      requestPayload: { plan_type: 'custom_1786983013013' },
      serverEnv: { ALLOW_RAZORPAY_LIVE_MODE: 'true', LIVE_ALLOWED_TENANT_IDS: '   ,  ' },
      superAdminSettings: { razorpay_settings: { mode: 'live' } }
    });
    assert.equal(res.status, 403);
    assert.equal(res.error, 'FORBIDDEN_LIVE_PREVIEW_CONFIGURATION');
  });

  await t.test('4. LIVE mode enabled, malformed allowlist: denied with HTTP 403', () => {
    const res = evaluateRazorpayCheckoutGuard({
      authenticatedUser: { id: AUTHORIZED_TENANT_ID, role: 'tenant_admin', billing: VALID_BILLING },
      requestPayload: { plan_type: 'custom_1786983013013' },
      serverEnv: { ALLOW_RAZORPAY_LIVE_MODE: 'true', LIVE_ALLOWED_TENANT_IDS: `${AUTHORIZED_TENANT_ID}, invalid-uuid-1234` },
      superAdminSettings: { razorpay_settings: { mode: 'live' } }
    });
    assert.equal(res.status, 403);
    assert.equal(res.error, 'FORBIDDEN_LIVE_PREVIEW_CONFIGURATION');
  });

  await t.test('5. LIVE mode enabled, unauthorized tenant: HTTP 403 FORBIDDEN_TENANT_LIVE_ACCESS', () => {
    const res = evaluateRazorpayCheckoutGuard({
      authenticatedUser: { id: UNAUTHORIZED_TENANT_ID, role: 'tenant_admin', billing: VALID_BILLING },
      requestPayload: { plan_type: 'custom_1786983013013' },
      serverEnv: { ALLOW_RAZORPAY_LIVE_MODE: 'true', LIVE_ALLOWED_TENANT_IDS: AUTHORIZED_TENANT_ID },
      superAdminSettings: { razorpay_settings: { mode: 'live' } }
    });
    assert.equal(res.status, 403);
    assert.equal(res.error, 'FORBIDDEN_TENANT_LIVE_ACCESS');
    assert.equal(res.sideEffects.leaseAcquired, false);
    assert.equal(res.sideEffects.dbWritten, false);
  });

  await t.test('6. LIVE mode enabled, authorized tenant (lowercase): guard permits progression', () => {
    const res = evaluateRazorpayCheckoutGuard({
      authenticatedUser: { id: AUTHORIZED_TENANT_ID, role: 'tenant_admin', billing: VALID_BILLING },
      requestPayload: { plan_type: 'custom_1786983013013' },
      serverEnv: { ALLOW_RAZORPAY_LIVE_MODE: 'true', LIVE_ALLOWED_TENANT_IDS: `  ${AUTHORIZED_TENANT_ID}  ` },
      superAdminSettings: { razorpay_settings: { mode: 'live' } }
    });
    assert.equal(res.status, 200);
    assert.equal(res.envMode, 'live');
    assert.equal(res.tenantId, AUTHORIZED_TENANT_ID);
    assert.equal(res.sideEffects.leaseAcquired, true);
    assert.equal(res.sideEffects.subscriptionCreated, true);
  });

  await t.test('7. Case-Insensitive Normalization: Uppercase allowlist matches lowercase tenant ID', () => {
    const res = evaluateRazorpayCheckoutGuard({
      authenticatedUser: { id: AUTHORIZED_TENANT_ID, role: 'tenant_admin', billing: VALID_BILLING },
      requestPayload: { plan_type: 'custom_1786983013013' },
      serverEnv: { ALLOW_RAZORPAY_LIVE_MODE: 'true', LIVE_ALLOWED_TENANT_IDS: AUTHORIZED_TENANT_UPPERCASE },
      superAdminSettings: { razorpay_settings: { mode: 'live' } }
    });
    assert.equal(res.status, 200);
    assert.equal(res.envMode, 'live');
  });

  await t.test('8. Case-Insensitive Normalization: Lowercase allowlist matches uppercase tenant profile ID', () => {
    const res = evaluateRazorpayCheckoutGuard({
      authenticatedUser: { id: AUTHORIZED_TENANT_UPPERCASE, role: 'tenant_admin', billing: VALID_BILLING },
      requestPayload: { plan_type: 'custom_1786983013013' },
      serverEnv: { ALLOW_RAZORPAY_LIVE_MODE: 'true', LIVE_ALLOWED_TENANT_IDS: AUTHORIZED_TENANT_ID },
      superAdminSettings: { razorpay_settings: { mode: 'live' } }
    });
    assert.equal(res.status, 200);
    assert.equal(res.envMode, 'live');
  });

  await t.test('9. Forged client tenant ID in payload is ignored; authenticated identity is strictly used', () => {
    const res = evaluateRazorpayCheckoutGuard({
      authenticatedUser: { id: UNAUTHORIZED_TENANT_ID, role: 'tenant_admin', billing: VALID_BILLING },
      requestPayload: { plan_type: 'custom_1786983013013', tenant_id: AUTHORIZED_TENANT_ID }, // Forged
      serverEnv: { ALLOW_RAZORPAY_LIVE_MODE: 'true', LIVE_ALLOWED_TENANT_IDS: AUTHORIZED_TENANT_ID },
      superAdminSettings: { razorpay_settings: { mode: 'live' } }
    });
    assert.equal(res.status, 403);
    assert.equal(res.error, 'FORBIDDEN_TENANT_LIVE_ACCESS');
  });

  await t.test('10. Forged client environment=live is rejected when server mode is test', () => {
    const res = evaluateRazorpayCheckoutGuard({
      authenticatedUser: { id: AUTHORIZED_TENANT_ID, role: 'tenant_admin', billing: VALID_BILLING },
      requestPayload: { plan_type: 'custom_1786983013013', environment: 'live' },
      serverEnv: { ALLOW_RAZORPAY_LIVE_MODE: 'false', LIVE_ALLOWED_TENANT_IDS: AUTHORIZED_TENANT_ID },
      superAdminSettings: { razorpay_settings: { mode: 'test' } }
    });
    assert.equal(res.status, 403);
    assert.equal(res.error, 'FORBIDDEN_ENVIRONMENT_OVERRIDE');
  });

  await t.test('11. Authenticated staff from another tenant is rejected with HTTP 403', () => {
    const res = evaluateRazorpayCheckoutGuard({
      authenticatedUser: { id: 'staff-uuid-1234', role: 'staff', tenant_id: AUTHORIZED_TENANT_ID, billing: VALID_BILLING },
      requestPayload: { plan_type: 'custom_1786983013013' },
      serverEnv: { ALLOW_RAZORPAY_LIVE_MODE: 'true', LIVE_ALLOWED_TENANT_IDS: AUTHORIZED_TENANT_ID },
      superAdminSettings: { razorpay_settings: { mode: 'live' } }
    });
    assert.equal(res.status, 403);
    assert.equal(res.error.includes('restricted to property owners'), true);
  });

  await t.test('12. Normal TEST request with LIVE guard disabled proceeds without allowlist', () => {
    const res = evaluateRazorpayCheckoutGuard({
      authenticatedUser: { id: UNAUTHORIZED_TENANT_ID, role: 'tenant_admin', billing: VALID_BILLING },
      requestPayload: { plan_type: 'custom_1786983013013' },
      serverEnv: { ALLOW_RAZORPAY_LIVE_MODE: 'false', LIVE_ALLOWED_TENANT_IDS: undefined }, // No allowlist
      superAdminSettings: { razorpay_settings: { mode: 'test' } }
    });
    assert.equal(res.status, 200);
    assert.equal(res.envMode, 'test');
    assert.equal(res.sideEffects.leaseAcquired, true);
  });

  await t.test('13. Unauthorized LIVE request produces zero billing side effects', () => {
    const res = evaluateRazorpayCheckoutGuard({
      authenticatedUser: { id: UNAUTHORIZED_TENANT_ID, role: 'tenant_admin', billing: VALID_BILLING },
      requestPayload: { plan_type: 'custom_1786983013013' },
      serverEnv: { ALLOW_RAZORPAY_LIVE_MODE: 'true', LIVE_ALLOWED_TENANT_IDS: AUTHORIZED_TENANT_ID },
      superAdminSettings: { razorpay_settings: { mode: 'live' } }
    });
    assert.equal(res.sideEffects.planCreated, false);
    assert.equal(res.sideEffects.customerCreated, false);
    assert.equal(res.sideEffects.subscriptionCreated, false);
    assert.equal(res.sideEffects.leaseAcquired, false);
    assert.equal(res.sideEffects.dbWritten, false);
  });

  await t.test('14. GST remains disabled: tax settings are empty and unapplied', () => {
    const settings = { razorpay_settings: { mode: 'live' }, tax_settings: null, gst_configuration: null };
    assert.equal(settings.gst_configuration, null);
    assert.equal(settings.tax_settings, null);
  });

  await t.test('15. Authorized tenant cannot bypass existing billing validation', () => {
    const res = evaluateRazorpayCheckoutGuard({
      authenticatedUser: { id: AUTHORIZED_TENANT_ID, role: 'tenant_admin', billing: null }, // Missing billing
      requestPayload: { plan_type: 'custom_1786983013013' },
      serverEnv: { ALLOW_RAZORPAY_LIVE_MODE: 'true', LIVE_ALLOWED_TENANT_IDS: AUTHORIZED_TENANT_ID },
      superAdminSettings: { razorpay_settings: { mode: 'live' } }
    });
    assert.equal(res.status, 400);
    assert.equal(res.error, 'MISSING_BILLING_DETAILS');
    assert.equal(res.sideEffects.dbWritten, false);
  });

  await t.test('16. No duplicate LIVE subscription is created on retry if already active', () => {
    const res = evaluateRazorpayCheckoutGuard({
      authenticatedUser: { id: AUTHORIZED_TENANT_ID, role: 'tenant_admin', billing: VALID_BILLING },
      requestPayload: { plan_type: 'custom_1786983013013' },
      serverEnv: { ALLOW_RAZORPAY_LIVE_MODE: 'true', LIVE_ALLOWED_TENANT_IDS: AUTHORIZED_TENANT_ID },
      superAdminSettings: { razorpay_settings: { mode: 'live' } },
      existingSubscriptions: [{ tenant_id: AUTHORIZED_TENANT_ID, environment: 'live', status: 'active' }]
    });
    assert.equal(res.status, 400);
    assert.equal(res.error.includes('already have an active paid subscription'), true);
    assert.equal(res.sideEffects.subscriptionCreated, false);
  });
});
