export type MarketplaceTruthState = "LIVE" | "PARTIAL" | "UNAVAILABLE";

export type MarketplaceCatalogRow = {
  slug: string; item_type: string; name: string; tagline: string | null;
  description: string | null; category: string | null; icon: string | null;
  pricing_model: string | null; price_cents: number | null;
  requires_embedding: boolean | null; installed: boolean | null;
  install_status: string | null; version: string | null;
};

type TruthValue<T> = { state: MarketplaceTruthState; value: T };
export type MarketplaceItem = {
  slug: string; itemType: string; name: string; tagline: string | null;
  description: string | null; category: string; pricingModel: string | null;
  requiresEmbedding: boolean; installed: boolean; installStatus: string | null;
  tenantEligibility: TruthValue<"catalogue record">; releaseVersion: TruthValue<string | null>;
  publisher: TruthValue<null>; releaseIdentity: TruthValue<null>; approvedScope: TruthValue<null>;
  declaredCapabilities: TruthValue<null>; prerequisites: TruthValue<null>; safeState: MarketplaceTruthState;
};

const unavailable = (): TruthValue<null> => ({ state: "UNAVAILABLE", value: null });

export function projectMarketplaceRow(row: MarketplaceCatalogRow): MarketplaceItem {
  const version = typeof row.version === "string" && row.version.trim() ? row.version.trim() : null;
  return {
    slug: row.slug, itemType: row.item_type, name: row.name, tagline: row.tagline,
    description: row.description, category: row.category?.trim() || "Uncategorised",
    pricingModel: row.pricing_model, requiresEmbedding: row.requires_embedding === true,
    installed: row.installed === true && row.install_status === "active", installStatus: row.install_status,
    tenantEligibility: { state: "PARTIAL", value: "catalogue record" },
    releaseVersion: version ? { state: "PARTIAL", value: version } : { state: "UNAVAILABLE", value: null },
    publisher: unavailable(), releaseIdentity: unavailable(), approvedScope: unavailable(),
    declaredCapabilities: unavailable(), prerequisites: unavailable(), safeState: version ? "PARTIAL" : "UNAVAILABLE",
  };
}

export function summarizeMarketplace(items: MarketplaceItem[]) {
  const installedCount = items.filter((item) => item.installed).length;
  return {
    installed: { state: "PARTIAL" as const, count: installedCount },
    updates: { state: "UNAVAILABLE" as const, count: null },
  };
}

export function parseMarketplaceRows(value: unknown): MarketplaceItem[] | null {
  if (!Array.isArray(value)) return null;
  const slugs = new Set<string>();
  const items: MarketplaceItem[] = [];
  for (const candidate of value) {
    if (!candidate || typeof candidate !== "object") return null;
    const row = candidate as Record<string, unknown>;
    if (typeof row.slug !== "string" || !row.slug.trim() || typeof row.item_type !== "string" || !row.item_type.trim() || typeof row.name !== "string" || !row.name.trim()) return null;
    const slug = row.slug.trim();
    if (slugs.has(slug)) return null;
    const optionalStrings = ["tagline", "description", "category", "icon", "pricing_model", "install_status", "version"];
    if (optionalStrings.some((key) => row[key] !== null && row[key] !== undefined && typeof row[key] !== "string")) return null;
    if (row.price_cents !== null && row.price_cents !== undefined && typeof row.price_cents !== "number") return null;
    if (row.requires_embedding !== null && row.requires_embedding !== undefined && typeof row.requires_embedding !== "boolean") return null;
    if (row.installed !== null && row.installed !== undefined && typeof row.installed !== "boolean") return null;
    slugs.add(slug);
    items.push(projectMarketplaceRow({
      slug, item_type: row.item_type.trim(), name: row.name.trim(),
      tagline: (row.tagline as string | null | undefined) ?? null,
      description: (row.description as string | null | undefined) ?? null,
      category: (row.category as string | null | undefined) ?? null,
      icon: (row.icon as string | null | undefined) ?? null,
      pricing_model: (row.pricing_model as string | null | undefined) ?? null,
      price_cents: (row.price_cents as number | null | undefined) ?? null,
      requires_embedding: (row.requires_embedding as boolean | null | undefined) ?? null,
      installed: (row.installed as boolean | null | undefined) ?? null,
      install_status: (row.install_status as string | null | undefined) ?? null,
      version: (row.version as string | null | undefined) ?? null,
    }));
  }
  return items;
}

export function toMarketplacePaigeReference(item: MarketplaceItem) {
  return {
    schema: "marketplace.safe-capability-reference.v1" as const,
    capabilityRef: item.slug, name: item.name, artifactType: item.itemType, category: item.category,
    tenantEligibility: item.tenantEligibility, version: item.releaseVersion,
    releaseIdentity: item.releaseIdentity, approvedScope: item.approvedScope,
    declaredCapabilities: item.declaredCapabilities, prerequisites: item.prerequisites, safeState: item.safeState,
  };
}
