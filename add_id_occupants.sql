-- Add ID Proof and Number of Guests to bookings table
ALTER TABLE bookings 
ADD COLUMN IF NOT EXISTS id_proof_type TEXT DEFAULT 'Aadhar',
ADD COLUMN IF NOT EXISTS id_proof_number TEXT,
ADD COLUMN IF NOT EXISTS number_of_guests INTEGER DEFAULT 1;
