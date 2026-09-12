/**
 * Media budget + approval policy — the pure decision core for the media seam.
 *
 * Reuses the router-budget LADDER verbatim (_shared/router-budget/mod.ts
 * `enforceBudget`) so media and LLM spend enforce the same three-band math.
 * What differs — deliberately, by owner ruling — is the IO posture and the
 * approval boundary:
 *
 *   MEDIA FAILS CLOSED on unknown accrual ("budget unavailable, stale,
 *   exceeded, or unknown → fail closed" — owner authorization). The LLM path's
 *   proceed-un-gated degrade is NOT inherited here; media mints provider spend.
 *
 * Approval boundary (owner authorization, "Required behavior"):
 *   within automatic draft allowance → may proceed only if policy permits
 *     (standard-tier image/image_edit, estimate ≤ allowance, budget allow)
 *   above draft allowance → require confirmation
 *   premium video / expensive generation → always require confirmation
 *     (video ALWAYS requires confirmation, whatever the estimate)
 *
 * Dependency-free pure functions — vitest-importable like the durable-job seam.
 */

import { enforceBudget, type BudgetBand, type BudgetDecision } from "../router-budget/mod.ts";
import type { MediaMode } from "./mod.ts";

export type MediaApprovalPolicy =
  | { approvalRequired: false; reason: "within_draft_allowance" }
  | { approvalRequired: true; reason: "video_requires_approval" | "premium_model" | "above_draft_allowance" };

export function resolveApprovalPolicy(input: {
  mode: MediaMode;
  tier: "standard" | "premium";
  estimatedCostUsd: number;
  draftAllowanceUsd: number;
}): MediaApprovalPolicy {
  if (input.mode === "video") return { approvalRequired: true, reason: "video_requires_approval" };
  if (input.tier === "premium") return { approvalRequired: true, reason: "premium_model" };
  if (input.estimatedCostUsd > input.draftAllowanceUsd) {
    return { approvalRequired: true, reason: "above_draft_allowance" };
  }
  return { approvalRequired: false, reason: "within_draft_allowance" };
}

/**
 * The band a media job routes through the shared ladder. Premium tiers are
 * never "cheap" (they fail closed at the hard ceiling, like reasoning).
 */
export function mediaBand(mode: MediaMode, tier: "standard" | "premium"): BudgetBand {
  if (tier === "premium") return "reasoning";
  if (mode === "video") return "reasoning";
  return "cheap";
}

// String-literal discriminant: this repo compiles non-strict, where boolean
// discrimination does not narrow.
export type MediaBudgetDecision =
  | { verdict: "allow"; decision: BudgetDecision }
  /** Fail-closed verdict with the truthful reason the UI must show. */
  | { verdict: "deny"; gate: "budget_exceeded" | "budget_unknown"; explanation: string; decision?: BudgetDecision };

/**
 * Decide a media job against the ladder. `accruedUsd: null` means the accrual
 * read FAILED — media fails closed (the documented deviation from the LLM path).
 *
 * DEVIATION #1 (fail closed on unknown accrual) and DEVIATION #2 (no cheap-band
 * continue past the hard ceiling) are both owner-ruled for MEDIA ("budget
 * unavailable, stale, exceeded, or unknown → fail closed") and deliberately do
 * NOT edit the shared LLM contract — they live in this wrapper only.
 */
export function decideMediaBudget(input: {
  accruedUsd: number | null;
  ceilingUsd: number | null;
  mode: MediaMode;
  tier: "standard" | "premium";
  estimatedCostUsd: number;
}): MediaBudgetDecision {
  if (input.accruedUsd === null || !Number.isFinite(input.accruedUsd)) {
    return {
      verdict: "deny",
      gate: "budget_unknown",
      explanation:
        "Today's media spend couldn't be read, so generation is paused (fail-closed). Try again shortly; if it persists, check the database.",
    };
  }
  // A null ceiling means the owner has not configured the media budget at all —
  // spend is not enabled (no silent default; owner ruling "no provider calls
  // until … the budget configuration is in place").
  if (input.ceilingUsd === null || !Number.isFinite(input.ceilingUsd) || input.ceilingUsd <= 0) {
    return {
      verdict: "deny",
      gate: "budget_unknown",
      explanation:
        "Media generation isn't switched on yet — no media budget ceiling is configured. The owner sets media_budget_daily_usd (platform or per-tenant) to enable spend.",
    };
  }
  const decision = enforceBudget({
    accrued_usd: input.accruedUsd,
    ceiling_usd: input.ceilingUsd,
    band: mediaBand(input.mode, input.tier),
  });
  // Media deviation #2: the cheap band's continue-at-hard posture is for LLM
  // economy traffic; media mints provider spend, so the hard gate BLOCKS here.
  if (decision.decision === "block" || decision.gate === "budget_hard") {
    return {
      verdict: "deny",
      gate: "budget_exceeded",
      explanation:
        `Daily media budget reached ($${input.accruedUsd.toFixed(2)} of $${input.ceilingUsd.toFixed(2)}); resets at UTC midnight`,
      decision,
    };
  }
  // A job that would itself blow past the ceiling is blocked even below the
  // soft gate — the ladder guards spend already accrued; this guards the
  // marginal spend the request is about to mint.
  if (input.accruedUsd + input.estimatedCostUsd > input.ceilingUsd) {
    return {
      verdict: "deny",
      gate: "budget_exceeded",
      explanation:
        `This job (≈$${input.estimatedCostUsd.toFixed(2)}) would exceed today's media budget ($${input.accruedUsd.toFixed(2)} of $${input.ceilingUsd.toFixed(2)} used); resets at UTC midnight`,
      decision,
    };
  }
  return { verdict: "allow", decision };
}

/** Accrual read for the UTC day via the service-role RPC `media_spend_today`. */
export async function readMediaAccrual(
  rpc: (name: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { message?: string } | null }>,
  tenantId: string,
): Promise<number | null> {
  try {
    const { data, error } = await rpc("media_spend_today", { _tenant: tenantId });
    if (error) {
      console.error("[media-budget] accrual read error:", error.message ?? "unknown");
      return null;
    }
    const n = data === null || data === undefined ? 0 : Number(data);
    return Number.isFinite(n) ? n : null;
  } catch (e) {
    console.error("[media-budget] accrual read threw:", e instanceof Error ? e.message : "unknown");
    return null;
  }
}
