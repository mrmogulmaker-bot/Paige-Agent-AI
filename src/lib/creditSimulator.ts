/**
 * Credit Score Simulator — pure scoring logic.
 *
 * All projections are EDUCATIONAL ESTIMATES based on general FICO scoring
 * factors. Returned ranges are inclusive (low, high) per bureau.
 *
 * The simulator never invents bureau coverage: it always uses the
 * `bureau_source` field on the underlying account/negative record so a
 * projection is only shown for the bureau(s) that actually report it.
 */

export type Bureau = "experian" | "transunion" | "equifax";

export const BUREAU_LABELS: Record<Bureau, string> = {
  experian: "Experian",
  transunion: "TransUnion",
  equifax: "Equifax",
};

export type BureauScores = {
  experian: number | null;
  transunion: number | null;
  equifax: number | null;
};

export type ScoreImpact = {
  bureau: Bureau;
  baseline: number | null;
  low: number; // points added (low end)
  high: number; // points added (high end)
  projectedLow: number | null;
  projectedHigh: number | null;
};

// ── Bureau parsing ──────────────────────────────────────────────────────────
// `bureau_source` values vary in the wild ("Experian", "TU", "EQ", "all", etc.)
// We normalize defensively and default to all three when unknown.
export function parseBureauSource(raw: string | null | undefined): Bureau[] {
  if (!raw) return ["experian", "transunion", "equifax"];
  const s = raw.toLowerCase();
  if (s.includes("all") || s.includes("3b") || s === "tri") {
    return ["experian", "transunion", "equifax"];
  }
  const out: Bureau[] = [];
  if (s.includes("ex") || s.includes("xpn")) out.push("experian");
  if (s.includes("tu") || s.includes("tun") || s.includes("trans")) out.push("transunion");
  if (s.includes("eq") || s.includes("efx") || s.includes("equi")) out.push("equifax");
  return out.length > 0 ? out : ["experian", "transunion", "equifax"];
}

function clampScore(n: number | null): number | null {
  if (n === null) return null;
  return Math.max(300, Math.min(850, Math.round(n)));
}

function buildImpact(
  bureaus: Bureau[],
  scores: BureauScores,
  low: number,
  high: number,
): ScoreImpact[] {
  return bureaus.map((b) => {
    const baseline = scores[b];
    return {
      bureau: b,
      baseline,
      low,
      high,
      projectedLow: clampScore(baseline === null ? null : baseline + low),
      projectedHigh: clampScore(baseline === null ? null : baseline + high),
    };
  });
}

// ── Tab 1: Pay down a card ─────────────────────────────────────────────────
export function projectPaydown(args: {
  currentBalance: number;
  creditLimit: number;
  targetBalance: number;
  bureaus: Bureau[];
  scores: BureauScores;
}): { currentUtil: number; targetUtil: number; impacts: ScoreImpact[] } {
  const limit = Math.max(args.creditLimit, 1);
  const currentUtil = (args.currentBalance / limit) * 100;
  const targetUtil = (Math.max(args.targetBalance, 0) / limit) * 100;

  let low = 0;
  let high = 0;

  // Worse, same, or only fractionally better — no projection
  if (targetUtil >= currentUtil - 1) {
    return { currentUtil, targetUtil, impacts: buildImpact(args.bureaus, args.scores, 0, 0) };
  }

  if (currentUtil > 90 && targetUtil < 30) {
    low = 60; high = 100;
  } else if (currentUtil > 30 && targetUtil < 10) {
    low = 40; high = 70;
  } else if (currentUtil > 30 && targetUtil < 30) {
    low = 20; high = 40;
  } else if (currentUtil > 10 && targetUtil <= 10) {
    // Already <30, going to <10 still helps modestly
    low = 10; high = 20;
  } else {
    // Within the same utilization tier — minimal projected impact
    low = 3; high = 8;
  }

  return { currentUtil, targetUtil, impacts: buildImpact(args.bureaus, args.scores, low, high) };
}

// ── Tab 2: Remove a negative item ──────────────────────────────────────────
export function projectNegativeRemoval(args: {
  itemType: string | null;
  dateOfOccurrence: string | null;
  bureaus: Bureau[];
  scores: BureauScores;
}): ScoreImpact[] {
  const t = (args.itemType || "").toLowerCase();
  let low = 15; // default to "late payment" range
  let high = 30;

  if (t.includes("collection")) { low = 30; high = 50; }
  else if (t.includes("charge") || t.includes("chargeoff")) { low = 25; high = 45; }
  else if (t.includes("late") || t.includes("delinq")) { low = 15; high = 30; }
  else if (t.includes("bankrupt")) { low = 40; high = 80; }
  else if (t.includes("repo") || t.includes("foreclos")) { low = 35; high = 60; }
  else if (t.includes("judg") || t.includes("lien") || t.includes("tax")) { low = 25; high = 50; }

  // Aged items (>4 years) carry roughly half the weight
  if (args.dateOfOccurrence) {
    const ageMs = Date.now() - new Date(args.dateOfOccurrence).getTime();
    const ageYears = ageMs / (1000 * 60 * 60 * 24 * 365.25);
    if (ageYears > 4) {
      low = Math.round(low / 2);
      high = Math.round(high / 2);
    }
  }

  return buildImpact(args.bureaus, args.scores, low, high);
}

// ── Tab 3: Add a tradeline ─────────────────────────────────────────────────
export type TradelineType =
  | "primary_card"
  | "auto_loan"
  | "personal_loan"
  | "mortgage"
  | "rent_reporting"
  | "utility_reporting";

export type TradelineProfile = {
  hasInstallmentLoan: boolean;
  hasMortgage: boolean;
  hasAutoLoan: boolean;
  hasRentReporting: boolean;
  hasUtilityReporting: boolean;
  aggregateUtilization: number; // 0–100
};

export function projectTradeline(args: {
  type: TradelineType;
  profile: TradelineProfile;
  scores: BureauScores;
}): { impacts: ScoreImpact[]; mixDelta: string; utilDelta: string; ageDelta: string } {
  const allBureaus: Bureau[] = ["experian", "transunion", "equifax"];
  let low = 0;
  let high = 0;
  let mixDelta = "—";
  let utilDelta = "—";
  let ageDelta = "Slight reduction in average age (new account)";

  switch (args.type) {
    case "primary_card":
      if (args.profile.aggregateUtilization > 30) {
        low = 15; high = 35;
        utilDelta = "Lowers aggregate utilization (significant)";
      } else {
        low = 5; high = 15;
        utilDelta = "Lowers aggregate utilization (modest)";
      }
      mixDelta = "Adds revolving capacity";
      break;
    case "personal_loan":
      if (!args.profile.hasInstallmentLoan) {
        low = 10; high = 25;
        mixDelta = "Adds first installment loan to mix (significant)";
      } else {
        low = 3; high = 10;
        mixDelta = "Diversifies installment exposure";
      }
      utilDelta = "No direct utilization impact";
      break;
    case "auto_loan":
      if (!args.profile.hasAutoLoan && !args.profile.hasInstallmentLoan) {
        low = 10; high = 25;
        mixDelta = "Adds installment loan to mix";
      } else {
        low = 5; high = 12;
        mixDelta = "Diversifies installment exposure";
      }
      utilDelta = "No direct utilization impact";
      break;
    case "mortgage":
      low = 25; high = 50;
      mixDelta = "Adds the most weighted installment type";
      utilDelta = "No direct utilization impact";
      break;
    case "rent_reporting":
      low = 5; high = 15;
      mixDelta = "Adds positive payment history reporting";
      utilDelta = "No direct utilization impact";
      ageDelta = "Builds payment history (12–24 months back-reported by some providers)";
      break;
    case "utility_reporting":
      low = 5; high = 12;
      mixDelta = "Adds alternative payment data";
      utilDelta = "No direct utilization impact";
      ageDelta = "Builds positive payment signal";
      break;
  }

  return {
    impacts: buildImpact(allBureaus, args.scores, low, high),
    mixDelta,
    utilDelta,
    ageDelta,
  };
}

// ── Helpers ────────────────────────────────────────────────────────────────
export function strongestBureau(scores: BureauScores): Bureau | null {
  const entries = (Object.entries(scores) as Array<[Bureau, number | null]>)
    .filter(([, v]) => v !== null) as Array<[Bureau, number]>;
  if (entries.length === 0) return null;
  entries.sort((a, b) => b[1] - a[1]);
  return entries[0][0];
}

export function totalRange(impacts: ScoreImpact[]): { low: number; high: number } {
  return impacts.reduce(
    (acc, i) => ({ low: acc.low + i.low, high: acc.high + i.high }),
    { low: 0, high: 0 },
  );
}

export function bureauBadgeClass(score: number | null): string {
  if (score === null) return "bg-muted text-muted-foreground";
  if (score >= 700) return "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30";
  if (score >= 620) return "bg-amber-500/15 text-amber-700 dark:text-amber-400 border border-amber-500/30";
  return "bg-red-500/15 text-red-700 dark:text-red-400 border border-red-500/30";
}
