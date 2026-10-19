-- ==============================================================================
-- ROLLBACK MIGRATION: rollback_20261019191000_fix_booking_deletion_audits_fk_immutability.sql
-- DESCRIPTION: Restores FK constraints on booking_deletion_audits
-- STATUS: PRODUCTION READY
-- ==============================================================================

BEGIN;

ALTER TABLE public.booking_deletion_audits
  ADD CONSTRAINT booking_deletion_audits_tenant_id_fkey
    FOREIGN KEY (tenant_id) REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD CONSTRAINT booking_deletion_audits_deleted_by_user_id_fkey
    FOREIGN KEY (deleted_by_user_id) REFERENCES public.profiles(id) ON DELETE SET NULL;

COMMIT;
