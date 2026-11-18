import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import toast from 'react-hot-toast';
import {
  Mail, MessageSquare, Send, CheckCircle, X, Search, Clock, User,
  Hotel, RotateCcw, RefreshCw, Filter, AlertCircle, ChevronRight
} from 'lucide-react';

export const formatTicketNumber = (ticket) => {
  if (!ticket || !ticket.ticket_number || !ticket.created_at) return ticket?.ticket_number ? String(ticket.ticket_number) : '';
  const date = new Date(ticket.created_at);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const num = String(ticket.ticket_number).padStart(4, '0');
  return `SP-${year}${month}${day}-${num}`;
};

export const calculateSupportMetrics = (tickets = []) => {
  let openCount = 0;
  let closedCount = 0;
  let unreadCount = 0;

  tickets.forEach(t => {
    if (t.status === 'open') openCount++;
    if (t.status === 'closed') closedCount++;
    if (t.admin_unread) unreadCount++;
  });

  return {
    openCount,
    closedCount,
    unreadCount,
    totalCount: tickets.length
  };
};

const SupportInbox = ({ superAdminProfile }) => {
  const [tickets, setTickets] = useState([]);
  const [resortsList, setResortsList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Filters & Sorting state
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all'); // 'all' | 'open' | 'closed' | 'unread'
  const [sortBy, setSortBy] = useState('latest'); // 'latest' | 'newest' | 'oldest' | 'subject_asc' | 'name_asc'

  // Selected ticket & chat state
  const [selectedTicket, setSelectedTicket] = useState(null);
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [isSending, setIsSending] = useState(false);

  // Resorts Map by Tenant ID
  const resortsMap = useMemo(() => {
    const map = new Map();
    (resortsList || []).forEach(r => {
      if (!map.has(r.tenant_id)) map.set(r.tenant_id, []);
      map.get(r.tenant_id).push(r.name);
    });
    return map;
  }, [resortsList]);

  // Initial load
  useEffect(() => {
    fetchTickets();

    // Realtime listeners
    const ticketSubscription = supabase
      .channel('admin-tickets')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'support_tickets' }, payload => {
        toast.success(`New Ticket: ${payload.new.subject}`);
        setTickets(current => [payload.new, ...current]);
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'support_tickets' }, payload => {
        setTickets(current => current.map(t => t.id === payload.new.id ? { ...t, ...payload.new } : t));
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

          // Re-fetch tickets to update unread and sorting
          fetchTickets(false);
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(ticketSubscription);
    };
  }, []);

  const fetchTickets = async (showLoader = true) => {
    if (showLoader) setLoading(true);
    else setRefreshing(true);

    try {
      const [ticketsRes, resortsRes] = await Promise.all([
        supabase
          .from('support_tickets')
          .select(`
            id, ticket_number, subject, status, admin_unread, created_at, updated_at, tenant_id,
            profiles ( id, full_name, email )
          `)
          .order('updated_at', { ascending: false }),
        supabase.from('resorts').select('id, name, tenant_id')
      ]);

      if (ticketsRes.error) {
        console.error("Error fetching tickets:", ticketsRes.error);
        toast.error("Failed to load tickets: " + ticketsRes.error.message);
      } else {
        setTickets(ticketsRes.data || []);
      }

      if (resortsRes.data) {
        setResortsList(resortsRes.data);
      }
    } catch (err) {
      console.error("Unexpected error loading support inbox:", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  // Metrics computation
  const summaryMetrics = useMemo(() => {
    return calculateSupportMetrics(tickets);
  }, [tickets]);

  // Filtered and Sorted Tickets
  const filteredAndSortedTickets = useMemo(() => {
    const query = searchTerm.toLowerCase().trim();

    const filtered = tickets.filter(ticket => {
      // 1. Status Filter
      if (statusFilter === 'open' && ticket.status !== 'open') return false;
      if (statusFilter === 'closed' && ticket.status !== 'closed') return false;
      if (statusFilter === 'unread' && !ticket.admin_unread) return false;

      // 2. Search Term Filter
      if (query) {
        const subject = (ticket.subject || '').toLowerCase();
        const rawNum = String(ticket.ticket_number || '');
        const formattedNum = formatTicketNumber(ticket).toLowerCase();
        const userName = (ticket.profiles?.full_name || '').toLowerCase();
        const email = (ticket.profiles?.email || '').toLowerCase();
        const resortNames = (resortsMap.get(ticket.tenant_id) || []).join(' ').toLowerCase();

        const matches =
          subject.includes(query) ||
          rawNum.includes(query) ||
          formattedNum.includes(query) ||
          userName.includes(query) ||
          email.includes(query) ||
          resortNames.includes(query);

        if (!matches) return false;
      }

      return true;
    });

    // Sorting
    return [...filtered].sort((a, b) => {
      if (sortBy === 'latest') {
        return new Date(b.updated_at || b.created_at) - new Date(a.updated_at || a.created_at);
      }
      if (sortBy === 'newest') {
        return new Date(b.created_at) - new Date(a.created_at);
      }
      if (sortBy === 'oldest') {
        return new Date(a.created_at) - new Date(b.created_at);
      }
      if (sortBy === 'subject_asc') {
        return (a.subject || '').localeCompare(b.subject || '');
      }
      if (sortBy === 'name_asc') {
        return (a.profiles?.full_name || '').localeCompare(b.profiles?.full_name || '');
      }
      return 0;
    });
  }, [tickets, searchTerm, statusFilter, sortBy, resortsMap]);

  const handleResetFilters = () => {
    setSearchTerm('');
    setStatusFilter('all');
    setSortBy('latest');
  };

  const openTicket = async (ticket) => {
    setSelectedTicket(ticket);

    // Mark as read if unread
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
      toast.success("Ticket closed");
      setTickets(prev => prev.map(t => t.id === ticketId ? { ...t, status: 'closed' } : t));
      if (selectedTicket?.id === ticketId) setSelectedTicket({ ...selectedTicket, status: 'closed' });
    }
  };

  const reopenTicket = async (e, ticketId) => {
    e.stopPropagation();
    const { error } = await supabase.from('support_tickets').update({ status: 'open' }).eq('id', ticketId);
    if (!error) {
      toast.success("Ticket reopened");
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
      setMessages(prev => [...prev, data]);
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
        await supabase.functions.invoke('saas-mailer', {
          body: payloadBody
        });
      } catch (err) {
        console.error("Failed to send email notification", err);
      }
    }
    setIsSending(false);
  };

  return (
    <div style={{ fontFamily: "'Outfit', sans-serif" }}>
      {/* ------------------------------------------------------------- */}
      {/* Top Header & Refresh Control                                  */}
      {/* ------------------------------------------------------------- */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <h2 style={{ fontSize: '1.5rem', color: '#0F2C59', fontWeight: 800, margin: 0 }}>
              Support Inbox
            </h2>
            <span style={{ fontSize: '0.75rem', fontWeight: 700, padding: '0.2rem 0.6rem', borderRadius: '12px', background: '#F1F5F9', color: '#475569', textTransform: 'uppercase' }}>
              Ticketing Desk
            </span>
          </div>
          <p style={{ color: '#64748B', margin: '0.25rem 0 0 0', fontSize: '0.875rem' }}>
            Manage subscriber queries, track technical issues, and reply to tenant requests.
          </p>
        </div>

        <button
          type="button"
          onClick={() => fetchTickets(false)}
          disabled={loading || refreshing}
          className="btn btn-outline"
          style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', fontSize: '0.85rem', fontWeight: 600, color: '#0F2C59', borderColor: '#CBD5E1', background: '#FFFFFF' }}
        >
          <RefreshCw size={14} className={refreshing ? 'spin' : ''} />
          {refreshing ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>

      {/* ------------------------------------------------------------- */}
      {/* Metric Summary Cards Grid                                      */}
      {/* ------------------------------------------------------------- */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
        gap: '1rem',
        marginBottom: '1.25rem'
      }}>
        {/* Open Tickets */}
        <div
          onClick={() => setStatusFilter(statusFilter === 'open' ? 'all' : 'open')}
          style={{
            background: '#FFFFFF',
            padding: '1.25rem',
            borderRadius: '12px',
            border: statusFilter === 'open' ? '2px solid #059669' : '1px solid #E2E8F0',
            boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
            cursor: 'pointer',
            transition: 'all 0.2s ease'
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
            <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#059669', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Open Tickets
            </span>
            <span style={{ width: '32px', height: '32px', borderRadius: '8px', background: '#DCFCE7', color: '#059669', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Clock size={18} />
            </span>
          </div>
          <div style={{ fontSize: '2rem', fontWeight: 900, color: '#059669', lineHeight: 1.1 }}>
            {summaryMetrics.openCount}
          </div>
          <div style={{ marginTop: '0.4rem', fontSize: '0.775rem', color: '#64748B' }}>
            Awaiting admin resolution
          </div>
        </div>

        {/* Unread Replies */}
        <div
          onClick={() => setStatusFilter(statusFilter === 'unread' ? 'all' : 'unread')}
          style={{
            background: '#FFFFFF',
            padding: '1.25rem',
            borderRadius: '12px',
            border: statusFilter === 'unread' ? '2px solid #2563EB' : (summaryMetrics.unreadCount > 0 ? '1px solid #BFDBFE' : '1px solid #E2E8F0'),
            boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
            cursor: 'pointer',
            transition: 'all 0.2s ease'
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
            <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#2563EB', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Unread Replies
            </span>
            <span style={{ width: '32px', height: '32px', borderRadius: '8px', background: '#DBEAFE', color: '#2563EB', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <AlertCircle size={18} />
            </span>
          </div>
          <div style={{ fontSize: '2rem', fontWeight: 900, color: '#2563EB', lineHeight: 1.1 }}>
            {summaryMetrics.unreadCount}
          </div>
          <div style={{ marginTop: '0.4rem', fontSize: '0.775rem', color: summaryMetrics.unreadCount > 0 ? '#1D4ED8' : '#64748B' }}>
            {summaryMetrics.unreadCount > 0 ? 'New customer messages' : 'All replies read'}
          </div>
        </div>

        {/* Closed Tickets */}
        <div
          onClick={() => setStatusFilter(statusFilter === 'closed' ? 'all' : 'closed')}
          style={{
            background: '#FFFFFF',
            padding: '1.25rem',
            borderRadius: '12px',
            border: statusFilter === 'closed' ? '2px solid #0F2C59' : '1px solid #E2E8F0',
            boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
            cursor: 'pointer',
            transition: 'all 0.2s ease'
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
            <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Closed / Resolved
            </span>
            <span style={{ width: '32px', height: '32px', borderRadius: '8px', background: '#F1F5F9', color: '#64748B', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <CheckCircle size={18} />
            </span>
          </div>
          <div style={{ fontSize: '2rem', fontWeight: 900, color: '#64748B', lineHeight: 1.1 }}>
            {summaryMetrics.closedCount}
          </div>
          <div style={{ marginTop: '0.4rem', fontSize: '0.775rem', color: '#64748B' }}>
            Completed tickets
          </div>
        </div>

        {/* Total Tickets */}
        <div
          onClick={() => setStatusFilter('all')}
          style={{
            background: '#FFFFFF',
            padding: '1.25rem',
            borderRadius: '12px',
            border: statusFilter === 'all' && !searchTerm ? '2px solid #0F2C59' : '1px solid #E2E8F0',
            boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
            cursor: 'pointer',
            transition: 'all 0.2s ease'
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
            <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#0F2C59', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Total Tickets
            </span>
            <span style={{ width: '32px', height: '32px', borderRadius: '8px', background: '#EEF2F6', color: '#0F2C59', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <MessageSquare size={18} />
            </span>
          </div>
          <div style={{ fontSize: '2rem', fontWeight: 900, color: '#0F2C59', lineHeight: 1.1 }}>
            {summaryMetrics.totalCount}
          </div>
          <div style={{ marginTop: '0.4rem', fontSize: '0.775rem', color: '#64748B' }}>
            Lifetime desk tickets
          </div>
        </div>
      </div>

      {/* ------------------------------------------------------------- */}
      {/* Search & Filters Bar                                          */}
      {/* ------------------------------------------------------------- */}
      <div style={{
        background: '#FFFFFF',
        padding: '1.1rem 1.25rem',
        borderRadius: '12px',
        border: '1px solid #E2E8F0',
        marginBottom: '1.25rem',
        display: 'flex',
        flexWrap: 'wrap',
        gap: '0.85rem',
        alignItems: 'center',
        justifyContent: 'space-between'
      }}>
        {/* Search Omnibar */}
        <div style={{ position: 'relative', flex: '1 1 280px' }}>
          <Search size={16} style={{ position: 'absolute', left: '0.85rem', top: '50%', transform: 'translateY(-50%)', color: '#94A3B8' }} />
          <input
            type="text"
            id="ticket-search-input"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search ticket #, subject, subscriber name, email, or property..."
            style={{
              width: '100%',
              padding: '0.55rem 0.85rem 0.55rem 2.4rem',
              borderRadius: '8px',
              border: '1px solid #CBD5E1',
              fontSize: '0.875rem',
              outline: 'none',
              fontFamily: "'Outfit', sans-serif"
            }}
          />
        </div>

        {/* Dropdown Filters & Controls */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.6rem', alignItems: 'center' }}>
          {/* Status Filter */}
          <select
            id="ticket-status-filter"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            style={{
              padding: '0.5rem 0.75rem',
              borderRadius: '8px',
              border: statusFilter !== 'all' ? '1.5px solid #0F2C59' : '1px solid #CBD5E1',
              fontSize: '0.85rem',
              background: statusFilter !== 'all' ? '#F0FDF4' : '#FFFFFF',
              color: '#0F2C59',
              fontWeight: 600,
              fontFamily: "'Outfit', sans-serif",
              cursor: 'pointer'
            }}
          >
            <option value="all">All Statuses ({summaryMetrics.totalCount})</option>
            <option value="open">Open Tickets ({summaryMetrics.openCount})</option>
            <option value="closed">Closed / Resolved ({summaryMetrics.closedCount})</option>
            <option value="unread">Unread Replies ({summaryMetrics.unreadCount})</option>
          </select>

          {/* Sort By Dropdown */}
          <select
            id="ticket-sort-filter"
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            style={{
              padding: '0.5rem 0.75rem',
              borderRadius: '8px',
              border: sortBy !== 'latest' ? '1.5px solid #0F2C59' : '1px solid #CBD5E1',
              fontSize: '0.85rem',
              background: '#FFFFFF',
              color: '#0F2C59',
              fontWeight: 600,
              fontFamily: "'Outfit', sans-serif",
              cursor: 'pointer'
            }}
          >
            <option value="latest">Sort: Latest Activity (Default)</option>
            <option value="newest">Sort: Newest Created</option>
            <option value="oldest">Sort: Oldest Created</option>
            <option value="subject_asc">Sort: Subject (A-Z)</option>
            <option value="name_asc">Sort: Subscriber Name (A-Z)</option>
          </select>

          {/* Reset Filters */}
          {(searchTerm || statusFilter !== 'all' || sortBy !== 'latest') && (
            <button
              type="button"
              onClick={handleResetFilters}
              className="btn btn-outline"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.35rem',
                padding: '0.5rem 0.85rem',
                fontSize: '0.85rem',
                fontWeight: 600,
                color: '#475569',
                borderColor: '#CBD5E1',
                background: '#FFFFFF',
                borderRadius: '8px'
              }}
            >
              <RotateCcw size={14} />
              Reset Filters
            </button>
          )}
        </div>
      </div>

      {/* ------------------------------------------------------------- */}
      {/* Two-Column Chat & Inbox Workspace                              */}
      {/* ------------------------------------------------------------- */}
      <div style={{ display: 'flex', gap: '1.25rem', height: '620px', minHeight: '520px' }}>
        {/* Left Side: Ticket List */}
        <div style={{
          width: '380px',
          background: '#FFFFFF',
          borderRadius: '12px',
          border: '1px solid #E2E8F0',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
          overflow: 'hidden'
        }}>
          {/* Header count bar */}
          <div style={{
            padding: '0.85rem 1.1rem',
            borderBottom: '1px solid #E2E8F0',
            background: '#F8FAFC',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}>
            <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Tickets
            </span>
            <span style={{ fontSize: '0.75rem', fontWeight: 700, background: '#E2E8F0', color: '#0F2C59', padding: '0.15rem 0.55rem', borderRadius: '10px' }}>
              Showing {filteredAndSortedTickets.length} of {tickets.length}
            </span>
          </div>

          {/* Ticket items scroll area */}
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {loading ? (
              <div style={{ padding: '3rem 1.5rem', textAlign: 'center', color: '#64748B' }}>
                <RefreshCw size={24} className="spin" style={{ margin: '0 auto 0.75rem', opacity: 0.6 }} />
                <div style={{ fontSize: '0.9rem', fontWeight: 600 }}>Loading support tickets...</div>
              </div>
            ) : filteredAndSortedTickets.length === 0 ? (
              <div style={{ padding: '3rem 1.5rem', textAlign: 'center', color: '#64748B' }}>
                <MessageSquare size={36} style={{ margin: '0 auto 0.85rem', color: '#CBD5E1' }} />
                <div style={{ fontSize: '0.95rem', fontWeight: 700, color: '#0F2C59', marginBottom: '0.25rem' }}>
                  No tickets found
                </div>
                <div style={{ fontSize: '0.825rem', color: '#94A3B8', marginBottom: '1rem' }}>
                  {searchTerm || statusFilter !== 'all' ? 'Try adjusting your search query or status filter.' : 'Zero tickets logged in desk.'}
                </div>
                {(searchTerm || statusFilter !== 'all') && (
                  <button
                    type="button"
                    onClick={handleResetFilters}
                    className="btn btn-outline"
                    style={{ fontSize: '0.8rem', fontWeight: 700, padding: '0.35rem 0.85rem' }}
                  >
                    Reset Filters
                  </button>
                )}
              </div>
            ) : (
              filteredAndSortedTickets.map(ticket => {
                const isSelected = selectedTicket?.id === ticket.id;
                const propertyNames = resortsMap.get(ticket.tenant_id) || [];
                const primaryProperty = propertyNames[0];

                return (
                  <div
                    key={ticket.id}
                    onClick={() => openTicket(ticket)}
                    style={{
                      padding: '1rem 1.1rem',
                      borderBottom: '1px solid #F1F5F9',
                      cursor: 'pointer',
                      background: isSelected ? '#F8FAFC' : '#FFFFFF',
                      borderLeft: isSelected ? '4px solid #0F2C59' : '4px solid transparent',
                      transition: 'all 0.15s ease'
                    }}
                    onMouseEnter={(e) => {
                      if (!isSelected) e.currentTarget.style.background = '#F8FAFC';
                    }}
                    onMouseLeave={(e) => {
                      if (!isSelected) e.currentTarget.style.background = '#FFFFFF';
                    }}
                  >
                    {/* Row 1: Number, Subject, Status Badge */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.5rem', marginBottom: '0.35rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flex: 1, minWidth: 0 }}>
                        <span style={{
                          fontFamily: 'monospace',
                          fontSize: '0.725rem',
                          background: '#F1F5F9',
                          color: '#475569',
                          padding: '0.1rem 0.35rem',
                          borderRadius: '4px',
                          fontWeight: 700,
                          flexShrink: 0
                        }}>
                          {formatTicketNumber(ticket)}
                        </span>
                        <div style={{
                          fontWeight: 700,
                          color: '#0F2C59',
                          fontSize: '0.875rem',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis'
                        }}>
                          {ticket.subject}
                        </div>
                        {ticket.admin_unread && (
                          <span style={{ width: '8px', height: '8px', background: '#2563EB', borderRadius: '50%', flexShrink: 0 }} title="Unread customer reply"></span>
                        )}
                      </div>

                      <span style={{
                        fontSize: '0.675rem',
                        padding: '0.15rem 0.5rem',
                        borderRadius: '10px',
                        fontWeight: 700,
                        textTransform: 'uppercase',
                        flexShrink: 0,
                        background: ticket.status === 'open' ? '#DCFCE7' : '#F1F5F9',
                        color: ticket.status === 'open' ? '#166534' : '#64748B'
                      }}>
                        {ticket.status}
                      </span>
                    </div>

                    {/* Row 2: Property (if mapped) */}
                    {primaryProperty && (
                      <div style={{ fontSize: '0.775rem', color: '#0F2C59', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.3rem', marginBottom: '0.2rem' }}>
                        <Hotel size={12} style={{ color: '#64748B' }} />
                        <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {primaryProperty} {propertyNames.length > 1 && `(+${propertyNames.length - 1})`}
                        </span>
                      </div>
                    )}

                    {/* Row 3: Subscriber & Timestamp */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.75rem', color: '#64748B', marginTop: '0.25rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', minWidth: 0 }}>
                        <User size={12} style={{ color: '#94A3B8' }} />
                        <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {ticket.profiles?.full_name || 'Subscriber'}
                        </span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', color: '#94A3B8', flexShrink: 0 }}>
                        <Clock size={11} />
                        <span>{ticket.updated_at ? new Date(ticket.updated_at).toLocaleDateString() : ''}</span>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right Side: Chat Window or Empty State */}
        {selectedTicket ? (
          <div style={{
            flex: 1,
            background: '#FFFFFF',
            borderRadius: '12px',
            border: '1px solid #E2E8F0',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            boxShadow: '0 1px 3px rgba(0,0,0,0.02)'
          }}>
            {/* Header */}
            <div style={{
              padding: '1.1rem 1.5rem',
              borderBottom: '1px solid #E2E8F0',
              background: '#F8FAFC',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '0.75rem'
            }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                  <span style={{
                    fontFamily: 'monospace',
                    fontSize: '0.775rem',
                    background: '#EEF2F6',
                    color: '#0F2C59',
                    padding: '0.15rem 0.45rem',
                    borderRadius: '4px',
                    fontWeight: 700
                  }}>
                    {formatTicketNumber(selectedTicket)}
                  </span>
                  <h3 style={{ margin: 0, fontSize: '1.15rem', color: '#0F2C59', fontWeight: 800 }}>
                    {selectedTicket.subject}
                  </h3>
                </div>
                <div style={{ fontSize: '0.8rem', color: '#64748B', display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                  <span>From: <strong>{selectedTicket.profiles?.full_name || 'Subscriber'}</strong> ({selectedTicket.profiles?.email || '—'})</span>
                  {resortsMap.get(selectedTicket.tenant_id)?.[0] && (
                    <span>Property: <strong>{resortsMap.get(selectedTicket.tenant_id)[0]}</strong></span>
                  )}
                  <span>Created: {new Date(selectedTicket.created_at).toLocaleDateString()}</span>
                </div>
              </div>

              <div>
                {selectedTicket.status === 'open' ? (
                  <button
                    onClick={(e) => closeTicket(e, selectedTicket.id)}
                    className="btn"
                    style={{
                      background: '#F1F5F9',
                      color: '#475569',
                      border: '1px solid #CBD5E1',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.45rem',
                      fontWeight: 600,
                      fontSize: '0.85rem',
                      borderRadius: '8px'
                    }}
                  >
                    <CheckCircle size={15} color="#059669" /> Close Ticket
                  </button>
                ) : (
                  <button
                    onClick={(e) => reopenTicket(e, selectedTicket.id)}
                    className="btn btn-outline"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.45rem',
                      fontWeight: 600,
                      fontSize: '0.85rem',
                      borderRadius: '8px'
                    }}
                  >
                    <RotateCcw size={14} /> Reopen Ticket
                  </button>
                )}
              </div>
            </div>

            {/* Messages Scroll Area */}
            <div style={{
              flex: 1,
              padding: '1.5rem',
              overflowY: 'auto',
              background: '#FCFCFD',
              display: 'flex',
              flexDirection: 'column',
              gap: '1rem'
            }}>
              {messages.length === 0 ? (
                <div style={{ padding: '3rem', textAlign: 'center', color: '#94A3B8', fontSize: '0.9rem' }}>
                  No messages in this ticket thread yet.
                </div>
              ) : (
                messages.map((msg) => (
                  <div
                    key={msg.id}
                    style={{
                      alignSelf: msg.is_from_admin ? 'flex-end' : 'flex-start',
                      maxWidth: '75%',
                      display: 'flex',
                      flexDirection: 'column'
                    }}
                  >
                    <div style={{
                      background: msg.is_from_admin ? '#0F2C59' : '#FFFFFF',
                      color: msg.is_from_admin ? '#FFFFFF' : '#334155',
                      padding: '0.95rem 1.25rem',
                      borderRadius: '12px',
                      borderBottomRightRadius: msg.is_from_admin ? '3px' : '12px',
                      borderBottomLeftRadius: msg.is_from_admin ? '12px' : '3px',
                      boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
                      border: msg.is_from_admin ? 'none' : '1px solid #E2E8F0',
                      lineHeight: 1.5,
                      fontSize: '0.925rem'
                    }}>
                      {msg.message}
                    </div>
                    <div style={{
                      fontSize: '0.7rem',
                      color: '#94A3B8',
                      marginTop: '0.3rem',
                      textAlign: msg.is_from_admin ? 'right' : 'left',
                      padding: '0 0.4rem'
                    }}>
                      {msg.is_from_admin ? 'You (Super Admin)' : (selectedTicket.profiles?.full_name || 'Subscriber')} • {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Input Form */}
            {selectedTicket.status === 'open' ? (
              <form onSubmit={sendMessage} style={{ padding: '1.1rem 1.5rem', borderTop: '1px solid #E2E8F0', display: 'flex', gap: '0.85rem', background: '#FFFFFF' }}>
                <input
                  type="text"
                  placeholder="Type your reply to the subscriber..."
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  style={{
                    flex: 1,
                    padding: '0.75rem 1.1rem',
                    borderRadius: '8px',
                    border: '1px solid #CBD5E1',
                    fontSize: '0.925rem',
                    outline: 'none',
                    fontFamily: "'Outfit', sans-serif"
                  }}
                  disabled={isSending}
                />
                <button
                  type="submit"
                  className="btn"
                  disabled={!newMessage.trim() || isSending}
                  style={{
                    background: newMessage.trim() ? '#059669' : '#E2E8F0',
                    color: newMessage.trim() ? '#FFFFFF' : '#94A3B8',
                    border: 'none',
                    padding: '0 1.5rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.45rem',
                    borderRadius: '8px',
                    fontWeight: 700,
                    cursor: newMessage.trim() ? 'pointer' : 'not-allowed',
                    transition: 'all 0.15s ease'
                  }}
                >
                  {isSending ? 'Sending...' : <><Send size={15} /> Send</>}
                </button>
              </form>
            ) : (
              <div style={{ padding: '1.1rem', borderTop: '1px solid #E2E8F0', background: '#F8FAFC', textAlign: 'center', color: '#64748B', fontSize: '0.85rem' }}>
                This ticket is currently closed. Click <strong>Reopen Ticket</strong> above to resume the thread.
              </div>
            )}
          </div>
        ) : (
          /* Empty selection state */
          <div style={{
            flex: 1,
            background: '#FFFFFF',
            borderRadius: '12px',
            border: '1px solid #E2E8F0',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '3rem',
            textAlign: 'center',
            color: '#64748B',
            boxShadow: '0 1px 3px rgba(0,0,0,0.02)'
          }}>
            <div style={{ width: '64px', height: '64px', borderRadius: '50%', background: '#F1F5F9', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '1rem' }}>
              <MessageSquare size={32} color="#0F2C59" />
            </div>
            <h4 style={{ fontSize: '1.2rem', color: '#0F2C59', fontWeight: 800, margin: '0 0 0.4rem 0' }}>
              No Ticket Selected
            </h4>
            <p style={{ color: '#64748B', fontSize: '0.9rem', maxWidth: '360px', margin: 0, lineHeight: 1.5 }}>
              Choose a support ticket from the list on the left to read messages and send an official admin reply.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default SupportInbox;
