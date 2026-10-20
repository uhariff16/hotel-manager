-- ==============================================================================
-- STAY PILOT — PHASE R3 STAGE 3B: ROLLBACK COMMERCIAL INVOICING ENGINE
-- File: supabase/rollback_phase_r3_stage3b_invoicing_engine.sql
-- Target Project: lubkdxhqnnghnjhrebat (Supabase Production)
-- Mode: PROPOSED LOCAL ROLLBACK SCRIPT ONLY — DO NOT EXECUTE WITHOUT APPROVAL
-- ==============================================================================
-- Summary of Rollback Actions:
--   1. Restores process_subscription_webhook to exact pre-Stage-3B production definition
--      (verified via pg_get_functiondef from production database).
--   2. Drops void_saas_invoice RPC.
--   3. Drops generate_saas_commercial_invoice RPC.
--   4. NON-DESTRUCTIVE AUDIT & IMMUTABILITY PRESERVATION:
--      - If any invoice records exist in saas_invoices (issued or void), the audit columns
--        (void_reason, voided_by, voided_at) and immutability trigger are permanently retained.
--      - Sequences saas_invoice_number_seq_live and saas_invoice_number_seq_test are retained
--        permanently to prevent numbering reuse or fragmentation.
--   5. EVALUATION OF UNISSUED INVOICE RECORDS (pending / failed / manual_review):
--      - Rolling back drops automated invoice generation.
--      - Captured payments in saas_payments remain 100% intact with their original payment status,
--        amounts, and timestamps; tenant subscription access remains active without interruption.
--      - Records with invoice_status IN ('pending', 'failed', 'manual_review') remain preserved in
--        saas_payments for audit and post-fix issuance.
--      - Safe Recovery Procedure (below) allows resuming invoice generation once Stage 3B is re-applied.
-- ==============================================================================

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '15s';

-- ------------------------------------------------------------------------------
-- 1. RESTORE PRE-STAGE-3B PRODUCTION process_subscription_webhook RPC
-- ------------------------------------------------------------------------------
-- Exact active production function definition extracted via pg_get_functiondef:
CREATE OR REPLACE FUNCTION public.process_subscription_webhook(
  p_razorpay_sub_id text,
  p_event_type text,
  p_event_env text,
  p_status text,
  p_current_start timestamp with time zone,
  p_current_end timestamp with time zone,
  p_payment_id text DEFAULT NULL::text,
  p_amount numeric DEFAULT NULL::numeric,
  p_currency text DEFAULT NULL::text,
  p_payment_status text DEFAULT NULL::text,
  p_payment_method text DEFAULT NULL::text,
  p_invoice_id text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_sub RECORD;
  v_new_period_end TIMESTAMPTZ;
  v_is_future BOOLEAN;
BEGIN
  -- Strict Ownership Matching: Lock saas_subscriptions row strictly by razorpay_subscription_id
  SELECT * INTO v_sub
  FROM public.saas_subscriptions
  WHERE razorpay_subscription_id = p_razorpay_sub_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'ignored', 'reason', 'Subscription ID mismatch or not found');
  END IF;

  -- Strict Environment Guard
  IF v_sub.environment <> p_event_env THEN
    RETURN jsonb_build_object('status', 'rejected', 'reason', 'Cross-environment mismatch');
  END IF;

  -- Monotonic timestamp guard: do not regress current_period_end. No invented 30-day fallbacks.
  IF p_current_end IS NOT NULL AND v_sub.current_period_end IS NOT NULL AND p_current_end < v_sub.current_period_end THEN
    v_new_period_end := v_sub.current_period_end;
  ELSE
    v_new_period_end := COALESCE(p_current_end, v_sub.current_period_end);
  END IF;

  -- 1. Mandate Authentication Event (subscription.authenticated)
  -- DOES NOT activate paid entitlement; records subscription state as authenticated pending captured payment.
  IF p_event_type = 'subscription.authenticated' THEN
    UPDATE public.saas_subscriptions
    SET status = 'authenticated',
        checkout_token = NULL,
        checkout_expires_at = NULL
    WHERE id = v_sub.id;

    RETURN jsonb_build_object('status', 'success', 'reason', 'Mandate authenticated, awaiting captured payment');

  -- 2. Verified Payment Capture & Activation Events
  ELSIF p_event_type IN ('subscription.activated', 'subscription.charged', 'verify_capture') THEN
    -- Enforce Captured Payment: Require non-NULL captured/paid payment status to grant paid access
    IF p_payment_status IS NULL OR p_payment_status NOT IN ('captured', 'paid') THEN
      RETURN jsonb_build_object('status', 'rejected', 'reason', 'Captured payment status required to grant paid access');
    END IF;

    -- Validate payment amount if parameter is supplied
    IF p_amount IS NOT NULL AND p_amount <= 0 THEN
      RETURN jsonb_build_object('status', 'rejected', 'reason', 'Invalid payment amount');
    END IF;

    -- Stale activation guard: do not reactivate halted/cancelled subscription unless new period_end is strictly greater
    IF v_sub.status IN ('halted', 'cancelled') AND p_current_end IS NOT NULL AND p_current_end <= v_sub.current_period_end THEN
      RETURN jsonb_build_object('status', 'ignored', 'reason', 'Stale activation event for terminated subscription');
    END IF;

    UPDATE public.saas_subscriptions
    SET status = 'active',
        current_period_start = COALESCE(p_current_start, current_period_start, NOW()),
        current_period_end = v_new_period_end,
        cancel_at_period_end = FALSE,
        checkout_token = NULL,
        checkout_expires_at = NULL
    WHERE id = v_sub.id;

    -- Update Profile plan ONLY if tenant is NOT a legacy account or if not demoting legacy Stay Master
    UPDATE public.profiles
    SET plan_type = v_sub.staypilot_plan_type
    WHERE id = v_sub.tenant_id
      AND (is_legacy_account IS NOT TRUE OR plan_type != 'premium');

  -- 3. Cancellation Events
  ELSIF p_event_type = 'subscription.cancelled' THEN
    v_is_future := (v_new_period_end IS NOT NULL AND v_new_period_end > NOW());
    
    UPDATE public.saas_subscriptions
    SET status = 'cancelled',
        cancel_at_period_end = v_is_future,
        checkout_token = NULL,
        checkout_expires_at = NULL
    WHERE id = v_sub.id;

    IF NOT v_is_future THEN
      UPDATE public.profiles
      SET plan_type = 'free'
      WHERE id = v_sub.tenant_id
        AND is_legacy_account IS NOT TRUE;
    END IF;

  -- 4. Halted / Completed Events
  ELSIF p_event_type IN ('subscription.halted', 'subscription.completed') THEN
    UPDATE public.saas_subscriptions
    SET status = p_status,
        cancel_at_period_end = FALSE,
        checkout_token = NULL,
        checkout_expires_at = NULL
    WHERE id = v_sub.id;

    UPDATE public.profiles
    SET plan_type = 'free'
    WHERE id = v_sub.tenant_id
      AND is_legacy_account IS NOT TRUE;
  END IF;

  -- Record Payment if present (with duplicate conflict handling)
  IF p_payment_id IS NOT NULL THEN
    INSERT INTO public.saas_payments (
      tenant_id, razorpay_payment_id, razorpay_subscription_id,
      razorpay_invoice_id, amount, currency, status, payment_method
    ) VALUES (
      v_sub.tenant_id, p_payment_id, p_razorpay_sub_id,
      p_invoice_id, p_amount, p_currency, p_payment_status, p_payment_method
    ) ON CONFLICT (razorpay_payment_id) DO NOTHING;
  END IF;

  RETURN jsonb_build_object('status', 'success', 'environment', p_event_env);
END;
$function$;

REVOKE ALL ON FUNCTION public.process_subscription_webhook(text, text, text, text, timestamptz, timestamptz, text, numeric, text, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.process_subscription_webhook(text, text, text, text, timestamptz, timestamptz, text, numeric, text, text, text, text) TO service_role;


-- ------------------------------------------------------------------------------
-- 2. DROP STAGE 3B INVOICING RPCS
-- ------------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.void_saas_invoice(UUID, TEXT, UUID);
DROP FUNCTION IF EXISTS public.generate_saas_commercial_invoice(UUID);


-- ------------------------------------------------------------------------------
-- 3. NON-DESTRUCTIVE AUDIT & IMMUTABILITY PRESERVATION
-- ------------------------------------------------------------------------------
-- Under no circumstances should audit columns or immutability triggers be removed
-- if saas_invoices contains issued or void records.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.saas_invoices LIMIT 1) THEN
    RAISE NOTICE 'saas_invoices contains records. Retaining immutability trigger and audit columns (void_reason, voided_by, voided_at) to preserve financial evidence.';
  ELSE
    -- Safe to drop trigger and columns only if table is 100% empty (e.g. pre-launch rollback rehearsal)
    DROP TRIGGER IF EXISTS trg_enforce_saas_invoice_immutability ON public.saas_invoices;
    DROP FUNCTION IF EXISTS public.enforce_saas_invoice_immutability();

    ALTER TABLE public.saas_invoices
      DROP COLUMN IF EXISTS void_reason,
      DROP COLUMN IF EXISTS voided_by,
      DROP COLUMN IF EXISTS voided_at;
  END IF;
END $$;

-- ------------------------------------------------------------------------------
-- 4. RECOVERY PROCEDURE FOR UNISSUED INVOICES (POST-ROLLBACK GUIDE)
-- ------------------------------------------------------------------------------
-- When Stage 3B is rolled back:
-- 1. All tenant subscriptions, active entitlements, and payments in saas_payments remain intact.
-- 2. Any payments with invoice_status IN ('pending', 'failed', 'manual_review') retain their
--    recorded captured status in saas_payments.
-- 3. Once Stage 3B is re-applied, unissued invoices can be generated safely without customer
--    impact using the following recovery query:
--
--    SELECT id, razorpay_payment_id, amount,
--           public.generate_saas_commercial_invoice(id) as generated_invoice_id
--    FROM public.saas_payments
--    WHERE status IN ('captured', 'paid')
--      AND environment IS NOT NULL
--      AND invoice_status IN ('pending', 'failed', 'manual_review')
--    ORDER BY created_at ASC;
--
-- 4. Invoices generated via this recovery procedure will strictly use isolated sequences and
--    preserve the original payment dates.
-- ------------------------------------------------------------------------------

COMMIT;
