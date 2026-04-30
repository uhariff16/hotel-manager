-- Add adults_count and kids_count to bookings table
ALTER TABLE bookings 
ADD COLUMN IF NOT EXISTS adults_count INTEGER DEFAULT 1,
ADD COLUMN IF NOT EXISTS kids_count INTEGER DEFAULT 0;
