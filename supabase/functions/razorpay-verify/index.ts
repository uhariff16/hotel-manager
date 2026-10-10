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

    // 1. Authenticate the user securely (HTTP 401 for unauthorized)
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing Authorization header' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }
    
    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser(token)
    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const { subscription_id, payment_id, signature } = await req.json()
    if (!subscription_id || !payment_id || !signature) {
       throw new Error('Missing required payment verification parameters')
    }

    // 2. Look up the subscription in the database & verify tenant ownership
    const { data: dbSub, error: dbErr } = await supabaseAdmin
      .from('saas_subscriptions')
      .select('id, staypilot_plan_type, tenant_id, environment')
      .eq('razorpay_subscription_id', subscription_id)
      .eq('tenant_id', user.id)
      .single()

    if (dbErr || !dbSub) {
       throw new Error('Subscription record not found for authenticated tenant.')
    }

    // 3. Resolve Razorpay Credentials based on subscription's stored environment
    const { data: adminProfiles } = await supabaseAdmin
      .from('profiles')
      .select('global_settings')
      .eq('role', 'super_admin')
      .not('global_settings', 'is', null)
      .order('created_at', { ascending: true })
    const masterProfile = adminProfiles?.find(p => p.global_settings?.pricing) || adminProfiles?.[0]
    const razorpayConfig = masterProfile?.global_settings?.razorpay_settings || {}
    
    // Authoritative stored subscription environment takes precedence
    const isLive = dbSub.environment === 'live' || (dbSub.environment === undefined && razorpayConfig.mode === 'live')
    const keyId = (isLive 
      ? Deno.env.get('RAZORPAY_LIVE_KEY_ID') 
      : Deno.env.get('RAZORPAY_TEST_KEY_ID')
    )?.trim()
    const keySecret = (isLive 
      ? Deno.env.get('RAZORPAY_LIVE_KEY_SECRET') 
      : Deno.env.get('RAZORPAY_TEST_KEY_SECRET')
    )?.trim()

    if (!keyId || !keySecret) {
      throw new Error(`Razorpay ${isLive ? 'Live' : 'Test'} credentials not configured in server environment`)
    }

    // 4. Verify HMAC SHA-256 Signature Cryptographically
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
      throw new Error('Invalid payment signature. Verification rejected.')
    }

    // 5. Authoritative REST API verification against Razorpay
    const rzpAuthHeader = `Basic ${btoa(`${keyId}:${keySecret}`)}`

    // Fetch subscription details from Razorpay API
    const subApiRes = await fetch(`https://api.razorpay.com/v1/subscriptions/${subscription_id}`, {
      headers: { 'Authorization': rzpAuthHeader }
    })
    if (!subApiRes.ok) {
      throw new Error('Failed to verify subscription with Razorpay API.')
    }
    const rzpSubData = await subApiRes.json()

    // Fetch payment details from Razorpay API
    const payApiRes = await fetch(`https://api.razorpay.com/v1/payments/${payment_id}`, {
      headers: { 'Authorization': rzpAuthHeader }
    })
    if (!payApiRes.ok) {
      throw new Error('Failed to verify payment status with Razorpay API.')
    }
    const rzpPayData = await payApiRes.json()

    // Strict Payment Capture Status Validation
    if (rzpPayData.status !== 'captured') {
      if (rzpPayData.status === 'authorized') {
        return new Response(JSON.stringify({ 
          error: 'Payment authorized but not yet captured. Plan activation pending capture confirmation.',
          status: 'authorized_pending_capture'
        }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }
      throw new Error(`Payment verification failed: payment status is '${rzpPayData.status}'.`)
    }

    if (rzpPayData.currency !== 'INR') {
      throw new Error(`Invalid payment currency '${rzpPayData.currency}'. Expected INR.`)
    }

    if (!rzpPayData.amount || rzpPayData.amount <= 0) {
      throw new Error('Invalid payment amount.')
    }

    if (rzpPayData.subscription_id && rzpPayData.subscription_id !== subscription_id) {
      throw new Error('Payment does not belong to the specified subscription.')
    }

    // 6. Parse Authoritative Billing Period Timestamps from Razorpay
    const currentStart = rzpSubData.current_start 
      ? new Date(rzpSubData.current_start * 1000).toISOString()
      : new Date().toISOString()
      
    const currentEnd = rzpSubData.current_end 
      ? new Date(rzpSubData.current_end * 1000).toISOString()
      : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()

    // 7. Atomic Database Transaction via RPC STRICTLY (No non-atomic fallbacks)
    const { data: rpcRes, error: rpcErr } = await supabaseAdmin.rpc('process_subscription_webhook', {
      p_razorpay_sub_id: subscription_id,
      p_event_type: 'verify_capture',
      p_event_env: isLive ? 'live' : 'test',
      p_status: 'active',
      p_current_start: currentStart,
      p_current_end: currentEnd,
      p_payment_id: rzpPayData.id,
      p_amount: rzpPayData.amount,
      p_currency: rzpPayData.currency,
      p_payment_status: rzpPayData.status,
      p_payment_method: rzpPayData.method,
      p_invoice_id: rzpPayData.invoice_id || null
    })

    if (rpcErr || rpcRes?.status === 'rejected' || rpcRes?.status === 'ignored') {
      throw new Error(`Database state transaction failed: ${rpcErr?.message || rpcRes?.reason || 'RPC processing error'}`)
    }

    // Send instant upgrade email to Tenant
    if (user && user.email) {
      await supabaseAdmin.functions.invoke('saas-mailer', {
        body: {
          type: 'subscription_activated',
          event_data: {
            tenant_email: user.email,
            plan_type: dbSub.staypilot_plan_type,
            period_end: currentEnd,
            next_payment_date: currentEnd
          }
        }
      }).catch(err => console.error("Failed to send activation email", err));
    }

    return new Response(JSON.stringify({ 
      success: true,
      subscription_status: 'active',
      current_period_end: currentEnd
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200
    })

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})