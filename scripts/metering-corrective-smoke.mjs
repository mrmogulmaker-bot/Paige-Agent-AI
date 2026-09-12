// §32 headless runtime proof for the PR #572 corrective pass (owner ruling 2026-08-24).
//
// It covers the two findings whose fix lives in TypeScript, and it drives the REAL shipped modules
// rather than re-embedding their logic: only the esm.sh URL import is stubbed (loader hook), plus a
// canned `fetch` standing in for Anthropic and a `Deno` shim for env. Everything the assertions
// actually exercise — normalizeClaudeUsage, the buffered gatewayCompat trace construction, the
// METADATA_ALLOWLIST, and the scope stamping inside traceLLMCall — is the genuine code.
//
//   FINDING 4  cache-token forwarding on the currently-owned Anthropic paths.
//   FINDING 3  declared platform scope reaching the field the meter trigger evaluates, and NOT
//              being reachable through ordinary caller metadata.
//
// Run: node --experimental-strip-types \
//        --import ./scripts/_register-metering-stub.mjs \
//        scripts/metering-corrective-smoke.mjs
//
// HONEST SCOPE (§13): this proves the EDGE-FUNCTION half. The database half — cost precedence,
// provenance, and the trigger's scope classification — is SQL, asserted in
// supabase/tests/llm_metering_bridge.sql, and is NOT run here.

// ── env + runtime shims, before any import of the modules under test ────────────────────────────
const ENV = {
  ANTHROPIC_API_KEY: "test-key-not-a-real-secret",
  SUPABASE_URL: "https://stub.invalid",
  SUPABASE_SERVICE_ROLE_KEY: "stub-service-role-not-a-real-secret",
};
globalThis.Deno = { env: { get: (k) => ENV[k] } };

let fails = 0;
const check = (name, cond, extra = "") => {
  const ok = !!cond;
  if (!ok) fails++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? "  — " + extra : ""}`);
};
const inserts = () => (globalThis.__TRACE_INSERTS__ ||= []);
const lastRecord = () => inserts()[inserts().length - 1]?.record;
const settle = () => new Promise((r) => setTimeout(r, 20)); // let the detached write() run

const { gatewayCompat, normalizeClaudeUsage } = await import("../supabase/functions/_shared/claude.ts");
const { traceLLMCall } = await import("../supabase/functions/_shared/llm-trace.ts");

// ── canned Anthropic response ───────────────────────────────────────────────────────────────────
function anthropicReply(usage) {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      id: "msg_stub_01",
      model: "claude-sonnet-5",
      stop_reason: "end_turn",
      content: [{ type: "text", text: "ok" }],
      usage,
    }),
    text: async () => "",
  };
}
let nextUsage = null;
globalThis.fetch = async () => anthropicReply(nextUsage);

const callBuffered = async (usage) => {
  nextUsage = usage;
  inserts().length = 0;
  await gatewayCompat("anthropic", {
    body: JSON.stringify({ model: "claude-sonnet-5", messages: [{ role: "user", content: "hi" }] }),
  });
  await settle();
  return lastRecord();
};

console.log("\n── FINDING 4: cache classes survive the buffered gateway path ──────────────────");

// The full split: Anthropic reports cache reads AND a per-TTL write breakdown.
let rec = await callBuffered({
  input_tokens: 1000,
  output_tokens: 200,
  cache_read_input_tokens: 5000,
  cache_creation: { ephemeral_5m_input_tokens: 300, ephemeral_1h_input_tokens: 700 },
});
check("a trace row was written at all", !!rec);
check("cache-read input tokens persist", rec?.tokens_cache_read === 5000, `got ${rec?.tokens_cache_read}`);
check("5-minute cache-creation tokens persist", rec?.tokens_cache_write_5m === 300, `got ${rec?.tokens_cache_write_5m}`);
check("1-hour cache-creation tokens persist", rec?.tokens_cache_write_1h === 700, `got ${rec?.tokens_cache_write_1h}`);
check("ordinary input tokens persist", rec?.tokens_in === 1000, `got ${rec?.tokens_in}`);
check("ordinary output tokens persist", rec?.tokens_out === 200, `got ${rec?.tokens_out}`);
// No double-counting: uncached input mirrors input_tokens, and the cache classes are NOT folded in.
check(
  "no double-counting — tokens_in_uncached mirrors input, cache classes stay separate",
  rec?.tokens_in_uncached === 1000 && rec?.tokens_in === 1000,
  `in_uncached=${rec?.tokens_in_uncached} in=${rec?.tokens_in}`,
);
check("identity set so the versioned registry can price the row", rec?.model_provider === "anthropic", `got ${rec?.model_provider}`);

// Unsplit write total: Anthropic reports only cache_creation_input_tokens, no per-TTL breakdown.
rec = await callBuffered({
  input_tokens: 10,
  output_tokens: 5,
  cache_read_input_tokens: 0,
  cache_creation_input_tokens: 900,
});
check("unsplit write total is attributed to the 5-minute bucket", rec?.tokens_cache_write_5m === 900, `got ${rec?.tokens_cache_write_5m}`);
check("1-hour stays NULL when no split was reported", rec?.tokens_cache_write_1h === null, `got ${rec?.tokens_cache_write_1h}`);
check("a REPORTED zero stays 0, not NULL", rec?.tokens_cache_read === 0, `got ${rec?.tokens_cache_read}`);

// Absent entirely: NULL means "not reported" and must never become a manufactured 0.
rec = await callBuffered({ input_tokens: 10, output_tokens: 5 });
check("absent cache-read stays NULL, never 0", rec?.tokens_cache_read === null, `got ${rec?.tokens_cache_read}`);
check("absent cache-write stays NULL, never 0", rec?.tokens_cache_write_5m === null, `got ${rec?.tokens_cache_write_5m}`);

// The shared normalizer is the one home — assert it directly too, so a regression that bypasses it
// on some future path still fails a test here.
const n = normalizeClaudeUsage({ input_tokens: 1, output_tokens: 2, cache_read_input_tokens: 3 });
check("normalizeClaudeUsage is the shared seam and behaves", n.tokens_cache_read === 3 && n.tokens_in === 1 && n.tokens_out === 2);

console.log("\n── FINDING 3: declared platform scope, and who may declare it ──────────────────");

const traceAndGet = async (row) => {
  inserts().length = 0;
  traceLLMCall(row);
  await settle();
  return lastRecord();
};

// (a) A validated top-level declaration reaches the field the trigger reads.
rec = await traceAndGet({ provider: "anthropic", status: "success", scope: "platform" });
check("top-level scope:'platform' reaches metadata.scope", rec?.metadata?.scope === "platform", `got ${JSON.stringify(rec?.metadata)}`);

// (b) THE PRIVILEGE-ESCALATION CASE. Ordinary caller metadata must NOT be able to self-declare
//     platform scope — otherwise any call site could move its own spend off the unattributed ledger.
rec = await traceAndGet({ provider: "anthropic", status: "success", metadata: { scope: "platform" } });
check(
  "metadata.scope alone CANNOT elevate a trace to platform",
  rec?.metadata?.scope === undefined,
  `got ${JSON.stringify(rec?.metadata)}`,
);

// (c) Absent declaration stays absent — the trigger then records 'unattributed' rather than guessing.
rec = await traceAndGet({ provider: "anthropic", status: "success" });
check("no declaration → no scope marker (trigger will read 'unattributed')", rec?.metadata?.scope === undefined);

// (d) A malformed/unexpected value is not honoured either.
rec = await traceAndGet({ provider: "anthropic", status: "success", scope: "PLATFORM" });
check("a non-literal scope value is not honoured", rec?.metadata?.scope === undefined, `got ${JSON.stringify(rec?.metadata)}`);

// (e) An allowlisted key still survives alongside the stamp — the fix must not have broken metadata.
rec = await traceAndGet({
  provider: "anthropic",
  status: "success",
  scope: "platform",
  metadata: { caller_function: "some-fn", scope: "platform" },
});
check("allowlisted metadata still survives", rec?.metadata?.caller_function === "some-fn");
check("and the stamp is present because the TOP-LEVEL field declared it", rec?.metadata?.scope === "platform");

// (f) Tenant attribution is carried untouched; the trigger checks tenant_id FIRST, so a tenant-bearing
//     trace classifies as 'tenant' regardless of this marker. Asserted end-to-end in the SQL proof.
rec = await traceAndGet({
  provider: "anthropic",
  status: "success",
  tenant_id: "d0000000-0000-0000-0000-000000001111",
  scope: "platform",
});
check("tenant id survives alongside a scope declaration", rec?.tenant_id === "d0000000-0000-0000-0000-000000001111");

console.log(`\n${fails === 0 ? "ALL CHECKS PASSED" : `${fails} CHECK(S) FAILED`}`);
process.exit(fails === 0 ? 0 : 1);
