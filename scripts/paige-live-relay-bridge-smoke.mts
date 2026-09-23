/** Real WebCrypto + final SSE + relay, with fake ears/mouth and NO network. */
import { PaigeLiveRelayBridge, type LiveEarsEvents } from "../supabase/functions/_shared/paige-live-relay-bridge.ts";
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
async function fixture() {
  const sent: Array<string | ArrayBuffer> = [];
  const usage: UsageEvent[] = [];
  const spoken: string[] = [];
  let ears!: LiveEarsEvents;
  let resolveDispatch!: (value: { turn_id: string; challenge: string }) => void;
  const dispatchReady = new Promise<{ turn_id: string; challenge: string }>((resolve) => { resolveDispatch = resolve; });
  let closes = 0;
  const bridge = new PaigeLiveRelayBridge({
    sessionId: base.sessionId, epoch: base.epoch,
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
  bridge.receive(new ArrayBuffer(2560));
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
check("no real network or provider call occurred", networkCalls === 0);
globalThis.fetch = originalFetch; globalThis.WebSocket = originalWebSocket;
console.log(`\n${pass} passed, ${fail} failed; network/provider calls=${networkCalls}`);
process.exit(fail ? 1 : 0);
