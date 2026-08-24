import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { usePlatformTrust } from "@/operator/data/usePlatformTrust";
import {
  MARKET_CLASSES,
  kindMark,
  type PublisherClass,
} from "@/operator/surfaces/marketplaceVocabulary";
import {
  CATALOG_DECISIONS,
  CATALOG_FOOT,
  CATALOG_FOOT_FILTERED,
  SHELF_NOTE,
  SHELF_ORDER,
  catalogState,
  catalogTone,
  inDecision,
  type CatalogDecision,
  type Listing,
} from "@/operator/surfaces/marketplace/listingContract";

/**
 * Marketplace · Catalog — every listing on the platform, by kind.
 *
 * PORTED FROM `PAIGE Super Admin Shell v3.dc.html`: `catalogVals` L9434–L9538, markup L1245–L1292.
 * BUILD-ORDER Layer 3c.
 *
 * ─── THE DECISION ROW IS NOT A STATUS COUNT ──────────────────────────────────────────────────
 *
 * CD's comment at L9451 is why the four figures across the top are phrased the way they are:
 * *"Each decision is a real question an operator has to answer, not a status count."* So the
 * labels read "blocked", "held below grant", "waiting on a reviewer", "listed, never installed"
 * — each naming what the operator must DO — and each carries a note saying whose problem it is.
 * "your ceiling, not their code" is the one that matters most: a capped listing is not broken.
 *
 * ─── DIM, DO NOT REMOVE ──────────────────────────────────────────────────────────────────────
 *
 * Picking a decision does not filter the shelves down to the matching tiles. Everything stays
 * where it is and what does not match goes to 42% — CD's foot says why: *"Everything else stays
 * on its shelf, dimmed, so you can see what you are not looking at."* This is the same rule the
 * Systems Check run strip already follows, and porting it means the shape of the catalogue never
 * changes under a filter.
 *
 * A DIMMED TILE DOES NOT ANIMATE IN, and the pack states the mechanism rather than the
 * preference: `pg-reveal` ends at opacity 1 with `fill: both`, which would pin a dimmed tile
 * back to full opacity and defeat the dim. Transcribed at its site below.
 *
 * ─── STRUCTURE BEFORE DATA ───────────────────────────────────────────────────────────────────
 *
 * `listings` arrives empty and that is the finished Layer 3 state. The five shelves still render
 * — they are the KIND VOCABULARY, not data, and a catalogue that hides its own shelves when
 * empty tells you less than one that shows them waiting. Each shelf reads "0 listings", the four
 * decisions read zero at half opacity exactly as the pack dims a zero decision, and the foot
 * says what does not exist.
 *
 * THE STATE VOCABULARY DIFFERS FROM THE STOREFRONT'S ON PURPOSE (see `listingContract.ts`): the
 * store sells, so an uninstalled listing reads "Install"; the catalog inventories, so the same
 * listing reads "Listed". Same listing, same ceiling, two true sentences.
 */

export type MarketCatalogSurfaceProps = {
  readonly listings?: readonly Listing[];
  /** Which listings this operator has installed. Absent → the listing's own state decides. */
  readonly installed?: Readonly<Record<string, boolean>>;
  readonly onOpenListing?: (listing: Listing) => void;
  /** Motion-safe: the pack reads `s.reduce` and drops the reveal and the lift. */
  readonly reduceMotion?: boolean;
};

export default function MarketCatalogSurface({
  listings = [],
  installed = {},
  onOpenListing,
  reduceMotion = false,
}: MarketCatalogSurfaceProps) {
  const trust = usePlatformTrust(true);
  const [filter, setFilter] = useState<CatalogDecision | null>(null);

  const stateOf = useMemo(() => {
    const map = new Map<string, string>();
    for (const l of listings) {
      map.set(l.id, catalogState(l, trust.level, installed[l.id] ?? l.state === "Installed"));
    }
    return map;
  }, [listings, installed, trust.level]);

  const shown = (l: Listing) => !filter || inDecision(stateOf.get(l.id) ?? "", filter);

  return (
    <div className="mb-[30px] min-w-0">
      {/* ── THE FOUR DECISIONS · v3 L1247–L1257 ─────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-baseline gap-x-[26px] gap-y-2.5 border-b border-[var(--pg-line)] pb-4">
        {CATALOG_DECISIONS.map((d) => {
          const n = listings.filter((l) => inDecision(stateOf.get(l.id) ?? "", d.key)).length;
          const on = filter === d.key;
          return (
            <button
              key={d.key}
              type="button"
              // Read live state rather than the value captured at render, so a stale handler
              // cannot leave the filter stuck on (CD, L9469).
              onClick={() => setFilter((p) => (p === d.key ? null : d.key))}
              className={cn(
                "flex min-h-[34px] min-w-0 items-center gap-[9px] border-0 bg-transparent px-0.5",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                on ? "text-foreground shadow-[inset_0_-1px_0_var(--pg-gold)]" : "text-[var(--pg-muted)]",
                n ? "opacity-100" : "opacity-50",
              )}
            >
              <b
                className="tabular-nums flex-none font-mono text-[17px] font-medium tracking-[-0.02em]"
                style={{ color: n ? d.tone : "var(--pg-faint)" }}
              >
                {n}
              </b>
              <span className="flex min-w-0 flex-col text-left">
                <small className="whitespace-nowrap text-[11.5px]">{d.label}</small>
                <small className="whitespace-nowrap text-[10px] text-[var(--pg-faint)]">
                  {d.note}
                </small>
              </span>
            </button>
          );
        })}
      </div>

      {/* ── THE FIVE SHELVES · v3 L1259–L1289 ───────────────────────────────────────────────── */}
      {SHELF_ORDER.map((kind) => {
        const all = listings.filter((l) => l.kind === kind);
        const hue = `var(--k-${kind.toLowerCase()})`;
        const visible = all.filter(shown).length;
        const count = filter
          ? `${visible} of ${all.length}`
          : all.length === 1
            ? "1 listing"
            : `${all.length} listings`;
        return (
          <div key={kind} className="border-b border-[var(--pg-line-soft)] pb-[3px] pt-[19px]">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1.5">
              <i aria-hidden className="h-2 w-2 flex-none rotate-45" style={{ background: hue }} />
              <b className="text-[13px] font-medium tracking-[0.01em]" style={{ color: hue }}>
                {kind}
              </b>
              <small className="font-mono text-[10.5px] text-[var(--pg-faint)]">{count}</small>
              <small className="min-w-0 truncate text-[10.5px] text-[var(--pg-faint)]">
                {SHELF_NOTE[kind]}
              </small>
            </div>

            {all.length > 0 && (
              <div className="mt-[13px] grid grid-cols-[repeat(auto-fill,minmax(min(100%,186px),1fr))] gap-2.5">
                {all.map((l, i) => {
                  const st = stateOf.get(l.id) ?? "";
                  const dim = !shown(l);
                  const mk = kindMark(kind, 30, /^Installed/.test(st) && !dim, reduceMotion);
                  const cls = MARKET_CLASSES[l.cls as PublisherClass] ?? MARKET_CLASSES.Platform;
                  return (
                    <button
                      key={l.id}
                      type="button"
                      onClick={onOpenListing && (() => onOpenListing(l))}
                      disabled={!onOpenListing}
                      className="flex min-h-[96px] min-w-0 flex-col justify-between rounded-[var(--pg-r-plate)] border-0 px-3.5 py-[13px] text-left disabled:cursor-default focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      style={{
                        background: "var(--pg-raised)",
                        boxShadow: dim
                          ? "inset 0 0 0 1px var(--pg-line-soft)"
                          : "var(--pg-rim), var(--pg-lift-1)",
                        opacity: dim ? 0.42 : 1,
                        transition: reduceMotion
                          ? "none"
                          : "transform 200ms cubic-bezier(.22,1,.36,1), box-shadow 200ms, opacity 200ms",
                        // `pg-reveal` ends at opacity 1 and `fill: both` pins it there, which
                        // would defeat the dim — so a dimmed tile does not animate in (CD, L9522).
                        animation:
                          reduceMotion || dim
                            ? "none"
                            : "pg-reveal 280ms cubic-bezier(.22,1,.36,1) both",
                        animationDelay: `${i * 40}ms`,
                      }}
                    >
                      <span className="flex min-w-0 items-start gap-2.5">
                        <span style={{ ...mk.wrapStyle, opacity: dim ? 0.3 : 1 }}>
                          <i aria-hidden style={mk.rimStyle} />
                          <svg viewBox="0 0 16 16" aria-hidden style={mk.svgStyle}>
                            <path
                              d={mk.glyph}
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="1.35"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          </svg>
                        </span>
                        <span className="flex min-w-0 flex-col gap-[3px] text-left">
                          <b className="truncate text-[12.5px] font-medium text-foreground">
                            {l.name}
                          </b>
                          <small className="truncate text-[10px] text-[var(--pg-faint)]">
                            {cls.label} · v{l.version}
                          </small>
                        </span>
                      </span>
                      <span className="mt-3 flex min-w-0 items-center gap-[7px]">
                        <i
                          aria-hidden
                          className="h-1.5 w-1.5 flex-none rotate-45"
                          style={{ background: catalogTone(st) }}
                        />
                        <small
                          className="flex-none whitespace-nowrap text-[9.5px] font-medium tracking-[0.03em]"
                          style={{ color: catalogTone(st) }}
                        >
                          {st}
                        </small>
                        <small className="ml-auto min-w-0 truncate font-mono text-[9.5px] text-[var(--pg-faint)]">
                          {l.scope}
                        </small>
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}

      <p className="mt-[18px] max-w-[64ch] text-[11px] leading-[1.55] text-[var(--pg-faint)] [text-wrap:pretty]">
        {filter ? CATALOG_FOOT_FILTERED : CATALOG_FOOT}
      </p>
    </div>
  );
}
