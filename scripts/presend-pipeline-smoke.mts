// Headless §32 smoke test for _shared/pre-send-pipeline.ts (run via node --experimental-strip-types).
// Proves the runtime behavior the green build can't: D-1 consent scoping, SMS default-deny,
// quiet-hours tz math across midnight, suppression, and the client-DND override.
import { runPreSend, normalizePhone, normalizeEmail } from
  "../supabase/functions/_shared/pre-send-pipeline.ts";

const TENANT = "11111111-1111-1111-1111-111111111111";
const CLIENT = "22222222-2222-2222-2222-222222222222";

// A minimal chainable/awaitable Supabase-query mock. Each table returns a preset result.
function makeAdmin(tables: Record<string, { data: unknown; error?: unknown }>) {
  return {
    from(table: string) {
      const preset = tables[table] ?? { data: null, error: null };
      const q: any = {
        select: () => q, eq: () => q, or: () => q, order: () => q,
        maybeSingle: async () => preset,
        limit: async () => preset,
      };
      return q;
    },
    rpc: async () => ({ data: null, error: null }),
  };
}

let pass = 0, fail = 0;
function check(name: string, cond: boolean, extra = "") {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.error(`  ✗ FAIL ${name} ${extra}`); }
}

// --- normalization ---
check("normalizePhone bare-10", normalizePhone("(555) 123-0000") === "+15551230000");
check("normalizePhone e164-passthrough", normalizePhone("+447911123456") === "+447911123456");
check("normalizeEmail plus-tag+case", normalizeEmail("Foo+bar@EXAMPLE.com") === "foo@example.com");

const noRows = { data: [], error: null };
const noSingle = { data: null, error: null };

// --- D-1: EMAIL with NO consent must PROCEED (consent enforced for sms only) ---
{
  const admin = makeAdmin({
    clients: noSingle, paige_suppressions: noRows,
    paige_consent_events: noRows, tenant_comms_preferences: noSingle,
  });
  const r = await runPreSend(admin as any, { tenantId: TENANT, channel: "email", to: "a@b.com", contactId: CLIENT });
  check("D-1 email no-consent PROCEEDS", r.proceed === true && r.outcome === "proceed", JSON.stringify(r));
}

// --- SMS with NO consent must BLOCK (default-deny enforced for sms) ---
{
  const admin = makeAdmin({
    clients: noSingle, paige_suppressions: noRows,
    paige_consent_events: noRows, tenant_comms_preferences: noSingle,
  });
  const r = await runPreSend(admin as any, { tenantId: TENANT, channel: "sms", to: "+15551230000", contactId: CLIENT });
  check("SMS no-consent BLOCKS", r.proceed === false && r.outcome === "blocked_no_consent", JSON.stringify(r));
}

// --- Suppression blocks EMAIL too (step 2 is all-channel) ---
{
  const admin = makeAdmin({
    clients: noSingle, paige_suppressions: { data: [{ id: "s1", reason: "user_stop" }], error: null },
    paige_consent_events: noRows, tenant_comms_preferences: noSingle,
  });
  const r = await runPreSend(admin as any, { tenantId: TENANT, channel: "email", to: "a@b.com", contactId: CLIENT });
  check("suppression blocks email", r.proceed === false && r.outcome === "blocked_suppressed", JSON.stringify(r));
}

// --- Client DND blocks, and override lets it through ---
{
  const dndClient = { data: { dnd_active: true, dnd_until: null, dnd_reason: "On vacation", timezone: "America/New_York" }, error: null };
  const base = { paige_suppressions: noRows, paige_consent_events: { data: [{ action: "granted", created_at: "2026-01-01" }], error: null }, tenant_comms_preferences: noSingle };
  const noonEt = new Date("2026-03-15T16:00:00Z"); // 12:00 EDT — outside quiet hours
  const blocked = await runPreSend(makeAdmin({ clients: dndClient, ...base }) as any,
    { tenantId: TENANT, channel: "sms", to: "+15551230000", contactId: CLIENT, now: noonEt });
  check("client DND blocks", blocked.outcome === "blocked_client_dnd", JSON.stringify(blocked));
  const overridden = await runPreSend(makeAdmin({ clients: dndClient, ...base }) as any,
    { tenantId: TENANT, channel: "sms", to: "+15551230000", contactId: CLIENT, now: noonEt, overrideClientDnd: true });
  check("client DND override PROCEEDS", overridden.proceed === true, JSON.stringify(overridden));
}

// --- TCPA quiet-hours tz math (SMS), granted consent, ET recipient ---
{
  const client = (tz: string | null) => ({ data: { dnd_active: false, dnd_until: null, dnd_reason: null, timezone: tz }, error: null });
  const base = { paige_suppressions: noRows, paige_consent_events: { data: [{ action: "granted", created_at: "2026-01-01" }], error: null }, tenant_comms_preferences: noSingle };

  // 12:00 EDT (16:00Z) — OUTSIDE quiet hours → proceed
  const noon = await runPreSend(makeAdmin({ clients: client("America/New_York"), ...base }) as any,
    { tenantId: TENANT, channel: "sms", to: "+15551230000", contactId: CLIENT, now: new Date("2026-03-15T16:00:00Z") });
  check("SMS noon ET proceeds", noon.proceed === true, JSON.stringify(noon));

  // 21:00 EDT (01:00Z next day) — INSIDE quiet hours → queued, release next 08:00 ET
  const night = await runPreSend(makeAdmin({ clients: client("America/New_York"), ...base }) as any,
    { tenantId: TENANT, channel: "sms", to: "+15551230000", contactId: CLIENT, now: new Date("2026-03-16T01:00:00Z") });
  check("SMS 21:00 ET queues quiet_hours", night.outcome === "queued_quiet_hours", JSON.stringify(night));
  // release must be 08:00 EDT = 12:00Z that same morning (2026-03-16)
  check("quiet-hours release = 08:00 ET", night.queueUntil === "2026-03-16T12:00:00.000Z", String(night.queueUntil));

  // 23:00 EST just before DST — midnight-crossing window, still queues
  const preMidnight = await runPreSend(makeAdmin({ clients: client("America/New_York"), ...base }) as any,
    { tenantId: TENANT, channel: "sms", to: "+15551230000", contactId: CLIENT, now: new Date("2026-01-10T04:00:00Z") }); // 23:00 EST
  check("SMS 23:00 ET (midnight-cross) queues", preMidnight.outcome === "queued_quiet_hours", JSON.stringify(preMidnight));
  check("midnight-cross release = 08:00 EST next day", preMidnight.queueUntil === "2026-01-10T13:00:00.000Z", String(preMidnight.queueUntil));

  // null timezone → falls back to America/New_York, still evaluates (no throw)
  const nullTz = await runPreSend(makeAdmin({ clients: client(null), ...base }) as any,
    { tenantId: TENANT, channel: "sms", to: "+15551230000", contactId: CLIENT, now: new Date("2026-03-16T01:00:00Z") });
  check("SMS null tz falls back (no throw)", nullTz.outcome === "queued_quiet_hours", JSON.stringify(nullTz));
}

// --- platform-owner context (tenantId null) short-circuits ---
{
  const r = await runPreSend(makeAdmin({}) as any, { tenantId: null, channel: "sms", to: "+1", contactId: null });
  check("null tenant proceeds (owner ctx)", r.proceed === true && r.reason === "platform_owner_context", JSON.stringify(r));
}

console.log(`\nPRESEND SMOKE: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
