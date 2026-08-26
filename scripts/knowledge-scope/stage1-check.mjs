/**
 * Knowledge-retrieval tenant-scope checks for `paige-ai-chat`.
 *
 * THE DEFECT THESE EXIST FOR. `paige-ai-chat` used to pick the tenant it searches with
 * an UNORDERED `tenant_members … limit(1)` that ignored `profiles.active_tenant_id`,
 * then pass it as `p_tenant_id` to `match_tenant_knowledge`. That RPC's own guard
 * (migration 20260720224948) compares `p_tenant_id` against `current_user_tenant_id()`,
 * which DOES honour `active_tenant_id`. For any user with more than one membership —
 * every Agency Parent, because `agency_enter_subaccount()` writes a membership row —
 * the two disagree, the RPC raises `KB_FORBIDDEN`, and the handler swallowed it as a
 * `console.warn`. The visible symptom is not an error: Paige simply answers with NO
 * knowledge, silently. §9/§51 (#588 class) + §13.
 *
 * WHAT IS ACTUALLY EXERCISED. The REAL shipped handler, imported through the loader in
 * `stub-hook.mjs`, driven with a real `Request`. Only the module boundary is faked. No
 * assertion is made against a re-implementation of the logic, and no check passes on
 * the strength of a string match against source text.
 *
 * FAILING-FIRST. Checks 1, 2, 3 and 7 FAIL on the pre-fix handler. That is the point:
 * they were written and run against the defect before the correction existed.
 *
 * Run: node --import ./scripts/knowledge-scope/register.mjs scripts/knowledge-scope/stage1-check.mjs
 */

const AGENCY = "11111111-1111-4111-8111-111111111111";
const CHILD = "22222222-2222-4222-8222-222222222222";
const SOLO = "33333333-3333-4333-8333-333333333333";
const USER = "44444444-4444-4444-8444-444444444444";

const VECTOR = Array.from({ length: 1024 }, (_, i) => (i % 7) / 10);

let failures = 0;
let checks = 0;
function assert(label, cond, detail) {
  checks += 1;
  if (cond) {
    console.log(`  ok   ${label}`);
  } else {
    failures += 1;
    console.log(`  FAIL ${label}`);
    if (detail !== undefined) console.log(`         ${detail}`);
  }
}
function group(name) {
  console.log(`\n${name}`);
}

// ── Environment the handler reads at module scope ────────────────────────────────
globalThis.Deno = {
  env: {
    get: (k) =>
      ({
        SUPABASE_URL: "https://test.supabase.co",
        SUPABASE_ANON_KEY: "anon-key",
        SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
        VOYAGE_API_KEY: "test-voyage-key",
        ANTHROPIC_API_KEY: "",
      })[k] ?? "",
  },
};

// Voyage is the ONLY outbound call the retrieval path makes before the RPC. Returning a
// real-shaped vector is what lets the check reach `match_tenant_knowledge` at all; every
// other host is refused so a check can never silently depend on the network.
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, init) => {
  const href = String(url);
  if (href.includes("voyageai.com")) {
    return new Response(JSON.stringify({ data: [{ index: 0, embedding: VECTOR }] }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }
  throw new Error(`knowledge-scope: unexpected outbound fetch to ${href}`);
};
void realFetch;

const fake = await import("./fake-supabase.mjs");
await import("../../supabase/functions/paige-ai-chat/index.ts");
const { capturedHandler } = await import("./stub-serve.mjs");
const handler = capturedHandler();

/**
 * Drive one caller shape through the real handler.
 *
 * `memberships` is what an UNORDERED `tenant_members` read would return — deliberately
 * ordered so its FIRST row is NOT the active tenant. That is the whole trap: a correct
 * handler must ignore this ordering entirely.
 */
async function drive({ personaTenant, memberships, kbRejects = false }) {
  const logged = [];
  const origWarn = console.warn;
  const origError = console.error;
  console.warn = (...a) => logged.push({ level: "warn", msg: a.join(" ") });
  console.error = (...a) => logged.push({ level: "error", msg: a.join(" ") });

  const rec = fake.setScenario({
    authUser: { id: USER, email: "owner@example.test" },
    rpcs: {
      check_rate_limit: { data: true, error: null },
      get_paige_persona_context: {
        data: [{ tenant_id: personaTenant, tenant_name: null, playbook_config: null, playbook_slug: null, funding_enabled: false, brand: null }],
        error: null,
      },
      match_tenant_knowledge: (args) =>
        kbRejects
          ? { data: null, error: { message: "KB_FORBIDDEN: cross-tenant knowledge search denied", code: "42501" } }
          : { data: [{ source_tier: "tenant", doc_id: "d1", chunk_id: "c1", title: "Onboarding", content: "x", similarity: 0.91 }], error: null },
    },
    tables: {
      tenant_members: () => memberships.map((t) => ({ tenant_id: t })),
      profiles: () => [{ active_tenant_id: personaTenant }],
    },
  });

  try {
    await handler(
      new Request("http://local/paige-ai-chat", {
        method: "POST",
        headers: { Authorization: "Bearer test-jwt", "Content-Type": "application/json" },
        body: JSON.stringify({ messages: [{ role: "user", content: "what does my onboarding process look like?" }] }),
      }),
    );
  } catch {
    // A downstream failure (no model key configured) is expected and irrelevant — the
    // retrieval call under test happens well before any model call.
  } finally {
    console.warn = origWarn;
    console.error = origError;
  }

  const kbCall = rec.rpc.find((r) => r.name === "match_tenant_knowledge");
  const memberReads = rec.from.filter((f) => f.table === "tenant_members");
  const telemetry = rec.inserts.find((i) => i.table === "kb_query_telemetry");
  return { rec, kbCall, memberReads, telemetry, logged };
}

// ── 1 · Multi-membership active-account resolution ───────────────────────────────
group("multi-membership active-account resolution");
{
  // Active tenant is CHILD; the unordered membership read would hand back AGENCY first.
  const r = await drive({ personaTenant: CHILD, memberships: [AGENCY, CHILD] });
  assert(
    "1.1 match_tenant_knowledge is actually reached",
    !!r.kbCall,
    `rpcs seen: ${r.rec.rpc.map((x) => x.name).join(", ") || "(none)"}`,
  );
  assert(
    "1.2 p_tenant_id is the ACTIVE tenant, not the first membership row",
    r.kbCall?.args?.p_tenant_id === CHILD,
    `expected ${CHILD}, got ${r.kbCall?.args?.p_tenant_id}`,
  );
  assert(
    "1.3 no unordered tenant_members LIMIT 1 pick is performed at all",
    !r.memberReads.some((m) => m.limit === 1 && !m.ordered),
    `tenant_members reads: ${JSON.stringify(r.memberReads.map((m) => ({ limit: m.limit, ordered: m.ordered })))}`,
  );
}

// ── 2 · Agency Parent scope ──────────────────────────────────────────────────────
group("Agency Parent scope");
{
  const r = await drive({ personaTenant: AGENCY, memberships: [CHILD, AGENCY] });
  assert(
    "2.1 an Agency Parent searches its OWN tenant",
    r.kbCall?.args?.p_tenant_id === AGENCY,
    `expected ${AGENCY}, got ${r.kbCall?.args?.p_tenant_id}`,
  );
}

// ── 3 · Agency acting as a Sub-account ───────────────────────────────────────────
group("Agency acting as a Sub-account");
{
  const r = await drive({ personaTenant: CHILD, memberships: [AGENCY, CHILD] });
  assert(
    "3.1 the ACTIVE CHILD scope governs retrieval, never the parent",
    r.kbCall?.args?.p_tenant_id === CHILD,
    `expected ${CHILD}, got ${r.kbCall?.args?.p_tenant_id}`,
  );
  assert(
    "3.2 the parent's tenant is never passed",
    r.kbCall?.args?.p_tenant_id !== AGENCY,
    `got ${r.kbCall?.args?.p_tenant_id}`,
  );
}

// ── 4 · Single-tenant Solo / Sub-account regression protection ───────────────────
group("single-tenant Solo / Sub-account regression protection");
{
  const r = await drive({ personaTenant: SOLO, memberships: [SOLO] });
  assert(
    "4.1 a single-membership caller still retrieves its own tenant",
    r.kbCall?.args?.p_tenant_id === SOLO,
    `expected ${SOLO}, got ${r.kbCall?.args?.p_tenant_id}`,
  );
  assert("4.2 the knowledge RPC still runs (no behaviour lost)", !!r.kbCall);
}

// ── 5 · Tenantless Platform Operator ─────────────────────────────────────────────
group("tenantless Platform Operator");
{
  const r = await drive({ personaTenant: null, memberships: [] });
  assert(
    "5.1 a tenantless operator resolves to null scope",
    r.kbCall === undefined || r.kbCall.args.p_tenant_id === null,
    `got ${JSON.stringify(r.kbCall?.args?.p_tenant_id)}`,
  );
  assert(
    "5.2 no arbitrary tenant is substituted for a tenantless operator",
    ![AGENCY, CHILD, SOLO].includes(r.kbCall?.args?.p_tenant_id),
    `got ${r.kbCall?.args?.p_tenant_id}`,
  );
}

// ── 6 · KB rejection is observable ───────────────────────────────────────────────
group("KB authorization rejection is observable");
{
  const r = await drive({ personaTenant: CHILD, memberships: [CHILD], kbRejects: true });
  const hit = r.logged.filter((l) => /match_tenant_knowledge/.test(l.msg));
  assert("6.1 the rejection is logged at all", hit.length > 0, JSON.stringify(r.logged.slice(0, 4)));
  assert(
    "6.2 it is logged at ERROR level, not swallowed as an ordinary warning",
    hit.some((l) => l.level === "error"),
    `levels seen: ${hit.map((l) => l.level).join(", ") || "(none)"}`,
  );
  assert(
    "6.3 the log carries the refused tenant so the scope is diagnosable",
    hit.some((l) => l.msg.includes(CHILD)),
    `messages: ${hit.map((l) => l.msg).join(" | ")}`,
  );
}

// ── 7 · Telemetry receives the same resolved active tenant ───────────────────────
group("telemetry receives the same resolved active tenant");
{
  const r = await drive({ personaTenant: CHILD, memberships: [AGENCY, CHILD] });
  assert("7.1 a telemetry row is written", !!r.telemetry, "no kb_query_telemetry insert recorded");
  assert(
    "7.2 telemetry tenant_id matches the tenant that was actually searched",
    r.telemetry?.row?.tenant_id === r.kbCall?.args?.p_tenant_id,
    `telemetry ${r.telemetry?.row?.tenant_id} vs searched ${r.kbCall?.args?.p_tenant_id}`,
  );
  assert(
    "7.3 telemetry stores a query HASH, never the raw question",
    typeof r.telemetry?.row?.query_hash === "string" &&
      !JSON.stringify(r.telemetry?.row ?? {}).includes("onboarding process"),
    JSON.stringify(r.telemetry?.row ?? {}),
  );
}

console.log(`\n${checks - failures} passed, ${failures} failed`);
process.exit(failures === 0 ? 0 : 1);
