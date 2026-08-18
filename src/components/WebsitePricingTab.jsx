import React, { useState } from 'react';
import { Trash2, Link as LinkIcon, Eye, History, AlertTriangle, CheckCircle, Clock } from 'lucide-react';

export default function WebsitePricingTab({
  internalPricing,
  websitePricingConfig,
  onSaveDraft,
  onPublish,
  onRollback
}) {
  const [editingPlanKey, setEditingPlanKey] = useState(null);
  const [localDraft, setLocalDraft] = useState(websitePricingConfig.draft || {});
  const [showPublishModal, setShowPublishModal] = useState(false);
  const [activeTab, setActiveTab] = useState('manage'); // 'manage' or 'history'

  const hasUnpublishedChanges = JSON.stringify(websitePricingConfig.draft || {}) !== JSON.stringify(websitePricingConfig.published || {});

  const handleEditPlan = (key) => {
    setEditingPlanKey(key);
  };

  const handleSavePlanToDraft = (key, updatedPlan) => {
    const newDraft = { ...localDraft, [key]: updatedPlan };
    setLocalDraft(newDraft);
    onSaveDraft(newDraft);
    setEditingPlanKey(null);
  };

  // Sync draft if external config changes (like rollback)
  React.useEffect(() => {
    setLocalDraft(websitePricingConfig.draft || {});
  }, [websitePricingConfig.draft]);

  if (activeTab === 'history') {
    return (
      <div style={{ padding: '1rem 0' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
          <h4 style={{ margin: 0, fontSize: '1.25rem', color: '#1e293b' }}>Version History</h4>
          <button className="btn btn-outline" onClick={() => setActiveTab('manage')}>Back to Website Pricing</button>
        </div>

        {websitePricingConfig.history?.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {websitePricingConfig.history.map((hist, idx) => (
              <div key={idx} style={{ background: 'white', border: '1px solid #cbd5e1', borderRadius: '8px', padding: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontWeight: 800, color: '#1e293b', marginBottom: '0.25rem' }}>
                    VERSION {hist.version}
                    {idx === 0 && <span style={{ marginLeft: '1rem', fontSize: '0.75rem', background: '#dcfce7', color: '#166534', padding: '0.2rem 0.5rem', borderRadius: '12px' }}>CURRENT PUBLISHED</span>}
                  </div>
                  <div style={{ color: '#64748b', fontSize: '0.875rem', display: 'flex', gap: '1rem' }}>
                    <span><Clock size={14} style={{ display: 'inline', verticalAlign: 'text-bottom' }} /> {new Date(hist.publishedAt).toLocaleString()}</span>
                    <span>By: {hist.publishedBy}</span>
                  </div>
                  {hist.note && <div style={{ marginTop: '0.5rem', fontSize: '0.85rem', color: '#0f172a' }}>Note: {hist.note}</div>}
                </div>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  {idx !== 0 && (
                    <button className="btn btn-outline" style={{ padding: '0.5rem 1rem' }} onClick={() => { onRollback(idx); setActiveTab('manage'); }}>
                      Roll Back
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ padding: '3rem', textAlign: 'center', background: '#f8fafc', borderRadius: '8px', border: '1px dashed #cbd5e1', color: '#64748b' }}>
            No version history available yet.
          </div>
        )}
      </div>
    );
  }

  // Active Plan Editor Modal
  if (editingPlanKey) {
    const defaultData = internalPricing[editingPlanKey] || {};
    const currentData = localDraft[editingPlanKey] || {
      displayPlanName: defaultData.name || '',
      shortDescription: defaultData.description || '',
      monthlyPrice: defaultData.price || 0,
      originalPrice: defaultData.offerPrice ? defaultData.price : '',
      promotionalPrice: defaultData.offerPrice || '',
      pricingLabel: '',
      offerText: defaultData.offerPrice && defaultData.price ? `Save ${Math.round(((defaultData.price - defaultData.offerPrice) / defaultData.price) * 100)}%` : '',
      offerStartDate: defaultData.offerStartDate || '',
      offerEndDate: defaultData.offerEndDate || '',
      offerActive: defaultData.offerActive || false,
      ctaButtonText: 'Get Started Free',
      publicFeatures: defaultData.features?.map(f => f.name) || [],
      highlightPlan: false,
      displayOrder: 1,
      showOnWebsite: true
    };

    return (
      <WebsitePlanEditor 
        planKey={editingPlanKey}
        planData={currentData}
        internalPlan={defaultData}
        onSave={(data) => handleSavePlanToDraft(editingPlanKey, data)}
        onCancel={() => setEditingPlanKey(null)}
      />
    );
  }

  // Publish Modal
  if (showPublishModal) {
    return (
      <div style={{ padding: '1rem 0' }}>
        <h4 style={{ fontSize: '1.5rem', color: '#1e293b', marginBottom: '1rem' }}>Publish Pricing to Website?</h4>
        <p style={{ color: '#64748b', marginBottom: '2rem' }}>This will make the current pricing content visible on the public Stay Pilot website.</p>
        
        <div style={{ background: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: '8px', padding: '1.5rem', marginBottom: '2rem' }}>
          <h5 style={{ marginBottom: '1rem', color: '#1e293b' }}>Summary of changes (Draft vs Published)</h5>
          {/* Simple diff visualization could go here. For now, just a list of draft plans */}
          <ul style={{ paddingLeft: '1.5rem', color: '#475569' }}>
            {Object.keys(localDraft).map(key => (
              <li key={key} style={{ marginBottom: '0.5rem' }}>
                <strong>{localDraft[key].displayPlanName || key}</strong> 
                {localDraft[key].showOnWebsite ? ' (Enabled)' : ' (Hidden)'} - 
                ₹{localDraft[key].promotionalPrice || localDraft[key].monthlyPrice}/mo
              </li>
            ))}
          </ul>
        </div>

        <div style={{ display: 'flex', gap: '1rem' }}>
          <button className="btn btn-primary" onClick={() => { onPublish(); setShowPublishModal(false); }}>Publish Changes Now</button>
          <button className="btn btn-outline" onClick={() => setShowPublishModal(false)}>Cancel</button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: '1rem 0' }}>
      
      {/* Top Action Bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem', padding: '1.5rem', background: 'white', border: '1px solid #e2e8f0', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
        <div>
          <h4 style={{ margin: 0, fontSize: '1.1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            Website Pricing Status: 
            {hasUnpublishedChanges ? (
              <span style={{ color: '#d97706', display: 'flex', alignItems: 'center', gap: '0.25rem' }}><AlertTriangle size={18} /> Unpublished Changes</span>
            ) : (
              <span style={{ color: '#16a34a', display: 'flex', alignItems: 'center', gap: '0.25rem' }}><CheckCircle size={18} /> Published & Up to Date</span>
            )}
          </h4>
          <p style={{ margin: '0.5rem 0 0 0', color: '#64748b', fontSize: '0.875rem' }}>
            Last Published: {websitePricingConfig.history?.[0]?.publishedAt ? new Date(websitePricingConfig.history[0].publishedAt).toLocaleString() : 'Never'}
          </p>
        </div>
        <div style={{ display: 'flex', gap: '1rem' }}>
          <button className="btn btn-outline" onClick={() => setActiveTab('history')}>
            <History size={16} style={{ marginRight: '0.5rem' }} /> Version History
          </button>
          <a href="/pricing?preview=true" target="_blank" rel="noreferrer" className="btn btn-outline" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Eye size={16} /> Preview Website
          </a>
          <button 
            className="btn btn-primary" 
            disabled={!hasUnpublishedChanges}
            onClick={() => setShowPublishModal(true)}
          >
            Publish to Website
          </button>
        </div>
      </div>

      <div style={{ marginBottom: '1.5rem' }}>
        <h4 style={{ fontSize: '1.25rem', color: '#1e293b', marginBottom: '0.5rem' }}>Available Plans</h4>
        <p style={{ color: '#64748b' }}>Select a plan below to edit how it appears on the public website.</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1.5rem' }}>
        {Object.entries(internalPricing).map(([key, plan]) => {
          const draft = localDraft[key];
          const isPublished = websitePricingConfig.published?.[key]?.showOnWebsite;
          const isDraftEnabled = draft?.showOnWebsite;
          
          return (
            <div key={key} style={{ background: 'white', padding: '1.5rem', borderRadius: '8px', border: '1px solid #cbd5e1' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
                <div>
                  <h5 style={{ margin: '0 0 0.25rem 0', fontSize: '1.1rem', color: '#0f172a' }}>{plan.name || key.toUpperCase()}</h5>
                  <div style={{ fontSize: '0.85rem', color: '#64748b' }}>Internal Base: ₹{plan.price}/mo</div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', alignItems: 'flex-end', fontSize: '0.75rem', fontWeight: 600 }}>
                  {isDraftEnabled ? <span style={{ color: '#0284c7', background: '#e0f2fe', padding: '0.2rem 0.5rem', borderRadius: '4px' }}>Draft: SHOWING</span> : <span style={{ color: '#64748b', background: '#f1f5f9', padding: '0.2rem 0.5rem', borderRadius: '4px' }}>Draft: HIDDEN</span>}
                  {isPublished ? <span style={{ color: '#16a34a', background: '#dcfce7', padding: '0.2rem 0.5rem', borderRadius: '4px' }}>Live: SHOWING</span> : <span style={{ color: '#64748b', background: '#f1f5f9', padding: '0.2rem 0.5rem', borderRadius: '4px' }}>Live: HIDDEN</span>}
                </div>
              </div>
              
              <button className="btn btn-outline" style={{ width: '100%' }} onClick={() => handleEditPlan(key)}>
                Edit Website Content
              </button>
            </div>
          );
        })}
      </div>

    </div>
  );
}

// Sub-component for editing a specific plan
function WebsitePlanEditor({ planKey, planData, internalPlan, onSave, onCancel }) {
  const [data, setData] = useState({ ...planData });

  const handleSave = () => {
    onSave(data);
  };

  return (
    <div style={{ background: 'white', padding: '2rem', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem', borderBottom: '1px solid #f1f5f9', paddingBottom: '1rem' }}>
        <h3 style={{ margin: 0, color: '#1e293b' }}>Website Content for '{planKey}'</h3>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <input 
            type="checkbox" 
            id={`showWebsite-${planKey}`}
            checked={data.showOnWebsite !== false} 
            onChange={e => setData({...data, showOnWebsite: e.target.checked})}
            style={{ width: '18px', height: '18px' }}
          />
          <label htmlFor={`showWebsite-${planKey}`} style={{ fontWeight: 700, color: '#1e293b', cursor: 'pointer' }}>Show on Website</label>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem', marginBottom: '2rem' }}>
        
        {/* LEFT COL */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div className="form-group">
            <label className="form-label">Display Plan Name</label>
            <input type="text" className="form-input" value={data.displayPlanName || ''} onChange={e => setData({...data, displayPlanName: e.target.value})} />
          </div>
          <div className="form-group">
            <label className="form-label">Short Description</label>
            <input type="text" className="form-input" value={data.shortDescription || ''} onChange={e => setData({...data, shortDescription: e.target.value})} placeholder="e.g. Perfect for small properties" />
          </div>
          
          <div style={{ background: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: '8px', padding: '1.25rem', marginBottom: '1.5rem' }}>
            <h5 style={{ margin: '0 0 1rem 0', color: '#0F2C59', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span style={{ fontSize: '1.1rem' }}>💰</span> Synced from Internal Pricing
            </h5>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem', fontSize: '0.9rem' }}>
              <div>
                <div style={{ color: '#64748b', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', marginBottom: '0.25rem' }}>Base Rate</div>
                <div style={{ fontWeight: 800, fontSize: '1.1rem', color: '#1e293b' }}>₹{internalPlan.price || 0}/mo</div>
              </div>
              <div>
                <div style={{ color: '#64748b', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', marginBottom: '0.25rem' }}>Promotional Rate</div>
                <div style={{ fontWeight: 800, fontSize: '1.1rem', color: internalPlan.offerActive && internalPlan.offerPrice ? '#059669' : '#94a3b8' }}>
                  {internalPlan.offerActive && internalPlan.offerPrice ? `₹${internalPlan.offerPrice}/mo` : 'N/A'}
                </div>
              </div>
              
              {internalPlan.offerActive && (
                <>
                  <div>
                    <div style={{ color: '#64748b', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', marginBottom: '0.25rem' }}>Offer Starts</div>
                    <div style={{ fontWeight: 600, color: '#475569' }}>{internalPlan.offerStartDate || 'Not Set'}</div>
                  </div>
                  <div>
                    <div style={{ color: '#64748b', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', marginBottom: '0.25rem' }}>Offer Ends</div>
                    <div style={{ fontWeight: 600, color: '#475569' }}>{internalPlan.offerEndDate || 'Not Set'}</div>
                  </div>
                </>
              )}
            </div>
            {!internalPlan.offerActive && (
              <div style={{ marginTop: '1rem', fontSize: '0.8rem', color: '#64748b', fontStyle: 'italic' }}>
                * Activate the offer in the Internal Pricing tab to display promotional pricing on the website.
              </div>
            )}
          </div>
        </div>

        {/* RIGHT COL */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div className="form-group">
            <label className="form-label">Pricing Label / Badge</label>
            <input type="text" className="form-input" value={data.pricingLabel || ''} onChange={e => setData({...data, pricingLabel: e.target.value})} placeholder="e.g. Most Popular" />
          </div>
          
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div className="form-group">
              <label className="form-label">Display Order</label>
              <input type="number" className="form-input" value={data.displayOrder || ''} onChange={e => setData({...data, displayOrder: e.target.value === '' ? '' : Number(e.target.value)})} />
            </div>
            <div className="form-group">
              <label className="form-label">CTA Button Text</label>
              <input type="text" className="form-input" value={data.ctaButtonText || ''} onChange={e => setData({...data, ctaButtonText: e.target.value})} placeholder="e.g. Choose Plan" />
            </div>
          </div>

          <div className="form-group" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '1rem', background: '#f8fafc', padding: '1rem', borderRadius: '8px' }}>
            <input type="checkbox" id="markPopular" checked={data.highlightPlan || false} onChange={e => setData({...data, highlightPlan: e.target.checked})} />
            <label htmlFor="markPopular" style={{ fontWeight: 600, margin: 0, cursor: 'pointer' }}>Mark as Highlighted / Most Popular</label>
          </div>

          <div style={{ marginTop: '1rem', background: '#f8fafc', padding: '1.25rem', borderRadius: '8px', border: '1px solid #cbd5e1' }}>
            <h5 style={{ margin: '0 0 1rem 0', color: '#0F2C59', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span style={{ fontSize: '1.1rem' }}>✨</span> Features (Synced from Internal)
            </h5>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '0.5rem' }}>
              {(internalPlan.features || []).filter(f => f.enabled !== false).map((feat, idx) => (
                <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: '#f1f5f9', padding: '0.5rem 1rem', borderRadius: '6px' }}>
                  <CheckCircle size={16} color="#059669" />
                  <span style={{ flex: 1, fontSize: '0.85rem', color: '#334155' }}>{feat.name}</span>
                </div>
              ))}
              {(!internalPlan.features || internalPlan.features.filter(f => f.enabled !== false).length === 0) && (
                <div style={{ fontSize: '0.85rem', color: '#64748b', fontStyle: 'italic' }}>No features defined in Internal Pricing Tier.</div>
              )}
            </div>
            <div style={{ fontSize: '0.75rem', color: '#64748b', fontStyle: 'italic', marginTop: '1rem' }}>
              * To edit this list, go to the Internal Pricing Tiers tab.
            </div>
          </div>
        </div>

      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem', borderTop: '1px solid #e2e8f0', paddingTop: '1.5rem' }}>
        <button className="btn btn-outline" onClick={onCancel}>Cancel</button>
        <button className="btn btn-primary" onClick={handleSave}>Save as Draft</button>
      </div>
    </div>
  );
}
