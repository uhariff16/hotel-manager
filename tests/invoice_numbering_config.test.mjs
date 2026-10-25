import test from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  DEFAULT_INVOICE_NUMBERING,
  VALID_YEAR_FORMATS,
  CANONICAL_SUPER_ADMIN_ID,
  validateNumberingSettings,
  validateDualNumberingConfig,
  computeInvoiceNumberPreview
} from '../src/lib/invoiceNumberingConfig.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

test('Invoice Numbering Configuration & Optional Supplier Details Suite', async (t) => {

  // =========================================================================
  // PART 1: PURE RULES & VALIDATION TESTS
  // =========================================================================
  await t.test('1. Client-side validation handles valid configurations', () => {
    const validConfig = {
      test: { prefix: 'SP-TEST-INV-', year_format: 'YYYY', padding: 5, starting_number: 1001 },
      live: { prefix: 'SP-INV-', year_format: 'YYYY', padding: 5, starting_number: 1 }
    };
    const res = validateDualNumberingConfig(validConfig);
    assert.equal(res.isValid, true);
    assert.deepEqual(res.errors, {});
  });

  await t.test('2. Client-side validation rejects identical prefixes (collision prevention)', () => {
    const collidingConfig = {
      test: { prefix: 'SP-INV-', year_format: 'YYYY', padding: 5, starting_number: 1001 },
      live: { prefix: 'SP-INV-', year_format: 'YYYY', padding: 5, starting_number: 1 }
    };
    const res = validateDualNumberingConfig(collidingConfig);
    assert.equal(res.isValid, false);
    assert.match(res.errors.conflict, /TEST and LIVE invoice prefixes must be distinct/);
  });

  await t.test('3. Client-side validation enforces prefix format and padding range', () => {
    const invalidConfig = {
      test: { prefix: 'INVALID PREFIX with spaces!', year_format: 'INVALID_YEAR', padding: 1, starting_number: 0 },
      live: { prefix: '', year_format: 'YY', padding: 20, starting_number: -5 }
    };
    const res = validateDualNumberingConfig(invalidConfig);
    assert.equal(res.isValid, false);
    assert.ok(res.errors.test.prefix);
    assert.ok(res.errors.test.year_format);
    assert.ok(res.errors.test.padding);
    assert.ok(res.errors.test.starting_number);

    assert.ok(res.errors.live.prefix);
    assert.ok(res.errors.live.padding);
    assert.ok(res.errors.live.starting_number);
  });

  await t.test('4. computeInvoiceNumberPreview generates expected strings across year formats and padding', () => {
    const fixedDate = new Date('2026-10-18T12:00:00Z');

    // Default YYYY
    const p1 = computeInvoiceNumberPreview({ prefix: 'SP-TEST-INV-', year_format: 'YYYY', padding: 5 }, 1004, fixedDate);
    assert.equal(p1, 'SP-TEST-INV-2026-01004');

    // 2-digit YY
    const p2 = computeInvoiceNumberPreview({ prefix: 'STAY-', year_format: 'YY', padding: 6 }, 42, fixedDate);
    assert.equal(p2, 'STAY-26-000042');

    // No year format
    const p3 = computeInvoiceNumberPreview({ prefix: 'INV-', year_format: 'none', padding: 4 }, 7, fixedDate);
    assert.equal(p3, 'INV-0007');
  });

  // =========================================================================
  // PART 2: POSTGRESQL INTEGRATION & MIGRATION TESTS (PGLITE)
  // =========================================================================
  const db = new PGlite();

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
      staypilot_plan_type text DEFAULT 'solo',
      environment text,
      status text DEFAULT 'active',
      created_at timestamptz DEFAULT now()
    );

    CREATE TABLE public.saas_payments (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id uuid REFERENCES public.profiles(id),
      razorpay_payment_id text UNIQUE,
      razorpay_subscription_id text,
      amount numeric,
      currency text,
      status text,
      environment text,
      invoice_status text,
      invoice_last_error text,
      payment_method text,
      created_at timestamptz DEFAULT now()
    );

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
      tax_type text,
      base_amount_paise bigint,
      gst_rate numeric,
      cgst_amount_paise bigint,
      sgst_amount_paise bigint,
      igst_amount_paise bigint,
      total_amount_paise bigint,
      razorpay_payment_id text,
      saas_payment_id uuid UNIQUE,
      invoice_type text,
      invoice_status text,
      issued_at timestamptz,
      created_at timestamptz DEFAULT now()
    );

    CREATE SEQUENCE IF NOT EXISTS public.saas_invoice_number_seq_live
      INCREMENT BY 1
      MINVALUE 1
      START WITH 1
      NO CYCLE;

    CREATE SEQUENCE IF NOT EXISTS public.saas_invoice_number_seq_test
      INCREMENT BY 1
      MINVALUE 1
      START WITH 1001
      NO CYCLE;
  `);

  // Insert Canonical Super Admin and QA Tenant
  const CANONICAL_ID = '9c4e65f5-c0a1-4b3a-8ed2-d01175a73409';
  const TENANT_ID = 'ee23247c-3b09-4ef4-abf7-2d7e7457eac1';

  await db.exec(`
    INSERT INTO public.profiles (id, role, full_name, email, global_settings)
    VALUES (
      '${CANONICAL_ID}',
      'super_admin',
      'Mohamed Hassan Ariff',
      'uhariff@gmail.com',
      '{"pricing": {"solo": 499}, "seller_identity": {"trade_name": "Stay Pilot"}}'::jsonb
    );

    INSERT INTO public.profiles (id, role, full_name, email, global_settings)
    VALUES (
      '${TENANT_ID}',
      'tenant_admin',
      'QA Test Property',
      'tenant@example.com',
      '{"billing": {"name": "QA Test Resort", "email": "resort@example.com", "address": "123 Hill Road", "state": "Karnataka"}}'::jsonb
    );
  `);

  // Run the Migration SQL
  const migrationSql = fs.readFileSync(
    path.join(ROOT, 'supabase/migrations/20261018210000_super_admin_invoice_numbering_config.sql'),
    'utf8'
  );
  await db.exec(migrationSql);

  await t.test('5. Default preview works cleanly before explicit configuration is saved', async () => {
    const res = await db.query(`SELECT public.get_next_invoice_number_preview('test') AS preview;`);
    const preview = res.rows[0].preview;
    assert.equal(preview.prefix, 'SP-TEST-INV-');
    assert.equal(preview.year_format, 'YYYY');
    assert.equal(preview.padding, 5);
    assert.equal(preview.next_sequence_number, 1001);
  });

  await t.test('6. public.get_next_invoice_number_preview returns accurate preview without advancing sequence', async () => {
    const res = await db.query(`SELECT public.get_next_invoice_number_preview('test') AS preview;`);
    const preview = res.rows[0].preview;
    assert.equal(preview.environment, 'test');
    assert.equal(preview.prefix, 'SP-TEST-INV-');
    assert.equal(preview.next_sequence_number, 1001);
    assert.match(preview.formatted_preview, /^SP-TEST-INV-\d{4}-01001$/);
    assert.equal(preview.is_series_active, false);

    // Call again to verify sequence did not advance
    const res2 = await db.query(`SELECT public.get_next_invoice_number_preview('test') AS preview;`);
    assert.equal(res2.rows[0].preview.next_sequence_number, 1001);
  });

  await t.test('7. Super Admin can update invoice numbering configuration via RPC', async () => {
    await db.exec(`SET SESSION "request.jwt.claim.sub" = '${CANONICAL_ID}';`);
    await db.exec(`SET SESSION "request.jwt.claim.role" = 'authenticated';`);

    const patch = {
      test: { prefix: 'STAY-TEST-', year_format: 'YY', padding: 6, starting_number: 2000 },
      live: { prefix: 'STAY-LIVE-', year_format: 'YYYY', padding: 5, starting_number: 100 }
    };

    const res = await db.query(`
      SELECT public.update_saas_global_configuration(
        'invoice_numbering',
        NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL,
        '${CANONICAL_ID}'::uuid,
        '${JSON.stringify(patch)}'::jsonb
      ) AS updated;
    `);

    const updated = res.rows[0].updated;
    assert.equal(updated.invoice_numbering.test.prefix, 'STAY-TEST-');
    assert.equal(updated.invoice_numbering.test.year_format, 'YY');
    assert.equal(updated.invoice_numbering.test.padding, 6);
    assert.equal(updated.invoice_numbering.test.starting_number, 2000);

    // Verify preview reflects updated config and starting number
    const previewRes = await db.query(`SELECT public.get_next_invoice_number_preview('test') AS preview;`);
    const preview = previewRes.rows[0].preview;
    assert.equal(preview.prefix, 'STAY-TEST-');
    assert.equal(preview.next_sequence_number, 2000);
    assert.match(preview.formatted_preview, /^STAY-TEST-\d{2}-002000$/);
  });

  await t.test('8. Non-super admin is rejected when attempting to update numbering', async () => {
    await db.exec(`SET SESSION "request.jwt.claim.sub" = '${TENANT_ID}';`);
    await db.exec(`SET SESSION "request.jwt.claim.role" = 'authenticated';`);

    await assert.rejects(
      async () => {
        await db.query(`
          SELECT public.update_saas_global_configuration(
            'invoice_numbering',
            NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL,
            '${CANONICAL_ID}'::uuid,
            '{"test": {"prefix": "HACK-"}}'::jsonb
          );
        `);
      },
      /FORBIDDEN: Only Super Administrators can modify global configuration/
    );
  });

  await t.test('9. Conflicting identical prefixes between TEST and LIVE are rejected', async () => {
    await db.exec(`SET SESSION "request.jwt.claim.sub" = '${CANONICAL_ID}';`);
    await db.exec(`SET SESSION "request.jwt.claim.role" = 'authenticated';`);

    const collidingPatch = {
      test: { prefix: 'SP-COLLIDE-', year_format: 'YYYY', padding: 5, starting_number: 1000 },
      live: { prefix: 'SP-COLLIDE-', year_format: 'YYYY', padding: 5, starting_number: 1000 }
    };

    await assert.rejects(
      async () => {
        await db.query(`
          SELECT public.update_saas_global_configuration(
            'invoice_numbering',
            NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL,
            '${CANONICAL_ID}'::uuid,
            '${JSON.stringify(collidingPatch)}'::jsonb
          );
        `);
      },
      /CONFLICTING_PREFIX: TEST and LIVE environments must have distinct prefixes/
    );
  });

  await t.test('10. generate_saas_commercial_invoice issues invoice using custom numbering and optional seller fields', async () => {
    // Reset to clean prefix for invoice issuance test
    await db.exec(`SET SESSION "request.jwt.claim.sub" = '${CANONICAL_ID}';`);
    await db.exec(`SET SESSION "request.jwt.claim.role" = 'authenticated';`);

    const standardPatch = {
      test: { prefix: 'SP-TEST-INV-', year_format: 'YYYY', padding: 5, starting_number: 1001 },
      live: { prefix: 'SP-INV-', year_format: 'YYYY', padding: 5, starting_number: 1 }
    };
    await db.query(`
      SELECT public.update_saas_global_configuration(
        'invoice_numbering',
        NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL,
        '${CANONICAL_ID}'::uuid,
        '${JSON.stringify(standardPatch)}'::jsonb
      );
    `);

    // Verify canonical profile has NO proprietor legal name, address, or PAN (optional fields)
    const prof = await db.query(`SELECT global_settings->'seller_identity' AS seller FROM public.profiles WHERE id = '${CANONICAL_ID}';`);
    assert.equal(prof.rows[0].seller.legal_name, undefined);
    assert.equal(prof.rows[0].seller.address, undefined);
    assert.equal(prof.rows[0].seller.pan, undefined);

    // Create payment in TEST environment
    const payRes = await db.query(`
      INSERT INTO public.saas_payments (
        tenant_id, razorpay_payment_id, amount, currency, status, environment, invoice_status
      ) VALUES (
        '${TENANT_ID}', 'pay_test_numbering_001', 49900, 'INR', 'captured', 'test', 'pending'
      ) RETURNING id;
    `);
    const paymentId = payRes.rows[0].id;

    // Issue invoice (runs as service_role / internal engine)
    const invRes = await db.query(`SELECT public.generate_saas_commercial_invoice('${paymentId}'::uuid) AS invoice_id;`);
    const invoiceId = invRes.rows[0].invoice_id;
    assert.ok(invoiceId);

    // Verify invoice fields
    const invDetails = await db.query(`SELECT * FROM public.saas_invoices WHERE id = '${invoiceId}';`);
    const inv = invDetails.rows[0];
    assert.match(inv.invoice_number, /^SP-TEST-INV-\d{4}-01001$/);
    assert.equal(inv.supplier_trade_name, 'Stay Pilot');
    assert.equal(inv.supplier_legal_name, null); // cleanly null, no crash
    assert.equal(inv.supplier_address, null);    // cleanly null, no crash
    assert.equal(inv.supplier_pan, null);        // cleanly null, no crash
    assert.equal(inv.total_amount_paise, 49900);
    assert.equal(inv.environment, 'test');
  });

  await t.test('11. Rewind Protection: Active series cannot be reset to a lower number', async () => {
    await db.exec(`SET SESSION "request.jwt.claim.sub" = '${CANONICAL_ID}';`);
    await db.exec(`SET SESSION "request.jwt.claim.role" = 'authenticated';`);

    // We already issued invoice SP-TEST-INV-2026-01001 (next sequence is 1002).
    // Attempting to rewind starting_number back to 500 must fail closed!
    const rewindPatch = {
      test: { prefix: 'SP-TEST-INV-', year_format: 'YYYY', padding: 5, starting_number: 500 }
    };

    await assert.rejects(
      async () => {
        await db.query(`
          SELECT public.update_saas_global_configuration(
            'invoice_numbering',
            NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL,
            '${CANONICAL_ID}'::uuid,
            '${JSON.stringify(rewindPatch)}'::jsonb
          );
        `);
      },
      /CANNOT_REWIND_SEQUENCE/
    );
  });

  await t.test('12. LIVE payment automatically receives LIVE numbering without TEST tag', async () => {
    // Create payment in LIVE environment
    const payRes = await db.query(`
      INSERT INTO public.saas_payments (
        tenant_id, razorpay_payment_id, amount, currency, status, environment, invoice_status
      ) VALUES (
        '${TENANT_ID}', 'pay_live_realtime_001', 49900, 'INR', 'captured', 'live', 'pending'
      ) RETURNING id;
    `);
    const livePaymentId = payRes.rows[0].id;

    // Issue invoice
    const invRes = await db.query(`SELECT public.generate_saas_commercial_invoice('${livePaymentId}'::uuid) AS invoice_id;`);
    const liveInvoiceId = invRes.rows[0].invoice_id;

    const invDetails = await db.query(`SELECT * FROM public.saas_invoices WHERE id = '${liveInvoiceId}';`);
    const liveInv = invDetails.rows[0];

    // Must be SP-INV-YYYY-00001 (NOT SP-TEST-INV)
    assert.match(liveInv.invoice_number, /^SP-INV-\d{4}-00001$/);
    assert.equal(liveInv.invoice_number.includes('TEST'), false, 'LIVE invoice must NEVER have TEST tag');
    assert.equal(liveInv.environment, 'live');
  });
});
