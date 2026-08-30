import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Real calendar reads/writes for the Solo-native Calendar surface.
 *
 * This is a SECOND CALLER of the same seams CalendarAdmin already uses — never a
 * second data model. Every read is scoped by the SERVER-RESOLVED `activeTenantId`
 * the adapter passes down (§9); no tenant identifier is accepted from the URL or
 * the request body. `list_team_bookings` is itself tenant-isolated and
 * overlap-aware, and `admin_set_booking_status` performs the change server-side
 * so a refusal is reported truthfully rather than silently no-oping (§13).
 */

export type ViewMode = "week" | "month" | "agenda";

/** Mirrors the shape `list_team_bookings` returns. Kept structural, not imported,
 *  so this hook does not depend on the 1,230-line admin page's module graph. */
export interface SoloBooking {
  id: string;
  title: string;
  start_at: string;
  end_at: string;
  status: string;
  source: string;
  guest_name: string | null;
  guest_email: string | null;
  guest_phone: string | null;
  calendar_id: string | null;
  location_type: string | null;
  location_value: string | null;
  notes: string | null;
  booking_kind: string;
  capacity: number | null;
  host_user_id: string | null;
  host_full_name: string | null;
  timezone: string | null;
  /** Both are returned by `list_team_bookings` and were previously discarded.
   *  `intake_answers` is keyed by question id; the labels live on the calendar. */
  intake_answers: Record<string, unknown> | null;
  appointment_type: { name?: string; duration_min?: number } | null;
}

/** One stored working window. `day` is 0=Sun..6=Sat, times are "HH:MM" local to
 *  the calendar's own timezone. Shape mirrors what `public-booking` parses. */
export interface DayWindow { day: number; start: string; end: string }

/** A stored exception for one date: either the whole day off, or replacement windows. */
export interface DateOverride { date: string; blocked: boolean; windows: { start: string; end: string }[] }

/** A single reminder row out of `calendars.notify_config.reminders`. The channel
 *  vocabulary is the sender's own (`process-booking-notifications`): "email",
 *  "sms", or "both"; recipient is "guest" (the column default), "host" or "both". */
export interface CalendarReminder {
  channel: "email" | "sms" | "both";
  offset_min: number;
  to: "guest" | "host" | "both";
}
/** `calendars.notify_config` — Calendar-owned appointment communication: WHETHER a
 *  confirmation goes out and WHEN a reminder fires. It does NOT record whether an
 *  SMS-capable channel is connected or permitted; that lives with the tenant's
 *  phone identity, is not read here, and must never be inferred from this row. */
export interface CalendarNotifyConfig {
  confirm_guest: boolean;
  confirm_host: boolean;
  reminders: CalendarReminder[];
}

export interface SoloCalendarMeta {
  id: string;
  title: string;
  color: string | null;
  accent: string | null;
  type: string | null;
  /** Real configuration, read straight off the `calendars` row. Every one of these
   *  is a stored column — none is defaulted here, because a default rendered as
   *  stored data is a fabrication (§13). `availability_json` in particular is NULL
   *  on every auto-provisioned calendar, and the Mon–Fri 9–5 fallback that the
   *  public booking engine applies lives in that edge function, NOT in the row. */
  slug: string | null;
  enabled: boolean | null;
  duration_min: number | null;
  buffer_before_min: number | null;
  buffer_after_min: number | null;
  min_notice_min: number | null;
  booking_horizon_days: number | null;
  capacity: number | null;
  timezone: string | null;
  location_type: string | null;
  location_value: string | null;
  /** The four jsonb columns arrive as arbitrary JSON, and are typed as such. The
   *  database guarantees they PARSE, never that they hold the shape this surface
   *  expects — a hand-edited or half-migrated row can hold anything. So every read
   *  goes through a parser below (`parseNotifyConfig` · `parseWindows` ·
   *  `parseOverrides` · `parseIntakeQuestions`) which returns the honest shape or
   *  nothing. Declaring them pre-parsed would be a lie the compiler then enforces,
   *  and the first malformed row would throw inside a render. */
  notify_config: unknown;
  availability_json: unknown;
  date_overrides: unknown;
  intake_questions: unknown;
}

/** The exact column list read from `calendars`. Kept as one constant so the select
 *  and the type cannot drift apart. */
export const CALENDAR_COLUMNS =
  "id, title, color, accent, type, slug, enabled, duration_min, buffer_before_min, buffer_after_min, min_notice_min, booking_horizon_days, capacity, timezone, location_type, location_value, notify_config, availability_json, date_overrides, intake_questions" as const;

export const UNASSIGNED_CALENDAR = "__unassigned__";
/** The one fallback tint, used only when a calendar stores no colour of its own. */
export const DEFAULT_CALENDAR_COLOR = "#7A67E8";

export function startOfDay(d: Date) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
export function addDays(d: Date, n: number) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
export function startOfWeek(d: Date) { const x = startOfDay(d); return addDays(x, -x.getDay()); }

export function rangeFor(view: ViewMode, cursor: Date): [Date, Date] {
  if (view === "agenda") { const s = startOfDay(cursor); return [s, addDays(s, 14)]; }
  if (view === "week") { const s = startOfWeek(cursor); return [s, addDays(s, 7)]; }
  const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  const s = startOfWeek(first);
  return [s, addDays(s, 42)];
}

/**
 * The range label.
 *
 * Written out field-by-field rather than handing Intl a `{day, year}` skeleton.
 * That skeleton has no CLDR pattern, so ICU falls back to emitting the literal
 * field name — which is exactly how the shipped label rendered
 * "Aug 23 – 2026 (day: 29)" for any week inside a single month.
 */
export function rangeLabel(view: ViewMode, cursor: Date): string {
  if (view === "month") {
    return cursor.toLocaleDateString(undefined, { month: "long", year: "numeric" });
  }
  const [s, endExclusive] = rangeFor(view, cursor);
  const e = addDays(endExclusive, -1);
  const year = e.getFullYear();
  const sMonth = s.toLocaleDateString(undefined, { month: "short" });
  const eMonth = e.toLocaleDateString(undefined, { month: "short" });
  return s.getMonth() === e.getMonth()
    ? `${sMonth} ${s.getDate()} – ${e.getDate()}, ${year}`
    : `${sMonth} ${s.getDate()} – ${eMonth} ${e.getDate()}, ${year}`;
}

/** A stable, well-spread hue per host. Hosts store no colour of their own, so
 *  colour-by-host derives one; fixed S/L keeps it AA-legible in both themes. */
export function hostColor(id: string | null): string {
  if (!id) return DEFAULT_CALENDAR_COLOR;
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return `hsl(${(h % 24) * 15} 62% 48%)`;
}

/** A booking that no longer occupies time cannot collide with anything. */
function occupiesTime(b: SoloBooking) {
  return b.status !== "cancelled" && b.status !== "no_show";
}

/**
 * REAL conflict detection: two bookings collide when they share a host and their
 * [start, end) intervals actually overlap. Nothing here is inferred from a title,
 * a duration heuristic, or a hardcoded date — an empty book yields zero conflicts.
 */
export function findConflicts(bookings: SoloBooking[]): Set<string> {
  const conflicted = new Set<string>();
  const byHost = new Map<string, SoloBooking[]>();
  for (const b of bookings) {
    if (!occupiesTime(b)) continue;
    const key = b.host_user_id ?? "__unhosted__";
    const list = byHost.get(key);
    if (list) list.push(b); else byHost.set(key, [b]);
  }
  for (const list of byHost.values()) {
    const sorted = [...list].sort(
      (a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime(),
    );
    for (let i = 0; i < sorted.length; i++) {
      const a = sorted[i];
      const aEnd = new Date(a.end_at).getTime();
      for (let j = i + 1; j < sorted.length; j++) {
        const b = sorted[j];
        if (new Date(b.start_at).getTime() >= aEnd) break; // sorted — nothing later can overlap
        conflicted.add(a.id);
        conflicted.add(b.id);
      }
    }
  }
  return conflicted;
}

/* ------------------------------------------------------------ availability --- */

const TIME = /^([01]\d|2[0-3]):([0-5]\d)$/;

/**
 * Parse stored working windows, or return null when the calendar stores none.
 *
 * NULL IS LOAD-BEARING AND MUST SURVIVE. Every auto-provisioned calendar has
 * `availability_json = NULL`, and the Mon–Fri 09:00–17:00 that public booking
 * applies lives in THAT EDGE FUNCTION, not in the row. Substituting it here would
 * paint stored hours a tenant never set — a fabrication in exactly the shape §13
 * forbids. An unconfigured calendar therefore reads as unconfigured.
 */
export function parseWindows(raw: unknown): DayWindow[] | null {
  if (!Array.isArray(raw)) return null;
  const out: DayWindow[] = [];
  for (const w of raw) {
    if (!w || typeof w !== "object") continue;
    const { day, start, end } = w as Record<string, unknown>;
    if (typeof day !== "number" || day < 0 || day > 6) continue;
    if (typeof start !== "string" || !TIME.test(start)) continue;
    if (typeof end !== "string" || !TIME.test(end)) continue;
    if (end <= start) continue;
    out.push({ day, start, end });
  }
  // A present-but-unusable value is not the same as an absent one, but neither is
  // it hours we can draw; both report as "nothing stored we can render".
  return out.length ? out : null;
}

/** Reads `calendars.intake_questions` — the labelled questions a booking's
 *  `intake_answers` keys refer to. Rows without a usable id/label are dropped
 *  rather than rendered as a blank question. */
export function parseIntakeQuestions(raw: unknown): { id: string; label: string }[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((q) => {
    if (!q || typeof q !== "object") return [];
    const { id, label } = q as Record<string, unknown>;
    return typeof id === "string" && typeof label === "string" ? [{ id, label }] : [];
  });
}

/** Reads `calendars.notify_config`. Returns null when the row stores nothing usable
 *  so the surface can say so, rather than rendering the column DEFAULT as if the
 *  owner had chosen it (§13). Unknown channels/recipients fall back to the sender's
 *  own coercion ("email" / "guest") so what is shown matches what would actually go. */
export function parseNotifyConfig(raw: unknown): CalendarNotifyConfig | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  const reminders: CalendarReminder[] = Array.isArray(o.reminders)
    ? o.reminders.flatMap((r) => {
        if (!r || typeof r !== "object") return [];
        const { channel, offset_min, to } = r as Record<string, unknown>;
        if (typeof offset_min !== "number" || !Number.isFinite(offset_min)) return [];
        const ch = channel === "sms" || channel === "both" ? channel : "email";
        const rcpt = to === "host" || to === "both" ? to : "guest";
        return [{ channel: ch as CalendarReminder["channel"], offset_min, to: rcpt as CalendarReminder["to"] }];
      })
    : [];
  if (typeof o.confirm_guest !== "boolean" && typeof o.confirm_host !== "boolean" && reminders.length === 0) {
    return null;
  }
  return { confirm_guest: o.confirm_guest === true, confirm_host: o.confirm_host === true, reminders };
}

/** True when this calendar's own reminder config asks for SMS. This is the ONLY
 *  condition under which the surface offers the Connections remediation path —
 *  Calendar decides that an SMS reminder should happen; whether an SMS channel is
 *  connected and permitted is decided elsewhere and is not read here. */
export function wantsSms(cfg: CalendarNotifyConfig | null): boolean {
  return !!cfg?.reminders.some((r) => r.channel === "sms" || r.channel === "both");
}

export function parseOverrides(raw: unknown): DateOverride[] {
  if (!Array.isArray(raw)) return [];
  const out: DateOverride[] = [];
  for (const o of raw) {
    if (!o || typeof o !== "object") continue;
    const { date, blocked, windows } = o as Record<string, unknown>;
    if (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    const w = Array.isArray(windows)
      ? windows.flatMap((x) => {
          const s = (x as Record<string, unknown>)?.start;
          const e = (x as Record<string, unknown>)?.end;
          return typeof s === "string" && typeof e === "string" && TIME.test(s) && TIME.test(e) && e > s
            ? [{ start: s, end: e }]
            : [];
        })
      : [];
    out.push({ date, blocked: blocked === true, windows: w });
  }
  return out;
}

function isoDate(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export interface DayAvailability {
  /** false when the calendar stores no usable hours — render as unconfigured, never as 9–5. */
  configured: boolean;
  /** true when a stored date override marks the whole day off. */
  blocked: boolean;
  windows: { start: string; end: string }[];
}

/**
 * The stored hours for one calendar on one date: a date override wins over the
 * weekly pattern, exactly as the booking engine resolves it.
 */
export function availabilityFor(cal: SoloCalendarMeta, day: Date): DayAvailability {
  const windows = parseWindows(cal.availability_json);
  const override = parseOverrides(cal.date_overrides).find((o) => o.date === isoDate(day));
  if (override) {
    if (override.blocked) return { configured: true, blocked: true, windows: [] };
    if (override.windows.length) return { configured: true, blocked: false, windows: override.windows };
  }
  if (!windows) return { configured: false, blocked: false, windows: [] };
  const forDay = windows.filter((w) => w.day === day.getDay()).map(({ start, end }) => ({ start, end }));
  return { configured: true, blocked: false, windows: forDay };
}

/** "09:00" -> 9.5 for 09:30. Used to place shading on the hour grid. */
export function hourOf(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h + m / 60;
}

export type LoadPhase = "loading" | "ready" | "error";

export interface UseSoloCalendarResult {
  bookings: SoloBooking[];
  calendars: SoloCalendarMeta[];
  conflicts: Set<string>;
  phase: LoadPhase;
  error: string | null;
  calendarsError: string | null;
  refresh: () => void;
  setStatus: (id: string, status: string) => Promise<{ ok: boolean; message?: string }>;
  createBooking: (input: CreateBookingInput) => Promise<{ ok: boolean; message?: string }>;
  colorForBooking: (b: SoloBooking, colorBy: "calendar" | "host") => string;
}

export interface CreateBookingInput {
  title: string;
  startAt: Date;
  durationMinutes: number;
  calendarId: string;
  guestName: string | null;
  blocked: boolean;
}

export function useSoloCalendar(
  activeTenantId: string | null,
  view: ViewMode,
  cursor: Date,
): UseSoloCalendarResult {
  const [bookings, setBookings] = useState<SoloBooking[]>([]);
  const [calendars, setCalendars] = useState<SoloCalendarMeta[]>([]);
  const [phase, setPhase] = useState<LoadPhase>("loading");
  const [error, setError] = useState<string | null>(null);
  const [calendarsError, setCalendarsError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  const bookingSeq = useRef(0);
  const calendarSeq = useRef(0);

  const [from, to] = useMemo(() => rangeFor(view, cursor), [view, cursor]);
  const fromIso = from.toISOString();
  const toIso = to.toISOString();

  useEffect(() => {
    let cancelled = false;
    const seq = ++calendarSeq.current;
    // Clear first: the previous account's calendars must never linger while a new
    // one resolves (§9 — no substitution across an account switch).
    setCalendars([]);
    setCalendarsError(null);
    if (!activeTenantId) return;
    void (async () => {
      const { data, error: err } = await supabase
        .from("calendars")
        .select(CALENDAR_COLUMNS)
        .eq("tenant_id", activeTenantId);
      if (cancelled || seq !== calendarSeq.current) return;
      if (err) { setCalendarsError(err.message); return; }
      setCalendars((data as SoloCalendarMeta[] | null) ?? []);
    })();
    return () => { cancelled = true; };
  }, [activeTenantId, nonce]);

  useEffect(() => {
    let cancelled = false;
    const seq = ++bookingSeq.current;
    setPhase("loading");
    setBookings([]);
    setError(null);
    if (!activeTenantId) return;
    void (async () => {
      const { data, error: err } = await supabase.rpc("list_team_bookings" as never, {
        _from: fromIso,
        _to: toIso,
        _host_ids: null,
        _tenant_id: activeTenantId,
      } as never);
      if (cancelled || seq !== bookingSeq.current) return;
      if (err) { setError(err.message); setPhase("error"); return; }
      setBookings((data as SoloBooking[] | null) ?? []);
      setPhase("ready");
    })();
    return () => { cancelled = true; };
  }, [activeTenantId, fromIso, toIso, nonce]);

  const conflicts = useMemo(() => findConflicts(bookings), [bookings]);

  const colorForBooking = useCallback((b: SoloBooking, colorBy: "calendar" | "host") => {
    if (colorBy === "host") return hostColor(b.host_user_id);
    const cal = calendars.find((c) => c.id === b.calendar_id);
    return cal?.color || cal?.accent || DEFAULT_CALENDAR_COLOR;
  }, [calendars]);

  const setStatus = useCallback(async (id: string, status: string) => {
    // The tenant-gated RPC, not a raw UPDATE: RLS scopes a direct table write to
    // the caller's own rows, so changing another host's booking would no-op while
    // reporting success. The RPC refuses truthfully instead.
    const { error: err } = await supabase.rpc("admin_set_booking_status" as never, {
      _booking_id: id,
      _status: status,
    } as never);
    if (err) {
      return {
        ok: false,
        message: /FORBIDDEN/.test(err.message) ? "You can't change that booking." : err.message,
      };
    }
    setBookings((bs) => bs.map((b) => (b.id === id ? { ...b, status } : b)));
    return { ok: true };
  }, []);

  const createBooking = useCallback(async (input: CreateBookingInput) => {
    if (!activeTenantId) return { ok: false, message: "No authorized account is resolved." };
    const { data: auth } = await supabase.auth.getUser();
    const uid = auth?.user?.id ?? null;
    if (!uid) return { ok: false, message: "This session is not signed in." };
    const end = new Date(input.startAt.getTime() + Math.max(5, input.durationMinutes) * 60000);
    const { error: err } = await supabase.rpc("create_internal_booking" as never, {
      _title: input.blocked ? "Blocked" : input.title.trim(),
      _start_at: input.startAt.toISOString(),
      _end_at: end.toISOString(),
      _timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      _host_user_id: uid,
      _guest_name: input.guestName?.trim() || null,
      _tenant_id: activeTenantId,
      _calendar_id: input.calendarId === UNASSIGNED_CALENDAR ? null : input.calendarId,
      _status: input.blocked ? "blocked" : "scheduled",
      _source: "manual",
    } as never);
    if (err) {
      // 23505 = identical start; 23P01 = the GiST exclusion constraint (an
      // overlapping range). Both mean the same thing to the person booking.
      const code = (err as { code?: string }).code;
      return {
        ok: false,
        message: code === "23505" || code === "23P01"
          ? "Something is already on your schedule at that time."
          : err.message,
      };
    }
    setNonce((n) => n + 1);
    return { ok: true };
  }, [activeTenantId]);

  const refresh = useCallback(() => setNonce((n) => n + 1), []);

  return {
    bookings, calendars, conflicts, phase, error, calendarsError,
    refresh, setStatus, createBooking, colorForBooking,
  };
}
