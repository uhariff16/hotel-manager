ALTER TABLE bookings ADD COLUMN IF NOT EXISTS discount_amount numeric DEFAULT 0;
