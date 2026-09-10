// Weekly summary cron — runs every Monday 8am EST.
// Sends per-user transactional weekly summary emails (NOT bulk marketing).
// Each email is triggered by an explicit per-user opt-in stored in
// communication_preferences.email_weekly_summary.
//
// Durable Job Contract adopter #1 (docs/brain/paige-durable-job-contract.md):
// claims due rows atomically via claim_due_weekly_summaries (FOR UPDATE SKIP LOCKED,
// 15-minute lease, one send per user per week, 5 attempts per week intent), stamps
// canonical terminal states, and correlates every terminal/outcome_unknown send to the
// Rail through recordCapabilityRun. A manual re-fire or scheduler retry can no longer
// double-send: completed intents are excluded at claim time.
import { createClient } from 'npm:@supabase/supabase-js@2'
import {
  capabilityOutcomeFor,
  completedForIntent,
  idempotencyKey,
  type DurableJobState,
} from '../_shared/durable-job/mod.ts'
import { recordCapabilityRun } from '../_shared/capability-record.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

/** Mirrors claim_due_weekly_summaries' UTC-Monday intent bucket. */
function weekStartUtc(now: Date): Date {
  const day = now.getUTCDay()
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - ((day + 6) % 7)))
}

interface ClaimedPref {
  user_id: string
  weekly_summary_last_sent_at: string | null
  weekly_summary_attempts: number
  weekly_summary_attempt_week: string | null
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const supabase = createClient(supabaseUrl, serviceKey)

  // Contract step 1 — atomic claim. Rows opted in, not yet sent this week, lease-free,
  // under the attempts ceiling. The RPC stamps outcome='claimed' and increments attempts.
  const { data: claimed, error: claimError } = await supabase
    .rpc('claim_due_weekly_summaries' as any, { _limit: 200 })
  if (claimError) {
    return new Response(JSON.stringify({ error: claimError.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  // Contract step 2 — honest terminal states for exhausted intents, every tick, idempotent.
  await supabase.rpc('mark_exhausted_weekly_summaries' as any)

  const prefs = (claimed ?? []) as ClaimedPref[]
  if (!prefs.length) {
    return new Response(JSON.stringify({ success: true, claimed: 0, dispatched: 0 }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  // Batch tenant resolution for Rail receipts (recordCapabilityRun needs tenant + actor).
  const userIds = prefs.map((p) => p.user_id)
  const { data: memberships } = await supabase
    .from('tenant_members')
    .select('user_id, tenant_id')
    .in('user_id', userIds)
  const tenantByUser = new Map<string, string>()
  for (const m of memberships ?? []) {
    if (!tenantByUser.has(m.user_id)) tenantByUser.set(m.user_id, m.tenant_id)
  }

  const now = new Date()
  const windowStart = weekStartUtc(now)
  const sinceISO = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString()

  let dispatched = 0
  let skippedAlreadySent = 0
  for (const pref of prefs) {
    // Contract: idempotency window enforced worker-side too (defense in depth against a
    // stale claim racing a just-completed send from another tick).
    if (completedForIntent(pref.weekly_summary_last_sent_at, windowStart)) {
      skippedAlreadySent++
      continue
    }

    // Rail receipt per terminal/outcome_unknown transition. Unknown tenant →
    // recordCapabilityRun declines visibly (returns false) rather than inventing scope.
    // Receipt & Rail Contract adopter #1: every receipt carries the deterministic
    // job-attempt correlation id (substrate:user:intent) and a redacted detail payload —
    // no recipient address, no message content (§2.2 redaction rules).
    const record = async (state: DurableJobState, error?: string, sendHttpStatus?: number) => {
      const outcome = capabilityOutcomeFor(state)
      if (!outcome) return
      const intent = pref.weekly_summary_attempt_week ?? windowStart.toISOString().slice(0, 10)
      await recordCapabilityRun(supabase, {
        tenantId: tenantByUser.get(pref.user_id) ?? null,
        actorId: pref.user_id,
        capabilityKey: 'comms_weekly_summary',
        outcome,
        correlation: {
          jobAttemptId: idempotencyKey('weekly-summary', pref.user_id, intent),
        },
        detail: {
          substrate: 'weekly-summary-cron',
          intent,
          attempt: pref.weekly_summary_attempts,
          send_http_status: sendHttpStatus ?? null,
          ...(error ? { error } : {}),
        },
      })
      // Stamp the canonical state + release the lease. Cleared claimed_at lets the next
      // tick reclaim failed intents within the week (attempts already counted at claim).
      await supabase
        .from('communication_preferences')
        .update({
          weekly_summary_last_outcome: state,
          weekly_summary_last_error: error ?? null,
          weekly_summary_claimed_at: null,
          ...(state === 'succeeded' ? { weekly_summary_last_sent_at: new Date().toISOString() } : {}),
        })
        .eq('user_id', pref.user_id)
    }

    try {
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

      const response = await fetch(`${supabaseUrl}/functions/v1/send-notification`, {
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

      // Contract §2.7: success is only claimed from a verified send acceptance — an
      // ambiguous response is outcome_unknown and must reconcile, never silently retry.
      if (response.ok) {
        dispatched++
        await record('succeeded', undefined, response.status)
      } else {
        await record('failed', `send_notification_http_${response.status}`, response.status)
      }
    } catch (err) {
      // The effect may or may not have landed: reconcile before any retry (attempts are
      // already spent for this intent; the lease release makes the state visible).
      console.error('weekly summary dispatch failed', pref.user_id, err)
      await record('outcome_unknown', err instanceof Error ? err.message : 'dispatch_threw')
    }
  }

  return new Response(
    JSON.stringify({ success: true, claimed: prefs.length, dispatched, skippedAlreadySent }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
  )
})
