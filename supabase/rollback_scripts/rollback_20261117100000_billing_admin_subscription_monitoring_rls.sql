-- =============================================================================
-- ROLLBACK CANDIDATE: 20261117100000_billing_admin_subscription_monitoring_rls.sql
-- Application: StayPilot SaaS
--
-- PURPOSE:
-- Safely drop the dedicated monitoring RPC and helper function introduced in
-- the least-privilege remediation migration.
-- =============================================================================

DROP FUNCTION IF EXISTS public.get_saas_subscription_monitoring_inventory();
DROP FUNCTION IF EXISTS public.can_view_saas_billing_monitoring(uuid);
