// systems-check-run-change — the CHANGE-TRIGGERED flavor of the Systems Check runner (task #80, L2).
//
// A targeted re-check: the caller names a `changed_surface` (e.g. a coach just connected their website,
// or declared their payment processor) and this runs ONLY the applicable subset of checks for that
// surface — never the full catalog. Files a remediation action for every fail in the subset
// (actionFiling:'all'): a change-triggered scan is a deliberate targeted re-check, so a still-failing
// surface is worth surfacing. (Spec-locked: 'delta' filing is the SCHEDULED flavor's noise-control, §
// the interface contract; change files all in-subset.)
//
// §9/§588: tenant from the VERIFIED JWT (owner may target via body.tenant_id). verify_jwt = true
// (default; declared in config.toml). §18: imports the ONE core + the runner barrel; writes no rows itself.

import { runSystemsCheck } from "../_shared/systems-check-runner.ts";
import "../_shared/systems-check-runners/index.ts"; // side-effect: registers the 10 runner modules (§18)
import { corsHeaders, json, resolveTenantFromJwt } from "../_shared/systems-check-http.ts";

// changed_surface → applicable runner_keys. A change on a surface re-runs only the checks that read it.
// (Keys match the L1 registry runner_key column, incl. the §38-corrected payment_methods_declared.)
const SURFACE_TO_RUNNERS: Record<string, string[]> = {
  comms: ["comms_configured"],
  communications: ["comms_configured"],
  website: ["website_connected"],
  social: ["social_handles_captured"],
  social_handles: ["social_handles_captured"],
  automation: ["external_automation_detected"],
  company: ["company_info_populated"],
  company_info: ["company_info_populated"],
  profile: ["company_info_populated"],
  crm: ["crm_has_customers"],
  contacts: ["crm_has_customers"],
  pipeline: ["sales_pipeline_configured"],
  sales_pipeline: ["sales_pipeline_configured"],
  revenue: ["revenue_tracking_configured"],
  payments: ["payment_processor_connected", "payment_methods_declared"],
  payment_processor: ["payment_processor_connected"],
  payment_methods: ["payment_methods_declared"],
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });

  let body: { tenant_id?: string; changed_surface?: string } = {};
  body = (await req.json().catch(() => ({}))) as { tenant_id?: string; changed_surface?: string };

  const surface = (body.changed_surface ?? "").trim().toLowerCase();
  if (!surface) return json(400, { error: "changed_surface_required" });
  const runnerKeys = SURFACE_TO_RUNNERS[surface];
  if (!runnerKeys) {
    // §13 honest — don't silently run the full catalog on an unknown surface; name what's valid.
    return json(400, { error: "unknown_surface", surface, known_surfaces: Object.keys(SURFACE_TO_RUNNERS) });
  }

  const resolved = await resolveTenantFromJwt(req, body.tenant_id ?? null);
  if (resolved.error) return json(resolved.error.status, resolved.error.body);
  if (!resolved.tenantId) return json(400, { error: "no_tenant_resolved" });

  try {
    const summary = await runSystemsCheck({
      admin: resolved.admin,
      tenantId: resolved.tenantId,
      scanFlavor: "change_triggered",
      runnerKeys,
      actionFiling: "all",
      triggeredBy: { source: "change_triggered", changed_surface: surface, owner_initiated: resolved.isOwner },
    });
    return json(200, { ok: true, changed_surface: surface, ...summary });
  } catch (e) {
    console.error("[systems-check-run-change] scan failed:", (e as Error)?.message);
    return json(500, { error: "scan_failed", detail: (e as Error)?.message ?? "unknown" });
  }
});
