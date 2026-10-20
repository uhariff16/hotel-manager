-- ============================================================
-- STAY PILOT — PHASE R2: CUSTOMER IDENTITY MAPPING MIGRATION
-- File: supabase/phase_r2_customer_identity_mapping.sql
-- Target Project: lubkdxhqnnghnjhrebat
-- ============================================================

BEGIN;

-- 1. Create Environment-Aware Customer Mapping Table
CREATE TABLE IF NOT EXISTS public.razorpay_customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  environment TEXT NOT NULL CHECK (environment IN ('test', 'live')),
  razorpay_customer_id TEXT NOT NULL,
  email TEXT NOT NULL,
  name TEXT,
  contact TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_razorpay_customers_tenant_env UNIQUE (tenant_id, environment),
  CONSTRAINT uq_razorpay_customers_env_rzp_id UNIQUE (environment, razorpay_customer_id)
);

-- 2. Performance & Lookup Indexes
CREATE INDEX IF NOT EXISTS idx_razorpay_customers_tenant_env 
ON public.razorpay_customers(tenant_id, environment);

CREATE INDEX IF NOT EXISTS idx_razorpay_customers_rzp_id
ON public.razorpay_customers(razorpay_customer_id);

-- 3. Row Level Security Policies
ALTER TABLE public.razorpay_customers ENABLE ROW LEVEL SECURITY;

-- 3.1 Explicit Data API Grants (Post-October 30 Readiness - Strictly Backend-Only)
REVOKE ALL ON TABLE public.razorpay_customers FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.razorpay_customers TO service_role;

DROP POLICY IF EXISTS "Tenant admins can view own razorpay customer" ON public.razorpay_customers;
CREATE POLICY "Tenant admins can view own razorpay customer"
ON public.razorpay_customers
FOR SELECT
TO authenticated
USING (
  tenant_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() AND p.tenant_id = razorpay_customers.tenant_id
  )
);

DROP POLICY IF EXISTS "Super admins can view all razorpay customers" ON public.razorpay_customers;
CREATE POLICY "Super admins can view all razorpay customers"
ON public.razorpay_customers
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() AND p.role = 'super_admin'
  )
);

-- 4. Idempotent & Conflict-Protected Backfill of Existing Valid Customer Mappings
-- Strictly excludes ambiguous mappings where a tenant has conflicting customer IDs
-- or where a customer ID is claimed by multiple tenants.
INSERT INTO public.razorpay_customers (tenant_id, environment, razorpay_customer_id, email, name, created_at, updated_at)
SELECT 
  s.tenant_id,
  COALESCE(s.environment, 'test') AS environment,
  MIN(s.razorpay_customer_id) AS razorpay_customer_id,
  COALESCE(MIN(p.email), 'unknown@staypilot.local') AS email,
  MIN(p.full_name) AS name,
  MIN(s.created_at) AS created_at,
  MAX(s.updated_at) AS updated_at
FROM public.saas_subscriptions s
JOIN public.profiles p ON p.id = s.tenant_id
WHERE s.razorpay_customer_id IS NOT NULL
GROUP BY s.tenant_id, COALESCE(s.environment, 'test')
HAVING count(DISTINCT s.razorpay_customer_id) = 1
   AND MIN(s.razorpay_customer_id) NOT IN (
     SELECT razorpay_customer_id
     FROM public.saas_subscriptions
     WHERE razorpay_customer_id IS NOT NULL
     GROUP BY razorpay_customer_id, COALESCE(environment, 'test')
     HAVING count(DISTINCT tenant_id) > 1
   )
ON CONFLICT (tenant_id, environment) DO NOTHING;

COMMIT;
