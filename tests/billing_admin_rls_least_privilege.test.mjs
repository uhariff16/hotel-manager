import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('Stage 12B.2E Phase 0.3: Billing Admin Least-Privilege Monitoring RPC Test Suite', () => {
  let db;

  // UUID fixtures for roles
  const SUPER_ADMIN_ID = '9c4e65f5-c0a1-4b3a-8ed2-d01175a73409';
  const BILLING_ADMIN_ID = '8d5f76e6-d1b2-5c4b-9fe3-e12286b84510';
  const TENANT_A_ID = '3797dba7-a7fd-4ca6-86cb-b45519953947'; // Cheerful Chalet
  const TENANT_B_ID = 'b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d6e'; // Mountain Lodge
  const STAFF_A_ID = 'c3d4e5f6-a7b8-4c9d-0e1f-2a3b4c5d6e7f'; // Staff under Tenant A

  // Migration file paths
  const migrationPath = path.join(
    __dirname,
    '..',
    'supabase',
    'migrations',
    '20261117100000_billing_admin_subscription_monitoring_rls.sql'
  );
  const rollbackPath = path.join(
    __dirname,
    '..',
    'supabase',
    'rollback_scripts',
    'rollback_20261117100000_billing_admin_subscription_monitoring_rls.sql'
  );

  async function setRole(roleName, userId = '') {
    if (roleName === 'anon') {
      await db.exec(`
        SET ROLE anon;
        SET request.jwt.claim.sub = '';
        SET request.jwt.claim.role = 'anon';
      `);
    } else if (roleName === 'authenticated') {
      await db.exec(`
        SET ROLE authenticated;
        SET request.jwt.claim.sub = '${userId}';
        SET request.jwt.claim.role = 'authenticated';
      `);
    } else {
      await db.exec(`
        RESET ROLE;
        SET request.jwt.claim.sub = '';
        SET request.jwt.claim.role = 'service_role';
      `);
    }
  }

  before(async () => {
    db = new PGlite();

    // 1. Initialize Postgres roles and Auth schema
    await db.exec(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon NOLOGIN; END IF;
        IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
        IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role NOLOGIN BYPASSRLS; ELSE ALTER ROLE service_role BYPASSRLS; END IF;
      END $$;

      CREATE SCHEMA IF NOT EXISTS auth;
      CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
        SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid;
      $$;
      CREATE OR REPLACE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$
        SELECT COALESCE(NULLIF(current_setting('request.jwt.claim.role', true), ''), 'anon');
      $$;

      GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;
      GRANT EXECUTE ON FUNCTION auth.uid() TO anon, authenticated, service_role;
      GRANT EXECUTE ON FUNCTION auth.role() TO anon, authenticated, service_role;

      GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

      -- Base profiles table
      CREATE TABLE public.profiles (
        id uuid PRIMARY KEY,
        email text,
        full_name text,
        role text NOT NULL DEFAULT 'tenant_admin',
        plan_type text NOT NULL DEFAULT 'solo',
        subscription_status text DEFAULT 'active',
        trial_started_at timestamptz DEFAULT now(),
        trial_ends_at timestamptz DEFAULT now() + interval '30 days',
        is_legacy_account boolean DEFAULT false,
        created_at timestamptz DEFAULT now(),
        updated_at timestamptz DEFAULT now()
      );

      -- Base resorts table
      CREATE TABLE public.resorts (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
        name text NOT NULL,
        created_at timestamptz DEFAULT now()
      );

      -- Base saas_subscriptions table
      CREATE TABLE public.saas_subscriptions (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
        environment text NOT NULL DEFAULT 'test',
        razorpay_customer_id text,
        razorpay_subscription_id text,
        razorpay_plan_id text,
        staypilot_plan_type text DEFAULT 'solo',
        status text NOT NULL DEFAULT 'created',
        current_period_start timestamptz DEFAULT now(),
        current_period_end timestamptz DEFAULT now() + interval '30 days',
        cancel_at_period_end boolean DEFAULT false,
        checkout_expires_at timestamptz,
        created_at timestamptz DEFAULT now(),
        updated_at timestamptz DEFAULT now()
      );

      -- Base saas_payments table
      CREATE TABLE public.saas_payments (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
        razorpay_payment_id text,
        razorpay_subscription_id text,
        razorpay_invoice_id text,
        amount numeric NOT NULL DEFAULT 0,
        currency text DEFAULT 'INR',
        status text NOT NULL DEFAULT 'captured',
        environment text NOT NULL DEFAULT 'test',
        created_at timestamptz DEFAULT now()
      );

      -- Base saas_invoices table
      CREATE TABLE public.saas_invoices (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
        invoice_number text NOT NULL,
        payment_id text,
        subscription_id text,
        razorpay_payment_id text,
        environment text NOT NULL DEFAULT 'test',
        plan_type text DEFAULT 'solo',
        total_amount_paise bigint DEFAULT 0,
        invoice_status text DEFAULT 'paid',
        issued_at timestamptz DEFAULT now(),
        created_at timestamptz DEFAULT now()
      );

      -- Global is_super_admin function (Pre-existing production logic)
      CREATE OR REPLACE FUNCTION public.is_super_admin(p_uid uuid DEFAULT auth.uid())
      RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
      BEGIN
        IF p_uid IS NULL THEN
          RETURN false;
        END IF;
        RETURN EXISTS (
          SELECT 1 FROM public.profiles
          WHERE id = p_uid AND role = 'super_admin'
        );
      END;
      $$;

      -- Enable Row Level Security on all tables
      ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
      ALTER TABLE public.resorts ENABLE ROW LEVEL SECURITY;
      ALTER TABLE public.saas_subscriptions ENABLE ROW LEVEL SECURITY;
      ALTER TABLE public.saas_payments ENABLE ROW LEVEL SECURITY;
      ALTER TABLE public.saas_invoices ENABLE ROW LEVEL SECURITY;

      -- Standard baseline policies:
      -- Profiles: Users see own profile; super admin sees all
      CREATE POLICY "Users can view own profile" ON public.profiles FOR SELECT TO authenticated USING (id = auth.uid());
      CREATE POLICY "Super admin views all profiles" ON public.profiles FOR SELECT TO authenticated USING (public.is_super_admin());

      -- Resorts: Tenant sees own resort; super admin sees all
      CREATE POLICY "Tenants view own resorts" ON public.resorts FOR SELECT TO authenticated USING (tenant_id = auth.uid());
      CREATE POLICY "Super admin views all resorts" ON public.resorts FOR SELECT TO authenticated USING (public.is_super_admin());

      -- saas_subscriptions: Tenant sees own; super admin sees all
      CREATE POLICY "Tenants view own saas_subscriptions" ON public.saas_subscriptions FOR SELECT TO authenticated USING (tenant_id = auth.uid());
      CREATE POLICY "Super admin views all saas_subscriptions" ON public.saas_subscriptions FOR SELECT TO authenticated USING (public.is_super_admin());

      -- saas_payments: Tenant sees own; super admin sees all
      CREATE POLICY "Tenants view own saas_payments" ON public.saas_payments FOR SELECT TO authenticated USING (tenant_id = auth.uid());
      CREATE POLICY "Super admin views all saas_payments" ON public.saas_payments FOR SELECT TO authenticated USING (public.is_super_admin());

      -- saas_invoices: Tenant sees own; super admin sees all
      CREATE POLICY "Tenants view own saas_invoices" ON public.saas_invoices FOR SELECT TO authenticated USING (tenant_id = auth.uid());
      CREATE POLICY "Super admin views all saas_invoices" ON public.saas_invoices FOR SELECT TO authenticated USING (public.is_super_admin());

      -- Grants for authenticated & anon
      GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
      GRANT SELECT, INSERT, UPDATE, DELETE ON public.resorts TO authenticated;
      GRANT SELECT, INSERT, UPDATE, DELETE ON public.saas_subscriptions TO authenticated;
      GRANT SELECT, INSERT, UPDATE, DELETE ON public.saas_payments TO authenticated;
      GRANT SELECT, INSERT, UPDATE, DELETE ON public.saas_invoices TO authenticated;

      GRANT SELECT ON public.profiles TO anon;
      GRANT SELECT ON public.resorts TO anon;
      GRANT SELECT ON public.saas_subscriptions TO anon;
      GRANT SELECT ON public.saas_payments TO anon;
      GRANT SELECT ON public.saas_invoices TO anon;

      -- Seed data
      INSERT INTO public.profiles (id, email, full_name, role, plan_type) VALUES
        ('${SUPER_ADMIN_ID}', 'superadmin@staypilot.io', 'Global SuperAdmin', 'super_admin', 'stay_master'),
        ('${BILLING_ADMIN_ID}', 'billing@staypilot.io', 'Billing Manager', 'billing_admin', 'solo'),
        ('${TENANT_A_ID}', 'owner@chalet.com', 'Tenant A Cheerful', 'tenant_admin', 'growth'),
        ('${TENANT_B_ID}', 'owner@mountain.com', 'Tenant B Mountain', 'tenant_admin', 'solo'),
        ('${STAFF_A_ID}', 'staff@chalet.com', 'Staff A', 'staff', 'growth');

      INSERT INTO public.resorts (tenant_id, name) VALUES
        ('${TENANT_A_ID}', 'Cheerful Chalet Resort'),
        ('${TENANT_B_ID}', 'Mountain Lodge Resort');

      INSERT INTO public.saas_subscriptions (tenant_id, environment, razorpay_subscription_id, status, staypilot_plan_type) VALUES
        ('${TENANT_A_ID}', 'live', 'sub_LiveA123', 'active', 'growth'),
        ('${TENANT_A_ID}', 'test', 'sub_TestA456', 'cancelled', 'solo'),
        ('${TENANT_B_ID}', 'live', 'sub_LiveB789', 'cancelled', 'solo');

      INSERT INTO public.saas_payments (tenant_id, environment, razorpay_payment_id, amount, status) VALUES
        ('${TENANT_A_ID}', 'live', 'pay_LiveA001', 999, 'captured'),
        ('${TENANT_B_ID}', 'live', 'pay_LiveB002', 499, 'captured');

      INSERT INTO public.saas_invoices (tenant_id, environment, invoice_number, total_amount_paise, invoice_status) VALUES
        ('${TENANT_A_ID}', 'live', 'INV-2026-001', 99900, 'paid'),
        ('${TENANT_B_ID}', 'live', 'INV-2026-002', 49900, 'paid');
    `);

    // Apply the revised migration
    const migrationSql = fs.readFileSync(migrationPath, 'utf-8');
    await db.exec(migrationSql);
  });

  test('1. Migration hygiene: creates get_saas_subscription_monitoring_inventory and can_view_saas_billing_monitoring', async () => {
    const fnCheck = await db.query(`
      SELECT proname, prosecdef FROM pg_proc WHERE proname IN ('get_saas_subscription_monitoring_inventory', 'can_view_saas_billing_monitoring')
    `);
    assert.equal(fnCheck.rows.length, 2, 'Both RPC and helper function exist');
    assert.ok(fnCheck.rows.every(r => r.prosecdef === true), 'Both functions are SECURITY DEFINER');
  });

  test('2. Super Admin can execute get_saas_subscription_monitoring_inventory and receives full inventory', async () => {
    await setRole('authenticated', SUPER_ADMIN_ID);
    const res = await db.query('SELECT public.get_saas_subscription_monitoring_inventory() as payload');
    const data = res.rows[0].payload;
    assert.ok(data, 'Super Admin receives payload');
    assert.equal(data.subscriptions.length, 3, 'Super Admin sees all 3 subscriptions');
    assert.equal(data.payments.length, 2, 'Super Admin sees all 2 payments');
    assert.equal(data.invoices.length, 2, 'Super Admin sees all 2 invoices');
    assert.equal(data.resorts.length, 2, 'Super Admin sees all 2 resorts');
    await setRole('service_role');
  });

  test('3. Billing Admin can execute get_saas_subscription_monitoring_inventory and receives monitoring data', async () => {
    await setRole('authenticated', BILLING_ADMIN_ID);
    const res = await db.query('SELECT public.get_saas_subscription_monitoring_inventory() as payload');
    const data = res.rows[0].payload;
    assert.ok(data, 'Billing Admin receives payload');
    assert.equal(data.subscriptions.length, 3, 'Billing Admin sees all 3 subscriptions');
    assert.equal(data.payments.length, 2, 'Billing Admin sees all 2 payments');
    assert.equal(data.invoices.length, 2, 'Billing Admin sees all 2 invoices');
    assert.equal(data.resorts.length, 2, 'Billing Admin sees all 2 resorts');
    await setRole('service_role');
  });

  test('4. Tenant Admin CANNOT execute get_saas_subscription_monitoring_inventory (Fails closed)', async () => {
    await setRole('authenticated', TENANT_A_ID);
    await assert.rejects(
      async () => {
        await db.query('SELECT public.get_saas_subscription_monitoring_inventory()');
      },
      /FORBIDDEN: Subscription monitoring access required/i,
      'Tenant Admin must be rejected with FORBIDDEN'
    );
    await setRole('service_role');
  });

  test('5. Staff CANNOT execute get_saas_subscription_monitoring_inventory (Fails closed)', async () => {
    await setRole('authenticated', STAFF_A_ID);
    await assert.rejects(
      async () => {
        await db.query('SELECT public.get_saas_subscription_monitoring_inventory()');
      },
      /FORBIDDEN: Subscription monitoring access required/i,
      'Staff member must be rejected with FORBIDDEN'
    );
    await setRole('service_role');
  });

  test('6. Anonymous user CANNOT execute get_saas_subscription_monitoring_inventory (Fails closed)', async () => {
    await setRole('anon');
    await assert.rejects(
      async () => {
        await db.query('SELECT public.get_saas_subscription_monitoring_inventory()');
      },
      /permission denied/i,
      'Anonymous user must be denied execute privilege'
    );
    await setRole('service_role');
  });

  test('7. LEAST PRIVILEGE: Billing Admin has ZERO direct SELECT policies on tables (Direct query returns 0 rows)', async () => {
    await setRole('authenticated', BILLING_ADMIN_ID);

    // Direct table queries must return 0 rows for other tenants
    const subs = await db.query('SELECT * FROM public.saas_subscriptions');
    assert.equal(subs.rows.length, 0, 'Billing Admin cannot directly SELECT from saas_subscriptions');

    const payments = await db.query('SELECT * FROM public.saas_payments');
    assert.equal(payments.rows.length, 0, 'Billing Admin cannot directly SELECT from saas_payments');

    const invoices = await db.query('SELECT * FROM public.saas_invoices');
    assert.equal(invoices.rows.length, 0, 'Billing Admin cannot directly SELECT from saas_invoices');

    const resorts = await db.query('SELECT * FROM public.resorts');
    assert.equal(resorts.rows.length, 0, 'Billing Admin cannot directly SELECT from resorts');

    const profiles = await db.query('SELECT * FROM public.profiles');
    assert.equal(profiles.rows.length, 1, 'Billing Admin can only see their own profile, not other tenants');
    assert.equal(profiles.rows[0].id, BILLING_ADMIN_ID);

    await setRole('service_role');
  });

  test('8. LEAST PRIVILEGE: Billing Admin CANNOT perform mutations (INSERT, UPDATE, DELETE)', async () => {
    await setRole('authenticated', BILLING_ADMIN_ID);

    await assert.rejects(
      async () => {
        await db.query(`
          INSERT INTO public.saas_subscriptions (tenant_id, environment, razorpay_subscription_id, status)
          VALUES ('${TENANT_A_ID}', 'live', 'sub_Malicious123', 'active')
        `);
      },
      /violates row-level security policy/i,
      'billing_admin INSERT must be blocked'
    );

    const updateRes = await db.query(`UPDATE public.saas_subscriptions SET status = 'active' WHERE id = '${TENANT_A_ID}'`);
    assert.equal(updateRes.affectedRows, 0, 'billing_admin cannot update subscriptions');

    const deleteRes = await db.query(`DELETE FROM public.saas_subscriptions WHERE tenant_id = '${TENANT_A_ID}'`);
    assert.equal(deleteRes.affectedRows, 0, 'billing_admin cannot delete subscriptions');

    await setRole('service_role');
  });

  test('9. Tenant isolation is completely intact (Tenant A sees only own data)', async () => {
    await setRole('authenticated', TENANT_A_ID);

    const subs = await db.query('SELECT * FROM public.saas_subscriptions');
    assert.equal(subs.rows.length, 2, 'Tenant A sees only own 2 subscriptions');
    assert.ok(subs.rows.every(r => r.tenant_id === TENANT_A_ID));

    const profs = await db.query('SELECT * FROM public.profiles');
    assert.equal(profs.rows.length, 1, 'Tenant A sees only own profile');
    assert.equal(profs.rows[0].id, TENANT_A_ID);

    await setRole('service_role');
  });

  test('10. Global is_super_admin() is completely unmodified', async () => {
    const res = await db.query(`SELECT public.is_super_admin('${BILLING_ADMIN_ID}'::uuid) as is_sa`);
    assert.equal(res.rows[0].is_sa, false, 'is_super_admin returns false for billing_admin');

    const saRes = await db.query(`SELECT public.is_super_admin('${SUPER_ADMIN_ID}'::uuid) as is_sa`);
    assert.equal(saRes.rows[0].is_sa, true, 'is_super_admin returns true for super_admin');
  });

  test('11. Rollback script cleanly removes get_saas_subscription_monitoring_inventory and helper', async () => {
    await setRole('service_role');
    const rollbackSql = fs.readFileSync(rollbackPath, 'utf-8');
    await db.exec(rollbackSql);

    const fnCheck = await db.query(`
      SELECT proname FROM pg_proc WHERE proname IN ('get_saas_subscription_monitoring_inventory', 'can_view_saas_billing_monitoring')
    `);
    assert.equal(fnCheck.rows.length, 0, 'Both functions removed by rollback');

    // Tenant and Super Admin access remain functional
    await setRole('authenticated', TENANT_A_ID);
    const tenantSubs = await db.query('SELECT * FROM public.saas_subscriptions');
    assert.equal(tenantSubs.rows.length, 2, 'Tenant A still accesses own subscriptions');

    await setRole('authenticated', SUPER_ADMIN_ID);
    const saSubs = await db.query('SELECT * FROM public.saas_subscriptions');
    assert.equal(saSubs.rows.length, 3, 'Super Admin still accesses all subscriptions via direct table RLS');

    await setRole('service_role');
  });
});
