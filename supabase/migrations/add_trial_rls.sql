-- Dynamic Forward Migration: Enforce trial expiry safely across ALL existing policies
-- This script dynamically reads your exact production policies, backs them up,
-- preserves their logic, and safely injects the is_trial_expired() check.

DO $$ 
DECLARE
  pol RECORD;
  t_name TEXT;
  tbls TEXT[] := ARRAY['resorts', 'cottages', 'rooms', 'bookings', 'incomes', 'expenses'];
  new_qual TEXT;
  new_check TEXT;
  sql_cmd TEXT;
BEGIN
  -- 1. Create a backup table if it doesn't exist to store exact original ASTs for rollback
  CREATE TABLE IF NOT EXISTS _trial_rls_backup (
    policyname TEXT,
    tablename TEXT,
    qual TEXT,
    with_check TEXT,
    backed_up_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(policyname, tablename)
  );

  FOR t_name IN SELECT unnest(tbls) LOOP
    FOR pol IN 
      SELECT policyname, qual, with_check, cmd 
      FROM pg_policies 
      WHERE schemaname = 'public' AND tablename = t_name
    LOOP
      -- Skip if this policy was already patched to avoid double-wrapping
      IF (pol.qual LIKE '%is_trial_expired()%') OR (pol.with_check LIKE '%is_trial_expired()%') THEN
        CONTINUE;
      END IF;

      -- If the policy is ONLY for Super Admins, DO NOT patch it!
      IF pol.qual = 'is_super_admin()' AND pol.with_check IS NULL THEN
        CONTINUE;
      END IF;

      -- 2. Backup the exact original policy
      INSERT INTO _trial_rls_backup (policyname, tablename, qual, with_check)
      VALUES (pol.policyname, t_name, pol.qual, pol.with_check)
      ON CONFLICT (policyname, tablename) DO NOTHING;

      -- 3. Construct the ALTER statement
      sql_cmd := 'ALTER POLICY %I ON %I ';
      
      -- Process USING clause (qual)
      IF pol.qual IS NOT NULL THEN
        -- Safely enforce trial while guaranteeing Super Admin access is untouched
        IF pol.qual LIKE '%is_super_admin()%' THEN
           new_qual := 'is_super_admin() OR ((' || pol.qual || ') AND is_trial_expired() = FALSE)';
        ELSE
           new_qual := '(' || pol.qual || ') AND is_trial_expired() = FALSE';
        END IF;
        sql_cmd := sql_cmd || ' USING ( ' || new_qual || ' ) ';
      END IF;

      -- Process WITH CHECK clause
      IF pol.with_check IS NOT NULL THEN
        IF pol.with_check LIKE '%is_super_admin()%' THEN
           new_check := 'is_super_admin() OR ((' || pol.with_check || ') AND is_trial_expired() = FALSE)';
        ELSE
           new_check := '(' || pol.with_check || ') AND is_trial_expired() = FALSE';
        END IF;
        sql_cmd := sql_cmd || ' WITH CHECK ( ' || new_check || ' ) ';
      END IF;

      -- 4. Execute the dynamic ALTER POLICY statement
      IF sql_cmd != 'ALTER POLICY %I ON %I ' THEN
        EXECUTE format(sql_cmd, pol.policyname, t_name);
      END IF;
      
    END LOOP;
  END LOOP;
END $$;
