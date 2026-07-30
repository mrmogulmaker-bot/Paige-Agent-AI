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

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
