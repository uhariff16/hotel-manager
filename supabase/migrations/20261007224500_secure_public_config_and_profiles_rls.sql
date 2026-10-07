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
