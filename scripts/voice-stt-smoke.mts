// §32 headless guard for #140 B1 (paige-stt live-call co-pilot pipe). The media-stream endpoint
// cannot be driven by a live Twilio call + real Deepgram audio in CI, so this exercises the PURE,
// key-free logic it is built on and asserts it does not throw and produces the correct output:
//   • the Twilio media-frame parser (connected/start/media/stop/mark/unknown) + μ-law base64 decode
//   • the STT route-picker: the Deepgram Nova-3 cell + URL when configured; needs_config when the
//     DEEPGRAM_API_KEY is absent (honest degrade, never a wrong-provider substitution)
//   • the stream-token mint↔verify round-trip: a valid token verifies; a TAMPERED signature, a
//     WRONG secret, an EXPIRED token, and a CALL-SID MISMATCH all reject — this is the §9 gate
//   • the voice-twiml <Start><Stream> XML: present when a stream URL is given, absent when not
//
// Run:  node --experimental-strip-types scripts/voice-stt-smoke.mts
// Exit: 0 = the pure pipe logic behaves; non-zero = a defect (fix before shipping).
//
// §13 HONEST — what this CANNOT verify (owed to a deployed call): the LIVE Deepgram Nova-3
// round-trip (needs the real DEEPGRAM_API_KEY, a Supabase edge secret absent here, + real 8 kHz
// μ-law audio), the Twilio Media Stream connecting to the deployed wss endpoint, the Realtime
// broadcast reaching a B2 subscriber, and the platform_usage_events meter row landing on prod.
// Those are the OWED live checks (§32) — this smoke does NOT fake a passing Deepgram round-trip.

// stt-router → env-key.ts reads Deno.env (get + toObject); shim BOTH so the module imports in Node.
const env: Record<string, string | undefined> = {};
(globalThis as unknown as { Deno?: unknown }).Deno = {
  env: {
    get: (k: string) => env[k],
    toObject: () => ({ ...env }) as Record<string, string>,
  },
};

const { parseTwilioFrame, decodeMediaPayload, TWILIO_MEDIA_FRAME_MS } = await import(
  "../supabase/functions/_shared/twilio-media.ts"
);
const { planSttStream, resolveSttRoute, buildDeepgramStreamUrl, sttConfigured, extractDeepgramTranscript } =
  await import("../supabase/functions/_shared/stt-router.ts");
const { mintStreamToken, verifyStreamToken } = await import(
  "../supabase/functions/_shared/voice-stream-token.ts"
);
const { buildStreamStart, buildOutboundTwiml, buildInboundTwiml } = await import(
  "../supabase/functions/voice-twiml/twiml.ts"
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
const CALL = "CA00000000000000000000000000000001";
const STREAM = "MZ00000000000000000000000000000001";
const SECRET = "test_stream_secret_ABC123";

console.log("voice-stt (B1) smoke\n");

// ── Twilio media-frame parser ────────────────────────────────────────────────
console.log("twilio-media parser:");
const connected = parseTwilioFrame(JSON.stringify({ event: "connected", protocol: "Call", version: "1.0.0" }));
check("connected frame", connected.event === "connected");

const startRaw = JSON.stringify({
  event: "start",
  streamSid: STREAM,
  start: {
    streamSid: STREAM,
    callSid: CALL,
    accountSid: "ACxxxx",
    tracks: ["inbound"],
    customParameters: { streamToken: "tok.abc.def", tenantId: T, callSid: CALL },
    mediaFormat: { encoding: "audio/x-mulaw", sampleRate: 8000, channels: 1 },
  },
});
const start = parseTwilioFrame(startRaw);
check("start frame event", start.event === "start");
check(
  "start extracts callSid",
  start.event === "start" && start.start.callSid === CALL,
  start.event === "start" ? start.start.callSid : "",
);
check(
  "start exposes customParameters.streamToken",
  start.event === "start" && start.start.customParameters.streamToken === "tok.abc.def",
);
check("start customParameters always an object", start.event === "start" && typeof start.start.customParameters === "object");

// μ-law payload decode: base64 → exact bytes.
const rawBytes = new Uint8Array([0xff, 0x7f, 0x00, 0x80, 0x2a]);
const b64 = Buffer.from(rawBytes).toString("base64");
const mediaRaw = JSON.stringify({ event: "media", streamSid: STREAM, media: { track: "inbound", payload: b64 } });
const media = parseTwilioFrame(mediaRaw);
check("media frame event", media.event === "media");
const decoded = media.event === "media" ? decodeMediaPayload(media.media.payload) : new Uint8Array();
check(
  "media payload decodes to exact μ-law bytes",
  decoded.length === rawBytes.length && rawBytes.every((v, i) => decoded[i] === v),
  `[${Array.from(decoded).join(",")}]`,
);
check("decodeMediaPayload('') → empty (no throw)", decodeMediaPayload("").length === 0);
check("decodeMediaPayload(bad base64) → empty (no throw)", decodeMediaPayload("!!!not base64!!!").length === 0);

const stop = parseTwilioFrame(JSON.stringify({ event: "stop", streamSid: STREAM, stop: { callSid: CALL } }));
check("stop frame event", stop.event === "stop");
check("mark frame parses", parseTwilioFrame(JSON.stringify({ event: "mark", streamSid: STREAM, mark: { name: "x" } })).event === "mark");
check("garbage → unknown (no throw)", parseTwilioFrame("}{not json").event === "unknown");
check("unrecognized event → unknown", parseTwilioFrame(JSON.stringify({ event: "whatever" })).event === "unknown");
check("frame-ms constant is 20", TWILIO_MEDIA_FRAME_MS === 20);

// ── STT route-picker (mirrors model-router: cell when configured, needs_config when not) ──
console.log("stt-router:");
delete env.DEEPGRAM_API_KEY; // ensure absent for the needs_config assertion
check("sttConfigured() false when key absent", sttConfigured() === false);
const planUnset = planSttStream("nova-realtime", {});
check(
  "planSttStream → needs_config when DEEPGRAM_API_KEY absent",
  planUnset.ok === false && "needs_config" in planUnset && planUnset.needs_config === true,
  JSON.stringify(planUnset),
);

env.DEEPGRAM_API_KEY = "dg_test_key_headless"; // simulate the secret being present
check("sttConfigured() true when key present", sttConfigured() === true);
const planSet = planSttStream("nova-realtime", {});
check("planSttStream ok when key present", planSet.ok === true, JSON.stringify(planSet));
check("plan targets deepgram nova-3", planSet.ok === true && planSet.provider === "deepgram" && planSet.model === "nova-3");
check(
  "plan URL is Deepgram Nova-3 μ-law/8k/mono",
  planSet.ok === true &&
    planSet.url.startsWith("wss://api.deepgram.com/v1/listen?") &&
    planSet.url.includes("model=nova-3") &&
    planSet.url.includes("encoding=mulaw") &&
    planSet.url.includes("sample_rate=8000") &&
    planSet.url.includes("channels=1"),
  planSet.ok === true ? planSet.url : "",
);
check("plan URL never contains the key (§13)", planSet.ok === true && !planSet.url.includes("dg_test_key_headless"));
const cell = resolveSttRoute("nova-realtime");
check("resolveSttRoute returns the deepgram cell", !!cell && cell.provider === "deepgram");
check("buildDeepgramStreamUrl is pure/deterministic", cell ? buildDeepgramStreamUrl(cell) === buildDeepgramStreamUrl(cell) : false);
delete env.DEEPGRAM_API_KEY; // leave env clean for downstream

// Deepgram transcript extractor: real Results → transcript; control frames → null.
console.log("deepgram transcript extractor:");
const dgResults = JSON.stringify({
  type: "Results",
  is_final: true,
  speech_final: true,
  channel: { alternatives: [{ transcript: "hello there", confidence: 0.98 }] },
});
const tr = extractDeepgramTranscript(dgResults);
check("extracts final transcript", !!tr && tr.transcript === "hello there" && tr.isFinal === true);
check("Metadata control frame → null", extractDeepgramTranscript(JSON.stringify({ type: "Metadata" })) === null);
check("empty transcript → null (no broadcast)", extractDeepgramTranscript(JSON.stringify({ type: "Results", channel: { alternatives: [{ transcript: "" }] } })) === null);
check("garbage → null (no throw)", extractDeepgramTranscript("}{") === null);

// ── Stream-token mint↔verify: the §9 gate ────────────────────────────────────
console.log("stream-token (§9 gate):");
const token = await mintStreamToken({ secret: SECRET, tenantId: T, callSid: CALL });
check("token has 3 dot-parts (v1.payload.sig)", token.split(".").length === 3 && token.startsWith("v1."));

const good = await verifyStreamToken(SECRET, token, { expectedCallSid: CALL });
check("valid token verifies", good.ok === true, JSON.stringify(good));
check("verified tenantId matches (derived from token, not body)", good.ok === true && good.tenantId === T);
check("verified callSid matches", good.ok === true && good.callSid === CALL);
// #140 B3 FIX-1 — a token minted WITHOUT a contactId yields contactId=null (backward-compatible:
// byte-identical pre-B3 payload; the copilot no-ops contact-linking on null, §13).
check("token WITHOUT ct → verified contactId is null", good.ok === true && good.contactId === null, JSON.stringify(good));

// A token minted WITH a contactId round-trips it through the SIGNED payload (§9 — non-forgeable;
// paige-stt derives the client link from the verified token, never a raw stream parameter).
const CONTACT = "33333333-3333-3333-3333-333333333333";
const tokenWithContact = await mintStreamToken({ secret: SECRET, tenantId: T, callSid: CALL, contactId: CONTACT });
const withContact = await verifyStreamToken(SECRET, tokenWithContact, { expectedCallSid: CALL });
check("token WITH ct verifies", withContact.ok === true, JSON.stringify(withContact));
check("verified contactId round-trips from the signed token", withContact.ok === true && withContact.contactId === CONTACT);
check("ct token still binds tenant + call", withContact.ok === true && withContact.tenantId === T && withContact.callSid === CALL);
// A blank/empty contactId is treated as absent (never stamps an empty ct) → contactId null.
const tokenBlankContact = await mintStreamToken({ secret: SECRET, tenantId: T, callSid: CALL, contactId: "" });
const blankContact = await verifyStreamToken(SECRET, tokenBlankContact, { expectedCallSid: CALL });
check("blank contactId minted as absent → verified contactId null", blankContact.ok === true && blankContact.contactId === null);
// Tampering a ct-bearing token still rejects (the contact link is inside the HMAC-signed payload).
const tamperedCt = tokenWithContact.slice(0, -3) + (tokenWithContact.slice(-3) === "AAA" ? "BBB" : "AAA");
check("TAMPERED ct token rejects (contact link is signed)", (await verifyStreamToken(SECRET, tamperedCt, { expectedCallSid: CALL })).ok === false);

const tampered = token.slice(0, -3) + (token.slice(-3) === "AAA" ? "BBB" : "AAA");
const tamperedRes = await verifyStreamToken(SECRET, tampered, { expectedCallSid: CALL });
check("TAMPERED signature rejects", tamperedRes.ok === false, JSON.stringify(tamperedRes));

const wrongSecret = await verifyStreamToken("some_other_secret", token, { expectedCallSid: CALL });
check("WRONG secret rejects", wrongSecret.ok === false && wrongSecret.reason === "bad_signature");

const wrongCall = await verifyStreamToken(SECRET, token, { expectedCallSid: "CAdifferentcallsid" });
check("CALL-SID MISMATCH rejects", wrongCall.ok === false && wrongCall.reason === "call_sid_mismatch");

// Expired: mint with a clock in the past so exp <= now.
const expiredToken = await mintStreamToken({ secret: SECRET, tenantId: T, callSid: CALL, ttlSeconds: 60, nowMs: Date.now() - 3_600_000 });
const expiredRes = await verifyStreamToken(SECRET, expiredToken, { expectedCallSid: CALL });
check("EXPIRED token rejects", expiredRes.ok === false && expiredRes.reason === "expired");

check("empty token rejects", (await verifyStreamToken(SECRET, "", {})).ok === false);
check("empty secret rejects", (await verifyStreamToken("", token, {})).ok === false);
check("malformed token rejects", (await verifyStreamToken(SECRET, "not-a-token", {})).ok === false);
// mint MUST refuse to sign an unbound token (would defeat the §9 gate).
let threwOnBlankTenant = false;
try { await mintStreamToken({ secret: SECRET, tenantId: "", callSid: CALL }); } catch { threwOnBlankTenant = true; }
check("mint refuses blank tenantId (never an unbound token)", threwOnBlankTenant);

// ── voice-twiml <Start><Stream> XML: present when flagged, absent when not (§37 contract) ──
console.log("voice-twiml <Start><Stream> fork:");
const streamXml = buildStreamStart("wss://ref.functions.supabase.co/functions/v1/paige-stt", {
  streamToken: token,
  tenantId: T,
  callSid: CALL,
});
check("buildStreamStart emits <Start><Stream>", streamXml.startsWith("<Start><Stream url=") && streamXml.endsWith("</Stream></Start>"));
check("stream carries the token <Parameter>", streamXml.includes('<Parameter name="streamToken"'));
check("buildStreamStart('') → '' (no URL, no fork)", buildStreamStart("") === "");
check("empty param values dropped (no unauth stream)", !buildStreamStart("wss://x", { streamToken: "" }).includes("streamToken"));

// Builders: fork present when streamXml passed, and ABSENT (byte-identical A3 output) when not.
const outWith = buildOutboundTwiml("+14155550100", "+14155559999", streamXml);
const outWithout = buildOutboundTwiml("+14155550100", "+14155559999");
check("outbound WITH stream contains the fork before <Dial>", outWith.includes("<Start><Stream") && outWith.indexOf("<Start>") < outWith.indexOf("<Dial"));
check("outbound WITHOUT stream has NO <Start> (OFF = unchanged)", !outWithout.includes("<Start>"));
check("outbound WITHOUT stream still bridges", outWithout.includes("<Dial") && outWithout.includes("<Number>+14155559999</Number>"));

const inWith = buildInboundTwiml([`${T}.${U}`], streamXml);
const inWithout = buildInboundTwiml([`${T}.${U}`]);
check("inbound WITH stream contains the fork before <Dial>", inWith.includes("<Start><Stream") && inWith.indexOf("<Start>") < inWith.indexOf("<Dial"));
check("inbound WITHOUT stream has NO <Start> (OFF = unchanged)", !inWithout.includes("<Start>"));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
