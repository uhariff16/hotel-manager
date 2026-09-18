const fs = require('fs');
let code = fs.readFileSync('src/pages/Settings.jsx', 'utf8');

// 1. Add tenantGst state
code = code.replace(
  /const \[billingDetails, setBillingDetails\] = useState\(\{[\s\S]*?\}\);/,
  \const [billingDetails, setBillingDetails] = useState({
    companyName: profile?.global_settings?.tenant_billing?.companyName || '',
    gstin: profile?.global_settings?.tenant_billing?.gstin || '',
    address: profile?.global_settings?.tenant_billing?.address || ''
  });
  
  const [tenantGst, setTenantGst] = useState({
    enabled: profile?.global_settings?.tenant_gst?.enabled || false,
    legalName: profile?.global_settings?.tenant_gst?.legalName || '',
    gstin: profile?.global_settings?.tenant_gst?.gstin || ''
  });\
);

// 2. Add tenantGst to saveGeneralSettings
code = code.replace(
  /const newGlobalSettings = \{[\s\S]*?\.\.\.currentGlobalSettings,[\s\S]*?tenant_billing: billingDetails[\s\S]*?\};/,
  \const newGlobalSettings = {
          ...currentGlobalSettings,
          tenant_billing: billingDetails,
          tenant_gst: tenantGst
        };\
);

// 3. Add the UI block for Guest Billing & GST (India) right before B2B Billing Details
code = code.replace(
  /<hr style=\{\{ margin: '2rem 0', borderColor: 'var\(--border\)', borderStyle: 'solid', borderWidth: '1px 0 0 0' \}\} \/>\s*<h3 style=\{\{ fontSize: '1.25rem', marginBottom: '1rem', color: 'var\(--text-main\)' \}\}>B2B Billing Details/,
  \<hr style={{ margin: '2rem 0', borderColor: 'var(--border)', borderStyle: 'solid', borderWidth: '1px 0 0 0' }} />
                  <h3 style={{ fontSize: '1.25rem', marginBottom: '1rem', color: 'var(--text-main)' }}>Guest Billing & Taxation (GST India)</h3>
                  <p style={{ color: 'var(--text-muted)', marginBottom: '1.5rem', fontSize: '0.9rem' }}>Enable and configure GST settings for generating tax-compliant invoices for your guests.</p>
                  
                  <div className="form-group" style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <div style={{ flex: 1 }}>
                      <label className="form-label" style={{ marginBottom: '0.25rem' }}>Enable GST Billing</label>
                      <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-muted)' }}>Automatically apply 5% or 18% GST to bookings based on the room tariff slab.</p>
                    </div>
                    <label className="switch">
                      <input 
                        type="checkbox" 
                        checked={tenantGst.enabled}
                        onChange={e => setTenantGst({...tenantGst, enabled: e.target.checked})}
                      />
                      <span className="slider round"></span>
                    </label>
                  </div>

                  {tenantGst.enabled && (
                    <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '1rem', marginBottom: '1.5rem' }}>
                      <div className="form-group">
                        <label className="form-label">Hotel Legal Name</label>
                        <input 
                          type="text" 
                          className="form-input" 
                          value={tenantGst.legalName} 
                          onChange={e => setTenantGst({...tenantGst, legalName: e.target.value})} 
                          placeholder="e.g. Sunny Resort Pvt Ltd" 
                        />
                      </div>
                      <div className="form-group">
                        <label className="form-label">Hotel GSTIN</label>
                        <input 
                          type="text" 
                          className="form-input" 
                          value={tenantGst.gstin} 
                          onChange={e => setTenantGst({...tenantGst, gstin: e.target.value})} 
                          placeholder="e.g. 29GGGGG1314R9Z6" 
                        />
                      </div>
                    </div>
                  )}

                  <hr style={{ margin: '2rem 0', borderColor: 'var(--border)', borderStyle: 'solid', borderWidth: '1px 0 0 0' }} />
                  <h3 style={{ fontSize: '1.25rem', marginBottom: '1rem', color: 'var(--text-main)' }}>B2B Billing Details\
);

fs.writeFileSync('src/pages/Settings.jsx', code);
console.log('Done Settings.jsx');
