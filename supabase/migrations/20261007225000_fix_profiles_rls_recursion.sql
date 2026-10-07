-- ============================================================
-- STAY PILOT — PROFILES RLS RECURSION FIX & POLICY REFINEMENT
-- MIGRATION: 20261007225000_fix_profiles_rls_recursion.sql
-- ============================================================

-- 1. Create SECURITY DEFINER helper to prevent policy recursion
CREATE OR REPLACE FUNCTION public.get_auth_tenant_id()
RETURNS UUID AS $$
  SELECT tenant_id FROM public.profiles WHERE id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION public.get_auth_tenant_id() TO authenticated, service_role;

-- 2. Update profiles RLS SELECT policy
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
