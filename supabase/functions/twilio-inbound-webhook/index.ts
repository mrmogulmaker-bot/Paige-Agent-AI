// Twilio inbound webhook — handles STOP / START / HELP keywords.
// Webhook URL to set in Twilio: https://bfmyebsjyuoecmjskqhs.supabase.co/functions/v1/twilio-inbound-webhook
// (config.toml sets verify_jwt = false for this function; Twilio cannot send Supabase JWTs)
import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-twilio-signature',
}

async function verifyTwilio(req: Request, rawBody: string): Promise<boolean> {
  const token = Deno.env.get('TWILIO_AUTH_TOKEN')
  if (!token) {
    console.error('[twilio-inbound-webhook] TWILIO_AUTH_TOKEN missing — rejecting')
    return false
  }
  const sig = req.headers.get('x-twilio-signature')
  if (!sig) return false
  const url = req.url
  const params = new URLSearchParams(rawBody)
  const sorted = [...params.entries()].sort(([a], [b]) => a.localeCompare(b))
  const concatenated = url + sorted.map(([k, v]) => k + v).join('')
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(token), { name: 'HMAC', hash: 'SHA-1' }, false, ['sign'],
  )
  const buf = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(concatenated))
  const computed = btoa(String.fromCharCode(...new Uint8Array(buf)))
  return computed === sig
}

const STOP_KEYWORDS = ['STOP', 'STOPALL', 'UNSUBSCRIBE', 'CANCEL', 'END', 'QUIT']
const START_KEYWORDS = ['START', 'YES', 'UNSTOP']

function twiml(message?: string): Response {
  const xml = message
    ? `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${message}</Message></Response>`
    : `<?xml version="1.0" encoding="UTF-8"?><Response/>`
  return new Response(xml, {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'text/xml' },
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })

  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const supabase = createClient(supabaseUrl, supabaseServiceKey)

  // Twilio sends application/x-www-form-urlencoded
  const formText = await req.text()
  const validSig = await verifyTwilio(req, formText)
  if (!validSig) {
    return new Response('invalid_signature', { status: 403, headers: corsHeaders })
  }
  const params = new URLSearchParams(formText)
  const fromPhone = params.get('From') ?? ''
  const bodyRaw = (params.get('Body') ?? '').trim().toUpperCase()
  const optOutType = (params.get('OptOutType') ?? '').trim().toUpperCase()
  const keyword = optOutType || bodyRaw

  console.log('Twilio inbound', { fromPhone, body: bodyRaw })

  if (!fromPhone) return twiml()

  // Find user by phone number
  const { data: prefs } = await supabase
    .from('communication_preferences')
    .select('user_id')
    .eq('sms_phone_number', fromPhone)
    .maybeSingle()

  if (optOutType === 'STOP' || STOP_KEYWORDS.includes(keyword)) {
    await supabase
      .from('communications_consents')
      .update({ revoked_at: new Date().toISOString(), withdrawn_reason: 'sms_stop_keyword' })
      .eq('phone', fromPhone)
      .is('tenant_id', null)
      .is('contact_id', null)
      .not('consent_granted_at', 'is', null)
      .is('revoked_at', null)
    if (prefs?.user_id) {
      await supabase
        .from('communication_preferences')
        .update({ sms_enabled: false })
        .eq('user_id', prefs.user_id)
      await supabase.from('communication_log').insert({
        user_id: prefs.user_id,
        channel: 'sms',
        message_type: 'unsubscribe',
        preview: `Inbound STOP from ${fromPhone}`,
        status: 'unsubscribed',
      })
    }
    // Twilio auto-handles STOP confirmation; return empty TwiML
    return twiml()
  }

  if (optOutType === 'START' || START_KEYWORDS.includes(keyword)) {
    if (prefs?.user_id) {
      await supabase
        .from('communication_preferences')
        .update({ sms_enabled: true })
        .eq('user_id', prefs.user_id)
    }
    const { data: active } = await supabase
      .from('communications_consents')
      .select('id')
      .eq('phone', fromPhone)
      .is('tenant_id', null)
      .is('contact_id', null)
      .not('consent_granted_at', 'is', null)
      .is('revoked_at', null)
      .limit(1)
      .maybeSingle()
    let restored = !!active
    if (!restored) {
      const { data: prior } = await supabase
        .from('communications_consents')
        .select('user_id,email')
        .eq('phone', fromPhone)
        .is('tenant_id', null)
        .is('contact_id', null)
        .not('consent_granted_at', 'is', null)
        .order('consent_granted_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (prior?.user_id) {
        const { error } = await supabase.from('communications_consents').insert({
          user_id: prior.user_id,
          email: prior.email,
          phone: fromPhone,
          sms_transactional: true,
          sms_marketing: false,
          source: 'sms_start_keyword',
          source_url: 'https://paigeagent.ai/sms-terms#start',
          disclosure_version: 'paige-platform-sms-keyword-start-v1-2026-08-31',
          consent_granted_at: new Date().toISOString(),
          user_agent: 'Twilio inbound START/UNSTOP keyword',
        })
        restored = !error
      }
    }
    if (optOutType) return twiml()
    return restored
      ? twiml('Paige Agent AI: You are subscribed to recurring account and service text messages. Message frequency varies. Reply HELP for help or STOP to opt out.')
      : twiml('Paige Agent AI: We could not restore text messages for this number. Sign in at https://paigeagent.ai/auth?mode=login or email support@paigeagent.ai for help.')
  }

  if (optOutType === 'HELP' || keyword === 'HELP' || keyword === 'INFO') {
    return optOutType
      ? twiml()
      : twiml('Paige Agent AI: For help, email support@paigeagent.ai. Reply STOP to opt out.')
  }

  // Any other inbound — just acknowledge silently
  return twiml()
})
