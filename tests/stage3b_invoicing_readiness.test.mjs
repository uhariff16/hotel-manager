import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import path from 'node:path';

describe('Stage 3B Invoicing Engine Production Readiness & Blocker Corrections Verification', () => {
  let db;

  const CANONICAL_SUPER_ADMIN_ID = '9c4e65f5-c0a1-4b3a-8ed2-d01175a73409';
  const SECONDARY_SUPER_ADMIN_ID = 'a9ec6d2f-5afa-406b-87ce-109913dead89';
  const TENANT_ID = '3797dba7-a7fd-4ca6-86cb-b45519953947'; // Cheerful Chalet
  const OPERATOR_ID = 'a9ec6d2f-5afa-406b-87ce-109913dead89';

  before(async () => {
    db = new PGlite();

    // 1. Setup base schema matching production Supabase
    await db.exec(`
      CREATE SCHEMA IF NOT EXISTS auth;
      CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
        SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid;
      $$;
      CREATE ROLE anon NOLOGIN;
      CREATE ROLE authenticated NOLOGIN;
      CREATE ROLE service_role NOLOGIN;
      CREATE ROLE authenticator NOLOGIN;
      GRANT anon, authenticated, service_role TO authenticator;
      GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;
      GRANT EXECUTE ON FUNCTION auth.uid() TO anon, authenticated, service_role;

      CREATE TABLE public.profiles (
        id uuid PRIMARY KEY,
        email text,
        role text NOT NULL DEFAULT 'tenant_admin',
        tenant_id uuid,
        plan_type text DEFAULT 'free',
        subscription_status text,
        is_legacy_account boolean DEFAULT false,
        full_name text,
        created_at timestamptz DEFAULT now(),
        global_settings jsonb DEFAULT '{}'::jsonb
      );

      CREATE TABLE public.resorts (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid REFERENCES public.profiles(id),
        name text,
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
        status text NOT NULL DEFAULT 'created',
        current_period_start timestamptz,
        current_period_end timestamptz,
        cancel_at_period_end boolean DEFAULT false,
        checkout_token text,
        checkout_expires_at timestamptz,
        created_at timestamptz DEFAULT now()
      );

      CREATE TABLE public.saas_payments (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid REFERENCES public.profiles(id),
        razorpay_payment_id text UNIQUE,
        razorpay_subscription_id text,
        razorpay_invoice_id text,
        amount integer NOT NULL,
        currency text DEFAULT 'INR',
        status text NOT NULL,
        payment_method text,
        environment text,
        invoice_status text,
        invoice_retry_count integer NOT NULL DEFAULT 0,
        invoice_last_error text,
        invoice_next_retry_at timestamptz,
        created_at timestamptz DEFAULT now()
      );

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
        invoice_type text NOT NULL,
        invoice_status text NOT NULL,
        issued_at timestamptz NOT NULL,
        created_at timestamptz NOT NULL
      );

      CREATE SEQUENCE public.saas_invoice_number_seq START WITH 1001;
      CREATE SEQUENCE public.saas_invoice_number_seq_live START WITH 1001;
      CREATE SEQUENCE public.saas_invoice_number_seq_test START WITH 1001;
    `);

    // 2. Insert Canonical Super Admin (with gstin in seller_identity to test that it is NOT exposed when GST is off)
    // and Secondary Super Admin (to test strict canonical isolation)
    await db.exec(`
      INSERT INTO public.profiles (id, email, role, plan_type, subscription_status, is_legacy_account, global_settings)
      VALUES (
        '${CANONICAL_SUPER_ADMIN_ID}',
        'uhariff@gmail.com',
        'super_admin',
        'super_admin',
        'active',
        true,
        '{"seller_identity": {"legal_name": "Stay Pilot Technologies LLP", "trade_name": "Stay Pilot", "gstin": "29AABCS1429B1ZB", "address": "123 Tech Park", "city": "Bengaluru", "state": "Karnataka", "state_code": "29", "pincode": "560001", "email": "billing@staypilot.co.in", "phone": "+919876543210"}, "pricing": {"growth": {"price": 1499, "monthlyPrice": 1499}, "pro": {"price": 1499, "monthlyPrice": 1499}, "custom_1786983013013": {"price": 499, "monthlyPrice": 499}, "premium": {"price": 2499, "monthlyPrice": 2499}}}'::jsonb
      );

      INSERT INTO public.profiles (id, email, role, plan_type, subscription_status, is_legacy_account, global_settings)
      VALUES (
        '${SECONDARY_SUPER_ADMIN_ID}',
        'secondary@staypilot.co.in',
        'super_admin',
        'super_admin',
        'active',
        true,
        '{"seller_identity": {"legal_name": "Attacker Impostor LLP", "trade_name": "Impostor Pilot", "address": "999 Hack Way", "city": "Mumbai", "state": "Maharashtra", "state_code": "27", "pincode": "400001", "email": "impostor@staypilot.co.in"}}'::jsonb
      );

      INSERT INTO public.profiles (id, email, role, full_name, plan_type, subscription_status, is_legacy_account, global_settings)
      VALUES (
        '${TENANT_ID}',
        'cheerful@chalet.com',
        'tenant_admin',
        'Cheerful Chalet Admin',
        'premium',
        'active',
        true,
        '{"billing": {"name": "Cheerful Chalet Resorts", "email": "billing@chalet.com", "address": "Hilltop Road, Munnar", "state": "Kerala", "state_code": "32"}}'::jsonb
      );

      INSERT INTO public.resorts (tenant_id, name, email, address)
      VALUES ('${TENANT_ID}', 'Cheerful Chalet Resort', 'info@chalet.com', 'Munnar Hills, Kerala');
    `);

    // 3. Insert Historical Payments (environment NULL, invoice_status NULL)
    await db.exec(`
      INSERT INTO public.saas_payments (id, tenant_id, razorpay_payment_id, amount, status, environment, invoice_status)
      VALUES 
        ('457b74be-cc85-4e9e-b58a-5e6e54ce23a4', '${TENANT_ID}', 'pay_TlGj9DqKC2OcfM', 149900, 'captured', NULL, NULL),
        ('b09c76ca-a60a-4e5c-a283-df6ee46c5d9c', '${TENANT_ID}', 'pay_TlPsZJSTTF5pep', 249900, 'captured', NULL, NULL);
    `);

    // 4. Apply Stage 3B Invoicing Engine SQL
    const stage3bSqlPath = path.resolve(process.cwd(), 'supabase/archived/phase_r3_stage3b_invoicing_engine.sql');
    const stage3bSql = fs.readFileSync(stage3bSqlPath, 'utf8');
    await db.exec(stage3bSql);
  });

  test('1. Historical payment protection: unmigrated payments fail closed and cannot be invoiced', async () => {
    await assert.rejects(
      async () => {
        await db.query(`SELECT public.generate_saas_commercial_invoice('457b74be-cc85-4e9e-b58a-5e6e54ce23a4'::uuid);`);
      },
      (err) => {
        assert.match(err.message, /HISTORICAL_PAYMENT_PROTECTED/);
        return true;
      }
    );

    // Verify 0 invoices exist
    const res = await db.query(`SELECT count(*) as count FROM public.saas_invoices;`);
    assert.equal(Number(res.rows[0].count), 0);
  });

  test('2. Captured payment processing: generates commercial invoice with isolated test sequence', async () => {
    // Create a live test subscription
    await db.exec(`
      INSERT INTO public.saas_subscriptions (tenant_id, razorpay_subscription_id, environment, staypilot_plan_type, status)
      VALUES ('${TENANT_ID}', 'sub_test_12345', 'test', 'growth', 'created');
    `);

    // Trigger webhook for captured payment
    const webhookRes = await db.query(`
      SELECT public.process_subscription_webhook(
        'sub_test_12345',
        'subscription.charged',
        'test',
        'active',
        NOW(),
        NOW() + INTERVAL '30 days',
        'pay_test_capture_001',
        149900,
        'INR',
        'captured',
        'card',
        'inv_rzp_001'
      ) as result;
    `);

    const result = webhookRes.rows[0].result;
    assert.equal(result.status, 'success');

    // Verify payment record in database
    const payRes = await db.query(`
      SELECT * FROM public.saas_payments WHERE razorpay_payment_id = 'pay_test_capture_001';
    `);
    assert.equal(payRes.rows.length, 1);
    const payment = payRes.rows[0];
    assert.equal(payment.status, 'captured');
    assert.equal(payment.environment, 'test');
    assert.equal(payment.invoice_status, 'issued');

    // Verify invoice record in database
    const invRes = await db.query(`
      SELECT * FROM public.saas_invoices WHERE payment_id = 'pay_test_capture_001';
    `);
    assert.equal(invRes.rows.length, 1);
    const invoice = invRes.rows[0];

    // Check numbering format: SP-TEST-INV-YYYY-XXXXX
    assert.match(invoice.invoice_number, /^SP-TEST-INV-\d{4}-01001$/);
    assert.equal(invoice.invoice_type, 'commercial_invoice');
    assert.equal(invoice.invoice_status, 'issued');
    assert.equal(invoice.tax_type, 'unregistered');
    assert.equal(Number(invoice.gst_rate), 0);
    assert.equal(Number(invoice.cgst_amount_paise), 0);
    assert.equal(Number(invoice.sgst_amount_paise), 0);
    assert.equal(Number(invoice.igst_amount_paise), 0);
    assert.equal(Number(invoice.base_amount_paise), 149900);
    assert.equal(Number(invoice.total_amount_paise), 149900);
    assert.equal(invoice.customer_name, 'Cheerful Chalet Resorts');
    assert.equal(invoice.customer_email, 'billing@chalet.com');

    // Correction 2: Non-GST supplier_gstin must be strictly NULL
    assert.equal(invoice.supplier_gstin, null);
  });

  test('3. Duplicate webhook / replay attack: strictly idempotent, no duplicate invoice or payment', async () => {
    // Deliver exact same captured payment webhook a second time
    const webhookRes2 = await db.query(`
      SELECT public.process_subscription_webhook(
        'sub_test_12345',
        'subscription.charged',
        'test',
        'active',
        NOW(),
        NOW() + INTERVAL '30 days',
        'pay_test_capture_001',
        149900,
        'INR',
        'captured',
        'card',
        'inv_rzp_001'
      ) as result;
    `);

    assert.equal(webhookRes2.rows[0].result.status, 'success');

    // Confirm exactly ONE payment row exists
    const payRes = await db.query(`
      SELECT count(*) as count FROM public.saas_payments WHERE razorpay_payment_id = 'pay_test_capture_001';
    `);
    assert.equal(Number(payRes.rows[0].count), 1);

    // Confirm exactly ONE invoice row exists
    const invRes = await db.query(`
      SELECT count(*) as count FROM public.saas_invoices WHERE payment_id = 'pay_test_capture_001';
    `);
    assert.equal(Number(invRes.rows[0].count), 1);
  });

  test('4. Immutability trigger: blocks DELETE unconditionally and blocks unauthorized UPDATE', async () => {
    const invRes = await db.query(`SELECT id FROM public.saas_invoices LIMIT 1;`);
    const invoiceId = invRes.rows[0].id;

    // Direct DELETE must be rejected
    await assert.rejects(
      async () => {
        await db.query(`DELETE FROM public.saas_invoices WHERE id = '${invoiceId}';`);
      },
      (err) => {
        assert.match(err.message, /INVOICE_IMMUTABLE/);
        return true;
      }
    );

    // Arbitrary UPDATE (e.g. changing amount or customer) must be rejected
    await assert.rejects(
      async () => {
        await db.query(`UPDATE public.saas_invoices SET total_amount_paise = 9999 WHERE id = '${invoiceId}';`);
      },
      (err) => {
        assert.match(err.message, /INVOICE_IMMUTABLE/);
        return true;
      }
    );
  });

  test('5. Authorized void RPC: records void_reason, operator and timestamp while preserving financial snapshots', async () => {
    const invRes = await db.query(`SELECT id FROM public.saas_invoices LIMIT 1;`);
    const invoiceId = invRes.rows[0].id;

    // Void with valid reason and operator
    await db.query(`
      SELECT public.void_saas_invoice('${invoiceId}'::uuid, 'Customer requested refund due to billing discrepancy', '${OPERATOR_ID}'::uuid);
    `);

    // Verify invoice state is void
    const updatedRes = await db.query(`SELECT * FROM public.saas_invoices WHERE id = '${invoiceId}';`);
    const invoice = updatedRes.rows[0];
    assert.equal(invoice.invoice_status, 'void');
    assert.equal(invoice.void_reason, 'Customer requested refund due to billing discrepancy');
    assert.equal(invoice.voided_by, OPERATOR_ID);
    assert.ok(invoice.voided_at);

    // Once void, further modifications are permanently rejected
    await assert.rejects(
      async () => {
        await db.query(`UPDATE public.saas_invoices SET void_reason = 'Another reason' WHERE id = '${invoiceId}';`);
      },
      (err) => {
        assert.match(err.message, /INVOICE_IMMUTABLE/);
        return true;
      }
    );
  });

  test('6. Non-blocking failure: tenant with missing billing details enters manual_review without rolling back payment', async () => {
    // Create tenant without billing address or state
    const tenant2Id = '11111111-2222-3333-4444-555555555555';
    await db.exec(`
      INSERT INTO public.profiles (id, email, role, full_name, plan_type)
      VALUES ('${tenant2Id}', 'incomplete@tenant.com', 'tenant_admin', 'Incomplete Tenant', 'free');

      INSERT INTO public.saas_subscriptions (tenant_id, razorpay_subscription_id, environment, staypilot_plan_type, status)
      VALUES ('${tenant2Id}', 'sub_test_incomplete', 'test', 'growth', 'created');
    `);

    // Webhook delivers captured payment
    const webhookRes = await db.query(`
      SELECT public.process_subscription_webhook(
        'sub_test_incomplete',
        'subscription.charged',
        'test',
        'active',
        NOW(),
        NOW() + INTERVAL '30 days',
        'pay_test_incomplete_001',
        149900,
        'INR',
        'captured',
        'card',
        'inv_rzp_incomplete'
      ) as result;
    `);

    assert.equal(webhookRes.rows[0].result.status, 'success');

    // Payment is preserved with status 'captured', but invoice_status transitions to 'manual_review'
    const payRes = await db.query(`
      SELECT * FROM public.saas_payments WHERE razorpay_payment_id = 'pay_test_incomplete_001';
    `);
    assert.equal(payRes.rows.length, 1);
    const payment = payRes.rows[0];
    assert.equal(payment.status, 'captured');
    assert.equal(payment.invoice_status, 'manual_review');
    assert.match(payment.invoice_last_error, /MISSING_BILLING_DETAILS/);
    assert.equal(payment.invoice_retry_count, 1);
    assert.ok(payment.invoice_next_retry_at);

    // Subscription status is still active (non-blocking)
    const subRes = await db.query(`
      SELECT status FROM public.saas_subscriptions WHERE razorpay_subscription_id = 'sub_test_incomplete';
    `);
    assert.equal(subRes.rows[0].status, 'active');
  });

  test('7. Cheerful Chalet lifetime entitlement protection: is_legacy_account remains premium', async () => {
    // Deliver subscription cancelled for Cheerful Chalet
    await db.query(`
      SELECT public.process_subscription_webhook(
        'sub_test_12345',
        'subscription.cancelled',
        'test',
        'cancelled',
        NOW(),
        NOW() - INTERVAL '1 day'
      );
    `);

    // Cheerful Chalet profile plan_type MUST remain 'premium'
    const profileRes = await db.query(`
      SELECT plan_type, is_legacy_account FROM public.profiles WHERE id = '${TENANT_ID}';
    `);
    assert.equal(profileRes.rows[0].plan_type, 'premium');
    assert.equal(profileRes.rows[0].is_legacy_account, true);
  });

  test('8. GST Activation Logic: draft, pending, future-dated remain non-GST commercial invoices', async () => {
    // Create new test subscription
    await db.exec(`
      INSERT INTO public.saas_subscriptions (tenant_id, razorpay_subscription_id, environment, staypilot_plan_type, status)
      VALUES ('${TENANT_ID}', 'sub_test_gst_cases', 'test', 'growth', 'active');
    `);

    // Case A: Draft status with enabled=true -> MUST be commercial invoice
    await db.exec(`
      UPDATE public.profiles
      SET global_settings = jsonb_set(
        global_settings,
        '{gst_configuration}',
        '{"enabled": true, "status": "draft", "rate_percent": 18, "gstin": "29AABCS1429B1ZB", "pricing_mode": "inclusive"}'::jsonb
      )
      WHERE id = '${CANONICAL_SUPER_ADMIN_ID}';
    `);

    await db.query(`
      SELECT public.process_subscription_webhook(
        'sub_test_gst_cases', 'subscription.charged', 'test', 'active',
        NOW(), NOW() + INTERVAL '30 days', 'pay_test_gst_draft', 149900, 'INR', 'captured', 'card', 'inv_01'
      );
    `);

    const invDraft = (await db.query(`SELECT * FROM public.saas_invoices WHERE payment_id = 'pay_test_gst_draft';`)).rows[0];
    assert.equal(invDraft.invoice_type, 'commercial_invoice');
    assert.equal(invDraft.tax_type, 'unregistered');
    assert.equal(Number(invDraft.gst_rate), 0);
    assert.equal(invDraft.supplier_gstin, null);
    assert.equal(Number(invDraft.base_amount_paise), 149900);

    // Case B: Pending verification status -> MUST be commercial invoice
    await db.exec(`
      UPDATE public.profiles
      SET global_settings = jsonb_set(
        global_settings,
        '{gst_configuration,status}',
        '"pending_verification"'::jsonb
      )
      WHERE id = '${CANONICAL_SUPER_ADMIN_ID}';
    `);

    await db.query(`
      SELECT public.process_subscription_webhook(
        'sub_test_gst_cases', 'subscription.charged', 'test', 'active',
        NOW(), NOW() + INTERVAL '30 days', 'pay_test_gst_pending', 149900, 'INR', 'captured', 'card', 'inv_02'
      );
    `);

    const invPending = (await db.query(`SELECT * FROM public.saas_invoices WHERE payment_id = 'pay_test_gst_pending';`)).rows[0];
    assert.equal(invPending.invoice_type, 'commercial_invoice');
    assert.equal(invPending.tax_type, 'unregistered');
    assert.equal(Number(invPending.gst_rate), 0);
    assert.equal(invPending.supplier_gstin, null);

    // Case C: Status active BUT future effective date (e.g. in 30 days) -> MUST be commercial invoice
    await db.exec(`
      UPDATE public.profiles
      SET global_settings = jsonb_set(
        jsonb_set(global_settings, '{gst_configuration,status}', '"active"'::jsonb),
        '{gst_configuration,effective_from}',
        to_jsonb((NOW() + INTERVAL '30 days')::text)
      )
      WHERE id = '${CANONICAL_SUPER_ADMIN_ID}';
    `);

    await db.query(`
      SELECT public.process_subscription_webhook(
        'sub_test_gst_cases', 'subscription.charged', 'test', 'active',
        NOW(), NOW() + INTERVAL '30 days', 'pay_test_gst_future', 149900, 'INR', 'captured', 'card', 'inv_03'
      );
    `);

    const invFuture = (await db.query(`SELECT * FROM public.saas_invoices WHERE payment_id = 'pay_test_gst_future';`)).rows[0];
    assert.equal(invFuture.invoice_type, 'commercial_invoice');
    assert.equal(invFuture.tax_type, 'unregistered');
    assert.equal(Number(invFuture.gst_rate), 0);
    assert.equal(invFuture.supplier_gstin, null);

    // Case D: Fully active AND effective date reached -> MUST generate Tax Invoice with GSTIN
    await db.exec(`
      UPDATE public.profiles
      SET global_settings = jsonb_set(
        global_settings,
        '{gst_configuration,effective_from}',
        to_jsonb((NOW() - INTERVAL '1 day')::text)
      )
      WHERE id = '${CANONICAL_SUPER_ADMIN_ID}';
    `);

    await db.query(`
      SELECT public.process_subscription_webhook(
        'sub_test_gst_cases', 'subscription.charged', 'test', 'active',
        NOW(), NOW() + INTERVAL '30 days', 'pay_test_gst_active', 149900, 'INR', 'captured', 'card', 'inv_04'
      );
    `);

    const invActive = (await db.query(`SELECT * FROM public.saas_invoices WHERE payment_id = 'pay_test_gst_active';`)).rows[0];
    assert.equal(invActive.invoice_type, 'tax_invoice');
    assert.equal(invActive.tax_type, 'inter_state'); // Seller KA (29), Customer KL (32)
    assert.equal(Number(invActive.gst_rate), 18);
    assert.equal(invActive.supplier_gstin, '29AABCS1429B1ZB');
    assert.equal(Number(invActive.total_amount_paise), 149900);
    assert.ok(Number(invActive.igst_amount_paise) > 0);
    assert.equal(Number(invActive.cgst_amount_paise), 0);
    assert.equal(Number(invActive.sgst_amount_paise), 0);

    // Reset GST configuration back to disabled
    await db.exec(`
      UPDATE public.profiles
      SET global_settings = global_settings - 'gst_configuration'
      WHERE id = '${CANONICAL_SUPER_ADMIN_ID}';
    `);
  });

  test('9. Canonical Seller Identity: strictly uses canonical Super Admin UUID 9c4e65f5-c0a1-4b3a-8ed2-d01175a73409', async () => {
    // Verify secondary admin cannot spoof seller identity
    await db.exec(`
      INSERT INTO public.saas_subscriptions (tenant_id, razorpay_subscription_id, environment, staypilot_plan_type, status)
      VALUES ('${TENANT_ID}', 'sub_test_canonical', 'test', 'growth', 'active');
    `);

    await db.query(`
      SELECT public.process_subscription_webhook(
        'sub_test_canonical', 'subscription.charged', 'test', 'active',
        NOW(), NOW() + INTERVAL '30 days', 'pay_test_canonical_01', 149900, 'INR', 'captured', 'card', 'inv_can_01'
      );
    `);

    const inv = (await db.query(`SELECT * FROM public.saas_invoices WHERE payment_id = 'pay_test_canonical_01';`)).rows[0];
    // Must be Stay Pilot Technologies LLP (canonical), NOT Attacker Impostor LLP (secondary)
    assert.equal(inv.supplier_legal_name, 'Stay Pilot Technologies LLP');
    assert.equal(inv.supplier_trade_name, 'Stay Pilot');
    assert.equal(inv.supplier_city, 'Bengaluru');
  });

  test('10. Missing Canonical Seller Identity fails closed without falling back to secondary profile', async () => {
    // Temporarily clear seller_identity from canonical profile
    await db.exec(`
      UPDATE public.profiles
      SET global_settings = global_settings - 'seller_identity'
      WHERE id = '${CANONICAL_SUPER_ADMIN_ID}';
    `);

    await db.query(`
      SELECT public.process_subscription_webhook(
        'sub_test_canonical', 'subscription.charged', 'test', 'active',
        NOW(), NOW() + INTERVAL '30 days', 'pay_test_missing_seller', 149900, 'INR', 'captured', 'card', 'inv_fail_01'
      );
    `);

    const payFail = (await db.query(`SELECT * FROM public.saas_payments WHERE razorpay_payment_id = 'pay_test_missing_seller';`)).rows[0];
    assert.equal(payFail.invoice_status, 'manual_review');
    assert.match(payFail.invoice_last_error, /MISSING_SELLER_IDENTITY.*9c4e65f5-c0a1-4b3a-8ed2-d01175a73409/);

    // Restore seller_identity
    await db.exec(`
      UPDATE public.profiles
      SET global_settings = jsonb_set(
        global_settings,
        '{seller_identity}',
        '{"legal_name": "Stay Pilot Technologies LLP", "trade_name": "Stay Pilot", "address": "123 Tech Park", "city": "Bengaluru", "state": "Karnataka", "state_code": "29", "pincode": "560001", "email": "billing@staypilot.co.in", "phone": "+919876543210"}'::jsonb
      )
      WHERE id = '${CANONICAL_SUPER_ADMIN_ID}';
    `);
  });

  test('11. Frontend SaaSInvoiceModal contract: renders Commercial Payment Acknowledgment when GST inactive', () => {
    const modalPath = path.resolve(process.cwd(), 'src/components/SaaSInvoiceModal.jsx');
    const modalSrc = fs.readFileSync(modalPath, 'utf8');

    // Title checks
    assert.match(modalSrc, /isGstActive \? 'Tax Invoice' : 'Commercial Payment Acknowledgment'/);
    assert.match(modalSrc, /isGstActive \? 'Stay Pilot Tax Invoice \(Immutable Snapshot\)' : 'Stay Pilot Commercial Payment Acknowledgment \(Immutable Snapshot\)'/);
    assert.match(modalSrc, /isGstActive \? 'tax invoice' : 'commercial payment acknowledgment'/);
    assert.match(modalSrc, /isGstActive \? 'Taxable Amount \(₹\)' : 'Amount \(₹\)'/);
    assert.match(modalSrc, /isGstActive \? 'Taxable Base Amount' : 'Base( Subscription)? Amount'/);

    // Verify "Payment Receipt" is removed
    assert.equal(modalSrc.includes("'Payment Receipt'"), false, "Payment Receipt replaced with Commercial Payment Acknowledgment");
  });

  test('12. Rollback script rehearsal: safely drops RPCs and audit columns while preserving sequences and issued invoices', async () => {
    // In a fresh PGlite instance, execute Stage 3B then Rollback
    const rollbackDb = new PGlite();
    await rollbackDb.exec(`
      CREATE SCHEMA IF NOT EXISTS auth;
      CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
        SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid;
      $$;
      CREATE ROLE anon NOLOGIN;
      CREATE ROLE authenticated NOLOGIN;
      CREATE ROLE service_role NOLOGIN;

      CREATE TABLE public.profiles (
        id uuid PRIMARY KEY,
        email text,
        role text NOT NULL DEFAULT 'tenant_admin',
        plan_type text DEFAULT 'free',
        global_settings jsonb DEFAULT '{}'::jsonb
      );

      CREATE TABLE public.saas_subscriptions (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL REFERENCES public.profiles(id),
        razorpay_subscription_id text UNIQUE NOT NULL,
        environment text NOT NULL DEFAULT 'test',
        staypilot_plan_type text NOT NULL DEFAULT 'growth',
        status text NOT NULL DEFAULT 'created'
      );

      CREATE TABLE public.saas_payments (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid REFERENCES public.profiles(id),
        razorpay_payment_id text UNIQUE,
        razorpay_subscription_id text,
        razorpay_invoice_id text,
        amount integer NOT NULL,
        currency text DEFAULT 'INR',
        status text NOT NULL,
        payment_method text
      );

      CREATE TABLE public.saas_invoices (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        invoice_number text UNIQUE NOT NULL,
        tenant_id uuid NOT NULL REFERENCES public.profiles(id),
        payment_id text UNIQUE NOT NULL,
        subscription_id text NOT NULL,
        environment text NOT NULL,
        plan_type text NOT NULL,
        supplier_name text NOT NULL,
        customer_name text NOT NULL,
        customer_email text NOT NULL,
        supply_place text NOT NULL,
        tax_type text NOT NULL,
        base_amount_paise bigint NOT NULL,
        gst_rate numeric NOT NULL,
        cgst_amount_paise bigint NOT NULL,
        sgst_amount_paise bigint NOT NULL,
        igst_amount_paise bigint NOT NULL,
        total_amount_paise bigint NOT NULL,
        invoice_type text NOT NULL,
        invoice_status text NOT NULL,
        issued_at timestamptz NOT NULL,
        created_at timestamptz NOT NULL,
        seller_snapshot jsonb NOT NULL
      );

      CREATE SEQUENCE public.saas_invoice_number_seq START WITH 1001;
      CREATE SEQUENCE public.saas_invoice_number_seq_live START WITH 1001;
      CREATE SEQUENCE public.saas_invoice_number_seq_test START WITH 1001;
    `);

    // Apply Stage 3B
    const stage3bSqlPath = path.resolve(process.cwd(), 'supabase/archived/phase_r3_stage3b_invoicing_engine.sql');
    await rollbackDb.exec(fs.readFileSync(stage3bSqlPath, 'utf8'));

    // Apply Rollback Script
    const rollbackSqlPath = path.resolve(process.cwd(), 'supabase/archived/rollback_phase_r3_stage3b_invoicing_engine.sql');
    await rollbackDb.exec(fs.readFileSync(rollbackSqlPath, 'utf8'));

    // Verify functions dropped
    const funcs = await rollbackDb.query(`
      SELECT proname FROM pg_proc WHERE proname IN ('void_saas_invoice', 'generate_saas_commercial_invoice');
    `);
    assert.equal(funcs.rows.length, 0);

    // Verify sequences preserved
    const seqs = await rollbackDb.query(`
      SELECT sequence_name FROM information_schema.sequences WHERE sequence_schema = 'public';
    `);
    const seqNames = seqs.rows.map(r => r.sequence_name);
    assert.ok(seqNames.includes('saas_invoice_number_seq_live'));
    assert.ok(seqNames.includes('saas_invoice_number_seq_test'));
  });

  test('13. Blocker 1: Valid captured payment recorded idempotently on stale/cancelled subscription without entitling tenant', async () => {
    // Setup a cancelled subscription with expired period end
    const tenantStaleId = '22222222-3333-4444-5555-666666666666';
    await db.exec(`
      INSERT INTO public.profiles (id, email, role, full_name, plan_type)
      VALUES ('${tenantStaleId}', 'stale@tenant.com', 'tenant_admin', 'Stale Tenant', 'free');

      INSERT INTO public.saas_subscriptions (tenant_id, razorpay_subscription_id, environment, staypilot_plan_type, status, current_period_end)
      VALUES ('${tenantStaleId}', 'sub_test_stale_payment', 'test', 'growth', 'cancelled', NOW() - INTERVAL '10 days');
    `);

    // Webhook delivers captured payment on this stale/cancelled subscription with current_end <= subscription.current_period_end
    const res = await db.query(`
      SELECT public.process_subscription_webhook(
        'sub_test_stale_payment',
        'subscription.charged',
        'test',
        'active',
        NOW() - INTERVAL '20 days',
        NOW() - INTERVAL '15 days',
        'pay_test_stale_001',
        149900,
        'INR',
        'captured',
        'card',
        'inv_rzp_stale_01'
      ) as result;
    `);

    // Status is ignored for subscription reactivation
    assert.equal(res.rows[0].result.status, 'ignored');
    assert.equal(res.rows[0].result.reason, 'Stale activation event for terminated subscription');

    // Subscription status MUST remain 'cancelled' and profile MUST remain 'free'
    const sub = (await db.query(`SELECT status FROM public.saas_subscriptions WHERE razorpay_subscription_id = 'sub_test_stale_payment';`)).rows[0];
    assert.equal(sub.status, 'cancelled');
    const prof = (await db.query(`SELECT plan_type FROM public.profiles WHERE id = '${tenantStaleId}';`)).rows[0];
    assert.equal(prof.plan_type, 'free');

    // BUT payment record MUST be recorded idempotently
    const pay = (await db.query(`SELECT * FROM public.saas_payments WHERE razorpay_payment_id = 'pay_test_stale_001';`)).rows[0];
    assert.ok(pay);
    assert.equal(pay.status, 'captured');
    assert.equal(pay.amount, 149900);
  });

  test('14. Blocker 2: void_saas_invoice security rejects unauthorized operators and spoofed operator IDs', async () => {
    const invRes = await db.query(`SELECT id FROM public.saas_invoices WHERE invoice_status = 'issued' LIMIT 1;`);
    const invoiceId = invRes.rows[0].id;

    // 1. Rejects non-super-admin operator (e.g. TENANT_ID which has role = 'tenant_admin')
    await assert.rejects(
      async () => {
        await db.query(`
          SELECT public.void_saas_invoice('${invoiceId}'::uuid, 'Customer refund reason', '${TENANT_ID}'::uuid);
        `);
      },
      (err) => {
        assert.match(err.message, /FORBIDDEN.*not an active Super Administrator/);
        return true;
      }
    );

    // 2. Rejects when auth.uid() is set and caller specifies a different operator ID (spoofing prevention)
    await db.exec(`
      CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
        SELECT '${SECONDARY_SUPER_ADMIN_ID}'::uuid;
      $$;
    `);

    await assert.rejects(
      async () => {
        await db.query(`
          SELECT public.void_saas_invoice('${invoiceId}'::uuid, 'Customer refund reason', '${CANONICAL_SUPER_ADMIN_ID}'::uuid);
        `);
      },
      (err) => {
        assert.match(err.message, /FORBIDDEN.*Caller cannot specify a different operator ID/);
        return true;
      }
    );

    // Reset auth.uid() mock back to NULL
    await db.exec(`
      CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
        SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid;
      $$;
    `);
  });

  test('15. Blocker 3: Immutability trigger prohibits modifications to all columns except permitted void audit fields', async () => {
    const invRes = await db.query(`SELECT * FROM public.saas_invoices WHERE invoice_status = 'issued' LIMIT 1;`);
    const invoice = invRes.rows[0];

    // Attempting to change customer_email while voiding MUST be rejected
    await assert.rejects(
      async () => {
        await db.query(`
          UPDATE public.saas_invoices
          SET invoice_status = 'void',
              void_reason = 'Legitimate void reason here',
              voided_by = '${CANONICAL_SUPER_ADMIN_ID}',
              voided_at = NOW(),
              customer_email = 'tampered@email.com'
          WHERE id = '${invoice.id}';
        `);
      },
      (err) => {
        assert.match(err.message, /INVOICE_IMMUTABLE.*cannot alter/);
        return true;
      }
    );

    // Attempting to change total_amount_paise while voiding MUST be rejected
    await assert.rejects(
      async () => {
        await db.query(`
          UPDATE public.saas_invoices
          SET invoice_status = 'void',
              void_reason = 'Legitimate void reason here',
              voided_by = '${CANONICAL_SUPER_ADMIN_ID}',
              voided_at = NOW(),
              total_amount_paise = 0
          WHERE id = '${invoice.id}';
        `);
      },
      (err) => {
        assert.match(err.message, /INVOICE_IMMUTABLE.*cannot alter/);
        return true;
      }
    );
  });

  test('16. Blocker 4: Non-destructive rollback preserves financial audit evidence when invoices exist', async () => {
    const rollbackTestDb = new PGlite();
    await rollbackTestDb.exec(`
      CREATE SCHEMA IF NOT EXISTS auth;
      CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT NULL::uuid; $$;
      CREATE ROLE anon NOLOGIN;
      CREATE ROLE authenticated NOLOGIN;
      CREATE ROLE service_role NOLOGIN;

      CREATE TABLE public.profiles (
        id uuid PRIMARY KEY,
        role text NOT NULL DEFAULT 'tenant_admin',
        global_settings jsonb DEFAULT '{}'::jsonb
      );

      CREATE TABLE public.saas_subscriptions (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL REFERENCES public.profiles(id),
        razorpay_subscription_id text UNIQUE NOT NULL,
        environment text NOT NULL DEFAULT 'test',
        staypilot_plan_type text NOT NULL DEFAULT 'growth',
        status text NOT NULL DEFAULT 'created'
      );

      CREATE TABLE public.saas_payments (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid REFERENCES public.profiles(id),
        razorpay_payment_id text UNIQUE,
        razorpay_subscription_id text,
        razorpay_invoice_id text,
        amount integer NOT NULL,
        currency text DEFAULT 'INR',
        status text NOT NULL,
        payment_method text
      );

      CREATE TABLE public.saas_invoices (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        invoice_number text UNIQUE NOT NULL,
        tenant_id uuid NOT NULL REFERENCES public.profiles(id),
        payment_id text UNIQUE NOT NULL,
        subscription_id text NOT NULL,
        environment text NOT NULL,
        plan_type text NOT NULL,
        supplier_name text NOT NULL,
        customer_name text NOT NULL,
        customer_email text NOT NULL,
        supply_place text NOT NULL,
        tax_type text NOT NULL,
        base_amount_paise bigint NOT NULL,
        gst_rate numeric NOT NULL,
        cgst_amount_paise bigint NOT NULL,
        sgst_amount_paise bigint NOT NULL,
        igst_amount_paise bigint NOT NULL,
        total_amount_paise bigint NOT NULL,
        invoice_type text NOT NULL,
        invoice_status text NOT NULL,
        issued_at timestamptz NOT NULL,
        created_at timestamptz NOT NULL,
        seller_snapshot jsonb NOT NULL
      );

      CREATE SEQUENCE public.saas_invoice_number_seq_live START WITH 1001;
      CREATE SEQUENCE public.saas_invoice_number_seq_test START WITH 1001;
    `);

    // Apply Stage 3B
    const stage3bSql = fs.readFileSync(path.resolve(process.cwd(), 'supabase/archived/phase_r3_stage3b_invoicing_engine.sql'), 'utf8');
    await rollbackTestDb.exec(stage3bSql);

    // Insert an issued invoice record
    const adminId = '9c4e65f5-c0a1-4b3a-8ed2-d01175a73409';
    await rollbackTestDb.exec(`
      INSERT INTO public.profiles (id, role) VALUES ('${adminId}', 'super_admin');
      INSERT INTO public.saas_invoices (
        invoice_number, tenant_id, payment_id, subscription_id, environment, plan_type,
        supplier_name, customer_name, customer_email, supply_place, tax_type,
        base_amount_paise, gst_rate, cgst_amount_paise, sgst_amount_paise, igst_amount_paise,
        total_amount_paise, invoice_type, invoice_status, issued_at, created_at, seller_snapshot,
        void_reason, voided_by, voided_at
      ) VALUES (
        'SP-INV-2026-00001', '${adminId}', 'pay_evidence_01', 'sub_ev_01', 'live', 'growth',
        'Stay Pilot', 'Customer Corp', 'cust@corp.com', 'Karnataka', 'unregistered',
        149900, 0, 0, 0, 0, 149900, 'commercial_invoice', 'void', NOW(), NOW(), '{}'::jsonb,
        'Preserved void audit trail', '${adminId}', NOW()
      );
    `);

    // Apply Rollback script
    const rollbackSql = fs.readFileSync(path.resolve(process.cwd(), 'supabase/archived/rollback_phase_r3_stage3b_invoicing_engine.sql'), 'utf8');
    await rollbackTestDb.exec(rollbackSql);

    // Columns void_reason, voided_by, voided_at MUST still exist on saas_invoices
    const colRes = await rollbackTestDb.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'saas_invoices' AND column_name IN ('void_reason', 'voided_by', 'voided_at');
    `);
    assert.equal(colRes.rows.length, 3, 'audit columns must be retained when invoices exist');

    // The void audit evidence row must be 100% intact
    const inv = (await rollbackTestDb.query(`SELECT * FROM public.saas_invoices WHERE invoice_number = 'SP-INV-2026-00001';`)).rows[0];
    assert.equal(inv.invoice_status, 'void');
    assert.equal(inv.void_reason, 'Preserved void audit trail');
    assert.equal(inv.voided_by, adminId);
  });

  test('17. Blocker 5: GST contract supports both inclusive and exclusive pricing modes with total reconciliation', async () => {
    // Test exclusive pricing calculation with inter-state and intra-state tax
    await db.exec(`
      UPDATE public.profiles
      SET global_settings = jsonb_set(
        global_settings,
        '{gst_configuration}',
        '{"enabled": true, "status": "active", "rate_percent": 18, "gstin": "29AABCS1429B1ZB", "pricing_mode": "exclusive"}'::jsonb
      )
      WHERE id = '${CANONICAL_SUPER_ADMIN_ID}';
    `);

    // Inter-state exclusive transaction (Karnataka seller 29 to Kerala customer 32)
    await db.query(`
      SELECT public.process_subscription_webhook(
        'sub_test_canonical', 'subscription.charged', 'test', 'active',
        NOW(), NOW() + INTERVAL '30 days', 'pay_test_exclusive_inter', 176882, 'INR', 'captured', 'card', 'inv_ex_01'
      );
    `);

    const invInter = (await db.query(`SELECT * FROM public.saas_invoices WHERE payment_id = 'pay_test_exclusive_inter';`)).rows[0];
    assert.equal(invInter.invoice_type, 'tax_invoice');
    assert.equal(invInter.tax_type, 'inter_state');
    assert.equal(Number(invInter.total_amount_paise), 176882); // Reconciles exactly to captured Razorpay amount
    assert.equal(Number(invInter.base_amount_paise), 149900);
    assert.equal(Number(invInter.igst_amount_paise), 26982);
    assert.equal(Number(invInter.cgst_amount_paise), 0);
    assert.equal(Number(invInter.sgst_amount_paise), 0);

    // Total reconciliation assertion: base + igst == total == payment.amount
    assert.equal(
      Number(invInter.base_amount_paise) + Number(invInter.igst_amount_paise),
      Number(invInter.total_amount_paise)
    );

    // Reset GST back to disabled
    await db.exec(`
      UPDATE public.profiles
      SET global_settings = global_settings - 'gst_configuration'
      WHERE id = '${CANONICAL_SUPER_ADMIN_ID}';
    `);
  });

  test('18. Webhook event ordering: Delayed subscription.authenticated does NOT overwrite active, cancelled, or completed states', async () => {
    // 1. Verify active subscription ignores delayed subscription.authenticated
    const subActiveId = 'sub_test_ordering_active';
    await db.exec(`
      INSERT INTO public.saas_subscriptions (tenant_id, razorpay_subscription_id, environment, staypilot_plan_type, status, current_period_end, checkout_token)
      VALUES ('${TENANT_ID}', '${subActiveId}', 'test', 'growth', 'active', NOW() + INTERVAL '30 days', 'tok_legacy_chk');
    `);

    const resActive = await db.query(`
      SELECT public.process_subscription_webhook(
        '${subActiveId}', 'subscription.authenticated', 'test', 'authenticated',
        NULL::timestamptz, NULL::timestamptz
      ) as result;
    `);
    assert.equal(resActive.rows[0].result.status, 'success');
    assert.equal(resActive.rows[0].result.reason, 'Mandate authenticated, awaiting captured payment');

    // Subscription status MUST remain 'active' (not regressed to 'authenticated'), but checkout_token is cleared
    const subRow = (await db.query(`SELECT status, checkout_token FROM public.saas_subscriptions WHERE razorpay_subscription_id = '${subActiveId}';`)).rows[0];
    assert.equal(subRow.status, 'active');
    assert.equal(subRow.checkout_token, null);

    // 2. Verify cancelled subscription ignores delayed subscription.authenticated
    const subCancelledId = 'sub_test_ordering_cancelled';
    await db.exec(`
      INSERT INTO public.saas_subscriptions (tenant_id, razorpay_subscription_id, environment, staypilot_plan_type, status, current_period_end)
      VALUES ('${TENANT_ID}', '${subCancelledId}', 'test', 'growth', 'cancelled', NOW() - INTERVAL '5 days');
    `);

    await db.query(`
      SELECT public.process_subscription_webhook(
        '${subCancelledId}', 'subscription.authenticated', 'test', 'authenticated',
        NULL::timestamptz, NULL::timestamptz
      );
    `);
    const subCancRow = (await db.query(`SELECT status FROM public.saas_subscriptions WHERE razorpay_subscription_id = '${subCancelledId}';`)).rows[0];
    assert.equal(subCancRow.status, 'cancelled');
  });

  test('19. Webhook event ordering: Stale subscription.cancelled does NOT regress active renewed subscription', async () => {
    const subRenewedId = 'sub_test_ordering_renewed';
    const futureEnd = new Date(Date.now() + 25 * 86400000).toISOString();
    const staleEnd = new Date(Date.now() - 5 * 86400000).toISOString();

    await db.exec(`
      INSERT INTO public.saas_subscriptions (tenant_id, razorpay_subscription_id, environment, staypilot_plan_type, status, current_period_start, current_period_end)
      VALUES ('${TENANT_ID}', '${subRenewedId}', 'test', 'growth', 'active', NOW() - INTERVAL '5 days', '${futureEnd}');
    `);

    // Stale cancellation webhook arrives with an older period end
    const res = await db.query(`
      SELECT public.process_subscription_webhook(
        '${subRenewedId}', 'subscription.cancelled', 'test', 'cancelled',
        NOW() - INTERVAL '35 days', '${staleEnd}'::timestamptz
      ) as result;
    `);

    assert.equal(res.rows[0].result.status, 'ignored');
    assert.equal(res.rows[0].result.reason, 'Stale cancellation event for active subscription');

    // Status MUST remain 'active'
    const sub = (await db.query(`SELECT status FROM public.saas_subscriptions WHERE razorpay_subscription_id = '${subRenewedId}';`)).rows[0];
    assert.equal(sub.status, 'active');
  });

  test('20. Voided invoice protection: Idempotent re-invocation preserves voided status and never resets payment to issued', async () => {
    // 1. Process payment and generate invoice
    await db.query(`
      SELECT public.process_subscription_webhook(
        'sub_test_canonical', 'subscription.charged', 'test', 'active',
        NOW(), NOW() + INTERVAL '30 days', 'pay_test_void_protect', 149900, 'INR', 'captured', 'card', 'inv_vp_01'
      );
    `);

    const inv = (await db.query(`SELECT * FROM public.saas_invoices WHERE payment_id = 'pay_test_void_protect';`)).rows[0];
    assert.equal(inv.invoice_status, 'issued');

    // 2. Void the invoice
    await db.query(`
      SELECT public.void_saas_invoice('${inv.id}'::uuid, 'Customer requested billing void', '${CANONICAL_SUPER_ADMIN_ID}'::uuid);
    `);

    const voidedInv = (await db.query(`SELECT * FROM public.saas_invoices WHERE id = '${inv.id}';`)).rows[0];
    assert.equal(voidedInv.invoice_status, 'void');
    const voidedPay = (await db.query(`SELECT * FROM public.saas_payments WHERE razorpay_payment_id = 'pay_test_void_protect';`)).rows[0];
    assert.equal(voidedPay.invoice_status, 'void');

    // 3. Replay webhook for same payment ID
    await db.query(`
      SELECT public.process_subscription_webhook(
        'sub_test_canonical', 'subscription.charged', 'test', 'active',
        NOW(), NOW() + INTERVAL '30 days', 'pay_test_void_protect', 149900, 'INR', 'captured', 'card', 'inv_vp_01'
      );
    `);

    // Verify invoice remains 'void' and payment invoice_status remains 'void' (NOT resurrected to 'issued')
    const finalInv = (await db.query(`SELECT invoice_status FROM public.saas_invoices WHERE id = '${inv.id}';`)).rows[0];
    assert.equal(finalInv.invoice_status, 'void');

    const finalPay = (await db.query(`SELECT invoice_status, invoice_last_error FROM public.saas_payments WHERE razorpay_payment_id = 'pay_test_void_protect';`)).rows[0];
    assert.equal(finalPay.invoice_status, 'void');
    assert.match(finalPay.invoice_last_error, /Invoice (has been )?voided/);
  });

  test('21. Captured-payment reconciliation: Non-captured payment transitions to captured in-place and triggers invoicing', async () => {
    const payId = 'pay_test_transition_01';

    // 1. Initial webhook with non-captured status (e.g. 'authorized' or 'created')
    await db.exec(`
      INSERT INTO public.saas_payments (
        tenant_id, razorpay_payment_id, razorpay_subscription_id,
        amount, currency, status, environment, invoice_status
      ) VALUES (
        '${TENANT_ID}', '${payId}', 'sub_test_canonical',
        149900, 'INR', 'authorized', 'test', 'unprocessed'
      );
    `);

    const initialPay = (await db.query(`SELECT * FROM public.saas_payments WHERE razorpay_payment_id = '${payId}';`)).rows[0];
    assert.equal(initialPay.status, 'authorized');
    assert.equal(initialPay.invoice_status, 'unprocessed');

    // 2. Later charged webhook arrives with 'captured' status
    const res = await db.query(`
      SELECT public.process_subscription_webhook(
        'sub_test_canonical', 'subscription.charged', 'test', 'active',
        NOW(), NOW() + INTERVAL '30 days', '${payId}', 149900, 'INR', 'captured', 'upi', 'inv_trans_01'
      ) as result;
    `);

    assert.equal(res.rows[0].result.status, 'success');

    // Verify payment updated in-place to captured and invoiced
    const updatedPay = (await db.query(`SELECT * FROM public.saas_payments WHERE razorpay_payment_id = '${payId}';`)).rows[0];
    assert.equal(updatedPay.id, initialPay.id); // Same row ID updated in-place
    assert.equal(updatedPay.status, 'captured');
    assert.equal(updatedPay.payment_method, 'upi');
    assert.equal(updatedPay.invoice_status, 'issued');

    // Commercial invoice generated
    const inv = (await db.query(`SELECT * FROM public.saas_invoices WHERE payment_id = '${payId}';`)).rows[0];
    assert.ok(inv);
    assert.equal(inv.invoice_status, 'issued');
    assert.equal(Number(inv.total_amount_paise), 149900);
  });

  test('22. Captured-payment reconciliation: Rejects conflicting payment parameters', async () => {
    const payId = 'pay_test_conflict_01';

    // Existing captured payment
    await db.exec(`
      INSERT INTO public.saas_payments (
        tenant_id, razorpay_payment_id, razorpay_subscription_id,
        amount, currency, status, environment, invoice_status
      ) VALUES (
        '${TENANT_ID}', '${payId}', 'sub_test_canonical',
        149900, 'INR', 'captured', 'test', 'issued'
      );
    `);

    // 1. Conflicting amount (e.g. 249900 instead of 149900)
    const resConflictAmount = await db.query(`
      SELECT public.process_subscription_webhook(
        'sub_test_canonical', 'subscription.charged', 'test', 'active',
        NOW(), NOW() + INTERVAL '30 days', '${payId}', 249900, 'INR', 'captured', 'card', 'inv_conf_01'
      ) as result;
    `);
    assert.equal(resConflictAmount.rows[0].result.status, 'rejected');
    assert.match(resConflictAmount.rows[0].result.reason, /Conflicting payment amount/);

    // 2. Conflicting currency (e.g. 'USD' instead of 'INR')
    const resConflictCurr = await db.query(`
      SELECT public.process_subscription_webhook(
        'sub_test_canonical', 'subscription.charged', 'test', 'active',
        NOW(), NOW() + INTERVAL '30 days', '${payId}', 149900, 'USD', 'captured', 'card', 'inv_conf_01'
      ) as result;
    `);
    assert.equal(resConflictCurr.rows[0].result.status, 'rejected');
    assert.match(resConflictCurr.rows[0].result.reason, /Conflicting payment currency/);

    // 3. Conflicting environment (e.g. 'live' instead of 'test')
    const resConflictEnv = await db.query(`
      SELECT public.process_subscription_webhook(
        'sub_test_canonical', 'subscription.charged', 'live', 'active',
        NOW(), NOW() + INTERVAL '30 days', '${payId}', 149900, 'INR', 'captured', 'card', 'inv_conf_01'
      ) as result;
    `);
    assert.equal(resConflictEnv.rows[0].result.status, 'rejected');
    assert.match(resConflictEnv.rows[0].result.reason, /Cross-environment mismatch/);
  });

  test('23. GST pricing contract: Malformed GST configuration fails closed to commercial invoice without crashing', async () => {
    // Malformed GST: invalid GSTIN checksum/format, negative rate, bad types
    await db.exec(`
      UPDATE public.profiles
      SET global_settings = jsonb_set(
        global_settings,
        '{gst_configuration}',
        '{"enabled": true, "status": "active", "rate_percent": -5, "gstin": "INVALID_GSTIN_123", "pricing_mode": "exclusive"}'::jsonb
      )
      WHERE id = '${CANONICAL_SUPER_ADMIN_ID}';
    `);

    // Invoicing a payment MUST NOT crash, but must fail closed to non-GST commercial invoice
    await db.query(`
      SELECT public.process_subscription_webhook(
        'sub_test_canonical', 'subscription.charged', 'test', 'active',
        NOW(), NOW() + INTERVAL '30 days', 'pay_test_malformed_gst', 149900, 'INR', 'captured', 'card', 'inv_mal_01'
      );
    `);

    const inv = (await db.query(`SELECT * FROM public.saas_invoices WHERE payment_id = 'pay_test_malformed_gst';`)).rows[0];
    assert.ok(inv);
    assert.equal(inv.invoice_type, 'commercial_invoice'); // Fail-closed non-GST
    assert.equal(inv.tax_type, 'unregistered');
    assert.equal(Number(inv.gst_rate), 0);
    assert.equal(inv.supplier_gstin, null);
    assert.equal(Number(inv.total_amount_paise), 149900);
    assert.equal(Number(inv.base_amount_paise), 149900);

    // Reset GST back to empty/null
    await db.exec(`
      UPDATE public.profiles
      SET global_settings = global_settings - 'gst_configuration'
      WHERE id = '${CANONICAL_SUPER_ADMIN_ID}';
    `);
  });

  test('24. Secure invoice void authorization: Untrusted caller context without auth.uid() is rejected', async () => {
    const invRes = await db.query(`SELECT id FROM public.saas_invoices WHERE invoice_status = 'issued' LIMIT 1;`);
    const invoiceId = invRes.rows[0].id;

    // 1. Unprivileged role without EXECUTE grant gets direct permission denied
    await db.exec(`SET ROLE anon;`);
    await assert.rejects(
      async () => {
        await db.query(`
          SELECT public.void_saas_invoice('${invoiceId}'::uuid, 'Unauthorized caller attempt', '${CANONICAL_SUPER_ADMIN_ID}'::uuid);
        `);
      },
      (err) => {
        assert.match(err.message, /permission denied for function void_saas_invoice/);
        return true;
      }
    );
    await db.exec(`RESET ROLE;`);

    // 2. Unprivileged caller context (PostgREST JWT role 'authenticated' without auth.uid) is caught by internal trusted context check
    await db.exec(`
      GRANT EXECUTE ON FUNCTION public.void_saas_invoice(UUID, TEXT, UUID) TO authenticated;
      SELECT set_config('request.jwt.claim.role', 'authenticated', false);
    `);

    await assert.rejects(
      async () => {
        await db.query(`
          SELECT public.void_saas_invoice('${invoiceId}'::uuid, 'Unauthorized caller attempt', '${CANONICAL_SUPER_ADMIN_ID}'::uuid);
        `);
      },
      (err) => {
        assert.match(err.message, /UNAUTHORIZED: Invoice voiding requires an authenticated Super Admin session or trusted service_role execution context/);
        return true;
      }
    );

    await db.exec(`
      SELECT set_config('request.jwt.claim.role', '', false);
    `);
  });

  test('25. Blocker 1: Comprehensive void authorization (Super Admin, tenant rejection, spoofing prevention, service_role verification)', async () => {
    // 1. Create a fresh test invoice
    await db.query(`
      SELECT public.process_subscription_webhook(
        'sub_test_canonical', 'subscription.charged', 'test', 'active',
        NOW(), NOW() + INTERVAL '30 days', 'pay_test_void_auth_01', 149900, 'INR', 'captured', 'card', 'inv_va_01'
      );
    `);
    const inv = (await db.query(`SELECT id FROM public.saas_invoices WHERE payment_id = 'pay_test_void_auth_01';`)).rows[0];

    // 2. Ordinary tenant calling void_saas_invoice with their own auth.uid is REJECTED
    await db.exec(`
      CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
        SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid;
      $$;
      SELECT set_config('request.jwt.claim.sub', '${TENANT_ID}', false);
    `);

    await assert.rejects(
      async () => {
        await db.query(`
          SELECT public.void_saas_invoice('${inv.id}'::uuid, 'Tenant attempting to void invoice', '${TENANT_ID}'::uuid);
        `);
      },
      (err) => {
        assert.match(err.message, /FORBIDDEN.*Operator .* is not an active Super Administrator/);
        return true;
      }
    );

    // 3. Authenticated Super Admin attempting to spoof another operator ID is REJECTED
    await db.exec(`
      SELECT set_config('request.jwt.claim.sub', '${CANONICAL_SUPER_ADMIN_ID}', false);
    `);

    await assert.rejects(
      async () => {
        await db.query(`
          SELECT public.void_saas_invoice('${inv.id}'::uuid, 'Super Admin spoofing another operator ID', '${SECONDARY_SUPER_ADMIN_ID}'::uuid);
        `);
      },
      (err) => {
        assert.match(err.message, /FORBIDDEN.*Caller cannot specify a different operator ID than authenticated user/);
        return true;
      }
    );

    // 4. Authenticated Super Admin with matching operator ID SUCCEEDS
    await db.query(`
      SELECT public.void_saas_invoice('${inv.id}'::uuid, 'Authorized Super Admin void reason', '${CANONICAL_SUPER_ADMIN_ID}'::uuid);
    `);
    const voidedInv = (await db.query(`SELECT invoice_status, voided_by, void_reason FROM public.saas_invoices WHERE id = '${inv.id}';`)).rows[0];
    assert.equal(voidedInv.invoice_status, 'void');
    assert.equal(voidedInv.voided_by, CANONICAL_SUPER_ADMIN_ID);
    assert.equal(voidedInv.void_reason, 'Authorized Super Admin void reason');

    // Reset auth.uid() to NULL by blanking claim.sub and set service_role context
    await db.exec(`
      SELECT set_config('request.jwt.claim.sub', '', false);
      SELECT set_config('request.jwt.claim.role', 'service_role', false);
    `);

    // Create another invoice for service_role void testing
    await db.query(`
      SELECT public.process_subscription_webhook(
        'sub_test_canonical', 'subscription.charged', 'test', 'active',
        NOW(), NOW() + INTERVAL '30 days', 'pay_test_void_sr_01', 149900, 'INR', 'captured', 'card', 'inv_sr_01'
      );
    `);
    const invSr = (await db.query(`SELECT id FROM public.saas_invoices WHERE payment_id = 'pay_test_void_sr_01';`)).rows[0];

    // Service-role without operator ID is REJECTED
    await assert.rejects(
      async () => {
        await db.query(`
          SELECT public.void_saas_invoice('${invSr.id}'::uuid, 'Service role missing operator', NULL::uuid);
        `);
      },
      (err) => {
        assert.match(err.message, /UNAUTHORIZED: Operator identification required/);
        return true;
      }
    );

    // Service-role with non-super-admin operator ID is REJECTED
    await assert.rejects(
      async () => {
        await db.query(`
          SELECT public.void_saas_invoice('${invSr.id}'::uuid, 'Service role with tenant operator', '${TENANT_ID}'::uuid);
        `);
      },
      (err) => {
        assert.match(err.message, /FORBIDDEN.*Operator .* is not an active Super Administrator/);
        return true;
      }
    );

    // Service-role with verified Super Admin operator SUCCEEDS
    await db.query(`
      SELECT public.void_saas_invoice('${invSr.id}'::uuid, 'Service role trusted void', '${SECONDARY_SUPER_ADMIN_ID}'::uuid);
    `);
    const voidedInvSr = (await db.query(`SELECT invoice_status, voided_by FROM public.saas_invoices WHERE id = '${invSr.id}';`)).rows[0];
    assert.equal(voidedInvSr.invoice_status, 'void');
    assert.equal(voidedInvSr.voided_by, SECONDARY_SUPER_ADMIN_ID);

    // Reset settings
    await db.exec(`
      SELECT set_config('request.jwt.claim.role', '', false);
      SELECT set_config('request.jwt.claim.sub', '', false);
    `);
  });

  test('26. Blocker 2: Exclusive pricing mismatch does NOT silently fall back to inclusive calculation', async () => {
    // Enable GST with exclusive pricing mode (18%)
    await db.exec(`
      UPDATE public.profiles
      SET global_settings = jsonb_set(
        global_settings,
        '{gst_configuration}',
        '{"enabled": true, "status": "active", "rate_percent": 18, "gstin": "29AABCS1429B1ZB", "pricing_mode": "exclusive"}'::jsonb
      )
      WHERE id = '${CANONICAL_SUPER_ADMIN_ID}';
    `);

    // In exclusive mode: Growth plan base is 149900 paise. 18% GST is 26982 paise. Total is 176882 paise.
    // Insert a payment with a mismatched amount (e.g. 149900 paise - which would match inclusive but mismatches exclusive!)
    await db.exec(`
      INSERT INTO public.saas_payments (
        id, tenant_id, razorpay_payment_id, razorpay_subscription_id,
        amount, currency, status, environment, invoice_status
      ) VALUES (
        '11111111-2222-3333-4444-555555555555', '${TENANT_ID}', 'pay_test_exclusive_mismatch', 'sub_test_canonical',
        149900, 'INR', 'captured', 'test', 'pending'
      );
    `);

    // Direct invoice generation MUST fail closed and MUST NOT silently fall back to inclusive!
    await assert.rejects(
      async () => {
        await db.query(`
          SELECT public.generate_saas_commercial_invoice('11111111-2222-3333-4444-555555555555'::uuid);
        `);
      },
      (err) => {
        assert.match(err.message, /EXCLUSIVE_PRICING_MISMATCH.*Silent inclusive fallback prohibited/);
        return true;
      }
    );

    // Reset GST back to disabled
    await db.exec(`
      UPDATE public.profiles
      SET global_settings = global_settings - 'gst_configuration'
      WHERE id = '${CANONICAL_SUPER_ADMIN_ID}';
    `);
  });

  test('27. Blocker 2: Webhook handles exclusive pricing mismatch safely into manual_review without entitling disruption', async () => {
    // Enable GST with exclusive pricing mode (18%)
    await db.exec(`
      UPDATE public.profiles
      SET global_settings = jsonb_set(
        global_settings,
        '{gst_configuration}',
        '{"enabled": true, "status": "active", "rate_percent": 18, "gstin": "29AABCS1429B1ZB", "pricing_mode": "exclusive"}'::jsonb
      )
      WHERE id = '${CANONICAL_SUPER_ADMIN_ID}';
    `);

    // Webhook delivers captured payment of 149900 on exclusive plan (mismatch: expected 176882)
    const res = await db.query(`
      SELECT public.process_subscription_webhook(
        'sub_test_canonical', 'subscription.charged', 'test', 'active',
        NOW(), NOW() + INTERVAL '30 days', 'pay_test_webhook_ex_mismatch', 149900, 'INR', 'captured', 'card', 'inv_wem_01'
      ) as result;
    `);

    // Webhook succeeds at subscription and payment capture level
    assert.equal(res.rows[0].result.status, 'success');

    // 1. Captured payment is recorded
    const pay = (await db.query(`SELECT * FROM public.saas_payments WHERE razorpay_payment_id = 'pay_test_webhook_ex_mismatch';`)).rows[0];
    assert.ok(pay);
    assert.equal(pay.status, 'captured');
    assert.equal(pay.amount, 149900);

    // 2. Payment invoice_status is marked 'manual_review'
    assert.equal(pay.invoice_status, 'manual_review');
    assert.match(pay.invoice_last_error, /EXCLUSIVE_PRICING_MISMATCH/);

    // 3. Subscription remains active and entitled
    const sub = (await db.query(`SELECT status FROM public.saas_subscriptions WHERE razorpay_subscription_id = 'sub_test_canonical';`)).rows[0];
    assert.equal(sub.status, 'active');

    // 4. Zero invoice was generated
    const invCount = (await db.query(`SELECT count(*) as count FROM public.saas_invoices WHERE payment_id = 'pay_test_webhook_ex_mismatch';`)).rows[0];
    assert.equal(Number(invCount.count), 0);

    // Reset GST back to disabled
    await db.exec(`
      UPDATE public.profiles
      SET global_settings = global_settings - 'gst_configuration'
      WHERE id = '${CANONICAL_SUPER_ADMIN_ID}';
    `);
  });

  test('28. Final Trust-Boundary Check: session_user, PostgREST JWT claims tampering, and service_role verification', async () => {
    // 1. Setup a fresh test invoice
    await db.query(`
      SELECT public.process_subscription_webhook(
        'sub_test_canonical', 'subscription.charged', 'test', 'active',
        NOW(), NOW() + INTERVAL '30 days', 'pay_test_tb_01', 149900, 'INR', 'captured', 'card', 'inv_tb_01'
      );
    `);
    const inv = (await db.query(`SELECT id FROM public.saas_invoices WHERE payment_id = 'pay_test_tb_01';`)).rows[0];

    // Check 1: Missing JWT under PostgREST (session_user = 'authenticator', auth.uid() is NULL, claim.role = 'anon')
    // Attempting to supply a Super Admin UUID MUST be rejected (permission denied or UNAUTHORIZED)
    await db.exec(`
      SET SESSION AUTHORIZATION authenticator;
      SET ROLE anon;
      SELECT set_config('request.jwt.claim.role', 'anon', false);
      SELECT set_config('request.jwt.claim.sub', '', false);
    `);

    await assert.rejects(
      async () => {
        await db.query(`
          SELECT public.void_saas_invoice('${inv.id}'::uuid, 'Attacker attempting missing JWT void', '${CANONICAL_SUPER_ADMIN_ID}'::uuid);
        `);
      },
      (err) => {
        assert.match(err.message, /permission denied for function void_saas_invoice|UNAUTHORIZED/);
        return true;
      }
    );

    // Check 2: Authenticated non-Super-Admin (tenant) attempting to impersonate service_role by setting request.jwt.claim.role
    // Even if tenant sets request.jwt.claim.role = 'service_role', auth.uid() contains tenant UUID, which locks identity and rejects
    await db.exec(`
      RESET ROLE;
      SET ROLE authenticated;
      SELECT set_config('request.jwt.claim.role', 'service_role', false);
      SELECT set_config('request.jwt.claim.sub', '${TENANT_ID}', false);
    `);

    await assert.rejects(
      async () => {
        await db.query(`
          SELECT public.void_saas_invoice('${inv.id}'::uuid, 'Tenant claiming service role', '${CANONICAL_SUPER_ADMIN_ID}'::uuid);
        `);
      },
      (err) => {
        assert.match(err.message, /FORBIDDEN.*Caller cannot specify a different operator ID than authenticated user/);
        return true;
      }
    );

    // If tenant supplies their own UUID as operator:
    await assert.rejects(
      async () => {
        await db.query(`
          SELECT public.void_saas_invoice('${inv.id}'::uuid, 'Tenant claiming service role self', '${TENANT_ID}'::uuid);
        `);
      },
      (err) => {
        assert.match(err.message, /FORBIDDEN.*Operator .* is not an active Super Administrator/);
        return true;
      }
    );

    // Check 3: Forged JWT with role = 'authenticated' but missing sub (auth.uid() is NULL) supplying Super Admin UUID
    // Must NOT be accepted by the SECURITY DEFINER function
    await db.exec(`
      SELECT set_config('request.jwt.claim.role', 'authenticated', false);
      SELECT set_config('request.jwt.claim.sub', '', false);
    `);

    await assert.rejects(
      async () => {
        await db.query(`
          SELECT public.void_saas_invoice('${inv.id}'::uuid, 'Forged JWT missing sub', '${CANONICAL_SUPER_ADMIN_ID}'::uuid);
        `);
      },
      (err) => {
        assert.match(err.message, /UNAUTHORIZED: Invoice voiding requires an authenticated Super Admin session or trusted service_role execution context/);
        return true;
      }
    );

    // Check 3b: Authenticated tenant sets request.jwt.claim.role = 'service_role' AND blanks out sub (auth.uid() is NULL)
    // Because active database role is 'authenticated' (not 'service_role'), trusted context check fails closed
    await db.exec(`
      SELECT set_config('request.jwt.claim.role', 'service_role', false);
      SELECT set_config('request.jwt.claim.sub', '', false);
    `);

    await assert.rejects(
      async () => {
        await db.query(`
          SELECT public.void_saas_invoice('${inv.id}'::uuid, 'Tampered claim without service_role DB role', '${CANONICAL_SUPER_ADMIN_ID}'::uuid);
        `);
      },
      (err) => {
        assert.match(err.message, /UNAUTHORIZED: Invoice voiding requires an authenticated Super Admin session or trusted service_role execution context/);
        return true;
      }
    );

    // Check 4: Legitimate Super Admin authenticated request SUCCEEDS
    await db.exec(`
      RESET SESSION AUTHORIZATION;
      SET SESSION AUTHORIZATION authenticator;
      RESET ROLE;
      SET ROLE authenticated;
      SELECT set_config('request.jwt.claim.role', 'authenticated', false);
      SELECT set_config('request.jwt.claim.sub', '${CANONICAL_SUPER_ADMIN_ID}', false);
    `);

    await db.query(`
      SELECT public.void_saas_invoice('${inv.id}'::uuid, 'Legitimate Super Admin voiding invoice', '${CANONICAL_SUPER_ADMIN_ID}'::uuid);
    `);

    await db.exec(`RESET ROLE; SET SESSION AUTHORIZATION postgres;`);
    const voidedInv = (await db.query(`SELECT invoice_status, voided_by FROM public.saas_invoices WHERE id = '${inv.id}';`)).rows[0];
    assert.equal(voidedInv.invoice_status, 'void');
    assert.equal(voidedInv.voided_by, CANONICAL_SUPER_ADMIN_ID);

    // Check 5: Legitimate actual service_role backend request with verified Super Admin operator SUCCEEDS
    // Create new invoice for service_role test
    await db.query(`
      SELECT public.process_subscription_webhook(
        'sub_test_canonical', 'subscription.charged', 'test', 'active',
        NOW(), NOW() + INTERVAL '30 days', 'pay_test_tb_02', 149900, 'INR', 'captured', 'card', 'inv_tb_02'
      );
    `);
    const inv2 = (await db.query(`SELECT id FROM public.saas_invoices WHERE payment_id = 'pay_test_tb_02';`)).rows[0];

    await db.exec(`
      SET SESSION AUTHORIZATION authenticator;
      RESET ROLE;
      SET ROLE service_role;
      SELECT set_config('request.jwt.claim.role', 'service_role', false);
      SELECT set_config('request.jwt.claim.sub', '', false);
    `);

    await db.query(`
      SELECT public.void_saas_invoice('${inv2.id}'::uuid, 'Legitimate service_role voiding invoice', '${SECONDARY_SUPER_ADMIN_ID}'::uuid);
    `);

    await db.exec(`RESET ROLE; SET SESSION AUTHORIZATION postgres;`);
    const voidedInv2 = (await db.query(`SELECT invoice_status, voided_by FROM public.saas_invoices WHERE id = '${inv2.id}';`)).rows[0];
    assert.equal(voidedInv2.invoice_status, 'void');
    assert.equal(voidedInv2.voided_by, SECONDARY_SUPER_ADMIN_ID);

    // Reset session and settings back to clean state
    await db.exec(`
      RESET ROLE;
      SET SESSION AUTHORIZATION postgres;
      SELECT set_config('request.jwt.claim.role', '', false);
      SELECT set_config('request.jwt.claim.sub', '', false);
    `);
  });
});

