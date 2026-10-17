import { getStateCodeByName } from './indianStates.js';

/**
 * Validate customer subscription billing profile against authoritative invoice requirements
 * @param {Object} billing 
 * @returns {{ isValid: boolean, missingFields: string[], errors: Record<string, string> }}
 */
export function validateTenantBilling(billing) {
  const errors = {};
  const missingFields = [];

  const name = billing?.name ? String(billing.name).trim() : '';
  const email = billing?.email ? String(billing.email).trim() : '';
  const addressLine1 = billing?.address_line1 || billing?.address ? String(billing.address_line1 || billing.address).trim() : '';
  const city = billing?.city ? String(billing.city).trim() : '';
  const state = billing?.state ? String(billing.state).trim() : '';
  const pincode = billing?.pincode ? String(billing.pincode).trim() : '';
  const country = billing?.country ? String(billing.country).trim() : 'India';
  const gstin = billing?.gstin ? String(billing.gstin).trim().toUpperCase() : '';

  if (!name || name.length < 2) {
    errors.name = 'Billing or business name is required (at least 2 characters).';
    missingFields.push('name');
  }

  const emailRegex = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;
  if (!email || !emailRegex.test(email)) {
    errors.email = 'A valid billing email is required.';
    missingFields.push('email');
  }

  if (!addressLine1 || addressLine1.length < 3) {
    errors.address_line1 = 'Address line 1 is required (at least 3 characters).';
    missingFields.push('address');
  }

  if (!city || city.length < 2) {
    errors.city = 'City is required.';
    missingFields.push('city');
  }

  if (!state || state.length < 2) {
    errors.state = 'State is required.';
    missingFields.push('state');
  }

  if (!pincode || !/^[0-9]{6}$/.test(pincode)) {
    errors.pincode = 'A valid 6-digit PIN code is required.';
    missingFields.push('pincode');
  }

  if (!country) {
    errors.country = 'Country is required.';
    missingFields.push('country');
  }

  if (gstin) {
    const gstinRegex = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
    if (!gstinRegex.test(gstin)) {
      errors.gstin = 'Invalid GSTIN format (e.g. 29AAAAA0000A1Z5).';
      missingFields.push('gstin');
    }
  }

  return {
    isValid: missingFields.length === 0,
    missingFields,
    errors
  };
}

/**
 * Format full single-line address string from components
 */
export function formatFullAddress(billing) {
  if (!billing) return '';
  const parts = [];
  if (billing.address_line1) parts.push(billing.address_line1.trim());
  else if (billing.address) parts.push(billing.address.trim());

  if (billing.address_line2 && billing.address_line2.trim()) parts.push(billing.address_line2.trim());
  if (billing.city && billing.city.trim()) parts.push(billing.city.trim());
  if (billing.state && billing.state.trim()) {
    const stateStr = billing.state.trim() + (billing.pincode ? ` ${billing.pincode.trim()}` : '');
    parts.push(stateStr);
  }
  return parts.join(', ');
}

/**
 * Load and normalize billing profile from user profile
 */
export function loadTenantBillingProfile(profile) {
  const billing = profile?.global_settings?.billing || {};
  const tenantBilling = profile?.global_settings?.tenant_billing || {};

  const name = billing.name || tenantBilling.companyName || tenantBilling.name || profile?.full_name || '';
  const email = billing.email || profile?.email || '';
  const addressLine1 = billing.address_line1 || billing.address || tenantBilling.address || '';
  const addressLine2 = billing.address_line2 || '';
  const city = billing.city || '';
  const state = billing.state || '';
  const stateCode = billing.state_code || getStateCodeByName(state) || '';
  const pincode = billing.pincode || '';
  const country = billing.country || 'India';
  const gstin = billing.gstin || tenantBilling.gstin || '';

  return {
    name,
    email,
    address_line1: addressLine1,
    address_line2: addressLine2,
    address: billing.address || formatFullAddress({ address_line1: addressLine1, address_line2: addressLine2, city, state, pincode }),
    city,
    state,
    state_code: stateCode,
    pincode,
    country,
    gstin
  };
}

/**
 * Save tenant billing profile securely via RPC
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase 
 * @param {Object} billingData 
 */
export async function saveTenantBillingProfile(supabase, billingData) {
  const validation = validateTenantBilling(billingData);
  if (!validation.isValid) {
    const firstError = Object.values(validation.errors)[0] || 'Please complete all required billing fields.';
    throw new Error(firstError);
  }

  const stateCode = billingData.state_code || getStateCodeByName(billingData.state) || '';
  const fullAddress = formatFullAddress({
    address_line1: billingData.address_line1,
    address_line2: billingData.address_line2,
    city: billingData.city,
    state: billingData.state,
    pincode: billingData.pincode
  });

  const payload = {
    name: billingData.name.trim(),
    email: billingData.email.trim().toLowerCase(),
    address: fullAddress,
    address_line1: billingData.address_line1.trim(),
    address_line2: billingData.address_line2 ? billingData.address_line2.trim() : '',
    city: billingData.city.trim(),
    state: billingData.state.trim(),
    state_code: stateCode,
    pincode: billingData.pincode.trim(),
    country: (billingData.country || 'India').trim(),
    gstin: billingData.gstin ? billingData.gstin.trim().toUpperCase() : null
  };

  // Try calling the dedicated RPC
  const { data, error } = await supabase.rpc('save_tenant_billing_profile', {
    p_billing: payload
  });

  if (error) {
    // If function does not exist (not yet migrated to this environment), provide actionable error
    if (error.code === 'PGRST202' || error.message?.includes('function') && error.message?.includes('does not exist')) {
      throw new Error("Billing update RPC is pending database migration. Please contact support.");
    }
    throw new Error(error.message || "Failed to update billing details.");
  }

  return data?.billing || payload;
}

/**
 * Save tenant guest GST and guest receipt billing settings safely via RPC
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {Object} param1
 * @param {Object} [param1.tenantGst]
 * @param {Object} [param1.tenantBilling]
 */
export async function saveTenantGuestGstSettings(supabase, { tenantGst, tenantBilling } = {}) {
  const { data, error } = await supabase.rpc('save_tenant_guest_gst_settings', {
    p_tenant_gst: tenantGst || null,
    p_tenant_billing: tenantBilling || null
  });

  if (error) {
    if (error.code === 'PGRST202' || (error.message?.includes('function') && error.message?.includes('does not exist'))) {
      throw new Error("Guest GST update RPC is pending database migration. Please contact support.");
    }
    throw new Error(error.message || "Failed to update guest GST settings.");
  }

  return data;
}
