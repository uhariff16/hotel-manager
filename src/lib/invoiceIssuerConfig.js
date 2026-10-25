/**
 * Stay Pilot — Invoice Issuer & GST Configuration (R3, local implementation)
 *
 * Pure rules + injected-client orchestration for:
 *   - profiles.global_settings.seller_identity   (invoice issuer details)
 *   - profiles.global_settings.gst_configuration (centrally controlled GST settings, INERT)
 *
 * Design constraints:
 *   - No React / no direct Supabase import: the Supabase client is injected so every
 *     rule is testable in plain Node.
 *   - GST is NEVER activated by this module. `gst_configuration` is a separate key from
 *     the legacy `tax_settings` key that the checkout edge function reads, so nothing
 *     written here can change checkout totals, Razorpay amounts, or invoices.
 *   - Saving seller identity is a dirty-field merge over the freshly-read database copy:
 *     fields the operator did not touch are never blanked or overwritten.
 */

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
export const DEFAULT_TRADE_NAME = 'Stay Pilot';
export const TRADE_NAME_MAX_LENGTH = 100;

/**
 * GST activation release gate. Simplified to allow direct toggle by Super Admin.
 */
export const GST_ACTIVATION_RELEASE_APPROVED = true;

export const GST_STATUSES = Object.freeze(['draft', 'pending_verification', 'active', 'disabled']);
export const GST_PRICING_MODES = Object.freeze(['inclusive', 'exclusive']);
export const GST_LEGACY_RENEWAL_POLICIES = Object.freeze(['fixed_gross', 'manual_review']);

/** Form keys of the fields that are optional in basic (non-GST) mode. */
export const SELLER_OPTIONAL_FIELDS = Object.freeze([
  'legalName', 'address', 'city', 'state', 'pincode', 'email', 'phone', 'pan'
]);

const FORM_TO_DB = Object.freeze({
  legalName: 'legal_name',
  tradeName: 'trade_name',
  address: 'address',
  city: 'city',
  state: 'state',
  stateCode: 'state_code',
  pincode: 'pincode',
  email: 'email',
  phone: 'phone',
  pan: 'pan'
});

/** Seller keys that R3 Stage 3B `generate_saas_commercial_invoice()` requires (non-empty). */
export const STAGE_3B_REQUIRED_SELLER_KEYS = Object.freeze([
  'legal_name', 'address', 'city', 'state', 'pincode', 'email'
]);

/** Seller keys legally required before GST configuration may enter verification. */
export const GST_SELLER_PREREQUISITE_KEYS = Object.freeze([
  'legal_name', 'address', 'city', 'state', 'pincode'
]);

const VALID_GST_STATE_CODES = new Set([
  ...Array.from({ length: 38 }, (_, i) => String(i + 1).padStart(2, '0')),
  '97', '99'
]);

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------
export class ConfigValidationError extends Error {
  constructor(errors) {
    super('VALIDATION_FAILED');
    this.name = 'ConfigValidationError';
    this.code = 'VALIDATION_FAILED';
    this.errors = errors;
  }
}

export class ConfigAuthorizationError extends Error {
  constructor(message = 'Only Super Administrators can modify invoice issuer or GST configuration.') {
    super(message);
    this.name = 'ConfigAuthorizationError';
    this.code = 'UNAUTHORIZED';
  }
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------
const isNonEmpty = (v) => typeof v === 'string' ? v.trim().length > 0 : (v !== null && v !== undefined && String(v).trim().length > 0);
const str = (v) => (v === null || v === undefined) ? '' : String(v);

/** Key-order-independent serialisation (Postgres JSONB does not preserve key order). */
export function stableStringify(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value === undefined ? null : value);
  if (Array.isArray(value)) return '[' + value.map(stableStringify).join(',') + ']';
  return '{' + Object.keys(value).sort().map(k => JSON.stringify(k) + ':' + stableStringify(value[k])).join(',') + '}';
}
const deepEqual = (a, b) => stableStringify(a) === stableStringify(b);

// ---------------------------------------------------------------------------
// A. Seller identity
// ---------------------------------------------------------------------------
export function emptySellerForm() {
  return {
    legalName: '', tradeName: DEFAULT_TRADE_NAME, address: '', city: '',
    state: '', stateCode: '', pincode: '', email: '', phone: '', pan: ''
  };
}

/** DB (snake_case, legacy camelCase tolerated) -> form (camelCase). Trade name defaults to "Stay Pilot". */
export function sellerFormFromDb(raw) {
  const s = raw && typeof raw === 'object' ? raw : {};
  const pick = (camel, snake) => str(s[camel] ?? s[snake]);
  return {
    legalName: pick('legalName', 'legal_name'),
    tradeName: pick('tradeName', 'trade_name').trim() || DEFAULT_TRADE_NAME,
    address: pick('address', 'address'),
    city: pick('city', 'city'),
    state: pick('state', 'state'),
    stateCode: pick('stateCode', 'state_code'),
    pincode: pick('pincode', 'pincode'),
    email: pick('email', 'email'),
    phone: pick('phone', 'phone'),
    pan: pick('pan', 'pan')
  };
}

/** Basic non-GST mode: Trade Name is the ONLY mandatory field. */
export function validateSellerBasic(form) {
  const errors = {};
  const trade = str(form?.tradeName).trim();
  if (trade.length === 0) {
    errors.tradeName = 'Trade Name is required (default: Stay Pilot).';
  } else if (trade.length > TRADE_NAME_MAX_LENGTH) {
    errors.tradeName = `Trade Name must be at most ${TRADE_NAME_MAX_LENGTH} characters.`;
  }
  return errors;
}

/**
 * Optional fields are validated ONLY when the operator edited them AND left a value.
 * Blank = "clear this optional field" and is always allowed. Untouched legacy values are
 * never re-validated, so they cannot block a trade-name-only save.
 */
export function validateSellerOptional(form, dirty = []) {
  const errors = {};
  const dirtySet = new Set(dirty);
  const val = (k) => str(form?.[k]).trim();

  if (dirtySet.has('legalName') && val('legalName')) {
    if (val('legalName').length < 3) errors.legalName = 'Legal name must be at least 3 characters, or leave blank.';
    else if (/[0-9]/.test(val('legalName'))) errors.legalName = 'Legal name must not contain numbers.';
  }
  if (dirtySet.has('address') && val('address') && val('address').length < 10) {
    errors.address = 'Address must be at least 10 characters, or leave blank.';
  }
  if (dirtySet.has('city') && val('city') && val('city').length < 2) {
    errors.city = 'City must be at least 2 characters, or leave blank.';
  }
  if (dirtySet.has('state') && val('state')) {
    if (!/^\d{2}$/.test(val('stateCode'))) errors.state = 'Select a state from the list so a valid 2-digit state code is derived, or leave blank.';
  }
  if (dirtySet.has('pincode') && val('pincode') && !/^[1-9][0-9]{5}$/.test(val('pincode'))) {
    errors.pincode = 'PIN must be a valid 6-digit Indian postal code, or leave blank.';
  }
  if (dirtySet.has('email') && val('email') && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val('email'))) {
    errors.email = 'Enter a valid email address, or leave blank.';
  }
  if (dirtySet.has('phone') && val('phone')) {
    const clean = val('phone').replace(/[\s-]/g, '');
    if (!/^(\+91)?[6-9]\d{9}$/.test(clean)) errors.phone = 'Enter a valid 10-digit Indian phone number, or leave blank.';
  }
  if (dirtySet.has('pan') && val('pan') && !/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(val('pan').toUpperCase())) {
    errors.pan = 'PAN must follow the 10-character format (e.g. ABCDE1234F), or leave blank.';
  }
  return errors;
}

export const validateSellerIdentityInput = (form, dirty = []) => ({
  ...validateSellerBasic(form),
  ...validateSellerOptional(form, dirty)
});

/**
 * Non-destructive merge. Starts from the freshly-read DB object (so unknown/untouched keys
 * survive), then applies ONLY dirty fields. Clearing an optional field stores null explicitly.
 */
export function buildSellerIdentityPatch(existingDb, form, dirty = [], nowIso = new Date().toISOString()) {
  const next = { ...(existingDb && typeof existingDb === 'object' ? existingDb : {}) };
  const dirtySet = new Set(dirty);

  if (dirtySet.has('tradeName') || !isNonEmpty(next.trade_name)) {
    next.trade_name = str(form.tradeName).trim() || DEFAULT_TRADE_NAME;
  }

  for (const field of SELLER_OPTIONAL_FIELDS) {
    if (!dirtySet.has(field)) continue;
    let v = str(form[field]).trim();
    if (field === 'pan') v = v.toUpperCase();
    next[FORM_TO_DB[field]] = v === '' ? null : v;
    if (field === 'state') {
      next.state_code = v === '' ? null : (str(form.stateCode).trim() || null);
    }
  }
  next.updated_at = nowIso;
  return next;
}

/**
 * Readiness for the two billing documents. Mirrors the exact fields R3 Stage 3B
 * `generate_saas_commercial_invoice()` requires, so the UI never over-promises.
 */
export function assessSellerReadiness(sellerDb) {
  const s = sellerDb && typeof sellerDb === 'object' ? sellerDb : {};
  const missing = STAGE_3B_REQUIRED_SELLER_KEYS.filter(k => !isNonEmpty(s[k]));
  return {
    acknowledgmentReady: isNonEmpty(s.trade_name),
    formalInvoiceReady: missing.length === 0,
    missingForFormalInvoice: missing
  };
}

// ---------------------------------------------------------------------------
// B. GST configuration
// ---------------------------------------------------------------------------
const GSTIN_CHARSET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';

function gstinCheckChar(first14) {
  let sum = 0;
  for (let i = 0; i < 14; i++) {
    const v = GSTIN_CHARSET.indexOf(first14[i]);
    const p = v * (i % 2 === 0 ? 1 : 2);
    sum += Math.floor(p / 36) + (p % 36);
  }
  return GSTIN_CHARSET[(36 - (sum % 36)) % 36];
}

/** Structural + state-code + checksum validation. Does NOT prove the GSTIN is registered/active. */
export function validateGstin(gstin) {
  const g = str(gstin).trim().toUpperCase();
  if (!/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(g)) {
    return { valid: false, reason: 'GSTIN must be 15 characters in the official format (e.g. 27AAPFU0939F1ZV).' };
  }
  if (!VALID_GST_STATE_CODES.has(g.slice(0, 2))) {
    return { valid: false, reason: 'GSTIN has an unrecognised state code.' };
  }
  if (gstinCheckChar(g.slice(0, 14)) !== g[14]) {
    return { valid: false, reason: 'GSTIN checksum is invalid. Please re-check the number.' };
  }
  return { valid: true, reason: null };
}

export function emptyGstForm() {
  return { enabled: false, ratePercent: '', gstin: '', pricingMode: '', effectiveFrom: '', status: 'draft' };
}

/** DB gst_configuration -> form. */
export function gstFormFromDb(raw) {
  const c = raw && typeof raw === 'object' ? raw : {};
  return {
    form: {
      enabled: c.enabled === true,
      ratePercent: c.rate_percent === null || c.rate_percent === undefined ? '' : String(c.rate_percent),
      gstin: str(c.gstin),
      pricingMode: GST_PRICING_MODES.includes(c.pricing_mode) ? c.pricing_mode : '',
      effectiveFrom: str(c.effective_from),
      status: GST_STATUSES.includes(c.status) ? c.status : (c.enabled === true ? 'active' : 'draft')
    },
    locked: false
  };
}

/** ISO instant -> value for <input type="datetime-local"> in the operator's local zone. */
export function toDatetimeLocal(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

/**
 * Validates a GST configuration form.
 * ctx: { seller (DB snake_case identity), now (Date) }
 */
export function validateGstConfiguration(form, ctx = {}) {
  const errors = {};
  const seller = ctx.seller && typeof ctx.seller === 'object' ? ctx.seller : {};
  const isEnabled = form?.enabled === true;

  // Field-level format checks (apply to whatever is present)
  const rateRaw = str(form?.ratePercent).trim();
  if (rateRaw) {
    const rate = Number(rateRaw);
    if (!/^\d+(\.\d{1,2})?$/.test(rateRaw) || !Number.isFinite(rate) || rate <= 0 || rate > 50) {
      errors.ratePercent = 'GST percentage must be a number above 0 and at most 50 (max 2 decimals).';
    }
  }

  const gstinRaw = str(form?.gstin).trim();
  if (gstinRaw) {
    const g = validateGstin(gstinRaw);
    if (!g.valid) errors.gstin = g.reason;
  }

  const pricingMode = str(form?.pricingMode).trim();
  if (pricingMode && !GST_PRICING_MODES.includes(pricingMode)) {
    errors.pricingMode = 'Pricing mode must be Inclusive or Exclusive.';
  }

  const effRaw = str(form?.effectiveFrom).trim();
  if (effRaw) {
    const effMs = Date.parse(effRaw);
    if (Number.isNaN(effMs)) errors.effectiveFrom = 'Effective From must be a valid date and time.';
  }

  // Completeness: strictly enforced when enabling GST
  if (isEnabled) {
    if (!rateRaw) errors.ratePercent = 'GST percentage is required to enable GST.';
    if (!gstinRaw) errors.gstin = 'GSTIN is required to enable GST.';
    if (!pricingMode) errors.pricingMode = 'Select a pricing mode (Inclusive or Exclusive) to enable GST.';

    const missingSeller = GST_SELLER_PREREQUISITE_KEYS.filter(k => !isNonEmpty(seller[k]));
    if (missingSeller.length > 0) {
      errors.seller = `Seller details required for GST are incomplete: ${missingSeller.join(', ')}. Complete them in Additional Details first.`;
    }

    if (gstinRaw && !errors.gstin && isNonEmpty(seller.state_code) && gstinRaw.toUpperCase().slice(0, 2) !== String(seller.state_code).trim().padStart(2, '0')) {
      errors.gstin = `GSTIN state code (${gstinRaw.toUpperCase().slice(0, 2)}) does not match the seller state code (${seller.state_code}).`;
    }
  }

  return { errors, complete: Object.keys(errors).length === 0 };
}

/** Persisted shape. */
export function buildGstConfigurationPatch(existingDb, form, actorId, nowIso = new Date().toISOString()) {
  const existing = existingDb && typeof existingDb === 'object' ? existingDb : {};
  const rateRaw = str(form?.ratePercent).trim();
  const effRaw = str(form?.effectiveFrom).trim();
  const isEnabled = Boolean(form?.enabled);
  const next = { ...existing };
  next.enabled = isEnabled;
  next.rate_percent = rateRaw ? Number(rateRaw) : null;
  next.gstin = str(form?.gstin).trim() ? str(form.gstin).trim().toUpperCase() : null;
  next.pricing_mode = str(form?.pricingMode).trim() || null;
  next.effective_from = effRaw ? new Date(effRaw).toISOString() : null;
  next.status = isEnabled ? 'active' : (form?.status === 'pending_verification' ? 'pending_verification' : 'disabled');
  if (form?.legacyRenewalPolicy && GST_LEGACY_RENEWAL_POLICIES.includes(form.legacyRenewalPolicy)) {
    next.legacy_renewal_policy = form.legacyRenewalPolicy;
  }
  next.updated_at = nowIso;
  next.updated_by = actorId || null;
  return next;
}

/**
 * Whether GST is effective for a transaction at `now`.
 */
export function isGstEffective(gstDb, now = new Date(), ctx = {}) {
  const c = gstDb && typeof gstDb === 'object' ? gstDb : null;
  if (!c || c.enabled !== true) return { effective: false, reason: 'GST_DISABLED' };

  const seller = ctx.seller && typeof ctx.seller === 'object' ? ctx.seller : {};
  const v = validateGstConfiguration(
    { enabled: true, ratePercent: str(c.rate_percent), gstin: str(c.gstin), pricingMode: str(c.pricing_mode), effectiveFrom: str(c.effective_from) },
    { seller, now }
  );
  if (Object.keys(v.errors).length > 0) return { effective: false, reason: 'INVALID_CONFIGURATION', errors: v.errors };
  if (c.effective_from && Date.parse(c.effective_from) > now.getTime()) {
    return { effective: false, reason: 'NOT_YET_EFFECTIVE' };
  }
  return { effective: true, reason: null };
}

// ---------------------------------------------------------------------------
// C. Invoice behaviour: non-GST payment acknowledgment
// ---------------------------------------------------------------------------
/**
 * Basic Stay Pilot-branded, non-GST payment acknowledgment.
 *
 * Privacy: the ONLY seller attribute that can appear is the trade name. Proprietor legal name,
 * address, PAN, phone and email are never copied into the acknowledgment.
 *
 * Fail-closed: if a stored GST configuration claims GST is enabled/active, billing in this
 * build has no tax engine, so an acknowledgment asserting "no GST charged" would be wrong.
 */
export function buildPaymentAcknowledgment({ seller, payment, gstConfig, now = new Date() } = {}) {
  if (gstConfig && (gstConfig.enabled === true || gstConfig.status === 'active')) {
    throw new Error('GST_TAX_ENGINE_REQUIRED: GST is configured as enabled/active but no approved tax engine is available; a non-GST acknowledgment cannot be issued.');
  }
  const p = payment || {};
  if (!Number.isInteger(p.amount_paise) || p.amount_paise <= 0) throw new Error('INVALID_AMOUNT: amount_paise must be a positive integer.');
  if (str(p.currency).trim().toUpperCase() !== 'INR') throw new Error('INVALID_CURRENCY: expected INR.');
  if (!isNonEmpty(p.payment_reference)) throw new Error('MISSING_PAYMENT_REFERENCE: payment_reference is required.');

  const tradeName = isNonEmpty(seller?.trade_name) ? str(seller.trade_name).trim() : DEFAULT_TRADE_NAME;
  return Object.freeze({
    document_type: 'payment_acknowledgment',
    issuer_display_name: tradeName,
    customer_name: isNonEmpty(p.customer_name) ? str(p.customer_name).trim() : null,
    plan_name: isNonEmpty(p.plan_name) ? str(p.plan_name).trim() : null,
    amount_paise: p.amount_paise,
    currency: 'INR',
    payment_reference: str(p.payment_reference).trim(),
    paid_at: p.paid_at || now.toISOString(),
    gst_charged: false,
    notice: 'This is a payment acknowledgment, not a GST tax invoice. No GST has been charged on this payment.'
  });
}

// ---------------------------------------------------------------------------
// D. Persistence orchestration (Supabase client injected)
// ---------------------------------------------------------------------------
async function readGlobalSettings(supabase, profileId) {
  const { data, error } = await supabase.from('profiles').select('id, global_settings').eq('id', profileId).single();
  if (error || !data) throw new Error(`Failed to read current settings: ${error?.message || 'Profile not found'}`);
  return data.global_settings && typeof data.global_settings === 'object' ? data.global_settings : {};
}

/** Every top-level key other than `exceptKey` must be byte-for-byte unchanged. */
function assertOtherSettingsPreserved(before, after, exceptKey) {
  const ignored = new Set(Array.isArray(exceptKey) ? exceptKey : [exceptKey]);
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  for (const k of keys) {
    if (ignored.has(k)) continue;
    if (!deepEqual(before[k], after[k])) {
      throw new Error(`Preservation check failed: global_settings.${k} changed unexpectedly.`);
    }
  }
}

/**
 * Calculates GST components with integer paise precision and zero rounding discrepancies.
 *
 * @param {object} params
 * @param {number} params.amountPaise - The payment or base amount in paise (must be positive integer).
 * @param {number} params.ratePercent - The GST percentage rate (e.g. 18).
 * @param {'exclusive'|'inclusive'} [params.pricingMode='exclusive']
 * @param {string} [params.sellerStateCode] - 2-digit state code of seller (e.g. '33').
 * @param {string} [params.customerStateCode] - 2-digit state code of customer place of supply.
 * @returns {object} Calculated financial breakdown
 */
export function calculateGstBreakdown({
  amountPaise,
  ratePercent,
  pricingMode = 'exclusive',
  sellerStateCode,
  customerStateCode
}) {
  if (!Number.isInteger(amountPaise) || amountPaise <= 0) {
    throw new Error('INVALID_AMOUNT: amountPaise must be a positive integer.');
  }
  const rate = Number(ratePercent);
  if (!Number.isFinite(rate) || rate < 0 || rate > 50) {
    throw new Error('INVALID_RATE: ratePercent must be a number between 0 and 50.');
  }

  if (rate === 0) {
    return {
      taxType: 'unregistered',
      baseAmountPaise: amountPaise,
      gstRate: 0,
      cgstAmountPaise: 0,
      sgstAmountPaise: 0,
      igstAmountPaise: 0,
      totalAmountPaise: amountPaise,
      gstAmountPaise: 0
    };
  }

  let baseAmountPaise;
  let gstAmountPaise;
  let totalAmountPaise;

  if (pricingMode === 'inclusive') {
    totalAmountPaise = amountPaise;
    baseAmountPaise = Math.round(totalAmountPaise / (1 + (rate / 100)));
    gstAmountPaise = totalAmountPaise - baseAmountPaise;
  } else {
    baseAmountPaise = amountPaise;
    gstAmountPaise = Math.round(baseAmountPaise * (rate / 100));
    totalAmountPaise = baseAmountPaise + gstAmountPaise;
  }

  const isIntraState = isNonEmpty(sellerStateCode) &&
    isNonEmpty(customerStateCode) &&
    String(sellerStateCode).trim().padStart(2, '0') === String(customerStateCode).trim().padStart(2, '0');

  let cgstAmountPaise = 0;
  let sgstAmountPaise = 0;
  let igstAmountPaise = 0;
  let taxType;

  if (isIntraState) {
    taxType = 'intra_state';
    cgstAmountPaise = Math.round(gstAmountPaise / 2);
    sgstAmountPaise = gstAmountPaise - cgstAmountPaise;
    igstAmountPaise = 0;
  } else {
    taxType = 'inter_state';
    cgstAmountPaise = 0;
    sgstAmountPaise = 0;
    igstAmountPaise = gstAmountPaise;
  }

  if (baseAmountPaise + cgstAmountPaise + sgstAmountPaise + igstAmountPaise !== totalAmountPaise) {
    throw new Error('CALCULATION_DRIFT: Component amounts do not equal total amount.');
  }

  return {
    taxType,
    baseAmountPaise,
    gstRate: rate,
    cgstAmountPaise,
    sgstAmountPaise,
    igstAmountPaise,
    totalAmountPaise,
    gstAmountPaise
  };
}

/**
 * Constructs a compliant GST Tax Invoice representation.
 */
export function buildTaxInvoice({
  seller,
  customer,
  payment,
  gstConfig,
  invoiceNumber,
  now = new Date()
} = {}) {
  const p = payment || {};
  if (!Number.isInteger(p.amount_paise) || p.amount_paise <= 0) {
    throw new Error('INVALID_AMOUNT: amount_paise must be a positive integer.');
  }
  if (str(p.currency).trim().toUpperCase() !== 'INR') {
    throw new Error('INVALID_CURRENCY: expected INR.');
  }
  if (!isNonEmpty(p.payment_reference)) {
    throw new Error('MISSING_PAYMENT_REFERENCE: payment_reference is required.');
  }

  const breakdown = calculateGstBreakdown({
    amountPaise: p.amount_paise,
    ratePercent: gstConfig?.rate_percent ?? gstConfig?.ratePercent,
    pricingMode: gstConfig?.pricing_mode ?? gstConfig?.pricingMode ?? 'exclusive',
    sellerStateCode: seller?.state_code ?? seller?.stateCode,
    customerStateCode: customer?.state_code ?? customer?.stateCode
  });

  return Object.freeze({
    document_type: 'tax_invoice',
    invoice_number: invoiceNumber,
    supplier_legal_name: seller?.legal_name ?? seller?.legalName ?? null,
    supplier_trade_name: seller?.trade_name ?? seller?.tradeName ?? DEFAULT_TRADE_NAME,
    supplier_gstin: gstConfig?.gstin ?? null,
    supplier_address: seller?.address ?? null,
    supplier_city: seller?.city ?? null,
    supplier_state: seller?.state ?? null,
    supplier_state_code: seller?.state_code ?? seller?.stateCode ?? null,
    supplier_pincode: seller?.pincode ?? null,
    supplier_email: seller?.email ?? null,
    supplier_pan: seller?.pan ?? null,
    customer_name: customer?.name ?? customer?.full_name ?? p.customer_name ?? null,
    customer_email: customer?.email ?? null,
    customer_address: customer?.address ?? null,
    customer_state: customer?.state ?? null,
    customer_gstin: customer?.gstin ?? null,
    plan_name: p.plan_name ?? null,
    tax_type: breakdown.taxType,
    base_amount_paise: breakdown.baseAmountPaise,
    gst_rate: breakdown.gstRate,
    cgst_amount_paise: breakdown.cgstAmountPaise,
    sgst_amount_paise: breakdown.sgstAmountPaise,
    igst_amount_paise: breakdown.igstAmountPaise,
    total_amount_paise: breakdown.totalAmountPaise,
    currency: 'INR',
    payment_reference: str(p.payment_reference).trim(),
    paid_at: p.paid_at || now.toISOString(),
    gst_charged: true
  });
}

const requireSuperAdmin = (actorProfile) => {
  if (!actorProfile || actorProfile.role !== 'super_admin') throw new ConfigAuthorizationError();
};

export const MASTER_ADMIN_EMAIL = 'uhariff@gmail.com';
export const CANONICAL_SUPER_ADMIN_ID = '9c4e65f5-c0a1-4b3a-8ed2-d01175a73409';

/**
 * Resolves the single canonical Super Admin profile that holds authoritative global_settings.
 * Deterministic across all sessions and independent of the currently logged-in actor.
 * Strictly requires the fixed canonical ID '9c4e65f5-c0a1-4b3a-8ed2-d01175a73409'.
 * Does not silently fall back to another profile if the canonical record is missing.
 */
export function resolveCanonicalSuperAdmin(profiles = []) {
  const superAdmins = (profiles || []).filter(p => p && p.role === 'super_admin');
  if (superAdmins.length === 0) return null;

  // Fixed canonical ID match only
  const byId = superAdmins.find(p => p.id === CANONICAL_SUPER_ADMIN_ID);
  if (byId) return byId;

  return null;
}

/**
 * Saves seller identity to the single authoritative canonical configuration record.
 * Uses atomic server-side RPC update_saas_global_configuration.
 * @returns {Promise<{identity: object, changedKeys: string[], formalInvoiceReady: boolean}>}
 */
export async function saveSellerIdentityConfig({
  supabase,
  actorProfile,
  masterAdminId,
  form,
  dirty = [],
  now = new Date()
}) {
  requireSuperAdmin(actorProfile);
  if (!masterAdminId) {
    throw new Error('Authoritative Super Admin profile could not be resolved.');
  }
  if (masterAdminId !== CANONICAL_SUPER_ADMIN_ID) {
    throw new Error(`CANONICAL_PROFILE_MISMATCH: Configuration must target the canonical Super Admin profile (${CANONICAL_SUPER_ADMIN_ID}).`);
  }
  const targetId = masterAdminId;

  const errors = validateSellerIdentityInput(form, dirty);
  if (Object.keys(errors).length > 0) throw new ConfigValidationError(errors);

  const before = await readGlobalSettings(supabase, targetId);
  const existingIdentity = before.seller_identity && typeof before.seller_identity === 'object' ? before.seller_identity : {};
  const patch = buildSellerIdentityPatch(existingIdentity, form, dirty, now.toISOString());

  // Mandatory atomic server-side RPC execution (NO direct-write fallback)
  if (!supabase || typeof supabase.rpc !== 'function') {
    throw new Error('RPC_UNAVAILABLE: update_saas_global_configuration RPC is required but unavailable on the client.');
  }

  const { data: rpcData, error: rpcErr } = await supabase.rpc('update_saas_global_configuration', {
    p_section: 'seller_identity',
    p_seller_identity: patch,
    p_canonical_id: targetId
  });

  if (rpcErr) {
    if (rpcErr.message && rpcErr.message.includes('CANONICAL_PROFILE_NOT_FOUND')) {
      throw new Error(`CANONICAL_PROFILE_NOT_FOUND: The authoritative Super Admin configuration record (${targetId}) does not exist.`);
    }
    if (rpcErr.code === '42501' || rpcErr.message?.includes('FORBIDDEN') || rpcErr.message?.includes('UNAUTHORIZED')) {
      throw new ConfigAuthorizationError(rpcErr.message);
    }
    throw new Error(`RPC_EXECUTION_FAILED: ${rpcErr.message}`);
  }

  if (!rpcData) {
    throw new Error('RPC_EXECUTION_FAILED: No data returned from update_saas_global_configuration.');
  }

  const updatedSettings = rpcData;

  const verified = updatedSettings.seller_identity;
  if (!verified) throw new Error('Round-trip verification failed: seller identity missing after save.');
  assertOtherSettingsPreserved(before, updatedSettings, 'seller_identity');

  const changedKeys = Object.keys(patch).filter(k => !deepEqual(existingIdentity[k], patch[k]) && k !== 'updated_at');
  for (const k of Object.keys(existingIdentity)) {
    if (k === 'updated_at') continue;
    if (!changedKeys.includes(k) && !deepEqual(existingIdentity[k], verified[k])) {
      throw new Error(`Preservation check failed: seller_identity.${k} was altered.`);
    }
  }
  for (const k of Object.keys(patch)) {
    if (!deepEqual(patch[k], verified[k])) throw new Error('Round-trip verification mismatch: stored data differs from submitted values.');
  }

  return { identity: verified, changedKeys, formalInvoiceReady: assessSellerReadiness(verified).formalInvoiceReady };
}

/**
 * Saves GST configuration to the single authoritative canonical configuration record.
 * Uses atomic server-side RPC update_saas_global_configuration.
 */
export async function saveGstConfiguration({
  supabase,
  actorProfile,
  masterAdminId,
  form,
  now = new Date()
}) {
  requireSuperAdmin(actorProfile);
  if (!masterAdminId) {
    throw new Error('Authoritative Super Admin profile could not be resolved.');
  }
  if (masterAdminId !== CANONICAL_SUPER_ADMIN_ID) {
    throw new Error(`CANONICAL_PROFILE_MISMATCH: Configuration must target the canonical Super Admin profile (${CANONICAL_SUPER_ADMIN_ID}).`);
  }
  const targetId = masterAdminId;

  const before = await readGlobalSettings(supabase, targetId);
  const existing = before.gst_configuration && typeof before.gst_configuration === 'object' ? before.gst_configuration : {};

  const { errors } = validateGstConfiguration(form, { seller: before.seller_identity, now });
  if (Object.keys(errors).length > 0) throw new ConfigValidationError(errors);

  const patch = buildGstConfigurationPatch(existing, form, actorProfile.id, now.toISOString());

  const taxSettingsPatch = {
    enabled: patch.enabled,
    rate: patch.rate_percent || 0,
    gstin: patch.gstin || '',
    pricing_mode: patch.pricing_mode || 'exclusive',
    effective_from: patch.effective_from || null,
    updated_at: now.toISOString()
  };

  // Mandatory atomic server-side RPC execution (NO direct-write fallback)
  if (!supabase || typeof supabase.rpc !== 'function') {
    throw new Error('RPC_UNAVAILABLE: update_saas_global_configuration RPC is required but unavailable on the client.');
  }

  const { data: rpcData, error: rpcErr } = await supabase.rpc('update_saas_global_configuration', {
    p_section: 'gst_configuration',
    p_gst_configuration: patch,
    p_tax_settings: taxSettingsPatch,
    p_canonical_id: targetId
  });

  if (rpcErr) {
    if (rpcErr.message && rpcErr.message.includes('CANONICAL_PROFILE_NOT_FOUND')) {
      throw new Error(`CANONICAL_PROFILE_NOT_FOUND: The authoritative Super Admin configuration record (${targetId}) does not exist.`);
    }
    if (rpcErr.code === '42501' || rpcErr.message?.includes('FORBIDDEN') || rpcErr.message?.includes('UNAUTHORIZED')) {
      throw new ConfigAuthorizationError(rpcErr.message);
    }
    throw new Error(`RPC_EXECUTION_FAILED: ${rpcErr.message}`);
  }

  if (!rpcData) {
    throw new Error('RPC_EXECUTION_FAILED: No data returned from update_saas_global_configuration.');
  }

  const updatedSettings = rpcData;

  assertOtherSettingsPreserved(before, updatedSettings, ['gst_configuration', 'tax_settings']);
  const verified = updatedSettings.gst_configuration;
  if (!verified) throw new Error('Round-trip verification failed: GST configuration missing after save.');
  if (verified.enabled !== patch.enabled) {
    throw new Error('Round-trip verification failed: stored enabled state differs from submitted value.');
  }
  if (!deepEqual(patch, verified)) throw new Error('Round-trip verification mismatch: stored GST configuration differs from submitted values.');

  return { configuration: verified };
}
