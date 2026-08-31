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
/** Every request body sent to the model this turn — the real prompt/model EGRESS surface. */
let modelEgress = [];
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
  if (modelStub && href.includes("anthropic.com")) {
    const wantsStream = (() => {
      try { return JSON.parse(String(init?.body ?? "{}")).stream === true; } catch { return false; }
    })();
    if (wantsStream) return sseModelReply("ok");
    return new Response(
      JSON.stringify({ content: [{ type: "text", text: "ok" }], stop_reason: "end_turn", usage: { input_tokens: 1, output_tokens: 1 } }),
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
}) {
  const logged = [];
  embedCount = 0;
  modelEgress = [];
  modelStub = stream;
  const origError = console.error, origWarn = console.warn;
  console.error = (...a) => logged.push({ level: "error", msg: a.join(" ") });
  console.warn = (...a) => logged.push({ level: "warn", msg: a.join(" ") });

  const rec = fake.setScenario({
    authUser: { id: USER, email: "owner@example.test" },
    rpcs: {
      check_rate_limit: { data: true, error: null },
      current_user_tenant_id: { data: CALLER_TENANT, error: null },
      is_platform_operator: { data: false, error: null },
      is_platform_owner: ownerRpc,
      get_paige_persona_context: { data: [{ tenant_id: null, tenant_name: null, playbook_config: null, playbook_slug: null, funding_enabled: false, brand: null }], error: null },
      match_paige_memory: { data: [{ source: "memory", memory_type: "user_preference", content: MEMORY_TEXT, similarity: 0.95 }], error: null },
    },
    tableErrors: { ...(clientsError ? { clients: clientsError } : {}), ...(memoryReadError ? { client_memory: memoryReadError } : {}) },
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
      }),
    }));
    status = res.status;
    try { bodyText = await res.text(); } catch { /* streamed */ }
  } catch (e) { status = "throw:" + (e?.message ?? e); }
  modelStub = false;

  console.error = origError; console.warn = origWarn;
  const memoryReads = rec.from.filter((f) => f.table === "client_memory" && f.op === "select");
  const memoryRpc = rec.rpc.filter((r) => r.name === "match_paige_memory");
  return { rec, status, bodyText, logged, embeds: embedCount, memoryReads, memoryRpc, modelEgress: [...modelEgress] };
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
  assert("5.1 a refused turn performs NO inserts of any kind",
    (foreignWrite.rec.inserts ?? []).length === 0,
    JSON.stringify((foreignWrite.rec.inserts ?? []).map((i) => i.table)));
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
  assert("6.2 the caller's own id is used instead, so the turn still works",
    foreignAll.rec.from.some((f) => JSON.stringify(f.filters).includes(USER)),
    "no caller-scoped read observed");
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
  assert("7.0 the harness observed real model egress (guards the check itself)",
    denied.modelEgress.length > 0, "no model request was captured");
  assert("7.1 the request-supplied client context is not injected on a refused turn",
    !denied.modelEgress.some((b) => b.includes("CLIENT CONTEXT (VERIFIED DATABASE DATA)")),
    "the named client's context block reached the model after a refusal");
  assert("7.1b …and the refused id never reaches the model either",
    !denied.modelEgress.some((b) => b.includes(FOREIGN)),
    "the refused id reached the model");

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
  assert("8.1 an authorized document turn still reaches the upload path",
    ownDoc.status !== 400 && ownDoc.status !== "throw:undefined",
    `status: ${ownDoc.status}`);

  const foreignDoc = await drive({ clientId: FOREIGN, document: doc, text: "here is my statement" });
  assert("8.2 a refused document turn never reads clients with the raw body id outside the guard",
    foreignDoc.rec.from.filter((f) => f.table === "clients").length <= 1,
    JSON.stringify(foreignDoc.rec.from.filter((f) => f.table === "clients").map((f) => f.filters)));
  assert("8.2b the authorized turn writes into the AUTHORIZED client's folder",
    ownDoc.rec.uploads.length > 0 && ownDoc.rec.uploads.every((u) => u.path.startsWith(`${OWN}/`)),
    JSON.stringify(ownDoc.rec.uploads.map((u) => u.path)));
  assert("8.2c a REFUSED turn writes into the CALLER's own folder, never the named client's",
    foreignDoc.rec.uploads.length > 0
      && foreignDoc.rec.uploads.every((u) => u.path.startsWith(`${USER}/`))
      && !foreignDoc.rec.uploads.some((u) => u.path.includes(FOREIGN)),
    JSON.stringify(foreignDoc.rec.uploads.map((u) => u.path)));
  assert("8.3 …and no table read or write anywhere carries the refused id",
    !foreignDoc.rec.from.some((f) => f.table !== "clients" && JSON.stringify(f.filters).includes(FOREIGN))
      && !foreignDoc.rec.inserts.some((i) => JSON.stringify(i.row ?? {}).includes(FOREIGN)),
    JSON.stringify({
      reads: foreignDoc.rec.from.filter((f) => f.table !== "clients" && JSON.stringify(f.filters).includes(FOREIGN)).map((f) => f.table),
      writes: foreignDoc.rec.inserts.filter((i) => JSON.stringify(i.row ?? {}).includes(FOREIGN)).map((i) => i.table),
    }));
}

console.log(`\n${checks - failures} passed, ${failures} failed`);
process.exit(failures === 0 ? 0 : 1);
