-- Add addon_pricing JSONB column to resorts for global pricing
ALTER TABLE resorts ADD COLUMN IF NOT EXISTS addon_pricing JSONB DEFAULT '{}'::jsonb;

-- Add addon_pricing JSONB column to cottages for property-wise overrides
ALTER TABLE cottages ADD COLUMN IF NOT EXISTS addon_pricing JSONB DEFAULT '{}'::jsonb;
