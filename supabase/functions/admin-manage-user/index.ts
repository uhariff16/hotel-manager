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

    if (action === 'archive_account') {
      const CANONICAL_SUPER_ADMIN_ID = '9c4e65f5-c0a1-4b3a-8ed2-d01175a73409'
      if (user.id !== CANONICAL_SUPER_ADMIN_ID) {
        throw new Error('Forbidden: Only the canonical Super Administrator can archive accounts')
      }

      const { isArchived } = payload || {}
      if (typeof isArchived !== 'boolean') {
        throw new Error('isArchived boolean is required')
      }

      // 1. Call database RPC
      const { data: rpcData, error: rpcError } = await supabase.rpc('archive_tenant_account', {
        p_tenant_id: targetUserId,
        p_is_archived: isArchived,
        p_actor_id: user.id
      })

      if (rpcError) {
        throw new Error(`Failed to archive account: ${rpcError.message}`)
      }

      // 2. Update Supabase Auth ban status (disabled when archived)
      const banDuration = isArchived ? '876000h' : 'none'
      try {
        await supabase.auth.admin.updateUserById(targetUserId, {
          ban_duration: banDuration
        })
      } catch (authBanErr) {
        console.warn('Auth ban status update warning:', authBanErr)
      }

      return new Response(JSON.stringify({
        success: true,
        message: isArchived ? 'Account archived successfully. Tenant access disabled.' : 'Account restored from archive.',
        data: rpcData
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    if (action === 'reset_test_account' || action === 'delete_empty_qa_account') {
      const CANONICAL_SUPER_ADMIN_ID = '9c4e65f5-c0a1-4b3a-8ed2-d01175a73409'
      if (user.id !== CANONICAL_SUPER_ADMIN_ID) {
        throw new Error('Forbidden: Only the canonical Super Administrator can reset or delete QA test accounts')
      }

      const { confirmEmail } = payload || {}
      if (!confirmEmail) {
        throw new Error('confirmEmail is required')
      }

      // 1. If active TEST subscription exists, reconcile and terminate safely in Razorpay (test mode) and DB
      try {
        const { data: activeSubs } = await supabase
          .from('saas_subscriptions')
          .select('id, razorpay_subscription_id, environment, status')
          .eq('tenant_id', targetUserId)
          .in('status', ['active', 'authenticated'])

        if (activeSubs && activeSubs.length > 0) {
          for (const sub of activeSubs) {
            // Strict check: Only TEST subscriptions can be automatically cancelled/reconciled
            if (sub.environment === 'test') {
              const razorpayKeyId = Deno.env.get('RAZORPAY_TEST_KEY_ID') || Deno.env.get('RAZORPAY_KEY_ID_TEST') || Deno.env.get('RAZORPAY_KEY_ID')
              const razorpaySecret = Deno.env.get('RAZORPAY_TEST_KEY_SECRET') || Deno.env.get('RAZORPAY_KEY_SECRET_TEST') || Deno.env.get('RAZORPAY_KEY_SECRET')
              if (razorpayKeyId && razorpaySecret && sub.razorpay_subscription_id) {
                try {
                  const auth = btoa(`${razorpayKeyId}:${razorpaySecret}`)
                  await fetch(`https://api.razorpay.com/v1/subscriptions/${sub.razorpay_subscription_id}/cancel`, {
                    method: 'POST',
                    headers: { 'Authorization': `Basic ${auth}`, 'Content-Type': 'application/json' },
                    body: JSON.stringify({ cancel_at_cycle_end: 0 })
                  })
                } catch (rzpErr) {
                  console.warn('Razorpay test cancellation non-fatal warning:', rzpErr)
                }
              }
              // Mark cancelled in database so the reset RPC proceeds
              await supabase.from('saas_subscriptions').update({ status: 'cancelled' }).eq('id', sub.id)
            }
          }
        }
      } catch (subReconcileErr) {
        console.warn('Subscription reconciliation warning:', subReconcileErr)
      }

      // 2. Storage cleanup for this tenant across buckets (non-fatal)
      try {
        const buckets = ['guest_ids', 'staypilot-media', 'property-images']
        for (const bucket of buckets) {
          try {
            const { data: files } = await supabase.storage.from(bucket).list(targetUserId, { limit: 1000 })
            if (files && files.length > 0) {
              const filePaths = files.map((f: { name: string }) => `${targetUserId}/${f.name}`)
              await supabase.storage.from(bucket).remove(filePaths)
            }
          } catch (_) {
            // Non-fatal per-bucket cleanup
          }
        }
      } catch (storageErr) {
        console.warn('Storage cleanup non-fatal warning:', storageErr)
      }

      // 3. Database cleanup via atomic RPC (environment-aware financial checks, booking triggers, audit log)
      const { data: rpcData, error: rpcError } = await supabase.rpc('reset_disposable_qa_account', {
        p_tenant_id: targetUserId,
        p_confirm_email: confirmEmail,
        p_actor_id: user.id
      })

      if (rpcError) {
        throw new Error(`Database cleanup failed: ${rpcError.message}`)
      }

      // 4. Remove Auth user using secure Supabase Admin API
      const { error: deleteAuthError } = await supabase.auth.admin.deleteUser(targetUserId)
      if (deleteAuthError && !deleteAuthError.message?.includes('User not found')) {
        throw new Error(`Auth deletion failed: ${deleteAuthError.message}`)
      }

      // 5. Verify Auth user deletion to guarantee email is immediately reusable for new registration
      const { data: checkUser } = await supabase.auth.admin.getUserById(targetUserId)
      if (checkUser?.user) {
        throw new Error('Verification failed: User identity still exists in Auth system')
      }

      return new Response(JSON.stringify({
        success: true,
        message: 'Test account reset successfully. Database records and Auth user removed.',
        email_reusable: true,
        data: rpcData
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    if (action === 'set_qa_disposable') {
      const CANONICAL_SUPER_ADMIN_ID = '9c4e65f5-c0a1-4b3a-8ed2-d01175a73409'
      if (user.id !== CANONICAL_SUPER_ADMIN_ID) {
        throw new Error('Forbidden: Only the canonical Super Administrator can manage QA designations')
      }

      const { isDisposable, notes } = payload || {}
      if (typeof isDisposable !== 'boolean') {
        throw new Error('isDisposable boolean is required')
      }

      const { data: rpcData, error: rpcError } = await supabase.rpc('set_account_qa_disposable', {
        p_tenant_id: targetUserId,
        p_is_disposable: isDisposable,
        p_notes: notes || null,
        p_actor_id: user.id
      })

      if (rpcError) {
        throw new Error(`Failed to update QA designation: ${rpcError.message}`)
      }

      return new Response(JSON.stringify({
        success: true,
        message: isDisposable ? 'Account designated as disposable QA' : 'Disposable QA designation revoked',
        data: rpcData
      }), {
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
