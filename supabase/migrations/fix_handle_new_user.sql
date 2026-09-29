CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  v_role TEXT;
  v_tenant_id UUID;
  v_full_name TEXT;
  v_plan_type TEXT;
BEGIN
  v_role := COALESCE(NEW.raw_user_meta_data->>'role', 'tenant_admin');
  v_tenant_id := (NEW.raw_user_meta_data->>'tenant_id')::UUID;
  v_full_name := COALESCE(NEW.raw_user_meta_data->>'full_name', 'New Member');
  v_plan_type := NEW.raw_user_meta_data->>'plan_type';
  
  IF v_tenant_id IS NULL THEN
    v_tenant_id := NEW.id;
  END IF;

  -- 1. Create Profile
  IF v_plan_type IS NOT NULL THEN
    INSERT INTO public.profiles (id, full_name, role, tenant_id, plan_type)
    VALUES (NEW.id, v_full_name, v_role, v_tenant_id, v_plan_type);
  ELSE
    INSERT INTO public.profiles (id, full_name, role, tenant_id)
    VALUES (NEW.id, v_full_name, v_role, v_tenant_id);
  END IF;

  -- 2. Sync role and tenant_id to auth metadata so it's available in JWT (for RLS performance)
  UPDATE auth.users 
  SET raw_app_meta_data = raw_app_meta_data || 
    jsonb_build_object('role', v_role, 'tenant_id', v_tenant_id)
  WHERE id = NEW.id;

  -- 3. If it's a new tenant (role = tenant_admin), create their first resort
  IF v_role = 'tenant_admin' THEN
    INSERT INTO public.resorts (name, tenant_id)
    VALUES (v_full_name || '''s First Resort', v_tenant_id);
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
