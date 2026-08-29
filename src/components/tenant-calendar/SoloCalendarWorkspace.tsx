import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import {
  AlertTriangle, CalendarDays, ChevronLeft, ChevronRight, Plus, Settings2, SlidersHorizontal,
  TriangleAlert, X,
} from "lucide-react";
import {
  DEFAULT_CALENDAR_COLOR, UNASSIGNED_CALENDAR, addDays, availabilityFor, hourOf,
  parseIntakeQuestions, parseNotifyConfig, parseOverrides, parseWindows,
  rangeFor, rangeLabel, startOfDay, startOfWeek, useSoloCalendar, wantsSms,
  type CalendarReminder, type SoloBooking, type SoloCalendarMeta, type ViewMode,
} from "./useSoloCalendar";
import "./solo-calendar.css";

/**
 * The Solo-native Calendar.
 *
 * Ports the retired Solo calendar's presentation — dense grid, colour-coded
 * events, collapsible rail groups, a slide-out detail drawer — onto the CURRENT
 * real seams. Nothing here is fixture-backed: every event comes from
 * `list_team_bookings`, every colour from a `calendars` row the tenant owns, and
 * every conflict from an actual start/end overlap. An empty book renders empty.
 *
 * DRAWERS ARE NOT BROWSER POP-OUTS. A detached window would need a proven
 * cross-window sync pattern, and this repository has none, so the rich in-page
 * drawer is what ships (owner ruling 2026-08-29).
 */

const HOUR_START = 7;
const HOUR_END = 21;
const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** Labels for the stored reminder vocabulary. The values are the sender's own
 *  ("email" | "sms" | "both"; "guest" | "host" | "both"), so what reads here is
 *  what would actually go out — not a friendlier restatement of something else. */
const CHANNEL_LABEL: Record<CalendarReminder["channel"], string> = {
  email: "Email", sms: "SMS", both: "Email and SMS",
};
const RECIPIENT_LABEL: Record<CalendarReminder["to"], string> = {
  guest: "to the guest", host: "to the host", both: "to guest and host",
};
/** A stored offset is minutes BEFORE the appointment. Rendered in the largest whole
 *  unit that divides it exactly, so a stored 1440 reads as the day it means. */
function offsetLabel(min: number): string {
  if (min % 1440 === 0) { const d = min / 1440; return `${d} day${d === 1 ? "" : "s"} before`; }
  if (min % 60 === 0) { const h = min / 60; return `${h} hour${h === 1 ? "" : "s"} before`; }
  return `${min} minute${min === 1 ? "" : "s"} before`;
}

function timeLabel(iso: string) {
  return new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}
function hourLabel(h: number) {
  const d = new Date(); d.setHours(h, 0, 0, 0);
  return d.toLocaleTimeString(undefined, { hour: "numeric" });
}
function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}
/** A booking that no longer holds its slot reads as struck through, not hidden —
 *  removing it would quietly rewrite the day's history. */
function isOff(b: SoloBooking) { return b.status === "cancelled" || b.status === "no_show"; }

interface RailGroupProps {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}
function RailGroup({ title, defaultOpen = true, children }: RailGroupProps) {
  const [open, setOpen] = useState(defaultOpen);
  const bodyId = useId();
  return (
    <section className="sc-group">
      <button
        type="button"
        className="sc-group-head"
        aria-expanded={open}
        aria-controls={bodyId}
        onClick={() => setOpen((o) => !o)}
      >
        <ChevronRight className="sc-chev" aria-hidden="true" />
        <span>{title}</span>
      </button>
      {open && <div className="sc-group-body" id={bodyId}>{children}</div>}
    </section>
  );
}

function TruthTag({ state }: { state: "LIVE" | "PARTIAL" | "PROPOSED" | "UNAVAILABLE" }) {
  return <span className={`sc-tag sc-tag--${state.toLowerCase()}`}>{state}</span>;
}

interface DrawerProps {
  title: string;
  sub?: string;
  onClose: () => void;
  children: React.ReactNode;
  foot?: React.ReactNode;
  /** The retired design's second width, for editors that need the room. */
  wide?: boolean;
}
const FOCUSABLE =
  'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';
/**
 * Slide-out drawer with Escape-to-close, focus restoration and a focus TRAP.
 *
 * The retired design's SlideOut had Escape and a backdrop but no trap, no focus
 * restore and no dialog semantics — tab order leaked straight through to the page
 * behind it. Declaring `aria-modal` without confining focus would be a promise the
 * markup does not keep, so the trap is part of the port rather than a nicety.
 *
 * The element that opened the drawer is captured on mount and refocused on unmount,
 * so keyboard users land back where they were, not at the top of the document.
 */
function Drawer({ title, sub, onClose, children, foot, wide }: DrawerProps) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const restoreRef = useRef<HTMLElement | null>(null);
  const headingId = useId();

  useEffect(() => {
    restoreRef.current = document.activeElement as HTMLElement | null;
    panelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.stopPropagation(); onClose(); return; }
      if (e.key !== "Tab") return;
      const panel = panelRef.current;
      if (!panel) return;
      const items = [...panel.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => el.offsetParent !== null);
      if (!items.length) { e.preventDefault(); panel.focus(); return; }
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      // Wrap at both ends, and pull focus back in if it has escaped the panel.
      if (e.shiftKey && (active === first || active === panel)) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && active === last) { e.preventDefault(); first.focus(); }
      else if (!panel.contains(active)) { e.preventDefault(); first.focus(); }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      const el = restoreRef.current;
      if (el && document.contains(el)) el.focus();
    };
  }, [onClose]);

  return (
    <>
      <div className="sc-scrim" onClick={onClose} aria-hidden="true" />
      <aside
        className={`sc-drawer${wide ? " sc-drawer--wide" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={headingId}
        ref={panelRef}
        tabIndex={-1}
      >
        <header className="sc-drawer-head">
          <div style={{ minWidth: 0, flex: 1 }}>
            <h2 id={headingId}>{title}</h2>
            {sub && <p>{sub}</p>}
          </div>
          <button type="button" className="sc-btn sc-btn--icon" onClick={onClose} aria-label="Close">
            <X aria-hidden="true" />
          </button>
        </header>
        <div className="sc-drawer-body">{children}</div>
        {foot && <div className="sc-drawer-foot">{foot}</div>}
      </aside>
    </>
  );
}

export interface SoloCalendarWorkspaceProps {
  activeTenantId: string;
  connectionsHref: string;
  openPaige?: () => void;
}

export function SoloCalendarWorkspace({ activeTenantId, connectionsHref, openPaige }: SoloCalendarWorkspaceProps) {
  const [view, setView] = useState<ViewMode>("week");
  const [cursor, setCursor] = useState(() => new Date());
  const [colorBy, setColorBy] = useState<"calendar" | "host">("calendar");
  const [hidden, setHidden] = useState<Set<string>>(() => new Set());
  const [detail, setDetail] = useState<SoloBooking | null>(null);
  const [creating, setCreating] = useState(false);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [actionMsg, setActionMsg] = useState<string | null>(null);
  const [dayFocus, setDayFocus] = useState<{ day: Date; list: SoloBooking[] } | null>(null);
  const [configFor, setConfigFor] = useState<SoloCalendarMeta | null>(null);

  const cal = useSoloCalendar(activeTenantId, view, cursor);
  const { bookings, calendars, conflicts, phase, error, colorForBooking } = cal;

  const visible = useMemo(
    () => bookings.filter((b) => !hidden.has(b.calendar_id ?? UNASSIGNED_CALENDAR)),
    [bookings, hidden],
  );

  const toggleCalendar = useCallback((id: string) => {
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const step = useCallback((dir: -1 | 1) => {
    setCursor((c) => {
      if (view === "month") return new Date(c.getFullYear(), c.getMonth() + dir, 1);
      if (view === "agenda") return addDays(c, dir * 14);
      return addDays(c, dir * 7);
    });
  }, [view]);

  const label = rangeLabel(view, cursor);
  const today = useMemo(() => startOfDay(new Date()), []);
  const conflictCount = useMemo(
    () => visible.filter((b) => conflicts.has(b.id)).length,
    [visible, conflicts],
  );

  /**
   * Stored open hours for a day, merged across the calendars currently shown.
   *
   * Merged rather than per-calendar because the grid has one column per day: an
   * hour counts as open when ANY visible calendar stores hours covering it. A day
   * reads "configured" only if at least one visible calendar actually stores
   * windows — otherwise the grid stays unshaded rather than implying hours.
   */
  const hoursForDay = useCallback((day: Date) => {
    const shown = calendars.filter((c) => !hidden.has(c.id));
    const resolved = shown.map((c) => availabilityFor(c, day));
    const configured = resolved.filter((r) => r.configured);
    if (!configured.length) return { configured: false, blocked: false, windows: [] };
    // A day is "off" only when every configured calendar marks it off.
    const blocked = configured.every((r) => r.blocked);
    return { configured: true, blocked, windows: configured.flatMap((r) => r.windows) };
  }, [calendars, hidden]);

  /** The calendar the open booking belongs to, for its stored colour and title. */
  const detailCalendar = useMemo(
    () => (detail ? calendars.find((c) => c.id === detail.calendar_id) ?? null : null),
    [detail, calendars],
  );

  /**
   * Intake answers joined to their question labels. Both halves are real: the
   * answers come back on the booking, the labels off the calendar's stored
   * `intake_questions`. An answer whose question no longer exists keeps its raw
   * key as the label rather than vanishing.
   */
  const intakePairs = useMemo(() => {
    const answers = detail?.intake_answers;
    if (!answers || typeof answers !== "object") return [];
    const questions = parseIntakeQuestions(detailCalendar?.intake_questions);
    return Object.entries(answers).flatMap(([key, value]) => {
      if (value == null || value === "") return [];
      const text = Array.isArray(value) ? value.join(", ") : String(value);
      return [{ key, label: questions.find((q) => q.id === key)?.label ?? key, value: text }];
    });
  }, [detail, detailCalendar]);

  const runStatus = async (id: string, status: string) => {
    const res = await cal.setStatus(id, status);
    if (!res.ok) { setActionMsg(res.message ?? "That change was refused."); return; }
    setActionMsg(null);
    setDetail((d) => (d && d.id === id ? { ...d, status } : d));
  };

  // ONE definition of the rail's controls. It renders in the rail at wide widths
  // and inside the "View options" drawer when the rail collapses — a control that
  // exists in only one of those places is a hidden control, not a responsive one.
  const railBody = (
    <>
            <RailGroup title="Calendars">
              {cal.calendarsError && (
                <p className="sc-note">This account&rsquo;s calendars could not be loaded, so colour coding falls back to one tint.</p>
              )}
              {!cal.calendarsError && calendars.length === 0 && (
                <p className="sc-note">No calendars are configured yet. Appointments still appear, in the default tint.</p>
              )}
              {calendars.map((c) => {
                const on = !hidden.has(c.id);
                const swatch = c.color || c.accent || DEFAULT_CALENDAR_COLOR;
                return (
                  <div className="sc-check-row" key={c.id}>
                    <button
                      type="button"
                      className="sc-check"
                      aria-pressed={on}
                      onClick={() => toggleCalendar(c.id)}
                    >
                      <span
                        className={`sc-swatch${on ? "" : " sc-swatch--off"}`}
                        style={on ? { background: swatch } : undefined}
                        aria-hidden="true"
                      />
                      <span className="sc-label">{c.title}</span>
                      {c.enabled === false && <span className="sc-off-tag">off</span>}
                    </button>
                    <button
                      type="button"
                      className="sc-btn sc-btn--icon sc-cog"
                      onClick={() => setConfigFor(c)}
                      aria-label={`How ${c.title} is configured`}
                    >
                      <Settings2 aria-hidden="true" />
                    </button>
                  </div>
                );
              })}
              <button
                type="button"
                className="sc-check"
                aria-pressed={!hidden.has(UNASSIGNED_CALENDAR)}
                onClick={() => toggleCalendar(UNASSIGNED_CALENDAR)}
              >
                <span
                  className={`sc-swatch${hidden.has(UNASSIGNED_CALENDAR) ? " sc-swatch--off" : ""}`}
                  style={hidden.has(UNASSIGNED_CALENDAR) ? undefined : { background: DEFAULT_CALENDAR_COLOR }}
                  aria-hidden="true"
                />
                <span className="sc-label">Unassigned</span>
              </button>
            </RailGroup>

            <RailGroup title="Colour by">
              <div className="sc-seg" role="group" aria-label="Colour events by" style={{ width: "100%" }}>
                {(["calendar", "host"] as const).map((k) => (
                  <button key={k} type="button" aria-pressed={colorBy === k} onClick={() => setColorBy(k)} style={{ flex: 1 }}>
                    {k === "calendar" ? "Calendar" : "Host"}
                  </button>
                ))}
              </div>
              <p className="sc-note">
                {colorBy === "calendar"
                  ? "Each calendar's stored colour."
                  : "Hosts store no colour, so a stable hue is derived per host."}
              </p>
            </RailGroup>

            {/* Calendar settings live on the calendar — each calendar's own drawer,
                opened from the cog beside it. No general link out of this surface:
                availability, booking rules, event types and colours are Calendar's,
                and a standing signpost elsewhere would imply otherwise. */}
            <RailGroup title="Settings" defaultOpen={false}>
              <p className="sc-note">
                <Settings2 className="sc-swatch" style={{ border: 0 }} aria-hidden="true" />
                Open a calendar's cog above for its hours, booking rules and reminders.
              </p>
              {openPaige && (
                <button type="button" className="sc-check" onClick={openPaige}>
                  <CalendarDays className="sc-swatch" style={{ border: 0 }} aria-hidden="true" />
                  <span className="sc-label">Ask PAIGE about this range</span>
                </button>
              )}
              <p className="sc-note">PAIGE opens in the existing workspace. No second chat is started.</p>
            </RailGroup>
    </>
  );

  return (
    <div className="sc-root" data-solo-calendar>
      <div className="sc-bar">
        <button type="button" className="sc-btn" onClick={() => setCursor(new Date())}>Today</button>
        <button type="button" className="sc-btn sc-btn--icon" onClick={() => step(-1)} aria-label="Previous">
          <ChevronLeft aria-hidden="true" />
        </button>
        <button type="button" className="sc-btn sc-btn--icon" onClick={() => step(1)} aria-label="Next">
          <ChevronRight aria-hidden="true" />
        </button>
        <span className="sc-range">{label}</span>
        <span className="sc-bar-spacer" />
        <div className="sc-seg" role="group" aria-label="Calendar view">
          {(["week", "month", "agenda"] as ViewMode[]).map((v) => (
            <button key={v} type="button" aria-pressed={view === v} onClick={() => setView(v)}>
              {v[0].toUpperCase() + v.slice(1)}
            </button>
          ))}
        </div>
        <button type="button" className="sc-btn sc-options-btn" onClick={() => setOptionsOpen(true)}>
          <SlidersHorizontal aria-hidden="true" /> View options
        </button>
        <button type="button" className="sc-btn sc-btn--gold" onClick={() => setCreating(true)}>
          <Plus aria-hidden="true" /> New appointment
        </button>
      </div>

      <div className="sc-truth">
        <TruthTag state="LIVE" />
        <span>
          Appointments come from this account&rsquo;s booking service.
          {conflictCount > 0
            ? ` ${conflictCount} ${conflictCount === 1 ? "appointment overlaps" : "appointments overlap"} another on the same host.`
            : " No overlapping appointments in this range."}
        </span>
      </div>

      <div className="sc-board">
        <div className="sc-rail">
          <div className="sc-rail-scroll">
            {railBody}
          </div>
        </div>

        <div className="sc-canvas">
          {phase === "error" ? (
            <div className="sc-state">
              <AlertTriangle aria-hidden="true" />
              <h3>We couldn&rsquo;t load this range</h3>
              <p>{error}</p>
              <button type="button" className="sc-btn" onClick={cal.refresh}>Try again</button>
            </div>
          ) : view === "month" ? (
            <MonthView
              cursor={cursor} bookings={visible} today={today} conflicts={conflicts}
              colorFor={(b) => colorForBooking(b, colorBy)} onOpen={setDetail}
              onOpenDay={(d, list) => setDayFocus({ day: d, list })}
            />
          ) : view === "agenda" ? (
            <AgendaView
              cursor={cursor} bookings={visible} conflicts={conflicts} phase={phase}
              colorFor={(b) => colorForBooking(b, colorBy)} onOpen={setDetail}
            />
          ) : (
            <WeekView
              cursor={cursor} bookings={visible} today={today} conflicts={conflicts}
              colorFor={(b) => colorForBooking(b, colorBy)} onOpen={setDetail}
              hours={hoursForDay}
            />
          )}
        </div>
      </div>

      {detail && (
        <Drawer
          title={detail.title || "Appointment"}
          sub={`${new Date(detail.start_at).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })} · ${timeLabel(detail.start_at)} – ${timeLabel(detail.end_at)}`}
          onClose={() => { setDetail(null); setActionMsg(null); }}
          foot={
            <>
              {/* The five values `admin_set_booking_status` actually accepts. 'blocked'
                  is offered only from the create drawer, where it is what blocking time
                  means; offering it here would let a real appointment be silently
                  reclassified as a hold. */}
              <button type="button" className="sc-btn" onClick={() => void runStatus(detail.id, "scheduled")} disabled={detail.status === "scheduled"}>
                Mark scheduled
              </button>
              <button type="button" className="sc-btn" onClick={() => void runStatus(detail.id, "done")} disabled={detail.status === "done"}>
                Mark done
              </button>
              <button type="button" className="sc-btn" onClick={() => void runStatus(detail.id, "no_show")} disabled={detail.status === "no_show"}>
                No-show
              </button>
              <button type="button" className="sc-btn sc-btn--danger" onClick={() => void runStatus(detail.id, "cancelled")} disabled={detail.status === "cancelled"}>
                Cancel appointment
              </button>
            </>
          }
        >
          {actionMsg && <div className="sc-msg sc-msg--bad">{actionMsg}</div>}
          {conflicts.has(detail.id) && (
            <div className="sc-msg sc-msg--bad">
              <TriangleAlert aria-hidden="true" style={{ width: 13, height: 13, verticalAlign: "-2px" }} />{" "}
              This overlaps another appointment on the same host.
            </div>
          )}
          <dl className="sc-kv">
            <dt>Status</dt><dd>{detail.status}</dd>
            <dt>Calendar</dt>
            <dd>
              {detailCalendar
                ? (
                  <>
                    <span className="sc-swatch sc-swatch--inline" style={{ background: detailCalendar.color || detailCalendar.accent || DEFAULT_CALENDAR_COLOR }} aria-hidden="true" />
                    {detailCalendar.title}
                  </>
                )
                : "Unassigned"}
            </dd>
            {detail.appointment_type?.name && (<><dt>Type</dt><dd>{detail.appointment_type.name}</dd></>)}
            <dt>Host</dt><dd>{detail.host_full_name || "Not recorded"}</dd>
            <dt>Guest</dt><dd>{detail.guest_name || "Not recorded"}</dd>
            <dt>Email</dt><dd>{detail.guest_email || "Not recorded"}</dd>
            <dt>Phone</dt><dd>{detail.guest_phone || "Not recorded"}</dd>
            <dt>Where</dt><dd>{detail.location_value || detail.location_type || "Not recorded"}</dd>
            {detail.booking_kind !== "single" && (<><dt>Kind</dt><dd>{detail.booking_kind}</dd></>)}
            {detail.capacity != null && (<><dt>Capacity</dt><dd>{detail.capacity}</dd></>)}
            <dt>Source</dt><dd>{detail.source}</dd>
            <dt>Time zone</dt><dd>{detail.timezone || "Not recorded"}</dd>
            {detail.notes && (<><dt>Notes</dt><dd>{detail.notes}</dd></>)}
          </dl>

          {/* Intake answers are returned by `list_team_bookings`; the question LABELS
              live on the calendar row, so the two are joined here. An answer whose
              question has since been deleted still shows, under its raw key, rather
              than being dropped — losing a client's answer would be the worse lie. */}
          {intakePairs.length > 0 && (
            <section className="sc-sub">
              <h3>What they answered</h3>
              <dl className="sc-kv">
                {intakePairs.map(({ key, label, value }) => (
                  <div key={key} style={{ display: "contents" }}>
                    <dt>{label}</dt><dd>{value}</dd>
                  </div>
                ))}
              </dl>
            </section>
          )}

          <p className="sc-note">
            <TruthTag state="UNAVAILABLE" /> A meeting join link is not part of what the
            booking service returns to this surface, so none is shown rather than guessed.
          </p>
        </Drawer>
      )}

      {/* The retired design's day drawer: the day's own list, handing off to the
          event drawer by REPLACING itself rather than stacking two dialogs. */}
      {dayFocus && (
        <Drawer
          title={dayFocus.day.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}
          sub={`${dayFocus.list.length} ${dayFocus.list.length === 1 ? "appointment" : "appointments"}`}
          onClose={() => setDayFocus(null)}
        >
          <div className="sc-daylist">
            {dayFocus.list.map((b) => (
              <button
                key={b.id}
                type="button"
                className={`sc-dayrow${isOff(b) ? " sc-ev--off" : ""}`}
                onClick={() => { setDayFocus(null); setDetail(b); }}
              >
                <span className="sc-swatch sc-swatch--inline" style={{ background: colorForBooking(b, colorBy) }} aria-hidden="true" />
                <span className="sc-label">{b.title}</span>
                <span className="sc-dayrow-time">{timeLabel(b.start_at)}</span>
              </button>
            ))}
          </div>
        </Drawer>
      )}

      {/* Per-calendar configuration, read from the calendar row. Calendar settings —
          which calendars, availability, booking rules, event types, colours,
          reminders and conflict handling — are CALENDAR-owned and belong here.
          Every value is a stored column; nothing is defaulted for display, because a
          column default rendered as a choice is a fabrication (§13). Editing still
          lives in the one scheduling manager (§18), so this reports rather than
          growing a second editor. */}
      {configFor && (
        <Drawer
          title={configFor.title}
          sub="How this calendar is configured"
          onClose={() => setConfigFor(null)}
          wide
        >
          <dl className="sc-kv">
            <dt>Accepting bookings</dt><dd>{configFor.enabled === null ? "Not recorded" : configFor.enabled ? "Yes" : "No"}</dd>
            <dt>Type</dt><dd>{configFor.type || "Not recorded"}</dd>
            <dt>Appointment length</dt><dd>{configFor.duration_min != null ? `${configFor.duration_min} minutes` : "Not recorded"}</dd>
            <dt>Buffer before</dt><dd>{configFor.buffer_before_min != null ? `${configFor.buffer_before_min} minutes` : "Not recorded"}</dd>
            <dt>Buffer after</dt><dd>{configFor.buffer_after_min != null ? `${configFor.buffer_after_min} minutes` : "Not recorded"}</dd>
            <dt>Minimum notice</dt><dd>{configFor.min_notice_min != null ? `${configFor.min_notice_min} minutes` : "Not recorded"}</dd>
            <dt>Books out to</dt><dd>{configFor.booking_horizon_days != null ? `${configFor.booking_horizon_days} days` : "Not recorded"}</dd>
            <dt>Capacity</dt><dd>{configFor.capacity != null ? configFor.capacity : "Not recorded"}</dd>
            <dt>Time zone</dt><dd>{configFor.timezone || "Not recorded"}</dd>
            <dt>Where</dt><dd>{configFor.location_value || configFor.location_type || "Not recorded"}</dd>
            <dt>Intake questions</dt><dd>{parseIntakeQuestions(configFor.intake_questions).length}</dd>
            <dt>Public link</dt>
            <dd>{configFor.slug ? `/book/${configFor.slug}` : "No slug recorded"}</dd>
          </dl>

          <section className="sc-sub">
            <h3>Stored hours</h3>
            {(() => {
              const w = parseWindows(configFor.availability_json);
              if (!w?.length) {
                return (
                  <p className="sc-note">
                    <TruthTag state="UNAVAILABLE" /> This calendar stores no working hours.
                    The public booking page applies its own fallback when none are set, so no
                    hours are drawn here rather than showing hours this account never chose.
                  </p>
                );
              }
              return (
                <ul className="sc-hours">
                  {[...w].sort((a, b) => a.day - b.day || a.start.localeCompare(b.start)).map((x, i) => (
                    <li key={`${x.day}-${x.start}-${i}`}>
                      <span className="sc-hours-day">{DOW[x.day]}</span>
                      <span>{x.start} – {x.end}</span>
                    </li>
                  ))}
                </ul>
              );
            })()}
            {(() => {
              const overrides = parseOverrides(configFor.date_overrides);
              return overrides.length === 0 ? null : (
                <p className="sc-note">
                  {overrides.length} stored date {overrides.length === 1 ? "override" : "overrides"}.
                </p>
              );
            })()}
          </section>

          {/* Appointment communication. Calendar decides WHAT should be sent and WHEN
              — that is this block, read from `calendars.notify_config`. Whether an
              SMS-capable number is connected and permitted is decided elsewhere and
              is NOT read here: inferring it from this row would be shadow status. */}
          <section className="sc-sub">
            <h3>Confirmations and reminders</h3>
            {(() => {
              const notify = parseNotifyConfig(configFor.notify_config);
              if (!notify) {
                return (
                  <p className="sc-note">
                    <TruthTag state="UNAVAILABLE" /> This calendar stores no notification
                    settings. What the booking engine sends when none are stored is decided
                    there, so nothing is drawn here rather than showing sends this account
                    never chose.
                  </p>
                );
              }
              return (
                <>
                  <dl className="sc-kv">
                    <dt>Confirm the guest</dt><dd>{notify.confirm_guest ? "Yes" : "No"}</dd>
                    <dt>Confirm the host</dt><dd>{notify.confirm_host ? "Yes" : "No"}</dd>
                  </dl>
                  {notify.reminders.length === 0 ? (
                    <p className="sc-note">No reminders are stored on this calendar.</p>
                  ) : (
                    <ul className="sc-hours sc-hours--wide">
                      {notify.reminders.map((r, i) => (
                        <li key={`${r.channel}-${r.offset_min}-${r.to}-${i}`}>
                          <span className="sc-hours-lead">{offsetLabel(r.offset_min)}</span>
                          <span>{CHANNEL_LABEL[r.channel]} · {RECIPIENT_LABEL[r.to]}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                  {/* Narrow, earned remediation: shown ONLY when this calendar's own
                      reminders ask for SMS. It is a path to fix a channel, never a
                      suggestion that scheduling, availability or booking rules live
                      there. Whether SMS is actually permitted is not asserted, because
                      this surface does not read it. */}
                  {wantsSms(notify) && (
                    <p className="sc-note">
                      <TruthTag state="UNAVAILABLE" /> SMS sending capability is not read
                      here. If these SMS reminders are not going out, connect a business
                      phone in{" "}
                      <a className="sc-inline-link" href={connectionsHref}>
                        Settings → Connections
                      </a>
                      .
                    </p>
                  )}
                </>
              );
            })()}
          </section>
        </Drawer>
      )}

      {optionsOpen && (
        <Drawer
          title="View options"
          sub="Calendars, colour coding and settings"
          onClose={() => setOptionsOpen(false)}
        >
          {railBody}
        </Drawer>
      )}

      {creating && (
        <CreateDrawer
          calendars={calendars}
          onClose={() => setCreating(false)}
          onCreate={cal.createBooking}
        />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ views --- */

interface ViewProps {
  cursor: Date;
  bookings: SoloBooking[];
  conflicts: Set<string>;
  colorFor: (b: SoloBooking) => string;
  onOpen: (b: SoloBooking) => void;
}

function EventChip({ b, conflict, color, onOpen, showTime = true }: {
  b: SoloBooking; conflict: boolean; color: string; onOpen: (b: SoloBooking) => void; showTime?: boolean;
}) {
  return (
    <button
      type="button"
      className={`sc-ev${isOff(b) ? " sc-ev--off" : ""}${conflict ? " sc-ev--conflict" : ""}`}
      style={{ ["--sc-ev-color" as string]: color }}
      onClick={() => onOpen(b)}
      title={`${b.title} · ${timeLabel(b.start_at)}`}
    >
      {conflict && <span className="sc-ev-flag"><TriangleAlert aria-hidden="true" /></span>}
      {showTime && <span className="sc-ev-time">{timeLabel(b.start_at)}</span>}
      <span className="sc-ev-title">{b.title}</span>
    </button>
  );
}

function WeekView({ cursor, bookings, today, conflicts, colorFor, onOpen, hours: openHours }: ViewProps & {
  today: Date;
  /** Per-day stored working windows, already resolved from the real calendars. */
  hours: (day: Date) => { configured: boolean; blocked: boolean; windows: { start: string; end: string }[] };
}) {
  const start = startOfWeek(cursor);
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  const hourList = Array.from({ length: HOUR_END - HOUR_START }, (_, i) => HOUR_START + i);
  const cols = `56px repeat(7, minmax(0, 1fr))`;

  /** Stored open hours for the whole week, computed once per render. */
  const dayHours = days.map((d) => openHours(d));

  return (
    <>
      <div className="sc-dow" style={{ gridTemplateColumns: cols }}>
        <div aria-hidden="true" />
        {days.map((d, i) => (
          <div key={d.toISOString()} className={sameDay(d, today) ? "sc-dow-today" : undefined}>
            {DOW[d.getDay()]}
            <span className="sc-dow-num">{d.getDate()}</span>
            {dayHours[i].blocked && <span className="sc-dow-off" title="Marked off in this calendar's date overrides">off</span>}
          </div>
        ))}
      </div>
      <div className="sc-grid-scroll">
        <div className="sc-week" style={{ gridTemplateColumns: cols }}>
          {hourList.map((h) => (
            <div key={h} style={{ display: "contents" }}>
              <div className="sc-hour-label">{hourLabel(h)}</div>
              {days.map((d, i) => {
                const slot = bookings.filter((b) => {
                  const s = new Date(b.start_at);
                  return sameDay(s, d) && s.getHours() === h;
                });
                const av = dayHours[i];
                // Shading is drawn ONLY from stored windows. A calendar with no hours
                // set is left unshaded rather than painted 9–5, because that default
                // lives in the public booking function, not in the tenant's data.
                const open = av.configured && !av.blocked &&
                  av.windows.some((w) => hourOf(w.start) < h + 1 && hourOf(w.end) > h);
                const cls = !av.configured ? "" : open ? " sc-hour-cell--open" : " sc-hour-cell--closed";
                return (
                  <div className={`sc-hour-cell${cls}`} key={`${d.toISOString()}-${h}`}>
                    {slot.map((b) => (
                      <EventChip key={b.id} b={b} conflict={conflicts.has(b.id)} color={colorFor(b)} onOpen={onOpen} showTime={false} />
                    ))}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

function MonthView({ cursor, bookings, today, conflicts, colorFor, onOpen, onOpenDay }: ViewProps & {
  today: Date;
  onOpenDay: (day: Date, list: SoloBooking[]) => void;
}) {
  const [from] = rangeFor("month", cursor);
  const cells = Array.from({ length: 42 }, (_, i) => addDays(from, i));
  const month = cursor.getMonth();
  return (
    <>
      <div className="sc-dow" style={{ gridTemplateColumns: "repeat(7, minmax(0, 1fr))" }}>
        {DOW.map((d) => <div key={d}>{d}</div>)}
      </div>
      <div className="sc-grid-scroll">
        <div className="sc-month">
          {cells.map((d) => {
            const list = bookings
              .filter((b) => sameDay(new Date(b.start_at), d))
              .sort((a, b) => a.start_at.localeCompare(b.start_at));
            const shown = list.slice(0, 3);
            const out = d.getMonth() !== month;
            return (
              <div
                key={d.toISOString()}
                className={`sc-cell${out ? " sc-cell--out" : ""}${sameDay(d, today) ? " sc-cell--today" : ""}`}
              >
                <span className="sc-daynum">{d.getDate()}</span>
                {shown.map((b) => (
                  <EventChip key={b.id} b={b} conflict={conflicts.has(b.id)} color={colorFor(b)} onOpen={onOpen} />
                ))}
                {list.length > shown.length && (
                  // Opens the DAY, not the fourth booking. Pointing "+2 more" at one
                  // arbitrary event looks like a list and behaves like a shortcut.
                  <button type="button" className="sc-more" onClick={() => onOpenDay(d, list)}>
                    +{list.length - shown.length} more
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}

function AgendaView({ cursor, bookings, conflicts, phase, colorFor, onOpen }: ViewProps & { phase: string }) {
  const sorted = useMemo(
    () => [...bookings].sort((a, b) => a.start_at.localeCompare(b.start_at)),
    [bookings],
  );
  const grouped = useMemo(() => {
    const map = new Map<string, SoloBooking[]>();
    for (const b of sorted) {
      const key = new Date(b.start_at).toDateString();
      const list = map.get(key);
      if (list) list.push(b); else map.set(key, [b]);
    }
    return [...map.entries()];
  }, [sorted]);

  if (phase === "ready" && grouped.length === 0) {
    return (
      <div className="sc-state">
        <CalendarDays aria-hidden="true" />
        <h3>Nothing booked in the next two weeks</h3>
        <p>Appointments booked through this account&rsquo;s booking service appear here as soon as they exist.</p>
      </div>
    );
  }
  return (
    <div className="sc-grid-scroll">
      <div style={{ padding: "10px 14px 22px", display: "grid", gap: 14 }}>
        {grouped.map(([day, list]) => (
          <section key={day} style={{ display: "grid", gap: 5, minWidth: 0 }}>
            <h3 style={{ font: "600 var(--pg-t-label) var(--pg-font-ui)", letterSpacing: ".09em", textTransform: "uppercase", color: "var(--pg-muted)" }}>
              {new Date(day).toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" })}
            </h3>
            {list.map((b) => (
              <EventChip key={b.id} b={b} conflict={conflicts.has(b.id)} color={colorFor(b)} onOpen={onOpen} />
            ))}
          </section>
        ))}
      </div>
    </div>
  );
}

/* --------------------------------------------------------------- creating --- */

function CreateDrawer({ calendars, onClose, onCreate }: {
  calendars: { id: string; title: string }[];
  onClose: () => void;
  onCreate: (input: {
    title: string; startAt: Date; durationMinutes: number;
    calendarId: string; guestName: string | null; blocked: boolean;
  }) => Promise<{ ok: boolean; message?: string }>;
}) {
  const [title, setTitle] = useState("");
  const [date, setDate] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  });
  const [time, setTime] = useState("09:00");
  const [duration, setDuration] = useState(30);
  const [calendarId, setCalendarId] = useState(UNASSIGNED_CALENDAR);
  const [guest, setGuest] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const submit = async () => {
    setBusy(true); setMsg(null);
    const startAt = new Date(`${date}T${time}`);
    if (Number.isNaN(startAt.getTime())) { setBusy(false); setMsg("That date and time could not be read."); return; }
    const res = await onCreate({
      title, startAt, durationMinutes: duration, calendarId,
      guestName: guest || null, blocked: !title.trim(),
    });
    setBusy(false);
    if (!res.ok) { setMsg(res.message ?? "That appointment was refused."); return; }
    onClose();
  };

  return (
    <Drawer
      title="New appointment"
      sub="Saved to this account's booking service"
      onClose={onClose}
      foot={
        <>
          <button type="button" className="sc-btn sc-btn--gold" onClick={() => void submit()} disabled={busy}>
            {busy ? "Saving…" : "Save appointment"}
          </button>
          <button type="button" className="sc-btn" onClick={onClose} disabled={busy}>Cancel</button>
        </>
      }
    >
      {msg && <div className="sc-msg sc-msg--bad">{msg}</div>}
      <div className="sc-field">
        <label htmlFor="sc-title">Title</label>
        <input id="sc-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Leave empty to block the time" />
      </div>
      <div className="sc-field">
        <label htmlFor="sc-date">Date</label>
        <input id="sc-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </div>
      <div className="sc-field">
        <label htmlFor="sc-time">Start</label>
        <input id="sc-time" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
      </div>
      <div className="sc-field">
        <label htmlFor="sc-dur">Length</label>
        <select id="sc-dur" value={duration} onChange={(e) => setDuration(Number(e.target.value))}>
          {[15, 30, 45, 60, 90].map((m) => <option key={m} value={m}>{m} minutes</option>)}
        </select>
      </div>
      <div className="sc-field">
        <label htmlFor="sc-cal">Calendar</label>
        <select id="sc-cal" value={calendarId} onChange={(e) => setCalendarId(e.target.value)}>
          <option value={UNASSIGNED_CALENDAR}>Unassigned</option>
          {calendars.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
        </select>
      </div>
      <div className="sc-field">
        <label htmlFor="sc-guest">Guest name</label>
        <input id="sc-guest" value={guest} onChange={(e) => setGuest(e.target.value)} placeholder="Optional" />
      </div>
      <p className="sc-note">
        The booking service refuses an appointment that overlaps one you already hold, so a clash
        is reported rather than double-booked.
      </p>
    </Drawer>
  );
}

export default SoloCalendarWorkspace;
