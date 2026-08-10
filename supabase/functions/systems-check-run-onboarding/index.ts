// systems-check-run-onboarding — the ONBOARDING flavor of the Systems Check runner (task #80, L2).
//
// Runs the FULL enabled 10-check catalog for ONE tenant and files a remediation action for EVERY fail
// (actionFiling:'all') — onboarding wants the complete picture surfaced, not a delta. This is the
// first-run scan a coach (or the operator, or a future provision_tenant hook) triggers to see where a
// fresh account stands across comms / website / social / automation / company info / CRM / pipeline /
// revenue / payments.
//
// §9/§588: identity + tenant come from the VERIFIED JWT (current_user_tenant_id), NEVER the body — the
// one exception is a platform OWNER targeting a tenant via body.tenant_id (owner-gated, resolveTenantFromJwt).
// verify_jwt = true (default; declared in config.toml). Dual-client: JWT for authz, service-role for writes.
//
// §18: imports the ONE core (runSystemsCheck) + the runner registration barrel (side-effect). It writes
// NO DB rows itself — the core is the SOLE writer of paige_systems_check_run / _finding (§37).

import { runSystemsCheck } from "../_shared/systems-check-runner.ts";
import "../_shared/systems-check-runners/index.ts"; // side-effect: registers the 10 runner modules (§18)
import { corsHeaders, json, resolveTenantFromJwt } from "../_shared/systems-check-http.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });

  let body: { tenant_id?: string } = {};
  body = (await req.json().catch(() => ({}))) as { tenant_id?: string };

  const resolved = await resolveTenantFromJwt(req, body.tenant_id ?? null);
  if (resolved.error) return json(resolved.error.status, resolved.error.body);
  if (!resolved.tenantId) return json(400, { error: "no_tenant_resolved" });

  try {
    const summary = await runSystemsCheck({
      admin: resolved.admin,
      tenantId: resolved.tenantId,
      scanFlavor: "onboarding",
      actionFiling: "all",
      triggeredBy: { source: "onboarding", owner_initiated: resolved.isOwner },
    });
    return json(200, { ok: true, ...summary });
  } catch (e) {
    // Fail-loud (§13/§32) — never a fabricated success. The core self-heals per-check errors internally;
    // reaching here means a top-level failure (e.g. run-row insert), which we report honestly.
    console.error("[systems-check-run-onboarding] scan failed:", (e as Error)?.message);
    return json(500, { error: "scan_failed", detail: (e as Error)?.message ?? "unknown" });
  }
});
