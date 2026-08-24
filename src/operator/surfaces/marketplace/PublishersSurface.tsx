import { cn } from "@/lib/utils";
import {
  MARKET_CLASSES,
  OUTSIDE_KINDS,
  type PublisherClass,
  type SubmissionKind,
} from "@/operator/surfaces/marketplaceVocabulary";
import {
  CLASS_REACH,
  PUBS_DECK,
  PUBS_FOOT,
  SHELF_ORDER,
  type Listing,
} from "@/operator/surfaces/marketplace/listingContract";

/**
 * Marketplace · Publishers — the delegation model as a surface.
 *
 * PORTED FROM `PAIGE Super Admin Shell v3.dc.html`: `pubsVals` L9540–L9606, markup L1295–L1332.
 * BUILD-ORDER Layer 3c.
 *
 * ─── WHY THIS SURFACE IS A SECURITY BOUNDARY AND NOT A PRICING PAGE ──────────────────────────
 *
 * CD's own header on the builder: *"A class is a ceiling on reach, and the kinds it may ship are
 * the security boundary — not a preference."* Each card carries three things in that order —
 * what the class is and what it costs, WHICH KINDS IT MAY SHIP, and how far its listings travel.
 * The kind row is the load-bearing one: a kind the class may not ship is struck through, and its
 * title says why. `OUTSIDE_KINDS` is the ruling — Template and Skill freely, Automation reviewed
 * every time, Integration and Agent platform-only because both are arbitrary behaviour against a
 * client's data.
 *
 * PLATFFORM SHIPS EVERYTHING; UNVERIFIED SHIPS NOTHING. `pubsVals` L9559 is explicit — Platform
 * is first party so the ruling does not bind it, and Unverified has no reviewed standing at all,
 * so it fails every kind regardless of what the ruling says about outside publishers generally.
 * Only Agency and Solo actually consult `OUTSIDE_KINDS`.
 *
 * ─── STRUCTURE BEFORE DATA ───────────────────────────────────────────────────────────────────
 *
 * The four classes, their notes, their splits and the ruling are all VOCABULARY — authored
 * design, already the one home in `marketplaceVocabulary.ts` (§18), and they come over whole.
 * The only figure on this surface is `listed`, a count of the platform's listings in each class,
 * and with no listings read it is an em-dash rather than a zero: zero would assert that the
 * class has published nothing, which is a claim about the marketplace, not about our wiring.
 *
 * Unverified reads an em-dash even with a full read — `pubsVals` L9550 does this deliberately,
 * because an unverified publisher cannot list at all, so counting its listings is meaningless
 * rather than merely unknown.
 */

export type PublishersSurfaceProps = {
  readonly listings?: readonly Listing[] | null;
};

const CLASS_ORDER = Object.keys(MARKET_CLASSES) as readonly PublisherClass[];

export default function PublishersSurface({ listings = null }: PublishersSurfaceProps) {
  return (
    <div className="mb-[30px] min-w-0">
      <p className="max-w-[54ch] border-b border-[var(--pg-line)] pb-5 font-[var(--pg-font-editorial)] text-[15.5px] leading-[1.6] text-[var(--pg-ink-2)] [text-wrap:pretty]">
        {PUBS_DECK}
      </p>

      <div className="mt-[18px] grid grid-cols-[repeat(auto-fit,minmax(min(100%,272px),1fr))] gap-3">
        {CLASS_ORDER.map((key) => {
          const c = MARKET_CLASSES[key];
          const listed =
            key === "Unverified"
              ? "—"
              : listings === null
                ? "—"
                : String(listings.filter((l) => l.cls === key).length);
          return (
            <div
              key={key}
              className="min-w-0 rounded-[var(--pg-r-plate)] bg-[var(--pg-raised)] px-[17px] pb-[17px] pt-4 shadow-[shadow:var(--pg-rim),var(--pg-lift-1)]"
            >
              <div className="flex items-center gap-2.5">
                <i
                  aria-hidden
                  className="h-[9px] w-[9px] flex-none rotate-45"
                  style={{ background: c.trust }}
                />
                <b className="min-w-0 truncate text-[12.5px] font-medium">{c.label}</b>
                <small className="ml-auto flex-none whitespace-nowrap font-mono text-[10px] text-[var(--pg-faint)]">
                  {c.split}
                </small>
              </div>

              <p className="mt-[11px] text-[12.5px] leading-[1.55] text-[var(--pg-muted)] [text-wrap:pretty]">
                {c.note}
              </p>

              {/* The security boundary, drawn. A struck-through kind is one this class may not
                  ship at all — never a preference, and the title says so. */}
              <div className="mt-[13px] flex flex-wrap gap-[5px]">
                {SHELF_ORDER.map((k) => (
                  <KindChip key={k} kind={k} cls={key} />
                ))}
              </div>

              <div className="mt-[15px] flex items-baseline gap-3.5 border-t border-[var(--pg-line-soft)] pt-3">
                <span className="flex items-baseline gap-[5px]">
                  <b className="tabular-nums font-mono text-[15px] font-medium tracking-[-0.01em] text-foreground">
                    {listed}
                  </b>
                  <small className="text-[10.5px] text-[var(--pg-faint)]">listed</small>
                </span>
                <span className="flex items-baseline gap-[5px]">
                  <b
                    className={cn(
                      "text-[12.5px] font-medium",
                      key === "Platform" ? "text-[var(--pg-gold-deep)]" : "text-[var(--pg-ink-2)]",
                    )}
                  >
                    {CLASS_REACH[key]}
                  </b>
                  <small className="text-[10.5px] text-[var(--pg-faint)]">widest reach</small>
                </span>
              </div>
            </div>
          );
        })}
      </div>

      <p className="mt-5 max-w-[64ch] border-t border-[var(--pg-line-soft)] pt-[13px] text-[11px] leading-[1.55] text-[var(--pg-faint)] [text-wrap:pretty]">
        {PUBS_FOOT}
      </p>
    </div>
  );
}

/** `pb.kinds` — `pubsVals` L9557–L9578, including the three-way `allow` and its three titles. */
function KindChip({ kind, cls }: { kind: SubmissionKind; cls: PublisherClass }) {
  // Platform ships everything; Unverified ships nothing; everyone else answers to the ruling.
  const allow: true | false | "review" =
    cls === "Platform" ? true : cls === "Unverified" ? false : OUTSIDE_KINDS[kind];
  const hue = `var(--k-${kind.toLowerCase()})`;
  const label = allow === "review" ? `${kind} · review` : kind;
  const title =
    allow === true
      ? "May ship freely"
      : allow === "review"
        ? "May ship, reviewed every time"
        : `${kind} is platform-only until a security review exists`;
  return (
    <small
      title={title}
      className="inline-flex min-h-[22px] items-center whitespace-nowrap rounded-[var(--pg-r-pill)] px-2 text-[10px]"
      style={{
        border:
          "1px solid " +
          (allow === true
            ? `color-mix(in srgb, ${hue} 45%, transparent)`
            : allow === "review"
              ? "var(--pg-line)"
              : "var(--pg-line-soft)"),
        color: allow === true ? hue : allow === "review" ? "var(--pg-muted)" : "var(--pg-faint)",
        textDecoration: allow === false ? "line-through" : "none",
        opacity: allow === false ? 0.6 : 1,
      }}
    >
      {label}
    </small>
  );
}
