/**
 * Tenant context — resolves which tenant the current user is "viewing".
 *
 * - Platform owner (Paige Agent AI master admin): sees every tenant; switching
 *   writes `profiles.active_tenant_id` so the `current_user_tenant_id()` SQL
 *   helper scopes all reads/writes to the chosen tenant.
 * - Tenant member: sees only their own tenant(s); switching also works
 *   when they belong to multiple.
 *
 * No realtime — this changes rarely. Components call `refresh()` after mutations.
 */
import { useCallback, useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface TenantSummary {
  id: string;
  slug: string;
  name: string;
  status: string;
  plan_offer: string | null;
  seat_limit: number;
  customer_limit: number;
  owner_user_id: string | null;
  /** Capability flag: 'standalone' | 'agency' | 'enterprise'. Gates sub-accounts. */
  account_type: string;
  parent_tenant_id: string | null;
}

interface TenantContextState {
  loading: boolean;
  isPlatformOwner: boolean;
  /** Owner OR scoped Platform Admin — sees the God console instead of the agency CRM. */
  isPlatformStaff: boolean;
  tenants: TenantSummary[];
  activeTenantId: string | null;
  activeTenant: TenantSummary | null;
  switchTenant: (tenantId: string | null) => Promise<void>;
  refresh: () => Promise<void>;
}

export function useTenantContext(): TenantContextState {
  const [loading, setLoading] = useState(true);
  const [isPlatformOwner, setIsPlatformOwner] = useState(false);
  const [isPlatformStaff, setIsPlatformStaff] = useState(false);
  const [tenants, setTenants] = useState<TenantSummary[]>([]);
  const [activeTenantId, setActiveTenantId] = useState<string | null>(null);

  // Scope-staleness guard (§9). Switching the active tenant changes the scope of
  // EVERY tenant-scoped React Query cache entry, so on a switch we invalidate the
  // whole cache and let scope-dependent data refetch under the new scope. Guarded
  // with try/catch so this hook still works if it is ever rendered outside the
  // app's QueryClientProvider (then invalidation is simply skipped — never a crash).
  let queryClient: ReturnType<typeof useQueryClient> | null = null;
  try {
    // eslint-disable-next-line react-hooks/rules-of-hooks -- useContext always runs; the throw is post-registration so hook order stays stable.
    queryClient = useQueryClient();
  } catch {
    queryClient = null;
  }

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth.user?.id;
      if (!uid) {
        setTenants([]);
        setActiveTenantId(null);
        setIsPlatformOwner(false);
        setIsPlatformStaff(false);
        return;
      }

      const [{ data: ownerFlag }, { data: staffFlag }, { data: profile }, { data: tenantRows }] = await Promise.all([
        supabase.rpc("is_platform_owner"),
        supabase.rpc("is_platform_admin"),
        supabase.from("profiles").select("active_tenant_id").eq("user_id", uid).maybeSingle(),
        // RLS already filters: platform staff see all, members see their own.
        supabase
          .from("tenants")
          .select("id, slug, name, status, plan_offer, seat_limit, customer_limit, owner_user_id, account_type, parent_tenant_id")
          .order("created_at", { ascending: true }),
      ]);

      setIsPlatformOwner(Boolean(ownerFlag));
      setIsPlatformStaff(Boolean(staffFlag));
      setTenants((tenantRows ?? []) as TenantSummary[]);
      // Platform staff must NOT be auto-scoped into a tenant just because RLS
      // lets them read all of them — they operate at the God tier by default.
      setActiveTenantId(
        profile?.active_tenant_id ??
          (staffFlag ? null : (tenantRows?.[0] as TenantSummary | undefined)?.id ?? null),
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const switchTenant = useCallback(async (tenantId: string | null) => {
    const { data: auth } = await supabase.auth.getUser();
    const uid = auth.user?.id;
    if (!uid) return;
    await supabase.from("profiles").update({ active_tenant_id: tenantId }).eq("user_id", uid);
    setActiveTenantId(tenantId);
    // Scope changed for everything — a broad invalidate is correct here (§9).
    queryClient?.invalidateQueries();
  }, [queryClient]);

  const activeTenant = tenants.find((t) => t.id === activeTenantId) ?? null;

  return {
    loading,
    isPlatformOwner,
    isPlatformStaff,
    tenants,
    activeTenantId,
    activeTenant,
    switchTenant,
    refresh: load,
  };
}
