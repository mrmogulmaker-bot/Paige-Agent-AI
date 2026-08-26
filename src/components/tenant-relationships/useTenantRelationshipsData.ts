import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { usePortalConfig } from "@/hooks/usePortalConfig";

export type RelationshipWorkspaceVariant = "relationships" | "clients";

export interface RelationshipPerson {
  id: string;
  name: string;
  company: string | null;
  email: string | null;
  linkedUserId: string | null;
  relationship: string;
  owner: string;
  lastTouch: string | null;
}

interface ClientRow {
  id: string;
  first_name: string | null;
  last_name: string | null;
  entity_name: string | null;
  email: string | null;
  linked_user_id: string | null;
  lifecycle_stage: string | null;
  assigned_coach_user_id: string | null;
  last_contacted_at: string | null;
}

const clientName = (row: ClientRow) => {
  const full = `${row.first_name ?? ""} ${row.last_name ?? ""}`.trim();
  return full || row.entity_name?.trim() || row.email?.trim() || "Unnamed contact";
};

/**
 * Account-keyed read adapter for the approved workspace. The authoritative tenant id comes
 * only from TenantProvider. Explicit tenant filters are defense-in-depth for browser roles
 * whose RLS may span more than one tenant; URL account numbers never enter these queries.
 */
export function useTenantRelationshipsData({
  activeTenantId,
  variant,
}: {
  activeTenantId: string | null;
  variant: RelationshipWorkspaceVariant;
}) {
  const peopleQuery = useQuery({
    queryKey: ["tenant-relationships", "people", activeTenantId],
    enabled: variant === "clients" && !!activeTenantId,
    staleTime: 30_000,
    queryFn: async (): Promise<RelationshipPerson[]> => {
      if (!activeTenantId) return [];
      const { data, error } = await supabase
        .from("clients")
        .select("id,first_name,last_name,entity_name,email,linked_user_id,lifecycle_stage,assigned_coach_user_id,last_contacted_at")
        .eq("tenant_id", activeTenantId)
        .order("created_at", { ascending: false })
        .limit(250);
      if (error) throw error;
      return ((data ?? []) as ClientRow[]).map((row) => ({
        id: row.id,
        name: clientName(row),
        company: row.entity_name?.trim() || null,
        email: row.email?.trim() || null,
        linkedUserId: row.linked_user_id,
        relationship: row.lifecycle_stage?.split("_").join(" ") || "Not classified",
        owner: row.assigned_coach_user_id ? "Assigned owner" : "Unassigned",
        lastTouch: row.last_contacted_at,
      }));
    },
  });

  const portal = usePortalConfig(variant === "clients" ? activeTenantId : null);

  return {
    people: peopleQuery.data ?? [],
    peopleLoading: variant === "clients" && peopleQuery.isLoading,
    peopleError: variant === "clients" && peopleQuery.isError,
    retryPeople: peopleQuery.refetch,
    peopleAvailable: variant === "clients",
    portalConfig: portal.config,
    portalLoading: portal.isLoading,
    portalError: portal.isError,
    retryPortal: portal.refetch,
  };
}
