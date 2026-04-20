import type { FundingProfileData } from "@/hooks/useFundingProfile";

export interface MatchDeduction {
  label: string;
  points: number;
  severity: "critical" | "warning" | "info";
}

export interface ProductMatch {
  product: any;
  score: number;
  category: "eligible" | "near_eligible" | "needs_improvement" | "not_qualified";
  deductions: MatchDeduction[];
  estimatedAmount: number | null;
  estimateExplanation: string;
  dataPoints: { label: string; value: string; status: "positive" | "negative" | "neutral" }[];
  track: "personal" | "business";
  phase: "ACCEL" | "BUILD" | "FUND" | "ACQUIRE";
  /** Which bureau this product primarily pulls */
  primaryBureau: BureauPull;
  /** The specific score used for this product */
  bureauScoreUsed: number | null;
  /** Label for the bureau pull indicator */
  bureauPullLabel: string;
  /** Demographic boosts that were applied to this match (purely additive — never penalizing) */
  demographicBoosts: { label: "minority-owned" | "women-owned" | "veteran-owned" | "startups"; points: number }[];
}

export type BureauPull = "experian" | "transunion" | "equifax" | "all_three" | "middle_score" | "flexible";

// ====== Bureau pull mapping by lender name ======
const LENDER_BUREAU_MAP: Record<string, BureauPull> = {
  // Personal credit cards
  "chase": "experian",
  "capital one": "transunion",
  "american express": "experian",
  "amex": "experian",
  "citi": "equifax",
  "citibank": "equifax",
  "discover": "transunion",
  "bank of america": "equifax",
  "wells fargo": "experian",
  "opensky": "transunion",
  "chime": "transunion",
  // Personal loans
  "sofi": "experian",
  "lightstream": "equifax",
  "marcus": "experian",
  "goldman": "experian",
  "upgrade": "transunion",
  // Business credit cards
  "chase ink": "experian",
  "capital one spark": "transunion",
  "brex": "experian",
  "ramp": "experian",
  "divvy": "transunion",
  "mercury": "experian",
  // Business lending
  "ondeck": "experian",
  "bluevine": "experian",
  "fundbox": "experian",
  "kabbage": "experian",
  // Equipment / specialty
  "cdfi": "flexible",
  "community bank": "flexible",
};

// Product type defaults when lender name doesn't match
const TYPE_BUREAU_DEFAULTS: Record<string, BureauPull> = {
  "sba": "middle_score",
  "sba_loan": "middle_score",
  "sba_7a": "middle_score",
  "sba_504": "middle_score",
  "equipment": "equifax",
  "equipment_financing": "equifax",
  "vendor_account": "experian",
};

export function resolvePrimaryBureau(product: any): BureauPull {
  // Check explicit field first
  if (product.primary_bureau) return product.primary_bureau as BureauPull;

  const lender = (product.lender_name || "").toLowerCase().trim();
  const type = (product.product_type || "").toLowerCase().replace(/\s+/g, "_");

  // Check lender name (longest match first)
  for (const [key, bureau] of Object.entries(LENDER_BUREAU_MAP).sort((a, b) => b[0].length - a[0].length)) {
    if (lender.includes(key)) return bureau;
  }

  // Check product type defaults
  for (const [key, bureau] of Object.entries(TYPE_BUREAU_DEFAULTS)) {
    if (type.includes(key)) return bureau;
  }

  // Default: middle score for unknown
  return "middle_score";
}

export function getBureauScore(
  bureau: BureauPull,
  scores: { tu: number | null; ex: number | null; eq: number | null },
  middleScore: number | null
): number | null {
  switch (bureau) {
    case "experian": return scores.ex;
    case "transunion": return scores.tu;
    case "equifax": return scores.eq;
    case "flexible": {
      // Use best available score
      const valid = [scores.tu, scores.ex, scores.eq].filter((s): s is number => s != null);
      return valid.length > 0 ? Math.max(...valid) : null;
    }
    case "all_three":
    case "middle_score":
    default:
      return middleScore;
  }
}

export function getBureauPullLabel(bureau: BureauPull): string {
  switch (bureau) {
    case "experian": return "Pulls Experian";
    case "transunion": return "Pulls TransUnion";
    case "equifax": return "Pulls Equifax";
    case "all_three": return "Pulls all 3 — middle score used";
    case "flexible": return "Flexible — best bureau used";
    case "middle_score":
    default:
      return "Pulls all 3 — middle score used";
  }
}

/** Get which major lender categories pull a given bureau */
export function getLenderCategoriesForBureau(bureau: "tu" | "ex" | "eq"): string {
  switch (bureau) {
    case "ex": return "Chase, Amex, Wells Fargo, SoFi, OnDeck, BlueVine";
    case "tu": return "Capital One, Discover, OpenSky, Chime, Upgrade, Divvy";
    case "eq": return "Citi, Bank of America, LightStream, Equipment lenders";
  }
}

const PERSONAL_TYPES = ["personal_credit_card", "personal_line_of_credit", "personal_loan", "credit_builder", "secured_card"];
const ACCEL_TYPES = ["credit_builder", "secured_card"];
const BUILD_TYPES = ["personal_credit_card", "vendor_account", "business_credit_card"];
const FUND_TYPES = ["business_line_of_credit", "personal_line_of_credit", "term_loan", "sba_loan", "sba_7a", "sba_504", "business_loan"];
const ACQUIRE_TYPES = ["equipment_financing", "invoice_factoring", "revenue_based_financing", "merchant_cash_advance"];

function getPhase(productType: string): "ACCEL" | "BUILD" | "FUND" | "ACQUIRE" {
  const t = productType?.toLowerCase().replace(/\s+/g, "_") || "";
  if (ACCEL_TYPES.some(a => t.includes(a))) return "ACCEL";
  if (BUILD_TYPES.some(a => t.includes(a))) return "BUILD";
  if (ACQUIRE_TYPES.some(a => t.includes(a))) return "ACQUIRE";
  return "FUND";
}

function getTrack(productType: string): "personal" | "business" {
  const t = productType?.toLowerCase() || "";
  if (PERSONAL_TYPES.some(p => t.includes(p))) return "personal";
  return "business";
}

function isStale(dateStr: string | null): boolean {
  if (!dateStr) return true;
  const ninetyDays = 90 * 24 * 60 * 60 * 1000;
  return Date.now() - new Date(dateStr).getTime() > ninetyDays;
}

export function scoreProduct(product: any, profile: FundingProfileData): ProductMatch {
  let score = 100;
  const deductions: MatchDeduction[] = [];
  const dataPoints: { label: string; value: string; status: "positive" | "negative" | "neutral" }[] = [];
  const type = product.product_type?.toLowerCase().replace(/\s+/g, "_") || "";
  const isUnsecured = !type.includes("secured") && !type.includes("credit_builder");
  const isRevenueBased = type.includes("revenue") || type.includes("factoring") || type.includes("merchant") || type.includes("sba");
  const isBusiness = getTrack(type) === "business";
  const isSBA = type.includes("sba");
  const isDnBWeighted = type.includes("vendor") || type.includes("equipment");
  const infra = profile.businessInfra;

  // === Bureau-specific score resolution ===
  const primaryBureau = resolvePrimaryBureau(product);
  const bureauScoreUsed = getBureauScore(primaryBureau, profile.scores, profile.middleScore);
  const bureauPullLabel = getBureauPullLabel(primaryBureau);

  // Bureau label for display
  const bureauDisplayName = primaryBureau === "experian" ? "Experian" :
    primaryBureau === "transunion" ? "TransUnion" :
    primaryBureau === "equifax" ? "Equifax" :
    primaryBureau === "flexible" ? "Best Bureau" : "Middle";

  // === Data Points ===

  // Personal FICO — show bureau-specific score
  if (bureauScoreUsed != null) {
    const minFico = product.min_fico_score || 0;
    dataPoints.push({
      label: `${bureauDisplayName} Score`,
      value: `${bureauScoreUsed}`,
      status: bureauScoreUsed >= minFico ? "positive" : "negative",
    });
  } else if (profile.middleScore != null) {
    dataPoints.push({ label: "Personal FICO", value: `${profile.middleScore} middle score`, status: profile.middleScore >= (product.min_fico_score || 0) ? "positive" : "negative" });
  } else {
    dataPoints.push({ label: "Personal FICO", value: "Not on file", status: "neutral" });
  }

  // Bureau pull indicator
  dataPoints.push({ label: "Bureau Pull", value: bureauPullLabel, status: "neutral" });

  // Business credit scores for business products
  if (isBusiness) {
    dataPoints.push({
      label: "Business Intelliscore",
      value: infra.experianIntelliscore != null ? `${infra.experianIntelliscore}` : "Not established",
      status: infra.experianIntelliscore != null && infra.experianIntelliscore >= 70 ? "positive" : infra.experianIntelliscore != null ? "negative" : "neutral",
    });
    dataPoints.push({
      label: "Entity",
      value: infra.hasEntity ? "Formed" : "Not formed",
      status: infra.hasEntity ? "positive" : "negative",
    });
    dataPoints.push({
      label: "EIN",
      value: infra.hasEIN ? "On file" : "Not on file",
      status: infra.hasEIN ? "positive" : "negative",
    });
    dataPoints.push({
      label: "Public Presence",
      value: `${infra.presenceComplete} of ${infra.presenceTotal} complete`,
      status: infra.presenceComplete >= 4 ? "positive" : infra.presenceComplete > 0 ? "negative" : "neutral",
    });
    dataPoints.push({
      label: "Financial Docs",
      value: [
        !infra.hasTaxReturns ? "Tax returns missing" : null,
        !infra.hasPnL ? "P&L missing" : null,
        !infra.hasBankStatements ? "Bank statements missing" : null,
      ].filter(Boolean).join(", ") || "On file",
      status: infra.hasTaxReturns && infra.hasPnL && infra.hasBankStatements ? "positive" : "negative",
    });
  }

  // Active negatives
  dataPoints.push({ label: "Active Negatives", value: `${profile.totalActiveNegatives} active derogatory items`, status: profile.totalActiveNegatives === 0 ? "positive" : "negative" });
  if (profile.derogWithin24mo < profile.totalActiveNegatives) {
    dataPoints.push({ label: "Look-back Period", value: `${profile.derogWithin24mo} within last 24 months`, status: profile.derogWithin24mo === 0 ? "positive" : "negative" });
  }

  // Comparable credit
  const revLabel = profile.revolvingLimitIsHistorical
    ? `$${profile.highestRevolvingLimit.toLocaleString()} highest closed revolving limit (Historical)`
    : `$${profile.highestRevolvingLimit.toLocaleString()} highest revolving limit`;
  dataPoints.push({ label: "Comparable Credit", value: revLabel, status: profile.highestRevolvingLimit > 0 ? "positive" : "neutral" });

  // Revenue
  if (isRevenueBased) {
    dataPoints.push({ label: "Revenue Data", value: profile.hasRevenueData ? `$${(profile.annualRevenue || 0).toLocaleString()}/yr` : "Not on file", status: profile.hasRevenueData ? "positive" : "negative" });
  }

  if (profile.hasFraudAlert) {
    dataPoints.push({ label: "Fraud Alert", value: "Active on all 3 bureaus", status: "negative" });
  }

  // === Deductions ===

  // --- Business Infrastructure Deductions (for business products) ---
  if (isBusiness) {
    if (!infra.hasEntity) {
      score -= 40;
      deductions.push({ label: "Entity formation required before applying for business credit", points: 40, severity: "critical" });
    }
    if (!infra.hasEIN) {
      score -= 40;
      deductions.push({ label: "EIN required before applying for business funding", points: 40, severity: "critical" });
    }
    if (infra.addressType?.toLowerCase() === "home") {
      score -= 10;
      deductions.push({ label: "Home address may cause identity verification failures with lenders", points: 10, severity: "warning" });
    }
    if (!infra.hasPhone411) {
      score -= 5;
      deductions.push({ label: "No dedicated phone listed in 411 directories", points: 5, severity: "info" });
    }
    if (!infra.hasBankAccount && profile.connectedBanks === 0) {
      score -= 15;
      deductions.push({ label: "Business bank account required for most business funding products", points: 15, severity: "warning" });
    }
    const presencePct = infra.presenceTotal > 0 ? (infra.presenceComplete / infra.presenceTotal) * 100 : 0;
    if (presencePct < 50) {
      score -= 10;
      deductions.push({ label: "Incomplete public presence may cause identity verification failures", points: 10, severity: "warning" });
    }
    if (infra.hasConsistencyIssues) {
      deductions.push({ label: "Address or name inconsistency detected across public listings — resolve before applying to avoid verification failures", points: 0, severity: "warning" });
    }
  }

  // --- Business Bureau Score Deductions ---
  if (isBusiness && infra.experianIntelliscore != null) {
    if (type.includes("business_credit_card") || type.includes("business_line")) {
      const minIntelli = product.min_business_score || 70;
      const gap = minIntelli - infra.experianIntelliscore;
      if (gap > 0) {
        const pts = Math.min(30, Math.round(gap * 0.5));
        score -= pts;
        deductions.push({ label: `Intelliscore ${infra.experianIntelliscore} is ${gap} points below ${minIntelli} minimum`, points: pts, severity: gap > 30 ? "critical" : "warning" });
      }
    }
  }

  // SBA SBSS check
  if (isSBA) {
    if (infra.ficoSbss != null && infra.ficoSbss < 165) {
      score -= 35;
      deductions.push({ label: `SBA 7(a) requires FICO SBSS 165 or above — your current score of ${infra.ficoSbss} does not yet meet this threshold`, points: 35, severity: "critical" });
    } else if (infra.ficoSbss == null) {
      deductions.push({ label: "FICO SBSS score not on file — required for SBA products", points: 0, severity: "info" });
    }
  }

  // D&B weighted products
  if (isDnBWeighted && infra.dnbPaydex != null && infra.dnbPaydex < 80) {
    const gap = 80 - infra.dnbPaydex;
    const pts = Math.min(20, Math.round(gap * 0.4));
    score -= pts;
    deductions.push({ label: `PAYDEX ${infra.dnbPaydex} below 80 target for vendor/equipment products`, points: pts, severity: "warning" });
  }

  // Stale data flags
  if (isBusiness) {
    if (infra.dnbPaydex != null && isStale(infra.dnbLastVerified)) {
      deductions.push({ label: "D&B scores are over 90 days old — reverify before applying", points: 0, severity: "info" });
    }
    if (infra.experianIntelliscore != null && isStale(infra.experianLastVerified)) {
      deductions.push({ label: "Experian Business scores are over 90 days old — reverify before applying", points: 0, severity: "info" });
    }
  }

  // --- Financial Docs Deductions ---
  if (isBusiness) {
    if (!infra.hasTaxReturns) {
      if (isSBA) {
        score -= 20;
        deductions.push({ label: "Missing business tax returns — required for SBA products", points: 20, severity: "warning" });
      } else if (type.includes("term") || type.includes("loan")) {
        score -= 15;
        deductions.push({ label: "Missing business tax returns — required for traditional bank products", points: 15, severity: "warning" });
      }
    }
    if (!infra.hasPnL && (type.includes("loc") || type.includes("line_of_credit") || isSBA)) {
      score -= 10;
      deductions.push({ label: "Missing P&L statement — required for LOC and SBA products", points: 10, severity: "warning" });
    }
    if (!infra.hasBankStatements && (type.includes("revenue") || type.includes("factoring") || type.includes("merchant") || type.includes("online"))) {
      score -= 15;
      deductions.push({ label: "Missing bank statements — online lenders underwrite heavily on cash flow", points: 15, severity: "warning" });
    }
  }

  // --- Standard Personal Credit Deductions (use bureau-specific score) ---

  // Active charge-offs > $5,000 on unsecured products
  if (isUnsecured && profile.chargeOffTotal > 5000) {
    const pts = 30;
    score -= pts;
    deductions.push({ label: `Active charge-offs totaling $${profile.chargeOffTotal.toLocaleString()} (>$5K disqualifier for unsecured)`, points: pts, severity: "critical" });
  }

  if (profile.hasFraudAlert) {
    score -= 10;
    deductions.push({ label: "Active fraud alert — additional identity verification required", points: 10, severity: "warning" });
  }

  if (profile.hasSecurityFreeze) {
    score -= 15;
    deductions.push({ label: "Security freeze must be lifted before applying", points: 15, severity: "warning" });
  }

  // FICO below minimum — use bureau-specific score
  const relevantScore = bureauScoreUsed ?? profile.middleScore;
  if (product.min_fico_score && relevantScore != null) {
    const gap = product.min_fico_score - relevantScore;
    if (gap > 0) {
      const pts = Math.min(40, Math.round(gap * 0.5));
      score -= pts;
      deductions.push({ label: `${bureauDisplayName} score ${relevantScore} is ${gap} points below ${product.min_fico_score} minimum`, points: pts, severity: gap > 50 ? "critical" : "warning" });
    }
  }

  // Look-back period violations
  if (profile.derogWithin12mo > 0) {
    const pts = profile.derogWithin12mo * 20;
    score -= pts;
    deductions.push({ label: `${profile.derogWithin12mo} derogatory item(s) within last 12 months (-20 each)`, points: pts, severity: "critical" });
  }
  if (profile.derogWithin24mo - profile.derogWithin12mo > 0) {
    const count = profile.derogWithin24mo - profile.derogWithin12mo;
    const pts = count * 10;
    score -= pts;
    deductions.push({ label: `${count} derogatory item(s) within 12-24 months (-10 each)`, points: pts, severity: "warning" });
  }

  // Missing revenue for revenue-dependent
  if (isRevenueBased && !profile.hasRevenueData) {
    score -= 25;
    deductions.push({ label: "Revenue data required — upload bank statements or enter revenue", points: 25, severity: "warning" });
  }

  // Min annual revenue check
  if (product.min_annual_revenue && profile.annualRevenue != null && profile.annualRevenue < Number(product.min_annual_revenue)) {
    score -= 20;
    deductions.push({ label: `Annual revenue $${(profile.annualRevenue).toLocaleString()} below $${Number(product.min_annual_revenue).toLocaleString()} minimum`, points: 20, severity: "warning" });
  }

  // No comparable tradeline
  if (isUnsecured && profile.highestRevolvingLimit === 0 && !type.includes("credit_builder") && !type.includes("secured")) {
    score -= 15;
    deductions.push({ label: "No comparable revolving tradeline history — approval amount may be lower", points: 15, severity: "info" });
  }

  // Business age check
  if (product.min_business_age_months && (profile.timeInBusinessMonths == null || profile.timeInBusinessMonths < product.min_business_age_months)) {
    score -= 20;
    deductions.push({ label: `Business age ${profile.timeInBusinessMonths ?? 0} months, minimum ${product.min_business_age_months} months required`, points: 20, severity: "warning" });
  }

  // === Demographic boosts (purely additive — never penalize) ===
  const demographicBoosts: ProductMatch["demographicBoosts"] = [];
  const demo = profile.demographics;
  if (demo) {
    if (demo.is_minority_owned === true && product.serves_minority_owned === true) {
      score += 20;
      demographicBoosts.push({ label: "minority-owned", points: 20 });
    }
    if (demo.is_women_owned === true && product.serves_women_owned === true) {
      score += 20;
      demographicBoosts.push({ label: "women-owned", points: 20 });
    }
    if ((demo.is_veteran_owned === true || demo.is_veteran === true) && product.serves_veterans === true) {
      score += 20;
      demographicBoosts.push({ label: "veteran-owned", points: 20 });
    }
    if (demo.is_startup === true && product.serves_startups === true) {
      score += 15;
      demographicBoosts.push({ label: "startups", points: 15 });
    }
  }

  score = Math.max(0, Math.min(100, score));

  // Category
  let category: ProductMatch["category"];
  if (score >= 85) category = "eligible";
  else if (score >= 65) category = "near_eligible";
  else if (score >= 40) category = "needs_improvement";
  else category = "not_qualified";

  // === Estimate Calculation ===
  let estimatedAmount: number | null = null;
  let estimateExplanation = "";
  const maxAmt = Number(product.max_amount) || 0;
  const minAmt = Number(product.min_amount) || 0;

  if (type.includes("revenue") || type.includes("factoring") || type.includes("merchant")) {
    if (!profile.hasRevenueData) {
      estimateExplanation = "Estimate requires revenue data";
    } else {
      const low = (profile.annualRevenue || 0) * 0.10;
      const high = Math.min((profile.annualRevenue || 0) * 0.20, maxAmt || Infinity);
      estimatedAmount = Math.round((low + high) / 2);
      estimateExplanation = `Based on 10-20% of $${(profile.annualRevenue || 0).toLocaleString()} annual revenue`;
    }
  } else if (type.includes("line_of_credit") || type.includes("loc")) {
    if (profile.highestLOCLimit > 0) {
      estimatedAmount = Math.min(Math.round(profile.highestLOCLimit * 1.5), maxAmt || profile.highestLOCLimit * 2);
      estimateExplanation = `1.5x your highest LOC ($${profile.highestLOCLimit.toLocaleString()})`;
    } else {
      estimatedAmount = minAmt || 5000;
      estimateExplanation = `Minimum opening amount — no prior LOC history on file`;
    }
  } else if (type.includes("installment") || type.includes("term") || type.includes("equipment") || type.includes("sba")) {
    if (profile.highestInstallmentBalance > 0) {
      estimatedAmount = Math.min(Math.round(profile.highestInstallmentBalance * 1.5), maxAmt || profile.highestInstallmentBalance * 2);
      estimateExplanation = `1.5x your highest installment balance ($${profile.highestInstallmentBalance.toLocaleString()})`;
    } else {
      estimatedAmount = minAmt || 5000;
      estimateExplanation = `Minimum amount — no installment tradeline history`;
    }
  } else {
    if (profile.highestRevolvingLimit > 0) {
      estimatedAmount = Math.min(Math.round(profile.highestRevolvingLimit * 1.75), maxAmt || profile.highestRevolvingLimit * 2);
      const histLabel = profile.revolvingLimitIsHistorical ? " (historical — closed account)" : "";
      estimateExplanation = `1.75x your highest revolving limit ($${profile.highestRevolvingLimit.toLocaleString()}${histLabel})`;
    } else {
      estimatedAmount = minAmt || 500;
      estimateExplanation = `Minimum amount — no revolving tradeline history`;
    }
  }

  if (estimatedAmount && maxAmt > 0 && estimatedAmount > maxAmt) {
    estimatedAmount = maxAmt;
    estimateExplanation += `, capped at product maximum`;
  }

  return {
    product,
    score,
    category,
    deductions,
    estimatedAmount,
    estimateExplanation,
    dataPoints,
    track: getTrack(type),
    phase: getPhase(type),
    primaryBureau,
    bureauScoreUsed,
    bureauPullLabel,
    demographicBoosts,
  };
}

export function generateFundingSequence(profile: FundingProfileData) {
  const steps: { step: number; title: string; milestone: string; products: string; timeline: string; link: string; isCurrentStep: boolean }[] = [];
  const score = profile.middleScore || 0;
  const hasActiveDerog = profile.totalActiveNegatives > 0;

  // Calculate Foundation completion percentage from business infra data
  const infra = profile.businessInfra;
  const foundationItems = [
    infra?.hasEntity,
    infra?.hasEIN,
    !!(infra?.addressType),
    infra?.hasPhone411,
    infra?.hasBankAccount,
  ];
  const foundationComplete = foundationItems.filter(Boolean).length;
  const foundationPct = Math.round((foundationComplete / 5) * 100);

  let currentStep = 1;
  let stepNum = 0;

  // Step 0: Business Foundation Setup (if Foundation completion < 100%)
  if (foundationPct < 100) {
    stepNum++;
    steps.push({
      step: stepNum,
      title: "Complete Business Foundation Setup",
      milestone: "Form your entity, get your EIN, establish your business address and phone, and open your business bank account",
      products: "Foundation tab in Business Infrastructure Assessment",
      timeline: "1-2 weeks",
      link: "/app/business",
      isCurrentStep: false,
    });
  }

  if (hasActiveDerog && score < 680) {
    stepNum++;
    steps.push({
      step: stepNum,
      title: "Dispute Resolution",
      milestone: "Remove derogatory items to reach 650+ FICO",
      products: "Focus on charge-offs, collections, and late payments",
      timeline: "60-90 days",
      link: "/app/disputes",
      isCurrentStep: false,
    });
    if (score < 650) currentStep = stepNum;
    else currentStep = stepNum + 1;
  }

  stepNum++;
  steps.push({
    step: stepNum,
    title: "Credit Builder Deployment",
    milestone: "Establish positive tradelines at 650+ FICO",
    products: "Secured cards, credit builder loans, authorized user accounts",
    timeline: "30-60 days after dispute resolution",
    link: "/app/personal-build",
    isCurrentStep: false,
  });

  stepNum++;
  steps.push({
    step: stepNum,
    title: "First PG Business Card",
    milestone: "680+ FICO with 2+ positive tradelines",
    products: "Personal guarantee business credit cards",
    timeline: "90-120 days from Step 2",
    link: "/app/funding",
    isCurrentStep: false,
  });

  stepNum++;
  steps.push({
    step: stepNum,
    title: "Community Bank LOC",
    milestone: "720+ FICO with 6+ months banking history",
    products: "Business lines of credit, community bank products",
    timeline: "6-12 months from program start",
    link: "/app/funding",
    isCurrentStep: false,
  });

  stepNum++;
  steps.push({
    step: stepNum,
    title: "SBA & Larger Facilities",
    milestone: "FICO SBSS 165+ with 2+ years business history",
    products: "SBA 7(a), SBA 504, equipment financing, term loans",
    timeline: "12-24 months from program start",
    link: "/app/funding",
    isCurrentStep: false,
  });

  // Determine current step based on Foundation completion first
  if (foundationPct < 100) {
    currentStep = 1;
  } else if (score >= 720 && profile.timeInBusinessMonths && profile.timeInBusinessMonths >= 24) {
    currentStep = steps.length;
  } else if (score >= 720 && profile.hasBankingRelationship) {
    currentStep = steps.length - 1;
  } else if (score >= 680 && profile.openAccountCount >= 2) {
    currentStep = steps.length - 2;
  } else if (score >= 650 && !hasActiveDerog) {
    currentStep = Math.min(currentStep + 1, steps.length);
  }

  return steps.map(s => ({ ...s, isCurrentStep: s.step === currentStep }));
}

export const PHASE_ORDER = ["ACCEL", "BUILD", "FUND", "ACQUIRE"] as const;
export const PHASE_LABELS: Record<string, string> = {
  ACCEL: "ACCEL Phase — Credit Restoration & Building",
  BUILD: "BUILD Phase — First Credit Products",
  FUND: "FUND Phase — Lines of Credit & Term Loans",
  ACQUIRE: "ACQUIRE Phase — Equipment & Larger Facilities",
};
