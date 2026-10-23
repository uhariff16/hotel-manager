-- Rollback Migration: rollback_20261023120000_align_public_website_config_canonical_admin.sql
-- Description: Revert get_public_website_config to oldest super_admin lookup and restore update_saas_global_configuration

-- ============================================================
-- STAY PILOT — SECURE PUBLIC WEBSITE CONFIG RPC & PROFILES RLS HARDENING
-- MIGRATION: 20261007224500_secure_public_config_and_profiles_rls.sql
-- ============================================================

-- 1. Create SECURITY DEFINER helper to prevent policy recursion
CREATE OR REPLACE FUNCTION public.get_auth_tenant_id()
RETURNS UUID AS $$
  SELECT tenant_id FROM public.profiles WHERE id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION public.get_auth_tenant_id() TO authenticated, service_role;

-- 2. Create Public Website Configuration RPC (SECURITY DEFINER)
CREATE OR REPLACE FUNCTION public.get_public_website_config()
RETURNS JSONB AS $$
DECLARE
  v_settings JSONB;
BEGIN
  -- Deterministic selection of master Super Admin profile with global settings
  SELECT global_settings INTO v_settings
  FROM public.profiles
  WHERE role = 'super_admin'
    AND global_settings IS NOT NULL
    AND jsonb_typeof(global_settings) = 'object'
    AND global_settings ? 'pricing'
  ORDER BY created_at ASC
  LIMIT 1;

  IF v_settings IS NULL THEN
    RETURN jsonb_build_object(
      'pricing', NULL,
      'website_pricing', NULL,
      'landing_page', NULL,
      'onboarding_wizard_enabled', true
    );
  END IF;

  RETURN jsonb_build_object(
    'pricing', v_settings -> 'pricing',
    'website_pricing', v_settings -> 'website_pricing',
    'landing_page', v_settings -> 'landing_page',
    'onboarding_wizard_enabled', COALESCE((v_settings ->> 'onboarding_wizard_enabled')::boolean, true)
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION public.get_public_website_config() TO anon, authenticated, service_role;

-- 3. Harden public.profiles RLS SELECT policy
DROP POLICY IF EXISTS "Users view global team" ON public.profiles;
DROP POLICY IF EXISTS "Users view team profiles" ON public.profiles;

CREATE POLICY "Users view team profiles" ON public.profiles
FOR SELECT
TO public
USING (
  auth.role() = 'authenticated'
  AND (
    public.is_super_admin()
    OR auth.uid() = id
    OR auth.uid() = tenant_id
    OR tenant_id = public.get_auth_tenant_id()
  )
);


CREATE OR REPLACE FUNCTION public.update_saas_global_configuration(
  p_section text,
  p_seller_identity jsonb DEFAULT NULL,
  p_gst_configuration jsonb DEFAULT NULL,
  p_tax_settings jsonb DEFAULT NULL,
  p_pricing jsonb DEFAULT NULL,
  p_website_pricing jsonb DEFAULT NULL,
  p_razorpay_settings jsonb DEFAULT NULL,
  p_email_templates jsonb DEFAULT NULL,
  p_landing_page jsonb DEFAULT NULL,
  p_features jsonb DEFAULT NULL,
  p_canonical_id uuid DEFAULT '9c4e65f5-c0a1-4b3a-8ed2-d01175a73409'::uuid,
  p_invoice_numbering jsonb DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  c_canonical_id CONSTANT uuid := '9c4e65f5-c0a1-4b3a-8ed2-d01175a73409'::uuid;
  v_caller_id uuid;
  v_existing_settings jsonb;
  v_new_settings jsonb;
  v_effective_tax_settings jsonb;
  v_sanitized_razorpay jsonb;
  v_merged_pricing jsonb;
  v_merged_website jsonb;
  v_plan_key text;

  -- Numbering local variables
  v_merged_numbering jsonb;
  v_test_node jsonb;
  v_live_node jsonb;
  v_test_prefix text;
  v_live_prefix text;
  v_test_start bigint;
  v_live_start bigint;
  v_test_issued bigint;
  v_live_issued bigint;
  v_cur_test_seq bigint;
  v_cur_test_is_called boolean;
  v_cur_live_seq bigint;
  v_cur_live_is_called boolean;
BEGIN
  -- 1. Authorization: caller must be authenticated and verified super_admin in profiles table
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Authentication required.' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = v_caller_id AND role = 'super_admin'
  ) THEN
    RAISE EXCEPTION 'FORBIDDEN: Only Super Administrators can modify global configuration.' USING ERRCODE = '42501';
  END IF;

  -- 2. Fixed Canonical Target Enforcement
  IF p_canonical_id IS NOT NULL AND p_canonical_id <> c_canonical_id THEN
    RAISE EXCEPTION 'INVALID_TARGET: Target profile must match the canonical Super Admin profile (%).', c_canonical_id USING ERRCODE = '42501';
  END IF;

  -- Acquire row-level exclusive lock on canonical row
  SELECT global_settings INTO v_existing_settings
  FROM public.profiles
  WHERE id = c_canonical_id AND role = 'super_admin'
  FOR UPDATE;

  IF NOT FOUND OR v_existing_settings IS NULL THEN
    RAISE EXCEPTION 'CANONICAL_PROFILE_NOT_FOUND: The authoritative Super Admin configuration record (%) does not exist.', c_canonical_id USING ERRCODE = 'P0002';
  END IF;

  -- 3. Atomic JSONB Updates restricted strictly to allowed sections

  -- SECTION: invoice_numbering
  IF p_section = 'invoice_numbering' THEN
    IF p_invoice_numbering IS NULL OR jsonb_typeof(p_invoice_numbering) <> 'object' THEN
      RAISE EXCEPTION 'INVALID_ARGUMENT: p_invoice_numbering must be a non-null JSONB object.' USING ERRCODE = '22023';
    END IF;

    v_merged_numbering := COALESCE(v_existing_settings->'invoice_numbering', '{}'::jsonb);

    IF p_invoice_numbering ? 'test' THEN
      v_test_node := p_invoice_numbering->'test';
      IF jsonb_typeof(v_test_node) <> 'object' THEN
        RAISE EXCEPTION 'INVALID_ARGUMENT: test numbering configuration must be a JSONB object.' USING ERRCODE = '22023';
      END IF;

      v_test_prefix := trim(COALESCE(v_test_node->>'prefix', ''));
      IF v_test_prefix = '' OR length(v_test_prefix) > 25 OR NOT (v_test_prefix ~ '^[A-Za-z0-9\-_]+$') THEN
        RAISE EXCEPTION 'INVALID_ARGUMENT: TEST invoice prefix must be 1-25 characters containing letters, numbers, hyphens, or underscores.' USING ERRCODE = '22023';
      END IF;

      IF lower(COALESCE(v_test_node->>'year_format', 'yyyy')) NOT IN ('yyyy', 'yy', 'none') THEN
        RAISE EXCEPTION 'INVALID_ARGUMENT: TEST year_format must be YYYY, YY, or none.' USING ERRCODE = '22023';
      END IF;

      IF (v_test_node->>'padding')::integer < 3 OR (v_test_node->>'padding')::integer > 10 THEN
        RAISE EXCEPTION 'INVALID_ARGUMENT: TEST padding must be between 3 and 10.' USING ERRCODE = '22023';
      END IF;

      v_test_start := (v_test_node->>'starting_number')::bigint;
      IF v_test_start IS NULL OR v_test_start < 1 THEN
        RAISE EXCEPTION 'INVALID_ARGUMENT: TEST starting_number must be a positive integer (>= 1).' USING ERRCODE = '22023';
      END IF;

      -- Rewind protection check on TEST sequence
      SELECT count(*) INTO v_test_issued FROM public.saas_invoices WHERE environment = 'test';
      SELECT last_value INTO v_cur_test_seq
      FROM pg_sequences WHERE schemaname = 'public' AND sequencename = 'saas_invoice_number_seq_test';

      IF v_test_issued > 0 AND v_cur_test_seq IS NOT NULL AND v_test_start < (v_cur_test_seq + 1) THEN
        RAISE EXCEPTION 'CANNOT_REWIND_SEQUENCE: TEST starting number (%) cannot be lower than next sequence position (%). Active numbering series cannot be rewound.'
          , v_test_start, (v_cur_test_seq + 1) USING ERRCODE = '22023';
      END IF;

      -- If series has not issued records or starting_number was advanced, set sequence
      IF v_test_issued = 0 OR (v_cur_test_seq IS NOT NULL AND v_test_start > v_cur_test_seq) THEN
        PERFORM setval('public.saas_invoice_number_seq_test', v_test_start, false);
      END IF;

      v_merged_numbering := jsonb_set(
        v_merged_numbering,
        '{test}',
        v_test_node || jsonb_build_object('updated_at', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')),
        true
      );
    END IF;

    IF p_invoice_numbering ? 'live' THEN
      v_live_node := p_invoice_numbering->'live';
      IF jsonb_typeof(v_live_node) <> 'object' THEN
        RAISE EXCEPTION 'INVALID_ARGUMENT: live numbering configuration must be a JSONB object.' USING ERRCODE = '22023';
      END IF;

      v_live_prefix := trim(COALESCE(v_live_node->>'prefix', ''));
      IF v_live_prefix = '' OR length(v_live_prefix) > 25 OR NOT (v_live_prefix ~ '^[A-Za-z0-9\-_]+$') THEN
        RAISE EXCEPTION 'INVALID_ARGUMENT: LIVE invoice prefix must be 1-25 characters containing letters, numbers, hyphens, or underscores.' USING ERRCODE = '22023';
      END IF;

      IF lower(COALESCE(v_live_node->>'year_format', 'yyyy')) NOT IN ('yyyy', 'yy', 'none') THEN
        RAISE EXCEPTION 'INVALID_ARGUMENT: LIVE year_format must be YYYY, YY, or none.' USING ERRCODE = '22023';
      END IF;

      IF (v_live_node->>'padding')::integer < 3 OR (v_live_node->>'padding')::integer > 10 THEN
        RAISE EXCEPTION 'INVALID_ARGUMENT: LIVE padding must be between 3 and 10.' USING ERRCODE = '22023';
      END IF;

      v_live_start := (v_live_node->>'starting_number')::bigint;
      IF v_live_start IS NULL OR v_live_start < 1 THEN
        RAISE EXCEPTION 'INVALID_ARGUMENT: LIVE starting_number must be a positive integer (>= 1).' USING ERRCODE = '22023';
      END IF;

      -- Rewind protection check on LIVE sequence
      SELECT count(*) INTO v_live_issued FROM public.saas_invoices WHERE environment = 'live';
      SELECT last_value INTO v_cur_live_seq
      FROM pg_sequences WHERE schemaname = 'public' AND sequencename = 'saas_invoice_number_seq_live';

      IF v_live_issued > 0 AND v_cur_live_seq IS NOT NULL AND v_live_start < (v_cur_live_seq + 1) THEN
        RAISE EXCEPTION 'CANNOT_REWIND_SEQUENCE: LIVE starting number (%) cannot be lower than next sequence position (%). Active numbering series cannot be rewound.'
          , v_live_start, (v_cur_live_seq + 1) USING ERRCODE = '22023';
      END IF;

      IF v_live_issued = 0 OR (v_cur_live_seq IS NOT NULL AND v_live_start > v_cur_live_seq) THEN
        PERFORM setval('public.saas_invoice_number_seq_live', v_live_start, false);
      END IF;

      v_merged_numbering := jsonb_set(
        v_merged_numbering,
        '{live}',
        v_live_node || jsonb_build_object('updated_at', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')),
        true
      );
    END IF;

    -- Distinct prefix cross-environment validation
    v_test_prefix := trim(COALESCE(v_merged_numbering->'test'->>'prefix', 'SP-TEST-INV-'));
    v_live_prefix := trim(COALESCE(v_merged_numbering->'live'->>'prefix', 'SP-INV-'));
    IF upper(v_test_prefix) = upper(v_live_prefix) THEN
      RAISE EXCEPTION 'CONFLICTING_PREFIX: TEST and LIVE environments must have distinct prefixes to prevent overlapping invoice numbers.' USING ERRCODE = '22023';
    END IF;

    UPDATE public.profiles
    SET global_settings = jsonb_set(
      COALESCE(global_settings, '{}'::jsonb),
      '{invoice_numbering}',
      v_merged_numbering,
      true
    )
    WHERE id = c_canonical_id
    RETURNING global_settings INTO v_new_settings;

  -- SECTION: seller_identity
  ELSIF p_section = 'seller_identity' THEN
    IF p_seller_identity IS NULL OR jsonb_typeof(p_seller_identity) <> 'object' THEN
      RAISE EXCEPTION 'INVALID_ARGUMENT: p_seller_identity must be a non-null JSONB object.' USING ERRCODE = '22023';
    END IF;

    UPDATE public.profiles
    SET global_settings = jsonb_set(
      COALESCE(global_settings, '{}'::jsonb),
      '{seller_identity}',
      COALESCE(v_existing_settings->'seller_identity', '{}'::jsonb) || p_seller_identity,
      true
    )
    WHERE id = c_canonical_id
    RETURNING global_settings INTO v_new_settings;

  -- SECTION: gst_configuration
  ELSIF p_section = 'gst_configuration' THEN
    IF p_gst_configuration IS NULL OR jsonb_typeof(p_gst_configuration) <> 'object' THEN
      RAISE EXCEPTION 'INVALID_ARGUMENT: p_gst_configuration must be a non-null JSONB object.' USING ERRCODE = '22023';
    END IF;

    IF p_tax_settings IS NOT NULL AND jsonb_typeof(p_tax_settings) <> 'object' THEN
      RAISE EXCEPTION 'INVALID_ARGUMENT: p_tax_settings must be a JSONB object.' USING ERRCODE = '22023';
    END IF;

    IF p_gst_configuration->>'status' IS NOT NULL AND
       p_gst_configuration->>'status' NOT IN ('draft', 'pending_verification', 'active', 'disabled') THEN
      RAISE EXCEPTION 'INVALID_ARGUMENT: GST status must be one of draft, pending_verification, active, disabled (received: %).',
        p_gst_configuration->>'status'
      USING ERRCODE = '22023';
    END IF;

    IF COALESCE((p_gst_configuration->>'enabled')::boolean, false) = true AND
       COALESCE(p_gst_configuration->>'status', 'draft') = 'active' THEN

      IF p_gst_configuration->>'rate_percent' IS NULL OR
         NOT (p_gst_configuration->>'rate_percent' ~ '^\d+(\.\d{1,2})?$') OR
         (p_gst_configuration->>'rate_percent')::numeric <= 0 OR
         (p_gst_configuration->>'rate_percent')::numeric > 50 THEN
        RAISE EXCEPTION 'INVALID_ARGUMENT: GST percentage is required to enable GST and must be a number above 0 and at most 50 with max 2 decimals (received: %).',
          COALESCE(p_gst_configuration->>'rate_percent', 'null')
        USING ERRCODE = '22023';
      END IF;

      IF p_gst_configuration->>'pricing_mode' IS NULL OR
         p_gst_configuration->>'pricing_mode' NOT IN ('inclusive', 'exclusive') THEN
        RAISE EXCEPTION 'INVALID_ARGUMENT: Pricing mode is required to enable GST and must be either inclusive or exclusive (received: %).',
          COALESCE(p_gst_configuration->>'pricing_mode', 'null')
        USING ERRCODE = '22023';
      END IF;

      IF p_gst_configuration->>'gstin' IS NULL OR
         NOT (UPPER(TRIM(p_gst_configuration->>'gstin')) ~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$') THEN
        RAISE EXCEPTION 'INVALID_ARGUMENT: GSTIN is required to enable GST and must be 15 characters in official format (received: %).',
          COALESCE(p_gst_configuration->>'gstin', 'null')
        USING ERRCODE = '22023';
      END IF;

      IF NULLIF(TRIM(p_gst_configuration->>'effective_from'), '') IS NOT NULL THEN
        BEGIN
          PERFORM (p_gst_configuration->>'effective_from')::timestamptz;
        EXCEPTION WHEN OTHERS THEN
          RAISE EXCEPTION 'INVALID_ARGUMENT: Effective From must be a valid date and time (received: %).',
            p_gst_configuration->>'effective_from'
          USING ERRCODE = '22023';
        END;
      END IF;

      IF NULLIF(TRIM(v_existing_settings->'seller_identity'->>'legal_name'), '') IS NULL OR
         NULLIF(TRIM(v_existing_settings->'seller_identity'->>'address'), '') IS NULL OR
         NULLIF(TRIM(v_existing_settings->'seller_identity'->>'city'), '') IS NULL OR
         NULLIF(TRIM(v_existing_settings->'seller_identity'->>'state'), '') IS NULL OR
         NULLIF(TRIM(v_existing_settings->'seller_identity'->>'pincode'), '') IS NULL THEN
        RAISE EXCEPTION 'INVALID_ARGUMENT: Seller details required for GST activation are incomplete (legal_name, address, city, state, pincode).'
        USING ERRCODE = '22023';
      END IF;

      IF NULLIF(TRIM(v_existing_settings->'seller_identity'->>'state_code'), '') IS NOT NULL THEN
        IF SUBSTRING(UPPER(TRIM(p_gst_configuration->>'gstin')) FROM 1 FOR 2) <>
           LPAD(TRIM(v_existing_settings->'seller_identity'->>'state_code'), 2, '0') THEN
          RAISE EXCEPTION 'INVALID_ARGUMENT: GSTIN state code (%) does not match seller state code (%).',
            SUBSTRING(UPPER(TRIM(p_gst_configuration->>'gstin')) FROM 1 FOR 2),
            v_existing_settings->'seller_identity'->>'state_code'
          USING ERRCODE = '22023';
        END IF;
      END IF;
    END IF;

    v_effective_tax_settings := COALESCE(
      p_tax_settings,
      v_existing_settings->'tax_settings',
      '{}'::jsonb
    );

    IF COALESCE((p_gst_configuration->>'enabled')::boolean, false) = true AND
       COALESCE(p_gst_configuration->>'status', 'draft') = 'active' THEN
      v_effective_tax_settings := v_effective_tax_settings || jsonb_build_object(
        'enabled', true,
        'rate', (p_gst_configuration->>'rate_percent')::numeric,
        'gstin', UPPER(TRIM(p_gst_configuration->>'gstin')),
        'pricing_mode', p_gst_configuration->>'pricing_mode',
        'effective_from', p_gst_configuration->>'effective_from',
        'updated_at', COALESCE(p_gst_configuration->>'updated_at', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
      );
    ELSE
      v_effective_tax_settings := jsonb_set(
        v_effective_tax_settings,
        '{enabled}',
        'false'::jsonb,
        true
      );
      IF p_gst_configuration ? 'effective_from' THEN
        v_effective_tax_settings := jsonb_set(
          v_effective_tax_settings,
          '{effective_from}',
          COALESCE(to_jsonb(p_gst_configuration->>'effective_from'), 'null'::jsonb),
          true
        );
      END IF;
    END IF;

    UPDATE public.profiles
    SET global_settings = jsonb_set(
      jsonb_set(
        COALESCE(global_settings, '{}'::jsonb),
        '{gst_configuration}',
        p_gst_configuration,
        true
      ),
      '{tax_settings}',
      v_effective_tax_settings,
      true
    )
    WHERE id = c_canonical_id
    RETURNING global_settings INTO v_new_settings;

  -- SECTION: pricing
  ELSIF p_section = 'pricing' THEN
    IF p_pricing IS NULL OR jsonb_typeof(p_pricing) <> 'object' THEN
      RAISE EXCEPTION 'INVALID_ARGUMENT: p_pricing must be a non-null JSONB object.' USING ERRCODE = '22023';
    END IF;

    v_merged_pricing := COALESCE(v_existing_settings->'pricing', '{}'::jsonb);
    FOR v_plan_key IN SELECT jsonb_object_keys(p_pricing) LOOP
      IF jsonb_typeof(p_pricing->v_plan_key) = 'object' THEN
        IF jsonb_typeof(v_merged_pricing->v_plan_key) = 'object' THEN
          v_merged_pricing := jsonb_set(
            v_merged_pricing,
            ARRAY[v_plan_key],
            (v_merged_pricing->v_plan_key) || (p_pricing->v_plan_key),
            true
          );
        ELSE
          v_merged_pricing := jsonb_set(
            v_merged_pricing,
            ARRAY[v_plan_key],
            p_pricing->v_plan_key,
            true
          );
        END IF;
      ELSE
        v_merged_pricing := jsonb_set(
          v_merged_pricing,
          ARRAY[v_plan_key],
          p_pricing->v_plan_key,
          true
        );
      END IF;
    END LOOP;

    UPDATE public.profiles
    SET global_settings = jsonb_set(
      COALESCE(global_settings, '{}'::jsonb),
      '{pricing}',
      v_merged_pricing,
      true
    )
    WHERE id = c_canonical_id
    RETURNING global_settings INTO v_new_settings;

  -- SECTION: website_pricing
  ELSIF p_section = 'website_pricing' THEN
    IF p_website_pricing IS NULL OR jsonb_typeof(p_website_pricing) <> 'object' THEN
      RAISE EXCEPTION 'INVALID_ARGUMENT: p_website_pricing must be a non-null JSONB object.' USING ERRCODE = '22023';
    END IF;

    v_merged_website := COALESCE(v_existing_settings->'website_pricing', '{}'::jsonb) || p_website_pricing;

    IF NOT (p_website_pricing ? 'history') AND (v_existing_settings->'website_pricing' ? 'history') THEN
      v_merged_website := jsonb_set(
        v_merged_website,
        '{history}',
        v_existing_settings->'website_pricing'->'history',
        true
      );
    END IF;

    IF p_pricing IS NOT NULL AND jsonb_typeof(p_pricing) = 'object' THEN
      v_merged_pricing := COALESCE(v_existing_settings->'pricing', '{}'::jsonb);
      FOR v_plan_key IN SELECT jsonb_object_keys(p_pricing) LOOP
        IF jsonb_typeof(p_pricing->v_plan_key) = 'object' THEN
          IF jsonb_typeof(v_merged_pricing->v_plan_key) = 'object' THEN
            v_merged_pricing := jsonb_set(
              v_merged_pricing,
              ARRAY[v_plan_key],
              (v_merged_pricing->v_plan_key) || (p_pricing->v_plan_key),
              true
            );
          ELSE
            v_merged_pricing := jsonb_set(
              v_merged_pricing,
              ARRAY[v_plan_key],
              p_pricing->v_plan_key,
              true
            );
          END IF;
        ELSE
          v_merged_pricing := jsonb_set(
            v_merged_pricing,
            ARRAY[v_plan_key],
            p_pricing->v_plan_key,
            true
          );
        END IF;
      END LOOP;

      UPDATE public.profiles
      SET global_settings = jsonb_set(
        jsonb_set(
          COALESCE(global_settings, '{}'::jsonb),
          '{website_pricing}',
          v_merged_website,
          true
        ),
        '{pricing}',
        v_merged_pricing,
        true
      )
      WHERE id = c_canonical_id
      RETURNING global_settings INTO v_new_settings;
    ELSE
      UPDATE public.profiles
      SET global_settings = jsonb_set(
        COALESCE(global_settings, '{}'::jsonb),
        '{website_pricing}',
        v_merged_website,
        true
      )
      WHERE id = c_canonical_id
      RETURNING global_settings INTO v_new_settings;
    END IF;

  -- SECTION: razorpay_settings
  ELSIF p_section = 'razorpay_settings' THEN
    IF p_razorpay_settings IS NULL OR jsonb_typeof(p_razorpay_settings) <> 'object' THEN
      RAISE EXCEPTION 'INVALID_ARGUMENT: p_razorpay_settings must be a non-null JSONB object.' USING ERRCODE = '22023';
    END IF;

    IF p_razorpay_settings ?| ARRAY['testKeySecret', 'liveKeySecret', 'webhookSecret', 'secret', 'key_secret'] THEN
      RAISE EXCEPTION 'SECURITY_VIOLATION: Razorpay secret keys must never be stored in global_settings.' USING ERRCODE = '42501';
    END IF;

    v_sanitized_razorpay := COALESCE(v_existing_settings->'razorpay_settings', '{}'::jsonb) || p_razorpay_settings;
    v_sanitized_razorpay := v_sanitized_razorpay - 'testKeySecret' - 'liveKeySecret' - 'webhookSecret' - 'secret' - 'key_secret';

    IF v_sanitized_razorpay->>'mode' IS NOT NULL AND v_sanitized_razorpay->>'mode' NOT IN ('test', 'live') THEN
      RAISE EXCEPTION 'INVALID_ARGUMENT: Razorpay mode must be either test or live.' USING ERRCODE = '22023';
    END IF;

    UPDATE public.profiles
    SET global_settings = jsonb_set(
      COALESCE(global_settings, '{}'::jsonb),
      '{razorpay_settings}',
      v_sanitized_razorpay,
      true
    )
    WHERE id = c_canonical_id
    RETURNING global_settings INTO v_new_settings;

  -- SECTION: email_templates
  ELSIF p_section = 'email_templates' THEN
    IF p_email_templates IS NULL OR jsonb_typeof(p_email_templates) <> 'object' THEN
      RAISE EXCEPTION 'INVALID_ARGUMENT: p_email_templates must be a non-null JSONB object.' USING ERRCODE = '22023';
    END IF;

    UPDATE public.profiles
    SET global_settings = jsonb_set(
      COALESCE(global_settings, '{}'::jsonb),
      '{email_templates}',
      COALESCE(v_existing_settings->'email_templates', '{}'::jsonb) || p_email_templates,
      true
    )
    WHERE id = c_canonical_id
    RETURNING global_settings INTO v_new_settings;

  -- SECTION: landing_page
  ELSIF p_section = 'landing_page' THEN
    IF p_landing_page IS NULL OR jsonb_typeof(p_landing_page) <> 'object' THEN
      RAISE EXCEPTION 'INVALID_ARGUMENT: p_landing_page must be a non-null JSONB object.' USING ERRCODE = '22023';
    END IF;

    UPDATE public.profiles
    SET global_settings = jsonb_set(
      COALESCE(global_settings, '{}'::jsonb),
      '{landing_page}',
      COALESCE(v_existing_settings->'landing_page', '{}'::jsonb) || p_landing_page,
      true
    )
    WHERE id = c_canonical_id
    RETURNING global_settings INTO v_new_settings;

  -- SECTION: features
  ELSIF p_section = 'features' THEN
    IF p_features IS NULL OR jsonb_typeof(p_features) <> 'object' THEN
      RAISE EXCEPTION 'INVALID_ARGUMENT: p_features must be a non-null JSONB object.' USING ERRCODE = '22023';
    END IF;

    UPDATE public.profiles
    SET global_settings = jsonb_set(
      jsonb_set(
        jsonb_set(
          COALESCE(global_settings, '{}'::jsonb),
          '{comm_features_enabled}',
          COALESCE(p_features->'comm_features_enabled', v_existing_settings->'comm_features_enabled', 'true'::jsonb),
          true
        ),
        '{templates_enabled}',
        COALESCE(p_features->'templates_enabled', v_existing_settings->'templates_enabled', 'true'::jsonb),
        true
      ),
      '{onboarding_wizard_enabled}',
      COALESCE(p_features->'onboarding_wizard_enabled', v_existing_settings->'onboarding_wizard_enabled', 'true'::jsonb),
      true
    )
    WHERE id = c_canonical_id
    RETURNING global_settings INTO v_new_settings;

  -- SECTION: tax_settings
  ELSIF p_section = 'tax_settings' THEN
    IF p_tax_settings IS NULL OR jsonb_typeof(p_tax_settings) <> 'object' THEN
      RAISE EXCEPTION 'INVALID_ARGUMENT: p_tax_settings must be a non-null JSONB object.' USING ERRCODE = '22023';
    END IF;

    v_effective_tax_settings := COALESCE(v_existing_settings->'tax_settings', '{}'::jsonb) || p_tax_settings;

    IF COALESCE((v_existing_settings->'gst_configuration'->>'enabled')::boolean, false) = true AND
       COALESCE(v_existing_settings->'gst_configuration'->>'status', 'draft') = 'active' THEN
      v_effective_tax_settings := v_effective_tax_settings || jsonb_build_object(
        'enabled', true,
        'rate', COALESCE((v_existing_settings->'gst_configuration'->>'rate_percent')::numeric, 0),
        'gstin', COALESCE(v_existing_settings->'gst_configuration'->>'gstin', ''),
        'pricing_mode', COALESCE(v_existing_settings->'gst_configuration'->>'pricing_mode', 'exclusive')
      );
    ELSE
      v_effective_tax_settings := jsonb_set(
        v_effective_tax_settings,
        '{enabled}',
        'false'::jsonb,
        true
      );
    END IF;

    UPDATE public.profiles
    SET global_settings = jsonb_set(
      COALESCE(global_settings, '{}'::jsonb),
      '{tax_settings}',
      v_effective_tax_settings,
      true
    )
    WHERE id = c_canonical_id
    RETURNING global_settings INTO v_new_settings;

  ELSE
    RAISE EXCEPTION 'INVALID_SECTION: Unknown configuration section %. Allowed: invoice_numbering, seller_identity, gst_configuration, pricing, website_pricing, razorpay_settings, email_templates, landing_page, features, tax_settings.', p_section USING ERRCODE = '22023';
  END IF;

  RETURN v_new_settings;
END;
$$;

REVOKE ALL ON FUNCTION public.update_saas_global_configuration(text, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_saas_global_configuration(text, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, uuid, jsonb) TO authenticated;
