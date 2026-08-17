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

    // Admin client to read global settings and update tables securely
    const supabaseAdmin = createClient(
      supabaseUrl,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // 1. Authenticate user
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) throw new Error('Missing Authorization header')
    
    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser(token)
    
    if (userError || !user) {
       throw new Error('Unauthorized: ' + (userError?.message || 'No user found'))
    }

    const { plan_type } = await req.json()
    if (!plan_type || plan_type === 'free') {
      throw new Error('Invalid plan type')
    }

    // 2. Fetch Global Settings
    const { data: adminProfiles, error: adminErr } = await supabaseAdmin
      .from('profiles')
      .select('global_settings')
      .eq('role', 'super_admin')
      .limit(1)

    if (adminErr || !adminProfiles || adminProfiles.length === 0) {
      throw new Error('Could not load global settings')
    }

    const settings = adminProfiles[0].global_settings || {}
    const pricingConfig = settings.pricing || {}
    const razorpayConfig = settings.razorpay_settings || {}

    const isLive = razorpayConfig.mode === 'live'
    const keyId = (isLive ? razorpayConfig.liveKeyId : razorpayConfig.testKeyId)?.trim()
    const keySecret = (isLive ? razorpayConfig.liveKeySecret : razorpayConfig.testKeySecret)?.trim()

    if (!keyId || !keySecret) {
      throw new Error('Razorpay credentials not configured')
    }

    const planData = pricingConfig[plan_type]
    if (!planData) {
      throw new Error('Plan not found')
    }

    // 3. Calculate Effective Price
    const today = new Date()
    const isPromoActive = planData.offerActive && planData.offerStartDate && planData.offerEndDate && 
                          new Date(planData.offerStartDate) <= today && new Date(planData.offerEndDate) >= today
    const effectivePrice = isPromoActive ? planData.offerPrice : planData.price
    const priceInPaise = Math.round(effectivePrice * 100)

    // 4. Determine Razorpay Plan ID
    let rzpPlanId = isLive ? planData.razorpay_live_plan_id : planData.razorpay_test_plan_id
    let needToSaveConfig = false

    const rzpAuthHeader = `Basic ${btoa(`${keyId}:${keySecret}`)}`

    // If no plan ID exists, create one
    if (!rzpPlanId) {
      // Create Razorpay Plan
      const planRes = await fetch('https://api.razorpay.com/v1/plans', {
        method: 'POST',
        headers: {
          'Authorization': rzpAuthHeader,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          period: 'monthly',
          interval: 1,
          item: {
            name: `Stay Pilot ${planData.name || plan_type} (${isPromoActive ? 'Promo' : 'Base'})`,
            amount: priceInPaise,
            currency: 'INR',
            description: `SaaS Subscription for ${plan_type}`
          }
        })
      })

      if (!planRes.ok) {
        const errData = await planRes.json()
        throw new Error(`Failed to create Razorpay Plan: ${JSON.stringify(errData)}`)
      }

      const rzpPlanData = await planRes.json()
      rzpPlanId = rzpPlanData.id

      // Update global settings
      if (isLive) {
        planData.razorpay_live_plan_id = rzpPlanId
      } else {
        planData.razorpay_test_plan_id = rzpPlanId
      }
      needToSaveConfig = true
    }

    if (needToSaveConfig) {
      settings.pricing = pricingConfig
      await supabaseAdmin.from('profiles').update({ global_settings: settings }).eq('role', 'super_admin')
    }

    // 5. Create Razorpay Customer
    const { data: profile } = await supabaseAdmin.from('profiles').select('full_name').eq('id', user.id).single()
    const customerRes = await fetch('https://api.razorpay.com/v1/customers', {
      method: 'POST',
      headers: {
        'Authorization': rzpAuthHeader,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        name: profile?.full_name || 'Stay Pilot Tenant',
        email: user.email,
        notes: { tenant_id: user.id }
      })
    })
    
    let rzpCustomerId = null
    if (customerRes.ok) {
      const cData = await customerRes.json()
      rzpCustomerId = cData.id
    }

    // 6. Create Razorpay Subscription
    const subRes = await fetch('https://api.razorpay.com/v1/subscriptions', {
      method: 'POST',
      headers: {
        'Authorization': rzpAuthHeader,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        plan_id: rzpPlanId,
        customer_id: rzpCustomerId,
        total_count: 480, // 40 years max allowed by Razorpay
        customer_notify: 0,
        notes: {
          tenant_id: user.id,
          plan_type: plan_type
        }
      })
    })

    if (!subRes.ok) {
      const errData = await subRes.json()
      throw new Error(`Failed to create Subscription: ${JSON.stringify(errData)}`)
    }

    const subData = await subRes.json()

    // 7. Store in saas_subscriptions
    // Upsert to handle retries cleanly
    const { error: dbErr } = await supabaseAdmin
      .from('saas_subscriptions')
      .upsert({
        tenant_id: user.id,
        razorpay_customer_id: rzpCustomerId,
        razorpay_subscription_id: subData.id,
        razorpay_plan_id: rzpPlanId,
        staypilot_plan_type: plan_type,
        status: 'created'
      }, { onConflict: 'tenant_id' })

    if (dbErr) {
      throw new Error(`DB Error: ${dbErr.message}`)
    }

    return new Response(
      JSON.stringify({ subscription_id: subData.id, key_id: keyId }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })
  }
})
