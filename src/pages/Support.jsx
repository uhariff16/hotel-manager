import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Mail, MessageSquare, Send, CheckCircle, Plus, AlertCircle, Clock, ArrowLeft, Search, X } from 'lucide-react';
import { useSettingsStore } from '../lib/store';
import toast from 'react-hot-toast';

const demoTickets = [
  {
    id: 'demo-1',
    ticket_number: 104,
    subject: 'Unable to update Booking.com reservation after changing room availability in resort manager',
    status: 'open',
    tenant_unread: true,
    created_at: '2026-10-04T10:30:00Z',
    updated_at: '2026-10-05T06:15:00Z'
  },
  {
    id: 'demo-2',
    ticket_number: 102,
    subject: 'Requesting GST Invoice for annual subscription renewal',
    status: 'open',
    tenant_unread: false,
    created_at: '2026-10-03T14:20:00Z',
    updated_at: '2026-10-04T09:00:00Z'
  },
  {
    id: 'demo-3',
    ticket_number: 98,
    subject: 'How to add secondary resort manager permissions?',
    status: 'closed',
    tenant_unread: false,
    created_at: '2026-08-19T23:14:00Z',
    updated_at: '2026-08-20T16:45:00Z'
  }
];

const demoMessages = [
  {
    id: 'msg-1',
    ticket_id: 'demo-1',
    sender_id: 'tenant',
    message: 'Hi StayPilot Team, I tried updating our room availability for next week, but the Booking.com channel manager integration seems to be lagging behind on mobile devices. Could you please check our synchronization log?',
    is_from_admin: false,
    created_at: '2026-10-04T10:30:00Z'
  },
  {
    id: 'msg-2',
    ticket_id: 'demo-1',
    sender_id: 'admin',
    message: 'Hello Resort Admin! Thank you for reporting this. We have verified your property synchronization pipeline and re-triggered an immediate channel update for all connected OTAs. Please check your Availability Calendar now.',
    is_from_admin: true,
    created_at: '2026-10-05T06:15:00Z'
  },
  {
    id: 'msg-3',
    ticket_id: 'demo-3',
    sender_id: 'tenant',
    message: 'Can I grant secondary access to our resort manager so they can handle daily guest check-ins?',
    is_from_admin: false,
    created_at: '2026-08-19T23:14:00Z'
  },
  {
    id: 'msg-4',
    ticket_id: 'demo-3',
    sender_id: 'admin',
    message: 'Yes! You can invite staff members under Management -> Staff tab with restricted check-in permissions. This ticket is now closed.',
    is_from_admin: true,
    created_at: '2026-08-20T16:45:00Z'
  }
];

const TenantSupport = () => {
  const { profile } = useSettingsStore();
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedTicket, setSelectedTicket] = useState(null);
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [showNewTicketForm, setShowNewTicketForm] = useState(false);
  const [newTicketSubject, setNewTicketSubject] = useState('');
  const [newTicketMessage, setNewTicketMessage] = useState('');
  const [ticketFilter, setTicketFilter] = useState('all'); // 'all' | 'open' | 'closed'
  const [searchQuery, setSearchQuery] = useState('');

  const isPreview = typeof window !== 'undefined' && window.location.search.includes('preview=true');

  const formatTicketNumber = (ticket) => {
    if (!ticket || !ticket.ticket_number || !ticket.created_at) return ticket?.ticket_number || '';
    const date = new Date(ticket.created_at);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const num = String(ticket.ticket_number).padStart(4, '0');
    return `SP-${year}${month}${day}-${num}`;
  };

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth <= 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    fetchTickets();
    
    const tenantId = profile?.tenant_id || profile?.id;
    if (!tenantId) return;
    
    // Realtime listeners
    const ticketSubscription = supabase
      .channel('tenant-tickets')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'support_messages' }, async payload => {
        if (payload.new.is_from_admin) {
          toast(`New reply from support`, { icon: '💬' });
          
          setSelectedTicket(currentTicket => {
            if (currentTicket && currentTicket.id === payload.new.ticket_id) {
              setMessages(currentMsgs => [...currentMsgs, payload.new]);
              return currentTicket;
            }
            return currentTicket;
          });
          
          fetchTickets();
        }
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'support_tickets' }, payload => {
        if (payload.new.tenant_id === tenantId) {
           setTickets(current => current.map(t => t.id === payload.new.id ? payload.new : t));
           setSelectedTicket(currentTicket => {
             if (currentTicket && currentTicket.id === payload.new.id) {
               return payload.new;
             }
             return currentTicket;
           });
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(ticketSubscription);
    };
  }, [profile]);

  const fetchTickets = async () => {
    setLoading(true);
    const tenantId = profile?.tenant_id || profile?.id;
    
    if (tenantId) {
      const { data, error } = await supabase
        .from('support_tickets')
        .select('id, ticket_number, subject, status, tenant_unread, created_at, updated_at')
        .eq('tenant_id', tenantId)
        .order('updated_at', { ascending: false });

      if (error) {
        console.error("Error fetching tickets:", error);
        if (isPreview) setTickets(demoTickets);
      } else {
        if ((!data || data.length === 0) && isPreview) {
          setTickets(demoTickets);
        } else {
          setTickets(data || []);
        }
      }
    } else if (isPreview) {
      setTickets(demoTickets);
    } else {
      setTickets([]);
    }
    setLoading(false);
  };

  const openTicket = async (ticket) => {
    setSelectedTicket(ticket);
    setShowNewTicketForm(false);
    
    if (ticket.id?.startsWith('demo-')) {
      setMessages(demoMessages.filter(m => m.ticket_id === ticket.id));
      return;
    }

    if (ticket.tenant_unread) {
      await supabase.from('support_tickets').update({ tenant_unread: false }).eq('id', ticket.id);
      setTickets(prev => prev.map(t => t.id === ticket.id ? { ...t, tenant_unread: false } : t));
    }

    const { data, error } = await supabase
      .from('support_messages')
      .select('*')
      .eq('ticket_id', ticket.id)
      .order('created_at', { ascending: true });
    
    if (error) console.error("Error fetching messages:", error);
    else setMessages(data || []);
  };

  const createTicket = async (e) => {
    e.preventDefault();
    if (!newTicketSubject.trim() || !newTicketMessage.trim()) return;
    setIsSending(true);

    const tenantId = profile?.tenant_id || profile?.id || 'demo-tenant';

    if (isPreview && !profile) {
      const newDemoTicket = {
        id: `demo-${Date.now()}`,
        ticket_number: tickets.length + 105,
        subject: newTicketSubject,
        status: 'open',
        tenant_unread: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
      setTickets([newDemoTicket, ...tickets]);
      setShowNewTicketForm(false);
      setNewTicketSubject('');
      setNewTicketMessage('');
      openTicket(newDemoTicket);
      setIsSending(false);
      toast.success("Ticket created!");
      return;
    }

    const { data: ticket, error: ticketError } = await supabase
      .from('support_tickets')
      .insert({ tenant_id: tenantId, subject: newTicketSubject })
      .select().single();

    if (ticketError) {
      alert("Error creating ticket: " + ticketError.message);
      setIsSending(false);
      return;
    }

    const msg = {
      ticket_id: ticket.id,
      sender_id: profile?.id || 'demo-user',
      message: newTicketMessage,
      is_from_admin: false
    };

    const { error: msgError } = await supabase.from('support_messages').insert(msg);
    if (msgError) {
      console.error("Error saving message", msgError);
    } else {
      toast.success("Ticket created!");
    }

    setTickets([ticket, ...tickets]);
    setShowNewTicketForm(false);
    setNewTicketSubject('');
    setNewTicketMessage('');
    openTicket(ticket);

    try {
      const payloadBody = {
        type: 'new_ticket',
        event_data: {
          tenant_email: profile?.email || 'tenant@staypilot.com',
          subject: ticket.subject,
          message: newTicketMessage
        }
      };
      await supabase.functions.invoke('saas-mailer', { body: payloadBody });
    } catch (err) {
      console.warn("Failed to send email notification", err);
    }
    
    setIsSending(false);
  };

  const sendMessage = async (e) => {
    e.preventDefault();
    if (!newMessage.trim() || !selectedTicket) return;
    setIsSending(true);

    if (selectedTicket.id?.startsWith('demo-')) {
      const demoReply = {
        id: `msg-${Date.now()}`,
        ticket_id: selectedTicket.id,
        sender_id: 'user',
        message: newMessage,
        is_from_admin: false,
        created_at: new Date().toISOString()
      };
      setMessages(prev => [...prev, demoReply]);
      setNewMessage('');
      setIsSending(false);
      toast.success("Message sent!");
      return;
    }

    const msg = {
      ticket_id: selectedTicket.id,
      sender_id: profile?.id,
      message: newMessage,
      is_from_admin: false
    };

    const { data, error } = await supabase.from('support_messages').insert(msg).select().single();
    if (error) {
      alert("Error sending message: " + error.message);
    } else {
      toast.success("Message sent!");
      setMessages([...messages, data]);
      setNewMessage('');
      
      setTickets(prev => prev.map(t => t.id === selectedTicket.id ? { ...t, updated_at: new Date().toISOString() } : t));

      try {
        const payloadBody = {
          type: 'ticket_reply',
          event_data: {
            tenant_email: profile?.email || 'tenant@staypilot.com',
            subject: selectedTicket.subject,
            message: newMessage,
            is_from_admin: false
          }
        };
        await supabase.functions.invoke('saas-mailer', { body: payloadBody });
      } catch (err) {
        console.error("Failed to send email notification", err);
      }
    }
    setIsSending(false);
  };

  // Client-Side Filtering & Search Logic
  const filteredTickets = tickets.filter(t => {
    if (ticketFilter === 'open' && t.status !== 'open') return false;
    if (ticketFilter === 'closed' && t.status !== 'closed') return false;
    
    if (searchQuery.trim() !== '') {
      const q = searchQuery.trim().toLowerCase();
      const subjectMatch = (t.subject || '').toLowerCase().includes(q);
      const idMatch = formatTicketNumber(t).toLowerCase().includes(q);
      const numMatch = String(t.ticket_number || '').includes(q);
      if (!subjectMatch && !idMatch && !numMatch) return false;
    }
    
    return true;
  });

  return (
    <div style={{ width: '100%', maxWidth: '1400px', margin: '0 auto', boxSizing: 'border-box' }}>
      {/* Page Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '0.75rem' }}>
        <div>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--text-main)', margin: '0 0 0.25rem 0', letterSpacing: '-0.01em' }}>
            Help & Support
          </h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', margin: 0 }}>
            Get help from the StayPilot team
          </p>
        </div>
        <button 
          onClick={() => { setShowNewTicketForm(true); setSelectedTicket(null); }}
          className="btn" 
          style={{ background: '#10b981', display: 'flex', alignItems: 'center', gap: '0.5rem', border: 'none', padding: '0.65rem 1.25rem', borderRadius: '8px', color: 'white', fontWeight: 700, cursor: 'pointer', minHeight: '44px', boxShadow: '0 2px 4px rgba(16, 185, 129, 0.2)' }}
        >
          <Plus size={18} /> Open New Ticket
        </button>
      </div>

      {/* Main Workspace Layout */}
      <div style={{
        display: 'flex',
        gap: '1.25rem',
        height: isMobile ? 'auto' : 'calc(100vh - 190px)',
        minHeight: isMobile ? 'auto' : '550px',
        flexDirection: isMobile ? 'column' : 'row',
        width: '100%',
        boxSizing: 'border-box',
        paddingBottom: isMobile ? '80px' : '0'
      }}>
        
        {/* LEFT COLUMN: Ticket List (Targeted desktop width: 320px) */}
        {(!isMobile || (!selectedTicket && !showNewTicketForm)) && (
          <div style={{
            width: isMobile ? '100%' : '320px',
            flexShrink: 0,
            background: 'var(--card-bg)',
            borderRadius: '12px',
            border: '1px solid var(--border)',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            boxSizing: 'border-box'
          }}>
            {/* Header & Filter Pills */}
            <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid var(--border)', background: 'var(--bg-secondary)' }}>
              <h3 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-main)', margin: '0 0 0.75rem 0' }}>Your Tickets</h3>
              
              {/* Compact Search Field */}
              <div style={{ position: 'relative', marginBottom: '0.75rem' }}>
                <Search size={15} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }} />
                <input
                  type="text"
                  placeholder="Search tickets..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '0.5rem 2.25rem 0.5rem 2.25rem',
                    borderRadius: '8px',
                    border: '1px solid var(--border)',
                    background: 'var(--bg-color)',
                    color: 'var(--text-main)',
                    fontSize: '0.825rem',
                    outline: 'none',
                    boxSizing: 'border-box'
                  }}
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    style={{
                      position: 'absolute',
                      right: '0.5rem',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      background: 'none',
                      border: 'none',
                      color: 'var(--text-muted)',
                      cursor: 'pointer',
                      padding: '0.25rem',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}
                    title="Clear search"
                  >
                    <X size={14} />
                  </button>
                )}
              </div>

              {/* Filter Pills */}
              <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  onClick={() => setTicketFilter('all')}
                  style={{
                    padding: '0.35rem 0.65rem',
                    borderRadius: '20px',
                    fontSize: '0.75rem',
                    fontWeight: 700,
                    border: ticketFilter === 'all' ? '1px solid #10b981' : '1px solid var(--border)',
                    background: ticketFilter === 'all' ? 'rgba(16, 185, 129, 0.12)' : 'transparent',
                    color: ticketFilter === 'all' ? '#10b981' : 'var(--text-muted)',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                    minHeight: '32px',
                    display: 'inline-flex',
                    alignItems: 'center'
                  }}
                >
                  All ({tickets.length})
                </button>
                <button
                  type="button"
                  onClick={() => setTicketFilter('open')}
                  style={{
                    padding: '0.35rem 0.65rem',
                    borderRadius: '20px',
                    fontSize: '0.75rem',
                    fontWeight: 700,
                    border: ticketFilter === 'open' ? '1px solid #10b981' : '1px solid var(--border)',
                    background: ticketFilter === 'open' ? 'rgba(16, 185, 129, 0.12)' : 'transparent',
                    color: ticketFilter === 'open' ? '#10b981' : 'var(--text-muted)',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                    minHeight: '32px',
                    display: 'inline-flex',
                    alignItems: 'center'
                  }}
                >
                  Open ({tickets.filter(t => t.status === 'open').length})
                </button>
                <button
                  type="button"
                  onClick={() => setTicketFilter('closed')}
                  style={{
                    padding: '0.35rem 0.65rem',
                    borderRadius: '20px',
                    fontSize: '0.75rem',
                    fontWeight: 700,
                    border: ticketFilter === 'closed' ? '1px solid #10b981' : '1px solid var(--border)',
                    background: ticketFilter === 'closed' ? 'rgba(16, 185, 129, 0.12)' : 'transparent',
                    color: ticketFilter === 'closed' ? '#10b981' : 'var(--text-muted)',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                    minHeight: '32px',
                    display: 'inline-flex',
                    alignItems: 'center'
                  }}
                >
                  Closed ({tickets.filter(t => t.status === 'closed').length})
                </button>
              </div>
            </div>

            {/* List Body */}
            <div style={{ flex: 1, overflowY: 'auto' }}>
              {loading ? (
                <div style={{ padding: '2.5rem 1rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                  Loading support tickets...
                </div>
              ) : filteredTickets.length === 0 ? (
                <div style={{ padding: '2.5rem 1.25rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                  <MessageSquare size={32} style={{ margin: '0 auto 0.75rem', opacity: 0.4 }} />
                  <div style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--text-main)', marginBottom: '0.25rem' }}>No tickets found</div>
                  <div style={{ fontSize: '0.775rem' }}>
                    {searchQuery.trim() !== '' ? 'Try a different search or filter.' : (ticketFilter !== 'all' ? `No ${ticketFilter} tickets present.` : 'Need help? Click "Open New Ticket" to get started.')}
                  </div>
                </div>
              ) : (
                filteredTickets.map(ticket => {
                  const isSelected = selectedTicket?.id === ticket.id;
                  return (
                    <div 
                      key={ticket.id} 
                      onClick={() => openTicket(ticket)}
                      style={{ 
                        padding: '1rem 1.25rem', 
                        borderBottom: '1px solid var(--border)', 
                        cursor: 'pointer',
                        background: isSelected ? 'rgba(16, 185, 129, 0.08)' : 'var(--bg-secondary)',
                        borderLeft: isSelected ? '4px solid #10b981' : '4px solid transparent',
                        transition: 'background 0.15s ease, border-color 0.15s ease'
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.5rem', marginBottom: '0.3rem' }}>
                        <div style={{ fontWeight: 700, color: 'var(--text-main)', fontSize: '0.925rem', lineHeight: '1.35', overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', flex: 1, minWidth: 0 }}>
                          {ticket.subject}
                        </div>
                        {ticket.tenant_unread && (
                          <span style={{ width: '8px', height: '8px', background: '#ef4444', borderRadius: '50%', flexShrink: 0, marginTop: '4px' }} title="Unread response" />
                        )}
                      </div>
                      <div style={{ fontSize: '0.775rem', color: 'var(--text-muted)', marginBottom: '0.5rem', fontVariantNumeric: 'tabular-nums', fontWeight: 500 }}>
                        {formatTicketNumber(ticket)}
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
                        <span style={{ 
                          fontSize: '0.7rem', 
                          padding: '0.2rem 0.55rem', 
                          borderRadius: '12px',
                          fontWeight: 800,
                          letterSpacing: '0.03em',
                          textTransform: 'uppercase',
                          background: ticket.status === 'open' ? 'rgba(16, 185, 129, 0.12)' : 'rgba(100, 116, 139, 0.12)',
                          color: ticket.status === 'open' ? '#10b981' : 'var(--text-muted)',
                          border: ticket.status === 'open' ? '1px solid rgba(16, 185, 129, 0.25)' : '1px solid var(--border)'
                        }}>
                          {ticket.status}
                        </span>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '0.3rem', fontVariantNumeric: 'tabular-nums' }}>
                          <Clock size={12} /> {new Date(ticket.updated_at).toLocaleDateString()}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}

        {/* RIGHT COLUMN: Conversation / Form / Empty State */}
        {(!isMobile || selectedTicket || showNewTicketForm) && (
          <div style={{ 
            flex: 1, 
            minWidth: 0,
            background: 'var(--card-bg)', 
            borderRadius: '12px', 
            border: '1px solid var(--border)', 
            display: 'flex', 
            flexDirection: 'column', 
            overflow: 'hidden', 
            height: isMobile ? 'calc(100vh - 220px)' : '100%',
            minHeight: isMobile ? '480px' : 'auto'
          }}>
            
            {showNewTicketForm ? (
              <div style={{ padding: isMobile ? '1.25rem' : '2rem', flex: 1, overflowY: 'auto', background: 'var(--bg-secondary)' }}>
                {isMobile && (
                  <button 
                    type="button"
                    onClick={() => setShowNewTicketForm(false)}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: '#10b981',
                      fontWeight: 700,
                      fontSize: '0.875rem',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.35rem',
                      padding: '0.4rem 0',
                      marginBottom: '1rem',
                      cursor: 'pointer',
                      minHeight: '44px'
                    }}
                  >
                    <ArrowLeft size={16} /> Back to Tickets
                  </button>
                )}
                <h3 style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--text-main)', margin: '0 0 1.5rem 0' }}>Open a New Support Ticket</h3>
                <form onSubmit={createTicket}>
                  <div style={{ marginBottom: '1.25rem' }}>
                    <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-main)', marginBottom: '0.5rem' }}>Subject</label>
                    <input
                      type="text"
                      required
                      placeholder="Brief description of the issue"
                      value={newTicketSubject}
                      onChange={(e) => setNewTicketSubject(e.target.value)}
                      style={{ width: '100%', padding: '0.75rem 1rem', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--bg-color)', color: 'var(--text-main)', fontSize: '0.925rem', outline: 'none', minHeight: '44px', boxSizing: 'border-box' }}
                    />
                  </div>
                  <div style={{ marginBottom: '1.5rem' }}>
                    <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-main)', marginBottom: '0.5rem' }}>How can we help?</label>
                    <textarea
                      required
                      placeholder="Describe your issue or question in detail..."
                      value={newTicketMessage}
                      onChange={(e) => setNewTicketMessage(e.target.value)}
                      rows={6}
                      style={{ width: '100%', padding: '0.75rem 1rem', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--bg-color)', color: 'var(--text-main)', fontSize: '0.925rem', outline: 'none', resize: 'vertical', boxSizing: 'border-box', fontFamily: 'inherit' }}
                    />
                  </div>
                  <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                    <button 
                      type="submit" 
                      className="btn"
                      disabled={isSending || !newTicketSubject.trim() || !newTicketMessage.trim()}
                      style={{ background: '#10b981', color: 'white', border: 'none', padding: '0.75rem 1.5rem', borderRadius: '8px', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem', minHeight: '44px' }}
                    >
                      {isSending ? 'Submitting...' : <><Send size={16} /> Submit Ticket</>}
                    </button>
                    <button 
                      type="button" 
                      onClick={() => setShowNewTicketForm(false)}
                      className="btn btn-outline"
                      style={{ padding: '0.75rem 1.5rem', minHeight: '44px', borderRadius: '8px' }}
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              </div>
            ) : selectedTicket ? (
              <>
                {/* Refined Conversation Header */}
                <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border)', background: 'var(--bg-secondary)', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                  {isMobile && (
                    <button 
                      type="button"
                      onClick={() => setSelectedTicket(null)}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: '#10b981',
                        fontWeight: 700,
                        fontSize: '0.875rem',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.35rem',
                        padding: '0.4rem 0',
                        marginBottom: '0.35rem',
                        cursor: 'pointer',
                        minHeight: '44px',
                        alignSelf: 'flex-start'
                      }}
                    >
                      <ArrowLeft size={16} /> Back to Tickets
                    </button>
                  )}
                  
                  {/* Subject + Status Badge Flex Group */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                    <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 700, color: 'var(--text-main)', lineHeight: '1.35', wordBreak: 'break-word' }}>
                      {selectedTicket.subject}
                    </h3>
                    <span style={{ 
                      padding: '0.25rem 0.65rem', 
                      borderRadius: '20px', 
                      fontSize: '0.725rem', 
                      fontWeight: 800, 
                      letterSpacing: '0.04em',
                      textTransform: 'uppercase', 
                      background: selectedTicket.status === 'open' ? 'rgba(16, 185, 129, 0.12)' : 'rgba(100, 116, 139, 0.12)', 
                      color: selectedTicket.status === 'open' ? '#10b981' : 'var(--text-muted)', 
                      border: selectedTicket.status === 'open' ? '1px solid rgba(16, 185, 129, 0.25)' : '1px solid var(--border)',
                      display: 'inline-flex',
                      alignItems: 'center',
                      flexShrink: 0
                    }}>
                      {selectedTicket.status}
                    </span>
                  </div>

                  {/* Secondary Metadata */}
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem', fontVariantNumeric: 'tabular-nums', marginTop: '0.1rem' }}>
                    <span>Ticket ID: <strong style={{ color: 'var(--text-main)' }}>{formatTicketNumber(selectedTicket)}</strong></span>
                    <span>•</span>
                    <span>Opened {new Date(selectedTicket.created_at).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}</span>
                  </div>
                </div>

                {/* Messages Canvas with max-width 950px container */}
                <div style={{ flex: 1, padding: isMobile ? '1rem' : '1.5rem', overflowY: 'auto', background: 'var(--bg-color)', display: 'flex', flexDirection: 'column' }}>
                  <div style={{ width: '100%', maxWidth: '950px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '1rem', flex: 1 }}>
                    {messages.length === 0 ? (
                      <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.875rem' }}>
                        No messages yet in this ticket.
                      </div>
                    ) : (
                      messages.map((msg) => (
                        <div key={msg.id} style={{ 
                          alignSelf: msg.is_from_admin ? 'flex-start' : 'flex-end',
                          maxWidth: isMobile ? '85%' : '75%',
                          display: 'flex',
                          flexDirection: 'column'
                        }}>
                          <div style={{ 
                            background: msg.is_from_admin ? 'var(--bg-secondary)' : '#10b981',
                            color: msg.is_from_admin ? 'var(--text-main)' : '#ffffff',
                            padding: '0.85rem 1.1rem',
                            borderRadius: '14px',
                            borderBottomRightRadius: msg.is_from_admin ? '14px' : '2px',
                            borderBottomLeftRadius: msg.is_from_admin ? '2px' : '14px',
                            boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
                            border: msg.is_from_admin ? '1px solid var(--border)' : 'none',
                            lineHeight: '1.5',
                            fontSize: '0.925rem',
                            wordBreak: 'break-word',
                            whiteSpace: 'pre-wrap'
                          }}>
                            {msg.message}
                          </div>
                          <div style={{ 
                            fontSize: '0.725rem', 
                            color: 'var(--text-muted)', 
                            marginTop: '0.35rem',
                            textAlign: msg.is_from_admin ? 'left' : 'right',
                            padding: '0 0.35rem',
                            fontVariantNumeric: 'tabular-nums'
                          }}>
                            {msg.is_from_admin ? 'StayPilot Support' : 'You'} • {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {/* Input Area / Closed Ticket Footer */}
                {selectedTicket.status === 'open' ? (
                  <form onSubmit={sendMessage} style={{ padding: '1rem 1.25rem', borderTop: '1px solid var(--border)', background: 'var(--bg-secondary)' }}>
                    <div style={{ width: '100%', maxWidth: '950px', margin: '0 auto', display: 'flex', gap: '0.75rem', alignItems: 'flex-end' }}>
                      <textarea
                        rows={2}
                        placeholder="Type your reply..."
                        value={newMessage}
                        onChange={(e) => setNewMessage(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault();
                            if (newMessage.trim() && !isSending) {
                              sendMessage(e);
                            }
                          }
                        }}
                        disabled={isSending}
                        style={{ 
                          flex: 1, 
                          padding: '0.75rem 1rem', 
                          borderRadius: '10px', 
                          border: '1px solid var(--border)', 
                          background: 'var(--bg-color)',
                          color: 'var(--text-main)',
                          fontSize: '0.925rem', 
                          outline: 'none',
                          resize: 'none',
                          maxHeight: '120px',
                          minHeight: '44px',
                          fontFamily: 'inherit'
                        }}
                      />
                      <button 
                        type="submit" 
                        className="btn" 
                        disabled={!newMessage.trim() || isSending}
                        style={{ 
                          background: newMessage.trim() ? '#10b981' : 'var(--border)', 
                          border: 'none',
                          padding: '0 1.25rem',
                          height: '44px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '0.5rem',
                          color: newMessage.trim() ? '#ffffff' : 'var(--text-muted)',
                          borderRadius: '10px',
                          fontWeight: 700,
                          fontSize: '0.9rem',
                          cursor: (!newMessage.trim() || isSending) ? 'not-allowed' : 'pointer',
                          opacity: (!newMessage.trim() || isSending) ? 0.6 : 1,
                          transition: 'all 0.2s ease',
                          flexShrink: 0
                        }}
                      >
                        {isSending ? 'Sending...' : <><Send size={16} /> Send</>}
                      </button>
                    </div>
                  </form>
                ) : (
                  <div style={{ padding: '1.25rem', borderTop: '1px solid var(--border)', background: 'var(--bg-secondary)', textAlign: 'center' }}>
                    <div style={{ width: '100%', maxWidth: '950px', margin: '0 auto' }}>
                      <strong style={{ display: 'block', fontSize: '0.925rem', color: 'var(--text-main)', marginBottom: '0.25rem' }}>
                        This ticket is closed.
                      </strong>
                      <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                        If you need further assistance, please open a new support ticket.
                      </span>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', padding: '3rem 1.5rem', color: 'var(--text-muted)', background: 'var(--bg-secondary)', textAlign: 'center' }}>
                <div style={{ width: '64px', height: '64px', borderRadius: '50%', background: 'rgba(16, 185, 129, 0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '1.25rem', color: '#10b981' }}>
                  <MessageSquare size={30} />
                </div>
                <h3 style={{ margin: '0 0 0.5rem 0', fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-main)' }}>
                  Select a ticket to view the conversation
                </h3>
                <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--text-muted)', maxWidth: '360px', lineHeight: '1.4' }}>
                  Choose a ticket from the list on the left to view its messages and submit replies, or open a new ticket.
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default TenantSupport;
