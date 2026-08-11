// operator/operator_cross_tenant_canary.ts — OPERATOR check #10 (runner_key: operator_cross_tenant_canary).
//
// SEAM (reuse ONLY this): public.security_canary_runs — the output table of the existing
// security-canary-probe edge fn (an anonymous caller probes growth_forms/growth_pages for restricted
// columns and logs pass/regression here). This runner READS the latest canary results (§18 — it does NOT
// re-run the probe or fork its logic; the probe runs on its own schedule). Platform-global, no tenant
// filter (§53). Service role reads directly.
//
// VERDICT (§13 honest):
//   • A regression in the recent window (last 25h) → 'fail' (a real cross-tenant/column leak was detected).
//   • Recent runs exist and none regressed → 'pass'.
//   • No runs in the recent window (canary stale) OR none ever → 'skip' (needs the canary to run; NOT a
//     fabricated pass).
// §32 fail-loud: a db error throws → status:'error'.

import type { CheckRunner } from "../../systems-check-runner.ts";
import { throwOnDbError, errorResult } from "../_kit.ts";

export const runnerKey = "operator_cross_tenant_canary";

const WINDOW_MS = 25 * 60 * 60 * 1000; // 25h — the canary should have run at least once a day

export const run: CheckRunner = async (ctx, _row) => {
  const { admin } = ctx;
  const since = new Date(Date.now() - WINDOW_MS).toISOString();
  try {
    const [recentRes, everRes] = await Promise.all([
      admin.from("security_canary_runs")
        .select("probe_name, target, status, leaked_columns, created_at")
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(50),
      admin.from("security_canary_runs").select("id", { count: "exact", head: true }),
    ]);
    throwOnDbError(recentRes.error, "security_canary_runs.recent");
    throwOnDbError(everRes.error, "security_canary_runs.ever");

    const recent = (recentRes.data ?? []) as Array<{ probe_name: string; target: string; status: string; leaked_columns: string[] }>;
    const everCount = everRes.count ?? 0;

    if (recent.length === 0) {
      return {
        status: "skip",
        evidence: { runs_last_25h: 0, runs_ever: everCount, reason: everCount === 0 ? "canary_never_run" : "canary_stale" },
        interpretation: everCount === 0
          ? "The security canary has never run — cannot assess cross-tenant leak health until it does."
          : "The security canary has not run in the last 25 hours (stale) — re-run the security-canary-probe to get a fresh result.",
      };
    }

    const regressions = recent.filter((r) => r.status === "regression");
    const pass = regressions.length === 0;
    return {
      status: pass ? "pass" : "fail",
      evidence: {
        runs_last_25h: recent.length,
        regressions: regressions.map((r) => ({ target: r.target, leaked_columns: r.leaked_columns })),
      },
      interpretation: pass
        ? `Cross-tenant leak canary is clean — ${recent.length} probe result(s) in the last 25h, zero regressions.`
        : `Cross-tenant leak canary detected ${regressions.length} regression(s): ${regressions.map((r) => r.target).join(", ")}. An anonymous caller was able to read restricted columns — treat as P0.`,
    };
  } catch (e) {
    return errorResult(e, runnerKey);
  }
};
