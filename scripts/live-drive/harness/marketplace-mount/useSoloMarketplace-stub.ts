import { projectMarketplaceRow, summarizeMarketplace } from "@/solo/marketplace-truth";

const items = [
  ["synthetic-workflow", "workflow", "Synthetic workflow proof", "Workflow", "Paige builds and runs your plays."],
  ["synthetic-snapshot", "snapshot", "Synthetic snapshot proof", "Reporting", "Recommended because this report pack delivers proven outcomes."],
  ["synthetic-playbook", "playbook", "Synthetic playbook proof", "Operations", "Install it to activate Paige for autonomous execution."],
  ["synthetic-connector", "connector", "Synthetic connector proof", "Connections", "Let clients talk to Paige after purchasing this connector."],
  ["synthetic-tool", "tool", "Synthetic tool module proof", "Tools", "Paige handles the complete pipeline automatically."],
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
