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

function when(value) {
  if (!value) return "Not recorded";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Not recorded"
    : new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(date);
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
      if (event.key !== "Tab") return;
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
  React.useEffect(() => {
    const onKey = (event) => { if (event.key === "Escape" && !busy) onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose, busy]);

  const toggle = (method) => setMethods((current) =>
    current.includes(method) ? current.filter((m) => m !== method) : [...current, method]);

  const save = async () => {
    setBusy(true);
    setNotice(null);
    const outcome = await data.declarePaymentHandling(processor, methods);
    setBusy(false);
    if (outcome.ok) { onClose(); return; }
    // The form STAYS OPEN on a refusal. Closing it would discard the answer on top of telling
    // someone it did not save.
    setNotice(outcome.message || "That could not be saved. Nothing was changed.");
  };

  return (
    <>
      <button className="so-editor-scrim" tabIndex={-1} aria-label="Close" onClick={() => !busy && onClose()} />
      <aside ref={panelRef} className="so-editor" role="dialog" aria-modal="true" aria-labelledby="so-pay-title">
        <header className="so-editor-head">
          <div style={{ flex: 1 }}>
            <h2 id="so-pay-title">How your clients pay you</h2>
            <p>
              This records how money reaches your business. It does not connect an account, move
              money, or give Paige access to your processor.
            </p>
          </div>
          <button className="btn btn-s" onClick={onClose} disabled={busy} aria-label="Close">
            <Ic.x size={14} />
          </button>
        </header>

        <div className="so-editor-body">
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
          <span className="so-editor-note" data-tone={notice ? "bad" : "plain"}>
            {notice || (processor
              ? "Saved to this workspace only."
              : "Choose a processor, or say Nothing yet — both are real answers.")}
          </span>
          <span style={{ flex: 1 }} />
          <button className="btn btn-s" onClick={onClose} disabled={busy}>Cancel</button>
          <button className="btn btn-s btn-p" onClick={save} disabled={busy || !processor}>
            {busy ? "Saving…" : "Save"}
          </button>
        </footer>
      </aside>
    </>
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
  React.useEffect(() => {
    const onKey = (event) => { if (event.key === "Escape" && !busy) onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose, busy]);

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
    });
    setBusy(false);
    if (outcome.ok) {
      // The server reports what it actually did with the price. If it declined to write one, the
      // person is told here rather than discovering it in Catalog — silently not saving a price
      // somebody just typed is the same class of lie as inventing one.
      const note = outcome.result?.price_note;
      if (note) { setNotice(note); return; }
      onCreated(outcome.result?.id ?? null);
      return;
    }
    setNotice(outcome.message || "That could not be saved. Nothing was changed.");
  };

  return (
    <>
      <button className="so-editor-scrim" tabIndex={-1} aria-label="Close" onClick={() => !busy && onClose()} />
      <aside ref={panelRef} className="so-editor" role="dialog" aria-modal="true" aria-labelledby="so-offer-title">
        <header className="so-editor-head">
          <div style={{ flex: 1 }}>
            <h2 id="so-offer-title">Quick offer</h2>
            <p>
              Enough to make it real. It saves as a draft in Catalog, where you can finish it —
              nothing is public until you publish it there.
            </p>
          </div>
          <button className="btn btn-s" onClick={onClose} disabled={busy} aria-label="Close">
            <Ic.x size={14} />
          </button>
        </header>

        <div className="so-editor-body">
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
            <legend>Charged</legend>
            <div className="so-pick">
              {[["one_time", "Once"], ["week", "Weekly"], ["month", "Monthly"], ["year", "Yearly"]].map(([key, text]) => (
                <button key={key} type="button" aria-pressed={interval === key}
                        onClick={() => setInterval(interval === key ? "" : key)}>{text}</button>
              ))}
            </div>
          </fieldset>
        </div>

        <footer className="so-editor-foot">
          <span className="so-editor-note" data-tone={notice ? "bad" : "plain"}>
            {notice || (named
              ? "Anything left blank stays unstated, and you can finish it in Catalog."
              : "A name is all this needs to save.")}
          </span>
          <span style={{ flex: 1 }} />
          <button className="btn btn-s" onClick={onClose} disabled={busy}>Cancel</button>
          <button className="btn btn-s btn-p" onClick={save} disabled={busy || !named}>
            {busy ? "Saving…" : "Create offer"}
          </button>
        </footer>
      </aside>
    </>
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
function AgreementEditor({ agreements, offers, tenantId, existing, onClose }) {
  const panelRef = useModalDialog();
  const firstRef = React.useRef(null);
  const [contactId, setContactId] = React.useState(existing?.contactId ?? "");
  const [offerId, setOfferId] = React.useState(existing?.offerId ?? "");
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
  const chosenOffer = offers.offers.find((o) => o.id === offerId) || null;
  const plans = (chosenOffer?.prices || []).filter((plan) => typeof plan.unitAmount === "number");
  // Changing the offer invalidates a plan chosen from the previous one, and a stale id would be
  // refused by the server ("that price is not a plan on this offer in this workspace").
  React.useEffect(() => { setPlanId(""); }, [offerId]);
  // "At your catalog price" is only offerable when there IS a catalog price to point at.
  React.useEffect(() => {
    if (basis === "catalog" && plans.length === 0) setBasis("negotiated");
  }, [basis, plans.length]);

  const priced = amount.trim() !== "";
  // `quote_pending` is only legal on a CUSTOM arrangement — the server refuses it otherwise, and
  // the table's CHECK refuses it after that. Before this line the term defaulted to `one_time`
  // while `ready` ignored the term entirely, so choosing "Not quoted yet" from the empty state
  // enabled a Save that could only ever fail, two clicks in.
  const quoting = basis === "quote_pending";
  const ready = contactId !== "" && offerId !== ""
    && (quoting ? term === "custom_quote" : (basis === "catalog" ? planId !== "" : priced));
  // Anything typed is worth protecting on the way out. The check is on the DRAFT, not on a dirty
  // flag, so it is true the moment a field differs from what was opened.
  const touched = contactId !== (existing?.contactId ?? "") || offerId !== (existing?.offerId ?? "")
    || term !== (existing?.termKind ?? "one_time") || amount !== "" || notes !== (existing?.notes ?? "")
    || startsOn !== (existing?.startsOn ?? "");

  const close = () => {
    if (busy) return;
    if (touched && !window.confirm("Close without saving? What you typed here will be lost.")) return;
    onClose();
  };

  const save = async () => {
    setBusy(true);
    setNotice("");
    const digits = minorUnitDigits(currency);
    const major = priced ? Number(amount) : null;
    if (major !== null && !Number.isFinite(major)) {
      setBusy(false);
      setNotice("That amount is not a number.");
      return;
    }
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
      catalogPriceId: basis === "catalog" ? (planId || null) : null,
      // `10 ** minorUnitDigits(currency)`, never a hardcoded 100: JPY has no minor unit and KWD
      // has three, and a hardcoded exponent already shipped once as a real bug here.
      // On the catalog basis the server derives both from the plan, so sending a figure here would
      // be the browser stating what the catalog charged.
      agreedAmountMinor: basis === "catalog" ? null : (major === null ? null : Math.round(major * 10 ** digits)),
      agreedCurrency: basis === "catalog" ? null : (major === null ? null : (currency || "usd").trim().toLowerCase()),
      billingInterval: term === "recurring" ? cadence : null,
      intervalCount: term === "recurring" ? 1 : null,
      installmentsTotal: term === "installment" && instalments.trim() !== ""
        ? Math.max(2, Math.round(Number(instalments) || 0))
        : null,
      paymentSchedule: null,
      startsOn: startsOn || null,
      // Only a recurring arrangement renews — the server says so in words before the CHECK can.
      renewsOn: term === "recurring" ? (renewsOn || null) : null,
      endsOn: endsOn || null,
      title: null,
      notes: notes.trim() || null,
      expectedUpdatedAt: existing?.updatedAt ?? null,
    });
    setBusy(false);
    if (outcome.ok) { onClose(); return; }
    // A stale write is NOT a retry — retrying would overwrite whoever else saved. Say so.
    setNotice(outcome.stale
      ? "Someone else changed this while you had it open. Close and reopen it to see their version."
      : outcome.message || "That could not be saved. Nothing was changed.");
  };

  return (
    <>
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

        <div className="so-editor-body">
          <label className="so-field">
            <span>Client</span>
            <select ref={firstRef} value={contactId} onChange={(e) => setContactId(e.target.value)}>
              <option value="">Choose a client…</option>
              {agreements.clients.map((client) => (
                <option key={client.id} value={client.id}>{client.name}</option>
              ))}
            </select>
          </label>

          <label className="so-field">
            <span>Offer</span>
            <select value={offerId} onChange={(e) => setOfferId(e.target.value)}>
              <option value="">Choose one of your offers…</option>
              {offers.offers.map((offer) => (
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
              <input inputMode="decimal" value={basis === "catalog" ? "" : amount}
                     placeholder={basis === "quote_pending" ? "Still to be quoted"
                       : basis === "catalog" ? "Taken from the plan above" : "Amount"}
                     disabled={basis === "quote_pending" || basis === "catalog"}
                     onChange={(e) => setAmount(e.target.value)} />
              <input value={currency} onChange={(e) => setCurrency(e.target.value)}
                     aria-label="Currency" style={{ maxWidth: "70px" }} placeholder="usd" />
            </div>
          </label>

          <fieldset className="so-field">
            <legend>This price is</legend>
            <div className="so-pick">
              {[
                ...(plans.length > 0 ? [["catalog", "Your catalog price"]] : []),
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

          {basis === "catalog" ? (
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
          <span className="so-editor-note" data-tone={notice ? "bad" : "plain"}>
            {notice || (ready
              ? "It saves as a draft. Nothing is charged, invoiced or sent."
              : "Pick a client and an offer, and say what they agreed to pay.")}
          </span>
          <span style={{ flex: 1 }} />
          <button className="btn btn-s" onClick={close} disabled={busy}>Cancel</button>
          <button className="btn btn-s btn-p" onClick={save} disabled={busy || !ready}>
            {busy ? "Saving…" : existing ? "Save changes" : "Record terms"}
          </button>
        </footer>
      </aside>
    </>
  );
}

/**
 * The Sales Operations surface. `setDetail` is the Campaigns drawer `GrowthHub` already mounts, so
 * this adds no second drawer (§18) and inherits its focus trap and Escape handling. `deals` arrives
 * from the Campaigns snapshot rather than a fifth tenant read.
 */
export function SalesOps({ setDetail, deals = [], dealsPhase = "ready", onOpenCatalog, truth }) {
  const sales = useSoloSalesOps();
  const offers = useCatalogOffers();
  const agreements = useSoloAgreements();
  const [editor, setEditor] = React.useState(null);
  const [editing, setEditing] = React.useState(null);

  // A workspace switch clears anything half-typed. Without this, a draft opened against one
  // workspace stays on screen under the next one. Both tenant ids are watched because each hook
  // guards its own synchronously, and the agreements drawer holds the more sensitive draft — a
  // client name bound to a negotiated amount.
  React.useEffect(() => { setEditor(null); setEditing(null); }, [sales.tenantId, agreements.tenantId]);

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

  const live = offers.offers.filter((offer) => offer.availability === "active");
  const awaiting = sales.orders.filter((o) => o.status === "pending" || o.status === "failed");
  const linkedDeals = deals.length;

  // ── the readiness answers ───────────────────────────────────────────────────────────────────
  const processorState = sales.processorUnrecognised ? "unknown"
    : sales.processor === null ? "none"
    : sales.processor === "not_yet" ? "warn"
    : "ok";

  const offersState = offers.phase === "error" ? "unknown"
    : live.length > 0 ? "ok"
    : offers.offers.length > 0 ? "warn"
    : "none";

  const activityState = !sales.ordersReadable ? "unknown"
    : awaiting.length > 0 ? "warn"
    : sales.orders.length > 0 ? "ok"
    : "none";

  // "Live" is active or paused — a paused retainer is still an arrangement that exists, and
  // counting it as gone would understate what the business has running.
  const liveAgreements = agreements.agreements
    .filter((a) => a.status === "active" || a.status === "paused").length;

  // UNREADABLE is not NONE, and the disjunct order matters: `clientsReadable` is derived from
  // authority rather than from an error, because a member's denied read on `clients` returns
  // 200/[]/no error. A caller who cannot read the client book but CAN see agreements is still
  // shown what they can see, rather than told their successful read failed.
  const agreementState = agreements.phase === "error" ? "unknown"
    : agreements.agreements.length > 0 ? (liveAgreements > 0 ? "ok" : "warn")
    : !agreements.agreementsReadable ? "unknown"
    : "none";

  // The one next step, chosen in the order a business actually gets set up: say what you sell,
  // then how you get paid for it. It names a real act on this screen — never "get started".
  const nextStep = offersState === "none"
    ? "Add what you sell. One name is enough to start."
    : processorState === "none" || processorState === "warn"
      ? "Record how your clients pay you."
      : offersState === "warn"
        ? "Publish an offer in Catalog so it can be sold."
        : agreementState === "none"
          ? "Record what your first client agreed to pay."
          : "Your commercial setup is recorded.";

  // The detail drawer `GrowthHub` already mounts (§18 — no second drawer). It shows the pair the
  // whole snapshot exists for: what this client agreed, beside what the catalog listed when it was
  // recorded. Labelled so the two can never be mistaken for each other, and dated, because a
  // snapshot without its date is not evidence.
  const openAgreement = (row, client, offer) => setDetail({
    title: client?.name || "Client terms",
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
      ["Starts", row.startsOn ? when(row.startsOn) : "Not stated"],
      ["Ends", row.endsOn ? when(row.endsOn) : "Not stated"],
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

  return (
    <div className="so">
      {editor === "payment" ? <PaymentEditor data={sales} onClose={() => setEditor(null)} /> : null}
      {editor === "offer" ? (
        <QuickOffer
          offers={offers}
          tenantId={offers.tenantId}
          onClose={() => setEditor(null)}
          onCreated={() => setEditor(null)}
        />
      ) : null}
      {editor === "agreement" ? (
        <AgreementEditor
          agreements={agreements}
          offers={offers}
          tenantId={agreements.tenantId}
          existing={editing}
          onClose={() => { setEditor(null); setEditing(null); }}
        />
      ) : null}

      {/* ── readiness ─────────────────────────────────────────────────────────────────────── */}
      <section className="so-band">
        <div className="so-band-head">
          <h3>Where this business stands</h3>
          {truth ? <span className={`campaigns-truth campaigns-truth--${String(truth[0]).toLowerCase()}`}>{truth[0]}</span> : null}
          <small>Each answer is a record that exists, or honestly does not.</small>
        </div>
        {truth ? <p className="so-orient">{truth[1]}</p> : null}

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

        <ReadyRow
          state={offersState}
          label="What you sell"
          detail={
            offers.phase === "error"
              ? "Your offers could not be read, so this is unknown rather than empty."
              : offers.offers.length === 0
                ? "Nothing recorded yet."
                : `${live.length} live of ${offers.offers.length} recorded.`
          }
          action={offers.canManage ? (
            <button className="btn btn-s btn-p" onClick={() => setEditor("offer")}>Quick offer</button>
          ) : null}
        />

        <ReadyRow
          // §58 — this REPLACES the shipped row that said "Not here". That row's own docstring
          // gave the reason it could not say more: "this row reads nothing, so it cannot say a
          // workspace HAS none." It reads something now, so it can. The Command Center caveat it
          // carried still stands and is why the word "retainer" is not put on a COUNT here:
          // Command Center counts "Active retainers" from `tenant_service_subscriptions`, a
          // different table, and two surfaces counting retainers from two sources is a §57
          // divergence waiting to happen. That reconciliation is its own tracked item.
          state={agreementState}
          label="What each client pays you"
          detail={
            // `agreementsReadable`, not `clientsReadable`. Proxying off the client read fails for a
            // coach: their client read succeeds on assigned clients while the agreements read is
            // row-filtered to the same subset, so a coach in a workspace holding twelve would be
            // told "Nothing recorded yet."
            !agreements.agreementsReadable && agreements.agreements.length === 0
              ? "Client terms are not readable at your access level, so this is unknown rather than empty."
              : agreements.agreements.length === 0
                ? "Nothing recorded yet."
                : liveAgreements > 0
                  ? `${liveAgreements} live of ${agreements.agreements.length} recorded.`
                  : `${agreements.agreements.length} recorded, none live yet.`
          }
          action={agreements.canManage ? (
            <button className="btn btn-s btn-p" onClick={() => { setEditing(null); setEditor("agreement"); }}>
              Record terms
            </button>
          ) : (
            <span className="so-quiet">
              {agreements.authorityUnknown
                ? "Whether you can change this could not be read."
                : "An owner or admin records this."}
            </span>
          )}
        />

        <ReadyRow
          state={activityState}
          label="Payments and invoices"
          detail={
            !sales.ordersReadable
              ? "Commercial activity is not readable at your access level, so this is unknown rather than empty."
              : awaiting.length > 0
                ? `${awaiting.length} awaiting attention of ${sales.orders.length} recent.`
                : sales.orders.length > 0
                  ? `${sales.orders.length} recent, none awaiting you.`
                  : "Nothing recorded yet."
          }
        />

        <ReadyRow
          // The Campaigns snapshot returns `deals: []` for resolving, loading, unavailable AND
          // error alike, so counting length alone reported "no deals" to a workspace whose deal
          // read had FAILED. That is the collapse this row's own docstring forbids, and for the
          // error case it was permanent rather than a first-paint flash.
          state={dealsPhase !== "ready" ? "unknown" : linkedDeals > 0 ? "ok" : "none"}
          label="Linked pipeline work"
          detail={dealsPhase !== "ready"
            ? "Your pipeline could not be read, so this is unknown rather than empty."
            : linkedDeals > 0
              ? `${linkedDeals} deal${linkedDeals === 1 ? "" : "s"} on the board.`
              : "No deals on the board yet."}
        />

        <p className="so-next"><b>Next</b> {nextStep}</p>
      </section>

      {/* ── what this business sells ──────────────────────────────────────────────────────── */}
      <section className="so-band">
        <div className="so-band-head">
          <h3>What you sell</h3>
          <small>Catalog owns these records. Changing one changes it everywhere.</small>
          <span style={{ flex: 1 }} />
          {onOpenCatalog ? (
            <button className="btn btn-s" onClick={onOpenCatalog}>Open Catalog <Ic.arrow size={12} /></button>
          ) : null}
        </div>

        {offers.phase === "error" ? (
          <p className="so-absent" role="alert">
            Your offers could not be read. Your records were not changed.
          </p>
        ) : offers.offers.length === 0 ? (
          <p className="so-absent">
            Nothing is listed yet. An offer can be a program, a service, a download, a product, a
            consultation or a retainer — a name is all it needs to start.
          </p>
        ) : (
          <div className="so-table" role="table" aria-label="Offers">
            <div className="so-tr so-th" role="row">
              <span role="columnheader">Offer</span>
              <span role="columnheader">Kind</span>
              <span role="columnheader">State</span>
              <span role="columnheader">Price</span>
              <span role="columnheader">Charged</span>
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
      </section>

      {/* ── what each client pays ─────────────────────────────────────────────────────────── */}
      <section className="so-band">
        <div className="so-band-head">
          <h3>Agreements and retainers</h3>
          {/* Disambiguated in place rather than renamed. "Agreement" already means a SIGNED
            * DOCUMENT everywhere else in this product — including `clients.agreement_signed_at`
            * on the very table this reads, and an "Agreements" card on the same client's portal
            * panel. This sentence is what stops an owner opening this expecting to send a PDF.
            * It is also §38 statement #1 of exactly two on this band. */}
          <small>
            What each client agreed to pay for one of your offers. Recording it bills nobody and
            sends nothing — signing and documents stay with the client’s own record.
          </small>
        </div>

        {agreements.phase === "error" ? (
          <p className="so-absent">
            Your client terms could not be read, so this is unknown rather than empty. Nothing was
            changed.{" "}
            <button className="btn btn-s" onClick={agreements.retry}>
              <Ic.arrow size={13} />Retry
            </button>
          </p>
        ) : !agreements.agreementsReadable && agreements.agreements.length === 0 ? (
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
              : offers.offers.length === 0
                ? "These terms attach a client to one of your offers, and nothing is recorded in your catalog yet. Add what you sell above first."
                : "Nothing recorded yet. Pick a client and one of your offers, then write down what they actually agreed to pay — the amount, how often, and when it starts."}
          </p>
        ) : (
          <div className="so-table" role="table" aria-label="Agreements and retainers">
            <div className="so-tr so-th so-tr-4" role="row">
              <span role="columnheader">Client</span>
              <span role="columnheader">State</span>
              <span role="columnheader">Agreed</span>
              <span role="columnheader">Terms</span>
            </div>
            {agreements.agreements.map((row) => {
              const state = AGREEMENT_STATE[row.status] || AGREEMENT_STATE.unrecognised;
              const client = agreements.clients.find((c) => c.id === row.contactId);
              const offer = offers.offers.find((o) => o.id === row.offerId);
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
            No payments recorded. When money moves through your own processor and reaches this
            workspace, the payments appear here as recorded — never estimated.
          </p>
        ) : (
          <div className="so-table" role="table" aria-label="Commercial activity">
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
          </div>
        )}
      </section>
    </div>
  );
}

export default SalesOps;
