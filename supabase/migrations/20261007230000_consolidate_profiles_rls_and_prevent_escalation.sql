-- ============================================================
-- STAY PILOT — PROFILES RLS CONSOLIDATION & PRIVILEGE ESCALATION PREVENTION
-- MIGRATION: 20261007230000_consolidate_profiles_rls_and_prevent_escalation.sql
-- ============================================================

-- 1. SECURITY DEFINER Helper Functions
CREATE OR REPLACE FUNCTION public.get_auth_profile_role()
RETURNS TEXT AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION public.get_auth_profile_role() TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.get_auth_profile_role() FROM anon;

CREATE OR REPLACE FUNCTION public.get_auth_tenant_id()
RETURNS UUID AS $$
  SELECT tenant_id FROM public.profiles WHERE id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION public.get_auth_tenant_id() TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.get_auth_tenant_id() FROM anon;

-- 2. Trigger Function to Prevent Profile Privilege Escalation
CREATE OR REPLACE FUNCTION public.prevent_profile_privilege_escalation()
RETURNS TRIGGER AS $$
BEGIN
  -- Allow Super Admins and Service Role to update any field
  IF public.is_super_admin() OR auth.role() = 'service_role' THEN
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

-- 3. Consolidate & Clean Up All Previous Profiles Policies
DROP POLICY IF EXISTS "Super Admins view all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Users view global team" ON public.profiles;
DROP POLICY IF EXISTS "Users view team profiles" ON public.profiles;
DROP POLICY IF EXISTS "Super Admins manage all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Users update own profile" ON public.profiles;
DROP POLICY IF EXISTS "Tenants manage staff" ON public.profiles;
DROP POLICY IF EXISTS "Super Admin Select Profiles" ON public.profiles;
DROP POLICY IF EXISTS "Super Admin Insert Profiles" ON public.profiles;
DROP POLICY IF EXISTS "Super Admin Update Profiles" ON public.profiles;
DROP POLICY IF EXISTS "Super Admin Delete Profiles" ON public.profiles;
DROP POLICY IF EXISTS "Team Select Profiles" ON public.profiles;
DROP POLICY IF EXISTS "User Update Self Profile" ON public.profiles;
DROP POLICY IF EXISTS "Tenant Admin Insert Staff Profile" ON public.profiles;
DROP POLICY IF EXISTS "Tenant Admin Update Staff Profile" ON public.profiles;
DROP POLICY IF EXISTS "Tenant Admin Delete Staff Profile" ON public.profiles;

-- 4. Isolated Operation-Specific RLS Policies for public.profiles

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
