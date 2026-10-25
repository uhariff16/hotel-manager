import test from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  calculateGstBreakdown,
  validateGstConfiguration,
  validateSellerIdentityInput,
  buildGstConfigurationPatch,
  buildSellerIdentityPatch,
  isGstEffective,
  assessSellerReadiness,
  CANONICAL_SUPER_ADMIN_ID,
  resolveCanonicalSuperAdmin
} from '../src/lib/invoiceIssuerConfig.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

test('StayPilot GST On/Off Lifecycle Architecture Validation Suite', async (t) => {
  // -------------------------------------------------------------------------
  // Setup Isolated Embedded PostgreSQL Database (PGlite)
  // -------------------------------------------------------------------------
  const db = new PGlite();

  // Load migrations and setup schema
  await db.exec(`
    CREATE SCHEMA IF NOT EXISTS auth;
    DO $$ BEGIN
      IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon NOLOGIN; END IF;
      IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
      IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role NOLOGIN; END IF;
    END $$;

    CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
      SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid;
    $$;
    CREATE OR REPLACE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$
      SELECT COALESCE(NULLIF(current_setting('request.jwt.claim.role', true), ''), 'anon');
    $$;

    CREATE TABLE public.profiles (
      id uuid PRIMARY KEY,
      role text NOT NULL DEFAULT 'tenant_admin',
      full_name text,
      email text,
      tenant_id uuid,
      plan_type text DEFAULT 'free',
      subscription_status text,
      is_legacy_account boolean DEFAULT false,
      global_settings jsonb DEFAULT '{}'::jsonb,
      created_at timestamptz DEFAULT now(),
      updated_at timestamptz DEFAULT now()
    );

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
      tenant_id uuid REFERENCES public.profiles(id),
      razorpay_subscription_id text UNIQUE,
      razorpay_customer_id text,
      staypilot_plan_type text DEFAULT 'solo',
      environment text NOT NULL CHECK (environment IN ('test', 'live')),
      status text DEFAULT 'created',
      current_period_start timestamptz,
      current_period_end timestamptz,
      cancel_at_period_end boolean DEFAULT false,
      checkout_token text,
      checkout_expires_at timestamptz,
      created_at timestamptz DEFAULT now(),
      updated_at timestamptz DEFAULT now()
    );

    CREATE TABLE public.saas_payments (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id uuid REFERENCES public.profiles(id),
      razorpay_payment_id text UNIQUE,
      razorpay_subscription_id text,
      amount numeric NOT NULL,
      currency text NOT NULL DEFAULT 'INR',
      status text NOT NULL,
      payment_method text,
      environment text NOT NULL CHECK (environment IN ('test', 'live')),
      razorpay_invoice_id text,
      invoice_status text DEFAULT 'unprocessed',
      invoice_last_error text,
      invoice_retry_count integer DEFAULT 0,
      invoice_next_retry_at timestamptz,
      created_at timestamptz DEFAULT now()
    );

    CREATE SEQUENCE IF NOT EXISTS public.saas_invoice_number_seq_live INCREMENT BY 1 START WITH 1 NO CYCLE;
    CREATE SEQUENCE IF NOT EXISTS public.saas_invoice_number_seq_test INCREMENT BY 1 START WITH 1001 NO CYCLE;

    CREATE TABLE public.saas_invoices (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      invoice_number text UNIQUE NOT NULL,
      tenant_id uuid REFERENCES public.profiles(id),
      payment_id text,
      subscription_id text,
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
      seller_snapshot jsonb,
      sac_code text,
      customer_name text,
      customer_email text,
      customer_gstin text,
      customer_address text,
      customer_state text,
      supply_place text,
      tax_type text NOT NULL,
      base_amount_paise bigint NOT NULL,
      gst_rate numeric NOT NULL DEFAULT 0,
      cgst_amount_paise bigint NOT NULL DEFAULT 0,
      sgst_amount_paise bigint NOT NULL DEFAULT 0,
      igst_amount_paise bigint NOT NULL DEFAULT 0,
      total_amount_paise bigint NOT NULL,
      razorpay_payment_id text,
      saas_payment_id uuid UNIQUE REFERENCES public.saas_payments(id),
      invoice_type text NOT NULL,
      invoice_status text NOT NULL DEFAULT 'issued',
      voided_at timestamptz,
      void_reason text,
      voided_by uuid,
      issued_at timestamptz NOT NULL DEFAULT now(),
      created_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE OR REPLACE FUNCTION public.is_super_admin(check_uid uuid DEFAULT auth.uid())
    RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
    BEGIN
      RETURN EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = check_uid AND role = 'super_admin'
      );
    END;
    $$;
  `);

  // Execute canonical functions from migration 20261018210000_super_admin_invoice_numbering_config.sql
  const numberingSql = fs.readFileSync(
    path.join(ROOT, 'supabase', 'migrations', '20261018210000_super_admin_invoice_numbering_config.sql'),
    'utf8'
  );
  await db.exec(numberingSql);

  // Execute webhook handler from phase_r3_stage3b_invoicing_engine.sql
  const webhookSql = fs.readFileSync(
    path.join(ROOT, 'supabase', 'archived', 'phase_r3_stage3b_invoicing_engine.sql'),
    'utf8'
  );
  await db.exec(webhookSql);

  // Execute Stage 5B hardening migration (prepared locally)
  const stage5bSql = fs.readFileSync(
    path.join(ROOT, 'supabase', 'migrations', '20261024120000_stage5b_gst_renewal_hardening.sql'),
    'utf8'
  );
  await db.exec(stage5bSql);

  // Setup test identities
  const CANONICAL_ADMIN_ID = CANONICAL_SUPER_ADMIN_ID; // 9c4e65f5-c0a1-4b3a-8ed2-d01175a73409
  const TENANT_1_ID = '11111111-1111-4111-8111-111111111111'; // Tenant in Karnataka
  const TENANT_2_ID = '22222222-2222-4222-8222-222222222222'; // Tenant in Tamil Nadu
  const TENANT_3_ID = '33333333-3333-4333-8333-333333333333'; // Tenant with Trial
  const LEGACY_TENANT_ID = '44444444-4444-4444-8444-444444444444'; // Cheerful Chalet

  await db.exec(`
    -- Seed canonical super admin with pricing and seller identity
    INSERT INTO public.profiles (id, role, full_name, email, global_settings)
    VALUES (
      '${CANONICAL_ADMIN_ID}',
      'super_admin',
      'StayPilot Master Admin',
      'uhariff@gmail.com',
      jsonb_build_object(
        'pricing', jsonb_build_object(
          'published', jsonb_build_object(
            'solo', jsonb_build_object('price', 499, 'monthlyPrice', 499, 'name', 'Solo'),
            'growth', jsonb_build_object('price', 2999, 'monthlyPrice', 2999, 'name', 'Growth', 'offerActive', false, 'offerPrice', 1999),
            'staymaster', jsonb_build_object('price', 6999, 'monthlyPrice', 6999, 'name', 'Stay Master')
          ),
          'solo', 499,
          'growth', 2999,
          'staymaster', 6999
        ),
        'seller_identity', jsonb_build_object(
          'trade_name', 'Stay Pilot',
          'legal_name', 'StayPilot Technologies Private Limited',
          'address', '100 MG Road, Brigade Junction',
          'city', 'Chennai',
          'state', 'Tamil Nadu',
          'state_code', '33',
          'pincode', '600001',
          'email', 'billing@staypilot.io',
          'phone', '9876543210',
          'pan', 'AAPFU0939F',
          'sac_code', '998313'
        ),
        'gst_configuration', jsonb_build_object(
          'enabled', false,
          'status', 'disabled',
          'rate_percent', 18,
          'gstin', '33AAPFU0939F1Z2',
          'pricing_mode', 'exclusive'
        ),
        'tax_settings', jsonb_build_object(
          'enabled', false,
          'rate', 0,
          'gstin', '',
          'pricing_mode', 'exclusive'
        )
      )
    ) ON CONFLICT (id) DO NOTHING;

    -- Seed Tenant 1 (Karnataka: intra-state relative to supplier Karnataka)
    INSERT INTO public.profiles (id, role, full_name, email, plan_type, subscription_status, global_settings)
    VALUES (
      '${TENANT_1_ID}',
      'tenant_admin',
      'Coorg Green Valley',
      'coorg@example.com',
      'free',
      'none',
      jsonb_build_object(
        'billing', jsonb_build_object(
          'name', 'Coorg Green Valley Resorts',
          'email', 'billing@coorgvalley.com',
          'address', 'Coffee Plantation Road, Madikeri',
          'state', 'Karnataka',
          'state_code', '29',
          'pincode', '571201',
          'gstin', '29AABCC1234D1Z5'
        )
      )
    ) ON CONFLICT (id) DO NOTHING;

    -- Seed Tenant 2 (Tamil Nadu: inter-state relative to supplier Karnataka)
    INSERT INTO public.profiles (id, role, full_name, email, plan_type, subscription_status, global_settings)
    VALUES (
      '${TENANT_2_ID}',
      'tenant_admin',
      'Ooty Pine Woods',
      'ooty@example.com',
      'free',
      'none',
      jsonb_build_object(
        'billing', jsonb_build_object(
          'name', 'Ooty Pine Woods Cottages',
          'email', 'billing@ootypinewoods.com',
          'address', 'Sheddon Road, Ooty',
          'state', 'Tamil Nadu',
          'state_code', '33',
          'pincode', '643001',
          'gstin', '33AABCC1234D1Z8'
        )
      )
    ) ON CONFLICT (id) DO NOTHING;

    -- Seed Legacy Tenant (Grandfathered Premium)
    INSERT INTO public.profiles (id, role, full_name, email, plan_type, subscription_status, is_legacy_account, global_settings)
    VALUES (
      '${LEGACY_TENANT_ID}',
      'tenant_admin',
      'Cheerful Chalet Master',
      'staycheerfulchalet@gmail.com',
      'premium',
      'active',
      true,
      jsonb_build_object(
        'billing', jsonb_build_object(
          'name', 'Cheerful Chalet',
          'email', 'staycheerfulchalet@gmail.com',
          'address', 'Chalet Lane, Ooty',
          'state', 'Tamil Nadu',
          'state_code', '33',
          'pincode', '643001'
        )
      )
    ) ON CONFLICT (id) DO NOTHING;
  `);

  // =========================================================================
  // PHASE 2: GST DISABLED VALIDATION
  // =========================================================================
  await t.test('PHASE 2.1 — GST Disabled: Pricing calculations for all plans', () => {
    const plans = [
      { key: 'solo', basePaise: 49900 },
      { key: 'growth', basePaise: 299900 },
      { key: 'staymaster', basePaise: 699900 }
    ];

    for (const p of plans) {
      const calc = calculateGstBreakdown({
        amountPaise: p.basePaise,
        ratePercent: 0,
        pricingMode: 'exclusive'
      });

      assert.equal(calc.taxType, 'unregistered');
      assert.equal(calc.baseAmountPaise, p.basePaise);
      assert.equal(calc.gstRate, 0);
      assert.equal(calc.cgstAmountPaise, 0);
      assert.equal(calc.sgstAmountPaise, 0);
      assert.equal(calc.igstAmountPaise, 0);
      assert.equal(calc.gstAmountPaise, 0);
      assert.equal(calc.totalAmountPaise, p.basePaise);
    }
  });

  await t.test('PHASE 2.2 — GST Disabled: Promotional pricing applies without GST addition', () => {
    // Growth promotional price: 199900 paise (₹1,999)
    const promoBasePaise = 199900;
    const calc = calculateGstBreakdown({
      amountPaise: promoBasePaise,
      ratePercent: 0,
      pricingMode: 'exclusive'
    });
    assert.equal(calc.totalAmountPaise, 199900);
    assert.equal(calc.gstAmountPaise, 0);
  });

  await t.test('PHASE 2.3 — GST Disabled: Checkout & Razorpay payment matches selling price exactly', async () => {
    const paymentId = 'pay_test_gst_off_001';
    const subId = 'sub_test_gst_off_001';
    const amountPaise = 299900; // Growth plan ₹2,999

    // Create subscription in test environment
    await db.exec(`
      INSERT INTO public.saas_subscriptions (tenant_id, razorpay_subscription_id, staypilot_plan_type, environment, status)
      VALUES ('${TENANT_1_ID}', '${subId}', 'growth', 'test', 'created');
    `);

    // Process webhook payment capture
    const res = await db.query(`
      SELECT public.process_subscription_webhook(
        p_razorpay_sub_id := '${subId}',
        p_event_type := 'subscription.activated',
        p_event_env := 'test',
        p_status := 'active',
        p_current_start := now(),
        p_current_end := now() + interval '30 days',
        p_payment_id := '${paymentId}',
        p_amount := ${amountPaise},
        p_currency := 'INR',
        p_payment_status := 'captured',
        p_payment_method := 'upi'
      ) as result;
    `);

    assert.equal(res.rows[0].result.status, 'success');

    // Verify invoice generated in saas_invoices
    const invRes = await db.query(`
      SELECT * FROM public.saas_invoices WHERE payment_id = '${paymentId}';
    `);
    assert.equal(invRes.rows.length, 1);
    const inv = invRes.rows[0];

    assert.equal(inv.invoice_type, 'commercial_invoice');
    assert.equal(inv.tax_type, 'unregistered');
    assert.equal(Number(inv.gst_rate), 0);
    assert.equal(Number(inv.base_amount_paise), 299900);
    assert.equal(Number(inv.cgst_amount_paise), 0);
    assert.equal(Number(inv.sgst_amount_paise), 0);
    assert.equal(Number(inv.igst_amount_paise), 0);
    assert.equal(Number(inv.total_amount_paise), 299900);
    assert.equal(inv.supplier_gstin, null);
    assert.match(inv.invoice_number, /^SP-TEST-INV-/);

    // Verify tenant profile activated
    const profRes = await db.query(`SELECT plan_type FROM public.profiles WHERE id = '${TENANT_1_ID}';`);
    assert.equal(profRes.rows[0].plan_type, 'growth');
  });

  // =========================================================================
  // PHASE 3: GST ENABLED VALIDATION (18% ILLUSTRATIVE)
  // =========================================================================
  await t.test('PHASE 3.1 — GST Enabled: Configuration activation prerequisites & save', async () => {
    // Update canonical Super Admin to enable GST with 18% rate (Exclusive)
    await db.exec(`
      UPDATE public.profiles
      SET global_settings = jsonb_set(
        jsonb_set(
          global_settings,
          '{gst_configuration}',
          jsonb_build_object(
            'enabled', true,
            'status', 'active',
            'rate_percent', 18,
            'gstin', '33AAPFU0939F1Z2',
            'pricing_mode', 'exclusive',
            'updated_at', now()
          )
        ),
        '{tax_settings}',
        jsonb_build_object(
          'enabled', true,
          'rate', 18,
          'gstin', '33AAPFU0939F1Z2',
          'pricing_mode', 'exclusive',
          'updated_at', now()
        )
      )
      WHERE id = '${CANONICAL_ADMIN_ID}';
    `);

    // Verify GST is effective via invoiceIssuerConfig pure rules
    const adminRes = await db.query(`SELECT global_settings FROM public.profiles WHERE id = '${CANONICAL_ADMIN_ID}';`);
    const settings = adminRes.rows[0].global_settings;
    const eff = isGstEffective(settings.gst_configuration, new Date(), { seller: settings.seller_identity });
    if (!eff.effective) {
      console.log('EFF RESULT DEBUG:', eff);
    }
    assert.equal(eff.effective, true);
  });

  await t.test('PHASE 3.2 — GST Enabled: Exclusive Mode calculation & Intra-State split', () => {
    // Base 299900 paise, 18% exclusive, Seller 29 (Karnataka), Customer 29 (Karnataka)
    const calc = calculateGstBreakdown({
      amountPaise: 299900,
      ratePercent: 18,
      pricingMode: 'exclusive',
      sellerStateCode: '29',
      customerStateCode: '29'
    });

    assert.equal(calc.taxType, 'intra_state');
    assert.equal(calc.baseAmountPaise, 299900);
    assert.equal(calc.gstRate, 18);
    // GST = round(299900 * 0.18) = 53982 paise (₹539.82)
    assert.equal(calc.gstAmountPaise, 53982);
    // Total = 299900 + 53982 = 353882 paise (₹3,538.82)
    assert.equal(calc.totalAmountPaise, 353882);
    // Intra-state 50/50 split: CGST 9% (26991) + SGST 9% (26991)
    assert.equal(calc.cgstAmountPaise, 26991);
    assert.equal(calc.sgstAmountPaise, 26991);
    assert.equal(calc.igstAmountPaise, 0);
    // Zero drift
    assert.equal(calc.baseAmountPaise + calc.cgstAmountPaise + calc.sgstAmountPaise + calc.igstAmountPaise, calc.totalAmountPaise);
  });

  await t.test('PHASE 3.3 — GST Enabled: Exclusive Mode calculation & Inter-State split', () => {
    // Base 299900 paise, 18% exclusive, Seller 29 (Karnataka), Customer 33 (Tamil Nadu)
    const calc = calculateGstBreakdown({
      amountPaise: 299900,
      ratePercent: 18,
      pricingMode: 'exclusive',
      sellerStateCode: '29',
      customerStateCode: '33'
    });

    assert.equal(calc.taxType, 'inter_state');
    assert.equal(calc.baseAmountPaise, 299900);
    assert.equal(calc.gstRate, 18);
    assert.equal(calc.gstAmountPaise, 53982);
    assert.equal(calc.totalAmountPaise, 353882);
    // Inter-state: IGST 18% (53982), CGST 0, SGST 0
    assert.equal(calc.cgstAmountPaise, 0);
    assert.equal(calc.sgstAmountPaise, 0);
    assert.equal(calc.igstAmountPaise, 53982);
    // Zero drift
    assert.equal(calc.baseAmountPaise + calc.cgstAmountPaise + calc.sgstAmountPaise + calc.igstAmountPaise, calc.totalAmountPaise);
  });

  await t.test('PHASE 3.4 — GST Enabled: Inclusive Mode calculation & exact rounding', () => {
    // Total paid = 299900 paise (₹2,999 inclusive of 18% GST)
    const calc = calculateGstBreakdown({
      amountPaise: 299900,
      ratePercent: 18,
      pricingMode: 'inclusive',
      sellerStateCode: '29',
      customerStateCode: '33'
    });

    assert.equal(calc.taxType, 'inter_state');
    assert.equal(calc.totalAmountPaise, 299900);
    // Base = round(299900 / 1.18) = 254153 paise (₹2,541.53)
    assert.equal(calc.baseAmountPaise, 254153);
    // GST = 299900 - 254153 = 45747 paise (₹457.47)
    assert.equal(calc.gstAmountPaise, 45747);
    assert.equal(calc.igstAmountPaise, 45747);
    assert.equal(calc.baseAmountPaise + calc.igstAmountPaise, calc.totalAmountPaise);
  });

  await t.test('PHASE 3.5 — GST Enabled: Razorpay TEST payment capture & Tax Invoice issuance', async () => {
    const paymentId = 'pay_test_gst_on_002';
    const subId = 'sub_test_gst_on_002';
    const totalAmountPaise = 353882; // 299900 + 53982 (18% GST exclusive)

    // Tenant 2 (Tamil Nadu -> Intra-State relative to Tamil Nadu seller)
    await db.exec(`
      INSERT INTO public.saas_subscriptions (tenant_id, razorpay_subscription_id, staypilot_plan_type, environment, status)
      VALUES ('${TENANT_2_ID}', '${subId}', 'growth', 'test', 'created');
    `);

    const res = await db.query(`
      SELECT public.process_subscription_webhook(
        p_razorpay_sub_id := '${subId}',
        p_event_type := 'subscription.activated',
        p_event_env := 'test',
        p_status := 'active',
        p_current_start := now(),
        p_current_end := now() + interval '30 days',
        p_payment_id := '${paymentId}',
        p_amount := ${totalAmountPaise},
        p_currency := 'INR',
        p_payment_status := 'captured',
        p_payment_method := 'card'
      ) as result;
    `);

    assert.equal(res.rows[0].result.status, 'success');

    // Verify Tax Invoice in saas_invoices
    const invRes = await db.query(`
      SELECT * FROM public.saas_invoices WHERE payment_id = '${paymentId}';
    `);
    assert.equal(invRes.rows.length, 1);
    const inv = invRes.rows[0];

    assert.equal(inv.invoice_type, 'tax_invoice');
    assert.equal(inv.tax_type, 'intra_state');
    assert.equal(Number(inv.gst_rate), 18);
    assert.equal(Number(inv.base_amount_paise), 299900);
    assert.equal(Number(inv.cgst_amount_paise), 26991);
    assert.equal(Number(inv.sgst_amount_paise), 26991);
    assert.equal(Number(inv.igst_amount_paise), 0);
    assert.equal(Number(inv.total_amount_paise), 353882);
    assert.equal(inv.supplier_gstin, '33AAPFU0939F1Z2');
    assert.equal(inv.customer_gstin, '33AABCC1234D1Z8');
    assert.equal(inv.customer_name, 'Ooty Pine Woods Cottages');
  });

  // =========================================================================
  // PHASE 4: GST DISABLE AND RE-ENABLE LIFECYCLE (OFF -> ON -> OFF -> ON)
  // =========================================================================
  await t.test('PHASE 4 — Full Multi-Transition Lifecycle & Historical Immutability', async () => {
    // TRANSITION 1: Start with GST OFF
    await db.exec(`
      UPDATE public.profiles
      SET global_settings = jsonb_set(
        jsonb_set(global_settings, '{gst_configuration,enabled}', 'false'::jsonb),
        '{tax_settings,enabled}', 'false'::jsonb
      )
      WHERE id = '${CANONICAL_ADMIN_ID}';
    `);

    const p1 = 'pay_cycle_1_off';
    const s1 = 'sub_cycle_1_off';
    await db.exec(`
      INSERT INTO public.saas_subscriptions (tenant_id, razorpay_subscription_id, staypilot_plan_type, environment, status)
      VALUES ('${TENANT_1_ID}', '${s1}', 'growth', 'test', 'created');
    `);
    await db.query(`
      SELECT public.process_subscription_webhook(
        '${s1}', 'subscription.activated', 'test', 'active', now(), now() + interval '30 days',
        '${p1}', 299900, 'INR', 'captured', 'card'
      );
    `);

    const inv1 = (await db.query(`SELECT * FROM public.saas_invoices WHERE payment_id = '${p1}';`)).rows[0];
    assert.equal(inv1.invoice_type, 'commercial_invoice');
    assert.equal(inv1.tax_type, 'unregistered');
    assert.equal(Number(inv1.total_amount_paise), 299900);

    // TRANSITION 2: Enable GST ON (18% Exclusive)
    await db.exec(`
      UPDATE public.profiles
      SET global_settings = jsonb_set(
        jsonb_set(
          jsonb_set(global_settings, '{gst_configuration,enabled}', 'true'::jsonb),
          '{gst_configuration,status}', '"active"'::jsonb
        ),
        '{tax_settings,enabled}', 'true'::jsonb
      )
      WHERE id = '${CANONICAL_ADMIN_ID}';
    `);

    const p2 = 'pay_cycle_2_on';
    const s2 = 'sub_cycle_2_on';
    await db.exec(`
      INSERT INTO public.saas_subscriptions (tenant_id, razorpay_subscription_id, staypilot_plan_type, environment, status)
      VALUES ('${TENANT_1_ID}', '${s2}', 'growth', 'test', 'created');
    `);
    await db.query(`
      SELECT public.process_subscription_webhook(
        '${s2}', 'subscription.activated', 'test', 'active', now(), now() + interval '30 days',
        '${p2}', 353882, 'INR', 'captured', 'card'
      );
    `);

    const inv2 = (await db.query(`SELECT * FROM public.saas_invoices WHERE payment_id = '${p2}';`)).rows[0];
    assert.equal(inv2.invoice_type, 'tax_invoice');
    assert.equal(Number(inv2.gst_rate), 18);
    assert.equal(Number(inv2.total_amount_paise), 353882);

    // VERIFY INVOICE 1 IS UNCHANGED
    const inv1AfterT2 = (await db.query(`SELECT * FROM public.saas_invoices WHERE payment_id = '${p1}';`)).rows[0];
    assert.equal(inv1AfterT2.invoice_type, 'commercial_invoice');
    assert.equal(inv1AfterT2.tax_type, 'unregistered');
    assert.equal(Number(inv1AfterT2.total_amount_paise), 299900);

    // TRANSITION 3: Disable GST OFF
    await db.exec(`
      UPDATE public.profiles
      SET global_settings = jsonb_set(
        jsonb_set(global_settings, '{gst_configuration,enabled}', 'false'::jsonb),
        '{tax_settings,enabled}', 'false'::jsonb
      )
      WHERE id = '${CANONICAL_ADMIN_ID}';
    `);

    const p3 = 'pay_cycle_3_off';
    const s3 = 'sub_cycle_3_off';
    await db.exec(`
      INSERT INTO public.saas_subscriptions (tenant_id, razorpay_subscription_id, staypilot_plan_type, environment, status)
      VALUES ('${TENANT_1_ID}', '${s3}', 'growth', 'test', 'created');
    `);
    await db.query(`
      SELECT public.process_subscription_webhook(
        '${s3}', 'subscription.activated', 'test', 'active', now(), now() + interval '30 days',
        '${p3}', 299900, 'INR', 'captured', 'card'
      );
    `);

    const inv3 = (await db.query(`SELECT * FROM public.saas_invoices WHERE payment_id = '${p3}';`)).rows[0];
    assert.equal(inv3.invoice_type, 'commercial_invoice');
    assert.equal(inv3.tax_type, 'unregistered');
    assert.equal(Number(inv3.total_amount_paise), 299900);

    // VERIFY INVOICE 2 REMAINS A TAX INVOICE WITH 18% GST PRESERVED
    const inv2AfterT3 = (await db.query(`SELECT * FROM public.saas_invoices WHERE payment_id = '${p2}';`)).rows[0];
    assert.equal(inv2AfterT3.invoice_type, 'tax_invoice');
    assert.equal(Number(inv2AfterT3.gst_rate), 18);
    assert.equal(Number(inv2AfterT3.total_amount_paise), 353882);

    // TRANSITION 4: Re-enable GST ON (Inclusive Mode)
    await db.exec(`
      UPDATE public.profiles
      SET global_settings = jsonb_set(
        jsonb_set(
          jsonb_set(
            jsonb_set(global_settings, '{gst_configuration,enabled}', 'true'::jsonb),
            '{gst_configuration,pricing_mode}', '"inclusive"'::jsonb
          ),
          '{tax_settings,enabled}', 'true'::jsonb
        ),
        '{tax_settings,pricing_mode}', '"inclusive"'::jsonb
      )
      WHERE id = '${CANONICAL_ADMIN_ID}';
    `);

    const p4 = 'pay_cycle_4_on_inclusive';
    const s4 = 'sub_cycle_4_on_inclusive';
    await db.exec(`
      INSERT INTO public.saas_subscriptions (tenant_id, razorpay_subscription_id, staypilot_plan_type, environment, status)
      VALUES ('${TENANT_1_ID}', '${s4}', 'growth', 'test', 'created');
    `);
    await db.query(`
      SELECT public.process_subscription_webhook(
        '${s4}', 'subscription.activated', 'test', 'active', now(), now() + interval '30 days',
        '${p4}', 299900, 'INR', 'captured', 'card'
      );
    `);

    const inv4 = (await db.query(`SELECT * FROM public.saas_invoices WHERE payment_id = '${p4}';`)).rows[0];
    assert.equal(inv4.invoice_type, 'tax_invoice');
    assert.equal(Number(inv4.gst_rate), 18);
    assert.equal(Number(inv4.total_amount_paise), 299900);
    assert.equal(Number(inv4.base_amount_paise), 254153);
    assert.equal(Number(inv4.igst_amount_paise), 45747);

    // ALL HISTORICAL INVOICES (1, 2, 3) REMAIN UNTOUCHED AND ACCURATE
    const allInvs = (await db.query(`SELECT payment_id, invoice_type, tax_type, total_amount_paise, base_amount_paise, igst_amount_paise FROM public.saas_invoices ORDER BY created_at ASC;`)).rows;
    const invMap = Object.fromEntries(allInvs.map(r => [r.payment_id, r]));

    assert.equal(invMap[p1].invoice_type, 'commercial_invoice');
    assert.equal(invMap[p1].tax_type, 'unregistered');
    assert.equal(Number(invMap[p1].total_amount_paise), 299900);

    assert.equal(invMap[p2].invoice_type, 'tax_invoice');
    assert.equal(invMap[p2].tax_type, 'inter_state');
    assert.equal(Number(invMap[p2].total_amount_paise), 353882);
    assert.equal(Number(invMap[p2].igst_amount_paise), 53982);

    assert.equal(invMap[p3].invoice_type, 'commercial_invoice');
    assert.equal(invMap[p3].tax_type, 'unregistered');
    assert.equal(Number(invMap[p3].total_amount_paise), 299900);

    assert.equal(invMap[p4].invoice_type, 'tax_invoice');
    assert.equal(invMap[p4].tax_type, 'inter_state');
    assert.equal(Number(invMap[p4].total_amount_paise), 299900);
    assert.equal(Number(invMap[p4].base_amount_paise), 254153);
  });

  // =========================================================================
  // PHASE 5: BILLING LIFECYCLE REGRESSION TESTING
  // =========================================================================
  await t.test('PHASE 5.1 — Lifetime Legacy Entitlement Protection', async () => {
    // Cheerful Chalet has is_legacy_account = true
    const legSub = 'sub_legacy_chalet_001';
    const legPay = 'pay_legacy_chalet_001';

    await db.exec(`
      INSERT INTO public.saas_subscriptions (tenant_id, razorpay_subscription_id, staypilot_plan_type, environment, status)
      VALUES ('${LEGACY_TENANT_ID}', '${legSub}', 'growth', 'test', 'created');
    `);

    // Cancel event must NEVER downgrade Cheerful Chalet to free
    await db.query(`
      SELECT public.process_subscription_webhook(
        '${legSub}', 'subscription.cancelled', 'test', 'cancelled', now(), now() - interval '1 hour'
      );
    `);

    const prof = (await db.query(`SELECT plan_type, is_legacy_account FROM public.profiles WHERE id = '${LEGACY_TENANT_ID}';`)).rows[0];
    assert.equal(prof.plan_type, 'premium');
    assert.equal(prof.is_legacy_account, true);
  });

  await t.test('PHASE 5.2 — Duplicate Webhook Idempotency (Replay Attack Safety)', async () => {
    const pId = 'pay_replay_test_001';
    const sId = 'sub_replay_test_001';

    await db.exec(`
      INSERT INTO public.saas_subscriptions (tenant_id, razorpay_subscription_id, staypilot_plan_type, environment, status)
      VALUES ('${TENANT_1_ID}', '${sId}', 'growth', 'test', 'created');
    `);

    // First delivery
    const r1 = await db.query(`
      SELECT public.process_subscription_webhook(
        '${sId}', 'subscription.activated', 'test', 'active', now(), now() + interval '30 days',
        '${pId}', 299900, 'INR', 'captured', 'card'
      ) as res;
    `);
    assert.equal(r1.rows[0].res.status, 'success');

    // Second delivery (duplicate)
    const r2 = await db.query(`
      SELECT public.process_subscription_webhook(
        '${sId}', 'subscription.activated', 'test', 'active', now(), now() + interval '30 days',
        '${pId}', 299900, 'INR', 'captured', 'card'
      ) as res;
    `);
    assert.equal(r2.rows[0].res.status, 'success');

    // Verify exactly ONE payment row and ONE invoice row exists
    const pCount = (await db.query(`SELECT count(*) as count FROM public.saas_payments WHERE razorpay_payment_id = '${pId}';`)).rows[0].count;
    const invCount = (await db.query(`SELECT count(*) as count FROM public.saas_invoices WHERE payment_id = '${pId}';`)).rows[0].count;
    assert.equal(Number(pCount), 1);
    assert.equal(Number(invCount), 1);
  });

  await t.test('PHASE 5.3 — Out-of-Order Webhook Delivery Protection', async () => {
    const sId = 'sub_stale_event_001';
    await db.exec(`
      INSERT INTO public.saas_subscriptions (tenant_id, razorpay_subscription_id, staypilot_plan_type, environment, status, current_period_end)
      VALUES ('${TENANT_1_ID}', '${sId}', 'growth', 'test', 'active', now() + interval '30 days');
    `);

    // Delayed subscription.authenticated must NOT overwrite active status
    await db.query(`
      SELECT public.process_subscription_webhook(
        '${sId}', 'subscription.authenticated', 'test', 'authenticated', now(), now() + interval '30 days'
      );
    `);

    const sub = (await db.query(`SELECT status FROM public.saas_subscriptions WHERE razorpay_subscription_id = '${sId}';`)).rows[0];
    assert.equal(sub.status, 'active');
  });

  await t.test('PHASE 5.4 — Invoice Voiding and Snapshot Immutability', async () => {
    const pId = 'pay_void_test_001';
    const sId = 'sub_void_test_001';

    await db.exec(`
      INSERT INTO public.saas_subscriptions (tenant_id, razorpay_subscription_id, staypilot_plan_type, environment, status)
      VALUES ('${TENANT_1_ID}', '${sId}', 'growth', 'test', 'created');
    `);
    await db.query(`
      SELECT public.process_subscription_webhook(
        '${sId}', 'subscription.activated', 'test', 'active', now(), now() + interval '30 days',
        '${pId}', 299900, 'INR', 'captured', 'card'
      );
    `);

    const inv = (await db.query(`SELECT id FROM public.saas_invoices WHERE payment_id = '${pId}';`)).rows[0];

    // Attempt direct DELETE (must be blocked by immutability trigger)
    await assert.rejects(async () => {
      await db.query(`DELETE FROM public.saas_invoices WHERE id = '${inv.id}';`);
    }, /INVOICE_IMMUTABLE/);

    // Void through authorized void_saas_invoice RPC
    await db.query(`
      SELECT public.void_saas_invoice(
        '${inv.id}'::uuid,
        'Billing address correction requested by tenant'::text,
        '${CANONICAL_ADMIN_ID}'::uuid
      );
    `);

    const voidedInv = (await db.query(`SELECT * FROM public.saas_invoices WHERE id = '${inv.id}';`)).rows[0];
    assert.equal(voidedInv.invoice_status, 'void');
    assert.equal(voidedInv.void_reason, 'Billing address correction requested by tenant');
    assert.equal(voidedInv.voided_by, CANONICAL_ADMIN_ID);
    assert.ok(voidedInv.voided_at);
    // Financial snapshots remain intact
    assert.equal(Number(voidedInv.total_amount_paise), 299900);
  });

  // -------------------------------------------------------------------------
  // STAGE 5B VALIDATIONS — GST TRANSITION & SUBSCRIPTION RENEWAL HARDENING
  // -------------------------------------------------------------------------
  await t.test('STAGE 5B.1 — Policy C: Pre-GST recurring subscription renewal under Exclusive GST (Fixed-Gross Renewal)', async () => {
    // 1. Setup pre-GST subscription at ₹499 (49900 paise)
    const sId = 'sub_test_legacy_pre_gst_01';
    const pId = 'pay_test_legacy_pre_gst_01';
    const subCreatedTime = new Date('2026-01-15T10:00:00Z');

    // Tenant in Karnataka (intra-state with StayPilot KA)
    await db.query(`
      INSERT INTO public.saas_subscriptions (
        tenant_id, razorpay_subscription_id, razorpay_customer_id, staypilot_plan_type,
        environment, status, authorized_amount_paise, tax_policy, pricing_mode, created_at
      ) VALUES (
        '${TENANT_1_ID}', '${sId}', 'cust_ka_01', 'solo',
        'test', 'active', 49900, 'standard', 'none', '${subCreatedTime.toISOString()}'
      );
    `);

    // 2. Super Admin activates GST in EXCLUSIVE mode at 18% on 2026-06-01
    const gstActivationTime = new Date('2026-06-01T00:00:00Z');
    await db.query(`
      UPDATE public.profiles
      SET global_settings = jsonb_set(
        jsonb_set(
          global_settings,
          '{gst_configuration}',
          jsonb_build_object(
            'enabled', true,
            'status', 'active',
            'gstin', '29AABCU9603R1ZM',
            'rate_percent', 18,
            'pricing_mode', 'exclusive',
            'legacy_renewal_policy', 'fixed_gross',
            'effective_from', '${gstActivationTime.toISOString()}',
            'updated_at', '${gstActivationTime.toISOString()}'
          )
        ),
        '{seller_identity}',
        jsonb_build_object(
          'legal_name', 'StayPilot Technologies Pvt Ltd',
          'trade_name', 'Stay Pilot',
          'gstin', '29AABCU9603R1ZM',
          'address', '100 Feet Road, Indiranagar',
          'city', 'Bengaluru',
          'state', 'Karnataka',
          'state_code', '29',
          'pincode', '560038',
          'pan', 'AABCU9603R'
        )
      )
      WHERE id = '${CANONICAL_ADMIN_ID}';
    `);

    // 3. Razorpay charges the customer the original authorized mandate amount: ₹499 (49900 paise) on 2026-07-01
    // Without Stage 5B, this would throw EXCLUSIVE_PRICING_MISMATCH because catalog Solo exclusive is 499 + 18% = 588.82.
    // Under Stage 5B Policy C: Fixed-gross treatment applies!
    await db.query(`
      SELECT public.process_subscription_webhook(
        '${sId}', 'subscription.charged', 'test', 'active',
        '2026-07-01T10:00:00Z'::timestamptz, '2026-08-01T10:00:00Z'::timestamptz,
        '${pId}', 49900, 'INR', 'captured', 'upi'
      );
    `);

    // Verify payment record
    const payment = (await db.query(`SELECT * FROM public.saas_payments WHERE razorpay_payment_id = '${pId}';`)).rows[0];
    assert.equal(payment.status, 'captured');
    assert.equal(payment.invoice_status, 'issued', 'Invoice must be issued without manual_review blockage');

    // Verify invoice
    const inv = (await db.query(`SELECT * FROM public.saas_invoices WHERE payment_id = '${pId}';`)).rows[0];
    assert.ok(inv, 'Tax invoice must be generated');
    assert.equal(inv.invoice_type, 'tax_invoice');
    assert.equal(inv.tax_policy, 'fixed_gross');
    assert.equal(inv.pricing_mode, 'inclusive_mandate');
    assert.equal(Number(inv.total_amount_paise), 49900);
    // 49900 / 1.18 = 42288.135... rounded to 42288
    assert.equal(Number(inv.base_amount_paise), 42288);
    // 49900 - 42288 = 7612
    const totalTax = Number(inv.cgst_amount_paise) + Number(inv.sgst_amount_paise) + Number(inv.igst_amount_paise);
    assert.equal(totalTax, 7612);
    // Intra-state (KA to KA): CGST 3806 + SGST 3806
    assert.equal(Number(inv.cgst_amount_paise), 3806);
    assert.equal(Number(inv.sgst_amount_paise), 3806);
    assert.equal(Number(inv.igst_amount_paise), 0);
    assert.equal(Number(inv.base_amount_paise) + totalTax, Number(inv.total_amount_paise));
  });

  await t.test('STAGE 5B.2 — Policy B: New subscription created after GST activation in Exclusive Mode', async () => {
    // New subscription created under GST ON exclusive mode
    const sId = 'sub_test_new_exclusive_02';
    const pId = 'pay_test_new_exclusive_02';
    const newSubTime = new Date('2026-07-10T10:00:00Z');

    await db.query(`
      INSERT INTO public.saas_subscriptions (
        tenant_id, razorpay_subscription_id, razorpay_customer_id, staypilot_plan_type,
        environment, status, authorized_amount_paise, tax_policy, pricing_mode, created_at
      ) VALUES (
        '${TENANT_2_ID}', '${sId}', 'cust_tn_02', 'solo',
        'test', 'active', 58882, 'standard', 'exclusive', '${newSubTime.toISOString()}'
      );
    `);

    // Razorpay collects full exclusive total: 499 + 18% = 588.82 -> 58882 paise
    await db.query(`
      SELECT public.process_subscription_webhook(
        '${sId}', 'subscription.activated', 'test', 'active',
        '2026-07-10T10:00:00Z'::timestamptz, '2026-08-10T10:00:00Z'::timestamptz,
        '${pId}', 58882, 'INR', 'captured', 'card'
      );
    `);

    const inv = (await db.query(`SELECT * FROM public.saas_invoices WHERE payment_id = '${pId}';`)).rows[0];
    assert.ok(inv);
    assert.equal(inv.invoice_type, 'tax_invoice');
    assert.equal(inv.tax_policy, 'standard');
    assert.equal(inv.pricing_mode, 'exclusive');
    assert.equal(Number(inv.base_amount_paise), 49900);
    assert.equal(Number(inv.total_amount_paise), 58882);
    // Inter-state (KA to TN): IGST 8982
    assert.equal(Number(inv.igst_amount_paise), 8982);
    assert.equal(Number(inv.cgst_amount_paise), 0);
    assert.equal(Number(inv.sgst_amount_paise), 0);
  });

  await t.test('STAGE 5B.3 — Fail-closed protection against arbitrary price tampering / underpayment', async () => {
    // Payment under exclusive GST where amount is tampered / unapproved (e.g. ₹350 = 35000 paise)
    const sId = 'sub_test_tampered_03';
    const pId = 'pay_test_tampered_03';

    await db.query(`
      INSERT INTO public.saas_subscriptions (
        tenant_id, razorpay_subscription_id, razorpay_customer_id, staypilot_plan_type,
        environment, status, authorized_amount_paise, tax_policy, pricing_mode, created_at
      ) VALUES (
        '${TENANT_1_ID}', '${sId}', 'cust_tampered_03', 'solo',
        'test', 'active', 49900, 'standard', 'exclusive', now()
      );
    `);

    // Webhook delivers unauthorized amount 35000 paise
    await db.query(`
      SELECT public.process_subscription_webhook(
        '${sId}', 'subscription.charged', 'test', 'active',
        now(), now() + interval '30 days',
        '${pId}', 35000, 'INR', 'captured', 'card'
      );
    `);

    const payment = (await db.query(`SELECT * FROM public.saas_payments WHERE razorpay_payment_id = '${pId}';`)).rows[0];
    assert.equal(payment.invoice_status, 'manual_review', 'Tampered amount must be held in manual_review');
    assert.ok(payment.invoice_last_error.includes('EXCLUSIVE_PRICING_MISMATCH'));
  });

  await t.test('STAGE 5B.4 — Super Admin controlled opt-out: legacy_renewal_policy = manual_review', async () => {
    // Set Super Admin legacy_renewal_policy = manual_review
    await db.query(`
      UPDATE public.profiles
      SET global_settings = jsonb_set(
        global_settings,
        '{gst_configuration,legacy_renewal_policy}',
        '"manual_review"'
      )
      WHERE id = '${CANONICAL_ADMIN_ID}';
    `);

    const sId = 'sub_test_optout_04';
    const pId = 'pay_test_optout_04';
    const subCreatedTime = new Date('2026-01-15T10:00:00Z');

    await db.query(`
      INSERT INTO public.saas_subscriptions (
        tenant_id, razorpay_subscription_id, razorpay_customer_id, staypilot_plan_type,
        environment, status, authorized_amount_paise, tax_policy, pricing_mode, created_at
      ) VALUES (
        '${TENANT_1_ID}', '${sId}', 'cust_optout_04', 'solo',
        'test', 'active', 49900, 'standard', 'none', '${subCreatedTime.toISOString()}'
      );
    `);

    // Charge ₹499
    await db.query(`
      SELECT public.process_subscription_webhook(
        '${sId}', 'subscription.charged', 'test', 'active',
        now(), now() + interval '30 days',
        '${pId}', 49900, 'INR', 'captured', 'card'
      );
    `);

    const payment = (await db.query(`SELECT * FROM public.saas_payments WHERE razorpay_payment_id = '${pId}';`)).rows[0];
    assert.equal(payment.invoice_status, 'manual_review', 'Under manual_review policy, legacy renewal must flag for review');

    // Restore policy to fixed_gross
    await db.query(`
      UPDATE public.profiles
      SET global_settings = jsonb_set(
        global_settings,
        '{gst_configuration,legacy_renewal_policy}',
        '"fixed_gross"'
      )
      WHERE id = '${CANONICAL_ADMIN_ID}';
    `);
  });

  await t.test('STAGE 5B.5 — Non-Destructive Rollback Migration Rehearsal', async () => {
    // Execute rollback migration
    const rollbackSql = fs.readFileSync(
      path.join(ROOT, 'supabase', 'migrations', 'rollback_20261024120000_stage5b_gst_renewal_hardening.sql'),
      'utf8'
    );
    await db.exec(rollbackSql);

    // Verify non-destructive preservation: columns on saas_subscriptions and saas_invoices MUST NOT be destroyed
    const colsSub = (await db.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'saas_subscriptions'
        AND column_name IN ('authorized_amount_paise', 'tax_policy', 'pricing_mode');
    `)).rows;
    assert.equal(colsSub.length, 3, 'Audit columns on saas_subscriptions must be preserved for historical records');

    const colsInv = (await db.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'saas_invoices'
        AND column_name IN ('tax_policy', 'pricing_mode');
    `)).rows;
    assert.equal(colsInv.length, 2, 'Audit columns on saas_invoices must be preserved for statutory tax records');

    // Re-apply migration so database stays in desired verified state
    await db.exec(stage5bSql);
  });

  await t.test('STAGE 5B.6 — Multiple GST Activation Cycles (OFF -> ON -> OFF -> ON)', async () => {
    // Seed Tenant 3 for cycle 3
    await db.exec(`
      INSERT INTO public.profiles (id, role, full_name, email, plan_type, subscription_status, global_settings)
      VALUES (
        '${TENANT_3_ID}',
        'tenant_admin',
        'Munnar Mist Resorts',
        'munnar@example.com',
        'free',
        'none',
        jsonb_build_object(
          'billing', jsonb_build_object(
            'name', 'Munnar Mist Resorts',
            'email', 'billing@munnarmist.com',
            'address', 'Tea Gardens, Munnar',
            'state', 'Kerala',
            'state_code', '32',
            'pincode', '685612'
          )
        )
      ) ON CONFLICT (id) DO NOTHING;
    `);

    // Cycle 1: GST OFF — Create pre-GST subscription 1
    const sub1Id = 'sub_multi_cycle_01';
    await db.exec(`
      INSERT INTO public.saas_subscriptions (
        tenant_id, razorpay_subscription_id, razorpay_customer_id, staypilot_plan_type,
        environment, status, authorized_amount_paise, tax_policy, pricing_mode, created_at
      ) VALUES (
        '${TENANT_1_ID}', '${sub1Id}', 'cust_mc_01', 'solo',
        'test', 'active', 49900, 'non_gst', 'none', '2026-01-10T10:00:00Z'
      );
      INSERT INTO public.saas_payments (
        tenant_id, razorpay_payment_id, razorpay_subscription_id, amount,
        currency, status, environment, invoice_status, created_at
      ) VALUES (
        '${TENANT_1_ID}', 'pay_mc_01_init', '${sub1Id}', 49900,
        'INR', 'captured', 'test', 'issued', '2026-01-10T10:05:00Z'
      );
    `);

    // Cycle 2: GST ON (18% Exclusive) — Create subscription 2 under GST
    const sub2Id = 'sub_multi_cycle_02';
    await db.exec(`
      INSERT INTO public.saas_subscriptions (
        tenant_id, razorpay_subscription_id, razorpay_customer_id, staypilot_plan_type,
        environment, status, authorized_amount_paise, tax_policy, pricing_mode, created_at
      ) VALUES (
        '${TENANT_2_ID}', '${sub2Id}', 'cust_mc_02', 'solo',
        'test', 'active', 58882, 'standard', 'exclusive', '2026-03-15T10:00:00Z'
      );
      INSERT INTO public.saas_payments (
        tenant_id, razorpay_payment_id, razorpay_subscription_id, amount,
        currency, status, environment, invoice_status, created_at
      ) VALUES (
        '${TENANT_2_ID}', 'pay_mc_02_init', '${sub2Id}', 58882,
        'INR', 'captured', 'test', 'issued', '2026-03-15T10:05:00Z'
      );
    `);

    // Cycle 3: GST OFF — Create subscription 3 without GST
    const sub3Id = 'sub_multi_cycle_03';
    await db.exec(`
      INSERT INTO public.saas_subscriptions (
        tenant_id, razorpay_subscription_id, razorpay_customer_id, staypilot_plan_type,
        environment, status, authorized_amount_paise, tax_policy, pricing_mode, created_at
      ) VALUES (
        '${TENANT_3_ID}', '${sub3Id}', 'cust_mc_03', 'solo',
        'test', 'active', 49900, 'non_gst', 'none', '2026-06-20T10:00:00Z'
      );
      INSERT INTO public.saas_payments (
        tenant_id, razorpay_payment_id, razorpay_subscription_id, amount,
        currency, status, environment, invoice_status, created_at
      ) VALUES (
        '${TENANT_3_ID}', 'pay_mc_03_init', '${sub3Id}', 49900,
        'INR', 'captured', 'test', 'issued', '2026-06-20T10:05:00Z'
      );
    `);

    // Cycle 4: GST ON (Re-enabled on 2026-09-01 at 18% Exclusive)
    const reActivationTime = '2026-09-01T00:00:00Z';
    await db.query(`
      UPDATE public.profiles
      SET global_settings = jsonb_set(
        global_settings,
        '{gst_configuration}',
        jsonb_build_object(
          'enabled', true,
          'status', 'active',
          'gstin', '29AABCU9603R1ZM',
          'rate_percent', 18,
          'pricing_mode', 'exclusive',
          'legacy_renewal_policy', 'fixed_gross',
          'effective_from', '${reActivationTime}',
          'updated_at', '${reActivationTime}'
        )
      )
      WHERE id = '${CANONICAL_ADMIN_ID}';
    `);

    // Renewal of Sub 1 (created in Cycle 1): Must receive Policy C (fixed-gross ₹499)
    await db.query(`
      SELECT public.process_subscription_webhook(
        '${sub1Id}', 'subscription.charged', 'test', 'active',
        '2026-09-10T10:00:00Z'::timestamptz, '2026-10-10T10:00:00Z'::timestamptz,
        'pay_mc_01_ren', 49900, 'INR', 'captured', 'card'
      );
    `);
    const inv1 = (await db.query(`SELECT * FROM public.saas_invoices WHERE payment_id = 'pay_mc_01_ren';`)).rows[0];
    assert.equal(inv1.tax_policy, 'fixed_gross');
    assert.equal(inv1.pricing_mode, 'inclusive_mandate');
    assert.equal(Number(inv1.total_amount_paise), 49900);
    assert.equal(Number(inv1.base_amount_paise), 42288);

    // Renewal of Sub 2 (created in Cycle 2 under GST): Must renew at standard catalog exclusive ₹588.82
    await db.query(`
      SELECT public.process_subscription_webhook(
        '${sub2Id}', 'subscription.charged', 'test', 'active',
        '2026-09-15T10:00:00Z'::timestamptz, '2026-10-15T10:00:00Z'::timestamptz,
        'pay_mc_02_ren', 58882, 'INR', 'captured', 'card'
      );
    `);
    const inv2 = (await db.query(`SELECT * FROM public.saas_invoices WHERE payment_id = 'pay_mc_02_ren';`)).rows[0];
    assert.equal(inv2.tax_policy, 'standard');
    assert.equal(inv2.pricing_mode, 'exclusive');
    assert.equal(Number(inv2.total_amount_paise), 58882);
    assert.equal(Number(inv2.base_amount_paise), 49900);

    // Sub 2 (created under GST) attempts to pay ₹499 (claiming pre-GST treatment): Must be REJECTED!
    await db.query(`
      SELECT public.process_subscription_webhook(
        '${sub2Id}', 'subscription.charged', 'test', 'active',
        '2026-10-15T10:00:00Z'::timestamptz, '2026-11-15T10:00:00Z'::timestamptz,
        'pay_mc_02_tamper', 49900, 'INR', 'captured', 'card'
      );
    `);
    const payTamper = (await db.query(`SELECT * FROM public.saas_payments WHERE razorpay_payment_id = 'pay_mc_02_tamper';`)).rows[0];
    assert.equal(payTamper.invoice_status, 'manual_review', 'Sub created under GST cannot masquerade as pre-GST mandate');

    // Renewal of Sub 3 (created in Cycle 3 without GST): Must receive Policy C (fixed-gross ₹499)
    await db.query(`
      SELECT public.process_subscription_webhook(
        '${sub3Id}', 'subscription.charged', 'test', 'active',
        '2026-09-20T10:00:00Z'::timestamptz, '2026-10-20T10:00:00Z'::timestamptz,
        'pay_mc_03_ren', 49900, 'INR', 'captured', 'card'
      );
    `);
    const inv3 = (await db.query(`SELECT * FROM public.saas_invoices WHERE payment_id = 'pay_mc_03_ren';`)).rows[0];
    assert.equal(inv3.tax_policy, 'fixed_gross');
    assert.equal(inv3.pricing_mode, 'inclusive_mandate');
    assert.equal(Number(inv3.total_amount_paise), 49900);
    assert.equal(Number(inv3.base_amount_paise), 42288);
  });

  await t.test('STAGE 5B.7 — Legacy Subscription with NULL authorized_amount_paise & Catalog Price Change', async () => {
    // Subscription created pre-GST with NULL authorized_amount_paise
    const sId = 'sub_legacy_null_auth_07';
    await db.exec(`
      INSERT INTO public.saas_subscriptions (
        tenant_id, razorpay_subscription_id, razorpay_customer_id, staypilot_plan_type,
        environment, status, authorized_amount_paise, tax_policy, pricing_mode, created_at
      ) VALUES (
        '${TENANT_1_ID}', '${sId}', 'cust_null_auth', 'solo',
        'test', 'active', NULL, NULL, NULL, '2026-01-01T10:00:00Z'
      );
      -- Earliest payment on record was ₹499
      INSERT INTO public.saas_payments (
        tenant_id, razorpay_payment_id, razorpay_subscription_id, amount,
        currency, status, environment, invoice_status, created_at
      ) VALUES (
        '${TENANT_1_ID}', 'pay_legacy_init_07', '${sId}', 49900,
        'INR', 'captured', 'test', 'issued', '2026-01-01T10:05:00Z'
      );
    `);

    // Super Admin changes catalog Solo price from 499 to 799!
    await db.query(`
      UPDATE public.profiles
      SET global_settings = jsonb_set(
        jsonb_set(
          global_settings,
          '{pricing,published,solo,price}',
          '799'
        ),
        '{pricing,published,solo,monthlyPrice}',
        '799'
      )
      WHERE id = '${CANONICAL_ADMIN_ID}';
    `);

    // Renewal occurs for ₹499 (customer's original mandate)
    await db.query(`
      SELECT public.process_subscription_webhook(
        '${sId}', 'subscription.charged', 'test', 'active',
        '2026-09-25T10:00:00Z'::timestamptz, '2026-10-25T10:00:00Z'::timestamptz,
        'pay_legacy_ren_07', 49900, 'INR', 'captured', 'card'
      );
    `);

    // Verify: trusted authorized amount was resolved from earliest payment (49900), NOT changed catalog price (79900)
    const inv = (await db.query(`SELECT * FROM public.saas_invoices WHERE payment_id = 'pay_legacy_ren_07';`)).rows[0];
    assert.ok(inv, 'Invoice must issue successfully despite catalog price change');
    assert.equal(inv.tax_policy, 'fixed_gross');
    assert.equal(Number(inv.total_amount_paise), 49900);
    assert.equal(Number(inv.base_amount_paise), 42288);

    // Reset catalog Solo price back to 499
    await db.query(`
      UPDATE public.profiles
      SET global_settings = jsonb_set(
        jsonb_set(
          global_settings,
          '{pricing,published,solo,price}',
          '499'
        ),
        '{pricing,published,solo,monthlyPrice}',
        '499'
      )
      WHERE id = '${CANONICAL_ADMIN_ID}';
    `);
  });

  await t.test('STAGE 5B.8 — Delayed Webhook Delivery Transaction-Time Protection', async () => {
    // GST effective date is set to 2026-10-01T12:00:00Z
    const effTime = '2026-10-01T12:00:00Z';
    await db.query(`
      UPDATE public.profiles
      SET global_settings = jsonb_set(
        global_settings,
        '{gst_configuration,effective_from}',
        '"${effTime}"'
      )
      WHERE id = '${CANONICAL_ADMIN_ID}';
    `);

    const sId = 'sub_delayed_wh_08';
    await db.query(`
      INSERT INTO public.saas_subscriptions (
        tenant_id, razorpay_subscription_id, razorpay_customer_id, staypilot_plan_type,
        environment, status, authorized_amount_paise, tax_policy, pricing_mode, created_at
      ) VALUES (
        '${TENANT_1_ID}', '${sId}', 'cust_delayed_wh', 'solo',
        'test', 'active', 49900, 'non_gst', 'none', '2026-09-01T10:00:00Z'
      );
    `);

    // Payment occurred BEFORE GST became effective (at 08:00 AM on 2026-10-01)
    const paymentCreatedTime = '2026-10-01T08:00:00Z';
    const pId = 'pay_delayed_wh_08';

    await db.query(`
      INSERT INTO public.saas_payments (
        tenant_id, razorpay_payment_id, razorpay_subscription_id, amount,
        currency, status, environment, invoice_status, created_at
      ) VALUES (
        '${TENANT_1_ID}', '${pId}', '${sId}', 49900,
        'INR', 'captured', 'test', 'pending', '${paymentCreatedTime}'
      );
    `);

    // Webhook processing executes (simulating delayed delivery)
    await db.query(`SELECT public.generate_saas_commercial_invoice((SELECT id FROM public.saas_payments WHERE razorpay_payment_id = '${pId}'));`);

    // Verify: Payment was made before effective_from -> must be issued as commercial_invoice (non-GST)
    const inv = (await db.query(`SELECT * FROM public.saas_invoices WHERE payment_id = '${pId}';`)).rows[0];
    assert.equal(inv.invoice_type, 'commercial_invoice', 'Payment made before GST effective_from must generate commercial_invoice');
    assert.equal(Number(inv.gst_rate), 0);
    assert.equal(Number(inv.total_amount_paise), 49900);
    assert.equal(Number(inv.base_amount_paise), 49900);
  });

  // -------------------------------------------------------------------------
  // STAGE 5C VALIDATIONS — PRODUCTION READINESS & GST INTEGRITY VERIFICATION
  // -------------------------------------------------------------------------
  await t.test('STAGE 5C.1 — GST ON -> Payment Captured -> GST Subsequently Disabled (Fail-Safe Guard)', async () => {
    // 1. Subscription created with active GST (exclusive)
    const sId = 'sub_stage5c_dis_01';
    const pId = 'pay_stage5c_dis_01';
    await db.exec(`
      INSERT INTO public.saas_subscriptions (
        tenant_id, razorpay_subscription_id, razorpay_customer_id, staypilot_plan_type,
        environment, status, authorized_amount_paise, tax_policy, pricing_mode, created_at
      ) VALUES (
        '${TENANT_2_ID}', '${sId}', 'cust_5c_01', 'solo',
        'test', 'active', 58882, 'standard', 'exclusive', '2026-09-01T10:00:00Z'
      );
    `);

    // 2. Payment captured for ₹588.82
    await db.exec(`
      INSERT INTO public.saas_payments (
        tenant_id, razorpay_payment_id, razorpay_subscription_id, amount,
        currency, status, environment, invoice_status, created_at
      ) VALUES (
        '${TENANT_2_ID}', '${pId}', '${sId}', 58882,
        'INR', 'captured', 'test', 'pending', now()
      );
    `);

    // 3. Super Admin disables GST
    await db.query(`
      UPDATE public.profiles
      SET global_settings = jsonb_set(
        global_settings,
        '{gst_configuration,enabled}',
        'false'
      )
      WHERE id = '${CANONICAL_ADMIN_ID}';
    `);

    // 4. Invoicing runs for the payment. Must NOT generate a 0% tax invoice for 58882!
    // Must fail closed with HISTORICAL_TAX_CONFIG_MISMATCH and route to manual_review.
    await assert.rejects(async () => {
      await db.query(`SELECT public.generate_saas_commercial_invoice((SELECT id FROM public.saas_payments WHERE razorpay_payment_id = '${pId}'));`);
    }, /HISTORICAL_TAX_CONFIG_MISMATCH/);

    // Restore GST to enabled
    await db.query(`
      UPDATE public.profiles
      SET global_settings = jsonb_set(
        global_settings,
        '{gst_configuration,enabled}',
        'true'
      )
      WHERE id = '${CANONICAL_ADMIN_ID}';
    `);
  });

  await t.test('STAGE 5C.2 — Global GST pricing mode change does not overwrite contracted subscription pricing mode', async () => {
    // Subscription contracted with exclusive mode
    const sId = 'sub_stage5c_mode_02';
    const pId = 'pay_stage5c_mode_02';
    await db.exec(`
      INSERT INTO public.saas_subscriptions (
        tenant_id, razorpay_subscription_id, razorpay_customer_id, staypilot_plan_type,
        environment, status, authorized_amount_paise, tax_policy, pricing_mode, created_at
      ) VALUES (
        '${TENANT_2_ID}', '${sId}', 'cust_5c_02', 'solo',
        'test', 'active', 58882, 'standard', 'exclusive', '2026-09-01T10:00:00Z'
      );
    `);

    // Super Admin changes global pricing mode to 'inclusive'
    await db.query(`
      UPDATE public.profiles
      SET global_settings = jsonb_set(
        global_settings,
        '{gst_configuration,pricing_mode}',
        '"inclusive"'
      )
      WHERE id = '${CANONICAL_ADMIN_ID}';
    `);

    // Webhook delivers exclusive payment for 58882
    await db.query(`
      SELECT public.process_subscription_webhook(
        '${sId}', 'subscription.charged', 'test', 'active',
        now(), now() + interval '30 days',
        '${pId}', 58882, 'INR', 'captured', 'card'
      );
    `);

    // Invoice was generated respecting the subscription's contracted 'exclusive' pricing mode
    const inv = (await db.query(`SELECT * FROM public.saas_invoices WHERE payment_id = '${pId}';`)).rows[0];
    assert.equal(inv.pricing_mode, 'exclusive');
    assert.equal(Number(inv.base_amount_paise), 49900);
    assert.equal(Number(inv.total_amount_paise), 58882);

    // Reset global pricing mode back to exclusive
    await db.query(`
      UPDATE public.profiles
      SET global_settings = jsonb_set(
        global_settings,
        '{gst_configuration,pricing_mode}',
        '"exclusive"'
      )
      WHERE id = '${CANONICAL_ADMIN_ID}';
    `);
  });

  await t.test('STAGE 5C.3 — Promotional Subscription Expiration / Discrepancy Safe Manual Review', async () => {
    // Legacy subscription with NULL authorized_amount_paise whose first payment was promotional (₹299)
    const sId = 'sub_stage5c_promo_03';
    const pId = 'pay_stage5c_promo_03';
    await db.exec(`
      INSERT INTO public.saas_subscriptions (
        tenant_id, razorpay_subscription_id, razorpay_customer_id, staypilot_plan_type,
        environment, status, authorized_amount_paise, tax_policy, pricing_mode, created_at
      ) VALUES (
        '${TENANT_1_ID}', '${sId}', 'cust_5c_03', 'solo',
        'test', 'active', NULL, NULL, NULL, '2026-01-01T10:00:00Z'
      );
      INSERT INTO public.saas_payments (
        tenant_id, razorpay_payment_id, razorpay_subscription_id, amount,
        currency, status, environment, invoice_status, created_at
      ) VALUES (
        '${TENANT_1_ID}', 'pay_5c_promo_init', '${sId}', 29900,
        'INR', 'captured', 'test', 'issued', '2026-01-01T10:05:00Z'
      );
    `);

    // Renewal payment arrives for standard price ₹499 (promotion expired on gateway mandate)
    // Because historical recorded payment was 29900, and authorized_amount_paise was not populated,
    // the discrepancy must NOT guess or miscalculate: it must hold in manual_review safely.
    await db.query(`
      SELECT public.process_subscription_webhook(
        '${sId}', 'subscription.charged', 'test', 'active',
        now(), now() + interval '30 days',
        '${pId}', 49900, 'INR', 'captured', 'card'
      );
    `);

    const payment = (await db.query(`SELECT * FROM public.saas_payments WHERE razorpay_payment_id = '${pId}';`)).rows[0];
    assert.equal(payment.invoice_status, 'manual_review', 'Contradictory promo evidence must hold safely in manual_review');
    assert.ok(payment.invoice_last_error.includes('EXCLUSIVE_PRICING_MISMATCH'));
  });

  await t.test('STAGE 5D.1 — Exact Production Profile Compatibility: Absent GST Configuration Safe Default', async () => {
    // 1. Replicate exact production global_settings on Canonical Super Admin:
    // Absent gst_configuration, absent tax_settings, pricing with custom_1786983013013, pro, premium
    await db.query(`
      UPDATE public.profiles
      SET global_settings = jsonb_build_object(
        'pricing', jsonb_build_object(
          'custom_1786983013013', jsonb_build_object(
            'name', 'Solo',
            'price', 999,
            'offerPrice', 499,
            'offerActive', true
          ),
          'pro', jsonb_build_object(
            'name', 'Growth',
            'price', 2499,
            'offerPrice', 1499,
            'offerActive', true
          ),
          'premium', jsonb_build_object(
            'name', 'Stay Master',
            'price', 5999,
            'offerPrice', 2499,
            'offerActive', true
          ),
          'free', jsonb_build_object('name', 'Free Starter', 'price', 0)
        ),
        'website_pricing', jsonb_build_object(
          'published', jsonb_build_object(
            'custom_1786983013013', jsonb_build_object('displayPlanName', 'Solo', 'promotionalPrice', 499, 'monthlyPrice', 999, 'offerActive', true),
            'pro', jsonb_build_object('displayPlanName', 'Growth', 'promotionalPrice', 1499, 'monthlyPrice', 2499, 'offerActive', true),
            'premium', jsonb_build_object('displayPlanName', 'Stay Master', 'promotionalPrice', 2499, 'monthlyPrice', 5999, 'offerActive', true)
          )
        ),
        'seller_identity', jsonb_build_object(
          'trade_name', 'Stay Pilot',
          'legal_name', 'Mohamed Hassan Ariff',
          'address', '38, Siya Maricar Street, Nagore',
          'city', 'Nagapattinam',
          'state', 'Tamil Nadu',
          'state_code', '33',
          'pincode', '611002',
          'pan', 'ABCDE1234F',
          'email', 'billing@staypilot.co.in'
        ),
        'invoice_numbering', jsonb_build_object(
          'test', jsonb_build_object('prefix', 'SP-TEST-INV-', 'year_format', 'YYYY', 'padding', 5),
          'live', jsonb_build_object('prefix', 'SP-INV-', 'year_format', 'YYYY', 'padding', 5)
        ),
        'razorpay_settings', jsonb_build_object('mode', 'test')
      )
      WHERE id = '${CANONICAL_ADMIN_ID}';
    `);

    // Verify in database that gst_configuration and tax_settings are completely absent
    const prof = (await db.query(`SELECT global_settings FROM public.profiles WHERE id = '${CANONICAL_ADMIN_ID}';`)).rows[0];
    assert.equal(prof.global_settings.gst_configuration, undefined, 'gst_configuration must be absent');
    assert.equal(prof.global_settings.tax_settings, undefined, 'tax_settings must be absent');

    // 2. Process a new subscription payment under this production state
    const sId = 'sub_stage5d_prod_01';
    const pId = 'pay_stage5d_prod_01';
    await db.exec(`
      INSERT INTO public.saas_subscriptions (
        tenant_id, razorpay_subscription_id, razorpay_customer_id, staypilot_plan_type,
        environment, status, authorized_amount_paise, tax_policy, pricing_mode, created_at
      ) VALUES (
        '${TENANT_1_ID}', '${sId}', 'cust_5d_01', 'solo',
        'test', 'active', 49900, 'standard', 'none', now()
      );
    `);

    await db.query(`
      SELECT public.process_subscription_webhook(
        '${sId}', 'subscription.charged', 'test', 'active',
        now(), now() + interval '30 days',
        '${pId}', 49900, 'INR', 'captured', 'card'
      );
    `);

    // 3. Verify invoice is cleanly issued as a Non-GST Commercial Invoice
    const inv = (await db.query(`SELECT * FROM public.saas_invoices WHERE payment_id = '${pId}';`)).rows[0];
    assert.ok(inv, 'Invoice should be generated');
    assert.equal(inv.invoice_type, 'commercial_invoice');
    assert.equal(inv.tax_type, 'unregistered');
    assert.equal(Number(inv.gst_rate), 0);
    assert.equal(inv.tax_policy, 'non_gst');
    assert.equal(inv.pricing_mode, 'none');
    assert.equal(inv.supplier_gstin, null);
    assert.equal(Number(inv.base_amount_paise), 49900);
    assert.equal(Number(inv.cgst_amount_paise), 0);
    assert.equal(Number(inv.sgst_amount_paise), 0);
    assert.equal(Number(inv.igst_amount_paise), 0);
    assert.equal(Number(inv.total_amount_paise), 49900);
    assert.equal(inv.invoice_status, 'issued');
  });

  await t.test('STAGE 5D.2 — Pricing Structure Compatibility: Nested pricing.plans and website_pricing Fallback', async () => {
    // Enable GST in exclusive mode at 18% to exercise pricing resolution
    await db.query(`
      UPDATE public.profiles
      SET global_settings = jsonb_set(
        global_settings,
        '{gst_configuration}',
        jsonb_build_object(
          'enabled', true,
          'status', 'active',
          'rate_percent', 18,
          'pricing_mode', 'exclusive',
          'gstin', '33ABCDE1234F1Z5',
          'legacy_renewal_policy', 'fixed_gross'
        )
      )
      WHERE id = '${CANONICAL_ADMIN_ID}';
    `);

    // Case A: pricing is nested under pricing.plans
    await db.query(`
      UPDATE public.profiles
      SET global_settings = jsonb_set(
        global_settings,
        '{pricing}',
        jsonb_build_object(
          'plans', jsonb_build_object(
            'growth', jsonb_build_object('price', 1499, 'offerActive', false)
          )
        )
      )
      WHERE id = '${CANONICAL_ADMIN_ID}';
    `);

    const sIdA = 'sub_stage5d_plans_01';
    const pIdA = 'pay_stage5d_plans_01';
    await db.exec(`
      INSERT INTO public.saas_subscriptions (
        tenant_id, razorpay_subscription_id, razorpay_customer_id, staypilot_plan_type,
        environment, status, authorized_amount_paise, tax_policy, pricing_mode, created_at
      ) VALUES (
        '${TENANT_1_ID}', '${sIdA}', 'cust_5d_plans_01', 'growth',
        'test', 'active', 176882, 'standard', 'exclusive', now()
      );
    `);

    // 1499 + 18% GST (269.82) = 1768.82 => 176882 paise
    await db.query(`
      SELECT public.process_subscription_webhook(
        '${sIdA}', 'subscription.charged', 'test', 'active',
        now(), now() + interval '30 days',
        '${pIdA}', 176882, 'INR', 'captured', 'card'
      );
    `);

    const invA = (await db.query(`SELECT * FROM public.saas_invoices WHERE payment_id = '${pIdA}';`)).rows[0];
    assert.ok(invA, 'Invoice for pricing.plans should be generated');
    assert.equal(invA.invoice_type, 'tax_invoice');
    assert.equal(Number(invA.base_amount_paise), 149900);
    assert.equal(Number(invA.total_amount_paise), 176882);

    // Case B: pricing object empty, plan resolves from website_pricing.published
    await db.query(`
      UPDATE public.profiles
      SET global_settings = jsonb_set(
        global_settings,
        '{pricing}',
        '{}'::jsonb
      )
      WHERE id = '${CANONICAL_ADMIN_ID}';
    `);

    const sIdB = 'sub_stage5d_web_01';
    const pIdB = 'pay_stage5d_web_01';
    await db.exec(`
      INSERT INTO public.saas_subscriptions (
        tenant_id, razorpay_subscription_id, razorpay_customer_id, staypilot_plan_type,
        environment, status, authorized_amount_paise, tax_policy, pricing_mode, created_at
      ) VALUES (
        '${TENANT_1_ID}', '${sIdB}', 'cust_5d_web_01', 'solo',
        'test', 'active', 58882, 'standard', 'exclusive', now()
      );
    `);

    // Solo promotionalPrice = 499 + 18% GST (89.82) = 588.82 => 58882 paise
    await db.query(`
      SELECT public.process_subscription_webhook(
        '${sIdB}', 'subscription.charged', 'test', 'active',
        now(), now() + interval '30 days',
        '${pIdB}', 58882, 'INR', 'captured', 'card'
      );
    `);

    const invB = (await db.query(`SELECT * FROM public.saas_invoices WHERE payment_id = '${pIdB}';`)).rows[0];
    assert.ok(invB, 'Invoice for website_pricing.published fallback should be generated');
    assert.equal(invB.invoice_type, 'tax_invoice');
    assert.equal(Number(invB.base_amount_paise), 49900);
    assert.equal(Number(invB.total_amount_paise), 58882);
  });
});
