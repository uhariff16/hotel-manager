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

    // 3. Fetch Global Settings & Resolve Credentials based on subscription environment
    const { data: adminProfiles } = await supabaseAdmin
      .from('profiles')
      .select('global_settings')
      .eq('role', 'super_admin')
      .not('global_settings', 'is', null)
      .order('created_at', { ascending: true })
      
    const masterProfile = adminProfiles?.find(p => p.global_settings?.pricing) || adminProfiles?.[0]
    const razorpayConfig = masterProfile?.global_settings?.razorpay_settings || {}
    
    // Authoritative stored subscription environment takes precedence
    const isLive = saasSub.environment === 'live' || (saasSub.environment === undefined && razorpayConfig.mode === 'live')
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

    const rzpAuthHeader = `Basic ${btoa(`${keyId}:${keySecret}`)}`

    // 4. Call Razorpay to cancel subscription at the end of the billing cycle (cancel_at_cycle_end=1)
    const cancelRes = await fetch(`https://api.razorpay.com/v1/subscriptions/${saasSub.razorpay_subscription_id}/cancel`, {
      method: 'POST',
      headers: {
        'Authorization': rzpAuthHeader,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        cancel_at_cycle_end: 1
      })
    })

    if (!cancelRes.ok) {
      const errData = await cancelRes.json()
      throw new Error(`Failed to cancel Razorpay subscription: ${JSON.stringify(errData)}`)
    }

    // 5. Update Local DB: Flag subscription for end-of-cycle cancellation
    // Paid access is PRESERVED until current_period_end per Phase 4M-B security policy.
    await supabaseAdmin.from('saas_subscriptions').update({
      cancel_at_period_end: true
    }).eq('id', saasSub.id)

    // Send cancellation notice email (indicating scheduled cancellation at period end)
    if (user.email) {
      await supabaseAdmin.functions.invoke('saas-mailer', {
        body: {
          type: 'subscription_cancelled',
          event_data: {
            tenant_email: user.email,
            cancel_at_period_end: true,
            period_end: saasSub.current_period_end
          }
        }
      }).catch(err => console.error("Failed to send cancel email", err));
    }

    return new Response(JSON.stringify({ 
      status: 'success', 
      message: 'Subscription scheduled for cancellation at the end of the current billing cycle.' 
    }), { 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200 
    })
  } catch (error) {
    const isAuthError = error.message?.includes('Unauthorized') || error.message?.includes('Missing Authorization')
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: isAuthError ? 401 : 400,
    })
  }
})
