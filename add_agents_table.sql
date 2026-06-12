-- Create agents table
-- Run this in your Supabase SQL Editor to support persistent Booking Agents.

CREATE TABLE IF NOT EXISTS public.agents (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  tenant_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  resort_id UUID REFERENCES public.resorts(id) ON DELETE CASCADE,
  name TEXT NOT NULL UNIQUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.agents ENABLE ROW LEVEL SECURITY;

-- Policies
DROP POLICY IF EXISTS "Tenant Select" ON public.agents;
CREATE POLICY "Tenant Select" ON public.agents FOR SELECT USING (
  tenant_id = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid OR 
  (auth.jwt() -> 'app_metadata' ->> 'role') = 'super_admin'
);

DROP POLICY IF EXISTS "Tenant Insert" ON public.agents;
CREATE POLICY "Tenant Insert" ON public.agents FOR INSERT WITH CHECK (
  tenant_id = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid OR 
  (auth.jwt() -> 'app_metadata' ->> 'role') = 'super_admin'
);

DROP POLICY IF EXISTS "Tenant Update" ON public.agents;
CREATE POLICY "Tenant Update" ON public.agents FOR UPDATE USING (
  tenant_id = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid OR 
  (auth.jwt() -> 'app_metadata' ->> 'role') = 'super_admin'
);

DROP POLICY IF EXISTS "Tenant Delete" ON public.agents;
CREATE POLICY "Tenant Delete" ON public.agents FOR DELETE USING (
  tenant_id = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid OR 
  (auth.jwt() -> 'app_metadata' ->> 'role') = 'super_admin'
);
