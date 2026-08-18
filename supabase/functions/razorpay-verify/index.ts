import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
    const supabaseClient = createClient(supabaseUrl, supabaseAnonKey)

    const supabaseAdmin = createClient(
      supabaseUrl,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // 1. Authenticate the user securely
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) throw new Error('Missing Authorization header')
    
    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser(token)
    if (userError || !user) throw new Error('Unauthorized')

    const { subscription_id, payment_id, signature } = await req.json()
    if (!subscription_id || !payment_id || !signature) {
       throw new Error('Missing payment details from Razorpay')
    }

    // 2. Look up the subscription in the database
    const { data: dbSub, error: dbErr } = await supabaseAdmin
      .from('saas_subscriptions')
      .select('staypilot_plan_type')
      .eq('razorpay_subscription_id', subscription_id)
      .eq('tenant_id', user.id)
      .single()

    if (dbErr || !dbSub) {
       throw new Error('Subscription not found for this user.')
    }

    // 3. Get Razorpay Credentials from Global Settings
    const { data: adminProfiles } = await supabaseAdmin.from('profiles').select('global_settings').eq('role', 'super_admin').limit(1)
    const razorpayConfig = adminProfiles?.[0]?.global_settings?.razorpay_settings || {}
    
    const isLive = razorpayConfig.mode === 'live'
    const keySecret = (isLive ? razorpayConfig.liveKeySecret : razorpayConfig.testKeySecret)?.trim()

    if (!keySecret) throw new Error('Razorpay credentials not configured')

    // 4. Verify Signature Cryptographically (Bypasses Razorpay API delays completely!)
    const textEncoder = new TextEncoder()
    const key = await crypto.subtle.importKey(
      'raw',
      textEncoder.encode(keySecret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    )
    const signatureBuffer = await crypto.subtle.sign(
      'HMAC',
      key,
      textEncoder.encode(`${payment_id}|${subscription_id}`)
    )
    const generatedSignature = Array.from(new Uint8Array(signatureBuffer))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')

    if (generatedSignature !== signature) {
      throw new Error('Invalid payment signature. Payment rejected.')
    }

    // 5. Signature matches perfectly! Instantly update the database!
    await supabaseAdmin.from('saas_subscriptions').update({
      status: 'active',
    }).eq('razorpay_subscription_id', subscription_id)

    await supabaseAdmin.from('profiles').update({
      plan_type: dbSub.staypilot_plan_type
    }).eq('id', user.id)

    // Send instant upgrade emails to both Customer and Admin
    if (user && user.email) {
      await supabaseAdmin.functions.invoke('saas-mailer', {
        body: {
          type: 'subscription_activated',
          event_data: {
            tenant_email: user.email,
            plan_type: dbSub.staypilot_plan_type,
            period_end: new Date(Date.now() + 30*24*60*60*1000).toISOString()
          }
        }
      }).catch(err => console.error("Failed to send activation email", err));
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})