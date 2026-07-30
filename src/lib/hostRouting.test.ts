import { describe, expect, it } from "vitest";
import {
  computeHostRedirect,
  computeTenantHostRedirect,
  tenantSlugFromHostname,
} from "./hostRouting";

describe("tenant wildcard host routing", () => {
  it("extracts a valid tenant slug case-insensitively", () => {
    expect(tenantSlugFromHostname("Acme-Coaching.paigeagent.ai")).toBe("acme-coaching");
  });

  it.each(["app", "www", "mail", "admin", "api"])(
    "blocks the reserved %s infrastructure label",
    (label) => {
      expect(tenantSlugFromHostname(`${label}.paigeagent.ai`)).toBeNull();
    },
  );

  it.each([
    "paigeagent.ai",
    "www.paigeagent.ai",
    "too.deep.paigeagent.ai",
    "-bad.paigeagent.ai",
    "bad-.paigeagent.ai",
    "tenant.example.com",
  ])("rejects non-tenant host %s", (hostname) => {
    expect(tenantSlugFromHostname(hostname)).toBeNull();
  });

  it("routes a tenant-host root to the canonical existing portal", () => {
    expect(
      computeTenantHostRedirect("acme.paigeagent.ai", "/", "?ref=partner", "#welcome"),
    ).toBe("/portal/acme?ref=partner#welcome");
  });

  it("pins a tenant host to its own portal slug", () => {
    expect(
      computeTenantHostRedirect("acme.paigeagent.ai", "/portal/other", "", ""),
    ).toBe("/portal/acme");
  });

  it("leaves non-root public routes intact", () => {
    expect(
      computeTenantHostRedirect("acme.paigeagent.ai", "/book/discovery", "", ""),
    ).toBeNull();
  });

  it("works while the separate app-host split remains dormant", () => {
    expect(computeHostRedirect("acme.paigeagent.ai", "/", "", "")).toBe("/portal/acme");
    expect(computeHostRedirect("paigeagent.ai", "/admin", "", "")).toBeNull();
  });
});
