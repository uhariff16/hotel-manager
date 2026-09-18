import fs from 'fs';
let code = fs.readFileSync('src/pages/BookingForm.jsx', 'utf8');

const target = '<span style={{ fontSize: \'0.85rem\', color: \'var(--text-muted)\', fontStyle: \'italic\' }}>{(!bookingForm.cottage_id) ? \'Please select a property/cottage first\' : \'No rooms available for the entire selected duration.\'}</span>';

const replacement = '<span style={{ fontSize: \'0.85rem\', color: !bookingForm.cottage_id ? \'var(--text-muted)\' : \'var(--danger)\', fontStyle: !bookingForm.cottage_id ? \'italic\' : \'normal\', fontWeight: !bookingForm.cottage_id ? \'normal\' : \'600\' }}>{!bookingForm.cottage_id ? \'Please select a property/cottage first\' : \'No rooms available for the entire selected duration.\'}</span>';

if (code.includes(target)) {
  code = code.replace(target, replacement);
  fs.writeFileSync('src/pages/BookingForm.jsx', code, 'utf8');
  console.log('Replaced successfully.');
} else {
  console.log('Target not found!');
}

