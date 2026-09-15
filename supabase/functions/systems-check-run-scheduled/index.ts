// systems-check-run-scheduled — the SCHEDULED flavor of the Systems Check runner (task #80, L2).
//
// Cron wakes this (see 20260816150000_systems_check_scheduled_cron.sql). It runs the full enabled
// catalog for a bounded batch of tenants and files remediation actions DELTA-ONLY (actionFiling:'delta')
// — i.e. only for a fail that is NEW or newly-degraded vs the tenant's PREVIOUS run — so a chronic,
// already-surfaced failure does not re-spam the action bus every tick.
//
// AUTH — verify_jwt = FALSE (Twilio-style: the cron poster presents no Supabase JWT), declared in
// config.toml. In-function it FAILS CLOSED to an internal-caller gate: a service-role bearer OR a valid
// x-cron-token (verify_cron_token), mirroring comms-scheduled-drain / paige-action-worker. A trusted
// internal caller (already past that gate) MAY target a single tenant via body.tenant_id — that is NOT a
// §588 body-trust leak because the caller is service/cron, not a public JWT.
//
// §18: imports the ONE core + the runner barrel; writes no rows itself (the core is the SOLE writer, §37).

import { runSystemsCheck, SOLE_RUN_DRAFT_BUDGET_MS } from "../_shared/systems-check-runner.ts";
import "../_shared/systems-check-runners/index.ts"; // side-effect: registers the 10 runner modules (§18)
import { adminClient, corsHeaders, isAuthorizedInternalCaller, json } from "../_shared/systems-check-http.ts";

// Per-tick batch cap. Each failing check runs a forge() draft in the core, so a large batch is expensive
// AND risks the edge wall-clock limit — keep it small; cron cadence covers the fleet over time. See the
// §13 caveat in the manifest re: least-recently-scanned ordering as the scale follow-up.
const DEFAULT_BATCH = 15;
const MAX_BATCH = 100;

// ── Invocation budget ────────────────────────────────────────────────────────────────────────────
// The batch tick has been killed mid-fleet twice on production — 2026-08-11 (6 tenants never started)
// and 2026-08-12 (8 never started) — both times at tenant 3, both times around the ~180s edge
// invocation ceiling. That ceiling is EMPIRICAL, derived from 5 kill events on prod: the longest run
// observed still alive is 174.4s, and the shortest that was killed is 180.4s. Nothing documents it.
//
// The batch cap never engaged, because the cost is not the tenant count. Measured on prod:
//   • a tenant with nothing to draft costs ~0.44s (mean of the 14 runs in the 2026-09-05 09:00 tick,
//     whose whole fleet sweep took 7.3s);
//   • ONE remediation draft costs ~27s typical / 31s p90 / 33.2s max, over 42 measured calls.
// So drafting is the entire budget, and the only lever worth pulling.
//
// Three bounds, each doing a different job:
//   TENANT_DRAFT_BUDGET_MS  one tenant cannot monopolise the invocation. At ~27s a draft this permits
//                           about two, which is what the largest tick that ever COMPLETED did per
//                           tenant (2026-09-04: 14 tenants, 4 drafts, 117.4s).
//   SWEEP_DRAFT_BUDGET_MS   a fleet-wide pool, so drafting is capped ACROSS tenants rather than only
//                           within one. This is what the two kills actually breached: 08-11 spent
//                           ~181s on 6 drafts. Capping the pool rather than the tenant count is why
//                           every tenant still gets SCANNED on a heavy tick — only the drafting stops.
//   SWEEP_ELAPSED_BUDGET_MS a backstop before starting each tenant, for the cases drafting does not
//                           explain — chiefly the operator-fired sweep, which passes limit=100.
//
// Worst case, stated so it can be checked rather than trusted — AND stated honestly, because the
// peer gate proved the first version of this comment was not true:
//   105s (elapsed backstop) + ~1s (one tenant's fixed cost) + 30s (its draft budget) + T_forge,
//   where T_forge is however long ONE forge can take once it has started, since a draft may begin
//   just under budget.
//
// T_forge HAS NO CEILING TODAY. `forge()` routes to the open-flexible cell, whose featherless leg
// is the only bounded one (AbortController at 20s, model-router.ts:155-156). On ANY featherless
// failure — the 20s abort included — the text fallback calls Claude, and that path reaches
// `fetch(ANTHROPIC_URL, { signal: opts.signal })` with `opts.signal` undefined: chatCompletionCompat
// never supplies one. So a single forge is up to 20s PLUS an untimed call. 33.2s is the longest
// ever OBSERVED over 42 samples; it is not a bound, and these three constants cannot make it one.
//
// Concretely: a tenant admitted at 104.9s whose first check aborts featherless at 20s and then
// spends 60s in Claude reaches ~186s and is killed, with every bound below behaving as designed.
// That is rarer than the unbounded-fleet failure this replaces — the two measured kills spent
// ~181s across SIX drafts, which these constants would now prevent — so this is a real improvement
// and not a claim of safety. The arithmetic only becomes a guarantee once the Claude leg carries a
// deadline; that is its own slice, and it is the prerequisite for calling this bounded.
// A healthy tick is 7.3s and is never truncated by any of the three.
const TENANT_DRAFT_BUDGET_MS = 30_000;
const SWEEP_DRAFT_BUDGET_MS = 120_000;
const SWEEP_ELAPSED_BUDGET_MS = 105_000;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });

  const admin = adminClient();
  if (!(await isAuthorizedInternalCaller(req, admin))) return json(401, { error: "unauthorized" });

  let body: { tenant_id?: string; limit?: number } = {};
  body = (await req.json().catch(() => ({}))) as { tenant_id?: string; limit?: number };

  // Single-tenant scheduled run — a trusted internal caller (service/cron) may target one tenant.
  if (body.tenant_id) {
    try {
      const summary = await runSystemsCheck({
        admin,
        tenantId: body.tenant_id,
        scanFlavor: "scheduled",
        actionFiling: "delta",
        triggeredBy: { source: "scheduled", mode: "single" },
        // This branch has the invocation to ITSELF, so it gets the whole pool rather than the
        // per-tenant share a batch member receives. It is bounded for the same reason the batch is:
        // 10 checks that all draft would run far past the ceiling, and nothing else here stops them.
        // Latent rather than live — no producer posts {tenant_id} today — but it is the one
        // remaining service-role-reachable way to kill this invocation, so it is closed with the
        // mechanism that just landed rather than left as the next session's surprise.
        draftBudgetMs: SOLE_RUN_DRAFT_BUDGET_MS,
      });
      return json(200, { ok: true, mode: "single", tenants_scanned: 1, runs: [summary] });
    } catch (e) {
      console.error("[systems-check-run-scheduled] single scan failed:", (e as Error)?.message);
      return json(500, { error: "scan_failed", detail: (e as Error)?.message ?? "unknown" });
    }
  }

  // Batch mode (the cron tick): scan a bounded set of tenants, delta-only.
  const limit = Math.max(1, Math.min(Number(body.limit) || DEFAULT_BATCH, MAX_BATCH));
  const { data: tenants, error: tErr } = await admin
    .from("tenants")
    .select("id")
    .order("created_at", { ascending: true })
    .limit(limit);
  if (tErr) return json(500, { error: "tenant_enumeration_failed", detail: tErr.message });

  const rows = (tenants ?? []) as Array<{ id: string }>;
  const runs: Array<Record<string, unknown>> = [];
  const startedAt = Date.now();
  let scanned = 0;
  let failed = 0;
  let draftMsRemaining = SWEEP_DRAFT_BUDGET_MS;
  let draftsDeferred = 0;
  const deferredTenantIds: string[] = [];
  for (const t of rows) {
    // Stop STARTING tenants once the invocation is close enough to the ceiling that the next one
    // could cross it. Deferring here is a reported outcome; being killed here is not, and until now
    // that is what happened — the fleet simply went quiet and no row recorded why.
    if (Date.now() - startedAt >= SWEEP_ELAPSED_BUDGET_MS) {
      deferredTenantIds.push(t.id);
      continue;
    }
    const tenantStartedAt = Date.now();
    try {
      const s = await runSystemsCheck({
        admin,
        tenantId: t.id,
        scanFlavor: "scheduled",
        actionFiling: "delta",
        triggeredBy: { source: "scheduled", mode: "batch" },
        // Whichever is smaller: this tenant's own cap, or whatever is left of the fleet pool. Once
        // the pool is empty every remaining tenant is still SCANNED and still FILES its remediation
        // actions — only the drafting stops. That is the whole point of budgeting time rather than
        // truncating the tenant list.
        draftBudgetMs: Math.max(0, Math.min(TENANT_DRAFT_BUDGET_MS, draftMsRemaining)),
      });
      draftMsRemaining -= s.draft_ms_spent;
      draftsDeferred += s.drafts_deferred;
      runs.push({
        tenant_id: t.id,
        run_id: s.run_id,
        fail_count: s.fail_count,
        actions_filed: s.actions_filed,
        drafts_attempted: s.drafts_attempted,
        drafts_deferred: s.drafts_deferred,
        draft_ms_spent: s.draft_ms_spent,
      });
      scanned++;
    } catch (e) {
      // Fail-loud per tenant (§13/§32) — one tenant's failure never aborts the batch.
      //
      // Charge the pool this tenant's whole elapsed time. The runner throws without returning a
      // summary, so its actual forge spend is unknowable here; charging nothing would let a tenant
      // burn 60s of drafting, throw, and hand the next tenant a full grant — the pool would stop
      // meaning what its comment says. Over-charging (this includes non-draft time) is the safe
      // direction: it can only end drafting earlier, never later.
      draftMsRemaining -= Date.now() - tenantStartedAt;
      console.error(`[systems-check-run-scheduled] scan failed for tenant ${t.id}:`, (e as Error)?.message);
      runs.push({ tenant_id: t.id, error: (e as Error)?.message ?? "scan_failed" });
      failed++;
    }
  }

  // §13: the response body is the honest record, but BOTH producers are pg_net fire-and-forget and
  // neither reads it, so anything that only lives here is unobservable. Log the two truncations
  // loudly as well — the edge log is the one place a human can see them today. Making this durable
  // and queryable is the scheduled-observability task, deliberately not widened into here.
  if (deferredTenantIds.length > 0) {
    console.warn(
      `[systems-check-run-scheduled] elapsed budget reached after ${Date.now() - startedAt}ms; ` +
      `${deferredTenantIds.length} tenant(s) not scanned this tick: ${deferredTenantIds.join(", ")}`,
    );
  }
  if (draftsDeferred > 0) {
    // Says "a budget", not "the fleet budget": a deferral fires when EITHER the tenant's own 30s cap
    // or the shared pool is spent, and the first is much commoner. The earlier wording claimed the
    // fleet pool was exhausted while up to 66s of it could still be unspent.
    //
    // And it no longer claims the actions were filed. That is true for a fail deferred the first
    // time, and FALSE on a retry tick: prevStatus is already 'fail' there, so remediationNeeded is
    // false and nothing is filed — the action was filed on the earlier tick. Reporting a count of
    // this tick's deferrals next to a claim about this tick's filings was exactly wrong for the
    // case this change introduces.
    console.warn(
      `[systems-check-run-scheduled] a draft budget was reached; ${draftsDeferred} remediation ` +
      `draft(s) deferred across ${scanned} scanned tenant(s), ${Math.max(0, draftMsRemaining)}ms ` +
      `left in the fleet pool. A first-time deferral still filed its action; a retry had already ` +
      `filed one on an earlier tick.`,
    );
  }

  return json(200, {
    ok: true,
    mode: "batch",
    tenants_scanned: scanned,          // unchanged meaning: tenants that completed a scan this tick
    tenants_failed: failed,
    tenants_deferred: deferredTenantIds.length,
    deferred_tenant_ids: deferredTenantIds,
    drafts_deferred: draftsDeferred,
    elapsed_ms: Date.now() - startedAt,
    runs,
  });
});
