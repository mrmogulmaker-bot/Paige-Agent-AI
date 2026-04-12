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

export function scoreProduct(product: any, profile: FundingProfileData): ProductMatch {
  let score = 100;
  const deductions: MatchDeduction[] = [];
  const dataPoints: { label: string; value: string; status: "positive" | "negative" | "neutral" }[] = [];
  const type = product.product_type?.toLowerCase().replace(/\s+/g, "_") || "";
  const isUnsecured = !type.includes("secured") && !type.includes("credit_builder");
  const isRevenueBased = type.includes("revenue") || type.includes("factoring") || type.includes("merchant") || type.includes("sba");

  // Data point: credit score
  if (profile.middleScore != null) {
    dataPoints.push({ label: "Credit Score", value: `${profile.middleScore} middle score`, status: profile.middleScore >= (product.min_fico_score || 0) ? "positive" : "negative" });
  } else {
    dataPoints.push({ label: "Credit Score", value: "Not on file", status: "neutral" });
  }

  // Data point: derogatory items — use totalActiveNegatives to match Credit Intelligence
  dataPoints.push({ label: "Active Negatives", value: `${profile.totalActiveNegatives} active derogatory items`, status: profile.totalActiveNegatives === 0 ? "positive" : "negative" });
  if (profile.derogWithin24mo < profile.totalActiveNegatives) {
    dataPoints.push({ label: "Look-back Period", value: `${profile.derogWithin24mo} within last 24 months`, status: profile.derogWithin24mo === 0 ? "positive" : "negative" });
  }

  // Data point: comparable credit
  const revLabel = profile.revolvingLimitIsHistorical
    ? `$${profile.highestRevolvingLimit.toLocaleString()} highest closed revolving limit (Historical)`
    : `$${profile.highestRevolvingLimit.toLocaleString()} highest revolving limit`;
  dataPoints.push({ label: "Comparable Credit", value: revLabel, status: profile.highestRevolvingLimit > 0 ? "positive" : "neutral" });

  // Data point: revenue
  if (isRevenueBased) {
    dataPoints.push({ label: "Revenue Data", value: profile.hasRevenueData ? `$${(profile.annualRevenue || 0).toLocaleString()}/yr` : "Not on file", status: profile.hasRevenueData ? "positive" : "negative" });
  }

  // Data point: fraud/freeze
  if (profile.hasFraudAlert) {
    dataPoints.push({ label: "Fraud Alert", value: "Active on all 3 bureaus", status: "negative" });
  }

  // === Deductions ===

  // Active charge-offs > $5,000 on unsecured products
  if (isUnsecured && profile.chargeOffTotal > 5000) {
    const pts = 30;
    score -= pts;
    deductions.push({ label: `Active charge-offs totaling $${profile.chargeOffTotal.toLocaleString()} (>$5K disqualifier for unsecured)`, points: pts, severity: "critical" });
  }

  // Fraud alert
  if (profile.hasFraudAlert) {
    score -= 10;
    deductions.push({ label: "Active fraud alert — additional identity verification required", points: 10, severity: "warning" });
  }

  // Security freeze
  if (profile.hasSecurityFreeze) {
    score -= 15;
    deductions.push({ label: "Security freeze must be lifted before applying", points: 15, severity: "warning" });
  }

  // FICO below minimum
  if (product.min_fico_score && profile.middleScore != null) {
    const gap = product.min_fico_score - profile.middleScore;
    if (gap > 0) {
      const pts = Math.min(40, Math.round(gap * 0.5));
      score -= pts;
      deductions.push({ label: `Score ${profile.middleScore} is ${gap} points below ${product.min_fico_score} minimum`, points: pts, severity: gap > 50 ? "critical" : "warning" });
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

  score = Math.max(0, score);

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
    // Revolving / cards
    if (profile.highestRevolvingLimit > 0) {
      estimatedAmount = Math.min(Math.round(profile.highestRevolvingLimit * 1.75), maxAmt || profile.highestRevolvingLimit * 2);
      estimateExplanation = `1.75x your highest revolving limit ($${profile.highestRevolvingLimit.toLocaleString()})`;
    } else {
      estimatedAmount = minAmt || 500;
      estimateExplanation = `Minimum amount — no revolving tradeline history`;
    }
  }

  // Cap by max
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
  };
}

export function generateFundingSequence(profile: FundingProfileData) {
  const steps: { step: number; title: string; milestone: string; products: string; timeline: string; link: string; isCurrentStep: boolean }[] = [];
  const score = profile.middleScore || 0;
  const hasActiveDerog = profile.negativeItems.filter((n: any) => n.status !== "removed").length > 0;

  let currentStep = 1;

  if (hasActiveDerog && score < 680) {
    steps.push({
      step: 1,
      title: "Dispute Resolution",
      milestone: "Remove derogatory items to reach 650+ FICO",
      products: "Focus on charge-offs, collections, and late payments",
      timeline: "60-90 days",
      link: "/app/disputes",
      isCurrentStep: false,
    });
    if (score < 650) currentStep = 1;
    else currentStep = 2;
  }

  steps.push({
    step: steps.length + 1,
    title: "Credit Builder Deployment",
    milestone: "Establish positive tradelines at 650+ FICO",
    products: "Secured cards, credit builder loans, authorized user accounts",
    timeline: "30-60 days after dispute resolution",
    link: "/app/personal-build",
    isCurrentStep: false,
  });

  steps.push({
    step: steps.length + 1,
    title: "First PG Business Card",
    milestone: "680+ FICO with 2+ positive tradelines",
    products: "Personal guarantee business credit cards",
    timeline: "90-120 days from Step 2",
    link: "/app/funding",
    isCurrentStep: false,
  });

  steps.push({
    step: steps.length + 1,
    title: "Community Bank LOC",
    milestone: "720+ FICO with 6+ months banking history",
    products: "Business lines of credit, community bank products",
    timeline: "6-12 months from program start",
    link: "/app/funding",
    isCurrentStep: false,
  });

  steps.push({
    step: steps.length + 1,
    title: "SBA & Larger Facilities",
    milestone: "FICO SBSS 165+ with 2+ years business history",
    products: "SBA 7(a), SBA 504, equipment financing, term loans",
    timeline: "12-24 months from program start",
    link: "/app/funding",
    isCurrentStep: false,
  });

  // Determine current step
  if (score >= 720 && profile.timeInBusinessMonths && profile.timeInBusinessMonths >= 24) {
    currentStep = steps.length;
  } else if (score >= 720 && profile.hasBankingRelationship) {
    currentStep = steps.length - 1;
  } else if (score >= 680 && profile.openAccountCount >= 2) {
    currentStep = steps.length - 2;
  } else if (score >= 650 && !hasActiveDerog) {
    currentStep = 2;
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
