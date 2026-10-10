import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'

export async function processRazorpayWebhook(req: Request, targetEnv: 'test' | 'live' | 'any') {
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 })
  }

  try {
    const signature = req.headers.get('x-razorpay-signature')
    if (!signature) {
      return new Response(JSON.stringify({ error: 'Missing x-razorpay-signature header' }), { status: 401 })
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const testSecret = (Deno.env.get('RAZORPAY_TEST_WEBHOOK_SECRET') || Deno.env.get('RAZORPAY_WEBHOOK_SECRET'))?.trim()
    const liveSecret = Deno.env.get('RAZORPAY_LIVE_WEBHOOK_SECRET')?.trim()

    const rawBody = await req.text()

    const verifySignature = async (bodyText: string, sig: string, secret: string): Promise<boolean> => {
      const textEncoder = new TextEncoder()
      const key = await crypto.subtle.importKey(
        'raw',
        textEncoder.encode(secret),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign']
      )
      const signatureBuffer = await crypto.subtle.sign('HMAC', key, textEncoder.encode(bodyText))
      const hexSig = Array.from(new Uint8Array(signatureBuffer))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('')
      return hexSig === sig
    }

    let verifiedEnv: 'test' | 'live' | null = null

    if (targetEnv === 'test') {
      if (!testSecret) throw new Error('Test Webhook Secret not configured')
      const isValid = await verifySignature(rawBody, signature, testSecret)
      if (!isValid) return new Response(JSON.stringify({ error: 'Invalid Test Webhook Signature' }), { status: 400 })
      verifiedEnv = 'test'
    } else if (targetEnv === 'live') {
      if (!liveSecret) throw new Error('Live Webhook Secret not configured')
      const isValid = await verifySignature(rawBody, signature, liveSecret)
      if (!isValid) return new Response(JSON.stringify({ error: 'Invalid Live Webhook Signature' }), { status: 400 })
      verifiedEnv = 'live'
    } else {
      if (testSecret && await verifySignature(rawBody, signature, testSecret)) {
        verifiedEnv = 'test'
      } else if (liveSecret && await verifySignature(rawBody, signature, liveSecret)) {
        verifiedEnv = 'live'
      } else {
        return new Response(JSON.stringify({ error: 'Invalid Webhook Signature' }), { status: 400 })
      }
    }

    const payload = JSON.parse(rawBody)
    const event = payload.event
    const subEntity = payload.payload?.subscription?.entity
    const paymentEntity = payload.payload?.payment?.entity

    if (!subEntity) {
      return new Response(JSON.stringify({ status: 'ignored', reason: 'No subscription entity in payload' }), { status: 200 })
    }

    const subId = subEntity.id

    // Fetch local saas_subscription record to confirm presence & tenant ownership
    const { data: saasSub, error: subErr } = await supabaseAdmin
      .from('saas_subscriptions')
      .select('*')
      .eq('razorpay_subscription_id', subId)
      .single()

    if (subErr || !saasSub) {
      return new Response(JSON.stringify({ status: 'ignored', reason: 'Subscription ID not found in database' }), { status: 200 })
    }

    // STRICT ENVIRONMENT GUARD: Mismatched environment rejected
    const subEnv = saasSub.environment || 'test'
    if (subEnv !== verifiedEnv) {
      return new Response(JSON.stringify({ 
        status: 'rejected', 
        reason: `Environment mismatch: ${verifiedEnv} webhook cannot update ${subEnv} subscription.` 
      }), { status: 400 })
    }

    // Parse payload timestamps safely
    const newPeriodStart = subEntity.current_start ? new Date(subEntity.current_start * 1000).toISOString() : new Date().toISOString()
    const newPeriodEnd = subEntity.current_end ? new Date(subEntity.current_end * 1000).toISOString() : new Date(Date.now() + 30*24*60*60*1000).toISOString()

    // Invoking Atomic RPC process_subscription_webhook STRICTLY (No fallbacks)
    const { data: rpcRes, error: rpcErr } = await supabaseAdmin.rpc('process_subscription_webhook', {
      p_razorpay_sub_id: subId,
      p_event_type: event,
      p_event_env: verifiedEnv,
      p_status: subEntity.status || 'active',
      p_current_start: newPeriodStart,
      p_current_end: newPeriodEnd,
      p_payment_id: paymentEntity?.id || null,
      p_amount: paymentEntity?.amount || null,
      p_currency: paymentEntity?.currency || null,
      p_payment_status: paymentEntity?.status || null,
      p_payment_method: paymentEntity?.method || null,
      p_invoice_id: paymentEntity?.invoice_id || null
    })

    if (rpcErr || rpcRes?.status === 'rejected') {
      console.error("Atomic RPC execution failed:", rpcErr?.message || rpcRes?.reason)
      return new Response(JSON.stringify({ 
        error: `Database transaction failed: ${rpcErr?.message || rpcRes?.reason}` 
      }), { status: 500 })
    }

    return new Response(JSON.stringify({ status: 'success', environment: verifiedEnv, rpc_result: rpcRes }), { 
      status: 200, 
      headers: { 'Content-Type': 'application/json' } 
    })

  } catch (error) {
    console.error('Webhook processing failed:', error.message)
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    })
  }
}

serve(async (req) => {
  return await processRazorpayWebhook(req, 'any')
})
