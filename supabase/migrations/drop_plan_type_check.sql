-- Remove the hardcoded CHECK constraint on plan_type so Super Admins can dynamically create any plan ID
ALTER TABLE public.profiles
DROP CONSTRAINT IF EXISTS profiles_plan_type_check;
