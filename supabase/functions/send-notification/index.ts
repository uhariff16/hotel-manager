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

    const { type, booking_id, resort_id, custom_payload } = await req.json()

    const { data: settings, error: settingsError } = await supabaseClient
      .from("tenant_integrations")
      .select("*")
      .eq("resort_id", resort_id)
      .single()

    if (settingsError || !settings) throw new Error("Integration settings not found.")

    const { data: booking, error: bookingError } = await supabaseClient
      .from("bookings")
      .select("*, guests(full_name, phone, email), resorts(name)")
      .eq("id", booking_id)
      .single()

    const guestName = booking?.guests?.full_name || "Valued Guest"
    const guestEmail = booking?.guests?.email
    const guestPhone = booking?.guests?.phone
    const resortName = booking?.resorts?.name || settings.email_from_name

    let results = { email: null, whatsapp: null }

    if (settings.email_enabled && guestEmail) {
      let subject = ""
      let html = ""

      if (type === "confirmation") {
        subject = `Booking Confirmed: ${resortName}`
        html = `<h1>Hello ${guestName}!</h1><p>Your booking for ${booking.check_in} is confirmed.</p>`
      } else if (type === "receipt") {
        subject = `Payment Receipt: ${resortName}`
        html = `<h1>Payment Received</h1><p>Thank you ${guestName}. We received ₹${custom_payload?.amount}.</p>`
      }

      if (subject) {
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
        results.email = await res.json()
      }
    }

    if (settings.whatsapp_enabled && guestPhone) {
      let templateName = ""
      if (type === "confirmation") templateName = "booking_confirmation"
      else if (type === "receipt") templateName = "payment_receipt"

      if (templateName) {
        const res = await fetch(`https://graph.facebook.com/v17.0/${settings.whatsapp_phone_number_id}/messages`, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${settings.whatsapp_access_token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            messaging_product: "whatsapp",
            to: guestPhone.replace(/\D/g, ""),
            type: "template",
            template: {
              name: templateName,
              language: { code: "en_US" },
            }
          }),
        })
        results.whatsapp = await res.json()
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
