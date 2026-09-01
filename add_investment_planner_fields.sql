ALTER TABLE investments ADD COLUMN IF NOT EXISTS property_ownership TEXT DEFAULT 'leased';
ALTER TABLE investments ADD COLUMN IF NOT EXISTS recovery_period_years NUMERIC DEFAULT 1;
ALTER TABLE investments ADD COLUMN IF NOT EXISTS lease_start_date DATE;
ALTER TABLE investments ADD COLUMN IF NOT EXISTS lease_end_date DATE;
ALTER TABLE investments ADD COLUMN IF NOT EXISTS average_selling_price NUMERIC;
