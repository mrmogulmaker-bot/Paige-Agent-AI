import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Single source of truth for refreshing every cache that feeds the three
 * fundability scores. Call this whenever an upstream input changes:
 *   - credit report finished extracting
 *   - business profile fields edited
 *   - negative items added / removed / disputed
 *   - dispute outcome resolved
 *
 * `runFactorRecalc` additionally fires the `calculate-credit-factors`
 * edge function so `credit_factor_scores` reflects the latest data
 * before the UI re-renders. Skip it for cheap UI-only changes.
 */
export function useFundabilityRefresh() {
  const queryClient = useQueryClient();

  const invalidate = () => {
    // Score inputs
    queryClient.invalidateQueries({ queryKey: ["three-fundability-inputs"] });
    queryClient.invalidateQueries({ queryKey: ["credit-factors"] });
    queryClient.invalidateQueries({ queryKey: ["credit-factors-history"] });
    // Downstream views that read the score
    queryClient.invalidateQueries({ queryKey: ["funding-readiness-supplemental"] });
    queryClient.invalidateQueries({ queryKey: ["funding-matches"] });
    queryClient.invalidateQueries({ queryKey: ["funding-matches-profile-scores"] });
    queryClient.invalidateQueries({ queryKey: ["credit-score-overview-stats"] });
    queryClient.invalidateQueries({ queryKey: ["bureau-scores"] });
    queryClient.invalidateQueries({ queryKey: ["credit-health-assessment"] });
  };

  const refresh = async (opts: { runFactorRecalc?: boolean } = {}) => {
    const { runFactorRecalc = false } = opts;

    if (runFactorRecalc) {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
          // Fire-and-forget; the invalidation below will pull the new row
          // once the function completes. We still await to avoid races
          // when the caller wants the UI to settle on fresh data.
          await supabase.functions.invoke("calculate-credit-factors", {
            headers: { Authorization: `Bearer ${session.access_token}` },
          });
        }
      } catch (err) {
        // Never block the upstream mutation because of a recalc failure
        console.warn("[useFundabilityRefresh] factor recalc failed", err);
      }
    }

    invalidate();
  };

  return { refresh, invalidate };
}
