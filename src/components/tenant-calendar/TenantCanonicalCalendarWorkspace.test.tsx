import React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => ({
  tenantId: "tenant-a" as string | null,
  loading: false,
  accountLoading: false,
  mounts: [] as string[],
  unmounts: [] as string[],
}));

vi.mock("@/hooks/useTenantContext", () => ({
  useTenantContext: () => ({
    activeTenantId: harness.tenantId,
    loading: harness.loading,
    accountContextLoading: harness.accountLoading,
  }),
}));

vi.mock("@/pages/admin/CalendarAdmin", () => ({
  default: function CalendarAdminMock({ activeTenantId, activeTab, onTabChange, connectionsHref, openPaige, soloSettings }: {
    activeTenantId: string;
    activeTab: string;
    onTabChange: (tab: string) => void;
    connectionsHref: string;
    openPaige?: () => void;
    soloSettings?: boolean;
  }) {
    React.useEffect(() => {
      harness.mounts.push(activeTenantId);
      return () => { harness.unmounts.push(activeTenantId); };
    }, [activeTenantId]);
    return (
      <section
        data-calendar-admin
        data-tenant={activeTenantId}
        data-tab={activeTab}
        data-connections={connectionsHref}
        data-solo-settings={String(Boolean(soloSettings))}
      >
        <button type="button" onClick={() => onTabChange("booking")}>Booking pages</button>
        {openPaige && <button type="button" data-ask-paige onClick={openPaige}>Ask PAIGE</button>}
      </section>
    );
  },
}));

import { TenantCanonicalCalendarWorkspace } from "./TenantCanonicalCalendarWorkspace";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function LocationProbe() {
  const location = useLocation();
  return <output data-path={`${location.pathname}${location.search}`} />;
}

let container: HTMLDivElement;
let root: Root;

function mount(path: string, tier: "solo" | "agency", openPaige?: () => void) {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root.render(
      <MemoryRouter initialEntries={[path]}>
        <LocationProbe />
        <Routes>
          <Route path="*" element={<TenantCanonicalCalendarWorkspace tier={tier} openPaige={openPaige} />} />
        </Routes>
      </MemoryRouter>,
    );
  });
}

beforeEach(() => {
  harness.tenantId = "tenant-a";
  harness.loading = false;
  harness.accountLoading = false;
  harness.mounts = [];
  harness.unmounts = [];
});

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
});

describe("TenantCanonicalCalendarWorkspace", () => {
  it("withholds the canonical owner until server-resolved account context exists", () => {
    harness.tenantId = null;
    harness.accountLoading = true;
    mount("/solo/101/calendar", "solo");

    expect(container.querySelector("[data-calendar-admin]")).toBeNull();
    expect(container.textContent).toContain("Resolving Calendar");
    expect(harness.mounts).toEqual([]);
  });

  it.each([
    ["Solo", "/solo/101/calendar/agenda", "solo", "tenant-solo", "/solo/101/integrations"],
    ["Agency Parent", "/agency/202/calendar/tasks", "agency", "tenant-agency", "/agency/202/integrations"],
    ["acting Sub-account", "/agency/202/sub/303/calendar/availability", "agency", "tenant-child", "/agency/202/sub/303/integrations"],
    ["direct Sub-account", "/business/303/calendar/connections", "agency", "tenant-direct", "/business/303/integrations"],
    ["Enterprise compatibility", "/agency/404/calendar/booking-pages", "agency", "tenant-enterprise", "/agency/404/integrations"],
  ] as const)("preserves the %s account tree", (_label, path, tier, tenantId, connectionsHref) => {
    harness.tenantId = tenantId;
    mount(path, tier);

    const calendar = container.querySelector("[data-calendar-admin]");
    expect(calendar?.getAttribute("data-tenant")).toBe(tenantId);
    expect(calendar?.getAttribute("data-connections")).toBe(connectionsHref);
    expect(calendar?.getAttribute("data-tab")).toBe(path.split("/").at(-1)?.replace("booking-pages", "booking"));
  });

  it("navigates tabs within the exact acting-child tree", () => {
    harness.tenantId = "tenant-child";
    mount("/agency/202/sub/303/calendar", "agency");

    act(() => {
      (container.querySelector("button") as HTMLButtonElement).click();
    });

    expect(container.querySelector("[data-path]")?.getAttribute("data-path")).toBe(
      "/agency/202/sub/303/calendar/booking-pages",
    );
  });

  it("routes Calendar Ask PAIGE actions into the one shell-owned workspace", () => {
    const openPaige = vi.fn();
    mount("/solo/101/calendar", "solo", openPaige);

    act(() => {
      (container.querySelector("[data-ask-paige]") as HTMLButtonElement).click();
    });

    expect(openPaige).toHaveBeenCalledTimes(1);
    expect(container.querySelectorAll("[data-calendar-admin]")).toHaveLength(1);
  });

  it("routes Solo compatibility addresses into the Clients-owned Calendar and resolves Settings", () => {
    mount("/solo/101/calendar/settings", "solo");

    expect(container.querySelector("[data-path]")?.getAttribute("data-path")).toBe(
      "/solo/101/clients/calendar?calendarView=settings",
    );
    const calendar = container.querySelector("[data-calendar-admin]");
    expect(calendar?.getAttribute("data-tab")).toBe("settings");
    expect(calendar?.getAttribute("data-solo-settings")).toBe("true");
  });

  it("remounts the canonical owner when authenticated tenant scope changes", () => {
    mount("/solo/101/calendar", "solo");
    expect(harness.mounts).toEqual(["tenant-a"]);

    harness.tenantId = "tenant-b";
    act(() => {
      root.render(
        <MemoryRouter initialEntries={["/solo/101/calendar"]}>
          <Routes><Route path="*" element={<TenantCanonicalCalendarWorkspace tier="solo" />} /></Routes>
        </MemoryRouter>,
      );
    });

    expect(harness.unmounts).toContain("tenant-a");
    expect(harness.mounts).toContain("tenant-b");
    expect(container.querySelector("[data-calendar-admin]")?.getAttribute("data-tenant")).toBe("tenant-b");
  });
});
