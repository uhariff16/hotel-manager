-- ==============================================================================
-- ROLLBACK MIGRATION: rollback_20261019160000_update_qa_designation_environment_aware.sql
-- DESCRIPTION: Reverts set_account_qa_disposable to previous version from 20261019120000
--              while strictly preserving immutable audit logs.
-- STATUS: LOCAL PREPARATION (PENDING APPROVAL)
-- ==============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.set_account_qa_disposable(
  p_tenant_id uuid,
  p_is_disposable boolean,
  p_notes text DEFAULT NULL,
  p_actor_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_caller_id uuid;
  v_target public.profiles%ROWTYPE;
  v_canonical_admin uuid := '9c4e65f5-c0a1-4b3a-8ed2-d01175a73409'::uuid;
BEGIN
  IF auth.uid() IS NOT NULL THEN
    IF auth.uid() <> v_canonical_admin THEN
      RAISE EXCEPTION 'FORBIDDEN: Only the canonical Super Administrator can manage QA designations.'
        USING ERRCODE = '42501';
    END IF;
    v_caller_id := auth.uid();
  ELSIF auth.role() = 'service_role' OR current_user IN ('postgres', 'service_role') THEN
    IF p_actor_id IS NULL OR p_actor_id <> v_canonical_admin THEN
      RAISE EXCEPTION 'FORBIDDEN: Authoritative canonical actor ID required for service-role execution.'
        USING ERRCODE = '42501';
    END IF;
    v_caller_id := p_actor_id;
  ELSE
    RAISE EXCEPTION 'FORBIDDEN: Unauthorized execution context.'
      USING ERRCODE = '42501';
  END IF;

  IF p_tenant_id IS NULL THEN
    RAISE EXCEPTION 'INVALID_ARGUMENT: p_tenant_id is required.'
      USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_target FROM public.profiles WHERE id = p_tenant_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'TARGET_NOT_FOUND: Profile not found.'
      USING ERRCODE = 'P0002';
  END IF;

  IF v_target.role = 'super_admin' OR v_target.email IN ('uhariff@gmail.com', 'uhariff16@gmail.com') THEN
    RAISE EXCEPTION 'PROTECTED_ACCOUNT: Super Administrator accounts cannot be designated as disposable QA.'
      USING ERRCODE = '42501';
  END IF;

  IF v_target.id = '3797dba7-a7fd-4ca6-86cb-b45519953947'::uuid OR v_target.email = 'cheerfulchalet@gmail.com' THEN
    RAISE EXCEPTION 'PROTECTED_ACCOUNT: Cheerful Chalet account cannot be designated as disposable QA.'
      USING ERRCODE = '42501';
  END IF;

  IF p_is_disposable AND (
    EXISTS (SELECT 1 FROM public.saas_subscriptions WHERE tenant_id = p_tenant_id AND status IN ('active', 'authenticated')) OR
    EXISTS (SELECT 1 FROM public.saas_payments WHERE tenant_id = p_tenant_id AND status = 'captured') OR
    EXISTS (SELECT 1 FROM public.saas_invoices WHERE tenant_id = p_tenant_id AND invoice_status = 'issued')
  ) THEN
    RAISE EXCEPTION 'FINANCIAL_PROTECTION: Accounts with paid subscriptions, captured payments, or invoices cannot be designated as disposable QA.'
      USING ERRCODE = '42501';
  END IF;

  UPDATE public.profiles
  SET is_disposable_qa = p_is_disposable
  WHERE id = p_tenant_id;

  IF p_is_disposable THEN
    INSERT INTO public.disposable_qa_accounts (tenant_id, email, designated_by, designated_at, notes)
    VALUES (p_tenant_id, v_target.email, v_caller_id, now(), p_notes)
    ON CONFLICT (tenant_id) DO UPDATE
      SET designated_by = v_caller_id, designated_at = now(), notes = EXCLUDED.notes;
  ELSE
    DELETE FROM public.disposable_qa_accounts WHERE tenant_id = p_tenant_id;
  END IF;

  INSERT INTO public.super_admin_audit_logs (actor_id, action, target_id, target_email, metadata)
  VALUES (
    v_caller_id,
    CASE WHEN p_is_disposable THEN 'DESIGNATE_DISPOSABLE_QA' ELSE 'REVOKE_DISPOSABLE_QA' END,
    p_tenant_id,
    v_target.email,
    jsonb_build_object('is_disposable', p_is_disposable, 'notes', p_notes)
  );

  RETURN jsonb_build_object(
    'success', true,
    'tenant_id', p_tenant_id,
    'email', v_target.email,
    'is_disposable_qa', p_is_disposable
  );
END;
$$;

NOTIFY pgrst, 'reload schema';

COMMIT;
