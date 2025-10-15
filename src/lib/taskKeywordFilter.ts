/**
 * Keyword filtering system for Personal Credit vs Business Credit tasks
 * Ensures strict separation between personal and business credit content
 */

export const personalCreditKeywords = {
  allow: [
    "personal credit",
    "credit score",
    "credit report",
    "experian",
    "equifax",
    "transunion",
    "dispute",
    "fcra",
    "fdcpa",
    "inquiry removal",
    "late payment",
    "goodwill",
    "utilization",
    "secured card",
    "credit-builder loan",
    "authorized user",
    "budget",
    "savings",
    "debt to income",
    "monitoring",
    "fraud alert",
    "freeze",
    "thaw",
    "identity theft",
    "consumer reports",
    "fico score",
    "payment history",
    "credit limit",
    "hard inquiry",
    "soft inquiry",
    "credit utilization",
    "credit mix",
    "credit age",
    "personal finance",
    "emergency fund",
    "debt payoff",
    "credit repair",
    "credit building",
    "credit monitoring",
    "annual credit report",
    "credit freeze",
    "credit lock",
    "identity protection",
  ],
  deny: [
    "ein",
    "llc",
    "duns",
    "net 30",
    "vendor account",
    "trade line business",
    "metro 2",
    "e-oscar",
    "subscriber code",
    "data furnishing",
    "nav.com business",
    "funding",
    "bloc",
    "business card",
    "paydex",
    "ucc filing",
    "sam.gov",
    "govcon",
    "aged corp",
    "business credit",
    "d&b",
    "dun & bradstreet",
    "business formation",
    "business bank",
    "business entity",
    "business ein",
    "business loan",
    "sba loan",
    "business funding",
    "trade credit",
    "vendor credit",
    "build framework",
  ],
  rerouteMessage: "That request belongs in Business Credit/Funding. Want me to move it there?",
};

export interface FilterResult {
  isAllowed: boolean;
  reason?: string;
  deniedKeywords?: string[];
  shouldReroute: boolean;
  rerouteMessage?: string;
}

/**
 * Check if text contains business credit keywords (should be denied in Personal Credit)
 */
export function containsBusinessKeywords(text: string): string[] {
  const lowerText = text.toLowerCase();
  return personalCreditKeywords.deny.filter((keyword) =>
    lowerText.includes(keyword.toLowerCase())
  );
}

/**
 * Check if text contains personal credit keywords (should be allowed)
 */
export function containsPersonalKeywords(text: string): string[] {
  const lowerText = text.toLowerCase();
  return personalCreditKeywords.allow.filter((keyword) =>
    lowerText.includes(keyword.toLowerCase())
  );
}

/**
 * Validate if task content is appropriate for Personal Credit section
 */
export function validatePersonalCreditTask(
  title: string,
  description: string = ""
): FilterResult {
  const combinedText = `${title} ${description}`;
  const deniedKeywords = containsBusinessKeywords(combinedText);

  if (deniedKeywords.length > 0) {
    return {
      isAllowed: false,
      reason: `Contains business credit keywords: ${deniedKeywords.join(", ")}`,
      deniedKeywords,
      shouldReroute: true,
      rerouteMessage: personalCreditKeywords.rerouteMessage,
    };
  }

  // Optional: Check if it contains at least some personal credit keywords
  const personalKeywords = containsPersonalKeywords(combinedText);
  
  // If it doesn't contain business keywords, it's allowed
  // But we can suggest it might be more appropriate for personal if it has personal keywords
  return {
    isAllowed: true,
    shouldReroute: false,
  };
}

/**
 * Sanitize task content by removing business credit keywords
 * Use this as a fallback to clean up user input
 */
export function sanitizeForPersonalCredit(text: string): string {
  let sanitized = text;
  
  personalCreditKeywords.deny.forEach((keyword) => {
    const regex = new RegExp(`\\b${keyword}\\b`, "gi");
    sanitized = sanitized.replace(regex, "[business term removed]");
  });
  
  return sanitized;
}

/**
 * Generate helpful suggestions when business keywords are detected
 */
export function getPersonalCreditAlternatives(deniedKeywords: string[]): string[] {
  const alternatives: Record<string, string> = {
    "ein": "SSN (for personal credit)",
    "llc": "individual credit profile",
    "business credit": "personal credit",
    "vendor account": "personal credit card",
    "business card": "personal credit card",
    "business loan": "personal loan",
    "funding": "personal savings or personal loan",
    "duns": "credit score (FICO)",
    "paydex": "FICO score",
    "business formation": "credit building",
    "net 30": "payment plans",
    "trade credit": "credit cards or personal loans",
  };

  return deniedKeywords
    .map((keyword) => {
      const alt = alternatives[keyword.toLowerCase()];
      return alt ? `Instead of "${keyword}", consider: ${alt}` : null;
    })
    .filter(Boolean) as string[];
}
