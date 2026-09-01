/**
 * P1 — CROSS-CLIENT MEMORY AUTHORIZATION.
 *
 * `paige-ai-chat` loaded client memory with the SERVICE-ROLE client, keyed on the
 * request-body `clientId`. Service role means `auth.uid()` is NULL, so RLS and every
 * SECURITY DEFINER caller-guard are exempt BY CONSTRUCTION — a caller could name any client
 * UUID and receive that client's memories, preferences and past chat snippets, injected
 * verbatim into the prompt.
 *
 * These checks drive the REAL shipped handler with a real `Request`. Only the module
 * boundary is faked (Deno's serve, @supabase/supabase-js, the Voyage fetch). Nothing here
 * passes on a string match against source.
 *
 * Run: node --import ./scripts/client-memory-authz/register.mjs scripts/client-memory-authz/check.mjs
 */

const USER    = "44444444-4444-4444-8444-444444444444";
const OWN     = "55555555-5555-4555-8555-555555555555"; // a client this caller may read
const FOREIGN = "66666666-6666-4666-8666-666666666666"; // another tenant's client
const NULLTEN = "77777777-7777-4777-8777-777777777777"; // client row with tenant_id NULL
const OTHERTEN = "88888888-8888-4888-8888-888888888888"; // visible via a non-tenant policy, other workspace
const CALLER_TENANT = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OTHER_TENANT  = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

/** Tenant-neutral on purpose: survives `sanitizeClientContextForTier` for a non-funding tenant,
 *  so a missing block means the GUARD dropped it, not the sanitizer. */
const CLIENT_CTX = "Focused client file: current stage is onboarding, last review 12 days ago.";

const VECTOR = Array.from({ length: 1024 }, (_, i) => (i % 7) / 10);

let failures = 0, checks = 0;
function assert(label, cond, detail) {
  checks += 1;
  if (cond) console.log(`  ok   ${label}`);
  else { failures += 1; console.log(`  FAIL ${label}`); if (detail !== undefined) console.log(`         ${detail}`); }
}

globalThis.Deno = {
  env: { get: (k) => ({
    SUPABASE_URL: "https://test.supabase.co", SUPABASE_ANON_KEY: "anon-key",
    SUPABASE_SERVICE_ROLE_KEY: "service-role-key", VOYAGE_API_KEY: "test-voyage-key",
    ANTHROPIC_API_KEY: "test-anthropic-key",
  })[k] ?? "" },
};

let embedCount = 0;
/**
 * OFF by default. With no model stub every turn 500s before the response stream is built, so
 * anything the handler EMITS to the caller is unobservable — which is why the refusal signal
 * could not be witnessed at first. Turning it on per-scenario keeps every existing check
 * driving the exact same path it drove before, while making the stream itself drivable.
 */
let modelStub = false;
/** What `runDocumentReadCheck` should answer. Set per scenario to reach the credit-report branch. */
let readCheckReply = { can_read_document: false, document_kind: "other", first_five_account_names: [] };
/** When set, the FIRST streamed round emits a tool call instead of an answer. */
let toolCallOnce = false;
/** When set, the model stub replays any confirm_token it is handed — a self-approving model. */
let selfApprove = false;
let selfApproveReplays = 0;
let toolCallSpec = { name: "update_client_data", args: {} };
/** Every request body sent to the model this turn — the real prompt/model EGRESS surface. */
let modelEgress = [];
/** Every non-model outbound call this turn — the sibling-function surface (write-back, sync). */
let outboundCalls = [];
/**
 * An Anthropic-native tool_use stream. `gatewayCompat` converts it to OpenAI-compat deltas, so
 * the handler's agentic loop sees a real tool call. Without this the whole tool loop — where
 * Paige acts on the focused client — was unreachable by any check.
 */
const sseToolCallReply = (name, args) =>
  new Response(
    [
      `event: message_start\ndata: ${JSON.stringify({ type: "message_start", message: { usage: { input_tokens: 1, output_tokens: 1 } } })}\n\n`,
      `event: content_block_start\ndata: ${JSON.stringify({ type: "content_block_start", index: 0, content_block: { type: "tool_use", id: "toolu_test", name } })}\n\n`,
      `event: content_block_delta\ndata: ${JSON.stringify({ type: "content_block_delta", index: 0, delta: { type: "input_json_delta", partial_json: JSON.stringify(args) } })}\n\n`,
      `event: message_delta\ndata: ${JSON.stringify({ type: "message_delta", delta: { stop_reason: "tool_use" } })}\n\n`,
      `event: message_stop\ndata: ${JSON.stringify({ type: "message_stop" })}\n\n`,
    ].join(""),
    { status: 200, headers: { "Content-Type": "text/event-stream" } },
  );

const sseModelReply = (text) =>
  new Response(
    [
      `data: ${JSON.stringify({ type: "message_start", message: { usage: { input_tokens: 1, output_tokens: 1 } } })}\n\n`,
      `data: ${JSON.stringify({ type: "content_block_delta", delta: { type: "text_delta", text } })}\n\n`,
      `data: ${JSON.stringify({ type: "message_delta", delta: { stop_reason: "end_turn" } })}\n\n`,
      `data: ${JSON.stringify({ type: "message_stop" })}\n\n`,
    ].join(""),
    { status: 200, headers: { "Content-Type": "text/event-stream" } },
  );

globalThis.fetch = async (url, init) => {
  const href = String(url);
  if (href.includes("voyageai.com")) {
    embedCount += 1;
    return new Response(JSON.stringify({ data: [{ index: 0, embedding: VECTOR }] }), {
      status: 200, headers: { "Content-Type": "application/json" },
    });
  }
  if (href.includes("anthropic.com")) modelEgress.push(String(init?.body ?? ""));
  else if (!href.includes("voyageai.com")) {
    outboundCalls.push({ url: href, body: String(init?.body ?? "") });
    return new Response(JSON.stringify({ success: true }), { status: 200, headers: { "Content-Type": "application/json" } });
  }
  if (modelStub && href.includes("anthropic.com")) {
    const wantsStream = (() => {
      try { return JSON.parse(String(init?.body ?? "{}")).stream === true; } catch { return false; }
    })();
    if (wantsStream) {
      // A MODEL THAT TRIES TO APPROVE ITSELF. It reads the `confirm_token` out of the tool result
      // it was just handed — which is exactly what an LLM sees in its own context — and re-emits
      // the same call carrying it. No human, no request-body echo, one round later. This is not a
      // contrived stub: it is the cheapest thing a competent model does when a tool result says
      // "call this again with confirm_token".
      if (selfApprove) {
        const tok = String(init?.body ?? "").replace(/\\"/g, '"').match(/"confirm_token":"([0-9a-f]{16})"/);
        if (tok) { selfApproveReplays += 1; return sseToolCallReply(toolCallSpec.name, { confirm_token: tok[1] }); }
      }
      if (toolCallOnce) { toolCallOnce = false; return sseToolCallReply(toolCallSpec.name, toolCallSpec.args); }
      return sseModelReply("ok");
    }
    // Answer the document READ-CHECK with the JSON it expects, so `isCreditReportPdf` can be
    // true and the credit-report upload branch is reachable at all. Match on the outbound body:
    // `gatewayCompat` reshapes the request to Anthropic-native before it reaches fetch, so the
    // caller's `response_format` is gone by here and cannot be used to identify the call. The
    // reply must be Anthropic-shaped too — the gateway converts it back to `choices[0].message`.
    const isReadCheck = String(init?.body ?? "").includes("verify that you can literally read the PDF");
    const text = isReadCheck ? JSON.stringify(readCheckReply) : "ok";
    return new Response(
      JSON.stringify({
        id: "msg_test", type: "message", role: "assistant", model: "test",
        content: [{ type: "text", text }],
        stop_reason: "end_turn",
        usage: { input_tokens: 1, output_tokens: 1 },
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  }
  throw new Error(`client-memory-authz: unexpected outbound fetch to ${href}`);
};

const fake = await import("./fake-supabase.mjs");
await import("../../supabase/functions/paige-ai-chat/index.ts");
const { capturedHandler } = await import("./stub-serve.mjs");
const handler = capturedHandler();

const MEMORY_TEXT = "SECRET-CLIENT-MEMORY-CONTENT";

/**
 * `clientRows` models the `clients` table AS RLS WOULD RETURN IT for this caller: OWN is
 * visible with a tenant, NULLTEN is visible but tenant-less (the `tenant_isolation` policy
 * admits `tenant_id IS NULL` to ANY authenticated user — which is exactly why the handler
 * must exclude it), FOREIGN is invisible.
 */
async function drive({
  clientId,
  clientsError = null,
  memoryReadError = null,
  text = "what do you know about me?",
  // The cross-tenant bypass. `undefined` keeps the default non-operator result; pass a full
  // `{ data, error }` to model an operator, or an errored authority check.
  ownerRpc = { data: false, error: null },
  document = undefined,
  stream = false,
  clientContext = undefined,
  readCheck = { can_read_document: false, document_kind: "other", first_five_account_names: [] },
  extraBody = undefined,
  toolCall = undefined,
  /** Per-drive RPC overrides, merged over the defaults below. Needed since `update_client_data`
   *  became autonomy-gated: proving the tool loop still reaches write-back requires driving a
   *  tenant that has deliberately set that tool to `auto`. */
  rpcOverrides = {},
  /** Extra RLS-emulating tables merged over the defaults — needed for the confirm store, whose
   *  rows a scenario has to author because they model a claim that mutates as it is read. */
  tablesExtra = {},
  /** Inject a postgrest error for a specific table, to drive the "the write was REJECTED" path. */
  tableErrorsExtra = {},
  /** Drive a model that replays the confirm_token it was handed, with NO human and no body echo. */
  selfApproving = false,
  /** Called synchronously on every insert, so a scenario can model read-your-own-write. */
  onInsert = undefined,
}) {
  const logged = [];
  embedCount = 0;
  modelEgress = [];
  outboundCalls = [];
  modelStub = stream;
  readCheckReply = readCheck;
  toolCallOnce = !!toolCall;
  if (toolCall) toolCallSpec = toolCall;
  selfApprove = selfApproving;
  selfApproveReplays = 0;
  const origError = console.error, origWarn = console.warn;
  console.error = (...a) => logged.push({ level: "error", msg: a.join(" ") });
  console.warn = (...a) => logged.push({ level: "warn", msg: a.join(" ") });

  const rec = fake.setScenario({
    onInsert,
    authUser: { id: USER, email: "owner@example.test" },
    rpcs: {
      check_rate_limit: { data: true, error: null },
      current_user_tenant_id: { data: CALLER_TENANT, error: null },
      is_platform_operator: { data: false, error: null },
      is_platform_owner: ownerRpc,
      get_paige_persona_context: { data: [{ tenant_id: null, tenant_name: null, playbook_config: null, playbook_slug: null, funding_enabled: false, brand: null }], error: null },
      match_paige_memory: { data: [{ source: "memory", memory_type: "user_preference", content: MEMORY_TEXT, similarity: 0.95 }], error: null },
      ...rpcOverrides,
    },
    tableErrors: { ...(clientsError ? { clients: clientsError } : {}), ...(memoryReadError ? { client_memory: memoryReadError } : {}), ...tableErrorsExtra },
    // What the SERVICE-ROLE client sees: everything, including the foreign client. This is the
    // hazard itself — if the authorization read is made with this client, a foreign id resolves.
    serviceTables: {
      client_memory: (filters) => (filters.some((f) => f[0] === "gte" && f[1] === "created_at") ? [] : [{ memory_type: "user_preference", content: MEMORY_TEXT, created_at: new Date().toISOString() }]),
      clients: (filters) => {
        const idEq = filters.find((f) => f[0] === "eq" && f[1] === "id")?.[2];
        return idEq ? [{ id: idEq, tenant_id: "99999999-9999-4999-8999-999999999999" }] : [];
      },
    },
    tables: {
      // RLS emulation: only rows this caller may see, and only when the filters match.
      clients: (filters) => {
        const idEq = filters.find((f) => f[0] === "eq" && f[1] === "id")?.[2];
        const excludesNullTenant = filters.some((f) => f[0] === "not" && f[1] === "tenant_id");
        if (idEq === OWN) return [{ id: OWN, tenant_id: CALLER_TENANT }];
        // Visible to this caller via a NON-TENANT policy (coach/cs_rep/sales_rep assignment),
        // but owned by another workspace. "Visible to me" is NOT "may read this client's
        // memory" — the residual bypass the review found.
        if (idEq === OTHERTEN) return [{ id: OTHERTEN, tenant_id: OTHER_TENANT }];
        if (idEq === NULLTEN) return excludesNullTenant ? [] : [{ id: NULLTEN, tenant_id: null }];
        return []; // FOREIGN: invisible under RLS
      },
      // The dedupe probe on the WRITE path selects `id` with a 7-day `gte` window. Returning a
      // row there makes the handler think a duplicate exists and skip the insert — which is
      // exactly why the write assertions passed vacuously at first. Return nothing for the
      // dedupe shape so the insert is genuinely reached and can be witnessed.
      client_memory: (filters) => {
        const isDedupe = filters.some((f) => f[0] === "gte" && f[1] === "created_at");
        if (isDedupe) return [];
        return [{ memory_type: "user_preference", content: MEMORY_TEXT, created_at: new Date().toISOString() }];
      },
      ...tablesExtra,
    },
  });

  let status = null, bodyText = "";
  try {
    const res = await handler(new Request("http://local/paige-ai-chat", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer test-jwt" },
      body: JSON.stringify({
        messages: [{ role: "user", content: text }],
        ...(clientId !== undefined ? { clientId } : {}),
        ...(document !== undefined ? { document } : {}),
        ...(clientContext !== undefined ? { clientContext } : {}),
        ...(extraBody ?? {}),
      }),
    }));
    status = res.status;
    try { bodyText = await res.text(); } catch { /* streamed */ }
  } catch (e) { status = "throw:" + (e?.message ?? e); }
  modelStub = false;
  toolCallOnce = false;
  selfApprove = false;

  console.error = origError; console.warn = origWarn;
  const memoryReads = rec.from.filter((f) => f.table === "client_memory" && f.op === "select");
  const memoryRpc = rec.rpc.filter((r) => r.name === "match_paige_memory");
  return { rec, status, bodyText, logged, embeds: embedCount, memoryReads, memoryRpc, modelEgress: [...modelEgress], outboundCalls: [...outboundCalls], selfApproveReplays };
}

console.log("\nauthorized paths still work (no regression)");
{
  const noClient = await drive({ clientId: undefined });
  assert("1.1 with NO clientId, memory is read scoped to the caller's own user id",
    noClient.memoryReads.some((r) => r.filters.some((f) => f[0] === "eq" && f[1] === "client_user_id" && f[2] === USER)),
    JSON.stringify(noClient.memoryReads.map((r) => r.filters)));
  assert("1.2 …and never keyed on a client_id",
    !noClient.memoryReads.some((r) => r.filters.some((f) => f[0] === "eq" && f[1] === "client_id")));

  const own = await drive({ clientId: OWN });
  assert("1.3 an AUTHORIZED client's memory is still retrieved",
    own.memoryReads.some((r) => r.filters.some((f) => f[0] === "eq" && f[1] === "client_id" && f[2] === OWN)),
    JSON.stringify(own.memoryReads.map((r) => r.filters)));
  assert("1.4 …and the semantic RPC is called with that AUTHORIZED id, never the raw body value",
    own.memoryRpc.length > 0 && own.memoryRpc.every((r) => r.args._target_client_id === OWN),
    JSON.stringify(own.memoryRpc.map((r) => r.args._target_client_id)));
  assert("1.5 …and authorization is proven through the CALLER'S client, excluding NULL-tenant rows",
    own.rec.from.some((f) => f.table === "clients"
      && f.filters.some((x) => x[0] === "eq" && x[1] === "id" && x[2] === OWN)
      && f.filters.some((x) => x[0] === "not" && x[1] === "tenant_id")),
    JSON.stringify(own.rec.from.filter((f) => f.table === "clients").map((f) => f.filters)));
}

console.log("\nunauthorized client context fails closed BEFORE any memory is read");
{
  const foreign = await drive({ clientId: FOREIGN });
  assert("2.1 a FOREIGN client id retrieves NO memory at all",
    foreign.memoryReads.length === 0, JSON.stringify(foreign.memoryReads.map((r) => r.filters)));
  assert("2.2 …the semantic memory RPC is never called",
    foreign.memoryRpc.length === 0, JSON.stringify(foreign.memoryRpc.map((r) => r.args)));
  // The MEMORY embedding is the one this boundary controls. The RAG block embeds the same
  // question on its own path and is out of this slice's scope, so assert the DIFFERENCE against
  // an authorized run rather than a global zero — a global-zero assertion is simply false, and
  // passing it would mean weakening the check until it agreed with the code.
  const authorizedForEmbeds = await drive({ clientId: OWN });
  assert("2.3 …the memory embedding (a paid call) is skipped versus an authorized turn",
    foreign.embeds < authorizedForEmbeds.embeds,
    `refused: ${foreign.embeds}, authorized: ${authorizedForEmbeds.embeds}`);
  // NOTE: an earlier 2.4 asserted the response body carries no memory text. That was VACUOUS —
  // ANTHROPIC_API_KEY is "" in this harness so every turn 500s and no body ever contains it,
  // fixed or not. Replaced with what is actually observable: nothing was read to put there.
  assert("2.4 …no client_memory row is read at all, so none can reach the prompt",
    !foreign.rec.from.some((f) => f.table === "client_memory" && f.op === "select"),
    JSON.stringify(foreign.rec.from.filter((f) => f.table === "client_memory")));
  assert("2.5 …and the refusal is logged at ERROR with its reason",
    foreign.logged.some((l) => l.level === "error" && /client scope REFUSED/.test(l.msg) && /not authorized/.test(l.msg)),
    JSON.stringify(foreign.logged.map((l) => `${l.level}:${l.msg.slice(0, 90)}`)));
  assert("2.6 …and the rejected id is never echoed into the log",
    !foreign.logged.some((l) => l.msg.includes(FOREIGN)),
    JSON.stringify(foreign.logged.map((l) => l.msg.slice(0, 120))));

  const nullTenant = await drive({ clientId: NULLTEN });
  assert("2.7 a NULL-TENANT client row is refused (the tenant_isolation policy admits it to anyone)",
    nullTenant.memoryReads.length === 0 && nullTenant.memoryRpc.length === 0,
    JSON.stringify({ reads: nullTenant.memoryReads.length, rpc: nullTenant.memoryRpc.length }));

  const malformed = await drive({ clientId: "not-a-uuid" });
  // MALFORMED is rejected UPSTREAM by the request schema (`clientId: z.string().uuid()`), which
  // 400s the whole request before any handler logic runs — stronger than an in-handler refusal.
  // This asserts the REAL behaviour, not the behaviour I first assumed. There is NO in-handler
  // UUID guard: an earlier draft added a `UUID_RE` constant that was never referenced, and this
  // comment used to claim it existed and was "documented as schema-drift defence" — a §13 drift
  // between the proof and the code. The dead constant is deleted; the schema is the whole guard.
  assert("2.8 a MALFORMED client id is rejected by the request schema with 400",
    malformed.status === 400, `status: ${malformed.status}`);
  assert("2.9 …and no memory work of any kind is performed",
    malformed.memoryReads.length === 0 && malformed.memoryRpc.length === 0
      && !malformed.rec.from.some((f) => f.table === "clients"),
    JSON.stringify({ reads: malformed.memoryReads.length, rpc: malformed.memoryRpc.length }));

  const readFail = await drive({ clientId: OWN, clientsError: { message: "transient read failure", code: "57014" } });
  assert("2.10 an authorization READ FAILURE is unknown authority, not permission: refused",
    readFail.memoryReads.length === 0 && readFail.memoryRpc.length === 0,
    JSON.stringify({ reads: readFail.memoryReads.length, rpc: readFail.memoryRpc.length }));
  assert("2.11 …and is reported as a read failure, not as 'not authorized'",
    readFail.logged.some((l) => l.level === "error" && /authorization read failed/.test(l.msg)),
    JSON.stringify(readFail.logged.map((l) => l.msg.slice(0, 90))));
}

console.log("\nthe authorization read itself is made with the caller's authority");
{
  const own = await drive({ clientId: OWN });
  // THE single load-bearing property of the whole fix. Without this the suite was green against
  // the vulnerable code: swapping the JWT client for the service-role one is one token, and the
  // recorder did not capture who asked, so no assertion could see it.
  const authReads = own.rec.from.filter((f) => f.table === "clients" && f.op === "select");
  assert("4.1 the client authorization read is made through the JWT client",
    authReads.length > 0 && authReads.every((f) => f.client === "jwt"),
    JSON.stringify(authReads.map((f) => f.client)));
  assert("4.2 it is NEVER made through the service-role client",
    !authReads.some((f) => f.client === "service"),
    JSON.stringify(authReads.map((f) => f.client)));

  // "Visible to me" is not "may read this client's private data": coach/cs_rep/sales_rep
  // policies grant visibility with NO tenant predicate.
  const otherTenant = await drive({ clientId: OTHERTEN });
  assert("4.3 a client VISIBLE via a non-tenant policy but owned by another workspace is refused",
    otherTenant.memoryReads.length === 0 && otherTenant.memoryRpc.length === 0,
    JSON.stringify({ reads: otherTenant.memoryReads.length, rpc: otherTenant.memoryRpc.length }));
  assert("4.4 …and the reason names the workspace mismatch, not a generic denial",
    otherTenant.logged.some((l) => l.level === "error" && /different workspace/.test(l.msg)),
    JSON.stringify(otherTenant.logged.map((l) => l.msg.slice(0, 100))));
}

console.log("\na refused client turn WRITES nothing, anywhere");
{
  // The write path is the read's twin: an unauthorized id here plants attacker-authored text as
  // a `user_preference` — the type this handler surfaces at the TOP of the prompt for whoever
  // legitimately reads that client next. Guarding the read alone is stored prompt injection.
  const foreignWrite = await drive({ clientId: FOREIGN, text: "please be brief and stop explaining basics" });
  const ownWrite = await drive({ clientId: OWN, text: "please be brief and stop explaining basics" });
  assert("5.0 the write path IS reachable in this harness (guards the check itself)",
    (ownWrite.rec.inserts ?? []).some((i) => i.table === "client_memory"),
    "an authorized turn must actually write, or 5.1 proves nothing");
  // NOT "no inserts of any kind" — that was literally false and only appeared true while the
  // recorder was blind to memoized clients. The LLM trace admin is built once and reused for the
  // process, so a refused turn still writes its observability row. What must be true is that no
  // CLIENT-SCOPED row is written, and that the trace row carries neither the refused id nor the
  // named client's data (asserted explicitly below rather than exempted).
  const OBSERVABILITY_TABLES = new Set(["paige_llm_trace"]);
  const refusedBusinessWrites = (foreignWrite.rec.inserts ?? []).filter((i) => !OBSERVABILITY_TABLES.has(i.table));
  assert("5.1 a refused turn writes NO client-scoped row",
    refusedBusinessWrites.length === 0,
    JSON.stringify(refusedBusinessWrites.map((i) => i.table)));
  assert("5.1b …and the observability row it does write leaks neither the id nor the client's data",
    (foreignWrite.rec.inserts ?? [])
      .filter((i) => OBSERVABILITY_TABLES.has(i.table))
      .every((i) => !JSON.stringify(i.row ?? {}).includes(FOREIGN)
        && !JSON.stringify(i.row ?? {}).includes(MEMORY_TEXT)),
    JSON.stringify((foreignWrite.rec.inserts ?? []).filter((i) => OBSERVABILITY_TABLES.has(i.table)).map((i) => i.table)));
  assert("5.2 …and no insert anywhere carries the refused id",
    !JSON.stringify(foreignWrite.rec.inserts ?? []).includes(FOREIGN),
    JSON.stringify(foreignWrite.rec.inserts ?? []));
}

console.log("\nno read of ANY table carries a refused client id");
{
  // Section 3 below scopes to client_memory and rpc args. buildUserContext reads profiles,
  // user_subscriptions, tasks, businesses, documents and quickbooks_connections — all
  // service-role, all interpolated into the prompt, and all invisible to a client_memory-only
  // assertion. This is the whole-recorder version.
  const foreignAll = await drive({ clientId: FOREIGN });
  const leaked = foreignAll.rec.from.filter(
    (f) => f.table !== "clients" && JSON.stringify(f.filters).includes(FOREIGN),
  );
  assert("6.1 no table read outside the authorization lookup carries the refused id",
    leaked.length === 0,
    JSON.stringify(leaked.map((f) => `${f.client}:${f.table}`)));
  // NOT "the caller's own id is used instead". That asserted the fallback READ as correct, and
  // it is the same mistake 8.2c/9.3/10.3 made on the write side: the conversation and the UI
  // still name the client, so answering from the caller's profile answers "what is their score?"
  // with the WRONG person's figures. A refused focused turn now ends before any of it.
  assert("6.2 a refused focused turn does not substitute the caller as the subject",
    !foreignAll.rec.from.some((f) => f.table === "profiles" || f.table === "user_subscriptions" || f.table === "documents"),
    JSON.stringify(foreignAll.rec.from.map((f) => f.table)));
}

console.log("\nthe caller cannot reach another client's memory by any body-supplied route");
{
  const foreign = await drive({ clientId: FOREIGN });
  assert("3.1 no client_memory read anywhere carries the foreign id",
    !foreign.rec.from.some((f) => f.table === "client_memory" && JSON.stringify(f.filters).includes(FOREIGN)),
    JSON.stringify(foreign.rec.from.filter((f) => f.table === "client_memory").map((f) => f.filters)));
  assert("3.2 no RPC anywhere is passed the foreign id as a memory target",
    !foreign.rec.rpc.some((r) => JSON.stringify(r.args ?? {}).includes(FOREIGN)),
    JSON.stringify(foreign.rec.rpc.map((r) => r.name)));
}

console.log("\nthe authorization read is made with a real CALLER IDENTITY, not just the right key");
{
  // Choosing the anon key is NOT the same as acting as the caller. Without the caller's JWT
  // forwarded as an Authorization header, `auth.uid()` is NULL, RLS and every SECURITY DEFINER
  // caller-guard are exempt, and the "JWT client" is an anon client wearing the name. The suite
  // previously proved only KEY CHOICE, so deleting the forwarded header left it fully green
  // while making the guard vacuous in production. This is the missing axis.
  const own = await drive({ clientId: OWN });
  const authzRead = own.rec.from.find((f) => f.table === "clients" && f.op === "select");
  assert("4.5 the authorization read carries the caller's forwarded Authorization header",
    !!authzRead && typeof authzRead.authorization === "string" && authzRead.authorization.length > 0,
    JSON.stringify({ authorization: authzRead?.authorization ?? null }));
  assert("4.6 …and so do the authority RPCs it depends on",
    own.rec.rpc.filter((r) => r.name === "current_user_tenant_id" || r.name === "is_platform_owner")
      .every((r) => typeof r.authorization === "string" && r.authorization.length > 0),
    JSON.stringify(own.rec.rpc.filter((r) => r.name === "is_platform_owner").map((r) => r.authorization)));
}

console.log("\nthe OPERATOR bypass — the only unbounded one — is bounded and fails closed");
{
  // The bypass skips tenant equality entirely, so every one of its edges must be witnessed.
  // Untested, it was a single token from being a total authorization bypass: `=== true`
  // relaxed to `!== false` made every caller whose authority check errored an operator, and
  // the whole suite stayed green because no scenario ever varied this RPC.
  const opForeign = await drive({ clientId: OTHERTEN, ownerRpc: { data: true, error: null } });
  assert("4.7 a genuine platform owner MAY read a client in another workspace",
    opForeign.rec.from.some((f) => f.table === "client_memory" && JSON.stringify(f.filters).includes(OTHERTEN))
      || opForeign.memoryRpc.some((r) => JSON.stringify(r.args ?? {}).includes(OTHERTEN)),
    JSON.stringify({ reads: opForeign.memoryReads.map((r) => r.filters), rpc: opForeign.memoryRpc.map((r) => r.args) }));

  // Operator authority is not a licence to read a row the tenant predicate excludes for
  // everyone. A NULL-tenant row is unowned, so it is refused even for an owner — this is the
  // ONLY check that puts real load on `.not("tenant_id","is",null)`, whose behavioural effect
  // is otherwise masked by the tenant-equality clause rejecting a null tenant anyway.
  const opNull = await drive({ clientId: NULLTEN, ownerRpc: { data: true, error: null } });
  assert("4.8 …but an unowned (NULL-tenant) client is refused even for an owner",
    !opNull.rec.from.some((f) => f.table !== "clients" && JSON.stringify(f.filters).includes(NULLTEN))
      && !opNull.rec.rpc.some((r) => JSON.stringify(r.args ?? {}).includes(NULLTEN)),
    JSON.stringify(opNull.rec.from.filter((f) => JSON.stringify(f.filters).includes(NULLTEN)).map((f) => f.table)));

  // UNKNOWN authority is never "not an operator" — it is a refusal. Reading a failed authority
  // check as a negative is what lets a later reordering fail open silently.
  const opErr = await drive({ clientId: OTHERTEN, ownerRpc: { data: null, error: { message: "rpc down", code: "57014" } } });
  assert("4.9 an ERRORED authority check refuses rather than assuming non-operator",
    !opErr.rec.from.some((f) => f.table !== "clients" && JSON.stringify(f.filters).includes(OTHERTEN))
      && !opErr.rec.rpc.some((r) => JSON.stringify(r.args ?? {}).includes(OTHERTEN)),
    JSON.stringify(opErr.rec.from.filter((f) => JSON.stringify(f.filters).includes(OTHERTEN)).map((f) => f.table)));
  assert("4.10 …and says so as authority, not as a workspace mismatch",
    opErr.logged.some((l) => l.msg.includes("REFUSED") && l.msg.includes("authority")),
    JSON.stringify(opErr.logged.filter((l) => l.msg.includes("REFUSED")).map((l) => l.msg)));

  // A non-boolean must never be truthy-read into operator authority.
  const opJunk = await drive({ clientId: OTHERTEN, ownerRpc: { data: "true", error: null } });
  assert("4.11 a non-boolean authority result does NOT confer operator authority",
    !opJunk.rec.from.some((f) => f.table !== "clients" && JSON.stringify(f.filters).includes(OTHERTEN)),
    JSON.stringify(opJunk.rec.from.filter((f) => JSON.stringify(f.filters).includes(OTHERTEN)).map((f) => f.table)));
}

console.log("\na refused turn does not blend the named client's context with the caller's own");
{
  // On refusal the handler falls back to the CALLER's scope, while the body still carries a
  // pre-rendered block built from the NAMED client's file, under a header telling the model it
  // is verified data to always reference. Shipping both puts two identities in one prompt with
  // nothing marking which is which — a defect the fix itself introduced by adding the fallback.
  const denied = await drive({
    clientId: FOREIGN,
    stream: true,
    // Send one, and send TENANT-NEUTRAL text. Asserting that a refused turn drops the block is
    // meaningless if the scenario never supplied a block to drop. A first draft used
    // finance-heavy wording ("FICO", "Chase"), which `sanitizeClientContextForTier` strips for a
    // non-funding tenant — so the block vanished for a reason unrelated to this guard and the
    // check passed with the guard REMOVED. The fixture must isolate the property under test.
    clientContext: CLIENT_CTX,
  });
  // Assert on what actually LEAVES for the model. Checking the RESPONSE body here would be
  // vacuous: a system prompt is egress, never reply, so that assertion passes whether or not
  // the block is injected. This is the difference between testing the guard and testing nothing.
  // Stronger than "the context block is absent": a refused focused turn reaches the model AT
  // ALL only if the choke point failed. There is no prompt to inspect because no prompt is sent.
  assert("7.0 a refused turn performs NO model egress whatsoever",
    denied.modelEgress.length === 0,
    JSON.stringify(denied.modelEgress.map((b) => b.slice(0, 120))));
  assert("7.1 …so neither the named client's context block nor any prompt leaves at all",
    !denied.modelEgress.some((b) => b.includes("CLIENT CONTEXT (VERIFIED DATABASE DATA)")),
    "the named client's context block reached the model after a refusal");
  assert("7.1b …and the refused id never reaches the model either",
    !denied.modelEgress.some((b) => b.includes(FOREIGN)),
    "the refused id reached the model");
  assert("7.1d …and the caller is told plainly, rather than being answered as the wrong subject",
    denied.bodyText.includes("couldn't confirm that this client belongs to your workspace"),
    denied.bodyText.slice(0, 300));

  // Surfacing the refusal is what stops it being a silent wrong behaviour the owner finds live.
  const allowed = await drive({ clientId: OWN, stream: true, clientContext: CLIENT_CTX });
  assert("7.1c an AUTHORIZED turn still delivers the client context (7.1 is not vacuous)",
    allowed.modelEgress.some((b) => b.includes("CLIENT CONTEXT (VERIFIED DATABASE DATA)")),
    "the authorized turn lost its client context — the gate is over-broad");

  assert("7.2 the refusal is announced to the caller as a non-identifying signal",
    denied.bodyText.includes("client_scope") && denied.bodyText.includes("refused"),
    denied.bodyText.slice(0, 400));
  assert("7.3 …and that signal never carries the rejected identifier",
    !denied.bodyText.includes(FOREIGN),
    "the refused id appeared in the response body");
}

console.log("\nthe DOCUMENT-upload path is bound to the same decision");
{
  // ~100 lines of upload targeting were never exercised: `drive()` sent no document, so two
  // raw-body-id lookups sat there passing green. A file is written to `${targetUserId}/…`, so
  // a wrong target is a cross-tenant WRITE, not merely a wrong read.
  const doc = { fileName: "statement.pdf", base64: "JVBERi0xLjQK", mimeType: "application/pdf" };
  const ownDoc = await drive({ clientId: OWN, document: doc, text: "here is my statement" });
  // NOT `status !== 400`: these scenarios resolve 500 without a model stub, so that assertion
  // passed without proving anything about the upload path. The recorded upload is the evidence.
  assert("8.1 an authorized document turn actually reaches the upload path",
    ownDoc.rec.uploads.length > 0,
    JSON.stringify({ status: ownDoc.status, uploads: ownDoc.rec.uploads }));

  const foreignDoc = await drive({ clientId: FOREIGN, document: doc, text: "here is my statement" });
  assert("8.2 a refused document turn never reads clients with the raw body id outside the guard",
    foreignDoc.rec.from.filter((f) => f.table === "clients").length <= 1,
    JSON.stringify(foreignDoc.rec.from.filter((f) => f.table === "clients").map((f) => f.filters)));
  assert("8.2b the authorized turn writes into the AUTHORIZED client's folder",
    ownDoc.rec.uploads.length > 0 && ownDoc.rec.uploads.every((u) => u.path.startsWith(`${OWN}/`)),
    JSON.stringify(ownDoc.rec.uploads.map((u) => u.path)));
  // NOT "writes into the caller's own folder". This asserted the caller-fallback as correct and
  // so encoded the defect — the same mistake 9.3 made. The caller attached this file believing it
  // was the named client's, so filing it under the caller durably misattributes another person's
  // document to them. A refused turn persists nothing.
  assert("8.2c a REFUSED turn persists NO document at all",
    foreignDoc.rec.uploads.length === 0,
    JSON.stringify(foreignDoc.rec.uploads.map((u) => u.path)));
  assert("8.2d …while the NO-CLIENT path still stores the caller's own document (8.2c is not over-broad)",
    (await drive({ clientId: undefined, document: doc, stream: true, text: "here is my statement" }))
      .rec.uploads.some((u) => u.path.startsWith(`${USER}/`)),
    "a legitimate self-upload was suppressed — the gate is too wide");
  assert("8.3 …and no table read or write anywhere carries the refused id",
    !foreignDoc.rec.from.some((f) => f.table !== "clients" && JSON.stringify(f.filters).includes(FOREIGN))
      && !foreignDoc.rec.inserts.some((i) => JSON.stringify(i.row ?? {}).includes(FOREIGN)),
    JSON.stringify({
      reads: foreignDoc.rec.from.filter((f) => f.table !== "clients" && JSON.stringify(f.filters).includes(FOREIGN)).map((f) => f.table),
      writes: foreignDoc.rec.inserts.filter((i) => JSON.stringify(i.row ?? {}).includes(FOREIGN)).map((i) => i.table),
    }));
}

console.log("\nthe SESSION-SUMMARY branch is bound to the same decision");
{
  // Three service-role `client_memory` inserts live behind `generateSessionSummary`. No scenario
  // drove it, so reverting all three to the raw body id left the suite fully green — while the
  // real effect is cross-tenant STORED PROMPT INJECTION: a `session_summary` / `user_preference`
  // row written into another tenant's client, which this handler later lifts into the prompt of
  // whoever legitimately opens that client next.
  const sessionBody = {
    generateSessionSummary: true,
    sessionMessages: [
      { role: "user", content: "keep my updates short" },
      { role: "assistant", content: "understood" },
    ],
  };
  const ownSum = await drive({ clientId: OWN, stream: true, extraBody: sessionBody });
  assert("9.0 the summary branch DOES write on an authorized turn (guards this section)",
    ownSum.rec.inserts.some((i) => i.table === "client_memory"),
    JSON.stringify(ownSum.rec.inserts.map((i) => i.table)));
  assert("9.1 an authorized summary is filed against the AUTHORIZED client",
    ownSum.rec.inserts.filter((i) => i.table === "client_memory")
      .some((i) => JSON.stringify(i.row ?? {}).includes(OWN)),
    JSON.stringify(ownSum.rec.inserts.filter((i) => i.table === "client_memory").map((i) => i.row)));

  const refusedSum = await drive({ clientId: FOREIGN, stream: true, extraBody: sessionBody });
  assert("9.4 a REFUSED summary turn announces the refusal in its JSON response",
    (() => { try { return JSON.parse(refusedSum.bodyText)?.client_scope?.status === "refused"; } catch { return false; } })(),
    refusedSum.bodyText.slice(0, 200));
  assert("9.5 …and an AUTHORIZED summary turn carries no such marker (9.4 is not vacuous)",
    (() => { try { return JSON.parse(ownSum.bodyText)?.client_scope === undefined; } catch { return false; } })(),
    ownSum.bodyText.slice(0, 200));
  assert("9.6 …and the marker never carries the rejected identifier",
    !refusedSum.bodyText.includes(FOREIGN), "the refused id appeared in the summary response");
  assert("9.2 a REFUSED summary turn writes nothing carrying the refused id",
    !JSON.stringify(refusedSum.rec.inserts ?? []).includes(FOREIGN),
    JSON.stringify(refusedSum.rec.inserts ?? []));
  // NOT "filed against the caller instead". An earlier draft asserted exactly that and so
  // enshrined the defect: these rows are DURABLE and are injected into the caller's own future
  // chats, so filing the named client's session under `user.id` contaminates the caller's
  // context with a subject they were never authorized to read. Falling back is not a safe
  // degrade for a WRITE of someone else's data — the only correct outcome is to write nothing.
  assert("9.3 …and writes NO client_memory row at all — the caller is not a fallback subject",
    refusedSum.rec.inserts.filter((i) => i.table === "client_memory").length === 0,
    JSON.stringify(refusedSum.rec.inserts.filter((i) => i.table === "client_memory").map((i) => i.row)));
  assert("9.3b …while the NO-CLIENT path still writes the caller's own summary (9.3 is not over-broad)",
    (await drive({ clientId: undefined, stream: true, extraBody: sessionBody }))
      .rec.inserts.some((i) => i.table === "client_memory" && (i.row?.client_user_id ?? null) === USER),
    "a legitimate self-summary was suppressed — the gate is too wide");
}

console.log("\nthe CREDIT-REPORT upload branch is bound to the same decision");
{
  // The highest-severity write in this change: a service-role storage upload plus a
  // `credit_report_uploads` row, both keyed on the target id, both RLS-exempt. It sits behind
  // `isCreditReportPdf`, which requires a model read-check — so with no model stub it was ALWAYS
  // false and this branch was unreachable, leaving a raw-body-id revert here fully green.
  const creditDoc = { fileName: "report.pdf", base64: "JVBERi0xLjQK", mimeType: "application/pdf" };
  const readsAsCreditReport = {
    can_read_document: true,
    document_kind: "credit_report",
    first_five_account_names: ["ACCOUNT ONE"],
  };

  const ownCredit = await drive({ clientId: OWN, stream: true, document: creditDoc, readCheck: readsAsCreditReport });
  // The `credit_report_uploads` INSERT is the only signal unique to this branch. Bucket
  // membership is NOT: the general-document path writes to the SAME bucket under a `general/`
  // prefix, so a bucket-or-insert disjunct was satisfied by any stored PDF — which meant that
  // if the branch went dark (a reworded read-check prompt, a flipped flag) this "guard" still
  // passed AND 10.1-10.3 passed vacuously over empty arrays, letting a revert of the
  // cross-tenant service-role write in this very branch ship green through CI.
  assert("10.0 the credit-report branch IS reached (guards this section)",
    ownCredit.rec.inserts.some((i) => i.table === "credit_report_uploads")
      && ownCredit.rec.uploads.some((u) => u.bucket === "credit-report-uploads" && !u.path.includes("/general/")),
    JSON.stringify({ uploads: ownCredit.rec.uploads, inserts: ownCredit.rec.inserts.map((i) => i.table) }));
  assert("10.1 an authorized credit report is stored against the AUTHORIZED client",
    ownCredit.rec.uploads.filter((u) => u.bucket === "credit-report-uploads" && !u.path.includes("/general/"))
      .every((u) => u.path.startsWith(`${OWN}/`))
      && ownCredit.rec.inserts.filter((i) => i.table === "credit_report_uploads").length > 0
      && ownCredit.rec.inserts.filter((i) => i.table === "credit_report_uploads").every((i) => i.row?.user_id === OWN),
    JSON.stringify({
      uploads: ownCredit.rec.uploads.filter((u) => u.bucket === "credit-report-uploads").map((u) => u.path),
      rows: ownCredit.rec.inserts.filter((i) => i.table === "credit_report_uploads").map((i) => i.row?.user_id),
    }));

  const refusedCredit = await drive({ clientId: FOREIGN, stream: true, document: creditDoc, readCheck: readsAsCreditReport });
  assert("10.2 a REFUSED credit report never lands under the named client",
    !refusedCredit.rec.uploads.some((u) => u.path.includes(FOREIGN))
      && !refusedCredit.rec.inserts.some((i) => JSON.stringify(i.row ?? {}).includes(FOREIGN)),
    JSON.stringify({
      uploads: refusedCredit.rec.uploads.map((u) => u.path),
      rows: refusedCredit.rec.inserts.filter((i) => i.table === "credit_report_uploads").map((i) => i.row?.user_id),
    }));
  // The turn no longer reaches the credit branch at all, so there is nothing to skip: no
  // extraction call, no sync, no model egress of any kind.
  assert("10.4 a REFUSED credit report is never extracted or synced",
    refusedCredit.modelEgress.length === 0
      && !refusedCredit.outboundCalls.some((c) => c.url.includes("sync-credit-report-data")),
    JSON.stringify({ egress: refusedCredit.modelEgress.length, out: refusedCredit.outboundCalls.map((c) => c.url) }));
  assert("10.5 …while an AUTHORIZED one still syncs (10.4 is not vacuous)",
    ownCredit.bodyText.includes("sync_status") && !ownCredit.bodyText.includes("client_scope_refused"),
    ownCredit.bodyText.slice(0, 300));
  // Likewise: no upload, and no `credit_report_uploads` row. Falling back to the caller also
  // stranded that row in `analysis_status: "processing"` forever, because the sync is skipped.
  assert("10.3 …and persists NOTHING: no upload and no credit_report_uploads row",
    refusedCredit.rec.uploads.length === 0
      && !refusedCredit.rec.inserts.some((i) => i.table === "credit_report_uploads"),
    JSON.stringify({
      uploads: refusedCredit.rec.uploads.map((u) => u.path),
      rows: refusedCredit.rec.inserts.filter((i) => i.table === "credit_report_uploads").map((i) => i.row),
    }));
}

console.log("\nthe refusal is announced on BOTH response paths, not just the agentic one");
{
  // The document path builds a SECOND ReadableStream (the agentic one is gated on
  // `!attachedDocument`), so a frame emitted there does not reach a doc-attached turn — the
  // half where the caller is actively filing a document against the client they named.
  const doc = { fileName: "statement.pdf", base64: "JVBERi0xLjQK", mimeType: "application/pdf" };
  const refusedDoc = await drive({ clientId: FOREIGN, stream: true, document: doc });
  assert("11.1 a refused DOCUMENT turn also announces the refusal",
    refusedDoc.bodyText.includes("client_scope") && refusedDoc.bodyText.includes("refused"),
    refusedDoc.bodyText.slice(0, 300));
  assert("11.2 …and still never carries the rejected identifier",
    !refusedDoc.bodyText.includes(FOREIGN),
    "the refused id appeared in the document-path response");
}

console.log("\nthe TOOL loop does not retarget a refused subject at the caller");
{
  // The generalisation behind the two review findings: falling back to the caller is right for
  // READING their own context and wrong for WRITING a named subject's data. `update_client_data`
  // was the third instance — the model calls it believing it is acting on the focused client, and
  // on a refusal the fallback applied those updates to the CALLER's own record. RLS keeps it
  // in-tenant, so it is not a cross-tenant leak; it is still one person's data written onto
  // another's, and no check reached the tool loop at all before this.
  const upd = { name: "update_client_data", args: { updates: { first_name: "Renamed", monthly_revenue: 99999 } } };

  // §13 — `update_client_data` IS NOW AUTONOMY-GATED, so an authorized turn no longer writes on
  // its own. It was the one write tool that reached `paige-write-back` — which can set
  // `profile.ssn` and `profile.date_of_birth` — with no confirm, no off switch and no autonomy row:
  // a tenant that set every other tool to `confirm` still had this one running unattended.
  //
  // These two assertions are UPDATED, not deleted. What they guard — that the tool loop is
  // reachable, and that a write targets the AUTHORIZED client rather than the caller — is exactly
  // as load-bearing as before; it now happens on the far side of an approval. Deleting them because
  // the shape changed would have removed the only proof that this section's refusals are refusing
  // something that otherwise works.
  const proposed = await drive({ clientId: OWN, stream: true, toolCall: upd });
  assert("12.0 an AUTHORIZED turn now PROPOSES rather than writing — the gate covers this tool",
    !proposed.outboundCalls.some((c) => c.url.includes("paige-write-back")),
    JSON.stringify(proposed.outboundCalls.map((c) => c.url)));
  assert("12.0a …and asks, rather than silently doing nothing",
    proposed.bodyText.includes("paige_confirm") || proposed.bodyText.includes("needs_confirm"),
    proposed.bodyText.slice(0, 400));

  // The same call, with autonomy set to `auto` — the tenant's own deliberate choice. The tool loop
  // is still reachable and still targets the authorized client.
  const allowedTool = await drive({
    clientId: OWN, stream: true, toolCall: upd,
    rpcOverrides: { resolve_tool_autonomy: { data: "auto", error: null } },
  });
  assert("12.0b the tool loop IS reachable and a turn the tenant set to auto calls write-back (guards this section)",
    allowedTool.outboundCalls.some((c) => c.url.includes("paige-write-back")),
    JSON.stringify(allowedTool.outboundCalls.map((c) => c.url)));
  assert("12.0c …targeting the AUTHORIZED client, never the caller",
    allowedTool.outboundCalls.filter((c) => c.url.includes("paige-write-back"))
      .every((c) => c.body.includes(OWN) && !c.body.includes(`"target_user_id":"${USER}"`)),
    JSON.stringify(allowedTool.outboundCalls.filter((c) => c.url.includes("paige-write-back")).map((c) => c.body)));

  // The review's point was that gating ONE tool leaves every other mutating branch open —
  // `crm_create_task` service-role-inserts the model's subject-specific title into the caller's
  // tenant, `propose_action` persists an outbound draft. Rather than enumerate them, the turn
  // now ends before the tool loop exists. Drive a DIFFERENT mutating tool to prove the choke
  // point holds generally, not just for the one tool that was gated by hand.
  const refusedTask = await drive({
    clientId: FOREIGN,
    stream: true,
    toolCall: { name: "crm_create_task", args: { title: "Call about their charge-off", description: "subject-specific" } },
  });
  assert("12.4 a refused turn runs NO mutating tool, not merely the one that was gated",
    refusedTask.rec.inserts.filter((i) => !["paige_llm_trace"].includes(i.table)).length === 0
      && refusedTask.outboundCalls.length === 0,
    JSON.stringify({
      inserts: refusedTask.rec.inserts.map((i) => i.table),
      outbound: refusedTask.outboundCalls.map((c) => c.url),
    }));
  assert("12.5 …because the tool loop is never reached — no model round happens at all",
    refusedTask.modelEgress.length === 0,
    JSON.stringify(refusedTask.modelEgress.length));

  const refusedTool = await drive({ clientId: FOREIGN, stream: true, toolCall: upd });
  assert("12.1 a REFUSED turn makes NO write-back call at all",
    !refusedTool.outboundCalls.some((c) => c.url.includes("paige-write-back")),
    JSON.stringify(refusedTool.outboundCalls.map((c) => c.url)));
  assert("12.2 …so the named client's updates never land on the caller's own record",
    !refusedTool.outboundCalls.some((c) => c.body.includes(`"target_user_id":"${USER}"`)),
    JSON.stringify(refusedTool.outboundCalls.map((c) => c.body)));
  assert("12.3 …and no outbound call carries the refused id",
    !refusedTool.outboundCalls.some((c) => c.body.includes(FOREIGN) || c.url.includes(FOREIGN)),
    JSON.stringify(refusedTool.outboundCalls.map((c) => c.url)));
}

// ── 13. THE CONFIRM GATE — AN APPROVAL MUST BE REACHABLE, AND MUST MEAN "THIS, ONCE" ─────────
//
// WHY THIS SECTION EXISTS. The first version of the gate required the calling SURFACE to echo a
// fingerprint back. Independent review drove the shipped code and found that only one of the six
// chat surfaces sends it, so every confirm-gated tool had become permanently un-executable on the
// other five; that the client-portal seat lost `update_client_data`, its ONLY write; and that even
// where the echo worked the model had to re-author the arguments byte-identically — a livelock for
// any tool carrying model-written free text. Thirteen separate mutations to that code left every
// suite green, which is the real finding: the mechanism had no coverage at all.
//
// So each check below names the exact mutation it kills. A check that cannot name one is decoration.
{
  const TOOL = "update_client_data";
  const CONFIRM = { rpcOverrides: { resolve_tool_autonomy: { data: "confirm", error: null } } };
  const THREAD = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

  /** Model the store: an INSERT records the proposal, and the claim UPDATE returns it exactly once
   *  — and only when every scope filter matches, the way the real compare-and-set does. */
  function store() {
    const rows = [];
    return {
      rows,
      table: (filters) => {
        const f = (op, col) => filters.find((x) => x[0] === op && x[1] === col)?.[2];
        // Only the claim reads this table, and it always arrives as an update.
        const isClaim = filters.some((x) => x[0] === "eq" && x[1] === "fingerprint");
        if (!isClaim) return [];
        const fp = f("eq", "fingerprint");
        const tool = f("eq", "tool_name");
        // Faithful to postgrest: a filter the code STOPPED sending must stop narrowing here too.
        // Requiring tool_name unconditionally would mask the very mutation 13.9 exists to catch.
        const hit = rows.find((r) => r.fingerprint === fp
          && (tool === undefined || r.tool_name === tool) && !r.consumed);
        if (!hit) return [];
        hit.consumed = true;              // single-use, exactly as `consumed_at` enforces
        return [{ args: hit.args }];
      },
    };
  }

  /** The refusal Paige actually sent BACK to the model next round.
   *
   *  It travels as a JSON string nested inside the request body, so it arrives double-escaped;
   *  unescape once before matching, or every assertion here passes vacuously by finding nothing. */
  function refusalOf(egress) {
    const all = egress
      .map((b) => (typeof b === "string" ? b : JSON.stringify(b)))
      .join("\n")
      .replace(/\\"/g, '"');
    if (!all.includes("needs_confirm")) return null;
    const tok = all.match(/"confirm_token":"([0-9a-f]{16})"/);
    return {
      present: true,
      confirm_token: tok ? tok[1] : (/"confirm_token":\s*null/.test(all) ? null : undefined),
      note: (all.match(/"note":"([^"]{0,120})/) ?? [])[1] ?? "",
    };
  }

  // ── 13.1 A gated call with no token PROPOSES rather than acting.
  const st1 = store();
  const proposed = await drive({
    clientId: OWN, stream: true, extraBody: { threadId: THREAD },
    toolCall: { name: TOOL, args: { client_id: OWN, updates: { goal: "buy a house" } } },
    ...CONFIRM,
    tablesExtra: { paige_pending_confirmations: st1.table },
  });
  assert("13.1 a confirm-gated call with no token performs NO write",
    !proposed.outboundCalls.some((c) => c.url.includes("paige-write-back")),
    JSON.stringify(proposed.outboundCalls.map((c) => c.url)));

  // ── 13.2 …and the proposal is PERSISTED, with the arguments that will actually run.
  // Kills: deleting the `recordConfirmation` call, or storing a summary instead of the args.
  const stored = proposed.rec.inserts.find((i) => i.table === "paige_pending_confirmations")?.row;
  assert("13.2 the proposed call is persisted with its exact arguments",
    !!stored && stored.tool_name === TOOL
      && JSON.stringify(stored.args?.updates) === JSON.stringify({ goal: "buy a house" }),
    JSON.stringify(stored ?? null));

  // ── 13.3 …recorded against the PERSON and the scope it was shown in.
  // Kills: dropping user_id/thread_id/scoped_client_id from the insert — each of which would let an
  // approval issued in one place be redeemed in another.
  assert("13.3 the proposal is bound to the person, the thread and the focused client",
    !!stored && stored.user_id === USER && stored.thread_id === THREAD && stored.scoped_client_id === OWN,
    JSON.stringify(stored ?? null));

  // ── 13.4 …and it is written on the CALLER's client, so RLS is the boundary.
  // Kills: swapping `supabaseClient` for the service-role client — under service role `auth.uid()`
  // is NULL and the owning policy stops meaning anything.
  const insertQ = proposed.rec.from.find(
    (f) => f.table === "paige_pending_confirmations" && f.op === "insert");
  assert("13.4 the proposal is written as the CALLER, never as service role",
    !insertQ || insertQ.client !== "service",
    JSON.stringify(insertQ ?? "no query recorded"));

  // ── 13.5 THE HANDSHAKE IS OFFERED. Without a token in the refusal the model has no way to say
  // yes, which is the outage this whole repair is about.
  const refusal = refusalOf(proposed.modelEgress);
  assert("13.5 the refusal hands back a token the model can redeem",
    !!refusal && typeof refusal.confirm_token === "string" && /^[0-9a-f]{16}$/.test(refusal.confirm_token),
    JSON.stringify(refusal ?? null));

  // ── 13.6 THE ONE THAT MATTERS. Approval runs the STORED call, even though the model re-emits
  // DIFFERENT arguments — which is what it will do for any tool carrying free text it cannot
  // reproduce. Kills: removing `tc.function.arguments = JSON.stringify(approvedArgs)`, which would
  // send the drifted arguments to write-back; and reverting to the echo-only gate, which would
  // refuse this turn outright.
  const st2 = store();
  st2.rows.push({
    user_id: USER, tool_name: TOOL, fingerprint: refusal?.confirm_token ?? "0".repeat(16),
    args: { client_id: OWN, updates: { goal: "buy a house" } }, consumed: false,
  });
  const approved = await drive({
    clientId: OWN, stream: true, extraBody: { threadId: THREAD },
    toolCall: { name: TOOL, args: { confirm_token: refusal?.confirm_token, client_id: OWN, updates: { goal: "SOMETHING ELSE ENTIRELY" } } },
    ...CONFIRM,
    tablesExtra: { paige_pending_confirmations: st2.table },
  });
  const wrote = approved.outboundCalls.filter((c) => c.url.includes("paige-write-back"));
  assert("13.6 approval executes the STORED call, not the one the model re-emitted",
    wrote.length === 1 && wrote[0].body.includes("buy a house")
      && !wrote[0].body.includes("SOMETHING ELSE ENTIRELY"),
    JSON.stringify(wrote.map((c) => c.body)));

  // ── 13.7 The claim is a COMPARE-AND-SET, so one approval cannot execute twice.
  // Kills: dropping `.is("consumed_at", null)` — the review found one approval could otherwise run
  // the same call for every round of the turn.
  const claimQ = approved.rec.from.find(
    (f) => f.table === "paige_pending_confirmations" && f.op === "update");
  assert("13.7 the claim is a compare-and-set on consumed_at",
    !!claimQ && claimQ.filters.some((x) => x[0] === "is" && x[1] === "consumed_at" && x[2] === null),
    JSON.stringify(claimQ?.filters ?? "no claim recorded"));

  // ── 13.8 …and it re-checks scope rather than trusting the token alone.
  // Kills: dropping the tenant/thread/client predicates, which would let an approval survive an
  // account switch or a change of focused client — the thing S2 exists to prevent.
  const cf = (op, col) => claimQ?.filters.some((x) => x[0] === op && x[1] === col);
  assert("13.8 the claim re-checks user, expiry, thread and focused client",
    !!claimQ && cf("eq", "user_id") && cf("gt", "expires_at")
      && (cf("eq", "thread_id") || cf("is", "thread_id"))
      && (cf("eq", "scoped_client_id") || cf("is", "scoped_client_id")),
    JSON.stringify(claimQ?.filters ?? "no claim recorded"));

  // ── 13.9 A token issued for one tool cannot redeem another.
  // Kills: dropping `.eq("tool_name", tool)` from the claim.
  const st3 = store();
  st3.rows.push({
    user_id: USER, tool_name: "deal_create", fingerprint: "abcdef0123456789",
    args: { amount: 1 }, consumed: false,
  });
  const wrongTool = await drive({
    clientId: OWN, stream: true, extraBody: { threadId: THREAD },
    toolCall: { name: TOOL, args: { confirm_token: "abcdef0123456789", client_id: OWN, updates: { goal: "x" } } },
    ...CONFIRM,
    tablesExtra: { paige_pending_confirmations: st3.table },
  });
  assert("13.9 a token issued for a different tool redeems nothing",
    !wrongTool.outboundCalls.some((c) => c.url.includes("paige-write-back")),
    JSON.stringify(wrongTool.outboundCalls.map((c) => c.url)));

  // ── 13.10 If the proposal cannot be RECORDED, the refusal says so and issues no token.
  // Kills: returning `true` unconditionally from `recordConfirmation`, which would hand out a token
  // that can never be redeemed — a livelock dressed as a pending approval.
  const cannotRecord = await drive({
    clientId: OWN, stream: true, extraBody: { threadId: THREAD },
    toolCall: { name: TOOL, args: { client_id: OWN, updates: { goal: "y" } } },
    ...CONFIRM,
    tableErrorsExtra: { paige_pending_confirmations: { message: "denied", code: "42501" } },
  });
  const failedRefusal = refusalOf(cannotRecord.modelEgress);
  assert("13.10 an unrecordable proposal issues NO token and does not claim to be pending",
    !!failedRefusal && failedRefusal.confirm_token === null,
    JSON.stringify(failedRefusal ?? null));
}

// ── 14. EVERY GATED TOOL CAN BE APPROVED AT ALL ──────────────────────────────────────────────
//
// Forty-five of the forty-eight gated tools never declared an approval parameter, so the model
// could not signal consent even when it had been given. This reads the schema Paige ACTUALLY sends
// the model — the egress, not the source — and requires the token on exactly the gated set.
//
// 14.0 exists because the first draft of this section passed while reading an EMPTY object: the
// egress arrives as JSON strings, so `JSON.stringify(body).includes('"name"')` matched nothing and
// every later filter ran over an empty list. A guard that proves the subject was found is the only
// thing standing between "no violations" and "no evidence" — the two are indistinguishable without
// it, and a mutation that deleted the whole injection left this green.
{
  const seen = await drive({ clientId: OWN, stream: true });
  const wire = seen.modelEgress
    .map((b) => (typeof b === "string" ? b : JSON.stringify(b)))
    .join("\n")
    .replace(/\\"/g, '"');
  const declared = [...wire.matchAll(/"name":"([a-z0-9_]+)"/g)].map((m) => m[1]);

  const src = await (await import("node:fs/promises")).readFile(
    new URL("../../supabase/functions/paige-ai-chat/index.ts", import.meta.url), "utf8");
  const at = src.indexOf("const MUTATING_TOOLS = new Set<string>([");
  const gated = [...src.slice(src.indexOf("[", at), src.indexOf("]);", at)).matchAll(/"([a-z0-9_]+)"/g)]
    .map((m) => m[1]);
  const offered = gated.filter((t) => declared.includes(t));

  assert("14.0 the tool schema was actually found on the wire (guards this section)",
    gated.length >= 40 && offered.length >= 20,
    JSON.stringify({ gated: gated.length, declared: declared.length, offeredGated: offered.length }));

  /** The slice of the wire describing one tool: from its name to the next tool's name. */
  const blockFor = (t) => {
    const i = wire.indexOf(`"name":"${t}"`);
    if (i < 0) return "";
    const n = wire.indexOf('"name":"', i + 10);
    return wire.slice(i, n < 0 ? undefined : n);
  };

  const missing = offered.filter((t) => !blockFor(t).includes("confirm_token"));
  assert("14.1 every gated tool the model is offered declares confirm_token",
    missing.length === 0, JSON.stringify(missing));

  assert("14.2 …and a read-only tool does not (the token is not sprayed over everything)",
    declared.includes("web_fetch") && !blockFor("web_fetch").includes("confirm_token"),
    JSON.stringify({ sawWebFetch: declared.includes("web_fetch") }));
}

// ── 15. §67 — PAIGE BUILDS A PROCESS, BUT NEVER GRANTS HERSELF ONE ───────────────────────────
//
// The whole point of granting autonomy to a PROCESS is that a human decides how much of it runs
// unattended. An agent that could compose a process and authorise it in the same breath would have
// granted itself autonomy, which is the one thing this design exists to prevent. So the row is born
// at the floor — `confirm` and `draft` — whatever the operator said in the same sentence, and
// raising it is a separate, confirm-gated act.
{
  // The tenant has set these to run without asking, so the gate is not what is under test here.
  // The tier is stated EXPLICITLY rather than left to the harness default: `get_actor_access` is
  // unstubbed by default and `resolveTier` fails closed to `client`, so an operator drive that did
  // not say so would silently be testing a client seat — which is how 15.0 below was found.
  const AUTO = { rpcOverrides: {
    resolve_tool_autonomy: { data: "auto", error: null },
    get_actor_access: { data: { tier: "tenant" }, error: null },
  } };
  const AS_CLIENT = { get_actor_access: { data: { tier: "client" }, error: null } };
  /** Model the process tables. The trigger catalogue is real reference data; the automations table
   *  records what was inserted so the invariant can be read off the write itself. */
  function processStore({ resolved = { effective: "confirm", capped_by: null, would_run: false, dark: [] } } = {}) {
    return {
      paige_automation_triggers: (filters) => {
        const key = filters.find((f) => f[0] === "eq" && f[1] === "key")?.[2];
        const rows = [
          { key: "manual.run_now", is_live: true, dark_reason: null },
          { key: "conversation.call_ended", is_live: false, dark_reason: "no voice substrate yet" },
        ];
        return key === undefined ? rows : rows.filter((r) => r.key === key);
      },
      paige_automations: () => [{ id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", name: "New lead welcome", granted_lane: "auto", state: "live" }],
      paige_automation_acts: () => [],
      __rpc: { resolve_automation_autonomy: { data: resolved, error: null } },
    };
  }

  // A CLIENT-PORTAL SEAT CANNOT AUTHOR PROCESSES, and that is checked first because the harness
  // caller is one by default — driving with a focused client is what surfaced it. Automations are
  // an operator capability (§51/§60); a client being able to arm work inside someone's workspace
  // would be the seam failure, not a feature.
  const seatStore = processStore();
  const asClient = await drive({
    clientId: OWN, stream: true,
    toolCall: { name: "automation_draft", args: { name: "x", trigger_key: "manual.run_now", steps: [{ tool_key: "crm_create_task" }] } },
    rpcOverrides: { ...AUTO.rpcOverrides, ...AS_CLIENT, ...seatStore.__rpc },
    tablesExtra: seatStore,
  });
  assert("15.0 a client-portal seat cannot author a process at all",
    !asClient.rec.inserts.some((i) => i.table === "paige_automations"),
    JSON.stringify(asClient.rec.inserts.map((i) => i.table)));

  // ── 15.G THE GATE ITSELF, AT THE DEFAULT LANE. Every other check in this section forces
  // `resolve_tool_autonomy: "auto"` so the gate is out of the way and the HANDLER is what is under
  // test. That left the gate untested: an independent review deleted all three automation tools
  // from `MUTATING_TOOLS` — so they would run unproposed — and every suite stayed green. Section 14
  // could not catch it either, because it derives the gated set by parsing the same literal it is
  // checking, which can only ever find a tool that is gated-but-undeclared, never one that stopped
  // being gated. This drives the DEFAULT lane, where a proposal is the correct outcome.
  {
    const gateStore = processStore();
    const ungated = await drive({
      stream: true,
      toolCall: { name: "automation_set_grant", args: { automation_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", lane: "auto" } },
      // NO resolve_tool_autonomy override: the tenant has set nothing, so the resolver's own safe
      // default (`confirm`) applies — exactly the posture a real workspace starts in.
      rpcOverrides: { get_actor_access: { data: { tier: "tenant" }, error: null }, ...gateStore.__rpc },
      tablesExtra: gateStore,
    });
    assert("15.G raising an autonomy grant is PROPOSED, not performed, at the default lane",
      !ungated.rec.inserts.some((i) => i.table === "paige_automations" && i.update),
      JSON.stringify(ungated.rec.inserts.filter((i) => i.table === "paige_automations")));
    const gateWire = ungated.modelEgress
      .map((b) => (typeof b === "string" ? b : JSON.stringify(b))).join("\n").replace(/\\"/g, '"');
    assert("15.H …and the operator is asked, with a token to answer with",
      /"needs_confirm":true/.test(gateWire) && /"confirm_token":"[0-9a-f]{16}"/.test(gateWire),
      gateWire.includes("needs_confirm") ? "asked, but no token" : "never asked");
  }

  const st = processStore();
  const built = await drive({
    stream: true,
    toolCall: { name: "automation_draft", args: {
      name: "New lead welcome", trigger_key: "manual.run_now",
      // The operator's phrasing said "just run it" — the model faithfully passes it on. It must
      // change nothing, which is exactly why it is in the fixture.
      granted_lane: "auto", state: "live",
      steps: [{ tool_key: "crm_create_task" }],
    } },
    rpcOverrides: { ...AUTO.rpcOverrides, ...st.__rpc },
    tablesExtra: st,
  });
  const row = built.rec.inserts.find((i) => i.table === "paige_automations")?.row;
  assert("15.1 a process Paige builds is born asking-first and switched off",
    !!row && row.granted_lane === "confirm" && row.state === "draft",
    JSON.stringify(row ?? null));
  // Kills: passing the model's arguments straight through, or defaulting these columns instead of
  // setting them. Either would let "just run it automatically" arm a process nobody reviewed.
  assert("15.2 …even when the call it was given said auto and live",
    !!row && row.granted_lane !== "auto" && row.state !== "live",
    JSON.stringify(row ?? null));
  assert("15.3 …and it is stamped with the server-resolved tenant and its author",
    !!row && Object.prototype.hasOwnProperty.call(row, "tenant_id") && row.created_by === USER,
    JSON.stringify(row ?? null));

  // A trigger that is not in the catalogue must be refused rather than invented, or Paige will
  // cheerfully build a process that can never fire.
  const invented = await drive({
    stream: true,
    toolCall: { name: "automation_draft", args: {
      name: "Wishful", trigger_key: "someone.thinks.about.us", steps: [{ tool_key: "crm_create_task" }] } },
    rpcOverrides: { ...AUTO.rpcOverrides, ...st.__rpc },
    tablesExtra: st,
  });
  // ASSERTING THE REFUSAL, NOT MERELY THE ABSENCE OF A WRITE. Mutation-testing caught this one:
  // with the trigger check removed the code throws on the missing row and still writes nothing, so
  // "no insert" was true for the wrong reason and the mutation stayed green. What must hold is that
  // the model is TOLD to pick a real trigger — otherwise it retries with another invented one.
  const inventedWire = invented.modelEgress
    .map((b) => (typeof b === "string" ? b : JSON.stringify(b))).join("\n").replace(/\\"/g, '"');
  assert("15.4 an invented trigger builds nothing, and says why",
    !invented.rec.inserts.some((i) => i.table === "paige_automations")
      && /do not invent one/.test(inventedWire),
    JSON.stringify({ inserts: invented.rec.inserts.map((i) => i.table), told: /do not invent one/.test(inventedWire) }));

  // A process with no steps does nothing when it fires; building one would be a shell the operator
  // finds later and cannot explain.
  const stepless = await drive({
    stream: true,
    toolCall: { name: "automation_draft", args: { name: "Empty", trigger_key: "manual.run_now", steps: [] } },
    rpcOverrides: { ...AUTO.rpcOverrides, ...st.__rpc },
    tablesExtra: st,
  });
  assert("15.5 a process with no steps builds nothing",
    !stepless.rec.inserts.some((i) => i.table === "paige_automations"),
    JSON.stringify(stepless.rec.inserts.map((i) => i.table)));

  // §13 — THE ANSWER CAN BE LESS THAN WHAT WAS ASKED FOR, AND SHE MUST BE TOLD SO. Storing `auto`
  // while the ceiling holds it at `confirm` is not itself a lie; reporting back "it now runs on its
  // own" would be. Kills: dropping the resolved posture from the tool result, which would leave the
  // model writing that sentence from the value it just sent.
  const capped = processStore({ resolved: { effective: "confirm", capped_by: "ceiling", would_run: true, dark: [] } });
  const granted = await drive({
    stream: true,
    toolCall: { name: "automation_set_grant", args: { automation_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", lane: "auto" } },
    rpcOverrides: { ...AUTO.rpcOverrides, ...capped.__rpc },
    tablesExtra: capped,
  });
  const wire = granted.modelEgress.map((b) => (typeof b === "string" ? b : JSON.stringify(b))).join("\n").replace(/\\"/g, '"');
  assert("15.6 a grant the ceiling holds down is reported as what will ACTUALLY happen",
    wire.includes('"what_actually_happens":"confirm"') && wire.includes('"held_back_by":"ceiling"'),
    wire.includes("what_actually_happens") ? "posture present but wrong" : "no posture in the tool result");
  assert("15.7 …and the model is told in words not to let them believe it runs unattended",
    /will NOT run as 'auto'/.test(wire),
    "the corrective note is missing");
}

// ── 16. NO DURABLE WRITE IN THIS FILE IGNORES ITS OWN ERROR ──────────────────────────────────
//
// postgrest-js defaults `shouldThrowOnError` to FALSE, so a constraint violation, an RLS refusal or
// a missing column RESOLVES with an `error` on the result instead of throwing. `await
// supabase.from(x).insert(y)` inside a try/catch therefore catches NOTHING for the commonest
// failures, and the row silently never lands. That is how a status outside a live CHECK killed a
// whole feature while the code reported success, and how four `client_memory` inserts — the things
// Paige later recalls about a person — could fail with no symptom but her quietly remembering
// nothing.
//
// THIS IS A STATIC CHECK AND IS LABELLED AS ONE. It reads the source rather than driving a rejected
// write, and I say so rather than dressing it up: the memory write path is not reachable from this
// harness's fixtures, so a runtime assertion here would have witnessed nothing while appearing to
// prove something. What this DOES catch is the recurrence that actually matters — a NEW write added
// later that ignores its error — which no single runtime case would have caught either.
//
// The runtime half is covered elsewhere and honestly: `writeIfScopeCurrent` is driven against a
// postgrest-shaped `{error}` in the extraction path, and 13.10 drives a rejected proposal insert
// through the real handler.
{
  if (process.env.PROBE) {
    for (const t of ["analytics_events","paige_chat_threads","kb_query_telemetry","client_memory","deal_activities"]) {
      const d = await drive({ clientId: OWN, stream: true, extraBody: { threadId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc" },
        tableErrorsExtra: { [`${t}:insert`]: { message: "boom", code: "23514" }, [`${t}:update`]: { message: "boom", code: "23514" } } });
      const hit = d.logged.filter((l) => /write REJECTED/.test(l.msg)).map((l)=>l.msg);
      console.log("PROBE", t, hit.length ? hit[0].slice(0,90) : "(not reached)");
    }
  }
  const raw = await (await import("node:fs/promises")).readFile(
    new URL("../../supabase/functions/paige-ai-chat/index.ts", import.meta.url), "utf8");

  // COMMENTS ARE STRIPPED FIRST. The previous version exempted a write when the word "error"
  // appeared anywhere in the three lines above it — and this file is heavily commented, so almost
  // any write under a paragraph mentioning errors was silently exempt. An independent review drove
  // it: an unchecked insert placed under such a comment passed. Prose must not be able to satisfy
  // a guard about code.
  const src = raw
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");

  // STATEMENTS, NOT LINES. `.from(x)` and `.insert(y)` frequently sit on different lines, so a
  // line-scoped matcher misses them entirely — three real writes in this file were already
  // invisible to it. Splitting on `;` is crude but it is the unit a postgrest chain ends with.
  const statements = src.split(";");
  const unchecked = [];
  for (const st of statements) {
    // `await` IMMEDIATELY BEFORE THE CLIENT is what makes this an EXECUTED write. Without it the
    // chain is a builder being assembled into a variable (`let q = supabaseClient.from(...)`), and
    // the execution — and the error check that belongs with it — happens where that variable is
    // finally awaited. Honest limit: a builder-based write whose await never checks its error
    // would not be caught here. There is exactly one builder in this file (`claimConfirmation`)
    // and it does check; a second one would want this widened.
    if (!/await\s+(supabase|supabaseClient|supabaseAdmin|admin)\s*\.from\(/.test(st)
        && !/await\s+\w+\s*\(\s*"[^"]*",\s*(supabase|supabaseClient|supabaseAdmin|admin)\s*\.from\(/.test(st)) continue;
    // `.update(` matched generally — the old pattern required `.update({`, so passing a variable
    // (`.update(row)`) skipped the guard entirely. Also driven by the review.
    if (!/\.(insert|upsert|update)\s*\(/.test(st)) continue;
    // An EXPLICIT marker, never a substring of prose: routed through a checked helper, or the
    // caller destructures the error itself, or it is returned for a caller to check.
    if (/\brecordWrite\s*\(|\bwriteIfScopeCurrent\s*\(|\bcheckedWrite\s*\(/.test(st)) continue;
    if (/\{[^}]*\berror\b[^}]*\}\s*=\s*await/.test(st)) continue;
    if (/\breturn\s+await\b/.test(st)) continue;
    unchecked.push(st.trim().replace(/\s+/g, " ").slice(0, 110));
  }
  assert("16.1 every durable write reads its error, is wrapped, or returns it",
    unchecked.length === 0, JSON.stringify(unchecked, null, 1));

  // The guard against the guard finding nothing to look at.
  const candidates = statements.filter((st) =>
    /await\s+(?:\w+\s*\(\s*"[^"]*",\s*)?(supabase|supabaseClient|supabaseAdmin|admin)\s*\.from\(/.test(st)
    && /\.(insert|upsert|update)\s*\(/.test(st)).length;
  assert("16.0 the sweep actually found durable writes to check (guards 16.1)",
    candidates >= 15, String(candidates));

}

// ── 17. §70 — A PROPOSAL NOBODY CLICKED IS REACHABLE AGAIN ───────────────────────────────────
//
// The card is live-turn only; it is never rehydrated into a reloaded thread. So a person who read
// Paige's findings, got distracted and came back had no way back to them at all — the row sat at
// `awaiting_review` forever while every other surface correctly reported the upload as analysed.
// Migration 20261019000000 even added a partial index for "what is still waiting on me", and
// nothing ever ran that query.
//
// The load-bearing assertion is 17.2: it is not enough for the tool to succeed, the CARD has to
// reach the wire. The emit sits in an else-if chain whose earlier branches are the document paths,
// so "the third branch is reached on an ordinary turn" is a claim about control flow that has to be
// driven, not read.
{
  const STRUCTURED = {
    scores: { equifax: 712, experian: 705, transunion: 698 },
    negative_items: [{ creditor: "A" }, { creditor: "B" }],
    positive_accounts: [], hard_inquiries: [],
  };
  // Faithful to postgrest: a filter the code sends must NARROW here, or a check that the pending
  // list excludes settled documents would pass whether or not the code filters at all.
  const uploads = (rows) => ({
    credit_report_uploads: (filters) => {
      const eq = (col) => filters.find((f) => f[0] === "eq" && f[1] === col)?.[2];
      const id = eq("id");
      const state = eq("extraction_review_state");
      return rows
        .filter((r) => id === undefined || r.id === id)
        .filter((r) => state === undefined || r.extraction_review_state === state);
    },
  });
  const WAITING = {
    id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee", user_id: USER, client_id: null,
    file_name: "Experian-July.pdf", created_at: "2026-08-20T00:00:00Z",
    last_analyzed_at: "2026-08-20T00:00:00Z",
    analysis_result: STRUCTURED, extraction_review_state: "awaiting_review",
  };

  const SETTLED = { ...WAITING, id: "ffffffff-ffff-4fff-8fff-ffffffffffff",
    file_name: "Equifax-June.pdf", extraction_review_state: "applied" };

  const listed = await drive({
    stream: true,
    toolCall: { name: "document_pending_reviews", args: {} },
    rpcOverrides: { get_actor_access: { data: { tier: "tenant" }, error: null } },
    tablesExtra: uploads([WAITING, SETTLED]),
  });
  const listWire = listed.modelEgress.map((b) => (typeof b === "string" ? b : JSON.stringify(b)))
    .join("\n").replace(/\\"/g, '"');
  assert("17.1 a document still waiting on a person is findable, by name",
    /Experian-July\.pdf/.test(listWire), "the pending list never reached the model");
  // Kills: dropping the state filter, which would offer to "go through" documents already settled.
  assert("17.1b …and one already dealt with is NOT offered as waiting",
    !/Equifax-June\.pdf/.test(listWire), "a settled document was listed as still waiting");

  const resumed = await drive({
    stream: true,
    toolCall: { name: "document_resume_review", args: { upload_id: WAITING.id } },
    rpcOverrides: { get_actor_access: { data: { tier: "tenant" }, error: null } },
    tablesExtra: uploads([WAITING]),
  });
  // THE CARD ITSELF, on the wire the surface reads. Kills: setting the proposal on a variable the
  // close-out never emits, and rebuilding a proposal with no fields.
  assert("17.2 …and resuming it puts the CARD back on the wire",
    /"extraction_proposal"/.test(resumed.bodyText ?? ""),
    (resumed.bodyText ?? "").slice(0, 200));
  assert("17.3 …carrying the findings, re-derived from the stored reading",
    /credit_score_equifax/.test(resumed.bodyText ?? "") && /712/.test(resumed.bodyText ?? ""),
    (resumed.bodyText ?? "").slice(0, 300));
  // It re-SHOWS; it must not save. Kills: any write slipping into the resume path.
  assert("17.4 …and resuming saves nothing",
    !resumed.rec.inserts.some((i) => i.table !== "paige_llm_trace")
      && !resumed.outboundCalls.some((c) => c.url.includes("paige-write-back") || c.url.includes("sync-credit-report-data")),
    JSON.stringify({ inserts: resumed.rec.inserts.map((i) => i.table), out: resumed.outboundCalls.map((c) => c.url) }));

  // A settled document is not re-offerable. Kills: dropping the state check, which would let a
  // person be shown a card for something they had already declined.
  const settled = await drive({
    stream: true,
    toolCall: { name: "document_resume_review", args: { upload_id: WAITING.id } },
    rpcOverrides: { get_actor_access: { data: { tier: "tenant" }, error: null } },
    tablesExtra: uploads([{ ...WAITING, extraction_review_state: "applied" }]),
  });
  assert("17.5 an already-settled document cannot be re-offered",
    !/"extraction_proposal"/.test(settled.bodyText ?? ""),
    (settled.bodyText ?? "").slice(0, 200));
}

// ── 18. THE MODEL CANNOT APPROVE ITSELF ──────────────────────────────────────────────────────
//
// THE PROPERTY, AND HOW IT WAS LOST. Before the token existed, the re-entry test read
// `approvedConfirmations`, which comes only from the validated REQUEST BODY. A model cannot write
// the request body, so self-approval was impossible by construction — not by instruction.
//
// Handing the model a `confirm_token` in the tool result destroyed that. The tool loop pushes tool
// results back into `convo` and issues another round with `tool_choice:"auto"`, so the token the
// gate mints to make approval EXPRESSIBLE lands in the model's own context one round before any
// human sees anything. The only thing left standing between a proposal and a write was a `note`
// string asking the model not to. That is not a gate.
//
// It was found by an independent adversarial review driving the real handler, not by any test
// here — the whole of section 13 passed throughout, because every check there supplies the token
// the way a SURFACE would and never asks whether the MODEL could have supplied it.
//
// The restored property: a token cannot be redeemed in the request that issued it. A different
// request means a new user message — a human typed something. That is the thing the model cannot
// manufacture, and it is what "approved" has to rest on.
{
  const CONFIRM = { rpcOverrides: {
    resolve_tool_autonomy: { data: "confirm", error: null },
    get_actor_access: { data: { tier: "tenant" }, error: null },
  } };
  const THREAD = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

  /** The store, faithful on the one axis that matters: a row remembers which request minted it. */
  function store() {
    const rows = [];
    return {
      rows,
      table: (filters) => {
        const eq = (c) => filters.find((f) => f[0] === "eq" && f[1] === c)?.[2];
        const neq = (c) => filters.find((f) => f[0] === "neq" && f[1] === c)?.[2];
        const fp = eq("fingerprint");
        if (fp === undefined) return [];
        const notFrom = neq("issued_in_request");
        // Faithful to postgrest: `.not(col,"is",null)` drops NULL rows, and `neq` against a NULL
        // column value is NULL (i.e. not a match) rather than true.
        const excludesNull = filters.some((f) => f[0] === "not" && f[1] === "issued_in_request");
        const hit = rows.find((r) => r.fingerprint === fp && !r.consumed
          && (!excludesNull || r.issued_in_request != null)
          && (notFrom === undefined || (r.issued_in_request != null && r.issued_in_request !== notFrom)));
        if (!hit) return [];
        hit.consumed = true;
        return [{ args: hit.args }];
      },
    };
  }

  const st = store();
  const selfApproved = await drive({
    stream: true, selfApproving: true, extraBody: { threadId: THREAD },
    toolCall: { name: "update_client_data", args: { client_id: OWN, updates: { goal: "buy a house" } } },
    clientId: OWN,
    ...CONFIRM,
    tablesExtra: { paige_pending_confirmations: st.table },
    // Mirrored LIVE, as the handler writes it. Mirroring after the drive would leave the store
    // empty at claim time, and 18.1 would pass because the fixture forgot the row rather than
    // because the gate held — which is exactly how it passed on first write.
    onInsert: (t, row) => { if (t === "paige_pending_confirmations") st.rows.push({ ...row, consumed: false }); },
  });

  assert("18.0 the model DID replay the token it was handed (guards this section)",
    selfApproved.selfApproveReplays > 0,
    "the stub never saw a confirm_token — this section proves nothing without that");

  // THE ASSERTION. No request-body echo was sent; no human exists in this drive.
  const wrote = selfApproved.outboundCalls.filter((c) => c.url.includes("paige-write-back"));
  assert("18.1 a model replaying its own token performs NO write",
    wrote.length === 0,
    JSON.stringify(wrote.map((c) => c.body)));

  // And the same for the tool that grants autonomy itself — the one thing §67 says she must never
  // be able to do for herself. Kills: any future path that lets a self-minted token through.
  const st2 = store();
  const selfGranted = await drive({
    stream: true, selfApproving: true, extraBody: { threadId: THREAD },
    toolCall: { name: "automation_set_grant", args: { automation_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", lane: "auto" } },
    ...CONFIRM,
    tablesExtra: {
      paige_pending_confirmations: st2.table,
      paige_automations: () => [{ id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", name: "P", granted_lane: "confirm", state: "draft" }],
    },
    onInsert: (t, row) => { if (t === "paige_pending_confirmations") st2.rows.push({ ...row, consumed: false }); },
  });
  assert("18.2 …and cannot raise its own autonomy grant",
    !selfGranted.rec.inserts.some((i) => i.table === "paige_automations" && i.update),
    JSON.stringify(selfGranted.rec.inserts.filter((i) => i.table === "paige_automations")));

  // THE OTHER HALF: a token that arrives from a LATER request still works. Without this, "nothing
  // is redeemable" would pass 18.1 and 18.2 and leave the outage the token existed to fix.
  const st3 = store();
  st3.rows.push({
    user_id: USER, tool_name: "update_client_data", fingerprint: "abcdef0123456789",
    args: { client_id: OWN, updates: { goal: "buy a house" } },
    issued_in_request: "a-previous-request", consumed: false,
  });
  const laterTurn = await drive({
    stream: true, clientId: OWN, extraBody: { threadId: THREAD },
    toolCall: { name: "update_client_data", args: { confirm_token: "abcdef0123456789" } },
    ...CONFIRM,
    tablesExtra: { paige_pending_confirmations: st3.table },
  });
  // A row with NO nonce cannot be a wildcard. `neq` against NULL is NULL, which drops the row from
  // an ordinary filter — but relying on that quietly would leave the intent unexpressed, and
  // mutation-testing showed the guard was otherwise untested. A legacy row is unredeemable, and
  // that is the safe direction: it asks again rather than acting on an unattributable approval.
  const st4 = store();
  st4.rows.push({
    user_id: USER, tool_name: "update_client_data", fingerprint: "beefbeefbeefbeef",
    args: { client_id: OWN, updates: { goal: "legacy" } },
    issued_in_request: null, consumed: false,
  });
  const legacy = await drive({
    stream: true, clientId: OWN, extraBody: { threadId: THREAD },
    toolCall: { name: "update_client_data", args: { confirm_token: "beefbeefbeefbeef" } },
    ...CONFIRM,
    tablesExtra: { paige_pending_confirmations: st4.table },
  });
  assert("18.4 a proposal with no request stamped on it is NOT redeemable",
    !legacy.outboundCalls.some((c) => c.url.includes("paige-write-back")),
    JSON.stringify(legacy.outboundCalls.map((c) => c.url)));

  assert("18.3 a token from an EARLIER request still redeems, so approval still works",
    laterTurn.outboundCalls.some((c) => c.url.includes("paige-write-back")
      && c.body.includes("buy a house")),
    JSON.stringify(laterTurn.outboundCalls.map((c) => c.url)));
}

console.log(`\n${checks - failures} passed, ${failures} failed`);
process.exit(failures === 0 ? 0 : 1);
