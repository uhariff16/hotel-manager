import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useSettingsStore } from '../lib/store';
import { useNavigate } from 'react-router-dom';
import { Check, ArrowLeft, Phone, User, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';

export default function QuickEnquiryMobile() {
  const { activeResortId, profile } = useSettingsStore();
  const navigate = useNavigate();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [agents, setAgents] = useState([]);
  const [agentPhones, setAgentPhones] = useState({});
  
  const [formData, setFormData] = useState({
    guest_name: '',
    phone_number: '',
    quick_date_tag: '',
    notes: ''
  });

  const quickDates = ['Today', 'Tomorrow', 'This Weekend', 'Next Weekend'];

  useEffect(() => {
    if (profile?.tenant_id) {
      supabase.from('agents').select('name, phone').eq('tenant_id', profile.tenant_id)
        .then(({ data, error }) => {
          if (!error && data) {
            const map = {};
            data.forEach(a => { if (a.name) map[a.name] = a.phone || ''; });
            setAgentPhones(map);
            setAgents(data.map(a => a.name).sort());
          }
        });
    }
  }, [profile?.tenant_id]);

  const handleNameChange = (e) => {
    const val = e.target.value;
    const updates = { guest_name: val };
    if (agentPhones[val]) {
      updates.phone_number = agentPhones[val];
    }
    setFormData(prev => ({ ...prev, ...updates }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!activeResortId) {
      toast.error('No active resort selected');
      return;
    }

    if (!formData.notes && !formData.guest_name) {
      toast.error('Please enter at least a name or a note');
      return;
    }

    setIsSubmitting(true);
    
    try {
      if (formData.guest_name && formData.phone_number && profile?.tenant_id) {
        supabase.from('agents').upsert({
          tenant_id: profile.tenant_id,
          name: formData.guest_name.trim(),
          phone: formData.phone_number.trim()
        }, { onConflict: 'tenant_id,name' }).then(({ error }) => {
          if (error) console.error('Auto-upsert agent error:', error);
        });
      }

      const { error } = await supabase.from('enquiries').insert([{
        resort_id: activeResortId,
        guest_name: formData.guest_name,
        phone_number: formData.phone_number,
        quick_date_tag: formData.quick_date_tag,
        notes: formData.notes,
        status: 'New'
      }]);

      if (error) throw error;
      
      toast.success('Enquiry saved!');
      navigate('/enquiries');
      
    } catch (err) {
      console.error(err);
      toast.error('Failed to save enquiry');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="page-container">
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <button 
            onClick={() => navigate(-1)}
            className="btn btn-outline"
            style={{ padding: '0.5rem', borderRadius: '50%' }}
          >
            <ArrowLeft size={20} />
          </button>
          <div>
            <h1 className="page-title">Quick Enquiry</h1>
            <p className="page-subtitle">Instantly log a new enquiry or call</p>
          </div>
        </div>
      </div>

      <div className="card" style={{ maxWidth: '600px', margin: '0 auto' }}>
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          
          <div className="form-group">
            <label className="premium-label">Agent or Guest Name</label>
            <div style={{ position: 'relative' }}>
              <User size={18} style={{ position: 'absolute', left: '1rem', top: '1.1rem', color: 'var(--text-secondary)' }} />
              <input 
                type="text" 
                list="agentsList"
                placeholder="Start typing name..." 
                className="premium-input"
                style={{ paddingLeft: '2.5rem', width: '100%' }}
                value={formData.guest_name}
                onChange={handleNameChange}
                autoFocus
              />
              <datalist id="agentsList">
                {agents.map(a => <option key={a} value={a} />)}
              </datalist>
            </div>
          </div>

          <div className="form-group">
            <label className="premium-label">Phone Number</label>
            <div style={{ position: 'relative' }}>
              <Phone size={18} style={{ position: 'absolute', left: '1rem', top: '1.1rem', color: 'var(--text-secondary)' }} />
              <input 
                type="tel" 
                placeholder="Phone Number" 
                className="premium-input"
                style={{ paddingLeft: '2.5rem', width: '100%' }}
                value={formData.phone_number}
                onChange={e => setFormData({...formData, phone_number: e.target.value})}
              />
            </div>
          </div>

          <div className="form-group">
            <label className="premium-label">Quick Dates</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
              {quickDates.map(date => (
                <button
                  type="button"
                  key={date}
                  onClick={() => setFormData({...formData, quick_date_tag: formData.quick_date_tag === date ? '' : date})}
                  style={{
                    padding: '0.5rem 1rem',
                    borderRadius: '2rem',
                    border: formData.quick_date_tag === date ? '2px solid var(--primary)' : '1px solid var(--border)',
                    background: formData.quick_date_tag === date ? 'rgba(16, 185, 129, 0.1)' : 'var(--bg-secondary)',
                    color: formData.quick_date_tag === date ? 'var(--primary)' : 'var(--text-main)',
                    fontWeight: 600,
                    fontSize: '0.9rem',
                    transition: 'all 0.2s'
                  }}
                >
                  {date}
                </button>
              ))}
            </div>
          </div>

          <div className="form-group">
            <label className="premium-label">Details (Use Microphone to speak)</label>
            <textarea 
              placeholder="E.g. Needs 2 rooms, flexible dates, checking for group discount..."
              className="premium-input"
              style={{ width: '100%', resize: 'vertical', minHeight: '120px' }}
              value={formData.notes}
              onChange={e => setFormData({...formData, notes: e.target.value})}
            />
          </div>

          <button 
            type="submit" 
            disabled={isSubmitting}
            className="btn btn-primary"
            style={{ width: '100%', height: '54px', fontSize: '1.1rem', marginTop: '0.5rem', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.5rem' }}
          >
            {isSubmitting ? <Loader2 className="animate-spin" size={20} /> : <Check size={20} />}
            {isSubmitting ? 'Saving...' : 'Save Enquiry'}
          </button>

        </form>
      </div>
    </div>
  );
}