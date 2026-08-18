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
      
      for (const [key, value] of Object.entries(variables)) {
        const regex = new RegExp(`{{${key}}}`, 'g');
        html = html.replace(regex, value || '');
        subject = subject.replace(regex, value || '');
      }
      return { html, subject };
    };

    // 1. New Tenant Registration
    if (type === "new_tenant_alert") {
      const tenantData = record || event_data;
      let tenantEmail = tenantData.email;
      
      if (!tenantEmail && tenantData.id) {
        const { data: userResponse } = await supabaseAdmin.auth.admin.getUserById(tenantData.id);
        if (userResponse?.user) tenantEmail = userResponse.user.email;
      }

      emailsToSend.push({
        to: superAdminEmail,
        subject: `New Customer Registration: ${tenantEmail}`,
        html: `<h1>New Customer Signed Up!</h1><p>Email: ${tenantEmail}</p><p>Name: ${tenantData.full_name || 'N/A'}</p>`
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
