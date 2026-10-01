-- ============================================================
-- Script C: Replace is_trial_expired()
-- Run after Script B-verify confirms the backfill.
-- SECURITY DEFINER + SET search_path = public means unqualified
-- names are already safe, but all table references use explicit
-- public. qualification for auditability.
-- ============================================================

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

  -- Fetch the owning Tenant Admin's billing state.
  -- For Staff, tenant_id points to their Tenant Admin's profiles.id.
  SELECT plan_type, subscription_status, trial_ends_at, is_legacy_account
  INTO v_plan_type, v_status, v_ends_at, v_is_legacy
  FROM public.profiles
  WHERE id = v_tenant_id;

  -- Rule 3: Manually suspended by Super Admin — block immediately,
  -- regardless of trial, legacy status, or payment status.
  IF v_status = 'suspended' THEN
    RETURN TRUE;
  END IF;

  -- Rule 4: Grandfathered Free Starter — never blocked by trial enforcement.
  IF v_plan_type = 'free' THEN
    RETURN FALSE;
  END IF;

  -- Rule 5: Active Razorpay subscription — paid customer, access permitted.
  -- The Razorpay webhook writes saas_subscriptions.status='active' on
  -- payment/activation, immediately unlocking an expired trial without
  -- requiring any change to profiles.subscription_status.
  PERFORM 1
  FROM public.saas_subscriptions
  WHERE tenant_id = v_tenant_id
    AND status = 'active';
  IF FOUND THEN
    RETURN FALSE;
  END IF;

  -- Rule 6: Explicit legacy pre-trial account — access permitted.
  -- is_legacy_account=TRUE is set by a one-time backfill for Tenant Admins
  -- created before the trial system existed (non-free, no trial dates, no
  -- active Razorpay subscription at the time of backfill).
  -- New signups always receive is_legacy_account=FALSE (column default).
  -- This is a durable, explicit discriminator — not inferred from NULL dates,
  -- which would also match new signups on plans where trialEnabled=false.
  IF v_is_legacy = TRUE THEN
    RETURN FALSE;
  END IF;

  -- Rule 7: Active trial — within the trial window, access permitted.
  IF v_ends_at IS NOT NULL AND CURRENT_TIMESTAMP <= v_ends_at THEN
    RETURN FALSE;
  END IF;

  -- Rule 8: Catch-all — block. Covers:
  --   • New signup, trialEnabled=false: is_legacy=FALSE, trial_ends_at=NULL → blocked ✓
  --   • New signup, trial expired, no paid sub: trial_ends_at < NOW() → blocked ✓
  --   • Any other unpaid, non-legacy, non-free account → blocked (fail closed) ✓
  RETURN TRUE;

END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Drop the old check_trial_status alias if it still exists
DROP FUNCTION IF EXISTS check_trial_status(UUID);
