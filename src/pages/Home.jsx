import React, { useEffect, useState, useRef } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useSettingsStore } from '../lib/store';
import { supabase } from '../lib/supabase';
import { companyBranding } from '../lib/branding';
import { getWebScreenshotSrcSet, getMobileScreenshotSrcSet } from '../lib/imageOptimization';
import { 
  ArrowRight, LayoutDashboard, BookOpenCheck, CalendarDays, Wallet, 
  FileText, TrendingUp, Users, CreditCard, Sparkles, CheckCircle2, 
  Shield, ShieldCheck, Zap, Smartphone, Monitor, Play, Globe, Check, ChevronLeft, ChevronRight, MessageCircle, X, Maximize2
} from 'lucide-react';

// Verified Feature Definitions for Showcase Feature Strip & Mobile Badges
const HERO_BADGES = [
  {
    id: 'calendar',
    title: 'Smart Availability Calendar',
    displayLabel: 'Availability Calendar',
    mobileLabel: 'Availability Calendar',
    Icon: CalendarDays,
    posClass: 'badge-pos-calendar',
    animClass: 'badge-anim-1',
    mobileGroup: 0,
    placement: 'placement-left',
    shortDesc: 'Visual multi-property occupancy calendar displaying live room status and instant booking blockouts.',
    benefits: [
      'Color-coded cottage & room occupancy at a glance',
      'One-click booking creation, check-in, and status updates',
      'Instant prevention of double-bookings across all units'
    ]
  },
  {
    id: 'financials',
    title: 'Automated Financial Tracking',
    displayLabel: 'Financial Tracking',
    mobileLabel: 'Financial Tracking',
    Icon: TrendingUp,
    posClass: 'badge-pos-financials',
    animClass: 'badge-anim-2',
    mobileGroup: 3,
    placement: 'placement-center',
    shortDesc: 'Complete real-time financial ledger tracking daily collections, pending balances, and expenses.',
    benefits: [
      'Live tracking of cash, UPI, and bank transfer collections',
      'Categorized operational expense logging and supplier ledgers',
      'One-click exportable revenue, occupancy, and profit reports'
    ]
  },
  {
    id: 'scanning',
    title: 'AI-Powered ID Scanning',
    displayLabel: 'AI ID Scanning',
    mobileLabel: 'AI ID Scanning',
    Icon: Sparkles,
    posClass: 'badge-pos-scanning',
    animClass: 'badge-anim-3',
    mobileGroup: 1,
    placement: 'placement-center',
    shortDesc: 'Extract guest details directly from photo IDs to expedite the check-in process.',
    benefits: [
      'Fast 3-second guest detail extraction from ID photos',
      'Auto-populates guest name, age, gender, and ID numbers',
      'Encrypted and secure storage within your private tenant'
    ]
  },
  {
    id: 'security',
    title: 'Secure & Private',
    displayLabel: 'Secure & Private',
    mobileLabel: 'Secure & Private',
    Icon: ShieldCheck,
    posClass: 'badge-pos-security',
    animClass: 'badge-anim-4',
    mobileGroup: 2,
    placement: 'placement-center',
    shortDesc: 'Enterprise-grade row-level security ensuring strict multi-tenant property data isolation.',
    benefits: [
      'Strict database-level tenant isolation for all property records',
      'Time-limited signed URLs for guest identification documents',
      'Granular staff role permissions and protected audit trails'
    ]
  },
  {
    id: 'enquiry',
    title: 'Quick Enquiry Management',
    displayLabel: 'Enquiry Management',
    mobileLabel: 'Enquiries',
    Icon: Smartphone,
    posClass: 'badge-pos-enquiry',
    animClass: 'badge-anim-5',
    mobileGroup: 2,
    placement: 'placement-center',
    shortDesc: 'Track prospective guest leads and convert phone/walk-in enquiries directly into bookings.',
    benefits: [
      'Organized pipeline for dates, guest counts, and room budgets',
      'Convert enquiries into confirmed reservations with one click',
      'Follow-up reminders to boost direct booking conversions'
    ]
  },
  {
    id: 'invoicing',
    title: 'Effortless Invoicing',
    displayLabel: 'Effortless Invoicing',
    mobileLabel: 'Invoicing',
    Icon: FileText,
    posClass: 'badge-pos-invoicing',
    animClass: 'badge-anim-6',
    mobileGroup: 0,
    placement: 'placement-center',
    shortDesc: 'Generate professional, GST-compliant tax invoices and advance receipts in seconds.',
    benefits: [
      'Instant branded PDF generation with download & print',
      'Accurate tax split (CGST, SGST, IGST) and itemized charges',
      'Automated custom sequential invoice numbering'
    ]
  },
  {
    id: 'whatsapp',
    title: 'Instant WhatsApp Updates',
    displayLabel: 'WhatsApp Updates',
    mobileLabel: 'WhatsApp',
    Icon: MessageCircle,
    posClass: 'badge-pos-whatsapp',
    animClass: 'badge-anim-7',
    mobileGroup: 1,
    placement: 'placement-right',
    shortDesc: 'Launch pre-composed booking confirmations and payment receipts straight to guest WhatsApp.',
    benefits: [
      'One-click pre-filled WhatsApp chat launch from any device',
      'Personalized guest greeting with booking summary and link',
      'Zero monthly integration costs or complex messaging API packs'
    ]
  }
];

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

  // Interactive Feature Detail Card State & Handlers (Stage 9A.7)
  const [activeFeatureId, setActiveFeatureId] = useState(null);
  const [isPinned, setIsPinned] = useState(false);
  const openTimerRef = useRef(null);
  const closeTimerRef = useRef(null);
  const badgeRefs = useRef({});

  const closeCard = (returnFocus = false) => {
    if (openTimerRef.current) {
      clearTimeout(openTimerRef.current);
      openTimerRef.current = null;
    }
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
    const prevId = activeFeatureId;
    setActiveFeatureId(null);
    setIsPinned(false);
    if (returnFocus && prevId && badgeRefs.current[prevId]) {
      try {
        badgeRefs.current[prevId].focus();
      } catch (e) {}
    }
  };

  const handleBadgeMouseEnter = (id) => {
    if (typeof window !== 'undefined' && window.innerWidth <= 768) return;
    if (isPinned) return;
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
    if (activeFeatureId === id) return;

    if (openTimerRef.current) clearTimeout(openTimerRef.current);
    openTimerRef.current = setTimeout(() => {
      setActiveFeatureId(id);
    }, 180);
  };

  const handleBadgeMouseLeave = () => {
    if (typeof window !== 'undefined' && window.innerWidth <= 768) return;
    if (isPinned) return;
    if (openTimerRef.current) {
      clearTimeout(openTimerRef.current);
      openTimerRef.current = null;
    }
    if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    closeTimerRef.current = setTimeout(() => {
      setActiveFeatureId(null);
    }, 220);
  };

  const handleCardMouseEnter = () => {
    if (typeof window !== 'undefined' && window.innerWidth <= 768) return;
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  };

  const handleCardMouseLeave = () => {
    if (typeof window !== 'undefined' && window.innerWidth <= 768) return;
    if (isPinned) return;
    if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    closeTimerRef.current = setTimeout(() => {
      setActiveFeatureId(null);
    }, 200);
  };

  const handleBadgeClick = (id) => {
    if (activeFeatureId === id && isPinned) {
      closeCard(false);
    } else {
      if (openTimerRef.current) clearTimeout(openTimerRef.current);
      if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
      setActiveFeatureId(id);
      setIsPinned(true);
    }
  };

  const handleMobileBadgeClick = (id) => {
    if (activeFeatureId === id) {
      closeCard(false);
    } else {
      setActiveFeatureId(id);
      setIsPinned(true);
    }
  };

  // Keyboard Escape & Outside Click Listeners
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && activeFeatureId !== null) {
        closeCard(true);
      }
    };
    const handleClickOutside = (e) => {
      if (activeFeatureId !== null) {
        if (!e.target.closest('.strip-feature-btn') && 
            !e.target.closest('.mobile-feature-grid-btn') && 
            !e.target.closest('.inline-feature-panel')) {
          closeCard(false);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('click', handleClickOutside);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('click', handleClickOutside);
    };
  }, [activeFeatureId]);

  // Stage 9A.12: Screenshot Lightbox State & Handlers
  const [lightbox, setLightbox] = useState({ isOpen: false, type: 'web', index: 0 });
  const lightboxTriggerRef = useRef(null);
  const lightboxModalRef = useRef(null);
  const touchStartXRef = useRef(null);

  const openLightbox = (type, index = null, triggerEl = null) => {
    lightboxTriggerRef.current = triggerEl || document.activeElement;
    const initialIndex = index !== null ? index : (type === 'web' ? webIdx : mobileIdx);
    setLightbox({ isOpen: true, type, index: initialIndex });
  };

  const closeLightbox = () => {
    setLightbox(prev => ({ ...prev, isOpen: false }));
    if (lightboxTriggerRef.current) {
      try {
        lightboxTriggerRef.current.focus();
      } catch (e) {}
    }
  };

  const nextLightboxSlide = () => {
    setLightbox(prev => {
      const list = prev.type === 'web' ? webImages : mobileImages;
      if (list.length <= 1) return prev;
      const nextIdx = (prev.index + 1) % list.length;
      if (prev.type === 'web') setWebIdx(nextIdx);
      else setMobileIdx(nextIdx);
      return { ...prev, index: nextIdx };
    });
  };

  const prevLightboxSlide = () => {
    setLightbox(prev => {
      const list = prev.type === 'web' ? webImages : mobileImages;
      if (list.length <= 1) return prev;
      const prevIdx = (prev.index - 1 + list.length) % list.length;
      if (prev.type === 'web') setWebIdx(prevIdx);
      else setMobileIdx(prevIdx);
      return { ...prev, index: prevIdx };
    });
  };

  // Body scroll lock and keyboard navigation for Lightbox
  useEffect(() => {
    if (!lightbox.isOpen) return;

    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        closeLightbox();
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        nextLightboxSlide();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        prevLightboxSlide();
      } else if (e.key === 'Tab') {
        if (!lightboxModalRef.current) return;
        const focusable = lightboxModalRef.current.querySelectorAll(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = originalOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [lightbox.isOpen, webImages.length, mobileImages.length]);

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
          padding: 2.5rem 1.25rem 7.5rem 1.25rem;
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
        .desktop-only { display: block; }
        .mobile-only { display: none !important; }

        @media (max-width: 768px) {
          .desktop-only { display: none !important; }
          .mobile-only { display: flex !important; }
        }

        /* Showcase Mockup Layout (Stage 9A.8 - Unified Web + Mobile) */
        .mockup-container {
          position: relative;
          width: 100%;
          max-width: 1140px;
          margin: 0 auto;
          margin-top: 2.5rem;
          z-index: 10;
        }
        .unified-showcase-container {
          width: 100%;
          position: relative;
          display: flex;
          flex-direction: column;
        }
        .unified-showcase-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 12px;
          width: 100%;
          box-sizing: border-box;
        }
        .showcase-header-mobile-group {
          display: flex;
          align-items: center;
          gap: 8px;
          white-space: nowrap;
          flex-shrink: 0;
          margin-right: 2.5%;
        }
        .unified-screens-frame {
          position: relative;
          width: 100%;
        }
        .mockup-label-badge {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          padding: 5px 14px;
          background: rgba(9, 23, 29, 0.88);
          border: 1px solid rgba(52, 211, 153, 0.35);
          border-radius: 9999px;
          color: #f8fafc;
          font-size: 0.78rem;
          font-weight: 600;
          letter-spacing: 0.02em;
          backdrop-filter: blur(8px);
          -webkit-backdrop-filter: blur(8px);
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
          user-select: none;
          pointer-events: auto;
          white-space: nowrap;
          flex-shrink: 0;
        }
        .web-label-badge {
          margin-bottom: 0;
        }
        .mobile-label-badge {
          margin-bottom: 0;
          font-size: 0.74rem;
          padding: 4px 12px;
          white-space: nowrap;
        }
        .mockup-label-icon {
          color: #34d399;
          display: inline-flex;
          align-items: center;
          justify-content: center;
        }
        .web-mockup {
          width: 100%;
          border-radius: 16px;
          box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.4), 0 0 0 1px rgba(0, 0, 0, 0.08);
          border: 1px solid #cbd5e1;
          background: #0f172a;
          overflow: hidden;
          position: relative;
          display: flex;
          flex-direction: column;
          z-index: 5;
        }
        .web-browser-chrome {
          background: #e2e8f0;
          padding: 6px 14px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          border-bottom: 1px solid #cbd5e1;
          user-select: none;
          flex-shrink: 0;
          box-sizing: border-box;
          height: 30px;
        }
        .web-browser-dots {
          display: flex;
          gap: 7px;
          align-items: center;
        }
        .mockup-lightbox-btn {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          background: rgba(15, 23, 42, 0.08);
          border: 1px solid rgba(15, 23, 42, 0.18);
          border-radius: 6px;
          padding: 2px 8px;
          font-size: 0.7rem;
          font-weight: 600;
          color: #334155;
          cursor: pointer;
          transition: all 0.2s ease;
        }
        .mockup-lightbox-btn:hover {
          background: #0f172a;
          color: #ffffff;
          border-color: #0f172a;
        }
        .web-slider-screen {
          width: 100%;
          aspect-ratio: 1919 / 1006;
          background: #0f172a;
          position: relative;
          overflow: hidden;
          display: flex;
          align-items: center;
          justify-content: center;
          color: #94a3b8;
        }
        .web-zoom-pill {
          position: absolute;
          top: 12px;
          right: calc(23.5% + 14px);
          z-index: 12;
          display: inline-flex;
          align-items: center;
          gap: 5px;
          background: rgba(15, 23, 42, 0.78);
          border: 1px solid rgba(52, 211, 153, 0.35);
          color: #e2e8f0;
          font-size: 0.72rem;
          font-weight: 500;
          padding: 4px 10px;
          border-radius: 20px;
          backdrop-filter: blur(6px);
          opacity: 0;
          transform: translateY(-4px);
          transition: all 0.2s ease;
          pointer-events: none;
        }
        .web-slider-screen:hover .web-zoom-pill {
          opacity: 0.95;
          transform: translateY(0);
        }
        @media (max-width: 768px) {
          .web-zoom-pill {
            display: none;
          }
        }
        .phone-header-row {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          pointer-events: auto;
        }
        .phone-lightbox-btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 26px;
          height: 26px;
          position: relative;
          background: rgba(15, 23, 42, 0.88);
          border: 1px solid rgba(52, 211, 153, 0.45);
          border-radius: 7px;
          color: #34d399;
          cursor: pointer;
          backdrop-filter: blur(4px);
          -webkit-backdrop-filter: blur(4px);
          transition: all 0.2s ease;
          flex-shrink: 0;
        }
        .phone-lightbox-btn::before {
          content: '';
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          min-width: 44px;
          min-height: 44px;
          width: 100%;
          height: 100%;
        }
        .phone-lightbox-btn:hover {
          background: #047857;
          color: #ffffff;
          border-color: #34d399;
          transform: scale(1.06);
        }
        .phone-lightbox-btn:focus-visible {
          outline: 2px solid #34d399;
          outline-offset: 2px;
        }
        .unified-phone-wrapper {
          position: absolute;
          right: 2.5%;
          bottom: 0%;
          width: 21.5%;
          max-width: 240px;
          min-width: 135px;
          z-index: 25;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 6px;
          pointer-events: none;
          filter: drop-shadow(0 12px 24px rgba(0, 0, 0, 0.45));
        }
        .mobile-mockup {
          width: 100%;
          aspect-ratio: 1080 / 2400;
          background: #0f172a;
          border-radius: 26px;
          box-shadow: 0 4px 16px rgba(0, 0, 0, 0.35), 0 0 0 1px rgba(255, 255, 255, 0.15);
          border: 5px solid #1e293b;
          overflow: hidden;
          position: relative;
          z-index: 25;
          pointer-events: auto;
          transition: transform 0.25s ease, box-shadow 0.25s ease;
        }
        .mobile-mockup:hover {
          transform: translateY(-2px);
          box-shadow: 0 8px 24px rgba(0, 0, 0, 0.45), 0 0 0 1px rgba(52, 211, 153, 0.35);
        }
        .mobile-mockup:focus-visible {
          outline: 2px solid #34d399;
          outline-offset: 3px;
        }

        .web-nav-arrow {
          position: absolute;
          top: 50%;
          transform: translateY(-50%);
          z-index: 15;
          width: 36px;
          height: 36px;
          border-radius: 50%;
          background: rgba(15, 23, 42, 0.7);
          border: 1px solid rgba(255, 255, 255, 0.25);
          color: #ffffff;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          backdrop-filter: blur(4px);
          box-shadow: 0 4px 10px rgba(0, 0, 0, 0.25);
          transition: all 0.2s ease;
        }
        .web-nav-arrow:hover {
          background: rgba(15, 23, 42, 0.9);
          border-color: rgba(52, 211, 153, 0.6);
          transform: translateY(-50%) scale(1.05);
        }
        .web-nav-prev {
          left: 14px;
        }
        .web-nav-next {
          right: calc(23.5% + 14px);
        }

        .web-slider-dots {
          position: absolute;
          bottom: 12px;
          left: 39%;
          transform: translateX(-50%);
          z-index: 15;
          display: flex;
          align-items: center;
          gap: 5px;
          background: rgba(15, 23, 42, 0.75);
          padding: 5px 12px;
          border-radius: 20px;
          backdrop-filter: blur(4px);
          border: 1px solid rgba(255, 255, 255, 0.15);
        }

        .mobile-slider-dots {
          position: absolute;
          bottom: 8px;
          left: 50%;
          transform: translateX(-50%);
          z-index: 10;
          display: flex;
          align-items: center;
          gap: 3px;
          background: rgba(15, 23, 42, 0.8);
          padding: 3px 8px;
          border-radius: 14px;
          backdrop-filter: blur(4px);
        }

        .image-slider {
          position: absolute;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          object-fit: contain;
          object-position: center top;
          opacity: 0;
          z-index: 1;
          pointer-events: none;
          image-rendering: auto;
          image-rendering: -webkit-optimize-contrast;
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
          .mockup-container,
          .mobile-mockup {
            animation: none !important;
          }
        }

        /* Dedicated Hero Feature Strip Below Screenshots (Stage 9A.7) */
        .hero-feature-strip {
          width: 100%;
          max-width: 1140px;
          margin: 2rem auto 0 auto;
          position: relative;
          z-index: 25;
        }
        @media (min-width: 1200px) {
          .hero-feature-strip {
            display: grid !important;
            grid-template-columns: repeat(7, minmax(0, 1fr)) !important;
            gap: 10px !important;
          }
          .strip-feature-item {
            width: 100%;
            display: flex;
          }
          .strip-feature-btn {
            width: 100%;
            justify-content: center;
            padding: 8px 6px;
            font-size: 0.78rem;
          }
        }
        @media (min-width: 769px) and (max-width: 1199px) {
          .hero-feature-strip {
            display: flex !important;
            flex-wrap: wrap !important;
            justify-content: center !important;
            gap: 10px 12px !important;
            max-width: 960px !important;
          }
          .strip-feature-item {
            flex: 0 0 calc(25% - 12px);
            max-width: calc(25% - 12px);
            display: flex;
          }
          .strip-feature-item:nth-child(n+5) {
            flex: 0 0 calc(30% - 12px);
            max-width: calc(30% - 12px);
          }
          .strip-feature-btn {
            width: 100%;
            justify-content: center;
            padding: 8px 10px;
            font-size: 0.78rem;
          }
        }
        .strip-feature-btn {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 9px 14px;
          background: linear-gradient(135deg, rgba(13, 30, 24, 0.84) 0%, rgba(8, 20, 16, 0.90) 100%);
          border: 1px solid rgba(52, 211, 153, 0.22);
          border-radius: 13px;
          color: #e2e8f0;
          font-size: 0.81rem;
          font-weight: 500;
          letter-spacing: 0.01em;
          backdrop-filter: blur(10px);
          -webkit-backdrop-filter: blur(10px);
          box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.08), 0 4px 14px rgba(0, 0, 0, 0.3);
          cursor: pointer;
          transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
          white-space: nowrap;
          position: relative;
          min-height: 40px;
          box-sizing: border-box;
        }
        .strip-feature-btn:hover {
          background: linear-gradient(135deg, rgba(18, 44, 35, 0.94) 0%, rgba(11, 29, 23, 0.96) 100%);
          border-color: rgba(52, 211, 153, 0.58);
          color: #ffffff;
          box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.14), 0 6px 18px rgba(0, 0, 0, 0.38), 0 0 12px rgba(16, 185, 129, 0.18);
          transform: translateY(-2px);
        }
        .strip-feature-btn:focus-visible {
          outline: 2px solid #34d399;
          outline-offset: 2px;
        }
        .strip-feature-btn.is-active {
          background: linear-gradient(135deg, rgba(16, 55, 40, 0.98) 0%, rgba(9, 36, 26, 0.99) 100%);
          border-color: rgba(52, 211, 153, 0.82);
          color: #ffffff;
          box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.22), 0 6px 20px rgba(0, 0, 0, 0.45), 0 0 16px rgba(16, 185, 129, 0.26);
          transform: translateY(-1px);
        }
        .strip-feature-btn.is-active::after {
          content: '';
          position: absolute;
          bottom: -6px;
          left: 50%;
          transform: translateX(-50%);
          width: 0;
          height: 0;
          border-left: 5px solid transparent;
          border-right: 5px solid transparent;
          border-top: 5px solid rgba(52, 211, 153, 0.85);
        }
        .strip-feature-icon {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          color: #34d399;
          flex-shrink: 0;
          transition: transform 0.2s ease;
        }
        .strip-feature-btn:hover .strip-feature-icon,
        .strip-feature-btn.is-active .strip-feature-icon {
          transform: scale(1.08);
        }

        /* Responsive Mobile Feature Grid (< 768px - Stage 9A.9 2+2+3 Layout) */
        .mobile-feature-grid {
          display: none;
          grid-template-columns: repeat(6, 1fr);
          gap: 8px;
          width: 100%;
          max-width: 460px;
          margin: 1.25rem auto 0 auto;
          position: relative;
          z-index: 25;
          box-sizing: border-box;
        }
        .mobile-feature-grid-btn {
          grid-column: span 3; /* Rows 1 & 2: 2 cards per row (items 1-4) */
          min-height: 44px;
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 8px 12px;
          background: linear-gradient(135deg, rgba(13, 30, 24, 0.86) 0%, rgba(8, 20, 16, 0.92) 100%);
          border: 1px solid rgba(52, 211, 153, 0.22);
          border-radius: 13px;
          color: #e2e8f0;
          font-size: 0.76rem;
          font-weight: 500;
          cursor: pointer;
          text-align: left;
          backdrop-filter: blur(10px);
          -webkit-backdrop-filter: blur(10px);
          box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.08), 0 3px 10px rgba(0, 0, 0, 0.28);
          transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
          box-sizing: border-box;
          position: relative;
        }
        /* Row 3: 3 cards per row (items 5, 6, 7: Enquiries, Invoicing, WhatsApp) */
        .mobile-feature-grid-btn:nth-child(n+5) {
          grid-column: span 2;
          padding: 8px 6px;
          font-size: 0.72rem;
          justify-content: center;
          text-align: center;
          gap: 5px;
        }
        .mobile-feature-grid-btn:hover {
          background: linear-gradient(135deg, rgba(18, 44, 35, 0.94) 0%, rgba(11, 29, 23, 0.96) 100%);
          border-color: rgba(52, 211, 153, 0.55);
          color: #ffffff;
        }
        .mobile-feature-grid-btn:focus-visible {
          outline: 2px solid #34d399;
          outline-offset: 2px;
        }
        .mobile-feature-grid-btn.is-selected {
          background: linear-gradient(135deg, rgba(16, 55, 40, 0.98) 0%, rgba(9, 36, 26, 0.99) 100%);
          border-color: rgba(52, 211, 153, 0.82);
          color: #ffffff;
          box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.2), 0 4px 14px rgba(0, 0, 0, 0.4), 0 0 14px rgba(16, 185, 129, 0.25);
        }
        .mobile-feature-icon {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          color: #34d399;
          flex-shrink: 0;
        }
        .mobile-feature-label {
          flex: 1;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        /* Screenshot Lightbox Modal (Stage 9A.12) */
        .staypilot-lightbox-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          z-index: 99999;
          background: rgba(4, 12, 10, 0.94);
          backdrop-filter: blur(14px);
          -webkit-backdrop-filter: blur(14px);
          display: flex;
          align-items: center;
          justify-content: center;
          padding: max(16px, env(safe-area-inset-top)) max(16px, env(safe-area-inset-right)) max(16px, env(safe-area-inset-bottom)) max(16px, env(safe-area-inset-left));
          box-sizing: border-box;
          animation: lightboxFadeIn 0.2s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
        @keyframes lightboxFadeIn {
          from { opacity: 0; transform: scale(0.98); }
          to { opacity: 1; transform: scale(1); }
        }
        .lightbox-dialog-shell {
          width: 100%;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: space-between;
          position: relative;
          box-sizing: border-box;
          max-height: 96vh;
        }
        .shell-web {
          max-width: 1360px;
        }
        .shell-mobile {
          max-width: 440px;
        }
        .lightbox-header {
          width: 100%;
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 8px 12px 14px 12px;
          box-sizing: border-box;
          color: #ffffff;
        }
        .lightbox-header-info {
          display: flex;
          align-items: center;
          gap: 12px;
        }
        .lightbox-badge {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          background: rgba(16, 185, 129, 0.18);
          border: 1px solid rgba(52, 211, 153, 0.4);
          color: #34d399;
          font-size: 0.8rem;
          font-weight: 600;
          padding: 4px 10px;
          border-radius: 9999px;
        }
        .lightbox-counter {
          font-size: 0.85rem;
          font-weight: 500;
          color: #94a3b8;
          letter-spacing: 0.02em;
        }
        .lightbox-close-btn {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          background: rgba(255, 255, 255, 0.08);
          border: 1px solid rgba(255, 255, 255, 0.2);
          color: #ffffff;
          padding: 6px 14px;
          border-radius: 8px;
          cursor: pointer;
          font-size: 0.82rem;
          font-weight: 500;
          transition: all 0.2s ease;
        }
        .lightbox-close-btn:hover {
          background: rgba(239, 68, 68, 0.85);
          border-color: #ef4444;
          color: #ffffff;
        }
        .lightbox-stage {
          width: 100%;
          display: flex;
          align-items: center;
          justify-content: center;
          position: relative;
          min-height: 0;
          flex: 1;
        }
        .lightbox-nav-arrow {
          position: absolute;
          top: 50%;
          transform: translateY(-50%);
          z-index: 100;
          width: 44px;
          height: 44px;
          border-radius: 50%;
          background: rgba(15, 23, 42, 0.78);
          border: 1px solid rgba(52, 211, 153, 0.35);
          color: #ffffff;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          backdrop-filter: blur(8px);
          transition: all 0.2s ease;
        }
        .lightbox-nav-arrow:hover {
          background: #047857;
          border-color: #34d399;
          transform: translateY(-50%) scale(1.08);
        }
        .lightbox-nav-prev {
          left: -12px;
        }
        .lightbox-nav-next {
          right: -12px;
        }
        @media (max-width: 768px) {
          .lightbox-nav-prev { left: 4px; }
          .lightbox-nav-next { right: 4px; }
          .lightbox-close-label { display: none; }
        }
        .lightbox-web-frame {
          width: 100%;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .lightbox-web-img {
          max-width: 100%;
          max-height: 74vh;
          width: auto;
          height: auto;
          object-fit: contain;
          border-radius: 10px;
          box-shadow: 0 20px 50px rgba(0, 0, 0, 0.7);
          border: 1px solid rgba(255, 255, 255, 0.1);
        }
        .lightbox-mobile-frame {
          max-width: 340px;
          width: 100%;
          aspect-ratio: 1080 / 2400;
          max-height: 78vh;
          background: #0f172a;
          border-radius: 28px;
          border: 4px solid #1e293b;
          box-shadow: 0 20px 50px rgba(0, 0, 0, 0.7), 0 0 0 1px rgba(255, 255, 255, 0.1);
          overflow: hidden;
          position: relative;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        @media (max-width: 640px) {
          .lightbox-mobile-frame {
            max-width: 290px;
            max-height: 72vh;
            border-width: 3px;
            border-radius: 22px;
          }
          .lightbox-mobile-notch {
            width: 32px !important;
            height: 3.5px !important;
            top: 4px !important;
          }
        }
        .lightbox-mobile-notch {
          position: absolute;
          top: 6px;
          left: 50%;
          transform: translateX(-50%);
          width: 44px;
          height: 4px;
          background: #334155;
          border-radius: 2px;
          z-index: 20;
          pointer-events: none;
        }
        .lightbox-mobile-img {
          width: 100%;
          height: 100%;
          object-fit: contain;
        }
        .lightbox-footer {
          width: 100%;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 8px;
          padding-top: 12px;
        }
        .lightbox-dots-container {
          display: flex;
          align-items: center;
          gap: 6px;
        }
        .lightbox-dot-btn {
          width: 8px;
          height: 8px;
          border-radius: 4px;
          background: rgba(255, 255, 255, 0.45);
          border: 1px solid rgba(255, 255, 255, 0.2);
          padding: 0;
          cursor: pointer;
          transition: all 0.25s ease;
        }
        .lightbox-dot-btn:hover {
          background: rgba(255, 255, 255, 0.85);
          border-color: rgba(255, 255, 255, 0.5);
        }
        .lightbox-dot-btn.active {
          width: 24px;
          background: #34d399;
          border-color: #34d399;
          box-shadow: 0 0 10px rgba(52, 211, 153, 0.7);
        }
        .lightbox-hint {
          font-size: 0.74rem;
          color: #64748b;
          user-select: none;
        }
        .lightbox-hint kbd {
          background: rgba(255, 255, 255, 0.08);
          padding: 2px 5px;
          border-radius: 4px;
          border: 1px solid rgba(255, 255, 255, 0.12);
          color: #94a3b8;
          font-family: inherit;
        }
        @media (max-width: 640px) {
          .lightbox-hint { display: none; }
        }

        @media (prefers-reduced-motion: reduce) {
          .strip-feature-btn,
          .mobile-feature-grid-btn,
          .staypilot-lightbox-overlay,
          .lightbox-dialog-shell,
          .inline-feature-panel {
            transition: none !important;
            transform: none !important;
            animation: none !important;
          }
        }

        /* INLINE EXPANDABLE FEATURE DETAIL PANEL (Stage 9A.7) */
        .inline-feature-panel {
          width: 100%;
          max-width: 1140px;
          margin: 1.25rem auto 0 auto;
          background: rgba(9, 23, 29, 0.96);
          border: 1px solid rgba(52, 211, 153, 0.42);
          border-radius: 16px;
          padding: 1.25rem 1.75rem;
          box-shadow: 0 15px 35px -5px rgba(0, 0, 0, 0.6), 0 0 25px rgba(16, 185, 129, 0.16);
          backdrop-filter: blur(16px);
          -webkit-backdrop-filter: blur(16px);
          animation: panelSlideDown 0.22s cubic-bezier(0.16, 1, 0.3, 1) forwards;
          position: relative;
          z-index: 30;
          box-sizing: border-box;
        }
        @keyframes panelSlideDown {
          from { opacity: 0; transform: translateY(-6px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .inline-panel-inner {
          display: flex;
          flex-direction: column;
          gap: 0.85rem;
        }
        .inline-panel-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
        }
        .inline-panel-title-group {
          display: flex;
          align-items: center;
          gap: 12px;
        }
        .inline-panel-icon-box {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 32px;
          height: 32px;
          border-radius: 9px;
          background: rgba(16, 185, 129, 0.16);
          border: 1px solid rgba(52, 211, 153, 0.35);
          color: #34d399;
          flex-shrink: 0;
        }
        .inline-panel-title {
          font-size: 1rem;
          font-weight: 700;
          color: #ffffff;
          letter-spacing: -0.01em;
        }
        .inline-panel-close-btn {
          background: rgba(255, 255, 255, 0.06);
          border: 1px solid rgba(255, 255, 255, 0.14);
          color: #94a3b8;
          width: 32px;
          height: 32px;
          border-radius: 8px;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.2s ease;
        }
        .inline-panel-close-btn:hover {
          background: rgba(255, 255, 255, 0.12);
          color: #ffffff;
          border-color: rgba(52, 211, 153, 0.5);
        }
        .inline-panel-desc {
          font-size: 0.86rem;
          line-height: 1.5;
          color: #cbd5e1;
          margin: 0;
          text-align: left;
        }
        .inline-panel-benefits {
          list-style: none;
          padding: 0.75rem 0 0 0;
          margin: 0;
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 1rem;
          border-top: 1px solid rgba(255, 255, 255, 0.08);
        }
        .inline-panel-benefit-item {
          display: flex;
          align-items: flex-start;
          gap: 8px;
          font-size: 0.79rem;
          line-height: 1.4;
          color: #e2e8f0;
          text-align: left;
        }
        .inline-panel-check {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          color: #34d399;
          margin-top: 2px;
          flex-shrink: 0;
        }

        @media (max-width: 1024px) and (min-width: 769px) {
          .mockup-container {
            max-width: 95%;
            margin-top: 2rem;
          }
          .showcase-screens {
            gap: 1rem;
          }
          .inline-panel-benefits {
            grid-template-columns: repeat(3, 1fr);
            gap: 0.75rem;
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .inline-feature-panel,
          .strip-feature-btn,
          .mobile-feature-grid-btn {
            animation: none !important;
            transition: none !important;
          }
        }

        @media (max-width: 768px) {
          .hero-bg {
            padding: 2rem 1rem 6.8rem 1rem !important;
          }
          .desktop-only { display: none !important; }
          .mobile-only { display: grid !important; }
          .hero-feature-strip,
          .strip-feature-item,
          .strip-feature-btn {
            display: none !important;
          }
          .mobile-feature-grid {
            display: grid !important;
          }
          .unified-showcase-header {
            margin-bottom: 8px;
          }
          .web-label-badge {
            padding: 3px 10px;
            font-size: 0.72rem;
          }
          .web-browser-chrome {
            padding: 5px 10px !important;
            gap: 5px !important;
          }
          .web-browser-chrome div {
            width: 8px !important;
            height: 8px !important;
          }
          .unified-phone-wrapper {
            right: 2%;
            bottom: 0%;
            width: 25%;
            max-width: 110px;
            min-width: 78px;
            gap: 4px;
            filter: drop-shadow(0 6px 14px rgba(0, 0, 0, 0.45)) !important;
          }
          .unified-showcase-header {
            display: flex !important;
            align-items: center !important;
            justify-content: space-between !important;
            margin-bottom: 10px !important;
            gap: 6px !important;
            padding: 0 2px !important;
            width: 100% !important;
            box-sizing: border-box !important;
          }
          .showcase-header-mobile-group {
            margin-right: 0 !important;
            gap: 6px !important;
          }
          .web-label-badge {
            padding: 4px 10px !important;
            font-size: 0.72rem !important;
          }
          .mobile-label-badge {
            padding: 4px 10px !important;
            font-size: 0.72rem !important;
          }
          .phone-lightbox-btn {
            width: 26px !important;
            height: 26px !important;
          }
          .mobile-mockup {
            border-width: 3px !important;
            border-radius: 16px !important;
          }
          .web-nav-arrow {
            width: 26px;
            height: 26px;
          }
          .web-nav-prev {
            left: 6px;
          }
          .web-nav-next {
            right: calc(27% + 8px);
          }
          .web-slider-dots {
            bottom: 6px;
            left: 35%;
            padding: 3px 8px;
            gap: 3px;
          }
          .web-slider-dots button {
            height: 4px !important;
          }
          .web-slider-dots span {
            font-size: 8px !important;
            margin-left: 3px !important;
          }
          .mobile-slider-dots {
            bottom: 4px;
            padding: 2px 6px;
          }
          .mockup-container {
            margin-top: 1.25rem !important;
            display: flex;
            flex-direction: column;
            align-items: center;
          }
          .hero-title { font-size: 2.3rem !important; line-height: 1.15 !important; margin-bottom: 0.75rem !important; }
          .inline-feature-panel {
            max-width: 460px;
            padding: 1rem 1.15rem;
            margin-top: 0.85rem;
            border-radius: 14px;
          }
          .inline-panel-title {
            font-size: 0.95rem;
          }
          .inline-panel-desc {
            font-size: 0.82rem;
          }
          .inline-panel-benefits {
            grid-template-columns: 1fr;
            gap: 0.6rem;
          }
          .inline-panel-benefit-item {
            font-size: 0.76rem;
          }
        }
        @media (max-width: 480px) {
          .unified-phone-wrapper {
            right: 1.5%;
            width: 26%;
            max-width: 95px;
            min-width: 70px;
          }
          .web-nav-next {
            right: calc(28% + 6px);
          }
          .web-slider-dots {
            left: 36%;
          }
          .mobile-feature-grid {
            max-width: 100%;
            gap: 6px;
          }
          .mobile-feature-grid-btn {
            padding: 8px 8px;
            font-size: 0.72rem;
            gap: 6px;
          }
          .mobile-feature-grid-btn:nth-child(n+5) {
            padding: 8px 4px;
            font-size: 0.68rem;
            gap: 4px;
          }
        }
        @media (max-width: 360px) {
          .unified-phone-wrapper {
            right: 1%;
            width: 26%;
            max-width: 80px;
            min-width: 65px;
          }
          .web-nav-next {
            right: calc(28% + 4px);
          }
          .web-slider-dots {
            left: 34%;
          }
          .unified-showcase-header {
            margin-bottom: 8px !important;
            gap: 4px !important;
            padding: 0 !important;
          }
          .web-label-badge {
            padding: 3px 8px !important;
            font-size: 0.67rem !important;
            gap: 4px !important;
          }
          .mobile-label-badge {
            padding: 3px 8px !important;
            font-size: 0.67rem !important;
            gap: 4px !important;
          }
          .phone-lightbox-btn {
            width: 24px !important;
            height: 24px !important;
          }
          .mobile-feature-grid {
            gap: 5px !important;
          }
          .mobile-feature-grid-btn {
            min-height: 44px;
            padding: 6px 5px !important;
            font-size: 0.67rem !important;
            gap: 4px !important;
          }
          .mobile-feature-grid-btn:nth-child(n+5) {
            padding: 6px 2px !important;
            font-size: 0.63rem !important;
            gap: 3px !important;
          }
          .mobile-feature-icon svg {
            width: 13px !important;
            height: 13px !important;
          }
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
      <section className="hero-bg" style={{ position: 'relative', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <div style={{ maxWidth: '800px', margin: '0 auto', zIndex: 2 }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', background: 'rgba(52, 211, 153, 0.2)', color: '#34d399', padding: '6px 16px', borderRadius: '30px', fontSize: '0.9rem', fontWeight: 600, marginBottom: '1.5rem' }}>
            <Sparkles size={16} /> New: StayPilot Android App is Live!
          </div>
          
          <h1 className="hero-title gradient-text" style={{ fontSize: '4.5rem', fontWeight: 800, margin: '0 0 1.25rem 0', letterSpacing: '-0.03em', lineHeight: 1.1 }}>
            Know Your Bookings.<br/>Know Your Numbers.
          </h1>
          
          <p style={{ fontSize: '1.25rem', color: '#94a3b8', margin: '0 auto 1.25rem auto', lineHeight: 1.6, maxWidth: '600px' }}>
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
        <div className="mockup-container">
          {/* GLOW EFFECT */}
          <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', width: '80%', height: '80%', background: 'radial-gradient(circle, rgba(52, 211, 153, 0.4) 0%, rgba(56, 189, 248, 0.1) 50%, transparent 70%)', filter: 'blur(60px)', zIndex: 0 }}></div>

          {/* UNIFIED WEB + MOBILE SHOWCASE CONTAINER (Stage 9A.8 / 9A.12.1) */}
          <div className="unified-showcase-container">
            <div className="unified-showcase-header">
              <div className="mockup-label-badge web-label-badge" aria-label="Web View preview">
                <Monitor size={14} className="mockup-label-icon" />
                <span>Web View</span>
              </div>
              <div className="showcase-header-mobile-group">
                <div className="mockup-label-badge mobile-label-badge" aria-label="Mobile App preview">
                  <Smartphone size={12} className="mockup-label-icon" />
                  <span>Mobile App</span>
                </div>
                <button
                  type="button"
                  className="phone-lightbox-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    openLightbox('mobile', mobileIdx, e.currentTarget);
                  }}
                  aria-label="Expand Mobile App screenshot"
                  title="Expand Mobile App screenshot"
                >
                  <Maximize2 size={12} />
                </button>
              </div>
            </div>

            <div className="unified-screens-frame">
              {/* Web Browser Mockup */}
              <div 
                className="web-mockup"
                onMouseEnter={() => setIsWebHovered(true)}
                onMouseLeave={() => setIsWebHovered(false)}
              >
                <div className="web-browser-chrome">
                  <div className="web-browser-dots">
                    <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#ef4444' }}></div>
                    <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#f59e0b' }}></div>
                    <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#10b981' }}></div>
                  </div>
                  <button
                    type="button"
                    className="mockup-lightbox-btn web-lightbox-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      openLightbox('web', webIdx, e.currentTarget);
                    }}
                    aria-label="Open Web Dashboard in full-screen lightbox"
                    title="Expand Web Dashboard preview"
                  >
                    <Maximize2 size={11} />
                    <span>Expand</span>
                  </button>
                </div>
                {/* WEB IMAGE SLIDER SCREEN */}
                <div 
                  className="web-slider-screen"
                  onClick={(e) => openLightbox('web', webIdx, e.currentTarget)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      openLightbox('web', webIdx, e.currentTarget);
                    }
                  }}
                  role="button"
                  tabIndex={0}
                  aria-label="View enlarged Web Dashboard screenshot"
                  style={{ cursor: 'zoom-in' }}
                  title="Click to view full-screen Web Dashboard"
                >
                  <div className="web-zoom-pill" aria-hidden="true">
                    <Maximize2 size={12} />
                    <span>Click to expand</span>
                  </div>
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
                        className="web-nav-arrow web-nav-prev"
                      >
                        <ChevronLeft size={18} />
                      </button>
                      <button 
                        type="button" 
                        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setWebIdx(prev => (prev + 1) % webImages.length); }} 
                        aria-label="Next slide"
                        className="web-nav-arrow web-nav-next"
                      >
                        <ChevronRight size={18} />
                      </button>
                    </>
                  )}

                  {/* Web Slide Indicator Dots & Counter */}
                  {webImages.length > 1 && (
                    <div className="web-slider-dots">
                      {webImages.map((_, dotIdx) => (
                        <button
                          key={dotIdx}
                          type="button"
                          onClick={(e) => { e.stopPropagation(); setWebIdx(dotIdx); }}
                          aria-label={`Jump to slide ${dotIdx + 1}`}
                          style={{ width: dotIdx === webIdx ? '16px' : '6px', height: '6px', borderRadius: '3px', background: dotIdx === webIdx ? '#10b981' : 'rgba(255,255,255,0.5)', border: 'none', padding: 0, cursor: 'pointer', transition: 'all 0.3s ease' }}
                        />
                      ))}
                      <span style={{ fontSize: '10px', color: '#ffffff', marginLeft: '5px', fontWeight: 600, letterSpacing: '0.05em' }}>
                        {webIdx + 1}/{webImages.length}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Overlapping Android Phone Mockup (at bottom-right) */}
              <div className="unified-phone-wrapper">
                <div 
                  className="mobile-mockup"
                  onClick={(e) => {
                    e.stopPropagation();
                    openLightbox('mobile', mobileIdx, e.currentTarget);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      e.stopPropagation();
                      openLightbox('mobile', mobileIdx, e.currentTarget);
                    }
                  }}
                  role="button"
                  tabIndex={0}
                  aria-label="View enlarged Mobile App screenshot"
                  style={{ cursor: 'zoom-in' }}
                  title="Click to view enlarged Mobile App screenshot"
                >
                  <div className="mobile-speaker-notch" style={{ position: 'absolute', top: 5, left: '50%', transform: 'translateX(-50%)', width: 34, height: 3.5, background: '#334155', borderRadius: 2, zIndex: 20, pointerEvents: 'none' }}></div>
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
                        <Smartphone size={28} style={{ opacity: 0.35, color: '#38bdf8' }} />
                        <span style={{ fontSize: '0.7rem', fontWeight: 600, color: '#94a3b8' }}>StayPilot Mobile App</span>
                      </div>
                    )}

                    {/* Mobile Slide Indicator Dots */}
                    {mobileImages.length > 1 && (
                      <div className="mobile-slider-dots" onClick={(e) => e.stopPropagation()}>
                        {mobileImages.map((_, dotIdx) => (
                          <button
                            key={dotIdx}
                            type="button"
                            onClick={(e) => { e.stopPropagation(); setMobileIdx(dotIdx); }}
                            aria-label={`Jump to mobile slide ${dotIdx + 1}`}
                            style={{ width: dotIdx === mobileIdx ? '12px' : '4px', height: '4px', borderRadius: '2px', background: dotIdx === mobileIdx ? '#10b981' : 'rgba(255,255,255,0.5)', border: 'none', padding: 0, cursor: 'pointer', transition: 'all 0.3s ease' }}
                          />
                        ))}
                        <span style={{ fontSize: '8px', color: '#ffffff', marginLeft: '3px', fontWeight: 600 }}>
                          {mobileIdx + 1}/{mobileImages.length}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* DEDICATED DESKTOP FEATURE STRIP (Stage 9A.7) */}
          <div className="hero-feature-strip desktop-only" role="region" aria-label="Key Product Features">
            {HERO_BADGES.map(badge => {
              const isActive = activeFeatureId === badge.id;
              return (
                <div key={`strip-${badge.id}`} className="strip-feature-item">
                  <button
                    type="button"
                    ref={el => badgeRefs.current[badge.id] = el}
                    className={`strip-feature-btn ${isActive ? 'is-active' : ''}`}
                    aria-expanded={isActive}
                    aria-controls={`feature-detail-${badge.id}`}
                    aria-label={`${badge.title}. Click to pin, hover to preview.`}
                    onMouseEnter={() => handleBadgeMouseEnter(badge.id)}
                    onMouseLeave={handleBadgeMouseLeave}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleBadgeClick(badge.id);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        handleBadgeClick(badge.id);
                      }
                    }}
                  >
                    <span className="strip-feature-icon"><badge.Icon size={15} /></span>
                    <span>{badge.displayLabel || badge.title}</span>
                  </button>
                </div>
              );
            })}
          </div>

          {/* RESPONSIVE MOBILE FEATURE GRID (Stage 9A.9 - 2+2+3 Layout, <768px) */}
          <div className="mobile-feature-grid mobile-only" role="region" aria-label="Key Product Features">
            {HERO_BADGES.map(badge => {
              const isSelected = activeFeatureId === badge.id;
              return (
                <button
                  key={`mob-${badge.id}`}
                  type="button"
                  ref={el => badgeRefs.current[`mob-${badge.id}`] = el}
                  className={`mobile-feature-grid-btn ${isSelected ? 'is-selected' : ''}`}
                  aria-expanded={isSelected}
                  aria-controls={`feature-detail-${badge.id}`}
                  aria-label={`${badge.title}. Tap to toggle details.`}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleMobileBadgeClick(badge.id);
                  }}
                >
                  <span className="mobile-feature-icon"><badge.Icon size={15} /></span>
                  <span className="mobile-feature-label">{badge.mobileLabel || badge.displayLabel || badge.title}</span>
                </button>
              );
            })}
          </div>

          {/* INLINE FEATURE DETAIL PANEL (Both Desktop & Mobile - Zero Screenshot Overlap) */}
          {activeFeatureId && (
            (() => {
              const activeBadge = HERO_BADGES.find(b => b.id === activeFeatureId);
              if (!activeBadge) return null;
              return (
                <div
                  id={`feature-detail-${activeBadge.id}`}
                  role="region"
                  aria-label={`${activeBadge.title} Details`}
                  className="inline-feature-panel"
                  onMouseEnter={handleCardMouseEnter}
                  onMouseLeave={handleCardMouseLeave}
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="inline-panel-inner">
                    <div className="inline-panel-header">
                      <div className="inline-panel-title-group">
                        <div className="inline-panel-icon-box">
                          <activeBadge.Icon size={18} />
                        </div>
                        <div>
                          <div className="inline-panel-title">{activeBadge.title}</div>
                        </div>
                      </div>
                      <button
                        type="button"
                        className="inline-panel-close-btn"
                        onClick={() => {
                          closeCard(true);
                        }}
                        aria-label="Close feature details"
                      >
                        <X size={18} />
                      </button>
                    </div>
                    
                    <p className="inline-panel-desc">{activeBadge.shortDesc}</p>
                    
                    <ul className="inline-panel-benefits">
                      {activeBadge.benefits.map((b, idx) => (
                        <li key={idx} className="inline-panel-benefit-item">
                          <span className="inline-panel-check"><Check size={13} /></span>
                          <span>{b}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              );
            })()
          )}
        </div>

        {/* SCREENSHOT LIGHTBOX MODAL (Stage 9A.12) */}
        {lightbox.isOpen && (
          <div 
            className="staypilot-lightbox-overlay"
            role="dialog"
            aria-modal="true"
            aria-label={lightbox.type === 'web' ? 'Web Dashboard Screenshot Viewer' : 'Mobile App Screenshot Viewer'}
            ref={lightboxModalRef}
            onClick={(e) => {
              if (e.target === e.currentTarget) {
                closeLightbox();
              }
            }}
          >
            <div className={`lightbox-dialog-shell ${lightbox.type === 'web' ? 'shell-web' : 'shell-mobile'}`}>
              {/* Lightbox Header Bar */}
              <div className="lightbox-header">
                <div className="lightbox-header-info">
                  <span className="lightbox-badge">
                    {lightbox.type === 'web' ? <Monitor size={14} /> : <Smartphone size={14} />}
                    <span>{lightbox.type === 'web' ? 'Web Dashboard' : 'Mobile App'}</span>
                  </span>
                  <span className="lightbox-counter">
                    {lightbox.type === 'web' 
                      ? `Slide ${lightbox.index + 1} of ${webImages.length}`
                      : `Screen ${lightbox.index + 1} of ${mobileImages.length}`}
                  </span>
                </div>
                
                <div className="lightbox-actions">
                  <button 
                    type="button" 
                    className="lightbox-close-btn"
                    onClick={closeLightbox}
                    aria-label="Close screenshot viewer"
                    autoFocus
                  >
                    <X size={18} />
                    <span className="lightbox-close-label">Close</span>
                  </button>
                </div>
              </div>

              {/* Lightbox Media Stage */}
              <div 
                className="lightbox-stage"
                onTouchStart={(e) => {
                  touchStartXRef.current = e.touches[0].clientX;
                }}
                onTouchEnd={(e) => {
                  if (touchStartXRef.current === null) return;
                  const diff = touchStartXRef.current - e.changedTouches[0].clientX;
                  if (diff > 45) {
                    nextLightboxSlide();
                  } else if (diff < -45) {
                    prevLightboxSlide();
                  }
                  touchStartXRef.current = null;
                }}
              >
                {/* Navigation Arrow Previous */}
                {((lightbox.type === 'web' && webImages.length > 1) || (lightbox.type === 'mobile' && mobileImages.length > 1)) && (
                  <button
                    type="button"
                    className="lightbox-nav-arrow lightbox-nav-prev"
                    onClick={(e) => {
                      e.stopPropagation();
                      prevLightboxSlide();
                    }}
                    aria-label="Previous image"
                  >
                    <ChevronLeft size={24} />
                  </button>
                )}

                {/* Display Current Image */}
                {lightbox.type === 'web' ? (
                  <div className="lightbox-web-frame" onClick={(e) => e.stopPropagation()}>
                    {(() => {
                      const currentUrl = webImages[lightbox.index] || '';
                      const { src, srcSet, sizes } = getWebScreenshotSrcSet(currentUrl);
                      return (
                        <img 
                          src={src} 
                          srcSet={srcSet}
                          sizes="(max-width: 768px) 96vw, (max-width: 1400px) 92vw, 1600px"
                          alt={`StayPilot Web Dashboard - View ${lightbox.index + 1}`}
                          className="lightbox-img lightbox-web-img"
                        />
                      );
                    })()}
                  </div>
                ) : (
                  <div className="lightbox-mobile-frame" onClick={(e) => e.stopPropagation()}>
                    <div className="lightbox-mobile-notch" />
                    {(() => {
                      const currentUrl = mobileImages[lightbox.index] || '';
                      const { src, srcSet, sizes } = getMobileScreenshotSrcSet(currentUrl);
                      return (
                        <img 
                          src={src} 
                          srcSet={srcSet}
                          sizes="(max-width: 480px) 90vw, 480px"
                          alt={`StayPilot Mobile App - Screen ${lightbox.index + 1}`}
                          className="lightbox-img lightbox-mobile-img"
                        />
                      );
                    })()}
                  </div>
                )}

                {/* Navigation Arrow Next */}
                {((lightbox.type === 'web' && webImages.length > 1) || (lightbox.type === 'mobile' && mobileImages.length > 1)) && (
                  <button
                    type="button"
                    className="lightbox-nav-arrow lightbox-nav-next"
                    onClick={(e) => {
                      e.stopPropagation();
                      nextLightboxSlide();
                    }}
                    aria-label="Next image"
                  >
                    <ChevronRight size={24} />
                  </button>
                )}
              </div>

              {/* Lightbox Footer with Dots & Hint */}
              <div className="lightbox-footer">
                <div className="lightbox-dots-container">
                  {(lightbox.type === 'web' ? webImages : mobileImages).map((_, dotIdx) => (
                    <button
                      key={dotIdx}
                      type="button"
                      className={`lightbox-dot-btn ${dotIdx === lightbox.index ? 'active' : ''}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        setLightbox(prev => {
                          if (prev.type === 'web') setWebIdx(dotIdx);
                          else setMobileIdx(dotIdx);
                          return { ...prev, index: dotIdx };
                        });
                      }}
                      aria-label={`Jump to ${lightbox.type === 'web' ? 'slide' : 'screen'} ${dotIdx + 1}`}
                    />
                  ))}
                </div>
                <div className="lightbox-hint">
                  <span>Use <kbd>←</kbd> <kbd>→</kbd> arrows to navigate, <kbd>ESC</kbd> to close</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Curved SVG Divider to blend into light section */}
        <div className="hero-curve-divider" style={{ position: 'absolute', bottom: 0, left: 0, width: '100%', overflow: 'hidden', lineHeight: 0, transform: 'translateY(1px)', zIndex: 0, pointerEvents: 'none' }}>
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

      {/* Dev Diagnostics HUD (Hidden by default; enabled only via ?diagnostics=true or localStorage flag during local dev) */}
      {import.meta.env.DEV && (typeof window !== 'undefined' && (new URLSearchParams(window.location.search).get('diagnostics') === 'true' || localStorage.getItem('show_slider_diagnostics') === 'true')) && (
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
