/**
 * The Campaigns money spine — ONE contract, three surfaces.
 *
 * BUILD-ORDER Layer 3b groups Active, Catalog and Sales deliberately: *"All three read
 * `P.CAMP_SCHEMA` and `P.CARD_FACTS`; Active's `Sells`/`Booked` is the join from a campaign to a
 * catalogue row. Sales is entirely derived — every figure a sum over the lines, nothing typed.
 * Port the three together or the join has nothing to join."* So the vocabulary lives here once
 * and the three components read it, rather than each transcribing it and drifting.
 *
 * Everything in this file is TRANSCRIPTION from `paige-ia.js` (L769–L900) and
 * `PAIGE Super Admin Shell v3.dc.html`'s `schema()` / `clampGrant()` (L5710–L5724, L5300–L5305). The labels, notes, glyph paths and
 * definitions are Claude Design's words; nothing here is authored.
 *
 * ─── WHAT IS DELIBERATELY ABSENT ─────────────────────────────────────────────────────────────
 *
 * The pack's `P.CAMPAIGNS`, `P.CATALOG` and `P.SALES` fixture rows are NOT transcribed. They are
 * CD's illustration — named campaigns, priced offerings, closed lines with amounts — and
 * shipping them would put invented revenue on an operator's screen. BUILD-ORDER's rule is
 * structure before data: the shape ports, unbacked figures render em-dashes, and the surfaces
 * fill in at Layer 6 when a read exists. A surface with correct geometry and honest em-dashes is
 * finished work; one with plausible numbers and no read behind it is what got this console
 * rejected twice.
 */

/** `--pg-*` names map onto the shipped token set; never a hex (§11). */
export type ToneVar = string;

/** `P.CAMP_KINDS` — L769–L776. `glyph` is the SVG path, verbatim. */
export const CAMPAIGN_KINDS = {
  outbound: {
    label: "Outbound",
    glyph: "M2.5 8h9 M8.5 4.5 12 8l-3.5 3.5",
    note: "We initiate, against a segment",
  },
  lifecycle: {
    label: "Lifecycle",
    glyph: "M3 11.5a5 5 0 1 1 10 0 M8 3v4.5",
    note: "A record changing state triggers it",
  },
  recurring: {
    label: "Recurring",
    glyph: "M8 2.5a5.5 5.5 0 1 0 5.2 3.7 M13.5 2.5v3.8h-3.8",
    note: "The clock triggers it",
  },
  seo: {
    label: "SEO",
    glyph: "M6.8 3.2a3.6 3.6 0 1 0 0 7.2a3.6 3.6 0 1 0 0-7.2 M9.6 9.6l3.4 3.4",
    note: "Nothing is sent — a step publishes an asset",
  },
} as const;
export type CampaignKind = keyof typeof CAMPAIGN_KINDS;

/**
 * `P.CAMP_STATES` — L778–L787. CD's own comment: *"Five states. Active holds the first three;
 * halted and done are reachable by filter but are not active by the definition above."*
 */
export const CAMPAIGN_STATES = {
  running: {
    label: "Running",
    tone: "hsl(var(--success))",
    active: true,
    note: "A step has gone and the motion has more to go",
  },
  holding: {
    label: "Holding",
    tone: "hsl(var(--gold-dark))",
    active: true,
    note: "The next step needs your word before it goes",
  },
  scheduled: {
    label: "Scheduled",
    tone: "hsl(var(--primary))",
    active: true,
    note: "Audience bound, first step has not gone",
  },
  halted: {
    label: "Halted",
    tone: "hsl(var(--destructive))",
    active: false,
    note: "Stopped between steps — delivered steps stand",
  },
  done: {
    label: "Done",
    tone: "hsl(var(--muted-foreground))",
    active: false,
    note: "Motion finished",
  },
} as const;
export type CampaignState = keyof typeof CAMPAIGN_STATES;

/**
 * `P.OFFER_KINDS` — L789–L794. CD's note above it: *"A campaign with no offer is a brand
 * campaign, which is legitimate. A campaign with one is bound to a row here, and the binding is
 * what lets Active show money."*
 */
export const OFFER_KINDS = {
  product: {
    label: "Product",
    glyph: "M2.8 5.4 8 2.8l5.2 2.6v5.2L8 13.2l-5.2-2.6z M2.8 5.4 8 8l5.2-2.6 M8 8v5.2",
    note: "Shipped as a thing",
  },
  service: {
    label: "Service",
    glyph:
      "M5.2 4.6a2.8 2.8 0 1 0 5.6 0a2.8 2.8 0 1 0-5.6 0 M2.8 13.2c0-2.5 2.3-4 5.2-4s5.2 1.5 5.2 4",
    note: "Delivered by people",
  },
  retainer: {
    label: "Retainer",
    glyph: "M8 2.6a5.4 5.4 0 1 0 5.1 3.6 M13.4 2.6v3.6H9.8 M8 5.6V8l2 1.4",
    note: "Recurring scope, not a fixed deliverable",
  },
  license: {
    label: "License",
    glyph: "M4.4 7.2h7.2v6H4.4z M6.2 7.2V5a1.8 1.8 0 0 1 3.6 0v2.2",
    note: "Access, not delivery",
  },
} as const;
export type OfferKind = keyof typeof OFFER_KINDS;

/** `P.OFFER_STATES` — L796–L801. */
export const OFFER_STATES = {
  selling: {
    label: "Selling",
    tone: "hsl(var(--success))",
    note: "On sale and reachable from at least one channel",
  },
  quiet: {
    label: "Quiet",
    tone: "hsl(var(--gold-dark))",
    note: "Priced and ready, nothing sells it right now",
  },
  draft: {
    label: "Draft",
    tone: "hsl(var(--primary))",
    note: "Not sellable — price or fulfilment unfinished",
  },
  retired: {
    label: "Retired",
    tone: "hsl(var(--muted-foreground))",
    note: "Off sale. Existing terms stand",
  },
} as const;
export type OfferState = keyof typeof OFFER_STATES;

/** `P.OFFER_CATEGORIES` · `P.SALES_STAGES` · `P.CLOSE_REASONS` — L795, L841–L843. */
export const OFFER_CATEGORIES = ["Platform", "Enablement", "Advisory"] as const;
export const SALES_STAGES = ["Quoted", "Verbal", "Signed", "Invoiced", "Paid"] as const;
export const CLOSE_REASONS = ["Won", "Price", "Timing", "No decision", "Lost to in-house"] as const;

/**
 * `P.CARD_FACTS` — L876–L883. CD's framing: *"The fact set is schema, not layout: a tenant
 * chooses which of these a card carries, and the two money facts only exist because a campaign
 * can bind to an offering. A fact nobody records reads as an em-dash rather than a guess."*
 */
export const CARD_FACTS = [
  { id: "step", label: "Step", note: "Position in the motion" },
  { id: "opened", label: "Opened", note: "Opens, where a channel reports them" },
  { id: "reach", label: "Reached", note: "How many the motion has touched" },
  { id: "grant", label: "PAIGE", note: "How much room she has on this campaign" },
  { id: "offer", label: "Sells", note: "The offer this campaign is bound to" },
  { id: "booked", label: "Booked", note: "Money attributed to this campaign" },
] as const;
export type CardFactId = (typeof CARD_FACTS)[number]["id"];

/** `P.CAMP_SCHEMA` — L884–L889, resolved through `schema()` (L5710–L5723). */
export type CampaignSchema = {
  readonly definition: string;
  readonly facts: readonly CardFactId[];
  readonly density: "full" | "compact";
  readonly stageWord: string;
  readonly cats: readonly string[];
  readonly stages: readonly string[];
  readonly reasons: readonly string[];
};

/**
 * The platform default. `schema()` layers a tenant's own overrides on top; at operator scope
 * there is no tenant, so the base IS the answer until the Adjust summon (`schemaVals`, Layer 4)
 * gives the operator somewhere to change it.
 */
export const DEFAULT_CAMPAIGN_SCHEMA: CampaignSchema = {
  definition: "Active = audience bound · motion unfinished · not halted",
  facts: ["step", "opened", "reach", "grant"],
  density: "full",
  stageWord: "Step",
  cats: OFFER_CATEGORIES,
  stages: SALES_STAGES,
  reasons: CLOSE_REASONS,
};

/**
 * ⚠ THE SCALE HERE DISAGREES WITH THE MARKETPLACE'S, AND THAT IS THE PACK'S DISAGREEMENT, NOT A
 * BUG TO FIX HERE. Both compare a grant against the same 0–4 Trust Compass rung; they map the
 * grant NAME onto it differently:
 *
 *              Observe   Draft only   Ask first   Act and report   Autonomous
 *   this file      1          1           2             2               4      (WEIGHT, v3 L5295)
 *   marketplace    0          1           2             3               4      (RANK,   v3 L10057)
 *
 * So "Act and report" reads AT a ceiling of 2 here and ABOVE it in the Marketplace. Recorded as
 * `PACK-INVENTORY-v3.md` §6 contradiction #8 and owed from CD. Do not reconcile one into the
 * other: each surface is ported verbatim until CD rules which scale is the platform's.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 *
 * `clampGrant` — L5300–L5305, and CD's comment is the reason it lives in the shared contract:
 *
 *   *"Any named grant answers to the ceiling on the SAME scale capabilities use: the label
 *   carries a weight, the ceiling is a weight, and the effective grant is the lower of the two.
 *   Inventing a second scale here is what made every agent read Held at the default."*
 *
 * So a campaign's grant runs through the SAME arithmetic as the Trust Compass tally
 * (`usePlatformTrust`), not a parallel one. A null ceiling means the platform holds no rung —
 * and then the grant is unknown rather than clamped, because clamping against a ceiling that
 * does not exist would report a gate that is not set (§13).
 */
const GRANT_WEIGHT: Record<string, number> = {
  Autonomous: 4,
  "Act and report": 2,
  "Ask first": 2,
  Observe: 1,
  "Draft only": 1,
};

export function clampGrant(label: string, ceiling: number | null): string | null {
  if (ceiling === null) return null;
  const weight = GRANT_WEIGHT[label] === undefined ? 2 : GRANT_WEIGHT[label];
  const eff = Math.min(weight, ceiling);
  return eff <= 0 ? "Held" : eff >= 4 ? "Autonomous" : eff >= 2 ? "Ask first" : "Observe";
}

/**
 * `money()` — whole units, no cents, grouped. A figure with no amount behind it is an em-dash,
 * never a zero: `$0` asserts a reading, `—` states an absence.
 */
export function money(amount: number | null | undefined): string {
  if (amount === null || amount === undefined || Number.isNaN(amount)) return "—";
  return `$${Math.round(amount).toLocaleString("en-US")}`;
}

/** The row shapes the three surfaces read. A Layer 6 hook fills these; today they arrive empty. */
export type CampaignStep = {
  readonly name: string;
  /** `at` on a sent motion, `when` on a published one — the pack uses whichever the kind has. */
  readonly at: string;
  readonly done: boolean;
  readonly held: boolean;
  readonly body: string;
};

export type CampaignRow = {
  readonly id: string;
  readonly name: string;
  readonly kind: CampaignKind;
  readonly state: CampaignState;
  readonly channel: string;
  readonly segment: string;
  readonly grant: string;
  /** Null when the channel does not report it — an em-dash on the card, never a zero. */
  readonly opened: string | null;
  readonly reach: string | null;
  /** The catalogue row this campaign is bound to. Null is a brand campaign, which is legitimate. */
  readonly offerId: string | null;
  readonly steps: readonly CampaignStep[];
};

export type OfferTier = {
  readonly name: string;
  readonly price: number | null;
  readonly period: string;
  readonly what: string;
};

export type OfferRow = {
  readonly id: string;
  readonly name: string;
  readonly kind: OfferKind;
  readonly category: string;
  readonly state: OfferState;
  readonly price: number | null;
  readonly period: string;
  readonly unit: string;
  readonly pitch: string;
  readonly tiers: readonly OfferTier[];
  /** Campaign names that sell it. Empty renders CD's "Nothing sells it right now". */
  readonly where: readonly string[];
  readonly fulfil: readonly (readonly [string, string])[];
};

export type SalesLineState = "booked" | "pending" | "refunded";

export type SalesLine = {
  readonly id: string;
  readonly when: string;
  /** Sort key — the pack orders by `day` descending, newest first. */
  readonly day: number;
  readonly offerId: string;
  readonly tier: string;
  readonly who: string;
  /** The campaign it closed under. CD's own em-dash sentinel for a direct sale. */
  readonly camp: string;
  readonly stage: string;
  readonly state: SalesLineState;
  readonly amount: number | null;
};

/** `P.SALES_TARGET` — L844. A line on a chart, not a gate, in CD's own words. */
export type SalesTarget = {
  readonly period: string;
  readonly target: number | null;
  readonly note: string;
};

/**
 * `P.PROCESSOR` — L903–L917. This is the §38 money boundary in CD's words, and it agrees with
 * the doctrine exactly: the provider is an adapter, and *"No tenant sale is ever split. Revenue
 * share exists in the marketplace and nowhere else."*
 */
export const PROCESSOR = {
  deck:
    "Sales records are ours. Money movement is an adapter, so the provider can change without " +
    "touching a single sale.",
  needs: [
    ["Charge once", "One-time and quoted work", "Adapter"],
    ["Charge on a period", "Monthly and annual billing", "Adapter"],
    ["Refund a charge", "Reverses the line, keeps the record", "Adapter"],
    ["Report a payout", "When our money actually lands", "Adapter"],
    ["Split a payment", "Marketplace only — never tenant sales", "Stripe Connect"],
  ],
  adapters: [
    {
      name: "Stripe",
      state: "Wired at operator scope",
      tone: "hsl(var(--success))",
      note:
        "The platform operator account. Connect is required only for the marketplace split, and " +
        "that ruling is still open.",
    },
    {
      name: "Any other merchant provider",
      state: "Pluggable",
      tone: "hsl(var(--gold-dark))",
      note:
        "Satisfy the five needs above and the surface does not change. Planned before general " +
        "availability.",
    },
  ],
  foot: "No tenant sale is ever split. Revenue share exists in the marketplace and nowhere else.",
} as const;

/** Authored feet, verbatim from the three builders (L5288, L5824, L5959). */
export const CAMPAIGN_FOOT =
  "The step rail is the motion — a campaign holds no separate sequence, and a motion you want " +
  "to run again is published as a Template in the Marketplace rather than saved here. Halting " +
  "stops the next step and never retracts a step already delivered. Sends route through the " +
  "existing seam, so a send would be real, but no campaign here is running against real " +
  "recipients, and reach stays unread until the segment has a lifecycle field to count against.";

export const CATALOG_DEFINITION =
  "An offering is what a campaign binds to · price, tiers and fulfilment travel together";

export const CATALOG_FOOT =
  "Prices, tiers and fulfilment are records here and nowhere else, so a campaign never carries " +
  "its own price. Money movement is an adapter — see Sales. Nothing on this surface charges " +
  "anybody.";

export const SALES_DEFINITION =
  "A sale is a line: an offering, a tier, an amount, and the campaign it closed under";

export const SALES_FOOT =
  "Every figure above is summed from the lines, so nothing here is a typed total. What is " +
  "missing is the join between a send and a close: attribution is recorded on the line by hand " +
  "today, and a real one needs send-to-conversion history. No tenant sale is ever split.";

/**
 * The Campaigns slot's absence, authored on the design side (`absence-copy.md`) and lifted
 * verbatim. It states what is missing and WHY, which is what separates it from "coming soon":
 * it names the tables so the slot is not rebuilt from scratch, and names the one genuinely
 * absent seam so a wiring round does not assume the join exists and hit it at the join.
 */
export const CAMPAIGNS_ABSENCE = {
  title: "Substrate exists · one seam missing",
  body:
    "Catalog and Sales sit on tables that already ship — tenant_products, tenant_prices, " +
    "tenant_orders — so this slot is a wiring job rather than a build. One seam is genuinely " +
    "absent: an order cannot name a campaign. utm_campaign lives on analytics_events and " +
    "referral_clicks, never on the order, so send → click → order does not join. Until it does, " +
    "attribution is recorded by hand and Sales reads without it.",
} as const;
