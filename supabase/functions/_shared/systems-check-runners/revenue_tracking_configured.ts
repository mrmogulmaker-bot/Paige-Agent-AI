// systems-check-runners/revenue_tracking_configured.ts — Check #8 (runner_key: revenue_tracking_configured).
//
// SEAM (reuse ONLY this): the operator_revenue_integrity_audit(_tenant_id) RPC, called via the service-role
//   client. That function is OWNER-GATED — it RAISES 42501 ('not authorized') for any non-owner caller.
//   The service-role client carries no user identity, so is_platform_owner() is false and the call RAISES.
//
// HONEST DEGRADE (§13/§32): an owner-gated / not-authorized raise is the expected "not determinable from
//   this context" outcome → status:'skip' (needs_config), NEVER a fabricated pass and NEVER a false 'fail'.
//   Only a genuine, unexpected error fails loud as 'error'. When the RPC IS answerable (future owner-context
//   caller), we read the tenant's integrity_ok: true → pass, false → fail; zero rows → no revenue
//   classification on file → fail (tracking not configured).

import type { CheckRunner } from "../systems-check-runner.ts";
import { errorResult } from "./_kit.ts";

export const runnerKey = "revenue_tracking_configured";

function isOwnerGated(err: { code?: string; message?: string } | null | undefined): boolean {
  if (!err) return false;
  if (err.code === "42501") return true;
  const m = (err.message ?? "").toLowerCase();
  return m.includes("not authorized") || m.includes("permission denied") || m.includes("42501");
}

export const run: CheckRunner = async (ctx, _row) => {
  const { admin, tenantId } = ctx;
  try {
    const { data, error } = await admin.rpc("operator_revenue_integrity_audit", { _tenant_id: tenantId });

    if (error) {
      if (isOwnerGated(error)) {
        // Expected: the owner-gated audit is not callable from the service-role scan context. Honest skip.
        return {
          status: "skip",
          evidence: {
            needs_config: "revenue_integrity_audit_owner_gated",
            note: "operator_revenue_integrity_audit is owner-only and not answerable from the systems-check service context",
          },
          interpretation: "Revenue tracking could not be evaluated from this context — the integrity audit is owner-gated. Not counted as pass or fail.",
        };
      }
      // A different, genuine failure → fail loud.
      const e = new Error(error.message) as Error & { code?: string; where?: string };
      e.code = (error as { code?: string }).code;
      e.where = "operator_revenue_integrity_audit";
      throw e;
    }

    const rows = (Array.isArray(data) ? data : []) as Array<{ tenant_id?: string; integrity_ok?: boolean; revenue_class?: string }>;
    const own = rows.find((r) => r.tenant_id === tenantId) ?? rows[0];

    if (!own) {
      // Callable, but the tenant has no revenue classification row — tracking is not set up.
      return {
        status: "fail",
        evidence: { has_revenue_classification: false },
        interpretation: "No revenue classification is on file for this tenant — revenue tracking is not configured yet.",
      };
    }

    const ok = own.integrity_ok === true;
    return {
      status: ok ? "pass" : "fail",
      evidence: { integrity_ok: ok, revenue_class: own.revenue_class ?? null },
      interpretation: ok
        ? "Revenue tracking is configured and the integrity chain (agreement + live subscription + classification) is intact."
        : "Revenue tracking exists but its integrity chain is incomplete — reconcile the agreement/subscription/classification.",
    };
  } catch (e) {
    return errorResult(e, runnerKey);
  }
};
