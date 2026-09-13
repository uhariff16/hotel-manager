import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useSettingsStore } from '../lib/store';
import { format } from 'date-fns';
import { Calendar, Search, Phone, ArrowRight, MessageCircle, Clock, Trash2, Plus, User, LayoutGrid, List } from 'lucide-react';
import { useNavigate, Link } from 'react-router-dom';
import toast from 'react-hot-toast';

export default function EnquiriesBoard() {
  const { activeResortId, resorts } = useSettingsStore();
  const navigate = useNavigate();
  
  const [enquiries, setEnquiries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [viewMode, setViewMode] = useState('grid');

  const fetchEnquiries = async () => {
    if (!activeResortId) return;
    try {
      const { data, error } = await supabase
        .from('enquiries')
        .select('*')
        .eq('resort_id', activeResortId)
        .neq('status', 'Converted')
        .neq('status', 'Archived')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setEnquiries(data || []);
    } catch (err) {
      console.error(err);
      toast.error('Failed to load enquiries');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEnquiries();
  }, [activeResortId]);

  const handleConvertToBooking = async (enq) => {
    try {
      const { error } = await supabase
        .from('enquiries')
        .update({ status: 'Converted' })
        .eq('id', enq.id);
      
      if (error) throw error;
      
      const isAgent = Boolean(enq.guest_name && enq.phone_number);
      
      navigate('/bookings/new', {
        state: {
          prefill: {
            guest_name: isAgent ? '' : enq.guest_name,
            phone_number: isAgent ? '' : enq.phone_number,
            booking_source: isAgent ? 'Agent' : 'Direct',
            agent_name: isAgent ? enq.guest_name : '',
            agent_phone: isAgent ? enq.phone_number : '',
            notes: enq.notes
          }
        }
      });
    } catch (err) {
      console.error(err);
      toast.error('Failed to convert enquiry');
    }
  };

  const handleArchive = async (id) => {
    if (!window.confirm('Are you sure you want to archive this enquiry?')) return;
    try {
      const { error } = await supabase.from('enquiries').update({ status: 'Archived' }).eq('id', id);
      if (error) throw error;
      toast.success('Archived');
      fetchEnquiries();
    } catch (e) {
      console.error(e);
      toast.error('Failed to archive');
    }
  };

  const openWhatsApp = (enquiry) => {
    if (!enquiry.phone_number) return;
    const cleanPhone = enquiry.phone_number.replace(/[^0-9]/g, '');
    let message = "Please confirm this enquiry: " + (enquiry.notes || "");
    window.open(`https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`, '_blank');
  };

  const filtered = enquiries.filter(e => 
    (e.guest_name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (e.phone_number || '').includes(searchTerm) ||
    (e.notes || '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="page-container">
      <div style={{ display: 'flex', flexDirection: 'row', flexWrap: 'wrap', gap: '1.5rem', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '2rem' }}>
        <div>
          <h1 style={{ fontSize: '1.85rem', fontWeight: 800, color: 'var(--text-main)', margin: '0 0 0.5rem 0' }}>Enquiries Board</h1>
          <p style={{ color: 'var(--text-muted)', margin: 0, fontSize: '0.95rem' }}>Track and convert quick availability requests</p>
        </div>
        
        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'center', flex: '1 1 auto', justifyContent: 'flex-end' }}>
          
          <div style={{ display: 'flex', background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: '2rem', overflow: 'hidden' }}>
            <button 
              onClick={() => setViewMode('grid')}
              style={{ padding: '0.65rem 1rem', background: viewMode === 'grid' ? 'rgba(16, 185, 129, 0.1)' : 'transparent', color: viewMode === 'grid' ? 'var(--primary)' : 'var(--text-muted)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', transition: 'all 0.2s' }}
              title="Grid View"
            >
              <LayoutGrid size={18} />
            </button>
            <button 
              onClick={() => setViewMode('list')}
              style={{ padding: '0.65rem 1rem', background: viewMode === 'list' ? 'rgba(16, 185, 129, 0.1)' : 'transparent', color: viewMode === 'list' ? 'var(--primary)' : 'var(--text-muted)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', transition: 'all 0.2s' }}
              title="List View"
            >
              <List size={18} />
            </button>
          </div>

          <div style={{ position: 'relative', flex: '1 1 250px', maxWidth: '350px' }}>
            <Search size={18} style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
            <input
              type="text"
              placeholder="Search enquiries..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="premium-input"
              style={{ paddingLeft: '2.75rem', width: '100%', borderRadius: '2rem' }}
            />
          </div>
          <Link to="/enquiries/quick" className="btn btn-primary" style={{ whiteSpace: 'nowrap', borderRadius: '2rem', padding: '0.75rem 1.5rem' }}>
            <Plus size={20} />
            New Enquiry
          </Link>
        </div>
      </div>

      {loading ? (
        <div style={{ padding: '3rem', textAlign: 'center' }}>Loading enquiries...</div>
      ) : filtered.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">📝</div>
          <h3>No active enquiries</h3>
          <p>Long-press the mobile app icon to log a new quick enquiry.</p>
        </div>
      ) : (
        viewMode === 'grid' ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '1.5rem' }}>
            {filtered.map(enq => (
              <div key={enq.id} className="card" style={{ display: 'flex', flexDirection: 'column', height: '100%', padding: 0, overflow: 'hidden' }}>
                <div style={{ padding: '1.25rem', borderBottom: '1px solid var(--border)', background: 'var(--bg-secondary)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <h3 style={{ fontSize: '1.15rem', fontWeight: 700, margin: '0 0 0.5rem 0', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <User size={18} color="var(--text-muted)" />
                        {enq.guest_name || 'Unknown Guest'}
                      </h3>
                      {enq.phone_number && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-muted)', fontSize: '0.95rem' }}>
                          <Phone size={14} />
                          {enq.phone_number}
                        </div>
                      )}
                    </div>
                    <span className="badge badge-primary">{enq.status || 'New'}</span>
                  </div>
                </div>

                <div style={{ padding: '1.25rem', flex: 1 }}>
                  {enq.quick_date_tag && (
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', background: 'var(--primary)', color: 'white', padding: '0.35rem 0.75rem', borderRadius: '2rem', fontSize: '0.85rem', fontWeight: 600, marginBottom: '1rem' }}>
                      <Calendar size={14} />
                      {enq.quick_date_tag}
                    </div>
                  )}
                  
                  <p style={{ margin: 0, fontSize: '1rem', whiteSpace: 'pre-wrap', color: 'var(--text-main)', lineHeight: 1.5 }}>
                    {enq.notes || 'No additional details provided.'}
                  </p>
                  
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: '1.25rem' }}>
                    <Clock size={14} />
                    Logged {format(new Date(enq.created_at), 'MMM d, h:mm a')}
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '0', borderTop: '1px solid var(--border)' }}>
                  {enq.phone_number && (
                    <button 
                      onClick={() => openWhatsApp(enq)}
                      style={{ flex: 1, padding: '1rem', background: 'var(--bg-secondary)', border: 'none', borderRight: '1px solid var(--border)', color: '#25D366', fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', cursor: 'pointer' }}
                    >
                      <MessageCircle size={20} />
                      Chat
                    </button>
                  )}
                  <button 
                    onClick={() => handleConvertToBooking(enq)}
                    style={{ flex: 2, padding: '1rem', background: 'var(--bg-secondary)', border: 'none', borderRight: '1px solid var(--border)', color: 'var(--primary)', fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', cursor: 'pointer' }}
                  >
                    <ArrowRight size={20} />
                    Book
                  </button>
                  <button 
                    onClick={() => handleArchive(enq.id)}
                    style={{ flex: '0 0 auto', padding: '1rem', background: 'var(--bg-secondary)', border: 'none', color: 'var(--danger)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
                    title="Archive"
                  >
                    <Trash2 size={20} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                <thead style={{ background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border)' }}>
                  <tr>
                    <th style={{ padding: '1rem 1.5rem', fontSize: '0.8rem', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 700 }}>Guest / Agent</th>
                    <th style={{ padding: '1rem 1.5rem', fontSize: '0.8rem', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 700 }}>Contact</th>
                    <th style={{ padding: '1rem 1.5rem', fontSize: '0.8rem', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 700 }}>Dates</th>
                    <th style={{ padding: '1rem 1.5rem', fontSize: '0.8rem', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 700 }}>Notes</th>
                    <th style={{ padding: '1rem 1.5rem', fontSize: '0.8rem', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 700 }}>Logged</th>
                    <th style={{ padding: '1rem 1.5rem', fontSize: '0.8rem', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 700, textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(enq => (
                    <tr key={enq.id} style={{ borderBottom: '1px solid var(--border)', transition: 'all 0.2s' }}>
                      <td style={{ padding: '1.25rem 1.5rem' }}>
                        <div style={{ fontWeight: 600, color: 'var(--text-main)' }}>{enq.guest_name || 'Unknown'}</div>
                        <div style={{ fontSize: '0.8rem', color: 'var(--primary)', marginTop: '0.25rem', fontWeight: 600 }}>{enq.status || 'New'}</div>
                      </td>
                      <td style={{ padding: '1.25rem 1.5rem', color: 'var(--text-muted)' }}>
                        {enq.phone_number ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <Phone size={14} />
                            {enq.phone_number}
                          </div>
                        ) : '-'}
                      </td>
                      <td style={{ padding: '1.25rem 1.5rem' }}>
                        {enq.quick_date_tag ? (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', background: 'var(--bg-color)', border: '1px solid var(--border)', color: 'var(--text-main)', padding: '0.25rem 0.6rem', borderRadius: '1rem', fontSize: '0.8rem', fontWeight: 600 }}>
                            <Calendar size={12} />
                            {enq.quick_date_tag}
                          </span>
                        ) : '-'}
                      </td>
                      <td style={{ padding: '1.25rem 1.5rem', maxWidth: '300px' }}>
                        <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--text-main)', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                          {enq.notes || '-'}
                        </p>
                      </td>
                      <td style={{ padding: '1.25rem 1.5rem', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                        {format(new Date(enq.created_at), 'MMM d')}
                        <div style={{ fontSize: '0.75rem', marginTop: '0.2rem' }}>{format(new Date(enq.created_at), 'h:mm a')}</div>
                      </td>
                      <td style={{ padding: '1.25rem 1.5rem', textAlign: 'right' }}>
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
                          {enq.phone_number && (
                            <button 
                              onClick={() => openWhatsApp(enq)}
                              style={{ padding: '0.5rem', background: 'rgba(37, 211, 102, 0.1)', border: 'none', color: '#25D366', borderRadius: '0.5rem', cursor: 'pointer' }}
                              title="Chat on WhatsApp"
                            >
                              <MessageCircle size={16} />
                            </button>
                          )}
                          <button 
                            onClick={() => handleConvertToBooking(enq)}
                            style={{ padding: '0.5rem 1rem', background: 'var(--primary)', border: 'none', color: 'white', borderRadius: '0.5rem', fontWeight: 600, fontSize: '0.85rem', display: 'inline-flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}
                          >
                            <ArrowRight size={16} />
                            Book
                          </button>
                          <button 
                            onClick={() => handleArchive(enq.id)}
                            style={{ padding: '0.5rem', background: 'rgba(239, 68, 68, 0.1)', border: 'none', color: 'var(--danger)', borderRadius: '0.5rem', cursor: 'pointer' }}
                            title="Archive"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )
      )}
    </div>
  );
}