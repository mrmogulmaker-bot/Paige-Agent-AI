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

/** The workspace's people. Visibly synthetic, so a frame can never be mistaken
 *  for a real roster and no invented person appears in an artifact (§13/§63). */
const TEAM = [
  { user_id: "u1", full_name: "Harness Owner" },
  { user_id: "u2", full_name: "Harness Teammate" },
];

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
    // `profiles` SELECT is own-row under RLS on the real platform, so a manager
    // reading this table gets THEMSELVES and nobody else. Seeding teammate names
    // here made the harness kinder than production and hid a real defect: every
    // host rendered as "Team member" live. Host names must come from
    // `list_calendar_host_candidates`, which is SECURITY DEFINER for exactly
    // this reason — so the stub returns the viewer's row alone.
    profiles: [
      { user_id: "harness-user", full_name: "Harness Viewer" },
    ],
    staff_calendar_settings: [{
      user_id: "harness-user",
      google_calendar_connected: true, google_email: "harness@example.invalid",
      google_last_sync_at: new Date(Date.now() - 42 * 60_000).toISOString(),
      apple_caldav_connected: false, apple_last_sync_at: null,
      zoom_connected: false, zoom_email: null,
    }],
    tenant_email_identities: [{ tenant_id: TENANT }],
    tenant_phone_numbers: s === "issues" ? [] : [{ id: "num-1", tenant_id: TENANT, is_primary: true, phone_number: "+15550001111", status: "active", friendly_name: null }],
    // Seeded PREPARABLE, with every column the immutability predicate reads. The row
    // used to carry a tenant_id and nothing else, which made `hasLeftPreparation` true
    // by absence — `brand_status` undefined is distinct from 'pending' — so the
    // registration surface rendered LOCKED and no drive could reach its editor.
    tenant_a2p_registrations: s === "issues" ? [] : [{
      tenant_id: TENANT, status: "pending", brand_status: "pending", campaign_status: "pending",
      brand_sid: null, campaign_sid: null, messaging_service_sid: null,
      submitted_at: null, approved_at: null,
      use_case: "Client follow-ups",
      campaign_description: "We text people who are already our clients about their appointments.",
      sample_messages: ["Hi Dana - confirming Tuesday at 3."],
      optin_flow: "Clients agree when they book.",
      optin_message: "You are subscribed. Reply STOP to stop.",
      optout_message: "You are unsubscribed.",
      help_message: "Reply HELP and we will call you.",
    }],
    tenant_legal_profile: s === "issues" ? [] : [{ tenant_id: TENANT, legal_business_name: "Harness Coaching LLC", website: "https://harness.example.invalid" }],
    tenants: [{ id: TENANT, brand: { business_phone: s === "issues" ? "" : "+1 555 0100" } }],
    // The domain lifecycle and the Google sending account, both empty to start —
    // an empty store is the state the owner actually reported, and the state a
    // drive has to be able to act its way OUT of.
    tenant_email_domains: [],
    channel_connectors: [],
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
  rpc: (name: string, args?: Record<string, unknown>) => {
    if (name === "current_user_tenant_id") return Promise.resolve(ok(TENANT));

    // MERGES, exactly as the real `set_tenant_brand` does
    // (`brand = COALESCE(brand,'{}') || _patch`). Modelled as a merge and not a
    // replace on purpose: a stub that replaced would hide the very data-loss bug
    // this branch fixes in WorkspaceSettingsPanel, and a drive over it would
    // "prove" a save that destroys its neighbours.
    if (name === "set_tenant_brand") {
      const patch = (args?._patch ?? {}) as Record<string, unknown>;
      const row = (db.tenants ?? [])[0];
      if (!row) return Promise.resolve(fail("Harness: tenant row missing"));
      row.brand = { ...(row.brand as Record<string, unknown> ?? {}), ...patch };
      persist();
      return Promise.resolve(ok(row.brand));
    }

    // Derived from the SAME `tenants.brand` the editor writes, because that is
    // what the real resolver does. Deriving it lets a drive prove the whole loop
    // the owner cares about: type a name, save it, and watch the step that said
    // "business name still missing" stop saying it. A hardcoded readiness blob
    // could never show that transition.
    if (name === "tenant_comms_readiness") {
      const brand = ((db.tenants ?? [])[0]?.brand ?? {}) as Record<string, unknown>;
      const nonEmpty = (v: unknown) => typeof v === "string" && v.trim().length > 0;
      const hasName = nonEmpty(brand.business_name) || nonEmpty(brand.name);
      return Promise.resolve(ok({
        tenant_id: TENANT,
        can_send_sms: false,
        blocked_reason: "registration_absent",
        subaccount: "connected",
        number: (db.tenant_phone_numbers ?? []).length ? "assigned" : "absent",
        number_e164: (db.tenant_phone_numbers ?? []).length ? "+15550001111" : null,
        business: { has_name: hasName, has_website: nonEmpty(brand.website), has_phone: nonEmpty(brand.business_phone) },
        a2p: "absent",
        consent: { granted_count: 1, suppressed_count: 0, state: "ready" },
        delivery: { state: "delivering", sent_30d: 0, delivered_30d: 0, failed_30d: 0, last_inbound_at: null },
        billing: { subscription: "active", plan_name: "Solo", period_end: null, cancel_at_period_end: false, usage_metering: "not_recording", metered_events_30d: 0 },
      }));
    }
    if (name === "is_current_user_tenant_admin") return Promise.resolve(ok(state() !== "readonly"));

    // Who could be added as a host. Real shape: every teammate, each flagged with
    // whether they are already on THIS calendar — the surface filters, not the RPC.
    if (name === "list_calendar_host_candidates") {
      const cal = String(args?._cal ?? "");
      const current = new Set(
        (db.calendar_hosts ?? []).filter((h) => h.calendar_id === cal).map((h) => h.user_id),
      );
      return Promise.resolve(ok(TEAM.map((m) => ({
        user_id: m.user_id, full_name: m.full_name, is_host: current.has(m.user_id),
        priority: current.has(m.user_id) ? 0 : null,
      }))));
    }

    // The atomic roster rewrite. Modelled as the real one behaves: the previous
    // roster is REPLACED, and array position becomes the stored priority — so a
    // drive that reorders and re-reads sees the order it asked for, and a partial
    // write would show up here as a gap rather than passing quietly.
    if (name === "set_calendar_hosts") {
      const cal = String(args?._cal ?? "");
      const incoming = (args?._hosts ?? []) as { user_id: string }[];
      db.calendar_hosts = (db.calendar_hosts ?? []).filter((h) => h.calendar_id !== cal);
      incoming.forEach((h, i) => {
        db.calendar_hosts.push({ calendar_id: cal, user_id: h.user_id, priority: i, availability_json: null, timezone: null });
      });
      persist();
      return Promise.resolve(ok(null));
    }
    return Promise.resolve(ok(null));
  },
  auth: {
    getUser: () => Promise.resolve({ data: { user: { id: "harness-user" } }, error: null }),
    getSession: () => Promise.resolve({ data: { session: null }, error: null }),
    // The shell subscribes to auth changes on mount. It only ever needs a
    // handle it can unsubscribe from; there is no session to change here.
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
  },
  // Realtime, answered as "subscribed and silent". The shell and several hooks
  // open channels on mount; a harness has no socket, and inventing events would
  // put rows on screen that no read produced. Every method returns the channel
  // so the fluent `.on().on().subscribe()` shape works unchanged.
  channel: () => {
    const ch: Record<string, unknown> = {};
    ch.on = () => ch;
    ch.subscribe = (cb?: (status: string) => void) => { cb?.("SUBSCRIBED"); return ch; };
    ch.unsubscribe = () => Promise.resolve("ok");
    ch.send = () => Promise.resolve("ok");
    return ch;
  },
  removeChannel: () => Promise.resolve("ok"),
  getChannels: () => [],
  functions: {
    // A harness never leaves for a provider. Reporting a failure is the honest
    // answer — nothing was started, so nothing may be claimed.
    invoke: (fn: string, opts?: { body?: Record<string, unknown> }) => {
      // The domain lifecycle is modelled because it is a DATABASE lifecycle on
      // this side of the seam — list/add/set_default/remove all resolve to rows.
      // The Resend call the real function makes is the part a harness must not
      // pretend to, and `add` here is explicitly a REGISTRATION RECORD, not a
      // provider account: it stores `pending`, never `verified`.
      if (fn === "manage-tenant-domain") {
        const body = opts?.body ?? {};
        const verb = String(body.verb ?? "");
        const rows = (db.tenant_email_domains ??= []);
        const find = (id: unknown) => rows.find((r) => r.id === String(id));
        if (verb === "list") return Promise.resolve(ok({ domains: rows }));
        if (verb === "add") {
          const domain = String(body.domain ?? "").trim().toLowerCase();
          if (!/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(domain)) return Promise.resolve(ok({ error: "invalid_domain" }));
          rows.push({
            id: `dom-${rows.length + 1}`, tenant_id: TENANT, domain,
            from_email_local: String(body.from_email_local ?? "no-reply"),
            from_name: String(body.from_name ?? ""),
            // `pending` because nothing verified anything. A harness that seeded
            // `verified` would let a drive claim DNS it never checked.
            status: "pending", is_default: rows.length === 0, dns_records: [],
          });
          persist();
          return Promise.resolve(ok({ domain: rows[rows.length - 1] }));
        }
        if (verb === "refresh") {
          const row = find(body.id);
          if (!row) return Promise.resolve(ok({ error: "not_found" }));
          // Still pending: re-reading DNS that was never published changes nothing.
          return Promise.resolve(ok({ domain: row }));
        }
        if (verb === "set_default") {
          const row = find(body.id);
          if (!row) return Promise.resolve(ok({ error: "not_found" }));
          rows.forEach((r) => { r.is_default = false; });
          row.is_default = true;
          persist();
          return Promise.resolve(ok({ ok: true }));
        }
        if (verb === "remove") {
          const i = rows.findIndex((r) => r.id === String(body.id));
          if (i < 0) return Promise.resolve(ok({ error: "not_found" }));
          rows.splice(i, 1);
          persist();
          return Promise.resolve(ok({ ok: true }));
        }
        return Promise.resolve(ok({ error: "unknown_verb" }));
      }
      // Number availability. A search is READ-ONLY at the provider, so returning a
      // fixed list costs nothing and misrepresents nothing — but these are invented
      // numbers, and a drive may only conclude that the surface RENDERS what it is
      // given, never that this inventory exists.
      if (fn === "comms-search-numbers") {
        const body = opts?.body ?? {};
        if (String(body.area_code ?? "") === "000") {
          // The setup-gap answer, reachable on demand, so a drive can prove it is
          // told apart from an empty shelf.
          return Promise.resolve(ok({ needs_config: true, numbers: [], message: "Harness: no messaging account provisioned." }));
        }
        const tollFree = String(body.number_type ?? "local") === "tollfree";
        const prefix = tollFree ? "833" : String(body.area_code ?? "404") || "404";
        return Promise.resolve(ok({
          needs_config: false, price_configured: true,
          numbers: [1, 2].map((i) => ({
            phone_number: `+1${prefix}555010${i}`,
            locality: tollFree ? null : String(body.in_locality ?? "Atlanta"),
            region: tollFree ? null : String(body.in_region ?? "GA"),
            capabilities: { SMS: true, MMS: true, voice: true },
            retail_price: { retail_monthly_cents: 120 + i },
          })),
        }));
      }
      // Buying is a real CHARGE at the provider and a row on this side. The charge is
      // the part a harness must not pretend to; the row is the part a drive has to be
      // able to prove, because "it said the number is yours" and "the number is on the
      // business" are different claims and only the second one matters.
      if (fn === "comms-purchase-number") {
        const number = String(opts?.body?.phone_number ?? "");
        if (!number) return Promise.resolve(ok({ error: "phone_number_required" }));
        if (number.endsWith("2")) {
          // One number always refuses, so a drive can prove a refusal is never
          // rendered as a purchase. Provider inventory really does go stale between
          // a search and a buy.
          return Promise.resolve(ok({ error: "number_unavailable" }));
        }
        (db.tenant_phone_numbers ??= []).push({
          id: `num-${(db.tenant_phone_numbers ?? []).length + 1}`, tenant_id: TENANT,
          phone_number: number, is_primary: false, status: "active", friendly_name: null,
        });
        persist();
        return Promise.resolve(ok({ ok: true, phone_number: number }));
      }
      // Drafting is a MODEL call. The harness returns fixture prose so a drive can
      // reach the editor — it is not Paige's writing and no drive may grade it.
      if (fn === "comms-a2p-draft") {
        const row = (db.tenant_a2p_registrations ?? [])[0];
        const draft = {
          use_case: "Client follow-ups",
          campaign_description: "Harness fixture copy. Not written by a model.",
          sample_messages: ["Harness sample one.", "Harness sample two."],
          optin_flow: "Harness opt-in description.",
          optin_message: "Harness confirmation.",
          optout_message: "Harness STOP reply.",
          help_message: "Harness HELP reply.",
        };
        if (row) { Object.assign(row, draft, { sample_messages: draft.sample_messages }); persist(); }
        return Promise.resolve(ok({ draft, legal_business_name: "Harness Coaching LLC", website: "https://harness.example.invalid", saved: true }));
      }
      // The save, with the REAL contract: filing does not exist, so `submitted` is
      // false and `a2p_submit_wired` is false. A harness that returned a submitted
      // state would let a drive certify the one claim this surface must never make.
      if (fn === "comms-a2p-submit") {
        const body = opts?.body ?? {};
        if (!String(body.legal_business_name ?? "").trim()) {
          return Promise.resolve({ data: { error: { code: "LEGAL_PROFILE_REQUIRED", message: "Harness: legal business name required." } }, error: { message: "non-2xx" } });
        }
        const row = (db.tenant_a2p_registrations ??= [])[0] ?? {};
        Object.assign(row, {
          tenant_id: TENANT, status: "pending", brand_status: "pending", campaign_status: "pending",
          use_case: String(body.use_case ?? ""), campaign_description: String(body.campaign_description ?? ""),
          sample_messages: Array.isArray(body.sample_messages) ? body.sample_messages : [],
          optin_flow: String(body.optin_flow ?? ""), optin_message: String(body.optin_message ?? ""),
          optout_message: String(body.optout_message ?? ""), help_message: String(body.help_message ?? ""),
          submitted_at: null, approved_at: null,
        });
        if (!(db.tenant_a2p_registrations ?? []).length) db.tenant_a2p_registrations = [row];
        persist();
        return Promise.resolve(ok({ saved: true, submitted: false, a2p_submit_wired: false, state: "prepared", status: "pending" }));
      }
      // Everything that would leave for a provider — the Google handshake above
      // all — stays refused. Nothing was started, so nothing may be claimed.
      return Promise.resolve({ data: null, error: { message: "Harness: no provider handshake" } });
    },
  },
};

export default { supabase };
