// systems-check-run-operator — the OPERATOR flavor of the Systems Check runner (Wave S3, task #80, L3).
//
// Runs the OPERATOR-scope catalog (scope='operator') TENANT-LESS (§53): platform DB/RLS health, platform
// Stripe-webhook + Twilio-master health, LLM failover, doctrine binding, domain/SSL, cross-tenant canary,
// plus the two DEFERRED git-tag drift checks (which honestly return needs_config — an edge fn cannot read
// git, §13). It writes null-tenant run/finding rows and NEVER files onto the tenant action bus (the core
// gates action-filing to tenant scope; operator remediation lives on the finding's drafted_fix).
//
// AUTH — verify_jwt = FALSE (declared in config.toml) so the cron poster (no Supabase JWT) can reach it;
// the function FAILS CLOSED in-function to one of two gates:
//   • internal caller (service-role bearer OR valid x-cron-token) — the hourly cron tick, and
//   • an operator JWT (is_platform_operator() — super_admin OR platform_admin, §53) — a browser operator
//     or Paige triggering a manual scan. NEVER a tenant JWT, NEVER a request-body identity (§588).
//
// FLAVOR: an internal/cron caller runs 'scheduled' + delta (noise-controlled hourly heartbeat); an
// operator JWT caller runs 'onboarding' + all (the full picture on demand). Both are scope:'operator'.
//
// §18: imports the ONE core (runSystemsCheck) + the OPERATOR runner barrel (side-effect registration). It
// writes NO DB rows itself — the core is the SOLE writer of paige_systems_check_run / _finding (§37).

import { runSystemsCheck } from "../_shared/systems-check-runner.ts";
import "../_shared/systems-check-runners/operator/index.ts"; // side-effect: registers the operator runners (§18)
import { adminClient, corsHeaders, isAuthorizedInternalCaller, isOperatorJwt, json } from "../_shared/systems-check-http.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });

  const admin = adminClient();

  // Gate: internal (service/cron) OR an operator JWT. Fail-closed — a tenant JWT or anon is rejected.
  const internal = await isAuthorizedInternalCaller(req, admin);
  const operator = internal ? false : await isOperatorJwt(req);
  if (!internal && !operator) return json(401, { error: "unauthorized" });

  // Internal/cron → scheduled/delta heartbeat; operator JWT → onboarding/all full scan.
  const scanFlavor = internal ? "scheduled" : "onboarding";
  const actionFiling = internal ? "delta" : "all";

  try {
    const summary = await runSystemsCheck({
      admin,
      tenantId: null,             // §53 operator scan is TENANT-LESS — the core forces every write to null tenant
      scope: "operator",
      scanFlavor,
      actionFiling,
      triggeredBy: { source: "operator", caller: internal ? "internal" : "operator_jwt" },
    });
    return json(200, { ok: true, scope: "operator", ...summary });
  } catch (e) {
    // Fail-loud (§13/§32) — never a fabricated success. Per-check errors self-heal inside the core;
    // reaching here is a top-level failure (e.g. run-row insert), reported honestly.
    console.error("[systems-check-run-operator] scan failed:", (e as Error)?.message);
    return json(500, { error: "scan_failed", detail: (e as Error)?.message ?? "unknown" });
  }
});
