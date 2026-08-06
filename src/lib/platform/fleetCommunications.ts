export type OperatorWorkspace = { id: string; name: string; slug: string; status: string };

/** Canonical Clients taxonomy home; Fleet is only the workspace transition seam. */
export const FLEET_COMMUNICATIONS_DESTINATION = "/admin/clients-hub/conversations";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function parseOperatorWorkspace(value: unknown): OperatorWorkspace | null {
  if (!Array.isArray(value) || value.length !== 1) return null;
  const row = value[0];
  if (!row || typeof row !== "object") return null;
  const item = row as Record<string, unknown>;
  if (
    typeof item.id !== "string" || !UUID_RE.test(item.id) ||
    typeof item.name !== "string" || !item.name.trim() ||
    typeof item.slug !== "string" || !item.slug.trim() ||
    (item.status !== "trial" && item.status !== "active")
  ) return null;
  return { id: item.id, name: item.name, slug: item.slug, status: item.status };
}

export function tenantSwitchPersisted(
  expectedUserId: string,
  row: { user_id?: string } | null,
  error: unknown,
): boolean {
  return !error && row?.user_id === expectedUserId;
}

