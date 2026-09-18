import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.4'
import { create } from 'https://deno.land/x/djwt@v2.9.1/mod.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

async function getAccessToken(serviceAccount) {
  const jwtPayload = {
    iss: serviceAccount.client_email,
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
    aud: 'https://oauth2.googleapis.com/token',
    exp: Math.floor(Date.now() / 1000) + 3600,
    iat: Math.floor(Date.now() / 1000),
  }

  const pemHeader = '-----BEGIN PRIVATE KEY-----'
  const pemFooter = '-----END PRIVATE KEY-----'
  const pemContents = serviceAccount.private_key.substring(
    pemHeader.length,
    serviceAccount.private_key.length - pemFooter.length - 1
  ).replace(/\n/g, '')

  const binaryDerString = atob(pemContents)
  const binaryDer = new Uint8Array(binaryDerString.length)
  for (let i = 0; i < binaryDerString.length; i++) {
    binaryDer[i] = binaryDerString.charCodeAt(i)
  }

  const key = await crypto.subtle.importKey(
    'pkcs8',
    binaryDer.buffer,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  )

  const jwt = await create({ alg: 'RS256', typ: 'JWT' }, jwtPayload, key)

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  })

  const tokenData = await res.json()
  return tokenData.access_token
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const { record, type, table } = await req.json()
    if (table !== 'bookings' || type !== 'INSERT') {
       return new Response(JSON.stringify({ message: 'Ignored' }), { headers: corsHeaders })
    }

    const resortId = record.resort_id
    
    // Notify all staff and admins for this resort
    const { data: profiles } = await supabaseClient
      .from('profiles')
      .select('id')
      .eq('active_resort_id', resortId)
      
    if (!profiles || profiles.length === 0) {
      return new Response(JSON.stringify({ message: 'No users found' }), { headers: corsHeaders })
    }
    
    const userIds = profiles.map(p => p.id)

    const { data: tokens } = await supabaseClient
      .from('fcm_tokens')
      .select('token')
      .in('user_id', userIds)

    if (!tokens || tokens.length === 0) {
      return new Response(JSON.stringify({ message: 'No devices found' }), { headers: corsHeaders })
    }

    const serviceAccountJson = Deno.env.get('FIREBASE_SERVICE_ACCOUNT')
    if (!serviceAccountJson) throw new Error('FIREBASE_SERVICE_ACCOUNT secret is missing')
    
    const serviceAccount = JSON.parse(serviceAccountJson)
    const projectId = serviceAccount.project_id
    const accessToken = await getAccessToken(serviceAccount)

    const title = 'New Booking Alert ??'
    const body = 'A new booking was just created in your property.'

    const fcmPromises = tokens.map((device) => {
      return fetch(\https://fcm.googleapis.com/v1/projects/\/messages:send\, {
        method: 'POST',
        headers: {
          'Authorization': \Bearer \\,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          message: {
            token: device.token,
            notification: { title, body },
            data: { booking_id: record.id }
          }
        })
      })
    })

    await Promise.all(fcmPromises)

    return new Response(JSON.stringify({ success: true, devices_notified: tokens.length }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })
  }
})

