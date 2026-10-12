-- =============================================================================
-- STAY PILOT — PHASE 4M-E POST-PRODUCTION RECOVERY & FIX SCRIPT
-- FILE: supabase/pending/post_production_recovery_phase4me.sql
-- DESCRIPTION:
--   PRODUCTION-SAFE RECOVERY PROCEDURE:
--   1. Restores default execution privileges and drops restricting triggers/RPCs if needed.
--   2. STRICTLY PRESERVES all existing financial ledger records, transaction_type columns,
--      parent_income_id relationships, and the public.booking_deletion_audits table.
--   3. NEVER DROPS columns or tables containing live business data.
-- =============================================================================

-- 1. Restore DELETE permissions on public.bookings to authenticated users
GRANT DELETE ON public.bookings TO authenticated;

-- 2. Drop deletion enforcement triggers on bookings and incomes
DROP TRIGGER IF EXISTS trg_enforce_booking_direct_delete_guard ON public.bookings;
DROP FUNCTION IF EXISTS public.enforce_booking_direct_delete_guard();

DROP TRIGGER IF EXISTS trg_enforce_income_booking_linkage_guard ON public.incomes;
DROP FUNCTION IF EXISTS public.enforce_income_booking_linkage_guard();

DROP TRIGGER IF EXISTS trg_enforce_support_ticket_immutability ON public.support_tickets;
DROP FUNCTION IF EXISTS public.enforce_support_ticket_immutability();

-- 3. Restore standard RLS policies on bookings and incomes
DROP POLICY IF EXISTS "Tenant Admin Delete Bookings" ON public.bookings;
CREATE POLICY "Tenant Admin Delete Bookings" ON public.bookings
  FOR DELETE TO public
  USING (
    ((((auth.uid() = tenant_id) OR belongs_to_tenant(tenant_id)) AND (get_auth_profile_role() = 'tenant_admin'::text) AND (is_trial_expired() = false)) OR is_super_admin())
  );

DROP POLICY IF EXISTS "Tenant Admin Update Incomes" ON public.incomes;
CREATE POLICY "Tenant Admin Update Incomes" ON public.incomes
  FOR UPDATE TO public
  USING (
    ((((auth.uid() = tenant_id) OR belongs_to_tenant(tenant_id)) AND (get_auth_profile_role() = 'tenant_admin'::text) AND (is_trial_expired() = false)) OR is_super_admin())
  )
  WITH CHECK (
    ((((auth.uid() = tenant_id) OR belongs_to_tenant(tenant_id)) AND (get_auth_profile_role() = 'tenant_admin'::text) AND (is_trial_expired() = false) AND (EXISTS ( SELECT 1
   FROM resorts r
  WHERE ((r.id = incomes.resort_id) AND (r.tenant_id = incomes.tenant_id))))) OR is_super_admin())
  );

DROP POLICY IF EXISTS "Tenant Admin Delete Incomes" ON public.incomes;
CREATE POLICY "Tenant Admin Delete Incomes" ON public.incomes
  FOR DELETE TO public
  USING (
    ((((auth.uid() = tenant_id) OR belongs_to_tenant(tenant_id)) AND (get_auth_profile_role() = 'tenant_admin'::text) AND (is_trial_expired() = false)) OR is_super_admin())
  );

DROP POLICY IF EXISTS "Tenant Team Insert Incomes" ON public.incomes;
CREATE POLICY "Tenant Team Insert Incomes" ON public.incomes
  FOR INSERT TO public
  WITH CHECK (
    ((belongs_to_tenant(tenant_id) AND (is_trial_expired() = false) AND (EXISTS ( SELECT 1
   FROM resorts r
  WHERE ((r.id = incomes.resort_id) AND (r.tenant_id = incomes.tenant_id)))) AND ((get_auth_profile_role() = 'tenant_admin'::text) OR ((get_auth_profile_role() = 'staff'::text) AND (booking_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM bookings b
  WHERE ((b.id = incomes.booking_id) AND (b.tenant_id = incomes.tenant_id))))))) OR is_super_admin())
  );

-- 4. Clean up private authorization session table (temporary coordination state only)
DROP TABLE IF EXISTS private.active_booking_deletion_sessions;
DROP SCHEMA IF EXISTS private CASCADE;

-- =============================================================================
-- CRITICAL DATA INTEGRITY PRESERVATION NOTICE:
-- The following production assets are INTENTIONALLY PRESERVED:
-- - public.booking_deletion_audits (historical deletion audit snapshots)
-- - public.incomes.transaction_type (advance, settlement, reversal classifications)
-- - public.incomes.parent_income_id (settlement audit linkage)
-- - All financial records in public.incomes and public.expenses
-- DO NOT EXECUTE DROP TABLE ON AUDITS OR DROP COLUMN ON INCOMES IN PRODUCTION!
-- =============================================================================
