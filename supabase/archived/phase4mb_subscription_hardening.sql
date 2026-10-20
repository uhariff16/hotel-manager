-- ============================================================
-- STAY PILOT — PHASE 4M-B: SUBSCRIPTION HARDENING MIGRATION
-- UNEXECUTED PENDING MIGRATION — DO NOT EXECUTE WITHOUT APPROVAL
-- ============================================================

BEGIN;

-- 1. Add environment column to saas_subscriptions
ALTER TABLE public.saas_subscriptions 
ADD COLUMN IF NOT EXISTS environment TEXT NOT NULL DEFAULT 'test' 
CHECK (environment IN ('test', 'live'));

-- 2. Add cancel_at_period_end column if not existing
ALTER TABLE public.saas_subscriptions 
ADD COLUMN IF NOT EXISTS cancel_at_period_end BOOLEAN NOT NULL DEFAULT FALSE;

-- 3. Add checkout reservation lease tracking, reconciliation & transition consent columns
ALTER TABLE public.saas_subscriptions 
ADD COLUMN IF NOT EXISTS checkout_token TEXT DEFAULT NULL,
ADD COLUMN IF NOT EXISTS checkout_expires_at TIMESTAMPTZ DEFAULT NULL,
ADD COLUMN IF NOT EXISTS transition_consent_id UUID DEFAULT NULL;

-- 3B. Create Durable Server-Verified Legacy Transition Consents Table
CREATE TABLE IF NOT EXISTS public.saas_legacy_transition_consents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  target_plan_type TEXT NOT NULL,
  requested_by_user_id UUID NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '15 minutes'),
  used_at TIMESTAMPTZ DEFAULT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.saas_legacy_transition_consents ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.saas_legacy_transition_consents FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.saas_legacy_transition_consents TO authenticated;
GRANT ALL ON TABLE public.saas_legacy_transition_consents TO service_role;

-- 4. Backfill existing subscriptions to 'test' environment safely
UPDATE public.saas_subscriptions 
SET environment = 'test' 
WHERE environment IS NULL;

-- 5. Update is_trial_expired() function to enforce EXPLICIT ELIGIBLE PAID & LEGACY STATES
DROP FUNCTION IF EXISTS public.is_trial_expired CASCADE;
CREATE OR REPLACE FUNCTION is_trial_expired()
RETURNS BOOLEAN AS $$
DECLARE
  v_uid               UUID;
  v_tenant_id         UUID;
  v_role              TEXT;
  v_plan_type         TEXT;
  v_status            TEXT;
  v_ends_at           TIMESTAMP WITH TIME ZONE;
  v_is_legacy         BOOLEAN;
BEGIN
  v_uid := auth.uid();

  -- Rule 0: Unauthenticated request — do not block
  IF v_uid IS NULL THEN
    RETURN FALSE;
  END IF;

  -- Resolve role and tenant_id for this user (Tenant Admin or Staff)
  SELECT role, tenant_id
  INTO v_role, v_tenant_id
  FROM public.profiles
  WHERE id = v_uid;

  -- Rule 1: Super Admin — never blocked by trial enforcement
  IF v_role = 'super_admin' THEN
    RETURN FALSE;
  END IF;

  -- Rule 2: Orphaned account with no tenant — fail closed
  IF v_tenant_id IS NULL THEN
    RETURN TRUE;
  END IF;

  -- Fetch the owning Tenant Admin's billing state
  SELECT plan_type, subscription_status, trial_ends_at, is_legacy_account
  INTO v_plan_type, v_status, v_ends_at, v_is_legacy
  FROM public.profiles
  WHERE id = v_tenant_id;

  -- Rule 3: Manually suspended by Super Admin — block immediately
  IF v_status = 'suspended' THEN
    RETURN TRUE;
  END IF;

  -- Rule 4: Grandfathered Legacy Account — access permitted via explicit legacy entitlement
  -- Prevents non-legacy accounts with plan_type = 'free' whose paid sub or trial expired from getting free access.
  IF v_is_legacy = TRUE THEN
    RETURN FALSE;
  END IF;

  -- Rule 5: Paid Razorpay subscription — access permitted ONLY if:
  --   a) Subscription is in an EXPLICIT ELIGIBLE paid state: 'active' OR ('cancelled' AND cancel_at_period_end = TRUE)
  --   b) AND current_period_end IS NOT NULL AND current_period_end >= CURRENT_TIMESTAMP
  -- EXCLUDES: 'created', 'authenticated', 'checkout_pending', 'reconciliation_required', 'halted', 'completed', immediate cancellations ('cancelled' with cancel_at_period_end = FALSE)
  PERFORM 1
  FROM public.saas_subscriptions
  WHERE tenant_id = v_tenant_id
    AND (
      status = 'active'
      OR (status = 'cancelled' AND cancel_at_period_end = TRUE)
    )
    AND current_period_end IS NOT NULL
    AND current_period_end >= CURRENT_TIMESTAMP;
  IF FOUND THEN
    RETURN FALSE;
  END IF;

  -- Rule 6: Active trial — within the trial window, access permitted
  IF v_ends_at IS NOT NULL AND CURRENT_TIMESTAMP <= v_ends_at THEN
    RETURN FALSE;
  END IF;

  -- Rule 7: Catch-all — block unpaid, non-legacy free, unconfirmed, or expired accounts
  RETURN TRUE;

END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 6. Atomic Webhook & Verification Update RPC with Strict Subscription Ownership Matching & Enforced Captured Payment
DROP FUNCTION IF EXISTS public.process_subscription_webhook CASCADE;
CREATE OR REPLACE FUNCTION process_subscription_webhook(
  p_razorpay_sub_id TEXT,
  p_event_type TEXT,
  p_event_env TEXT,
  p_status TEXT,
  p_current_start TIMESTAMPTZ,
  p_current_end TIMESTAMPTZ,
  p_payment_id TEXT DEFAULT NULL,
  p_amount NUMERIC DEFAULT NULL,
  p_currency TEXT DEFAULT NULL,
  p_payment_status TEXT DEFAULT NULL,
  p_payment_method TEXT DEFAULT NULL,
  p_invoice_id TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_sub RECORD;
  v_new_period_end TIMESTAMPTZ;
  v_is_future BOOLEAN;
BEGIN
  -- Strict Ownership Matching: Lock saas_subscriptions row strictly by razorpay_subscription_id
  SELECT * INTO v_sub
  FROM public.saas_subscriptions
  WHERE razorpay_subscription_id = p_razorpay_sub_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'ignored', 'reason', 'Subscription ID mismatch or not found');
  END IF;

  -- Strict Environment Guard
  IF v_sub.environment <> p_event_env THEN
    RETURN jsonb_build_object('status', 'rejected', 'reason', 'Cross-environment mismatch');
  END IF;

  -- Monotonic timestamp guard: do not regress current_period_end. No invented 30-day fallbacks.
  IF p_current_end IS NOT NULL AND v_sub.current_period_end IS NOT NULL AND p_current_end < v_sub.current_period_end THEN
    v_new_period_end := v_sub.current_period_end;
  ELSE
    v_new_period_end := COALESCE(p_current_end, v_sub.current_period_end);
  END IF;

  -- 1. Mandate Authentication Event (subscription.authenticated)
  -- DOES NOT activate paid entitlement; records subscription state as authenticated pending captured payment.
  IF p_event_type = 'subscription.authenticated' THEN
    UPDATE public.saas_subscriptions
    SET status = 'authenticated',
        checkout_token = NULL,
        checkout_expires_at = NULL
    WHERE id = v_sub.id;

    RETURN jsonb_build_object('status', 'success', 'reason', 'Mandate authenticated, awaiting captured payment');

  -- 2. Verified Payment Capture & Activation Events
  ELSIF p_event_type IN ('subscription.activated', 'subscription.charged', 'verify_capture') THEN
    -- Enforce Captured Payment: Require non-NULL captured/paid payment status to grant paid access
    IF p_payment_status IS NULL OR p_payment_status NOT IN ('captured', 'paid') THEN
      RETURN jsonb_build_object('status', 'rejected', 'reason', 'Captured payment status required to grant paid access');
    END IF;

    -- Validate payment amount if parameter is supplied
    IF p_amount IS NOT NULL AND p_amount <= 0 THEN
      RETURN jsonb_build_object('status', 'rejected', 'reason', 'Invalid payment amount');
    END IF;

    -- Stale activation guard: do not reactivate halted/cancelled subscription unless new period_end is strictly greater
    IF v_sub.status IN ('halted', 'cancelled') AND p_current_end IS NOT NULL AND p_current_end <= v_sub.current_period_end THEN
      RETURN jsonb_build_object('status', 'ignored', 'reason', 'Stale activation event for terminated subscription');
    END IF;

    UPDATE public.saas_subscriptions
    SET status = 'active',
        current_period_start = COALESCE(p_current_start, current_period_start, NOW()),
        current_period_end = v_new_period_end,
        cancel_at_period_end = FALSE,
        checkout_token = NULL,
        checkout_expires_at = NULL
    WHERE id = v_sub.id;

    -- Update Profile plan ONLY if tenant is NOT a legacy account or if not demoting legacy Stay Master
    UPDATE public.profiles
    SET plan_type = v_sub.staypilot_plan_type
    WHERE id = v_sub.tenant_id
      AND (is_legacy_account IS NOT TRUE OR plan_type != 'premium');

  -- 3. Cancellation Events
  ELSIF p_event_type = 'subscription.cancelled' THEN
    v_is_future := (v_new_period_end IS NOT NULL AND v_new_period_end > NOW());
    
    UPDATE public.saas_subscriptions
    SET status = 'cancelled',
        cancel_at_period_end = v_is_future,
        checkout_token = NULL,
        checkout_expires_at = NULL
    WHERE id = v_sub.id;

    IF NOT v_is_future THEN
      UPDATE public.profiles
      SET plan_type = 'free'
      WHERE id = v_sub.tenant_id
        AND is_legacy_account IS NOT TRUE;
    END IF;

  -- 4. Halted / Completed Events
  ELSIF p_event_type IN ('subscription.halted', 'subscription.completed') THEN
    UPDATE public.saas_subscriptions
    SET status = p_status,
        cancel_at_period_end = FALSE,
        checkout_token = NULL,
        checkout_expires_at = NULL
    WHERE id = v_sub.id;

    UPDATE public.profiles
    SET plan_type = 'free'
    WHERE id = v_sub.tenant_id
      AND is_legacy_account IS NOT TRUE;
  END IF;

  -- Record Payment if present (with duplicate conflict handling)
  IF p_payment_id IS NOT NULL THEN
    INSERT INTO public.saas_payments (
      tenant_id, razorpay_payment_id, razorpay_subscription_id,
      razorpay_invoice_id, amount, currency, status, payment_method
    ) VALUES (
      v_sub.tenant_id, p_payment_id, p_razorpay_sub_id,
      p_invoice_id, p_amount, p_currency, p_payment_status, p_payment_method
    ) ON CONFLICT (razorpay_payment_id) DO NOTHING;
  END IF;

  RETURN jsonb_build_object('status', 'success', 'environment', p_event_env);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 7. Database-Backed Checkout Reservation Lease RPCs with Conflict & Expired Lease Protection
DROP FUNCTION IF EXISTS public.acquire_checkout_reservation CASCADE;
CREATE OR REPLACE FUNCTION acquire_checkout_reservation(
  p_tenant_id UUID,
  p_plan_type TEXT,
  p_environment TEXT
)
RETURNS JSONB AS $$
DECLARE
  v_sub RECORD;
  v_token TEXT;
BEGIN
  -- Ensure subscription row exists for tenant_id using atomic ON CONFLICT
  INSERT INTO public.saas_subscriptions (
    tenant_id, staypilot_plan_type, status, environment
  ) VALUES (
    p_tenant_id, p_plan_type, 'checkout_pending', p_environment
  ) ON CONFLICT (tenant_id) DO NOTHING;

  -- Lock saas_subscriptions row for update to serialize checkout initialization requests
  SELECT * INTO v_sub
  FROM public.saas_subscriptions
  WHERE tenant_id = p_tenant_id
  FOR UPDATE;

  -- 1. If tenant has an active paid subscription, block new checkout creation
  IF v_sub.status = 'active' THEN
    RETURN jsonb_build_object('status', 'blocked', 'reason', 'Active subscription exists', 'plan_type', v_sub.staypilot_plan_type);
  END IF;

  -- 2. If a checkout is flagged for reconciliation, block until reconciled
  IF v_sub.status = 'reconciliation_required' THEN
    RETURN jsonb_build_object('status', 'reconciliation_required', 'reason', 'Previous checkout attempt undergoing reconciliation');
  END IF;

  -- 3. If an unconfirmed 'created' checkout subscription exists for the same plan within 15 minutes, REUSE IT
  IF v_sub.status = 'created' AND v_sub.staypilot_plan_type = p_plan_type AND v_sub.created_at > (NOW() - INTERVAL '15 minutes') THEN
    RETURN jsonb_build_object(
      'status', 'reuse',
      'razorpay_subscription_id', v_sub.razorpay_subscription_id,
      'environment', v_sub.environment
    );
  END IF;

  -- 4. Check active reservation lease status
  IF v_sub.status = 'checkout_pending' THEN
    -- Only evaluate lease expiry if an active lease token was previously assigned
    IF v_sub.checkout_token IS NOT NULL AND v_sub.checkout_expires_at IS NOT NULL THEN
      IF v_sub.checkout_expires_at > NOW() THEN
        RETURN jsonb_build_object('status', 'pending_lease', 'reason', 'Concurrent checkout initialization in progress');
      ELSE
        -- EXPIRED LEASE: Edge Function crashed or timed out during external Razorpay call!
        -- Ambiguous outcome requires reconciliation; DO NOT permit duplicate checkout creation.
        UPDATE public.saas_subscriptions
        SET status = 'reconciliation_required',
            checkout_expires_at = NOW() + INTERVAL '24 hours'
        WHERE id = v_sub.id;

        RETURN jsonb_build_object('status', 'reconciliation_required', 'reason', 'Expired checkout lease requires reconciliation before retrying');
      END IF;
    END IF;
    -- If checkout_token IS NULL (fresh first-checkout initialization row), fall through to Step 5 to grant initial lease.
  END IF;

  -- 5. Otherwise, grant reservation lease to proceed with external Razorpay API call
  v_token := gen_random_uuid()::text;

  UPDATE public.saas_subscriptions
  SET status = 'checkout_pending',
      staypilot_plan_type = p_plan_type,
      environment = p_environment,
      checkout_token = v_token,
      checkout_expires_at = NOW() + INTERVAL '60 seconds'
  WHERE id = v_sub.id;

  RETURN jsonb_build_object('status', 'proceed', 'checkout_token', v_token);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 8. Hardened Confirm Checkout Reservation Lease RPC
DROP FUNCTION IF EXISTS public.confirm_checkout_reservation CASCADE;
CREATE OR REPLACE FUNCTION confirm_checkout_reservation(
  p_tenant_id UUID,
  p_checkout_token TEXT,
  p_razorpay_sub_id TEXT,
  p_razorpay_plan_id TEXT,
  p_plan_type TEXT,
  p_razorpay_customer_id TEXT,
  p_environment TEXT
)
RETURNS JSONB AS $$
DECLARE
  v_sub RECORD;
BEGIN
  SELECT * INTO v_sub
  FROM public.saas_subscriptions
  WHERE tenant_id = p_tenant_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'rejected', 'reason', 'Subscription record not found');
  END IF;

  -- 1. Never overwrite an active subscription with a late checkout confirmation
  IF v_sub.status = 'active' THEN
    RETURN jsonb_build_object('status', 'rejected', 'reason', 'Active subscription exists');
  END IF;

  -- 2. Validate expected reservation state
  IF v_sub.status <> 'checkout_pending' THEN
    RETURN jsonb_build_object('status', 'rejected', 'reason', 'Reservation not in checkout_pending state');
  END IF;

  -- 3. Validate checkout token match
  IF v_sub.checkout_token IS NULL OR v_sub.checkout_token <> p_checkout_token THEN
    RETURN jsonb_build_object('status', 'rejected', 'reason', 'Invalid or superseded checkout token');
  END IF;

  -- 4. Validate environment match
  IF v_sub.environment <> p_environment THEN
    RETURN jsonb_build_object('status', 'rejected', 'reason', 'Environment mismatch');
  END IF;

  -- Update subscription details upon valid confirmation
  UPDATE public.saas_subscriptions
  SET razorpay_subscription_id = p_razorpay_sub_id,
      razorpay_plan_id = p_razorpay_plan_id,
      razorpay_customer_id = p_razorpay_customer_id,
      staypilot_plan_type = p_plan_type,
      status = 'created',
      environment = p_environment,
      cancel_at_period_end = FALSE,
      checkout_token = NULL,
      checkout_expires_at = NULL
  WHERE id = v_sub.id;

  RETURN jsonb_build_object('status', 'success', 'razorpay_subscription_id', p_razorpay_sub_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 9. Hardened Mark Checkout Reconciliation Required RPC
DROP FUNCTION IF EXISTS public.mark_checkout_reconciliation_required CASCADE;
CREATE OR REPLACE FUNCTION mark_checkout_reconciliation_required(
  p_tenant_id UUID,
  p_checkout_token TEXT
)
RETURNS JSONB AS $$
DECLARE
  v_sub RECORD;
BEGIN
  SELECT * INTO v_sub
  FROM public.saas_subscriptions
  WHERE tenant_id = p_tenant_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'rejected', 'reason', 'Subscription record not found');
  END IF;

  -- Do not alter active or confirmed created subscriptions
  IF v_sub.status IN ('active', 'created') THEN
    RETURN jsonb_build_object('status', 'ignored', 'reason', 'Subscription already confirmed or active');
  END IF;

  -- Validate token
  IF v_sub.checkout_token IS NULL OR v_sub.checkout_token <> p_checkout_token THEN
    RETURN jsonb_build_object('status', 'rejected', 'reason', 'Invalid checkout token');
  END IF;

  UPDATE public.saas_subscriptions
  SET status = 'reconciliation_required',
      checkout_expires_at = NOW() + INTERVAL '24 hours'
  WHERE id = v_sub.id;

  RETURN jsonb_build_object('status', 'reconciliation_required');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 10. Hardened RPC to recover/resolve an abandoned checkout undergoing reconciliation
DROP FUNCTION IF EXISTS public.resolve_checkout_reconciliation CASCADE;
CREATE OR REPLACE FUNCTION resolve_checkout_reconciliation(
  p_tenant_id UUID,
  p_checkout_token TEXT,
  p_action TEXT, -- 'release' (confirmed no Razorpay sub created) or 'confirm' (Razorpay sub created)
  p_razorpay_sub_id TEXT DEFAULT NULL,
  p_razorpay_plan_id TEXT DEFAULT NULL,
  p_plan_type TEXT DEFAULT NULL,
  p_razorpay_customer_id TEXT DEFAULT NULL,
  p_environment TEXT DEFAULT 'test'
)
RETURNS JSONB AS $$
DECLARE
  v_sub RECORD;
BEGIN
  SELECT * INTO v_sub
  FROM public.saas_subscriptions
  WHERE tenant_id = p_tenant_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'rejected', 'reason', 'Subscription record not found');
  END IF;

  -- 1. Never overwrite an active subscription
  IF v_sub.status = 'active' THEN
    RETURN jsonb_build_object('status', 'rejected', 'reason', 'Active subscription exists');
  END IF;

  -- 2. Validate expected reservation state
  IF v_sub.status NOT IN ('reconciliation_required', 'checkout_pending') THEN
    RETURN jsonb_build_object('status', 'rejected', 'reason', 'Subscription not undergoing reconciliation');
  END IF;

  -- 3. Validate checkout token match to prevent stale recovery requests from altering state
  IF p_checkout_token IS NULL OR v_sub.checkout_token IS NULL OR v_sub.checkout_token <> p_checkout_token THEN
    RETURN jsonb_build_object('status', 'rejected', 'reason', 'Invalid or superseded checkout token');
  END IF;

  -- 4. Validate environment match
  IF v_sub.environment <> p_environment THEN
    RETURN jsonb_build_object('status', 'rejected', 'reason', 'Environment mismatch');
  END IF;

  IF p_action = 'release' THEN
    -- Confirmed no subscription was created at Razorpay: reset state to allow new checkout initialization
    UPDATE public.saas_subscriptions
    SET status = 'checkout_abandoned',
        checkout_token = NULL,
        checkout_expires_at = NULL
    WHERE id = v_sub.id;

    RETURN jsonb_build_object('status', 'released', 'message', 'Checkout reservation released safely');

  ELSIF p_action = 'confirm' THEN
    IF p_razorpay_sub_id IS NULL THEN
      RETURN jsonb_build_object('status', 'rejected', 'reason', 'razorpay_sub_id required for confirmation');
    END IF;

    UPDATE public.saas_subscriptions
    SET razorpay_subscription_id = p_razorpay_sub_id,
        razorpay_plan_id = COALESCE(p_razorpay_plan_id, v_sub.razorpay_plan_id),
        razorpay_customer_id = COALESCE(p_razorpay_customer_id, v_sub.razorpay_customer_id),
        staypilot_plan_type = COALESCE(p_plan_type, v_sub.staypilot_plan_type),
        status = 'created',
        environment = p_environment,
        cancel_at_period_end = FALSE,
        checkout_token = NULL,
        checkout_expires_at = NULL
    WHERE id = v_sub.id;

    RETURN jsonb_build_object('status', 'confirmed', 'razorpay_subscription_id', p_razorpay_sub_id);
  ELSE
    RETURN jsonb_build_object('status', 'rejected', 'reason', 'Invalid action');
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ============================================================
-- 6. DUAL-ENTITLEMENT DISTINCTION & SUPER ADMIN PLAN ASSIGNMENT
-- ============================================================

-- Add entitlement distinction columns to profiles table
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS entitlement_source TEXT DEFAULT 'standard',
ADD COLUMN IF NOT EXISTS assigned_by_admin_id UUID DEFAULT NULL,
ADD COLUMN IF NOT EXISTS assigned_at TIMESTAMPTZ DEFAULT NULL,
ADD COLUMN IF NOT EXISTS assignment_reason TEXT DEFAULT NULL;

-- Create Durable Super Admin Plan Assignment Audit Log Table (Retention-Safe)
CREATE TABLE IF NOT EXISTS public.saas_plan_assignment_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  old_plan_type TEXT,
  new_plan_type TEXT NOT NULL,
  entitlement_source TEXT NOT NULL DEFAULT 'super_admin_manual',
  acting_admin_id UUID NOT NULL,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.saas_plan_assignment_audit_logs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.saas_plan_assignment_audit_logs FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.saas_plan_assignment_audit_logs TO authenticated;
GRANT ALL ON TABLE public.saas_plan_assignment_audit_logs TO service_role;

-- Super Admin Manual Plan Assignment RPC Function (Hardened & Strict)
DROP FUNCTION IF EXISTS public.admin_assign_tenant_plan CASCADE;
CREATE OR REPLACE FUNCTION admin_assign_tenant_plan(
  p_tenant_id UUID,
  p_target_plan_type TEXT,
  p_reason TEXT
)
RETURNS JSONB AS $$
DECLARE
  v_acting_admin_id UUID := auth.uid();
  v_is_sa BOOLEAN;
  v_old_plan TEXT;
  v_is_legacy BOOLEAN;
  v_pricing_config JSONB;
  v_plan_valid BOOLEAN := FALSE;
BEGIN
  -- 1. Security Guard: Verify Super Admin Permission Server-Side
  SELECT (role = 'super_admin') INTO v_is_sa
  FROM public.profiles
  WHERE id = v_acting_admin_id;

  IF v_is_sa IS NOT TRUE THEN
    RETURN jsonb_build_object('status', 'rejected', 'reason', 'UNAUTHORIZED: Only Super Admins can assign plans manually.');
  END IF;

  -- 2. Validate Reason Input
  IF p_reason IS NULL OR TRIM(p_reason) = '' THEN
    RETURN jsonb_build_object('status', 'rejected', 'reason', 'REASON_REQUIRED: A valid assignment reason must be provided.');
  END IF;

  -- 3. Strict Validation of p_target_plan_type against Super Admin Authoritative Pricing Config
  SELECT COALESCE(global_settings->'pricing'->'published', global_settings->'pricing') INTO v_pricing_config
  FROM public.profiles
  WHERE role = 'super_admin' AND global_settings IS NOT NULL AND (global_settings ? 'pricing')
  ORDER BY created_at ASC LIMIT 1;

  IF v_pricing_config IS NOT NULL AND jsonb_typeof(v_pricing_config) = 'object' AND v_pricing_config <> '{}'::jsonb THEN
    IF v_pricing_config ? p_target_plan_type THEN
      IF (v_pricing_config->p_target_plan_type->>'enabled')::boolean IS NOT FALSE THEN
        v_plan_valid := TRUE;
      END IF;
    ELSE
      SELECT EXISTS (
        SELECT 1 FROM jsonb_each(v_pricing_config) AS p(k, v)
        WHERE (LOWER(p.k) = LOWER(p_target_plan_type) OR LOWER(v->>'name') = LOWER(p_target_plan_type))
          AND (v->>'enabled')::boolean IS NOT FALSE
      ) INTO v_plan_valid;
    END IF;

    IF NOT v_plan_valid THEN
      RETURN jsonb_build_object(
        'status', 'rejected', 
        'reason', FORMAT('INVALID_PLAN: Target plan_type ''%s'' is invalid or disabled in Super Admin pricing configuration.', p_target_plan_type)
      );
    END IF;
  ELSE
    -- Initial fallback ONLY if Super Admin global_settings.pricing is unhydrated
    IF p_target_plan_type IN ('free', 'custom_1786983013013', 'pro', 'premium') THEN
      v_plan_valid := TRUE;
    ELSE
      RETURN jsonb_build_object(
        'status', 'rejected',
        'reason', FORMAT('INVALID_PLAN: Target plan_type ''%s'' is not recognized.', p_target_plan_type)
      );
    END IF;
  END IF;

  -- 4. Lock Target Tenant Profile
  SELECT plan_type, is_legacy_account INTO v_old_plan, v_is_legacy
  FROM public.profiles
  WHERE id = p_tenant_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'rejected', 'reason', 'Tenant profile not found');
  END IF;

  -- 5. Update Tenant Profile Atomically (is_legacy_account PRESERVED EXACTLY AS IS)
  UPDATE public.profiles
  SET 
    plan_type = p_target_plan_type,
    subscription_status = 'active',
    entitlement_source = 'super_admin_manual',
    assigned_by_admin_id = v_acting_admin_id,
    assigned_at = NOW(),
    assignment_reason = TRIM(p_reason),
    updated_at = NOW()
  WHERE id = p_tenant_id;

  -- 6. Record Audit Log Entry
  INSERT INTO public.saas_plan_assignment_audit_logs (
    tenant_id, old_plan_type, new_plan_type, entitlement_source,
    acting_admin_id, reason, created_at
  ) VALUES (
    p_tenant_id, v_old_plan, p_target_plan_type, 'super_admin_manual',
    v_acting_admin_id, TRIM(p_reason), NOW()
  );

  RETURN jsonb_build_object(
    'status', 'success',
    'tenant_id', p_tenant_id,
    'old_plan_type', v_old_plan,
    'new_plan_type', p_target_plan_type,
    'entitlement_source', 'super_admin_manual',
    'is_legacy_account', v_is_legacy
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- 7. Trigger to Prevent Direct Unauthorized Modification of Entitlement Fields
DROP FUNCTION IF EXISTS public.protect_profile_entitlement_fields CASCADE;
CREATE OR REPLACE FUNCTION protect_profile_entitlement_fields()
RETURNS TRIGGER AS $$
DECLARE
  v_jwt_role TEXT;
  v_user_role TEXT;
BEGIN
  IF (OLD.entitlement_source IS DISTINCT FROM NEW.entitlement_source OR OLD.is_legacy_account IS DISTINCT FROM NEW.is_legacy_account) THEN
    -- Check if current process is service_role or background system process
    v_jwt_role := COALESCE(
      NULLIF(current_setting('request.jwt.claim.role', true), ''),
      NULLIF(current_setting('role', true), '')
    );

    IF v_jwt_role = 'service_role' OR current_user = 'service_role' OR current_user = 'postgres' THEN
      RETURN NEW;
    END IF;

    -- Check if auth.uid() is Super Admin
    IF auth.uid() IS NOT NULL THEN
      SELECT role INTO v_user_role FROM public.profiles WHERE id = auth.uid();
      IF v_user_role = 'super_admin' THEN
        RETURN NEW;
      END IF;
    END IF;

    RAISE EXCEPTION 'UNAUTHORIZED_FIELD_MODIFICATION: Only Super Admins or authorized service processes can alter entitlement_source or is_legacy_account.';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

DROP TRIGGER IF EXISTS trg_protect_profile_entitlements ON public.profiles;
CREATE TRIGGER trg_protect_profile_entitlements
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION protect_profile_entitlement_fields();

-- Revoke public execution on internal RPC functions for security
REVOKE EXECUTE ON FUNCTION process_subscription_webhook FROM PUBLIC;
GRANT EXECUTE ON FUNCTION process_subscription_webhook TO service_role;

REVOKE EXECUTE ON FUNCTION acquire_checkout_reservation FROM PUBLIC;
GRANT EXECUTE ON FUNCTION acquire_checkout_reservation TO service_role;

REVOKE EXECUTE ON FUNCTION confirm_checkout_reservation FROM PUBLIC;
GRANT EXECUTE ON FUNCTION confirm_checkout_reservation TO service_role;

REVOKE EXECUTE ON FUNCTION mark_checkout_reconciliation_required FROM PUBLIC;
GRANT EXECUTE ON FUNCTION mark_checkout_reconciliation_required TO service_role;

REVOKE EXECUTE ON FUNCTION resolve_checkout_reconciliation FROM PUBLIC;
GRANT EXECUTE ON FUNCTION resolve_checkout_reconciliation TO service_role;

REVOKE EXECUTE ON FUNCTION admin_assign_tenant_plan FROM PUBLIC;
GRANT EXECUTE ON FUNCTION admin_assign_tenant_plan TO authenticated, service_role;

COMMIT;
