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

  it.each(["app", "www", "mail", "admin", "api", "operator", "dashboard", "setup"])(
    "blocks the reserved %s infrastructure label",
    (label) => expect(tenantSlugFromHostname(`${label}.paigeagent.ai`)).toBeNull(),
  );

  it.each([
    "paigeagent.ai", "www.paigeagent.ai", "too.deep.paigeagent.ai",
    "-bad.paigeagent.ai", "bad-.paigeagent.ai", "tenant.example.com",
  ])("rejects non-tenant host %s", (hostname) => {
    expect(tenantSlugFromHostname(hostname)).toBeNull();
  });

  it("routes a tenant-host root to its canonical portal", () => {
    expect(computeTenantHostRedirect("acme.paigeagent.ai", "/", "?ref=partner", "#welcome"))
      .toBe("/portal/acme?ref=partner#welcome");
  });

  it.each([
    ["/portal/other", "/portal/acme"],
    ["/portal/Other/history", "/portal/acme/history"],
    ["/store/other/items", "/store/acme/items"],
    ["/p/other/about", "/p/acme/about"],
    ["/f/other/welcome", "/f/acme/welcome"],
    ["/portal/%E0%A4%A", "/portal/acme"],
  ])("pins %s to the hostname tenant", (path, expected) => {
    expect(computeTenantHostRedirect("acme.paigeagent.ai", path, "", "")).toBe(expected);
  });

  it.each([
    "/portal/acme", "/portal/ACME/history", "/store/acme/items", "/p/acme/about", "/f/acme/welcome",
    "/book/discovery", "/booking/manage/token", "/form/form-id", "/unsubscribe/token", "/u/public-token",
  ])("allows deliberate tenant-safe public route %s", (path) => {
    expect(computeTenantHostRedirect("acme.paigeagent.ai", path, "", "")).toBeNull();
  });

  it.each([
    "/admin", "/auth/login", "/app", "/operator/tenants", "/dashboard",
    "/setup", "/workspace", "/pricing", "/unknown",
  ])("fails closed for sensitive or unknown route %s", (path) => {
    expect(computeTenantHostRedirect("acme.paigeagent.ai", path, "?x=1", "#top"))
      .toBe("/portal/acme?x=1#top");
  });

  it("works while the separate app-host split remains dormant", () => {
    expect(computeHostRedirect("acme.paigeagent.ai", "/", "", "")).toBe("/portal/acme");
    expect(computeHostRedirect("acme.paigeagent.ai", "/admin", "", "")).toBe("/portal/acme");
    expect(computeHostRedirect("paigeagent.ai", "/admin", "", "")).toBeNull();
  });
});
