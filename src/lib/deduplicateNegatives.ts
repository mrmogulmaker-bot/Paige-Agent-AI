/**
 * Deduplicates negative items by account identity (creditor_name + account_number_masked).
 * Multiple bureau records for the same underlying account are grouped together.
 * Returns unique account groups with bureau count metadata.
 */
export interface DeduplicatedNegativeGroup {
  /** Dedup key */
  key: string;
  creditorName: string;
  accountNumberMasked: string | null;
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
    const acctNum = (item.account_number_masked || "").toLowerCase().trim();
    // Use creditor + account number as the dedup key
    const key = `${creditor}::${acctNum}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(item);
  }

  return Array.from(groups.entries()).map(([key, records]) => {
    const bureaus = [...new Set(records.map(r => r.bureau || "Unknown"))];
    return {
      key,
      creditorName: records[0].creditor_name || "Unknown",
      accountNumberMasked: records[0].account_number_masked || null,
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
