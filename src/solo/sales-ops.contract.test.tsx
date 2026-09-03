/**
 * Solo Campaigns → Sales — the contract for the Sales Operations surface.
 *
 * ─── WHY THIS FILE EXISTS BEFORE THE SURFACE DOES (§58) ──────────────────────────────────────
 *
 * The Sales tab already ships two things nobody tests. `growth2.contract.test.tsx:34-45` pins the
 * TAB — the word "Sales" in the strip — and nothing anywhere asserts the strings "Billing your own
 * clients" or "Routed capture activity", or that `ClientBillingBoundary` renders at all. So a
 * rebuild of this tab could delete the surface's ONLY §38 statement and its only real read, keep
 * the tab shell, and pass every gate green.
 *
 * That asymmetry is the §58 hole, and this file closes it. The `§58 —` block below was written and
 * run GREEN against the pre-rebuild surface, then kept unchanged across the rebuild. It is not
 * documentation of what the surface happens to do; it is the guard that the owner-placed money
 * boundary (commit 263042a, 2026-09-03) and the routed-capture read survive being built around.
 *
 * ─── WHY IT IS NOT IN growth2.render.test.tsx ────────────────────────────────────────────────
 *
 * PR #706 (Solo Pipeline) currently owns `growth2.render.test.tsx`, `growth2.contract.test.tsx`,
 * `solo-campaigns.css` and the Pipeline block of `growth2.tsx`. This slice keeps its diff off all
 * four — the same move `useCatalogOffers.ts` made for the same reason. A merge conflict in a test
 * file is how a §58 pin gets "resolved" away.
 */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GrowthHub } from "./growth2";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

/**
 * Two submissions: one routed (carries a contact reference), one not. The Sales surface must show
 * the first and never the second — "a submission is not treated as a sale" is the whole rule.
 */
const ROUTED = {
  id: "submission-routed",
  source: "Discovery intake form",
  createdAt: "2026-08-28T12:00:00Z",
  contactId: "contact-1",
  dealId: null,
};
const UNROUTED = {
  id: "submission-unrouted",
  source: "Newsletter form",
  createdAt: "2026-08-27T12:00:00Z",
  contactId: null,
  dealId: null,
};

const harness = vi.hoisted(() => ({
  state: {} as Record<string, unknown>,
  offers: {} as Record<string, unknown>,
}));

vi.mock("./useSoloCampaigns", () => ({ useSoloCampaigns: () => harness.state }));
vi.mock("./useCatalogOffers", () => ({ useCatalogOffers: () => harness.offers }));

let host: HTMLDivElement;
let root: Root | null = null;

function renderAt(path: string) {
  // Tear the previous root down FIRST. Rendering a second root while the first is still mounted
  // leaves an orphan tree that answers `document` queries, which is how a deleted surface keeps
  // "passing" a text assertion.
  if (root) act(() => root!.unmount());
  host?.remove();
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => root!.render(
    <MemoryRouter initialEntries={[path]}>
      <Routes><Route path="/solo/:account/*" element={<GrowthHub />} /></Routes>
    </MemoryRouter>,
  ));
}

beforeEach(() => {
  harness.state = {
    tenantId: "tenant-1",
    phase: "ready",
    campaigns: [],
    artifacts: [],
    submissions: [ROUTED, UNROUTED],
    pipelineWorkspace: { canManage: true, folders: [], pipelines: [], stages: [], deals: [] },
    pipelineAction: vi.fn(async () => ({ ok: true, message: "Saved" })),
    retry: vi.fn(),
  };
  harness.offers = {
    tenantId: "tenant-1",
    phase: "ready",
    offers: [],
    canManage: true,
    authorityUnknown: false,
    fieldsUnavailable: false,
    retry: vi.fn(),
    saveOffer: vi.fn(async () => ({ ok: true, result: {} })),
    setOfferStatus: vi.fn(async () => ({ ok: true, result: {} })),
  };
});

afterEach(() => {
  if (root) act(() => root!.unmount());
  root = null;
  host?.remove();
});

const buttonSaying = (text: string) =>
  [...host.querySelectorAll("button")].find((b) => b.textContent?.includes(text)) as HTMLButtonElement | undefined;

describe("§58 — behaviour that shipped on Sales before this slice and must survive it", () => {
  it("keeps the owner-placed client-billing boundary, verbatim", () => {
    renderAt("/solo/42/growth/sales");
    const text = host.textContent ?? "";
    // The heading and BOTH paragraphs. Placed by the owner on 2026-09-03; this is the surface's
    // only §38 statement, and it matters most at the exact moment the tab starts looking like it
    // might collect money.
    expect(text).toContain("Billing your own clients");
    expect(text).toContain("runs on your own payment processor");
    expect(text).toContain("Paige is never the merchant of record for money your clients");
    // The pointer to where platform billing actually lives — the other half of the boundary.
    expect(text).toContain("Settings → Billing");
    // Carried as an explicit truth tag, not as prose that reads like a feature.
    expect(host.querySelector(".campaigns-truth--unavailable")).not.toBeNull();
  });

  it("keeps the routed-capture read, and still refuses to treat an unrouted submission as one", () => {
    renderAt("/solo/42/growth/sales");
    const text = host.textContent ?? "";
    expect(text).toContain("Discovery intake form");
    // The rule the surface exists to hold: a submission with no contact or deal reference is not
    // activity. If this ever appears, something started inferring a sale from a form fill.
    expect(text).not.toContain("Newsletter form");
  });

  it("keeps the routed-capture detail drawer and its no-inference note", () => {
    renderAt("/solo/42/growth/sales");
    const row = host.querySelector(".campaigns-list-row") as HTMLButtonElement;
    expect(row).not.toBeNull();
    act(() => row.click());
    const drawer = document.querySelector('[role="dialog"]');
    const text = drawer?.textContent ?? "";
    expect(text).toContain("Source");
    expect(text).toContain("Contact reference");
    expect(text).toContain("Deal reference");
    expect(text).toContain("No monetary value or campaign attribution is inferred.");
  });

  it("keeps the routed-capture empty state when nothing is routed", () => {
    harness.state.submissions = [UNROUTED];
    renderAt("/solo/42/growth/sales");
    const text = host.textContent ?? "";
    expect(text).toContain("No routed capture activity");
    expect(text).toContain("A submission is not treated as a sale");
  });

  it("keeps the six-tab strip in order, with Sales in place", () => {
    renderAt("/solo/42/growth/sales");
    // Scoped to the tablist, not the whole nav band — the nav also carries the Vibe Studio
    // launcher, which is not a tab and must not be counted as one.
    const tabs = [...host.querySelectorAll('[role="tablist"] [role="tab"]')]
      .map((t) => t.textContent?.trim())
      .filter(Boolean);
    expect(tabs).toEqual(["Overview", "Catalog", "Sales", "Pipeline", "Social", "Performance"]);
  });

  it("keeps the four load phases distinct — an unresolved workspace is never an empty one", () => {
    harness.state.phase = "unavailable";
    renderAt("/solo/42/growth/sales");
    expect(host.textContent).toContain("Campaigns needs a resolved workspace");

    harness.state.phase = "error";
    renderAt("/solo/42/growth/sales");
    expect(host.textContent).toContain("could not load");
    expect(buttonSaying("Retry")).toBeDefined();

    harness.state.phase = "loading";
    renderAt("/solo/42/growth/sales");
    expect(host.querySelector(".campaigns-skeleton")).not.toBeNull();
  });
});
