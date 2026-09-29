-- Dynamic Rollback Migration: Restores exactly the original ASTs backed up during forward migration

DO $$ 
DECLARE
  bkp RECORD;
  sql_cmd TEXT;
BEGIN
  -- Verify the backup table exists
  IF NOT EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = '_trial_rls_backup') THEN
    RAISE EXCEPTION 'Backup table _trial_rls_backup does not exist. Cannot perform dynamic rollback.';
  END IF;

  FOR bkp IN SELECT policyname, tablename, qual, with_check FROM _trial_rls_backup LOOP
    
    sql_cmd := 'ALTER POLICY %I ON %I ';
    
    IF bkp.qual IS NOT NULL THEN
      sql_cmd := sql_cmd || ' USING ( ' || bkp.qual || ' ) ';
    END IF;

    IF bkp.with_check IS NOT NULL THEN
      sql_cmd := sql_cmd || ' WITH CHECK ( ' || bkp.with_check || ' ) ';
    END IF;

    IF sql_cmd != 'ALTER POLICY %I ON %I ' THEN
      EXECUTE format(sql_cmd, bkp.policyname, bkp.tablename);
    END IF;
    
  END LOOP;
  
  -- Optionally drop the backup table once rollback is complete
  DROP TABLE _trial_rls_backup;
  
END $$;
