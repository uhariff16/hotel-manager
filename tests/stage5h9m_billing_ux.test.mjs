import test from 'node:test';
import assert from 'node:assert/strict';
import { validateTenantBilling, loadTenantBillingProfile } from '../src/lib/tenantBilling.js';
import { getTrialPresentationState } from '../src/lib/trial.js';

test('Stage 5H.9M Gate 3 Verification Suite', async (t) => {
  // Scenario 1: Active trial + incomplete profile -> badge displays trial-specific warning
  await t.test('1. Active trial + incomplete profile resolves to trial-specific warning', () => {
    const trialProfile = {
      id: 'tenant-trial-1',
      role: 'tenant_admin',
      plan_type: 'pro',
      trial_started_at: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
      trial_ends_at: new Date(Date.now() + 25 * 24 * 60 * 60 * 1000).toISOString(),
      global_settings: {}
    };
    const trialState = getTrialPresentationState({ profile: trialProfile });
    assert.equal(trialState.isActiveTrial, true);

    const billing = loadTenantBillingProfile(trialProfile);
    const validation = validateTenantBilling(billing);
    assert.equal(validation.isValid, false);

    const isTrial = trialState.isActiveTrial;
    const badgeText = isTrial 
      ? 'Optional during Free Trial — Required upon Paid Upgrade' 
      : 'Incomplete — Required for Paid Subscriptions';
    assert.equal(badgeText, 'Optional during Free Trial — Required upon Paid Upgrade');
  });

  // Scenario 2: Active trial + completed profile -> Profile Complete
  await t.test('2. Active trial + completed profile resolves to Profile Complete', () => {
    const trialProfile = {
      id: 'tenant-trial-2',
      role: 'tenant_admin',
      plan_type: 'pro',
      trial_started_at: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
      trial_ends_at: new Date(Date.now() + 25 * 24 * 60 * 60 * 1000).toISOString(),
      global_settings: {
        billing: {
          name: 'Acme Resort',
          email: 'admin@acmeresort.com',
          address_line1: '123 Main Street',
          city: 'Bengaluru',
          state: 'Karnataka',
          pincode: '560001',
          country: 'India'
        }
      }
    };
    const trialState = getTrialPresentationState({ profile: trialProfile });
    assert.equal(trialState.isActiveTrial, true);

    const billing = loadTenantBillingProfile(trialProfile);
    const validation = validateTenantBilling(billing);
    assert.equal(validation.isValid, true);
  });

  // Scenario 3: Expired trial + incomplete profile -> Incomplete — Required for Paid Subscriptions
  await t.test('3. Expired trial + incomplete profile retains standard Incomplete warning', () => {
    const expiredProfile = {
      id: 'tenant-expired-1',
      role: 'tenant_admin',
      plan_type: 'pro',
      trial_started_at: new Date(Date.now() - 35 * 24 * 60 * 60 * 1000).toISOString(),
      trial_ends_at: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
      global_settings: {}
    };
    const trialState = getTrialPresentationState({ profile: expiredProfile });
    assert.equal(trialState.isActiveTrial, false);
    assert.equal(trialState.isExpired, true);

    const billing = loadTenantBillingProfile(expiredProfile);
    const validation = validateTenantBilling(billing);
    assert.equal(validation.isValid, false);

    const isTrial = trialState.isActiveTrial;
    const badgeText = isTrial 
      ? 'Optional during Free Trial — Required upon Paid Upgrade' 
      : 'Incomplete — Required for Paid Subscriptions';
    assert.equal(badgeText, 'Incomplete — Required for Paid Subscriptions');
  });

  // Scenario 4: Active paid subscription -> does not show trial badge text
  await t.test('4. Active paid subscription does not show trial text', () => {
    const paidProfile = {
      id: 'tenant-paid-1',
      role: 'tenant_admin',
      plan_type: 'pro',
      global_settings: {}
    };
    const activeSubscription = {
      status: 'active',
      staypilot_plan_type: 'pro'
    };
    const trialState = getTrialPresentationState({ profile: paidProfile, activeSubscription });
    assert.equal(trialState.isActiveTrial, false);
    assert.equal(trialState.isPaid, true);
  });

  // Scenario 5: Grandfathered / legacy account -> does not show trial text
  await t.test('5. Grandfathered legacy account does not show trial text', () => {
    const legacyProfile = {
      id: 'tenant-legacy-1',
      role: 'tenant_admin',
      plan_type: 'premium',
      is_legacy_account: true,
      global_settings: {}
    };
    const trialState = getTrialPresentationState({ profile: legacyProfile });
    assert.equal(trialState.isActiveTrial, false);
    assert.equal(trialState.isLegacy, true);

    const isTrial = trialState.isActiveTrial;
    const badgeText = isTrial 
      ? 'Optional during Free Trial — Required upon Paid Upgrade' 
      : 'Incomplete — Required for Paid Subscriptions';
    assert.equal(badgeText, 'Incomplete — Required for Paid Subscriptions');
  });

  // Scenario 6: Resort fallback fills blank fields without overwriting existing billing
  await t.test('6. Resort fallback fills blank fields without overwriting existing billing', () => {
    const existingProfile = {
      id: 'tenant-resort-1',
      role: 'tenant_admin',
      global_settings: {
        billing: {
          name: 'Explicit Billing Name',
          email: 'explicit@billing.com',
          address_line1: '99 Custom Lane'
        }
      }
    };
    const fallbackResorts = [{
      name: 'Resort Name Should Not Overwrite',
      email: 'resort@ignored.com',
      address: 'Resort Address Should Not Overwrite'
    }];

    const b = loadTenantBillingProfile(existingProfile, fallbackResorts);
    assert.equal(b.name, 'Explicit Billing Name');
    assert.equal(b.email, 'explicit@billing.com');
    assert.equal(b.address_line1, '99 Custom Lane');
  });

  // Scenario 7: Resort fallback safely populates blank profile
  await t.test('7. Resort fallback populates blank profile from resort data', () => {
    const blankProfile = {
      id: 'tenant-resort-2',
      role: 'tenant_admin',
      global_settings: {}
    };
    const fallbackResorts = [{
      name: 'Paradise Resort',
      email: 'contact@paradiseresort.com',
      address: '10 Beach Road'
    }];

    const b = loadTenantBillingProfile(blankProfile, fallbackResorts);
    assert.equal(b.name, 'Paradise Resort');
    assert.equal(b.email, 'contact@paradiseresort.com');
    assert.equal(b.address_line1, '10 Beach Road');
    // Ensure state, city, pincode, gstin are NOT artificially invented
    assert.equal(b.city, '');
    assert.equal(b.state, '');
    assert.equal(b.pincode, '');
    assert.equal(b.gstin, '');
  });
});
