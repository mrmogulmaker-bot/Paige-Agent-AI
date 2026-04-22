import { useQueryClient } from "@tanstack/react-query";

/**
 * Single source of truth for refreshing every cache that feeds the BUILD
 * Business program. Call this whenever an upstream input changes:
 *   - business profile saved (EIN, formation, bank, DUNS)
 *   - bureau scores updated (Paydex, Intelliscore, Equifax)
 *   - vendor tradeline added / edited / removed
 *   - financial KPIs recomputed (avg balance, DSCR)
 *   - bank account synced
 *
 * Pair this with `useFundabilityRefresh` when a change touches both the
 * personal/business fundability scores and the BUILD ladder.
 */
export function useBuildScoreRefresh() {
  const queryClient = useQueryClient();

  const invalidate = () => {
    // Live-computed BUILD score and its tier ladder
    queryClient.invalidateQueries({ queryKey: ["build-score"] });
    // Vendor counts surfaced by BuildProgramBusinessWrapper
    queryClient.invalidateQueries({ queryKey: ["business-vendors"] });
    // Financial KPI inputs (DSCR, balance) feeding funding readiness
    queryClient.invalidateQueries({ queryKey: ["financial-kpis"] });
    // Business credit dashboard cards
    queryClient.invalidateQueries({ queryKey: ["business-credit"] });
    queryClient.invalidateQueries({ queryKey: ["business-credit-overview"] });
    queryClient.invalidateQueries({ queryKey: ["business-credit-bureaus"] });
    // Business profile cards (entity, EIN, bank)
    queryClient.invalidateQueries({ queryKey: ["businesses"] });
    queryClient.invalidateQueries({ queryKey: ["business-summary"] });
  };

  return { invalidate };
}
