// Universal unsubscribe handler — used by app, marketing footers, and admin tools.
// For email-only unsubscribe via tokenized link, see handle-email-unsubscribe.
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
  user_id?: string
  email?: string
  phone?: string
  channel: 'email' | 'sms' | 'all'
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const supabase = createClient(supabaseUrl, supabaseServiceKey)

  let body: UnsubReq
  try {
    body = await req.json()
  } catch {
    return jsonResp({ error: 'Invalid JSON' }, 400)
  }

  if (!body.channel || !['email', 'sms', 'all'].includes(body.channel)) {
    return jsonResp({ error: 'channel must be email, sms, or all' }, 400)
  }

  // Resolve user_id
  let userId = body.user_id
  if (!userId && body.email) {
    const { data: u } = await supabase.auth.admin.listUsers()
    userId = u.users.find((x) => x.email?.toLowerCase() === body.email!.toLowerCase())?.id
  }
  if (!userId && body.phone) {
    const { data: prefs } = await supabase
      .from('communication_preferences')
      .select('user_id')
      .eq('sms_phone_number', body.phone)
      .maybeSingle()
    userId = prefs?.user_id
  }

  if (!userId) return jsonResp({ error: 'User not found' }, 404)

  const update: Record<string, unknown> = {}
  if (body.channel === 'all') {
    update.unsubscribed_all = true
    update.unsubscribed_at = new Date().toISOString()
    update.email_enabled = false
    update.sms_enabled = false
  } else if (body.channel === 'email') {
    update.email_enabled = false
  } else if (body.channel === 'sms') {
    update.sms_enabled = false
  }

  await supabase
    .from('communication_preferences')
    .upsert({ user_id: userId, ...update }, { onConflict: 'user_id' })

  await supabase.from('communication_log').insert({
    user_id: userId,
    channel: body.channel === 'all' ? 'email' : body.channel,
    message_type: 'unsubscribe',
    status: 'unsubscribed',
    preview: `Unsubscribed from ${body.channel}`,
  })

  return jsonResp({ success: true })
})
