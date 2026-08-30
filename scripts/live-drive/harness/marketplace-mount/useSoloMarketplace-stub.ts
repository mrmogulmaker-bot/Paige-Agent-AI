import { projectMarketplaceRow, summarizeMarketplace } from "@/solo/marketplace-truth";

const items = [
  ["synthetic-workflow", "workflow", "Synthetic workflow proof", "Workflow", "A synthetic record used only to exercise responsive card copy."],
  ["synthetic-snapshot", "snapshot", "Synthetic snapshot proof", "Reporting", "A synthetic read-only snapshot record for local geometry proof."],
  ["synthetic-playbook", "playbook", "Synthetic playbook proof", "Operations", "A synthetic playbook record with longer text to test wrapping safely."],
  ["synthetic-connector", "connector", "Synthetic connector proof", "Connections", "A synthetic connector record; no provider or activation is implied."],
  ["synthetic-tool", "tool", "Synthetic tool module proof", "Tools", "A synthetic tool record whose runtime declaration remains unavailable."],
].map(([slug, item_type, name, category, tagline], index) => projectMarketplaceRow({
  slug, item_type, name, category, tagline,
  description: `${tagline} This local harness is not tenant data and does not prove release authority.`,
  icon: null, pricing_model: "free", price_cents: 0, requires_embedding: false,
  installed: false, install_status: null, version: index === 4 ? null : `0.${index + 1}.0`,
}));

export function useSoloMarketplace() {
  return { state: "ready" as const, items, summary: summarizeMarketplace(items),
    source: "marketplace_catalog_for_tenant" as const, refresh: () => undefined };
}
