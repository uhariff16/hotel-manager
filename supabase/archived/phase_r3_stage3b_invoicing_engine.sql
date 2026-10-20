-- ==============================================================================
-- STAY PILOT — PHASE R3 STAGE 3B: COMMERCIAL INVOICING ENGINE (DEPLOYMENT-READY)
-- File: supabase/phase_r3_stage3b_invoicing_engine.sql
-- Target Project: lubkdxhqnnghnjhrebat (Supabase Production)
-- Mode: PROPOSED LOCAL DDL SCRIPT ONLY — DO NOT EXECUTE WITHOUT APPROVAL
-- ==============================================================================
-- Summary of Stage 3B Design & Safety Corrections:
--   1. Webhook Event Ordering & Replay Safety:
--      - Delayed subscription.authenticated events cannot regress active, cancelled,
--        halted, or completed subscription states.
--      - Stale cancellation events cannot regress active subscriptions with renewed periods.
--      - Stale activation events cannot reactivate terminated subscriptions.
--      - Valid captured payments are recorded and invoiced across all event types.
--   2. Captured-Payment Reconciliation & Historical Protection:
--      - Handles duplicate payment events safely.
--      - Non-captured payments transitioning to captured are updated in place without duplicate rows.
--      - Conflicting tenant, environment, amount, currency, or subscription ID are strictly rejected.
--      - Protected historical payments (environment IS NULL / invoice_status IS NULL) cannot be modified.
--   3. Secure Invoice Void Authorization:
--      - Enforces auth.uid() when called from user sessions, rejecting spoofed operator IDs.
--      - Verifies trusted system role (service_role, postgres, supabase_admin) before accepting
--        p_operator_id when auth.uid() is NULL.
--      - Validates operator's active super_admin role in public.profiles.
--   4. Voided Invoice Protection:
--      - Inspects existing invoice status upon idempotent generation attempts.
--      - Never resurrects voided invoices or alters payment status back to 'issued'.
--   5. GST Pricing Contract & Authoritative Reconciliation:
--      - Distinguishes inclusive vs exclusive pricing.
--      - Validates authoritative base price against canonical pricing configuration in exclusive mode.
--      - Asserts exact penny-for-penny reconciliation with zero drift against captured Razorpay amount.
--      - Malformed GST configurations fail closed safely to non-GST commercial acknowledgments.
--      - Production GST remains strictly disabled.
--   6. Strict Immutability & Audit:
--      - Trigger prohibits modification to every single column except permitted void audit fields.
--      - Dual isolated numbering sequences (SP-INV-YYYY-XXXXX / SP-TEST-INV-YYYY-XXXXX).
--      - Cheerful Chalet lifetime premium entitlement strictly protected.
-- ==============================================================================

BEGIN;

-- Operational Guardrails: fail immediately if table locks cannot be acquired quickly
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '15s';

-- ------------------------------------------------------------------------------
-- 1. ADD AUDITABLE VOID COLUMNS TO public.saas_invoices
-- ------------------------------------------------------------------------------
ALTER TABLE public.saas_invoices
  ADD COLUMN IF NOT EXISTS void_reason TEXT,
  ADD COLUMN IF NOT EXISTS voided_by UUID,
  ADD COLUMN IF NOT EXISTS voided_at TIMESTAMPTZ;


-- ------------------------------------------------------------------------------
-- 2. INVOICE IMMUTABILITY TRIGGER FUNCTION & TRIGGER
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_saas_invoice_immutability()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- 2.1 Block all deletions unconditionally
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'INVOICE_IMMUTABLE: Deletion of saas_invoices records is strictly prohibited.';
  END IF;

  -- 2.2 Enforce strict immutability on UPDATE
  IF TG_OP = 'UPDATE' THEN
    -- If already void, no further modifications are permitted
    IF OLD.invoice_status = 'void' THEN
      RAISE EXCEPTION 'INVOICE_IMMUTABLE: Invoice % is void and cannot be modified.', OLD.invoice_number;
    END IF;

    -- Only allow transition from 'issued' to 'void'
    IF OLD.invoice_status = 'issued' AND NEW.invoice_status = 'void' THEN
      -- Validate mandatory audit trail
      IF NEW.void_reason IS NULL OR length(trim(NEW.void_reason)) < 5 THEN
        RAISE EXCEPTION 'INVOICE_VOID_INVALID: A valid void_reason of at least 5 characters is required.';
      END IF;

      IF NEW.voided_by IS NULL THEN
        RAISE EXCEPTION 'INVOICE_VOID_INVALID: An auditable operator ID (voided_by) is required to void an invoice.';
      END IF;

      NEW.voided_at := COALESCE(NEW.voided_at, NOW());

      -- Prohibit modifications to every field except explicitly permitted void audit fields
      IF (to_jsonb(NEW) - '{invoice_status,void_reason,voided_by,voided_at}'::text[]) IS DISTINCT FROM
         (to_jsonb(OLD) - '{invoice_status,void_reason,voided_by,voided_at}'::text[]) THEN
        RAISE EXCEPTION 'INVOICE_IMMUTABLE: Voiding an invoice cannot alter snapshots, financial amounts, dates, or references.';
      END IF;

      RETURN NEW;
    ELSE
      RAISE EXCEPTION 'INVOICE_IMMUTABLE: Updates to issued invoices are prohibited. Only authorized void operations are permitted.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_saas_invoice_immutability ON public.saas_invoices;
CREATE TRIGGER trg_enforce_saas_invoice_immutability
  BEFORE UPDATE OR DELETE ON public.saas_invoices
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_saas_invoice_immutability();


-- ------------------------------------------------------------------------------
-- 3. AUTHORIZED VOID RPC (TRUSTED EXECUTION CONTEXT & AUDIT ATTRIBUTION)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.void_saas_invoice(
  p_invoice_id UUID,
  p_reason TEXT,
  p_operator_id UUID DEFAULT NULL::UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_operator_id UUID;
  v_is_trusted_context BOOLEAN := FALSE;
BEGIN
  IF p_invoice_id IS NULL THEN
    RAISE EXCEPTION 'INVOICE_VOID_INVALID: p_invoice_id is required.';
  END IF;

  IF p_reason IS NULL OR length(trim(p_reason)) < 5 THEN
    RAISE EXCEPTION 'INVOICE_VOID_INVALID: A valid void reason of at least 5 characters is required.';
  END IF;

  -- 1. Check authenticated session context
  BEGIN
    v_operator_id := auth.uid();
  EXCEPTION WHEN OTHERS THEN
    v_operator_id := NULL;
  END;

  IF v_operator_id IS NOT NULL THEN
    -- In an authenticated JWT session, caller identity is locked to auth.uid(). Prohibit operator spoofing.
    IF p_operator_id IS NOT NULL AND p_operator_id <> v_operator_id THEN
      RAISE EXCEPTION 'FORBIDDEN: Caller cannot specify a different operator ID than authenticated user (%)', v_operator_id USING ERRCODE = '42501';
    END IF;
  ELSE
    -- If auth.uid() is NULL, verify execution is running from a trusted backend system context.
    -- Note: Because this function is SECURITY DEFINER, current_user switches to postgres.
    -- We must evaluate session_user, current_setting('role'), and request.jwt.claim.role to verify actual caller trust.
    v_is_trusted_context := (
      -- 1. PostgREST service_role request: session_user is authenticator, active database role is service_role, and claim is service_role
      (
        session_user = 'authenticator' AND
        COALESCE(current_setting('role', true), '') = 'service_role' AND
        current_setting('request.jwt.claim.role', true) = 'service_role'
      )
      OR
      -- 2. Direct internal backend / migration connection (postgres, supabase_admin, or service_role)
      (
        session_user IN ('service_role', 'postgres', 'supabase_admin') AND
        COALESCE(current_setting('role', true), '') NOT IN ('anon', 'authenticated') AND
        COALESCE(current_setting('request.jwt.claim.role', true), '') NOT IN ('anon', 'authenticated')
      )
    );

    IF NOT v_is_trusted_context THEN
      RAISE EXCEPTION 'UNAUTHORIZED: Invoice voiding requires an authenticated Super Admin session or trusted service_role execution context.' USING ERRCODE = '42501';
    END IF;

    -- In trusted backend context, explicit operator attribution is required
    v_operator_id := p_operator_id;
  END IF;

  IF v_operator_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Operator identification required to void an invoice.' USING ERRCODE = '42501';
  END IF;

  -- 2. Verify operator's active Super Admin role directly in profiles database table
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = v_operator_id AND role = 'super_admin'
  ) THEN
    RAISE EXCEPTION 'FORBIDDEN: Operator % is not an active Super Administrator.', v_operator_id USING ERRCODE = '42501';
  END IF;

  -- 3. Perform atomic update (immutability trigger enforces permitted fields only)
  UPDATE public.saas_invoices
  SET invoice_status = 'void',
      void_reason = trim(p_reason),
      voided_by = v_operator_id,
      voided_at = NOW()
  WHERE id = p_invoice_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'INVOICE_NOT_FOUND: Invoice % does not exist.', p_invoice_id;
  END IF;

  -- 4. Mark associated payment as void
  UPDATE public.saas_payments
  SET invoice_status = 'void',
      invoice_last_error = 'Invoice voided: ' || trim(p_reason)
  WHERE id = (SELECT saas_payment_id FROM public.saas_invoices WHERE id = p_invoice_id);
END;
$$;


-- ------------------------------------------------------------------------------
-- 4. COMMERCIAL INVOICE GENERATION ENGINE
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.generate_saas_commercial_invoice(
  p_payment_id UUID
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_payment RECORD;
  v_existing_inv RECORD;
  v_seller_json JSONB;
  v_customer_rec RECORD;
  v_cust_name TEXT;
  v_cust_email TEXT;
  v_cust_address TEXT;
  v_cust_state TEXT;
  v_cust_gstin TEXT;
  v_seq_val BIGINT;
  v_invoice_number TEXT;
  v_invoice_id UUID;
  v_gst_json JSONB;
  v_pricing_json JSONB;
  v_plan_key TEXT;
  v_plan_node JSONB;
  v_auth_base_paise BIGINT;
  v_is_gst_active BOOLEAN := FALSE;
  v_effective_reached BOOLEAN := TRUE;
  v_invoice_type TEXT;
  v_tax_type TEXT;
  v_gst_rate NUMERIC;
  v_supplier_gstin TEXT;
  v_pricing_mode TEXT;
  v_base_amount_paise BIGINT;
  v_cgst_amount_paise BIGINT;
  v_sgst_amount_paise BIGINT;
  v_igst_amount_paise BIGINT;
  v_total_amount_paise BIGINT;
  v_tax_paise BIGINT;
  v_is_intra_state BOOLEAN;
BEGIN
  -- 4.1 Validate input parameter
  IF p_payment_id IS NULL THEN
    RAISE EXCEPTION 'INVALID_PARAMETER: p_payment_id is required.';
  END IF;

  -- 4.2 Transaction-level advisory lock serializes generation for this payment
  PERFORM pg_advisory_xact_lock(hashtext('invoice_gen_' || p_payment_id::text));

  -- 4.3 Lock payment row and resolve subscription plan type
  SELECT p.*, s.staypilot_plan_type
  INTO v_payment
  FROM public.saas_payments p
  LEFT JOIN public.saas_subscriptions s ON p.razorpay_subscription_id = s.razorpay_subscription_id
  WHERE p.id = p_payment_id
  FOR UPDATE OF p;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'PAYMENT_NOT_FOUND: Payment % does not exist.', p_payment_id;
  END IF;

  -- 4.4 Mandatory Protection: Fail closed on unmigrated historical payments
  IF v_payment.environment IS NULL OR v_payment.invoice_status IS NULL THEN
    RAISE EXCEPTION 'HISTORICAL_PAYMENT_PROTECTED: Payment % is an unmigrated historical payment and cannot be invoiced.', p_payment_id;
  END IF;

  -- 4.5 Idempotency & Voided Invoice Protection Check
  SELECT id, invoice_status INTO v_existing_inv
  FROM public.saas_invoices
  WHERE saas_payment_id = p_payment_id;

  IF FOUND THEN
    -- Voided invoice protection: never resurrect voided invoice or mark payment as 'issued'
    IF v_existing_inv.invoice_status = 'void' THEN
      IF v_payment.invoice_status <> 'void' THEN
        UPDATE public.saas_payments
        SET invoice_status = 'void',
            invoice_last_error = 'Invoice has been voided and cannot be re-issued'
        WHERE id = p_payment_id;
      END IF;
      RETURN v_existing_inv.id;
    END IF;

    -- Existing active invoice
    IF v_payment.invoice_status <> 'issued' THEN
      UPDATE public.saas_payments
      SET invoice_status = 'issued',
          invoice_last_error = NULL
      WHERE id = p_payment_id;
    END IF;
    RETURN v_existing_inv.id;
  END IF;

  -- 4.6 Validate payment state and prerequisites
  IF v_payment.status NOT IN ('captured', 'paid') THEN
    RAISE EXCEPTION 'PAYMENT_NOT_CAPTURED: Payment % has status % (must be captured or paid).', p_payment_id, v_payment.status;
  END IF;

  IF v_payment.environment NOT IN ('test', 'live') THEN
    RAISE EXCEPTION 'INVALID_ENVIRONMENT: Payment % has invalid environment %.', p_payment_id, v_payment.environment;
  END IF;

  IF v_payment.amount IS NULL OR v_payment.amount <= 0 OR v_payment.amount <> trunc(v_payment.amount) THEN
    RAISE EXCEPTION 'INVALID_AMOUNT: Payment % has invalid amount % (positive integer paise required).', p_payment_id, v_payment.amount;
  END IF;

  IF v_payment.currency IS NULL OR upper(trim(v_payment.currency)) <> 'INR' THEN
    RAISE EXCEPTION 'INVALID_CURRENCY: Payment % currency is % (expected INR).', p_payment_id, v_payment.currency;
  END IF;

  IF v_payment.tenant_id IS NULL THEN
    RAISE EXCEPTION 'MISSING_TENANT: Payment % has no associated tenant_id.', p_payment_id;
  END IF;

  -- 4.7 Authoritative Seller Identity Resolution (Canonical Super Admin Profile)
  SELECT global_settings->'seller_identity', global_settings->'pricing', global_settings->'gst_configuration'
  INTO v_seller_json, v_pricing_json, v_gst_json
  FROM public.profiles
  WHERE id = '9c4e65f5-c0a1-4b3a-8ed2-d01175a73409'::uuid
    AND role = 'super_admin';

  IF v_seller_json IS NULL OR
     NULLIF(trim(v_seller_json->>'legal_name'), '') IS NULL OR
     NULLIF(trim(v_seller_json->>'address'), '') IS NULL OR
     NULLIF(trim(v_seller_json->>'city'), '') IS NULL OR
     NULLIF(trim(v_seller_json->>'state'), '') IS NULL OR
     NULLIF(trim(v_seller_json->>'pincode'), '') IS NULL OR
     NULLIF(trim(v_seller_json->>'email'), '') IS NULL THEN
    RAISE EXCEPTION 'MISSING_SELLER_IDENTITY: Incomplete or unconfigured seller identity in canonical Super Admin profile (9c4e65f5-c0a1-4b3a-8ed2-d01175a73409).';
  END IF;

  -- 4.8 Customer Billing Details Resolution (Strictly Verified — Zero Fabricated Fallbacks)
  SELECT
    r.name as resort_name,
    r.email as resort_email,
    r.address as resort_address,
    p.full_name as profile_full_name,
    p.email as profile_email,
    p.global_settings->'billing' as billing_json
  INTO v_customer_rec
  FROM public.profiles p
  LEFT JOIN public.resorts r ON (r.tenant_id = p.id)
  WHERE p.id = v_payment.tenant_id
  ORDER BY r.created_at ASC
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'MISSING_BILLING_DETAILS: Tenant profile % not found.', v_payment.tenant_id;
  END IF;

  v_cust_name := COALESCE(
    NULLIF(trim(v_customer_rec.billing_json->>'name'), ''),
    NULLIF(trim(v_customer_rec.resort_name), ''),
    NULLIF(trim(v_customer_rec.profile_full_name), '')
  );

  v_cust_email := COALESCE(
    NULLIF(trim(v_customer_rec.billing_json->>'email'), ''),
    NULLIF(trim(v_customer_rec.resort_email), ''),
    NULLIF(trim(v_customer_rec.profile_email), '')
  );

  v_cust_address := COALESCE(
    NULLIF(trim(v_customer_rec.billing_json->>'address'), ''),
    NULLIF(trim(v_customer_rec.resort_address), '')
  );

  v_cust_state := COALESCE(
    NULLIF(trim(v_customer_rec.billing_json->>'state'), ''),
    NULLIF(trim(v_customer_rec.billing_json->>'state_name'), '')
  );

  v_cust_gstin := NULLIF(trim(v_customer_rec.billing_json->>'gstin'), '');

  IF v_cust_name IS NULL OR v_cust_email IS NULL OR v_cust_address IS NULL OR v_cust_state IS NULL THEN
    RAISE EXCEPTION 'MISSING_BILLING_DETAILS: Tenant % lacks verified billing details (name, email, address, and state required; no fabricated fallbacks permitted).', v_payment.tenant_id;
  END IF;

  -- 4.9 Sequence and Numbering Namespaces (Dual Isolated Sequences)
  IF v_payment.environment = 'live' THEN
    v_seq_val := nextval('public.saas_invoice_number_seq_live');
    v_invoice_number := 'SP-INV-' || TO_CHAR(NOW(), 'YYYY') || '-' || LPAD(v_seq_val::text, 5, '0');
  ELSE
    v_seq_val := nextval('public.saas_invoice_number_seq_test');
    v_invoice_number := 'SP-TEST-INV-' || TO_CHAR(NOW(), 'YYYY') || '-' || LPAD(v_seq_val::text, 5, '0');
  END IF;

  -- 4.10 Fail-Safe GST Evaluation
  v_is_gst_active := FALSE;
  BEGIN
    IF v_gst_json IS NOT NULL AND jsonb_typeof(v_gst_json) = 'object' THEN
      v_effective_reached := TRUE;
      IF NULLIF(trim(v_gst_json->>'effective_from'), '') IS NOT NULL THEN
        v_effective_reached := ((v_gst_json->>'effective_from')::timestamptz <= NOW());
      END IF;

      IF COALESCE((v_gst_json->>'enabled')::boolean, false) = true AND
         COALESCE(v_gst_json->>'status', 'draft') = 'active' AND
         v_effective_reached = true AND
         (v_gst_json->>'rate_percent') ~ '^[0-9]+(\.[0-9]+)?$' AND
         (v_gst_json->>'rate_percent')::numeric > 0 AND
         (v_gst_json->>'rate_percent')::numeric <= 50 AND
         COALESCE(v_gst_json->>'pricing_mode', '') IN ('inclusive', 'exclusive') AND
         NULLIF(trim(v_gst_json->>'gstin'), '') IS NOT NULL AND
         UPPER(trim(v_gst_json->>'gstin')) ~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$' THEN
        v_is_gst_active := TRUE;
      END IF;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    v_is_gst_active := FALSE;
  END;

  IF v_is_gst_active THEN
    v_invoice_type := 'tax_invoice';
    v_gst_rate := (v_gst_json->>'rate_percent')::numeric;
    v_supplier_gstin := trim(v_gst_json->>'gstin');
    v_pricing_mode := lower(trim(v_gst_json->>'pricing_mode'));

    -- Resolve authoritative base price from canonical pricing configuration
    v_plan_key := lower(trim(COALESCE(v_payment.staypilot_plan_type, 'growth')));
    v_plan_node := NULL;
    IF v_pricing_json IS NOT NULL AND jsonb_typeof(v_pricing_json) = 'object' THEN
      IF v_pricing_json ? v_plan_key THEN
        v_plan_node := v_pricing_json->v_plan_key;
      ELSIF v_plan_key IN ('growth', 'pro') AND v_pricing_json ? 'pro' THEN
        v_plan_node := v_pricing_json->'pro';
      ELSIF v_plan_key IN ('growth', 'pro') AND v_pricing_json ? 'growth' THEN
        v_plan_node := v_pricing_json->'growth';
      ELSIF v_plan_key IN ('solo') AND v_pricing_json ? 'custom_1786983013013' THEN
        v_plan_node := v_pricing_json->'custom_1786983013013';
      ELSIF v_plan_key IN ('premium', 'staymaster') AND v_pricing_json ? 'premium' THEN
        v_plan_node := v_pricing_json->'premium';
      ELSIF v_plan_key IN ('premium', 'staymaster') AND v_pricing_json ? 'staymaster' THEN
        v_plan_node := v_pricing_json->'staymaster';
      END IF;
    END IF;

    v_auth_base_paise := NULL;
    IF v_plan_node IS NOT NULL THEN
      IF jsonb_typeof(v_plan_node) = 'number' THEN
        v_auth_base_paise := ROUND((v_plan_node::text)::numeric * 100)::bigint;
      ELSIF jsonb_typeof(v_plan_node) = 'object' THEN
        IF COALESCE((v_plan_node->>'offerActive')::boolean, false) = true AND
           v_plan_node->>'offerPrice' IS NOT NULL THEN
          v_auth_base_paise := ROUND((v_plan_node->>'offerPrice')::numeric * 100)::bigint;
        ELSE
          v_auth_base_paise := ROUND(COALESCE((v_plan_node->>'monthlyPrice')::numeric, (v_plan_node->>'price')::numeric, (v_plan_node->>'offerPrice')::numeric, 0) * 100)::bigint;
        END IF;
      END IF;
    END IF;

    IF v_pricing_mode = 'exclusive' THEN
      -- Authoritative Exclusive Pricing Mode:
      -- In exclusive mode, GST is added ON TOP of the authoritative base price.
      -- The captured Razorpay payment MUST equal: base_amount_paise + ROUND(base_amount_paise * (rate / 100)).
      -- A mismatch must NOT silently switch to inclusive calculation; it must fail closed and enter manual_review.
      IF v_auth_base_paise IS NULL OR v_auth_base_paise <= 0 THEN
        RAISE EXCEPTION 'EXCLUSIVE_PRICING_MISMATCH: Authoritative base price for plan % not found in Super Admin pricing configuration.',
          COALESCE(v_payment.staypilot_plan_type, 'unknown') USING ERRCODE = '22023';
      END IF;

      v_base_amount_paise := v_auth_base_paise;
      v_tax_paise := ROUND(v_base_amount_paise * (v_gst_rate / 100.0))::bigint;
      v_total_amount_paise := v_base_amount_paise + v_tax_paise;

      IF v_total_amount_paise <> v_payment.amount::bigint THEN
        RAISE EXCEPTION 'EXCLUSIVE_PRICING_MISMATCH: Exclusive total (% base + % GST = %) does not match captured Razorpay payment amount (%). Silent inclusive fallback prohibited.',
          v_base_amount_paise, v_tax_paise, v_total_amount_paise, v_payment.amount USING ERRCODE = '22023';
      END IF;
    ELSE
      -- Inclusive pricing mode (default)
      v_total_amount_paise := v_payment.amount::bigint;
      v_base_amount_paise := ROUND(v_total_amount_paise::numeric / (1.0 + (v_gst_rate / 100.0)))::bigint;
      v_tax_paise := v_total_amount_paise - v_base_amount_paise;
    END IF;

    -- Financial reconciliation assertions: zero rounding drift
    IF (v_base_amount_paise + v_tax_paise) <> v_total_amount_paise THEN
      RAISE EXCEPTION 'RECONCILIATION_ERROR: Base amount (%) plus tax (%) does not equal total (%)',
        v_base_amount_paise, v_tax_paise, v_total_amount_paise;
    END IF;

    IF v_total_amount_paise <> v_payment.amount::bigint THEN
      RAISE EXCEPTION 'RECONCILIATION_ERROR: Invoice total (%) does not match captured Razorpay payment amount (%)',
        v_total_amount_paise, v_payment.amount;
    END IF;

    -- Intra-state (CGST + SGST) vs Inter-state (IGST)
    v_is_intra_state := (v_seller_json->>'state_code' IS NOT NULL AND v_cust_state IS NOT NULL AND
                         (trim(lower(v_seller_json->>'state')) = trim(lower(v_cust_state)) OR
                          trim(v_seller_json->>'state_code') = trim(COALESCE(v_customer_rec.billing_json->>'state_code', ''))));

    IF v_is_intra_state THEN
      v_tax_type := 'intra_state';
      v_cgst_amount_paise := ROUND(v_tax_paise / 2.0)::bigint;
      v_sgst_amount_paise := v_tax_paise - v_cgst_amount_paise;
      v_igst_amount_paise := 0;
    ELSE
      v_tax_type := 'inter_state';
      v_cgst_amount_paise := 0;
      v_sgst_amount_paise := 0;
      v_igst_amount_paise := v_tax_paise;
    END IF;
  ELSE
    -- Non-GST Commercial Invoicing
    v_invoice_type := 'commercial_invoice';
    v_tax_type := 'unregistered';
    v_gst_rate := 0;
    v_base_amount_paise := v_payment.amount::bigint;
    v_cgst_amount_paise := 0;
    v_sgst_amount_paise := 0;
    v_igst_amount_paise := 0;
    v_total_amount_paise := v_payment.amount::bigint;
    v_supplier_gstin := NULL;
  END IF;

  -- 4.11 Insert Immutable Commercial or Tax Invoice Record
  INSERT INTO public.saas_invoices (
    invoice_number,
    tenant_id,
    payment_id,
    subscription_id,
    environment,
    plan_type,
    supplier_name,
    supplier_legal_name,
    supplier_trade_name,
    supplier_gstin,
    supplier_address,
    supplier_city,
    supplier_state,
    supplier_state_code,
    supplier_pincode,
    supplier_email,
    supplier_phone,
    supplier_pan,
    seller_snapshot,
    sac_code,
    customer_name,
    customer_email,
    customer_gstin,
    customer_address,
    customer_state,
    supply_place,
    tax_type,
    base_amount_paise,
    gst_rate,
    cgst_amount_paise,
    sgst_amount_paise,
    igst_amount_paise,
    total_amount_paise,
    razorpay_payment_id,
    saas_payment_id,
    invoice_type,
    invoice_status,
    issued_at,
    created_at
  ) VALUES (
    v_invoice_number,
    v_payment.tenant_id,
    v_payment.razorpay_payment_id,
    COALESCE(v_payment.razorpay_subscription_id, 'manual'),
    v_payment.environment,
    COALESCE(v_payment.staypilot_plan_type, 'growth'),
    COALESCE(v_seller_json->>'trade_name', 'Stay Pilot'),
    v_seller_json->>'legal_name',
    COALESCE(v_seller_json->>'trade_name', 'Stay Pilot'),
    v_supplier_gstin,
    v_seller_json->>'address',
    v_seller_json->>'city',
    v_seller_json->>'state',
    v_seller_json->>'state_code',
    v_seller_json->>'pincode',
    v_seller_json->>'email',
    v_seller_json->>'phone',
    v_seller_json->>'pan',
    v_seller_json,
    COALESCE(v_seller_json->>'sac_code', '998313'),
    v_cust_name,
    v_cust_email,
    v_cust_gstin,
    v_cust_address,
    v_cust_state,
    v_cust_state,
    v_tax_type,
    v_base_amount_paise,
    v_gst_rate,
    v_cgst_amount_paise,
    v_sgst_amount_paise,
    v_igst_amount_paise,
    v_total_amount_paise,
    v_payment.razorpay_payment_id,
    v_payment.id,
    v_invoice_type,
    'issued',
    NOW(),
    NOW()
  ) RETURNING id INTO v_invoice_id;

  -- 4.12 Update Payment Invoicing Status
  UPDATE public.saas_payments
  SET invoice_status = 'issued',
      invoice_last_error = NULL
  WHERE id = p_payment_id;

  RETURN v_invoice_id;
END;
$$;


-- ------------------------------------------------------------------------------
-- 5. RECONCILED WEBHOOK HANDLER: public.process_subscription_webhook
-- ------------------------------------------------------------------------------
-- Derived directly from active production RPC definition (pg_get_functiondef).
-- Enforces:
--   - Event ordering: delayed authenticated events cannot overwrite active/terminal states.
--   - Stale cancellation guards: cannot regress active renewed subscriptions.
--   - Payment reconciliation: updates existing non-captured payments to captured safely.
--   - Rejects conflicting tenant, environment, amount, currency, or subscription data.
--   - Fail-closed historical payment protection (environment IS NULL).
--   - Cheerful Chalet lifetime entitlement strictly protected.
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
  v_existing_payment RECORD;
  v_payment_id_internal UUID;
  v_payment_row RECORD;
  v_stale_activation BOOLEAN := FALSE;
  v_stale_cancellation BOOLEAN := FALSE;
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

  -- Validate payment amount if parameter is supplied
  IF p_amount IS NOT NULL AND p_amount <= 0 THEN
    RETURN jsonb_build_object('status', 'rejected', 'reason', 'Invalid payment amount');
  END IF;

  -- Monotonic timestamp guard: do not regress current_period_end. No invented 30-day fallbacks.
  IF p_current_end IS NOT NULL AND v_sub.current_period_end IS NOT NULL AND p_current_end < v_sub.current_period_end THEN
    v_new_period_end := v_sub.current_period_end;
  ELSE
    v_new_period_end := COALESCE(p_current_end, v_sub.current_period_end);
  END IF;

  -- 1. Mandate Authentication Event (subscription.authenticated)
  -- DOES NOT activate paid entitlement. Prevent delayed event from regressing active or terminal states.
  IF p_event_type = 'subscription.authenticated' THEN
    IF v_sub.status NOT IN ('active', 'cancelled', 'halted', 'completed') THEN
      UPDATE public.saas_subscriptions
      SET status = 'authenticated',
          checkout_token = NULL,
          checkout_expires_at = NULL
      WHERE id = v_sub.id;
    ELSE
      -- Clean up any residual checkout tokens without regressing subscription status
      UPDATE public.saas_subscriptions
      SET checkout_token = NULL,
          checkout_expires_at = NULL
      WHERE id = v_sub.id AND (checkout_token IS NOT NULL OR checkout_expires_at IS NOT NULL);
    END IF;

  -- 2. Verified Payment Capture & Activation Events
  ELSIF p_event_type IN ('subscription.activated', 'subscription.charged', 'verify_capture') THEN
    -- Enforce Captured Payment: Require non-NULL captured/paid payment status to grant paid access
    IF p_payment_status IS NULL OR p_payment_status NOT IN ('captured', 'paid') THEN
      RETURN jsonb_build_object('status', 'rejected', 'reason', 'Captured payment status required to grant paid access');
    END IF;

    -- Stale activation guard: do not reactivate halted/cancelled subscription unless new period_end is strictly greater
    IF v_sub.status IN ('halted', 'cancelled') AND p_current_end IS NOT NULL AND p_current_end <= v_sub.current_period_end THEN
      v_stale_activation := TRUE;
    ELSE
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
    END IF;

  -- 3. Cancellation Events
  ELSIF p_event_type = 'subscription.cancelled' THEN
    -- Stale cancellation guard: do not regress active subscription if event period_end is older than current period_end
    IF v_sub.status = 'active' AND p_current_end IS NOT NULL AND v_sub.current_period_end IS NOT NULL AND p_current_end < v_sub.current_period_end THEN
      v_stale_cancellation := TRUE;
    ELSE
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

  -- 5. Captured-Payment Reconciliation & Invoicing
  IF p_payment_id IS NOT NULL THEN
    SELECT * INTO v_existing_payment
    FROM public.saas_payments
    WHERE razorpay_payment_id = p_payment_id
    FOR UPDATE;

    IF FOUND THEN
      -- Historical Payment Protection: never modify protected historical records (all 8 historical records have environment IS NULL)
      IF v_existing_payment.environment IS NULL THEN
        RAISE EXCEPTION 'HISTORICAL_PAYMENT_PROTECTED: Cannot modify protected historical payment record %', p_payment_id;
      END IF;

      -- Conflict Detection: reject conflicting tenant, environment, amount, currency, or subscription
      IF v_existing_payment.tenant_id <> v_sub.tenant_id THEN
        RETURN jsonb_build_object('status', 'rejected', 'reason', 'Conflicting tenant ID for payment ' || p_payment_id);
      END IF;

      IF v_existing_payment.environment <> p_event_env THEN
        RETURN jsonb_build_object('status', 'rejected', 'reason', 'Conflicting environment for payment ' || p_payment_id);
      END IF;

      IF p_amount IS NOT NULL AND v_existing_payment.amount <> p_amount THEN
        RETURN jsonb_build_object('status', 'rejected', 'reason', 'Conflicting payment amount for payment ' || p_payment_id);
      END IF;

      IF p_currency IS NOT NULL AND UPPER(trim(v_existing_payment.currency)) <> UPPER(trim(p_currency)) THEN
        RETURN jsonb_build_object('status', 'rejected', 'reason', 'Conflicting payment currency for payment ' || p_payment_id);
      END IF;

      IF v_existing_payment.razorpay_subscription_id IS NOT NULL AND v_existing_payment.razorpay_subscription_id <> p_razorpay_sub_id THEN
        RETURN jsonb_build_object('status', 'rejected', 'reason', 'Conflicting subscription ID for payment ' || p_payment_id);
      END IF;

      -- Transition non-captured payment to captured in place
      IF v_existing_payment.status NOT IN ('captured', 'paid') AND p_payment_status IN ('captured', 'paid') THEN
        UPDATE public.saas_payments
        SET status = p_payment_status,
            payment_method = COALESCE(p_payment_method, payment_method),
            razorpay_invoice_id = COALESCE(p_invoice_id, razorpay_invoice_id),
            invoice_status = 'pending'
        WHERE id = v_existing_payment.id;
      END IF;

      v_payment_id_internal := v_existing_payment.id;
    ELSE
      -- Insert new payment row
      INSERT INTO public.saas_payments (
        tenant_id, razorpay_payment_id, razorpay_subscription_id,
        razorpay_invoice_id, amount, currency, status, payment_method,
        environment, invoice_status
      ) VALUES (
        v_sub.tenant_id, p_payment_id, p_razorpay_sub_id,
        p_invoice_id, p_amount, p_currency, p_payment_status, p_payment_method,
        p_event_env,
        CASE WHEN p_payment_status IN ('captured', 'paid') THEN 'pending' ELSE 'unprocessed' END
      ) RETURNING id INTO v_payment_id_internal;
    END IF;

    -- Query payment row for invoicing eligibility
    SELECT id, environment, invoice_status, status
    INTO v_payment_row
    FROM public.saas_payments
    WHERE id = v_payment_id_internal;

    -- Only attempt automatic generation for captured, new/eligible payments
    IF v_payment_row.id IS NOT NULL
       AND v_payment_row.status IN ('captured', 'paid')
       AND v_payment_row.environment IS NOT NULL
       AND v_payment_row.invoice_status IN ('pending', 'failed') THEN
      BEGIN
        PERFORM public.generate_saas_commercial_invoice(v_payment_row.id);
      EXCEPTION WHEN OTHERS THEN
        UPDATE public.saas_payments
        SET invoice_status = CASE
              WHEN SQLERRM LIKE '%MISSING_BILLING_DETAILS%' 
                OR SQLERRM LIKE '%MISSING_SELLER_IDENTITY%'
                OR SQLERRM LIKE '%EXCLUSIVE_PRICING_MISMATCH%'
                OR SQLERRM LIKE '%RECONCILIATION_ERROR%' THEN 'manual_review'
              ELSE 'failed'
            END,
            invoice_last_error = SQLERRM,
            invoice_retry_count = invoice_retry_count + 1,
            invoice_next_retry_at = NOW() + INTERVAL '15 minutes'
        WHERE id = v_payment_row.id;
      END;
    END IF;
  END IF;

  -- Return appropriate event status
  IF v_stale_activation THEN
    RETURN jsonb_build_object('status', 'ignored', 'reason', 'Stale activation event for terminated subscription');
  ELSIF v_stale_cancellation THEN
    RETURN jsonb_build_object('status', 'ignored', 'reason', 'Stale cancellation event for active subscription');
  ELSIF p_event_type = 'subscription.authenticated' THEN
    RETURN jsonb_build_object('status', 'success', 'reason', 'Mandate authenticated, awaiting captured payment');
  END IF;

  RETURN jsonb_build_object('status', 'success', 'environment', p_event_env);
END;
$function$;


-- ------------------------------------------------------------------------------
-- 6. SECURITY DEFINER PRIVILEGES & ACCESS CONTROL
-- ------------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.enforce_saas_invoice_immutability() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.void_saas_invoice(UUID, TEXT, UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.generate_saas_commercial_invoice(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.process_subscription_webhook(text, text, text, text, timestamptz, timestamptz, text, numeric, text, text, text, text) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.enforce_saas_invoice_immutability() TO service_role;
GRANT EXECUTE ON FUNCTION public.void_saas_invoice(UUID, TEXT, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.generate_saas_commercial_invoice(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.process_subscription_webhook(text, text, text, text, timestamptz, timestamptz, text, numeric, text, text, text, text) TO service_role;

COMMIT;
