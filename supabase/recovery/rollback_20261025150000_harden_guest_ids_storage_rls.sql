-- =====================================================================================
-- ROLLBACK SCRIPT: rollback_20261025150000_harden_guest_ids_storage_rls.sql
-- StayPilot Security Hardened Rollback / Recovery
-- 
-- CAUTION:
-- Legacy storage policies allowed ANY authenticated user across ANY tenant to view,
-- upload, and delete guest identification documents.
-- Restoring broad access is a SEVERE SECURITY VIOLATION and is strictly prohibited.
--
-- This script executes the Security-Preserving Recovery Plan:
-- It maintains STRICT TENANT ISOLATION while removing entitlement-coupling if
-- 'is_trial_expired()' caused a functional service disruption.
-- =====================================================================================

BEGIN;

-- 1. Remove hardened entitlement-coupled policies
DROP POLICY IF EXISTS "Tenant Team View Guest IDs" ON storage.objects;
DROP POLICY IF EXISTS "Tenant Team Insert Guest IDs" ON storage.objects;
DROP POLICY IF EXISTS "Tenant Team Update Guest IDs" ON storage.objects;
DROP POLICY IF EXISTS "Tenant Team Delete Guest IDs" ON storage.objects;

-- 2. Drop any legacy wide-open policies if present
DROP POLICY IF EXISTS "Allow authenticated views of guest_ids" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated uploads to guest_ids" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated updates to guest_ids" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated deletes of guest_ids" ON storage.objects;

-- 3. Apply Secure Tenant Isolation Fallback (No cross-tenant leakage permitted)
CREATE POLICY "Tenant Team View Guest IDs (Rollback Safe)"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'guest_ids'
  AND (
    (storage.foldername(name))[1] = (SELECT tenant_id::text FROM public.profiles WHERE id = auth.uid())
    OR public.is_super_admin()
  )
);

CREATE POLICY "Tenant Team Insert Guest IDs (Rollback Safe)"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'guest_ids'
  AND (
    (storage.foldername(name))[1] = (SELECT tenant_id::text FROM public.profiles WHERE id = auth.uid())
    OR public.is_super_admin()
  )
);

CREATE POLICY "Tenant Team Update Guest IDs (Rollback Safe)"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'guest_ids'
  AND (
    (storage.foldername(name))[1] = (SELECT tenant_id::text FROM public.profiles WHERE id = auth.uid())
    OR public.is_super_admin()
  )
)
WITH CHECK (
  bucket_id = 'guest_ids'
  AND (
    (storage.foldername(name))[1] = (SELECT tenant_id::text FROM public.profiles WHERE id = auth.uid())
    OR public.is_super_admin()
  )
);

CREATE POLICY "Tenant Team Delete Guest IDs (Rollback Safe)"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'guest_ids'
  AND (
    (storage.foldername(name))[1] = (SELECT tenant_id::text FROM public.profiles WHERE id = auth.uid())
    OR public.is_super_admin()
  )
);

COMMIT;
