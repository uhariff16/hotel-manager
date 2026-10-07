-- ============================================================
-- STAY PILOT — ALLOW RPC TRIAL PLAN SWITCH & PREVENT ESCALATION
-- MIGRATION: 20261007231000_allow_rpc_trial_plan_switch_trigger.sql
-- ============================================================

-- 1. Update Trigger Function to allow server RPC context flag 'app.allow_profile_system_update'
CREATE OR REPLACE FUNCTION public.prevent_profile_privilege_escalation()
RETURNS TRIGGER AS $$
BEGIN
  -- Allow Super Admins and Service Role to update any field
  IF public.is_super_admin() OR auth.role() = 'service_role' THEN
    RETURN NEW;
  END IF;

  -- Allow server-authoritative RPCs (like switch_trial_plan) that set transaction context flag
  IF current_setting('app.allow_profile_system_update', true) = 'true' THEN
    RETURN NEW;
  END IF;

  -- Prevent modifying protected authorization fields by non-super-admins
  IF NEW.role IS DISTINCT FROM OLD.role THEN
    RAISE EXCEPTION 'Privilege escalation denied: profile role cannot be modified by user.';
  END IF;

  IF NEW.tenant_id IS DISTINCT FROM OLD.tenant_id THEN
    RAISE EXCEPTION 'Privilege escalation denied: tenant_id cannot be modified by user.';
  END IF;

  IF NEW.plan_type IS DISTINCT FROM OLD.plan_type THEN
    RAISE EXCEPTION 'Privilege escalation denied: plan_type cannot be modified directly by user.';
  END IF;

  IF NEW.subscription_status IS DISTINCT FROM OLD.subscription_status THEN
    RAISE EXCEPTION 'Privilege escalation denied: subscription_status cannot be modified directly by user.';
  END IF;

  IF NEW.is_legacy_account IS DISTINCT FROM OLD.is_legacy_account THEN
    RAISE EXCEPTION 'Privilege escalation denied: is_legacy_account cannot be modified directly by user.';
  END IF;

  IF NEW.global_settings IS DISTINCT FROM OLD.global_settings THEN
    RAISE EXCEPTION 'Privilege escalation denied: global_settings cannot be modified by user.';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 2. Update switch_trial_plan RPC to set the transaction-scoped context flag
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
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Authentication required.');
  END IF;

  SELECT * INTO v_profile FROM public.profiles WHERE id = v_user_id FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Account profile not found.');
  END IF;

  IF v_profile.role != 'tenant_admin' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Only Tenant Administrators can switch trial plans.');
  END IF;

  IF v_profile.tenant_id IS DISTINCT FROM v_user_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized tenant ownership.');
  END IF;

  IF v_profile.subscription_status = 'suspended' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Account is suspended.');
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.saas_subscriptions
    WHERE tenant_id = v_user_id AND status = 'active'
  ) INTO v_is_paid;

  IF v_is_paid THEN
    RETURN jsonb_build_object('success', false, 'error', 'Active paid subscribers cannot use free trial switching.');
  END IF;

  -- Set transaction-scoped context flag to allow plan_type update
  PERFORM set_config('app.allow_profile_system_update', 'true', true);

  UPDATE public.profiles
  SET plan_type = p_destination_plan
  WHERE id = v_user_id;

  RETURN jsonb_build_object(
    'success', true,
    'changed', true,
    'plan_type', p_destination_plan,
    'trial_started_at', v_profile.trial_started_at,
    'trial_ends_at', v_profile.trial_ends_at
  );
END;
$$;
