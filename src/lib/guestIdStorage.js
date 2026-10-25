/**
 * Utility functions for secure guest ID storage paths and on-demand short-lived signed URLs.
 * 
 * ARCHITECTURE RULES:
 * 1. Storage paths must always follow the canonical format: `<tenant_id>/<timestamp>-<side>.jpg`.
 * 2. Database records (bookings.id_front_image_url, bookings.id_back_image_url) must store
 *    ONLY canonical storage paths, NEVER long-lived tokenized signed URLs.
 * 3. Previews and downloads in the UI must request ephemeral short-lived signed URLs
 *    (default: 300 seconds / 5 minutes) that are verified against PostgreSQL RLS at request time.
 * 4. Backward compatibility: Legacy 10-year signed URLs stored in historical booking records
 *    are safely parsed to extract their canonical storage path with strict origin, bucket,
 *    and traversal validation.
 * 5. Transient previews (blob: and data: URLs) are strictly transient and never persisted.
 * 6. Non-destructive safety: Unparseable or malformed input must never silently overwrite
 *    or wipe out an existing valid database reference.
 */

let customStorageClient = null;
let allowTestOrigins = false;

// The canonical production Supabase project origin for StayPilot
export const CANONICAL_SUPABASE_ORIGIN = 'https://lubkdxhqnnghnjhrebat.supabase.co';

/**
 * Allows injecting a custom Supabase client for testing or isolated environments.
 */
export function setGuestIdStorageClient(client) {
  customStorageClient = client;
}

/**
 * Allows explicitly enabling localhost/test origins during isolated test runs.
 * Defaults to FALSE in production.
 */
export function setAllowTestOrigins(allowed) {
  allowTestOrigins = Boolean(allowed);
}

async function getSupabaseClient() {
  if (customStorageClient) return customStorageClient;
  try {
    const mod = await import('./supabase.js');
    return mod.supabase;
  } catch (err) {
    return null;
  }
}

// Canonical UUID v4/generic 8-4-4-4-12 pattern
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Safe filename pattern: letters, numbers, dots, hyphens, underscores (no slashes, no spaces)
const SAFE_FILENAME_REGEX = /^[a-zA-Z0-9_.-]+$/;
// Strict canonical path: <uuid>/<filename>
const CANONICAL_PATH_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/[a-zA-Z0-9_.-]+$/i;

/**
 * Validates whether a URL object possesses an authorized Supabase origin.
 * Enforces:
 * - Exact origin match with CANONICAL_SUPABASE_ORIGIN in production.
 * - Rejection of arbitrary *.supabase.co subdomains.
 * - Rejection of HTTP protocol (no HTTP downgrade).
 * - Rejection of non-standard ports.
 * - Rejection of URL authority credentials (username:password@).
 * - Rejection of lookalike domains.
 * - Rejection of localhost unless test origins are explicitly enabled.
 * 
 * @param {URL} urlObj
 * @returns {boolean}
 */
export function isAllowedSupabaseOrigin(urlObj) {
  if (!urlObj || !(urlObj instanceof URL)) return false;

  // 1. Reject URL authority credentials (user:password@)
  if (urlObj.username || urlObj.password) {
    return false;
  }

  // 2. Reject non-standard ports (must be standard HTTPS 443 / empty)
  if (urlObj.port && urlObj.port !== '443' && urlObj.port !== '80') {
    // If test mode is enabled, accept localhost ports (e.g. 54321, 5173, 3000)
    if (allowTestOrigins && (urlObj.hostname === 'localhost' || urlObj.hostname === '127.0.0.1')) {
      return true;
    }
    return false;
  }

  // 3. In test mode, allow explicitly configured test origins
  if (allowTestOrigins) {
    if (urlObj.hostname === 'localhost' || urlObj.hostname === '127.0.0.1') {
      return true;
    }
  }

  // 4. Production exact origin validation:
  // Must be strictly HTTPS and exact origin match with CANONICAL_SUPABASE_ORIGIN
  if (urlObj.protocol !== 'https:') {
    return false;
  }

  // Exact origin equality check prevents lookalike domains (e.g. lubkdxhqnnghnjhrebat.supabase.co.evil.com)
  // and prevents arbitrary *.supabase.co tenant hopping.
  return urlObj.origin === CANONICAL_SUPABASE_ORIGIN;
}

/**
 * Checks whether a value conforms strictly to the canonical tenant storage path format: `<uuid>/<filename>`.
 * Rejects path traversal, query parameters, fragments, URL schemes, empty filenames, or nested paths.
 * 
 * @param {string} val
 * @param {string} [expectedTenantId] - Optional tenant ID to enforce tenant isolation
 * @returns {boolean}
 */
export function isCanonicalGuestIdPath(val, expectedTenantId = null) {
  if (!val || typeof val !== 'string') return false;
  const trimmed = val.trim();
  
  // Disallow any URL scheme, query, fragment, traversal, or multi-directory paths
  if (trimmed.includes('://') || trimmed.includes('?') || trimmed.includes('#')) return false;
  if (trimmed.includes('..') || trimmed.includes('\\') || trimmed.includes('//')) return false;
  if (trimmed.startsWith('/') || trimmed.endsWith('/')) return false;

  const parts = trimmed.split('/');
  if (parts.length !== 2) return false;

  const [tenantUuid, filename] = parts;
  if (!UUID_REGEX.test(tenantUuid)) return false;
  if (!SAFE_FILENAME_REGEX.test(filename)) return false;
  if (filename === '.' || filename === '..') return false;

  if (expectedTenantId && tenantUuid.toLowerCase() !== expectedTenantId.toLowerCase()) {
    return false;
  }

  return true;
}

/**
 * Extracts and validates the canonical storage path (`<tenant_id>/<filename>`) from:
 * - A legacy signed URL from the authorized StayPilot origin: `https://lubkdxhqnnghnjhrebat.supabase.co/storage/v1/object/sign/guest_ids/<uuid>/<file>?token=...`
 * - A legacy public URL from the authorized StayPilot origin: `https://lubkdxhqnnghnjhrebat.supabase.co/storage/v1/object/public/guest_ids/<uuid>/<file>`
 * - An already-canonical storage path: `<uuid>/<filename>`
 * 
 * SECURITY RULES:
 * - Exact origin match required for URLs.
 * - Non-`guest_ids` buckets are REJECTED.
 * - Path traversal (`..`, `\`, `%2e%2e`, double-encoding) is REJECTED.
 * - Fragments and query parameters cannot modify the extracted path.
 * - Transient `blob:` and `data:` URLs return `''` so they are NEVER persisted to the database.
 * - Malformed inputs fail closed to `''`.
 * 
 * @param {string} urlOrPath
 * @param {string} [expectedTenantId] - Optional tenant ID to enforce tenant isolation
 * @returns {string} Canonical storage path (e.g. `<uuid>/<filename>`) or empty string on invalid/transient/malicious input.
 */
export function extractGuestIdPath(urlOrPath, expectedTenantId = null) {
  if (!urlOrPath || typeof urlOrPath !== 'string') return '';
  const trimmed = urlOrPath.trim();
  if (!trimmed) return '';

  // 1. Transient preview URLs (blob:, data:) must NEVER be returned as storage paths
  if (trimmed.startsWith('blob:') || trimmed.startsWith('data:')) {
    return '';
  }

  // 2. If it is already a canonical path, validate and return
  if (isCanonicalGuestIdPath(trimmed, expectedTenantId)) {
    return trimmed;
  }

  // 3. Reject any input containing obvious traversal or control characters
  if (trimmed.includes('..') || trimmed.includes('\\')) {
    return '';
  }

  // 4. Handle HTTP/HTTPS URLs with exact origin and bucket validation
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    try {
      const parsedUrl = new URL(trimmed);
      
      // Strict exact origin validation
      if (!isAllowedSupabaseOrigin(parsedUrl)) {
        return '';
      }

      // Pathname must specifically target the private 'guest_ids' bucket
      // Format: /storage/v1/object/(sign|public|authenticated)/guest_ids/<tenant_id>/<filename>
      const pathname = parsedUrl.pathname;
      const bucketMatch = pathname.match(/^\/storage\/v1\/object\/(?:sign|public|authenticated)\/guest_ids\/(.+)$/);
      if (!bucketMatch || !bucketMatch[1]) {
        return '';
      }

      let subpath = bucketMatch[1];

      // Detect and prevent double URL encoding (e.g., %252e)
      if (/%25/i.test(subpath)) {
        return '';
      }

      // Decode URI components safely
      try {
        subpath = decodeURIComponent(subpath);
      } catch (e) {
        return ''; // Malformed URI encoding fails closed
      }

      // Re-verify no traversal emerged after decoding
      if (subpath.includes('..') || subpath.includes('\\') || subpath.includes('//')) {
        return '';
      }

      // Must strictly conform to canonical tenant path
      if (isCanonicalGuestIdPath(subpath, expectedTenantId)) {
        return subpath;
      }

      return '';
    } catch (e) {
      // Malformed URL fails closed
      return '';
    }
  }

  // 5. If it's a relative path with leading slashes, strip and check
  const stripped = trimmed.replace(/^\/+/, '');
  if (isCanonicalGuestIdPath(stripped, expectedTenantId)) {
    return stripped;
  }

  return '';
}

/**
 * Normalizes guest ID document references before database persistence.
 * Prevents transient previews (blob:, data:) from being saved.
 * Prevents bearer tokens and full URLs from being saved.
 * Ensures non-destructive error handling: if parsing fails on an existing record,
 * preserves the original value and raises an informative error.
 * 
 * @param {object} params
 * @param {string} params.currentValue - Form field value to persist
 * @param {string} [params.initialValue] - Value currently in database (if editing)
 * @param {string} [params.tenantId] - Active tenant ID for ownership verification
 * @returns {{ valid: boolean, path: string, error?: string, wasPreserved?: boolean }}
 */
export function normalizeGuestIdForPersistence({ currentValue, initialValue = '', tenantId = null }) {
  const current = (currentValue || '').trim();
  const initial = (initialValue || '').trim();

  // Case 1: User explicitly has no document (or cleared it)
  if (!current) {
    return { valid: true, path: '' };
  }

  // Case 2: Transient preview (blob: or data:) attempted to be saved
  if (current.startsWith('blob:') || current.startsWith('data:')) {
    // If we have an existing database value, preserve it safely rather than clearing it
    if (initial) {
      return {
        valid: false,
        error: 'Upload in progress. Preserving existing document.',
        path: initial,
        wasPreserved: true
      };
    }
    return {
      valid: false,
      error: 'Document upload has not completed. Please wait for upload to finish.',
      path: ''
    };
  }

  // Case 3: Already canonical path
  if (isCanonicalGuestIdPath(current)) {
    if (tenantId && !isCanonicalGuestIdPath(current, tenantId)) {
      return {
        valid: false,
        error: 'Security violation: cross-tenant document reference rejected.',
        path: initial || '',
        wasPreserved: Boolean(initial)
      };
    }
    return { valid: true, path: current };
  }

  // Case 4: Legacy URL or formatted URL string
  const extracted = extractGuestIdPath(current, tenantId);
  if (extracted) {
    return { valid: true, path: extracted };
  }

  // Case 5: Parsing failed (malformed URL, external domain, path traversal)
  // Non-destructive safe fallback: Preserve existing initial value if present
  if (initial) {
    return {
      valid: false,
      error: 'Invalid document reference format. Preserving existing document to prevent data loss.',
      path: initial,
      wasPreserved: true
    };
  }

  return {
    valid: false,
    error: 'Invalid document storage path format.',
    path: ''
  };
}

/**
 * Generates an on-demand, short-lived signed URL (default 300 seconds / 5 minutes)
 * for secure preview or download of a guest identity document.
 * 
 * Evaluated in real-time by PostgreSQL RLS on `storage.objects`:
 * - Only the owning tenant team or Super Admin can generate signed URLs.
 * - Expired tenants cannot generate signed URLs.
 * - Cross-tenant signed URL generation attempts fail with 400/403.
 * - Transient local preview URLs (blob:, data:) are passed through directly for display.
 * 
 * @param {string} urlOrPath - Canonical storage path or legacy signed URL
 * @param {number} expiresIn - Expiration in seconds (default 300s = 5 minutes; max recommended 900s)
 * @param {object} [client] - Optional custom Supabase client
 * @param {string} [tenantId] - Optional expected tenant ID
 * @returns {Promise<string>} Ephemeral signed URL, or empty string on failure
 */
export async function getGuestIdSignedUrl(urlOrPath, expiresIn = 300, client = null, tenantId = null) {
  if (!urlOrPath) return '';
  const trimmed = urlOrPath.trim();
  if (!trimmed) return '';

  // Local transient preview URLs (e.g. freshly captured photo before save) display directly
  if (trimmed.startsWith('blob:') || trimmed.startsWith('data:')) {
    return trimmed;
  }

  const path = extractGuestIdPath(trimmed, tenantId);
  if (!path) {
    // If not a valid canonical path and not a valid legacy URL, fail closed
    return '';
  }

  try {
    const supabaseClient = client || await getSupabaseClient();
    if (!supabaseClient) {
      console.warn('getGuestIdSignedUrl: No Supabase client available');
      return '';
    }

    const { data, error } = await supabaseClient.storage
      .from('guest_ids')
      .createSignedUrl(path, expiresIn);

    if (error || !data?.signedUrl) {
      console.warn('Failed to generate short-lived signed URL for guest ID:', error?.message);
      return '';
    }

    return data.signedUrl;
  } catch (err) {
    console.error('Error generating guest ID signed URL:', err);
    return '';
  }
}
