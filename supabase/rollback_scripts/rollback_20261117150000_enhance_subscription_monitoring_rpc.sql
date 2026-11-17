-- =============================================================================
-- ROLLBACK CANDIDATE: 20261117150000_enhance_subscription_monitoring_rpc.sql
-- Application: StayPilot SaaS
--
-- PURPOSE:
-- Reverts public.get_saas_subscription_monitoring_inventory() to the baseline
-- definition established in migration 20261117100000.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.get_saas_subscription_monitoring_inventory()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller_id uuid := auth.uid();
  v_is_authorized boolean;
  v_result jsonb;
BEGIN
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Authentication required.' USING ERRCODE = '42501';
  END IF;

  SELECT public.can_view_saas_billing_monitoring(v_caller_id) INTO v_is_authorized;
  IF NOT v_is_authorized THEN
    RAISE EXCEPTION 'FORBIDDEN: Subscription monitoring access required.' USING ERRCODE = '42501';
  END IF;

  SELECT jsonb_build_object(
    'subscriptions', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', s.id,
          'tenant_id', s.tenant_id,
          'razorpay_customer_id', s.razorpay_customer_id,
          'razorpay_subscription_id', s.razorpay_subscription_id,
          'razorpay_plan_id', s.razorpay_plan_id,
          'staypilot_plan_type', s.staypilot_plan_type,
          'plan_type', COALESCE(s.staypilot_plan_type, 'solo'),
          'status', s.status,
          'current_period_start', s.current_period_start,
          'current_period_end', s.current_period_end,
          'cancel_at_period_end', s.cancel_at_period_end,
          'environment', s.environment,
          'checkout_expires_at', s.checkout_expires_at,
          'created_at', s.created_at,
          'updated_at', s.updated_at
        ) ORDER BY s.created_at DESC
      ) FROM public.saas_subscriptions s
    ), '[]'::jsonb),

    'payments', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', p.id,
          'tenant_id', p.tenant_id,
          'razorpay_payment_id', p.razorpay_payment_id,
          'razorpay_subscription_id', p.razorpay_subscription_id,
          'razorpay_invoice_id', p.razorpay_invoice_id,
          'amount', p.amount,
          'currency', p.currency,
          'status', p.status,
          'environment', p.environment,
          'created_at', p.created_at
        ) ORDER BY p.created_at DESC
      ) FROM public.saas_payments p
    ), '[]'::jsonb),

    'invoices', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', i.id,
          'invoice_number', i.invoice_number,
          'tenant_id', i.tenant_id,
          'payment_id', i.payment_id,
          'subscription_id', i.subscription_id,
          'razorpay_payment_id', i.razorpay_payment_id,
          'environment', i.environment,
          'plan_type', i.plan_type,
          'total_amount_paise', i.total_amount_paise,
          'status', COALESCE(i.invoice_status, 'paid'),
          'issued_at', i.issued_at,
          'created_at', i.created_at
        ) ORDER BY i.created_at DESC
      ) FROM public.saas_invoices i
    ), '[]'::jsonb),

    'profiles', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', pr.id,
          'full_name', pr.full_name,
          'email', pr.email,
          'role', pr.role,
          'plan_type', pr.plan_type,
          'subscription_status', pr.subscription_status,
          'trial_started_at', pr.trial_started_at,
          'trial_ends_at', pr.trial_ends_at,
          'is_legacy_account', pr.is_legacy_account
        )
      ) FROM public.profiles pr
      WHERE pr.role IN ('tenant_admin', 'staff', 'super_admin', 'billing_admin')
    ), '[]'::jsonb),

    'resorts', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', r.id,
          'tenant_id', r.tenant_id,
          'name', r.name
        )
      ) FROM public.resorts r
    ), '[]'::jsonb)
  ) INTO v_result;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.get_saas_subscription_monitoring_inventory() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_saas_subscription_monitoring_inventory() TO authenticated, service_role;
