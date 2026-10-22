import React, { useState } from 'react';
import { supabase } from '../lib/supabase';
import { LayoutDashboard, BookOpenCheck, CalendarDays, Wallet, FileText, TrendingUp, Users, CreditCard, Sparkles, CheckCircle2, Save, Plus, Trash2, ArrowUp, ArrowDown, Upload, ExternalLink, Image as ImageIcon } from 'lucide-react';

export default function WebsiteManagerTab({ landingContent, setLandingContent, onSave, isUpdating }) {
  const [isUploading, setIsUploading] = useState(false);
  const [uploadNotice, setUploadNotice] = useState(null);

  const handleImageUpload = async (event, type) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      setIsUploading(true);
      setUploadNotice(null);
      const fileExt = file.name.split('.').pop();
      const fileName = `${Math.random().toString(36).substring(2, 15)}_${Date.now()}.${fileExt}`;
      const filePath = `slider/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('public-assets')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      const { data } = supabase.storage.from('public-assets').getPublicUrl(filePath);
      const publicUrl = data.publicUrl;

      const targetKey = type === 'web' ? 'webImages' : 'mobileImages';
      const newUrls = [...(landingContent[targetKey] || []), publicUrl];

      setLandingContent({ 
        ...landingContent, 
        [targetKey]: newUrls 
      });

      setUploadNotice({
        type: 'success',
        message: `Image uploaded successfully! Remember to click "Save & Publish" to update staypilot.co.in.`
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

  const renderImageList = (type) => {
    const isWeb = type === 'web';
    const key = isWeb ? 'webImages' : 'mobileImages';
    const list = landingContent[key] || [];

    return (
      <div style={{ background: '#f8fafc', padding: '1.25rem', borderRadius: '12px', border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
          <div>
            <h4 style={{ margin: 0, color: '#334155', fontWeight: 700, fontSize: '1.05rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <ImageIcon size={18} color="var(--primary, #0F2C59)" />
              {isWeb ? 'Web Dashboard Images' : 'Mobile App Images'}
            </h4>
            <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
              {list.length} {list.length === 1 ? 'image' : 'images'} configured
            </span>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <label className="btn btn-sm btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.8rem', cursor: isUploading ? 'not-allowed' : 'pointer' }}>
              {isUploading ? 'Uploading...' : <><Upload size={14} /> Upload Image</>}
              <input type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => handleImageUpload(e, type)} disabled={isUploading} />
            </label>
            <button 
              type="button" 
              className="btn btn-sm btn-outline" 
              onClick={() => setLandingContent({ ...landingContent, [key]: [...list, ''] })} 
              style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.8rem' }}
            >
              <Plus size={14} /> Add URL
            </button>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {list.length === 0 && (
            <div style={{ padding: '1.5rem', textAlign: 'center', background: '#ffffff', borderRadius: '8px', border: '1px dashed #cbd5e1', color: '#94a3b8', fontSize: '0.85rem' }}>
              No {isWeb ? 'web' : 'mobile'} images added yet. Click <strong>Upload Image</strong> or <strong>Add URL</strong> to get started.
            </div>
          )}
          {list.map((url, idx) => (
            <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: '#ffffff', padding: '0.5rem 0.75rem', borderRadius: '8px', border: '1px solid #e2e8f0', boxShadow: '0 1px 2px rgba(0,0,0,0.03)' }}>
              {/* Thumbnail Preview */}
              {url && url.trim() ? (
                <a href={url} target="_blank" rel="noopener noreferrer" title="Click to view full image in new tab" style={{ flexShrink: 0, display: 'block', position: 'relative' }}>
                  <img 
                    src={url} 
                    alt={`${isWeb ? 'Web' : 'Mobile'} Slide ${idx + 1}`} 
                    style={{ width: '56px', height: '40px', objectFit: 'cover', borderRadius: '4px', border: '1px solid #cbd5e1', display: 'block', background: '#f1f5f9' }} 
                    onError={(e) => { e.target.style.display = 'none'; }}
                  />
                  <div style={{ position: 'absolute', bottom: 1, right: 1, background: 'rgba(0,0,0,0.6)', borderRadius: '2px', padding: '1px 2px', lineHeight: 1 }}>
                    <ExternalLink size={10} color="#ffffff" />
                  </div>
                </a>
              ) : (
                <div style={{ width: '56px', height: '40px', background: '#f1f5f9', borderRadius: '4px', border: '1px dashed #cbd5e1', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', color: '#94a3b8', flexShrink: 0 }}>
                  Empty
                </div>
              )}

              {/* URL input */}
              <input 
                type="text" 
                className="form-input" 
                placeholder="https://example.com/image.png" 
                value={url} 
                style={{ flex: 1, fontSize: '0.85rem', margin: 0 }}
                onChange={e => {
                  const newUrls = [...list];
                  newUrls[idx] = e.target.value;
                  setLandingContent({ ...landingContent, [key]: newUrls });
                }} 
              />

              {/* Actions: Reorder and Delete */}
              <div style={{ display: 'flex', gap: '0.2rem', alignItems: 'center', flexShrink: 0 }}>
                <button 
                  type="button" 
                  onClick={() => {
                    if (idx > 0) {
                      const newUrls = [...list];
                      [newUrls[idx - 1], newUrls[idx]] = [newUrls[idx], newUrls[idx - 1]];
                      setLandingContent({ ...landingContent, [key]: newUrls });
                    }
                  }}
                  disabled={idx === 0}
                  title="Move slide up"
                  style={{ background: 'none', border: 'none', cursor: idx === 0 ? 'default' : 'pointer', color: idx === 0 ? '#cbd5e1' : '#64748b', padding: '4px', display: 'flex', alignItems: 'center' }}
                >
                  <ArrowUp size={15} />
                </button>
                <button 
                  type="button" 
                  onClick={() => {
                    if (idx < list.length - 1) {
                      const newUrls = [...list];
                      [newUrls[idx + 1], newUrls[idx]] = [newUrls[idx], newUrls[idx + 1]];
                      setLandingContent({ ...landingContent, [key]: newUrls });
                    }
                  }}
                  disabled={idx === list.length - 1}
                  title="Move slide down"
                  style={{ background: 'none', border: 'none', cursor: idx === list.length - 1 ? 'default' : 'pointer', color: idx === list.length - 1 ? '#cbd5e1' : '#64748b', padding: '4px', display: 'flex', alignItems: 'center' }}
                >
                  <ArrowDown size={15} />
                </button>
                <button 
                  type="button" 
                  title="Remove image"
                  onClick={() => {
                    const newUrls = [...list];
                    newUrls.splice(idx, 1);
                    setLandingContent({ ...landingContent, [key]: newUrls });
                  }} 
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', padding: '4px', display: 'flex', alignItems: 'center', marginLeft: '0.25rem' }}
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div style={{ animation: 'fadeIn 0.2s ease-out' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h2 style={{ margin: 0, color: '#0F2C59', fontWeight: 800, fontFamily: "'Outfit', sans-serif" }}>Website Content Manager</h2>
          <p style={{ color: 'var(--text-muted)', margin: 0, fontSize: '0.9rem' }}>Customize text, slider mockups, and features across the public landing page (staypilot.co.in).</p>
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
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #e2e8f0', paddingBottom: '0.75rem', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '0.75rem' }}>
          <div>
            <h3 style={{ margin: 0, color: '#0F2C59', fontWeight: 800, fontFamily: "'Outfit', sans-serif" }}>2. Homepage Slider Images</h3>
            <p style={{ fontSize: '0.85rem', color: '#64748b', margin: '0.25rem 0 0 0' }}>Upload screenshots or paste image URLs to showcase in the Web and Mobile mockup placeholders.</p>
          </div>
          <button 
            type="button" 
            className="btn btn-primary" 
            onClick={onSave} 
            disabled={isUpdating} 
            style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontWeight: 700, fontSize: '0.85rem' }}
          >
            <Save size={15} /> {isUpdating ? 'Saving...' : 'Save & Publish Slider Images'}
          </button>
        </div>

        {uploadNotice && (
          <div style={{ background: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: '8px', padding: '0.75rem 1rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem', gap: '0.75rem', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#065f46', fontSize: '0.85rem' }}>
              <CheckCircle2 size={18} color="#059669" />
              <span>{uploadNotice.message}</span>
            </div>
            <button className="btn btn-sm btn-primary" onClick={onSave} disabled={isUpdating} style={{ fontWeight: 700, whiteSpace: 'nowrap' }}>
              <Save size={14} /> {isUpdating ? 'Saving...' : 'Save & Publish Now'}
            </button>
          </div>
        )}
        
        <div style={{ display: 'grid', gap: '1.5rem', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))' }}>
          {renderImageList('web')}
          {renderImageList('mobile')}
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

      {/* Bottom Save & Publish Bar */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '1rem', marginTop: '1.5rem', marginBottom: '3rem', padding: '1.25rem', background: '#f8fafc', borderRadius: '12px', border: '1px solid #e2e8f0', flexWrap: 'wrap' }}>
        <span style={{ fontSize: '0.85rem', color: '#64748b' }}>Make sure to save & publish your changes so they reflect immediately on staypilot.co.in</span>
        <button 
          type="button" 
          className="btn btn-primary" 
          onClick={onSave} 
          disabled={isUpdating} 
          style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 700, padding: '0.75rem 1.75rem', fontSize: '0.95rem' }}
        >
          <Save size={18} /> {isUpdating ? 'Saving...' : 'Save & Publish All Website Content'}
        </button>
      </div>

    </div>
  );
}
