// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Routes, Route, useLocation } from "react-router-dom";

/**
 * Business Game Plan — the STRATEGY DESK render + behaviour contract (owner-approved 2026-09-06).
 *
 * Drives the REAL component against a mocked view-model, so the assertions cover what a human
 * actually reaches: the strategy spine renders (not a readiness list), the Plan Brief is genuinely
 * EDITABLE and calls the persist seam (§70), Systems Check is a demoted supporting dependency, every
 * action goes somewhere real (a route this app mounts, or the one PAIGE conversation), and no route
 * string / internal identifier leaks into visible copy.
 */

import type { SoloGamePlanView } from "./data/useSoloGamePlan";

const hooked = vi.hoisted(() => ({ view: null as SoloGamePlanView | null }));
vi.mock("./data/useSoloGamePlan", () => ({ useSoloGamePlan: () => hooked.view }));

import { SoloGamePlanWorkspace } from "./SoloGamePlanWorkspace";

let container: HTMLDivElement;
let root: Root;
const loc = { value: "" };

function LocationProbe() {
  const l = useLocation();
  loc.value = l.pathname;
  return null;
}
function mount(openPaige?: () => void) {
  loc.value = "";
  act(() => {
    root.render(
      <MemoryRouter initialEntries={["/solo/42/command-center/business-game-plan"]}>
        <Routes>
          <Route
            path="/solo/:account/*"
            element={<><SoloGamePlanWorkspace openPaige={openPaige} accountContext={{ accountName: "Clearpath Advisory", accountType: "standalone", parentTenantId: null }} /><LocationProbe /></>}
          />
        </Routes>
      </MemoryRouter>,
    );
  });
}
function clickText(selector: string, text: string) {
  const el = [...container.querySelectorAll(selector)].find((n) => (n.textContent || "").includes(text)) as HTMLElement | undefined;
  if (!el) throw new Error(`no ${selector} containing "${text}"`);
  act(() => { el.click(); });
  return el;
}
function setTextarea(labelText: string, value: string) {
  const field = [...container.querySelectorAll(".ov-field")].find((f) => (f.textContent || "").includes(labelText)) as HTMLElement | undefined;
  const ta = field?.querySelector("textarea") as HTMLTextAreaElement | undefined;
  if (!ta) throw new Error(`no textarea for "${labelText}"`);
  const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value")!.set!;
  act(() => { setter.call(ta, value); ta.dispatchEvent(new Event("input", { bubbles: true })); });
}

const saveMock = vi.fn().mockResolvedValue({ ok: true, kind: "saved" });

const groundedView = (): SoloGamePlanView => ({
  loading: false, error: false, empty: false,
  greeting: { name: "Jordan", dateLabel: "Saturday, September 6", salutation: "Good afternoon" },
  narrative: "", attention: [], bestMove: null, priorities: [], foundation: [],
  coverage: { grounded: 0, partial: 0, degraded: 0, total: 5, caption: "" },
  motion: { status: "ready", items: [], freshness: "No recorded work yet" },
  firstRun: [],
  planBrief: {
    fields: {
      annualDirection: "Become the default operations advisor in the Northeast.",
      goals90Day: "6 retained clients by quarter end.",
      currentPriority: "Convert the 3 warm referrals.",
      successDefinition: "$20k/mo retained.",
      constraints: "Max 8 active clients.",
      operatingPreferences: "Draft, don't send.",
      doNotAssume: "",
    },
    provenance: { annualDirection: "owner_confirmed", currentPriority: "owner_confirmed" },
    hasPlan: true, canEdit: true, saving: false, pendingProposal: null, updatedAt: "2026-09-04T00:00:00Z",
    save: saveMock,
    applyProposal: vi.fn().mockResolvedValue({ ok: true, kind: "saved" }),
    dismissProposal: vi.fn().mockResolvedValue({ ok: true }),
  },
  horizons: [
    { id: "annual", label: "Annual", sub: "This year", direction: "Become the default operations advisor in the Northeast.", outcome: "$20k/mo retained.", defined: true },
    { id: "quarter", label: "This quarter", sub: "90 days", direction: "Convert the 3 warm referrals.", outcome: "6 retained clients by quarter end.", defined: true },
  ],
  playsStatus: "ready",
  plays: [
    { id: "p1", name: "Q3 Launch campaign", objective: "Put the offer in front of the warm list.", audience: "Warm list", angle: "Find the leaks", window: "Sep 22 – Oct 3", channels: "Email", outcome: "20 booked diagnostics.", successSignal: "Bookings.", offerName: "Ops-audit", status: "approved", blocked: false },
  ],
  decisions: [
    { id: "d1", title: "Review 3 drafts Paige is holding", detail: "Paige prepared these.", source: "recommendation", waiting: true, destination: "paige", evidence: "3 drafts waiting." },
  ],
  dependencies: [
    { id: "dep1", title: "Sending identity not verified", reason: "Blocks the launch send.", blocking: true },
  ],
  dependenciesStatus: "ready",
  refresh: vi.fn(),
});

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  saveMock.mockClear();
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.clearAllMocks();
});

describe("SoloGamePlanWorkspace (strategy desk)", () => {
  it("renders a loading skeleton (aria-busy) while the plan resolves", () => {
    hooked.view = { ...groundedView(), loading: true };
    mount();
    expect(container.querySelector("[aria-busy='true']")).toBeTruthy();
  });

  it("renders a useful first-run experience for an empty workspace, and its steps navigate for real", () => {
    hooked.view = {
      ...groundedView(), empty: true,
      firstRun: [
        { label: "Complete your Business Context", hint: "Who you serve", destination: "setup" },
        { label: "Add your first offer", hint: "What you sell", destination: "catalog" },
        { label: "Connect one operating system", hint: "Calendar or email", destination: "connections" },
      ],
    };
    mount();
    expect(container.textContent).toContain("Let's build your game plan with Paige.");
    clickText(".sd-first-step", "Add your first offer");
    expect(loc.value).toBe("/solo/42/growth/catalog");
  });

  it("leads with the STRATEGY spine: greeting, the plan brief direction, plays — not a readiness list", () => {
    hooked.view = groundedView();
    mount();
    expect(container.textContent).toContain("Good afternoon, Jordan.");
    expect(container.textContent).toContain("Plan brief");
    // The quarter horizon is the default lead; its direction shows.
    expect(container.textContent).toContain("Convert the 3 warm referrals.");
    expect(container.textContent).toContain("Q3 Launch campaign");
    // Systems Check is demoted to a supporting dependency, never a "best move" spine.
    expect(container.textContent).toContain("Plan dependencies");
    expect(container.textContent).not.toContain("Top move · blocked");
  });

  it("renders the owner's real, server-resolved account identity (§70) — name + tier, not a placeholder", () => {
    hooked.view = groundedView();
    mount();
    expect(container.querySelector(".sd-kicker")?.textContent).toContain("Clearpath Advisory");
    expect(container.querySelector(".sd-kicker")?.textContent).toContain("Solo");
    expect(container.querySelector("[data-tenant-account-name]")?.textContent).toBe("Clearpath Advisory");
    expect(container.querySelector("[data-tenant-account-tier]")?.textContent).toBe("Solo");
  });

  it("the Plan Brief is genuinely EDITABLE and persists through the save seam (§70)", () => {
    hooked.view = groundedView();
    mount();
    clickText("button", "Edit brief");
    // A dialog opened with the current values.
    expect(container.querySelector('[role="dialog"]')).toBeTruthy();
    setTextarea("Annual direction", "Own the Series-A ops-advisory category.");
    clickText("button", "Save changes");
    expect(saveMock).toHaveBeenCalledTimes(1);
    expect(saveMock).toHaveBeenCalledWith(expect.objectContaining({ annualDirection: "Own the Series-A ops-advisory category." }));
  });

  it("a NON-first Plan Brief field is editable and its value reaches the save seam (§70, peer-gate BLOCKER)", () => {
    // The focus-trap effect once re-ran on every keystroke (unstable onClose dep), stealing focus
    // back to field #1 so only the first field was editable. This drives a LATER field end-to-end;
    // its value must flow to save — a regression guard for the multi-field first-run flow.
    hooked.view = groundedView();
    mount();
    clickText("button", "Edit brief");
    setTextarea("This quarter's focus", "Convert the 3 warm referrals into retained clients.");
    clickText("button", "Save changes");
    expect(saveMock).toHaveBeenCalledWith(expect.objectContaining({ currentPriority: "Convert the 3 warm referrals into retained clients." }));
  });

  it("a Systems Check read OUTAGE shows 'Couldn't check', never a false 'All clear' (§13, peer-gate MAJOR)", () => {
    hooked.view = { ...groundedView(), dependencies: [], dependenciesStatus: "unavailable" };
    mount();
    expect(container.textContent).toContain("Couldn't check");
    expect(container.textContent).not.toContain("Nothing is blocking your plays");
    expect(container.textContent).not.toContain("All clear");
  });

  it("the primary act opens the one PAIGE conversation (never a fake action)", () => {
    const openPaige = vi.fn();
    hooked.view = groundedView();
    mount(openPaige);
    clickText("button", "Plan with Paige");
    expect(openPaige).toHaveBeenCalledTimes(1);
  });

  it("a plan dependency routes to Systems Check (demoted, but reachable)", () => {
    hooked.view = groundedView();
    mount();
    // open the collapsible dependencies section, then click the finding.
    clickText(".sd-dep-name", "Sending identity not verified");
    expect(loc.value).toBe("/solo/42/command-center/systems-check");
  });

  it("a decision on the desk opens its backing surface (§36 drill-down)", () => {
    const openPaige = vi.fn();
    hooked.view = groundedView();
    mount(openPaige);
    clickText("button", "Open PAIGE");
    expect(openPaige).toHaveBeenCalledTimes(1);
  });

  it("shows 'No recorded work yet' for an empty recorded feed (never a fake activity feed)", () => {
    hooked.view = groundedView();
    mount();
    expect(container.textContent).toContain("No recorded work yet");
  });

  it("leaks no route string, provider name, or internal identifier into visible copy", () => {
    hooked.view = groundedView();
    mount();
    const text = container.textContent || "";
    for (const forbidden of ["/solo/", "supabase", "business_brief", "campaign_briefs", "paige_", "get_solo", "RPC", "§"]) {
      expect(text, `visible copy must not contain "${forbidden}"`).not.toContain(forbidden);
    }
  });
});
