const fs = require('fs');

let code = fs.readFileSync('src/pages/BookingForm.jsx', 'utf8');

const sIdx = code.indexOf('                  ) : relevantRooms.map(r => {');
const eIdx = code.indexOf('                      </label>', sIdx);

const targetStr = code.substring(sIdx, eIdx + 30); // get the whole map block

const replacement = `                  ) : relevantRooms.map(r => {
                    const isSelected = bookingForm.room_ids.includes(r.id);
                    const isAvail = r.isAvailable;
                    
                    let overrideStyle = {};
                    if (r.isPlanLocked) {
                      overrideStyle = { opacity: 0.5, cursor: 'not-allowed', background: '#f1f5f9' };
                    } else if (!isAvail) {
                      overrideStyle = { cursor: 'not-allowed', background: 'rgba(239, 68, 68, 0.1)', borderColor: 'var(--danger)', color: 'var(--danger)' };
                    } else if (isSelected) {
                      overrideStyle = { background: 'var(--success)', borderColor: 'var(--success)', color: '#fff' };
                    } else {
                      overrideStyle = { background: 'transparent', borderColor: 'var(--success)', color: 'var(--success)' };
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
                        checked={isSelected} 
                        onChange={e => {
                          const newIds = e.target.checked ? [...bookingForm.room_ids, r.id] : bookingForm.room_ids.filter(id => id !== r.id);
                          const newMap = { ...bookingForm.room_types_map };
                          if (e.target.checked) {
                            newMap[r.id] = r.room_type || 'Deluxe';
                          } else {
                            delete newMap[r.id];
                          }
                          const roomTypesString = newIds.map(id => {
                            return newMap[id] || 'Deluxe';
                          }).join(', ');
                          
                          setBookingForm({
                            ...bookingForm, 
                            room_ids: newIds,
                            room_types_map: newMap,
                            room_type: roomTypesString
                          });
                        }} 
                      />
                      {r.name}
                      {!isAvail && <X size={14} style={{ marginLeft: '4px' }} />}
                      </label>
                  );
                  })}`;

if (code.includes('const isAvail = r.isAvailable;')) {
  // It's already there from previous change, just need to substring replace it
  const currentStart = code.indexOf('                  ) : relevantRooms.map(r => {');
  const currentEnd = code.indexOf('                  })}', currentStart) + 21;
  const currentBlock = code.substring(currentStart, currentEnd);
  
  code = code.replace(currentBlock, replacement);
  fs.writeFileSync('src/pages/BookingForm.jsx', code, 'utf8');
  console.log('Replaced successfully.');
} else {
  console.log('Target not found.');
}
