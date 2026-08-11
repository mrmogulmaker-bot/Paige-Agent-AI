// systems-check-runners/crm_has_customers.ts — Check #6 (runner_key: crm_has_customers).
//
// SEAM (reuse ONLY this): count(*) of clients WHERE tenant_id = <this tenant>. Pass if > 0.
// §51 tenant-scoped (the count is filtered to ctx.tenantId — a sub-account counts ITS OWN clients, never
//   a parent-agency aggregate). §32 fail-loud; §13 honest evidence + a §26 baseline metric.

import type { CheckRunner } from "../systems-check-runner.ts";
import { throwOnDbError, errorResult } from "./_kit.ts";

export const runnerKey = "crm_has_customers";

export const run: CheckRunner = async (ctx, _row) => {
  const { admin, tenantId } = ctx;
  try {
    const res = await admin
      .from("clients")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId);
    throwOnDbError(res.error, "clients.count");

    const count = res.count ?? 0;
    const pass = count > 0;

    return {
      status: pass ? "pass" : "fail",
      evidence: { customer_count: count },
      interpretation: pass
        ? `${count} customer(s) in the CRM.`
        : "No customers in the CRM yet — import or add the tenant's existing clients so Paige can start working the book.",
      metric: { name: "crm_customer_count", value: count },
    };
  } catch (e) {
    return errorResult(e, runnerKey);
  }
};
