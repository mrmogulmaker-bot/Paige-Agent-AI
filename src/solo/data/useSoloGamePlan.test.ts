// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * useSoloGamePlan — the derivation contract (owner corrections #1/#2, 2026-09-05).
 *
 * Composes only released, tenant-safe reads. These drive the real hook against mocked sub-hooks
 * and prove the HONESTY rules: coverage is a real numerator/denominator (never a fabricated
 * score); an empty *recorded* feed reads "No recorded work yet" (not "nothing happened"); a
 * blocking system-check finding produces a blocked best move; a fresh workspace is `empty`.
 */

const m = vi.hoisted(() => ({
  cc: {} as any, setup: {} as any, catalog: {} as any, knowledge: {} as any,
  pending: {} as any, checks: {} as any, activity: {} as any,
}));

vi.mock("./useCommandCenter", () => ({ useCommandCenter: () => m.cc }));
vi.mock("./useSoloSetupBrief", () => ({ useSoloSetupBrief: () => m.setup }));
vi.mock("../useCatalogOffers", () => ({ useCatalogOffers: () => m.catalog }));
vi.mock("./useSoloKnowledge", () => ({ useSoloKnowledge: () => m.knowledge }));
vi.mock("./useSoloPendingActions", () => ({ useSoloPendingActions: () => m.pending }));
vi.mock("@/hooks/useSystemsCheck", () => ({ useSystemsCheck: () => m.checks }));
vi.mock("./useSoloActivityFeed", () => ({
  useSoloActivityFeed: () => m.activity,
  elapsedLabel: () => "1m ago",
  departmentLabel: () => "Client Success",
}));

import { useSoloGamePlan, type SoloGamePlanView } from "./useSoloGamePlan";

let container: HTMLDivElement;
let root: Root;
let view: SoloGamePlanView;

function Probe() {
  view = useSoloGamePlan("42", "42");
  return null;
}
function render() {
  act(() => { root.render(React.createElement(Probe)); });
}

/** Baseline: everything loaded, nothing set up (a fresh workspace). */
function resetEmpty() {
  m.cc = { loading: false, isError: false, empty: true, greeting: { name: "Jordan" }, attention: {}, counts: { approvals: 0 }, refresh: vi.fn() };
  m.setup = { loading: false, error: null, brief: {}, managedSendingEmail: null, refresh: vi.fn() };
  m.catalog = { phase: "ready", offers: [], retry: vi.fn() };
  m.knowledge = { loading: false, error: null, documentsIndexed: 0, empty: true, refresh: vi.fn() };
  m.pending = { items: [], loading: false, error: null, refresh: vi.fn() };
  m.checks = { run: null, findings: [], loading: false, isError: false, scanPending: false, refresh: vi.fn() };
  m.activity = { items: [], loading: false, status: "loading", error: null, refresh: vi.fn() };
}

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  resetEmpty();
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.clearAllMocks();
});

describe("useSoloGamePlan derivation", () => {
  it("coverage is a real numerator/denominator over five foundations", () => {
    render();
    expect(view.coverage.total).toBe(5);
    expect(view.coverage.grounded).toBe(0);
    expect(view.foundation.length).toBe(5);
  });

  it("detects a genuinely empty (fresh) workspace", () => {
    render();
    expect(view.empty).toBe(true);
  });

  it("a fully-set-up workspace grounds all five foundations and is not empty", () => {
    m.setup.brief = { publicName: "Clearpath Advisory", legalName: "Clearpath LLC", industry: "Consulting", website: "clearpath.example", provenance: { website: { source: "owner_confirmed" } } };
    m.setup.managedSendingEmail = "hello@clearpath.example";
    m.catalog.offers = [{ availability: "active" }, { availability: "active" }];
    m.knowledge = { ...m.knowledge, documentsIndexed: 6, empty: false };
    render();
    expect(view.coverage.grounded).toBe(5);
    expect(view.empty).toBe(false);
    expect(view.bestMove).toBeTruthy();
  });

  it("an empty recorded feed reads 'No recorded work yet' (never 'nothing happened')", () => {
    m.activity = { ...m.activity, status: "ready", items: [] };
    render();
    expect(view.motion.status).toBe("ready");
    expect(view.motion.freshness).toBe("No recorded work yet");
  });

  it("renders real recorded activity when the feed has rows", () => {
    m.activity = {
      status: "ready", loading: false, error: null, refresh: vi.fn(),
      items: [{ id: "e1", title: "Sent a follow-up", summary: null, byPaige: true, actorAgent: null, departmentSlug: "client_experience", occurredAt: "2026-09-03T10:00:00Z" }],
    };
    render();
    expect(view.motion.items.length).toBe(1);
    expect(view.motion.items[0].department).toBe("Client Success");
    expect(view.motion.items[0].when).toBe("1m ago");
  });

  it("a blocking system-check finding produces a blocked best move + a 'move blocked' chip", () => {
    m.checks.findings = [{
      id: "f1", check_id: "some_check", status: "fail", severity_at_finding: "blocking",
      paige_interpretation: "Your sending identity isn't verified.", check_name: "Sending identity",
    }];
    render();
    expect(view.bestMove?.proof).toBe("blocked");
    expect(view.bestMove?.blockedReason).toContain("sending identity isn't verified");
    expect(view.attention.some((a) => a.label === "1 move blocked")).toBe(true);
  });

  it("surfaces work Paige drafted as an owner-approval move", () => {
    m.pending.items = [{ id: "p1", title: "Draft email", summary: null, draftContent: null, rationale: "Client went quiet.", department: "Client Success", createdAt: "" }];
    render();
    const move = [view.bestMove, ...view.priorities].find((x) => x?.id === "pending:drafts");
    expect(move).toBeTruthy();
    expect(move?.owner).toBe("paige");
    expect(move?.destination).toBe("paige");
  });
});
