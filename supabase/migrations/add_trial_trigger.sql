CREATE OR REPLACE FUNCTION set_trial_defaults()
RETURNS trigger AS $$
DECLARE
  v_plan_type TEXT;
  v_trial_enabled BOOLEAN;
  v_trial_days INT;
  v_global_pricing JSONB;
  v_plan_config JSONB;
  v_plan_enabled BOOLEAN;
BEGIN
  IF NEW.role = 'tenant_admin' THEN
    v_plan_type := NEW.plan_type;
    
    -- Reject missing plan or free plan for new signups
    IF v_plan_type IS NULL OR v_plan_type = 'free' THEN
      RAISE EXCEPTION 'Invalid or deprecated plan selected for new signup.';
    END IF;

    -- Fetch global settings from super_admin
    SELECT global_settings->'pricing' INTO v_global_pricing
    FROM profiles
    WHERE role = 'super_admin'
    LIMIT 1;

    -- Extract plan config
    v_plan_config := v_global_pricing->v_plan_type;
    
    IF v_plan_config IS NULL THEN
      RAISE EXCEPTION 'Selected plan does not exist.';
    END IF;

    v_plan_enabled := COALESCE((v_plan_config->>'enabled')::BOOLEAN, false);
    IF NOT v_plan_enabled THEN
      RAISE EXCEPTION 'Selected plan is not enabled for new signups.';
    END IF;
    
    v_trial_enabled := COALESCE((v_plan_config->>'trialEnabled')::BOOLEAN, false);
    v_trial_days := COALESCE((v_plan_config->>'trialDurationDays')::INT, 30);

    IF v_trial_enabled THEN
      NEW.trial_started_at := CURRENT_TIMESTAMP;
      NEW.trial_ends_at := CURRENT_TIMESTAMP + (v_trial_days || ' days')::INTERVAL;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_set_trial_defaults ON profiles;
CREATE TRIGGER trigger_set_trial_defaults
  BEFORE INSERT ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION set_trial_defaults();
