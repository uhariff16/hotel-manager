-- 1. Create Room Categories Table
CREATE TABLE IF NOT EXISTS room_categories (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    name TEXT NOT NULL,
    capacity INTEGER DEFAULT 2,
    resort_id UUID REFERENCES resorts(id) ON DELETE CASCADE,
    tenant_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
ALTER TABLE room_categories ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Staff/Tenant Select" ON room_categories;
CREATE POLICY "Staff/Tenant Select" ON room_categories FOR SELECT USING (belongs_to_tenant(tenant_id) OR is_super_admin());
DROP POLICY IF EXISTS "Staff/Tenant Insert" ON room_categories;
CREATE POLICY "Staff/Tenant Insert" ON room_categories FOR INSERT WITH CHECK (belongs_to_tenant(tenant_id) OR is_super_admin());
DROP POLICY IF EXISTS "Staff/Tenant Update" ON room_categories;
CREATE POLICY "Staff/Tenant Update" ON room_categories FOR UPDATE USING (belongs_to_tenant(tenant_id) OR is_super_admin());
DROP POLICY IF EXISTS "Admin/Owner Delete" ON room_categories;
CREATE POLICY "Admin/Owner Delete" ON room_categories FOR DELETE USING (auth.uid() = tenant_id OR is_super_admin());


-- 2. Create Rate Plans Table
CREATE TABLE IF NOT EXISTS rate_plans (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    name TEXT NOT NULL,
    resort_id UUID REFERENCES resorts(id) ON DELETE CASCADE,
    tenant_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
ALTER TABLE rate_plans ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Staff/Tenant Select" ON rate_plans;
CREATE POLICY "Staff/Tenant Select" ON rate_plans FOR SELECT USING (belongs_to_tenant(tenant_id) OR is_super_admin());
DROP POLICY IF EXISTS "Staff/Tenant Insert" ON rate_plans;
CREATE POLICY "Staff/Tenant Insert" ON rate_plans FOR INSERT WITH CHECK (belongs_to_tenant(tenant_id) OR is_super_admin());
DROP POLICY IF EXISTS "Staff/Tenant Update" ON rate_plans;
CREATE POLICY "Staff/Tenant Update" ON rate_plans FOR UPDATE USING (belongs_to_tenant(tenant_id) OR is_super_admin());
DROP POLICY IF EXISTS "Admin/Owner Delete" ON rate_plans;
CREATE POLICY "Admin/Owner Delete" ON rate_plans FOR DELETE USING (auth.uid() = tenant_id OR is_super_admin());


-- 3. Create Category Rates Table
CREATE TABLE IF NOT EXISTS category_rates (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    category_id UUID REFERENCES room_categories(id) ON DELETE CASCADE,
    rate_plan_id UUID REFERENCES rate_plans(id) ON DELETE CASCADE,
    price NUMERIC NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(category_id, rate_plan_id)
);
ALTER TABLE category_rates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Staff/Tenant Select" ON category_rates;
CREATE POLICY "Staff/Tenant Select" ON category_rates FOR SELECT USING (
    category_id IN (SELECT id FROM room_categories WHERE belongs_to_tenant(tenant_id) OR is_super_admin())
);
DROP POLICY IF EXISTS "Staff/Tenant Insert" ON category_rates;
CREATE POLICY "Staff/Tenant Insert" ON category_rates FOR INSERT WITH CHECK (
    category_id IN (SELECT id FROM room_categories WHERE belongs_to_tenant(tenant_id) OR is_super_admin())
);
DROP POLICY IF EXISTS "Staff/Tenant Update" ON category_rates;
CREATE POLICY "Staff/Tenant Update" ON category_rates FOR UPDATE USING (
    category_id IN (SELECT id FROM room_categories WHERE belongs_to_tenant(tenant_id) OR is_super_admin())
);
DROP POLICY IF EXISTS "Admin/Owner Delete" ON category_rates;
CREATE POLICY "Admin/Owner Delete" ON category_rates FOR DELETE USING (
    category_id IN (SELECT id FROM room_categories WHERE auth.uid() = tenant_id OR is_super_admin())
);


-- 4. Create Property Rates Table
CREATE TABLE IF NOT EXISTS property_rates (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    cottage_id UUID REFERENCES cottages(id) ON DELETE CASCADE,
    rate_plan_id UUID REFERENCES rate_plans(id) ON DELETE CASCADE,
    price NUMERIC NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(cottage_id, rate_plan_id)
);
ALTER TABLE property_rates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Staff/Tenant Select" ON property_rates;
CREATE POLICY "Staff/Tenant Select" ON property_rates FOR SELECT USING (
    cottage_id IN (SELECT id FROM cottages WHERE belongs_to_tenant(tenant_id) OR is_super_admin())
);
DROP POLICY IF EXISTS "Staff/Tenant Insert" ON property_rates;
CREATE POLICY "Staff/Tenant Insert" ON property_rates FOR INSERT WITH CHECK (
    cottage_id IN (SELECT id FROM cottages WHERE belongs_to_tenant(tenant_id) OR is_super_admin())
);
DROP POLICY IF EXISTS "Staff/Tenant Update" ON property_rates;
CREATE POLICY "Staff/Tenant Update" ON property_rates FOR UPDATE USING (
    cottage_id IN (SELECT id FROM cottages WHERE belongs_to_tenant(tenant_id) OR is_super_admin())
);
DROP POLICY IF EXISTS "Admin/Owner Delete" ON property_rates;
CREATE POLICY "Admin/Owner Delete" ON property_rates FOR DELETE USING (
    cottage_id IN (SELECT id FROM cottages WHERE auth.uid() = tenant_id OR is_super_admin())
);


-- 5. Update Rooms Table to link to category
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS category_id UUID REFERENCES room_categories(id) ON DELETE SET NULL;


-- 6. Data Migration (Migrate existing rooms and properties to use rate plans)


DO $$
DECLARE
    rec RECORD;
    v_cat_id UUID;
    v_rp_weekday UUID;
    v_rp_weekend UUID;
BEGIN
    -- Create default Rate Plans for each resort
    FOR rec IN SELECT DISTINCT resort_id, tenant_id FROM rooms LOOP
        IF rec.resort_id IS NOT NULL THEN
            -- Weekday Plan
            INSERT INTO rate_plans (name, resort_id, tenant_id)
            VALUES ('Weekday', rec.resort_id, rec.tenant_id)
            ON CONFLICT DO NOTHING
            RETURNING id INTO v_rp_weekday;

            IF v_rp_weekday IS NULL THEN
                SELECT id INTO v_rp_weekday FROM rate_plans WHERE name = 'Weekday' AND resort_id = rec.resort_id LIMIT 1;
            END IF;

            -- Weekend Plan
            INSERT INTO rate_plans (name, resort_id, tenant_id)
            VALUES ('Weekend', rec.resort_id, rec.tenant_id)
            ON CONFLICT DO NOTHING
            RETURNING id INTO v_rp_weekend;
            
            IF v_rp_weekend IS NULL THEN
                SELECT id INTO v_rp_weekend FROM rate_plans WHERE name = 'Weekend' AND resort_id = rec.resort_id LIMIT 1;
            END IF;
        END IF;
    END LOOP;

    -- Create Categories for existing rooms and migrate prices
    FOR rec IN SELECT * FROM rooms WHERE category_id IS NULL LOOP
        IF rec.resort_id IS NOT NULL THEN
            -- Check if category already exists for this room type
            SELECT id INTO v_cat_id FROM room_categories WHERE name = COALESCE(rec.room_type, 'Default Category') AND resort_id = rec.resort_id LIMIT 1;
            
            IF v_cat_id IS NULL THEN
                INSERT INTO room_categories (name, capacity, resort_id, tenant_id)
                VALUES (COALESCE(rec.room_type, 'Default Category'), COALESCE(rec.capacity, 2), rec.resort_id, rec.tenant_id)
                RETURNING id INTO v_cat_id;
            END IF;

            -- Link room to category
            UPDATE rooms SET category_id = v_cat_id WHERE id = rec.id;

            -- Get rate plan IDs again just in case
            SELECT id INTO v_rp_weekday FROM rate_plans WHERE name = 'Weekday' AND resort_id = rec.resort_id LIMIT 1;
            SELECT id INTO v_rp_weekend FROM rate_plans WHERE name = 'Weekend' AND resort_id = rec.resort_id LIMIT 1;

            -- Insert Rates (Ignore conflicts if multiple rooms of same category try to insert)
            IF v_rp_weekday IS NOT NULL THEN
                INSERT INTO category_rates (category_id, rate_plan_id, price)
                VALUES (v_cat_id, v_rp_weekday, COALESCE(rec.weekday_price, 0))
                ON CONFLICT (category_id, rate_plan_id) DO NOTHING;
            END IF;
            
            IF v_rp_weekend IS NOT NULL THEN
                INSERT INTO category_rates (category_id, rate_plan_id, price)
                VALUES (v_cat_id, v_rp_weekend, COALESCE(rec.weekend_price, 0))
                ON CONFLICT (category_id, rate_plan_id) DO NOTHING;
            END IF;
        END IF;
    END LOOP;

    -- Migrate Property Rates for entire property bookings
    FOR rec IN SELECT * FROM cottages LOOP
        IF rec.resort_id IS NOT NULL THEN
            -- Get rate plan IDs
            SELECT id INTO v_rp_weekday FROM rate_plans WHERE name = 'Weekday' AND resort_id = rec.resort_id LIMIT 1;
            SELECT id INTO v_rp_weekend FROM rate_plans WHERE name = 'Weekend' AND resort_id = rec.resort_id LIMIT 1;

            IF v_rp_weekday IS NOT NULL THEN
                INSERT INTO property_rates (cottage_id, rate_plan_id, price)
                VALUES (rec.id, v_rp_weekday, COALESCE(rec.weekday_price, 0))
                ON CONFLICT (cottage_id, rate_plan_id) DO NOTHING;
            END IF;
            
            IF v_rp_weekend IS NOT NULL THEN
                INSERT INTO property_rates (cottage_id, rate_plan_id, price)
                VALUES (rec.id, v_rp_weekend, COALESCE(rec.weekend_price, 0))
                ON CONFLICT (cottage_id, rate_plan_id) DO NOTHING;
            END IF;
        END IF;
    END LOOP;
END $$;

-- Note: We are keeping weekday_price, weekend_price, and seasonal_price on rooms and cottages table for now 
-- until we are confident the code is fully migrated, to avoid breaking the UI temporarily.
