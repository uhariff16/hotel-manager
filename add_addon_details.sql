-- Add addon_details to bookings table
ALTER TABLE bookings 
ADD COLUMN IF NOT EXISTS addon_details TEXT;
