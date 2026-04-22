// refresh-fundability-scores-biannual
// ------------------------------------------------------------
// Cron-triggered dispatcher (Jan 1 + Jul 1, 16:00 UTC).
// Finds users whose fundability scores are stale (>5 months or never
// calculated), invokes recalculate-fundability-scores per user, and
// fires a score-milestone email when any score crosses a threshold.
// ------------------------------------------------------------

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const MILESTONE_THRESHOLDS = [580, 620, 680, 720];

function crossedMilestone(prev: number | null, next: number | null): number | null {
  if (prev == null || next == null) return null;
  for (const t of MILESTONE_THRESHOLDS) {
    if (prev < t && next >= t) return t;
  }
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const startedAt = new Date();
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  let processed = 0;
  let updated = 0;
  let milestonesTriggered = 0;
  const errors: string[] = [];

  try {
    // Find stale users
    const fiveMonthsAgo = new Date();
    fiveMonthsAgo.setMonth(fiveMonthsAgo.getMonth() - 5);

    const { data: staleUsers, error: queryErr } = await supabase
      .from("profiles")
      .select("user_id, last_fundability_calculated, last_fundability_snapshot, full_name")
      .or(
        `last_fundability_calculated.is.null,last_fundability_calculated.lt.${fiveMonthsAgo.toISOString()}`,
      );

    if (queryErr) throw queryErr;

    for (const u of staleUsers ?? []) {
      processed++;
      try {
        const prevSnapshot = (u.last_fundability_snapshot ?? null) as
          | { personal?: number | null; small_business?: number | null; commercial?: number | null }
          | null;

        // Invoke recalculate function with service role auth
        const recalcRes = await fetch(
          `${SUPABASE_URL}/functions/v1/recalculate-fundability-scores`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
            },
            body: JSON.stringify({ user_id: u.user_id }),
          },
        );

        if (!recalcRes.ok) {
          errors.push(`user ${u.user_id}: recalc HTTP ${recalcRes.status}`);
          continue;
        }
        const recalcJson = await recalcRes.json();
        const newScores = recalcJson?.scores as
          | { personal: number | null; small_business: number | null; commercial: number | null }
          | undefined;
        if (!newScores) continue;
        updated++;

        // Detect milestone crossings + score improvements >=5
        const milestoneEvents: Array<{
          score: string;
          prev: number | null;
          next: number | null;
          threshold: number;
        }> = [];
        (["personal", "small_business", "commercial"] as const).forEach((key) => {
          const prev = prevSnapshot?.[key] ?? null;
          const next = newScores[key];
          const t = crossedMilestone(prev, next);
          if (t != null) milestoneEvents.push({ score: key, prev, next, threshold: t });
        });

        if (milestoneEvents.length > 0) {
          milestonesTriggered += milestoneEvents.length;

          // Best-effort milestone email
          try {
            await fetch(`${SUPABASE_URL}/functions/v1/send-transactional-email`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
              },
              body: JSON.stringify({
                user_id: u.user_id,
                template: "score-milestone",
                purpose: "transactional",
                idempotency_key: `score-milestone-${u.user_id}-${startedAt.toISOString().slice(0, 10)}`,
                data: {
                  firstName: (u.full_name ?? "").split(" ")[0] || "there",
                  milestones: milestoneEvents,
                  scores: newScores,
                },
              }),
            });
          } catch (emailErr) {
            errors.push(`user ${u.user_id}: email failed - ${(emailErr as Error).message}`);
          }
        }
      } catch (perUserErr) {
        errors.push(`user ${u.user_id}: ${(perUserErr as Error).message}`);
      }
    }

    // Audit log summary
    await supabase.from("audit_logs").insert({
      entity: "fundability_scores",
      action: "biannual_refresh",
      data: {
        started_at: startedAt.toISOString(),
        finished_at: new Date().toISOString(),
        users_processed: processed,
        scores_updated: updated,
        milestones_triggered: milestonesTriggered,
        errors_sample: errors.slice(0, 10),
        error_count: errors.length,
      },
    });

    return new Response(
      JSON.stringify({
        success: true,
        users_processed: processed,
        scores_updated: updated,
        milestones_triggered: milestonesTriggered,
        error_count: errors.length,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("[refresh-fundability-scores-biannual] fatal", e);
    return new Response(
      JSON.stringify({ error: (e as Error).message, processed, updated }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
