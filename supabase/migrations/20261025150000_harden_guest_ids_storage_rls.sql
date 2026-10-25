-- Migration: 20261025150000_harden_guest_ids_storage_rls.sql
-- Description: Harden storage.objects RLS for the private 'guest_ids' bucket to enforce strict tenant isolation, staff inheritance, and entitlement verification.

BEGIN;

-- 1. Drop existing overly-permissive policies on guest_ids
DROP POLICY IF EXISTS "Allow authenticated views of guest_ids" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated uploads to guest_ids" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated updates to guest_ids" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated deletes of guest_ids" ON storage.objects;

-- 2. CREATE HARDENED TENANT-ISOLATED POLICIES

-- Policy 1: SELECT (View/Download/Sign URLs)
-- Requires that the object belongs to 'guest_ids' bucket AND:
--   - The top-level folder matches the caller's tenant_id (for both tenant admin and staff)
--   - OR the caller is a Super Admin
CREATE POLICY "Tenant Team View Guest IDs"
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

-- Policy 2: INSERT (Upload new guest IDs)
-- Requires that the object belongs to 'guest_ids' bucket AND:
--   - The top-level folder matches the caller's tenant_id
--   - AND the caller's tenant has an active trial or paid subscription (is_trial_expired() = false)
--   - OR the caller is a Super Admin
CREATE POLICY "Tenant Team Insert Guest IDs"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'guest_ids'
  AND (
    (
      (storage.foldername(name))[1] = (SELECT tenant_id::text FROM public.profiles WHERE id = auth.uid())
      AND public.is_trial_expired() = false
    )
    OR public.is_super_admin()
  )
);

-- Policy 3: UPDATE (Update guest IDs)
-- Requires matching tenant folder and active entitlement
CREATE POLICY "Tenant Team Update Guest IDs"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'guest_ids'
  AND (
    (
      (storage.foldername(name))[1] = (SELECT tenant_id::text FROM public.profiles WHERE id = auth.uid())
      AND public.is_trial_expired() = false
    )
    OR public.is_super_admin()
  )
)
WITH CHECK (
  bucket_id = 'guest_ids'
  AND (
    (
      (storage.foldername(name))[1] = (SELECT tenant_id::text FROM public.profiles WHERE id = auth.uid())
      AND public.is_trial_expired() = false
    )
    OR public.is_super_admin()
  )
);

-- Policy 4: DELETE (Delete guest IDs)
-- Requires matching tenant folder and active entitlement (or Super Admin)
CREATE POLICY "Tenant Team Delete Guest IDs"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'guest_ids'
  AND (
    (
      (storage.foldername(name))[1] = (SELECT tenant_id::text FROM public.profiles WHERE id = auth.uid())
      AND public.is_trial_expired() = false
    )
    OR public.is_super_admin()
  )
);

COMMIT;
