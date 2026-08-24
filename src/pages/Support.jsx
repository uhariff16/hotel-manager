import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Mail, MessageSquare, Send, CheckCircle, Plus, AlertCircle, Clock } from 'lucide-react';
import { useSettingsStore } from '../lib/store';
import toast from 'react-hot-toast';

const TenantSupport = () => {
  const { profile } = useSettingsStore();
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);
  const [tickets, setTickets] = useState([]);

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
  const [loading, setLoading] = useState(true);
  const [selectedTicket, setSelectedTicket] = useState(null);
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [showNewTicketForm, setShowNewTicketForm] = useState(false);
  const [newTicketSubject, setNewTicketSubject] = useState('');
  const [newTicketMessage, setNewTicketMessage] = useState('');

  useEffect(() => {
    fetchTickets();
    
    if (!profile) return;
    
    // Realtime listeners
    const ticketSubscription = supabase
      .channel('tenant-tickets')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'support_messages' }, async payload => {
        if (payload.new.is_from_admin) {
          toast(`New reply from support`, { icon: '💬' });
          
          // If we are looking at this ticket, add the message to the view
          setSelectedTicket(currentTicket => {
            if (currentTicket && currentTicket.id === payload.new.ticket_id) {
              setMessages(currentMsgs => [...currentMsgs, payload.new]);
              return currentTicket;
            }
            return currentTicket;
          });
          
          // Re-fetch tickets to update the 'updated_at' sorting
          fetchTickets();
        }
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'support_tickets' }, payload => {
        if (payload.new.tenant_id === (profile.tenant_id || profile.id)) {
           // update tickets array with new ticket data (e.g. status change)
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
    const { data, error } = await supabase
      .from('support_tickets')
      .select('id, ticket_number, subject, status, tenant_unread, created_at, updated_at')
      .eq('tenant_id', profile.tenant_id || profile.id)
      .order('updated_at', { ascending: false });

    if (error) console.error("Error fetching tickets:", error);
    else setTickets(data || []);
    setLoading(false);
  };

  const openTicket = async (ticket) => {
    setSelectedTicket(ticket);
    setShowNewTicketForm(false);
    
    // Mark as read
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

    const tenantId = profile.tenant_id || profile.id;

    // Create ticket
    const { data: ticket, error: ticketError } = await supabase
      .from('support_tickets')
      .insert({ tenant_id: tenantId, subject: newTicketSubject })
      .select().single();

    if (ticketError) {
      alert("Error creating ticket: " + ticketError.message);
      setIsSending(false);
      return;
    }

    // Create initial message
    const msg = {
      ticket_id: ticket.id,
      sender_id: profile.id,
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

    // Trigger email notification
    try {
      const payloadBody = {
        type: 'new_ticket',
        event_data: {
          tenant_email: profile.email,
          subject: ticket.subject,
          message: newTicketMessage
        }
      };
      const res = await supabase.functions.invoke('saas-mailer', {
        body: payloadBody
      });
      console.log("Mailer response:", res);
    } catch (err) {
      console.warn("Failed to send email notification", err);
    }
    
    setIsSending(false);
  };

  const sendMessage = async (e) => {
    e.preventDefault();
    if (!newMessage.trim() || !selectedTicket) return;
    setIsSending(true);

    const msg = {
      ticket_id: selectedTicket.id,
      sender_id: profile.id,
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
      
      // Update ticket updated_at locally
      setTickets(prev => prev.map(t => t.id === selectedTicket.id ? { ...t, updated_at: new Date().toISOString() } : t));

      // Trigger email notification
      try {
        const payloadBody = {
          type: 'ticket_reply',
          event_data: {
            tenant_email: profile.email,
            subject: selectedTicket.subject,
            message: newMessage,
            is_from_admin: false
          }
        };
        const res = await supabase.functions.invoke('saas-mailer', {
          body: payloadBody
        });
        console.log("Mailer response:", res);
        toast.success("Notification sent to support");
      } catch (err) {
        console.error("Failed to send email notification", err);
        toast.error("Failed to send email notification");
      }
    }
    setIsSending(false);
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <div>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#0F2C59', margin: '0 0 0.2rem 0' }}>Help & Support</h2>
          <p style={{ color: '#64748b', fontSize: '0.9rem', margin: 0 }}>Get help from the StayPilot team</p>
        </div>
        <button 
          onClick={() => { setShowNewTicketForm(true); setSelectedTicket(null); }}
          className="btn" 
          style={{ background: '#10b981', display: 'flex', alignItems: 'center', gap: '0.5rem', border: 'none', padding: '0.6rem 1.2rem', borderRadius: '8px', color: 'white', fontWeight: 600, cursor: 'pointer' }}
        >
          <Plus size={18} /> Open New Ticket
        </button>
      </div>

      <div style={{ display: 'flex', gap: '1.5rem', height: isMobile ? 'auto' : 'calc(100vh - 200px)', flexDirection: isMobile ? 'column-reverse' : 'row' }}>
        {/* Left side: Ticket List */}
        <div style={{ width: isMobile ? '100%' : '300px', background: 'white', borderRadius: '12px', border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '1.2rem', borderBottom: '1px solid #e2e8f0' }}>
            <h3 style={{ fontSize: '1rem', fontWeight: 700, color: '#1e293b', margin: 0 }}>Your Tickets</h3>
          </div>

          <div style={{ flex: 1, overflowY: 'auto' }}>
            {loading ? (
              <div style={{ padding: '2rem', textAlign: 'center', color: '#64748b' }}>Loading...</div>
            ) : tickets.length === 0 ? (
              <div style={{ padding: '2rem', textAlign: 'center', color: '#64748b' }}>
                <MessageSquare size={32} style={{ margin: '0 auto 1rem', opacity: 0.5 }} />
                No tickets yet. Need help? Open a new ticket!
              </div>
            ) : (
              tickets.map(ticket => (
                <div 
                  key={ticket.id} 
                  onClick={() => openTicket(ticket)}
                  style={{ 
                    padding: '1.2rem', 
                    borderBottom: '1px solid #e2e8f0', 
                    cursor: 'pointer',
                    background: selectedTicket?.id === ticket.id ? '#f8fafc' : 'white',
                    borderLeft: selectedTicket?.id === ticket.id ? '4px solid #10b981' : '4px solid transparent',
                    transition: 'all 0.2s'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
                  <div style={{ fontWeight: 600, color: '#1e293b', fontSize: '0.9rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '180px', display: 'flex', alignItems: 'center' }}>
                    <span style={{ color: '#64748b', marginRight: '0.4rem' }}>{formatTicketNumber(ticket)}</span>
                    {ticket.subject}
                    {ticket.tenant_unread && (
                      <span style={{ marginLeft: '0.5rem', minWidth: '8px', height: '8px', background: '#ef4444', borderRadius: '50%', display: 'inline-block' }}></span>
                    )}
                  </div>
                </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ 
                      fontSize: '0.7rem', 
                      padding: '0.2rem 0.5rem', 
                      borderRadius: '12px',
                      fontWeight: 700,
                      textTransform: 'uppercase',
                      background: ticket.status === 'open' ? '#dcfce7' : '#f1f5f9',
                      color: ticket.status === 'open' ? '#166534' : '#64748b'
                    }}>
                      {ticket.status}
                    </span>
                    <div style={{ fontSize: '0.75rem', color: '#94a3b8', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                      <Clock size={12} /> {new Date(ticket.updated_at).toLocaleDateString()}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Right side: Content Area */}
        <div style={{ flex: 1, background: 'white', borderRadius: '12px', border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', overflow: 'hidden', minHeight: isMobile ? '500px' : 'auto' }}>
          
          {showNewTicketForm ? (
            <div style={{ padding: '2rem', flex: 1, overflowY: 'auto' }}>
              <h3 style={{ fontSize: '1.2rem', color: '#0F2C59', margin: '0 0 1.5rem 0' }}>Open a New Support Ticket</h3>
              <form onSubmit={createTicket}>
                <div style={{ marginBottom: '1.5rem' }}>
                  <label style={{ display: 'block', fontSize: '0.9rem', fontWeight: 600, color: '#334155', marginBottom: '0.5rem' }}>Subject</label>
                  <input
                    type="text"
                    required
                    placeholder="Brief description of the issue"
                    value={newTicketSubject}
                    onChange={(e) => setNewTicketSubject(e.target.value)}
                    style={{ width: '100%', padding: '0.8rem 1rem', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.95rem', outline: 'none' }}
                  />
                </div>
                <div style={{ marginBottom: '1.5rem' }}>
                  <label style={{ display: 'block', fontSize: '0.9rem', fontWeight: 600, color: '#334155', marginBottom: '0.5rem' }}>How can we help?</label>
                  <textarea
                    required
                    placeholder="Describe your issue or question in detail..."
                    value={newTicketMessage}
                    onChange={(e) => setNewTicketMessage(e.target.value)}
                    rows={8}
                    style={{ width: '100%', padding: '0.8rem 1rem', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.95rem', outline: 'none', resize: 'vertical' }}
                  />
                </div>
                <div style={{ display: 'flex', gap: '1rem' }}>
                  <button 
                    type="submit" 
                    className="btn"
                    disabled={isSending || !newTicketSubject.trim() || !newTicketMessage.trim()}
                    style={{ background: '#10b981', color: 'white', border: 'none', padding: '0.8rem 1.5rem', borderRadius: '8px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem' }}
                  >
                    {isSending ? 'Submitting...' : <><Send size={16} /> Submit Ticket</>}
                  </button>
                  <button 
                    type="button" 
                    onClick={() => setShowNewTicketForm(false)}
                    className="btn btn-outline"
                    style={{ padding: '0.8rem 1.5rem' }}
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          ) : selectedTicket ? (
            <>
              {/* Header */}
              <div style={{ padding: '1.2rem 1.5rem', borderBottom: '1px solid #e2e8f0', background: '#f8fafc' }}>
                <h3 style={{ margin: '0 0 0.3rem 0', fontSize: '1.2rem', color: '#0F2C59' }}>
                  <span style={{ color: '#64748b', marginRight: '0.5rem' }}>{formatTicketNumber(selectedTicket)}</span>
                  {selectedTicket.subject}
                </h3>
                <div style={{ fontSize: '0.85rem', color: '#64748b' }}>
                  Ticket opened on {new Date(selectedTicket.created_at).toLocaleString()}
                </div>
              </div>

              {/* Messages Area */}
              <div style={{ flex: 1, padding: '1.5rem', overflowY: 'auto', background: '#fcfcfc', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {messages.map((msg) => (
                  <div key={msg.id} style={{ 
                    alignSelf: msg.is_from_admin ? 'flex-start' : 'flex-end',
                    maxWidth: '70%',
                    display: 'flex',
                    flexDirection: 'column'
                  }}>
                    <div style={{ 
                      background: msg.is_from_admin ? 'white' : '#10b981',
                      color: msg.is_from_admin ? '#334155' : 'white',
                      padding: '1rem 1.2rem',
                      borderRadius: '12px',
                      borderBottomRightRadius: msg.is_from_admin ? '12px' : '4px',
                      borderBottomLeftRadius: msg.is_from_admin ? '4px' : '12px',
                      boxShadow: '0 2px 5px rgba(0,0,0,0.05)',
                      border: msg.is_from_admin ? '1px solid #e2e8f0' : 'none',
                      lineHeight: 1.5,
                      fontSize: '0.95rem'
                    }}>
                      {msg.message}
                    </div>
                    <div style={{ 
                      fontSize: '0.7rem', 
                      color: '#94a3b8', 
                      marginTop: '0.4rem',
                      textAlign: msg.is_from_admin ? 'left' : 'right',
                      padding: '0 0.5rem'
                    }}>
                      {msg.is_from_admin ? 'StayPilot Support' : 'You'} • {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </div>
                ))}
              </div>

              {/* Input Area */}
              {selectedTicket.status === 'open' ? (
                <form onSubmit={sendMessage} style={{ padding: '1.2rem', borderTop: '1px solid #e2e8f0', display: 'flex', gap: '1rem', background: 'white' }}>
                  <input
                    type="text"
                    placeholder="Type your reply..."
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                    style={{ flex: 1, padding: '0.8rem 1.2rem', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.95rem', outline: 'none' }}
                    disabled={isSending}
                  />
                  <button 
                    type="submit" 
                    className="btn" 
                    disabled={!newMessage.trim() || isSending}
                    style={{ 
                      background: newMessage.trim() ? '#10b981' : '#cbd5e1', 
                      border: 'none',
                      padding: '0 1.5rem',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.5rem',
                      color: 'white',
                      borderRadius: '8px',
                      fontWeight: 600
                    }}
                  >
                    {isSending ? 'Sending...' : <><Send size={16} /> Send</>}
                  </button>
                </form>
              ) : (
                <div style={{ padding: '1.2rem', borderTop: '1px solid #e2e8f0', background: '#f8fafc', textAlign: 'center', color: '#64748b', fontSize: '0.9rem' }}>
                  This ticket has been marked as closed by support. If you need further assistance, please open a new ticket.
                </div>
              )}
            </>
          ) : (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', color: '#94a3b8', background: '#f8fafc' }}>
              <AlertCircle size={48} style={{ marginBottom: '1rem', opacity: 0.5 }} />
              <h3 style={{ margin: 0, color: '#64748b' }}>Select a ticket or open a new one</h3>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default TenantSupport;
