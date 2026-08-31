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
 * appears in an artifact (§13/§63).
 *
 * WRITES PERSIST HERE, AND THAT IS THE POINT (§70). The previous version routed
 * `.update()` and `.insert()` into a chain that ignored them and re-resolved the
 * same read, so a save "succeeded" and nothing changed. A geometry harness can
 * live with that; a harness meant to prove a HUMAN can finish a job cannot —
 * every drive would have been asserting against a value that was never written.
 * The store below is a real in-memory table set: an update mutates the row and
 * returns the MUTATED row, an insert appends and returns what it appended, and a
 * re-read sees both. That is what makes "create it, change it, save it, and see
 * it hold" provable rather than assumed.
 *
 * It is still a double. It proves the surface drives its own contract correctly.
 * It proves NOTHING about production RLS, Postgres constraints, or a real
 * provider, and must never be reported as having done so.
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

function seedCalendars() {
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

type Row = Record<string, unknown>;

/**
 * The mutable store. Built ONCE per page load, then edited in place, so a save
 * followed by a re-read observes the save — the whole reason this file exists.
 */
function seed(): Record<string, Row[]> {
  const s = state();
  return {
    calendars: seedCalendars(),
    calendar_hosts: s === "issues" ? [] : [
      { calendar_id: "cal-1", user_id: "u1", priority: 0, availability_json: null, timezone: null },
      { calendar_id: "cal-2", user_id: "u1", priority: 0, availability_json: null, timezone: null },
      { calendar_id: "cal-2", user_id: "u2", priority: 1, availability_json: [{ day: 1, start: "10:00", end: "15:00" }], timezone: "Europe/London" },
      { calendar_id: "cal-3", user_id: "u2", priority: 0, availability_json: null, timezone: null },
      { calendar_id: "cal-4", user_id: "u1", priority: 0, availability_json: null, timezone: null },
    ],
    profiles: [
      { user_id: "u1", full_name: "Harness Host One" },
      { user_id: "u2", full_name: "Harness Host Two" },
    ],
    staff_calendar_settings: [{
      user_id: "harness-user",
      google_calendar_connected: true, google_email: "harness@example.invalid",
      google_last_sync_at: new Date(Date.now() - 42 * 60_000).toISOString(),
      apple_caldav_connected: false, apple_last_sync_at: null,
      zoom_connected: false, zoom_email: null,
    }],
    tenant_email_identities: [{ tenant_id: TENANT }],
    tenant_phone_numbers: s === "issues" ? [] : [{ id: "num-1", tenant_id: TENANT, is_primary: true }],
    tenant_a2p_registrations: s === "issues" ? [] : [{ tenant_id: TENANT }],
    tenants: [{ id: TENANT, brand: { business_phone: s === "issues" ? "" : "+1 555 0100" } }],
  };
}

/**
 * A database survives a page reload; a module-scoped object does not. Seeding at
 * module load modelled "a fresh database every navigation", which made it
 * IMPOSSIBLE for any drive to prove a save persisted — the reload that was meant
 * to re-read the row silently rebuilt it from the seed instead. Session storage
 * is the smallest thing that models the real property: writes outlive a reload,
 * and a fresh browser context (a new drive run) starts clean.
 */
const STORE_KEY = `paige-harness-store:${state()}`;

function load(): Record<string, Row[]> {
  try {
    const raw = sessionStorage.getItem(STORE_KEY);
    if (raw) return JSON.parse(raw) as Record<string, Row[]>;
  } catch { /* storage unavailable — fall through to a fresh seed */ }
  return seed();
}

const db: Record<string, Row[]> = load();

function persist() {
  try {
    sessionStorage.setItem(STORE_KEY, JSON.stringify(db));
  } catch (e) {
    // LOUD, never silent (§32). A store that stops persisting turns every
    // persistence assertion below into a false reading of the product.
    console.error(`[stub] persist FAILED — assertions after this are meaningless: ${String(e).slice(0, 120)}`);
  }
}

const ok = (data: unknown) => ({ data, error: null as { message: string } | null });
const fail = (message: string) => ({ data: null, error: { message } });

/** A read that the selected state says must fail, or null when it may proceed. */
function readRefusal(table: string) {
  const s = state();
  if (table === "calendars" && s === "error") return fail("Harness: calendars read refused");
  if (table === "calendar_hosts" && s === "hostserror") return fail("Harness: calendar_hosts read refused");
  return null;
}

type Filter = { col: string; val: unknown; op: "eq" | "neq" | "in" | "is" };

/**
 * A query builder that answers however the caller walks it, and — unlike the
 * geometry-only version this replaces — actually applies what it is told to write.
 *
 * The hook uses `.select().eq().order()`, `.select().eq().eq().limit()`,
 * `.select().eq().maybeSingle()`, `.select().in()`, `.update().eq().select().single()`
 * and `.insert().select().single()`. Resolution is LAZY — nothing is computed until
 * the chain is awaited — because the mutation and its filters arrive in any order
 * along the chain and all of them must be known before the store is touched.
 */
function chain(table: string) {
  const filters: Filter[] = [];
  let pending: { kind: "update" | "insert" | "delete"; payload?: unknown } | null = null;
  let applied = false;
  let cached: { data: unknown; error: { message: string } | null } | null = null;

  const rows = () => (db[table] ??= []);
  const matches = (row: Row) => filters.every((f) => {
    const v = row[f.col];
    if (f.op === "eq" || f.op === "is") return v === f.val;
    if (f.op === "neq") return v !== f.val;
    if (f.op === "in") return Array.isArray(f.val) && (f.val as unknown[]).includes(v);
    return true;
  });

  /**
   * Applied at most once per chain. A caller that awaits the same builder twice
   * (or reads `.single()` after `await`) must not insert its row a second time.
   */
  function settle() {
    if (applied) return cached!;
    applied = true;

    const refused = readRefusal(table);
    if (refused) return (cached = refused);

    if (pending?.kind === "update") {
      const hit = rows().filter(matches);
      for (const r of hit) Object.assign(r, pending.payload as Row);
      persist();
      return (cached = ok(hit));
    }
    if (pending?.kind === "insert") {
      const incoming = (Array.isArray(pending.payload) ? pending.payload : [pending.payload]) as Row[];
      const added = incoming.map((r, i) => ({
        // A real insert returns the row the database made, including the id it
        // assigned. The surface selects that id straight after creating, so an
        // insert that answered without one would break the flow it exists for.
        id: r.id ?? `cal-new-${Date.now()}-${i}`,
        tenant_id: TENANT,
        ...r,
      }));
      rows().push(...added);
      persist();
      return (cached = ok(added));
    }
    if (pending?.kind === "delete") {
      const keep = rows().filter((r) => !matches(r));
      const removed = rows().length - keep.length;
      db[table] = keep;
      persist();
      return (cached = ok(removed ? [{}] : []));
    }
    return (cached = ok(rows().filter(matches)));
  }

  const one = () => {
    const r = settle();
    if (r.error) return r;
    const d = r.data as Row[];
    return ok(Array.isArray(d) ? (d[0] ?? null) : d);
  };

  const self: Record<string, unknown> = {
    then: (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) =>
      Promise.resolve(settle()).then(res, rej),
    catch: (rej: (e: unknown) => unknown) => Promise.resolve(settle()).catch(rej),
    maybeSingle: () => Promise.resolve(one()),
    single: () => Promise.resolve(one()),
    update: (payload: unknown) => { pending = { kind: "update", payload }; return self; },
    insert: (payload: unknown) => { pending = { kind: "insert", payload }; return self; },
    delete: () => { pending = { kind: "delete" }; return self; },
    eq: (col: string, val: unknown) => { filters.push({ col, val, op: "eq" }); return self; },
    neq: (col: string, val: unknown) => { filters.push({ col, val, op: "neq" }); return self; },
    is: (col: string, val: unknown) => { filters.push({ col, val, op: "is" }); return self; },
    in: (col: string, val: unknown) => { filters.push({ col, val, op: "in" }); return self; },
  };
  // Links that narrow nothing the store models. They must still return the chain.
  for (const link of ["select", "order", "limit", "range", "match"]) self[link] = () => self;
  return self;
}

/**
 * Harness-only window hook, so a drive can read what the store ACTUALLY holds
 * instead of inferring it from the rendered surface. Diagnosing a save that
 * reports success and does not persist is impossible from the DOM alone.
 */
try {
  (window as unknown as Record<string, unknown>).__harnessStore = db;
} catch { /* not a browser — ignore */ }

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
    // A harness never leaves for a provider. Reporting a failure is the honest
    // answer — nothing was started, so nothing may be claimed.
    invoke: () => Promise.resolve({ data: null, error: { message: "Harness: no provider handshake" } }),
  },
};

export default { supabase };
