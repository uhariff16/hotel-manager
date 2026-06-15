-- Add feature_comm_enabled column to profiles table to manage individual tenant access to communications feature
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS feature_comm_enabled BOOLEAN DEFAULT TRUE;
