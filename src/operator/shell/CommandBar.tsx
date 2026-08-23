/**
 * The command bar and its palette — the canvas's 58px top row.
 *
 * PORTED FROM THE PACK. Markup: `PAIGE Super Admin Shell v3.dc.html` L130-L139 (the closed bar)
 * and L141-L158 (the dropdown). Geometry: `commandBarStyle` / `commandTextStyle` /
 * `commandText` / `commandHint` / `orbStyle` / `streakStyle` L10774-L10779, `paletteRowStyle`
 * L10782, `paletteGroups` L10783-L10789. State table `cmd` L10633-L10639. Transcribed in
 * `PORT-SPEC-palette-and-six-surfaces.md` §1.2-§1.7.
 *
 * THE PALETTE IS A DROPDOWN UNDER THE BAR, NOT A CENTRED MODAL (§1.4): the bar is
 * `position:relative;flex:1;min-width:0` (L129) and the list anchors `left:0;right:0;
 * top:calc(100% + 7px)` to it, square-cornered, `--pg-raised` on `--pg-line-strong`.
 *
 * WHY IT PAINTED THROUGH, AND WHERE THE FIX ACTUALLY LIVES. This dropdown was reported as
 * transparent — the sub-tab row and its underline reading straight across "Run a sequence" in
 * both themes. It was not transparency. Measured on the harness render at 1600, the dropdown's
 * computed background was `rgb(33,29,39)` in dark and `rgb(255,253,248)` in light at
 * `opacity: 1` — fully opaque `--pg-raised` — and `elementFromPoint` at a row's centre returned
 * `<nav class="relative z-[12] …">`. The pack's `z-index:8` here (L142) is CLAMPED inside the
 * command row's own `z-index:6` stacking context (L128), so the view row's 12 (L10803) painted
 * over the whole row. Raising this number could never have fixed it; the row had to clear 12,
 * and it now does (`OperatorShell`, z 13). The pack's 8 stays because it is still correct
 * WITHIN the row.
 *
 * TWO STATES, WHICH IS WHAT THE PACK DRAWS (§1.6). Closed and open. There is no text input, no
 * query state, no filter, no no-results node and no selected-row treatment anywhere in
 * L128-L159 — `s.palette` is the only palette state the pack's `Component.state` carries
 * (L4203-L4206). None of that is invented here; keyboard focus falls to the document-wide
 * `:focus-visible` rule (L51).
 *
 * WHICH BAR STATES ARE REACHABLE. `cmd` has five keys; `listening` / `understanding` /
 * `executed` are only ever set by `runVoice` (L4387) and `runCommand` (L4391-L4411), and
 * `runCommand`'s trace, its answer and the `executed` bar text are all on the PORT-SPEC's own
 * fixture table (#1, #2, #4, #5). Neither is ported, so the two states this shell can actually
 * be in — `rest` and `focus` — are the two carried here. A state nobody can reach, carrying a
 * fabricated sentence, is a fixture wearing a state's clothes (§13).
 *
 * MOTION. `pg-drop 140ms cubic-bezier(.22,1,.36,1) both` on open (L142) and the bar's own
 * 200ms colour/background/shadow transition (L10774). Both keyframes already ship in
 * `index.css`, under the pack's `[data-pg]`-scoped `prefers-reduced-motion` guard, and the
 * component ALSO drops the animation under `useReducedMotion` so the shell never depends on a
 * single guard.
 */
import { useEffect, useRef } from "react";
import { useReducedMotion } from "framer-motion";
import { CAPS, autonomyTag, type CapabilityId } from "@/operator/shell/commandPalette";

export type CommandState = "rest" | "focus";

/** `cmd` — L10633-L10639, the two reachable rows. */
const CMD: Record<CommandState, {
  text: string; hint: string; border: string; bg: string; glow: string; ink: string;
}> = {
  rest: {
    text: "Direct PAIGE, or press ⌘K", hint: "⌘K",
    border: "var(--pg-line)", bg: "transparent", glow: "none", ink: "var(--pg-faint)",
  },
  focus: {
    text: "What should she do?", hint: "▏",
    border: "var(--pg-line-strong)", bg: "var(--pg-surface)", glow: "var(--pg-e1)", ink: "var(--pg-ink)",
  },
};

export type CommandBarProps = {
  readonly open: boolean;
  readonly onToggle: () => void;
  readonly command: CommandState;
  readonly mark: "dormant" | "charged";
  /**
   * L10776-L10777 — the Reading scope (`s.scope === 1`, `P.SCOPES` `paige-ia.js` L2621-L2625)
   * replaces the resting text and hint. The console renders `PLATFORM_SCOPE` today, so this is
   * false; it is a prop rather than a constant because the value belongs to the scope, not
   * to the bar.
   */
  readonly readOnly?: boolean;
  readonly onSummon: (id: CapabilityId) => void;
};

export default function CommandBar({
  open, onToggle, command, mark, readOnly = false, onSummon,
}: CommandBarProps) {
  const reduce = useReducedMotion();
  const cmd = CMD[command];
  const wrap = useRef<HTMLDivElement>(null);

  // The pack closes the palette on Escape as part of one global handler (L4359). It is scoped
  // to the open palette here so a closed palette never swallows Escape from anything else.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onToggle();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onToggle]);

  return (
    // L129 — the bar is the dropdown's positioning context, so the list can span its full width.
    <div ref={wrap} className="relative min-w-0 flex-1">
      <button
        type="button"
        data-cmdbar="1"
        onClick={onToggle}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="w-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        style={{
          display: "flex", alignItems: "center", gap: "12px", minHeight: "40px",
          padding: "0 16px 0 15px", borderRadius: "var(--pg-r-pill)",
          border: "1px solid " + cmd.border, background: cmd.bg, boxShadow: cmd.glow,
          cursor: "text",
          transition: reduce
            ? undefined
            : "border-color 200ms ease, background 200ms ease, box-shadow 200ms ease",
        }}
      >
        {/* L131-L137 — the Command Mark, inline at 22px, with the streak group above the slash. */}
        <span
          data-cm={mark}
          style={{ flex: "none", display: "inline-grid", placeItems: "center", width: 22, height: 22 }}
        >
          <svg viewBox="0 0 48 48" style={{ width: 22, height: 22, minWidth: 0, overflow: "visible" }} aria-hidden>
            <g style={{ opacity: 0 }}>
              <polygon
                points="21.5,15.5 29.5,15.5 21.7,32.5 13.7,32.5"
                fill="var(--pg-gold)" stroke="var(--pg-gold)" strokeWidth="2.4"
                strokeLinejoin="round" opacity=".5"
              />
            </g>
            <polygon
              points="21,13.6 30.5,13.6 21,34.4 11.5,34.4"
              fill="var(--cm-slash)" stroke="var(--cm-slash)" strokeWidth="3.2" strokeLinejoin="round"
            />
            <circle
              cx="34.5" cy="30.5" r="5.5" fill="var(--cm-orb)"
              style={{
                transition: reduce ? undefined : "fill 180ms cubic-bezier(.22,1,.36,1)",
                filter: mark === "charged" ? "drop-shadow(0 0 4px rgba(240,200,106,.5))" : "none",
              }}
            />
          </svg>
        </span>
        <span
          style={{
            flex: 1, minWidth: 0, color: cmd.ink, fontSize: "13px",
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", textAlign: "left",
          }}
        >
          {readOnly && command === "rest" ? "Enter a tenant scope to act" : cmd.text}
        </span>
        <span style={{ flex: "none", color: "var(--pg-faint)", font: "10px var(--pg-font-data)" }}>
          {readOnly && command === "rest" ? "read-only" : cmd.hint}
        </span>
      </button>

      {open && (
        <div
          role="listbox"
          aria-label="What PAIGE can do"
          style={{
            position: "absolute", zIndex: 8, left: 0, right: 0, top: "calc(100% + 7px)",
            maxHeight: "min(60vh,470px)", overflow: "auto",
            background: "var(--pg-raised)", border: "1px solid var(--pg-line-strong)",
            // `--pg-lift-3` rather than the pack's `--pg-e4` (L143): CD named `--pg-lift-3` for
            // menus (2026-08-23), and `--pg-rim` leads it because a raised plate separates by
            // its seated rim plus a lift, not by fill — `#fffdf8` on `#fbf9f5` is three units.
            // Both tokens ship at the pack's own values (L21-L24 dark, L28-L31 light); this is
            // where they are spent, not what they are. The pack pairs them exactly this way at
            // L9420 and L9477 (`var(--pg-rim), var(--pg-lift-N)`).
            boxShadow: "var(--pg-rim), var(--pg-lift-3)",
            animation: reduce ? "none" : "pg-drop 140ms cubic-bezier(.22,1,.36,1) both",
          }}
        >
          {CAPS.map((grp) => (
            <div key={grp.group}>
              <p
                style={{
                  padding: "12px 14px 5px", color: "var(--pg-faint)",
                  font: "500 11px var(--pg-font-ui)", letterSpacing: ".005em",
                }}
              >
                {grp.group}
              </p>
              {grp.items.map((it) => {
                const tag = autonomyTag(it);
                return (
                  <button
                    key={it.id}
                    type="button"
                    onClick={() => onSummon(it.id)}
                    className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    style={{
                      width: "100%", minHeight: "52px", padding: "0 14px", display: "flex",
                      alignItems: "center", gap: "12px", border: 0,
                      borderTop: "1px solid var(--pg-line-soft)", background: "transparent",
                      color: "var(--pg-ink)", textAlign: "left",
                    }}
                  >
                    <svg
                      viewBox="0 0 16 16" aria-hidden
                      style={{ flex: "none", width: 15, height: 15, color: "var(--pg-gold-deep)" }}
                    >
                      <path
                        d={it.path} fill="none" stroke="currentColor" strokeWidth="1.3"
                        strokeLinecap="square" strokeLinejoin="round"
                      />
                    </svg>
                    <span style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
                      <b
                        style={{
                          font: "500 12.5px var(--pg-font-ui)", overflow: "hidden",
                          textOverflow: "ellipsis", whiteSpace: "nowrap",
                        }}
                      >
                        {it.label}
                      </b>
                      <small
                        style={{
                          marginTop: 2, color: "var(--pg-faint)", fontSize: "11px",
                          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                        }}
                      >
                        {it.note}
                      </small>
                    </span>
                    <span
                      style={{
                        flex: "none", color: tag.tone, font: "600 9.5px var(--pg-font-ui)",
                        letterSpacing: ".07em", textTransform: "uppercase",
                      }}
                    >
                      {tag.label}
                    </span>
                  </button>
                );
              })}
            </div>
          ))}
          {/* L156, verbatim. */}
          <p
            style={{
              padding: "12px 14px 14px", borderTop: "1px solid var(--pg-line-soft)",
              color: "var(--pg-faint)", fontSize: "11px", lineHeight: 1.5,
            }}
          >
            A capability opens its own surface and retires when you close it. None holds a place
            in the rail. Scope and autonomy live in Settings → Capabilities, or inline in the
            conversation.
          </p>
        </div>
      )}
    </div>
  );
}
