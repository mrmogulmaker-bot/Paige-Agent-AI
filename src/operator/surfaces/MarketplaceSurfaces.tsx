import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * Marketplace + Integrations — Claude Design's `isMkStore` (Super Admin Shell.dc.html,
 * L775–843), `isMkReview` (L751–774) and `isIntGrid` (L901–931) blocks.
 *
 * Three operator surfaces that all answer "what is installed on this platform, and what is
 * asking to be":
 *   • `MarketplaceStore`   — the storefront: the featured hero and the shelves of listings.
 *   • `MarketplaceReview`  — the submission queue: per submission, its checks and the verdict.
 *   • `IntegrationsGrid`   — the connected-integrations catalog with its category filter.
 *
 * §13 — CD'S PACK IS ALL WRITTEN-IN FIGURES AND NONE OF IT SURVIVES THE PORT. Its store ships
 * five hand-authored hero slides, star ratings, install counts, dollar prices, publisher names
 * and a "9 approved this month". On an operator console every one of those is a claim: an
 * install count says money changed hands, a green health dot says a third party answered a ping
 * in the last minute, "Passes every check" says a review actually ran. So there is not one
 * literal in this file. Every datum arrives typed from the caller; a field the caller did not
 * supply renders "—"; and with nothing at all each surface says IN WORDS which feed is missing
 * rather than drawing a decorative skeleton that would read as a live catalog.
 *
 * §11 GOLD BUDGET — gold is spent on the ACT and nothing else. CD paints "See all", a listing's
 * card CTA and an integration's "Configure" in its gold ink (#8A6D1E); those are navigation, not
 * acts, so here they are indigo (`--primary`). Gold survives in exactly two places: the store
 * hero's primary CTA, and the ONE action a submission marks `primary` (approve/publish — the
 * decision the operator opened the queue to make). Everything else is neutral.
 *
 * §5 — a control with a label and no handler renders DISABLED with a title that says why,
 * never a button that silently swallows the click.
 *
 * NOT PORTED IN THIS PASS, deliberately:
 *   • CD's 6-second auto-rotating hero (`heroFill 6s linear both` on the active dot). A running
 *     progress bar asserts a rotation is in flight; rather than fake one, the dots are real
 *     buttons and the hero advances only when the operator says so. If auto-rotate is wanted it
 *     belongs behind a motion-safe timer, added deliberately.
 *   • CD's per-listing gradient hexes and its `MK_GRAD` tone table. Tile colour here is a
 *     `tone` key mapped onto our `--chart-*` tokens, so a listing re-tints with the theme.
 *   • CD's glyph star row ("★★★★☆"). Rounding a real 4.6 into four-and-a-half glyphs invents
 *     precision, so the rating prints as a number beside its rating count; CD's own `unrated`
 *     branch is kept for listings with no rating yet.
 *
 * §18 NOTE FOR THE INTEGRATOR — `IntegrationsGrid` is a CARD-GRID rendering of the integrations
 * catalog and `SettingsSurfaces.IntegrationsSurface` is the ROW-LIST rendering of the same
 * catalog. Two homes for one capability is a §18 smell. They are both ported here because the
 * CD pack contains both; picking one (or making the grid a view mode of the surface) is an
 * integration decision, not a porting one.
 */

/* ────────────────────────────────────────────────────────────────────────────
   shared
   ──────────────────────────────────────────────────────────────────────────── */

/**
 * A listing/integration tile colour. CD stores a per-item gradient; ours is a key so the
 * colour is a THEME decision resolved from tokens, never a pasted hex (§11).
 */
export type TileTone = "indigo" | "teal" | "violet" | "blue" | "rose" | "slate";

const TILE_TONE: Record<TileTone, string> = {
  indigo: "hsl(var(--chart-1))",
  teal: "hsl(var(--chart-2))",
  violet: "hsl(var(--chart-3))",
  blue: "hsl(var(--chart-4))",
  rose: "hsl(var(--chart-5))",
  slate: "hsl(var(--chart-6))",
};

/** CD's two-stop tile gradient, rebuilt from tokens. `null` tone reads neutral, never invented. */
function tileFill(tone: TileTone | null | undefined): string {
  const c = tone ? TILE_TONE[tone] : "hsl(var(--chart-6))";
  return `linear-gradient(150deg, ${c}, hsl(var(--rail)))`;
}

const nf = new Intl.NumberFormat();

/** A block header — CD renders `title`/`sub` in the shell above each block; we carry our own. */
function BlockHead({ title, sub }: { title: string; sub?: string | null }) {
  return (
    <div className="min-w-0 flex-none">
      <div className="text-[14.5px] font-semibold tracking-[-0.01em]">{title}</div>
      {sub ? <div className="mt-[3px] text-[11.5px] text-muted-foreground">{sub}</div> : null}
    </div>
  );
}

/** CD's empty/error plates, in words rather than a shimmer that would read as loading data. */
function StatePlate({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-[15px] border border-dashed border-border bg-card px-4 py-8 text-center">
      <div className="text-[12.5px] font-semibold">{title}</div>
      <div className="mx-auto mt-1.5 max-w-lg text-[11.5px] leading-[1.55] text-muted-foreground">
        {body}
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
   MarketplaceStore — CD `isMkStore`, L775–843
   ──────────────────────────────────────────────────────────────────────────── */

export type StoreFeature = {
  id: string;
  /** CD's small caps line above the name. null → the eyebrow is omitted, never invented. */
  eyebrow: string | null;
  name: string;
  /** The publisher's own words about the listing. null → "—". */
  note: string | null;
  /** Already-formatted price ("Free", "$40 / mo"). null → "—"; never computed here. */
  price: string | null;
  /** CD's right-hand meta ("412 installs · ★ 4.8"). null → omitted. */
  meta: string | null;
  /** A single glyph for the hero tile. null → the tile shows the listing's initial. */
  glyph: string | null;
  tone: TileTone | null;
  primaryCta: string;
  secondaryCta?: string | null;
  onOpen?: () => void;
  onSecondary?: () => void;
};

export type StoreCard = {
  id: string;
  name: string;
  /** Publisher line. null → "—". */
  publisher: string | null;
  note: string | null;
  glyph: string | null;
  tone: TileTone | null;
  /** Mean rating, 0–5, as the catalog reports it. null → CD's "unrated" branch. */
  rating: number | null;
  /** How many ratings that mean is over. null → the count is left off. */
  ratingCount: number | null;
  /** Fleet-wide installs. null → "—", never a plausible number. */
  installs: number | null;
  /** Already-formatted price ("Free", "$40"). null → "—". */
  price: string | null;
  /** True when this tenant/platform already has it — CD tints the price pill. */
  installed?: boolean;
  onOpen?: () => void;
};

export type StoreShelf = {
  id: string;
  label: string;
  note: string | null;
  cards: readonly StoreCard[];
  onSeeAll?: () => void;
};

export type MarketplaceStoreProps = {
  /** CD's rotating hero. Empty → no hero at all; nothing stands in for it. */
  featured?: readonly StoreFeature[];
  /** The shelves. Empty → the surface says the catalog is not connected. */
  shelves: readonly StoreShelf[];
  loading?: boolean;
  error?: string | null;
  title?: string;
  sub?: string | null;
};

export function MarketplaceStore({
  featured = [],
  shelves,
  loading = false,
  error = null,
  title = "Discover",
  sub = "What the fleet is installing.",
}: MarketplaceStoreProps) {
  const [slide, setSlide] = useState(0);
  const hero = featured.length ? featured[slide % featured.length] : null;
  const idx = featured.length ? slide % featured.length : 0;

  return (
    <div className="flex min-w-0 flex-col gap-3.5">
      <BlockHead title={title} sub={sub} />

      {/* ── hero ─────────────────────────────────────────────────────────── */}
      {hero && (
        <div className="relative overflow-hidden rounded-[17px] bg-rail px-[21px] py-[19px] shadow-[0_18px_40px_hsl(var(--shadow-ink)/0.3)]">
          {/* CD's rgba(255,255,255,.07) disc, expressed against the rail's own ink. */}
          <div
            aria-hidden
            className="pointer-events-none absolute -right-[46px] -top-[34px] h-[196px] w-[196px] rounded-full bg-rail-foreground/[0.07]"
          />
          <div className="flex min-w-0 items-start gap-[18px]">
            <div className="min-w-0 flex-1">
              {hero.eyebrow ? (
                <div className="text-[9px] font-semibold tracking-[0.18em] text-rail-foreground/[0.74]">
                  {hero.eyebrow}
                </div>
              ) : null}
              <div className="mt-2 text-[25px] font-bold leading-[1.15] tracking-[-0.03em] text-rail-foreground">
                {hero.name}
              </div>
              <div className="mt-2 max-w-[470px] text-[12.5px] leading-[1.55] text-rail-foreground/[0.84]">
                {hero.note ?? "—"}
              </div>
              <div className="mt-[15px] flex flex-wrap items-center gap-[9px]">
                {/* THE act on this surface — the one gold in the store (§11). */}
                <button
                  type="button"
                  onClick={hero.onOpen}
                  disabled={!hero.onOpen}
                  title={hero.onOpen ? undefined : "This listing has no destination wired yet."}
                  className={cn(
                    "whitespace-nowrap rounded-[22px] px-[17px] py-2 text-[12.5px] font-semibold transition-[filter]",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-rail",
                    hero.onOpen
                      ? "bg-cd-gold text-[hsl(var(--accent-foreground))] hover:brightness-[1.06]"
                      : "cursor-not-allowed bg-rail-foreground/20 text-rail-foreground/60",
                  )}
                >
                  {hero.primaryCta}
                </button>
                {hero.secondaryCta ? (
                  <button
                    type="button"
                    onClick={hero.onSecondary}
                    disabled={!hero.onSecondary}
                    title={hero.onSecondary ? undefined : "Nothing is wired behind this yet."}
                    className={cn(
                      "whitespace-nowrap rounded-[22px] border border-rail-foreground/[0.34] px-[15px] py-2 text-[12.5px] text-rail-foreground transition-colors",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-rail",
                      hero.onSecondary
                        ? "hover:bg-rail-foreground/[0.14]"
                        : "cursor-not-allowed opacity-60",
                    )}
                  >
                    {hero.secondaryCta}
                  </button>
                ) : null}
                <div className="ml-auto flex flex-none items-baseline gap-2.5">
                  {hero.meta ? (
                    <span className="text-[10px] text-rail-foreground/[0.88]">{hero.meta}</span>
                  ) : null}
                  <span className="text-[15px] font-bold tabular-nums text-rail-foreground">
                    {hero.price ?? "—"}
                  </span>
                </div>
              </div>
            </div>
            <div
              aria-hidden
              className="grid h-[70px] w-[70px] flex-none place-items-center rounded-[19px] text-[27px] text-rail-foreground shadow-[0_12px_26px_hsl(var(--shadow-ink)/0.36)]"
              style={{ backgroundImage: tileFill(hero.tone) }}
            >
              {hero.glyph ?? hero.name.slice(0, 1).toUpperCase()}
            </div>
          </div>

          {/* CD's slide dots + arrows. Manual only — see the not-ported note above. */}
          {featured.length > 1 && (
            <div className="mt-[13px] flex items-center gap-[9px]">
              <div className="flex items-center gap-[5px]">
                {featured.map((f, i) => (
                  <button
                    key={f.id}
                    type="button"
                    aria-label={`Show ${f.name}`}
                    aria-pressed={i === idx}
                    onClick={() => setSlide(i)}
                    className="block h-[3px] w-[26px] overflow-hidden rounded-[2px] bg-rail-foreground/[0.14] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-rail"
                  >
                    <span
                      aria-hidden
                      className={cn(
                        "block h-full bg-rail-foreground transition-[width]",
                        i <= idx ? "w-full" : "w-0",
                      )}
                    />
                  </button>
                ))}
              </div>
              <button
                type="button"
                aria-label="Previous listing"
                onClick={() => setSlide((s) => (s + featured.length - 1) % featured.length)}
                className="ml-1.5 grid h-[22px] w-[22px] flex-none place-items-center rounded-full border border-rail-foreground/[0.34] text-[10px] text-rail-foreground transition-colors hover:bg-rail-foreground/[0.14] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-rail"
              >
                ‹
              </button>
              <button
                type="button"
                aria-label="Next listing"
                onClick={() => setSlide((s) => (s + 1) % featured.length)}
                className="grid h-[22px] w-[22px] flex-none place-items-center rounded-full border border-rail-foreground/[0.34] text-[10px] text-rail-foreground transition-colors hover:bg-rail-foreground/[0.14] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-rail"
              >
                ›
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── shelves ──────────────────────────────────────────────────────── */}
      {loading && (
        <StatePlate
          title="Reading the catalog…"
          body="Listings, publishers, ratings and install counts are being read. Nothing is drawn until they arrive."
        />
      )}

      {!loading && error && (
        <StatePlate title="The catalog could not be read." body={error} />
      )}

      {!loading && !error && shelves.length === 0 && (
        <StatePlate
          title="The marketplace catalog is not connected."
          body="Listings, their publishers, their ratings and their fleet-wide install counts all come from the catalog feed. It is not wired, so no shelf is shown — an invented one would claim installs and revenue that have not happened."
        />
      )}

      {!loading &&
        !error &&
        shelves.map((sh) => (
          <section key={sh.id} className="min-w-0">
            <div className="flex min-w-0 items-baseline gap-[9px]">
              <h3 className="flex-none text-[14.5px] font-semibold">{sh.label}</h3>
              <span className="min-w-0 truncate whitespace-nowrap text-[11px] text-muted-foreground">
                {sh.note ?? ""}
              </span>
              <button
                type="button"
                onClick={sh.onSeeAll}
                disabled={!sh.onSeeAll}
                title={sh.onSeeAll ? undefined : "There is no full listing view wired for this shelf yet."}
                className={cn(
                  "ml-auto flex-none whitespace-nowrap rounded text-[11.5px] font-semibold transition-colors",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  sh.onSeeAll
                    ? "text-[hsl(var(--primary))] hover:underline"
                    : "cursor-not-allowed text-muted-foreground",
                )}
              >
                See all
              </button>
            </div>

            {sh.cards.length === 0 ? (
              <div className="mt-2.5 rounded-[15px] border border-dashed border-border px-3.5 py-5 text-[11.5px] text-muted-foreground">
                Nothing on this shelf.
              </div>
            ) : (
              <ul className="mt-2.5 grid list-none grid-cols-1 gap-2.5 p-0 sm:grid-cols-2 min-[900px]:grid-cols-3">
                {sh.cards.map((c) => (
                  <li key={c.id} className="min-w-0">
                    <StoreCardTile card={c} />
                  </li>
                ))}
              </ul>
            )}
          </section>
        ))}
    </div>
  );
}

function StoreCardTile({ card: c }: { card: StoreCard }) {
  const body = (
    <>
      <div className="flex min-w-0 items-center gap-[11px]">
        <span
          aria-hidden
          className="grid h-10 w-10 flex-none place-items-center rounded-xl text-[16px] text-rail-foreground shadow-[0_6px_14px_hsl(var(--shadow-ink)/0.2)]"
          style={{ backgroundImage: tileFill(c.tone) }}
        >
          {c.glyph ?? c.name.slice(0, 1).toUpperCase()}
        </span>
        <span className="min-w-0">
          <span className="block truncate whitespace-nowrap text-[13px] font-semibold">
            {c.name}
          </span>
          <span className="mt-0.5 block truncate whitespace-nowrap text-[10.5px] text-muted-foreground">
            {c.publisher ?? "—"}
          </span>
        </span>
      </div>
      <div className="min-w-0 truncate whitespace-nowrap text-[11.5px] leading-[1.45] text-muted-foreground">
        {c.note ?? "—"}
      </div>
      <div className="flex min-w-0 items-center gap-2">
        {c.rating == null ? (
          <span className="flex-none text-[10px] text-muted-foreground">Not rated yet</span>
        ) : (
          <>
            <span
              className="flex-none whitespace-nowrap text-[10.5px] tracking-[0.06em] text-foreground/80"
              aria-label={`Rated ${c.rating.toFixed(1)} out of 5`}
            >
              ★ {c.rating.toFixed(1)}
            </span>
            {c.ratingCount != null && (
              <span className="flex-none font-mono text-[10px] tabular-nums text-foreground/70">
                {nf.format(c.ratingCount)}
              </span>
            )}
          </>
        )}
        <span className="flex-none font-mono text-[10px] tabular-nums text-muted-foreground">
          {c.installs == null ? "—" : `${nf.format(c.installs)} installs`}
        </span>
        <span
          className={cn(
            "ml-auto flex-none whitespace-nowrap rounded-[20px] px-3.5 py-[5px] text-[11px] font-semibold",
            c.installed
              ? "bg-[hsl(var(--success)/0.14)] text-[hsl(var(--success))]"
              : "bg-muted text-foreground/80",
          )}
        >
          {c.installed ? "Installed" : (c.price ?? "—")}
        </span>
      </div>
    </>
  );

  const shell =
    "flex h-full min-w-0 flex-col gap-[9px] rounded-[15px] border border-border bg-card p-[13px] text-left shadow-sm";

  if (!c.onOpen) return <div className={shell}>{body}</div>;

  return (
    <button
      type="button"
      onClick={c.onOpen}
      className={cn(
        shell,
        "w-full transition-[border-color,box-shadow] hover:border-border-strong hover:shadow-[0_12px_28px_hsl(var(--shadow-ink)/0.11)]",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
      )}
    >
      {body}
    </button>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
   MarketplaceReview — CD `isMkReview`, L751–774
   ──────────────────────────────────────────────────────────────────────────── */

export type ReviewCheck = {
  id: string;
  /** What the check looked at. */
  what: string;
  /** Why it landed the way it did. null → "—". */
  detail: string | null;
  /**
   * true = passed · false = failed · null = the check has NOT RUN. A not-run check is never
   * folded into "passes every check" — it is reported as unrun, because a verdict that counts
   * a missing check as a pass is exactly the lie this queue exists to catch (§13).
   */
  pass: boolean | null;
};

export type ReviewAction = {
  id: string;
  label: string;
  /** The one act this card is for (approve/publish). Exactly one may be primary — it is gold. */
  primary?: boolean;
  onAct?: () => void;
  /** Shown as the disabled title when `onAct` is absent. */
  unavailableReason?: string;
};

export type ReviewSubmission = {
  id: string;
  name: string;
  /** Who submitted it. null → "—". */
  publisher: string | null;
  /** What kind of listing it is. null → omitted. */
  kind: string | null;
  /** Human "submitted 2d ago". null → "—". */
  submitted: string | null;
  checks: readonly ReviewCheck[];
  actions?: readonly ReviewAction[];
};

export type MarketplaceReviewProps = {
  submissions: readonly ReviewSubmission[];
  loading?: boolean;
  error?: string | null;
  title?: string;
  sub?: string | null;
};

/** The verdict pill is DERIVED from the checks handed in — never supplied as a label. */
function verdictOf(checks: readonly ReviewCheck[]): {
  label: string;
  tone: "ok" | "warn" | "risk" | "neutral";
} {
  if (checks.length === 0) return { label: "No checks recorded", tone: "neutral" };
  const failed = checks.filter((c) => c.pass === false).length;
  const unrun = checks.filter((c) => c.pass == null).length;
  if (failed > 0) {
    return {
      label: `${failed} ${failed === 1 ? "check" : "checks"} failing`,
      tone: "risk",
    };
  }
  if (unrun > 0) {
    return {
      label: `${unrun} ${unrun === 1 ? "check has" : "checks have"} not run`,
      tone: "warn",
    };
  }
  return { label: "Passes every check", tone: "ok" };
}

const VERDICT_TONE: Record<"ok" | "warn" | "risk" | "neutral", string> = {
  ok: "bg-[hsl(var(--success)/0.14)] text-[hsl(var(--success))]",
  warn: "bg-[hsl(var(--warning)/0.16)] text-[hsl(var(--gold-dark))]",
  risk: "bg-[hsl(var(--destructive)/0.12)] text-[hsl(var(--destructive))]",
  neutral: "bg-muted text-muted-foreground",
};

export function MarketplaceReview({
  submissions,
  loading = false,
  error = null,
  title = "Waiting on a read",
  sub = "Each one names exactly what is wrong with it.",
}: MarketplaceReviewProps) {
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <BlockHead title={title} sub={sub} />

      {loading && (
        <StatePlate
          title="Reading the submission queue…"
          body="Submissions and the checks that ran against them are being read."
        />
      )}

      {!loading && error && (
        <StatePlate title="The submission queue could not be read." body={error} />
      )}

      {!loading && !error && submissions.length === 0 && (
        <StatePlate
          title="Nothing is waiting on a read."
          body="Submissions, and the automated checks that run against each one, come from the review queue. Either nothing is queued or the queue is not connected — no placeholder submission is shown, because a verdict on a listing that does not exist is worse than an empty screen."
        />
      )}

      {!loading &&
        !error &&
        submissions.map((s) => {
          const verdict = verdictOf(s.checks);
          const meta = [s.publisher ?? "—", s.kind, s.submitted ? `submitted ${s.submitted}` : null]
            .filter(Boolean)
            .join(" · ");
          return (
            <article
              key={s.id}
              className="min-w-0 rounded-[15px] border border-border bg-card px-3.5 py-3 shadow-sm"
            >
              <div className="min-w-0">
                <h3 className="truncate whitespace-nowrap text-[14px] font-semibold">{s.name}</h3>
                <div className="mt-[3px] truncate whitespace-nowrap text-[11.5px] text-muted-foreground">
                  {meta}
                </div>
              </div>

              <div className="flex min-w-0 items-center gap-[9px] pb-[11px] pt-[9px]">
                <span
                  className={cn(
                    "flex-none whitespace-nowrap rounded-[20px] px-2.5 py-[3px] text-[10.5px] font-semibold",
                    VERDICT_TONE[verdict.tone],
                  )}
                >
                  {verdict.label}
                </span>
              </div>

              {s.checks.length === 0 ? (
                <div className="rounded-[10px] border border-dashed border-border px-[11px] py-[9px] text-[11.5px] text-muted-foreground">
                  No checks have been recorded against this submission.
                </div>
              ) : (
                <ul className="flex list-none flex-col gap-1.5 p-0">
                  {s.checks.map((ck) => {
                    const failed = ck.pass === false;
                    const unrun = ck.pass == null;
                    return (
                      <li
                        key={ck.id}
                        className={cn(
                          "flex min-w-0 items-start gap-2.5 rounded-[10px] border px-[11px] py-[9px]",
                          failed
                            ? "border-[hsl(var(--destructive)/0.35)] bg-[hsl(var(--destructive)/0.07)]"
                            : unrun
                              ? "border-dashed border-border bg-muted/40"
                              : "border-border bg-muted/30",
                        )}
                      >
                        <span
                          aria-hidden
                          className={cn(
                            "mt-px flex-none text-[11px]",
                            failed
                              ? "text-[hsl(var(--destructive))]"
                              : unrun
                                ? "text-muted-foreground"
                                : "text-[hsl(var(--success))]",
                          )}
                        >
                          {failed ? "✕" : unrun ? "–" : "✓"}
                        </span>
                        <span className="min-w-0">
                          <span className="block text-[12.5px] font-semibold leading-[1.35]">
                            {ck.what}
                            <span className="sr-only">
                              {failed ? " — failed" : unrun ? " — not run" : " — passed"}
                            </span>
                          </span>
                          <span className="mt-[3px] block text-[11.5px] leading-[1.45] text-muted-foreground">
                            {unrun ? "This check has not run." : (ck.detail ?? "—")}
                          </span>
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}

              {!!s.actions?.length && (
                <div className="mt-3 flex flex-wrap items-center gap-[9px]">
                  {s.actions.map((a) => (
                    <button
                      key={a.id}
                      type="button"
                      onClick={a.onAct}
                      disabled={!a.onAct}
                      title={
                        a.onAct
                          ? undefined
                          : (a.unavailableReason ??
                            "This decision is not wired to the review backend yet.")
                      }
                      className={cn(
                        "whitespace-nowrap rounded-[9px] px-[15px] py-2 text-[12.5px] font-semibold transition-[filter,background-color]",
                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                        !a.onAct
                          ? "cursor-not-allowed border border-border bg-muted text-muted-foreground"
                          : a.primary
                            ? "bg-cd-gold text-[hsl(var(--accent-foreground))] hover:brightness-[1.06]"
                            : "border border-border bg-card text-foreground hover:bg-muted",
                      )}
                    >
                      {a.label}
                    </button>
                  ))}
                </div>
              )}
            </article>
          );
        })}
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
   IntegrationsGrid — CD `isIntGrid`, L901–931
   ──────────────────────────────────────────────────────────────────────────── */

/** CD's health dot. `unknown` is its own state: nothing has reported, so nothing is claimed. */
export type IntegrationHealthDot = "green" | "amber" | "red" | "unknown";

export type IntegrationCategory = { id: string; label: string; count: number | null };

export type IntegrationTile = {
  id: string;
  name: string;
  /** Category id — must match a supplied category. null → the line reads "—". */
  categoryId: string | null;
  /** The category's display label, as the caller resolved it. null → "—". */
  category: string | null;
  note: string | null;
  glyph: string | null;
  tone: TileTone | null;
  health: IntegrationHealthDot;
  /** Connection state as the backend reports it ("Connected", "Needs reauth"). null → "—". */
  state: string | null;
  /** Registered webhooks. null → "—", never a made-up count. */
  hooks: number | null;
  cta?: string | null;
  onOpen?: () => void;
};

export type IntegrationsGridProps = {
  items: readonly IntegrationTile[];
  /** Filter chips. Empty → no filter row (rather than an invented "All (12)"). */
  categories?: readonly IntegrationCategory[];
  /** CD's closing note under the grid. */
  foot?: string | null;
  loading?: boolean;
  error?: string | null;
  title?: string;
  sub?: string | null;
};

const HEALTH_DOT: Record<IntegrationHealthDot, string> = {
  green: "bg-[hsl(var(--success))]",
  amber: "bg-[hsl(var(--warning))]",
  red: "bg-[hsl(var(--destructive))]",
  unknown: "bg-muted-foreground/50",
};

const HEALTH_LABEL: Record<IntegrationHealthDot, string> = {
  green: "Answering",
  amber: "Degraded",
  red: "Not answering",
  unknown: "No health reported",
};

const HEALTH_PILL: Record<IntegrationHealthDot, string> = {
  green: "bg-[hsl(var(--success)/0.14)] text-[hsl(var(--success))]",
  amber: "bg-[hsl(var(--warning)/0.16)] text-[hsl(var(--gold-dark))]",
  red: "bg-[hsl(var(--destructive)/0.12)] text-[hsl(var(--destructive))]",
  unknown: "bg-muted text-muted-foreground",
};

export function IntegrationsGrid({
  items,
  categories = [],
  foot = null,
  loading = false,
  error = null,
  title = "Connected",
  sub = "What each one is for, and whether it is answering.",
}: IntegrationsGridProps) {
  const [cat, setCat] = useState<string | null>(null);

  const shown = useMemo(
    () => (cat == null ? items : items.filter((i) => i.categoryId === cat)),
    [items, cat],
  );

  return (
    <div className="flex min-w-0 flex-col gap-2.5">
      <BlockHead title={title} sub={sub} />

      {categories.length > 0 && (
        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          <button
            type="button"
            aria-pressed={cat == null}
            onClick={() => setCat(null)}
            className={cn(
              "flex flex-none items-center gap-1.5 whitespace-nowrap rounded-[20px] border px-2.5 py-1 text-[10.5px] transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              cat == null
                ? "border-border-strong bg-muted text-foreground"
                : "border-border bg-card text-muted-foreground hover:text-foreground",
            )}
          >
            All
            <span className="tabular-nums opacity-[0.55]">{items.length}</span>
          </button>
          {categories.map((c) => {
            const on = cat === c.id;
            return (
              <button
                key={c.id}
                type="button"
                aria-pressed={on}
                onClick={() => setCat(on ? null : c.id)}
                className={cn(
                  "flex flex-none items-center gap-1.5 whitespace-nowrap rounded-[20px] border px-2.5 py-1 text-[10.5px] transition-colors",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  on
                    ? "border-border-strong bg-muted text-foreground"
                    : "border-border bg-card text-muted-foreground hover:text-foreground",
                )}
              >
                {c.label}
                <span className="tabular-nums opacity-[0.55]">{c.count ?? "—"}</span>
              </button>
            );
          })}
        </div>
      )}

      {loading && (
        <StatePlate
          title="Reading the integration surface…"
          body="Which integrations are connected, and whether each is answering, is being read."
        />
      )}

      {!loading && error && (
        <StatePlate title="The integration surface could not be read." body={error} />
      )}

      {!loading && !error && items.length === 0 && (
        <StatePlate
          title="The integration surface is not connected."
          body="Every tile here asserts something checkable — that a third party is connected, that its webhooks are registered, that it answered a ping. None of that is being reported, so no tile is drawn. A green dot on an unknown connection is the one failure worth avoiding here."
        />
      )}

      {!loading && !error && items.length > 0 && shown.length === 0 && (
        <div className="rounded-[14px] border border-dashed border-border px-3.5 py-5 text-[11.5px] text-muted-foreground">
          Nothing connected in this category.
        </div>
      )}

      {!loading && !error && shown.length > 0 && (
        <ul className="grid list-none grid-cols-1 gap-2.5 p-0 sm:grid-cols-2 min-[900px]:grid-cols-3">
          {shown.map((i) => {
            const tile = (
              <>
                <div className="flex min-w-0 items-center gap-2.5">
                  <span
                    aria-hidden
                    className="grid h-9 w-9 flex-none place-items-center rounded-[11px] text-[15px] text-rail-foreground shadow-[0_5px_12px_hsl(var(--shadow-ink)/0.16)]"
                    style={{ backgroundImage: tileFill(i.tone) }}
                  >
                    {i.glyph ?? i.name.slice(0, 1).toUpperCase()}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate whitespace-nowrap text-[12.5px] font-semibold">
                      {i.name}
                    </span>
                    <span className="mt-0.5 block truncate whitespace-nowrap text-[10px] text-muted-foreground">
                      {i.category ?? "—"}
                    </span>
                  </span>
                  <span
                    className={cn("ml-auto h-2 w-2 flex-none rounded-full", HEALTH_DOT[i.health])}
                    title={HEALTH_LABEL[i.health]}
                  >
                    <span className="sr-only">{HEALTH_LABEL[i.health]}</span>
                  </span>
                </div>
                <div className="min-w-0 truncate whitespace-nowrap text-[11px] leading-[1.45] text-muted-foreground">
                  {i.note ?? "—"}
                </div>
                <div className="flex min-w-0 items-center gap-2">
                  <span
                    className={cn(
                      "flex-none whitespace-nowrap rounded-[20px] px-[9px] py-[2.5px] text-[9.5px] font-semibold",
                      HEALTH_PILL[i.health],
                    )}
                  >
                    {i.state ?? "—"}
                  </span>
                  <span className="flex-none font-mono text-[9px] tabular-nums text-muted-foreground">
                    {i.hooks == null ? "— hooks" : `${nf.format(i.hooks)} hooks`}
                  </span>
                  {i.cta ? (
                    <span
                      className={cn(
                        "ml-auto flex-none whitespace-nowrap text-[11px] font-semibold",
                        i.onOpen ? "text-[hsl(var(--primary))]" : "text-muted-foreground",
                      )}
                    >
                      {i.cta}
                    </span>
                  ) : null}
                </div>
              </>
            );

            const shell =
              "flex h-full min-w-0 flex-col gap-2 rounded-[14px] border border-border bg-card p-3 text-left shadow-sm";

            return (
              <li key={i.id} className="min-w-0">
                {i.onOpen ? (
                  <button
                    type="button"
                    onClick={i.onOpen}
                    className={cn(
                      shell,
                      "w-full transition-[border-color,box-shadow] hover:border-border-strong hover:shadow-[0_10px_24px_hsl(var(--shadow-ink)/0.1)]",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    )}
                  >
                    {tile}
                  </button>
                ) : (
                  <div className={shell}>{tile}</div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {foot ? (
        <div className="text-[10.5px] leading-[1.5] text-muted-foreground">{foot}</div>
      ) : null}
    </div>
  );
}

export default MarketplaceStore;
