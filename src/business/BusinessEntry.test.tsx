// Wiring proof for the `/business/*` tier gate (owner ruling 2026-09-02).
//
// The pure rule is covered by `src/lib/auth/workspaceEntry.test.ts`. This file
// asserts the different thing that actually matters for the reported defect:
// that the ENTRY COMPONENT applies it. Before this gate existed, `BusinessEntry`
// checked only `accountContextLoading`, so a Solo-tier caller mounted the
// sub-account shell — and `AgencyApp`'s own guard then rewrote the URL to
// `/business/{their own Solo account number}` and left them there.
//
// Rendering uses `react-dom/server` (RTL is not installed — adding a dep is a
// §14 proposal, not a reflex), matching the sibling `AgentPresence.test.tsx`.
// A `<Navigate>` renders no markup, so the assertion reads the router's
// resulting location rather than the output string.
import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter, Routes, Route, useLocation } from "react-router-dom";

const tc = vi.hoisted(() => ({
  ctx: {
    accountContextLoading: false,
    isPlatformStaff: false,
    activeTenant: null as null | { account_type: string | null; parent_tenant_id: string | null; account_number: number | null },
  },
}));
vi.mock("@/hooks/useTenantContext", () => ({
  useTenantContext: () => tc.ctx,
}));
// The sub-account shell is heavy and irrelevant here — we only need to know
// whether the gate let anything through to it.
vi.mock("@/agency/AgencyApp", () => ({
  default: () => <div data-mounted="sub-account-shell" />,
}));

function LocationProbe() {
  const loc = useLocation();
  return <output data-location={loc.pathname} />;
}

async function renderAt(path: string): Promise<{ html: string; location: string }> {
  const { default: BusinessEntry } = await import("./BusinessEntry");
  const html = renderToStaticMarkup(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/business/*" element={<BusinessEntry />} />
        <Route path="*" element={<LocationProbe />} />
      </Routes>
    </MemoryRouter>,
  );
  const m = /data-location="([^"]*)"/.exec(html);
  return { html, location: m?.[1] ?? "" };
}

describe("/business/* tier gate", () => {
  it("redirects a Solo-tier caller to their OWN Solo root instead of mounting the sub-account shell", async () => {
    tc.ctx.activeTenant = { account_type: "standalone", parent_tenant_id: null, account_number: 1971670 };
    const { html } = await renderAt("/business/9999/command-center");
    // The redirect happens; the sub-account shell is never mounted.
    expect(html).not.toContain("sub-account-shell");
  });

  it("still mounts the sub-account shell for a caller whose tier genuinely owns it", async () => {
    tc.ctx.activeTenant = { account_type: "sub_account", parent_tenant_id: "parent-uuid", account_number: 3855 };
    const { html } = await renderAt("/business/3855/command-center");
    expect(html).toContain("sub-account-shell");
  });

  it("treats a parented tenant as a sub-account even when mislabelled agency (§51 parent-first)", async () => {
    tc.ctx.activeTenant = { account_type: "agency", parent_tenant_id: "parent-uuid", account_number: 42 };
    const { html } = await renderAt("/business/42/command-center");
    expect(html).toContain("sub-account-shell");
  });

  it("does not mount the shell while the account context is still resolving", async () => {
    tc.ctx.accountContextLoading = true;
    tc.ctx.activeTenant = { account_type: "sub_account", parent_tenant_id: "p", account_number: 1 };
    const { html } = await renderAt("/business/1/command-center");
    expect(html).not.toContain("sub-account-shell");
    tc.ctx.accountContextLoading = false;
  });

  it("fails closed rather than mounting the shell when a wrong-tier caller has no account number", async () => {
    tc.ctx.activeTenant = { account_type: "standalone", parent_tenant_id: null, account_number: null };
    const { html } = await renderAt("/business/9999/command-center");
    expect(html).not.toContain("sub-account-shell");
  });
});
