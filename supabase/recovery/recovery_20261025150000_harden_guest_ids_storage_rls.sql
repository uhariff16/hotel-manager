-- =====================================================================================
-- RECOVERY SCRIPT: recovery_20261025150000_harden_guest_ids_storage_rls.sql
-- StayPilot Storage Security Recovery Plan
-- 
-- IMPORTANT OPERATOR NOTICE:
-- DO NOT EXECUTE UNLESS DIRECTED DURING AN INCIDENT.
-- DO NOT REVERT TO LEGACY POLICIES.
-- Legacy policies allowed any authenticated user to read, upload, and delete guest IDs
-- across all tenants. Broad access must NEVER be restored under any circumstances.
--
-- OPERATOR USE CASES:
-- Case A: 'is_trial_expired()' function failure or subscription service disruption.
--         Use the script below to restore tenant service while MAINTAINING strict
--         tenant folder isolation. Cross-tenant access remains completely blocked.
--
-- Case B: Active security breach / compromised credentials.
--         If emergency containment is needed, comment out Option A and uncomment Option B
--         (Total Tenant Lockdown) to restrict guest ID access exclusively to Super Admin.
-- =====================================================================================

BEGIN;

-- 1. Remove hardened entitlement-coupled policies
DROP POLICY IF EXISTS "Tenant Team View Guest IDs" ON storage.objects;
DROP POLICY IF EXISTS "Tenant Team Insert Guest IDs" ON storage.objects;
DROP POLICY IF EXISTS "Tenant Team Update Guest IDs" ON storage.objects;
DROP POLICY IF EXISTS "Tenant Team Delete Guest IDs" ON storage.objects;

-- 2. Drop any residual legacy open policies if they were accidentally reintroduced
DROP POLICY IF EXISTS "Allow authenticated views of guest_ids" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated uploads to guest_ids" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated updates to guest_ids" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated deletes of guest_ids" ON storage.objects;

-- -------------------------------------------------------------------------------------
-- OPTION A (DEFAULT RECOVERY): SECURE TENANT-ISOLATED FALLBACK
-- Decouples storage operations from trial/subscription checks to restore service,
-- but STAGE-HARDENED TENANT ISOLATION REMAINS FULLY ACTIVE.
-- Cross-tenant SELECT, INSERT, UPDATE, DELETE are STRICTLY REJECTED.
-- -------------------------------------------------------------------------------------

-- Policy A.1: SELECT (View/Download/Sign URLs) - Tenant Isolated
CREATE POLICY "Tenant Team View Guest IDs (Recovery Fallback)"
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

-- Policy A.2: INSERT (Upload Guest IDs) - Tenant Isolated
CREATE POLICY "Tenant Team Insert Guest IDs (Recovery Fallback)"
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

-- Policy A.3: UPDATE (Update Guest IDs) - Tenant Isolated
CREATE POLICY "Tenant Team Update Guest IDs (Recovery Fallback)"
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

-- Policy A.4: DELETE (Delete Guest IDs) - Tenant Isolated
CREATE POLICY "Tenant Team Delete Guest IDs (Recovery Fallback)"
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

-- -------------------------------------------------------------------------------------
-- OPTION B (INCIDENT CONTAINMENT / EMERGENCY LOCKDOWN):
-- Uncomment the block below and comment out OPTION A if total lockdown is required.
-- Restricts all guest ID access to Super Admin only.
-- -------------------------------------------------------------------------------------
/*
CREATE POLICY "Super Admin Emergency Containment Guest IDs"
ON storage.objects
FOR ALL
TO authenticated
USING (
  bucket_id = 'guest_ids'
  AND public.is_super_admin()
)
WITH CHECK (
  bucket_id = 'guest_ids'
  AND public.is_super_admin()
);
*/

COMMIT;
