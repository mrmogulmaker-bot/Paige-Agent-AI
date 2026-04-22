// Twilio inbound webhook — handles STOP / START / HELP keywords.
// Webhook URL to set in Twilio: https://bfmyebsjyuoecmjskqhs.supabase.co/functions/v1/twilio-inbound-webhook
// (config.toml sets verify_jwt = false for this function; Twilio cannot send Supabase JWTs)
import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
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
  const params = new URLSearchParams(formText)
  const fromPhone = params.get('From') ?? ''
  const bodyRaw = (params.get('Body') ?? '').trim().toUpperCase()

  console.log('Twilio inbound', { fromPhone, body: bodyRaw })

  if (!fromPhone) return twiml()

  // Find user by phone number
  const { data: prefs } = await supabase
    .from('communication_preferences')
    .select('user_id')
    .eq('sms_phone_number', fromPhone)
    .maybeSingle()

  if (STOP_KEYWORDS.includes(bodyRaw)) {
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

  if (START_KEYWORDS.includes(bodyRaw)) {
    if (prefs?.user_id) {
      await supabase
        .from('communication_preferences')
        .update({ sms_enabled: true })
        .eq('user_id', prefs.user_id)
    }
    return twiml('You are re-subscribed to PaigeAgent SMS alerts. Reply STOP at any time to opt out.')
  }

  if (bodyRaw === 'HELP' || bodyRaw === 'INFO') {
    return twiml('PaigeAgent: AI funding advisor. Reply STOP to unsubscribe. Support: support@paigeagent.ai')
  }

  // Any other inbound — just acknowledge silently
  return twiml()
})
