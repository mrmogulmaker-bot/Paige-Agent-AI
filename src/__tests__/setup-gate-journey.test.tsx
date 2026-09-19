/**
 * #826 — the setup-gate ↔ canonical-shell JOURNEY suite (failing-first).
 *
 * This walks the COMPLETE redirect journey, not a single component or hop: the
 * REAL guard order the /solo subtree mounts (RequireCompleteSignup →
 * RequireSoloBetaEntitlement → RequireSetupComplete) over the REAL route
 * decisions (SoloEntry's decideWorkspaceEntry + the gate), driven through a
 * memory router as the router itself would drive them.
 *
 * THE TRAP THIS FILE EXISTS TO CATCH (#826, remapped on current main): a
 * playbook-less Solo tenant is held on the shell's own Setup — and if NOTHING
 * the shell offers can open the gate, the tenant is trapped there forever
 * (the old admin↔solo loop, in its dead-end form). Proof 1 fails on main:
 * the canonical setup completes and the gate still does not open.
 */
// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

// ── The tenant context double: the server-derived truth each scenario sets. ──
const harness = vi.hoisted(() => ({
  tenant: {
    id: "t-42",
    account_type: "standalone",
    parent_tenant_id: null,
    account_number: 42,
    status: "active",
    features: null as Record<string, unknown> | null,
  } as Record<string, unknown> | null,
  loading: false,
  isPlatformStaff: false,
}));

vi.mock("@/hooks/useTenantContext", () => ({
  useTenantContext: () => ({
    loading: harness.loading,
    isPlatformStaff: harness.isPlatformStaff,
    activeTenant: harness.tenant,
    activeTenantId: harness.tenant?.id ?? null,
    // SoloEntry needs these; values that keep the entry decision neutral.
    accountContextLoading: harness.loading,
    accountContextStatus: harness.tenant ? "resolved" : "resolving",
    refresh: async () => true,
  }),
}));

// Signup is always complete for the #826 scenario (the gate is the subject).
vi.mock("@/components/auth/RequireCompleteSignup", () => ({
  RequireCompleteSignup: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
// Not a Beta-marked tenant: the entitlement gate passes through untouched.
vi.mock("@/components/auth/RequireSoloBetaEntitlement", () => ({
  RequireSoloBetaEntitlement: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

// The REAL guards under test:
const { RequireSetupComplete } = await import("@/components/auth/RequireSetupComplete");
const { decideWorkspaceEntry } = await import("@/lib/auth/workspaceEntry");
const { resolveTierKey } = await import("@/lib/tier/tierFeatures");

/** A minimal SoloEntry FAITHFUL to the real one's decision order (no shell mount). */
/** Renders the current pathname so a gate redirect on ANY leg is observable. */
function JourneyLocationMirror({ marker }: { marker: string }) {
  const location = useLocation();
  return <div data-journey={marker} data-path={location.pathname} />;
}

function JourneySoloShell() {
  const location = useLocation();
  const t = harness.tenant as Record<string, unknown> | null;
  if (harness.loading || !t) return <div data-journey="loading" />;
  const decision = decideWorkspaceEntry({
    root: "solo",
    classification: {
      account_type: (t.account_type as string) ?? null,
      parent_tenant_id: (t.parent_tenant_id as string | null) ?? null,
      isPlatformStaff: harness.isPlatformStaff,
    },
    accountNumber: (t.account_number as number) ?? null,
  });
  if (decision.kind === "redirect") return <div data-journey="entry-redirect" data-to={decision.to} />;
  if (decision.kind === "chooser") return <div data-journey="entry-chooser" />;
  return <div data-journey="shell" data-path={location.pathname} />;
}

let host: HTMLDivElement;
let root: Root | null = null;

/** Mount the journey at `path` and let the router settle; returns the terminal render. */
function walk(path: string): { path: string; journey: string; to?: string; text: string } {
  if (root) act(() => root!.unmount());
  host.remove();
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  let terminal = { path, journey: "", to: undefined as string | undefined, text: "" };
  act(() => {
    root!.render(
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route
            path="/solo/*"
            element={
              <RequireSetupComplete>
                <JourneySoloShell />
              </RequireSetupComplete>
            }
          />
          {/* The gate's own destination for a sub-account — mounted so the
              journey continues past it instead of blanking. */}
          <Route
            path="/business/*"
            element={
              <RequireSetupComplete>
                <JourneyLocationMirror marker="business-shell" />
              </RequireSetupComplete>
            }
          />
        </Routes>
      </MemoryRouter>,
    );
  });
  // Let the gate's <Navigate replace> commit (a second act tick).
  act(() => {});
  const shell = host.querySelector("[data-journey]");
  // Navigate captures where the gate SENT us (its <Navigate> commits a location change).
  const locationNow =
    host.querySelector("[data-journey='shell']")?.getAttribute("data-path")
    ?? host.querySelector("[data-journey='business-shell']")?.getAttribute("data-path");
  const marker = shell?.getAttribute("data-journey") ?? "";
  terminal = {
    path: locationNow ?? path,
    journey: marker,
    to: shell?.getAttribute("data-to") ?? undefined,
    text: host.textContent ?? "",
  };
  return terminal;
}

beforeEach(() => {
  host = document.createElement("div");
});
afterEach(() => {
  if (root) act(() => root!.unmount());
  host?.remove();
  vi.clearAllMocks();
});

const soloNoPlaybook = { features: {} as Record<string, unknown> };

describe("#826 journey — eligible Solo, shell reachable, setup incomplete", () => {
  it("proof 1 (FAILS on main): held on the shell's Setup, AND completing the canonical setup opens the gate", () => {
    // Leg A — the hold: any gated route lands on the shell's own Setup, and the
    // Setup itself RENDERS (no further redirect — the loop half is already fixed).
    harness.tenant = { ...soloNoPlaybook, id: "t-42", account_type: "standalone", parent_tenant_id: null, account_number: 42, status: "active" };
    harness.loading = false;
    harness.isPlatformStaff = false;
    const held = walk("/solo/42/command-center");
    expect(held.path).toBe("/solo/42/settings/setup");
    expect(held.journey).toBe("shell"); // reachable, not looping

    // Leg B — THE COMPLETION THE SHELL ACTUALLY OFFERS: the tenant finishes the
    // canonical in-shell Setup (save_solo_business_context). The durable record
    // of that completion is what the gate must recognize. This is the failing
    // half: on main, no completion the shell offers writes any open-signal, so
    // the gate re-traps on the very next route — the #826 dead-end.
    harness.tenant = {
      id: "t-42", account_type: "standalone", parent_tenant_id: null,
      account_number: 42, status: "active",
      features: { solo_setup_complete: true },
    } as typeof harness.tenant;
    const after = walk("/solo/42/command-center");
    expect(after.path).toBe("/solo/42/command-center");
    expect(after.journey).toBe("shell");
  });

  it("proof 5a: repeated guard evaluation while gated stays on Setup (no oscillation)", () => {
    harness.tenant = { ...soloNoPlaybook, id: "t-42", account_type: "standalone", parent_tenant_id: null, account_number: 42, status: "active" } as typeof harness.tenant;
    const first = walk("/solo/42/clients");
    const second = walk(first.path);
    const third = walk(second.path);
    expect([first.path, second.path, third.path]).toEqual([
      "/solo/42/settings/setup",
      "/solo/42/settings/setup",
      "/solo/42/settings/setup",
    ]);
  });

  it("proof 5b: after completion, a formerly-gated route does not re-trap (back/forward)", () => {
    harness.tenant = { features: { solo_setup_complete: true }, id: "t-42", account_type: "standalone", parent_tenant_id: null, account_number: 42, status: "active" } as typeof harness.tenant;
    expect(walk("/solo/42/command-center").journey).toBe("shell");
    expect(walk("/solo/42/growth/social").journey).toBe("shell");
    expect(walk("/solo/42/command-center").journey).toBe("shell");
  });
});

describe("#826 journey — setup already complete (legacy signal, unchanged)", () => {
  it("proof 2: a playbook-holding tenant goes straight to the canonical destination", () => {
    harness.tenant = { features: { playbook: "funding" }, id: "t-42", account_type: "standalone", parent_tenant_id: null, account_number: 42, status: "active" } as typeof harness.tenant;
    const r = walk("/solo/42/command-center");
    expect(r.path).toBe("/solo/42/command-center");
    expect(r.journey).toBe("shell");
  });

  it("proof 2b: playbook_config alone also opens the gate (the synchronous install marker)", () => {
    harness.tenant = { features: { playbook_config: { slug: "capital" } }, id: "t-42", account_type: "standalone", parent_tenant_id: null, account_number: 42, status: "active" } as typeof harness.tenant;
    expect(walk("/solo/42/analytics").journey).toBe("shell");
  });
});

describe("#826 journey — no widening", () => {
  it("proof 3a: platform staff are never gated", () => {
    harness.isPlatformStaff = true;
    harness.tenant = { ...soloNoPlaybook, id: "t-42", account_type: "standalone", parent_tenant_id: null, account_number: 42, status: "active" } as typeof harness.tenant;
    expect(walk("/solo/42/command-center").journey).toBe("shell");
    harness.isPlatformStaff = false;
  });

  it("proof 3b: loading fails OPEN (no redirect before the context resolves)", () => {
    harness.loading = true;
    const r = walk("/solo/42/command-center");
    expect(r.journey).toBe("loading");
    harness.loading = false;
  });

  it("proof 3c: no tenant-specific exception — the gate carries no account literal", async () => {
    const { readFileSync } = await import("node:fs");
    const src = readFileSync("src/components/auth/RequireSetupComplete.tsx", "utf8");
    expect(src).not.toMatch(/account_number\s*===?\s*\d+/);
    expect(src).not.toMatch(/["'](antonio|mogul|paige agent)/i);
  });
});

describe("#826 journey — agency / sub-account unchanged", () => {
  it("proof 4: an agency caller is not gated by this seam (no-ops, entry decision owns routing)", () => {
    harness.tenant = { features: {}, id: "t-9", account_type: "agency", parent_tenant_id: null, account_number: 9, status: "active" } as typeof harness.tenant;
    // The gate no-ops for non-business tiers; the journey shell's own entry
    // decision sends an agency caller home rather than mounting /solo.
    const r = walk("/solo/9/anything");
    expect(r.journey).toBe("entry-redirect");
    expect(r.to).toBe("/agency/9/command-center");
  });

  it("proof 4b: a sub-account without a playbook is STILL sent to its shell Setup (byte-identical signal semantics)", () => {
    harness.tenant = { features: {}, id: "t-84", account_type: null, parent_tenant_id: "p-1", account_number: 84, status: "active" } as typeof harness.tenant;
    const r = walk("/solo/84/command-center");
    // Wrong shell for the tier: the entry decision redirects to its own root
    // (/business), the gate sends /business to its own Setup, and that route
    // RENDERS there — the same hold as solo, on the sub-account's own shell.
    // (The pathname is asserted so a gate that stopped redirecting sub-accounts
    // would FAIL here rather than pass vacuously.)
    expect(r.journey).toBe("business-shell");
    expect(r.path).toBe("/business/84/setup");
    // Signal semantics note (adversarial review MINOR 2): the marker check is
    // tier-AGNOSTIC in the gate — a sub-account carrying solo_setup_complete
    // WOULD open it. It is dormant for them only because nothing can write it:
    // every solo-setup RPC funnels through solo_setup_assert_canonical_tenant
    // (standalone + no parent), pinned by the pgTAP probe's tier shape.
    const tier = resolveTierKey({ isPlatformStaff: false, account_type: null, parent_tenant_id: "p-1" });
    expect(tier).toBe("sub_account");
  });
});
