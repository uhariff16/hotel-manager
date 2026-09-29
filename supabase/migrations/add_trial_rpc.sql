CREATE OR REPLACE FUNCTION is_trial_expired()
RETURNS BOOLEAN AS $$
DECLARE
  v_uid UUID;
  v_tenant_id UUID;
  v_ends_at TIMESTAMP WITH TIME ZONE;
  v_status TEXT;
  v_role TEXT;
  v_plan_type TEXT;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RETURN FALSE;
  END IF;

  -- Find the tenant_id for the given authenticated user (staff or owner)
  SELECT tenant_id, role INTO v_tenant_id, v_role
  FROM profiles
  WHERE id = v_uid;

  -- Super admins are never blocked by trial.
  IF v_role = 'super_admin' THEN
    RETURN FALSE;
  END IF;

  -- If no tenant is found (orphaned), we return true to block operational access safely
  IF v_tenant_id IS NULL THEN
    RETURN TRUE;
  END IF;

  -- Fetch the subscription/trial info from the actual tenant admin's profile
  SELECT trial_ends_at, subscription_status, plan_type INTO v_ends_at, v_status, v_plan_type
  FROM profiles
  WHERE id = v_tenant_id;
  
  -- If they have an active Razorpay subscription, trial expiry is ignored
  IF v_status = 'active' THEN
    RETURN FALSE;
  END IF;

  -- If they don't have a trial end date, allow ONLY if they are grandfathered Free Starter
  IF v_ends_at IS NULL THEN
    IF v_plan_type = 'free' THEN
      RETURN FALSE;
    ELSE
      -- Malformed or non-paid non-free tenant without a trial date fails closed
      RETURN TRUE;
    END IF;
  END IF;

  -- The trial is expired if current server time is past the end date
  RETURN CURRENT_TIMESTAMP > v_ends_at;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Drop the old one just in case
DROP FUNCTION IF EXISTS check_trial_status(UUID);
