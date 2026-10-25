import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';

/**
 * Server-side authorization rehearsal.
 * The function bodies below are the production definitions (read-only pg_get_functiondef,
 * 2026-10-15) of is_super_admin() and prevent_profile_privilege_escalation(), plus the
 * production RLS policies on public.profiles. Everything runs in an isolated in-memory
 * PostgreSQL; nothing here touches production.
 */
const SUPER = '9c4e65f5-c0a1-4b3a-8ed2-d01175a73409';
const BILLING = 'bbbbbbbb-0000-4000-8000-000000000001';
const SUPPORT = 'bbbbbbbb-0000-4000-8000-000000000002';
const TENANT = '3797dba7-a7fd-4ca6-86cb-b45519953947';

const SETUP = `
  CREATE SCHEMA IF NOT EXISTS auth;
  CREATE ROLE authenticated NOLOGIN;
  CREATE ROLE service_role NOLOGIN;

  CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$ SELECT NULLIF(current_setting('request.jwt.claim.role', true), '') $$;
  CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$ SELECT COALESCE(NULLIF(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;

  CREATE TABLE public.profiles (
    id uuid PRIMARY KEY,
    role text NOT NULL DEFAULT 'tenant_admin',
    tenant_id uuid,
    plan_type text DEFAULT 'free',
    subscription_status text,
    is_legacy_account boolean DEFAULT false,
    global_settings jsonb DEFAULT '{}'::jsonb
  );

  CREATE OR REPLACE FUNCTION public.is_super_admin()
   RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
  AS $function$
  BEGIN
    IF (auth.jwt() -> 'app_metadata' ->> 'role') = 'super_admin' THEN
      RETURN TRUE;
    END IF;
    RETURN EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'super_admin'
    );
  END;
  $function$;

  CREATE OR REPLACE FUNCTION public.prevent_profile_privilege_escalation()
   RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
  AS $function$
  BEGIN
    IF public.is_super_admin() OR auth.role() = 'service_role' THEN
      RETURN NEW;
    END IF;
    IF current_setting('app.allow_profile_system_update', true) = 'true' THEN
      RETURN NEW;
    END IF;
    IF NEW.role IS DISTINCT FROM OLD.role THEN
      RAISE EXCEPTION 'Privilege escalation denied: profile role cannot be modified by user.';
    END IF;
    IF NEW.tenant_id IS DISTINCT FROM OLD.tenant_id THEN
      RAISE EXCEPTION 'Privilege escalation denied: tenant_id cannot be modified by user.';
    END IF;
    IF NEW.plan_type IS DISTINCT FROM OLD.plan_type THEN
      RAISE EXCEPTION 'Privilege escalation denied: plan_type cannot be modified directly by user.';
    END IF;
    IF NEW.subscription_status IS DISTINCT FROM OLD.subscription_status THEN
      RAISE EXCEPTION 'Privilege escalation denied: subscription_status cannot be modified directly by user.';
    END IF;
    IF NEW.is_legacy_account IS DISTINCT FROM OLD.is_legacy_account THEN
      RAISE EXCEPTION 'Privilege escalation denied: is_legacy_account cannot be modified directly by user.';
    END IF;
    IF NEW.global_settings IS DISTINCT FROM OLD.global_settings THEN
      RAISE EXCEPTION 'Privilege escalation denied: global_settings cannot be modified by user.';
    END IF;
    RETURN NEW;
  END;
  $function$;

  CREATE TRIGGER trg_prevent_profile_privilege_escalation BEFORE UPDATE ON public.profiles
    FOR EACH ROW EXECUTE FUNCTION public.prevent_profile_privilege_escalation();

  ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
  CREATE POLICY "Super Admin Select Profiles" ON public.profiles FOR SELECT TO authenticated USING (is_super_admin());
  CREATE POLICY "Team Select Profiles" ON public.profiles FOR SELECT TO authenticated USING (auth.uid() = id);
  CREATE POLICY "Super Admin Update Profiles" ON public.profiles FOR UPDATE TO authenticated USING (is_super_admin());
  CREATE POLICY "User Update Self Profile" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

  GRANT USAGE ON SCHEMA public, auth TO authenticated;
  GRANT SELECT, UPDATE ON public.profiles TO authenticated;
  GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA auth TO authenticated;
  GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO authenticated;

  INSERT INTO public.profiles (id, role, global_settings) VALUES
    ('${SUPER}', 'super_admin', '{"seller_identity": {"trade_name": "Stay Pilot"}}'),
    ('${BILLING}', 'billing_admin', '{}'),
    ('${SUPPORT}', 'support_admin', '{}'),
    ('${TENANT}', 'tenant_admin', '{}');
`;

let db;
const asUser = async (uid, role = 'authenticated') => {
  await db.exec(`RESET ROLE; SELECT set_config('request.jwt.claim.sub', '${uid}', false), set_config('request.jwt.claim.role', '${role}', false); SET ROLE authenticated;`);
};
const settingsOf = async (id) => {
  await db.exec('RESET ROLE;');
  return (await db.query('SELECT global_settings FROM public.profiles WHERE id = $1', [id])).rows[0].global_settings;
};

describe('Server-side authorization for global_settings.seller_identity / gst_configuration (production trigger + RLS)', () => {
  before(async () => { db = new PGlite(); await db.exec(SETUP); });

  test('super_admin can update the master profile global_settings (seller_identity and gst_configuration)', async () => {
    await asUser(SUPER);
    const r = await db.query(`UPDATE public.profiles SET global_settings = global_settings || '{"gst_configuration": {"enabled": false, "status": "draft"}}'::jsonb WHERE id = $1 RETURNING id`, [SUPER]);
    assert.equal(r.rows.length, 1);
    assert.equal((await settingsOf(SUPER)).gst_configuration.status, 'draft');
  });

  for (const [label, uid] of [['billing_admin', BILLING], ['support_admin', SUPPORT], ['tenant_admin', TENANT]]) {
    test(`${label} cannot modify the master super_admin profile (RLS filters the row: 0 rows updated)`, async () => {
      const before = await settingsOf(SUPER);
      await asUser(uid);
      const r = await db.query(`UPDATE public.profiles SET global_settings = '{"gst_configuration": {"enabled": true, "status": "active"}}'::jsonb WHERE id = $1 RETURNING id`, [SUPER]);
      assert.equal(r.rows.length, 0);
      assert.deepEqual(await settingsOf(SUPER), before);
    });

    test(`${label} cannot modify global_settings even on their OWN profile (trigger raises)`, async () => {
      const before = await settingsOf(uid);
      await asUser(uid);
      await assert.rejects(
        db.query(`UPDATE public.profiles SET global_settings = '{"gst_configuration": {"enabled": true}}'::jsonb WHERE id = $1`, [uid]),
        /global_settings cannot be modified by user/
      );
      assert.deepEqual(await settingsOf(uid), before);
    });
  }

  test('unauthenticated (no uid) cannot modify anything', async () => {
    await db.exec(`RESET ROLE; SELECT set_config('request.jwt.claim.sub', '', false), set_config('request.jwt.claim.role', '', false); SET ROLE authenticated;`);
    const before = await settingsOf(SUPER);
    await db.exec(`SET ROLE authenticated;`);
    const r = await db.query(`UPDATE public.profiles SET global_settings = '{}'::jsonb WHERE id = $1 RETURNING id`, [SUPER]);
    assert.equal(r.rows.length, 0);
    assert.deepEqual(await settingsOf(SUPER), before);
  });
});

describe('Atomic RPC update_saas_global_configuration (concurrency, atomicity, strict auth)', () => {
  before(async () => {
    // Read and install the migration
    const fs = await import('node:fs');
    const path = await import('node:path');
    const { fileURLToPath } = await import('node:url');
    const __dirname = path.dirname(fileURLToPath(import.meta.url));
    const migrationSql = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'migrations', '20261015220000_atomic_saas_global_configuration_rpc.sql'), 'utf8');

    await db.exec("RESET ROLE; SELECT set_config('app.allow_profile_system_update', 'true', false);");
    await db.exec(migrationSql);

    // Seed master profile with rich global_settings
    await db.query(`
      UPDATE public.profiles
      SET global_settings = '{
        "pricing": {"solo": 499, "growth": 1499, "premium": 2499},
        "website_pricing": {"published": {"pro": 1499}},
        "seller_identity": {"trade_name": "Stay Pilot Original", "legal_name": "Mohamed Hassan Ariff", "state": "Tamil Nadu"},
        "gst_configuration": {"enabled": false, "status": "disabled", "rate_percent": null}
      }'::jsonb
      WHERE id = $1
    `, [SUPER]);

    // Seed secondary super_admin and revoked user
    await db.query(`INSERT INTO public.profiles (id, role, global_settings) VALUES ('a9ec6d2f-5afa-406b-87ce-109913dead89', 'super_admin', '{}'::jsonb) ON CONFLICT (id) DO UPDATE SET role = 'super_admin'`);
    await db.query(`INSERT INTO public.profiles (id, role, global_settings) VALUES ('cccccccc-0000-4000-8000-000000000001', 'tenant_admin', '{}'::jsonb) ON CONFLICT (id) DO UPDATE SET role = 'tenant_admin'`);
    await db.exec("SELECT set_config('app.allow_profile_system_update', 'false', false);");
  });

  test('Super Admin caller updates seller_identity atomically preserving pricing and GST settings', async () => {
    await asUser(SUPER);
    const newSeller = {
      trade_name: 'Stay Pilot Updated',
      legal_name: 'Mohamed Hassan Ariff',
      address: '123 Beach Road',
      state: 'Tamil Nadu',
      state_code: '33',
      city: 'Nagapattinam',
      pincode: '611001'
    };

    const res = await db.query(`
      SELECT public.update_saas_global_configuration(
        p_section => 'seller_identity',
        p_seller_identity => $1::jsonb,
        p_canonical_id => $2::uuid
      ) AS settings
    `, [JSON.stringify(newSeller), SUPER]);

    assert.equal(res.rows.length, 1);
    const settings = res.rows[0].settings;

    // Verify seller_identity is updated
    assert.equal(settings.seller_identity.trade_name, 'Stay Pilot Updated');
    assert.equal(settings.seller_identity.city, 'Nagapattinam');

    // Verify pricing and website_pricing are byte-for-byte preserved
    assert.deepEqual(settings.pricing, { solo: 499, growth: 1499, premium: 2499 });
    assert.deepEqual(settings.website_pricing, { published: { pro: 1499 } });

    // Verify gst_configuration is untouched
    assert.equal(settings.gst_configuration.enabled, false);
    assert.equal(settings.gst_configuration.status, 'disabled');
  });

  test('Super Admin caller updates gst_configuration and tax_settings preserving seller_identity and pricing', async () => {
    await asUser(SUPER);
    const newGst = {
      enabled: false,
      status: 'disabled',
      rate_percent: 18,
      pricing_mode: 'exclusive',
      gstin: ''
    };
    const newTax = {
      enabled: false,
      rate: 18,
      pricing_mode: 'exclusive'
    };

    const res = await db.query(`
      SELECT public.update_saas_global_configuration(
        p_section => 'gst_configuration',
        p_gst_configuration => $1::jsonb,
        p_tax_settings => $2::jsonb,
        p_canonical_id => $3::uuid
      ) AS settings
    `, [JSON.stringify(newGst), JSON.stringify(newTax), SUPER]);

    assert.equal(res.rows.length, 1);
    const settings = res.rows[0].settings;

    // Verify gst_configuration & tax_settings updated
    assert.equal(settings.gst_configuration.rate_percent, 18);
    assert.equal(settings.tax_settings.rate, 18);

    // Verify seller_identity was NOT clobbered and retains previous update
    assert.equal(settings.seller_identity.trade_name, 'Stay Pilot Updated');
    assert.equal(settings.seller_identity.city, 'Nagapattinam');

    // Verify pricing preserved
    assert.deepEqual(settings.pricing, { solo: 499, growth: 1499, premium: 2499 });
  });

  for (const [label, uid] of [['billing_admin', BILLING], ['support_admin', SUPPORT], ['tenant_admin', TENANT]]) {
    test(`Non-super admin (${label}) is rejected by update_saas_global_configuration with error 42501`, async () => {
      const before = await settingsOf(SUPER);
      await asUser(uid);

      await assert.rejects(
        db.query(`
          SELECT public.update_saas_global_configuration(
            p_section => 'seller_identity',
            p_seller_identity => '{"trade_name": "Hacked"}'::jsonb,
            p_canonical_id => $1::uuid
          )
        `, [SUPER]),
        (err) => {
          assert.equal(err.code, '42501');
          assert.match(err.message, /FORBIDDEN/);
          return true;
        }
      );

      // Verify canonical profile unchanged
      assert.deepEqual(await settingsOf(SUPER), before);
    });
  }

  test('Unauthenticated caller is rejected by update_saas_global_configuration with error 42501', async () => {
    const before = await settingsOf(SUPER);
    await db.exec(`RESET ROLE; SELECT set_config('request.jwt.claim.sub', '', false), set_config('request.jwt.claim.role', '', false); SET ROLE authenticated;`);

    await assert.rejects(
      db.query(`
        SELECT public.update_saas_global_configuration(
          p_section => 'seller_identity',
          p_seller_identity => '{"trade_name": "Hacked"}'::jsonb,
          p_canonical_id => $1::uuid
        )
      `, [SUPER]),
      (err) => {
        assert.equal(err.code, '42501');
        assert.match(err.message, /UNAUTHORIZED/);
        return true;
      }
    );

    assert.deepEqual(await settingsOf(SUPER), before);
  });

  test('Targeting a non-canonical profile ID (even another Super Admin) raises INVALID_TARGET with error 42501', async () => {
    await asUser(SUPER);
    const SECONDARY_ADMIN = 'a9ec6d2f-5afa-406b-87ce-109913dead89';

    await assert.rejects(
      db.query(`
        SELECT public.update_saas_global_configuration(
          p_section => 'seller_identity',
          p_seller_identity => '{"trade_name": "Hijacked"}'::jsonb,
          p_canonical_id => $1::uuid
        )
      `, [SECONDARY_ADMIN]),
      (err) => {
        assert.equal(err.code, '42501');
        assert.match(err.message, /INVALID_TARGET/);
        return true;
      }
    );

    // Verify secondary admin was not modified
    assert.deepEqual(await settingsOf(SECONDARY_ADMIN), {});
  });

  test('Targeting a non-existent UUID raises INVALID_TARGET with error 42501', async () => {
    await asUser(SUPER);
    const nonExistentId = '11111111-2222-3333-4444-555555555555';

    await assert.rejects(
      db.query(`
        SELECT public.update_saas_global_configuration(
          p_section => 'seller_identity',
          p_seller_identity => '{"trade_name": "Test"}'::jsonb,
          p_canonical_id => $1::uuid
        )
      `, [nonExistentId]),
      (err) => {
        assert.equal(err.code, '42501');
        assert.match(err.message, /INVALID_TARGET/);
        return true;
      }
    );
  });

  test('Caller with stale JWT role (role revoked in profiles table) is rejected with FORBIDDEN (42501)', async () => {
    const REVOKED_USER = 'cccccccc-0000-4000-8000-000000000001';

    // Simulate stale JWT having app_metadata.role = 'super_admin', while DB role is tenant_admin
    await db.exec(`
      RESET ROLE;
      SELECT set_config('request.jwt.claim.sub', '${REVOKED_USER}', false),
             set_config('request.jwt.claim.role', 'authenticated', false),
             set_config('request.jwt.claims', '{"app_metadata": {"role": "super_admin"}}', false);
      SET ROLE authenticated;
    `);

    await assert.rejects(
      db.query(`
        SELECT public.update_saas_global_configuration(
          p_section => 'seller_identity',
          p_seller_identity => '{"trade_name": "RevokedAttempt"}'::jsonb,
          p_canonical_id => $1::uuid
        )
      `, [SUPER]),
      (err) => {
        assert.equal(err.code, '42501');
        assert.match(err.message, /FORBIDDEN/);
        return true;
      }
    );
  });

  test('Malformed JSONB arguments (strings, arrays, numbers, nulls) are rejected with INVALID_ARGUMENT (22023)', async () => {
    await asUser(SUPER);

    for (const bad of ['"just a string"', '[1, 2, 3]', '123', 'null']) {
      await assert.rejects(
        db.query(`
          SELECT public.update_saas_global_configuration(
            p_section => 'seller_identity',
            p_seller_identity => $1::jsonb,
            p_canonical_id => $2::uuid
          )
        `, [bad, SUPER]),
        (err) => {
          assert.equal(err.code, '22023');
          assert.match(err.message, /INVALID_ARGUMENT/);
          return true;
        }
      );

      await assert.rejects(
        db.query(`
          SELECT public.update_saas_global_configuration(
            p_section => 'gst_configuration',
            p_gst_configuration => $1::jsonb,
            p_canonical_id => $2::uuid
          )
        `, [bad, SUPER]),
        (err) => {
          assert.equal(err.code, '22023');
          assert.match(err.message, /INVALID_ARGUMENT/);
          return true;
        }
      );
    }

    // Invalid p_tax_settings
    await assert.rejects(
      db.query(`
        SELECT public.update_saas_global_configuration(
          p_section => 'gst_configuration',
          p_gst_configuration => '{"enabled": false}'::jsonb,
          p_tax_settings => '"not an object"'::jsonb,
          p_canonical_id => $1::uuid
        )
      `, [SUPER]),
      (err) => {
        assert.equal(err.code, '22023');
        assert.match(err.message, /INVALID_ARGUMENT/);
        return true;
      }
    );
  });

  test('Invalid section name raises INVALID_SECTION error (22023)', async () => {
    await asUser(SUPER);

    await assert.rejects(
      db.query(`
        SELECT public.update_saas_global_configuration(
          p_section => 'arbitrary_section',
          p_canonical_id => $1::uuid
        )
      `, [SUPER]),
      (err) => {
        assert.equal(err.code, '22023');
        assert.match(err.message, /INVALID_SECTION/);
        return true;
      }
    );
  });

  test('Concurrent updates from two Super Admin sessions preserve both updates and untouched keys', async () => {
    const ADMIN1 = SUPER;
    const ADMIN2 = 'a9ec6d2f-5afa-406b-87ce-109913dead89';

    // Admin 1 updates seller identity
    await asUser(ADMIN1);
    await db.query(`
      SELECT public.update_saas_global_configuration(
        p_section => 'seller_identity',
        p_seller_identity => '{"trade_name": "Stay Pilot Admin 1", "state": "Tamil Nadu"}'::jsonb,
        p_canonical_id => $1::uuid
      )
    `, [SUPER]);

    // Admin 2 concurrently updates GST settings
    await asUser(ADMIN2);
    await db.query(`
      SELECT public.update_saas_global_configuration(
        p_section => 'gst_configuration',
        p_gst_configuration => '{"enabled": false, "status": "disabled", "rate_percent": 18}'::jsonb,
        p_tax_settings => '{"enabled": false, "rate": 18}'::jsonb,
        p_canonical_id => $1::uuid
      )
    `, [SUPER]);

    // Read canonical settings
    const finalSettings = await settingsOf(SUPER);

    // Verify Admin 1's changes preserved
    assert.equal(finalSettings.seller_identity.trade_name, 'Stay Pilot Admin 1');
    assert.equal(finalSettings.seller_identity.state, 'Tamil Nadu');

    // Verify Admin 2's changes preserved
    assert.equal(finalSettings.gst_configuration.rate_percent, 18);
    assert.equal(finalSettings.tax_settings.rate, 18);

    // Verify pricing preserved untouched
    assert.deepEqual(finalSettings.pricing, { solo: 499, growth: 1499, premium: 2499 });
  });

  test('Legacy writers: pricing section update via RPC succeeds and preserves all other keys', async () => {
    await asUser(SUPER);
    const newPricing = { solo: 599, growth: 1699, premium: 2999 };

    await db.query(`
      SELECT public.update_saas_global_configuration(
        p_section => 'pricing',
        p_pricing => $1::jsonb,
        p_canonical_id => $2::uuid
      )
    `, [JSON.stringify(newPricing), SUPER]);

    const s = await settingsOf(SUPER);
    assert.deepEqual(s.pricing, newPricing);
    assert.ok(s.seller_identity, 'seller_identity preserved');
    assert.ok(s.gst_configuration, 'gst_configuration preserved');
  });

  test('Legacy writers: website_pricing update via RPC succeeds and updates both draft/published and pricing', async () => {
    await asUser(SUPER);
    const wp = { draft: { solo: { monthlyPrice: 599 } }, published: { solo: { monthlyPrice: 599 } }, currentVersion: 2 };
    const pr = { solo: 599, growth: 1699, premium: 2999 };

    await db.query(`
      SELECT public.update_saas_global_configuration(
        p_section => 'website_pricing',
        p_website_pricing => $1::jsonb,
        p_pricing => $2::jsonb,
        p_canonical_id => $3::uuid
      )
    `, [JSON.stringify(wp), JSON.stringify(pr), SUPER]);

    const s = await settingsOf(SUPER);
    assert.deepEqual(s.website_pricing, wp);
    assert.deepEqual(s.pricing, pr);
  });

  test('Legacy writers: razorpay_settings rejects secret keys with SECURITY_VIOLATION (42501)', async () => {
    await asUser(SUPER);

    for (const secretKey of ['testKeySecret', 'liveKeySecret', 'webhookSecret']) {
      await assert.rejects(
        db.query(`
          SELECT public.update_saas_global_configuration(
            p_section => 'razorpay_settings',
            p_razorpay_settings => $1::jsonb,
            p_canonical_id => $2::uuid
          )
        `, [JSON.stringify({ mode: 'test', testKeyId: 'rzp_test_123', [secretKey]: 'forbidden_secret_value' }), SUPER]),
        (err) => {
          assert.equal(err.code, '42501');
          assert.match(err.message, /SECURITY_VIOLATION/);
          return true;
        }
      );
    }

    // Valid public keys succeed and are sanitized
    await db.query(`
      SELECT public.update_saas_global_configuration(
        p_section => 'razorpay_settings',
        p_razorpay_settings => '{"mode": "test", "testKeyId": "rzp_test_valid", "liveKeyId": ""}'::jsonb,
        p_canonical_id => $1::uuid
      )
    `, [SUPER]);

    const s = await settingsOf(SUPER);
    assert.deepEqual(s.razorpay_settings, { mode: 'test', testKeyId: 'rzp_test_valid', liveKeyId: '' });
  });

  test('Legacy writers: features section updates communication and template feature flags', async () => {
    await asUser(SUPER);

    await db.query(`
      SELECT public.update_saas_global_configuration(
        p_section => 'features',
        p_features => '{"comm_features_enabled": false, "templates_enabled": false, "onboarding_wizard_enabled": true}'::jsonb,
        p_canonical_id => $1::uuid
      )
    `, [SUPER]);

    const s = await settingsOf(SUPER);
    assert.equal(s.comm_features_enabled, false);
    assert.equal(s.templates_enabled, false);
    assert.equal(s.onboarding_wizard_enabled, true);
  });

  test('Legacy writers: tax_settings update enforces consistency with active GST configuration', async () => {
    await asUser(SUPER);

    // 1. When GST is active, tax_settings must retain active GST rate and gstin
    await db.query(`
      SELECT public.update_saas_global_configuration(
        p_section => 'gst_configuration',
        p_gst_configuration => '{"enabled": true, "status": "active", "rate_percent": 18, "gstin": "33ABCDE1234F1Z5", "pricing_mode": "exclusive"}'::jsonb,
        p_tax_settings => '{"enabled": true, "rate": 18, "gstin": "33ABCDE1234F1Z5", "pricing_mode": "exclusive"}'::jsonb,
        p_canonical_id => $1::uuid
      )
    `, [SUPER]);

    // Admin attempts to save tax_settings with rate: 0 or disabled while GST is active
    await db.query(`
      SELECT public.update_saas_global_configuration(
        p_section => 'tax_settings',
        p_tax_settings => '{"enabled": false, "rate": 0, "gstin": ""}'::jsonb,
        p_canonical_id => $1::uuid
      )
    `, [SUPER]);

    const s = await settingsOf(SUPER);
    // Verified: RPC maintained active GST consistency
    assert.equal(s.tax_settings.enabled, true);
    assert.equal(s.tax_settings.rate, 18);
    assert.equal(s.tax_settings.gstin, '33ABCDE1234F1Z5');
  });

  test('Concurrent updates: Pricing save and GST save do not clobber each other', async () => {
    const ADMIN1 = SUPER;
    const ADMIN2 = 'a9ec6d2f-5afa-406b-87ce-109913dead89';

    // Admin 1 updates pricing
    await asUser(ADMIN1);
    await db.query(`
      SELECT public.update_saas_global_configuration(
        p_section => 'pricing',
        p_pricing => '{"solo": 799, "growth": 1999, "premium": 3499}'::jsonb,
        p_canonical_id => $1::uuid
      )
    `, [SUPER]);

    // Admin 2 updates razorpay_settings
    await asUser(ADMIN2);
    await db.query(`
      SELECT public.update_saas_global_configuration(
        p_section => 'razorpay_settings',
        p_razorpay_settings => '{"mode": "live", "testKeyId": "rzp_test_preserved", "liveKeyId": "rzp_live_new"}'::jsonb,
        p_canonical_id => $1::uuid
      )
    `, [SUPER]);

    const finalSettings = await settingsOf(SUPER);
    assert.deepEqual(finalSettings.pricing, { solo: 799, growth: 1999, premium: 3499 });
    assert.equal(finalSettings.razorpay_settings.liveKeyId, 'rzp_live_new');
    assert.equal(finalSettings.razorpay_settings.mode, 'live');
    // Seller identity remains intact
    assert.ok(finalSettings.seller_identity);
  });

  test('Issue 1: GST save with omitted p_tax_settings preserves existing tax_settings keys and keeps consistency', async () => {
    await asUser(SUPER);

    // 1. Seed tax_settings with custom non-destructive keys
    await db.query(`
      SELECT public.update_saas_global_configuration(
        p_section => 'tax_settings',
        p_tax_settings => '{"enabled": false, "rate": 0, "hsn_code": "998313", "custom_tax_note": "Exempt"}'::jsonb,
        p_canonical_id => $1::uuid
      )
    `, [SUPER]);

    // 2. Save GST configuration without passing p_tax_settings (p_tax_settings is DEFAULT NULL)
    await db.query(`
      SELECT public.update_saas_global_configuration(
        p_section => 'gst_configuration',
        p_gst_configuration => '{"enabled": false, "status": "draft", "rate_percent": null}'::jsonb,
        p_canonical_id => $1::uuid
      )
    `, [SUPER]);

    const s1 = await settingsOf(SUPER);
    // Custom keys hsn_code and custom_tax_note MUST be preserved, not wiped to {}!
    assert.equal(s1.tax_settings.hsn_code, '998313');
    assert.equal(s1.tax_settings.custom_tax_note, 'Exempt');
    assert.equal(s1.tax_settings.enabled, false);

    // 3. Save active GST without p_tax_settings
    await db.query(`
      SELECT public.update_saas_global_configuration(
        p_section => 'gst_configuration',
        p_gst_configuration => '{"enabled": true, "status": "active", "rate_percent": 18, "gstin": "33ABCDE1234F1Z5", "pricing_mode": "inclusive"}'::jsonb,
        p_canonical_id => $1::uuid
      )
    `, [SUPER]);

    const s2 = await settingsOf(SUPER);
    // Verified: custom keys preserved AND tax_settings synchronized with active GST
    assert.equal(s2.tax_settings.hsn_code, '998313');
    assert.equal(s2.tax_settings.enabled, true);
    assert.equal(s2.tax_settings.rate, 18);
    assert.equal(s2.tax_settings.gstin, '33ABCDE1234F1Z5');
    assert.equal(s2.tax_settings.pricing_mode, 'inclusive');
  });

  test('Issue 2: Razorpay save preserves approved non-secret settings and rejects secret credentials', async () => {
    await asUser(SUPER);

    // 1. Initial configuration with approved extra non-secret keys
    await db.query(`
      SELECT public.update_saas_global_configuration(
        p_section => 'razorpay_settings',
        p_razorpay_settings => '{"mode": "test", "testKeyId": "rzp_test_123", "liveKeyId": "rzp_live_abc", "plan_catalog_version": 4, "webhook_endpoint_id": "ep_001"}'::jsonb,
        p_canonical_id => $1::uuid
      )
    `, [SUPER]);

    // 2. Partial update to only change liveKeyId
    await db.query(`
      SELECT public.update_saas_global_configuration(
        p_section => 'razorpay_settings',
        p_razorpay_settings => '{"liveKeyId": "rzp_live_updated"}'::jsonb,
        p_canonical_id => $1::uuid
      )
    `, [SUPER]);

    const s = await settingsOf(SUPER);
    // Approved non-secret settings preserved
    assert.equal(s.razorpay_settings.plan_catalog_version, 4);
    assert.equal(s.razorpay_settings.webhook_endpoint_id, 'ep_001');
    assert.equal(s.razorpay_settings.testKeyId, 'rzp_test_123');
    assert.equal(s.razorpay_settings.liveKeyId, 'rzp_live_updated');
    assert.equal(s.razorpay_settings.mode, 'test');

    // 3. Strict rejection of secret credentials
    for (const secretKey of ['testKeySecret', 'liveKeySecret', 'webhookSecret', 'secret', 'key_secret']) {
      await assert.rejects(
        db.query(`
          SELECT public.update_saas_global_configuration(
            p_section => 'razorpay_settings',
            p_razorpay_settings => $1::jsonb,
            p_canonical_id => $2::uuid
          )
        `, [JSON.stringify({ [secretKey]: 'leaked_secret_val' }), SUPER]),
        (err) => {
          assert.equal(err.code, '42501');
          assert.match(err.message, /SECURITY_VIOLATION/);
          return true;
        }
      );
    }
  });

  test('Issue 3: Pricing concurrency preserves plan IDs, offer prices, feature limits, and website history', async () => {
    await asUser(SUPER);

    // 1. Seed pricing with Razorpay plan ID, feature limits, offer dates
    const initialPricing = {
      solo: {
        price: 999,
        offerPrice: 499,
        offerActive: true,
        maxRooms: 10,
        maxResorts: 1,
        razorpay_test_plan_id: "plan_TlFZmzyuVDNq29",
        razorpay_test_price: 49900
      },
      pro: {
        price: 2499,
        offerPrice: 1499,
        maxRooms: 30,
        razorpay_test_plan_id: "plan_TlGfWK7wQIQE4F"
      }
    };

    await db.query(`
      SELECT public.update_saas_global_configuration(
        p_section => 'pricing',
        p_pricing => $1::jsonb,
        p_canonical_id => $2::uuid
      )
    `, [JSON.stringify(initialPricing), SUPER]);

    // 2. Admin 1 updates Solo pricing (price and offer)
    await db.query(`
      SELECT public.update_saas_global_configuration(
        p_section => 'pricing',
        p_pricing => '{"solo": {"price": 1099, "offerPrice": 599}}'::jsonb,
        p_canonical_id => $1::uuid
      )
    `, [SUPER]);

    const s1 = await settingsOf(SUPER);
    // Verified: solo price updated, BUT razorpay_test_plan_id and maxRooms preserved!
    assert.equal(s1.pricing.solo.price, 1099);
    assert.equal(s1.pricing.solo.offerPrice, 599);
    assert.equal(s1.pricing.solo.razorpay_test_plan_id, 'plan_TlFZmzyuVDNq29');
    assert.equal(s1.pricing.solo.maxRooms, 10);
    // Unmentioned pro plan preserved
    assert.equal(s1.pricing.pro.razorpay_test_plan_id, 'plan_TlGfWK7wQIQE4F');

    // 3. Admin 2 concurrently updates website_pricing without p_pricing
    await db.query(`
      SELECT public.update_saas_global_configuration(
        p_section => 'website_pricing',
        p_website_pricing => '{"published": {"solo": {"monthlyPrice": 599}}, "history": [{"version": 9, "publishedAt": "2026-10-16"}]}'::jsonb,
        p_canonical_id => $1::uuid
      )
    `, [SUPER]);

    const s2 = await settingsOf(SUPER);
    // Verified: website pricing published, history preserved, and pricing was NOT overwritten
    assert.equal(s2.website_pricing.history[0].version, 9);
    assert.equal(s2.pricing.solo.price, 1099);
    assert.equal(s2.pricing.solo.razorpay_test_plan_id, 'plan_TlFZmzyuVDNq29');
  });

  test('Requirement 8: Database-side validation for GST activation, disabled, draft, scheduled, and active states', async () => {
    await asUser(SUPER);

    // 1. Invalid activation: invalid rate (> 50 or <= 0 or invalid format)
    for (const badRate of [-5, 0, 55, 'invalid', '18.123']) {
      await assert.rejects(
        db.query(`
          SELECT public.update_saas_global_configuration(
            p_section => 'gst_configuration',
            p_gst_configuration => $1::jsonb,
            p_canonical_id => $2::uuid
          )
        `, [JSON.stringify({
          enabled: true,
          status: 'active',
          rate_percent: badRate,
          pricing_mode: 'exclusive',
          gstin: '33ABCDE1234F1Z5'
        }), SUPER]),
        (err) => {
          assert.equal(err.code, '22023');
          assert.match(err.message, /GST percentage is required/);
          return true;
        }
      );
    }

    // 2. Invalid activation: invalid pricing_mode
    await assert.rejects(
      db.query(`
        SELECT public.update_saas_global_configuration(
          p_section => 'gst_configuration',
          p_gst_configuration => $1::jsonb,
          p_canonical_id => $2::uuid
        )
      `, [JSON.stringify({
        enabled: true,
        status: 'active',
        rate_percent: 18,
        pricing_mode: 'invalid_mode',
        gstin: '33ABCDE1234F1Z5'
      }), SUPER]),
      (err) => {
        assert.equal(err.code, '22023');
        assert.match(err.message, /Pricing mode is required/);
        return true;
      }
    );

    // 3. Invalid activation: invalid GSTIN format
    for (const badGstin of ['123', '33ABCDE1234F1Z', '33ABCDE1234F1Z55']) {
      await assert.rejects(
        db.query(`
          SELECT public.update_saas_global_configuration(
            p_section => 'gst_configuration',
            p_gst_configuration => $1::jsonb,
            p_canonical_id => $2::uuid
          )
        `, [JSON.stringify({
          enabled: true,
          status: 'active',
          rate_percent: 18,
          pricing_mode: 'exclusive',
          gstin: badGstin
        }), SUPER]),
        (err) => {
          assert.equal(err.code, '22023');
          assert.match(err.message, /GSTIN is required/);
          return true;
        }
      );
    }

    // 4. Invalid activation: invalid effective_from timestamp
    await assert.rejects(
      db.query(`
        SELECT public.update_saas_global_configuration(
          p_section => 'gst_configuration',
          p_gst_configuration => $1::jsonb,
          p_canonical_id => $2::uuid
        )
      `, [JSON.stringify({
        enabled: true,
        status: 'active',
        rate_percent: 18,
        pricing_mode: 'exclusive',
        gstin: '33ABCDE1234F1Z5',
        effective_from: 'not-a-valid-date'
      }), SUPER]),
      (err) => {
        assert.equal(err.code, '22023');
        assert.match(err.message, /Effective From must be a valid date/);
        return true;
      }
    );

    // 5. Invalid activation: GSTIN state code mismatch with seller state code
    await assert.rejects(
      db.query(`
        SELECT public.update_saas_global_configuration(
          p_section => 'gst_configuration',
          p_gst_configuration => $1::jsonb,
          p_canonical_id => $2::uuid
        )
      `, [JSON.stringify({
        enabled: true,
        status: 'active',
        rate_percent: 18,
        pricing_mode: 'exclusive',
        gstin: '27ABCDE1234F1Z5'
      }), SUPER]),
      (err) => {
        assert.equal(err.code, '22023');
        assert.match(err.message, /GSTIN state code/);
        return true;
      }
    );

    // 6. Invalid activation: Incomplete seller identity
    await db.query(`
      SELECT public.update_saas_global_configuration(
        p_section => 'seller_identity',
        p_seller_identity => '{"legal_name": "Stay Pilot", "address": "", "city": "Chennai", "state": "Tamil Nadu", "pincode": "600001", "state_code": "33"}'::jsonb,
        p_canonical_id => $1::uuid
      )
    `, [SUPER]);

    await assert.rejects(
      db.query(`
        SELECT public.update_saas_global_configuration(
          p_section => 'gst_configuration',
          p_gst_configuration => $1::jsonb,
          p_canonical_id => $2::uuid
        )
      `, [JSON.stringify({
        enabled: true,
        status: 'active',
        rate_percent: 18,
        pricing_mode: 'exclusive',
        gstin: '33ABCDE1234F1Z5'
      }), SUPER]),
      (err) => {
        assert.equal(err.code, '22023');
        assert.match(err.message, /Seller details required for GST activation are incomplete/);
        return true;
      }
    );

    // Restore complete seller identity
    await db.query(`
      SELECT public.update_saas_global_configuration(
        p_section => 'seller_identity',
        p_seller_identity => '{"legal_name": "Stay Pilot Private Limited", "trade_name": "Stay Pilot", "address": "123 Beach Road", "city": "Nagapattinam", "state": "Tamil Nadu", "pincode": "611001", "state_code": "33"}'::jsonb,
        p_canonical_id => $1::uuid
      )
    `, [SUPER]);

    // 7. State: Draft / Pending verification -> tax_settings.enabled MUST be false
    await db.query(`
      SELECT public.update_saas_global_configuration(
        p_section => 'gst_configuration',
        p_gst_configuration => '{"enabled": true, "status": "draft", "rate_percent": 18, "pricing_mode": "exclusive", "gstin": "33ABCDE1234F1Z5"}'::jsonb,
        p_canonical_id => $1::uuid
      )
    `, [SUPER]);
    let s = await settingsOf(SUPER);
    assert.equal(s.gst_configuration.status, 'draft');
    assert.equal(s.tax_settings.enabled, false);

    await db.query(`
      SELECT public.update_saas_global_configuration(
        p_section => 'gst_configuration',
        p_gst_configuration => '{"enabled": true, "status": "pending_verification", "rate_percent": 18, "pricing_mode": "exclusive", "gstin": "33ABCDE1234F1Z5"}'::jsonb,
        p_canonical_id => $1::uuid
      )
    `, [SUPER]);
    s = await settingsOf(SUPER);
    assert.equal(s.gst_configuration.status, 'pending_verification');
    assert.equal(s.tax_settings.enabled, false);

    // 8. State: GST Disabled -> tax_settings.enabled MUST be false
    await db.query(`
      SELECT public.update_saas_global_configuration(
        p_section => 'gst_configuration',
        p_gst_configuration => '{"enabled": false, "status": "disabled", "rate_percent": 18, "pricing_mode": "exclusive", "gstin": "33ABCDE1234F1Z5"}'::jsonb,
        p_canonical_id => $1::uuid
      )
    `, [SUPER]);
    s = await settingsOf(SUPER);
    assert.equal(s.gst_configuration.enabled, false);
    assert.equal(s.tax_settings.enabled, false);

    // 9. State: Tax settings independent activation guard (Attempting to enable tax_settings when GST is disabled)
    await db.query(`
      SELECT public.update_saas_global_configuration(
        p_section => 'tax_settings',
        p_tax_settings => '{"enabled": true, "rate": 18, "gstin": "33ABCDE1234F1Z5", "pricing_mode": "exclusive"}'::jsonb,
        p_canonical_id => $1::uuid
      )
    `, [SUPER]);
    s = await settingsOf(SUPER);
    // tax_settings.enabled MUST be forced to false!
    assert.equal(s.tax_settings.enabled, false);

    // 10. State: Scheduled GST (effective_from in future)
    const futureDate = '2099-01-01T00:00:00.000Z';
    await db.query(`
      SELECT public.update_saas_global_configuration(
        p_section => 'gst_configuration',
        p_gst_configuration => $1::jsonb,
        p_canonical_id => $2::uuid
      )
    `, [JSON.stringify({
      enabled: true,
      status: 'active',
      rate_percent: 18,
      pricing_mode: 'exclusive',
      gstin: '33ABCDE1234F1Z5',
      effective_from: futureDate
    }), SUPER]);
    s = await settingsOf(SUPER);
    assert.equal(s.gst_configuration.status, 'active');
    assert.equal(s.gst_configuration.effective_from, futureDate);
    assert.equal(s.tax_settings.effective_from, futureDate);
    assert.equal(s.tax_settings.enabled, true);

    // 11. State: Active GST
    await db.query(`
      SELECT public.update_saas_global_configuration(
        p_section => 'gst_configuration',
        p_gst_configuration => $1::jsonb,
        p_canonical_id => $2::uuid
      )
    `, [JSON.stringify({
      enabled: true,
      status: 'active',
      rate_percent: 18,
      pricing_mode: 'exclusive',
      gstin: '33ABCDE1234F1Z5'
    }), SUPER]);
    s = await settingsOf(SUPER);
    assert.equal(s.gst_configuration.enabled, true);
    assert.equal(s.gst_configuration.status, 'active');
    assert.equal(s.tax_settings.enabled, true);
    assert.equal(s.tax_settings.rate, 18);
    assert.equal(s.tax_settings.gstin, '33ABCDE1234F1Z5');
    assert.equal(s.tax_settings.pricing_mode, 'exclusive');
  });
});
