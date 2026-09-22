-- Add payment tracking columns to bookings table
ALTER TABLE bookings 
ADD COLUMN IF NOT EXISTS payment_method TEXT DEFAULT 'Direct',
ADD COLUMN IF NOT EXISTS ota_payment_status TEXT DEFAULT 'Not Applicable';

-- Update existing records just in case
UPDATE bookings
SET payment_method = 'Direct', ota_payment_status = 'Not Applicable'
WHERE payment_method IS NULL;
