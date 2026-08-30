import { useCallback, useEffect, useRef, useState } from "react";
import { useTenantContext } from "@/hooks/useTenantContext";
import { supabase } from "@/integrations/supabase/client";
import { parseMarketplaceRows, summarizeMarketplace, type MarketplaceItem } from "../marketplace-truth";

export type SoloMarketplaceRead = {
  state: "resolving" | "ready" | "unavailable" | "error"; items: MarketplaceItem[];
  summary: ReturnType<typeof summarizeMarketplace>; source: "marketplace_catalog_for_tenant"; refresh: () => void;
};
const emptySummary = summarizeMarketplace([]);

export function useSoloMarketplace(): SoloMarketplaceRead {
  const { activeTenantId, loading, accountContextLoading } = useTenantContext();
  const [state, setState] = useState<SoloMarketplaceRead["state"]>("resolving");
  const [items, setItems] = useState<MarketplaceItem[]>([]);
  const [refreshKey, setRefreshKey] = useState(0);
  const requestFence = useRef(0);
  const refresh = useCallback(() => setRefreshKey((value) => value + 1), []);

  useEffect(() => {
    const fence = ++requestFence.current;
    if (loading || accountContextLoading) { setItems([]); setState("resolving"); return; }
    if (!activeTenantId) { setItems([]); setState("unavailable"); return; }
    setItems([]); setState("resolving");
    void supabase.rpc("marketplace_catalog_for_tenant", { _tenant_id: activeTenantId }).then(({ data, error }) => {
      if (fence !== requestFence.current) return;
      const projected = error ? null : parseMarketplaceRows(data);
      if (!projected) { setItems([]); setState("error"); return; }
      setItems(projected); setState("ready");
    });
    return () => { requestFence.current += 1; };
  }, [activeTenantId, accountContextLoading, loading, refreshKey]);

  return { state, items, summary: state === "ready" ? summarizeMarketplace(items) : emptySummary,
    source: "marketplace_catalog_for_tenant", refresh };
}
