import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenantContext } from "@/hooks/useTenantContext";

interface ProviderAttribution {
  provided_by: string | null;
  provided_by_logo: string | null;
  provided_by_id: string | null;
}

/**
 * ATTRIBUTION column of the Sub-account tier row (#221 Tier x Capability matrix).
 * Resolves the name of the AGENCY that provides the caller's sub-account so the
 * admin chrome can render a compact "Provided by <agency>" line.
 *
 * Null for every tier that has no provider — God, Agency, Standalone Tenant — so
 * the chrome renders nothing for them (§51 per-tier: the line is sub-account-only).
 * §9: the parent NAME is otherwise unreadable to a sub-account member (tenants RLS
 * blocks it); it is disclosed only through the narrow SECURITY DEFINER RPC.
 */
export function useProviderAttribution() {
  const { loading, isPlatformStaff, activeTenantId } = useTenantContext();

  const query = useQuery({
    // Refetch on scope change so a staff user who scopes into a tenant re-evaluates.
    queryKey: ["provider-attribution", activeTenantId],
    // Platform staff run the God console, never a provided sub-account book (§9) —
    // never even ask for them. A tenant with no parent gets null back.
    enabled: !loading && !isPlatformStaff && activeTenantId !== null,
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<ProviderAttribution> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- new RPC not yet in generated types (#234)
      const { data, error } = await supabase.rpc("subaccount_provider_context" as any);
      if (error) throw error;
      return (data ?? { provided_by: null, provided_by_logo: null, provided_by_id: null }) as ProviderAttribution;
    },
  });

  return {
    providedBy: query.data?.provided_by ?? null,
    providedByLogo: query.data?.provided_by_logo ?? null,
  };
}
