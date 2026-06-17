-- Add phone and wifi_password columns to cottages table for property-specific credentials
ALTER TABLE cottages ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE cottages ADD COLUMN IF NOT EXISTS wifi_password TEXT;
