// Validates a 6-digit SMS code. On success: marks the user's phone verified.
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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return jsonResp({ error: 'Missing authorization' }, 401)
  const supabaseAuth = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: authHeader } },
  })
  const { data: userData, error: userErr } = await supabaseAuth.auth.getUser()
  if (userErr || !userData.user) return jsonResp({ error: 'Unauthorized' }, 401)
  const userId = userData.user.id

  let body: { code?: string }
  try {
    body = await req.json()
  } catch {
    return jsonResp({ error: 'Invalid JSON' }, 400)
  }

  if (!body.code || !/^\d{6}$/.test(body.code)) {
    return jsonResp({ error: 'Invalid code format' }, 400)
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey)

  // Find the most recent unexpired unverified record for this user
  const { data: record, error: lookupErr } = await supabase
    .from('sms_verifications')
    .select('*')
    .eq('user_id', userId)
    .is('verified_at', null)
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (lookupErr || !record) {
    return jsonResp({ error: 'No active verification code. Request a new one.' }, 404)
  }

  if (record.attempts >= 3) {
    return jsonResp({ error: 'Too many failed attempts. Request a new code.' }, 429)
  }

  if (record.verification_code !== body.code) {
    await supabase
      .from('sms_verifications')
      .update({ attempts: record.attempts + 1 })
      .eq('id', record.id)
    return jsonResp({ error: 'Incorrect code', attempts_remaining: 3 - (record.attempts + 1) }, 400)
  }

  // Success — mark verified and update prefs
  await supabase
    .from('sms_verifications')
    .update({ verified_at: new Date().toISOString() })
    .eq('id', record.id)

  await supabase
    .from('communication_preferences')
    .upsert(
      {
        user_id: userId,
        sms_phone_number: record.phone_number,
        sms_phone_verified: true,
        sms_enabled: true,
      },
      { onConflict: 'user_id' },
    )

  return jsonResp({ success: true })
})
