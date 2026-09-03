// @ts-nocheck
// Campaigns → Catalog → Offers — the tenant's commercial definition layer (Slice 2A, read).
//
// SCOPE, STATED SO NOBODY HAS TO INFER IT. This slice READS. It creates nothing, changes nothing
// and charges nothing. The governed create/update/activate/pause/archive/restore seam is Slice 2B;
// the offer↔asset relationship is 2C; the typed deal reference is 2D. Where a capability is not
// here yet, the surface says so in words rather than showing a control that does nothing.
//
// VOCABULARY PROVENANCE. Product/Service, the delivery shapes, the four lifecycle states and the
// price-presentation set are the owner's Gate 1 ruling. The card anatomy — kind glyph, name and
// summary, state pill, price line, the honest em-dash for an unstated price — is ported from the
// delivered pack (`PAIGE Super Admin Shell v3.dc.html` L458-L523) and its operator implementation
// (`src/operator/surfaces/campaigns/CatalogSurface.tsx`), so the two tiers read as one product.
// The two glyph paths below are the pack's own, verbatim from `paige-ia.js` L789-L790.
import React from "react";
import { Ic } from "./_shared";
import { useCatalogOffers } from "./useCatalogOffers";
import "./catalog-offers.css";

const KIND_GLYPH = {
  product: "M2.8 5.4 8 2.8l5.2 2.6v5.2L8 13.2l-5.2-2.6z M2.8 5.4 8 8l5.2-2.6 M8 8v5.2",
  service: "M5.2 4.6a2.8 2.8 0 1 0 5.6 0a2.8 2.8 0 1 0-5.6 0 M2.8 13.2c0-2.5 2.3-4 5.2-4s5.2 1.5 5.2 4",
};

const AVAILABILITY = {
  draft: { label: "Draft", tone: "var(--violet)", note: "Internal only. Nothing customer-facing presents it." },
  active: { label: "Active", tone: "var(--ok)", note: "Offered to customers right now." },
  paused: { label: "Paused", tone: "var(--warn)", note: "Temporarily not offered. Nothing is cancelled." },
  archived: { label: "Archived", tone: "var(--ink-3)", note: "Retired. Existing references stand." },
  // Not a state a tenant can set — what this build says when the record holds a value it has no
  // reading for. It claims nothing, and `conflictOf` stays silent because nothing here is active.
  unrecognised: { label: "State not recognised", tone: "var(--ink-3)",
    note: "This deployment has no reading for the state on this record. Nothing is assumed about it." },
};

const SHAPES = {
  digital: "Digital", physical: "Physical", appointment: "Appointment",
  program: "Program", membership: "Membership", hybrid: "Hybrid",
};

const ACTIONS = {
  buy: "Buy", book: "Book", apply: "Apply", enquire: "Request information", learn: "Learn more",
};

/** What `tenant_prices.kind` records, said in words. The sub-label is read from HERE, not inferred. */
const PLAN_KIND = {
  one_time: "One-time plan", deposit: "Deposit", recurring: "Recurring plan", installment: "Instalment plan",
};

const PRESENTATION = {
  fixed: "Fixed amount", from: "Starting at", contact: "Contact for pricing", none: "No price shown",
};

// The commercial kind is a RECORDED fact, never derived. `product_type` is billing cadence, and
// its only writer never sets 'service', so deriving from it labelled every retainer a "Product".
// Null means the tenant has not said, and the surface says exactly that.
const kindOf = (offer) => offer.kind;

/**
 * Whole units, grouped, from the minor units `tenant_prices` stores.
 * A RECORDED zero is a fact, not an absence: `unit_amount` allows 0, and a tenant who recorded a
 * free offer meant it. It reads "Free" — "$0" looks like a bug and "—" would erase a real answer.
 * An UNRECORDED amount is null and renders as an em-dash elsewhere. The two are not the same.
 */
function money(minorUnits, currency) {
  if (minorUnits === null || minorUnits === undefined || Number.isNaN(minorUnits)) return null;
  if (minorUnits === 0) return "Free";
  const major = minorUnits / 100;
  const symbol = !currency || currency.toLowerCase() === "usd" ? "$" : "";
  const suffix = symbol ? "" : ` ${String(currency).toUpperCase()}`;
  return `${symbol}${major % 1 === 0 ? major.toLocaleString("en-US") : major.toFixed(2)}${suffix}`;
}

/** The lowest recorded active price — what "starting at" actually means against the record. */
function leadPrice(offer) {
  const usable = offer.prices.filter((price) => price.active && typeof price.unitAmount === "number");
  if (!usable.length) return null;
  return usable.reduce((low, price) => (price.unitAmount < low.unitAmount ? price : low), usable[0]);
}

/** How many distinct active priced plans the tenant recorded. More than one is not "fixed". */
const activePlanCount = (offer) =>
  offer.prices.filter((price) => price.active && typeof price.unitAmount === "number").length;

/**
 * `tenant_prices` is multi-plan by design (deposit, instalment, recurring), and for TWO of those
 * kinds `unit_amount` is not the whole price. An instalment's figure is per-instalment, so printing
 * it bare turns a $3,000 program into "$500 · Fixed amount". A recurring plan's figure is
 * per-period, so printing it bare turns a $99/month retainer into a one-off "$99" — on the surface
 * whose whole purpose is to be the one true price, and in disagreement with this offer's own detail
 * drawer, which does print the interval. Both are shown qualified, never as a single number.
 *
 * The per-period test keys on `billing_interval`, not on `kind`, because that is the column that
 * actually carries the period and it is what the drawer reads. A row that records an interval is
 * therefore qualified however it was written, not only one whose kind happens to say so.
 */
function qualifiedPrice(plan) {
  if (!plan || typeof plan.unitAmount !== "number") return null;
  const each = money(plan.unitAmount, plan.currency);
  if (!each) return null;
  // The sub-label names the RECORDED kind, never the branch that fired. Deriving it from the
  // branch labelled a deposit-with-an-interval a "Recurring plan" — trading one wrong statement
  // about the record for another.
  // An unrecognised plan kind says so, rather than rendering a bare figure with no sub-label at
  // all. Silence reads as "nothing more to say about this price"; this record has something to
  // say and this build cannot read it.
  // `Object.hasOwn`, not a bare lookup: PLAN_KIND["constructor"] returns a FUNCTION off the
  // prototype, which is truthy, so `?? null` never fired and the sub-label rendered as nothing.
  // The adapter now narrows `kind`, so an unreadable one arrives as null and says so here.
  const kindNote = plan.kind && Object.hasOwn(PLAN_KIND, plan.kind)
    ? PLAN_KIND[plan.kind]
    : "Plan type not recognised";
  const period = plan.billingInterval && plan.billingInterval !== "one_time" ? plan.billingInterval : null;

  if (plan.kind === "installment") {
    return {
      text: plan.installmentsTotal ? `${each} × ${plan.installmentsTotal}` : `${each} per instalment`,
      note: kindNote,
    };
  }
  // A recurring plan is per-period WHETHER OR NOT the period was recorded. Keying only on the
  // interval left `{kind:"recurring", billing_interval:null|"one_time"}` rendering the original
  // flat "$99 · Fixed amount" — and `tenant-product-upsert` does no cross-field validation, so
  // that row is writable through the callable seam (§10) even though this panel cannot make it.
  if (plan.kind === "recurring") {
    return period
      ? { text: `${each} / ${period}`, note: kindNote }
      : { text: each, note: "Recurring plan — period not recorded" };
  }
  // A non-recurring kind that nonetheless carries a period: report both recorded facts rather
  // than picking one and asserting it.
  if (period) return { text: `${each} / ${period}`, note: kindNote };

  // Returning null here was the THIRD recurrence of one defect, one branch further out each time:
  // no object means no note, which means the render falls through to the presentation label and
  // prints "Fixed amount". The `qualified` flag added to close this class never fired, because
  // there was nothing to carry it. Two shapes reach it, and one is live TODAY through the shipped
  // Storefront panel — which sends `billing_interval: "one_time"` for every non-recurring kind, so
  // a deposit-only product renders "$500 · Fixed amount" when a deposit is, by definition, not the
  // whole price. The other is a kind this build cannot read, which proves nothing either way.
  //
  // A recognised one-off with no period is the ONE case where the tenant's own presentation label
  // is the right thing to print, so it alone still returns null.
  return plan.kind === "one_time" ? null : { text: each, note: kindNote };
}

/**
 * What the price line says. An offer with a price to show but no amount recorded renders an
 * em-dash, never `$0` — a zero asserts a reading, an em-dash states an absence.
 */
function priceLine(offer) {
  const presentation = offer.pricePresentation;
  if (presentation === "contact") return { text: "Contact for pricing", unstated: true };
  if (presentation === "none") return { text: "No price shown", unstated: true };
  const lead = leadPrice(offer);
  const amount = lead ? money(lead.unitAmount, lead.currency) : null;
  if (!presentation && !amount) return { text: "No price stated", unstated: true };
  if (!amount) return { text: "—", unstated: true };
  // Several priced plans cannot honestly be one "fixed amount"; the lowest is a floor, not the price.
  const several = activePlanCount(offer) > 1;
  const floor = several || presentation === "from";
  // A qualified figure carries its own arithmetic, so the presentation label beneath it would be
  // wrong twice over: it is not one fixed amount, and the figure shown is already qualified.
  const qualified = qualifiedPrice(lead);
  if (qualified) {
    return {
      text: floor ? `From ${qualified.text}` : qualified.text,
      unstated: false,
      // The record-derived note WINS. Letting "Several plans recorded" replace it put a recurring
      // plan with no recorded period back to a flat "From $99" with nothing saying it is
      // per-period — the F1 defect surviving one branch over, and on the likelier shape, since a
      // recurring plan usually sits beside a one-off. That there are several plans is already
      // carried by the `From ` prefix; that this one is per-period is carried by nothing else.
      note: qualified.note,
      // The presentation label is only ever meaningful beneath an UNQUALIFIED single figure.
      // Carrying this flag closes the defect class rather than one instance of it: `PLAN_KIND`
      // is a map, `tenant_prices_kind_check` is a CHECK, and the day a fifth kind is added to
      // the constraint without the map, a null note would drop straight through to the
      // presentation fallback and print "Fixed amount" over a "/ month" figure — the same lie,
      // rebuilt one level up. A qualified figure now suppresses the label whatever the note is.
      qualified: true,
    };
  }
  return {
    text: floor ? `From ${amount}` : amount,
    unstated: false,
    note: several ? "Several plans recorded" : undefined,
  };
}

/**
 * The derived-conflict line the owner asked for: say it out loud when the record contradicts what
 * the tenant claimed. Every branch compares two RECORDED facts. Nothing is inferred from absence
 * of data elsewhere, and no conflict is reported for a draft or archived offer, which are not
 * claiming to be sellable in the first place.
 */
function conflictOf(offer) {
  if (offer.availability !== "active") return null;
  if (!offer.pricePresentation) {
    return "Marked active, but how the price should be shown has not been stated yet.";
  }
  if ((offer.pricePresentation === "fixed" || offer.pricePresentation === "from") && !leadPrice(offer)) {
    return "Marked active with a price to show, but no amount is recorded against it.";
  }
  return null;
}

function OfferRow({ offer, onOpen }) {
  const state = AVAILABILITY[offer.availability];
  const price = priceLine(offer);
  const conflict = conflictOf(offer);
  const kind = kindOf(offer);
  const kindLabel = kind === "service" ? "Service" : kind === "product" ? "Product" : "Kind not stated";
  return (
    <button
      type="button"
      className="co-row"
      onClick={() => onOpen(offer)}
      /* No aria-label. An aria-label REPLACES the element's contents for name computation, so
         naming the row "{name} - {state}" made the price, and the whole derived-conflict sentence
         that is this surface's honesty device, inaudible to a screen reader. The contents ARE the
         name: title, summary, price, qualifier, delivery, state, and the conflict when there is
         one. */
    >
      <span className="co-head">
        <span className="co-kind" title={kindLabel} data-kind={kind ?? "unstated"}>
          {/* The glyph says nothing to a screen reader and `title` on a span is not reliably
              announced, so the kind is carried as real text. */}
          <span className="sr-only">{kindLabel}</span>
          <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor"
            strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            {/* No recorded kind gets a neutral mark, not a guessed one. */}
            <path d={kind ? KIND_GLYPH[kind] : "M8 3.4a4.6 4.6 0 1 0 0 9.2a4.6 4.6 0 1 0 0-9.2"} />
          </svg>
        </span>
        <span style={{ minWidth: 0 }}>
          <b className="co-name">{offer.name || "Untitled offer"}</b>
          <small className="co-summary">
            {offer.summary || offer.description || "No description written yet."}
          </small>
        </span>
        <span className="co-price">
          <b className={price.unstated ? "is-unstated" : ""}>{price.text}</b>
          {/* The presentation label only earns its line when it adds something the value does not
              already say. "Contact for pricing" IS the value for that presentation, so printing
              the label underneath repeated it word for word — caught in the rendered frame. */}
          {/* One sub-label at most: the qualifier when the figure needed one, otherwise the
              tenant's chosen presentation — and never when it would just repeat the value. */}
          {price.note
            ? <small>{price.note}</small>
            : offer.pricePresentation && !price.unstated && !price.qualified
              ? <small>{PRESENTATION[offer.pricePresentation]}</small>
              : null}
        </span>
        <span className="co-shape">
          {offer.deliveryShape ? SHAPES[offer.deliveryShape] : offer.category || ""}
        </span>
        <span className="co-state" style={{ color: state.tone }} title={state.note}>
          <i /> {state.label}
        </span>
      </span>
      {conflict ? (
        <span className="co-conflict">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor"
            strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M12 4.5l8.5 15h-17zM12 10v4M12 16.6v.4" />
          </svg>
          <span>{conflict}</span>
        </span>
      ) : null}
    </button>
  );
}

function FirstUse({ canManage }) {
  return (
    <div className="co-first">
      <div>
        <Ic.grid size={26} />
        <h3>Nothing is listed yet</h3>
        <p>
          Catalog is where this business says what it sells — a coaching program, a chair service,
          a download, a product on a shelf, a consultation, a retainer. Once an offer is defined
          here, Campaigns, Pipeline and Vibe Studio can refer to it instead of keeping their own copy.
        </p>
        <div className="co-examples">
          <span>a twelve-week program</span>
          <span>a haircut</span>
          <span>a PDF</span>
          <span>a monthly retainer</span>
          <span>a discovery call</span>
        </div>
        <p style={{ fontSize: "11.5px", color: "var(--ink-3)" }}>
          {canManage
            ? "Adding and editing offers arrives on this screen in the next release. Nothing is missing from your account — this list is simply empty."
            : "An owner or admin defines what this business sells."}
        </p>
      </div>
    </div>
  );
}

/**
 * The Offers half of Catalog. `setDetail` is the campaigns drawer already mounted by `GrowthHub`,
 * so this surface adds no second drawer (§18) and inherits its focus trap and Escape handling.
 */
/**
 * Two notices about the RECORD itself, as opposed to its contents. They lived below the empty-state
 * return, which made them dead code for every tenant on production: `tenant_products` holds zero
 * rows, so every workspace renders FirstUse, and the deploy-order notice — the one that explains why
 * a field the tenant filled in reads "Not stated" — could never appear for anybody. A truth device
 * reachable only in a state nobody is in is not a truth device.
 */
function RecordNotices({ data }) {
  return (
    <>
      {data.fieldsUnavailable ? (
        <p className="co-notice">
          <Ic.clock size={15} />
          <span>Some offer details are not available on this deployment yet, so they read as “Not stated”
            here even where you have filled them in. This resolves when the pending update is applied.</span>
        </p>
      ) : null}

      {data.authorityUnknown ? (
        <p className="co-notice">
          <Ic.shield size={15} />
          <span>Your permissions for this workspace could not be read just now, so nothing is assumed
            about what you may change. Reload to try again.</span>
        </p>
      ) : null}
    </>
  );
}

export function CatalogOffers({ setDetail }) {
  const data = useCatalogOffers();
  // `null` is "everything", NOT a sentinel string. `category` on tenant_products is deliberately
  // unconstrained free text — the tenant's own words — so any string we reserved as a sentinel
  // would be a category a tenant could legitimately name, and its chip would then filter to
  // everything while claiming a count of its own. Unreachable until 2B ships the write seam;
  // fixed here rather than left for the slice that makes it reachable.
  const [category, setCategory] = React.useState(null);

  React.useEffect(() => { setCategory(null); }, [data.tenantId]);

  if (data.phase === "resolving") {
    return (
      <div className="campaigns-state" role="status">
        <span className="campaigns-spinner" />
        Resolving this account’s Campaigns workspace…
      </div>
    );
  }
  if (data.phase === "loading") {
    return (
      <div className="campaigns-skeleton" role="status" aria-label="Loading offers">
        <span /><span /><span />
      </div>
    );
  }
  if (data.phase === "unavailable") {
    return (
      <div className="campaigns-state">
        <span className="campaigns-truth campaigns-truth--unavailable">UNAVAILABLE</span>
        <h2>Campaigns needs a resolved workspace</h2>
        <p>No tenant data is read until your account context is confirmed.</p>
      </div>
    );
  }
  if (data.phase === "error") {
    return (
      <div className="campaigns-state" role="alert">
        <span className="campaigns-truth campaigns-truth--unavailable">UNAVAILABLE</span>
        <h2>Offers could not load</h2>
        <p>Your records were not changed. Try the tenant-scoped read again.</p>
        <button className="btn btn-s" onClick={data.retry}><Ic.arrow size={13} />Retry</button>
      </div>
    );
  }

  if (data.offers.length === 0) {
    return (
      <>
        <RecordNotices data={data} />
        <FirstUse canManage={data.canManage || data.authorityUnknown} />
      </>
    );
  }

  const categories = [...new Set(data.offers.map((offer) => offer.category).filter(Boolean))];
  const shown = category === null
    ? data.offers
    : data.offers.filter((offer) => offer.category === category);
  const tally = shown.length === data.offers.length
    ? `${data.offers.length} offer${data.offers.length === 1 ? "" : "s"}`
    : `${shown.length} of ${data.offers.length} shown`;

  const openDetail = (offer) => {
    const price = priceLine(offer);
    const conflict = conflictOf(offer);
    setDetail({
      title: offer.name || "Untitled offer",
      rows: [
        ["Type", kindOf(offer) === "service" ? "Service" : kindOf(offer) === "product" ? "Product" : "Not stated"],
        ["Availability", AVAILABILITY[offer.availability].label],
        ["How the price is shown", offer.pricePresentation ? PRESENTATION[offer.pricePresentation] : "Not stated"],
        ["Price shown", price.text],
        ["Recorded plans", offer.prices.length
          ? offer.prices
              .map((plan) => {
                const amount = money(plan.unitAmount, plan.currency);
                // Never the raw enum. `plan.kind` is a backend token, so a plan with no
                // nickname printed "recurring — $99 / month" to a tenant (§11), and an unreadable
                // kind printed a generic "Plan" while the row correctly said it could not be read.
                // Both are the drawer disagreeing with its own row about the same record.
                const label = plan.nickname
                  || (plan.kind && Object.hasOwn(PLAN_KIND, plan.kind)
                    ? PLAN_KIND[plan.kind]
                    : "Plan type not recognised");
                const interval = plan.billingInterval && plan.billingInterval !== "one_time"
                  ? ` / ${plan.billingInterval}` : "";
                return `${label} — ${amount ?? "no amount"}${interval}${plan.active ? "" : " (inactive)"}`;
              })
              .join("\n")
          : "None recorded"],
        ["Delivery", offer.deliveryShape ? SHAPES[offer.deliveryShape] : "Not stated"],
        ["Category", offer.category || "Not stated"],
        ["Customer action", offer.customerAction ? ACTIONS[offer.customerAction] : "Not stated"],
        ["Description", offer.description || "Not recorded"],
      ],
      note: conflict
        ? `${conflict} Nothing on this surface charges anybody, and no page or form is changed by what is recorded here.`
        : "Offer facts are recorded here and nowhere else, so a page or form never carries its own price. Nothing on this surface charges anybody.",
    });
  };

  return (
    <>
      <div className="co-filters">
        <button
          type="button"
          className="co-filter"
          aria-pressed={category === null}
          title="Every offer in every state"
          onClick={() => setCategory(null)}
        >
          Everything<b>{data.offers.length}</b>
        </button>
        {categories.map((name) => (
          <button
            key={name}
            type="button"
            className="co-filter"
            aria-pressed={category === name}
            title="Your category"
            onClick={() => setCategory(name)}
          >
            {name}<b>{data.offers.filter((offer) => offer.category === name).length}</b>
          </button>
        ))}
      </div>

      <RecordNotices data={data} />

      {!data.authorityUnknown && !data.canManage ? (
        <p className="co-notice">
          <Ic.shield size={15} />
          <span>You can see this catalog but not change it. An owner or admin defines what this business sells.</span>
        </p>
      ) : null}

      <div className="co-list">
        {shown.map((offer) => <OfferRow key={offer.id} offer={offer} onOpen={openDetail} />)}
      </div>

      <p className="co-note">
        Price, availability and delivery are recorded here and nowhere else, so a page or a form
        never carries its own price. A listed price is how the offer is presented — it is not a
        checkout, and nothing on this surface charges anybody.
      </p>

      <div className="co-foot">
        <small>An offer is what this business sells · availability, presentation and delivery travel together</small>
        <small className="mono">{tally}</small>
      </div>
    </>
  );
}
