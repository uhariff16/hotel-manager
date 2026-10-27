-- Migration: 20261025183000_normalize_guest_id_storage_paths.sql
-- Description: Normalize legacy 10-year tokenized signed URLs in public.bookings to canonical storage paths (<tenant_id>/<filename>).

BEGIN;

-- Transaction-local safety timeouts
SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '30s';

-- 1. Create a secure, token-free backup table capturing validated canonical paths
-- Storing canonical relative paths (<tenant_id>/<filename>) guarantees zero secondary token exposure
CREATE TABLE IF NOT EXISTS public._backup_guest_id_references_20261025183000 (
    booking_id UUID PRIMARY KEY,
    tenant_id UUID NOT NULL,
    canonical_front_path TEXT,
    canonical_back_path TEXT,
    backed_up_at TIMESTAMPTZ DEFAULT now()
);

-- Restrict backup table access to service_role / super admin only (Defense-in-Depth)
REVOKE ALL ON TABLE public._backup_guest_id_references_20261025183000 FROM PUBLIC, anon, authenticated;
ALTER TABLE public._backup_guest_id_references_20261025183000 ENABLE ROW LEVEL SECURITY;

-- Populate backup table with validated canonical paths and acquire row-level lock FOR UPDATE
INSERT INTO public._backup_guest_id_references_20261025183000 (booking_id, tenant_id, canonical_front_path, canonical_back_path)
SELECT 
    id, 
    tenant_id, 
    substring(id_front_image_url from '^(?:https?://[^/]+)?/storage/v1/object/sign/guest_ids/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[a-zA-Z0-9_.-]+)(?:\?.*)?$'),
    substring(id_back_image_url from '^(?:https?://[^/]+)?/storage/v1/object/sign/guest_ids/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[a-zA-Z0-9_.-]+)(?:\?.*)?$')
FROM public.bookings
WHERE (id_front_image_url LIKE '%/storage/v1/object/sign/guest_ids/%')
   OR (id_back_image_url LIKE '%/storage/v1/object/sign/guest_ids/%')
FOR UPDATE
ON CONFLICT (booking_id) DO NOTHING;

-- 2. Preflight Safety Assertion: Reject any malformed, cross-tenant, or non-existent storage references
DO $$
DECLARE
    v_invalid_front_count INT;
    v_invalid_back_count INT;
    v_mismatched_front_tenant INT;
    v_mismatched_back_tenant INT;
    v_missing_front_objects INT;
    v_missing_back_objects INT;
    v_origin_mismatch_count INT;
    v_backup_row_count INT;
BEGIN
    -- Verify backup row count matches expected 12 legacy bookings
    SELECT count(*) INTO v_backup_row_count
    FROM public._backup_guest_id_references_20261025183000;

    IF v_backup_row_count != 12 THEN
        RAISE EXCEPTION 'Preflight failed: expected 12 backup rows, found %', v_backup_row_count;
    END IF;

    -- Check that all signed URLs belong exclusively to the StayPilot production Supabase origin or standard relative path
    SELECT count(*) INTO v_origin_mismatch_count
    FROM public.bookings
    WHERE (id_front_image_url LIKE 'http://%' OR id_front_image_url LIKE 'https://%')
      AND id_front_image_url NOT LIKE 'https://lubkdxhqnnghnjhrebat.supabase.co/%';

    IF v_origin_mismatch_count > 0 THEN
        RAISE EXCEPTION 'Preflight failed: % bookings contain front URLs from untrusted origins', v_origin_mismatch_count;
    END IF;

    SELECT count(*) INTO v_origin_mismatch_count
    FROM public.bookings
    WHERE (id_back_image_url LIKE 'http://%' OR id_back_image_url LIKE 'https://%')
      AND id_back_image_url NOT LIKE 'https://lubkdxhqnnghnjhrebat.supabase.co/%';

    IF v_origin_mismatch_count > 0 THEN
        RAISE EXCEPTION 'Preflight failed: % bookings contain back URLs from untrusted origins', v_origin_mismatch_count;
    END IF;

    -- Check for malformed front URLs
    SELECT count(*) INTO v_invalid_front_count
    FROM public.bookings
    WHERE id_front_image_url IS NOT NULL 
      AND id_front_image_url != ''
      AND id_front_image_url !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[a-zA-Z0-9_.-]+$'
      AND substring(id_front_image_url from '^(?:https?://[^/]+)?/storage/v1/object/sign/guest_ids/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[a-zA-Z0-9_.-]+)(?:\?.*)?$') IS NULL;

    IF v_invalid_front_count > 0 THEN
        RAISE EXCEPTION 'Preflight failed: % bookings contain unparseable id_front_image_url', v_invalid_front_count;
    END IF;

    -- Check for malformed back URLs
    SELECT count(*) INTO v_invalid_back_count
    FROM public.bookings
    WHERE id_back_image_url IS NOT NULL 
      AND id_back_image_url != ''
      AND id_back_image_url !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[a-zA-Z0-9_.-]+$'
      AND substring(id_back_image_url from '^(?:https?://[^/]+)?/storage/v1/object/sign/guest_ids/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[a-zA-Z0-9_.-]+)(?:\?.*)?$') IS NULL;

    IF v_invalid_back_count > 0 THEN
        RAISE EXCEPTION 'Preflight failed: % bookings contain unparseable id_back_image_url', v_invalid_back_count;
    END IF;

    -- Check for tenant ownership mismatch on front URLs
    SELECT count(*) INTO v_mismatched_front_tenant
    FROM public.bookings
    WHERE id_front_image_url LIKE '%/storage/v1/object/sign/guest_ids/%'
      AND substring(id_front_image_url from '/storage/v1/object/sign/guest_ids/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/') != tenant_id::text;

    IF v_mismatched_front_tenant > 0 THEN
        RAISE EXCEPTION 'Preflight failed: % bookings have front URL tenant ID mismatch with booking ownership', v_mismatched_front_tenant;
    END IF;

    -- Check for tenant ownership mismatch on back URLs
    SELECT count(*) INTO v_mismatched_back_tenant
    FROM public.bookings
    WHERE id_back_image_url LIKE '%/storage/v1/object/sign/guest_ids/%'
      AND substring(id_back_image_url from '/storage/v1/object/sign/guest_ids/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/') != tenant_id::text;

    IF v_mismatched_back_tenant > 0 THEN
        RAISE EXCEPTION 'Preflight failed: % bookings have back URL tenant ID mismatch with booking ownership', v_mismatched_back_tenant;
    END IF;

    -- Verify all extracted front paths exist in storage.objects
    SELECT count(*) INTO v_missing_front_objects
    FROM public.bookings b
    LEFT JOIN storage.objects so 
      ON so.bucket_id = 'guest_ids' 
     AND so.name = substring(b.id_front_image_url from '^(?:https?://[^/]+)?/storage/v1/object/sign/guest_ids/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[a-zA-Z0-9_.-]+)(?:\?.*)?$')
    WHERE b.id_front_image_url LIKE '%/storage/v1/object/sign/guest_ids/%'
      AND so.id IS NULL;

    IF v_missing_front_objects > 0 THEN
        RAISE EXCEPTION 'Preflight failed: % front images do not exist in storage.objects', v_missing_front_objects;
    END IF;

    -- Verify all extracted back paths exist in storage.objects
    SELECT count(*) INTO v_missing_back_objects
    FROM public.bookings b
    LEFT JOIN storage.objects so 
      ON so.bucket_id = 'guest_ids' 
     AND so.name = substring(b.id_back_image_url from '^(?:https?://[^/]+)?/storage/v1/object/sign/guest_ids/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[a-zA-Z0-9_.-]+)(?:\?.*)?$')
    WHERE b.id_back_image_url LIKE '%/storage/v1/object/sign/guest_ids/%'
      AND so.id IS NULL;

    IF v_missing_back_objects > 0 THEN
        RAISE EXCEPTION 'Preflight failed: % back images do not exist in storage.objects', v_missing_back_objects;
    END IF;
END $$;

-- 3. Execute controlled normalization of id_front_image_url
UPDATE public.bookings
SET id_front_image_url = substring(id_front_image_url from '^(?:https?://[^/]+)?/storage/v1/object/sign/guest_ids/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[a-zA-Z0-9_.-]+)(?:\?.*)?$')
WHERE id_front_image_url LIKE '%/storage/v1/object/sign/guest_ids/%';

-- 4. Execute controlled normalization of id_back_image_url
UPDATE public.bookings
SET id_back_image_url = substring(id_back_image_url from '^(?:https?://[^/]+)?/storage/v1/object/sign/guest_ids/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[a-zA-Z0-9_.-]+)(?:\?.*)?$')
WHERE id_back_image_url LIKE '%/storage/v1/object/sign/guest_ids/%';

-- 5. Post-normalization Assertion: Verify exact final state
DO $$
DECLARE
    v_remaining_legacy_count INT;
    v_canonical_front_count INT;
    v_canonical_back_count INT;
BEGIN
    -- Verify zero legacy tokens remain
    SELECT count(*) INTO v_remaining_legacy_count
    FROM public.bookings
    WHERE (id_front_image_url LIKE '%/storage/v1/object/sign/%' OR id_front_image_url LIKE '%?token=%')
       OR (id_back_image_url LIKE '%/storage/v1/object/sign/%' OR id_back_image_url LIKE '%?token=%');

    IF v_remaining_legacy_count > 0 THEN
        RAISE EXCEPTION 'Post-check failed: % bookings still contain legacy signed URL tokens', v_remaining_legacy_count;
    END IF;

    -- Verify exactly 12 canonical front paths exist
    SELECT count(*) INTO v_canonical_front_count
    FROM public.bookings
    WHERE id_front_image_url ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[a-zA-Z0-9_.-]+$';

    IF v_canonical_front_count != 12 THEN
        RAISE EXCEPTION 'Post-check failed: expected 12 canonical front paths, found %', v_canonical_front_count;
    END IF;

    -- Verify exactly 8 canonical back paths exist
    SELECT count(*) INTO v_canonical_back_count
    FROM public.bookings
    WHERE id_back_image_url ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[a-zA-Z0-9_.-]+$';

    IF v_canonical_back_count != 8 THEN
        RAISE EXCEPTION 'Post-check failed: expected 8 canonical back paths, found %', v_canonical_back_count;
    END IF;
END $$;

COMMIT;
