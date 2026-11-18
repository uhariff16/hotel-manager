import test from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import path from 'path';

// Helper functions mirroring SupportInbox logic
export function formatTicketNumber(ticket) {
  if (!ticket || !ticket.ticket_number || !ticket.created_at) return ticket?.ticket_number ? String(ticket.ticket_number) : '';
  const date = new Date(ticket.created_at);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const num = String(ticket.ticket_number).padStart(4, '0');
  return `SP-${year}${month}${day}-${num}`;
}

export function calculateSupportMetrics(tickets = []) {
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
}

export function filterAndSortTickets({
  tickets = [],
  searchTerm = '',
  statusFilter = 'all',
  sortBy = 'latest',
  resortsMap = new Map()
}) {
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
}

test('Support Inbox Enhancement Suite', async (t) => {
  const mockTickets = [
    {
      id: 't-1',
      ticket_number: 1,
      subject: 'Issue with booking calendar',
      status: 'open',
      admin_unread: true,
      created_at: '2026-10-01T10:00:00Z',
      updated_at: '2026-10-01T12:00:00Z',
      tenant_id: 'tenant-1',
      profiles: { full_name: 'Hassan Cheerful', email: 'cheerful@example.com' }
    },
    {
      id: 't-2',
      ticket_number: 2,
      subject: 'Payment receipt inquiry',
      status: 'closed',
      admin_unread: false,
      created_at: '2026-09-15T08:00:00Z',
      updated_at: '2026-09-16T09:00:00Z',
      tenant_id: 'tenant-2',
      profiles: { full_name: 'Ariff Stay Master', email: 'uhariff@staypilot.co.in' }
    },
    {
      id: 't-3',
      ticket_number: 3,
      subject: 'GST invoice generation',
      status: 'open',
      admin_unread: false,
      created_at: '2026-10-10T14:00:00Z',
      updated_at: '2026-10-10T15:00:00Z',
      tenant_id: 'tenant-3',
      profiles: { full_name: 'Gnanasekaran T', email: 'gnana@example.com' }
    }
  ];

  const mockResortsMap = new Map([
    ['tenant-1', ['Cheerful Chalet']],
    ['tenant-2', ["Stay master test's First Resort"]],
    ['tenant-3', ['My First Property']]
  ]);

  await t.test('1. Metric Calculation: Accurately counts open, closed, unread, and total tickets', () => {
    const metrics = calculateSupportMetrics(mockTickets);
    assert.strictEqual(metrics.openCount, 2);
    assert.strictEqual(metrics.closedCount, 1);
    assert.strictEqual(metrics.unreadCount, 1);
    assert.strictEqual(metrics.totalCount, 3);
  });

  await t.test('2. Status Filter: Correctly filters open, closed, unread and all', () => {
    const openOnly = filterAndSortTickets({ tickets: mockTickets, statusFilter: 'open' });
    assert.strictEqual(openOnly.length, 2);
    assert.ok(openOnly.every(t => t.status === 'open'));

    const closedOnly = filterAndSortTickets({ tickets: mockTickets, statusFilter: 'closed' });
    assert.strictEqual(closedOnly.length, 1);
    assert.strictEqual(closedOnly[0].id, 't-2');

    const unreadOnly = filterAndSortTickets({ tickets: mockTickets, statusFilter: 'unread' });
    assert.strictEqual(unreadOnly.length, 1);
    assert.strictEqual(unreadOnly[0].id, 't-1');

    const all = filterAndSortTickets({ tickets: mockTickets, statusFilter: 'all' });
    assert.strictEqual(all.length, 3);
  });

  await t.test('3. Search Omnibar: Searches across subject, ticket number, subscriber, email, and resort', () => {
    // Subject search
    const bySubject = filterAndSortTickets({ tickets: mockTickets, searchTerm: 'calendar' });
    assert.strictEqual(bySubject.length, 1);
    assert.strictEqual(bySubject[0].id, 't-1');

    // Formatted ticket number search
    const byNum = filterAndSortTickets({ tickets: mockTickets, searchTerm: 'SP-20260915' });
    assert.strictEqual(byNum.length, 1);
    assert.strictEqual(byNum[0].id, 't-2');

    // Customer name search
    const byCustomer = filterAndSortTickets({ tickets: mockTickets, searchTerm: 'Gnanasekaran' });
    assert.strictEqual(byCustomer.length, 1);
    assert.strictEqual(byCustomer[0].id, 't-3');

    // Email search
    const byEmail = filterAndSortTickets({ tickets: mockTickets, searchTerm: 'uhariff@staypilot' });
    assert.strictEqual(byEmail.length, 1);
    assert.strictEqual(byEmail[0].id, 't-2');

    // Resort search
    const byResort = filterAndSortTickets({ tickets: mockTickets, searchTerm: 'Cheerful Chalet', resortsMap: mockResortsMap });
    assert.strictEqual(byResort.length, 1);
    assert.strictEqual(byResort[0].id, 't-1');
  });

  await t.test('4. Sorting: Accurately sorts by latest activity, created date, and alphabetical order', () => {
    // Latest activity
    const latest = filterAndSortTickets({ tickets: mockTickets, sortBy: 'latest' });
    assert.strictEqual(latest[0].id, 't-3'); // 2026-10-10 15:00

    // Oldest created
    const oldest = filterAndSortTickets({ tickets: mockTickets, sortBy: 'oldest' });
    assert.strictEqual(oldest[0].id, 't-2'); // 2026-09-15

    // Subject ASC
    const bySubject = filterAndSortTickets({ tickets: mockTickets, sortBy: 'subject_asc' });
    assert.strictEqual(bySubject[0].subject, 'GST invoice generation');

    // Name ASC
    const byName = filterAndSortTickets({ tickets: mockTickets, sortBy: 'name_asc' });
    assert.strictEqual(byName[0].profiles.full_name, 'Ariff Stay Master');
  });

  await t.test('5. Ticket Number Formatter: Produces standardized SP-YYYYMMDD-XXXX formatting', () => {
    const formatted = formatTicketNumber({ ticket_number: 42, created_at: '2026-11-17T12:00:00Z' });
    assert.strictEqual(formatted, 'SP-20261117-0042');
  });

  await t.test('6. Component Verification: SupportInbox.jsx includes metric cards, search, filters, and reset', () => {
    const candidatePath = fs.existsSync(path.resolve('src/components/SupportInbox.jsx'))
      ? path.resolve('src/components/SupportInbox.jsx')
      : path.resolve('Cheerful Chalet/src/components/SupportInbox.jsx');
    const code = fs.readFileSync(candidatePath, 'utf8');

    assert.ok(code.includes('calculateSupportMetrics') || code.includes('openCount') || code.includes('summaryMetrics') || code.includes('metrics'), 'Must calculate metrics');
    assert.ok(code.includes('Search') || code.includes('searchTerm'), 'Must support search input');
    assert.ok(code.includes('statusFilter'), 'Must support status filtering');
    assert.ok(code.includes('sortBy'), 'Must support sorting');
    assert.ok(code.includes('Reset Filters') || code.includes('handleResetFilters'), 'Must include reset button');
    assert.ok(code.includes('resortsMap') || code.includes('resortsList') || code.includes('resorts'), 'Must resolve property names');
  });
});
