import { serve } from "https://deno.land/std@0.177.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.1"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error('Server misconfiguration')
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Verify the caller is an admin
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) throw new Error('No authorization header')
    
    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)
    
    if (authError || !user) throw new Error('Unauthorized')

    // Check if caller is super_admin
    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
    if (profile?.role !== 'super_admin') {
      throw new Error('Forbidden: Only super admin can perform this action')
    }

    // Parse the request
    const body = await req.json()
    const { targetUserId, action, payload } = body

    if (!targetUserId || !action) {
      throw new Error('targetUserId and action are required')
    }

    if (action === 'reset_password') {
      const { newPassword } = payload
      if (!newPassword || newPassword.length < 6) throw new Error('Password must be at least 6 characters')

      const { error: updateError } = await supabase.auth.admin.updateUserById(targetUserId, {
        password: newPassword
      })
      if (updateError) throw updateError

      return new Response(JSON.stringify({ success: true, message: 'Password updated successfully' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }
    
    if (action === 'toggle_status') {
      const { isDisabled } = payload
      
      // Update ban status
      const banDuration = isDisabled ? '876000h' : 'none'
      const { error: banError } = await supabase.auth.admin.updateUserById(targetUserId, {
        ban_duration: banDuration
      })
      if (banError) throw banError

      // Fetch existing profile to update global_settings
      const { data: targetProfile, error: profileErr } = await supabase.from('profiles').select('global_settings').eq('id', targetUserId).single()
      if (profileErr) throw profileErr

      const updatedSettings = {
        ...(targetProfile.global_settings || {}),
        is_disabled: isDisabled
      }

      const { error: updateProfileErr } = await supabase.from('profiles').update({ global_settings: updatedSettings }).eq('id', targetUserId)
      if (updateProfileErr) throw updateProfileErr

      return new Response(JSON.stringify({ success: true, message: isDisabled ? 'Account disabled' : 'Account enabled' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    throw new Error('Invalid action')

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400
    })
  }
})
