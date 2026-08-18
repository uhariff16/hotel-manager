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

    // 1. Authenticate user securely
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) throw new Error('Missing Authorization header')
    
    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser(token)
    if (userError || !user) throw new Error('Unauthorized')

    // 2. Find active subscription
    const { data: saasSub, error: subErr } = await supabaseAdmin
      .from('saas_subscriptions')
      .select('*')
      .eq('tenant_id', user.id)
      .eq('status', 'active')
      .single()

    if (subErr || !saasSub) {
      throw new Error('No active subscription found')
    }

    // 3. Fetch Global Settings to get Razorpay credentials
    const { data: adminProfiles } = await supabaseAdmin
      .from('profiles')
      .select('global_settings')
      .eq('role', 'super_admin')
      .limit(1)
      
    const razorpayConfig = adminProfiles?.[0]?.global_settings?.razorpay_settings || {}
    const isLive = razorpayConfig.mode === 'live'
    const keyId = (isLive ? razorpayConfig.liveKeyId : razorpayConfig.testKeyId)?.trim()
    const keySecret = (isLive ? razorpayConfig.liveKeySecret : razorpayConfig.testKeySecret)?.trim()

    if (!keyId || !keySecret) {
      throw new Error('Razorpay credentials missing')
    }

    const rzpAuthHeader = `Basic ${btoa(`${keyId}:${keySecret}`)}`

    // 4. Call Razorpay to cancel subscription (cancel_at_cycle_end=0 to cancel immediately)
    const cancelRes = await fetch(`https://api.razorpay.com/v1/subscriptions/${saasSub.razorpay_subscription_id}/cancel`, {
      method: 'POST',
      headers: {
        'Authorization': rzpAuthHeader,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        cancel_at_cycle_end: 0
      })
    })

    if (!cancelRes.ok) {
      const errData = await cancelRes.json()
      throw new Error(`Failed to cancel Razorpay subscription: ${JSON.stringify(errData)}`)
    }

    // 5. Update Local DB immediately (webhook will also fire, but we do it here for instant UI feedback)
    await supabaseAdmin.from('saas_subscriptions').update({
      status: 'cancelled',
      cancel_at_period_end: false
    }).eq('id', saasSub.id)

    await supabaseAdmin.from('profiles').update({
      plan_type: 'free'
    }).eq('id', user.id)

    // Send cancellation emails to Admin and Tenant
    if (user.email) {
      await supabaseAdmin.functions.invoke('saas-mailer', {
        body: {
          type: 'subscription_cancelled',
          event_data: {
            tenant_email: user.email
          }
        }
      }).catch(err => console.error("Failed to send cancel email", err));
    }

    return new Response(JSON.stringify({ status: 'success' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200, // Return 200 so supabase-js doesn't mask the error body
    })
  }
})
