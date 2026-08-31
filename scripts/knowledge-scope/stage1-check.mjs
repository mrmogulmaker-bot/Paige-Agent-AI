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
        ANTHROPIC_API_KEY: "test-anthropic-key",
      })[k] ?? "",
  },
};

// Voyage is the ONLY outbound call the retrieval path makes before the RPC. Returning a
// real-shaped vector is what lets the check reach `match_tenant_knowledge` at all; every
// other host is refused so a check can never silently depend on the network.
const realFetch = globalThis.fetch;
let embedCount = 0;
let providerPlan = [];
let providerCalls = [];
let syncCalls = [];
function embedCalls() { return embedCount; }
function resetEmbeds() { embedCount = 0; }
function resetProvider(plan = []) { providerPlan = [...plan]; providerCalls = []; syncCalls = []; }
function anthropicStream(kind = "text") {
  const responseText = kind === "private-text"
    ? "CHILD-PRIVATE-MARKER"
    // Trips the `lender_searched` extractor AND the not-legal-advice flag, so a check can prove
    // response-derived analytics really do fire on a healthy turn.
    : kind === "lender-text"
    ? "CHILD-PRIVATE-MARKER — consider: Summit Capital. This is not legal advice."
    : "Scoped response.";
  const events = kind === "tool"
    ? [
        { type: "message_start", message: { usage: { input_tokens: 1 } } },
        { type: "content_block_start", index: 0, content_block: { type: "tool_use", id: "tool-1", name: "plan_list" } },
        { type: "content_block_delta", index: 0, delta: { type: "input_json_delta", partial_json: "{}" } },
        { type: "message_delta", delta: { stop_reason: "tool_use" }, usage: { output_tokens: 1 } },
        { type: "message_stop" },
      ]
    // A round proposing TWO tools. This exists so a check can prove the dispatch guard is
    // asserted PER TOOL: with a batch-level check the account can change after the first
    // tool has run and every later tool in the same round still executes on stale scope.
    // Distinct `limit` args make the two dispatches individually identifiable in the RPC
    // recorder — `plan_list` maps straight through to a `plan_list` RPC with `p_limit`.
    : kind === "two-tools"
    ? [
        { type: "message_start", message: { usage: { input_tokens: 1 } } },
        { type: "content_block_start", index: 0, content_block: { type: "tool_use", id: "tool-1", name: "plan_list" } },
        { type: "content_block_delta", index: 0, delta: { type: "input_json_delta", partial_json: '{"limit":11}' } },
        { type: "content_block_start", index: 1, content_block: { type: "tool_use", id: "tool-2", name: "plan_list" } },
        { type: "content_block_delta", index: 1, delta: { type: "input_json_delta", partial_json: '{"limit":22}' } },
        { type: "message_delta", delta: { stop_reason: "tool_use" }, usage: { output_tokens: 1 } },
        { type: "message_stop" },
      ]
    : [
        { type: "message_start", message: { usage: { input_tokens: 1 } } },
        { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } },
        { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: responseText } },
        { type: "message_delta", delta: { stop_reason: "end_turn" }, usage: { output_tokens: 1 } },
        { type: "message_stop" },
      ];
  return new Response(events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join(""), {
    status: 200,
    headers: { "Content-Type": "text/event-stream" },
  });
}
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
  if (href === "https://api.anthropic.com/v1/messages") {
    providerCalls.push(JSON.parse(String(init?.body ?? "{}")));
    const next = providerPlan.shift() ?? "text";
    // An extraction that parses but FAILS validation, so the `logSyncFailure` path is reached
    // with the full `structured` payload — the write 14b.1/14b.2 are about.
    if (next === "json-extraction-invalid") {
      const extracted = JSON.stringify({
        is_credit_report: false,
        extraction_verified: false,
        report_type: "consumer",
        scores: {},
        negative_items: [],
        positive_accounts: [],
        hard_inquiries: [],
      });
      return new Response(JSON.stringify({ content: [{ type: "text", text: extracted }], model: "test", usage: { input_tokens: 1, output_tokens: 1 } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    if (next === "json-extraction") {
      const extracted = JSON.stringify({
        is_credit_report: true,
        extraction_verified: true,
        report_type: "consumer",
        scores: { equifax: 700, experian: 701, transunion: 702 },
        negative_items: [],
        positive_accounts: [{ creditor: "Test Bank", account_type: "revolving" }],
        hard_inquiries: [],
      });
      return new Response(JSON.stringify({ content: [{ type: "text", text: extracted }], model: "test", usage: { input_tokens: 1, output_tokens: 1 } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    // The PDF read-check that decides `isCreditReportPdf`. Satisfying it is what routes a
    // document turn down the credit-report extraction+sync branch — the only path on which the
    // sync helper's scope callback AND the caller's own recheck both run, which is what made
    // the self-erasing-guard defect reachable.
    if (next === "read-check") {
      const readCheck = JSON.stringify({
        can_read_document: true,
        document_kind: "credit_report",
        first_five_account_names: ["Test Bank"],
      });
      return new Response(JSON.stringify({ content: [{ type: "text", text: readCheck }], model: "test", usage: { input_tokens: 1, output_tokens: 1 } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    // A provider round that FAILS. Used to reach the loop's forced-termination path — the
    // branch that issues a tools-less CLOSING call — without needing to exhaust MAX_ROUNDS.
    if (next === "fail") {
      return new Response(JSON.stringify({ error: "upstream" }), { status: 500, headers: { "Content-Type": "application/json" } });
    }
    return anthropicStream(next);
  }
  if (href.endsWith("/functions/v1/sync-credit-report-data")) {
    syncCalls.push(JSON.parse(String(init?.body ?? "{}")));
    return new Response(JSON.stringify({ results: {} }), { status: 200, headers: { "Content-Type": "application/json" } });
  }
  throw new Error(`knowledge-scope: unexpected outbound fetch to ${href}`);
};
void realFetch;

const fake = await import("./fake-supabase.mjs");
const chatModule = await import("../../supabase/functions/paige-ai-chat/index.ts");
const { capturedHandler } = await import("./stub-serve.mjs");
const handler = capturedHandler();

/**
 * Drive one caller shape through the real handler.
 *
 * `memberships` is what an UNORDERED `tenant_members` read would return — deliberately
 * ordered so its FIRST row is NOT the active tenant. That is the whole trap: a correct
 * handler must ignore this ordering entirely.
 */
async function drive({ personaTenant, personaSequence = null, memberships, kbRejects = false, bodyExtras = {}, noAuth = false, unauthenticated = false, chunkTitle = "Onboarding", chunkContent = "x", provider = ["text"] }) {
  const logged = [];
  resetEmbeds();
  const origWarn = console.warn;
  const origError = console.error;
  console.warn = (...a) => logged.push({ level: "warn", msg: a.join(" ") });
  console.error = (...a) => logged.push({ level: "error", msg: a.join(" ") });
  resetProvider(provider);
  let personaCall = 0;
  const personaStates = personaSequence ?? [personaTenant];

  const rec = fake.setScenario({
    authUser: unauthenticated ? null : { id: USER, email: "owner@example.test" },
    rpcs: {
      check_rate_limit: { data: true, error: null },
      get_paige_persona_context: () => {
        const state = personaStates[Math.min(personaCall++, personaStates.length - 1)];
        if (state && typeof state === "object" && "error" in state) return state;
        return {
          data: [{ tenant_id: state ?? null, tenant_name: null, playbook_config: null, playbook_slug: null, funding_enabled: false, brand: null }],
          error: null,
        };
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
  let responseText = "";
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
    if (res?.body) responseText = await res.text();
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
  return { rec, kbCall, memberReads, telemetry, logged, status, embeds: embedCalls(), providerCalls: [...providerCalls], responseText, syncCalls: [...syncCalls] };
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

// ── 12 · Active-account TOCTOU is closed at every provider boundary ─────────────
group("active-account changes after retrieval fail closed before provider egress");
{
  for (const [label, nextState] of [
    ["switches to a different account", AGENCY],
    ["becomes unresolved", null],
    ["membership is revoked", { data: null, error: { message: "not authorized", code: "42501" } }],
  ]) {
    const r = await drive({
      personaTenant: CHILD,
      personaSequence: [CHILD, nextState],
      memberships: [AGENCY, CHILD],
      chunkContent: "CHILD-PRIVATE-MARKER",
      provider: ["text"],
    });
    assert(`12 ${label}: no provider request is made`, r.providerCalls.length === 0, `provider calls: ${r.providerCalls.length}`);
    assert(`12 ${label}: no stale telemetry is written`, !r.telemetry, JSON.stringify(r.telemetry?.row ?? null));
    assert(`12 ${label}: the turn fails closed`, r.status === 409, `status ${r.status}`);
  }
}

group("active-account changes during the agent loop stop later provider calls");
{
  const r = await drive({
    personaTenant: CHILD,
    // initial resolution → initial provider boundary → post-round boundary →
    // actual tool-dispatch boundary (where the switch occurs)
    personaSequence: [CHILD, CHILD, CHILD, AGENCY],
    memberships: [AGENCY, CHILD],
    chunkContent: "CHILD-PRIVATE-MARKER",
    provider: ["tool", "text"],
  });
  assert("13.1 only the already-authorized first provider round runs", r.providerCalls.length === 1, `provider calls: ${r.providerCalls.length}`);
  assert("13.2 no stale telemetry is written after invalidation", !r.telemetry, JSON.stringify(r.telemetry?.row ?? null));
  // 13.3 previously asserted that no `plan_list` RPC was issued. That check could never fail:
  // in this harness `plan_list` returns an error result before it reaches its RPC even on a
  // fully valid turn, so `rec.rpc` never contains it under ANY scope and the assertion was
  // true by construction. The observable that actually distinguishes dispatched from refused
  // is the step trace — a dispatched tool is narrated as `0:tool-N`, a refused one is not.
  assert(
    "13.3 the tool proposed from stale Knowledge is never dispatched",
    !/"id":"0:tool-\d"/.test(r.responseText),
    r.responseText.slice(0, 300),
  );
  // An in-loop invalidation must reach the pre-emission gate as an ACCOUNT-CHANGE cancellation,
  // not as the generic could-not-finish fallback — the user is owed the real reason.
  //
  // WHAT THESE TWO DO NOT PROVE (§13). External review reported that the
  // `tenantKnowledgeScopeInvalidated ||` term on that gate is deletable with the suite green,
  // and inferred a behaviour change. The first half is true; the second is not reproducible.
  // Driving 21 shape/timing combinations (tool+text, tool+fail+text, tool+tool+text × switch at
  // persona calls 2..8), dropping that term produces byte-identical output. The reason is that
  // every site setting the flag does so immediately after the resolver returned false — which,
  // since the sticky fix, also latches `tenantKnowledgeScopeRevoked`, so the resolver alone
  // returns false from then on. The term is genuinely redundant now, as a CONSEQUENCE of that
  // fix. It is kept because it states intent at the gate and costs nothing, not because these
  // assertions pin it. They pin the message, which is a different and still-worth-having claim.
  assert(
    "13.5 an in-loop invalidation reaches the gate as an ACCOUNT-CHANGE cancellation",
    r.responseText.includes("active workspace changed"),
    r.responseText.slice(0, 300),
  );
  assert(
    "13.6 ...and not the generic could-not-finish fallback",
    !r.responseText.includes("couldn't finish"),
    r.responseText.slice(0, 300),
  );
  assert(
    "13.4 no later provider payload carries prior-account knowledge",
    !r.providerCalls.slice(1).some((body) => JSON.stringify(body).includes("CHILD-PRIVATE-MARKER")),
    JSON.stringify(r.providerCalls.slice(1)),
  );
}

// ── 14 · Document post-processing revalidates before provider and sync ──────────
group("document post-processing fails closed at provider and sync boundaries");
{
  async function driveDocumentPostProcess(scopeStates, { uploadId = null, plan = ["json-extraction"] } = {}) {
    resetProvider(plan);
    let scopeCall = 0;
    const writes = [];
    const service = {
      from(table) {
        return {
          insert(row) { writes.push({ table, op: "insert", row }); return Promise.resolve({ data: null, error: null }); },
          update(row) {
            writes.push({ table, op: "update", row });
            return { eq: async () => ({ data: null, error: null }) };
          },
        };
      },
    };
    const result = await chatModule.runStructuredExtractionAndSync(
      "CHILD-PRIVATE-MARKER",
      "AA==",
      USER,
      "Bearer test-jwt",
      "https://test.supabase.co",
      "service-role-key",
      service,
      null,
      uploadId,
      async () => scopeStates[Math.min(scopeCall++, scopeStates.length - 1)],
    );
    return { result, writes, providerCalls: [...providerCalls], syncCalls: [...syncCalls] };
  }

  const valid = await driveDocumentPostProcess([true]);
  assert("14.1 valid current scope reaches the extraction provider", valid.providerCalls.length === 1, `provider calls: ${valid.providerCalls.length}`);
  assert("14.2 valid current scope reaches sync", valid.syncCalls.length === 1, `sync calls: ${valid.syncCalls.length}`);

  for (const [label, states] of [
    ["switch before extraction", [false]],
    ["unresolved before extraction", [false]],
    ["revoked while extraction is in flight", [true, false]],
    ["switch before sync", [true, true, false]],
  ]) {
    const r = await driveDocumentPostProcess(states);
    const providerExpected = states[0] ? 1 : 0;
    assert(`14 ${label}: no unauthorized extraction provider call`, r.providerCalls.length === providerExpected, `provider calls: ${r.providerCalls.length}`);
    assert(`14 ${label}: no sync call`, r.syncCalls.length === 0, `sync calls: ${r.syncCalls.length}`);
    assert(`14 ${label}: no post-processing write`, r.writes.length === 0, JSON.stringify(r.writes));
    assert(`14 ${label}: reports active-account cancellation`, r.result?.step === "active_account_changed", JSON.stringify(r.result));
  }

  // ── 14b · EVERY durable write inside the helper re-asserts scope, not once per stage ──
  //
  // The stage checks above authorise a whole stage, and a stage is not instantaneous: two
  // awaited provider round-trips and a service-role sync happen between them. A single check
  // at the top of a stage authorises writes that begin seconds later, after the account has
  // changed. These writes are not counters — `logSyncFailure` persists the FULL extracted
  // credit report into `audit_logs`, and the post-sync stage writes `client_memory` and then
  // stamps the whole report into `credit_report_uploads.analysis_result`.
  const wrote = (r, table) => r.writes.some((w) => w.table === table);

  // (a) The validation-failure log. Scope holds through extraction, then goes while the response
  //     body drains — the failure path would otherwise persist `structured` under the old scope.
  const failPlan = ["json-extraction-invalid"];
  const validFail = await driveDocumentPostProcess([true], { plan: failPlan });
  assert(
    "14b.1 CONTROL — a validation failure under valid scope DOES write its audit log",
    wrote(validFail, "audit_logs"),
    JSON.stringify(validFail.writes.map((w) => w.table)),
  );
  const staleFail = await driveDocumentPostProcess([true, true, false], { plan: failPlan });
  assert(
    "14b.2 a validation failure after a switch writes NO audit log",
    !wrote(staleFail, "audit_logs"),
    JSON.stringify(staleFail.writes),
  );
  assert(
    "14b.3 ...and reports the cancellation, not the validation error",
    staleFail.result?.step === "active_account_changed",
    JSON.stringify(staleFail.result),
  );

  // (b) The two post-sync writes. Scope holds through the memory insert and goes while it is in
  //     flight, so the uploads stamp must be refused on its OWN assertion rather than riding on
  //     the one the insert passed.
  const validPost = await driveDocumentPostProcess([true], { uploadId: "upload-1" });
  assert(
    "14b.4 CONTROL — valid scope writes BOTH post-sync rows",
    wrote(validPost, "client_memory") && wrote(validPost, "credit_report_uploads"),
    JSON.stringify(validPost.writes.map((w) => w.table)),
  );
  const stalePost = await driveDocumentPostProcess([true, true, true, true, true, false], { uploadId: "upload-1" });
  assert(
    "14b.5 the memory row is written but the report stamp is refused on its own check",
    wrote(stalePost, "client_memory") && !wrote(stalePost, "credit_report_uploads"),
    JSON.stringify(stalePost.writes.map((w) => w.table)),
  );
  assert(
    "14b.6 ...and reports the cancellation",
    stalePost.result?.step === "active_account_changed",
    JSON.stringify(stalePost.result),
  );
}

group("attached-document turns DO carry tenant Knowledge, and its guard actually fires");
{
  // WHAT THIS GROUP USED TO ASSERT, AND WHY IT WAS WRONG. It previously asserted that a
  // document turn does NOT query tenant Knowledge — i.e. it encoded the `&& !attachedDocument`
  // exclusion as the intended behaviour and passed green. Two defects were being certified:
  //   (a) §58 — `main` grounds document turns in Knowledge; excluding them silently removed a
  //       shipped capability, and a passing check made that invisible.
  //   (b) The exclusion left `tenantKbScopeTenantId` null on precisely the path the document
  //       revalidation points protect, so every one of them returned `true` without asking the
  //       resolver. Group 14 kept passing because it drives the callback DIRECTLY with an
  //       injected stub; it can never observe that the real path passes an inert one.
  // So this group is now the integration proof group 14 cannot be: it drives the real handler
  // with a real attached document and asserts both that Knowledge flows and that a switched
  // account stops it.
  const document = {
    fileName: "operating-notes.docx",
    mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    kind: "docx",
    textContent: "Internal operating notes",
  };

  const valid = await drive({
    personaTenant: CHILD,
    personaSequence: [CHILD],
    memberships: [CHILD],
    chunkContent: "PRIVATE-KB-SOURCE-MARKER",
    bodyExtras: { document },
    // General-field extraction is best-effort and consumes the first test response;
    // the second is the real streamed chat response under test.
    provider: ["private-text", "private-text"],
  });
  assert("15.1 a document turn DOES query tenant Knowledge (§58 capability retained)", !!valid.kbCall, `rpcs seen: ${valid.rec.rpc.map((x) => x.name).join(", ") || "(none)"}`);
  assert("15.2 it queries the ACTIVE tenant", valid.kbCall?.args?.p_tenant_id === CHILD, `expected ${CHILD}, got ${valid.kbCall?.args?.p_tenant_id}`);
  assert(
    "15.3 the retrieved chunk reaches the document provider payload",
    valid.providerCalls.some((body) => JSON.stringify(body).includes("PRIVATE-KB-SOURCE-MARKER")),
    JSON.stringify(valid.providerCalls).slice(0, 400),
  );
  assert("15.4 telemetry is written for a scope that held", !!valid.telemetry, JSON.stringify(valid.telemetry?.row ?? null));
  assert("15.5 the existing document response path remains usable", valid.responseText.includes("CHILD-PRIVATE-MARKER"), valid.responseText);

  // THE LOAD-BEARING HALF. The account changes after retrieval. The document path must refuse
  // before its reply crosses the boundary, must write no telemetry, and must say so. If the
  // retrieval gate is ever narrowed to exclude documents again, `tenantKbScopeTenantId` goes
  // null, `holdDirectFramesForKnowledgeScope` goes false, the refusal never fires, and these
  // three fail — which is exactly the regression that shipped green last time.
  const switched = await drive({
    personaTenant: CHILD,
    personaSequence: [CHILD, AGENCY],
    memberships: [CHILD, AGENCY],
    chunkContent: "PRIVATE-KB-SOURCE-MARKER",
    bodyExtras: { document },
    provider: ["private-text", "private-text"],
  });
  assert(
    "15.6 a switched document turn withholds the reply",
    !switched.responseText.includes("CHILD-PRIVATE-MARKER"),
    switched.responseText.slice(0, 400),
  );
  assert(
    "15.7 a switched document turn reports the cancellation",
    switched.responseText.includes("ACTIVE_ACCOUNT_CHANGED"),
    switched.responseText.slice(0, 400),
  );
  assert(
    "15.8 a switched document turn writes no tenant Knowledge telemetry",
    !switched.telemetry,
    JSON.stringify(switched.telemetry?.row ?? null),
  );
  assert(
    "15.9 a switched document turn makes no provider call at all",
    switched.providerCalls.length === 0,
    `provider calls: ${switched.providerCalls.length}`,
  );

  // A switch that lands AFTER the pre-egress refusal has already passed. This exercises the
  // document stream's OWN close-boundary check rather than the 409 above — the point at which
  // the provider reply exists and `holdDirectFramesForKnowledgeScope` is holding it back.
  const lateSwitch = await drive({
    personaTenant: CHILD,
    personaSequence: [CHILD, CHILD, AGENCY],
    memberships: [CHILD, AGENCY],
    chunkContent: "PRIVATE-KB-SOURCE-MARKER",
    bodyExtras: { document },
    provider: ["private-text", "private-text"],
  });
  assert(
    "15.10a the late-switch case really reached the provider (else it is just the 409 again)",
    lateSwitch.providerCalls.length > 0,
    `provider calls: ${lateSwitch.providerCalls.length}`,
  );
  assert(
    "15.10 a late switch still withholds the held document reply",
    !lateSwitch.responseText.includes("CHILD-PRIVATE-MARKER"),
    lateSwitch.responseText.slice(0, 400),
  );
  assert(
    "15.11 a late switch streams the active-account cancellation",
    lateSwitch.responseText.includes("active workspace changed"),
    lateSwitch.responseText.slice(0, 400),
  );
  assert(
    "15.12 a late switch writes no tenant Knowledge telemetry",
    !lateSwitch.telemetry,
    JSON.stringify(lateSwitch.telemetry?.row ?? null),
  );
}


// ── 16 · The dispatch guard is asserted PER TOOL, not once per batch ──────────────
group("tool dispatch re-asserts scope for every tool, not once per round");
{
  // WHY THIS GROUP EXISTS. Reverting the dispatch check from per-tool back to per-batch
  // was undetectable by every other check in this file: a round with ONE tool behaves
  // identically either way, and every earlier group uses a one-tool round. A batch is not
  // instantaneous — one round can propose several tools and an early one can take seconds —
  // so a batch-level check authorises the whole list on the scope that held when the FIRST
  // tool ran. This group is the only thing standing between that and a green merge.
  //
  // HOW THE SWITCH IS TIMED. `personaSequence` is consumed one entry per
  // `get_paige_persona_context` call, clamped at the last entry, so `n` CHILDs followed by
  // AGENCY switches the account at call index `n`. The calls, in order, are:
  //   0 turn start (personaCtx)   1 pre-egress revalidation   2 post-round revalidation
  //   3 tool-1 dispatch           4 tool-2 dispatch           5 pre-continuation
  // so n=3 lands the switch on the FIRST tool's check and n=4 on the SECOND's.
  //
  // THE DISCRIMINATOR is the step trace. A mid-batch abort returns `scopeInvalidated` and the
  // caller breaks BEFORE narrating the round, so no `0:tool-*` step is emitted at all. With a
  // batch-level check at n=4 there is no second check to fail: both tools run, the round
  // completes, and BOTH steps are narrated (verified by mutation — this is not a guess).
  const stepIds = (text) => (text.match(/"id":"0:tool-\d"/g) || []).map((m) => m.slice(7, -1));
  const runTools = (n) => drive({
    personaTenant: CHILD,
    personaSequence: n === null ? [CHILD] : Array(n).fill(CHILD).concat([AGENCY]),
    memberships: n === null ? [CHILD] : [CHILD, AGENCY],
    chunkContent: "PRIVATE-KB-SOURCE-MARKER",
    provider: ["two-tools", "private-text"],
  });

  // HONEST NOTE (§13): of the six assertions here, only 16.4 discriminates per-tool from
  // per-batch — reverting the guard fails 16.4 alone (94/1). The others are controls and
  // adjacent-boundary coverage. Do not delete 16.4 believing its neighbours cover it; they
  // do not, and the suite will go green on the regression.
  const stable = await runTools(null);
  assert(
    "16.1 a stable scope dispatches BOTH tools of a two-tool round",
    stepIds(stable.responseText).length === 2,
    JSON.stringify(stepIds(stable.responseText)),
  );

  const beforeFirst = await runTools(3);
  assert(
    "16.2 a switch before the first tool dispatches neither",
    stepIds(beforeFirst.responseText).length === 0,
    JSON.stringify(stepIds(beforeFirst.responseText)),
  );
  assert(
    "16.3 a switch before the first tool makes no continuation provider call",
    beforeFirst.providerCalls.length === 1,
    `provider calls: ${beforeFirst.providerCalls.length}`,
  );

  const betweenTools = await runTools(4);
  assert(
    "16.4 a switch BETWEEN the two tools aborts the round (per-tool guard, not per-batch)",
    stepIds(betweenTools.responseText).length === 0,
    `narrated steps: ${JSON.stringify(stepIds(betweenTools.responseText))} — a batch-level check narrates both`,
  );
  assert(
    "16.5 a switch between the two tools makes no continuation provider call",
    betweenTools.providerCalls.length === 1,
    `provider calls: ${betweenTools.providerCalls.length}`,
  );
  assert(
    "16.6 a switch between the two tools writes no tenant Knowledge telemetry",
    !betweenTools.telemetry,
    JSON.stringify(betweenTools.telemetry?.row ?? null),
  );
}


// ── 17 · The durable record is written at the LAST boundary, not the first ────────
group("Knowledge telemetry commits only after the reply has actually crossed");
{
  // Telemetry is the one DURABLE row this mechanism writes, so it is committed after the
  // reply has been forwarded and the scope re-asserted a final time — not before the frames,
  // where a later cancellation would leave a permanent record claiming a retrieval grounded
  // a reply that never legitimately landed. Moving the commit back above the reply is
  // otherwise invisible: every earlier group either cancels before the reply (so no telemetry
  // either way) or holds scope throughout (so telemetry either way).
  //
  // Call indices on a tool-less agentic round: 0 turn start, 1 pre-egress, 2 post-round,
  // 3 pre-emission, 4 post-drain. n=4 therefore switches the account at the post-drain
  // boundary ALONE — the reply is already out, and only the durable write is left to refuse.
  const atPostDrain = await drive({
    personaTenant: CHILD,
    personaSequence: [CHILD, CHILD, CHILD, CHILD, AGENCY],
    memberships: [CHILD, AGENCY],
    chunkContent: "PRIVATE-KB-SOURCE-MARKER",
    provider: ["private-text"],
  });
  assert(
    "17.1 the reply really did cross first (else this is testing an earlier boundary)",
    atPostDrain.responseText.includes("CHILD-PRIVATE-MARKER"),
    atPostDrain.responseText.slice(0, 300),
  );
  assert(
    "17.2 no telemetry row is written when scope lapses at the post-drain boundary",
    !atPostDrain.telemetry,
    JSON.stringify(atPostDrain.telemetry?.row ?? null),
  );

  // The positive half: an unbroken scope must still record its retrieval, or 17.2 could be
  // satisfied by telemetry that simply never writes.
  const held = await drive({
    personaTenant: CHILD,
    personaSequence: [CHILD],
    memberships: [CHILD, AGENCY],
    chunkContent: "PRIVATE-KB-SOURCE-MARKER",
    provider: ["private-text"],
  });
  assert("17.3 an unbroken scope does write its telemetry row", !!held.telemetry, JSON.stringify(held.telemetry ?? null));
  assert("17.4 that row carries the ACTIVE tenant", held.telemetry?.row?.tenant_id === CHILD, JSON.stringify(held.telemetry?.row ?? null));

  // The boundary one call EARLIER is the pre-emission gate: the round is finished and the
  // reply is assembled, but nothing has been written to the wire yet. That one must withhold
  // the reply itself, not merely the telemetry — asserted separately so removing it fails for
  // its own reason rather than as a side effect of shifting later call indices.
  const atPreEmission = await drive({
    personaTenant: CHILD,
    personaSequence: [CHILD, CHILD, CHILD, AGENCY],
    memberships: [CHILD, AGENCY],
    chunkContent: "PRIVATE-KB-SOURCE-MARKER",
    provider: ["private-text"],
  });
  assert(
    "17.5 a lapse at the pre-emission boundary withholds the reply itself",
    !atPreEmission.responseText.includes("CHILD-PRIVATE-MARKER"),
    atPreEmission.responseText.slice(0, 300),
  );
  assert(
    "17.6 a lapse at the pre-emission boundary streams the cancellation instead",
    atPreEmission.responseText.includes("active workspace changed"),
    atPreEmission.responseText.slice(0, 300),
  );
}


// ── 18 · Each loop-continuation boundary is individually load-bearing ─────────────
group("every provider re-entry in the agent loop re-asserts scope on its own");
{
  // The loop re-asserts scope at three distinct points and, until this group existed, TWO of
  // them could be deleted with the suite still fully green — the surviving checks happened to
  // catch the switch at a neighbouring boundary instead. A guard that no check can distinguish
  // from its neighbour is a guard nobody will notice losing. Each assertion below pins ONE
  // boundary by timing the switch to land exactly on it (indices, single-tool round:
  //   0 turn start · 1 pre-egress · 2 post-round · 3 tool dispatch · 4 pre-continuation
  //   · 5 pre-closing-call · 6 pre-emission · 7 post-drain)
  // and by counting provider calls, which is the only signal that separates "the next call was
  // never made" from "it was made and its result was later suppressed".
  //
  // THE TABLE ABOVE IS ONLY VALID FOR THE FAILED-CONTINUATION SHAPE both assertions below
  // drive. When the continuation SUCCEEDS there is no closing call, and index 5 is the second
  // round's post-round check instead of the pre-closing-call one. No assertion here is wrong —
  // 18.3 proves the failed-continuation path was actually taken — but do not time a new switch
  // off this table without re-deriving it for the round shape you are driving. Groups 16 and 17
  // carry their own tables, which are correct for the shapes they drive.

  // (a) PRE-CONTINUATION — after a tool round is folded into `convo`, before the next model
  //     call. `convo` carries the Knowledge-grounded system prompt, so a continuation issued
  //     after a switch re-sends the prior account's private content to the provider.
  const atContinuation = await drive({
    personaTenant: CHILD,
    personaSequence: [CHILD, CHILD, CHILD, CHILD, AGENCY],
    memberships: [CHILD, AGENCY],
    chunkContent: "CHILD-PRIVATE-MARKER",
    provider: ["tool", "text"],
  });
  assert(
    "18.1 a switch at the continuation boundary makes no second provider call",
    atContinuation.providerCalls.length === 1,
    `provider calls: ${atContinuation.providerCalls.length} — removing that check lets the continuation fire`,
  );
  assert(
    "18.2 no continuation payload carries the prior account's Knowledge",
    !atContinuation.providerCalls.slice(1).some((body) => JSON.stringify(body).includes("CHILD-PRIVATE-MARKER")),
    JSON.stringify(atContinuation.providerCalls.slice(1)).slice(0, 400),
  );

  // (b) PRE-CLOSING-CALL — the loop terminated early (here: the continuation round failed
  //     upstream) and the handler is about to issue a tools-less CLOSING call to produce a
  //     reply. That call carries `convo` too, so it needs its own assertion; it is reached on
  //     a different code path from (a) and cannot be covered by it.
  const atClosingCall = await drive({
    personaTenant: CHILD,
    personaSequence: [CHILD, CHILD, CHILD, CHILD, CHILD, AGENCY],
    memberships: [CHILD, AGENCY],
    chunkContent: "CHILD-PRIVATE-MARKER",
    provider: ["tool", "fail", "text"],
  });
  assert(
    "18.3 the failed-continuation path really was reached (else 18.4 proves nothing)",
    atClosingCall.providerCalls.length >= 2,
    `provider calls: ${atClosingCall.providerCalls.length}`,
  );
  assert(
    "18.4 a switch at the closing-call boundary makes no closing provider call",
    atClosingCall.providerCalls.length === 2,
    `provider calls: ${atClosingCall.providerCalls.length} — removing that check lets the closing call fire`,
  );
  assert(
    "18.5 the closing path writes no stale telemetry",
    !atClosingCall.telemetry,
    JSON.stringify(atClosingCall.telemetry?.row ?? null),
  );
}


// ── 19 · A refusal is STICKY — the guard must not erase its own evidence ──────────
group("once refused, every later revalidation stays refused");
{
  // THE DEFECT THIS PINS (found by external review on 4f982d0e9, reproduced here before it was
  // fixed). `revalidateTenantKnowledgeScope` clears `tenantKbContext` and `tenantKbScopeTenantId`
  // when it refuses — which is precisely the condition its own early return reads as "no
  // Knowledge was retrieved, nothing to protect, proceed". So the first call after a switch
  // returned false and every call after that returned TRUE. The guard destroyed its own
  // evidence and then took the absence of evidence as permission.
  //
  // A credit-report document turn is where that becomes a leak rather than a curiosity, because
  // it is the one path that checks scope TWICE around a slow stage: once via the callback handed
  // to `runStructuredExtractionAndSync`, and again in the caller when the helper returns. A
  // switch during extraction refused the first and passed the second, so the buffered
  // prior-workspace reply held by `holdDirectFramesForKnowledgeScope` was flushed to the client.
  // The entire suite was green while this was true, which is the whole reason this group exists.
  const pdf = { fileName: "report.pdf", mimeType: "application/pdf", kind: "pdf", base64: "AA==" };
  // Persistence is the OTHER durable effect at the close of a document turn, and it is invisible
  // to every assertion above — they read the stream and the telemetry table. A revision that
  // moved the telemetry commit behind the flush check and left `persistAssistantTurn` in FRONT
  // of it withheld the reply from the wire and still wrote it permanently into the thread, where
  // a reload renders it and the rolling summary folds it in. Withholding a reply from the wire
  // while saving it to the database is not a refusal, so `paige_chat_turn_append` is asserted
  // on directly. A `threadId` is required to reach that path at all.
  const THREAD = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
  //
  // Filtered to `p_role === "assistant"`: the same RPC also appends the USER's turn before the
  // model call, so a bare name match is true on every threaded turn and would assert nothing.
  const persisted = (r) => r.rec.rpc.some(
    (c) => c.name === "paige_chat_turn_append" && c.args?.p_role === "assistant",
  );
  // The THIRD durable effect at the close of a turn, and the one I got wrong by judgement. The
  // word "analytics" reads as scope-free counters; `lender_searched` actually stores a
  // `lender_name` lifted out of the reply text and feeds an operator dashboard, and
  // `legal_flag_shown` records that content was shown when it was withheld. They are
  // fire-and-forget inserts, so nothing retracts them once started. Asserted on the table
  // directly — a turn the user was told was stopped writes no rows.
  const analytics = (r) => r.rec.inserts.filter((i) => i.table === "analytics_events");
  const creditTurn = (personaSequence, memberships, extra = {}) => drive({
    personaTenant: CHILD,
    personaSequence,
    memberships,
    chunkContent: "PRIVATE-KB-SOURCE-MARKER",
    bodyExtras: { document: pdf, ...extra },
    // read-check routes to the credit-report branch · the chat reply · the extraction call.
    // The reply is `lender-text` rather than plain `private-text` so it TRIPS the response-derived
    // analytics extractors. With a reply that matches none of them, "no analytics row was
    // written" is true whatever the gate does, and the assertion below proves nothing — which is
    // exactly how the first version of it passed while the defect was still present.
    provider: ["read-check", "lender-text", "json-extraction"],
  });

  // POSITIVE CONTROL FIRST. Without it, "the marker never appeared" and "the marker was
  // correctly withheld" are indistinguishable, and every assertion below would be satisfied by
  // a fixture that simply never produces a reply.
  const stable = await creditTurn([CHILD], [CHILD]);
  assert(
    "19.1 CONTROL — an unbroken credit-report turn does deliver its reply",
    stable.responseText.includes("CHILD-PRIVATE-MARKER"),
    stable.responseText.slice(0, 300),
  );
  assert("19.2 CONTROL — and it really did retrieve Knowledge", !!stable.kbCall, JSON.stringify(stable.kbCall ?? null));
  assert("19.3 CONTROL — and it really did reach sync", stable.syncCalls.length === 1, `sync calls: ${stable.syncCalls.length}`);

  // The persistence control has to be its own run: without a threadId the persist path is a
  // no-op, so asserting "nothing was persisted" on a switched turn would otherwise be true for
  // a reason that has nothing to do with scope.
  assert(
    "19.3b CONTROL — an unbroken turn DOES write its response-derived analytics",
    stable.rec.inserts.some((i) => i.table === "analytics_events"),
    JSON.stringify(stable.rec.inserts.map((i) => i.table)),
  );

  const stableThread = await creditTurn([CHILD], [CHILD], { threadId: THREAD });
  assert(
    "19.4 CONTROL — an unbroken credit-report turn DOES persist its reply",
    persisted(stableThread),
    JSON.stringify(stableThread.rec.rpc.map((c) => c.name)),
  );

  // Every switch timing from the document close-boundary through the extraction stages and out
  // to the caller's OWN post-sync recheck. Each of 2..6 leaked the prior workspace's reply
  // before the sticky flag; each must now withhold it.
  //
  // WHY 7 IS IN THIS LIST, and why leaving it out was a real hole. Timings 2..6 are all
  // absorbed by the sticky flag set INSIDE the sync helper, so none of them exercises the
  // outer `revalidateTenantKnowledgeScope()` that runs when the helper returns. With the loop
  // stopping at 6, that entire outer block could be deleted and the suite stayed at 113/0 —
  // while a switch landing at 7 leaked the reply AND wrote `kb_query_telemetry`. A boundary no
  // check can distinguish from its neighbours is one a future edit deletes as redundant.
  //
  // THE UPPER BOUND IS DERIVED, NOT WRITTEN DOWN, and that is the point. It was hardcoded twice
  // and rotted twice: a valid credit-report turn made nine persona calls, so the ninth — the
  // flush boundary's own resolver — sat outside a loop that stopped at 7; and when per-write
  // guards were later added inside the sync helper the count became ten, silently pushing the
  // last boundary outside a loop that had just been corrected to 8. Both times the suite stayed
  // green while a real boundary went unexercised. Counting the calls the control run actually
  // makes means adding or moving a guard re-aims these timings automatically instead of quietly
  // aiming them at nothing.
  //
  // Indices run 0..TOTAL-1, so TOTAL-1 is the last boundary there is; n >= TOTAL is not a switch
  // case at all, because the persona sequence runs out before the account ever changes.
  const TOTAL = stable.rec.rpc.filter((c) => c.name === "get_paige_persona_context").length;
  assert(
    "19.0 the control run makes enough persona calls for these timings to mean anything",
    TOTAL >= 9,
    `total persona calls: ${TOTAL} — if this collapsed, the loop below is empty and proves nothing`,
  );
  for (let n = 2; n <= TOTAL - 1; n++) {
    const r = await creditTurn(Array(n).fill(CHILD).concat([AGENCY]), [CHILD, AGENCY]);
    assert(
      `19 switch at persona call ${n}: the prior workspace's reply is never flushed`,
      !r.responseText.includes("CHILD-PRIVATE-MARKER"),
      r.responseText.slice(0, 300),
    );
    assert(
      `19 switch at persona call ${n}: the cancellation is reported instead`,
      /active workspace changed|ACTIVE_ACCOUNT_CHANGED/.test(r.responseText),
      r.responseText.slice(0, 300),
    );
    assert(
      `19 switch at persona call ${n}: no stale Knowledge telemetry`,
      !r.telemetry,
      JSON.stringify(r.telemetry?.row ?? null),
    );
    const rt = await creditTurn(Array(n).fill(CHILD).concat([AGENCY]), [CHILD, AGENCY], { threadId: THREAD });
    assert(
      `19 switch at persona call ${n}: the withheld reply is not persisted to the thread either`,
      !persisted(rt),
      JSON.stringify(rt.rec.rpc.map((c) => c.name)),
    );
    assert(
      `19 switch at persona call ${n}: no response-derived analytics row is written`,
      analytics(r).length === 0,
      JSON.stringify(analytics(r).map((i) => i.row?.event_name)),
    );
  }
}

console.log(`\n${checks - failures} passed, ${failures} failed`);
process.exit(failures === 0 ? 0 : 1);
