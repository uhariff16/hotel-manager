-- ==============================================================================
-- MIGRATION: 20261019191000_fix_booking_deletion_audits_fk_immutability.sql
-- DESCRIPTION: Remove mutating foreign keys on booking_deletion_audits
--              Audit tables store immutable historical references. The ON DELETE SET NULL
--              foreign key caused Postgres to attempt an UPDATE on booking_deletion_audits
--              when deleting a profile, which violated trg_enforce_booking_deletion_audits_immutability.
-- AUTHOR: Antigravity Autonomous Systems Engineer
-- STATUS: PRODUCTION READY
-- ==============================================================================

BEGIN;

-- Drop mutating FK constraints on booking_deletion_audits so audit records
-- retain their exact immutable tenant_id and deleted_by_user_id forever
-- without triggering mutation errors on profile deletion.
ALTER TABLE public.booking_deletion_audits
  DROP CONSTRAINT IF EXISTS booking_deletion_audits_tenant_id_fkey,
  DROP CONSTRAINT IF EXISTS booking_deletion_audits_deleted_by_user_id_fkey;

COMMIT;
