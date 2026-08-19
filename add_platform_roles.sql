-- Add support for specific platform admins

-- Helper functions to check specific roles
CREATE OR REPLACE FUNCTION is_support_admin()
RETURNS BOOLEAN AS $$
BEGIN
  IF (auth.jwt() -> 'app_metadata' ->> 'role') = 'support_admin' THEN
    RETURN TRUE;
  END IF;
  RETURN EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE id = auth.uid() AND role = 'support_admin'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION is_billing_admin()
RETURNS BOOLEAN AS $$
BEGIN
  IF (auth.jwt() -> 'app_metadata' ->> 'role') = 'billing_admin' THEN
    RETURN TRUE;
  END IF;
  RETURN EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE id = auth.uid() AND role = 'billing_admin'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Profiles
CREATE POLICY "Support Admins view profiles" ON profiles FOR SELECT USING (is_support_admin());
CREATE POLICY "Billing Admins view profiles" ON profiles FOR SELECT USING (is_billing_admin());
CREATE POLICY "Billing Admins update profiles" ON profiles FOR UPDATE USING (is_billing_admin());

-- Support System
CREATE POLICY "Support Admins manage all tickets" ON support_tickets FOR ALL USING (is_support_admin());
CREATE POLICY "Support Admins view messages" ON support_messages FOR SELECT USING (is_support_admin());
CREATE POLICY "Support Admins insert messages" ON support_messages FOR INSERT WITH CHECK (is_support_admin());

-- Dashboard Stats (Billing Admins)
CREATE POLICY "Billing Admins view resorts" ON resorts FOR SELECT USING (is_billing_admin());
CREATE POLICY "Billing Admins view bookings" ON bookings FOR SELECT USING (is_billing_admin());
CREATE POLICY "Billing Admins view incomes" ON incomes FOR SELECT USING (is_billing_admin());
