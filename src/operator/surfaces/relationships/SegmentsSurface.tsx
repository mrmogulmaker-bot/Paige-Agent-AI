import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import {
  RELATIONSHIPS_ABSENCE,
  SEGMENTS_DECK,
  SEGMENTS_FOOT,
  segmentSentence,
  type SegmentRow,
} from "@/operator/surfaces/relationships/relationshipsContract";

/**
 * Relationships · Segments — a saved view of the book, kept as words.
 *
 * PORTED FROM `PAIGE Super Admin Shell v3.dc.html`: `segVals` L6393–L6520, markup L296–L385.
 * BUILD-ORDER Layer 3a.
 *
 * ─── WHY THE RULE RENDERS AS WORDS ───────────────────────────────────────────────────────────
 *
 * CD's comment at L6459 is the design: *"Clauses render as words, not as a filter object — this
 * is the form she reasons over."* A segment is stored as `[operator, value]` pairs and said back
 * as a sentence, which is what lets her write one from a description and read one back aloud.
 * The two doors above the list follow from that: DESCRIBE ONE TO HER (she writes the clauses)
 * and NEW SEGMENT (clause by clause). Both open `segBuildVals`, which is Layer 4.
 *
 * ─── UNSIZED IS NOT ZERO, AND THAT IS THE WHOLE POINT ────────────────────────────────────────
 *
 * A segment whose clauses cannot be resolved against what the platform stores shows NO COUNT —
 * `segVals` L6438 — with a line naming what is missing: *"The rule is sound; the history it
 * reads is not there yet, so no count is shown rather than a plausible one."* That distinction
 * is §13 in miniature and it is why `count` is `number | null` rather than a number with a zero
 * default: a rendered `0` would assert that nobody matches, which is a different and false claim.
 *
 * ─── STRUCTURE BEFORE DATA ───────────────────────────────────────────────────────────────────
 *
 * `segments` arrives empty and that is the finished Layer 3 state. `P.SEGMENTS` is CD's
 * illustration — named rules with member lists and computed counts — and it does not come over.
 * The four acts along the foot take handlers; with none supplied they are visibly unavailable
 * rather than controls that look live and silently do nothing.
 */

export type SegmentsSurfaceProps = {
  readonly segments?: readonly SegmentRow[];
  /** `segAsk` — the summon where she writes the clauses from a description (Layer 4). */
  readonly onDescribe?: () => void;
  /** `segNew` — the summon that builds a rule clause by clause (Layer 4). */
  readonly onNew?: () => void;
  readonly onEditRule?: (segment: SegmentRow) => void;
  readonly onOpenInPeople?: (segment: SegmentRow) => void;
  readonly onUseInCampaign?: (segment: SegmentRow) => void;
  readonly onGiveToAutomation?: (segment: SegmentRow) => void;
  readonly onRecompute?: (segment: SegmentRow) => void;
};

const CAPTION =
  "text-[11px] uppercase tracking-[0.06em] text-[var(--pg-faint)]";

export default function SegmentsSurface({
  segments = [],
  onDescribe,
  onNew,
  onEditRule,
  onOpenInPeople,
  onUseInCampaign,
  onGiveToAutomation,
  onRecompute,
}: SegmentsSurfaceProps) {
  const [id, setId] = useState<string | null>(null);
  const [solo, setSolo] = useState<"list" | "detail">("list");

  const active = useMemo(
    () => segments.find((s) => s.id === id) ?? segments[0] ?? null,
    [segments, id],
  );

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      {/* ── THE DECK AND THE TWO DOORS · v3 L297–L313 ───────────────────────────────────────── */}
      <div className="flex flex-none flex-wrap items-center gap-2 border-b border-[var(--pg-line-soft)] pb-2.5">
        <span className="text-[12.5px] text-[var(--pg-muted)]">{SEGMENTS_DECK}</span>
        <span className="min-w-[12px] flex-1" />
        <button
          type="button"
          onClick={onDescribe}
          disabled={!onDescribe}
          title={onDescribe ? undefined : "Her segment builder is drawn in the pack and not ported yet"}
          className={cn(
            "inline-flex min-h-[31px] flex-none items-center gap-[7px] whitespace-nowrap rounded-[var(--pg-r-chip)]",
            "border border-[var(--pg-line-authority)] bg-[var(--pg-gold-bloom)] px-[13px] text-[11.5px] font-medium text-[var(--pg-gold)]",
            "shadow-[shadow:var(--pg-lift-1)] transition-[border-color,box-shadow,transform] duration-150 disabled:opacity-45",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          )}
        >
          {/* The Command Mark — her own glyph, the pack's own path (L301–L304). */}
          <svg viewBox="0 0 48 48" aria-hidden className="h-[13px] w-[13px] flex-none">
            <polygon points="21,13.6 30.5,13.6 21,34.4 11.5,34.4" fill="currentColor" />
            <circle cx="34.5" cy="30.5" r="5.5" fill="currentColor" />
          </svg>
          Describe one to her
        </button>
        <button
          type="button"
          onClick={onNew}
          disabled={!onNew}
          title={onNew ? undefined : "The clause builder is drawn in the pack and not ported yet"}
          className={cn(
            "inline-flex min-h-[31px] flex-none items-center gap-[7px] whitespace-nowrap rounded-[var(--pg-r-chip)]",
            "border border-[var(--pg-line)] bg-[var(--pg-raised)] px-[13px] text-[11.5px] text-[var(--pg-muted)]",
            "shadow-[shadow:var(--pg-lift-1)] transition-[color,border-color,box-shadow,transform] duration-150 disabled:opacity-45",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          )}
        >
          <svg viewBox="0 0 16 16" aria-hidden className="h-[13px] w-[13px] flex-none">
            <path d="M2.9 3.4h10.2l-3.9 4.5v4.1L6.8 10.6V7.9z" fill="currentColor" opacity=".13" />
            <path
              d="M2.9 3.4h10.2l-3.9 4.5v4.1L6.8 10.6V7.9z"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.25"
              strokeLinejoin="round"
            />
          </svg>
          New segment
        </button>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[minmax(0,0.95fr)_minmax(320px,1.15fr)]">
        {/* the list */}
        <div
          className={cn(
            "min-h-0 min-w-0 flex-col lg:flex lg:pr-3.5 lg:shadow-[shadow:inset_-1px_0_0_var(--pg-line-soft)]",
            solo === "list" ? "flex" : "hidden",
          )}
        >
          <div className="min-h-0 flex-1 overflow-auto">
            {segments.map((s) => {
              const on = active?.id === s.id;
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => {
                    setId(s.id);
                    setSolo("detail");
                  }}
                  className={cn(
                    "grid min-h-[58px] w-full grid-cols-[2px_minmax(0,1fr)_auto] items-center gap-[11px] border-0 border-b border-[var(--pg-line-soft)] py-[9px] pl-0 pr-1 text-left",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                    on ? "bg-[var(--pg-lift)]" : "bg-transparent",
                  )}
                >
                  <i
                    aria-hidden
                    className="self-stretch"
                    style={{
                      background: on
                        ? "var(--pg-gold)"
                        : s.live
                          ? "var(--pg-line-strong)"
                          : "transparent",
                    }}
                  />
                  <span className="flex min-w-0 flex-col">
                    <b className="truncate text-[12.5px] font-medium text-foreground">{s.name}</b>
                    <small className="mt-[3px] truncate text-[11px] text-[var(--pg-faint)]">
                      {segmentSentence(s.clauses)}
                    </small>
                  </span>
                  {/* Unsized reads an em-dash, never a zero — a zero asserts that nobody
                      matches, which is a different claim from "she cannot size this". */}
                  <span
                    className={cn(
                      "tabular-nums font-mono text-[15px] font-medium",
                      s.live ? "text-[var(--pg-ink-2)]" : "text-[var(--pg-faint)]",
                    )}
                  >
                    {s.count === null ? "—" : s.count}
                  </span>
                </button>
              );
            })}

            {segments.length === 0 && (
              <div className="max-w-[62ch] px-1 py-5">
                <b className="block text-[12px] font-semibold text-foreground">
                  {RELATIONSHIPS_ABSENCE.title}
                </b>
                <p className="mt-2 text-[12px] leading-[1.6] text-muted-foreground [text-wrap:pretty]">
                  {RELATIONSHIPS_ABSENCE.body}
                </p>
              </div>
            )}
          </div>
        </div>

        {/* the rule */}
        <div
          className={cn(
            "min-h-0 min-w-0 flex-col lg:flex lg:pl-[18px] lg:pt-0.5",
            solo === "detail" ? "flex pt-2.5" : "hidden",
          )}
        >
          {!active ? (
            <p className="text-[11.5px] leading-[1.6] text-[var(--pg-faint)]">
              No segment is selected because none is read yet. The pane is the rule said back in
              words, who it admits, and where the platform is already using it.
            </p>
          ) : (
            <>
              <div className="flex flex-none items-center gap-[9px] border-b border-[var(--pg-line-soft)] pb-[11px]">
                <button
                  type="button"
                  onClick={() => setSolo("list")}
                  className="min-h-[24px] flex-none whitespace-nowrap border-0 bg-transparent pl-0 pr-2 text-[11px] text-[var(--pg-muted)] lg:hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  ‹ All segments
                </button>
                <b className="min-w-0 flex-1 truncate font-[var(--pg-font-display)] text-[15px] font-medium tracking-[-0.012em]">
                  {active.name}
                </b>
                <span
                  className={cn(
                    "tabular-nums flex-none font-mono text-[12px] font-medium",
                    active.live ? "text-[var(--pg-gold)]" : "text-[var(--pg-faint)]",
                  )}
                >
                  {active.count === null ? "— unsized" : `${active.count} of ${active.of ?? "—"}`}
                </span>
              </div>

              <div className="min-h-0 flex-1 overflow-auto pt-3.5">
                <p className={CAPTION}>The rule</p>
                <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                  {active.clauses.map((c, i) => (
                    <span key={`${c[0]}-${c[1]}-${i}`} className="contents">
                      <span className="text-[12px] text-[var(--pg-faint)]">{c[0]}</span>
                      <span className="inline-flex min-h-[26px] items-center whitespace-nowrap rounded-[var(--pg-r-chip)] border border-[var(--pg-line)] px-[9px] text-[12px] font-medium text-[var(--pg-ink-2)]">
                        {c[1]}
                      </span>
                      {i < active.clauses.length - 1 && (
                        <span className="text-[12px] text-[var(--pg-faint)]">and</span>
                      )}
                    </span>
                  ))}
                  <button
                    type="button"
                    onClick={onEditRule && (() => onEditRule(active))}
                    disabled={!onEditRule}
                    className="min-h-[26px] flex-none rounded-[var(--pg-r-chip)] border border-dashed border-[var(--pg-line-strong)] bg-transparent px-[9px] text-[11.5px] text-[var(--pg-faint)] disabled:opacity-45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    Edit
                  </button>
                </div>

                <p className="mt-3.5 max-w-[56ch] font-[var(--pg-font-editorial)] text-[15px] leading-[1.62] text-[var(--pg-ink-2)] [text-wrap:pretty]">
                  {active.why}
                </p>

                <p className={cn(CAPTION, "mt-5 border-t border-[var(--pg-line-soft)] pt-[13px]")}>
                  Who is in it
                </p>
                <div className="mt-2">
                  {(active.members ?? []).map(([name, why]) => (
                    <div
                      key={name}
                      className="grid min-h-[40px] grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b border-[var(--pg-line-soft)]"
                    >
                      <b className="truncate text-[12.5px] font-medium">{name}</b>
                      <small className="whitespace-nowrap font-mono text-[10.5px] text-[var(--pg-faint)]">
                        {why}
                      </small>
                    </div>
                  ))}
                  {!active.live && (
                    <p className="py-2.5 text-[12px] leading-[1.55] text-[var(--pg-faint)]">
                      She cannot size this one
                      {active.computed ? `: ${active.computed}` : ""}. The rule is sound; the
                      history it reads is not there yet, so no count is shown rather than a
                      plausible one.
                    </p>
                  )}
                  {active.live && (active.members ?? []).length === 0 && (
                    <p className="py-2.5 text-[12px] leading-[1.55] text-[var(--pg-faint)]">
                      Membership resolves when the rule is read. No read has run yet.
                    </p>
                  )}
                </div>

                <p className={cn(CAPTION, "mt-5 border-t border-[var(--pg-line-soft)] pt-[13px]")}>
                  Where it is used
                </p>
                <div className="mt-2">
                  {(active.used ?? []).map(([k, v]) => (
                    <div key={k} className="grid min-h-[36px] grid-cols-[auto_minmax(0,1fr)] items-center gap-3">
                      <small className="font-mono text-[10.5px] text-[var(--pg-faint)]">{k}</small>
                      <span
                        className={cn(
                          "truncate text-[12.5px]",
                          /^—/.test(v) ? "text-[var(--pg-faint)]" : "text-[var(--pg-ink-2)]",
                        )}
                      >
                        {v}
                      </span>
                    </div>
                  ))}
                  {(active.used ?? []).length === 0 && (
                    <p className="py-1 text-[12px] text-[var(--pg-faint)]">
                      Nothing is reading this segment yet.
                    </p>
                  )}
                </div>

                <div className="mt-[18px] flex flex-wrap gap-1.5 border-t border-[var(--pg-line-soft)] pt-3.5">
                  <SegAct label="Open in People" onClick={onOpenInPeople && (() => onOpenInPeople(active))} />
                  <SegAct
                    label="Use in a campaign"
                    onClick={onUseInCampaign && (() => onUseInCampaign(active))}
                  />
                  <SegAct
                    label="Give it to an automation"
                    onClick={onGiveToAutomation && (() => onGiveToAutomation(active))}
                  />
                  <SegAct
                    label="Recompute"
                    gold
                    onClick={onRecompute && (() => onRecompute(active))}
                  />
                </div>
                <p className="mt-3 max-w-[74ch] text-[11px] leading-[1.5] text-[var(--pg-faint)] [text-wrap:pretty]">
                  {SEGMENTS_FOOT}
                </p>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/** `segVals` L6407 `act()`. Gold on Recompute — the one act that changes what the surface says. */
function SegAct({ label, gold, onClick }: { label: string; gold?: boolean; onClick?: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      title={onClick ? undefined : `${label} has no seam wired yet`}
      className={cn(
        "min-h-[32px] flex-none whitespace-nowrap rounded-[var(--pg-r-chip)] px-[13px] text-[12px] disabled:opacity-45",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        gold
          ? "border border-[var(--pg-gold)] bg-[var(--pg-gold)] font-semibold text-[#17120c]"
          : "border border-[var(--pg-line)] bg-transparent text-[var(--pg-muted)]",
      )}
    >
      {label}
    </button>
  );
}
