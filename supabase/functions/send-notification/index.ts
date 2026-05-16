import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders })

  try {
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    )

    const { type, booking_id, resort_id, custom_payload, test_recipient } = await req.json()

    // 1. Fetch Integration Settings
    const { data: settings, error: settingsError } = await supabaseClient
      .from("tenant_integrations")
      .select("*")
      .eq("resort_id", resort_id)
      .single()

    if (settingsError || !settings) throw new Error("Integration settings not found.")

    // 2. Fetch Booking Info (if provided)
    let booking = null
    if (booking_id) {
      const { data, error } = await supabaseClient
        .from("bookings")
        .select("*, resorts(name)")
        .eq("id", booking_id)
        .single()
      if (!error) booking = data
    }

    const guestName = booking?.guest_name || "Valued Guest"
    const resortName = booking?.resorts?.name || settings.email_from_name || "Our Resort"
    
    // Determine recipients
    let guestEmail = booking?.guest_email || (type === "test_email" ? test_recipient : null)
    let guestPhone = booking?.phone_number || (type === "test_whatsapp" ? test_recipient : null)

    console.log(`Notification Request: Type=${type}, Resort=${resort_id}, Recipient=${guestEmail || guestPhone}`)

    let results = { email: null, whatsapp: null }

    // 3. Handle Email
    const canSendEmail = settings.email_enabled && (
      (type === "confirmation" && settings.auto_booking_confirmation) ||
      (type === "receipt" && settings.auto_payment_receipt) ||
      (type === "reminder" && settings.auto_checkin_reminder) ||
      type === "test_email"
    )

    if (guestEmail && canSendEmail) {
      let subject = ""
      let html = ""

      if (type === "confirmation") {
        subject = `Booking Confirmed: ${resortName}`
        html = `<h1>Hello ${guestName}!</h1><p>Your booking for ${booking?.check_in_date || 'your upcoming stay'} is confirmed.</p>`
      } else if (type === "receipt") {
        subject = `Payment Receipt: ${resortName}`
        html = `<h1>Payment Received</h1><p>Thank you ${guestName}. We received ₹${custom_payload?.amount}.</p>`
      } else if (type === "reminder") {
        subject = `See you soon at ${resortName}!`
        html = `<h1>Hello ${guestName}!</h1><p>We are excited to welcome you tomorrow, ${booking?.check_in_date}.</p><p>Standard Check-in time is 1:00 PM.</p>`
      } else if (type === "test_email") {
        subject = `Test Email from ${resortName}`
        html = `<h1>Connection Test Successful!</h1><p>Your Resend integration is now working correctly with Cheerful Chalet.</p>`
      }

      if (subject) {
        console.log(`Attempting to send email via Resend to: ${guestEmail}`)
        const res = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${settings.email_api_key}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: `${settings.email_from_name} <${settings.email_from_address}>`,
            to: [guestEmail],
            subject: subject,
            html: html,
          }),
        })
        const emailResult = await res.json()
        console.log("Resend API Response:", emailResult)
        results.email = emailResult
      }
    }

    // 4. Handle WhatsApp
    const canSendWhatsApp = settings.whatsapp_enabled && (
      (type === "confirmation" && settings.auto_booking_confirmation) ||
      (type === "receipt" && settings.auto_payment_receipt) ||
      (type === "reminder" && settings.auto_checkin_reminder) ||
      type === "test_whatsapp"
    )

    if (guestPhone && canSendWhatsApp) {
      let payload = null

      if (type === "confirmation") {
        payload = {
          messaging_product: "whatsapp",
          to: guestPhone.replace(/\D/g, ""),
          type: "template",
          template: { name: "booking_confirmation", language: { code: "en_US" } }
        }
      } else if (type === "receipt") {
        payload = {
          messaging_product: "whatsapp",
          to: guestPhone.replace(/\D/g, ""),
          type: "template",
          template: { name: "payment_receipt", language: { code: "en_US" } }
        }
      } else if (type === "reminder") {
        payload = {
          messaging_product: "whatsapp",
          to: guestPhone.replace(/\D/g, ""),
          type: "template",
          template: { name: "checkin_reminder", language: { code: "en_US" } }
        }
      } else if (type === "test_whatsapp") {
        // IMPORTANT: Meta often blocks raw text for first-time outreach. 
        // We use a template for the test to ensure delivery.
        payload = {
          messaging_product: "whatsapp",
          to: guestPhone.replace(/\D/g, ""),
          type: "template",
          template: { 
            name: "booking_confirmation", // Using your existing approved template
            language: { code: "en_US" } 
          }
        }
      }

      if (payload) {
        console.log(`Attempting to send WhatsApp to: ${guestPhone}`)
        const res = await fetch(`https://graph.facebook.com/v17.0/${settings.whatsapp_phone_number_id}/messages`, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${settings.whatsapp_access_token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        })
        const waResult = await res.json()
        console.log("WhatsApp API Response:", waResult)
        results.whatsapp = waResult
      }
    }

    return new Response(JSON.stringify({ success: true, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    })

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    })
  }
})
