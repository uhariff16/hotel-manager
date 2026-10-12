-- =============================================================================
-- STAY PILOT — PHASE 4M-E ROLLBACK SCRIPT
-- FILE: supabase/pending/rollback_20261012080000_phase4me_functional_integrity.sql
-- =============================================================================

-- 1. Drop triggers and trigger functions
DROP TRIGGER IF EXISTS trg_enforce_support_ticket_immutability ON public.support_tickets;
DROP FUNCTION IF EXISTS public.enforce_support_ticket_immutability();

DROP TRIGGER IF EXISTS trg_enforce_income_booking_linkage_guard ON public.incomes;
DROP FUNCTION IF EXISTS public.enforce_income_booking_linkage_guard();

DROP TRIGGER IF EXISTS trg_enforce_booking_direct_delete_guard ON public.bookings;
DROP FUNCTION IF EXISTS public.enforce_booking_direct_delete_guard();

-- 2. Drop the added functions
DROP FUNCTION IF EXISTS public.sync_booking_advance_payment(UUID, NUMERIC, TEXT);
DROP FUNCTION IF EXISTS public.record_checkout_settlement(UUID, NUMERIC, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.revert_booking_to_checkin(UUID);
DROP FUNCTION IF EXISTS public.reconcile_legacy_settlement_reversal(UUID, UUID);
DROP FUNCTION IF EXISTS public.delete_booking_with_financials(UUID, TEXT);
DROP FUNCTION IF EXISTS public.get_published_global_settings();

-- 3. Restore original incomes & bookings RLS policies
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

DROP POLICY IF EXISTS "Tenant Admin Delete Bookings" ON public.bookings;
CREATE POLICY "Tenant Admin Delete Bookings" ON public.bookings
  FOR DELETE TO public
  USING (
    ((((auth.uid() = tenant_id) OR belongs_to_tenant(tenant_id)) AND (get_auth_profile_role() = 'tenant_admin'::text) AND (is_trial_expired() = false)) OR is_super_admin())
  );

-- 4. Restore original support tickets RLS policies
DROP POLICY IF EXISTS "Tenant Team create tickets" ON public.support_tickets;
DROP POLICY IF EXISTS "Tenant Team view tickets" ON public.support_tickets;
DROP POLICY IF EXISTS "Tenant Team update tickets" ON public.support_tickets;

CREATE POLICY "Tenants create tickets" ON public.support_tickets
  FOR INSERT TO public
  WITH CHECK (
    ((tenant_id = auth.uid()) OR is_super_admin())
  );

CREATE POLICY "Tenants view own tickets" ON public.support_tickets
  FOR SELECT TO public
  USING (
    ((tenant_id = auth.uid()) OR is_super_admin())
  );

CREATE POLICY "Tenants update own tickets" ON public.support_tickets
  FOR UPDATE TO public
  USING (
    ((tenant_id = auth.uid()) OR is_super_admin())
  );

-- 5. Restore original support messages RLS policies
DROP POLICY IF EXISTS "Tenant Team insert messages" ON public.support_messages;
DROP POLICY IF EXISTS "Tenant Team view messages" ON public.support_messages;

CREATE POLICY "Insert messages to owned tickets" ON public.support_messages
  FOR INSERT TO public
  WITH CHECK (
    (is_super_admin() OR ((sender_id = auth.uid()) AND (ticket_id IN (
      SELECT id FROM public.support_tickets WHERE support_tickets.tenant_id = auth.uid()
    ))))
  );

CREATE POLICY "View messages for owned tickets" ON public.support_messages
  FOR SELECT TO public
  USING (
    (is_super_admin() OR (ticket_id IN (
      SELECT id FROM public.support_tickets WHERE support_tickets.tenant_id = auth.uid()
    )))
  );

-- 5b. Restore DELETE grant on bookings table to authenticated role
GRANT DELETE ON public.bookings TO authenticated;

-- 6. Drop private schema and session table
DROP TABLE IF EXISTS private.active_booking_deletion_sessions;
DROP SCHEMA IF EXISTS private CASCADE;

-- 7. Drop audit table
DROP TABLE IF EXISTS public.booking_deletion_audits;

-- 8. Drop structured constraint, index, and columns from public.incomes
DROP INDEX IF EXISTS public.uq_incomes_one_reversal_per_settlement;
DROP INDEX IF EXISTS public.idx_incomes_booking_tx_type;
ALTER TABLE public.incomes DROP CONSTRAINT IF EXISTS incomes_parent_income_id_fkey;
ALTER TABLE public.incomes DROP CONSTRAINT IF EXISTS incomes_transaction_type_check;
ALTER TABLE public.incomes DROP COLUMN IF EXISTS parent_income_id;
ALTER TABLE public.incomes DROP COLUMN IF EXISTS transaction_type;
