import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { validateTenantBilling, formatFullAddress, loadTenantBillingProfile } from '../src/lib/tenantBilling.js';
import { INDIAN_STATES, getStateCodeByName, getStateNameByCode } from '../src/lib/indianStates.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const CANONICAL_SUPER_ADMIN_ID = '9c4e65f5-c0a1-4b3a-8ed2-d01175a73409';
const TENANT_A_ID = '85f2cf19-7488-408c-b9c4-549ae762e6be';
const TENANT_B_ID = 'ff633e04-17c1-454e-9c8f-24ef74fb31a8';

// Helper to switch caller context in PGlite
async function setCallerContext(db, { role = 'authenticated', userId = null } = {}) {
  await db.exec(`
    SET SESSION "request.jwt.claim.role" = '${role}';
    SET SESSION "request.jwt.claim.sub" = '${userId || ''}';
  `);
}

async function setupDatabase() {
  const db = new PGlite();

  // 1. Core Supabase roles, schemas and auth mocks
  await db.exec(`
    DO $$ BEGIN
      IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon NOLOGIN; END IF;
      IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
      IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role NOLOGIN; END IF;
    END $$;

    CREATE SCHEMA IF NOT EXISTS auth;
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
      role text NOT NULL DEFAULT 'tenant_admin',
      plan_type text NOT NULL DEFAULT 'free',
      subscription_status text DEFAULT 'trialing',
      is_legacy_account boolean DEFAULT false,
      tenant_id uuid,
      global_settings jsonb DEFAULT '{}'::jsonb,
      created_at timestamptz DEFAULT now()
    );

    CREATE OR REPLACE FUNCTION public.is_super_admin() RETURNS boolean LANGUAGE plpgsql STABLE AS $$
    BEGIN
      RETURN EXISTS (
        SELECT 1 FROM public.profiles 
        WHERE id = auth.uid() AND role = 'super_admin'
      );
    END;
    $$;

    -- Privilege escalation trigger matching production
    CREATE OR REPLACE FUNCTION public.prevent_profile_privilege_escalation()
    RETURNS TRIGGER AS $$
    BEGIN
      IF public.is_super_admin() OR auth.role() = 'service_role' THEN
        RETURN NEW;
      END IF;

      IF current_setting('app.allow_profile_system_update', true) = 'true' THEN
        RETURN NEW;
      END IF;

      IF NEW.role IS DISTINCT FROM OLD.role THEN
        RAISE EXCEPTION 'Privilege escalation denied: profile role cannot be modified by user.' USING ERRCODE = '42501';
      END IF;

      IF NEW.tenant_id IS DISTINCT FROM OLD.tenant_id THEN
        RAISE EXCEPTION 'Privilege escalation denied: tenant_id cannot be modified by user.' USING ERRCODE = '42501';
      END IF;

      IF NEW.plan_type IS DISTINCT FROM OLD.plan_type THEN
        RAISE EXCEPTION 'Privilege escalation denied: plan_type cannot be modified directly by user.' USING ERRCODE = '42501';
      END IF;

      IF NEW.subscription_status IS DISTINCT FROM OLD.subscription_status THEN
        RAISE EXCEPTION 'Privilege escalation denied: subscription_status cannot be modified directly by user.' USING ERRCODE = '42501';
      END IF;

      IF NEW.is_legacy_account IS DISTINCT FROM OLD.is_legacy_account THEN
        RAISE EXCEPTION 'Privilege escalation denied: is_legacy_account cannot be modified directly by user.' USING ERRCODE = '42501';
      END IF;

      IF NEW.global_settings IS DISTINCT FROM OLD.global_settings THEN
        RAISE EXCEPTION 'Privilege escalation denied: global_settings cannot be modified by user.' USING ERRCODE = '42501';
      END IF;

      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

    CREATE TRIGGER trg_prevent_profile_privilege_escalation
    BEFORE UPDATE ON public.profiles
    FOR EACH ROW
    EXECUTE FUNCTION public.prevent_profile_privilege_escalation();

    CREATE TABLE public.resorts (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id uuid REFERENCES public.profiles(id),
      name text NOT NULL,
      email text,
      address text,
      created_at timestamptz DEFAULT now()
    );

    CREATE TABLE public.saas_subscriptions (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id uuid NOT NULL REFERENCES public.profiles(id),
      razorpay_subscription_id text UNIQUE NOT NULL,
      environment text NOT NULL DEFAULT 'test',
      staypilot_plan_type text NOT NULL DEFAULT 'growth',
      status text NOT NULL DEFAULT 'active'
    );

    CREATE TABLE public.saas_payments (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id uuid REFERENCES public.profiles(id),
      razorpay_payment_id text UNIQUE,
      razorpay_subscription_id text,
      amount integer NOT NULL,
      currency text DEFAULT 'INR',
      status text NOT NULL,
      environment text,
      invoice_status text,
      invoice_retry_count integer NOT NULL DEFAULT 0,
      invoice_last_error text,
      invoice_next_retry_at timestamptz,
      created_at timestamptz DEFAULT now()
    );

    CREATE SEQUENCE IF NOT EXISTS public.saas_invoice_number_seq START WITH 1001;
    CREATE SEQUENCE IF NOT EXISTS public.saas_invoice_number_seq_test START WITH 1001;
    CREATE SEQUENCE IF NOT EXISTS public.saas_invoice_number_seq_live START WITH 1001;

    CREATE TABLE public.saas_invoices (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      invoice_number text UNIQUE NOT NULL,
      tenant_id uuid NOT NULL REFERENCES public.profiles(id),
      payment_id text UNIQUE NOT NULL,
      subscription_id text NOT NULL,
      environment text NOT NULL,
      plan_type text NOT NULL,
      supplier_name text NOT NULL,
      supplier_legal_name text,
      supplier_trade_name text,
      supplier_gstin text,
      supplier_address text,
      supplier_city text,
      supplier_state text,
      supplier_state_code text,
      supplier_pincode text,
      supplier_email text,
      supplier_phone text,
      supplier_pan text,
      seller_snapshot jsonb NOT NULL,
      sac_code text,
      customer_name text NOT NULL,
      customer_email text NOT NULL,
      customer_gstin text,
      customer_address text,
      customer_state text,
      supply_place text NOT NULL,
      tax_type text NOT NULL,
      base_amount_paise bigint NOT NULL,
      gst_rate numeric NOT NULL,
      cgst_amount_paise bigint NOT NULL,
      sgst_amount_paise bigint NOT NULL,
      igst_amount_paise bigint NOT NULL,
      total_amount_paise bigint NOT NULL,
      razorpay_payment_id text,
      saas_payment_id uuid UNIQUE,
      invoice_type text NOT NULL DEFAULT 'tax_invoice',
      invoice_status text NOT NULL DEFAULT 'issued',
      issued_at timestamptz NOT NULL DEFAULT now(),
      voided_at timestamptz,
      void_reason text,
      voided_by uuid,
      metadata jsonb,
      created_at timestamptz DEFAULT now()
    );
  `);

  // Seed profiles
  await db.exec(`
    INSERT INTO public.profiles (id, email, full_name, role, plan_type, subscription_status, is_legacy_account, global_settings)
    VALUES
      ('${CANONICAL_SUPER_ADMIN_ID}', 'uhariff@gmail.com', 'Super Admin Hariff', 'super_admin', 'super_admin', 'active', true, '{"seller_identity": {"legal_name": "Stay Pilot Technologies LLP", "trade_name": "Stay Pilot", "gstin": "29AABCS1429B1ZB", "address": "123 Tech Park", "city": "Bengaluru", "state": "Karnataka", "state_code": "29", "pincode": "560001", "email": "billing@staypilot.co.in", "phone": "+919876543210"}, "pricing": {"growth": {"price": 1499}}}'::jsonb),
      ('${TENANT_A_ID}', 'tenant_a@resort.com', 'Tenant A Admin', 'tenant_admin', 'growth', 'active', false, '{"pricing": {"addon": 500}}'::jsonb),
      ('${TENANT_B_ID}', 'tenant_b@resort.com', 'Tenant B Admin', 'tenant_admin', 'free', 'trialing', false, '{}'::jsonb);
  `);

  // 2. Load Stage 3B Invoicing Engine SQL
  const stage3bSqlPath = path.join(rootDir, 'supabase', 'phase_r3_stage3b_invoicing_engine.sql');
  if (fs.existsSync(stage3bSqlPath)) {
    const stage3bSql = fs.readFileSync(stage3bSqlPath, 'utf8');
    await db.exec(stage3bSql);
  }

  // 3. Load Stage 3H Migration SQL
  const stage3hSqlPath = path.join(rootDir, 'supabase', 'migrations', '20261017180000_tenant_billing_profile_management.sql');
  const stage3hSql = fs.readFileSync(stage3hSqlPath, 'utf8');
  await db.exec(stage3hSql);

  return db;
}

test('Stage 3H: Comprehensive Automated Verification Suite (22 Scenarios)', async (t) => {
  let db;

  t.before(async () => {
    db = await setupDatabase();
  });

  const resetTenantA = async () => {
    await setCallerContext(db, { role: 'service_role' });
    await db.exec(`
      UPDATE public.profiles 
      SET global_settings = '{"pricing": {"addon": 500}}'::jsonb 
      WHERE id = '${TENANT_A_ID}';
    `);
  };

  // SCENARIO 1: Valid complete profile save
  await t.test('1. save_tenant_billing_profile accepts valid complete billing profile and returns success', async () => {
    await resetTenantA();
    await setCallerContext(db, { role: 'authenticated', userId: TENANT_A_ID });
    const payload = JSON.stringify({
      name: 'Acme Resorts Pvt Ltd',
      email: 'finance@acmeresorts.com',
      address_line1: '123 Forest View Road',
      address_line2: 'Post Box 45',
      city: 'Madikeri',
      state: 'Karnataka',
      state_code: '29',
      pincode: '571201',
      country: 'India',
      gstin: '29ABCDE1234F1Z5'
    });

    const res = await db.query(`SELECT public.save_tenant_billing_profile($1::jsonb) AS result;`, [payload]);
    const result = res.rows[0].result;
    assert.equal(result.status, 'success');
    assert.equal(result.billing.name, 'Acme Resorts Pvt Ltd');
    assert.equal(result.billing.email, 'finance@acmeresorts.com');
    assert.equal(result.billing.state_code, '29');
    assert.equal(result.billing.gstin, '29ABCDE1234F1Z5');
    assert.equal(result.billing.address, '123 Forest View Road, Post Box 45, Madikeri, Karnataka 571201');
  });

  // SCENARIO 2: Rejects missing or short name
  await t.test('2. save_tenant_billing_profile rejects missing or short name', async () => {
    await resetTenantA();
    await setCallerContext(db, { role: 'authenticated', userId: TENANT_A_ID });
    const payload = JSON.stringify({
      name: 'A',
      email: 'valid@resort.com',
      address_line1: '123 Road',
      city: 'Bengaluru',
      state: 'Karnataka',
      pincode: '560001'
    });

    await assert.rejects(
      async () => await db.query(`SELECT public.save_tenant_billing_profile($1::jsonb);`, [payload]),
      /INVALID_ARGUMENT: Billing name is required/
    );
  });

  // SCENARIO 3: Rejects missing or invalid email
  await t.test('3. save_tenant_billing_profile rejects missing or invalid email', async () => {
    await resetTenantA();
    await setCallerContext(db, { role: 'authenticated', userId: TENANT_A_ID });
    const payload = JSON.stringify({
      name: 'Acme Resorts',
      email: 'not-an-email',
      address_line1: '123 Road',
      city: 'Bengaluru',
      state: 'Karnataka',
      pincode: '560001'
    });

    await assert.rejects(
      async () => await db.query(`SELECT public.save_tenant_billing_profile($1::jsonb);`, [payload]),
      /INVALID_ARGUMENT: A valid billing email is required/
    );
  });

  // SCENARIO 4: Rejects missing address
  await t.test('4. save_tenant_billing_profile rejects missing address', async () => {
    await resetTenantA();
    await setCallerContext(db, { role: 'authenticated', userId: TENANT_A_ID });
    const payload = JSON.stringify({
      name: 'Acme Resorts',
      email: 'valid@resort.com',
      address_line1: '  ',
      city: 'Bengaluru',
      state: 'Karnataka',
      pincode: '560001'
    });

    await assert.rejects(
      async () => await db.query(`SELECT public.save_tenant_billing_profile($1::jsonb);`, [payload]),
      /INVALID_ARGUMENT: Address line 1 is required/
    );
  });

  // SCENARIO 5: Rejects missing or invalid state
  await t.test('5. save_tenant_billing_profile rejects missing or invalid state', async () => {
    await resetTenantA();
    await setCallerContext(db, { role: 'authenticated', userId: TENANT_A_ID });
    const payload = JSON.stringify({
      name: 'Acme Resorts',
      email: 'valid@resort.com',
      address_line1: '123 Road',
      city: 'Bengaluru',
      state: '',
      pincode: '560001'
    });

    await assert.rejects(
      async () => await db.query(`SELECT public.save_tenant_billing_profile($1::jsonb);`, [payload]),
      /INVALID_ARGUMENT: State is required/
    );
  });

  // SCENARIO 6: Rejects invalid PIN code (not 6 digits)
  await t.test('6. save_tenant_billing_profile rejects invalid PIN code (not 6 digits)', async () => {
    await resetTenantA();
    await setCallerContext(db, { role: 'authenticated', userId: TENANT_A_ID });
    const payload = JSON.stringify({
      name: 'Acme Resorts',
      email: 'valid@resort.com',
      address_line1: '123 Road',
      city: 'Bengaluru',
      state: 'Karnataka',
      pincode: '5600'
    });

    await assert.rejects(
      async () => await db.query(`SELECT public.save_tenant_billing_profile($1::jsonb);`, [payload]),
      /INVALID_ARGUMENT: A valid 6-digit PIN code is required/
    );
  });

  // SCENARIO 7: Accepts valid 15-char GSTIN and rejects malformed GSTIN
  await t.test('7. save_tenant_billing_profile accepts valid 15-char GSTIN and rejects malformed GSTIN', async () => {
    await resetTenantA();
    await setCallerContext(db, { role: 'authenticated', userId: TENANT_A_ID });
    const invalidGstinPayload = JSON.stringify({
      name: 'Acme Resorts',
      email: 'valid@resort.com',
      address_line1: '123 Road',
      city: 'Bengaluru',
      state: 'Karnataka',
      pincode: '560001',
      gstin: 'INVALIDGSTIN123'
    });

    await assert.rejects(
      async () => await db.query(`SELECT public.save_tenant_billing_profile($1::jsonb);`, [invalidGstinPayload]),
      /INVALID_ARGUMENT: Invalid GSTIN format/
    );

    const validGstinPayload = JSON.stringify({
      name: 'Acme Resorts',
      email: 'valid@resort.com',
      address_line1: '123 Road',
      city: 'Bengaluru',
      state: 'Karnataka',
      pincode: '560001',
      gstin: '29ABCDE1234F1Z5'
    });

    const res = await db.query(`SELECT public.save_tenant_billing_profile($1::jsonb) AS result;`, [validGstinPayload]);
    assert.equal(res.rows[0].result.status, 'success');
    assert.equal(res.rows[0].result.billing.gstin, '29ABCDE1234F1Z5');
  });

  // SCENARIO 8: Sets correct 2-digit GST state code
  await t.test('8. save_tenant_billing_profile sets correct 2-digit GST state code', async () => {
    await resetTenantA();
    await setCallerContext(db, { role: 'authenticated', userId: TENANT_A_ID });
    const payload = JSON.stringify({
      name: 'Acme Resorts',
      email: 'valid@resort.com',
      address_line1: '123 Beach Road',
      city: 'Panaji',
      state: 'Goa',
      state_code: '30',
      pincode: '403001'
    });

    const res = await db.query(`SELECT public.save_tenant_billing_profile($1::jsonb) AS result;`, [payload]);
    assert.equal(res.rows[0].result.billing.state_code, '30');
    assert.equal(res.rows[0].result.billing.state, 'Goa');
  });

  // SCENARIO 9: Requires authentication (unauthenticated caller rejected)
  await t.test('9. save_tenant_billing_profile requires authentication (unauthenticated caller rejected)', async () => {
    await setCallerContext(db, { role: 'anon', userId: null });
    const payload = JSON.stringify({
      name: 'Anonymous Hacker',
      email: 'hacker@anon.com',
      address_line1: 'Dark Web Lane',
      city: 'Unknown',
      state: 'Delhi',
      pincode: '110001'
    });

    await assert.rejects(
      async () => await db.query(`SELECT public.save_tenant_billing_profile($1::jsonb);`, [payload]),
      /UNAUTHENTICATED: Authentication required/
    );
  });

  // SCENARIO 10: Cannot be called by anonymous users
  await t.test('10. save_tenant_billing_profile cannot be called by anonymous users', async () => {
    await setCallerContext(db, { role: 'anon', userId: '' });
    await assert.rejects(
      async () => await db.query(`SELECT public.save_tenant_billing_profile('{}'::jsonb);`),
      /UNAUTHENTICATED/
    );
  });

  // SCENARIO 11: Does not trigger privilege escalation error (trigger bypass works)
  await t.test('11. save_tenant_billing_profile does not trigger privilege escalation error (trigger bypass works)', async () => {
    await resetTenantA();
    await setCallerContext(db, { role: 'authenticated', userId: TENANT_A_ID });
    
    // Direct UPDATE on global_settings from tenant MUST FAIL due to trigger
    await assert.rejects(
      async () => await db.query(`UPDATE public.profiles SET global_settings = '{"billing": {}}'::jsonb WHERE id = '${TENANT_A_ID}';`),
      /Privilege escalation denied: global_settings cannot be modified by user/
    );

    // Call through RPC MUST SUCCEED cleanly
    const payload = JSON.stringify({
      name: 'Legit Resort Admin',
      email: 'admin@legit.com',
      address_line1: '456 Hilltop',
      city: 'Shimla',
      state: 'Himachal Pradesh',
      state_code: '02',
      pincode: '171001'
    });

    const rpcRes = await db.query(`SELECT public.save_tenant_billing_profile($1::jsonb) AS result;`, [payload]);
    assert.equal(rpcRes.rows[0].result.status, 'success');
  });

  // SCENARIO 12: Does not modify other fields in global_settings (e.g., pricing, tenant_billing)
  await t.test('12. save_tenant_billing_profile does not modify other fields in global_settings', async () => {
    await resetTenantA();
    await setCallerContext(db, { role: 'authenticated', userId: TENANT_A_ID });
    
    // Check initial settings containing 'pricing': {'addon': 500}
    const preRes = await db.query(`SELECT global_settings FROM public.profiles WHERE id = '${TENANT_A_ID}';`);
    assert.equal(preRes.rows[0].global_settings.pricing.addon, 500);

    const payload = JSON.stringify({
      name: 'Acme Resorts',
      email: 'valid@resort.com',
      address_line1: '123 Road',
      city: 'Bengaluru',
      state: 'Karnataka',
      pincode: '560001'
    });
    await db.query(`SELECT public.save_tenant_billing_profile($1::jsonb);`, [payload]);

    const postRes = await db.query(`SELECT global_settings FROM public.profiles WHERE id = '${TENANT_A_ID}';`);
    assert.equal(postRes.rows[0].global_settings.pricing.addon, 500, 'Original pricing settings must be preserved');
    assert.ok(postRes.rows[0].global_settings.billing, 'Billing must be present');
    assert.equal(postRes.rows[0].global_settings.billing.city, 'Bengaluru');
  });

  // SCENARIO 13: Does not modify profile role or system columns
  await t.test('13. save_tenant_billing_profile does not modify profile role or system columns', async () => {
    await resetTenantA();
    await setCallerContext(db, { role: 'authenticated', userId: TENANT_A_ID });
    const payload = JSON.stringify({
      name: 'Acme Resorts',
      email: 'valid@resort.com',
      address_line1: '123 Road',
      city: 'Bengaluru',
      state: 'Karnataka',
      pincode: '560001'
    });
    await db.query(`SELECT public.save_tenant_billing_profile($1::jsonb);`, [payload]);

    const postRes = await db.query(`SELECT role, plan_type, subscription_status, is_legacy_account FROM public.profiles WHERE id = '${TENANT_A_ID}';`);
    assert.equal(postRes.rows[0].role, 'tenant_admin');
    assert.equal(postRes.rows[0].plan_type, 'growth');
    assert.equal(postRes.rows[0].subscription_status, 'active');
    assert.equal(postRes.rows[0].is_legacy_account, false);
  });

  // SCENARIO 14: Tenant cannot modify another tenant's billing profile
  await t.test('14. Tenant cannot modify another tenant billing profile', async () => {
    await resetTenantA();
    // Authenticate as Tenant B
    await setCallerContext(db, { role: 'authenticated', userId: TENANT_B_ID });

    const payload = JSON.stringify({
      name: 'Tenant B Resort',
      email: 'b@resort.com',
      address_line1: 'Road B',
      city: 'Chennai',
      state: 'Tamil Nadu',
      state_code: '33',
      pincode: '600001'
    });
    await db.query(`SELECT public.save_tenant_billing_profile($1::jsonb);`, [payload]);

    // Check Tenant A was NOT modified
    const tenantARes = await db.query(`SELECT global_settings FROM public.profiles WHERE id = '${TENANT_A_ID}';`);
    assert.equal(tenantARes.rows[0].global_settings.billing, undefined);

    // Check Tenant B was modified
    const tenantBRes = await db.query(`SELECT global_settings FROM public.profiles WHERE id = '${TENANT_B_ID}';`);
    assert.equal(tenantBRes.rows[0].global_settings.billing.name, 'Tenant B Resort');
  });

  // SCENARIO 15: get_tenant_billing_profile returns authenticated tenant's billing data
  await t.test('15. get_tenant_billing_profile returns authenticated tenant billing data', async () => {
    await resetTenantA();
    await setCallerContext(db, { role: 'authenticated', userId: TENANT_A_ID });
    const payload = JSON.stringify({
      name: 'Acme Resorts',
      email: 'valid@resort.com',
      address_line1: '123 Road',
      city: 'Bengaluru',
      state: 'Karnataka',
      pincode: '560001'
    });
    await db.query(`SELECT public.save_tenant_billing_profile($1::jsonb);`, [payload]);

    const res = await db.query(`SELECT public.get_tenant_billing_profile() AS billing;`);
    assert.equal(res.rows[0].billing.name, 'Acme Resorts');
    assert.equal(res.rows[0].billing.city, 'Bengaluru');
  });

  // SCENARIO 16: get_tenant_billing_profile returns empty object when no billing data exists
  await t.test('16. get_tenant_billing_profile returns empty object when no billing data exists', async () => {
    await setCallerContext(db, { role: 'service_role' });
    await db.exec(`UPDATE public.profiles SET global_settings = '{}'::jsonb WHERE id = '${TENANT_B_ID}';`);
    await setCallerContext(db, { role: 'authenticated', userId: TENANT_B_ID });
    const res = await db.query(`SELECT public.get_tenant_billing_profile() AS billing;`);
    assert.deepEqual(res.rows[0].billing, {});
  });

  // SCENARIO 17: Invoicing engine generate_saas_commercial_invoice succeeds with saved profile
  await t.test('17. Invoicing engine generate_saas_commercial_invoice succeeds with profile saved via save_tenant_billing_profile', async () => {
    await resetTenantA();
    // Save billing profile for Tenant A
    await setCallerContext(db, { role: 'authenticated', userId: TENANT_A_ID });
    const payload = JSON.stringify({
      name: 'Acme Resorts Pvt Ltd',
      email: 'finance@acmeresorts.com',
      address_line1: '123 Forest View Road',
      address_line2: 'Suite 400',
      city: 'Madikeri',
      state: 'Karnataka',
      state_code: '29',
      pincode: '571201',
      country: 'India',
      gstin: '29ABCDE1234F1Z5'
    });
    await db.query(`SELECT public.save_tenant_billing_profile($1::jsonb);`, [payload]);

    // Create subscription and payment for Tenant A
    await setCallerContext(db, { role: 'service_role' });
    await db.exec(`
      INSERT INTO public.saas_subscriptions (id, tenant_id, razorpay_subscription_id, environment, staypilot_plan_type, status)
      VALUES ('a0000000-0000-0000-0000-000000000001', '${TENANT_A_ID}', 'sub_test_stage3h_001', 'test', 'growth', 'active');
    `);
    const payRes = await db.query(`
      INSERT INTO public.saas_payments (id, tenant_id, razorpay_payment_id, razorpay_subscription_id, amount, status, environment, invoice_status)
      VALUES ('b0000000-0000-0000-0000-000000000001', '${TENANT_A_ID}', 'pay_test_stage3h_001', 'sub_test_stage3h_001', 149900, 'captured', 'test', 'pending')
      RETURNING id;
    `);
    const paymentId = payRes.rows[0].id;

    // Generate commercial invoice
    const invRes = await db.query(`
      SELECT public.generate_saas_commercial_invoice('${paymentId}'::uuid) AS invoice_id;
    `);

    assert.ok(invRes.rows[0].invoice_id, 'Invoice ID should be generated');

    // Verify payment invoice status
    const payCheck = await db.query(`SELECT invoice_status FROM public.saas_payments WHERE id = '${paymentId}';`);
    assert.equal(payCheck.rows[0].invoice_status, 'issued');
  });

  // SCENARIO 18: Invoicing engine produces correct customer snapshot
  await t.test('18. Invoicing engine produces correct customer snapshot (name, email, full address, state, state_code)', async () => {
    await resetTenantA();
    await setCallerContext(db, { role: 'authenticated', userId: TENANT_A_ID });
    const payload = JSON.stringify({
      name: 'Acme Resorts Pvt Ltd',
      email: 'finance@acmeresorts.com',
      address_line1: '123 Forest View Road',
      address_line2: 'Suite 400',
      city: 'Madikeri',
      state: 'Karnataka',
      state_code: '29',
      pincode: '571201',
      country: 'India',
      gstin: '29ABCDE1234F1Z5'
    });
    await db.query(`SELECT public.save_tenant_billing_profile($1::jsonb);`, [payload]);

    await setCallerContext(db, { role: 'service_role' });
    await db.exec(`
      INSERT INTO public.saas_subscriptions (id, tenant_id, razorpay_subscription_id, environment, staypilot_plan_type, status)
      VALUES ('a0000000-0000-0000-0000-000000000002', '${TENANT_A_ID}', 'sub_test_stage3h_002', 'test', 'growth', 'active');
    `);
    const payRes = await db.query(`
      INSERT INTO public.saas_payments (id, tenant_id, razorpay_payment_id, razorpay_subscription_id, amount, status, environment, invoice_status)
      VALUES ('b0000000-0000-0000-0000-000000000002', '${TENANT_A_ID}', 'pay_test_stage3h_002', 'sub_test_stage3h_002', 149900, 'captured', 'test', 'pending')
      RETURNING id;
    `);
    const paymentId = payRes.rows[0].id;

    const invRes = await db.query(`
      SELECT public.generate_saas_commercial_invoice('${paymentId}'::uuid) AS invoice_id;
    `);

    const inv = await db.query(`SELECT * FROM public.saas_invoices WHERE id = '${invRes.rows[0].invoice_id}';`);
    const invoiceRow = inv.rows[0];
    assert.equal(invoiceRow.customer_name, 'Acme Resorts Pvt Ltd');
    assert.equal(invoiceRow.customer_email, 'finance@acmeresorts.com');
    assert.equal(invoiceRow.customer_address, '123 Forest View Road, Suite 400, Madikeri, Karnataka 571201');
    assert.equal(invoiceRow.customer_state, 'Karnataka');
    assert.equal(invoiceRow.customer_gstin, '29ABCDE1234F1Z5');
  });

  // SCENARIO 19: Voiding an invoice preserves customer billing snapshot (immutability)
  await t.test('19. Voiding an invoice preserves customer billing snapshot (snapshot immutability)', async () => {
    await resetTenantA();
    await setCallerContext(db, { role: 'authenticated', userId: TENANT_A_ID });
    const payload = JSON.stringify({
      name: 'Acme Resorts Pvt Ltd',
      email: 'finance@acmeresorts.com',
      address_line1: '123 Forest View Road',
      city: 'Madikeri',
      state: 'Karnataka',
      pincode: '571201'
    });
    await db.query(`SELECT public.save_tenant_billing_profile($1::jsonb);`, [payload]);

    await setCallerContext(db, { role: 'service_role' });
    await db.exec(`
      INSERT INTO public.saas_subscriptions (id, tenant_id, razorpay_subscription_id, environment, staypilot_plan_type, status)
      VALUES ('a0000000-0000-0000-0000-000000000003', '${TENANT_A_ID}', 'sub_test_stage3h_003', 'test', 'growth', 'active');
    `);
    const payRes = await db.query(`
      INSERT INTO public.saas_payments (id, tenant_id, razorpay_payment_id, razorpay_subscription_id, amount, status, environment, invoice_status)
      VALUES ('b0000000-0000-0000-0000-000000000003', '${TENANT_A_ID}', 'pay_test_stage3h_003', 'sub_test_stage3h_003', 149900, 'captured', 'test', 'pending')
      RETURNING id;
    `);
    const paymentId = payRes.rows[0].id;

    const invRes = await db.query(`
      SELECT public.generate_saas_commercial_invoice('${paymentId}'::uuid) AS invoice_id;
    `);
    const invoiceId = invRes.rows[0].invoice_id;

    // Void the invoice as super_admin
    await setCallerContext(db, { role: 'authenticated', userId: CANONICAL_SUPER_ADMIN_ID });
    await db.query(`SELECT public.void_saas_invoice('${invoiceId}'::uuid, 'Customer requested plan cancellation');`);

    const voidedRow = (await db.query(`SELECT * FROM public.saas_invoices WHERE id = '${invoiceId}';`)).rows[0];
    assert.equal(voidedRow.invoice_status, 'void');
    assert.equal(voidedRow.customer_name, 'Acme Resorts Pvt Ltd');
    assert.equal(voidedRow.customer_email, 'finance@acmeresorts.com');
    assert.equal(voidedRow.customer_address, '123 Forest View Road, Madikeri, Karnataka 571201');
    assert.equal(voidedRow.void_reason, 'Customer requested plan cancellation');
  });

  // SCENARIO 20: Edge function razorpay-create-subscription pre-validation blocks checkout when billing is missing
  await t.test('20. Edge function razorpay-create-subscription pre-validation logic blocks checkout when billing is missing', () => {
    // Incomplete profile simulation
    const incompleteProfile = {
      id: TENANT_B_ID,
      role: 'tenant_admin',
      full_name: 'Tenant B Admin',
      global_settings: {}
    };

    const b = loadTenantBillingProfile(incompleteProfile);
    const missing = [];
    if (!b.name || b.name.length < 2) missing.push('name');
    if (!b.email || !b.email.includes('@')) missing.push('email');
    if (!b.address_line1 || b.address_line1.length < 3) missing.push('address');
    if (!b.state || b.state.length < 2) missing.push('state');

    assert.ok(missing.includes('email'), 'Email must be flagged missing');
    assert.ok(missing.includes('address'), 'Address must be flagged missing');
    assert.ok(missing.includes('state'), 'State must be flagged missing');
    assert.equal(missing.length >= 3, true);
  });

  // SCENARIO 21: Frontend billing validation catches invalid input before submission
  await t.test('21. Frontend billing validation catches invalid input before submission', () => {
    // Empty object
    const emptyRes = validateTenantBilling({});
    assert.equal(emptyRes.isValid, false);
    assert.ok(emptyRes.missingFields.includes('name'));
    assert.ok(emptyRes.missingFields.includes('email'));
    assert.ok(emptyRes.missingFields.includes('address'));
    assert.ok(emptyRes.missingFields.includes('city'));
    assert.ok(emptyRes.missingFields.includes('state'));
    assert.ok(emptyRes.missingFields.includes('pincode'));

    // Malformed PIN code
    const invalidPinRes = validateTenantBilling({
      name: 'Resort',
      email: 'admin@resort.com',
      address_line1: '123 Way',
      city: 'Mysuru',
      state: 'Karnataka',
      pincode: '57000' // 5 digits
    });
    assert.equal(invalidPinRes.isValid, false);
    assert.ok(invalidPinRes.errors.pincode);

    // Valid object
    const validRes = validateTenantBilling({
      name: 'Grand Resort',
      email: 'admin@grandresort.com',
      address_line1: '123 Way',
      city: 'Mysuru',
      state: 'Karnataka',
      pincode: '570001',
      gstin: '29ABCDE1234F1Z5'
    });
    assert.equal(validRes.isValid, true);
    assert.equal(validRes.missingFields.length, 0);

    // State code helpers
    assert.equal(getStateCodeByName('Karnataka'), '29');
    assert.equal(getStateCodeByName('Maharashtra'), '27');
    assert.equal(getStateNameByCode('32'), 'Kerala');
    assert.equal(INDIAN_STATES.length, 37);
  });

  // SCENARIO 22: Super Admin can update delegated tenant billing profile using p_tenant_id
  await t.test('22. Super Admin can update delegated tenant billing profile using p_tenant_id', async () => {
    await resetTenantA();
    await setCallerContext(db, { role: 'authenticated', userId: CANONICAL_SUPER_ADMIN_ID });

    const payload = JSON.stringify({
      name: 'Tenant A Assisted Setup',
      email: 'assisted@tenant-a.com',
      address_line1: '99 Support Avenue',
      city: 'Bengaluru',
      state: 'Karnataka',
      pincode: '560001'
    });

    const res = await db.query(
      `SELECT public.save_tenant_billing_profile($1::jsonb, $2::uuid) AS result;`,
      [payload, TENANT_A_ID]
    );

    assert.equal(res.rows[0].result.status, 'success');
    assert.equal(res.rows[0].result.tenant_id, TENANT_A_ID);
    assert.equal(res.rows[0].result.billing.name, 'Tenant A Assisted Setup');

    // Verify Tenant A profile was updated in DB
    const check = await db.query(`SELECT global_settings->'billing'->>'name' as name FROM public.profiles WHERE id = '${TENANT_A_ID}';`);
    assert.equal(check.rows[0].name, 'Tenant A Assisted Setup');
  });

  // SCENARIO 23: Tenant admin cannot modify another tenant's billing profile via p_tenant_id
  await t.test('23. Tenant admin cannot modify another tenant billing profile via p_tenant_id (spoofing denied)', async () => {
    await setCallerContext(db, { role: 'authenticated', userId: TENANT_A_ID });

    const attackPayload = JSON.stringify({
      name: 'Malicious Overwrite',
      email: 'attacker@evil.com',
      address_line1: '666 Exploit Road',
      city: 'Darknet',
      state: 'Goa',
      pincode: '403001'
    });

    await assert.rejects(
      async () => await db.query(
        `SELECT public.save_tenant_billing_profile($1::jsonb, $2::uuid);`,
        [attackPayload, TENANT_B_ID]
      ),
      /FORBIDDEN: Tenant administrators cannot modify billing profiles of other accounts/
    );
  });

  // SCENARIO 24: SQL auto-derives GST state code when state_code is omitted
  await t.test('24. SQL auto-derives GST state code when state_code is omitted', async () => {
    await resetTenantA();
    await setCallerContext(db, { role: 'authenticated', userId: TENANT_A_ID });

    const payloadWithoutStateCode = JSON.stringify({
      name: 'Auto State Code Resort',
      email: 'auto@resort.com',
      address_line1: '77 Hill View Road',
      city: 'Madikeri',
      state: 'Karnataka', // Omit state_code
      pincode: '571201'
    });

    const res = await db.query(`SELECT public.save_tenant_billing_profile($1::jsonb) AS result;`, [payloadWithoutStateCode]);
    assert.equal(res.rows[0].result.billing.state_code, '29', 'State code for Karnataka must be automatically derived as 29');
  });

  // SCENARIO 25: Optional phone is sanitized, validated, and stored in billing profile
  await t.test('25. Optional phone is sanitized, validated, and stored in billing profile', async () => {
    await resetTenantA();
    await setCallerContext(db, { role: 'authenticated', userId: TENANT_A_ID });

    // Valid phone
    const validPhonePayload = JSON.stringify({
      name: 'Phone Test Resort',
      email: 'phone@resort.com',
      phone: '+91 98765 43210',
      address_line1: '10 Park Avenue',
      city: 'Bengaluru',
      state: 'Karnataka',
      pincode: '560001'
    });

    const res = await db.query(`SELECT public.save_tenant_billing_profile($1::jsonb) AS result;`, [validPhonePayload]);
    assert.equal(res.rows[0].result.billing.phone, '+91 98765 43210');

    // Phone exceeding 25 characters rejected
    const longPhonePayload = JSON.stringify({
      name: 'Long Phone Resort',
      email: 'phone@resort.com',
      phone: '+91 98765 43210 123456789012345',
      address_line1: '10 Park Avenue',
      city: 'Bengaluru',
      state: 'Karnataka',
      pincode: '560001'
    });

    await assert.rejects(
      async () => await db.query(`SELECT public.save_tenant_billing_profile($1::jsonb);`, [longPhonePayload]),
      /Phone number cannot exceed 25 characters/
    );
  });

  // SCENARIO 26: Service role can update tenant billing profile when p_tenant_id is supplied
  await t.test('26. Service role can update tenant billing profile when p_tenant_id is supplied', async () => {
    await resetTenantA();
    await setCallerContext(db, { role: 'service_role' });

    const backendPayload = JSON.stringify({
      name: 'Service Role Updated Name',
      email: 'backend@system.com',
      address_line1: '1 System Core Road',
      city: 'Bengaluru',
      state: 'Karnataka',
      pincode: '560001'
    });

    const res = await db.query(
      `SELECT public.save_tenant_billing_profile($1::jsonb, $2::uuid) AS result;`,
      [backendPayload, TENANT_A_ID]
    );

    assert.equal(res.rows[0].result.status, 'success');
    assert.equal(res.rows[0].result.tenant_id, TENANT_A_ID);

    // Service role call without p_tenant_id rejected
    await assert.rejects(
      async () => await db.query(`SELECT public.save_tenant_billing_profile($1::jsonb);`, [backendPayload]),
      /p_tenant_id is required in service_role context/
    );
  });

  // SCENARIO 27: Rollback script cleanly removes all Stage 3H objects without affecting Stage 3B–3G objects
  await t.test('27. Rollback script cleanly removes all Stage 3H objects without affecting Stage 3B–3G objects', async () => {
    const rollbackSqlPath = path.join(rootDir, 'supabase', 'migrations', 'rollback_20261017180000_tenant_billing_profile_management.sql');
    const rollbackSql = fs.readFileSync(rollbackSqlPath, 'utf8');
    await db.exec(rollbackSql);

    // Verify Stage 3H functions are dropped
    const funcCheck = await db.query(`
      SELECT routine_name 
      FROM information_schema.routines 
      WHERE routine_schema = 'public' 
        AND routine_name IN ('save_tenant_billing_profile', 'get_tenant_billing_profile', 'save_tenant_guest_gst_settings');
    `);
    assert.equal(funcCheck.rows.length, 0, 'Stage 3H RPC functions must be dropped');

    // Verify Stage 3B functions are preserved intact
    const stage3bCheck = await db.query(`
      SELECT routine_name 
      FROM information_schema.routines 
      WHERE routine_schema = 'public' 
        AND routine_name IN ('generate_saas_commercial_invoice', 'void_saas_invoice', 'process_subscription_webhook');
    `);
    assert.equal(stage3bCheck.rows.length, 3, 'Stage 3B functions must remain intact after Stage 3H rollback');
  });
});
