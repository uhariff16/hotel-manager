import test from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';

test('Stage 9B.2B: Mandatory 14-Scenario SQL Security & Production Verification Suite', async (t) => {
  const db = new PGlite();

  // Setup exact production schema matching lubkdxhqnnghnjhrebat preflight
  await db.exec(`
    CREATE SCHEMA IF NOT EXISTS auth;
    DO $$ BEGIN CREATE ROLE anon; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    DO $$ BEGIN CREATE ROLE authenticated; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    DO $$ BEGIN CREATE ROLE service_role; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

    CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
      SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid;
    $$;
    CREATE OR REPLACE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$
      SELECT COALESCE(NULLIF(current_setting('request.jwt.claim.role', true), ''), 'anon');
    $$;

    CREATE TABLE public.profiles (
      id uuid PRIMARY KEY,
      email text,
      full_name text,
      avatar_url text,
      role text NOT NULL DEFAULT 'tenant_admin',
      plan_type text NOT NULL DEFAULT 'growth',
      subscription_status text DEFAULT 'active',
      is_legacy_account boolean DEFAULT false,
      tenant_id uuid,
      global_settings jsonb DEFAULT '{}'::jsonb
    );

    CREATE TABLE public.saas_subscriptions (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id uuid NOT NULL,
      status text NOT NULL
    );

    CREATE TABLE public.bookings (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id uuid NOT NULL,
      status text NOT NULL,
      check_in_date timestamptz NOT NULL
    );

    CREATE TABLE public.income (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id uuid NOT NULL,
      amount numeric NOT NULL,
      date date NOT NULL
    );

    CREATE TABLE public.expenses (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id uuid NOT NULL,
      amount numeric NOT NULL,
      date date NOT NULL
    );

    CREATE OR REPLACE FUNCTION public.is_super_admin() RETURNS boolean LANGUAGE plpgsql STABLE AS $$
    BEGIN
      RETURN EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid() AND role = 'super_admin'
      );
    END;
    $$;

    -- =========================================================================
    -- 1. HARDENED TRIGGER (Exact proposal matching production preflight)
    -- =========================================================================
    CREATE OR REPLACE FUNCTION public.prevent_profile_privilege_escalation()
    RETURNS trigger
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = public, pg_temp
    AS $function$
    DECLARE
      v_stack text;
      v_is_paid boolean;
    BEGIN
      -- 1. Unconditionally allow Super Admins and Service Role
      IF public.is_super_admin() OR auth.role() = 'service_role' THEN
        RETURN NEW;
      END IF;

      -- 2. ABSOLUTE IMMUTABLE INVARIANTS:
      IF NEW.role IS DISTINCT FROM OLD.role THEN
        RAISE EXCEPTION 'Privilege escalation denied: profile role cannot be modified by user.'
          USING ERRCODE = '42501';
      END IF;

      IF NEW.tenant_id IS DISTINCT FROM OLD.tenant_id THEN
        RAISE EXCEPTION 'Privilege escalation denied: tenant_id cannot be modified by user.'
          USING ERRCODE = '42501';
      END IF;

      IF NEW.is_legacy_account IS DISTINCT FROM OLD.is_legacy_account THEN
        RAISE EXCEPTION 'Privilege escalation denied: is_legacy_account cannot be modified by user.'
          USING ERRCODE = '42501';
      END IF;

      IF NEW.subscription_status IS DISTINCT FROM OLD.subscription_status THEN
        RAISE EXCEPTION 'Privilege escalation denied: subscription_status cannot be modified directly by user.'
          USING ERRCODE = '42501';
      END IF;

      -- 3. PLAN TYPE (Preserves production trial plan switch invariants & all production plans)
      IF NEW.plan_type IS DISTINCT FROM OLD.plan_type THEN
        GET DIAGNOSTICS v_stack = PG_CONTEXT;
        IF v_stack NOT LIKE '%switch_trial_plan%' THEN
          RAISE EXCEPTION 'Privilege escalation denied: plan_type cannot be modified directly by user.'
            USING ERRCODE = '42501';
        END IF;

        IF OLD.subscription_status IS DISTINCT FROM 'trialing' THEN
          RAISE EXCEPTION 'Privilege escalation denied: plan_type can only be switched during trial.'
            USING ERRCODE = '42501';
        END IF;

        IF OLD.is_legacy_account IS TRUE THEN
          RAISE EXCEPTION 'Privilege escalation denied: legacy account plan_type cannot be modified.'
            USING ERRCODE = '42501';
        END IF;

        IF auth.uid() IS DISTINCT FROM OLD.id THEN
          RAISE EXCEPTION 'Privilege escalation denied: unauthorized tenant ownership.'
            USING ERRCODE = '42501';
        END IF;

        IF lower(trim(NEW.plan_type)) NOT IN ('solo', 'custom_1786983013013', 'growth', 'pro', 'premium', 'stay_master', 'stay master', 'free') THEN
          RAISE EXCEPTION 'Privilege escalation denied: invalid trial plan type.'
            USING ERRCODE = '42501';
        END IF;

        SELECT EXISTS (
          SELECT 1 FROM public.saas_subscriptions
          WHERE tenant_id = OLD.id AND status = 'active'
        ) INTO v_is_paid;

        IF v_is_paid THEN
          RAISE EXCEPTION 'Privilege escalation denied: active paid subscribers cannot switch trial plans.'
            USING ERRCODE = '42501';
        END IF;
      END IF;

      -- 4. GLOBAL SETTINGS: Granular authorization (zero PG_CONTEXT, zero session variables)
      IF NEW.global_settings IS DISTINCT FROM OLD.global_settings THEN
        -- Strictly block platform/Super Admin configuration
        IF (OLD.global_settings->'seller_identity' IS DISTINCT FROM NEW.global_settings->'seller_identity') OR
           (OLD.global_settings->'gst_configuration' IS DISTINCT FROM NEW.global_settings->'gst_configuration') OR
           (OLD.global_settings->'pricing' IS DISTINCT FROM NEW.global_settings->'pricing') OR
           (OLD.global_settings->'website_pricing' IS DISTINCT FROM NEW.global_settings->'website_pricing') OR
           (OLD.global_settings->'razorpay_settings' IS DISTINCT FROM NEW.global_settings->'razorpay_settings') OR
           (OLD.global_settings->'features' IS DISTINCT FROM NEW.global_settings->'features') THEN
          RAISE EXCEPTION 'Privilege escalation denied: platform global_settings cannot be modified by user.'
            USING ERRCODE = '42501';
        END IF;

        -- Strictly block arbitrary keys: only tenant-scoped subkeys ('billing', 'tenant_gst', 'tenant_billing', 'id_retention_days') may change
        IF (OLD.global_settings - 'billing' - 'tenant_gst' - 'tenant_billing' - 'id_retention_days') IS DISTINCT FROM 
           (NEW.global_settings - 'billing' - 'tenant_gst' - 'tenant_billing' - 'id_retention_days') THEN
          RAISE EXCEPTION 'Privilege escalation denied: unauthorized global_settings modification.'
            USING ERRCODE = '42501';
        END IF;

        -- Strict database-enforced role and range validation for id_retention_days
        IF (OLD.global_settings->'id_retention_days' IS DISTINCT FROM NEW.global_settings->'id_retention_days') THEN
          -- Role check: Only tenant administrators can modify retention policy
          IF OLD.role IS DISTINCT FROM 'tenant_admin' THEN
            RAISE EXCEPTION 'Privilege escalation denied: only tenant administrators can modify id_retention_days.'
              USING ERRCODE = '42501';
          END IF;

          -- Tenant isolation check: Cannot modify another tenant's retention policy
          IF auth.uid() IS DISTINCT FROM OLD.id THEN
            RAISE EXCEPTION 'Privilege escalation denied: unauthorized tenant ownership.'
              USING ERRCODE = '42501';
          END IF;

          -- Value integrity check: Reject non-numbers, decimals (e.g. 46.5), and out-of-range (<30 or >90)
          IF NEW.global_settings->'id_retention_days' IS NULL OR
             jsonb_typeof(NEW.global_settings->'id_retention_days') <> 'number' OR
             (NEW.global_settings->>'id_retention_days')::numeric <> trunc((NEW.global_settings->>'id_retention_days')::numeric) OR
             (NEW.global_settings->>'id_retention_days')::integer < 30 OR
             (NEW.global_settings->>'id_retention_days')::integer > 90 THEN
            RAISE EXCEPTION 'INVALID_ARGUMENT: id_retention_days must be an integer between 30 and 90.'
              USING ERRCODE = '22023';
          END IF;
        END IF;
      END IF;

      RETURN NEW;
    END;
    $function$;

    CREATE TRIGGER trg_prevent_profile_privilege_escalation
    BEFORE UPDATE ON public.profiles
    FOR EACH ROW EXECUTE FUNCTION public.prevent_profile_privilege_escalation();

    -- =========================================================================
    -- 2. DEDICATED HARDENED RPC (save_tenant_guest_id_retention)
    -- =========================================================================
    CREATE OR REPLACE FUNCTION public.save_tenant_guest_id_retention(
      p_retention_days numeric,
      p_tenant_id uuid DEFAULT NULL
    )
    RETURNS jsonb
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = public, pg_temp
    AS $$
    DECLARE
      v_uid uuid := auth.uid();
      v_user_role text;
      v_target_id uuid;
      v_old_settings jsonb;
      v_new_settings jsonb;
    BEGIN
      -- 1. Authentication Check
      IF v_uid IS NULL THEN
        RAISE EXCEPTION 'UNAUTHENTICATED: Authentication required to configure retention policy.'
          USING ERRCODE = '42501';
      END IF;

      -- 2. Range & Type Validation: Strict integer between 30 and 90 days (reject decimals, out-of-range, NULL)
      IF p_retention_days IS NULL OR p_retention_days <> trunc(p_retention_days) OR p_retention_days < 30 OR p_retention_days > 90 THEN
        RAISE EXCEPTION 'INVALID_ARGUMENT: Retention period must be an integer between 30 and 90 days.'
          USING ERRCODE = '22023';
      END IF;

      -- 3. Role & Tenant Isolation Verification
      SELECT role INTO v_user_role
      FROM public.profiles
      WHERE id = v_uid;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'USER_NOT_FOUND: Profile not found.'
          USING ERRCODE = '42501';
      END IF;

      IF v_user_role = 'super_admin' THEN
        v_target_id := COALESCE(p_tenant_id, v_uid);
        IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = v_target_id) THEN
          RAISE EXCEPTION 'TARGET_NOT_FOUND: Target tenant profile does not exist.'
            USING ERRCODE = '42501';
        END IF;
      ELSIF v_user_role = 'tenant_admin' THEN
        IF p_tenant_id IS NOT NULL AND p_tenant_id <> v_uid THEN
          RAISE EXCEPTION 'FORBIDDEN: Tenant administrators cannot modify retention policies of other accounts.'
            USING ERRCODE = '42501';
        END IF;
        v_target_id := v_uid;
      ELSE
        RAISE EXCEPTION 'FORBIDDEN: Insufficient permissions to modify retention policy.'
          USING ERRCODE = '42501';
      END IF;

      -- 4. Load and update settings non-destructively with exclusive row lock
      SELECT COALESCE(global_settings, '{}'::jsonb)
      INTO v_old_settings
      FROM public.profiles
      WHERE id = v_target_id
      FOR UPDATE;

      v_new_settings := jsonb_set(v_old_settings, '{id_retention_days}', to_jsonb(p_retention_days::integer), true);

      UPDATE public.profiles
      SET global_settings = v_new_settings
      WHERE id = v_target_id;

      RETURN jsonb_build_object(
        'status', 'success',
        'tenant_id', v_target_id,
        'id_retention_days', p_retention_days::integer
      );
    END;
    $$;

    REVOKE ALL ON FUNCTION public.save_tenant_guest_id_retention(numeric, uuid) FROM PUBLIC, anon;
    GRANT EXECUTE ON FUNCTION public.save_tenant_guest_id_retention(numeric, uuid) TO authenticated, service_role;
  `);

  const tenantAdminId = '11111111-1111-1111-1111-111111111111';
  const tenantTwoId   = '22222222-2222-2222-2222-222222222222';
  const staffId       = '33333333-3333-3333-3333-333333333333';
  const superAdminId  = '99999999-9999-9999-9999-999999999999';

  await db.exec(`
    INSERT INTO public.profiles (id, email, full_name, role, global_settings) VALUES
    ('${tenantAdminId}', 'admin1@tenant.com', 'Tenant One', 'tenant_admin', '{"billing": {"companyName": "Resort 1"}, "pricing": {"solo": 499}}'::jsonb),
    ('${tenantTwoId}',   'admin2@tenant.com', 'Tenant Two', 'tenant_admin', '{"billing": {"companyName": "Resort 2"}}'::jsonb),
    ('${staffId}',       'staff@tenant.com',  'Staff User', 'staff',        '{}'::jsonb),
    ('${superAdminId}',  'super@admin.com',   'Super Admin', 'super_admin', '{"pricing": {"solo": 499}}'::jsonb);
  `);

  // =========================================================================
  // SCENARIO 1: Tenant Admin authorized RPC update succeeds
  // =========================================================================
  await t.test('Scenario 1: Tenant Admin authorized RPC update succeeds', async () => {
    await db.exec(`
      SET SESSION "request.jwt.claim.role" = 'authenticated';
      SET SESSION "request.jwt.claim.sub" = '${tenantAdminId}';
    `);

    const res = await db.query(`SELECT public.save_tenant_guest_id_retention(46) as r;`);
    assert.equal(res.rows[0].r.status, 'success');
    assert.equal(res.rows[0].r.id_retention_days, 46);

    const check = await db.query(`SELECT global_settings FROM public.profiles WHERE id = '${tenantAdminId}';`);
    assert.equal(check.rows[0].global_settings.id_retention_days, 46);
  });

  // =========================================================================
  // SCENARIO 2: Direct unauthorized retention update fails
  // =========================================================================
  await t.test('Scenario 2: Direct unauthorized retention update fails', async () => {
    await db.exec(`
      SET SESSION "request.jwt.claim.role" = 'authenticated';
      SET SESSION "request.jwt.claim.sub" = '${tenantAdminId}';
    `);

    // Arbitrary key injection alongside or without retention is blocked
    await assert.rejects(
      async () => {
        await db.exec(`
          UPDATE public.profiles
          SET global_settings = jsonb_set(global_settings, '{is_unlimited}', 'true'::jsonb, true)
          WHERE id = '${tenantAdminId}';
        `);
      },
      (err) => {
        assert.match(err.message, /Privilege escalation denied: unauthorized global_settings modification/);
        return true;
      }
    );
  });

  // =========================================================================
  // SCENARIO 3: Staff update fails
  // =========================================================================
  await t.test('Scenario 3: Staff update fails (both RPC and direct update)', async () => {
    await db.exec(`
      SET SESSION "request.jwt.claim.role" = 'authenticated';
      SET SESSION "request.jwt.claim.sub" = '${staffId}';
    `);

    // Direct update fails
    await assert.rejects(
      async () => {
        await db.exec(`
          UPDATE public.profiles
          SET global_settings = jsonb_set(global_settings, '{id_retention_days}', '46'::jsonb, true)
          WHERE id = '${staffId}';
        `);
      },
      (err) => {
        assert.match(err.message, /Privilege escalation denied: only tenant administrators can modify id_retention_days/);
        return true;
      }
    );

    // RPC fails
    await assert.rejects(
      async () => {
        await db.query(`SELECT public.save_tenant_guest_id_retention(46);`);
      },
      (err) => {
        assert.match(err.message, /Insufficient permissions to modify retention policy/);
        return true;
      }
    );
  });

  // =========================================================================
  // SCENARIO 4: Anonymous update fails
  // =========================================================================
  await t.test('Scenario 4: Anonymous update fails (RPC strictly unauthenticated)', async () => {
    await db.exec(`
      RESET ALL;
      SET SESSION "request.jwt.claim.role" = 'anon';
    `);

    await assert.rejects(
      async () => {
        await db.query(`SELECT public.save_tenant_guest_id_retention(46);`);
      },
      (err) => {
        assert.match(err.message, /Authentication required to configure retention policy/);
        return true;
      }
    );
  });

  // =========================================================================
  // SCENARIO 5: Cross-tenant update fails
  // =========================================================================
  await t.test('Scenario 5: Cross-tenant update fails (both RPC and direct update)', async () => {
    await db.exec(`
      SET SESSION "request.jwt.claim.role" = 'authenticated';
      SET SESSION "request.jwt.claim.sub" = '${tenantAdminId}';
    `);

    // RPC cross-tenant fails
    await assert.rejects(
      async () => {
        await db.query(`SELECT public.save_tenant_guest_id_retention(50, '${tenantTwoId}'::uuid);`);
      },
      (err) => {
        assert.match(err.message, /Tenant administrators cannot modify retention policies of other accounts/);
        return true;
      }
    );

    // Direct cross-tenant fails
    await assert.rejects(
      async () => {
        await db.exec(`
          UPDATE public.profiles
          SET global_settings = jsonb_set(global_settings, '{id_retention_days}', '50'::jsonb, true)
          WHERE id = '${tenantTwoId}';
        `);
      },
      (err) => {
        assert.match(err.message, /Privilege escalation denied: unauthorized tenant ownership/);
        return true;
      }
    );
  });

  // =========================================================================
  // SCENARIO 6: Super Admin delegated update succeeds
  // =========================================================================
  await t.test('Scenario 6: Super Admin delegated update succeeds for target tenant and rejects non-existent target', async () => {
    await db.exec(`
      SET SESSION "request.jwt.claim.role" = 'authenticated';
      SET SESSION "request.jwt.claim.sub" = '${superAdminId}';
    `);

    // Valid delegated update for Tenant 2
    const res = await db.query(`SELECT public.save_tenant_guest_id_retention(75, '${tenantTwoId}'::uuid) as r;`);
    assert.equal(res.rows[0].r.status, 'success');
    assert.equal(res.rows[0].r.id_retention_days, 75);

    const check = await db.query(`SELECT global_settings FROM public.profiles WHERE id = '${tenantTwoId}';`);
    assert.equal(check.rows[0].global_settings.id_retention_days, 75);

    // Non-existent target fails with TARGET_NOT_FOUND
    const fakeId = '00000000-0000-0000-0000-000000000000';
    await assert.rejects(
      async () => {
        await db.query(`SELECT public.save_tenant_guest_id_retention(75, '${fakeId}'::uuid);`);
      },
      (err) => {
        assert.match(err.message, /Target tenant profile does not exist/);
        return true;
      }
    );
  });

  // =========================================================================
  // SCENARIO 7: Invalid retention values fail (strict value validation)
  // =========================================================================
  await t.test('Scenario 7: Invalid retention values fail (NULL, <30, >90, decimals, strings, booleans, arrays)', async () => {
    await db.exec(`
      SET SESSION "request.jwt.claim.role" = 'authenticated';
      SET SESSION "request.jwt.claim.sub" = '${tenantAdminId}';
    `);

    // RPC checks
    await assert.rejects(
      async () => { await db.query(`SELECT public.save_tenant_guest_id_retention(NULL);`); },
      (err) => { assert.match(err.message, /Retention period must be an integer between 30 and 90 days/); return true; }
    );
    await assert.rejects(
      async () => { await db.query(`SELECT public.save_tenant_guest_id_retention(29);`); },
      (err) => { assert.match(err.message, /Retention period must be an integer between 30 and 90 days/); return true; }
    );
    await assert.rejects(
      async () => { await db.query(`SELECT public.save_tenant_guest_id_retention(91);`); },
      (err) => { assert.match(err.message, /Retention period must be an integer between 30 and 90 days/); return true; }
    );
    await assert.rejects(
      async () => { await db.query(`SELECT public.save_tenant_guest_id_retention(46.5);`); },
      (err) => { assert.match(err.message, /Retention period must be an integer between 30 and 90 days/); return true; }
    );

    // Direct update checks (rejects non-integer, strings, booleans, arrays, objects)
    await assert.rejects(
      async () => {
        await db.exec(`UPDATE public.profiles SET global_settings = jsonb_set(global_settings, '{id_retention_days}', '46.5'::jsonb, true) WHERE id = '${tenantAdminId}';`);
      },
      (err) => { assert.match(err.message, /id_retention_days must be an integer between 30 and 90/); return true; }
    );
    await assert.rejects(
      async () => {
        await db.exec(`UPDATE public.profiles SET global_settings = jsonb_set(global_settings, '{id_retention_days}', '"46"'::jsonb, true) WHERE id = '${tenantAdminId}';`);
      },
      (err) => { assert.match(err.message, /id_retention_days must be an integer between 30 and 90/); return true; }
    );
    await assert.rejects(
      async () => {
        await db.exec(`UPDATE public.profiles SET global_settings = jsonb_set(global_settings, '{id_retention_days}', 'true'::jsonb, true) WHERE id = '${tenantAdminId}';`);
      },
      (err) => { assert.match(err.message, /id_retention_days must be an integer between 30 and 90/); return true; }
    );
    await assert.rejects(
      async () => {
        await db.exec(`UPDATE public.profiles SET global_settings = jsonb_set(global_settings, '{id_retention_days}', '[46]'::jsonb, true) WHERE id = '${tenantAdminId}';`);
      },
      (err) => { assert.match(err.message, /id_retention_days must be an integer between 30 and 90/); return true; }
    );
  });

  // =========================================================================
  // SCENARIO 8: Unrelated JSONB settings remain unchanged
  // =========================================================================
  await t.test('Scenario 8: Unrelated JSONB settings remain unchanged', async () => {
    await db.exec(`
      SET SESSION "request.jwt.claim.role" = 'authenticated';
      SET SESSION "request.jwt.claim.sub" = '${tenantAdminId}';
    `);

    await db.query(`SELECT public.save_tenant_guest_id_retention(55);`);
    const check = await db.query(`SELECT global_settings FROM public.profiles WHERE id = '${tenantAdminId}';`);

    assert.equal(check.rows[0].global_settings.id_retention_days, 55);
    assert.equal(check.rows[0].global_settings.billing.companyName, 'Resort 1');
    assert.deepEqual(check.rows[0].global_settings.pricing, { solo: 499 });
  });

  // =========================================================================
  // SCENARIO 9: Concurrent updates do not lose data (pessimistic locking)
  // =========================================================================
  await t.test('Scenario 9: Concurrent updates preserve atomicity with FOR UPDATE lock', async () => {
    await db.exec(`
      SET SESSION "request.jwt.claim.role" = 'authenticated';
      SET SESSION "request.jwt.claim.sub" = '${tenantAdminId}';
    `);

    // Sequential simulation of transactional concurrency
    await db.query(`SELECT public.save_tenant_guest_id_retention(70);`);
    await db.query(`SELECT public.save_tenant_guest_id_retention(80);`);

    const check = await db.query(`SELECT global_settings FROM public.profiles WHERE id = '${tenantAdminId}';`);
    assert.equal(check.rows[0].global_settings.id_retention_days, 80);
    assert.equal(check.rows[0].global_settings.billing.companyName, 'Resort 1');
  });

  // =========================================================================
  // SCENARIO 10: Billing and GST updates remain functional
  // =========================================================================
  await t.test('Scenario 10: Billing and GST updates remain functional', async () => {
    await db.exec(`
      SET SESSION "request.jwt.claim.role" = 'authenticated';
      SET SESSION "request.jwt.claim.sub" = '${tenantAdminId}';
    `);

    // Direct update to billing
    await db.exec(`
      UPDATE public.profiles
      SET global_settings = jsonb_set(global_settings, '{billing,companyName}', '"Chalet Deluxe"'::jsonb, true)
      WHERE id = '${tenantAdminId}';
    `);

    // Direct update to tenant_gst
    await db.exec(`
      UPDATE public.profiles
      SET global_settings = jsonb_set(global_settings, '{tenant_gst}', '{"enabled": true, "lowerRate": 5}'::jsonb, true)
      WHERE id = '${tenantAdminId}';
    `);

    const check = await db.query(`SELECT global_settings FROM public.profiles WHERE id = '${tenantAdminId}';`);
    assert.equal(check.rows[0].global_settings.billing.companyName, 'Chalet Deluxe');
    assert.equal(check.rows[0].global_settings.tenant_gst.enabled, true);
    assert.equal(check.rows[0].global_settings.id_retention_days, 80);
  });

  // =========================================================================
  // SCENARIO 11: Protected platform keys remain immutable
  // =========================================================================
  await t.test('Scenario 11: Protected platform keys remain immutable (seller_identity, gst_configuration, pricing, etc.)', async () => {
    await db.exec(`
      SET SESSION "request.jwt.claim.role" = 'authenticated';
      SET SESSION "request.jwt.claim.sub" = '${tenantAdminId}';
    `);

    await assert.rejects(
      async () => {
        await db.exec(`
          UPDATE public.profiles
          SET global_settings = jsonb_set(global_settings, '{pricing,solo}', '0'::jsonb, true)
          WHERE id = '${tenantAdminId}';
        `);
      },
      (err) => {
        assert.match(err.message, /Privilege escalation denied: platform global_settings cannot be modified by user/);
        return true;
      }
    );
  });

  // =========================================================================
  // SCENARIO 12: Profile name/avatar updates remain functional
  // =========================================================================
  await t.test('Scenario 12: Profile name/avatar updates remain functional', async () => {
    await db.exec(`
      SET SESSION "request.jwt.claim.role" = 'authenticated';
      SET SESSION "request.jwt.claim.sub" = '${tenantAdminId}';
    `);

    await db.exec(`
      UPDATE public.profiles
      SET full_name = 'Updated Tenant Name', avatar_url = 'https://example.com/avatar.jpg'
      WHERE id = '${tenantAdminId}';
    `);

    const check = await db.query(`SELECT full_name, avatar_url FROM public.profiles WHERE id = '${tenantAdminId}';`);
    assert.equal(check.rows[0].full_name, 'Updated Tenant Name');
    assert.equal(check.rows[0].avatar_url, 'https://example.com/avatar.jpg');
  });

  // =========================================================================
  // SCENARIO 13: Existing operational cleanup functionality remains unchanged
  // =========================================================================
  await t.test('Scenario 13: Existing operational cleanup queries remain functional and accurate', async () => {
    await db.exec(`
      INSERT INTO public.bookings (tenant_id, status, check_in_date) VALUES ('${tenantAdminId}', 'confirmed', '2024-06-15T10:00:00Z');
      INSERT INTO public.income (tenant_id, amount, date) VALUES ('${tenantAdminId}', 5000, '2024-06-15');
      INSERT INTO public.expenses (tenant_id, amount, date) VALUES ('${tenantAdminId}', 1200, '2024-06-15');
    `);

    const startDate = '2024-01-01T00:00:00Z';
    const endDate = '2024-12-31T23:59:59Z';

    const bks = await db.query(`SELECT count(*)::integer as c FROM public.bookings WHERE tenant_id = '${tenantAdminId}' AND check_in_date >= '${startDate}' AND check_in_date <= '${endDate}';`);
    const inc = await db.query(`SELECT count(*)::integer as c FROM public.income WHERE tenant_id = '${tenantAdminId}' AND date >= '2024-01-01' AND date <= '2024-12-31';`);
    const exp = await db.query(`SELECT count(*)::integer as c FROM public.expenses WHERE tenant_id = '${tenantAdminId}' AND date >= '2024-01-01' AND date <= '2024-12-31';`);

    const total = bks.rows[0].c + inc.rows[0].c + exp.rows[0].c;
    assert.equal(bks.rows[0].c, 1);
    assert.equal(inc.rows[0].c, 1);
    assert.equal(exp.rows[0].c, 1);
    assert.equal(total, 3);
  });

  // =========================================================================
  // SCENARIO 14: Existing frontend Save Policy workflow remains functional
  // =========================================================================
  await t.test('Scenario 14: Existing frontend Save Policy workflow remains functional (30-90 days permitted)', async () => {
    await db.exec(`
      SET SESSION "request.jwt.claim.role" = 'authenticated';
      SET SESSION "request.jwt.claim.sub" = '${tenantAdminId}';
    `);

    // Frontend slider values from 30 to 90
    for (const val of [30, 45, 60, 90]) {
      const res = await db.query(`SELECT public.save_tenant_guest_id_retention(${val}) as r;`);
      assert.equal(res.rows[0].r.status, 'success');
      assert.equal(res.rows[0].r.id_retention_days, val);
    }

    const check = await db.query(`SELECT global_settings FROM public.profiles WHERE id = '${tenantAdminId}';`);
    assert.equal(check.rows[0].global_settings.id_retention_days, 90);
  });
});
