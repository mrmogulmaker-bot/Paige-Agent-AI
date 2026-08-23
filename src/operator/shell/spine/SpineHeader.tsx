/**
 * The spine's face row — the pack's `<header>` at `v3.dc.html` L3823–L3858.
 *
 * Geometry, verbatim: `flex:none; height:56px; padding:0 15px; display:flex;
 * align-items:center; gap:11px; border-bottom:1px solid var(--pg-line-soft)`.
 *
 * FOUR THINGS SIT IN IT, in this order: the Command Mark (26px, no plate — the plated variant
 * is the rail's lockup, this one is bare, L3826–L3831), the PAIGE lockup with its state line,
 * the Trust Compass mini-meter, and the two window controls.
 *
 * WHAT IS NOT PORTED, and why. The pack's `paigeStateLabel` resolves a real command state to
 * one of five authored words (L11073) — those words come over; which one shows does not,
 * because that is a live state. With no `state` the `<small>` is omitted entirely rather than
 * defaulting to "Ready", which would assert she is listening when nothing is wired (§13).
 * Same for the trust meter: no `trust` read, no meter and no name — never a five-bar graphic
 * at a guessed rung, because the rung IS the governance ceiling.
 *
 * The mark is inlined rather than taken from `CommandMark`, because that component renders the
 * RAIL variant — a 38px milled plaque (`--pg-graphite` + `--pg-rim`). The pack's spine mark is
 * a bare 26px glyph on the header ground with `data-cm` driving its colour and pulse.
 */
import { useCallback } from "react";
import type { SpineCommandState, SpineTrust, SpineTrustLevel } from "@/operator/shell/spine/spineContract";
import type { CommandMarkState } from "@/operator/shell/CommandMark";

/** `LV` — the Trust Compass ladder, L4578–L4584. Labels are authored copy and come over. */
export const TRUST_LEVELS = [
  { label: "Observe", note: "Reads and reports. Acts on nothing." },
  { label: "Draft only", note: "Composes work you review. Never delivers." },
  { label: "Ask first", note: "Prepares fully, then waits for your word at the act." },
  { label: "Act and report", note: "Acts within scope, tells you afterwards. Reversible acts only." },
  { label: "Autonomous", note: "Acts and only raises what needs a decision." },
] as const;

/** `paigeStateLabel` — L11073. Five authored words, one per real command state. */
const STATE_LABEL: Record<SpineCommandState, string> = {
  rest: "Ready",
  focus: "Ready",
  listening: "Listening",
  understanding: "Working — keep talking",
  executed: "Complete",
};

/**
 * `bar(i, false)` narrowed by `miniStyle` — L4600–L4607, L4624–L4625.
 * width 4px, height 5 + i × 2.5, radius 1px, no bloom. Lit rungs take `--pg-gold-deep`, the
 * top two `--pg-gold-fill`; unlit take `--pg-line`.
 */
function miniBarStyle(i: number, level: SpineTrustLevel): React.CSSProperties {
  const lit = i <= level;
  return {
    display: "block",
    flex: "none",
    width: "4px",
    height: `${5 + i * 2.5}px`,
    borderRadius: "1px",
    background: lit ? (i >= 3 ? "var(--pg-gold-fill)" : "var(--pg-gold-deep)") : "var(--pg-line)",
    transition: "background 200ms cubic-bezier(.22,1,.36,1)",
  };
}

/**
 * The two window controls, L3843–L3857. One shape, two glyphs: 30px square, `--pg-line`
 * hairline, `--pg-r-chip`, seated on `--pg-raised` with `--pg-lift-1` — a plate that RISES,
 * which is why it takes `raised` in both themes and not `surface`.
 */
const CONTROL_CLASS =
  "relative grid w-[30px] place-items-center rounded-[var(--pg-r-chip)] border " +
  "border-[var(--pg-line)] bg-[var(--pg-raised)] text-[var(--pg-muted)] " +
  "shadow-[var(--pg-lift-1)] transition-[color,border-color,box-shadow,transform] duration-150 " +
  "hover:-translate-y-px hover:border-[var(--pg-line-strong)] hover:text-[var(--pg-gold-deep)] " +
  "hover:shadow-[var(--pg-lift-2),inset_0_-2px_0_var(--pg-gold-deep)] " +
  "active:translate-y-0 active:text-[var(--pg-ink)] active:shadow-[var(--pg-inset)] " +
  "disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0 " +
  "disabled:hover:border-[var(--pg-line)] disabled:hover:text-[var(--pg-muted)] " +
  "disabled:hover:shadow-[var(--pg-lift-1)]";

export type SpineHeaderProps = {
  /** Drives `data-cm` — colour and pulse period. Unset falls back to the resting treatment. */
  readonly markState?: CommandMarkState;
  readonly state?: SpineCommandState | null;
  /** `spineDetached` (L11073) — the conversation is on its own monitor. */
  readonly detached?: boolean;
  readonly trust?: SpineTrust | null;
  readonly onDetach?: () => void;
  readonly onFold?: () => void;
  /** `scrollToTrust` — L4626. Brings the inline compass strip into view. */
  readonly onScrollToTrust?: () => void;
};

export default function SpineHeader({
  markState,
  state,
  detached = false,
  trust,
  onDetach,
  onFold,
  onScrollToTrust,
}: SpineHeaderProps) {
  const trustName = trust ? TRUST_LEVELS[trust.level].label : null;

  /** `scrollToTrust`, L4626 — ported as written: the strip's own scroll parent is the chat pane. */
  const scrollToTrust = useCallback(() => {
    if (onScrollToTrust) {
      onScrollToTrust();
      return;
    }
    const el = document.getElementById("pg-trust-inline");
    if (el && el.parentElement) el.parentElement.scrollTop = el.offsetTop - 40;
  }, [onScrollToTrust]);

  return (
    <header className="flex h-14 min-w-0 flex-none items-center gap-[11px] border-b border-[var(--pg-line-soft)] px-[15px]">
      {/* the mark · L3826–L3831 */}
      <span data-cm={markState} className="inline-grid h-[26px] w-[26px] flex-none place-items-center">
        <svg viewBox="0 0 48 48" width={26} height={26} aria-hidden="true">
          <polygon
            points="21,13.6 30.5,13.6 21,34.4 11.5,34.4"
            fill="var(--cm-slash)"
            stroke="var(--cm-slash)"
            strokeWidth={3.2}
            strokeLinejoin="round"
          />
          <circle cx="34.5" cy="30.5" r="5.5" fill="var(--cm-orb)" />
        </svg>
      </span>

      {/* the lockup · L3832–L3835 */}
      <span className="flex min-w-0 flex-col">
        <b
          className="font-display text-[length:var(--pg-t-label)] font-semibold tracking-[0.16em]"
          style={{ color: "var(--pg-ink)" }}
        >
          PAIGE
        </b>
        {detached || state ? (
          <small className="mt-[3px] truncate text-[length:var(--pg-t-label)] text-[var(--pg-faint)]">
            {detached ? "On its own monitor" : STATE_LABEL[state as SpineCommandState]}
          </small>
        ) : null}
      </span>

      {/* the ceiling readout · L3834–L3841 */}
      {trust ? (
        <button
          type="button"
          onClick={scrollToTrust}
          title={`Trust Compass — ${trustName}`}
          className="ml-auto flex min-h-[30px] items-center gap-[7px] border-0 bg-transparent px-[4px] text-left"
        >
          <span className="flex h-[14px] items-end gap-[2px]">
            {TRUST_LEVELS.map((lv, i) => (
              <i key={lv.label} aria-hidden style={miniBarStyle(i, trust.level)} />
            ))}
          </span>
          <span className="whitespace-nowrap text-[length:var(--pg-t-label)] font-medium text-[var(--pg-gold-deep)]">
            {trustName}
          </span>
        </button>
      ) : null}

      {/* the window controls · L3842–L3857 */}
      <span className={`flex h-[30px] flex-none items-stretch gap-[6px]${trust ? "" : " ml-auto"}`}>
        <button
          type="button"
          onClick={onDetach}
          disabled={!onDetach}
          title="Conversation on its own monitor"
          aria-label="Detach conversation"
          className={CONTROL_CLASS}
        >
          <svg viewBox="0 0 16 16" width={14} height={14} aria-hidden="true">
            <path d="M11.1 9.5v3.9H2.6V4.9h3.9" fill="none" stroke="currentColor" strokeWidth={1.25} strokeLinecap="round" strokeLinejoin="round" />
            <path d="M9.5 2.6h3.9v3.9" fill="none" stroke="currentColor" strokeWidth={1.25} strokeLinecap="round" strokeLinejoin="round" />
            <path d="M13.4 2.6L8.1 7.9" fill="none" stroke="currentColor" strokeWidth={1.45} strokeLinecap="round" />
          </svg>
          {/* `detachOnStyle` · L10722 — the lit under-edge while it is out on its own monitor. */}
          <i
            aria-hidden
            style={{
              position: "absolute",
              left: "3px",
              right: "3px",
              bottom: 0,
              height: "2px",
              borderRadius: "0 0 var(--pg-r-chip) var(--pg-r-chip)",
              background: "var(--pg-gold-fill)",
              display: detached ? "block" : "none",
            }}
          />
        </button>
        <button
          type="button"
          onClick={onFold}
          disabled={!onFold}
          title="Fold · ⌘\"
          aria-label="Fold the conversation"
          className={CONTROL_CLASS}
        >
          <svg viewBox="0 0 16 16" width={14} height={14} aria-hidden="true">
            <rect x="10.5" y="3.5" width="2.9" height="9" fill="currentColor" opacity=".13" />
            <path d="M2.6 3.5h10.8v9H2.6z M10.5 3.5v9" fill="none" stroke="currentColor" strokeWidth={1.25} strokeLinejoin="round" />
            <path d="M5.6 6.2L7.5 8 5.6 9.8" fill="none" stroke="currentColor" strokeWidth={1.45} strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </span>
    </header>
  );
}
