-- Add trial lifecycle fields to profiles table
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS trial_started_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS trial_ends_at TIMESTAMP WITH TIME ZONE;
