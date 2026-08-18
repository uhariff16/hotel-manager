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

    // 1. New Tenant Registration
    if (type === "new_tenant_alert") {
      const tenantData = record || event_data;
      let tenantEmail = tenantData.email;
      
      // If email isn't in profiles table, fetch from auth
      if (!tenantEmail && tenantData.id) {
        const { data: userResponse } = await supabaseAdmin.auth.admin.getUserById(tenantData.id);
        if (userResponse?.user) {
          tenantEmail = userResponse.user.email;
        }
      }

      // Email 1: Alert to Super Admin
      emailsToSend.push({
        to: superAdminEmail,
        subject: `New Customer Registration: ${tenantEmail}`,
        html: `
          <h1>New Customer Signed Up!</h1>
          <p>A new customer has registered for the platform.</p>
          <ul>
            <li><strong>Email:</strong> ${tenantEmail}</li>
            <li><strong>Name:</strong> ${tenantData.full_name || 'N/A'}</li>
          </ul>
        `
      });

      // Email 2: Welcome to Customer
      if (tenantEmail) {
        emailsToSend.push({
          to: tenantEmail,
          subject: "Welcome to StayPilot!",
          html: `
            <h1>Welcome to StayPilot</h1>
            <p>Hi ${tenantData.full_name || 'there'},</p>
            <p>Thank you for registering with StayPilot. We are thrilled to have you on board!</p>
            <p>You can now log in to your dashboard and start managing your properties.</p>
          `
        });
      }
    } 
    // 2. Subscription Activation/Upgrade
    else if (type === "subscription_activated") {
      // Email 1: Alert to Super Admin
      emailsToSend.push({
        to: superAdminEmail,
        subject: `Plan Upgrade: ${event_data.tenant_email}`,
        html: `
          <h1>Tenant Upgraded Plan</h1>
          <p>Tenant <strong>${event_data.tenant_email}</strong> has activated the <strong>${nicePlanName}</strong> plan.</p>
        `
      });
      
      // Email 2: Confirmation to Customer (Tenant)
      if (event_data.tenant_email) {
        emailsToSend.push({
          to: event_data.tenant_email,
          subject: "Your Subscription is Active: StayPilot",
          html: `
            <h1>Subscription Activated</h1>
            <p>Hello,</p>
            <p>Your subscription for the <strong>${nicePlanName}</strong> plan is now active!</p>
            <p>Your period runs until ${new Date(event_data.period_end).toLocaleDateString()}. Enjoy using StayPilot.</p>
          `
        });
      }
    }
    // 3. Subscription Cancellation
    else if (type === "subscription_cancelled") {
      // Email 1: Notification to Super Admin
      emailsToSend.push({
        to: superAdminEmail,
        subject: `Plan Cancelled: ${event_data.tenant_email}`,
        html: `
          <h1>Tenant Cancelled Plan</h1>
          <p>Tenant <strong>${event_data.tenant_email}</strong> has cancelled their subscription and reverted to the Free Starter plan.</p>
        `
      });

      // Email 2: Confirmation to Customer (Tenant)
      if (event_data.tenant_email) {
        emailsToSend.push({
          to: event_data.tenant_email,
          subject: "Subscription Cancelled: StayPilot",
          html: `
            <h1>Subscription Cancelled</h1>
            <p>Hello,</p>
            <p>Your subscription has been successfully cancelled. Your account has been reverted to the Free Starter plan.</p>
            <p>We're sorry to see you go!</p>
          `
        });
      }
    }
    // 4. Payment Receipt
    else if (type === "payment_receipt") {
      // Receipt goes only to Customer (Tenant)
      if (event_data.tenant_email) {
        emailsToSend.push({
          to: event_data.tenant_email,
          subject: "Payment Receipt: StayPilot",
          html: `
            <h1>Payment Receipt</h1>
            <p>Hello,</p>
            <p>We have successfully received your payment of <strong>₹${(event_data.amount / 100).toFixed(2)}</strong>.</p>
            <p>Transaction ID: ${event_data.payment_id}</p>
            <p>Thank you for your business!</p>
          `
        });
      }
    } else {
      throw new Error("Unknown email type: " + type);
    }

    if (emailsToSend.length === 0) {
      throw new Error("No recipients found to send emails to.");
    }

    const results = [];
    
    // Loop through and send each email via Resend
    for (const email of emailsToSend) {
      console.log(`Sending email to ${email.to} with subject: ${email.subject}`);
      
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${resendApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: `StayPilot <${fromAddress}>`,
          to: [email.to],
          subject: email.subject,
          html: email.html,
        }),
      });

      const resJson = await res.json();
      console.log("Resend API Response:", resJson);
      results.push(resJson);
    }

    return new Response(JSON.stringify({ success: true, results }), {
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
