// ============================================================
// Three-Score Fundability Model + Complete Product Spectrum
// ============================================================
// Replaces the legacy single "overall fundability" number with three
// distinct, gated scores. A score is ONLY returned when the required
// inputs are present — otherwise we return a `locked` result so the
// UI can render a clear "what's missing" CTA instead of a misleading
// number (the Nicholas scenario).
//
// 2026 update — recency-weighted negatives:
//   Banks look back primarily 24 months — a 4-year-old charge-off should
//   not penalize fundability the same as one from 3 months ago. See the
//   `getNegativeAccountWeight` function below.
//
// 2026 update — banking + asset weights (HARD CUTOVER):
//   Personal:        FICO 35 / Pay 20 / Util 10 / Mix 10 / Banking 15 / Liquid 10
//   Small Business:  FICO 40 / TIB 15 / Entity 10 / Bus Banking 15 / Revenue 10 / BizCredit 10
//   Commercial:      Paydex 30 / Intelliscore 20 / TIB 15 / Revenue 15 / BizBanking 10 / BizBalance 10
//
//   When the new banking / asset inputs are NULL, those components score 0.
//   Existing clients will see scores drop until they complete their
//   Financial Profile — by design. This pushes data collection.
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

/**
 * A credit tradeline used for COMPARABLE CREDIT analysis. Sourced from
 * `credit_accounts`. Lender perspective — "do you have proven history with
 * the same product type you're applying for?"
 */
export interface CreditAccountInput {
  /** Lender / creditor display name. */
  creditor?: string | null;
  /** Account type token (e.g. "auto_loan", "mortgage", "credit_card"). */
  type?: string | null;
  /** ISO date string when the tradeline opened. */
  openedOn?: string | Date | null;
  /** ISO date string when the account closed (null if open). */
  closedOn?: string | Date | null;
  /** "open" | "closed" | "charged_off" | "collection" | "current" | etc. */
  status?: string | null;
  /** True if account currently shows a derogatory marker. */
  isNegative?: boolean | null;
  /** Date of the most recent derogatory event (late, charge-off, collection). */
  derogatoryDate?: string | Date | null;
  /** True when this tradeline is on an authorized-user basis (lower lender weight). */
  isAuthorizedUser?: boolean | null;
}

/** Single banking relationship — one row from `banking_relationships`. */
export interface BankingRelationshipInput {
  institutionName?: string | null;
  institutionType?: string | null;
  relationshipType?: string | null;
  monthsAtInstitution?: number | null;
  averageMonthlyBalance?: number | null;
  isPrimaryInstitution?: boolean | null;
  hasDirectDeposit?: boolean | null;
  overdraftCount12mo?: number | null;
  nsfCount12mo?: number | null;
  accountStanding?: string | null; // good | restricted | closed | negative
}

export type LiquidAssetsRange = "under_5k" | "5k_25k" | "25k_100k" | "100k_plus";
export type RealEstateEquityRange = "under_25k" | "25k_100k" | "100k_250k" | "250k_plus";
export type InvestmentRange = "under_10k" | "10k_50k" | "50k_250k" | "250k_plus";
export type MonthlyRevenueRange = "under_5k" | "5k_10k" | "10k_25k" | "25k_50k" | "50k_100k" | "100k_plus";

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

  // ---- NEW: Banking + assets (2026 enhanced model) ----
  /** All banking relationships (personal + business) — feeds banking score. */
  bankingRelationships?: BankingRelationshipInput[] | null;
  /** Snapshot fields from profiles when no relationship rows exist yet. */
  primaryBankMonths?: number | null;
  primaryBankAverageBalance?: number | null;
  hasInvestmentAccounts?: boolean | null;
  investmentRange?: InvestmentRange | null;
  totalLiquidAssetsRange?: LiquidAssetsRange | null;
  hasRealEstateEquity?: boolean | null;
  realEstateEquityRange?: RealEstateEquityRange | null;
  hasEquipmentAssets?: boolean | null;
  hasInvoiceReceivables?: boolean | null;
  monthlyRevenueRange?: MonthlyRevenueRange | null;
  /** Average monthly business banking balance (separate from personal). */
  businessAverageMonthlyBalance?: number | null;

  // ---- Comparable credit (2026) ----
  /** All credit tradelines from credit_accounts — used for product matching. */
  creditAccounts?: CreditAccountInput[] | null;
}

// ============================================================
// Negative Account Age Scoring Model
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
  bandColor: "red" | "amber" | "yellow" | "gray";
  monthsOnReport: number;
  monthsUntilRemoval: number;
  lenderImpact: string;
  urgency: "high" | "medium" | "low" | "monitor";
}

const FCRA_REMOVAL_MONTHS = 84;

function monthsBetween(d: Date | string | null | undefined, now = new Date()): number {
  if (!d) return 0;
  const dt = d instanceof Date ? d : new Date(d);
  if (isNaN(dt.getTime())) return 0;
  return (now.getFullYear() - dt.getFullYear()) * 12 + (now.getMonth() - dt.getMonth());
}

export function getNegativeAccountWeight(accountDate: Date | string | null | undefined): number {
  const months = monthsBetween(accountDate);
  if (months <= 6) return 1.0;
  if (months <= 12) return 0.75;
  if (months <= 18) return 0.50;
  if (months <= 24) return 0.25;
  if (months <= 48) return 0.10;
  if (months <= 84) return 0.05;
  return 0.01;
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
  return {
    penalty: Math.min(maxPenalty, count * multiplier),
    totalWeighted: count,
  };
}

// ============================================================
// NEW — Banking & Liquid Asset sub-scores (0-100)
// ============================================================
// Each component gracefully handles missing inputs by contributing 0
// to the final composite. By the hard-cutover decision: scores drop
// until clients fill in their Financial Profile.
// ============================================================

function tenureScore(months: number | null | undefined): number {
  if (months == null) return 0;
  if (months >= 120) return 100;
  if (months >= 60) return 90;
  if (months >= 24) return 70;
  if (months >= 12) return 50;
  if (months >= 6) return 30;
  return 10;
}

function balanceScore(amount: number | null | undefined): number {
  if (amount == null || amount < 0) return 0;
  if (amount >= 100_000) return 100;
  if (amount >= 50_000) return 95;
  if (amount >= 25_000) return 90;
  if (amount >= 10_000) return 70;
  if (amount >= 5_000) return 50;
  if (amount >= 1_000) return 30;
  return 10;
}

function productDepthScore(count: number): number {
  if (count >= 5) return 100;
  if (count === 4) return 80;
  if (count === 3) return 60;
  if (count === 2) return 40;
  if (count === 1) return 20;
  return 0;
}

function standingScore(nsfCount: number): number {
  if (nsfCount === 0) return 100;
  if (nsfCount <= 2) return 50;
  return 10;
}

const LIQUID_RANGE_SCORE: Record<LiquidAssetsRange, number> = {
  under_5k: 10,
  "5k_25k": 40,
  "25k_100k": 70,
  "100k_plus": 100,
};

const BALANCE_RANGE_TO_AMOUNT: Record<string, number> = {
  // For mapping `primaryBankAverageBalance` if only a range is known.
};

/**
 * Banking relationship score (0-100). Components:
 *   - Primary tenure (20%)
 *   - Avg monthly balance at primary (20%)
 *   - Product depth at primary institution (20%)
 *   - Direct deposit present (10%)
 *   - Account standing (clean NSF history) (10%)
 *   - Investment accounts present (20%)
 *
 * Falls back to profiles snapshot fields when no relationship rows exist.
 * Returns 0 when no banking signal at all — by design (hard cutover).
 */
export function computeBankingRelationshipScore(p: FundabilityProfileInputs): number {
  const rels = p.bankingRelationships ?? [];
  let primary = rels.find((r) => r.isPrimaryInstitution);
  // If no primary flagged, take the longest-tenured row.
  if (!primary && rels.length > 0) {
    primary = [...rels].sort(
      (a, b) => (b.monthsAtInstitution ?? 0) - (a.monthsAtInstitution ?? 0),
    )[0];
  }

  const tenureMonths =
    primary?.monthsAtInstitution ?? p.primaryBankMonths ?? null;
  const avgBalance =
    primary?.averageMonthlyBalance ?? p.primaryBankAverageBalance ?? null;
  const directDeposit = primary?.hasDirectDeposit ?? false;
  const nsfCount = (primary?.nsfCount12mo ?? 0) + (primary?.overdraftCount12mo ?? 0);

  // Product depth — count distinct relationship types at the primary institution.
  let productCount = 0;
  if (primary) {
    const sameInst = rels.filter(
      (r) => r.institutionName === primary?.institutionName,
    );
    productCount = new Set(sameInst.map((r) => r.relationshipType).filter(Boolean)).size;
  }

  const tScore = tenureScore(tenureMonths);
  const bScore = balanceScore(avgBalance);
  const dScore = productDepthScore(productCount);
  const ddScore = directDeposit ? 100 : (tenureMonths ? 40 : 0);
  const stScore = primary ? standingScore(nsfCount) : 0;
  const invScore = p.hasInvestmentAccounts ? 80 : 0;

  // No primary at all → 0 (hard cutover signal).
  if (!primary && tenureMonths == null && avgBalance == null && !p.hasInvestmentAccounts) {
    return 0;
  }

  const composite =
    tScore * 0.20 +
    bScore * 0.20 +
    dScore * 0.20 +
    ddScore * 0.10 +
    stScore * 0.10 +
    invScore * 0.20;

  return Math.max(0, Math.min(100, Math.round(composite)));
}

/**
 * Liquid assets score (0-100). Uses the `total_liquid_assets_range` bucket
 * if present, otherwise infers from primary bank average balance.
 */
export function computeLiquidAssetsScore(p: FundabilityProfileInputs): number {
  if (p.totalLiquidAssetsRange) return LIQUID_RANGE_SCORE[p.totalLiquidAssetsRange];
  // Infer from balance if present.
  const bal = p.primaryBankAverageBalance ?? null;
  if (bal == null) return 0;
  if (bal >= 100_000) return 100;
  if (bal >= 25_000) return 70;
  if (bal >= 5_000) return 40;
  return 10;
}

/** Business banking score: months at business bank + business avg balance. */
function computeBusinessBankingScore(p: FundabilityProfileInputs): number {
  const months = monthsBetweenIso(p.bankAccountOpenedDate);
  const tScore = tenureScore(months);
  const bScore = balanceScore(p.businessAverageMonthlyBalance);
  if (!p.hasBusinessBankAccount && months == null && p.businessAverageMonthlyBalance == null) {
    return 0;
  }
  return Math.round(tScore * 0.6 + bScore * 0.4);
}

const REVENUE_RANGE_SCORE: Record<MonthlyRevenueRange, number> = {
  under_5k: 10,
  "5k_10k": 25,
  "10k_25k": 50,
  "25k_50k": 70,
  "50k_100k": 85,
  "100k_plus": 100,
};

function computeRevenueRangeScore(p: FundabilityProfileInputs): number {
  if (p.monthlyRevenueRange) return REVENUE_RANGE_SCORE[p.monthlyRevenueRange];
  // Fall back to annual revenue.
  const annual = p.estimatedAnnualRevenue ?? 0;
  if (annual >= 1_200_000) return 100;
  if (annual >= 600_000) return 85;
  if (annual >= 300_000) return 70;
  if (annual >= 120_000) return 50;
  if (annual >= 60_000) return 25;
  if (annual > 0) return 10;
  return 0;
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
// SCORE 1 — Personal Fundability (REVISED 2026 weights)
// FICO 35 / Pay 20 / Util 10 / Mix 10 / Banking 15 / Liquid 10
// ------------------------------------------------------------

function scorePersonal(p: FundabilityProfileInputs): { score: number; totalWeighted: number } {
  const fico = avgFico(p)!;
  const ficoPct = ficoToPct(fico);

  const ficoDerivedFloor = ficoPct;
  const util = p.utilizationScore ?? ficoDerivedFloor;
  const pay = p.paymentHistoryScore ?? ficoDerivedFloor;
  const mix = p.creditMixScore ?? ficoDerivedFloor;

  const banking = computeBankingRelationshipScore(p);
  const liquid = computeLiquidAssetsScore(p);

  // Recency-weighted negatives: 3 points per weighted unit, capped at 15.
  const { penalty, totalWeighted } = negativePenaltyFor(p, 15, 3);

  const composite =
    ficoPct * 0.35 +
    pay * 0.20 +
    util * 0.10 +
    mix * 0.10 +
    banking * 0.15 +
    liquid * 0.10 -
    penalty;

  return { score: Math.max(0, Math.min(100, Math.round(composite))), totalWeighted };
}

// ------------------------------------------------------------
// SCORE 2 — Small Business Fundability (REVISED 2026 weights)
// FICO 40 / TIB 15 / Entity 10 / Bus Banking 15 / Revenue 10 / BizCredit 10
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

  const busBanking = computeBusinessBankingScore(p);
  const revenue = computeRevenueRangeScore(p);

  let bizCreditPct = 0;
  if (p.hasBusinessCreditDataPoint) {
    const paydex = p.paydex ?? 0;
    const intel = p.intelliscore ?? 0;
    if (paydex >= 80 || intel >= 76) bizCreditPct = 100;
    else if (paydex >= 70 || intel >= 50) bizCreditPct = 70;
    else bizCreditPct = 40;
  }

  const { penalty, totalWeighted } = negativePenaltyFor(p, 20, 4);

  const composite =
    ficoPct * 0.40 +
    tibPct * 0.15 +
    entityPct * 0.10 +
    busBanking * 0.15 +
    revenue * 0.10 +
    bizCreditPct * 0.10 -
    penalty;

  return { score: Math.max(0, Math.min(100, Math.round(composite))), totalWeighted };
}

// ------------------------------------------------------------
// SCORE 3 — Commercial / EIN-Only Fundability (REVISED 2026 weights)
// Paydex 30 / Intelliscore 20 / TIB 15 / Revenue 15 / BusBanking 10 / BusBalance 10
// ------------------------------------------------------------

function scoreCommercial(p: FundabilityProfileInputs): number {
  const paydex = p.paydex ?? 0;
  let paydexPct = 0;
  if (paydex >= 80) paydexPct = paydex > 80 ? 100 : 80;
  else if (paydex >= 70) paydexPct = 50;
  else paydexPct = 0;

  const intelPct = Math.max(0, Math.min(100, p.intelliscore ?? 0));

  const tibMonths = monthsBetweenIso(p.formationDate) ?? 0;
  let tibPct = 0;
  if (tibMonths >= 36) tibPct = 100;
  else if (tibMonths >= 24) tibPct = 70;
  else if (tibMonths >= 12) tibPct = 30;

  const revPct = computeRevenueRangeScore(p);

  const bankMonths = monthsBetweenIso(p.bankAccountOpenedDate) ?? 0;
  let bankTenurePct = 0;
  if (bankMonths >= 12) bankTenurePct = 100;
  else if (bankMonths >= 6) bankTenurePct = 50;

  const balanceComponent = balanceScore(p.businessAverageMonthlyBalance);

  const composite =
    paydexPct * 0.30 +
    intelPct * 0.20 +
    tibPct * 0.15 +
    revPct * 0.15 +
    bankTenurePct * 0.10 +
    balanceComponent * 0.10;

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
      "Banking relationship + liquid assets (Financial Profile)",
    ],
    unlocksByBand: {
      poor: ["Secured cards", "Credit-builder loans", "Authorized user strategy"],
      fair: ["Subprime personal cards", "Small personal loans", "FHA mortgage path"],
      good: ["Most personal cards", "Conventional mortgage", "Personal lines of credit"],
      very_good: ["Premium personal cards", "Higher personal loan limits", "0% APR offers"],
      excellent: ["Prime personal credit", "Top-tier rewards cards", "Jumbo mortgages"],
    },
  },
  small_business: {
    title: "Small Business Fundability",
    inputsRequired: [
      "Personal credit report (≥1 bureau)",
      "Business profile (entity, EIN, formation date)",
      "Business banking relationship + revenue",
      "Business credit file (D&B / Experian Business)",
    ],
    unlocksByBand: {
      poor: ["Microloans, CDFI, equipment financing"],
      fair: ["Some BLOC, CDFIs, alternative lenders, MCA (last resort)"],
      good: ["SBA microloans", "business credit cards", "most BLOCs"],
      very_good: ["SBA 7(a)", "prime BLOCs", "DSCR loans", "hard money"],
      excellent: ["Full PG-required market access incl. SBA, prime business cards, large BLOCs"],
    },
  },
  commercial: {
    title: "Commercial / EIN-Only Fundability",
    inputsRequired: [
      "≥12 months in business",
      "Established business credit (Paydex, Intelliscore)",
      "Annual revenue + business banking history & balance",
    ],
    unlocksByBand: {
      not_ready: ["Continue building business credit & bank history"],
      building: ["Net-30 vendor accounts", "store cards reporting to business bureaus"],
      emerging: ["Entry-level corporate cards (Ramp/Brex starter)", "small commercial lines"],
      established: ["Full Ramp/Brex limits", "mid-size commercial LOCs", "equipment financing"],
      elite: ["Large institutional commercial credit", "high-limit corporate cards"],
    },
  },
};

function improvementsFor(type: FundabilityScoreType, p: FundabilityProfileInputs, _score: number): string[] {
  const out: string[] = [];
  const activeNegCount = Array.isArray(p.negativeAccounts)
    ? p.negativeAccounts.filter((n) => n.isActive !== false).length
    : (p.activeNegatives ?? 0);

  if (type === "personal") {
    if (p.utilizationScore != null && p.utilizationScore < 70) out.push("Pay revolving balances down below 30% utilization");
    if (activeNegCount > 0) out.push("Resolve outstanding negative items with creditors");
    if (p.paymentHistoryScore != null && p.paymentHistoryScore < 80) out.push("Maintain 6+ consecutive months of on-time payments");
    if (computeBankingRelationshipScore(p) < 50) out.push("Complete your Financial Profile — banking tenure & balances now factor in");
    if (computeLiquidAssetsScore(p) < 40) out.push("Build $5K+ in liquid reserves and document them in Financial Profile");
    if (out.length === 0) out.push("Maintain current habits and let account age accumulate");
  } else if (type === "small_business") {
    const tib = monthsBetweenIso(p.formationDate) ?? 0;
    if (tib < 24) out.push("Reach 2+ years time in business to unlock SBA tier");
    if ((p.entityType || "").toLowerCase().includes("sole")) out.push("Convert sole prop to LLC or Corporation");
    if (computeBusinessBankingScore(p) < 50) out.push("Build business banking tenure (12+ months) & monthly balance");
    if (!p.monthlyRevenueRange && !p.estimatedAnnualRevenue) out.push("Document monthly revenue in Financial Profile");
    if (!p.hasBusinessCreditDataPoint) out.push("Establish a D-U-N-S file and add 3 reporting net-30 vendors");
    if (avgFico(p)! < 700) out.push("Raise personal FICO above 700 — primary PG driver");
    if (out.length === 0) out.push("Maintain current habits — your PG profile is strong");
  } else {
    const tib = monthsBetweenIso(p.formationDate) ?? 0;
    if (tib < 24) out.push("Continue operating — TIB is a calendar gate for EIN-only products");
    if ((p.paydex ?? 0) < 80) out.push("Pay D&B-reporting vendors early to push Paydex to 80+");
    if ((p.intelliscore ?? 0) < 76) out.push("Add reporting trades to lift Experian Intelliscore");
    if (computeRevenueRangeScore(p) < 70) out.push("Grow monthly revenue toward $50K+ to unlock larger commercial lines");
    if (balanceScore(p.businessAverageMonthlyBalance) < 70) out.push("Build & maintain $25K+ average business banking balance");
    if (out.length === 0) out.push("Maintain reporting cadence — your EIN profile is strong");
  }
  return out.slice(0, 4);
}

function meaningFor(type: FundabilityScoreType, _score: number, band: FundabilityBand): string {
  if (type === "personal") {
    if (band === "poor") return "Significant barriers to personal credit approval right now — but credit-building products and asset-backed paths are still available.";
    if (band === "fair") return "Limited options — credit building should come before stacking. FHA mortgage path opens at 580+.";
    if (band === "good") return "Qualifies for most personal credit products at standard terms including conventional mortgages.";
    if (band === "very_good") return "Strong approval odds across most lenders, prime cards, and conventional mortgages.";
    return "Prime personal credit — maximum access including jumbo mortgages, premium rewards cards, and large unsecured lines.";
  }
  if (type === "small_business") {
    if (band === "poor") return "PG-required products will be very limited; consider asset-backed and CDFI options first.";
    if (band === "fair") return "Some PG products accessible — focus on credit + entity strengthening + business banking depth.";
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

// ============================================================
// COMPLETE PRODUCT SPECTRUM ELIGIBILITY
// ============================================================
// Returns a tier-organized eligibility map covering every product
// from Tier 0 credit-building through Tier 4 super-prime + the
// asset-backed parallel path. Designed so Paige and the dashboard
// can render a "no dead ends" view at any starting position.
// ============================================================

export type ProductTier =
  | "tier_0_credit_building"
  | "tier_1_subprime"
  | "tier_2_near_prime"
  | "tier_3_prime"
  | "tier_4_super_prime"
  | "asset_backed";

export type EligibilityStatus =
  | "ready"
  | "almost_ready"
  | "not_qualified_credit_path"
  | "asset_path_available"
  | "always_available";

export interface ProductEligibility {
  productKey: string;
  productName: string;
  tier: ProductTier;
  category: string;
  status: EligibilityStatus;
  qualificationScore: number; // 0-100 fit score
  /** Base approval likelihood BEFORE comparable credit modifier (== qualificationScore). */
  baseApprovalLikelihood?: number;
  /** Approval likelihood AFTER applying comparable credit modifier. 5-95. */
  adjustedApprovalLikelihood?: number;
  /** Comparable credit analysis for this specific product type. */
  comparableCredit?: ComparableCreditResult;
  blockers: string[];
  rateRangeEstimate: string | null;
  recommendedLenders: string[];
  unlocks: string;
  paigeInsight: string;
  reportsTo?: string;
}

export interface CompleteProductEligibility {
  profileSummary: {
    avgFico: number | null;
    bandTier: ProductTier;
    hasRealEstateEquity: boolean;
    hasEquipment: boolean;
    hasReceivables: boolean;
    hasInvestments: boolean;
    monthlyRevenueRange: MonthlyRevenueRange | null;
    bankingScore: number;
    liquidScore: number;
    boaRelationshipBonus: boolean;
    amexRelationshipFlag: boolean;
  };
  byTier: Record<ProductTier, ProductEligibility[]>;
  flatList: ProductEligibility[];
}

function ficoTier(fico: number | null): ProductTier {
  if (fico == null) return "tier_0_credit_building";
  if (fico >= 700) return "tier_4_super_prime";
  if (fico >= 660) return "tier_3_prime";
  if (fico >= 620) return "tier_2_near_prime";
  if (fico >= 500) return "tier_1_subprime";
  return "tier_0_credit_building";
}

function detectBoARelationship(p: FundabilityProfileInputs): boolean {
  const rels = p.bankingRelationships ?? [];
  return rels.some(
    (r) => /bank of america|boa\b/i.test(r.institutionName ?? "") &&
      (r.relationshipType === "checking" || r.relationshipType === "savings" ||
        r.relationshipType === "business_checking"),
  );
}

function detectAmexRelationship(p: FundabilityProfileInputs): boolean {
  const rels = p.bankingRelationships ?? [];
  return rels.some(
    (r) => /american express|amex/i.test(r.institutionName ?? ""),
  );
}

function eqRange(range: LiquidAssetsRange | null | undefined, min: LiquidAssetsRange): boolean {
  if (!range) return false;
  const order: LiquidAssetsRange[] = ["under_5k", "5k_25k", "25k_100k", "100k_plus"];
  return order.indexOf(range) >= order.indexOf(min);
}

function reRange(range: RealEstateEquityRange | null | undefined, min: RealEstateEquityRange): boolean {
  if (!range) return false;
  const order: RealEstateEquityRange[] = ["under_25k", "25k_100k", "100k_250k", "250k_plus"];
  return order.indexOf(range) >= order.indexOf(min);
}

function revRange(range: MonthlyRevenueRange | null | undefined, min: MonthlyRevenueRange): boolean {
  if (!range) return false;
  const order: MonthlyRevenueRange[] = ["under_5k", "5k_10k", "10k_25k", "25k_50k", "50k_100k", "100k_plus"];
  return order.indexOf(range) >= order.indexOf(min);
}

// ============================================================
// COMPARABLE CREDIT ANALYSIS (2026)
// ============================================================
// Lenders weight tradelines that match the product being applied for
// more heavily than unrelated history. A perfect 5-year auto loan
// improves your odds of an auto loan beyond what FICO alone predicts;
// a recent auto charge-off depresses them more than a same-age credit
// card charge-off would.
//
// This module returns a MODIFIER (-25 to +15) applied on top of the
// base product qualification score, plus a plain-English narrative
// the UI and Paige can surface verbatim.
// ============================================================

export type ComparableCreditQuality =
  | "excellent"
  | "good"
  | "mixed"
  | "negative"
  | "none";

export interface ComparableCreditResult {
  hasComparableCredit: boolean;
  comparableAccounts: CreditAccountInput[];
  bestComparableAccount: CreditAccountInput | null;
  worstComparableAccount: CreditAccountInput | null;
  overallQuality: ComparableCreditQuality;
  /** Age band of the most relevant comparable account (months since opened). */
  ageBand: string;
  /** Modifier applied to base approval likelihood. -25..+15. */
  modifierScore: number;
  /** Plain-English explanation written for the client. */
  narrative: string;
  /** How lenders specifically read this for this product type. */
  lenderPerspective: string;
}

const COMPARABLE_TYPE_MAP: Record<string, string[]> = {
  // Auto
  personal_auto_used: ["auto_loan", "auto_lease"],
  personal_auto_new: ["auto_loan", "auto_lease"],
  near_prime_auto: ["auto_loan", "auto_lease"],
  subprime_auto_loan: ["auto_loan", "auto_lease"],
  // Mortgage
  fha_mortgage: ["mortgage", "heloc", "real_estate"],
  va_mortgage: ["mortgage", "heloc", "real_estate"],
  conventional_mortgage: ["mortgage", "heloc", "real_estate"],
  jumbo_mortgage: ["mortgage", "heloc", "real_estate"],
  asset_depletion_mortgage: ["mortgage", "heloc", "real_estate"],
  // Personal cards & loans
  secured_credit_card: ["credit_card", "charge_card"],
  basic_unsecured_card: ["credit_card", "charge_card"],
  rewards_credit_cards: ["credit_card", "charge_card"],
  premium_credit_cards: ["credit_card", "charge_card"],
  subprime_personal_loan: ["personal_loan", "installment_loan"],
  personal_line_of_credit: ["line_of_credit", "personal_loan"],
  // Business cards / lines / SBA
  business_credit_card_pg: ["credit_card", "business_credit_card", "charge_card"],
  bloc_fintech: ["line_of_credit", "business_line_of_credit", "personal_loan"],
  bloc_bank: ["line_of_credit", "business_line_of_credit", "personal_loan"],
  commercial_loc: ["line_of_credit", "business_line_of_credit"],
  sba_express: ["business_loan", "sba_loan", "term_loan", "personal_loan"],
  sba_7a: ["business_loan", "sba_loan", "term_loan", "personal_loan"],
  // DSCR / equipment / specialized
  dscr_loan: ["mortgage", "investment_property_mortgage", "heloc"],
  equipment_financing: ["auto_loan", "equipment_loan", "installment_loan"],
  cre_loan: ["mortgage", "investment_property_mortgage", "heloc"],
};

/** Returns the credit account types that count as "comparable" for a product key. */
export function getComparableCreditTypes(productType: string): string[] {
  return COMPARABLE_TYPE_MAP[productType] ?? [];
}

function normalizeAccountType(t: string | null | undefined): string {
  return (t ?? "").toLowerCase().trim().replace(/\s+/g, "_");
}

function isAccountNegative(a: CreditAccountInput): boolean {
  if (a.isNegative === true) return true;
  const s = (a.status ?? "").toLowerCase();
  return /charg|collect|delinq|late|derog|default|repo/.test(s);
}

function isChargedOff(a: CreditAccountInput): boolean {
  const s = (a.status ?? "").toLowerCase();
  return /charg|repo/.test(s);
}

function accountAgeMonths(a: CreditAccountInput): number {
  return monthsBetween(a.openedOn);
}

function derogatoryAgeMonths(a: CreditAccountInput): number | null {
  const d = a.derogatoryDate ?? null;
  if (!d) return null;
  return monthsBetween(d);
}

function ageBandLabel(months: number): string {
  if (months < 12) return "less than 1 year";
  if (months < 24) return "1–2 years";
  if (months < 60) return `${Math.floor(months / 12)} years`;
  if (months < 120) return `${Math.floor(months / 12)} years`;
  return "10+ years";
}

function pickBest(accounts: CreditAccountInput[]): CreditAccountInput | null {
  if (accounts.length === 0) return null;
  // Best = positive + oldest
  return [...accounts]
    .filter((a) => !isAccountNegative(a))
    .sort((a, b) => accountAgeMonths(b) - accountAgeMonths(a))[0] ?? null;
}

function pickWorst(accounts: CreditAccountInput[]): CreditAccountInput | null {
  const negatives = accounts.filter(isAccountNegative);
  if (negatives.length === 0) return null;
  // Worst = most recent derogatory event
  return [...negatives].sort((a, b) => {
    const am = derogatoryAgeMonths(a) ?? accountAgeMonths(a);
    const bm = derogatoryAgeMonths(b) ?? accountAgeMonths(b);
    return am - bm;
  })[0] ?? null;
}

function productLabel(productType: string): string {
  return productType
    .replace(/_/g, " ")
    .replace(/\bpg\b/i, "PG")
    .replace(/\bsba\b/i, "SBA")
    .replace(/\bdscr\b/i, "DSCR")
    .replace(/\bcre\b/i, "CRE")
    .replace(/\bbloc\b/i, "Business Line of Credit");
}

function buildNarrative(
  productType: string,
  quality: ComparableCreditQuality,
  best: CreditAccountInput | null,
  worst: CreditAccountInput | null,
): { narrative: string; lenderPerspective: string } {
  const label = productLabel(productType);
  const isAuto = /auto/.test(productType);
  const isMortgage = /mortgage|dscr|cre_loan/.test(productType);
  const isCard = /card/.test(productType);
  const isBLOC = /bloc|line_of_credit/.test(productType);

  if (quality === "none") {
    if (isMortgage) {
      return {
        narrative: `You have no prior mortgage history in your credit file — lenders call this a thin file for this product type. This is not disqualifying, but you may be asked for a larger down payment, lower DTI, or stronger cash reserves to compensate for the absence of comparable credit evidence.`,
        lenderPerspective: `Mortgage underwriters look for at least one prior installment tradeline of similar size. Without one, manual underwriting and compensating factors carry the file.`,
      };
    }
    if (isAuto) {
      return {
        narrative: `You have no prior auto financing history. Auto lenders look specifically for a paid-as-agreed auto tradeline — without one you may be quoted slightly higher rates or asked for a larger down payment.`,
        lenderPerspective: `FICO Auto Score 8 weights prior auto behavior heavily. A thin auto file pushes you toward credit-union or captive-financing programs that look at the broader profile.`,
      };
    }
    return {
      narrative: `You have no comparable credit history for ${label}. This is not disqualifying — lenders will fall back to your overall profile — but a directly comparable tradeline would noticeably strengthen this application.`,
      lenderPerspective: `Without comparable history, the underwriter relies more heavily on FICO, DTI, and cash reserves. Building one matching tradeline first can shift the decision.`,
    };
  }

  if (quality === "excellent" && best) {
    const years = Math.max(1, Math.floor(accountAgeMonths(best) / 12));
    if (isAuto) {
      return {
        narrative: `Your ${years}-year perfect auto payment history is your strongest asset for this application. Auto lenders specifically weight existing auto tradelines — this directly improves your approval odds beyond what your FICO score alone would predict.`,
        lenderPerspective: `Auto underwriters using FICO Auto Score 8 read existing on-time auto behavior as the strongest single predictor of repayment. Lead with this.`,
      };
    }
    if (isCard) {
      return {
        narrative: `Your existing credit card history is directly comparable to this application. ${years} year${years === 1 ? "" : "s"} of on-time payments is strong evidence of revolving credit management — exactly what card issuers want to see.`,
        lenderPerspective: `Card issuers weight prior revolving behavior heavily. Long, clean revolving history typically beats a few extra FICO points.`,
      };
    }
    if (isMortgage) {
      return {
        narrative: `Your ${years}-year clean mortgage / real-estate history directly matches what mortgage underwriters look for. This is the strongest possible comparable signal for this product.`,
        lenderPerspective: `A perfect prior mortgage tradeline is the highest-weight comparable for any new mortgage decision — Fannie/Freddie automated underwriting flags this favorably.`,
      };
    }
    return {
      narrative: `Your ${years}-year clean ${label} history is directly comparable to this application and meaningfully improves your approval odds beyond FICO alone.`,
      lenderPerspective: `Lenders treat clean comparable history as a leading indicator of repayment. This is a strategic asset for this application.`,
    };
  }

  if (quality === "good") {
    return {
      narrative: `Your comparable ${label} history is mostly positive with one minor blemish. Lenders see this favorably — established history with isolated issues reads better than a thin or mixed file.`,
      lenderPerspective: `Underwriters expect occasional minor lates over a long history. Continued on-time behavior keeps this in the "approve" lane.`,
    };
  }

  if (quality === "mixed") {
    return {
      narrative: `Your comparable ${label} history is mixed — you have both positive and negative tradelines of this type. Lenders will weigh both, with more recent behavior carrying more weight.`,
      lenderPerspective: `Mixed comparable history pushes the file to manual review. Recency of the most recent positive vs. the most recent negative usually decides the outcome.`,
    };
  }

  // negative
  if (worst) {
    const months = derogatoryAgeMonths(worst) ?? accountAgeMonths(worst);
    const recent = months <= 24;
    const co = isChargedOff(worst);
    const lender = worst.creditor ?? "a prior lender";

    if (co && recent) {
      if (isAuto) {
        return {
          narrative: `You have a recent charge-off on your ${lender} auto account. For auto lenders this specific negative carries more weight than other items on your file because it is directly comparable to what you are applying for. Your best path right now is specialized subprime auto lenders who work with recent auto negatives, buy-here-pay-here to rebuild the comparable history, or waiting until the negative ages past 24 months.`,
          lenderPerspective: `Auto underwriters auto-decline most files with a comparable charge-off in the last 24 months. Subprime/specialty lenders are the realistic channel until this ages.`,
        };
      }
      if (isBLOC) {
        return {
          narrative: `Your charged-off ${worst.type ?? "personal loan"} from roughly ${months} month${months === 1 ? "" : "s"} ago signals unsecured credit risk to business line lenders who use your personal credit as a PG. This is the same category of obligation, so it carries extra weight on this application.`,
          lenderPerspective: `Business LOC underwriters read a recent unsecured charge-off as a direct signal about PG repayment behavior — this typically blocks bank LOCs and pushes the file toward fintech with collateral or revenue-share structures.`,
        };
      }
      return {
        narrative: `You have a charged-off ${label.toLowerCase()} account from roughly ${months} month${months === 1 ? "" : "s"} ago. Comparable charge-offs carry the heaviest weight in lender decisions for this same product type.`,
        lenderPerspective: `Most lenders auto-decline comparable charge-offs inside 24 months. The realistic path is specialty / second-chance lenders or waiting for the account to age out of the primary lookback window.`,
      };
    }

    if (recent) {
      if (isAuto) {
        return {
          narrative: `Your recent late payment on your ${lender} auto loan is a significant concern for auto lenders. This type of negative comparable credit — the same product type you are applying for — carries more weight than other negatives on your file.`,
          lenderPerspective: `Auto lenders read a recent comparable late as a direct signal about auto loan repayment behavior. Expect higher pricing or larger down payment until this ages.`,
        };
      }
      return {
        narrative: `Your recent negative on your ${lender} ${worst.type ?? label.toLowerCase()} account carries extra weight here because it is the same product type you are applying for. Lenders treat comparable negatives as a stronger signal than unrelated ones.`,
        lenderPerspective: `Comparable recent negatives push files into stricter underwriting. Address this account or wait for it to age past 24 months for the strongest improvement.`,
      };
    }

    return {
      narrative: `You have a comparable negative on your ${lender} account from roughly ${Math.floor(months / 12)} year${months >= 24 ? "s" : ""} ago. The age helps — it is outside the most aggressive 24-month lookback window — but lenders will still note it on this specific product.`,
      lenderPerspective: `Aged comparable negatives are tolerated by most lenders but may slightly increase pricing or documentation requirements.`,
    };
  }

  return {
    narrative: `Your comparable ${label} history shows negative items that affect this application.`,
    lenderPerspective: `Comparable negatives carry extra weight for this product type.`,
  };
}

/**
 * Scores a client's credit accounts against the requested product type
 * and returns a modifier (-25..+15) applied on top of base approval odds.
 */
export function getComparableCreditScore(
  accounts: CreditAccountInput[] | null | undefined,
  productType: string,
): ComparableCreditResult {
  const targetTypes = getComparableCreditTypes(productType);
  const all = Array.isArray(accounts) ? accounts : [];
  const comparable = all.filter((a) => {
    const t = normalizeAccountType(a.type);
    return targetTypes.some((tt) => t === tt || t.includes(tt) || tt.includes(t));
  });

  const best = pickBest(comparable);
  const worst = pickWorst(comparable);
  const ageMonths = best ? accountAgeMonths(best) : (worst ? accountAgeMonths(worst) : 0);

  if (comparable.length === 0) {
    const { narrative, lenderPerspective } = buildNarrative(productType, "none", null, null);
    return {
      hasComparableCredit: false,
      comparableAccounts: [],
      bestComparableAccount: null,
      worstComparableAccount: null,
      overallQuality: "none",
      ageBand: "no comparable history",
      modifierScore: 0,
      narrative,
      lenderPerspective,
    };
  }

  const negatives = comparable.filter(isAccountNegative);
  const positives = comparable.filter((a) => !isAccountNegative(a));
  const seasoned = positives.filter((a) => accountAgeMonths(a) >= 12);

  let quality: ComparableCreditQuality;
  let modifier: number;

  const recentChargeOff = negatives.find(
    (a) => isChargedOff(a) && (derogatoryAgeMonths(a) ?? accountAgeMonths(a)) <= 24,
  );
  const recentNeg = negatives.find(
    (a) => (derogatoryAgeMonths(a) ?? accountAgeMonths(a)) <= 24,
  );
  const olderNeg = negatives.find(
    (a) => (derogatoryAgeMonths(a) ?? accountAgeMonths(a)) > 24,
  );

  if (recentChargeOff) {
    quality = "negative";
    modifier = -25;
  } else if (recentNeg) {
    quality = "negative";
    modifier = -20;
  } else if (olderNeg && positives.length === 0) {
    quality = "negative";
    modifier = -10;
  } else if (negatives.length > 0 && positives.length > 0) {
    quality = "mixed";
    modifier = -5;
  } else if (seasoned.length >= 1 && negatives.length === 0) {
    // excellent vs good — excellent requires 12mo+ AND all clean
    quality = "excellent";
    modifier = 15;
  } else if (positives.length > 0 && negatives.length === 0) {
    quality = "good";
    modifier = 8;
  } else {
    quality = "mixed";
    modifier = 0;
  }

  const { narrative, lenderPerspective } = buildNarrative(productType, quality, best, worst);

  return {
    hasComparableCredit: true,
    comparableAccounts: comparable,
    bestComparableAccount: best,
    worstComparableAccount: worst,
    overallQuality: quality,
    ageBand: ageBandLabel(ageMonths),
    modifierScore: modifier,
    narrative,
    lenderPerspective,
  };
}

function applyComparableCredit(p: ProductEligibility, accounts: CreditAccountInput[] | null | undefined): ProductEligibility {
  const cc = getComparableCreditScore(accounts, p.productKey);
  const base = p.qualificationScore;
  const adjusted = Math.max(5, Math.min(95, base + cc.modifierScore));
  return {
    ...p,
    baseApprovalLikelihood: base,
    adjustedApprovalLikelihood: adjusted,
    comparableCredit: cc,
  };
}

/**
 * Builds the full product eligibility map. Designed to never return an
 * empty list — Tier 0 products are always included so every client has
 * a starting point.
 */
export function getCompleteProductEligibility(p: FundabilityProfileInputs): CompleteProductEligibility {
  const fico = avgFico(p);
  const tier = ficoTier(fico);
  const boa = detectBoARelationship(p);
  const amex = detectAmexRelationship(p);
  const banking = computeBankingRelationshipScore(p);
  const liquid = computeLiquidAssetsScore(p);
  const tibMonths = monthsBetweenIso(p.formationDate) ?? 0;

  const flatList: ProductEligibility[] = [];
  const push = (e: ProductEligibility) => flatList.push(e);

  // ============== TIER 0 — CREDIT BUILDING (always available) ==============
  push({
    productKey: "secured_credit_card",
    productName: "Secured Credit Card",
    tier: "tier_0_credit_building",
    category: "Credit Building",
    status: "always_available",
    qualificationScore: 100,
    blockers: [],
    rateRangeEstimate: "23–28% APR (purchases) — pay statement balance to avoid interest",
    recommendedLenders: ["Discover it Secured", "Capital One Platinum Secured", "Chime Credit Builder", "OpenSky (no credit check)"],
    unlocks: "First step toward unsecured credit. Discover it Secured graduates to unsecured at 7 months with good behavior.",
    paigeInsight: "Discover it Secured is the gold standard starter card — automatic graduation review at 7 months and your deposit comes back. OpenSky requires NO credit check, making it accessible from any starting point.",
    reportsTo: "All three bureaus",
  });
  push({
    productKey: "credit_builder_loan",
    productName: "Credit Builder Loan",
    tier: "tier_0_credit_building",
    category: "Credit Building",
    status: "always_available",
    qualificationScore: 100,
    blockers: [],
    rateRangeEstimate: "$15–48/mo payment depending on amount/term",
    recommendedLenders: ["Self Inc.", "Credit Strong", "Local credit unions"],
    unlocks: "Adds installment loan to credit mix — FICO weights revolving and installment separately.",
    paigeInsight: "Combining a secured card with a credit builder loan builds revolving AND installment history simultaneously. This is the fastest two-tradeline foundation.",
    reportsTo: "All three bureaus",
  });
  push({
    productKey: "authorized_user_strategy",
    productName: "Authorized User Strategy",
    tier: "tier_0_credit_building",
    category: "Credit Building",
    status: "always_available",
    qualificationScore: 100,
    blockers: ["Requires a trusted person with seasoned, low-utilization credit"],
    rateRangeEstimate: null,
    recommendedLenders: ["Family member or trusted friend with 5+ year card, 0% utilization, perfect history"],
    unlocks: "Inherits the primary cardholder's full history on that account — instant aged tradeline.",
    paigeInsight: "Being added to a 5+ year card with zero late payments and low utilization adds significant positive history fast. The physical card doesn't need to be used — history appears regardless. Avoid paid tradeline services (legal/ethical risk).",
  });

  // ============== TIER 1 — SUBPRIME (500-619) ==============
  const inSubprime = fico != null && fico < 620;
  push({
    productKey: "subprime_auto_loan",
    productName: "Subprime Auto Loan",
    tier: "tier_1_subprime",
    category: "Auto Financing",
    status: inSubprime ? "ready" : (fico != null && fico >= 500 ? "ready" : "not_qualified_credit_path"),
    qualificationScore: fico != null && fico >= 500 ? 80 : 0,
    blockers: fico != null && fico >= 500 ? ["High APR — 15-29% will significantly increase total cost"] : ["FICO below 500 — focus on Tier 0 products first"],
    rateRangeEstimate: "15–29% APR",
    recommendedLenders: ["DriveTime", "CarMax Auto Finance", "Credit Acceptance Corp", "Local buy-here-pay-here"],
    unlocks: "Vehicle access at any credit level — but at significant interest cost.",
    paigeInsight: "Subprime auto loans can make a $15K car cost $25K. If possible, build credit 12-18 months first to move to near-prime tier. If you must buy now, put as much down as possible to reduce total interest cost. FICO Auto Score 8 used — varies 40-60 points from standard FICO 8.",
  });
  push({
    productKey: "subprime_personal_loan",
    productName: "Subprime Personal Loan",
    tier: "tier_1_subprime",
    category: "Personal Loans",
    status: fico != null && fico >= 500 ? "ready" : "not_qualified_credit_path",
    qualificationScore: fico != null && fico >= 500 ? 70 : 0,
    blockers: fico != null && fico < 500 ? ["FICO below 500 minimum"] : ["18-36% APR — not a funding strategy tool"],
    rateRangeEstimate: "18–36% APR",
    recommendedLenders: ["OneMain Financial", "Oportun", "Avant", "LendingPoint"],
    unlocks: "Emergency liquidity or debt consolidation only.",
    paigeInsight: "Useful for consolidating higher-rate debt or emergencies. NOT a funding strategy. Pay off aggressively.",
  });
  push({
    productKey: "cdfi_microloan",
    productName: "CDFI / SBA Microloan",
    tier: "tier_1_subprime",
    category: "Business Funding",
    status: p.hasBusiness ? "ready" : "almost_ready",
    qualificationScore: p.hasBusiness ? 80 : 50,
    blockers: p.hasBusiness ? [] : ["Need business entity established"],
    rateRangeEstimate: "6.5–13% APR (SBA Microloan)",
    recommendedLenders: ["Accion Opportunity Fund", "LiftFund", "Grameen America", "Local CDFIs"],
    unlocks: "Up to $50K business capital with flexible credit requirements.",
    paigeInsight: "CDFIs serve entrepreneurs traditional banks turn away. If you've been denied for business financing but have a viable business, a CDFI may be your bridge to conventional financing.",
  });
  push({
    productKey: "payday_alternative_loan",
    productName: "Payday Alternative Loan (PAL)",
    tier: "tier_1_subprime",
    category: "Emergency Liquidity",
    status: "almost_ready",
    qualificationScore: 60,
    blockers: ["Must be a credit union member"],
    rateRangeEstimate: "Capped at 28% APR (federal limit)",
    recommendedLenders: ["Local credit unions"],
    unlocks: "Up to $2,000 emergency cash without payday-loan trap.",
    paigeInsight: "If you're a credit union member and need emergency cash, PALs are far better than payday loans. Federal cap at 28%. Many credit unions offer credit builder products alongside.",
  });

  // ============== TIER 2 — NEAR-PRIME (620-659) ==============
  const inNearPrime = fico != null && fico >= 620;
  push({
    productKey: "fha_mortgage",
    productName: "FHA Mortgage",
    tier: "tier_2_near_prime",
    category: "Mortgage",
    status: fico != null && fico >= 580 ? "ready" : (fico != null && fico >= 500 ? "almost_ready" : "not_qualified_credit_path"),
    qualificationScore: fico != null && fico >= 580 ? 90 : (fico != null && fico >= 500 ? 50 : 0),
    blockers: fico != null && fico < 500 ? ["FICO below 500 minimum"] : (fico != null && fico < 580 ? ["10% down required at 500-579 FICO"] : []),
    rateRangeEstimate: "Market rate + 0.25-0.5% over conventional + MIP",
    recommendedLenders: ["Most banks and credit unions", "Rocket Mortgage", "Chase", "Wells Fargo"],
    unlocks: "Most accessible path to homeownership. 3.5% down at 580+.",
    paigeInsight: "FHA is the most accessible mortgage for clients rebuilding credit. 3.5% down is the lowest of any conventional program. Tradeoff is MIP — refinance to conventional at 20% equity to remove it.",
  });
  push({
    productKey: "va_mortgage",
    productName: "VA Mortgage",
    tier: "tier_2_near_prime",
    category: "Mortgage",
    status: fico != null && fico >= 580 ? "ready" : "not_qualified_credit_path",
    qualificationScore: fico != null && fico >= 580 ? 95 : 0,
    blockers: ["VA eligibility required (military service)"],
    rateRangeEstimate: "Often best rates available — no PMI",
    recommendedLenders: ["Veterans United", "Navy Federal", "USAA", "Most VA-approved lenders"],
    unlocks: "Zero down, no PMI, residual income calculation instead of strict DTI.",
    paigeInsight: "Most powerful mortgage product available to eligible veterans — no down payment, no PMI, competitive rates. If you have military service, this is always the first mortgage option to explore.",
  });
  push({
    productKey: "near_prime_auto",
    productName: "Near-Prime Auto Loan",
    tier: "tier_2_near_prime",
    category: "Auto Financing",
    status: inNearPrime ? "ready" : "almost_ready",
    qualificationScore: inNearPrime ? 85 : 30,
    blockers: inNearPrime ? [] : [`Need FICO 620+ (currently ${fico ?? "N/A"})`],
    rateRangeEstimate: "8–15% APR",
    recommendedLenders: ["Capital One Auto Navigator", "Local credit unions", "PenFed", "LightStream (660+)"],
    unlocks: "Roughly half the rate of subprime tier.",
    paigeInsight: "Crossing 620 cuts your auto rate roughly in half vs subprime. If you're at 610-619, it may be worth waiting 30-60 days to optimize utilization and cross that threshold.",
  });

  // ============== TIER 3 — PRIME (660-699) ==============
  const inPrime = fico != null && fico >= 660;
  push({
    productKey: "conventional_mortgage",
    productName: "Conventional Mortgage",
    tier: "tier_3_prime",
    category: "Mortgage",
    status: fico != null && fico >= 660 ? "ready" : (fico != null && fico >= 620 ? "almost_ready" : "not_qualified_credit_path"),
    qualificationScore: fico != null && fico >= 720 ? 100 : (inPrime ? 75 : 30),
    blockers: fico != null && fico < 620 ? ["FICO below 620 floor"] : (fico != null && fico < 660 ? ["Most lenders practical minimum is 640-660"] : []),
    rateRangeEstimate: "Market rate (best at 720+)",
    recommendedLenders: ["Chase", "Wells Fargo", "Rocket Mortgage", "Local banks & credit unions"],
    unlocks: "Standard mortgage market with no MIP at 20% down. 2026: VantageScore 4.0 now accepted alongside FICO.",
    paigeInsight: "2026 update: Fannie Mae and Freddie Mac now accept VantageScore 4.0 alongside FICO — rent and utility payment history can now factor into mortgage approval for thin-file borrowers.",
  });
  push({
    productKey: "rewards_credit_cards",
    productName: "Rewards Credit Cards",
    tier: "tier_3_prime",
    category: "Credit Cards",
    status: inPrime ? "ready" : "almost_ready",
    qualificationScore: inPrime ? 90 : 40,
    blockers: inPrime ? [] : [`Need FICO 660+ (currently ${fico ?? "N/A"})`],
    rateRangeEstimate: "18–26% APR (pay in full)",
    recommendedLenders: ["Chase Freedom Flex", "Bank of America Cash Rewards", "Citi Double Cash", "Discover it Cash Back"],
    unlocks: "Real cash back/points with no annual fee. The first tier where credit-building generates tangible returns.",
    paigeInsight: boa
      ? "Your Bank of America deposit relationship is a strategic asset — BoA allows up to 7 new card applications in 12 months for deposit customers vs only 3 without. This unlocks aggressive card stacking."
      : "Crossing 660 opens the mainstream rewards card tier. These are no-annual-fee cards that earn meaningful cash back.",
  });
  push({
    productKey: "personal_line_of_credit",
    productName: "Personal Line of Credit",
    tier: "tier_3_prime",
    category: "Personal Credit",
    status: inPrime && banking >= 50 ? "ready" : (inPrime ? "almost_ready" : "not_qualified_credit_path"),
    qualificationScore: inPrime ? 75 : 30,
    blockers: inPrime ? (banking < 50 ? ["Strengthen banking relationship"] : []) : [`Need FICO 660+ (currently ${fico ?? "N/A"})`],
    rateRangeEstimate: "10–18% APR variable",
    recommendedLenders: ["Wells Fargo", "Citibank", "US Bank", "SoFi"],
    unlocks: "$3,000-$100,000 unsecured depending on income and credit.",
    paigeInsight: "Personal LOCs reward banking relationships. Your existing bank is usually the easiest approval path.",
  });
  push({
    productKey: "heloc",
    productName: "HELOC",
    tier: "tier_3_prime",
    category: "Real Estate",
    status: p.hasRealEstateEquity && fico != null && fico >= 620 ? "ready" : "not_qualified_credit_path",
    qualificationScore: p.hasRealEstateEquity && fico != null && fico >= 680 ? 90 : (p.hasRealEstateEquity && fico != null && fico >= 620 ? 60 : 0),
    blockers: !p.hasRealEstateEquity ? ["No home equity reported"] : (fico != null && fico < 620 ? ["FICO below 620 minimum"] : []),
    rateRangeEstimate: "Prime + 1-3% variable",
    recommendedLenders: ["PNC", "Chase", "TD Bank", "Local credit unions"],
    unlocks: "Tax-advantaged borrowing against home equity for major projects or business capital.",
    paigeInsight: "Combined LTV (mortgage + HELOC) typically can't exceed 85%. HELOC interest may be tax-deductible if used for home improvements.",
  });

  // ============== TIER 4 — SUPER-PRIME (700+) ==============
  const inSuperPrime = fico != null && fico >= 700;
  push({
    productKey: "jumbo_mortgage",
    productName: "Jumbo Mortgage",
    tier: "tier_4_super_prime",
    category: "Mortgage",
    status: fico != null && fico >= 720 ? "ready" : (inSuperPrime ? "almost_ready" : "not_qualified_credit_path"),
    qualificationScore: fico != null && fico >= 740 ? 100 : (inSuperPrime ? 70 : 0),
    blockers: !inSuperPrime ? [`Need FICO 700+ (currently ${fico ?? "N/A"})`] : (liquid < 70 ? ["Need 12 months of payment reserves"] : []),
    rateRangeEstimate: "Market rate (best at 740+)",
    recommendedLenders: ["Chase Private Client", "Wells Fargo Private Bank", "Bank of America Preferred Rewards"],
    unlocks: "Loans above conforming limits ($806,500 in 2026 for most areas).",
    paigeInsight: "Jumbo requires 12 months of payment reserves and 36-month lookback. Banking relationship strength matters significantly.",
  });
  push({
    productKey: "premium_credit_cards",
    productName: "Premium Credit Cards",
    tier: "tier_4_super_prime",
    category: "Credit Cards",
    status: fico != null && fico >= 720 ? "ready" : (inSuperPrime ? "almost_ready" : "not_qualified_credit_path"),
    qualificationScore: fico != null && fico >= 720 ? 95 : (inSuperPrime ? 60 : 0),
    blockers: !inSuperPrime ? [`Need FICO 720+ (currently ${fico ?? "N/A"})`] : [],
    rateRangeEstimate: "$95–$695 annual fee — value comes from rewards/perks",
    recommendedLenders: ["Chase Sapphire Reserve", "Amex Platinum", "Capital One Venture X", "Citi Prestige"],
    unlocks: "Premium travel benefits, lounge access, statement credits offsetting annual fees.",
    paigeInsight: amex
      ? "Your existing Amex relationship strengthens approval odds for premium Amex products. Adding an Amex savings account through American Express National Bank further deepens that relationship profile."
      : "Premium cards reward existing relationships. If targeting Amex Platinum, opening any Amex card first builds relationship history.",
  });
  push({
    productKey: "large_personal_lines",
    productName: "Large Personal Lines of Credit",
    tier: "tier_4_super_prime",
    category: "Personal Credit",
    status: fico != null && fico >= 720 && liquid >= 70 ? "ready" : (inSuperPrime ? "almost_ready" : "not_qualified_credit_path"),
    qualificationScore: fico != null && fico >= 720 && liquid >= 70 ? 95 : (inSuperPrime ? 60 : 0),
    blockers: !inSuperPrime ? [`Need FICO 720+ (currently ${fico ?? "N/A"})`] : (liquid < 70 ? ["Need documented strong income/assets"] : []),
    rateRangeEstimate: "8–14% APR",
    recommendedLenders: ["LightStream (Truist)", "SoFi", "Marcus by Goldman Sachs"],
    unlocks: "$50K-$250K unsecured at 720+ with strong income.",
    paigeInsight: "LightStream offers some of the lowest rates in the unsecured market for super-prime borrowers with strong income.",
  });

  // ============== ASSET-BACKED — Collateral replaces credit ==============
  push({
    productKey: "hard_money",
    productName: "Hard Money Loan",
    tier: "asset_backed",
    category: "Real Estate",
    status: p.hasRealEstateEquity ? "asset_path_available" : "not_qualified_credit_path",
    qualificationScore: p.hasRealEstateEquity ? 85 : 10,
    blockers: !p.hasRealEstateEquity ? ["Real estate equity required"] : [],
    rateRangeEstimate: "8–15% short-term (6-24 months)",
    recommendedLenders: ["Kiavi", "Groundfloor", "Lima One Capital", "Local private lenders"],
    unlocks: "Fix-and-flip, bridge financing, distressed property — credit score barely matters.",
    paigeInsight: "Hard money is asset math, not credit math. If the property has enough equity and the deal makes sense, credit score is secondary. This is why real estate is a powerful wealth-building tool regardless of credit history.",
  });
  push({
    productKey: "fix_and_flip",
    productName: "Fix & Flip Loan",
    tier: "asset_backed",
    category: "Real Estate",
    status: p.hasRealEstateEquity || (fico != null && fico >= 600) ? "asset_path_available" : "not_qualified_credit_path",
    qualificationScore: fico != null && fico >= 600 ? 80 : 40,
    blockers: fico != null && fico < 600 ? ["Most fix & flip lenders want 600+ FICO"] : [],
    rateRangeEstimate: "8–13% + points",
    recommendedLenders: ["Kiavi", "Lima One Capital", "RCN Capital"],
    unlocks: "Up to 90% LTC covering purchase + rehab. ARV-based underwriting.",
    paigeInsight: "Fix-and-flip lenders look at completed property value (ARV), not just your credit. A 580 FICO borrower with a great deal in a strong market can often get funded while a 750 FICO borrower with a weak deal gets declined.",
  });
  push({
    productKey: "dscr_loan",
    productName: "DSCR Loan",
    tier: "asset_backed",
    category: "Real Estate",
    status: fico != null && fico >= 620 ? "asset_path_available" : "not_qualified_credit_path",
    qualificationScore: fico != null && fico >= 680 ? 95 : (fico != null && fico >= 620 ? 70 : 0),
    blockers: fico != null && fico < 620 ? ["Need FICO 620+ minimum"] : [],
    rateRangeEstimate: "Market + 0.5-1.5%",
    recommendedLenders: ["Kiavi", "Visio Lending", "Angel Oak", "New American Funding"],
    unlocks: "Investment property financing based on rent coverage — NO personal income verification.",
    paigeInsight: "DSCR is the most powerful real estate financing tool for entrepreneurs because it qualifies based on the property's income, not yours. No tax returns, no W-2s, no employment verification. If rent covers the mortgage, the deal can get done.",
  });
  push({
    productKey: "equipment_financing",
    productName: "Equipment Financing",
    tier: "asset_backed",
    category: "Business Funding",
    status: p.hasEquipmentAssets || p.hasBusiness ? "asset_path_available" : "not_qualified_credit_path",
    qualificationScore: fico != null && fico >= 620 ? 90 : (fico != null && fico >= 580 ? 70 : 40),
    blockers: fico != null && fico < 580 ? ["Most equipment lenders want 580+ FICO"] : [],
    rateRangeEstimate: "7–18% APR (2-7 year terms)",
    recommendedLenders: ["Crest Capital", "Balboa Capital", "Currency Capital", "Direct manufacturer financing"],
    unlocks: "80-100% of equipment cost. Equipment itself is collateral. Section 179 tax deduction available.",
    paigeInsight: "Equipment financing is one of the most accessible business funding products because the equipment itself is collateral. A 600 FICO entrepreneur can finance $100K in equipment that would be impossible to get unsecured.",
  });
  push({
    productKey: "invoice_factoring",
    productName: "Invoice Factoring / AR Financing",
    tier: "asset_backed",
    category: "Business Funding",
    status: p.hasInvoiceReceivables ? "asset_path_available" : "not_qualified_credit_path",
    qualificationScore: p.hasInvoiceReceivables ? 95 : 0,
    blockers: !p.hasInvoiceReceivables ? ["No outstanding receivables reported"] : [],
    rateRangeEstimate: "1-5% per invoice (no APR — fee-based)",
    recommendedLenders: ["BlueVine", "Fundbox", "altLINE", "Triumph Business Capital"],
    unlocks: "70-90% of invoice value advanced immediately. YOUR clients' creditworthiness matters, not yours.",
    paigeInsight: "If your business has outstanding invoices from creditworthy companies, you can turn those invoices into cash regardless of YOUR credit score. The factor is really lending against your clients' creditworthiness.",
  });
  push({
    productKey: "po_financing",
    productName: "Purchase Order Financing",
    tier: "asset_backed",
    category: "Business Funding",
    status: p.hasBusiness && revRange(p.monthlyRevenueRange, "10k_25k") ? "asset_path_available" : "not_qualified_credit_path",
    qualificationScore: p.hasBusiness ? 70 : 30,
    blockers: !p.hasBusiness ? ["Need business entity"] : [],
    rateRangeEstimate: "1.5-6% per month of fulfillment",
    recommendedLenders: ["King Trade Capital", "Liquid Capital", "Capital Plus Financial"],
    unlocks: "Finances cost of fulfilling large purchase orders. Supplier and customer creditworthiness primary.",
    paigeInsight: "If you have a large purchase order you can't afford to fulfill, PO financing bridges that gap. You get the order, the PO financer pays your supplier, you deliver, your buyer pays the financer, you keep the spread.",
  });
  push({
    productKey: "revenue_based_financing",
    productName: "Revenue-Based Financing",
    tier: "asset_backed",
    category: "Business Funding",
    status: revRange(p.monthlyRevenueRange, "10k_25k") ? "asset_path_available" : "not_qualified_credit_path",
    qualificationScore: revRange(p.monthlyRevenueRange, "25k_50k") ? 85 : (revRange(p.monthlyRevenueRange, "10k_25k") ? 60 : 0),
    blockers: !revRange(p.monthlyRevenueRange, "10k_25k") ? ["Typically need $10K+/mo revenue"] : [],
    rateRangeEstimate: "Effective 20-50% (revenue-based, not fixed)",
    recommendedLenders: ["Clearco", "Pipe", "Capchase (SaaS)", "Lighter Capital"],
    unlocks: "Revenue-share repayment — slow months mean smaller payments.",
    paigeInsight: "More entrepreneur-friendly than MCA because repayment scales with revenue. Still expensive but more predictable than fixed daily MCA withdrawals.",
  });
  push({
    productKey: "merchant_cash_advance",
    productName: "Merchant Cash Advance (MCA)",
    tier: "asset_backed",
    category: "Business Funding (Last Resort)",
    status: revRange(p.monthlyRevenueRange, "10k_25k") ? "asset_path_available" : "not_qualified_credit_path",
    qualificationScore: 40,
    blockers: ["⚠️ HIGHEST cost financing — exhaust all other options first"],
    rateRangeEstimate: "Factor rate 1.1-1.5 (effective 40-150% APR)",
    recommendedLenders: ["Last resort only — Lendio marketplace, OnDeck, Kabbage"],
    unlocks: "Fastest funding speed (often 24-48 hours) — use only for genuine emergency cash flow gaps.",
    paigeInsight: "⚠️ MCA carries the highest effective cost of any business financing. Factor rates of 1.2-1.5 = 40-150% APR or higher. Last resort tool for immediate cash flow gaps, NOT a growth strategy. Always exhaust other options first. Pay off as quickly as possible and refinance into conventional products as soon as credit allows.",
  });
  push({
    productKey: "asset_depletion_mortgage",
    productName: "Asset Depletion Mortgage",
    tier: "asset_backed",
    category: "Mortgage",
    status: eqRange(p.totalLiquidAssetsRange, "100k_plus") || p.hasInvestmentAccounts ? "asset_path_available" : "not_qualified_credit_path",
    qualificationScore: fico != null && fico >= 680 && eqRange(p.totalLiquidAssetsRange, "100k_plus") ? 90 : 40,
    blockers: fico != null && fico < 680 ? ["Most lenders want 680+ FICO"] : (!eqRange(p.totalLiquidAssetsRange, "100k_plus") ? ["Need significant liquid assets"] : []),
    rateRangeEstimate: "Conventional + 0.25-0.75%",
    recommendedLenders: ["Angel Oak", "Carrington Mortgage", "Acra Lending", "Local portfolio lenders"],
    unlocks: "Converts wealth into qualifying income — for retired/HNW clients with low documented W-2 income.",
    paigeInsight: "Lender divides total assets by loan term to create imputed income. Example: $1M ÷ 360 months = $2,778/mo qualifying income. Opens conventional financing for entrepreneurs who can't show traditional W-2 income.",
  });

  // Group by tier
  const byTier: Record<ProductTier, ProductEligibility[]> = {
    tier_0_credit_building: [],
    tier_1_subprime: [],
    tier_2_near_prime: [],
    tier_3_prime: [],
    tier_4_super_prime: [],
    asset_backed: [],
  };
  for (const e of flatList) byTier[e.tier].push(e);

  return {
    profileSummary: {
      avgFico: fico,
      bandTier: tier,
      hasRealEstateEquity: !!p.hasRealEstateEquity,
      hasEquipment: !!p.hasEquipmentAssets,
      hasReceivables: !!p.hasInvoiceReceivables,
      hasInvestments: !!p.hasInvestmentAccounts,
      monthlyRevenueRange: p.monthlyRevenueRange ?? null,
      bankingScore: banking,
      liquidScore: liquid,
      boaRelationshipBonus: boa,
      amexRelationshipFlag: amex,
    },
    byTier,
    flatList,
  };
}
