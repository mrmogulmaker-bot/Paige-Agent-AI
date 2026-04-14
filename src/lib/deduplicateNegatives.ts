/**
 * Deduplicates negative items by account identity.
 * Priority 1: account_number match (definitive)
 * Priority 2: normalized creditor_name + account_number_masked composite (fallback)
 * Multiple bureau records for the same underlying account are grouped together.
 */
export interface DeduplicatedNegativeGroup {
  /** Dedup key */
  key: string;
  creditorName: string;
  accountNumberMasked: string | null;
  accountNumber: string | null;
  /** All bureau records for this account */
  records: any[];
  /** Number of bureaus reporting this item */
  bureauCount: number;
  /** List of bureau names */
  bureaus: string[];
  /** Highest amount across bureaus */
  maxAmount: number;
  /** Representative item_type */
  itemType: string;
  /** Representative status */
  status: string;
}

/** Common suffixes to strip for normalization */
const STRIP_SUFFIXES = /\b(INC|LLC|CORP|CORPORATION|NA|N\.A\.|FSB|BANK|BK|FIN|FNCL|FINCL|CO|COMPANY|LTD|LP|FINANCIAL|SERVICES|SVC|SVCS|GROUP|GRP|ASSOC|ASSOCIATION)\b/gi;

/** Normalize a creditor name for dedup comparison */
export function normalizeCreditorName(name: string): string {
  return (name || "unknown")
    .toUpperCase()
    .replace(/[^A-Z0-9\s]/g, "") // remove punctuation
    .replace(STRIP_SUFFIXES, "")  // remove common suffixes
    .replace(/\s+/g, " ")         // collapse whitespace
    .trim();
}

/** Simple Dice coefficient for fuzzy matching */
export function creditorSimilarity(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (a.length < 2 || b.length < 2) return 0;
  const bigrams = new Map<string, number>();
  for (let i = 0; i < a.length - 1; i++) {
    const bi = a.substring(i, i + 2);
    bigrams.set(bi, (bigrams.get(bi) || 0) + 1);
  }
  let intersect = 0;
  for (let i = 0; i < b.length - 1; i++) {
    const bi = b.substring(i, i + 2);
    const count = bigrams.get(bi) || 0;
    if (count > 0) {
      bigrams.set(bi, count - 1);
      intersect++;
    }
  }
  return (2 * intersect) / (a.length - 1 + b.length - 1);
}

export function deduplicateNegativeItems(items: any[]): DeduplicatedNegativeGroup[] {
  const groups = new Map<string, any[]>();

  for (const item of items) {
    const normalizedCreditor = normalizeCreditorName(item.creditor_name || "unknown");
    const acctNum = (item.account_number || "").toLowerCase().trim();
    const acctNumMasked = (item.account_number_masked || "").toLowerCase().trim();

    // Priority 1: Use account_number if available and non-placeholder
    let key: string;
    if (acctNum && !/^(x+|0+)$/i.test(acctNum.replace(/[^0-9a-zA-Z]/g, ""))) {
      key = `acct::${acctNum}`;
    } else {
      // Priority 2: normalized creditor + masked account number
      key = `name::${normalizedCreditor}::${acctNumMasked}`;
    }

    // Check if there's an existing group with a similar normalized creditor name (85%+ match)
    if (!groups.has(key)) {
      let merged = false;
      for (const [existingKey, existingRecords] of groups) {
        if (existingKey.startsWith("name::")) {
          const existingNorm = existingKey.split("::")[1];
          if (creditorSimilarity(normalizedCreditor, existingNorm) >= 0.85) {
            existingRecords.push(item);
            merged = true;
            break;
          }
        }
      }
      if (!merged) {
        groups.set(key, [item]);
      }
    } else {
      groups.get(key)!.push(item);
    }
  }

  return Array.from(groups.entries()).map(([key, records]) => {
    const bureaus = [...new Set(records.map(r => r.bureau || "Unknown"))];
    return {
      key,
      creditorName: records[0].creditor_name || "Unknown",
      accountNumberMasked: records[0].account_number_masked || null,
      accountNumber: records[0].account_number || null,
      records,
      bureauCount: bureaus.length,
      bureaus,
      maxAmount: Math.max(0, ...records.map(r => r.amount || 0)),
      itemType: records[0].item_type || "unknown",
      status: records[0].status || "active",
    };
  });
}

/**
 * Returns the count of unique accounts (deduplicated) from a list of negative items.
 */
export function countUniqueNegativeAccounts(items: any[]): number {
  return deduplicateNegativeItems(items).length;
}
