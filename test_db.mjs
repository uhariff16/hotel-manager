import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const env = fs.readFileSync('.env.local', 'utf8');
const url = env.match(/VITE_SUPABASE_URL=(.*)/)[1].trim();
const key = env.match(/VITE_SUPABASE_ANON_KEY=(.*)/)[1].trim();
const supabase = createClient(url, key);

async function test() {
  const { count: propertiesCount, error: pErr } = await supabase.from('resorts').select('*', { count: 'exact', head: true });
  const { count: bookingsCount, error: bErr } = await supabase.from('bookings').select('*', { count: 'exact', head: true });
  
  if (pErr) console.error(pErr);
  if (bErr) console.error(bErr);
  
  console.log('Total Properties:', propertiesCount);
  console.log('Total Bookings:', bookingsCount);
}
test();
