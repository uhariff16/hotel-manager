-- SQL to add additional_guests JSONB column to bookings table
-- Run this in your Supabase SQL Editor if you want database persistence for multiple guests configuration.

ALTER TABLE public.bookings 
  ADD COLUMN IF NOT EXISTS additional_guests JSONB;
