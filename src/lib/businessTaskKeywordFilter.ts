/**
 * Business Credit Task Keyword Filter
 * Validates that tasks are appropriate for Business Credit/Funding section
 * Blocks: Personal Credit keywords and Data Furnishing requests
 */

// Keywords allowed in Business Credit tasks
const businessCreditKeywords = {
  allow: [
    // Business formation
    "ein", "llc", "corporation", "s-corp", "c-corp", "registered agent", "dba",
    "business license", "formation", "articles of organization",
    
    // Business credit
    "d-u-n-s", "duns", "paydex", "business credit", "vendor credit", "tradeline",
    "commercial credit", "experian business", "equifax business", "d&b",
    
    // Funding
    "funding", "business loan", "business line of credit", "revenue", "working capital",
    "merchant cash advance", "mca", "term loan", "equipment financing",
    
    // Vendor tiers
    "vendor", "tier 1", "tier 2", "tier 3", "net-30", "uline", "quill", "grainger",
    "fleet card", "telecom", "amazon business",
    
    // Compliance
    "annual report", "business compliance", "license renewal", "permit",
    "registered agent", "business structure"
  ],
  
  // Keywords that should trigger reroute to Personal Credit
  deny_personal: [
    "personal credit", "fico", "vantagescore", "consumer credit", "ssn",
    "experian consumer", "equifax consumer", "transunion consumer",
    "credit card", "personal loan", "auto loan", "mortgage",
    "student loan", "personal finance", "budget", "savings",
    "fcra", "fdcpa", "debt collector", "collection account",
    "goodwill letter", "credit freeze", "fraud alert", "inquiry removal",
    "utilization" // when used in personal context
  ],
  
  // Keywords that should trigger Data Furnishing block
  deny_furnishing: [
    "data furnishing", "furnish data", "metro 2", "metro2", "e-oscar",
    "furnisher", "furnishing service", "credit reporting agency", "cra reporting",
    "upload to bureau", "report to bureau", "metro 2 file", "cddf"
  ]
};

const reroutePersonalMessage = "That belongs in Personal Credit—move it there?";
const blockFurnishingMessage = "Data Furnishing features are not supported inside Paige.";

export interface BusinessFilterResult {
  isAllowed: boolean;
  reason?: string;
  deniedKeywords?: string[];
  shouldReroute?: boolean;
  rerouteMessage?: string;
  isDataFurnishing?: boolean;
}

/**
 * Check if text contains Data Furnishing keywords
 */
export function containsDataFurnishingKeywords(text: string): string[] {
  const lowerText = text.toLowerCase();
  return businessCreditKeywords.deny_furnishing.filter(keyword => 
    lowerText.includes(keyword.toLowerCase())
  );
}

/**
 * Check if text contains Personal Credit keywords
 */
export function containsPersonalCreditKeywords(text: string): string[] {
  const lowerText = text.toLowerCase();
  return businessCreditKeywords.deny_personal.filter(keyword => 
    lowerText.includes(keyword.toLowerCase())
  );
}

/**
 * Check if text contains Business Credit keywords
 */
export function containsBusinessKeywords(text: string): string[] {
  const lowerText = text.toLowerCase();
  return businessCreditKeywords.allow.filter(keyword => 
    lowerText.includes(keyword.toLowerCase())
  );
}

/**
 * Validate that a task is appropriate for Business Credit section
 */
export function validateBusinessCreditTask(
  title: string,
  description?: string
): BusinessFilterResult {
  const fullText = `${title} ${description || ""}`;
  
  // First check: Data Furnishing (highest priority block)
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
  
  // Second check: Personal Credit keywords
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
  
  // Third check: Should contain at least some business keywords for business tasks
  const businessKeywords = containsBusinessKeywords(fullText);
  if (businessKeywords.length === 0) {
    return {
      isAllowed: false,
      reason: "No business credit keywords found. Try being more specific about the business credit/funding task.",
      deniedKeywords: [],
      shouldReroute: false
    };
  }
  
  return {
    isAllowed: true
  };
}

/**
 * Sanitize text by removing personal credit keywords
 */
export function sanitizeForBusinessCredit(text: string): string {
  let sanitized = text;
  
  businessCreditKeywords.deny_personal.forEach(keyword => {
    const regex = new RegExp(keyword, 'gi');
    sanitized = sanitized.replace(regex, '[personal term removed]');
  });
  
  businessCreditKeywords.deny_furnishing.forEach(keyword => {
    const regex = new RegExp(keyword, 'gi');
    sanitized = sanitized.replace(regex, '[furnishing term removed]');
  });
  
  return sanitized;
}

/**
 * Get suggested alternatives when personal keywords are detected
 */
export function getBusinessCreditAlternatives(deniedKeywords: string[]): string[] {
  const suggestions: string[] = [];
  
  if (deniedKeywords.some(k => k.includes('personal credit') || k.includes('fico'))) {
    suggestions.push("Try: 'Monitor business credit score' or 'Review Paydex score'");
  }
  
  if (deniedKeywords.some(k => k.includes('credit card'))) {
    suggestions.push("Try: 'Apply for business credit card' or 'Vendor credit account'");
  }
  
  if (deniedKeywords.some(k => k.includes('loan'))) {
    suggestions.push("Try: 'Business loan application' or 'Working capital funding'");
  }
  
  if (deniedKeywords.some(k => k.includes('budget') || k.includes('savings'))) {
    suggestions.push("Try: 'Revenue planning' or 'Cash flow management'");
  }
  
  return suggestions;
}
