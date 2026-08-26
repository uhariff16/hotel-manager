import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { createClient } from '@supabase/supabase-js';
import { useSettingsStore } from '../lib/store';
import { Users, Hotel, TrendingUp, DollarSign, Search, ShieldAlert, CheckCircle, XCircle, UserPlus, Trash2, Mail, Lock, Shield, MessageCircle, MessageSquare, Plus, ArrowUp, ArrowDown, LayoutDashboard, Save, Eye, RefreshCw, Settings, MoreHorizontal, Calendar, Briefcase, Phone, Download, Upload } from 'lucide-react';
import * as XLSX from 'xlsx';
import WebsitePricingTab from '../components/WebsitePricingTab';
import WebsiteManagerTab from '../components/WebsiteManagerTab';
import SupportInbox from '../components/SupportInbox';

// Secondary client for creating users without affecting the admin session
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const secondarySupabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: { persistSession: false }
});

export default function SuperAdmin() {
  const { profile, setWebsitePricing } = useSettingsStore();
  const [stats, setStats] = useState({ users: 0, properties: 0, bookings: 0, revenue: 0 });
  const [tenants, setTenants] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);

  const DEFAULT_PLANS = {
    free: {
      name: 'Free Starter',
      description: 'Perfect for small properties',
      enabled: true,
      price: 0,
      maxResorts: 1,
      maxRooms: 4,
      maxStaff: 1,
      color: '#a0aec0',
      reports: { summary: false, bookings: true, guests: false, finance: true, exportExcel: false, exportPdf: false },
      features: [
        { name: '1 Resort Limit', enabled: true },
        { name: 'Up to 5 Rooms', enabled: true },
        { name: 'Basic Reports', enabled: true },
        { name: 'Community Support', enabled: true }
      ]
    },
    pro: {
      name: 'Pro Manager',
      description: 'For growing businesses',
      enabled: true,
      price: 1999,
      offerPrice: 1499,
      offerActive: false,
      offerStartDate: '',
      offerEndDate: '',
      maxResorts: 5,
      maxRooms: 999999,
      maxStaff: 5,
      color: 'var(--primary)',
      popular: true,
      reports: { summary: true, bookings: true, guests: true, finance: false, exportExcel: true, exportPdf: true },
      features: [
        { name: 'Up to 5 Resorts', enabled: true },
        { name: 'Unlimited Rooms', enabled: true },
        { name: 'Advanced Analytics', enabled: true },
        { name: 'Email Automation', enabled: true },
        { name: 'Priority Support', enabled: true }
      ]
    },
    premium: {
      name: 'Luxury Premium',
      description: 'Total control for hotel chains',
      enabled: true,
      price: 5999,
      offerPrice: 4999,
      offerActive: false,
      offerStartDate: '',
      offerEndDate: '',
      maxResorts: 999999,
      maxRooms: 999999,
      maxStaff: 999999,
      color: '#d4af37',
      reports: { summary: true, bookings: true, guests: true, finance: true, exportExcel: true, exportPdf: true },
      features: [
        { name: 'Unlimited Resorts', enabled: true },
        { name: 'Custom Branding', enabled: true },
        { name: 'Super Admin Panel', enabled: true },
        { name: 'WhatsApp Notifications', enabled: true },
        { name: '24/7 Dedicated Support', enabled: true }
      ]
    }
  };

  const [pricingConfig, setPricingConfig] = useState(DEFAULT_PLANS);
  const [pricingTab, setPricingTab] = useState('plans'); // 'plans', 'website', 'razorpay', 'history'
  const [razorpayConfig, setRazorpayConfig] = useState({
    mode: 'test',
    testKeyId: '',
    testKeySecret: '',
    liveKeyId: '',
    liveKeySecret: '',
    webhookSecret: ''
  });
  const DEFAULT_WEBSITE_PRICING = {
    draft: {},
    published: {},
    history: [],
    currentVersion: 0
  };
  const [websitePricingConfig, setWebsitePricingConfig] = useState(DEFAULT_WEBSITE_PRICING);
  const [editingWebsitePlanKey, setEditingWebsitePlanKey] = useState(null);
  const [showWebsitePublishModal, setShowWebsitePublishModal] = useState(false);
  
  const [globalCommEnabled, setGlobalCommEnabled] = useState(true);
  const [globalTemplatesEnabled, setGlobalTemplatesEnabled] = useState(true);
  const [globalOnboardingWizardEnabled, setGlobalOnboardingWizardEnabled] = useState(true);
  
  const DEFAULT_LANDING_CONTENT = {
    headline: "Know Your Bookings. Know Your Numbers.",
    subheadline: "Bookings. Income. Expenses. Simplified.",
    description: "Stay Pilot makes it simple to manage your property bookings, track income and expenses, and understand your business — all in one place.",
    target: "Built for cottages, homestays, villas, guest houses and independent stays.",
    comparisonHeadline: "Stop Managing Your Property in Pieces.",
    comparisonDescription: "Move away from scattered notebooks, messy spreadsheets, and payment records. Stay Pilot provides you with one clean, unified environment to manage your bookings and understand your numbers.",
    deepDives: [
      {
        image: 'booking_management.png',
        tagline: 'Reservation Control',
        title: 'Seamless Booking Management, Zero Friction.',
        description: 'Say goodbye to scattered notebooks and messy spreadsheets. Manage every guest reservation centrally, track check-ins, and keep your property running smoothly. Ensure nothing ever falls through the cracks again.',
        bullets: ['Live status tracking (Pending, Confirmed)', 'Centralized guest overview', 'Effortless room assignments']
      },
      {
        image: 'calendar.png',
        tagline: 'Visual Timeline',
        title: 'Never Double Book Again.',
        description: "Get an instant, visual overview of your property's availability. Our elegant timeline calendar lets you spot open rooms in seconds, map out upcoming weeks, and prevent costly scheduling errors effortlessly.",
        bullets: ['Color-coded booking statuses', 'Multi-room & multi-property views', 'Instant availability tracking']
      },
      {
        image: 'financials.png',
        tagline: 'Revenue Intelligence',
        title: 'Turn Operations into Profitability.',
        description: 'Understand exactly how much money your property is making. Track all income sources, log operational expenses automatically, and let Stay Pilot calculate your net profit with laser precision.',
        bullets: ['Automated revenue & profit charting', 'Clean expense category breakdowns', 'Real-time occupancy metrics']
      }
    ],
    features: [
      { title: "Smart Dashboard", description: "Real-time metrics, monthly performance, and revenue breakdowns at a glance." },
      { title: "Booking Management", description: "Track, manage, and organize all your guest reservations effortlessly." },
      { title: "Integrated Calendar", description: "Visual calendar to instantly see property availability and upcoming stays." },
      { title: "Financial Tracking", description: "Monitor collections, log expenses, and automatically calculate your profit." },
      { title: "Comprehensive Reports", description: "Generate deep insights and exportable reports to understand business growth." },
      { title: "Investment Analysis", description: "Specialized tools to analyze property ROI and track investment health." },
      { title: "Property & Staff Management", description: "Oversee multiple properties and manage staff access from one central hub." },
      { title: "Plans & Billing", description: "Built-in subscription management and automated billing features." }
    ]
  };
  const [landingContent, setLandingContent] = useState(DEFAULT_LANDING_CONTENT);
  const DEFAULT_EMAIL_TEMPLATES = {
    welcome: {
      subject: "Welcome to StayPilot! 🚀",
      html: `<div style="font-family: 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 15px rgba(0,0,0,0.05); border: 1px solid #e2e8f0;">
  <div style="background-color: #0F2C59; padding: 40px 20px; text-align: center;">
    <h1 style="color: #ffffff; margin: 0; font-size: 28px; font-weight: 800; letter-spacing: -0.5px;">Welcome to StayPilot! 🚀</h1>
  </div>
  <div style="padding: 40px 30px; color: #334155;">
    <p style="font-size: 18px; margin-top: 0;">Hi <strong>{{tenant_name}}</strong>,</p>
    <p style="font-size: 16px; line-height: 1.6; color: #475569;">Thank you for choosing StayPilot to manage your property! We are thrilled to have you onboard. Our platform is designed to help you increase bookings, manage staff, and analyze your investments effortlessly.</p>
    
    <div style="text-align: center; margin: 35px 0;">
      <a href="https://staypilot.co.in/dashboard" style="background-color: #10b981; color: white; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 16px; display: inline-block; box-shadow: 0 4px 6px rgba(16, 185, 129, 0.25);">Go to your Dashboard</a>
    </div>
    
    <p style="font-size: 16px; line-height: 1.6; color: #475569;">If you need any help getting set up, feel free to reply directly to this email. We're always here to help you grow.</p>
  </div>
  <div style="background-color: #f8fafc; padding: 20px; text-align: center; font-size: 13px; color: #64748b; border-top: 1px solid #e2e8f0;">
    &copy; 2026 StayPilot Inc. | All rights reserved.<br>
    Transforming Property Management.
  </div>
</div>`
    },
    subscription_activated: {
      subject: "Your Subscription is Active: StayPilot ✨",
      html: `<div style="font-family: 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 15px rgba(0,0,0,0.05); border: 1px solid #e2e8f0;">
  <div style="background-color: #10b981; padding: 40px 20px; text-align: center;">
    <h1 style="color: #ffffff; margin: 0; font-size: 28px; font-weight: 800; letter-spacing: -0.5px;">Subscription Upgraded! ✨</h1>
  </div>
  <div style="padding: 40px 30px; color: #334155;">
    <p style="font-size: 18px; margin-top: 0;">Hello,</p>
    <p style="font-size: 16px; line-height: 1.6; color: #475569;">Great news! Your account has been successfully upgraded to the <strong style="color: #0F2C59;">{{plan_name}}</strong> plan.</p>
    
    <div style="background-color: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 20px; margin: 25px 0;">
      <p style="margin: 0; color: #166534; font-size: 15px;"><strong>Plan:</strong> {{plan_name}}</p>
      <p style="margin: 10px 0 0 0; color: #166534; font-size: 15px;"><strong>Valid Until:</strong> {{period_end}}</p>
    </div>

    <p style="font-size: 16px; line-height: 1.6; color: #475569;">You now have access to premium features to take your hospitality business to the next level. Let's maximize your revenue!</p>
    
    <div style="text-align: center; margin: 35px 0;">
      <a href="https://staypilot.co.in/dashboard" style="background-color: #0F2C59; color: white; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 16px; display: inline-block;">Explore New Features</a>
    </div>
  </div>
  <div style="background-color: #f8fafc; padding: 20px; text-align: center; font-size: 13px; color: #64748b; border-top: 1px solid #e2e8f0;">
    &copy; 2026 StayPilot Inc.
  </div>
</div>`
    },
    subscription_cancelled: {
      subject: "Subscription Cancelled: StayPilot",
      html: `<div style="font-family: 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 15px rgba(0,0,0,0.05); border: 1px solid #e2e8f0;">
  <div style="background-color: #475569; padding: 40px 20px; text-align: center;">
    <h1 style="color: #ffffff; margin: 0; font-size: 28px; font-weight: 800;">Subscription Cancelled</h1>
  </div>
  <div style="padding: 40px 30px; color: #334155;">
    <p style="font-size: 18px; margin-top: 0;">Hello,</p>
    <p style="font-size: 16px; line-height: 1.6; color: #475569;">Your subscription has been successfully cancelled. Your account has been reverted to the <strong>Free Starter</strong> plan.</p>
    
    <p style="font-size: 16px; line-height: 1.6; color: #475569;">You will no longer be charged, but you will lose access to premium features at the end of your current billing cycle.</p>
    
    <div style="text-align: center; margin: 35px 0;">
      <a href="https://staypilot.co.in/dashboard/pricing" style="background-color: #f8fafc; color: #0F2C59; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 16px; display: inline-block; border: 1px solid #cbd5e1;">Reactivate Anytime</a>
    </div>

    <p style="font-size: 14px; color: #64748b; text-align: center;">We're sorry to see you go. We hope to welcome you back soon!</p>
  </div>
</div>`
    },
    payment_receipt: {
      subject: "Payment Receipt: StayPilot 🧾",
      html: `<div style="font-family: 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 15px rgba(0,0,0,0.05); border: 1px solid #e2e8f0;">
  <div style="background: #0F2C59; padding: 30px 20px; text-align: center;">
    <h1 style="color: #ffffff; margin: 0; font-size: 24px; font-weight: 800;">Payment Receipt 🧾</h1>
  </div>
  <div style="padding: 40px 30px; color: #334155;">
    <p style="font-size: 16px; margin-top: 0; color: #475569;">Hello,</p>
    <p style="font-size: 16px; line-height: 1.6; color: #475569;">We have successfully received your recent payment. Thank you for your continued trust in StayPilot.</p>
    
    <div style="margin: 30px 0; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden;">
      <table style="width: 100%; border-collapse: collapse;">
        <tr style="background-color: #f8fafc;">
          <td style="padding: 15px 20px; color: #64748b; font-size: 14px; border-bottom: 1px solid #e2e8f0;">Amount Paid</td>
          <td style="padding: 15px 20px; text-align: right; font-size: 18px; font-weight: bold; color: #10b981; border-bottom: 1px solid #e2e8f0;">₹{{amount}}</td>
        </tr>
        <tr>
          <td style="padding: 15px 20px; color: #64748b; font-size: 14px;">Transaction ID</td>
          <td style="padding: 15px 20px; text-align: right; font-size: 14px; font-family: monospace; color: #334155;">{{payment_id}}</td>
        </tr>
      </table>
    </div>

    <p style="font-size: 14px; line-height: 1.6; color: #64748b; text-align: center;">You can download a PDF invoice directly from your billing dashboard.</p>
  </div>
</div>`
    }
  };
  const [emailTemplates, setEmailTemplates] = useState(DEFAULT_EMAIL_TEMPLATES);
  const [previewTemplate, setPreviewTemplate] = useState(null);

  // Modal states
  const [showUserForm, setShowUserForm] = useState(false);
  const [userFormData, setUserFormData] = useState({ 
    email: '', 
    password: '', 
    fullName: '', 
    role: 'tenant_admin',
    tenantId: '' 
  });
  const [formError, setFormError] = useState(null);

  // Management modal states
  const [editingUser, setEditingUser] = useState(null);
  const [isUpdating, setIsUpdating] = useState(false);
  const [adminActiveTab, setAdminActiveTab] = useState(
    profile?.role === 'support_admin' ? 'support' : 
    profile?.role === 'billing_admin' ? 'overview' : 'overview'
  );
  const [supportUnreadCount, setSupportUnreadCount] = useState(0);

  const isPlatformAdmin = ['super_admin', 'support_admin', 'billing_admin'].includes(profile?.role);

  const getMasterSuperAdmin = () => {
    const superAdmins = tenants.filter(u => u.role === 'super_admin').sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    return superAdmins.length > 0 ? superAdmins[0] : profile;
  };

  useEffect(() => {
    if (!isPlatformAdmin) return;
    fetchGlobalData();
    fetchUnreadTickets();
    
    // Subscribe to support tickets changes
    const ticketsSubscription = supabase.channel('superadmin-tickets')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'support_tickets' }, () => {
        fetchUnreadTickets();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(ticketsSubscription);
    };
  }, [profile]);

  const fetchUnreadTickets = async () => {
    const { count } = await supabase
      .from('support_tickets')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'open')
      .eq('admin_unread', true);
    setSupportUnreadCount(count || 0);
  };

  const fetchGlobalData = async () => {
    setLoading(true);
    try {
      const [{ data: u }, { data: r }, { data: b }, { data: inc }] = await Promise.all([
        supabase.from('profiles').select('*').order('created_at', { ascending: false }),
        supabase.from('resorts').select('id, tenant_id, name, email, phone'),
        supabase.from('bookings').select('id, tenant_id'),
        supabase.from('incomes').select('amount')
      ]);

      const tenantsWithData = (u || []).map(user => {
        const owner = user.role === 'staff' 
          ? (u || []).find(p => p.id === user.tenant_id) 
          : null;
          
        const activeTenantId = user.role === 'staff' ? user.tenant_id : user.id;
        const tenantResorts = (r || []).filter(res => res.tenant_id === activeTenantId);
        const resortNamesList = tenantResorts.map(res => res.name || 'Unnamed Resort');

        return {
          ...user,
          ownerName: owner ? owner.full_name : 'Self',
          email: user.email || (tenantResorts[0] && tenantResorts[0].email) || '',
          phone: user.phone || (tenantResorts[0] && tenantResorts[0].phone) || '',
          propertyCount: resortNamesList.length,
          propertyNames: resortNamesList,
          bookingCount: (b || []).filter(book => book.tenant_id === activeTenantId).length
        };
      });

      const superAdmins = (u || []).filter(user => user.role === 'super_admin').sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
      const superAdminProfile = superAdmins.length > 0 ? superAdmins[0] : (u || []).find(user => user.id === profile.id);
      if (superAdminProfile?.global_settings?.pricing) {
        const loaded = superAdminProfile.global_settings.pricing;
        
        // Merge loaded pricing with DEFAULT_PLANS defaults for missing fields
        const mergedPricing = {};
        for (const [key, plan] of Object.entries(loaded)) {
           mergedPricing[key] = {
             ...(DEFAULT_PLANS[key] || {}),
             ...plan,
             features: plan.features || (DEFAULT_PLANS[key]?.features || []),
             reports: plan.reports || (DEFAULT_PLANS[key]?.reports || { summary: true, bookings: true, guests: true, finance: true, exportExcel: true, exportPdf: true })
           };
        }
        
        // Ensure all DEFAULT_PLANS exist if they were completely missing
        for (const [key, plan] of Object.entries(DEFAULT_PLANS)) {
          if (!mergedPricing[key]) {
            mergedPricing[key] = { ...plan };
          }
        }
        
        setPricingConfig(mergedPricing);
      }

      if (superAdminProfile?.global_settings?.website_pricing) {
        setWebsitePricingConfig(superAdminProfile.global_settings.website_pricing);
      }

      if (superAdminProfile?.global_settings) {
        setGlobalCommEnabled(superAdminProfile.global_settings.comm_features_enabled !== false);
        setGlobalTemplatesEnabled(superAdminProfile.global_settings.templates_enabled !== false);
        setGlobalOnboardingWizardEnabled(superAdminProfile.global_settings.onboarding_wizard_enabled !== false);
        
        if (superAdminProfile.global_settings.razorpay_settings) {
          setRazorpayConfig(superAdminProfile.global_settings.razorpay_settings);
        }
        if (superAdminProfile.global_settings.landing_page) {
          setLandingContent({
            ...DEFAULT_LANDING_CONTENT,
            ...superAdminProfile.global_settings.landing_page,
            features: superAdminProfile.global_settings.landing_page.features || DEFAULT_LANDING_CONTENT.features
          });
        }
        if (superAdminProfile.global_settings.email_templates) {
          setEmailTemplates({
            ...DEFAULT_EMAIL_TEMPLATES,
            ...superAdminProfile.global_settings.email_templates
          });
        }
      }

      setTenants(tenantsWithData);
      
      setStats({
        users: u?.filter(u => u.role === 'tenant_admin').length || 0,
        staffCount: u?.filter(u => u.role === 'staff').length || 0,
        properties: r?.length || 0,
        bookings: b?.length || 0,
        revenue: (inc || []).reduce((sum, item) => sum + Number(item.amount), 0)
      });
    } catch (err) {
      console.error("SuperAdmin Fetch Error:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateUser = async (e) => {
    e.preventDefault();
    if (!editingUser) return;
    setIsUpdating(true);
    
    try {
      let payload = { 
        email: editingUser.email,
        plan_type: editingUser.plan_type,
        subscription_status: editingUser.subscription_status,
        feature_investment_enabled: editingUser.feature_investment_enabled,
        feature_comm_enabled: editingUser.feature_comm_enabled !== false
      };
      
      let { error } = await supabase
        .from('profiles')
        .update(payload)
        .eq('id', editingUser.id);
        
      if (error && (error.message?.includes('column') || error.code === '42703')) {
        console.warn("feature_comm_enabled column missing. Saving other columns.");
        delete payload.feature_comm_enabled;
        const retry = await supabase
          .from('profiles')
          .update(payload)
          .eq('id', editingUser.id);
        if (retry.error) throw retry.error;
        alert("Account updated successfully! (Note: feature_comm_enabled column is missing in DB. Please run the add_comm_feature.sql script in Supabase SQL editor.)");
      } else if (error) {
        throw error;
      } else {
        alert("Account updated successfully!");
      }
      
      setTenants(prev => prev.map(t => t.id === editingUser.id ? editingUser : t));
      setEditingUser(null);
    } catch (err) {
      alert("Update failed: " + err.message);
    } finally {
      setIsUpdating(false);
    }
  };

  const handleCreateUser = async (e) => {
    e.preventDefault();
    setLoading(true);
    setFormError(null);

    try {
      if (userFormData.role === 'staff' && !userFormData.tenantId) {
        throw new Error("Staff must be assigned to an existing Tenant.");
      }

      const { data, error: authError } = await secondarySupabase.auth.signUp({
        email: userFormData.email,
        password: userFormData.password,
        options: {
          data: {
            full_name: userFormData.fullName,
            role: userFormData.role,
            tenant_id: userFormData.role === 'staff' ? userFormData.tenantId : undefined
          }
        }
      });

      if (authError) throw authError;

      if (data?.user?.id) {
        await supabase
          .from('profiles')
          .update({ email: userFormData.email })
          .eq('id', data.user.id);
      }

      alert(`${userFormData.role === 'tenant_admin' ? 'Tenant' : 'Staff'} account created!`);
      setUserFormData({ email: '', password: '', fullName: '', role: 'tenant_admin', tenantId: '' });
      setShowUserForm(false);
      fetchGlobalData();
    } catch (err) {
      setFormError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const deleteAccount = async (userId, name) => {
    if (!confirmingDelete) {
      setConfirmingDelete(true);
      return;
    }
    
    setIsUpdating(true);
    try {
      const { error } = await supabase.from('profiles').delete().eq('id', userId);
      if (error) throw error;
      setTenants(tenants.filter(t => t.id !== userId));
      setEditingUser(null);
      setConfirmingDelete(false);
      alert("Account removed successfully.");
      fetchGlobalData();
    } catch (err) { 
      alert("Delete failed: " + err.message); 
    } finally {
      setIsUpdating(false);
    }
  };

  const handleSavePricing = async () => {
    try {
      setIsUpdating(true);
      const masterAdmin = getMasterSuperAdmin();
      const settings = masterAdmin.global_settings || {};
      settings.pricing = pricingConfig;
      
      const { error } = await supabase.from('profiles').update({ global_settings: settings }).eq('id', masterAdmin.id);
      if (error) throw error;
      alert("Global pricing configuration updated successfully!");
    } catch (err) {
      alert("Failed to save pricing: " + err.message);
    } finally {
      setIsUpdating(false);
    }
  };

  const handleSaveEmailTemplates = async () => {
    try {
      setIsUpdating(true);
      const masterAdmin = getMasterSuperAdmin();
      const settings = masterAdmin.global_settings || {};
      settings.email_templates = emailTemplates;
      
      const { error } = await supabase.from('profiles').update({ global_settings: settings }).eq('id', masterAdmin.id);
      if (error) throw error;
      alert("Email templates updated successfully!");
    } catch (err) {
      alert("Failed to save email templates: " + err.message);
    } finally {
      setIsUpdating(false);
    }
  };

  const handleSaveWebsiteDraft = async (newDraftData) => {
    try {
      setIsUpdating(true);
      const masterAdmin = getMasterSuperAdmin();
      const settings = masterAdmin.global_settings || {};
      const updatedWebsitePricing = {
        ...websitePricingConfig,
        draft: newDraftData
      };
      settings.website_pricing = updatedWebsitePricing;
      
      const { error } = await supabase.from('profiles').update({ global_settings: settings }).eq('id', masterAdmin.id);
      if (error) throw error;
      setWebsitePricingConfig(updatedWebsitePricing);
      setWebsitePricing(updatedWebsitePricing);
    } catch (err) {
      alert("Failed to save draft: " + err.message);
    } finally {
      setIsUpdating(false);
    }
  };

  const handlePublishWebsitePricing = async () => {
    try {
      setIsUpdating(true);
      const masterAdmin = getMasterSuperAdmin();
      const settings = masterAdmin.global_settings || {};
      const newVersionNum = (websitePricingConfig.currentVersion || 0) + 1;
      
      const mergedDraft = {};
      Object.keys(websitePricingConfig.draft || {}).forEach(key => {
        const internal = pricingConfig[key] || {};
        mergedDraft[key] = {
          ...websitePricingConfig.draft[key],
          monthlyPrice: internal.price || 0,
          originalPrice: internal.offerPrice ? internal.price : '',
          promotionalPrice: internal.offerPrice || '',
          offerText: internal.offerPrice && internal.price ? `Save ${Math.round(((internal.price - internal.offerPrice) / internal.price) * 100)}%` : '',
          offerStartDate: internal.offerStartDate || '',
          offerEndDate: internal.offerEndDate || '',
          offerActive: internal.offerActive || false,
          publicFeatures: internal.features 
            ? internal.features.filter(f => f.enabled !== false).map(f => f.name)
            : websitePricingConfig.draft[key].publicFeatures,
        };
      });

      const historyEntry = {
        version: newVersionNum,
        publishedAt: new Date().toISOString(),
        publishedBy: profile.full_name || 'Super Admin',
        plans: mergedDraft
      };

      const updatedWebsitePricing = {
        ...websitePricingConfig,
        published: mergedDraft,
        history: [historyEntry, ...(websitePricingConfig.history || [])],
        currentVersion: newVersionNum
      };
      
      settings.website_pricing = updatedWebsitePricing;
      
      const { error } = await supabase.from('profiles').update({ global_settings: settings }).eq('id', masterAdmin.id);
      if (error) throw error;
      
      setWebsitePricingConfig(updatedWebsitePricing);
      setWebsitePricing(updatedWebsitePricing);
      setShowWebsitePublishModal(false);
      alert("Website Pricing Published Successfully!");
    } catch (err) {
      alert("Failed to publish website pricing: " + err.message);
    } finally {
      setIsUpdating(false);
    }
  };

  const handleSaveRazorpaySettings = async () => {
    try {
      setIsUpdating(true);
      const masterAdmin = getMasterSuperAdmin();
      const settings = masterAdmin.global_settings || {};
      settings.razorpay_settings = razorpayConfig;
      
      const { error } = await supabase.from('profiles').update({ global_settings: settings }).eq('id', masterAdmin.id);
      if (error) throw error;
      
      alert("Razorpay Settings Saved Successfully!");
    } catch (err) {
      alert("Failed to save Razorpay settings: " + err.message);
    } finally {
      setIsUpdating(false);
    }
  };

  const handleRollbackWebsitePricing = async (versionIndex) => {
    if (!confirm("Roll back to this version? This will become the new active draft and immediately publish to the website.")) return;
    try {
      setIsUpdating(true);
      const masterAdmin = getMasterSuperAdmin();
      const settings = masterAdmin.global_settings || {};
      const historyVersion = websitePricingConfig.history[versionIndex];
      const newVersionNum = (websitePricingConfig.currentVersion || 0) + 1;
      
      const historyEntry = {
        version: newVersionNum,
        publishedAt: new Date().toISOString(),
        publishedBy: profile.full_name || 'Super Admin',
        plans: historyVersion.plans,
        note: `Rolled back from v${historyVersion.version}`
      };

      const updatedWebsitePricing = {
        ...websitePricingConfig,
        draft: historyVersion.plans,
        published: historyVersion.plans,
        history: [historyEntry, ...(websitePricingConfig.history || [])],
        currentVersion: newVersionNum
      };
      
      settings.website_pricing = updatedWebsitePricing;
      
      const { error } = await supabase.from('profiles').update({ global_settings: settings }).eq('id', masterAdmin.id);
      if (error) throw error;
      
      setWebsitePricingConfig(updatedWebsitePricing);
      setWebsitePricing(updatedWebsitePricing);
      alert(`Successfully rolled back to version ${historyVersion.version}!`);
    } catch (err) {
      alert("Failed to roll back: " + err.message);
    } finally {
      setIsUpdating(false);
    }
  };

  const handleSaveGlobalFeatures = async () => {
    try {
      setIsUpdating(true);
      const masterAdmin = getMasterSuperAdmin();
      const settings = masterAdmin.global_settings || {};
      settings.comm_features_enabled = globalCommEnabled;
      settings.templates_enabled = globalTemplatesEnabled;
      settings.onboarding_wizard_enabled = globalOnboardingWizardEnabled;
      
      const { error } = await supabase.from('profiles').update({ global_settings: settings }).eq('id', masterAdmin.id);
      if (error) throw error;
      alert("Global feature settings updated successfully!");
    } catch (err) {
      alert("Failed to save global features: " + err.message);
    } finally {
      setIsUpdating(false);
    }
  };

  const handleSaveLandingPage = async () => {
    try {
      setIsUpdating(true);
      const masterAdmin = getMasterSuperAdmin();
      const settings = masterAdmin.global_settings || {};
      settings.landing_page = landingContent;
      
      const { error } = await supabase.from('profiles').update({ global_settings: settings }).eq('id', masterAdmin.id);
      if (error) throw error;
      alert("Landing page content updated successfully!");
    } catch (err) {
      alert("Failed to save landing page: " + err.message);
    } finally {
      setIsUpdating(false);
    }
  };

  if (!profile) return null;
  
  const isPlatformAdminRender = ['super_admin', 'support_admin', 'billing_admin'].includes(profile?.role);
  if (!isPlatformAdminRender) {
    return (
      <div style={{ textAlign: 'center', padding: '100px 20px' }}>
        <ShieldAlert size={64} color="var(--danger)" style={{ marginBottom: '1.5rem' }} />
        <h1>Access Denied</h1>
        <p style={{ color: 'var(--text-muted)' }}>You do not have administrative privileges to access this global dashboard.</p>
      </div>
    );
  }

  if (loading && tenants.length === 0) return <div>Loading Global Control Panel...</div>;

  return (
    <div>
      {/* Page Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem' }}>
        <div>
          <h1 style={{ marginBottom: '0.25rem', fontSize: '1.75rem', fontWeight: 800, color: '#0F2C59', fontFamily: "'Outfit', sans-serif" }}>Global Control Panel</h1>
          <p style={{ color: 'var(--text-muted)', margin: 0, fontSize: '0.9rem' }}>Oversee all platform Tenants, Staff, Plans, and Website configuration.</p>
        </div>
      </div>

      {/* Elegant Sub-navigation Tabs */}
      <div style={{ 
        display: 'flex', 
        gap: '0.5rem', 
        borderBottom: '1px solid #cbd5e1', 
        marginBottom: '2rem', 
        paddingBottom: '0.1rem',
        overflowX: 'auto',
        flexWrap: 'nowrap'
      }}>
        {[
          { id: 'overview', label: 'Dashboard Overview', icon: <TrendingUp size={16} />, roles: ['super_admin', 'billing_admin'] },
          { id: 'accounts', label: `Tenants & Staff (${tenants.filter(t => ['tenant_admin', 'staff'].includes(t.role)).length})`, icon: <Users size={16} />, roles: ['super_admin'] },
          { id: 'platform_staff', label: `Platform Staff (${tenants.filter(t => ['super_admin', 'support_admin', 'billing_admin'].includes(t.role)).length})`, icon: <ShieldAlert size={16} />, roles: ['super_admin'] },
          { id: 'plans', label: 'Subscription Plans', icon: <DollarSign size={16} />, roles: ['super_admin', 'billing_admin'] },
          { id: 'settings', label: 'Platform Settings', icon: <Shield size={16} />, roles: ['super_admin', 'billing_admin'] },
          { id: 'emails', label: 'Email Templates', icon: <Mail size={16} />, roles: ['super_admin'] },
          { id: 'support', label: `Support Inbox ${supportUnreadCount > 0 ? `(${supportUnreadCount})` : ''}`, icon: <MessageSquare size={16} />, roles: ['super_admin', 'support_admin'] },
          { id: 'website_manager', label: 'Website Manager', icon: <LayoutDashboard size={16} />, roles: ['super_admin'] }
        ].filter(tab => tab.roles.includes(profile?.role)).map(tab => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setAdminActiveTab(tab.id)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              padding: '0.75rem 1.5rem',
              background: 'transparent',
              border: 'none',
              borderBottom: adminActiveTab === tab.id ? '3px solid #059669' : '3px solid transparent',
              color: adminActiveTab === tab.id ? '#0F2C59' : '#64748B',
              fontWeight: 700,
              fontSize: '0.95rem',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              transition: 'all 0.2s',
              fontFamily: "'Outfit', sans-serif"
            }}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* TAB 1: OVERVIEW & STATS */}
      {adminActiveTab === 'overview' && (
        <div style={{ animation: 'fadeIn 0.2s ease-out' }}>
          {/* Global Stats Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1.5rem', marginBottom: '2.5rem' }}>
            <div className="card" style={{ background: 'white', borderRadius: '16px', border: '1px solid rgba(15, 44, 89, 0.08)', boxShadow: '0 10px 30px rgba(15, 44, 89, 0.02)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--text-muted)', fontWeight: 600 }}>Tenants / Staff</p>
                  <h2 style={{ margin: '0.25rem 0', color: '#0F2C59', fontWeight: 800 }}>{stats.users} / {stats.staffCount}</h2>
                </div>
                <div style={{ padding: '0.75rem', borderRadius: '12px', background: 'rgba(59, 130, 246, 0.1)', color: 'var(--primary)' }}>
                  <Users size={24} />
                </div>
              </div>
            </div>
            <div className="card" style={{ background: 'white', borderRadius: '16px', border: '1px solid rgba(15, 44, 89, 0.08)', boxShadow: '0 10px 30px rgba(15, 44, 89, 0.02)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--text-muted)', fontWeight: 600 }}>Global Properties</p>
                  <h2 style={{ margin: '0.25rem 0', color: '#0F2C59', fontWeight: 800 }}>{stats.properties}</h2>
                </div>
                <div style={{ padding: '0.75rem', borderRadius: '12px', background: 'rgba(16, 185, 129, 0.1)', color: '#059669' }}>
                  <Hotel size={24} />
                </div>
              </div>
            </div>
            <div className="card" style={{ background: 'white', borderRadius: '16px', border: '1px solid rgba(15, 44, 89, 0.08)', boxShadow: '0 10px 30px rgba(15, 44, 89, 0.02)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--text-muted)', fontWeight: 600 }}>Global Bookings</p>
                  <h2 style={{ margin: '0.25rem 0', color: '#0F2C59', fontWeight: 800 }}>{stats.bookings}</h2>
                </div>
                <div style={{ padding: '0.75rem', borderRadius: '12px', background: 'rgba(14, 165, 233, 0.1)', color: '#0ea5e9' }}>
                  <TrendingUp size={24} />
                </div>
              </div>
            </div>
            <div className="card" style={{ background: 'white', borderRadius: '16px', border: '1px solid rgba(15, 44, 89, 0.08)', boxShadow: '0 10px 30px rgba(15, 44, 89, 0.02)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--text-muted)', fontWeight: 600 }}>Platform Revenue</p>
                  <h2 style={{ margin: '0.25rem 0', color: '#059669', fontWeight: 800 }}>₹{stats.revenue.toLocaleString()}</h2>
                </div>
                <div style={{ padding: '0.75rem', borderRadius: '12px', background: 'rgba(245, 158, 11, 0.1)', color: '#f59e0b' }}>
                  <DollarSign size={24} />
                </div>
              </div>
            </div>
          </div>

          {/* Quick Start Card */}
          <div className="card" style={{ padding: '2.5rem', background: 'white', borderRadius: '16px', border: '1px solid rgba(15, 44, 89, 0.08)', textAlign: 'left' }}>
            <h3 style={{ color: '#0F2C59', fontWeight: 800, marginBottom: '1rem', fontFamily: "'Outfit', sans-serif" }}>Platform Overview & Activities</h3>
            <p style={{ color: '#475569', lineHeight: 1.6, marginBottom: '1.5rem', fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
              Welcome back to your Stay Pilot administrative hub. From this dashboard, you can control the subscription plans, adjust pricing drafts for the landing page, enable/disable system-wide integrations, and oversee all active accounts.
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1.5rem', marginTop: '2rem' }}>
              <div style={{ background: '#f8fafc', padding: '1.25rem', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                <h4 style={{ color: '#0F2C59', fontWeight: 700, fontSize: '0.95rem', marginBottom: '0.5rem' }}>Accounts Hub</h4>
                <p style={{ color: '#64748B', fontSize: '0.85rem', margin: 0 }}>Review registrations, edit permissions, change packages, or create accounts.</p>
                <button type="button" className="btn btn-link" style={{ padding: 0, marginTop: '0.75rem', fontSize: '0.85rem', color: '#059669', fontWeight: 700 }} onClick={() => setAdminActiveTab('accounts')}>Manage Accounts &rarr;</button>
              </div>
              <div style={{ background: '#f8fafc', padding: '1.25rem', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                <h4 style={{ color: '#0F2C59', fontWeight: 700, fontSize: '0.95rem', marginBottom: '0.5rem' }}>Plans & Pricing</h4>
                <p style={{ color: '#64748B', fontSize: '0.85rem', margin: 0 }}>Configure platform subscription tiers, features list, and edit public marketing rates.</p>
                <button type="button" className="btn btn-link" style={{ padding: 0, marginTop: '0.75rem', fontSize: '0.85rem', color: '#059669', fontWeight: 700 }} onClick={() => setAdminActiveTab('plans')}>Update Plans &rarr;</button>
              </div>
              <div style={{ background: '#f8fafc', padding: '1.25rem', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                <h4 style={{ color: '#0F2C59', fontWeight: 700, fontSize: '0.95rem', marginBottom: '0.5rem' }}>Global Settings</h4>
                <p style={{ color: '#64748B', fontSize: '0.85rem', margin: 0 }}>Toggle platform feature locks and edit landing page headlines and features.</p>
                <button type="button" className="btn btn-link" style={{ padding: 0, marginTop: '0.75rem', fontSize: '0.85rem', color: '#059669', fontWeight: 700 }} onClick={() => setAdminActiveTab('settings')}>Modify Settings &rarr;</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2 & 3: ACCOUNTS & PLATFORM STAFF */}
      {(adminActiveTab === 'accounts' || adminActiveTab === 'platform_staff') && (
        <div style={{ animation: 'fadeIn 0.2s ease-out' }}>
          
          {/* Header Controls for accounts list */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
            <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
              <h3 style={{ margin: 0, color: '#0F2C59', fontWeight: 800, fontFamily: "'Outfit', sans-serif" }}>
                {adminActiveTab === 'platform_staff' ? 'Platform Admin Accounts' : 'Tenant & Staff Accounts'}
              </h3>
            </div>
            <button className="btn btn-primary" onClick={() => setShowUserForm(!showUserForm)}>
              <UserPlus size={20} /> {showUserForm ? 'Hide Creator' : 'Create New Account'}
            </button>
          </div>

          {/* Account Creator Form Card */}
          {showUserForm && (
            <div className="card" style={{ marginBottom: '2rem', animation: 'slideDown 0.3s ease-out', border: '1px solid rgba(5, 150, 105, 0.15)', background: 'rgba(255, 255, 255, 0.95)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                <h2 style={{ fontSize: '1.25rem', color: '#0F2C59', fontWeight: 800, fontFamily: "'Outfit', sans-serif" }}>
                  Create New {userFormData.role === 'tenant_admin' ? 'Tenant' : userFormData.role === 'staff' ? 'Staff' : 'Platform'} Account
                </h2>
              </div>
              
              {formError && <div style={{ color: 'var(--danger)', marginBottom: '1rem', background: 'rgba(239, 68, 68, 0.1)', padding: '0.75rem', borderRadius: '8px', fontWeight: 600 }}>{formError}</div>}

              <form onSubmit={handleCreateUser} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '1.5rem', textAlign: 'left' }}>
                <div className="form-group">
                  <label className="form-label">Full Name</label>
                  <input type="text" className="form-input" required value={userFormData.fullName} onChange={e => setUserFormData({...userFormData, fullName: e.target.value})} placeholder="e.g. Michael Smith" />
                </div>
                <div className="form-group">
                  <label className="form-label">Email Address</label>
                  <input type="email" className="form-input" required value={userFormData.email} onChange={e => setUserFormData({...userFormData, email: e.target.value})} placeholder="email@example.com" />
                </div>
                <div className="form-group">
                  <label className="form-label">Default Password</label>
                  <input type="password" minLength={6} className="form-input" required value={userFormData.password} onChange={e => setUserFormData({...userFormData, password: e.target.value})} placeholder="••••••••" />
                </div>
                <div className="form-group">
                  <label className="form-label">Account Role</label>
                  <select className="form-select" value={userFormData.role} onChange={e => setUserFormData({...userFormData, role: e.target.value, tenantId: ''})}>
                    {adminActiveTab === 'accounts' ? (
                      <>
                        <option value="tenant_admin">Tenant (Property Owner)</option>
                        <option value="staff">Staff (Operational)</option>
                      </>
                    ) : (
                      <>
                        <option value="super_admin">Super Admin (Full Access)</option>
                        <option value="billing_admin">Billing Admin (Plans/Settings)</option>
                        <option value="support_admin">Support Admin (Inbox Only)</option>
                      </>
                    )}
                  </select>
                </div>
                
                {userFormData.role === 'staff' && (
                  <div className="form-group" style={{ gridColumn: 'span 2' }}>
                    <label className="form-label">Assign to Tenant (Owner)</label>
                    <select className="form-select" required value={userFormData.tenantId} onChange={e => setUserFormData({...userFormData, tenantId: e.target.value})}>
                      <option value="">-- Select Tenant --</option>
                      {tenants.filter(t => t.role === 'tenant_admin').map(t => (
                        <option key={t.id} value={t.id}>{t.full_name} ({t.id.split('-')[0]})</option>
                      ))}
                    </select>
                  </div>
                )}

                <div style={{ gridColumn: 'span 2', marginTop: '0.5rem' }}>
                  <button type="submit" className="btn btn-primary" style={{ width: '100%', height: '48px', fontWeight: 700 }} disabled={loading}>
                    {loading ? 'Creating...' : `Create Account`}
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* Accounts Search & List Table Card */}
          <div className="card" style={{ background: 'white', borderRadius: '16px', border: '1px solid rgba(15, 44, 89, 0.08)', boxShadow: '0 10px 30px rgba(15, 44, 89, 0.02)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
              <h4 style={{ margin: 0, color: '#0F2C59', fontWeight: 800, fontFamily: "'Outfit', sans-serif" }}>
                {adminActiveTab === 'platform_staff' ? 'Platform Team' : 'Registered Accounts List'}
              </h4>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <div style={{ position: 'relative' }}>
                  <Search size={18} style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                  <input 
                    type="text" 
                    className="form-input" 
                    placeholder="Search tenants or staff..." 
                    style={{ paddingLeft: '2.5rem', width: '300px' }} 
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />
                </div>
                <button 
                  className="btn btn-outline" 
                  style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontWeight: 600, color: '#0F2C59', borderColor: '#cbd5e1' }}
                  onClick={() => {
                    const headers = ['ID', 'Full Name', 'Email', 'Role', 'Owner (Tenant)', 'Properties (Names)', 'Property Count', 'Booking Count', 'Plan', 'Status', 'Joined Date'];
                    const rows = tenants.map(t => [
                      t.id,
                      t.full_name,
                      t.email,
                      t.role === 'tenant_admin' ? 'Tenant Admin' : 'Staff',
                      t.role === 'staff' ? t.ownerName : 'N/A',
                      (t.propertyNames || []).join('; '),
                      t.propertyCount || 0,
                      t.bookingCount || 0,
                      pricingConfig[t.plan_type]?.name || t.plan_type || 'Free Starter',
                      t.subscription_status === 'active' ? 'Active' : 'Suspended',
                      t.created_at ? new Date(t.created_at).toISOString().split('T')[0] : ''
                    ]);

                    const worksheet = XLSX.utils.aoa_to_sheet([headers, ...rows]);
                    
                    // Set column widths to prevent #### for dates and long IDs
                    worksheet['!cols'] = [
                      { wch: 38 }, // ID
                      { wch: 25 }, // Full Name
                      { wch: 30 }, // Email
                      { wch: 15 }, // Role
                      { wch: 20 }, // Owner
                      { wch: 40 }, // Properties
                      { wch: 15 }, // Property Count
                      { wch: 15 }, // Booking Count
                      { wch: 20 }, // Plan
                      { wch: 10 }, // Status
                      { wch: 15 }  // Joined Date
                    ];

                    const workbook = XLSX.utils.book_new();
                    XLSX.utils.book_append_sheet(workbook, worksheet, "Accounts");
                    XLSX.writeFile(workbook, "staypilot_accounts.xlsx");
                  }}
                >
                  <Download size={16} /> Export to Excel
                </button>
              </div>
            </div>
            
            <div className="table-container" style={{ overflowX: 'auto' }}>
              <table className="table" style={{ width: '100%', minWidth: '1200px', borderCollapse: 'collapse', textAlign: 'left' }}>
                <thead>
                  <tr>
                    <th>User Name / ID</th>
                    <th>Contact Info</th>
                    <th>Joined</th>
                    <th>Role & Properties</th>
                    <th>Sub Plan & Stats</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {tenants.filter(t => 
                    (adminActiveTab === 'platform_staff' 
                      ? ['super_admin', 'support_admin', 'billing_admin'].includes(t.role)
                      : ['tenant_admin', 'staff'].includes(t.role)
                    ) &&
                    (t.full_name?.toLowerCase().includes(searchTerm.toLowerCase()) || 
                    t.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                    t.id?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                    t.role?.toLowerCase().includes(searchTerm.toLowerCase()))
                  ).map(tenant => (
                    <tr key={tenant.id} style={{ borderBottom: '1px solid #f1f5f9', transition: 'background-color 0.2s ease', ':hover': { backgroundColor: '#f8fafc' } }}>
                      <td style={{ verticalAlign: 'middle', padding: '1.25rem 0.5rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                          <div style={{ 
                            width: '42px', height: '42px', borderRadius: '50%', 
                            background: ['super_admin', 'billing_admin', 'support_admin'].includes(tenant.role) 
                              ? 'linear-gradient(135deg, #7c3aed, #4c1d95)'
                              : tenant.role === 'tenant_admin' ? 'linear-gradient(135deg, #0F2C59, #1a4a8f)' : 'linear-gradient(135deg, #64748B, #94a3b8)', 
                            color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: '800', fontSize: '1.1rem', boxShadow: '0 2px 4px rgba(0,0,0,0.1)' 
                          }}>
                            {tenant.full_name?.charAt(0).toUpperCase() || '?'}
                          </div>
                          <div>
                            <div style={{ fontWeight: 800, fontSize: '0.95rem', color: '#1e293b' }}>{tenant.full_name}</div>
                            <div style={{ fontSize: '0.7rem', color: '#94a3b8', marginTop: '0.2rem', display: 'flex', gap: '0.5rem' }}>
                              <span>ID: {tenant.id.substring(0, 8)}...</span>
                            </div>
                          </div>
                        </div>
                      </td>
                      <td style={{ verticalAlign: 'middle', padding: '1.25rem 0.5rem' }}>
                        <div style={{ color: '#475569', fontSize: '0.85rem', display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>

                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                            <Mail size={13} style={{ color: '#94a3b8' }} /> {tenant.email}
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                            <Phone size={13} style={{ color: '#94a3b8' }} /> {tenant.phone || <span style={{ color: '#cbd5e1', fontStyle: 'italic' }}>Not provided</span>}
                          </div>
                        </div>
                      </td>
                      <td style={{ verticalAlign: 'middle', padding: '1.25rem 0.5rem' }}>
                        <div style={{ fontSize: '0.85rem', color: '#475569', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                          <Calendar size={14} style={{ color: '#94a3b8' }} /> 
                          {tenant.created_at ? new Date(tenant.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : 'Unknown'}
                        </div>
                        <div style={{ fontSize: '0.75rem', color: '#94a3b8', display: 'flex', alignItems: 'center', gap: '0.4rem', marginTop: '0.4rem' }}>
                          <span title="Last Login">🕒</span> 
                          {tenant.last_login_at ? new Date(tenant.last_login_at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'Never logged in'}
                        </div>
                      </td>
                      <td style={{ verticalAlign: 'middle', padding: '1.25rem 0.5rem' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '0.4rem' }}>
                          <span style={{ 
                            display: 'inline-flex', 
                            alignItems: 'center', 
                            gap: '0.4rem', 
                            fontSize: '0.7rem', 
                            fontWeight: '800',
                            padding: '0.25rem 0.65rem',
                            borderRadius: '20px',
                            background: tenant.role === 'super_admin' ? 'rgba(124, 58, 237, 0.1)' : tenant.role === 'billing_admin' ? 'rgba(37, 99, 235, 0.1)' : tenant.role === 'support_admin' ? 'rgba(236, 72, 153, 0.1)' : tenant.role === 'tenant_admin' ? 'rgba(5, 150, 105, 0.08)' : 'rgba(107, 114, 128, 0.08)',
                            color: tenant.role === 'super_admin' ? '#7c3aed' : tenant.role === 'billing_admin' ? '#2563eb' : tenant.role === 'support_admin' ? '#ec4899' : tenant.role === 'tenant_admin' ? '#059669' : '#64748B',
                            border: tenant.role === 'super_admin' ? '1px solid rgba(124, 58, 237, 0.2)' : tenant.role === 'billing_admin' ? '1px solid rgba(37, 99, 235, 0.2)' : tenant.role === 'support_admin' ? '1px solid rgba(236, 72, 153, 0.2)' : tenant.role === 'tenant_admin' ? '1px solid rgba(5, 150, 105, 0.15)' : '1px solid rgba(107, 114, 128, 0.15)'
                          }}>
                            {['super_admin', 'billing_admin', 'support_admin'].includes(tenant.role) ? <ShieldAlert size={12} /> : tenant.role === 'tenant_admin' ? <Hotel size={12} /> : <Users size={12} />}
                            {tenant.role === 'super_admin' ? 'SUPER ADMIN' : tenant.role === 'billing_admin' ? 'BILLING ADMIN' : tenant.role === 'support_admin' ? 'SUPPORT ADMIN' : tenant.role === 'tenant_admin' ? 'TENANT ADMIN' : 'STAFF MEMBER'}
                          </span>
                          
                          {['super_admin', 'billing_admin', 'support_admin'].includes(tenant.role) && (
                            <div style={{ fontSize: '0.8rem', color: '#475569', display: 'flex', flexDirection: 'column', gap: '0.3rem', maxWidth: '200px' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                                <Shield size={13} /> Platform Administrator
                              </div>
                            </div>
                          )}
                          
                          {tenant.role === 'staff' && (
                            <div style={{ fontSize: '0.8rem', color: '#475569', display: 'flex', flexDirection: 'column', gap: '0.3rem', maxWidth: '200px' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                                <Briefcase size={13} /> Under: <strong>{tenant.ownerName}</strong>
                              </div>
                              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.3rem' }}>
                                <Hotel size={13} style={{ marginTop: '0.15rem', flexShrink: 0 }} />
                                <span style={{ lineHeight: 1.4, color: '#0F2C59', fontWeight: 600 }}>
                                  {tenant.propertyNames && tenant.propertyNames.length > 0 ? tenant.propertyNames.join(', ') : <span style={{ color: '#94a3b8', fontStyle: 'italic', fontWeight: 400 }}>No properties assigned</span>}
                                </span>
                              </div>
                            </div>
                          )}

                          {tenant.role === 'tenant_admin' && (
                            <div style={{ fontSize: '0.8rem', color: '#475569', display: 'flex', alignItems: 'flex-start', gap: '0.3rem', maxWidth: '200px' }}>
                              <Hotel size={13} style={{ marginTop: '0.15rem', flexShrink: 0 }} /> 
                              <span style={{ lineHeight: 1.4 }}>
                                {tenant.propertyNames && tenant.propertyNames.length > 0 ? (
                                  <span style={{ color: '#0F2C59', fontWeight: 600 }}>{tenant.propertyNames.join(', ')}</span>
                                ) : (
                                  <span style={{ color: '#94a3b8', fontStyle: 'italic' }}>No properties created</span>
                                )}
                              </span>
                            </div>
                          )}
                        </div>
                      </td>
                      <td style={{ verticalAlign: 'middle', padding: '1.25rem 0.5rem' }}>
                          {['super_admin', 'support_admin', 'billing_admin'].includes(tenant.role) ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                              <div>
                                <div style={{ fontSize: '0.85rem', color: '#0F2C59', fontWeight: 700 }}>Platform Plan</div>
                                <div style={{ fontSize: '0.75rem', color: '#64748B' }}>System Managed</div>
                              </div>
                            </div>
                          ) : tenant.role === 'tenant_admin' ? (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                            <div>
                              <span className={`badge ${tenant.plan_type === 'premium' ? 'badge-primary' : (tenant.plan_type === 'pro' ? 'badge-success' : 'badge-outline')}`}>
                                {pricingConfig[tenant.plan_type]?.name?.toUpperCase() || tenant.plan_type?.toUpperCase() || 'FREE STARTER'}
                              </span>
                            </div>
                            <div style={{ display: 'flex', gap: '1rem', fontSize: '0.75rem', color: '#64748b' }}>
                              <div style={{ display: 'flex', flexDirection: 'column' }}>
                                <span style={{ fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Properties</span>
                                <strong style={{ color: '#1e293b', fontSize: '0.9rem' }}>{tenant.propertyCount || 0}</strong>
                              </div>
                              <div style={{ display: 'flex', flexDirection: 'column' }}>
                                <span style={{ fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Bookings</span>
                                <strong style={{ color: '#1e293b', fontSize: '0.9rem' }}>{tenant.bookingCount || 0}</strong>
                              </div>
                            </div>
                          </div>
                        ) : (
                          <span style={{ color: '#94a3b8', fontSize: '0.8rem', fontStyle: 'italic', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                            <Users size={14} /> Operational Account
                          </span>
                        )}
                      </td>
                      <td style={{ verticalAlign: 'middle', padding: '1.25rem 0.5rem' }}>
                        <div style={{ 
                          display: 'inline-flex', 
                          alignItems: 'center', 
                          gap: '0.35rem', 
                          color: tenant.subscription_status === 'active' ? '#059669' : '#ef4444', 
                          fontSize: '0.75rem',
                          fontWeight: 800,
                          background: tenant.subscription_status === 'active' ? 'rgba(5, 150, 105, 0.08)' : 'rgba(239, 68, 68, 0.08)',
                          padding: '0.35rem 0.75rem',
                          borderRadius: '20px',
                          border: tenant.subscription_status === 'active' ? '1px solid rgba(5, 150, 105, 0.15)' : '1px solid rgba(239, 68, 68, 0.15)'
                        }}>
                          {tenant.subscription_status === 'active' ? <CheckCircle size={14} /> : <XCircle size={14} />}
                          {tenant.subscription_status === 'active' ? 'ACTIVE' : 'SUSPENDED'}
                        </div>
                      </td>
                      <td style={{ verticalAlign: 'middle', padding: '1.25rem 0.5rem' }}>
                        <button 
                          className="btn btn-outline" 
                          style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem', fontWeight: 700, borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '0.4rem', color: '#0F2C59', borderColor: '#cbd5e1' }} 
                          onClick={() => setEditingUser(tenant)}
                        >
                          <Settings size={14} /> Manage
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: PLANS & PRICING */}
      {adminActiveTab === 'plans' && (
        <div style={{ animation: 'fadeIn 0.2s ease-out' }}>
          
          <div className="card" style={{ marginBottom: '2.5rem', background: 'white', border: '1px solid rgba(15, 44, 89, 0.08)', borderRadius: '16px', boxShadow: '0 10px 30px rgba(15, 44, 89, 0.02)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', borderBottom: '1px solid #cbd5e1', paddingBottom: '1rem', flexWrap: 'wrap', gap: '1rem' }}>
              <div style={{ display: 'flex', gap: '2rem' }}>
                <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: pricingTab === 'plans' ? '#0F2C59' : '#64748b', margin: 0, cursor: 'pointer', borderBottom: pricingTab === 'plans' ? '3px solid var(--primary)' : '3px solid transparent', paddingBottom: '0.5rem', fontWeight: 800, fontFamily: "'Outfit', sans-serif" }} onClick={() => setPricingTab('plans')}>
                  <DollarSign size={18} /> Internal Pricing Tiers
                </h3>
                <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: pricingTab === 'website' ? '#0F2C59' : '#64748b', margin: 0, cursor: 'pointer', borderBottom: pricingTab === 'website' ? '3px solid var(--primary)' : '3px solid transparent', paddingBottom: '0.5rem', fontWeight: 800, fontFamily: "'Outfit', sans-serif" }} onClick={() => setPricingTab('website')}>
                  Website Pricing (Marketing)
                </h3>
                <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: pricingTab === 'razorpay' ? '#0F2C59' : '#64748b', margin: 0, cursor: 'pointer', borderBottom: pricingTab === 'razorpay' ? '3px solid var(--primary)' : '3px solid transparent', paddingBottom: '0.5rem', fontWeight: 800, fontFamily: "'Outfit', sans-serif" }} onClick={() => setPricingTab('razorpay')}>
                  Razorpay Gateway Settings
                </h3>
              </div>
              {pricingTab === 'plans' && (
                <button className="btn btn-outline" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 700 }} onClick={() => {
                  const newId = `custom_${Date.now()}`;
                  setPricingConfig({
                    ...pricingConfig,
                    [newId]: {
                      name: 'New Custom Plan',
                      description: 'Description here',
                      enabled: true,
                      price: 999,
                      maxResorts: 1,
                      maxRooms: 10,
                      color: 'var(--primary)',
                      features: [{ name: 'New Feature', enabled: true }]
                    }
                  });
                }}>
                  + Create New Plan
                </button>
              )}
            </div>
            
            {pricingTab === 'plans' && (
              <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '2rem', textAlign: 'left' }}>
              
              {Object.entries(pricingConfig).sort(([a], [b]) => { const order = ['free', 'pro', 'luxury']; const idxA = order.indexOf(a); const idxB = order.indexOf(b); return (idxA === -1 ? 999 : idxA) - (idxB === -1 ? 999 : idxB); }).map(([planKey, plan]) => {
                const titleColor = plan.color || 'var(--primary)';
                const titleName = plan.name || planKey.toUpperCase();
                
                return (
                  <div key={planKey} style={{ background: '#f8fafc', padding: '2rem 1.5rem', borderRadius: '12px', border: '1px solid #cbd5e1', opacity: plan.enabled ? 1 : 0.6, transition: 'all 0.3s' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', borderBottom: '2px solid #cbd5e1', paddingBottom: '0.75rem' }}>
                      <h4 style={{ color: titleColor, margin: 0, fontSize: '1.2rem', fontWeight: 800, fontFamily: "'Outfit', sans-serif" }}>{titleName}</h4>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <input 
                            type="checkbox" 
                            id={`enable-${planKey}`}
                            checked={plan.enabled}
                            onChange={e => setPricingConfig({...pricingConfig, [planKey]: {...plan, enabled: e.target.checked}})}
                          />
                          <label htmlFor={`enable-${planKey}`} style={{ fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer' }}>Enabled</label>
                        </div>
                        {!['free', 'pro', 'luxury'].includes(planKey) && (
                          <button 
                            type="button"
                            onClick={() => {
                              if (window.confirm(`Are you sure you want to permanently delete the ${plan.name} plan?`)) {
                                const newConfig = { ...pricingConfig };
                                delete newConfig[planKey];
                                setPricingConfig(newKey => newConfig);
                              }
                            }}
                            style={{ background: 'none', border: 'none', color: 'var(--danger)', cursor: 'pointer', padding: '0.25rem' }}
                            title="Delete Plan"
                          >
                            <Trash2 size={16} />
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="form-group" style={{ marginBottom: '1rem' }}>
                      <label className="form-label">Plan Name</label>
                      <input type="text" className="form-input" value={plan.name || ''} onChange={e => setPricingConfig({...pricingConfig, [planKey]: {...plan, name: e.target.value}})} disabled={!plan.enabled} />
                    </div>
                    
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.5rem', marginBottom: '1rem' }}>
                      <div className="form-group">
                        <label className="form-label" style={{ fontSize: '0.75rem' }}>Max Properties</label>
                        <input type="number" className="form-input" value={plan.maxResorts === 999999 ? '' : plan.maxResorts} onChange={e => setPricingConfig({...pricingConfig, [planKey]: {...plan, maxResorts: e.target.value ? e.target.value === '' ? '' : Number(e.target.value) : 999999}})} placeholder="Unlimited" disabled={!plan.enabled} />
                      </div>
                      <div className="form-group">
                        <label className="form-label" style={{ fontSize: '0.75rem' }}>Max Rooms</label>
                        <input type="number" className="form-input" value={plan.maxRooms === 999999 ? '' : plan.maxRooms} onChange={e => setPricingConfig({...pricingConfig, [planKey]: {...plan, maxRooms: e.target.value ? e.target.value === '' ? '' : Number(e.target.value) : 999999}})} placeholder="Unlimited" disabled={!plan.enabled} />
                      </div>
                      <div className="form-group">
                        <label className="form-label" style={{ fontSize: '0.75rem' }}>Max Staff</label>
                        <input type="number" className="form-input" value={plan.maxStaff === 999999 ? '' : plan.maxStaff} onChange={e => setPricingConfig({...pricingConfig, [planKey]: {...plan, maxStaff: e.target.value ? e.target.value === '' ? '' : Number(e.target.value) : 999999}})} placeholder="Unlimited" disabled={!plan.enabled} />
                      </div>
                    </div>

                    <div className="form-group">
                      <label className="form-label">Base Rate (₹/month)</label>
                      <input type="number" className="form-input" value={plan.price || 0} onChange={e => setPricingConfig({...pricingConfig, [planKey]: {...plan, price: e.target.value === '' ? '' : Number(e.target.value)}})} disabled={!plan.enabled} />
                    </div>
                    <div className="form-group" style={{ marginTop: '1rem' }}>
                      <label className="form-label">Promotional Offer Rate (₹/month)</label>
                      <input type="number" className="form-input" value={plan.offerPrice || ''} onChange={e => setPricingConfig({...pricingConfig, [planKey]: {...plan, offerPrice: e.target.value === '' ? '' : Number(e.target.value)}})} disabled={!plan.enabled} />
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginTop: '1rem' }}>
                      <div className="form-group">
                        <label className="form-label">Offer Starts</label>
                        <input type="date" className="form-input" value={plan.offerStartDate || ''} onChange={e => setPricingConfig({...pricingConfig, [planKey]: {...plan, offerStartDate: e.target.value}})} disabled={!plan.offerActive || !plan.enabled} />
                      </div>
                      <div className="form-group">
                        <label className="form-label">Offer Ends</label>
                        <input type="date" className="form-input" value={plan.offerEndDate || ''} onChange={e => setPricingConfig({...pricingConfig, [planKey]: {...plan, offerEndDate: e.target.value}})} disabled={!plan.offerActive || !plan.enabled} />
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '1.25rem', background: plan.offerActive ? 'rgba(5, 150, 105, 0.08)' : 'transparent', padding: '0.5rem', borderRadius: '6px', border: plan.offerActive ? '1px solid rgba(5, 150, 105, 0.15)' : 'none' }}>
                      <input type="checkbox" id={`offer-${planKey}`} checked={plan.offerActive || false} onChange={e => setPricingConfig({...pricingConfig, [planKey]: {...plan, offerActive: e.target.checked}})} style={{ width: '18px', height: '18px' }} disabled={!plan.enabled} />
                      <label htmlFor={`offer-${planKey}`} style={{ fontWeight: 'bold', color: plan.offerActive ? '#059669' : 'var(--text-muted)', cursor: 'pointer', fontSize: '0.85rem' }}>Activate Offer</label>
                    </div>
                    
                    <div style={{ marginTop: '1.5rem', paddingTop: '1.5rem', borderTop: '1px solid #cbd5e1' }}>
                      <h5 style={{ marginBottom: '1rem', color: '#0F2C59', fontSize: '0.85rem', textTransform: 'uppercase', fontWeight: 800 }}>Enabled Reports</h5>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                        {[
                          { id: 'summary', label: 'Performance Summary' },
                          { id: 'bookings', label: 'Booking Details' },
                          { id: 'guests', label: 'Guest Contacts' },
                          { id: 'finance', label: 'Income & Expenses' },
                          { id: 'investment', label: 'Investment Analysis' }
                        ].map(report => (
                          <div key={report.id} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <input 
                              type="checkbox" 
                              id={`report-${planKey}-${report.id}`}
                              checked={plan.reports?.[report.id] ?? true}
                              onChange={(e) => {
                                const newReports = { ...(plan.reports || {}), [report.id]: e.target.checked };
                                setPricingConfig({...pricingConfig, [planKey]: {...plan, reports: newReports}});
                              }}
                              disabled={!plan.enabled}
                            />
                            <label htmlFor={`report-${planKey}-${report.id}`} style={{ fontSize: '0.85rem', cursor: 'pointer', fontWeight: 600, color: '#475569' }}>{report.label}</label>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div style={{ marginTop: '1.5rem', paddingTop: '1.5rem', borderTop: '1px solid #cbd5e1' }}>
                      <h5 style={{ marginBottom: '1rem', color: '#0F2C59', fontSize: '0.85rem', textTransform: 'uppercase', fontWeight: 800 }}>Export Permissions</h5>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                        {[
                          { id: 'exportExcel', label: 'Allow Export to Excel' },
                          { id: 'exportPdf', label: 'Allow Export to PDF' }
                        ].map(exportOption => (
                          <div key={exportOption.id} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <input 
                              type="checkbox" 
                              id={`export-${planKey}-${exportOption.id}`}
                              checked={plan.reports?.[exportOption.id] ?? true}
                              onChange={(e) => {
                                const newReports = { ...(plan.reports || {}), [exportOption.id]: e.target.checked };
                                setPricingConfig({...pricingConfig, [planKey]: {...plan, reports: newReports}});
                              }}
                              disabled={!plan.enabled}
                            />
                            <label htmlFor={`export-${planKey}-${exportOption.id}`} style={{ fontSize: '0.85rem', cursor: 'pointer', fontWeight: 600, color: '#475569' }}>{exportOption.label}</label>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div style={{ marginTop: '1.5rem', paddingTop: '1.5rem', borderTop: '1px solid #cbd5e1' }}>
                      <h5 style={{ marginBottom: '1rem', color: '#0F2C59', fontSize: '0.85rem', textTransform: 'uppercase', fontWeight: 800 }}>Included Features</h5>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                        {plan.features.map((feat, idx) => (
                          <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <input 
                              type="checkbox" 
                              checked={feat.enabled} 
                              onChange={(e) => {
                                const newFeats = [...plan.features];
                                newFeats[idx] = { ...newFeats[idx], enabled: e.target.checked };
                                setPricingConfig({...pricingConfig, [planKey]: {...plan, features: newFeats}});
                              }}
                              disabled={!plan.enabled}
                            />
                            <input 
                              type="text" 
                              className="form-input" 
                              value={feat.name}
                              onChange={(e) => {
                                const newFeats = [...plan.features];
                                newFeats[idx] = { ...newFeats[idx], name: e.target.value };
                                setPricingConfig({...pricingConfig, [planKey]: {...plan, features: newFeats}});
                              }}
                              style={{ padding: '0.35rem 0.5rem', fontSize: '0.85rem', flex: 1 }}
                              disabled={!plan.enabled}
                            />
                            
                            <div style={{ display: 'flex', gap: '0.1rem' }}>
                              <button 
                                type="button"
                                className="btn-outline" 
                                style={{ padding: '0.25rem', color: 'var(--primary)', border: 'none', background: 'transparent' }}
                                onClick={() => {
                                  const newFeats = [...plan.features];
                                  newFeats.splice(idx + 1, 0, { name: 'New Feature', enabled: true });
                                  setPricingConfig({...pricingConfig, [planKey]: {...plan, features: newFeats}});
                                }}
                                disabled={!plan.enabled}
                                title="Insert feature below"
                              >
                                <Plus size={14} />
                              </button>
                              
                              <button 
                                type="button"
                                className="btn-outline" 
                                style={{ padding: '0.25rem', color: 'var(--text-muted)', border: 'none', background: 'transparent' }}
                                onClick={() => {
                                  if (idx === 0) return;
                                  const newFeats = [...plan.features];
                                  const temp = newFeats[idx - 1];
                                  newFeats[idx - 1] = newFeats[idx];
                                  newFeats[idx] = temp;
                                  setPricingConfig({...pricingConfig, [planKey]: {...plan, features: newFeats}});
                                }}
                                disabled={!plan.enabled || idx === 0}
                                title="Move up"
                              >
                                <ArrowUp size={14} />
                              </button>
                              
                              <button 
                                type="button"
                                className="btn-outline" 
                                style={{ padding: '0.25rem', color: 'var(--text-muted)', border: 'none', background: 'transparent' }}
                                onClick={() => {
                                  if (idx === plan.features.length - 1) return;
                                  const newFeats = [...plan.features];
                                  const temp = newFeats[idx + 1];
                                  newFeats[idx + 1] = newFeats[idx];
                                  newFeats[idx] = temp;
                                  setPricingConfig({...pricingConfig, [planKey]: {...plan, features: newFeats}});
                                }}
                                disabled={!plan.enabled || idx === plan.features.length - 1}
                                title="Move down"
                              >
                                <ArrowDown size={14} />
                              </button>

                              <button 
                                type="button"
                                className="btn-outline" 
                                style={{ padding: '0.25rem', color: 'var(--danger)', border: 'none', background: 'transparent' }}
                                onClick={() => {
                                  const newFeats = plan.features.filter((_, i) => i !== idx);
                                  setPricingConfig({...pricingConfig, [planKey]: {...plan, features: newFeats}});
                                }}
                                disabled={!plan.enabled}
                                title="Delete feature"
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          </div>
                        ))}
                        <button 
                          type="button"
                          className="btn btn-outline" 
                          style={{ marginTop: '0.5rem', fontSize: '0.8rem', padding: '0.5rem', fontWeight: 700 }}
                          onClick={() => {
                            const newFeats = [...plan.features, { name: 'New Feature', enabled: true }];
                            setPricingConfig({...pricingConfig, [planKey]: {...plan, features: newFeats}});
                          }}
                          disabled={!plan.enabled}
                        >
                          + Add Feature
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div style={{ marginTop: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <button 
                className="btn btn-outline" 
                onClick={() => {
                  const newKey = 'plan_' + Date.now();
                  setPricingConfig({
                    ...pricingConfig,
                    [newKey]: {
                      name: 'New Custom Plan',
                      description: 'Custom plan description',
                      enabled: true,
                      price: 0,
                      maxResorts: 1,
                      maxRooms: 10,
                      maxStaff: 1,
                      color: '#0ea5e9',
                      reports: { summary: true, bookings: true, guests: true, finance: true, exportExcel: true, exportPdf: true },
                      features: [
                        { name: 'Basic feature', enabled: true }
                      ]
                    }
                  });
                }}
                disabled={isUpdating}
                style={{ fontWeight: 700 }}
              >
                + Add New Pricing Tier
              </button>
              
              <button className="btn btn-primary" onClick={handleSavePricing} disabled={isUpdating} style={{ padding: '0.75rem 2rem', fontWeight: 700 }}>
                {isUpdating ? 'Saving Changes...' : 'Broadcast Prices Globally'}
              </button>
            </div>
              </>
            )}

            {pricingTab === 'website' && (
              <WebsitePricingTab 
                internalPricing={pricingConfig}
                websitePricingConfig={websitePricingConfig}
                onSaveDraft={handleSaveWebsiteDraft}
                onPublish={handlePublishWebsitePricing}
                onRollback={handleRollbackWebsitePricing}
              />
            )}
            {/* RAZORPAY TAB CONTENT */}
            {pricingTab === 'razorpay' && (
              <div style={{ padding: '2rem' }}>
                <h2 style={{ fontSize: '1.5rem', marginBottom: '1.5rem', color: '#0F2C59' }}>Razorpay Configuration</h2>
                <div style={{ display: 'grid', gap: '1.5rem', maxWidth: '600px' }}>
                  
                  <div className="form-group" style={{ background: '#f8fafc', padding: '1.5rem', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 'bold', fontSize: '1.1rem', marginBottom: '1rem', color: '#1e293b' }}>
                      Operating Mode
                    </label>
                    <div style={{ display: 'flex', gap: '1rem' }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                        <input type="radio" name="razorpayMode" checked={razorpayConfig.mode === 'test'} onChange={() => setRazorpayConfig({...razorpayConfig, mode: 'test'})} style={{ width: '18px', height: '18px' }} />
                        <span style={{ fontWeight: 600 }}>TEST Mode</span>
                      </label>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                        <input type="radio" name="razorpayMode" checked={razorpayConfig.mode === 'live'} onChange={() => setRazorpayConfig({...razorpayConfig, mode: 'live'})} style={{ width: '18px', height: '18px' }} />
                        <span style={{ fontWeight: 600, color: '#ef4444' }}>LIVE Mode</span>
                      </label>
                    </div>
                    <p style={{ fontSize: '0.85rem', color: '#64748b', marginTop: '0.5rem' }}>
                      {razorpayConfig.mode === 'test' ? 'Currently using Test credentials. No real charges will be made.' : 'WARNING: Live mode is active. Real transactions will be processed.'}
                    </p>
                  </div>

                  <div className="card" style={{ padding: '1.5rem', border: '1px solid #e2e8f0' }}>
                    <h4 style={{ marginBottom: '1rem', color: '#334155' }}>Test Credentials</h4>
                    <div className="form-group">
                      <label className="form-label">Test Key ID</label>
                      <input type="text" className="form-input" value={razorpayConfig.testKeyId} onChange={e => setRazorpayConfig({...razorpayConfig, testKeyId: e.target.value})} placeholder="rzp_test_..." />
                    </div>
                    <div className="form-group" style={{ marginTop: '1rem' }}>
                      <label className="form-label">Test Key Secret</label>
                      <input type="password" className="form-input" value={razorpayConfig.testKeySecret} onChange={e => setRazorpayConfig({...razorpayConfig, testKeySecret: e.target.value})} placeholder="••••••••••••••••" />
                    </div>
                  </div>

                  <div className="card" style={{ padding: '1.5rem', border: '1px solid #e2e8f0' }}>
                    <h4 style={{ marginBottom: '1rem', color: '#ef4444' }}>Live Credentials</h4>
                    <div className="form-group">
                      <label className="form-label">Live Key ID</label>
                      <input type="text" className="form-input" value={razorpayConfig.liveKeyId} onChange={e => setRazorpayConfig({...razorpayConfig, liveKeyId: e.target.value})} placeholder="rzp_live_..." />
                    </div>
                    <div className="form-group" style={{ marginTop: '1rem' }}>
                      <label className="form-label">Live Key Secret</label>
                      <input type="password" className="form-input" value={razorpayConfig.liveKeySecret} onChange={e => setRazorpayConfig({...razorpayConfig, liveKeySecret: e.target.value})} placeholder="••••••••••••••••" />
                    </div>
                  </div>

                  <div className="card" style={{ padding: '1.5rem', border: '1px solid #e2e8f0' }}>
                    <h4 style={{ marginBottom: '1rem', color: '#334155' }}>Webhook Settings</h4>
                    <div className="form-group">
                      <label className="form-label">Webhook Secret</label>
                      <input type="password" className="form-input" value={razorpayConfig.webhookSecret} onChange={e => setRazorpayConfig({...razorpayConfig, webhookSecret: e.target.value})} placeholder="••••••••••••••••" />
                      <p style={{ fontSize: '0.8rem', color: '#64748b', marginTop: '0.5rem' }}>Used to verify incoming Razorpay webhook signatures.</p>
                    </div>
                  </div>
                  
                  <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1rem' }}>
                    <button className="btn btn-primary" onClick={handleSaveRazorpaySettings} disabled={isUpdating}>
                      {isUpdating ? 'Saving...' : 'Save Razorpay Settings'}
                    </button>
                  </div>

                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 4: PLATFORM CONFIGURATION */}
      {adminActiveTab === 'settings' && (
        <div style={{ animation: 'fadeIn 0.2s ease-out' }}>
          {/* Global Feature Controls */}
          <div className="card" style={{ marginBottom: '2.5rem', background: 'white', border: '1px solid rgba(15, 44, 89, 0.08)', borderRadius: '16px', boxShadow: '0 10px 30px rgba(15, 44, 89, 0.02)', textAlign: 'left' }}>
            <h3 style={{ marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#0F2C59', fontWeight: 800, fontFamily: "'Outfit', sans-serif" }}>
              <Shield size={20} /> Global Feature Toggles
            </h3>
            <p style={{ color: 'var(--text-muted)', marginBottom: '1.5rem', fontSize: '0.9rem' }}>Enable or disable system features platform-wide for all resorts.</p>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem', background: '#f8fafc', padding: '1rem 1.5rem', borderRadius: '8px', border: '1px solid #cbd5e1' }}>
                <input 
                  type="checkbox" 
                  id="global_comm" 
                  checked={globalCommEnabled} 
                  onChange={e => setGlobalCommEnabled(e.target.checked)} 
                  style={{ width: '20px', height: '20px', cursor: 'pointer' }}
                />
                <label htmlFor="global_comm" style={{ fontWeight: 'bold', color: '#1e293b', cursor: 'pointer', fontSize: '0.9rem' }}>
                  {"Enable General Setting -> Communications & Automations Globally"}
                </label>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem', background: '#f8fafc', padding: '1rem 1.5rem', borderRadius: '8px', border: '1px solid #cbd5e1' }}>
                <input 
                  type="checkbox" 
                  id="global_templates" 
                  checked={globalTemplatesEnabled} 
                  onChange={e => setGlobalTemplatesEnabled(e.target.checked)} 
                  style={{ width: '20px', height: '20px', cursor: 'pointer' }}
                />
                <label htmlFor="global_templates" style={{ fontWeight: 'bold', color: '#1e293b', cursor: 'pointer', fontSize: '0.9rem' }}>
                  {"Enable Settings -> Template Management Globally"}
                </label>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem', background: '#f8fafc', padding: '1rem 1.5rem', borderRadius: '8px', border: '1px solid #cbd5e1' }}>
                <input 
                  type="checkbox" 
                  id="global_onboarding" 
                  checked={globalOnboardingWizardEnabled} 
                  onChange={e => setGlobalOnboardingWizardEnabled(e.target.checked)} 
                  style={{ width: '20px', height: '20px', cursor: 'pointer' }}
                />
                <label htmlFor="global_onboarding" style={{ fontWeight: 'bold', color: '#1e293b', cursor: 'pointer', fontSize: '0.9rem' }}>
                  {"Enable Onboarding Wizard for New Tenants"}
                </label>
              </div>
            </div>

            <div style={{ marginTop: '1.5rem', textAlign: 'right' }}>
              <button className="btn btn-primary" onClick={handleSaveGlobalFeatures} disabled={isUpdating} style={{ padding: '0.75rem 2rem', fontWeight: 700 }}>
                {isUpdating ? 'Saving...' : 'Broadcast Feature Controls'}
              </button>
            </div>
          </div>
        </div>
      )}

      {adminActiveTab === 'website_manager' && (
        <WebsiteManagerTab 
          landingContent={landingContent} 
          setLandingContent={setLandingContent} 
          onSave={handleSaveLandingPage}
          isUpdating={isUpdating}
        />
      )}

      {adminActiveTab === 'support' && (
        <SupportInbox superAdminProfile={profile} />
      )}

      {/* Account Management Modal */}
      {editingUser && (
        <div className="modal-overlay" style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.7)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="card" style={{ width: '420px', maxWidth: '90%', animation: 'scaleUp 0.2s ease-out', textAlign: 'left', borderRadius: '16px', padding: '2rem' }}>
            <h2 style={{ marginBottom: '1.5rem', color: '#0F2C59', fontWeight: 800, fontFamily: "'Outfit', sans-serif" }}>Manage Account</h2>
            <div style={{ marginBottom: '1.5rem', padding: '1rem', background: 'rgba(15, 44, 89, 0.05)', borderRadius: '8px', border: '1px solid rgba(15, 44, 89, 0.1)' }}>
              <p style={{ margin: 0, fontWeight: 800, color: '#0F2C59' }}>{editingUser.full_name}</p>
              <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--primary)', fontWeight: 600 }}>{editingUser.email}</p>
              <p style={{ margin: '0.25rem 0 0', fontSize: '0.75rem', color: 'var(--text-muted)' }}>ID: {editingUser.id}</p>
            </div>

            <form onSubmit={handleUpdateUser}>
              <div className="form-group" style={{ marginBottom: '1rem' }}>
                <label className="form-label">Email Address</label>
                <input 
                  type="email" 
                  className="form-input" 
                  value={editingUser.email || ''} 
                  onChange={e => setEditingUser({...editingUser, email: e.target.value})}
                  placeholder="e.g. email@example.com"
                />
              </div>

              <div className="form-group" style={{ marginBottom: '1rem' }}>
                <label className="form-label">Subscription Plan</label>
                <select 
                  className="form-select" 
                  value={editingUser.plan_type} 
                  onChange={e => setEditingUser({...editingUser, plan_type: e.target.value})}
                  disabled={editingUser.role === 'staff'}
                >
                  {Object.entries(pricingConfig).sort(([a], [b]) => { const order = ['free', 'pro', 'luxury']; const idxA = order.indexOf(a); const idxB = order.indexOf(b); return (idxA === -1 ? 999 : idxA) - (idxB === -1 ? 999 : idxB); }).map(([planKey, planVal]) => (
                    <option key={planKey} value={planKey}>{planVal.name?.toUpperCase() || planKey.toUpperCase()}</option>
                  ))}
                </select>
                {editingUser.role === 'staff' && <small style={{ color: 'var(--text-muted)' }}>Plans apply to Tenants only</small>}
              </div>

              <div className="form-group" style={{ marginBottom: '1.5rem' }}>
                <label className="form-label">Account Status</label>
                <select 
                  className="form-select" 
                  value={editingUser.subscription_status || 'active'} 
                  onChange={e => setEditingUser({...editingUser, subscription_status: e.target.value})}
                >
                  <option value="active">Active</option>
                  <option value="suspended">Suspended</option>
                </select>
              </div>

              <div className="form-group" style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.8rem', padding: '0.8rem', background: 'rgba(5, 150, 105, 0.04)', borderRadius: '8px', border: '1px solid rgba(5, 150, 105, 0.1)' }}>
                <input 
                  type="checkbox" 
                  id="feat_inv" 
                  checked={!!editingUser.feature_investment_enabled} 
                  onChange={e => setEditingUser({...editingUser, feature_investment_enabled: e.target.checked})} 
                  style={{ width: '20px', height: '20px', cursor: 'pointer' }}
                />
                <label htmlFor="feat_inv" style={{ fontWeight: 600, cursor: 'pointer', fontSize: '0.85rem', color: '#0F2C59' }}>Enable Investment Analysis</label>
              </div>

              <div className="form-group" style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.8rem', padding: '0.8rem', background: 'rgba(5, 150, 105, 0.04)', borderRadius: '8px', border: '1px solid rgba(5, 150, 105, 0.1)' }}>
                <input 
                  type="checkbox" 
                  id="feat_comm" 
                  checked={editingUser.feature_comm_enabled !== false} 
                  onChange={e => setEditingUser({...editingUser, feature_comm_enabled: e.target.checked})} 
                  style={{ width: '20px', height: '20px', cursor: 'pointer' }}
                />
                <label htmlFor="feat_comm" style={{ fontWeight: 600, cursor: 'pointer', fontSize: '0.85rem', color: '#0F2C59' }}>Enable Communications & Automations</label>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <button 
                  type="button" 
                  className={`btn ${confirmingDelete ? 'btn-primary' : 'btn-outline'}`} 
                  style={{ color: confirmingDelete ? 'white' : 'var(--danger)', background: confirmingDelete ? 'var(--danger)' : 'transparent', fontSize: '0.9rem', fontWeight: 700 }} 
                  onClick={() => deleteAccount(editingUser.id, editingUser.full_name)}
                >
                  {confirmingDelete ? 'Confirm Delete' : 'Delete Account'}
                </button>
                <button type="submit" className="btn btn-primary" style={{ fontSize: '0.9rem', fontWeight: 700 }} disabled={isUpdating || confirmingDelete}>
                  {isUpdating ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
              <button type="button" className="btn btn-link" style={{ width: '100%', marginTop: '1rem', fontWeight: 600 }} onClick={() => {
                setEditingUser(null);
                setConfirmingDelete(false);
              }}>
                Cancel
              </button>
            </form>
          </div>
        </div>
      )}
      
      {/* TAB: EMAIL TEMPLATES */}
      {adminActiveTab === 'emails' && (
        <div style={{ animation: 'fadeIn 0.2s ease-out' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
            <div>
              <h2 style={{ fontSize: '1.5rem', color: '#0F2C59', fontWeight: 800, fontFamily: "'Outfit', sans-serif" }}>Email Template Builder</h2>
              <p style={{ color: 'var(--text-muted)', margin: 0, fontSize: '0.9rem' }}>Customize the exact HTML sent to customers and admins for various lifecycle events.</p>
            </div>
            <div style={{ display: 'flex', gap: '0.8rem' }}>
              <button 
                className="btn btn-outline" 
                onClick={() => setEmailTemplates(DEFAULT_EMAIL_TEMPLATES)}
              >
                <RefreshCw size={18} /> Reset to Elegant Defaults
              </button>
              <button className="btn btn-primary" onClick={handleSaveEmailTemplates} disabled={isUpdating}>
                <Save size={18} /> {isUpdating ? 'Saving...' : 'Save All Templates'}
              </button>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '2rem' }}>
            {Object.entries(emailTemplates).map(([key, template]) => (
              <div key={key} className="card" style={{ padding: '2rem', border: '1px solid rgba(15, 44, 89, 0.08)', borderRadius: '16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
                  <h3 style={{ margin: 0, color: '#0F2C59', fontWeight: 700, textTransform: 'capitalize' }}>
                    {key.replace('_', ' ')}
                  </h3>
                  <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                    <div style={{ fontSize: '0.85rem', color: '#64748B', background: '#f8fafc', padding: '0.25rem 0.75rem', borderRadius: '4px', border: '1px solid #e2e8f0' }}>
                      Variables: <code>{key === 'welcome' ? '{{tenant_name}}, {{tenant_email}}' : key === 'payment_receipt' ? '{{amount}}, {{payment_id}}' : '{{plan_name}}, {{period_end}}, {{tenant_email}}'}</code>
                    </div>
                    <button 
                      className="btn btn-outline" 
                      style={{ padding: '0.25rem 0.75rem', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}
                      onClick={() => setPreviewTemplate({ key, ...template })}
                    >
                      <Eye size={14} /> Preview
                    </button>
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label">Email Subject</label>
                  <input type="text" className="form-input" value={template.subject} onChange={(e) => setEmailTemplates({...emailTemplates, [key]: {...template, subject: e.target.value}})} />
                </div>
                <div className="form-group">
                  <label className="form-label">HTML Body Template</label>
                  <textarea 
                    className="form-input" 
                    rows={8} 
                    style={{ fontFamily: 'monospace', fontSize: '0.9rem', background: '#1e293b', color: '#e2e8f0', minHeight: '200px', height: 'auto', resize: 'vertical' }}
                    value={template.html} 
                    onChange={(e) => setEmailTemplates({...emailTemplates, [key]: {...template, html: e.target.value}})} 
                  />
                  <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.5rem' }}>Use standard HTML tags like &lt;h1&gt;, &lt;p&gt;, &lt;strong&gt;, etc. Variables wrapped in double braces will be replaced dynamically.</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Email Template Preview Modal */}
      {previewTemplate && (
        <div className="modal-overlay" style={{ display: 'flex', zIndex: 1000 }} onClick={() => setPreviewTemplate(null)}>
          <div className="modal-content" style={{ maxWidth: '800px', width: '90%', padding: 0, overflow: 'hidden' }} onClick={e => e.stopPropagation()}>
            <div style={{ padding: '1.5rem', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h3 style={{ margin: 0, color: '#0F2C59', fontWeight: 800 }}>Preview: {previewTemplate.key.replace('_', ' ')}</h3>
                <p style={{ margin: 0, fontSize: '0.85rem', color: '#64748B', marginTop: '0.25rem' }}>Subject: <strong>{previewTemplate.subject}</strong></p>
              </div>
              <button className="btn btn-outline" style={{ padding: '0.5rem' }} onClick={() => setPreviewTemplate(null)}>
                <XCircle size={20} />
              </button>
            </div>
            <div style={{ padding: '2rem', background: 'white', minHeight: '300px', maxHeight: '60vh', overflowY: 'auto' }}>
              <div 
                dangerouslySetInnerHTML={{ __html: previewTemplate.html
                  .replace(/{{tenant_name}}/g, 'John Doe')
                  .replace(/{{tenant_email}}/g, 'john@example.com')
                  .replace(/{{plan_name}}/g, 'Stay Pilot Premium')
                  .replace(/{{period_end}}/g, new Date().toLocaleDateString())
                  .replace(/{{amount}}/g, '2999.00')
                  .replace(/{{payment_id}}/g, 'pay_ABC123XYZ') 
                }} 
              />
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
