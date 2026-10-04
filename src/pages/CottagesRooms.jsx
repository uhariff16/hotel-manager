import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { Plus, Trash2, Edit2, Tag, CalendarDays, X, Check, Building2, BedDouble, Layers, MoreVertical, ChevronDown, ChevronUp, ChevronRight, Wand2, PackagePlus } from 'lucide-react';
import { useSettingsStore } from '../lib/store';
import { getTenantEntitlements } from '../utils/planEntitlements';
import { PricingSettings } from './Settings';

const PREDEFINED_CATEGORIES = [
  'Standard Room', 'Deluxe Room', 'Premium Room', 'Suite', 'Family Room', 'Dormitory', 'Tent', 'Cottage'
];

export default function CottagesRooms() {
  const { session, activeResortId, profile, globalPlans, resorts } = useSettingsStore();
  const navigate = useNavigate();
  
  // Tab State: 'properties' | 'categories' | 'rates' | 'addons'
  const [activeTab, setActiveTab] = useState(() => new URLSearchParams(window.location.search).get('tab') || 'properties');
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth <= 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const [cottages, setCottages] = useState([]);
  const [rooms, setRooms] = useState([]);
  const [categories, setCategories] = useState([]);
  const [ratePlans, setRatePlans] = useState([]);
  
  const [categoryRates, setCategoryRates] = useState([]);
  const [propertyRates, setPropertyRates] = useState([]);

  // Dynamic tenant entitlement resolution
  const entitlements = useMemo(() => {
    return getTenantEntitlements({
      profile,
      globalPlans,
      cottages: cottages || [],
      rooms: rooms || []
    });
  }, [profile, globalPlans, cottages, rooms]);
  
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [ratePlanForm, setRatePlanForm] = useState({ id: null, name: '', start_date: '', end_date: '', priority: '', days_of_week: [] });
  const [editingCategory, setEditingCategory] = useState(null);
  const [editingCottage, setEditingCottage] = useState(null);

  const [newRoom, setNewRoom] = useState({ cottage_id: '', name: '', capacity: 1, status: 'Active', category_id: '' });
  const [expandedCottageId, setExpandedCottageId] = useState(null);
  const [activeActionMenuId, setActiveActionMenuId] = useState(null);

  const [editingId, setEditingId] = useState(null);
  const [editingType, setEditingType] = useState(null);
  const [showRoomModal, setShowRoomModal] = useState(false);

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
      setLoading(true);
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
      setError(err.message || 'Error fetching property management data.');
    } finally {
      setLoading(false);
    }
  };

  // --- RATE PLANS ---
  const toggleDayOfWeek = (dayIndex) => {
    setRatePlanForm(prev => {
      const exists = prev.days_of_week.includes(dayIndex);
      if (exists) {
        return { ...prev, days_of_week: prev.days_of_week.filter(d => d !== dayIndex) };
      } else {
        return { ...prev, days_of_week: [...prev.days_of_week, dayIndex] };
      }
    });
  };

  const handleAddRatePlan = async (e) => {
    e.preventDefault();
    if (!ratePlanForm.name.trim()) return;
    
    const payload = {
      name: ratePlanForm.name.trim(),
      start_date: ratePlanForm.start_date || null,
      end_date: ratePlanForm.end_date || null,
      priority: Number(ratePlanForm.priority) || 0,
      days_of_week: ratePlanForm.days_of_week,
      tenant_id: session.user.id,
      resort_id: activeResortId
    };

    if (ratePlanForm.id) {
      const { error } = await supabase.from('rate_plans').update(payload).eq('id', ratePlanForm.id);
      if (error) return alert("Error updating rate plan: " + error.message);
      setRatePlans(ratePlans.map(p => p.id === ratePlanForm.id ? { ...p, ...payload } : p));
    } else {
      const { data, error } = await supabase.from('rate_plans').insert([payload]).select();
      if (error) return alert("Error adding rate plan: " + error.message);
      setRatePlans([...ratePlans, data[0]]);
    }

    setRatePlanForm({ id: null, name: '', start_date: '', end_date: '', priority: '', days_of_week: [] });
  };

  const startEditRatePlan = (rp) => {
    setRatePlanForm({
      id: rp.id,
      name: rp.name,
      start_date: rp.start_date || '',
      end_date: rp.end_date || '',
      priority: rp.priority || '',
      days_of_week: rp.days_of_week || []
    });
  };

  const handleDeleteRatePlan = async (id) => {
    if (!window.confirm("Delete rate plan? This removes its pricing definitions.")) return;
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
      tenant_id: session.user.id,
      cottage_id: editingCategory.cottage_id || null
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
      setEditingCategory({ ...cat, cottage_id: cat.cottage_id || '', rates });
    } else {
      const rates = {};
      ratePlans.forEach(rp => rates[rp.id] = 0);
      setEditingCategory({ name: '', capacity: 2, cottage_id: '', rates });
    }
  };

  // --- PROPERTIES (COTTAGES) ---
  const handleSaveCottage = async (e) => {
    e.preventDefault();
    
    if (!editingCottage.id && !entitlements.canCreate.cottage) {
      return alert(`Property limit reached: Your ${entitlements.planName} plan limit is ${entitlements.limits.maxResorts}. Please upgrade your plan for more.`);
    }

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
      weekday_price: 0,
      weekend_price: 0,
      seasonal_price: 0,
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
    if (!cot) {
      if (entitlements.isUnknownPlan) {
        return alert(entitlements.reason);
      }
      if (entitlements.isSuspended) {
        return alert("Your account is currently suspended. Please contact support.");
      }
      if (!entitlements.canCreate.cottage) {
        const limitStr = entitlements.limits.maxResorts === 1 ? '1 property' : `${entitlements.limits.maxResorts} properties`;
        const existStr = cottages.length === 1 ? '1 property remains' : `${cottages.length} properties remain`;
        return alert(`Property Limit Reached\n\nYour ${entitlements.planName} plan supports up to ${limitStr}. Your ${existStr} active, but you cannot add another property on this plan.\n\nPlease upgrade your plan on our website for additional property capacity.`);
      }
    }

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

  // --- ROOMS ---
  const handleAddRoom = async (e) => {
    e.preventDefault();
    if (!newRoom.cottage_id) return alert('Select a Property first');
    
    const isDuplicate = rooms.some(r => r.cottage_id === newRoom.cottage_id && r.name.toLowerCase().trim() === newRoom.name.toLowerCase().trim() && r.id !== editingId);
    if (isDuplicate) {
       return alert("A room with this name already exists in this property.");
    }
    
    if (!editingId || editingType !== 'room') {
      if (entitlements.isUnknownPlan) {
        return alert(entitlements.reason);
      }
      if (entitlements.isSuspended) {
        return alert("Your account is currently suspended. Please contact support.");
      }
      if (!entitlements.canCreate.room) {
        const maxR = entitlements.limits.maxRooms >= 999999 ? 'Unlimited' : entitlements.limits.maxRooms;
        return alert(`Room Limit Reached\n\nYour ${entitlements.planName} plan supports up to ${maxR} rooms across all properties. Current usage: ${rooms.length} / ${maxR} rooms.\n\nPlease upgrade your plan for additional room capacity.`);
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
          setShowRoomModal(false);
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
        setShowRoomModal(false);
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
    setShowRoomModal(true);
  };

  const deleteRoom = async (id) => {
    if (!window.confirm("Delete this room?")) return;
    await supabase.from('rooms').delete().eq('id', id);
    setRooms(rooms.filter(r => r.id !== id));
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '50vh', gap: '1rem' }}>
        <div className="animate-spin" style={{ border: '3px solid var(--border)', borderTop: '3px solid var(--primary)', borderRadius: '50%', width: '36px', height: '36px' }}></div>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.95rem' }}>Loading property management...</p>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: '1100px', margin: '0 auto', padding: isMobile ? '0.5rem 0' : '1rem 0' }}>
      {/* Shared Page Header Shell */}
      <div style={{ 
        display: 'flex', 
        flexDirection: isMobile ? 'column' : 'row',
        justifyContent: 'space-between', 
        alignItems: isMobile ? 'flex-start' : 'center', 
        gap: '1rem',
        marginBottom: '1.5rem' 
      }}>
        <div>
          <h1 style={{ fontSize: isMobile ? '1.5rem' : '1.85rem', fontWeight: 800, margin: 0, color: 'var(--text-main)' }}>
            Property Management
          </h1>
          <p style={{ margin: '0.25rem 0 0 0', color: 'var(--text-muted)', fontSize: '0.95rem' }}>
            Manage your properties, rooms, room categories and rate plans.
          </p>
          {error && <div className="alert alert-danger" style={{ marginTop: '0.75rem', color: 'var(--danger)' }}>{error}</div>}
        </div>

        {/* Header Action Buttons */}
        <div style={{ display: 'flex', gap: '0.75rem', width: isMobile ? '100%' : 'auto' }}>
          <button 
            className="btn btn-outline" 
            onClick={() => navigate('/wizard?newProperty=true')}
            style={{ flex: isMobile ? 1 : 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem', fontWeight: 600, padding: '0.6rem 1rem' }}
          >
            <Wand2 size={16} /> Quick Setup
          </button>
          <button 
            className="btn btn-primary" 
            onClick={() => startCottageEdit()}
            style={{ flex: isMobile ? 1 : 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem', fontWeight: 700, padding: '0.6rem 1.25rem' }}
          >
            <Plus size={18} /> Add Property
          </button>
        </div>
      </div>

      {/* Dynamic Summary Strip */}
      <div style={{ 
        background: 'var(--card-bg, #ffffff)', 
        border: '1px solid var(--border)', 
        borderRadius: '10px', 
        padding: '0.75rem 1.25rem', 
        marginBottom: '1.5rem',
        display: 'flex',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: isMobile ? '0.75rem' : '1.5rem',
        fontSize: '0.85rem',
        fontWeight: 600,
        color: 'var(--text-main)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
          <Building2 size={16} color="var(--primary)" />
          <span><strong>{cottages.length}</strong> {cottages.length === 1 ? 'Property' : 'Properties'}</span>
        </div>
        <span style={{ color: 'var(--border)' }}>•</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
          <BedDouble size={16} color="var(--primary)" />
          <span><strong>{rooms.length}</strong> {rooms.length === 1 ? 'Room' : 'Rooms'}</span>
        </div>
        <span style={{ color: 'var(--border)' }}>•</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
          <Tag size={16} color="var(--primary)" />
          <span><strong>{categories.length}</strong> {categories.length === 1 ? 'Category' : 'Categories'}</span>
        </div>
        <span style={{ color: 'var(--border)' }}>•</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
          <CalendarDays size={16} color="var(--primary)" />
          <span><strong>{ratePlans.length}</strong> {ratePlans.length === 1 ? 'Rate Plan' : 'Rate Plans'}</span>
        </div>
      </div>

      {/* Primary Section Tabs */}
      <div className="settings-nav-bar" style={{ marginBottom: '1.75rem' }}>
        <button
          type="button"
          onClick={() => setActiveTab('properties')}
          className={`settings-nav-button ${activeTab === 'properties' ? 'active' : ''}`}
        >
          <Building2 size={18} /> Properties & Rooms
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('categories')}
          className={`settings-nav-button ${activeTab === 'categories' ? 'active' : ''}`}
        >
          <Tag size={18} /> Room Categories
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('rates')}
          className={`settings-nav-button ${activeTab === 'rates' ? 'active' : ''}`}
        >
          <CalendarDays size={18} /> Rate Plans
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('addons')}
          className={`settings-nav-button ${activeTab === 'addons' ? 'active' : ''}`}
        >
          <PackagePlus size={18} /> Add-ons
        </button>
      </div>

      {/* --- TAB 1: PROPERTIES & ROOMS --- */}
      {activeTab === 'properties' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {cottages.map(cot => {
            const propertyRooms = rooms.filter(r => r.cottage_id === cot.id);
            const isActive = cot.status === 'Available' || cot.status === 'Active';
            const isExpanded = expandedCottageId === cot.id || !isMobile;

            return (
              <div key={cot.id} className="card" style={{ padding: isMobile ? '1.25rem' : '1.75rem', borderRadius: '14px' }}>
                <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', marginBottom: '1rem', borderBottom: '1px solid var(--border)', paddingBottom: '1rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <div style={{ width: 44, height: 44, borderRadius: '10px', background: 'rgba(15, 44, 89, 0.04)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Building2 size={22} color="var(--primary)" />
                    </div>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <h2 style={{ fontSize: '1.25rem', fontWeight: 800, margin: 0, color: 'var(--text-main)' }}>{cot.name}</h2>
                        <span className={`badge badge-${isActive ? 'success' : 'danger'}`} style={{ fontSize: '0.7rem' }}>
                          {isActive ? 'ACTIVE' : 'INACTIVE'}
                        </span>
                      </div>
                      <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                        Entire Property • Capacity: <strong>{cot.max_capacity}</strong> • <strong>{propertyRooms.length}</strong> {propertyRooms.length === 1 ? 'Room' : 'Rooms'}
                      </div>
                    </div>
                  </div>

                  {/* Desktop Action Buttons */}
                  {!isMobile ? (
                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                      <button className="btn btn-outline" style={{ fontSize: '0.85rem', padding: '0.4rem 0.8rem' }} onClick={() => startCottageEdit(cot)}>
                        <Edit2 size={15} /> Edit
                      </button>
                      <button 
                        className="btn btn-primary" 
                        style={{ fontSize: '0.85rem', padding: '0.4rem 0.8rem' }} 
                        onClick={() => {
                          setEditingId(null);
                          setEditingType(null);
                          setNewRoom({ cottage_id: cot.id, name: '', capacity: 1, status: 'Active', category_id: '' });
                          setShowRoomModal(true);
                        }}
                      >
                        <Plus size={15} /> Add Room
                      </button>
                      <button className="btn btn-outline" style={{ fontSize: '0.85rem', padding: '0.4rem 0.8rem', color: 'var(--danger)' }} onClick={() => deleteCottage(cot.id)}>
                        <Trash2 size={15} />
                      </button>
                    </div>
                  ) : (
                    /* Mobile Contextual Menu & Expand Toggle */
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <button 
                        className="btn btn-primary" 
                        style={{ fontSize: '0.8rem', padding: '0.35rem 0.65rem' }}
                        onClick={() => {
                          setEditingId(null);
                          setEditingType(null);
                          setNewRoom({ cottage_id: cot.id, name: '', capacity: 1, status: 'Active', category_id: '' });
                          setShowRoomModal(true);
                        }}
                      >
                        <Plus size={14} /> Room
                      </button>
                      <button 
                        className="btn btn-outline" 
                        style={{ padding: '0.35rem 0.5rem' }} 
                        onClick={() => setExpandedCottageId(expandedCottageId === cot.id ? null : cot.id)}
                      >
                        {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                      </button>
                      <div style={{ position: 'relative' }}>
                        <button 
                          className="btn btn-outline" 
                          style={{ padding: '0.35rem 0.5rem' }} 
                          onClick={() => setActiveActionMenuId(activeActionMenuId === cot.id ? null : cot.id)}
                        >
                          <MoreVertical size={16} />
                        </button>
                        {activeActionMenuId === cot.id && (
                          <div style={{ 
                            position: 'absolute', right: 0, top: '100%', marginTop: '0.25rem',
                            background: 'var(--card-bg, #ffffff)', border: '1px solid var(--border)',
                            borderRadius: '8px', boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                            zIndex: 100, minWidth: '140px', overflow: 'hidden'
                          }}>
                            <button 
                              style={{ width: '100%', padding: '0.6rem 1rem', textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.85rem', color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}
                              onClick={() => { setActiveActionMenuId(null); startCottageEdit(cot); }}
                            >
                              <Edit2 size={14} /> Edit Property
                            </button>
                            <button 
                              style={{ width: '100%', padding: '0.6rem 1rem', textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.85rem', color: 'var(--danger)', display: 'flex', alignItems: 'center', gap: '0.5rem', borderTop: '1px solid var(--border)' }}
                              onClick={() => { setActiveActionMenuId(null); deleteCottage(cot.id); }}
                            >
                              <Trash2 size={14} /> Delete
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {/* Rooms List/Table Section */}
                {isExpanded && (
                  <div>
                    {propertyRooms.length > 0 ? (
                      <div className="table-container">
                        <table className="table" style={{ fontSize: '0.9rem' }}>
                          <thead>
                            <tr>
                              <th>Room</th>
                              <th>Category</th>
                              <th>Capacity</th>
                              <th>Status</th>
                              <th style={{ textAlign: 'right' }}>Actions</th>
                            </tr>
                          </thead>
                          <tbody>
                            {propertyRooms.map(rm => {
                              const cat = categories.find(c => c.id === rm.category_id);
                              const rmActive = rm.status === 'Available' || rm.status === 'Active';

                              return (
                                <tr key={rm.id}>
                                  <td>
                                    <strong style={{ color: 'var(--text-main)' }}>{rm.name}</strong>
                                  </td>
                                  <td>
                                    <span style={{ fontWeight: 600, color: 'var(--primary)' }}>
                                      {cat ? cat.name : 'Standard'}
                                    </span>
                                  </td>
                                  <td>{rm.capacity || 1} Guests</td>
                                  <td>
                                    <span className={`badge badge-${rmActive ? 'success' : 'danger'}`} style={{ fontSize: '0.75rem' }}>
                                      {rmActive ? 'ACTIVE' : 'INACTIVE'}
                                    </span>
                                  </td>
                                  <td style={{ textAlign: 'right' }}>
                                    <div style={{ display: 'inline-flex', gap: '0.4rem' }}>
                                      <button className="btn btn-outline" style={{ padding: '0.2rem 0.5rem', fontSize: '0.8rem' }} onClick={() => startEditRoom(rm)}>
                                        <Edit2 size={14} />
                                      </button>
                                      <button className="btn btn-outline" style={{ padding: '0.2rem 0.5rem', fontSize: '0.8rem', color: 'var(--danger)' }} onClick={() => deleteRoom(rm.id)}>
                                        <Trash2 size={14} />
                                      </button>
                                    </div>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <div style={{ textAlign: 'center', padding: '1.5rem', color: 'var(--text-muted)', background: 'var(--bg-secondary)', borderRadius: '8px', fontSize: '0.85rem' }}>
                        No rooms configured for this property yet.{' '}
                        <button style={{ color: 'var(--primary)', fontWeight: 700, background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }} onClick={() => {
                          setEditingId(null);
                          setEditingType(null);
                          setNewRoom({ cottage_id: cot.id, name: '', capacity: 1, status: 'Active', category_id: '' });
                          setShowRoomModal(true);
                        }}>Add First Room</button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}

          {cottages.length === 0 && (
            <div className="card" style={{ textAlign: 'center', padding: '3rem 1rem' }}>
              <Building2 size={48} style={{ opacity: 0.2, marginBottom: '1rem', color: 'var(--primary)' }} />
              <h3 style={{ fontSize: '1.15rem', fontWeight: 700, margin: '0 0 0.5rem 0' }}>No Properties Added Yet</h3>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', margin: '0 0 1.25rem 0' }}>Create your first property to start managing rooms and rates.</p>
              <button className="btn btn-primary" onClick={() => startCottageEdit()}>
                <Plus size={18} /> Add First Property
              </button>
            </div>
          )}
        </div>
      )}

      {/* --- TAB 2: ROOM CATEGORIES --- */}
      {activeTab === 'categories' && (
        <div className="card" style={{ padding: isMobile ? '1.25rem' : '1.75rem', borderRadius: '14px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
            <div>
              <h2 style={{ fontSize: '1.25rem', fontWeight: 800, margin: 0, color: 'var(--text-main)' }}>Room Categories</h2>
              <p style={{ margin: '0.2rem 0 0 0', color: 'var(--text-muted)', fontSize: '0.85rem' }}>Define pricing and capacity classifications across your properties.</p>
            </div>
            <button className="btn btn-primary" style={{ fontSize: '0.85rem', padding: '0.4rem 0.85rem', display: 'flex', alignItems: 'center', gap: '0.4rem', fontWeight: 600 }} onClick={() => startCategoryEdit()}>
              <Plus size={16} /> New Category
            </button>
          </div>

          <div className="table-container">
            <table className="table" style={{ fontSize: '0.9rem' }}>
              <thead>
                <tr>
                  <th>Category Name</th>
                  <th>Assigned Property</th>
                  <th>Max Capacity</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {categories.map(cat => {
                  const cottageName = cat.cottage_id ? (cottages.find(c => c.id === cat.cottage_id)?.name || 'Unknown Property') : 'Global (All Properties)';
                  return (
                    <tr key={cat.id}>
                      <td>
                        <strong style={{ color: 'var(--text-main)' }}>{cat.name}</strong>
                      </td>
                      <td>
                        <span className="badge badge-info" style={{ fontSize: '0.75rem' }}>{cottageName}</span>
                      </td>
                      <td>{cat.capacity} Guests</td>
                      <td style={{ textAlign: 'right' }}>
                        <div style={{ display: 'inline-flex', gap: '0.4rem' }}>
                          <button className="btn btn-outline" style={{ padding: '0.2rem 0.5rem', fontSize: '0.8rem' }} onClick={() => startCategoryEdit(cat)}>
                            <Edit2 size={14} />
                          </button>
                          <button className="btn btn-outline" style={{ padding: '0.2rem 0.5rem', fontSize: '0.8rem', color: 'var(--danger)' }} onClick={() => handleDeleteCategory(cat.id)}>
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {categories.length === 0 && (
                  <tr>
                    <td colSpan="4" style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '2rem 0' }}>
                      No room categories configured yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* --- TAB 3: RATE PLANS --- */}
      {activeTab === 'rates' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {/* Priority Explanation Informational Callout */}
          <div style={{ background: 'rgba(59, 130, 246, 0.08)', color: 'var(--text-main)', padding: '1rem 1.25rem', borderRadius: '10px', fontSize: '0.85rem', border: '1px solid rgba(59, 130, 246, 0.2)' }}>
            <strong>💡 Pro Tip: Rate Plan Priority</strong> — When date ranges overlap, the rate plan with the <strong>highest Priority number</strong> automatically applies!
          </div>

          <div className="card" style={{ padding: isMobile ? '1.25rem' : '1.75rem', borderRadius: '14px' }}>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 800, margin: '0 0 1.25rem 0', color: 'var(--text-main)' }}>
              {ratePlanForm.id ? 'Edit Rate Plan' : 'Create New Rate Plan'}
            </h2>
            
            <form onSubmit={handleAddRatePlan} style={{ display: 'flex', flexDirection: 'column', gap: '1rem', background: 'var(--bg-secondary)', padding: '1.25rem', borderRadius: '12px', border: '1px solid var(--border)' }}>
              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '2fr 1fr 1fr 1fr', gap: '1rem' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                  <label style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-muted)' }}>Rate Plan Name</label>
                  <input type="text" className="form-input" placeholder="e.g. Peak Season, Weekend Special" value={ratePlanForm.name} onChange={e => setRatePlanForm({...ratePlanForm, name: e.target.value})} required />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                  <label style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-muted)' }}>Start Date</label>
                  <input type="date" className="form-input" value={ratePlanForm.start_date} onChange={e => setRatePlanForm({...ratePlanForm, start_date: e.target.value})} />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                  <label style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-muted)' }}>End Date</label>
                  <input type="date" className="form-input" value={ratePlanForm.end_date} onChange={e => setRatePlanForm({...ratePlanForm, end_date: e.target.value})} />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                  <label style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-muted)' }}>Priority</label>
                  <input type="number" className="form-input" value={ratePlanForm.priority} onChange={e => setRatePlanForm({...ratePlanForm, priority: e.target.value})} placeholder="0" />
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                <label style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-muted)' }}>Applicable Days (Optional)</label>
                <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                  {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map((d, i) => (
                    <label key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer' }}>
                      <input type="checkbox" checked={ratePlanForm.days_of_week.includes(i)} onChange={() => toggleDayOfWeek(i)} /> {d}
                    </label>
                  ))}
                </div>
              </div>

              <div style={{ display: 'flex', gap: '0.5rem', alignSelf: 'flex-start', marginTop: '0.5rem' }}>
                <button type="submit" className="btn btn-primary" style={{ padding: '0.5rem 1.25rem', fontWeight: 700 }} disabled={!ratePlanForm.name}>
                  {ratePlanForm.id ? 'Update Rate Plan' : 'Save Rate Plan'}
                </button>
                {ratePlanForm.id && (
                  <button type="button" className="btn btn-outline" onClick={() => setRatePlanForm({ id: null, name: '', start_date: '', end_date: '', priority: '', days_of_week: [] })}>
                    Cancel
                  </button>
                )}
              </div>
            </form>

            <div style={{ marginTop: '1.5rem' }}>
              <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '1rem', color: 'var(--text-main)' }}>Configured Rate Plans</h3>
              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill, minmax(320px, 1fr))', gap: '1rem' }}>
                {ratePlans.map(rp => (
                  <div key={rp.id} className="card" style={{ padding: '1rem', borderRadius: '10px', border: '1px solid var(--border)', background: 'var(--bg-secondary)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
                      <strong style={{ fontSize: '1rem', color: 'var(--text-main)' }}>{rp.name}</strong>
                      <span className="badge badge-info" style={{ fontSize: '0.75rem' }}>Priority: {rp.priority || 0}</span>
                    </div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'flex', flexDirection: 'column', gap: '0.2rem', marginBottom: '0.75rem' }}>
                      <div>📅 {rp.start_date ? `${rp.start_date} → ${rp.end_date || 'Ongoing'}` : 'Year-round'}</div>
                      <div>🗓 Days: {rp.days_of_week && rp.days_of_week.length ? rp.days_of_week.map(d => ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][d]).join(', ') : 'All Days'}</div>
                    </div>
                    <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                      <button className="btn btn-outline" style={{ padding: '0.25rem 0.5rem', fontSize: '0.8rem' }} onClick={() => startEditRatePlan(rp)}>
                        <Edit2 size={14} /> Edit
                      </button>
                      <button className="btn btn-outline" style={{ padding: '0.25rem 0.5rem', fontSize: '0.8rem', color: 'var(--danger)' }} onClick={() => handleDeleteRatePlan(rp.id)}>
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                ))}
                {ratePlans.length === 0 && (
                  <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem', gridColumn: 'span 2' }}>
                    No rate plans defined yet.
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* --- TAB 4: ADD-ONS & PRICING --- */}
      {activeTab === 'addons' && (
        <PricingSettings activeResortId={activeResortId} resorts={resorts} />
      )}

      {/* MODALS */}
      {editingCottage && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
          <div style={{ background: 'var(--card-bg, #ffffff)', padding: isMobile ? '1.25rem' : '2rem', borderRadius: '14px', width: '100%', maxWidth: '520px', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 10px 25px rgba(0,0,0,0.2)' }}>
            <form onSubmit={handleSaveCottage}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
                <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 800, color: 'var(--text-main)' }}>{editingCottage.id ? 'Edit Property' : 'Add Property'}</h3>
                <button type="button" className="btn btn-outline" style={{ padding: '0.2rem 0.5rem' }} onClick={() => setEditingCottage(null)}><X size={16} /></button>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div className="form-group">
                  <label className="form-label">Property Name</label>
                  <input type="text" className="form-input" required value={editingCottage.name} onChange={e => setEditingCottage({...editingCottage, name: e.target.value})} placeholder="e.g. The Grand Villa" />
                </div>
                <div className="form-group">
                  <label className="form-label">Max Capacity (Guests)</label>
                  <input type="number" className="form-input" min="1" required value={editingCottage.max_capacity} onChange={e => setEditingCottage({...editingCottage, max_capacity: e.target.value})} />
                </div>
                <div className="form-group">
                  <label className="form-label">Status</label>
                  <select className="form-select" value={editingCottage.status} onChange={e => setEditingCottage({...editingCottage, status: e.target.value})}>
                    <option value="Active">Active</option>
                    <option value="Inactive">Inactive</option>
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Property Phone (Optional)</label>
                  <input type="text" className="form-input" value={editingCottage.phone || ''} onChange={e => setEditingCottage({...editingCottage, phone: e.target.value})} placeholder="+91..." />
                </div>
                <div className="form-group">
                  <label className="form-label">Wi-Fi Password (Optional)</label>
                  <input type="text" className="form-input" value={editingCottage.wifi_password || ''} onChange={e => setEditingCottage({...editingCottage, wifi_password: e.target.value})} placeholder="Password" />
                </div>

                {ratePlans.length > 0 && (
                  <div style={{ padding: '1rem', background: 'var(--bg-secondary)', borderRadius: '8px', border: '1px solid var(--border)' }}>
                    <h4 style={{ margin: '0 0 0.5rem 0', fontSize: '0.85rem', fontWeight: 700, color: 'var(--primary)' }}>Property Rates per Rate Plan</h4>
                    {ratePlans.map(rp => (
                      <div key={rp.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                        <span style={{ fontSize: '0.85rem', fontWeight: 500 }}>{rp.name}</span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                          <span>₹</span>
                          <input 
                            type="number" 
                            className="form-input" 
                            style={{ width: '110px', padding: '0.3rem 0.5rem', fontSize: '0.85rem' }} 
                            value={editingCottage.rates?.[rp.id] || 0} 
                            onChange={e => setEditingCottage({...editingCottage, rates: {...editingCottage.rates, [rp.id]: e.target.value}})} 
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div style={{ marginTop: '1.5rem', display: 'flex', gap: '0.5rem' }}>
                <button type="submit" className="btn btn-primary" style={{ flex: 1, padding: '0.6rem', fontWeight: 700 }}>
                  {editingCottage.id ? 'Save Property' : 'Create Property'}
                </button>
                <button type="button" className="btn btn-outline" style={{ padding: '0.6rem 1rem' }} onClick={() => setEditingCottage(null)}>
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showRoomModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
          <div style={{ background: 'var(--card-bg, #ffffff)', padding: isMobile ? '1.25rem' : '2rem', borderRadius: '14px', width: '100%', maxWidth: '480px', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 10px 25px rgba(0,0,0,0.2)' }}>
            <form onSubmit={handleAddRoom}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
                <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 800, color: 'var(--text-main)' }}>{editingId ? 'Edit Room' : 'Add Room'}</h3>
                <button type="button" className="btn btn-outline" style={{ padding: '0.2rem 0.5rem' }} onClick={() => setShowRoomModal(false)}><X size={16} /></button>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div className="form-group">
                  <label className="form-label">Property Assignment</label>
                  <select className="form-select" required value={newRoom.cottage_id} onChange={e => setNewRoom({...newRoom, cottage_id: e.target.value})}>
                    <option value="">-- Select Property --</option>
                    {cottages.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Room Number / Name</label>
                  <input type="text" className="form-input" required value={newRoom.name} onChange={e => setNewRoom({...newRoom, name: e.target.value})} placeholder="e.g. Room 101, Villa Suite A" />
                </div>
                <div className="form-group">
                  <label className="form-label">Room Category</label>
                  <select className="form-select" value={newRoom.category_id} onChange={e => setNewRoom({...newRoom, category_id: e.target.value})}>
                    <option value="">No Category (Default)</option>
                    {categories.map(cat => <option key={cat.id} value={cat.id}>{cat.name}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Room Capacity (Guests)</label>
                  <input type="number" className="form-input" min="1" required value={newRoom.capacity} onChange={e => setNewRoom({...newRoom, capacity: e.target.value})} />
                </div>
                <div className="form-group">
                  <label className="form-label">Status</label>
                  <select className="form-select" value={newRoom.status} onChange={e => setNewRoom({...newRoom, status: e.target.value})}>
                    <option value="Active">Active</option>
                    <option value="Inactive">Inactive</option>
                  </select>
                </div>
              </div>

              <div style={{ marginTop: '1.5rem', display: 'flex', gap: '0.5rem' }}>
                <button type="submit" className="btn btn-primary" style={{ flex: 1, padding: '0.6rem', fontWeight: 700 }}>
                  {editingId ? 'Save Room' : 'Add Room'}
                </button>
                <button type="button" className="btn btn-outline" style={{ padding: '0.6rem 1rem' }} onClick={() => setShowRoomModal(false)}>
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {editingCategory && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
          <div style={{ background: 'var(--card-bg, #ffffff)', padding: isMobile ? '1.25rem' : '2rem', borderRadius: '14px', width: '100%', maxWidth: '480px', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 10px 25px rgba(0,0,0,0.2)' }}>
            <form onSubmit={handleSaveCategory}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
                <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 800, color: 'var(--text-main)' }}>{editingCategory.id ? 'Edit Category' : 'Add Category'}</h3>
                <button type="button" className="btn btn-outline" style={{ padding: '0.2rem 0.5rem' }} onClick={() => setEditingCategory(null)}><X size={16} /></button>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div className="form-group">
                  <label className="form-label">Property Assignment</label>
                  <select className="form-select" value={editingCategory.cottage_id || ''} onChange={e => setEditingCategory({...editingCategory, cottage_id: e.target.value})}>
                    <option value="">Global (All Properties)</option>
                    {cottages.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Category Name</label>
                  <select className="form-select" required value={editingCategory.name} onChange={e => setEditingCategory({...editingCategory, name: e.target.value})}>
                    <option value="">-- Select Category --</option>
                    {PREDEFINED_CATEGORIES.map(cat => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Capacity (Max Guests)</label>
                  <input type="number" className="form-input" min="1" required value={editingCategory.capacity} onChange={e => setEditingCategory({...editingCategory, capacity: e.target.value})} />
                </div>

                {ratePlans.length > 0 && (
                  <div style={{ padding: '1rem', background: 'var(--bg-secondary)', borderRadius: '8px', border: '1px solid var(--border)' }}>
                    <h4 style={{ margin: '0 0 0.5rem 0', fontSize: '0.85rem', fontWeight: 700, color: 'var(--primary)' }}>Category Rates per Rate Plan</h4>
                    {ratePlans.map(rp => (
                      <div key={rp.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                        <span style={{ fontSize: '0.85rem', fontWeight: 500 }}>{rp.name}</span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                          <span>₹</span>
                          <input 
                            type="number" 
                            className="form-input" 
                            style={{ width: '110px', padding: '0.3rem 0.5rem', fontSize: '0.85rem' }} 
                            value={editingCategory.rates?.[rp.id] || 0} 
                            onChange={e => setEditingCategory({...editingCategory, rates: {...editingCategory.rates, [rp.id]: e.target.value}})} 
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div style={{ marginTop: '1.5rem', display: 'flex', gap: '0.5rem' }}>
                <button type="submit" className="btn btn-primary" style={{ flex: 1, padding: '0.6rem', fontWeight: 700 }}>
                  {editingCategory.id ? 'Save Category' : 'Create Category'}
                </button>
                <button type="button" className="btn btn-outline" style={{ padding: '0.6rem 1rem' }} onClick={() => setEditingCategory(null)}>
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
