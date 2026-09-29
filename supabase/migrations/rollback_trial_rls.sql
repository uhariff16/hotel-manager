-- Rollback Migration: Restore exactly the original RLS policies without trial expiry lock

-- Resorts
ALTER POLICY "Tenant Team Access" ON resorts USING (
  tenant_id = (SELECT p.tenant_id FROM public.profiles p WHERE p.id = auth.uid())
);
ALTER POLICY "Tenant Owner Management" ON resorts USING (
  auth.uid() = tenant_id
);

-- Cottages
ALTER POLICY "Staff/Tenant Select" ON cottages USING (
  belongs_to_tenant(tenant_id) OR is_super_admin()
);
ALTER POLICY "Staff/Tenant Insert" ON cottages WITH CHECK (
  belongs_to_tenant(tenant_id) OR is_super_admin()
);
ALTER POLICY "Staff/Tenant Update" ON cottages USING (
  belongs_to_tenant(tenant_id) OR is_super_admin()
);
ALTER POLICY "Admin/Owner Delete" ON cottages USING (
  auth.uid() = tenant_id OR is_super_admin()
);

-- Rooms
ALTER POLICY "Staff/Tenant Select" ON rooms USING (
  belongs_to_tenant(tenant_id) OR is_super_admin()
);
ALTER POLICY "Staff/Tenant Insert" ON rooms WITH CHECK (
  belongs_to_tenant(tenant_id) OR is_super_admin()
);
ALTER POLICY "Staff/Tenant Update" ON rooms USING (
  belongs_to_tenant(tenant_id) OR is_super_admin()
);
ALTER POLICY "Admin/Owner Delete" ON rooms USING (
  auth.uid() = tenant_id OR is_super_admin()
);

-- Bookings
ALTER POLICY "Staff/Tenant Select" ON bookings USING (
  belongs_to_tenant(tenant_id) OR is_super_admin()
);
ALTER POLICY "Staff/Tenant Insert" ON bookings WITH CHECK (
  belongs_to_tenant(tenant_id) OR is_super_admin()
);
ALTER POLICY "Staff/Tenant Update" ON bookings USING (
  belongs_to_tenant(tenant_id) OR is_super_admin()
);
ALTER POLICY "Admin/Owner Delete" ON bookings USING (
  auth.uid() = tenant_id OR is_super_admin()
);

-- Incomes
ALTER POLICY "Admin/Owner Financial Access" ON incomes USING (
  is_super_admin() OR (auth.uid() = tenant_id AND is_tenant_admin())
);

-- Expenses
ALTER POLICY "Admin/Owner Financial Access" ON expenses USING (
  is_super_admin() OR (auth.uid() = tenant_id AND is_tenant_admin())
);
