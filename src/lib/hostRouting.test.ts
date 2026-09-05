import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  computeHostRedirect,
  computeTenantHostRedirect,
  RESERVED_TENANT_SUBDOMAINS,
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

// #178 publishing spine — the SQL resolver `resolve_tenant_web_host` re-implements the
// reserved-label exclusion server-side. If the two lists drift, a slug rejected in one
// layer resolves in the other (the exact operator/dashboard/setup bug this fixes). This
// guard fails the moment they diverge, so a future edit to either must touch both.
describe("reserved-subdomain parity: hostRouting.ts <-> SQL resolve_tenant_web_host", () => {
  it("the newest SQL definition's reserved array equals RESERVED_TENANT_SUBDOMAINS", () => {
    const migrationsDir = join(dirname(fileURLToPath(import.meta.url)), "../../supabase/migrations");
    // The canonical definition is in the NEWEST migration that (re)defines the resolver.
    const defining = readdirSync(migrationsDir)
      .filter((f) => f.endsWith(".sql"))
      .sort()
      .filter((f) =>
        readFileSync(join(migrationsDir, f), "utf8").includes(
          "FUNCTION public.resolve_tenant_web_host",
        ),
      );
    expect(defining.length).toBeGreaterThan(0);
    const sql = readFileSync(join(migrationsDir, defining[defining.length - 1]), "utf8");

    // Extract the reserved-label ARRAY[...] literal used in the `c.slug <> ALL (ARRAY[...])` clause.
    const match = sql.match(/c\.slug\s*<>\s*ALL\s*\(ARRAY\[([\s\S]*?)\]\)/);
    expect(match, "resolve_tenant_web_host must exclude reserved slugs via ARRAY[...]").toBeTruthy();
    const sqlReserved = new Set(
      (match![1].match(/'([^']+)'/g) ?? []).map((s) => s.slice(1, -1)),
    );

    expect([...sqlReserved].sort()).toEqual([...RESERVED_TENANT_SUBDOMAINS].sort());
  });
});
