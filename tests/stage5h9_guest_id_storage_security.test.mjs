import test from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import path from 'node:path';

test('STAGE 5H.9 / 5H.9A: Guest ID Storage Security Hardening Comprehensive Test Suite', async (t) => {
  const db = new PGlite();

  // 1. Setup mock Supabase Auth, Profiles, and Storage schema
  await db.exec(`
    CREATE ROLE anon NOLOGIN;
    CREATE ROLE authenticated NOLOGIN;
    CREATE ROLE service_role NOLOGIN;

    CREATE SCHEMA IF NOT EXISTS auth;
    CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
      SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid;
    $$;
    CREATE OR REPLACE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$
      SELECT COALESCE(NULLIF(current_setting('request.jwt.claim.role', true), ''), 'anon');
    $$;

    CREATE TABLE auth.users (
      id uuid PRIMARY KEY,
      email text
    );

    CREATE TABLE public.profiles (
      id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
      email text,
      full_name text,
      role text NOT NULL DEFAULT 'tenant_admin',
      plan_type text NOT NULL DEFAULT 'solo',
      subscription_status text DEFAULT 'active',
      is_legacy_account boolean DEFAULT false,
      tenant_id uuid,
      global_settings jsonb DEFAULT '{}'::jsonb,
      trial_started_at timestamptz,
      trial_ends_at timestamptz,
      created_at timestamptz DEFAULT now()
    );

    CREATE SCHEMA IF NOT EXISTS storage;

    CREATE TABLE storage.buckets (
      id text PRIMARY KEY,
      name text NOT NULL,
      owner uuid,
      created_at timestamptz DEFAULT now(),
      updated_at timestamptz DEFAULT now(),
      public boolean DEFAULT false
    );

    CREATE TABLE storage.objects (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      bucket_id text REFERENCES storage.buckets(id),
      name text NOT NULL,
      owner uuid,
      created_at timestamptz DEFAULT now(),
      updated_at timestamptz DEFAULT now(),
      last_accessed_at timestamptz DEFAULT now(),
      metadata jsonb
    );

    ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

    GRANT USAGE ON SCHEMA storage TO authenticated, anon;
    GRANT ALL ON TABLE storage.objects TO authenticated, anon, service_role;
    GRANT ALL ON TABLE storage.buckets TO authenticated, anon, service_role;
    GRANT USAGE ON SCHEMA public TO authenticated, anon;
    GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated, anon, service_role;

    -- Storage helper function matching Supabase
    CREATE OR REPLACE FUNCTION storage.foldername(name text)
    RETURNS text[] LANGUAGE plpgsql AS $$
    DECLARE
      _parts text[];
    BEGIN
      SELECT string_to_array(name, '/') INTO _parts;
      RETURN _parts[1:array_length(_parts,1)-1];
    END
    $$;

    -- Public helper functions matching production
    CREATE OR REPLACE FUNCTION public.is_super_admin()
    RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER AS $$
    BEGIN
      RETURN EXISTS (
        SELECT 1 FROM public.profiles 
        WHERE id = auth.uid() AND role = 'super_admin'
      );
    END;
    $$;

    -- Function public.is_trial_expired matching production rules
    CREATE OR REPLACE FUNCTION public.is_trial_expired()
    RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER AS $$
    DECLARE
      v_uid uuid;
      v_tenant_id uuid;
      v_role text;
      v_status text;
      v_is_legacy boolean;
      v_ends_at timestamptz;
    BEGIN
      v_uid := auth.uid();
      IF v_uid IS NULL THEN RETURN TRUE; END IF;

      SELECT role, tenant_id INTO v_role, v_tenant_id
      FROM public.profiles WHERE id = v_uid;

      IF v_role = 'super_admin' THEN RETURN FALSE; END IF;
      IF v_tenant_id IS NULL THEN RETURN TRUE; END IF;

      SELECT subscription_status, trial_ends_at, is_legacy_account 
      INTO v_status, v_ends_at, v_is_legacy
      FROM public.profiles WHERE id = v_tenant_id;

      -- Legacy grandfathered tenants are never expired
      IF v_is_legacy = TRUE THEN RETURN FALSE; END IF;

      IF v_status = 'expired' OR v_status = 'suspended' THEN
        RETURN TRUE;
      END IF;

      IF v_ends_at IS NOT NULL AND v_ends_at < now() THEN
        RETURN TRUE;
      END IF;

      RETURN FALSE;
    END;
    $$;
  `);

  // Populate buckets
  await db.exec(`
    INSERT INTO storage.buckets (id, name, public) VALUES
    ('guest_ids', 'guest_ids', false),
    ('public-assets', 'public-assets', true);
  `);

  // Create test actors
  const tenantAId = '11111111-1111-1111-1111-111111111111';
  const staffAId  = '11111111-1111-1111-1111-222222222222';
  const tenantBId = '33333333-3333-3333-3333-333333333333';
  const staffBId  = '33333333-3333-3333-3333-444444444444';
  const superAdminId = '99999999-9999-9999-9999-999999999999';
  const expiredTenantId = '55555555-5555-5555-5555-555555555555';
  const legacyTenantId = '66666666-6666-6666-6666-666666666666';
  const deletedTenantId = '77777777-7777-7777-7777-777777777777';

  await db.exec(`
    INSERT INTO auth.users (id, email) VALUES
    ('${tenantAId}', 'tenanta@staypilot.test'),
    ('${staffAId}', 'staffa@staypilot.test'),
    ('${tenantBId}', 'tenantb@staypilot.test'),
    ('${staffBId}', 'staffb@staypilot.test'),
    ('${superAdminId}', 'superadmin@staypilot.test'),
    ('${expiredTenantId}', 'expired@staypilot.test'),
    ('${legacyTenantId}', 'legacy@staypilot.test');

    INSERT INTO public.profiles (id, email, full_name, role, tenant_id, subscription_status, is_legacy_account, trial_ends_at) VALUES
    ('${tenantAId}', 'tenanta@staypilot.test', 'Tenant A Admin', 'tenant_admin', '${tenantAId}', 'active', false, now() + interval '30 days'),
    ('${staffAId}', 'staffa@staypilot.test', 'Staff A', 'staff', '${tenantAId}', 'active', false, now() + interval '30 days'),
    ('${tenantBId}', 'tenantb@staypilot.test', 'Tenant B Admin', 'tenant_admin', '${tenantBId}', 'active', false, now() + interval '30 days'),
    ('${staffBId}', 'staffb@staypilot.test', 'Staff B', 'staff', '${tenantBId}', 'active', false, now() + interval '30 days'),
    ('${superAdminId}', 'superadmin@staypilot.test', 'Super Admin', 'super_admin', '${superAdminId}', 'active', false, null),
    ('${expiredTenantId}', 'expired@staypilot.test', 'Expired Tenant', 'tenant_admin', '${expiredTenantId}', 'expired', false, now() - interval '5 days'),
    ('${legacyTenantId}', 'legacy@staypilot.test', 'Cheerful Chalet Legacy', 'tenant_admin', '${legacyTenantId}', 'active', true, now() - interval '300 days');
  `);

  // Populate sample objects
  const fileA1 = `${tenantAId}/1792900000000-front.jpg`;
  const fileB1 = `${tenantBId}/1792900000001-front.jpg`;
  const fileLegacy1 = `${legacyTenantId}/1792900000003-front.jpg`;
  const fileOrphaned = `${deletedTenantId}/1792900000002-front.jpg`;

  await db.exec(`
    INSERT INTO storage.objects (bucket_id, name) VALUES
    ('guest_ids', '${fileA1}'),
    ('guest_ids', '${fileB1}'),
    ('guest_ids', '${fileLegacy1}'),
    ('guest_ids', '${fileOrphaned}');
  `);

  // Apply the draft hardened migration
  const migrationPath = path.resolve('supabase/migrations/20261025150000_harden_guest_ids_storage_rls.sql');
  const migrationSql = fs.readFileSync(migrationPath, 'utf8');
  await db.exec(migrationSql);

  // Helper to run query as a specific user
  async function runAs(userId, sql) {
    let setup = `SET ROLE authenticated;`;
    if (userId) {
      setup += `SELECT set_config('request.jwt.claim.sub', '${userId}', false);`;
      setup += `SELECT set_config('request.jwt.claim.role', 'authenticated', false);`;
    } else {
      setup = `SET ROLE anon; SELECT set_config('request.jwt.claim.sub', '', false); SELECT set_config('request.jwt.claim.role', 'anon', false);`;
    }
    await db.exec(setup);
    return await db.query(sql);
  }

  // --- TASK 1: Complete Policy Review & Operations ---
  await t.test('1. Tenant Admin A can SELECT their own guest IDs', async () => {
    const res = await runAs(tenantAId, `SELECT name FROM storage.objects WHERE bucket_id = 'guest_ids';`);
    assert.equal(res.rows.length, 1);
    assert.equal(res.rows[0].name, fileA1);
  });

  await t.test('2. Staff A can SELECT Tenant A guest IDs (delegated tenant access)', async () => {
    const res = await runAs(staffAId, `SELECT name FROM storage.objects WHERE bucket_id = 'guest_ids';`);
    assert.equal(res.rows.length, 1);
    assert.equal(res.rows[0].name, fileA1);
  });

  await t.test('3. Tenant B CANNOT SELECT Tenant A guest IDs (Cross-tenant rejection)', async () => {
    const res = await runAs(tenantBId, `SELECT name FROM storage.objects WHERE name = '${fileA1}';`);
    assert.equal(res.rows.length, 0, 'Tenant B must see 0 rows for Tenant A guest ID');
  });

  await t.test('4. Staff B CANNOT SELECT Tenant A guest IDs', async () => {
    const res = await runAs(staffBId, `SELECT name FROM storage.objects WHERE name = '${fileA1}';`);
    assert.equal(res.rows.length, 0, 'Staff B must see 0 rows for Tenant A guest ID');
  });

  await t.test('5. Super Admin CAN view all guest IDs including orphaned files', async () => {
    const res = await runAs(superAdminId, `SELECT name FROM storage.objects WHERE bucket_id = 'guest_ids' ORDER BY name;`);
    assert.equal(res.rows.length, 4, 'Super Admin must see all 4 files');
  });

  await t.test('6. Unauthenticated (anon) user CANNOT SELECT any guest IDs', async () => {
    const res = await runAs(null, `SELECT name FROM storage.objects WHERE bucket_id = 'guest_ids';`);
    assert.equal(res.rows.length, 0, 'Anon caller must see 0 rows');
  });

  await t.test('7. Tenant A can upload (INSERT) into their own folder', async () => {
    const newFile = `${tenantAId}/new-file-test.jpg`;
    await runAs(tenantAId, `INSERT INTO storage.objects (bucket_id, name) VALUES ('guest_ids', '${newFile}');`);
    const check = await runAs(tenantAId, `SELECT name FROM storage.objects WHERE name = '${newFile}';`);
    assert.equal(check.rows.length, 1);
  });

  await t.test('8. Staff A can upload (INSERT) into Tenant A folder', async () => {
    const staffUpload = `${tenantAId}/staff-upload.jpg`;
    await runAs(staffAId, `INSERT INTO storage.objects (bucket_id, name) VALUES ('guest_ids', '${staffUpload}');`);
    const check = await runAs(tenantAId, `SELECT name FROM storage.objects WHERE name = '${staffUpload}';`);
    assert.equal(check.rows.length, 1);
  });

  await t.test('9. Tenant A CANNOT upload (INSERT) into Tenant B folder', async () => {
    const forgedFile = `${tenantBId}/forged-file.jpg`;
    await assert.rejects(
      async () => {
        await runAs(tenantAId, `INSERT INTO storage.objects (bucket_id, name) VALUES ('guest_ids', '${forgedFile}');`);
      },
      /new row violates row-level security policy/
    );
  });

  await t.test('10. Staff A CANNOT upload (INSERT) into Tenant B folder', async () => {
    const forgedStaffFile = `${tenantBId}/forged-staff.jpg`;
    await assert.rejects(
      async () => {
        await runAs(staffAId, `INSERT INTO storage.objects (bucket_id, name) VALUES ('guest_ids', '${forgedStaffFile}');`);
      },
      /new row violates row-level security policy/
    );
  });

  await t.test('11. Tenant A can UPDATE their own guest ID metadata', async () => {
    await runAs(tenantAId, `UPDATE storage.objects SET metadata = '{"updated": true}'::jsonb WHERE name = '${fileA1}';`);
    const check = await runAs(tenantAId, `SELECT metadata FROM storage.objects WHERE name = '${fileA1}';`);
    assert.equal(check.rows[0].metadata?.updated, true);
  });

  await t.test('12. Tenant A CANNOT UPDATE Tenant B guest ID (Cross-tenant UPDATE rejection)', async () => {
    await runAs(tenantAId, `UPDATE storage.objects SET metadata = '{"hacked": true}'::jsonb WHERE name = '${fileB1}';`);
    const check = await runAs(tenantBId, `SELECT metadata FROM storage.objects WHERE name = '${fileB1}';`);
    assert.notEqual(check.rows[0].metadata?.hacked, true, 'Tenant B file must not be modified by Tenant A');
  });

  await t.test('13. Tenant A CANNOT UPDATE own file to move into Tenant B folder (Cross-tenant move WITH CHECK rejection)', async () => {
    await assert.rejects(
      async () => {
        await runAs(tenantAId, `UPDATE storage.objects SET name = '${tenantBId}/moved.jpg' WHERE name = '${fileA1}';`);
      },
      /new row violates row-level security policy/
    );
  });

  await t.test('14. Expired tenant CANNOT upload (INSERT) into their own folder', async () => {
    const expiredUpload = `${expiredTenantId}/blocked-file.jpg`;
    await assert.rejects(
      async () => {
        await runAs(expiredTenantId, `INSERT INTO storage.objects (bucket_id, name) VALUES ('guest_ids', '${expiredUpload}');`);
      },
      /new row violates row-level security policy/
    );
  });

  await t.test('15. Expired tenant CANNOT UPDATE their own guest ID', async () => {
    // Insert file for expired tenant as superadmin
    const expiredFile = `${expiredTenantId}/existing-file-upd.jpg`;
    await runAs(superAdminId, `INSERT INTO storage.objects (bucket_id, name) VALUES ('guest_ids', '${expiredFile}');`);

    await runAs(expiredTenantId, `UPDATE storage.objects SET metadata = '{"upd": 1}'::jsonb WHERE name = '${expiredFile}';`);
    const check = await runAs(superAdminId, `SELECT metadata FROM storage.objects WHERE name = '${expiredFile}';`);
    assert.equal(check.rows[0].metadata, null, 'Expired tenant cannot update file');
  });

  await t.test('16. Grandfathered Legacy Tenant CAN upload (INSERT) despite past trial_ends_at', async () => {
    const legacyUpload = `${legacyTenantId}/legacy-file.jpg`;
    await runAs(legacyTenantId, `INSERT INTO storage.objects (bucket_id, name) VALUES ('guest_ids', '${legacyUpload}');`);
    const check = await runAs(legacyTenantId, `SELECT name FROM storage.objects WHERE name = '${legacyUpload}';`);
    assert.equal(check.rows.length, 1, 'Grandfathered legacy tenant must be permitted to upload');
  });

  await t.test('17. Tenant A can DELETE their own guest ID', async () => {
    const delFile = `${tenantAId}/new-file-test.jpg`;
    await runAs(tenantAId, `DELETE FROM storage.objects WHERE name = '${delFile}';`);
    const check = await runAs(tenantAId, `SELECT name FROM storage.objects WHERE name = '${delFile}';`);
    assert.equal(check.rows.length, 0);
  });

  await t.test('18. Tenant A CANNOT DELETE Tenant B guest ID', async () => {
    await runAs(tenantAId, `DELETE FROM storage.objects WHERE name = '${fileB1}';`);
    const check = await runAs(tenantBId, `SELECT name FROM storage.objects WHERE name = '${fileB1}';`);
    assert.equal(check.rows.length, 1, 'Tenant B file must not be deleted by Tenant A');
  });

  await t.test('19. Expired tenant CANNOT DELETE their existing guest ID', async () => {
    const expiredFile = `${expiredTenantId}/existing-file.jpg`;
    await runAs(superAdminId, `INSERT INTO storage.objects (bucket_id, name) VALUES ('guest_ids', '${expiredFile}');`);

    await runAs(expiredTenantId, `DELETE FROM storage.objects WHERE name = '${expiredFile}';`);
    const check = await runAs(superAdminId, `SELECT name FROM storage.objects WHERE name = '${expiredFile}';`);
    assert.equal(check.rows.length, 1, 'File must not be deleted by expired tenant');
  });

  await t.test('20. Orphaned file of deleted tenant CANNOT be read by any regular tenant', async () => {
    const resA = await runAs(tenantAId, `SELECT name FROM storage.objects WHERE name = '${fileOrphaned}';`);
    assert.equal(resA.rows.length, 0);

    const resB = await runAs(tenantBId, `SELECT name FROM storage.objects WHERE name = '${fileOrphaned}';`);
    assert.equal(resB.rows.length, 0);
  });

  await t.test('21. Malformed root files (no folder) fail closed on INSERT and SELECT', async () => {
    await assert.rejects(
      async () => {
        await runAs(tenantAId, `INSERT INTO storage.objects (bucket_id, name) VALUES ('guest_ids', 'root-file.jpg');`);
      },
      /new row violates row-level security policy/
    );

    const check = await runAs(tenantAId, `SELECT name FROM storage.objects WHERE name = 'root-file.jpg';`);
    assert.equal(check.rows.length, 0);
  });

  // --- TASK 4: Safe Rollback & Security Recovery Script Validation ---
  await t.test('22. Security-preserving rollback preserves strict tenant isolation (No cross-tenant leakage)', async () => {
    await db.exec('SET ROLE postgres;');
    const rollbackPath = path.resolve('supabase/recovery/rollback_20261025150000_harden_guest_ids_storage_rls.sql');
    const rollbackSql = fs.readFileSync(rollbackPath, 'utf8');
    await db.exec(rollbackSql);

    // Tenant A can view own files
    const resA = await runAs(tenantAId, `SELECT name FROM storage.objects WHERE bucket_id = 'guest_ids';`);
    assert.equal(resA.rows.some(r => r.name === fileA1), true, 'Tenant A can view own files');

    // Tenant A CANNOT view Tenant B files under rollback policy!
    assert.equal(resA.rows.some(r => r.name === fileB1), false, 'Tenant A MUST NOT view Tenant B files under rollback');

    // Tenant A CANNOT view Orphaned files under rollback policy!
    assert.equal(resA.rows.some(r => r.name === fileOrphaned), false, 'Tenant A MUST NOT view Orphaned files under rollback');

    // Super Admin can still view all files
    const resAdmin = await runAs(superAdminId, `SELECT name FROM storage.objects WHERE bucket_id = 'guest_ids';`);
    assert.equal(resAdmin.rows.length >= 4, true, 'Super Admin retains full visibility');
  });

  await t.test('23. Recovery script applies cleanly and enforces tenant isolation', async () => {
    await db.exec('SET ROLE postgres;');
    const recoveryPath = path.resolve('supabase/recovery/recovery_20261025150000_harden_guest_ids_storage_rls.sql');
    const recoverySql = fs.readFileSync(recoveryPath, 'utf8');
    await db.exec(recoverySql);

    const resA = await runAs(tenantAId, `SELECT name FROM storage.objects WHERE bucket_id = 'guest_ids';`);
    assert.equal(resA.rows.some(r => r.name === fileA1), true);
    assert.equal(resA.rows.some(r => r.name === fileB1), false);
  });
});
