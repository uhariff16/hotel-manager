-- Database Schema for Hotel Manager

-- 1. Cottages
CREATE TABLE cottages (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  name TEXT NOT NULL,
  max_capacity INTEGER NOT NULL DEFAULT 1,
  weekday_price NUMERIC NOT NULL,
  weekend_price NUMERIC NOT NULL,
  seasonal_price NUMERIC NOT NULL,
  status TEXT NOT NULL DEFAULT 'Available' CHECK (status IN ('Available', 'Maintenance', 'Blocked')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Rooms
CREATE TABLE rooms (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  cottage_id UUID REFERENCES cottages(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  capacity INTEGER NOT NULL DEFAULT 1,
  weekday_price NUMERIC NOT NULL,
  weekend_price NUMERIC NOT NULL,
  seasonal_price NUMERIC NOT NULL,
  status TEXT NOT NULL DEFAULT 'Available' CHECK (status IN ('Available', 'Maintenance', 'Blocked')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. Bookings
CREATE TABLE bookings (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  reference_number TEXT UNIQUE,
  guest_name TEXT NOT NULL,
  phone_number TEXT NOT NULL,
  check_in_date DATE NOT NULL,
  check_out_date DATE NOT NULL,
  number_of_guests INTEGER NOT NULL,
  booking_type TEXT NOT NULL CHECK (booking_type IN ('Entire Cottage', 'Room')),
  cottage_id UUID REFERENCES cottages(id) ON DELETE SET NULL,
  room_id UUID REFERENCES rooms(id) ON DELETE SET NULL,
  room_ids UUID[] DEFAULT '{}',
  night_count INTEGER NOT NULL,
  price_type TEXT NOT NULL,
  base_amount NUMERIC NOT NULL,
  extra_guest_charges NUMERIC DEFAULT 0,
  addons_cost NUMERIC DEFAULT 0,
  total_amount NUMERIC NOT NULL,
  advance_paid NUMERIC DEFAULT 0,
  balance_amount NUMERIC NOT NULL,
  booking_source TEXT DEFAULT 'Direct',
  status TEXT NOT NULL DEFAULT 'Confirmed' CHECK (status IN ('Confirmed', 'Checked-in', 'Completed', 'Cancelled')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 4. Income
CREATE TABLE incomes (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  "date" DATE NOT NULL,
  source TEXT NOT NULL,
  booking_id UUID REFERENCES bookings(id) ON DELETE SET NULL,
  amount NUMERIC NOT NULL,
  payment_mode TEXT NOT NULL,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 5. Expenses
CREATE TABLE expenses (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  "date" DATE NOT NULL,
  category TEXT NOT NULL,
  amount NUMERIC NOT NULL,
  vendor_name TEXT,
  payment_mode TEXT NOT NULL,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
