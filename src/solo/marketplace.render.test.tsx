import React, { act } from "react";
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
  tagline: "A tenant-visible review framework.", description: "A source-backed catalogue description.",
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

describe("Solo Marketplace rendered truth", () => {
  it("preserves the four tabs and renders only server-projected cards", () => {
    render();
    expect([...(host.querySelectorAll(".mk-tabs button"))].map((node) => node.textContent?.trim())).toEqual(["Today", "Browse", "Installed", "Updates"]);
    expect(host.textContent).toContain("Operations review");
    expect(host.textContent).toContain("LIVE");
    expect(host.textContent).toContain("PARTIAL");
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
    await act(async () => button("Open PAIGE workspace")?.click());
    expect(host.querySelector('[role="dialog"]')).toBeNull();
    expect(harness.expandRail).toHaveBeenCalledTimes(1);
    expect(document.activeElement).toBe(trigger);
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
