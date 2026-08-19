-- Support Ticketing System Schema

CREATE TABLE IF NOT EXISTS support_tickets (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  ticket_number SERIAL,
  tenant_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  subject TEXT NOT NULL,
  status TEXT DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add ticket_number to existing table if running this script again
ALTER TABLE support_tickets ADD COLUMN IF NOT EXISTS ticket_number SERIAL;


CREATE TABLE IF NOT EXISTS support_messages (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  ticket_id UUID REFERENCES support_tickets(id) ON DELETE CASCADE,
  sender_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  message TEXT NOT NULL,
  is_from_admin BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- RLS Policies
ALTER TABLE support_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE support_messages ENABLE ROW LEVEL SECURITY;

-- Tenants can view their own tickets
CREATE POLICY "Tenants view own tickets" ON support_tickets 
  FOR SELECT USING (tenant_id = auth.uid() OR is_super_admin());

-- Tenants can create tickets
CREATE POLICY "Tenants create tickets" ON support_tickets 
  FOR INSERT WITH CHECK (tenant_id = auth.uid() OR is_super_admin());

-- Tenants can update their own tickets (e.g., close them)
CREATE POLICY "Tenants update own tickets" ON support_tickets 
  FOR UPDATE USING (tenant_id = auth.uid() OR is_super_admin());

-- Super Admins can manage all tickets
CREATE POLICY "Super Admins manage all tickets" ON support_tickets 
  FOR ALL USING (is_super_admin());

-- Messages
-- Users can view messages for their tickets
CREATE POLICY "View messages for owned tickets" ON support_messages 
  FOR SELECT USING (
    is_super_admin() OR 
    ticket_id IN (SELECT id FROM support_tickets WHERE tenant_id = auth.uid())
  );

-- Users can insert messages to their tickets
CREATE POLICY "Insert messages to owned tickets" ON support_messages 
  FOR INSERT WITH CHECK (
    is_super_admin() OR 
    (sender_id = auth.uid() AND ticket_id IN (SELECT id FROM support_tickets WHERE tenant_id = auth.uid()))
  );

-- Function to auto-update ticket updated_at on new message
CREATE OR REPLACE FUNCTION update_ticket_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE support_tickets SET updated_at = NOW() WHERE id = NEW.ticket_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_ticket_updated_at ON support_messages;
CREATE TRIGGER trigger_update_ticket_updated_at
  AFTER INSERT ON support_messages
  FOR EACH ROW
  EXECUTE FUNCTION update_ticket_updated_at();
