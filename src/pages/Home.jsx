import React, { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useSettingsStore } from '../lib/store';
import { supabase } from '../lib/supabase';
import { companyBranding } from '../lib/branding';
import { getWebScreenshotSrcSet, getMobileScreenshotSrcSet } from '../lib/imageOptimization';
import { 
  ArrowRight, LayoutDashboard, BookOpenCheck, CalendarDays, Wallet, 
  FileText, TrendingUp, Users, CreditCard, Sparkles, CheckCircle2, 
  Shield, ShieldCheck, Zap, Smartphone, Play, Globe, Check, ChevronLeft, ChevronRight, MessageCircle
} from 'lucide-react';

export default function Home() {
  const { landingPageContent, setLandingPageContent } = useSettingsStore();
  const location = useLocation();

  const [configStatus, setConfigStatus] = useState('loading'); // 'loading' | 'published' | 'uninitialized' | 'error'
  const [rpcError, setRpcError] = useState(null);

  // Fresh public configuration fetch on mount / refresh
  useEffect(() => {
    let isMounted = true;
    if (supabase && typeof supabase.rpc === 'function') {
      supabase.rpc('get_public_website_config').then(({ data, error }) => {
        if (!isMounted) return;
        if (error) {
          console.warn("Public config fetch error on homepage:", error);
          setRpcError(error.message);
          setConfigStatus('error');
          return;
        }
        if (data && data.landing_page && typeof data.landing_page === 'object') {
          const rawLp = Array.isArray(data.landing_page)
            ? (data.landing_page.find(x => x && typeof x === 'object') || null)
            : data.landing_page;
          if (rawLp && typeof rawLp === 'object') {
            setConfigStatus('published');
            setRpcError(null);
            if (setLandingPageContent) {
              setLandingPageContent(rawLp);
            }
          } else {
            setConfigStatus('uninitialized');
            setRpcError(null);
          }
        } else {
          // Explicitly uninitialized on server (landing_page is null or not an object)
          setConfigStatus('uninitialized');
          setRpcError(null);
        }
      }).catch(err => {
        if (!isMounted) return;
        console.warn("Public config fetch exception on homepage:", err);
        setRpcError(err.message || 'Network exception');
        setConfigStatus('error');
      });
    } else {
      setConfigStatus('uninitialized');
    }
    return () => { isMounted = false; };
  }, [setLandingPageContent]);

  const defaultWebImages = [
    'https://lubkdxhqnnghnjhrebat.supabase.co/storage/v1/object/public/public-assets/slider/mou07ccl4i8_1792682511344.JPG',
    'https://lubkdxhqnnghnjhrebat.supabase.co/storage/v1/object/public/public-assets/slider/x3vy8bg3eq9_1792682515750.jpg',
    'https://lubkdxhqnnghnjhrebat.supabase.co/storage/v1/object/public/public-assets/slider/d0hmc1q3d2g_1792682519310.JPG',
    'https://lubkdxhqnnghnjhrebat.supabase.co/storage/v1/object/public/public-assets/slider/n65vh5odw7q_1792682523749.jpg',
    'https://lubkdxhqnnghnjhrebat.supabase.co/storage/v1/object/public/public-assets/slider/xgzosd2n3ep_1792682528874.jpg',
    'https://lubkdxhqnnghnjhrebat.supabase.co/storage/v1/object/public/public-assets/slider/xvopq7x36na_1792682535913.jpg',
    'https://lubkdxhqnnghnjhrebat.supabase.co/storage/v1/object/public/public-assets/slider/wx817p3lfn_1792682541253.jpg',
    'https://lubkdxhqnnghnjhrebat.supabase.co/storage/v1/object/public/public-assets/slider/m2fll4sk2ur_1792682544738.jpg'
  ];

  const defaultMobileImages = [
    'https://lubkdxhqnnghnjhrebat.supabase.co/storage/v1/object/public/public-assets/slider/o2py90wkk3s_1792686641688.jpg',
    'https://lubkdxhqnnghnjhrebat.supabase.co/storage/v1/object/public/public-assets/slider/sx5d424bm3d_1792686647863.jpg',
    'https://lubkdxhqnnghnjhrebat.supabase.co/storage/v1/object/public/public-assets/slider/w1q8rytk4yn_1792686654745.jpg',
    'https://lubkdxhqnnghnjhrebat.supabase.co/storage/v1/object/public/public-assets/slider/5okzqrdwo14_1792686660643.jpg',
    'https://lubkdxhqnnghnjhrebat.supabase.co/storage/v1/object/public/public-assets/slider/tk1ryt70erq_1792686664477.jpg',
    'https://lubkdxhqnnghnjhrebat.supabase.co/storage/v1/object/public/public-assets/slider/5lq8lrao56x_1792686668111.jpg'
  ];

  const resolvedContent = Array.isArray(landingPageContent)
    ? (landingPageContent.find(x => x && typeof x === 'object') || null)
    : landingPageContent;

  // Single Source of Truth resolution:
  // State 1: Published Configuration Available (resolvedContent is valid object)
  // State 2: Configuration Explicitly Uninitialized (null/undefined & not error) -> defaults
  // State 3: Loading -> show defaults without flashing
  // State 4: Fetch Error -> error-safe defaults
  const hasPublishedConfig = resolvedContent !== null && typeof resolvedContent === 'object';
  
  let effectiveStatus = configStatus;
  if (configStatus === 'error') {
    effectiveStatus = 'error';
  } else if (hasPublishedConfig) {
    effectiveStatus = 'published';
  }

  let webImages = [];
  let mobileImages = [];
  let imageSource = 'defaults';

  if (effectiveStatus === 'published' && resolvedContent) {
    imageSource = 'published';
    // Published collections are authoritative:
    // When defined (even if empty []), use EXACT published list.
    // Only if a collection is completely undefined in the published object, fall back to default assets.
    webImages = (resolvedContent.webImages !== undefined && Array.isArray(resolvedContent.webImages))
      ? resolvedContent.webImages.filter(url => typeof url === 'string' && url.trim() !== '')
      : defaultWebImages;
    mobileImages = (resolvedContent.mobileImages !== undefined && Array.isArray(resolvedContent.mobileImages))
      ? resolvedContent.mobileImages.filter(url => typeof url === 'string' && url.trim() !== '')
      : defaultMobileImages;
  } else if (effectiveStatus === 'error') {
    imageSource = 'error-fallback';
    webImages = defaultWebImages;
    mobileImages = defaultMobileImages;
  } else {
    // 'loading' or 'uninitialized'
    imageSource = 'defaults';
    webImages = defaultWebImages;
    mobileImages = defaultMobileImages;
  }
  
  const [webIdx, setWebIdx] = useState(0);
  const [mobileIdx, setMobileIdx] = useState(0);
  const [isWebHovered, setIsWebHovered] = useState(false);
  const [mobileBadgeGroup, setMobileBadgeGroup] = useState(0);

  // Progressive carousel loading: Track mounted/preloaded slides
  const [loadedWebIndices, setLoadedWebIndices] = useState(() => new Set([0]));
  const [loadedMobileIndices, setLoadedMobileIndices] = useState(() => new Set([0]));

  // Preload next web slide before transition without blocking initial paint
  useEffect(() => {
    if (webImages.length === 0) return;
    const nextIdx = (webIdx + 1) % webImages.length;
    setLoadedWebIndices(prev => {
      if (prev.has(webIdx) && prev.has(nextIdx)) return prev;
      const next = new Set(prev);
      next.add(webIdx);
      next.add(nextIdx);
      return next;
    });
  }, [webIdx, webImages.length]);

  // Preload next mobile slide before transition
  useEffect(() => {
    if (mobileImages.length === 0) return;
    const nextIdx = (mobileIdx + 1) % mobileImages.length;
    setLoadedMobileIndices(prev => {
      if (prev.has(mobileIdx) && prev.has(nextIdx)) return prev;
      const next = new Set(prev);
      next.add(mobileIdx);
      next.add(nextIdx);
      return next;
    });
  }, [mobileIdx, mobileImages.length]);

  // Clamp web index when web images change
  useEffect(() => {
    if (webImages.length === 0) {
      if (webIdx !== 0) setWebIdx(0);
    } else if (webIdx >= webImages.length) {
      setWebIdx(0);
    }
  }, [webImages.length, webIdx]);

  // Clamp mobile index when mobile images change
  useEffect(() => {
    if (mobileImages.length === 0) {
      if (mobileIdx !== 0) setMobileIdx(0);
    } else if (mobileIdx >= mobileImages.length) {
      setMobileIdx(0);
    }
  }, [mobileImages.length, mobileIdx]);

  // Rotating mobile feature badges timer (Option A: cycles groups 0, 1, 2 every 5s on mobile)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReducedMotion) return;

    let intervalId = null;

    const startTimer = () => {
      if (intervalId) clearInterval(intervalId);
      intervalId = setInterval(() => {
        if (!document.hidden) {
          setMobileBadgeGroup(prev => (prev + 1) % 3);
        }
      }, 5000);
    };

    const handleVisibilityChange = () => {
      if (document.hidden) {
        if (intervalId) clearInterval(intervalId);
      } else {
        startTimer();
      }
    };

    startTimer();
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      if (intervalId) clearInterval(intervalId);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  // Independent auto-slide timer for web images (pauses on hover or background tab)
  useEffect(() => {
    if (webImages.length <= 1) return;
    const interval = setInterval(() => {
      if (!isWebHovered && !document.hidden) {
        setWebIdx(prev => (prev + 1) % webImages.length);
      }
    }, 3500);
    return () => clearInterval(interval);
  }, [webImages.length, isWebHovered]);

  // Independent auto-slide timer for mobile images
  useEffect(() => {
    if (mobileImages.length <= 1) return;
    const interval = setInterval(() => {
      if (!document.hidden) {
        setMobileIdx(prev => (prev + 1) % mobileImages.length);
      }
    }, 3500);
    return () => clearInterval(interval);
  }, [mobileImages.length]);

  useEffect(() => {
    if (location.hash) {
      const id = location.hash.replace('#', '');
      const element = document.getElementById(id);
      if (element) {
        setTimeout(() => {
          element.scrollIntoView({ behavior: 'smooth' });
        }, 100);
      }
    } else {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, [location]);

  const PLAY_STORE_LINK = "https://play.google.com/store/apps/details?id=com.staypilot.app";

  return (
    <div style={{ fontFamily: 'var(--font-sans, system-ui, sans-serif)', overflowX: 'hidden' }}>
      <style>{`
        .gradient-text {
          background: linear-gradient(135deg, #34d399 0%, #38bdf8 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
        }
        .hero-bg {
          background: radial-gradient(circle at top center, #064e3b 0%, #020617 100%);
          color: white;
        }
        .glass-card {
          background: rgba(255, 255, 255, 0.7);
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
          border: 1px solid rgba(255, 255, 255, 0.5);
          box-shadow: 0 10px 30px -10px rgba(0, 0, 0, 0.05);
          transition: transform 0.3s ease, box-shadow 0.3s ease;
        }
        .glass-card:hover {
          transform: translateY(-5px);
          box-shadow: 0 20px 40px -10px rgba(5, 150, 105, 0.1);
        }
        .bento-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          grid-auto-rows: 250px;
          gap: 1.5rem;
        }
        .bento-item {
          background: #ffffff;
          border: 1px solid #e2e8f0;
          border-radius: 24px;
          padding: 2rem;
          display: flex;
          flex-direction: column;
          overflow: hidden;
          position: relative;
          box-shadow: 0 10px 30px -10px rgba(0,0,0,0.05);
          transition: transform 0.3s ease;
        }
        .bento-item:hover {
          transform: translateY(-5px);
          box-shadow: 0 20px 40px -10px rgba(0,0,0,0.1);
        }
        .bento-item.large {
          grid-column: span 2;
        }
        @media (max-width: 768px) {
          .bento-grid {
            grid-template-columns: 1fr;
            grid-auto-rows: auto;
          }
          .bento-item.large {
            grid-column: span 1;
          }
        }
        .play-store-btn {
          display: flex;
          align-items: center;
          gap: 12px;
          background: #000;
          color: #fff;
          padding: 10px 24px;
          border-radius: 8px;
          text-decoration: none;
          transition: transform 0.2s, background 0.2s;
          border: 1px solid #333;
        }
        .play-store-btn:hover {
          transform: scale(1.02);
          background: #111;
        }
        .app-section {
          background: linear-gradient(135deg, #0f172a 0%, #0c4a6e 100%);
          color: white;
          position: relative;
          overflow: hidden;
        }
        .float-anim {
          animation: float 6s ease-in-out infinite;
        }
        .float-anim-delayed {
          animation: float 6s ease-in-out infinite 3s;
        }
        @keyframes float {
          0% { transform: translateY(0px); }
          50% { transform: translateY(-20px); }
          100% { transform: translateY(0px); }
        }
        .glass-badge {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          background: rgba(15, 23, 42, 0.85);
          backdrop-filter: blur(14px);
          -webkit-backdrop-filter: blur(14px);
          border: 1px solid rgba(16, 185, 129, 0.22);
          padding: 8px 16px;
          border-radius: 9999px;
          box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.45), 0 0 14px rgba(16, 185, 129, 0.08);
          font-weight: 600;
          color: #f8fafc;
          font-size: 0.84rem;
          line-height: 1.2;
          white-space: nowrap;
          user-select: none;
          cursor: default;
          will-change: transform;
          transition: transform 0.25s ease, border-color 0.25s ease, box-shadow 0.25s ease, color 0.25s ease;
        }
        .glass-badge:hover {
          transform: translateY(-2px) scale(1.025);
          border-color: rgba(52, 211, 153, 0.5);
          box-shadow: 0 14px 28px -4px rgba(0, 0, 0, 0.55), 0 0 20px rgba(16, 185, 129, 0.22);
          color: #ffffff;
        }
        .glass-badge-icon {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          color: #34d399;
          transition: color 0.25s ease;
        }
        .glass-badge:hover .glass-badge-icon {
          color: #6ee7b7;
        }

        /* Desktop Base Positions */
        .badge-pos-calendar { position: absolute; top: 14%; left: -6%; z-index: 25; }
        .badge-pos-financials { position: absolute; bottom: 24%; left: -4%; z-index: 25; }
        .badge-pos-scanning { position: absolute; top: 42%; right: 18%; z-index: 30; }
        .badge-pos-security { position: absolute; top: -4%; right: 6%; z-index: 25; }
        .badge-pos-enquiry { position: absolute; bottom: 6%; right: -10%; z-index: 30; }
        .badge-pos-invoicing { position: absolute; top: -2%; left: 14%; z-index: 25; }
        .badge-pos-whatsapp { position: absolute; bottom: -2%; left: 24%; z-index: 25; }

        /* Gentle Staggered Floating Animations (4-6px movement, 3-4s duration) */
        .badge-anim-1 { animation: badgeFloat1 3.4s ease-in-out infinite 0s; }
        .badge-anim-2 { animation: badgeFloat2 3.8s ease-in-out infinite 0.6s; }
        .badge-anim-3 { animation: badgeFloat3 3.5s ease-in-out infinite 1.2s; }
        .badge-anim-4 { animation: badgeFloat1 3.9s ease-in-out infinite 1.8s; }
        .badge-anim-5 { animation: badgeFloat2 3.3s ease-in-out infinite 0.3s; }
        .badge-anim-6 { animation: badgeFloat3 3.7s ease-in-out infinite 0.9s; }
        .badge-anim-7 { animation: badgeFloat1 3.6s ease-in-out infinite 1.5s; }

        @keyframes badgeFloat1 {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-5px); }
        }
        @keyframes badgeFloat2 {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-6px); }
        }
        @keyframes badgeFloat3 {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-4px); }
        }

        @media (max-width: 1200px) and (min-width: 1025px) {
          .badge-pos-calendar { left: -2%; }
          .badge-pos-financials { left: -1%; }
          .badge-pos-enquiry { right: -4%; }
        }

        @media (max-width: 1024px) and (min-width: 769px) {
          .glass-badge {
            padding: 7px 13px !important;
            font-size: 0.8rem !important;
            gap: 6px !important;
          }
          .badge-pos-calendar { top: 12% !important; left: 0% !important; }
          .badge-pos-financials { bottom: 20% !important; left: 0% !important; }
          .badge-pos-scanning { top: 38% !important; right: 22% !important; }
          .badge-pos-security { top: -3% !important; right: 4% !important; }
          .badge-pos-enquiry { bottom: 6% !important; right: 0% !important; }
          .badge-pos-invoicing { top: -2% !important; left: 8% !important; }
          .badge-pos-whatsapp { bottom: -2% !important; left: 20% !important; }
        }

        @media (prefers-reduced-motion: reduce) {
          .glass-badge, 
          .badge-anim-1, 
          .badge-anim-2, 
          .badge-anim-3, 
          .badge-anim-4, 
          .badge-anim-5, 
          .badge-anim-6, 
          .badge-anim-7 {
            animation: none !important;
            transition: none !important;
          }
        }
        .mockup-container {
          position: relative;
          width: 100%;
          max-width: 1000px;
          margin: 0 auto;
          margin-top: 2rem;
          z-index: 10;
        }
        .web-mockup {
          width: 100%;
          border-radius: 16px;
          box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.3), 0 0 0 1px rgba(0, 0, 0, 0.05);
          border: 1px solid #cbd5e1;
          background: #f8fafc;
          aspect-ratio: 16/9;
          overflow: hidden;
          position: relative;
          display: flex;
          flex-direction: column;
        }
        .mobile-mockup {
          position: absolute;
          bottom: -10%;
          right: -5%;
          width: 25%;
          min-width: 200px;
          aspect-ratio: 9/19.5;
          background: #0f172a;
          border-radius: 32px;
          box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.4);
          border: 8px solid #1e293b;
          overflow: hidden;
          z-index: 20;
        }
        .image-slider {
          position: absolute;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          object-fit: cover;
          object-position: top center;
          opacity: 0;
          z-index: 1;
          pointer-events: none;
          image-rendering: -webkit-optimize-contrast;
          image-rendering: crisp-edges;
          backface-visibility: hidden;
          -webkit-backface-visibility: hidden;
          transform: translateZ(0);
          transition: opacity 0.6s ease-in-out;
        }
        .image-slider.active {
          opacity: 1;
          z-index: 2;
          pointer-events: auto;
          transform: translateZ(0);
        }
        @media (min-width: 769px) {
          .glass-badge.mobile-hidden,
          .glass-badge.mobile-visible {
            opacity: 1 !important;
            visibility: visible !important;
            pointer-events: auto !important;
          }
        }

        @media (max-width: 768px) {
          .desktop-nav { display: none !important; }
          .desktop-btn { display: none !important; }
          .glass-badge {
            padding: 5px 11px !important;
            font-size: 0.72rem !important;
            gap: 5px !important;
            border-radius: 9999px !important;
            z-index: 35 !important;
            transition: opacity 0.25s ease-in-out, visibility 0.25s ease-in-out !important;
          }
          .glass-badge.mobile-hidden {
            opacity: 0 !important;
            visibility: hidden !important;
            pointer-events: none !important;
          }
          .glass-badge.mobile-visible {
            opacity: 1 !important;
            visibility: visible !important;
            pointer-events: auto !important;
          }
          .glass-badge-icon svg {
            width: 13px !important;
            height: 13px !important;
          }
          .badge-pos-calendar { top: 6% !important; left: 2% !important; right: auto !important; }
          .badge-pos-financials { bottom: 30% !important; left: 2% !important; right: auto !important; }
          .badge-pos-invoicing { top: 6% !important; right: 2% !important; left: auto !important; }
          .badge-pos-scanning { top: 38% !important; right: 2% !important; left: auto !important; }
          .badge-pos-whatsapp { bottom: 4% !important; left: 2% !important; right: auto !important; }
          .badge-pos-security { top: 6% !important; right: 2% !important; left: auto !important; }
          .badge-pos-enquiry { bottom: 4% !important; right: 2% !important; left: auto !important; }
          .mockup-container { 
            margin-top: 2rem !important; 
            display: flex;
            flex-direction: column;
            align-items: center;
          }
          .mobile-mockup { 
            position: relative;
            right: auto;
            bottom: auto;
            width: 50%;
            max-width: 250px;
            min-width: 200px;
            margin-top: -12%;
            border-width: 4px; 
            border-radius: 20px; 
          }
          .hero-title { font-size: 2.3rem !important; line-height: 1.15 !important; }
        }
        @media (max-width: 480px) {
          .glass-badge {
            padding: 4px 9px !important;
            font-size: 0.68rem !important;
            gap: 4px !important;
            max-width: 48% !important;
            overflow: hidden !important;
            text-overflow: ellipsis !important;
          }
          .glass-badge-icon svg {
            width: 11px !important;
            height: 11px !important;
          }
          .badge-pos-calendar { top: 5% !important; left: 2% !important; right: auto !important; }
          .badge-pos-financials { bottom: 30% !important; left: 2% !important; right: auto !important; }
          .badge-pos-invoicing { top: 5% !important; right: 2% !important; left: auto !important; }
          .badge-pos-scanning { top: 38% !important; right: 2% !important; left: auto !important; }
          .badge-pos-whatsapp { bottom: 4% !important; left: 2% !important; right: auto !important; }
          .badge-pos-security { top: 5% !important; right: 2% !important; left: auto !important; }
          .badge-pos-enquiry { bottom: 4% !important; right: 2% !important; left: auto !important; }
        }
      `}</style>

      
      {/* Header */}
      {/* Header */}
      <header style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center', 
        padding: '1.25rem 2rem', 
        background: 'rgba(255, 255, 255, 0.75)',
        backdropFilter: 'blur(16px)',
        borderBottom: '1px solid rgba(255, 255, 255, 0.4)',
        position: 'sticky',
        top: 0,
        zIndex: 50,
        boxShadow: '0 4px 30px rgba(0, 0, 0, 0.02)'
      }}>
        <Link to="/" style={{ display: 'flex', alignItems: 'center', textDecoration: 'none' }}>
          <img src="/stay-pilot-logo.png" alt="Stay Pilot Logo" width="160" height="36" style={{ height: '36px', width: 'auto', display: 'block' }} />
        </Link>
        
        {/* Desktop Navigation (Center) */}
        <nav className="desktop-nav" style={{ display: 'flex', gap: '2.5rem', alignItems: 'center', fontWeight: 600, color: '#334155', fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
          <Link to="/" style={{ color: '#059669', textDecoration: 'none' }}>Home</Link>
          <a href="#about" style={{ color: 'inherit', textDecoration: 'none', transition: 'color 0.2s' }} onMouseOver={e => e.target.style.color = '#059669'} onMouseOut={e => e.target.style.color = 'inherit'}>About</a>
          <Link to="/features" style={{ color: 'inherit', textDecoration: 'none', transition: 'color 0.2s' }} onMouseOver={e => e.target.style.color = '#059669'} onMouseOut={e => e.target.style.color = 'inherit'}>Features</Link>
          <Link to="/how-it-works" style={{ color: 'inherit', textDecoration: 'none', transition: 'color 0.2s' }} onMouseOver={e => e.target.style.color = '#059669'} onMouseOut={e => e.target.style.color = 'inherit'}>How It Works</Link>
          <Link to="/pricing" style={{ color: 'inherit', textDecoration: 'none', transition: 'color 0.2s' }} onMouseOver={e => e.target.style.color = '#059669'} onMouseOut={e => e.target.style.color = 'inherit'}>Pricing</Link>
        </nav>

        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          <Link to="/auth" className="desktop-btn" style={{ padding: '0.5rem 1rem', fontWeight: 600, color: '#0F2C59', textDecoration: 'none', fontFamily: "'Plus Jakarta Sans', sans-serif" }}>Sign In</Link>
          <Link to="/pricing" className="btn" style={{ padding: '0.65rem 1.6rem', fontWeight: 700, borderRadius: '8px', color: 'white', background: 'linear-gradient(135deg, #059669 0%, #10b981 100%)', border: 'none', boxShadow: '0 4px 15px rgba(5, 150, 105, 0.25)', textDecoration: 'none', fontFamily: "'Plus Jakarta Sans', sans-serif" }}>Get Started</Link>
        </div>
      </header>

      {/* HERO SECTION */}
      <section className="hero-bg" style={{ position: 'relative', padding: '2.5rem 1.25rem 0', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <div style={{ maxWidth: '800px', margin: '0 auto', zIndex: 2 }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', background: 'rgba(52, 211, 153, 0.2)', color: '#34d399', padding: '6px 16px', borderRadius: '30px', fontSize: '0.9rem', fontWeight: 600, marginBottom: '1.5rem' }}>
            <Sparkles size={16} /> New: StayPilot Android App is Live!
          </div>
          
          <h1 className="hero-title gradient-text" style={{ fontSize: '4.5rem', fontWeight: 800, margin: '0 0 1.25rem 0', letterSpacing: '-0.03em', lineHeight: 1.1 }}>
            Know Your Bookings.<br/>Know Your Numbers.
          </h1>
          
          <p style={{ fontSize: '1.25rem', color: '#94a3b8', margin: '0 0 2rem 0', lineHeight: 1.6, maxWidth: '600px', marginInline: 'auto' }}>
            The all-in-one platform built for independent properties. Manage reservations, track financials, and scale your business effortlessly from any device.
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%' }}>
            <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', flexWrap: 'wrap', alignItems: 'center' }}>
              <Link to="/pricing" className="btn btn-primary" style={{ padding: '14px 32px', fontSize: '1.1rem', borderRadius: '8px', boxShadow: '0 10px 25px -5px rgba(5, 150, 105, 0.4)' }}>
                Start 30-Day Free Trial
              </Link>
              <a href={PLAY_STORE_LINK} target="_blank" rel="noopener noreferrer" className="play-store-btn">
                <img src="https://upload.wikimedia.org/wikipedia/commons/7/78/Google_Play_Store_badge_EN.svg" alt="Get it on Google Play" style={{ height: '32px' }} />
              </a>
            </div>
            <div style={{ fontSize: '0.85rem', color: '#94a3b8', marginTop: '0.75rem', fontWeight: 500, letterSpacing: '0.01em' }}>
              No credit card required • Setup in minutes
            </div>
          </div>
        </div>

        {/* MOCKUP SHOWCASE */}
        <div className="mockup-container float-anim">
          {/* GLOW EFFECT */}
          <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', width: '80%', height: '80%', background: 'radial-gradient(circle, rgba(52, 211, 153, 0.4) 0%, rgba(56, 189, 248, 0.1) 50%, transparent 70%)', filter: 'blur(60px)', zIndex: 0 }}></div>

          {/* FLOATING BADGES */}
          <div className={`glass-badge badge-pos-calendar badge-anim-1 ${mobileBadgeGroup === 0 ? 'mobile-visible' : 'mobile-hidden'}`}>
            <span className="glass-badge-icon"><CalendarDays size={15} /></span>
            <span>Smart Availability Calendar</span>
          </div>
          <div className={`glass-badge badge-pos-financials badge-anim-2 ${mobileBadgeGroup === 0 ? 'mobile-visible' : 'mobile-hidden'}`}>
            <span className="glass-badge-icon"><TrendingUp size={15} /></span>
            <span>Automated Financial Tracking</span>
          </div>
          <div className={`glass-badge badge-pos-scanning badge-anim-3 ${mobileBadgeGroup === 1 ? 'mobile-visible' : 'mobile-hidden'}`}>
            <span className="glass-badge-icon"><Sparkles size={15} /></span>
            <span>AI-Powered ID Scanning</span>
          </div>
          <div className={`glass-badge badge-pos-security badge-anim-4 ${mobileBadgeGroup === 2 ? 'mobile-visible' : 'mobile-hidden'}`}>
            <span className="glass-badge-icon"><ShieldCheck size={15} /></span>
            <span>Secure & Private</span>
          </div>
          <div className={`glass-badge badge-pos-enquiry badge-anim-5 ${mobileBadgeGroup === 2 ? 'mobile-visible' : 'mobile-hidden'}`}>
            <span className="glass-badge-icon"><Smartphone size={15} /></span>
            <span>Quick Enquiry Management</span>
          </div>
          <div className={`glass-badge badge-pos-invoicing badge-anim-6 ${mobileBadgeGroup === 0 ? 'mobile-visible' : 'mobile-hidden'}`}>
            <span className="glass-badge-icon"><FileText size={15} /></span>
            <span>Effortless Invoicing</span>
          </div>
          <div className={`glass-badge badge-pos-whatsapp badge-anim-7 ${mobileBadgeGroup === 1 ? 'mobile-visible' : 'mobile-hidden'}`}>
            <span className="glass-badge-icon"><MessageCircle size={15} /></span>
            <span>Instant WhatsApp Updates</span>
          </div>

          <div 
            className="web-mockup"
            onMouseEnter={() => setIsWebHovered(true)}
            onMouseLeave={() => setIsWebHovered(false)}
          >
            <div style={{ background: '#e2e8f0', padding: '12px', display: 'flex', gap: '8px', borderBottom: '1px solid #cbd5e1' }}>
              <div style={{ width: 12, height: 12, borderRadius: '50%', background: '#ef4444' }}></div>
              <div style={{ width: 12, height: 12, borderRadius: '50%', background: '#f59e0b' }}></div>
              <div style={{ width: 12, height: 12, borderRadius: '50%', background: '#10b981' }}></div>
            </div>
            {/* WEB IMAGE SLIDER */}
            <div style={{ flex: 1, minHeight: 0, width: '100%', background: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', fontSize: '1.5rem', overflow: 'hidden', position: 'relative' }}>
              {webImages.length > 0 ? (
                webImages.map((rawSrc, i) => {
                  if (!loadedWebIndices.has(i)) return null;
                  const { src, srcSet, sizes } = getWebScreenshotSrcSet(rawSrc);
                  const isHeroInitial = i === 0;
                  return (
                    <img 
                      key={i} 
                      src={src} 
                      srcSet={srcSet}
                      sizes={sizes}
                      className={`image-slider ${i === webIdx ? 'active' : ''}`} 
                      alt={`Web Dashboard ${i + 1}`}
                      loading={isHeroInitial ? "eager" : "lazy"}
                      fetchPriority={isHeroInitial ? "high" : "low"}
                      decoding={isHeroInitial ? "sync" : "async"}
                    />
                  );
                })
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#94a3b8', gap: '0.75rem', padding: '2rem', userSelect: 'none' }}>
                  <LayoutDashboard size={44} style={{ opacity: 0.35, color: '#0F2C59' }} />
                  <span style={{ fontSize: '0.95rem', fontWeight: 600, color: '#64748b' }}>StayPilot Web Dashboard Preview</span>
                </div>
              )}

              {/* Prev / Next Navigation Arrows */}
              {webImages.length > 1 && (
                <>
                  <button 
                    type="button" 
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); setWebIdx(prev => (prev - 1 + webImages.length) % webImages.length); }} 
                    aria-label="Previous slide"
                    style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', zIndex: 10, width: '36px', height: '36px', borderRadius: '50%', background: 'rgba(15, 23, 42, 0.65)', border: '1px solid rgba(255,255,255,0.2)', color: '#ffffff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', backdropFilter: 'blur(4px)', boxShadow: '0 4px 10px rgba(0,0,0,0.2)' }}
                  >
                    <ChevronLeft size={20} />
                  </button>
                  <button 
                    type="button" 
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); setWebIdx(prev => (prev + 1) % webImages.length); }} 
                    aria-label="Next slide"
                    style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', zIndex: 10, width: '36px', height: '36px', borderRadius: '50%', background: 'rgba(15, 23, 42, 0.65)', border: '1px solid rgba(255,255,255,0.2)', color: '#ffffff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', backdropFilter: 'blur(4px)', boxShadow: '0 4px 10px rgba(0,0,0,0.2)' }}
                  >
                    <ChevronRight size={20} />
                  </button>
                </>
              )}

              {/* Web Slide Indicator Dots & Counter */}
              {webImages.length > 1 && (
                <div style={{ position: 'absolute', bottom: '12px', left: '50%', transform: 'translateX(-50%)', zIndex: 10, display: 'flex', alignItems: 'center', gap: '6px', background: 'rgba(15, 23, 42, 0.7)', padding: '5px 12px', borderRadius: '20px', backdropFilter: 'blur(4px)', border: '1px solid rgba(255,255,255,0.15)' }}>
                  {webImages.map((_, dotIdx) => (
                    <button
                      key={dotIdx}
                      type="button"
                      onClick={(e) => { e.stopPropagation(); setWebIdx(dotIdx); }}
                      aria-label={`Jump to slide ${dotIdx + 1}`}
                      style={{ width: dotIdx === webIdx ? '18px' : '7px', height: '7px', borderRadius: '4px', background: dotIdx === webIdx ? '#10b981' : 'rgba(255,255,255,0.5)', border: 'none', padding: 0, cursor: 'pointer', transition: 'all 0.3s ease' }}
                    />
                  ))}
                  <span style={{ fontSize: '11px', color: '#ffffff', marginLeft: '6px', fontWeight: 600, letterSpacing: '0.05em' }}>
                    {webIdx + 1}/{webImages.length}
                  </span>
                </div>
              )}
            </div>
          </div>
          
          <div 
            className="mobile-mockup float-anim-delayed"
            onClick={() => mobileImages.length > 1 && setMobileIdx(prev => (prev + 1) % mobileImages.length)}
            style={{ cursor: mobileImages.length > 1 ? 'pointer' : 'default' }}
            title={mobileImages.length > 1 ? "Click to view next mobile screen" : ""}
          >
            {/* MOBILE IMAGE SLIDER */}
            <div style={{ width: '100%', height: '100%', background: '#0f172a', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b', textAlign: 'center', overflow: 'hidden', position: 'relative' }}>
              {mobileImages.length > 0 ? (
                mobileImages.map((rawSrc, i) => {
                  if (!loadedMobileIndices.has(i)) return null;
                  const { src, srcSet, sizes } = getMobileScreenshotSrcSet(rawSrc);
                  const isHeroInitial = i === 0;
                  return (
                    <img 
                      key={i} 
                      src={src} 
                      srcSet={srcSet}
                      sizes={sizes}
                      className={`image-slider ${i === mobileIdx ? 'active' : ''}`} 
                      alt={`Mobile App ${i + 1}`}
                      loading={isHeroInitial ? "eager" : "lazy"}
                      fetchPriority={isHeroInitial ? "high" : "low"}
                      decoding={isHeroInitial ? "sync" : "async"}
                    />
                  );
                })
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#64748b', gap: '0.5rem', padding: '1rem', userSelect: 'none' }}>
                  <Smartphone size={32} style={{ opacity: 0.35, color: '#38bdf8' }} />
                  <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#94a3b8' }}>StayPilot Mobile App</span>
                </div>
              )}

              {/* Mobile Slide Indicator Dots */}
              {mobileImages.length > 1 && (
                <div style={{ position: 'absolute', bottom: '10px', left: '50%', transform: 'translateX(-50%)', zIndex: 10, display: 'flex', alignItems: 'center', gap: '4px', background: 'rgba(15, 23, 42, 0.75)', padding: '4px 10px', borderRadius: '16px', backdropFilter: 'blur(4px)' }}>
                  {mobileImages.map((_, dotIdx) => (
                    <button
                      key={dotIdx}
                      type="button"
                      onClick={(e) => { e.stopPropagation(); setMobileIdx(dotIdx); }}
                      aria-label={`Jump to mobile slide ${dotIdx + 1}`}
                      style={{ width: dotIdx === mobileIdx ? '14px' : '5px', height: '5px', borderRadius: '3px', background: dotIdx === mobileIdx ? '#10b981' : 'rgba(255,255,255,0.5)', border: 'none', padding: 0, cursor: 'pointer', transition: 'all 0.3s ease' }}
                    />
                  ))}
                  <span style={{ fontSize: '9px', color: '#ffffff', marginLeft: '4px', fontWeight: 600 }}>
                    {mobileIdx + 1}/{mobileImages.length}
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Curved SVG Divider to blend into light section */}
        <div style={{ position: 'absolute', bottom: 0, left: 0, width: '100%', overflow: 'hidden', lineHeight: 0, transform: 'translateY(1px)', zIndex: 0 }}>
          <svg viewBox="0 0 1200 120" preserveAspectRatio="none" style={{ position: 'relative', display: 'block', width: 'calc(100% + 1.3px)', height: '80px' }}>
            <path d="M321.39,56.44c58-10.79,114.16-30.13,172-41.86,82.39-16.72,168.19-17.73,250.45-.39C823.78,31,906.67,72,985.66,92.83c70.05,18.48,146.53,26.09,214.34,3V120H0V0C52.42,28.17,133.72,67.6,214.34,71.2,251.69,72.84,288.08,62.6,321.39,56.44Z" fill="#ffffff"></path>
          </svg>
        </div>
      </section>

      {/* PARTNERS / TRUST SECTION */}
      <section style={{ padding: '2.5rem 1.5rem', background: '#fff', borderTop: '1px solid #f1f5f9', borderBottom: '1px solid #f1f5f9', textAlign: 'center' }}>
        <p style={{ textTransform: 'uppercase', letterSpacing: '1.5px', color: '#64748b', fontSize: '0.8rem', fontWeight: 700, marginBottom: '1.25rem' }}>
          Built for independent hospitality businesses
        </p>
        <div style={{ display: 'flex', justifyContent: 'center', gap: '1.5rem 2.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
          {['Homestays', 'Villas', 'Cottages', 'Resorts', 'Small Hotels'].map((type, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '1.05rem', fontWeight: 700, color: '#334155' }}>
              <CheckCircle2 size={18} color="var(--primary, #059669)" /> {type}
            </div>
          ))}
        </div>
      </section>

      {/* ABOUT SECTION */}
      <section id="about" style={{ padding: '5rem 1.5rem', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', textAlign: 'center' }}>
        <div style={{ maxWidth: '820px', margin: '0 auto' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', fontWeight: 700, color: '#059669', background: 'rgba(5, 150, 105, 0.08)', padding: '5px 16px', borderRadius: '20px', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '1.25rem' }}>
            About StayPilot
          </div>
          <h2 style={{ fontSize: '2.25rem', fontWeight: 800, color: '#0F2C59', marginBottom: '1.25rem', letterSpacing: '-0.02em', lineHeight: 1.25, fontFamily: "'Outfit', sans-serif" }}>
            Purpose-Built for Modern Hospitality
          </h2>
          <p style={{ fontSize: '1.15rem', color: '#475569', lineHeight: 1.75, marginBottom: '1.5rem' }}>
            {companyBranding.aboutDescription}
          </p>
          <div style={{ display: 'inline-block', fontSize: '0.9rem', color: '#059669', fontWeight: 600, background: '#ffffff', padding: '6px 18px', borderRadius: '20px', border: '1px solid #e2e8f0', boxShadow: '0 2px 4px rgba(0,0,0,0.02)' }}>
            {companyBranding.productAttribution}
          </div>
        </div>
      </section>



      {/* DEDICATED MOBILE APP SECTION */}
      <section className="app-section" style={{ padding: '8rem 1.5rem 6rem' }}>
        {/* Curved SVG Divider from white section above */}
        <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', overflow: 'hidden', lineHeight: 0, transform: 'rotate(180deg) translateY(1px)', zIndex: 0 }}>
          <svg viewBox="0 0 1200 120" preserveAspectRatio="none" style={{ position: 'relative', display: 'block', width: 'calc(100% + 1.3px)', height: '80px' }}>
            <path d="M321.39,56.44c58-10.79,114.16-30.13,172-41.86,82.39-16.72,168.19-17.73,250.45-.39C823.78,31,906.67,72,985.66,92.83c70.05,18.48,146.53,26.09,214.34,3V120H0V0C52.42,28.17,133.72,67.6,214.34,71.2,251.69,72.84,288.08,62.6,321.39,56.44Z" fill="#ffffff"></path>
          </svg>
        </div>

        <div style={{ maxWidth: '1200px', margin: '0 auto', display: 'flex', alignItems: 'center', gap: '4rem', flexWrap: 'wrap', position: 'relative', zIndex: 1 }}>
          <div style={{ flex: '1 1 400px' }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', padding: '6px 16px', borderRadius: '30px', fontSize: '0.9rem', fontWeight: 600, marginBottom: '1.5rem', color: 'white' }}>
              <Smartphone size={16} /> Manage From Anywhere
            </div>
            <h2 style={{ fontSize: '3rem', fontWeight: 800, marginBottom: '1.5rem', lineHeight: 1.1, color: 'white' }}>
              Your entire property in your pocket.
            </h2>
            <p style={{ fontSize: '1.15rem', opacity: 0.9, marginBottom: '2rem', lineHeight: 1.6, color: 'white' }}>
              Don't stay chained to the front desk. With the StayPilot Android App, you can manage bookings, check in guests, and monitor your daily revenue from anywhere in the world.
            </p>
            <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 2.5rem 0', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {['Live push notifications for new bookings', 'Instantly update room statuses', 'Secure PIN & biometric login', 'Offline caching for poor connections'].map((item, i) => (
                <li key={i} style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '1.1rem' }}>
                  <CheckCircle2 color="#34d399" size={20} /> {item}
                </li>
              ))}
            </ul>
            <a href={PLAY_STORE_LINK} target="_blank" rel="noopener noreferrer" className="play-store-btn" style={{ display: 'inline-flex', background: '#fff', color: '#000' }}>
              <img src="https://upload.wikimedia.org/wikipedia/commons/7/78/Google_Play_Store_badge_EN.svg" alt="Get it on Google Play" style={{ height: '36px' }} />
            </a>
          </div>
          <div style={{ flex: '1 1 400px', display: 'flex', justifyContent: 'center' }}>
            {/* LARGE MOBILE MOCKUP SLIDER */}
            <div 
              style={{ width: '300px', height: '600px', background: '#0f172a', borderRadius: '40px', border: '8px solid #1e293b', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)', overflow: 'hidden', position: 'relative', cursor: mobileImages.length > 1 ? 'pointer' : 'default' }}
              onClick={() => mobileImages.length > 1 && setMobileIdx(prev => (prev + 1) % mobileImages.length)}
              title={mobileImages.length > 1 ? "Click to view next mobile screen" : ""}
            >
              <div style={{ width: '40%', height: '25px', background: '#1e293b', position: 'absolute', top: 0, left: '30%', borderBottomLeftRadius: '12px', borderBottomRightRadius: '12px', zIndex: 10 }}></div>
              <div style={{ width: '100%', height: '100%', background: '#0f172a', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', textAlign: 'center', overflow: 'hidden', position: 'relative' }}>
                {mobileImages.length > 0 ? (
                  mobileImages.map((rawSrc, i) => {
                    if (i !== mobileIdx && !loadedMobileIndices.has(i)) return null;
                    const { src, srcSet, sizes } = getMobileScreenshotSrcSet(rawSrc);
                    return (
                      <img 
                        key={i} 
                        src={src} 
                        srcSet={srcSet}
                        sizes={sizes}
                        className={`image-slider ${i === mobileIdx ? 'active' : ''}`} 
                        alt={`Mobile App Preview ${i + 1}`} 
                        loading="lazy"
                        fetchPriority="low"
                        decoding="async"
                      />
                    );
                  })
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#64748b', gap: '0.75rem', padding: '1.5rem', userSelect: 'none' }}>
                    <Smartphone size={40} style={{ opacity: 0.35, color: '#38bdf8' }} />
                    <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#94a3b8' }}>StayPilot Mobile App Preview</span>
                  </div>
                )}

                {/* Mobile Slide Indicator Dots */}
                {mobileImages.length > 1 && (
                  <div style={{ position: 'absolute', bottom: '16px', left: '50%', transform: 'translateX(-50%)', zIndex: 10, display: 'flex', alignItems: 'center', gap: '5px', background: 'rgba(15, 23, 42, 0.75)', padding: '5px 12px', borderRadius: '16px', backdropFilter: 'blur(4px)' }}>
                    {mobileImages.map((_, dotIdx) => (
                      <button
                        key={dotIdx}
                        type="button"
                        onClick={(e) => { e.stopPropagation(); setMobileIdx(dotIdx); }}
                        aria-label={`Jump to mobile slide ${dotIdx + 1}`}
                        style={{ width: dotIdx === mobileIdx ? '16px' : '6px', height: '6px', borderRadius: '3px', background: dotIdx === mobileIdx ? '#10b981' : 'rgba(255,255,255,0.5)', border: 'none', padding: 0, cursor: 'pointer', transition: 'all 0.3s ease' }}
                      />
                    ))}
                    <span style={{ fontSize: '10px', color: '#ffffff', marginLeft: '5px', fontWeight: 600 }}>
                      {mobileIdx + 1}/{mobileImages.length}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA FOOTER */}
      <section style={{ padding: '6rem 1.5rem', background: '#fff', textAlign: 'center' }}>
        <div style={{ maxWidth: '800px', margin: '0 auto' }}>
          <h2 style={{ fontSize: '3rem', fontWeight: 800, color: '#0f172a', marginBottom: '1.5rem', letterSpacing: '-0.02em' }}>
            Ready to simplify your business?
          </h2>
          <p style={{ fontSize: '1.25rem', color: '#64748b', marginBottom: '3rem' }}>
            Join the smart properties using StayPilot to maximize revenue and minimize headaches.
          </p>
          <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', flexWrap: 'wrap' }}>
            <Link to="/pricing" className="btn btn-primary" style={{ padding: '16px 40px', fontSize: '1.2rem', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '10px' }}>
              Start 30-Day Free Trial <ArrowRight size={20} />
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer style={{ 
        padding: '3rem 2rem 2rem', 
        borderTop: '1px solid rgba(0,0,0,0.05)',
        background: '#f8fafc',
        color: '#64748b',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '1.5rem'
      }}>
        <div style={{ display: 'flex', gap: '2rem', flexWrap: 'wrap', justifyContent: 'center', fontWeight: 600 }}>
          <Link to="/" style={{ color: 'inherit', textDecoration: 'none' }}>Home</Link>
          <a href="#about" style={{ color: 'inherit', textDecoration: 'none' }}>About</a>
          <Link to="/features" style={{ color: 'inherit', textDecoration: 'none' }}>Features</Link>
          <Link to="/how-it-works" style={{ color: 'inherit', textDecoration: 'none' }}>How It Works</Link>
          <Link to="/pricing" style={{ color: 'inherit', textDecoration: 'none' }}>Pricing</Link>
          <Link to="/privacy" style={{ color: 'inherit', textDecoration: 'none' }}>Privacy Policy</Link>
        </div>
        <div style={{ fontSize: '0.9rem', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
          <div>© {new Date().getFullYear()} StayPilot. All rights reserved.</div>
          <div style={{ fontSize: '0.825rem', color: '#94a3b8', fontWeight: 500 }}>
            {companyBranding.productAttribution}
          </div>
        </div>
      </footer>

      {/* Dev Diagnostics HUD (Visible strictly during local development) */}
      {import.meta.env.DEV && (
        <div 
          id="homepage-dev-diagnostics"
          style={{
            position: 'fixed',
            bottom: '16px',
            left: '16px',
            zIndex: 99999,
            background: 'rgba(15, 23, 42, 0.94)',
            color: '#f8fafc',
            padding: '10px 14px',
            borderRadius: '10px',
            fontSize: '11px',
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
            boxShadow: '0 10px 25px -5px rgba(0,0,0,0.5)',
            border: '1px solid rgba(255,255,255,0.15)',
            display: 'flex',
            flexDirection: 'column',
            gap: '5px',
            pointerEvents: 'auto',
            backdropFilter: 'blur(8px)',
            maxWidth: '340px'
          }}
        >
          <div style={{ fontWeight: 700, color: '#34d399', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>⚡ HOMEPAGE SLIDER DIAGNOSTICS</span>
            <span style={{ fontSize: '10px', color: '#94a3b8' }}>DEV ONLY</span>
          </div>
          <div>Config State: <span style={{ fontWeight: 700, color: effectiveStatus === 'published' ? '#34d399' : effectiveStatus === 'error' ? '#f87171' : '#fbbf24' }}>{effectiveStatus}</span></div>
          <div>Image Source: <span style={{ fontWeight: 700, color: '#38bdf8' }}>{imageSource}</span></div>
          <div>Web Images Count: <span style={{ fontWeight: 700 }}>{webImages.length}</span></div>
          <div>Mobile Images Count: <span style={{ fontWeight: 700 }}>{mobileImages.length}</span></div>
          {rpcError && <div style={{ color: '#f87171', wordBreak: 'break-all' }}>RPC Error: {rpcError}</div>}
        </div>
      )}
    </div>
  );
}
