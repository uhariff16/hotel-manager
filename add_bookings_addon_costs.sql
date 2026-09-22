-- Add addon_costs_itemized JSONB column to bookings
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS addon_costs_itemized JSONB DEFAULT '{}'::jsonb;
