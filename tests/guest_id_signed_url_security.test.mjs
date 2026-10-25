import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { 
  extractGuestIdPath, 
  isCanonicalGuestIdPath, 
  getGuestIdSignedUrl, 
  setGuestIdStorageClient,
  setAllowTestOrigins,
  isAllowedSupabaseOrigin,
  normalizeGuestIdForPersistence,
  CANONICAL_SUPABASE_ORIGIN
} from '../src/lib/guestIdStorage.js';

test('STAGE 5H.9D.0: Final Signed URL Security, Exact Origin & Persistence Safeguards', async (t) => {
  const sampleTenantId = '3797dba7-a7fd-4ca6-86cb-b45519953947';
  const otherTenantId = '1707818e-79ff-4a0c-9f99-7d991cc27842';
  const sampleFilename = '1790870548450-front.jpg';
  const canonicalPath = `${sampleTenantId}/${sampleFilename}`;

  // Ensure production mode (no test origins allowed) by default
  setAllowTestOrigins(false);

  // ==========================================
  // PHASE B: EXACT SUPABASE ORIGIN ALLOWLIST
  // ==========================================

  await t.test('1. Correct production origin is ACCEPTED', () => {
    const validUrl = new URL(`https://lubkdxhqnnghnjhrebat.supabase.co/storage/v1/object/sign/guest_ids/${canonicalPath}?token=abc`);
    assert.equal(isAllowedSupabaseOrigin(validUrl), true);
    assert.equal(extractGuestIdPath(validUrl.toString()), canonicalPath);
  });

  await t.test('2. Different Supabase project is REJECTED', () => {
    const diffProjectUrl = new URL(`https://otherproject12345678.supabase.co/storage/v1/object/sign/guest_ids/${canonicalPath}?token=abc`);
    assert.equal(isAllowedSupabaseOrigin(diffProjectUrl), false);
    assert.equal(extractGuestIdPath(diffProjectUrl.toString()), '');
  });

  await t.test('3. Arbitrary Supabase subdomain is REJECTED', () => {
    const arbitrarySubdomain = new URL(`https://xyz.supabase.co/storage/v1/object/sign/guest_ids/${canonicalPath}?token=abc`);
    assert.equal(isAllowedSupabaseOrigin(arbitrarySubdomain), false);
    assert.equal(extractGuestIdPath(arbitrarySubdomain.toString()), '');
  });

  await t.test('4. Lookalike domains are REJECTED', () => {
    const lookalikes = [
      `https://lubkdxhqnnghnjhrebat.supabase.co.attacker.com/storage/v1/object/sign/guest_ids/${canonicalPath}?token=abc`,
      `https://lubkdxhqnnghnjhrebat-supabase.co/storage/v1/object/sign/guest_ids/${canonicalPath}?token=abc`,
      `https://evil-lubkdxhqnnghnjhrebat.supabase.co/storage/v1/object/sign/guest_ids/${canonicalPath}?token=abc`
    ];
    for (const urlStr of lookalikes) {
      assert.equal(extractGuestIdPath(urlStr), '', `Must reject lookalike domain: ${urlStr}`);
    }
  });

  await t.test('5. HTTP downgrade is REJECTED', () => {
    const httpDowngrade = `http://lubkdxhqnnghnjhrebat.supabase.co/storage/v1/object/sign/guest_ids/${canonicalPath}?token=abc`;
    assert.equal(extractGuestIdPath(httpDowngrade), '', 'HTTP downgrade must fail closed');
  });

  await t.test('6. External HTTPS origin is REJECTED', () => {
    const external = `https://evil.com/storage/v1/object/sign/guest_ids/${canonicalPath}?token=abc`;
    assert.equal(extractGuestIdPath(external), '');
  });

  await t.test('7. Unexpected port is REJECTED', () => {
    const nonStandardPort = `https://lubkdxhqnnghnjhrebat.supabase.co:8443/storage/v1/object/sign/guest_ids/${canonicalPath}?token=abc`;
    assert.equal(extractGuestIdPath(nonStandardPort), '', 'Non-standard port must fail closed');
  });

  await t.test('8. Username/password URL authority is REJECTED', () => {
    const authorityCredentials = `https://admin:secret@lubkdxhqnnghnjhrebat.supabase.co/storage/v1/object/sign/guest_ids/${canonicalPath}?token=abc`;
    assert.equal(extractGuestIdPath(authorityCredentials), '', 'Authority credentials must fail closed');
  });

  await t.test('9. Localhost is REJECTED in production mode', () => {
    setAllowTestOrigins(false);
    const localUrl = `http://localhost:54321/storage/v1/object/sign/guest_ids/${canonicalPath}?token=abc`;
    assert.equal(extractGuestIdPath(localUrl), '', 'Localhost must be rejected in production mode');
  });

  await t.test('10. Explicit localhost test origin is ACCEPTED ONLY in test mode', () => {
    setAllowTestOrigins(true);
    const localUrl = `http://localhost:54321/storage/v1/object/sign/guest_ids/${canonicalPath}?token=abc`;
    assert.equal(extractGuestIdPath(localUrl), canonicalPath, 'Localhost must be accepted when allowTestOrigins is true');
    // Reset back to production mode
    setAllowTestOrigins(false);
    assert.equal(extractGuestIdPath(localUrl), '', 'Localhost must be rejected after resetting to production mode');
  });

  await t.test('11. Encoded path traversal is REJECTED', () => {
    const traversals = [
      `https://lubkdxhqnnghnjhrebat.supabase.co/storage/v1/object/sign/guest_ids/..%2F..%2Fetc%2Fpasswd`,
      `https://lubkdxhqnnghnjhrebat.supabase.co/storage/v1/object/sign/guest_ids/${sampleTenantId}/%2e%2e%2fanother-tenant/id.jpg`,
      `https://lubkdxhqnnghnjhrebat.supabase.co/storage/v1/object/sign/guest_ids/${sampleTenantId}/../../secret`
    ];
    for (const tUrl of traversals) {
      assert.equal(extractGuestIdPath(tUrl), '', `Must reject traversal: ${tUrl}`);
    }
  });

  await t.test('12. Double URL encoding is REJECTED', () => {
    const doubleEncoded = `https://lubkdxhqnnghnjhrebat.supabase.co/storage/v1/object/sign/guest_ids/${sampleTenantId}%252F${sampleFilename}`;
    assert.equal(extractGuestIdPath(doubleEncoded), '', 'Double-encoded URL must fail closed');
  });

  await t.test('13. Non-guest_ids bucket is REJECTED', () => {
    const wrongBuckets = [
      `https://lubkdxhqnnghnjhrebat.supabase.co/storage/v1/object/sign/property-images/${canonicalPath}?token=abc`,
      `https://lubkdxhqnnghnjhrebat.supabase.co/storage/v1/object/public/public-assets/${canonicalPath}`,
      `https://lubkdxhqnnghnjhrebat.supabase.co/storage/v1/object/sign/staypilot-media/${canonicalPath}?token=abc`
    ];
    for (const bUrl of wrongBuckets) {
      assert.equal(extractGuestIdPath(bUrl), '', `Must reject bucket: ${bUrl}`);
    }
  });

  await t.test('14. Invalid UUID is REJECTED', () => {
    const invalidUuids = [
      'not-a-uuid/photo.jpg',
      '12345/photo.jpg',
      'g797dba7-a7fd-4ca6-86cb-b45519953947/photo.jpg',
      '3797dba7-a7fd-4ca6-86cb-b4551995394/photo.jpg'
    ];
    for (const p of invalidUuids) {
      assert.equal(isCanonicalGuestIdPath(p), false);
      assert.equal(extractGuestIdPath(p), '');
    }
  });

  await t.test('15. Canonical relative path is ACCEPTED', () => {
    assert.equal(isCanonicalGuestIdPath(canonicalPath), true);
    assert.equal(extractGuestIdPath(canonicalPath), canonicalPath);
  });

  // ==========================================
  // PHASE C: TRANSIENT URL & PERSISTENCE GUARDS
  // ==========================================

  await t.test('16. normalizeGuestIdForPersistence accepts clean canonical path', () => {
    const res = normalizeGuestIdForPersistence({
      currentValue: canonicalPath,
      initialValue: canonicalPath,
      tenantId: sampleTenantId
    });
    assert.equal(res.valid, true);
    assert.equal(res.path, canonicalPath);
  });

  await t.test('17. normalizeGuestIdForPersistence parses legacy signed URL into canonical path', () => {
    const legacyUrl = `https://lubkdxhqnnghnjhrebat.supabase.co/storage/v1/object/sign/guest_ids/${canonicalPath}?token=10YearToken`;
    const res = normalizeGuestIdForPersistence({
      currentValue: legacyUrl,
      initialValue: legacyUrl,
      tenantId: sampleTenantId
    });
    assert.equal(res.valid, true);
    assert.equal(res.path, canonicalPath);
  });

  await t.test('18. normalizeGuestIdForPersistence rejects transient blob: and preserves existing document', () => {
    const blobUrl = 'blob:https://staypilot.co.in/0f488e7b-cba1-4bdf-87f5-d91295325c34';
    const res = normalizeGuestIdForPersistence({
      currentValue: blobUrl,
      initialValue: canonicalPath,
      tenantId: sampleTenantId
    });
    assert.equal(res.valid, false);
    assert.equal(res.wasPreserved, true);
    assert.equal(res.path, canonicalPath, 'Must preserve existing canonical path');
    assert.match(res.error, /upload/i);
  });

  await t.test('19. normalizeGuestIdForPersistence rejects transient data: URL on new record without crashing', () => {
    const dataUrl = 'data:image/jpeg;base64,/9j/4AAQSkZJRg...';
    const res = normalizeGuestIdForPersistence({
      currentValue: dataUrl,
      initialValue: '',
      tenantId: sampleTenantId
    });
    assert.equal(res.valid, false);
    assert.equal(res.path, '');
    assert.match(res.error, /upload/i);
  });

  await t.test('20. normalizeGuestIdForPersistence rejects malformed string and preserves existing document', () => {
    const malformed = 'https://attacker.com/malicious.jpg';
    const res = normalizeGuestIdForPersistence({
      currentValue: malformed,
      initialValue: canonicalPath,
      tenantId: sampleTenantId
    });
    assert.equal(res.valid, false);
    assert.equal(res.wasPreserved, true);
    assert.equal(res.path, canonicalPath, 'Must safely preserve initial valid path');
  });

  await t.test('21. normalizeGuestIdForPersistence rejects cross-tenant path', () => {
    const crossTenantPath = `${otherTenantId}/stolen-id.jpg`;
    const res = normalizeGuestIdForPersistence({
      currentValue: crossTenantPath,
      initialValue: canonicalPath,
      tenantId: sampleTenantId
    });
    assert.equal(res.valid, false);
    assert.equal(res.wasPreserved, true);
    assert.equal(res.path, canonicalPath, 'Must reject cross-tenant path and preserve original');
    assert.match(res.error, /cross-tenant/i);
  });

  await t.test('22. normalizeGuestIdForPersistence allows intentional empty/cleared document', () => {
    const res = normalizeGuestIdForPersistence({
      currentValue: '',
      initialValue: canonicalPath,
      tenantId: sampleTenantId
    });
    assert.equal(res.valid, true);
    assert.equal(res.path, '');
  });

  // ==========================================
  // SOURCE CODE & STATIC AUDIT
  // ==========================================

  await t.test('23. IDScanner.jsx contains ZERO createSignedUrl calls on upload', () => {
    const idScannerContent = fs.readFileSync(path.resolve('src/components/IDScanner.jsx'), 'utf8');
    assert.equal(idScannerContent.includes('315360000'), false);
    assert.equal(idScannerContent.includes('createSignedUrl'), false);
  });

  await t.test('24. BookingForm.jsx uses normalizeGuestIdForPersistence for both primary and additional guests', () => {
    const bookingFormContent = fs.readFileSync(path.resolve('src/pages/BookingForm.jsx'), 'utf8');
    assert.equal(bookingFormContent.includes('normalizeGuestIdForPersistence'), true);
    assert.equal(bookingFormContent.includes('initialDocsRef'), true);
  });
});
