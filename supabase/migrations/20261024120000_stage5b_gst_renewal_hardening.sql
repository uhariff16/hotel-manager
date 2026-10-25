-- ============================================================
-- STAY PILOT — STAGE 5B: GST TRANSITION & SUBSCRIPTION RENEWAL HARDENING
-- MIGRATION: 20261024120000_stage5b_gst_renewal_hardening.sql
-- DESCRIPTION: Non-breaking Policy C fixed-gross legacy renewal support,
--              fail-safe non-GST commercial invoicing, and strict tax consistency
-- ============================================================

-- 1. BACKWARD-COMPATIBLE SCHEMA EXTENSIONS
-- Pure non-mutating schema additions: zero row updates, zero unverified defaults.
ALTER TABLE public.saas_subscriptions
  ADD COLUMN IF NOT EXISTS authorized_amount_paise BIGINT,
  ADD COLUMN IF NOT EXISTS tax_policy TEXT DEFAULT 'standard',
  ADD COLUMN IF NOT EXISTS pricing_mode TEXT;

ALTER TABLE public.saas_invoices
  ADD COLUMN IF NOT EXISTS tax_policy TEXT DEFAULT 'standard',
  ADD COLUMN IF NOT EXISTS pricing_mode TEXT;

-- Check constraint on saas_subscriptions tax_policy (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'saas_subscriptions_tax_policy_check'
  ) THEN
    ALTER TABLE public.saas_subscriptions
      ADD CONSTRAINT saas_subscriptions_tax_policy_check
      CHECK (tax_policy IS NULL OR tax_policy IN ('standard', 'fixed_gross', 'manual_review', 'non_gst'));
  END IF;
END $$;

-- 2. HARDENED INVOICING ENGINE WITH POLICY C (FIXED-GROSS LEGACY RENEWAL) SUPPORT
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
  v_pricing_json JSONB;
  v_gst_json JSONB;
  v_numbering_json JSONB;
  v_website_pricing_json JSONB;
  v_customer_rec RECORD;
  v_cust_name TEXT;
  v_cust_email TEXT;
  v_cust_address TEXT;
  v_cust_state TEXT;
  v_cust_gstin TEXT;

  -- Dynamic Numbering Variables
  v_env TEXT;
  v_env_numbering JSONB;
  v_prefix TEXT;
  v_year_format TEXT;
  v_year_part TEXT := '';
  v_padding INTEGER := 5;
  v_seq_val BIGINT;
  v_invoice_number TEXT;
  v_invoice_id UUID;

  -- GST & Financial Variables
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

  -- Stage 5B: Policy Tracking Variables
  v_applied_tax_policy TEXT := 'standard';
  v_applied_pricing_mode TEXT := 'exclusive';
  v_legacy_renewal_policy TEXT := 'fixed_gross';
  v_is_legacy_renewal BOOLEAN := FALSE;
  v_gst_activation_time TIMESTAMPTZ;
  v_trusted_authorized_paise BIGINT;
BEGIN
  -- 1. Validate input parameter
  IF p_payment_id IS NULL THEN
    RAISE EXCEPTION 'INVALID_PARAMETER: p_payment_id is required.';
  END IF;

  -- 2. Transaction-level advisory lock serializes generation for this payment
  PERFORM pg_advisory_xact_lock(hashtext('invoice_gen_' || p_payment_id::text));

  -- 3. Lock payment row and resolve subscription metadata
  SELECT
    p.*,
    s.id as subscription_row_id,
    s.staypilot_plan_type,
    s.created_at as sub_created_at,
    s.authorized_amount_paise as sub_authorized_amount_paise,
    s.tax_policy as sub_tax_policy,
    s.pricing_mode as sub_pricing_mode
  INTO v_payment
  FROM public.saas_payments p
  LEFT JOIN public.saas_subscriptions s ON p.razorpay_subscription_id = s.razorpay_subscription_id
  WHERE p.id = p_payment_id
  FOR UPDATE OF p;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'PAYMENT_NOT_FOUND: Payment % does not exist.', p_payment_id;
  END IF;

  -- 4. Mandatory Protection: Fail closed on unmigrated historical payments
  IF v_payment.environment IS NULL OR v_payment.invoice_status IS NULL THEN
    RAISE EXCEPTION 'HISTORICAL_PAYMENT_PROTECTED: Payment % is an unmigrated historical payment and cannot be invoiced.', p_payment_id;
  END IF;

  -- 5. Idempotency & Voided Invoice Protection Check
  SELECT id, invoice_status INTO v_existing_inv
  FROM public.saas_invoices
  WHERE saas_payment_id = p_payment_id;

  IF FOUND THEN
    IF v_existing_inv.invoice_status = 'void' THEN
      IF v_payment.invoice_status <> 'void' THEN
        UPDATE public.saas_payments
        SET invoice_status = 'void',
            invoice_last_error = 'Invoice has been voided and cannot be re-issued'
        WHERE id = p_payment_id;
      END IF;
      RETURN v_existing_inv.id;
    END IF;

    IF v_payment.invoice_status <> 'issued' THEN
      UPDATE public.saas_payments
      SET invoice_status = 'issued',
          invoice_last_error = NULL
      WHERE id = p_payment_id;
    END IF;
    RETURN v_existing_inv.id;
  END IF;

  -- 6. Validate payment state and prerequisites
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

  -- 7. Authoritative Seller Identity & Numbering Resolution (Canonical Super Admin Profile)
  SELECT
    global_settings->'seller_identity',
    global_settings->'pricing',
    global_settings->'gst_configuration',
    global_settings->'invoice_numbering',
    global_settings->'website_pricing'
  INTO
    v_seller_json,
    v_pricing_json,
    v_gst_json,
    v_numbering_json,
    v_website_pricing_json
  FROM public.profiles
  WHERE id = '9c4e65f5-c0a1-4b3a-8ed2-d01175a73409'::uuid
    AND role = 'super_admin';

  IF v_seller_json IS NULL THEN
    v_seller_json := jsonb_build_object('trade_name', 'Stay Pilot');
  END IF;

  -- 8. Customer Billing Details Resolution
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

  -- 9. Sequence and Dynamic Numbering Allocation (Dual Isolated Sequences)
  v_env := lower(trim(v_payment.environment));
  v_env_numbering := COALESCE(v_numbering_json->v_env, '{}'::jsonb);

  IF v_env = 'live' THEN
    v_prefix := COALESCE(NULLIF(trim(v_env_numbering->>'prefix'), ''), 'SP-INV-');
    v_seq_val := nextval('public.saas_invoice_number_seq_live');
  ELSE
    v_prefix := COALESCE(NULLIF(trim(v_env_numbering->>'prefix'), ''), 'SP-TEST-INV-');
    v_seq_val := nextval('public.saas_invoice_number_seq_test');
  END IF;

  v_year_format := upper(COALESCE(trim(v_env_numbering->>'year_format'), 'YYYY'));
  v_padding := COALESCE((v_env_numbering->>'padding')::integer, 5);
  IF v_padding < 3 OR v_padding > 10 THEN
    v_padding := 5;
  END IF;

  IF v_year_format = 'YYYY' THEN
    v_year_part := TO_CHAR(NOW(), 'YYYY') || '-';
  ELSIF v_year_format = 'YY' THEN
    v_year_part := TO_CHAR(NOW(), 'YY') || '-';
  ELSE
    v_year_part := '';
  END IF;

  v_invoice_number := v_prefix || v_year_part || LPAD(v_seq_val::text, v_padding, '0');

  -- 10. Fail-Safe GST Evaluation
  v_is_gst_active := FALSE;
  BEGIN
    IF v_gst_json IS NOT NULL AND jsonb_typeof(v_gst_json) = 'object' THEN
      v_effective_reached := TRUE;
      IF NULLIF(trim(v_gst_json->>'effective_from'), '') IS NOT NULL THEN
        -- Evaluate against payment transaction time to protect delayed webhook processing
        v_effective_reached := ((v_gst_json->>'effective_from')::timestamptz <= v_payment.created_at);
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
    -- In GST mode, statutory seller details are mandatory
    IF NULLIF(trim(v_seller_json->>'legal_name'), '') IS NULL OR
       NULLIF(trim(v_seller_json->>'address'), '') IS NULL OR
       NULLIF(trim(v_seller_json->>'city'), '') IS NULL OR
       NULLIF(trim(v_seller_json->>'state'), '') IS NULL OR
       NULLIF(trim(v_seller_json->>'pincode'), '') IS NULL THEN
      RAISE EXCEPTION 'MISSING_SELLER_IDENTITY: GST tax invoice requires seller legal name, address, city, state, and pincode.';
    END IF;

    v_invoice_type := 'tax_invoice';
    v_gst_rate := (v_gst_json->>'rate_percent')::numeric;
    v_supplier_gstin := trim(v_gst_json->>'gstin');
    IF v_payment.sub_pricing_mode IN ('exclusive', 'inclusive') THEN
      v_pricing_mode := lower(trim(v_payment.sub_pricing_mode));
    ELSE
      v_pricing_mode := lower(trim(COALESCE(v_gst_json->>'pricing_mode', 'exclusive')));
    END IF;
    v_applied_pricing_mode := v_pricing_mode;

    -- Authoritative Base Price Resolution
    -- Supports direct pricing keys, pricing.plans, pricing.published, and website_pricing.published
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
      ELSIF v_pricing_json ? 'plans' AND jsonb_typeof(v_pricing_json->'plans') = 'object' THEN
        IF (v_pricing_json->'plans') ? v_plan_key THEN
          v_plan_node := (v_pricing_json->'plans')->v_plan_key;
        ELSIF v_plan_key IN ('growth', 'pro') AND (v_pricing_json->'plans') ? 'pro' THEN
          v_plan_node := (v_pricing_json->'plans')->'pro';
        ELSIF v_plan_key IN ('growth', 'pro') AND (v_pricing_json->'plans') ? 'growth' THEN
          v_plan_node := (v_pricing_json->'plans')->'growth';
        ELSIF v_plan_key IN ('solo') AND (v_pricing_json->'plans') ? 'custom_1786983013013' THEN
          v_plan_node := (v_pricing_json->'plans')->'custom_1786983013013';
        ELSIF v_plan_key IN ('premium', 'staymaster') AND (v_pricing_json->'plans') ? 'premium' THEN
          v_plan_node := (v_pricing_json->'plans')->'premium';
        ELSIF v_plan_key IN ('premium', 'staymaster') AND (v_pricing_json->'plans') ? 'staymaster' THEN
          v_plan_node := (v_pricing_json->'plans')->'staymaster';
        END IF;
      ELSIF v_pricing_json ? 'published' AND jsonb_typeof(v_pricing_json->'published') = 'object' THEN
        IF (v_pricing_json->'published') ? v_plan_key THEN
          v_plan_node := (v_pricing_json->'published')->v_plan_key;
        ELSIF v_plan_key IN ('growth', 'pro') AND (v_pricing_json->'published') ? 'pro' THEN
          v_plan_node := (v_pricing_json->'published')->'pro';
        ELSIF v_plan_key IN ('growth', 'pro') AND (v_pricing_json->'published') ? 'growth' THEN
          v_plan_node := (v_pricing_json->'published')->'growth';
        ELSIF v_plan_key IN ('solo') AND (v_pricing_json->'published') ? 'custom_1786983013013' THEN
          v_plan_node := (v_pricing_json->'published')->'custom_1786983013013';
        ELSIF v_plan_key IN ('premium', 'staymaster') AND (v_pricing_json->'published') ? 'premium' THEN
          v_plan_node := (v_pricing_json->'published')->'premium';
        ELSIF v_plan_key IN ('premium', 'staymaster') AND (v_pricing_json->'published') ? 'staymaster' THEN
          v_plan_node := (v_pricing_json->'published')->'staymaster';
        END IF;
      END IF;
    END IF;

    -- Website pricing fallback
    IF v_plan_node IS NULL AND v_website_pricing_json IS NOT NULL AND jsonb_typeof(v_website_pricing_json->'published') = 'object' THEN
      IF (v_website_pricing_json->'published') ? v_plan_key THEN
        v_plan_node := (v_website_pricing_json->'published')->v_plan_key;
      ELSIF v_plan_key IN ('growth', 'pro') AND (v_website_pricing_json->'published') ? 'pro' THEN
        v_plan_node := (v_website_pricing_json->'published')->'pro';
      ELSIF v_plan_key IN ('growth', 'pro') AND (v_website_pricing_json->'published') ? 'growth' THEN
        v_plan_node := (v_website_pricing_json->'published')->'growth';
      ELSIF v_plan_key IN ('solo') AND (v_website_pricing_json->'published') ? 'custom_1786983013013' THEN
        v_plan_node := (v_website_pricing_json->'published')->'custom_1786983013013';
      ELSIF v_plan_key IN ('premium', 'staymaster') AND (v_website_pricing_json->'published') ? 'premium' THEN
        v_plan_node := (v_website_pricing_json->'published')->'premium';
      ELSIF v_plan_key IN ('premium', 'staymaster') AND (v_website_pricing_json->'published') ? 'staymaster' THEN
        v_plan_node := (v_website_pricing_json->'published')->'staymaster';
      END IF;
    END IF;

    v_auth_base_paise := NULL;
    IF v_plan_node IS NOT NULL THEN
      IF jsonb_typeof(v_plan_node) = 'number' THEN
        v_auth_base_paise := ROUND((v_plan_node::text)::numeric * 100)::bigint;
      ELSIF jsonb_typeof(v_plan_node) = 'object' THEN
        IF COALESCE((v_plan_node->>'offerActive')::boolean, false) = true AND
           NULLIF(trim(v_plan_node->>'offerPrice'), '') IS NOT NULL THEN
          v_auth_base_paise := ROUND((v_plan_node->>'offerPrice')::numeric * 100)::bigint;
        ELSIF COALESCE((v_plan_node->>'offerActive')::boolean, false) = true AND
              NULLIF(trim(v_plan_node->>'promotionalPrice'), '') IS NOT NULL THEN
          v_auth_base_paise := ROUND((v_plan_node->>'promotionalPrice')::numeric * 100)::bigint;
        ELSE
          v_auth_base_paise := ROUND(COALESCE(
            NULLIF(trim(v_plan_node->>'monthlyPrice'), '')::numeric,
            NULLIF(trim(v_plan_node->>'price'), '')::numeric,
            NULLIF(trim(v_plan_node->>'originalPrice'), '')::numeric,
            NULLIF(trim(v_plan_node->>'offerPrice'), '')::numeric,
            0
          ) * 100)::bigint;
        END IF;
      END IF;
    END IF;

    -- Stage 5B: Resolve GST Activation Timestamp for Historical Boundary Checks
    v_gst_activation_time := NULL;
    IF NULLIF(trim(v_gst_json->>'effective_from'), '') IS NOT NULL THEN
      BEGIN
        v_gst_activation_time := (v_gst_json->>'effective_from')::timestamptz;
      EXCEPTION WHEN OTHERS THEN
        v_gst_activation_time := NULL;
      END;
    END IF;
    IF v_gst_activation_time IS NULL AND NULLIF(trim(v_gst_json->>'updated_at'), '') IS NOT NULL THEN
      BEGIN
        v_gst_activation_time := (v_gst_json->>'updated_at')::timestamptz;
      EXCEPTION WHEN OTHERS THEN
        v_gst_activation_time := NULL;
      END;
    END IF;

    v_legacy_renewal_policy := lower(trim(COALESCE(v_gst_json->>'legacy_renewal_policy', 'fixed_gross')));
    v_is_legacy_renewal := FALSE;
    v_applied_tax_policy := 'standard';

    IF v_pricing_mode = 'exclusive' THEN
      IF v_auth_base_paise IS NULL OR v_auth_base_paise <= 0 THEN
        RAISE EXCEPTION 'EXCLUSIVE_PRICING_MISMATCH: Authoritative base price for plan % not found in Super Admin pricing configuration.',
          COALESCE(v_payment.staypilot_plan_type, 'unknown') USING ERRCODE = '22023';
      END IF;

      v_base_amount_paise := v_auth_base_paise;
      v_tax_paise := ROUND(v_base_amount_paise * (v_gst_rate / 100.0))::bigint;
      v_total_amount_paise := v_base_amount_paise + v_tax_paise;

      IF v_total_amount_paise <> v_payment.amount::bigint THEN
        -- STAGE 5B.1: TRUSTED AUTHORIZED AMOUNT & MULTI-CYCLE ELIGIBILITY RESOLUTION
        -- Resolve trusted authorized amount from subscription record or earliest captured payment
        v_trusted_authorized_paise := v_payment.sub_authorized_amount_paise;

        IF v_trusted_authorized_paise IS NULL AND v_payment.razorpay_subscription_id IS NOT NULL THEN
          SELECT amount::bigint INTO v_trusted_authorized_paise
          FROM public.saas_payments
          WHERE razorpay_subscription_id = v_payment.razorpay_subscription_id
            AND status IN ('captured', 'paid')
            AND id <> p_payment_id
          ORDER BY created_at ASC
          LIMIT 1;
        END IF;

        -- Check Policy C eligibility:
        -- 1. Super Admin policy allows fixed_gross legacy renewals.
        -- 2. Subscription was NOT created under GST pricing (sub_pricing_mode is NOT 'exclusive' or 'inclusive')
        --    UNLESS explicitly set to fixed_gross by admin.
        -- 3. Subscription originated prior to this GST activation period (or sub_tax_policy is 'fixed_gross' / 'non_gst').
        -- 4. Trusted authorized amount exists from historical records and strictly matches captured payment.
        --    Catalog price fallback is explicitly prohibited to prevent incorrect classification on changed catalog pricing.
        IF (
          v_legacy_renewal_policy = 'fixed_gross'
          AND (
            v_payment.sub_tax_policy = 'fixed_gross'
            OR (
              COALESCE(v_payment.sub_pricing_mode, 'none') NOT IN ('exclusive', 'inclusive')
              AND (
                (v_payment.sub_tax_policy = 'non_gst')
                OR (
                  v_payment.sub_created_at IS NOT NULL
                  AND v_gst_activation_time IS NOT NULL
                  AND v_payment.sub_created_at < v_gst_activation_time
                )
                OR (
                  v_payment.sub_created_at IS NOT NULL
                  AND v_payment.sub_created_at < (v_payment.created_at - INTERVAL '1 day')
                )
              )
            )
          )
          AND v_trusted_authorized_paise IS NOT NULL
          AND v_payment.amount::bigint = v_trusted_authorized_paise
        ) THEN
          -- Approved Policy C: Account for GST within fixed collected amount
          v_is_legacy_renewal := TRUE;
          v_applied_tax_policy := 'fixed_gross';
          v_applied_pricing_mode := 'inclusive_mandate';
          v_total_amount_paise := v_payment.amount::bigint;
          v_base_amount_paise := ROUND(v_total_amount_paise::numeric / (1.0 + (v_gst_rate / 100.0)))::bigint;
          v_tax_paise := v_total_amount_paise - v_base_amount_paise;

          -- Cache trusted authorized amount on subscription if previously null
          IF v_payment.sub_authorized_amount_paise IS NULL AND v_payment.subscription_row_id IS NOT NULL THEN
            UPDATE public.saas_subscriptions
            SET authorized_amount_paise = v_trusted_authorized_paise,
                tax_policy = 'fixed_gross',
                updated_at = NOW()
            WHERE id = v_payment.subscription_row_id;
          END IF;
        ELSE
          RAISE EXCEPTION 'EXCLUSIVE_PRICING_MISMATCH: Exclusive total (% base + % GST = %) does not match captured Razorpay payment amount (%). Silent inclusive fallback prohibited.',
            v_base_amount_paise, v_tax_paise, v_total_amount_paise, v_payment.amount USING ERRCODE = '22023';
        END IF;
      END IF;
    ELSE
      -- Standard Inclusive Mode (Policy B)
      v_applied_tax_policy := 'standard';
      v_applied_pricing_mode := 'inclusive';
      v_total_amount_paise := v_payment.amount::bigint;
      v_base_amount_paise := ROUND(v_total_amount_paise::numeric / (1.0 + (v_gst_rate / 100.0)))::bigint;
      v_tax_paise := v_total_amount_paise - v_base_amount_paise;
    END IF;

    IF (v_base_amount_paise + v_tax_paise) <> v_total_amount_paise THEN
      RAISE EXCEPTION 'RECONCILIATION_ERROR: Base amount (%) plus tax (%) does not equal total (%)',
        v_base_amount_paise, v_tax_paise, v_total_amount_paise;
    END IF;

    IF v_total_amount_paise <> v_payment.amount::bigint THEN
      RAISE EXCEPTION 'RECONCILIATION_ERROR: Invoice total (%) does not match captured Razorpay payment amount (%)',
        v_total_amount_paise, v_payment.amount;
    END IF;

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
    -- Non-GST Commercial Invoicing (Policy A)
    -- Guard against misclassifying taxable payments if GST was subsequently disabled:
    IF v_payment.sub_pricing_mode IN ('exclusive', 'inclusive') THEN
      RAISE EXCEPTION 'HISTORICAL_TAX_CONFIG_MISMATCH: Subscription was contracted with active GST pricing mode (%) but GST is currently inactive. Payment % requires manual review.',
        v_payment.sub_pricing_mode, p_payment_id USING ERRCODE = '22023';
    END IF;

    v_invoice_type := 'commercial_invoice';
    v_tax_type := 'unregistered';
    v_gst_rate := 0;
    v_base_amount_paise := v_payment.amount::bigint;
    v_cgst_amount_paise := 0;
    v_sgst_amount_paise := 0;
    v_igst_amount_paise := 0;
    v_total_amount_paise := v_payment.amount::bigint;
    v_supplier_gstin := NULL;
    v_applied_tax_policy := 'non_gst';
    v_applied_pricing_mode := 'none';
  END IF;

  -- 11. Insert Immutable Commercial or Tax Invoice Record
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
    tax_policy,
    pricing_mode,
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
    v_applied_tax_policy,
    v_applied_pricing_mode,
    NOW(),
    NOW()
  ) RETURNING id INTO v_invoice_id;

  -- 12. Update Payment Invoicing Status
  UPDATE public.saas_payments
  SET invoice_status = 'issued',
      invoice_last_error = NULL
  WHERE id = p_payment_id;

  RETURN v_invoice_id;
END;
$$;

DO $$
BEGIN
  REVOKE ALL ON FUNCTION public.generate_saas_commercial_invoice(UUID) FROM PUBLIC;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON FUNCTION public.generate_saas_commercial_invoice(UUID) FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON FUNCTION public.generate_saas_commercial_invoice(UUID) FROM authenticated;
  END IF;
END $$;
GRANT EXECUTE ON FUNCTION public.generate_saas_commercial_invoice(UUID) TO service_role;
