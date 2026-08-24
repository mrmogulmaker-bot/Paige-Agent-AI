import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import {
  CAMPAIGNS_ABSENCE,
  CATALOG_DEFINITION,
  CATALOG_FOOT,
  DEFAULT_CAMPAIGN_SCHEMA,
  OFFER_KINDS,
  OFFER_STATES,
  money,
  type CampaignRow,
  type CampaignSchema,
  type OfferRow,
  type SalesLine,
} from "@/operator/surfaces/campaigns/campaignContract";

/**
 * Campaigns · Catalog — ported from `PAIGE Super Admin Shell v3.dc.html` `catVals` (L5743–L5827) and its markup (L448–L531).
 *
 * BUILD-ORDER Layer 3b, and the second of the two views on Layer 2's priority list: this
 * replaces `revenue/plans` + `revenue/metering`, the retired console's billing panels standing
 * where the catalogue belongs.
 *
 * ─── WHAT AN OFFERING IS ─────────────────────────────────────────────────────────────────────
 *
 * CD's definition, in the strip at the foot: *"An offering is what a campaign binds to · price,
 * tiers and fulfilment travel together."* That is the whole architectural point of the surface,
 * and the foot says the consequence out loud: *"Prices, tiers and fulfilment are records here and
 * nowhere else, so a campaign never carries its own price."*
 *
 * Each card is five bands: identity (kind glyph · name and pitch · state pill), the headline
 * price and terms, the tier table where an offering has one, the two-column WHERE IT SELLS /
 * FULFILMENT split, and the fact strip with its acts. `Where it sells` is a set of buttons back
 * to the campaigns that sell it — the join, made walkable — and an offering nothing sells says
 * so in warning tone rather than showing an empty row.
 *
 * ─── STRUCTURE BEFORE DATA ───────────────────────────────────────────────────────────────────
 *
 * `offers` arrives empty. The pack's `P.CATALOG` is five priced offerings with real-looking
 * amounts, tier tables and fulfilment terms — shipping it would put a fabricated price list in
 * front of an operator, which is worse here than anywhere else on the console because a price
 * is a commitment. Layer 6 hands this real rows from `tenant_products` / `tenant_prices`, the
 * tables the slot's absence copy names.
 */

export type CatalogSurfaceProps = {
  readonly offers?: readonly OfferRow[];
  /** For the `Campaigns` fact — how many motions bind to this offering. */
  readonly campaigns?: readonly CampaignRow[];
  /** For `Booked` and `Sold` — summed from booked lines, never typed. */
  readonly lines?: readonly SalesLine[];
  readonly schema?: CampaignSchema;
  /** `openSchema` — Adjust, into `schemaVals` (Layer 4). */
  readonly onAdjust?: () => void;
  /** `catAdd` — New offering, into `offerVals` (Layer 4). */
  readonly onNewOffering?: () => void;
  /** `wh.go` — walk to the campaign that sells it. */
  readonly onOpenCampaign?: (name: string) => void;
  readonly onToggleOnSale?: (offer: OfferRow) => void;
  readonly onSellInCampaign?: (offer: OfferRow) => void;
};

export default function CatalogSurface({
  offers = [],
  campaigns = [],
  lines = [],
  schema = DEFAULT_CAMPAIGN_SCHEMA,
  onAdjust,
  onNewOffering,
  onOpenCampaign,
  onToggleOnSale,
  onSellInCampaign,
}: CatalogSurfaceProps) {
  const [category, setCategory] = useState<string>("all");

  const list = useMemo(
    () => (category === "all" ? offers : offers.filter((o) => o.category === category)),
    [offers, category],
  );

  const filters = useMemo(
    () => [
      { key: "all", label: "Everything", note: "Every offering in every state", n: offers.length },
      ...schema.cats.map((c) => ({
        key: c,
        label: c,
        note: "Your category",
        n: offers.filter((o) => o.category === c).length,
      })),
    ],
    [offers, schema.cats],
  );

  const tally =
    list.length === offers.length
      ? `${offers.length} offering${offers.length === 1 ? "" : "s"}`
      : `${list.length} of ${offers.length} shown`;

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col pt-3.5">
      {/* ── filters + the two doors · L449–L456 ────────────────────────────────────────── */}
      <div className="flex flex-none flex-wrap items-center gap-x-3.5 gap-y-[5px] border-b border-border/60 pb-[11px]">
        {filters.map((f) => {
          const on = category === f.key;
          return (
            <button
              key={f.key}
              type="button"
              title={f.note}
              onClick={() => setCategory(f.key)}
              className={cn(
                "inline-flex min-h-[28px] items-center gap-[7px] border-0 bg-transparent px-0.5 text-[12.5px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                on ? "font-medium text-foreground" : "text-muted-foreground",
              )}
              style={on ? { boxShadow: "inset 0 -1px 0 hsl(var(--gold-dark))" } : undefined}
            >
              {f.label}
              <b className="font-mono text-[10.5px] font-normal text-muted-foreground">{f.n}</b>
            </button>
          );
        })}
        <span className="min-w-[8px] flex-1" />
        <button
          type="button"
          onClick={onAdjust}
          disabled={!onAdjust}
          title="Rename kinds, states and categories"
          className="min-h-[28px] flex-none whitespace-nowrap rounded-full border border-border bg-card px-[9px] text-[11px] text-muted-foreground shadow-sm transition-colors hover:text-[hsl(var(--gold-dark))] disabled:opacity-50 disabled:hover:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          Adjust
        </button>
        {/* The one act on this surface, and the only gold on it (§11). */}
        <button
          type="button"
          onClick={onNewOffering}
          disabled={!onNewOffering}
          className="min-h-[28px] flex-none whitespace-nowrap rounded-full border border-[hsl(var(--gold-dark))] bg-[hsl(var(--accent)/0.12)] px-[9px] text-[11px] font-medium text-[hsl(var(--gold-dark))] shadow-sm transition-opacity hover:opacity-90 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          New offering
        </button>
      </div>

      {/* ── the cards · L458–L525 ──────────────────────────────────────────────────────── */}
      <div className="min-h-0 flex-1 overflow-auto pb-[22px] pr-3 pt-0.5 [scrollbar-gutter:stable]">
        {list.map((o) => {
          const kind = OFFER_KINDS[o.kind];
          const state = OFFER_STATES[o.state];
          const booked = lines.filter((x) => x.offerId === o.id && x.state === "booked");
          const gross = booked.reduce((a, x) => a + (x.amount ?? 0), 0);
          const bound = campaigns.filter((c) => c.offerId === o.id);

          const facts = [
            { k: "Booked", v: gross ? money(gross) : "—" },
            {
              k: "Sold",
              v: booked.length ? `${booked.length} ${booked.length === 1 ? "line" : "lines"}` : "—",
            },
            { k: "Campaigns", v: bound.length ? String(bound.length) : "—" },
          ];

          return (
            <div key={o.id} className="border-b border-border/60 pb-4 pt-[17px]">
              <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3">
                <span
                  title={`${kind.label} — ${kind.note}`}
                  className="grid h-[30px] w-[30px] place-items-center rounded-full border border-border text-[hsl(var(--gold-dark))]"
                >
                  <svg viewBox="0 0 16 16" className="h-[13px] w-[13px]" aria-hidden>
                    <path
                      d={kind.glyph}
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.3"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </span>
                <span className="flex min-w-0 flex-col">
                  <b className="truncate text-[15px] font-medium tracking-[-0.008em]">{o.name}</b>
                  <small className="mt-[3px] text-[11.5px] text-muted-foreground [text-wrap:pretty]">
                    {o.pitch}
                  </small>
                </span>
                <span
                  title={state.note}
                  className="inline-flex min-h-[24px] flex-none items-center gap-1.5 whitespace-nowrap rounded-full border border-border px-[9px] text-[11px] font-medium"
                  style={{ color: state.tone }}
                >
                  <i
                    aria-hidden
                    className="h-[5px] w-[5px]"
                    style={{ rotate: "45deg", background: state.tone }}
                  />
                  {state.label}
                </span>
              </div>

              {/* headline price · L471–L474. An unpriced offering says so rather than showing $0. */}
              <div className="mt-[13px] flex flex-wrap items-baseline gap-x-3.5 gap-y-[5px]">
                <b
                  className={cn(
                    "font-mono text-[17px] font-medium tabular-nums",
                    o.price === null ? "text-muted-foreground" : "text-foreground",
                  )}
                >
                  {o.price === null ? "—" : money(o.price)}
                </b>
                <small className="text-[11px] text-muted-foreground">
                  {o.period}
                  {o.unit ? ` · ${o.unit}` : ""}
                </small>
              </div>

              {/* tiers · L476–L488 */}
              {o.tiers.length > 0 && (
                <div className="mt-3 rounded-[9px] border border-border/60">
                  {o.tiers.map((t, i) => (
                    <div
                      key={`${o.id}-tier-${i}`}
                      className={cn(
                        "grid grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_auto] items-baseline gap-3 px-3 py-2",
                        i > 0 && "border-t border-border/60",
                      )}
                    >
                      <b className="min-w-0 truncate text-[11.5px] font-medium">{t.name}</b>
                      <small className="text-[10.5px] text-muted-foreground [text-wrap:pretty]">
                        {t.what}
                      </small>
                      <b
                        className={cn(
                          "whitespace-nowrap font-mono text-[11.5px] font-medium tabular-nums",
                          t.price === null ? "text-muted-foreground" : "text-foreground",
                        )}
                      >
                        {t.price === null ? t.period : money(t.price)}
                      </b>
                    </div>
                  ))}
                </div>
              )}

              {/* where it sells · fulfilment · L490–L511 */}
              <div className="mt-3.5 grid grid-cols-1 gap-x-[22px] gap-y-3 border-t border-border/60 pt-[11px] sm:grid-cols-2">
                <span className="flex min-w-0 flex-col gap-[5px]">
                  <small className="text-[10.5px] text-muted-foreground">Where it sells</small>
                  <span className="flex flex-wrap gap-[5px]">
                    {o.where.map((w) => (
                      <button
                        key={`${o.id}-where-${w}`}
                        type="button"
                        onClick={onOpenCampaign ? () => onOpenCampaign(w) : undefined}
                        disabled={!onOpenCampaign}
                        className="min-h-[24px] flex-none whitespace-nowrap rounded-full border border-border bg-card px-[9px] text-[10.5px] text-muted-foreground transition-colors hover:text-[hsl(var(--gold-dark))] disabled:opacity-60 disabled:hover:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        {w}
                      </button>
                    ))}
                  </span>
                  {o.where.length === 0 && (
                    <small className="text-[10.5px] text-[hsl(var(--warning))]">
                      Nothing sells it right now
                    </small>
                  )}
                </span>
                <span className="flex min-w-0 flex-col gap-[5px]">
                  <small className="text-[10.5px] text-muted-foreground">Fulfilment</small>
                  {o.fulfil.map(([k, v]) => (
                    <span key={`${o.id}-fulfil-${k}`} className="flex min-w-0 items-baseline gap-[7px]">
                      <small className="w-[34px] flex-none text-[10px] text-muted-foreground">{k}</small>
                      <small className="min-w-0 text-[11px] text-foreground/80 [text-wrap:pretty]">
                        {v}
                      </small>
                    </span>
                  ))}
                </span>
              </div>

              {/* facts + acts · L513–L524 */}
              <div className="mt-[13px] flex flex-wrap items-center gap-x-5 gap-y-1.5 border-t border-border/60 pt-[11px]">
                {facts.map((f) => (
                  <span key={`${o.id}-${f.k}`} className="flex items-baseline gap-1.5">
                    <small className="text-[10.5px] text-muted-foreground">{f.k}</small>
                    <b
                      className={cn(
                        "font-mono text-[11.5px] font-medium",
                        f.v === "—" ? "text-muted-foreground" : "text-foreground/80",
                      )}
                    >
                      {f.v}
                    </b>
                  </span>
                ))}
                <span className="flex-1" />
                <QuietChip
                  label={o.state === "retired" ? "Put back on sale" : "Take off sale"}
                  onClick={onToggleOnSale ? () => onToggleOnSale(o) : undefined}
                />
                <QuietChip
                  label="Sell it in a campaign"
                  onClick={onSellInCampaign ? () => onSellInCampaign(o) : undefined}
                />
              </div>
            </div>
          );
        })}

        {offers.length === 0 && (
          <div className="mt-4 max-w-[74ch]">
            <b className="text-[12.5px] font-medium text-[hsl(var(--gold-dark))]">
              {CAMPAIGNS_ABSENCE.title}
            </b>
            <p className="mt-2 text-[12px] leading-[1.6] text-muted-foreground [text-wrap:pretty]">
              {CAMPAIGNS_ABSENCE.body}
            </p>
          </div>
        )}

        <p className="mb-0.5 mt-4 max-w-[74ch] text-[11px] leading-[1.6] text-muted-foreground [text-wrap:pretty]">
          {CATALOG_FOOT}
        </p>
      </div>

      <div className="flex min-h-[30px] flex-none items-center gap-3.5 border-t border-border">
        <small
          title={CATALOG_DEFINITION}
          className="min-w-0 flex-1 truncate text-[11px] text-muted-foreground"
        >
          {CATALOG_DEFINITION}
        </small>
        <small className="flex-none whitespace-nowrap font-mono text-[10.5px] text-muted-foreground">
          {tally}
        </small>
      </div>
    </div>
  );
}

/** `chip()` — L5754–L5758. */
function QuietChip({ label, onClick }: { label: string; onClick?: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      className="min-h-[26px] flex-none whitespace-nowrap rounded-full border border-border bg-card px-[9px] text-[11px] text-muted-foreground transition-colors hover:text-[hsl(var(--gold-dark))] disabled:opacity-50 disabled:hover:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {label}
    </button>
  );
}
