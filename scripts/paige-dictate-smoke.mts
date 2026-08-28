// §32 headless guard for §49 Wave A #170 (paige-dictate — press-to-talk browser DICTATION). The live
// mic capture + Deepgram round-trip CANNOT be driven headless (owed to a real browser + the real
// DEEPGRAM_API_KEY, §13), so this exercises the PURE, key-free logic the dictation pipe is built on and
// asserts it behaves:
//   • the STT router with BROWSER opts { encoding:"linear16", sampleRate:16000, channels:1 } builds the
//     correct Deepgram Nova-3 URL — proving the ONE STT home (_shared/stt-router.ts) serves browser
//     dictation with NO fork (§18/§34); needs_config when DEEPGRAM_API_KEY is absent (honest degrade).
//   • the Deepgram transcript extractor maps a Results frame onto the WS contract's
//     { type:"transcript", text, is_final } shape, and drops control/empty frames (no phantom words).
//   • the sample-rate clamp (client-declared rate → Deepgram-sane [8000,48000], default 16000).
//
// Run:  node --experimental-strip-types scripts/paige-dictate-smoke.mts
// Exit: 0 = the pure dictation logic behaves; non-zero = a defect (fix before shipping).
//
// §13 HONEST — what this CANNOT verify (owed to a live browser test): the mic getUserMedia capture,
// the AudioContext→PCM16 encoding, the WS auth (query-param token → getUser), the live Deepgram
// linear16 round-trip, and the transcript actually landing in the composer. Those are the OWED live
// checks (§32) — this smoke does NOT fake a passing Deepgram round-trip or a live socket.

import { readFileSync } from "node:fs";
import ts from "typescript";

// stt-router → env-key.ts reads Deno.env (get + toObject); shim BOTH so the module imports in Node.
const env: Record<string, string | undefined> = {};
(globalThis as unknown as { Deno?: unknown }).Deno = {
  env: {
    get: (k: string) => env[k],
    toObject: () => ({ ...env }) as Record<string, string>,
  },
};

const { planSttStream, resolveSttRoute, buildDeepgramStreamUrl, extractDeepgramTranscript } = await import(
  "../supabase/functions/_shared/stt-router.ts"
);

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean, detail = "") {
  if (cond) {
    pass++;
    console.log(`  ✓ ${name}`);
  } else {
    fail++;
    console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

// Mirror of paige-dictate's clampSampleRate (kept in sync with index.ts; pure, so unit-checkable here).
function clampSampleRate(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return 16000;
  return Math.min(48000, Math.max(8000, Math.round(n)));
}

console.log("paige-dictate (#170) smoke\n");

// ── Operator-only, no-audio provider-health contract ─────────────────────────────────────────────
console.log("provider-health contract:");
const dictateSource = readFileSync(new URL("../supabase/functions/paige-dictate/index.ts", import.meta.url), "utf8");
check("has an explicit no-audio provider-health mode", dictateSource.includes('mode === "provider-health"'));
check("health mode validates the stored key with Deepgram auth/token", dictateSource.includes("https://api.deepgram.com/v1/auth/token"));
check("health mode is gated by canonical is_platform_operator", dictateSource.includes('rpc("is_platform_operator")'));
check("health mode requires header auth and does not accept the WebSocket query token", dictateSource.includes("provider-health requires Authorization header"));
check("health response is constructed from an allowlisted sanitizer", dictateSource.includes("sanitizeDeepgramCredentialMetadata"));
check("provider request IDs and scope values use a bounded identifier sanitizer", dictateSource.includes("sanitizeProviderIdentifier"));
check("health responses have a final secret-redaction guard", dictateSource.includes("diagnostic_redaction_failure"));
check("health mode does not infer an unproven quota state", !dictateSource.includes("quotaReadiness"));
check("billing failure is isolated from credential validation", dictateSource.includes("provider billing readiness unavailable"));
check("health mode never returns the stored credential", !dictateSource.includes("deepgramApiKey,"));
check("health mode does not call an audio inference endpoint", !dictateSource.match(/providerHealth[\s\S]*\/v1\/listen/));

// ── STT router serves BROWSER dictation opts with no fork (§18/§34) ───────────────────────────────
console.log("stt-router (linear16 browser dictation):");
delete env.DEEPGRAM_API_KEY;
const planUnset = planSttStream("nova-realtime", { encoding: "linear16", sampleRate: 16000, channels: 1, interimResults: true });
check(
  "needs_config when DEEPGRAM_API_KEY absent (honest degrade)",
  planUnset.ok === false && "needs_config" in planUnset && planUnset.needs_config === true,
  JSON.stringify(planUnset),
);

env.DEEPGRAM_API_KEY = "dg_test_key_headless";
const plan = planSttStream("nova-realtime", { encoding: "linear16", sampleRate: 16000, channels: 1, interimResults: true, language: "en-US" });
check("plan ok when key present", plan.ok === true, JSON.stringify(plan));
check("plan targets deepgram nova-3", plan.ok === true && plan.provider === "deepgram" && plan.model === "nova-3");
check(
  "plan URL is Deepgram Nova-3 LINEAR16 / 16k / mono (browser dictation, NOT μ-law/8k)",
  plan.ok === true &&
    plan.url.startsWith("wss://api.deepgram.com/v1/listen?") &&
    plan.url.includes("model=nova-3") &&
    plan.url.includes("encoding=linear16") &&
    plan.url.includes("sample_rate=16000") &&
    plan.url.includes("channels=1") &&
    plan.url.includes("interim_results=true"),
  plan.ok === true ? plan.url : "",
);
check("plan URL never contains the key (§13)", plan.ok === true && !plan.url.includes("dg_test_key_headless"));

// The SAME nova cell paige-stt uses — one home, browser opts just override the Twilio defaults (§18).
const cell = resolveSttRoute("nova-realtime");
check("reuses the ONE nova-realtime deepgram cell", !!cell && cell.provider === "deepgram");
check(
  "cell default is Twilio μ-law/8k — browser opts OVERRIDE, they don't fork the cell",
  !!cell && buildDeepgramStreamUrl(cell).includes("encoding=mulaw") && buildDeepgramStreamUrl(cell).includes("sample_rate=8000"),
);
check(
  "same cell + linear16 opts → linear16 URL (override, one home)",
  !!cell && buildDeepgramStreamUrl(cell, { encoding: "linear16", sampleRate: 16000 }).includes("encoding=linear16"),
);
delete env.DEEPGRAM_API_KEY;

// ── WS contract shape: Deepgram Results → { type:"transcript", text, is_final } ────────────────────
console.log("WS transcript contract shape:");
const finalFrame = extractDeepgramTranscript(
  JSON.stringify({ type: "Results", is_final: true, speech_final: true, channel: { alternatives: [{ transcript: "hello paige", confidence: 0.97 }] } }),
);
check("final Results extracts transcript", !!finalFrame && finalFrame.transcript === "hello paige");
// The server emits is_final = (isFinal || speechFinal) — assert both flavors map to a final.
const speechFinalOnly = extractDeepgramTranscript(
  JSON.stringify({ type: "Results", is_final: false, speech_final: true, channel: { alternatives: [{ transcript: "done" }] } }),
);
check(
  "server contract: is_final = isFinal || speechFinal (a speech_final utterance is final to the composer)",
  !!speechFinalOnly && (speechFinalOnly.isFinal || speechFinalOnly.speechFinal) === true,
);
const interim = extractDeepgramTranscript(
  JSON.stringify({ type: "Results", is_final: false, speech_final: false, channel: { alternatives: [{ transcript: "hel" }] } }),
);
check("interim Results is NOT final", !!interim && (interim.isFinal || interim.speechFinal) === false);
check("Metadata control frame → null (no phantom transcript)", extractDeepgramTranscript(JSON.stringify({ type: "Metadata" })) === null);
check("empty transcript → null (never emit an empty word)", extractDeepgramTranscript(JSON.stringify({ type: "Results", channel: { alternatives: [{ transcript: "" }] } })) === null);
check("garbage → null (no throw)", extractDeepgramTranscript("}{ not json") === null);

// ── sample-rate clamp (client-declared rate → Deepgram-sane window) ───────────────────────────────
console.log("sample-rate clamp:");
check("default 16000 when absent", clampSampleRate(undefined) === 16000);
check("default 16000 when NaN", clampSampleRate("abc") === 16000);
check("passes 16000 through", clampSampleRate(16000) === 16000);
check("passes 48000 (browser hardware rate) through", clampSampleRate(48000) === 48000);
check("clamps a too-low rate up to 8000", clampSampleRate(4000) === 8000);
check("clamps a too-high rate down to 48000", clampSampleRate(96000) === 48000);

// ── Executable request-handler security contract ─────────────────────────────────────────────────
console.log("provider-health handler:");
type HandlerState = {
  authenticated: boolean;
  operator: boolean;
  operatorError: boolean;
  provider: (url: string, init?: RequestInit) => Promise<Response>;
  providerCalls: Array<{ url: string; method: string }>;
  upgrades: number;
};
const handlerState: HandlerState = {
  authenticated: true,
  operator: true,
  operatorError: false,
  provider: async () => new Response("{}", { status: 200 }),
  providerCalls: [],
  upgrades: 0,
};
const originalFetch = globalThis.fetch;
const testSecret = "dg_health_test_secret_never_expose";
(globalThis as unknown as Record<string, unknown>).__paigeTestCreateClient = () => ({
  auth: {
    getUser: async () => handlerState.authenticated
      ? { data: { user: { id: "operator-test-user" } }, error: null }
      : { data: { user: null }, error: new Error("invalid") },
  },
  rpc: async (name: string) => {
    if (name === "is_platform_operator") {
      return handlerState.operatorError
        ? { data: null, error: new Error("operator lookup failed") }
        : { data: handlerState.operator, error: null };
    }
    if (name === "current_user_tenant_id") return { data: "tenant-test", error: null };
    return { data: null, error: new Error("unexpected rpc") };
  },
});
(globalThis as unknown as Record<string, unknown>).__paigeTestPlanSttStream = () => ({ ok: false, needs_config: true });
(globalThis as unknown as Record<string, unknown>).__paigeTestOpenDeepgramSocket = () => null;
(globalThis as unknown as Record<string, unknown>).__paigeTestExtractDeepgramTranscript = () => null;
(globalThis as unknown as Record<string, unknown>).Deno = {
  env: {
    get: (key: string) => ({
      SUPABASE_URL: "https://test.supabase.co",
      SUPABASE_ANON_KEY: "public-anon-test-key",
      DEEPGRAM_API_KEY: testSecret,
    } as Record<string, string>)[key],
  },
  serve: () => undefined,
  upgradeWebSocket: () => {
    handlerState.upgrades++;
    return {
      socket: { readyState: 0, send: () => undefined, close: () => undefined },
      response: new Response("upgraded", { status: 200 }),
    };
  },
};
globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input);
  handlerState.providerCalls.push({ url, method: init?.method ?? "GET" });
  return handlerState.provider(url, init);
};

let handlerSource = dictateSource
  .replace(/^import .*;\r?\n/gm, "")
  .replace(
    "Deno.serve(async (req) => {",
    "export const handlePaigeDictateRequest = async (req) => {",
  )
  .replace(/\n\}\);\s*$/, "\n};");
handlerSource = `
const createClient = globalThis.__paigeTestCreateClient;
const planSttStream = globalThis.__paigeTestPlanSttStream;
const openDeepgramSocket = globalThis.__paigeTestOpenDeepgramSocket;
const extractDeepgramTranscript = globalThis.__paigeTestExtractDeepgramTranscript;
${handlerSource}`;
const transpiledHandler = ts.transpileModule(handlerSource, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const handlerModule = await import(`data:text/javascript;base64,${Buffer.from(transpiledHandler).toString("base64")}`);
const handlePaigeDictateRequest = handlerModule.handlePaigeDictateRequest as (req: Request) => Promise<Response>;

function resetHandlerState() {
  handlerState.authenticated = true;
  handlerState.operator = true;
  handlerState.operatorError = false;
  handlerState.providerCalls = [];
  handlerState.upgrades = 0;
}
function healthRequest(method = "GET", auth?: string, query = "?mode=provider-health") {
  return new Request(`https://test.supabase.co/functions/v1/paige-dictate${query}`, {
    method,
    headers: auth ? { Authorization: auth } : undefined,
  });
}
async function responseBody(response: Response): Promise<Record<string, unknown>> {
  return await response.json() as Record<string, unknown>;
}

resetHandlerState();
let handlerResponse = await handlePaigeDictateRequest(healthRequest("OPTIONS"));
check("OPTIONS exits before auth/provider access", handlerResponse.status === 200 && handlerState.providerCalls.length === 0);

resetHandlerState();
handlerResponse = await handlePaigeDictateRequest(healthRequest("POST", "Bearer operator"));
check("health mode rejects non-GET methods", handlerResponse.status === 405 && handlerState.providerCalls.length === 0);

resetHandlerState();
handlerResponse = await handlePaigeDictateRequest(healthRequest("GET", undefined, "?mode=provider-health&token=query-jwt"));
check("query-only JWT is rejected for health mode", handlerResponse.status === 401 && handlerState.providerCalls.length === 0);

resetHandlerState();
handlerState.authenticated = false;
handlerResponse = await handlePaigeDictateRequest(healthRequest("GET", "Bearer invalid"));
check("invalid header JWT is rejected", handlerResponse.status === 401 && handlerState.providerCalls.length === 0);

resetHandlerState();
handlerState.operator = false;
handlerResponse = await handlePaigeDictateRequest(healthRequest("GET", "Bearer tenant-user"));
check("authenticated non-operator is denied before provider access", handlerResponse.status === 403 && handlerState.providerCalls.length === 0);

resetHandlerState();
handlerState.operatorError = true;
handlerResponse = await handlePaigeDictateRequest(healthRequest("GET", "Bearer operator"));
check("operator lookup error fails closed", handlerResponse.status === 403 && handlerState.providerCalls.length === 0);

resetHandlerState();
handlerState.provider = async () => new Response("invalid", { status: 401 });
handlerResponse = await handlePaigeDictateRequest(healthRequest("GET", "Bearer operator"));
let handlerBody = await responseBody(handlerResponse);
check("provider 401 is the only invalid-credential classification", handlerResponse.status === 503 && handlerBody.credentialStatus === "invalid");

resetHandlerState();
handlerState.provider = async () => new Response("forbidden", { status: 403 });
handlerResponse = await handlePaigeDictateRequest(healthRequest("GET", "Bearer operator"));
handlerBody = await responseBody(handlerResponse);
check("provider 403 is denied, not an invalid-key claim", handlerResponse.status === 502 && handlerBody.credentialStatus === "denied");

resetHandlerState();
const providerLogs: string[] = [];
const originalConsole = { log: console.log, warn: console.warn, error: console.error };
console.log = (...args: unknown[]) => { providerLogs.push(JSON.stringify(args)); };
console.warn = (...args: unknown[]) => { providerLogs.push(JSON.stringify(args)); };
console.error = (...args: unknown[]) => { providerLogs.push(JSON.stringify(args)); };
handlerState.provider = async () => new Response(JSON.stringify({
  project_id: testSecret,
  scopes: ["usage:write", testSecret, "<script>", "x".repeat(200)],
  secret: testSecret,
}), { status: 200, headers: { "dg-request-id": testSecret } });
handlerResponse = await handlePaigeDictateRequest(healthRequest("GET", "Bearer operator"));
handlerBody = await responseBody(handlerResponse);
console.log = originalConsole.log;
console.warn = originalConsole.warn;
console.error = originalConsole.error;
check(
  "credential echoes in project, scope, request ID, and raw body never escape response or logs",
  handlerResponse.status === 200 && handlerBody.project === null && handlerBody.providerRequestId === null &&
    JSON.stringify(handlerBody.scopes) === JSON.stringify(["usage:write"]) &&
    !JSON.stringify(handlerBody).includes(testSecret) && !JSON.stringify(handlerBody).includes("<script>") &&
    !providerLogs.join("\n").includes(testSecret),
);

resetHandlerState();
handlerState.provider = async (url) => url.endsWith("/v1/auth/token")
  ? new Response(JSON.stringify({ project_id: "project-safe-123", scopes: ["usage:write"] }), {
    status: 200,
    headers: { "dg-request-id": "auth-request-123" },
  })
  : new Response(JSON.stringify({ balances: [{ amount: 0 }] }), {
    status: 200,
    headers: { "dg-request-id": testSecret },
  });
handlerResponse = await handlePaigeDictateRequest(healthRequest("GET", "Bearer operator"));
handlerBody = await responseBody(handlerResponse);
check(
  "depleted balance preserves valid credential but reports overall blocked",
  handlerResponse.status === 503 && handlerBody.ok === false && handlerBody.credentialStatus === "valid" &&
    handlerBody.billingReadiness === "depleted" && handlerBody.operationalReadiness === "blocked" &&
    handlerBody.billingRequestId === null && !JSON.stringify(handlerBody).includes(testSecret),
);
check(
  "operator health uses only fixed-host GET metadata endpoints",
  handlerState.providerCalls.length === 2 && handlerState.providerCalls.every((call) =>
    call.method === "GET" && (
      call.url === "https://api.deepgram.com/v1/auth/token" ||
      call.url === "https://api.deepgram.com/v1/projects/project-safe-123/balances"
    )),
);

resetHandlerState();
handlerState.provider = async (url) => {
  if (url.endsWith("/v1/auth/token")) {
    return new Response(JSON.stringify({ project_id: "project-safe-123", scopes: ["usage:write"] }), { status: 200 });
  }
  throw new Error("billing transport unavailable");
};
handlerResponse = await handlePaigeDictateRequest(healthRequest("GET", "Bearer operator"));
handlerBody = await responseBody(handlerResponse);
check(
  "billing transport failure does not erase proven credential validity",
  handlerResponse.status === 200 && handlerBody.credentialStatus === "valid" &&
    handlerBody.billingReadiness === "unverified" && handlerBody.operationalReadiness === "unverified",
);

resetHandlerState();
handlerState.provider = async () => { throw new Error("provider should not be called"); };
handlerResponse = await handlePaigeDictateRequest(new Request(
  "https://test.supabase.co/functions/v1/paige-dictate?token=websocket-jwt",
  { headers: { Upgrade: "websocket" } },
));
check("existing authenticated WebSocket mode still upgrades", handlerResponse.status === 200 && handlerState.upgrades === 1);

globalThis.fetch = originalFetch;

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
