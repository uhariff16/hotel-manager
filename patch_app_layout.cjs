const fs = require('fs');

let code = fs.readFileSync('src/layouts/AppLayout.jsx', 'utf8');

// Add FeatureTour import
if (!code.includes('FeatureTour')) {
  code = code.replace(
    `import { useSettingsStore } from '../lib/store';`,
    `import { useSettingsStore } from '../lib/store';\nimport FeatureTour from '../components/FeatureTour';`
  );
}

// Add tourClass to navLinks
code = code.replace(
  `{ to: '/dashboard', label: 'Dashboard', icon: <LayoutDashboard size={20} /> }`,
  `{ to: '/dashboard', label: 'Dashboard', icon: <LayoutDashboard size={20} />, tourClass: 'tour-dashboard' }`
);
code = code.replace(
  `{ to: '/bookings', label: 'Bookings', icon: <BookOpenCheck size={20} /> }`,
  `{ to: '/bookings', label: 'Bookings', icon: <BookOpenCheck size={20} />, tourClass: 'tour-bookings' }`
);
code = code.replace(
  `{ to: '/calendar', label: 'Calendar', icon: <CalendarDays size={20} /> }`,
  `{ to: '/calendar', label: 'Calendar', icon: <CalendarDays size={20} />, tourClass: 'tour-calendar' }`
);
code = code.replace(
  `{ to: '/financials', label: 'Financials', icon: <Wallet size={20} /> }`,
  `{ to: '/financials', label: 'Financials', icon: <Wallet size={20} />, tourClass: 'tour-financials' }`
);
code = code.replace(
  `{ to: '/settings', label: 'Settings', icon: <SettingsIcon size={20} /> }`,
  `{ to: '/settings', label: 'Settings', icon: <SettingsIcon size={20} />, tourClass: 'tour-settings' }`
);

// Add tour-properties to Management > Properties
code = code.replace(
  `{ to: '/resorts', label: 'Properties & Layout', icon: <Hotel size={16} /> }`,
  `{ to: '/resorts', label: 'Properties & Layout', icon: <Hotel size={16} />, tourClass: 'tour-properties' }`
);

// Apply tourClass in the map
code = code.replace(
  `className={({ isActive }) => \`nav-item \${isActive ? 'active' : ''}\`}`,
  `className={({ isActive }) => \`nav-item \${isActive ? 'active' : ''} \${link.tourClass || ''}\`}`
);
code = code.replace(
  `className="nav-item"`,
  `className={\`nav-item \${child.tourClass || ''}\`}`
);

// Render FeatureTour
code = code.replace(
  `<Outlet />`,
  `<Outlet />\n            <FeatureTour />`
);

fs.writeFileSync('src/layouts/AppLayout.jsx', code, 'utf8');
console.log('AppLayout.jsx patched successfully');
