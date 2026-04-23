import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type AccuracyLevel = "high" | "medium" | "estimated";

export interface FinancialDataAccuracy {
  /** "high" = QB connected + recent sync + at least one banking row.
   *  "medium" = some banking_relationships rows OR QB connected without rows yet.
   *  "estimated" = no QB connection AND no manual banking rows. */
  level: AccuracyLevel;
  /** Short label suitable for a chip on a score card. */
  label: string;
  /** Long-form description for tooltip/banner copy. */
  description: string;
  qbConnected: boolean;
  qbLastSyncedAt: string | null;
  /** Number of banking_relationships rows the user has (any source). */
  bankingRowCount: number;
  /** Number of QB-imported banking rows. */
  qbBankingRowCount: number;
}

/**
 * Determines how accurate this user's fundability scoring inputs are.
 * Used for the "High Accuracy / Medium / Estimated" chip on ScoreCards
 * and to drive Paige's QB-connection coaching.
 */
export function useFinancialDataAccuracy(userId: string | null | undefined) {
  return useQuery<FinancialDataAccuracy>({
    queryKey: ["financial-data-accuracy", userId],
    enabled: !!userId,
    staleTime: 60_000,
    queryFn: async () => {
      const [qbRes, banksRes] = await Promise.all([
        supabase
          .from("quickbooks_connections")
          .select("last_synced_at, is_active")
          .eq("user_id", userId!)
          .eq("is_active", true)
          .maybeSingle(),
        supabase
          .from("banking_relationships" as any)
          .select("source", { count: "exact" })
          .eq("user_id", userId!),
      ]);

      const qbConnected = !!qbRes.data;
      const qbLastSyncedAt = qbRes.data?.last_synced_at ?? null;

      // banks rows
      const rows: { source?: string }[] = (banksRes.data as any[]) ?? [];
      const bankingRowCount = rows.length;
      const qbBankingRowCount = rows.filter(r => r.source === "quickbooks").length;

      let level: AccuracyLevel = "estimated";
      if (qbConnected && qbBankingRowCount > 0) level = "high";
      else if (qbConnected || bankingRowCount > 0) level = "medium";

      const label =
        level === "high"
          ? "High Accuracy"
          : level === "medium"
          ? "Medium Accuracy"
          : "Estimated";

      const description =
        level === "high"
          ? "Based on verified financial data from QuickBooks plus your Financial Profile."
          : level === "medium"
          ? qbConnected
            ? "QuickBooks is connected but more banking detail will sharpen this score — finish your Financial Profile."
            : "Connect QuickBooks for more precise scoring based on verified bank data."
          : "Estimated from credit data only — add banking data or connect QuickBooks to improve accuracy.";

      return {
        level,
        label,
        description,
        qbConnected,
        qbLastSyncedAt,
        bankingRowCount,
        qbBankingRowCount,
      };
    },
  });
}
