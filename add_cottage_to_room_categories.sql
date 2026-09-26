ALTER TABLE room_categories ADD COLUMN cottage_id UUID REFERENCES cottages(id) ON DELETE CASCADE;
