/**
 * Relationships → Calendar — the week field, and the `Calendar settings` slide-over it opens.
 *
 * PORTED from `docs/design-references/cd-packs/super-admin-shell-v3/PAIGE Super Admin Shell
 * v3.dc.html`, transcribed in `PORT-SPEC-palette-and-six-surfaces.md` §2:
 *   §2.1  week-field markup                 L2547-L2581
 *   §2.2  geometry, tokens, page overrides  L11204-L11232
 *   §2.3  `fieldDays` / `fieldRows`         L10988-L10993
 *         `FIELD_HOURS` / `FIELD_PLAN` / `FIELD_KINDS`  `paige-ia.js` L2627-L2647
 *   §2.4  the verbatim strings
 *   §2.5  the `calset` slide-over           L3121-L3138  ·  values L7166-L7185
 *         `P.CALSET`                        `paige-ia.js` L2586-L2595
 *         `SUMMONS.calset`                  `paige-ia.js` L73
 * Route gate in the pack: `s.dest === 'relationships' && viewName === 'Calendar'` (L10952).
 *
 * WHAT THE PACK DRAWS, STATED PLAINLY. A five-column Monday-Friday week ruler headed
 * `This week`, with a 52px hour gutter and six hour rows. It draws NO month grid — the
 * PORT-SPEC records the exhaustive search behind that in its §3 and §9. This file ports the
 * week field, because that is what is in the pack.
 *
 * STRUCTURE IS DESIGN, VALUES ARE DATA (`src/operator/CLAUDE.md`). The grid geometry, the five
 * weekday labels, the six hour labels, the ten event TREATMENTS, both button labels, the button
 * title, the two announcements, all eight settings keys and notes, the `why` paragraph and the
 * connect button all come over exactly as authored. What does NOT: the five column dates
 * (`18 · 19 · 20 · 21 · 22`), the whole `FIELD_PLAN` placement map, every event label and meta,
 * and the six settings VALUES. Those are the PORT-SPEC's own fixture table and are not here.
 * An unread field draws its full ruled grid with every cell empty — which is the pack's own
 * `has:false` path (L10992) — and an unread setting reads `—` with the `missing` treatment the
 * pack already gives rows 7 and 8 (§13).
 *
 * TYPE LADDER. The console runs the owner's four-step ladder (11 / 13 / 16 / 21,
 * `src/index.css`), onto which the pack's own 10-15px steps collapse — a discrepancy already
 * recorded in `index.css`. The mapping used here:
 *   pack 10 · 10.5 · 11        ->  --pg-t-label (11px)
 *   pack 12 · 13               ->  --pg-t-body  (13px)
 *   pack 14                    ->  --pg-t-lead  (16px)
 *
 * ELEVATION (Claude Design ruling, 2026-08-23 — elevation is distance from `--pg-env`).
 * `--pg-surface` sits ABOVE canvas in dark and BELOW it in light, so its ROLE inverts between
 * themes. Applied per element:
 *   · an event BLOCK rises off the ruled field -> `--pg-raised` (appointment, meeting, agent;
 *     `approval` already paints `--pg-raised` in the pack and does not move).
 *   · `Protected` is a HATCH marking time that is NOT available — a well in the schedule, and
 *     the one place the receding token is the right one. It keeps `--pg-surface`.
 *   · `Calendar settings` is a control that rises off the canvas -> `--pg-raised`.
 *   · the grid, its gutter and the rule/dashed/`now` treatments carry no fill at all, and the
 *     `artifact` plate keeps `--pg-artifact` (`index.css` pins artifact and raised to the same
 *     hex in light on purpose; nothing here second-guesses it).
 *   · the settings rows are a hairline-gap list on `--pg-workspace`, the scroll-region token,
 *     which is neither of the two that invert.
 */
import type { CSSProperties } from "react";

const FONT_UI = "var(--pg-font-ui)";
const FONT_DATA = "var(--pg-font-data)";
const FONT_DISPLAY = "var(--pg-font-display)";
const FONT_EDITORIAL = "var(--pg-font-editorial)";

/** The absence mark. A value nobody read is `—`, never a fixture. */
const DASH = "—";

/* ─────────────────────────────────────────────────────────────────────────────────────────
   §2.1 / §2.2 / §2.3 — the week field.
   ───────────────────────────────────────────────────────────────────────────────────────── */

/** L10988 — the five weekday labels. The DATES beside them are fixtures and are not here. */
export const FIELD_DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri"] as const;

/**
 * `P.FIELD_HOURS` — `paige-ia.js` L2627, verbatim. Six rows, and the list skips 12.
 * Rendered `h + ':00'` (L10989).
 */
export const FIELD_HOURS = ["09", "10", "11", "13", "14", "15"] as const;
export type FieldHour = (typeof FIELD_HOURS)[number];

/** `P.FIELD_KINDS` keys — `paige-ia.js` L2636-L2647. */
export type FieldKind =
  | "appointment" | "meeting" | "task" | "focus" | "agent"
  | "approval" | "milestone" | "followup" | "artifact" | "now";

/**
 * `P.FIELD_KINDS` styles — `paige-ia.js` L2637-L2646, transcribed from the pack's CSS text.
 *
 * The ten TREATMENTS are structure: each is a distinct visual class (solid plate, ink-2 left
 * rail, violet left rail, hatched fill, notched authority plate, gold top rule, dashed outline,
 * artifact plate, hairline "now" rule, plain rule). Their `label` and `meta` strings are
 * fixtures and live on the event record instead.
 */
export const FIELD_KIND_STYLES: Readonly<Record<FieldKind, CSSProperties>> = {
  // ELEVATION: pack `--pg-surface`; an event block rises off the field -> `--pg-raised`.
  appointment: { padding: "6px 8px", background: "var(--pg-raised)", borderLeft: "2px solid var(--pg-ink-2)" },
  meeting: { padding: "6px 8px", background: "var(--pg-raised)" },
  task: { padding: "6px 0", borderTop: "1px solid var(--pg-line-strong)" },
  // The one place the receding token is correct: a hatch over time that is NOT available.
  focus: {
    padding: "6px 8px",
    background: "repeating-linear-gradient(135deg,var(--pg-surface) 0 5px,transparent 5px 10px)",
  },
  agent: { padding: "6px 8px", background: "var(--pg-raised)", borderLeft: "2px solid var(--pg-violet)" },
  approval: {
    padding: "6px 8px", background: "var(--pg-raised)",
    border: "1px solid var(--pg-line-authority)",
    clipPath: "polygon(0 0,calc(100% - 8px) 0,100% 8px,100% 100%,8px 100%,0 calc(100% - 8px))",
  },
  milestone: { padding: "6px 0", borderTop: "1px solid var(--pg-gold-deep)" },
  followup: { padding: "6px 8px", border: "1px dashed var(--pg-line-strong)" },
  artifact: { padding: "6px 8px", background: "var(--pg-artifact)", color: "#211e1e" },
  now: { padding: 0, borderTop: "1px solid var(--pg-gold)", opacity: 0.85 },
};

/** One column of the ruler. `date` is `null` until a real calendar read supplies it. */
export type CalendarFieldDay = { readonly day: string; readonly date: string | null };

/**
 * One placed event. `hour` and `column` are the pack's `FIELD_PLAN` coordinates (L2628-L2635);
 * that MAP is a fixture, so placement arrives with the read rather than from this file.
 */
export type CalendarFieldEvent = {
  readonly hour: FieldHour;
  /** 0-4, Monday through Friday. */
  readonly column: number;
  readonly kind: FieldKind;
  readonly label: string;
  readonly meta: string;
};

/**
 * The page-level overrides this view carries in the pack (L11205-L11212), transcribed so the
 * shell applies them rather than re-deriving them. The destination deck, the KPI ladder, the
 * tape and the absence note are ALL suppressed on this view.
 */
export const CALENDAR_FIELD_CHROME = {
  showKpis: false,
  showTape: false,
  showLedger: false,
  hasAbsence: false,
  surfaceDeck: "",
  headerStyle: {
    display: "grid", gridTemplateColumns: "minmax(0,1fr) auto", gap: "24px",
    alignItems: "baseline", paddingBottom: "10px",
  } as CSSProperties,
  mainStyle: {
    position: "relative", gridColumn: 1, gridRow: 2, minWidth: 0, minHeight: 0, overflow: "hidden",
  } as CSSProperties,
  pageStyle: {
    width: "min(100%,1160px)", height: "100%", margin: "0 auto",
    padding: "22px clamp(20px,2.4vw,36px) 0", display: "flex", flexDirection: "column",
    minHeight: 0,
  } as CSSProperties,
} as const;

/** L11221 — the `Needs you today` announcement, verbatim. */
export const OWED_ANNOUNCEMENT =
  "What is owed today. Every item belongs somewhere else — completing it here completes it there.";

/** L11229 — the `Calendar settings` announcement, verbatim. */
export const CALSET_ANNOUNCEMENT =
  "Calendar settings — when you are reachable, and what she may book without asking.";

export type CalendarWeekFieldProps = {
  /** `null` until a read lands — the five weekday labels still draw, with `—` for the date. */
  readonly days?: readonly CalendarFieldDay[] | null;
  /** `null` or empty draws the full ruled grid with every cell on the pack's `has:false` path. */
  readonly events?: readonly CalendarFieldEvent[] | null;
  /** L11228-L11230 — opens the `calset` summon. */
  readonly onOpenCalSet: () => void;
  /**
   * L11219-L11222 — opens the `owed` summon. OPTIONAL, and the button renders only when it is
   * supplied: the `owed` surface is drawn in the pack but not ported, and Claude Design ruled
   * that a control to a place that does not exist is REMOVED rather than left dead
   * (`src/operator/CLAUDE.md`). Passing a handler is what asserts the capability exists.
   */
  readonly onOpenOwed?: () => void;
  /** L11218 — `owedN`, derived from what is actually owed. `—` while nothing has been read. */
  readonly owedCount?: number | null;
  readonly onAnnounce?: (message: string) => void;
};

/** §2.1 — the week field. */
export function CalendarWeekField({
  days, events, onOpenCalSet, onOpenOwed, owedCount, onAnnounce,
}: CalendarWeekFieldProps) {
  const columns: readonly CalendarFieldDay[] =
    days ?? FIELD_DAY_LABELS.map((day) => ({ day, date: null }));

  /** L10990-L10992 — a cell holds at most the event planned into it. */
  function eventAt(hour: FieldHour, column: number): CalendarFieldEvent | undefined {
    return (events ?? []).find((e) => e.hour === hour && e.column === column);
  }

  return (
    <div
      style={{
        flex: 1, minHeight: 0, display: "flex", flexDirection: "column", paddingBottom: "2px",
      }}
    >
      {/* L2549-L2556 — the field's own head row. */}
      <div
        style={{
          flex: "none", display: "flex", flexWrap: "wrap", alignItems: "center",
          gap: "7px 14px", marginBottom: 12,
        }}
      >
        <h2
          className="text-[length:var(--pg-t-body)]"
          style={{ flex: "none", fontWeight: 600, fontFamily: FONT_DISPLAY, letterSpacing: "-.005em" }}
        >
          This week
        </h2>
        <small
          className="truncate text-[length:var(--pg-t-label)]"
          style={{ flex: 1, minWidth: 80, color: "var(--pg-faint)", fontFamily: FONT_DATA }}
        >
          Representative · no calendar connected
        </small>

        {onOpenOwed && (
          <button
            type="button"
            onClick={() => {
              onOpenOwed();
              onAnnounce?.(OWED_ANNOUNCEMENT);
            }}
            className="text-[length:var(--pg-t-label)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            style={{
              display: "inline-flex", alignItems: "center", gap: "7px", flex: "none",
              whiteSpace: "nowrap", minHeight: "28px", padding: "0 11px",
              borderRadius: "var(--pg-r-pill)", border: "1px solid var(--pg-gold-deep)",
              background: "transparent", color: "var(--pg-gold-deep)", fontWeight: 600,
              fontFamily: FONT_UI,
            }}
          >
            <i
              aria-hidden
              style={{
                flex: "none", width: "5px", height: "5px", rotate: "45deg",
                background: "var(--pg-gold)",
              }}
            />
            Needs you today
            <small
              className="text-[length:var(--pg-t-label)]"
              style={{ marginLeft: 1, color: "var(--pg-gold-deep)", fontFamily: FONT_DATA }}
            >
              {owedCount === null || owedCount === undefined ? DASH : String(owedCount)}
            </small>
          </button>
        )}

        <button
          type="button"
          title="Working hours, protected focus, quiet hours"
          onClick={() => {
            onOpenCalSet();
            onAnnounce?.(CALSET_ANNOUNCEMENT);
          }}
          className="text-[length:var(--pg-t-label)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          style={{
            flex: "none", whiteSpace: "nowrap", minHeight: "28px", padding: "0 11px",
            borderRadius: "var(--pg-r-chip)", border: "1px solid var(--pg-line)",
            // ELEVATION: pack `--pg-surface`; a control that rises -> `--pg-raised`.
            background: "var(--pg-raised)", color: "var(--pg-ink-2)", fontWeight: 500,
            fontFamily: FONT_UI,
          }}
        >
          Calendar settings
        </button>
      </div>

      {/* L2557 — `52px repeat(5,minmax(0,1fr))`, scrolling inside itself. */}
      <div
        style={{
          flex: 1, minWidth: 0, minHeight: 0, overflowY: "auto", display: "grid",
          gridTemplateColumns: "52px repeat(5,minmax(0,1fr))",
          borderTop: "1px solid var(--pg-line)",
        }}
      >
        {/* L2558 — the gutter corner. */}
        <div style={{ boxShadow: "inset -1px 0 0 var(--pg-line-soft)" }} />
        {columns.map((d) => (
          <div
            key={d.day}
            style={{ padding: "9px 10px", boxShadow: "inset -1px 0 0 var(--pg-line-soft)" }}
          >
            <b
              className="text-[length:var(--pg-t-label)]"
              style={{
                display: "block", fontWeight: 600, fontFamily: FONT_UI, letterSpacing: ".07em",
                textTransform: "uppercase",
              }}
            >
              {d.day}
            </b>
            <small
              className="text-[length:var(--pg-t-label)]"
              style={{ display: "block", marginTop: 2, color: "var(--pg-faint)", fontFamily: FONT_DATA }}
            >
              {d.date ?? DASH}
            </small>
          </div>
        ))}

        {FIELD_HOURS.map((h) => (
          <FieldHourRow key={h} hour={h} columns={columns} eventAt={eventAt} />
        ))}
      </div>
    </div>
  );
}

/** L2566-L2578 — one hour row: the gutter label, then five cells. */
function FieldHourRow({
  hour, columns, eventAt,
}: {
  hour: FieldHour;
  columns: readonly CalendarFieldDay[];
  eventAt: (hour: FieldHour, column: number) => CalendarFieldEvent | undefined;
}) {
  return (
    <>
      <div
        style={{
          padding: "8px 8px 8px 0", textAlign: "right",
          boxShadow: "inset -1px 0 0 var(--pg-line-soft)",
          borderTop: "1px solid var(--pg-line-soft)",
        }}
      >
        <small
          className="text-[length:var(--pg-t-label)]"
          style={{ color: "var(--pg-faint)", fontFamily: FONT_DATA }}
        >
          {hour + ":00"}
        </small>
      </div>
      {columns.map((d, i) => {
        const ev = eventAt(hour, i);
        return (
          <div
            key={d.day}
            style={{
              minHeight: 54, padding: 5,
              boxShadow: "inset -1px 0 0 var(--pg-line-soft)",
              borderTop: "1px solid var(--pg-line-soft)",
            }}
          >
            {/* L2571-L2576 — the inner `<sc-if>` emits nothing at all for an unplanned cell. */}
            {ev && (
              <div style={FIELD_KIND_STYLES[ev.kind]}>
                <b
                  className="truncate text-[length:var(--pg-t-label)]"
                  style={{ display: "block", fontWeight: 600, fontFamily: FONT_UI }}
                >
                  {ev.label}
                </b>
                <small
                  className="truncate text-[length:var(--pg-t-label)]"
                  style={{ display: "block", marginTop: 2, color: "var(--pg-muted)" }}
                >
                  {ev.meta}
                </small>
              </div>
            )}
          </div>
        );
      })}
    </>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────────────────
   §2.5 — the `Calendar settings` slide-over (`calset`), rules face.
   ───────────────────────────────────────────────────────────────────────────────────────── */

/**
 * `SUMMONS.calset` — `paige-ia.js` L73, verbatim. The slide-over's own header copy.
 *
 * NOTE FOR WHOEVER WIRES IT (a fact, not a judgement): the `calset` summon has FOUR faces in
 * the pack — `cals`, `rules`, `types`, `hosts` (L7007-L7009), behind a tab strip gated on
 * `csTabsOn`. The PORT-SPEC transcribes the `rules` face only (§2.5), and the `rules` face is
 * what this component is. The other three faces are an unported part of the same summon.
 */
export const CALSET_SUMMON = {
  title: "Calendar settings",
  deck:
    "When you are reachable, when you are not, and what she may put on your calendar without " +
    "asking.",
  foot:
    "The connection itself is made in Integrations — no calendar source is wired at operator " +
    "scope, so these are the rules waiting for a calendar to apply them to. Quiet hours already " +
    "bind outbound on every channel, which is why they are stated here and enforced by the " +
    "quiet-hours automation.",
} as const;

/**
 * `P.CALSET` — `paige-ia.js` L2586-L2595. The eight KEYS and their eight NOTES are structure
 * and come over verbatim; the six VALUES the pack carries are fixtures and do not. Rows 7 and 8
 * already read `—` with `state:'missing'` in the pack, and that is exactly the shape every
 * unread row takes here until a calendar source supplies one (§13).
 */
export const CALSET_ROWS: readonly { readonly k: string; readonly note: string }[] = [
  { k: "Working hours", note: "Outside these she schedules nothing without asking" },
  { k: "Protected focus", note: "She holds outbound and books nothing over it" },
  { k: "Quiet hours", note: "Enforced on every channel by the quiet-hours automation" },
  { k: "Meeting length", note: "What she offers when she proposes a time" },
  { k: "Buffer between meetings", note: "She will not book back to back" },
  { k: "She may book without asking", note: "A client-facing booking is an authority gate" },
  { k: "Calendar source", note: "Nothing connected — connect one in Integrations" },
  { k: "Timezone", note: "Read from the connected calendar" },
];

/** L7183 — the `why`, verbatim. */
export const CALSET_WHY =
  "These are rules about when she may act, which is why they sit beside the calendar rather " +
  "than in Settings. Quiet hours already bind outbound on every channel — the calendar is not " +
  "the only thing that reads them.";

/** L7184 — the connect announcement, verbatim. */
export const CALSET_CONNECT_ANNOUNCEMENT = "Calendar connections are made in Integrations.";

export type CalendarSettingsRulesProps = {
  /**
   * Values by row key. A key that is absent or `null` renders `—` and takes the pack's own
   * `missing` treatment — the negative mark and the faint value ink (L7169-L7173).
   */
  readonly values?: Readonly<Record<string, string | null>> | null;
  /** L7184 — closes the summon and lands on Settings → Integrations. */
  readonly onConnect: () => void;
  readonly onAnnounce?: (message: string) => void;
};

/** §2.5 — the rules face. */
export function CalendarSettingsRules({ values, onConnect, onAnnounce }: CalendarSettingsRulesProps) {
  return (
    <div>
      {/* L3122 — the hairline-gap list. */}
      <div style={{ display: "grid", gap: 1, background: "var(--pg-line-soft)" }}>
        {CALSET_ROWS.map((r) => {
          const v = values?.[r.k] ?? null;
          const missing = v === null;
          return (
            <button
              key={r.k}
              type="button"
              onClick={() =>
                onAnnounce?.(
                  missing
                    ? r.k + " comes from the connected calendar. Connect one in Integrations."
                    : "Editing " + r.k.toLowerCase() +
                      ". Every rule here binds her, not just your view.",
                )
              }
              className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              style={{
                display: "flex", flexDirection: "column", minWidth: 0, padding: "10px 12px",
                border: 0, background: "var(--pg-workspace)", textAlign: "left",
              }}
            >
              <span style={{ display: "flex", alignItems: "baseline", gap: 10, minWidth: 0 }}>
                <i
                  aria-hidden
                  style={{
                    flex: "none", width: "4px", height: "4px", rotate: "45deg",
                    background: missing ? "var(--pg-negative)" : "var(--pg-gold-deep)",
                  }}
                />
                <small
                  className="text-[length:var(--pg-t-label)]"
                  style={{
                    flex: "none", color: "var(--pg-faint)", fontFamily: FONT_DATA,
                    letterSpacing: ".05em", textTransform: "uppercase",
                  }}
                >
                  {r.k}
                </small>
                <b
                  className="truncate text-[length:var(--pg-t-body)]"
                  style={{
                    minWidth: 0, color: missing ? "var(--pg-faint)" : "var(--pg-ink)",
                    fontWeight: 500, fontFamily: FONT_UI,
                  }}
                >
                  {v ?? DASH}
                </b>
              </span>
              <small
                className="text-[length:var(--pg-t-label)]"
                style={{
                  marginTop: 4, paddingLeft: 14, color: "var(--pg-faint)", lineHeight: 1.45,
                  textWrap: "pretty",
                }}
              >
                {r.note}
              </small>
            </button>
          );
        })}
      </div>

      {/* L3134 — the `why`. */}
      <p
        className="text-[length:var(--pg-t-lead)]"
        style={{
          maxWidth: "46ch", marginTop: 15, paddingTop: 13,
          borderTop: "1px solid var(--pg-line-soft)", color: "var(--pg-ink)", fontWeight: 400,
          lineHeight: 1.6, fontFamily: FONT_EDITORIAL, textWrap: "pretty",
        }}
      >
        {CALSET_WHY}
      </p>

      {/* L3135-L3137 — the one act on this face, and the only gold on it (§11). */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 7, marginTop: 14 }}>
        <button
          type="button"
          onClick={() => {
            onConnect();
            onAnnounce?.(CALSET_CONNECT_ANNOUNCEMENT);
          }}
          className="text-[length:var(--pg-t-body)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          style={{
            minHeight: "34px", padding: "0 14px", borderRadius: "var(--pg-r-chip)",
            border: "1px solid var(--pg-gold)", background: "var(--pg-gold)", color: "#17120c",
            fontWeight: 600, fontFamily: FONT_UI,
          }}
        >
          Connect a calendar
        </button>
      </div>
    </div>
  );
}

export default CalendarWeekField;
