// @ts-nocheck
// Campaigns → Sales — the workspace's SALES OPERATIONS surface.
//
// ─── WHAT THIS TAB IS FOR, AND THE BOUNDARY IT SITS ON ───────────────────────────────────────
//
// Settings → Billing is what this workspace pays PAIGE. This tab is the other direction of money
// entirely: what the workspace charges its OWN clients. §38 draws the line and it is absolute —
// PAIGE is never merchant of record for a tenant→client charge, so nothing on this surface
// collects, holds, schedules, or routes money. It records; the money leg runs on the workspace's
// own processor.
//
// Two functions in this repo DO move money and are deliberately never imported here:
// `tenant-checkout-session` (destination charges on Paige's platform account — the live §38
// violation recorded against #458) and `tenant-stripe-connect` (mints a real Stripe Express
// account). Both create external provider state. Everything on this surface is a database record.
//
// ─── CATALOG OWNS THE OFFER. THIS TAB MAKES IT OPERATIONAL. ──────────────────────────────────
//
// There is exactly ONE offer record — `tenant_products`, read through `useCatalogOffers` and
// written through `save_solo_offer`. Sales does not keep a second catalog, a Sales-only SKU, a
// shadow price, or its own offer id (§18). The quick-create below calls the SAME rpc the Catalog
// editor calls and hands the result straight back to Catalog for the full setup. If this file ever
// grows a `products` array of its own, that is the bug.
//
// ─── WHY THE FIGURES ARE SO SPARSE ───────────────────────────────────────────────────────────
//
// Every number here is a count of rows that exist, and nothing is summed into revenue, forecast,
// or campaign attribution. `tenant_orders` is the only monetary record a Solo workspace has today,
// and an order does not name a campaign — `utm_campaign` lives on `analytics_events` and
// `referral_clicks`, never on the order — so send → click → order does not join. Attribution
// therefore is not shown at all, rather than shown badly (§13).
import React from "react";
import { Ic } from "./_shared";
import { useCatalogOffers } from "./useCatalogOffers";
import { money, minorUnitDigits } from "./catalog-offers";
import {
  useSoloSalesOps,
  DECLARED_PROCESSORS,
  DECLARED_METHODS,
} from "./useSoloSalesOps";
import { useSoloAgreements } from "./useSoloAgreements";
import "./sales-ops.css";
import { SalesDialogPortal, useSalesDraftExit } from "./sales-dialog";
import { useLocation, useNavigate } from "react-router-dom";
import { deriveSalesCommand } from "./sales/deriveSalesCommand";
import { deriveScenario } from "./sales/salesScenario";

/**
 * The five shapes a Solo business can sell on. Deliberately not narrower: the owner's instruction
 * was not to artificially restrict what a business can sell, and `custom_quote` is what stops a
 * bespoke arrangement having to pretend to be one of the other four.
 */
const TERM_LABEL = {
  one_time: "One-off",
  recurring: "Recurring",
  installment: "In instalments",
  deposit: "Deposit",
  custom_quote: "Custom",
};

const CADENCE_LABEL = {
  one_time: "once",
  day: "daily",
  week: "weekly",
  month: "monthly",
  year: "yearly",
};

/**
 * Five states and a sixth READING. There is no `paid`, `invoiced` or `delivered`, because this
 * record can observe none of them — it holds what was agreed, never what happened afterwards.
 */
const AGREEMENT_STATE = {
  draft: { label: "Draft", tone: "opportunity" },
  active: { label: "Active", tone: "ok" },
  paused: { label: "Paused", tone: "warn" },
  completed: { label: "Completed", tone: "n" },
  cancelled: { label: "Cancelled", tone: "n" },
  unrecognised: { label: "Not readable", tone: "n" },
};

/** The workspace's own words for each declared processor. Stripe is one of seven, never the assumed one. */
const PROCESSOR_LABEL = {
  stripe: "Stripe",
  paypal: "PayPal",
  square: "Square",
  bank_merchant: "A bank merchant account",
  quickbooks_payments: "QuickBooks Payments",
  manual: "Invoiced and paid manually",
  not_yet: "Nothing yet",
};

const METHOD_LABEL = {
  cards: "Cards",
  ach: "ACH",
  zelle: "Zelle",
  wire: "Wire",
  check: "Check",
  cash: "Cash",
  bank_transfer: "Bank transfer",
  crypto: "Crypto",
  other: "Other",
};

const ORDER_STATUS = {
  pending: { label: "Awaiting payment", tone: "warn" },
  complete: { label: "Paid", tone: "ok" },
  failed: { label: "Payment failed", tone: "bad" },
  refunded: { label: "Refunded", tone: "bad" },
  cancelled: { label: "Cancelled", tone: "none" },
  unrecognised: { label: "State not recognised", tone: "none" },
};

const OFFER_STATE = {
  draft: { label: "Draft", tone: "none" },
  active: { label: "Live", tone: "ok" },
  paused: { label: "Paused", tone: "warn" },
  archived: { label: "Archived", tone: "none" },
  unrecognised: { label: "State not recognised", tone: "none" },
};

const CADENCE = {
  one_time: "Once",
  day: "Daily",
  week: "Weekly",
  month: "Monthly",
  year: "Yearly",
};

function when(value, calendarDate = false) {
  if (!value) return "Not recorded";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Not recorded"
    : new Intl.DateTimeFormat(undefined, { dateStyle: "medium", ...(calendarDate ? { timeZone: "UTC" } : {}) }).format(date);
}

/**
 * The SHARED pill, not a local one. The first version of this file declared `.so-pill` with its own
 * height, size, tracking and ground — a fork of `solo-tokens.css`'s live `.pill`, whose three
 * tone→token mappings it copied exactly. The fork was not free: its darker ground took the neutral
 * tone from 4.50:1 to 3.79:1 in dark mode, below AA for text that small, on the readiness panel's
 * primary state signal. §11 says add to the layer rather than fork a one-off, and the layer already
 * had this.
 */
function Pill({ tone, children }) {
  const cls = tone === "ok" ? "pill pill-ok"
    : tone === "warn" ? "pill pill-warn"
    : tone === "bad" ? "pill pill-bad"
    : tone === "opportunity" ? "pill pill-v"
    : "pill pill-n";
  return <span className={cls}>{children}</span>;
}

/**
 * One readiness answer. `state` is what the record actually supports:
 *   ok      — recorded and usable
 *   warn    — recorded but incomplete, or something is waiting on a person
 *   none    — nothing recorded yet; this is a normal first-use answer, not a failure
 *   unknown — could not be read. NEVER collapsed into `none`: "you have none" and "I could not
 *             look" are different sentences and only one of them is the person's fault.
 */
function ReadyRow({ state, label, detail, action, word: override }) {
  // `unknown` covers two different absences and they need different words. "Not readable" is true
  // when a READ failed or authority forbade it; it is a lie for a row that never queried anything,
  // which is why the agreements row passes its own word. Asserting a failure that did not happen is
  // the same class of error as asserting a zero the record does not prove.
  const word = override ?? (state === "ok" ? "Ready"
    : state === "warn" ? "Needs you"
    : state === "unknown" ? "Not readable"
    : "Not set up");
  // `none` reads VIOLET, not grey. Grey says "dead"; a business that has not recorded its offers
  // yet has an opportunity in front of it, and §23 says the colour carries that rather than a
  // neutral fill. `unknown` stays neutral — a thing we could not read is genuinely inert.
  const tone = state === "ok" ? "ok"
    : state === "warn" ? "warn"
    : state === "unknown" ? "none"
    : "opportunity";
  return (
    <div className="so-ready-row">
      <Pill tone={tone}>{word}</Pill>
      <span className="so-ready-text">
        <b>{label}</b>
        <small>{detail}</small>
      </span>
      <span className="so-ready-act">{action}</span>
    </div>
  );
}

/**
 * What makes `aria-modal="true"` true. Declaring it without enforcing it is a claim the DOM does
 * not honour: Tab walks straight out of the panel into the page behind the scrim, and on close the
 * focus lands wherever the browser decides. `DetailDrawer` in `growth2.tsx` already implements all
 * three parts; this is the same contract for the two editors on this surface, not a second
 * invention of it.
 *
 * Returns the ref to put on the panel. It takes NO arguments on purpose: Escape stays with the
 * caller, because only the caller knows whether a save is in flight and must not be interrupted.
 * The first version declared `(onClose, busy)` and used neither — parameters that read as though
 * this hook handles dismissal when it does not.
 */
function useModalDialog() {
  const panelRef = React.useRef(null);
  React.useEffect(() => {
    const previous = document.activeElement;
    // Everything the shell already rendered goes inert, so a screen reader's virtual cursor and
    // Tab both stay inside the panel.
    const background = document.querySelectorAll(
      ".solo-campaigns > .campaigns-nav, .solo-campaigns > .campaigns-scroll",
    );
    background.forEach((node) => node.setAttribute("inert", ""));

    const onKeyDown = (event) => {
      if (event.defaultPrevented || event.key !== "Tab") return;
      const focusable = [...(panelRef.current?.querySelectorAll(
        'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ) ?? [])];
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      background.forEach((node) => node.removeAttribute("inert"));
      // Focus goes back to whatever opened this, so the keyboard does not restart at the top.
      if (previous instanceof HTMLElement && previous.isConnected) previous.focus({ preventScroll: true });
    };
  }, []);
  return panelRef;
}

/**
 * How this business takes money from its clients. A DECLARATION, not a connection — the editor says
 * so in those words, because a control labelled "connect" that only writes a database column is the
 * exact over-claim §13 exists to stop. Recording "Square" here is exactly as complete as recording
 * "Stripe": the surface is processor-agnostic by construction (§38), and PAIGE never touches the
 * account either way.
 */
function PaymentEditor({ data, onClose }) {
  const [processor, setProcessor] = React.useState(data.processor || "");
  const [methods, setMethods] = React.useState([...data.methods]);
  const [busy, setBusy] = React.useState(false);
  const [notice, setNotice] = React.useState(null);
  const firstRef = React.useRef(null);
  const panelRef = useModalDialog();

  React.useEffect(() => { firstRef.current?.focus(); }, []);
  const { close, confirmation, alive } = useSalesDraftExit({ processor, methods: [...methods].sort() }, busy, onClose);

  const toggle = (method) => setMethods((current) =>
    current.includes(method) ? current.filter((m) => m !== method) : [...current, method]);

  const save = async () => {
    setBusy(true);
    setNotice(null);
    const outcome = await data.declarePaymentHandling(processor, methods).catch(() => ({ ok: false, message: "We could not confirm the save. Check your connection and try again." }));
    if (!alive.current) return;
    setBusy(false);
    if (outcome.ok) { onClose(); return; }
    // The form STAYS OPEN on a refusal. Closing it would discard the answer on top of telling
    // someone it did not save.
    setNotice(outcome.message || "That could not be saved. Nothing was changed.");
  };

  return (
    <SalesDialogPortal>
      <button className="so-editor-scrim" tabIndex={-1} aria-label="Close" onClick={close} />
      <aside ref={panelRef} className="so-editor" role="dialog" aria-modal="true" aria-labelledby="so-pay-title">
        <header className="so-editor-head">
          <div style={{ flex: 1 }}>
            <h2 id="so-pay-title">How your clients pay you</h2>
            <p>
              This records how money reaches your business. It does not connect an account, move
              money, or give Paige access to your processor. Paige is not merchant of record. What you pay Paige belongs in Settings → Billing.
            </p>
          </div>
          <button className="btn btn-s" onClick={close} disabled={busy} aria-label="Close">
            <Ic.x size={14} />
          </button>
        </header>

        <div className="so-editor-body" inert={busy ? "" : undefined}>
          <fieldset className="so-field">
            <legend>Processor</legend>
            <div className="so-pick">
              {DECLARED_PROCESSORS.map((key, index) => (
                <button
                  key={key}
                  type="button"
                  ref={index === 0 ? firstRef : undefined}
                  aria-pressed={processor === key}
                  onClick={() => setProcessor(key)}
                >{PROCESSOR_LABEL[key]}</button>
              ))}
            </div>
          </fieldset>

          <fieldset className="so-field">
            <legend>Methods you accept</legend>
            <div className="so-pick">
              {DECLARED_METHODS.map((key) => (
                <button
                  key={key}
                  type="button"
                  aria-pressed={methods.includes(key)}
                  onClick={() => toggle(key)}
                >{METHOD_LABEL[key]}</button>
              ))}
            </div>
          </fieldset>
        </div>

        <footer className="so-editor-foot">
          <span role={notice ? "alert" : "status"} className="so-editor-note" data-tone={notice ? "bad" : "plain"}>
            {notice || (processor
              ? "Records your payment handling. No processor is connected."
              : "Choose a processor, or say Nothing yet — both are real answers.")}
          </span>
          <span style={{ flex: 1 }} />
          <button className="btn btn-s" onClick={close} disabled={busy}>Cancel</button>
          <button className="btn btn-s btn-p" onClick={save} disabled={busy || !processor}>
            {busy ? "Saving…" : "Save"}
          </button>
        </footer>
        {confirmation}
      </aside>
    </SalesDialogPortal>
  );
}

/**
 * Quick offer creation. It collects only enough to make a VALID CANONICAL DRAFT and then hands the
 * person to Catalog for everything else — variants, inventory, fulfilment, rich copy, campaign
 * positioning. It calls `save_solo_offer`, the same rpc the Catalog editor calls, so exactly one
 * offer record exists and it carries one id, one price and one status (§18).
 *
 * Cancelling creates nothing. There is no draft row written on open and none to clean up.
 */
function QuickOffer({ offers, tenantId, onClose, onCreated }) {
  const [name, setName] = React.useState("");
  const [kind, setKind] = React.useState("");
  const [amount, setAmount] = React.useState("");
  const [currency, setCurrency] = React.useState("usd");
  const [interval, setInterval] = React.useState("");
  const [shape, setShape] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [notice, setNotice] = React.useState(null);
  const nameRef = React.useRef(null);
  const panelRef = useModalDialog();

  React.useEffect(() => { nameRef.current?.focus(); }, []);
  const { close, confirmation, alive } = useSalesDraftExit({ name, kind, amount, currency, interval, shape }, busy, onClose);

  const named = name.trim().length > 0;

  const save = async () => {
    setBusy(true);
    setNotice(null);
    // Minor units, derived from the currency rather than a hardcoded 100 — a ¥500 offer typed as
    // 500 must not be stored as ¥50,000. The arithmetic lives in one place for exactly this reason.
    const major = amount.trim() ? Number(amount.trim()) : null;
    if (major !== null && (!Number.isFinite(major) || major < 0)) {
      setBusy(false);
      setNotice("That price could not be read, so nothing was saved.");
      return;
    }
    const digits = minorUnitDigits(currency);
    const outcome = await offers.saveOffer({
      id: null,
      // THE WORKSPACE THIS FORM WAS OPENED IN, and the reason this field is not optional.
      // `saveOffer` forwards it as `_expected_tenant_id`, and `runWrite` merges
      // `{ _expected_tenant_id: activeTenantId, ...args }` — so a draft that OMITS the key still
      // contributes `_expected_tenant_id: undefined`, which wins the spread and is then dropped
      // entirely by JSON.stringify. `save_solo_offer` declares that parameter with no DEFAULT and
      // its 14-argument overload was dropped in 20261111000000, so PostgREST resolves no function
      // and every create fails with the raw signature rendered into the footer. Captured on OPEN
      // rather than at save, so a workspace switch mid-edit is refused by the server instead of
      // silently saving into the workspace the person switched to.
      tenantId,
      name: name.trim(),
      summary: "",
      description: "",
      kind,
      deliveryShape: shape,
      pricePresentation: "",
      customerAction: "",
      category: "",
      priceAmount: major === null ? null : Math.round(major * 10 ** digits),
      priceCurrency: currency.trim() || "usd",
      priceInterval: interval,
      expectedUpdatedAt: null,
      priceId: null,
    }).catch(() => ({ ok: false }));
    if (!alive.current) return;
    setBusy(false);
    if (outcome.ok) {
      // The server reports what it actually did with the price. If it declined to write one, the
      // person is told here rather than discovering it in Catalog — silently not saving a price
      // somebody just typed is the same class of lie as inventing one.
      const note = outcome.result?.price_note;
      onCreated(outcome.result?.id ?? null, Boolean(note));
      return;
    }
    setNotice("We could not confirm the offer was saved. Check Catalog before retrying to avoid a duplicate.");
  };

  return (
    <SalesDialogPortal>
      <button className="so-editor-scrim" tabIndex={-1} aria-label="Close" onClick={close} />
      <aside ref={panelRef} className="so-editor" role="dialog" aria-modal="true" aria-labelledby="so-offer-title">
        <header className="so-editor-head">
          <div style={{ flex: 1 }}>
            <h2 id="so-offer-title">Quick offer</h2>
            <p>
              Enough to make it real. It saves as a draft in Catalog, where you can finish it —
              nothing is public until you publish it there.
            </p>
          </div>
          <button className="btn btn-s" onClick={close} disabled={busy} aria-label="Close">
            <Ic.x size={14} />
          </button>
        </header>

        <div className="so-editor-body" inert={busy ? "" : undefined}>
          <label className="so-field">
            <span>Name</span>
            <input ref={nameRef} value={name} onChange={(e) => setName(e.target.value)}
                   placeholder="What do you call it?" />
          </label>
          <fieldset className="so-field">
            <legend>Kind</legend>
            <div className="so-pick">
              {[["product", "Product"], ["service", "Service"]].map(([key, text]) => (
                <button key={key} type="button" aria-pressed={kind === key}
                        onClick={() => setKind(kind === key ? "" : key)}>{text}</button>
              ))}
            </div>
          </fieldset>
          <fieldset className="so-field">
            <legend>Delivered as</legend>
            <div className="so-pick">
              {[["digital", "A download"], ["physical", "A physical item"], ["appointment", "An appointment"],
                ["program", "A program"], ["membership", "A membership"], ["hybrid", "A mix"]].map(([key, text]) => (
                <button key={key} type="button" aria-pressed={shape === key}
                        onClick={() => setShape(shape === key ? "" : key)}>{text}</button>
              ))}
            </div>
          </fieldset>
          <label className="so-field">
            <span>Price</span>
            <div className="so-money">
              <input inputMode="decimal" value={amount} placeholder="Leave blank to decide later"
                     onChange={(e) => setAmount(e.target.value)} />
              <input value={currency} onChange={(e) => setCurrency(e.target.value)}
                     aria-label="Currency" style={{ maxWidth: "70px" }} placeholder="usd" />
            </div>
          </label>
          <fieldset className="so-field">
            <legend>Price cadence</legend>
            <div className="so-pick">
              {[["one_time", "Once"], ["week", "Weekly"], ["month", "Monthly"], ["year", "Yearly"]].map(([key, text]) => (
                <button key={key} type="button" aria-pressed={interval === key}
                        onClick={() => setInterval(interval === key ? "" : key)}>{text}</button>
              ))}
            </div>
          </fieldset>
        </div>

        <footer className="so-editor-foot">
          <span role={notice ? "alert" : "status"} className="so-editor-note" data-tone={notice ? "bad" : "plain"}>
            {notice || (named
              ? "Anything left blank stays unstated, and you can finish it in Catalog."
              : "A name is all this needs to save.")}
          </span>
          <span style={{ flex: 1 }} />
          <button className="btn btn-s" onClick={close} disabled={busy}>Cancel</button>
          <button className="btn btn-s btn-p" onClick={save} disabled={busy || !named}>
            {busy ? "Saving…" : "Create offer"}
          </button>
        </footer>
        {confirmation}
      </aside>
    </SalesDialogPortal>
  );
}

/**
 * What one client agreed to. The same right-side drawer the payment and offer editors use, for the
 * same reason: a focused task that must not lose the list behind it.
 *
 * WHAT IT SENDS, AND WHAT IT REFUSES TO SEND. It sends ids and terms. It never sends a catalog
 * amount — only `catalogPriceId` — because the server reads the list price off `tenant_prices`
 * itself, so the browser cannot forge what the catalog said. And it carries the workspace it was
 * OPENED against, not the current one: sending the current tenant would make the server's refusal
 * guard unable to fire, because the caller would keep agreeing with itself.
 */
function AgreementEditor({ agreements, offers, tenantId, existing, onClose, onOpenClients, onOpenCatalog }) {
  const panelRef = useModalDialog();
  const firstRef = React.useRef(null);
  const [contactId, setContactId] = React.useState(existing?.contactId ?? "");
  const [offerId, setOfferId] = React.useState(existing?.offerId ?? "");
  const [pickerSearch, setPickerSearch] = React.useState("");
  const [pickerPage, setPickerPage] = React.useState(0);
  const picker = useCatalogOffers({ search: pickerSearch, page: pickerPage, pageSize: 5, referenceIds: offerId ? [offerId] : [] });
  const pickerOffers = [...picker.offers, ...(picker.referencedOffers || [])].filter((offer, index, rows) => rows.findIndex((o) => o.id === offer.id) === index);
  const [term, setTerm] = React.useState(existing?.termKind ?? "one_time");
  const [basis, setBasis] = React.useState(existing?.priceBasis ?? "negotiated");
  const [planId, setPlanId] = React.useState("");
  const [amount, setAmount] = React.useState(() => {
    const minor = existing?.agreedAmountMinor;
    const currency = existing?.agreedCurrency || "usd";
    return typeof minor === "number" ? String(minor / 10 ** minorUnitDigits(currency)) : "";
  });
  const [currency, setCurrency] = React.useState(existing?.agreedCurrency ?? "usd");
  const [cadence, setCadence] = React.useState(existing?.billingInterval ?? "month");
  const [instalments, setInstalments] = React.useState(
    existing?.installmentsTotal ? String(existing.installmentsTotal) : "",
  );
  const [startsOn, setStartsOn] = React.useState(existing?.startsOn ?? "");
  const [renewsOn, setRenewsOn] = React.useState(existing?.renewsOn ?? "");
  const [endsOn, setEndsOn] = React.useState(existing?.endsOn ?? "");
  const [notes, setNotes] = React.useState(existing?.notes ?? "");
  const [busy, setBusy] = React.useState(false);
  const [notice, setNotice] = React.useState("");

  React.useEffect(() => { firstRef.current?.focus(); }, []);

  // The plans belonging to the chosen offer, from the canonical Catalog record the surface already
  // holds — never a second query, and never `leadPrice()`, whose "lowest active plan" is a display
  // floor. Writing against the DISPLAYED plan rather than the CHOSEN one is the exact defect
  // `save_solo_offer` had to add `_price_id` to fix.
  const chosenOffer = pickerOffers.find((o) => o.id === offerId) || null;
  const plans = (chosenOffer?.prices || []).filter((plan) => typeof plan.unitAmount === "number");
  // Changing the offer invalidates a plan chosen from the previous one, and a stale id would be
  // refused by the server ("that price is not a plan on this offer in this workspace").
  React.useEffect(() => { setPlanId(""); }, [offerId]);
  // "At your catalog price" is only offerable when there IS a catalog price to point at.
  React.useEffect(() => {
    if (!existing && picker.phase === "ready" && basis === "catalog" && plans.length === 0) setBasis("negotiated");
  }, [basis, plans.length, picker.phase]);

  const priced = amount.trim() !== "";
  // `quote_pending` is only legal on a CUSTOM arrangement — the server refuses it otherwise, and
  // the table's CHECK refuses it after that. Before this line the term defaulted to `one_time`
  // while `ready` ignored the term entirely, so choosing "Not quoted yet" from the empty state
  // enabled a Save that could only ever fail, two clicks in.
  const quoting = basis === "quote_pending";
  const ready = contactId !== "" && offerId !== "" && (Boolean(existing) || (picker.phase === "ready" && Boolean(chosenOffer)))
    && (quoting ? term === "custom_quote" : (basis === "catalog" ? (Boolean(existing) || planId !== "") : priced));
  const { close, request, confirmation, alive } = useSalesDraftExit({ contactId, offerId, term, basis, planId, amount, currency, cadence, instalments, startsOn, renewsOn, endsOn, notes }, busy, onClose);

  const save = async () => {
    setBusy(true);
    setNotice("");
    const digits = minorUnitDigits(currency);
    const major = basis === "negotiated" && priced ? Number(amount) : null;
    if (major !== null && (!Number.isFinite(major) || major < 0)) {
      setBusy(false);
      setNotice("Enter an amount of zero or more.");
      return;
    }
    if (term === "installment" && (!Number.isInteger(Number(instalments)) || Number(instalments) < 2)) { setBusy(false); setNotice("Enter a whole number of instalments, two or more."); return; }
    if ((endsOn && startsOn && endsOn < startsOn) || (term === "recurring" && renewsOn && startsOn && renewsOn < startsOn)) { setBusy(false); setNotice("End and renewal dates must be on or after the start date."); return; }
    const outcome = await agreements.saveAgreement({
      // THE WORKSPACE THIS FORM WAS OPENED IN. Not the current one — see the docstring.
      tenantId,
      id: existing?.id ?? null,
      contactId,
      offerId,
      termKind: term,
      priceBasis: basis,
      // An ID only — the server reads the list price off `tenant_prices` and takes the dated
      // snapshot itself, so the browser cannot forge what the catalog said.
      catalogPriceId: !existing && basis === "catalog" ? (planId || null) : null,
      // `10 ** minorUnitDigits(currency)`, never a hardcoded 100: JPY has no minor unit and KWD
      // has three, and a hardcoded exponent already shipped once as a real bug here.
      // On the catalog basis the server derives both from the plan, so sending a figure here would
      // be the browser stating what the catalog charged.
      agreedAmountMinor: quoting ? null : basis === "catalog" ? (existing?.agreedAmountMinor ?? null) : (major === null ? null : Math.round(major * 10 ** digits)),
      agreedCurrency: quoting ? null : basis === "catalog" ? (existing?.agreedCurrency ?? null) : (major === null ? null : (currency || "usd").trim().toLowerCase()),
      billingInterval: term === "recurring" ? cadence : null,
      intervalCount: term === "recurring" ? (existing?.intervalCount ?? 1) : null,
      installmentsTotal: term === "installment" && instalments.trim() !== ""
        ? Number(instalments)
        : null,
      paymentSchedule: existing?.paymentSchedule ?? null,
      startsOn: startsOn || null,
      // Only a recurring arrangement renews — the server says so in words before the CHECK can.
      renewsOn: term === "recurring" ? (renewsOn || null) : null,
      endsOn: endsOn || null,
      title: existing?.title ?? null,
      notes: notes.trim() || null,
      expectedUpdatedAt: existing?.updatedAt ?? null,
    }).catch(() => ({ ok: false, message: "We could not confirm the save. Refresh the records before retrying." }));
    if (!alive.current) return;
    setBusy(false);
    if (outcome.ok) { onClose(); return; }
    // A stale write is NOT a retry — retrying would overwrite whoever else saved. Say so.
    setNotice(outcome.stale
      ? "Someone else changed this while you had it open. Close and reopen it to see their version."
      : outcome.message || "That could not be saved. Nothing was changed.");
  };

  return (
    <SalesDialogPortal>
      <button className="so-editor-scrim" tabIndex={-1} aria-label="Close" onClick={close} />
      <aside ref={panelRef} className="so-editor" role="dialog" aria-modal="true" aria-labelledby="so-agr-title">
        <header className="so-editor-head">
          <div style={{ flex: 1 }}>
            <h2 id="so-agr-title">{existing ? "Change these terms" : "Record what a client agreed to"}</h2>
            <p>
              One client, one of your offers, and the terms they actually agreed to. This records
              them — it bills nobody, and the money still runs on your own processor.
            </p>
          </div>
          <button className="btn btn-s" onClick={close} disabled={busy} aria-label="Close">
            <Ic.x size={14} />
          </button>
        </header>

        <div className="so-editor-body" inert={busy ? "" : undefined}>
          {!agreements.clients.length && <div className="so-prerequisite"><strong>Add a client first</strong><p>Create a contact in Clients, then return here to record their terms.</p><button className="btn btn-p" onClick={() => request(onOpenClients)}>Go to Clients</button></div>}
          {!pickerSearch && !pickerPage && picker.phase === "ready" && !pickerOffers.length && <div className="so-prerequisite"><strong>Add an offer first</strong><p>Catalog keeps the canonical products and services you sell.</p><button className="btn btn-p" onClick={() => request(() => onOpenCatalog(true))}>Go to Catalog</button></div>}
          <label className="so-field">
            <span>Client</span>
            <select aria-label="Client" ref={firstRef} value={contactId} onChange={(e) => setContactId(e.target.value)}>
              <option value="">Choose a client…</option>
              {agreements.clients.map((client) => (
                <option key={client.id} value={client.id}>{client.name}</option>
              ))}
            </select>
          </label>

          <label className="so-field"><span>Search offers by name</span><input type="search" disabled={Boolean(existing?.catalogSnapshotAt)} value={pickerSearch} onChange={(e) => { setPickerSearch(e.target.value); setPickerPage(0); }} placeholder="Search your Catalog…" /></label>
          <div className="so-page-controls"><span role="status">{picker.phase === "ready" ? "Offer page " + (pickerPage + 1) : picker.phase === "error" ? "Could not load offers" : "Loading offers…"}</span>{picker.phase === "error" && <button className="btn btn-s" onClick={picker.retry}>Retry offers</button>}<button className="btn btn-s" disabled={!pickerPage || picker.phase !== "ready" || Boolean(existing?.catalogSnapshotAt)} onClick={() => setPickerPage((p) => p - 1)}>Previous</button><button className="btn btn-s" disabled={!picker.hasMore || picker.phase !== "ready" || Boolean(existing?.catalogSnapshotAt)} onClick={() => setPickerPage((p) => p + 1)}>Next</button></div>
          <label className="so-field">
            <span>Offer</span>
            <select aria-label="Offer" disabled={Boolean(existing?.catalogSnapshotAt)} value={offerId} onChange={(e) => setOfferId(e.target.value)}>
              <option value="">Choose one of your offers…</option>
              {pickerOffers.map((offer) => (
                <option key={offer.id} value={offer.id}>{offer.name}</option>
              ))}
            </select>
          </label>

          <fieldset className="so-field">
            <legend>Arrangement</legend>
            <div className="so-pick">
              {Object.entries(TERM_LABEL).map(([key, text]) => (
                <button key={key} type="button" aria-pressed={term === key}
                        onClick={() => setTerm(key)}>{text}</button>
              ))}
            </div>
          </fieldset>

          {term === "recurring" ? (
            <fieldset className="so-field">
              <legend>How often</legend>
              <div className="so-pick">
                {[["week", "Weekly"], ["month", "Monthly"], ["year", "Yearly"]].map(([key, text]) => (
                  <button key={key} type="button" aria-pressed={cadence === key}
                          onClick={() => setCadence(key)}>{text}</button>
                ))}
              </div>
            </fieldset>
          ) : null}

          {term === "installment" ? (
            <label className="so-field">
              <span>How many instalments</span>
              <input inputMode="numeric" value={instalments} placeholder="2 or more"
                     onChange={(e) => setInstalments(e.target.value)} />
            </label>
          ) : null}

          <label className="so-field">
            <span>What they agreed to pay</span>
            <div className="so-money">
              <input inputMode="decimal" value={quoting ? "" : basis === "catalog" ? (existing ? String(existing.agreedAmountMinor / 10 ** minorUnitDigits(existing.agreedCurrency)) : "") : amount}
                     placeholder={basis === "quote_pending" ? "Still to be quoted"
                       : basis === "catalog" ? "Taken from the plan above" : "Amount"}
                     disabled={basis === "quote_pending" || basis === "catalog"}
                     onChange={(e) => setAmount(e.target.value)} />
              <input disabled={basis === "catalog" || quoting} value={basis === "catalog" && existing ? existing.agreedCurrency : currency} onChange={(e) => setCurrency(e.target.value)}
                     aria-label="Currency" style={{ maxWidth: "70px" }} placeholder="usd" />
            </div>
          </label>

          <fieldset className="so-field">
            <legend>This price is</legend>
            <div className="so-pick">
              {[
                ...((existing ? existing.priceBasis === "catalog" : plans.length > 0) ? [["catalog", "Your catalog price"]] : []),
                ["negotiated", "What we agreed"],
                // Only legal on a Custom arrangement, so choosing it says so rather than enabling
                // a Save that the server would refuse.
                ["quote_pending", "Not quoted yet"],
              ].map(([key, text]) => (
                <button key={key} type="button" aria-pressed={basis === key}
                        onClick={() => { setBasis(key); if (key === "quote_pending") setTerm("custom_quote"); }}>
                  {text}
                </button>
              ))}
            </div>
          </fieldset>

          {basis === "catalog" && existing && <p className="so-absent">The recorded amount and currency are preserved. Editing these terms does not re-read or change the Catalog price.</p>}
          {basis === "catalog" && !existing ? (
            <label className="so-field">
              <span>Which of your plans</span>
              <select value={planId} onChange={(e) => setPlanId(e.target.value)}>
                <option value="">Choose the plan they are on…</option>
                {plans.map((plan) => (
                  <option key={plan.id} value={plan.id}>
                    {money(plan.unitAmount, plan.currency) ?? "Unpriced"}
                    {plan.billingInterval && plan.billingInterval !== "one_time"
                      ? ` · ${CADENCE_LABEL[plan.billingInterval] || plan.billingInterval}`
                      : ""}
                    {plan.nickname ? ` · ${plan.nickname}` : ""}
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          <label className="so-field">
            <span>Starts</span>
            <input type="date" value={startsOn} onChange={(e) => setStartsOn(e.target.value)} />
          </label>
          {term === "recurring" ? (
            <label className="so-field">
              <span>Renews (optional)</span>
              <input type="date" value={renewsOn} onChange={(e) => setRenewsOn(e.target.value)} />
            </label>
          ) : null}
          <label className="so-field">
            <span>Ends (optional)</span>
            <input type="date" value={endsOn} onChange={(e) => setEndsOn(e.target.value)} />
          </label>
          <label className="so-field">
            <span>Notes (optional)</span>
            <input value={notes} onChange={(e) => setNotes(e.target.value)}
                   placeholder="Anything you want to remember about this arrangement" />
          </label>
        </div>

        <footer className="so-editor-foot">
          <span role={notice ? "alert" : "status"} className="so-editor-note" data-tone={notice ? "bad" : "plain"}>
            {notice || (ready
              ? (existing ? "Saves these commercial terms. Nothing is charged, invoiced or sent." : "It saves as a draft. Nothing is charged, invoiced or sent.")
              : "Pick a client and an offer, and say what they agreed to pay.")}
          </span>
          <span style={{ flex: 1 }} />
          <button className="btn btn-s" onClick={close} disabled={busy}>Cancel</button>
          <button className="btn btn-s btn-p" onClick={save} disabled={busy || !ready}>
            {busy ? "Saving…" : existing ? "Save changes" : "Record terms"}
          </button>
        </footer>
        {confirmation}
      </aside>
    </SalesDialogPortal>
  );
}

/**
 * The Sales Operations surface. `setDetail` is the Campaigns drawer `GrowthHub` already mounts, so
 * this adds no second drawer (§18) and inherits its focus trap and Escape handling. `deals` arrives
 * from the Campaigns snapshot rather than a fifth tenant read.
 */
// ── Sales Command Desk — presentational helpers (file-local) ─────────────────────────────────
// The four Sales views. IDs are the `?view=` values; the shell six-tab nav is untouched.
const SALES_VIEWS = [
  ["command", "Sales Command"],
  ["terms", "Commercial Terms"],
  ["revenue", "Revenue & Collections"],
  ["scenarios", "Sales Scenarios"],
];
const EC_LABEL = { actual: "Actual", contracted: "Contracted", dated: "Dated", open: "Open", modeled: "Modeled", unknown: "Unknown" };
// The evidence class of a FIGURE — separate from the surface TRUTH label. Never gold (§11).
function EcChip({ e }) {
  return <span className={`so-ec so-ec-${e}`}>{EC_LABEL[e] || e}</span>;
}
// A small icon set for moves; `Ic` has no card/refresh/target, so these few live here.
function MoveIcon({ name }) {
  const c = { fill: "none", stroke: "currentColor", strokeWidth: 1.7, strokeLinecap: "round", strokeLinejoin: "round" };
  const body = {
    card: <><rect x="3" y="6" width="18" height="12" rx="2" /><path d="M3 10h18" /></>,
    doc: <><path d="M6 3h9l3 3v15H6z" /><path d="M9 12h6M9 16h6" /></>,
    refresh: <><path d="M4 12a8 8 0 0113.7-5.7L20 8" /><path d="M20 4v4h-4" /><path d="M20 12a8 8 0 01-13.7 5.7L4 16" /><path d="M4 20v-4h4" /></>,
    chat: <path d="M4 5h16v11H9l-5 4V5z" />,
    target: <><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="3" /></>,
  }[name] || <circle cx="12" cy="12" r="8" />;
  return <svg viewBox="0 0 24 24" width="16" height="16" {...c} aria-hidden="true">{body}</svg>;
}
// The Sales-local sub-navigation. Roving tabindex + arrow/Home/End, exactly like the shell strip,
// but scoped to Sales and driven by the `?view=` param so a view is deep-linkable and testable.
function SubNav({ view, setView }) {
  const onKey = (event, index) => {
    if (!["ArrowRight", "ArrowLeft", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const next = event.key === "Home" ? 0 : event.key === "End" ? SALES_VIEWS.length - 1
      : (index + (event.key === "ArrowRight" ? 1 : -1) + SALES_VIEWS.length) % SALES_VIEWS.length;
    const nextId = SALES_VIEWS[next][0];
    setView(nextId);
    // The buttons persist across a view change (only aria-selected/tabindex flip), so focusing the
    // sibling directly is safe and keeps keyboard users on the roving item.
    document.getElementById(`sales-view-${nextId}`)?.focus();
  };
  return (
    <div className="so-subnav" role="tablist" aria-label="Sales views">
      {SALES_VIEWS.map(([id, label], index) => (
        <button key={id} id={`sales-view-${id}`} role="tab" aria-selected={view === id} aria-controls="sales-view-panel"
          tabIndex={view === id ? 0 : -1} onClick={() => setView(id)} onKeyDown={(event) => onKey(event, index)}>
          {label}
        </button>
      ))}
    </div>
  );
}

// A pulse tile value: an honest count, a formatted amount, or an em-dash — never a coerced zero.
function PulseValue({ tile }) {
  if (tile.unavailable) return <span className="so-pv so-pv-dash">—</span>;
  if (tile.count != null) return <span className="so-pv">{tile.count}{tile.unit ? <span className="so-pv-u"> {tile.unit}</span> : null}</span>;
  if (tile.amountMinor != null) return <span className="so-pv mono">{money(tile.amountMinor, tile.currency) ?? "—"}</span>;
  return <span className="so-pv so-pv-dash">—</span>;
}

// ── Sales Scenario Lab (file-local) ──────────────────────────────────────────────────────────
// A MODEL, never an action. It reads the current price from Catalog (source-backed) and the
// close-rate / opportunity evidence from the tenant's own pipeline outcomes; everything else is an
// owner assumption, labelled as one. It writes NOTHING — no price, offer, deal, campaign, payment,
// or Mission. Save-as-artifact and link-to-Mission are UNAVAILABLE until those records exist.
function ScenarioLab({ offers, deals, stages, onAskPaige }) {
  const offerList = offers.offers || [];
  const [offerId, setOfferId] = React.useState("");
  const chosen = offerList.find((o) => o.id === offerId) || offerList[0] || null;
  const lead = chosen ? (chosen.prices.filter((p) => p.active && typeof p.unitAmount === "number")[0] || null) : null;
  const currency = (lead?.currency || "usd").toLowerCase();
  const currentPriceMinor = lead ? lead.unitAmount : null;
  const [proposed, setProposed] = React.useState("");
  const [capacity, setCapacity] = React.useState("Limited");
  const [period, setPeriod] = React.useState("Next 2 quarters");
  const [closeAssume, setCloseAssume] = React.useState("");
  const [oppsAssume, setOppsAssume] = React.useState("");

  // Evidence from the tenant's OWN pipeline outcomes. A close rate needs enough closed history to
  // be evidence rather than noise; below the threshold it is honestly absent.
  // A deal whose stage is not in `stages` is NOT counted as open — matching deriveSalesCommand,
  // so a phantom stage can never inflate the opportunity/close evidence the model gates on.
  const stageTypeOf = (d) => { const s = stages.find((x) => x.id === d.stageId); return s ? s.stageType : null; };
  const won = deals.filter((d) => stageTypeOf(d) === "won").length;
  const lost = deals.filter((d) => stageTypeOf(d) === "lost").length;
  const closed = won + lost;
  const closeEvidence = closed >= 3 ? Math.round((100 * won) / closed) : null;
  const openCount = deals.filter((d) => stageTypeOf(d) === "open").length;
  const oppsEvidence = openCount > 0 ? openCount : null;

  const digits = minorUnitDigits(currency);
  const proposedMajor = proposed.trim() === "" ? null : Number(proposed);
  const proposedMinor = proposedMajor != null && Number.isFinite(proposedMajor) && proposedMajor >= 0
    ? Math.round(proposedMajor * 10 ** digits) : null;

  const model = deriveScenario({
    currentPriceMinor,
    proposedPriceMinor: proposedMinor,
    currency,
    closeRatePct: closeEvidence != null ? closeEvidence : (closeAssume.trim() === "" ? null : Number(closeAssume)),
    closeRateFromEvidence: closeEvidence != null,
    opportunities: oppsEvidence != null ? oppsEvidence : (oppsAssume.trim() === "" ? null : Number(oppsAssume)),
    opportunitiesFromEvidence: oppsEvidence != null,
  });

  const askTest = () => onAskPaige(
    `Prepare the smallest safe test of moving ${chosen?.name || "this offer"} from ${money(currentPriceMinor, currency) ?? "its current price"} to ${proposedMinor != null ? money(proposedMinor, currency) : "a proposed price"}. Draft the pitch for the next few qualified leads and track the close rate against ${closeEvidence != null ? `the ${closeEvidence}% my pipeline shows` : "my assumption"}. Do not change the live Catalog price, any deal, or any campaign.`,
  );

  return (
    <div className="so-lab">
      <div className="so-band so-lab-inputs">
        <div className="so-band-head"><h3>Scenario inputs</h3></div>
        <label className="so-labf"><span>Offer <EcChip e="contracted" /></span>
          <select value={offerId || (chosen?.id || "")} onChange={(e) => setOfferId(e.target.value)}>
            {offerList.length === 0 ? <option value="">No offers recorded</option> : offerList.map((o) => <option key={o.id} value={o.id}>{o.name || "Untitled offer"}</option>)}
          </select>
          <small className="so-labhint">{lead ? `Current price ${money(currentPriceMinor, currency) ?? "—"} · from Catalog` : "This offer has no recorded price"}</small>
        </label>
        <label className="so-labf"><span>Proposed price <EcChip e="modeled" /></span>
          <input inputMode="decimal" value={proposed} placeholder="Owner-entered" onChange={(e) => setProposed(e.target.value)} />
        </label>
        <label className="so-labf"><span>Delivery capacity <EcChip e="modeled" /></span>
          <select value={capacity} onChange={(e) => setCapacity(e.target.value)}><option>Limited</option><option>Comfortable</option><option>Open</option></select>
        </label>
        <div className="so-labf"><span>Observed close rate {closeEvidence != null ? <EcChip e="dated" /> : <EcChip e="unknown" />}</span>
          {closeEvidence != null
            ? <p className="so-labfixed mono">{closeEvidence}%<small className="so-labhint"> · from {closed} closed deals in your pipeline</small></p>
            : <><input inputMode="decimal" value={closeAssume} placeholder="No history — enter an assumption" onChange={(e) => setCloseAssume(e.target.value)} /><small className="so-labhint">No close-rate evidence yet</small></>}
        </div>
        <div className="so-labf"><span>Opportunities {oppsEvidence != null ? <EcChip e="open" /> : <EcChip e="unknown" />}</span>
          {oppsEvidence != null
            ? <p className="so-labfixed mono">{oppsEvidence}<small className="so-labhint"> · open in your pipeline</small></p>
            : <><input inputMode="numeric" value={oppsAssume} placeholder="Enter an assumption" onChange={(e) => setOppsAssume(e.target.value)} /><small className="so-labhint">No real opportunity count</small></>}
        </div>
        <label className="so-labf"><span>Time period <EcChip e="modeled" /></span>
          <select value={period} onChange={(e) => setPeriod(e.target.value)}><option>Next quarter</option><option>Next 2 quarters</option><option>Next 12 months</option></select>
        </label>
      </div>

      <div className="so-lab-right">
        {!model.hasEvidence && <p className="so-banner so-banner-warn"><Ic.shield size={15} /><span><b>No historical evidence yet.</b> With no closed-deal history, the Evidence-supported path can't be computed — enter your own assumptions to model Conservative and Stretch, clearly marked as assumptions.</span></p>}
        <div className="so-lab-paths">
          {model.paths.map((p) => (
            <div key={p.key} className={`so-path${p.key === "evidence" ? " so-path-evi" : ""}`}>
              <div className="so-path-h"><b>{p.label}</b>{p.evidence === "modeled" ? <EcChip e="modeled" /> : <EcChip e="unknown" />}</div>
              <div className={`so-path-big${p.outcomeMinor == null ? " so-pv-dash" : " mono"}`}>{p.outcomeMinor == null ? "—" : money(p.outcomeMinor, currency)}</div>
              <div className="so-labhint">{p.note}</div>
              <div className="so-path-li"><span>Price</span><span className="mono">{proposedMinor != null ? money(proposedMinor, currency) : "—"}</span></div>
              <div className="so-path-li"><span>Close rate</span><span className="mono">{p.closeRatePct != null ? `${p.closeRatePct}%` : "—"}</span></div>
              <div className="so-path-li"><span>Opportunities</span><span className="mono">{p.opportunities != null ? p.opportunities : "—"}</span></div>
            </div>
          ))}
        </div>
        <div className="so-lab-reason">
          <div className="so-reason"><h4>What would need to be true</h4><ul><li>Price rises without dropping close rate below {closeEvidence != null ? `about ${Math.max(0, closeEvidence - 4)}%` : "your assumed rate"}.</li><li>{capacity.toLowerCase()} capacity absorbs the new load.</li><li>Enough qualified opportunities in the window.</li></ul></div>
          <div className="so-reason"><h4>What supports it</h4><ul>{closeEvidence != null ? <><li>{closed} closed deals inform the {closeEvidence}% close rate.</li><li>{openCount} open in the pipeline now.</li></> : <li className="so-quiet">No closed-deal history yet — results rest on your assumptions.</li>}<li>The current price is source-backed from Catalog.</li></ul></div>
          <div className="so-reason"><h4>What could invalidate it</h4><ul><li>Close rate drops as price rises.</li><li>Fewer opportunities than assumed.</li><li>Capacity limits fulfilment.</li></ul></div>
          <div className="so-reason"><h4>Smallest safe test Paige can prepare</h4><ul><li>Offer the new price to the next few qualified leads and compare close rate.</li><li>Paige drafts the pitch and tracks the result — no live price change.</li></ul></div>
        </div>
        <p className="so-banner so-banner-info"><Ic.shield size={15} /><span><b>This is a model.</b> Saving it as a planning artifact or linking it to a Business Mission is not available yet — no scenario or mission store exists. It never changes a live price, offer, deal, campaign, or payment.</span>
          <span className="so-lab-act"><button className="btn btn-s" disabled title="Not available yet — no scenario store">Save scenario</button><button className="btn btn-s btn-p" onClick={askTest}>Ask Paige to prepare the test</button></span></p>
      </div>
    </div>
  );
}

export function SalesOps({ setDetail, deals = [], dealsPhase = "ready", stages = [], submissions = [], submissionsPhase = "ready", submissionsRetry, onOpenCatalog, onOpenClients, onOpenPipeline, truth }) {
  const sales = useSoloSalesOps();
  const agreements = useSoloAgreements();
  const [offerSearch, setOfferSearch] = React.useState("");
  const [offerPage, setOfferPage] = React.useState(0);
  const [termSearch, setTermSearch] = React.useState("");
  const [termStatus, setTermStatus] = React.useState("all");
  const [termPage, setTermPage] = React.useState(0);
  const offers = useCatalogOffers({ search: offerSearch, page: offerPage, pageSize: 5, referenceIds: agreements.agreements.map((a) => a.offerId) });
  const [editor, setEditor] = React.useState(null);
  const [editing, setEditing] = React.useState(null);
  const [success, setSuccess] = React.useState("");
  const location = useLocation();
  const navigate = useNavigate();
  // The Sales-internal view lives in a Sales-local `?view=` param — deep-linkable and testable,
  // and it never touches the shell's `useSubtabRoute` growth-subtab registry. `command` is the bare
  // default, so the desk opens on the operating view with no query.
  const rawView = new URLSearchParams(location.search).get("view");
  const view = SALES_VIEWS.some(([id]) => id === rawView) ? rawView : "command";
  const setView = React.useCallback((next) => {
    const q = new URLSearchParams(location.search);
    if (next === "command") q.delete("view"); else q.set("view", next);
    q.delete("resume");
    const search = q.toString();
    navigate({ pathname: location.pathname, search: search ? `?${search}` : "" });
  }, [navigate, location.pathname, location.search]);
  React.useEffect(() => {
    if (new URLSearchParams(location.search).get("resume") === "terms" && agreements.phase === "ready" && offers.phase === "ready") {
      setEditor("agreement");
      // Land on Commercial Terms so the editor opens over its own view, and strip the one-shot param.
      const q = new URLSearchParams(location.search);
      q.delete("resume"); q.set("view", "terms");
      navigate({ pathname: location.pathname, search: `?${q.toString()}` }, { replace: true });
    }
  }, [location.search, agreements.phase, offers.phase, navigate, location.pathname]);

  // A workspace switch clears anything half-typed. Without this, a draft opened against one
  // workspace stays on screen under the next one. Both tenant ids are watched because each hook
  // guards its own synchronously, and the agreements drawer holds the more sensitive draft — a
  // client name bound to a negotiated amount.
  React.useEffect(() => { setEditor(null); setEditing(null); setSuccess(""); setOfferSearch(""); setOfferPage(0); setTermSearch(""); setTermStatus("all"); setTermPage(0); }, [sales.tenantId, agreements.tenantId]);

  // Hooks must run in the same order while the production adapters advance from loading to ready.
  // Keeping this memo above every phase return prevents React from aborting the Sales route on the
  // first successful read. The memo remains null until both commercial sources are ready.
  const commercialReady = agreements.phase === "ready" && offers.phase === "ready";
  const commercialError = agreements.phase === "error" || offers.phase === "error";
  const model = React.useMemo(() => (commercialReady ? deriveSalesCommand({
    agreements: agreements.agreements,
    clients: agreements.clients,
    offers: offers.offers,
    referencedOffers: offers.referencedOffers,
    orders: sales.orders,
    ordersReadable: sales.ordersReadable,
    deals,
    stages,
    processor: sales.processor,
    processorUnrecognised: sales.processorUnrecognised,
  }) : null), [commercialReady, agreements.agreements, agreements.clients, offers.offers, offers.referencedOffers, sales.orders, sales.ordersReadable, deals, stages, sales.processor, sales.processorUnrecognised]);

  if (sales.phase === "resolving") {
    return (
      <div className="campaigns-state" role="status">
        <span className="campaigns-spinner" />
        Resolving this account’s Campaigns workspace…
      </div>
    );
  }
  if (sales.phase === "loading") {
    return (
      <div className="campaigns-skeleton" role="status" aria-label="Loading sales operations">
        <span /><span /><span />
      </div>
    );
  }
  if (sales.phase === "unavailable") {
    return (
      <div className="campaigns-state">
        <span className="campaigns-truth campaigns-truth--unavailable">UNAVAILABLE</span>
        <h2>Sales needs a resolved workspace</h2>
        <p>No tenant data is read until your account context is confirmed.</p>
      </div>
    );
  }
  if (sales.phase === "error") {
    return (
      <div className="campaigns-state" role="alert">
        <span className="campaigns-truth campaigns-truth--unavailable">UNAVAILABLE</span>
        <h2>Sales operations could not load</h2>
        <p>Your records were not changed. Try loading this again.</p>
        <button className="btn btn-s" onClick={sales.retry}><Ic.arrow size={13} />Retry</button>
      </div>
    );
  }

  const matchingTerms = agreements.agreements.filter((row) => {
    const client = agreements.clients.find((c) => c.id === row.contactId);
    return (termStatus === "all" || row.status === termStatus)
      && (client?.name || "").toLowerCase().includes(termSearch.trim().toLowerCase());
  });
  const shownTerms = matchingTerms.slice(termPage * 5, termPage * 5 + 5);
  const processorState = sales.processorUnrecognised ? "unknown" : sales.processor === null ? "none" : sales.processor === "not_yet" ? "warn" : "ok";

  // The detail drawer `GrowthHub` already mounts (§18 — no second drawer). It shows the pair the
  // whole snapshot exists for: what this client agreed, beside what the catalog listed when it was
  // recorded. Labelled so the two can never be mistaken for each other, and dated, because a
  // snapshot without its date is not evidence.
  const openAgreement = (row, client, offer) => setDetail({
    title: client?.name || "Client terms",
    actions: agreements.canManage ? <button className="btn btn-p" onClick={() => { setDetail(null); setEditing(row); setEditor("agreement"); }}>Edit commercial terms</button> : null,
    rows: [
      ["Offer", offer?.name || "Not readable here"],
      ["State", (AGREEMENT_STATE[row.status] || AGREEMENT_STATE.unrecognised).label],
      ["Arrangement", TERM_LABEL[row.termKind] || "Not stated"],
      ["They agreed to pay", row.agreedAmountMinor === null
        ? (row.priceBasis === "quote_pending" ? "Still to be quoted" : "Not stated")
        : money(row.agreedAmountMinor, row.agreedCurrency) ?? "Not stated"],
      ["Catalog listed, when recorded", row.catalogSnapshotMinor === null
        ? "No catalog plan was chosen"
        : `${money(row.catalogSnapshotMinor, row.catalogSnapshotCurrency) ?? "Not stated"}${
            row.catalogSnapshotAt ? ` · ${when(row.catalogSnapshotAt)}` : ""}`],
      ["How often", row.termKind === "recurring" && row.billingInterval
        ? (CADENCE_LABEL[row.billingInterval] || row.billingInterval)
        : row.termKind === "installment" && row.installmentsTotal
          ? `${row.installmentsTotal} instalments`
          : "Not applicable"],
      ["Starts", row.startsOn ? when(row.startsOn, true) : "Not stated"],
      ["Renews", row.termKind === "recurring" ? (row.renewsOn ? when(row.renewsOn, true) : "Not stated") : "Not applicable"],
      ["Ends", row.endsOn ? when(row.endsOn, true) : "Not stated"],
      ["Notes", row.notes || "None recorded"],
    ],
    note: "What this client agreed to. It is not an invoice, a charge, or a payment record — the "
      + "catalog figure is a dated snapshot of what the offer listed at the time, and changing "
      + "the offer's price never changes it.",
  });

  const openOffer = (offer) => setDetail({
    title: offer.name || "Untitled offer",
    rows: [
      ["Kind", offer.kind === "service" ? "Service" : offer.kind === "product" ? "Product" : "Not stated"],
      ["Availability", (OFFER_STATE[offer.availability] || OFFER_STATE.unrecognised).label],
      ["Recorded plans", offer.prices.length
        ? offer.prices.map((p) => {
            const amount = money(p.unitAmount, p.currency);
            const period = p.billingInterval && p.billingInterval !== "one_time"
              ? ` / ${p.billingInterval}` : "";
            const count = p.kind === "installment" && p.installmentsTotal
              ? ` × ${p.installmentsTotal}` : "";
            return `${p.nickname || "Plan"} — ${amount ?? "no amount"}${count}${period}${p.active ? "" : " (inactive)"}`;
          }).join("\n")
        : "None recorded"],
      ["Category", offer.category || "Not stated"],
      ["Last changed", when(offer.updatedAt)],
    ],
    note: "Catalog owns this record. Sales reads it and never keeps a second copy of the price.",
  });


  // Route a move / open-work / ladder target to the REAL surface. No dead ends (§70).
  const go = (target) => {
    if (!target) return;
    switch (target.kind) {
      case "view": setView(target.view); break;
      case "catalog": if (onOpenCatalog) onOpenCatalog(); break;
      case "pipeline": if (onOpenPipeline) onOpenPipeline(); else if (onOpenCatalog) onOpenCatalog(); break;
      case "clients": if (onOpenClients) onOpenClients(); break;
      case "payment": setEditor("payment"); break;
      case "paige": window.dispatchEvent(new CustomEvent("paige:open", { detail: { prompt: target.prompt } })); break;
      default: break;
    }
  };
  const askPaige = (prompt) => window.dispatchEvent(new CustomEvent("paige:open", { detail: { prompt } }));

  // The operating brief, DERIVED from real records — never a hardcoded sentence.
  const brief = (() => {
    if (!model) return "Reading your commercial records…";
    const f = model.facts; const parts = [];
    if (!f.paymentReady && f.activeTermCount > 0) parts.push(`${f.activeTermCount} active term${f.activeTermCount === 1 ? "" : "s"} awaiting a payment path`);
    if (f.proposedTermCount > 0) parts.push(`${f.proposedTermCount} proposed to confirm`);
    if (f.renewalsSoonCount > 0) parts.push(`${f.renewalsSoonCount} renewing soon`);
    if (parts.length === 0) return f.activeTermCount > 0 ? "Your commercial desk is up to date." : "Record what a client agreed to pay to start your desk.";
    const s = parts.join(" · ");
    return `${s.charAt(0).toUpperCase()}${s.slice(1)}.`;
  })();
  // Recorded capture references only — never a sale, revenue, or attribution. Shown as a foldout.
  const routed = (submissions || []).filter((row) => row.contactId || row.dealId);
  // Active terms with a dated renewal/end inside the 60-day window — a real dated read for Revenue.
  const nowMs = Date.now();
  const renewalRows = agreements.agreements.filter((row) => {
    if (row.status !== "active") return false;
    const raw = row.renewsOn || row.endsOn; const t = raw ? Date.parse(raw) : NaN;
    return !Number.isNaN(t) && t >= nowMs && t <= nowMs + 60 * 86400000;
  });

  const contractedCurrency = model?.facts.contractedCurrency || "usd";

  return (
    <div className="so">
      {success && <div className="so-success" role="status">{success}<button className="btn btn-p" onClick={() => onOpenCatalog()}>Continue setup in Catalog</button></div>}
      {editor === "payment" && sales.canManage ? <PaymentEditor data={sales} onClose={() => setEditor(null)} /> : null}
      {editor === "offer" && offers.canManage ? (
        <QuickOffer
          offers={offers}
          tenantId={offers.tenantId}
          onClose={() => setEditor(null)}
          onCreated={(_id, warning) => { setEditor(null); setSuccess(warning ? "Your Catalog draft was created. Review its price and finish setup in Catalog." : "Your Catalog draft was created. Finish product or service setup in Catalog."); }}
        />
      ) : null}
      {editor === "agreement" && agreements.canManage ? (
        <AgreementEditor
          agreements={agreements}
          offers={offers}
          tenantId={agreements.tenantId}
          existing={editing}
          onOpenClients={onOpenClients}
          onOpenCatalog={onOpenCatalog}
          onClose={() => { setEditor(null); setEditing(null); }}
        />
      ) : null}

      <SubNav view={view} setView={setView} />
      <div id="sales-view-panel" role="tabpanel" aria-labelledby={`sales-view-${view}`} className="so-view">

      {view === "command" && (
        <div className="so-cmd">
          <header className="so-cmd-head">
            <div className="so-cmd-lead">
              <div className="so-cmd-eyebrow"><span className="so-eyebrow">Sales Command</span>{truth && <span className={`campaigns-truth campaigns-truth--${String(truth[0]).toLowerCase()}`}>{truth[0]}</span>}</div>
              <h2>Turn agreed value into received value.</h2>
              <p className="so-cmd-brief">{brief}</p>
            </div>
            <div className="so-cmd-act">
              <button className="btn" onClick={() => askPaige("Give me a plain-English read of my commercial readiness right now — what is agreed, what is awaiting a payment path, what is renewing, and the single next move. Use only my recorded terms, pipeline and payment handling; never invent revenue or attribution.")}><Ic.spark size={14} />Ask Paige</button>
              {agreements.canManage && <button className="btn btn-p" onClick={() => { setEditing(null); setEditor("agreement"); }}><Ic.doc size={14} />Record commercial terms</button>}
            </div>
          </header>

          {commercialError ? (
            <p className="so-absent" role="alert">Your commercial records could not be read, so this is unknown rather than empty. Nothing was changed. <button className="btn btn-s" onClick={() => { agreements.retry(); offers.retry(); }}><Ic.arrow size={13} />Retry</button></p>
          ) : !model ? (
            <div className="campaigns-skeleton" role="status" aria-label="Reading commercial records"><span /><span /><span /></div>
          ) : (<>
            <div className="so-pulse" aria-label="Commercial pulse">
              {model.pulse.map((t) => (
                <div className="so-pl" key={t.key}>
                  <div className="so-pl-top"><span className={`so-pl-ic so-pl-ic-${t.key}`}><MoveIcon name={t.key === "received" ? "card" : t.key === "open" ? "target" : t.key === "renewals" ? "refresh" : "doc"} /></span><span className="so-pl-lab">{t.label}</span></div>
                  <PulseValue tile={t} />
                  <div className="so-pl-sub">{t.sub}</div>
                  <div className="so-pl-meta"><EcChip e={t.evidence} /><span className="so-src">Source: <b>{t.sourceLabel}</b></span></div>
                </div>
              ))}
            </div>

            <div className="so-2col">
              {/* The readiness ladder is a reference OVERVIEW — the secondary section. At a wide column
                * it is the full desk; at a narrow (PAIGE-expanded) column it collapses to a disclosure
                * by default so the pulse, next moves, open work and primary actions stay above the fold.
                * Wide vs narrow is decided by the .so-view container width, not the window, so the
                * default state is right whether or not PAIGE is docked. */}
              <details className="so-fold so-ladder-fold">
              <summary className="so-ladder-toggle">Commercial Readiness Ladder <span className="so-quiet">— show stages</span></summary>
              <section className="so-band so-ladder-band">
                <div className="so-band-head"><h3>Commercial Readiness Ladder</h3><small>Every state shows a real record or an honest gap — drawn from pipeline, recorded terms and payment handling. Deals and terms aren’t linked yet, so this is a readiness overview, not one deal’s journey.</small></div>
                <div className="so-ladder">
                  {model.ladder.map((col) => (
                    <div className="so-lad-col" key={col.n}>
                      <div className="so-lad-hd">
                        <span className={`so-lad-n so-lad-n-${col.status}`}>{col.n}</span>
                        <b>{col.name}</b><small>{col.sub}</small>
                        <span className={`so-lad-st so-lad-st-${col.status}`}>{col.status === "live" ? "Live" : col.status === "part" ? "Partial" : "No source"}</span>
                      </div>
                      <div className="so-lad-body">
                        {col.tenantLevel ? (
                          <div className={`so-lad-tenant ${col.tenantLevel.ready ? "is-ready" : "is-missing"}`}>
                            <Pill tone={col.tenantLevel.ready ? "ok" : "warn"}>{col.tenantLevel.ready ? "Ready" : "Not set up"}</Pill>
                            <p>{col.emptyNote}</p>
                            {!col.tenantLevel.ready && agreements.canManage ? <button className="btn btn-s" onClick={() => setEditor("payment")}>Record payment handling</button> : null}
                          </div>
                        ) : col.status === "unavailable" || col.items.length === 0 ? (
                          <p className="so-lad-empty">{col.emptyNote}</p>
                        ) : (<>
                          {col.items.slice(0, 4).map((item) => (
                            <button className="so-lad-card" key={item.id} onClick={() => go(item.target)}>
                              <b>{item.client}</b>{item.offer && <span className="so-lad-co">{item.offer}</span>}
                              {item.flag && <span className={`so-lad-flag so-lad-flag-${item.flag.tone}`}><span className="dot" />{item.flag.label}</span>}
                            </button>
                          ))}
                          {col.items.length > 4 && <button className="so-lad-more" onClick={() => go(col.items[0].target)}>+{col.items.length - 4} more</button>}
                        </>)}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
              </details>

              <div className="so-cmd-side">
                <section className="so-band">
                  <div className="so-band-head"><h3>Top Commercial Moves</h3></div>
                  {model.moves.length === 0 ? (
                    <p className="so-absent">No commercial move needs you right now. New proposals, renewals and payment gaps will surface here.</p>
                  ) : (
                    <div className="so-moves">
                      {model.moves.map((m) => (
                        <button className="so-move" key={m.id} onClick={() => go(m.target)}>
                          <span className="so-move-ic"><MoveIcon name={m.icon} /></span>
                          <span className="so-move-t"><b>{m.title}</b><small>{m.detail}</small></span>
                          <span className="so-move-r"><span className="so-move-who">{m.who}</span><span className="so-src">{m.sourceLabel}</span></span>
                        </button>
                      ))}
                    </div>
                  )}
                </section>

                <section className="so-band">
                  <div className="so-band-head"><h3>Open Commercial Work</h3>{model.openWork.length > 5 ? <button className="btn btn-s" onClick={() => setView("terms")}>View all</button> : null}</div>
                  {model.openWork.length === 0 ? (
                    <p className="so-absent">No open commercial work. Recorded terms and open deals that need a next step appear here.</p>
                  ) : (
                    <div className="so-owt">
                      {model.openWork.slice(0, 5).map((r) => (
                        <button className="so-owt-row" key={r.id} onClick={() => go(r.target)}>
                          <span className="so-owt-cli"><span className="so-owt-av">{r.initials}</span><b>{r.client}</b></span>
                          <span className="so-owt-off">{r.offer || "—"}</span>
                          <span><Pill tone={r.stateTone}>{r.stateLabel}</Pill></span>
                          <span className="so-owt-go"><Ic.chev size={14} /></span>
                        </button>
                      ))}
                    </div>
                  )}
                </section>
              </div>
            </div>

            {/* Routed captures moved here from the wrapper (§58): the read stays phase-aware — a
              * failed or unresolved snapshot read is UNKNOWN, never an empty "no activity". */}
            <details className="so-fold so-form-activity" open={submissionsPhase === "error" || submissionsPhase === "unavailable"}><summary>Recorded captures — references only (never a sale)</summary>
              {submissionsPhase === "resolving" ? (
                <div className="campaigns-state" role="status"><span className="campaigns-spinner" />Resolving this account’s Campaigns workspace…</div>
              ) : submissionsPhase === "loading" ? (
                <div className="campaigns-skeleton" role="status" aria-label="Loading routed capture activity"><span /><span /><span /></div>
              ) : submissionsPhase === "unavailable" ? (
                <div className="campaigns-state"><span className="campaigns-truth campaigns-truth--unavailable">UNAVAILABLE</span><h2>Campaigns needs a resolved workspace</h2><p>No tenant data is read until your account context is confirmed.</p></div>
              ) : submissionsPhase === "error" ? (
                <div className="campaigns-state" role="alert"><span className="campaigns-truth campaigns-truth--unavailable">UNAVAILABLE</span><h2>Campaigns could not load</h2><p>Your records were not changed. Try the tenant-scoped read again.</p>{submissionsRetry && <button className="btn btn-s" onClick={submissionsRetry}><Ic.arrow size={13} />Retry</button>}</div>
              ) : routed.length === 0 ? (
                <p className="so-absent">No routed form activity. Recorded contact and deal references only — never estimated revenue or campaign attribution; a submission is not a sale.</p>
              ) : (
                <div className="campaigns-list">{routed.map((row) => (
                  <button className="campaigns-list-row" key={row.id} onClick={() => setDetail({ title: "Captured activity", rows: [["Source", row.source], ["Recorded", when(row.createdAt)], ["Contact reference", row.contactId ? "Recorded" : "Not recorded"], ["Deal reference", row.dealId ? "Recorded" : "Not recorded"]], note: "No monetary value or campaign attribution is inferred." })}><span><strong>{row.source}</strong><small>{when(row.createdAt)}</small></span><span className="campaigns-row-end">Recorded <Ic.chev size={14} /></span></button>
                ))}</div>
              )}
            </details>
          </>)}
        </div>
      )}

      {view === "scenarios" && (
        commercialError ? <p className="so-absent" role="alert">Your commercial records could not be read. <button className="btn btn-s" onClick={() => { offers.retry(); }}><Ic.arrow size={13} />Retry</button></p>
        : offers.phase !== "ready" ? <div className="campaigns-skeleton" role="status" aria-label="Loading scenarios"><span /><span /><span /></div>
        : <ScenarioLab offers={offers} deals={deals} stages={stages} onAskPaige={askPaige} />
      )}

      {view === "terms" && (<>
      {/* ── what each client pays ─────────────────────────────────────────────────────────── */}
      <section className="so-band so-terms">
        <div className="so-band-head">
          <h3>Commercial terms and retainers</h3>
          {agreements.phase === "ready" && agreements.agreementsReadable && <Pill tone={agreements.agreements.length ? "ok" : "opportunity"}>{agreements.agreements.length ? "Records available" : "Nothing recorded yet"}</Pill>}
          {truth && <span className={`campaigns-truth campaigns-truth--${String(truth[0]).toLowerCase()}`}>{truth[0]}</span>}
          {agreements.canManage
            ? <button className="btn btn-s btn-p" onClick={() => { setEditing(null); setEditor("agreement"); }}>Record terms</button>
            : agreements.phase === "ready" && agreements.agreementsReadable
              // A reader who cannot write is told WHO may — never a silently missing button (§36/§70).
              ? <span className="so-quiet">An owner or admin records this.</span>
              : null}
          {/* Disambiguated in place rather than renamed. "Agreement" already means a SIGNED
            * DOCUMENT everywhere else in this product — including `clients.agreement_signed_at`
            * on the very table this reads, and an "Agreements" card on the same client's portal
            * panel. This sentence is what stops an owner opening this expecting to send a PDF.
            * It is also §38 statement #1 of exactly two on this band. */}
          <small>
            What each client agreed to pay for one of your offers. Recording it bills nobody and
            sends nothing. No legal document is generated, stored or signed here.
          </small>
        </div>

        {agreements.agreementsReadable && agreements.agreements.length > 0 && <div className="so-filters">
          <label className="so-search"><span>Find client terms</span><input type="search" value={termSearch} placeholder="Search client name…" onChange={(e) => { setTermSearch(e.target.value); setTermPage(0); }} /></label>
          <label className="so-search"><span>Status</span><select aria-label="Terms status" value={termStatus} onChange={(e) => { setTermStatus(e.target.value); setTermPage(0); }}><option value="all">All statuses</option>{Object.entries(AGREEMENT_STATE).map(([key, value]) => <option key={key} value={key}>{value.label}</option>)}</select></label>
          <small>Searches the latest {agreements.agreements.length} loaded records (up to 200).</small>
        </div>}
        {["loading", "resolving"].includes(agreements.phase) ? <p role="status">Loading commercial terms…</p> : agreements.phase === "error" ? (
          <p className="so-absent">
            Your client terms could not be read, so this is unknown rather than empty. Nothing was
            changed.{" "}
            <button className="btn btn-s" onClick={agreements.retry}>
              <Ic.arrow size={13} />Retry
            </button>
          </p>
        ) : agreements.phase === "unavailable" ? <p className="so-absent">Client terms need a resolved workspace.</p> : agreements.authorityUnknown ? <p className="so-absent" role="alert">Your access could not be confirmed. <button className="btn btn-s" onClick={agreements.retry}>Retry access</button></p> : !agreements.agreementsReadable && agreements.agreements.length === 0 ? (
          <p className="so-absent">
            Client terms are not readable at your access level. That is different from there being
            none, so nothing is shown rather than an empty list that would read as zero.
          </p>
        ) : agreements.agreements.length === 0 ? (
          // The prerequisites are named plainly, and each points at the surface that fixes it —
          // never a control that does nothing (§70.1).
          <p className="so-absent">
            {agreements.clients.length === 0
              ? "These terms attach a client to one of your offers, and no clients are recorded in this workspace yet. Add one under Clients first."
              : (!offerSearch && offerPage === 0 && offers.phase === "ready" && offers.offers.length === 0)
                ? "These terms attach a client to one of your offers, and nothing is recorded in your catalog yet. Add what you sell above first."
                : "Nothing recorded yet. Pick a client and one of your offers, then write down what they actually agreed to pay — the amount, how often, and when it starts."}
          </p>
        ) : (
          <div className="so-table" role="table" aria-label="Commercial terms and retainers">
            <div className="so-tr so-th so-tr-4" role="row">
              <span role="columnheader">Client</span>
              <span role="columnheader">State</span>
              <span role="columnheader">Agreed</span>
              <span role="columnheader">Terms</span>
            </div>
            {shownTerms.map((row) => {
              const state = AGREEMENT_STATE[row.status] || AGREEMENT_STATE.unrecognised;
              const client = agreements.clients.find((c) => c.id === row.contactId);
              const offer = [...offers.offers, ...(offers.referencedOffers || [])].find((o) => o.id === row.offerId);
              return (
                <button
                  className="so-tr so-tr-4 so-row"
                  role="row"
                  key={row.id}
                  onClick={() => openAgreement(row, client, offer)}
                >
                  <span role="cell" className="so-cell-name">
                    {/* A client the caller cannot read is NAMED as unreadable, never blanked into
                      * an em-dash that would read as "no client". */}
                    {client?.name || (agreements.clientsReadable ? "Not recorded" : "Not readable here")}
                  </span>
                  <span role="cell"><Pill tone={state.tone}>{state.label}</Pill></span>
                  <span role="cell" className={`so-num so-num--${state.tone}`}>
                    {row.agreedAmountMinor === null
                      ? (row.priceBasis === "quote_pending" ? "To be quoted" : "—")
                      : money(row.agreedAmountMinor, row.agreedCurrency) ?? "—"}
                  </span>
                  <span role="cell" className="so-quiet">
                    {(TERM_LABEL[row.termKind] || "Not stated")}
                    {row.termKind === "recurring" && row.billingInterval
                      ? ` · ${CADENCE_LABEL[row.billingInterval] || row.billingInterval}`
                      : ""}
                    {row.termKind === "installment" && row.installmentsTotal
                      ? ` · ${row.installmentsTotal}×`
                      : ""}
                  </span>
                </button>
              );
            })}
          </div>
        )}
        {agreements.agreements.length > 0 && agreements.agreementsReadable && <div className="so-page-controls"><span>{matchingTerms.length === 0 ? "No matching terms" : "Page " + (termPage + 1) + " · " + matchingTerms.length + " matching loaded records"}</span><button className="btn btn-s" disabled={termPage === 0} onClick={() => setTermPage((p) => p - 1)}>Previous terms</button><button className="btn btn-s" disabled={(termPage + 1) * 5 >= matchingTerms.length} onClick={() => setTermPage((p) => p + 1)}>Next terms</button></div>}
      </section>

      {/* ── what this business sells ──────────────────────────────────────────────────────── */}
      <section className="so-band so-offers" aria-label="Find an offer">
        <div className="so-band-head">
          <h3>Find an offer</h3>
          <small>What you sell lives in Catalog. Search by name or browse five at a time.</small>
          <span style={{ flex: 1 }} />
          {offers.canManage && <button className="btn btn-s btn-p" onClick={() => setEditor("offer")}>Quick offer</button>}
          {onOpenCatalog ? (
            <button className="btn btn-s" onClick={() => onOpenCatalog()}>Open Catalog <Ic.arrow size={12} /></button>
          ) : null}
        </div>

        {offers.authorityUnknown && <p className="so-absent" role="alert">Offer editing access could not be confirmed. <button className="btn btn-s" onClick={offers.retry}>Retry offer access</button></p>}
        <label className="so-search"><span>Search Catalog offers</span><input type="search" value={offerSearch} placeholder="Find a product or service…" onChange={(e) => { setOfferSearch(e.target.value); setOfferPage(0); }} /></label>
        {["loading", "resolving"].includes(offers.phase) ? <p role="status">Loading Catalog offers…</p> : offers.phase === "error" ? (
          <p className="so-absent" role="alert">
            Your offers could not be read. Your records were not changed. <button className="btn btn-s" onClick={offers.retry}>Retry offers</button>
          </p>
        ) : offers.phase === "unavailable" ? <p className="so-absent">Catalog needs a resolved workspace.</p> : offers.offers.length === 0 ? (
          <p className="so-absent">
            {offerSearch || offerPage ? "No offers match this view. Clear your search or go back a page." : "Add your first product or service with Quick offer. Finish its setup in Catalog."}
          </p>
        ) : (
          <div className="so-table" role="table" aria-label="Offers">
            <div className="so-tr so-th" role="row">
              <span role="columnheader">Offer</span>
              <span role="columnheader">Kind</span>
              <span role="columnheader">State</span>
              <span role="columnheader">Price</span>
              <span role="columnheader">Price cadence</span>
            </div>
            {offers.offers.map((offer) => {
              const lead = offer.prices.filter((p) => p.active && typeof p.unitAmount === "number")[0] || null;
              const state = OFFER_STATE[offer.availability] || OFFER_STATE.unrecognised;
              return (
                <button className="so-tr so-row" role="row" key={offer.id} onClick={() => openOffer(offer)}>
                  <span role="cell" className="so-cell-name">{offer.name || "Untitled offer"}</span>
                  <span role="cell">{offer.kind === "service" ? "Service" : offer.kind === "product" ? "Product" : "—"}</span>
                  <span role="cell"><Pill tone={state.tone}>{state.label}</Pill></span>
                  <span role="cell" className="so-num">
                    {lead ? (money(lead.unitAmount, lead.currency) ?? "—") : "—"}
                  </span>
                  <span role="cell">
                    {lead && lead.billingInterval ? (CADENCE[lead.billingInterval] || lead.billingInterval) : "—"}
                  </span>
                </button>
              );
            })}
          </div>
        )}
        <div className="so-page-controls"><span>Page {offerPage + 1} · up to 5 offers</span><button className="btn btn-s" disabled={offerPage === 0 || offers.phase !== "ready"} onClick={() => setOfferPage((p) => p - 1)}>Previous offers</button><button className="btn btn-s" disabled={!offers.hasMore || offers.phase !== "ready"} onClick={() => setOfferPage((p) => p + 1)}>Next offers</button></div>
      </section>
      </>)}

      {view === "revenue" && (<>
      <div className="so-band-head so-rev-lead"><h3>Revenue &amp; Collections</h3><small>A sales-facing commercial view — not a payment processor. Paige never holds this money; it reaches you directly. Nothing here is charged, collected, or settled.</small></div>
      <div className="so-rev-top">
        <section className="so-band so-rev-card">
          <div className="so-band-head"><h3>Actual received</h3><EcChip e="unknown" /></div>
          <div className="so-rev-empty">
            <p className="so-absent">{sales.processor === null ? "You haven’t recorded how your clients pay you." : "Payment handling is recorded, but no verified receipts are imported — Paige doesn’t connect your processor or move money."} Actual received stays empty until a real source proves it.</p>
            {sales.canManage && <button className="btn btn-s btn-p" onClick={() => setEditor("payment")}>{sales.processor === null ? "Record payment handling" : "Change payment handling"}</button>}
          </div>
        </section>
        <section className="so-band so-rev-card">
          <div className="so-band-head"><h3>Contracted value on record</h3><EcChip e="contracted" /></div>
          {!model ? <div className="campaigns-skeleton" role="status"><span /></div> : (<>
            <div className="so-rev-figure"><span className="so-num mono">{model.facts.contractedOnceMinor > 0 ? (money(model.facts.contractedOnceMinor, contractedCurrency) ?? "—") : "—"}</span><span className="so-rev-fnote">{model.facts.activeTermCount === 0 ? "No active terms recorded" : model.facts.contractedOnceMinor > 0 ? "One-time on active terms" : "No one-time value — recurring shown monthly"}</span></div>
            <div className="so-rev-facts">
              <span><b className="mono">{model.facts.contractedMrrMinor > 0 ? (money(model.facts.contractedMrrMinor, contractedCurrency) ?? "—") : "—"}</b>/mo recurring</span>
              <span><b className="mono">{model.facts.activeTermCount}</b> active {model.facts.activeTermCount === 1 ? "term" : "terms"}</span>
              {model.facts.mixedCurrency && <span className="so-quiet">+ other currencies, not summed</span>}
            </div>
            <p className="so-src">Source: <b>Recorded terms</b> · recurring shown monthly, never annualized</p>
          </>)}
        </section>
      </div>

      <section className="so-band">
        <div className="so-band-head"><h3>Renewals &amp; expiring terms</h3><EcChip e="dated" /></div>
        {renewalRows.length === 0 ? (
          <p className="so-absent">No active terms renew or end in the next 60 days. This is a real read of your recorded renewal and end dates — never an invented reminder.</p>
        ) : (
          <div className="so-table" role="table" aria-label="Renewals and expiring terms">
            {renewalRows.map((row) => {
              const client = agreements.clients.find((c) => c.id === row.contactId);
              const raw = row.renewsOn || row.endsOn;
              const days = Math.max(0, Math.round((Date.parse(raw) - nowMs) / 86400000));
              return (
                <div className="so-tr so-tr-4" role="row" key={row.id}>
                  <span role="cell" className="so-cell-name">{client?.name || (agreements.clientsReadable ? "Not recorded" : "Not readable here")}</span>
                  <span role="cell" className="so-quiet">{row.renewsOn ? "Renews" : "Ends"} {when(raw, true)}</span>
                  <span role="cell"><Pill tone={days <= 30 ? "warn" : "opportunity"}>{days}d</Pill></span>
                  <span role="cell"><button className="btn btn-s" onClick={() => askPaige(`Prepare a renewal note for ${client?.name || "this client"} — their terms ${row.renewsOn ? "renew" : "end"} ${when(raw, true)}. Review the value delivered from my records; do not send anything.`)}>Prepare with Paige</button></span>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="so-band so-payment"><div className="so-band-head"><h3>Payment handling</h3><small>Records how you accept payment. No processor connection or money collection.</small></div>
        <ReadyRow
          state={processorState}
          label="How your clients pay you"
          detail={
            sales.processorUnrecognised
              ? "Something is recorded that this version cannot read."
              : sales.processor === null
                ? "Not recorded yet. Paige never holds this money — it reaches you directly."
                : sales.processor === "not_yet"
                  ? "Recorded as nothing yet."
                  : `${PROCESSOR_LABEL[sales.processor]}${sales.methods.length
                      ? ` · ${sales.methods.map((m) => METHOD_LABEL[m]).join(", ")}`
                      : " · no methods recorded"}`
          }
          action={sales.canManage ? (
            // `btn-p`, not `btn-g`. Gold is the act (§11) and `btn-g` is the Solo shell's gold
            // button — but its own pair, `--gold` on `--gold-tint`, measures 2.72:1 in light mode,
            // far under AA, and this render pass caught it the moment these buttons took it. A
            // primary action nobody can read is the opposite of what "more vibrant" asked for, so
            // the acts take the shell's violet primary (white on `--violet`, ~7:1) instead. The
            // gold-button measurement is reported to CD rather than fixed here — `.btn-g` is a
            // shared primitive and the sibling Catalog tab ships it on "New offer" today.
            <button className="btn btn-s btn-p" onClick={() => setEditor("payment")}>
              {sales.processor === null ? "Record it" : "Change"}
            </button>
          ) : (
            <small className="so-quiet">
              {sales.authorityUnknown
                ? "Whether you can change this could not be read."
                : "An owner or admin records this."}
            </small>
          )}
        />

      </section>
      {/* ── commercial activity ───────────────────────────────────────────────────────────── */}
      <section className="so-band">
        <div className="so-band-head">
          <h3>Commercial activity</h3>
          <small>Recorded payments only. Nothing here is a forecast, a total, or campaign attribution.</small>
        </div>

        {!sales.ordersReadable ? (
          <p className="so-absent">
            Commercial activity is not readable at your access level. That is different from there
            being none, so nothing is shown rather than an empty list that would read as zero.
          </p>
        ) : sales.orders.length === 0 ? (
          <p className="so-absent">
            No payment records are available here. This surface does not connect your processor or import payments.
          </p>
        ) : (
          <details className="so-activity"><summary>View {sales.orders.length} recent payment records</summary><div className="so-table" role="table" aria-label="Commercial activity">
            <div className="so-tr so-th so-tr-4" role="row">
              <span role="columnheader">Who</span>
              <span role="columnheader">State</span>
              <span role="columnheader">Amount</span>
              <span role="columnheader">Recorded</span>
            </div>
            {sales.orders.map((order) => {
              const state = ORDER_STATUS[order.status] || ORDER_STATUS.unrecognised;
              return (
                <div className="so-tr so-tr-4" role="row" key={order.id}>
                  <span role="cell" className="so-cell-name">
                    {order.customerName || order.customerEmail || "Not recorded"}
                  </span>
                  <span role="cell"><Pill tone={state.tone}>{state.label}</Pill></span>
                  <span role="cell" className={`so-num so-num--${state.tone}`}>
                    {money(order.amountTotal, order.currency) ?? "—"}
                  </span>
                  <span role="cell" className="so-quiet">{when(order.createdAt)}</span>
                </div>
              );
            })}
          </div></details>
        )}
      </section>
      </>)}

      </div>
    </div>
  );
}

export default SalesOps;
