// §32 headless guard for #168 — voice as a first-class Conversations channel.
//
// The voice-twiml webhook and the twilio-status-callback voice branch cannot be driven by a live PSTN
// call in CI, so this exercises their PURE, crash-prone request-shaping logic against representative
// inputs and asserts the exact outputs:
//   • the canonical VOICE thread_key + the §568 phone sanitizer  (voice-twiml/twiml.ts)
//   • the Twilio CallStatus → messages.status mapping, SID matching, duration parse (call-status.ts)
//   • the statusCallback wiring on the outbound/inbound TwiML builders
//
// Run:  node --experimental-strip-types scripts/voice-conversations-smoke.mjs
// Exit: 0 = the pure logic behaves; non-zero = a defect that would mis-thread a call, mis-map a status,
//       drop a duration, or inject via the .or() filter (fix before shipping).

const {
  voiceThreadKey,
  sanitizePhoneFilter,
  buildOutboundTwiml,
  buildInboundTwiml,
} = await import("../supabase/functions/voice-twiml/twiml.ts");

const {
  mapCallStatus,
  callMatchSids,
  parseCallDuration,
  CALL_STATUS_MAP,
} = await import("../supabase/functions/twilio-status-callback/call-status.ts");

let pass = 0;
let fail = 0;
function check(name, cond, detail = "") {
  if (cond) {
    pass++;
    console.log(`  ✓ ${name}`);
  } else {
    fail++;
    console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

const T = "11111111-1111-4111-8111-111111111111";
// The canonical form every producer must agree on: channel:tenantId:phoneStrippedTo[0-9+].
const CANON = /^voice:[0-9a-f-]+:[0-9+]+$/;

console.log("phone sanitize (§568) + voice thread_key");
check("sanitize strips formatting to [0-9+]", sanitizePhoneFilter("+1 (555) 010-2020") === "+15550102020",
  sanitizePhoneFilter("+1 (555) 010-2020"));
const inj = sanitizePhoneFilter("+1,id.eq.00000000-0000-0000-0000-000000000000");
check("sanitize neutralizes an .or() injection attempt (no ',' '.' or letters survive)",
  /^[0-9+]*$/.test(inj) && !inj.includes(",") && !inj.includes("."), inj);
check("sanitize of empty/garbage ⇒ ''", sanitizePhoneFilter("abc") === "" && sanitizePhoneFilter(null) === "");
check("voiceThreadKey formats formatted number", voiceThreadKey(T, "+1 (555) 010-2020") === `voice:${T}:+15550102020`,
  voiceThreadKey(T, "+1 (555) 010-2020"));
check("voiceThreadKey matches the canonical channel:tenant:[0-9+] shape", CANON.test(voiceThreadKey(T, "+15550102020")),
  voiceThreadKey(T, "+15550102020"));
check("E.164 with spaces coalesces to the same key as the compact form",
  voiceThreadKey(T, "+1 555 010 2020") === voiceThreadKey(T, "+15550102020"),
  voiceThreadKey(T, "+1 555 010 2020"));

console.log("CallStatus → messages.status mapping");
check("completed → delivered", mapCallStatus("completed") === "delivered");
check("busy → failed", mapCallStatus("busy") === "failed");
check("no-answer → failed", mapCallStatus("no-answer") === "failed");
check("failed → failed", mapCallStatus("failed") === "failed");
check("canceled → failed", mapCallStatus("canceled") === "failed");
check("ringing → queued", mapCallStatus("ringing") === "queued");
check("in-progress → queued", mapCallStatus("in-progress") === "queued");
check("initiated → queued (never the invalid 'initiated' status)", mapCallStatus("initiated") === "queued");
check("case/space-insensitive", mapCallStatus("  COMPLETED ") === "delivered");
check("unknown → null (ack, no guess)", mapCallStatus("wobble") === null && mapCallStatus("") === null && mapCallStatus(null) === null);
// Every mapped value MUST be a real messages.status enum member (§13 — no CHECK violation on write).
const VALID_STATUS = new Set(["draft", "queued", "sent", "delivered", "failed", "received", "read"]);
check("every mapped status is a valid messages.status enum value",
  Object.values(CALL_STATUS_MAP).every((s) => VALID_STATUS.has(s)),
  JSON.stringify(CALL_STATUS_MAP));

console.log("SID matching (parent-leg vs child-leg) + duration parse");
check("child-leg callback matches on ParentCallSid first", JSON.stringify(callMatchSids("CAchild", "CAparent")) === JSON.stringify(["CAparent", "CAchild"]));
check("parent-level callback (no ParentCallSid) matches on CallSid", JSON.stringify(callMatchSids("CAparent", "")) === JSON.stringify(["CAparent"]));
check("identical parent==child de-dupes", JSON.stringify(callMatchSids("CAx", "CAx")) === JSON.stringify(["CAx"]));
check("empties dropped (no over-broad in('') filter)", JSON.stringify(callMatchSids("", null)) === JSON.stringify([]));
check("parseCallDuration reads seconds", parseCallDuration("47") === 47);
check("parseCallDuration absent → null", parseCallDuration(null) === null && parseCallDuration("") === null);
check("parseCallDuration rejects negatives/garbage", parseCallDuration("-3") === null && parseCallDuration("abc") === null);
check("parseCallDuration accepts 0 (a real 0-second terminal)", parseCallDuration("0") === 0);

console.log("TwiML statusCallback wiring");
const outWith = buildOutboundTwiml("+15550001111", "+15550102020", "", "https://x.dev/functions/v1/twilio-status-callback");
check("outbound emits statusCallback on <Number>", outWith.includes('statusCallback="https://x.dev/functions/v1/twilio-status-callback"'), outWith);
check("outbound emits statusCallbackEvent=completed", outWith.includes('statusCallbackEvent="completed"'));
const outNo = buildOutboundTwiml("+15550001111", "+15550102020");
check("outbound WITHOUT url is byte-identical to pre-#168 (no statusCallback)", !outNo.includes("statusCallback"), outNo);
const inWith = buildInboundTwiml([`${T}.22222222-2222-4222-8222-222222222222`], "", "https://x.dev/cb");
check("inbound emits statusCallback on <Client>", inWith.includes('statusCallback="https://x.dev/cb"') && inWith.includes("<Client"));
const inNo = buildInboundTwiml([`${T}.22222222-2222-4222-8222-222222222222`]);
check("inbound WITHOUT url is byte-identical to pre-#168 (no statusCallback)", !inNo.includes("statusCallback"), inNo);

console.log(`\n${fail === 0 ? "PASS" : "FAIL"} — ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
