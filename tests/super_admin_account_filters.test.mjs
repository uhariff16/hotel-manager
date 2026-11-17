import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

// Test suite for SuperAdmin Account Filters & Betterment
// Verifying plan normalization, counts, sorting, and omni-search

describe('SuperAdmin Account Filters & Betterment Suite', () => {

  const mockPricingConfig = {
    custom_1786983013013: { name: 'Solo', price: 999 },
    pro: { name: 'Growth', price: 1999 },
    premium: { name: 'Stay Master', price: 4999 },
    free: { name: 'Free Starter', price: 0 }
  };

  const normalizePlanType = (rawPlan) => {
    if (!rawPlan) return 'free';
    const p = String(rawPlan).toLowerCase().trim();
    if (p === 'custom_1786983013013' || p === 'solo') return 'solo';
    if (p === 'pro' || p === 'growth') return 'growth';
    if (p === 'premium' || p === 'stay_master' || p === 'staymaster') return 'stay_master';
    if (p === 'free' || p === 'trial') return 'free';
    
    const cfgName = mockPricingConfig[rawPlan]?.name?.toLowerCase() || '';
    if (cfgName.includes('solo')) return 'solo';
    if (cfgName.includes('growth')) return 'growth';
    if (cfgName.includes('stay master') || cfgName.includes('staymaster')) return 'stay_master';
    
    return p;
  };

  const mockAccounts = [
    {
      id: 'user_1',
      name: 'Stay master test',
      email: 'uhariff@staypilot.co.in',
      phone: '8220320178',
      role: 'tenant_admin',
      plan_type: 'custom_1786983013013',
      accountStatus: 'active',
      is_qa: false,
      is_archived: false,
      created_at: '2026-10-18T10:00:00Z',
      envClassification: 'LIVE',
      propertyNames: 'Stay master test\'s First Resort',
      propertiesCount: 1,
      bookingsCount: 3
    },
    {
      id: 'user_2',
      name: 'New test account',
      email: 'staypilot.india@gmail.com',
      phone: '8220320178',
      role: 'tenant_admin',
      plan_type: 'pro',
      accountStatus: 'cancelled',
      is_qa: false,
      is_archived: false,
      created_at: '2026-10-09T10:00:00Z',
      envClassification: 'UNKNOWN',
      propertyNames: 'New test account\'s First Resort',
      propertiesCount: 1,
      bookingsCount: 0
    },
    {
      id: 'user_3',
      name: 'Test Google',
      email: 'uhariff@yahoo.com',
      phone: '82200232313',
      role: 'tenant_admin',
      plan_type: 'solo',
      accountStatus: 'active',
      is_qa: false,
      is_archived: false,
      created_at: '2026-10-08T10:00:00Z',
      envClassification: 'UNKNOWN',
      propertyNames: 'Test Google\'s First Resort',
      propertiesCount: 1,
      bookingsCount: 0
    },
    {
      id: 'user_4',
      name: 'ccstaff6',
      email: 'uhariff@gmail.com',
      phone: '+918220320178',
      role: 'staff',
      plan_type: null,
      accountStatus: 'created',
      is_qa: false,
      is_archived: false,
      created_at: '2026-10-03T10:00:00Z',
      envClassification: 'TEST_ONLY',
      ownerName: 'Cheerful Chalet',
      propertyNames: 'Cheerful Chalet',
      propertiesCount: 0,
      bookingsCount: 0
    },
    {
      id: 'user_5',
      name: 'QA Sandbox User',
      email: 'qa@staypilot.test',
      phone: '1234567890',
      role: 'tenant_admin',
      plan_type: 'free',
      accountStatus: 'active',
      is_qa: true,
      is_archived: false,
      created_at: '2026-09-01T10:00:00Z',
      envClassification: 'NONE',
      propertyNames: 'QA Resort',
      propertiesCount: 1,
      bookingsCount: 10
    }
  ];

  test('Test 1: Plan normalization maps DB keys correctly', () => {
    assert.equal(normalizePlanType('custom_1786983013013'), 'solo');
    assert.equal(normalizePlanType('pro'), 'growth');
    assert.equal(normalizePlanType('premium'), 'stay_master');
    assert.equal(normalizePlanType('free'), 'free');
    assert.equal(normalizePlanType(null), 'free');
    assert.equal(normalizePlanType('solo'), 'solo');
    assert.equal(normalizePlanType('growth'), 'growth');
  });

  test('Test 2: Tab accounts partitions active accounts from QA/archived', () => {
    const tabAccounts = mockAccounts.filter(a => !a.is_qa && !a.is_archived);
    assert.equal(tabAccounts.length, 4);
  });

  test('Test 3: Dynamic counts accurately count items in tabAccounts', () => {
    const tabAccounts = mockAccounts.filter(a => !a.is_qa && !a.is_archived);
    const counts = {
      roles: { all: tabAccounts.length, tenant_admin: 0, staff: 0 },
      plans: { all: tabAccounts.length, solo: 0, growth: 0, stay_master: 0, free: 0 },
      status: { all: tabAccounts.length, active: 0, created: 0, cancelled: 0, suspended: 0 },
      env: { all: tabAccounts.length, live: 0, test: 0, unknown: 0, none: 0 }
    };

    tabAccounts.forEach(t => {
      if (t.role === 'tenant_admin') counts.roles.tenant_admin++;
      if (t.role === 'staff') counts.roles.staff++;
      
      const plan = normalizePlanType(t.plan_type);
      if (counts.plans[plan] !== undefined) counts.plans[plan]++;

      const st = String(t.accountStatus || 'active').toLowerCase();
      if (counts.status[st] !== undefined) counts.status[st]++;

      const env = String(t.envClassification || 'none').toLowerCase();
      if (env.includes('live')) counts.env.live++;
      else if (env.includes('test')) counts.env.test++;
      else if (env.includes('unknown')) counts.env.unknown++;
      else counts.env.none++;
    });

    assert.equal(counts.roles.all, 4);
    assert.equal(counts.roles.tenant_admin, 3);
    assert.equal(counts.roles.staff, 1);
    assert.equal(counts.plans.solo, 2);
    assert.equal(counts.plans.growth, 1);
    assert.equal(counts.plans.free, 1);
    assert.equal(counts.status.active, 2);
    assert.equal(counts.status.cancelled, 1);
    assert.equal(counts.status.created, 1);
  });

  test('Test 4: Filtering by plan "solo" correctly matches normalized plan', () => {
    const tabAccounts = mockAccounts.filter(a => !a.is_qa && !a.is_archived);
    const soloAccounts = tabAccounts.filter(t => normalizePlanType(t.plan_type) === 'solo');
    assert.equal(soloAccounts.length, 2);
    assert.deepEqual(soloAccounts.map(a => a.id), ['user_1', 'user_3']);
  });

  test('Test 5: Filtering by role "staff"', () => {
    const tabAccounts = mockAccounts.filter(a => !a.is_qa && !a.is_archived);
    const staffAccounts = tabAccounts.filter(t => t.role === 'staff');
    assert.equal(staffAccounts.length, 1);
    assert.equal(staffAccounts[0].id, 'user_4');
  });

  test('Test 6: Omni search tests', () => {
    const tabAccounts = mockAccounts.filter(a => !a.is_qa && !a.is_archived);
    const searchByOwner = tabAccounts.filter(t => {
      const q = 'cheerful chalet'.toLowerCase();
      return (t.name?.toLowerCase().includes(q) ||
              t.ownerName?.toLowerCase().includes(q) ||
              t.propertyNames?.toLowerCase().includes(q));
    });
    assert.equal(searchByOwner.length, 1);
    assert.equal(searchByOwner[0].id, 'user_4');

    const searchByPlanName = tabAccounts.filter(t => {
      const q = 'growth'.toLowerCase();
      const plan = normalizePlanType(t.plan_type);
      return plan.includes(q);
    });
    assert.equal(searchByPlanName.length, 1);
    assert.equal(searchByPlanName[0].id, 'user_2');
  });

  test('Test 7: Sorting accounts', () => {
    const tabAccounts = mockAccounts.filter(a => !a.is_qa && !a.is_archived);
    const sortedByNameAsc = [...tabAccounts].sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    assert.equal(sortedByNameAsc[0].id, 'user_4');
    assert.equal(sortedByNameAsc[sortedByNameAsc.length - 1].id, 'user_3');

    const sortedByBookingsDesc = [...tabAccounts].sort((a, b) => (b.bookingsCount || 0) - (a.bookingsCount || 0));
    assert.equal(sortedByBookingsDesc[0].id, 'user_1');
  });

});
