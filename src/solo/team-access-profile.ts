export type SoloAccessLevel = "hidden" | "view" | "manage";
export type SoloAccessRole = "owner" | "admin" | "member";

export type SoloAccessAreaKey =
  | "command"
  | "clients"
  | "calendar"
  | "campaigns"
  | "analytics"
  | "team"
  | "connections"
  | "integrations"
  | "security"
  | "vault"
  | "billing";

export type SoloAccessArea = {
  key: SoloAccessAreaKey;
  label: string;
  description: string;
  level: SoloAccessLevel;
  ceiling: SoloAccessLevel;
};

export type SoloAccessProfile = {
  permission: SoloAccessRole;
  version: number;
  updatedAt: string | null;
  areas: SoloAccessArea[];
};

export type SoloAccessProfiles = {
  tenantId: string;
  viewerPermission: string;
  canManage: boolean;
  profiles: Record<SoloAccessRole, SoloAccessProfile>;
};

type AreaDefinition = Omit<SoloAccessArea, "level" | "ceiling"> & {
  defaults: Record<SoloAccessRole, SoloAccessLevel>;
  ceilings: Record<SoloAccessRole, SoloAccessLevel>;
};

export const SOLO_ACCESS_AREAS: readonly AreaDefinition[] = [
  { key: "command", label: "Command Center", description: "See the workspace briefing and assigned work.", defaults: { owner: "manage", admin: "manage", member: "view" }, ceilings: { owner: "manage", admin: "manage", member: "view" } },
  { key: "clients", label: "Clients & conversations", description: "Work with confirmed client records and conversations.", defaults: { owner: "manage", admin: "manage", member: "view" }, ceilings: { owner: "manage", admin: "manage", member: "manage" } },
  { key: "calendar", label: "Calendar", description: "See or manage work calendars and availability.", defaults: { owner: "manage", admin: "manage", member: "view" }, ceilings: { owner: "manage", admin: "manage", member: "manage" } },
  { key: "campaigns", label: "Campaigns", description: "See or manage campaigns and pipeline work.", defaults: { owner: "manage", admin: "manage", member: "view" }, ceilings: { owner: "manage", admin: "manage", member: "view" } },
  { key: "analytics", label: "Analytics", description: "See supported, source-labelled business reporting.", defaults: { owner: "manage", admin: "view", member: "view" }, ceilings: { owner: "manage", admin: "view", member: "view" } },
  { key: "team", label: "Team", description: "View the roster or manage invitations and work details. Permission changes remain Owner-only.", defaults: { owner: "manage", admin: "manage", member: "view" }, ceilings: { owner: "manage", admin: "manage", member: "view" } },
  { key: "connections", label: "Connections", description: "Configure provider connections and operational readiness.", defaults: { owner: "manage", admin: "manage", member: "hidden" }, ceilings: { owner: "manage", admin: "manage", member: "hidden" } },
  { key: "integrations", label: "Integrations", description: "Configure supported external bridges.", defaults: { owner: "manage", admin: "manage", member: "hidden" }, ceilings: { owner: "manage", admin: "manage", member: "hidden" } },
  { key: "security", label: "Security & data", description: "Review or manage security and data controls.", defaults: { owner: "manage", admin: "view", member: "hidden" }, ceilings: { owner: "manage", admin: "view", member: "hidden" } },
  { key: "vault", label: "Vault", description: "Access protected workspace materials.", defaults: { owner: "manage", admin: "hidden", member: "hidden" }, ceilings: { owner: "manage", admin: "hidden", member: "hidden" } },
  { key: "billing", label: "Billing", description: "Review or manage billing information.", defaults: { owner: "manage", admin: "hidden", member: "hidden" }, ceilings: { owner: "manage", admin: "hidden", member: "hidden" } },
] as const;

const RANK: Record<SoloAccessLevel, number> = { hidden: 0, view: 1, manage: 2 };
const isLevel = (value: unknown): value is SoloAccessLevel => value === "hidden" || value === "view" || value === "manage";

export function defaultSoloAccessProfile(permission: SoloAccessRole): SoloAccessProfile {
  return {
    permission,
    version: 0,
    updatedAt: null,
    areas: SOLO_ACCESS_AREAS.map((area) => ({
      key: area.key,
      label: area.label,
      description: area.description,
      level: area.defaults[permission],
      ceiling: area.ceilings[permission],
    })),
  };
}

export function validateSoloAccessProfile(
  permission: SoloAccessRole,
  profile: SoloAccessProfile,
): Partial<Record<SoloAccessAreaKey, string>> {
  const errors: Partial<Record<SoloAccessAreaKey, string>> = {};
  const values = new Map(profile.areas.map((area) => [area.key, area.level]));
  for (const definition of SOLO_ACCESS_AREAS) {
    const value = values.get(definition.key);
    if (!isLevel(value)) {
      errors[definition.key] = `${definition.label} needs a valid access level.`;
      continue;
    }
    if (RANK[value] > RANK[definition.ceilings[permission]]) {
      const shown = value.charAt(0).toUpperCase() + value.slice(1);
      errors[definition.key] = `${shown} is above the ${permission.charAt(0).toUpperCase() + permission.slice(1)} ceiling for ${definition.label}.`;
    }
  }
  return errors;
}

export function serializeSoloAccessProfile(profile: SoloAccessProfile): Record<SoloAccessAreaKey, SoloAccessLevel> {
  return Object.fromEntries(profile.areas.map((area) => [area.key, area.level])) as Record<SoloAccessAreaKey, SoloAccessLevel>;
}

export function normalizeSoloAccessProfiles(value: unknown): SoloAccessProfiles | null {
  if (!value || typeof value !== "object") return null;
  const row = value as { tenant_id?: unknown; viewer_permission?: unknown; can_manage?: unknown; profiles?: unknown };
  if (typeof row.tenant_id !== "string" || typeof row.viewer_permission !== "string" || !Array.isArray(row.profiles)) return null;
  const byPermission = new Map<string, { version?: unknown; updated_at?: unknown; areas?: unknown }>();
  for (const candidate of row.profiles) {
    if (!candidate || typeof candidate !== "object") continue;
    const item = candidate as { permission?: unknown; version?: unknown; updated_at?: unknown; areas?: unknown };
    if (typeof item.permission === "string") byPermission.set(item.permission, item);
  }
  const profiles = Object.fromEntries((["owner", "admin", "member"] as const).map((permission) => {
    const fallback = defaultSoloAccessProfile(permission);
    if (permission === "owner") return [permission, fallback];
    const source = byPermission.get(permission);
    const areas = source?.areas && typeof source.areas === "object" && !Array.isArray(source.areas)
      ? source.areas as Record<string, unknown>
      : {};
    return [permission, {
      ...fallback,
      version: Number.isSafeInteger(Number(source?.version)) ? Math.max(0, Number(source?.version)) : 0,
      updatedAt: typeof source?.updated_at === "string" ? source.updated_at : null,
      areas: fallback.areas.map((area) => ({ ...area, level: isLevel(areas[area.key]) ? areas[area.key] : area.level })),
    }];
  })) as Record<SoloAccessRole, SoloAccessProfile>;
  return { tenantId: row.tenant_id, viewerPermission: row.viewer_permission, canManage: row.can_manage === true, profiles };
}
