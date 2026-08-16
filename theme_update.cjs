const fs = require('fs');
const path = require('path');

const filepath = path.join('c:', 'AntiGravity', 'Cheerful Chalet', 'src', 'components', 'OnboardingWizard.jsx');
let content = fs.readFileSync(filepath, 'utf8');

// Theme string replacements
const replacements = [
    [/linear-gradient\(135deg, #0f172a 0%, #1e1b4b 100%\)/g, 'linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%)'],
    [/color: 'white'/g, "color: '#0f172a'"],
    [/background: 'rgba\(30, 41, 59, 0.7\)'/g, "background: 'rgba(255, 255, 255, 0.95)'"],
    [/border: '1px solid rgba\(255, 255, 255, 0.08\)'/g, "border: '1px solid rgba(0, 0, 0, 0.08)'"],
    [/borderTop: '1px solid rgba\(255, 255, 255, 0.08\)'/g, "borderTop: '1px solid rgba(0, 0, 0, 0.08)'"],
    [/color: '#f8fafc'/g, "color: '#0f172a'"],
    [/color: '#94a3b8'/g, "color: '#475569'"],
    [/background: 'rgba\(255, 255, 255, 0.03\)'/g, "background: 'rgba(0, 0, 0, 0.03)'"],
    [/border: '1px solid rgba\(255, 255, 255, 0.05\)'/g, "border: '1px solid rgba(0, 0, 0, 0.05)'"],
    [/border: '1px solid rgba\(255, 255, 255, 0.1\)'/g, "border: '1px solid rgba(0, 0, 0, 0.1)'"],
    [/border: '1px solid rgba\(255, 255, 255, 0.15\)'/g, "border: '1px solid rgba(0, 0, 0, 0.15)'"],
    [/background: 'rgba\(255, 255, 255, 0.05\)'/g, "background: 'rgba(0, 0, 0, 0.05)'"],
    [/background: 'rgba\(255,255,255,0.03\)'/g, "background: 'rgba(0,0,0,0.03)'"],
    [/border: '1px solid rgba\(255, 255, 255, 0.05\)'/g, "border: '1px solid rgba(0, 0, 0, 0.05)'"],
    [/color: '#e2e8f0'/g, "color: '#1e293b'"],
    [/background: '#1e293b'/g, "background: '#f1f5f9'"],
    [/border: '1px solid #475569'/g, "border: '1px solid #cbd5e1'"],
    [/color: '#cbd5e1'/g, "color: '#334155'"],
    [/background: '#334155'/g, "background: '#e2e8f0'"],
    [/background: 'rgba\(255,255,255,0.02\)'/g, "background: 'rgba(0,0,0,0.05)'"], // scrollbar track
    [/background: 'rgba\(255,255,255,0.1\)'/g, "background: 'rgba(0,0,0,0.2)'"],  // scrollbar thumb
    [/background: 'rgba\(255,255,255,0.2\)'/g, "background: 'rgba(0,0,0,0.3)'"],  // scrollbar thumb hover
    [/color: '#64748b'/g, "color: '#475569'"],
    [/"Setup complete! Redirecting to your dashboard..."/g, '"Setup complete successfully! You can add more properties or rooms from the Property Management tab in your dashboard. Redirecting..."'],
    [/setTimeout\(\(\) => \{\s*window\.location\.reload\(\);\s*\}, 1000\);/g, 'setTimeout(() => {\n        window.location.reload();\n      }, 4000);'],
];

replacements.forEach(([regex, replacement]) => {
    content = content.replace(regex, replacement);
});

fs.writeFileSync(filepath, content, 'utf8');
console.log("Replaced successfully!");
