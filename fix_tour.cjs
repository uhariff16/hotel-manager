const fs = require('fs');
let code = fs.readFileSync('src/layouts/AppLayout.jsx', 'utf8');

// Add tour-management to the Management menu
code = code.replace(
  const managementMenu = { \\n        label: 'Management', \\n        icon: <Activity size={20} />, \\n        isSubmenu: true,,
  const managementMenu = { \\n        label: 'Management', \\n        icon: <Activity size={20} />, \\n        isSubmenu: true, tourClass: 'tour-management',
);

fs.writeFileSync('src/layouts/AppLayout.jsx', code, 'utf8');

let tourCode = fs.readFileSync('src/components/FeatureTour.jsx', 'utf8');

// Change tour-properties to tour-management
tourCode = tourCode.replace(
  	arget: '.tour-properties',\\n      content: 'Need to add a new cottage or room? Head over to the Properties section to define your real estate layout.',,
  	arget: '.tour-management',\\n      content: 'Need to add a new cottage or room? Open the Management menu to define your real estate layout and manage staff.',
);

// Prevent on mobile
if (!tourCode.includes('Capacitor.isNativePlatform()')) {
  tourCode = tourCode.replace(
    import { supabase } from '../lib/supabase';,
    import { supabase } from '../lib/supabase';\\nimport { Capacitor } from '@capacitor/core';
  );
  
  tourCode = tourCode.replace(
    if (!profile || profile.has_seen_tour) return null;,
    if (!profile || profile.has_seen_tour || Capacitor.isNativePlatform()) return null;
  );
}

fs.writeFileSync('src/components/FeatureTour.jsx', tourCode, 'utf8');
console.log('Fixed');

