import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders })

  try {
    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    if (!resendApiKey) {
      throw new Error("RESEND_API_KEY is not configured in Edge Function secrets.");
    }
    const fromAddress = "hello@staypilot.co.in";
    
    // Admin client to fetch user details securely
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )
    
    const payload = await req.json();
    const { type, record, event_data } = payload;
    
    console.log(`Processing saas-mailer event: ${type}`);

    const emailsToSend = [];
    const superAdminEmail = "uhariff@gmail.com";

    let emailTemplates = {};
    let nicePlanName = event_data?.plan_type || 'Free Starter';
    try {
      const { data: adminProfiles } = await supabaseAdmin.from('profiles').select('global_settings').eq('role', 'super_admin').limit(1);
      const settings = adminProfiles?.[0]?.global_settings || {};
      emailTemplates = settings.email_templates || {};
      
      const globalPlans = settings.pricing || {};
      if (event_data?.plan_type) {
        if (globalPlans[event_data.plan_type]) {
          nicePlanName = globalPlans[event_data.plan_type].name || event_data.plan_type;
        } else {
          if (event_data.plan_type === 'solo') nicePlanName = 'Stay Pilot Solo';
          if (event_data.plan_type === 'premium') nicePlanName = 'Stay Pilot Luxury Premium';
          if (event_data.plan_type === 'pro') nicePlanName = 'Stay Pilot Pro Manager';
          if (event_data.plan_type === 'free') nicePlanName = 'Free Starter';
        }
      }
    } catch (e) {
      console.warn('Could not fetch global settings', e);
    }

    const renderTemplate = (templateKey, defaultHtml, defaultSubject, variables) => {
      let html = emailTemplates[templateKey]?.html || defaultHtml;
      let subject = emailTemplates[templateKey]?.subject || defaultSubject;
      
      if (html) {
        // Strip linear-gradients and use solid fallbacks to satisfy clients like Yahoo Mail that strip the whole style attribute when a gradient is encountered
        html = html
          .replace(/background:\s*linear-gradient\(135deg,\s*#0F2C59\s+0%,\s*#1a4a8f\s+100%\);?/gi, 'background-color: #0F2C59;')
          .replace(/background:\s*linear-gradient\(135deg,\s*#10b981\s+0%,\s*#059669\s+100%\);?/gi, 'background-color: #10b981;')
          .replace(/background:\s*linear-gradient\(135deg,\s*#475569\s+0%,\s*#1e293b\s+100%\);?/gi, 'background-color: #475569;')
          .replace(/background-color:\s*#0F2C59;\s*background:\s*linear-gradient\([^)]+\);?/gi, 'background-color: #0F2C59;')
          .replace(/background-color:\s*#10b981;\s*background:\s*linear-gradient\([^)]+\);?/gi, 'background-color: #10b981;')
          .replace(/background-color:\s*#475569;\s*background:\s*linear-gradient\([^)]+\);?/gi, 'background-color: #475569;')
          .replace(/background:\s*linear-gradient\([^)]+\);?/gi, 'background-color: #0F2C59;');
      }

      for (const [key, value] of Object.entries(variables)) {
        const regex = new RegExp(`{{${key}}}`, 'g');
        html = html.replace(regex, value || '');
        subject = subject.replace(regex, value || '');
      }
      return { html, subject };
    };

    // 1. New Tenant Registration (Fired by DB Trigger - Now Ignored)
    if (type === "new_tenant_alert") {
      console.log("Ignored instant trigger. Waiting for email confirmation.");
    }
    // 1.5 Tenant Welcome (Fired from frontend after verification)
    else if (type === "tenant_welcome") {
      const tenantData = record || event_data;
      let tenantEmail = tenantData.email;
      
      if (!tenantEmail && tenantData.id) {
        const { data: userResponse } = await supabaseAdmin.auth.admin.getUserById(tenantData.id);
        if (userResponse?.user) tenantEmail = userResponse.user.email;
      }

      emailsToSend.push({
        to: superAdminEmail,
        subject: `New Customer Registration: ${tenantEmail || 'Unknown Email'}`,
        html: `<h1>New Customer Signed Up!</h1><p>Email: ${tenantEmail || 'Unknown'}</p><p>Name: ${tenantData.full_name || 'N/A'}</p>`
      });

      if (tenantEmail) {
        const { html, subject } = renderTemplate('welcome', 
          `<h1>Welcome to StayPilot!</h1>\n<p>Hi {{tenant_name}},</p>\n<p>Thank you for choosing StayPilot to manage your property! We are thrilled to have you onboard.</p>`,
          "Welcome to StayPilot!",
          { tenant_name: tenantData.full_name || 'there', tenant_email: tenantEmail }
        );
        emailsToSend.push({ to: tenantEmail, subject, html });
      }
    } 
    // 2. Subscription Activation/Upgrade
    else if (type === "subscription_activated") {
      emailsToSend.push({
        to: superAdminEmail,
        subject: `Plan Upgrade: ${event_data.tenant_email}`,
        html: `<h1>Tenant Upgraded Plan</h1><p>Tenant <strong>${event_data.tenant_email}</strong> has activated the <strong>${nicePlanName}</strong> plan.</p>`
      });
      
      if (event_data.tenant_email) {
        const { html, subject } = renderTemplate('subscription_activated',
          `<h1>Subscription Activated</h1>\n<p>Hello,</p>\n<p>Your subscription for the <strong>{{plan_name}}</strong> plan is now active!</p>\n<p>Your period runs until {{period_end}}. Enjoy using StayPilot.</p>`,
          "Your Subscription is Active: StayPilot",
          { plan_name: nicePlanName, period_end: new Date(event_data.period_end).toLocaleDateString(), tenant_email: event_data.tenant_email }
        );
        emailsToSend.push({ to: event_data.tenant_email, subject, html });
      }
    }
    // 3. Subscription Cancellation
    else if (type === "subscription_cancelled") {
      emailsToSend.push({
        to: superAdminEmail,
        subject: `Plan Cancelled: ${event_data.tenant_email}`,
        html: `<h1>Tenant Cancelled Plan</h1><p>Tenant <strong>${event_data.tenant_email}</strong> has cancelled their subscription and reverted to the Free Starter plan.</p>`
      });

      if (event_data.tenant_email) {
        const { html, subject } = renderTemplate('subscription_cancelled',
          `<h1>Subscription Cancelled</h1>\n<p>Hello,</p>\n<p>Your subscription has been successfully cancelled. Your account has been reverted to the Free Starter plan.</p>\n<p>We're sorry to see you go!</p>`,
          "Subscription Cancelled: StayPilot",
          { tenant_email: event_data.tenant_email }
        );
        emailsToSend.push({ to: event_data.tenant_email, subject, html });
      }
    }
    // 4. Payment Receipt
    else if (type === "payment_receipt") {
      if (event_data.tenant_email) {
        const { html, subject } = renderTemplate('payment_receipt',
          `<h1>Payment Receipt</h1>\n<p>Hello,</p>\n<p>We have successfully received your payment of <strong>₹{{amount}}</strong>.</p>\n<p>Transaction ID: {{payment_id}}</p>\n<p>Thank you for your business!</p>`,
          "Payment Receipt: StayPilot",
          { amount: (event_data.amount / 100).toFixed(2), payment_id: event_data.payment_id, tenant_email: event_data.tenant_email }
        );
        emailsToSend.push({ to: event_data.tenant_email, subject, html });
      }
    }
    // 5. Support Tickets
    else if (type === "new_ticket") {
      emailsToSend.push({
        to: superAdminEmail,
        subject: `New Support Ticket: ${event_data.subject}`,
        html: `<h1>New Support Ticket Opened</h1><p>Tenant <strong>${event_data.tenant_email}</strong> has opened a new support ticket.</p><p><strong>Subject:</strong> ${event_data.subject}</p><p><strong>Message:</strong> ${event_data.message}</p><p>You can reply directly from the StayPilot Super Admin Dashboard.</p>`
      });
      
      if (event_data.tenant_email) {
        emailsToSend.push({
          to: event_data.tenant_email,
          subject: `Support Ticket Received: ${event_data.subject}`,
          html: `<h1>Support Ticket Received</h1><p>Hi,</p><p>We have received your support ticket regarding <strong>${event_data.subject}</strong>.</p><p>Our team will review your message and reply shortly. You can view updates in the Help & Support tab of your dashboard.</p>`
        });
      }
    }
    else if (type === "ticket_reply") {
      if (event_data.is_from_admin) {
        // Admin replied, send email to tenant
        emailsToSend.push({
          to: event_data.tenant_email,
          subject: `Reply to your ticket: ${event_data.subject}`,
          html: `<h1>Support Ticket Update</h1><p>Hi,</p><p>An administrator has replied to your support ticket (<strong>${event_data.subject}</strong>).</p><p><strong>Reply:</strong><br/>${event_data.message}</p><p>Please log in to your StayPilot dashboard to view the full conversation or reply.</p>`
        });
      } else {
        // Tenant replied, send email to admin
        emailsToSend.push({
          to: superAdminEmail,
          subject: `Ticket Update from Tenant: ${event_data.subject}`,
          html: `<h1>New Reply on Support Ticket</h1><p>Tenant <strong>${event_data.tenant_email}</strong> has replied to a support ticket.</p><p><strong>Subject:</strong> ${event_data.subject}</p><p><strong>Message:</strong><br/>${event_data.message}</p>`
        });
      }
    } else {
      throw new Error("Unknown email type: " + type);
    }

    if (emailsToSend.length === 0) {
      throw new Error("No recipients found to send emails to.");
    }

    // Format for Resend Batch API
    const batchData = emailsToSend.map(email => ({
      from: `StayPilot <${fromAddress}>`,
      to: [email.to],
      subject: email.subject,
      html: email.html,
    }));

    console.log(`Sending ${batchData.length} emails via Resend Batch API`);
      
    const res = await fetch("https://api.resend.com/emails/batch", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(batchData),
    });

    const resJson = await res.json();
    console.log("Resend Batch API Response:", resJson);

    return new Response(JSON.stringify({ success: true, results: resJson }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    })

  } catch (error) {
    console.error("Mailer Error:", error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    })
  }
})
