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

    // 4. MANDATORY PRE-CHECKOUT BILLING VALIDATION GUARD
    // Prevents acquiring reservation lease or initiating Razorpay checkout if tenant cannot be invoiced
    let tenantProfile = userProfile
    if (tenantId !== userProfile.id) {
      const { data: tProf, error: tErr } = await supabaseAdmin
        .from('profiles')
        .select('id, full_name, email, global_settings')
        .eq('id', tenantId)
        .single()
      if (!tErr && tProf) {
        tenantProfile = tProf
      }
    }

    const tenantBilling = tenantProfile.global_settings?.billing || tenantProfile.global_settings?.tenant_billing || {}
    const bName = String(tenantBilling.name || tenantProfile.full_name || '').trim()
    const bEmail = String(tenantBilling.email || user.email || '').trim()
    const bAddress = String(tenantBilling.address_line1 || tenantBilling.address || '').trim()
    const bState = String(tenantBilling.state || '').trim()

    const missingBillingFields: string[] = []
    if (!bName || bName.length < 2) missingBillingFields.push('name')
    if (!bEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(bEmail)) missingBillingFields.push('email')
    if (!bAddress || bAddress.length < 3) missingBillingFields.push('address')
    if (!bState || bState.length < 2) missingBillingFields.push('state')

    if (missingBillingFields.length > 0) {
      return new Response(JSON.stringify({
        error: 'MISSING_BILLING_DETAILS',
        message: 'Billing profile incomplete. Please update your billing details in Settings before subscribing.',
        missing_fields: missingBillingFields
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400
      })
    }

    // 5. ATOMIC CHECKOUT RESERVATION LEASE RPC (Blocks unresolved reconciliation_required records)
    const { data: rpcRes, error: rpcErr } = await supabaseAdmin.rpc('acquire_checkout_reservation', {
      p_tenant_id: tenantId,
      p_plan_type: targetPlanKey,
      p_environment: envMode
    })

    if (rpcErr) {
      throw new Error(`Failed to acquire checkout reservation: ${rpcErr.message}`)
    }

    if (rpcRes.status === 'blocked' || rpcRes.status === 'blocked_active_subscription') {
      return new Response(JSON.stringify({ 
        error: `You already have an active paid subscription (${rpcRes.plan_type || 'paid plan'}). Plan changes are managed via support.` 
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400
      })
    }

    if (rpcRes.status === 'reconciliation_required' || rpcRes.status === 'blocked_reconciliation_required') {
      return new Response(JSON.stringify({ 
        error: `Your account has an unresolved subscription transaction (Ref: ${rpcRes.razorpay_subscription_id || 'unresolved'}). Please contact support to complete your plan activation.` 
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400
      })
    }

    if (rpcRes.status === 'pending_lease' || rpcRes.status === 'reservation_in_progress') {
      return new Response(JSON.stringify({ 
        error: 'A checkout reservation is currently in progress for your account. Please wait a moment and try again.' 
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 409
      })
    }

    if (rpcRes.status === 'reuse' || rpcRes.status === 'reusable_lease') {
      return new Response(
        JSON.stringify({ subscription_id: rpcRes.razorpay_subscription_id || rpcRes.subscription_id, key_id: keyId }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      )
    }

    checkoutToken = rpcRes.checkout_token
    reservationId = rpcRes.reservation_id

    if (rpcRes.status !== 'proceed' && rpcRes.status !== 'lease_granted') {
      throw new Error(`Checkout reservation rejected: ${rpcRes.reason || rpcRes.status || 'Unknown status'}`)
    }

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
    
    // Apply Super Admin GST settings if enabled and effective (server-side time check)
    const taxSettings = settings.tax_settings || {}
    const isEffective = !taxSettings.effective_from || new Date(taxSettings.effective_from).getTime() <= Date.now()
    const isGstEnabled = Boolean(taxSettings.enabled) && Number(taxSettings.rate || 0) > 0 && isEffective
    const gstRate = isGstEnabled ? Number(taxSettings.rate) : 0
    const pricingMode = taxSettings.pricing_mode === 'inclusive' ? 'inclusive' : 'exclusive'

    let priceInPaise = basePricePaise
    let gstAmountPaise = 0
    let effectiveBasePaise = basePricePaise

    if (isGstEnabled) {
      if (pricingMode === 'inclusive') {
        priceInPaise = basePricePaise
        effectiveBasePaise = Math.round(priceInPaise / (1 + (gstRate / 100)))
        gstAmountPaise = priceInPaise - effectiveBasePaise
      } else {
        gstAmountPaise = Math.round(basePricePaise * (gstRate / 100))
        priceInPaise = basePricePaise + gstAmountPaise
        effectiveBasePaise = basePricePaise
      }
    }

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
            (p.notes?.plan_type === targetPlanKey || p.item?.name?.includes(targetPlanKey) || p.item?.name?.includes(planData.displayPlanName || planData.name || '')) &&
            (!isGstEnabled || (p.notes?.gst_rate === String(gstRate) && (p.notes?.pricing_mode || 'exclusive') === pricingMode))
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
              description: `Monthly SaaS Subscription${isGstEnabled ? ` (${pricingMode === 'inclusive' ? 'incl.' : '+'} ${gstRate}% GST)` : ''}`
            },
            notes: { 
              plan_type: targetPlanKey, 
              environment: envMode,
              gst_rate: String(gstRate),
              pricing_mode: pricingMode,
              base_price_paise: String(effectiveBasePaise),
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

    // 8. CUSTOMER RESOLUTION & IDENTITY BINDING (Phase R2)
    let rzpCustomerId: string | null = null

    // Step A1: Check local environment-aware customer mapping table
    const { data: existingCustMapping } = await supabaseAdmin
      .from('razorpay_customers')
      .select('razorpay_customer_id')
      .eq('tenant_id', tenantId)
      .eq('environment', envMode)
      .maybeSingle()

    let candidateCustId = existingCustMapping?.razorpay_customer_id || null

    // Step A2: Fallback check saas_subscriptions for previously stashed customer ID
    if (!candidateCustId) {
      const { data: stashedSub } = await supabaseAdmin
        .from('saas_subscriptions')
        .select('razorpay_customer_id')
        .eq('tenant_id', tenantId)
        .eq('environment', envMode)
        .not('razorpay_customer_id', 'is', null)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (stashedSub?.razorpay_customer_id) {
        candidateCustId = stashedSub.razorpay_customer_id
      }
    }

    if (candidateCustId) {
      // Step B: Verify the customer still exists on Razorpay API in this environment
      try {
        const verifyCustRes = await fetch(`https://api.razorpay.com/v1/customers/${candidateCustId}`, {
          headers: { 'Authorization': rzpAuthHeader }
        })
        if (verifyCustRes.ok) {
          rzpCustomerId = candidateCustId
          // Backfill into razorpay_customers if missing from primary mapping table
          if (!existingCustMapping?.razorpay_customer_id) {
            await supabaseAdmin.from('razorpay_customers').upsert({
              tenant_id: tenantId,
              environment: envMode,
              razorpay_customer_id: rzpCustomerId,
              email: user.email,
              name: userProfile.full_name || 'Stay Pilot Tenant',
              updated_at: new Date().toISOString()
            }, { onConflict: 'tenant_id,environment' })
          }
        } else if (verifyCustRes.status === 404) {
          console.warn(`[Phase R2] Existing customer ${candidateCustId} not found on Razorpay ${envMode}. Purging stale mapping.`)
          await supabaseAdmin
            .from('razorpay_customers')
            .delete()
            .eq('tenant_id', tenantId)
            .eq('environment', envMode)
        }
      } catch (err) {
        console.warn(`[Phase R2] Error verifying customer with Razorpay:`, err)
      }
    }

    // Step C: If no verified customer ID exists, create one authoritatively on Razorpay
    if (!rzpCustomerId) {
      const tenantBilling = userProfile.global_settings?.tenant_billing || {}
      const customerContact = userProfile.phone || userProfile.phone_number || undefined
      
      const customerPayload: Record<string, any> = {
        name: tenantBilling.companyName || userProfile.full_name || 'Stay Pilot Tenant',
        email: user.email,
        fail_existing: 0,
        notes: { 
          tenant_id: tenantId,
          environment: envMode
        }
      }

      if (customerContact) {
        customerPayload.contact = customerContact
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
      
      if (!customerRes.ok) {
        const errData = await customerRes.json().catch(() => ({}))
        const errDesc = errData?.error?.description || errData?.message || ''
        
        // If customer already exists on Razorpay for this merchant, retrieve and reuse it
        if (errDesc.includes('Customer already exists') || customerRes.status === 400) {
          console.warn(`[Phase R2] Customer exists on Razorpay for ${user.email}. Looking up existing customer record.`)
          const lookupRes = await fetch('https://api.razorpay.com/v1/customers?count=50', {
            headers: { 'Authorization': rzpAuthHeader }
          })
          if (lookupRes.ok) {
            const listData = await lookupRes.json()
            const match = listData.items?.find((c: any) => c.email?.toLowerCase() === user.email?.toLowerCase())
            if (match?.id) {
              rzpCustomerId = match.id
              console.log(`[Phase R2] Successfully reused existing Razorpay customer: ${rzpCustomerId} for ${user.email}`)
            }
          }
        }

        if (!rzpCustomerId) {
          console.error(`[Phase R2] Razorpay customer creation failed on ${envMode}:`, errData)
          throw new Error(`Failed to create verified Razorpay customer on ${envMode}: ${errDesc || JSON.stringify(errData)}`)
        }
      } else {
        const cData = await customerRes.json()
        if (!cData.id) {
          throw new Error(`Razorpay returned customer without valid ID: ${JSON.stringify(cData)}`)
        }
        rzpCustomerId = cData.id
      }

      // Step D: Persist the verified customer mapping with safe recovery retry
      let saveCustErr: any = null
      for (let attempt = 1; attempt <= 2; attempt++) {
        const { error: err } = await supabaseAdmin
          .from('razorpay_customers')
          .upsert({
            tenant_id: tenantId,
            environment: envMode,
            razorpay_customer_id: rzpCustomerId,
            email: user.email,
            name: customerPayload.name,
            contact: customerContact || null,
            updated_at: new Date().toISOString()
          }, {
            onConflict: 'tenant_id,environment'
          })
        saveCustErr = err
        if (!saveCustErr) break
        await new Promise((resolve) => setTimeout(resolve, 100))
      }

      // If persistence remains unsuccessful, DO NOT proceed to create a subscription!
      if (saveCustErr) {
        console.error(`[Phase R2] Failed to persist razorpay_customers mapping after retry:`, saveCustErr)

        // Preserve recoverable customer identifier on saas_subscriptions lease row
        await supabaseAdmin
          .from('saas_subscriptions')
          .update({
            razorpay_customer_id: rzpCustomerId,
            updated_at: new Date().toISOString()
          })
          .eq('tenant_id', tenantId)
          .eq('checkout_token', checkoutToken)

        // Stop checkout immediately before creating any subscription entity
        throw new Error(`CUSTOMER_MAPPING_PERSISTENCE_FAILED: Razorpay customer ${rzpCustomerId} created, but database mapping persistence failed. Checkout halted to prevent duplicate customer creation.`)
      }
    }

    // STRICT IDENTITY VALIDATION GUARD: Customer ID MUST be non-null
    if (!rzpCustomerId) {
      throw new Error(`CUSTOMER_IDENTITY_ERROR: Unable to resolve or create a verified Razorpay customer for tenant ${tenantId} on ${envMode}. Checkout halted.`)
    }

    // 9. Create Razorpay Subscription Entity with 3-Way Outcome Differentiation
    let subRes: Response | null = null
    let subFetchError: any = null

    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 15000)

      subRes = await fetch('https://api.razorpay.com/v1/subscriptions', {
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
            plan_type: targetPlanKey,
            environment: envMode
          }
        }),
        signal: controller.signal
      })
      clearTimeout(timeoutId)
    } catch (fetchErr: any) {
      subFetchError = fetchErr
    }

    // OUTCOME 1: Uncertain API Outcome (Network timeout, abort, connection drop, or 5xx server error)
    if (subFetchError || (subRes && subRes.status >= 500)) {
      const errorMsg = subFetchError 
        ? `Timeout or network failure during Razorpay subscription creation (${subFetchError.message || subFetchError})`
        : `Razorpay API server error HTTP ${subRes?.status}`

      console.error(`[Phase R2 UNCERTAIN_OUTCOME] ${errorMsg}. Tenant: ${tenantId}, Reservation: ${reservationId}. Locking lease for reconciliation.`)

      // Flag reservation as reconciliation_required and DO NOT release lease
      await supabaseAdmin.rpc('record_orphaned_checkout_subscription', {
        p_tenant_id: tenantId,
        p_reservation_id: reservationId,
        p_checkout_token: checkoutToken,
        p_razorpay_sub_id: `UNKNOWN_TIMEOUT_${Date.now()}`,
        p_razorpay_plan_id: rzpPlanId,
        p_reason: errorMsg
      }).catch((e: any) => console.error("Failed to flag uncertain reservation", e))

      return new Response(JSON.stringify({ 
        error: `CHECKOUT_UNCERTAIN_OUTCOME: The payment gateway took too long to respond. To prevent duplicate subscription creation, your reservation is temporarily held for verification. Please contact support. Reference: ${reservationId}`
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 504
      })
    }

    // OUTCOME 2: Confirmed API Rejection (HTTP 4xx - e.g. 400 Bad Request, 401, 404, 422)
    if (subRes && !subRes.ok) {
      const errData = await subRes.json().catch(() => ({ error: { description: 'Razorpay API rejected subscription creation' } }))
      const errDesc = errData?.error?.description || errData?.message || `HTTP ${subRes.status}`
      console.warn(`[Phase R2 CONFIRMED_REJECTION] Razorpay rejected subscription: ${errDesc}. Safe to release lease.`)

      // Confirmed rejection: Razorpay definitely did NOT create resource. Safe to release lease.
      await supabaseAdmin.rpc('release_checkout_reservation', {
        p_tenant_id: tenantId,
        p_checkout_token: checkoutToken,
        p_reason: `confirmed_rejection: ${errDesc}`
      }).catch((e: any) => console.error("Failed to release lease on confirmed rejection", e))

      return new Response(JSON.stringify({ 
        error: `Subscription creation rejected by Razorpay: ${errDesc}`
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400
      })
    }

    // OUTCOME 3: Confirmed API Success (HTTP 200/201 with verified subscription ID)
    const subData = await subRes.json()
    rzpSubIdCreated = subData.id

    // 10. Update EXACT Reservation Row Matching BOTH reservation_id AND checkout_token
    // 10. Update EXACT Reservation Row Matching tenant_id AND checkout_token
    let writeSubErr: any = null
    let updatedRows: any = null

    // Attempt atomic confirm_checkout_reservation RPC first
    let confirmRes: any = null
    let confirmErr: any = null
    try {
      const cRes = await supabaseAdmin.rpc('confirm_checkout_reservation', {
        p_tenant_id: tenantId,
        p_checkout_token: checkoutToken,
        p_razorpay_sub_id: subData.id,
        p_razorpay_plan_id: rzpPlanId,
        p_plan_type: targetPlanKey,
        p_razorpay_customer_id: rzpCustomerId,
        p_environment: envMode
      })
      confirmRes = cRes.data
      confirmErr = cRes.error
    } catch (e: any) {
      confirmErr = e
    }

    if (!confirmErr && confirmRes?.status === 'success') {
      updatedRows = [{ id: tenantId }]
    } else {
      // Direct update matching tenant_id and checkout_token
      let updateQuery = supabaseAdmin
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
          checkout_expires_at: null,
          updated_at: new Date().toISOString()
        })
        .eq('tenant_id', tenantId)
        .eq('checkout_token', checkoutToken)

      if (reservationId) {
        updateQuery = updateQuery.eq('id', reservationId)
      }

      const res = await updateQuery.select('id')
      writeSubErr = res.error
      updatedRows = res.data
    }

    if (writeSubErr || !updatedRows || updatedRows.length !== 1) {
      // POST-RAZORPAY DB PERSISTENCE FAILURE: Explicitly check record_orphaned_checkout_subscription RPC result
      let recRes: any = null
      let recErr: any = null
      try {
        const rRes = await supabaseAdmin.rpc('record_orphaned_checkout_subscription', {
          p_tenant_id: tenantId,
          p_reservation_id: reservationId,
          p_checkout_token: checkoutToken,
          p_razorpay_sub_id: rzpSubIdCreated,
          p_razorpay_plan_id: rzpPlanId,
          p_reason: writeSubErr ? writeSubErr.message : 'Zero rows updated during persistence'
        })
        recRes = rRes.data
        recErr = rRes.error
      } catch (e: any) {
        recErr = e
      }

      if (recErr || recRes?.status === 'reconciliation_recording_failed') {
        console.error(`[CRITICAL_CHECKOUT_ORPHAN_UNRECORDED] Failed to record orphaned Razorpay subscription in DB. Tenant ID: ${tenantId}, Reservation ID: ${reservationId}, Razorpay Sub ID: ${rzpSubIdCreated}. Error: ${recErr?.message || recRes?.reason || 'Unknown'}`)
      } else {
        console.error(`[CHECKOUT_ORPHAN_RECORDED] Orphaned Razorpay subscription recorded for reconciliation. Tenant ID: ${tenantId}, Reservation ID: ${reservationId}, Razorpay Sub ID: ${rzpSubIdCreated}`)
      }

      throw new Error(`CHECKOUT_RECONCILIATION_REQUIRED: Subscription created on Razorpay (${rzpSubIdCreated}) but database update failed. Reference: ${rzpSubIdCreated}. Please contact support to complete activation.`)
    }

    // Return subscription_id and customer_id to frontend for modal display
    return new Response(
      JSON.stringify({ 
        subscription_id: subData.id, 
        key_id: keyId,
        customer_id: rzpCustomerId 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    )
  } catch (error: any) {
    console.error(`[CHECKOUT_ERROR] Error in razorpay-create-subscription:`, error?.message || error)

    // PRE-RAZORPAY API FAILURE RECOVERY: Release lease token if Razorpay sub was not created yet
    try {
      if (tenantId && checkoutToken && !rzpSubIdCreated && supabaseAdmin) {
        await supabaseAdmin.rpc('release_checkout_reservation', {
          p_tenant_id: tenantId,
          p_checkout_token: checkoutToken,
          p_reason: String(error?.message || error || 'Unknown checkout error')
        })
      }
    } catch (releaseErr) {
      console.error("Failed to release checkout lease", releaseErr)
    }

    const errorMsg = String(error?.message || error || 'Unknown checkout error')
    const isAuthError = errorMsg.includes('Unauthorized') || errorMsg.includes('Missing Authorization')
    return new Response(JSON.stringify({ error: errorMsg }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: isAuthError ? 401 : (errorMsg.includes('reservation is currently in progress') ? 409 : 400),
    })
  }
})
