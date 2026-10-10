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

  let tenantId: string | null = null
  let checkoutToken: string | null = null
  let reservationId: string | null = null
  let rzpSubIdCreated: string | null = null
  let supabaseAdmin: any = null

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
    const supabaseClient = createClient(supabaseUrl, supabaseAnonKey)

    supabaseAdmin = createClient(
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

    // 2. Resolve & Validate Owning Tenant ID + Staff Authorization Guard
    const { data: userProfile, error: profileErr } = await supabaseAdmin
      .from('profiles')
      .select('id, role, tenant_id, full_name, global_settings')
      .eq('id', user.id)
      .single()

    if (profileErr || !userProfile) {
      throw new Error(`Could not load user profile: ${profileErr?.message || 'User not found'}`)
    }

    if (userProfile.role === 'staff') {
      return new Response(JSON.stringify({ 
        error: 'Subscription purchase is restricted to property owners (Tenant Admins).' 
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 403
      })
    }

    tenantId = userProfile.role === 'tenant_admin' ? userProfile.id : (userProfile.tenant_id || user.id)

    const { plan_type } = await req.json()
    if (!plan_type || plan_type === 'free') {
      throw new Error('Invalid plan type')
    }

    // 3. Fetch Global Settings & Determine Mode with Database Error Checking
    const { data: adminProfiles, error: adminErr } = await supabaseAdmin
      .from('profiles')
      .select('id, global_settings')
      .eq('role', 'super_admin')
      .not('global_settings', 'is', null)
      .order('created_at', { ascending: true })

    if (adminErr || !adminProfiles || adminProfiles.length === 0) {
      throw new Error(`Could not load global settings: ${adminErr?.message || 'No super_admin settings found'}`)
    }

    const masterProfile = adminProfiles.find(p => p.global_settings?.pricing) || adminProfiles[0]
    const settings = masterProfile.global_settings || {}
    const pricingConfig = settings.pricing?.published || settings.pricing || {}
    const razorpayConfig = settings.razorpay_settings || {}

    // DUAL-MODE ENVIRONMENT RESOLUTION & FAIL-CLOSED SAFEGUARD
    const requestedMode = razorpayConfig.mode || 'test'
    const isServerLiveAllowed = Deno.env.get('ALLOW_RAZORPAY_LIVE_MODE') === 'true'

    if (requestedMode === 'live' && !isServerLiveAllowed) {
      return new Response(JSON.stringify({ 
        error: 'Razorpay Live Mode is requested in Super Admin settings, but server-side ALLOW_RAZORPAY_LIVE_MODE is not enabled. System locked in Test Mode for security.' 
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 403
      })
    }

    const isLive = requestedMode === 'live' && isServerLiveAllowed
    const envMode: 'test' | 'live' = isLive ? 'live' : 'test'

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

    let targetPlanKey = plan_type
    if (!pricingConfig[targetPlanKey]) {
      const lowerType = String(plan_type).toLowerCase()
      if (lowerType === 'growth' || lowerType === 'pro') {
        targetPlanKey = Object.keys(pricingConfig).find(k => k === 'pro' || k === 'growth') || targetPlanKey
      } else if (lowerType === 'solo') {
        targetPlanKey = Object.keys(pricingConfig).find(k => k === 'custom_1786983013013' || k === 'solo') || targetPlanKey
      } else if (lowerType === 'staymaster' || lowerType === 'premium') {
        targetPlanKey = Object.keys(pricingConfig).find(k => k === 'premium' || k === 'staymaster') || targetPlanKey
      }
    }

    const planData = pricingConfig[targetPlanKey]
    if (!planData) {
      throw new Error(`Plan '${plan_type}' not found in global pricing settings`)
    }

    // 4. ATOMIC CHECKOUT RESERVATION LEASE RPC (Blocks unresolved reconciliation_required records)
    const { data: rpcRes, error: rpcErr } = await supabaseAdmin.rpc('acquire_checkout_reservation', {
      p_tenant_id: tenantId,
      p_plan_type: targetPlanKey,
      p_environment: envMode
    })

    if (rpcErr) {
      throw new Error(`Failed to acquire checkout reservation: ${rpcErr.message}`)
    }

    if (rpcRes.status === 'blocked_reconciliation_required') {
      return new Response(JSON.stringify({ 
        error: `Your account has an unresolved subscription transaction (Ref: ${rpcRes.razorpay_subscription_id || 'unresolved'}). Please contact support to complete your plan activation.` 
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400
      })
    }

    if (rpcRes.status === 'blocked_active_subscription') {
      return new Response(JSON.stringify({ 
        error: `You already have an active paid subscription (${rpcRes.plan_type}). Plan changes are managed via support.` 
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400
      })
    }

    if (rpcRes.status === 'reservation_in_progress') {
      return new Response(JSON.stringify({ 
        error: 'A checkout reservation is currently in progress for your account. Please wait a moment and try again.' 
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 409
      })
    }

    if (rpcRes.status === 'reusable_lease') {
      return new Response(
        JSON.stringify({ subscription_id: rpcRes.subscription_id, key_id: keyId }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      )
    }

    checkoutToken = rpcRes.checkout_token
    reservationId = rpcRes.reservation_id

    const rzpAuthHeader = `Basic ${btoa(`${keyId}:${keySecret}`)}`

    // 5. Calculate Effective Price with Property Fallbacks & Inclusive Date Window (IST)
    const basePrice = Number(planData.monthlyPrice ?? planData.originalPrice ?? planData.price ?? 0)
    const promoPrice = Number(planData.promotionalPrice ?? planData.offerPrice ?? basePrice)

    const now = new Date()
    let isPromoActive = false
    if (planData.offerActive && planData.offerStartDate && planData.offerEndDate) {
      const startDate = new Date(planData.offerStartDate.includes('T') ? planData.offerStartDate : `${planData.offerStartDate}T00:00:00+05:30`)
      const endDate = new Date(planData.offerEndDate.includes('T') ? planData.offerEndDate : `${planData.offerEndDate}T23:59:59.999+05:30`)
      isPromoActive = now >= startDate && now <= endDate
    }

    // 5. Calculate Effective Price & GST with Integer Paise Precision
    const basePriceRupees = isPromoActive ? promoPrice : basePrice
    const basePricePaise = Math.round(basePriceRupees * 100)
    
    // Apply Super Admin GST settings if enabled
    const taxSettings = settings.tax_settings || {}
    const isGstEnabled = Boolean(taxSettings.enabled) && Number(taxSettings.rate || 0) > 0
    const gstRate = isGstEnabled ? Number(taxSettings.rate) : 0
    
    const gstAmountPaise = isGstEnabled ? Math.round(basePricePaise * (gstRate / 100)) : 0
    const priceInPaise = basePricePaise + gstAmountPaise

    // 6. Automatic Razorpay Plan Lookup / Creation with Strict Environment Isolation
    let rzpPlanId = isLive ? planData.razorpay_live_plan_id : (planData.razorpay_test_plan_id || planData.razorpay_plan_id)
    const cachedPrice = isLive ? planData.razorpay_live_price : (planData.razorpay_test_price || planData.razorpay_price)
    let needToSaveConfig = false

    if (!rzpPlanId || cachedPrice !== priceInPaise) {
      // Step A: Check existing plans on Razorpay API to prevent duplicate plan creation
      let existingPlanId: string | null = null
      try {
        const listRes = await fetch('https://api.razorpay.com/v1/plans?count=100', {
          headers: { 'Authorization': rzpAuthHeader }
        })
        if (listRes.ok) {
          const listData = await listRes.json()
          const matchingPlan = listData.items?.find((p: any) => 
            p.amount === priceInPaise && 
            p.period === 'monthly' && 
            p.interval === 1 && 
            (p.notes?.plan_type === targetPlanKey || p.item?.name?.includes(targetPlanKey) || p.item?.name?.includes(planData.displayPlanName || planData.name || ''))
          )
          if (matchingPlan) {
            existingPlanId = matchingPlan.id
          }
        }
      } catch (err) {
        console.warn("Failed to query existing Razorpay plans:", err)
      }

      if (existingPlanId) {
        rzpPlanId = existingPlanId
      } else {
        // Step B: Automatically create new Razorpay Plan via API using GST-adjusted recurring amount
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
              name: `Stay Pilot ${planData.displayPlanName || planData.name || plan_type} (${isLive ? 'Live' : 'Test'}${isGstEnabled ? ` - ${gstRate}% GST` : ''})`,
              amount: priceInPaise,
              currency: 'INR',
              description: `Monthly SaaS Subscription${isGstEnabled ? ` (incl. ${gstRate}% GST)` : ''}`
            },
            notes: { 
              plan_type: targetPlanKey, 
              environment: envMode,
              gst_rate: String(gstRate),
              base_price_paise: String(basePricePaise),
              gst_amount_paise: String(gstAmountPaise)
            }
          })
        })

        if (!planRes.ok) {
          const errData = await planRes.json()
          throw new Error(`Failed to create Razorpay Plan on ${envMode} environment: ${JSON.stringify(errData)}`)
        }

        const rzpPlanData = await planRes.json()
        rzpPlanId = rzpPlanData.id
      }

      if (isLive) {
        planData.razorpay_live_plan_id = rzpPlanId
        planData.razorpay_live_price = priceInPaise
      } else {
        planData.razorpay_test_plan_id = rzpPlanId
        planData.razorpay_test_price = priceInPaise
      }
      needToSaveConfig = true
    }

    // 7. Config Update Safety: Update ONLY specific masterProfile.id
    if (needToSaveConfig) {
      if (settings.pricing?.published) {
        settings.pricing.published[targetPlanKey] = planData
      } else if (settings.pricing) {
        settings.pricing[targetPlanKey] = planData
      }

      const { error: updateConfigErr } = await supabaseAdmin
        .from('profiles')
        .update({ global_settings: settings })
        .eq('id', masterProfile.id)

      if (updateConfigErr) {
        throw new Error(`Failed to update pricing settings: ${updateConfigErr.message}`)
      }
    }

    // 8. Create Razorpay Customer
    const tenantBilling = userProfile.global_settings?.tenant_billing || {}
    
    const customerPayload: Record<string, any> = {
      name: tenantBilling.companyName || userProfile.full_name || 'Stay Pilot Tenant',
      email: user.email,
      notes: { tenant_id: tenantId }
    }
    
    if (tenantBilling.gstin) {
      customerPayload.gstin = tenantBilling.gstin
    }

    const customerRes = await fetch('https://api.razorpay.com/v1/customers', {
      method: 'POST',
      headers: {
        'Authorization': rzpAuthHeader,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(customerPayload)
    })
    
    let rzpCustomerId = null
    if (customerRes.ok) {
      const cData = await customerRes.json()
      rzpCustomerId = cData.id
    }

    // 9. Create Razorpay Subscription Entity
    const subRes = await fetch('https://api.razorpay.com/v1/subscriptions', {
      method: 'POST',
      headers: {
        'Authorization': rzpAuthHeader,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        plan_id: rzpPlanId,
        customer_id: rzpCustomerId,
        total_count: 240, // 20 years max allowed for UPI Autopay
        customer_notify: 0,
        notes: {
          tenant_id: tenantId,
          plan_type: targetPlanKey
        }
      })
    })

    if (!subRes.ok) {
      const errData = await subRes.json()
      throw new Error(`Failed to create Razorpay Subscription: ${JSON.stringify(errData)}`)
    }

    const subData = await subRes.json()
    rzpSubIdCreated = subData.id

    // 10. Update EXACT Reservation Row Matching BOTH reservation_id AND checkout_token
    const { data: updatedRows, error: writeSubErr } = await supabaseAdmin
      .from('saas_subscriptions')
      .update({
        razorpay_customer_id: rzpCustomerId,
        razorpay_subscription_id: subData.id,
        razorpay_plan_id: rzpPlanId,
        staypilot_plan_type: targetPlanKey,
        status: 'created',
        environment: envMode,
        cancel_at_period_end: false,
        checkout_token: null,
        updated_at: new Date().toISOString()
      })
      .eq('id', reservationId)
      .eq('checkout_token', checkoutToken)
      .select('id')

    if (writeSubErr || !updatedRows || updatedRows.length !== 1) {
      // POST-RAZORPAY DB PERSISTENCE FAILURE: Explicitly check record_orphaned_checkout_subscription RPC result
      const { data: recRes, error: recErr } = await supabaseAdmin.rpc('record_orphaned_checkout_subscription', {
        p_tenant_id: tenantId,
        p_reservation_id: reservationId,
        p_checkout_token: checkoutToken,
        p_razorpay_sub_id: rzpSubIdCreated,
        p_razorpay_plan_id: rzpPlanId,
        p_reason: writeSubErr ? writeSubErr.message : 'Zero rows updated during persistence'
      }).catch((e: any) => ({ error: { message: e.message } }))

      if (recErr || recRes?.status === 'reconciliation_recording_failed') {
        console.error(`[CRITICAL_CHECKOUT_ORPHAN_UNRECORDED] Failed to record orphaned Razorpay subscription in DB. Tenant ID: ${tenantId}, Reservation ID: ${reservationId}, Razorpay Sub ID: ${rzpSubIdCreated}. Error: ${recErr?.message || recRes?.reason || 'Unknown'}`)
      } else {
        console.error(`[CHECKOUT_ORPHAN_RECORDED] Orphaned Razorpay subscription recorded for reconciliation. Tenant ID: ${tenantId}, Reservation ID: ${reservationId}, Razorpay Sub ID: ${rzpSubIdCreated}`)
      }

      throw new Error(`CHECKOUT_RECONCILIATION_REQUIRED: Subscription created on Razorpay (${rzpSubIdCreated}) but database update failed. Reference: ${rzpSubIdCreated}. Please contact support to complete activation.`)
    }

    // Return subscription_id to frontend for modal display
    return new Response(
      JSON.stringify({ subscription_id: subData.id, key_id: keyId }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    )
  } catch (error) {
    // PRE-RAZORPAY API FAILURE RECOVERY: Release lease token if Razorpay sub was not created yet
    if (tenantId && checkoutToken && !rzpSubIdCreated && supabaseAdmin) {
      await supabaseAdmin.rpc('release_checkout_reservation', {
        p_tenant_id: tenantId,
        p_checkout_token: checkoutToken,
        p_reason: error.message
      }).catch((e: any) => console.error("Failed to release checkout lease", e))
    }

    const isAuthError = error.message?.includes('Unauthorized') || error.message?.includes('Missing Authorization')
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: isAuthError ? 401 : (error.message?.includes('reservation is currently in progress') ? 409 : 400),
    })
  }
})
