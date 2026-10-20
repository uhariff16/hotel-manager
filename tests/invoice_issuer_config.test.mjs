import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  DEFAULT_TRADE_NAME, TRADE_NAME_MAX_LENGTH, GST_ACTIVATION_RELEASE_APPROVED,
  STAGE_3B_REQUIRED_SELLER_KEYS, ConfigValidationError, ConfigAuthorizationError,
  stableStringify, emptySellerForm, sellerFormFromDb, validateSellerBasic, validateSellerOptional,
  validateSellerIdentityInput, buildSellerIdentityPatch, assessSellerReadiness,
  validateGstin, emptyGstForm, gstFormFromDb, validateGstConfiguration, buildGstConfigurationPatch,
  isGstEffective, buildPaymentAcknowledgment, calculateGstBreakdown, buildTaxInvoice,
  saveSellerIdentityConfig, saveGstConfiguration,
  resolveCanonicalSuperAdmin, MASTER_ADMIN_EMAIL, CANONICAL_SUPER_ADMIN_ID
} from '../src/lib/invoiceIssuerConfig.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

// ---------------------------------------------------------------------------
// Fixtures: values below are the REAL production seller_identity (read-only query, 2026-10-15)
// ---------------------------------------------------------------------------
const MASTER_ID = '9c4e65f5-c0a1-4b3a-8ed2-d01175a73409';
const SECONDARY_ID = 'a9ec6d2f-5afa-406b-87ce-109913dead89';
const PROD_SELLER = Object.freeze({
  address: '38, Siya Maricar Street, Nagore',
  city: 'Nagapattinam',
  email: 'billing@staypilot.co.in',
  legal_name: 'Mohamed Hassan Ariff',
  pan: 'ABCDE1234F',
  phone: '+918220320178',
  pincode: '611002',
  state: 'Tamil Nadu',
  state_code: '33',
  trade_name: 'Stay Pilot',
  updated_at: '2026-10-14T04:52:14.395Z'
});
const OTHER_SETTINGS = Object.freeze({
  pricing: { solo: 499, growth: 1499, premium: 2499 },
  website_pricing: { published: { pro: { promotionalPrice: 1499 } } },
  razorpay_settings: { mode: 'test', testKeyId: 'rzp_test_x', liveKeyId: '' },
  landing_page: { hero: 'Hello' },
  comm_features_enabled: true
});
const NOW = new Date('2026-10-15T13:00:00.000Z');
const clone = (v) => JSON.parse(JSON.stringify(v));

function makeFakeSupabase(initial, { denyUpdateFor = [], failUpdateFor = [], rpcUnavailable = false } = {}) {
  const rows = new Map(Object.entries(initial).map(([id, r]) => [id, clone(r)]));
  const log = { reads: [], writes: [] };
  const rpcs = [];
  const canon = (v) => JSON.parse(stableStringify(v)); // JSONB does not preserve key order
  const client = {
    rows, log, rpcs,
    from(table) {
      assert.equal(table, 'profiles', 'only the profiles table may be touched');
      return {
        select() {
          return { eq: (_c, id) => ({
            async single() {
              log.reads.push(id);
              const r = rows.get(id);
              return r ? { data: { id, global_settings: clone(r.global_settings) }, error: null } : { data: null, error: { message: 'not found' } };
            }
          }) };
        },
        update(patch) {
          return { eq: (_c, id) => ({
            async select() {
              log.writes.push({ id, patch: clone(patch) });
              if (failUpdateFor.includes(id)) return { data: null, error: { message: 'boom' } };
              if (denyUpdateFor.includes(id) || !rows.has(id)) return { data: [], error: null }; // RLS no-op
              rows.get(id).global_settings = canon(patch.global_settings);
              return { data: [{ id }], error: null };
            }
          }) };
        }
      };
    }
  };

  if (!rpcUnavailable) {
    client.rpc = async (fnName, args) => {
      rpcs.push({ fnName, args: clone(args) });
      if (fnName !== 'update_saas_global_configuration') {
        return { data: null, error: { message: `Unknown RPC ${fnName}` } };
      }
      const targetId = args?.p_canonical_id;
      if (failUpdateFor.includes(targetId)) {
        return { data: null, error: { message: 'boom' } };
      }
      if (denyUpdateFor.includes(targetId)) {
        return { data: null, error: { code: '42501', message: 'FORBIDDEN: privilege denied' } };
      }
      if (targetId !== MASTER_ID) {
        return { data: null, error: { code: '42501', message: 'INVALID_TARGET: Target profile must match canonical Super Admin profile.' } };
      }
      if (!rows.has(targetId)) {
        return { data: null, error: { code: 'P0002', message: 'CANONICAL_PROFILE_NOT_FOUND: Authoritative Super Admin configuration record does not exist.' } };
      }

      const row = rows.get(targetId);
      const settings = clone(row.global_settings || {});
      const section = args.p_section;

      if (section === 'seller_identity') {
        settings.seller_identity = { ...settings.seller_identity, ...canon(args.p_seller_identity) };
      } else if (section === 'gst_configuration') {
        const gst = canon(args.p_gst_configuration) || {};
        if (gst.status && !['draft', 'pending_verification', 'active', 'disabled'].includes(gst.status)) {
          return { data: null, error: { code: '22023', message: `INVALID_ARGUMENT: GST status must be one of draft, pending_verification, active, disabled (received: ${gst.status}).` } };
        }
        if (gst.enabled && gst.status === 'active') {
          const rateStr = gst.rate_percent !== undefined && gst.rate_percent !== null ? String(gst.rate_percent) : '';
          const rateNum = Number(gst.rate_percent);
          if (!rateStr || !/^\d+(\.\d{1,2})?$/.test(rateStr) || isNaN(rateNum) || rateNum <= 0 || rateNum > 50) {
            return { data: null, error: { code: '22023', message: `INVALID_ARGUMENT: GST percentage is required to enable GST and must be a number above 0 and at most 50 with max 2 decimals (received: ${rateStr || 'null'}).` } };
          }
          if (!gst.pricing_mode || !['inclusive', 'exclusive'].includes(gst.pricing_mode)) {
            return { data: null, error: { code: '22023', message: `INVALID_ARGUMENT: Pricing mode is required to enable GST and must be either inclusive or exclusive (received: ${gst.pricing_mode || 'null'}).` } };
          }
          const gstin = (gst.gstin || '').trim().toUpperCase();
          if (!/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(gstin)) {
            return { data: null, error: { code: '22023', message: `INVALID_ARGUMENT: GSTIN is required to enable GST and must be 15 characters in official format (received: ${gst.gstin || 'null'}).` } };
          }
          if (gst.effective_from && isNaN(Date.parse(gst.effective_from))) {
            return { data: null, error: { code: '22023', message: `INVALID_ARGUMENT: Effective From must be a valid date and time (received: ${gst.effective_from}).` } };
          }
          const seller = settings.seller_identity || {};
          if (!seller.legal_name?.trim() || !seller.address?.trim() || !seller.city?.trim() || !seller.state?.trim() || !seller.pincode?.trim()) {
            return { data: null, error: { code: '22023', message: 'INVALID_ARGUMENT: Seller details required for GST activation are incomplete (legal_name, address, city, state, pincode).' } };
          }
          if (seller.state_code && String(seller.state_code).trim()) {
            const gstinState = gstin.substring(0, 2);
            const sellerState = String(seller.state_code).trim().padStart(2, '0');
            if (gstinState !== sellerState) {
              return { data: null, error: { code: '22023', message: `INVALID_ARGUMENT: GSTIN state code (${gstinState}) does not match seller state code (${seller.state_code}).` } };
            }
          }
        }
        settings.gst_configuration = gst;
        let taxSettings = args.p_tax_settings ? canon(args.p_tax_settings) : (settings.tax_settings || {});
        if (gst.enabled && gst.status === 'active') {
          taxSettings = {
            ...taxSettings,
            enabled: true,
            rate: Number(gst.rate_percent) || 0,
            gstin: (gst.gstin || '').trim().toUpperCase(),
            pricing_mode: gst.pricing_mode || 'exclusive',
            effective_from: gst.effective_from,
            updated_at: gst.updated_at || new Date().toISOString()
          };
        } else {
          taxSettings = {
            ...taxSettings,
            enabled: false,
            ...(gst.effective_from !== undefined ? { effective_from: gst.effective_from } : {})
          };
        }
        settings.tax_settings = taxSettings;
      } else if (section === 'pricing') {
        const mergedPricing = { ...(settings.pricing || {}) };
        for (const [k, v] of Object.entries(args.p_pricing || {})) {
          if (typeof v === 'object' && v !== null && !Array.isArray(v)) {
            mergedPricing[k] = { ...(mergedPricing[k] || {}), ...v };
          } else {
            mergedPricing[k] = v;
          }
        }
        settings.pricing = canon(mergedPricing);
      } else if (section === 'website_pricing') {
        const mergedWebsite = { ...(settings.website_pricing || {}), ...canon(args.p_website_pricing) };
        if (!args.p_website_pricing?.history && settings.website_pricing?.history) {
          mergedWebsite.history = settings.website_pricing.history;
        }
        settings.website_pricing = mergedWebsite;
        if (args.p_pricing) {
          const mergedPricing = { ...(settings.pricing || {}) };
          for (const [k, v] of Object.entries(args.p_pricing || {})) {
            if (typeof v === 'object' && v !== null && !Array.isArray(v)) {
              mergedPricing[k] = { ...(mergedPricing[k] || {}), ...v };
            } else {
              mergedPricing[k] = v;
            }
          }
          settings.pricing = canon(mergedPricing);
        }
      } else if (section === 'razorpay_settings') {
        if (args.p_razorpay_settings?.testKeySecret || args.p_razorpay_settings?.liveKeySecret || args.p_razorpay_settings?.webhookSecret || args.p_razorpay_settings?.secret || args.p_razorpay_settings?.key_secret) {
          return { data: null, error: { code: '42501', message: 'SECURITY_VIOLATION: Razorpay secret keys must never be stored in global_settings.' } };
        }
        const mergedRzp = { ...(settings.razorpay_settings || {}), ...canon(args.p_razorpay_settings) };
        delete mergedRzp.testKeySecret;
        delete mergedRzp.liveKeySecret;
        delete mergedRzp.webhookSecret;
        delete mergedRzp.secret;
        delete mergedRzp.key_secret;
        settings.razorpay_settings = mergedRzp;
      } else if (section === 'tax_settings') {
        let taxSettings = { ...(settings.tax_settings || {}), ...canon(args.p_tax_settings) };
        if (settings.gst_configuration?.enabled && settings.gst_configuration?.status === 'active') {
          taxSettings = {
            ...taxSettings,
            enabled: true,
            rate: settings.gst_configuration.rate_percent || 0,
            gstin: settings.gst_configuration.gstin || '',
            pricing_mode: settings.gst_configuration.pricing_mode || 'exclusive'
          };
        } else {
          taxSettings = {
            ...taxSettings,
            enabled: false
          };
        }
        settings.tax_settings = taxSettings;
      } else if (section === 'email_templates') {
        settings.email_templates = canon(args.p_email_templates);
      } else if (section === 'landing_page') {
        settings.landing_page = canon(args.p_landing_page);
      } else if (section === 'features') {
        settings.comm_features_enabled = args.p_features.comm_features_enabled ?? true;
        settings.templates_enabled = args.p_features.templates_enabled ?? true;
        settings.onboarding_wizard_enabled = args.p_features.onboarding_wizard_enabled ?? true;
      } else {
        return { data: null, error: { code: '22023', message: `INVALID_SECTION: Unknown configuration section ${section}` } };
      }

      row.global_settings = settings;
      return { data: clone(settings), error: null };
    };
  }

  return client;
}

const freshDb = (extra = {}) => makeFakeSupabase({
  [MASTER_ID]: { global_settings: { ...clone(OTHER_SETTINGS), seller_identity: clone(PROD_SELLER), ...extra } },
  [SECONDARY_ID]: { global_settings: { seller_identity: clone(PROD_SELLER) } }
});
const SUPER = { id: MASTER_ID, role: 'super_admin' };

// ===========================================================================
describe('A. Trade-name validation (basic non-GST mode)', () => {
  test('default form uses "Stay Pilot" and passes basic validation with every other field blank', () => {
    const f = emptySellerForm();
    assert.equal(f.tradeName, 'Stay Pilot');
    assert.deepEqual(validateSellerIdentityInput(f, []), {});
  });

  test('Trade Name is the ONLY mandatory field', () => {
    for (const bad of ['', '   ', null, undefined]) {
      const errs = validateSellerBasic({ ...emptySellerForm(), tradeName: bad });
      assert.deepEqual(Object.keys(errs), ['tradeName'], `value ${JSON.stringify(bad)}`);
    }
    // Every other field blank + all marked dirty (operator cleared them) => still valid.
    const cleared = { ...emptySellerForm(), legalName: '', address: '', city: '', state: '', stateCode: '', pincode: '', email: '', phone: '', pan: '' };
    assert.deepEqual(validateSellerIdentityInput(cleared, ['legalName', 'address', 'city', 'state', 'pincode', 'email', 'phone', 'pan']), {});
  });

  test('over-long trade name is rejected', () => {
    const errs = validateSellerBasic({ tradeName: 'x'.repeat(TRADE_NAME_MAX_LENGTH + 1) });
    assert.ok(errs.tradeName);
    assert.deepEqual(validateSellerBasic({ tradeName: 'x'.repeat(TRADE_NAME_MAX_LENGTH) }), {});
  });

  test('stored identity without a trade name hydrates to the default', () => {
    assert.equal(sellerFormFromDb({ legal_name: 'A B C' }).tradeName, DEFAULT_TRADE_NAME);
    assert.equal(sellerFormFromDb(null).tradeName, DEFAULT_TRADE_NAME);
    assert.equal(sellerFormFromDb({ trade_name: '  ' }).tradeName, DEFAULT_TRADE_NAME);
  });

  test('save with an invalid (blank) trade name is rejected and the database is not touched', async () => {
    const db = freshDb();
    await assert.rejects(
      saveSellerIdentityConfig({ supabase: db, actorProfile: SUPER, masterAdminId: MASTER_ID, form: { ...emptySellerForm(), tradeName: '  ' }, dirty: ['tradeName'] }),
      (e) => e instanceof ConfigValidationError && !!e.errors.tradeName
    );
    assert.equal(db.log.writes.length, 0);
  });
});

// ===========================================================================
describe('B. Optional-field persistence and preservation of existing settings', () => {
  test('KEY REGRESSION: saving only the trade name preserves every existing seller field byte-for-byte', async () => {
    const db = freshDb();
    // The form never loaded the additional details (all blank) — only tradeName is dirty.
    const staleForm = { ...emptySellerForm(), tradeName: 'Stay Pilot Stays' };
    const res = await saveSellerIdentityConfig({ supabase: db, actorProfile: SUPER, masterAdminId: MASTER_ID, form: staleForm, dirty: ['tradeName'], now: NOW });

    const stored = db.rows.get(MASTER_ID).global_settings.seller_identity;
    for (const k of ['address', 'city', 'email', 'legal_name', 'pan', 'phone', 'pincode', 'state', 'state_code']) {
      assert.equal(stored[k], PROD_SELLER[k], `${k} must be preserved`);
    }
    assert.equal(stored.trade_name, 'Stay Pilot Stays');
    assert.equal(stored.updated_at, NOW.toISOString());
    assert.deepEqual(res.changedKeys, ['trade_name']);
    assert.equal(res.formalInvoiceReady, true);
  });

  test('saving with an unchanged trade name preserves everything and changes nothing but updated_at', async () => {
    const db = freshDb();
    const form = sellerFormFromDb(PROD_SELLER);
    const res = await saveSellerIdentityConfig({ supabase: db, actorProfile: SUPER, masterAdminId: MASTER_ID, form, dirty: [], now: NOW });
    const stored = db.rows.get(MASTER_ID).global_settings.seller_identity;
    assert.deepEqual({ ...stored, updated_at: PROD_SELLER.updated_at }, PROD_SELLER);
    assert.deepEqual(res.changedKeys, []);
  });

  test('all other global_settings keys are untouched (pricing, website pricing, razorpay, landing, flags)', async () => {
    const db = freshDb();
    await saveSellerIdentityConfig({ supabase: db, actorProfile: SUPER, masterAdminId: MASTER_ID, form: { ...emptySellerForm(), tradeName: 'Renamed' }, dirty: ['tradeName'], now: NOW });
    const gs = db.rows.get(MASTER_ID).global_settings;
    for (const [k, v] of Object.entries(OTHER_SETTINGS)) assert.deepEqual(gs[k], v, `${k} unchanged`);
    assert.equal('tax_settings' in gs, false, 'legacy checkout tax_settings must not be created');
    assert.equal('gst_configuration' in gs, false, 'seller save must not create GST configuration');
  });

  test('optional fields persist when provided and are normalised (PAN upper-cased, blanks -> null)', async () => {
    const db = makeFakeSupabase({ [MASTER_ID]: { global_settings: {} } });
    const form = { legalName: 'Mohamed Hassan Ariff', tradeName: 'Stay Pilot', address: '38, Siya Maricar Street, Nagore', city: 'Nagapattinam',
      state: 'Tamil Nadu', stateCode: '33', pincode: '611002', email: 'billing@staypilot.co.in', phone: '', pan: 'abcde1234f' };
    const dirty = ['legalName', 'tradeName', 'address', 'city', 'state', 'pincode', 'email', 'phone', 'pan'];
    await saveSellerIdentityConfig({ supabase: db, actorProfile: SUPER, masterAdminId: MASTER_ID, form, dirty, now: NOW });
    const s = db.rows.get(MASTER_ID).global_settings.seller_identity;
    assert.equal(s.legal_name, 'Mohamed Hassan Ariff');
    assert.equal(s.state_code, '33');
    assert.equal(s.pan, 'ABCDE1234F');
    assert.equal(s.phone, null);
  });

  test('first-ever save with ONLY a trade name creates a minimal identity (nothing fabricated)', async () => {
    const db = makeFakeSupabase({ [MASTER_ID]: { global_settings: { ...clone(OTHER_SETTINGS) } } });
    await saveSellerIdentityConfig({ supabase: db, actorProfile: SUPER, masterAdminId: MASTER_ID, form: emptySellerForm(), dirty: [], now: NOW });
    const s = db.rows.get(MASTER_ID).global_settings.seller_identity;
    assert.deepEqual(s, { trade_name: 'Stay Pilot', updated_at: NOW.toISOString() });
  });

  test('explicitly clearing an optional field stores null; untouched fields are preserved', async () => {
    const db = freshDb();
    const form = { ...sellerFormFromDb(PROD_SELLER), phone: '' };
    await saveSellerIdentityConfig({ supabase: db, actorProfile: SUPER, masterAdminId: MASTER_ID, form, dirty: ['phone'], now: NOW });
    const s = db.rows.get(MASTER_ID).global_settings.seller_identity;
    assert.equal(s.phone, null);
    assert.equal(s.pan, PROD_SELLER.pan);
    assert.equal(s.legal_name, PROD_SELLER.legal_name);
  });

  test('invalid value in an EDITED optional field is rejected; the same invalid legacy value, untouched, does not block', async () => {
    const db = freshDb({ seller_identity: { ...clone(PROD_SELLER), pan: 'legacy-not-a-pan' } });
    const form = sellerFormFromDb(db.rows.get(MASTER_ID).global_settings.seller_identity);

    // untouched legacy junk does not block a trade-name-only save and is preserved verbatim
    await saveSellerIdentityConfig({ supabase: db, actorProfile: SUPER, masterAdminId: MASTER_ID, form: { ...form, tradeName: 'Brand' }, dirty: ['tradeName'], now: NOW });
    assert.equal(db.rows.get(MASTER_ID).global_settings.seller_identity.pan, 'legacy-not-a-pan');

    // editing it to something invalid is rejected and nothing is written
    const writesBefore = db.log.writes.length;
    await assert.rejects(
      saveSellerIdentityConfig({ supabase: db, actorProfile: SUPER, masterAdminId: MASTER_ID, form: { ...form, pan: 'BAD' }, dirty: ['pan'], now: NOW }),
      (e) => e instanceof ConfigValidationError && !!e.errors.pan
    );
    assert.equal(db.log.writes.length, writesBefore);
  });

  test('format rules for optional fields (only when edited and non-empty)', () => {
    const base = emptySellerForm();
    const cases = [
      ['pincode', '012345', true], ['pincode', '61100', true], ['pincode', '611002', false],
      ['email', 'nope', true], ['email', 'a@b.co', false],
      ['phone', '12345', true], ['phone', '+91 98765 43210', false],
      ['pan', 'ABCDE12345', true], ['pan', 'ABCDE1234F', false],
      ['legalName', 'Al', true], ['legalName', 'Mohamed 2', true], ['legalName', 'Mohamed Hassan', false],
      ['address', 'short', true], ['city', 'A', true]
    ];
    for (const [field, value, shouldFail] of cases) {
      const errs = validateSellerOptional({ ...base, [field]: value }, [field]);
      assert.equal(Boolean(errs[field]), shouldFail, `${field}=${value}`);
      assert.equal(Boolean(validateSellerOptional({ ...base, [field]: value }, [])[field]), false, `${field} untouched is never validated`);
    }
    assert.ok(validateSellerOptional({ ...base, state: 'Tamil Nadu', stateCode: '' }, ['state']).state);
  });

  test('a fresh database read wins over stale local state (concurrent edit elsewhere is not clobbered)', async () => {
    const db = freshDb();
    db.rows.get(MASTER_ID).global_settings.seller_identity.phone = '+919999999999'; // changed in another session
    const staleForm = { ...sellerFormFromDb(PROD_SELLER), tradeName: 'New Brand' }; // still has the old phone
    await saveSellerIdentityConfig({ supabase: db, actorProfile: SUPER, masterAdminId: MASTER_ID, form: staleForm, dirty: ['tradeName'], now: NOW });
    assert.equal(db.rows.get(MASTER_ID).global_settings.seller_identity.phone, '+919999999999');
  });

  test('a silently denied write (policy no-op or permission denied) is reported as a failure, not success', async () => {
    const db = makeFakeSupabase({ [MASTER_ID]: { global_settings: { seller_identity: clone(PROD_SELLER) } } }, { denyUpdateFor: [MASTER_ID] });
    await assert.rejects(
      saveSellerIdentityConfig({ supabase: db, actorProfile: SUPER, masterAdminId: MASTER_ID, form: emptySellerForm(), dirty: ['tradeName'], now: NOW }),
      /not applied|FORBIDDEN|Unauthorized/
    );
  });

  test('Task 1 — RPC unavailable: saveSellerIdentityConfig fails safely without fallback and makes no writes', async () => {
    const db = makeFakeSupabase(
      { [MASTER_ID]: { global_settings: { seller_identity: clone(PROD_SELLER) } } },
      { rpcUnavailable: true }
    );
    await assert.rejects(
      saveSellerIdentityConfig({ supabase: db, actorProfile: SUPER, masterAdminId: MASTER_ID, form: { ...emptySellerForm(), tradeName: 'Attempt Without RPC' }, dirty: ['tradeName'], now: NOW }),
      /RPC_UNAVAILABLE/
    );
    // Verified: No writes to profiles table and data unchanged
    assert.equal(db.log.writes.length, 0);
    assert.equal(db.rows.get(MASTER_ID).global_settings.seller_identity.trade_name, 'Stay Pilot');
  });

  test('Task 1 — RPC unavailable: saveGstConfiguration fails safely without fallback and makes no writes', async () => {
    const db = makeFakeSupabase(
      { [MASTER_ID]: { global_settings: { seller_identity: clone(PROD_SELLER) } } },
      { rpcUnavailable: true }
    );
    await assert.rejects(
      saveGstConfiguration({ supabase: db, actorProfile: SUPER, masterAdminId: MASTER_ID, form: { ...emptyGstForm(), enabled: false }, now: NOW }),
      /RPC_UNAVAILABLE/
    );
    // Verified: No writes to profiles table
    assert.equal(db.log.writes.length, 0);
  });

  test('canonical single-record persistence: only the canonical master profile is updated; secondary profiles are untouched', async () => {
    const db = freshDb();
    db.rows.set(SECONDARY_ID, { role: 'super_admin', email: 'admin2@staypilot.com', global_settings: { untouched: true } });
    await saveSellerIdentityConfig({ supabase: db, actorProfile: SUPER, masterAdminId: MASTER_ID, form: { ...emptySellerForm(), tradeName: 'Canonical Test' }, dirty: ['tradeName'], now: NOW });
    assert.equal(db.rows.get(MASTER_ID).global_settings.seller_identity.trade_name, 'Canonical Test');
    // Secondary admin profile is NOT touched or polluted with redundant duplicate writes
    assert.deepEqual(db.rows.get(SECONDARY_ID).global_settings, { untouched: true });
  });

  test('buildSellerIdentityPatch keeps unknown legacy keys (e.g. sac_code, gstin written by other tooling)', () => {
    const existing = { ...PROD_SELLER, sac_code: '998313', gstin: null };
    const next = buildSellerIdentityPatch(existing, emptySellerForm(), ['tradeName'], NOW.toISOString());
    assert.equal(next.sac_code, '998313');
    assert.equal(next.gstin, null);
  });
});

// ===========================================================================
describe('C. Unauthorized configuration changes (client-side guard; server-side trigger is tested separately)', () => {
  for (const role of ['tenant_admin', 'staff', 'support_admin', 'billing_admin', undefined, null]) {
    test(`role=${role}: seller identity save is refused with zero database access`, async () => {
      const db = freshDb();
      await assert.rejects(
        saveSellerIdentityConfig({ supabase: db, actorProfile: role === undefined ? undefined : { id: 'x', role }, masterAdminId: MASTER_ID, form: emptySellerForm(), dirty: ['tradeName'] }),
        (e) => e instanceof ConfigAuthorizationError && e.code === 'UNAUTHORIZED'
      );
      assert.deepEqual(db.log, { reads: [], writes: [] });
    });

    test(`role=${role}: GST configuration save is refused with zero database access`, async () => {
      const db = freshDb();
      await assert.rejects(
        saveGstConfiguration({ supabase: db, actorProfile: role === undefined ? undefined : { id: 'x', role }, masterAdminId: MASTER_ID, form: emptyGstForm() }),
        (e) => e instanceof ConfigAuthorizationError
      );
      assert.deepEqual(db.log, { reads: [], writes: [] });
    });
  }

  test('a missing master admin id fails closed', async () => {
    const db = freshDb();
    await assert.rejects(saveSellerIdentityConfig({ supabase: db, actorProfile: SUPER, masterAdminId: undefined, form: emptySellerForm(), dirty: [] }), /could not be resolved/);
    await assert.rejects(saveGstConfiguration({ supabase: db, actorProfile: SUPER, masterAdminId: undefined, form: emptyGstForm() }), /could not be resolved/);
    assert.equal(db.log.writes.length, 0);
  });
});

// ===========================================================================
describe('D. GST configuration: defaults and direct Super Admin control', () => {
  test('defaults: disabled, draft, NO assumed rate, no pricing mode, no effective date', () => {
    assert.deepEqual(emptyGstForm(), { enabled: false, ratePercent: '', gstin: '', pricingMode: '', effectiveFrom: '', status: 'draft' });
    const { form, locked } = gstFormFromDb(undefined);
    assert.deepEqual(form, emptyGstForm());
    assert.equal(locked, false, 'Super Admin is never locked out from configuring GST');
    assert.equal(JSON.stringify(emptyGstForm()).includes('18'), false, 'no default rate assumed');
  });

  test('an empty draft is valid and persists as disabled with null fields', async () => {
    const db = freshDb();
    const res = await saveGstConfiguration({ supabase: db, actorProfile: SUPER, masterAdminId: MASTER_ID, form: emptyGstForm(), now: NOW });
    assert.deepEqual(res.configuration, { enabled: false, rate_percent: null, gstin: null, pricing_mode: null, effective_from: null, status: 'disabled', updated_at: NOW.toISOString(), updated_by: MASTER_ID });
  });

  test('Super Admin can directly enable GST when configuration is complete and valid', async () => {
    const validEnabled = {
      enabled: true,
      ratePercent: '18',
      gstin: '33AAPFU0939F1Z2',
      pricingMode: 'exclusive',
      effectiveFrom: '2026-11-01T00:00',
      status: 'active'
    };
    const db = freshDb({ seller_identity: clone(PROD_SELLER) });
    const res = await saveGstConfiguration({ supabase: db, actorProfile: SUPER, masterAdminId: MASTER_ID, form: validEnabled, now: NOW });
    assert.equal(res.configuration.enabled, true);
    assert.equal(res.configuration.status, 'active');
    assert.equal(res.configuration.rate_percent, 18);
    assert.equal(res.configuration.gstin, '33AAPFU0939F1Z2');
    assert.equal(res.configuration.pricing_mode, 'exclusive');

    // Also verified synced to tax_settings
    const gs = db.rows.get(MASTER_ID).global_settings;
    assert.equal(gs.tax_settings.enabled, true);
    assert.equal(gs.tax_settings.rate, 18);
    assert.equal(gs.tax_settings.gstin, '33AAPFU0939F1Z2');
  });

  test('Super Admin can directly disable GST after it was previously enabled', async () => {
    const activeDb = freshDb({
      gst_configuration: { enabled: true, status: 'active', rate_percent: 18, gstin: '33AAPFU0939F1Z2', pricing_mode: 'exclusive' },
      tax_settings: { enabled: true, rate: 18, gstin: '33AAPFU0939F1Z2', pricing_mode: 'exclusive' }
    });
    const res = await saveGstConfiguration({
      supabase: activeDb,
      actorProfile: SUPER,
      masterAdminId: MASTER_ID,
      form: { enabled: false, ratePercent: '18', gstin: '33AAPFU0939F1Z2', pricingMode: 'exclusive' },
      now: NOW
    });
    assert.equal(res.configuration.enabled, false);
    assert.equal(res.configuration.status, 'disabled');
    assert.equal(activeDb.rows.get(MASTER_ID).global_settings.tax_settings.enabled, false);
  });

  test('buildGstConfigurationPatch reflects the form enabled state directly', () => {
    const enabledPatch = buildGstConfigurationPatch({}, { ...emptyGstForm(), enabled: true, ratePercent: '18', gstin: '33AAPFU0939F1Z2', pricingMode: 'exclusive' }, MASTER_ID, NOW.toISOString());
    assert.equal(enabledPatch.enabled, true);
    assert.equal(enabledPatch.status, 'active');

    const disabledPatch = buildGstConfigurationPatch({ enabled: true }, { ...emptyGstForm(), enabled: false }, MASTER_ID, NOW.toISOString());
    assert.equal(disabledPatch.enabled, false);
    assert.equal(disabledPatch.status, 'disabled');
  });
});

// ===========================================================================
describe('E. GST configuration: field validation and activation prerequisites', () => {
  const sellerTN = { ...PROD_SELLER, state_code: '33' };
  const good = { enabled: true, ratePercent: '18', gstin: '33AAPFU0939F1Z2', pricingMode: 'exclusive', effectiveFrom: '2026-12-01T10:00' };

  test('a complete enabled configuration matching seller state code is valid', () => {
    const r = validateGstConfiguration(good, { seller: sellerTN, now: NOW });
    assert.deepEqual(r.errors, {});
    assert.equal(r.complete, true);
  });

  test('GSTIN validation: format, state code and checksum', () => {
    assert.equal(validateGstin('33AAPFU0939F1Z2').valid, true);
    assert.equal(validateGstin('27AAPFU0939F1ZV').valid, true);
    assert.equal(validateGstin('27aapfu0939f1zv').valid, true, 'case-insensitive');
    assert.equal(validateGstin('27AAPFU0939F1ZX').valid, false, 'bad checksum');
    assert.equal(validateGstin('27AAPFU0939F1Y1').valid, false, 'missing Z');
    assert.equal(validateGstin('00AAPFU0939F1ZV').valid, false, 'bad state code');
    assert.equal(validateGstin('ABCDE1234F').valid, false, 'a PAN is not a GSTIN');
    assert.equal(validateGstin('').valid, false);
  });

  test('enabling GST requires valid GSTIN, matching seller state code', () => {
    assert.ok(validateGstConfiguration({ ...good, gstin: '' }, { seller: sellerTN, now: NOW }).errors.gstin);
    const mismatch = validateGstConfiguration(good, { seller: { ...sellerTN, state_code: '27' }, now: NOW });
    assert.match(mismatch.errors.gstin, /does not match/);
  });

  test('enabling GST requires positive rate (>0 and <=50)', () => {
    for (const ok of ['5', '12.5', '18', '28']) {
      assert.equal(validateGstConfiguration({ ...good, ratePercent: ok }, { seller: sellerTN, now: NOW }).errors.ratePercent, undefined, ok);
    }
    for (const bad of ['0', '-5', 'abc', '18.555', '60', '1e2']) {
      assert.ok(validateGstConfiguration({ ...good, ratePercent: bad }, { seller: sellerTN, now: NOW }).errors.ratePercent, bad);
    }
    assert.ok(validateGstConfiguration({ ...good, ratePercent: '' }, { seller: sellerTN, now: NOW }).errors.ratePercent);
  });

  test('pricing mode must be inclusive or exclusive', () => {
    assert.ok(validateGstConfiguration({ ...good, pricingMode: '' }, { seller: sellerTN, now: NOW }).errors.pricingMode);
    assert.ok(validateGstConfiguration({ ...good, pricingMode: 'auto' }, { seller: sellerTN, now: NOW }).errors.pricingMode);
    for (const m of ['inclusive', 'exclusive']) {
      assert.equal(validateGstConfiguration({ ...good, pricingMode: m }, { seller: sellerTN, now: NOW }).errors.pricingMode, undefined);
    }
  });

  test('enabling GST requires complete seller details (legal name, address, city, state, PIN)', () => {
    const incompleteSeller = { trade_name: 'Stay Pilot' };
    const r = validateGstConfiguration(good, { seller: incompleteSeller, now: NOW });
    assert.match(r.errors.seller, /legal_name/);
    assert.match(r.errors.seller, /address/);
    assert.equal(validateGstConfiguration({ ...emptyGstForm(), enabled: false }, { seller: incompleteSeller, now: NOW }).errors.seller, undefined, 'disabled needs no seller details');
  });

  test('saving with enabled=true and incomplete details fails validation and does not touch database', async () => {
    const db = freshDb();
    const badForm = { enabled: true, ratePercent: '', gstin: '', pricingMode: '' };
    await assert.rejects(
      saveGstConfiguration({ supabase: db, actorProfile: SUPER, masterAdminId: MASTER_ID, form: badForm, now: NOW }),
      ConfigValidationError
    );
    assert.equal(db.log.writes.length, 0);
  });
});

// ===========================================================================
describe('F. GST Calculation and Invoice Behavior', () => {
  const payment = { amount_paise: 149900, currency: 'INR', payment_reference: 'pay_ABC123', customer_name: 'Test Resort', plan_name: 'Growth', paid_at: '2026-10-15T12:00:00.000Z' };

  test('isGstEffective is false when disabled and true when enabled and valid', () => {
    assert.equal(isGstEffective(null, NOW).effective, false);
    assert.equal(isGstEffective(undefined, NOW).reason, 'GST_DISABLED');
    assert.equal(isGstEffective({ enabled: false }, NOW).effective, false);

    const validEnabled = { enabled: true, rate_percent: 18, gstin: '33AAPFU0939F1Z2', pricing_mode: 'exclusive' };
    assert.equal(isGstEffective(validEnabled, NOW, { seller: PROD_SELLER }).effective, true);
  });

  test('calculateGstBreakdown: Exclusive pricing mode adds GST on top with exact integer paise precision', () => {
    const b = calculateGstBreakdown({
      amountPaise: 49900, // ₹499
      ratePercent: 18,
      pricingMode: 'exclusive',
      sellerStateCode: '33',
      customerStateCode: '33'
    });
    assert.equal(b.baseAmountPaise, 49900);
    assert.equal(b.gstAmountPaise, 8982);
    assert.equal(b.totalAmountPaise, 58882);
    assert.equal(b.taxType, 'intra_state');
    assert.equal(b.cgstAmountPaise, 4491);
    assert.equal(b.sgstAmountPaise, 4491);
    assert.equal(b.igstAmountPaise, 0);
    assert.equal(b.baseAmountPaise + b.cgstAmountPaise + b.sgstAmountPaise + b.igstAmountPaise, b.totalAmountPaise);
  });

  test('calculateGstBreakdown: Inclusive pricing mode extracts GST with exact penny-for-penny equality', () => {
    const b = calculateGstBreakdown({
      amountPaise: 49900, // ₹499 total
      ratePercent: 18,
      pricingMode: 'inclusive',
      sellerStateCode: '33',
      customerStateCode: '33'
    });
    assert.equal(b.totalAmountPaise, 49900);
    assert.equal(b.baseAmountPaise, 42288);
    assert.equal(b.gstAmountPaise, 7612);
    assert.equal(b.taxType, 'intra_state');
    assert.equal(b.cgstAmountPaise, 3806);
    assert.equal(b.sgstAmountPaise, 3806);
    assert.equal(b.igstAmountPaise, 0);
    assert.equal(b.baseAmountPaise + b.cgstAmountPaise + b.sgstAmountPaise + b.igstAmountPaise, b.totalAmountPaise);
  });

  test('calculateGstBreakdown: Inter-state places of supply assign all tax to IGST', () => {
    const b = calculateGstBreakdown({
      amountPaise: 149900, // ₹1,499
      ratePercent: 18,
      pricingMode: 'exclusive',
      sellerStateCode: '33', // Tamil Nadu
      customerStateCode: '27' // Maharashtra
    });
    assert.equal(b.taxType, 'inter_state');
    assert.equal(b.cgstAmountPaise, 0);
    assert.equal(b.sgstAmountPaise, 0);
    assert.equal(b.igstAmountPaise, 26982);
    assert.equal(b.totalAmountPaise, 176882);
    assert.equal(b.baseAmountPaise + b.igstAmountPaise, b.totalAmountPaise);
  });

  test('buildTaxInvoice creates complete compliant GST tax invoice when GST is enabled', () => {
    const inv = buildTaxInvoice({
      seller: PROD_SELLER,
      customer: { name: 'Cheerful Chalet', email: 'owner@chalet.in', address: 'Green Valley, Ooty', state: 'Tamil Nadu', state_code: '33', gstin: '33BBBBB0000B1Z6' },
      payment: { amount_paise: 149900, currency: 'INR', payment_reference: 'pay_ABC123', plan_name: 'Growth' },
      gstConfig: { enabled: true, rate_percent: 18, gstin: '33AAPFU0939F1Z2', pricing_mode: 'exclusive' },
      invoiceNumber: 'SP-INV-2026-01001',
      now: NOW
    });
    assert.equal(inv.document_type, 'tax_invoice');
    assert.equal(inv.gst_charged, true);
    assert.equal(inv.supplier_gstin, '33AAPFU0939F1Z2');
    assert.equal(inv.customer_gstin, '33BBBBB0000B1Z6');
    assert.equal(inv.tax_type, 'intra_state');
    assert.equal(inv.total_amount_paise, 176882);
  });

  test('buildPaymentAcknowledgment charges no GST and never exposes proprietor PII', () => {
    const ack = buildPaymentAcknowledgment({ seller: PROD_SELLER, payment, gstConfig: null, now: NOW });
    assert.equal(ack.amount_paise, 149900);
    assert.equal(ack.gst_charged, false);
    assert.equal(ack.document_type, 'payment_acknowledgment');
    const text = JSON.stringify(ack).toLowerCase();
    for (const banned of ['cgst', 'sgst', 'igst', 'gstin', 'tax_invoice']) assert.equal(text.includes(banned), false, banned);
    assert.match(ack.notice, /not a GST tax invoice/);

    const fullText = JSON.stringify(ack);
    for (const secret of [PROD_SELLER.legal_name, PROD_SELLER.address, PROD_SELLER.pan, PROD_SELLER.phone, PROD_SELLER.email, PROD_SELLER.city, PROD_SELLER.pincode]) {
      assert.equal(fullText.includes(secret), false, `leaked: ${secret}`);
    }
  });

  test('buildPaymentAcknowledgment fails closed if called with active GST', () => {
    assert.throws(
      () => buildPaymentAcknowledgment({ seller: PROD_SELLER, payment, gstConfig: { enabled: true, status: 'active' }, now: NOW }),
      /GST_TAX_ENGINE_REQUIRED/
    );
  });
});

// ===========================================================================
describe('G. Integration contracts with protected artefacts and Super Admin UI', () => {
  const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

  test('saveGstConfiguration synchronizes tax_settings for checkout edge function compatibility', async () => {
    const db = freshDb({ seller_identity: clone(PROD_SELLER) });
    await saveGstConfiguration({
      supabase: db,
      actorProfile: SUPER,
      masterAdminId: MASTER_ID,
      form: { enabled: true, ratePercent: '18', gstin: '33AAPFU0939F1Z2', pricingMode: 'exclusive' },
      now: NOW
    });
    const gs = db.rows.get(MASTER_ID).global_settings;
    assert.equal(gs.tax_settings.enabled, true);
    assert.equal(gs.tax_settings.rate, 18);
    assert.equal(gs.tax_settings.gstin, '33AAPFU0939F1Z2');
    assert.equal(gs.tax_settings.pricing_mode, 'exclusive');
  });

  test('pricing, website_pricing, razorpay_settings, and landing_page are preserved on GST save', async () => {
    const db = freshDb({ seller_identity: clone(PROD_SELLER) });
    await saveGstConfiguration({
      supabase: db,
      actorProfile: SUPER,
      masterAdminId: MASTER_ID,
      form: { enabled: false, ratePercent: '18', gstin: '33AAPFU0939F1Z2', pricingMode: 'exclusive' },
      now: NOW
    });
    const gs = db.rows.get(MASTER_ID).global_settings;
    for (const [k, v] of Object.entries(OTHER_SETTINGS)) {
      assert.deepEqual(gs[k], v, `preserved ${k}`);
    }
  });

  test('STAGE_3B_REQUIRED_SELLER_KEYS matches Stage 3B generate_saas_commercial_invoice() seller fields', () => {
    const sql = read('supabase/archived/phase_r3_stage3b_invoicing_engine.sql');
    const block = sql.slice(sql.indexOf('IF v_seller_json IS NULL OR'), sql.indexOf('MISSING_SELLER_IDENTITY'));
    const enforced = [...block.matchAll(/v_seller_json->>'([a-z_]+)'/g)].map(m => m[1]).sort();
    assert.deepEqual(enforced, [...STAGE_3B_REQUIRED_SELLER_KEYS].sort());
  });

  test('Super Admin UI contract: Trade Name is only required seller field; GST checkbox directly toggleable', () => {
    const ui = read('src/pages/SuperAdmin.jsx');
    assert.equal((ui.match(/optional: false/g) || []).length, 1, 'exactly one mandatory seller field');
    assert.match(ui, /field: 'tradeName', label: 'Trade Name', optional: false/);
    assert.match(ui, /data-testid="gst-enabled"/);
    assert.match(ui, /Enable GST for Subscriptions/);
    assert.equal(ui.includes('(locked off — requires approved activation release)'), false, 'artificial lock removed');
    assert.match(ui, /<option value="active">Active<\/option>/);
  });

  test('Super Admin UI contract: adminProfiles is declared in state and resolved safely without crashing', () => {
    const ui = read('src/pages/SuperAdmin.jsx');
    assert.match(ui, /const \[adminProfiles, setAdminProfiles\] = useState\(\[\]\);/);
    assert.match(ui, /const resolveAdminProfiles = async/);
    assert.match(ui, /setAdminProfiles\(loadedSuperAdmins\)/);
    // Ensure no naked unhandled references to adminProfiles remain
    assert.equal(ui.includes('(adminProfiles || [])'), false, 'naked adminProfiles reference removed');
  });

  test('Super Admin UI contract: status display distinguishes unsaved, persisted, and effective GST', () => {
    const ui = read('src/pages/SuperAdmin.jsx');
    assert.match(ui, /const isPersistedGstConfigured = Boolean\(gstSavedConfig\);/);
    assert.match(ui, /const isPersistedGstEffective = Boolean/);
    assert.match(ui, /const hasUnsavedGstChanges = Boolean/);
    assert.match(ui, /GST Disabled/);
    assert.match(ui, /Not Configured/);
  });

  test('Task 5: Updating GST percentage while GST remains disabled saves successfully and keeps billing non-GST', async () => {
    const db = freshDb({ seller_identity: clone(PROD_SELLER) });
    const res = await saveGstConfiguration({
      supabase: db,
      actorProfile: SUPER,
      masterAdminId: MASTER_ID,
      form: { enabled: false, ratePercent: '18', gstin: '', pricingMode: 'exclusive' },
      now: NOW
    });
    assert.equal(res.configuration.enabled, false);
    assert.equal(res.configuration.rate_percent, 18);
    assert.equal(res.configuration.status, 'disabled');
    assert.equal(isGstEffective(res.configuration, NOW).effective, false);

    // Refresh simulation: rehydrating from DB
    const saved = db.rows.get(MASTER_ID).global_settings.gst_configuration;
    const reloaded = gstFormFromDb(saved);
    assert.equal(reloaded.form.enabled, false);
    assert.equal(reloaded.form.ratePercent, '18');
    assert.equal(reloaded.form.status, 'disabled');
  });
});

// ===========================================================================
describe('H. Canonical Super Admin Profile Resolution & Dual-Admin Collaboration', () => {
  const adminPrimary = {
    id: MASTER_ID,
    role: 'super_admin',
    email: 'uhariff@gmail.com',
    created_at: '2026-09-01T00:00:00.000Z',
    global_settings: {
      pricing: { solo: 499, growth: 1499, premium: 2499 },
      seller_identity: clone(PROD_SELLER)
    }
  };

  const adminSecondary = {
    id: SECONDARY_ID,
    role: 'super_admin',
    email: 'secondadmin@staypilot.com',
    created_at: '2026-10-01T00:00:00.000Z',
    global_settings: {}
  };

  test('resolveCanonicalSuperAdmin deterministically selects fixed CANONICAL_SUPER_ADMIN_ID regardless of candidate order', () => {
    assert.equal(resolveCanonicalSuperAdmin([adminSecondary, adminPrimary])?.id, MASTER_ID);
    assert.equal(resolveCanonicalSuperAdmin([adminPrimary, adminSecondary])?.id, MASTER_ID);
    assert.equal(resolveCanonicalSuperAdmin([adminPrimary])?.id, MASTER_ID);
    assert.equal(CANONICAL_SUPER_ADMIN_ID, MASTER_ID);
  });

  test('resolveCanonicalSuperAdmin fails safely and does NOT fall back if canonical profile is absent', () => {
    const adminConfigured = {
      id: 'cfg-admin',
      role: 'super_admin',
      email: 'custom@staypilot.com',
      created_at: '2026-09-10T00:00:00.000Z',
      global_settings: { pricing: { solo: 499 } }
    };
    const adminEmpty = {
      id: 'empty-admin',
      role: 'super_admin',
      email: 'empty@staypilot.com',
      created_at: '2026-09-05T00:00:00.000Z',
      global_settings: {}
    };
    assert.equal(resolveCanonicalSuperAdmin([adminEmpty, adminConfigured]), null);
    assert.equal(resolveCanonicalSuperAdmin([adminSecondary]), null);
  });

  test('saveSellerIdentityConfig and saveGstConfiguration reject non-canonical target IDs', async () => {
    const db = freshDb();
    await assert.rejects(
      saveSellerIdentityConfig({ supabase: db, actorProfile: SUPER, masterAdminId: 'some-other-id', form: emptySellerForm(), dirty: [] }),
      /CANONICAL_PROFILE_MISMATCH/
    );
    await assert.rejects(
      saveGstConfiguration({ supabase: db, actorProfile: SUPER, masterAdminId: 'some-other-id', form: emptyGstForm() }),
      /CANONICAL_PROFILE_MISMATCH/
    );
  });

  test('Both Super Admins read and update the same canonical record without secondary sync', async () => {
    const db = freshDb({
      pricing: { solo: 499, growth: 1499, premium: 2499 },
      seller_identity: clone(PROD_SELLER),
      gst_configuration: { enabled: false, status: 'disabled', rate_percent: null }
    });
    // Add secondary admin row to fake database
    db.rows.set(SECONDARY_ID, { role: 'super_admin', email: 'secondadmin@staypilot.com', global_settings: {} });

    const actorAdmin1 = { id: MASTER_ID, role: 'super_admin', email: 'uhariff@gmail.com' };
    const actorAdmin2 = { id: SECONDARY_ID, role: 'super_admin', email: 'secondadmin@staypilot.com' };

    // Step 1: Admin 2 (secondary) updates GST settings to 18% (disabled) on canonical record
    const canonicalForAdmin2 = resolveCanonicalSuperAdmin([adminPrimary, adminSecondary]);
    assert.equal(canonicalForAdmin2.id, MASTER_ID);

    await saveGstConfiguration({
      supabase: db,
      actorProfile: actorAdmin2,
      masterAdminId: canonicalForAdmin2.id,
      form: { enabled: false, ratePercent: '18', gstin: '', pricingMode: 'exclusive' },
      now: NOW
    });

    // Step 2: Admin 1 refreshes / reads canonical settings -> sees Admin 2's update
    const canonicalForAdmin1 = resolveCanonicalSuperAdmin([adminSecondary, adminPrimary]);
    const admin1Read = db.rows.get(canonicalForAdmin1.id).global_settings;
    assert.equal(admin1Read.gst_configuration.rate_percent, 18);
    assert.equal(admin1Read.gst_configuration.enabled, false);

    // Step 3: Admin 1 updates Seller Identity Trade Name on canonical record
    await saveSellerIdentityConfig({
      supabase: db,
      actorProfile: actorAdmin1,
      masterAdminId: canonicalForAdmin1.id,
      form: { ...sellerFormFromDb(PROD_SELLER), tradeName: 'Stay Pilot Collaborative' },
      dirty: ['tradeName'],
      now: NOW
    });

    // Step 4: Admin 2 refreshes / reads canonical settings -> sees trade name change AND GST rate 18% preserved
    const admin2Read = db.rows.get(canonicalForAdmin2.id).global_settings;
    assert.equal(admin2Read.seller_identity.trade_name, 'Stay Pilot Collaborative');
    assert.equal(admin2Read.gst_configuration.rate_percent, 18);
    assert.deepEqual(admin2Read.pricing, { solo: 499, growth: 1499, premium: 2499 });

    // Step 5: Secondary admin profile in DB was NEVER polluted or modified
    assert.deepEqual(db.rows.get(SECONDARY_ID).global_settings, {});
  });
});


