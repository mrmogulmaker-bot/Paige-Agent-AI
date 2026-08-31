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
let syncThrows = false;
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
    // A round that calls `document_generate` with valid blocks and a real title. That tool
    // persists via `save_marketing_content` and, outside a Studio session, pushes a
    // `chatArtifacts` entry whose `title` is the model's own words — so the turn emits a
    // `paige_artifact` frame carrying model-authored, evidence-derived text. Nothing else in
    // this harness produces one, and without it an assertion that artifact frames are withheld
    // would pass against a fixture that never makes one (the group-20 thought-frame lesson).
    : kind === "doc-artifact"
    ? [
        { type: "message_start", message: { usage: { input_tokens: 1 } } },
        { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } },
        { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "Writing that up from the private note." } },
        { type: "content_block_start", index: 0, content_block: { type: "tool_use", id: "tool-1", name: "document_generate" } },
        { type: "content_block_delta", index: 0, delta: { type: "input_json_delta", partial_json: JSON.stringify({ title: "CHILD-PRIVATE-MARKER onboarding guide", doc_type: "guide", confirm: true, blocks: [{ type: "prose", markdown: "Body text." }] }) } },
        { type: "message_delta", delta: { stop_reason: "tool_use" }, usage: { output_tokens: 1 } },
        { type: "message_stop" },
      ]
    // A mutating call left UNCONFIRMED. At the default `confirm` lane the tool is not run; it
    // returns `needs_confirm` + a `confirm_summary` built by interpolating the MODEL'S OWN
    // ARGUMENTS, which the loop turns into a `paige_confirm` card. `crm_create_contact` is used
    // deliberately: `document_generate`'s summary is a fixed sentence, so a card built from it
    // would carry no model text and the assertion below would pass for the wrong reason.
    : kind === "confirm-card"
    ? [
        { type: "message_start", message: { usage: { input_tokens: 1 } } },
        { type: "content_block_start", index: 0, content_block: { type: "tool_use", id: "tool-1", name: "crm_create_contact" } },
        { type: "content_block_delta", index: 0, delta: { type: "input_json_delta", partial_json: JSON.stringify({ first_name: "CHILD-PRIVATE-MARKER", last_name: "FromKnowledge", email: "leak@example.test" }) } },
        { type: "message_delta", delta: { stop_reason: "tool_use" }, usage: { output_tokens: 1 } },
        { type: "message_stop" },
      ]
    // `ask_choices` inside a Studio session. This branch is special: the chips frame IS the whole
    // assistant turn (it sets `finalChunks = []` and breaks), so if it streams unbuffered a
    // protected turn publishes its entire answer before the final check ever runs.
    // `action_file` with a department the model INVENTED. `describeStep` title-cases
    // `args.to_department` straight into an action step's LABEL, and action steps are the one
    // channel that streams live on a protected turn — on the stated grounds that their label
    // comes from a fixed vocabulary. It did not. Nothing else in this harness drives a tool
    // whose step text is built from model arguments.
    // `propose_action`, which queues an approval and emits an `approval_queued` frame whose
    // `summary` is the model's own argument. That frame was listed in the commit message as
    // "moved behind the close decision" and as mutation-proven; reverting it left the suite
    // fully green, because nothing here produced one. This fixture is what makes the claim real.
    : kind === "propose-action"
    ? [
        { type: "message_start", message: { usage: { input_tokens: 1 } } },
        { type: "content_block_start", index: 0, content_block: { type: "tool_use", id: "tool-1", name: "propose_action" } },
        { type: "content_block_delta", index: 0, delta: { type: "input_json_delta", partial_json: JSON.stringify({ action_type: "email", summary: "CHILD-PRIVATE-MARKER follow-up", contact_id: "11111111-1111-4111-8111-111111111111", subject: "s", body: "b", to: "x@example.test" }) } },
        { type: "message_delta", delta: { stop_reason: "tool_use" }, usage: { output_tokens: 1 } },
        { type: "message_stop" },
      ]
    // `draft_marketing_content` — a tool that WRITES (so the autonomy gate governs it, and it sits
    // in `MUTATING_TOOLS`) but whose result is GENERATED COPY grounded in the tenant's name and
    // brand voice, read out of storage by `content-draft`. Reusing `MUTATING_TOOLS` as the
    // receipt set therefore left an otherwise-ordinary turn unprotected while its closing reply
    // was written in the previous workspace's voice. Nothing else in this harness drives a tool
    // that is a write and a generator at once.
    : kind === "draft-content"
    ? [
        { type: "message_start", message: { usage: { input_tokens: 1 } } },
        { type: "content_block_start", index: 0, content_block: { type: "tool_use", id: "tool-1", name: "draft_marketing_content" } },
        { type: "content_block_delta", index: 0, delta: { type: "input_json_delta", partial_json: JSON.stringify({ channel: "email", brief: "launch note", confirm: true }) } },
        { type: "message_delta", delta: { stop_reason: "tool_use" }, usage: { output_tokens: 1 } },
        { type: "message_stop" },
      ]
    : kind === "action-file"
    ? [
        { type: "message_start", message: { usage: { input_tokens: 1 } } },
        { type: "content_block_start", index: 0, content_block: { type: "tool_use", id: "tool-1", name: "action_file" } },
        { type: "content_block_delta", index: 0, delta: { type: "input_json_delta", partial_json: JSON.stringify({ to_department: "LEAKEDMODELWORD", action_kind: "owner.followup", summary: "x" }) } },
        { type: "message_delta", delta: { stop_reason: "tool_use" }, usage: { output_tokens: 1 } },
        { type: "message_stop" },
      ]
    : kind === "ask-choices"
    ? [
        { type: "message_start", message: { usage: { input_tokens: 1 } } },
        { type: "content_block_start", index: 0, content_block: { type: "tool_use", id: "tool-1", name: "ask_choices" } },
        { type: "content_block_delta", index: 0, delta: { type: "input_json_delta", partial_json: JSON.stringify({ prompt: "CHILD-PRIVATE-MARKER — which direction?", options: [{ label: "One", value: "one" }, { label: "Two", value: "two" }] }) } },
        { type: "message_delta", delta: { stop_reason: "tool_use" }, usage: { output_tokens: 1 } },
        { type: "message_stop" },
      ]
    : kind === "two-tools"
    ? [
        { type: "message_start", message: { usage: { input_tokens: 1 } } },
        // Narration alongside the tool calls, so the round produces a `summarizeThought` line.
        // Without it `content` is empty, no thought frame is ever emitted, and an assertion that
        // thoughts are withheld would pass against a fixture that never makes one.
        { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } },
        { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "Checking the private note about CHILD-PRIVATE-MARKER before I answer." } },
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
    // Throwing HERE is what reaches the helper's catch block. Throwing from the provider does
    // NOT: `gatewayCompat` catches its own transport errors and returns a non-ok response, so
    // the helper takes the extraction-failure branch instead and the catch is never entered.
    // The control assertion below is what caught that — the first version of this scenario
    // "passed" a throw that never went where it claimed.
    if (syncThrows) throw new Error("simulated sync transport failure");
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
async function drive({ personaTenant, personaSequence = null, memberships, kbRejects = false, ragHits = false, bodyExtras = {}, noAuth = false, unauthenticated = false, chunkTitle = "Onboarding", chunkContent = "x", provider = ["text"], rpcExtras = {}, tableExtras = {}, fundingEnabled = false, throwOnSync = false }) {
  const logged = [];
  syncThrows = throwOnSync;
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
        // A TENANT-LESS OPERATOR GETS NO ROW, NOT A ROW OF NULLS. The real resolver
        // (migration 20260805130000, lines 80-82) executes a bare `RETURN` when the tenant is
        // null, and a bare RETURN from a RETURNS TABLE function yields ZERO ROWS. This fake used
        // to fabricate `[{ tenant_id: null, … }]`, a shape production never produces — so the
        // operator control asserted delivery against a shape that could not occur, and passed
        // while every real operator turn carrying evidence was being refused outright.
        if (state == null) return { data: [], error: null };
        return {
          data: [{ tenant_id: state, tenant_name: null, playbook_config: null, playbook_slug: null, funding_enabled: fundingEnabled, brand: null }],
          error: null,
        };
      },
      match_tenant_knowledge: (args) =>
        kbRejects
          ? { data: null, error: { message: "KB_FORBIDDEN: cross-tenant knowledge search denied", code: "42501" } }
          : { data: [{ source_tier: "tenant", doc_id: "d1", chunk_id: "c1", title: chunkTitle, content: chunkContent, similarity: 0.91 }], error: null },
      // `rag_documents` retrieval — the platform-wide knowledge base, and the SECOND of the
      // latch's four sources. It was never configured here, so it resolved to `{data:null}` and
      // `ragContext` was `""` in every assertion in this file: removing it from the latch left
      // the whole suite green. An independent review found that, and this stub is what ends it.
      match_rag_documents: () => (ragHits
        ? { data: [{ id: "rag-1", title: "Tracked outcomes", summary: "PRIVATE-RAG-SOURCE-MARKER", content: "", similarity: 0.88 }], error: null }
        : { data: [], error: null }),
      // Scenario-specific RPCs (e.g. the `save_marketing_content` a `document_generate` tool
      // call persists through). Last, so a scenario can also override a default above.
      ...rpcExtras,
    },
    tables: {
      tenant_members: () => memberships.map((t) => ({ tenant_id: t })),
      profiles: () => [{ active_tenant_id: personaTenant }],
      ...tableExtras,
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
    syncThrows = false;
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

// Groups 13, 16, 17 and 18 time an account switch by counting `get_paige_persona_context`
// calls against a documented index table. Group 19's bound is derived from a control run, but an
// INTERIOR boundary cannot be derived the same way — you have to name the position you mean. So
// each of those groups instead asserts the TOTAL for its round shape, and that is what keeps the
// table honest: if a change adds, removes or moves a scope check, the total moves with it and
// these assertions fail by name, instead of the timings silently sliding one boundary along and
// testing something nobody chose. That silent slide has already happened twice on this branch,
// both times leaving mutations that had been caught the round before passing green again.
//
// If one of these fails, do NOT just bump the number. Re-derive the table for that shape, then
// fix every timing in the group that depends on it.
const personaCalls = (r) => r.rec.rpc.filter((c) => c.name === "get_paige_persona_context").length;
const assertShape = async (label, plan, expected) => {
  const control = await drive({
    personaTenant: CHILD, personaSequence: [CHILD], memberships: [CHILD],
    chunkContent: "CHILD-PRIVATE-MARKER", provider: plan,
  });
  assert(
    `SHAPE ${label}: the documented index table still holds (${expected} persona calls)`,
    personaCalls(control) === expected,
    `expected ${expected}, got ${personaCalls(control)} — the timings in this group now point at different boundaries; re-derive the table, do not just bump this number`,
  );
};

group("active-account changes during the agent loop stop later provider calls");
{
  await assertShape("grp13 tool+text", ["tool", "text"], 8);
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
  async function driveDocumentPostProcess(scopeStates, { uploadId = null, plan = ["json-extraction"], throwOnSync = false } = {}) {
    resetProvider(plan);
    syncThrows = throwOnSync;
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
    syncThrows = false;
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

  // (c) The CATCH block. Its two writes are off the success path, so nothing above reaches them.
  //     Scope-call order once a provider call throws: pre-extraction, the catch's own
  //     revalidation, the failure log, the failed-upload stamp.
  const throwOpts = { uploadId: "upload-1", throwOnSync: true };
  const validThrow = await driveDocumentPostProcess([true], throwOpts);
  assert(
    "14b.7 CONTROL — a pipeline exception under valid scope writes BOTH its rows",
    wrote(validThrow, "audit_logs") && wrote(validThrow, "credit_report_uploads"),
    JSON.stringify(validThrow.writes.map((w) => w.table)),
  );
  // Scope-call order once the sync fetch throws: pre-extraction, post-extraction, pre-sync, the
  // catch's own revalidation, the failure log, the failed-upload stamp. Derived by driving it,
  // not assumed — see the control above for why assuming was wrong the first time.
  const catchCalls = 6;
  const staleStamp = await driveDocumentPostProcess(Array(catchCalls - 1).fill(true).concat([false]), throwOpts);
  assert(
    "14b.8 a switch between the two catch writes logs the failure but refuses the upload stamp",
    wrote(staleStamp, "audit_logs") && !wrote(staleStamp, "credit_report_uploads"),
    JSON.stringify(staleStamp.writes.map((w) => w.table)),
  );
  const staleLog = await driveDocumentPostProcess(Array(catchCalls - 2).fill(true).concat([false]), throwOpts);
  assert(
    "14b.9 a switch before the catch's failure log writes neither row",
    !wrote(staleLog, "audit_logs") && !wrote(staleLog, "credit_report_uploads"),
    JSON.stringify(staleLog.writes.map((w) => w.table)),
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
  await assertShape("grp16 two-tools", ["two-tools", "private-text"], 9);
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

  // THE BOUNDARY IS FOUND, NOT WRITTEN DOWN. External review made the sharper version of the
  // point the shape assertions only half-cover: those catch a check being ADDED or REMOVED (the
  // total moves), but not one being MOVED (total unchanged, every index shifts by one). If that
  // happened, `runTools(4)` would land BEFORE the first tool instead of between the two, and
  // 16.4-16.6 would still see zero narrated tools, one provider call and no telemetry — passing
  // for the wrong reason with the per-tool guard gone.
  //
  // No tool in this harness leaves a recordable side effect (`plan_list` and `list_event_kinds`
  // both return an error result before reaching their RPC, and a mid-batch abort suppresses the
  // step trace), so "tool 1 ran" is not directly observable. What IS observable is the TRANSITION:
  // the smallest n at which the round completes. A per-tool guard puts three refusal boundaries
  // before completion (post-round, tool-1, tool-2); a per-batch guard puts two. So the transition
  // point itself distinguishes them, and it is derived rather than assumed.
  let firstComplete = null;
  for (let n = 2; n <= 10; n++) {
    if (stepIds((await runTools(n)).responseText).length === 2) { firstComplete = n; break; }
  }
  // WHAT 16.0 DOES NOT PROVE, stated precisely (§13). It measures how many refusal boundaries
  // precede completion, not that each check runs BEFORE its tool. A check moved from the top of
  // the loop body to the bottom — after the handler has already run — would still leave three
  // boundaries, and this group alone would not notice.
  //
  // That mutation IS caught, but by the rest of the suite rather than by this group: applied at
  // this head it fails 10 assertions, including grp18b's shape total (the per-executed-tool check
  // changes the call count) and 18.1/18.2/18.4. Verified by running it, not assumed. Tool
  // dispatch itself remains unobservable here — no tool in the catalogue leaves a recordable side
  // effect on this path — so a direct ordering assertion is not available, and this note is the
  // honest statement of the gap rather than a claim that one exists.
  assert(
    "16.0 the round first completes at the boundary a PER-TOOL guard implies",
    firstComplete === 5,
    `first complete at n=${firstComplete}; 5 means three refusal boundaries precede completion (post-round, tool-1, tool-2). 4 means only two — the per-tool guard is gone. Any other value means a boundary moved: re-derive this group's timings, do not bump the number.`,
  );

  const beforeFirst = await runTools(firstComplete - 2);
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

  const betweenTools = await runTools(firstComplete - 1);
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
  await assertShape("grp17 tool-less round", ["private-text"], 5);
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
  // INVERTED BY THE SAFETY-FIRST STREAMING RULING (owner, 2026-08-31), and kept rather than
  // deleted because the inversion is the point. 17.1 used to assert that the reply had ALREADY
  // crossed by this boundary — that was true, and it was the residual the ruling closes. On a
  // protected turn the reply is now held until this same check passes, so the reply and the
  // telemetry row share ONE decision: at a lapse here, neither survives.
  assert(
    "17.1 a lapse at the final boundary withholds the REPLY as well (was: reply already crossed)",
    !atPostDrain.responseText.includes("CHILD-PRIVATE-MARKER"),
    atPostDrain.responseText.slice(0, 300),
  );
  assert(
    "17.2 ...and no telemetry row is written, on the same decision",
    !atPostDrain.telemetry,
    JSON.stringify(atPostDrain.telemetry?.row ?? null),
  );
  assert(
    "17.2b ...and the user gets the safe refusal instead of a truncated answer",
    /workspace changed/.test(atPostDrain.responseText),
    atPostDrain.responseText.slice(0, 300),
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
  await assertShape("grp18a tool+text", ["tool", "text"], 8);
  await assertShape("grp18b tool+fail+text", ["tool", "fail", "text"], 8);
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


// ── 20 · SAFETY-FIRST STREAMING (owner ruling) ────────────────────────────────────
// Any reply that reads, summarizes, transforms or otherwise carries tenant Knowledge or
// document-derived content stays FULLY BUFFERED until its final scope and permission checks
// pass. Ordinary chat that touches no protected evidence keeps live token streaming. This
// replaces the previous position — a documented "closing window" residual on the chat path and
// an inconsistent hold on the document path — with one explicit rule.
//
// PROTECTED CONTENT, and therefore what must never survive a failed final check: the reply's own
// `choices[].delta.content` tokens; `paige_step` frames of kind "thought" (`summarizeThought`
// of model output — prose generated FROM a Knowledge-bearing prompt, which reads as progress but
// is derived content); the approval, confirm, artifact and choice-chip frames, each of which
// carries model-authored text; `sync_status`, which carries the bureau scores read out of the
// uploaded PDF; and the `[DONE]` sentinel, which must not overtake the buffer it terminates.
//
// Neutral progress that MAY still stream on a protected turn: action steps, phase frames,
// compaction frames, and the fixed client-scope refusal category. That list is NOT taken on
// trust — `nonNeutralFrames` below enforces the shape of each rather than the presence of its
// key, because keying on the name alone meant a leak only had to reuse a neutral key. Three
// mutations that put the whole tenant-Knowledge block on the wire under `paige_phase`,
// `client_scope` and an action step's `detail` all passed 223/223 before that was fixed.
//
// HOW THIS IS PROVEN, and why not by timing. Whether a frame was enqueued before or after the
// gate is not observable from outside: the handler can fill the stream's queue before the test
// reads a single byte, which would make "all RPCs then all frames" look like correct ordering
// even from a streaming implementation. So the property is proven CAUSALLY instead — fail the
// final gate and assert nothing protected survives. A turn that streamed content early cannot
// retract it, so its frames are still in the output; a turn that buffered has nothing to flush.
// That is the same property, and it cannot pass for the wrong reason.
// THE COMPLEMENT OF "NEUTRAL", stated as a denylist of the safe frames rather than an
// allowlist of the unsafe ones. Enumerating what to withhold is how the first version of this
// rule shipped, and it is why `paige_artifact`, `approval_queued`, `paige_confirm` and
// `extraction_proposal` all went straight to the wire on a turn whose reply was withheld: each
// was simply not on the list. Written this way, a frame added later is protected by DEFAULT and
// has to be argued onto the neutral list, which is the direction the safe error runs in.
//
// Neutral, and only these: an action step (fixed-vocabulary label, count detail), a phase
// marker, the fixed client-scope refusal category, and the refusal sentence itself.
// EVERY MARKER ANY FIXTURE PLANTS IN PROTECTED EVIDENCE. A frame is non-neutral if it carries
// one, whatever key it arrives under. The first version of this classifier keyed purely on the
// frame's TOP-LEVEL NAME, so a leak simply had to reuse a neutral key: putting the whole
// tenant-Knowledge block inside a `paige_phase` frame, inside a `client_scope` frame, or inside
// an action step's `detail` all streamed the evidence live on a protected turn with 223/223
// green. "Protected by default" was the claim; "neutral by default if you reuse a key" was the
// behaviour.
const PROTECTED_MARKERS = /CHILD-PRIVATE-MARKER|PRIVATE-KB-SOURCE-MARKER|PRIVATE-RAG-SOURCE-MARKER|PRIVATE-SESSION-DOC-MARKER/;
const nonNeutralFrames = (text) => text.split("\n").filter((l) => {
  if (!l.startsWith("data: ")) return false;
  const raw = l.slice(6);
  if (raw.trim() === "[DONE]") return false;
  let p;
  try { p = JSON.parse(raw); } catch { return true; }
  // A frame smuggling a second key alongside a neutral one is not neutral.
  const keys = Object.keys(p);
  if (keys.length !== 1) return true;
  // Nothing neutral may contain evidence, whatever key it wears. This is the check that does the
  // real work; the shape checks below are what stop a neutral frame growing a free-text field
  // that a future fixture's marker would not happen to land in.
  if (PROTECTED_MARKERS.test(raw)) return true;
  const [k] = keys;
  const v = p[k];
  if (k === "paige_step") {
    // Thoughts are model prose and are protected. An ACTION step is neutral only while its
    // detail stays short — the code's claim is "a fixed vocabulary label and a count", and a
    // long detail means that claim has stopped being true.
    if (v?.kind === "thought") return true;
    return typeof v?.detail === "string" && v.detail.length > 40;
  }
  if (k === "paige_phase") return typeof v !== "string" || v.length > 24;
  if (k === "paige_compacting") return Object.keys(v ?? {}).some((x) => x !== "state" && x !== "pct");
  if (k === "client_scope") return typeof v?.reason !== "string" || v.reason.length > 64;
  // The refusal sentence itself, and nothing else wearing `choices`.
  if (k === "choices") return !/workspace changed/.test(raw);
  return true;
});
const personaCallsOf = (r) => r.rec.rpc.filter((c) => c.name === "get_paige_persona_context").length;

group("safety-first streaming: protected turns buffer, ordinary turns stream");
{
  const protectedFrames = (text) => text.split("\n").filter((l) => {
    if (!l.startsWith("data: ") || l.includes("[DONE]")) return false;
    try {
      const p = JSON.parse(l.slice(6));
      return typeof p?.choices?.[0]?.delta?.content === "string" || p?.paige_step?.kind === "thought";
    } catch { return false; }
  });
  // Everything the reply itself is made of, minus the refusal sentence the gate emits on failure.
  const replyContent = (text) => protectedFrames(text)
    .filter((l) => !/workspace changed/.test(l));
  const neutralFrames = (text) => text.split("\n").filter((l) => {
    if (!l.startsWith("data: ") || l.includes("[DONE]")) return false;
    try {
      const p = JSON.parse(l.slice(6));
      return (p?.paige_step && p.paige_step.kind !== "thought") || !!p?.paige_phase;
    } catch { return false; }
  });

  const docx = {
    fileName: "notes.docx",
    mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    kind: "docx",
    textContent: "Internal operating notes",
  };

  // Each shape is driven twice: once stable (the positive control — it must DELIVER), then once
  // with the account switching at the shape's LAST gate, derived from the control's own call
  // count rather than written down, for the reasons group 19 records.
  const shapes = [
    {
      id: "knowledge chat",
      opts: { chunkContent: "PRIVATE-KB-SOURCE-MARKER", provider: ["private-text"] },
      protectedTurn: true,
    },
    {
      id: "document + Knowledge",
      opts: { chunkContent: "PRIVATE-KB-SOURCE-MARKER", bodyExtras: { document: docx }, provider: ["private-text", "private-text"] },
      protectedTurn: true,
    },
    {
      // THE §58 CASE. Document-derived content is protected on its own, with or without a KB
      // match. Before this rule such a turn streamed live, and that inconsistency is what the
      // owner ruling resolves.
      id: "document, NO Knowledge match",
      opts: { kbRejects: true, bodyExtras: { document: docx }, provider: ["private-text", "private-text"] },
      protectedTurn: true,
    },
  ];

  for (const shape of shapes) {
    const stable = await drive({
      personaTenant: CHILD, personaSequence: [CHILD], memberships: [CHILD], ...shape.opts,
    });
    assert(
      `20 ${shape.id}: CONTROL — a clean turn still delivers its reply`,
      stable.responseText.includes("CHILD-PRIVATE-MARKER"),
      stable.responseText.slice(0, 200),
    );
    const total = personaCallsOf(stable);
    assert(
      `20 ${shape.id}: CONTROL — enough gates exist for the timing below to mean anything`,
      total >= 3,
      `persona calls: ${total}`,
    );

    // Switch at the LAST gate: everything up to it succeeded, so this isolates the final check.
    const atFinalGate = await drive({
      personaTenant: CHILD,
      personaSequence: Array(total - 1).fill(CHILD).concat([AGENCY]),
      memberships: [CHILD, AGENCY],
      ...shape.opts,
    });
    assert(
      `20 ${shape.id}: a failed FINAL check leaves no protected content in the transcript`,
      replyContent(atFinalGate.responseText).length === 0,
      JSON.stringify(replyContent(atFinalGate.responseText)).slice(0, 300),
    );
    assert(
      `20 ${shape.id}: ...no fragment of the reply survives`,
      !atFinalGate.responseText.includes("CHILD-PRIVATE-MARKER"),
      atFinalGate.responseText.slice(0, 300),
    );
    assert(
      `20 ${shape.id}: ...the user gets a safe refusal with a recovery path`,
      /workspace changed|ACTIVE_ACCOUNT_CHANGED/.test(atFinalGate.responseText) &&
        /[Tt]ry again|Start this request again/.test(atFinalGate.responseText),
      atFinalGate.responseText.slice(0, 300),
    );
    assert(
      `20 ${shape.id}: ...and writes no Knowledge telemetry`,
      !atFinalGate.telemetry,
      JSON.stringify(atFinalGate.telemetry?.row ?? null),
    );
    // Not just the reply: NOTHING that is not neutral progress may survive the failed gate.
    // This is the assertion that would have caught the four ungated frames, and it keeps
    // catching the next one without anybody remembering to name it.
    assert(
      `20 ${shape.id}: ...and no non-neutral frame of any kind survives`,
      nonNeutralFrames(atFinalGate.responseText).length === 0,
      JSON.stringify(nonNeutralFrames(atFinalGate.responseText)).slice(0, 300),
    );
  }

  // ORDINARY CHAT IS UNAFFECTED. `kbRejects` leaves the turn with no protected evidence, so it
  // must still deliver — this is what stops the rule being satisfied by "buffer everything".
  const ordinary = await drive({
    personaTenant: CHILD, personaSequence: [CHILD], memberships: [CHILD],
    kbRejects: true, provider: ["private-text"],
  });
  assert(
    "20.ordinary an unprotected turn still delivers its reply",
    ordinary.responseText.includes("CHILD-PRIVATE-MARKER"),
    ordinary.responseText.slice(0, 200),
  );
  assert(
    "20.ordinary ...and retrieved no Knowledge, so it is genuinely unprotected",
    !ordinary.telemetry && !!ordinary.logged.find((l) => /KB_FORBIDDEN|REFUSED/.test(l.msg)),
    JSON.stringify({ tel: !!ordinary.telemetry }),
  );
  // THE OTHER HALF OF THE RULING, MEASURED RATHER THAN ASSERTED. "Ordinary chat retains normal
  // live token streaming" is a claim about COST as well as content: the guard must short-circuit
  // before the RPC, not merely return true after paying for one. An ordinary turn makes exactly
  // the ONE persona call every request makes to resolve its own scope, and no revalidation on
  // top. Without this, a change that made every turn pay four extra round-trips would be
  // invisible here — every content assertion in this file would still pass.
  assert(
    "20.ordinary ...and pays NO revalidation RPC (exactly the one initial resolution)",
    personaCallsOf(ordinary) === 1,
    `persona calls: ${personaCallsOf(ordinary)}`,
  );

  // NEUTRAL PROGRESS STILL REACHES THE USER while a protected answer is being checked. The rule
  // is "buffer the derived content", not "show nothing".
  const withTools = await drive({
    personaTenant: CHILD, personaSequence: [CHILD], memberships: [CHILD],
    chunkContent: "PRIVATE-KB-SOURCE-MARKER", provider: ["two-tools", "private-text"],
  });
  assert(
    "20.progress a protected turn still emits neutral progress frames",
    neutralFrames(withTools.responseText).length > 0,
    JSON.stringify(neutralFrames(withTools.responseText)).slice(0, 200),
  );

  // THOUGHT FRAMES ARE CONTENT, NOT PROGRESS. `summarizeThought(model output)` is prose the
  // model wrote from a Knowledge-bearing prompt; it streamed live before this rule and reads
  // like status, which is exactly why it needs its own assertion. A tool round is required for
  // one to exist at all — the tool-less shapes above can never produce one, so without this the
  // "no protected content survives" assertions say nothing about thoughts.
  const toolTotal = personaCallsOf(withTools);
  const thoughtsAtGate = await drive({
    personaTenant: CHILD,
    personaSequence: Array(toolTotal - 1).fill(CHILD).concat([AGENCY]),
    memberships: [CHILD, AGENCY],
    chunkContent: "PRIVATE-KB-SOURCE-MARKER", provider: ["two-tools", "private-text"],
  });
  assert(
    "20.thought CONTROL — the tool shape really does produce thought frames when it completes",
    withTools.responseText.includes('"kind":"thought"'),
    JSON.stringify(withTools.responseText.slice(0, 200)),
  );
  assert(
    "20.thought a failed final check leaves no model-authored thought line either",
    !thoughtsAtGate.responseText.includes('"kind":"thought"'),
    thoughtsAtGate.responseText.slice(0, 300),
  );

  // AN UNRESOLVABLE SCOPE IS NOT A MATCH. If the resolver errors, the turn must refuse rather
  // than read "still the same" — otherwise a tenant-less operator, whose scope is legitimately
  // null, passes the final check on a failed lookup.
  const rpcError = { data: null, error: { message: "resolver unavailable", code: "57014" } };
  const unresolvable = await drive({
    personaTenant: CHILD,
    personaSequence: [CHILD, rpcError],
    memberships: [CHILD],
    chunkContent: "PRIVATE-KB-SOURCE-MARKER", provider: ["private-text"],
  });
  assert(
    "20.unresolved an unresolvable scope withholds the protected reply",
    !unresolvable.responseText.includes("CHILD-PRIVATE-MARKER"),
    unresolvable.responseText.slice(0, 300),
  );
  assert(
    "20.unresolved ...and writes no Knowledge telemetry",
    !unresolvable.telemetry,
    JSON.stringify(unresolvable.telemetry?.row ?? null),
  );

  // THE TENANT-LESS CASE IS WHERE "unresolvable" ACTUALLY BITES. For a tenant-BEARING turn a
  // failed lookup yields null, which already differs from the turn's scope, so the refusal
  // happens either way. For the PLATFORM OPERATOR the turn scope is legitimately null — so
  // comparing without first requiring the lookup to have SUCCEEDED reads a broken resolver as
  // "still null, still fine" and releases the reply. The operator has no Knowledge (retrieval
  // needs a tenant) but can absolutely attach a document, so the turn is protected.
  const operatorDoc = { document: docx };
  const operatorClean = await drive({
    personaTenant: null, personaSequence: [null], memberships: [],
    bodyExtras: operatorDoc, provider: ["private-text", "private-text"],
  });
  assert(
    "20.operator CONTROL — a tenant-less operator's document turn still delivers",
    operatorClean.responseText.includes("CHILD-PRIVATE-MARKER"),
    operatorClean.responseText.slice(0, 250),
  );
  // AND IT MUST BE A ZERO-ROW ANSWER THAT DELIVERS IT, not a fabricated row of nulls. The fake
  // used to return `[{ tenant_id: null, … }]` here, which the real resolver never produces — it
  // bare-`RETURN`s zero rows for a null tenant. So this control asserted delivery against an
  // impossible response and stayed green while every real operator turn carrying a document,
  // session-document context, a RAG hit or memory was refused outright. Pinning the shape is
  // what stops the fake drifting back to something more convenient than production.
  assert(
    "20.operator CONTROL — ...and the resolver answered with NO ROW, the way production does",
    operatorClean.rec.rpc.some((c) => c.name === "get_paige_persona_context"),
    JSON.stringify(operatorClean.rec.rpc.map((c) => c.name)),
  );
  const operatorBroken = await drive({
    personaTenant: null,
    personaSequence: [null, rpcError],
    memberships: [],
    bodyExtras: operatorDoc, provider: ["private-text", "private-text"],
  });
  assert(
    "20.operator a broken resolver withholds the operator's document reply (null is not a match)",
    !operatorBroken.responseText.includes("CHILD-PRIVATE-MARKER"),
    operatorBroken.responseText.slice(0, 250),
  );
}

// ── 21 · The protected sources the first enumeration missed ──────────────────────
//
// Group 20 proved the rule for the three sources it listed. Two more carry protected content
// and were reached by neither, which an independent read of the pushed diff found and this
// group now holds down.
group("safety-first streaming: the sources the first enumeration missed");
{
  const artifactFrames = (text) => text.split("\n").filter((l) => l.startsWith("data: ") && l.includes("paige_artifact"));

  // 21.a — A FOLLOW-UP QUESTION ABOUT A DOCUMENT READ EARLIER IN THE SESSION. No attachment on
  // this turn and no Knowledge match, so all three of the original sources are false; the whole
  // of the evidence is `sessionDocumentContext`, whose filenames and summaries the handler
  // interpolates into the system prompt. Before the latch counted it, such a turn streamed live
  // AND the revalidation guard short-circuited to `true` without ever asking the resolver — so
  // the answer to "what did that contract say?" crossed with no active-account check at all.
  const sessionDocs = {
    sessionDocumentContext: [
      { fileName: "termination-terms.pdf", summary: "PRIVATE-SESSION-DOC-MARKER: 30-day notice required." },
    ],
  };
  const sessionClean = await drive({
    personaTenant: CHILD, personaSequence: [CHILD], memberships: [CHILD],
    kbRejects: true, bodyExtras: sessionDocs, provider: ["private-text"],
  });
  assert(
    "21.a CONTROL — a session-document follow-up still delivers its reply",
    sessionClean.responseText.includes("CHILD-PRIVATE-MARKER"),
    sessionClean.responseText.slice(0, 200),
  );
  assert(
    "21.a CONTROL — the turn retrieved no Knowledge, so ONLY the session document protects it",
    !sessionClean.telemetry && !!sessionClean.logged.find((l) => /KB_FORBIDDEN|REFUSED/.test(l.msg)),
    JSON.stringify({ tel: !!sessionClean.telemetry }),
  );
  const sessionTotal = personaCallsOf(sessionClean);
  // The discriminator. With the source unenumerated the guard returns `true` with no RPC, so the
  // turn has exactly the ONE persona call every request makes. A second call is the latch.
  assert(
    "21.a CONTROL — the turn is actually gated (the guard asks the resolver, it does not short-circuit)",
    sessionTotal >= 2,
    `persona calls: ${sessionTotal}`,
  );
  const sessionAtGate = await drive({
    personaTenant: CHILD,
    personaSequence: Array(Math.max(sessionTotal - 1, 1)).fill(CHILD).concat([AGENCY]),
    memberships: [CHILD, AGENCY],
    kbRejects: true, bodyExtras: sessionDocs, provider: ["private-text"],
  });
  assert(
    "21.a a failed final check withholds a reply grounded in an earlier session document",
    !sessionAtGate.responseText.includes("CHILD-PRIVATE-MARKER"),
    sessionAtGate.responseText.slice(0, 300),
  );
  assert(
    "21.a ...and the user gets the safe refusal with a recovery path",
    /workspace changed/.test(sessionAtGate.responseText) && /[Tt]ry again/.test(sessionAtGate.responseText),
    sessionAtGate.responseText.slice(0, 300),
  );
  assert(
    "21.a ...and no non-neutral frame survives",
    nonNeutralFrames(sessionAtGate.responseText).length === 0,
    JSON.stringify(nonNeutralFrames(sessionAtGate.responseText)).slice(0, 300),
  );

  // 21.b — THE ARTIFACT HANDOFF CARD. `paige_artifact` carries a model-authored `title` written
  // out of the same Knowledge-bearing prompt as the reply, and it went straight to the wire.
  // A turn that correctly withheld its answer still put a card on screen naming, in the previous
  // workspace's words, the document it had just made from that workspace's evidence.
  const artifactOpts = {
    chunkContent: "PRIVATE-KB-SOURCE-MARKER",
    provider: ["doc-artifact", "private-text"],
    rpcExtras: {
      // A real tenant seat: without it the actor resolves to the most-restricted `client` tier
      // and `document_generate` is refused before it can produce anything to assert about.
      get_actor_access: { data: { tier: "tenant" }, error: null },
      // §16 lane. The default is `confirm`, which returns a needs_confirm result instead of
      // running the tool, so no artifact is ever produced to hold or leak.
      resolve_tool_autonomy: { data: "auto", error: null },
      save_marketing_content: { data: "content-abc", error: null },
    },
    // The creative tools sit behind an admin/coach role gate; without a role the call is
    // refused and dropped from the trace, so nothing is produced to hold or leak.
    tableExtras: { user_roles: () => [{ role: "admin" }] },
  };
  const artifactClean = await drive({
    personaTenant: CHILD, personaSequence: [CHILD], memberships: [CHILD], ...artifactOpts,
  });
  assert(
    "21.b CONTROL — the tool shape really does emit an artifact frame when the turn completes",
    artifactFrames(artifactClean.responseText).length > 0,
    artifactClean.responseText.slice(0, 400),
  );
  assert(
    "21.b CONTROL — and that frame carries the model-authored title",
    artifactFrames(artifactClean.responseText).join("").includes("CHILD-PRIVATE-MARKER"),
    artifactFrames(artifactClean.responseText).join("").slice(0, 300),
  );
  const artifactTotal = personaCallsOf(artifactClean);
  const artifactAtGate = await drive({
    personaTenant: CHILD,
    personaSequence: Array(artifactTotal - 1).fill(CHILD).concat([AGENCY]),
    memberships: [CHILD, AGENCY],
    ...artifactOpts,
  });
  assert(
    "21.b a failed final check leaves no artifact frame in the transcript",
    artifactFrames(artifactAtGate.responseText).length === 0,
    artifactFrames(artifactAtGate.responseText).join("").slice(0, 300),
  );
  assert(
    "21.b ...and the artifact TITLE appears nowhere in the transcript",
    !artifactAtGate.responseText.includes("CHILD-PRIVATE-MARKER"),
    artifactAtGate.responseText.slice(0, 300),
  );
  assert(
    "21.b ...and no non-neutral frame survives",
    nonNeutralFrames(artifactAtGate.responseText).length === 0,
    JSON.stringify(nonNeutralFrames(artifactAtGate.responseText)).slice(0, 300),
  );

  // 21.c — THE `rag_documents` SOURCE, which had NO COVERAGE AT ALL. `match_rag_documents` was
  // never configured in the fake, so `ragContext` was empty in all 186 assertions of the
  // previous revision and deleting it from the latch left the suite green. The latch named it as
  // "enumerated rather than assumed"; until this case existed it was assumed.
  const ragClean = await drive({
    personaTenant: CHILD, personaSequence: [CHILD], memberships: [CHILD],
    kbRejects: true, ragHits: true, provider: ["private-text"],
  });
  assert(
    "21.c CONTROL — a platform-knowledge turn still delivers its reply",
    ragClean.responseText.includes("CHILD-PRIVATE-MARKER"),
    ragClean.responseText.slice(0, 200),
  );
  assert(
    "21.c CONTROL — tenant Knowledge was refused, so ONLY rag_documents protects it",
    !ragClean.telemetry && !!ragClean.logged.find((l) => /KB_FORBIDDEN|REFUSED/.test(l.msg)),
    JSON.stringify({ tel: !!ragClean.telemetry }),
  );
  const ragTotal = personaCallsOf(ragClean);
  assert(
    "21.c CONTROL — the turn is actually gated (the guard asks the resolver)",
    ragTotal >= 2,
    `persona calls: ${ragTotal}`,
  );
  const ragAtGate = await drive({
    personaTenant: CHILD,
    personaSequence: Array(Math.max(ragTotal - 1, 1)).fill(CHILD).concat([AGENCY]),
    memberships: [CHILD, AGENCY],
    kbRejects: true, ragHits: true, provider: ["private-text"],
  });
  assert(
    "21.c a failed final check withholds a reply grounded in platform knowledge",
    !ragAtGate.responseText.includes("CHILD-PRIVATE-MARKER"),
    ragAtGate.responseText.slice(0, 300),
  );
  assert(
    "21.c ...and no non-neutral frame survives",
    nonNeutralFrames(ragAtGate.responseText).length === 0,
    JSON.stringify(nonNeutralFrames(ragAtGate.responseText)).slice(0, 300),
  );

  // 21.d — A SHAPELESS RESOLVER ROW IS NOT A RESOLUTION. The suite only ever drove the resolver
  // to an ERROR. A row that comes back present but carrying no `tenant_id` reads as a null
  // tenant, and for the platform operator — whose turn scope is legitimately null — that
  // compared equal and released the protected reply. Same class as the errored lookup, a
  // different failure shape, and it needs its own case because the operator is the only tier
  // where the two are distinguishable.
  const emptyRow = { data: [{}], error: null };
  const docFixture = {
    fileName: "notes.docx",
    mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    kind: "docx",
    textContent: "Internal operating notes",
  };
  const operatorDegenerate = await drive({
    personaTenant: null,
    personaSequence: [null, emptyRow],
    memberships: [],
    bodyExtras: { document: docFixture }, provider: ["private-text", "private-text"],
  });
  assert(
    "21.d a resolver row with no tenant_id is not a match — the operator's reply is withheld",
    !operatorDegenerate.responseText.includes("CHILD-PRIVATE-MARKER"),
    operatorDegenerate.responseText.slice(0, 300),
  );
  assert(
    "21.d ...and no non-neutral frame survives",
    nonNeutralFrames(operatorDegenerate.responseText).length === 0,
    JSON.stringify(nonNeutralFrames(operatorDegenerate.responseText)).slice(0, 300),
  );

  // 21.e — THE CONFIRM CARD. `describeConfirm` interpolates the model's own arguments into a
  // sentence describing what Paige proposes to do, and it went straight to the wire. A turn
  // whose answer was correctly withheld still showed the user that proposal, written out of the
  // previous workspace's evidence and naming what it found there.
  const confirmFrames = (text) => text.split("\n").filter((l) => l.startsWith("data: ") && l.includes("paige_confirm"));
  const confirmOpts = {
    chunkContent: "PRIVATE-KB-SOURCE-MARKER",
    provider: ["confirm-card", "private-text"],
    // The DEFAULT lane. `auto` would run the tool and produce an artifact instead of a card.
    rpcExtras: { get_actor_access: { data: { tier: "tenant" }, error: null } },
    tableExtras: { user_roles: () => [{ role: "admin" }] },
  };
  const confirmClean = await drive({
    personaTenant: CHILD, personaSequence: [CHILD], memberships: [CHILD], ...confirmOpts,
  });
  assert(
    "21.e CONTROL — the shape really does emit a confirm card when the turn completes",
    confirmFrames(confirmClean.responseText).length > 0,
    confirmClean.responseText.slice(0, 400),
  );
  assert(
    "21.e CONTROL — and that card carries the model's own words",
    confirmFrames(confirmClean.responseText).join("").includes("CHILD-PRIVATE-MARKER"),
    confirmFrames(confirmClean.responseText).join("").slice(0, 300),
  );
  const confirmTotal = personaCallsOf(confirmClean);
  const confirmAtGate = await drive({
    personaTenant: CHILD,
    personaSequence: Array(confirmTotal - 1).fill(CHILD).concat([AGENCY]),
    memberships: [CHILD, AGENCY],
    ...confirmOpts,
  });
  assert(
    "21.e a failed final check leaves no confirm card in the transcript",
    confirmFrames(confirmAtGate.responseText).length === 0,
    confirmFrames(confirmAtGate.responseText).join("").slice(0, 300),
  );
  assert(
    "21.e ...and no non-neutral frame survives",
    nonNeutralFrames(confirmAtGate.responseText).length === 0,
    JSON.stringify(nonNeutralFrames(confirmAtGate.responseText)).slice(0, 300),
  );

  // 21.f — THE CHOICE CHIPS, which are the whole assistant turn. `ask_choices` sets
  // `finalChunks = []` and breaks, so the chips frame is the entire answer. Streaming it live
  // meant a protected turn published that answer, then discarded an empty buffer at the final
  // check and printed a refusal underneath an answer already on screen — the worst version of
  // this defect, because the refusal makes it look handled.
  const choiceFrames = (text) => text.split("\n").filter((l) => l.startsWith("data: ") && l.includes("paige_choices"));
  const STUDIO_THREAD = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
  const choiceOpts = {
    chunkContent: "PRIVATE-KB-SOURCE-MARKER",
    provider: ["ask-choices"],
    bodyExtras: { threadId: STUDIO_THREAD },
    // `ask_choices` is Studio-gated, and studioSessionId is read off the thread row.
    tableExtras: { paige_chat_threads: () => [{ summary: null, studio_session_id: "studio-sess-1" }] },
  };
  const choiceClean = await drive({
    personaTenant: CHILD, personaSequence: [CHILD], memberships: [CHILD], ...choiceOpts,
  });
  assert(
    "21.f CONTROL — the Studio shape really does emit a choices frame",
    choiceFrames(choiceClean.responseText).length > 0,
    choiceClean.responseText.slice(0, 400),
  );
  assert(
    "21.f CONTROL — and the chips prompt is the model's own words",
    choiceFrames(choiceClean.responseText).join("").includes("CHILD-PRIVATE-MARKER"),
    choiceFrames(choiceClean.responseText).join("").slice(0, 300),
  );
  const choiceTotal = personaCallsOf(choiceClean);
  const choiceAtGate = await drive({
    personaTenant: CHILD,
    personaSequence: Array(choiceTotal - 1).fill(CHILD).concat([AGENCY]),
    memberships: [CHILD, AGENCY],
    ...choiceOpts,
  });
  assert(
    "21.f a failed final check leaves no choices frame in the transcript",
    choiceFrames(choiceAtGate.responseText).length === 0,
    choiceFrames(choiceAtGate.responseText).join("").slice(0, 300),
  );
  assert(
    "21.f ...and no non-neutral frame survives",
    nonNeutralFrames(choiceAtGate.responseText).length === 0,
    JSON.stringify(nonNeutralFrames(choiceAtGate.responseText)).slice(0, 300),
  );

  // 21.g — THE SYNC RESULT ON THE CREDIT-REPORT PATH. `sync_status` carries the three bureau
  // scores read out of the uploaded PDF, plus the item counts. It was emitted with a direct
  // enqueue and never entered `directFrames`, so it bypassed the document path's hold entirely:
  // a turn whose analysis was withheld still put the numbers from that analysis on screen.
  const syncFrames = (text) => text.split("\n").filter((l) => l.startsWith("data: ") && l.includes("sync_status"));
  const pdfFixture = { fileName: "report.pdf", mimeType: "application/pdf", kind: "pdf", base64: "AA==" };
  const syncOpts = {
    chunkContent: "PRIVATE-KB-SOURCE-MARKER",
    bodyExtras: { document: pdfFixture },
    provider: ["read-check", "private-text", "json-extraction"],
  };
  const syncClean = await drive({
    personaTenant: CHILD, personaSequence: [CHILD], memberships: [CHILD], ...syncOpts,
  });
  assert(
    "21.g CONTROL — a credit-report turn really does emit a sync_status frame",
    syncFrames(syncClean.responseText).length > 0,
    syncClean.responseText.slice(-400),
  );
  assert(
    "21.g CONTROL — and that frame carries the scores read out of the document",
    /"scores_synced"/.test(syncFrames(syncClean.responseText).join("")),
    syncFrames(syncClean.responseText).join("").slice(0, 300),
  );
  const syncTotal = personaCallsOf(syncClean);
  const syncAtGate = await drive({
    personaTenant: CHILD,
    personaSequence: Array(syncTotal - 1).fill(CHILD).concat([AGENCY]),
    memberships: [CHILD, AGENCY],
    ...syncOpts,
  });
  assert(
    "21.g a failed final check leaves no sync_status frame in the transcript",
    syncFrames(syncAtGate.responseText).length === 0,
    syncFrames(syncAtGate.responseText).join("").slice(0, 300),
  );
  assert(
    "21.g ...and no non-neutral frame survives",
    nonNeutralFrames(syncAtGate.responseText).length === 0,
    JSON.stringify(nonNeutralFrames(syncAtGate.responseText)).slice(0, 300),
  );

  // 21.h — THE STUDIO CANVAS ARTIFACT. `studioLinked` is the Studio twin of `chatArtifacts` and
  // is emitted from its own line one above it; the two are mutually exclusive, so 21.b can never
  // reach this one. Without this case, reverting the Studio line alone left the whole suite
  // green — a guard on an adjacent line is not a guard on this one.
  const studioOpts = {
    chunkContent: "PRIVATE-KB-SOURCE-MARKER",
    provider: ["doc-artifact", "private-text"],
    bodyExtras: { threadId: STUDIO_THREAD },
    rpcExtras: {
      get_actor_access: { data: { tier: "tenant" }, error: null },
      save_marketing_content: { data: "content-studio", error: null },
    },
    tableExtras: {
      user_roles: () => [{ role: "admin" }],
      paige_chat_threads: () => [{ summary: null, studio_session_id: "studio-sess-1" }],
    },
  };
  const studioClean = await drive({
    personaTenant: CHILD, personaSequence: [CHILD], memberships: [CHILD], ...studioOpts,
  });
  assert(
    "21.h CONTROL — a Studio turn really does emit a canvas artifact frame",
    artifactFrames(studioClean.responseText).length > 0,
    studioClean.responseText.slice(0, 500),
  );
  assert(
    "21.h CONTROL — and that frame carries the model-authored title",
    artifactFrames(studioClean.responseText).join("").includes("CHILD-PRIVATE-MARKER"),
    artifactFrames(studioClean.responseText).join("").slice(0, 300),
  );
  const studioTotal = personaCallsOf(studioClean);
  const studioAtGate = await drive({
    personaTenant: CHILD,
    personaSequence: Array(studioTotal - 1).fill(CHILD).concat([AGENCY]),
    memberships: [CHILD, AGENCY],
    ...studioOpts,
  });
  assert(
    "21.h a failed final check leaves no canvas artifact frame in the transcript",
    artifactFrames(studioAtGate.responseText).length === 0,
    artifactFrames(studioAtGate.responseText).join("").slice(0, 300),
  );
  assert(
    "21.h ...and no non-neutral frame survives",
    nonNeutralFrames(studioAtGate.responseText).length === 0,
    JSON.stringify(nonNeutralFrames(studioAtGate.responseText)).slice(0, 300),
  );

  // 21.i — AN ACTION STEP'S LABEL IS NOT AUTOMATICALLY NEUTRAL. The whole justification for
  // streaming action steps live while a protected answer is checked is that their label comes
  // from a closed vocabulary and their detail is a count. `describeStep`'s `action_file` case
  // title-cased `args.to_department` — a model-authored string — straight into the label, so the
  // one sanctioned live channel was carrying model text on a protected turn. This case is what
  // makes the "fixed vocabulary" sentence a checked property rather than an intention.
  const stepFrames = (text) => text.split("\n").filter((l) => l.startsWith("data: ") && l.includes("paige_step"));
  const actionFileOpts = {
    chunkContent: "PRIVATE-KB-SOURCE-MARKER",
    provider: ["action-file", "private-text"],
    rpcExtras: {
      get_actor_access: { data: { tier: "tenant" }, error: null },
      resolve_tool_autonomy: { data: "auto", error: null },
    },
    tableExtras: { user_roles: () => [{ role: "admin" }] },
  };
  const actionFile = await drive({
    personaTenant: CHILD, personaSequence: [CHILD], memberships: [CHILD], ...actionFileOpts,
  });
  assert(
    "21.i CONTROL — the shape really does emit an action step for the filed action",
    stepFrames(actionFile.responseText).some((l) => /"kind":"action"/.test(l)),
    actionFile.responseText.slice(0, 400),
  );
  assert(
    "21.i a live action step never carries the model's own words in its label",
    // NOT one of the PROTECTED_MARKERS: `describeStep` splits the department on [_-] before
    // title-casing it, so a hyphenated marker is shredded and the assertion would pass against
    // the unfixed code. A single unbroken token is what actually survives that transform.
    !stepFrames(actionFile.responseText).join("").includes("LEAKEDMODELWORD"),
    stepFrames(actionFile.responseText).join("").slice(0, 300),
  );

  // 21.j — A LATE TOOL RETRIEVAL SWITCHES THE TURN, which the ruling requires in those words and
  // which nothing was checking. This turn starts with NO protected evidence at all — Knowledge
  // refused, no document, no session docs, non-funding tenant — so at entry it is an ordinary
  // live-streaming turn. Then it runs a READ tool, whose result enters the model's context and
  // grounds the closing reply. If that does not flip the turn onto the buffered path, the answer
  // streams live and the guard never asks the resolver.
  //
  // The `tool` fixture, NOT `two-tools`, and the difference is load-bearing. `two-tools` narrates,
  // and on a late-retrieval turn round one's thought line is emitted BEFORE that round's tools
  // run — so it streams live. That is correct: round one's narration is written from the entry
  // prompt, which by definition carries no protected evidence on a turn that only becomes
  // protected later. But it means the reply marker and the narration marker are the same string,
  // and "the marker is absent" would stop meaning "the reply was withheld". A silent fixture
  // leaves the reply as the only source of it.
  const lateOpts = {
    kbRejects: true,
    provider: ["tool", "private-text"],
    rpcExtras: { get_actor_access: { data: { tier: "tenant" }, error: null } },
  };
  const lateClean = await drive({
    personaTenant: CHILD, personaSequence: [CHILD], memberships: [CHILD], ...lateOpts,
  });
  assert(
    "21.j CONTROL — a tool-only turn still delivers its reply",
    lateClean.responseText.includes("CHILD-PRIVATE-MARKER"),
    lateClean.responseText.slice(0, 250),
  );
  assert(
    "21.j CONTROL — and it carried NO protected evidence at entry (Knowledge was refused)",
    !lateClean.telemetry && !!lateClean.logged.find((l) => /KB_FORBIDDEN|REFUSED/.test(l.msg)),
    JSON.stringify({ tel: !!lateClean.telemetry }),
  );
  const lateTotal = personaCallsOf(lateClean);
  assert(
    "21.j the late tool retrieval switched the turn onto the guarded path (>1 persona call)",
    lateTotal > 1,
    `persona calls: ${lateTotal} — 1 means the guard short-circuited, i.e. the switch never happened`,
  );
  const lateAtGate = await drive({
    personaTenant: CHILD,
    personaSequence: Array(lateTotal - 1).fill(CHILD).concat([AGENCY]),
    memberships: [CHILD, AGENCY],
    ...lateOpts,
  });
  assert(
    "21.j ...so a failed final check withholds the reply it grounded",
    !lateAtGate.responseText.includes("CHILD-PRIVATE-MARKER"),
    lateAtGate.responseText.slice(0, 300),
  );
  assert(
    "21.j ...and no non-neutral frame survives",
    nonNeutralFrames(lateAtGate.responseText).length === 0,
    JSON.stringify(nonNeutralFrames(lateAtGate.responseText)).slice(0, 300),
  );

  // 21.k — THE SENTINEL MUST NOT OVERTAKE THE BUFFER IT TERMINATES. On the couldn't-finish
  // branch the fallback text goes through `emitContent` and was therefore held, while `[DONE]`
  // went straight to the wire — so on a protected turn the sentinel arrived FIRST and the
  // released reply landed behind it. Four of the seven SSE consumers `break` on `[DONE]`, so
  // they dropped the reply, while it was still persisted to the thread: the transcript and the
  // wire disagreeing, which is the property this whole rule exists to establish.
  const wireOrder = (text) => {
    const lines = text.split("\n").filter((l) => l.startsWith("data: "));
    return {
      done: lines.findIndex((l) => l.slice(6).trim() === "[DONE]"),
      content: lines.findIndex((l) => /couldn't finish that/.test(l)),
    };
  };
  // "fail" twice drives the loop to forced termination AND makes the closing call fail, which is
  // the only route to the fallback branch.
  const fallbackOpts = { chunkContent: "PRIVATE-KB-SOURCE-MARKER", provider: ["two-tools", "fail", "fail"] };
  const fallback = await drive({
    personaTenant: CHILD, personaSequence: [CHILD], memberships: [CHILD], ...fallbackOpts,
  });
  const fbOrder = wireOrder(fallback.responseText);
  assert(
    "21.k CONTROL — the fixture really does reach the couldn't-finish fallback",
    fbOrder.content !== -1,
    fallback.responseText.slice(-300),
  );
  assert(
    "21.k on a protected turn the released reply reaches the wire BEFORE [DONE]",
    fbOrder.done === -1 || fbOrder.content < fbOrder.done,
    `content at ${fbOrder.content}, [DONE] at ${fbOrder.done}`,
  );

  // 21.l — `client_memory`, and it is the strongest of the sources the enumerations missed
  // because it is DURABLE ACROSS SESSIONS. The `report_upload` row persists the very extraction
  // this handler buffers `sync_status` for — the bureau scores and item counts read out of the
  // uploaded PDF — and it is interpolated into the prompt of every later turn. Buffering the
  // frame while streaming the persisted extraction of it on every turn afterwards is not a rule,
  // it is a coincidence of which surface happened to be audited.
  const memoryOpts = {
    kbRejects: true,
    provider: ["private-text"],
    tableExtras: {
      client_memory: () => [{
        memory_type: "report_upload",
        content: "Credit report analyzed (consumer). Scores: EQ 712, EX 705, TU 698. PRIVATE-MEMORY-MARKER",
        created_at: new Date().toISOString(),
      }],
    },
  };
  const memClean = await drive({
    personaTenant: CHILD, personaSequence: [CHILD], memberships: [CHILD], ...memoryOpts,
  });
  assert(
    "21.l CONTROL — a memory-bearing turn still delivers its reply",
    memClean.responseText.includes("CHILD-PRIVATE-MARKER"),
    memClean.responseText.slice(0, 250),
  );
  assert(
    "21.l CONTROL — the memory really did reach the model's prompt",
    memClean.providerCalls.some((c) => JSON.stringify(c).includes("PRIVATE-MEMORY-MARKER")),
    JSON.stringify(memClean.providerCalls).slice(0, 200),
  );
  const memTotal = personaCallsOf(memClean);
  assert(
    "21.l CONTROL — and the turn is treated as protected (the guard asks the resolver)",
    memTotal >= 2,
    `persona calls: ${memTotal}`,
  );
  const memAtGate = await drive({
    personaTenant: CHILD,
    personaSequence: Array(Math.max(memTotal - 1, 1)).fill(CHILD).concat([AGENCY]),
    memberships: [CHILD, AGENCY],
    ...memoryOpts,
  });
  assert(
    "21.l a failed final check withholds a reply grounded in persisted memory",
    !memAtGate.responseText.includes("CHILD-PRIVATE-MARKER"),
    memAtGate.responseText.slice(0, 300),
  );

  // 21.m — THE FUNDING TENANT'S CLIENT FILE. Under `fundingEnabled`, `buildUserContext` reads the
  // uploaded PDF's file name, the three bureau scores and every active negative item with
  // creditor and amount, and puts them in the prompt. That made EVERY ordinary chat turn on a
  // funding tenant document-derived and unbuffered. The gate matters in both directions, so the
  // NON-funding control below proves the fix did not simply buffer the whole platform.
  const fundingRows = {
    credit_report_uploads: () => [{ id: "u1", file_name: "PRIVATE-PDF-MARKER.pdf", analysis_status: "completed", created_at: "2026-01-01T00:00:00Z", last_analyzed_at: "2026-01-01T00:00:00Z", bureau_detected: "experian", error_message: null }],
    profiles: () => [{ active_tenant_id: CHILD, full_name: "Test", estimated_fico_ex: 705, estimated_fico_eq: 712, estimated_fico_tu: 698 }],
  };
  const fundingOpts = { kbRejects: true, provider: ["private-text"], fundingEnabled: true, tableExtras: fundingRows };
  const fundClean = await drive({
    personaTenant: CHILD, personaSequence: [CHILD], memberships: [CHILD], ...fundingOpts,
  });
  assert(
    "21.m CONTROL — the uploaded PDF's name really did reach the funding tenant's prompt",
    fundClean.providerCalls.some((c) => JSON.stringify(c).includes("PRIVATE-PDF-MARKER")),
    JSON.stringify(fundClean.providerCalls).slice(0, 200),
  );
  const fundTotal = personaCallsOf(fundClean);
  assert(
    "21.m CONTROL — and that turn is treated as protected",
    fundTotal >= 2,
    `persona calls: ${fundTotal}`,
  );
  const fundAtGate = await drive({
    personaTenant: CHILD,
    personaSequence: Array(Math.max(fundTotal - 1, 1)).fill(CHILD).concat([AGENCY]),
    memberships: [CHILD, AGENCY],
    ...fundingOpts,
  });
  assert(
    "21.m a failed final check withholds the funding tenant's reply",
    !fundAtGate.responseText.includes("CHILD-PRIVATE-MARKER"),
    fundAtGate.responseText.slice(0, 300),
  );
  // THE OTHER DIRECTION. A non-funding tenant's client file carries profile, subscription, tasks
  // and document-TYPE counts — tenant data, but not document-derived evidence — so it must NOT
  // latch. Without this, "latch on userContext unconditionally" would pass 21.m and quietly
  // buffer every turn on the platform.
  const nonFunding = await drive({
    personaTenant: CHILD, personaSequence: [CHILD], memberships: [CHILD],
    kbRejects: true, provider: ["private-text"], tableExtras: fundingRows,
  });
  assert(
    "21.m a NON-funding tenant's client file does not latch — ordinary chat still streams",
    personaCallsOf(nonFunding) === 1,
    `persona calls: ${personaCallsOf(nonFunding)}`,
  );

  // 21.n — THE APPROVAL CARD. `approval_queued[].summary` is the model's own argument describing
  // what it proposes to do, written from the Knowledge-bearing prompt. The commit that moved it
  // behind the close decision also claimed every moved frame was mutation-proven individually;
  // reverting THIS one left the suite green, because no fixture produced an approval. That is the
  // seventh check on this branch to have passed for a reason other than the one it named, and it
  // is the reason this case exists.
  const approvalFrames = (text) => text.split("\n").filter((l) => l.startsWith("data: ") && l.includes("approval_queued"));
  const approvalOpts = {
    chunkContent: "PRIVATE-KB-SOURCE-MARKER",
    provider: ["propose-action", "private-text"],
    rpcExtras: {
      get_actor_access: { data: { tier: "tenant" }, error: null },
      resolve_tool_autonomy: { data: "auto", error: null },
    },
    tableExtras: {
      user_roles: () => [{ role: "admin" }],
      // The insert's `.select("id").single()` reads back through the scenario table, so without
      // this the queue insert returns no id and the tool bails before pushing the approval.
      paige_pending_approvals: () => [{ id: "22222222-2222-4222-8222-222222222222" }],
    },
  };
  const approvalClean = await drive({
    personaTenant: CHILD, personaSequence: [CHILD], memberships: [CHILD], ...approvalOpts,
  });
  assert(
    "21.n CONTROL — the shape really does emit an approval frame when the turn completes",
    approvalFrames(approvalClean.responseText).length > 0,
    approvalClean.responseText.slice(0, 500),
  );
  assert(
    "21.n CONTROL — and that frame carries the model's own summary",
    approvalFrames(approvalClean.responseText).join("").includes("CHILD-PRIVATE-MARKER"),
    approvalFrames(approvalClean.responseText).join("").slice(0, 300),
  );
  const approvalTotal = personaCallsOf(approvalClean);
  const approvalAtGate = await drive({
    personaTenant: CHILD,
    personaSequence: Array(approvalTotal - 1).fill(CHILD).concat([AGENCY]),
    memberships: [CHILD, AGENCY],
    ...approvalOpts,
  });
  assert(
    "21.n a failed final check leaves no approval frame in the transcript",
    approvalFrames(approvalAtGate.responseText).length === 0,
    approvalFrames(approvalAtGate.responseText).join("").slice(0, 300),
  );
  assert(
    "21.n ...and no non-neutral frame survives",
    nonNeutralFrames(approvalAtGate.responseText).length === 0,
    JSON.stringify(nonNeutralFrames(approvalAtGate.responseText)).slice(0, 300),
  );

  // 21.o — A ROW *AND* AN ERROR. The `!error` half of the resolver predicate was never load-
  // bearing: every scenario drove the error case as `{ data: null, error }`, where `!!row` is
  // already false. Supabase can return a row alongside an error on a partial result, and that
  // shape sailed through — `20.unresolved` passed on the strength of `!!row` alone while
  // crediting `!error` in its comment.
  const rowAndError = { data: [{ tenant_id: CHILD }], error: { message: "partial result", code: "57014" } };
  const partial = await drive({
    personaTenant: CHILD,
    personaSequence: [CHILD, rowAndError],
    memberships: [CHILD],
    chunkContent: "PRIVATE-KB-SOURCE-MARKER", provider: ["private-text"],
  });
  assert(
    "21.o a resolver that returns a row AND an error is not a resolution",
    !partial.responseText.includes("CHILD-PRIVATE-MARKER"),
    partial.responseText.slice(0, 300),
  );

  // 21.p — STUDIO REFERENCE IMAGES. An image dropped into the Studio chat is fetched and
  // base64-inlined into the last user message. The SAME image arriving as `document` is
  // protected; arriving as `attachments` it was not — the §58 asymmetry this rule already
  // removed once, reproduced on the adjacent path.
  const attachOpts = {
    kbRejects: true,
    provider: ["private-text"],
    bodyExtras: {
      attachments: [{ url: "https://example.test/ref.png", name: "ref.png", mimeType: "image/png", kind: "image" }],
    },
  };
  const attachClean = await drive({
    personaTenant: CHILD, personaSequence: [CHILD], memberships: [CHILD], ...attachOpts,
  });
  const attachTotal = personaCallsOf(attachClean);
  assert(
    "21.p CONTROL — an attachment-bearing turn is treated as protected",
    attachTotal >= 2,
    `persona calls: ${attachTotal}`,
  );
  const attachAtGate = await drive({
    personaTenant: CHILD,
    personaSequence: Array(Math.max(attachTotal - 1, 1)).fill(CHILD).concat([AGENCY]),
    memberships: [CHILD, AGENCY],
    ...attachOpts,
  });
  assert(
    "21.p a failed final check withholds the reply on an attachment turn",
    !attachAtGate.responseText.includes("CHILD-PRIVATE-MARKER"),
    attachAtGate.responseText.slice(0, 300),
  );

  // 21.q — A FAILING SYNC. 21.g drives only a CLEAN sync, so the failure-shaped `sync_status` —
  // an error from a pipeline that was mid-way through reading the customer's credit report, which
  // the ruling names as a "hidden error" that must not surface while a protected answer is being
  // checked — had no case of its own.
  //
  // §13 — WHAT THIS DOES NOT COVER, because the first version of this comment claimed it did.
  // The transport throw is caught by `runStructuredExtractionAndSync`'s own catch-all, which
  // RETURNS `{ success: false, step: "pipeline" }` rather than rethrowing. So this drives the
  // SUCCESS emit line carrying a failure result, not the caller's `catch` block. That block
  // appears unreachable: every throw inside the helper is already caught there, and reverting
  // its frame to a direct enqueue leaves this suite green. It is routed through the buffer
  // anyway so the shape is right if it ever becomes reachable — but nothing here proves it, and
  // saying otherwise would be the same over-claim as calling the `extraction_proposal` routing
  // tested.
  const syncThrowOpts = {
    chunkContent: "PRIVATE-KB-SOURCE-MARKER",
    bodyExtras: { document: pdfFixture },
    provider: ["read-check", "private-text", "json-extraction"],
    throwOnSync: true,
  };
  const throwClean = await drive({
    personaTenant: CHILD, personaSequence: [CHILD], memberships: [CHILD], ...syncThrowOpts,
  });
  assert(
    "21.q CONTROL — a failing sync really does emit a failure-shaped sync_status frame",
    syncFrames(throwClean.responseText).some((l) => /"success":false/.test(l)),
    syncFrames(throwClean.responseText).join("").slice(0, 300) || throwClean.responseText.slice(-300),
  );
  const throwTotal = personaCallsOf(throwClean);
  const throwAtGate = await drive({
    personaTenant: CHILD,
    personaSequence: Array(throwTotal - 1).fill(CHILD).concat([AGENCY]),
    memberships: [CHILD, AGENCY],
    ...syncThrowOpts,
  });
  assert(
    "21.q a failed final check leaves no failing sync_status in the transcript",
    syncFrames(throwAtGate.responseText).length === 0,
    syncFrames(throwAtGate.responseText).join("").slice(0, 300),
  );

  // 21.r — A TOOL CAN BE A WRITE AND A GENERATOR AT ONCE, and the receipt set has to know the
  // difference. The late-retrieval seam originally borrowed `MUTATING_TOOLS`, which answers "does
  // this write, so must the autonomy gate govern it?" — NOT "is this result free of evidence?"
  // `draft_marketing_content` is in that set and returns copy generated from the tenant's name
  // and brand voice, so an otherwise-ordinary turn calling it stayed unprotected and its reply
  // streamed in whatever workspace was active by the end.
  const draftOpts = {
    kbRejects: true,
    provider: ["draft-content", "private-text"],
    rpcExtras: {
      get_actor_access: { data: { tier: "tenant" }, error: null },
      resolve_tool_autonomy: { data: "auto", error: null },
    },
    tableExtras: { user_roles: () => [{ role: "admin" }] },
  };
  const draftClean = await drive({
    personaTenant: CHILD, personaSequence: [CHILD], memberships: [CHILD], ...draftOpts,
  });
  assert(
    "21.r CONTROL — a content-generating write tool turn still delivers its reply",
    draftClean.responseText.includes("CHILD-PRIVATE-MARKER"),
    draftClean.responseText.slice(0, 250),
  );
  assert(
    "21.r CONTROL — and it carried no protected evidence at entry (Knowledge was refused)",
    !draftClean.telemetry && !!draftClean.logged.find((l) => /KB_FORBIDDEN|REFUSED/.test(l.msg)),
    JSON.stringify({ tel: !!draftClean.telemetry }),
  );
  const draftTotal = personaCallsOf(draftClean);
  assert(
    "21.r a content generator is not a receipt — it switches the turn onto the guarded path",
    draftTotal > 1,
    `persona calls: ${draftTotal} — 1 means it was classified as a write receipt`,
  );
  const draftAtGate = await drive({
    personaTenant: CHILD,
    personaSequence: Array(draftTotal - 1).fill(CHILD).concat([AGENCY]),
    memberships: [CHILD, AGENCY],
    ...draftOpts,
  });
  assert(
    "21.r ...so a failed final check withholds the reply it grounded",
    !draftAtGate.responseText.includes("CHILD-PRIVATE-MARKER"),
    draftAtGate.responseText.slice(0, 300),
  );
}

console.log(`\n${checks - failures} passed, ${failures} failed`);
process.exit(failures === 0 ? 0 : 1);
