// ============================================================
// Three-Score Fundability Model
// ============================================================
// Replaces the legacy single "overall fundability" number with three
// distinct, gated scores. A score is ONLY returned when the required
// inputs are present — otherwise we return a `locked` result so the
// UI can render a clear "what's missing" CTA instead of a misleading
// number (the Nicholas scenario).
//
// 2026 update: Negative accounts are now WEIGHTED BY RECENCY. Banks
// look back primarily 24 months — a 4-year-old charge-off should not
// penalize fundability the same as one from 3 months ago. See the
// `getNegativeAccountWeight` function below.
// ============================================================

export type FundabilityScoreType = "personal" | "small_business" | "commercial";

export type FundabilityBand =
  | "poor"
  | "fair"
  | "good"
  | "very_good"
  | "excellent"
  // commercial-only labels
  | "not_ready"
  | "building"
  | "emerging"
  | "established"
  | "elite";

export interface FundabilityScoreResult {
  type: FundabilityScoreType;
  title: string;
  /** Numeric 0-100 score, or null when validation fails. */
  score: number | null;
  band: FundabilityBand | null;
  bandLabel: string | null;
  /** Human-readable summary of what the score means right now. */
  meaning: string;
  /** Products this score level unlocks. */
  unlocks: string[];
  /** Concrete improvement actions. */
  improvements: string[];
  /** True when required inputs are missing — UI shows locked state. */
  locked: boolean;
  /** What the user needs to do to unlock the score. */
  lockedReason?: string;
  /** CTA copy + route for the locked state button. */
  lockedCta?: { label: string; route: string };
  /** Inputs required to compute this score (used in tooltip). */
  inputsRequired: string[];
  /** Sum of weighted negative penalties applied to this score. */
  totalWeightedNegativeScore?: number;
}

// ------------------------------------------------------------
// Profile inputs — minimal shape we need across all three scores
// ------------------------------------------------------------

export interface NegativeAccountInput {
  /** Date of first delinquency, original delinquency, or account opening. */
  date?: string | Date | null;
  /** Optional account type for context. */
  itemType?: string | null;
  /** True if status is active (not removed/resolved). */
  isActive?: boolean;
}

export interface FundabilityProfileInputs {
  // Personal credit
  ficoEq?: number | null;
  ficoEx?: number | null;
  ficoTu?: number | null;
  /** From credit_factor_scores — used as fallback signal of personal credit health. */
  paymentHistoryScore?: number | null;
  utilizationScore?: number | null;
  inquiryScore?: number | null;
  creditMixScore?: number | null;
  /** Raw count — kept for backward compatibility. New scoring uses `negativeAccounts`. */
  activeNegatives?: number | null;
  /** When provided, scoring uses age-weighted penalties instead of a flat count. */
  negativeAccounts?: NegativeAccountInput[] | null;
  oldestAccountAgeMonths?: number | null;
  /** True when at least one credit_report_personal_info row exists. */
  hasPersonalCreditFile: boolean;

  // Business profile
  hasBusiness: boolean;
  entityType?: string | null; // sole_prop | llc | s_corp | c_corp | corporation
  formationDate?: string | null; // ISO
  ein?: string | null;
  hasBusinessBankAccount?: boolean | null;
  bankAccountOpenedDate?: string | null;
  estimatedAnnualRevenue?: number | null;

  // Business credit bureaus
  paydex?: number | null;
  intelliscore?: number | null;
  /** Any business credit data point present (Paydex, Intelliscore, Equifax biz, etc.) */
  hasBusinessCreditDataPoint: boolean;
}

// ============================================================
// Negative Account Age Scoring Model (NEW)
// ============================================================
// Banks underwrite primarily on the last 24 months. We weight each
// negative account by how recent it is so a 4-year-old collection
// doesn't drag a profile down the same as a 3-month-old one. This
// also matches FCRA's 7-year removal window (84 months).
// ============================================================

export type AccountAgeBand =
  | "critical"
  | "severe"
  | "moderate"
  | "mild"
  | "aging"
  | "historical"
  | "approaching_removal";

export interface AccountAgeImpact {
  weight: number;
  band: AccountAgeBand;
  bandLabel: string;
  /** Tailwind color token bucket — semantic, not raw color classes. */
  bandColor: "red" | "amber" | "yellow" | "gray";
  monthsOnReport: number;
  /** Months until 84-month FCRA removal. Negative if past removal. */
  monthsUntilRemoval: number;
  lenderImpact: string;
  urgency: "high" | "medium" | "low" | "monitor";
}

const FCRA_REMOVAL_MONTHS = 84; // 7 years

function monthsBetween(d: Date | string | null | undefined, now = new Date()): number {
  if (!d) return 0;
  const dt = d instanceof Date ? d : new Date(d);
  if (isNaN(dt.getTime())) return 0;
  return (now.getFullYear() - dt.getFullYear()) * 12 + (now.getMonth() - dt.getMonth());
}

/**
 * Returns a 0–1 multiplier for how heavily lenders weigh a negative
 * account based on its age. Newer = more painful.
 */
export function getNegativeAccountWeight(accountDate: Date | string | null | undefined): number {
  const months = monthsBetween(accountDate);
  if (months <= 6) return 1.0;          // Critical
  if (months <= 12) return 0.75;        // Severe
  if (months <= 18) return 0.50;        // Moderate
  if (months <= 24) return 0.25;        // Mild
  if (months <= 48) return 0.10;        // Aging
  if (months <= 84) return 0.05;        // Historical
  return 0.01;                          // Approaching Removal (within 12mo of FCRA drop)
}

export function getAccountAgeBand(accountDate: Date | string | null | undefined): AccountAgeBand {
  const months = monthsBetween(accountDate);
  if (months <= 6) return "critical";
  if (months <= 12) return "severe";
  if (months <= 18) return "moderate";
  if (months <= 24) return "mild";
  if (months <= 48) return "aging";
  if (months <= 84) return "historical";
  return "approaching_removal";
}

/**
 * Months remaining until the 84-month FCRA removal window closes.
 * Returns 0 if the account is already past removal.
 */
export function getMonthsUntilRemoval(accountDate: Date | string | null | undefined): number {
  const months = monthsBetween(accountDate);
  return Math.max(0, FCRA_REMOVAL_MONTHS - months);
}

const BAND_LABELS: Record<AccountAgeBand, string> = {
  critical: "Critical",
  severe: "Severe",
  moderate: "Moderate",
  mild: "Mild",
  aging: "Aging",
  historical: "Historical",
  approaching_removal: "Approaching Removal",
};

const BAND_COLORS: Record<AccountAgeBand, "red" | "amber" | "yellow" | "gray"> = {
  critical: "red",
  severe: "red",
  moderate: "amber",
  mild: "amber",
  aging: "yellow",
  historical: "gray",
  approaching_removal: "gray",
};

const BAND_URGENCY: Record<AccountAgeBand, "high" | "medium" | "low" | "monitor"> = {
  critical: "high",
  severe: "high",
  moderate: "medium",
  mild: "medium",
  aging: "low",
  historical: "monitor",
  approaching_removal: "monitor",
};

function lenderImpactFor(band: AccountAgeBand, monthsUntilRemoval: number): string {
  switch (band) {
    case "critical":
      return "Most lenders treat this as current behavior. Conventional banks, credit unions, and most business lenders will auto-decline or require manual review. This is your highest priority to address.";
    case "severe":
      return "Within the 12-month lookback window used by FHA, VA, and most business credit card issuers. Manual underwriters at most banks will flag this. High impact on approvals.";
    case "moderate":
      return "Within the 18-month window DSCR lenders and business lenders typically review. Getting better but still causes friction with most conventional products.";
    case "mild":
      return "Approaching the edge of the standard 24-month bank lookback window. Most automated systems still flag this but manual underwriters show more flexibility. Continued improvement visible.";
    case "aging":
      return "Outside the primary 24-month lookback for most conventional products. SBA and prime lenders may still review this window. Minimal impact on most funding decisions.";
    case "historical":
      return "Low underwriting impact for most products. This account is aging toward the 7-year FCRA removal window. Monitor only — focus energy on building positive history.";
    case "approaching_removal":
      return `This negative account will be removed from your credit report within ${monthsUntilRemoval} month${monthsUntilRemoval === 1 ? "" : "s"} under FCRA's 7-year rule. This is good news — removal will improve your scores automatically.`;
  }
}

/**
 * Returns the full age-impact metadata for a negative account so the
 * UI can render a graded badge, lender-impact copy, and timeline marker.
 */
export function getAccountAgeImpact(
  _account: NegativeAccountInput | unknown,
  accountDate: Date | string | null | undefined,
): AccountAgeImpact {
  const monthsOnReport = monthsBetween(accountDate);
  const monthsUntilRemoval = getMonthsUntilRemoval(accountDate);
  const band = getAccountAgeBand(accountDate);
  return {
    weight: getNegativeAccountWeight(accountDate),
    band,
    bandLabel: BAND_LABELS[band],
    bandColor: BAND_COLORS[band],
    monthsOnReport,
    monthsUntilRemoval,
    lenderImpact: lenderImpactFor(band, monthsUntilRemoval),
    urgency: BAND_URGENCY[band],
  };
}

/**
 * Sum of recency-weighted negative penalties for an array of accounts.
 * Used inside the fundability calculations and exposed on the result so
 * the UI can show "weighted impact score" alongside the raw count.
 */
export function getTotalWeightedNegativeScore(
  negatives: NegativeAccountInput[] | null | undefined,
): number {
  if (!negatives || negatives.length === 0) return 0;
  return negatives
    .filter((n) => n.isActive !== false)
    .reduce((sum, n) => sum + getNegativeAccountWeight(n.date), 0);
}

// ------------------------------------------------------------
// Helpers
// ------------------------------------------------------------

function monthsBetweenIso(iso: string | null | undefined, now = new Date()): number | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  return (now.getFullYear() - d.getFullYear()) * 12 + (now.getMonth() - d.getMonth());
}

function avgFico(p: FundabilityProfileInputs): number | null {
  const arr = [p.ficoEq, p.ficoEx, p.ficoTu].filter((x): x is number => typeof x === "number" && x > 0);
  if (arr.length === 0) return null;
  return Math.round(arr.reduce((a, b) => a + b, 0) / arr.length);
}

/** Map a 300–850 FICO to a 0–100 sub-score. */
function ficoToPct(fico: number): number {
  if (fico >= 800) return 100;
  if (fico >= 760) return 92;
  if (fico >= 740) return 85;
  if (fico >= 720) return 78;
  if (fico >= 700) return 70;
  if (fico >= 680) return 60;
  if (fico >= 660) return 50;
  if (fico >= 640) return 40;
  if (fico >= 620) return 30;
  if (fico >= 580) return 20;
  return 10;
}

function bandFor(score: number, scale: "standard" | "commercial"): { band: FundabilityBand; label: string } {
  if (scale === "commercial") {
    if (score >= 91) return { band: "elite", label: "Elite" };
    if (score >= 76) return { band: "established", label: "Established" };
    if (score >= 61) return { band: "emerging", label: "Emerging" };
    if (score >= 41) return { band: "building", label: "Building" };
    return { band: "not_ready", label: "Not Ready" };
  }
  if (score >= 91) return { band: "excellent", label: "Excellent" };
  if (score >= 76) return { band: "very_good", label: "Very Good" };
  if (score >= 61) return { band: "good", label: "Good" };
  if (score >= 41) return { band: "fair", label: "Fair" };
  return { band: "poor", label: "Poor" };
}

/**
 * Returns the negative penalty value used inside the score calculations.
 * Prefers the weighted model when a `negativeAccounts` array is supplied.
 * Falls back to the legacy 3-points-per-active-negative behaviour when
 * only the raw count is available.
 */
function negativePenaltyFor(p: FundabilityProfileInputs, maxPenalty: number, multiplier: number): {
  penalty: number;
  totalWeighted: number;
} {
  if (Array.isArray(p.negativeAccounts) && p.negativeAccounts.length > 0) {
    const totalWeighted = getTotalWeightedNegativeScore(p.negativeAccounts);
    return {
      penalty: Math.min(maxPenalty, totalWeighted * multiplier),
      totalWeighted: Math.round(totalWeighted * 100) / 100,
    };
  }
  const count = p.activeNegatives ?? 0;
  // Legacy fallback: treat each as 1.0 weight for backward compatibility.
  return {
    penalty: Math.min(maxPenalty, count * multiplier),
    totalWeighted: count,
  };
}

// ------------------------------------------------------------
// Validation gates — these RUN BEFORE any score is calculated.
// ------------------------------------------------------------

export function validateFundabilityInputs(
  type: FundabilityScoreType,
  p: FundabilityProfileInputs,
): { ok: true } | { ok: false; reason: string; cta: { label: string; route: string } } {
  if (type === "personal") {
    if (!p.hasPersonalCreditFile || avgFico(p) == null) {
      return {
        ok: false,
        reason: "Upload your credit report to calculate your Personal Fundability Score.",
        cta: { label: "Upload Credit Report", route: "/app/credit" },
      };
    }
    return { ok: true };
  }

  if (type === "small_business") {
    if (!p.hasPersonalCreditFile || avgFico(p) == null) {
      return {
        ok: false,
        reason: "Upload your credit report to calculate your Small Business Fundability Score.",
        cta: { label: "Upload Credit Report", route: "/app/credit" },
      };
    }
    if (!p.hasBusiness || !p.entityType || !p.formationDate || !p.ein) {
      return {
        ok: false,
        reason: "Complete your Business Profile to calculate your Small Business Fundability Score.",
        cta: { label: "Complete Your Profile", route: "/app/business-profile" },
      };
    }
    return { ok: true };
  }

  // commercial
  const tibMonths = monthsBetweenIso(p.formationDate);
  if (!p.hasBusiness || !p.formationDate || tibMonths == null || tibMonths < 12 || !p.hasBusinessCreditDataPoint) {
    return {
      ok: false,
      reason:
        "EIN-Only funding requires at least 12 months of business history and established business credit. Complete your Business Profile to calculate this score.",
      cta: { label: "Complete Your Profile", route: "/app/business-profile" },
    };
  }
  return { ok: true };
}

// ------------------------------------------------------------
// SCORE 1 — Personal Fundability
// ------------------------------------------------------------

function scorePersonal(p: FundabilityProfileInputs): { score: number; totalWeighted: number } {
  const fico = avgFico(p)!; // gate guarantees non-null
  const ficoPct = ficoToPct(fico);
  // Optional soft adjustments from credit-factor sub-scores.
  const adj =
    (p.utilizationScore ?? 70) * 0.10 +
    (p.paymentHistoryScore ?? 70) * 0.10 +
    (p.inquiryScore ?? 70) * 0.05 +
    (p.creditMixScore ?? 70) * 0.05;
  // Recency-weighted negatives: 3 points per weighted unit, capped at 15.
  const { penalty, totalWeighted } = negativePenaltyFor(p, 15, 3);
  const composite = Math.round(ficoPct * 0.7 + adj * 0.3 - penalty);
  return { score: Math.max(0, Math.min(100, composite)), totalWeighted };
}

// ------------------------------------------------------------
// SCORE 2 — Small Business Fundability (PG required)
// Weights: FICO 50, TIB 15, Entity 10, Bank 10, Biz Credit 15
// Now also applies a recency-weighted negative penalty on top.
// ------------------------------------------------------------

function scoreSmallBusiness(p: FundabilityProfileInputs): { score: number; totalWeighted: number } {
  const fico = avgFico(p)!;
  const ficoPct = ficoToPct(fico);

  const tibMonths = monthsBetweenIso(p.formationDate) ?? 0;
  const tibPct = tibMonths < 12 ? 0 : tibMonths < 24 ? 50 : 100;

  const entity = (p.entityType || "").toLowerCase();
  let entityPct = 20;
  if (entity.includes("llc")) entityPct = 70;
  else if (entity.includes("corp") || entity.includes("s_corp") || entity.includes("c_corp")) entityPct = 100;
  else if (entity.includes("sole")) entityPct = 20;

  const bankPct = p.hasBusinessBankAccount ? 100 : 0;

  let bizCreditPct = 0;
  if (p.hasBusinessCreditDataPoint) {
    const paydex = p.paydex ?? 0;
    const intel = p.intelliscore ?? 0;
    if (paydex >= 80 || intel >= 76) bizCreditPct = 100;
    else if (paydex >= 70 || intel >= 50) bizCreditPct = 70;
    else bizCreditPct = 40;
  }

  // Recency-weighted negative penalty — 4 points per weighted unit, cap 20.
  // PG-required products are sensitive to recent personal derogatory activity.
  const { penalty, totalWeighted } = negativePenaltyFor(p, 20, 4);

  const composite =
    ficoPct * 0.5 +
    tibPct * 0.15 +
    entityPct * 0.10 +
    bankPct * 0.10 +
    bizCreditPct * 0.15 -
    penalty;

  return { score: Math.max(0, Math.min(100, Math.round(composite))), totalWeighted };
}

// ------------------------------------------------------------
// SCORE 3 — Commercial / EIN-Only Fundability
// Weights: Paydex 35, Intelliscore 25, TIB 20, Revenue 15, Bank 5
// Personal negatives don't apply here — pure business profile.
// ------------------------------------------------------------

function scoreCommercial(p: FundabilityProfileInputs): number {
  const paydex = p.paydex ?? 0;
  let paydexPct = 0;
  if (paydex >= 80) paydexPct = paydex > 80 ? 100 : 80;
  else if (paydex >= 70) paydexPct = 50;
  else paydexPct = 0;

  // Experian Business Intelliscore is 1–100 → use directly, clamp.
  const intelPct = Math.max(0, Math.min(100, p.intelliscore ?? 0));

  const tibMonths = monthsBetweenIso(p.formationDate) ?? 0;
  let tibPct = 0;
  if (tibMonths >= 36) tibPct = 100;
  else if (tibMonths >= 24) tibPct = 70;
  else if (tibMonths >= 12) tibPct = 30;

  const rev = p.estimatedAnnualRevenue ?? 0;
  let revPct = 20;
  if (rev >= 500_000) revPct = 100;
  else if (rev >= 100_000) revPct = 60;
  else if (rev > 0) revPct = 20;

  const bankMonths = monthsBetweenIso(p.bankAccountOpenedDate) ?? 0;
  let bankPct = 0;
  if (bankMonths >= 12) bankPct = 100;
  else if (bankMonths >= 6) bankPct = 50;

  const composite =
    paydexPct * 0.35 +
    intelPct * 0.25 +
    tibPct * 0.20 +
    revPct * 0.15 +
    bankPct * 0.05;

  return Math.max(0, Math.min(100, Math.round(composite)));
}

// ------------------------------------------------------------
// Public API — compute a single score with full metadata
// ------------------------------------------------------------

const META: Record<FundabilityScoreType, {
  title: string;
  inputsRequired: string[];
  unlocksByBand: Partial<Record<FundabilityBand, string[]>>;
}> = {
  personal: {
    title: "Personal Fundability",
    inputsRequired: [
      "Personal credit report (≥1 bureau)",
      "Payment history & utilization",
      "Derogatory marks, credit age, mix",
    ],
    unlocksByBand: {
      poor: ["Secured cards", "Credit-builder loans"],
      fair: ["Subprime personal cards", "Small personal loans"],
      good: ["Most personal cards", "Personal lines of credit", "Personal loans for business stacking"],
      very_good: ["Premium personal cards", "Higher personal loan limits", "0% APR offers"],
      excellent: ["Prime personal credit", "Top-tier rewards cards", "Maximum personal loan access"],
    },
  },
  small_business: {
    title: "Small Business Fundability",
    inputsRequired: [
      "Personal credit report (≥1 bureau)",
      "Business profile (entity type, EIN, formation date)",
      "Business bank account status",
      "Business credit file (D&B / Experian Business)",
    ],
    unlocksByBand: {
      poor: ["Microloans only", "CDFI-only options"],
      fair: ["Some BLOC, CDFIs, alternative lenders"],
      good: ["SBA microloans, business credit cards, most BLOCs"],
      very_good: ["SBA 7(a), prime BLOCs, DSCR loans, hard money"],
      excellent: ["Full PG-required market access incl. SBA, prime business cards, large BLOCs"],
    },
  },
  commercial: {
    title: "Commercial / EIN-Only Fundability",
    inputsRequired: [
      "≥12 months in business",
      "Established business credit (Paydex, Intelliscore)",
      "Annual revenue & business bank history",
    ],
    unlocksByBand: {
      not_ready: ["Continue building business credit & bank history"],
      building: ["Net-30 vendor accounts, store cards reporting to business bureaus"],
      emerging: ["Entry-level corporate cards (Ramp/Brex starter), small commercial lines"],
      established: ["Full Ramp/Brex limits, mid-size commercial LOCs, equipment financing"],
      elite: ["Large institutional commercial credit, high-limit corporate cards"],
    },
  },
};

function improvementsFor(type: FundabilityScoreType, p: FundabilityProfileInputs, _score: number): string[] {
  const out: string[] = [];
  if (type === "personal") {
    if ((p.utilizationScore ?? 100) < 70) out.push("Pay revolving balances down below 30% utilization");
    if ((p.activeNegatives ?? p.negativeAccounts?.length ?? 0) > 0)
      out.push("Resolve outstanding negative items with creditors");
    if ((p.paymentHistoryScore ?? 100) < 80) out.push("Maintain 6+ consecutive months of on-time payments");
    if ((p.inquiryScore ?? 100) < 70) out.push("Pause new credit applications for the next 90 days");
    if (out.length === 0) out.push("Maintain current habits and let account age accumulate");
  } else if (type === "small_business") {
    const tib = monthsBetweenIso(p.formationDate) ?? 0;
    if (tib < 24) out.push("Reach 2+ years time in business to unlock SBA tier");
    if ((p.entityType || "").toLowerCase().includes("sole")) out.push("Convert sole prop to LLC or Corporation");
    if (!p.hasBusinessBankAccount) out.push("Open a dedicated business bank account");
    if (!p.hasBusinessCreditDataPoint) out.push("Establish a D-U-N-S file and add 3 reporting net-30 vendors");
    if (avgFico(p)! < 700) out.push("Raise personal FICO above 700 — primary PG driver");
    if (out.length === 0) out.push("Maintain current habits — your PG profile is strong");
  } else {
    const tib = monthsBetweenIso(p.formationDate) ?? 0;
    if (tib < 24) out.push("Continue operating — TIB is a calendar gate for EIN-only products");
    if ((p.paydex ?? 0) < 80) out.push("Pay D&B-reporting vendors early to push Paydex to 80+");
    if ((p.intelliscore ?? 0) < 76) out.push("Add reporting trades to lift Experian Intelliscore");
    if ((p.estimatedAnnualRevenue ?? 0) < 500_000) out.push("Grow annual revenue toward $500K to unlock larger commercial lines");
    const bm = monthsBetweenIso(p.bankAccountOpenedDate) ?? 0;
    if (bm < 12) out.push("Maintain business bank account 12+ months with healthy balances");
    if (out.length === 0) out.push("Maintain reporting cadence — your EIN profile is strong");
  }
  return out.slice(0, 4);
}

function meaningFor(type: FundabilityScoreType, _score: number, band: FundabilityBand): string {
  if (type === "personal") {
    if (band === "poor") return "Significant barriers to personal credit approval right now.";
    if (band === "fair") return "Limited options — credit building should come before stacking.";
    if (band === "good") return "Qualifies for most personal credit products at standard terms.";
    if (band === "very_good") return "Strong approval odds across most lenders and prime cards.";
    return "Prime personal credit — maximum access to personal credit products.";
  }
  if (type === "small_business") {
    if (band === "poor") return "PG-required products will be very limited; build credit first.";
    if (band === "fair") return "Some PG products accessible — focus on credit + entity strengthening.";
    if (band === "good") return "Qualifies for most PG-required products including SBA microloans.";
    if (band === "very_good") return "Strong approval odds for SBA 7(a), DSCR loans, and prime BLOCs.";
    return "Maximum access to PG-required funding including top-tier SBA and bank products.";
  }
  if (band === "not_ready") return "Business credit profile is too thin for EIN-only products today.";
  if (band === "building") return "Some business credit established — keep adding reporting trades.";
  if (band === "emerging") return "Qualifying for entry-level EIN-only products like Ramp / Brex starter.";
  if (band === "established") return "Strong business credit — broad EIN-only access across products.";
  return "Maximum business credit fundability — full institutional EIN-only market.";
}

export function computeFundabilityScore(
  type: FundabilityScoreType,
  p: FundabilityProfileInputs,
): FundabilityScoreResult {
  const meta = META[type];
  const validation = validateFundabilityInputs(type, p);

  if (validation.ok !== true) {
    const v = validation as { ok: false; reason: string; cta: { label: string; route: string } };
    return {
      type,
      title: meta.title,
      score: null,
      band: null,
      bandLabel: null,
      meaning: v.reason,
      unlocks: [],
      improvements: [],
      locked: true,
      lockedReason: v.reason,
      lockedCta: v.cta,
      inputsRequired: meta.inputsRequired,
    };
  }

  let score: number;
  let totalWeightedNegativeScore: number | undefined;

  if (type === "personal") {
    const r = scorePersonal(p);
    score = r.score;
    totalWeightedNegativeScore = r.totalWeighted;
  } else if (type === "small_business") {
    const r = scoreSmallBusiness(p);
    score = r.score;
    totalWeightedNegativeScore = r.totalWeighted;
  } else {
    score = scoreCommercial(p);
  }

  const { band, label } = bandFor(score, type === "commercial" ? "commercial" : "standard");

  return {
    type,
    title: meta.title,
    score,
    band,
    bandLabel: label,
    meaning: meaningFor(type, score, band),
    unlocks: meta.unlocksByBand[band] ?? [],
    improvements: improvementsFor(type, p, score),
    locked: false,
    inputsRequired: meta.inputsRequired,
    totalWeightedNegativeScore,
  };
}

export function computeAllFundabilityScores(p: FundabilityProfileInputs): {
  personal: FundabilityScoreResult;
  small_business: FundabilityScoreResult;
  commercial: FundabilityScoreResult;
} {
  return {
    personal: computeFundabilityScore("personal", p),
    small_business: computeFundabilityScore("small_business", p),
    commercial: computeFundabilityScore("commercial", p),
  };
}
