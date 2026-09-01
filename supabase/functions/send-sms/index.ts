// Sends an SMS via Twilio with preference checks and logging.
// Called by the notification dispatcher (send-notification) and triggers.
// Fails closed on Campaign class and durable platform consent, then applies the
// registered Paige Agent AI brand/link/HELP/STOP envelope.
import { createClient } from 'npm:@supabase/supabase-js@2'
// Master Twilio Basic-auth from the ONE home (twilio.ts) — API Key trio
// (TWILIO_API_KEY_SID:TWILIO_API_KEY_SECRET), master TWILIO_AUTH_TOKEN absent in prod.
import { masterBasicAuthHeader } from '../_shared/twilio.ts'
import { formatPaigeAgentAiSms } from '../_shared/paige-agent-ai-sms.ts'
import { normalizePhone } from '../_shared/pre-send-pipeline.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const MAX_BODY_LEN = 1600
const PLATFORM_ACCOUNT_NOTIFICATION_TYPES = new Set(['onboarding', 'account_status', 'service_notification'])

interface SmsRequest {
  user_id: string
  message_type: string // credit_alert | score_milestone | funding_alert | coaching_reminder | verification | onboarding | weekly_summary
  message_body: string
  to_phone?: string
  // Internal: may skip legacy preference checks, but never the Campaign or consent gates.
  skip_preference_check?: boolean
}

const PREF_FLAG_BY_TYPE: Record<string, string> = {
  credit_alert: 'sms_credit_alerts',
  funding_alert: 'sms_funding_alerts',
  score_milestone: 'sms_score_milestones',
  coaching_reminder: 'sms_coaching_reminders',
}

function jsonResp(data: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

async function logSms(
  supabase: ReturnType<typeof createClient>,
  user_id: string,
  message_type: string,
  body: string,
  status: 'sent' | 'failed' | 'unsubscribed' | 'suppressed',
  provider_message_id?: string,
  error_message?: string,
) {
  await supabase.from('communication_log').insert({
    user_id,
    channel: 'sms',
    message_type,
    preview: body.slice(0, 100),
    status,
    provider_message_id: provider_message_id ?? null,
    error_message: error_message ?? null,
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const accountSid = Deno.env.get('TWILIO_ACCOUNT_SID')
  const authHeader = masterBasicAuthHeader() // API Key trio (or legacy fallback); null when unconfigured
  const fromPhone = Deno.env.get('TWILIO_PHONE_NUMBER')

  if (!accountSid || !authHeader || !fromPhone) {
    return jsonResp({ error: 'Twilio not configured' }, 500)
  }

  let body: SmsRequest
  try {
    body = await req.json()
  } catch {
    return jsonResp({ error: 'Invalid JSON' }, 400)
  }

  if (!body.user_id || !body.message_type || !body.message_body) {
    return jsonResp({ error: 'user_id, message_type, message_body required' }, 400)
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey)

  // Load preferences (always — needed to find phone if not provided)
  const { data: prefs } = await supabase
    .from('communication_preferences')
    .select('*')
    .eq('user_id', body.user_id)
    .maybeSingle()

  const toPhone = body.to_phone || prefs?.sms_phone_number
  if (!toPhone) {
    return jsonResp({ error: 'No phone number on file' }, 400)
  }

  // A Campaign registration is a traffic boundary, not a generic Twilio switch.
  // Until another Paige-operated use case is separately registered, unsupported
  // categories (including marketing, coaching, summaries, and verification) stop here.
  if (!PLATFORM_ACCOUNT_NOTIFICATION_TYPES.has(body.message_type)) {
    await logSms(supabase, body.user_id, body.message_type, body.message_body, 'suppressed', undefined, 'campaign_not_registered')
    return jsonResp({ success: false, reason: 'campaign_not_registered' }, 200)
  }

  const normalizedTo = normalizePhone(toPhone)
  const { data: consent, error: consentError } = await supabase
    .from('communications_consents')
    .select('id')
    .eq('user_id', body.user_id)
    .eq('phone', normalizedTo)
    .is('tenant_id', null)
    .is('contact_id', null)
    .not('consent_granted_at', 'is', null)
    .is('revoked_at', null)
    .is('withdrawn_at', null)
    .eq('sms_transactional', true)
    .limit(1)
    .maybeSingle()
  if (consentError || !consent) {
    await logSms(supabase, body.user_id, body.message_type, body.message_body, 'suppressed', undefined, consentError ? 'consent_check_failed' : 'platform_sms_consent_required')
    return jsonResp({ success: false, reason: consentError ? 'consent_check_failed' : 'platform_sms_consent_required' }, 200)
  }

  // Legacy preference checks. The durable consent gate above is never bypassed.
  if (!body.skip_preference_check) {
    if (!prefs) {
      return jsonResp({ success: false, reason: 'no_preferences' }, 200)
    }
    if (prefs.unsubscribed_all) {
      await logSms(supabase, body.user_id, body.message_type, body.message_body, 'unsubscribed')
      return jsonResp({ success: false, reason: 'unsubscribed_all' }, 200)
    }
    if (!prefs.sms_enabled) {
      return jsonResp({ success: false, reason: 'sms_disabled' }, 200)
    }
    if (!prefs.sms_phone_verified) {
      return jsonResp({ success: false, reason: 'phone_not_verified' }, 200)
    }
    const flag = PREF_FLAG_BY_TYPE[body.message_type]
    if (flag && prefs[flag] === false) {
      return jsonResp({ success: false, reason: 'category_disabled' }, 200)
    }
  }

  // Platform-account messages use the exact registered brand/link/HELP/STOP envelope.
  const finalBody = formatPaigeAgentAiSms({
    body: body.message_body,
    url: 'https://paigeagent.ai/auth?mode=login',
  })
  if (finalBody.length > MAX_BODY_LEN) {
    return jsonResp({ success: false, reason: 'body_too_long_max_1600' }, 200)
  }

  // Twilio API
  const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`
  const formattedTo = normalizedTo
  const formattedFrom = fromPhone.startsWith('+') ? fromPhone : `+1${fromPhone.replace(/\D/g, '')}`

  const twilioRes = await fetch(twilioUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': authHeader,
    },
    body: new URLSearchParams({ To: formattedTo, From: formattedFrom, Body: finalBody }),
  })

  const twilioData = await twilioRes.json()

  if (!twilioRes.ok) {
    console.error('Twilio error', twilioData)
    await logSms(supabase, body.user_id, body.message_type, finalBody, 'failed', undefined, twilioData?.message || 'Twilio error')
    return jsonResp({ error: twilioData?.message || 'Failed to send SMS' }, 500)
  }

  await logSms(supabase, body.user_id, body.message_type, finalBody, 'sent', twilioData.sid)

  return jsonResp({ success: true, sid: twilioData.sid })
})
