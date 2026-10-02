import React, { useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, AreaChart, Area } from 'recharts';
import { Wallet, BedDouble, CalendarCheck, TrendingUp, CreditCard, Building2, Calendar as CalendarIcon, ChevronLeft, ChevronRight } from 'lucide-react';
import { format, parseISO, startOfMonth, endOfMonth, addMonths, subMonths, getDaysInMonth } from 'date-fns';

import { useSettingsStore } from '../lib/store';

export default function Dashboard() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { activeResortId, profile, globalPlans } = useSettingsStore();

  const userPlan = profile?.plan_type || 'free';
  const planData = globalPlans?.[userPlan] || {};
  const isSuper = profile?.role === 'super_admin';
  const hasInvestmentAccess = planData.reports?.investment || profile?.feature_investment_enabled || isSuper;

  // 1. Cottages / Customer Properties State
  const [cottagesList, setCottagesList] = useState([]);
  const hasMultipleProperties = cottagesList.length > 1;

  // Default property fallback
  const defaultPropertyId = hasMultipleProperties ? 'all' : (cottagesList[0]?.id || 'all');

  // 2. Validate URL Property Parameter
  const rawPropertyParam = searchParams.get('property');
  let selectedPropertyId = defaultPropertyId;

  if (rawPropertyParam === 'all' && hasMultipleProperties) {
    selectedPropertyId = 'all';
  } else if (rawPropertyParam && cottagesList.some(c => c.id === rawPropertyParam)) {
    selectedPropertyId = rawPropertyParam;
  } else if (!hasMultipleProperties && cottagesList.length === 1) {
    selectedPropertyId = cottagesList[0].id;
  }

  // 3. Validate URL Month Parameter (YYYY-MM)
  const currentMonthStr = format(new Date(), 'yyyy-MM');
  const rawMonthParam = searchParams.get('month');
  let selectedMonth = currentMonthStr;

  if (rawMonthParam && /^\d{4}-(0[1-9]|1[0-2])$/.test(rawMonthParam)) {
    selectedMonth = rawMonthParam;
  }

  // Parse Selected Month & Year
  const [selectedYearNum, selectedMonthNum] = selectedMonth.split('-').map(Number);
  const selectedDateObj = useMemo(() => new Date(selectedYearNum, selectedMonthNum - 1, 1), [selectedYearNum, selectedMonthNum]);

  const startOfMonthStr = format(startOfMonth(selectedDateObj), 'yyyy-MM-dd');
  const endOfMonthStr = format(endOfMonth(selectedDateObj), 'yyyy-MM-dd');
  const startOfYearStr = `${selectedYearNum}-01-01`;
  const endOfYearStr = `${selectedYearNum}-12-31`;

  const formattedMonthHeading = format(selectedDateObj, 'MMMM yyyy');
  const formattedMonthShort = useMemo(() => format(selectedDateObj, 'MMM yyyy'), [selectedDateObj]);
  const formattedMonthExtraShort = useMemo(() => format(selectedDateObj, 'MMM yy'), [selectedDateObj]);

  // Property Label for Section Headings
  const selectedPropertyLabel = useMemo(() => {
    if (!hasMultipleProperties) return '';
    if (selectedPropertyId === 'all') return '· All Properties';
    const found = cottagesList.find(c => c.id === selectedPropertyId);
    return found ? `· ${found.name}` : '';
  }, [hasMultipleProperties, selectedPropertyId, cottagesList]);

  // Handler for Updating URL State
  const updateUrlState = (newPropId, newMonthStr) => {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      next.set('property', newPropId);
      next.set('month', newMonthStr);
      return next;
    }, { replace: true });
  };

  const handlePropertyChange = (newPropId) => {
    updateUrlState(newPropId, selectedMonth);
  };

  const handleMonthChange = (newMonthStr) => {
    updateUrlState(selectedPropertyId, newMonthStr);
  };

  const handlePrevMonth = () => {
    const prevDate = subMonths(selectedDateObj, 1);
    handleMonthChange(format(prevDate, 'yyyy-MM'));
  };

  const handleNextMonth = () => {
    const nextDate = addMonths(selectedDateObj, 1);
    handleMonthChange(format(nextDate, 'yyyy-MM'));
  };

  const [stats, setStats] = useState({ 
    monthlyCollections: 0, 
    monthlyExpenses: 0,
    monthlyProfit: 0,
    monthlyBookings: 0,
    collections: 0, 
    expenses: 0, 
    profit: 0, 
    totalBookings: 0, 
    occupancy: 0,
    breakEvenMonthlyTarget: undefined,
    strategicMonthlyTarget: undefined
  });

  const [chartData, setChartData] = useState([]);
  const [recentCheckins, setRecentCheckins] = useState({ active: [], upcoming: [] });
  const [loading, setLoading] = useState(true);
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);
  
  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth <= 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    const fetchData = async () => {
      if (!isSupabaseConfigured() || !activeResortId) {
        setLoading(false); 
        return; 
      }
      try {
        setLoading(true);
        const todayStr = format(new Date(), 'yyyy-MM-dd');

        const [cts, inc, exp, bksYear, bksLive, rms, inv] = await Promise.all([
          // 1. Cottages for active resort
          supabase.from('cottages')
            .select('id, name, resort_id')
            .eq('resort_id', activeResortId)
            .order('created_at', { ascending: true }),

          // 2. Incomes for selected year
          supabase.from('incomes')
            .select('amount, date, resort_id, cottage_id')
            .eq('resort_id', activeResortId)
            .gte('date', startOfYearStr)
            .lte('date', endOfYearStr),

          // 3. Expenses for selected year
          supabase.from('expenses')
            .select('amount, date, resort_id, cottage_id')
            .eq('resort_id', activeResortId)
            .gte('date', startOfYearStr)
            .lte('date', endOfYearStr),

          // 4. Bookings for selected year (monthly & yearly performance)
          supabase.from('bookings')
            .select('id, resort_id, check_in_date, check_out_date, status, total_amount, balance_amount, guest_name, booking_source, booking_type, cottage_id, room_ids')
            .eq('resort_id', activeResortId)
            .gte('check_in_date', startOfYearStr)
            .lte('check_in_date', endOfYearStr),

          // 5. Live bookings (for live occupancy, staying now, upcoming arrivals)
          supabase.from('bookings')
            .select('id, resort_id, check_in_date, check_out_date, status, total_amount, balance_amount, guest_name, booking_source, booking_type, cottage_id, room_ids')
            .eq('resort_id', activeResortId)
            .or(`status.eq.Checked-in,check_in_date.gte.${todayStr},and(check_in_date.lte.${todayStr},check_out_date.gte.${todayStr})`),

          // 6. Rooms
          supabase.from('rooms')
            .select('id, cottage_id, resort_id')
            .eq('resort_id', activeResortId),

          // 7. Investment Targets
          supabase.from('investments')
            .select('*')
            .eq('resort_id', activeResortId)
        ]);

        const ctsList = cts.data || [];
        setCottagesList(ctsList);

        const incList = inc.data || [];
        const expList = exp.data || [];
        const yearBksList = bksYear.data || [];
        const liveBksList = bksLive.data || [];
        const rmsList = rms.data || [];
        const invList = inv.data || [];

        // Determine effective property filter ID
        const effectiveHasMultiple = ctsList.length > 1;
        const effectiveDefaultId = effectiveHasMultiple ? 'all' : (ctsList[0]?.id || 'all');
        let currentPropId = effectiveDefaultId;
        if (rawPropertyParam === 'all' && effectiveHasMultiple) {
          currentPropId = 'all';
        } else if (rawPropertyParam && ctsList.some(c => c.id === rawPropertyParam)) {
          currentPropId = rawPropertyParam;
        } else if (!effectiveHasMultiple && ctsList.length === 1) {
          currentPropId = ctsList[0].id;
        }

        // --- FILTER RECORDS BASED ON SELECTED PROPERTY ---
        const incFiltered = currentPropId === 'all' ? incList : incList.filter(i => i.cottage_id === currentPropId);
        const expFiltered = currentPropId === 'all' ? expList : expList.filter(e => e.cottage_id === currentPropId);
        const yearBksFiltered = currentPropId === 'all' ? yearBksList : yearBksList.filter(b => b.cottage_id === currentPropId);
        const liveBksFiltered = currentPropId === 'all' ? liveBksList : liveBksList.filter(b => b.cottage_id === currentPropId);
        const rmsFiltered = currentPropId === 'all' ? rmsList : rmsList.filter(r => r.cottage_id === currentPropId);
        const ctsFiltered = currentPropId === 'all' ? ctsList : ctsList.filter(c => c.id === currentPropId);

        // --- A. FINANCIAL KPI CALCULATIONS ---
        const yearlyCollections = incFiltered.filter(i => i.date >= startOfYearStr && i.date <= endOfYearStr).reduce((sum, item) => sum + Number(item.amount || 0), 0);
        const monthlyCollections = incFiltered.filter(i => i.date >= startOfMonthStr && i.date <= endOfMonthStr).reduce((sum, item) => sum + Number(item.amount || 0), 0);
        
        const yearlyExpr = expFiltered.filter(e => e.date >= startOfYearStr && e.date <= endOfYearStr).reduce((sum, item) => sum + Number(item.amount || 0), 0);
        const monthlyExpr = expFiltered.filter(e => e.date >= startOfMonthStr && e.date <= endOfMonthStr).reduce((sum, item) => sum + Number(item.amount || 0), 0);

        // Reusable Performance Booking Helper (Model A: Exclude Cancelled bookings)
        const isPerformanceBooking = (b) => b.status !== 'Cancelled';

        const monthlyBookingsCount = yearBksFiltered.filter(b => isPerformanceBooking(b) && b.check_in_date >= startOfMonthStr && b.check_in_date <= endOfMonthStr).length;
        const yearlyBookingsCount = yearBksFiltered.filter(b => isPerformanceBooking(b) && b.check_in_date >= startOfYearStr && b.check_in_date <= endOfYearStr).length;

        // --- B. INVESTMENT TARGETS AGGREGATION ---
        // Investment targets exist at resort level. Only display when "All Properties" is selected.
        let breakEvenMonthlyTarget = undefined;
        let strategicMonthlyTarget = undefined;

        if (currentPropId === 'all' && invList.length > 0) {
          const invRec = invList[0];
          if (invRec && (Number(invRec.total_investment || 0) > 0 || Number(invRec.monthly_operating_expenses || 0) > 0 || Number(invRec.annual_fixed_expenses || 0) > 0)) {
            const monthlyOp = Number(invRec.monthly_operating_expenses || 0) * 12;
            const annualFixed = Number(invRec.annual_fixed_expenses || 0);
            const leaseInv = Number(invRec.total_investment || 0);

            let recoveryYears = Number(invRec.recovery_period_years) || 1;
            if (invRec.property_ownership === 'leased' && invRec.lease_start_date && invRec.lease_end_date) {
              const ls = new Date(invRec.lease_start_date);
              const le = new Date(invRec.lease_end_date);
              const diffYears = Math.abs(le - ls) / (1000 * 60 * 60 * 24 * 365.25);
              recoveryYears = diffYears > 0 ? diffYears : 1;
            }

            const annualCap = leaseInv / recoveryYears;
            const totalAnnCost = monthlyOp + annualFixed + annualCap;
            breakEvenMonthlyTarget = totalAnnCost / 12;
            const targetAnnNet = leaseInv * (Number(invRec.target_roi_percentage || 0) / 100);
            strategicMonthlyTarget = breakEvenMonthlyTarget + (targetAnnNet / 12);
          }
        }

        // --- C. LIVE OCCUPANCY CALCULATION (TIED TO REAL TODAY) ---
        const todayObj = new Date();
        todayObj.setHours(0,0,0,0);
        
        // Physical Capacity across selected target cottages/rooms
        const totalRoomsCount = rmsFiltered.length;
        const emptyCottagesCount = ctsFiltered.filter(c => !rmsFiltered.some(r => r.cottage_id === c.id)).length;
        const liveTotalCapacity = totalRoomsCount + emptyCottagesCount;

        // Today's active bookings
        const todayBookings = liveBksFiltered.filter(b => {
          if (b.status === 'cancelled' || b.status === 'Cancelled' || b.status === 'no_show') return false;
          const start = new Date(b.check_in_date);
          const end = new Date(b.check_out_date);
          start.setHours(0,0,0,0);
          end.setHours(0,0,0,0);
          return todayObj >= start && todayObj < end; 
        });

        const occupiedUnits = todayBookings.reduce((acc, b) => {
          if (b.booking_type === 'Entire Property') {
            return acc + Math.max(1, liveTotalCapacity);
          } else if (b.booking_type === 'Entire Cottage') {
            const cottageRooms = rmsFiltered.filter(r => r.cottage_id === b.cottage_id).length;
            return acc + Math.max(1, cottageRooms);
          } else {
            return acc + (b.room_ids?.length || 1);
          }
        }, 0);

        const occupancyPct = liveTotalCapacity > 0 ? Math.min(100, Math.round((occupiedUnits / liveTotalCapacity) * 100)) : 0;

        setStats({
          monthlyCollections,
          monthlyExpenses: monthlyExpr,
          monthlyProfit: monthlyCollections - monthlyExpr,
          monthlyBookings: monthlyBookingsCount,
          collections: yearlyCollections,
          expenses: yearlyExpr,
          profit: yearlyCollections - yearlyExpr,
          totalBookings: yearlyBookingsCount,
          occupancy: occupancyPct,
          breakEvenMonthlyTarget,
          strategicMonthlyTarget
        });

        // --- D. REVENUE BREAKDOWN CHART (SELECTED MONTH TREND) ---
        const daysInMonthCount = getDaysInMonth(selectedDateObj);
        const dailyMap = {};
        for (let dayNum = 1; dayNum <= daysInMonthCount; dayNum++) {
          const dayStr = `${selectedMonth}-${String(dayNum).padStart(2, '0')}`;
          dailyMap[dayStr] = { 
            name: format(parseISO(dayStr), 'MMM dd'), 
            Revenue: 0, 
            Expenses: 0 
          };
        }

        incFiltered.forEach(item => {
          if (dailyMap[item.date]) {
            dailyMap[item.date].Revenue += Number(item.amount || 0);
          }
        });

        expFiltered.forEach(item => {
          if (dailyMap[item.date]) {
            dailyMap[item.date].Expenses += Number(item.amount || 0);
          }
        });

        setChartData(Object.values(dailyMap));

        // --- E. LIVE OPERATIONAL LISTS (STAYING NOW & UPCOMING ARRIVALS) ---
        const activeList = liveBksFiltered.filter(b => b.status === 'Checked-in');
        const upcomingList = liveBksFiltered
          .filter(b => b.status === 'Confirmed' && b.check_in_date >= todayStr)
          .sort((a, b) => a.check_in_date.localeCompare(b.check_in_date));

        setRecentCheckins({ active: activeList, upcoming: upcomingList.slice(0, 10) });

      } catch (err) {
        console.error("Dashboard fetchData Error:", err);
      } finally { 
        setLoading(false); 
      }
    };

    fetchData();
  }, [activeResortId, selectedMonth, startOfMonthStr, endOfMonthStr, startOfYearStr, endOfYearStr, rawPropertyParam]);

  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '50vh', gap: '1rem' }}>
        <div className="spinner" style={{ width: '36px', height: '36px', border: '3px solid var(--border)', borderTopColor: 'var(--primary)', borderRadius: '50%', animation: 'spin 1s linear infinite' }}></div>
        <div style={{ color: 'var(--text-muted)', fontSize: '0.95rem', fontWeight: 600 }}>Loading Dashboard...</div>
      </div>
    );
  }

  const monthlyKpis = [
    { title: 'Collections', subtitle: formattedMonthHeading, value: `₹${stats.monthlyCollections.toLocaleString()}`, icon: <Wallet size={20}/>, color: 'linear-gradient(135deg, #059669 0%, #10b981 100%)' },
    { title: 'Expenses', subtitle: formattedMonthHeading, value: `₹${stats.monthlyExpenses.toLocaleString()}`, icon: <TrendingUp size={20}/>, color: 'linear-gradient(135deg, #e53e3e 0%, #f87171 100%)' },
    { title: 'Profit', subtitle: formattedMonthHeading, value: `₹${stats.monthlyProfit.toLocaleString()}`, icon: <TrendingUp size={20} style={{ rotate: '45deg' }}/>, color: 'linear-gradient(135deg, #0284c7 0%, #38bdf8 100%)' },
    { title: 'Bookings', subtitle: formattedMonthHeading, value: stats.monthlyBookings, icon: <CalendarCheck size={20}/>, color: 'linear-gradient(135deg, #4b5563 0%, #9ca3af 100%)' },
  ];

  const yearlyKpis = [
    { title: 'Collections', subtitle: `${selectedYearNum} Year`, value: `₹${stats.collections.toLocaleString()}`, icon: <CreditCard size={20}/>, color: 'linear-gradient(135deg, #3182ce 0%, #63b3ed 100%)' },
    { title: 'Expenses', subtitle: `${selectedYearNum} Year`, value: `₹${stats.expenses.toLocaleString()}`, icon: <TrendingUp size={20}/>, color: 'linear-gradient(135deg, #b91c1c 0%, #ef4444 100%)' },
    { title: 'Profit', subtitle: `${selectedYearNum} Year`, value: `₹${stats.profit.toLocaleString()}`, icon: <TrendingUp size={20} style={{ rotate: '45deg' }}/>, color: 'linear-gradient(135deg, #d97706 0%, #fbbf24 100%)' },
    { title: 'Bookings', subtitle: `${selectedYearNum} Year`, value: stats.totalBookings, icon: <CalendarCheck size={20}/>, color: 'linear-gradient(135deg, #4b5563 0%, #9ca3af 100%)' },
  ];

  const renderKpiGrid = (kpis) => (
    <div style={{ 
      display: 'grid', 
      gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(auto-fit, minmax(200px, 1fr))', 
      gap: isMobile ? '0.75rem' : '1rem' 
    }}>
      {kpis.map((k, i) => (
        <div key={i} className="card" style={{ 
          background: k.color, 
          color: 'white', 
          border: 'none',
          display: 'flex', 
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: isMobile ? '0.75rem' : '1.25rem',
          height: isMobile ? '100px' : '130px',
          boxShadow: '0 8px 15px rgba(0,0,0,0.08)',
          overflow: 'hidden'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.25rem' }}>
            <div style={{ minWidth: 0 }}>
              <span style={{ 
                fontSize: isMobile ? '0.6rem' : '0.75rem', 
                fontWeight: '700', 
                opacity: 0.9, 
                textTransform: 'uppercase', 
                letterSpacing: '0.02em', 
                display: 'block',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis'
              }}>{k.title}</span>
              <span style={{ fontSize: isMobile ? '0.55rem' : '0.65rem', opacity: 0.7, fontWeight: '600' }}>{k.subtitle}</span>
            </div>
            <div style={{ background: 'rgba(255,255,255,0.2)', padding: isMobile ? '0.25rem' : '0.4rem', borderRadius: '6px' }}>
              {React.cloneElement(k.icon, { size: isMobile ? 16 : 20 })}
            </div>
          </div>
          <div style={{ 
            fontSize: isMobile ? '1.1rem' : '1.4rem', 
            fontWeight: '900', 
            letterSpacing: '-0.5px',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis'
          }}>{k.value}</div>
        </div>
      ))}
    </div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: isMobile ? '1.25rem' : '2rem' }}>
      
      {/* --- DASHBOARD FILTER BAR --- */}
      <div className="card" style={{ 
        padding: isMobile ? '0.4rem 0.6rem' : '0.65rem 1.25rem', 
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'nowrap',
        gap: isMobile ? '0.35rem' : '1rem',
        background: 'var(--bg-secondary)',
        border: '1px solid var(--border)',
        borderRadius: isMobile ? '10px' : '14px',
        boxShadow: isMobile ? 'none' : '0 2px 8px rgba(0,0,0,0.02)',
        minHeight: isMobile ? '50px' : 'auto',
        overflow: 'hidden'
      }}>
        {/* Left: Property Selector (Shown for Multi-property Accounts Only) */}
        {hasMultipleProperties && (
          <div style={{ 
            display: 'flex', 
            alignItems: 'center', 
            gap: isMobile ? '0.35rem' : '0.5rem',
            flex: isMobile ? '1 1 55%' : '0 1 auto',
            minWidth: 0
          }}>
            <Building2 size={isMobile ? 15 : 16} color="var(--primary)" style={{ flexShrink: 0 }} />
            {!isMobile && (
              <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Property:</span>
            )}
            <select
              aria-label="Select property"
              className="form-select"
              style={{ 
                padding: isMobile ? '0.35rem 0.5rem' : '0.4rem 0.8rem', 
                fontSize: isMobile ? '0.8rem' : '0.85rem', 
                fontWeight: 700, 
                borderRadius: '8px', 
                cursor: 'pointer', 
                background: 'var(--bg-color)',
                width: '100%',
                minWidth: 0,
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                overflow: 'hidden'
              }}
              value={selectedPropertyId}
              onChange={e => handlePropertyChange(e.target.value)}
            >
              <option value="all">All Properties ({cottagesList.length})</option>
              {cottagesList.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
        )}

        {/* Divider for Mobile */}
        {isMobile && hasMultipleProperties && (
          <div style={{ width: '1px', height: '22px', background: 'var(--border)', flexShrink: 0, margin: '0 2px' }} />
        )}

        {/* Right: Month Selector Controls */}
        <div style={{ 
          display: 'flex', 
          alignItems: 'center', 
          gap: isMobile ? '0.25rem' : '0.5rem', 
          marginLeft: (hasMultipleProperties && !isMobile) ? 'auto' : '0',
          flex: isMobile ? (hasMultipleProperties ? '0 0 auto' : '1 1 100%') : '0 1 auto',
          justifyContent: (isMobile && !hasMultipleProperties) ? 'center' : 'flex-end'
        }}>
          {!isMobile && (
            <>
              <CalendarIcon size={16} color="var(--primary)" />
              <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Month:</span>
            </>
          )}

          {/* Integrated Month Navigator */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            background: 'var(--bg-color)',
            border: '1px solid var(--border)',
            borderRadius: '8px',
            padding: '2px',
            height: isMobile ? '36px' : 'auto',
            position: 'relative'
          }}>
            <button
              type="button"
              className="btn btn-outline"
              aria-label="Previous month"
              style={{ 
                padding: isMobile ? '0 0.4rem' : '0.35rem 0.65rem', 
                height: isMobile ? '30px' : 'auto',
                minWidth: isMobile ? '32px' : 'auto',
                border: 'none', 
                borderRadius: '6px', 
                cursor: 'pointer', 
                display: 'flex', 
                alignItems: 'center',
                justifyContent: 'center',
                background: 'transparent'
              }}
              onClick={handlePrevMonth}
              title="Previous Month"
            >
              <ChevronLeft size={16} />
            </button>

            {/* Direct Month Picker Trigger Container */}
            <div style={{ 
              position: 'relative', 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'center',
              padding: isMobile ? '0 0.4rem' : '0',
              cursor: 'pointer'
            }}>
              {isMobile ? (
                <>
                  <span style={{ 
                    fontSize: '0.8rem', 
                    fontWeight: 700, 
                    color: 'var(--text-main)', 
                    whiteSpace: 'nowrap',
                    userSelect: 'none',
                    padding: '0 0.2rem'
                  }}>
                    {window.innerWidth <= 340 ? formattedMonthExtraShort : formattedMonthShort}
                  </span>
                  <input
                    type="month"
                    aria-label="Select month"
                    style={{ 
                      position: 'absolute', 
                      inset: 0, 
                      opacity: 0, 
                      width: '100%', 
                      height: '100%', 
                      cursor: 'pointer' 
                    }}
                    value={selectedMonth}
                    onChange={e => e.target.value && handleMonthChange(e.target.value)}
                  />
                </>
              ) : (
                <input
                  type="month"
                  aria-label="Select month"
                  className="form-input"
                  style={{ padding: '0.35rem 0.75rem', fontSize: '0.85rem', fontWeight: 700, borderRadius: '6px', cursor: 'pointer', width: 'auto', background: 'transparent', border: 'none' }}
                  value={selectedMonth}
                  onChange={e => e.target.value && handleMonthChange(e.target.value)}
                />
              )}
            </div>

            <button
              type="button"
              className="btn btn-outline"
              aria-label="Next month"
              style={{ 
                padding: isMobile ? '0 0.4rem' : '0.35rem 0.65rem', 
                height: isMobile ? '30px' : 'auto',
                minWidth: isMobile ? '32px' : 'auto',
                border: 'none', 
                borderRadius: '6px', 
                cursor: 'pointer', 
                display: 'flex', 
                alignItems: 'center',
                justifyContent: 'center',
                background: 'transparent'
              }}
              onClick={handleNextMonth}
              title="Next Month"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      </div>

      {/* Monthly Section */}
      <section>
        <h2 style={{ fontSize: isMobile ? '0.9rem' : '1.1rem', fontWeight: '800', marginBottom: '1rem', color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <div style={{ width: '4px', height: isMobile ? '14px' : '18px', background: 'var(--primary)', borderRadius: '4px' }}></div>
          Monthly Performance — {formattedMonthHeading} {selectedPropertyLabel}
        </h2>
        {renderKpiGrid(monthlyKpis)}

        {/* Target Progress Bar for All Properties View */}
        {hasInvestmentAccess && selectedPropertyId === 'all' && stats.breakEvenMonthlyTarget !== undefined && (
          <div className="card" style={{ marginTop: '1rem', padding: '1.25rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '1rem' }}>
              <h3 style={{ fontSize: '0.9rem', margin: 0 }}>Monthly Target Progress</h3>
            </div>
            
            <div style={{ position: 'relative', marginTop: '2.5rem' }}>
              {/* Break-Even Label (Above the Bar) */}
              {stats.strategicMonthlyTarget !== undefined && (
                <div style={{
                  position: 'absolute',
                  left: `${Math.min(99, (stats.breakEvenMonthlyTarget / Math.max(1, stats.strategicMonthlyTarget)) * 100)}%`,
                  bottom: '100%',
                  marginBottom: '0.25rem',
                  transform: 'translateX(-50%)',
                  textAlign: 'center',
                  fontSize: '0.7rem',
                  color: 'var(--text-muted)',
                  whiteSpace: 'nowrap'
                }}>
                  <div style={{ fontWeight: 600, color: 'var(--warning)' }}>Break-Even</div>
                  <div>₹{Math.ceil(stats.breakEvenMonthlyTarget).toLocaleString()}</div>
                </div>
              )}

              {/* The Bar */}
              <div style={{ 
                width: '100%', 
                height: '24px', 
                background: '#f1f5f9', 
                borderRadius: '12px', 
                position: 'relative', 
                overflow: 'hidden',
                boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.1)'
              }}>
                <div style={{
                  position: 'absolute',
                  left: 0,
                  top: 0,
                  bottom: 0,
                  width: `${Math.min(100, Math.max(0, (stats.monthlyCollections / Math.max(1, stats.strategicMonthlyTarget || 1)) * 100))}%`,
                  background: stats.monthlyCollections < (stats.breakEvenMonthlyTarget || 0)
                    ? 'linear-gradient(90deg, #ef4444 0%, #f97316 100%)'
                    : 'linear-gradient(90deg, #f97316 0%, #84cc16 50%, #16a34a 100%)',
                  transition: 'width 1s ease-in-out',
                  borderRadius: '12px'
                }}></div>
                
                {/* Break-even Marker */}
                {stats.strategicMonthlyTarget !== undefined && (
                  <div style={{
                    position: 'absolute',
                    left: `${Math.min(99, (stats.breakEvenMonthlyTarget / Math.max(1, stats.strategicMonthlyTarget)) * 100)}%`,
                    top: 0,
                    bottom: 0,
                    width: '2px',
                    background: '#000',
                    zIndex: 2,
                    transform: 'translateX(-50%)'
                  }}></div>
                )}
              </div>
            </div>
            
            <div style={{ 
              display: 'flex', 
              flexWrap: 'wrap', 
              justifyContent: 'space-between', 
              marginTop: '1rem', 
              fontSize: '0.75rem', 
              gap: '0.5rem' 
            }}>
              <div style={{ display: 'flex', flexDirection: 'column', color: 'var(--text-main)' }}>
                <span style={{ fontWeight: 600 }}>Current</span>
                <span>₹{stats.monthlyCollections.toLocaleString()}</span>
              </div>
              
              <div style={{ display: 'flex', flexDirection: 'column', color: 'var(--text-muted)', textAlign: 'right' }}>
                <span style={{ fontWeight: 600, color: 'var(--success)' }}>Strategic Target</span>
                <span>₹{Math.ceil(stats.strategicMonthlyTarget || 0).toLocaleString()}</span>
              </div>
            </div>
          </div>
        )}

        {/* Fallback Banner for Individual Cottage View */}
        {hasInvestmentAccess && selectedPropertyId !== 'all' && (
          <div className="card" style={{ marginTop: '1rem', padding: '1rem 1.25rem', background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: '12px', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <Building2 size={18} color="var(--primary)" />
            <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: 600 }}>
              Investment targets are currently available for the consolidated business view. Select <strong>All Properties</strong> to view Break-Even and Strategic Target.
            </span>
          </div>
        )}
      </section>

      {/* Yearly Section */}
      <section>
        <h2 style={{ fontSize: isMobile ? '0.9rem' : '1.1rem', fontWeight: '800', marginBottom: '1rem', color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <div style={{ width: '4px', height: isMobile ? '14px' : '18px', background: '#3182ce', borderRadius: '4px' }}></div>
          Yearly Performance — {selectedYearNum} {selectedPropertyLabel}
        </h2>
        {renderKpiGrid(yearlyKpis)}
      </section>

      <div className="grid-2" style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '2fr 1fr', gap: isMobile ? '1.5rem' : '2rem' }}>
        {/* Sales Analytic Chart */}
        <div className="card" style={{ padding: isMobile ? '1rem' : '2rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem', flexWrap: 'wrap', gap: '1rem' }}>
            <div>
              <h3 style={{ margin: 0, fontSize: isMobile ? '1rem' : '1.25rem' }}>Revenue Breakdown</h3>
              <p style={{ margin: 0, fontSize: isMobile ? '0.75rem' : '0.85rem', color: 'var(--text-muted)' }}>
                {formattedMonthHeading} {selectedPropertyLabel} Daily Trend
              </p>
            </div>
            <div style={{ display: 'flex', gap: '0.75rem', fontSize: isMobile ? '0.7rem' : '0.8rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <div style={{ width: '10px', height: '10px', background: 'var(--primary)', borderRadius: '3px' }}></div>
                <span>Revenue</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <div style={{ width: '10px', height: '10px', background: 'var(--danger)', borderRadius: '3px' }}></div>
                <span>Expenses</span>
              </div>
            </div>
          </div>
          <div style={{ width: '100%', height: 320 }}>
            {chartData.length > 0 ? (
              <ResponsiveContainer>
                <AreaChart data={chartData}>
                  <defs>
                    <linearGradient id="colorRev" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="var(--primary)" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="var(--primary)" stopOpacity={0}/>
                    </linearGradient>
                    <linearGradient id="colorExp" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="var(--danger)" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="var(--danger)" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} scale="point" padding={{ left: 10, right: 10 }} stroke="var(--text-muted)" fontSize={12} />
                  <YAxis axisLine={false} tickLine={false} stroke="var(--text-muted)" fontSize={12} />
                  <Tooltip 
                    contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px rgba(0,0,0,0.1)', background: 'var(--bg-secondary)' }}
                    itemStyle={{ fontWeight: 'bold' }}
                  />
                  <Area type="monotone" dataKey="Revenue" stroke="var(--primary)" strokeWidth={3} fillOpacity={1} fill="url(#colorRev)" />
                  <Area type="monotone" dataKey="Expenses" stroke="var(--danger)" strokeWidth={3} fillOpacity={1} fill="url(#colorExp)" />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-color)', borderRadius: '12px', opacity: 0.6 }}>
                No transaction data for this month
              </div>
            )}
          </div>
        </div>

        {/* Live Operations & Activity Feed */}
        <div className="card" style={{ padding: isMobile ? '1.25rem' : '1.5rem' }}>
          <h3 style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.75rem', fontSize: isMobile ? '1rem' : '1.25rem' }}>
            <BedDouble size={isMobile ? 18 : 20} color="var(--primary)"/> Active & Upcoming Operations
          </h3>
          
          {/* Occupancy Progress Bar (Real Today) */}
          <div style={{ marginBottom: '2rem', padding: '1rem', background: 'var(--bg-secondary)', borderRadius: '12px', border: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem', fontSize: '0.85rem', fontWeight: 700 }}>
              <span>Today's Occupancy</span>
              <span style={{ color: 'var(--primary)' }}>{stats.occupancy}%</span>
            </div>
            <div style={{ width: '100%', height: '8px', background: 'var(--bg-color)', borderRadius: '10px', overflow: 'hidden' }}>
              <div style={{ 
                width: `${stats.occupancy}%`, 
                height: '100%', 
                background: 'var(--primary)',
                borderRadius: '10px',
                transition: 'width 0.5s ease-out'
              }}></div>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
            {/* Staying Now Section */}
            {recentCheckins.active.length > 0 && (
              <div>
                <h4 style={{ fontSize: '0.75rem', fontWeight: 800, color: 'var(--success)', textTransform: 'uppercase', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <div style={{ width: '8px', height: '8px', background: 'var(--success)', borderRadius: '50%' }}></div>
                  Staying Now ({recentCheckins.active.length})
                </h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  {recentCheckins.active.map(b => (
                    <div key={b.id} style={{ 
                      display: 'flex', 
                      alignItems: 'center',
                      gap: isMobile ? '0.75rem' : '1rem',
                      padding: isMobile ? '0.75rem' : '1rem', 
                      background: 'rgba(72, 187, 120, 0.05)', 
                      borderRadius: '12px', 
                      border: '1px solid var(--success)',
                      position: 'relative'
                    }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: '800', fontSize: isMobile ? '0.9rem' : '1rem', color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <span>{b.guest_name}</span>
                          {selectedPropertyId === 'all' && hasMultipleProperties && (
                            <span style={{ fontSize: '0.65rem', padding: '1px 5px', borderRadius: '4px', background: 'var(--bg-secondary)', border: '1px solid var(--border)', color: 'var(--text-muted)', fontWeight: 600 }}>
                              {cottagesList.find(c => c.id === b.cottage_id)?.name || 'Property'}
                            </span>
                          )}
                        </div>
                        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '4px' }}>
                          <span style={{ fontSize: '0.65rem', padding: '2px 6px', borderRadius: '4px', background: 'var(--success)', color: 'white', fontWeight: '800' }}>ACTIVE</span>
                          <span style={{ fontSize: '0.65rem', padding: '2px 6px', borderRadius: '4px', background: 'white', border: '1px solid #ddd', color: 'var(--text-muted)', fontWeight: 800 }}>{b.booking_source || 'Direct'}</span>
                        </div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '6px' }}>Out: {format(new Date(b.check_out_date), 'MMM dd')}</div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: '0.85rem', fontWeight: '900', color: b.balance_amount > 0 ? 'var(--danger)' : 'var(--success)' }}>₹{(b.balance_amount || 0).toLocaleString()}</div>
                        <span style={{ fontSize: '0.6rem', textTransform: 'uppercase', fontWeight: '800', opacity: 0.6 }}>Balance</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Upcoming Arrivals Section */}
            <div>
              <h4 style={{ fontSize: '0.75rem', fontWeight: 800, color: 'var(--primary)', textTransform: 'uppercase', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <div style={{ width: '8px', height: '8px', background: 'var(--primary)', borderRadius: '50%' }}></div>
                Upcoming Arrivals ({recentCheckins.upcoming.length})
              </h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {recentCheckins.upcoming.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '1rem', opacity: 0.5, fontSize: '0.85rem' }}>No upcoming arrivals</div>
                ) : recentCheckins.upcoming.map(b => (
                  <div key={b.id} style={{ 
                    display: 'flex', 
                    alignItems: 'center',
                    gap: isMobile ? '0.75rem' : '1rem',
                    padding: isMobile ? '0.75rem' : '1rem', 
                    background: 'var(--bg-color)', 
                    borderRadius: '12px', 
                    border: '1px solid var(--border)',
                    position: 'relative'
                  }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: '700', fontSize: isMobile ? '0.85rem' : '0.95rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <span>{b.guest_name}</span>
                        {selectedPropertyId === 'all' && hasMultipleProperties && (
                          <span style={{ fontSize: '0.65rem', padding: '1px 5px', borderRadius: '4px', background: 'var(--bg-secondary)', border: '1px solid var(--border)', color: 'var(--text-muted)', fontWeight: 600 }}>
                            {cottagesList.find(c => c.id === b.cottage_id)?.name || 'Property'}
                          </span>
                        )}
                      </div>
                      <div style={{ display: 'flex', gap: '0.5rem', marginTop: '4px' }}>
                        <span style={{ fontSize: '0.65rem', padding: '2px 6px', borderRadius: '4px', background: 'rgba(49, 130, 206, 0.1)', color: 'var(--primary)', fontWeight: '800' }}>NEXT: {format(new Date(b.check_in_date), 'MMM dd')}</span>
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: '0.8rem', fontWeight: 'bold' }}>₹{(b.total_amount || 0).toLocaleString()}</div>
                      <span style={{ fontSize: '0.6rem', textTransform: 'uppercase', fontWeight: '700', opacity: 0.6 }}>Total</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
