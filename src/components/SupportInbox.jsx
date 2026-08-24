import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import toast from 'react-hot-toast';
import { Mail, MessageSquare, Send, CheckCircle, X, Search, Clock, User } from 'lucide-react';

const SupportInbox = ({ superAdminProfile }) => {
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);

  const formatTicketNumber = (ticket) => {
    if (!ticket || !ticket.ticket_number || !ticket.created_at) return ticket?.ticket_number || '';
    const date = new Date(ticket.created_at);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const num = String(ticket.ticket_number).padStart(4, '0');
    return `SP-${year}${month}${day}-${num}`;
  };
  const [selectedTicket, setSelectedTicket] = useState(null);
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [filter, setFilter] = useState('open'); // 'open' | 'closed' | 'all'

  useEffect(() => {
    fetchTickets();
    
    // Realtime listeners
    const ticketSubscription = supabase
      .channel('admin-tickets')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'support_tickets' }, payload => {
        toast.success(`New Ticket: ${payload.new.subject}`);
        setTickets(current => [payload.new, ...current]);
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'support_messages' }, async payload => {
        if (!payload.new.is_from_admin) {
          toast(`New reply received`, { icon: '💬' });
          
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
      .subscribe();

    return () => {
      supabase.removeChannel(ticketSubscription);
    };
  }, [filter]);

  const fetchTickets = async () => {
    setLoading(true);
    let query = supabase.from('support_tickets').select(`
      id, ticket_number, subject, status, admin_unread, created_at, updated_at,
      profiles ( id, full_name, email )
    `).order('updated_at', { ascending: false });

    if (filter !== 'all') {
      query = query.eq('status', filter);
    }

    const { data, error } = await query;
    if (error) console.error("Error fetching tickets:", error);
    else setTickets(data || []);
    setLoading(false);
  };

  const openTicket = async (ticket) => {
    setSelectedTicket(ticket);
    
    // Mark as read
    if (ticket.admin_unread) {
      await supabase.from('support_tickets').update({ admin_unread: false }).eq('id', ticket.id);
      setTickets(prev => prev.map(t => t.id === ticket.id ? { ...t, admin_unread: false } : t));
    }

    const { data, error } = await supabase
      .from('support_messages')
      .select('*')
      .eq('ticket_id', ticket.id)
      .order('created_at', { ascending: true });
    
    if (error) console.error("Error fetching messages:", error);
    else setMessages(data || []);
  };

  const closeTicket = async (e, ticketId) => {
    e.stopPropagation();
    const { error } = await supabase.from('support_tickets').update({ status: 'closed' }).eq('id', ticketId);
    if (!error) {
      setTickets(prev => prev.map(t => t.id === ticketId ? { ...t, status: 'closed' } : t));
      if (selectedTicket?.id === ticketId) setSelectedTicket({ ...selectedTicket, status: 'closed' });
    }
  };

  const reopenTicket = async (e, ticketId) => {
    e.stopPropagation();
    const { error } = await supabase.from('support_tickets').update({ status: 'open' }).eq('id', ticketId);
    if (!error) {
      setTickets(prev => prev.map(t => t.id === ticketId ? { ...t, status: 'open' } : t));
      if (selectedTicket?.id === ticketId) setSelectedTicket({ ...selectedTicket, status: 'open' });
    }
  };

  const sendMessage = async (e) => {
    e.preventDefault();
    if (!newMessage.trim() || !selectedTicket) return;
    setIsSending(true);

    const msg = {
      ticket_id: selectedTicket.id,
      sender_id: superAdminProfile.id,
      message: newMessage,
      is_from_admin: true
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
            tenant_email: selectedTicket.profiles?.email,
            subject: selectedTicket.subject,
            message: newMessage,
            is_from_admin: true
          }
        };
        const res = await supabase.functions.invoke('saas-mailer', {
          body: payloadBody
        });
        console.log("Mailer response:", res);
        toast.success("Notification email sent successfully!");
      } catch (err) {
        console.error("Failed to send email notification", err);
        toast.error("Failed to send email notification");
      }
    }
    setIsSending(false);
  };

  return (
    <div style={{ display: 'flex', gap: '1.5rem', height: 'calc(100vh - 200px)' }}>
      {/* Left side: Ticket List */}
      <div style={{ width: '350px', background: 'white', borderRadius: '12px', border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '1.2rem', borderBottom: '1px solid #e2e8f0' }}>
          <h2 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#0F2C59', margin: '0 0 1rem 0' }}>Support Inbox</h2>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button 
              onClick={() => setFilter('open')}
              style={{ flex: 1, padding: '0.5rem', borderRadius: '6px', fontSize: '0.85rem', fontWeight: 600, border: 'none', background: filter === 'open' ? '#0F2C59' : '#f1f5f9', color: filter === 'open' ? 'white' : '#64748b', cursor: 'pointer' }}
            >
              Open
            </button>
            <button 
              onClick={() => setFilter('closed')}
              style={{ flex: 1, padding: '0.5rem', borderRadius: '6px', fontSize: '0.85rem', fontWeight: 600, border: 'none', background: filter === 'closed' ? '#0F2C59' : '#f1f5f9', color: filter === 'closed' ? 'white' : '#64748b', cursor: 'pointer' }}
            >
              Closed
            </button>
            <button 
              onClick={() => setFilter('all')}
              style={{ flex: 1, padding: '0.5rem', borderRadius: '6px', fontSize: '0.85rem', fontWeight: 600, border: 'none', background: filter === 'all' ? '#0F2C59' : '#f1f5f9', color: filter === 'all' ? 'white' : '#64748b', cursor: 'pointer' }}
            >
              All
            </button>
          </div>
        </div>

        <div style={{ flex: 1, overflowY: 'auto' }}>
          {loading ? (
            <div style={{ padding: '2rem', textAlign: 'center', color: '#64748b' }}>Loading tickets...</div>
          ) : tickets.length === 0 ? (
            <div style={{ padding: '2rem', textAlign: 'center', color: '#64748b' }}>
              <MessageSquare size={32} style={{ margin: '0 auto 1rem', opacity: 0.5 }} />
              No {filter !== 'all' ? filter : ''} tickets found
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
                  borderLeft: selectedTicket?.id === ticket.id ? '4px solid #0F2C59' : '4px solid transparent',
                  transition: 'all 0.2s'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
                  <div style={{ fontWeight: 600, color: '#1e293b', fontSize: '0.95rem', display: 'flex', alignItems: 'center' }}>
                    <span style={{ color: '#64748b', marginRight: '0.5rem' }}>{formatTicketNumber(ticket)}</span>
                    {ticket.subject}
                    {ticket.admin_unread && (
                      <span style={{ marginLeft: '0.5rem', width: '8px', height: '8px', background: '#3b82f6', borderRadius: '50%', display: 'inline-block' }}></span>
                    )}
                  </div>
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
                </div>
                <div style={{ fontSize: '0.8rem', color: '#64748b', display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.3rem' }}>
                  <User size={12} /> {ticket.profiles?.full_name || 'Unknown'}
                </div>
                <div style={{ fontSize: '0.75rem', color: '#94a3b8', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <Clock size={12} /> {new Date(ticket.updated_at).toLocaleString()}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Right side: Chat Window */}
      {selectedTicket ? (
        <div style={{ flex: 1, background: 'white', borderRadius: '12px', border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {/* Header */}
          <div style={{ padding: '1.2rem 1.5rem', borderBottom: '1px solid #e2e8f0', background: '#f8fafc', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <h3 style={{ margin: '0 0 0.3rem 0', fontSize: '1.2rem', color: '#0F2C59' }}>
                <span style={{ color: '#64748b', marginRight: '0.5rem' }}>{formatTicketNumber(selectedTicket)}</span>
                {selectedTicket.subject}
              </h3>
              <div style={{ fontSize: '0.85rem', color: '#64748b', display: 'flex', gap: '1rem' }}>
                <span>From: {selectedTicket.profiles?.full_name} ({selectedTicket.profiles?.email})</span>
                <span>Created: {new Date(selectedTicket.created_at).toLocaleDateString()}</span>
              </div>
            </div>
            <div>
              {selectedTicket.status === 'open' ? (
                <button onClick={(e) => closeTicket(e, selectedTicket.id)} className="btn" style={{ background: '#f1f5f9', color: '#64748b', border: 'none', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <CheckCircle size={16} /> Close Ticket
                </button>
              ) : (
                <button onClick={(e) => reopenTicket(e, selectedTicket.id)} className="btn btn-outline" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  Reopen Ticket
                </button>
              )}
            </div>
          </div>

          {/* Messages Area */}
          <div style={{ flex: 1, padding: '1.5rem', overflowY: 'auto', background: '#fcfcfc', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {messages.map((msg) => (
              <div key={msg.id} style={{ 
                alignSelf: msg.is_from_admin ? 'flex-end' : 'flex-start',
                maxWidth: '70%',
                display: 'flex',
                flexDirection: 'column'
              }}>
                <div style={{ 
                  background: msg.is_from_admin ? '#0F2C59' : 'white',
                  color: msg.is_from_admin ? 'white' : '#334155',
                  padding: '1rem 1.2rem',
                  borderRadius: '12px',
                  borderBottomRightRadius: msg.is_from_admin ? '4px' : '12px',
                  borderBottomLeftRadius: msg.is_from_admin ? '12px' : '4px',
                  boxShadow: '0 2px 5px rgba(0,0,0,0.05)',
                  border: msg.is_from_admin ? 'none' : '1px solid #e2e8f0',
                  lineHeight: 1.5,
                  fontSize: '0.95rem'
                }}>
                  {msg.message}
                </div>
                <div style={{ 
                  fontSize: '0.7rem', 
                  color: '#94a3b8', 
                  marginTop: '0.4rem',
                  textAlign: msg.is_from_admin ? 'right' : 'left',
                  padding: '0 0.5rem'
                }}>
                  {msg.is_from_admin ? 'You (Admin)' : selectedTicket.profiles?.full_name} • {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </div>
              </div>
            ))}
          </div>

          {/* Input Area */}
          {selectedTicket.status === 'open' ? (
            <form onSubmit={sendMessage} style={{ padding: '1.2rem', borderTop: '1px solid #e2e8f0', display: 'flex', gap: '1rem', background: 'white' }}>
              <input
                type="text"
                placeholder="Type your reply to the customer..."
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
                  gap: '0.5rem'
                }}
              >
                {isSending ? 'Sending...' : <><Send size={16} /> Send</>}
              </button>
            </form>
          ) : (
            <div style={{ padding: '1.2rem', borderTop: '1px solid #e2e8f0', background: '#f8fafc', textAlign: 'center', color: '#64748b', fontSize: '0.9rem' }}>
              This ticket is closed. Reopen it to send a reply.
            </div>
          )}
        </div>
      ) : (
        <div style={{ flex: 1, background: 'white', borderRadius: '12px', border: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', color: '#94a3b8' }}>
          <MessageSquare size={48} style={{ marginBottom: '1rem', opacity: 0.5 }} />
          <h3 style={{ margin: 0, color: '#64748b' }}>No Ticket Selected</h3>
          <p style={{ fontSize: '0.9rem', marginTop: '0.5rem' }}>Select a ticket from the left to view and reply.</p>
        </div>
      )}
    </div>
  );
};

export default SupportInbox;
