import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useTenantContext } from "@/hooks/useTenantContext";
import { parseN8nSpineReadiness, type N8nSafeReadiness } from "../../../supabase/functions/_shared/paige-spine/domains/n8nReadiness";
/** Current workspace evidence only. No provider request, credential read, or event emission. */
export function useN8nSpineReadiness() {
  const { activeTenantId, activeUserId, loading: tenantLoading } = useTenantContext();
  const scope = `${activeUserId ?? ""}:${activeTenantId ?? ""}:${!!tenantLoading}`;
  const identity = useRef(scope); identity.current = scope;
  const generation = useRef(0), mounted = useRef(false);
  const [state, setState] = useState<{ scope: string; loading: boolean; error: boolean; data: N8nSafeReadiness | null }>({scope:"",loading:true,error:false,data:null});
  const refresh = useCallback(async () => {
    if (!mounted.current || identity.current !== scope) return;
    const ticket = ++generation.current;
    setState({scope,loading:true,error:false,data:null});
    const current = () => mounted.current && identity.current === scope && generation.current === ticket;
    if (!activeTenantId || !activeUserId || tenantLoading) { if(current()) setState({scope,loading:false,error:!tenantLoading,data:null}); return; }
    try {
      const {data,error} = await (supabase.rpc as CallableFunction)("get_n8n_spine_readiness");
      if (!current()) return;
      const safe = error ? null : parseN8nSpineReadiness(data, activeTenantId);
      setState({scope,loading:false,error:!safe,data:safe});
    } catch { if(current()) setState({scope,loading:false,error:true,data:null}); }
  },[scope,activeTenantId,activeUserId,tenantLoading]);
  useEffect(()=>{const activeGeneration=generation;mounted.current=true;void refresh();return()=>{mounted.current=false;activeGeneration.current++;};},[refresh]);
  const matches=state.scope===scope;
  return { data:matches&&!tenantLoading?state.data:null, loading:!!tenantLoading||!matches||state.loading, error:matches&&!tenantLoading&&state.error, refresh };
}
