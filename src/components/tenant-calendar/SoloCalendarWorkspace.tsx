import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import {
  AlertTriangle, CalendarDays, ChevronLeft, ChevronRight, Plus, Settings2, SlidersHorizontal,
  TriangleAlert, X,
} from "lucide-react";
import {
  DEFAULT_CALENDAR_COLOR, UNASSIGNED_CALENDAR, addDays, rangeFor, rangeLabel,
  startOfDay, startOfWeek, useSoloCalendar,
  type SoloBooking, type ViewMode,
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
}
/**
 * Slide-out drawer with Escape-to-close and focus restoration.
 *
 * The element that opened the drawer is captured on mount and refocused on
 * unmount, so keyboard users land back where they were instead of at the top of
 * the document.
 */
function Drawer({ title, sub, onClose, children, foot }: DrawerProps) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const restoreRef = useRef<HTMLElement | null>(null);
  const headingId = useId();

  useEffect(() => {
    restoreRef.current = document.activeElement as HTMLElement | null;
    panelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); onClose(); } };
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
        className="sc-drawer"
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
                  <button
                    key={c.id}
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
                  </button>
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

            <RailGroup title="Settings" defaultOpen={false}>
              <a className="sc-check" href={connectionsHref}>
                <Settings2 className="sc-swatch" style={{ border: 0 }} aria-hidden="true" />
                <span className="sc-label">Connections in Settings</span>
              </a>
              <p className="sc-note">
                <TruthTag state="UNAVAILABLE" /> Provider status is not inferred here. Calendar
                connections stay in one integrations home.
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
              <button type="button" className="sc-btn" onClick={() => void runStatus(detail.id, "scheduled")} disabled={detail.status === "scheduled"}>
                Mark scheduled
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
            <dt>Host</dt><dd>{detail.host_full_name || "Not recorded"}</dd>
            <dt>Guest</dt><dd>{detail.guest_name || "Not recorded"}</dd>
            <dt>Email</dt><dd>{detail.guest_email || "Not recorded"}</dd>
            <dt>Phone</dt><dd>{detail.guest_phone || "Not recorded"}</dd>
            <dt>Where</dt><dd>{detail.location_value || detail.location_type || "Not recorded"}</dd>
            <dt>Source</dt><dd>{detail.source}</dd>
            <dt>Time zone</dt><dd>{detail.timezone || "Not recorded"}</dd>
            {detail.notes && (<><dt>Notes</dt><dd>{detail.notes}</dd></>)}
          </dl>
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

function WeekView({ cursor, bookings, today, conflicts, colorFor, onOpen }: ViewProps & { today: Date }) {
  const start = startOfWeek(cursor);
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  const hours = Array.from({ length: HOUR_END - HOUR_START }, (_, i) => HOUR_START + i);
  const cols = `56px repeat(7, minmax(0, 1fr))`;

  return (
    <>
      <div className="sc-dow" style={{ gridTemplateColumns: cols }}>
        <div aria-hidden="true" />
        {days.map((d) => (
          <div key={d.toISOString()} className={sameDay(d, today) ? "sc-dow-today" : undefined}>
            {DOW[d.getDay()]}
            <span className="sc-dow-num">{d.getDate()}</span>
          </div>
        ))}
      </div>
      <div className="sc-grid-scroll">
        <div className="sc-week" style={{ gridTemplateColumns: cols }}>
          {hours.map((h) => (
            <div key={h} style={{ display: "contents" }}>
              <div className="sc-hour-label">{hourLabel(h)}</div>
              {days.map((d) => {
                const slot = bookings.filter((b) => {
                  const s = new Date(b.start_at);
                  return sameDay(s, d) && s.getHours() === h;
                });
                return (
                  <div className="sc-hour-cell" key={`${d.toISOString()}-${h}`}>
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

function MonthView({ cursor, bookings, today, conflicts, colorFor, onOpen }: ViewProps & { today: Date }) {
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
                  <button type="button" className="sc-more" onClick={() => onOpen(list[shown.length])}>
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
