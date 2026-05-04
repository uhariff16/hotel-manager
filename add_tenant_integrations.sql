-- Create the tenant_integrations table
CREATE TABLE IF NOT EXISTS public.tenant_integrations (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  tenant_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  resort_id UUID REFERENCES public.resorts(id) ON DELETE CASCADE,
  
  -- Email Settings (Resend)
  email_enabled BOOLEAN DEFAULT FALSE,
  email_api_key TEXT,
  email_from_address TEXT,
  email_from_name TEXT,
  
  -- WhatsApp Settings (Meta Cloud API)
  whatsapp_enabled BOOLEAN DEFAULT FALSE,
  whatsapp_access_token TEXT,
  whatsapp_phone_number_id TEXT,
  whatsapp_business_account_id TEXT,
  
  -- Automation Toggles
  auto_booking_confirmation BOOLEAN DEFAULT FALSE,
  auto_checkin_reminder BOOLEAN DEFAULT FALSE,
  auto_payment_receipt BOOLEAN DEFAULT FALSE,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Ensure one record per resort
  UNIQUE(resort_id)
);

-- Enable RLS
ALTER TABLE public.tenant_integrations ENABLE ROW LEVEL SECURITY;

-- RLS Policies
DROP POLICY IF EXISTS "Users manage own integration settings" ON public.tenant_integrations;
CREATE POLICY "Users manage own integration settings" ON public.tenant_integrations
  FOR ALL USING (
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'super_admin' OR
    (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid = tenant_id
  );

-- Trigger to update updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_tenant_integrations_updated_at ON public.tenant_integrations;
CREATE TRIGGER update_tenant_integrations_updated_at
BEFORE UPDATE ON public.tenant_integrations
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
