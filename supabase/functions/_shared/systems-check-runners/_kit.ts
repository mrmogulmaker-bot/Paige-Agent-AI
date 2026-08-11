// _shared/systems-check-runners/_kit.ts — tiny shared helpers for the 10 Systems Check runner
// modules (§18 one home for the fail-loud error envelope; NOT a data seam — each runner still reads
// ONLY its own named seam). Keeping the error-shaping here avoids a copy-paste fork across 10 files
// (§13 clean/maintainable) while the actual reads stay per-runner.
//
// FAIL-LOUD (§13/§32): a supabase query error or a thrown exception becomes status:'error' carrying the
// error class in evidence — NEVER a silent 'pass'. `throwOnDbError` turns a `{ error }` response into a
// real throw so a runner's single try/catch produces the honest 'error' finding.

import type { CheckResult } from "../systems-check-runner.ts";

/** Turn a supabase-js `{ error }` response into a real throw so the runner's catch fails loud (§32). */
export function throwOnDbError(error: unknown, where: string): void {
  if (!error) return;
  const e = error as { message?: string; code?: string; details?: string };
  const err = new Error(`${where}: ${e?.message ?? "db error"}`) as Error & { code?: string; where?: string };
  err.code = e?.code;
  err.where = where;
  throw err;
}

/** Shape a caught error into the honest 'error' CheckResult the core persists (§13 — real error class). */
export function errorResult(e: unknown, runnerKey: string, extra?: Record<string, unknown>): CheckResult {
  const err = e as { name?: string; message?: string; code?: string; where?: string };
  return {
    status: "error",
    evidence: {
      error_class: err?.name ?? "Error",
      code: err?.code ?? null,
      where: err?.where ?? null,
      message: err?.message ?? "runner failed to determine an answer",
      runner_key: runnerKey,
      ...(extra ?? {}),
    },
  };
}

/** True when a string field carries real content (§13 — a blank/whitespace value is NOT "populated"). */
export function hasText(v: unknown): boolean {
  return typeof v === "string" && v.trim().length > 0;
}
