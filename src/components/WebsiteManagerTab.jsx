import React, { useState } from 'react';
import { supabase } from '../lib/supabase';
import { LayoutDashboard, BookOpenCheck, CalendarDays, Wallet, FileText, TrendingUp, Users, CreditCard, Sparkles, CheckCircle2, Save, Plus, Trash2, ArrowUp, ArrowDown } from 'lucide-react';

export default function WebsiteManagerTab({ landingContent, setLandingContent, onSave, isUpdating }) {
  const [isUploading, setIsUploading] = useState(false);

  const handleImageUpload = async (event, type) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      setIsUploading(true);
      const fileExt = file.name.split('.').pop();
      const fileName = `${Math.random().toString(36).substring(2, 15)}_${Date.now()}.${fileExt}`;
      const filePath = `slider/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('public-assets')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      const { data } = supabase.storage.from('public-assets').getPublicUrl(filePath);
      const publicUrl = data.publicUrl;

      const newUrls = type === 'web' 
        ? [...(landingContent.webImages || []), publicUrl]
        : [...(landingContent.mobileImages || []), publicUrl];

      setLandingContent({ 
        ...landingContent, 
        [type === 'web' ? 'webImages' : 'mobileImages']: newUrls 
      });

    } catch (err) {
      alert("Upload failed: " + err.message);
    } finally {
      setIsUploading(false);
      event.target.value = '';
    }
  };

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

      {/* Image Sliders Section */}
      <div className="card" style={{ marginBottom: '2rem', background: 'white', borderRadius: '16px', padding: '2rem' }}>
        <h3 style={{ marginBottom: '1.5rem', color: '#0F2C59', fontWeight: 800, fontFamily: "'Outfit', sans-serif", borderBottom: '1px solid #e2e8f0', paddingBottom: '0.5rem' }}>2. Homepage Slider Images</h3>
        <p style={{ fontSize: '0.85rem', color: '#64748b', marginBottom: '1.5rem' }}>Paste URLs to images to show in the web and mobile mockup placeholders.</p>
        
        <div style={{ display: 'grid', gap: '2rem', gridTemplateColumns: '1fr 1fr' }}>
          {/* Web Images */}
          <div style={{ background: '#f8fafc', padding: '1.5rem', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h4 style={{ margin: 0, color: '#334155', fontWeight: 700, fontSize: '1.1rem' }}>Web Dashboard Images</h4>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <label className="btn btn-sm btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.8rem', cursor: 'pointer' }}>
                  {isUploading ? 'Uploading...' : <><Upload size={14} /> Upload Image</>}
                  <input type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => handleImageUpload(e, 'web')} disabled={isUploading} />
                </label>
                <button className="btn btn-sm btn-outline" onClick={() => setLandingContent({ ...landingContent, webImages: [...(landingContent.webImages || []), ''] })} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.8rem' }}>
                  <Plus size={14} /> Add URL
                </button>
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {(!landingContent.webImages || landingContent.webImages.length === 0) && <span style={{ fontSize: '0.85rem', color: '#94a3b8' }}>No web images added yet.</span>}
              {(landingContent.webImages || []).map((url, idx) => (
                <div key={idx} style={{ display: 'flex', gap: '0.5rem' }}>
                  <input type="text" className="form-input" placeholder="https://example.com/image.png" value={url} onChange={e => {
                    const newUrls = [...landingContent.webImages];
                    newUrls[idx] = e.target.value;
                    setLandingContent({ ...landingContent, webImages: newUrls });
                  }} />
                  <button type="button" onClick={() => {
                    const newUrls = [...landingContent.webImages];
                    newUrls.splice(idx, 1);
                    setLandingContent({ ...landingContent, webImages: newUrls });
                  }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444' }}><Trash2 size={16} /></button>
                </div>
              ))}
            </div>
          </div>

          {/* Mobile Images */}
          <div style={{ background: '#f8fafc', padding: '1.5rem', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h4 style={{ margin: 0, color: '#334155', fontWeight: 700, fontSize: '1.1rem' }}>Mobile App Images</h4>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <label className="btn btn-sm btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.8rem', cursor: 'pointer' }}>
                  {isUploading ? 'Uploading...' : <><Upload size={14} /> Upload Image</>}
                  <input type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => handleImageUpload(e, 'mobile')} disabled={isUploading} />
                </label>
                <button className="btn btn-sm btn-outline" onClick={() => setLandingContent({ ...landingContent, mobileImages: [...(landingContent.mobileImages || []), ''] })} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.8rem' }}>
                  <Plus size={14} /> Add URL
                </button>
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {(!landingContent.mobileImages || landingContent.mobileImages.length === 0) && <span style={{ fontSize: '0.85rem', color: '#94a3b8' }}>No mobile images added yet.</span>}
              {(landingContent.mobileImages || []).map((url, idx) => (
                <div key={idx} style={{ display: 'flex', gap: '0.5rem' }}>
                  <input type="text" className="form-input" placeholder="https://example.com/image.png" value={url} onChange={e => {
                    const newUrls = [...landingContent.mobileImages];
                    newUrls[idx] = e.target.value;
                    setLandingContent({ ...landingContent, mobileImages: newUrls });
                  }} />
                  <button type="button" onClick={() => {
                    const newUrls = [...landingContent.mobileImages];
                    newUrls.splice(idx, 1);
                    setLandingContent({ ...landingContent, mobileImages: newUrls });
                  }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444' }}><Trash2 size={16} /></button>
                </div>
              ))}
            </div>
          </div>
        </div>
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
