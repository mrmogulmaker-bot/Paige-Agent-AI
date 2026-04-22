// Weekly summary cron — runs every Monday 8am EST.
// Sends per-user transactional weekly summary emails (NOT bulk marketing).
// Each email is triggered by an explicit per-user opt-in stored in
// communication_preferences.email_weekly_summary.
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

  // Pull all users opted into weekly summary
  const { data: prefs, error } = await supabase
    .from('communication_preferences')
    .select('user_id, email_enabled, email_weekly_summary, unsubscribed_all')
    .eq('email_enabled', true)
    .eq('email_weekly_summary', true)
    .eq('unsubscribed_all', false)

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  let dispatched = 0
  for (const pref of prefs ?? []) {
    try {
      // Pull lightweight per-user stats for personalization
      const sinceISO = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()

      const [{ count: alertCount }, { data: scoreRows }] = await Promise.all([
        supabase
          .from('credit_alerts')
          .select('id', { count: 'exact', head: true })
          .eq('client_id', pref.user_id)
          .gte('created_at', sinceISO),
        supabase
          .from('build_scores')
          .select('build_score, updated_at')
          .eq('user_id', pref.user_id)
          .order('updated_at', { ascending: false })
          .limit(2),
      ])

      const currentScore = scoreRows?.[0]?.build_score ?? null
      const previousScore = scoreRows?.[1]?.build_score ?? null
      const scoreChange = currentScore != null && previousScore != null
        ? currentScore - previousScore
        : 0

      await fetch(`${supabaseUrl}/functions/v1/send-notification`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${serviceKey}`,
        },
        body: JSON.stringify({
          user_id: pref.user_id,
          message_type: 'weekly_summary',
          channels: ['email'],
          email_data: {
            scoreChange,
            currentScore,
            alertCount: alertCount ?? 0,
            recommendation: 'Open PaigeAgent to review this week\'s funding opportunities.',
          },
        }),
      })
      dispatched++
    } catch (err) {
      console.error('weekly summary dispatch failed', pref.user_id, err)
    }
  }

  return new Response(JSON.stringify({ success: true, dispatched }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
})
