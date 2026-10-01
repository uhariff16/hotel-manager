CREATE OR REPLACE FUNCTION is_trial_expired()
RETURNS BOOLEAN AS $$
DECLARE
  v_uid        UUID;
  v_tenant_id  UUID;
  v_role       TEXT;
  v_plan_type  TEXT;
  v_status     TEXT;
  v_ends_at    TIMESTAMP WITH TIME ZONE;
BEGIN
  v_uid := auth.uid();

  -- Rule 0: Unauthenticated request — do not block
  IF v_uid IS NULL THEN
    RETURN FALSE;
  END IF;

  -- Resolve role and tenant_id for this user (staff or owner)
  SELECT role, tenant_id INTO v_role, v_tenant_id
  FROM profiles
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
  -- For staff, tenant_id points to their Tenant Admin's profiles.id.
  SELECT plan_type, subscription_status, trial_ends_at
  INTO v_plan_type, v_status, v_ends_at
  FROM profiles
  WHERE id = v_tenant_id;

  -- Rule 3: Manually suspended by Super Admin — block immediately,
  -- regardless of trial or payment status.
  IF v_status = 'suspended' THEN
    RETURN TRUE;
  END IF;

  -- Rule 4: Grandfathered Free Starter — never blocked by trial enforcement.
  IF v_plan_type = 'free' THEN
    RETURN FALSE;
  END IF;

  -- Rule 5: Active Razorpay subscription — paid customer, access permitted.
  -- This is the authoritative paid-access check. The Razorpay webhook writes
  -- saas_subscriptions.status = 'active' on activation/payment, meaning a
  -- successful payment immediately unlocks an expired trial without requiring
  -- any change to profiles.subscription_status.
  PERFORM 1
  FROM saas_subscriptions
  WHERE tenant_id = v_tenant_id
    AND status = 'active';
  IF FOUND THEN
    RETURN FALSE;
  END IF;

  -- Rule 6: Legacy pre-trial customer safety net.
  -- Legitimate paid customers created before the trial system existed have:
  --   subscription_status = 'active'  (DB default, never changed)
  --   trial_ends_at IS NULL           (trial system did not exist at signup)
  --   no saas_subscriptions row       (manual activation)
  -- These must not be accidentally blocked. The combination of 'active' status
  -- AND no trial dates is the reliable discriminator for this cohort.
  -- New trial signups will always have trial_ends_at IS NOT NULL (enforced by
  -- set_trial_defaults() which fails closed if trialEnabled=true and days<1).
  IF v_status = 'active' AND v_ends_at IS NULL THEN
    RETURN FALSE;
  END IF;

  -- Rule 7: Active trial — within the trial window, access permitted.
  IF v_ends_at IS NOT NULL AND CURRENT_TIMESTAMP <= v_ends_at THEN
    RETURN FALSE;
  END IF;

  -- Rule 8: Trial expired and no active paid subscription — block.
  -- Also catches any edge case where trial_ends_at IS NULL but subscription_status
  -- is not 'active' (should not occur after set_trial_defaults fix, but fail-closed).
  RETURN TRUE;

END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Drop the old check_trial_status RPC if it still exists
DROP FUNCTION IF EXISTS check_trial_status(UUID);
