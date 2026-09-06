// Sales Scenario Lab — the pure, MODELED projection (Campaigns → Sales → Sales Scenarios).
//
// This is a decision model, never a forecast and never an action. It changes nothing: not a price,
// not an offer, not a deal, not a campaign, not a payment, not a Mission (owner build acceptance
// criteria, 2026-09-05). Every number it produces is labelled `modeled`; a number it cannot compute
// is `unknown`, never a plausible guess.
//
// EVIDENCE VS ASSUMPTION. The current price is source-backed (from Catalog). Close rate and
// opportunity count are either source-backed (from the tenant's own closed/open pipeline) or
// owner-entered assumptions — the model tracks which, so the surface can label each input honestly
// and refuse to compute the "Evidence-supported" path when there is no evidence behind it.

export type ScenarioPathKey = "conservative" | "evidence" | "stretch";

export type ScenarioInput = {
  /** Minor units, source-backed from Catalog (`tenant_prices.unit_amount`). Null when no price. */
  readonly currentPriceMinor: number | null;
  /** Minor units, owner-entered. Null until entered. */
  readonly proposedPriceMinor: number | null;
  readonly currency: string;
  /** 0–100. Null when neither evidence nor an assumption is available. */
  readonly closeRatePct: number | null;
  readonly closeRateFromEvidence: boolean;
  /** Real count of qualified opportunities, or an owner assumption. Null when neither exists. */
  readonly opportunities: number | null;
  readonly opportunitiesFromEvidence: boolean;
};

export type ScenarioPath = {
  readonly key: ScenarioPathKey;
  readonly label: string;
  /** Minor units. Null when a required input is missing (renders as em-dash). */
  readonly outcomeMinor: number | null;
  readonly evidence: "modeled" | "unknown";
  /** Reason shown under the figure when it cannot be computed. */
  readonly note: string;
  readonly closeRatePct: number | null;
  readonly opportunities: number | null;
};

export type ScenarioModel = {
  readonly paths: readonly ScenarioPath[];
  readonly hasEvidence: boolean;
  /** True once the owner has supplied a proposed price — the one input the model always needs. */
  readonly ready: boolean;
};

const MULTIPLIER: Record<ScenarioPathKey, number> = {
  conservative: 0.6,
  evidence: 1.0,
  stretch: 1.35,
};

const clampPct = (n: number | null): number | null =>
  n == null || !Number.isFinite(n) ? null : Math.max(0, Math.min(100, n));

/**
 * Compute the three paths. The Evidence-supported path is only computable when the close rate is
 * BACKED BY EVIDENCE; otherwise it reports "No evidence" rather than reusing an assumption, so the
 * three paths never all collapse onto the same owner guess dressed as evidence.
 */
export function deriveScenario(input: ScenarioInput): ScenarioModel {
  const price = input.proposedPriceMinor;
  const opps = input.opportunities != null && Number.isFinite(input.opportunities)
    ? Math.max(0, Math.floor(input.opportunities))
    : null;
  const close = clampPct(input.closeRatePct);
  const hasEvidence = input.closeRateFromEvidence && close != null && input.opportunitiesFromEvidence && opps != null;
  const ready = price != null && Number.isFinite(price) && price >= 0;

  const buildPath = (key: ScenarioPathKey, label: string): ScenarioPath => {
    // The Evidence path requires real evidence behind BOTH close rate and opportunities.
    if (key === "evidence" && !hasEvidence) {
      return {
        key, label, outcomeMinor: null, evidence: "unknown",
        note: "Needs close-rate and opportunity evidence from your pipeline.",
        closeRatePct: input.closeRateFromEvidence ? close : null,
        opportunities: input.opportunitiesFromEvidence ? opps : null,
      };
    }
    if (!ready || close == null || opps == null) {
      const missing = !ready ? "Enter a proposed price" : close == null ? "Enter a close-rate assumption" : "Enter an opportunity count";
      return {
        key, label, outcomeMinor: null, evidence: "modeled", note: missing,
        closeRatePct: close, opportunities: opps,
      };
    }
    const outcome = Math.round((price as number) * opps * (close / 100) * MULTIPLIER[key]);
    return {
      key, label, outcomeMinor: outcome, evidence: "modeled",
      note: "Projected over the chosen period.",
      closeRatePct: close, opportunities: opps,
    };
  };

  return {
    hasEvidence,
    ready,
    paths: [
      buildPath("conservative", "Conservative"),
      buildPath("evidence", "Evidence-supported"),
      buildPath("stretch", "Stretch"),
    ],
  };
}
