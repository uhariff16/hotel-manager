import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    'https://lubkdxhqnnghnjhrebat.supabase.co',
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx1YmtkeGhxbm5naG5qaHJlYmF0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU3MDAyMDksImV4cCI6MjA5MTI3NjIwOX0.dUQvWk2X1LpZzC1LlUPJuRMQibFHfw0nOkhCAVYPpcA'
);

async function checkAll() {
    const { data: resorts } = await supabase.from('resorts').select('id, name');
    const { data: integrations } = await supabase.from('tenant_integrations').select('*');
    
    console.log("Resorts:", JSON.stringify(resorts, null, 2));
    console.log("Integrations:", JSON.stringify(integrations, null, 2));
}

checkAll();
