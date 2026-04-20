import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface EconomicRate {
  series_id: string;
  series_name: string;
  value: number;
  observation_date: string;
  fetched_at: string;
  expires_at: string;
}

export interface EconomicRatesMap {
  PRIME?: EconomicRate;
  FEDFUNDS?: EconomicRate;
  DGS10?: EconomicRate;
  DGS30?: EconomicRate;
  MORTGAGE30US?: EconomicRate;
  MORTGAGE15US?: EconomicRate;
  DPCREDIT?: EconomicRate;
  TERMCBPER24NS?: EconomicRate;
}

export function useEconomicRates() {
  return useQuery({
    queryKey: ["economic-rates"],
    queryFn: async () => {
      // Read cache first
      const { data: cached } = await supabase
        .from("economic_rates_cache" as any)
        .select("*");

      const now = Date.now();
      const stale =
        !cached ||
        cached.length === 0 ||
        cached.some(
          (c: any) => new Date(c.expires_at).getTime() < now
        );

      let rows: any[] = cached || [];

      if (stale) {
        try {
          const { data } = await supabase.functions.invoke(
            "fetch-economic-rates"
          );
          if (data?.rates) rows = data.rates;
        } catch (err) {
          console.warn("fetch-economic-rates failed, using cached", err);
        }
      }

      const map: EconomicRatesMap = {};
      for (const r of rows) {
        (map as any)[r.series_id] = r as EconomicRate;
      }
      return map;
    },
    staleTime: 1000 * 60 * 30, // 30 minutes client-side
  });
}

/** Convenience: format a "Rates as of [date]" string from any rate row */
export function formatRatesAsOf(rate?: EconomicRate): string {
  if (!rate) return "";
  const d = new Date(rate.observation_date);
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
