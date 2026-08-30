/**
 * The calendar configuration contract — one home for the shape a bookable
 * calendar has, how a stored jsonb column is coerced back into it, and how a
 * draft becomes a persisted patch.
 *
 * This model was NOT invented here. It is lifted, unchanged in behaviour, out
 * of `components/admin/calendar/CalendarsPanel.tsx`, which has carried it since
 * the calendar builder shipped. It moved because a second surface now needs it
 * (Settings → Connections → Calendars), and two copies of a validation rule is
 * how a booking page silently starts behaving differently depending on which
 * screen last saved it (§18 — one capability, one home).
 *
 * Everything here is pure: no React, no Supabase client, no toasts. That is
 * deliberate — it makes the rules testable on their own, and it lets the
 * legacy panel and the Solo surface import the same functions rather than each
 * keeping a version that drifts.
 */

/* ------------------------------------------------------------------ types */

/** How round-robin picks which host takes each new booking (§9 tenant-scoped). */
export interface AssignmentStrategy {
  mode: "balanced" | "availability" | "priority";
}

export interface LocationOption {
  type: string;
  value: string | null;
}

/** Owner-authored booking-form questions (tenant-scoped, §9). */
export interface IntakeQuestion {
  id: string;
  label: string;
  type: string;
  required: boolean;
  options: string[];
  placeholder: string | null;
}

/**
 * Appointment types — a "service menu" on one booking page (tenant-scoped, §9).
 * price_cents is optional (§2): a service can be free, or not collected here.
 */
export interface AppointmentType {
  id: string;
  name: string;
  description: string;
  duration_min: number;
  price_cents: number | null;
}

export interface DateWindow {
  start: string;
  end: string;
}

/** Date-specific overrides — block a day, or set special hours. */
export interface DateOverride {
  date: string;
  blocked: boolean;
  windows: DateWindow[];
}

/**
 * `to` = who a reminder targets: guest (default), host, or both. subject/body
 * are optional owner-authored copy with {{merge_fields}}; empty means the
 * engine's built-in default is used.
 */
export interface NotifyReminder {
  channel: string;
  offset_min: number;
  to?: string;
  subject?: string;
  body?: string;
}

/**
 * A booking-lifecycle trigger: an opt-in message on created / cancelled /
 * rescheduled, beyond the built-in emails. An absent array sends nothing extra.
 */
export interface NotifyLifecycle {
  event: "created" | "cancelled" | "rescheduled";
  channel: string;
  to: string;
  subject?: string;
  body?: string;
}

/** followup_offset_min = minutes AFTER the meeting ends to send the follow-up. */
export interface NotifyConfig {
  confirm_guest: boolean;
  confirm_host: boolean;
  reminders: NotifyReminder[];
  followup_guest: boolean;
  followup_offset_min: number;
  followup_subject?: string;
  followup_body?: string;
  lifecycle: NotifyLifecycle[];
}

export type DayWindow = { day: number; start: string; end: string };

export interface CalendarRow {
  id: string;
  tenant_id: string | null;
  slug: string;
  type: string;
  title: string | null;
  description: string | null;
  logo_url: string | null;
  accent: string | null;
  color: string | null;
  duration_min: number;
  buffer_before_min: number;
  buffer_after_min: number;
  min_notice_min: number;
  booking_horizon_days: number;
  capacity: number;
  redirect_url: string;
  timezone: string;
  availability_json: DayWindow[] | null;
  enabled: boolean;
  group_id: string | null;
  created_by: string | null;
  theme: string;
  subtitle: string | null;
  show_company_name: boolean;
  location_type: string;
  location_value: string | null;
  location_options: LocationOption[];
  intake_questions: IntakeQuestion[];
  appointment_types: AppointmentType[];
  date_overrides: DateOverride[];
  notify_config: NotifyConfig;
  assignment_strategy: AssignmentStrategy;
}

export interface CalendarGroup {
  id: string;
  name: string;
  tenant_id: string | null;
}

/* -------------------------------------------------------------- constants */

export const SELECT_COLS =
  "id, tenant_id, slug, type, title, description, logo_url, accent, color, duration_min, buffer_before_min, buffer_after_min, min_notice_min, booking_horizon_days, capacity, redirect_url, timezone, availability_json, enabled, group_id, created_by, theme, subtitle, show_company_name, location_type, location_value, location_options, intake_questions, appointment_types, date_overrides, notify_config, assignment_strategy";

export const ASSIGNMENT_MODES: { value: AssignmentStrategy["mode"]; label: string; desc: string }[] = [
  { value: "balanced", label: "Balanced", desc: "Spread evenly — the next booking goes to the free host with the fewest upcoming." },
  { value: "availability", label: "First available", desc: "Fill the earliest open slot across the team, whoever it belongs to." },
  { value: "priority", label: "By priority", desc: "Send to the top of the order first; fall to the next only when they're booked." },
];

export const INTAKE_TYPES: { type: string; label: string; hasOptions?: boolean }[] = [
  { type: "text", label: "Short answer" },
  { type: "textarea", label: "Paragraph" },
  { type: "select", label: "Dropdown", hasOptions: true },
  { type: "radio", label: "Single choice", hasOptions: true },
  { type: "checkbox", label: "Multiple choice", hasOptions: true },
  { type: "phone", label: "Phone" },
  { type: "url", label: "Website / URL" },
  { type: "number", label: "Number" },
];

export const DEFAULT_NOTIFY: NotifyConfig = {
  confirm_guest: true,
  confirm_host: true,
  reminders: [{ channel: "email", offset_min: 1440 }],
  followup_guest: false,
  followup_offset_min: 60,
  lifecycle: [],
};

/** Merge fields the owner can drop into any subject/body, rendered server-side. */
export const MERGE_FIELDS: { token: string; label: string }[] = [
  { token: "{{guest_name}}", label: "Guest name" },
  { token: "{{when}}", label: "Date & time" },
  { token: "{{where}}", label: "Location" },
  { token: "{{service}}", label: "Service" },
  { token: "{{title}}", label: "Session title" },
];

/** Who a reminder or lifecycle message reaches. */
export const NOTIFY_TARGETS = [
  { value: "guest", label: "Guest" },
  { value: "host", label: "Host" },
  { value: "both", label: "Both" },
];

export const LIFECYCLE_EVENTS: { value: NotifyLifecycle["event"]; label: string; hint: string }[] = [
  { value: "created", label: "When a booking is made", hint: "Sends the moment someone books — on top of the confirmation above." },
  { value: "cancelled", label: "When a booking is cancelled", hint: "Sends when a guest cancels via their manage link." },
  { value: "rescheduled", label: "When a booking is moved", hint: "Sends when a guest reschedules to a new time." },
];

/**
 * How a reminder reaches the guest. SMS and Both need a phone on file plus a
 * texting connection on the workspace; email always sends. Coaching-generic (§2).
 */
export const REMINDER_CHANNELS = [
  { value: "email", label: "Email" },
  { value: "sms", label: "SMS" },
  { value: "both", label: "Both" },
];

export const REMINDER_OFFSETS = [
  { min: 15, label: "15 min before" },
  { min: 60, label: "1 hour before" },
  { min: 120, label: "2 hours before" },
  { min: 1440, label: "1 day before" },
  { min: 2880, label: "2 days before" },
  { min: 10080, label: "1 week before" },
];

export const FOLLOWUP_OFFSETS = [
  { min: 0, label: "Right after it ends" },
  { min: 60, label: "1 hour after" },
  { min: 180, label: "3 hours after" },
  { min: 1440, label: "1 day after" },
  { min: 2880, label: "2 days after" },
  { min: 10080, label: "1 week after" },
];

/**
 * Meeting methods the owner can offer. Enable one and it is fixed; enable
 * several and the invitee chooses on the booking page. in_person and custom
 * carry a value field.
 */
export const MEETING_METHODS = [
  { type: "google_meet", label: "Google Meet", needsValue: false, placeholder: "" },
  { type: "zoom", label: "Zoom", needsValue: false, placeholder: "" },
  { type: "phone", label: "Phone call", needsValue: false, placeholder: "" },
  { type: "in_person", label: "In person", needsValue: true, placeholder: "123 Main St, Suite 200" },
  { type: "custom", label: "Custom", needsValue: true, placeholder: "https://… or instructions" },
];

export const TYPES = [
  { value: "personal", label: "One-on-one", hint: "A single host meets one guest at a time." },
  { value: "event", label: "Group / class", hint: "One session, many attendees (webinar, class)." },
  { value: "round_robin", label: "Round-robin", hint: "Rotate bookings across a team." },
  { value: "collective", label: "Collective", hint: "Several hosts must all attend." },
];

export const TYPE_LABEL: Record<string, string> = Object.fromEntries(TYPES.map((t) => [t.value, t.label]));

/**
 * Brand-forward palette — gold and indigo lead (§6), then distinct hues so many
 * calendars stay visually separable in the agenda.
 */
export const SWATCHES = [
  "#EBB94C", "#7A67E8", "#2DD4BF", "#F472B6", "#60A5FA",
  "#34D399", "#FB923C", "#A78BFA", "#F87171", "#94A3B8",
];

export const COMMON_TZ = [
  "America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles",
  "America/Phoenix", "America/Anchorage", "Pacific/Honolulu", "Europe/London", "UTC",
];

export const DURATION_PRESETS = [15, 30, 45, 60, 90];

/** How far out guests may book. Tenant-authored per calendar (§9). */
export const BOOKING_HORIZON_PRESETS: { days: number; label: string }[] = [
  { days: 7, label: "1 week out" },
  { days: 14, label: "2 weeks out" },
  { days: 30, label: "1 month out" },
  { days: 60, label: "2 months out" },
  { days: 90, label: "3 months out" },
  { days: 180, label: "6 months out" },
  { days: 365, label: "1 year out" },
  { days: 730, label: "Open — 2 years out" },
];

export const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export type AvailState = Record<number, { enabled: boolean; start: string; end: string }>;

export const DEFAULT_AVAIL: AvailState = Object.fromEntries(
  [0, 1, 2, 3, 4, 5, 6].map((d) => [d, { enabled: d >= 1 && d <= 5, start: "09:00", end: "17:00" }]),
);

/* ------------------------------------------------------------ normalizers */

/** Trim to a clean optional string (undefined when empty) so we never persist "". */
export function optStr(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() ? v : undefined;
}

export function normalizeAssignmentStrategy(raw: unknown): AssignmentStrategy {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const mode = o.mode === "availability" || o.mode === "priority" ? o.mode : "balanced";
  return { mode };
}

export function normalizeIntake(raw: unknown): IntakeQuestion[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((q, i) => {
    const o = (q && typeof q === "object" ? q : {}) as Record<string, unknown>;
    return {
      id: String(o.id ?? `q${i}`),
      label: String(o.label ?? ""),
      type: INTAKE_TYPES.some((t) => t.type === o.type) ? String(o.type) : "text",
      required: o.required === true,
      options: Array.isArray(o.options) ? o.options.map((x) => String(x)) : [],
      placeholder: typeof o.placeholder === "string" ? o.placeholder : null,
    };
  });
}

export function normalizeAppointmentTypes(raw: unknown): AppointmentType[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((t, i) => {
    const o = (t && typeof t === "object" ? t : {}) as Record<string, unknown>;
    const cents = Number(o.price_cents);
    return {
      id: String(o.id ?? `t${i}`),
      name: String(o.name ?? ""),
      description: typeof o.description === "string" ? o.description : "",
      duration_min: Math.max(5, Math.min(1440, Number(o.duration_min) || 30)),
      price_cents: Number.isFinite(cents) && cents > 0 ? Math.round(cents) : null,
    };
  });
}

export function normalizeDateOverrides(raw: unknown): DateOverride[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((o) => {
      const r = (o && typeof o === "object" ? o : {}) as Record<string, unknown>;
      return {
        date: String(r.date ?? ""),
        blocked: r.blocked === true,
        windows: Array.isArray(r.windows)
          ? r.windows.map((w) => {
              const ww = (w && typeof w === "object" ? w : {}) as Record<string, unknown>;
              return { start: String(ww.start ?? "09:00"), end: String(ww.end ?? "17:00") };
            })
          : [],
      };
    })
    .filter((o) => /^\d{4}-\d{2}-\d{2}$/.test(o.date));
}

/** Coerce a possibly-partial or legacy notify_config jsonb into a safe shape. */
export function normalizeNotify(raw: unknown): NotifyConfig {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const reminders = Array.isArray(o.reminders)
    ? (o.reminders as unknown[])
        .map((r) => (r && typeof r === "object" ? r : {}) as Record<string, unknown>)
        .filter((r) => typeof r.offset_min === "number")
        .map((r) => ({
          channel: typeof r.channel === "string" ? r.channel : "email",
          offset_min: r.offset_min as number,
          to: r.to === "host" || r.to === "both" ? (r.to as string) : "guest",
          subject: optStr(r.subject),
          body: optStr(r.body),
        }))
    : [...DEFAULT_NOTIFY.reminders];
  const lifecycle = Array.isArray(o.lifecycle)
    ? (o.lifecycle as unknown[])
        .map((l) => (l && typeof l === "object" ? l : {}) as Record<string, unknown>)
        .filter((l) => l.event === "created" || l.event === "cancelled" || l.event === "rescheduled")
        .map((l) => ({
          event: l.event as NotifyLifecycle["event"],
          channel: l.channel === "sms" || l.channel === "both" ? (l.channel as string) : "email",
          to: l.to === "host" || l.to === "both" ? (l.to as string) : "guest",
          subject: optStr(l.subject),
          body: optStr(l.body),
        }))
    : [];
  return {
    confirm_guest: o.confirm_guest !== false,
    confirm_host: o.confirm_host !== false,
    reminders,
    followup_guest: o.followup_guest === true,
    followup_offset_min:
      typeof o.followup_offset_min === "number" ? o.followup_offset_min : DEFAULT_NOTIFY.followup_offset_min,
    followup_subject: optStr(o.followup_subject),
    followup_body: optStr(o.followup_body),
    lifecycle,
  };
}

export function normalizeLocationOptions(raw: unknown): LocationOption[] {
  const arr = Array.isArray(raw) ? raw : [];
  const out = arr
    .map((o) => ((o && typeof o === "object" ? o : {}) as Record<string, unknown>))
    .map((o) => ({ type: String(o.type ?? ""), value: typeof o.value === "string" ? o.value : null }))
    .filter((o) => MEETING_METHODS.some((m) => m.type === o.type));
  return out.length ? out : [{ type: "google_meet", value: null }];
}

/* ----------------------------------------------------------------- ids etc */

export function slugify(s: string): string {
  return s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
}

export function randomSuffix(): string {
  // Fixed-length, collision-resistant. crypto.randomUUID is available in every
  // browser we target; Math.random is only a last-resort fallback.
  const raw =
    typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID().replace(/-/g, "")
      : Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
  return raw.slice(0, 8);
}

export function newId(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}${Date.now().toString(36).slice(-4)}`;
}

export function newQuestionId(): string {
  return `q_${Math.random().toString(36).slice(2, 9)}${Date.now().toString(36).slice(-4)}`;
}

export function initials(name: string | null): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase() || "?";
}

/* --------------------------------------------------------- availability io */

export function availToJson(a: AvailState): DayWindow[] {
  return [0, 1, 2, 3, 4, 5, 6]
    .filter((d) => a[d]?.enabled && a[d].start < a[d].end)
    .map((d) => ({ day: d, start: a[d].start, end: a[d].end }));
}

export function jsonToAvail(json: DayWindow[] | null | undefined): AvailState {
  const next: AvailState = JSON.parse(JSON.stringify(DEFAULT_AVAIL));
  if (Array.isArray(json) && json.length) {
    for (const d of [0, 1, 2, 3, 4, 5, 6]) next[d].enabled = false;
    for (const w of json) {
      if (w && typeof w.day === "number") next[w.day] = { enabled: true, start: w.start, end: w.end };
    }
  }
  return next;
}

/* ------------------------------------------------------------ the patch */

/**
 * Everything the builder edits, in the shape `calendars` stores it.
 * `availability_json` is supplied separately because the editor holds it as a
 * per-day map rather than the array the column wants.
 */
export interface CalendarDraft {
  type: string;
  title: string;
  description: string | null;
  color: string | null;
  accent: string | null;
  logo_url: string | null;
  duration_min: number;
  buffer_before_min: number;
  buffer_after_min: number;
  min_notice_min: number;
  booking_horizon_days: number;
  capacity: number;
  redirect_url: string;
  timezone: string;
  group_id: string | null;
  theme: string;
  subtitle: string;
  show_company_name: boolean;
  location_options: LocationOption[];
  intake_questions: IntakeQuestion[];
  appointment_types: AppointmentType[];
  date_overrides: DateOverride[];
  notify_config: NotifyConfig;
  assignment_strategy: AssignmentStrategy;
}

/**
 * Turn a draft into the row patch, applying every clamp and drop rule.
 *
 * The drops are not tidying — each one prevents a booking page that cannot be
 * booked. A choice question with no options is unanswerable; a service with no
 * name is unpickable; a non-blocked date override with no window silently
 * closes the day. Persisting any of them produces a page a guest gets stuck on.
 */
export function buildCalendarPatch(draft: CalendarDraft, avail: AvailState) {
  return {
    type: draft.type,
    title: (draft.title ?? "").trim(),
    description: draft.description,
    color: draft.color,
    accent: draft.accent || draft.color,
    logo_url: draft.logo_url,
    duration_min: Math.max(5, draft.duration_min || 30),
    buffer_before_min: Math.max(0, draft.buffer_before_min || 0),
    buffer_after_min: Math.max(0, draft.buffer_after_min || 0),
    min_notice_min: Math.max(0, draft.min_notice_min || 0),
    booking_horizon_days: Math.min(730, Math.max(1, draft.booking_horizon_days || 60)),
    capacity: Math.max(1, Math.round(draft.capacity) || 8),
    redirect_url: (draft.redirect_url ?? "").trim() || null,
    timezone: draft.timezone,
    availability_json: availToJson(avail),
    group_id: draft.group_id,
    theme: draft.theme === "dark" ? "dark" : "light",
    subtitle: (draft.subtitle ?? "").trim() || null,
    show_company_name: draft.show_company_name,
    location_options: draft.location_options.length ? draft.location_options : [{ type: "phone", value: null }],
    // Keep the legacy single columns in sync: 1 method → that method; several → ask_invitee.
    location_type: draft.location_options.length > 1 ? "ask_invitee" : (draft.location_options[0]?.type ?? "phone"),
    location_value: draft.location_options.length === 1 ? (draft.location_options[0]?.value ?? null) : null,
    intake_questions: draft.intake_questions
      .map((q) => {
        const isChoice = !!INTAKE_TYPES.find((t) => t.type === q.type)?.hasOptions;
        return {
          ...q,
          label: q.label.trim(),
          options: isChoice ? q.options.map((o) => o.trim()).filter(Boolean) : [],
          placeholder: (q.placeholder ?? "").trim() || null,
          _isChoice: isChoice,
        };
      })
      .filter((q) => q.label.length > 0 && !(q._isChoice && q.options.length === 0))
      .map(({ _isChoice, ...q }) => q),
    appointment_types: draft.appointment_types
      .map((t) => ({
        id: t.id,
        name: t.name.trim(),
        description: (t.description ?? "").trim(),
        duration_min: Math.max(5, Math.min(1440, t.duration_min || 30)),
        price_cents: t.price_cents != null && t.price_cents > 0 ? Math.round(t.price_cents) : null,
      }))
      .filter((t) => t.name.length > 0),
    date_overrides: draft.date_overrides
      .map((o) => ({
        date: o.date,
        blocked: o.blocked,
        windows: o.blocked
          ? []
          : o.windows.filter(
              (w) => /^\d{2}:\d{2}$/.test(w.start) && /^\d{2}:\d{2}$/.test(w.end) && w.end > w.start,
            ),
      }))
      .filter((o) => /^\d{4}-\d{2}-\d{2}$/.test(o.date) && (o.blocked || o.windows.length > 0)),
    notify_config: draft.notify_config,
    assignment_strategy: draft.assignment_strategy,
  };
}

/** Hydrate a fetched row into the draft the builder edits. */
export function draftFromRow(c: CalendarRow): CalendarDraft {
  return {
    type: c.type,
    title: c.title ?? "",
    description: c.description,
    color: c.color,
    accent: c.accent,
    logo_url: c.logo_url,
    duration_min: c.duration_min,
    buffer_before_min: c.buffer_before_min,
    buffer_after_min: c.buffer_after_min,
    min_notice_min: c.min_notice_min,
    booking_horizon_days: c.booking_horizon_days ?? 60,
    capacity: c.capacity ?? 8,
    redirect_url: c.redirect_url ?? "",
    timezone: c.timezone,
    group_id: c.group_id,
    theme: c.theme || "light",
    subtitle: c.subtitle ?? "",
    show_company_name: c.show_company_name !== false,
    location_options: normalizeLocationOptions(c.location_options),
    intake_questions: normalizeIntake(c.intake_questions),
    appointment_types: normalizeAppointmentTypes(c.appointment_types),
    date_overrides: normalizeDateOverrides(c.date_overrides),
    notify_config: normalizeNotify(c.notify_config),
    assignment_strategy: normalizeAssignmentStrategy(c.assignment_strategy),
  };
}

/** The public booking address for a slug. */
export function bookingUrl(slug: string): string {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  return `${origin}/book/${slug}`;
}
