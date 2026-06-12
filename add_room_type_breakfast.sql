-- Add room_type and breakfast columns to bookings table
-- Run this in your Supabase SQL Editor to support persistent Room Type and Breakfast settings.

ALTER TABLE public.bookings 
  ADD COLUMN IF NOT EXISTS room_type TEXT DEFAULT 'Deluxe Room',
  ADD COLUMN IF NOT EXISTS breakfast TEXT DEFAULT 'NA';
