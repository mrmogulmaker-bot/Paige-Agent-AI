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
  // When this preset was first published. NULL = never published (Draft). Set on
  // publish, kept across pause — so a paused preset (enabled=false, published_at
  // set) is distinguishable from a never-published draft. `enabled` stays the
  // authoritative bookability gate; this only labels the lifecycle. See
  // 20270130000000_calendar_booking_preset_lifecycle.sql.
  published_at: string | null;
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
  "id, tenant_id, slug, type, title, description, logo_url, accent, color, duration_min, buffer_before_min, buffer_after_min, min_notice_min, booking_horizon_days, capacity, redirect_url, timezone, availability_json, enabled, published_at, group_id, created_by, theme, subtitle, show_company_name, location_type, location_value, location_options, intake_questions, appointment_types, date_overrides, notify_config, assignment_strategy";

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
 * A brand-new calendar, before anyone has configured anything.
 *
 * These are working defaults, not placeholders — a weekday week, a half-hour
 * slot, a confirmation and a day-ahead reminder. A preset is created as a private
 * DRAFT (never live on creation) and only its owner's explicit Publish makes the
 * `/book/:slug` page public; these defaults exist so that when they do publish,
 * the page can take a booking without a scavenger hunt through every setting.
 */
export function blankDraft(title: string): CalendarDraft {
  return {
    type: "personal",
    title: title.trim(),
    description: null,
    color: SWATCHES[0],
    accent: SWATCHES[0],
    logo_url: null,
    duration_min: 30,
    buffer_before_min: 0,
    buffer_after_min: 0,
    min_notice_min: 240,
    booking_horizon_days: 60,
    capacity: 1,
    redirect_url: "",
    // The creator's own zone, so the first booking page is right without being
    // touched. Falls back to the shortlist's first entry where Intl is absent.
    timezone: (() => {
      try {
        return Intl.DateTimeFormat().resolvedOptions().timeZone || COMMON_TZ[0];
      } catch {
        return COMMON_TZ[0];
      }
    })(),
    group_id: null,
    theme: "light",
    subtitle: "",
    show_company_name: true,
    // Phone, not Google Meet. `public-booking` only mints a real join URL for
    // Zoom; its Google Meet branch just labels the null value "link to follow",
    // so a brand-new preset defaulting to Meet would take a booking and give the
    // guest no way in. Phone is also what `public-booking` itself falls back to
    // (`cal.location_type ?? "phone"`), so this agrees with the booking page
    // rather than quietly disagreeing with it. Connecting Google is optional and
    // the owner can pick any method in "How to meet".
    location_options: [{ type: "phone", value: null }],
    intake_questions: [],
    appointment_types: [],
    date_overrides: [],
    notify_config: { ...DEFAULT_NOTIFY, reminders: [...DEFAULT_NOTIFY.reminders] },
    assignment_strategy: { mode: "balanced" },
  };
}

/* ------------------------------------------------------ the drop predicates
 *
 * ONE definition each, used by `buildCalendarPatch` to decide what is saved AND
 * by the surface to warn that something will not be. They were previously only
 * expressed as filters inside the patch builder, and every screen that wanted to
 * warn had to re-state them by hand — which went wrong twice in this file's
 * lifetime, in the same way both times: a summary reporting an item as
 * configured moments before the save silently discarded it. A drop rule that
 * lives in two places is a drop rule that will eventually disagree with itself.
 */

/** A question with no label is unanswerable; a choice with no options is unpickable. */
export function willSaveQuestion(q: IntakeQuestion): boolean {
  const isChoice = !!INTAKE_TYPES.find((t) => t.type === q.type)?.hasOptions;
  return q.label.trim().length > 0 && !(isChoice && q.options.every((o) => !o.trim()));
}

/** A service with no name is unpickable on the booking page. */
export function willSaveAppointmentType(t: AppointmentType): boolean {
  return t.name.trim().length > 0;
}

/** A date needs a real date, and — unless it blocks the day — one usable window. */
export function willSaveDateOverride(o: DateOverride): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(o.date)) return false;
  return o.blocked || o.windows.some(willSaveWindow);
}

/** A window that ends before it starts closes the day it was meant to open. */
export function willSaveWindow(w: { start: string; end: string }): boolean {
  return /^\d{2}:\d{2}$/.test(w.start) && /^\d{2}:\d{2}$/.test(w.end) && w.end > w.start;
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
      .map(({ _isChoice, ...q }) => q)
      // Belt and braces: the mapped filter above and `willSaveQuestion` must
      // agree, and `config.test.ts` proves they do on the same inputs.
      ,
    appointment_types: draft.appointment_types
      .map((t) => ({
        id: t.id,
        name: t.name.trim(),
        description: (t.description ?? "").trim(),
        duration_min: Math.max(5, Math.min(1440, t.duration_min || 30)),
        price_cents: t.price_cents != null && t.price_cents > 0 ? Math.round(t.price_cents) : null,
      }))
      .filter((_, i) => willSaveAppointmentType(draft.appointment_types[i])),
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
      // The date rule is the predicate itself, applied to the DRAFT override so
      // there is exactly one statement of it. (The map above only trims windows,
      // so filtering before or after it selects the same overrides.)
      .filter((_, i) => willSaveDateOverride(draft.date_overrides[i])),
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

/* ---------------------------------------------------------------- lifecycle
 *
 * Draft → Live / Paused, derived from the two facts the server persists —
 * `enabled` (the authoritative bookability gate the /book/:slug resolver reads)
 * and `published_at` (whether it has ever been published). Never a third stored
 * status, so no two columns can disagree (§57). Mirrors the SQL in
 * 20270130000000_calendar_booking_preset_lifecycle.sql.
 */
export type PresetLifecycle = "draft" | "live" | "paused";

export function presetLifecycle(row: { enabled: boolean; published_at: string | null }): PresetLifecycle {
  if (row.enabled) return "live";
  return row.published_at ? "paused" : "draft";
}

export const LIFECYCLE_LABEL: Record<PresetLifecycle, string> = {
  draft: "Draft",
  live: "Live",
  paused: "Paused",
};

/**
 * Can this preset be published right now, and if not, exactly why — the SAME
 * three checks `publish_calendar_preset` enforces server-side, mirrored here so
 * the editor can show a truthful "Ready to publish" / "what's missing" state
 * BEFORE the owner clicks Publish. The server stays authoritative; this never
 * decides bookability, only what the owner sees (§13 — the copy matches the
 * server's real refusal reasons rather than guessing).
 */
export interface PublishCheck {
  ready: boolean;
  blockers: string[];
}

export function publishReadiness(input: {
  type: string;
  availability_json: DayWindow[] | null;
  date_overrides: DateOverride[];
  location_options: LocationOption[];
  location_type?: string | null;
  hostCount: number;
}): PublishCheck {
  const blockers: string[] = [];

  // Host floor — the honesty gate the pack draws ("Needs 3 host calendars"):
  // round-robin/collective only behave as a team model with more than one host,
  // so publishing one with a single host would present a team page that silently
  // runs as one-on-one.
  const minHosts = input.type === "round_robin" || input.type === "collective" ? 2 : 1;
  if (input.hostCount < minHosts) {
    blockers.push(
      minHosts > 1
        ? `Add at least ${minHosts} hosts — this scheduling model rotates or coordinates across a team.`
        : "Add at least one host so there is someone to book with.",
    );
  }

  // At least one open window (weekly or a date-specific override that opens one).
  // Both go through `willSaveWindow`, which validates the HH:MM shape AND start <
  // end — the SAME test `_calendar_preset_block_reason` applies server-side. A
  // looser weekly check here (plain start < end) would call a malformed window
  // ("9:00") bookable when the server refuses it, a false "ready to publish" (§13).
  const weekly = (input.availability_json ?? []).some((w) => w && willSaveWindow(w));
  const overrideOpens = (input.date_overrides ?? []).some(
    (o) => !o.blocked && o.windows.some((w) => willSaveWindow(w)),
  );
  if (!weekly && !overrideOpens) {
    blockers.push("Add at least one open window so there is a time to offer.");
  }

  // A usable meeting method — the concrete, deliverable set only. `ask_invitee` is
  // NOT a method by itself here (matching the server helper): "let the guest pick"
  // with no concrete option to pick from asks a visitor to choose from nothing, so
  // it never counts toward readiness — a concrete option in `location_options` does.
  const known = ["google_meet", "zoom", "phone", "in_person", "custom"];
  const hasMethod =
    (input.location_options ?? []).some((m) => known.includes(m.type)) ||
    known.includes(input.location_type ?? "");
  if (!hasMethod) {
    blockers.push("Choose how the meeting happens before publishing.");
  }

  return { ready: blockers.length === 0, blockers };
}

/* --------------------------------------------------------- preset templates
 *
 * The guided starting points a "New preset" opens with, so an owner picks a
 * recognizable booking model instead of naming a blank calendar before they
 * understand the options (§36 — no learning the concept from an empty field).
 *
 * A template is nothing more than `blankDraft` with a few fields set — it carries
 * NO hardcoded tenant, brand, service or provider identity (§2/§63); it is an
 * editable default the owner shapes in the ten-area editor.
 *
 * COPY PROVENANCE (§00 — CC has zero authority over in-surface copy, so it is
 * declared honestly, not claimed as a design decision). Three strings are PORTED
 * VERBATIM from the approved pack: the one-on-one `detail` (paige-ia.js L1326),
 * the round-robin `detail` (L2547) and the collective `detail` (L2551). The rest
 * of the labels and descriptive microcopy here is CC-COMPOSED from the owner's
 * 2026-09-13 chooser direction (which named the six models and the starter
 * templates and asked to "show what each option means before selection") and is
 * PROVISIONAL — pending Claude Design's / the owner's final wording. The webinar
 * "no separate streaming substrate" line is a §13 honesty statement (CC's duty).
 * Do not treat the provisional wording as frozen design.
 */
export type SchedulingModel = "personal" | "round_robin" | "collective" | "event";

export interface PresetTemplate {
  id: string;
  label: string;
  blurb: string;
  /** Suggested draft title — editable; the owner never has to accept it. */
  title: string;
  defaults: Partial<
    Pick<CalendarDraft, "duration_min" | "capacity" | "min_notice_min" | "buffer_after_min" | "assignment_strategy">
  >;
}

export interface PresetCategory {
  id: string;
  label: string;
  /** Maps to `calendars.type`. */
  model: SchedulingModel;
  /** One line shown on the category tile. */
  summary: string;
  /** What it means / its honest requirement, shown BEFORE the owner selects it. */
  detail: string;
  /** The host floor `publish_calendar_preset` enforces for this model. */
  minHosts: number;
  /** Custom: ask for a name + model rather than offering starter templates. */
  custom?: boolean;
  templates: PresetTemplate[];
}

/** The four duration starters most models share. */
const DURATION_STARTERS: PresetTemplate[] = [
  { id: "intro", label: "Short intro", blurb: "A quick first hello — 15 minutes.", title: "Intro call", defaults: { duration_min: 15 } },
  { id: "m30", label: "30-minute meeting", blurb: "The default working session.", title: "30-minute meeting", defaults: { duration_min: 30 } },
  { id: "consult45", label: "45-minute consultation", blurb: "A longer, focused conversation.", title: "45-minute consultation", defaults: { duration_min: 45 } },
  { id: "m60", label: "60-minute meeting", blurb: "A full hour.", title: "60-minute meeting", defaults: { duration_min: 60 } },
];

export const PRESET_CATALOG: PresetCategory[] = [
  {
    id: "one_on_one",
    label: "One-on-one meeting",
    model: "personal",
    summary: "One host meets one guest at a time.",
    // Ported: paige-ia.js L1326.
    detail: "Direct bookings with you. One host, so there is nothing to assign.",
    minHosts: 1,
    templates: DURATION_STARTERS,
  },
  {
    id: "round_robin",
    label: "Round Robin team meeting",
    model: "round_robin",
    summary: "Rotate bookings across a team.",
    // Ported: paige-ia.js L2547, plus the honest host requirement the pack draws
    // ("Needs host calendars" / rotation "not yet real" until the hosts exist).
    detail:
      "Rotates through the pool, evenly by count — the fairness counter is what makes it round robin rather than random. Add two or more hosts, each with their own availability, before it can rotate.",
    minHosts: 2,
    templates: [
      { id: "m30", label: "30-minute meeting", blurb: "Rotated across the team.", title: "Team meeting", defaults: { duration_min: 30 } },
      { id: "consult45", label: "45-minute consultation", blurb: "Rotated across the team.", title: "Team consultation", defaults: { duration_min: 45 } },
      { id: "m60", label: "60-minute meeting", blurb: "Rotated across the team.", title: "Team session", defaults: { duration_min: 60 } },
    ],
  },
  {
    id: "collective",
    label: "Collective availability meeting",
    model: "collective",
    summary: "Several hosts must all attend.",
    // Ported: paige-ia.js L2551.
    detail:
      "Every host must be free — the slot is the intersection of all their calendars, so it books rarely and matters when it does. Add two or more hosts before it can find a shared time.",
    minHosts: 2,
    templates: [
      { id: "m30", label: "30-minute meeting", blurb: "When everyone must attend.", title: "Collective meeting", defaults: { duration_min: 30 } },
      { id: "m60", label: "60-minute meeting", blurb: "When everyone must attend.", title: "Collective session", defaults: { duration_min: 60 } },
    ],
  },
  {
    id: "group_class",
    label: "Group session / class",
    model: "event",
    summary: "One session, many attendees.",
    detail:
      "One session that many people book into. Capacity is enforced on the booking page — a full session stops taking registrations.",
    minHosts: 1,
    templates: [
      { id: "class_small", label: "Small group (8)", blurb: "An eight-seat session.", title: "Group session", defaults: { duration_min: 60, capacity: 8 } },
      { id: "class_large", label: "Large class (25)", blurb: "A twenty-five-seat class.", title: "Class", defaults: { duration_min: 60, capacity: 25 } },
    ],
  },
  {
    id: "webinar",
    label: "Webinar / event",
    model: "event",
    // §13 honest: the resolver has no separate webinar/streaming model — "event" is
    // the same capacity+registration engine as a class. We say so rather than imply
    // a broadcast substrate that does not exist. A real meeting method (or an honest
    // setup-required state) is still required to publish.
    summary: "A scheduled session with registration.",
    detail:
      "A scheduled session people register for, with a capacity. It runs on the same registration engine as a group class — there is no separate streaming or broadcast link, so set a real meeting method (or it stays setup-required until you do).",
    minHosts: 1,
    templates: [
      { id: "webinar_100", label: "Webinar (100)", blurb: "A hundred registrations.", title: "Webinar", defaults: { duration_min: 60, capacity: 100 } },
    ],
  },
  {
    id: "custom",
    label: "Custom booking",
    model: "personal",
    summary: "Name it and choose how it schedules.",
    detail:
      "Start from a blank booking type. You choose the name and the scheduling behavior — nothing public is set that you did not pick.",
    minHosts: 1,
    custom: true,
    templates: [],
  },
];

/**
 * Build the DRAFT a chosen category+template (or a Custom name+model) opens with.
 * It is `blankDraft` shaped by the model and the template's defaults — a starting
 * point, fully editable, and created as a Draft (never live) by the server seam.
 */
export function draftForTemplate(
  category: PresetCategory,
  template: PresetTemplate | null,
  name?: string,
): CalendarDraft {
  const title = (name ?? "").trim() || template?.title || category.label;
  const base = blankDraft(title);
  base.type = category.model;
  if (category.model === "round_robin" || category.model === "collective") {
    // A team model with the balanced default; the owner adds hosts in Team & hosts.
    base.assignment_strategy = { mode: "balanced" };
  }
  if (category.model === "event") {
    // A group/webinar defaults to a real capacity (not the 1:1 default).
    base.capacity = template?.defaults.capacity ?? 8;
  }
  if (template) {
    const d = template.defaults;
    if (d.duration_min != null) base.duration_min = d.duration_min;
    if (d.capacity != null) base.capacity = d.capacity;
    if (d.min_notice_min != null) base.min_notice_min = d.min_notice_min;
    if (d.buffer_after_min != null) base.buffer_after_min = d.buffer_after_min;
    if (d.assignment_strategy) base.assignment_strategy = d.assignment_strategy;
  }
  return base;
}
