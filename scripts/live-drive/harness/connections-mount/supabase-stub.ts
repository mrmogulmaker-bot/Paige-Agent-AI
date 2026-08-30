/**
 * Data-boundary stub for the Settings › Connections › Calendars harness mount.
 *
 * MOCKS THE PROVIDER, NEVER THE CONTRACT (harness README). The shipped
 * `CalendarsView`, the shipped `useCalendarConnections` and the shipped CSS are
 * all under measurement — only the Supabase transport is replaced, and it answers
 * with the exact shapes the real seams return.
 *
 * THE ROWS ARE VISIBLY SYNTHETIC ON PURPOSE. Names read "Harness …" so a frame
 * can never be mistaken for a tenant's real configuration and no invented person
 * appears in an artifact (§13/§63). This is GEOMETRY evidence only: it proves the
 * layout, the scroll ownership and the fold-out behaviour at density. It proves
 * NOTHING about production data and must never be reported as having done so.
 *
 * `?data=` selects the state under measurement:
 *   dense (default) · issues · readonly · hostserror · empty · error
 */
export type StubState = "dense" | "issues" | "readonly" | "hostserror" | "empty" | "error";

function state(): StubState {
  const v = new URLSearchParams(window.location.search).get("data");
  return (v as StubState) || "dense";
}

const TENANT = "harness-tenant";

const notify = (over: Record<string, unknown> = {}) => ({
  confirm_guest: true,
  confirm_host: true,
  reminders: [
    { channel: "email", offset_min: 1440, to: "guest" },
    { channel: "sms", offset_min: 120, to: "guest", body: "Harness text: {{when}}" },
  ],
  followup_guest: true,
  followup_offset_min: 60,
  lifecycle: [{ event: "cancelled", channel: "email", to: "host", subject: "Harness cancellation" }],
  ...over,
});

function calendars() {
  if (state() === "empty") return [];
  const base = {
    tenant_id: TENANT, description: "Harness description line for the booking page.",
    logo_url: null, accent: null, buffer_before_min: 15, buffer_after_min: 15,
    min_notice_min: 240, booking_horizon_days: 30, capacity: 1, redirect_url: "",
    timezone: "America/New_York",
    availability_json: [1, 2, 3, 4, 5].map((day) => ({ day, start: "09:00", end: "17:00" })),
    enabled: true, group_id: null, created_by: null, theme: "light", subtitle: "Harness subtitle",
    show_company_name: true, location_type: "google_meet", location_value: null,
    location_options: [{ type: "google_meet", value: null }],
    intake_questions: [
      { id: "q1", label: "What would you like to cover?", type: "textarea", required: true, options: [] },
    ],
    appointment_types: [],
    date_overrides: [
      { date: "2026-12-24", blocked: false, windows: [{ start: "09:00", end: "12:00" }, { start: "14:00", end: "16:30" }] },
      { date: "2026-12-25", blocked: true, windows: [] },
    ],
    notify_config: notify(),
    assignment_strategy: { mode: "balanced" },
  };
  const rows = [
    { ...base, id: "cal-1", slug: "harness-discovery", type: "personal", title: "Harness discovery call", duration_min: 30, color: "#7A67E8" },
    { ...base, id: "cal-2", slug: "harness-onboarding", type: "round_robin", title: "Harness onboarding", duration_min: 45, color: "#2FA37C", assignment_strategy: { mode: "priority" } },
    { ...base, id: "cal-3", slug: "harness-workshop", type: "event", title: "Harness workshop", duration_min: 90, color: "#C98A2A", enabled: false, capacity: 12 },
    { ...base, id: "cal-4", slug: "harness-review", type: "collective", title: "Harness quarterly review", duration_min: 60, color: "#B4564C" },
  ];
  if (state() === "issues") {
    rows[0] = {
      ...rows[0],
      appointment_types: [{ id: "svc-1", name: "", description: "Unnamed on purpose", duration_min: 30, price_cents: null }],
      intake_questions: [{ id: "q1", label: "Which package?", type: "radio", required: true, options: [] }],
    };
  }
  return rows;
}

const HOSTS = [
  { calendar_id: "cal-1", user_id: "u1", priority: 0, availability_json: null, timezone: null },
  { calendar_id: "cal-2", user_id: "u1", priority: 0, availability_json: null, timezone: null },
  { calendar_id: "cal-2", user_id: "u2", priority: 1, availability_json: [{ day: 1, start: "10:00", end: "15:00" }], timezone: "Europe/London" },
  { calendar_id: "cal-3", user_id: "u2", priority: 0, availability_json: null, timezone: null },
  { calendar_id: "cal-4", user_id: "u1", priority: 0, availability_json: null, timezone: null },
];

const PROFILES = [
  { user_id: "u1", full_name: "Harness Host One" },
  { user_id: "u2", full_name: "Harness Host Two" },
];

const ok = (data: unknown) => ({ data, error: null as { message: string } | null });
const fail = (message: string) => ({ data: null, error: { message } });

/** One result per table, resolved at `from()` so the chain below stays trivial. */
function resultFor(table: string) {
  const s = state();
  switch (table) {
    case "staff_calendar_settings":
      return ok({
        google_calendar_connected: true, google_email: "harness@example.invalid",
        google_last_sync_at: new Date(Date.now() - 42 * 60_000).toISOString(),
        apple_caldav_connected: false, apple_last_sync_at: null,
        zoom_connected: false, zoom_email: null,
      });
    case "calendars":
      return s === "error" ? fail("Harness: calendars read refused") : ok(calendars());
    case "calendar_hosts":
      if (s === "hostserror") return fail("Harness: calendar_hosts read refused");
      return ok(s === "issues" ? [] : HOSTS);
    case "profiles":
      return ok(PROFILES);
    case "tenant_email_identities":
      return ok([{ tenant_id: TENANT }]);
    case "tenant_phone_numbers":
      return ok(s === "issues" ? [] : [{ id: "num-1" }]);
    case "tenant_a2p_registrations":
      return ok(s === "issues" ? [] : [{ tenant_id: TENANT }]);
    case "tenants":
      return ok({ brand: { business_phone: s === "issues" ? "" : "+1 555 0100" } });
    default:
      return ok([]);
  }
}

/**
 * A chain that answers the same way however the caller walks it. The hook uses
 * `.select().eq().order()`, `.select().eq().eq().limit()`, `.select().eq().maybeSingle()`
 * and `.select().in()`, so every link returns the chain and the chain is itself a
 * thenable resolving to the table's one result.
 */
function chain(table: string) {
  const result = Promise.resolve(resultFor(table));
  const self: Record<string, unknown> = {
    then: (r: (v: unknown) => unknown, j?: (e: unknown) => unknown) => result.then(r, j),
    catch: (j: (e: unknown) => unknown) => result.catch(j),
  };
  for (const link of ["select", "eq", "in", "order", "limit", "update", "insert", "delete", "is", "neq"]) {
    self[link] = () => self;
  }
  for (const leaf of ["maybeSingle", "single"]) {
    self[leaf] = () => result;
  }
  return self;
}

export const supabase = {
  from: (table: string) => chain(table),
  rpc: (name: string) => {
    if (name === "current_user_tenant_id") return Promise.resolve(ok(TENANT));
    if (name === "is_current_user_tenant_admin") return Promise.resolve(ok(state() !== "readonly"));
    return Promise.resolve(ok(null));
  },
  auth: {
    getUser: () => Promise.resolve({ data: { user: { id: "harness-user" } }, error: null }),
  },
  functions: {
    // A geometry harness never leaves for a provider. Reporting a failure is the
    // honest answer here — nothing was started, so nothing may be claimed.
    invoke: () => Promise.resolve({ data: null, error: { message: "Harness: no provider handshake" } }),
  },
};

export default { supabase };
