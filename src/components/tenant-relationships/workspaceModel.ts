import type { RouteTierKey } from "@/lib/routing/tierBranches";
import type { RelationshipWorkspaceVariant } from "./useTenantRelationshipsData";

export type WorkspaceTab = "people" | "conversations" | "calendar" | "segments" | "portal";

const RELATIONSHIP_TABS: Array<{ id: WorkspaceTab; label: string }> = [
  { id: "people", label: "People" },
  { id: "conversations", label: "Conversations" },
  { id: "calendar", label: "Calendar" },
  { id: "segments", label: "Segments" },
];

const CLIENT_TABS: Array<{ id: WorkspaceTab; label: string }> = [
  { id: "people", label: "People" },
  { id: "conversations", label: "Conversations" },
  { id: "calendar", label: "Calendar" },
  { id: "portal", label: "Portal" },
];

export function relationshipWorkspaceVariant(accountType?: string | null, parentTenantId?: string | null): RelationshipWorkspaceVariant {
  if (parentTenantId) return "clients";
  return accountType === "agency" || accountType === "enterprise" ? "relationships" : "clients";
}

export function workspaceTabs(variant: RelationshipWorkspaceVariant) {
  return variant === "relationships" ? RELATIONSHIP_TABS : CLIENT_TABS;
}

export function isLegacyRelationshipOwner(routeTier: Extract<RouteTierKey, "agency" | "solo" | "sub_account">, tab: string) {
  return routeTier === "solo" ? tab === "pipe" || tab === "deliv" : tab === "directory" || tab === "pipes";
}
