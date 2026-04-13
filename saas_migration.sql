-- SaaS Migration Script for Hotel Manager
-- Run this in your Supabase SQL Editor

-- 1. Profiles Table (Tenants)
CREATE TABLE IF NOT EXISTS profiles (
  id UUID REFERENCES auth.users ON DELETE CASCADE PRIMARY KEY,
  full_name TEXT,
  role TEXT NOT NULL DEFAULT 'tenant_admin' CHECK (role IN ('super_admin', 'tenant_admin', 'staff')),
  plan_type TEXT NOT NULL DEFAULT 'free' CHECK (plan_type IN ('free', 'pro', 'premium')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Resorts Table
CREATE TABLE IF NOT EXISTS resorts (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  tenant_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  address TEXT,
  phone TEXT,
  email TEXT,
  logo_url TEXT,
  timezone TEXT DEFAULT 'UTC',
  currency TEXT DEFAULT 'INR',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. Add Columns to Operational Tables
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

-- 4. Enable RLS on all tables
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE resorts ENABLE ROW LEVEL SECURITY;
ALTER TABLE cottages ENABLE ROW LEVEL SECURITY;
ALTER TABLE rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE incomes ENABLE ROW LEVEL SECURITY;
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;

-- 5. RLS Policies (Tenant Isolation)
-- User can only see/edit their own profile
CREATE POLICY "Users can view own profile" ON profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON profiles FOR UPDATE USING (auth.uid() = id);

-- User can only see/edit resorts they own
CREATE POLICY "Users can view own resorts" ON resorts FOR SELECT USING (auth.uid() = tenant_id);
CREATE POLICY "Users can manage own resorts" ON resorts FOR ALL USING (auth.uid() = tenant_id);

-- Operational data policies
CREATE POLICY "Users can manage own cottages" ON cottages FOR ALL USING (auth.uid() = tenant_id);
CREATE POLICY "Users can manage own rooms" ON rooms FOR ALL USING (auth.uid() = tenant_id);
CREATE POLICY "Users can manage own bookings" ON bookings FOR ALL USING (auth.uid() = tenant_id);
CREATE POLICY "Users can manage own incomes" ON incomes FOR ALL USING (auth.uid() = tenant_id);
CREATE POLICY "Users can manage own expenses" ON expenses FOR ALL USING (auth.uid() = tenant_id);
