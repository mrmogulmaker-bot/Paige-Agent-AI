import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { usePlatformTrust } from "@/operator/data/usePlatformTrust";
import { MARKET_KINDS, type SubmissionKind } from "@/operator/surfaces/marketplaceVocabulary";
import {
  PACK_COLLECTION_TITLES,
  SHELF_ORDER,
  STORE_FOOT,
  aboveCeiling,
  storefrontMatches,
  storefrontState,
  type Listing,
  type StoreCollection,
} from "@/operator/surfaces/marketplace/listingContract";

/**
 * Marketplace · Storefront — the shop.
 *
 * PORTED FROM `PAIGE Super Admin Shell v3.dc.html`: `storeVals` L10054–L10197, markup L2447–L2546.
 * BUILD-ORDER Layer 3c.
 *
 * ─── THE SURFACE ─────────────────────────────────────────────────────────────────────────────
 *
 * A rotating hero over one featured listing, a filter band (search · kind chips · the
 * runnable-here-only toggle), one honest result line, then the listings — grouped into curated
 * shelves while nothing is filtered, and flattened into a single grid the moment anything is.
 * That flatten is the pack's own rule at L10130: a curated shelf is an editorial claim, and it
 * stops being true the second the operator narrows the set themselves.
 *
 * ─── "RUNNABLE HERE ONLY" IS THE HONEST FILTER ───────────────────────────────────────────────
 *
 * The toggle's two labels are the pack's and they are worth reading as a pair: "Runnable here
 * only" against "Everything, including what will not run". The default is the second — the store
 * shows what it cannot run and says why, rather than hiding it and looking smaller than it is.
 * The result line then counts all four facts at once: shown, installed, capped by your ceiling,
 * out of reach.
 *
 * ─── THE CEILING IS A CLAIM, SO AN UNREAD CEILING MAKES NONE ─────────────────────────────────
 *
 * The pack defaults `ceiling()` to 2 when nothing is stored (L4517). That default is a demo
 * convenience and inheriting it would have this surface tell an operator that listings are
 * "Above ceiling" against a rung nobody set. So `aboveCeiling` returns `null` on an unread
 * ceiling, every state reads plainly, and the capped figure in the result line reads an em-dash
 * rather than a zero — because zero capped and unknown capped are different claims.
 *
 * ─── STRUCTURE BEFORE DATA, AND ONE THING OWED FROM CD ───────────────────────────────────────
 *
 * `listings` arrives empty and that is the finished Layer 3 state. The pack's three shelves
 * ("Made by us", "From agencies", "Needs more room than you have given her") are bound to
 * fixture ids and are recorded in `listingContract.ts` rather than shipped — three empty named
 * shelves would assert a curation nobody made.
 *
 * OWED: the markup binds `{{ emptyLine }}` inside `<sc-if value="{{ storeEmpty }}">` (L2541) and
 * no builder in the shell supplies either key — grepping all 11,358 lines finds those two markup
 * references and nothing else. A search with no results is the commonest state a storefront is
 * in, so this is a real gap. No copy is invented for it here (§00): the result line counts
 * honestly and the authored foot says what does not exist.
 */

export type StorefrontSurfaceProps = {
  readonly listings?: readonly Listing[];
  /** Curated shelves. Absent → one flat grid, which is what the pack does under any filter. */
  readonly collections?: readonly StoreCollection[];
  readonly installed?: Readonly<Record<string, boolean>>;
  readonly onInstall?: (listing: Listing) => void;
  readonly onOpenListing?: (listing: Listing) => void;
  readonly onAnnounce?: (message: string) => void;
};

type Group = { readonly titled: boolean; readonly title: string; readonly note: string; readonly items: readonly Listing[] };

export default function StorefrontSurface({
  listings = [],
  collections = [],
  installed = {},
  onInstall,
  onOpenListing,
  onAnnounce,
}: StorefrontSurfaceProps) {
  const trust = usePlatformTrust(true);
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<string | null>(null);
  const [runnableOnly, setRunnableOnly] = useState(false);
  const [heroIdx, setHeroIdx] = useState(0);

  const isInstalled = (l: Listing) => installed[l.id] ?? l.state === "Installed";
  const filtering = !!query.trim() || !!kind || runnableOnly;

  const shown = useMemo(
    () => listings.filter((l) => storefrontMatches(l, query, kind, runnableOnly, trust.level)),
    [listings, query, kind, runnableOnly, trust.level],
  );

  /**
   * `HEROES` — `storeVals` L10076–L10080. Three editorial angles on the same catalogue, each
   * falling back to a positional pick so the carousel never renders a hole.
   */
  const heroes = useMemo(() => {
    const picks = [
      { kicker: "This week", pick: listings[0] },
      { kicker: "Built by an agency", pick: listings.find((x) => /agency/i.test(x.pub)) ?? listings[1] },
      {
        kicker: "The widest grant we sell",
        pick: listings.find((x) => x.needs === "Autonomous") ?? listings[2],
      },
    ];
    return picks.filter((x): x is { kicker: string; pick: Listing } => !!x.pick);
  }, [listings]);

  const hi = Math.min(heroIdx, Math.max(0, heroes.length - 1));
  const hero = heroes[hi];
  const ht = hero?.pick ?? null;
  const heroState = ht ? storefrontState(ht, trust.level, isInstalled(ht)) : null;
  const heroOn = !filtering && !!ht;

  const groups: readonly Group[] = useMemo(() => {
    if (filtering || collections.length === 0)
      return [{ titled: false, title: "", note: "", items: shown }];
    return collections
      .map((c) => ({
        titled: true,
        title: c.title,
        note: c.note,
        items: c.ids.map((id) => listings.find((l) => l.id === id)).filter((l): l is Listing => !!l),
      }))
      .filter((g) => g.items.length > 0);
  }, [filtering, collections, shown, listings]);

  const nInstalled = listings.filter(isInstalled).length;
  const nCapped =
    trust.level === null
      ? null
      : listings.filter((l) => aboveCeiling(l.needs, trust.level) === true && isInstalled(l)).length;
  const nOut = listings.filter((l) => l.state === "No substrate" || l.state === "Blocked").length;

  return (
    <div className="mb-[30px] min-w-0">
      {/* ── THE HERO · v3 L2450–L2484 ───────────────────────────────────────────────────────── */}
      {heroOn && ht && heroState && (
        <div className="relative overflow-hidden border-b border-[var(--pg-line)] pb-6">
          <div className="flex items-center gap-[9px]">
            <HeroMark kind={ht.kind} />
            <small className="text-[11px] font-medium text-[var(--pg-gold-deep)]">
              {hero.kicker}
            </small>
          </div>

          <div className="mt-[13px] flex flex-wrap items-start gap-x-[34px] gap-y-5">
            <div className="min-w-[250px] flex-1">
              <h3 className="m-0 max-w-[24ch] font-[var(--pg-font-editorial)] text-[31px] font-normal leading-[1.12] tracking-[-0.014em] [text-wrap:balance]">
                {ht.name}
              </h3>
              <p className="mt-3 max-w-[50ch] font-[var(--pg-font-editorial)] text-[15px] leading-[1.6] text-[var(--pg-ink-2)] [text-wrap:pretty]">
                {ht.pitch}
              </p>
              <div className="mt-[18px] flex flex-wrap items-center gap-2">
                <HeroInstall
                  listing={ht}
                  state={heroState[0]}
                  onInstall={onInstall}
                  onAnnounce={onAnnounce}
                />
                <button
                  type="button"
                  onClick={onOpenListing && (() => onOpenListing(ht))}
                  disabled={!onOpenListing}
                  className="min-h-[36px] rounded-[var(--pg-r-chip)] border border-[var(--pg-line)] bg-transparent px-[13px] text-[12px] font-medium text-[var(--pg-muted)] disabled:opacity-45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  What it does
                </button>
                <small className="font-mono text-[10.5px] text-[var(--pg-faint)]">
                  {ht.price || "—"}
                </small>
              </div>
            </div>

            <dl className="m-0 grid flex-none grid-cols-[auto_auto] gap-x-4 gap-y-2 border-l border-[var(--pg-line-soft)] pl-5">
              <HeroFact k="Kind" v={ht.kind} />
              <HeroFact k="Publisher" v={ht.pub.split("·").pop()?.trim() ?? ht.pub} />
              <HeroFact k="Needs" v={ht.needs} />
              <HeroFact k="Scope" v={ht.scope || "Platform-wide"} />
            </dl>
          </div>

          <div className="mt-[18px] flex items-center gap-[7px]">
            {heroes.map((h, i) => (
              <button
                key={h.kicker}
                type="button"
                title={h.kicker}
                aria-label={h.kicker}
                onClick={() => setHeroIdx(i)}
                className="grid h-3 w-[34px] flex-none items-center border-0 bg-transparent p-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <i
                  aria-hidden
                  className="block h-0.5 w-full rounded-[2px]"
                  style={{ background: i === hi ? "var(--pg-gold)" : "var(--pg-line)" }}
                />
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── THE FILTER BAND · v3 L2486–L2504 ────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-[var(--pg-line-soft)] pb-3.5 pt-4">
        <label className="flex min-h-[30px] min-w-0 flex-[1_1_190px] items-center gap-2 rounded-[var(--pg-r-pill)] border border-[var(--pg-line)] bg-[var(--pg-canvas)] px-[11px]">
          <svg viewBox="0 0 16 16" aria-hidden className="h-[13px] w-[13px] flex-none text-[var(--pg-faint)]">
            <path
              d="M4 7a3.4 3.4 0 1 0 6.8 0a3.4 3.4 0 1 0-6.8 0 M9.9 9.9l3.2 3.2"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.3"
              strokeLinecap="round"
            />
          </svg>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search the marketplace"
            aria-label="Search the marketplace"
            className="min-w-0 flex-1 border-0 bg-transparent text-[12.5px] text-[var(--pg-ink)] outline-none placeholder:text-[var(--pg-faint)]"
          />
        </label>

        <div className="flex flex-wrap gap-1.5">
          <KindChip
            label="Everything"
            title="Every kind"
            n={listings.length}
            on={kind === null}
            onClick={() => setKind(null)}
          />
          {SHELF_ORDER.map((k) => (
            <KindChip
              key={k}
              label={k}
              glyph={MARKET_KINDS[k].glyph}
              title={MARKET_KINDS[k].note}
              n={listings.filter((l) => l.kind === k).length}
              on={kind === k}
              onClick={() => setKind(kind === k ? null : k)}
            />
          ))}
        </div>

        <button
          type="button"
          onClick={() => setRunnableOnly((v) => !v)}
          className={cn(
            "inline-flex min-h-[28px] flex-none items-center gap-1.5 whitespace-nowrap rounded-[var(--pg-r-pill)] px-[11px] text-[11.5px]",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            runnableOnly
              ? "border border-[var(--pg-gold)] bg-[var(--pg-lift)] font-semibold text-foreground"
              : "border border-[var(--pg-line)] bg-transparent font-normal text-[var(--pg-muted)]",
          )}
        >
          {runnableOnly ? "Runnable here only" : "Everything, including what will not run"}
        </button>
      </div>

      {/* ── THE RESULT LINE · v3 L2506 ──────────────────────────────────────────────────────────
          Four facts, and the capped one reads an em-dash while no ceiling is stored: zero capped
          and unknown capped are different claims, and only one of them is true here. */}
      <p className="mt-[13px] font-mono text-[11px] tracking-[0.02em] text-[var(--pg-faint)]">
        {shown.length} of {listings.length} listings · {nInstalled} installed ·{" "}
        {nCapped === null ? "—" : nCapped} capped by your ceiling · {nOut} out of reach
      </p>

      {/* ── THE LISTINGS · v3 L2508–L2540 ───────────────────────────────────────────────────── */}
      {groups.map((g, gi) => (
        <div key={g.title || `flat-${gi}`} className="pb-0.5 pt-4">
          {g.titled && (
            <div className="flex flex-wrap items-baseline gap-x-3.5 gap-y-1 pb-[11px]">
              <b className="text-[13px] font-medium">{g.title}</b>
              <small className="min-w-0 text-[11px] text-[var(--pg-faint)]">{g.note}</small>
            </div>
          )}
          <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,268px),1fr))] gap-3">
            {g.items.map((l) => (
              <ListingTile
                key={l.id}
                listing={l}
                ceiling={trust.level}
                installed={isInstalled(l)}
                onOpen={onOpenListing}
              />
            ))}
          </div>
        </div>
      ))}

      {listings.length === 0 && (
        <p className="max-w-[52ch] py-[26px] font-[var(--pg-font-editorial)] text-[15px] leading-[1.6] text-[var(--pg-muted)] [text-wrap:pretty]">
          No listing is read yet. The shop is here — search, the five kinds, the runnable-here
          filter and the shelves — and it has nothing to sell until the catalogue is wired.
        </p>
      )}
      {listings.length > 0 && shown.length === 0 && (
        <p className="max-w-[52ch] py-[26px] font-[var(--pg-font-editorial)] text-[15px] leading-[1.6] text-[var(--pg-muted)]">
          Nothing matches. {runnableOnly ? "Some listings are hidden because they will not run here." : ""}
        </p>
      )}

      <p className="mt-5 max-w-[64ch] border-t border-[var(--pg-line-soft)] pt-[13px] text-[11px] leading-[1.55] text-[var(--pg-faint)] [text-wrap:pretty]">
        {STORE_FOOT}
      </p>

      {/* Recorded rather than rendered: the pack's three shelf titles are bound to fixture ids,
          so shipping them empty would assert a curation nobody made. */}
      <span hidden data-pack-collections={PACK_COLLECTION_TITLES.join(" · ")} />
    </div>
  );
}

function HeroFact({ k, v }: { k: string; v: string }) {
  return (
    <>
      <dt className="whitespace-nowrap font-mono text-[10px] uppercase tracking-[0.05em] text-[var(--pg-faint)]">
        {k}
      </dt>
      <dd className="m-0 whitespace-nowrap text-[11.5px] font-medium text-[var(--pg-ink-2)]">{v}</dd>
    </>
  );
}

function HeroMark({ kind }: { kind: SubmissionKind }) {
  return (
    <span className="relative grid h-[26px] w-[26px] flex-none place-items-center rounded-lg bg-[var(--pg-lift)] text-[var(--pg-gold-deep)]">
      <i
        aria-hidden
        className="pointer-events-none absolute inset-0.5 rounded-md"
        style={{ boxShadow: "inset 0 0 0 1px color-mix(in srgb, var(--pg-gold) 18%, transparent)" }}
      />
      <svg viewBox="0 0 16 16" aria-hidden className="relative h-[13px] w-[13px]">
        <path
          d={MARKET_KINDS[kind].glyph}
          fill="none"
          stroke="currentColor"
          strokeWidth="1.35"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}

/**
 * `heroInstall` — `storeVals` L10163–L10169. Three labels for three situations, and the one that
 * matters is the middle: a listing above the ceiling does not offer an install it cannot honour,
 * it says what it would take.
 */
function HeroInstall({
  listing,
  state,
  onInstall,
  onAnnounce,
}: {
  listing: Listing;
  /**
   * Already resolved against the ceiling by `storefrontState`, which is why no ceiling is passed
   * here: "Above ceiling" is only ever reachable when a rung IS stored, so a second null-check at
   * this site would be an unreachable branch pretending to be a guard.
   */
  readonly state: string;
  onInstall?: (l: Listing) => void;
  onAnnounce?: (m: string) => void;
}) {
  const over = state === "Above ceiling";
  const isIn = /^Installed/.test(state);
  const label = over ? "Needs a higher ceiling" : isIn ? "Installed · remove" : "Install";
  return (
    <button
      type="button"
      disabled={!onInstall && !over}
      onClick={() => {
        if (over) {
          onAnnounce?.(
            `It needs ${listing.needs.toLowerCase()} and your ceiling is lower.`,
          );
          return;
        }
        onInstall?.(listing);
        onAnnounce?.(
          `Installed at ${listing.needs.toLowerCase()}. It can never act above the ceiling.`,
        );
      }}
      title={
        onInstall || over
          ? undefined
          : "Installing has no ledger behind it yet — nothing would be recorded"
      }
      className="min-h-[36px] rounded-[var(--pg-r-chip)] px-4 text-[12.5px] font-semibold disabled:opacity-45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      style={{
        border: `1px solid ${over ? "var(--pg-line)" : "var(--pg-gold)"}`,
        background: over || isIn ? "transparent" : "var(--pg-gold)",
        color: over ? "var(--pg-faint)" : isIn ? "var(--pg-ink-2)" : "#17120c",
      }}
    >
      {label}
    </button>
  );
}

function KindChip({
  label,
  glyph,
  title,
  n,
  on,
  onClick,
}: {
  label: string;
  glyph?: string;
  title: string;
  n: number;
  on: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={cn(
        "inline-flex min-h-[28px] flex-none items-center gap-1.5 whitespace-nowrap rounded-[var(--pg-r-pill)] px-[11px] text-[11.5px]",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        on
          ? "border border-[var(--pg-gold)] bg-[var(--pg-lift)] font-semibold text-foreground"
          : "border border-[var(--pg-line)] bg-transparent font-normal text-[var(--pg-muted)]",
      )}
    >
      {glyph && (
        <svg viewBox="0 0 16 16" aria-hidden className="h-3 w-3">
          <path
            d={glyph}
            fill="none"
            stroke="currentColor"
            strokeWidth="1.3"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      )}
      {label}
      <small className="ml-0.5 font-mono text-[9.5px] text-[var(--pg-faint)]">{n}</small>
    </button>
  );
}

/** `tile` — `storeVals` L10099–L10128. */
function ListingTile({
  listing,
  ceiling,
  installed,
  onOpen,
}: {
  listing: Listing;
  ceiling: number | null;
  installed: boolean;
  onOpen?: (l: Listing) => void;
}) {
  const [label, tone] = storefrontState(listing, ceiling, installed);
  const over = aboveCeiling(listing.needs, ceiling) === true;
  return (
    <button
      type="button"
      onClick={onOpen && (() => onOpen(listing))}
      disabled={!onOpen}
      className="flex min-w-0 flex-col gap-[9px] rounded-[var(--pg-r-plate)] border-0 bg-[var(--pg-canvas)] px-3.5 py-[13px] text-left shadow-[inset_0_0_0_1px_var(--pg-line-soft)] disabled:cursor-default focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <span className="flex min-w-0 items-center gap-2.5">
        <span
          className={cn(
            "relative grid h-8 w-8 flex-none place-items-center rounded-[10px] bg-[var(--pg-lift)]",
            label === "Installed" ? "text-[var(--pg-gold-deep)]" : "text-[var(--pg-muted)]",
          )}
        >
          <i
            aria-hidden
            className="pointer-events-none absolute inset-0.5 rounded-lg"
            style={{ boxShadow: "inset 0 0 0 1px color-mix(in srgb, var(--pg-gold) 14%, transparent)" }}
          />
          <svg viewBox="0 0 16 16" aria-hidden className="relative h-[15px] w-[15px]">
            <path
              d={MARKET_KINDS[listing.kind].glyph}
              fill="none"
              stroke="currentColor"
              strokeWidth="1.35"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
        <span className="flex min-w-0 flex-col gap-0.5 text-left">
          <b className="truncate text-[12.5px] font-medium">{listing.name}</b>
          <small className="truncate text-[10.5px] text-[var(--pg-faint)]">
            {listing.kind} · {listing.pub}
          </small>
        </span>
        <small
          className="ml-auto flex-none whitespace-nowrap text-[10px] font-medium"
          style={{ color: tone }}
        >
          {label}
        </small>
      </span>

      <small className="min-w-0 text-left text-[11.5px] leading-[1.45] text-[var(--pg-muted)] [text-wrap:pretty]">
        {listing.pitch}
      </small>

      <span className="flex items-center gap-[7px]">
        <i
          aria-hidden
          className="h-[5px] w-[5px] flex-none rotate-45"
          style={{ background: over ? "var(--pg-warning)" : "var(--pg-line-strong)" }}
        />
        <small
          className="flex-none whitespace-nowrap font-mono text-[10px]"
          style={{ color: over ? "var(--pg-warning)" : "var(--pg-faint)" }}
        >
          needs {listing.needs.toLowerCase()}
        </small>
        <small className="ml-auto font-mono text-[10px] text-[var(--pg-faint)]">
          {listing.price || "—"}
        </small>
      </span>
    </button>
  );
}
