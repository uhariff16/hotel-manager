-- ============================================================
-- Migration: add_switch_trial_rpc.sql
-- Function: public.switch_trial_plan(text)
-- Purpose: Server-authoritative, fail-closed trial plan switching
-- ============================================================

CREATE OR REPLACE FUNCTION public.switch_trial_plan(p_destination_plan text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_profile public.profiles%ROWTYPE;
  v_is_paid boolean;
  v_pricing_json jsonb;
  v_dest_plan jsonb;
  v_enabled boolean;
  v_trial_enabled boolean;
  v_trial_days int;
BEGIN
  -- 1. AUTHENTICATION CHECK
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false, 
      'error', 'Authentication required.'
    );
  END IF;

  -- 2. PROFILE RESOLUTION & ROW LOCKING
  SELECT * INTO v_profile
  FROM public.profiles
  WHERE id = v_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false, 
      'error', 'Account profile not found.'
    );
  END IF;

  -- 3. TENANT OWNERSHIP & ROLE VALIDATION
  IF v_profile.role != 'tenant_admin' THEN
    RETURN jsonb_build_object(
      'success', false, 
      'error', 'Only Tenant Administrators can switch trial plans.'
    );
  END IF;

  IF v_profile.tenant_id IS DISTINCT FROM v_user_id THEN
    RETURN jsonb_build_object(
      'success', false, 
      'error', 'Unauthorized tenant ownership.'
    );
  END IF;

  -- 4. ADMINISTRATIVE STATUS & LEGACY CHECKS
  IF v_profile.subscription_status = 'suspended' THEN
    RETURN jsonb_build_object(
      'success', false, 
      'error', 'Suspended accounts cannot switch trial plans.'
    );
  END IF;

  IF v_profile.is_legacy_account IS TRUE THEN
    RETURN jsonb_build_object(
      'success', false, 
      'error', 'Legacy accounts are exempt from trial plan switching.'
    );
  END IF;

  -- 5. ACTIVE TRIAL TIMESTAMPS & EXPIRY CHECK
  IF v_profile.trial_started_at IS NULL OR v_profile.trial_ends_at IS NULL THEN
    RETURN jsonb_build_object(
      'success', false, 
      'error', 'No active trial lifecycle found for this account.'
    );
  END IF;

  IF clock_timestamp() > v_profile.trial_ends_at THEN
    RETURN jsonb_build_object(
      'success', false, 
      'error', 'Your free trial has expired. Please subscribe to continue.'
    );
  END IF;

  -- 6. INITIAL PAID SUBSCRIPTION CHECK
  SELECT EXISTS (
    SELECT 1 
    FROM public.saas_subscriptions
    WHERE tenant_id = v_user_id 
      AND status = 'active'
  ) INTO v_is_paid;

  IF v_is_paid THEN
    RETURN jsonb_build_object(
      'success', false, 
      'error', 'Active paid subscribers cannot use free trial switching.'
    );
  END IF;

  -- 7. DESTINATION PLAN INPUT VALIDATION
  IF p_destination_plan IS NULL OR trim(p_destination_plan) = '' THEN
    RETURN jsonb_build_object(
      'success', false, 
      'error', 'Destination plan key is required.'
    );
  END IF;

  IF p_destination_plan = 'free' THEN
    RETURN jsonb_build_object(
      'success', false, 
      'error', 'Free Starter plan cannot be selected for trial switching.'
    );
  END IF;

  -- 8. SUPER ADMIN PRICING JSONB RESOLUTION
  SELECT global_settings->'pricing' INTO v_pricing_json
  FROM public.profiles
  WHERE role = 'super_admin'
    AND global_settings IS NOT NULL
    AND global_settings->'pricing' IS NOT NULL
  ORDER BY created_at DESC
  LIMIT 1;

  -- FAIL-CLOSED: If pricing configuration is missing, reject immediately
  IF v_pricing_json IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Pricing configuration is unavailable.'
    );
  END IF;

  -- 9. DESTINATION PLAN EXISTENCE CHECK
  v_dest_plan := v_pricing_json -> p_destination_plan;

  IF v_dest_plan IS NULL OR jsonb_typeof(v_dest_plan) = 'null' THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Selected destination plan does not exist in Super Admin pricing configuration.'
    );
  END IF;

  -- 10. DESTINATION ENABLED CHECK (FAIL-CLOSED: EXPLICIT TRUE)
  v_enabled := COALESCE((v_dest_plan->>'enabled')::boolean, false);
  IF v_enabled IS NOT TRUE THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Selected plan is currently disabled.'
    );
  END IF;

  -- 11. DESTINATION TRIAL ENABLED CHECK (FAIL-CLOSED: EXPLICIT TRUE)
  v_trial_enabled := COALESCE((v_dest_plan->>'trialEnabled')::boolean, false);
  IF v_trial_enabled IS NOT TRUE THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Selected plan is not eligible for free trial.'
    );
  END IF;

  -- 12. DESTINATION TRIAL DURATION SANITY CHECK (CONFIGURATION CHECK ONLY)
  v_trial_days := COALESCE((v_dest_plan->>'trialDurationDays')::int, 0);
  IF v_trial_days < 1 THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Selected plan has invalid trial configuration.'
    );
  END IF;

  -- 13. SAME-PLAN NO-OP CHECK (OCCURS AFTER AUTHORITATIVE ELIGIBILITY VALIDATION)
  IF v_profile.plan_type = p_destination_plan THEN
    RETURN jsonb_build_object(
      'success', true,
      'changed', false,
      'plan_type', v_profile.plan_type,
      'trial_started_at', v_profile.trial_started_at,
      'trial_ends_at', v_profile.trial_ends_at
    );
  END IF;

  -- 14. FINAL IMMEDIATE RECHECK OF PAID SUBSCRIPTION STATE BEFORE UPDATE
  SELECT EXISTS (
    SELECT 1 
    FROM public.saas_subscriptions
    WHERE tenant_id = v_user_id 
      AND status = 'active'
  ) INTO v_is_paid;

  IF v_is_paid THEN
    RETURN jsonb_build_object(
      'success', false, 
      'error', 'Active paid subscribers cannot use free trial switching.'
    );
  END IF;

  -- 15. EXECUTE PLAN TYPE UPDATE (TRIAL TIMESTAMPS REMAIN 100% UNTOUCHED)
  UPDATE public.profiles
  SET plan_type = p_destination_plan
  WHERE id = v_user_id;

  -- 16. RETURN STRUCTURED RESULT
  RETURN jsonb_build_object(
    'success', true,
    'changed', true,
    'plan_type', p_destination_plan,
    'trial_started_at', v_profile.trial_started_at,
    'trial_ends_at', v_profile.trial_ends_at
  );
END;
$$;

-- PERMISSIONS
REVOKE ALL ON FUNCTION public.switch_trial_plan(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.switch_trial_plan(text) FROM anon;
GRANT EXECUTE ON FUNCTION public.switch_trial_plan(text) TO authenticated;
