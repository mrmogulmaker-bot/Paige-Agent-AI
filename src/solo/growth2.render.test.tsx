import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GrowthHub } from "./growth2";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const harness = vi.hoisted(() => ({
  state: {
    phase: "ready",
    campaigns: [{ id: "campaign-1", name: "Grounded campaign", status: "active", activeCount: 2, completedCount: 4, lastActivityAt: "2026-08-28T12:00:00Z" }],
    artifacts: [{ id: "page-1", type: "page", name: "Published page", slug: "published-page", status: "published", updatedAt: "2026-08-28T12:00:00Z", publicHref: "/p/example/published-page", recentSubmissions: 0, routingConfigured: false, routingTargets: [], recentDispatches: { succeeded: 0, failed: 0, other: 0 } }],
    submissions: [],
    retry: vi.fn(),
  } as Record<string, unknown>,
}));

vi.mock("./useSoloCampaigns", () => ({ useSoloCampaigns: () => harness.state }));

let host: HTMLDivElement;
let root: Root;

function renderAt(path: string) {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => root.render(<MemoryRouter initialEntries={[path]}><Routes><Route path="/solo/:account/*" element={<><GrowthHub/><LocationProbe/></>}/></Routes></MemoryRouter>));
}

function LocationProbe() {
  const location = useLocation();
  return <output data-location>{location.pathname}{location.search}</output>;
}

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
});

describe("Solo Campaigns rendered flows", () => {
  it("renders populated grounded rows and closes details with Escape", () => {
    renderAt("/solo/42/growth/catalog");
    expect(host.textContent).toContain("Published page");
    const details = [...host.querySelectorAll("button")].find((button) => button.textContent === "Details")!;
    details.focus();
    act(() => details.click());
    expect(host.querySelector('[role="dialog"]')).not.toBeNull();
    act(() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })));
    expect(host.querySelector('[role="dialog"]')).toBeNull();
    expect(document.activeElement).toBe(details);
  });

  it("keeps focus inside the modal drawer in both tab directions", () => {
    renderAt("/solo/42/growth/catalog");
    const details = [...host.querySelectorAll("button")].find((button) => button.textContent === "Details")!;
    act(() => details.click());
    const close = host.querySelector('[role="dialog"] button') as HTMLButtonElement;
    expect(document.activeElement).toBe(close);
    act(() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true })));
    expect(document.activeElement).toBe(close);
    act(() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", shiftKey: true, bubbles: true })));
    expect(document.activeElement).toBe(close);
    expect(host.querySelector(".campaigns-nav")?.hasAttribute("inert")).toBe(true);
  });

  it("renders the exact tab order and moves route plus focus with arrow keys", () => {
    renderAt("/solo/42/growth/overview");
    const tabs = [...host.querySelectorAll('[role="tab"]')] as HTMLButtonElement[];
    expect(tabs.map((tab) => tab.textContent)).toEqual(["Overview", "Catalog", "Sales", "Pipeline", "Social", "Performance"]);
    tabs[0].focus();
    act(() => tabs[0].dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true })));
    expect((host.querySelector("[data-location]") as HTMLOutputElement).value).toBe("/solo/42/growth/catalog");
    expect(document.activeElement?.textContent).toBe("Catalog");
  });

  it("renders error/retry and unavailable identity without treating either as empty", () => {
    harness.state = { phase: "error", campaigns: [], artifacts: [], submissions: [], retry: vi.fn() };
    renderAt("/solo/42/growth/overview");
    expect(host.textContent).toContain("Campaigns could not load");
    const retry = [...host.querySelectorAll("button")].find((button) => button.textContent?.includes("Retry"))!;
    act(() => retry.click());
    expect(harness.state.retry).toHaveBeenCalledOnce();
    act(() => root.unmount());
    host.remove();
    harness.state = { phase: "unavailable", campaigns: [], artifacts: [], submissions: [], retry: vi.fn() };
    renderAt("/solo/42/growth/overview");
    expect(host.textContent).toContain("Campaigns needs a resolved workspace");
    expect(host.textContent).not.toContain("No running campaign records");
  });

  it("owns all five legacy landings and dispatches the supported generic Vibe handoff", () => {
    harness.state = { phase: "ready", campaigns: [], artifacts: [], submissions: [], retry: vi.fn() };
    const listener = vi.fn();
    window.addEventListener("paige-studio", listener);
    for (const [slug, label] of [["brand-kit","Brand Kit"],["pages","Pages"],["funnels","Funnels"],["forms","Forms"],["builders","Builders"]]) {
      renderAt(`/solo/42/growth/${slug}`);
      expect(host.textContent).toContain("This address moved");
      expect(host.textContent).toContain(`${label} is no longer a Campaigns subtab`);
      if (slug !== "builders") { act(() => root.unmount()); host.remove(); }
    }
    const launch = host.querySelector(".campaigns-compat [data-solo-vibe-studio-launcher]") as HTMLButtonElement;
    act(() => launch.click());
    expect(listener).toHaveBeenCalledOnce();
    expect((listener.mock.calls[0][0] as CustomEvent).detail.returnFocus).toBe(launch);
    window.removeEventListener("paige-studio", listener);
  });
});
