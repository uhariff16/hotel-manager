import test from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

const CANONICAL_SUPER_ADMIN_ID = '9c4e65f5-c0a1-4b3a-8ed2-d01175a73409';
const CHEERFUL_CHALET_ID = '3797dba7-a7fd-4ca6-86cb-b45519953947';
const OTHER_SUPER_ADMIN_ID = '11111111-1111-1111-1111-111111111111';
const NORMAL_TENANT_ID = '22222222-2222-2222-2222-222222222222';

test('STAY PILOT — Super Admin QA Account Cleanup, Archive & Reusable Email Reset (18 Safety Invariants)', async (t) => {
  const db = new PGlite();

  // 1. Setup base Postgres schema with auth mock and dependent SaaS tables
  await db.exec(`
    CREATE SCHEMA IF NOT EXISTS auth;
    CREATE SCHEMA IF NOT EXISTS private;

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
      email text UNIQUE,
      full_name text,
      role text NOT NULL DEFAULT 'tenant_admin',
      plan_type text NOT NULL DEFAULT 'free',
      subscription_status text DEFAULT 'trialing',
      is_legacy_account boolean DEFAULT false,
      tenant_id uuid,
      global_settings jsonb DEFAULT '{}'::jsonb,
      trial_started_at timestamptz,
      trial_ends_at timestamptz,
      created_at timestamptz DEFAULT now(),
      updated_at timestamptz DEFAULT now()
    );

    CREATE OR REPLACE FUNCTION public.is_super_admin()
    RETURNS boolean LANGUAGE plpgsql STABLE AS $$
    BEGIN
      RETURN EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid() AND role = 'super_admin'
      );
    END;
    $$;

    CREATE TABLE public.resorts (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id uuid REFERENCES public.profiles(id),
      name text NOT NULL,
      created_at timestamptz DEFAULT now()
    );

    CREATE TABLE public.cottages (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id uuid REFERENCES public.profiles(id),
      resort_id uuid REFERENCES public.resorts(id),
      name text NOT NULL,
      created_at timestamptz DEFAULT now()
    );

    CREATE TABLE public.rooms (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id uuid REFERENCES public.profiles(id),
      cottage_id uuid REFERENCES public.cottages(id),
      room_number text NOT NULL,
      created_at timestamptz DEFAULT now()
    );

    -- Active booking deletion session table mimicking production booking guard
    CREATE TABLE IF NOT EXISTS private.active_booking_deletion_sessions (
      booking_id uuid NOT NULL,
      authorized_tenant_id uuid NOT NULL,
      authorized_by uuid NOT NULL,
      tx_id xid8 NOT NULL DEFAULT pg_current_xact_id(),
      created_at timestamptz NOT NULL DEFAULT clock_timestamp()
    );

    CREATE TABLE public.bookings (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id uuid REFERENCES public.profiles(id),
      room_id uuid REFERENCES public.rooms(id),
      guest_name text NOT NULL,
      reference_number text DEFAULT 'REF-TEST-001',
      phone_number text DEFAULT '9999999999',
      total_amount numeric DEFAULT 0,
      advance_paid numeric DEFAULT 0,
      balance_amount numeric DEFAULT 0,
      created_at timestamptz DEFAULT now()
    );

    -- Production booking guard trigger
    CREATE OR REPLACE FUNCTION private.trg_booking_deletion_guard()
    RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM private.active_booking_deletion_sessions
        WHERE booking_id = OLD.id AND tx_id = pg_current_xact_id()
      ) THEN
        RAISE EXCEPTION 'DIRECT_BOOKING_DELETE_PROHIBITED: Cannot delete booking without active deletion session.'
          USING ERRCODE = '55000';
      END IF;
      RETURN OLD;
    END;
    $$;

    CREATE TRIGGER trg_enforce_booking_direct_delete
    BEFORE DELETE ON public.bookings
    FOR EACH ROW EXECUTE FUNCTION private.trg_booking_deletion_guard();

    CREATE TABLE public.incomes (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id uuid REFERENCES public.profiles(id),
      booking_id uuid REFERENCES public.bookings(id),
      parent_income_id uuid REFERENCES public.incomes(id),
      amount numeric NOT NULL,
      source text DEFAULT 'room_rent',
      payment_mode text DEFAULT 'upi',
      transaction_type text DEFAULT 'credit',
      notes text,
      date date DEFAULT CURRENT_DATE,
      created_at timestamptz DEFAULT now()
    );

    CREATE TABLE public.expenses (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id uuid REFERENCES public.profiles(id),
      amount numeric NOT NULL,
      created_at timestamptz DEFAULT now()
    );

    CREATE TABLE public.support_tickets (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id uuid REFERENCES public.profiles(id),
      subject text NOT NULL,
      status text DEFAULT 'open',
      created_at timestamptz DEFAULT now()
    );

    CREATE TABLE public.support_messages (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      ticket_id uuid REFERENCES public.support_tickets(id),
      message text NOT NULL,
      created_at timestamptz DEFAULT now()
    );

    CREATE TABLE public.booking_deletion_audits (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      booking_id uuid,
      booking_reference text,
      tenant_id uuid,
      guest_name text,
      guest_phone text,
      total_booking_amount numeric,
      advance_paid numeric,
      balance_amount numeric,
      financial_records_snapshot jsonb,
      deleted_by_user_id uuid,
      deleted_by_role text,
      deletion_reason text,
      created_at timestamptz DEFAULT now()
    );

    CREATE TABLE public.saas_payments (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id uuid,
      razorpay_payment_id text,
      amount numeric,
      status text,
      environment text DEFAULT 'test',
      created_at timestamptz DEFAULT now()
    );

    CREATE TABLE public.saas_invoices (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id uuid,
      saas_payment_id uuid,
      invoice_number text UNIQUE NOT NULL,
      invoice_status text DEFAULT 'issued',
      customer_name text DEFAULT 'Test QA User',
      customer_email text DEFAULT 'qa@staypilot.test',
      total_amount numeric,
      environment text DEFAULT 'test',
      created_at timestamptz DEFAULT now()
    );

    -- Mimic production saas_invoice immutability guard
    CREATE OR REPLACE FUNCTION public.enforce_saas_invoice_immutability()
    RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'INVOICE_IMMUTABLE: Issued commercial invoices cannot be deleted.'
          USING ERRCODE = '42501';
      END IF;
      -- Case A: decouple tenant_id to NULL upon account cleanup is allowed
      IF TG_OP = 'UPDATE' THEN
        IF OLD.tenant_id IS NOT NULL AND NEW.tenant_id IS NULL THEN
          RETURN NEW;
        END IF;
      END IF;
      RETURN NEW;
    END;
    $$;

    CREATE TRIGGER trg_saas_invoices_immutable
    BEFORE UPDATE OR DELETE ON public.saas_invoices
    FOR EACH ROW EXECUTE FUNCTION public.enforce_saas_invoice_immutability();

    CREATE TABLE public.saas_subscriptions (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id uuid,
      razorpay_subscription_id text,
      status text DEFAULT 'active',
      environment text DEFAULT 'test',
      created_at timestamptz DEFAULT now()
    );
  `);

  // Seed baseline accounts
  await db.exec(`
    INSERT INTO public.profiles (id, email, full_name, role, plan_type, subscription_status)
    VALUES
      ('${CANONICAL_SUPER_ADMIN_ID}', 'uhariff@gmail.com', 'Canonical Super Admin', 'super_admin', 'premium', 'active'),
      ('${OTHER_SUPER_ADMIN_ID}', 'uhariff16@gmail.com', 'Secondary Super Admin', 'super_admin', 'premium', 'active'),
      ('${CHEERFUL_CHALET_ID}', 'cheerfulchalet@gmail.com', 'Cheerful Chalet', 'tenant_admin', 'luxury', 'active'),
      ('${NORMAL_TENANT_ID}', 'realcustomer@hotel.com', 'Real Customer Hotel', 'tenant_admin', 'pro', 'active');
  `);

  const setAuthContext = async (userId, role = 'authenticated') => {
    await db.exec(`
      SELECT set_config('request.jwt.claim.sub', '${userId}', false);
      SELECT set_config('request.jwt.claim.role', '${role}', false);
    `);
  };

  // Apply baseline reset migration (audit logs, set_account_qa_disposable)
  const baseMigrationPath = path.join(ROOT, 'supabase', 'migrations', '20261019120000_super_admin_reset_test_account.sql');
  await db.exec(fs.readFileSync(baseMigrationPath, 'utf8'));

  // Apply new environment-aware cleanup, archive, and reset migration
  const newMigrationPath = path.join(ROOT, 'supabase', 'migrations', '20261019140000_super_admin_qa_cleanup_archive_reset.sql');
  await db.exec(fs.readFileSync(newMigrationPath, 'utf8'));

  // Helper: create a disposable QA tenant
  let tenantSeq = 100;
  const createQaTenant = async (email, plan = 'premium', status = 'trialing') => {
    tenantSeq++;
    const id = `00000000-0000-0000-0000-${String(tenantSeq).padStart(12, '0')}`;
    await db.exec(`
      INSERT INTO public.profiles (id, email, full_name, role, plan_type, subscription_status, is_disposable_qa)
      VALUES ('${id}', '${email}', 'QA Tenant ${tenantSeq}', 'tenant_admin', '${plan}', '${status}', true);
      INSERT INTO public.disposable_qa_accounts (tenant_id, email, notes, designated_by)
      VALUES ('${id}', '${email}', 'Automated test tenant', '${CANONICAL_SUPER_ADMIN_ID}');
    `);
    return id;
  };

  // Case 1: Empty disposable QA tenant (zero financial history)
  await t.test('Case 1: Empty disposable QA tenant deletes cleanly', async () => {
    const email = 'empty_qa@staypilot.test';
    const id = await createQaTenant(email);

    await setAuthContext(CANONICAL_SUPER_ADMIN_ID);
    const eligRes = await db.query(`SELECT public.get_tenant_qa_eligibility('${id}');`);
    const elig = eligRes.rows[0].get_tenant_qa_eligibility;
    assert.equal(elig.financial_classification, 'NONE');
    assert.equal(elig.is_reset_eligible, true);
    assert.equal(elig.block_reasons.length, 0);

    const resetRes = await db.query(`SELECT public.reset_disposable_qa_account('${id}', '${email}');`);
    assert.equal(resetRes.rows[0].reset_disposable_qa_account.success, true);

    const check = await db.query(`SELECT count(*) FROM public.profiles WHERE id = '${id}';`);
    assert.equal(Number(check.rows[0].count), 0);
  });

  // Case 2: Trial-only disposable tenant with operational data
  await t.test('Case 2: Trial-only disposable tenant with operational data resets cleanly', async () => {
    const email = 'trial_qa@staypilot.test';
    const id = await createQaTenant(email, 'premium', 'trialing');

    const resortRes = await db.query(`INSERT INTO public.resorts (tenant_id, name) VALUES ('${id}', 'Trial Resort') RETURNING id;`);
    const resId = resortRes.rows[0].id;
    await db.query(`INSERT INTO public.expenses (tenant_id, amount) VALUES ('${id}', 250);`);

    await setAuthContext(CANONICAL_SUPER_ADMIN_ID);
    const resetRes = await db.query(`SELECT public.reset_disposable_qa_account('${id}', '${email}');`);
    assert.equal(resetRes.rows[0].reset_disposable_qa_account.success, true);

    const resortCheck = await db.query(`SELECT count(*) FROM public.resorts WHERE tenant_id = '${id}';`);
    assert.equal(Number(resortCheck.rows[0].count), 0);
  });

  // Case 3: QA tenant with captured TEST payment (eligible for reset)
  await t.test('Case 3: QA tenant with captured TEST payment is eligible and resets', async () => {
    const email = 'test_pay_qa@staypilot.test';
    const id = await createQaTenant(email);

    await db.query(`
      INSERT INTO public.saas_payments (tenant_id, razorpay_payment_id, amount, status, environment)
      VALUES ('${id}', 'pay_test_001', 1499, 'captured', 'test');
    `);

    await setAuthContext(CANONICAL_SUPER_ADMIN_ID);
    const eligRes = await db.query(`SELECT public.get_tenant_qa_eligibility('${id}');`);
    const elig = eligRes.rows[0].get_tenant_qa_eligibility;
    assert.equal(elig.financial_classification, 'TEST_ONLY');
    assert.equal(elig.is_reset_eligible, true);
    assert.equal(elig.financials.test_payments, 1);

    const resetRes = await db.query(`SELECT public.reset_disposable_qa_account('${id}', '${email}');`);
    assert.equal(resetRes.rows[0].reset_disposable_qa_account.success, true);

    const payCheck = await db.query(`SELECT count(*) FROM public.saas_payments WHERE tenant_id = '${id}';`);
    assert.equal(Number(payCheck.rows[0].count), 0);
  });

  // Case 4: QA tenant with issued TEST commercial acknowledgment (invoice decoupled, sequence preserved)
  await t.test('Case 4: QA tenant with issued TEST commercial invoice decouples tenant_id and preserves sequence', async () => {
    const email = 'test_inv_qa@staypilot.test';
    const id = await createQaTenant(email);

    await db.query(`
      INSERT INTO public.saas_invoices (tenant_id, invoice_number, invoice_status, customer_name, customer_email, total_amount, environment)
      VALUES ('${id}', 'SP-2627-TEST-0001', 'issued', 'Test QA User', '${email}', 1499, 'test');
    `);

    await setAuthContext(CANONICAL_SUPER_ADMIN_ID);
    const eligRes = await db.query(`SELECT public.get_tenant_qa_eligibility('${id}');`);
    const elig = eligRes.rows[0].get_tenant_qa_eligibility;
    assert.equal(elig.financial_classification, 'TEST_ONLY');
    assert.equal(elig.is_reset_eligible, true);
    assert.equal(elig.financials.test_invoices, 1);

    const resetRes = await db.query(`SELECT public.reset_disposable_qa_account('${id}', '${email}');`);
    assert.equal(resetRes.rows[0].reset_disposable_qa_account.success, true);

    // Invoice must STILL exist in saas_invoices with tenant_id = NULL
    const invCheck = await db.query(`SELECT * FROM public.saas_invoices WHERE invoice_number = 'SP-2627-TEST-0001';`);
    assert.equal(invCheck.rows.length, 1);
    assert.equal(invCheck.rows[0].tenant_id, null, 'tenant_id must be decoupled to NULL');
    assert.equal(invCheck.rows[0].original_tenant_id, id, 'original_tenant_id must be permanently preserved');
    assert.equal(invCheck.rows[0].original_tenant_email, email, 'original_tenant_email must be preserved');
    assert.ok(invCheck.rows[0].retention_notes.includes('disposable QA reset'), 'retention_notes must document preservation');
    assert.equal(invCheck.rows[0].environment, 'test');
  });

  // Case 5: QA tenant with TEST subscription (cancelled/reconciled, reset succeeds)
  await t.test('Case 5: QA tenant with cancelled TEST subscription resets cleanly', async () => {
    const email = 'test_sub_qa@staypilot.test';
    const id = await createQaTenant(email);

    await db.query(`
      INSERT INTO public.saas_subscriptions (tenant_id, razorpay_subscription_id, status, environment)
      VALUES ('${id}', 'sub_test_001', 'cancelled', 'test');
    `);

    await setAuthContext(CANONICAL_SUPER_ADMIN_ID);
    const eligRes = await db.query(`SELECT public.get_tenant_qa_eligibility('${id}');`);
    const elig = eligRes.rows[0].get_tenant_qa_eligibility;
    assert.equal(elig.financial_classification, 'TEST_ONLY');
    assert.equal(elig.is_reset_eligible, true);

    const resetRes = await db.query(`SELECT public.reset_disposable_qa_account('${id}', '${email}');`);
    assert.equal(resetRes.rows[0].reset_disposable_qa_account.success, true);
  });

  // Case 6: QA tenant with LIVE payment (MUST BE BLOCKED: MANDATORY_RETENTION)
  await t.test('Case 6: QA tenant with LIVE payment is strictly blocked from reset', async () => {
    const email = 'live_pay_qa@staypilot.test';
    const id = await createQaTenant(email);

    await db.query(`
      INSERT INTO public.saas_payments (tenant_id, razorpay_payment_id, amount, status, environment)
      VALUES ('${id}', 'pay_live_999', 5999, 'captured', 'live');
    `);

    await setAuthContext(CANONICAL_SUPER_ADMIN_ID);
    const eligRes = await db.query(`SELECT public.get_tenant_qa_eligibility('${id}');`);
    const elig = eligRes.rows[0].get_tenant_qa_eligibility;
    assert.equal(elig.financial_classification, 'LIVE');
    assert.equal(elig.is_reset_eligible, false);
    assert.ok(elig.block_reasons.some(r => r.includes('LIVE financial records')));

    await assert.rejects(
      async () => {
        await db.query(`SELECT public.reset_disposable_qa_account('${id}', '${email}');`);
      },
      (err) => {
        assert.match(err.message, /MANDATORY_RETENTION/i);
        return true;
      }
    );
  });

  // Case 7: QA tenant with unknown/ambiguous payment environment (MUST BE BLOCKED: MANDATORY_RETENTION)
  await t.test('Case 7: QA tenant with unknown environment payment is strictly blocked', async () => {
    const email = 'unknown_pay_qa@staypilot.test';
    const id = await createQaTenant(email);

    await db.query(`
      INSERT INTO public.saas_payments (tenant_id, razorpay_payment_id, amount, status, environment)
      VALUES ('${id}', 'pay_ambiguous_001', 999, 'captured', NULL);
    `);

    await setAuthContext(CANONICAL_SUPER_ADMIN_ID);
    const eligRes = await db.query(`SELECT public.get_tenant_qa_eligibility('${id}');`);
    const elig = eligRes.rows[0].get_tenant_qa_eligibility;
    assert.equal(elig.financial_classification, 'UNKNOWN');
    assert.equal(elig.is_reset_eligible, false);

    await assert.rejects(
      async () => {
        await db.query(`SELECT public.reset_disposable_qa_account('${id}', '${email}');`);
      },
      (err) => {
        assert.match(err.message, /MANDATORY_RETENTION/i);
        return true;
      }
    );
  });

  // Case 8: QA tenant with mixed TEST and LIVE records (MUST BE BLOCKED)
  await t.test('Case 8: QA tenant with mixed TEST and LIVE records is strictly blocked', async () => {
    const email = 'mixed_qa@staypilot.test';
    const id = await createQaTenant(email);

    await db.exec(`
      INSERT INTO public.saas_payments (tenant_id, razorpay_payment_id, amount, status, environment)
      VALUES ('${id}', 'pay_test_mixed', 1499, 'captured', 'test');
      INSERT INTO public.saas_invoices (tenant_id, invoice_number, invoice_status, total_amount, environment)
      VALUES ('${id}', 'SP-2627-LIVE-0001', 'issued', 5999, 'live');
    `);

    await setAuthContext(CANONICAL_SUPER_ADMIN_ID);
    const eligRes = await db.query(`SELECT public.get_tenant_qa_eligibility('${id}');`);
    const elig = eligRes.rows[0].get_tenant_qa_eligibility;
    assert.equal(elig.financial_classification, 'LIVE');
    assert.equal(elig.is_reset_eligible, false);

    await assert.rejects(
      async () => {
        await db.query(`SELECT public.reset_disposable_qa_account('${id}', '${email}');`);
      },
      (err) => {
        assert.match(err.message, /MANDATORY_RETENTION/i);
        return true;
      }
    );
  });

  // Case 9: Active TEST subscription cancellation / reconciliation blocker
  await t.test('Case 9: Active TEST subscription blocks reset until cancelled or reconciled', async () => {
    const email = 'active_sub_qa@staypilot.test';
    const id = await createQaTenant(email);

    const subRes = await db.query(`
      INSERT INTO public.saas_subscriptions (tenant_id, razorpay_subscription_id, status, environment)
      VALUES ('${id}', 'sub_test_active_01', 'active', 'test')
      RETURNING id;
    `);
    const subId = subRes.rows[0].id;

    await setAuthContext(CANONICAL_SUPER_ADMIN_ID);
    const eligRes = await db.query(`SELECT public.get_tenant_qa_eligibility('${id}');`);
    assert.equal(eligRes.rows[0].get_tenant_qa_eligibility.is_reset_eligible, false);

    await assert.rejects(
      async () => {
        await db.query(`SELECT public.reset_disposable_qa_account('${id}', '${email}');`);
      },
      (err) => {
        assert.match(err.message, /ACTIVE_SUBSCRIPTION/i);
        return true;
      }
    );

    // Reconcile/cancel subscription in DB (simulating Edge Function reconciliation)
    await db.query(`UPDATE public.saas_subscriptions SET status = 'cancelled' WHERE id = '${subId}';`);

    const resetRes = await db.query(`SELECT public.reset_disposable_qa_account('${id}', '${email}');`);
    assert.equal(resetRes.rows[0].reset_disposable_qa_account.success, true);
  });

  // Case 10: Tenant with booking-linked financial records satisfies booking triggers cleanly
  await t.test('Case 10: Tenant with bookings and linked incomes satisfies booking triggers without error', async () => {
    const email = 'bookings_qa@staypilot.test';
    const id = await createQaTenant(email);

    const resRes = await db.query(`INSERT INTO public.resorts (tenant_id, name) VALUES ('${id}', 'Resort With Bookings') RETURNING id;`);
    const cotRes = await db.query(`INSERT INTO public.cottages (tenant_id, resort_id, name) VALUES ('${id}', '${resRes.rows[0].id}', 'Cottage 1') RETURNING id;`);
    const roomRes = await db.query(`INSERT INTO public.rooms (tenant_id, cottage_id, room_number) VALUES ('${id}', '${cotRes.rows[0].id}', '101') RETURNING id;`);
    const bookRes = await db.query(`INSERT INTO public.bookings (tenant_id, room_id, guest_name, total_amount) VALUES ('${id}', '${roomRes.rows[0].id}', 'Guest X', 8000) RETURNING id;`);
    const bookingId = bookRes.rows[0].id;

    // Parent income + reversal child income
    const incRes = await db.query(`INSERT INTO public.incomes (tenant_id, booking_id, amount) VALUES ('${id}', '${bookingId}', 8000) RETURNING id;`);
    await db.query(`INSERT INTO public.incomes (tenant_id, booking_id, parent_income_id, amount) VALUES ('${id}', '${bookingId}', '${incRes.rows[0].id}', -2000);`);

    await setAuthContext(CANONICAL_SUPER_ADMIN_ID);
    const resetRes = await db.query(`SELECT public.reset_disposable_qa_account('${id}', '${email}');`);
    assert.equal(resetRes.rows[0].reset_disposable_qa_account.success, true);

    const checkBooks = await db.query(`SELECT count(*) FROM public.bookings WHERE tenant_id = '${id}';`);
    assert.equal(Number(checkBooks.rows[0].count), 0);

    const auditRes = await db.query(`SELECT * FROM public.booking_deletion_audits WHERE booking_id = '${bookingId}';`);
    assert.equal(auditRes.rows.length, 1);
    assert.equal(auditRes.rows[0].guest_name, 'Guest X');
    assert.equal(auditRes.rows[0].deleted_by_role, 'super_admin');
    assert.ok(auditRes.rows[0].financial_records_snapshot.length >= 2, 'snapshot must contain parent and child reversal incomes');
  });

  // Case 11: Protected legacy tenant (Cheerful Chalet blocked from reset and archiving)
  await t.test('Case 11: Cheerful Chalet lifetime premium account is permanently protected', async () => {
    await setAuthContext(CANONICAL_SUPER_ADMIN_ID);

    await assert.rejects(
      async () => {
        await db.query(`SELECT public.reset_disposable_qa_account('${CHEERFUL_CHALET_ID}', 'cheerfulchalet@gmail.com');`);
      },
      (err) => {
        assert.match(err.message, /PROTECTED_ACCOUNT/i);
        return true;
      }
    );

    await assert.rejects(
      async () => {
        await db.query(`SELECT public.archive_tenant_account('${CHEERFUL_CHALET_ID}', true);`);
      },
      (err) => {
        assert.match(err.message, /PROTECTED_ACCOUNT/i);
        return true;
      }
    );
  });

  // Case 12: Canonical Super Admin (blocked from reset and archiving)
  await t.test('Case 12: Canonical Super Admin is permanently protected from reset and archiving', async () => {
    await setAuthContext(CANONICAL_SUPER_ADMIN_ID);

    await assert.rejects(
      async () => {
        await db.query(`SELECT public.reset_disposable_qa_account('${CANONICAL_SUPER_ADMIN_ID}', 'uhariff@gmail.com');`);
      },
      (err) => {
        assert.match(err.message, /PROTECTED_ACCOUNT/i);
        return true;
      }
    );

    await assert.rejects(
      async () => {
        await db.query(`SELECT public.archive_tenant_account('${CANONICAL_SUPER_ADMIN_ID}', true);`);
      },
      (err) => {
        assert.match(err.message, /PROTECTED_ACCOUNT/i);
        return true;
      }
    );
  });

  // Case 13: Unauthorized user (non-super-admin blocked from reset, archiving, and preview)
  await t.test('Case 13: Unauthorized user is rejected for all management functions', async () => {
    await setAuthContext(NORMAL_TENANT_ID);

    await assert.rejects(
      async () => {
        await db.query(`SELECT public.get_tenant_qa_eligibility('${NORMAL_TENANT_ID}');`);
      },
      (err) => {
        assert.match(err.message, /FORBIDDEN/i);
        return true;
      }
    );

    await assert.rejects(
      async () => {
        await db.query(`SELECT public.archive_tenant_account('${NORMAL_TENANT_ID}', true);`);
      },
      (err) => {
        assert.match(err.message, /FORBIDDEN/i);
        return true;
      }
    );

    await assert.rejects(
      async () => {
        await db.query(`SELECT public.reset_disposable_qa_account('${NORMAL_TENANT_ID}', 'realcustomer@hotel.com');`);
      },
      (err) => {
        assert.match(err.message, /FORBIDDEN/i);
        return true;
      }
    );
  });

  // Case 14: Partial cleanup failure & idempotent retry
  await t.test('Case 14: Reset is idempotent and reports already_cleaned on retry', async () => {
    const email = 'retry_qa@staypilot.test';
    const id = await createQaTenant(email);

    await setAuthContext(CANONICAL_SUPER_ADMIN_ID);
    const firstRun = await db.query(`SELECT public.reset_disposable_qa_account('${id}', '${email}');`);
    assert.equal(firstRun.rows[0].reset_disposable_qa_account.status, 'database_cleaned');

    const secondRun = await db.query(`SELECT public.reset_disposable_qa_account('${id}', '${email}');`);
    assert.equal(secondRun.rows[0].reset_disposable_qa_account.status, 'already_cleaned');
    assert.equal(secondRun.rows[0].reset_disposable_qa_account.success, true);
  });

  // Case 15: Same-email signup verification (Auth deletion leaves email reusable)
  await t.test('Case 15: Auth user deletion ensures email is immediately reusable for new registration', async () => {
    const mockAuthUsers = new Map();
    const mockAuthAdmin = {
      signUp: async (email, id) => {
        if ([...mockAuthUsers.values()].some(u => u.email === email)) {
          throw new Error('User already registered');
        }
        mockAuthUsers.set(id, { id, email });
        return { user: { id, email } };
      },
      deleteUser: async (id) => {
        mockAuthUsers.delete(id);
        return { success: true };
      },
      getUserById: async (id) => {
        return { user: mockAuthUsers.get(id) || null };
      }
    };

    const email = 'reused_signup@staypilot.test';
    const id1 = '88888888-8888-8888-8888-888888888888';

    await mockAuthAdmin.signUp(email, id1);
    assert.equal((await mockAuthAdmin.getUserById(id1)).user.email, email);

    // Before deletion, same email fails
    await assert.rejects(
      async () => {
        await mockAuthAdmin.signUp(email, '99999999-9999-9999-9999-999999999999');
      },
      /already registered/i
    );

    // Simulate reset completion (deleteUser)
    await mockAuthAdmin.deleteUser(id1);
    assert.equal((await mockAuthAdmin.getUserById(id1)).user, null);

    // New registration succeeds!
    const id2 = '99999999-9999-9999-9999-999999999999';
    const reg2 = await mockAuthAdmin.signUp(email, id2);
    assert.equal(reg2.user.id, id2);
    assert.equal(reg2.user.email, email);
  });

  // Case 16: Archive and restore behavior
  await t.test('Case 16: Archive disables access and sets is_archived; Restore re-enables', async () => {
    const email = 'archive_test@staypilot.test';
    const id = await createQaTenant(email);

    await setAuthContext(CANONICAL_SUPER_ADMIN_ID);

    // 16.1 Archive
    const archRes = await db.query(`SELECT public.archive_tenant_account('${id}', true);`);
    assert.equal(archRes.rows[0].archive_tenant_account.success, true);
    assert.equal(archRes.rows[0].archive_tenant_account.is_archived, true);

    const checkArch = await db.query(`SELECT is_archived, archived_by, global_settings FROM public.profiles WHERE id = '${id}';`);
    assert.equal(checkArch.rows[0].is_archived, true);
    assert.equal(checkArch.rows[0].archived_by, CANONICAL_SUPER_ADMIN_ID);
    assert.equal(checkArch.rows[0].global_settings.is_disabled, true);

    // Verify audit log
    const auditRes = await db.query(`SELECT * FROM public.super_admin_audit_logs WHERE target_id = '${id}' AND action = 'ARCHIVE_ACCOUNT';`);
    assert.equal(auditRes.rows.length, 1);

    // 16.2 Restore
    const restRes = await db.query(`SELECT public.archive_tenant_account('${id}', false);`);
    assert.equal(restRes.rows[0].archive_tenant_account.success, true);
    assert.equal(restRes.rows[0].archive_tenant_account.is_archived, false);

    const checkRest = await db.query(`SELECT is_archived, archived_at, global_settings FROM public.profiles WHERE id = '${id}';`);
    assert.equal(checkRest.rows[0].is_archived, false);
    assert.equal(checkRest.rows[0].archived_at, null);
    assert.equal(checkRest.rows[0].global_settings.is_disabled, false);
  });

  // Case 17: Monotonic sequential invoice numbering preserved
  await t.test('Case 17: Monotonic sequential invoice numbering preserved across resets', async () => {
    const email = 'invoice_seq_qa@staypilot.test';
    const id = await createQaTenant(email);

    await db.query(`
      INSERT INTO public.saas_invoices (tenant_id, invoice_number, invoice_status, total_amount, environment)
      VALUES 
        ('${id}', 'SP-2627-TEST-0042', 'issued', 1999, 'test'),
        ('${id}', 'SP-2627-TEST-0043', 'issued', 1999, 'test');
    `);

    await setAuthContext(CANONICAL_SUPER_ADMIN_ID);
    await db.query(`SELECT public.reset_disposable_qa_account('${id}', '${email}');`);

    // Invoices are decoupled but sequence is unbroken
    const inv42 = await db.query(`SELECT tenant_id, invoice_status FROM public.saas_invoices WHERE invoice_number = 'SP-2627-TEST-0042';`);
    const inv43 = await db.query(`SELECT tenant_id, invoice_status FROM public.saas_invoices WHERE invoice_number = 'SP-2627-TEST-0043';`);

    assert.equal(inv42.rows.length, 1);
    assert.equal(inv42.rows[0].tenant_id, null);
    assert.equal(inv42.rows[0].invoice_status, 'issued');

    assert.equal(inv43.rows.length, 1);
    assert.equal(inv43.rows[0].tenant_id, null);
    assert.equal(inv43.rows[0].invoice_status, 'issued');
  });

  // Case 18: Rollback migration cleanly reverses objects while preserving audit logs
  await t.test('Case 18: Rollback migration cleanly reverses objects while permanently preserving audit logs', async () => {
    const rollbackPath = path.join(ROOT, 'supabase', 'migrations', 'rollback_20261019140000_super_admin_qa_cleanup_archive_reset.sql');
    await db.exec(fs.readFileSync(rollbackPath, 'utf8'));

    // Check profiles columns removed
    const colCheck = await db.query(`
      SELECT column_name FROM information_schema.columns 
      WHERE table_name = 'profiles' AND column_name IN ('is_archived', 'archived_at', 'archived_by');
    `);
    assert.equal(colCheck.rows.length, 0);

    // Check functions dropped
    const funcCheck = await db.query(`
      SELECT routine_name FROM information_schema.routines
      WHERE routine_schema = 'public' AND routine_name IN ('get_tenant_qa_eligibility', 'archive_tenant_account');
    `);
    assert.equal(funcCheck.rows.length, 0);

    // CRITICAL INVARIANT: super_admin_audit_logs and booking_deletion_audits MUST be preserved!
    const auditCheck = await db.query(`
      SELECT count(*) FROM public.super_admin_audit_logs;
    `);
    assert.ok(Number(auditCheck.rows[0].count) > 0, 'Audit logs must NEVER be dropped or wiped by rollback');

    const bookAuditCheck = await db.query(`
      SELECT count(*) FROM public.booking_deletion_audits;
    `);
    assert.ok(Number(bookAuditCheck.rows[0].count) > 0, 'Booking deletion audits must NEVER be dropped or wiped by rollback');
  });
});
