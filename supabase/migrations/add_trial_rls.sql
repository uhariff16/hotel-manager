-- Forward Migration: Enforce trial expiry without restricting Super Admins

-- Resorts
ALTER POLICY "Tenant Team Access" ON resorts USING (
  tenant_id = (SELECT p.tenant_id FROM public.profiles p WHERE p.id = auth.uid())
  AND is_trial_expired() = FALSE
);
ALTER POLICY "Tenant Owner Management" ON resorts USING (
  auth.uid() = tenant_id 
  AND is_trial_expired() = FALSE
);

-- Cottages
ALTER POLICY "Staff/Tenant Select" ON cottages USING (
  is_super_admin() OR (belongs_to_tenant(tenant_id) AND is_trial_expired() = FALSE)
);
ALTER POLICY "Staff/Tenant Insert" ON cottages WITH CHECK (
  is_super_admin() OR (belongs_to_tenant(tenant_id) AND is_trial_expired() = FALSE)
);
ALTER POLICY "Staff/Tenant Update" ON cottages USING (
  is_super_admin() OR (belongs_to_tenant(tenant_id) AND is_trial_expired() = FALSE)
);
ALTER POLICY "Admin/Owner Delete" ON cottages USING (
  is_super_admin() OR (auth.uid() = tenant_id AND is_trial_expired() = FALSE)
);

-- Rooms
ALTER POLICY "Staff/Tenant Select" ON rooms USING (
  is_super_admin() OR (belongs_to_tenant(tenant_id) AND is_trial_expired() = FALSE)
);
ALTER POLICY "Staff/Tenant Insert" ON rooms WITH CHECK (
  is_super_admin() OR (belongs_to_tenant(tenant_id) AND is_trial_expired() = FALSE)
);
ALTER POLICY "Staff/Tenant Update" ON rooms USING (
  is_super_admin() OR (belongs_to_tenant(tenant_id) AND is_trial_expired() = FALSE)
);
ALTER POLICY "Admin/Owner Delete" ON rooms USING (
  is_super_admin() OR (auth.uid() = tenant_id AND is_trial_expired() = FALSE)
);

-- Bookings
ALTER POLICY "Staff/Tenant Select" ON bookings USING (
  is_super_admin() OR (belongs_to_tenant(tenant_id) AND is_trial_expired() = FALSE)
);
ALTER POLICY "Staff/Tenant Insert" ON bookings WITH CHECK (
  is_super_admin() OR (belongs_to_tenant(tenant_id) AND is_trial_expired() = FALSE)
);
ALTER POLICY "Staff/Tenant Update" ON bookings USING (
  is_super_admin() OR (belongs_to_tenant(tenant_id) AND is_trial_expired() = FALSE)
);
ALTER POLICY "Admin/Owner Delete" ON bookings USING (
  is_super_admin() OR (auth.uid() = tenant_id AND is_trial_expired() = FALSE)
);

-- Incomes
ALTER POLICY "Admin/Owner Financial Access" ON incomes USING (
  is_super_admin() OR (auth.uid() = tenant_id AND is_tenant_admin() AND is_trial_expired() = FALSE)
);

-- Expenses
ALTER POLICY "Admin/Owner Financial Access" ON expenses USING (
  is_super_admin() OR (auth.uid() = tenant_id AND is_tenant_admin() AND is_trial_expired() = FALSE)
);
