import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { formatINR, normalizePlanName } from '../src/lib/subscriptionDiscrepancies.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('Stage 12B.3B: Enhanced Subscription Monitoring & Data Accuracy Test Suite', () => {
  let db;

  const SUPER_ADMIN_ID = '9c4e65f5-c0a1-4b3a-8ed2-d01175a73409';
  const TENANT_ID = '1707818e-79ff-4a0c-9f99-7d991cc27842';
  const TENANT_EMAIL = 'uhariff@staypilot.co.in';

  const baselineMigrationPath = path.join(
    __dirname,
    '..',
    'supabase',
    'migrations',
    '20261117100000_billing_admin_subscription_monitoring_rls.sql'
  );
  const enhancedMigrationPath = path.join(
    __dirname,
    '..',
    'supabase',
    'migrations',
    '20261117150000_enhance_subscription_monitoring_rpc.sql'
  );
  const rollbackPath = path.join(
    __dirname,
    '..',
    'supabase',
    'rollback_scripts',
    'rollback_20261117150000_enhance_subscription_monitoring_rpc.sql'
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
        SET ROLE postgres;
        RESET request.jwt.claim.sub;
        RESET request.jwt.claim.role;
      `);
    }
  }

  before(async () => {
    db = new PGlite();

    // Setup base PostgreSQL environment
    await db.exec(`
      CREATE SCHEMA IF NOT EXISTS auth;
      CREATE SCHEMA IF NOT EXISTS extensions;

      CREATE ROLE anon NOLOGIN;
      CREATE ROLE authenticated NOLOGIN;
      CREATE ROLE service_role NOLOGIN;

      CREATE TABLE auth.users (
        id uuid PRIMARY KEY,
        email text,
        created_at timestamptz DEFAULT now()
      );

      CREATE TABLE public.profiles (
        id uuid PRIMARY KEY REFERENCES auth.users(id),
        full_name text,
        email text,
        role text DEFAULT 'tenant_admin',
        plan_type text DEFAULT 'free',
        subscription_status text DEFAULT 'active',
        trial_started_at timestamptz,
        trial_ends_at timestamptz,
        is_legacy_account boolean DEFAULT false
      );

      CREATE TABLE public.resorts (
        id uuid PRIMARY KEY,
        tenant_id uuid REFERENCES public.profiles(id),
        name text,
        email text,
        phone text
      );

      CREATE TABLE public.saas_subscriptions (
        id uuid PRIMARY KEY,
        tenant_id uuid REFERENCES public.profiles(id),
        razorpay_customer_id text,
        razorpay_subscription_id text,
        razorpay_plan_id text,
        staypilot_plan_type text,
        status text,
        current_period_start timestamptz,
        current_period_end timestamptz,
        cancel_at_period_end boolean DEFAULT false,
        environment text DEFAULT 'test',
        checkout_expires_at timestamptz,
        created_at timestamptz DEFAULT now(),
        updated_at timestamptz DEFAULT now()
      );

      CREATE TABLE public.saas_payments (
        id uuid PRIMARY KEY,
        tenant_id uuid REFERENCES public.profiles(id),
        razorpay_payment_id text,
        razorpay_subscription_id text,
        razorpay_invoice_id text,
        amount integer,
        currency text DEFAULT 'INR',
        status text,
        environment text DEFAULT 'test',
        created_at timestamptz DEFAULT now()
      );

      CREATE TABLE public.saas_invoices (
        id uuid PRIMARY KEY,
        invoice_number text,
        tenant_id uuid REFERENCES public.profiles(id),
        payment_id text,
        subscription_id text,
        razorpay_payment_id text,
        environment text DEFAULT 'test',
        plan_type text,
        total_amount_paise bigint,
        invoice_status text DEFAULT 'paid',
        issued_at timestamptz DEFAULT now(),
        created_at timestamptz DEFAULT now()
      );

      CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid AS $$
        SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid;
      $$ LANGUAGE sql STABLE;

      CREATE OR REPLACE FUNCTION auth.role() RETURNS text AS $$
        SELECT NULLIF(current_setting('request.jwt.claim.role', true), '')::text;
      $$ LANGUAGE sql STABLE;

      -- Seed users
      INSERT INTO auth.users (id, email) VALUES
        ('${SUPER_ADMIN_ID}', 'superadmin@staypilot.test'),
        ('${TENANT_ID}', '${TENANT_EMAIL}');

      -- Note: Tenant profile has NULL email in public.profiles!
      INSERT INTO public.profiles (id, full_name, email, role, plan_type, subscription_status) VALUES
        ('${SUPER_ADMIN_ID}', 'Super Admin', 'superadmin@staypilot.test', 'super_admin', 'free', 'active'),
        ('${TENANT_ID}', 'Stay master test', NULL, 'tenant_admin', 'custom_1786983013013', 'active');

      INSERT INTO public.resorts (id, tenant_id, name, email, phone) VALUES
        ('00000000-0000-0000-0000-000000000001', '${TENANT_ID}', 'Stay master resort', '${TENANT_EMAIL}', '8220320178');

      INSERT INTO public.saas_subscriptions (id, tenant_id, razorpay_subscription_id, staypilot_plan_type, status, environment) VALUES
        ('00000000-0000-0000-0000-000000000002', '${TENANT_ID}', 'sub_Ts26mOrQbXMPMA', 'custom_1786983013013', 'active', 'live');

      INSERT INTO public.saas_payments (id, tenant_id, razorpay_payment_id, razorpay_subscription_id, amount, status, environment) VALUES
        ('00000000-0000-0000-0000-000000000003', '${TENANT_ID}', 'pay_Ts26v2bHfe7zFn', 'sub_Ts26mOrQbXMPMA', 49900, 'captured', 'live');
    `);

    // Apply baseline migration 20261117100000
    const baselineSql = fs.readFileSync(baselineMigrationPath, 'utf8');
    await db.exec(baselineSql);
  });

  test('1. Plan Normalizer: Maps raw DB plan keys to friendly names', () => {
    assert.equal(normalizePlanName('custom_1786983013013'), 'Solo');
    assert.equal(normalizePlanName('solo'), 'Solo');
    assert.equal(normalizePlanName('pro'), 'Growth');
    assert.equal(normalizePlanName('growth'), 'Growth');
    assert.equal(normalizePlanName('premium'), 'Stay Master');
    assert.equal(normalizePlanName('stay_master'), 'Stay Master');
    assert.equal(normalizePlanName('free'), 'Free Starter');
    assert.equal(normalizePlanName(null), 'Free Starter');
  });

  test('2. Currency Formatter: Scales paise accurately to rupees', () => {
    // 49900 paise = ₹499
    assert.equal(formatINR(49900, true).replace(/\s/g, ' '), '₹499');
    // 149900 paise = ₹1,499
    assert.equal(formatINR(149900, true).replace(/\s/g, ' '), '₹1,499');
    // Direct rupees when isPaise = false
    assert.equal(formatINR(499, false).replace(/\s/g, ' '), '₹499');
  });

  test('3. Enhanced Migration applies cleanly to database without DML backfills', async () => {
    await setRole('postgres');
    const enhancedSql = fs.readFileSync(enhancedMigrationPath, 'utf8');

    // Assert Zero DML updates (pure DDL as mandated by Stage 12B.3B.1)
    assert.equal(enhancedSql.includes('UPDATE public.profiles'), false, 'Migration must contain zero DML updates');

    await db.exec(enhancedSql);

    // Verify profiles table remains untouched (pure dynamic resolution)
    const res = await db.query(`SELECT email FROM public.profiles WHERE id = '${TENANT_ID}';`);
    assert.equal(res.rows[0].email, null, 'profiles.email must remain unchanged without unsafe backfills');
  });

  test('4. Enhanced RPC projects dynamically resolved email and property details', async () => {
    await setRole('authenticated', SUPER_ADMIN_ID);
    const rpcRes = await db.query('SELECT public.get_saas_subscription_monitoring_inventory() AS inv;');
    const inv = rpcRes.rows[0].inv;

    const tenantProfile = inv.profiles.find(p => p.id === TENANT_ID);
    assert.ok(tenantProfile, 'Tenant profile must be present');
    assert.equal(tenantProfile.email, TENANT_EMAIL, 'Dynamic email must be projected from auth.users');

    const resort = inv.resorts.find(r => r.tenant_id === TENANT_ID);
    assert.ok(resort, 'Resort must be present');
    assert.equal(resort.email, TENANT_EMAIL, 'Resort email must be projected');
  });

  test('5. Least Privilege: Unauthenticated caller is rejected', async () => {
    await setRole('anon');
    await assert.rejects(
      async () => {
        await db.query('SELECT public.get_saas_subscription_monitoring_inventory();');
      },
      /permission denied|UNAUTHORIZED/
    );
  });

  test('6. Least Privilege: Tenant Admin caller is rejected', async () => {
    await setRole('authenticated', TENANT_ID);
    await assert.rejects(
      async () => {
        await db.query('SELECT public.get_saas_subscription_monitoring_inventory();');
      },
      /FORBIDDEN: Subscription monitoring access required/
    );
  });

  test('7. Rollback script cleanly restores baseline RPC definition', async () => {
    await setRole('postgres');
    const rollbackSql = fs.readFileSync(rollbackPath, 'utf8');
    await db.exec(rollbackSql);

    // Verify baseline RPC works for Super Admin
    await setRole('authenticated', SUPER_ADMIN_ID);
    const rpcRes = await db.query('SELECT public.get_saas_subscription_monitoring_inventory() AS inv;');
    assert.ok(rpcRes.rows[0].inv.subscriptions, 'Baseline inventory should still return subscriptions');
  });
});
