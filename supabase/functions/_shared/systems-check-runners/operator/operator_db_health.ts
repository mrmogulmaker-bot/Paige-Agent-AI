// operator/operator_db_health.ts — OPERATOR check #1 (runner_key: operator_db_health).
//
// SEAM (reuse ONLY this): the operator_db_health_snapshot() SECURITY DEFINER RPC (20260816170000),
// gated is_platform_operator() OR service_role. It returns PII-free pg_stat metrics + a `healthy`
// boolean. This runner reads that verdict — it does NOT read pg_stat directly (an edge fn has no
// privilege to; the RPC is the one home, §18). Operator-scope: no tenant filter (§53).
//
// §32 fail-loud: an RPC error throws → status:'error' (never a fabricated pass). §13 honest evidence.

import type { CheckRunner } from "../../systems-check-runner.ts";
import { throwOnDbError, errorResult } from "../_kit.ts";

export const runnerKey = "operator_db_health";

export const run: CheckRunner = async (ctx, _row) => {
  const { admin } = ctx;
  try {
    const { data, error } = await admin.rpc("operator_db_health_snapshot");
    throwOnDbError(error, "operator_db_health_snapshot");
    const snap = (data ?? {}) as Record<string, unknown>;
    const healthy = snap.healthy === true;

    return {
      status: healthy ? "pass" : "fail",
      evidence: snap,
      interpretation: healthy
        ? `Production database is healthy — ${snap.connections}/${snap.max_connections} connections, cache hit ratio ${snap.cache_hit_ratio ?? "n/a"}, longest active query ${snap.longest_active_seconds ?? 0}s.`
        : `Production database health is degraded: ${snap.connections}/${snap.max_connections} connections, cache hit ratio ${snap.cache_hit_ratio ?? "n/a"}, longest active query ${snap.longest_active_seconds ?? 0}s, deadlocks ${snap.deadlocks ?? 0}.`,
      metric: typeof snap.cache_hit_ratio === "number"
        ? { name: "cache_hit_ratio", value: snap.cache_hit_ratio as number }
        : undefined,
    };
  } catch (e) {
    return errorResult(e, runnerKey);
  }
};
