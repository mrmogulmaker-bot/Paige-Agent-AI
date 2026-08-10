// operator/operator_llm_failover.ts — OPERATOR check #8 (runner_key: operator_llm_failover).
//
// SEAM (reuse ONLY this): public.paige_llm_trace (§34 L1 Observability — every LLM call Paige makes,
// with provider/status). Service role reads directly (service-write, tenant-read-only; the operator
// runner reads platform-wide with no tenant filter, §53). This assesses whether Paige's LLM layer is
// healthy and whether failover has real provider diversity to route around a failing provider.
//
// VERDICT (§13 honest):
//   • No traces in the window → 'skip' (no activity to assess; NOT a fabricated pass).
//   • error+needs_config rate < 50% → 'pass'.
//   • error+needs_config rate >= 50% → 'fail'.
// The distinct-provider count is reported (a single-provider fleet is a failover risk surfaced in the
// interpretation) but is NOT the pass/fail axis on its own — a healthy single-provider window still passes.
// §32 fail-loud: a db error throws → status:'error'.

import type { CheckRunner } from "../../systems-check-runner.ts";
import { throwOnDbError, errorResult } from "../_kit.ts";

export const runnerKey = "operator_llm_failover";

const WINDOW_MS = 24 * 60 * 60 * 1000; // 24 hours
const PROVIDER_SAMPLE = 2000;          // cap for the distinct-provider sample

export const run: CheckRunner = async (ctx, _row) => {
  const { admin } = ctx;
  const since = new Date(Date.now() - WINDOW_MS).toISOString();
  try {
    const [totalRes, errorRes, needsCfgRes, providerRes] = await Promise.all([
      admin.from("paige_llm_trace").select("id", { count: "exact", head: true }).gte("created_at", since),
      admin.from("paige_llm_trace").select("id", { count: "exact", head: true }).gte("created_at", since).eq("status", "error"),
      admin.from("paige_llm_trace").select("id", { count: "exact", head: true }).gte("created_at", since).eq("status", "needs_config"),
      admin.from("paige_llm_trace").select("provider").gte("created_at", since).limit(PROVIDER_SAMPLE),
    ]);
    throwOnDbError(totalRes.error, "paige_llm_trace.total");
    throwOnDbError(errorRes.error, "paige_llm_trace.error");
    throwOnDbError(needsCfgRes.error, "paige_llm_trace.needs_config");
    throwOnDbError(providerRes.error, "paige_llm_trace.providers");

    const total = totalRes.count ?? 0;
    const errors = errorRes.count ?? 0;
    const needsCfg = needsCfgRes.count ?? 0;
    const providers = [...new Set((providerRes.data ?? [])
      .map((r) => (r as { provider?: string }).provider)
      .filter((p): p is string => typeof p === "string" && p.length > 0))];

    if (total === 0) {
      return {
        status: "skip",
        evidence: { total_24h: 0, providers: [], reason: "no_llm_activity" },
        interpretation: "No LLM calls were recorded in the last 24 hours — no activity to assess failover health against.",
      };
    }

    const badRate = (errors + needsCfg) / total;
    const pass = badRate < 0.5;
    const failoverNote = providers.length <= 1
      ? " Only one provider is in use in this window — failover has no alternate provider to route to."
      : "";

    return {
      status: pass ? "pass" : "fail",
      evidence: {
        total_24h: total,
        errors_24h: errors,
        needs_config_24h: needsCfg,
        error_rate: Math.round(badRate * 1000) / 1000,
        distinct_providers: providers.length,
        providers,
      },
      interpretation: pass
        ? `LLM layer is healthy — ${errors + needsCfg}/${total} calls errored or needs-config in the last 24h (${Math.round(badRate * 100)}%) across ${providers.length} provider(s).${failoverNote}`
        : `LLM layer is degraded — ${errors + needsCfg}/${total} calls errored or needs-config in the last 24h (${Math.round(badRate * 100)}%) across ${providers.length} provider(s).${failoverNote}`,
      metric: { name: "llm_error_rate", value: Math.round(badRate * 1000) / 1000 },
    };
  } catch (e) {
    return errorResult(e, runnerKey);
  }
};
