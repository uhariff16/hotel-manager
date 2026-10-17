-- ==============================================================================
-- MIGRATION: 20261017180000_tenant_billing_profile_management.sql
-- PURPOSE: Secure, hardened RPCs for Tenant Subscription Billing Management
-- TARGET: public.profiles.global_settings.billing & tenant_billing / tenant_gst
-- AUTHORIZATION: Authenticated tenant_admin / super_admin / billing_admin & service_role
-- SECURITY: Strictly verifies auth.uid(), enforces tenant isolation, auto-derives GST state codes, protects privilege escalation
-- ==============================================================================

-- Drop old single-argument signatures if they exist to avoid overloading confusion
DROP FUNCTION IF EXISTS public.save_tenant_billing_profile(jsonb);
DROP FUNCTION IF EXISTS public.save_tenant_billing_profile(jsonb, uuid);
DROP FUNCTION IF EXISTS public.get_tenant_billing_profile();
DROP FUNCTION IF EXISTS public.get_tenant_billing_profile(uuid);
DROP FUNCTION IF EXISTS public.save_tenant_guest_gst_settings(jsonb, jsonb);
DROP FUNCTION IF EXISTS public.save_tenant_guest_gst_settings(jsonb, jsonb, uuid);

-- 1. RPC: public.save_tenant_billing_profile
CREATE OR REPLACE FUNCTION public.save_tenant_billing_profile(
  p_billing jsonb,
  p_tenant_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid;
  v_user_role text;
  v_target_id uuid;
  v_is_service_role boolean := false;
  v_name text;
  v_email text;
  v_phone text;
  v_address_line1 text;
  v_address_line2 text;
  v_city text;
  v_state text;
  v_state_code text;
  v_pincode text;
  v_country text;
  v_gstin text;
  v_full_address text;
  v_clean_billing jsonb;
  v_old_settings jsonb;
  v_new_settings jsonb;
BEGIN
  -- 1. Authentication & Context Resolution
  BEGIN
    v_uid := auth.uid();
  EXCEPTION WHEN OTHERS THEN
    v_uid := NULL;
  END;

  -- Detect service_role or internal backend execution (aligned with Stage 3B trust model)
  IF (
       (session_user = 'authenticator' AND
        COALESCE(current_setting('role', true), '') = 'service_role' AND
        COALESCE(current_setting('request.jwt.claim.role', true), '') = 'service_role')
       OR
       (session_user IN ('service_role', 'postgres', 'supabase_admin') AND
        COALESCE(current_setting('role', true), '') NOT IN ('anon', 'authenticated') AND
        COALESCE(current_setting('request.jwt.claim.role', true), '') NOT IN ('anon', 'authenticated'))
     ) THEN
    v_is_service_role := true;
  END IF;

  IF v_uid IS NULL THEN
    IF NOT v_is_service_role THEN
      RAISE EXCEPTION 'UNAUTHENTICATED: Authentication required to update billing profile.'
        USING ERRCODE = '42501';
    END IF;

    -- In service_role context, target tenant ID is mandatory
    IF p_tenant_id IS NULL THEN
      RAISE EXCEPTION 'INVALID_ARGUMENT: p_tenant_id is required in service_role context.'
        USING ERRCODE = '22023';
    END IF;
    v_target_id := p_tenant_id;
  ELSE
    -- Authenticated user session
    SELECT role INTO v_user_role
    FROM public.profiles
    WHERE id = v_uid;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'USER_NOT_FOUND: User profile does not exist.'
        USING ERRCODE = '42501';
    END IF;

    IF v_user_role IN ('super_admin', 'billing_admin') THEN
      -- Privileged administrator may update their own or a delegated tenant profile
      v_target_id := COALESCE(p_tenant_id, v_uid);
    ELSIF v_user_role = 'tenant_admin' THEN
      -- Tenant admin can ONLY update their own profile (strictly prevent tenant spoofing)
      IF p_tenant_id IS NOT NULL AND p_tenant_id <> v_uid THEN
        RAISE EXCEPTION 'FORBIDDEN: Tenant administrators cannot modify billing profiles of other accounts.'
          USING ERRCODE = '42501';
      END IF;
      v_target_id := v_uid;
    ELSE
      RAISE EXCEPTION 'FORBIDDEN: Insufficient permissions to manage subscription billing details.'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  -- 2. Fetch existing target settings
  SELECT COALESCE(global_settings, '{}'::jsonb)
  INTO v_old_settings
  FROM public.profiles
  WHERE id = v_target_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'TARGET_NOT_FOUND: Target tenant % does not exist.', v_target_id
      USING ERRCODE = '22023';
  END IF;

  -- 3. Validate and extract required billing fields
  IF p_billing IS NULL OR jsonb_typeof(p_billing) != 'object' THEN
    RAISE EXCEPTION 'INVALID_ARGUMENT: Billing payload must be a valid JSON object.'
      USING ERRCODE = '22023';
  END IF;

  v_name := NULLIF(trim(p_billing->>'name'), '');
  IF v_name IS NULL OR length(v_name) < 2 OR length(v_name) > 200 THEN
    RAISE EXCEPTION 'INVALID_ARGUMENT: Billing name is required (between 2 and 200 characters).'
      USING ERRCODE = '22023';
  END IF;

  v_email := NULLIF(trim(lower(p_billing->>'email')), '');
  IF v_email IS NULL OR v_email !~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$' THEN
    RAISE EXCEPTION 'INVALID_ARGUMENT: A valid billing email is required.'
      USING ERRCODE = '22023';
  END IF;

  v_phone := NULLIF(trim(p_billing->>'phone'), '');
  IF v_phone IS NOT NULL AND length(v_phone) > 25 THEN
    RAISE EXCEPTION 'INVALID_ARGUMENT: Phone number cannot exceed 25 characters.'
      USING ERRCODE = '22023';
  END IF;

  v_address_line1 := NULLIF(trim(p_billing->>'address_line1'), '');
  IF v_address_line1 IS NULL AND NULLIF(trim(p_billing->>'address'), '') IS NOT NULL THEN
    v_address_line1 := trim(p_billing->>'address');
  END IF;

  IF v_address_line1 IS NULL OR length(v_address_line1) < 3 OR length(v_address_line1) > 300 THEN
    RAISE EXCEPTION 'INVALID_ARGUMENT: Address line 1 is required (between 3 and 300 characters).'
      USING ERRCODE = '22023';
  END IF;

  v_address_line2 := NULLIF(trim(p_billing->>'address_line2'), '');
  v_city := NULLIF(trim(p_billing->>'city'), '');
  IF v_city IS NULL OR length(v_city) < 2 OR length(v_city) > 100 THEN
    RAISE EXCEPTION 'INVALID_ARGUMENT: City is required.'
      USING ERRCODE = '22023';
  END IF;

  v_state := NULLIF(trim(p_billing->>'state'), '');
  IF v_state IS NULL OR length(v_state) < 2 OR length(v_state) > 100 THEN
    RAISE EXCEPTION 'INVALID_ARGUMENT: State is required.'
      USING ERRCODE = '22023';
  END IF;

  -- Auto-resolve or validate 2-digit GST state code
  v_state_code := NULLIF(trim(p_billing->>'state_code'), '');
  IF v_state_code IS NULL THEN
    v_state_code := CASE lower(trim(v_state))
      WHEN 'jammu and kashmir' THEN '01'
      WHEN 'himachal pradesh' THEN '02'
      WHEN 'punjab' THEN '03'
      WHEN 'chandigarh' THEN '04'
      WHEN 'uttarakhand' THEN '05'
      WHEN 'haryana' THEN '06'
      WHEN 'delhi' THEN '07'
      WHEN 'rajasthan' THEN '08'
      WHEN 'uttar pradesh' THEN '09'
      WHEN 'bihar' THEN '10'
      WHEN 'sikkim' THEN '11'
      WHEN 'arunachal pradesh' THEN '12'
      WHEN 'nagaland' THEN '13'
      WHEN 'manipur' THEN '14'
      WHEN 'mizoram' THEN '15'
      WHEN 'tripura' THEN '16'
      WHEN 'meghalaya' THEN '17'
      WHEN 'assam' THEN '18'
      WHEN 'west bengal' THEN '19'
      WHEN 'jharkhand' THEN '20'
      WHEN 'odisha' THEN '21'
      WHEN 'chhattisgarh' THEN '22'
      WHEN 'madhya pradesh' THEN '23'
      WHEN 'gujarat' THEN '24'
      WHEN 'dadra and nagar haveli and daman and diu' THEN '26'
      WHEN 'maharashtra' THEN '27'
      WHEN 'andhra pradesh' THEN '28'
      WHEN 'karnataka' THEN '29'
      WHEN 'goa' THEN '30'
      WHEN 'lakshadweep' THEN '31'
      WHEN 'kerala' THEN '32'
      WHEN 'tamil nadu' THEN '33'
      WHEN 'puducherry' THEN '34'
      WHEN 'andaman and nicobar islands' THEN '35'
      WHEN 'telangana' THEN '36'
      WHEN 'andhra pradesh (new)' THEN '37'
      WHEN 'ladakh' THEN '38'
      ELSE NULL
    END;
  ELSE
    IF v_state_code !~ '^[0-9]{2}$' THEN
      RAISE EXCEPTION 'INVALID_ARGUMENT: State code must be a valid 2-digit GST code.'
        USING ERRCODE = '22023';
    END IF;
  END IF;

  v_pincode := NULLIF(trim(p_billing->>'pincode'), '');
  IF v_pincode IS NULL OR v_pincode !~ '^[0-9]{6}$' THEN
    RAISE EXCEPTION 'INVALID_ARGUMENT: A valid 6-digit PIN code is required.'
      USING ERRCODE = '22023';
  END IF;

  v_country := COALESCE(NULLIF(trim(p_billing->>'country'), ''), 'India');

  v_gstin := NULLIF(trim(upper(p_billing->>'gstin')), '');
  IF v_gstin IS NOT NULL AND v_gstin !~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$' THEN
    RAISE EXCEPTION 'INVALID_ARGUMENT: Invalid GSTIN format.'
      USING ERRCODE = '22023';
  END IF;

  -- 4. Construct authoritative single-line address string
  IF v_address_line2 IS NOT NULL THEN
    v_full_address := v_address_line1 || ', ' || v_address_line2 || ', ' || v_city || ', ' || v_state || ' ' || v_pincode;
  ELSE
    v_full_address := v_address_line1 || ', ' || v_city || ', ' || v_state || ' ' || v_pincode;
  END IF;

  -- 5. Construct sanitized billing object (strictly conforms to generate_saas_commercial_invoice contract)
  v_clean_billing := jsonb_build_object(
    'name', v_name,
    'email', v_email,
    'phone', v_phone,
    'address', v_full_address,
    'address_line1', v_address_line1,
    'address_line2', v_address_line2,
    'city', v_city,
    'state', v_state,
    'state_code', v_state_code,
    'pincode', v_pincode,
    'country', v_country,
    'gstin', v_gstin,
    'updated_at', NOW()
  );

  -- 6. Apply scoped update to profiles.global_settings.billing
  v_new_settings := jsonb_set(
    v_old_settings,
    '{billing}',
    v_clean_billing,
    true
  );

  -- Transaction-scoped bypass allows updating global_settings without weakening trigger
  PERFORM set_config('app.allow_profile_system_update', 'true', true);

  UPDATE public.profiles
  SET global_settings = v_new_settings
  WHERE id = v_target_id;

  RETURN jsonb_build_object(
    'status', 'success',
    'tenant_id', v_target_id,
    'billing', v_clean_billing
  );
END;
$$;

-- 2. RPC: public.get_tenant_billing_profile
CREATE OR REPLACE FUNCTION public.get_tenant_billing_profile(
  p_tenant_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid;
  v_user_role text;
  v_target_id uuid;
  v_is_service_role boolean := false;
  v_billing jsonb;
BEGIN
  BEGIN
    v_uid := auth.uid();
  EXCEPTION WHEN OTHERS THEN
    v_uid := NULL;
  END;

  IF (
       (session_user = 'authenticator' AND
        COALESCE(current_setting('role', true), '') = 'service_role' AND
        COALESCE(current_setting('request.jwt.claim.role', true), '') = 'service_role')
       OR
       (session_user IN ('service_role', 'postgres', 'supabase_admin') AND
        COALESCE(current_setting('role', true), '') NOT IN ('anon', 'authenticated') AND
        COALESCE(current_setting('request.jwt.claim.role', true), '') NOT IN ('anon', 'authenticated'))
     ) THEN
    v_is_service_role := true;
  END IF;

  IF v_uid IS NULL THEN
    IF NOT v_is_service_role THEN
      RAISE EXCEPTION 'UNAUTHENTICATED: Authentication required.'
        USING ERRCODE = '42501';
    END IF;

    IF p_tenant_id IS NULL THEN
      RAISE EXCEPTION 'INVALID_ARGUMENT: p_tenant_id is required in service_role context.'
        USING ERRCODE = '22023';
    END IF;
    v_target_id := p_tenant_id;
  ELSE
    SELECT role INTO v_user_role
    FROM public.profiles
    WHERE id = v_uid;

    IF v_user_role IN ('super_admin', 'billing_admin') THEN
      v_target_id := COALESCE(p_tenant_id, v_uid);
    ELSIF v_user_role = 'tenant_admin' THEN
      IF p_tenant_id IS NOT NULL AND p_tenant_id <> v_uid THEN
        RAISE EXCEPTION 'FORBIDDEN: Tenant administrators cannot read billing profiles of other accounts.'
          USING ERRCODE = '42501';
      END IF;
      v_target_id := v_uid;
    ELSE
      RAISE EXCEPTION 'FORBIDDEN: Insufficient permissions.'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  SELECT global_settings->'billing'
  INTO v_billing
  FROM public.profiles
  WHERE id = v_target_id;

  RETURN COALESCE(v_billing, '{}'::jsonb);
END;
$$;

-- 3. RPC: public.save_tenant_guest_gst_settings
CREATE OR REPLACE FUNCTION public.save_tenant_guest_gst_settings(
  p_tenant_gst jsonb,
  p_tenant_billing jsonb DEFAULT NULL,
  p_tenant_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid;
  v_user_role text;
  v_target_id uuid;
  v_old_settings jsonb;
  v_new_settings jsonb;
BEGIN
  BEGIN
    v_uid := auth.uid();
  EXCEPTION WHEN OTHERS THEN
    v_uid := NULL;
  END;

  IF v_uid IS NULL THEN
    IF NOT (
         (session_user = 'authenticator' AND
          COALESCE(current_setting('role', true), '') = 'service_role' AND
          COALESCE(current_setting('request.jwt.claim.role', true), '') = 'service_role')
         OR
         (session_user IN ('service_role', 'postgres', 'supabase_admin') AND
          COALESCE(current_setting('role', true), '') NOT IN ('anon', 'authenticated') AND
          COALESCE(current_setting('request.jwt.claim.role', true), '') NOT IN ('anon', 'authenticated'))
       ) THEN
      RAISE EXCEPTION 'UNAUTHENTICATED: Authentication required.'
        USING ERRCODE = '42501';
    END IF;

    IF p_tenant_id IS NULL THEN
      RAISE EXCEPTION 'INVALID_ARGUMENT: p_tenant_id is required in service_role context.'
        USING ERRCODE = '22023';
    END IF;
    v_target_id := p_tenant_id;
  ELSE
    SELECT role INTO v_user_role
    FROM public.profiles
    WHERE id = v_uid;

    IF v_user_role IN ('super_admin', 'billing_admin') THEN
      v_target_id := COALESCE(p_tenant_id, v_uid);
    ELSIF v_user_role = 'tenant_admin' THEN
      IF p_tenant_id IS NOT NULL AND p_tenant_id <> v_uid THEN
        RAISE EXCEPTION 'FORBIDDEN: Only tenant administrators can update their own guest billing settings.'
          USING ERRCODE = '42501';
      END IF;
      v_target_id := v_uid;
    ELSE
      RAISE EXCEPTION 'FORBIDDEN: Insufficient permissions.'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  SELECT COALESCE(global_settings, '{}'::jsonb)
  INTO v_old_settings
  FROM public.profiles
  WHERE id = v_target_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'TARGET_NOT_FOUND: Target tenant % does not exist.', v_target_id
      USING ERRCODE = '22023';
  END IF;

  v_new_settings := v_old_settings;

  IF p_tenant_gst IS NOT NULL THEN
    v_new_settings := jsonb_set(v_new_settings, '{tenant_gst}', p_tenant_gst, true);
  END IF;

  IF p_tenant_billing IS NOT NULL THEN
    v_new_settings := jsonb_set(v_new_settings, '{tenant_billing}', p_tenant_billing, true);
  END IF;

  PERFORM set_config('app.allow_profile_system_update', 'true', true);

  UPDATE public.profiles
  SET global_settings = v_new_settings
  WHERE id = v_target_id;

  RETURN jsonb_build_object(
    'status', 'success',
    'tenant_id', v_target_id,
    'tenant_gst', v_new_settings->'tenant_gst',
    'tenant_billing', v_new_settings->'tenant_billing'
  );
END;
$$;

-- 4. Access control: execute only for authenticated and service_role
REVOKE ALL ON FUNCTION public.save_tenant_billing_profile(jsonb, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_tenant_billing_profile(jsonb, uuid) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.get_tenant_billing_profile(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_tenant_billing_profile(uuid) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.save_tenant_guest_gst_settings(jsonb, jsonb, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_tenant_guest_gst_settings(jsonb, jsonb, uuid) TO authenticated, service_role;
