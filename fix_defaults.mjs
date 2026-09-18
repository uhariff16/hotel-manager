import fs from 'fs';
const settings = fs.readFileSync('src/pages/Settings.jsx', 'utf8');
let bookings = fs.readFileSync('src/pages/Bookings.jsx', 'utf8');

const sMatch = settings.match(/const DEFAULT_CONFIRM_TEMPLATE = [\s\S]*?const DEFAULT_PAYMENT_REMINDER_TEMPLATE = \[\s\S]*?\;/);
const bMatch = bookings.match(/const DEFAULT_CONFIRM_TEMPLATE = [\s\S]*?const DEFAULT_PAYMENT_REMINDER_TEMPLATE = \[\s\S]*?\;/);

if (sMatch && bMatch) {
  bookings = bookings.replace(bMatch[0], sMatch[0]);
  fs.writeFileSync('src/pages/Bookings.jsx', bookings, 'utf8');
  console.log('Fixed successfully.');
} else {
  console.log('Match failed.');
}

