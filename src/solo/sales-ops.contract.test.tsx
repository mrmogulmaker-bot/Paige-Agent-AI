/**
 * Solo Campaigns → Sales — the contract for the Sales Command Desk.
 *
 * ─── WHY THIS FILE EXISTS (§58) ──────────────────────────────────────────────────────────────
 *
 * The Sales tab ships the platform's §38 money boundary and its only routed-capture read. Nothing
 * else pins them, so a rebuild could delete the surface's honesty and pass every other gate green.
 * This file is that guard: the §38/§59 boundary, the recorded-terms honesty, the readable-vs-none
 * distinction, and the no-summed-total rule are asserted here and must survive any rebuild.
 *
 * ─── WHAT CHANGED IN THE COMMAND-DESK REBUILD (Sales Command Desk, 2026-09-05) ────────────────
 *
 * The single-scroll workbench became FOUR views — Sales Command · Commercial Terms · Revenue &
 * Collections · Sales Scenarios — selected by a Sales-local `?view=` param (the shell six-tab nav
 * is untouched). Every honesty guard below is UNCHANGED in intent; each now renders the view that
 * owns its band. New positive coverage pins the new operating views (pulse evidence classes, the
 * unavailable Contract-pending stage, the tenant-level payment path, and the model-only Scenario
 * Lab). Nothing that shipped was dropped — the routed-capture read, its no-inference drawer, its
 * empty state and its phase-awareness moved INTO SalesOps and are still asserted here.
 *
 * ─── WHY IT IS NOT IN growth2.render.test.tsx ────────────────────────────────────────────────
 *
 * PR #706 (Solo Pipeline) currently owns `growth2.render.test.tsx`, `growth2.contract.test.tsx`,
 * `solo-campaigns.css` and the Pipeline block of `growth2.tsx`. This slice keeps its diff off all
 * four. A merge conflict in a test file is how a §58 pin gets "resolved" away.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GrowthHub } from "./growth2";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

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
  sales: {} as Record<string, unknown>,
  agreements: {} as Record<string, unknown>,
}));

vi.mock("./useSocialCommand", () => ({
  useSocialCommand: () => ({
    tenantId: "tenant-1", phase: "ready", handles: [], canManage: true,
    recordChangedAt: null, notPermitted: false,
    recordHandles: async () => ({ ok: true, recordedCount: 0 }), retry() {},
  }),
}));
vi.mock("./data/useSoloPendingActions", () => ({
  useSoloPendingActions: () => ({ items: [], loading: false, error: null, refresh() {} }),
}));
vi.mock("./data/useSoloTrust", () => ({
  useSoloTrust: () => ({ loading: false, configured: true, departments: [], bySlug: {}, error: null }),
}));
vi.mock("./useSoloCampaigns", () => ({ useSoloCampaigns: () => harness.state }));
vi.mock("./useCatalogOffers", () => ({ useCatalogOffers: () => harness.offers }));
// Overview (the Campaign Command Desk) reads owner briefs through its own tenant-scoped adapter;
// this suite renders all six tabs, so stub the briefs read ready/empty (its own proof is in
// campaign-briefs.contract.test.tsx).
vi.mock("./useSoloCampaignBriefs", () => ({
  useSoloCampaignBriefs: () => ({
    tenantId: harness.state.tenantId, phase: "ready", briefs: [], archivedCount: 0, canManage: true,
    retry: () => {}, saveBrief: async () => ({ ok: true, message: "" }),
    transitionBrief: async () => ({ ok: true, message: "" }), archiveBrief: async () => ({ ok: true, message: "" }),
  }),
}));
// The Sales-operations adapter is mocked HERE so this file proves the SURFACE. What the adapter
// itself sends to the database — tenant scoping, fail-closed ordering, the refusal-only expected
// tenant — is proved separately in `useSoloSalesOps.adapter.test.tsx` against a recording client.
// Mocking it there too would prove nothing about either.
vi.mock("./useSoloSalesOps", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./useSoloSalesOps")>();
  return { ...actual, useSoloSalesOps: () => harness.sales };
});
vi.mock("./useSoloAgreements", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./useSoloAgreements")>();
  return { ...actual, useSoloAgreements: () => harness.agreements };
});

let host: HTMLDivElement;
let root: Root | null = null;

function renderAt(path: string) {
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
// Each Sales view is a Sales-local `?view=` param; command is the bare default.
const salesPath = (view?: string) => `/solo/42/growth/sales${view ? `?view=${view}` : ""}`;
const render = (view?: string) => renderAt(salesPath(view));

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
    tenantId: "tenant-1", phase: "ready", offers: [], referencedOffers: [], canManage: true,
    authorityUnknown: false, fieldsUnavailable: false, hasMore: false, retry: vi.fn(),
    saveOffer: vi.fn(async () => ({ ok: true, result: {} })),
    setOfferStatus: vi.fn(async () => ({ ok: true, result: {} })),
  };
  harness.sales = {
    tenantId: "tenant-1", phase: "ready", processor: null, processorUnrecognised: false,
    methods: [], orders: [], ordersReadable: true, canManage: true, authorityUnknown: false,
    retry: vi.fn(), declarePaymentHandling: vi.fn(async () => ({ ok: true, result: {} })),
  };
  harness.agreements = {
    tenantId: "tenant-1", phase: "ready", agreements: [], clients: [], clientsReadable: true,
    agreementsReadable: true, canManage: true, authorityUnknown: false, retry: vi.fn(),
    saveAgreement: vi.fn(async () => ({ ok: true, result: {} })),
    setAgreementStatus: vi.fn(async () => ({ ok: true, result: {} })),
  };
});

afterEach(() => {
  if (root) act(() => root!.unmount());
  root = null;
  host?.remove();
});

const buttonSaying = (text: string) =>
  [...host.querySelectorAll("button")].find((b) => b.textContent?.includes(text)) as HTMLButtonElement | undefined;

describe("§58 — behaviour that shipped on Sales and must survive the command-desk rebuild", () => {
  it("keeps the owner-placed client-billing boundary, verbatim (Revenue view)", () => {
    render("revenue");
    const text = host.textContent ?? "";
    expect(text).not.toContain("Billing your own clients");
    act(() => (buttonSaying("Record it") as HTMLButtonElement).click());
    const payment = document.querySelector('[role="dialog"]')!.textContent;
    expect(payment).toContain("Paige is not merchant of record");
    expect(payment).toContain("Settings → Billing");
    expect(payment).toContain("does not connect an account");
  });

  it("keeps the routed-capture read, and still refuses to treat an unrouted submission as one", () => {
    render();
    const text = host.textContent ?? "";
    expect(text).toContain("Discovery intake form");
    expect(text).not.toContain("Newsletter form");
  });

  it("keeps the routed-capture detail drawer and its no-inference note", () => {
    render();
    const row = host.querySelector(".so-form-activity .campaigns-list-row") as HTMLButtonElement;
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
    render();
    const text = host.textContent ?? "";
    expect(text).toContain("No routed form activity");
    expect(text).toContain("a submission is not a sale");
  });

  it("keeps the routed capture phase-aware — a failed snapshot read is unknown, not empty", () => {
    harness.state.phase = "unavailable";
    render();
    expect(host.textContent).toContain("Campaigns needs a resolved workspace");

    harness.state.phase = "error";
    render();
    expect(host.textContent).toContain("Campaigns could not load");
    expect(buttonSaying("Retry")).toBeDefined();

    harness.state.phase = "loading";
    render();
    expect(host.querySelector(".campaigns-skeleton")).not.toBeNull();
  });

  it("keeps the six-tab strip in order, with Sales in place", () => {
    render();
    const tabs = [...host.querySelectorAll('[role="tablist"][aria-label="Campaigns views"] [role="tab"]')]
      .map((t) => t.textContent?.trim())
      .filter(Boolean);
    expect(tabs).toEqual(["Overview", "Catalog", "Sales", "Pipeline", "Social", "Performance"]);
  });

  it("keeps SalesOps' own four load phases distinct from the Campaigns snapshot's", () => {
    harness.sales.phase = "unavailable";
    render();
    expect(host.textContent).toContain("Sales needs a resolved workspace");

    harness.sales.phase = "error";
    render();
    expect(host.textContent).toContain("Sales operations could not load");
    expect(buttonSaying("Retry")).toBeDefined();

    harness.sales.phase = "loading";
    render();
    expect(host.querySelector(".campaigns-skeleton")).not.toBeNull();
  });
});

describe("Sales Command — the operating desk (new)", () => {
  it("opens on Sales Command with an evidence-classed pulse and no representative-data claim", () => {
    render();
    const text = host.textContent ?? "";
    expect(text).toContain("Turn agreed value into received value");
    expect(text).toContain("Commercial Readiness Ladder");
    expect(text).toContain("Top Commercial Moves");
    expect(text).toContain("Open Commercial Work");
    // Production surface reads real data — it must never label itself a prototype.
    expect(text).not.toContain("Representative UI");
    // At least one evidence-class chip is rendered on the pulse.
    expect(host.querySelector(".so-ec")).not.toBeNull();
  });

  it("keeps Actual received honestly unavailable — never a summed forecast (§38)", () => {
    harness.sales.orders = [
      { id: "o1", productId: null, customerName: "A client", customerEmail: null,
        amountTotal: 500000, currency: "usd", status: "complete", createdAt: "2026-08-20T12:00:00Z" },
    ];
    render();
    const received = [...host.querySelectorAll(".so-pl")].find((t) => t.textContent?.includes("Actual received"));
    expect(received).not.toBeUndefined();
    expect(received?.textContent).toContain("Payment source needed");
    // The recorded receipt is never summed into the pulse figure.
    expect(received?.textContent).not.toContain("$5,000");
    expect(received?.querySelector(".so-ec-unknown")).not.toBeNull();
  });

  it("marks Contract pending UNAVAILABLE and Payment path as a tenant-level declaration", () => {
    render();
    const text = host.textContent ?? "";
    expect(text).toContain("Contract pending");
    expect(text).toContain("Contract records have no live backend yet");
    // Contract-pending column carries the honest 'No source' status pill.
    expect(host.querySelector(".so-lad-st-unavailable")).not.toBeNull();
    // Payment path (processor null) is not set up, and points at recording payment handling.
    expect(text).toContain("Record how clients pay you");
  });

  it("sums active one-time terms into Contracted and never annualizes recurring (§13)", () => {
    harness.agreements.clients = [{ id: "c1", name: "Acme" }, { id: "c2", name: "Bright" }];
    harness.agreements.agreements = [
      { id: "a1", contactId: "c1", offerId: "o1", status: "active", termKind: "one_time",
        agreedAmountMinor: 1200000, agreedCurrency: "usd", startsOn: null, renewsOn: null, endsOn: null },
      { id: "a2", contactId: "c2", offerId: "o2", status: "active", termKind: "recurring",
        billingInterval: "month", intervalCount: 1, agreedAmountMinor: 250000, agreedCurrency: "usd", startsOn: null, renewsOn: null, endsOn: null },
    ];
    render("revenue");
    const text = host.textContent ?? "";
    expect(text).toContain("$12,000");        // one-time active total
    expect(text).toContain("$2,500");         // recurring shown monthly
    expect(text).not.toContain("$14,400");    // NOT annualized
    expect(text).not.toContain("$144,000");
    expect(text).toContain("recurring shown monthly, never annualized");
  });

  it("a pure-recurring retainer renders Contracted as an em-dash, never 'Free' (§13 — money(0) is 'Free')", () => {
    harness.agreements.clients = [{ id: "c1", name: "Acme" }];
    harness.agreements.agreements = [
      { id: "a1", contactId: "c1", offerId: "o1", status: "active", termKind: "recurring",
        billingInterval: "month", intervalCount: 1, agreedAmountMinor: 250000, agreedCurrency: "usd",
        startsOn: null, renewsOn: null, endsOn: null },
    ];
    render("revenue");
    const text = host.textContent ?? "";
    expect(text).not.toContain("Free");          // a paid retainer is never labelled Free
    expect(text).toContain("$2,500");            // its recurring value still shows, monthly
    // the one-time headline is an em-dash with an honest note, not a zero
    expect(text).toContain("No one-time value");
  });

  it("deep-links each view through the Sales-local sub-nav", () => {
    render();
    const toTerms = [...host.querySelectorAll('.so-subnav [role="tab"]')].find((b) => b.textContent === "Commercial Terms") as HTMLButtonElement;
    expect(toTerms).not.toBeUndefined();
    act(() => toTerms.click());
    expect(host.textContent).toContain("Commercial terms and retainers");
  });
});

describe("Sales Scenarios — a model, never an action", () => {
  it("refuses the Evidence-supported path without pipeline evidence and never enables Save", () => {
    render("scenarios");
    const text = host.textContent ?? "";
    expect(text).toContain("No historical evidence yet");
    expect(text).toContain("Ask Paige to prepare the test");
    const save = buttonSaying("Save scenario");
    expect(save).toBeDefined();
    expect(save?.disabled).toBe(true);
  });

  it("writes nothing — no offer, agreement, or payment mutation from the Scenario Lab", () => {
    harness.offers.offers = [{ id: "o1", name: "Program", availability: "active",
      prices: [{ id: "p1", unitAmount: 1200000, currency: "usd", billingInterval: "month", active: true }] }];
    render("scenarios");
    const proposed = document.querySelector('.so-lab input') as HTMLInputElement;
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(proposed, "650000");
      proposed.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(harness.offers.saveOffer).not.toHaveBeenCalled();
    expect(harness.agreements.saveAgreement).not.toHaveBeenCalled();
    expect(harness.sales.declarePaymentHandling).not.toHaveBeenCalled();
  });
});

describe("Sales operations — what an owner can actually do (§70.1)", () => {
  it("distinguishes 'you have none' from 'I could not look' on payments (Revenue)", () => {
    harness.sales.ordersReadable = false;
    render("revenue");
    expect(host.textContent).toContain("not readable at your access level");
  });

  it("reads the declared processor back as words, not as a stored token (Revenue)", () => {
    harness.sales.processor = "square";
    harness.sales.methods = ["cards", "ach"];
    render("revenue");
    const text = host.textContent ?? "";
    expect(text).toContain("Square");
    expect(text).toContain("Cards");
    expect(text).toContain("ACH");
    expect(text).not.toContain("bank_merchant");
    expect(text).not.toContain("payment_processor_declared");
  });

  it("lets an owner record how their clients pay them, and sends the real declaration", async () => {
    render("revenue");
    act(() => (buttonSaying("Record it") as HTMLButtonElement).click());
    const dialog = document.querySelector('[role="dialog"]');
    expect(dialog?.textContent).toContain("How your clients pay you");
    expect(dialog?.textContent).toContain("does not connect an account, move");
    const pick = (label: string) =>
      [...document.querySelectorAll('[role="dialog"] .so-pick button')]
        .find((b) => b.textContent === label) as HTMLButtonElement;
    act(() => pick("PayPal").click());
    act(() => pick("Cards").click());
    act(() => pick("Check").click());
    const save = [...document.querySelectorAll('[role="dialog"] button')]
      .find((b) => b.textContent === "Save") as HTMLButtonElement;
    await act(async () => { save.click(); });
    expect(harness.sales.declarePaymentHandling).toHaveBeenCalledWith("paypal", ["cards", "check"]);
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });

  it("keeps the payment form open on a refusal and says nothing changed", async () => {
    harness.sales.declarePaymentHandling = vi.fn(async () => ({
      ok: false,
      message: "your active workspace changed before this could save; nothing was written",
    }));
    render("revenue");
    act(() => (buttonSaying("Record it") as HTMLButtonElement).click());
    const pick = [...document.querySelectorAll('[role="dialog"] .so-pick button')]
      .find((b) => b.textContent === "Stripe") as HTMLButtonElement;
    act(() => pick.click());
    const save = [...document.querySelectorAll('[role="dialog"] button')]
      .find((b) => b.textContent === "Save") as HTMLButtonElement;
    await act(async () => { save.click(); });
    const dialog = document.querySelector('[role="dialog"]');
    expect(dialog).not.toBeNull();
    expect(dialog?.textContent).toContain("nothing was written");
  });

  it("creates a quick offer through the canonical Catalog seam, and never a second record (Terms)", async () => {
    render("terms");
    act(() => (buttonSaying("Quick offer") as HTMLButtonElement).click());
    const dialog = document.querySelector('[role="dialog"]');
    expect(dialog?.textContent).toContain("saves as a draft in Catalog");
    const nameInput = document.querySelector('[role="dialog"] input') as HTMLInputElement;
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")!.set!;
    act(() => {
      setter.call(nameInput, "Monthly advisory retainer");
      nameInput.dispatchEvent(new Event("input", { bubbles: true }));
    });
    const pick = (label: string) =>
      [...document.querySelectorAll('[role="dialog"] .so-pick button')]
        .find((b) => b.textContent === label) as HTMLButtonElement;
    act(() => pick("Service").click());
    act(() => pick("Monthly").click());
    const create = [...document.querySelectorAll('[role="dialog"] button')]
      .find((b) => b.textContent === "Create offer") as HTMLButtonElement;
    await act(async () => { create.click(); });
    expect(harness.offers.saveOffer).toHaveBeenCalledTimes(1);
    const sent = (harness.offers.saveOffer as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(sent.tenantId).toBe("tenant-1");
    expect(sent.id).toBeNull();
    expect(sent.name).toBe("Monthly advisory retainer");
    expect(sent.kind).toBe("service");
    expect(sent.priceInterval).toBe("month");
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });

  it("converts a typed price to minor units using the currency's own exponent (Terms)", async () => {
    render("terms");
    act(() => (buttonSaying("Quick offer") as HTMLButtonElement).click());
    const inputs = [...document.querySelectorAll('[role="dialog"] input')] as HTMLInputElement[];
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")!.set!;
    const type = (el: HTMLInputElement, value: string) => act(() => {
      setter.call(el, value);
      el.dispatchEvent(new Event("input", { bubbles: true }));
    });
    type(inputs[0], "A day rate");
    type(inputs[2], "jpy");
    type(inputs[1], "500");
    const create = [...document.querySelectorAll('[role="dialog"] button')]
      .find((b) => b.textContent === "Create offer") as HTMLButtonElement;
    await act(async () => { create.click(); });
    const sent = (harness.offers.saveOffer as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(sent.priceAmount).toBe(500);
    expect(sent.priceCurrency).toBe("jpy");
  });

  it("tells the person when the server saved the definition but declined the price (Terms)", async () => {
    harness.offers.saveOffer = vi.fn(async () => ({
      ok: true,
      result: { id: "offer-1", price_note: "This price is connected to checkout, so it was left as it is." },
    }));
    render("terms");
    act(() => (buttonSaying("Quick offer") as HTMLButtonElement).click());
    const nameInput = document.querySelector('[role="dialog"] input') as HTMLInputElement;
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")!.set!;
    act(() => {
      setter.call(nameInput, "Something");
      nameInput.dispatchEvent(new Event("input", { bubbles: true }));
    });
    const create = [...document.querySelectorAll('[role="dialog"] button')]
      .find((b) => b.textContent === "Create offer") as HTMLButtonElement;
    await act(async () => { create.click(); });
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(host.textContent).toContain("Your Catalog draft was created. Review its price");
    expect(buttonSaying("Continue setup in Catalog")).toBeDefined();
    expect(harness.offers.saveOffer).toHaveBeenCalledTimes(1);
  });

  it("creates nothing when a quick offer is abandoned (Terms)", () => {
    render("terms");
    act(() => (buttonSaying("Quick offer") as HTMLButtonElement).click());
    const cancel = [...document.querySelectorAll('[role="dialog"] button')]
      .find((b) => b.textContent === "Cancel") as HTMLButtonElement;
    act(() => cancel.click());
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(harness.offers.saveOffer).not.toHaveBeenCalled();
  });

  it("shows recorded offers with their real state and price, and opens the Catalog-owned record (Terms)", () => {
    harness.offers.offers = [{
      id: "offer-1", name: "Twelve-week program", summary: null, description: null,
      availability: "active", billingCadence: "recurring", kind: "service", deliveryShape: "program",
      pricePresentation: "fixed", customerAction: "apply", category: "Programs", imageUrl: null,
      updatedAt: "2026-08-28T12:00:00Z",
      prices: [{ id: "price-1", nickname: "Standard", unitAmount: 240000, currency: "usd",
                 billingInterval: "month", kind: "recurring", installmentsTotal: null, active: true }],
    }];
    render("terms");
    const text = host.textContent ?? "";
    expect(text).toContain("Twelve-week program");
    expect(text).toContain("$2,400");
    expect(text).toContain("Monthly");
    expect(text).toContain("Live");
    expect(text).toContain("Page 1 · up to 5 offers");
    act(() => (host.querySelector("button.so-row") as HTMLButtonElement).click());
    const drawer = document.querySelector('[role="dialog"]');
    expect(drawer?.textContent).toContain("Catalog owns this record");
    expect(drawer?.textContent).toContain("never keeps a second copy of the price");
  });

  it("renders recorded payments as recorded, and no total (Revenue)", () => {
    harness.sales.orders = [
      { id: "o1", productId: null, customerName: "A client", customerEmail: null,
        amountTotal: 45000, currency: "usd", status: "complete", createdAt: "2026-08-20T12:00:00Z" },
      { id: "o2", productId: null, customerName: null, customerEmail: "someone@example.com",
        amountTotal: null, currency: null, status: "pending", createdAt: null },
    ];
    render("revenue");
    const text = host.textContent ?? "";
    expect(text).toContain("A client");
    expect(text).toContain("$450");
    expect(text).toContain("Paid");
    expect(text).toContain("Awaiting payment");
    expect(text).not.toContain("$0");
    expect(text).toContain("Not recorded");
    expect(text).toContain("View 2 recent payment records");
    const table = host.querySelector('[aria-label="Commercial activity"]');
    expect(table).not.toBeNull();
    const tableText = table?.textContent ?? "";
    expect(tableText).not.toMatch(/total|revenue|forecast|projected|sum/i);
    expect((tableText.match(/\$[\d,]+/g) ?? [])).toEqual(["$450"]);
  });

  it("offers no controls to a member who may not manage, and says why (Revenue)", () => {
    harness.sales.canManage = false;
    harness.offers.canManage = false;
    harness.agreements.canManage = false;
    render("revenue");
    expect(host.textContent).toContain("An owner or admin records this");
    expect(buttonSaying("Record it")).toBeUndefined();
    render("terms");
    expect(buttonSaying("Quick offer")).toBeUndefined();
    expect(buttonSaying("Record terms")).toBeUndefined();
    // §58/§36: a read-only reader is told WHO may record, never left with a silently missing button.
    expect(host.textContent).toContain("An owner or admin records this");
  });

  it("says the authority read failed rather than asserting a refusal it did not prove (Revenue)", () => {
    harness.sales.canManage = false;
    harness.sales.authorityUnknown = true;
    render("revenue");
    expect(host.textContent).toContain("could not be read");
  });

  it("names an unreadable stored processor instead of calling it unstated (Revenue)", () => {
    harness.sales.processor = null;
    harness.sales.processorUnrecognised = true;
    render("revenue");
    expect(host.textContent).toContain("this version cannot read");
    expect(host.textContent).toContain("Not readable");
  });

  it("calls an unreadable Campaigns snapshot unknown, not empty", () => {
    harness.state.phase = "error";
    render();
    expect(host.textContent).toContain("Campaigns could not load");
    expect(host.textContent).not.toContain("No deals on the board yet");
  });

  it("now reads client terms, and still refuses to count retainers Command Center owns (Terms)", () => {
    render("terms");
    const text = host.textContent ?? "";
    expect(text).toContain("Commercial terms and retainers");
    expect(text).not.toContain("This tab does not hold a per-client agreement record yet");
    expect(text).not.toContain("Not here");
    expect(text).toContain("Nothing recorded yet");
    expect(text).not.toMatch(/\d+\s+(active\s+)?retainers?/i);
  });

  it("says a member's unreadable client book is unknown, never zero (Terms)", () => {
    harness.agreements.agreementsReadable = false;
    harness.agreements.clientsReadable = false;
    harness.agreements.agreements = [];
    render("terms");
    const text = host.textContent ?? "";
    expect(text).toContain("not readable at your access level");
    expect(text).toContain("That is different from there being none");
    expect(text).not.toMatch(/Commercial terms and retainers[\s\S]{0,80}Nothing recorded yet/);
  });

  it("keeps the money boundary on the terms band, and promises no billing (Terms)", () => {
    render("terms");
    const text = host.textContent ?? "";
    expect(text).toContain("Recording it bills nobody and sends nothing");
    expect(text).toContain("No legal document is generated, stored or signed here");
    expect(text).not.toMatch(/\b(invoiced|charged|collected|paid in full)\b/i);
  });

  it("gives every view real headings, not bold text", () => {
    render();
    let headings = [...host.querySelectorAll("h1,h2,h3")].map((h) => h.textContent?.trim());
    expect(headings).toContain("Commercial Readiness Ladder");
    expect(headings).toContain("Top Commercial Moves");
    expect(headings).toContain("Open Commercial Work");
    render("terms");
    headings = [...host.querySelectorAll("h1,h2,h3")].map((h) => h.textContent?.trim());
    expect(headings).toContain("Commercial terms and retainers");
    expect(headings).toContain("Find an offer");
    render("revenue");
    headings = [...host.querySelectorAll("h1,h2,h3")].map((h) => h.textContent?.trim());
    expect(headings).toContain("Actual received");
    expect(headings).toContain("Commercial activity");
  });

  it("makes its dialogs actually modal, not merely labelled so (Revenue)", () => {
    render("revenue");
    const opener = buttonSaying("Record it") as HTMLButtonElement;
    act(() => { opener.focus(); opener.click(); });
    const dialog = document.querySelector('[role="dialog"][aria-modal="true"]') as HTMLElement;
    expect(dialog).not.toBeNull();
    const shell = host.querySelector(".solo-campaigns > .campaigns-scroll");
    expect(shell?.hasAttribute("inert")).toBe(true);
    const focusable = [...dialog.querySelectorAll("button:not([disabled]), input")] as HTMLElement[];
    expect(focusable.length).toBeGreaterThan(1);
    const last = focusable[focusable.length - 1];
    act(() => last.focus());
    act(() => { window.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true })); });
    expect(document.activeElement).toBe(focusable[0]);
    const cancel = focusable.find((el) => el.textContent === "Cancel") as HTMLButtonElement;
    act(() => cancel.click());
    expect(shell?.hasAttribute("inert")).toBe(false);
    expect(document.activeElement).toBe(opener);
  });

  it("uses the shared pill primitive rather than a local fork", () => {
    render();
    expect(host.querySelector(".so-pill")).toBeNull();
    expect(host.querySelector(".pill")).not.toBeNull();
  });

  it("keeps our plumbing vocabulary out of what a person reads", () => {
    harness.sales.phase = "error";
    render();
    expect(host.textContent).toContain("Your records were not changed");
    expect(host.textContent).not.toContain("tenant-scoped read");
  });

  it("says the word Sales once on the command view, not three times down the page", () => {
    render();
    const saying = [...host.querySelectorAll("*")]
      .filter((el) => el.children.length === 0 && el.textContent?.trim() === "Sales");
    expect(saying).toHaveLength(1);
    expect(host.querySelector('[role="tab"][aria-selected="true"]')?.textContent).toBe("Sales");
    const headings = [...host.querySelectorAll("h1,h2,h3")].map((h) => h.textContent ?? "");
    expect(headings.some((h) => /Sales/.test(h))).toBe(false);
  });

  it("renders no masthead above the work on any of the six tabs, and moves truth onto the desk", () => {
    for (const slug of ["overview", "catalog", "sales", "pipeline", "social", "performance"]) {
      renderAt(`/solo/42/growth/${slug}`);
      expect(host.querySelector(".pg-hd"), `masthead returned on ${slug}`).toBeNull();
    }
    render();
    expect(host.querySelector(".pg-hd")).toBeNull();
    // The truth label rides the command header; the legend stays in the shell tab row.
    expect(host.querySelector(".so-cmd-eyebrow .campaigns-truth")).not.toBeNull();
    expect(host.querySelector(".campaigns-nav .campaigns-truth-key")).not.toBeNull();
  });

  it("spends colour on meaning, not decoration", () => {
    // Empty terms read as an OPPORTUNITY (violet), never dead grey (§23); the act is the primary.
    render("terms");
    expect(host.querySelector(".pill-v")).not.toBeNull();
    const act1 = [...host.querySelectorAll("button")].find((b) => b.textContent === "Quick offer");
    expect(act1?.className).toContain("btn-p");
    // Money awaiting carries its own state colour so the figure and its pill cannot disagree.
    harness.sales.orders = [
      { id: "o1", productId: null, customerName: "A client", customerEmail: null,
        amountTotal: 45000, currency: "usd", status: "pending", createdAt: "2026-08-20T12:00:00Z" },
    ];
    render("revenue");
    expect(host.querySelector(".so-num--warn")).not.toBeNull();
    // The state-colour rules can actually WIN — a bare class loses to `.so-tr > span` (0,1,1).
    const sheet = readFileSync(resolve(process.cwd(), "src/solo/sales-ops.css"), "utf8");
    for (const tone of ["ok", "warn", "bad"]) {
      expect(sheet).toMatch(new RegExp(`\\.so-tr\\s*>\\s*span\\.so-num--${tone}`));
    }
    expect(sheet).toMatch(/\.so-tr\s*>\s*span\.so-num\b/);
    expect(sheet).toMatch(/\.so-tr\.so-th\s*>\s*span/);
    // Evidence chips never spend gold — gold stays on the act (§11).
    expect(sheet).not.toMatch(/\.so-ec[\s\S]*?var\(--gold/);
  });
});

describe("Sales operations — the money boundary is structural, not a paragraph (§38)", () => {
  const at = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
  const source = at("src/solo/sales-ops.tsx");
  const hook = at("src/solo/useSoloSalesOps.ts");
  const derive = at("src/solo/sales/deriveSalesCommand.ts");
  const scenario = at("src/solo/sales/salesScenario.ts");
  const migration = at(
    "supabase/migrations/20261130000000_a_solo_owner_can_say_how_their_clients_pay_them.sql",
  );
  const strip = (text: string) =>
    text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*(\/\/|--).*$/gm, "");
  const code = strip(source);
  const hookCode = strip(hook);
  const deriveCode = strip(derive);
  const scenarioCode = strip(scenario);
  const migrationCode = strip(migration);

  it("never reaches the two functions that create external provider state", () => {
    for (const forbidden of ["tenant-checkout-session", "tenant-stripe-connect"]) {
      expect(code).not.toContain(forbidden);
      expect(hookCode).not.toContain(forbidden);
      expect(deriveCode).not.toContain(forbidden);
      expect(scenarioCode).not.toContain(forbidden);
    }
  });

  it("bakes in no processor — the allow-list is data, and one brand is one of seven", () => {
    expect(code).not.toMatch(/if\s*\(\s*[^)]*===\s*["']stripe["']/);
    expect(hookCode).not.toMatch(/if\s*\(\s*[^)]*===\s*["']stripe["']/);
    expect(hookCode).toContain("DECLARED_PROCESSORS");
  });

  it("the derivation and scenario model never move money or write anything", () => {
    // Pure read-model modules. No mutation, no rpc, no supabase, no fetch.
    for (const c of [deriveCode, scenarioCode]) {
      expect(c).not.toMatch(/\.(insert|update|upsert|delete)\(/);
      expect(c).not.toContain("supabase");
      expect(c).not.toContain(".rpc(");
      expect(c).not.toContain("fetch(");
    }
  });

  it("writes only through the declared-handling rpc, never a direct table write", () => {
    expect(hookCode).toContain("supabase.rpc(");
    expect(hookCode).toContain("declare_client_payment_handling");
    expect(hookCode).not.toMatch(/\.(insert|update|upsert|delete)\(/);
  });

  it("scopes every read to the resolved tenant and refuses to read before identity resolves", () => {
    const reads = hookCode.match(/\.from\(/g) ?? [];
    const scoped = (hookCode.match(/\.eq\("(tenant_id|id)", activeTenantId\)/g) ?? []).length;
    expect(reads.length).toBeGreaterThan(0);
    expect(scoped).toBeGreaterThanOrEqual(reads.length);
    expect(hookCode.indexOf("if (!activeTenantId)")).toBeGreaterThan(-1);
    expect(hookCode.indexOf("if (!activeTenantId)")).toBeLessThan(hookCode.indexOf(".from("));
  });

  it("sends the caller's own resolved tenant as the refusal-only expected tenant", () => {
    expect(hookCode).toContain("_expected_tenant_id: activeTenantId");
  });

  it("keeps the migration free of processor machinery and of network egress", () => {
    expect(migrationCode).not.toMatch(/stripe_|payment_intent|application_fee|charges_enabled|payouts_enabled/i);
    expect(migrationCode).not.toMatch(/pg_net|http_post|net\.http|extensions\.http/i);
  });

  it("re-enforces caller scope in the function body, never on the grant (§59)", () => {
    expect(migrationCode).toContain("SECURITY DEFINER");
    expect(migrationCode).toContain("auth.uid()");
    expect(migrationCode).toContain("public.current_user_tenant_id()");
    expect(migrationCode).toContain("public.is_tenant_admin(_tenant)");
    expect(migrationCode).toMatch(/_expected_tenant_id IS DISTINCT FROM _tenant/);
    expect(migrationCode).toMatch(/REVOKE ALL ON FUNCTION public\.declare_client_payment_handling[\s\S]*?FROM anon/);
    expect(migrationCode).toMatch(/GRANT EXECUTE ON FUNCTION public\.declare_client_payment_handling[\s\S]*?TO authenticated/);
  });

  it("keeps a pinned search_path on the definer function", () => {
    expect(migrationCode).toMatch(/SET search_path TO 'public', 'pg_temp'/);
  });
});

// Recorded agreement dates are calendar dates, not timestamp events. (Commercial Terms view.)
describe('agreement schedule detail', () => {
  afterEach(() => vi.restoreAllMocks());
  it.each([
    ['recurring', '2026-10-15', 'Oct 15, 2026'],
    ['recurring', null, 'Not stated'],
    ['one_time', null, 'Not applicable'],
  ])('shows dates for %s with renewal %s', (termKind, renewsOn, renewalText) => {
    const Formatter = Intl.DateTimeFormat;
    vi.spyOn(Intl, 'DateTimeFormat').mockImplementation(function (locale, options) { return new Formatter('en-US', { timeZone: 'America/Los_Angeles', ...options }); });
    harness.agreements.clients = [{ id: 'c1', name: 'Example client' }];
    harness.agreements.agreements = [{
      id: 'a1', contactId: 'c1', offerId: 'o1', status: 'draft', termKind,
      agreedAmountMinor: null, catalogSnapshotMinor: null,
      startsOn: '2026-09-15', renewsOn, endsOn: '2026-11-15',
    }];
    render('terms');
    const row = host.querySelector('[aria-label="Commercial terms and retainers"] button') as HTMLButtonElement;
    act(() => row.click());
    const text = document.querySelector('[role="dialog"]')?.textContent ?? '';
    expect(text).toContain('Sep 15, 2026');
    expect(text).toContain('Nov 15, 2026');
    expect(text).toContain(`Renews${renewalText}`);
    expect(text).toContain('not an invoice, a charge, or a payment record');
    expect(harness.agreements.saveAgreement).not.toHaveBeenCalled();
    expect(harness.agreements.setAgreementStatus).not.toHaveBeenCalled();
    expect(harness.offers.saveOffer).not.toHaveBeenCalled();
  });
});

// jsdom does not enforce inert, so assert ancestry as well as dispatching actions.
describe("Sales usability repair", () => {
  const type = (input: HTMLInputElement, value: string) => act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  // Each control lives in the view that owns it: Record it → Revenue; Quick offer / Record terms → Terms.
  it.each([["Record it", "revenue"], ["Quick offer", "terms"], ["Record terms", "terms"]] as const)(
    "keeps %s outside inert content and Cancel restores focus", (name, view) => {
      render(view);
      const opener = buttonSaying(name) as HTMLButtonElement;
      opener.focus(); act(() => opener.click());
      const dialog = document.querySelector('[role="dialog"]')!;
      expect(dialog.closest('[inert]')).toBeNull();
      const cancel = [...dialog.querySelectorAll('button')].find(b => b.textContent === 'Cancel')!;
      act(() => cancel.click());
      expect(document.querySelector('[role="dialog"]')).toBeNull();
      expect(document.activeElement).toBe(opener);
    });
  it("protects dirty Quick Offer on Cancel and Escape without native confirm (Terms)", () => {
    render("terms");
    act(() => (buttonSaying("Quick offer") as HTMLButtonElement).click());
    const input = document.querySelector('[role="dialog"] input') as HTMLInputElement;
    type(input, "Keep this draft");
    act(() => (buttonSaying("Cancel") as HTMLButtonElement).click());
    expect(document.querySelector('[role="alertdialog"]')).not.toBeNull();
    act(() => (buttonSaying("Continue editing") as HTMLButtonElement).click());
    expect(input.value).toBe("Keep this draft");
    act(() => document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
    act(() => (buttonSaying("Discard changes") as HTMLButtonElement).click());
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(harness.offers.saveOffer).not.toHaveBeenCalled();
  });
  it("edits a Catalog-basis record without repricing or dropping unedited fields (Terms)", async () => {
    harness.agreements.clients = [{ id: "c1", name: "Client" }];
    harness.offers.offers = [{ id: "o1", name: "Offer", prices: [], availability: "active" }];
    harness.agreements.agreements = [{ id: "a1", contactId: "c1", offerId: "o1", status: "active", termKind: "recurring", priceBasis: "catalog", agreedAmountMinor: 12500, agreedCurrency: "usd", catalogSnapshotMinor: 12500, catalogSnapshotAt: "2026-09-01", billingInterval: "month", intervalCount: 3, paymentSchedule: "custom", title: "Keep title", notes: "Original", updatedAt: "version-1" }];
    render("terms");
    act(() => (host.querySelector('[aria-label="Commercial terms and retainers"] button') as HTMLButtonElement).click());
    act(() => (buttonSaying("Edit commercial terms") as HTMLButtonElement).click());
    const input = document.querySelector('input[placeholder="Anything you want to remember about this arrangement"]') as HTMLInputElement;
    act(() => (buttonSaying("What we agreed") as HTMLButtonElement).click());
    type(document.querySelector(".so-editor .so-money input") as HTMLInputElement, "-50");
    act(() => (buttonSaying("Your catalog price") as HTMLButtonElement).click());
    expect((document.querySelector(".so-editor .so-money input") as HTMLInputElement).value).toBe("125");
    type(input, "Updated note");
    await act(async () => (buttonSaying("Save changes") as HTMLButtonElement).click());
    expect(harness.agreements.saveAgreement).toHaveBeenCalledWith(expect.objectContaining({ agreedAmountMinor: 12500, agreedCurrency: "usd", catalogPriceId: null, intervalCount: 3, paymentSchedule: "custom", title: "Keep title", notes: "Updated note", expectedUpdatedAt: "version-1" }));
    expect(harness.offers.saveOffer).not.toHaveBeenCalled();
  });
});
describe("Commercial quote transitions (Terms)", () => {
  it.each([false, true])("clears amount for pending quote (existing=%s)", async existing => {
    harness.agreements.clients = [{ id: "c1", name: "Client" }];
    harness.offers.offers = [{ id: "o1", name: "Offer", prices: [{ id: "p1", unitAmount: 20000, currency: "usd", active: true }], availability: "active" }];
    if (existing) harness.agreements.agreements = [{ id: "a1", contactId: "c1", offerId: "o1", status: "draft", termKind: "one_time", priceBasis: "negotiated", agreedAmountMinor: 12500, agreedCurrency: "usd", catalogSnapshotMinor: null, catalogSnapshotAt: null, updatedAt: "v1" }];
    render("terms");
    if (existing) { act(() => (host.querySelector('[aria-label="Commercial terms and retainers"] button') as HTMLButtonElement).click()); act(() => (buttonSaying("Edit commercial terms") as HTMLButtonElement).click()); expect(buttonSaying("Your catalog price")).toBeUndefined(); }
    else {
      act(() => (buttonSaying("Record terms") as HTMLButtonElement).click());
      const selects = document.querySelectorAll('.so-editor select');
      act(() => { (selects[0] as HTMLSelectElement).value = "c1"; selects[0].dispatchEvent(new Event('change', { bubbles: true })); (selects[1] as HTMLSelectElement).value = "o1"; selects[1].dispatchEvent(new Event('change', { bubbles: true })); });
      const input = document.querySelector('input[placeholder="Amount"]') as HTMLInputElement;
      act(() => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, '125'); input.dispatchEvent(new Event('input', { bubbles: true })); });
    }
    act(() => (buttonSaying("Not quoted yet") as HTMLButtonElement).click());
    const save = [...document.querySelectorAll('.so-editor button')].find(b => b.textContent === (existing ? 'Save changes' : 'Record terms')) as HTMLButtonElement;
    await act(async () => save.click());
    expect(harness.agreements.saveAgreement).toHaveBeenCalledWith(expect.objectContaining({ priceBasis: 'quote_pending', termKind: 'custom_quote', agreedAmountMinor: null, agreedCurrency: null }));
  });
});
