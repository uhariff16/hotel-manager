import React from 'react';
import { Check } from 'lucide-react';
import { useSettingsStore } from '../lib/store';

export const normalizeFeatureName = (str) => {
  let s = (str || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  if (s.includes('bookingmanagement') || s.includes('aipoweredbookingmanagement')) {
    return 'bookingmanagement';
  }
  if (s.includes('staffaccess') || s.includes('tenantadmincontrol')) {
    return 'staffaccess';
  }
  return s;
};

export const getSanitizedFeatures = (plan) => {
  let rawList = [];
  if (plan.features && Array.isArray(plan.features)) {
    rawList = plan.features.filter(f => f.enabled !== false).map(f => f.name);
  } else if (plan.publicFeatures && Array.isArray(plan.publicFeatures)) {
    rawList = plan.publicFeatures;
  }

  const reports = plan.reports || {};

  return rawList.filter(featureName => {
    const norm = normalizeFeatureName(featureName);

    if (norm.includes('advancereports') || norm.includes('advancedreports')) return false;
    if (norm.includes('resortlimit') || norm.includes('roomlimit')) return false;
    if (norm.match(/upto\d+property/) || norm.match(/upto\d+resort/) || norm.match(/upto\d+room/)) return false;

    if (norm.includes('investmentanalysis') && reports.investment !== true) return false;
    if (norm.includes('excelexport') && reports.exportExcel !== true) return false;
    if (norm.includes('pdfexport') && reports.exportPdf !== true) return false;

    return true;
  });
};

export const normalizePlanReports = (planKey, planObj) => {
  const existingReports = planObj?.reports || (typeof planObj === 'object' && !planObj.reports ? planObj : {});
  const name = (planObj?.name || planKey || '').toLowerCase();

  const isSolo = planKey === 'custom_1786983013013' || planKey === 'solo' || name.includes('solo') || planKey === 'free';
  const isGrowth = planKey === 'pro' || planKey === 'growth' || name.includes('growth');
  const isStayMaster = planKey === 'premium' || planKey === 'staymaster' || name.includes('master') || name.includes('luxury');

  if (isSolo) {
    return {
      summary: false,
      bookings: true,
      guests: false,
      finance: false,
      investment: false,
      exportExcel: false,
      exportPdf: true,
      ...existingReports,
      finance: false
    };
  }

  if (isGrowth || isStayMaster) {
    return {
      summary: true,
      bookings: true,
      guests: true,
      finance: true,
      investment: true,
      exportExcel: true,
      exportPdf: true,
      ...existingReports
    };
  }

  return existingReports;
};

export const hasCoreFeature = (plan, targetName) => {
  if (!plan) return false;
  const normTarget = normalizeFeatureName(targetName);
  if (plan.features && Array.isArray(plan.features)) {
    const found = plan.features.find(f => normalizeFeatureName(f.name) === normTarget);
    if (found) {
      return found.enabled === true;
    }
  }
  if (plan.publicFeatures && Array.isArray(plan.publicFeatures)) {
    const found = plan.publicFeatures.find(name => normalizeFeatureName(name) === normTarget);
    if (found) {
      return true;
    }
  }
  return false;
};

export const getSupportLevel = (plan) => {
  if (!plan) return '—';
  if (plan.features && Array.isArray(plan.features)) {
    const priority = plan.features.find(f => normalizeFeatureName(f.name) === normalizeFeatureName('Priority Support'));
    if (priority && priority.enabled === true) return 'Priority Support';

    const basic = plan.features.find(f => normalizeFeatureName(f.name) === normalizeFeatureName('Basic Support'));
    if (basic && basic.enabled === true) return 'Basic Support';
  }
  if (plan.publicFeatures && Array.isArray(plan.publicFeatures)) {
    if (plan.publicFeatures.some(name => normalizeFeatureName(name) === normalizeFeatureName('Priority Support'))) return 'Priority Support';
    if (plan.publicFeatures.some(name => normalizeFeatureName(name) === normalizeFeatureName('Basic Support'))) return 'Basic Support';
  }
  return '—';
};

export default function PlanComparison({ title = "Compare Plans", subtitle = "Detailed breakdown of features, limits, and support levels across all plans.", containerStyle = {} }) {
  const { globalPlans, websitePricing } = useSettingsStore();
  const [isMobile, setIsMobile] = React.useState(() => typeof window !== 'undefined' ? window.innerWidth <= 768 : false);
  const [selectedPlanKey, setSelectedPlanKey] = React.useState(null);

  React.useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth <= 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const getPlansToDisplay = () => {
    if (!globalPlans) return [];
    
    // Sort plans by websitePricing displayOrder if available
    const published = websitePricing?.published || {};
    
    return Object.entries(globalPlans)
      .filter(([key, config]) => config.enabled !== false && key !== 'free')
      .map(([key, config]) => {
        const webPlan = published[key] || {};
        return {
          key,
          id: key,
          name: config.name || (key === 'custom_1786983013013' ? 'Solo' : (key === 'pro' ? 'Growth' : (key === 'premium' ? 'Stay Master' : key.toUpperCase()))),
          displayPlanName: webPlan.displayPlanName || config.name || key.toUpperCase(),
          maxResorts: config.maxResorts,
          maxRooms: config.maxRooms,
          maxStaff: config.maxStaff,
          features: config.features || [],
          reports: normalizePlanReports(key, config),
          publicFeatures: config.features ? config.features.filter(f => f.enabled !== false).map(f => f.name) : (webPlan.publicFeatures || []),
          displayOrder: webPlan.displayOrder || 99
        };
      })
      .sort((a, b) => a.displayOrder - b.displayOrder);
  };

  const plans = getPlansToDisplay();

  if (plans.length === 0) return null;

  const activeKey = selectedPlanKey || plans[0]?.key;
  const activePlan = plans.find(p => p.key === activeKey) || plans[0];

  const renderMobileView = () => (
    <div>
      {/* Pill Selector */}
      <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
        {plans.map(plan => {
          const isSelected = activePlan.key === plan.key;
          return (
            <button
              key={plan.key}
              onClick={() => setSelectedPlanKey(plan.key)}
              style={{
                padding: '0.6rem 1.25rem',
                borderRadius: '24px',
                fontWeight: 700,
                fontSize: '0.9rem',
                border: isSelected ? '1px solid #059669' : '1px solid #e2e8f0',
                background: isSelected ? 'linear-gradient(135deg, #059669 0%, #10b981 100%)' : '#ffffff',
                color: isSelected ? '#ffffff' : '#475569',
                cursor: 'pointer',
                boxShadow: isSelected ? '0 4px 12px rgba(5, 150, 105, 0.2)' : '0 2px 4px rgba(0,0,0,0.02)',
                transition: 'all 0.2s ease'
              }}
            >
              {plan.displayPlanName}
            </button>
          );
        })}
      </div>

      {/* Selected Plan Details Card */}
      <div style={{
        background: '#ffffff',
        borderRadius: '20px',
        border: '1px solid #e2e8f0',
        padding: '1.25rem',
        boxShadow: '0 4px 20px rgba(0,0,0,0.03)'
      }}>
        <div style={{ textAlign: 'center', marginBottom: '1.25rem', paddingBottom: '1rem', borderBottom: '2px solid #f1f5f9' }}>
          <h3 style={{ fontSize: '1.3rem', fontWeight: 800, color: '#0F2C59', margin: 0 }}>
            {activePlan.displayPlanName}
          </h3>
        </div>

        {/* Section: Property Management */}
        <div style={{ background: '#f8fafc', padding: '0.6rem 1rem', borderRadius: '8px', fontWeight: 800, color: '#0F2C59', fontSize: '0.85rem', letterSpacing: '0.05em', marginBottom: '0.5rem' }}>
          PROPERTY MANAGEMENT
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1.25rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.5rem 0.5rem', borderBottom: '1px solid #f1f5f9', fontSize: '0.9rem' }}>
            <span style={{ color: '#475569', fontWeight: 600 }}>Properties</span>
            <span style={{ color: '#0f172a', fontWeight: 700 }}>{activePlan.maxResorts >= 999999 ? 'Unlimited' : activePlan.maxResorts}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.5rem 0.5rem', borderBottom: '1px solid #f1f5f9', fontSize: '0.9rem' }}>
            <span style={{ color: '#475569', fontWeight: 600 }}>Rooms</span>
            <span style={{ color: '#0f172a', fontWeight: 700 }}>{activePlan.maxRooms >= 999999 ? 'Unlimited' : activePlan.maxRooms}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.5rem 0.5rem', borderBottom: '1px solid #f1f5f9', fontSize: '0.9rem' }}>
            <span style={{ color: '#475569', fontWeight: 600 }}>Staff Access</span>
            <span style={{ color: '#0f172a', fontWeight: 700 }}>{activePlan.maxStaff >= 999999 ? 'Unlimited' : (activePlan.maxStaff || 1)}</span>
          </div>
          {[
            'Dashboard',
            'Booking Management',
            'Financial Management',
            'WhatsApp Notifications'
          ].map(feature => (
            <div key={feature} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.5rem 0.5rem', borderBottom: '1px solid #f1f5f9', fontSize: '0.9rem' }}>
              <span style={{ color: '#475569', fontWeight: 600 }}>{feature}</span>
              <span>{hasCoreFeature(activePlan, feature) ? <Check size={18} color="#059669" /> : <span style={{ color: '#cbd5e1' }}>—</span>}</span>
            </div>
          ))}
        </div>

        {/* Section: Reports */}
        <div style={{ background: '#f8fafc', padding: '0.6rem 1rem', borderRadius: '8px', fontWeight: 800, color: '#0F2C59', fontSize: '0.85rem', letterSpacing: '0.05em', marginBottom: '0.5rem' }}>
          REPORTS
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1.25rem' }}>
          {[
            { key: 'bookings', label: 'Booking Details' },
            { key: 'summary', label: 'Performance Summary' },
            { key: 'finance', label: 'Income & Expenses' },
            { key: 'guests', label: 'Guest Contacts' }
          ].map(item => (
            <div key={item.key} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.5rem 0.5rem', borderBottom: '1px solid #f1f5f9', fontSize: '0.9rem' }}>
              <span style={{ color: '#475569', fontWeight: 600 }}>{item.label}</span>
              <span>{activePlan.reports?.[item.key] === true ? <Check size={18} color="#059669" /> : <span style={{ color: '#cbd5e1' }}>—</span>}</span>
            </div>
          ))}
        </div>

        {/* Section: Business Tools */}
        <div style={{ background: '#f8fafc', padding: '0.6rem 1rem', borderRadius: '8px', fontWeight: 800, color: '#0F2C59', fontSize: '0.85rem', letterSpacing: '0.05em', marginBottom: '0.5rem' }}>
          BUSINESS TOOLS
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1.25rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.5rem 0.5rem', borderBottom: '1px solid #f1f5f9', fontSize: '0.9rem' }}>
            <span style={{ color: '#475569', fontWeight: 600 }}>Investment Analysis</span>
            <span>{activePlan.reports?.investment === true ? <Check size={18} color="#059669" /> : <span style={{ color: '#cbd5e1' }}>—</span>}</span>
          </div>
        </div>

        {/* Section: Exports & Support */}
        <div style={{ background: '#f8fafc', padding: '0.6rem 1rem', borderRadius: '8px', fontWeight: 800, color: '#0F2C59', fontSize: '0.85rem', letterSpacing: '0.05em', marginBottom: '0.5rem' }}>
          EXPORTS & SUPPORT
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.5rem 0.5rem', borderBottom: '1px solid #f1f5f9', fontSize: '0.9rem' }}>
            <span style={{ color: '#475569', fontWeight: 600 }}>Excel Export</span>
            <span>{activePlan.reports?.exportExcel === true ? <Check size={18} color="#059669" /> : <span style={{ color: '#cbd5e1' }}>—</span>}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.5rem 0.5rem', borderBottom: '1px solid #f1f5f9', fontSize: '0.9rem' }}>
            <span style={{ color: '#475569', fontWeight: 600 }}>PDF Export</span>
            <span>{activePlan.reports?.exportPdf === true ? <Check size={18} color="#059669" /> : <span style={{ color: '#cbd5e1' }}>—</span>}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.5rem 0.5rem', fontSize: '0.9rem' }}>
            <span style={{ color: '#475569', fontWeight: 600 }}>Support Level</span>
            <span style={{ color: '#0f172a', fontWeight: 600 }}>{getSupportLevel(activePlan)}</span>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <section style={{ padding: '3rem 1rem', background: 'transparent', ...containerStyle }}>
      <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
        {title && (
          <div style={{ textAlign: 'center', marginBottom: '2.5rem' }}>
            <h2 style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--text-main, #0F2C59)', fontFamily: "'Outfit', sans-serif", margin: '0 0 0.5rem 0' }}>{title}</h2>
            {subtitle && <p style={{ fontSize: '1.05rem', color: 'var(--text-muted, #64748b)', margin: 0 }}>{subtitle}</p>}
          </div>
        )}
        
        {isMobile ? renderMobileView() : (
          <div style={{ overflowX: 'auto', background: 'var(--card-bg, #ffffff)', borderRadius: '20px', border: '1px solid var(--border, #e2e8f0)', boxShadow: '0 4px 20px rgba(0,0,0,0.03)' }}>
            <table style={{ width: '100%', minWidth: '750px', borderCollapse: 'collapse', fontSize: '0.95rem' }}>
              <thead>
                <tr>
                  <th style={{ padding: '1.25rem 1.5rem', textAlign: 'left', borderBottom: '2px solid var(--border, #e2e8f0)', background: 'var(--bg-secondary, #f8fafc)', position: 'sticky', left: 0, zIndex: 10, width: '25%', color: 'var(--text-main, #0F2C59)', fontWeight: 800 }}>Features</th>
                  {plans.map(plan => (
                    <th key={plan.key} style={{ padding: '1.25rem 1rem', textAlign: 'center', borderBottom: '2px solid var(--border, #e2e8f0)', color: 'var(--primary, #059669)', fontWeight: 800, fontSize: '1.15rem', width: `${75 / plans.length}%` }}>
                      {plan.displayPlanName}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {/* PROPERTY MANAGEMENT */}
                <tr>
                  <td colSpan={plans.length + 1} style={{ padding: '1rem 1.5rem 0.5rem', background: 'var(--bg-secondary, #f8fafc)', fontWeight: 800, color: 'var(--text-main, #0F2C59)', fontSize: '0.9rem', borderBottom: '2px solid var(--border, #e2e8f0)', letterSpacing: '0.05em' }}>
                    PROPERTY MANAGEMENT
                  </td>
                </tr>
                <tr>
                  <td style={{ padding: '0.85rem 1.5rem', borderBottom: '1px solid var(--border, #e2e8f0)', background: 'var(--card-bg, #ffffff)', position: 'sticky', left: 0, fontWeight: 600, color: 'var(--text-main, #475569)' }}>Properties</td>
                  {plans.map(plan => (
                    <td key={plan.key} style={{ padding: '0.85rem 1rem', textAlign: 'center', borderBottom: '1px solid var(--border, #e2e8f0)', color: 'var(--text-main, #1e293b)', fontWeight: 700 }}>
                      {plan.maxResorts >= 999999 ? 'Unlimited' : plan.maxResorts}
                    </td>
                  ))}
                </tr>
                <tr>
                  <td style={{ padding: '0.85rem 1.5rem', borderBottom: '1px solid var(--border, #e2e8f0)', background: 'var(--card-bg, #ffffff)', position: 'sticky', left: 0, fontWeight: 600, color: 'var(--text-main, #475569)' }}>Rooms</td>
                  {plans.map(plan => (
                    <td key={plan.key} style={{ padding: '0.85rem 1rem', textAlign: 'center', borderBottom: '1px solid var(--border, #e2e8f0)', color: 'var(--text-main, #1e293b)', fontWeight: 700 }}>
                      {plan.maxRooms >= 999999 ? 'Unlimited' : plan.maxRooms}
                    </td>
                  ))}
                </tr>
                <tr>
                  <td style={{ padding: '0.85rem 1.5rem', borderBottom: '1px solid var(--border, #e2e8f0)', background: 'var(--card-bg, #ffffff)', position: 'sticky', left: 0, fontWeight: 600, color: 'var(--text-main, #475569)' }}>Staff Access</td>
                  {plans.map(plan => (
                    <td key={plan.key} style={{ padding: '0.85rem 1rem', textAlign: 'center', borderBottom: '1px solid var(--border, #e2e8f0)', color: 'var(--text-main, #1e293b)', fontWeight: 700 }}>
                      {plan.maxStaff >= 999999 ? 'Unlimited' : (plan.maxStaff || 1)}
                    </td>
                  ))}
                </tr>
                <tr>
                  <td style={{ padding: '0.85rem 1.5rem', borderBottom: '1px solid var(--border, #e2e8f0)', background: 'var(--card-bg, #ffffff)', position: 'sticky', left: 0, fontWeight: 600, color: 'var(--text-main, #475569)' }}>Dashboard</td>
                  {plans.map(plan => (
                    <td key={plan.key} style={{ padding: '0.85rem 1rem', textAlign: 'center', borderBottom: '1px solid var(--border, #e2e8f0)' }}>
                      {hasCoreFeature(plan, 'Dashboard') ? <Check size={20} color="var(--success, #059669)" style={{ display: 'inline' }} /> : <span style={{ color: 'var(--text-muted, #cbd5e1)' }}>—</span>}
                    </td>
                  ))}
                </tr>
                <tr>
                  <td style={{ padding: '0.85rem 1.5rem', borderBottom: '1px solid var(--border, #e2e8f0)', background: 'var(--card-bg, #ffffff)', position: 'sticky', left: 0, fontWeight: 600, color: 'var(--text-main, #475569)' }}>Booking Management</td>
                  {plans.map(plan => (
                    <td key={plan.key} style={{ padding: '0.85rem 1rem', textAlign: 'center', borderBottom: '1px solid var(--border, #e2e8f0)' }}>
                      {hasCoreFeature(plan, 'Booking Management') ? <Check size={20} color="var(--success, #059669)" style={{ display: 'inline' }} /> : <span style={{ color: 'var(--text-muted, #cbd5e1)' }}>—</span>}
                    </td>
                  ))}
                </tr>
                <tr>
                  <td style={{ padding: '0.85rem 1.5rem', borderBottom: '1px solid var(--border, #e2e8f0)', background: 'var(--card-bg, #ffffff)', position: 'sticky', left: 0, fontWeight: 600, color: 'var(--text-main, #475569)' }}>Financial Management</td>
                  {plans.map(plan => (
                    <td key={plan.key} style={{ padding: '0.85rem 1rem', textAlign: 'center', borderBottom: '1px solid var(--border, #e2e8f0)' }}>
                      {hasCoreFeature(plan, 'Financial Management') ? <Check size={20} color="var(--success, #059669)" style={{ display: 'inline' }} /> : <span style={{ color: 'var(--text-muted, #cbd5e1)' }}>—</span>}
                    </td>
                  ))}
                </tr>
                <tr>
                  <td style={{ padding: '0.85rem 1.5rem', borderBottom: '1px solid var(--border, #e2e8f0)', background: 'var(--card-bg, #ffffff)', position: 'sticky', left: 0, fontWeight: 600, color: 'var(--text-main, #475569)' }}>WhatsApp Notifications</td>
                  {plans.map(plan => (
                    <td key={plan.key} style={{ padding: '0.85rem 1rem', textAlign: 'center', borderBottom: '1px solid var(--border, #e2e8f0)' }}>
                      {hasCoreFeature(plan, 'WhatsApp Notifications') ? <Check size={20} color="var(--success, #059669)" style={{ display: 'inline' }} /> : <span style={{ color: 'var(--text-muted, #cbd5e1)' }}>—</span>}
                    </td>
                  ))}
                </tr>

                {/* REPORTS */}
                <tr>
                  <td colSpan={plans.length + 1} style={{ padding: '1rem 1.5rem 0.5rem', background: 'var(--bg-secondary, #f8fafc)', fontWeight: 800, color: 'var(--text-main, #0F2C59)', fontSize: '0.9rem', borderBottom: '2px solid var(--border, #e2e8f0)', letterSpacing: '0.05em' }}>
                    REPORTS
                  </td>
                </tr>
                <tr>
                  <td style={{ padding: '0.85rem 1.5rem', borderBottom: '1px solid var(--border, #e2e8f0)', background: 'var(--card-bg, #ffffff)', position: 'sticky', left: 0, fontWeight: 600, color: 'var(--text-main, #475569)' }}>Booking Details</td>
                  {plans.map(plan => (
                    <td key={plan.key} style={{ padding: '0.85rem 1rem', textAlign: 'center', borderBottom: '1px solid var(--border, #e2e8f0)' }}>
                      {plan.reports?.bookings === true ? <Check size={20} color="var(--success, #059669)" style={{ display: 'inline' }} /> : <span style={{ color: 'var(--text-muted, #cbd5e1)' }}>—</span>}
                    </td>
                  ))}
                </tr>
                <tr>
                  <td style={{ padding: '0.85rem 1.5rem', borderBottom: '1px solid var(--border, #e2e8f0)', background: 'var(--card-bg, #ffffff)', position: 'sticky', left: 0, fontWeight: 600, color: 'var(--text-main, #475569)' }}>Performance Summary</td>
                  {plans.map(plan => (
                    <td key={plan.key} style={{ padding: '0.85rem 1rem', textAlign: 'center', borderBottom: '1px solid var(--border, #e2e8f0)' }}>
                      {plan.reports?.summary === true ? <Check size={20} color="var(--success, #059669)" style={{ display: 'inline' }} /> : <span style={{ color: 'var(--text-muted, #cbd5e1)' }}>—</span>}
                    </td>
                  ))}
                </tr>
                <tr>
                  <td style={{ padding: '0.85rem 1.5rem', borderBottom: '1px solid var(--border, #e2e8f0)', background: 'var(--card-bg, #ffffff)', position: 'sticky', left: 0, fontWeight: 600, color: 'var(--text-main, #475569)' }}>Income & Expenses</td>
                  {plans.map(plan => (
                    <td key={plan.key} style={{ padding: '0.85rem 1rem', textAlign: 'center', borderBottom: '1px solid var(--border, #e2e8f0)' }}>
                      {plan.reports?.finance === true ? <Check size={20} color="var(--success, #059669)" style={{ display: 'inline' }} /> : <span style={{ color: 'var(--text-muted, #cbd5e1)' }}>—</span>}
                    </td>
                  ))}
                </tr>
                <tr>
                  <td style={{ padding: '0.85rem 1.5rem', borderBottom: '1px solid var(--border, #e2e8f0)', background: 'var(--card-bg, #ffffff)', position: 'sticky', left: 0, fontWeight: 600, color: 'var(--text-main, #475569)' }}>Guest Contacts</td>
                  {plans.map(plan => (
                    <td key={plan.key} style={{ padding: '0.85rem 1rem', textAlign: 'center', borderBottom: '1px solid var(--border, #e2e8f0)' }}>
                      {plan.reports?.guests === true ? <Check size={20} color="var(--success, #059669)" style={{ display: 'inline' }} /> : <span style={{ color: 'var(--text-muted, #cbd5e1)' }}>—</span>}
                    </td>
                  ))}
                </tr>

                {/* BUSINESS TOOLS */}
                <tr>
                  <td colSpan={plans.length + 1} style={{ padding: '1rem 1.5rem 0.5rem', background: 'var(--bg-secondary, #f8fafc)', fontWeight: 800, color: 'var(--text-main, #0F2C59)', fontSize: '0.9rem', borderBottom: '2px solid var(--border, #e2e8f0)', letterSpacing: '0.05em' }}>
                    BUSINESS TOOLS
                  </td>
                </tr>
                <tr>
                  <td style={{ padding: '0.85rem 1.5rem', borderBottom: '1px solid var(--border, #e2e8f0)', background: 'var(--card-bg, #ffffff)', position: 'sticky', left: 0, fontWeight: 600, color: 'var(--text-main, #475569)' }}>Investment Analysis</td>
                  {plans.map(plan => (
                    <td key={plan.key} style={{ padding: '0.85rem 1rem', textAlign: 'center', borderBottom: '1px solid var(--border, #e2e8f0)' }}>
                      {plan.reports?.investment === true ? <Check size={20} color="var(--success, #059669)" style={{ display: 'inline' }} /> : <span style={{ color: 'var(--text-muted, #cbd5e1)' }}>—</span>}
                    </td>
                  ))}
                </tr>

                {/* EXPORTS & SUPPORT */}
                <tr>
                  <td colSpan={plans.length + 1} style={{ padding: '1rem 1.5rem 0.5rem', background: 'var(--bg-secondary, #f8fafc)', fontWeight: 800, color: 'var(--text-main, #0F2C59)', fontSize: '0.9rem', borderBottom: '2px solid var(--border, #e2e8f0)', letterSpacing: '0.05em' }}>
                    EXPORTS & SUPPORT
                  </td>
                </tr>
                <tr>
                  <td style={{ padding: '0.85rem 1.5rem', borderBottom: '1px solid var(--border, #e2e8f0)', background: 'var(--card-bg, #ffffff)', position: 'sticky', left: 0, fontWeight: 600, color: 'var(--text-main, #475569)' }}>Excel Export</td>
                  {plans.map(plan => (
                    <td key={plan.key} style={{ padding: '0.85rem 1rem', textAlign: 'center', borderBottom: '1px solid var(--border, #e2e8f0)' }}>
                      {plan.reports?.exportExcel === true ? <Check size={20} color="var(--success, #059669)" style={{ display: 'inline' }} /> : <span style={{ color: 'var(--text-muted, #cbd5e1)' }}>—</span>}
                    </td>
                  ))}
                </tr>
                <tr>
                  <td style={{ padding: '0.85rem 1.5rem', borderBottom: '1px solid var(--border, #e2e8f0)', background: 'var(--card-bg, #ffffff)', position: 'sticky', left: 0, fontWeight: 600, color: 'var(--text-main, #475569)' }}>PDF Export</td>
                  {plans.map(plan => (
                    <td key={plan.key} style={{ padding: '0.85rem 1rem', textAlign: 'center', borderBottom: '1px solid var(--border, #e2e8f0)' }}>
                      {plan.reports?.exportPdf === true ? <Check size={20} color="var(--success, #059669)" style={{ display: 'inline' }} /> : <span style={{ color: 'var(--text-muted, #cbd5e1)' }}>—</span>}
                    </td>
                  ))}
                </tr>
                <tr>
                  <td style={{ padding: '0.85rem 1.5rem', borderBottom: '1px solid var(--border, #e2e8f0)', background: 'var(--card-bg, #ffffff)', position: 'sticky', left: 0, fontWeight: 600, color: 'var(--text-main, #475569)' }}>Support Level</td>
                  {plans.map(plan => (
                    <td key={plan.key} style={{ padding: '0.85rem 1rem', textAlign: 'center', borderBottom: '1px solid var(--border, #e2e8f0)', color: 'var(--text-main, #1e293b)', fontWeight: 600 }}>
                      {getSupportLevel(plan)}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
