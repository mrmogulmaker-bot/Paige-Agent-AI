import { describe, expect, it } from "vitest";
import {
  TENANT_SHELL_DESTINATIONS,
  resolveTenantShellDestination,
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
