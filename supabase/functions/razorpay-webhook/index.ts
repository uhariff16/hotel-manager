import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'

serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 })
  }

  try {
    const signature = req.headers.get('x-razorpay-signature')
    if (!signature) {
      throw new Error('Missing signature')
    }

    // Admin client to read global settings and update tables securely
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // 1. Fetch Global Settings for Webhook Secret
    const { data: adminProfiles, error: adminErr } = await supabaseAdmin
      .from('profiles')
      .select('global_settings')
      .eq('role', 'super_admin')
      .limit(1)

    if (adminErr || !adminProfiles || adminProfiles.length === 0) {
      throw new Error('Could not load global settings')
    }

    const razorpayConfig = adminProfiles[0].global_settings?.razorpay_settings || {}
    const webhookSecret = razorpayConfig.webhookSecret

    if (!webhookSecret) {
      throw new Error('Webhook secret not configured in system')
    }

    // 2. Read raw body text for signature validation
    const rawBody = await req.text()

    // Validate Signature
    const textEncoder = new TextEncoder()
    const key = await crypto.subtle.importKey(
      'raw',
      textEncoder.encode(webhookSecret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    )
    const signatureBuffer = await crypto.subtle.sign(
      'HMAC',
      key,
      textEncoder.encode(rawBody)
    )
    const hexSignature = Array.from(new Uint8Array(signatureBuffer))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')

    if (hexSignature !== signature) {
      throw new Error('Invalid signature')
    }

    const payload = JSON.parse(rawBody)
    const event = payload.event

    const subEntity = payload.payload?.subscription?.entity
    const paymentEntity = payload.payload?.payment?.entity

    if (!subEntity) {
      return new Response(JSON.stringify({ status: 'ignored', reason: 'no subscription entity' }), { status: 200 })
    }

    const subId = subEntity.id

    // Fetch the saas_subscription record
    const { data: saasSub, error: subErr } = await supabaseAdmin
      .from('saas_subscriptions')
      .select('*')
      .eq('razorpay_subscription_id', subId)
      .single()

    if (subErr || !saasSub) {
      return new Response(JSON.stringify({ status: 'ignored', reason: 'subscription not found in DB' }), { status: 200 })
    }

    const tenantId = saasSub.tenant_id
    
    // Fetch tenant email securely from auth.users
    let tenantEmail = null;
    try {
      const { data: userResponse, error: userError } = await supabaseAdmin.auth.admin.getUserById(tenantId);
      if (!userError && userResponse.user) {
        tenantEmail = userResponse.user.email;
      }
    } catch (e) {
      console.error("Failed to fetch tenant email", e);
    }

    // 3. Process Events
    if (event === 'subscription.activated' || event === 'subscription.authenticated') {
      
      const wasAlreadyActive = saasSub.status === 'active';

      await supabaseAdmin.from('saas_subscriptions').update({
        status: 'active',
        current_period_start: new Date(subEntity.current_start * 1000).toISOString(),
        current_period_end: new Date(subEntity.current_end * 1000).toISOString(),
      }).eq('id', saasSub.id)

      await supabaseAdmin.from('profiles').update({
        plan_type: saasSub.staypilot_plan_type
      }).eq('id', tenantId)

      // Only invoke mailer if this is the FIRST time it's being marked active
      // (razorpay-verify might have already done this on the frontend)
      if (tenantEmail && !wasAlreadyActive) {
        await supabaseAdmin.functions.invoke('saas-mailer', {
          body: {
            type: 'subscription_activated',
            event_data: {
              tenant_email: tenantEmail,
              plan_type: saasSub.staypilot_plan_type,
              period_end: new Date(subEntity.current_end * 1000).toISOString()
            }
          }
        }).catch(err => console.error("Failed to send activation email", err));
      }
    } else if (event === 'subscription.charged') {
      await supabaseAdmin.from('saas_subscriptions').update({
        status: 'active',
        current_period_start: new Date(subEntity.current_start * 1000).toISOString(),
        current_period_end: new Date(subEntity.current_end * 1000).toISOString(),
      }).eq('id', saasSub.id)

      if (paymentEntity) {
        // Upsert payment to prevent duplicates (using razorpay_payment_id as unique constraint)
        await supabaseAdmin.from('saas_payments').upsert({
          tenant_id: tenantId,
          razorpay_payment_id: paymentEntity.id,
          razorpay_subscription_id: subId,
          razorpay_invoice_id: paymentEntity.invoice_id,
          amount: paymentEntity.amount,
          currency: paymentEntity.currency,
          status: paymentEntity.status,
          payment_method: paymentEntity.method
        }, { onConflict: 'razorpay_payment_id' })
        
        if (tenantEmail) {
          await supabaseAdmin.functions.invoke('saas-mailer', {
            body: {
              type: 'payment_receipt',
              event_data: {
                tenant_email: tenantEmail,
                amount: paymentEntity.amount,
                payment_id: paymentEntity.id
              }
            }
          }).catch(err => console.error("Failed to send receipt email", err));
        }
      }

    } else if (event === 'subscription.cancelled' || event === 'subscription.halted' || event === 'subscription.completed') {
      const newStatus = event.split('.')[1] // 'cancelled', 'halted', 'completed'
      
      await supabaseAdmin.from('saas_subscriptions').update({
        status: newStatus
      }).eq('id', saasSub.id)

      // Revoke access immediately (if business logic dictates they keep it till end of period, this needs refinement. 
      // But for simplicity and security, halting revokes it. Cancellation can be end of period if managed properly.
      // Usually, Razorpay cancels at period end, but if this webhook fires, it means it's effectively over.)
      await supabaseAdmin.from('profiles').update({
        plan_type: 'free'
      }).eq('id', tenantId)
      
      if (tenantEmail && (newStatus === 'cancelled' || newStatus === 'completed')) {
        await supabaseAdmin.functions.invoke('saas-mailer', {
          body: {
            type: 'subscription_cancelled',
            event_data: {
              tenant_email: tenantEmail
            }
          }
        }).catch(err => console.error("Failed to send cancellation email", err));
      }
    }

    return new Response(JSON.stringify({ status: 'success' }), { status: 200, headers: { 'Content-Type': 'application/json' } })
  } catch (error) {
    console.error('Webhook processing failed:', error.message)
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    })
  }
})
