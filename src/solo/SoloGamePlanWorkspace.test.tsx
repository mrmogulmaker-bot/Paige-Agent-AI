// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Routes, Route, useLocation } from "react-router-dom";

/**
 * Business Game Plan surface — the render + behaviour contract.
 *
 * Drives the REAL component against a mocked view-model, so the assertions cover what a human
 * actually reaches: every state renders, every primary action goes somewhere real (a route this
 * app mounts, or the one PAIGE conversation), and no route string / internal identifier leaks
 * into visible copy (owner corrections #3/#4, 2026-09-05).
 */

const hooked = vi.hoisted(() => ({ view: null as any }));
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

function clickText(tag: string, text: string) {
  const el = [...container.querySelectorAll(tag)].find((n) => (n.textContent || "").includes(text)) as HTMLElement | undefined;
  if (!el) throw new Error(`no <${tag}> containing "${text}"`);
  act(() => { el.click(); });
  return el;
}

const groundedView = () => ({
  loading: false, error: false, empty: false,
  greeting: { name: "Jordan", dateLabel: "Thursday, September 3", salutation: "Good afternoon" },
  narrative: "Foundations are set and work is moving.",
  attention: [{ label: "3 drafts waiting", tone: "live" }, { label: "2 clients at risk", tone: "partial" }],
  bestMove: {
    id: "attn:atrisk", title: "Re-engage 2 clients before they lapse", why: "Both crossed your quiet threshold.",
    owner: "paige", proof: "live", evidence: "2 clients flagged at risk.", outcome: "PAIGE drafts; you approve.",
    destination: "clients", ctaLabel: "See the clients",
  },
  priorities: [
    { id: "gap:offers", title: "Add your first offer", why: "Revenue waits on one offer.", owner: "you", proof: "input", evidence: "No offer yet.", outcome: "PAIGE builds pricing.", destination: "catalog", ctaLabel: "Open Catalog" },
  ],
  foundation: [
    { key: "identity", label: "Business identity", status: "grounded", note: "Clearpath Advisory", destination: "setup" },
    { key: "offers", label: "Offers", status: "needs-input", note: "No offer yet", destination: "catalog" },
    { key: "sender", label: "Sending identity", status: "grounded", note: "Email set up", destination: "connections" },
  ],
  coverage: { grounded: 3, partial: 1, total: 5, caption: "Three grounded." },
  motion: { status: "ready", items: [], freshness: "No recorded work yet" },
  firstRun: [],
  refresh: vi.fn(),
});

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.clearAllMocks();
});

describe("SoloGamePlanWorkspace", () => {
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
    expect(container.textContent).toContain("Let's build your game plan.");
    expect(container.querySelectorAll(".gp-first-step").length).toBe(3);
    clickText(".gp-first-step", "Add your first offer");
    expect(loc.value).toBe("/solo/42/growth/catalog");
  });

  it("renders the grounded plan: greeting, best move, priority, foundation, real coverage", () => {
    hooked.view = groundedView();
    mount();
    expect(container.textContent).toContain("Good afternoon, Jordan.");
    expect(container.textContent).toContain("Re-engage 2 clients before they lapse");
    expect(container.textContent).toContain("Add your first offer");
    expect(container.textContent).toContain("Business identity");
    // Real numerator/denominator, shown as "3 / 5".
    expect(container.querySelector(".gp-cov-top b")?.textContent?.replace(/\s+/g, "")).toBe("3/5");
  });

  it("renders the owner's real, server-resolved account identity (§70) — name + tier, not a placeholder", () => {
    hooked.view = groundedView();
    mount();
    // The visible kicker carries the resolved account name and its tier label…
    expect(container.querySelector(".gp-kicker")?.textContent).toContain("Clearpath Advisory");
    expect(container.querySelector(".gp-kicker")?.textContent).toContain("Solo");
    // …and the canonical sr-only shell-contract markers carry the same values.
    expect(container.querySelector("[data-tenant-account-name]")?.textContent).toBe("Clearpath Advisory");
    expect(container.querySelector("[data-tenant-account-tier]")?.textContent).toBe("Solo");
  });

  it("renders the blocked treatment with its reason", () => {
    const v = groundedView();
    v.bestMove = {
      ...v.bestMove, proof: "blocked", title: "Launch the re-engagement sequence",
      blockedReason: "Your sending identity isn't verified, so no email can be sent. Clear it and this move unblocks.",
      destination: "connections", ctaLabel: "Verify sending identity",
    } as any;
    hooked.view = v;
    mount();
    expect(container.textContent).toContain("Top move · blocked");
    expect(container.textContent).toContain("sending identity isn't verified");
    expect(container.querySelector(".gp-bnm.gp-blocked")).toBeTruthy();
  });

  it("the primary act opens the one PAIGE conversation (never a fake action)", () => {
    const openPaige = vi.fn();
    hooked.view = groundedView();
    mount(openPaige);
    clickText("button", "Put PAIGE to work");
    expect(openPaige).toHaveBeenCalledTimes(1);
  });

  it("a foundation row routes to its real owning surface", () => {
    hooked.view = groundedView();
    mount();
    clickText(".gp-fnd-row", "Business identity");
    expect(loc.value).toBe("/solo/42/settings/setup");
  });

  it("a priority row is keyboard-expandable (aria-expanded toggles)", () => {
    hooked.view = groundedView();
    mount();
    const row = container.querySelector(".gp-pp-row") as HTMLElement;
    expect(row.getAttribute("aria-expanded")).toBe("false");
    act(() => { row.click(); });
    expect(row.getAttribute("aria-expanded")).toBe("true");
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
    for (const forbidden of ["/solo/", "supabase", "_snapshot", "usePractice", "paige_", "get_solo_rail", "#771", "RPC"]) {
      expect(text, `visible copy must not contain "${forbidden}"`).not.toContain(forbidden);
    }
  });
});
