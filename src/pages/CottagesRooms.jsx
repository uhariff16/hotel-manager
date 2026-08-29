import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { Plus, Trash2, Edit2, Tag, CalendarDays, X, Check } from 'lucide-react';
import { useSettingsStore } from '../lib/store';

const PREDEFINED_CATEGORIES = [
  'Standard Room', 'Deluxe Room', 'Premium Room', 'Suite', 'Family Room', 'Dormitory', 'Tent', 'Cottage'
];

const PREDEFINED_RATE_PLANS = [
  'Weekday', 'Weekend', 'Holiday', 'Peak Season', 'Off Season', 'Early Bird'
];

export default function CottagesRooms() {
  const { session, activeResortId, profile, globalPlans } = useSettingsStore();
  const navigate = useNavigate();
  const [cottages, setCottages] = useState([]);
  const [rooms, setRooms] = useState([]);
  const [categories, setCategories] = useState([]);
  const [ratePlans, setRatePlans] = useState([]);
  
  const [categoryRates, setCategoryRates] = useState([]);
  const [propertyRates, setPropertyRates] = useState([]);
  
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [newRatePlanName, setNewRatePlanName] = useState('');

  const [editingCategory, setEditingCategory] = useState(null);
  const [editingCottage, setEditingCottage] = useState(null);

  const [newRoom, setNewRoom] = useState({ cottage_id: '', name: '', capacity: 1, status: 'Active', category_id: '' });
  const [expandedCottageId, setExpandedCottageId] = useState(null);

  const [editingId, setEditingId] = useState(null);
  const [editingType, setEditingType] = useState(null);

  useEffect(() => {
    fetchData();
  }, [activeResortId]);

  const fetchData = async () => {
    if (!isSupabaseConfigured()) {
      setError('Supabase is not configured.');
      setLoading(false);
      return;
    }
    
    try {
      const [cottagesRes, roomsRes, categoriesRes, plansRes] = await Promise.all([
        supabase.from('cottages').select('*').eq('resort_id', activeResortId).order('created_at', { ascending: true }),
        supabase.from('rooms').select('*').eq('resort_id', activeResortId).order('created_at', { ascending: true }),
        supabase.from('room_categories').select('*').eq('resort_id', activeResortId).order('created_at', { ascending: true }),
        supabase.from('rate_plans').select('*').eq('resort_id', activeResortId).order('created_at', { ascending: true })
      ]);
      
      if (cottagesRes.error) throw cottagesRes.error;
      if (roomsRes.error) throw roomsRes.error;
      if (categoriesRes.error) throw categoriesRes.error;
      if (plansRes.error) throw plansRes.error;
      
      setCottages(cottagesRes.data || []);
      setRooms(roomsRes.data || []);
      setCategories(categoriesRes.data || []);
      setRatePlans(plansRes.data || []);

      if (categoriesRes.data && categoriesRes.data.length > 0) {
        const catIds = categoriesRes.data.map(c => c.id);
        const { data: ratesData, error: ratesError } = await supabase
          .from('category_rates')
          .select('*')
          .in('category_id', catIds);
        if (ratesError) throw ratesError;
        setCategoryRates(ratesData || []);
      } else {
        setCategoryRates([]);
      }

      if (cottagesRes.data && cottagesRes.data.length > 0) {
        const cotIds = cottagesRes.data.map(c => c.id);
        const { data: propRatesData, error: propRatesError } = await supabase
          .from('property_rates')
          .select('*')
          .in('cottage_id', cotIds);
        if (propRatesError) throw propRatesError;
        setPropertyRates(propRatesData || []);
      } else {
        setPropertyRates([]);
      }

    } catch (err) {
      console.error(err);
      setError(err.message || 'Error fetching data. Did you run the SQL migration script?');
    } finally {
      setLoading(false);
    }
  };

  // --- RATE PLANS ---
  const handleAddRatePlan = async (e) => {
    e.preventDefault();
    if (!newRatePlanName.trim()) return;
    
    const { data, error } = await supabase.from('rate_plans').insert([{
      name: newRatePlanName, resort_id: activeResortId, tenant_id: session.user.id
    }]).select();

    if (error) {
      alert("Error adding rate plan: " + error.message);
    } else {
      setRatePlans([...ratePlans, data[0]]);
      setNewRatePlanName('');
    }
  };

  const handleDeleteRatePlan = async (id) => {
    if (!window.confirm("Delete rate plan? This removes its pricing from all categories and properties.")) return;
    await supabase.from('rate_plans').delete().eq('id', id);
    setRatePlans(ratePlans.filter(p => p.id !== id));
  };

  // --- ROOM CATEGORIES ---
  const handleSaveCategory = async (e) => {
    e.preventDefault();
    
    const payload = {
      name: editingCategory.name,
      capacity: Number(editingCategory.capacity),
      resort_id: activeResortId,
      tenant_id: session.user.id
    };

    let catId = editingCategory.id;

    if (catId) {
      const { error } = await supabase.from('room_categories').update(payload).eq('id', catId);
      if (error) return alert("Error saving category: " + error.message);
      setCategories(categories.map(c => c.id === catId ? { ...c, ...payload } : c));
    } else {
      const { data, error } = await supabase.from('room_categories').insert([payload]).select();
      if (error) return alert("Error adding category: " + error.message);
      catId = data[0].id;
      setCategories([...categories, data[0]]);
    }

    // Save rates
    for (const rp of ratePlans) {
      const price = Number(editingCategory.rates[rp.id] || 0);
      const existing = categoryRates.find(r => r.category_id === catId && r.rate_plan_id === rp.id);
      
      if (existing) {
        await supabase.from('category_rates').update({ price }).eq('id', existing.id);
        setCategoryRates(prev => prev.map(r => r.id === existing.id ? { ...r, price } : r));
      } else {
        const { data } = await supabase.from('category_rates').insert([{
          category_id: catId, rate_plan_id: rp.id, price
        }]).select();
        if (data) setCategoryRates(prev => [...prev, data[0]]);
      }
    }
    
    setEditingCategory(null);
  };

  const handleDeleteCategory = async (id) => {
    if (!window.confirm("Delete category? Rooms using it will lose their pricing link.")) return;
    await supabase.from('room_categories').delete().eq('id', id);
    setCategories(categories.filter(c => c.id !== id));
  };

  const startCategoryEdit = (cat = null) => {
    if (cat) {
      const rates = {};
      ratePlans.forEach(rp => {
        const r = categoryRates.find(cr => cr.category_id === cat.id && cr.rate_plan_id === rp.id);
        rates[rp.id] = r ? r.price : 0;
      });
      setEditingCategory({ ...cat, rates });
    } else {
      const rates = {};
      ratePlans.forEach(rp => rates[rp.id] = 0);
      setEditingCategory({ name: '', capacity: 2, rates });
    }
  };

  // --- PROPERTIES (COTTAGES) ---
  const handleSaveCottage = async (e) => {
    e.preventDefault();
    
    // Check duplicate name
    const isDuplicate = cottages.some(c => c.name.toLowerCase().trim() === editingCottage.name.toLowerCase().trim() && c.id !== editingCottage.id);
    if (isDuplicate) {
       return alert("A property with this name already exists.");
    }
    
    const dbStatus = editingCottage.status === 'Active' ? 'Available' : 'Maintenance';
    const payload = { 
      name: editingCottage.name,
      max_capacity: Number(editingCottage.max_capacity),
      status: dbStatus,
      phone: editingCottage.phone,
      wifi_password: editingCottage.wifi_password,
      tenant_id: session.user.id, 
      resort_id: activeResortId 
    };

    let cotId = editingCottage.id;

    if (cotId) {
      const { error } = await supabase.from('cottages').update(payload).eq('id', cotId);
      if (error) return alert("Error saving property: " + error.message);
      setCottages(cottages.map(c => c.id === cotId ? { ...c, ...payload, status: dbStatus } : c));
    } else {
      const { data, error } = await supabase.from('cottages').insert([payload]).select();
      if (error) return alert("Error adding property: " + error.message);
      cotId = data[0].id;
      setCottages([...cottages, data[0]]);
    }

    // Save property rates
    for (const rp of ratePlans) {
      const price = Number(editingCottage.rates[rp.id] || 0);
      const existing = propertyRates.find(r => r.cottage_id === cotId && r.rate_plan_id === rp.id);
      
      if (existing) {
        await supabase.from('property_rates').update({ price }).eq('id', existing.id);
        setPropertyRates(prev => prev.map(r => r.id === existing.id ? { ...r, price } : r));
      } else {
        const { data } = await supabase.from('property_rates').insert([{
          cottage_id: cotId, rate_plan_id: rp.id, price
        }]).select();
        if (data) setPropertyRates(prev => [...prev, data[0]]);
      }
    }
    
    setEditingCottage(null);
  };

  const deleteCottage = async (id) => {
    if (!window.confirm("Delete this property? All its rooms will be deleted.")) return;
    await supabase.from('cottages').delete().eq('id', id);
    setCottages(cottages.filter(c => c.id !== id));
    setRooms(rooms.filter(r => r.cottage_id !== id));
  };

  const startCottageEdit = (cot = null) => {
    if (cot) {
      const rates = {};
      ratePlans.forEach(rp => {
        const r = propertyRates.find(pr => pr.cottage_id === cot.id && pr.rate_plan_id === rp.id);
        rates[rp.id] = r ? r.price : 0;
      });
      setEditingCottage({ 
        ...cot, 
        status: (cot.status === 'Available' || cot.status === 'Active') ? 'Active' : 'Inactive',
        rates 
      });
    } else {
      const rates = {};
      ratePlans.forEach(rp => rates[rp.id] = 0);
      setEditingCottage({ 
        name: '', max_capacity: 10, status: 'Active', phone: '', wifi_password: '', rates 
      });
    }
  };


  const handleAddRoom = async (e) => {
    e.preventDefault();
    if (!newRoom.cottage_id) return alert('Select a Property first');
    
    const isDuplicate = rooms.some(r => r.cottage_id === newRoom.cottage_id && r.name.toLowerCase().trim() === newRoom.name.toLowerCase().trim() && r.id !== editingId);
    if (isDuplicate) {
       return alert("A room with this name already exists in this property.");
    }
    
    // Check Room Limit if not editing
    if (!editingId || editingType !== 'room') {
      const planConfig = globalPlans?.[profile?.plan_type || 'free'] || { maxRooms: 4 };
      const roomLimit = planConfig.maxRooms || 4;
      if (rooms.length >= roomLimit) {
        return alert(`You have reached the maximum room limit (${roomLimit}) for your current plan. Please upgrade to add more rooms.`);
      }
    }
    
    const dbStatus = newRoom.status === 'Active' ? 'Available' : 'Maintenance';
    const payload = {
      cottage_id: newRoom.cottage_id,
      name: newRoom.name,
      category_id: newRoom.category_id || null,
      capacity: Number(newRoom.capacity),
      status: dbStatus,
      weekday_price: 0,
      weekend_price: 0,
      seasonal_price: 0,
      tenant_id: session.user.id,
      resort_id: activeResortId
    };

    if (editingId && editingType === 'room') {
      try {
        const { error } = await supabase.from('rooms').update(payload).eq('id', editingId);
        if (error) alert("Error saving room: " + error.message);
        else {
          setRooms(rooms.map(r => r.id === editingId ? { ...r, ...payload } : r));
          setEditingId(null);
          setEditingType(null);
          setNewRoom({ cottage_id: '', name: '', capacity: 1, status: 'Active', category_id: '' });
        }
      } catch (e) {
        alert("Error saving room changes: " + e.message);
      }
      return;
    }

    try {
      const { data, error } = await supabase.from('rooms').insert([payload]).select();
      if (error) alert(error.message);
      else {
        setRooms([...rooms, data[0]]);
        setNewRoom({ cottage_id: '', name: '', capacity: 1, status: 'Active', category_id: '' });
      }
    } catch (e) {
      alert("Error adding room.");
    }
  };

  const startEditRoom = (r) => {
    setEditingId(r.id);
    setEditingType('room');
    setNewRoom({
      cottage_id: r.cottage_id || '',
      name: r.name || '',
      capacity: r.capacity || 1,
      status: (r.status === 'Available' || r.status === 'Active') ? 'Active' : 'Inactive',
      category_id: r.category_id || ''
    });
  };

  const deleteRoom = async (id) => {
    if (!window.confirm("Delete this room?")) return;
    await supabase.from('rooms').delete().eq('id', id);
    setRooms(rooms.filter(r => r.id !== id));
  };


  if (loading) return <div>Loading setup...</div>;

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
      <div style={{ marginBottom: '2rem', display: 'flex', flexWrap: 'wrap', gap: '1rem', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ flex: '1 1 300px' }}>
          <h1 style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>Property Management</h1>
          <p style={{ color: 'var(--text-muted)' }}>Configure your global Rate Plans, Room Categories, Properties and Rooms.</p>
          {error && <div className="alert alert-danger" style={{marginTop: '1rem', color: 'red'}}>{error}</div>}
        </div>
        <button 
          className="btn btn-primary" 
          onClick={() => navigate('/wizard?newProperty=true')}
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', fontWeight: 600, padding: '0.6rem 1.2rem', whiteSpace: 'nowrap' }}
        >
          <Plus size={18} />
          Quick Setup Wizard
        </button>
      </div>

      <div className="grid-2" style={{ gap: '2rem', marginBottom: '2rem' }}>
        
        {/* RATE PLANS LIST */}
        <div className="card">
          <h2 style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-main)', fontWeight: 800 }}>
            <CalendarDays size={22} /> Global Rate Plans
          </h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '1rem' }}>
            Define the pricing concepts (e.g. Weekday, Weekend) that apply across your property. Prices are attached to specific categories or properties.
          </p>
          <form onSubmit={handleAddRatePlan} style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem', alignItems: 'center' }}>
            <select 
              className="form-select" 
              value={newRatePlanName}
              onChange={e => setNewRatePlanName(e.target.value)}
              required
            >
              <option value="">-- Select Rate Plan --</option>
              {PREDEFINED_RATE_PLANS.filter(rp => !ratePlans.find(existing => existing.name === rp)).map(rp => (
                <option key={rp} value={rp}>{rp}</option>
              ))}
            </select>
            <button type="submit" className="btn btn-primary" disabled={!newRatePlanName}>Add</button>
          </form>
          
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {ratePlans.map(rp => (
              <li key={rp.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.75rem', background: 'var(--bg-color)', border: '1px solid var(--border)', borderRadius: '8px', marginBottom: '0.5rem' }}>
                <span style={{ fontWeight: 600 }}>{rp.name}</span>
                <button type="button" className="btn" style={{ padding: '0', background: 'none', color: 'var(--danger)', border: 'none' }} onClick={() => handleDeleteRatePlan(rp.id)}>
                  <X size={16} />
                </button>
              </li>
            ))}
            {ratePlans.length === 0 && <li style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>No rate plans defined.</li>}
          </ul>
        </div>

        {/* ROOM CATEGORIES LIST */}
        <div className="card">
          <h2 style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem', color: 'var(--text-main)', fontWeight: 800 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Tag size={22} /> Room Categories
            </div>
            <button className="btn btn-primary" style={{ padding: '0.4rem 0.8rem', fontSize: '0.85rem', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: '0.4rem' }} onClick={() => startCategoryEdit()}>
              <Plus size={16} /> New Category
            </button>
          </h2>
          
          {editingCategory ? (
            <form onSubmit={handleSaveCategory} style={{ background: 'var(--bg-color)', padding: '1rem', borderRadius: '8px', border: '1px solid var(--border)' }}>
              <h4>{editingCategory.id ? 'Edit Category' : 'Add Category'}</h4>
              <div className="grid-2" style={{ gap: '1rem', marginTop: '1rem', marginBottom: '1rem' }}>
                <div className="form-group" style={{ gridColumn: 'span 2' }}>
                  <label className="form-label">Category Name</label>
                  <select className="form-select" required value={editingCategory.name} onChange={e => setEditingCategory({...editingCategory, name: e.target.value})}>
                    <option value="">-- Select Category --</option>
                    {PREDEFINED_CATEGORIES.map(cat => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>
                </div>
                <div className="form-group" style={{ gridColumn: 'span 2' }}>
                  <label className="form-label">Capacity</label>
                  <input type="number" className="form-input" required value={editingCategory.capacity} onChange={e => setEditingCategory({...editingCategory, capacity: e.target.value})} />
                </div>
                <div style={{ gridColumn: 'span 2' }}>
                  <h5 style={{ marginBottom: '0.5rem', color: 'var(--text-muted)' }}>Prices per Rate Plan</h5>
                  {ratePlans.length === 0 && <p style={{ fontSize: '0.8rem', color: 'var(--danger)' }}>No Rate Plans defined yet. Add some first!</p>}
                  {ratePlans.map(rp => (
                    <div key={rp.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                      <span style={{ fontSize: '0.9rem', fontWeight: 500 }}>{rp.name}</span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <span>₹</span>
                        <input 
                          type="number" 
                          className="form-input" 
                          style={{ width: '100px', padding: '0.3rem' }}
                          value={editingCategory.rates[rp.id]} 
                          onChange={e => setEditingCategory({
                            ...editingCategory, 
                            rates: { ...editingCategory.rates, [rp.id]: e.target.value }
                          })}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button type="submit" className="btn btn-primary" style={{ flex: 1 }}>Save</button>
                <button type="button" className="btn btn-outline" onClick={() => setEditingCategory(null)}>Cancel</button>
              </div>
            </form>
          ) : (
            <div className="table-container">
              <table className="table">
                <thead>
                  <tr>
                    <th>Category</th>
                    <th>Capacity</th>
                    <th style={{ textAlign: 'center', width: '90px' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {categories.map(cat => (
                    <tr key={cat.id}>
                      <td><strong>{cat.name}</strong></td>
                      <td>{cat.capacity}</td>
                      <td style={{ display: 'flex', gap: '0.5rem' }}>
                        <button className="btn btn-outline" style={{ padding: '0.2rem 0.5rem', color: 'var(--primary)' }} onClick={() => startCategoryEdit(cat)}><Edit2 size={16}/></button>
                        <button className="btn btn-outline" style={{ padding: '0.2rem 0.5rem', color: 'var(--danger)' }} onClick={() => handleDeleteCategory(cat.id)}><Trash2 size={16}/></button>
                      </td>
                    </tr>
                  ))}
                  {categories.length === 0 && <tr><td colSpan="3" style={{textAlign:'center'}}>No categories defined.</td></tr>}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <div className="grid-2" style={{ gap: '2rem' }}>
      
      {/* COTTAGES SECTION */}
      <div className="card">
        <h2 style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem', color: 'var(--text-main)', fontWeight: 800 }}>
          <span>Properties (Entire Property Booking)</span>
          {!editingCottage && (
            <button className="btn btn-primary" style={{ padding: '0.4rem 0.8rem', fontSize: '0.85rem', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: '0.4rem' }} onClick={() => startCottageEdit()}>
              <Plus size={16} /> New Property
            </button>
          )}
        </h2>
        
        {editingCottage ? (
          <form onSubmit={handleSaveCottage} style={{ background: 'var(--bg-color)', padding: '1rem', borderRadius: '8px', border: '1px solid var(--border)', marginBottom: '1.5rem' }}>
            <h4>{editingCottage.id ? `Edit Property` : 'Add New Property'}</h4>
            <div className="grid-2" style={{ gap: '1rem', marginTop: '1rem' }}>
              <div className="form-group" style={{ gridColumn: 'span 2' }}>
                <label className="form-label">Name</label>
                <input type="text" className="form-input" required value={editingCottage.name} onChange={e => setEditingCottage({...editingCottage, name: e.target.value})} />
              </div>
              <div className="form-group" style={{ gridColumn: 'span 2' }}>
                <label className="form-label">Capacity (Max Guests)</label>
                <input type="number" className="form-input" min="1" required value={editingCottage.max_capacity} onChange={e => setEditingCottage({...editingCottage, max_capacity: e.target.value})} />
              </div>
              
              <div style={{ gridColumn: 'span 2', padding: '1rem', background: '#fff', borderRadius: '8px', border: '1px solid var(--border)' }}>
                <h5 style={{ marginBottom: '0.5rem', color: 'var(--primary)', fontWeight: 700 }}>Entire Property Prices per Rate Plan</h5>
                {ratePlans.length === 0 && <p style={{ fontSize: '0.8rem', color: 'var(--danger)' }}>No Rate Plans defined yet. Add some first!</p>}
                {ratePlans.map(rp => (
                  <div key={rp.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                    <span style={{ fontSize: '0.9rem', fontWeight: 500 }}>{rp.name}</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <span>₹</span>
                      <input 
                        type="number" 
                        className="form-input" 
                        style={{ width: '120px', padding: '0.3rem' }}
                        value={editingCottage.rates[rp.id]} 
                        onChange={e => setEditingCottage({
                          ...editingCottage, 
                          rates: { ...editingCottage.rates, [rp.id]: e.target.value }
                        })}
                      />
                    </div>
                  </div>
                ))}
              </div>

              <div className="form-group">
                <label className="form-label">Contact Number</label>
                <input type="text" className="form-input" value={editingCottage.phone} onChange={e => setEditingCottage({...editingCottage, phone: e.target.value})} />
              </div>
              <div className="form-group">
                <label className="form-label">Wi-Fi Password</label>
                <input type="text" className="form-input" value={editingCottage.wifi_password} onChange={e => setEditingCottage({...editingCottage, wifi_password: e.target.value})} />
              </div>
              <div className="form-group" style={{ gridColumn: 'span 2' }}>
                <label className="form-label">Status</label>
                <select className="form-select" value={editingCottage.status} onChange={e => setEditingCottage({...editingCottage, status: e.target.value})}>
                  <option value="Active">Active</option>
                  <option value="Inactive">Inactive</option>
                </select>
              </div>
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
              <button type="submit" className="btn btn-primary" style={{ flex: 1 }}>Save Property</button>
              <button type="button" className="btn btn-outline" onClick={() => setEditingCottage(null)}>Cancel</button>
            </div>
          </form>
        ) : (
          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Capacity</th>
                  <th style={{ textAlign: 'center', width: '90px' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {cottages.map(c => (
                  <React.Fragment key={c.id}>
                    <tr onClick={() => setExpandedCottageId(expandedCottageId === c.id ? null : c.id)} style={{ cursor: 'pointer' }}>
                      <td>
                        <strong>{c.name}</strong>
                        <div style={{ marginTop: '0.25rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                          <span className={`badge badge-${(c.status === 'Active' || c.status === 'Available') ? 'success' : 'danger'}`}>
                            {(c.status === 'Available' || c.status === 'Active') ? 'Active' : 'Inactive'}
                          </span>
                        </div>
                      </td>
                      <td>{c.max_capacity}</td>
                      <td style={{ display: 'flex', gap: '0.5rem' }}>
                        <button className="btn btn-outline" style={{ padding: '0.2rem 0.5rem', color: 'var(--primary)' }} onClick={(e) => { e.stopPropagation(); startCottageEdit(c); }}><Edit2 size={16}/></button>
                        <button className="btn btn-outline" style={{ padding: '0.2rem 0.5rem', color: 'var(--danger)' }} onClick={(e) => { e.stopPropagation(); deleteCottage(c.id); }}><Trash2 size={16}/></button>
                      </td>
                    </tr>
                    {expandedCottageId === c.id && (
                      <tr style={{ background: 'var(--bg-secondary)' }}>
                        <td colSpan="3" style={{ padding: '1rem' }}>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', fontSize: '0.9rem' }}>
                            <div>
                              <strong style={{ color: 'var(--text-muted)' }}>Phone:</strong>
                              <div style={{ marginTop: '0.25rem' }}>{c.phone || 'Not provided'}</div>
                            </div>
                            <div>
                              <strong style={{ color: 'var(--text-muted)' }}>Wi-Fi Password:</strong>
                              <div style={{ marginTop: '0.25rem' }}>{c.wifi_password || 'Not provided'}</div>
                            </div>
                            <div style={{ gridColumn: 'span 2' }}>
                              <strong style={{ color: 'var(--text-muted)' }}>Rate Plan Pricing:</strong>
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', marginTop: '0.5rem' }}>
                                {ratePlans.map(rp => {
                                  const propertyRates = c.rates || {};
                                  return (
                                    <div key={rp.id} style={{ background: 'var(--bg-color)', padding: '0.5rem', borderRadius: '4px', border: '1px solid var(--border)' }}>
                                      <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{rp.name}</div>
                                      <div style={{ fontWeight: 600 }}>₹{propertyRates[rp.id] || 0}</div>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
                {cottages.length === 0 && <tr><td colSpan="3" style={{textAlign:'center'}}>No properties defined.</td></tr>}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ROOMS SECTION */}
      <div className="card">
        <h2 style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem', color: 'var(--text-main)', fontWeight: 800 }}>
          <span>Rooms (Individual Booking)</span>
        </h2>
        
        <form onSubmit={handleAddRoom} style={{ background: 'var(--bg-color)', padding: '1rem', borderRadius: '8px', border: '1px solid var(--border)', marginBottom: '1.5rem' }}>
          <h4>{editingId && editingType === 'room' ? `Edit Room` : 'Add New Room'}</h4>
          <div className="grid-2" style={{ gap: '1rem', marginTop: '1rem' }}>
            <div className="form-group" style={{ gridColumn: 'span 2' }}>
              <label className="form-label">Link to Property</label>
              <select className="form-select" required value={newRoom.cottage_id} onChange={e => setNewRoom({...newRoom, cottage_id: e.target.value})}>
                <option value="">-- Select Property --</option>
                {cottages.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div className="form-group" style={{ gridColumn: 'span 2' }}>
              <label className="form-label">Room Name / Number</label>
              <input type="text" className="form-input" required value={newRoom.name} onChange={e => setNewRoom({...newRoom, name: e.target.value})} />
            </div>
            <div className="form-group" style={{ gridColumn: 'span 2' }}>
              <label className="form-label">Pricing Category</label>
              <select 
                className="form-select" 
                required 
                value={newRoom.category_id} 
                onChange={e => {
                  const cat = categories.find(c => c.id === e.target.value);
                  setNewRoom({
                    ...newRoom,
                    category_id: e.target.value,
                    capacity: cat ? cat.capacity : 1
                  });
                }}
              >
                <option value="">-- Select Category --</option>
                {categories.map(cat => (
                  <option key={cat.id} value={cat.id}>
                    {cat.name} (Cap: {cat.capacity})
                  </option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Capacity (Auto)</label>
              <input type="number" className="form-input" disabled value={newRoom.capacity} />
            </div>
            <div className="form-group">
              <label className="form-label">Status</label>
              <select className="form-select" value={newRoom.status} onChange={e => setNewRoom({...newRoom, status: e.target.value})}>
                <option value="Active">Active</option>
                <option value="Inactive">Inactive</option>
              </select>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
            <button type="submit" className="btn btn-primary" style={{ flex: 1 }}>
              {editingId && editingType === 'room' ? 'Update Room' : 'Add Room'}
            </button>
            {editingId && editingType === 'room' && (
              <button type="button" className="btn btn-outline" onClick={() => { setEditingId(null); setEditingType(null); setNewRoom({ cottage_id: '', name: '', capacity: 1, status: 'Active', category_id: '' }); }}>Cancel</button>
            )}
          </div>
        </form>

        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <th>Room</th>
                <th>Category</th>
                <th style={{ textAlign: 'center', width: '90px' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {rooms.map(r => {
                const cottage = cottages.find(c => c.id === r.cottage_id);
                const category = categories.find(c => c.id === r.category_id);
                return (
                  <tr key={r.id}>
                    <td>
                      <strong>{r.name}</strong><br/>
                      <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>in {cottage ? cottage.name : '-'}</span>
                      <span className={`badge badge-${(r.status === 'Active' || r.status === 'Available') ? 'success' : 'danger'}`} style={{ display: 'block', width: 'fit-content', marginTop: '4px' }}>
                        {(r.status === 'Available' || r.status === 'Active') ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td>
                      <span style={{ fontSize: '0.9rem', color: 'var(--primary)', fontWeight: 'bold' }}>
                        {category ? category.name : 'No Category'}
                      </span>
                    </td>
                    <td style={{ display: 'flex', gap: '0.5rem' }}>
                      <button className="btn btn-outline" style={{ padding: '0.2rem 0.5rem', color: 'var(--primary)' }} onClick={() => startEditRoom(r)}><Edit2 size={16}/></button>
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
