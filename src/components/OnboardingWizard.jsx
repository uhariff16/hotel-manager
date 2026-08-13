import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useSettingsStore } from '../lib/store';
import { Building, Home, Plus, Check, ChevronRight, ChevronLeft, LogOut, Loader2, DollarSign, MapPin, Phone, User, Wifi } from 'lucide-react';

export default function OnboardingWizard() {
  const { session, profile, resorts, setResorts, setActiveResortId } = useSettingsStore();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [error, setError] = useState(null);
  const [existingCottages, setExistingCottages] = useState([]);
  const [startedOnboarding, setStartedOnboarding] = useState(false);

  // Step 1: Entity Details
  const [entityForm, setEntityForm] = useState({
    name: '',
    owner_name: profile?.full_name || '',
    phone: '',
    email: session?.user?.email || '',
    address: '',
    currency: 'INR',
    timezone: 'Asia/Kolkata'
  });

  // Step 2: Property Category
  const [propertyForm, setPropertyForm] = useState({
    name: '',
    max_capacity: 2,
    weekday_price: 1500,
    weekend_price: 2000,
    phone: '',
    wifi_password: ''
  });

  // Step 3: Room Generation
  const [roomGeneration, setRoomGeneration] = useState({
    mode: 'auto', // 'auto' or 'manual'
    startNumber: '101',
    count: 3,
    manualNames: '101, 102, 103',
    capacity: 2,
    weekday_price: 1500,
    weekend_price: 2000
  });

  useEffect(() => {
    setStep(1);
    if (resorts && resorts.length > 0) {
      supabase.from('cottages')
        .select('*')
        .eq('resort_id', resorts[0].id)
        .then(({ data, error }) => {
          if (!error && data) {
            setExistingCottages(data);
          }
        });
    }
  }, [resorts]);

  useEffect(() => {
    if (resorts && resorts.length > 0 && resorts[0]) {
      const r = resorts[0];
      setEntityForm({
        name: r.name || '',
        owner_name: r.owner_name || profile?.full_name || '',
        phone: r.phone || '',
        email: r.email || session?.user?.email || '',
        address: r.address || '',
        currency: r.currency || 'INR',
        timezone: r.timezone || 'Asia/Kolkata'
      });
    }
  }, [resorts, profile, session]);

  useEffect(() => {
    if (existingCottages && existingCottages.length > 0 && existingCottages[0]) {
      const c = existingCottages[0];
      setPropertyForm({
        name: c.name || '',
        max_capacity: c.max_capacity || 2,
        weekday_price: c.weekday_price || 1500,
        weekend_price: c.weekend_price || 2000,
        phone: c.phone || '',
        wifi_password: c.wifi_password || ''
      });
    }
  }, [existingCottages]);

  useEffect(() => {
    if (step === 3) {
      const cap = propertyForm.max_capacity || (existingCottages[0]?.max_capacity) || 2;
      const wDay = propertyForm.weekday_price || (existingCottages[0]?.weekday_price) || 1500;
      const wEnd = propertyForm.weekend_price || (existingCottages[0]?.weekend_price) || 2000;
      setRoomGeneration(prev => ({
        ...prev,
        capacity: Number(cap),
        weekday_price: Number(wDay),
        weekend_price: Number(wEnd)
      }));
    }
  }, [step, propertyForm, existingCottages]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    window.location.reload();
  };

  const handleNextStep = () => {
    setError(null);
    if (step === 1) {
      if (!entityForm.name.trim()) return setError("Please enter your Property/Entity name.");
    } else if (step === 2) {
      if (!propertyForm.name.trim()) return setError("Please enter a category name (e.g. Standard Room).");
      if (propertyForm.weekday_price < 0 || propertyForm.weekend_price < 0) {
        return setError("Price cannot be negative.");
      }
    }
    setStep(prev => prev + 1);
  };

  const handlePrevStep = () => {
    setError(null);
    setStep(prev => prev - 1);
  };

  const handleSubmit = async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    if (step < 3) {
      handleNextStep();
      return;
    }
    setLoading(true);
    setError(null);

    let createdResortId = null;
    let createdCottageId = null;

    try {
      let activeResort = null;
      
      // 1. Resolve Resort
      if (resorts && resorts.length > 0) {
        setStatusMessage("Updating your property profile...");
        const resortPayload = {
          name: entityForm.name,
          owner_name: entityForm.owner_name,
          phone: entityForm.phone,
          email: entityForm.email,
          address: entityForm.address,
          currency: entityForm.currency,
          timezone: entityForm.timezone
        };
        const { data: resortData, error: resortError } = await supabase
          .from('resorts')
          .update(resortPayload)
          .eq('id', resorts[0].id)
          .select();

        if (resortError) throw new Error("Failed to update resort profile: " + resortError.message);
        activeResort = resortData[0];
      } else {
        setStatusMessage("Setting up your property profile...");
        const resortPayload = {
          ...entityForm,
          tenant_id: session.user.id
        };
        const { data: resortData, error: resortError } = await supabase
          .from('resorts')
          .insert([resortPayload])
          .select();

        if (resortError) throw new Error("Failed to create resort profile: " + resortError.message);
        activeResort = resortData[0];
        createdResortId = activeResort.id;
      }

      // 2. Resolve Cottage (Property Category)
      let activeCottage = null;
      if (existingCottages && existingCottages.length > 0) {
        setStatusMessage("Updating property category...");
        const cottagePayload = {
          name: propertyForm.name,
          max_capacity: Number(propertyForm.max_capacity),
          weekday_price: Number(propertyForm.weekday_price),
          weekend_price: Number(propertyForm.weekend_price),
          phone: propertyForm.phone,
          wifi_password: propertyForm.wifi_password
        };
        const { data: cottageData, error: cottageError } = await supabase
          .from('cottages')
          .update(cottagePayload)
          .eq('id', existingCottages[0].id)
          .select();

        if (cottageError) {
          throw new Error("Failed to update property category: " + cottageError.message);
        }
        activeCottage = cottageData[0];
      } else {
        setStatusMessage("Creating property categories...");
        const cottagePayload = {
          name: propertyForm.name,
          max_capacity: Number(propertyForm.max_capacity),
          weekday_price: Number(propertyForm.weekday_price),
          weekend_price: Number(propertyForm.weekend_price),
          seasonal_price: 0,
          status: 'Available',
          phone: propertyForm.phone,
          wifi_password: propertyForm.wifi_password,
          tenant_id: session.user.id,
          resort_id: activeResort.id
        };
        const { data: cottageData, error: cottageError } = await supabase
          .from('cottages')
          .insert([cottagePayload])
          .select();

        if (cottageError) {
          if (createdResortId) {
            await supabase.from('resorts').delete().eq('id', createdResortId);
          }
          throw new Error("Failed to create property category: " + cottageError.message);
        }
        activeCottage = cottageData[0];
        createdCottageId = activeCottage.id;
      }

      // 3. Generate and Insert Rooms
      setStatusMessage("Generating initial rooms...");
      let roomsToInsert = [];
      if (roomGeneration.mode === 'auto') {
        const start = Number(roomGeneration.startNumber);
        const qty = Number(roomGeneration.count);
        if (isNaN(start) || start <= 0) throw new Error("Invalid starting room number.");
        if (qty <= 0 || qty > 50) throw new Error("Please specify between 1 and 50 rooms to auto-create.");

        for (let i = 0; i < qty; i++) {
          roomsToInsert.push({
            cottage_id: activeCottage.id,
            name: String(start + i),
            capacity: Number(roomGeneration.capacity),
            weekday_price: Number(roomGeneration.weekday_price),
            weekend_price: Number(roomGeneration.weekend_price),
            seasonal_price: 0,
            status: 'Available',
            tenant_id: session.user.id,
            resort_id: activeResort.id
          });
        }
      } else {
        const names = roomGeneration.manualNames
          .split(',')
          .map(n => n.trim())
          .filter(n => n.length > 0);

        if (names.length === 0) throw new Error("Please enter at least one room number.");
        if (names.length > 50) throw new Error("You can create up to 50 rooms at a time.");

        roomsToInsert = names.map(name => ({
          cottage_id: activeCottage.id,
          name: name,
          capacity: Number(roomGeneration.capacity),
          weekday_price: Number(roomGeneration.weekday_price),
          weekend_price: Number(roomGeneration.weekend_price),
          seasonal_price: 0,
          status: 'Available',
          tenant_id: session.user.id,
          resort_id: activeResort.id
        }));
      }

      const { error: roomsError } = await supabase
        .from('rooms')
        .insert(roomsToInsert);

      if (roomsError) {
        if (createdCottageId) {
          await supabase.from('cottages').delete().eq('id', createdCottageId);
        }
        if (createdResortId) {
          await supabase.from('resorts').delete().eq('id', createdResortId);
        }
        throw new Error("Failed to create initial rooms: " + roomsError.message);
      }

      setStatusMessage("Setup complete! Redirecting to your dashboard...");
      
      setTimeout(() => {
        window.location.reload();
      }, 1000);

    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'linear-gradient(135deg, #0f172a 0%, #1e1b4b 100%)',
      padding: '2rem 1rem',
      fontFamily: "'Plus Jakarta Sans', sans-serif",
      color: 'white'
    }}>
      
      {/* Top Header Controls */}
      <div style={{
        position: 'absolute',
        top: '1.5rem',
        left: '2rem',
        right: '2rem',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span style={{ fontSize: '1.25rem', fontWeight: 800, letterSpacing: '0.05em', color: '#10b981', fontFamily: "'Outfit', sans-serif" }}>STAY PILOT</span>
        </div>
        <button
          onClick={handleLogout}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            background: 'rgba(255, 255, 255, 0.05)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            padding: '0.5rem 1rem',
            borderRadius: '8px',
            color: '#f8fafc',
            cursor: 'pointer',
            fontWeight: 600,
            fontSize: '0.85rem',
            transition: 'all 0.2s'
          }}
          className="btn-logout-hover"
        >
          <LogOut size={16} /> Exit & Logout
        </button>
      </div>

      <div style={{
        width: '100%',
        maxWidth: '650px',
        background: 'rgba(30, 41, 59, 0.7)',
        backdropFilter: 'blur(16px)',
        border: '1px solid rgba(255, 255, 255, 0.08)',
        borderRadius: '24px',
        padding: '2.5rem',
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
        textAlign: 'center',
        position: 'relative',
        zIndex: 1
      }}>
        {loading ? (
          <div style={{ padding: '3rem 1rem', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1.5rem' }}>
            <Loader2 className="animate-spin" size={48} color="#10b981" />
            <h3 style={{ fontSize: '1.25rem', fontWeight: 700, fontFamily: "'Outfit', sans-serif" }}>{statusMessage}</h3>
            <p style={{ color: '#94a3b8', fontSize: '0.9rem' }}>Please don't close this window, we are preparing your property dashboard.</p>
          </div>
        ) : !startedOnboarding ? (
          <div style={{ animation: 'fadeIn 0.25s ease-out', textAlign: 'left', display: 'flex', flexDirection: 'column', gap: '1.5rem', padding: '1rem' }}>
            <div style={{ textAlign: 'center', marginBottom: '0.5rem' }}>
              <div style={{ width: '64px', height: '64px', borderRadius: '16px', background: 'rgba(16, 185, 129, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1.5rem auto' }}>
                <Building size={32} color="#10b981" />
              </div>
              <h1 style={{ fontSize: '1.8rem', fontWeight: 800, color: '#f8fafc', marginBottom: '0.5rem', fontFamily: "'Outfit', sans-serif" }}>Welcome to Stay Pilot!</h1>
              <p style={{ color: '#94a3b8', fontSize: '0.95rem' }}>Let's set up your property platform so you can manage bookings and tracking numbers.</p>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', background: 'rgba(255, 255, 255, 0.03)', padding: '1.5rem', borderRadius: '12px', border: '1px solid rgba(255, 255, 255, 0.05)', marginBottom: '0.5rem' }}>
              <h3 style={{ fontSize: '1rem', fontWeight: 700, color: '#e2e8f0', margin: '0 0 0.5rem 0' }}>The Setup Process:</h3>
              
              <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start' }}>
                <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: '#0284c7', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: '0.85rem', fontWeight: 700, color: 'white' }}>1</div>
                <div>
                  <h4 style={{ margin: '0 0 2px 0', fontSize: '0.9rem', fontWeight: 700, color: '#f8fafc' }}>Business Profile Setup</h4>
                  <p style={{ margin: 0, fontSize: '0.8rem', color: '#94a3b8' }}>Fill in your property name, owner identity, timezone, and base currency.</p>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start' }}>
                <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: '#0f766e', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: '0.85rem', fontWeight: 700, color: 'white' }}>2</div>
                <div>
                  <h4 style={{ margin: '0 0 2px 0', fontSize: '0.9rem', fontWeight: 700, color: '#f8fafc' }}>Create Property Class</h4>
                  <p style={{ margin: 0, fontSize: '0.8rem', color: '#94a3b8' }}>Define your primary room type/category (e.g. Deluxe Suite) with weekday & weekend pricing.</p>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start' }}>
                <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: '#6d28d9', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: '0.85rem', fontWeight: 700, color: 'white' }}>3</div>
                <div>
                  <h4 style={{ margin: '0 0 2px 0', fontSize: '0.9rem', fontWeight: 700, color: '#f8fafc' }}>Add Initial Rooms</h4>
                  <p style={{ margin: 0, fontSize: '0.8rem', color: '#94a3b8' }}>Specify individual room numbers (auto-generated or manually typed) to populate your booking inventory.</p>
                </div>
              </div>
            </div>

            <p style={{ fontSize: '0.8rem', color: '#64748b', textAlign: 'center', margin: '0 0 0.5rem 0' }}>
              ⏱️ Total setup time is less than 2 minutes. All configurations can be modified later.
            </p>

            <button
              type="button"
              onClick={() => setStartedOnboarding(true)}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.5rem',
                background: '#10b981',
                border: 'none',
                padding: '0.9rem 2rem',
                borderRadius: '10px',
                color: 'white',
                cursor: 'pointer',
                fontWeight: 700,
                fontSize: '1rem',
                boxShadow: '0 4px 14px rgba(16, 185, 129, 0.3)',
                transition: 'all 0.2s',
                width: '100%'
              }}
            >
              Let's Get Started <ChevronRight size={18} />
            </button>

            <button
              type="button"
              onClick={handleLogout}
              style={{
                background: 'transparent',
                border: '1px solid rgba(255,255,255,0.1)',
                padding: '0.6rem 1.5rem',
                borderRadius: '10px',
                color: '#94a3b8',
                cursor: 'pointer',
                fontWeight: 600,
                fontSize: '0.85rem',
                transition: 'all 0.2s',
                alignSelf: 'center',
                marginTop: '0.5rem'
              }}
            >
              Exit & Logout
            </button>
          </div>
        ) : (
          <div style={{ width: '100%' }}>
            {/* Step Stepper Indicator */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2.5rem', position: 'relative' }}>
              <div style={{
                position: 'absolute',
                top: '50%',
                left: '10%',
                right: '10%',
                height: '2px',
                background: 'rgba(255, 255, 255, 0.1)',
                zIndex: -1,
                transform: 'translateY(-50%)'
              }}>
                <div style={{
                  width: step === 1 ? '0%' : (step === 2 ? '50%' : '100%'),
                  height: '100%',
                  background: '#10b981',
                  transition: 'width 0.3s ease'
                }} />
              </div>
              
              {[
                { number: 1, label: 'Profile Setup', icon: <User size={16} /> },
                { number: 2, label: 'Property Class', icon: <Building size={16} /> },
                { number: 3, label: 'Create Rooms', icon: <Home size={16} /> }
              ].map(s => {
                const isActive = step >= s.number;
                const isCurrent = step === s.number;
                return (
                  <div key={s.number} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem', width: '30%' }}>
                    <div style={{
                      width: '36px',
                      height: '36px',
                      borderRadius: '50%',
                      background: isCurrent ? '#10b981' : (isActive ? '#065f46' : '#334155'),
                      border: isCurrent ? '4px solid rgba(16, 185, 129, 0.2)' : 'none',
                      color: isActive ? 'white' : '#94a3b8',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontWeight: 700,
                      fontSize: '0.9rem',
                      transition: 'all 0.3s'
                    }}>
                      {step > s.number ? <Check size={16} /> : s.icon}
                    </div>
                    <span style={{
                      fontSize: '0.75rem',
                      fontWeight: isCurrent ? 700 : 500,
                      color: isActive ? '#f8fafc' : '#94a3b8'
                    }}>{s.label}</span>
                  </div>
                );
              })}
            </div>

            {/* Error Callout */}
            {error && (
              <div style={{
                background: 'rgba(239, 68, 68, 0.1)',
                border: '1px solid rgba(239, 68, 68, 0.2)',
                color: '#f87171',
                padding: '0.85rem 1.2rem',
                borderRadius: '12px',
                marginBottom: '1.5rem',
                fontSize: '0.85rem',
                textAlign: 'left',
                fontWeight: 600
              }}>
                ⚠️ {error}
              </div>
            )}

            {/* STEP 1: ENTITY DETAILS */}
            {step === 1 && (
              <div style={{ animation: 'fadeIn 0.2s ease-out', textAlign: 'left' }}>
                <h2 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#f8fafc', marginBottom: '0.5rem', fontFamily: "'Outfit', sans-serif" }}>Welcome to Stay Pilot!</h2>
                <p style={{ color: '#94a3b8', fontSize: '0.9rem', marginBottom: '2rem' }}>Let's set up your business identity profile details to configure your accounts.</p>
                
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem' }}>
                  <div className="form-group" style={{ gridColumn: 'span 2' }}>
                    <label className="form-label" style={{ color: '#cbd5e1', fontSize: '0.85rem', fontWeight: 600 }}>Business/Entity Name *</label>
                    <input
                      type="text"
                      className="form-input"
                      style={{ background: '#1e293b', border: '1px solid #475569', color: 'white', height: '44px', width: '100%', borderRadius: '8px', padding: '0.75rem' }}
                      value={entityForm.name}
                      onChange={e => setEntityForm({ ...entityForm, name: e.target.value })}
                      placeholder="e.g. Greenwood Valley Resort"
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label" style={{ color: '#cbd5e1', fontSize: '0.85rem', fontWeight: 600 }}>Owner's Name</label>
                    <input
                      type="text"
                      className="form-input"
                      style={{ background: '#1e293b', border: '1px solid #475569', color: 'white', height: '44px', width: '100%', borderRadius: '8px', padding: '0.75rem' }}
                      value={entityForm.owner_name}
                      onChange={e => setEntityForm({ ...entityForm, owner_name: e.target.value })}
                      placeholder="Your Full Name"
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label" style={{ color: '#cbd5e1', fontSize: '0.85rem', fontWeight: 600 }}>Contact Phone</label>
                    <input
                      type="text"
                      className="form-input"
                      style={{ background: '#1e293b', border: '1px solid #475569', color: 'white', height: '44px', width: '100%', borderRadius: '8px', padding: '0.75rem' }}
                      value={entityForm.phone}
                      onChange={e => setEntityForm({ ...entityForm, phone: e.target.value })}
                      placeholder="e.g. +91 98765 43210"
                    />
                  </div>
                  <div className="form-group" style={{ gridColumn: 'span 2' }}>
                    <label className="form-label" style={{ color: '#cbd5e1', fontSize: '0.85rem', fontWeight: 600 }}>Address</label>
                    <input
                      type="text"
                      className="form-input"
                      style={{ background: '#1e293b', border: '1px solid #475569', color: 'white', height: '44px', width: '100%', borderRadius: '8px', padding: '0.75rem' }}
                      value={entityForm.address}
                      onChange={e => setEntityForm({ ...entityForm, address: e.target.value })}
                      placeholder="e.g. 12 High Street, Ooty"
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label" style={{ color: '#cbd5e1', fontSize: '0.85rem', fontWeight: 600 }}>Base Currency</label>
                    <select
                      className="form-select"
                      style={{ background: '#1e293b', border: '1px solid #475569', color: 'white', height: '44px', width: '100%', borderRadius: '8px', padding: '0.5rem' }}
                      value={entityForm.currency}
                      onChange={e => setEntityForm({ ...entityForm, currency: e.target.value })}
                    >
                      <option value="INR">INR (₹)</option>
                      <option value="USD">USD ($)</option>
                      <option value="EUR">EUR (€)</option>
                      <option value="GBP">GBP (£)</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label" style={{ color: '#cbd5e1', fontSize: '0.85rem', fontWeight: 600 }}>Timezone</label>
                    <select
                      className="form-select"
                      style={{ background: '#1e293b', border: '1px solid #475569', color: 'white', height: '44px', width: '100%', borderRadius: '8px', padding: '0.5rem' }}
                      value={entityForm.timezone}
                      onChange={e => setEntityForm({ ...entityForm, timezone: e.target.value })}
                    >
                      <option value="Asia/Kolkata">India (IST)</option>
                      <option value="UTC">UTC</option>
                      <option value="America/New_York">EST (New York)</option>
                      <option value="Europe/London">GMT (London)</option>
                    </select>
                  </div>
                </div>
              </div>
            )}

            {/* STEP 2: PROPERTY CATEGORY */}
            {step === 2 && (
              <div style={{ animation: 'fadeIn 0.2s ease-out', textAlign: 'left' }}>
                <h2 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#f8fafc', marginBottom: '0.5rem', fontFamily: "'Outfit', sans-serif" }}>Create First Property Category</h2>
                <p style={{ color: '#94a3b8', fontSize: '0.9rem', marginBottom: '2rem' }}>Define the category classification for your rooms or cottages (e.g. Deluxe Room).</p>
                
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem' }}>
                  <div className="form-group" style={{ gridColumn: 'span 2' }}>
                    <label className="form-label" style={{ color: '#cbd5e1', fontSize: '0.85rem', fontWeight: 600 }}>Category Name *</label>
                    <input
                      type="text"
                      className="form-input"
                      style={{ background: '#1e293b', border: '1px solid #475569', color: 'white', height: '44px', width: '100%', borderRadius: '8px', padding: '0.75rem' }}
                      value={propertyForm.name}
                      onChange={e => setPropertyForm({ ...propertyForm, name: e.target.value })}
                      placeholder="e.g. Deluxe Suite, Premium Villa, Standard Room"
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label" style={{ color: '#cbd5e1', fontSize: '0.85rem', fontWeight: 600 }}>Capacity (Max Guests)</label>
                    <input
                      type="number"
                      min={1}
                      className="form-input"
                      style={{ background: '#1e293b', border: '1px solid #475569', color: 'white', height: '44px', width: '100%', borderRadius: '8px', padding: '0.75rem' }}
                      value={propertyForm.max_capacity}
                      onChange={e => setPropertyForm({ ...propertyForm, max_capacity: Number(e.target.value) })}
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label" style={{ color: '#cbd5e1', fontSize: '0.85rem', fontWeight: 600 }}>Weekday Price ({entityForm.currency === 'INR' ? '₹' : '$'})</label>
                    <input
                      type="number"
                      min={0}
                      className="form-input"
                      style={{ background: '#1e293b', border: '1px solid #475569', color: 'white', height: '44px', width: '100%', borderRadius: '8px', padding: '0.75rem' }}
                      value={propertyForm.weekday_price}
                      onChange={e => setPropertyForm({ ...propertyForm, weekday_price: Number(e.target.value) })}
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label" style={{ color: '#cbd5e1', fontSize: '0.85rem', fontWeight: 600 }}>Weekend Price ({entityForm.currency === 'INR' ? '₹' : '$'})</label>
                    <input
                      type="number"
                      min={0}
                      className="form-input"
                      style={{ background: '#1e293b', border: '1px solid #475569', color: 'white', height: '44px', width: '100%', borderRadius: '8px', padding: '0.75rem' }}
                      value={propertyForm.weekend_price}
                      onChange={e => setPropertyForm({ ...propertyForm, weekend_price: Number(e.target.value) })}
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label" style={{ color: '#cbd5e1', fontSize: '0.85rem', fontWeight: 600 }}>Property Phone Number (Optional)</label>
                    <input
                      type="text"
                      className="form-input"
                      style={{ background: '#1e293b', border: '1px solid #475569', color: 'white', height: '44px', width: '100%', borderRadius: '8px', padding: '0.75rem' }}
                      value={propertyForm.phone}
                      onChange={e => setPropertyForm({ ...propertyForm, phone: e.target.value })}
                      placeholder="e.g. Extension 10"
                    />
                  </div>
                  <div className="form-group" style={{ gridColumn: 'span 2' }}>
                    <label className="form-label" style={{ color: '#cbd5e1', fontSize: '0.85rem', fontWeight: 600 }}>WiFi Password (Optional)</label>
                    <input
                      type="text"
                      className="form-input"
                      style={{ background: '#1e293b', border: '1px solid #475569', color: 'white', height: '44px', width: '100%', borderRadius: '8px', padding: '0.75rem' }}
                      value={propertyForm.wifi_password}
                      onChange={e => setPropertyForm({ ...propertyForm, wifi_password: e.target.value })}
                      placeholder="e.g. guestwifi123"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* STEP 3: INITIAL ROOMS SETUP */}
            {step === 3 && (
              <div style={{ animation: 'fadeIn 0.2s ease-out', textAlign: 'left' }}>
                <h2 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#f8fafc', marginBottom: '0.5rem', fontFamily: "'Outfit', sans-serif" }}>Add Initial Rooms / Units</h2>
                <p style={{ color: '#94a3b8', fontSize: '0.9rem', marginBottom: '2rem' }}>Define the specific room designations that guests will book under this category.</p>

                {/* Generator Mode Switcher */}
                <div style={{ display: 'flex', gap: '1rem', background: '#1e293b', padding: '0.35rem', borderRadius: '10px', marginBottom: '1.75rem', border: '1px solid #334155' }}>
                  <button
                    type="button"
                    onClick={() => setRoomGeneration({ ...roomGeneration, mode: 'auto' })}
                    style={{
                      flex: 1,
                      padding: '0.6rem',
                      border: 'none',
                      borderRadius: '8px',
                      background: roomGeneration.mode === 'auto' ? '#10b981' : 'transparent',
                      color: roomGeneration.mode === 'auto' ? 'white' : '#94a3b8',
                      fontWeight: 700,
                      fontSize: '0.85rem',
                      cursor: 'pointer',
                      transition: 'all 0.2s'
                    }}
                  >
                    ⚡ Auto Generator
                  </button>
                  <button
                    type="button"
                    onClick={() => setRoomGeneration({ ...roomGeneration, mode: 'manual' })}
                    style={{
                      flex: 1,
                      padding: '0.6rem',
                      border: 'none',
                      borderRadius: '8px',
                      background: roomGeneration.mode === 'manual' ? '#10b981' : 'transparent',
                      color: roomGeneration.mode === 'manual' ? 'white' : '#94a3b8',
                      fontWeight: 700,
                      fontSize: '0.85rem',
                      cursor: 'pointer',
                      transition: 'all 0.2s'
                    }}
                  >
                    ✍️ Manual Names
                  </button>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1.25rem', marginBottom: '1.75rem' }}>
                  <div className="form-group">
                    <label className="form-label" style={{ color: '#cbd5e1', fontSize: '0.85rem', fontWeight: 600 }}>Guest Capacity</label>
                    <input
                      type="number"
                      min={1}
                      className="form-input"
                      style={{ background: '#1e293b', border: '1px solid #475569', color: 'white', height: '44px', width: '100%', borderRadius: '8px', padding: '0.75rem' }}
                      value={roomGeneration.capacity}
                      onChange={e => setRoomGeneration({ ...roomGeneration, capacity: Number(e.target.value) })}
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label" style={{ color: '#cbd5e1', fontSize: '0.85rem', fontWeight: 600 }}>Weekday Price ({entityForm.currency === 'INR' ? '₹' : '$'})</label>
                    <input
                      type="number"
                      min={0}
                      className="form-input"
                      style={{ background: '#1e293b', border: '1px solid #475569', color: 'white', height: '44px', width: '100%', borderRadius: '8px', padding: '0.75rem' }}
                      value={roomGeneration.weekday_price}
                      onChange={e => setRoomGeneration({ ...roomGeneration, weekday_price: Number(e.target.value) })}
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label" style={{ color: '#cbd5e1', fontSize: '0.85rem', fontWeight: 600 }}>Weekend Price ({entityForm.currency === 'INR' ? '₹' : '$'})</label>
                    <input
                      type="number"
                      min={0}
                      className="form-input"
                      style={{ background: '#1e293b', border: '1px solid #475569', color: 'white', height: '44px', width: '100%', borderRadius: '8px', padding: '0.75rem' }}
                      value={roomGeneration.weekend_price}
                      onChange={e => setRoomGeneration({ ...roomGeneration, weekend_price: Number(e.target.value) })}
                    />
                  </div>
                </div>

                {roomGeneration.mode === 'auto' ? (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem' }}>
                    <div className="form-group">
                      <label className="form-label" style={{ color: '#cbd5e1', fontSize: '0.85rem', fontWeight: 600 }}>Starting Room Number</label>
                      <input
                        type="text"
                        className="form-input"
                        style={{ background: '#1e293b', border: '1px solid #475569', color: 'white', height: '44px', width: '100%', borderRadius: '8px', padding: '0.75rem' }}
                        value={roomGeneration.startNumber}
                        onChange={e => setRoomGeneration({ ...roomGeneration, startNumber: e.target.value })}
                        placeholder="e.g. 101"
                      />
                    </div>
                    <div className="form-group">
                      <label className="form-label" style={{ color: '#cbd5e1', fontSize: '0.85rem', fontWeight: 600 }}>Number of Rooms to Create</label>
                      <input
                        type="number"
                        min={1}
                        max={50}
                        className="form-input"
                        style={{ background: '#1e293b', border: '1px solid #475569', color: 'white', height: '44px', width: '100%', borderRadius: '8px', padding: '0.75rem' }}
                        value={roomGeneration.count}
                        onChange={e => setRoomGeneration({ ...roomGeneration, count: Number(e.target.value) })}
                      />
                    </div>
                    <p style={{ gridColumn: 'span 2', margin: 0, fontSize: '0.8rem', color: '#94a3b8', background: 'rgba(255,255,255,0.03)', padding: '0.85rem', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)' }}>
                      💡 This will automatically create <strong>{roomGeneration.count}</strong> rooms numbered: <strong style={{ color: '#10b981' }}>
                        {Array.from({ length: Math.min(roomGeneration.count, 6) }).map((_, idx) => Number(roomGeneration.startNumber) + idx).join(', ')}
                        {roomGeneration.count > 6 && ' ...'}
                      </strong>
                    </p>
                  </div>
                ) : (
                  <div className="form-group">
                    <label className="form-label" style={{ color: '#cbd5e1', fontSize: '0.85rem', fontWeight: 600 }}>Room Names / Numbers (comma-separated)</label>
                    <textarea
                      className="form-input"
                      style={{ background: '#1e293b', border: '1px solid #475569', color: 'white', minHeight: '80px', width: '100%', borderRadius: '8px', padding: '0.75rem', resize: 'vertical' }}
                      value={roomGeneration.manualNames}
                      onChange={e => setRoomGeneration({ ...roomGeneration, manualNames: e.target.value })}
                      placeholder="e.g. 101, 102, 201, Suite A"
                    />
                    <small style={{ color: '#94a3b8', display: 'block', marginTop: '0.5rem' }}>Create individual designations by typing names separated by commas.</small>
                  </div>
                )}
              </div>
            )}

            {/* Stepper Navigation Buttons */}
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', marginTop: '2.5rem', paddingTop: '1.5rem', borderTop: '1px solid rgba(255, 255, 255, 0.08)' }}>
              {step > 1 ? (
                <button
                  type="button"
                  onClick={handlePrevStep}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    background: 'transparent',
                    border: '1px solid rgba(255, 255, 255, 0.15)',
                    padding: '0.75rem 1.5rem',
                    borderRadius: '10px',
                    color: '#f8fafc',
                    cursor: 'pointer',
                    fontWeight: 700,
                    fontSize: '0.9rem',
                    transition: 'all 0.2s'
                  }}
                >
                  <ChevronLeft size={16} /> Back
                </button>
              ) : (
                <div /> /* spacing spacer */
              )}

              {step < 3 ? (
                <button
                  type="button"
                  onClick={handleNextStep}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    background: '#10b981',
                    border: 'none',
                    padding: '0.75rem 1.5rem',
                    borderRadius: '10px',
                    color: 'white',
                    cursor: 'pointer',
                    fontWeight: 700,
                    fontSize: '0.9rem',
                    transition: 'all 0.2s'
                  }}
                >
                  Continue <ChevronRight size={16} />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleSubmit}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    background: '#10b981',
                    border: 'none',
                    padding: '0.75rem 1.75rem',
                    borderRadius: '10px',
                    color: 'white',
                    cursor: 'pointer',
                    fontWeight: 700,
                    fontSize: '0.9rem',
                    boxShadow: '0 4px 14px rgba(16, 185, 129, 0.3)',
                    transition: 'all 0.2s'
                  }}
                >
                  Complete Setup <Check size={16} />
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Styled custom transitions in JS */}
      <style dangerouslySetInnerHTML={{__html: `
        .animate-spin {
          animation: spin 1s linear infinite;
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        .btn-logout-hover:hover {
          background: rgba(239, 68, 68, 0.1) !important;
          border-color: rgba(239, 68, 68, 0.3) !important;
          color: #ef4444 !important;
        }
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}} />
    </div>
  );
}
