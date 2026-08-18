import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

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
    
    // Parse the payload
    const payload = await req.json();
    const { type, record, event_data } = payload;
    
    console.log(`Processing saas-mailer event: ${type}`);

    let to = "";
    let subject = "";
    let html = "";

    // 1. New Tenant Registration Notification (To Super Admin)
    if (type === "new_tenant_alert") {
      to = "uhariff@gmail.com";
      subject = "New Tenant Registration: StayPilot";
      
      // Determine if the event came directly from a DB trigger (record)
      const tenantData = record || event_data;
      html = `
        <h1>New Tenant Registered!</h1>
        <p>A new user has registered as a Tenant on the platform.</p>
        <p><strong>Name:</strong> ${tenantData.full_name || 'Not provided'}</p>
        <p><strong>Email:</strong> ${tenantData.email || 'Not provided'}</p>
        <p><strong>Plan:</strong> ${tenantData.plan_type || 'free'}</p>
      `;
    } 
    // 2. Subscription Upgrade/Activation
    else if (type === "subscription_activated") {
      to = event_data.tenant_email;
      subject = "Your Subscription is Active: StayPilot";
      html = `
        <h1>Subscription Activated</h1>
        <p>Hello,</p>
        <p>Your subscription for the <strong>${event_data.plan_type}</strong> plan is now active!</p>
        <p>Your period runs until ${new Date(event_data.period_end).toLocaleDateString()}. Enjoy using StayPilot.</p>
      `;
    }
    // 3. Subscription Cancellation
    else if (type === "subscription_cancelled") {
      to = event_data.tenant_email;
      subject = "Subscription Cancelled: StayPilot";
      html = `
        <h1>Subscription Cancelled</h1>
        <p>Hello,</p>
        <p>Your subscription has been successfully cancelled. Your account has been reverted to the Free plan.</p>
        <p>We're sorry to see you go!</p>
      `;
    }
    // 4. Payment Receipt
    else if (type === "payment_receipt") {
      to = event_data.tenant_email;
      subject = "Payment Receipt: StayPilot";
      html = `
        <h1>Payment Receipt</h1>
        <p>Hello,</p>
        <p>We have successfully received your payment of <strong>₹${(event_data.amount / 100).toFixed(2)}</strong>.</p>
        <p>Transaction ID: ${event_data.payment_id}</p>
        <p>Thank you for your business!</p>
      `;
    } else {
      throw new Error("Unknown email type: " + type);
    }

    if (!to) {
      throw new Error("Recipient email address (to) is missing.");
    }

    console.log(`Sending email to ${to} with subject: ${subject}`);

    // Call Resend API
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: `StayPilot <${fromAddress}>`,
        to: [to],
        subject: subject,
        html: html,
      }),
    });

    const result = await res.json();
    console.log("Resend API Response:", result);

    return new Response(JSON.stringify({ success: true, result }), {
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
