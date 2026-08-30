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
  act(() => root.render(<div data-tenant-shell><MemoryRouter><Analytics2 accountContext={{ accountName, accountType }} openPaige={openPaige} /></MemoryRouter></div>));
}

function button(name: string) {
  return [...host.querySelectorAll("button")].find((item) => item.textContent?.includes(name)) as HTMLButtonElement | undefined;
}

describe("Solo Analytics truthful reading surface", () => {
  it("renders metric identities only as honest absence without totals, benchmarks, or recommendations", () => {
    render();
    expect(host.querySelector("h1")?.textContent).toBe("Analytics");
    expect(host.querySelector("[data-tenant-account-name]")?.textContent).toBe("Verified Solo Account");
    expect(host.querySelectorAll(".anr-metric")).toHaveLength(4);
    expect(host.textContent).toContain("No metric value issued");
    expect(host.textContent).toContain("No bounded source reference");
    expect(host.textContent).toContain("Not queried");
    expect(host.textContent).not.toContain("Approve");
    expect(host.textContent).not.toContain("You against comparable businesses");
    expect(host.textContent).not.toMatch(/\$[\d,.]+/);
  });

  it("opens a complete evidence drawer and restores focus on Escape", () => {
    render();
    const trigger = button("Open evidence and coverage")!;
    act(() => trigger.focus());
    act(() => trigger.click());
    const dialog = document.querySelector('[role="dialog"]');
    expect(dialog?.textContent).toContain("Metric identity");
    expect(dialog?.textContent).toContain("Definition");
    expect(dialog?.textContent).toContain("Formula / version");
    expect(dialog?.textContent).toContain("Exact requested range");
    expect(dialog?.textContent).toContain("Source references");
    expect(dialog?.textContent).toContain("Contributing records");
    expect(dialog?.textContent).toContain("Completeness / coverage");
    expect(dialog?.textContent).toContain("Exclusions");
    expect(dialog?.textContent).toContain("Freshness / queried at");
    expect(dialog?.textContent).toContain("Truth state");
    expect(host.querySelector("[data-tenant-shell]")?.getAttribute("aria-hidden")).toBe("true");
    expect((host.querySelector("[data-tenant-shell]") as HTMLElement).inert).toBe(true);
    expect(document.activeElement?.getAttribute("aria-label")).toBe("Close evidence");
    const first = document.activeElement as HTMLElement;
    const enabled = [...dialog!.querySelectorAll<HTMLButtonElement>("button:not([disabled])")];
    const last = enabled[enabled.length - 1];
    act(() => last.focus());
    act(() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab" })));
    expect(document.activeElement).toBe(first);
    act(() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", shiftKey: true })));
    expect(document.activeElement).toBe(last);
    act(() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })));
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(host.querySelector("[data-tenant-shell]")?.hasAttribute("aria-hidden")).toBe(false);
    expect((host.querySelector("[data-tenant-shell]") as HTMLElement).inert).toBe(false);
    expect(document.activeElement).toBe(trigger);
  });

  it("uses the one existing PAIGE launcher and keeps unsupported analysis actions disabled", () => {
    render();
    act(() => button("Open PAIGE workspace")?.click());
    expect(openPaige).toHaveBeenCalledTimes(1);
    expect(button("Ask PAIGE for a rundown")?.disabled).toBe(true);
    expect(button("Open analysis workspace")?.disabled).toBe(true);
    expect(host.textContent).toContain("No rundown, recommendation, approval, or action is prepared.");
  });

  it("fails closed when the active Solo account cannot be verified", () => {
    render("Your workspace", null);
    expect(host.textContent).toContain("Analytics cannot resolve a verified active Solo account.");
    expect(host.querySelectorAll(".anr-metric")).toHaveLength(0);
    expect(button("Open PAIGE workspace")).toBeUndefined();
  });

  it("keeps view and range preferences non-authoritative", () => {
    render();
    act(() => button("Current quarter")?.click());
    expect(button("Current quarter")?.getAttribute("aria-pressed")).toBe("true");
    expect(host.textContent).toContain("Current quarter · display preference only");
    expect(host.textContent).not.toContain("Pinned");
    expect(host.textContent).toContain("both are view-only");
  });
});
