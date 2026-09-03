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
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
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
  sales: {} as Record<string, unknown>,
}));

vi.mock("./useSoloCampaigns", () => ({ useSoloCampaigns: () => harness.state }));
vi.mock("./useCatalogOffers", () => ({ useCatalogOffers: () => harness.offers }));
// The Sales-operations adapter is mocked HERE so this file proves the SURFACE. What the adapter
// itself sends to the database — tenant scoping, fail-closed ordering, the refusal-only expected
// tenant — is proved separately in `useSoloSalesOps.adapter.test.tsx` against a recording client.
// Mocking it there too would prove nothing about either.
vi.mock("./useSoloSalesOps", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./useSoloSalesOps")>();
  return { ...actual, useSoloSalesOps: () => harness.sales };
});

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
  harness.sales = {
    tenantId: "tenant-1",
    phase: "ready",
    processor: null,
    processorUnrecognised: false,
    methods: [],
    orders: [],
    ordersReadable: true,
    canManage: true,
    authorityUnknown: false,
    retry: vi.fn(),
    declarePaymentHandling: vi.fn(async () => ({ ok: true, result: {} })),
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

/**
 * §70.1 — the deliverable is a person completing a task, never a code path that exists.
 *
 * These drive the real controls through the real handlers: open the editor, type, save, and read
 * back what the surface then shows. A handler that is "wired" proves nothing; the anchoring failure
 * of §70 was a save that reported success and discarded the write, and only driving it catches that.
 */
describe("Sales operations — what an owner can actually do", () => {
  it("answers the readiness questions from records, and never calls an unread thing empty", () => {
    renderAt("/solo/42/growth/sales");
    const text = host.textContent ?? "";
    expect(text).toContain("Where this business stands");
    expect(text).toContain("How your clients pay you");
    expect(text).toContain("What you sell");
    expect(text).toContain("Client agreements, retainers and subscriptions");
    expect(text).toContain("Payments and invoices");
    expect(text).toContain("Linked pipeline work");
    // First use: nothing recorded is stated as such, and the next step names a real act.
    expect(text).toContain("Not recorded yet");
    expect(text).toContain("Add what you sell");
  });

  it("distinguishes 'you have none' from 'I could not look' on payments", () => {
    // `tenant_orders` GRANTs SELECT to authenticated and gates on RLS, which FILTERS ROWS rather
    // than erroring — so a non-admin gets 200/[]/no-error. The adapter derives this flag from
    // authority for that reason; see useSoloSalesOps.adapter.test.tsx for the executed proof.
    harness.sales.ordersReadable = false;
    renderAt("/solo/42/growth/sales");
    const text = host.textContent ?? "";
    expect(text).toContain("not readable at your access level");
    expect(text).toContain("Not readable");
  });

  it("reads the declared processor back as words, not as a stored token", () => {
    harness.sales.processor = "square";
    harness.sales.methods = ["cards", "ach"];
    renderAt("/solo/42/growth/sales");
    const text = host.textContent ?? "";
    expect(text).toContain("Square");
    expect(text).toContain("Cards");
    expect(text).toContain("ACH");
    // The raw column name and the raw enum must never reach a person.
    expect(text).not.toContain("bank_merchant");
    expect(text).not.toContain("payment_processor_declared");
  });

  it("lets an owner record how their clients pay them, and sends the real declaration", async () => {
    renderAt("/solo/42/growth/sales");
    act(() => (buttonSaying("Record it") as HTMLButtonElement).click());

    const dialog = document.querySelector('[role="dialog"]');
    expect(dialog?.textContent).toContain("How your clients pay you");
    // The honesty the whole slice turns on: this is a record, not a connection.
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
    // A clean save closes the form. A refusal does not — proved below.
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });

  it("keeps the payment form open on a refusal and says nothing changed", async () => {
    harness.sales.declarePaymentHandling = vi.fn(async () => ({
      ok: false,
      message: "your active workspace changed before this could save; nothing was written",
    }));
    renderAt("/solo/42/growth/sales");
    act(() => (buttonSaying("Record it") as HTMLButtonElement).click());
    const pick = [...document.querySelectorAll('[role="dialog"] .so-pick button')]
      .find((b) => b.textContent === "Stripe") as HTMLButtonElement;
    act(() => pick.click());
    const save = [...document.querySelectorAll('[role="dialog"] button')]
      .find((b) => b.textContent === "Save") as HTMLButtonElement;
    await act(async () => { save.click(); });

    const dialog = document.querySelector('[role="dialog"]');
    // Still open, carrying the server's own sentence. Closing it would discard the answer on top
    // of telling someone it did not save.
    expect(dialog).not.toBeNull();
    expect(dialog?.textContent).toContain("nothing was written");
  });

  it("creates a quick offer through the canonical Catalog seam, and never a second record", async () => {
    renderAt("/solo/42/growth/sales");
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
    // THE FIELD WHOSE ABSENCE MADE EVERY CREATE FAIL, and which the first version of this test did
    // not check. `saveOffer` forwards it as `_expected_tenant_id`; `runWrite` merges
    // `{ _expected_tenant_id: activeTenantId, ...args }`, so a draft that OMITS the key still
    // contributes `undefined`, which WINS the spread and is then dropped by JSON.stringify. The
    // rpc declares that parameter with no DEFAULT and its 14-arg overload was dropped, so
    // PostgREST resolved no function at all. Asserting id/name/kind/interval could never see it.
    expect(sent.tenantId).toBe("tenant-1");
    // A create, against the one canonical record: no id, and it is Catalog's own draft shape.
    expect(sent.id).toBeNull();
    expect(sent.name).toBe("Monthly advisory retainer");
    expect(sent.kind).toBe("service");
    expect(sent.priceInterval).toBe("month");
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });

  it("converts a typed price to minor units using the currency's own exponent", async () => {
    renderAt("/solo/42/growth/sales");
    act(() => (buttonSaying("Quick offer") as HTMLButtonElement).click());
    const inputs = [...document.querySelectorAll('[role="dialog"] input')] as HTMLInputElement[];
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")!.set!;
    const type = (el: HTMLInputElement, value: string) => act(() => {
      setter.call(el, value);
      el.dispatchEvent(new Event("input", { bubbles: true }));
    });
    // inputs: [name, price, currency]
    type(inputs[0], "A day rate");
    type(inputs[2], "jpy");
    type(inputs[1], "500");
    const create = [...document.querySelectorAll('[role="dialog"] button')]
      .find((b) => b.textContent === "Create offer") as HTMLButtonElement;
    await act(async () => { create.click(); });

    const sent = (harness.offers.saveOffer as ReturnType<typeof vi.fn>).mock.calls[0][0];
    // JPY has ZERO minor digits. A hardcoded times-100 here would store 50,000 for a 500 offer —
    // the exact defect #863 fixed in the sibling editor, which is why both share one implementation.
    expect(sent.priceAmount).toBe(500);
    expect(sent.priceCurrency).toBe("jpy");
  });

  it("tells the person when the server saved the definition but declined the price", async () => {
    harness.offers.saveOffer = vi.fn(async () => ({
      ok: true,
      result: { id: "offer-1", price_note: "This price is connected to checkout, so it was left as it is." },
    }));
    renderAt("/solo/42/growth/sales");
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

    // Silently not saving a price somebody just typed is the same class of lie as inventing one,
    // so the form stays open carrying the server's sentence.
    expect(document.querySelector('[role="dialog"]')?.textContent).toContain("connected to checkout");
  });

  it("creates nothing when a quick offer is abandoned", () => {
    renderAt("/solo/42/growth/sales");
    act(() => (buttonSaying("Quick offer") as HTMLButtonElement).click());
    const cancel = [...document.querySelectorAll('[role="dialog"] button')]
      .find((b) => b.textContent === "Cancel") as HTMLButtonElement;
    act(() => cancel.click());
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(harness.offers.saveOffer).not.toHaveBeenCalled();
  });

  it("shows recorded offers with their real state and price, and opens the Catalog-owned record", () => {
    harness.offers.offers = [{
      id: "offer-1", name: "Twelve-week program", summary: null, description: null,
      availability: "active", billingCadence: "recurring", kind: "service", deliveryShape: "program",
      pricePresentation: "fixed", customerAction: "apply", category: "Programs", imageUrl: null,
      updatedAt: "2026-08-28T12:00:00Z",
      prices: [{ id: "price-1", nickname: "Standard", unitAmount: 240000, currency: "usd",
                 billingInterval: "month", kind: "recurring", installmentsTotal: null, active: true }],
    }];
    renderAt("/solo/42/growth/sales");
    const text = host.textContent ?? "";
    expect(text).toContain("Twelve-week program");
    expect(text).toContain("$2,400");
    expect(text).toContain("Monthly");
    expect(text).toContain("Live");
    // The readiness row agrees with the table it sits above — one record, one reading.
    expect(text).toContain("1 live of 1 recorded");

    act(() => (host.querySelector("button.so-row") as HTMLButtonElement).click());
    const drawer = document.querySelector('[role="dialog"]');
    expect(drawer?.textContent).toContain("Catalog owns this record");
    expect(drawer?.textContent).toContain("never keeps a second copy of the price");
  });

  it("renders recorded payments as recorded, and no total", () => {
    harness.sales.orders = [
      { id: "o1", productId: null, customerName: "A client", customerEmail: null,
        amountTotal: 45000, currency: "usd", status: "complete", createdAt: "2026-08-20T12:00:00Z" },
      { id: "o2", productId: null, customerName: null, customerEmail: "someone@example.com",
        amountTotal: null, currency: null, status: "pending", createdAt: null },
    ];
    renderAt("/solo/42/growth/sales");
    const text = host.textContent ?? "";
    expect(text).toContain("A client");
    expect(text).toContain("$450");
    expect(text).toContain("Paid");
    expect(text).toContain("Awaiting payment");
    // An absent amount is an em-dash, never a zero — a zero asserts a reading the record never made.
    expect(text).not.toContain("$0");
    expect(text).toContain("Not recorded");
    // Readiness counts what is WAITING; it never sums what was paid.
    expect(text).toContain("1 awaiting attention of 2 recent");
    // No summed figure anywhere in the activity table. Asserted against the table itself rather
    // than the whole page, because the page legitimately uses the words "revenue", "total" and
    // "forecast" in the sentences that DENY doing any of them — a blanket text ban would have been
    // satisfied by deleting the disclaimer, which is backwards.
    const table = host.querySelector('[aria-label="Commercial activity"]');
    expect(table).not.toBeNull();
    const tableText = table?.textContent ?? "";
    expect(tableText).not.toMatch(/total|revenue|forecast|projected|sum/i);
    // The one money figure shown is the one recorded amount — never that amount plus anything.
    expect((tableText.match(/\$[\d,]+/g) ?? [])).toEqual(["$450"]);
  });

  it("offers no controls to a member who may not manage, and says why", () => {
    harness.sales.canManage = false;
    harness.offers.canManage = false;
    renderAt("/solo/42/growth/sales");
    expect(host.textContent).toContain("An owner or admin records this");
    // A sentence, never a disabled button — "you could do this, but not now" would be untrue.
    expect(buttonSaying("Record it")).toBeUndefined();
    expect(buttonSaying("Quick offer")).toBeUndefined();
  });

  it("says the authority read failed rather than asserting a refusal it did not prove", () => {
    harness.sales.canManage = false;
    harness.sales.authorityUnknown = true;
    renderAt("/solo/42/growth/sales");
    expect(host.textContent).toContain("could not be read");
  });

  it("names an unreadable stored processor instead of calling it unstated", () => {
    harness.sales.processor = null;
    harness.sales.processorUnrecognised = true;
    renderAt("/solo/42/growth/sales");
    expect(host.textContent).toContain("this version cannot read");
    expect(host.textContent).toContain("Not readable");
  });

  it("calls unreadable pipeline work unknown, not empty", () => {
    // SalesOps renders OUTSIDE the Campaigns StateFrame, and useSoloCampaigns returns `deals: []`
    // for resolving, loading, unavailable AND error alike. Counting length alone therefore told a
    // workspace whose deal read had FAILED that it had no deals — permanently, not as a flash.
    harness.state.phase = "error";
    renderAt("/solo/42/growth/sales");
    expect(host.textContent).toContain("Your pipeline could not be read");
    expect(host.textContent).not.toContain("No deals on the board yet");
  });

  it("never asserts a workspace has no retainers, because it does not read them", () => {
    renderAt("/solo/42/growth/sales");
    const text = host.textContent ?? "";
    expect(text).toContain("Client agreements, retainers and subscriptions");
    // `tenant_service_subscriptions` is already counted as "Active retainers" on Command Center for
    // this same owner. A hardcoded "Not recorded yet" here would put two surfaces in disagreement
    // about one record, over a table this tab never queries.
    expect(text).toContain("This tab does not hold a per-client agreement record yet");
    // "Not readable" would assert a read that failed. Nothing was read, so nothing failed.
    expect(text).toContain("Not here");
    expect(text).not.toMatch(/retainers and subscriptions[\s\S]{0,40}Not recorded yet/);
  });

  it("gives every section a real heading, not bold text", () => {
    renderAt("/solo/42/growth/sales");
    const headings = [...host.querySelectorAll("h1,h2,h3")].map((h) => h.textContent?.trim());
    // Before this surface existed the tab had ONE h2, "Routed capture activity". Rebuilding around
    // it must not leave a five-section page whose sections are bold text to a screen reader.
    expect(headings).toContain("Where this business stands");
    expect(headings).toContain("What you sell");
    expect(headings).toContain("Commercial activity");
    expect(headings).toContain("Routed capture activity");
  });

  it("makes its dialogs actually modal, not merely labelled so", async () => {
    renderAt("/solo/42/growth/sales");
    const opener = buttonSaying("Record it") as HTMLButtonElement;
    // Focus explicitly before clicking. A real browser focuses a button when it is clicked and
    // always when it is reached by keyboard; jsdom's `.click()` does not, so without this the test
    // would be asserting focus RESTORE from a state where nothing was focused to begin with.
    act(() => { opener.focus(); opener.click(); });

    const dialog = document.querySelector('[role="dialog"][aria-modal="true"]') as HTMLElement;
    expect(dialog).not.toBeNull();
    // Declaring aria-modal without enforcing it is a claim the DOM does not honour. The shell
    // behind the scrim goes inert, so Tab and a virtual cursor both stay in the panel.
    const shell = host.querySelector(".solo-campaigns > .campaigns-scroll");
    expect(shell?.hasAttribute("inert")).toBe(true);

    // Tab from the last focusable wraps to the first rather than escaping into the page.
    const focusable = [...dialog.querySelectorAll("button:not([disabled]), input")] as HTMLElement[];
    expect(focusable.length).toBeGreaterThan(1);
    const last = focusable[focusable.length - 1];
    act(() => last.focus());
    act(() => { window.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true })); });
    expect(document.activeElement).toBe(focusable[0]);

    // On close the background is released and focus returns to what opened it.
    const cancel = focusable.find((el) => el.textContent === "Cancel") as HTMLButtonElement;
    act(() => cancel.click());
    expect(shell?.hasAttribute("inert")).toBe(false);
    expect(document.activeElement).toBe(opener);
  });

  it("uses the shared pill primitive rather than a local fork", () => {
    renderAt("/solo/42/growth/sales");
    // §11: add to the layer, do not fork a one-off. The fork this replaced also dropped a dark-mode
    // pair to 3.79:1, under AA, on the readiness panel's primary state signal.
    expect(host.querySelector(".so-pill")).toBeNull();
    expect(host.querySelector(".pill")).not.toBeNull();
  });

  it("keeps our plumbing vocabulary out of what a person reads", () => {
    harness.sales.phase = "error";
    renderAt("/solo/42/growth/sales");
    expect(host.textContent).toContain("Your records were not changed");
    expect(host.textContent).not.toContain("tenant-scoped read");
  });

  it("says the word Sales once, not three times down the page", () => {
    // OWNER, 2026-09-03: "do you see where it says 'sales' in the banner area? It says 'sales'
    // again at the top in the subtab. We're being very, very redundant… eliminating that whole
    // banner section." The banner said CAMPAIGNS / Sales directly above a tab strip already saying
    // Sales, under a shell already saying Campaigns, and spent ~90px doing it.
    renderAt("/solo/42/growth/sales");
    // Counted structurally, not over `textContent` — the tab strip concatenates
    // ("CatalogSalesPipeline"), so a word-boundary match over the whole page silently finds
    // nothing and the guard would pass while saying nothing at all.
    const saying = [...host.querySelectorAll("*")]
      .filter((el) => el.children.length === 0 && el.textContent?.trim() === "Sales");
    expect(saying).toHaveLength(1);
    // And the one that survives is the tab, not a heading repeating it.
    expect(host.querySelector('[role="tab"][aria-selected="true"]')?.textContent).toBe("Sales");
    // No heading anywhere on the surface repeats the tab's word.
    const headings = [...host.querySelectorAll("h1,h2,h3")].map((h) => h.textContent ?? "");
    expect(headings.some((h) => /Sales/.test(h))).toBe(false);
  });

  it("renders no masthead above the work on a normal tab", () => {
    renderAt("/solo/42/growth/sales");
    // The surface starts at the first band. A legacy address still gets a head — that is its only
    // orientation — but a normal tab does not.
    expect(host.querySelector(".pg-hd")).toBeNull();
    expect(host.textContent).not.toContain("Grounded campaign work and published outputs");
    // What the masthead carried is not lost: the truth label moved onto the first band, and the
    // legend moved into the tab row.
    expect(host.querySelector(".so-band-head .campaigns-truth")).not.toBeNull();
    expect(host.querySelector(".campaigns-nav .campaigns-truth-key")).not.toBeNull();
  });

  it("spends colour on meaning, not decoration", () => {
    harness.sales.processor = "paypal";
    harness.sales.methods = ["cards"];
    harness.sales.orders = [
      { id: "o1", productId: null, customerName: "A client", customerEmail: null,
        amountTotal: 45000, currency: "usd", status: "pending", createdAt: "2026-08-20T12:00:00Z" },
    ];
    renderAt("/solo/42/growth/sales");
    // Nothing recorded reads as an OPPORTUNITY (violet), never as dead grey — §23, and the owner's
    // "this is representing their money, their income, their opportunities".
    expect(host.querySelector(".pill-v")).not.toBeNull();
    // Money awaiting carries its own state colour, so the figure and its pill cannot disagree.
    expect(host.querySelector(".so-num--warn")).not.toBeNull();
    // The acts are the primary action, not a plain control.
    const act = [...host.querySelectorAll("button")].find((b) => b.textContent === "Quick offer");
    expect(act?.className).toContain("btn-p");
  });

  it("keeps its own load phases distinct from the Campaigns snapshot's", () => {
    harness.sales.phase = "error";
    renderAt("/solo/42/growth/sales");
    expect(host.textContent).toContain("Sales operations could not load");
    expect(host.textContent).toContain("Your records were not changed");

    harness.sales.phase = "unavailable";
    renderAt("/solo/42/growth/sales");
    expect(host.textContent).toContain("Sales needs a resolved workspace");
  });
});

describe("Sales operations — the money boundary is structural, not a paragraph (§38)", () => {
  // Read the way every sibling contract test reads source: from the repo root, not from
  // `import.meta.url`, which is not a file URL under this runner.
  const at = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
  const source = at("src/solo/sales-ops.tsx");
  const hook = at("src/solo/useSoloSalesOps.ts");
  const migration = at(
    "supabase/migrations/20261130000000_a_solo_owner_can_say_how_their_clients_pay_them.sql",
  );
  // Comments are stripped before every static assertion. A docstring explaining that we do not call
  // a checkout function must never be what satisfies a guard against calling it.
  const strip = (text: string) =>
    text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*(\/\/|--).*$/gm, "");
  const code = strip(source);
  const hookCode = strip(hook);
  const migrationCode = strip(migration);

  it("never reaches the two functions that create external provider state", () => {
    for (const forbidden of ["tenant-checkout-session", "tenant-stripe-connect"]) {
      expect(code).not.toContain(forbidden);
      expect(hookCode).not.toContain(forbidden);
    }
  });

  it("bakes in no processor — the allow-list is data, and one brand is one of seven", () => {
    // The surface may LABEL a processor the workspace declared. It may not branch on one.
    expect(code).not.toMatch(/if\s*\(\s*[^)]*===\s*["']stripe["']/);
    expect(hookCode).not.toMatch(/if\s*\(\s*[^)]*===\s*["']stripe["']/);
    expect(hookCode).toContain("DECLARED_PROCESSORS");
  });

  it("writes only through the declared-handling rpc, never a direct table write", () => {
    expect(hookCode).toContain("supabase.rpc(");
    expect(hookCode).toContain("declare_client_payment_handling");
    // No PostgREST mutation anywhere in the adapter. Every write goes through the governed seam.
    expect(hookCode).not.toMatch(/\.(insert|update|upsert|delete)\(/);
  });

  it("scopes every read to the resolved tenant and refuses to read before identity resolves", () => {
    const reads = hookCode.match(/\.from\(/g) ?? [];
    const scoped = (hookCode.match(/\.eq\("(tenant_id|id)", activeTenantId\)/g) ?? []).length;
    expect(reads.length).toBeGreaterThan(0);
    // Counted rather than hard-coded, so adding a read cannot quietly drop its scope.
    expect(scoped).toBeGreaterThanOrEqual(reads.length);
    // Fail-closed ORDERING: identity is settled before the first read is issued.
    expect(hookCode.indexOf("if (!activeTenantId)")).toBeGreaterThan(-1);
    expect(hookCode.indexOf("if (!activeTenantId)")).toBeLessThan(hookCode.indexOf(".from("));
  });

  it("sends the caller's own resolved tenant as the refusal-only expected tenant", () => {
    expect(hookCode).toContain("_expected_tenant_id: activeTenantId");
  });

  it("keeps the migration free of processor machinery and of network egress", () => {
    // A provider's machinery in the SCHEMA is the assumption-baking this seam exists to avoid. The
    // seven allow-listed values are the CHECK constraint's own vocabulary, so they are expected;
    // what must not appear is a column, id, or call naming a provider's internals.
    expect(migrationCode).not.toMatch(/stripe_|payment_intent|application_fee|charges_enabled|payouts_enabled/i);
    expect(migrationCode).not.toMatch(/pg_net|http_post|net\.http|extensions\.http/i);
  });

  it("re-enforces caller scope in the function body, never on the grant (§59)", () => {
    expect(migrationCode).toContain("SECURITY DEFINER");
    expect(migrationCode).toContain("auth.uid()");
    expect(migrationCode).toContain("public.current_user_tenant_id()");
    expect(migrationCode).toContain("public.is_tenant_admin(_tenant)");
    expect(migrationCode).toMatch(/_expected_tenant_id IS DISTINCT FROM _tenant/);
    // anon revoked. The grant is never the guard, but an anon grant on a DEFINER writer is its own
    // defect — and the REVOKE is load-bearing: without it anon CAN execute, proved against prod.
    expect(migrationCode).toMatch(/REVOKE ALL ON FUNCTION public\.declare_client_payment_handling[\s\S]*?FROM anon/);
    expect(migrationCode).toMatch(/GRANT EXECUTE ON FUNCTION public\.declare_client_payment_handling[\s\S]*?TO authenticated/);
  });

  it("keeps a pinned search_path on the definer function", () => {
    expect(migrationCode).toMatch(/SET search_path TO 'public', 'pg_temp'/);
  });
});
