// Slice 2A contract + render proof for Campaigns → Catalog → Offers.
//
// Lives in its own file rather than extending `growth2.contract.test.tsx` for the same reason the
// read lives in its own hook: that file is currently owned by PR #706, and the existing
// "exactly four tenant-scoped reads" assertion is a guard worth leaving sharp rather than editing.
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GrowthHub } from "./growth2";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

// These guards must measure CODE, not prose. The first run of this suite failed three times
// against the files' own explanatory comments — the header that quotes the read pattern, the note
// promising never to print `$0`, and the migration paragraph listing what it deliberately does NOT
// add. A guard that a docstring can trip is a guard that punishes documentation, so the source is
// stripped of comments before every static assertion.
const stripTs = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const stripSql = (src: string) => src.replace(/^\s*--.*$/gm, "");

const adapter = stripTs(read("src/solo/useCatalogOffers.ts"));
const surface = stripTs(read("src/solo/catalog-offers.tsx"));
const migration = stripSql(
  read("supabase/migrations/20261048000000_tenant_products_carry_the_offer_definition.sql"),
);
// The comment-stripper is itself load-bearing, so prove it removes prose and keeps code.
const adapterRaw = read("src/solo/useCatalogOffers.ts");

const offer = (over: Record<string, unknown> = {}) => ({
  id: "offer-1",
  name: "Foundations Coaching Program",
  summary: "A twelve-week group program.",
  description: "Twelve weekly live sessions.",
  availability: "active",
  billingCadence: "service",
  kind: "service",
  deliveryShape: "program",
  pricePresentation: "fixed",
  customerAction: "apply",
  category: "Programs",
  imageUrl: null,
  updatedAt: "2026-08-28T12:00:00Z",
  prices: [{ id: "price-1", nickname: "Full", unitAmount: 240000, currency: "usd", billingInterval: "one_time", kind: "one_time", installmentsTotal: null, active: true }],
  ...over,
});

const harness = vi.hoisted(() => ({
  campaigns: {} as Record<string, unknown>,
  offers: {} as Record<string, unknown>,
}));

vi.mock("./useSoloCampaigns", () => ({ useSoloCampaigns: () => harness.campaigns }));
vi.mock("./useCatalogOffers", () => ({ useCatalogOffers: () => harness.offers }));

let host: HTMLDivElement;
let root: Root;

function renderAt(path: string) {
  // Tear the previous tree down FIRST. Each call used to append a new host and leave the old one
  // in the document, so a test calling this eight times (the plan-shape loop) left seven orphan
  // trees behind for every later test in the file. Any assertion reading `document.body` could
  // then be satisfied by a leftover render rather than the one it just made — a guard that
  // silently weakens as tests are added, which is the exact failure this suite exists to catch.
  act(() => root?.unmount());
  host?.remove();
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => root.render(
    <MemoryRouter initialEntries={[path]}>
      <Routes><Route path="/solo/:account/*" element={<GrowthHub />} /></Routes>
    </MemoryRouter>,
  ));
}

function setCampaigns(over: Record<string, unknown> = {}) {
  harness.campaigns = {
    tenantId: "tenant-1", phase: "ready", campaigns: [], submissions: [],
    artifacts: [{ id: "form-1", type: "form", name: "Published form", slug: "f", status: "active", updatedAt: "2026-08-28T12:00:00Z", publicHref: "/form/form-1", recentSubmissions: 0, routingConfigured: false, routingTargets: [], recentDispatches: { succeeded: 0, failed: 0, other: 0 } }],
    pipelineWorkspace: { canManage: true, canArchiveFolders: true, folders: [], pipelines: [], stages: [], deals: [] },
    pipelineAction: vi.fn(async () => ({ ok: true, message: "" })), retry: vi.fn(), ...over,
  };
}

function setOffers(over: Record<string, unknown> = {}) {
  harness.offers = {
    tenantId: "tenant-1", phase: "ready", offers: [offer()], canManage: true,
    authorityUnknown: false, fieldsUnavailable: false, retry: vi.fn(), ...over,
  };
}

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  vi.clearAllMocks();
});

describe("Catalog Offers — tenant-scoped read contract", () => {
  it("measures code, not comments", () => {
    // The raw file mentions the read pattern in its header; the stripped one must not.
    expect(adapterRaw).toContain("WHY THIS IS ITS OWN HOOK");
    expect(adapter).not.toContain("WHY THIS IS ITS OWN HOOK");
    expect(adapter).toContain('.from("tenant_products")');
  });

  it("fails closed on tenant identity before it reads anything", () => {
    expect(adapter).toContain("accountContextLoading");
    expect(adapter).toContain("if (!activeTenantId)");
    // The unavailable branch must precede the query, not follow it.
    expect(adapter.indexOf("if (!activeTenantId)")).toBeLessThan(adapter.indexOf(".from(\"tenant_products\")"));
  });

  it("scopes every table read to the resolved tenant", () => {
    // Counted rather than hard-coded: every `.from(...)` in this adapter must carry exactly one
    // tenant scope, so adding a read without scoping it turns this red no matter how many exist.
    const reads = adapter.match(/\.from\("/g) ?? [];
    const scopes = adapter.match(/\.eq\("tenant_id", activeTenantId\)/g) ?? [];
    expect(reads.length).toBeGreaterThan(0);
    expect(scopes).toHaveLength(reads.length);
    // No caller-supplied tenant, and no service-role escape hatch on a browser read.
    expect(adapter).not.toMatch(/service_role|SERVICE_ROLE/);
  });

  it("survives the migration not being applied yet, rather than erroring for every tenant", () => {
    expect(adapter).toContain("isMissingColumn");
    expect(adapter).toContain('error?.code === "42703"');
    expect(adapter).toContain("const BASE =");
  });

  it("asks the authority question about this workspace, never a global role", () => {
    expect(adapter).toContain("tenant_members");
    expect(adapter).not.toMatch(/has_any_role|user_roles/);
  });

  it("narrows an unrecognised classification rather than guessing a neighbour", () => {
    expect(adapter).toContain("function narrow<");
    // The status fallback is asserted BEHAVIOURALLY in useCatalogOffers.adapter.test.tsx, which
    // executes the adapter. This line used to pin the literal `?? "draft"` — so when that coercion
    // was replaced by an honest "unrecognised", the test failed for describing the old code rather
    // than for catching a defect. A grep for a source string is not a claim about behaviour.
    expect(adapter).toContain("narrow(row.status, AVAILABILITIES)");
  });
});

describe("Catalog Offers — the harness itself", () => {
  it("leaves no orphan tree behind when a test renders more than once", () => {
    // The guard on the guards. Without this, an assertion that reads `document.body` can pass
    // because an EARLIER render is still in the document.
    setCampaigns();
    setOffers({ offers: [offer({ name: "Sentinel Offer" })] });
    renderAt("/solo/4471/growth/catalog");
    renderAt("/solo/4471/growth/catalog");
    const hits = (document.body.textContent ?? "").split("Sentinel Offer").length - 1;
    expect(hits).toBe(1);
  });
});

describe("Catalog Offers — truthfulness", () => {
  it("invents no commerce data the platform does not hold", () => {
    for (const banned of [/\brevenue\b/i, /\bconversion\b/i, /in stock/i, /stock count/i, /\bratings?\b/i, /units sold/i]) {
      expect(surface).not.toMatch(banned);
    }
  });

  it("never renders a zero for an unrecorded amount", () => {
    // Asserted on the RENDER, not the source. The previous version grepped the file for "$0",
    // which proved nothing: `money(0)` built that string at runtime and the literal never
    // appeared in the source. An adversarial review of the pushed diff caught it.
    setCampaigns();
    setOffers({ offers: [offer({ pricePresentation: "fixed", prices: [] })] });
    renderAt("/solo/4471/growth/catalog");
    const cell = host.querySelector(".co-price") as HTMLElement;
    expect(cell.textContent).not.toMatch(/\$0\b/);
    expect(cell.textContent).toContain("—");
  });

  it("renders a RECORDED zero as Free, because that is a real answer", () => {
    setCampaigns();
    setOffers({ offers: [offer({ pricePresentation: "fixed", prices: [{ id: "p0", nickname: null, unitAmount: 0, currency: "usd", billingInterval: "one_time", kind: "one_time", installmentsTotal: null, active: true }] })] });
    renderAt("/solo/4471/growth/catalog");
    const cell = host.querySelector(".co-price") as HTMLElement;
    expect(cell.textContent).toContain("Free");
    expect(cell.textContent).not.toMatch(/\$0\b/);
  });

  it("shows an instalment plan as its arithmetic, never as the per-instalment figure alone", () => {
    setCampaigns();
    setOffers({ offers: [offer({ pricePresentation: "fixed", prices: [{ id: "pi", nickname: "Plan", unitAmount: 50000, currency: "usd", billingInterval: "month", kind: "installment", installmentsTotal: 6, active: true }] })] });
    renderAt("/solo/4471/growth/catalog");
    const cell = host.querySelector(".co-price") as HTMLElement;
    expect(cell.textContent).toContain("$500 × 6");
    expect(cell.textContent).toContain("Instalment plan");
    expect(cell.textContent).not.toContain("Fixed amount");
  });

  it("shows a recurring plan per period, never as a flat one-off price", () => {
    // The BLOCKER an independent review of the pushed diff caught. The instalment fix guarded on
    // `kind === "installment"` alone, so the OTHER per-period kind — and the one the shipped
    // writer actually produces — fell through and rendered a $99/month retainer as a one-off
    // "$99 · Fixed amount", disagreeing with this offer's own detail drawer.
    setCampaigns();
    setOffers({ offers: [offer({ pricePresentation: "fixed", prices: [{ id: "pr", nickname: "Monthly", unitAmount: 9900, currency: "usd", billingInterval: "month", kind: "recurring", installmentsTotal: null, active: true }] })] });
    renderAt("/solo/4471/growth/catalog");
    const cell = host.querySelector(".co-price") as HTMLElement;
    expect(cell.textContent).toContain("$99 / month");
    expect(cell.textContent).toContain("Recurring plan");
    expect(cell.textContent).not.toContain("Fixed amount");
  });

  // The residual half of the same defect, found by a second review of the pushed fix: the first
  // pass keyed the per-period branch on `billingInterval` ALONE and ignored `kind`, so four shapes
  // still misreported. `tenant-product-upsert` does no cross-field validation, so every one of
  // these is writable through the callable seam even though StorefrontPanel cannot produce it.
  const plan = (over) => ({ id: "px", nickname: "P", unitAmount: 9900, currency: "usd",
    billingInterval: "month", kind: "recurring", installmentsTotal: null, active: true, ...over });
  const priceTextFor = (over) => {
    setCampaigns();
    setOffers({ offers: [offer({ pricePresentation: "fixed", prices: [plan(over)] })] });
    renderAt("/solo/4471/growth/catalog");
    return (host.querySelector(".co-price") as HTMLElement).textContent ?? "";
  };

  it("never calls any recorded plan shape a fixed amount when it is not one", () => {
    for (const over of [
      { kind: "recurring", billingInterval: null },
      { kind: "recurring", billingInterval: "one_time" },
      { kind: "deposit", billingInterval: "month" },
      { kind: "one_time", billingInterval: "month" },
      // The NO-INTERVAL cases, which this loop should have carried from the start. Their absence
      // is why the same defect survived three fixes. K5 is live today: StorefrontPanel sends
      // billing_interval "one_time" for every non-recurring kind, so a deposit-only product
      // reaches exactly this row and used to render "$500 · Fixed amount".
      { kind: "deposit", billingInterval: null },
      { kind: "deposit", billingInterval: "one_time" },
      { kind: null, billingInterval: null },
      { kind: null, billingInterval: "one_time" },
    ]) {
      expect(priceTextFor(over), JSON.stringify(over)).not.toContain("Fixed amount");
    }
  });

  it("says a recurring plan is recurring even when its period was never recorded", () => {
    expect(priceTextFor({ kind: "recurring", billingInterval: null }))
      .toContain("period not recorded");
  });

  it("names the recorded kind rather than the branch that rendered it", () => {
    // A deposit that carries an interval is a contradictory row. Reporting both recorded facts is
    // honest; calling it a "Recurring plan" swaps one false statement for another.
    const deposit = priceTextFor({ kind: "deposit", billingInterval: "month", unitAmount: 50000 });
    expect(deposit).toContain("$500 / month");
    expect(deposit).toContain("Deposit");
    expect(deposit).not.toContain("Recurring plan");
  });

  it("a kind the surface has no label for still never prints a fixed amount over a period", () => {
    // `PLAN_KIND` is a map; `tenant_prices_kind_check` is a DB CHECK. Today they agree, so no
    // stored row can reach this. They agree only as long as someone keeps them in sync — add a
    // fifth kind to the constraint without the map and a null note drops through to the
    // presentation fallback, printing "Fixed amount" beneath "$99 / month". This asserts the
    // INVARIANT (a qualified figure suppresses the presentation label) rather than the map.
    const text = priceTextFor({ kind: "metered", billingInterval: "month" });
    expect(text).toContain("$99 / month");
    expect(text).not.toContain("Fixed amount");
  });

  it("says a plan type it cannot read is unread, rather than saying nothing", () => {
    const text = priceTextFor({ kind: "metered", billingInterval: "month" });
    expect(text).toContain("$99 / month");
    expect(text).toContain("Plan type not recognised");
    expect(text).not.toContain("Fixed amount");
  });

  it("does not let a second plan erase that the first one is per-period", () => {
    // K13 from the final review: `note: several ? "Several plans recorded" : qualified.note` let
    // the branch override the record. A recurring plan with no recorded period, beside any second
    // plan, rendered "From $99 · Several plans recorded" — nothing saying it is per-period at all.
    setCampaigns();
    setOffers({ offers: [offer({ pricePresentation: "fixed", prices: [
      { id: "pr", nickname: "Monthly", unitAmount: 9900, currency: "usd", billingInterval: null, kind: "recurring", installmentsTotal: null, active: true },
      { id: "po", nickname: "Full", unitAmount: 240000, currency: "usd", billingInterval: "one_time", kind: "one_time", installmentsTotal: null, active: true },
    ] })] });
    renderAt("/solo/4471/growth/catalog");
    const cell = host.querySelector(".co-price") as HTMLElement;
    expect(cell.textContent).toContain("period not recorded");
    expect(cell.textContent).not.toContain("Fixed amount");
  });

  it("still says a deposit is a deposit when it is the floor of several plans", () => {
    setCampaigns();
    setOffers({ offers: [offer({ pricePresentation: "fixed", prices: [
      { id: "pd", nickname: "Deposit", unitAmount: 50000, currency: "usd", billingInterval: "one_time", kind: "deposit", installmentsTotal: null, active: true },
      { id: "pf", nickname: "Full", unitAmount: 240000, currency: "usd", billingInterval: "one_time", kind: "one_time", installmentsTotal: null, active: true },
    ] })] });
    renderAt("/solo/4471/growth/catalog");
    const cell = host.querySelector(".co-price") as HTMLElement;
    expect(cell.textContent).toContain("From $500");
    expect(cell.textContent).toContain("Deposit");
    expect(cell.textContent).not.toContain("Fixed amount");
  });

  it("still calls a plain one-off exactly what the tenant said it is", () => {
    // The one case that MUST keep falling through to the presentation label: a recognised
    // one-off with no period really is a single fixed amount, and "Fixed amount" is the
    // tenant's own recorded choice about how to show it.
    setCampaigns();
    setOffers({ offers: [offer({ pricePresentation: "fixed", prices: [
      { id: "p1", nickname: null, unitAmount: 240000, currency: "usd", billingInterval: "one_time", kind: "one_time", installmentsTotal: null, active: true },
    ] })] });
    renderAt("/solo/4471/growth/catalog");
    const cell = host.querySelector(".co-price") as HTMLElement;
    expect(cell.textContent).toContain("$2,400");
    expect(cell.textContent).toContain("Fixed amount");
  });

  it("never prints a backend enum token in the detail drawer", () => {
    // The drawer's plan line was `plan.nickname || plan.kind || "Plan"`, so a plan with no
    // nickname showed a tenant the raw column value — "recurring — $99 / month" (§11) — and an
    // unreadable kind showed a generic "Plan" while the ROW correctly said it could not be read.
    // Both are the drawer disagreeing with its own row about the same record.
    setCampaigns();
    setOffers({ offers: [offer({ prices: [
      { id: "p1", nickname: null, unitAmount: 9900, currency: "usd", billingInterval: "month", kind: "recurring", installmentsTotal: null, active: true },
      { id: "p2", nickname: null, unitAmount: 9900, currency: "usd", billingInterval: "month", kind: null, installmentsTotal: null, active: true },
    ] })] });
    renderAt("/solo/4471/growth/catalog");
    act(() => (host.querySelector("button.co-row") as HTMLElement).click());
    // Scoped to `host`, not `document.body`: the drawer does NOT portal — it renders inside the
    // tree this test just made — and reading the whole document would let a leftover satisfy it.
    const shown = host.textContent ?? "";
    expect(shown).toContain("Recurring plan — $99 / month");
    expect(shown).not.toContain("recurring — $99");
    expect(shown).toContain("Plan type not recognised — $99 / month");
  });

  it("keeps the period when a recurring plan is only the floor of several", () => {
    setCampaigns();
    setOffers({ offers: [offer({ pricePresentation: "fixed", prices: [
      { id: "pr", nickname: "Monthly", unitAmount: 9900, currency: "usd", billingInterval: "month", kind: "recurring", installmentsTotal: null, active: true },
      { id: "py", nickname: "Yearly", unitAmount: 99000, currency: "usd", billingInterval: "year", kind: "recurring", installmentsTotal: null, active: true },
    ] })] });
    renderAt("/solo/4471/growth/catalog");
    const cell = host.querySelector(".co-price") as HTMLElement;
    // A floor that drops the period would read "From $99" for a monthly plan — the same lie.
    expect(cell.textContent).toContain("From $99 / month");
    // The sub-label is the RECORD's, not the branch's. "Several plans recorded" used to win here
    // and that is exactly what erased the per-period fact on the sibling case below; the `From `
    // prefix already carries that there is more than one plan. It still labels an UNqualified
    // multi-plan price, where nothing else conveys it.
    expect(cell.textContent).toContain("Recurring plan");
  });

  it("does not call several recorded plans one fixed amount", () => {
    setCampaigns();
    setOffers({ offers: [offer({ pricePresentation: "fixed", prices: [
      { id: "p1", nickname: "Deposit", unitAmount: 50000, currency: "usd", billingInterval: "one_time", kind: "deposit", installmentsTotal: null, active: true },
      { id: "p2", nickname: "Full", unitAmount: 300000, currency: "usd", billingInterval: "one_time", kind: "one_time", installmentsTotal: null, active: true },
    ] })] });
    renderAt("/solo/4471/growth/catalog");
    const cell = host.querySelector(".co-price") as HTMLElement;
    expect(cell.textContent).toContain("From $500");
    // The lead is a DEPOSIT, so the note names that rather than "Several plans recorded" — the
    // more useful of the two facts, and the `From ` prefix already carries the other. The
    // "several" label survives for a lead that has nothing of its own to say; see below.
    expect(cell.textContent).toContain("Deposit");
    expect(cell.textContent).not.toContain("Fixed amount");
  });

  it("still says several plans when the lead has nothing of its own to say", () => {
    // Two plain one-offs: neither is per-period, neither is a deposit, so no record-derived note
    // exists and the count is the only thing worth printing. This keeps that label from becoming
    // dead code now that a qualified lead's own note wins.
    setCampaigns();
    setOffers({ offers: [offer({ pricePresentation: "fixed", prices: [
      { id: "pa", nickname: "A", unitAmount: 50000, currency: "usd", billingInterval: "one_time", kind: "one_time", installmentsTotal: null, active: true },
      { id: "pb", nickname: "B", unitAmount: 300000, currency: "usd", billingInterval: "one_time", kind: "one_time", installmentsTotal: null, active: true },
    ] })] });
    renderAt("/solo/4471/growth/catalog");
    const cell = host.querySelector(".co-price") as HTMLElement;
    expect(cell.textContent).toContain("From $500");
    expect(cell.textContent).toContain("Several plans recorded");
    expect(cell.textContent).not.toContain("Fixed amount");
  });

  it("does not hide the price and the conflict sentence from a screen reader", () => {
    // An `aria-label` REPLACES an element's contents for name computation. Naming the row
    // "{name} — {state}" made the price and the entire derived-conflict sentence — this
    // surface's honesty device — inaudible. Caught by an independent review of the pushed diff.
    setCampaigns();
    setOffers({ offers: [offer({ availability: "active", pricePresentation: "fixed", prices: [] })] });
    renderAt("/solo/4471/growth/catalog");
    const row = host.querySelector("button.co-row") as HTMLElement;
    expect(row.getAttribute("aria-label")).toBeNull();
    // With no label overriding them, the contents form the name.
    expect(row.textContent).toContain("no amount is recorded against it");
    expect(row.textContent).toContain("—");
    expect(row.textContent).toContain("Active");
  });

  it("still explains a pending deployment when the workspace has no offers yet", () => {
    // On production `tenant_products` holds zero rows, so EVERY tenant renders the empty state.
    // Both record-notices sat below that return, which made the deploy-order explanation — the one
    // that says why a field you filled in reads "Not stated" — unreachable for every single tenant.
    setCampaigns();
    setOffers({ offers: [], fieldsUnavailable: true });
    renderAt("/solo/4471/growth/catalog");
    expect(host.textContent).toContain("not available on this deployment yet");
  });

  it("still says an unread permission is unread when the workspace has no offers yet", () => {
    setCampaigns();
    setOffers({ offers: [], canManage: false, authorityUnknown: true });
    renderAt("/solo/4471/growth/catalog");
    expect(host.textContent).toContain("could not be read just now");
    expect(host.textContent).not.toContain("cannot change it");
  });

  it("says the kind is not stated rather than guessing one", () => {
    setCampaigns();
    setOffers({ offers: [offer({ kind: null })] });
    renderAt("/solo/4471/growth/catalog");
    expect(host.querySelector(".co-kind")?.getAttribute("data-kind")).toBe("unstated");
  });

  it("states the not-a-checkout boundary on the surface itself", () => {
    expect(surface).toContain("nothing on this surface charges anybody");
  });

  it("distinguishes an unreadable permission from a denied one", () => {
    setCampaigns();
    setOffers({ canManage: false, authorityUnknown: true });
    renderAt("/solo/4471/growth/catalog");
    expect(host.textContent).toContain("could not be read just now");
    expect(host.textContent).not.toContain("You can see this catalog but not change it");
  });

  it("says so when the offer columns are not on this deployment yet", () => {
    setCampaigns();
    setOffers({ fieldsUnavailable: true });
    renderAt("/solo/4471/growth/catalog");
    expect(host.textContent).toContain("not available on this deployment yet");
  });

  it("returns a retired address to the Vibe-owned half, not to an empty offer list", () => {
    setCampaigns(); setOffers({ offers: [] });
    renderAt("/solo/4471/growth/pages");
    expect(host.textContent).toContain("This address moved");
    const back = [...host.querySelectorAll("button")].find((b) => b.textContent === "Return to Catalog");
    act(() => { back?.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
    expect(host.textContent).toContain("Read-only published outputs owned by Vibe Studio.");
    expect(host.textContent).not.toContain("Nothing is listed yet");
  });

  it("only reports a derived conflict for an offer that claims to be sellable", () => {
    expect(surface).toContain('if (offer.availability !== "active") return null;');
  });
});

describe("Catalog Offers — the migration is additive", () => {
  it("adds nullable columns and rewrites no existing value", () => {
    expect(migration).toContain("add column if not exists");
    expect(migration).not.toMatch(/^\s*update\s+public\.tenant_products/im);
    expect(migration).not.toMatch(/drop column/i);
    expect(migration).not.toMatch(/not null default/i);
  });

  it("widens status to carry paused without dropping an existing state", () => {
    expect(migration).toContain("check (status in ('draft', 'active', 'paused', 'archived'))");
  });

  it("adds no inventory, cart, tax or checkout primitive", () => {
    for (const banned of [/create table/i, /\bstock\b/i, /\bvariant/i, /\bcart\b/i, /\btax_/i, /shipping/i]) {
      expect(migration).not.toMatch(banned);
    }
  });
});

describe("Catalog Offers — rendered flows", () => {
  it("opens on Offers, and keeps the approved six tabs", () => {
    setCampaigns(); setOffers();
    renderAt("/solo/4471/growth/catalog");
    const tabs = [...host.querySelectorAll('.campaigns-tabs button')].map((b) => b.textContent?.trim());
    expect(tabs).toEqual(["Overview", "Catalog", "Sales", "Pipeline", "Social", "Performance"]);
    expect(host.textContent).toContain("Foundations Coaching Program");
    expect(host.textContent).toContain("What this business sells");
  });

  it("shows first use rather than an empty table when nothing is defined", () => {
    setCampaigns(); setOffers({ offers: [] });
    renderAt("/solo/4471/growth/catalog");
    expect(host.textContent).toContain("Nothing is listed yet");
    expect(host.textContent).toContain("Adding and editing offers arrives on this screen in the next release");
  });

  it("names the missing fact when an active offer has no amount recorded", () => {
    setCampaigns();
    setOffers({ offers: [offer({ prices: [] })] });
    renderAt("/solo/4471/growth/catalog");
    expect(host.textContent).toContain("no amount is recorded against it");
  });

  it("says how the price is shown when the tenant chose not to show one", () => {
    setCampaigns();
    setOffers({ offers: [offer({ pricePresentation: "contact", prices: [] })] });
    renderAt("/solo/4471/growth/catalog");
    expect(host.textContent).toContain("Contact for pricing");
    expect(host.textContent).not.toContain("no amount is recorded against it");
  });

  it("never prints the price label twice when the label IS the price", () => {
    setCampaigns();
    setOffers({ offers: [offer({ pricePresentation: "contact", prices: [] })] });
    renderAt("/solo/4471/growth/catalog");
    const row = host.querySelector(".co-price") as HTMLElement;
    expect(row.textContent).toBe("Contact for pricing");
  });

  it("keeps the label when it genuinely adds to the amount", () => {
    setCampaigns();
    setOffers({ offers: [offer({ pricePresentation: "from" })] });
    renderAt("/solo/4471/growth/catalog");
    const row = host.querySelector(".co-price") as HTMLElement;
    expect(row.textContent).toContain("From $2,400");
    expect(row.textContent).toContain("Starting at");
  });

  it("tells a member they cannot change the catalog", () => {
    setCampaigns(); setOffers({ canManage: false });
    renderAt("/solo/4471/growth/catalog");
    expect(host.textContent).toContain("You can see this catalog but not change it");
  });

  it("offers a retry and changes nothing when the read fails", () => {
    const retry = vi.fn();
    setCampaigns(); setOffers({ phase: "error", offers: [], retry });
    renderAt("/solo/4471/growth/catalog");
    expect(host.textContent).toContain("Offers could not load");
    expect(host.textContent).toContain("Your records were not changed");
    const button = [...host.querySelectorAll("button")].find((b) => b.textContent?.includes("Retry"));
    act(() => { button?.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it("reads no tenant data until the account context resolves", () => {
    setCampaigns(); setOffers({ phase: "resolving", offers: [] });
    renderAt("/solo/4471/growth/catalog");
    expect(host.textContent).toContain("Resolving this account");
    expect(host.textContent).not.toContain("Foundations Coaching Program");
  });

  it("preserves the Vibe-owned half, and lands legacy addresses on it", () => {
    setCampaigns(); setOffers();
    renderAt("/solo/4471/growth/catalog?type=form");
    expect(host.textContent).toContain("Read-only published outputs owned by Vibe Studio.");
    expect(host.textContent).toContain("Published form");
    // The Vibe half must not be reframed as an offer.
    expect(host.textContent).not.toContain("What this business sells");
  });

  it("switches between the two concepts without leaving the tab", () => {
    setCampaigns(); setOffers();
    renderAt("/solo/4471/growth/catalog");
    const toAssets = [...host.querySelectorAll("button")].find((b) => b.textContent === "Published assets");
    act(() => { toAssets?.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
    expect(host.textContent).toContain("Read-only published outputs owned by Vibe Studio.");
    const toOffers = [...host.querySelectorAll("button")].find((b) => b.textContent === "Offers");
    act(() => { toOffers?.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
    expect(host.textContent).toContain("Foundations Coaching Program");
  });
});
