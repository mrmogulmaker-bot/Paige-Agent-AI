import { describe, expect, it } from "vitest";
import {
  TENANT_SHELL_DESTINATIONS,
  resolveTenantShellDestination,
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

  it("gives Calendar ownership of delivery, tasks and scheduling routes", () => {
    expect(resolveTenantShellDestination("/admin/clients-hub/delivery").id).toBe("calendar");
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
});
