-- Add vehicle_number to bookings table
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS vehicle_number TEXT;
