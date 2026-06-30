-- 1. Demote any other super admin profiles to tenant_admin (only uhariff@gmail.com stays super admin)
UPDATE public.profiles 
SET role = 'tenant_admin' 
WHERE role = 'super_admin' AND email != 'uhariff@gmail.com';

-- Sync auth metadata for any demoted super admins (so their JWT matches)
UPDATE auth.users 
SET raw_app_meta_data = raw_app_meta_data || '{"role": "tenant_admin"}'::jsonb
WHERE email != 'uhariff@gmail.com' AND (raw_app_meta_data->>'role') = 'super_admin';

-- 2. Backfill any existing profiles where feature_comm_enabled is NULL to default to TRUE
UPDATE public.profiles
SET feature_comm_enabled = TRUE
WHERE feature_comm_enabled IS NULL;

-- 3. Update the RLS SELECT policy on profiles table
-- This allows all logged-in users to fetch the super_admin profile to read global settings
DROP POLICY IF EXISTS "Users view global team" ON public.profiles;

CREATE POLICY "Users view global team" ON public.profiles 
FOR SELECT 
USING (
  id = auth.uid() OR 
  tenant_id = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid OR
  role = 'super_admin'
);
