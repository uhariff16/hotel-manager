/**
 * Authoritative Plan Entitlement & Usage Resolver for Stay Pilot
 *
 * Dynamically resolves plan configurations from global_settings.pricing (globalPlans).
 * Supports Super Admin dynamic plans, alias mapping, legacy accounts, trial accounts,
 * staff user tenant delegation, and fail-closed handling for unknown plans.
 */

/**
 * Resolves the effective plan key and plan config from globalPlans
 * @param {Object} profile - User profile (or owning tenant profile for staff)
 * @param {Object} globalPlans - Pricing map from useSettingsStore
 * @returns {Object} { planKey, planConfig, isUnknownPlan }
 */
export function resolveEffectivePlan(profileOrPlan, globalPlans) {
  if (!profileOrPlan || !globalPlans || typeof globalPlans !== 'object') {
    const rawKey = typeof profileOrPlan === 'string'
      ? profileOrPlan
      : (profileOrPlan?.plan_type || profileOrPlan?.plan || 'unknown');
    return {
      planKey: rawKey,
      planConfig: null,
      isUnknownPlan: true
    };
  }

  const rawPlan = typeof profileOrPlan === 'string'
    ? profileOrPlan.trim()
    : (profileOrPlan.plan_type || profileOrPlan.plan || '').trim();

  if (!rawPlan) {
    return {
      planKey: 'unknown',
      planConfig: null,
      isUnknownPlan: true
    };
  }

  // 1. Direct key match in globalPlans (e.g. 'free', 'custom_1786983013013', 'pro', 'premium', 'custom_future_plan')
  if (globalPlans[rawPlan]) {
    return {
      planKey: rawPlan,
      planConfig: globalPlans[rawPlan],
      isUnknownPlan: false
    };
  }

  // 2. Case-insensitive key match in globalPlans
  const lowerRaw = rawPlan.toLowerCase();
  const matchedKey = Object.keys(globalPlans).find(k => k.toLowerCase() === lowerRaw);
  if (matchedKey && globalPlans[matchedKey]) {
    return {
      planKey: matchedKey,
      planConfig: globalPlans[matchedKey],
      isUnknownPlan: false
    };
  }

  // 3. Match plan display name (e.g. 'Free Starter' -> 'free', 'Solo' -> 'custom_1786983013013', etc.)
  const nameMatchedKey = Object.keys(globalPlans).find(k => {
    const p = globalPlans[k];
    return p && p.name && p.name.trim().toLowerCase() === lowerRaw;
  });
  if (nameMatchedKey && globalPlans[nameMatchedKey]) {
    return {
      planKey: nameMatchedKey,
      planConfig: globalPlans[nameMatchedKey],
      isUnknownPlan: false
    };
  }

  // 4. Authoritative Alias Resolution
  // Free Starter aliases: 'free', 'free starter', 'freestarter', 'starter'
  if (lowerRaw === 'free starter' || lowerRaw === 'freestarter' || lowerRaw === 'starter') {
    const freeKey = Object.keys(globalPlans).find(k => k === 'free' || k.toLowerCase() === 'free' || globalPlans[k]?.name?.toLowerCase() === 'free starter');
    if (freeKey && globalPlans[freeKey]) {
      return {
        planKey: freeKey,
        planConfig: globalPlans[freeKey],
        isUnknownPlan: false
      };
    }
  }

  // Solo aliases: 'solo', 'custom_1786983013013'
  if (lowerRaw === 'solo') {
    const soloKey = Object.keys(globalPlans).find(k => k === 'custom_1786983013013' || k === 'solo' || globalPlans[k]?.name?.toLowerCase() === 'solo');
    if (soloKey && globalPlans[soloKey]) {
      return {
        planKey: soloKey,
        planConfig: globalPlans[soloKey],
        isUnknownPlan: false
      };
    }
  }

  // Growth aliases: 'growth', 'pro'
  if (lowerRaw === 'growth' || lowerRaw === 'pro') {
    const growthKey = Object.keys(globalPlans).find(k => k === 'pro' || k === 'growth' || globalPlans[k]?.name?.toLowerCase() === 'growth');
    if (growthKey && globalPlans[growthKey]) {
      return {
        planKey: growthKey,
        planConfig: globalPlans[growthKey],
        isUnknownPlan: false
      };
    }
  }

  // Stay Master aliases: 'stay master', 'staymaster', 'premium', 'luxury'
  if (lowerRaw === 'stay master' || lowerRaw === 'staymaster' || lowerRaw === 'premium' || lowerRaw === 'luxury') {
    const masterKey = Object.keys(globalPlans).find(k => k === 'premium' || k === 'staymaster' || k === 'luxury' || globalPlans[k]?.name?.toLowerCase() === 'stay master');
    if (masterKey && globalPlans[masterKey]) {
      return {
        planKey: masterKey,
        planConfig: globalPlans[masterKey],
        isUnknownPlan: false
      };
    }
  }

  // 5. FAIL-CLOSED: Unknown / unrecognized plan key
  return {
    planKey: rawPlan,
    planConfig: null,
    isUnknownPlan: true
  };
}

/**
 * Resolves complete tenant entitlements, current usage, and resource permissions
 * @param {Object} params
 * @param {Object} params.profile Current user profile
 * @param {Object} params.globalPlans Pricing map from store
 * @param {Object} params.tenantAdminData Tenant admin profile if current user is staff
 * @param {Array} params.resorts Array of tenant's resorts
 * @param {Array} params.cottages Array of tenant's properties (cottages)
 * @param {Array} params.rooms Array of tenant's rooms across ALL properties
 * @param {Array} params.staff Members with role = 'staff'
 * @returns {Object} Structured entitlement status
 */
export function getTenantEntitlements({
  profile,
  globalPlans,
  tenantAdminData = null,
  resorts = [],
  cottages = [],
  rooms = [],
  staff = []
}) {
  if (!profile) {
    return {
      isUnknownPlan: true,
      canOperate: false,
      reason: 'No user session',
      limits: { maxResorts: 0, maxRooms: 0, maxStaff: 0 },
      usage: { resorts: 0, cottages: 0, rooms: 0, staff: 0 },
      canCreate: { resort: false, cottage: false, room: false, staff: false }
    };
  }

  // Staff users resolve entitlements through their owning Tenant Admin
  const isStaff = profile.role === 'staff';
  const effectiveProfile = isStaff ? (tenantAdminData || profile) : profile;

  // Check administrative suspension
  const isSuspended = profile.subscription_status === 'suspended' || effectiveProfile.subscription_status === 'suspended';

  // Resolve plan from globalPlans
  const { planKey, planConfig, isUnknownPlan } = resolveEffectivePlan(effectiveProfile, globalPlans);

  if (isUnknownPlan || !planConfig) {
    return {
      isUnknownPlan: true,
      planKey: effectiveProfile.plan_type || 'unknown',
      planName: effectiveProfile.plan_type || 'Unknown Plan',
      canOperate: false,
      reason: "We couldn't verify your plan limits. Please refresh or contact support.",
      limits: { maxResorts: 0, maxRooms: 0, maxStaff: 0 },
      usage: {
        resorts: resorts.length,
        cottages: cottages.length,
        rooms: rooms.length,
        staff: staff.filter(s => s.role === 'staff').length
      },
      canCreate: { resort: false, cottage: false, room: false, staff: false }
    };
  }

  // Extract limits (999999 or undefined treated as Unlimited)
  const maxResorts = Number(planConfig.maxResorts ?? 999999);
  const maxRooms = Number(planConfig.maxRooms ?? 999999);
  const maxStaff = Number(planConfig.maxStaff ?? 999999);

  // Calculate tenant-wide usage
  // Staff count excludes Tenant Admin / Owner (role !== 'staff')
  const staffCount = staff.filter(s => s.role === 'staff').length;

  const usage = {
    resorts: resorts.length,
    cottages: cottages.length,
    rooms: rooms.length,
    staff: staffCount
  };

  const limits = {
    maxResorts,
    maxRooms,
    maxStaff
  };

  // Determine creation eligibility
  const canCreate = {
    resort: !isSuspended && usage.resorts < maxResorts,
    cottage: !isSuspended && usage.cottages < maxResorts,
    room: !isSuspended && usage.rooms < maxRooms,
    staff: !isSuspended && usage.staff < maxStaff
  };

  const isAtLimit = {
    resort: usage.resorts >= maxResorts,
    cottage: usage.cottages >= maxResorts,
    room: usage.rooms >= maxRooms,
    staff: usage.staff >= maxStaff
  };

  const isOverLimit = {
    resort: usage.resorts > maxResorts,
    cottage: usage.cottages > maxResorts,
    room: usage.rooms > maxRooms,
    staff: usage.staff > maxStaff
  };

  return {
    isUnknownPlan: false,
    planKey,
    planName: planConfig.name || planKey,
    planConfig,
    isSuspended,
    limits,
    usage,
    canCreate,
    isAtLimit,
    isOverLimit
  };
}
