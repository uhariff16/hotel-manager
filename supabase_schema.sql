-- HOTEL MANAGER SAAS MIGRATION SCRIPT
-- RUN THIS IN THE SUPABASE SQL EDITOR

-- 1. Enable UUID Extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. Create/Update PROFILES Table
CREATE TABLE IF NOT EXISTS profiles (
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  full_name TEXT,
  role TEXT DEFAULT 'tenant_admin' CHECK (role IN ('super_admin', 'tenant_admin', 'manager', 'staff')),
  plan_type TEXT DEFAULT 'free' CHECK (plan_type IN ('free', 'pro', 'premium')),
  subscription_status TEXT DEFAULT 'active',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Ensure multi-tenancy columns exist (fix for 'column does not exist' error)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS tenant_id UUID DEFAULT NULL;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'tenant_admin'; -- Just in case

-- Migration: Set tenant_id for existing profiles that don't have one
UPDATE profiles SET tenant_id = id WHERE tenant_id IS NULL;

-- 3. Create/Update RESORTS Table
CREATE TABLE IF NOT EXISTS resorts (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  name TEXT NOT NULL,
  address TEXT,
  phone TEXT,
  email TEXT,
  timezone TEXT DEFAULT 'Asia/Kolkata',
  currency TEXT DEFAULT 'INR',
  logo_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE resorts ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES profiles(id) ON DELETE CASCADE;

-- 4. Update Operational Tables with Multi-Tenancy Columns
ALTER TABLE cottages ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES profiles(id) ON DELETE CASCADE;
ALTER TABLE cottages ADD COLUMN IF NOT EXISTS resort_id UUID REFERENCES resorts(id) ON DELETE CASCADE;

ALTER TABLE rooms ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES profiles(id) ON DELETE CASCADE;
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS resort_id UUID REFERENCES resorts(id) ON DELETE CASCADE;

ALTER TABLE bookings ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES profiles(id) ON DELETE CASCADE;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS resort_id UUID REFERENCES resorts(id) ON DELETE CASCADE;

ALTER TABLE incomes ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES profiles(id) ON DELETE CASCADE;
ALTER TABLE incomes ADD COLUMN IF NOT EXISTS resort_id UUID REFERENCES resorts(id) ON DELETE CASCADE;

ALTER TABLE expenses ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES profiles(id) ON DELETE CASCADE;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS resort_id UUID REFERENCES resorts(id) ON DELETE CASCADE;

-- 5. Enable Row Level Security (RLS)
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE resorts ENABLE ROW LEVEL SECURITY;
ALTER TABLE cottages ENABLE ROW LEVEL SECURITY;
ALTER TABLE rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE incomes ENABLE ROW LEVEL SECURITY;
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;

-- 6. Helper Functions for Role-Based Access
-- IMPORTANT: Use JWT app_metadata for high-performance, non-recursive RLS bypass.
CREATE OR REPLACE FUNCTION is_super_admin()
RETURNS BOOLEAN AS $$
BEGIN
  -- 1. Check JWT claims (Standard for SaaS bypass)
  IF (auth.jwt() -> 'app_metadata' ->> 'role') = 'super_admin' THEN
    RETURN TRUE;
  END IF;

  -- 2. Fallback: Direct non-recursive check of profiles table
  -- We use a limited select to avoid triggering complex RLS loops
  RETURN EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE id = auth.uid() AND role = 'super_admin'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION is_tenant_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN (auth.jwt() -> 'app_metadata' ->> 'role') = 'tenant_admin' 
      OR (auth.jwt() -> 'app_metadata' ->> 'role') = 'super_admin';
END;
$$ LANGUAGE plpgsql STABLE;

-- 7. Advanced Trigger for Automatic Profile Creation on Signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  v_role TEXT;
  v_tenant_id UUID;
  v_full_name TEXT;
BEGIN
  v_role := COALESCE(NEW.raw_user_meta_data->>'role', 'tenant_admin');
  v_tenant_id := (NEW.raw_user_meta_data->>'tenant_id')::UUID;
  v_full_name := COALESCE(NEW.raw_user_meta_data->>'full_name', 'New Member');
  
  IF v_tenant_id IS NULL THEN
    v_tenant_id := NEW.id;
  END IF;

  -- 1. Create Profile
  INSERT INTO public.profiles (id, full_name, role, tenant_id)
  VALUES (NEW.id, v_full_name, v_role, v_tenant_id);

  -- 2. Sync role and tenant_id to auth metadata so it's available in JWT (for RLS performance)
  UPDATE auth.users 
  SET raw_app_meta_data = raw_app_meta_data || 
    jsonb_build_object('role', v_role, 'tenant_id', v_tenant_id)
  WHERE id = NEW.id;

  -- 3. If it's a new tenant (role = tenant_admin), create their first resort
  IF v_role = 'tenant_admin' THEN
    INSERT INTO public.resorts (tenant_id, name)
    VALUES (v_tenant_id, 'My First Property');
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- (Re)create Trigger
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Migration: Ensure the primary admin user has the correct role
-- Run this to fix the visibility issue for the current Super Admin
UPDATE profiles SET role = 'super_admin' WHERE id IN (SELECT id FROM auth.users WHERE email = 'uhariff@gmail.com');

-- Also sync to auth metadata for JWT-based RLS (Crucial for performance/non-recursion)
UPDATE auth.users 
SET raw_app_meta_data = jsonb_build_object('role', 'super_admin', 'tenant_id', id)
WHERE email = 'uhariff@gmail.com';

-- 8. Updated RLS POLICIES (Tenant Isolation + Super Admin Bypass)

-- PROFILES Policies
DROP POLICY IF EXISTS "Super Admins view all profiles" ON profiles;
DROP POLICY IF EXISTS "Users view global team" ON profiles;
DROP POLICY IF EXISTS "Super Admins manage all profiles" ON profiles;
DROP POLICY IF EXISTS "Users update own profile" ON profiles;

CREATE POLICY "Super Admins view all profiles" ON profiles FOR SELECT USING (is_super_admin());
CREATE POLICY "Users view global team" ON profiles FOR SELECT USING (
  id = auth.uid() OR 
  tenant_id = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid
);
CREATE POLICY "Super Admins manage all profiles" ON profiles FOR ALL USING (is_super_admin());
CREATE POLICY "Users update own profile" ON profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Tenants manage staff" ON profiles FOR ALL USING (
  tenant_id = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid 
  AND is_tenant_admin()
  AND id != auth.uid()
);

-- RESORTS Policies
DROP POLICY IF EXISTS "Super Admin Global Access" ON resorts;
DROP POLICY IF EXISTS "Tenant Team Access" ON resorts;
DROP POLICY IF EXISTS "Tenant Owner Management" ON resorts;

CREATE POLICY "Super Admin Global Access" ON resorts FOR ALL USING (is_super_admin());
CREATE POLICY "Tenant Team Access" ON resorts FOR SELECT USING (
  tenant_id = (SELECT p.tenant_id FROM public.profiles p WHERE p.id = auth.uid())
);
CREATE POLICY "Tenant Owner Management" ON resorts FOR ALL USING (auth.uid() = tenant_id);

-- OPERATIONAL TABLES Policies (Cottages, Rooms, Bookings, Incomes, Expenses)
-- Function to check if user belongs to a specific tenant (Optimized to use JWT)
CREATE OR REPLACE FUNCTION belongs_to_tenant(target_tenant_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid = target_tenant_id;
END;
$$ LANGUAGE plpgsql STABLE;

-- Cottages
DROP POLICY IF EXISTS "Staff/Tenant Select" ON cottages;
DROP POLICY IF EXISTS "Staff/Tenant Insert" ON cottages;
DROP POLICY IF EXISTS "Staff/Tenant Update" ON cottages;
DROP POLICY IF EXISTS "Admin/Owner Delete" ON cottages;

CREATE POLICY "Staff/Tenant Select" ON cottages FOR SELECT USING (belongs_to_tenant(tenant_id) OR is_super_admin());
CREATE POLICY "Staff/Tenant Insert" ON cottages FOR INSERT WITH CHECK (belongs_to_tenant(tenant_id) OR is_super_admin());
CREATE POLICY "Staff/Tenant Update" ON cottages FOR UPDATE USING (belongs_to_tenant(tenant_id) OR is_super_admin());
CREATE POLICY "Admin/Owner Delete" ON cottages FOR DELETE USING (auth.uid() = tenant_id OR is_super_admin());

-- Rooms
DROP POLICY IF EXISTS "Staff/Tenant Select" ON rooms;
DROP POLICY IF EXISTS "Staff/Tenant Insert" ON rooms;
DROP POLICY IF EXISTS "Staff/Tenant Update" ON rooms;
DROP POLICY IF EXISTS "Admin/Owner Delete" ON rooms;

CREATE POLICY "Staff/Tenant Select" ON rooms FOR SELECT USING (belongs_to_tenant(tenant_id) OR is_super_admin());
CREATE POLICY "Staff/Tenant Insert" ON rooms FOR INSERT WITH CHECK (belongs_to_tenant(tenant_id) OR is_super_admin());
CREATE POLICY "Staff/Tenant Update" ON rooms FOR UPDATE USING (belongs_to_tenant(tenant_id) OR is_super_admin());
CREATE POLICY "Admin/Owner Delete" ON rooms FOR DELETE USING (auth.uid() = tenant_id OR is_super_admin());

-- Bookings
DROP POLICY IF EXISTS "Staff/Tenant Select" ON bookings;
DROP POLICY IF EXISTS "Staff/Tenant Insert" ON bookings;
DROP POLICY IF EXISTS "Staff/Tenant Update" ON bookings;
DROP POLICY IF EXISTS "Admin/Owner Delete" ON bookings;

CREATE POLICY "Staff/Tenant Select" ON bookings FOR SELECT USING (belongs_to_tenant(tenant_id) OR is_super_admin());
CREATE POLICY "Staff/Tenant Insert" ON bookings FOR INSERT WITH CHECK (belongs_to_tenant(tenant_id) OR is_super_admin());
CREATE POLICY "Staff/Tenant Update" ON bookings FOR UPDATE USING (belongs_to_tenant(tenant_id) OR is_super_admin());
CREATE POLICY "Admin/Owner Delete" ON bookings FOR DELETE USING (auth.uid() = tenant_id OR is_super_admin());

-- Financials (Incomes/Expenses)
DROP POLICY IF EXISTS "Admin/Owner Financial Access" ON incomes;
CREATE POLICY "Admin/Owner Financial Access" ON incomes FOR ALL USING (
  is_super_admin() OR (auth.uid() = tenant_id AND is_tenant_admin())
);

DROP POLICY IF EXISTS "Admin/Owner Financial Access" ON expenses;
CREATE POLICY "Admin/Owner Financial Access" ON expenses FOR ALL USING (
  is_super_admin() OR (auth.uid() = tenant_id AND is_tenant_admin())
);

-- 9. DELETION SYNCHRONIZATION (Profile -> Auth Cleanup)
CREATE OR REPLACE FUNCTION public.handle_delete_user()
RETURNS TRIGGER AS $$
BEGIN
  -- SAFETY CHECK: Prevent deletion of protected seed accounts
  IF EXISTS (
    SELECT 1 FROM auth.users 
    WHERE id = OLD.id AND email = 'uhariff@gmail.com'
  ) THEN
    RAISE EXCEPTION 'PROTECTED ACCOUNT: The main Super Admin account cannot be deleted.';
  END IF;

  DELETE FROM auth.users WHERE id = OLD.id;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_delete_auth_user ON public.profiles;
CREATE TRIGGER trigger_delete_auth_user
  AFTER DELETE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_delete_user();

-- Ensure foreign key cascade is active for existing table
ALTER TABLE public.profiles 
  DROP CONSTRAINT IF EXISTS profiles_id_fkey,
  ADD CONSTRAINT profiles_id_fkey 
    FOREIGN KEY (id) 
    REFERENCES auth.users(id) 
    ON DELETE CASCADE;
