import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Marketplace } from "./marketplace";

const state = vi.hoisted(() => ({ tab: "today", rows: [] as Array<Record<string, unknown>>, failure: null as Error | null }));

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("@/hooks/useTenantContext", () => ({
  useTenantContext: () => ({ activeTenantId: "tenant-first-sterling", loading: false }),
}));
vi.mock("@/lib/routing/useSubtabRoute", () => ({
  useSubtabRoute: () => [state.tab, vi.fn()],
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: vi.fn(async () => state.failure ? { data: null, error: state.failure } : { data: state.rows, error: null }),
  },
}));

let host: HTMLDivElement;
let root: Root;

const catalogRow = {
  slug: "client-onboarding",
  item_type: "kb_pack",
  name: "Client Onboarding Essentials",
  tagline: "A grounded onboarding knowledge pack.",
  description: "Adds published onboarding guidance to Paige.",
  category: "client_experience",
  icon: "BookOpen",
  pricing_model: "free",
  price_cents: 0,
  requires_embedding: true,
  installed: true,
  install_status: "installed",
  version: "1.0.0",
};

beforeEach(() => {
  state.tab = "today";
  state.rows = [catalogRow];
  state.failure = null;
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

async function render() {
  await act(async () => {
    root.render(<Marketplace />);
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe("Solo Marketplace truth repoint", () => {
  it("renders only tenant-resolved catalog and installed state, with no simulated social proof", async () => {
    await render();
    const detail = [...host.querySelectorAll("button")].find((button) => button.textContent?.includes("View details"));
    await act(async () => detail?.click());
    expect(host.textContent).toContain("Client Onboarding Essentials");
    expect(host.textContent).toContain("Installed on this workspace");
    expect(host.textContent).toContain("What Paige reads");
    expect(host.textContent).toContain("No capability has been installed, updated, or changed from this view.");
    expect(host.textContent).not.toMatch(/most installed|editors.? pick|ratings|top charts/i);
  });

  it("keeps paid acquisition behind an honest secure-owner handoff without creating checkout", async () => {
    state.rows = [{ ...catalogRow, slug: "voice", name: "Voice Agent", installed: false, install_status: null, pricing_model: "monthly", price_cents: 4900 }];
    await render();
    const detail = [...host.querySelectorAll("button")].find((button) => button.textContent?.includes("View details"));
    expect(detail).toBeTruthy();
    await act(async () => detail?.click());
    expect(host.textContent).toContain("Secure purchase is managed outside this view");
    expect(host.textContent).not.toContain("Start checkout");
  });

  it("renders a retryable catalog-read failure rather than a fixture fallback", async () => {
    state.failure = new Error("permission denied");
    await render();
    expect(host.textContent).toContain("Marketplace could not be loaded");
    expect(host.textContent).toContain("Try again");
    expect(host.textContent).not.toContain("Business Coaching");
  });

  it("restores drawer focus on Escape and keeps the first slice read-only", async () => {
    await render();
    const trigger = [...host.querySelectorAll<HTMLButtonElement>("button")].find((button) => button.textContent?.includes("View details"))!;
    await act(async () => { trigger.focus(); trigger.click(); });
    expect(host.querySelector('[role="dialog"]')?.getAttribute("aria-modal")).toBe("true");
    expect(document.activeElement?.getAttribute("aria-label")).toBe("Close capability details");
    const last = [...host.querySelectorAll<HTMLButtonElement>('[role="dialog"] button')].at(-1)!;
    await act(async () => { last.focus(); window.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab" })); });
    expect(document.activeElement?.getAttribute("aria-label")).toBe("Close capability details");
    await act(async () => window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })));
    expect(host.querySelector('[role="dialog"]')).toBeNull();
    await act(async () => { await new Promise<void>((resolve) => requestAnimationFrame(() => resolve())); });
    expect(document.activeElement).toBe(trigger);

    const source = readFileSync(resolve(process.cwd(), "src/solo/marketplace.tsx"), "utf8");
    expect(source).toContain('"marketplace_catalog_for_tenant"');
    expect(source).toContain('"marketplace_item_detail"');
    expect(source).not.toContain("marketplace-install");
    expect(source).not.toContain("marketplace-checkout-session");
    expect(source).not.toContain("uninstall_marketplace_item");
  });

  it("contains laptop and tablet form-fit and reduced-motion rules", () => {
    const css = readFileSync(resolve(process.cwd(), "src/solo/marketplace.css"), "utf8");
    expect(css).toContain("grid-template-columns:minmax(0,1.6fr) minmax(280px,1fr)");
    expect(css).toContain("@media(max-width:1020px)");
    expect(css).toContain("@media(max-width:620px)");
    expect(css).toContain("@media(prefers-reduced-motion:reduce)");
    expect(css).toContain("width:min(560px,96vw)");
  });
});
