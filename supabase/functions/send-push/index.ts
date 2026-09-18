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
    console.log(`Received Webhook! Table: ${table}, Type: ${type}`);
    console.log('Record ID:', record.id);

    if (type !== 'INSERT') {
       console.log('Ignoring non-insert');
       return new Response(JSON.stringify({ message: 'Ignored non-inserts' }), { headers: corsHeaders })
    }

    let userIdsToNotify = [];
    let title = '';
    let body = '';
    let notificationData = {};

    if (table === 'bookings') {
      const tenantId = record.tenant_id;
      console.log('Processing booking for tenant:', tenantId);
      
      const { data: profiles } = await supabaseClient
        .from('profiles')
        .select('id')
        .or(`tenant_id.eq.${tenantId},id.eq.${tenantId}`);
        
      userIdsToNotify = profiles?.map(p => p.id) || [];
      title = `New Booking: ${record.guest_name || 'Guest'}`
      body = `A new booking was just created in your property!`
      notificationData = { type: 'booking', id: record.id }
    }
    else if (table === 'broadcast_messages') {
      if (record.target_user_id) {
        userIdsToNotify = [record.target_user_id];
      } else {
        const { data: tokens } = await supabaseClient.from('fcm_tokens').select('user_id');
        userIdsToNotify = tokens?.map(t => t.user_id) || [];
      }
      title = record.title;
      body = record.body;
      notificationData = { type: 'broadcast', id: record.id }
    }
    else if (table === 'support_messages') {
      if (record.is_from_admin) {
        // Find the tenant who owns the ticket
        const { data: ticket } = await supabaseClient.from('support_tickets').select('tenant_id').eq('id', record.ticket_id).single()
        if (ticket) {
          userIdsToNotify = [ticket.tenant_id];
          title = 'Support Update 📩'
          body = 'You have a new reply from StayPilot Support.'
          notificationData = { type: 'support', id: record.ticket_id }
        }
      } else {
        return new Response(JSON.stringify({ message: 'Ignored tenant message' }), { headers: corsHeaders })
      }
    }
    else {
      return new Response(JSON.stringify({ message: 'Unsupported table' }), { headers: corsHeaders })
    }

    if (userIdsToNotify.length === 0) {
      console.log('No users to notify');
      return new Response(JSON.stringify({ message: 'No target users found' }), { headers: corsHeaders })
    }

    console.log('Fetching FCM tokens for users:', userIdsToNotify);
    const { data: tokens } = await supabaseClient
      .from('fcm_tokens')
      .select('token')
      .in('user_id', userIdsToNotify)

    if (!tokens || tokens.length === 0) {
      console.log('No devices found for target users');
      return new Response(JSON.stringify({ message: 'No devices found' }), { headers: corsHeaders })
    }
    console.log(`Found ${tokens.length} devices to notify!`);

    const serviceAccountJson = Deno.env.get('FIREBASE_SERVICE_ACCOUNT')
    if (!serviceAccountJson) throw new Error('FIREBASE_SERVICE_ACCOUNT secret is missing')
    
    const serviceAccount = JSON.parse(serviceAccountJson)
    const projectId = serviceAccount.project_id
    const accessToken = await getAccessToken(serviceAccount)

    console.log('Dispatching to Firebase...');
    const fcmPromises = tokens.map(async (device) => {
      const res = await fetch(`https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          message: {
            token: device.token,
            notification: { title, body },
            data: notificationData
          }
        })
      });
      const responseText = await res.text();
      if (!res.ok) {
        console.error('Firebase Error:', responseText);
      } else {
        console.log('Firebase Success:', responseText);
      }
      return res;
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

