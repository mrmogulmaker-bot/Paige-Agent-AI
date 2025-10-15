/**
 * Business Credit Task Keyword Filter v1.0.0
 * Routing: data_furnishing_block → funding → business_credit → personal_credit_clarify
 * Validates tasks for Business Credit/Funding section
 */

// Priority 1: Data Furnishing keywords (BLOCK completely)
const dataFurnishingKeywords = [
  "metro 2", "metro2", "e-oscar", "subscriber code", "data furnishing",
  "furnisher", "cra onboarding", "base segment", "k1 segment", "l1 segment",
  "cddf", "credit reporting agency", "upload to bureau", "report to bureau"
];

// Priority 2: Funding keywords
const fundingKeywords = [
  "funding", "pre-approval", "preapproval", "underwriting", "credit line",
  "line of credit", "bloc", "loc", "sba", "dscr", "mca", "merchant cash advance",
  "term loan", "factor rate", "bank statements", "tax returns", "no-pg", "pg",
  "term sheet", "working capital", "equipment financing"
];

// Priority 3: Business Credit keywords
const businessCreditKeywords = [
  "d-u-n-s", "duns", "paydex", "experian business", "equifax business",
  "trade reference", "net-30", "net 30", "vendor account", "store card",
  "fleet card", "corporate card", "pg policy", "no-pg policy", "naics",
  "411 listing", "registered agent", "good standing", "annual report",
  "license renewal", "compliance", "ein", "llc", "corporation", "business formation"
];

// Priority 4: Personal Credit keywords (should reroute)
const personalCreditKeywords = [
  "fcra", "fdcpa", "personal credit", "utilization", "secured card", "au",
  "dispute", "budget", "savings", "fico", "vantagescore", "consumer credit",
  "ssn", "credit card", "personal loan", "auto loan", "mortgage", "student loan",
  "goodwill letter", "credit freeze", "fraud alert", "inquiry removal"
];

const blockFurnishingMessage = "Data Furnishing features are not supported inside Paige.";
const reroutePersonalMessage = "Sounds like Personal Credit. Move it to the Personal Credit Task Bar?";
const noBusinessKeywordsMessage = "No business credit/funding keywords found. Try being more specific about the business task.";

export interface BusinessFilterResult {
  isAllowed: boolean;
  reason?: string;
  deniedKeywords?: string[];
  shouldReroute?: boolean;
  rerouteMessage?: string;
  isDataFurnishing?: boolean;
  category?: "Business Credit" | "Funding" | "Business Compliance";
}

/**
 * Check if text contains Data Furnishing keywords (Priority 1 - BLOCK)
 */
function containsKeywords(text: string, keywords: string[]): string[] {
  const lowerText = text.toLowerCase();
  return keywords.filter(keyword => lowerText.includes(keyword.toLowerCase()));
}

export function containsDataFurnishingKeywords(text: string): string[] {
  return containsKeywords(text, dataFurnishingKeywords);
}

export function containsPersonalCreditKeywords(text: string): string[] {
  return containsKeywords(text, personalCreditKeywords);
}

export function containsFundingKeywords(text: string): string[] {
  return containsKeywords(text, fundingKeywords);
}

export function containsBusinessKeywords(text: string): string[] {
  return containsKeywords(text, businessCreditKeywords);
}

/**
 * Validate task using routing priority:
 * 1. data_furnishing_block (highest priority)
 * 2. funding
 * 3. business_credit
 * 4. personal_credit_clarify
 */
export function validateBusinessCreditTask(
  title: string,
  description?: string
): BusinessFilterResult {
  const fullText = `${title} ${description || ""}`;
  
  // Priority 1: Data Furnishing (BLOCK)
  const furnishingKeywords = containsDataFurnishingKeywords(fullText);
  if (furnishingKeywords.length > 0) {
    return {
      isAllowed: false,
      reason: blockFurnishingMessage,
      deniedKeywords: furnishingKeywords,
      isDataFurnishing: true,
      rerouteMessage: blockFurnishingMessage
    };
  }
  
  // Priority 2: Personal Credit (CLARIFY/REROUTE)
  const personalKeywords = containsPersonalCreditKeywords(fullText);
  if (personalKeywords.length > 0) {
    return {
      isAllowed: false,
      reason: "Contains personal credit keywords",
      deniedKeywords: personalKeywords,
      shouldReroute: true,
      rerouteMessage: reroutePersonalMessage
    };
  }
  
  // Priority 3: Determine category (Funding vs Business Credit vs Compliance)
  const fundingKw = containsFundingKeywords(fullText);
  const businessKw = containsBusinessKeywords(fullText);
  
  if (fundingKw.length > 0) {
    return {
      isAllowed: true,
      category: "Funding"
    };
  }
  
  if (businessKw.length > 0) {
    // Determine if it's compliance or credit building
    const complianceTerms = ["compliance", "annual report", "license", "registered agent", "good standing"];
    const hasCompliance = complianceTerms.some(term => fullText.toLowerCase().includes(term));
    
    return {
      isAllowed: true,
      category: hasCompliance ? "Business Compliance" : "Business Credit"
    };
  }
  
  // No business keywords found
  return {
    isAllowed: false,
    reason: noBusinessKeywordsMessage,
    deniedKeywords: [],
    shouldReroute: false
  };
}

/**
 * Sanitize text by removing blocked keywords
 */
export function sanitizeForBusinessCredit(text: string): string {
  let sanitized = text;
  
  personalCreditKeywords.forEach(keyword => {
    const regex = new RegExp(keyword, 'gi');
    sanitized = sanitized.replace(regex, '[personal term removed]');
  });
  
  dataFurnishingKeywords.forEach(keyword => {
    const regex = new RegExp(keyword, 'gi');
    sanitized = sanitized.replace(regex, '[furnishing term removed]');
  });
  
  return sanitized;
}

/**
 * Get suggested alternatives based on routing
 */
export function getBusinessCreditAlternatives(deniedKeywords: string[]): string[] {
  const suggestions: string[] = [];
  
  if (deniedKeywords.some(k => dataFurnishingKeywords.includes(k))) {
    suggestions.push("Data Furnishing is not available. Focus on credit building and monitoring instead.");
  }
  
  if (deniedKeywords.some(k => k.includes('personal credit') || k.includes('fico'))) {
    suggestions.push("Try: 'Monitor business credit score' or 'Review Paydex/Intelliscore'");
  }
  
  if (deniedKeywords.some(k => k.includes('credit card') && !k.includes('business'))) {
    suggestions.push("Try: 'Apply for business credit card' or 'Corporate card strategy'");
  }
  
  if (deniedKeywords.some(k => k.includes('loan') && !k.includes('business'))) {
    suggestions.push("Try: 'Business line of credit' or 'Working capital funding'");
  }
  
  if (deniedKeywords.some(k => k.includes('budget') || k.includes('savings'))) {
    suggestions.push("Try: 'Cash flow management' or 'Fundability profile'");
  }
  
  return suggestions;
}
