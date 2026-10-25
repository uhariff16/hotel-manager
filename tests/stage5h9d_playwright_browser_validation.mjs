import { chromium } from 'playwright';
import path from 'node:path';
import fs from 'node:fs';

async function runBrowserValidation() {
  console.log('======================================================================');
  console.log('STAYPILOT — STAGE 5H.9D.0A: PLAYWRIGHT REAL-BROWSER VALIDATION');
  console.log('Engine: Chromium Headless');
  console.log('Environment: Isolated Local Synthetic Storage & Browser Runtime');
  console.log('======================================================================\n');

  let passedCount = 0;
  let totalCount = 0;

  function assert(desc, condition) {
    totalCount++;
    if (condition) {
      console.log(`  ✔ [PASS] ${desc}`);
      passedCount++;
    } else {
      console.error(`  ✖ [FAIL] ${desc}`);
      process.exitCode = 1;
    }
  }

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  // Synthetic tenant constants
  const tenantA = '3797dba7-a7fd-4ca6-86cb-b45519953947';
  const tenantB = '1707818e-79ff-4a0c-9f99-7d991cc27842';

  // Read the source of src/lib/guestIdStorage.js
  const storageLibPath = path.resolve('src/lib/guestIdStorage.js');
  let storageLibCode = fs.readFileSync(storageLibPath, 'utf8');

  // Convert exports to attach to global window
  const moduleBridgeCode = `
    ${storageLibCode.replace(/import\([^)]+\)/g, 'Promise.resolve(window.mockSupabase)')}
    window.guestIdStorage = {
      CANONICAL_SUPABASE_ORIGIN,
      setGuestIdStorageClient,
      setAllowTestOrigins,
      isAllowedSupabaseOrigin,
      isCanonicalGuestIdPath,
      extractGuestIdPath,
      normalizeGuestIdForPersistence,
      getGuestIdSignedUrl
    };
  `;

  // Load a complete test page with real DOM, file inputs, canvas, and UI preview containers
  await page.setContent(`
    <!DOCTYPE html>
    <html>
      <head>
        <title>StayPilot Guest ID Browser Test</title>
      </head>
      <body>
        <div id="app">
          <h2>Booking Form Guest ID Proof Test</h2>
          
          <div id="front-scanner-container">
            <input type="file" id="file-upload-front" accept="image/*" />
            <div id="front-preview-box"></div>
          </div>

          <div id="back-scanner-container">
            <input type="file" id="file-upload-back" accept="image/*" />
            <div id="back-preview-box"></div>
          </div>

          <div id="additional-guests-container"></div>
        </div>
      </body>
    </html>
  `);

  // Setup mock storage and inject module via addScriptTag as type="module"
  await page.evaluate(({ tenantA }) => {
    window.mockStorageDb = new Map();
    window.activeSession = {
      tenantId: tenantA,
      role: 'tenant_admin'
    };

    window.mockSupabase = {
      supabase: {
        storage: {
          from: (bucket) => ({
            upload: async (filePath, fileBlob) => {
              if (window.activeSession.role === 'unauthenticated') {
                return { data: null, error: { message: 'Unauthorized' } };
              }
              const pathTenant = filePath.split('/')[0];
              if (window.activeSession.role !== 'super_admin' && pathTenant !== window.activeSession.tenantId) {
                return { data: null, error: { message: 'Cross-tenant upload forbidden by RLS' } };
              }
              window.mockStorageDb.set(filePath, { size: fileBlob.size, type: fileBlob.type });
              return { data: { path: filePath }, error: null };
            },
            createSignedUrl: async (filePath, expiresIn) => {
              if (window.activeSession.role === 'unauthenticated') {
                return { data: null, error: { message: 'Unauthorized' } };
              }
              const pathTenant = filePath.split('/')[0];
              if (window.activeSession.role !== 'super_admin' && pathTenant !== window.activeSession.tenantId) {
                return { data: null, error: { message: 'Cross-tenant view forbidden by RLS' } };
              }
              if (!window.mockStorageDb.has(filePath)) {
                return { data: null, error: { message: 'Object not found' } };
              }
              const token = `browser_sig_${Date.now()}_exp${expiresIn}`;
              return {
                data: { signedUrl: `https://lubkdxhqnnghnjhrebat.supabase.co/storage/v1/object/sign/guest_ids/${filePath}?token=${token}` },
                error: null
              };
            }
          })
        }
      }
    };
  }, { tenantA });

  // Add the script module directly to DOM
  await page.addScriptTag({ content: moduleBridgeCode, type: 'module' });

  // Wait for module execution and initialize client
  await page.waitForFunction(() => window.guestIdStorage !== undefined);
  await page.evaluate(() => {
    window.guestIdStorage.setGuestIdStorageClient(window.mockSupabase.supabase);
  });

  console.log('--- Step 1: Real Browser Synthetic File Upload & Canvas Processing ---');
  // 1. Simulate real browser file creation and Canvas image drawing
  const uploadResult = await page.evaluate(async ({ tenantA }) => {
    const canvas = document.createElement('canvas');
    canvas.width = 100;
    canvas.height = 100;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#4ade80';
    ctx.fillRect(0, 0, 100, 100);
    
    const blob = await new Promise(res => canvas.toBlob(res, 'image/jpeg', 0.8));
    const localBlobUrl = URL.createObjectURL(blob);

    // Upload front
    const frontFileName = `${tenantA}/${Date.now()}-front.jpg`;
    const { error: frontErr } = await window.mockSupabase.supabase.storage.from('guest_ids').upload(frontFileName, blob);
    
    // Upload back
    const backFileName = `${tenantA}/${Date.now()}-back.jpg`;
    const { error: backErr } = await window.mockSupabase.supabase.storage.from('guest_ids').upload(backFileName, blob);

    return {
      frontFileName,
      backFileName,
      localBlobUrl,
      frontSuccess: !frontErr,
      backSuccess: !backErr
    };
  }, { tenantA });

  assert('Synthetic JPEG canvas images generated in browser', uploadResult.frontSuccess && uploadResult.backSuccess);

  console.log('--- Step 2: Save Booking & Verify Canonical Paths Stored ---');
  const saveResult = await page.evaluate(({ uploadResult, tenantA }) => {
    const frontNorm = window.guestIdStorage.normalizeGuestIdForPersistence({
      currentValue: uploadResult.frontFileName,
      initialValue: '',
      tenantId: tenantA
    });
    const backNorm = window.guestIdStorage.normalizeGuestIdForPersistence({
      currentValue: uploadResult.backFileName,
      initialValue: '',
      tenantId: tenantA
    });

    const bookingRow = {
      id: 'b-browser-001',
      tenant_id: tenantA,
      guest_name: 'Browser Synthetic Guest',
      id_front_image_url: frontNorm.path,
      id_back_image_url: backNorm.path
    };

    return {
      frontNorm,
      backNorm,
      bookingRow
    };
  }, { uploadResult, tenantA });

  assert('Front document normalized to canonical path', saveResult.frontNorm.valid && saveResult.frontNorm.path === uploadResult.frontFileName);
  assert('Back document normalized to canonical path', saveResult.backNorm.valid && saveResult.backNorm.path === uploadResult.backFileName);
  assert('Database row contains zero bearer tokens or signed URLs', !saveResult.bookingRow.id_front_image_url.includes('?') && !saveResult.bookingRow.id_front_image_url.includes('token'));

  console.log('--- Step 3: Reopen Booking & Render Ephemeral Previews in DOM ---');
  const previewResult = await page.evaluate(async ({ bookingRow, tenantA }) => {
    const frontSignedUrl = await window.guestIdStorage.getGuestIdSignedUrl(bookingRow.id_front_image_url, 300, null, tenantA);
    const backSignedUrl = await window.guestIdStorage.getGuestIdSignedUrl(bookingRow.id_back_image_url, 300, null, tenantA);

    const frontBox = document.getElementById('front-preview-box');
    frontBox.innerHTML = `<img id="front-img" src="${frontSignedUrl}" alt="Front ID" />`;

    const backBox = document.getElementById('back-preview-box');
    backBox.innerHTML = `<img id="back-img" src="${backSignedUrl}" alt="Back ID" />`;

    return {
      frontSignedUrl,
      backSignedUrl,
      frontDomSrc: document.getElementById('front-img').getAttribute('src'),
      backDomSrc: document.getElementById('back-img').getAttribute('src')
    };
  }, { bookingRow: saveResult.bookingRow, tenantA });

  assert('Ephemeral 300s signed URL generated for front preview', previewResult.frontSignedUrl.includes('exp300'));
  assert('Ephemeral 300s signed URL generated for back preview', previewResult.backSignedUrl.includes('exp300'));
  assert('DOM <img> elements successfully rendered with fresh signed URLs', previewResult.frontDomSrc.startsWith('https://lubkdxhqnnghnjhrebat.supabase.co'));

  console.log('--- Step 4: Existing Legacy Signed URL Resolution ---');
  const legacyResult = await page.evaluate(async ({ tenantA }) => {
    const legacyPath = `${tenantA}/1790870548450-legacy-front.jpg`;
    await window.mockSupabase.supabase.storage.from('guest_ids').upload(legacyPath, new Blob(['legacy']));

    const legacyUrl = `https://lubkdxhqnnghnjhrebat.supabase.co/storage/v1/object/sign/guest_ids/${legacyPath}?token=old10YearToken`;
    
    const freshUrl = await window.guestIdStorage.getGuestIdSignedUrl(legacyUrl, 300, null, tenantA);
    const norm = window.guestIdStorage.normalizeGuestIdForPersistence({ currentValue: legacyUrl, tenantId: tenantA });

    return {
      freshUrl,
      normPath: norm.path,
      legacyPath
    };
  }, { tenantA });

  assert('Legacy 10-year signed URL automatically converted to 300s URL on display', legacyResult.freshUrl.includes('exp300'));
  assert('Legacy 10-year signed URL converted to clean canonical path on save', legacyResult.normPath === legacyResult.legacyPath);

  console.log('--- Step 5: Editing Unrelated Field Preserves Documents Intact ---');
  const editPreserveResult = await page.evaluate(({ bookingRow, tenantA }) => {
    bookingRow.guest_name = 'Updated Guest Name';
    
    const frontNorm = window.guestIdStorage.normalizeGuestIdForPersistence({
      currentValue: bookingRow.id_front_image_url,
      initialValue: bookingRow.id_front_image_url,
      tenantId: tenantA
    });
    const backNorm = window.guestIdStorage.normalizeGuestIdForPersistence({
      currentValue: bookingRow.id_back_image_url,
      initialValue: bookingRow.id_back_image_url,
      tenantId: tenantA
    });

    return {
      frontPath: frontNorm.path,
      backPath: backNorm.path,
      initialFront: bookingRow.id_front_image_url,
      initialBack: bookingRow.id_back_image_url
    };
  }, { bookingRow: saveResult.bookingRow, tenantA });

  assert('Saving edited booking preserves front path unchanged', editPreserveResult.frontPath === editPreserveResult.initialFront);
  assert('Saving edited booking preserves back path unchanged', editPreserveResult.backPath === editPreserveResult.initialBack);

  console.log('--- Step 6: Independent Replacement of One Document ---');
  const replaceResult = await page.evaluate(async ({ bookingRow, tenantA }) => {
    const newFrontPath = `${tenantA}/${Date.now()}-front-v2.jpg`;
    await window.mockSupabase.supabase.storage.from('guest_ids').upload(newFrontPath, new Blob(['v2']));

    const initialBack = bookingRow.id_back_image_url;

    const frontNorm = window.guestIdStorage.normalizeGuestIdForPersistence({
      currentValue: newFrontPath,
      initialValue: bookingRow.id_front_image_url,
      tenantId: tenantA
    });
    const backNorm = window.guestIdStorage.normalizeGuestIdForPersistence({
      currentValue: bookingRow.id_back_image_url,
      initialValue: bookingRow.id_back_image_url,
      tenantId: tenantA
    });

    return {
      newFront: frontNorm.path,
      preservedBack: backNorm.path,
      initialBack
    };
  }, { bookingRow: saveResult.bookingRow, tenantA });

  assert('Front document replaced with new canonical path', replaceResult.newFront.includes('front-v2.jpg'));
  assert('Back document strictly preserved without modification', replaceResult.preservedBack === replaceResult.initialBack);

  console.log('--- Step 7: Malformed Legacy Reference Non-Destructive Protection ---');
  const malformedResult = await page.evaluate(({ tenantA }) => {
    const existingValidPath = `${tenantA}/good-id.jpg`;
    const maliciousOrCorruptedInput = 'https://attacker.com/storage/v1/object/sign/guest_ids/corrupt.jpg';

    const norm = window.guestIdStorage.normalizeGuestIdForPersistence({
      currentValue: maliciousOrCorruptedInput,
      initialValue: existingValidPath,
      tenantId: tenantA
    });

    return {
      valid: norm.valid,
      wasPreserved: norm.wasPreserved,
      path: norm.path,
      error: norm.error,
      existingValidPath
    };
  }, { tenantA });

  assert('Malformed or external URL rejected by normalizer', malformedResult.valid === false);
  assert('Existing valid document preserved to prevent silent data loss', malformedResult.wasPreserved === true && malformedResult.path === malformedResult.existingValidPath);

  console.log('--- Step 8: Expired Preview URL Click-To-Open Fresh Generation ---');
  const clickZoomResult = await page.evaluate(async ({ bookingRow, tenantA }) => {
    const freshZoomUrl = await window.guestIdStorage.getGuestIdSignedUrl(bookingRow.id_front_image_url, 300, null, tenantA);
    return {
      hasUrl: Boolean(freshZoomUrl),
      isFreshExp: freshZoomUrl.includes('exp300')
    };
  }, { bookingRow: saveResult.bookingRow, tenantA });

  assert('Click-to-view generates fresh 300s signed URL in real time', clickZoomResult.hasUrl && clickZoomResult.isFreshExp);

  console.log('--- Step 9: Additional Guest Document Handling & Transient URL Safeguard ---');
  const addGuestResult = await page.evaluate(({ tenantA }) => {
    const validGuestDoc = window.guestIdStorage.normalizeGuestIdForPersistence({
      currentValue: `${tenantA}/guest-front.jpg`,
      initialValue: '',
      tenantId: tenantA
    });

    const unfinishedGuestDoc = window.guestIdStorage.normalizeGuestIdForPersistence({
      currentValue: 'blob:https://staypilot.co.in/unfinished-photo',
      initialValue: '',
      tenantId: tenantA
    });

    return {
      validDoc: validGuestDoc.valid,
      validPath: validGuestDoc.path,
      unfinishedDoc: unfinishedGuestDoc.valid,
      unfinishedPath: unfinishedGuestDoc.path
    };
  }, { tenantA });

  assert('Additional guest valid document accepted as canonical path', addGuestResult.validDoc && addGuestResult.validPath === `${tenantA}/guest-front.jpg`);
  assert('Additional guest transient blob: URL strictly rejected from database persistence', addGuestResult.unfinishedDoc === false && addGuestResult.unfinishedPath === '');

  console.log('--- Step 10: Logout & Tenant Switching Isolation in Browser ---');
  const isolationResult = await page.evaluate(async ({ uploadResult, tenantA, tenantB }) => {
    const docPath = uploadResult.frontFileName;

    // 1. Session A accesses own document
    window.activeSession = { tenantId: tenantA, role: 'tenant_admin' };
    const tenantAUrl = await window.guestIdStorage.getGuestIdSignedUrl(docPath, 300, null, tenantA);

    // 2. Tenant switch / login as Tenant B
    window.activeSession = { tenantId: tenantB, role: 'tenant_admin' };
    const tenantBUrl = await window.guestIdStorage.getGuestIdSignedUrl(docPath, 300, null, tenantB);

    // 3. Logout / unauthenticated
    window.activeSession = { tenantId: null, role: 'unauthenticated' };
    const unauthUrl = await window.guestIdStorage.getGuestIdSignedUrl(docPath, 300);

    return {
      tenantAAccess: Boolean(tenantAUrl),
      tenantBAccess: Boolean(tenantBUrl),
      unauthAccess: Boolean(unauthUrl)
    };
  }, { uploadResult, tenantA, tenantB });

  assert('Tenant A successfully loads their own document preview in browser', isolationResult.tenantAAccess === true);
  assert('Tenant B is DENIED signed URL for Tenant A document (Cross-tenant rejection)', isolationResult.tenantBAccess === false);
  assert('Unauthenticated / logged out session is DENIED document preview', isolationResult.unauthAccess === false);

  await browser.close();

  console.log('\n======================================================================');
  console.log(`REAL BROWSER VALIDATION COMPLETE: ${passedCount} / ${totalCount} CHECKS PASSED`);
  console.log('======================================================================\n');
}

runBrowserValidation().catch(err => {
  console.error('Browser validation failed:', err);
  process.exit(1);
});
