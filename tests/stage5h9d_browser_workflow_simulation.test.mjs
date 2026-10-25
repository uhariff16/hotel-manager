import test from 'node:test';
import assert from 'node:assert/strict';
import { 
  extractGuestIdPath, 
  isCanonicalGuestIdPath, 
  getGuestIdSignedUrl, 
  setGuestIdStorageClient,
  normalizeGuestIdForPersistence
} from '../src/lib/guestIdStorage.js';

test('STAGE 5H.9D.0: Phase D Complete Browser Workflow Simulation (26 Checks)', async (t) => {
  const tenantA = '3797dba7-a7fd-4ca6-86cb-b45519953947';
  const tenantB = '1707818e-79ff-4a0c-9f99-7d991cc27842';
  
  // Synthetic in-memory database representing public.bookings
  const mockBookingsDb = new Map();
  // Synthetic in-memory Supabase Storage representing bucket 'guest_ids'
  const mockStorage = new Map();

  // Synthetic client simulating Supabase Storage API with RLS enforcement
  let activeSessionRole = 'tenant_admin'; // 'tenant_admin', 'staff', 'super_admin', 'unauthenticated'
  let activeSessionTenantId = tenantA;

  const mockSupabaseClient = {
    storage: {
      from: (bucket) => {
        if (bucket !== 'guest_ids') throw new Error(`Bucket ${bucket} not supported`);
        return {
          upload: async (path, fileData) => {
            if (activeSessionRole === 'unauthenticated') {
              return { data: null, error: { message: 'Unauthorized' } };
            }
            const pathTenant = path.split('/')[0];
            if (activeSessionRole !== 'super_admin' && pathTenant !== activeSessionTenantId) {
              return { data: null, error: { message: 'Cross-tenant upload forbidden by RLS' } };
            }
            mockStorage.set(path, { fileData, uploadedAt: Date.now() });
            return { data: { path }, error: null };
          },
          createSignedUrl: async (path, expiresIn) => {
            if (activeSessionRole === 'unauthenticated') {
              return { data: null, error: { message: 'Unauthorized' } };
            }
            const pathTenant = path.split('/')[0];
            if (activeSessionRole !== 'super_admin' && pathTenant !== activeSessionTenantId) {
              return { data: null, error: { message: 'Cross-tenant view forbidden by RLS' } };
            }
            if (!mockStorage.has(path)) {
              return { data: null, error: { message: 'Object not found' } };
            }
            const token = `sig_${Date.now()}_exp${expiresIn}`;
            return {
              data: { signedUrl: `https://lubkdxhqnnghnjhrebat.supabase.co/storage/v1/object/sign/guest_ids/${path}?token=${token}` },
              error: null
            };
          }
        };
      }
    }
  };

  setGuestIdStorageClient(mockSupabaseClient);

  let currentBookingId = 'booking-uuid-101';
  let frontPath = '';
  let backPath = '';

  // Checks 1 to 5: Create booking, upload front and back, save, verify canonical paths stored
  await t.test('Checks 1-5: Create booking with front/back upload and verify canonical paths', async () => {
    // 1. Create booking state
    // 2. Upload front document
    frontPath = `${tenantA}/${Date.now()}-front.jpg`;
    const { error: upFrontErr } = await mockSupabaseClient.storage.from('guest_ids').upload(frontPath, Buffer.from('synthetic-front'));
    assert.equal(upFrontErr, null);

    // Upload back document
    backPath = `${tenantA}/${Date.now()}-back.jpg`;
    const { error: upBackErr } = await mockSupabaseClient.storage.from('guest_ids').upload(backPath, Buffer.from('synthetic-back'));
    assert.equal(upBackErr, null);

    // 3 & 4. Save booking using normalizeGuestIdForPersistence
    const frontNorm = normalizeGuestIdForPersistence({ currentValue: frontPath, tenantId: tenantA });
    const backNorm = normalizeGuestIdForPersistence({ currentValue: backPath, tenantId: tenantA });

    assert.equal(frontNorm.valid, true);
    assert.equal(backNorm.valid, true);

    mockBookingsDb.set(currentBookingId, {
      id: currentBookingId,
      tenant_id: tenantA,
      guest_name: 'John Synthetic',
      id_front_image_url: frontNorm.path,
      id_back_image_url: backNorm.path,
      room_type: 'Deluxe'
    });

    // 5. Verify only canonical paths are stored in database
    const saved = mockBookingsDb.get(currentBookingId);
    assert.equal(saved.id_front_image_url, frontPath);
    assert.equal(saved.id_back_image_url, backPath);
    assert.equal(saved.id_front_image_url.includes('token'), false);
    assert.equal(saved.id_back_image_url.includes('token'), false);
  });

  // Checks 6 & 7: Reopen booking and generate 300-second signed URL for image previews
  await t.test('Checks 6-7: Reopen booking and generate 300-second signed URLs', async () => {
    const b = mockBookingsDb.get(currentBookingId);
    const frontSigned = await getGuestIdSignedUrl(b.id_front_image_url, 300, null, tenantA);
    const backSigned = await getGuestIdSignedUrl(b.id_back_image_url, 300, null, tenantA);

    assert.equal(frontSigned.includes('exp300'), true);
    assert.equal(backSigned.includes('exp300'), true);
    assert.equal(frontSigned.includes('token='), true);
  });

  // Checks 8 to 10: Edit unrelated booking field, save without replacing images, confirm paths unchanged
  await t.test('Checks 8-10: Edit unrelated field and save preserves canonical paths intact', () => {
    const b = mockBookingsDb.get(currentBookingId);
    // User edits room_type but does not touch images
    const frontNorm = normalizeGuestIdForPersistence({
      currentValue: b.id_front_image_url,
      initialValue: b.id_front_image_url,
      tenantId: tenantA
    });
    const backNorm = normalizeGuestIdForPersistence({
      currentValue: b.id_back_image_url,
      initialValue: b.id_back_image_url,
      tenantId: tenantA
    });

    assert.equal(frontNorm.path, frontPath);
    assert.equal(backNorm.path, backPath);

    b.room_type = 'Super Deluxe';
    b.id_front_image_url = frontNorm.path;
    b.id_back_image_url = backNorm.path;
    mockBookingsDb.set(currentBookingId, b);

    const updated = mockBookingsDb.get(currentBookingId);
    assert.equal(updated.room_type, 'Super Deluxe');
    assert.equal(updated.id_front_image_url, frontPath);
    assert.equal(updated.id_back_image_url, backPath);
  });

  // Checks 11 to 14: Replace front only (back unchanged) and replace back only (front unchanged)
  await t.test('Checks 11-14: Replace front only and back only independently', async () => {
    const b = mockBookingsDb.get(currentBookingId);
    const initialFront = b.id_front_image_url;
    const initialBack = b.id_back_image_url;

    // 11-12. Replace front only
    const newFront = `${tenantA}/${Date.now()}-front-v2.jpg`;
    await mockSupabaseClient.storage.from('guest_ids').upload(newFront, Buffer.from('v2'));
    b.id_front_image_url = newFront;
    mockBookingsDb.set(currentBookingId, b);

    assert.equal(mockBookingsDb.get(currentBookingId).id_front_image_url, newFront);
    assert.equal(mockBookingsDb.get(currentBookingId).id_back_image_url, initialBack);

    // 13-14. Replace back only
    const newBack = `${tenantA}/${Date.now()}-back-v2.jpg`;
    await mockSupabaseClient.storage.from('guest_ids').upload(newBack, Buffer.from('back-v2'));
    b.id_back_image_url = newBack;
    mockBookingsDb.set(currentBookingId, b);

    assert.equal(mockBookingsDb.get(currentBookingId).id_front_image_url, newFront);
    assert.equal(mockBookingsDb.get(currentBookingId).id_back_image_url, newBack);
  });

  // Checks 15 to 18: Open legacy booking with tokenized URL, parse to canonical path, generate 300s URL
  await t.test('Checks 15-18: Legacy booking with 10-year signed URL resolves and signs on demand', async () => {
    const legacyPath = `${tenantA}/1790870548450-front.jpg`;
    await mockSupabaseClient.storage.from('guest_ids').upload(legacyPath, Buffer.from('legacy'));
    const legacyUrl = `https://lubkdxhqnnghnjhrebat.supabase.co/storage/v1/object/sign/guest_ids/${legacyPath}?token=legacy10YearToken`;

    // 15-16. Verify parsing
    const extracted = extractGuestIdPath(legacyUrl, tenantA);
    assert.equal(extracted, legacyPath);

    // 17-18. Generate fresh 300s signed URL
    const freshUrl = await getGuestIdSignedUrl(legacyUrl, 300, null, tenantA);
    assert.equal(freshUrl.includes(legacyPath), true);
    assert.equal(freshUrl.includes('exp300'), true);
  });

  // Checks 19 to 21: Expired URL regeneration and malformed reference safety
  await t.test('Checks 19-21: Expired preview regeneration and malformed non-destructive protection', async () => {
    const canonical = `${tenantA}/doc.jpg`;
    await mockSupabaseClient.storage.from('guest_ids').upload(canonical, Buffer.from('doc'));

    // 19-20. Expired preview URL regeneration:
    const expiredUrl = `https://lubkdxhqnnghnjhrebat.supabase.co/storage/v1/object/sign/guest_ids/${canonical}?token=expired`;
    const refreshed = await getGuestIdSignedUrl(expiredUrl, 300, null, tenantA);
    assert.equal(refreshed.includes('exp300'), true);

    // 21. Malformed legacy reference does not cause silent data loss
    const malformed = 'https://malicious.org/bad.jpg';
    const norm = normalizeGuestIdForPersistence({
      currentValue: malformed,
      initialValue: canonical,
      tenantId: tenantA
    });
    assert.equal(norm.valid, false);
    assert.equal(norm.wasPreserved, true);
    assert.equal(norm.path, canonical, 'Must preserve existing valid record');
  });

  // Check 22: Additional guest document handling
  await t.test('Check 22: Additional guest documents handled cleanly', () => {
    const additionalG = {
      name: 'Jane Doe',
      id_front_image_url: `${tenantA}/jane-front.jpg`,
      id_back_image_url: 'blob:https://staypilot.co.in/unsaved'
    };
    const frontNorm = normalizeGuestIdForPersistence({ currentValue: additionalG.id_front_image_url, tenantId: tenantA });
    const backNorm = normalizeGuestIdForPersistence({ currentValue: additionalG.id_back_image_url, tenantId: tenantA });

    assert.equal(frontNorm.valid, true);
    assert.equal(backNorm.valid, false, 'Transient blob on additional guest must be rejected');
  });

  // Checks 23 to 26: Permissions, isolation, and logout
  await t.test('Checks 23-26: Staff access, tenant isolation, super admin, and logout', async () => {
    const targetDoc = `${tenantA}/secret-doc.jpg`;
    await mockSupabaseClient.storage.from('guest_ids').upload(targetDoc, Buffer.from('secret'));

    // 23. Staff of tenant A can generate signed URL
    activeSessionRole = 'staff';
    activeSessionTenantId = tenantA;
    const staffUrl = await getGuestIdSignedUrl(targetDoc, 300, null, tenantA);
    assert.equal(Boolean(staffUrl), true);

    // 24. Foreign tenant B CANNOT generate signed URL for tenant A document (Cross-tenant rejection)
    activeSessionRole = 'tenant_admin';
    activeSessionTenantId = tenantB;
    const foreignUrl = await getGuestIdSignedUrl(targetDoc, 300, null, tenantB);
    assert.equal(foreignUrl, '', 'Foreign tenant must fail closed with empty string');

    // 25. Super Admin CAN view document across tenants
    activeSessionRole = 'super_admin';
    activeSessionTenantId = 'admin-id';
    const adminUrl = await getGuestIdSignedUrl(targetDoc, 300);
    assert.equal(Boolean(adminUrl), true);

    // 26. Logout / unauthenticated caller CANNOT view document
    activeSessionRole = 'unauthenticated';
    const anonUrl = await getGuestIdSignedUrl(targetDoc, 300);
    assert.equal(anonUrl, '', 'Unauthenticated user must be denied');
  });
});
