-- RUN THIS SQL IN YOUR SUPABASE SQL EDITOR TO SUPPORT THE NEW CHECKED-OUT STATUS:

-- 1. Drop the existing status check constraint
ALTER TABLE bookings DROP CONSTRAINT IF EXISTS bookings_status_check;

-- 2. Add the updated check constraint including 'Checked-out'
ALTER TABLE bookings ADD CONSTRAINT bookings_status_check CHECK (
  status IN ('Pending', 'Confirmed', 'Checked-in', 'Checked-out', 'Completed', 'Cancelled')
);
