/**
 * The summoned surface — what a palette row opens.
 *
 * PORTED FROM THE PACK. Shell markup `PAIGE Super Admin Shell v3.dc.html` L2587-L2628, the row
 * ledger and foot L3789-L3803. Geometry `wsModes` / `summonStyle` (four modes) /
 * `summonHeadStyle` / `canvasStyle` L11005-L11064, workspace-geometry glyphs `G_WS`
 * L4196-L4201, `openSummon` / `closeSummon` / `setWsMode` / `detachSummon` L4414-L4436.
 * Transcribed in `PORT-SPEC-palette-and-six-surfaces.md` §1.8-§1.9.
 *
 * `openSummon` closes the palette and forces `wsMode:'split'` (L4414), so a capability always
 * arrives beside the surface you were on and never over it.
 *
 * WHAT IS NOT HERE, AND WHY — stated rather than left to be found (§58).
 * · **The PIN control** (L2609-L2614). `pinSummon` (L4430) writes `s.pins`, which renders as a
 *   pinned row in the rail (L10768/L10772). The rail's pin region is not ported, so a pin button
 *   would file a surface into a place that does not exist — a control asserting a capability that
 *   is not there, which is the exact thing CD ruled gets REMOVED rather than left dead
 *   (`src/operator/CLAUDE.md`). It returns with the rail's pin region, not before.
 * · **`&sid=`** on the detach URL (L4421). The sid is this session's BroadcastChannel token
 *   (L4315-L4328) and cross-window scope sync is not ported; carrying the parameter would assert
 *   a sync that does not run.
 */
import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "framer-motion";
import { SUMMONS, type CapabilityId } from "@/operator/shell/commandPalette";

export type WsMode = "split" | "slideover" | "popout" | "detached";
export const WS_ORDER: readonly WsMode[] = ["split", "slideover", "popout", "detached"];

/** `G_WS` — L4196-L4201. `[fill, frame, accent]` per mode. */
const G_WS: Record<WsMode, readonly [string, string, string]> = {
  split: ["M8.6 4.1h4.8v7.8H8.6z", "M2.6 3.5h10.8v9H2.6z M8.6 3.5v9", ""],
  slideover: ["M10 4.1h3.4v7.8H10z", "M2.6 3.5h10.8v9H2.6z M10 3.5v9", "M7.5 6.4L5.6 8l1.9 1.6"],
  popout: ["M6.2 3.2h7.2v7.2H6.2z", "M6.2 3.2h7.2v7.2H6.2z M10.2 6.6v6.2H2.6V6.6z", ""],
  detached: ["", "M11.1 9.5v3.9H2.6V4.9h3.9 M9.5 2.6h3.9v3.9", "M13.4 2.6L8.1 7.9"],
};

const WS_LABEL: Record<WsMode, string> = {
  split: "Split", slideover: "Slide-over", popout: "Pop-out", detached: "Detach",
};

const CHIP =
  "relative grid h-[30px] w-[30px] place-items-center rounded-[var(--pg-r-chip)] " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

function shellStyle(mode: WsMode, canvasW: number, reduce: boolean): React.CSSProperties {
  const narrow = canvasW < 700;
  switch (mode) {
    case "split":
      return {
        position: "relative", gridColumn: 2, gridRow: 2, minWidth: 0, minHeight: 0,
        display: "flex", flexDirection: "column", background: "var(--pg-workspace)",
        borderLeft: "1px solid var(--pg-line-strong)", boxShadow: "var(--pg-e4)", overflow: "hidden",
        animation: reduce ? "none" : "pg-materialize 340ms cubic-bezier(.22,1,.36,1) both",
      };
    case "slideover":
      return {
        position: "absolute", zIndex: 8, right: 0, bottom: 0,
        width: narrow ? "100%" : "clamp(320px,44%,400px)",
        left: narrow ? 0 : "auto",
        top: narrow ? "auto" : "58px",
        height: narrow ? "64%" : "auto",
        borderTop: narrow ? "1px solid var(--pg-line-strong)" : 0,
        display: "flex", flexDirection: "column", background: "var(--pg-workspace)",
        borderLeft: "1px solid var(--pg-line-strong)",
        boxShadow: "-28px 0 70px rgba(0,0,0,.34)", overflow: "hidden",
        animation: reduce ? "none" : "pg-materialize 240ms cubic-bezier(.22,1,.36,1) both",
      };
    case "popout":
      return {
        position: "absolute", zIndex: 8, left: "14%", top: "16%",
        width: "clamp(340px,56%,640px)", maxWidth: "calc(100% - 32px)",
        height: "clamp(300px,62%,560px)",
        display: "flex", flexDirection: "column", background: "var(--pg-workspace)",
        border: "1px solid var(--pg-line-authority)", borderRadius: "3px",
        boxShadow: "0 28px 90px rgba(0,0,0,.55), 0 0 0 1px var(--pg-gold-bloom)", overflow: "hidden",
        animation: reduce ? "none" : "pg-drop 200ms cubic-bezier(.22,1,.36,1) both",
      };
    case "detached":
      return {
        position: "absolute", zIndex: 8, left: "10%", top: "12%",
        width: "clamp(360px,60%,680px)", maxWidth: "calc(100% - 32px)",
        height: "clamp(320px,68%,620px)",
        display: "flex", flexDirection: "column", background: "var(--pg-workspace)",
        border: "1px solid var(--pg-violet)", borderRadius: "3px",
        boxShadow: "0 28px 90px rgba(0,0,0,.55), 0 0 0 1px rgba(155,141,224,.25)", overflow: "hidden",
        animation: reduce ? "none" : "pg-drop 200ms cubic-bezier(.22,1,.36,1) both",
      };
  }
}

export type SummonedSurfaceProps = {
  readonly id: CapabilityId;
  readonly mode: WsMode;
  readonly onMode: (m: WsMode) => void;
  readonly onDetach: () => void;
  readonly onClose: () => void;
  readonly detachBlocked: boolean;
  /** The canvas's own width — the pack's `s.canvasW` (L11005, L11056, L11061). */
  readonly canvasW: number;
};

export default function SummonedSurface({
  id, mode, onMode, onDetach, onClose, detachBlocked, canvasW,
}: SummonedSurfaceProps) {
  const reduce = useReducedMotion();
  const sm = SUMMONS[id];
  const narrowHead = canvasW < 520;

  // L11005 — under 520 the four geometry chips collapse to one that cycles to the next.
  const nextMode = WS_ORDER[(WS_ORDER.indexOf(mode) + 1) % WS_ORDER.length];
  const modes: readonly { key: string; mode: WsMode; label: string }[] = narrowHead
    ? [{ key: "cycle", mode: nextMode, label: "Next geometry — " + WS_LABEL[nextMode] }]
    : WS_ORDER.map((m) => ({ key: m, mode: m, label: WS_LABEL[m] }));

  return (
    <section aria-label="Summoned surface" style={shellStyle(mode, canvasW, !!reduce)}>
      {/* L2589 — the gold→violet hairline along the top edge. */}
      <i
        aria-hidden
        style={{
          position: "absolute", left: 0, right: 0, top: 0, height: 1,
          background:
            "linear-gradient(90deg,transparent,var(--pg-gold-core),var(--pg-violet),transparent)",
        }}
      />
      <header
        style={{
          flex: "none", minWidth: 0, minHeight: "60px", padding: "12px 14px",
          display: "grid", gap: narrowHead ? "9px" : "12px",
          gridTemplateColumns: narrowHead ? "minmax(0,1fr)" : "minmax(0,1fr) minmax(0,auto)",
          alignItems: "center", borderBottom: "1px solid var(--pg-line)",
        }}
      >
        <div style={{ minWidth: 0 }}>
          <p
            style={{
              color: "var(--pg-gold-deep)", font: "500 11px var(--pg-font-ui)",
              letterSpacing: ".005em", overflow: "hidden", textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {/* L11046-L11050 — every capability summon falls to this kicker. */}
            Capability · summoned
          </p>
          <h2
            style={{
              marginTop: 5, font: "600 13px var(--pg-font-display)", letterSpacing: "-.005em",
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            }}
          >
            {sm.title}
          </h2>
        </div>
        <div
          role="group"
          aria-label="Workspace geometry"
          style={{ minWidth: 0, display: "flex", flexWrap: "wrap", justifyContent: "flex-end", gap: "6px" }}
        >
          {modes.map((m) => {
            const on = !narrowHead && mode === m.mode;
            const [fill, frame, accent] = G_WS[m.mode];
            return (
              <button
                key={m.key}
                type="button"
                title={m.label}
                aria-label={m.label}
                aria-pressed={narrowHead ? undefined : mode === m.mode}
                onClick={() => (m.mode === "detached" ? onDetach() : onMode(m.mode))}
                className={CHIP}
                style={{
                  border: "1px solid " + (on ? "var(--pg-gold-deep)" : "var(--pg-line)"),
                  background: on ? "var(--pg-gold-bloom)" : "var(--pg-raised)",
                  boxShadow: on
                    ? "var(--pg-lift-2), inset 0 -2px 0 var(--pg-gold-deep)"
                    : "var(--pg-lift-1)",
                  color: on ? "var(--pg-gold)" : "var(--pg-muted)",
                  transition: reduce
                    ? undefined
                    : "color .16s ease, border-color .16s ease, box-shadow .16s ease, transform .16s ease",
                }}
              >
                <svg viewBox="0 0 16 16" style={{ width: 14, height: 14 }} aria-hidden>
                  <path d={fill} fill="currentColor" opacity=".14" />
                  <path d={frame} fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinejoin="round" strokeLinecap="round" />
                  <path d={accent} fill="none" stroke="currentColor" strokeWidth="1.45" strokeLinejoin="round" strokeLinecap="round" />
                </svg>
              </button>
            );
          })}
          {/* L2615-L2620 — Retire. */}
          <button
            type="button"
            title="Retire"
            aria-label="Retire this surface"
            onClick={onClose}
            className={CHIP}
            style={{
              border: "1px solid var(--pg-line)", background: "var(--pg-raised)",
              boxShadow: "var(--pg-lift-1)", color: "var(--pg-muted)",
              transition: reduce
                ? undefined
                : "color .16s ease, border-color .16s ease, box-shadow .16s ease, transform .16s ease",
            }}
          >
            <svg viewBox="0 0 16 16" style={{ width: 14, height: 14 }} aria-hidden>
              <path d="M4.5 4.5l7 7 M11.5 4.5l-7 7" fill="none" stroke="currentColor" strokeWidth="1.45" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      </header>

      <div style={{ flex: 1, minHeight: 0, overflow: "auto", padding: "18px 16px 20px" }}>
        {mode === "detached" && (
          <div
            style={{
              marginBottom: 16, padding: "13px 15px", background: "var(--pg-raised)",
              borderLeft: "1px solid var(--pg-violet)",
            }}
          >
            <b style={{ display: "block", font: "600 12px var(--pg-font-ui)" }}>
              Running in its own window
            </b>
            <p
              style={{
                maxWidth: "56ch", marginTop: 7, color: "var(--pg-muted)",
                fontSize: "11.5px", lineHeight: 1.55,
              }}
            >
              The surface keeps this session&apos;s scope over a{" "}
              <code style={{ font: "11px var(--pg-font-data)", color: "var(--pg-gold)" }}>
                BroadcastChannel
              </code>{" "}
              and repaints the same tenant band. Switching scope in any window repaints them all.
              Client half only — the session token, cross-window gate locking and the freshness
              heartbeat are server-side and land with Stage 4.
            </p>
            {detachBlocked && (
              <p
                style={{
                  marginTop: 9, paddingTop: 9, borderTop: "1px solid var(--pg-line)",
                  color: "var(--pg-warning)", fontSize: "11.5px", lineHeight: 1.55,
                }}
              >
                This host blocked the new window, so the detached geometry is shown in place. On a
                real desktop this opens as its own OS window.
              </p>
            )}
          </div>
        )}

        <p
          style={{
            maxWidth: "60ch", color: "var(--pg-muted)", fontSize: "12.5px",
            lineHeight: 1.6, textWrap: "pretty",
          }}
        >
          {sm.deck}
        </p>

        {/* L3789-L3799 — the per-capability ledger. */}
        <div style={{ marginTop: 18, borderTop: "1px solid var(--pg-line)" }}>
          {sm.rows.map((sr) => (
            <div
              key={sr.name}
              style={{
                display: "grid", gridTemplateColumns: "minmax(0,1fr) auto", gap: "12px",
                alignItems: "center", minHeight: "54px", padding: "0 2px",
                borderBottom: "1px solid var(--pg-line-soft)",
              }}
            >
              <span style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
                <b
                  style={{
                    font: "500 12.5px var(--pg-font-ui)", overflow: "hidden",
                    textOverflow: "ellipsis", whiteSpace: "nowrap",
                  }}
                >
                  {sr.name}
                </b>
                {/* Absent where the pack's own value is on the PORT-SPEC fixture table — the
                    element is not rendered rather than rendered empty (§13). */}
                {sr.detail && (
                  <small
                    style={{
                      marginTop: 3, color: "var(--pg-faint)", fontSize: "11px",
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                    }}
                  >
                    {sr.detail}
                  </small>
                )}
              </span>
              <span
                style={{
                  color: sr.tone, font: "600 9.5px var(--pg-font-ui)", letterSpacing: ".07em",
                  textTransform: "uppercase", whiteSpace: "nowrap",
                }}
              >
                {sr.status}
              </span>
            </div>
          ))}
        </div>

        <p style={{ marginTop: 14, color: "var(--pg-faint)", fontSize: "11px", lineHeight: 1.55 }}>
          {sm.foot}
        </p>
      </div>
    </section>
  );
}

/**
 * The canvas's measured width, which the pack carries as `s.canvasW` and reads at 520 and 700.
 * `ResizeObserver` is guarded: jsdom does not implement it, and a shell that throws in a test
 * environment is a worse defect than an unmeasured breakpoint.
 */
export function useCanvasWidth<T extends HTMLElement>(): [React.RefObject<T>, number] {
  const ref = useRef<T>(null);
  const [w, setW] = useState(900);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    setW(el.getBoundingClientRect().width || 900);
    if (typeof ResizeObserver !== "function") return;
    const ro = new ResizeObserver((entries) => {
      for (const e of entries) setW(e.contentRect.width || 900);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}
