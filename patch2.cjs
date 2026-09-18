const fs = require('fs');
let code = fs.readFileSync('src/layouts/AppLayout.jsx', 'utf8');

// The line is currently:
// className={`nav-item ${child.tourClass || ''}`}
// but it is applied inside the button for Management. It should be link.tourClass or simply 'nav-item'.
code = code.replace(
  'className={`nav-item ${child.tourClass || \'\'}`}',
  'className={`nav-item ${link.tourClass || \'\'}`}'
);

fs.writeFileSync('src/layouts/AppLayout.jsx', code, 'utf8');
console.log('AppLayout.jsx patched successfully');
