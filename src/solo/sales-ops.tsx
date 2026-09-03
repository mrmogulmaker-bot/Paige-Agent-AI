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
import "./sales-ops.css";

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
  const tone = state === "ok" ? "ok" : state === "warn" ? "warn" : "none";
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
 * Returns the ref to put on the panel. The caller keeps its own Escape handling, because only the
 * caller knows whether a save is in flight.
 */
function useModalDialog(onClose, busy) {
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
  const panelRef = useModalDialog(onClose, busy);

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
          <button className="btn btn-s btn-g" onClick={save} disabled={busy || !processor}>
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
  const panelRef = useModalDialog(onClose, busy);

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
          <button className="btn btn-s btn-g" onClick={save} disabled={busy || !named}>
            {busy ? "Saving…" : "Create offer"}
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
export function SalesOps({ setDetail, deals = [], dealsPhase = "ready", onOpenCatalog }) {
  const sales = useSoloSalesOps();
  const offers = useCatalogOffers();
  const [editor, setEditor] = React.useState(null);

  // A workspace switch clears anything half-typed. Without this, a draft opened against one
  // workspace stays on screen under the next one.
  React.useEffect(() => { setEditor(null); }, [sales.tenantId]);

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

  // The one next step, chosen in the order a business actually gets set up: say what you sell,
  // then how you get paid for it. It names a real act on this screen — never "get started".
  const nextStep = offersState === "none"
    ? "Add what you sell. One name is enough to start."
    : processorState === "none" || processorState === "warn"
      ? "Record how your clients pay you."
      : offersState === "warn"
        ? "Publish an offer in Catalog so it can be sold."
        : "Your commercial setup is recorded. Agreements are the next thing this tab will hold.";

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

      {/* ── readiness ─────────────────────────────────────────────────────────────────────── */}
      <section className="so-band">
        <div className="so-band-head">
          <h3>Where this business stands</h3>
          <small>Each answer is a record that exists, or honestly does not.</small>
        </div>

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
            <button className="btn btn-s" onClick={() => setEditor("payment")}>
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
            <button className="btn btn-s" onClick={() => setEditor("offer")}>Quick offer</button>
          ) : null}
        />

        <ReadyRow
          // NOT `state="none"`. This row reads nothing, so it cannot say a workspace HAS none —
          // and `tenant_service_subscriptions` is already counted as "Active retainers" on Command
          // Center for this same owner, so asserting zero here would put two surfaces in
          // disagreement about one record. It states what is true of THIS TAB and nothing more.
          state="unknown"
          word="Not here"
          label="Client agreements, retainers and subscriptions"
          detail="This tab does not hold a per-client agreement record yet, so it reports none — see Command Center for recorded retainers."
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
                  <span role="cell" className="so-num">
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
