-- ==============================================================================
-- MIGRATION: 20261019140000_super_admin_qa_cleanup_archive_reset.sql
-- DESCRIPTION: Super Admin QA Account Cleanup, Environment-Aware Eligibility,
--              Archiving, and Reusable Email Reset with Full Booking Audit
--              and Independent Test Invoice Retention
-- AUTHOR: Antigravity Autonomous Systems Engineer
-- STATUS: PRODUCTION READY
-- ==============================================================================

BEGIN;

-- 1. PROFILES: Add archiving columns
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_archived boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS archived_at timestamptz DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS archived_by uuid DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_profiles_is_archived ON public.profiles(is_archived);

-- 2. SAAS INVOICES: Add independent original tenant references and retention notes
ALTER TABLE public.saas_invoices
  ADD COLUMN IF NOT EXISTS original_tenant_id uuid,
  ADD COLUMN IF NOT EXISTS original_tenant_email text,
  ADD COLUMN IF NOT EXISTS retention_notes text;

CREATE INDEX IF NOT EXISTS idx_saas_invoices_orig_tenant ON public.saas_invoices(original_tenant_id);

-- 3. SAAS INVOICE IMMUTABILITY TRIGGER:
-- Enforce immutability while permitting legitimate FK decoupling to NULL with
-- explicit retention of original_tenant_id, original_tenant_email, and retention_notes,
-- as well as one-time backfill of original_tenant columns.
CREATE OR REPLACE FUNCTION public.enforce_saas_invoice_immutability()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- 3.1 Block all direct deletions unconditionally
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'INVOICE_IMMUTABLE: Deletion of saas_invoices records is strictly prohibited.'
      USING ERRCODE = '42501';
  END IF;

  -- 3.2 Enforce strict immutability on UPDATE
  IF TG_OP = 'UPDATE' THEN
    IF OLD.invoice_status = 'void' THEN
      RAISE EXCEPTION 'INVOICE_IMMUTABLE: Invoice % is void and cannot be modified.', OLD.invoice_number
        USING ERRCODE = '42501';
    END IF;

    -- Case A: Legitimate foreign-key decoupling upon tenant / payment deletion
    -- Preserves original tenant identity, audit references, and retention notes
    IF (OLD.tenant_id IS NOT NULL AND NEW.tenant_id IS NULL) OR
       (OLD.saas_payment_id IS NOT NULL AND NEW.saas_payment_id IS NULL) THEN
      -- Automatically preserve original tenant reference if not already set
      IF NEW.original_tenant_id IS NULL THEN
        NEW.original_tenant_id := OLD.tenant_id;
      END IF;
      IF NEW.original_tenant_email IS NULL THEN
        NEW.original_tenant_email := COALESCE(OLD.customer_email, NEW.customer_email);
      END IF;

      -- Strict invariant: no financial amounts, snapshots, dates, or numbers may change
      IF (to_jsonb(NEW) - '{tenant_id,saas_payment_id,original_tenant_id,original_tenant_email,retention_notes}'::text[]) IS NOT DISTINCT FROM
         (to_jsonb(OLD) - '{tenant_id,saas_payment_id,original_tenant_id,original_tenant_email,retention_notes}'::text[]) THEN
        RETURN NEW;
      END IF;
    END IF;

    -- Case B: One-time backfill of independent original tenant identity columns
    IF OLD.original_tenant_id IS NULL AND NEW.original_tenant_id IS NOT NULL THEN
      IF (to_jsonb(NEW) - '{original_tenant_id,original_tenant_email,retention_notes}'::text[]) IS NOT DISTINCT FROM
         (to_jsonb(OLD) - '{original_tenant_id,original_tenant_email,retention_notes}'::text[]) THEN
        RETURN NEW;
      END IF;
    END IF;

    -- Case C: Authorized transition from 'issued' to 'void' with audit attribution
    IF OLD.invoice_status = 'issued' AND NEW.invoice_status = 'void' THEN
      IF NEW.void_reason IS NULL OR length(trim(NEW.void_reason)) < 5 THEN
        RAISE EXCEPTION 'INVOICE_VOID_INVALID: A valid void_reason of at least 5 characters is required.'
          USING ERRCODE = '22023';
      END IF;

      IF NEW.voided_by IS NULL THEN
        RAISE EXCEPTION 'INVOICE_VOID_INVALID: An auditable operator ID (voided_by) is required to void an invoice.'
          USING ERRCODE = '22023';
      END IF;

      NEW.voided_at := COALESCE(NEW.voided_at, NOW());

      IF (to_jsonb(NEW) - '{invoice_status,void_reason,voided_by,voided_at}'::text[]) IS DISTINCT FROM
         (to_jsonb(OLD) - '{invoice_status,void_reason,voided_by,voided_at}'::text[]) THEN
        RAISE EXCEPTION 'INVOICE_IMMUTABLE: Voiding an invoice cannot alter snapshots, financial amounts, dates, or references.'
          USING ERRCODE = '42501';
      END IF;

      RETURN NEW;
    ELSE
      RAISE EXCEPTION 'INVOICE_IMMUTABLE: Updates to issued invoices are prohibited. Only authorized void operations are permitted.'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- 4. Backfill existing invoices where original_tenant_id is not yet populated
-- (Now permitted by updated immutability trigger function)
UPDATE public.saas_invoices
SET 
  original_tenant_id = COALESCE(original_tenant_id, tenant_id),
  original_tenant_email = COALESCE(original_tenant_email, customer_email)
WHERE original_tenant_id IS NULL AND tenant_id IS NOT NULL;

-- 4. RPC: GET TENANT QA ELIGIBILITY & ENVIRONMENT BREAKDOWN
CREATE OR REPLACE FUNCTION public.get_tenant_qa_eligibility(p_tenant_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_target public.profiles%ROWTYPE;
  v_canonical_admin uuid := '9c4e65f5-c0a1-4b3a-8ed2-d01175a73409'::uuid;
  v_is_disposable boolean := false;
  v_is_blocked boolean := false;
  v_block_reasons text[] := '{}';
  
  -- Financial counts by environment
  v_test_payments int := 0;
  v_live_payments int := 0;
  v_unknown_payments int := 0;
  
  v_test_invoices int := 0;
  v_live_invoices int := 0;
  v_unknown_invoices int := 0;
  
  v_test_subs int := 0;
  v_live_subs int := 0;
  v_unknown_subs int := 0;
  v_active_subs int := 0;
  
  v_financial_classification text := 'NONE';
  
  -- Operational counts
  v_resorts_cnt int := 0;
  v_cottages_cnt int := 0;
  v_rooms_cnt int := 0;
  v_bookings_cnt int := 0;
  v_incomes_cnt int := 0;
  v_expenses_cnt int := 0;
  v_staff_cnt int := 0;
BEGIN
  -- 4.1 Authorization: Super Admin only
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'FORBIDDEN: Only Super Administrators can view QA account eligibility.'
      USING ERRCODE = '42501';
  END IF;

  IF p_tenant_id IS NULL THEN
    RAISE EXCEPTION 'INVALID_ARGUMENT: p_tenant_id is required.'
      USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_target FROM public.profiles WHERE id = p_tenant_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'TARGET_NOT_FOUND: Profile not found.'
      USING ERRCODE = 'P0002';
  END IF;

  -- 4.2 Check protected invariant accounts
  IF v_target.role = 'super_admin' OR v_target.email IN ('uhariff@gmail.com', 'uhariff16@gmail.com') THEN
    v_is_blocked := true;
    v_block_reasons := array_append(v_block_reasons, 'Super Administrator accounts are permanently protected.');
  END IF;

  IF v_target.id = '3797dba7-a7fd-4ca6-86cb-b45519953947'::uuid OR v_target.email = 'cheerfulchalet@gmail.com' THEN
    v_is_blocked := true;
    v_block_reasons := array_append(v_block_reasons, 'Cheerful Chalet lifetime premium account is permanently protected.');
  END IF;

  -- 4.3 Check explicit QA classification
  v_is_disposable := (v_target.is_disposable_qa = true) OR
                     EXISTS (SELECT 1 FROM public.disposable_qa_accounts WHERE tenant_id = p_tenant_id);

  IF NOT v_is_disposable THEN
    v_is_blocked := true;
    v_block_reasons := array_append(v_block_reasons, 'Account is not explicitly classified as disposable QA.');
  END IF;

  -- 4.4 Financial record inspection by environment
  -- Payments
  SELECT 
    COUNT(*) FILTER (WHERE lower(trim(coalesce(environment, ''))) = 'test'),
    COUNT(*) FILTER (WHERE lower(trim(coalesce(environment, ''))) = 'live'),
    COUNT(*) FILTER (WHERE environment IS NULL OR lower(trim(environment)) NOT IN ('test', 'live'))
  INTO v_test_payments, v_live_payments, v_unknown_payments
  FROM public.saas_payments
  WHERE tenant_id = p_tenant_id AND status = 'captured';

  -- Invoices / Commercial Acknowledgments
  SELECT 
    COUNT(*) FILTER (WHERE lower(trim(coalesce(environment, ''))) = 'test'),
    COUNT(*) FILTER (WHERE lower(trim(coalesce(environment, ''))) = 'live'),
    COUNT(*) FILTER (WHERE environment IS NULL OR lower(trim(environment)) NOT IN ('test', 'live'))
  INTO v_test_invoices, v_live_invoices, v_unknown_invoices
  FROM public.saas_invoices
  WHERE tenant_id = p_tenant_id AND invoice_status = 'issued';

  -- Subscriptions
  SELECT 
    COUNT(*) FILTER (WHERE lower(trim(coalesce(environment, ''))) = 'test'),
    COUNT(*) FILTER (WHERE lower(trim(coalesce(environment, ''))) = 'live'),
    COUNT(*) FILTER (WHERE environment IS NULL OR lower(trim(environment)) NOT IN ('test', 'live')),
    COUNT(*) FILTER (WHERE status IN ('active', 'authenticated'))
  INTO v_test_subs, v_live_subs, v_unknown_subs, v_active_subs
  FROM public.saas_subscriptions
  WHERE tenant_id = p_tenant_id;

  -- Classify Financial Environment
  IF v_live_payments > 0 OR v_live_invoices > 0 OR v_live_subs > 0 THEN
    v_financial_classification := 'LIVE';
    v_is_blocked := true;
    v_block_reasons := array_append(v_block_reasons, 'Account contains recorded LIVE financial records (payments, invoices, or subscriptions). Destructive reset strictly blocked.');
  ELSIF v_unknown_payments > 0 OR v_unknown_invoices > 0 OR v_unknown_subs > 0 THEN
    v_financial_classification := 'UNKNOWN';
    v_is_blocked := true;
    v_block_reasons := array_append(v_block_reasons, 'Account contains financial records with unknown or ambiguous environment. Destructive reset strictly blocked.');
  ELSIF v_test_payments > 0 OR v_test_invoices > 0 OR v_test_subs > 0 THEN
    v_financial_classification := 'TEST_ONLY';
  ELSE
    v_financial_classification := 'NONE';
  END IF;

  -- Active subscription blocker (requires cancellation/reconciliation before reset)
  IF v_active_subs > 0 THEN
    v_is_blocked := true;
    v_block_reasons := array_append(v_block_reasons, format('Account has %s active Razorpay subscription(s). Must be cancelled or reconciled before reset.', v_active_subs));
  END IF;

  -- 4.5 Gather operational counts
  SELECT count(*) INTO v_resorts_cnt FROM public.resorts WHERE tenant_id = p_tenant_id;
  SELECT count(*) INTO v_cottages_cnt FROM public.cottages WHERE tenant_id = p_tenant_id;
  SELECT count(*) INTO v_rooms_cnt FROM public.rooms WHERE tenant_id = p_tenant_id;
  SELECT count(*) INTO v_bookings_cnt FROM public.bookings WHERE tenant_id = p_tenant_id;
  SELECT count(*) INTO v_incomes_cnt FROM public.incomes WHERE tenant_id = p_tenant_id;
  SELECT count(*) INTO v_expenses_cnt FROM public.expenses WHERE tenant_id = p_tenant_id;
  SELECT count(*) INTO v_staff_cnt FROM public.profiles WHERE tenant_id = p_tenant_id AND id <> p_tenant_id;

  RETURN jsonb_build_object(
    'tenant_id', p_tenant_id,
    'email', v_target.email,
    'full_name', v_target.full_name,
    'is_disposable_qa', v_is_disposable,
    'is_archived', coalesce(v_target.is_archived, false),
    'financial_classification', v_financial_classification,
    'is_reset_eligible', (NOT v_is_blocked),
    'block_reasons', v_block_reasons,
    'financials', jsonb_build_object(
      'test_payments', v_test_payments,
      'live_payments', v_live_payments,
      'unknown_payments', v_unknown_payments,
      'test_invoices', v_test_invoices,
      'live_invoices', v_live_invoices,
      'unknown_invoices', v_unknown_invoices,
      'test_subscriptions', v_test_subs,
      'live_subscriptions', v_live_subs,
      'unknown_subscriptions', v_unknown_subs,
      'active_subscriptions', v_active_subs
    ),
    'operational_counts', jsonb_build_object(
      'resorts', v_resorts_cnt,
      'cottages', v_cottages_cnt,
      'rooms', v_rooms_cnt,
      'bookings', v_bookings_cnt,
      'incomes', v_incomes_cnt,
      'expenses', v_expenses_cnt,
      'staff', v_staff_cnt
    )
  );
END;
$$;

-- 5. RPC: ARCHIVE / RESTORE TENANT ACCOUNT
CREATE OR REPLACE FUNCTION public.archive_tenant_account(
  p_tenant_id uuid,
  p_is_archived boolean,
  p_actor_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_caller_id uuid;
  v_target public.profiles%ROWTYPE;
  v_canonical_admin uuid := '9c4e65f5-c0a1-4b3a-8ed2-d01175a73409'::uuid;
  v_updated_settings jsonb;
BEGIN
  -- 5.1 Strict Authorization: Canonical Super Admin only
  IF auth.uid() IS NOT NULL THEN
    IF auth.uid() <> v_canonical_admin THEN
      RAISE EXCEPTION 'FORBIDDEN: Only the canonical Super Administrator can archive accounts.'
        USING ERRCODE = '42501';
    END IF;
    v_caller_id := auth.uid();
  ELSIF auth.role() = 'service_role' OR current_user IN ('postgres', 'service_role') THEN
    IF p_actor_id IS NULL OR p_actor_id <> v_canonical_admin THEN
      RAISE EXCEPTION 'FORBIDDEN: Authoritative canonical actor ID required for service-role execution.'
        USING ERRCODE = '42501';
    END IF;
    v_caller_id := p_actor_id;
  ELSE
    RAISE EXCEPTION 'FORBIDDEN: Unauthorized execution context.'
      USING ERRCODE = '42501';
  END IF;

  IF p_tenant_id IS NULL THEN
    RAISE EXCEPTION 'INVALID_ARGUMENT: p_tenant_id is required.'
      USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_target FROM public.profiles WHERE id = p_tenant_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'TARGET_NOT_FOUND: Profile not found.'
      USING ERRCODE = 'P0002';
  END IF;

  -- 5.2 Invariants: Protected accounts cannot be archived
  IF v_target.role = 'super_admin' OR v_target.email IN ('uhariff@gmail.com', 'uhariff16@gmail.com') THEN
    RAISE EXCEPTION 'PROTECTED_ACCOUNT: Super Administrator accounts cannot be archived.'
      USING ERRCODE = '42501';
  END IF;

  IF v_target.id = '3797dba7-a7fd-4ca6-86cb-b45519953947'::uuid OR v_target.email = 'cheerfulchalet@gmail.com' THEN
    RAISE EXCEPTION 'PROTECTED_ACCOUNT: Cheerful Chalet account cannot be archived.'
      USING ERRCODE = '42501';
  END IF;

  -- 5.3 Update global_settings to disable/enable tenant access
  v_updated_settings := coalesce(v_target.global_settings, '{}'::jsonb);
  v_updated_settings := jsonb_set(v_updated_settings, '{is_disabled}', to_jsonb(p_is_archived));

  -- 5.4 Update profile archiving state
  UPDATE public.profiles
  SET 
    is_archived = p_is_archived,
    archived_at = CASE WHEN p_is_archived THEN now() ELSE NULL END,
    archived_by = CASE WHEN p_is_archived THEN v_caller_id ELSE NULL END,
    global_settings = v_updated_settings
  WHERE id = p_tenant_id;

  -- 5.5 Record Super Admin audit log
  INSERT INTO public.super_admin_audit_logs (actor_id, action, target_id, target_email, metadata)
  VALUES (
    v_caller_id,
    CASE WHEN p_is_archived THEN 'ARCHIVE_ACCOUNT' ELSE 'RESTORE_ACCOUNT' END,
    p_tenant_id,
    v_target.email,
    jsonb_build_object(
      'is_archived', p_is_archived,
      'is_disposable_qa', v_target.is_disposable_qa,
      'archived_at', now()
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'tenant_id', p_tenant_id,
    'email', v_target.email,
    'is_archived', p_is_archived
  );
END;
$$;

-- 6. RPC: HARDENED RESET DISPOSABLE QA ACCOUNT WITH COMPLETE BOOKING FINANCIAL CONTRACT
--    AND INDEPENDENT TEST INVOICE AUDIT RETENTION
CREATE OR REPLACE FUNCTION public.reset_disposable_qa_account(
  p_tenant_id uuid,
  p_confirm_email text,
  p_actor_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_caller_id uuid;
  v_target public.profiles%ROWTYPE;
  v_canonical_admin uuid := '9c4e65f5-c0a1-4b3a-8ed2-d01175a73409'::uuid;
  v_is_disposable boolean := false;
  
  -- Financial audit checks
  v_live_payments int := 0;
  v_unknown_payments int := 0;
  v_live_invoices int := 0;
  v_unknown_invoices int := 0;
  v_live_subs int := 0;
  v_unknown_subs int := 0;
  v_active_subs int := 0;
  
  v_snapshot jsonb;
  v_test_invoices_cnt int := 0;
  v_test_payments_cnt int := 0;
  v_test_subs_cnt int := 0;

  -- Booking financial integrity loop variables
  v_booking record;
  v_incomes_snapshot jsonb;
  v_deleted_bookings_cnt int := 0;
BEGIN
  -- 6.1 Strict Authorization: Canonical Super Admin only
  IF auth.uid() IS NOT NULL THEN
    IF auth.uid() <> v_canonical_admin THEN
      RAISE EXCEPTION 'FORBIDDEN: Only the canonical Super Administrator can reset test accounts.'
        USING ERRCODE = '42501';
    END IF;
    v_caller_id := auth.uid();
  ELSIF auth.role() = 'service_role' OR current_user IN ('postgres', 'service_role') THEN
    IF p_actor_id IS NULL OR p_actor_id <> v_canonical_admin THEN
      RAISE EXCEPTION 'FORBIDDEN: Authoritative canonical actor ID required for service-role execution.'
        USING ERRCODE = '42501';
    END IF;
    v_caller_id := p_actor_id;
  ELSE
    RAISE EXCEPTION 'FORBIDDEN: Unauthorized execution context.'
      USING ERRCODE = '42501';
  END IF;

  -- 6.2 Target & confirmation email validation
  IF p_tenant_id IS NULL OR p_confirm_email IS NULL THEN
    RAISE EXCEPTION 'INVALID_ARGUMENT: p_tenant_id and p_confirm_email are required.'
      USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_target FROM public.profiles WHERE id = p_tenant_id;
  IF NOT FOUND THEN
    -- Check if already reset in a prior attempt (Idempotent Recovery)
    IF EXISTS (
      SELECT 1 FROM public.super_admin_audit_logs 
      WHERE target_id = p_tenant_id AND action = 'RESET_TEST_ACCOUNT'
    ) THEN
      RETURN jsonb_build_object(
        'success', true,
        'tenant_id', p_tenant_id,
        'email', p_confirm_email,
        'status', 'already_cleaned'
      );
    ELSE
      RAISE EXCEPTION 'TARGET_NOT_FOUND: Profile not found.'
        USING ERRCODE = 'P0002';
    END IF;
  END IF;

  IF lower(trim(v_target.email)) <> lower(trim(p_confirm_email)) THEN
    RAISE EXCEPTION 'CONFIRMATION_MISMATCH: Provided email "%" does not match account email "%".', p_confirm_email, v_target.email
      USING ERRCODE = '22023';
  END IF;

  -- 6.3 Safety Invariants: Reject Super Admin or Cheerful Chalet
  IF v_target.role = 'super_admin' OR v_target.email IN ('uhariff@gmail.com', 'uhariff16@gmail.com') THEN
    RAISE EXCEPTION 'PROTECTED_ACCOUNT: Super Administrator accounts cannot be reset.'
      USING ERRCODE = '42501';
  END IF;

  IF v_target.id = '3797dba7-a7fd-4ca6-86cb-b45519953947'::uuid OR v_target.email = 'cheerfulchalet@gmail.com' THEN
    RAISE EXCEPTION 'PROTECTED_ACCOUNT: Cheerful Chalet account cannot be reset.'
      USING ERRCODE = '42501';
  END IF;

  -- 6.4 Verification of Disposable QA Classification
  v_is_disposable := (v_target.is_disposable_qa = true) OR
                     EXISTS (SELECT 1 FROM public.disposable_qa_accounts WHERE tenant_id = p_tenant_id);

  IF NOT v_is_disposable THEN
    RAISE EXCEPTION 'NOT_DISPOSABLE_QA: Account % is not explicitly classified as disposable QA.', p_tenant_id
      USING ERRCODE = '42501';
  END IF;

  -- 6.5 Mandatory Environment-Aware Financial Checks
  -- Block if ANY LIVE payment or invoice exists
  SELECT 
    COUNT(*) FILTER (WHERE lower(trim(coalesce(environment, ''))) = 'live'),
    COUNT(*) FILTER (WHERE environment IS NULL OR lower(trim(environment)) NOT IN ('test', 'live'))
  INTO v_live_payments, v_unknown_payments
  FROM public.saas_payments
  WHERE tenant_id = p_tenant_id AND status = 'captured';

  IF v_live_payments > 0 THEN
    RAISE EXCEPTION 'MANDATORY_RETENTION: Account has % captured LIVE payment(s). Reset is strictly prohibited.', v_live_payments
      USING ERRCODE = '42501';
  END IF;

  IF v_unknown_payments > 0 THEN
    RAISE EXCEPTION 'MANDATORY_RETENTION: Account has % payment(s) with unknown/unverified environment. Reset is strictly prohibited.', v_unknown_payments
      USING ERRCODE = '42501';
  END IF;

  SELECT 
    COUNT(*) FILTER (WHERE lower(trim(coalesce(environment, ''))) = 'live'),
    COUNT(*) FILTER (WHERE environment IS NULL OR lower(trim(environment)) NOT IN ('test', 'live'))
  INTO v_live_invoices, v_unknown_invoices
  FROM public.saas_invoices
  WHERE tenant_id = p_tenant_id AND invoice_status = 'issued';

  IF v_live_invoices > 0 THEN
    RAISE EXCEPTION 'MANDATORY_RETENTION: Account has % issued LIVE commercial invoice(s). Reset is strictly prohibited.', v_live_invoices
      USING ERRCODE = '42501';
  END IF;

  IF v_unknown_invoices > 0 THEN
    RAISE EXCEPTION 'MANDATORY_RETENTION: Account has % invoice(s) with unknown/unverified environment. Reset is strictly prohibited.', v_unknown_invoices
      USING ERRCODE = '42501';
  END IF;

  SELECT 
    COUNT(*) FILTER (WHERE lower(trim(coalesce(environment, ''))) = 'live'),
    COUNT(*) FILTER (WHERE environment IS NULL OR lower(trim(environment)) NOT IN ('test', 'live')),
    COUNT(*) FILTER (WHERE status IN ('active', 'authenticated'))
  INTO v_live_subs, v_unknown_subs, v_active_subs
  FROM public.saas_subscriptions
  WHERE tenant_id = p_tenant_id;

  IF v_live_subs > 0 THEN
    RAISE EXCEPTION 'MANDATORY_RETENTION: Account has % LIVE subscription(s). Reset is strictly prohibited.', v_live_subs
      USING ERRCODE = '42501';
  END IF;

  IF v_unknown_subs > 0 THEN
    RAISE EXCEPTION 'MANDATORY_RETENTION: Account has % subscription(s) with unknown/unverified environment. Reset is strictly prohibited.', v_unknown_subs
      USING ERRCODE = '42501';
  END IF;

  IF v_active_subs > 0 THEN
    RAISE EXCEPTION 'ACTIVE_SUBSCRIPTION: Cannot reset account with % active subscription(s). Must be cancelled or reconciled first.', v_active_subs
      USING ERRCODE = '42501';
  END IF;

  -- 6.6 Gather TEST-record metrics for snapshot
  SELECT count(*) INTO v_test_invoices_cnt FROM public.saas_invoices WHERE tenant_id = p_tenant_id AND lower(trim(coalesce(environment, ''))) = 'test';
  SELECT count(*) INTO v_test_payments_cnt FROM public.saas_payments WHERE tenant_id = p_tenant_id AND lower(trim(coalesce(environment, ''))) = 'test';
  SELECT count(*) INTO v_test_subs_cnt FROM public.saas_subscriptions WHERE tenant_id = p_tenant_id AND lower(trim(coalesce(environment, ''))) = 'test';

  -- Snapshot metadata before cleanup for immutable audit log
  v_snapshot := jsonb_build_object(
    'tenant_id', p_tenant_id,
    'email', v_target.email,
    'full_name', v_target.full_name,
    'plan_type', v_target.plan_type,
    'subscription_status', v_target.subscription_status,
    'test_invoices_preserved', v_test_invoices_cnt,
    'test_invoice_numbers', (SELECT coalesce(jsonb_agg(invoice_number), '[]'::jsonb) FROM public.saas_invoices WHERE tenant_id = p_tenant_id AND lower(trim(coalesce(environment, ''))) = 'test'),
    'test_payments_removed', v_test_payments_cnt,
    'test_subs_removed', v_test_subs_cnt,
    'reset_at', now()
  );

  -- 6.7 Complete delete_booking_with_financials contract for every booking of this tenant:
  -- Aggregates income snapshots, inserts into booking_deletion_audits, registers deletion session,
  -- deletes child reversal incomes first, deletes parent incomes, and deletes bookings.
  FOR v_booking IN SELECT * FROM public.bookings WHERE tenant_id = p_tenant_id LOOP
    -- Aggregate immutable snapshot of linked incomes
    SELECT COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'income_id', id,
          'amount', amount,
          'source', source,
          'payment_mode', payment_mode,
          'transaction_type', transaction_type,
          'parent_income_id', parent_income_id,
          'notes', notes,
          'date', date,
          'created_at', created_at
        )
      ), '[]'::jsonb
    ) INTO v_incomes_snapshot
    FROM public.incomes
    WHERE booking_id = v_booking.id;

    -- Record immutable audit log row in public.booking_deletion_audits
    INSERT INTO public.booking_deletion_audits (
      booking_id,
      booking_reference,
      tenant_id,
      guest_name,
      guest_phone,
      total_booking_amount,
      advance_paid,
      balance_amount,
      financial_records_snapshot,
      deleted_by_user_id,
      deleted_by_role,
      deletion_reason
    ) VALUES (
      v_booking.id,
      COALESCE(v_booking.reference_number, v_booking.id::text),
      v_booking.tenant_id,
      v_booking.guest_name,
      COALESCE(v_booking.phone_number, ''),
      COALESCE(v_booking.total_amount, 0),
      COALESCE(v_booking.advance_paid, 0),
      COALESCE(v_booking.balance_amount, 0),
      v_incomes_snapshot,
      v_caller_id,
      'super_admin',
      format('Disposable QA Account Reset (Tenant %s <%s>)', p_tenant_id, v_target.email)
    );

    -- Register authorized deletion session in private table for this booking
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'private' AND table_name = 'active_booking_deletion_sessions') THEN
      INSERT INTO private.active_booking_deletion_sessions (
        booking_id, authorized_tenant_id, authorized_by
      ) VALUES (
        v_booking.id, v_booking.tenant_id, v_caller_id
      );
    END IF;

    -- Delete child reversal incomes first (satisfies self-referential FK constraint)
    DELETE FROM public.incomes
    WHERE booking_id = v_booking.id AND parent_income_id IS NOT NULL;

    -- Delete parent incomes for this booking
    DELETE FROM public.incomes
    WHERE booking_id = v_booking.id;

    -- Delete the booking row
    DELETE FROM public.bookings
    WHERE id = v_booking.id;

    -- Clean up active deletion session for this booking
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'private' AND table_name = 'active_booking_deletion_sessions') THEN
      DELETE FROM private.active_booking_deletion_sessions
      WHERE booking_id = v_booking.id AND tx_id = pg_current_xact_id();
    END IF;

    v_deleted_bookings_cnt := v_deleted_bookings_cnt + 1;
  END LOOP;

  -- 6.8 Delete standalone / unlinked incomes
  DELETE FROM public.incomes WHERE tenant_id = p_tenant_id AND parent_income_id IS NOT NULL;
  DELETE FROM public.incomes WHERE tenant_id = p_tenant_id;

  -- Delete tenant expenses
  DELETE FROM public.expenses WHERE tenant_id = p_tenant_id;

  -- Delete other tenant operational entities
  DELETE FROM public.support_messages WHERE ticket_id IN (SELECT id FROM public.support_tickets WHERE tenant_id = p_tenant_id);
  DELETE FROM public.support_tickets WHERE tenant_id = p_tenant_id;
  DELETE FROM public.rooms WHERE tenant_id = p_tenant_id;
  DELETE FROM public.cottages WHERE tenant_id = p_tenant_id;
  DELETE FROM public.resorts WHERE tenant_id = p_tenant_id;

  -- 6.9 Handle TEST financial records:
  -- Decouple tenant_id to NULL to satisfy profile foreign key while retaining:
  -- 1) original_tenant_id
  -- 2) original_tenant_email
  -- 3) retention_notes
  -- 4) customer_name, customer_address, seller_snapshot, and total_amount
  -- 5) unbroken monotonic sequential numbering
  UPDATE public.saas_invoices 
  SET 
    original_tenant_id = COALESCE(original_tenant_id, tenant_id),
    original_tenant_email = COALESCE(original_tenant_email, customer_email, v_target.email),
    retention_notes = format('Decoupled for disposable QA reset of tenant %s (%s) on %s', p_tenant_id, v_target.email, now()::text),
    tenant_id = NULL 
  WHERE tenant_id = p_tenant_id AND lower(trim(coalesce(environment, ''))) = 'test';

  -- Remove TEST payments and subscriptions
  DELETE FROM public.saas_payments WHERE tenant_id = p_tenant_id AND lower(trim(coalesce(environment, ''))) = 'test';
  DELETE FROM public.saas_subscriptions WHERE tenant_id = p_tenant_id AND lower(trim(coalesce(environment, ''))) = 'test';

  -- 6.10 Delete QA registry, staff profiles, and tenant profile
  DELETE FROM public.disposable_qa_accounts WHERE tenant_id = p_tenant_id;
  DELETE FROM public.profiles WHERE tenant_id = p_tenant_id AND id <> p_tenant_id;
  DELETE FROM public.profiles WHERE id = p_tenant_id;

  -- 6.11 Append to Immutable Super Admin Audit Log
  INSERT INTO public.super_admin_audit_logs (actor_id, action, target_id, target_email, metadata)
  VALUES (
    v_caller_id,
    'RESET_TEST_ACCOUNT',
    p_tenant_id,
    v_target.email,
    v_snapshot || jsonb_build_object('bookings_audited_and_deleted', v_deleted_bookings_cnt)
  );

  RETURN jsonb_build_object(
    'success', true,
    'tenant_id', p_tenant_id,
    'email', v_target.email,
    'bookings_audited_and_deleted', v_deleted_bookings_cnt,
    'status', 'database_cleaned'
  );
END;
$$;

-- 7. RPC: UPDATE PREVIEW FUNCTION (ALIAS TO GET_TENANT_QA_ELIGIBILITY)
CREATE OR REPLACE FUNCTION public.get_qa_account_reset_preview(p_tenant_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RETURN public.get_tenant_qa_eligibility(p_tenant_id);
END;
$$;

-- 8. GRANT AUTHORIZATIONS
REVOKE ALL ON FUNCTION public.get_tenant_qa_eligibility(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.archive_tenant_account(uuid, boolean, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reset_disposable_qa_account(uuid, text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_qa_account_reset_preview(uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.get_tenant_qa_eligibility(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.archive_tenant_account(uuid, boolean, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.reset_disposable_qa_account(uuid, text, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_qa_account_reset_preview(uuid) TO authenticated, service_role;

COMMIT;
