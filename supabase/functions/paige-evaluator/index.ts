// paige-evaluator — the evaluation loop's evidence eye (runway ④, Master §3
// "Controlled improvement, never silent self-modification").
//
// A daily beat that scans the week's REAL per-tenant outcome evidence —
// per-specialist invocation health from paige_subagent_invocations — and FILES
// IMPROVEMENT PROPOSALS where a repeating failure pattern deserves an owner's
// decision: a specialist failing repeatedly with the same error signature.
//
// HARD RULES (doctrine):
//   - It PROPOSES. Nothing applies, publishes, or mutates a skill, prompt, route,
//     or policy. The decision is the owner's (improvement_list / improvement_decide
//     in chat); the apply lane is per-kind follow-up work named in the proposal.
//   - Evidence is ENVELOPE-ONLY: counts, error signatures, rates. No message
//     content, no transcripts, no tenant data on the proposal.
//   - PER-TENANT only: a tenant's failures propose that tenant's fixes. The
//     platform-aggregate skill-outcome lane (paige_skills counters) is deliberately
//     NOT wired here — cross-tenant learning is a separately governed lane
//     (anonymized/aggregate evidence, owner-ruled) and is not faked today (§13).
//   - Idempotent: one OPEN proposal per (tenant, target, signature); older
//     duplicates are superseded, never duplicated.
//
// Auth: service-role bearer or Vault cron token. Fails closed.

import { createClient } from "npm:@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-token",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const MIN_ATTEMPTS = 5;     // below this a pattern is noise, not evidence
const FAILURE_RATE = 0.5;   // the signature's share of ALL attempts for that specialist

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false, autoRefreshToken: false } });
  const bearer = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  let authorized = bearer.length > 0 && bearer === SERVICE_ROLE;
  if (!authorized) {
    const cronToken = req.headers.get("x-cron-token") ?? "";
    if (cronToken) {
      const { data: cronOk } = await admin.rpc("verify_cron_token", { _token: cronToken });
      authorized = cronOk === true;
    }
  }
  if (!authorized) return json({ error: "unauthorized" }, 401);

  // 1) Per-tenant specialist health, clustered by error signature (an operational
  //    signature — first 80 chars of the recorded error — never message content).
  const { data: health, error: healthErr } = await admin.rpc("evaluator_invocation_health", { p_days: 7 });
  if (healthErr) return json({ error: "health_scan_failed", detail: healthErr.message }, 500);
  const rows = (health ?? []) as Array<{
    tenant_id: string; slug: string; signature: string | null; attempts: number; failures: number;
  }>;

  let filed = 0;
  for (const r of rows) {
    if (r.attempts < MIN_ATTEMPTS) continue;
    const rate = r.failures / r.attempts;
    if (rate < FAILURE_RATE) continue;
    const { error } = await admin.from("paige_improvement_proposals").insert({
      tenant_id: r.tenant_id,
      kind: "subagent",
      target_ref: r.slug,
      title: `${r.slug} failed ${r.failures} of ${r.attempts} calls this week with a repeating error`,
      proposed_change: `Review ${r.slug}'s input contract and prompt against the repeating failure signature; propose a fix. Evidence signature: ${String(r.signature ?? "").slice(0, 120)}`,
      evidence: {
        attempts: r.attempts,
        failures: r.failures,
        failure_rate: Number(rate.toFixed(2)),
        signature: r.signature,
        source: "invocation-health-7d",
      },
      proposed_by: "evaluator",
    });
    if (error) console.error("[paige-evaluator] proposal insert failed:", error.message);
    else filed++;
  }

  // 2) Idempotence: keep only the NEWEST open proposal per (tenant, target, signature).
  const { data: open } = await admin.from("paige_improvement_proposals")
    .select("id, tenant_id, target_ref, evidence->>signature as sig, created_at")
    .eq("status", "proposed")
    .eq("proposed_by", "evaluator");
  const typed = (open ?? []) as Array<{ id: string; tenant_id: string; target_ref: string; sig: string | null; created_at: string }>;
  typed.sort((a, b) => (a.created_at < b.created_at ? 1 : -1)); // newest first
  const seen = new Set<string>();
  const stale: string[] = [];
  for (const p of typed) {
    const key = `${p.tenant_id}|${p.target_ref}|${p.sig ?? ""}`;
    if (seen.has(key)) stale.push(p.id);
    else seen.add(key);
  }
  if (stale.length) {
    await admin.from("paige_improvement_proposals").update({ status: "superseded" }).in("id", stale);
  }

  return json({ ok: true, specialists_scanned: rows.length, proposals_filed: filed, duplicates_superseded: stale.length }, 200);
});
