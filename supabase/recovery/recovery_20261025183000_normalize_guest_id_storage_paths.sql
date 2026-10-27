-- Recovery Plan: recovery_20261025183000_normalize_guest_id_storage_paths.sql
-- Description: Recovery documentation and procedures for Migration 20261025183000.
-- 
-- IMPORTANT RECOVERY ARCHITECTURE RULES:
-- 1. DO NOT restore 10-year signed URLs into application use. 
--    Restoring long-lived bearer tokens into public.bookings would reintroduce the bearer token security vulnerability.
-- 2. The modern StayPilot application (src/lib/guestIdStorage.js) generates fresh 300-second ephemeral signed URLs 
--    on demand for canonical paths (<tenant_id>/<filename>). 
-- 3. If an application regression occurs, the fix is at the application layer (e.g. correcting UI rendering),
--    NOT by reverting database storage paths back to exposed 10-year signed URLs.
-- 4. The forensic backup table public._backup_guest_id_references_20261025183000 is retained for 30 days under
--    restricted service_role-only access and automatically scheduled for drop thereafter.

-- Forensic Verification Query (Read-Only):
-- SELECT booking_id, tenant_id, backed_up_at 
-- FROM public._backup_guest_id_references_20261025183000;

-- Retention Cleanup Procedure (To be executed 30 days post-deployment by Super Admin):
-- DROP TABLE IF EXISTS public._backup_guest_id_references_20261025183000;
