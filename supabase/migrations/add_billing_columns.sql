-- Add billing address columns to the bookings table
ALTER TABLE bookings
ADD COLUMN IF NOT EXISTS billing_address_different BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS billing_door_no TEXT,
ADD COLUMN IF NOT EXISTS billing_street TEXT,
ADD COLUMN IF NOT EXISTS billing_city TEXT,
ADD COLUMN IF NOT EXISTS billing_state TEXT,
ADD COLUMN IF NOT EXISTS billing_pincode TEXT;
