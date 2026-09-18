const fs = require('fs');
let code = fs.readFileSync('src/pages/Subscription.jsx', 'utf8');

code = code.replace(/import \{ supabase \} from '\.\.\/lib\/supabase';/, "import { supabase } from '../lib/supabase';\nimport { createPortal } from 'react-dom';");

code = code.replace(/\{checkoutModal\.isOpen && \(\s+<div className="modal-overlay">/, '{checkoutModal.isOpen && createPortal(\n        <div className="modal-overlay" style={{ zIndex: 9999 }}>');

code = code.replace(/\s+\}\)\(\)\}\s+<\/div>\s+<\/div>\s+\)\}\s+<\/div>\s+\);\s+\}/, '\n            })()}\n          </div>\n        </div>\n      ), document.body)}\n    </div>\n  );\n}');

fs.writeFileSync('src/pages/Subscription.jsx', code);
console.log('done!');
