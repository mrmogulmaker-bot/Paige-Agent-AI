import { describe, expect, it } from "vitest";

import {
  projectMarketplaceRow,
  parseMarketplaceRows,
  summarizeMarketplace,
  toMarketplacePaigeReference,
  type MarketplaceCatalogRow,
} from "./marketplace-truth";

const row: MarketplaceCatalogRow = {
  slug: "operations-review",
  item_type: "playbook",
  name: "Operations review",
  tagline: "A review framework.",
  description: "Source-owned catalogue description.",
  category: "operations",
  icon: "clipboard",
  pricing_model: "free",
  price_cents: 0,
  requires_embedding: false,
  installed: false,
  install_status: null,
  version: "1.2.0",
};

describe("Marketplace truth projection", () => {
  it("keeps catalogue membership and release authority partial", () => {
    const item = projectMarketplaceRow(row);
    expect(item.tenantEligibility.state).toBe("PARTIAL");
    expect(item.releaseVersion).toEqual({ state: "PARTIAL", value: "1.2.0" });
    expect(item.publisher.state).toBe("UNAVAILABLE");
    expect(item.releaseIdentity.state).toBe("UNAVAILABLE");
    expect(item.approvedScope.state).toBe("UNAVAILABLE");
    expect(item.declaredCapabilities.state).toBe("UNAVAILABLE");
    expect(item.prerequisites.state).toBe("UNAVAILABLE");
  });

  it("fails a versionless listing closed", () => {
    const item = projectMarketplaceRow({ ...row, version: null });
    expect(item.safeState).toBe("UNAVAILABLE");
    expect(item.releaseVersion).toEqual({ state: "UNAVAILABLE", value: null });
  });

  it("does not promote absent visible install joins into complete entitlement truth", () => {
    expect(summarizeMarketplace([projectMarketplaceRow(row)])).toEqual({
      installed: { state: "PARTIAL", count: 0 },
      updates: { state: "UNAVAILABLE", count: null },
    });
  });

  it("does not claim update readiness for a legacy active install", () => {
    const installed = projectMarketplaceRow({ ...row, installed: true, install_status: "active" });
    expect(summarizeMarketplace([installed])).toEqual({
      installed: { state: "PARTIAL", count: 1 },
      updates: { state: "UNAVAILABLE", count: null },
    });
  });

  it("whitelists the PAIGE-safe capability reference", () => {
    const reference = toMarketplacePaigeReference(projectMarketplaceRow(row));
    expect(Object.keys(reference)).toEqual([
      "schema",
      "capabilityRef",
      "name",
      "artifactType",
      "category",
      "tenantEligibility",
      "version",
      "releaseIdentity",
      "approvedScope",
      "declaredCapabilities",
      "prerequisites",
      "safeState",
    ]);
    expect(JSON.stringify(reference)).not.toMatch(/description|tagline|manifest|payload|prompt|price|rating|recommend|action/i);
  });

  it("fails malformed and duplicate catalogue identity closed", () => {
    expect(parseMarketplaceRows([{ ...row, slug: "" }])).toBeNull();
    expect(parseMarketplaceRows([{ ...row, item_type: null }])).toBeNull();
    expect(parseMarketplaceRows([{ ...row, name: 42 }])).toBeNull();
    expect(parseMarketplaceRows([row, { ...row }])).toBeNull();
    expect(parseMarketplaceRows([{ ...row, version: { arbitrary: true } }])).toBeNull();
  });
});
