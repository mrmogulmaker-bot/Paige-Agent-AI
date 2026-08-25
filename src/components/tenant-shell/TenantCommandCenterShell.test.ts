import { describe, expect, it } from "vitest";
import {
  TENANT_SHELL_DESTINATIONS,
  resolveTenantAccountContext,
  resolveTenantShellDestination,
  tenantAccountTypeLabel,
  tenantShellDestinationsForPath,
} from "./tenantShellRoutes";

describe("tenant Command Center shell routing", () => {
  it("exposes the ruled six tenant destinations and never Fleet", () => {
    expect(TENANT_SHELL_DESTINATIONS.map(({ label }) => label)).toEqual([
      "Command Center",
      "Clients",
      "Calendar",
      "Studio",
      "Insights",
      "Settings",
    ]);
    expect(TENANT_SHELL_DESTINATIONS.some(({ label }) => label === "Fleet")).toBe(false);
  });

  it.each([
    ["standalone", "Solo"],
    ["sub_account", "Business"],
    ["agency", "Agency"],
    ["enterprise", "Enterprise"],
  ])("renders the internal %s account type as %s", (accountType, label) => {
    expect(tenantAccountTypeLabel(accountType)).toBe(label);
  });

  it("preserves a supplied authenticated account name instead of asserting a generic business", () => {
    expect(resolveTenantAccountContext({
      accountName: "First Sterling Capital",
      accountType: "standalone",
    })).toEqual({
      accountName: "First Sterling Capital",
      accountType: "standalone",
      accountTypeLabel: "Solo",
    });
  });

  it.each([
    ["standalone", "Solo"],
    ["sub_account", "Business"],
    ["agency", "Agency"],
    ["enterprise", "Enterprise"],
  ])("resolves the shared %s account context as %s", (accountType, accountTypeLabel) => {
    expect(resolveTenantAccountContext({ accountName: "Supplied account", accountType })).toEqual({
      accountName: "Supplied account",
      accountType,
      accountTypeLabel,
    });
  });

  it.each([undefined, null, "", "   "])(
    "uses an honest neutral fallback for missing optional account name %s",
    (accountName) => {
      expect(resolveTenantAccountContext({ accountName, accountType: null })).toEqual({
        accountName: "Your workspace",
        accountType: null,
        accountTypeLabel: "Account",
      });
    },
  );

  it("classifies a parented legacy standalone tenant as Business", () => {
    expect(resolveTenantAccountContext({
      accountName: "Supplied child account",
      accountType: "standalone",
      parentTenantId: "authenticated-parent-id",
    })).toEqual({
      accountName: "Supplied child account",
      accountType: "sub_account",
      accountTypeLabel: "Business",
    });
  });

  it("does not relabel a top-level standalone tenant from route mode alone", () => {
    expect(resolveTenantAccountContext({
      accountName: "Supplied solo account",
      accountType: "standalone",
      parentTenantId: null,
    }).accountTypeLabel).toBe("Solo");
  });

  it("keeps a missing Business-route tenant neutral instead of inferring identity from the URL", () => {
    expect(resolveTenantAccountContext(null)).toEqual({
      accountName: "Your workspace",
      accountType: null,
      accountTypeLabel: "Account",
    });
  });

  it("keeps Delivery with Clients while Calendar owns tasks and scheduling routes", () => {
    expect(resolveTenantShellDestination("/admin/clients-hub/delivery").id).toBe("clients");
    expect(resolveTenantShellDestination("/admin/planning").id).toBe("calendar");
    expect(resolveTenantShellDestination("/admin/bookings").id).toBe("calendar");
  });

  it("keeps the client relationship surfaces under Clients", () => {
    expect(resolveTenantShellDestination("/admin/clients-hub/conversations").id).toBe("clients");
    expect(resolveTenantShellDestination("/admin/clients-hub/pipeline").id).toBe("clients");
    expect(resolveTenantShellDestination("/admin/contacts/example").id).toBe("clients");
  });

  it("maps the remaining canonical live routes without inventing pages", () => {
    expect(resolveTenantShellDestination("/admin").id).toBe("command");
    expect(resolveTenantShellDestination("/admin/studio/new").id).toBe("studio");
    expect(resolveTenantShellDestination("/admin/analytics").id).toBe("insights");
    expect(resolveTenantShellDestination("/admin/setup/integrations").id).toBe("settings");
  });

  it.each([
    ["/business/9082725/command-center", "/business/9082725/clients"],
    ["/agency/1924546/command-center", "/agency/1924546/clients"],
    ["/solo/42/command-center", "/solo/42/clients"],
    ["/enterprise/7/command-center", "/enterprise/7/clients"],
  ])("keeps all six destinations inside the current account tree: %s", (pathname, clientsHref) => {
    const destinations = tenantShellDestinationsForPath(pathname);
    expect(destinations).toHaveLength(6);
    expect(destinations.find(({ id }) => id === "clients")?.href).toBe(clientsHref);
    expect(destinations.every(({ label }) => label !== "Fleet")).toBe(true);
  });

  it("folds legacy tenant branches into one of the six capability homes", () => {
    expect(resolveTenantShellDestination("/business/9082725/paige").id).toBe("command");
    expect(resolveTenantShellDestination("/business/9082725/client-support").id).toBe("clients");
    expect(resolveTenantShellDestination("/business/9082725/business-vault").id).toBe("settings");
  });
});
