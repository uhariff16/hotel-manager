import React, { useState, useEffect } from 'react';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { Plus, Trash2, Edit2, Check, X } from 'lucide-react';
import { useSettingsStore } from '../lib/store';

export default function CottagesRooms() {
  const { session, activeResortId, profile } = useSettingsStore();
  const [cottages, setCottages] = useState([]);
  const [rooms, setRooms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [newCottage, setNewCottage] = useState({
    name: '', max_capacity: 1, weekday_price: 0, weekend_price: 0, seasonal_price: 0, status: 'Available'
  });

  const [newRoom, setNewRoom] = useState({
    cottage_id: '', name: '', capacity: 1, weekday_price: 0, weekend_price: 0, seasonal_price: 0, status: 'Available'
  });

  const [editingId, setEditingId] = useState(null);
  const [editingType, setEditingType] = useState(null);
  const [editForm, setEditForm] = useState({ weekday: 0, weekend: 0 });

  const startEdit = (item, type) => {
    setEditingId(item.id);
    setEditingType(type);
    setEditForm({ weekday: item.weekday_price, weekend: item.weekend_price });
  };

  const saveEdit = async () => {
    try {
      if (editingType === 'cottage') {
        await supabase.from('cottages').update({ weekday_price: editForm.weekday, weekend_price: editForm.weekend }).eq('id', editingId);
        setCottages(cottages.map(c => c.id === editingId ? { ...c, weekday_price: editForm.weekday, weekend_price: editForm.weekend } : c));
      } else {
        await supabase.from('rooms').update({ weekday_price: editForm.weekday, weekend_price: editForm.weekend }).eq('id', editingId);
        setRooms(rooms.map(r => r.id === editingId ? { ...r, weekday_price: editForm.weekday, weekend_price: editForm.weekend } : r));
      }
      setEditingId(null);
      setEditingType(null);
    } catch (e) { alert("Error saving prices"); }
  };

  useEffect(() => {
    fetchData();
  }, [activeResortId]);

  const fetchData = async () => {
    if (!isSupabaseConfigured()) {
      setError('Supabase is not configured. Please add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to .env');
      setLoading(false);
      return;
    }
    
    try {
      const [cottagesRes, roomsRes] = await Promise.all([
        supabase.from('cottages').select('*').eq('resort_id', activeResortId).order('created_at', { ascending: true }),
        supabase.from('rooms').select('*').eq('resort_id', activeResortId).order('created_at', { ascending: true })
      ]);
      
      if (cottagesRes.error) throw cottagesRes.error;
      if (roomsRes.error) throw roomsRes.error;
      
      setCottages(cottagesRes.data || []);
      setRooms(roomsRes.data || []);
    } catch (err) {
      console.error(err);
      setError(err.message || 'Error fetching data. Check permissions or schema.');
    } finally {
      setLoading(false);
    }
  };

  const handleAddCottage = async (e) => {
    e.preventDefault();
    try {
      const payload = { ...newCottage, tenant_id: session.user.id, resort_id: activeResortId };
      const { data, error } = await supabase.from('cottages').insert([payload]).select();
      if (error) alert(error.message);
      else {
        setCottages([...cottages, data[0]]);
        setNewCottage({ name: '', max_capacity: 1, weekday_price: 0, weekend_price: 0, seasonal_price: 0, status: 'Available' });
      }
    } catch (e) {
      alert("Error adding property.");
    }
  };

  const handleAddRoom = async (e) => {
    e.preventDefault();
    if (!newRoom.cottage_id) return alert('Select a Property first');
    
    // Free Plan Gate
    if (profile?.plan_type === 'free' && rooms.length >= 5) {
      return alert('Free Plan Limit Reached: You can only add up to 5 rooms total. Please upgrade your plan to add more.');
    }

    try {
      const payload = { ...newRoom, tenant_id: session.user.id, resort_id: activeResortId };
      const { data, error } = await supabase.from('rooms').insert([payload]).select();
      if (error) alert(error.message);
      else {
        setRooms([...rooms, data[0]]);
        setNewRoom({ cottage_id: '', name: '', capacity: 1, weekday_price: 0, weekend_price: 0, seasonal_price: 0, status: 'Available' });
      }
    } catch (e) {
      alert("Error adding room.");
    }
  };

  const deleteCottage = async (id) => {
    if (!window.confirm("Delete this property? All its rooms will be deleted.")) return;
    await supabase.from('cottages').delete().eq('id', id);
    setCottages(cottages.filter(c => c.id !== id));
    setRooms(rooms.filter(r => r.cottage_id !== id));
  };

  const deleteRoom = async (id) => {
    if (!window.confirm("Delete this room?")) return;
    await supabase.from('rooms').delete().eq('id', id);
    setRooms(rooms.filter(r => r.id !== id));
  };

  if (loading) return <div>Loading setup...</div>;

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
      <div style={{ marginBottom: '2rem' }}>
        <h1 style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>Property Management</h1>
        <p style={{ color: 'var(--text-muted)' }}>Configure your cottages, rooms, and inventory settings</p>
      </div>

      <div className="grid-2" style={{ gap: '2rem' }}>
      {/* COTTAGES SECTION */}
      <div className="card">
        <h2 style={{ marginBottom: '1rem', borderBottom: '1px solid var(--border)', paddingBottom: '0.5rem' }}>Properties</h2>
        {error && <div style={{ color: 'var(--danger)', marginBottom: '1rem' }}>{error}</div>}
        
        <form onSubmit={handleAddCottage} style={{ background: 'var(--bg-color)', padding: '1rem', borderRadius: 'var(--radius-md)', marginBottom: '1.5rem' }}>
          <h4>Add New Property</h4>
          <div className="grid-2" style={{ gap: '1rem', marginTop: '1rem' }}>
            <div className="form-group">
              <label className="form-label">Name</label>
              <input type="text" className="form-input" required value={newCottage.name} onChange={e => setNewCottage({...newCottage, name: e.target.value})} />
            </div>
            <div className="form-group">
              <label className="form-label">Capacity</label>
              <input type="number" className="form-input" min="1" required value={newCottage.max_capacity} onChange={e => setNewCottage({...newCottage, max_capacity: e.target.value})} />
            </div>
            <div className="form-group">
              <label className="form-label">Weekday ₹</label>
              <input type="number" className="form-input" required value={newCottage.weekday_price} onChange={e => setNewCottage({...newCottage, weekday_price: e.target.value})} />
            </div>
            <div className="form-group">
              <label className="form-label">Weekend ₹</label>
              <input type="number" className="form-input" required value={newCottage.weekend_price} onChange={e => setNewCottage({...newCottage, weekend_price: e.target.value})} />
            </div>
          </div>
          <button type="submit" className="btn btn-primary" style={{ width: '100%' }}><Plus size={16}/> Add Property</button>
        </form>

        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Capacity</th>
                <th>Prices (W/E)</th>
                <th>Act</th>
              </tr>
            </thead>
            <tbody>
              {cottages.map(c => (
                <tr key={c.id}>
                  <td><strong>{c.name}</strong><br/><span className="badge badge-success">{c.status}</span></td>
                  <td>{c.max_capacity}</td>
                  <td>
                    {editingId === c.id && editingType === 'cottage' ? (
                      <div style={{ display: 'flex', gap: '0.2rem', alignItems: 'center' }}>
                        W: <input type="number" style={{ width: '60px', padding: '2px' }} value={editForm.weekday} onChange={e => setEditForm({...editForm, weekday: e.target.value})} />
                        E: <input type="number" style={{ width: '60px', padding: '2px' }} value={editForm.weekend} onChange={e => setEditForm({...editForm, weekend: e.target.value})} />
                      </div>
                    ) : (
                      <>₹{c.weekday_price} / ₹{c.weekend_price}</>
                    )}
                  </td>
                  <td style={{ display: 'flex', gap: '0.5rem' }}>
                    {editingId === c.id && editingType === 'cottage' ? (
                      <>
                        <button className="btn btn-outline" style={{ padding: '0.2rem 0.5rem', color: 'var(--success)' }} onClick={saveEdit}><Check size={14}/></button>
                        <button className="btn btn-outline" style={{ padding: '0.2rem 0.5rem', color: 'var(--text-muted)' }} onClick={() => setEditingId(null)}><X size={14}/></button>
                      </>
                    ) : (
                      <>
                        <button className="btn btn-outline" style={{ padding: '0.2rem 0.5rem', color: 'var(--primary)' }} onClick={() => startEdit(c, 'cottage')}><Edit2 size={16}/></button>
                        <button className="btn btn-outline" style={{ padding: '0.2rem 0.5rem', color: 'var(--danger)' }} onClick={() => deleteCottage(c.id)}><Trash2 size={16}/></button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ROOMS SECTION */}
      <div className="card">
        <h2 style={{ marginBottom: '1rem', borderBottom: '1px solid var(--border)', paddingBottom: '0.5rem' }}>Rooms</h2>
        <form onSubmit={handleAddRoom} style={{ background: 'var(--bg-color)', padding: '1rem', borderRadius: 'var(--radius-md)', marginBottom: '1.5rem' }}>
          <h4>Add New Room</h4>
          <div className="grid-2" style={{ gap: '1rem', marginTop: '1rem' }}>
            <div className="form-group" style={{ gridColumn: 'span 2' }}>
              <label className="form-label">Link to Property</label>
              <select className="form-select" required value={newRoom.cottage_id} onChange={e => setNewRoom({...newRoom, cottage_id: e.target.value})}>
                <option value="">-- Select Property --</option>
                {cottages.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Room Name</label>
              <input type="text" className="form-input" required value={newRoom.name} onChange={e => setNewRoom({...newRoom, name: e.target.value})} />
            </div>
            <div className="form-group">
              <label className="form-label">Capacity</label>
              <input type="number" className="form-input" min="1" required value={newRoom.capacity} onChange={e => setNewRoom({...newRoom, capacity: e.target.value})} />
            </div>
            <div className="form-group">
              <label className="form-label">Weekday ₹</label>
              <input type="number" className="form-input" required value={newRoom.weekday_price} onChange={e => setNewRoom({...newRoom, weekday_price: e.target.value})} />
            </div>
            <div className="form-group">
              <label className="form-label">Weekend ₹</label>
              <input type="number" className="form-input" required value={newRoom.weekend_price} onChange={e => setNewRoom({...newRoom, weekend_price: e.target.value})} />
            </div>
          </div>
          <button type="submit" className="btn btn-primary" style={{ width: '100%', backgroundColor: 'var(--warning)', borderColor: 'var(--warning)' }}><Plus size={16}/> Add Room</button>
        </form>

        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <th>Property</th>
                <th>Room</th>
                <th>Prices (W/E)</th>
                <th>Act</th>
              </tr>
            </thead>
            <tbody>
              {rooms.map(r => {
                const cottage = cottages.find(c => c.id === r.cottage_id);
                return (
                  <tr key={r.id}>
                    <td>{cottage ? cottage.name : '-'}</td>
                    <td><strong>{r.name}</strong><br/><span className="badge badge-success">{r.status}</span></td>
                    <td>
                      {editingId === r.id && editingType === 'room' ? (
                        <div style={{ display: 'flex', gap: '0.2rem', alignItems: 'center' }}>
                          W: <input type="number" style={{ width: '60px', padding: '2px' }} value={editForm.weekday} onChange={e => setEditForm({...editForm, weekday: e.target.value})} />
                          E: <input type="number" style={{ width: '60px', padding: '2px' }} value={editForm.weekend} onChange={e => setEditForm({...editForm, weekend: e.target.value})} />
                        </div>
                      ) : (
                        <>₹{r.weekday_price} / ₹{r.weekend_price}</>
                      )}
                    </td>
                    <td style={{ display: 'flex', gap: '0.5rem' }}>
                      {editingId === r.id && editingType === 'room' ? (
                        <>
                          <button className="btn btn-outline" style={{ padding: '0.2rem 0.5rem', color: 'var(--success)' }} onClick={saveEdit}><Check size={14}/></button>
                          <button className="btn btn-outline" style={{ padding: '0.2rem 0.5rem', color: 'var(--text-muted)' }} onClick={() => setEditingId(null)}><X size={14}/></button>
                        </>
                      ) : (
                        <>
                          <button className="btn btn-outline" style={{ padding: '0.2rem 0.5rem', color: 'var(--primary)' }} onClick={() => startEdit(r, 'room')}><Edit2 size={16}/></button>
                          <button className="btn btn-outline" style={{ padding: '0.2rem 0.5rem', color: 'var(--danger)' }} onClick={() => deleteRoom(r.id)}><Trash2 size={16}/></button>
                        </>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      </div>
    </div>
  );
}
