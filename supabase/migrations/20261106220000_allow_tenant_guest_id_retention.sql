-- ==============================================================================
-- MIGRATION: 20261106220000_allow_tenant_guest_id_retention.sql
-- PURPOSE: Authorize Tenant Administrators to configure Guest ID retention period (30–90 days)
-- TARGET: public.profiles.global_settings.id_retention_days
-- SECURITY: Strictly verifies auth.uid(), validates integer range 30..90 days, maintains tenant isolation,
--           and preserves privilege escalation protections against platform settings.
--           Eliminates PG_CONTEXT diagnostic stack introspection and session variables.
-- STATUS: READY FOR PRODUCTION APPLICATION — UNAPPLIED
-- ==============================================================================

-- 1. Create Dedicated Hardened RPC: public.save_tenant_guest_id_retention
CREATE OR REPLACE FUNCTION public.save_tenant_guest_id_retention(
  p_retention_days numeric,
  p_tenant_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_user_role text;
  v_target_id uuid;
  v_old_settings jsonb;
  v_new_settings jsonb;
BEGIN
  -- 1. Authentication Check
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED: Authentication required to configure retention policy.'
      USING ERRCODE = '42501';
  END IF;

  -- 2. Range & Type Validation: Strict integer between 30 and 90 days (reject decimals, out-of-range, NULL)
  IF p_retention_days IS NULL OR p_retention_days <> trunc(p_retention_days) OR p_retention_days < 30 OR p_retention_days > 90 THEN
    RAISE EXCEPTION 'INVALID_ARGUMENT: Retention period must be an integer between 30 and 90 days.'
      USING ERRCODE = '22023';
  END IF;

  -- 3. Role & Tenant Isolation Verification
  SELECT role INTO v_user_role
  FROM public.profiles
  WHERE id = v_uid;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'USER_NOT_FOUND: Profile not found.'
      USING ERRCODE = '42501';
  END IF;

  IF v_user_role = 'super_admin' THEN
    v_target_id := COALESCE(p_tenant_id, v_uid);
    IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = v_target_id) THEN
      RAISE EXCEPTION 'TARGET_NOT_FOUND: Target tenant profile does not exist.'
        USING ERRCODE = '42501';
    END IF;
  ELSIF v_user_role = 'tenant_admin' THEN
    IF p_tenant_id IS NOT NULL AND p_tenant_id <> v_uid THEN
      RAISE EXCEPTION 'FORBIDDEN: Tenant administrators cannot modify retention policies of other accounts.'
        USING ERRCODE = '42501';
    END IF;
    v_target_id := v_uid;
  ELSE
    RAISE EXCEPTION 'FORBIDDEN: Insufficient permissions to modify retention policy.'
      USING ERRCODE = '42501';
  END IF;

  -- 4. Load and update settings non-destructively with exclusive row lock to prevent race conditions
  SELECT COALESCE(global_settings, '{}'::jsonb)
  INTO v_old_settings
  FROM public.profiles
  WHERE id = v_target_id
  FOR UPDATE;

  v_new_settings := jsonb_set(v_old_settings, '{id_retention_days}', to_jsonb(p_retention_days::integer), true);

  UPDATE public.profiles
  SET global_settings = v_new_settings
  WHERE id = v_target_id;

  RETURN jsonb_build_object(
    'status', 'success',
    'tenant_id', v_target_id,
    'id_retention_days', p_retention_days::integer
  );
END;
$$;

-- 2. Grant Permissions
REVOKE ALL ON FUNCTION public.save_tenant_guest_id_retention(numeric, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_tenant_guest_id_retention(numeric, uuid) TO authenticated, service_role;

-- 3. Update prevent_profile_privilege_escalation trigger to permit id_retention_days
--    alongside existing tenant-scoped subkeys ('billing', 'tenant_gst', 'tenant_billing')
CREATE OR REPLACE FUNCTION public.prevent_profile_privilege_escalation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_stack text;
  v_is_paid boolean;
BEGIN
  -- 1. Unconditionally allow Super Admins and Service Role
  IF public.is_super_admin() OR auth.role() = 'service_role' THEN
    RETURN NEW;
  END IF;

  -- 2. ABSOLUTE IMMUTABLE INVARIANTS:
  IF NEW.role IS DISTINCT FROM OLD.role THEN
    RAISE EXCEPTION 'Privilege escalation denied: profile role cannot be modified by user.'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.tenant_id IS DISTINCT FROM OLD.tenant_id THEN
    RAISE EXCEPTION 'Privilege escalation denied: tenant_id cannot be modified by user.'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.is_legacy_account IS DISTINCT FROM OLD.is_legacy_account THEN
    RAISE EXCEPTION 'Privilege escalation denied: is_legacy_account cannot be modified by user.'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.subscription_status IS DISTINCT FROM OLD.subscription_status THEN
    RAISE EXCEPTION 'Privilege escalation denied: subscription_status cannot be modified directly by user.'
      USING ERRCODE = '42501';
  END IF;

  -- 3. PLAN TYPE
  IF NEW.plan_type IS DISTINCT FROM OLD.plan_type THEN
    GET DIAGNOSTICS v_stack = PG_CONTEXT;
    IF v_stack NOT LIKE '%switch_trial_plan%' THEN
      RAISE EXCEPTION 'Privilege escalation denied: plan_type cannot be modified directly by user.'
        USING ERRCODE = '42501';
    END IF;

    IF OLD.subscription_status IS DISTINCT FROM 'trialing' THEN
      RAISE EXCEPTION 'Privilege escalation denied: plan_type can only be switched during trial.'
        USING ERRCODE = '42501';
    END IF;

    IF OLD.is_legacy_account IS TRUE THEN
      RAISE EXCEPTION 'Privilege escalation denied: legacy account plan_type cannot be modified.'
        USING ERRCODE = '42501';
    END IF;

    IF auth.uid() IS DISTINCT FROM OLD.id THEN
      RAISE EXCEPTION 'Privilege escalation denied: unauthorized tenant ownership.'
        USING ERRCODE = '42501';
    END IF;

    IF lower(trim(NEW.plan_type)) NOT IN ('solo', 'custom_1786983013013', 'growth', 'pro', 'premium', 'stay_master', 'stay master', 'free') THEN
      RAISE EXCEPTION 'Privilege escalation denied: invalid trial plan type.'
        USING ERRCODE = '42501';
    END IF;

    SELECT EXISTS (
      SELECT 1 FROM public.saas_subscriptions
      WHERE tenant_id = OLD.id AND status = 'active'
    ) INTO v_is_paid;

    IF v_is_paid THEN
      RAISE EXCEPTION 'Privilege escalation denied: active paid subscribers cannot switch trial plans.'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  -- 4. GLOBAL SETTINGS: Granular authorization (zero bypass flag required)
  IF NEW.global_settings IS DISTINCT FROM OLD.global_settings THEN
    -- Strictly block platform/Super Admin configuration
    IF (OLD.global_settings->'seller_identity' IS DISTINCT FROM NEW.global_settings->'seller_identity') OR
       (OLD.global_settings->'gst_configuration' IS DISTINCT FROM NEW.global_settings->'gst_configuration') OR
       (OLD.global_settings->'pricing' IS DISTINCT FROM NEW.global_settings->'pricing') OR
       (OLD.global_settings->'website_pricing' IS DISTINCT FROM NEW.global_settings->'website_pricing') OR
       (OLD.global_settings->'razorpay_settings' IS DISTINCT FROM NEW.global_settings->'razorpay_settings') OR
       (OLD.global_settings->'features' IS DISTINCT FROM NEW.global_settings->'features') THEN
      RAISE EXCEPTION 'Privilege escalation denied: platform global_settings cannot be modified by user.'
        USING ERRCODE = '42501';
    END IF;

    -- Strictly block arbitrary keys: only tenant-scoped subkeys ('billing', 'tenant_gst', 'tenant_billing', 'id_retention_days') may change
    IF (OLD.global_settings - 'billing' - 'tenant_gst' - 'tenant_billing' - 'id_retention_days') IS DISTINCT FROM 
       (NEW.global_settings - 'billing' - 'tenant_gst' - 'tenant_billing' - 'id_retention_days') THEN
      RAISE EXCEPTION 'Privilege escalation denied: unauthorized global_settings modification.'
        USING ERRCODE = '42501';
    END IF;

    -- Strict validation and role authorization for id_retention_days (database-enforced, zero PG_CONTEXT / zero session variable dependency)
    IF (OLD.global_settings->'id_retention_days' IS DISTINCT FROM NEW.global_settings->'id_retention_days') THEN
      -- Role verification: Only tenant administrators can modify retention policy
      IF OLD.role IS DISTINCT FROM 'tenant_admin' THEN
        RAISE EXCEPTION 'Privilege escalation denied: only tenant administrators can modify id_retention_days.'
          USING ERRCODE = '42501';
      END IF;

      -- Tenant isolation verification: Cannot modify another tenant's retention policy
      IF auth.uid() IS DISTINCT FROM OLD.id THEN
        RAISE EXCEPTION 'Privilege escalation denied: unauthorized tenant ownership.'
          USING ERRCODE = '42501';
      END IF;

      -- Value validation: must be an integer between 30 and 90 (reject strings, booleans, arrays, objects, decimals)
      IF NEW.global_settings->'id_retention_days' IS NULL OR
         jsonb_typeof(NEW.global_settings->'id_retention_days') <> 'number' OR
         (NEW.global_settings->>'id_retention_days')::numeric <> trunc((NEW.global_settings->>'id_retention_days')::numeric) OR
         (NEW.global_settings->>'id_retention_days')::integer < 30 OR
         (NEW.global_settings->>'id_retention_days')::integer > 90 THEN
        RAISE EXCEPTION 'INVALID_ARGUMENT: id_retention_days must be an integer between 30 and 90.'
          USING ERRCODE = '22023';
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;
