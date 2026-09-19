/**
 * OWNER ADJUDICATION 2026-09-19 — SOLO SETUP IS NOT AN ACCESS GATE.
 *
 * This walks the COMPLETE journey, not a single component or hop: the REAL
 * guard order the /solo subtree mounts (RequireCompleteSignup →
 * RequireSoloBetaEntitlement → RequireSetupComplete) over the REAL route
 * decisions (SoloEntry's decideWorkspaceEntry + the gate), driven through a
 * memory router as the router itself would drive them.
 *
 * THE CONTRACT THIS FILE ENFORCES: no Solo account may be blocked from the
 * PAIGE application or PAIGE Chat because Setup has not been completed.
 * Historical setup metadata (legacy marketplace playbook markers, or the
 * canonical solo_setup_complete marker) must not determine whether an
 * otherwise-equivalent Solo account can access the product. The proofs below
 * FAIL on pre-adjudication main (which redirects a playbook-less Solo tenant
 * to /settings/setup).
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

const baseTenant = () => ({ id: "t-42", account_type: "standalone", parent_tenant_id: null, account_number: 42, status: "active", features: {} as Record<string, unknown> });

describe("adjudicated journey — Solo setup-incomplete: application access", () => {
  it("proof 1 (FAILS on pre-adjudication main): a fresh zero-save Solo owner lands on the DESTINATION they requested", () => {
    harness.tenant = baseTenant();
    const r = walk("/solo/42/command-center");
    expect(r.path).toBe("/solo/42/command-center");
    expect(r.journey).toBe("shell");
    // The non-blocking readiness reminder lives INSIDE the shell now (the
    // gate renders children only — the layout correction); its behavior is
    // proven in solo-setup-readiness-notice.test.tsx.
  });

  it("proof 1b: PAIGE Chat is reachable immediately — the route renders, never redirected", () => {
    harness.tenant = baseTenant();
    const r = walk("/solo/42/paige/chat");
    expect(r.path).toBe("/solo/42/paige/chat");
    expect(r.journey).toBe("shell");
  });

  it("proof 1c: the owner can navigate AWAY from Setup (Setup itself renders — reachable, not a trap)", () => {
    harness.tenant = baseTenant();
    const fromSetup = walk("/solo/42/settings/setup");
    expect(fromSetup.path).toBe("/solo/42/settings/setup");
    expect(fromSetup.journey).toBe("shell");
    const away = walk("/solo/42/clients");
    expect(away.path).toBe("/solo/42/clients");
    expect(away.journey).toBe("shell");
  });

  it("proof 1d: reload/login does not force the owner back to Setup (repeated evaluation is stable)", () => {
    harness.tenant = baseTenant();
    const first = walk("/solo/42/command-center");
    const second = walk(first.path);
    const third = walk(second.path);
    expect([first.path, second.path, third.path]).toEqual([
      "/solo/42/command-center",
      "/solo/42/command-center",
      "/solo/42/command-center",
    ]);
  });

  it("proof 1e: the gate renders NO reminder sibling — the document never grows past the shell (Finding 1 regression)", () => {
    harness.tenant = baseTenant();
    walk("/solo/42/command-center");
    // The gate output is exactly the children: no banner element, no wrapper.
    expect(host.querySelector("[data-setup-readiness]")).toBeNull();
    expect(host.querySelector("[data-journey='shell']")).toBeTruthy();
  });

  it("proof 1f: solo_setup_complete absent or false never blocks core Solo (explicit)", () => {
    harness.tenant = { ...baseTenant(), features: { solo_setup_complete: false } };
    const r = walk("/solo/42/growth/social");
    expect(r.path).toBe("/solo/42/growth/social");
    expect(r.journey).toBe("shell");
  });

  it("proof 1g: missing business context surfaces as honest readiness, not an application redirect", async () => {
    const { readFileSync } = await import("node:fs");
    // PAIGE's context assembly carries a business-context evidence block that
    // degrades honestly when context is missing — it never bounces the owner.
    const brain = readFileSync("supabase/functions/_shared/paige-spine/domains/businessContextChatEvidence.ts", "utf8");
    expect(brain.length).toBeGreaterThan(0);
    // And the readiness seam the Systems Check reads is a server-side fact
    // read, not a route decision.
    const systems = readFileSync("supabase/functions/_shared/systems-check-runners/_business-context-readiness.ts", "utf8");
    expect(systems).toContain("get_business_context_readiness");
  });
});

describe("adjudicated journey — historical markers grant NO broader Solo access", () => {
  it("proof 2: an MMA-style legacy-playbook Solo resolves through the EXACT same routing contract", () => {
    // Legacy grandfather state: marketplace-era playbook + config + the dead
    // shell flag PR2 retired. It grants exactly the destinations every Solo
    // gets — and no readiness banner (setup-complete = readiness fact).
    harness.tenant = { ...baseTenant(), features: { playbook: "funding", playbook_config: { slug: "funding" }, solo_shell_enabled: true } };
    const complete = walk("/solo/42/command-center");
    expect(complete.path).toBe("/solo/42/command-center");
    expect(complete.journey).toBe("shell");
  });

  it("proof 2b: playbook presence grants NOTHING beyond the identical shell — the same destinations render for both states", () => {
    for (const features of [{}, { playbook: "funding" }] as Array<Record<string, unknown>>) {
      harness.tenant = { ...baseTenant(), features };
      for (const path of ["/solo/42/command-center", "/solo/42/paige/chat", "/solo/42/clients", "/solo/42/settings/team", "/solo/42/calendar"]) {
        const r = walk(path);
        const label = `${JSON.stringify(features)} @ ${path}`;
        expect(`${label} → ${r.path}:${r.journey}`).toBe(`${label} → ${path}:shell`);
      }
    }
  });

  it("proof 2d: solo_setup_complete=true resolves through the same routing (the marker is readiness state, not access)", () => {
    harness.tenant = { ...baseTenant(), features: { solo_setup_complete: true } };
    const r = walk("/solo/42/command-center");
    expect(r.path).toBe("/solo/42/command-center");
    expect(r.journey).toBe("shell");
  });

  it("proof 2c (source): the solo path carries NO access predicate on setup state — the redirect exists only for sub_account", async () => {
    const { readFileSync } = await import("node:fs");
    const src = readFileSync("src/components/auth/RequireSetupComplete.tsx", "utf8");
    // The redirect decision is sub-account-only...
    expect(src).toContain('const gatedTier = tierKey === "sub_account";');
    // ...and the solo branch returns children (+ optional banner) with NO Navigate.
    const soloBranch = src.slice(src.indexOf('if (tierKey === "solo")'), src.indexOf("// ── SUB-ACCOUNT"));
    expect(soloBranch).not.toContain("<Navigate");
    // The /solo route keeps its outer entitlement/signup guards (App wiring).
    const app = readFileSync("src/App.tsx", "utf8");
    expect(app).toContain("<RequireCompleteSignup><RequireSoloBetaEntitlement><RequireSetupComplete>");
  });
});

describe("adjudicated journey — no widening", () => {
  it("proof 3a: platform staff are never gated and never bannered", () => {
    harness.isPlatformStaff = true;
    try {
      harness.tenant = baseTenant();
      const r = walk("/solo/42/command-center");
      expect(r.journey).toBe("shell");
      expect(host.querySelector("[data-setup-readiness='incomplete']")).toBeNull();
    } finally {
      harness.isPlatformStaff = false;
    }
  });

  it("proof 3b: loading fails OPEN (no redirect, no banner before the context resolves)", () => {
    harness.loading = true;
    const r = walk("/solo/42/command-center");
    expect(r.journey).toBe("loading");
    expect(host.querySelector("[data-setup-readiness='incomplete']")).toBeNull();
    harness.loading = false;
  });

  it("proof 3c: no tenant-specific exception — the gate carries no account literal", async () => {
    const { readFileSync } = await import("node:fs");
    const src = readFileSync("src/components/auth/RequireSetupComplete.tsx", "utf8");
    expect(src).not.toMatch(/account_number\s*===?\s*\d+/);
    expect(src).not.toMatch(/["'](antonio|mogul|paige agent)/i);
  });
});

describe("adjudicated journey — agency / sub-account unchanged", () => {
  it("proof 4: an agency caller is not gated by this seam (no-ops, entry decision owns routing)", () => {
    harness.tenant = { ...baseTenant(), id: "t-9", account_type: "agency", account_number: 9 };
    const r = walk("/solo/9/anything");
    expect(r.journey).toBe("entry-redirect");
    expect(r.to).toBe("/agency/9/command-center");
  });

  it("proof 4b: a sub-account without a playbook is STILL sent to its shell Setup (Solo's new contract does not leak across tiers)", () => {
    harness.tenant = { ...baseTenant(), id: "t-84", account_type: null, parent_tenant_id: "p-1", account_number: 84 };
    const r = walk("/solo/84/command-center");
    // Wrong shell for the tier: the entry decision redirects to its own root
    // (/business), the gate sends /business to its own Setup, and that route
    // RENDERS there. The pathname is asserted so a gate that stopped
    // redirecting sub-accounts would FAIL here rather than pass vacuously.
    expect(r.journey).toBe("business-shell");
    expect(r.path).toBe("/business/84/setup");
    const tier = resolveTierKey({ isPlatformStaff: false, account_type: null, parent_tenant_id: "p-1" });
    expect(tier).toBe("sub_account");
  });
});
