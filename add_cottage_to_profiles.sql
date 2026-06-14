-- Add cottage_id column to profiles table to link staff/managers to specific properties
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS cottage_id UUID REFERENCES public.cottages(id) ON DELETE SET NULL;
