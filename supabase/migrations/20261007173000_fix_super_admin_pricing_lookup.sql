-- Migration: 20261007173000_fix_super_admin_pricing_lookup.sql
-- Description: Fix set_trial_defaults() to deterministically select populated super_admin global_settings.pricing

CREATE OR REPLACE FUNCTION public.set_trial_defaults()
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

    -- Fetch global settings from super_admin with strict, deterministic validation
    SELECT global_settings->'pricing' INTO v_global_pricing
    FROM public.profiles
    WHERE role = 'super_admin'
      AND global_settings IS NOT NULL
      AND global_settings ? 'pricing'
      AND jsonb_typeof(global_settings->'pricing') = 'object'
      AND global_settings->'pricing' <> '{}'::jsonb
    ORDER BY created_at ASC
    LIMIT 1;

    IF v_global_pricing IS NULL THEN
      RAISE EXCEPTION 'Global pricing configuration not found.';
    END IF;

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
    v_trial_days    := COALESCE((v_plan_config->>'trialDurationDays')::INT, 0);

    IF v_trial_enabled THEN
      IF v_trial_days < 1 THEN
        RAISE EXCEPTION
          'Plan "%" has trialEnabled=true but trialDurationDays is missing or invalid (%). Set a valid trial duration (minimum 1 day) in Super Admin before new signups can proceed.',
          v_plan_type, v_trial_days;
      END IF;
      NEW.trial_started_at := CURRENT_TIMESTAMP;
      NEW.trial_ends_at    := CURRENT_TIMESTAMP + (v_trial_days || ' days')::INTERVAL;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
