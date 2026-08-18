import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * Calendar — Claude Design's `isCalMonth` (Super Admin Shell.dc.html, L844–900) and
 * `isWeekGrid` (L1092–1126) blocks.
 *
 *   • `CalendarMonth` — the month grid: the layer chips, the seven-column day grid with its
 *     per-day event chips and collision dot, and CD's 238px day rail.
 *   • `CalendarWeek`  — the weekly-hours editor: the timezone line, the hour ruler, and one
 *     row per weekday with its on/off switch and its availability bands.
 *
 * §13 — A CALENDAR IS THE WORST SURFACE ON THE CONSOLE TO FABRICATE. CD's pack ships a full
 * September with quarterly reviews, a SOC 2 checkpoint, a release freeze and a "collision on
 * the 9th". Rendering any of that would tell the operator that appointments exist, that a
 * maintenance window is booked, that a decision is waiting on Tuesday. So the two halves are
 * split by what is actually knowable:
 *   – DATES are computed. Which day of the week the 1st falls on, how many days the month has,
 *     which cells are outside it: all derived from `anchorDate` (a prop, defaulting to today).
 *     That is arithmetic, not a claim.
 *   – EVENTS are only ever props. No events → the grid still renders (the dates are true) and
 *     says IN WORDS that no calendar source is connected. It never draws a plausible chip.
 *   Collisions are likewise derived (two events landing on one day), never asserted.
 *
 * §11 GOLD BUDGET — CD paints its availability bands in a gold gradient and its per-event CTA
 * in gold ink. Neither is an act: a band is data and the CTA is navigation. Both are indigo
 * here. Nothing on either calendar surface spends gold, because neither carries a primary act
 * — the acts (add an event, edit a band) belong to the caller's own controls.
 *
 * §5 — the "+" on a weekday row and the per-event CTA render DISABLED with a title when the
 * caller passed no handler, rather than looking live and doing nothing.
 *
 * NOT PORTED IN THIS PASS, deliberately:
 *   • CD's band DRAGGING ("Drag a band to change it"). Direct manipulation of a schedule needs
 *     a real write seam, keyboard parity and an undo story; a `cursor:grab` that cannot grab is
 *     worse than no affordance. Bands are read-only here and `onEditBand` opens the caller's
 *     own editor.
 *   • CD's fixed 35-cell / 28-cell grid, which silently assumes the month starts on a Tuesday.
 *     Ours computes 28/35/42 cells from the real first weekday, so the grid is correct for any
 *     month rather than correct for the one in the mock.
 *   • CD's 112px hour-ruler offset, which does not line up with its own row geometry
 *     (26px switch + 10 + 28px day + 10 = 74px). Ours uses 74px so the ruler sits over the
 *     track it labels.
 */

/* ────────────────────────────────────────────────────────────────────────────
   shared
   ──────────────────────────────────────────────────────────────────────────── */

/** CD's layer colours are per-layer data, so they arrive as a stable server-assigned hue. */
export type CalendarLayer = {
  id: string;
  label: string;
  /** 0–360. null → the layer reads neutral rather than borrowing another layer's colour. */
  hue: number | null;
};

function layerTone(hue: number | null | undefined): string {
  return hue == null ? "hsl(var(--muted-foreground))" : `hsl(${hue} 52% 48%)`;
}

function StatePlate({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-[12px] border border-dashed border-border bg-card px-4 py-6 text-center">
      <div className="text-[12.5px] font-semibold">{title}</div>
      <div className="mx-auto mt-1.5 max-w-lg text-[11.5px] leading-[1.55] text-muted-foreground">
        {body}
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
   CalendarMonth — CD `isCalMonth`, L844–900
   ──────────────────────────────────────────────────────────────────────────── */

export type CalendarEvent = {
  id: string;
  /** ISO calendar date, `YYYY-MM-DD`. Parsed as a plain date so no timezone shifts the day. */
  date: string;
  label: string;
  /** Which layer it belongs to. Unmatched or null → the event reads neutral. */
  layerId?: string | null;
  /** Human time ("9:00am", "all day"). null → "—". */
  time?: string | null;
  /** Who it is with. null → omitted. */
  who?: string | null;
  /** CD's per-event action label. Without `onOpen` it renders disabled. */
  cta?: string | null;
  onOpen?: () => void;
};

export type CalendarMonthProps = {
  /**
   * The month to draw, as `YYYY-MM-DD`. Defaults to today. Only the year and month select the
   * grid; the day is pre-selected when it falls inside the month.
   */
  anchorDate?: string;
  /** Events for this month. Empty → the grid draws dates only and says so. */
  events?: readonly CalendarEvent[];
  layers?: readonly CalendarLayer[];
  /**
   * True only when a calendar source is genuinely attached. Left false, an empty month is
   * reported as "not connected" rather than as "nothing scheduled" — those are different facts.
   */
  sourceConnected?: boolean;
  /** CD's compact grid (42px cells, one chip a day) for short viewports. */
  compact?: boolean;
  loading?: boolean;
  error?: string | null;
};

const DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

/** Parses `YYYY-MM-DD` as a plain calendar date. Anything else is refused, not guessed. */
function parseIsoDate(s: string): { y: number; m: number; d: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]) - 1;
  const d = Number(m[3]);
  if (mo < 0 || mo > 11 || d < 1 || d > 31) return null;
  return { y, m: mo, d };
}

function isoOf(y: number, m: number, d: number): string {
  return `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function todayIso(): string {
  const n = new Date();
  return isoOf(n.getFullYear(), n.getMonth(), n.getDate());
}

const MONTH_FMT = new Intl.DateTimeFormat(undefined, {
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});
const DAY_FMT = new Intl.DateTimeFormat(undefined, {
  weekday: "long",
  day: "numeric",
  month: "long",
  timeZone: "UTC",
});

export function CalendarMonth({
  anchorDate,
  events = [],
  layers = [],
  sourceConnected = false,
  compact = false,
  loading = false,
  error = null,
}: CalendarMonthProps) {
  const anchor = useMemo(
    () => parseIsoDate(anchorDate ?? todayIso()) ?? parseIsoDate(todayIso()),
    [anchorDate],
  );

  /** Layers the operator has switched off. Local view state — it hides, it never deletes. */
  const [hidden, setHidden] = useState<readonly string[]>([]);
  const [selected, setSelected] = useState<string | null>(null);

  const visible = useMemo(
    () => events.filter((e) => !(e.layerId && hidden.includes(e.layerId))),
    [events, hidden],
  );

  const byDate = useMemo(() => {
    const m = new Map<string, CalendarEvent[]>();
    for (const e of visible) {
      const bucket = m.get(e.date);
      if (bucket) bucket.push(e);
      else m.set(e.date, [e]);
    }
    return m;
  }, [visible]);

  const hueOf = useMemo(() => {
    const m = new Map<string, number | null>();
    for (const l of layers) m.set(l.id, l.hue);
    return m;
  }, [layers]);

  const grid = useMemo(() => {
    if (!anchor) return null;
    const { y, m } = anchor;
    // getUTCDay: 0 = Sunday. CD's week starts Monday, so shift.
    const firstDow = (new Date(Date.UTC(y, m, 1)).getUTCDay() + 6) % 7;
    const daysInMonth = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
    const rows = Math.ceil((firstDow + daysInMonth) / 7);
    const cells: { key: string; iso: string | null; day: number | null }[] = [];
    for (let i = 0; i < rows * 7; i += 1) {
      const day = i - firstDow + 1;
      const inMonth = day >= 1 && day <= daysInMonth;
      cells.push({
        key: `c${i}`,
        iso: inMonth ? isoOf(y, m, day) : null,
        day: inMonth ? day : null,
      });
    }
    return { cells, daysInMonth, label: MONTH_FMT.format(new Date(Date.UTC(y, m, 1))) };
  }, [anchor]);

  /** Pre-select the anchor's own day when it is inside the month it draws. */
  const anchorIso = anchor ? isoOf(anchor.y, anchor.m, anchor.d) : null;
  const activeIso = selected ?? anchorIso;
  const dayEvents = activeIso ? (byDate.get(activeIso) ?? []) : [];
  const maxChips = compact ? 1 : 2;

  if (!anchor || !grid) {
    return (
      <StatePlate
        title="That date could not be read."
        body="The month grid is drawn from an ISO calendar date (YYYY-MM-DD). None was supplied in a form this surface can parse, so no month is drawn rather than a guessed one."
      />
    );
  }

  return (
    <div className="flex min-w-0 flex-col gap-2.5">
      <div className="min-w-0 flex-none">
        <div className="text-[14.5px] font-semibold tracking-[-0.01em]">{grid.label}</div>
        <div className="mt-[3px] text-[11.5px] text-muted-foreground">
          {loading
            ? "Reading the calendar…"
            : error
              ? "The calendar could not be read."
              : events.length
                ? "Click a day for what is on it."
                : sourceConnected
                  ? "Nothing is scheduled in this month."
                  : "Dates only — no calendar source is connected."}
        </div>
      </div>

      {/* ── layer chips ──────────────────────────────────────────────────── */}
      {layers.length > 0 && (
        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          {layers.map((l) => {
            const on = !hidden.includes(l.id);
            return (
              <button
                key={l.id}
                type="button"
                aria-pressed={on}
                onClick={() =>
                  setHidden((h) => (h.includes(l.id) ? h.filter((x) => x !== l.id) : [...h, l.id]))
                }
                className={cn(
                  "flex flex-none items-center gap-1.5 whitespace-nowrap rounded-[20px] border px-[9px] py-1 text-[10.5px] transition-colors",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  on
                    ? "border-border-strong bg-muted text-foreground"
                    : "border-border bg-card text-muted-foreground hover:text-foreground",
                )}
              >
                <span
                  aria-hidden
                  className="h-1.5 w-1.5 flex-none rounded-full"
                  style={{ backgroundColor: on ? layerTone(l.hue) : "hsl(var(--muted-foreground))" }}
                />
                {l.label}
              </button>
            );
          })}
        </div>
      )}

      {error ? (
        <StatePlate title="The calendar could not be read." body={error} />
      ) : (
        <div className="flex min-w-0 gap-3">
          {/* ── the grid ───────────────────────────────────────────────── */}
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <div className="grid grid-cols-7 gap-1">
              {DOW.map((d) => (
                <div
                  key={d}
                  className="text-center text-[9px] font-semibold tracking-[0.11em] text-muted-foreground"
                >
                  {d}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {grid.cells.map((c) => {
                if (!c.iso || c.day == null) {
                  return (
                    <div
                      key={c.key}
                      aria-hidden
                      className={cn(
                        "min-w-0 overflow-hidden rounded-[9px] border border-border/60 bg-muted/40 px-[5px] py-1",
                        compact ? "min-h-[42px]" : "min-h-[62px]",
                      )}
                    />
                  );
                }
                const evs = byDate.get(c.iso) ?? [];
                const shown = evs.slice(0, maxChips);
                const more = evs.length - shown.length;
                const isActive = c.iso === activeIso;
                return (
                  <button
                    key={c.key}
                    type="button"
                    aria-pressed={isActive}
                    aria-label={`${DAY_FMT.format(new Date(`${c.iso}T00:00:00Z`))} — ${
                      evs.length === 0
                        ? "nothing recorded"
                        : `${evs.length} ${evs.length === 1 ? "entry" : "entries"}`
                    }`}
                    onClick={() => setSelected(c.iso)}
                    className={cn(
                      "min-w-0 overflow-hidden rounded-[9px] border px-[5px] py-1 text-left transition-colors",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                      compact ? "min-h-[42px]" : "min-h-[62px]",
                      isActive
                        ? "border-border-strong bg-muted"
                        : "border-border bg-card hover:border-border-strong",
                    )}
                  >
                    <span className="flex min-w-0 items-center gap-1">
                      <span className="text-[10.5px] font-semibold tabular-nums">{c.day}</span>
                      {evs.length > 1 && (
                        <span
                          aria-hidden
                          title="More than one thing lands here"
                          className="ml-auto h-1.5 w-1.5 flex-none rounded-full bg-[hsl(var(--warning))]"
                        />
                      )}
                    </span>
                    {shown.map((e) => {
                      const tone = layerTone(e.layerId ? hueOf.get(e.layerId) : null);
                      return (
                        <span
                          key={e.id}
                          className="mt-[3px] block truncate whitespace-nowrap rounded-[4px] border-l-2 px-[5px] py-[2px] text-[9px] text-foreground"
                          style={{ borderLeftColor: tone, backgroundColor: "hsl(var(--muted))" }}
                        >
                          {e.label}
                        </span>
                      );
                    })}
                    {more > 0 && (
                      <span className="mt-[2px] block text-[8.5px] text-muted-foreground">
                        +{more} more
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* ── day rail ───────────────────────────────────────────────── */}
          <aside className="hidden w-[238px] flex-none self-start rounded-[12px] border border-border bg-card px-[13px] py-[11px] xl:block">
            <div className="text-[12.5px] font-semibold">
              {activeIso ? DAY_FMT.format(new Date(`${activeIso}T00:00:00Z`)) : "Pick a day"}
            </div>
            {dayEvents.length > 1 && (
              <div className="mt-1 text-[10.5px] leading-[1.45] text-[hsl(var(--gold-dark))]">
                More than one thing lands on this day.
              </div>
            )}
            {dayEvents.length === 0 ? (
              <div className="mt-2 text-[10.5px] leading-[1.45] text-muted-foreground">
                {events.length === 0 && !sourceConnected
                  ? "No calendar source is connected, so nothing can be listed for this day. Dates above are computed; entries would come from the feed."
                  : "Nothing recorded on this day."}
              </div>
            ) : (
              <ul className="mt-2 flex list-none flex-col p-0">
                {dayEvents.map((e) => {
                  const tone = layerTone(e.layerId ? hueOf.get(e.layerId) : null);
                  return (
                    <li
                      key={e.id}
                      className="flex min-w-0 items-start gap-[9px] border-t border-border py-2"
                    >
                      <span
                        aria-hidden
                        className="w-[3px] flex-none self-stretch rounded-[2px]"
                        style={{ backgroundColor: tone }}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="text-[11.5px] font-semibold leading-[1.3]">{e.label}</div>
                        <div className="mt-[3px] truncate whitespace-nowrap text-[10px] text-muted-foreground">
                          {[e.time ?? "—", e.who].filter(Boolean).join(" · ")}
                        </div>
                        {e.cta ? (
                          <button
                            type="button"
                            onClick={e.onOpen}
                            disabled={!e.onOpen}
                            title={
                              e.onOpen ? undefined : "Nothing is wired behind this entry yet."
                            }
                            className={cn(
                              "mt-1 rounded text-[10.5px] font-semibold transition-colors",
                              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                              e.onOpen
                                ? "text-[hsl(var(--primary))] hover:underline"
                                : "cursor-not-allowed text-muted-foreground",
                            )}
                          >
                            {e.cta}
                          </button>
                        ) : null}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </aside>
        </div>
      )}
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
   CalendarWeek — CD `isWeekGrid`, L1092–1126
   ──────────────────────────────────────────────────────────────────────────── */

export type WeekBand = {
  id: string;
  /** Minutes from midnight, local to the schedule's own timezone. */
  startMinutes: number;
  endMinutes: number;
  /** Already-formatted ("9–12"). null → the band renders without a label, never a made-up one. */
  label: string | null;
};

export type WeekDay = {
  id: string;
  /** CD's 28px column ("Mon"). */
  label: string;
  /** Whether the day is open at all. */
  enabled: boolean;
  bands: readonly WeekBand[];
};

export type CalendarWeekProps = {
  /** The seven rows. Empty → the surface says the schedule is not connected. */
  days: readonly WeekDay[];
  /** IANA zone the hours are expressed in. null → "—"; never assumed from the browser. */
  timezone?: string | null;
  /** The ruler's window. CD draws 6am–10pm. */
  windowStartHour?: number;
  windowEndHour?: number;
  /** Absent → the switches are read-only and say so. */
  onToggleDay?: (day: WeekDay, next: boolean) => void;
  /** Absent → the row's "+" renders disabled. */
  onAddBand?: (day: WeekDay) => void;
  /** Absent → bands are not interactive (CD's drag is not ported — see the file note). */
  onEditBand?: (day: WeekDay, band: WeekBand) => void;
  foot?: string | null;
  loading?: boolean;
  error?: string | null;
  title?: string;
  sub?: string | null;
};

function formatHour(h: number): string {
  const hh = ((h % 24) + 24) % 24;
  if (hh === 0) return "12a";
  if (hh === 12) return "12p";
  return hh < 12 ? `${hh}a` : `${hh - 12}p`;
}

const pct = (n: number) => `${(Math.round(n * 10) / 10).toFixed(1)}%`;

export function CalendarWeek({
  days,
  timezone = null,
  windowStartHour = 6,
  windowEndHour = 22,
  onToggleDay,
  onAddBand,
  onEditBand,
  foot = null,
  loading = false,
  error = null,
  title = "Platform hours",
  sub = null,
}: CalendarWeekProps) {
  const startMin = windowStartHour * 60;
  const spanMin = Math.max(1, (windowEndHour - windowStartHour) * 60);

  const ticks = useMemo(() => {
    const out: number[] = [];
    for (let h = windowStartHour; h < windowEndHour; h += 3) out.push(h);
    return out;
  }, [windowStartHour, windowEndHour]);

  return (
    <div className="min-w-0">
      <div className="min-w-0 flex-none">
        <div className="text-[14.5px] font-semibold tracking-[-0.01em]">{title}</div>
        {sub ? <div className="mt-[3px] text-[11.5px] text-muted-foreground">{sub}</div> : null}
      </div>

      <div className="mb-[9px] mt-2.5 flex items-center gap-[9px]">
        <span className="text-[9px] font-semibold tracking-[0.13em] text-muted-foreground">
          WEEKLY HOURS
        </span>
        <span className="ml-auto font-mono text-[9.5px] text-muted-foreground">
          {timezone ?? "—"}
        </span>
      </div>

      {loading && (
        <StatePlate
          title="Reading the schedule…"
          body="The weekly pattern and its availability bands are being read."
        />
      )}

      {!loading && error && <StatePlate title="The schedule could not be read." body={error} />}

      {!loading && !error && days.length === 0 && (
        <StatePlate
          title="The weekly schedule is not connected."
          body="Every band on this grid says the platform is bookable at that hour. None of that is being reported, so no week is drawn — an invented pattern would offer times nobody agreed to."
        />
      )}

      {!loading && !error && days.length > 0 && (
        <>
          {/* CD's ruler, offset to sit over the track it labels (see the file note). */}
          <div className="mb-[5px] flex gap-2 pl-[74px] pr-[26px]" aria-hidden>
            {ticks.map((h) => (
              <span
                key={h}
                className="min-w-0 flex-1 font-mono text-[8.5px] tabular-nums text-muted-foreground"
              >
                {formatHour(h)}
              </span>
            ))}
          </div>

          <ul className="flex list-none flex-col gap-1 p-0">
            {days.map((d) => (
              <li key={d.id} className="flex min-w-0 items-center gap-2.5">
                <button
                  type="button"
                  role="switch"
                  aria-checked={d.enabled}
                  aria-label={`${d.label} — ${d.enabled ? "open" : "unavailable"}`}
                  disabled={!onToggleDay}
                  title={onToggleDay ? undefined : "The schedule is read-only here."}
                  onClick={() => onToggleDay?.(d, !d.enabled)}
                  className={cn(
                    "relative h-[15px] w-[26px] flex-none rounded-[20px] transition-colors",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
                    d.enabled ? "bg-[hsl(var(--success))]" : "bg-muted-foreground/40",
                    !onToggleDay && "cursor-not-allowed opacity-80",
                  )}
                >
                  <span
                    aria-hidden
                    className={cn(
                      "absolute top-px h-[13px] w-[13px] rounded-full bg-card shadow-sm transition-[left]",
                      d.enabled ? "left-[12px]" : "left-px",
                    )}
                  />
                </button>

                <span
                  className={cn(
                    "w-[28px] flex-none text-[11px] font-semibold",
                    d.enabled ? "text-foreground" : "text-muted-foreground",
                  )}
                >
                  {d.label}
                </span>

                <div className="relative h-[26px] min-w-0 flex-1 overflow-hidden rounded-[7px] border border-border bg-muted/50">
                  {d.bands.map((b) => {
                    const left = ((b.startMinutes - startMin) / spanMin) * 100;
                    const width = ((b.endMinutes - b.startMinutes) / spanMin) * 100;
                    const clampedLeft = Math.min(100, Math.max(0, left));
                    const clampedWidth = Math.min(100 - clampedLeft, Math.max(0, width));
                    const outside = left < 0 || left + width > 100;
                    const inner = (
                      <span className="block truncate whitespace-nowrap px-1 text-[8.5px] font-bold text-[hsl(var(--primary-foreground))]">
                        {b.label ?? ""}
                      </span>
                    );
                    const style = {
                      left: pct(clampedLeft),
                      width: pct(clampedWidth),
                    } as const;
                    const shell =
                      "absolute bottom-[3px] top-[3px] grid place-items-center overflow-hidden rounded-[5px] bg-[hsl(var(--primary))]";
                    const label = outside
                      ? "This band extends outside the hours shown."
                      : (b.label ?? undefined);
                    return onEditBand ? (
                      <button
                        key={b.id}
                        type="button"
                        title={label}
                        onClick={() => onEditBand(d, b)}
                        style={style}
                        className={cn(
                          shell,
                          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                        )}
                      >
                        {inner}
                      </button>
                    ) : (
                      <span key={b.id} title={label} style={style} className={shell}>
                        {inner}
                      </span>
                    );
                  })}
                  {!d.enabled && (
                    <span className="absolute left-[9px] top-[6px] text-[9.5px] text-muted-foreground">
                      Unavailable
                    </span>
                  )}
                  {d.enabled && d.bands.length === 0 && (
                    <span className="absolute left-[9px] top-[6px] text-[9.5px] text-muted-foreground">
                      No hours set
                    </span>
                  )}
                </div>

                <button
                  type="button"
                  aria-label={`Add hours to ${d.label}`}
                  disabled={!onAddBand}
                  title={onAddBand ? undefined : "Adding hours is not wired to this surface yet."}
                  onClick={() => onAddBand?.(d)}
                  className={cn(
                    "w-4 flex-none rounded text-center text-[12px] transition-colors",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    onAddBand
                      ? "text-muted-foreground hover:text-foreground"
                      : "cursor-not-allowed text-muted-foreground/50",
                  )}
                >
                  +
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      {foot ? (
        <div className="mt-2.5 text-[10.5px] leading-[1.5] text-muted-foreground">{foot}</div>
      ) : null}
    </div>
  );
}

export default CalendarMonth;
