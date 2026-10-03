-- ============================================================
-- STAY PILOT — PHASE 2B HARDENED BACKEND ENTITLEMENT ENFORCEMENT
-- AUTHORITATIVE MIGRATION
-- ============================================================

-- 1. Helper Function: Target Tenant Operational Access Resolver (INTERNAL)
CREATE OR REPLACE FUNCTION public.is_tenant_operational(p_tenant_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  v_role         TEXT;
  v_plan_type    TEXT;
  v_status       TEXT;
  v_ends_at      TIMESTAMPTZ;
  v_is_legacy    BOOLEAN;
BEGIN
  IF p_tenant_id IS NULL THEN RETURN FALSE; END IF;

  SELECT role, plan_type, subscription_status, trial_ends_at, is_legacy_account
  INTO v_role, v_plan_type, v_status, v_ends_at, v_is_legacy
  FROM public.profiles
  WHERE id = p_tenant_id;

  IF v_role IS NULL THEN RETURN FALSE; END IF;
  IF v_role = 'super_admin' THEN RETURN TRUE; END IF;
  IF v_status = 'suspended' THEN RETURN FALSE; END IF;
  IF v_plan_type = 'free' THEN RETURN TRUE; END IF;

  PERFORM 1 FROM public.saas_subscriptions
  WHERE tenant_id = p_tenant_id AND status = 'active';
  IF FOUND THEN RETURN TRUE; END IF;

  IF v_is_legacy = TRUE THEN RETURN TRUE; END IF;
  IF v_ends_at IS NOT NULL AND CURRENT_TIMESTAMP <= v_ends_at THEN RETURN TRUE; END IF;

  RETURN FALSE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;


-- 2. Helper Function: Dynamic Backend Plan Resolver (INTERNAL)
CREATE OR REPLACE FUNCTION public.resolve_effective_plan_sql(p_tenant_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_raw_plan      TEXT;
  v_pricing_json  JSONB;
  v_plan_config   JSONB;
  v_lower_raw     TEXT;
  v_rec_key       TEXT;
  v_rec_val       JSONB;
  v_resorts_raw   JSONB;
  v_rooms_raw     JSONB;
  v_staff_raw     JSONB;
  v_resorts       INT;
  v_rooms         INT;
  v_staff         INT;
  v_matched_key   TEXT := NULL;
BEGIN
  IF p_tenant_id IS NULL THEN
    RETURN jsonb_build_object('is_unknown_plan', true, 'error_code', 'ENTITLEMENT_PLAN_UNKNOWN', 'maxResorts', 0, 'maxRooms', 0, 'maxStaff', 0);
  END IF;

  SELECT plan_type INTO v_raw_plan FROM public.profiles WHERE id = p_tenant_id;

  IF v_raw_plan IS NULL OR trim(v_raw_plan) = '' THEN
    RETURN jsonb_build_object('is_unknown_plan', true, 'error_code', 'ENTITLEMENT_PLAN_UNKNOWN', 'maxResorts', 0, 'maxRooms', 0, 'maxStaff', 0);
  END IF;

  v_lower_raw := lower(trim(v_raw_plan));

  SELECT global_settings->'pricing' INTO v_pricing_json
  FROM public.profiles
  WHERE role = 'super_admin'
    AND global_settings IS NOT NULL
    AND global_settings->'pricing' IS NOT NULL
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_pricing_json IS NULL THEN
    RETURN jsonb_build_object('is_unknown_plan', true, 'error_code', 'ENTITLEMENT_PLAN_UNKNOWN', 'maxResorts', 0, 'maxRooms', 0, 'maxStaff', 0);
  END IF;

  -- Direct Match
  IF v_pricing_json ? v_raw_plan THEN
    v_matched_key := v_raw_plan;
    v_plan_config := v_pricing_json -> v_raw_plan;
  END IF;

  -- Case-Insensitive or Display Name Match
  IF v_matched_key IS NULL THEN
    FOR v_rec_key, v_rec_val IN SELECT * FROM jsonb_each(v_pricing_json)
    LOOP
      IF lower(v_rec_key) = v_lower_raw OR lower(coalesce(v_rec_val->>'name', '')) = v_lower_raw THEN
        v_matched_key := v_rec_key;
        v_plan_config := v_rec_val;
        EXIT;
      END IF;
    END LOOP;
  END IF;

  -- Historical Alias Match
  IF v_matched_key IS NULL THEN
    IF v_lower_raw IN ('free', 'free starter', 'freestarter', 'starter') THEN
      IF v_pricing_json ? 'free' THEN v_matched_key := 'free'; v_plan_config := v_pricing_json -> 'free'; END IF;
    ELSIF v_lower_raw = 'solo' THEN
      IF v_pricing_json ? 'custom_1786983013013' THEN v_matched_key := 'custom_1786983013013'; v_plan_config := v_pricing_json -> 'custom_1786983013013';
      ELSIF v_pricing_json ? 'solo' THEN v_matched_key := 'solo'; v_plan_config := v_pricing_json -> 'solo'; END IF;
    ELSIF v_lower_raw IN ('growth', 'pro') THEN
      IF v_pricing_json ? 'pro' THEN v_matched_key := 'pro'; v_plan_config := v_pricing_json -> 'pro';
      ELSIF v_pricing_json ? 'growth' THEN v_matched_key := 'growth'; v_plan_config := v_pricing_json -> 'growth'; END IF;
    ELSIF v_lower_raw IN ('stay master', 'staymaster', 'premium', 'luxury') THEN
      IF v_pricing_json ? 'premium' THEN v_matched_key := 'premium'; v_plan_config := v_pricing_json -> 'premium';
      ELSIF v_pricing_json ? 'staymaster' THEN v_matched_key := 'staymaster'; v_plan_config := v_pricing_json -> 'staymaster'; END IF;
    END IF;
  END IF;

  IF v_matched_key IS NULL OR v_plan_config IS NULL THEN
    RETURN jsonb_build_object('is_unknown_plan', true, 'error_code', 'ENTITLEMENT_PLAN_UNKNOWN', 'maxResorts', 0, 'maxRooms', 0, 'maxStaff', 0);
  END IF;

  -- Strict Integer Limit Validation
  v_resorts_raw := v_plan_config -> 'maxResorts';
  v_rooms_raw := v_plan_config -> 'maxRooms';
  v_staff_raw := v_plan_config -> 'maxStaff';

  IF v_resorts_raw IS NULL OR v_rooms_raw IS NULL OR v_staff_raw IS NULL
     OR jsonb_typeof(v_resorts_raw) != 'number'
     OR jsonb_typeof(v_rooms_raw) != 'number'
     OR jsonb_typeof(v_staff_raw) != 'number' THEN
    RETURN jsonb_build_object('is_unknown_plan', true, 'error_code', 'ENTITLEMENT_PLAN_INVALID', 'maxResorts', 0, 'maxRooms', 0, 'maxStaff', 0);
  END IF;

  IF (v_resorts_raw::text)::numeric != trunc((v_resorts_raw::text)::numeric) OR (v_resorts_raw::text)::numeric < 0
     OR (v_rooms_raw::text)::numeric != trunc((v_rooms_raw::text)::numeric) OR (v_rooms_raw::text)::numeric < 0
     OR (v_staff_raw::text)::numeric != trunc((v_staff_raw::text)::numeric) OR (v_staff_raw::text)::numeric < 0 THEN
    RETURN jsonb_build_object('is_unknown_plan', true, 'error_code', 'ENTITLEMENT_PLAN_INVALID', 'maxResorts', 0, 'maxRooms', 0, 'maxStaff', 0);
  END IF;

  v_resorts := (v_resorts_raw::text)::numeric::INT;
  v_rooms := (v_rooms_raw::text)::numeric::INT;
  v_staff := (v_staff_raw::text)::numeric::INT;

  RETURN jsonb_build_object('is_unknown_plan', false, 'planKey', v_matched_key, 'config', v_plan_config,
    'maxResorts', v_resorts, 'maxRooms', v_rooms, 'maxStaff', v_staff);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;


-- 3. Trigger Function: Property Enforcement (cottages)
CREATE OR REPLACE FUNCTION public.enforce_cottage_entitlement()
RETURNS TRIGGER AS $$
DECLARE
  v_resort_tenant UUID;
  v_plan_res JSONB;
  v_max_resorts INT;
  v_count INT;
BEGIN
  -- 1. Relational Hierarchy Validation (ALWAYS, including Super Admin)
  IF NEW.resort_id IS NOT NULL THEN
    SELECT tenant_id INTO v_resort_tenant FROM public.resorts WHERE id = NEW.resort_id;
    IF v_resort_tenant IS NULL THEN
      RAISE EXCEPTION 'RESOURCE_TENANT_MISMATCH: Target resort_id does not exist.';
    END IF;

    IF NEW.tenant_id IS NULL THEN NEW.tenant_id := v_resort_tenant;
    ELSIF NEW.tenant_id != v_resort_tenant THEN
      RAISE EXCEPTION 'RESOURCE_TENANT_MISMATCH: Cottage resort_id does not belong to target tenant.';
    END IF;
  END IF;

  IF NEW.tenant_id IS NULL THEN
    RAISE EXCEPTION 'RESOURCE_TENANT_MISMATCH: Tenant ID is required.';
  END IF;

  -- 2. Ordinary Update Bypass
  IF TG_OP = 'UPDATE' AND NEW.tenant_id = OLD.tenant_id AND coalesce(NEW.resort_id, '00000000-0000-0000-0000-000000000000'::uuid) = coalesce(OLD.resort_id, '00000000-0000-0000-0000-000000000000'::uuid) THEN
    RETURN NEW;
  END IF;

  -- 3. Operational Access Check against TARGET tenant
  IF NOT public.is_super_admin() AND NOT public.is_tenant_operational(NEW.tenant_id) THEN
    RAISE EXCEPTION 'ACCOUNT_OPERATION_BLOCKED: Account is suspended or trial expired.';
  END IF;

  -- 4. Super Admin Capacity Bypass
  IF public.is_super_admin() THEN RETURN NEW; END IF;

  -- 5. Plan Capacity Enforcement
  PERFORM pg_advisory_xact_lock(1002, hashtext(NEW.tenant_id::text));
  v_plan_res := public.resolve_effective_plan_sql(NEW.tenant_id);

  IF (v_plan_res->>'is_unknown_plan')::BOOLEAN THEN
    RAISE EXCEPTION '%: Plan configuration error or unknown plan.', coalesce(v_plan_res->>'error_code', 'ENTITLEMENT_PLAN_UNKNOWN');
  END IF;

  v_max_resorts := (v_plan_res->>'maxResorts')::INT;
  SELECT COUNT(*) INTO v_count FROM public.cottages WHERE tenant_id = NEW.tenant_id AND id != NEW.id;

  IF v_count + 1 > v_max_resorts THEN
    RAISE EXCEPTION 'ENTITLEMENT_PROPERTY_LIMIT: Limit reached for Property creation on your plan (% max).', v_max_resorts;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;


-- 4. Trigger Function: Room Enforcement (rooms)
CREATE OR REPLACE FUNCTION public.enforce_room_entitlement()
RETURNS TRIGGER AS $$
DECLARE
  v_cottage_tenant UUID;
  v_cottage_resort UUID;
  v_plan_res JSONB;
  v_max_rooms INT;
  v_count INT;
BEGIN
  -- 1. Relational Hierarchy Validation (ALWAYS, including Super Admin)
  IF NEW.cottage_id IS NOT NULL THEN
    SELECT tenant_id, resort_id INTO v_cottage_tenant, v_cottage_resort FROM public.cottages WHERE id = NEW.cottage_id;
    IF v_cottage_tenant IS NULL THEN
      RAISE EXCEPTION 'RESOURCE_TENANT_MISMATCH: Target cottage_id does not exist.';
    END IF;

    IF NEW.tenant_id IS NULL THEN NEW.tenant_id := v_cottage_tenant;
    ELSIF NEW.tenant_id != v_cottage_tenant THEN
      RAISE EXCEPTION 'RESOURCE_TENANT_MISMATCH: Room cottage_id does not belong to target tenant.';
    END IF;

    IF NEW.resort_id IS NULL THEN NEW.resort_id := v_cottage_resort;
    ELSIF NEW.resort_id != v_cottage_resort THEN
      RAISE EXCEPTION 'RESOURCE_TENANT_MISMATCH: Room resort_id does not match cottage resort.';
    END IF;
  END IF;

  IF NEW.tenant_id IS NULL THEN
    RAISE EXCEPTION 'RESOURCE_TENANT_MISMATCH: Tenant ID is required.';
  END IF;

  -- 2. Ordinary Update & Same-Tenant Move Bypass
  IF TG_OP = 'UPDATE' AND NEW.tenant_id = OLD.tenant_id THEN
    RETURN NEW;
  END IF;

  -- 3. Operational Access Check against TARGET tenant
  IF NOT public.is_super_admin() AND NOT public.is_tenant_operational(NEW.tenant_id) THEN
    RAISE EXCEPTION 'ACCOUNT_OPERATION_BLOCKED: Account is suspended or trial expired.';
  END IF;

  -- 4. Super Admin Capacity Bypass
  IF public.is_super_admin() THEN RETURN NEW; END IF;

  -- 5. Plan Capacity Enforcement
  PERFORM pg_advisory_xact_lock(1003, hashtext(NEW.tenant_id::text));
  v_plan_res := public.resolve_effective_plan_sql(NEW.tenant_id);

  IF (v_plan_res->>'is_unknown_plan')::BOOLEAN THEN
    RAISE EXCEPTION '%: Plan configuration error or unknown plan.', coalesce(v_plan_res->>'error_code', 'ENTITLEMENT_PLAN_UNKNOWN');
  END IF;

  v_max_rooms := (v_plan_res->>'maxRooms')::INT;
  SELECT COUNT(*) INTO v_count FROM public.rooms WHERE tenant_id = NEW.tenant_id AND id != NEW.id;

  IF v_count + 1 > v_max_rooms THEN
    RAISE EXCEPTION 'ENTITLEMENT_ROOM_LIMIT: Limit reached for Room creation on your plan (% max).', v_max_rooms;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;


-- 5. Trigger Function: Staff Enforcement (profiles)
CREATE OR REPLACE FUNCTION public.enforce_staff_entitlement()
RETURNS TRIGGER AS $$
DECLARE
  v_plan_res JSONB;
  v_max_staff INT;
  v_count INT;
BEGIN
  IF NEW.role != 'staff' THEN RETURN NEW; END IF;

  IF NEW.tenant_id IS NULL THEN
    RAISE EXCEPTION 'RESOURCE_TENANT_MISMATCH: Staff tenant_id is required.';
  END IF;

  -- Ordinary Update Bypass
  IF TG_OP = 'UPDATE' AND OLD.role = 'staff' AND NEW.tenant_id = OLD.tenant_id THEN
    RETURN NEW;
  END IF;

  -- Operational Access Check against TARGET tenant
  IF NOT public.is_super_admin() AND NOT public.is_tenant_operational(NEW.tenant_id) THEN
    RAISE EXCEPTION 'ACCOUNT_OPERATION_BLOCKED: Account is suspended or trial expired.';
  END IF;

  -- Super Admin Capacity Bypass
  IF public.is_super_admin() THEN RETURN NEW; END IF;

  -- Plan Capacity Enforcement
  PERFORM pg_advisory_xact_lock(1004, hashtext(NEW.tenant_id::text));
  v_plan_res := public.resolve_effective_plan_sql(NEW.tenant_id);

  IF (v_plan_res->>'is_unknown_plan')::BOOLEAN THEN
    RAISE EXCEPTION '%: Plan configuration error or unknown plan.', coalesce(v_plan_res->>'error_code', 'ENTITLEMENT_PLAN_UNKNOWN');
  END IF;

  v_max_staff := (v_plan_res->>'maxStaff')::INT;
  SELECT COUNT(*) INTO v_count FROM public.profiles WHERE tenant_id = NEW.tenant_id AND role = 'staff' AND id != NEW.id;

  IF v_count + 1 > v_max_staff THEN
    RAISE EXCEPTION 'ENTITLEMENT_STAFF_LIMIT: Limit reached for Staff creation on your plan (% max).', v_max_staff;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;


-- 6. Trigger Function: Business Profile Structural Enforcement (resorts)
CREATE OR REPLACE FUNCTION public.enforce_resort_structural_limit()
RETURNS TRIGGER AS $$
DECLARE
  v_count INT;
BEGIN
  IF NEW.tenant_id IS NULL THEN
    RAISE EXCEPTION 'RESOURCE_TENANT_MISMATCH: Tenant ID is required for resort.';
  END IF;

  IF TG_OP = 'UPDATE' AND NEW.tenant_id = OLD.tenant_id THEN RETURN NEW; END IF;
  IF public.is_super_admin() THEN RETURN NEW; END IF;

  PERFORM pg_advisory_xact_lock(1001, hashtext(NEW.tenant_id::text));
  SELECT COUNT(*) INTO v_count FROM public.resorts WHERE tenant_id = NEW.tenant_id AND id != NEW.id;

  IF v_count >= 1 THEN
    RAISE EXCEPTION 'BUSINESS_PROFILE_STRUCTURAL_LIMIT: Tenants can only have one parent business profile.';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;


-- 7. Attach Triggers
DROP TRIGGER IF EXISTS trg_enforce_cottage_entitlement ON public.cottages;
CREATE TRIGGER trg_enforce_cottage_entitlement
  BEFORE INSERT OR UPDATE ON public.cottages
  FOR EACH ROW EXECUTE FUNCTION public.enforce_cottage_entitlement();

DROP TRIGGER IF EXISTS trg_enforce_room_entitlement ON public.rooms;
CREATE TRIGGER trg_enforce_room_entitlement
  BEFORE INSERT OR UPDATE ON public.rooms
  FOR EACH ROW EXECUTE FUNCTION public.enforce_room_entitlement();

DROP TRIGGER IF EXISTS trg_enforce_staff_entitlement ON public.profiles;
CREATE TRIGGER trg_enforce_staff_entitlement
  BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.enforce_staff_entitlement();

DROP TRIGGER IF EXISTS trg_enforce_resort_structural_limit ON public.resorts;
CREATE TRIGGER trg_enforce_resort_structural_limit
  BEFORE INSERT OR UPDATE ON public.resorts
  FOR EACH ROW EXECUTE FUNCTION public.enforce_resort_structural_limit();


-- 8. Performance Indexes
CREATE INDEX IF NOT EXISTS idx_cottages_tenant_id ON public.cottages(tenant_id);
CREATE INDEX IF NOT EXISTS idx_rooms_tenant_id ON public.rooms(tenant_id);
CREATE INDEX IF NOT EXISTS idx_profiles_tenant_role ON public.profiles(tenant_id, role);
CREATE INDEX IF NOT EXISTS idx_resorts_tenant_id ON public.resorts(tenant_id);


-- 9. Explicit Security Definer Privilege Hardening (Internal Helpers Revoked)
REVOKE ALL ON FUNCTION public.resolve_effective_plan_sql(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.is_tenant_operational(UUID) FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.enforce_cottage_entitlement() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enforce_room_entitlement() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enforce_staff_entitlement() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enforce_resort_structural_limit() FROM PUBLIC, anon, authenticated;
