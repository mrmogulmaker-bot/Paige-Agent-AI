// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { Analytics2 } from "./analytics2";

let host: HTMLDivElement;
let root: Root;
const openPaige = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    callback(0);
    return 1;
  });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

function render(accountName = "Verified Solo Account", accountType: string | null = "standalone") {
  act(() => root.render(<div data-pg="dark" data-tenant-shell><MemoryRouter><Analytics2 accountContext={{ accountName, accountType }} openPaige={openPaige} /></MemoryRouter></div>));
}

function button(name: string) {
  return [...host.querySelectorAll("button")].find((item) => item.textContent?.includes(name)) as HTMLButtonElement | undefined;
}

describe("Solo Analytics operating workspace", () => {
  it("starts with a semantic-only title and six first-class tabs", () => {
    render();
    const heading = host.querySelector("h1");
    expect(heading?.textContent).toBe("Analytics");
    expect(heading?.classList.contains("anr-sr-only")).toBe(true);
    expect(host.querySelector(".anr-visible-page-title")).toBeNull();
    expect(host.querySelector("[data-tenant-account-name]")?.textContent).toBe("Verified Solo Account");
    expect([...host.querySelectorAll('[role="tab"]')].map((item) => item.textContent)).toEqual([
      "Brief",
      "Sales funnel",
      "Revenue & profit",
      "Retention",
      "Acquisition",
      "Decisions",
    ]);
    expect(host.querySelectorAll(".anr-evidence-wheel")).toHaveLength(1);
  });

  it("renders structural funnels, circles, cohorts, and sources without invented values", () => {
    render();
    act(() => button("Sales funnel")?.click());
    expect(host.querySelectorAll(".anr-cylinder-stage")).toHaveLength(4);
    expect(host.textContent).toContain("No proved count");

    act(() => button("Revenue & profit")?.click());
    expect(host.querySelectorAll(".anr-radial-ring")).toHaveLength(3);
    expect(host.textContent).toContain("No total");

    act(() => button("Retention")?.click());
    expect(host.querySelectorAll(".anr-cohort-cell").length).toBeGreaterThan(10);

    act(() => button("Acquisition")?.click());
    expect(host.querySelectorAll(".anr-source-node")).toHaveLength(3);
    expect(host.textContent).toContain("NOT CONNECTED");

    expect(host.textContent).not.toMatch(/\$[\d,.]+/);
    expect(host.textContent).not.toMatch(/\b\d+(?:\.\d+)?%\b/);
    expect(host.textContent).not.toContain("fixture records");
  });

  it("keeps truth, range, source, and freshness attached to the active visual", () => {
    render();
    const strip = host.querySelector(".anr-evidence-strip");
    expect(strip?.textContent).toContain("Truth");
    expect(strip?.textContent).toContain("UNAVAILABLE");
    expect(strip?.textContent).toContain("Range");
    expect(strip?.textContent).toContain("Local preference · unissued");
    expect(strip?.textContent).toContain("Source");
    expect(strip?.textContent).toContain("No source reference");
    expect(strip?.textContent).toContain("Freshness");
    expect(strip?.textContent).toContain("Not queried");
  });

  it("opens the opaque evidence inspector and restores focus on Escape", () => {
    render();
    const trigger = host.querySelector<HTMLButtonElement>('[aria-label="Open evidence"]')!;
    act(() => trigger.focus());
    act(() => trigger.click());
    const dialog = document.querySelector('[role="dialog"]');
    expect(dialog?.classList.contains("anr-drawer")).toBe(true);
    expect(dialog?.parentElement?.getAttribute("data-pg")).toBe("dark");
    expect(dialog?.textContent).toContain("Metric identity");
    expect(dialog?.textContent).toContain("Formula / version");
    expect(dialog?.textContent).toContain("Completeness / coverage");
    expect(host.querySelector("[data-tenant-shell]")?.getAttribute("aria-hidden")).toBe("true");
    expect((host.querySelector("[data-tenant-shell]") as HTMLElement).inert).toBe(true);
    expect(document.activeElement?.getAttribute("aria-label")).toBe("Close evidence");
    act(() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })));
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it("uses the one existing PAIGE launcher and keeps unsupported analysis disabled", () => {
    render();
    act(() => button("Open PAIGE workspace")?.click());
    expect(openPaige).toHaveBeenCalledTimes(1);
    expect(button("Ask PAIGE for a rundown")?.disabled).toBe(true);
    expect(button("Open analysis workspace")?.disabled).toBe(true);
    expect(host.textContent).toContain("No governed recommendation");
  });

  it("fails closed when the active Solo account cannot be verified", () => {
    render("Your workspace", null);
    expect(host.textContent).toContain("Analytics cannot resolve a verified active Solo account.");
    expect(host.querySelectorAll(".anr-chart-stage")).toHaveLength(0);
    expect(button("Open PAIGE workspace")).toBeUndefined();
  });

  it("keeps range controls local and non-authoritative", () => {
    render();
    act(() => button("Current quarter")?.click());
    expect(button("Current quarter")?.getAttribute("aria-pressed")).toBe("true");
    expect(host.textContent).toContain("Current quarter");
    expect(host.textContent).toContain("Local preference · unissued");
  });
});
