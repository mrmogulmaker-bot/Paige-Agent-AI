// Regression guard for the `/admin` entry gate (owner ruling 2026-09-02).
//
// THE DEFECT THIS EXISTS FOR — a confirmed infinite redirect, found by the §39
// peer-gate and not by any test, because nothing in the repository rendered
// `Admin` at all. `/admin/*` is ONE route element, so a check placed in this
// component's render body runs for every path beneath it — including
// `/admin/marketplace` and `/admin/setup`, the two paths `RequireSetupComplete`
// deliberately exempts so a tenant can choose a playbook. A multi-context tenant
// mid-setup therefore cycled: chooser → their workspace root → setup gate →
// `/admin/marketplace` → chooser → …, and could never reach Setup to break out.
//
// The second half of the guard is the settlement record. It replaced a `?picked=1`
// URL marker that survived exactly one navigation: any in-app link pushes a
// history entry with no query string, so the next click anywhere re-armed the gate.
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Routes, Route, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Tenant = {
  id: string;
  status: string;
  account_type: string | null;
  parent_tenant_id: string | null;
  account_number: number | null;
};

const h = vi.hoisted(() => ({
  ctx: {
    isPlatformStaff: false,
    activeTenantId: "solo-a" as string | null,
    activeTenant: null as Tenant | null,
    tenants: [] as Tenant[],
    accountContextLoading: false,
    accountContextStatus: "ready" as string,
    loading: false,
    soloShellEnabled: true,
    agencyShellEnabled: false,
  },
  tier: { tierKey: "solo", soloStandalone: true, loading: false },
}));

vi.mock("@/hooks/useTenantContext", () => ({ useTenantContext: () => h.ctx }));
vi.mock("@/hooks/useTierFeatures", () => ({ useTierFeatures: () => h.tier }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      getUser: vi.fn(async () => ({ data: { user: { id: "u1" } }, error: null })),
      getSession: vi.fn(async () => ({ data: { session: { user: { id: "u1" } } }, error: null })),
    },
    from: vi.fn(() => {
      const q: Record<string, unknown> = {};
      const chain = () => q;
      Object.assign(q, {
        select: chain, eq: chain, in: chain, order: chain, limit: chain, maybeSingle: chain,
        then: (r: (v: { data: unknown[]; error: null }) => unknown) => Promise.resolve({ data: [{ role: "admin" }], error: null }).then(r),
      });
      return q;
    }),
  },
}));
// The shells and the legacy layout are irrelevant: this file only asks whether
// the gate fired, and every one of them is a lazy chunk or a heavy tree.
vi.mock("@/components/admin/AdminLayout", () => ({ AdminLayout: () => <div data-mounted="admin-layout" /> }));
vi.mock("@/solo/SoloApp", () => ({ default: () => <div data-mounted="solo-shell" /> }));
vi.mock("@/agency/AgencyApp", () => ({ default: () => <div data-mounted="agency-shell" /> }));

import Admin from "./Admin";

function LocationProbe() {
  const loc = useLocation();
  return <i data-loc={loc.pathname} />;
}

const soloTenant: Tenant = { id: "solo-a", status: "active", account_type: "standalone", parent_tenant_id: null, account_number: 1971670 };
const childTenant: Tenant = { id: "child-b", status: "active", account_type: "sub_account", parent_tenant_id: "p", account_number: 3855 };

describe("/admin entry gate", () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    sessionStorage.clear();
    h.ctx.isPlatformStaff = false;
    h.ctx.activeTenantId = "solo-a";
    h.ctx.activeTenant = soloTenant;
    h.ctx.tenants = [soloTenant, childTenant];
    h.ctx.accountContextLoading = false;
    h.ctx.accountContextStatus = "ready";
    h.tier = { tierKey: "solo", soloStandalone: true, loading: false };
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
            <Route path="/admin/*" element={<Admin />} />
            <Route path="*" element={<LocationProbe />} />
          </Routes>
        </MemoryRouter>,
      );
    });
    return host.querySelector("[data-loc]")?.getAttribute("data-loc") ?? null;
  }

  // The claim under test is always "the ENTRY gate did not fire", never "nothing
  // happened": with the Solo canary on, `Admin`'s own Solo gate legitimately
  // redirects a solo tenant to `/solo/{n}/command-center`, and asserting on a
  // bare null would silently pass if that redirect ever disappeared.
  function notTheChooser(loc: string | null) {
    expect(loc).not.toBe("/choose-account");
  }

  it("asks a multi-context person which workspace they want, at the door", async () => {
    expect(await renderAt("/admin")).toBe("/choose-account");
  });

  // THE LOOP GUARD. `RequireSetupComplete` holds a tenant with no playbook on
  // `/admin/marketplace` and exempts that path plus `/admin/setup` so they can
  // choose one. If the gate fires there too, the tenant is bounced back to the
  // chooser every time the setup gate sends them, and Setup becomes unreachable.
  it("does NOT fire on the Setup paths the setup gate holds people on", async () => {
    notTheChooser(await renderAt("/admin/marketplace"));
    notTheChooser(await renderAt("/admin/setup"));
    notTheChooser(await renderAt("/admin/setup/playbook"));
  });

  it("does not fire anywhere else beneath the door either", async () => {
    notTheChooser(await renderAt("/admin/clients"));
    notTheChooser(await renderAt("/admin/conversations"));
  });

  // The settlement record must survive navigation. Its predecessor — a `?picked=1`
  // query param read off `window.location` — did not: any in-app link pushes a
  // history entry with no query string, so the first click re-armed the gate.
  it("stops asking once this session has entered the workspace, and keeps not asking", async () => {
    sessionStorage.setItem("paige.workspace.entered", "solo-a");
    notTheChooser(await renderAt("/admin"));
    notTheChooser(await renderAt("/admin/clients"));
    notTheChooser(await renderAt("/admin"));
  });

  // Keyed on the tenant id on purpose: a context the person did not choose is
  // exactly the situation this whole repair exists for, so it must re-ask.
  it("asks again when the active context is one this session never chose", async () => {
    sessionStorage.setItem("paige.workspace.entered", "some-other-tenant");
    expect(await renderAt("/admin")).toBe("/choose-account");
  });

  it("never asks a single-context person — there is nothing to choose", async () => {
    h.ctx.tenants = [soloTenant];
    notTheChooser(await renderAt("/admin"));
  });

  it("counts only ACTIVE tenants, matching the population the chooser will offer", async () => {
    h.ctx.tenants = [soloTenant, { ...childTenant, status: "suspended" }];
    notTheChooser(await renderAt("/admin"));
  });

  it("never asks platform staff, who switch through the audited operator seam", async () => {
    h.ctx.isPlatformStaff = true;
    notTheChooser(await renderAt("/admin"));
  });

  it("never asks off a half-resolved account context", async () => {
    h.ctx.accountContextLoading = true;
    notTheChooser(await renderAt("/admin"));
    h.ctx.accountContextLoading = false;
    h.ctx.accountContextStatus = "resolving";
    notTheChooser(await renderAt("/admin"));
  });
});
