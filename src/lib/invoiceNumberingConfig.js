/**
 * Stay Pilot — Super Admin Controlled Invoice & Acknowledgment Numbering Configuration
 *
 * Rules:
 *   1. Canonical Super Admin is the only authority permitted to modify numbering configuration.
 *   2. TEST and LIVE configurations and counters remain completely independent.
 *   3. Starting numbers must be configurable before a series is first used.
 *   4. Existing active series must not be reset or rewound.
 *   5. Prefix collisions between TEST and LIVE are rejected.
 */

export const DEFAULT_INVOICE_NUMBERING = Object.freeze({
  test: Object.freeze({
    prefix: 'SP-TEST-INV-',
    year_format: 'YYYY',
    padding: 5,
    starting_number: 1001
  }),
  live: Object.freeze({
    prefix: 'SP-INV-',
    year_format: 'YYYY',
    padding: 5,
    starting_number: 1
  })
});

export const VALID_YEAR_FORMATS = Object.freeze(['YYYY', 'YY', 'none']);
export const CANONICAL_SUPER_ADMIN_ID = '9c4e65f5-c0a1-4b3a-8ed2-d01175a73409';

/**
 * Validates numbering settings for a single environment.
 */
export function validateNumberingSettings(settings, env = 'general') {
  const errors = {};
  if (!settings || typeof settings !== 'object') {
    errors[env] = 'Configuration must be an object.';
    return errors;
  }

  const prefix = String(settings.prefix || '').trim();
  if (!prefix) {
    errors.prefix = 'Invoice prefix is required.';
  } else if (prefix.length > 25) {
    errors.prefix = 'Invoice prefix must be 25 characters or fewer.';
  } else if (!/^[A-Za-z0-9\-_]+$/.test(prefix)) {
    errors.prefix = 'Prefix may only contain letters, numbers, hyphens, and underscores.';
  }

  const yearFormat = String(settings.year_format || settings.yearFormat || 'YYYY').trim();
  if (!VALID_YEAR_FORMATS.includes(yearFormat)) {
    errors.year_format = 'Year format must be YYYY, YY, or none.';
  }

  const padding = Number(settings.padding);
  if (!Number.isInteger(padding) || padding < 3 || padding > 10) {
    errors.padding = 'Padding length must be an integer between 3 and 10.';
  }

  const startingNumber = Number(settings.starting_number ?? settings.startingNumber);
  if (!Number.isInteger(startingNumber) || startingNumber < 1) {
    errors.starting_number = 'Starting number must be a positive integer (>= 1).';
  }

  return errors;
}

/**
 * Validates the full dual-environment configuration object.
 */
export function validateDualNumberingConfig(config) {
  const testErrors = validateNumberingSettings(config?.test, 'test');
  const liveErrors = validateNumberingSettings(config?.live, 'live');
  const errors = {};

  if (Object.keys(testErrors).length > 0) errors.test = testErrors;
  if (Object.keys(liveErrors).length > 0) errors.live = liveErrors;

  // Collision guard: test prefix and live prefix must not match
  const testPrefix = String(config?.test?.prefix || '').trim().toUpperCase();
  const livePrefix = String(config?.live?.prefix || '').trim().toUpperCase();
  if (testPrefix && livePrefix && testPrefix === livePrefix) {
    errors.conflict = 'TEST and LIVE invoice prefixes must be distinct to prevent overlapping invoice numbers.';
  }

  return { errors, isValid: Object.keys(errors).length === 0 };
}

/**
 * Pure preview calculation matching server-side rendering logic.
 */
export function computeInvoiceNumberPreview(settings, seqNumber = 1, now = new Date()) {
  const prefix = String(settings?.prefix || (settings?.environment === 'live' ? 'SP-INV-' : 'SP-TEST-INV-')).trim();
  const yearFormat = String(settings?.year_format || settings?.yearFormat || 'YYYY').trim();
  const padding = Number(settings?.padding) || 5;

  let yearPart = '';
  if (yearFormat === 'YYYY') {
    yearPart = `${now.getFullYear()}-`;
  } else if (yearFormat === 'YY') {
    yearPart = `${String(now.getFullYear()).slice(-2)}-`;
  }

  const numPart = String(seqNumber).padStart(padding, '0');
  return `${prefix}${yearPart}${numPart}`;
}

/**
 * Persist invoice numbering configuration via atomic Super Admin RPC.
 */
export async function saveInvoiceNumberingConfig({
  supabase,
  actorProfile,
  masterAdminId,
  config
}) {
  if (!actorProfile || actorProfile.role !== 'super_admin') {
    throw new Error('Only Super Administrators can modify invoice numbering configuration.');
  }

  const targetId = masterAdminId || CANONICAL_SUPER_ADMIN_ID;
  if (targetId !== CANONICAL_SUPER_ADMIN_ID) {
    throw new Error(`CANONICAL_PROFILE_MISMATCH: Configuration must target canonical Super Admin (${CANONICAL_SUPER_ADMIN_ID}).`);
  }

  const { errors, isValid } = validateDualNumberingConfig(config);
  if (!isValid) {
    const err = new Error('VALIDATION_FAILED');
    err.errors = errors;
    throw err;
  }

  const patch = {
    test: {
      prefix: String(config.test.prefix).trim(),
      year_format: String(config.test.year_format || config.test.yearFormat).trim(),
      padding: Number(config.test.padding),
      starting_number: Number(config.test.starting_number ?? config.test.startingNumber),
      updated_at: new Date().toISOString()
    },
    live: {
      prefix: String(config.live.prefix).trim(),
      year_format: String(config.live.year_format || config.live.yearFormat).trim(),
      padding: Number(config.live.padding),
      starting_number: Number(config.live.starting_number ?? config.live.startingNumber),
      updated_at: new Date().toISOString()
    }
  };

  const { data, error } = await supabase.rpc('update_saas_global_configuration', {
    p_section: 'invoice_numbering',
    p_invoice_numbering: patch,
    p_canonical_id: targetId
  });

  if (error) {
    throw new Error(error.message);
  }

  return data?.invoice_numbering || patch;
}
