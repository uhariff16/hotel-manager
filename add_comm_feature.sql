-- Add feature_comm_enabled column to profiles table to manage individual tenant access to communications feature
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS feature_comm_enabled BOOLEAN DEFAULT TRUE;

-- Enable all authenticated users to read super_admin profile (needed to fetch global setting flags like global_settings.comm_features_enabled)
CREATE POLICY "Allow authenticated users to read super_admin profile"
ON profiles
FOR SELECT
TO authenticated
USING (role = 'super_admin');
