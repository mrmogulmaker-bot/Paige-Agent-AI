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

import { runSystemsCheck } from "../_shared/systems-check-runner.ts";
import "../_shared/systems-check-runners/index.ts"; // side-effect: registers the 10 runner modules (§18)
import { adminClient, corsHeaders, isAuthorizedInternalCaller, json } from "../_shared/systems-check-http.ts";

// Per-tick batch cap. Each failing check runs a forge() draft in the core, so a large batch is expensive
// AND risks the edge wall-clock limit — keep it small; cron cadence covers the fleet over time. See the
// §13 caveat in the manifest re: least-recently-scanned ordering as the scale follow-up.
const DEFAULT_BATCH = 15;
const MAX_BATCH = 100;

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
  let scanned = 0;
  let failed = 0;
  for (const t of rows) {
    try {
      const s = await runSystemsCheck({
        admin,
        tenantId: t.id,
        scanFlavor: "scheduled",
        actionFiling: "delta",
        triggeredBy: { source: "scheduled", mode: "batch" },
      });
      runs.push({ tenant_id: t.id, run_id: s.run_id, fail_count: s.fail_count, actions_filed: s.actions_filed });
      scanned++;
    } catch (e) {
      // Fail-loud per tenant (§13/§32) — one tenant's failure never aborts the batch.
      console.error(`[systems-check-run-scheduled] scan failed for tenant ${t.id}:`, (e as Error)?.message);
      runs.push({ tenant_id: t.id, error: (e as Error)?.message ?? "scan_failed" });
      failed++;
    }
  }
  return json(200, { ok: true, mode: "batch", tenants_scanned: scanned, tenants_failed: failed, runs });
});
