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

// The workspace now carries the Rail "Recent activity" panel, which reads the deployed resolver
// through `useSoloActivityFeed`. Without this stub the real supabase client is constructed and a
// network call is attempted from a unit test — it degrades honestly rather than failing, but a
// test that reaches the network is nondeterministic. The panel's own five states are driven in
// `soloCommandCenterRailPanel.test.tsx`; here it is pinned quiet.
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc: () => Promise.resolve({ data: [], error: null }) },
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
  it("renders the five parts of the operating-readiness console", () => {
    render();

    const heading = host.querySelector("h1");
    expect(heading?.textContent).toBe("Systems Check");

    // The owner's five parts, all present and in order.
    for (const part of [
      "What needs you now",
      "What is ready to operate",
      "Your operating areas",
      "Recent activity",
      "Who does what next",
    ]) expect(host.textContent).toContain(part);

    // Counts are the RUN's own summary, never a tally this component computed and presented
    // as the check's result.
    expect(host.textContent).toContain("passed");
    expect(host.textContent).toContain("attention");

    // The radial and its generic exit were reassigned to Trust Compass by owner ruling.
    expect(host.querySelector('[data-operating-signal="true"]')).toBeNull();
    expect(host.querySelector(".sc-signal-map")).toBeNull();
    expect(host.textContent).not.toContain("Evidence moving through the business");
    expect(host.textContent).not.toContain("Open PAIGE for the fuller rundown");

    // No score, no percentage, no aggregate roll-up — ever.
    expect(host.textContent).not.toMatch(/\d+\s?%/);

    const css = readFileSync(resolve(process.cwd(), "src/solo/solo-systems-check-workspace.css"), "utf8");
    expect(css).toContain(".sc-heading h1{font:700 19px/1.2");
    expect(css).toContain("@media(prefers-reduced-motion:reduce)");
  });

  it("sorts findings into what needs the owner and what is already working", () => {
    render();

    // The filter chips are gone: the surface does the sorting rather than making the owner do it.
    const attention = host.querySelector(".sc-items")?.textContent ?? "";
    const ready = host.querySelector(".sc-ready")?.textContent ?? "";

    expect(attention).toContain("Payment connection needs attention");
    expect(attention).not.toContain("Client records are available");
    expect(ready).toContain("Client records are available");
    expect(ready).not.toContain("Payment connection needs attention");
  });

  it("falls back to the registry name for a check the area map does not carry", () => {
    render();
    // Neither fixture check_id is mapped, so an unmapped check must stay VISIBLE under its
    // registry name rather than disappearing from the surface.
    expect(host.textContent).toContain("Payment connection needs attention");
    expect(host.textContent).toContain("Client records are available");
  });

  it("treats resolved failed and unavailable findings as history, not active work", () => {
    harness.systems.mockReturnValue({
      ...baseSystems,
      findings: [{
        ...finding,
        resolved_at: "2026-08-27T18:00:00Z",
        resolution: "Payment connection restored.",
        resolution_action_id: "action-1",
      }, {
        ...finding,
        id: "finding-3",
        check_id: "archived_read_error",
        check_name: "Resolved system read",
        status: "error",
        resolved_at: "2026-08-27T18:10:00Z",
        resolution: "Read restored.",
      }],
      run: { ...baseSystems.run, check_count: 2, pass_count: 0, fail_count: 1 },
    });
    render();
    // Resolved work is history: it must not appear as something still needing the owner.
    expect(host.querySelector(".sc-items")).toBeNull();
    expect(host.textContent).toContain("Nothing from the last check needs you");

    act(() => button("Payment connection needs attention")?.click());
    expect(host.textContent).toContain("Payment connection restored.");
    expect(host.textContent).toContain("Action action-1");
    expect(host.textContent).toContain("No additional work is being recommended from this resolved record.");
    expect(button("Put PAIGE to work")).toBeUndefined();
  });

  it("keeps unresolved attention ahead of unavailable evidence after resolved history is excluded", () => {
    harness.systems.mockReturnValue({
      ...baseSystems,
      findings: [{
        ...finding,
        resolved_at: "2026-08-27T18:00:00Z",
        resolution: "Completed.",
      }, {
        ...finding,
        id: "finding-open-unavailable",
        check_id: "open_unavailable",
        check_name: "Open unavailable read",
        status: "error",
      }, {
        ...finding,
        id: "finding-open-attention",
        check_id: "open_attention",
        check_name: "Open attention item",
      }],
      run: { ...baseSystems.run, check_count: 3, pass_count: 0, fail_count: 2 },
    });
    render();
    // Severity first, then registry priority — the unresolved attention item leads.
    expect(host.querySelector(".sc-items .sc-item h3")?.textContent).toBe("Open attention item");
  });

  it("animates only the honest read state and does not manufacture category progress", () => {
    harness.systems.mockReturnValue({ ...baseSystems, scanPending: true });
    render();

    expect(host.querySelector(".sc-spin")).not.toBeNull();
    expect(host.textContent).toContain("Your first check is running");
    // A running check reports that it is running. It never reports how far along it is,
    // because nothing measures that.
    expect(host.textContent).not.toMatch(/\d+\s?%/);
  });

  it("combines only grounded operating signals and refreshes existing reads without claiming a rescan", () => {
    render();
    expect(host.textContent).toContain("Systems Check");
    expect(host.querySelector("[data-tenant-account-name]")?.textContent).toBe("First Sterling Capital");
    expect(host.querySelector("[data-tenant-account-tier]")?.textContent).toBe("Solo");
    expect(host.textContent).toContain("Active clients");
    expect(host.textContent).toContain("Live read from your own records");
    expect(host.textContent).toContain("Payment connection needs attention");
    // The Departments panel went with the radial: it listed names beside the words
    // "Status totals unavailable here", which is not information the owner can act on.
    expect(host.textContent).not.toContain("Open-work totals are not independently verified");
    expect(host.textContent).not.toContain("3 open");
    expect(host.textContent).toContain("Paige is holding these for you");
    expect(host.textContent).not.toContain("Rescan");
    expect(host.textContent).not.toMatch(/\d+%/);

    act(() => button("Refresh current data")?.click());
    expect(refreshCommand).toHaveBeenCalledTimes(1);
    expect(refreshSystems).toHaveBeenCalledTimes(1);
  });

  it("contains finding detail in a restorable drawer/full-panel flow", () => {
    render();
    const trigger = button("What was checked")!;
    act(() => trigger.focus());
    act(() => trigger.click());
    expect(host.querySelector('[role="dialog"]')?.getAttribute("aria-label")).toBe("Finding details");
    expect(host.textContent).toContain("Stripe");
    expect(host.textContent).toContain("Evidence and provenance");
    expect(host.textContent).toContain("Persisted finding finding-1 from Systems Check run run-1");
    expect(host.textContent).toContain("Recommended next step");
    expect(host.textContent).toContain("No owner decision is recorded");
    expect(host.textContent).toContain("No durable outcome is recorded on the tenant rail");
    act(() => button("Expand")?.click());
    expect(host.querySelector('[role="dialog"]')?.getAttribute("aria-label")).toBe("Expanded finding details");
    act(() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })));
    expect(host.querySelector('[role="dialog"]')).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it("keeps Ask First explicitly PARTIAL and only opens the existing PAIGE workspace", () => {
    render();
    act(() => button("What was checked")?.click());
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
    expect(host.textContent).toContain("The last check could not be read");
    expect(host.textContent).toContain("Nothing below is being reported as healthy");
    act(() => button("Refresh current data")?.click());
    expect(refreshSystems).toHaveBeenCalledTimes(1);
  });

  it("uses no-run wording when no persisted Systems Check exists", () => {
    harness.systems.mockReturnValue({ ...baseSystems, run: null, findings: [] });
    render();
    expect(host.textContent).toContain("No check has finished yet");
    expect(host.textContent).toContain("Nothing has been checked yet");
    // An absent check is never a claim that anything is wrong.
    expect(host.textContent).toContain("not a claim that anything is wrong");
  });

  it.each([0, 2])("never infers all-clear from an empty persisted run with check_count=%s", (checkCount) => {
    harness.systems.mockReturnValue({
      ...baseSystems,
      run: { ...baseSystems.run, check_count: checkCount, pass_count: 0, fail_count: 0 },
      findings: [],
    });
    render();
    expect(host.textContent).toContain("The picture is incomplete");
    expect(host.textContent).toContain("Overall health cannot be inferred");
    expect(host.textContent).not.toContain("All available checks are clear");
  });

  it("never infers clear coverage from an unfinished persisted run", () => {
    harness.systems.mockReturnValue({
      ...baseSystems,
      run: { ...baseSystems.run, completed_at: null },
    });
    render();
    expect(host.textContent).toContain("The picture is incomplete");
    expect(host.textContent).toContain("Overall health cannot be inferred");
    expect(host.textContent).not.toContain("Available checks are clear");
  });

  it("shows owner-facing remediation content instead of an internal drafting brief", () => {
    harness.systems.mockReturnValue({
      ...baseSystems,
      findings: [{
        ...finding,
        paige_drafted_fix: {
          brief: "Internal instruction that must not be presented.",
          content: "Reconnect the approved payment provider, then refresh this evidence.",
          model: "internal-model-name",
        },
      }],
      run: { ...baseSystems.run, check_count: 1, pass_count: 0, fail_count: 1 },
    });
    render();
    act(() => button("What was checked")?.click());
    expect(host.textContent).toContain("Reconnect the approved payment provider, then refresh this evidence.");
    expect(host.textContent).not.toContain("Internal instruction that must not be presented.");
    expect(host.textContent).not.toContain("internal-model-name");
  });

  it("projects only presentation-safe evidence fields and never dumps arbitrary payloads", () => {
    harness.systems.mockReturnValue({
      ...baseSystems,
      findings: [{
        ...finding,
        evidence: {
          provider: "Stripe",
          state: "disconnected",
          authorization: "Bearer owner-secret",
          api_key: "sk_live_secret",
          token_details: { access_token: "nested-secret" },
          error_message: "raw internal runner exception",
        },
      }],
      run: { ...baseSystems.run, check_count: 1, pass_count: 0, fail_count: 1 },
    });
    render();
    act(() => button("What was checked")?.click());
    expect(host.textContent).toContain("Provider");
    expect(host.textContent).toContain("Stripe");
    expect(host.textContent).toContain("Additional evidence is retained but not displayed here.");
    expect(host.textContent).not.toContain("owner-secret");
    expect(host.textContent).not.toContain("sk_live_secret");
    expect(host.textContent).not.toContain("nested-secret");
    expect(host.textContent).not.toContain("raw internal runner exception");
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
    expect(host.textContent).toContain("Active clients");
    expect(host.textContent).toContain("this may not be today's number");
    expect(host.textContent).not.toContain("Live read from your own records");
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

