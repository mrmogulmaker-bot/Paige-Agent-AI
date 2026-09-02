import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";

const tenantState = vi.hoisted(() => ({
  loading: false,
  isPlatformStaff: false,
  activeTenant: {
    account_type: "standalone",
    parent_tenant_id: null as string | null,
    account_number: 7000001,
    features: {} as Record<string, unknown>,
  },
}));

vi.mock("@/hooks/useTenantContext", () => ({ useTenantContext: () => tenantState }));

import { RequireSetupComplete } from "@/components/auth/RequireSetupComplete";
import { CanonicalSoloAdminHandoff } from "@/solo/CanonicalSoloAdminHandoff";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function Probe() {
  return <output data-location={useLocation().pathname}>child mounted</output>;
}
function ComposedSoloRoute() {
  const location = useLocation();
  if (location.pathname === "/admin") {
    return (
      <CanonicalSoloAdminHandoff
        decision={{ kind: "redirect", target: "/solo/7000001/command-center" }}
        onRetry={() => undefined}
      />
    );
  }
  return <Probe />;
}

describe("RequireSetupComplete canonical Solo routing", () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    tenantState.loading = false;
    tenantState.isPlatformStaff = false;
    tenantState.activeTenant.account_type = "standalone";
    tenantState.activeTenant.parent_tenant_id = null;
    tenantState.activeTenant.account_number = 7000001;
    tenantState.activeTenant.features = {};
    host = document.createElement("div");
    document.body.replaceChildren(host);
    root = createRoot(host);
  });

  async function mount(path: string) {
    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={[path]}>
          <RequireSetupComplete>
            <Routes><Route path="*" element={<Probe />} /></Routes>
          </RequireSetupComplete>
        </MemoryRouter>,
      );
    });
  }

  it("moves an unconfigured Solo tenant from Admin to canonical Solo Setup", async () => {
    await mount("/admin");
    expect(host.querySelector("[data-location]")?.getAttribute("data-location"))
      .toBe("/solo/7000001/settings/setup");
  });


  it("settles on Setup when the first-use gate and Admin handoff are composed", async () => {
    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={["/admin"]}>
          <RequireSetupComplete>
            <ComposedSoloRoute />
          </RequireSetupComplete>
        </MemoryRouter>,
      );
    });

    expect(host.querySelector("[data-location]")?.getAttribute("data-location"))
      .toBe("/solo/7000001/settings/setup");
    expect(host.textContent).toContain("child mounted");
  });
  it("does not loop when canonical Solo Setup is already open", async () => {
    await mount("/solo/7000001/settings/setup");
    expect(host.querySelector("[data-location]")?.getAttribute("data-location"))
      .toBe("/solo/7000001/settings/setup");
    expect(host.textContent).toContain("child mounted");
  });

  it("leaves an already configured Solo route untouched", async () => {
    tenantState.activeTenant.features = { playbook: "advisor" };
    await mount("/solo/7000001/command-center");
    expect(host.querySelector("[data-location]")?.getAttribute("data-location"))
      .toBe("/solo/7000001/command-center");
  });

  it("keeps an unconfigured sub-account on the existing chooser", async () => {
    tenantState.activeTenant.account_type = "sub_account";
    tenantState.activeTenant.parent_tenant_id = "parent";
    await mount("/business/7000001/command-center");
    expect(host.querySelector("[data-location]")?.getAttribute("data-location"))
      .toBe("/admin/marketplace");
  });
});
