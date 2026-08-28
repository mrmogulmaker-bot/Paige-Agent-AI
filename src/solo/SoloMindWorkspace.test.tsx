import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => ({ knowledge: vi.fn(), systems: vi.fn(), command: vi.fn() }));
const approvalHook = vi.hoisted(() => {
  const pending: Array<{ tenant: string | null; resolve: (value: { data: unknown[]; error: null }) => void }> = [];
  const state = { tenant: "tenant-a" as string | null };
  const from = vi.fn(() => {
    let tenant: string | null = null;
    const builder: Record<string, unknown> = {};
    builder.select = () => builder;
    builder.eq = (field: string, value: string) => { if (field === "tenant_id") tenant = value; return builder; };
    builder.order = () => builder;
    builder.limit = () => builder;
    builder.then = (resolve: (value: { data: unknown[]; error: null }) => void) => { pending.push({ tenant, resolve }); };
    return builder;
  });
  return { pending, state, from };
});
vi.mock("./data/useSoloKnowledge", () => ({ useSoloKnowledge: () => harness.knowledge() }));
vi.mock("@/hooks/useSystemsCheck", () => ({ useSystemsCheck: () => harness.systems() }));
vi.mock("./data/useCommandCenter", () => ({ useCommandCenter: () => harness.command() }));
vi.mock("@/hooks/useTenantContext", () => ({ useTenantContext: () => ({ activeTenantId: approvalHook.state.tenant }) }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: approvalHook.from,
    auth: { getUser: vi.fn(async () => ({ data: { user: null } })) },
    channel: vi.fn(() => ({ on() { return this; }, subscribe() { return this; } })),
    removeChannel: vi.fn(),
  },
}));

import { SoloMindWorkspace } from "./SoloMindWorkspace";
import { usePendingApprovals } from "@/hooks/usePendingApprovals";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const refreshKnowledge = vi.fn();
const refreshSystems = vi.fn();
const refreshCommand = vi.fn();
const openPaige = vi.fn();

const knowledge = {
  loading: false, error: null, documentsIndexed: 2, empty: false, refresh: refreshKnowledge,
  recentlyLearned: [],
  docs: [
    { id: "doc-1", title: "Reseller agreement", summary: "Clause 7", domain: "Legal", tags: ["margin"], source: "Drive", chunkCount: 4, createdAt: "2026-08-27T12:00:00Z", when: "1d ago", color: "#8A72F5" },
    { id: "doc-2", title: "Brand voice", summary: null, domain: "Brand", tags: [], source: null, chunkCount: 2, createdAt: "2026-08-26T12:00:00Z", when: "2d ago", color: "#8A72F5" },
  ],
};

const finding = {
  id: "finding-1", run_id: "run-1", check_id: "domain", status: "fail", severity_at_finding: "high",
  evidence: { state: "stale" }, paige_interpretation: "Evidence needs attention.", paige_drafted_fix: null,
  department_id: "operations", resolved_at: null, resolution: null, resolution_action_id: null,
  created_at: "2026-08-27T13:00:00Z", check_name: "Domain health", domain: "systems", priority: 1,
};

const systems = {
  run: { id: "run-1", started_at: "2026-08-27T12:59:00Z", completed_at: "2026-08-27T13:00:00Z", check_count: 1, pass_count: 0, fail_count: 1 },
  findings: [finding], loading: false, isError: false, scanPending: false, refresh: refreshSystems,
};

const command = {
  accountEpoch: "tenant-a", approvals: [{ id: "approval-1", dept: "Finance", title: "Approve reminder", preview: "Review only", type: "Email draft", urgency: "today", aging: "2h" }],
  metrics: [], attention: {}, departments: [], greeting: { name: "Toni", dateLabel: "Today", summary: "1 draft waiting." }, counts: { approvals: 1 },
  loading: false, isError: false, departmentsConfigured: true, empty: false, approve: vi.fn(), decline: vi.fn(), refresh: refreshCommand,
};

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.clearAllMocks();
  harness.knowledge.mockReturnValue(knowledge);
  harness.systems.mockReturnValue(systems);
  harness.command.mockReturnValue(command);
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

function render() {
  act(() => root.render(<SoloMindWorkspace accountContext={{ accountName: "First Sterling Capital", accountType: "standalone" }} openPaige={openPaige} />));
}

function button(name: string) {
  return [...host.querySelectorAll("button")].find((item) => item.textContent?.includes(name)) as HTMLButtonElement | undefined;
}

describe("Solo Mind workspace", () => {
  it("renders only grounded records with explicit truth boundaries", () => {
    render();
    expect(host.textContent).toContain("First Sterling Capital");
    expect(host.textContent).toContain("Reseller agreement");
    expect(host.textContent).toContain("Domain health");
    expect(host.textContent).toContain("Approve reminder");
    expect(host.textContent).toContain("LIVE SOURCE");
    expect(host.textContent).toContain("PARTIAL");
    expect(host.textContent).toContain("UNAVAILABLE");
    expect(host.textContent).not.toMatch(/70,880|48,120|12,406/);
    expect(host.textContent).not.toContain("chain-of-thought");
  });

  it("keeps the topology still and offers equivalent native record controls", () => {
    render();
    const canvas = host.querySelector("canvas");
    expect(canvas?.getAttribute("aria-roledescription")).toBe("interactive 3D topology viewer");
    expect(canvas?.getAttribute("tabindex")).toBe("0");
    expect(host.querySelectorAll("[data-mind-record]")).toHaveLength(4);
    expect(host.textContent).toContain("still unless a real source change is observed");
    expect(host.textContent).not.toContain("Replay event");
  });

  it("treats initial hydration as a baseline and animates only a later grounded addition", () => {
    harness.knowledge.mockReturnValue({ ...knowledge, loading: true, docs: [] });
    render();
    expect(host.textContent).toContain("Resolving this account's Mind");
    act(() => root.unmount());
    root = createRoot(host);
    harness.knowledge.mockReturnValue(knowledge);
    act(() => root.render(<SoloMindWorkspace accountContext={{ accountName: "First Sterling Capital" }} />));
    expect(host.textContent).toContain("MOTION IDLE");

    const added = { ...knowledge, docs: [...knowledge.docs, { ...knowledge.docs[0], id: "doc-3", title: "New grounded note" }] };
    harness.knowledge.mockReturnValue(added);
    act(() => root.render(<SoloMindWorkspace accountContext={{ accountName: "First Sterling Capital" }} />));
    expect(host.textContent).toContain("LIVE SOURCE · KNOWLEDGE");
    expect(host.textContent).toContain("New grounded note was newly observed");
    act(() => button("Pause")?.click());
    expect(host.textContent).toContain("PAUSED · KNOWLEDGE");
    act(() => button("Resume")?.click());
    expect(host.textContent).toContain("LIVE SOURCE · KNOWLEDGE");
  });

  it("refreshes reads without claiming a scan or manufacturing activity", () => {
    render();
    act(() => button("Refresh records")?.click());
    expect(refreshKnowledge).toHaveBeenCalledTimes(1);
    expect(refreshSystems).toHaveBeenCalledTimes(1);
    expect(refreshCommand).toHaveBeenCalledTimes(1);
    expect(host.textContent).not.toContain("Rescan");
  });

  it("moves focus into the inspector, contains expanded focus, and restores focus on Escape", async () => {
    render();
    const trigger = button("Reseller agreement")!;
    act(() => trigger.focus());
    act(() => trigger.click());
    expect(host.querySelector('[role="dialog"]')?.getAttribute("aria-label")).toBe("Mind record details");
    await act(async () => { await new Promise<void>((resolve) => requestAnimationFrame(() => resolve())); });
    expect(document.activeElement?.getAttribute("aria-label")).toBe("Close Mind record details");
    expect(host.textContent).toContain("Drive");
    act(() => host.querySelector<HTMLButtonElement>('button[aria-label="Expand record drawer"]')?.click());
    expect(host.querySelector('[role="dialog"]')?.getAttribute("aria-modal")).toBe("true");
    expect(host.querySelector(".mind-scroll-owner")?.hasAttribute("inert")).toBe(true);
    const first = host.querySelector<HTMLButtonElement>('button[aria-label="Restore record drawer"]')!;
    const last = [...host.querySelectorAll<HTMLButtonElement>('[role="dialog"] button')].at(-1)!;
    act(() => last.focus());
    act(() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab" })));
    expect(document.activeElement).toBe(first);
    act(() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })));
    expect(host.querySelector('[role="dialog"]')).toBeNull();
    await act(async () => { await new Promise<void>((resolve) => requestAnimationFrame(() => resolve())); });
    expect(document.activeElement).toBe(trigger);
  });

  it("opens only the existing PAIGE workspace and makes the partial boundary explicit", () => {
    render();
    act(() => button("Open PAIGE")?.click());
    expect(openPaige).toHaveBeenCalledTimes(1);
    expect(host.textContent).toContain("No Mind context was attached or prepared");
  });

  it("hands focus to the durable PAIGE command when opening from record detail", async () => {
    const commandButton = document.createElement("button");
    commandButton.setAttribute("data-tenant-paige-command", "");
    document.body.appendChild(commandButton);
    render();
    act(() => button("Reseller agreement")?.click());
    await act(async () => { await new Promise<void>((resolve) => requestAnimationFrame(() => resolve())); });
    act(() => button("Open PAIGE · PARTIAL")?.click());
    await act(async () => { await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))); });
    expect(openPaige).toHaveBeenCalledTimes(1);
    expect(document.activeElement).toBe(commandButton);
    commandButton.remove();
  });

  it("interrupts causal motion when filtering would hide the active category", () => {
    render();
    harness.knowledge.mockReturnValue({ ...knowledge, docs: [...knowledge.docs, { ...knowledge.docs[0], id: "doc-new", title: "New source" }] });
    act(() => root.render(<SoloMindWorkspace accountContext={{ accountName: "First Sterling Capital" }} />));
    expect(host.textContent).toContain("LIVE SOURCE · KNOWLEDGE");
    act(() => button("Skills")?.click());
    expect(host.textContent).toContain("MOTION IDLE");
    expect(host.textContent).toContain("Source-change motion interrupted. Skills filter selected.");
  });

  it("renders honest loading, empty, partial and failure states", () => {
    harness.knowledge.mockReturnValue({ ...knowledge, loading: true, docs: [] });
    render();
    expect(host.textContent).toContain("Resolving this account's Mind");
    act(() => root.unmount());
    root = createRoot(host);
    harness.knowledge.mockReturnValue({ ...knowledge, loading: false, error: "Denied", docs: [] });
    harness.systems.mockReturnValue({ ...systems, isError: true, findings: [], run: null });
    act(() => root.render(<SoloMindWorkspace accountContext={{ accountName: "First Sterling Capital", accountType: "standalone" }} openPaige={openPaige} />));
    expect(host.textContent).toContain("Mind has partial coverage");
    expect(host.textContent).toContain("No missing source is treated as empty");
  });

  it("contains responsive, reduced-motion, forced-colors and shell safe-area contracts", () => {
    const css = readFileSync(resolve(process.cwd(), "src/solo/solo-mind-workspace.css"), "utf8");
    const source = readFileSync(resolve(process.cwd(), "src/solo/SoloMindWorkspace.tsx"), "utf8");
    expect(css).toContain("container:solo-mind / inline-size");
    expect(css).toContain("@container solo-mind (max-width:780px)");
    expect(css).toContain('@media(min-width:761px) and (max-width:1080px)');
    expect(css).toContain('[data-tenant-shell][data-paige="open"] #tenant-shell-main .mind-workspace');
    expect(css).toContain('[data-pg="light"] .mind-workspace');
    expect(css).toContain("--mind-texture-alpha:.58");
    expect(css).toContain("--mind-edge:rgba(54,47,67,.48)");
    expect(css).toContain("grid-template-columns:repeat(6,minmax(0,1fr))");
    expect(css).toContain("@container solo-mind (max-width:900px)");
    expect(css).toContain("overflow-x:hidden");
    expect(source).toContain("getComputedStyle(canvas)");
    expect(source).toContain('getPropertyValue(`--mind-${item.key}`)');
    expect(source).toContain("context.fillText(label");
    expect(css).toContain("@media(prefers-reduced-motion:reduce)");
    expect(css).toContain("@media(forced-colors:active)");
  });

  it("masks prior-account approvals synchronously and rejects their late response", async () => {
    const snapshots: Array<{ tenant: string | null; ids: string; loading: boolean }> = [];
    function Probe() {
      const state = usePendingApprovals();
      snapshots.push({ tenant: approvalHook.state.tenant, ids: state.items.map((item) => item.id).join(","), loading: state.loading });
      return <><output data-approval-ids>{state.items.map((item) => item.id).join(",")}</output><output data-approval-loading>{String(state.loading)}</output><button type="button" onClick={state.refresh}>Refresh approvals</button></>;
    }
    approvalHook.pending.splice(0);
    approvalHook.state.tenant = "tenant-a";
    const approvalHost = document.createElement("div");
    document.body.appendChild(approvalHost);
    const approvalRoot = createRoot(approvalHost);
    await act(async () => { approvalRoot.render(<Probe />); await Promise.resolve(); });
    const firstA = approvalHook.pending.shift()!;
    expect(firstA.tenant).toBe("tenant-a");
    await act(async () => firstA.resolve({ data: [{ id: "approval-a" }], error: null }));
    expect(approvalHost.querySelector("[data-approval-ids]")?.textContent).toBe("approval-a");
    await act(async () => approvalHost.querySelector<HTMLButtonElement>("button")?.click());
    const lateA = approvalHook.pending.shift()!;

    approvalHook.state.tenant = "tenant-b";
    await act(async () => approvalRoot.render(<Probe />));
    expect(snapshots.filter((item) => item.tenant === "tenant-b").every((item) => item.ids === "")).toBe(true);
    expect(approvalHost.querySelector("[data-approval-ids]")?.textContent).toBe("");
    expect(approvalHost.querySelector("[data-approval-loading]")?.textContent).toBe("true");
    await act(async () => lateA.resolve({ data: [{ id: "late-approval-a" }], error: null }));
    expect(approvalHost.querySelector("[data-approval-ids]")?.textContent).toBe("");
    await act(async () => approvalRoot.unmount());
    approvalHost.remove();
    approvalHook.state.tenant = "tenant-a";
  });
});

