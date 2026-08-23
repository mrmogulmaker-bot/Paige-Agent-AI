import { useEffect, useRef, useState } from "react";

/**
 * Relationships → Conversations — the outbound composer.
 *
 * PORTED FROM the v3 pack:
 *   markup   `PAIGE Super Admin Shell v3.dc.html` L823–L878  (the composer foot of the thread pane)
 *   geometry `PAIGE Super Admin Shell v3.dc.html` L5241–L5470 (`convoVals(on)`)
 *   contract `paige-ia.js` L515–L531 (`P.CHANNELS`, `P.DM_NETWORKS`)
 *
 * WHERE "COMPOSE" ACTUALLY IS IN v3, because it is not where the old tree put it.
 * `PORT-SPEC-palette-and-six-surfaces.md` lists a §6 "Compose — outbound comms"; the document
 * body ends after §5, so §6 was never written, and its own §5 cross-refers to "§6" as the
 * Relationships → Conversations console instead. The pack itself settles it two ways:
 *   · `P.SUMMONS.email` — `{ title: 'Compose', … }`, `paige-ia.js` L102 — is a SUMMONED
 *     capability off ⌘K, already ported in `src/operator/shell/commandPalette.ts`. It is not a
 *     place, and there is no `showCompose`/`showEmail` bespoke body anywhere in the pack.
 *   · The one composer the pack DRAWS is this one: the foot of the Conversations thread pane,
 *     a real place (`relationships/conversations` in the six-slot IA).
 * So this is the outbound compose surface, and it is a port, not a blocker (PACK-FIRST).
 *
 * FIXTURES NOT PORTED (§13, `src/operator/CLAUDE.md` "structure is design, values are data"):
 *   · `P.THREADS` — every row is labelled "design fixture A/B" in the pack; the active thread,
 *     its messages, its `who` and its `draft` are values. `draft` arrives as a prop or is absent.
 *   · `SNIPS` (pack L5381–L5386) — four written-in sample message bodies. Snippet CONTENT is
 *     tenant data, so it arrives as a prop; with none read the trigger is disabled rather than
 *     opening an empty popover the pack never drew.
 * `P.CHANNELS` is not a fixture: five named channels with a substrate claim about this repo,
 * the same class as `P.INT_KINDS`, so it ports verbatim.
 *
 * CONTROLS ARE REAL OR VISIBLY UNAVAILABLE. Send, Save draft, the tools and the snippet
 * trigger are `disabled` when no handler/read is wired — never a control that looks live and
 * silently does nothing (`src/operator/CLAUDE.md`, "every control is real or honestly inert").
 * The handlers are the drop-in for backend slice H (`usePlatformComms`); no hook is written
 * here, that file belongs to another agent.
 *
 * ELEVATION — RULING F: elevation is distance from `--pg-env`, and the tokens that INVERT
 * between themes are the fills. Applied per element:
 *   channel trigger  RISES   → `--pg-raised` (pack L5457, already correct in both themes)
 *   snippet trigger  RISES   → `--pg-raised` when open (pack L5453, correct)
 *   both popovers    RISE    → `--pg-raised` + the pack's `--pg-e4` (pack L5461/L5464). The
 *                              fill does not invert and the shadow is authored per theme, so
 *                              there is nothing here to correct.
 *   the foot strip   neither → unpainted, a `--pg-line` hairline only (pack L823)
 *
 * ONE RAW HEX IS PORTED VERBATIM: the gold act button's ink, `#17120c` (pack L5341). No token
 * carries it; substituting one would be inventing rather than porting. Reported, not resolved.
 */

export type ComposeChannel = {
  readonly key: string;
  readonly glyph: string;
  readonly substrate: string;
  readonly social?: boolean;
};

/** `paige-ia.js` L515–L521 — verbatim. */
export const CHANNELS: readonly ComposeChannel[] = [
  { key: "Email", glyph: "M2 4.2h12v7.6H2z M2 4.2l6 4.4 6-4.4", substrate: "Live" },
  { key: "SMS", glyph: "M2.4 3.4h11.2v7.4H7l-3.2 2.6v-2.6H2.4z", substrate: "Live" },
  { key: "Voice", glyph: "M3 3.4h2.8l1.2 2.8-1.6 1.2a8 8 0 0 0 3.2 3.2l1.2-1.6 2.8 1.2v2.8a10.6 10.6 0 0 1-9.6-9.6z", substrate: "No substrate" },
  { key: "WhatsApp", glyph: "M8 2.4a5.6 5.6 0 0 0-4.8 8.5L2.4 13.6l2.8-.8A5.6 5.6 0 1 0 8 2.4z", substrate: "Stage 3" },
  { key: "DM", glyph: "M2.6 3.6h10.8v6.8H8.4L5.2 13v-2.6H2.6z M5.4 7h.01 M8 7h.01 M10.6 7h.01", substrate: "No substrate", social: true },
];

/** `paige-ia.js` L525–L530 — verbatim. A DM shows its network's glyph, not a generic bubble. */
export const DM_NETWORKS: Readonly<Record<string, { glyph: string; substrate: string }>> = {
  LinkedIn: { glyph: "M3.4 6.4v6.2 M3.4 3.6h.01 M6.6 12.6V6.4 M6.6 8.8a2.6 2.6 0 0 1 5.2 0v3.8", substrate: "No substrate" },
  Instagram: { glyph: "M3.4 3.4h9.2v9.2H3.4z M6 8a2 2 0 1 0 4 0a2 2 0 1 0-4 0 M10.8 5.2h.01", substrate: "No substrate" },
  X: { glyph: "M3.4 3.4l9.2 9.2 M12.6 3.4L3.4 12.6", substrate: "No substrate" },
  Facebook: { glyph: "M9.4 13V8.4h2 M6.4 8.4h4.6 M9.4 8.4V5.6a2.2 2.2 0 0 1 2.2-2.2h1", substrate: "No substrate" },
};

/** Pack L5373–L5375 — the three composer tools, in order. */
const G_MIC = "M8 2.6a1.9 1.9 0 0 1 1.9 1.9v3.6a1.9 1.9 0 0 1-3.8 0V4.5A1.9 1.9 0 0 1 8 2.6z M4 7.6a4 4 0 0 0 8 0 M8 11.6v1.8 M6 13.4h4";
const G_CLIP = "M11.4 6.6L7 11a2.3 2.3 0 0 1-3.3-3.3l4.8-4.8a1.5 1.5 0 0 1 2.1 2.1L5.8 9.8a.8.8 0 0 1-1.1-1.1l4.4-4.4";
const G_DOWN = "M8 2.6v7.6 M5 7.6L8 10.6l3-3 M3 12.4h10";
const G_SNIP = "M3.4 2.6h6.2l3 3v7.8H3.4z M9.4 2.6v3.2h3.2 M5.6 8.4h4.8 M5.6 10.8h3.2";

/** Pack L5324 — `tight` is a property of the conversation pane, not the canvas. */
const TIGHT_BELOW = 400;

export type ComposeSnippet = { readonly k: string; readonly v: string };

export type ComposeOutboundProps = {
  readonly channels?: readonly ComposeChannel[];
  /** Which channel the message sends as. Absent → the first channel, as the pack falls back. */
  readonly sendAs?: string;
  readonly onSendAs?: (key: string) => void;
  /** Which network a DM arrived on — a property of the thread, so a value. */
  readonly network?: string | null;
  /** Her draft for this thread. A value: absent renders no "She drafted" line, as the pack does. */
  readonly draft?: string | null;
  /** Tenant snippets. Empty until a read lands; the trigger is disabled rather than empty. */
  readonly snippets?: readonly ComposeSnippet[];
  readonly onInsertSnippet?: (s: ComposeSnippet) => void;
  readonly value?: string;
  readonly onChange?: (v: string) => void;
  readonly onSend?: () => void;
  readonly onSaveDraft?: () => void;
  readonly onSpeak?: () => void;
  readonly onAttach?: () => void;
  readonly onDownload?: () => void;
  /** Pack: mic reads gold-core while the command bar is listening. */
  readonly listening?: boolean;
  /** Override the measured pane width test. Absent → measured, as the pack derives it. */
  readonly tight?: boolean;
};

export default function ComposeOutbound({
  channels = CHANNELS,
  sendAs,
  onSendAs,
  network = null,
  draft = null,
  snippets = [],
  onInsertSnippet,
  value,
  onChange,
  onSend,
  onSaveDraft,
  onSpeak,
  onAttach,
  onDownload,
  listening = false,
  tight,
}: ComposeOutboundProps) {
  const [chanOpen, setChanOpen] = useState(false);
  const [snipOpen, setSnipOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [measured, setMeasured] = useState<number | null>(null);

  useEffect(() => {
    const el = rootRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (typeof w === "number") setMeasured(w);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const isTight = tight ?? (measured !== null && measured < TIGHT_BELOW);

  const sendKey = sendAs ?? channels[0]?.key ?? "";
  const active = channels.find((c) => c.key === sendKey) ?? channels[0];
  const substrate = active?.substrate ?? "";
  const live = substrate === "Live";

  /** Pack L5443–L5444. */
  const activeChannel = sendKey === "DM" && network ? network : sendKey;
  const activeGlyph =
    (network && DM_NETWORKS[network]?.glyph) || active?.glyph || channels[0]?.glyph || "";

  /** Pack L5468. */
  const composerHint = live ? "Write, or let her draft it" : `She can compose — ${substrate.toLowerCase()}`;
  /** Pack L5445. */
  const sendAsNote = live ? "" : "nothing will send";
  /** Pack L5345–L5349 — the secondary act steps aside on a tight pane; Send always keeps its line. */
  const sendLabel = draft && !isTight ? "Send her draft" : "Send";

  const act = (gold: boolean) =>
    ({
      minHeight: "32px",
      padding: "0 12px",
      border: `1px solid ${gold ? "var(--pg-gold)" : "var(--pg-line)"}`,
      background: gold ? "var(--pg-gold)" : "transparent",
      color: gold ? "#17120c" : "var(--pg-muted)",
      fontWeight: gold ? 650 : 400,
      borderRadius: "2px",
    }) as const;

  return (
    <div ref={rootRef} className="flex-none border-t border-[var(--pg-line)]">
      {/* ── her draft · pack L824–L829 ─────────────────────────────────── */}
      {draft ? (
        <p className="flex items-baseline gap-[9px] px-3.5 pb-0 pt-[9px]">
          <small className="flex-none text-[length:var(--pg-t-label)] font-semibold uppercase tracking-[0.13em] text-[var(--pg-gold-deep)]">
            She drafted
          </small>
          <span className="min-w-0 truncate font-serif text-[length:var(--pg-t-body)] italic leading-[1.5] text-[var(--pg-ink-2)]">
            {draft}
          </span>
        </p>
      ) : null}

      {/* ── the message · pack L831 ────────────────────────────────────── */}
      <textarea
        aria-label="Write a message"
        placeholder={composerHint}
        value={value}
        onChange={onChange ? (e) => onChange(e.target.value) : undefined}
        className="block h-10 w-full resize-none border-0 bg-transparent px-3.5 pb-0.5 pt-2.5 text-[length:var(--pg-t-body)] leading-[1.5] text-[var(--pg-ink)] outline-none placeholder:text-[var(--pg-faint)]"
      />

      {/* ── the control row · pack L833–L876 ───────────────────────────── */}
      <div className="relative flex flex-wrap items-center gap-[5px] px-[11px] pb-[9px] pt-0.5">
        <button
          type="button"
          aria-haspopup="listbox"
          aria-expanded={chanOpen}
          onClick={() => {
            setChanOpen((o) => !o);
            setSnipOpen(false);
          }}
          className="inline-flex min-h-[30px] flex-none items-center gap-2 whitespace-nowrap rounded-[var(--pg-r-chip)] border border-[var(--pg-line-strong)] bg-[var(--pg-raised)] px-2.5 text-[length:var(--pg-t-body)] font-semibold"
          style={{ color: live ? "var(--pg-ink)" : "var(--pg-warning)" }}
        >
          <svg viewBox="0 0 16 16" aria-hidden="true" className="h-[13px] w-[13px]">
            <path d={activeGlyph} fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="square" strokeLinejoin="round" />
          </svg>
          {activeChannel}
          <svg viewBox="0 0 10 10" aria-hidden="true" className="h-[9px] w-[9px] opacity-70">
            <path d="M2 4l3 3 3-3" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
          </svg>
        </button>

        <button
          type="button"
          title="Snippets"
          aria-label="Snippets"
          disabled={!snippets.length}
          onClick={() => {
            setSnipOpen((o) => !o);
            setChanOpen(false);
          }}
          className="grid h-[30px] w-[30px] flex-none place-items-center rounded-[var(--pg-r-chip)] border-0 disabled:opacity-40"
          style={{
            background: snipOpen ? "var(--pg-raised)" : "transparent",
            boxShadow: snipOpen ? "inset 0 0 0 1px var(--pg-line-strong)" : "none",
            color: snipOpen ? "var(--pg-gold-deep)" : "var(--pg-faint)",
          }}
        >
          <svg viewBox="0 0 16 16" aria-hidden="true" className="h-3.5 w-3.5">
            <path d={G_SNIP} fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="square" strokeLinejoin="round" />
          </svg>
        </button>

        {(
          [
            ["Speak to her", G_MIC, onSpeak, listening ? "var(--pg-gold-core)" : null],
            ["Attach a file", G_CLIP, onAttach, null],
            ["Download the thread", G_DOWN, onDownload, null],
          ] as ReadonlyArray<[string, string, (() => void) | undefined, string | null]>
        ).map(([title, glyph, handler, tone]) => (
          <button
            key={title}
            type="button"
            title={title}
            aria-label={title}
            disabled={!handler}
            onClick={handler}
            className="grid h-[30px] w-[30px] flex-none place-items-center rounded-[var(--pg-r-chip)] border-0 bg-transparent disabled:opacity-40"
            style={{ color: tone ?? "var(--pg-faint)" }}
          >
            <svg viewBox="0 0 16 16" aria-hidden="true" className="h-[15px] w-[15px]">
              <path d={glyph} fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="square" strokeLinejoin="round" />
            </svg>
          </button>
        ))}

        <span
          className="min-w-0 truncate whitespace-nowrap pr-1 text-right font-mono text-[length:var(--pg-t-label)] text-[var(--pg-warning)]"
          style={{ flex: isTight ? "none" : 1, marginLeft: isTight ? "auto" : 0, order: isTight ? -1 : 0 }}
        >
          {sendAsNote}
        </span>

        {!isTight && (
          <button
            type="button"
            disabled={!onSaveDraft}
            onClick={onSaveDraft}
            style={act(false)}
            className="flex-none whitespace-nowrap text-[length:var(--pg-t-body)] disabled:opacity-40"
          >
            Save draft
          </button>
        )}
        <button
          type="button"
          disabled={!onSend}
          onClick={onSend}
          style={act(true)}
          className="flex-none whitespace-nowrap text-[length:var(--pg-t-body)] disabled:opacity-40"
        >
          {sendLabel}
        </button>

        {/* ── send-as · pack L852–L862 ──────────────────────────────────── */}
        {chanOpen && (
          <div
            role="listbox"
            aria-label="Send as"
            className="absolute bottom-[calc(100%+6px)] left-0 z-[9] min-w-[232px] overflow-hidden rounded-[var(--pg-r-plate)] border border-[var(--pg-line-strong)] bg-[var(--pg-raised)] shadow-[var(--pg-e4)]"
          >
            {channels.map((c) => {
              const on = c.key === sendKey;
              const cLive = c.substrate === "Live";
              return (
                <button
                  key={c.key}
                  type="button"
                  role="option"
                  aria-selected={on}
                  disabled={!onSendAs}
                  onClick={() => {
                    onSendAs?.(c.key);
                    setChanOpen(false);
                  }}
                  className="grid min-h-[38px] w-full grid-cols-[16px_minmax(0,1fr)_auto] items-center gap-2.5 border-0 px-3 text-left text-[length:var(--pg-t-body)] disabled:opacity-40"
                  style={{
                    background: on ? "var(--pg-lift)" : "transparent",
                    color: on ? "var(--pg-ink)" : "var(--pg-ink-2)",
                    fontWeight: on ? 600 : 400,
                  }}
                >
                  <svg viewBox="0 0 16 16" aria-hidden="true" className="h-[15px] w-[15px]">
                    <path d={c.glyph} fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="square" strokeLinejoin="round" />
                  </svg>
                  {c.key}
                  <small
                    className="font-mono text-[length:var(--pg-t-label)]"
                    style={{ color: cLive ? "var(--pg-faint)" : "var(--pg-warning)" }}
                  >
                    {cLive ? "Sends" : c.substrate}
                  </small>
                </button>
              );
            })}
          </div>
        )}

        {/* ── snippets · pack L864–L874 ─────────────────────────────────── */}
        {snipOpen && snippets.length > 0 && (
          <div className="absolute bottom-[calc(100%+6px)] left-0 z-[9] max-h-[220px] w-[264px] overflow-auto rounded-[var(--pg-r-plate)] border border-[var(--pg-line-strong)] bg-[var(--pg-raised)] shadow-[var(--pg-e4)]">
            {snippets.map((s) => (
              <button
                key={s.k}
                type="button"
                disabled={!onInsertSnippet}
                onClick={() => {
                  onInsertSnippet?.(s);
                  setSnipOpen(false);
                }}
                className="grid w-full gap-[3px] border-0 bg-transparent px-3 py-[9px] text-left text-[var(--pg-ink-2)] disabled:opacity-40"
              >
                <b className="text-[length:var(--pg-t-body)] font-semibold text-[var(--pg-ink)]">{s.k}</b>
                <small className="truncate text-[length:var(--pg-t-label)] text-[var(--pg-faint)]">{s.v}</small>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
