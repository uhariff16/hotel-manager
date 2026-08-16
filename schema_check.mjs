import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

const envPath = path.resolve(process.cwd(), '.env.local');
const envFile = fs.readFileSync(envPath, 'utf8');

let url = '', key = '';
envFile.split(/\r?\n/).forEach(line => {
  if(line.startsWith('VITE_SUPABASE_URL=')) url = line.split('=')[1].trim().replace(/['"]/g, '');
  if(line.startsWith('VITE_SUPABASE_ANON_KEY=')) key = line.split('=')[1].trim().replace(/['"]/g, '');
});

const supabase = createClient(url, key);

async function run() {
  const { data, error } = await supabase.from('resorts').select('*').limit(1);
  if (error) console.error('Error:', error);
  else {
      if (data && data.length > 0) {
          console.log(Object.keys(data[0]));
      } else {
          console.log("No data found in resorts table to infer schema");
      }
  }
}

run();
