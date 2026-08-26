/**
 * Knowledge-retrieval tenant-scope checks for `paige-ai-chat`.
 *
 * THE DEFECT THESE EXIST FOR — and why it is a CONFIDENTIALITY defect, not a silent
 * failure. `paige-ai-chat` picked the tenant it searches with an UNORDERED
 * `tenant_members … limit(1)` that ignored `profiles.active_tenant_id`, then passed it as
 * `p_tenant_id` to `match_tenant_knowledge`. That names a tenant the caller IS a member of
 * but is NOT currently operating as — every Agency Parent qualifies, because
 * `agency_enter_subaccount()` writes a membership row.
 *
 * The RPC's guard did NOT catch it on this path. The call went through the SERVICE-ROLE
 * client, and the guard (migration 20260720224948) is explicitly exempt when `auth.uid()`
 * IS NULL — exactly the service-role case. So the WRONG ACCOUNT'S PRIVATE CHUNKS were
 * retrieved and placed into Paige's prompt. §9/§51 (#588 class) + §13.
 *
 * WHAT IS ACTUALLY EXERCISED. The REAL shipped handler, imported through the loader in
 * `stub-hook.mjs`, driven with a real `Request`. Only the module boundary is faked. No
 * assertion is made against a re-implementation of the logic, and no check passes on the
 * strength of a string match against source text. The fake records WHICH client made each
 * call, so "the JWT-scoped guard is engaged" is proven, not assumed.
 *
 * FAILING-FIRST. Groups 1, 2, 3, 5, 6, 8, 9 and 11 contain assertions that FAIL on the
 * pre-fix handler. They were written and run against the defect before the correction
 * existed; the run is recorded in the PR.
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
let embedCount = 0;
function embedCalls() { return embedCount; }
function resetEmbeds() { embedCount = 0; }
globalThis.fetch = async (url, init) => {
  const href = String(url);
  if (href.includes("voyageai.com")) {
    // Counted so a check can prove NO paid embedding happens when scope is unresolved.
    embedCount += 1;
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
async function drive({ personaTenant, memberships, kbRejects = false, bodyExtras = {}, noAuth = false, unauthenticated = false, chunkTitle = "Onboarding", chunkContent = "x" }) {
  const logged = [];
  resetEmbeds();
  const origWarn = console.warn;
  const origError = console.error;
  console.warn = (...a) => logged.push({ level: "warn", msg: a.join(" ") });
  console.error = (...a) => logged.push({ level: "error", msg: a.join(" ") });

  const rec = fake.setScenario({
    authUser: unauthenticated ? null : { id: USER, email: "owner@example.test" },
    rpcs: {
      check_rate_limit: { data: true, error: null },
      get_paige_persona_context: {
        data: [{ tenant_id: personaTenant, tenant_name: null, playbook_config: null, playbook_slug: null, funding_enabled: false, brand: null }],
        error: null,
      },
      match_tenant_knowledge: (args) =>
        kbRejects
          ? { data: null, error: { message: "KB_FORBIDDEN: cross-tenant knowledge search denied", code: "42501" } }
          : { data: [{ source_tier: "tenant", doc_id: "d1", chunk_id: "c1", title: chunkTitle, content: chunkContent, similarity: 0.91 }], error: null },
    },
    tables: {
      tenant_members: () => memberships.map((t) => ({ tenant_id: t })),
      profiles: () => [{ active_tenant_id: personaTenant }],
    },
  });

  let status = null;
  try {
    const headers = { "Content-Type": "application/json" };
    if (!noAuth) headers.Authorization = "Bearer test-jwt";
    const res = await handler(
      new Request("http://local/paige-ai-chat", {
        method: "POST",
        headers,
        // `bodyExtras` is how a check smuggles a tenant identifier in through the REQUEST —
        // the one thing server-derived scope must never honour.
        body: JSON.stringify({
          messages: [{ role: "user", content: "what does my onboarding process look like?" }],
          ...bodyExtras,
        }),
      }),
    );
    status = res?.status ?? null;
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
  return { rec, kbCall, memberReads, telemetry, logged, status, embeds: embedCalls() };
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

// ── 5 · Tenantless Platform Operator does NO tenant work ────────────────────────
group("tenantless Platform Operator — unresolved scope does no work");
{
  const r = await drive({ personaTenant: null, memberships: [] });
  assert(
    "5.1 no retrieval is attempted at all when scope is unresolved",
    r.kbCall === undefined,
    `match_tenant_knowledge was called with ${JSON.stringify(r.kbCall?.args?.p_tenant_id)}`,
  );
  assert(
    "5.2 no arbitrary tenant is substituted for a tenantless operator",
    ![AGENCY, CHILD, SOLO].includes(r.kbCall?.args?.p_tenant_id),
    `got ${r.kbCall?.args?.p_tenant_id}`,
  );
  // The KB block's embed is measured as a DELTA, not as a global zero. Two OTHER embed
  // calls (the client-memory semantic pull and the rag_documents pull) live in this handler
  // and are outside this PR's authorized scope — asserting `embeds === 0` would have been a
  // claim about code this change does not touch, and would fail for the wrong reason.
  const resolvedRun = await drive({ personaTenant: SOLO, memberships: [SOLO] });
  assert(
    "5.3 the KB pathway makes NO paid embedding call when scope is unresolved",
    r.embeds === resolvedRun.embeds - 1,
    `unresolved made ${r.embeds} embeds, resolved made ${resolvedRun.embeds}; expected exactly one fewer (the KB block's)`,
  );
  assert(
    "5.4 no tenant telemetry row is written",
    !r.telemetry,
    `telemetry: ${JSON.stringify(r.telemetry?.row ?? null)}`,
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

// ── 8 · The JWT-scoped RPC guard stays engaged ──────────────────────────────────
group("JWT-scoped RPC guard remains engaged");
{
  const r = await drive({ personaTenant: CHILD, memberships: [AGENCY, CHILD] });
  assert(
    "8.1 match_tenant_knowledge is called through the caller's JWT client",
    r.kbCall?.client === "jwt",
    `client was "${r.kbCall?.client}" — a service-role call exempts the RPC's guard (auth.uid() IS NULL), disabling defence in depth`,
  );
  assert(
    "8.2 the old first-membership query is absent from the whole request",
    !r.rec.from.some((f) => f.table === "tenant_members" && f.limit === 1 && !f.ordered),
    `tenant_members reads: ${JSON.stringify(r.rec.from.filter((f) => f.table === "tenant_members"))}`,
  );
}

// ── 9 · Request-supplied tenant identifiers cannot override server scope ─────────
group("request-supplied tenant identifiers cannot override server scope");
{
  // Every plausible UNKNOWN-KEY smuggling shape at once. Server scope is CHILD; the body
  // screams AGENCY. These keys are not in messageSchema, so zod strips them — the check
  // proves they are stripped AND that retrieval still happens on the server's tenant, which
  // is a stronger result than the request merely being rejected.
  const r = await drive({
    personaTenant: CHILD,
    memberships: [CHILD],
    bodyExtras: {
      tenant_id: AGENCY,
      tenantId: AGENCY,
      p_tenant_id: AGENCY,
      active_tenant_id: AGENCY,
      account_id: AGENCY,
    },
  });
  assert(
    "9.1 retrieval still runs — the smuggled keys are stripped, not fatal",
    !!r.kbCall,
    `no match_tenant_knowledge call; status ${r.status}`,
  );
  assert(
    "9.2 the searched tenant is the SERVER-resolved one, not the body's",
    r.kbCall?.args?.p_tenant_id === CHILD,
    `expected ${CHILD}, got ${r.kbCall?.args?.p_tenant_id}`,
  );
  assert(
    "9.3 the body's tenant never reaches telemetry either",
    r.telemetry?.row?.tenant_id === CHILD,
    `telemetry tenant_id ${r.telemetry?.row?.tenant_id}`,
  );

  // A KNOWN key given a hostile shape is a different property: it must be refused by
  // validation BEFORE any tenant work happens. Kept as its own assertion so a validation
  // rejection can never be mistaken for proof that scope resolution is correct.
  const malformed = await drive({
    personaTenant: CHILD,
    memberships: [CHILD],
    bodyExtras: { clientContext: { tenant_id: AGENCY, tenantId: AGENCY } },
  });
  assert("9.4 a malformed known field is refused 400", malformed.status === 400, `status ${malformed.status}`);
  assert("9.5 …before any retrieval", malformed.kbCall === undefined);
  assert("9.6 …and before any paid embedding", malformed.embeds === 0, `embeds: ${malformed.embeds}`);
}

// ── 10 · Unauthenticated callers remain rejected ────────────────────────────────
group("unauthenticated callers remain rejected");
{
  const missingHeader = await drive({ personaTenant: CHILD, memberships: [CHILD], noAuth: true });
  assert("10.1 a request with no Authorization header is refused 401", missingHeader.status === 401, `status ${missingHeader.status}`);
  assert("10.2 …and reaches no retrieval", missingHeader.kbCall === undefined);

  const badToken = await drive({ personaTenant: CHILD, memberships: [CHILD], unauthenticated: true });
  assert("10.3 a request whose token resolves to no user is refused 401", badToken.status === 401, `status ${badToken.status}`);
  assert("10.4 …and reaches no retrieval", badToken.kbCall === undefined);
  assert("10.5 …and makes no paid embedding call", badToken.embeds === 0, `embeds: ${badToken.embeds}`);
}

// ── 11 · A wrong account's knowledge cannot enter the prompt ────────────────────
group("a stale or wrong account's knowledge cannot enter the prompt");
{
  // The scenario returns a chunk carrying a marker. Whatever tenant the handler asked for is
  // the only tenant whose chunks can exist, so proving the ASKED tenant is the active one —
  // and that the RPC is JWT-scoped so the database re-checks it — is what bounds the prompt.
  const r = await drive({
    personaTenant: CHILD,
    memberships: [AGENCY, CHILD],
    chunkTitle: "ACTIVE-CHILD-DOC",
    chunkContent: "child-only-material",
  });
  assert(
    "11.1 the only tenant scope ever queried is the active one",
    r.rec.rpc.filter((x) => x.name === "match_tenant_knowledge").every((x) => x.args.p_tenant_id === CHILD),
    JSON.stringify(r.rec.rpc.filter((x) => x.name === "match_tenant_knowledge").map((x) => x.args.p_tenant_id)),
  );
  assert(
    "11.2 retrieval is never attempted for a non-active membership",
    !r.rec.rpc.some((x) => x.name === "match_tenant_knowledge" && x.args.p_tenant_id === AGENCY),
  );
  assert(
    "11.3 exactly one knowledge query is issued per turn (no second, wider sweep)",
    r.rec.rpc.filter((x) => x.name === "match_tenant_knowledge").length === 1,
    `count: ${r.rec.rpc.filter((x) => x.name === "match_tenant_knowledge").length}`,
  );
}

console.log(`\n${checks - failures} passed, ${failures} failed`);
process.exit(failures === 0 ? 0 : 1);
