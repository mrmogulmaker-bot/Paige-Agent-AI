// §32 headless guard for the voice-twiml webhook (#140 A3). The webhook cannot be driven
// by a live PSTN call in CI, so this exercises its PURE request-shaping logic against
// representative inputs and asserts the exact TwiML + the shared signature validator.
//
// Run:  node --experimental-strip-types scripts/voice-twiml-smoke.mts
// Exit: 0 = builders + signature validation behave; non-zero = a defect that would emit
//       wrong/broken TwiML or mis-validate a Twilio signature (fix before shipping).

// _shared/twilio.ts reads env via Deno.env.get; shim it so the module imports in Node.
const env: Record<string, string | undefined> = {};
(globalThis as unknown as { Deno?: unknown }).Deno = { env: { get: (k: string) => env[k] } };

const {
  classifyDirection,
  parseClientCaller,
  parseIdentity,
  buildIdentity,
  buildOutboundTwiml,
  buildInboundTwiml,
  buildSayHangupTwiml,
  buildStreamStart,
  VOICEMAIL_UNAVAILABLE_MESSAGE,
} = await import("../supabase/functions/voice-twiml/twiml.ts");

const { computeTwilioSignature, validateTwilioSignature } = await import(
  "../supabase/functions/_shared/twilio.ts"
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

const T = "11111111-1111-1111-1111-111111111111";
const U = "22222222-2222-2222-2222-222222222222";

console.log("voice-twiml smoke\n");

// ── Direction classification ────────────────────────────────────────────────
console.log("direction:");
check("client:… ⇒ outbound", classifyDirection(`client:${T}.${U}`) === "outbound");
check("PSTN From ⇒ inbound", classifyDirection("+14155550123") === "inbound");
check("empty From ⇒ inbound", classifyDirection("") === "inbound");

// ── Identity parsing (dot separator; UUIDs have no dots) ─────────────────────
console.log("identity:");
const parsed = parseClientCaller(`client:${T}.${U}`);
check("parseClientCaller tenant", parsed?.tenantId === T, JSON.stringify(parsed));
check("parseClientCaller user", parsed?.userId === U, JSON.stringify(parsed));
check("parseClientCaller rejects non-client", parseClientCaller("+14155550123") === null);
check("parseIdentity rejects no-dot", parseIdentity(T) === null);
check("parseIdentity rejects trailing dot", parseIdentity(`${T}.`) === null);
check("parseIdentity rejects leading dot", parseIdentity(`.${U}`) === null);
check("buildIdentity round-trips", buildIdentity(T, U) === `${T}.${U}`);

// ── Outbound TwiML ──────────────────────────────────────────────────────────
console.log("outbound TwiML:");
const outXml = buildOutboundTwiml("+14155550100", "+14155559999");
check("outbound has callerId", outXml.includes('callerId="+14155550100"'), outXml);
check("outbound dials <Number>", outXml.includes("<Number>+14155559999</Number>"), outXml);
check("outbound is a Dial", outXml.includes("<Dial") && outXml.includes("</Dial>"), outXml);
check("outbound answerOnBridge", outXml.includes('answerOnBridge="true"'), outXml);

// XML-escape safety: a callerId/number can't inject markup.
const esc = buildOutboundTwiml('+1"><Hangup/>', "+1&5");
check("outbound escapes quotes/markup", !esc.includes("+1\"><Hangup/>") && esc.includes("&amp;"), esc);

// ── Inbound TwiML ───────────────────────────────────────────────────────────
console.log("inbound TwiML:");
const inXml = buildInboundTwiml([`${T}.${U}`, `${T}.33333333-3333-3333-3333-333333333333`]);
check("inbound rings both <Client>", (inXml.match(/<Client>/g) ?? []).length === 2, inXml);
check("inbound wraps one <Dial>", (inXml.match(/<Dial/g) ?? []).length === 1, inXml);
check("inbound client identity present", inXml.includes(`<Client>${T}.${U}</Client>`), inXml);

// Empty seat list ⇒ honest voicemail message, never an empty <Dial> (§13).
const noSeat = buildInboundTwiml([]);
check("inbound empty ⇒ voicemail message", noSeat.includes(VOICEMAIL_UNAVAILABLE_MESSAGE), noSeat);
check("inbound empty ⇒ Hangup not empty Dial", noSeat.includes("<Hangup/>") && !noSeat.includes("<Client>"), noSeat);

// ── Say+Hangup degrade path (honest: says THEN ends; never Say-before-Reject) ─
console.log("degrade TwiML:");
const say = buildSayHangupTwiml("Calling is not set up yet.");
check("say wraps message in <Say>", say.includes("<Say>Calling is not set up yet.</Say>"), say);
check("say ends with <Hangup/>", say.includes("<Hangup/>"), say);
check("say has NO <Reject> (unreachable-verb bug)", !say.includes("<Reject"), say);
// apostrophe in message is XML-escaped, not raw (injection safety).
const apos = buildSayHangupTwiml("Calling isn't set up.");
check("say escapes apostrophe", apos.includes("&apos;") && !apos.includes("isn't"), apos);

// ── #140 B1 §37 contract: the OPTIONAL <Start><Stream> co-pilot fork ──────────
// The builders gained an optional trailing streamXml arg. Assert the DEFAULT (no arg / "") is
// byte-identical to the pre-B1 output (co-pilot OFF changes NOTHING), and that when a fork IS
// passed it lands BEFORE <Dial> (a non-blocking fork, never interrupting the bridge).
console.log("B1 <Start><Stream> fork:");
const outNoStream = buildOutboundTwiml("+14155550100", "+14155559999");
check(
  "outbound default is unchanged (no <Start>)",
  outNoStream === '<?xml version="1.0" encoding="UTF-8"?><Response><Dial answerOnBridge="true" callerId="+14155550100"><Number>+14155559999</Number></Dial></Response>',
  outNoStream,
);
const inNoStream = buildInboundTwiml([`${T}.${U}`]);
check(
  "inbound default is unchanged (no <Start>)",
  inNoStream === `<?xml version="1.0" encoding="UTF-8"?><Response><Dial answerOnBridge="true"><Client>${T}.${U}</Client></Dial></Response>`,
  inNoStream,
);
const forkXml = buildStreamStart("wss://ref.functions.supabase.co/functions/v1/paige-stt", { streamToken: "v1.a.b", tenantId: T, callSid: "CA1" });
check("buildStreamStart wraps <Start><Stream>", forkXml.startsWith("<Start><Stream url=") && forkXml.endsWith("</Stream></Start>"), forkXml);
check("buildStreamStart('') → '' (fork OFF)", buildStreamStart("") === "");
check("buildStreamStart escapes param values", buildStreamStart("wss://x", { k: '"><Hangup/>' }).includes("&quot;") && !buildStreamStart("wss://x", { k: '"><Hangup/>' }).includes('"><Hangup/>'));
const outWithFork = buildOutboundTwiml("+14155550100", "+14155559999", forkXml);
check("outbound fork lands BEFORE <Dial>", outWithFork.indexOf("<Start>") < outWithFork.indexOf("<Dial") && outWithFork.includes("<Number>+14155559999</Number>"), outWithFork);

// ── Signature validation (the ONE shared helper) ────────────────────────────
console.log("signature:");
const token = "test_auth_token_ABC123";
const url = "https://example.supabase.co/functions/v1/voice-twiml";
const body = "To=%2B14155559999&From=client%3A" + encodeURIComponent(`${T}.${U}`) + "&CallSid=CA123";
const goodSig = await computeTwilioSignature(token, url, body);
check("valid signature accepted", await validateTwilioSignature(token, goodSig, url, body));
check("tampered body rejected", !(await validateTwilioSignature(token, goodSig, url, body + "&x=1")));
check("wrong token rejected", !(await validateTwilioSignature("other_token", goodSig, url, body)));
check("missing signature rejected", !(await validateTwilioSignature(token, null, url, body)));
check("empty token rejected", !(await validateTwilioSignature("", goodSig, url, body)));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
