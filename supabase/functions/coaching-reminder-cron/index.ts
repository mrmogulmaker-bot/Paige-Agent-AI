// Coaching reminder cron — runs hourly.
// Sends email + SMS reminders ~24h before each upcoming coaching appointment.
// Each send is per-user transactional (one recipient per appointment).
import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const supabase = createClient(supabaseUrl, serviceKey)

  const now = new Date()
  const windowStart = new Date(now.getTime() + 23 * 60 * 60 * 1000).toISOString()
  const windowEnd = new Date(now.getTime() + 25 * 60 * 60 * 1000).toISOString()

  // The platform may not have a calendar table yet; this is a best-effort lookup.
  // We try `coaching_appointments` first; if it doesn't exist the function returns 0.
  let appointments: any[] = []
  try {
    const { data, error } = await supabase
      .from('coaching_appointments' as any)
      .select('id, user_id, scheduled_at, topic, join_url')
      .gte('scheduled_at', windowStart)
      .lt('scheduled_at', windowEnd)
      .eq('reminder_sent', false)

    if (!error && Array.isArray(data)) appointments = data
  } catch {
    // table may not exist yet — return cleanly
    return new Response(JSON.stringify({ success: true, dispatched: 0, note: 'no coaching_appointments table' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  let dispatched = 0
  for (const appt of appointments) {
    try {
      const apptTime = new Date(appt.scheduled_at).toLocaleString('en-US', {
        weekday: 'long', month: 'long', day: 'numeric',
        hour: 'numeric', minute: '2-digit', hour12: true, timeZoneName: 'short',
      })

      const smsBody = `PaigeAgent Reminder: Your strategy session is at ${apptTime}. Reply STOP to unsubscribe.`

      await fetch(`${supabaseUrl}/functions/v1/send-notification`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${serviceKey}`,
        },
        body: JSON.stringify({
          user_id: appt.user_id,
          message_type: 'coaching_reminder',
          email_data: {
            sessionTime: apptTime,
            topic: appt.topic ?? 'Strategy Session',
            joinUrl: appt.join_url ?? 'https://paigeagent.ai/app',
          },
          sms_body: smsBody,
        }),
      })

      // Mark as sent (best effort)
      await supabase.from('coaching_appointments' as any).update({ reminder_sent: true }).eq('id', appt.id)
      dispatched++
    } catch (err) {
      console.error('coaching reminder dispatch failed', appt.id, err)
    }
  }

  return new Response(JSON.stringify({ success: true, dispatched }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
})
