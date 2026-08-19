import React, { useState, useEffect } from 'react';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { Plus, Trash2, Edit2, Check, X, Tag } from 'lucide-react';
import { useSettingsStore } from '../lib/store';

const DEFAULT_ROOM_CATEGORIES = [
  { name: 'Suite Room', weekday_price: 3000, weekend_price: 3500, capacity: 2 },
  { name: 'Deluxe', weekday_price: 2000, weekend_price: 2500, capacity: 2 },
  { name: 'Standard room', weekday_price: 1200, weekend_price: 1500, capacity: 2 }
];

export default function CottagesRooms() {
  const { session, activeResortId, profile, globalPlans } = useSettingsStore();
  const [cottages, setCottages] = useState([]);
  const [rooms, setRooms] = useState([]);
  const [roomCategories, setRoomCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [newCottage, setNewCottage] = useState({
    name: '', max_capacity: 1, weekday_price: 0, weekend_price: 0, seasonal_price: 0, status: 'Active', phone: '', wifi_password: ''
  });

  const [newRoom, setNewRoom] = useState({
    cottage_id: '', name: '', capacity: 1, weekday_price: 0, weekend_price: 0, seasonal_price: 0, status: 'Active', room_type: ''
  });

  const [editingId, setEditingId] = useState(null);
  const [editingType, setEditingType] = useState(null);

  const startEdit = (item, type) => {
    setEditingId(item.id);
    setEditingType(type);
    if (type === 'cottage') {
      setNewCottage({
        name: item.name || '',
        max_capacity: item.max_capacity || 1,
        weekday_price: item.weekday_price || 0,
        weekend_price: item.weekend_price || 0,
        seasonal_price: item.seasonal_price || 0,
        status: (item.status === 'Available' || item.status === 'Active') ? 'Active' : 'Inactive',
        phone: item.phone || '',
        wifi_password: item.wifi_password || ''
      });
      setNewRoom({ cottage_id: '', name: '', capacity: 1, weekday_price: 0, weekend_price: 0, seasonal_price: 0, status: 'Active', room_type: '' });
      setEditingId(item.id);
      setEditingType('cottage');
    } else {
      setNewRoom({
        cottage_id: item.cottage_id || '',
        name: item.name || '',
        capacity: item.capacity || 1,
        weekday_price: item.weekday_price || 0,
        weekend_price: item.weekend_price || 0,
        seasonal_price: item.seasonal_price || 0,
        status: (item.status === 'Available' || item.status === 'Active') ? 'Active' : 'Inactive',
        room_type: item.room_type || ''
      });
      setNewCottage({ name: '', max_capacity: 1, weekday_price: 0, weekend_price: 0, seasonal_price: 0, status: 'Active', phone: '', wifi_password: '' });
      setEditingId(item.id);
      setEditingType('room');
    }
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditingType(null);
    setNewCottage({ name: '', max_capacity: 1, weekday_price: 0, weekend_price: 0, seasonal_price: 0, status: 'Active', phone: '', wifi_password: '' });
    setNewRoom({ cottage_id: '', name: '', capacity: 1, weekday_price: 0, weekend_price: 0, seasonal_price: 0, status: 'Active', room_type: '' });
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
      const [cottagesRes, roomsRes, integrationRes] = await Promise.all([
        supabase.from('cottages').select('*').eq('resort_id', activeResortId).order('created_at', { ascending: true }),
        supabase.from('rooms').select('*').eq('resort_id', activeResortId).order('created_at', { ascending: true }),
        supabase.from('tenant_integrations').select('*').eq('resort_id', activeResortId).maybeSingle()
      ]);
      
      if (cottagesRes.error) throw cottagesRes.error;
      if (roomsRes.error) throw roomsRes.error;
      
      setCottages(cottagesRes.data || []);
      setRooms(roomsRes.data || []);

      let loadedCategories = [...DEFAULT_ROOM_CATEGORIES];
      if (integrationRes.data && integrationRes.data.whatsapp_custom_tags) {
        const tags = integrationRes.data.whatsapp_custom_tags;
        const categoryTag = tags.find(t => t.key === 'room_pricing_categories');
        if (categoryTag) {
          try {
            loadedCategories = JSON.parse(categoryTag.value);
          } catch (e) {
            console.error("Failed to parse room categories tag:", e);
          }
        }
      }
      setRoomCategories(loadedCategories);
    } catch (err) {
      console.error(err);
      setError(err.message || 'Error fetching data. Check permissions or schema.');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveCategories = async (updatedCategories) => {
    try {
      const { data: integration } = await supabase
        .from('tenant_integrations')
        .select('*')
        .eq('resort_id', activeResortId)
        .maybeSingle();

      let currentTags = [];
      if (integration && integration.whatsapp_custom_tags) {
        currentTags = [...integration.whatsapp_custom_tags];
      }

      const catIndex = currentTags.findIndex(t => t.key === 'room_pricing_categories');
      const tagValue = JSON.stringify(updatedCategories);
      if (catIndex !== -1) {
        currentTags[catIndex] = { key: 'room_pricing_categories', value: tagValue };
      } else {
        currentTags.push({ key: 'room_pricing_categories', value: tagValue });
      }

      const payload = {
        tenant_id: profile.id,
        resort_id: activeResortId,
        whatsapp_custom_tags: currentTags,
        updated_at: new Date().toISOString()
      };

      const { error } = await supabase
        .from('tenant_integrations')
        .upsert(payload, { onConflict: 'resort_id' });

      if (error) throw error;
      setRoomCategories(updatedCategories);

      // Propagate new prices/capacities to existing rooms belonging to updated categories
      for (const cat of updatedCategories) {
        await supabase
          .from('rooms')
          .update({
            weekday_price: Number(cat.weekday_price),
            weekend_price: Number(cat.weekend_price),
            capacity: Number(cat.capacity)
          })
          .eq('resort_id', activeResortId)
          .eq('room_type', cat.name);
      }

      // Refresh rooms data to show updated prices
      const roomsRes = await supabase.from('rooms').select('*').eq('resort_id', activeResortId).order('created_at', { ascending: true });
      if (!roomsRes.error) {
        setRooms(roomsRes.data || []);
      }

      alert("Room pricing categories saved and synchronized successfully!");
    } catch (err) {
      alert("Failed to save room categories: " + err.message);
    }
  };

  const handleAddCottage = async (e) => {
    e.preventDefault();
    
    if (editingId && editingType === 'cottage') {
      try {
        const dbStatus = newCottage.status === 'Active' ? 'Available' : 'Maintenance';
        if (dbStatus === 'Maintenance') {
          // Check for active bookings (status is not 'Completed' and not 'Cancelled') under this property
          const { data: activeBookings, error: checkError } = await supabase
            .from('bookings')
            .select('id')
            .eq('cottage_id', editingId)
            .neq('status', 'Completed')
            .neq('status', 'Cancelled');

          if (checkError) {
            alert("Error checking active bookings: " + checkError.message);
            return;
          }

          if (activeBookings && activeBookings.length > 0) {
            alert("Cannot disable property: There are active bookings under this property that are not Completed or Cancelled.");
            return;
          }
        }
        const { error } = await supabase.from('cottages').update({ 
          name: newCottage.name,
          max_capacity: newCottage.max_capacity,
          weekday_price: newCottage.weekday_price, 
          weekend_price: newCottage.weekend_price, 
          status: dbStatus,
          phone: newCottage.phone,
          wifi_password: newCottage.wifi_password
        }).eq('id', editingId);
        if (error) {
          alert("Error saving property: " + error.message);
          return;
        }
        setCottages(cottages.map(c => c.id === editingId ? { 
          ...c, 
          name: newCottage.name,
          max_capacity: newCottage.max_capacity,
          weekday_price: newCottage.weekday_price, 
          weekend_price: newCottage.weekend_price, 
          status: dbStatus,
          phone: newCottage.phone,
          wifi_password: newCottage.wifi_password
        } : c));
        setEditingId(null);
        setEditingType(null);
        setNewCottage({ name: '', max_capacity: 1, weekday_price: 0, weekend_price: 0, seasonal_price: 0, status: 'Active', phone: '', wifi_password: '' });
      } catch (e) {
        alert("Error saving property changes: " + e.message);
      }
      return;
    }

    // Free Plan Gate
    const currentPlanId = profile?.plan_type || 'free';
    const planConfig = globalPlans?.[currentPlanId] || { maxResorts: 1, name: 'Free Starter' };
    const cottageLimit = planConfig.maxResorts || 1;
    const planName = planConfig.name || currentPlanId.toUpperCase();

    if (cottages.length >= cottageLimit) {
      return alert(`Limit Reached: Your current ${planName} plan allows only ${cottageLimit} property/properties. Please upgrade on our website for more.`);
    }

    try {
      const payload = { 
        ...newCottage, 
        status: newCottage.status === 'Active' ? 'Available' : 'Maintenance',
        tenant_id: session.user.id, 
        resort_id: activeResortId 
      };
      const { data, error } = await supabase.from('cottages').insert([payload]).select();
      if (error) alert(error.message);
      else {
        setCottages([...cottages, data[0]]);
        setNewCottage({ name: '', max_capacity: 1, weekday_price: 0, weekend_price: 0, seasonal_price: 0, status: 'Active', phone: '', wifi_password: '' });
      }
    } catch (e) {
      alert("Error adding property.");
    }
  };

  const handleAddRoom = async (e) => {
    e.preventDefault();
    if (!newRoom.cottage_id) return alert('Select a Property first');
    
    if (editingId && editingType === 'room') {
      try {
        const dbStatus = newRoom.status === 'Active' ? 'Available' : 'Maintenance';
        const { error } = await supabase.from('rooms').update({ 
          cottage_id: newRoom.cottage_id,
          name: newRoom.name, 
          capacity: Number(newRoom.capacity),
          weekday_price: Number(newRoom.weekday_price), 
          weekend_price: Number(newRoom.weekend_price), 
          status: dbStatus,
          room_type: newRoom.room_type
        }).eq('id', editingId);
        if (error) {
          alert("Error saving room: " + error.message);
          return;
        }
        setRooms(rooms.map(r => r.id === editingId ? { 
          ...r, 
          cottage_id: newRoom.cottage_id,
          name: newRoom.name, 
          capacity: Number(newRoom.capacity),
          weekday_price: Number(newRoom.weekday_price), 
          weekend_price: Number(newRoom.weekend_price), 
          status: dbStatus,
          room_type: newRoom.room_type
        } : r));
        setEditingId(null);
        setEditingType(null);
        setNewRoom({ cottage_id: '', name: '', capacity: 1, weekday_price: 0, weekend_price: 0, seasonal_price: 0, status: 'Active', room_type: '' });
      } catch (e) {
        alert("Error saving room changes: " + e.message);
      }
      return;
    }

    // Free Plan Gate
    const currentPlanId = profile?.plan_type || 'free';
    const planConfig = globalPlans?.[currentPlanId] || { maxRooms: 5, name: 'Free Starter' };
    const roomLimit = planConfig.maxRooms || 5;
    const planName = planConfig.name || currentPlanId.toUpperCase();

    const { count: totalRooms } = await supabase
      .from('rooms')
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', session.user.id);

    if (totalRooms >= roomLimit) {
      return alert(`Limit Reached: Your current ${planName} plan allows only ${roomLimit} total rooms across all properties. Please upgrade on our website for more.`);
    }

    try {
      const payload = { 
        cottage_id: newRoom.cottage_id,
        name: newRoom.name,
        capacity: Number(newRoom.capacity),
        weekday_price: Number(newRoom.weekday_price),
        weekend_price: Number(newRoom.weekend_price),
        seasonal_price: 0,
        status: newRoom.status === 'Active' ? 'Available' : 'Maintenance',
        room_type: newRoom.room_type,
        tenant_id: session.user.id, 
        resort_id: activeResortId 
      };
      const { data, error } = await supabase.from('rooms').insert([payload]).select();
      if (error) alert(error.message);
      else {
        setRooms([...rooms, data[0]]);
        setNewRoom({ cottage_id: '', name: '', capacity: 1, weekday_price: 0, weekend_price: 0, seasonal_price: 0, status: 'Active', room_type: '' });
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

      {/* ROOM PRICING CATEGORIES */}
      <div className="card" style={{ marginBottom: '2rem' }}>
        <h2 style={{ marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#0F2C59', fontWeight: 800 }}>
          <Tag size={22} /> Room Pricing Categories
        </h2>
        <p style={{ color: 'var(--text-muted)', marginBottom: '1.5rem', fontSize: '0.9rem' }}>
          Define standard pricing categories for your rooms. Editing a category price automatically updates all rooms assigned to it.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {roomCategories.map((cat, idx) => (
            <div key={idx} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr auto', gap: '1rem', alignItems: 'end', background: 'var(--bg-color)', padding: '1rem', borderRadius: '8px', border: '1px solid var(--border)' }}>
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label" style={{ fontSize: '0.8rem', fontWeight: 700 }}>Category Name</label>
                <input 
                  type="text" 
                  className="form-input" 
                  value={cat.name} 
                  onChange={e => {
                    const newCats = [...roomCategories];
                    newCats[idx].name = e.target.value;
                    setRoomCategories(newCats);
                  }}
                  placeholder="e.g. Deluxe Room"
                />
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label" style={{ fontSize: '0.8rem', fontWeight: 700 }}>Capacity</label>
                <input 
                  type="number" 
                  className="form-input" 
                  min="1" 
                  value={cat.capacity} 
                  onChange={e => {
                    const newCats = [...roomCategories];
                    newCats[idx].capacity = Number(e.target.value);
                    setRoomCategories(newCats);
                  }}
                />
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label" style={{ fontSize: '0.8rem', fontWeight: 700 }}>Weekday ₹</label>
                <input 
                  type="number" 
                  className="form-input" 
                  value={cat.weekday_price} 
                  onChange={e => {
                    const newCats = [...roomCategories];
                    newCats[idx].weekday_price = Number(e.target.value);
                    setRoomCategories(newCats);
                  }}
                />
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label" style={{ fontSize: '0.8rem', fontWeight: 700 }}>Weekend ₹</label>
                <input 
                  type="number" 
                  className="form-input" 
                  value={cat.weekend_price} 
                  onChange={e => {
                    const newCats = [...roomCategories];
                    newCats[idx].weekend_price = Number(e.target.value);
                    setRoomCategories(newCats);
                  }}
                />
              </div>
              <button 
                type="button" 
                className="btn btn-outline" 
                style={{ padding: '0.6rem 0.8rem', color: 'var(--danger)', borderColor: 'var(--danger)' }}
                onClick={() => {
                  if (window.confirm(`Are you sure you want to delete the "${cat.name}" category? Rooms already assigned to this category will keep their current prices.`)) {
                    const newCats = roomCategories.filter((_, i) => i !== idx);
                    handleSaveCategories(newCats);
                  }
                }}
              >
                <Trash2 size={16} />
              </button>
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '1.5rem' }}>
          <button 
            type="button" 
            className="btn btn-outline" 
            onClick={() => {
              setRoomCategories([...roomCategories, { name: 'New Category', weekday_price: 1500, weekend_price: 1800, capacity: 2 }]);
            }}
          >
            + Add New Category
          </button>
          <button 
            type="button" 
            className="btn btn-primary" 
            onClick={() => handleSaveCategories(roomCategories)}
            style={{ fontWeight: 700 }}
          >
            Save & Sync Categories
          </button>
        </div>
      </div>

      <div className="grid-2" style={{ gap: '2rem' }}>
      {/* COTTAGES SECTION */}
      <div className="card">
        <h2 style={{ marginBottom: '1rem', borderBottom: '1px solid var(--border)', paddingBottom: '0.5rem' }}>Properties</h2>
        {error && <div style={{ color: 'var(--danger)', marginBottom: '1rem' }}>{error}</div>}
        
        <form onSubmit={handleAddCottage} style={{ background: 'var(--bg-color)', padding: '1rem', borderRadius: 'var(--radius-md)', marginBottom: '1.5rem' }}>
          <h4>{editingId && editingType === 'cottage' ? `Edit Property: ${cottages.find(c => c.id === editingId)?.name || ''}` : 'Add New Property'}</h4>
          <div className="grid-2" style={{ gap: '1rem', marginTop: '1rem' }}>
            <div className="form-group" style={{ gridColumn: 'span 2' }}>
              <label className="form-label">Name</label>
              <input type="text" className="form-input" required value={newCottage.name} onChange={e => setNewCottage({...newCottage, name: e.target.value})} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem', gridColumn: 'span 2' }}>
              <div className="form-group">
                <label className="form-label">Capacity</label>
                <input type="number" className="form-input" min="1" required value={newCottage.max_capacity} onChange={e => setNewCottage({...newCottage, max_capacity: e.target.value})} />
              </div>
              <div className="form-group">
                <label className="form-label">Entire Property Weekday ₹</label>
                <input type="number" className="form-input" required value={newCottage.weekday_price} onChange={e => setNewCottage({...newCottage, weekday_price: e.target.value})} />
              </div>
              <div className="form-group">
                <label className="form-label">Entire Property Weekend ₹</label>
                <input type="number" className="form-input" required value={newCottage.weekend_price} onChange={e => setNewCottage({...newCottage, weekend_price: e.target.value})} />
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Property Contact Number</label>
              <input type="text" className="form-input" placeholder="e.g. +919876543210" value={newCottage.phone} onChange={e => setNewCottage({...newCottage, phone: e.target.value})} />
            </div>
            <div className="form-group">
              <label className="form-label">Property Wi-Fi Password</label>
              <input type="text" className="form-input" placeholder="e.g. mysecretwifi123" value={newCottage.wifi_password} onChange={e => setNewCottage({...newCottage, wifi_password: e.target.value})} />
            </div>
            <div className="form-group" style={{ gridColumn: 'span 2' }}>
              <label className="form-label">Status</label>
              <select className="form-select" value={newCottage.status} onChange={e => setNewCottage({...newCottage, status: e.target.value})}>
                <option value="Active">Active</option>
                <option value="Inactive">Inactive</option>
              </select>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
            <button type="submit" className="btn btn-primary" style={{ flex: 1 }}>
              {editingId && editingType === 'cottage' ? 'Update Property' : 'Add Property'}
            </button>
            {editingId && editingType === 'cottage' && (
              <button type="button" className="btn btn-outline" style={{ color: 'var(--text-muted)' }} onClick={cancelEdit}>
                Cancel
              </button>
            )}
          </div>
        </form>

        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <th>Name & Credentials</th>
                <th>Capacity</th>
                <th>Prices (W/E)</th>
                <th>Act</th>
              </tr>
            </thead>
            <tbody>
              {cottages.map(c => (
                <tr key={c.id}>
                  <td>
                    <strong>{c.name}</strong>
                    <div style={{ marginTop: '0.25rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                      {c.phone && <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>📞 {c.phone}</div>}
                      {c.wifi_password && <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', marginTop: '0.1rem' }}>🔑 Wi-Fi: {c.wifi_password}</div>}
                      <span className={`badge badge-${(c.status === 'Active' || c.status === 'Available') ? 'success' : 'danger'}`} style={{ marginTop: '0.4rem', display: 'inline-block' }}>
                        {(c.status === 'Available' || c.status === 'Active') ? 'Active' : 'Inactive'}
                      </span>
                    </div>
                  </td>
                  <td>{c.max_capacity}</td>
                  <td>
                    ₹{c.weekday_price} / ₹{c.weekend_price}
                  </td>
                  <td style={{ display: 'flex', gap: '0.5rem' }}>
                    <button className="btn btn-outline" style={{ padding: '0.2rem 0.5rem', color: 'var(--primary)' }} onClick={() => startEdit(c, 'cottage')}><Edit2 size={16}/></button>
                    <button className="btn btn-outline" style={{ padding: '0.2rem 0.5rem', color: 'var(--danger)' }} onClick={() => deleteCottage(c.id)}><Trash2 size={16}/></button>
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
          <h4>{editingId && editingType === 'room' ? `Edit Room: ${rooms.find(r => r.id === editingId)?.name || ''}` : 'Add New Room'}</h4>
          <div className="grid-2" style={{ gap: '1rem', marginTop: '1rem' }}>
            <div className="form-group" style={{ gridColumn: 'span 2' }}>
              <label className="form-label">Link to Property</label>
              <select className="form-select" required value={newRoom.cottage_id} onChange={e => setNewRoom({...newRoom, cottage_id: e.target.value})}>
                <option value="">-- Select Property --</option>
                {cottages.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div className="form-group" style={{ gridColumn: 'span 2' }}>
              <label className="form-label">Room Name</label>
              <input type="text" className="form-input" required value={newRoom.name} onChange={e => setNewRoom({...newRoom, name: e.target.value})} />
            </div>
            <div className="form-group" style={{ gridColumn: 'span 2' }}>
              <label className="form-label">Pricing Category</label>
              <select 
                className="form-select" 
                required 
                value={newRoom.room_type} 
                onChange={e => {
                  const selectedCat = roomCategories.find(c => c.name === e.target.value);
                  if (selectedCat) {
                    setNewRoom({
                      ...newRoom,
                      room_type: selectedCat.name,
                      capacity: selectedCat.capacity,
                      weekday_price: selectedCat.weekday_price,
                      weekend_price: selectedCat.weekend_price
                    });
                  } else {
                    setNewRoom({
                      ...newRoom,
                      room_type: e.target.value,
                      capacity: 1,
                      weekday_price: 0,
                      weekend_price: 0
                    });
                  }
                }}
              >
                <option value="">-- Select Category --</option>
                {roomCategories.map(cat => (
                  <option key={cat.name} value={cat.name}>
                    {cat.name} (₹{cat.weekday_price}/₹{cat.weekend_price})
                  </option>
                ))}
              </select>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem', gridColumn: 'span 2' }}>
              <div className="form-group">
                <label className="form-label">Capacity (Auto)</label>
                <input type="number" className="form-input" disabled value={newRoom.capacity} />
              </div>
              <div className="form-group">
                <label className="form-label">Weekday ₹ (Auto)</label>
                <input type="number" className="form-input" disabled value={newRoom.weekday_price} />
              </div>
              <div className="form-group">
                <label className="form-label">Weekend ₹ (Auto)</label>
                <input type="number" className="form-input" disabled value={newRoom.weekend_price} />
              </div>
            </div>
            <div className="form-group" style={{ gridColumn: 'span 2' }}>
              <label className="form-label">Status</label>
              <select className="form-select" value={newRoom.status} onChange={e => setNewRoom({...newRoom, status: e.target.value})}>
                <option value="Active">Active</option>
                <option value="Inactive">Inactive</option>
              </select>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
            <button type="submit" className="btn btn-primary" style={{ flex: 1, backgroundColor: 'var(--warning)', borderColor: 'var(--warning)' }}>
              {editingId && editingType === 'room' ? 'Update Room' : 'Add Room'}
            </button>
            {editingId && editingType === 'room' && (
              <button type="button" className="btn btn-outline" style={{ color: 'var(--text-muted)' }} onClick={cancelEdit}>
                Cancel
              </button>
            )}
          </div>
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
                    <td>
                      <strong>{r.name}</strong><br/>
                      {r.room_type && <span style={{ fontSize: '0.8rem', color: 'var(--primary)', fontWeight: 'bold', display: 'block', margin: '0.1rem 0' }}>{r.room_type}</span>}
                      <span className={`badge badge-${(r.status === 'Active' || r.status === 'Available') ? 'success' : 'danger'}`}>
                        {(r.status === 'Available' || r.status === 'Active') ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td>
                      ₹{r.weekday_price} / ₹{r.weekend_price}
                    </td>
                    <td style={{ display: 'flex', gap: '0.5rem' }}>
                      <button className="btn btn-outline" style={{ padding: '0.2rem 0.5rem', color: 'var(--primary)' }} onClick={() => startEdit(r, 'room')}><Edit2 size={16}/></button>
                      <button className="btn btn-outline" style={{ padding: '0.2rem 0.5rem', color: 'var(--danger)' }} onClick={() => deleteRoom(r.id)}><Trash2 size={16}/></button>
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
