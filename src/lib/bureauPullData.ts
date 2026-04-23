import type { CreditBureau } from "./fundabilityScores";

/**
 * Bureau Pull Source Note — last verified date for the lender bureau pull map below.
 * Update whenever LENDER_BUREAU_PULLS is materially edited so the UI can surface a freshness indicator.
 */
export const BUREAU_PULL_DATA_VERIFIED_ON = "2025-04-01";

export type BureauPullKey = CreditBureau | "none";

export interface LenderBureauPull {
  /** Primary bureau the lender pulls in most cases. "none" = no personal credit pull. */
  primary: BureauPullKey;
  /** Optional secondary bureau pulled in some states / for some products. */
  secondary?: BureauPullKey;
  /** Free-text caveat shown alongside the pull (state variance, soft pull, etc). */
  notes: string;
}

/**
 * Curated lender → bureau pull mapping. State-level variance is captured in `notes`
 * since pulls genuinely shift by state — Paige tells the client to verify before applying.
 */
export const LENDER_BUREAU_PULLS: Record<string, LenderBureauPull> = {
  // ---------- Chase ----------
  "Chase Ink Business Cash": { primary: "experian", notes: "Pulls Experian in most states. Some states add TransUnion." },
  "Chase Ink Business Unlimited": { primary: "experian", notes: "Pulls Experian in most states." },
  "Chase Ink Business Preferred": { primary: "experian", notes: "Pulls Experian in most states." },
  "Chase Sapphire Preferred": { primary: "experian", notes: "Pulls Experian in most states." },
  "Chase Auto": { primary: "experian", notes: "Pulls Experian in most states; some markets layer Equifax." },

  // ---------- Capital One ----------
  "Capital One Spark": { primary: "transunion", secondary: "equifax", notes: "Often pulls both TransUnion and Equifax." },
  "Capital One Venture": { primary: "transunion", secondary: "equifax", notes: "Often pulls both TransUnion and Equifax." },
  "Capital One Quicksilver": { primary: "transunion", secondary: "equifax", notes: "Frequently dual-pulls TransUnion and Equifax." },
  "Capital One Platinum Secured": { primary: "transunion", secondary: "equifax", notes: "Frequently dual-pulls TransUnion and Equifax." },
  "Capital One Auto Navigator": { primary: "transunion", notes: "Primarily pulls TransUnion for auto pre-qual." },

  // ---------- American Express ----------
  "American Express Blue Business Cash": { primary: "experian", notes: "Primarily pulls Experian." },
  "American Express Gold": { primary: "experian", notes: "Primarily pulls Experian." },
  "American Express Platinum": { primary: "experian", notes: "Primarily pulls Experian." },

  // ---------- Bank of America ----------
  "Bank of America Business Advantage": { primary: "transunion", notes: "Primarily pulls TransUnion." },
  "Bank of America": { primary: "transunion", notes: "Primarily pulls TransUnion." },

  // ---------- US Bank ----------
  "US Bank Business Triple Cash": { primary: "equifax", notes: "Primarily pulls Equifax." },

  // ---------- Truist ----------
  "Truist Business": { primary: "equifax", notes: "Primarily pulls Equifax." },

  // ---------- Wells Fargo ----------
  "Wells Fargo Business": { primary: "experian", notes: "Primarily pulls Experian." },
  "Wells Fargo Active Cash": { primary: "experian", notes: "Primarily pulls Experian." },

  // ---------- Fintech / lines of credit ----------
  "Bluevine Line of Credit": { primary: "transunion", notes: "Primarily pulls TransUnion. 625 minimum FICO." },
  "Fundbox": { primary: "experian", notes: "Pulls Experian. Connects to accounting software." },

  // ---------- Cash-balance corporate cards ----------
  "Ramp Corporate Card": { primary: "none", notes: "No personal credit pull. Cash balance qualifier." },
  "Brex Corporate Card": { primary: "none", notes: "No personal credit pull. Cash balance and revenue qualifier." },

  // ---------- Credit-builder products (typically all three) ----------
  "Discover it Secured": { primary: "experian", notes: "Reports to all three bureaus. Primary pull is typically Experian." },
  "Discover it Cash Back": { primary: "experian", notes: "Pulls Experian in most states." },
  "Chime Credit Builder": { primary: "none", notes: "No hard inquiry. Reports to all three bureaus." },
  "OpenSky (no credit check)": { primary: "none", notes: "No credit check at application." },
  "Self Inc.": { primary: "none", notes: "No hard pull at signup. Reports to all three bureaus." },
  "Credit Strong": { primary: "none", notes: "No hard pull at signup. Reports to all three bureaus." },
};

/**
 * Loose alias matching — if a recommended-lender string contains a known key as a
 * substring (case-insensitive), return the longest-matching pull entry. This lets
 * the engine match "Chase Ink Business Cash" inside a longer marketing label and
 * also catch shorter aliases like "Chase Ink" without re-listing every variant.
 */
export function lookupLenderBureauPull(lenderName: string): LenderBureauPull | null {
  if (!lenderName) return null;
  const direct = LENDER_BUREAU_PULLS[lenderName];
  if (direct) return direct;

  const haystack = lenderName.toLowerCase();
  // Sort keys by length desc so we prefer "Chase Ink Business Preferred" over "Chase".
  const keys = Object.keys(LENDER_BUREAU_PULLS).sort((a, b) => b.length - a.length);
  for (const key of keys) {
    if (haystack.includes(key.toLowerCase())) {
      return LENDER_BUREAU_PULLS[key];
    }
  }
  return null;
}

export interface BureauStrategy {
  /** Lenders (from product.recommendedLenders) that pull the client's strongest bureau. */
  matchingBureauLenders: string[];
  /** Lenders that pull the client's weakest bureau. */
  weakBureauLenders: string[];
  /** Lenders with no personal-credit pull (cash-balance qualifiers, builders). */
  neutralLenders: string[];
  /** Lenders with no known pull data — verify before applying. */
  unknownLenders: string[];
  /** Short, client-facing strategy line. */
  bureauAdvice: string;
  /** ISO date string the underlying pull data was last verified. */
  verifiedOn: string;
  /** True when at least one recommended lender's pull is known. */
  hasAnyKnownPull: boolean;
}

const BUREAU_LABEL: Record<CreditBureau, string> = {
  experian: "Experian",
  transunion: "TransUnion",
  equifax: "Equifax",
};

/**
 * Builds the per-product Bureau Strategy from a list of recommended lenders and
 * the client's strongest/weakest bureau (already determined upstream from
 * bureau-specific fundability scores).
 */
export function buildBureauStrategy(
  recommendedLenders: string[],
  strongestBureau: CreditBureau | null,
  weakestBureau: CreditBureau | null,
): BureauStrategy {
  const matchingBureauLenders: string[] = [];
  const weakBureauLenders: string[] = [];
  const neutralLenders: string[] = [];
  const unknownLenders: string[] = [];

  for (const lender of recommendedLenders) {
    const pull = lookupLenderBureauPull(lender);
    if (!pull) {
      unknownLenders.push(lender);
      continue;
    }
    if (pull.primary === "none") {
      neutralLenders.push(lender);
      continue;
    }
    const pullsStrongest = strongestBureau != null && (pull.primary === strongestBureau || pull.secondary === strongestBureau);
    const pullsWeakest = weakestBureau != null && (pull.primary === weakestBureau || pull.secondary === weakestBureau);

    if (pullsStrongest) matchingBureauLenders.push(lender);
    else if (pullsWeakest) weakBureauLenders.push(lender);
    else unknownLenders.push(lender);
  }

  const hasAnyKnownPull =
    matchingBureauLenders.length + weakBureauLenders.length + neutralLenders.length > 0;

  let bureauAdvice = "";
  if (!hasAnyKnownPull) {
    bureauAdvice = "Bureau pull data unavailable for these lenders — verify with each lender before applying.";
  } else if (strongestBureau && matchingBureauLenders.length > 0) {
    const examples = matchingBureauLenders.slice(0, 3).join(", ");
    bureauAdvice = `Your strongest bureau is ${BUREAU_LABEL[strongestBureau]} — apply to ${examples} first for this product category.`;
  } else if (neutralLenders.length > 0 && matchingBureauLenders.length === 0) {
    bureauAdvice = `These lenders don't pull personal credit — qualify on cash balance and revenue instead. Use them while strengthening your bureau profile.`;
  } else if (strongestBureau) {
    bureauAdvice = `None of the recommended lenders are confirmed to pull your strongest bureau (${BUREAU_LABEL[strongestBureau]}). Verify pulls before applying so you can sequence applications by bureau strength.`;
  } else {
    bureauAdvice = "Add bureau-specific FICO scores to unlock per-lender bureau strategy.";
  }

  return {
    matchingBureauLenders,
    weakBureauLenders,
    neutralLenders,
    unknownLenders,
    bureauAdvice,
    verifiedOn: BUREAU_PULL_DATA_VERIFIED_ON,
    hasAnyKnownPull,
  };
}
