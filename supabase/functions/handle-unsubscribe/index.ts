// Authenticated self-service unsubscribe handler.
// Public recipients keep using the existing tokenized handle-email-unsubscribe or
// comms-email-unsubscribe endpoints; this endpoint never accepts identity authority
// from the request body.
import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function jsonResp(data: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

interface UnsubReq {
  channel: 'email' | 'sms' | 'all'
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })
  if (req.method !== 'POST') {
    return jsonResp({ success: false, error: 'method_not_allowed' }, 405)
  }

  const authorization = req.headers.get('Authorization') ?? ''
  if (!authorization.startsWith('Bearer ')) {
    return jsonResp({ success: false, error: 'authentication_required' }, 401)
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')
  if (!supabaseUrl || !supabaseAnonKey) {
    return jsonResp({ success: false, error: 'unsubscribe_unavailable' }, 503)
  }

  const caller = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data: { user }, error: authError } = await caller.auth.getUser()
  if (authError || !user) {
    return jsonResp({ success: false, error: 'authentication_required' }, 401)
  }

  let rawBody: unknown
  try {
    rawBody = await req.json()
  } catch {
    return jsonResp({ success: false, error: 'invalid_json' }, 400)
  }

  if (!rawBody || typeof rawBody !== 'object' || Array.isArray(rawBody)) {
    return jsonResp({ success: false, error: 'invalid_request' }, 400)
  }
  const body = rawBody as Record<string, unknown>

  // Refuse legacy identity selectors rather than silently treating them as authority.
  // Repo-wide producer inventory found no live caller of this endpoint; public links
  // use the existing tokenized endpoints.
  if (['user_id', 'email', 'phone'].some((key) => Object.prototype.hasOwnProperty.call(body, key))) {
    return jsonResp({ success: false, error: 'identity_selectors_not_allowed' }, 400)
  }

  if (typeof body.channel !== 'string' || !['email', 'sms', 'all'].includes(body.channel)) {
    return jsonResp({ success: false, error: 'invalid_channel' }, 400)
  }
  const channel = body.channel as UnsubReq['channel']

  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseServiceKey) {
    return jsonResp({ success: false, error: 'unsubscribe_unavailable' }, 503)
  }
  // Service-role authority is created only after the caller JWT has been verified.
  const admin = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const update: Record<string, unknown> = {}
  if (channel === 'all') {
    update.unsubscribed_all = true
    update.unsubscribed_at = new Date().toISOString()
    update.email_enabled = false
    update.sms_enabled = false
  } else if (channel === 'email') {
    update.email_enabled = false
  } else {
    update.sms_enabled = false
  }

  // Compliance-critical effect: the preference row must persist and read back with
  // the requested suppression before the endpoint can report an unsubscribe.
  let preferenceResult: {
    data: Record<string, unknown> | null
    error: { code?: string; message?: string } | null
  }
  try {
    preferenceResult = await admin
      .from('communication_preferences')
      .upsert({ user_id: user.id, ...update }, { onConflict: 'user_id' })
      .select('user_id, email_enabled, sms_enabled, unsubscribed_all, unsubscribed_at')
      .single()
  } catch (error) {
    // A transport failure after dispatch cannot prove whether Postgres committed.
    console.error('handle-unsubscribe: preference write outcome unknown', {
      message: error instanceof Error ? error.message : 'unknown transport failure',
      channel,
      user_id: user.id,
    })
    return jsonResp({
      success: false,
      outcome: 'preference_outcome_unknown',
      error: 'preference_write_outcome_unknown',
      preference_updated: 'unknown',
      audit_logged: false,
    }, 500)
  }
  const { data: preferences, error: preferenceError } = preferenceResult

  const preferenceReadbackMatches = Boolean(
    preferences &&
    preferences.user_id === user.id &&
    (channel !== 'email' || preferences.email_enabled === false) &&
    (channel !== 'sms' || preferences.sms_enabled === false) &&
    (channel !== 'all' || (
      preferences.unsubscribed_all === true &&
      preferences.email_enabled === false &&
      preferences.sms_enabled === false &&
      typeof preferences.unsubscribed_at === 'string' &&
      preferences.unsubscribed_at.length > 0
    )),
  )

  if (preferenceError) {
    console.error('handle-unsubscribe: preference write failed', {
      code: preferenceError.code ?? 'write_failed',
      message: preferenceError.message ?? 'preference write failed',
      channel,
      user_id: user.id,
    })
    return jsonResp({
      success: false,
      outcome: 'not_unsubscribed',
      error: 'preference_write_failed',
      preference_updated: false,
      audit_logged: false,
    }, 500)
  }

  if (!preferenceReadbackMatches) {
    // A success response without matching canonical state cannot establish whether
    // the write was lost, transformed, or committed differently.
    console.error('handle-unsubscribe: preference readback mismatch', {
      channel,
      user_id: user.id,
    })
    return jsonResp({
      success: false,
      outcome: 'preference_outcome_unknown',
      error: 'preference_readback_failed',
      preference_updated: 'unknown',
      audit_logged: false,
    }, 500)
  }

  // Secondary effect: the audit record is required for a fully successful response,
  // but a failure here must truthfully preserve that suppression already landed.
  let auditResult: {
    data: Record<string, unknown> | null
    error: { code?: string; message?: string } | null
  }
  try {
    auditResult = await admin.from('communication_log').insert({
      user_id: user.id,
      channel: channel === 'all' ? 'email' : channel,
      message_type: 'unsubscribe',
      status: 'unsubscribed',
      preview: `Unsubscribed from ${channel}`,
    }).select('id').single()
  } catch (error) {
    console.error('handle-unsubscribe: preference updated; audit outcome unknown', {
      message: error instanceof Error ? error.message : 'unknown transport failure',
      channel,
      user_id: user.id,
    })
    return jsonResp({
      success: false,
      outcome: 'unsubscribed_audit_outcome_unknown',
      error: 'audit_log_outcome_unknown',
      preference_updated: true,
      audit_logged: 'unknown',
    }, 500)
  }
  const { data: auditRow, error: auditError } = auditResult

  if (auditError) {
    console.error('handle-unsubscribe: preference updated but audit write failed', {
      code: auditError.code ?? 'audit_write_failed',
      message: auditError.message ?? 'audit write failed',
      channel,
      user_id: user.id,
    })
    return jsonResp({
      success: false,
      outcome: 'unsubscribed_audit_failed',
      error: 'audit_log_write_failed',
      preference_updated: true,
      audit_logged: false,
    }, 500)
  }

  if (!auditRow?.id) {
    console.error('handle-unsubscribe: preference updated; audit readback missing', {
      channel,
      user_id: user.id,
    })
    return jsonResp({
      success: false,
      outcome: 'unsubscribed_audit_outcome_unknown',
      error: 'audit_log_readback_failed',
      preference_updated: true,
      audit_logged: 'unknown',
    }, 500)
  }

  return jsonResp({
    success: true,
    outcome: 'unsubscribed',
    channel,
    preference_updated: true,
    audit_logged: true,
  })
})
