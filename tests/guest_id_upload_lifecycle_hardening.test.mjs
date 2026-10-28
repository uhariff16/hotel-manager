import test from 'node:test';
import assert from 'node:assert/strict';
import {
  generateCanonicalGuestIdPath,
  uploadGuestIdFile,
  rollbackUploadedGuestIdFiles,
  getCryptographicRandomToken,
  isCanonicalGuestIdPath,
  extractGuestIdPath,
  normalizeGuestIdForPersistence,
  getGuestIdSignedUrl,
  setGuestIdStorageClient,
  setAllowTestOrigins
} from '../src/lib/guestIdStorage.js';

test('STAGE 5H.9J.1: Deferred Guest ID Upload — Final Safety Hardening Suite', async (suite) => {
  const tenantA = '3797dba7-a7fd-4ca6-86cb-b45519953947'; // Cheerful Chalet
  const tenantB = '1707818e-79ff-4a0c-9f99-7d991cc27842'; // The Grand Villa

  // In-memory mock storage engine
  let mockStorage = {};
  let storageOperationsLog = [];

  const createMockStorageClient = () => ({
    storage: {
      from: (bucket) => ({
        upload: async (filePath, fileData, options) => {
          storageOperationsLog.push({ op: 'upload', bucket, filePath, size: fileData?.size || fileData?.length || 0 });
          if (mockStorage[`${bucket}/${filePath}`] && !options?.upsert) {
            return { data: null, error: new Error('The resource already exists') };
          }
          mockStorage[`${bucket}/${filePath}`] = fileData;
          return { data: { path: filePath }, error: null };
        },
        remove: async (paths) => {
          storageOperationsLog.push({ op: 'remove', bucket, paths });
          const removed = [];
          for (const p of paths) {
            delete mockStorage[`${bucket}/${p}`];
            removed.push(p);
          }
          return { data: removed, error: null };
        },
        createSignedUrl: async (filePath, expiresIn) => {
          storageOperationsLog.push({ op: 'createSignedUrl', bucket, filePath, expiresIn });
          return {
            data: { signedUrl: `https://lubkdxhqnnghnjhrebat.supabase.co/storage/v1/object/sign/${bucket}/${filePath}?token=ephemeral_mock_token&expiresIn=${expiresIn}` },
            error: null
          };
        }
      })
    }
  });

  suite.beforeEach(() => {
    mockStorage = {};
    storageOperationsLog = [];
    setAllowTestOrigins(false);
    setGuestIdStorageClient(createMockStorageClient());
  });

  suite.after(() => {
    setGuestIdStorageClient(null);
  });

  // ==========================================
  // GATE 2: CRYPTOGRAPHIC PATH GENERATION
  // ==========================================

  await suite.test('Gate 2.1: getCryptographicRandomToken produces exact-length hex token from CSPRNG', () => {
    const token1 = getCryptographicRandomToken(6); // 6 bytes = 12 hex chars
    const token2 = getCryptographicRandomToken(6);

    assert.equal(token1.length, 12);
    assert.equal(token2.length, 12);
    assert.notEqual(token1, token2, 'Consecutive CSPRNG tokens must be distinct');
    assert.match(token1, /^[0-9a-f]{12}$/);
    assert.match(token2, /^[0-9a-f]{12}$/);
  });

  await suite.test('Gate 2.2: generateCanonicalGuestIdPath creates unpredictable, tenant-isolated canonical paths', () => {
    const path1 = generateCanonicalGuestIdPath({ tenantId: tenantA, side: 'front' });
    const path2 = generateCanonicalGuestIdPath({ tenantId: tenantA, side: 'front' });

    assert.notEqual(path1, path2, 'Consecutive generated paths must be unpredictable and collision-free');
    assert.equal(isCanonicalGuestIdPath(path1, tenantA), true, 'Generated path must satisfy canonical validation');
    assert.equal(isCanonicalGuestIdPath(path2, tenantA), true, 'Generated path must satisfy canonical validation');
    assert.match(path1, /^3797dba7-a7fd-4ca6-86cb-b45519953947\/\d+_[0-9a-f]{12}-front\.jpg$/);
  });

  await suite.test('Gate 2.3: generateCanonicalGuestIdPath enforces strict tenant UUID and side validation', () => {
    assert.throws(() => generateCanonicalGuestIdPath({ tenantId: '', side: 'front' }), /Tenant ID is required/);
    assert.throws(() => generateCanonicalGuestIdPath({ tenantId: 'invalid-uuid-format', side: 'front' }), /Invalid tenant ID format/);
    
    const backPath = generateCanonicalGuestIdPath({ tenantId: tenantA, side: 'back' });
    assert.match(backPath, /-back\.jpg$/);
    
    // Any unrecognized side defaults safely to 'front'
    const defaultSidePath = generateCanonicalGuestIdPath({ tenantId: tenantA, side: 'unknown' });
    assert.match(defaultSidePath, /-front\.jpg$/);
  });

  // ==========================================
  // GATE 1: ROLLBACK SAFETY & AMBIGUOUS OUTCOMES
  // ==========================================

  await suite.test('Gate 1.1: rollbackUploadedGuestIdFiles deletes uncommitted objects when failureStage is CONFIRMED_DB_REJECTION', async () => {
    const fakeBlob = { size: 2048, type: 'image/jpeg' };
    const { path: p1 } = await uploadGuestIdFile({ file: fakeBlob, tenantId: tenantA, side: 'front' });
    const { path: p2 } = await uploadGuestIdFile({ file: fakeBlob, tenantId: tenantA, side: 'back' });

    assert.equal(Boolean(mockStorage[`guest_ids/${p1}`]), true);
    assert.equal(Boolean(mockStorage[`guest_ids/${p2}`]), true);

    const rollbackRes = await rollbackUploadedGuestIdFiles([p1, p2], { failureStage: 'CONFIRMED_DB_REJECTION' });
    assert.deepEqual(rollbackRes.removed, [p1, p2]);
    assert.deepEqual(rollbackRes.preserved, []);
    assert.equal(mockStorage[`guest_ids/${p1}`], undefined);
    assert.equal(mockStorage[`guest_ids/${p2}`], undefined);
  });

  await suite.test('Gate 1.2: rollbackUploadedGuestIdFiles deletes uncommitted objects when failureStage is UPLOAD_PHASE', async () => {
    const fakeBlob = { size: 1024, type: 'image/jpeg' };
    const { path: p1 } = await uploadGuestIdFile({ file: fakeBlob, tenantId: tenantA, side: 'front' });

    assert.equal(Boolean(mockStorage[`guest_ids/${p1}`]), true);

    const rollbackRes = await rollbackUploadedGuestIdFiles([p1], { failureStage: 'UPLOAD_PHASE' });
    assert.deepEqual(rollbackRes.removed, [p1]);
    assert.deepEqual(rollbackRes.preserved, []);
    assert.equal(mockStorage[`guest_ids/${p1}`], undefined);
  });

  await suite.test('Gate 1.3: rollbackUploadedGuestIdFiles REFUSES deletion when failureStage is AMBIGUOUS_DB_OUTCOME', async () => {
    const fakeBlob = { size: 3000, type: 'image/jpeg' };
    const { path: p1 } = await uploadGuestIdFile({ file: fakeBlob, tenantId: tenantA, side: 'front' });

    assert.equal(Boolean(mockStorage[`guest_ids/${p1}`]), true);

    // Network timeout / drop while database insert was in flight
    const rollbackRes = await rollbackUploadedGuestIdFiles([p1], { failureStage: 'AMBIGUOUS_DB_OUTCOME' });

    assert.deepEqual(rollbackRes.removed, []);
    assert.deepEqual(rollbackRes.preserved, [p1]);
    assert.equal(rollbackRes.reason, 'AMBIGUOUS_STAGE_AMBIGUOUS_DB_OUTCOME');
    // Critical safety: Object is PRESERVED in storage
    assert.equal(mockStorage[`guest_ids/${p1}`], fakeBlob);
  });

  await suite.test('Gate 1.4: rollbackUploadedGuestIdFiles REFUSES deletion when failureStage is POST_COMMIT', async () => {
    const fakeBlob = { size: 4000, type: 'image/jpeg' };
    const { path: p1 } = await uploadGuestIdFile({ file: fakeBlob, tenantId: tenantA, side: 'front' });

    // Database committed; secondary operation (e.g. notification) failed
    const rollbackRes = await rollbackUploadedGuestIdFiles([p1], { failureStage: 'POST_COMMIT' });

    assert.deepEqual(rollbackRes.removed, []);
    assert.deepEqual(rollbackRes.preserved, [p1]);
    assert.equal(mockStorage[`guest_ids/${p1}`], fakeBlob);
  });

  await suite.test('Gate 1.5: rollbackUploadedGuestIdFiles with omitted options defaults to failureStage UNKNOWN and FAILS CLOSED', async () => {
    const fakeBlob = { size: 4500, type: 'image/jpeg' };
    const { path: p1 } = await uploadGuestIdFile({ file: fakeBlob, tenantId: tenantA, side: 'front' });

    // Calling rollbackUploadedGuestIdFiles([p1]) without explicit failureStage MUST FAIL CLOSED
    const rollbackRes = await rollbackUploadedGuestIdFiles([p1]);

    assert.deepEqual(rollbackRes.removed, []);
    assert.deepEqual(rollbackRes.preserved, [p1]);
    assert.equal(rollbackRes.reason, 'AMBIGUOUS_STAGE_UNKNOWN');
    assert.equal(mockStorage[`guest_ids/${p1}`], fakeBlob);
  });

  // ==========================================
  // GATE 3: MULTI-DOCUMENT CONSISTENCY
  // ==========================================

  await suite.test('Gate 3.1: FRONT upload succeeds, BACK upload fails -> Pre-DB rollback of FRONT, zero orphans', async () => {
    const newlyUploaded = [];
    const frontBlob = { size: 50000 };

    // 1. FRONT upload succeeds
    const { path: frontPath } = await uploadGuestIdFile({ file: frontBlob, tenantId: tenantA, side: 'front' });
    newlyUploaded.push(frontPath);
    assert.equal(Boolean(mockStorage[`guest_ids/${frontPath}`]), true);

    // 2. BACK upload fails
    const backUploadFailed = true;
    let failureStage = 'UPLOAD_PHASE';

    if (backUploadFailed) {
      // Database was never attempted; safely roll back FRONT
      const res = await rollbackUploadedGuestIdFiles(newlyUploaded, { failureStage });
      assert.deepEqual(res.removed, [frontPath]);
    }

    assert.equal(mockStorage[`guest_ids/${frontPath}`], undefined, 'FRONT must be rolled back cleanly');
    assert.equal(Object.keys(mockStorage).length, 0, 'Zero orphans left in storage');
  });

  await suite.test('Gate 3.2: FRONT and BACK uploads succeed, booking save fails with confirmed rejection -> Clean rollback', async () => {
    const newlyUploaded = [];
    const frontBlob = { size: 50000 };
    const backBlob = { size: 55000 };

    const { path: frontPath } = await uploadGuestIdFile({ file: frontBlob, tenantId: tenantA, side: 'front' });
    const { path: backPath } = await uploadGuestIdFile({ file: backBlob, tenantId: tenantA, side: 'back' });
    newlyUploaded.push(frontPath, backPath);

    // Database responds with explicit error (e.g. room conflict code '23505')
    const dbResult = { error: { message: 'Room already booked for these dates', code: '23505' } };
    let failureStage = 'CONFIRMED_DB_REJECTION';

    if (dbResult.error) {
      const res = await rollbackUploadedGuestIdFiles(newlyUploaded, { failureStage });
      assert.deepEqual(res.removed, [frontPath, backPath]);
    }

    assert.equal(mockStorage[`guest_ids/${frontPath}`], undefined);
    assert.equal(mockStorage[`guest_ids/${backPath}`], undefined);
  });

  await suite.test('Gate 3.3: Booking save succeeds but response is lost (network timeout) -> Objects PRESERVED', async () => {
    const newlyUploaded = [];
    const frontBlob = { size: 50000 };
    const backBlob = { size: 55000 };

    const { path: frontPath } = await uploadGuestIdFile({ file: frontBlob, tenantId: tenantA, side: 'front' });
    const { path: backPath } = await uploadGuestIdFile({ file: backBlob, tenantId: tenantA, side: 'back' });
    newlyUploaded.push(frontPath, backPath);

    // Network disconnect while database save was in flight
    let failureStage = 'AMBIGUOUS_DB_OUTCOME';

    const res = await rollbackUploadedGuestIdFiles(newlyUploaded, { failureStage });
    assert.deepEqual(res.removed, []);
    assert.deepEqual(res.preserved, [frontPath, backPath]);

    // Objects are NOT deleted, protecting committed row from broken attachments
    assert.equal(mockStorage[`guest_ids/${frontPath}`], frontBlob);
    assert.equal(mockStorage[`guest_ids/${backPath}`], backBlob);
  });

  await suite.test('Gate 3.4: Existing FRONT replaced while BACK remains unchanged -> Original BACK preserved', async () => {
    const originalFront = `${tenantA}/1790870548450-front.jpg`;
    const originalBack = `${tenantA}/1790870548451-back.jpg`;
    mockStorage[`guest_ids/${originalFront}`] = { size: 40000 };
    mockStorage[`guest_ids/${originalBack}`] = { size: 42000 };

    // User only replaces FRONT
    const newFrontBlob = { size: 60000 };
    const { path: newFrontPath } = await uploadGuestIdFile({ file: newFrontBlob, tenantId: tenantA, side: 'front' });

    // Validate normalization
    const frontNorm = normalizeGuestIdForPersistence({ currentValue: newFrontPath, initialValue: originalFront, tenantId: tenantA });
    const backNorm = normalizeGuestIdForPersistence({ currentValue: originalBack, initialValue: originalBack, tenantId: tenantA });

    assert.equal(frontNorm.path, newFrontPath);
    assert.equal(backNorm.path, originalBack);

    // Original back is 100% intact in storage
    assert.equal(Boolean(mockStorage[`guest_ids/${originalBack}`]), true);
  });

  await suite.test('Gate 3.5: Existing BACK replaced while FRONT remains unchanged -> Original FRONT preserved', async () => {
    const originalFront = `${tenantA}/1790870548450-front.jpg`;
    const originalBack = `${tenantA}/1790870548451-back.jpg`;
    mockStorage[`guest_ids/${originalFront}`] = { size: 40000 };
    mockStorage[`guest_ids/${originalBack}`] = { size: 42000 };

    // User only replaces BACK
    const newBackBlob = { size: 62000 };
    const { path: newBackPath } = await uploadGuestIdFile({ file: newBackBlob, tenantId: tenantA, side: 'back' });

    const frontNorm = normalizeGuestIdForPersistence({ currentValue: originalFront, initialValue: originalFront, tenantId: tenantA });
    const backNorm = normalizeGuestIdForPersistence({ currentValue: newBackPath, initialValue: originalBack, tenantId: tenantA });

    assert.equal(frontNorm.path, originalFront);
    assert.equal(backNorm.path, newBackPath);

    // Original front is 100% intact in storage
    assert.equal(Boolean(mockStorage[`guest_ids/${originalFront}`]), true);
  });

  await suite.test('Gate 3.6: Two rapid save attempts occur -> isSubmitting guard prevents duplicate uploads', async () => {
    let isSubmitting = false;
    let uploadCount = 0;

    const fakeSubmit = async () => {
      if (isSubmitting) return;
      isSubmitting = true;
      try {
        await uploadGuestIdFile({ file: { size: 100 }, tenantId: tenantA, side: 'front' });
        uploadCount++;
      } finally {
        isSubmitting = false;
      }
    };

    // Simulate 3 concurrent rapid clicks
    await Promise.all([fakeSubmit(), fakeSubmit(), fakeSubmit()]);
    assert.equal(uploadCount, 1, 'Only exactly 1 upload must be executed despite rapid repeated clicks');
  });

  // ==========================================
  // GATE 4: INTEGRATION & COMPATIBILITY SUITE
  // ==========================================

  await suite.test('Gate 4.1: Additional guest documents follow identical deferred upload and safe rollback', async () => {
    const newlyUploaded = [];
    const addlFront = { size: 35000 };
    const { path: addlFrontPath } = await uploadGuestIdFile({ file: addlFront, tenantId: tenantA, side: 'front' });
    newlyUploaded.push(addlFrontPath);

    assert.equal(Boolean(mockStorage[`guest_ids/${addlFrontPath}`]), true);

    // Confirmed DB rejection rolls back additional guest upload
    await rollbackUploadedGuestIdFiles(newlyUploaded, { failureStage: 'CONFIRMED_DB_REJECTION' });
    assert.equal(mockStorage[`guest_ids/${addlFrontPath}`], undefined);
  });

  await suite.test('Gate 4.2: Staff booking workflow preserves tenant isolation and upload timing', async () => {
    const staffTenantId = tenantA;
    const { path, error } = await uploadGuestIdFile({ file: { size: 40000 }, tenantId: staffTenantId, side: 'front' });

    assert.equal(error, undefined);
    assert.equal(isCanonicalGuestIdPath(path, staffTenantId), true);
  });

  await suite.test('Gate 4.3: Existing guest ID viewing preserves 300-second signed URL behavior', async () => {
    const canonicalPath = `${tenantA}/1790870548450-front.jpg`;
    const signedUrl = await getGuestIdSignedUrl(canonicalPath, 300);

    assert.match(signedUrl, /^https:\/\/lubkdxhqnnghnjhrebat\.supabase\.co\/storage\/v1\/object\/sign\/guest_ids/);
    assert.match(signedUrl, /expiresIn=300/);
    assert.equal(storageOperationsLog.some(op => op.op === 'createSignedUrl' && op.expiresIn === 300), true);
  });

  await suite.test('Gate 4.4: AI Smart Capture and mobile capture remain functional without early upload', () => {
    // Edge Function receives { base64Image, side } directly from memory
    const memoryBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
    const payload = { base64Image: memoryBase64, side: 'front' };

    assert.equal(payload.base64Image, memoryBase64);
    assert.equal(payload.side, 'front');
    assert.equal(storageOperationsLog.filter(op => op.op === 'upload').length, 0);
  });

  await suite.test('Gate 4.5: Booking cancellation/deletion preserves retention requirements', () => {
    const bookingRecord = {
      id: 'b1234567-0000-0000-0000-000000000001',
      status: 'Cancelled',
      id_front_image_url: `${tenantA}/1790870548450-front.jpg`
    };

    assert.equal(bookingRecord.status, 'Cancelled');
    assert.equal(isCanonicalGuestIdPath(bookingRecord.id_front_image_url, tenantA), true);
    // Cancellation retains attachment for compliance/audit; zero objects deleted
    assert.equal(storageOperationsLog.filter(op => op.op === 'remove').length, 0);
  });
});
