-- HOTEL MANAGER SAAS MIGRATION SCRIPT
-- RUN THIS IN THE SUPABASE SQL EDITOR

-- 1. Enable UUID Extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. Create/Update PROFILES Table
CREATE TABLE IF NOT EXISTS profiles (
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  full_name TEXT,
  role TEXT DEFAULT 'tenant_admin' CHECK (role IN ('super_admin', 'tenant_admin', 'manager', 'staff')),
  plan_type TEXT DEFAULT 'free' CHECK (plan_type IN ('free', 'pro', 'premium')),
  subscription_status TEXT DEFAULT 'active',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Ensure multi-tenancy columns exist (fix for 'column does not exist' error)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS tenant_id UUID DEFAULT NULL;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'tenant_admin'; -- Just in case

-- Migration: Set tenant_id for existing profiles that don't have one
UPDATE profiles SET tenant_id = id WHERE tenant_id IS NULL;

-- 3. Create/Update RESORTS Table
CREATE TABLE IF NOT EXISTS resorts (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  name TEXT NOT NULL,
  address TEXT,
  phone TEXT,
  email TEXT,
  timezone TEXT DEFAULT 'Asia/Kolkata',
  currency TEXT DEFAULT 'INR',
  logo_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE resorts ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES profiles(id) ON DELETE CASCADE;

-- 4. Update Operational Tables with Multi-Tenancy Columns
ALTER TABLE cottages ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES profiles(id) ON DELETE CASCADE;
ALTER TABLE cottages ADD COLUMN IF NOT EXISTS resort_id UUID REFERENCES resorts(id) ON DELETE CASCADE;

ALTER TABLE rooms ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES profiles(id) ON DELETE CASCADE;
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS resort_id UUID REFERENCES resorts(id) ON DELETE CASCADE;

ALTER TABLE bookings ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES profiles(id) ON DELETE CASCADE;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS resort_id UUID REFERENCES resorts(id) ON DELETE CASCADE;

ALTER TABLE incomes ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES profiles(id) ON DELETE CASCADE;
ALTER TABLE incomes ADD COLUMN IF NOT EXISTS resort_id UUID REFERENCES resorts(id) ON DELETE CASCADE;

ALTER TABLE expenses ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES profiles(id) ON DELETE CASCADE;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS resort_id UUID REFERENCES resorts(id) ON DELETE CASCADE;

-- 5. Enable Row Level Security (RLS)
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE resorts ENABLE ROW LEVEL SECURITY;
ALTER TABLE cottages ENABLE ROW LEVEL SECURITY;
ALTER TABLE rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE incomes ENABLE ROW LEVEL SECURITY;
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;

-- 6. Helper Functions for Role-Based Access
-- IMPORTANT: Use JWT app_metadata for high-performance, non-recursive RLS bypass.
CREATE OR REPLACE FUNCTION is_super_admin()
RETURNS BOOLEAN AS $$
BEGIN
  -- 1. Check JWT claims (Standard for SaaS bypass)
  IF (auth.jwt() -> 'app_metadata' ->> 'role') = 'super_admin' THEN
    RETURN TRUE;
  END IF;

  -- 2. Fallback: Direct non-recursive check of profiles table
  -- We use a limited select to avoid triggering complex RLS loops
  RETURN EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE id = auth.uid() AND role = 'super_admin'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION is_tenant_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN (auth.jwt() -> 'app_metadata' ->> 'role') = 'tenant_admin' 
      OR (auth.jwt() -> 'app_metadata' ->> 'role') = 'super_admin';
END;
$$ LANGUAGE plpgsql STABLE;

-- 7. Advanced Trigger for Automatic Profile Creation on Signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  v_role TEXT;
  v_tenant_id UUID;
  v_full_name TEXT;
BEGIN
  v_role := COALESCE(NEW.raw_user_meta_data->>'role', 'tenant_admin');
  v_tenant_id := (NEW.raw_user_meta_data->>'tenant_id')::UUID;
  v_full_name := COALESCE(NEW.raw_user_meta_data->>'full_name', 'New Member');
  
  IF v_tenant_id IS NULL THEN
    v_tenant_id := NEW.id;
  END IF;

  -- 1. Create Profile
  INSERT INTO public.profiles (id, full_name, role, tenant_id)
  VALUES (NEW.id, v_full_name, v_role, v_tenant_id);

  -- 2. Sync role and tenant_id to auth metadata so it's available in JWT (for RLS performance)
  UPDATE auth.users 
  SET raw_app_meta_data = raw_app_meta_data || 
    jsonb_build_object('role', v_role, 'tenant_id', v_tenant_id)
  WHERE id = NEW.id;

  -- 3. If it's a new tenant (role = tenant_admin), create their first resort
  IF v_role = 'tenant_admin' THEN
    INSERT INTO public.resorts (tenant_id, name)
    VALUES (v_tenant_id, 'My First Property');
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- (Re)create Trigger
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Migration: Ensure the primary admin user has the correct role
-- Run this to fix the visibility issue for the current Super Admin
UPDATE profiles SET role = 'super_admin' WHERE id IN (SELECT id FROM auth.users WHERE email = 'uhariff@gmail.com');

-- Also sync to auth metadata for JWT-based RLS (Crucial for performance/non-recursion)
UPDATE auth.users 
SET raw_app_meta_data = jsonb_build_object('role', 'super_admin', 'tenant_id', id)
WHERE email = 'uhariff@gmail.com';

-- 8. Updated RLS POLICIES (Tenant Isolation + Super Admin Bypass)

-- PROFILES Policies
DROP POLICY IF EXISTS "Super Admins view all profiles" ON profiles;
DROP POLICY IF EXISTS "Users view global team" ON profiles;
DROP POLICY IF EXISTS "Super Admins manage all profiles" ON profiles;
DROP POLICY IF EXISTS "Users update own profile" ON profiles;

CREATE POLICY "Super Admins view all profiles" ON profiles FOR SELECT USING (is_super_admin());
CREATE POLICY "Users view global team" ON profiles FOR SELECT USING (
  id = auth.uid() OR 
  tenant_id = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid
);
CREATE POLICY "Super Admins manage all profiles" ON profiles FOR ALL USING (is_super_admin());
CREATE POLICY "Users update own profile" ON profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Tenants manage staff" ON profiles FOR ALL USING (
  tenant_id = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid 
  AND is_tenant_admin()
  AND id != auth.uid()
);

-- RESORTS Policies
DROP POLICY IF EXISTS "Super Admin Global Access" ON resorts;
DROP POLICY IF EXISTS "Tenant Team Access" ON resorts;
DROP POLICY IF EXISTS "Tenant Owner Management" ON resorts;

CREATE POLICY "Super Admin Global Access" ON resorts FOR ALL USING (is_super_admin());
CREATE POLICY "Tenant Team Access" ON resorts FOR SELECT USING (
  tenant_id = (SELECT p.tenant_id FROM public.profiles p WHERE p.id = auth.uid())
);
CREATE POLICY "Tenant Owner Management" ON resorts FOR ALL USING (auth.uid() = tenant_id);

-- OPERATIONAL TABLES Policies (Cottages, Rooms, Bookings, Incomes, Expenses)
-- Function to check if user belongs to a specific tenant (Optimized to use JWT)
CREATE OR REPLACE FUNCTION belongs_to_tenant(target_tenant_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid = target_tenant_id;
END;
$$ LANGUAGE plpgsql STABLE;

-- Cottages
DROP POLICY IF EXISTS "Staff/Tenant Select" ON cottages;
DROP POLICY IF EXISTS "Staff/Tenant Insert" ON cottages;
DROP POLICY IF EXISTS "Staff/Tenant Update" ON cottages;
DROP POLICY IF EXISTS "Admin/Owner Delete" ON cottages;

CREATE POLICY "Staff/Tenant Select" ON cottages FOR SELECT USING (belongs_to_tenant(tenant_id) OR is_super_admin());
CREATE POLICY "Staff/Tenant Insert" ON cottages FOR INSERT WITH CHECK (belongs_to_tenant(tenant_id) OR is_super_admin());
CREATE POLICY "Staff/Tenant Update" ON cottages FOR UPDATE USING (belongs_to_tenant(tenant_id) OR is_super_admin());
CREATE POLICY "Admin/Owner Delete" ON cottages FOR DELETE USING (auth.uid() = tenant_id OR is_super_admin());

-- Rooms
DROP POLICY IF EXISTS "Staff/Tenant Select" ON rooms;
DROP POLICY IF EXISTS "Staff/Tenant Insert" ON rooms;
DROP POLICY IF EXISTS "Staff/Tenant Update" ON rooms;
DROP POLICY IF EXISTS "Admin/Owner Delete" ON rooms;

CREATE POLICY "Staff/Tenant Select" ON rooms FOR SELECT USING (belongs_to_tenant(tenant_id) OR is_super_admin());
CREATE POLICY "Staff/Tenant Insert" ON rooms FOR INSERT WITH CHECK (belongs_to_tenant(tenant_id) OR is_super_admin());
CREATE POLICY "Staff/Tenant Update" ON rooms FOR UPDATE USING (belongs_to_tenant(tenant_id) OR is_super_admin());
CREATE POLICY "Admin/Owner Delete" ON rooms FOR DELETE USING (auth.uid() = tenant_id OR is_super_admin());

-- Bookings
DROP POLICY IF EXISTS "Staff/Tenant Select" ON bookings;
DROP POLICY IF EXISTS "Staff/Tenant Insert" ON bookings;
DROP POLICY IF EXISTS "Staff/Tenant Update" ON bookings;
DROP POLICY IF EXISTS "Admin/Owner Delete" ON bookings;

CREATE POLICY "Staff/Tenant Select" ON bookings FOR SELECT USING (belongs_to_tenant(tenant_id) OR is_super_admin());
CREATE POLICY "Staff/Tenant Insert" ON bookings FOR INSERT WITH CHECK (belongs_to_tenant(tenant_id) OR is_super_admin());
CREATE POLICY "Staff/Tenant Update" ON bookings FOR UPDATE USING (belongs_to_tenant(tenant_id) OR is_super_admin());
CREATE POLICY "Admin/Owner Delete" ON bookings FOR DELETE USING (auth.uid() = tenant_id OR is_super_admin());

-- Financials (Incomes/Expenses)
DROP POLICY IF EXISTS "Admin/Owner Financial Access" ON incomes;
CREATE POLICY "Admin/Owner Financial Access" ON incomes FOR ALL USING (
  is_super_admin() OR (auth.uid() = tenant_id AND is_tenant_admin())
);

DROP POLICY IF EXISTS "Admin/Owner Financial Access" ON expenses;
CREATE POLICY "Admin/Owner Financial Access" ON expenses FOR ALL USING (
  is_super_admin() OR (auth.uid() = tenant_id AND is_tenant_admin())
);

-- 9. DELETION SYNCHRONIZATION (Profile -> Auth Cleanup)
CREATE OR REPLACE FUNCTION public.handle_delete_user()
RETURNS TRIGGER AS $$
BEGIN
  -- SAFETY CHECK: Prevent deletion of protected seed accounts
  IF EXISTS (
    SELECT 1 FROM auth.users 
    WHERE id = OLD.id AND email = 'uhariff@gmail.com'
  ) THEN
    RAISE EXCEPTION 'PROTECTED ACCOUNT: The main Super Admin account cannot be deleted.';
  END IF;

  DELETE FROM auth.users WHERE id = OLD.id;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_delete_auth_user ON public.profiles;
CREATE TRIGGER trigger_delete_auth_user
  AFTER DELETE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_delete_user();

-- Ensure foreign key cascade is active for existing table
ALTER TABLE public.profiles 
  DROP CONSTRAINT IF EXISTS profiles_id_fkey,
  ADD CONSTRAINT profiles_id_fkey 
    FOREIGN KEY (id) 
    REFERENCES auth.users(id) 
    ON DELETE CASCADE;
- -   S u p p o r t   T i c k e t i n g   S y s t e m   S c h e m a  
  
 C R E A T E   T A B L E   I F   N O T   E X I S T S   s u p p o r t _ t i c k e t s   (  
     i d   U U I D   D E F A U L T   u u i d _ g e n e r a t e _ v 4 ( )   P R I M A R Y   K E Y ,  
     t e n a n t _ i d   U U I D   R E F E R E N C E S   p r o f i l e s ( i d )   O N   D E L E T E   C A S C A D E ,  
     s u b j e c t   T E X T   N O T   N U L L ,  
     s t a t u s   T E X T   D E F A U L T   ' o p e n '   C H E C K   ( s t a t u s   I N   ( ' o p e n ' ,   ' c l o s e d ' ) ) ,  
     c r e a t e d _ a t   T I M E S T A M P   W I T H   T I M E   Z O N E   D E F A U L T   N O W ( ) ,  
     u p d a t e d _ a t   T I M E S T A M P   W I T H   T I M E   Z O N E   D E F A U L T   N O W ( )  
 ) ;  
  
 C R E A T E   T A B L E   I F   N O T   E X I S T S   s u p p o r t _ m e s s a g e s   (  
     i d   U U I D   D E F A U L T   u u i d _ g e n e r a t e _ v 4 ( )   P R I M A R Y   K E Y ,  
     t i c k e t _ i d   U U I D   R E F E R E N C E S   s u p p o r t _ t i c k e t s ( i d )   O N   D E L E T E   C A S C A D E ,  
     s e n d e r _ i d   U U I D   R E F E R E N C E S   p r o f i l e s ( i d )   O N   D E L E T E   C A S C A D E ,  
     m e s s a g e   T E X T   N O T   N U L L ,  
     i s _ f r o m _ a d m i n   B O O L E A N   D E F A U L T   F A L S E ,  
     c r e a t e d _ a t   T I M E S T A M P   W I T H   T I M E   Z O N E   D E F A U L T   N O W ( )  
 ) ;  
  
 - -   R L S   P o l i c i e s  
 A L T E R   T A B L E   s u p p o r t _ t i c k e t s   E N A B L E   R O W   L E V E L   S E C U R I T Y ;  
 A L T E R   T A B L E   s u p p o r t _ m e s s a g e s   E N A B L E   R O W   L E V E L   S E C U R I T Y ;  
  
 - -   T e n a n t s   c a n   v i e w   t h e i r   o w n   t i c k e t s  
 C R E A T E   P O L I C Y   " T e n a n t s   v i e w   o w n   t i c k e t s "   O N   s u p p o r t _ t i c k e t s    
     F O R   S E L E C T   U S I N G   ( t e n a n t _ i d   =   a u t h . u i d ( )   O R   i s _ s u p e r _ a d m i n ( ) ) ;  
  
 - -   T e n a n t s   c a n   c r e a t e   t i c k e t s  
 C R E A T E   P O L I C Y   " T e n a n t s   c r e a t e   t i c k e t s "   O N   s u p p o r t _ t i c k e t s    
     F O R   I N S E R T   W I T H   C H E C K   ( t e n a n t _ i d   =   a u t h . u i d ( )   O R   i s _ s u p e r _ a d m i n ( ) ) ;  
  
 - -   T e n a n t s   c a n   u p d a t e   t h e i r   o w n   t i c k e t s   ( e . g . ,   c l o s e   t h e m )  
 C R E A T E   P O L I C Y   " T e n a n t s   u p d a t e   o w n   t i c k e t s "   O N   s u p p o r t _ t i c k e t s    
     F O R   U P D A T E   U S I N G   ( t e n a n t _ i d   =   a u t h . u i d ( )   O R   i s _ s u p e r _ a d m i n ( ) ) ;  
  
 - -   S u p e r   A d m i n s   c a n   m a n a g e   a l l   t i c k e t s  
 C R E A T E   P O L I C Y   " S u p e r   A d m i n s   m a n a g e   a l l   t i c k e t s "   O N   s u p p o r t _ t i c k e t s    
     F O R   A L L   U S I N G   ( i s _ s u p e r _ a d m i n ( ) ) ;  
  
 - -   M e s s a g e s  
 - -   U s e r s   c a n   v i e w   m e s s a g e s   f o r   t h e i r   t i c k e t s  
 C R E A T E   P O L I C Y   " V i e w   m e s s a g e s   f o r   o w n e d   t i c k e t s "   O N   s u p p o r t _ m e s s a g e s    
     F O R   S E L E C T   U S I N G   (  
         i s _ s u p e r _ a d m i n ( )   O R    
         t i c k e t _ i d   I N   ( S E L E C T   i d   F R O M   s u p p o r t _ t i c k e t s   W H E R E   t e n a n t _ i d   =   a u t h . u i d ( ) )  
     ) ;  
  
 - -   U s e r s   c a n   i n s e r t   m e s s a g e s   t o   t h e i r   t i c k e t s  
 C R E A T E   P O L I C Y   " I n s e r t   m e s s a g e s   t o   o w n e d   t i c k e t s "   O N   s u p p o r t _ m e s s a g e s    
     F O R   I N S E R T   W I T H   C H E C K   (  
         i s _ s u p e r _ a d m i n ( )   O R    
         ( s e n d e r _ i d   =   a u t h . u i d ( )   A N D   t i c k e t _ i d   I N   ( S E L E C T   i d   F R O M   s u p p o r t _ t i c k e t s   W H E R E   t e n a n t _ i d   =   a u t h . u i d ( ) ) )  
     ) ;  
  
 - -   F u n c t i o n   t o   a u t o - u p d a t e   t i c k e t   u p d a t e d _ a t   o n   n e w   m e s s a g e  
 C R E A T E   O R   R E P L A C E   F U N C T I O N   u p d a t e _ t i c k e t _ u p d a t e d _ a t ( )  
 R E T U R N S   T R I G G E R   A S   $ $  
 B E G I N  
     U P D A T E   s u p p o r t _ t i c k e t s   S E T   u p d a t e d _ a t   =   N O W ( )   W H E R E   i d   =   N E W . t i c k e t _ i d ;  
     R E T U R N   N E W ;  
 E N D ;  
 $ $   L A N G U A G E   p l p g s q l ;  
  
 D R O P   T R I G G E R   I F   E X I S T S   t r i g g e r _ u p d a t e _ t i c k e t _ u p d a t e d _ a t   O N   s u p p o r t _ m e s s a g e s ;  
 C R E A T E   T R I G G E R   t r i g g e r _ u p d a t e _ t i c k e t _ u p d a t e d _ a t  
     A F T E R   I N S E R T   O N   s u p p o r t _ m e s s a g e s  
     F O R   E A C H   R O W  
     E X E C U T E   F U N C T I O N   u p d a t e _ t i c k e t _ u p d a t e d _ a t ( ) ;  
 A L T E R   T A B L E   s u p p o r t _ t i c k e t s   A D D   C O L U M N   I F   N O T   E X I S T S   t i c k e t _ n u m b e r   S E R I A L ;  
 - -   A d d   s u p p o r t   f o r   s p e c i f i c   p l a t f o r m   a d m i n s  
  
 - -   H e l p e r   f u n c t i o n s   t o   c h e c k   s p e c i f i c   r o l e s  
 C R E A T E   O R   R E P L A C E   F U N C T I O N   i s _ s u p p o r t _ a d m i n ( )  
 R E T U R N S   B O O L E A N   A S   $ $  
 B E G I N  
     I F   ( a u t h . j w t ( )   - >   ' a p p _ m e t a d a t a '   - > >   ' r o l e ' )   =   ' s u p p o r t _ a d m i n '   T H E N  
         R E T U R N   T R U E ;  
     E N D   I F ;  
     R E T U R N   E X I S T S   (  
         S E L E C T   1   F R O M   p u b l i c . p r o f i l e s    
         W H E R E   i d   =   a u t h . u i d ( )   A N D   r o l e   =   ' s u p p o r t _ a d m i n '  
     ) ;  
 E N D ;  
 $ $   L A N G U A G E   p l p g s q l   S E C U R I T Y   D E F I N E R   S E T   s e a r c h _ p a t h   =   p u b l i c ;  
  
 C R E A T E   O R   R E P L A C E   F U N C T I O N   i s _ b i l l i n g _ a d m i n ( )  
 R E T U R N S   B O O L E A N   A S   $ $  
 B E G I N  
     I F   ( a u t h . j w t ( )   - >   ' a p p _ m e t a d a t a '   - > >   ' r o l e ' )   =   ' b i l l i n g _ a d m i n '   T H E N  
         R E T U R N   T R U E ;  
     E N D   I F ;  
     R E T U R N   E X I S T S   (  
         S E L E C T   1   F R O M   p u b l i c . p r o f i l e s    
         W H E R E   i d   =   a u t h . u i d ( )   A N D   r o l e   =   ' b i l l i n g _ a d m i n '  
     ) ;  
 E N D ;  
 $ $   L A N G U A G E   p l p g s q l   S E C U R I T Y   D E F I N E R   S E T   s e a r c h _ p a t h   =   p u b l i c ;  
  
 - -   P r o f i l e s  
 C R E A T E   P O L I C Y   " S u p p o r t   A d m i n s   v i e w   p r o f i l e s "   O N   p r o f i l e s   F O R   S E L E C T   U S I N G   ( i s _ s u p p o r t _ a d m i n ( ) ) ;  
 C R E A T E   P O L I C Y   " B i l l i n g   A d m i n s   v i e w   p r o f i l e s "   O N   p r o f i l e s   F O R   S E L E C T   U S I N G   ( i s _ b i l l i n g _ a d m i n ( ) ) ;  
 C R E A T E   P O L I C Y   " B i l l i n g   A d m i n s   u p d a t e   p r o f i l e s "   O N   p r o f i l e s   F O R   U P D A T E   U S I N G   ( i s _ b i l l i n g _ a d m i n ( ) ) ;  
  
 - -   S u p p o r t   S y s t e m  
 C R E A T E   P O L I C Y   " S u p p o r t   A d m i n s   m a n a g e   a l l   t i c k e t s "   O N   s u p p o r t _ t i c k e t s   F O R   A L L   U S I N G   ( i s _ s u p p o r t _ a d m i n ( ) ) ;  
 C R E A T E   P O L I C Y   " S u p p o r t   A d m i n s   v i e w   m e s s a g e s "   O N   s u p p o r t _ m e s s a g e s   F O R   S E L E C T   U S I N G   ( i s _ s u p p o r t _ a d m i n ( ) ) ;  
 C R E A T E   P O L I C Y   " S u p p o r t   A d m i n s   i n s e r t   m e s s a g e s "   O N   s u p p o r t _ m e s s a g e s   F O R   I N S E R T   W I T H   C H E C K   ( i s _ s u p p o r t _ a d m i n ( ) ) ;  
  
 - -   D a s h b o a r d   S t a t s   ( B i l l i n g   A d m i n s )  
 C R E A T E   P O L I C Y   " B i l l i n g   A d m i n s   v i e w   r e s o r t s "   O N   r e s o r t s   F O R   S E L E C T   U S I N G   ( i s _ b i l l i n g _ a d m i n ( ) ) ;  
 C R E A T E   P O L I C Y   " B i l l i n g   A d m i n s   v i e w   b o o k i n g s "   O N   b o o k i n g s   F O R   S E L E C T   U S I N G   ( i s _ b i l l i n g _ a d m i n ( ) ) ;  
 C R E A T E   P O L I C Y   " B i l l i n g   A d m i n s   v i e w   i n c o m e s "   O N   i n c o m e s   F O R   S E L E C T   U S I N G   ( i s _ b i l l i n g _ a d m i n ( ) ) ;  
 