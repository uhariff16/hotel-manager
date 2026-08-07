import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const env = fs.readFileSync('.env.local', 'utf8');
const url = env.match(/VITE_SUPABASE_URL=(.*)/)[1].trim();
const key = env.match(/VITE_SUPABASE_ANON_KEY=(.*)/)[1].trim();
const supabase = createClient(url, key);

async function test() {
  const { data: profile } = await supabase.from('profiles').select('id, email, role, tenant_id').eq('email', 'uhariff@gmail.com').single();
  console.log('Admin Profile:', profile);
  
  const { data: rooms, error } = await supabase.from('rooms').select('id, name, tenant_id, resort_id, cottage_id');
  if (error) console.error(error);
  else console.log('Rooms:', rooms);
}
test();
