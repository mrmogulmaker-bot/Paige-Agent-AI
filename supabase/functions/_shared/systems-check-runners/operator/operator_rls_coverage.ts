// operator/operator_rls_coverage.ts — OPERATOR check #4 (runner_key: operator_rls_coverage).
//
// SEAM (reuse ONLY this): the operator_rls_coverage_audit() SECURITY DEFINER RPC (20260816170000),
// gated is_platform_operator() OR service_role. It audits public base tables via pg_catalog and returns
// counts + the capped lists of tables WITHOUT RLS and tables with RLS-but-no-policy. §18 one home.
//
// VERDICT: fail if ANY public base table lacks RLS, OR any table has RLS enabled but zero policies (an
// RLS table with no policy silently denies all authenticated access — a real gap). Else pass. §13 honest.
// §32 fail-loud: an RPC error throws → status:'error'.

import type { CheckRunner } from "../../systems-check-runner.ts";
import { throwOnDbError, errorResult } from "../_kit.ts";

export const runnerKey = "operator_rls_coverage";

export const run: CheckRunner = async (ctx, _row) => {
  const { admin } = ctx;
  try {
    const { data, error } = await admin.rpc("operator_rls_coverage_audit");
    throwOnDbError(error, "operator_rls_coverage_audit");
    const audit = (data ?? {}) as Record<string, unknown>;

    const noRlsCount = Number(audit.tables_without_rls_count ?? 0);
    const noPolCount = Number(audit.tables_rls_no_policy_count ?? 0);
    const pass = noRlsCount === 0 && noPolCount === 0;

    const gaps: string[] = [];
    if (noRlsCount > 0) gaps.push(`${noRlsCount} table(s) without RLS`);
    if (noPolCount > 0) gaps.push(`${noPolCount} table(s) with RLS but no policy`);

    return {
      status: pass ? "pass" : "fail",
      evidence: audit,
      interpretation: pass
        ? `RLS coverage is complete — ${audit.rls_enabled}/${audit.total_tables} public base tables have row-level security and every RLS table has at least one policy.`
        : `RLS coverage gap: ${gaps.join("; ")}. Coverage ${audit.rls_enabled}/${audit.total_tables} (${audit.coverage_ratio ?? "n/a"}).`,
      metric: typeof audit.coverage_ratio === "number"
        ? { name: "rls_coverage_ratio", value: audit.coverage_ratio as number }
        : undefined,
    };
  } catch (e) {
    return errorResult(e, runnerKey);
  }
};
