CREATE OR REPLACE FUNCTION set_trial_defaults()
RETURNS trigger AS $$
DECLARE
  v_plan_type TEXT;
  v_trial_enabled BOOLEAN;
  v_trial_days INT;
  v_global_pricing JSONB;
  v_plan_config JSONB;
BEGIN
  IF NEW.role = 'tenant_admin' THEN
    v_plan_type := NEW.plan_type;
    IF v_plan_type IS NULL THEN
      v_plan_type := 'free';
    END IF;

    -- Fetch global settings from super_admin
    SELECT global_settings->'pricing' INTO v_global_pricing
    FROM profiles
    WHERE role = 'super_admin'
    LIMIT 1;

    -- Extract plan config
    v_plan_config := v_global_pricing->v_plan_type;
    
    -- Default to true and 30 if not found, just in case
    v_trial_enabled := COALESCE((v_plan_config->>'trialEnabled')::BOOLEAN, false);
    v_trial_days := COALESCE((v_plan_config->>'trialDurationDays')::INT, 30);

    IF v_trial_enabled THEN
      NEW.trial_started_at := NOW();
      NEW.trial_ends_at := NOW() + (v_trial_days || ' days')::INTERVAL;
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
