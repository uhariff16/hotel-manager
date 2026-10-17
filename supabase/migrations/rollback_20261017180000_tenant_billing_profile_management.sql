-- ==============================================================================
-- ROLLBACK MIGRATION: rollback_20261017180000_tenant_billing_profile_management.sql
-- PURPOSE: Safely drop tenant billing profile RPCs
-- ==============================================================================

DROP FUNCTION IF EXISTS public.save_tenant_billing_profile(jsonb, uuid);
DROP FUNCTION IF EXISTS public.save_tenant_billing_profile(jsonb);
DROP FUNCTION IF EXISTS public.get_tenant_billing_profile(uuid);
DROP FUNCTION IF EXISTS public.get_tenant_billing_profile();
DROP FUNCTION IF EXISTS public.save_tenant_guest_gst_settings(jsonb, jsonb, uuid);
DROP FUNCTION IF EXISTS public.save_tenant_guest_gst_settings(jsonb, jsonb);
