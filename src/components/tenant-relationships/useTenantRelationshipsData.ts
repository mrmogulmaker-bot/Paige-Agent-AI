import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { usePortalConfig } from "@/hooks/usePortalConfig";

export type RelationshipWorkspaceVariant = "relationships" | "clients";

export interface RelationshipPerson {
  id: string;
  firstName: string;
  lastName: string;
  name: string;
  recordType: "person" | "business";
  entityType: string | null;
  company: string | null;
  email: string | null;
  phone: string | null;
  title: string | null;
  website: string | null;
  linkedinUrl: string | null;
  streetAddress: string | null;
  city: string | null;
  state: string | null;
  zipCode: string | null;
  location: string | null;
  source: string | null;
  status: string;
  tags: string[];
  doNotContact: boolean;
  sharedContextConsent: boolean;
  linkedUserId: string | null;
  relationship: string;
  lifecycleStage: string;
  primaryOffer: string | null;
  notes: string | null;
  assignedCoachUserId: string | null;
  owner: string;
  lastTouch: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}

interface ClientRow {
  id: string;
  first_name: string | null;
  last_name: string | null;
  entity_name: string | null;
  entity_type: string | null;
  email: string | null;
  phone: string | null;
  title: string | null;
  website: string | null;
  linkedin_url: string | null;
  street_address: string | null;
  city: string | null;
  state: string | null;
  zip_code: string | null;
  source: string | null;
  status: string;
  tags: string[];
  do_not_contact: boolean;
  paige_shared_context_consent: boolean;
  linked_user_id: string | null;
  lifecycle_stage: string | null;
  primary_offer: string | null;
  current_notes: string | null;
  assigned_coach_user_id: string | null;
  last_contacted_at: string | null;
  created_at: string;
  updated_at: string;
}

const clientName = (row: ClientRow) => {
  const full = `${row.first_name ?? ""} ${row.last_name ?? ""}`.trim();
  const company = row.entity_name?.trim();
  if (company && (Boolean(row.entity_type?.trim()) || !full)) return company;
  return full || company || row.email?.trim() || "Unnamed contact";
};

const trimOrNull = (value: string | null | undefined) => value?.trim() || null;

const recordType = (row: ClientRow): RelationshipPerson["recordType"] => {
  const hasPersonName = Boolean(trimOrNull(row.first_name) || trimOrNull(row.last_name));
  const hasBusinessEvidence = Boolean(trimOrNull(row.entity_type)) || (!hasPersonName && Boolean(trimOrNull(row.entity_name)));
  return hasBusinessEvidence ? "business" : "person";
};

const mapClient = (row: ClientRow): RelationshipPerson => ({
  id: row.id,
  firstName: row.first_name ?? "",
  lastName: row.last_name ?? "",
  name: clientName(row),
  recordType: recordType(row),
  entityType: trimOrNull(row.entity_type),
  company: trimOrNull(row.entity_name),
  email: trimOrNull(row.email),
  phone: trimOrNull(row.phone),
  title: trimOrNull(row.title),
  website: trimOrNull(row.website),
  linkedinUrl: trimOrNull(row.linkedin_url),
  streetAddress: trimOrNull(row.street_address),
  city: trimOrNull(row.city),
  state: trimOrNull(row.state),
  zipCode: trimOrNull(row.zip_code),
  location: [trimOrNull(row.city), trimOrNull(row.state)].filter(Boolean).join(", ") || null,
  source: trimOrNull(row.source),
  status: trimOrNull(row.status) || "Not classified",
  tags: Array.isArray(row.tags) ? row.tags.filter((tag): tag is string => typeof tag === "string" && Boolean(tag.trim())) : [],
  doNotContact: Boolean(row.do_not_contact),
  sharedContextConsent: Boolean(row.paige_shared_context_consent),
  linkedUserId: row.linked_user_id,
  relationship: row.lifecycle_stage?.split("_").join(" ") || "Not classified",
  lifecycleStage: trimOrNull(row.lifecycle_stage) || "new_lead",
  primaryOffer: trimOrNull(row.primary_offer),
  notes: trimOrNull(row.current_notes),
  assignedCoachUserId: row.assigned_coach_user_id,
  owner: row.assigned_coach_user_id ? "Assigned owner" : "Unassigned",
  lastTouch: row.last_contacted_at,
  createdAt: row.created_at ?? null,
  updatedAt: row.updated_at ?? null,
});

/**
 * Account-keyed read adapter for the approved workspace. The authoritative tenant id comes
 * only from TenantProvider. Explicit tenant filters are defense-in-depth for browser roles
 * whose RLS may span more than one tenant; URL account numbers never enter these queries.
 */
export function useTenantRelationshipsData({
  activeTenantId,
  variant,
  soloPeople = false,
  deepLinkedContactId = null,
}: {
  activeTenantId: string | null;
  variant: RelationshipWorkspaceVariant;
  soloPeople?: boolean;
  deepLinkedContactId?: string | null;
}) {
  const peopleQuery = useQuery({
    queryKey: ["tenant-relationships", "people", activeTenantId, soloPeople ? "solo-enriched" : "legacy"],
    enabled: variant === "clients" && !!activeTenantId,
    staleTime: 30_000,
    queryFn: async (): Promise<RelationshipPerson[]> => {
      if (!activeTenantId) return [];
      const { data, error } = await supabase
        .from("clients")
        .select(soloPeople
          ? "id,first_name,last_name,entity_name,entity_type,email,phone,title,website,linkedin_url,street_address,city,state,zip_code,source,status,tags,do_not_contact,paige_shared_context_consent,linked_user_id,lifecycle_stage,primary_offer,current_notes,assigned_coach_user_id,last_contacted_at,created_at,updated_at"
          : "id,first_name,last_name,entity_name,email,linked_user_id,lifecycle_stage,assigned_coach_user_id,last_contacted_at")
        .eq("tenant_id", activeTenantId)
        .order("created_at", { ascending: false })
        .limit(250);
      if (error) throw error;
      return ((data ?? []) as unknown as ClientRow[]).map(mapClient);
    },
  });

  const deepLinkQuery = useQuery({
    queryKey: ["tenant-relationships", "person", activeTenantId, deepLinkedContactId],
    enabled: soloPeople && !!activeTenantId && !!deepLinkedContactId,
    staleTime: 30_000,
    queryFn: async (): Promise<RelationshipPerson | null> => {
      if (!activeTenantId || !deepLinkedContactId) return null;
      const { data, error } = await supabase
        .from("clients")
        .select("id,first_name,last_name,entity_name,entity_type,email,phone,title,website,linkedin_url,street_address,city,state,zip_code,source,status,tags,do_not_contact,paige_shared_context_consent,linked_user_id,lifecycle_stage,primary_offer,current_notes,assigned_coach_user_id,last_contacted_at,created_at,updated_at")
        .eq("tenant_id", activeTenantId)
        .eq("id", deepLinkedContactId)
        .maybeSingle();
      if (error) throw error;
      return data ? mapClient(data as ClientRow) : null;
    },
  });

  const portal = usePortalConfig(variant === "clients" ? activeTenantId : null);

  return {
    people: peopleQuery.data ?? [],
    peopleLoading: variant === "clients" && peopleQuery.isLoading,
    peopleError: variant === "clients" && peopleQuery.isError,
    retryPeople: peopleQuery.refetch,
    peopleAvailable: variant === "clients",
    deepLinkedPerson: deepLinkQuery.data ?? null,
    deepLinkLoading: deepLinkQuery.isLoading && deepLinkQuery.fetchStatus === "fetching",
    deepLinkError: deepLinkQuery.isError,
    portalConfig: portal.config,
    portalLoading: portal.isLoading,
    portalError: portal.isError,
    retryPortal: portal.refetch,
  };
}
