/**
 * Deduplicates negative items by account identity.
 * Priority 1: account_number match (definitive)
 * Priority 2: creditor_name + account_number_masked composite (fallback)
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

export function deduplicateNegativeItems(items: any[]): DeduplicatedNegativeGroup[] {
  const groups = new Map<string, any[]>();

  for (const item of items) {
    const creditor = (item.creditor_name || "unknown").toLowerCase().trim();
    const acctNum = (item.account_number || "").toLowerCase().trim();
    const acctNumMasked = (item.account_number_masked || "").toLowerCase().trim();

    // Priority 1: Use account_number if available and non-placeholder
    let key: string;
    if (acctNum && !/^(x+|0+)$/i.test(acctNum.replace(/[^0-9a-zA-Z]/g, ""))) {
      key = `acct::${acctNum}`;
    } else {
      // Priority 2: creditor + masked account number
      key = `name::${creditor}::${acctNumMasked}`;
    }

    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(item);
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
