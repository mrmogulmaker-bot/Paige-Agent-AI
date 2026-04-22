// Sends an SMS via Twilio with preference checks and logging.
// Called by the notification dispatcher (send-notification) and triggers.
// Always appends "Reply STOP to unsubscribe" for A2P 10DLC compliance.
import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const STOP_SUFFIX = ' Reply STOP to unsubscribe.'
const MAX_BODY_LEN = 160

interface SmsRequest {
  user_id: string
  message_type: string // credit_alert | score_milestone | funding_alert | coaching_reminder | verification | onboarding | weekly_summary
  message_body: string
  to_phone?: string
  // Internal: skip preference checks (used for verification SMS, which must always send)
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
  const authToken = Deno.env.get('TWILIO_AUTH_TOKEN')
  const fromPhone = Deno.env.get('TWILIO_PHONE_NUMBER')

  if (!accountSid || !authToken || !fromPhone) {
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

  // Preference checks (skip only for verification SMS — verifying the phone number itself)
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

  // Append STOP suffix unless already present; trim if too long
  let finalBody = body.message_body.trim()
  if (!finalBody.toUpperCase().includes('REPLY STOP')) {
    const room = MAX_BODY_LEN - STOP_SUFFIX.length
    if (finalBody.length > room) finalBody = finalBody.slice(0, room - 1).trimEnd() + '…'
    finalBody = finalBody + STOP_SUFFIX
  }

  // Twilio API
  const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`
  const formattedTo = toPhone.startsWith('+') ? toPhone : `+1${toPhone.replace(/\D/g, '')}`
  const formattedFrom = fromPhone.startsWith('+') ? fromPhone : `+1${fromPhone.replace(/\D/g, '')}`

  const twilioRes = await fetch(twilioUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': `Basic ${btoa(`${accountSid}:${authToken}`)}`,
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
