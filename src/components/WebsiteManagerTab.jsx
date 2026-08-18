import React, { useState } from 'react';
import { LayoutDashboard, BookOpenCheck, CalendarDays, Wallet, FileText, TrendingUp, Users, CreditCard, Sparkles, CheckCircle2, Save, Plus, Trash2, ArrowUp, ArrowDown } from 'lucide-react';

export default function WebsiteManagerTab({ landingContent, setLandingContent, onSave, isUpdating }) {

  const handleUpdateHero = (field, value) => {
    setLandingContent({ ...landingContent, [field]: value });
  };

  const handleUpdateDeepDive = (idx, field, value) => {
    const newDeepDives = [...(landingContent.deepDives || [])];
    newDeepDives[idx] = { ...newDeepDives[idx], [field]: value };
    setLandingContent({ ...landingContent, deepDives: newDeepDives });
  };

  const handleUpdateDeepDiveBullet = (diveIdx, bulletIdx, value) => {
    const newDeepDives = [...(landingContent.deepDives || [])];
    newDeepDives[diveIdx].bullets[bulletIdx] = value;
    setLandingContent({ ...landingContent, deepDives: newDeepDives });
  };

  const addFeature = () => {
    setLandingContent({ 
      ...landingContent, 
      features: [...(landingContent.features || []), { title: 'New Feature', description: 'Feature description' }] 
    });
  };

  const updateFeature = (idx, field, value) => {
    const newFeats = [...(landingContent.features || [])];
    newFeats[idx] = { ...newFeats[idx], [field]: value };
    setLandingContent({ ...landingContent, features: newFeats });
  };

  const moveFeature = (idx, direction) => {
    const newFeats = [...(landingContent.features || [])];
    if (direction === 'up' && idx > 0) {
      [newFeats[idx - 1], newFeats[idx]] = [newFeats[idx], newFeats[idx - 1]];
    } else if (direction === 'down' && idx < newFeats.length - 1) {
      [newFeats[idx + 1], newFeats[idx]] = [newFeats[idx], newFeats[idx + 1]];
    }
    setLandingContent({ ...landingContent, features: newFeats });
  };

  const deleteFeature = (idx) => {
    const newFeats = (landingContent.features || []).filter((_, i) => i !== idx);
    setLandingContent({ ...landingContent, features: newFeats });
  };

  return (
    <div style={{ animation: 'fadeIn 0.2s ease-out' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <div>
          <h2 style={{ margin: 0, color: '#0F2C59', fontWeight: 800, fontFamily: "'Outfit', sans-serif" }}>Website Content Manager</h2>
          <p style={{ color: 'var(--text-muted)', margin: 0, fontSize: '0.9rem' }}>Customize text and features across the public landing page.</p>
        </div>
        <button className="btn btn-primary" onClick={onSave} disabled={isUpdating} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 700 }}>
          <Save size={18} /> {isUpdating ? 'Saving...' : 'Save & Publish'}
        </button>
      </div>

      {/* Hero Section */}
      <div className="card" style={{ marginBottom: '2rem', background: 'white', borderRadius: '16px', padding: '2rem' }}>
        <h3 style={{ marginBottom: '1.5rem', color: '#0F2C59', fontWeight: 800, fontFamily: "'Outfit', sans-serif", borderBottom: '1px solid #e2e8f0', paddingBottom: '0.5rem' }}>1. Hero Section</h3>
        <div style={{ display: 'grid', gap: '1.5rem' }}>
          <div className="form-group">
            <label className="form-label">Main Headline (H1)</label>
            <input type="text" className="form-input" value={landingContent.headline || ''} onChange={e => handleUpdateHero('headline', e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">Sub-headline Highlight</label>
            <input type="text" className="form-input" value={landingContent.subheadline || ''} onChange={e => handleUpdateHero('subheadline', e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">Hero Description Paragraph</label>
            <textarea className="form-input" style={{ minHeight: '80px', resize: 'vertical' }} value={landingContent.description || ''} onChange={e => handleUpdateHero('description', e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">Target Audience Text</label>
            <input type="text" className="form-input" value={landingContent.target || ''} onChange={e => handleUpdateHero('target', e.target.value)} />
          </div>
        </div>
      </div>

      {/* Deep Dives Section */}
      <div className="card" style={{ marginBottom: '2rem', background: 'white', borderRadius: '16px', padding: '2rem' }}>
        <h3 style={{ marginBottom: '1.5rem', color: '#0F2C59', fontWeight: 800, fontFamily: "'Outfit', sans-serif", borderBottom: '1px solid #e2e8f0', paddingBottom: '0.5rem' }}>2. Feature Deep Dives</h3>
        <p style={{ fontSize: '0.85rem', color: '#64748b', marginBottom: '1.5rem' }}>These are the large, alternating sections with screenshots on the homepage.</p>
        
        {(landingContent.deepDives || []).map((dive, idx) => (
          <div key={idx} style={{ background: '#f8fafc', padding: '1.5rem', borderRadius: '12px', border: '1px solid #e2e8f0', marginBottom: '1.5rem' }}>
            <h4 style={{ margin: '0 0 1rem', color: '#334155', fontWeight: 700, fontSize: '1.1rem' }}>Section {idx + 1} ({dive.image})</h4>
            
            <div style={{ display: 'grid', gap: '1rem', gridTemplateColumns: '1fr 1fr' }}>
              <div className="form-group">
                <label className="form-label" style={{ fontSize: '0.8rem' }}>Small Tagline</label>
                <input type="text" className="form-input" value={dive.tagline || ''} onChange={e => handleUpdateDeepDive(idx, 'tagline', e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label" style={{ fontSize: '0.8rem' }}>Main Title</label>
                <input type="text" className="form-input" value={dive.title || ''} onChange={e => handleUpdateDeepDive(idx, 'title', e.target.value)} />
              </div>
              <div className="form-group" style={{ gridColumn: 'span 2' }}>
                <label className="form-label" style={{ fontSize: '0.8rem' }}>Description Paragraph</label>
                <textarea className="form-input" style={{ minHeight: '60px' }} value={dive.description || ''} onChange={e => handleUpdateDeepDive(idx, 'description', e.target.value)} />
              </div>
            </div>

            <div style={{ marginTop: '1rem' }}>
              <label className="form-label" style={{ fontSize: '0.8rem', color: '#059669' }}>Bullet Points</label>
              <div style={{ display: 'grid', gap: '0.5rem' }}>
                {(dive.bullets || []).map((bullet, bIdx) => (
                  <input key={bIdx} type="text" className="form-input" style={{ background: 'white' }} value={bullet} onChange={e => handleUpdateDeepDiveBullet(idx, bIdx, e.target.value)} />
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Features Grid */}
      <div className="card" style={{ marginBottom: '2rem', background: 'white', borderRadius: '16px', padding: '2rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #e2e8f0', paddingBottom: '0.5rem', marginBottom: '1.5rem' }}>
          <h3 style={{ margin: 0, color: '#0F2C59', fontWeight: 800, fontFamily: "'Outfit', sans-serif" }}>3. Features Grid</h3>
          <button className="btn btn-sm btn-outline" onClick={addFeature} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.8rem' }}>
            <Plus size={14} /> Add Feature
          </button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1.5rem' }}>
          {(landingContent.features || []).map((feature, idx) => (
            <div key={idx} style={{ background: '#f8fafc', padding: '1.25rem', borderRadius: '12px', border: '1px solid #cbd5e1', position: 'relative' }}>
              <div style={{ position: 'absolute', top: '10px', right: '10px', display: 'flex', gap: '0.25rem' }}>
                <button type="button" onClick={() => moveFeature(idx, 'up')} disabled={idx === 0} style={{ background: 'none', border: 'none', cursor: idx === 0 ? 'default' : 'pointer', color: idx === 0 ? '#cbd5e1' : '#64748b' }}><ArrowUp size={16} /></button>
                <button type="button" onClick={() => moveFeature(idx, 'down')} disabled={idx === (landingContent.features?.length - 1)} style={{ background: 'none', border: 'none', cursor: idx === (landingContent.features?.length - 1) ? 'default' : 'pointer', color: idx === (landingContent.features?.length - 1) ? '#cbd5e1' : '#64748b' }}><ArrowDown size={16} /></button>
                <button type="button" onClick={() => deleteFeature(idx)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', marginLeft: '0.5rem' }}><Trash2 size={16} /></button>
              </div>

              <div className="form-group" style={{ marginBottom: '0.75rem' }}>
                <label className="form-label" style={{ fontSize: '0.75rem' }}>Title</label>
                <input type="text" className="form-input" style={{ padding: '0.4rem 0.6rem', fontSize: '0.9rem' }} value={feature.title || ''} onChange={e => updateFeature(idx, 'title', e.target.value)} />
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label" style={{ fontSize: '0.75rem' }}>Description</label>
                <textarea className="form-input" style={{ padding: '0.4rem 0.6rem', fontSize: '0.9rem', minHeight: '60px' }} value={feature.description || ''} onChange={e => updateFeature(idx, 'description', e.target.value)} />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Comparison Section */}
      <div className="card" style={{ marginBottom: '2rem', background: 'white', borderRadius: '16px', padding: '2rem' }}>
        <h3 style={{ marginBottom: '1.5rem', color: '#0F2C59', fontWeight: 800, fontFamily: "'Outfit', sans-serif", borderBottom: '1px solid #e2e8f0', paddingBottom: '0.5rem' }}>4. Call to Action / Comparison</h3>
        <div style={{ display: 'grid', gap: '1.5rem' }}>
          <div className="form-group">
            <label className="form-label">Comparison Headline</label>
            <input type="text" className="form-input" value={landingContent.comparisonHeadline || ''} onChange={e => handleUpdateHero('comparisonHeadline', e.target.value)} placeholder="e.g. Stop Managing Your Property in Pieces." />
          </div>
          <div className="form-group">
            <label className="form-label">Comparison Description</label>
            <textarea className="form-input" style={{ minHeight: '60px' }} value={landingContent.comparisonDescription || ''} onChange={e => handleUpdateHero('comparisonDescription', e.target.value)} />
          </div>
        </div>
      </div>

    </div>
  );
}
