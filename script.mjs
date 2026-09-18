import fs from 'fs';
const settings = fs.readFileSync('src/pages/Settings.jsx', 'utf8');
let bookings = fs.readFileSync('src/pages/Bookings.jsx', 'utf8');

const startStr = 'const DEFAULT_CONFIRM_TEMPLATE = ';
const endStr = 'export default function Settings() {';
const startIdx = settings.indexOf(startStr);
const endIdx = settings.indexOf(endStr);

const settingsDefaults = settings.substring(startIdx, endIdx);

const bStart = bookings.indexOf(startStr);
const bEndStr = 'const Bookings = ({';
const bEnd = bookings.indexOf(bEndStr);

let newBookings = bookings.substring(0, bStart) + settingsDefaults + bookings.substring(bEnd);
fs.writeFileSync('src/pages/Bookings.jsx', newBookings, 'utf8');
console.log('Replaced defaults successfully.');

