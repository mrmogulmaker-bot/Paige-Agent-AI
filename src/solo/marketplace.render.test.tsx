import React, { act } from "react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => ({ read: vi.fn(), expandRail: vi.fn() }));
vi.mock("./data/useSoloMarketplace", () => ({ useSoloMarketplace: () => harness.read() }));
vi.mock("@/components/ui/paige/AgentPresenceContext", () => ({ useAgentPresence: () => ({ expandRail: harness.expandRail }) }));
vi.mock("@/lib/routing/useSubtabRoute", async () => {
  const ReactModule = await import("react");
  return { useSubtabRoute: (_tier: string, _branch: string, initial: string) => ReactModule.useState(initial) };
});

import { Marketplace } from "./marketplace";
import { projectMarketplaceRow } from "./marketplace-truth";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const item = projectMarketplaceRow({
  slug: "operations-review", item_type: "playbook", name: "Operations review",
  tagline: "Paige builds and runs your plays.", description: "Install it now so Paige can execute the workflow.",
  category: "Operations", icon: "clipboard", pricing_model: "free", price_cents: 0,
  requires_embedding: false, installed: false, install_status: null, version: "1.2.0",
});
const refresh = vi.fn();
const ready = {
  state: "ready", items: [item],
  summary: { installed: { state: "PARTIAL", count: 0 }, updates: { state: "UNAVAILABLE", count: null } },
  source: "marketplace_catalog_for_tenant", refresh,
};
let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.clearAllMocks(); harness.read.mockReturnValue(ready);
  host = document.createElement("div"); document.body.appendChild(host); root = createRoot(host);
});
afterEach(() => { act(() => root.unmount()); host.remove(); });
function render() { act(() => root.render(<Marketplace />)); }
function button(name: string) { return [...host.querySelectorAll("button")].find((node) => node.textContent?.includes(name)) as HTMLButtonElement | undefined; }
const marketplaceCss = readFileSync(join(process.cwd(), "src/solo/marketplace.css"), "utf8");

describe("Solo Marketplace rendered truth", () => {
  it("defines the approved light-up interaction contract without using truth colors as decoration", () => {
    expect(marketplaceCss).toContain("@media (hover:hover) and (pointer:fine)");
    expect(marketplaceCss).toMatch(/\.mk-interactive:not\(:disabled\):hover/);
    expect(marketplaceCss).toMatch(/\.mk-interactive:focus-visible/);
    expect(marketplaceCss).toMatch(/\.mk-interactive:not\(:disabled\):active/);
    expect(marketplaceCss).toMatch(/\.mk-interactive:disabled/);
    expect(marketplaceCss).not.toMatch(/\.mk-interactive:(?:hover|active)/);
    expect(marketplaceCss).toContain("@media(prefers-reduced-motion:reduce)");
    expect(marketplaceCss).not.toMatch(/\.mk-interactive:(?:hover|focus-visible)[^{]*\{[^}]*(?:--mk-ok|--mk-warn|--mk-unavailable)/);
    expect(marketplaceCss).toMatch(/\.mk-glyph-connector\{--mk-identity:var\(--ink-2\)\}/);
    expect(marketplaceCss).toMatch(/\.mk-glyph-workflow\{--mk-identity:var\(--violet-2\)\}/);
    expect(marketplaceCss).toMatch(/\.mk-glyph-content\{--mk-identity:var\(--violet\)\}/);
    expect(marketplaceCss).not.toMatch(/\.mk-glyph-(?:connector|workflow|content)\{[^}]*(?:--mk-ok|--mk-warn|--mk-unavailable|--ok|--warn|--bad)/);
  });

  it("uses one explicit vertical catalogue scroll owner and no primary horizontal card rail", () => {
    render();
    expect(host.querySelectorAll('[data-marketplace-scroll-owner="catalogue"]')).toHaveLength(1);
    expect(host.querySelector('[data-marketplace-scroll-owner="catalogue"]')?.getAttribute("tabindex")).toBe("0");
    expect(host.querySelector(".mk-card-rail")).toBeNull();
    expect(host.querySelector(".mk-catalogue-grid")).not.toBeNull();
    expect(marketplaceCss).toMatch(/\.mk-body\{[^}]*overflow-y:auto/);
    expect(marketplaceCss).toMatch(/\.mk-body\{[^}]*overflow-x:hidden/);
    expect(marketplaceCss).toMatch(/\.mk-grid\{[^}]*grid-template-columns:repeat\(auto-fit/);
    expect(marketplaceCss).toMatch(/\.mk-dialog\{[^}]*background:var\(--surface\)/);
  });

  it("uses one static truthful promotion and no duplicate white page-heading slab", () => {
    render();
    expect(host.querySelector(".pg-hd")).toBeNull();
    expect(host.querySelectorAll('[data-marketplace-promo-slot="static"]')).toHaveLength(1);
    expect(host.querySelectorAll(".mk-catalogue-intro")).toHaveLength(1);
    expect(host.querySelectorAll(".mk-catalogue-intro h1")).toHaveLength(1);
    expect(host.textContent).not.toContain("Governed capability catalogue");
    expect(marketplaceCss).toMatch(/\.mk-tabs\{[^}]*background:var\(--rail\)/);
    expect(marketplaceCss).toMatch(/\.paige-solo \.mk-catalogue-intro h1\{color:#fff\}/);
    expect(marketplaceCss).toMatch(/\.paige-solo \.mk-catalogue-intro \.btn\{[^}]*background:var\(--gold-bright\)/);
  });

  it("binds every capability-copy badge to the displayed copy proof across cards, tabs, and detail", () => {
    const liveItem = {
      ...item,
      safeState: "LIVE" as const,
      installed: true,
      installStatus: "active",
    };
    harness.read.mockReturnValue({
      ...ready,
      items: [liveItem],
      summary: { ...ready.summary, installed: { state: "PARTIAL", count: 1 } },
    });
    render();

    for (const tab of ["Today", "Browse", "Installed"]) {
      act(() => button(tab)?.click());
      const card = host.querySelector<HTMLButtonElement>(".mk-card")!;
      expect(card.querySelector(".mk-card-copy")?.textContent).toBe("Release-bound capability details are unavailable.");
      expect(card.querySelector(".mk-card-head .mk-truth")?.textContent).toBe("UNAVAILABLE");
    }

    act(() => host.querySelector<HTMLButtonElement>(".mk-card")!.click());
    const dialog = host.querySelector<HTMLElement>('[role="dialog"]')!;
    expect(dialog.querySelector(".mk-dialog-body section p")?.textContent).toBe("Release-bound capability details are unavailable.");
    expect(dialog.querySelector(".mk-dialog-hero .mk-truth")?.textContent).toBe("UNAVAILABLE");
  });

  it("preserves the four tabs and renders only server-projected cards", () => {
    render();
    expect([...(host.querySelectorAll(".mk-tabs button"))].map((node) => node.textContent?.trim())).toEqual(["Today", "Browse", "Installed", "Updates"]);
    expect(host.textContent).toContain("Operations review");
    expect(host.textContent).toContain("LIVE");
    expect(host.textContent).toContain("PARTIAL");
    expect(host.textContent).toContain("Release-bound capability details are unavailable.");
    expect(host.textContent).not.toContain("Paige builds and runs your plays.");
    expect(host.textContent).not.toMatch(/Editors.? pick|Top charts|rating|review count|most installed/i);
  });

  it("fails detail authority closed and opens only the existing PAIGE workspace", async () => {
    render();
    const trigger = button("Operations review")!;
    act(() => trigger.focus()); act(() => trigger.click());
    expect(host.querySelector('[role="dialog"]')).not.toBeNull();
    expect(host.textContent).toContain("Publisher provenance");
    expect(host.textContent).toContain("Immutable release identity");
    expect(host.textContent).toContain("Default deny until a reviewed declaration exists");
    expect(host.textContent).toContain("It is not attached, sent, installed, activated, purchased, or executed");
    expect(host.textContent).not.toContain("Install it now so Paige can execute the workflow.");
    await act(async () => button("Open PAIGE workspace")?.click());
    expect(host.querySelector('[role="dialog"]')).toBeNull();
    expect(harness.expandRail).toHaveBeenCalledTimes(1);
    expect(document.activeElement).toBe(trigger);
  });

  it("withholds unproven catalogue marketing copy from Today, Browse, and Installed cards", () => {
    const installed = projectMarketplaceRow({
      slug: "voice-agent", item_type: "connector", name: "Voice Agent",
      tagline: "Let clients talk to Paige.", description: "Activate Paige to handle every client call.",
      category: "Connections", icon: null, pricing_model: "paid", price_cents: 4900,
      requires_embedding: false, installed: true, install_status: "active", version: "2.0.0",
    });
    harness.read.mockReturnValue({ ...ready, items: [item, installed], summary: { ...ready.summary, installed: { state: "PARTIAL", count: 1 } } });
    render();
    expect(host.textContent).not.toMatch(/Paige builds and runs your plays|Let clients talk to Paige/i);
    act(() => button("Browse")?.click());
    expect(host.textContent).not.toMatch(/Paige builds and runs your plays|Let clients talk to Paige/i);
    act(() => button("Installed")?.click());
    expect(host.textContent).toContain("Voice Agent");
    expect(host.textContent).not.toMatch(/Let clients talk to Paige|Activate Paige to handle every client call/i);
  });

  it("keeps mutable copy unavailable end to end even when every generic release flag is LIVE", async () => {
    const legacy = projectMarketplaceRow({
      slug: "autopilot", item_type: "workflow", name: "Autopilot Review",
      tagline: "Install Paige for autonomous execution.", description: "Purchase this recommended workflow for proven outcomes.",
      category: "Operations", icon: null, pricing_model: "paid", price_cents: 9900,
      requires_embedding: false, installed: true, install_status: "active", version: "9.9.9",
    });
    const live = { state: "LIVE" as const, value: null };
    const allGenericLive = {
      ...legacy, safeState: "LIVE" as const,
      tenantEligibility: { state: "LIVE" as const, value: "catalogue record" as const },
      releaseVersion: { state: "LIVE" as const, value: "9.9.9" },
      publisher: live, releaseIdentity: live, approvedScope: live,
      declaredCapabilities: live, prerequisites: live,
    };
    harness.read.mockReturnValue({ ...ready, items: [allGenericLive], summary: { ...ready.summary, installed: { state: "PARTIAL", count: 1 } } });
    render();
    expect(host.textContent).toContain("Release-bound capability details are unavailable.");
    expect(host.textContent).not.toMatch(/Install Paige|autonomous execution|Purchase this|recommended workflow|proven outcomes/i);
    act(() => button("Autopilot Review")?.click());
    expect(host.querySelector('[role="dialog"]')).not.toBeNull();
    expect(host.textContent).not.toMatch(/Install Paige|Purchase this recommended workflow/i);
    await act(async () => host.querySelector<HTMLButtonElement>('[aria-label="Close capability details"]')?.click());
    act(() => button("Browse")?.click());
    const search = host.querySelector<HTMLInputElement>('input[placeholder="Search catalogue capabilities"]')!;
    const setInputValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    act(() => { setInputValue.call(search, "autonomous execution"); search.dispatchEvent(new Event("input", { bubbles: true })); });
    expect(host.textContent).toContain("No matching catalogue records");
    act(() => { setInputValue.call(search, "workflow"); search.dispatchEvent(new Event("input", { bubbles: true })); });
    expect(host.textContent).toContain("Autopilot Review");
    act(() => button("Installed")?.click());
    expect(host.textContent).toContain("Autopilot Review");
    expect(host.textContent).not.toMatch(/Install Paige|Purchase this recommended workflow/i);
  });

  it("renders zero installed and zero update candidates without action controls", () => {
    render(); act(() => button("Installed")?.click());
    expect(host.textContent).toContain("0 visible active-install observations");
    act(() => button("Updates")?.click());
    expect(host.textContent).toContain("Update readiness unavailable");
    expect([...host.querySelectorAll("button")].map((node) => node.textContent).join(" ")).not.toMatch(/\b(Install|Update all|Remove|Buy|Purchase|Activate|Execute)\b/i);
  });

  it("names resolving, identity-unavailable, and failed read states without fallback content", () => {
    for (const [state, text] of [["resolving", "Reading caller-scoped catalogue records"], ["unavailable", "Marketplace context unavailable"], ["error", "Marketplace catalogue unavailable"]] as const) {
      harness.read.mockReturnValue({ ...ready, state, items: [] });
      act(() => root.render(<Marketplace />));
      expect(host.textContent).toContain(text);
      expect(host.textContent).not.toContain("Operations review");
    }
  });
});
