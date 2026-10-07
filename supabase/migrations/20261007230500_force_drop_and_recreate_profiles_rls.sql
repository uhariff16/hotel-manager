-- ============================================================
-- STAY PILOT — DYNAMICALLY DROP ALL PRE-EXISTING PROFILES POLICIES & REBUILD ISOLATED RLS
-- MIGRATION: 20261007230500_force_drop_and_recreate_profiles_rls.sql
-- ============================================================

-- 1. Dynamically drop EVERY existing policy on public.profiles to eliminate any orphan permissive policies
DO $$
DECLARE
  pol RECORD;
BEGIN
  FOR pol IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = 'profiles' LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.profiles;', pol.policyname);
  END LOOP;
END $$;

-- 2. Update Trigger Function to allow server RPC context flag 'app.allow_profile_system_update'
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

DROP TRIGGER IF EXISTS trg_prevent_profile_privilege_escalation ON public.profiles;
CREATE TRIGGER trg_prevent_profile_privilege_escalation
BEFORE UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.prevent_profile_privilege_escalation();

-- 3. Update switch_trial_plan RPC to set the transaction-scoped context flag
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

REVOKE ALL ON FUNCTION public.switch_trial_plan(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.switch_trial_plan(text) FROM anon;
GRANT EXECUTE ON FUNCTION public.switch_trial_plan(text) TO authenticated;

-- 4. Create Isolated Operation-Specific RLS Policies for public.profiles

-- A. Super Admin Full Access Policies
CREATE POLICY "Super Admin Select Profiles" ON public.profiles FOR SELECT TO authenticated USING (public.is_super_admin());
CREATE POLICY "Super Admin Insert Profiles" ON public.profiles FOR INSERT TO authenticated WITH CHECK (public.is_super_admin());
CREATE POLICY "Super Admin Update Profiles" ON public.profiles FOR UPDATE TO authenticated USING (public.is_super_admin());
CREATE POLICY "Super Admin Delete Profiles" ON public.profiles FOR DELETE TO authenticated USING (public.is_super_admin());

-- B. Team SELECT Policy (Strictly isolates Tenant Admin and Staff to own team)
CREATE POLICY "Team Select Profiles" ON public.profiles FOR SELECT TO authenticated
USING (
  -- Self
  auth.uid() = id
  OR
  -- Tenant Admin viewing own staff
  (public.get_auth_profile_role() = 'tenant_admin' AND tenant_id = auth.uid() AND role = 'staff')
  OR
  -- Staff viewing owning Tenant Admin
  (public.get_auth_profile_role() = 'staff' AND id = public.get_auth_tenant_id() AND role = 'tenant_admin')
  OR
  -- Staff viewing sibling staff
  (public.get_auth_profile_role() = 'staff' AND tenant_id = public.get_auth_tenant_id() AND role = 'staff')
);

-- C. User Self UPDATE Policy
CREATE POLICY "User Update Self Profile" ON public.profiles FOR UPDATE TO authenticated
USING (auth.uid() = id)
WITH CHECK (auth.uid() = id);

-- D. Tenant Admin Staff Management Policies
CREATE POLICY "Tenant Admin Insert Staff Profile" ON public.profiles FOR INSERT TO authenticated
WITH CHECK (
  public.get_auth_profile_role() = 'tenant_admin'
  AND role = 'staff'
  AND tenant_id = auth.uid()
);

CREATE POLICY "Tenant Admin Update Staff Profile" ON public.profiles FOR UPDATE TO authenticated
USING (
  public.get_auth_profile_role() = 'tenant_admin'
  AND role = 'staff'
  AND tenant_id = auth.uid()
)
WITH CHECK (
  role = 'staff'
  AND tenant_id = auth.uid()
);

CREATE POLICY "Tenant Admin Delete Staff Profile" ON public.profiles FOR DELETE TO authenticated
USING (
  public.get_auth_profile_role() = 'tenant_admin'
  AND role = 'staff'
  AND tenant_id = auth.uid()
);

-- 5. Revoke Unnecessary Anonymous Grants
REVOKE INSERT, UPDATE, DELETE ON public.profiles FROM anon;
