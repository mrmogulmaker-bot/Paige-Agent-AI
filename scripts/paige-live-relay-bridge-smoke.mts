/** Real WebCrypto + final SSE + relay, with fake ears/mouth and NO network. */
import { LiveRelayAdmission, PaigeLiveRelayBridge, type LiveEarsEvents } from "../supabase/functions/_shared/paige-live-relay-bridge.ts";
import { createLiveRuntimeProof, liveRuntimeDigest, type LiveRuntimeScope } from "../supabase/functions/_shared/paige-live-runtime-proof.ts";
import type { UsageEvent } from "../supabase/functions/_shared/paige-live-relay-contract.ts";
import { readFileSync } from "node:fs";
let pass = 0;
let fail = 0;
const check = (name: string, okay: boolean) => { console.log(`${okay ? "PASS" : "FAIL"} ${name}`); okay ? pass++ : fail++; };
const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
const originalFetch = globalThis.fetch;
const originalWebSocket = globalThis.WebSocket;
let networkCalls = 0;
globalThis.fetch = (async () => { networkCalls++; throw new Error("network_forbidden"); }) as typeof fetch;
globalThis.WebSocket = class { constructor() { networkCalls++; throw new Error("network_forbidden"); } } as typeof WebSocket;
const proof = createLiveRuntimeProof("fake-only-never-a-server-secret-0123456789");
const base = { sessionId: "session-1", tenantId: "tenant-1", actorId: "user-1", threadId: "thread-1", epoch: "epoch-1" };
const outputTokens = async (scope: LiveRuntimeScope, content = "I hear you. Let me help") => {
  const body = `data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\ndata: [DONE]\n\n`;
  const source = new ReadableStream<Uint8Array>({ start(c) { c.enqueue(new TextEncoder().encode(body)); c.close(); } });
  const signed = await new Response(proof.outputStream(source, scope)).text();
  return signed.split("\n").filter((line) => line.startsWith("data: {")).map((line) => JSON.parse(line.slice(6)))
    .filter((event) => event.paige_live_output).map((event) => event.paige_live_output as string);
};
async function fixture(authorize: (force?: boolean) => Promise<boolean> = async () => true) {
  const sent: Array<string | ArrayBuffer> = [];
  const usage: UsageEvent[] = [];
  const spoken: string[] = [];
  let ears!: LiveEarsEvents;
  let resolveDispatch!: (value: { turn_id: string; challenge: string }) => void;
  const dispatchReady = new Promise<{ turn_id: string; challenge: string }>((resolve) => { resolveDispatch = resolve; });
  let closes = 0;
  const bridge = new PaigeLiveRelayBridge({
    sessionId: base.sessionId, epoch: base.epoch,
    authorize,
    send(frame) { sent.push(frame); if (typeof frame === "string") { const f = JSON.parse(frame); if (f.type === "runtime.dispatch") resolveDispatch(f); } },
    close() { closes++; },
    openEars: async (events) => { ears = events; return { ok: true, ears: { sendPcm: (b) => b.byteLength / 32, close() {}, cancel() {} } }; },
    openMouth: async (text) => { spoken.push(text); return new ReadableStream<Uint8Array>({ start(c) { c.enqueue(Uint8Array.of(1, 2, 3)); c.enqueue(Uint8Array.of(4, 5, 6)); c.close(); } }); },
    runtimeProof: { issue: (turnId, text) => proof.issue({ ...base, turnId }, text), readOutput: proof.readOutput },
    usage: { emit(event) { usage.push(event); } },
  });
  await bridge.open();
  check("ears open alone does not grant microphone readiness", sent.length === 0);
  bridge.ready(); bridge.receive(JSON.stringify({ type: "start", sampleRate: 16000 }));
  await bridge.receive(new ArrayBuffer(2560));
  ears.startOfTurn("Hello", 0); ears.partial("Hello Paige", 0); ears.final("Hello Paige.", 0);
  const dispatch = await dispatchReady;
  const scope = (await proof.readChallenge(dispatch.challenge))!;
  return { bridge, sent, spoken, usage, dispatch, scope, ears, closes: () => closes };
}
const f = await fixture();
check("challenge binds exact observed final transcript", f.scope.transcriptHash === await liveRuntimeDigest("Hello Paige."));
check("challenge cannot be used as output", await proof.readOutput(f.dispatch.challenge) === null);
const tokens = await outputTokens(f.scope);
for (const token of tokens.slice(0, -1)) await f.bridge.receive(JSON.stringify({ type: "runtime.proof", turn_id: f.scope.turnId, proof: token }));
await tick();
check("signed first sentence speaks before runtime completion", f.spoken[0] === "I hear you." && !f.sent.some((s) => typeof s === "string" && s.includes('"type":"runtime.done"')));
check("provider PCM chunks are even-byte reframed", f.sent.filter((s) => s instanceof ArrayBuffer).every((s) => (s as ArrayBuffer).byteLength % 2 === 0));
await f.bridge.receive(JSON.stringify({ type: "runtime.proof", turn_id: f.scope.turnId, proof: tokens.at(-1) }));
await tick(); await tick();
check("signed done waits for mouth completion", f.sent.some((s) => typeof s === "string" && s.includes('"type":"runtime.done"')));
f.bridge.receive(JSON.stringify({ type: "playback.complete" }));
check("observed playback settles to idle", f.bridge.phase === "idle");
check("UsageSink records observed neutral units only", ["stt_audio_ms", "llm_turn", "tts_chars"].every((kind) => f.usage.some((u) => u.kind === kind)));
f.bridge.end(); f.bridge.end(); check("end remains idempotent", f.closes() === 1);

for (const attack of ["unsigned", "tamper", "replay", "gap", "wrong-scope", "after-cancel"] as const) {
  const a = await fixture();
  const valid = await outputTokens(a.scope, "Must not speak.");
  const send = (token: string) => a.bridge.receive(JSON.stringify({ type: "runtime.proof", turn_id: a.scope.turnId, proof: token }));
  if (attack === "unsigned") {
    a.bridge.receive(JSON.stringify({ type: "runtime.dispatched", turn_id: a.scope.turnId }));
    a.bridge.receive(JSON.stringify({ type: "runtime.chunk", turn_id: a.scope.turnId, text: "Forged sentence." }));
  } else if (attack === "tamper") await send(valid[0].slice(0, -3) + "bad");
  else if (attack === "replay") { await send(valid[0]); await send(valid[0]); await send(valid[1]); }
  else if (attack === "gap") await send(valid[1]);
  else if (attack === "wrong-scope") { for (const t of await outputTokens({ ...a.scope, tenantId: "other" })) await send(t); }
  else { a.bridge.receive(JSON.stringify({ type: "interrupt" })); for (const t of valid) await send(t); }
  await tick(); check(`${attack}: no mouth call`, a.spoken.length === 0);
  a.bridge.end();
}
const expired = createLiveRuntimeProof("fake-only-never-a-server-secret-0123456789", () => Date.now() + 121000);
check("expired challenge rejected", await expired.readChallenge(f.dispatch.challenge) === null);
const unknown = createLiveRuntimeProof("different-fake-secret-01234567890123456789");
check("different signing key rejected", await unknown.readChallenge(f.dispatch.challenge) === null);
const truncated = new ReadableStream<Uint8Array>({ start(c) { c.enqueue(new TextEncoder().encode('data: {"choices":[{"delta":{"content":"partial"}}]}\n\n')); c.close(); } });
let incomplete = false;
try { await new Response(proof.outputStream(truncated, f.scope)).text(); } catch { incomplete = true; }
check("SSE EOF without DONE is not success", incomplete);
const chat = readFileSync(new URL("../supabase/functions/paige-ai-chat/index.ts", import.meta.url), "utf8");
check("canonical chat consumes challenge before any user-turn write", chat.indexOf('error: claimError') < chat.indexOf('p_role: "user"'));
check("canonical chat scopes claim to actor tenant thread and epoch", ['.eq("actor_user_id", user.id)', '.eq("thread_id", scope.threadId)', '.eq("context_epoch", scope.epoch)', '.eq("tenant_id", scope.tenantId)'].every((s) => chat.includes(s)));
check("spoken approval and substitute transcript are rejected", chat.includes('validatedData.approvedConfirmations?.length') && chat.includes('await liveRuntimeDigest(input[0].content) !== scope.transcriptHash'));
check("proof wraps only final caller-visible SSE, not withheld upstream data", chat.includes('liveOutput(finalStream)') && chat.includes('liveOutput(stream)') && !chat.includes('liveOutput(response.body'));
// Execute the real pure history assignment extracted from the Edge handler;
// the parser spy proves it rejoins the existing schema rather than bypassing it.
const historyAssignment = chat.slice(chat.indexOf('const liveHistory ='), chat.indexOf('// Context comes from the verified thread'))
  .replaceAll(': { role: string; content: string }', '').replaceAll(': { role: string }', '');
let schemaCalls = 0;
const hydrate = new Function('history', 'input', 'messageSchema', 'validatedData', historyAssignment);
const fiftyRows = Array.from({ length: 50 }, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', content: `turn ${i + 1}` }));
const hydrated: { messages?: Array<{ role: string; content: string }> } = {};
hydrate(fiftyRows.slice(-49).reverse(), [{ role: 'user', content: 'Current spoken turn' }],
  { shape: { messages: { parse: (value: unknown) => { schemaCalls++; return value; } } } }, hydrated);
check("long-thread Live history starts with user and keeps the current utterance", schemaCalls === 1 &&
  hydrated.messages?.[0]?.role === 'user' && hydrated.messages?.at(-1)?.content === 'Current spoken turn');
let clock = 0, permitted = true, reads = 0, denied = 0;
const admission = new LiveRelayAdmission(async () => { reads++; return permitted; }, () => { denied++; }, () => clock);
check("live authority initially proves permission", await admission.check());
await admission.check();
check("fresh authority is reused without a second resolver", reads === 1);
permitted = false; clock = 500;
check("revocation blocks the first expired authority check", !await admission.check() && denied === 1);
permitted = true;
check("revoked socket never silently regains admission", !await admission.check(true) && reads === 2);
const unavailableAdmission = new LiveRelayAdmission(async () => { throw new Error("database unavailable"); }, () => {});
check("authority store failure is fail closed", !await unavailableAdmission.check());
let completeRead!: (value: boolean) => void;
const checkingAdmission = new LiveRelayAdmission(() => new Promise<boolean>((resolve) => { completeRead = resolve; }), () => {});
const waiting = checkingAdmission.check(); await tick();
check("parallel PCM checks await the same in-flight decision", checkingAdmission.check() === waiting);
checkingAdmission.stop(); completeRead(true);
check("late authority completion cannot reopen a closed socket", !await waiting);
let enabled = true;
const revoking = await fixture(async () => enabled);
const observedBefore = revoking.usage.filter((event) => event.kind === "stt_audio_ms").length;
enabled = false;
await revoking.bridge.receive(new ArrayBuffer(2560));
check("revoked capture forwards no new PCM and closes honestly", revoking.closes() === 1 &&
  revoking.usage.filter((event) => event.kind === "stt_audio_ms").length === observedBefore &&
  revoking.sent.some((frame) => typeof frame === "string" && JSON.parse(frame).type === "unavailable"));
let openAllowed = true, cancelledEars = 0;
const midOpenFrames: Array<string | ArrayBuffer> = [];
const midOpen = new PaigeLiveRelayBridge({
  sessionId: base.sessionId, epoch: base.epoch, authorize: async () => openAllowed,
  send: (frame) => midOpenFrames.push(frame), close() {},
  openEars: async () => { openAllowed = false; return { ok: true, ears: { sendPcm: () => 0, close() {}, cancel() { cancelledEars++; } } }; },
  openMouth: async () => { throw new Error("must_not_open"); }, usage: { emit() {} },
  runtimeProof: { issue: (turnId, text) => proof.issue({ ...base, turnId }, text), readOutput: proof.readOutput },
});
const opened = await midOpen.open(); midOpen.ready();
check("revoked during ears open never earns ready and cancels ears", !opened && cancelledEars === 1 &&
  !midOpenFrames.some((frame) => typeof frame === "string" && JSON.parse(frame).type === "ready"));
const edge = readFileSync(new URL("../supabase/functions/paige-live-relay/index.ts", import.meta.url), "utf8").replace(/\r/g, '');
// Execute the production admission body with a database double: the master
// transport switch must stop adapter opening even when tenant standing is valid.
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
const admissionBody = edge.slice(edge.indexOf('const checkCurrentAdmission = async (): Promise<Response | null> => {') +
  'const checkCurrentAdmission = async (): Promise<Response | null> => {'.length,
  edge.indexOf('  };\n  const admissionFailure')).replace(': string | null', '');
const resolveAdmission = new AsyncFunction('admin', 'session', 'markUnavailable',
  'hasLiveWorkspaceStanding', 'isLiveWorkspaceCurrent', 'isLiveAudioPilotEnabled', admissionBody);
let transportEnabled: boolean | undefined = false;
const admissionDb = { from(table: string) {
  const query = { select: () => query, eq: () => query, in: () => query, order: () => query, limit: () => query,
    maybeSingle: async () => ({ error: null, data: table === 'paige_voice_readiness'
      ? { transport_enabled: transportEnabled } : table === 'profiles'
      ? { active_tenant_id: base.tenantId } : { id: 'valid', enabled: true } }) };
  return query;
} };
let masterDenied = 0;
const masterCheck = async () => (await resolveAdmission(admissionDb,
  { id: base.sessionId, tenant_id: base.tenantId, actor_user_id: base.actorId },
  async () => { masterDenied++; return true; }, () => true, () => true, () => true)) === null;
for (const value of [false, undefined]) {
  transportEnabled = value;
  check(`master transport ${String(value)} refuses admission`, !await masterCheck());
}
transportEnabled = true;
check('master transport explicitly enabled admits an otherwise valid session', await masterCheck());
transportEnabled = false;
let blockedOpens = 0;
const disabledBridge = new PaigeLiveRelayBridge({
  sessionId: base.sessionId, epoch: base.epoch, authorize: masterCheck, send() {}, close() {},
  openEars: async () => { blockedOpens++; return { ok: false, code: 'must_not_open' }; },
  openMouth: async () => { blockedOpens++; throw new Error('must_not_open'); }, usage: { emit() {} },
  runtimeProof: { issue: (turnId, text) => proof.issue({ ...base, turnId }, text), readOutput: proof.readOutput },
});
await disabledBridge.open();
check('disabled master switch opens neither provider adapter', blockedOpens === 0 && masterDenied === 3);

// Run the actual socket close callback. Durable minimize/restore/end belongs to
// the existing authenticated control plane, independent of close delivery order.
const closeBody = edge.slice(edge.indexOf('socket.onclose = () => {', edge.indexOf('const bridge =')) +
  'socket.onclose = () => {'.length, edge.indexOf('    socket.onerror =', edge.indexOf('const bridge =')))
  .replace(/\r/g, '').replace(/\s*};\s*$/, '');
for (const minimizeFirst of [false, true]) {
  let state = minimizeFirst ? 'minimized' : 'listening';
  let durableWrites = 0, cleaned = 0, finished!: () => void;
  const finishedClose = new Promise<void>((resolve) => { finished = resolve; });
  const closeDb = { from() {
    const query = { update(value: { state: string }) { state = value.state; durableWrites++; return query; },
      eq: () => query, neq: () => query };
    return query;
  } };
  new Function('admin', 'session', 'admissionTimer', 'admission', 'bridge', 'failureWrite', 'resolve', closeBody)
    (closeDb, {}, undefined, { stop() { cleaned++; } }, { end() { cleaned++; } }, null, finished);
  await finishedClose;
  // The existing control-plane transition refuses ended sessions.
  if (!minimizeFirst && state !== 'ended') state = 'minimized';
  check(`minimize ${minimizeFirst ? 'before' : 'after'} socket close remains resumable`,
    state === 'minimized' && durableWrites === 0 && cleaned === 2);
}
check("production reuses admission resolver before ready and throughout capture", edge.includes('async () => (await checkCurrentAdmission()) === null') &&
  edge.includes('authorize: (force) => admission.check(force)') && edge.includes('setInterval(() => { waitUntil(admission.check(true)); }, 500)'));
check("no real network or provider call occurred", networkCalls === 0);
globalThis.fetch = originalFetch; globalThis.WebSocket = originalWebSocket;
console.log(`\n${pass} passed, ${fail} failed; network/provider calls=${networkCalls}`);
process.exit(fail ? 1 : 0);
