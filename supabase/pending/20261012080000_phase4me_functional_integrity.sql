-- =============================================================================
-- STAY PILOT — PHASE 4M-E FINAL SECURITY, FINANCIAL & AUDIT HARDENING MIGRATION
-- FILE: supabase/pending/20261012080000_phase4me_functional_integrity.sql
-- DESCRIPTION:
--   1. Schema Migration: Adds structured financial columns to public.incomes:
--      - transaction_type TEXT CHECK (transaction_type IN ('advance', 'settlement', 'settlement_reversal', 'refund', 'manual'))
--      - parent_income_id UUID REFERENCES public.incomes(id) ON DELETE RESTRICT
--      - Unique constraint: exactly ONE reversal per parent settlement
--   2. Audit Trail Schema:
--      - public.booking_deletion_audits: Immutable audit snapshot table storing deleted
--        booking reference, tenant_id, guest reference, financial transactions snapshot,
--        authorized deleter ID, deletion timestamp, and reason.
--      - Strictly protected by RLS: SELECT for tenant_admin, ZERO mutations allowed for tenants.
--   3. RPC delete_booking_with_financials:
--      - Exclusively deletes entire booking and all associated incomes atomically.
--      - Generates immutable audit snapshot before deletion.
--      - Restricted to Tenant Admin or Super Admin only; staff completely forbidden.
--   4. RLS & Trigger Restrictions on public.incomes:
--      - Disallows independent UPDATE or DELETE on any booking-linked income (booking_id IS NOT NULL or transaction_type IS NOT NULL).
--      - Closes direct INSERT bypass for staff.
--   5. sync_booking_advance_payment: Validates amounts, records auditable advance/refund with transaction_type.
--   6. record_checkout_settlement: Secure RPC with transaction_type = 'settlement'.
--   7. revert_booking_to_checkin: Restricts to Tenant Admin, validates status,
--      targets ONLY structured settlements with NO text fallback, 1:1 reversal constraint.
--   8. reconcile_legacy_settlement_reversal: Dedicated procedure for legacy settlements.
--   9. get_published_global_settings: Whitelist-only accessor.
--  10. support_tickets Trigger & RLS: Immutability on tenant_id, ticket_number, and admin status.
-- =============================================================================

-- =============================================================================
-- STEP 1: STRUCTURED TRANSACTION IDENTITY IN INCOMES TABLE
-- =============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'incomes' AND column_name = 'transaction_type'
  ) THEN
    ALTER TABLE public.incomes ADD COLUMN transaction_type TEXT;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'incomes_transaction_type_check'
  ) THEN
    ALTER TABLE public.incomes 
      ADD CONSTRAINT incomes_transaction_type_check 
      CHECK (transaction_type IS NULL OR transaction_type IN ('advance', 'settlement', 'settlement_reversal', 'refund', 'manual'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'incomes' AND column_name = 'parent_income_id'
  ) THEN
    ALTER TABLE public.incomes ADD COLUMN parent_income_id UUID;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'incomes_parent_income_id_fkey'
  ) THEN
    ALTER TABLE public.incomes 
      ADD CONSTRAINT incomes_parent_income_id_fkey 
      FOREIGN KEY (parent_income_id) REFERENCES public.incomes(id) ON DELETE RESTRICT;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_incomes_one_reversal_per_settlement 
  ON public.incomes(parent_income_id) 
  WHERE transaction_type = 'settlement_reversal';

CREATE INDEX IF NOT EXISTS idx_incomes_booking_tx_type 
  ON public.incomes(booking_id, transaction_type);


-- =============================================================================
-- STEP 2: IMMUTABLE AUDIT TRAIL TABLE FOR BOOKING & FINANCIAL DELETIONS
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.booking_deletion_audits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID NOT NULL,
  booking_reference TEXT NOT NULL,
  tenant_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  guest_name TEXT NOT NULL,
  guest_phone TEXT,
  total_booking_amount NUMERIC NOT NULL,
  advance_paid NUMERIC NOT NULL,
  balance_amount NUMERIC NOT NULL,
  financial_records_snapshot JSONB NOT NULL,
  deleted_by_user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  deleted_by_role TEXT NOT NULL,
  deletion_reason TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

ALTER TABLE public.booking_deletion_audits ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.enforce_booking_deletion_audits_immutability()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  RAISE EXCEPTION 'Audit trail records are strictly immutable and cannot be updated or deleted';
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_booking_deletion_audits_immutability ON public.booking_deletion_audits;
CREATE TRIGGER trg_enforce_booking_deletion_audits_immutability
  BEFORE UPDATE OR DELETE ON public.booking_deletion_audits
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_booking_deletion_audits_immutability();

DROP POLICY IF EXISTS "Tenant Admin View Deletion Audits" ON public.booking_deletion_audits;
CREATE POLICY "Tenant Admin View Deletion Audits"
  ON public.booking_deletion_audits FOR SELECT TO public
  USING (
    ((auth.uid() = tenant_id) AND (get_auth_profile_role() = 'tenant_admin')) OR is_super_admin()
  );

-- ZERO INSERT, UPDATE, DELETE POLICIES FOR USERS:
-- Purely written by server-side SECURITY DEFINER RPC. Immutable from client.


-- =============================================================================
-- STEP 3: PRIVATE SCHEMA & UNFORGEABLE CASCADE DELETION SESSION TABLE
-- =============================================================================

CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM public, anon, authenticated;
GRANT USAGE ON SCHEMA private TO postgres, service_role;

CREATE TABLE IF NOT EXISTS private.active_booking_deletion_sessions (
  booking_id UUID NOT NULL,
  tx_id XID8 NOT NULL DEFAULT pg_current_xact_id(),
  authorized_tenant_id UUID NOT NULL,
  authorized_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (booking_id, tx_id)
);
REVOKE ALL ON TABLE private.active_booking_deletion_sessions FROM public, anon, authenticated;
GRANT ALL ON TABLE private.active_booking_deletion_sessions TO postgres, service_role;

-- Database Trigger on public.incomes: blocks all independent update/delete of booking-generated incomes.
-- Only allows deletion if the booking_id is actively registered in private.active_booking_deletion_sessions
-- within the current transaction (tx_id = pg_current_xact_id()).
CREATE OR REPLACE FUNCTION public.enforce_income_booking_linkage_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_authorized_booking_id UUID;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.booking_id IS NOT NULL THEN
      SELECT booking_id INTO v_authorized_booking_id
      FROM private.active_booking_deletion_sessions
      WHERE booking_id = OLD.booking_id
        AND tx_id = pg_current_xact_id()
      LIMIT 1;

      IF v_authorized_booking_id IS NOT NULL AND v_authorized_booking_id = OLD.booking_id THEN
        RETURN OLD;
      END IF;
    END IF;

    -- Block DELETE on any booking-generated income
    IF OLD.booking_id IS NOT NULL OR OLD.transaction_type IN ('advance', 'settlement', 'settlement_reversal', 'refund') THEN
      RAISE EXCEPTION 'Booking-generated income transactions cannot be independently deleted. To remove it, delete the associated booking via authorized workflow.';
    END IF;
    RETURN OLD;
  END IF;

  -- Block UPDATE on any booking-generated income
  IF TG_OP = 'UPDATE' THEN
    IF OLD.booking_id IS NOT NULL OR OLD.transaction_type IN ('advance', 'settlement', 'settlement_reversal', 'refund') THEN
      RAISE EXCEPTION 'Booking-generated income transactions cannot be independently edited. To modify payment, update the booking or record an adjustment.';
    END IF;
    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_income_booking_linkage_guard ON public.incomes;
CREATE TRIGGER trg_enforce_income_booking_linkage_guard
  BEFORE UPDATE OR DELETE ON public.incomes
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_income_booking_linkage_guard();

-- Update RLS policies on public.incomes to enforce manual-only updates/deletes
DROP POLICY IF EXISTS "Tenant Admin Update Incomes" ON public.incomes;
CREATE POLICY "Tenant Admin Update Incomes" ON public.incomes
  FOR UPDATE TO public
  USING (
    ((((auth.uid() = tenant_id) OR belongs_to_tenant(tenant_id)) AND 
      (get_auth_profile_role() = 'tenant_admin') AND 
      (is_trial_expired() = false) AND 
      (booking_id IS NULL AND transaction_type IS NULL)) OR is_super_admin())
  )
  WITH CHECK (
    ((((auth.uid() = tenant_id) OR belongs_to_tenant(tenant_id)) AND 
      (get_auth_profile_role() = 'tenant_admin') AND 
      (is_trial_expired() = false) AND 
      (booking_id IS NULL AND transaction_type IS NULL) AND 
      (EXISTS (SELECT 1 FROM resorts r WHERE r.id = incomes.resort_id AND r.tenant_id = incomes.tenant_id))) OR is_super_admin())
  );

DROP POLICY IF EXISTS "Tenant Admin Delete Incomes" ON public.incomes;
CREATE POLICY "Tenant Admin Delete Incomes" ON public.incomes
  FOR DELETE TO public
  USING (
    ((((auth.uid() = tenant_id) OR belongs_to_tenant(tenant_id)) AND 
      (get_auth_profile_role() = 'tenant_admin') AND 
      (is_trial_expired() = false) AND 
      (booking_id IS NULL AND (transaction_type IS NULL OR transaction_type = 'manual'))) OR is_super_admin())
  );

DROP POLICY IF EXISTS "Tenant Team Insert Incomes" ON public.incomes;
CREATE POLICY "Tenant Team Insert Incomes" ON public.incomes
  FOR INSERT TO public
  WITH CHECK (
    ((belongs_to_tenant(tenant_id) AND (is_trial_expired() = false) AND 
      (EXISTS (SELECT 1 FROM resorts r WHERE r.id = incomes.resort_id AND r.tenant_id = incomes.tenant_id)) AND 
      (get_auth_profile_role() = 'tenant_admin')) OR is_super_admin())
  );

-- =============================================================================
-- STEP 3B: HARDEN BOOKINGS DELETION — ZERO DIRECT REST DELETE (ALL ROLES)
-- =============================================================================
-- Both Tenant Admin and Super Admin MUST use delete_booking_with_financials.
-- Direct Supabase REST DELETE is strictly forbidden for ALL roles.
-- Every booking deletion must produce the immutable financial audit snapshot.

CREATE OR REPLACE FUNCTION public.enforce_booking_direct_delete_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_authorized_booking_id UUID;
BEGIN
  -- Strict multi-factor authorization check for booking cascade deletion:
  -- Only permitted within an active delete_booking_with_financials transaction block
  SELECT booking_id INTO v_authorized_booking_id
  FROM private.active_booking_deletion_sessions
  WHERE booking_id = OLD.id
    AND tx_id = pg_current_xact_id()
  LIMIT 1;

  IF v_authorized_booking_id IS NOT NULL AND v_authorized_booking_id = OLD.id THEN
    RETURN OLD;
  END IF;

  -- ZERO direct delete bypass for any user (including Tenant Admin and Super Admin)
  RAISE EXCEPTION 'Direct booking deletion is not permitted for any role. All bookings and linked financials must be deleted through the authorized delete_booking_with_financials workflow to ensure financial audit integrity.';
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_booking_direct_delete_guard ON public.bookings;
CREATE TRIGGER trg_enforce_booking_direct_delete_guard
  BEFORE DELETE ON public.bookings
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_booking_direct_delete_guard();

-- RLS: Disallow DELETE for all users from client REST
DROP POLICY IF EXISTS "Tenant Admin Delete Bookings" ON public.bookings;
CREATE POLICY "Tenant Admin Delete Bookings" ON public.bookings
  FOR DELETE TO public
  USING (
    false
  );

REVOKE DELETE ON public.bookings FROM anon, authenticated;


-- =============================================================================
-- STEP 4: SECURE BOOKING DELETION RPC (WITH FINANCIALS & AUDIT SNAPSHOT)
-- =============================================================================

CREATE OR REPLACE FUNCTION public.delete_booking_with_financials(
  p_booking_id UUID,
  p_deletion_reason TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid UUID;
  v_role TEXT;
  v_tenant_id UUID;
  v_booking RECORD;
  v_incomes_snapshot JSONB;
  v_deleted_incomes_count INT := 0;
  v_reason TEXT;
  v_deletion_token TEXT;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT role, tenant_id INTO v_role, v_tenant_id
  FROM public.profiles
  WHERE id = v_uid;

  -- Only Tenant Admin or Super Admin can delete bookings
  IF v_role NOT IN ('tenant_admin', 'super_admin') THEN
    RAISE EXCEPTION 'Unauthorized: Only Tenant Admins can permanently delete a booking and its financial records';
  END IF;

  IF is_trial_expired() = TRUE THEN
    RAISE EXCEPTION 'Subscription or trial expired';
  END IF;

  v_reason := NULLIF(TRIM(p_deletion_reason), '');
  IF v_reason IS NULL THEN
    RAISE EXCEPTION 'Deletion reason is required';
  END IF;

  -- Lock booking row exclusively
  SELECT * INTO v_booking
  FROM public.bookings
  WHERE id = p_booking_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Booking not found';
  END IF;

  -- Strict tenant boundary validation
  IF v_role <> 'super_admin' AND v_booking.tenant_id <> v_tenant_id THEN
    RAISE EXCEPTION 'Cross-tenant access forbidden';
  END IF;

  -- Lock all associated financial records
  PERFORM id FROM public.incomes WHERE booking_id = p_booking_id FOR UPDATE;

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
  WHERE booking_id = p_booking_id;

  SELECT jsonb_array_length(v_incomes_snapshot) INTO v_deleted_incomes_count;

  -- Record immutable audit log row
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
    v_booking.phone_number,
    COALESCE(v_booking.total_amount, 0),
    COALESCE(v_booking.advance_paid, 0),
    COALESCE(v_booking.balance_amount, 0),
    v_incomes_snapshot,
    v_uid,
    v_role,
    v_reason
  );

  -- Register authorized deletion session in private table
  INSERT INTO private.active_booking_deletion_sessions (
    booking_id, authorized_tenant_id, authorized_by
  ) VALUES (
    p_booking_id, v_booking.tenant_id, v_uid
  );

  -- First delete child reversal incomes (to satisfy self-referential FK constraint)
  DELETE FROM public.incomes
  WHERE booking_id = p_booking_id
    AND parent_income_id IS NOT NULL;

  -- Then delete parent incomes (advance, settlements, manual)
  DELETE FROM public.incomes
  WHERE booking_id = p_booking_id;

  -- Finally delete the booking row
  DELETE FROM public.bookings
  WHERE id = p_booking_id;

  -- Clean up active deletion session
  DELETE FROM private.active_booking_deletion_sessions
  WHERE booking_id = p_booking_id
    AND tx_id = pg_current_xact_id();

  RETURN jsonb_build_object(
    'success', true,
    'booking_id', p_booking_id,
    'booking_reference', COALESCE(v_booking.reference_number, v_booking.id::text),
    'deleted_incomes_count', v_deleted_incomes_count,
    'audit_logged', true
  );
END;
$$;


-- =============================================================================
-- STEP 5: SECURE ADVANCE PAYMENT SYNCHRONIZATION RPC
-- =============================================================================

CREATE OR REPLACE FUNCTION public.sync_booking_advance_payment(
  p_booking_id UUID,
  p_target_advance_paid NUMERIC,
  p_payment_mode TEXT DEFAULT 'UPI'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid UUID;
  v_role TEXT;
  v_tenant_id UUID;
  v_booking RECORD;
  v_current_advance NUMERIC;
  v_total_amount NUMERIC;
  v_diff NUMERIC;
  v_mode TEXT;
  v_new_balance NUMERIC;
  v_tx_type TEXT;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT role, tenant_id INTO v_role, v_tenant_id
  FROM public.profiles
  WHERE id = v_uid;

  IF v_role NOT IN ('tenant_admin', 'staff', 'super_admin') THEN
    RAISE EXCEPTION 'Unauthorized: Caller must be Tenant Admin, Staff, or Super Admin';
  END IF;

  IF is_trial_expired() = TRUE THEN
    RAISE EXCEPTION 'Subscription or trial expired';
  END IF;

  IF p_target_advance_paid IS NULL OR p_target_advance_paid < 0 THEN
    RAISE EXCEPTION 'Invalid payment amount: advance_paid cannot be negative or null';
  END IF;

  SELECT * INTO v_booking
  FROM public.bookings
  WHERE id = p_booking_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Booking not found';
  END IF;

  IF v_role <> 'super_admin' AND v_booking.tenant_id <> v_tenant_id THEN
    RAISE EXCEPTION 'Cross-tenant access forbidden';
  END IF;

  v_total_amount := COALESCE(v_booking.total_amount, 0);
  IF p_target_advance_paid > v_total_amount THEN
    RAISE EXCEPTION 'Invalid payment amount: advance payment (₹%) exceeds total booking amount (₹%)', p_target_advance_paid, v_total_amount;
  END IF;

  v_mode := COALESCE(NULLIF(TRIM(p_payment_mode), ''), 'UPI');
  IF v_mode NOT IN ('UPI', 'Cash', 'Card', 'Bank Transfer', 'Net Banking', 'Cheque', 'OTA') THEN
    v_mode := 'UPI';
  END IF;

  v_current_advance := COALESCE(v_booking.advance_paid, 0);
  v_diff := p_target_advance_paid - v_current_advance;

  IF v_diff = 0 THEN
    RETURN jsonb_build_object(
      'success', true,
      'booking_id', p_booking_id,
      'advance_paid', v_current_advance,
      'balance_amount', v_booking.balance_amount,
      'adjustment_amount', 0,
      'action_taken', 'NO_CHANGE'
    );
  END IF;

  IF v_diff < 0 AND v_role NOT IN ('tenant_admin', 'super_admin') THEN
    RAISE EXCEPTION 'Unauthorized: Only Tenant Admins can authorize payment reductions or refunds';
  END IF;

  v_tx_type := CASE WHEN v_diff > 0 THEN 'advance' ELSE 'refund' END;

  v_new_balance := GREATEST(0, v_total_amount - p_target_advance_paid);
  UPDATE public.bookings
  SET advance_paid = p_target_advance_paid,
      balance_amount = v_new_balance
  WHERE id = p_booking_id;

  INSERT INTO public.incomes (
    resort_id,
    cottage_id,
    tenant_id,
    booking_id,
    amount,
    source,
    notes,
    date,
    payment_mode,
    transaction_type,
    parent_income_id
  ) VALUES (
    v_booking.resort_id,
    v_booking.cottage_id,
    v_booking.tenant_id,
    v_booking.id,
    v_diff,
    'Room Rent',
    CASE 
      WHEN v_diff > 0 THEN 'Advance Payment: ' || v_booking.guest_name || ' (' || COALESCE(v_booking.reference_number, '') || ')'
      ELSE 'Payment Adjustment (Refund): ' || v_booking.guest_name || ' (' || COALESCE(v_booking.reference_number, '') || ')'
    END,
    CURRENT_DATE,
    v_mode,
    v_tx_type,
    NULL
  );

  RETURN jsonb_build_object(
    'success', true,
    'booking_id', p_booking_id,
    'advance_paid', p_target_advance_paid,
    'balance_amount', v_new_balance,
    'adjustment_amount', v_diff,
    'payment_mode', v_mode,
    'transaction_type', v_tx_type,
    'action_taken', CASE WHEN v_diff > 0 THEN 'ADVANCE_RECORDED' ELSE 'ADJUSTMENT_RECORDED' END
  );
END;
$$;


-- =============================================================================
-- STEP 6: SECURE CHECKOUT SETTLEMENT RPC
-- =============================================================================

CREATE OR REPLACE FUNCTION public.record_checkout_settlement(
  p_booking_id UUID,
  p_amount NUMERIC,
  p_payment_mode TEXT DEFAULT 'UPI',
  p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid UUID;
  v_role TEXT;
  v_tenant_id UUID;
  v_booking RECORD;
  v_mode TEXT;
  v_settlement_id UUID := gen_random_uuid();
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT role, tenant_id INTO v_role, v_tenant_id
  FROM public.profiles
  WHERE id = v_uid;

  IF v_role NOT IN ('tenant_admin', 'staff', 'super_admin') THEN
    RAISE EXCEPTION 'Unauthorized: Caller must be Tenant Admin, Staff, or Super Admin';
  END IF;

  IF is_trial_expired() = TRUE THEN
    RAISE EXCEPTION 'Subscription or trial expired';
  END IF;

  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Invalid settlement amount: amount must be positive';
  END IF;

  SELECT * INTO v_booking
  FROM public.bookings
  WHERE id = p_booking_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Booking not found';
  END IF;

  IF v_role <> 'super_admin' AND v_booking.tenant_id <> v_tenant_id THEN
    RAISE EXCEPTION 'Cross-tenant access forbidden';
  END IF;

  v_mode := COALESCE(NULLIF(TRIM(p_payment_mode), ''), 'UPI');
  IF v_mode NOT IN ('UPI', 'Cash', 'Card', 'Bank Transfer', 'Net Banking', 'Cheque', 'OTA') THEN
    v_mode := 'UPI';
  END IF;

  INSERT INTO public.incomes (
    id,
    resort_id,
    cottage_id,
    tenant_id,
    booking_id,
    amount,
    source,
    notes,
    date,
    payment_mode,
    transaction_type,
    parent_income_id
  ) VALUES (
    v_settlement_id,
    v_booking.resort_id,
    v_booking.cottage_id,
    v_booking.tenant_id,
    v_booking.id,
    p_amount,
    'Room Rent',
    COALESCE(p_notes, 'Settlement: ' || v_booking.guest_name || ' (' || COALESCE(v_booking.reference_number, '') || ')'),
    CURRENT_DATE,
    v_mode,
    'settlement',
    NULL
  );

  RETURN jsonb_build_object(
    'success', true,
    'settlement_id', v_settlement_id,
    'booking_id', p_booking_id,
    'amount', p_amount,
    'payment_mode', v_mode,
    'transaction_type', 'settlement'
  );
END;
$$;


-- =============================================================================
-- STEP 7: SECURE CHECKOUT REVERT RPC
-- =============================================================================

CREATE OR REPLACE FUNCTION public.revert_booking_to_checkin(
  p_booking_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid UUID;
  v_role TEXT;
  v_tenant_id UUID;
  v_booking RECORD;
  v_settlement RECORD;
  v_settlement_sum NUMERIC := 0;
  v_advance_sum NUMERIC := 0;
  v_restored_balance NUMERIC := 0;
  v_reversed_count INT := 0;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT role, tenant_id INTO v_role, v_tenant_id
  FROM public.profiles
  WHERE id = v_uid;

  IF v_role NOT IN ('tenant_admin', 'super_admin') THEN
    RAISE EXCEPTION 'Unauthorized: Only Tenant Admins can reverse completed checkout settlements';
  END IF;

  IF is_trial_expired() = TRUE THEN
    RAISE EXCEPTION 'Subscription or trial expired';
  END IF;

  SELECT * INTO v_booking
  FROM public.bookings
  WHERE id = p_booking_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Booking not found';
  END IF;

  IF v_role <> 'super_admin' AND v_booking.tenant_id <> v_tenant_id THEN
    RAISE EXCEPTION 'Cross-tenant access forbidden';
  END IF;

  IF v_booking.status = 'Checked-in' THEN
    RETURN jsonb_build_object(
      'success', true,
      'booking_id', p_booking_id,
      'advance_paid', v_booking.advance_paid,
      'balance_amount', v_booking.balance_amount,
      'status', 'Checked-in',
      'action_taken', 'ALREADY_CHECKED_IN'
    );
  END IF;

  IF v_booking.status NOT IN ('Checked-out', 'Completed') THEN
    RAISE EXCEPTION 'Invalid status transition: Only Checked-out or Completed bookings can be reverted to Checked-in (Current: %)', v_booking.status;
  END IF;

  FOR v_settlement IN
    SELECT id, amount, notes, payment_mode
    FROM public.incomes
    WHERE booking_id = p_booking_id
      AND transaction_type = 'settlement'
      AND amount > 0
      AND id NOT IN (
        SELECT parent_income_id
        FROM public.incomes
        WHERE booking_id = p_booking_id
          AND transaction_type = 'settlement_reversal'
          AND parent_income_id IS NOT NULL
      )
    FOR UPDATE
  LOOP
    v_settlement_sum := v_settlement_sum + v_settlement.amount;
    v_reversed_count := v_reversed_count + 1;

    INSERT INTO public.incomes (
      resort_id,
      cottage_id,
      tenant_id,
      booking_id,
      amount,
      source,
      notes,
      date,
      payment_mode,
      transaction_type,
      parent_income_id
    ) VALUES (
      v_booking.resort_id,
      v_booking.cottage_id,
      v_booking.tenant_id,
      v_booking.id,
      -v_settlement.amount,
      'Room Rent',
      'Reversal of settlement ' || v_settlement.id || ' (Check-in Reopened)',
      CURRENT_DATE,
      v_settlement.payment_mode,
      'settlement_reversal',
      v_settlement.id
    );
  END LOOP;

  SELECT COALESCE(SUM(amount), 0) INTO v_advance_sum
  FROM public.incomes
  WHERE booking_id = p_booking_id
    AND (transaction_type IS NULL OR transaction_type NOT IN ('settlement', 'settlement_reversal'));

  v_restored_balance := GREATEST(0, v_booking.total_amount - v_advance_sum);

  UPDATE public.bookings
  SET status = 'Checked-in',
      advance_paid = v_advance_sum,
      balance_amount = v_restored_balance
  WHERE id = p_booking_id;

  RETURN jsonb_build_object(
    'success', true,
    'booking_id', p_booking_id,
    'advance_paid', v_advance_sum,
    'balance_amount', v_restored_balance,
    'status', 'Checked-in',
    'reversed_settlement_amount', v_settlement_sum,
    'reversed_count', v_reversed_count,
    'action_taken', 'REVERTED_WITH_STRUCTURED_REVERSAL'
  );
END;
$$;


-- =============================================================================
-- STEP 8: RECONCILE LEGACY SETTLEMENT RPC
-- =============================================================================

CREATE OR REPLACE FUNCTION public.reconcile_legacy_settlement_reversal(
  p_legacy_income_id UUID,
  p_booking_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid UUID;
  v_role TEXT;
  v_tenant_id UUID;
  v_income RECORD;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT role, tenant_id INTO v_role, v_tenant_id
  FROM public.profiles
  WHERE id = v_uid;

  IF v_role NOT IN ('tenant_admin', 'super_admin') THEN
    RAISE EXCEPTION 'Unauthorized: Only Tenant Admins can reconcile legacy settlements';
  END IF;

  SELECT * INTO v_income
  FROM public.incomes
  WHERE id = p_legacy_income_id AND booking_id = p_booking_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Historical income record not found for booking %', p_booking_id;
  END IF;

  IF v_role <> 'super_admin' AND v_income.tenant_id <> v_tenant_id THEN
    RAISE EXCEPTION 'Cross-tenant access forbidden';
  END IF;

  IF v_income.transaction_type IS NOT NULL THEN
    RAISE EXCEPTION 'Income is already structured with type %', v_income.transaction_type;
  END IF;

  UPDATE public.incomes
  SET transaction_type = 'settlement'
  WHERE id = p_legacy_income_id;

  RETURN jsonb_build_object(
    'success', true,
    'reconciled_income_id', p_legacy_income_id,
    'booking_id', p_booking_id,
    'action_taken', 'CLASSIFIED_AS_STRUCTURED_SETTLEMENT'
  );
END;
$$;


-- =============================================================================
-- STEP 9: GLOBAL SETTINGS ACCESSOR
-- =============================================================================

CREATE OR REPLACE FUNCTION public.get_published_global_settings()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_settings JSONB;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT global_settings INTO v_settings
  FROM public.profiles
  WHERE role = 'super_admin'
    AND global_settings IS NOT NULL
  ORDER BY created_at ASC
  LIMIT 1;

  IF v_settings IS NULL THEN
    RETURN jsonb_build_object(
      'comm_features_enabled', true,
      'templates_enabled', true
    );
  END IF;

  RETURN jsonb_build_object(
    'comm_features_enabled', COALESCE((v_settings ->> 'comm_features_enabled')::boolean, true),
    'templates_enabled', COALESCE((v_settings ->> 'templates_enabled')::boolean, true)
  );
END;
$$;


-- =============================================================================
-- STEP 10: SUPPORT TICKETS IMMUTABILITY TRIGGER & POLICIES
-- =============================================================================

CREATE OR REPLACE FUNCTION public.enforce_support_ticket_immutability()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_role TEXT;
BEGIN
  IF NEW.tenant_id IS DISTINCT FROM OLD.tenant_id THEN
    RAISE EXCEPTION 'Modifying tenant_id on existing support tickets is forbidden';
  END IF;

  IF NEW.ticket_number IS DISTINCT FROM OLD.ticket_number THEN
    RAISE EXCEPTION 'Modifying ticket_number on existing support tickets is forbidden';
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    SELECT role INTO v_role
    FROM public.profiles
    WHERE id = auth.uid();

    IF v_role NOT IN ('tenant_admin', 'super_admin') THEN
      RAISE EXCEPTION 'Unauthorized: Only Tenant Admins or Super Admins can update ticket status';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_support_ticket_immutability ON public.support_tickets;
CREATE TRIGGER trg_enforce_support_ticket_immutability
  BEFORE UPDATE ON public.support_tickets
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_support_ticket_immutability();

DROP POLICY IF EXISTS "Tenants create tickets" ON public.support_tickets;
DROP POLICY IF EXISTS "Tenants view own tickets" ON public.support_tickets;
DROP POLICY IF EXISTS "Tenants update own tickets" ON public.support_tickets;
DROP POLICY IF EXISTS "Tenant Team create tickets" ON public.support_tickets;
DROP POLICY IF EXISTS "Tenant Team view tickets" ON public.support_tickets;
DROP POLICY IF EXISTS "Tenant Team update tickets" ON public.support_tickets;

CREATE POLICY "Tenant Team create tickets" ON public.support_tickets
  FOR INSERT TO public
  WITH CHECK (
    ((auth.uid() = tenant_id) OR belongs_to_tenant(tenant_id) OR is_super_admin())
  );

CREATE POLICY "Tenant Team view tickets" ON public.support_tickets
  FOR SELECT TO public
  USING (
    ((auth.uid() = tenant_id) OR belongs_to_tenant(tenant_id) OR is_super_admin())
  );

CREATE POLICY "Tenant Team update tickets" ON public.support_tickets
  FOR UPDATE TO public
  USING (
    ((auth.uid() = tenant_id) OR belongs_to_tenant(tenant_id) OR is_super_admin())
  );

DROP POLICY IF EXISTS "Insert messages to owned tickets" ON public.support_messages;
DROP POLICY IF EXISTS "View messages for owned tickets" ON public.support_messages;
DROP POLICY IF EXISTS "Tenant Team insert messages" ON public.support_messages;
DROP POLICY IF EXISTS "Tenant Team view messages" ON public.support_messages;

CREATE POLICY "Tenant Team insert messages" ON public.support_messages
  FOR INSERT TO public
  WITH CHECK (
    is_super_admin() OR 
    ((sender_id = auth.uid()) AND (ticket_id IN (
      SELECT id FROM public.support_tickets WHERE tenant_id = auth.uid() OR belongs_to_tenant(tenant_id)
    )))
  );

CREATE POLICY "Tenant Team view messages" ON public.support_messages
  FOR SELECT TO public
  USING (
    is_super_admin() OR 
    (ticket_id IN (
      SELECT id FROM public.support_tickets WHERE tenant_id = auth.uid() OR belongs_to_tenant(tenant_id)
    ))
  );


-- =============================================================================
-- STEP 11: PERMISSIONS GRANTS & REVOCATIONS
-- =============================================================================

REVOKE ALL ON FUNCTION public.sync_booking_advance_payment(UUID, NUMERIC, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.record_checkout_settlement(UUID, NUMERIC, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.revert_booking_to_checkin(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reconcile_legacy_settlement_reversal(UUID, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.delete_booking_with_financials(UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_published_global_settings() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.sync_booking_advance_payment(UUID, NUMERIC, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_checkout_settlement(UUID, NUMERIC, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.revert_booking_to_checkin(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reconcile_legacy_settlement_reversal(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_booking_with_financials(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_published_global_settings() TO authenticated;
