import fs from 'fs';
const settings = fs.readFileSync('src/pages/Settings.jsx', 'utf8');
let bookings = fs.readFileSync('src/pages/Bookings.jsx', 'utf8');

const sStartStr = 'const DEFAULT_CONFIRM_TEMPLATE';
const sEndStr = 'export default function Settings';
const sStartIdx = settings.indexOf(sStartStr);
const sEndIdx = settings.indexOf(sEndStr);

const settingsDefaults = settings.substring(sStartIdx, sEndIdx);

const bStartIdx = bookings.indexOf(sStartStr);
const bEndStr = 'export default function Bookings';
const bEndIdx = bookings.indexOf(bEndStr);

if (bStartIdx !== -1 && bEndIdx !== -1) {
  bookings = bookings.substring(0, bStartIdx) + settingsDefaults + bookings.substring(bEndIdx);
  fs.writeFileSync('src/pages/Bookings.jsx', bookings, 'utf8');
  console.log('Fixed successfully.');
} else {
  console.log('bStartIdx:', bStartIdx, 'bEndIdx:', bEndIdx);
}

