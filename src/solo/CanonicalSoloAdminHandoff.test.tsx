import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { CanonicalSoloAdminHandoff } from "@/solo/CanonicalSoloAdminHandoff";
import { resolveCanonicalSoloHandoff } from "@/solo/canonicalSoloTenant";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function LocationProbe() {
  return <output data-location={useLocation().pathname} />;
}

describe("canonical Solo Admin handoff", () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    host = document.createElement("div");
    document.body.replaceChildren(host);
    root = createRoot(host);
  });

  it.each([
    [
      "established",
      {
        isPlatformStaff: false,
        account_type: "standalone",
        parent_tenant_id: null,
        account_number: 7000001,
        features: { solo_shell_enabled: true, playbook: "advisor" },
        plan_offer: null,
      },
      "/solo/7000001/command-center",
    ],
    [
      "future",
      {
        isPlatformStaff: false,
        account_type: "standalone",
        parent_tenant_id: null,
        account_number: 8000001,
        features: {},
        plan_offer: "future-offer",
      },
      "/solo/8000001/command-center",
    ],
  ] as const)("renders the same canonical redirect owner for a %s tenant", async (_label, tenant, target) => {
    const decision = resolveCanonicalSoloHandoff(tenant);
    expect(decision.kind).toBe("redirect");
    if (decision.kind !== "redirect") throw new Error("expected canonical redirect");

    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={["/admin"]}>
          <CanonicalSoloAdminHandoff decision={decision} onRetry={vi.fn()} />
          <Routes><Route path="*" element={<LocationProbe />} /></Routes>
        </MemoryRouter>,
      );
    });

    expect(host.querySelector("[data-location]")?.getAttribute("data-location")).toBe(target);
    expect(host.querySelector('[role="alert"]')).toBeNull();
  });

  it.each([null, 0, -1, Number.NaN])("blocks a canonical tenant whose address is %s", async (accountNumber) => {
    const decision = resolveCanonicalSoloHandoff({
      isPlatformStaff: false,
      account_type: "standalone",
      parent_tenant_id: null,
      account_number: accountNumber,
    });
    expect(decision.kind).toBe("blocked_address");
    if (decision.kind !== "blocked_address") throw new Error("expected blocked address");

    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={["/admin"]}>
          <CanonicalSoloAdminHandoff decision={decision} onRetry={vi.fn()} />
          <Routes><Route path="*" element={<LocationProbe />} /></Routes>
        </MemoryRouter>,
      );
    });

    expect(host.querySelector('[role="alert"]')).not.toBeNull();
    expect(host.querySelector("[data-location]")?.getAttribute("data-location")).toBe("/admin");
    expect(host.querySelector("[data-tenant-shell]")).toBeNull();
  });

  it("renders resolving and failed context states without mounting a shell", async () => {
    const retry = vi.fn();
    await act(async () => {
      root.render(
        <MemoryRouter>
          <CanonicalSoloAdminHandoff decision={{ kind: "resolving" }} onRetry={retry} />
        </MemoryRouter>,
      );
    });
    expect(host.querySelector("[data-tenant-shell]")).toBeNull();
    expect(host.querySelector('[role="alert"]')).toBeNull();

    await act(async () => {
      root.render(
        <MemoryRouter>
          <CanonicalSoloAdminHandoff decision={{ kind: "blocked_context" }} onRetry={retry} />
        </MemoryRouter>,
      );
    });
    expect(host.querySelector('[role="alert"]')).not.toBeNull();
    expect(host.textContent).toContain("Couldn't confirm your workspace");
    expect(host.querySelector("[data-tenant-shell]")).toBeNull();
    const button = host.querySelector("button");
    expect(button?.textContent).toContain("Try again");
    await act(async () => { button?.click(); });
    expect(retry).toHaveBeenCalledOnce();
  });
});
