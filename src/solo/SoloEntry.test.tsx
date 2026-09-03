// Wiring proof for the `/solo/*` tier gate (owner ruling 2026-09-02).
//
// `/business/*` shipped with no tier gate and `/solo/*` shipped with the mirror
// image of the same hole: `SoloApp`'s own guard rewrites the `:account` segment
// to the caller's own account number, so a sub-account or agency caller who
// reached `/solo/{n}` was quietly renumbered and left running the Solo shell —
// the right address, the wrong operating mode. Fixing one and leaving the other
// would have closed half a defect, so both are gated and both are proven here.
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Routes, Route, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Tenant = {
  account_type: string | null;
  parent_tenant_id: string | null;
  account_number: number | null;
};

const tc = vi.hoisted(() => ({
  ctx: {
    accountContextLoading: false,
    accountContextStatus: "ready" as string,
    isPlatformStaff: false,
    activeTenant: null as Tenant | null,
    refresh: async () => {},
  },
}));
vi.mock("@/hooks/useTenantContext", () => ({ useTenantContext: () => tc.ctx }));
vi.mock("@/solo/SoloApp", () => ({ default: () => <div data-mounted="solo-shell" /> }));

import SoloEntry from "./SoloEntry";

function LocationProbe() {
  const loc = useLocation();
  return <i data-loc={loc.pathname} />;
}

describe("/solo/* tier gate", () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    tc.ctx.accountContextLoading = false;
    tc.ctx.accountContextStatus = "ready";
    tc.ctx.isPlatformStaff = false;
    tc.ctx.activeTenant = null;
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
  });

  async function renderAt(path: string) {
    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route path="/solo/*" element={<SoloEntry />} />
            <Route path="*" element={<LocationProbe />} />
          </Routes>
        </MemoryRouter>,
      );
    });
    return {
      html: host.innerHTML,
      location: host.querySelector("[data-loc]")?.getAttribute("data-loc") ?? null,
    };
  }

  it("mounts the Solo shell for a Solo tenant, exactly as before", async () => {
    tc.ctx.activeTenant = { account_type: "standalone", parent_tenant_id: null, account_number: 1971670 };
    const { html } = await renderAt("/solo/1971670/command-center");
    expect(html).toContain("solo-shell");
  });

  it("sends a sub-account caller to their own business root instead of the Solo shell", async () => {
    tc.ctx.activeTenant = { account_type: "sub_account", parent_tenant_id: "parent-uuid", account_number: 3855 };
    const { html, location } = await renderAt("/solo/1971670/command-center");
    expect(html).not.toContain("solo-shell");
    expect(location).toBe("/business/3855/command-center");
  });

  it("sends an agency caller to their own agency root instead of the Solo shell", async () => {
    tc.ctx.activeTenant = { account_type: "agency", parent_tenant_id: null, account_number: 1924546 };
    const { html, location } = await renderAt("/solo/1971670/command-center");
    expect(html).not.toContain("solo-shell");
    expect(location).toBe("/agency/1924546/command-center");
  });

  it("fails closed to the chooser rather than guessing a home it cannot name", async () => {
    tc.ctx.activeTenant = { account_type: "sub_account", parent_tenant_id: "p", account_number: null };
    const { html, location } = await renderAt("/solo/1971670/command-center");
    expect(html).not.toContain("solo-shell");
    expect(location).toBe("/choose-account");
  });

  it("still refuses to mount on an unresolved account context", async () => {
    tc.ctx.activeTenant = null;
    const { html } = await renderAt("/solo/1971670/command-center");
    expect(html).not.toContain("solo-shell");
    expect(host.textContent).toContain("Couldn't verify your workspace");
  });
});
