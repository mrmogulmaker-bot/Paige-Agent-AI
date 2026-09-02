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
};

const SHAPES = {
  digital: "Digital", physical: "Physical", appointment: "Appointment",
  program: "Program", membership: "Membership", hybrid: "Hybrid",
};

const ACTIONS = {
  buy: "Buy", book: "Book", apply: "Apply", enquire: "Request information", learn: "Learn more",
};

const PRESENTATION = {
  fixed: "Fixed amount", from: "Starting at", contact: "Contact for pricing", none: "No price shown",
};

/** A Product is shipped or delivered as a thing; everything else this tenant does is a Service. */
const kindOf = (offer) => (offer.productType === "service" ? "service" : "product");

/** Whole units, grouped, from the minor units `tenant_prices` stores. */
function money(minorUnits, currency) {
  if (minorUnits === null || minorUnits === undefined || Number.isNaN(minorUnits)) return null;
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
  return { text: presentation === "from" ? `From ${amount}` : amount, unstated: false };
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
  return (
    <button
      type="button"
      className="co-row"
      onClick={() => onOpen(offer)}
      aria-label={`${offer.name} — ${state.label}`}
    >
      <span className="co-head">
        <span className="co-kind" title={kind === "service" ? "Service" : "Product"}>
          <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor"
            strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d={KIND_GLYPH[kind]} />
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
          {offer.pricePresentation && !price.unstated
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
export function CatalogOffers({ setDetail }) {
  const data = useCatalogOffers();
  const [category, setCategory] = React.useState("all");

  React.useEffect(() => { setCategory("all"); }, [data.tenantId]);

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

  if (data.offers.length === 0) return <FirstUse canManage={data.canManage} />;

  const categories = [...new Set(data.offers.map((offer) => offer.category).filter(Boolean))];
  const shown = category === "all"
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
        ["Type", kindOf(offer) === "service" ? "Service" : "Product"],
        ["Availability", AVAILABILITY[offer.availability].label],
        ["How the price is shown", offer.pricePresentation ? PRESENTATION[offer.pricePresentation] : "Not stated"],
        ["Price shown", price.text],
        ["Recorded plans", offer.prices.length
          ? offer.prices
              .map((plan) => {
                const amount = money(plan.unitAmount, plan.currency);
                const label = plan.nickname || plan.kind || "Plan";
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
          aria-pressed={category === "all"}
          title="Every offer in every state"
          onClick={() => setCategory("all")}
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

      {!data.canManage ? (
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
