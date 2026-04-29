-- Add investment table
CREATE TABLE IF NOT EXISTS investments (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  tenant_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  resort_id UUID REFERENCES resorts(id) ON DELETE CASCADE,
  total_investment NUMERIC DEFAULT 0,
  monthly_operating_expenses NUMERIC DEFAULT 0,
  annual_fixed_expenses NUMERIC DEFAULT 0,
  target_roi_percentage NUMERIC DEFAULT 12,
  expected_occupancy_rate NUMERIC DEFAULT 60,
  total_rooms INTEGER DEFAULT 1,
  rental_model TEXT DEFAULT 'room',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(tenant_id, resort_id)
);

-- Ensure columns exist if table was already created previously
ALTER TABLE investments ADD COLUMN IF NOT EXISTS total_rooms INTEGER DEFAULT 1;
ALTER TABLE investments ADD COLUMN IF NOT EXISTS rental_model TEXT DEFAULT 'room';

-- Access Management
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS feature_investment_enabled BOOLEAN DEFAULT FALSE;

-- RLS
ALTER TABLE investments ENABLE ROW LEVEL SECURITY;

DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'investments' AND policyname = 'Users can manage own investments') THEN
        CREATE POLICY "Users can manage own investments" ON investments FOR ALL USING (auth.uid() = tenant_id);
    END IF;
END $$;
