import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Agency (portfolio) rollups — ONE parentage-gated RPC that collapses the old
 * AgencyBoard per-child N+1 (agency_list_my_subaccounts → agency_subaccount_metrics
 * per child) into a single call. Covers ONLY the caller's own children (§9): the
 * RPC gates on lineage and RAISEs 42501 for a non-agency caller — it never reads
 * another agency's book.
 *
 * Every field is optional: agency_portfolio_metrics omits any metric it has no
 * real source for (§13), and the board renders a tile/section only when its key
 * is present. No fabricated numbers ever reach this layer.
 */
export type PortfolioHealthKey = "healthy" | "watch" | "at_risk";

export interface PortfolioHealth {
  healthy: number;
  watch: number;
  at_risk: number;
}

export interface LeaderboardRow {
  tenant_id: string;
  name: string;
  client_count: number;
  mrr_cents: number;
  health: PortfolioHealthKey;
}

export interface AgencyPortfolioMetrics {
  active_subaccounts?: number;
  subaccounts_added?: number;
  subaccounts_churned?: number;
  net_growth?: number;
  portfolio_mrr_cents?: number;
  at_risk_subaccounts?: number;
  clients_under_mgmt?: number;
  health?: PortfolioHealth;
  leaderboard?: LeaderboardRow[];
}

const POLL = { refetchInterval: 45_000, refetchOnWindowFocus: true } as const;

export function useAgencyPortfolio() {
  const portfolio = useQuery({
    queryKey: ["agency-portfolio-metrics"],
    queryFn: async (): Promise<AgencyPortfolioMetrics> => {
      // Not yet in the generated RPC types (migration lands separately); cast the
      // name only, same convention as agency_enter_subaccount in AgencyBoard.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await supabase.rpc("agency_portfolio_metrics" as any);
      if (error) throw error;
      return (data ?? {}) as AgencyPortfolioMetrics;
    },
    ...POLL,
  });

  return {
    portfolio: portfolio.data,
    loading: portfolio.isLoading,
    isError: portfolio.isError,
    refetch: () => portfolio.refetch(),
  };
}
