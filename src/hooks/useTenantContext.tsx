/**
 * Tenant context — resolves which tenant the current user is "viewing".
 *
 * - Platform owner (Antonio): sees every tenant; switching writes
 *   `profiles.active_tenant_id` so `current_user_tenant_id()` SQL helper
 *   scopes all reads/writes to the chosen tenant.
 * - Tenant member: sees only their own tenant(s); switching also works
 *   when they belong to multiple.
 *
 * No realtime — this changes rarely. Components call `refresh()` after mutations.
 */
import { useCallback, useEffect, useState } from "react";
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
}

interface TenantContextState {
  loading: boolean;
  isPlatformOwner: boolean;
  tenants: TenantSummary[];
  activeTenantId: string | null;
  activeTenant: TenantSummary | null;
  switchTenant: (tenantId: string | null) => Promise<void>;
  refresh: () => Promise<void>;
}

export function useTenantContext(): TenantContextState {
  const [loading, setLoading] = useState(true);
  const [isPlatformOwner, setIsPlatformOwner] = useState(false);
  const [tenants, setTenants] = useState<TenantSummary[]>([]);
  const [activeTenantId, setActiveTenantId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth.user?.id;
      if (!uid) {
        setTenants([]);
        setActiveTenantId(null);
        setIsPlatformOwner(false);
        return;
      }

      const [{ data: ownerFlag }, { data: profile }, { data: tenantRows }] = await Promise.all([
        supabase.rpc("is_platform_owner"),
        supabase.from("profiles").select("active_tenant_id").eq("user_id", uid).maybeSingle(),
        // RLS already filters: platform owner sees all, members see their own.
        supabase
          .from("tenants")
          .select("id, slug, name, status, plan_offer, seat_limit, customer_limit, owner_user_id")
          .order("created_at", { ascending: true }),
      ]);

      setIsPlatformOwner(Boolean(ownerFlag));
      setTenants((tenantRows ?? []) as TenantSummary[]);
      setActiveTenantId(
        profile?.active_tenant_id ?? (tenantRows?.[0] as TenantSummary | undefined)?.id ?? null,
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
  }, []);

  const activeTenant = tenants.find((t) => t.id === activeTenantId) ?? null;

  return {
    loading,
    isPlatformOwner,
    tenants,
    activeTenantId,
    activeTenant,
    switchTenant,
    refresh: load,
  };
}
