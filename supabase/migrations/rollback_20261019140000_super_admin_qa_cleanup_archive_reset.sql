-- ==============================================================================
-- ROLLBACK MIGRATION: rollback_20261019140000_super_admin_qa_cleanup_archive_reset.sql
-- DESCRIPTION: Safely reverts QA eligibility, archiving, and reset functions
--              while strictly preserving immutable super_admin_audit_logs
--              and booking_deletion_audits.
-- STATUS: PRODUCTION READY
-- ==============================================================================

BEGIN;

-- 1. DROP NEW RPCs
DROP FUNCTION IF EXISTS public.get_tenant_qa_eligibility(uuid);
DROP FUNCTION IF EXISTS public.archive_tenant_account(uuid, boolean, uuid);

-- 2. REVERT COLUMNS ON PROFILES
ALTER TABLE public.profiles
  DROP COLUMN IF EXISTS is_archived,
  DROP COLUMN IF EXISTS archived_at,
  DROP COLUMN IF EXISTS archived_by;

-- 3. REVERT COLUMNS ON SAAS_INVOICES
DROP INDEX IF EXISTS idx_saas_invoices_orig_tenant;
ALTER TABLE public.saas_invoices
  DROP COLUMN IF EXISTS original_tenant_id,
  DROP COLUMN IF EXISTS original_tenant_email,
  DROP COLUMN IF EXISTS retention_notes;

-- Note: super_admin_audit_logs and booking_deletion_audits are NEVER dropped
-- to permanently preserve financial and administrative audit history.

NOTIFY pgrst, 'reload schema';

COMMIT;
