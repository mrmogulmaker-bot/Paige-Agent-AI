import React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => ({
  command: vi.fn(),
  systems: vi.fn(),
}));

vi.mock("./data/useCommandCenter", () => ({ useCommandCenter: () => harness.command() }));
vi.mock("@/hooks/useSystemsCheck", () => ({ useSystemsCheck: () => harness.systems() }));

import { SoloSystemsCheckWorkspace } from "./SoloSystemsCheckWorkspace";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const refreshCommand = vi.fn();
const refreshSystems = vi.fn();
const openPaige = vi.fn();

const baseCommand = {
  approvals: [{
    id: "approval-1", dept: "Finance", title: "Approve payment reminder",
    preview: "Review the reminder before it is sent.", type: "Email draft", urgency: "today", aging: "2h",
  }],
  metrics: [{ k: "Active clients", v: "12" }, { k: "Pipeline value", v: "$48,000" }],
  attention: { at_risk_clients: 1, follow_ups_due: 2 },
  departments: [{
    slug: "operations", name: "Operations", displayOrder: 1, openCount: 3,
    workingCount: 1, awaitingCount: 1, lastActivityAt: "2026-08-27T18:00:00Z",
  }],
  greeting: { name: "Toni", dateLabel: "Thursday, August 27", summary: "1 draft waiting." },
  counts: { approvals: 1 }, loading: false, empty: false, isError: false, departmentsConfigured: true,
  approve: vi.fn().mockResolvedValue({ ok: true }), decline: vi.fn().mockResolvedValue({ ok: true }), refresh: refreshCommand,
};

const finding = {
  id: "finding-1", run_id: "run-1", check_id: "payments_connection", status: "fail",
  severity_at_finding: "blocking", evidence: { provider: "Stripe", state: "disconnected" },
  paige_interpretation: "Payments cannot be verified while the connection is unavailable.",
  paige_drafted_fix: null, department_id: "finance", resolved_at: null, resolution: null,
  resolution_action_id: null, created_at: "2026-08-27T17:00:00Z",
  check_name: "Payment connection needs attention", domain: "payments", priority: 1,
};

const baseSystems = {
  run: { id: "run-1", started_at: "2026-08-27T16:59:00Z", completed_at: "2026-08-27T17:00:00Z", check_count: 2, pass_count: 1, fail_count: 1 },
  findings: [finding, { ...finding, id: "finding-2", check_id: "client_records", check_name: "Client records are available", domain: "data", status: "pass", severity_at_finding: "low" }],
  loading: false, isError: false, scanPending: false, refresh: refreshSystems,
};

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.clearAllMocks();
  harness.command.mockReturnValue(baseCommand);
  harness.systems.mockReturnValue(baseSystems);
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

function render() {
  act(() => root.render(<SoloSystemsCheckWorkspace accountContext={{ accountName: "First Sterling Capital", accountType: "standalone" }} openPaige={openPaige} />));
}

function button(name: string) {
  return [...host.querySelectorAll("button")].find((item) => item.textContent?.includes(name)) as HTMLButtonElement | undefined;
}

describe("Solo Systems Check workspace", () => {
  it("combines only grounded operating signals and refreshes existing reads without claiming a rescan", () => {
    render();
    expect(host.textContent).toContain("Systems Check");
    expect(host.querySelector("[data-tenant-account-name]")?.textContent).toBe("First Sterling Capital");
    expect(host.querySelector("[data-tenant-account-tier]")?.textContent).toBe("Solo");
    expect(host.textContent).toContain("Active clients");
    expect(host.textContent).toContain("Payment connection needs attention");
    expect(host.textContent).toContain("Operations");
    expect(host.textContent).toContain("Open-work totals are not independently verified");
    expect(host.textContent).not.toContain("3 open");
    expect(host.textContent).toContain("Waiting on you");
    expect(host.textContent).not.toContain("Rescan");
    expect(host.textContent).not.toMatch(/\d+%/);

    act(() => button("Refresh current data")?.click());
    expect(refreshCommand).toHaveBeenCalledTimes(1);
    expect(refreshSystems).toHaveBeenCalledTimes(1);
  });

  it("filters by grounded domains and contains finding detail in a restorable drawer/full-panel flow", () => {
    render();
    const trigger = button("Payment connection needs attention")!;
    act(() => trigger.focus());
    act(() => trigger.click());
    expect(host.querySelector('[role="dialog"]')?.getAttribute("aria-label")).toBe("Finding details");
    expect(host.textContent).toContain("Stripe");
    act(() => button("Expand")?.click());
    expect(host.querySelector('[role="dialog"]')?.getAttribute("aria-label")).toBe("Expanded finding details");
    act(() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })));
    expect(host.querySelector('[role="dialog"]')).toBeNull();
    expect(document.activeElement).toBe(trigger);

    act(() => button("Payments")?.click());
    expect(host.textContent).not.toContain("Client records are available");
  });

  it("keeps Ask First explicitly PARTIAL and only opens the existing PAIGE workspace", () => {
    render();
    act(() => button("Payment connection needs attention")?.click());
    act(() => button("Put PAIGE to work")?.click());
    const drawer = host.querySelector<HTMLElement>(".sc-drawer");
    expect(drawer?.getAttribute("aria-hidden")).toBe("true");
    expect(drawer?.inert).toBe(true);
    expect(host.textContent).toContain("PARTIAL");
    expect(host.textContent).toContain("Context has not been attached or prepared");
    expect(host.textContent).toContain("no work has started");
    expect(openPaige).not.toHaveBeenCalled();
    act(() => button("Open PAIGE workspace")?.click());
    expect(openPaige).toHaveBeenCalledTimes(1);
  });

  it("renders honest loading, unavailable, failure and retry states", () => {
    harness.systems.mockReturnValue({ ...baseSystems, run: null, findings: [], isError: true });
    render();
    expect(host.textContent).toContain("Systems Check is unavailable");
    act(() => button("Retry current data")?.click());
    expect(refreshSystems).toHaveBeenCalledTimes(1);
  });

  it.each([0, 2])("never infers all-clear from an empty persisted run with check_count=%s", (checkCount) => {
    harness.systems.mockReturnValue({
      ...baseSystems,
      run: { ...baseSystems.run, check_count: checkCount, pass_count: 0, fail_count: 0 },
      findings: [],
    });
    render();
    expect(host.textContent).toContain("Coverage is incomplete");
    expect(host.textContent).toContain("Overall health cannot be inferred");
    expect(host.textContent).not.toContain("All available checks are clear");
  });

  it("labels failed operating reads unavailable instead of claiming the owner is caught up", () => {
    harness.command.mockReturnValue({
      ...baseCommand,
      metrics: [], attention: undefined, isError: true,
      greeting: { ...baseCommand.greeting, summary: "You're all caught up." },
    });
    render();
    expect(host.textContent).toContain("OPERATING DATA UNAVAILABLE");
    expect(host.textContent).toContain("Some business operating sources could not be read");
    expect(host.textContent).not.toContain("You're all caught up");
    act(() => button("Refresh current data")?.click());
    expect(refreshCommand).toHaveBeenCalledTimes(1);
  });

  it("labels retained metrics as last available when the current operating read fails", () => {
    harness.command.mockReturnValue({ ...baseCommand, isError: true });
    render();
    expect(host.textContent).toContain("LAST AVAILABLE · PARTIAL");
    expect(host.textContent).not.toContain("LIVE READ");
  });

  it("reviews a governed approval once, disables repeat activation, and announces success", async () => {
    let resolveApproval!: (value: { ok: boolean }) => void;
    const pending = new Promise<{ ok: boolean }>((resolve) => { resolveApproval = resolve; });
    baseCommand.approve.mockReturnValueOnce(pending);
    render();
    const trigger = button("Review approval")!;
    act(() => trigger.click());
    expect(host.textContent).toContain("Review the reminder before it is sent.");
    const confirm = button("Confirm approval")!;
    act(() => { confirm.click(); confirm.click(); });
    expect(baseCommand.approve).toHaveBeenCalledTimes(1);
    expect(confirm.disabled).toBe(true);
    await act(async () => { resolveApproval({ ok: true }); await pending; });
    expect(host.querySelector('[aria-labelledby="decision-title"]')).toBeNull();
    expect(host.textContent).toContain("Approve payment reminder was approved.");
    expect(document.activeElement).toBe(trigger);
  });

  it("keeps failed decisions open and announces the returned error", async () => {
    baseCommand.decline.mockResolvedValueOnce({ ok: false, error: "The decision was rejected by policy." });
    render();
    act(() => button("Review dismissal")?.click());
    await act(async () => { button("Confirm dismissal")?.click(); await Promise.resolve(); });
    expect(host.querySelector('[aria-labelledby="decision-title"]')).not.toBeNull();
    expect(host.textContent).toContain("The decision was rejected by policy.");
    expect(button("Confirm dismissal")?.disabled).toBe(false);
  });

  it("uses center-container breakpoints and only established theme tokens", () => {
    const css = readFileSync(resolve(process.cwd(), "src/solo/solo-systems-check-workspace.css"), "utf8");
    expect(css).toContain("container:solo-systems-check / inline-size");
    expect(css).toContain("@container solo-systems-check (max-width:780px)");
    expect(css).toContain('[data-tenant-shell][data-paige="open"] #tenant-shell-main .sc-workspace,[data-tenant-shell][data-paige="open"] #tenant-shell-main nav[aria-label="Command Center sections"]{width:calc(100% - min(410px,calc(100vw - var(--tcs-rail))))}');
    expect(css).toContain('@media(min-width:761px) and (max-width:940px){[data-tenant-shell][data-nav="expanded"][data-paige="open"] #tenant-shell-main nav[aria-label="Command Center sections"]');
    expect(css).toContain('nav[aria-label="Command Center sections"] button{gap:0!important;padding-inline:6px!important;font-size:0!important;border-radius:6px}');
    expect(css).toContain('nav[aria-label="Command Center sections"] button:hover{background:var(--pg-canvas)!important;color:var(--pg-ink)!important;box-shadow:inset 0 0 0 1px var(--pg-line)}');
    expect(css).toContain('nav[aria-label="Command Center sections"] button[aria-current="page"]{border-bottom:3px solid Highlight!important}');
    expect(css).not.toMatch(/--pg-(?:bg|card|shadow-sm|shadow-lg)\b/);
    expect(css).toContain("--sc-paige:var(--pg-violet)");
    expect(css).toContain("--sc-critical:var(--pg-negative)");
  });
});

