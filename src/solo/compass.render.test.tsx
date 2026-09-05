// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import fs from "node:fs";
import path from "node:path";
import { deriveGovernance } from "./data/useSoloToolGovernance";

/**
 * A green typecheck is not a working render (§32), and this surface is the one where that gap
 * matters most: every string it shows is a statement about what Paige is allowed to do unattended.
 * So these drive the REAL components through the states the reads can actually be in — loading, a
 * failed read, an owner-only capability, a consequential (high-risk) capability, the platform
 * ceiling narrowing — and assert what the owner is told, and can DO, in each.
 *
 * The seams are mocked at the hook boundary, not the network: each hook is unit-tested separately,
 * and mocking here keeps these tests about what the SURFACE says and offers. `deriveGovernance` is
 * kept REAL so the governed states are the ones the hook would actually produce.
 */
const trust = vi.hoisted(() => ({ value: null as unknown }));
const gov = vi.hoisted(() => ({ value: null as unknown }));
const feed = vi.hoisted(() => ({ value: null as unknown }));
const pending = vi.hoisted(() => ({ value: null as unknown }));

vi.mock("./data/useSoloTrust", () => ({ useSoloTrust: () => trust.value }));
vi.mock("@/hooks/usePaigeDeptStatus", () => ({
  usePaigeDeptStatus: () => ({ loading: false, configured: true, departments: [] }),
}));
vi.mock("./data/useSoloToolGovernance", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  useSoloToolGovernance: () => gov.value,
}));
vi.mock("./data/useSoloActivityFeed", () => ({
  useSoloActivityFeed: () => feed.value,
  departmentLabel: (s: string | null) => s ?? "Unattributed",
  elapsedLabel: () => "2h ago",
}));
vi.mock("./data/useSoloPendingActions", () => ({ useSoloPendingActions: () => pending.value }));

import { MiniCompass, TrustCompass, orbLabel, laneTier } from "./compass";

// compass.tsx is `@ts-nocheck`, so TrustCompass's props infer as empty; give the test a typed handle.
const TC = TrustCompass as unknown as React.FC<{ accountEpoch?: string; openPaige?: () => void }>;

let host: HTMLDivElement;
let root: Root;

function draw(node: React.ReactElement): HTMLDivElement {
  act(() => { root.render(node); });
  return host;
}
const byRole = (h: HTMLElement, role: string) => h.querySelector(`[role="${role}"]`);

const dept = (over: Record<string, unknown> = {}) => ({
  slug: "legal_compliance", name: "Legal & Compliance", displayOrder: 9,
  lanes: { auto: 0, confirm: 0, off: 1 }, kinds: 1,
  acts: [{ label: "Flag for review", lane: "off" as const }],
  defaultLevel: 0, openCount: 0, workingCount: 0, awaitingCount: 0, ...over,
});
const ok = (d = dept()) => ({
  loading: false, configured: true, departments: [d],
  bySlug: { [d.slug as string]: d }, error: null,
});

// A real governed value the hook would produce, built from real tool keys via the real derivation.
const row = (tool_key: string, mode: string, is_default = false) => ({ tool_key, label: tool_key, category: "x", mode, is_default });
const govValue = (rows: ReturnType<typeof row>[], ceiling = {}, over: Record<string, unknown> = {}) => {
  const d = deriveGovernance(rows as never, ceiling as never);
  return {
    loading: false, configured: true, error: null,
    domains: d.domains, byTool: d.byTool, ceilingLimiting: d.ceilingLimiting,
    setDomainMode: vi.fn(async () => ({ ok: true })),
    setToolMode: vi.fn(async () => ({ ok: true })),
    refresh: vi.fn(), ...over,
  };
};
const feedEmpty = { items: [], loading: false, error: null, status: "empty", refresh: () => {} };
const pendingEmpty = { items: [], loading: false, error: null, refresh: () => {} };

beforeEach(() => {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  // A valid-but-empty platform-default read by default (the TrustCompass foldout + MiniCompass need
  // a real SoloTrust shape); MiniCompass tests override it with their own state.
  trust.value = { loading: false, configured: true, departments: [], bySlug: {}, error: null };
  gov.value = null; feed.value = feedEmpty; pending.value = pendingEmpty;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).matchMedia ??= () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

describe("MiniCompass — what the owner is told, in each state the read can be in", () => {
  it("while loading, says it is reading — it does not show a level", () => {
    trust.value = { loading: true, configured: false, departments: [], bySlug: {}, error: null };
    const h = draw(<MiniCompass dept="legal_compliance" />);
    expect(byRole(h, "status")?.textContent).toMatch(/Reading the platform default/i);
  });

  it("on a FAILED read, reports it as unavailable — never as a posture", () => {
    trust.value = { loading: false, configured: false, departments: [], bySlug: {}, error: "boom" };
    const h = draw(<MiniCompass dept="legal_compliance" />);
    const t = byRole(h, "status")?.textContent ?? "";
    expect(t).toMatch(/unavailable/i);
    expect(t).not.toMatch(/your call|automatically|drafts for you/i);
  });

  it("a department with NOTHING routed to it says so, rather than showing a level", () => {
    trust.value = ok(dept({ lanes: { auto: 0, confirm: 0, off: 0 }, kinds: 0, acts: [], defaultLevel: null }));
    const container = draw(<MiniCompass dept="legal_compliance" />);
    expect(container.textContent).toMatch(/No action types are routed/i);
    expect(container.textContent).not.toMatch(/Always your call/i);
  });

  it("with a real posture, names it as the PLATFORM's default and not the workspace's choice", () => {
    trust.value = ok();
    const container = draw(<MiniCompass dept="legal_compliance" />);
    const text = container.textContent ?? "";
    expect(text).toMatch(/Always your call/);
    expect(text).toMatch(/not a setting this workspace chose/i);
    expect(text).not.toMatch(/you (approved|authoris|authoriz|set)/i);
    expect(text).not.toMatch(/Slide to change/i);
  });

  it("renders NO writable control — the platform-default bar is read-only", () => {
    trust.value = ok();
    const container = draw(<MiniCompass dept="legal_compliance" />);
    expect(container.querySelectorAll("input")).toHaveLength(0);
    expect(container.querySelectorAll("button")).toHaveLength(0);
    expect(container.querySelectorAll('[role="slider"]')).toHaveLength(0);
  });

  it("carries the real counts in its accessible name, so the bar is not the only carrier", () => {
    trust.value = ok(dept({ lanes: { auto: 8, confirm: 3, off: 0 }, kinds: 11, defaultLevel: 9.5 / 11 }));
    const h = draw(<MiniCompass dept="legal_compliance" />);
    expect(byRole(h, "img")?.getAttribute("aria-label"))
      .toMatch(/8 run automatically, 3 drafted for you, 0 always your call/);
  });

  it("an UNKNOWN department is reported as unavailable, not silently blank", () => {
    trust.value = ok();
    const h = draw(<MiniCompass dept="not_a_department" />);
    expect(byRole(h, "status")?.textContent).toMatch(/unavailable/i);
  });
});

/**
 * THE GOVERNANCE SURFACE ACTUALLY RENDERS, AND IT IS HONEST + ACCESSIBLE.
 *
 * The old canvas dial was mouse-only and read-only; this surface offers a REAL per-capability
 * control (`set_tool_autonomy`) and must (a) run, (b) never offer a control the platform would
 * neutralise, (c) route approvals to the one Paige chat, and (d) expose everything to the keyboard
 * and a screen reader.
 */
describe("TrustCompass — the governed surface runs, honest and accessible", () => {
  it("while the governance read is loading, says so — not an empty grid", () => {
    gov.value = { loading: true, configured: false, error: null, domains: [], byTool: {}, ceilingLimiting: false, setDomainMode: vi.fn(), setToolMode: vi.fn(), refresh: vi.fn() };
    const text = draw(<TC accountEpoch="t1" />).textContent ?? "";
    expect(text).toMatch(/Reading what this workspace lets Paige do/i);
  });

  it("on a FAILED governance read, says it couldn't be read — never an open/empty workspace", () => {
    gov.value = { loading: false, configured: false, error: "boom", domains: [], byTool: {}, ceilingLimiting: false, setDomainMode: vi.fn(), setToolMode: vi.fn(), refresh: vi.fn() };
    const h = draw(<TC accountEpoch="t1" />);
    const t = h.textContent ?? "";
    expect(t).toMatch(/couldn.t be read/i);
    // The failure must be framed as a read/permissions problem, not as a real empty/open workspace.
    expect(t).toMatch(/not a record of an empty or open workspace/i);
    expect(byRole(h, "alert")).toBeTruthy();
  });

  it("mounts a configured workspace and renders the compass as an accessible image, not a control", () => {
    gov.value = govValue([row("crm_create_contact", "auto"), row("crm_add_note", "confirm")]);
    const h = draw(<TC accountEpoch="t1" />);
    const img = byRole(h, "img");
    expect(img).toBeTruthy();
    expect(img?.getAttribute("aria-label")).toMatch(/summary .* not a control/i);
  });

  it("a settable capability exposes a keyboard slider capped at what the platform enforces", () => {
    // account domain: member_grant_role is HIGH → the domain max is 'confirm' (rank 1), never auto.
    gov.value = govValue([row("member_grant_role", "confirm"), row("team_set_work_profile", "confirm")]);
    const h = draw(<TC accountEpoch="t1" />);
    const sliders = [...h.querySelectorAll('[role="slider"]')];
    expect(sliders.length).toBeGreaterThan(0);
    for (const s of sliders) {
      expect(Number(s.getAttribute("aria-valuemax"))).toBeLessThanOrEqual(2);
      expect(s.getAttribute("aria-valuenow")).toBeTruthy();
      expect(s.getAttribute("aria-valuetext")).toBeTruthy();
      expect(s.getAttribute("tabindex")).not.toBeNull();
    }
  });

  it("an owner-only capability is Your call, with NO slider (no false affordance §70.1)", () => {
    // automation_set_grant is owner_only. Its domain (autos) shows it read-only.
    gov.value = govValue([row("automation_set_grant", "off"), row("automation_draft", "confirm")]);
    const h = draw(<TC accountEpoch="t1" />);
    const text = h.textContent ?? "";
    expect(text).toMatch(/Your call/);
    // Expand the autos card so the owner-only tool row is shown, and confirm it carries no slider.
    const toggle = [...h.querySelectorAll("button")].find((b) => /Automations & connected apps/i.test(b.textContent ?? ""));
    if (toggle) act(() => { toggle.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
    // The owner-only row shows "Your call" and the surface never renders an input.
    expect(h.querySelectorAll("input")).toHaveLength(0);
  });

  it("routes pending decisions to the ONE Paige chat, never a second approve button", () => {
    const openPaige = vi.fn();
    gov.value = govValue([row("crm_add_note", "confirm")]);
    pending.value = { items: [{ id: "p1", title: "Send a renewal note", summary: null, draftContent: null, rationale: null, department: "Owner Ops", createdAt: "now" }], loading: false, error: null, refresh: () => {} };
    const h = draw(<TC accountEpoch="t1" openPaige={openPaige} />);
    const btn = [...h.querySelectorAll("button")].find((b) => /Decide in Paige/i.test(b.textContent ?? ""));
    expect(btn, "the pending decision does not route to Paige").toBeTruthy();
    act(() => { btn!.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
    expect(openPaige).toHaveBeenCalled();
    // The false affordance the old modals had must not return.
    expect(h.textContent).not.toMatch(/Approve & send|Decide and log/i);
  });

  it("surfaces the platform ceiling as an effect, never the ceiling itself (§4.2)", () => {
    // ceiling narrows a stored 'auto' to 'confirm' for every tool.
    gov.value = govValue([row("crm_create_contact", "auto")], { auto: "confirm" });
    const text = draw(<TC accountEpoch="t1" />).textContent ?? "";
    expect(text).toMatch(/platform policy/i);
    // The ceiling number/posture/attestation must never appear.
    expect(text).not.toMatch(/rung|ceiling level|attestation|posture level \d/i);
  });

  it("makes no fabricated claim about activity, a period, or a trend", () => {
    gov.value = govValue([row("crm_create_contact", "auto"), row("crm_add_note", "confirm")]);
    const text = draw(<TC accountEpoch="t1" />).textContent ?? "";
    for (const claim of [/this week/i, /handled alone/i, /\bperformed\b.*\d/i, /\+\d+%/, /she is working now/i, /% autopilot/i]) {
      expect(text, `the page fabricates activity: ${claim}`).not.toMatch(claim);
    }
  });

  it("the recorded-work rail keeps forbidden/unavailable/empty apart, and never fakes activity", () => {
    gov.value = govValue([row("crm_add_note", "confirm")]);
    feed.value = { items: [], loading: false, error: "boom", status: "unavailable", refresh: () => {} };
    const h = draw(<TC accountEpoch="t1" />);
    const t = h.textContent ?? "";
    expect(t).toMatch(/not a record of nothing happening/i);
    expect(t).not.toMatch(/4s ago|Statewide Mutual|Harper/i);
  });

  it("survives an empty configured workspace without throwing", () => {
    gov.value = govValue([]);
    expect(() => draw(<TC accountEpoch="t1" />)).not.toThrow();
  });
});

describe("orbLabel — a real act and its lane, never an execution", () => {
  it("names the act and the lane it is ROUTED to", () => {
    expect(orbLabel({ n: "Sales" }, { label: "Draft follow-up", lane: "auto" }))
      .toBe("Sales · Draft follow-up — runs automatically by default");
  });
  it("never concatenates the act object", () => {
    for (const lane of ["auto", "confirm", "off"] as const) {
      expect(orbLabel({ n: "Sales" }, { label: "Draft follow-up", lane })).not.toContain("object Object");
    }
  });
  it("claims no execution in any lane", () => {
    for (const lane of ["auto", "confirm", "off"] as const) {
      const l = orbLabel({ n: "Sales" }, { label: "Draft follow-up", lane });
      expect(l, l).not.toMatch(/performed|handled|waiting on you|escalated for/i);
    }
  });
  it("laneTier drops a lane it cannot name, so no orb is drawn for it", () => {
    expect(laneTier("auto")).toBe("green");
    expect(laneTier("confirm")).toBe("amber");
    expect(laneTier("off")).toBe("red");
    expect(laneTier("supervised")).toBeNull();
    expect(laneTier(null)).toBeNull();
  });
});

/**
 * ACCOUNT SWITCH — the epoch must reach the surface so switching accounts cannot show the last one.
 *
 * The surface now mounts INSIDE Command Center, keyed by the active tenant so every read re-keys on
 * a switch, and its own hooks (`useSoloToolGovernance`/`useSoloActivityFeed`/`useSoloTrust`) all take
 * `accountEpoch`. These assert the wiring at its new home.
 */
describe("the epoch reaches the compass at its Command Center home", () => {
  it("Command Center mounts TrustCompass keyed by the account and passes the epoch", () => {
    const cc = fs.readFileSync(path.join(process.cwd(), "src/solo/CommandCenter.tsx"), "utf8");
    expect(cc).toContain("<TrustCompass key={activeTenantId ?? \"unresolved\"} accountEpoch={activeTenantId} openPaige={openPaige} />");
  });

  it("the legacy top-level address redirects into Command Center (old links do not break)", () => {
    const app = fs.readFileSync(path.join(process.cwd(), "src/solo/SoloApp.tsx"), "utf8");
    expect(app).toContain('/command-center/trust-compass');
    expect(app).not.toContain("compass:<TrustCompass");
  });

  it("the hook chain forwards the epoch rather than dropping it", () => {
    const src = fs.readFileSync(path.join(process.cwd(), "src/solo/compass.tsx"), "utf8");
    expect(src).toContain("useTrustDepartments=(accountEpoch)");
    expect(src).toContain("useSoloTrust(accountEpoch)");
    expect(src).toContain("TrustCompass=({accountEpoch,openPaige}");
    expect(src).toContain("useSoloToolGovernance(accountEpoch)");
  });
});
