const fs = require('fs');

let code = fs.readFileSync('src/pages/BookingForm.jsx', 'utf8');

const targetStr = `                  ) : relevantRooms.map(r => (
                    <label 
                      key={r.id} 
                      className={\`badge-room \${bookingForm.room_ids.includes(r.id) ? 'selected' : ''}\`}
                      style={{ opacity: r.isPlanLocked ? 0.5 : 1, cursor: r.isPlanLocked ? 'not-allowed' : 'pointer', background: r.isPlanLocked ? '#f1f5f9' : '' }}
                      title={r.isPlanLocked ? 'Locked by current plan limit' : ''}
                    >
                      <input 
                        type="checkbox" 
                        style={{ display: 'none' }}
                        disabled={r.isPlanLocked}
                        checked={bookingForm.room_ids.includes(r.id)} `;

const replacement = `                  ) : relevantRooms.map(r => {
                    const isSelected = bookingForm.room_ids.includes(r.id);
                    const isAvail = r.isAvailable;
                    
                    let overrideStyle = {};
                    if (r.isPlanLocked) {
                      overrideStyle = { opacity: 0.5, cursor: 'not-allowed', background: '#f1f5f9' };
                    } else if (!isAvail) {
                      overrideStyle = { cursor: 'not-allowed', background: 'rgba(239, 68, 68, 0.1)', borderColor: 'var(--danger)', color: 'var(--danger)' };
                    } else if (!isSelected) {
                      overrideStyle = { background: 'rgba(16, 185, 129, 0.1)', borderColor: 'var(--success)', color: 'var(--success)' };
                    }

                    return (
                    <label 
                      key={r.id} 
                      className={\`badge-room \${isSelected ? 'selected' : ''}\`}
                      style={overrideStyle}
                      title={r.isPlanLocked ? 'Locked by current plan limit' : (!isAvail ? 'Not available for selected dates' : 'Available')}
                    >
                      <input 
                        type="checkbox" 
                        style={{ display: 'none' }}
                        disabled={r.isPlanLocked || !isAvail}
                        checked={isSelected} `;

if (code.includes(targetStr)) {
  code = code.replace(targetStr, replacement);
  
  const endTarget = `                      </label>
                  ))}`;
  const endReplacement = `                      </label>
                  );
                  })}`;
                  
  code = code.replace(endTarget, endReplacement);
  fs.writeFileSync('src/pages/BookingForm.jsx', code, 'utf8');
  console.log('Replaced JSX successfully.');
} else {
  console.log('Target JSX not found.');
}
