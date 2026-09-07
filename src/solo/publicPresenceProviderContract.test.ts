import { describe, expect, it } from "vitest";
import {
  acceptProviderEvidenceForTenant,
  PUBLIC_PRESENCE_GOOGLE_RELEASES,
} from "./publicPresenceProviderContract";

describe("Public Presence provider contract", () => {
  it("keeps the approved Google release order unavailable", () => {
    expect(PUBLIC_PRESENCE_GOOGLE_RELEASES.map(({ id, state }) => [id, state])).toEqual([
      ["google-search-console", "UNAVAILABLE"],
      ["google-business-profile", "UNAVAILABLE"],
    ]);
  });

  it("accepts provider evidence only for the server-resolved tenant", () => {
    const evidence = {
      provider: "google-search-console",
      tenantId: "tenant-a",
      connectionId: "connection-a",
      source: "provider",
      observedAt: "2026-09-06T22:56:00.000Z",
    };
    expect(acceptProviderEvidenceForTenant(evidence, "tenant-a")).toEqual(evidence);
    expect(acceptProviderEvidenceForTenant(evidence, "tenant-b")).toBeNull();
  });

  it.each([
    {},
    {
      provider: "google-search-console",
      tenantId: "tenant-a",
      connectionId: "",
      source: "provider",
      observedAt: "2026-09-06T22:56:00.000Z",
    },
    {
      provider: "google-business-profile",
      tenantId: "tenant-a",
      connectionId: "connection-a",
      source: "ui-flag",
      observedAt: "2026-09-06T22:56:00.000Z",
    },
    {
      provider: "google-business-profile",
      tenantId: "tenant-a",
      connectionId: "connection-a",
      source: "provider",
      observedAt: "not-a-date",
    },
  ])("rejects unproven provider state %#", (candidate) => {
    expect(acceptProviderEvidenceForTenant(candidate, "tenant-a")).toBeNull();
  });
});
