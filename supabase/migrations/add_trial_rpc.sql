CREATE OR REPLACE FUNCTION check_trial_status(p_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  v_ends_at TIMESTAMP WITH TIME ZONE;
  v_status TEXT;
BEGIN
  SELECT trial_ends_at, subscription_status INTO v_ends_at, v_status
  FROM profiles
  WHERE id = p_id;
  
  IF v_status = 'active' THEN
    RETURN FALSE;
  END IF;

  IF v_ends_at IS NULL THEN
    RETURN FALSE;
  END IF;

  RETURN CURRENT_TIMESTAMP > v_ends_at;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
