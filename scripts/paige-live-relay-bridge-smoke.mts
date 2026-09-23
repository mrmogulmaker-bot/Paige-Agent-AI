/** Provider-free integration proof for the deployed Live relay interpreter. */
import { PaigeLiveRelayBridge, type LiveEarsEvents } from "../supabase/functions/_shared/paige-live-relay-bridge.ts";
import type { UsageEvent } from "../supabase/functions/_shared/paige-live-relay-contract.ts";

let pass = 0;
let fail = 0;
const check = (name: string, okay: boolean) => {
  console.log(`${okay ? "  ✓" : "  ✗"} ${name}`);
  if (okay) pass++; else fail++;
};
const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
const originalFetch = globalThis.fetch;
const originalWebSocket = globalThis.WebSocket;
let networkCalls = 0;
globalThis.fetch = (async () => { networkCalls++; throw new Error("network_forbidden"); }) as typeof fetch;
globalThis.WebSocket = class {
  constructor() { networkCalls++; throw new Error("network_forbidden"); }
} as typeof WebSocket;

const sent: Array<string | ArrayBuffer> = [];
const usage: UsageEvent[] = [];
let ears: LiveEarsEvents | null = null;
let cancelled = 0;
let closed = 0;
const bridge = new PaigeLiveRelayBridge({
  sessionId: "session-1", epoch: "epoch-1",
  send(frame) { sent.push(frame); },
  close() { closed++; },
  openEars: async (events) => {
    ears = events;
    return { ok: true as const, ears: {
      sendPcm(bytes: ArrayBuffer) { return bytes.byteLength / 32; },
      close() {},
      cancel() { cancelled++; },
    } };
  },
  openMouth: async (_text, _signal) => new ReadableStream<Uint8Array>({
    start(controller) {
      // Provider chunk boundaries need not align to 16-bit samples.
      controller.enqueue(Uint8Array.of(1, 2, 3));
      controller.enqueue(Uint8Array.of(4, 5, 6));
      controller.close();
    },
  }),
  usage: { emit(event) { usage.push(event); } },
});
check("fake ears open does not request microphone before durable admission", await bridge.open() && sent.length === 0);
bridge.ready();
check("ready is sent only after the caller confirms admission", sent[0] === '{"type":"ready"}');
bridge.receive(JSON.stringify({ type: "start", sampleRate: 16_000 }));
check("first-party start creates one server turn", sent.some((item) => typeof item === "string" && item.includes('"type":"turn.start"')));
const turn = JSON.parse(sent.find((item) => typeof item === "string" && item.includes('"type":"turn.start"')) as string).turn_id as string;
bridge.receive(new ArrayBuffer(2_560));
check("only observed audio is metered", usage.some((event) => event.kind === "stt_audio_ms" && event.units === 80));
ears!.startOfTurn("Hello", 0);
ears!.partial("Hello Paige", 0);
ears!.final("Hello Paige.", 0);
const dispatch = sent.find((item) => typeof item === "string" && item.includes('"type":"runtime.dispatch"')) as string;
check("Flux final dispatches the canonical runtime turn once", !!dispatch && JSON.parse(dispatch).turn_id === turn && JSON.parse(dispatch).text === "Hello Paige.");
bridge.receive(JSON.stringify({ type: "runtime.dispatched", turn_id: turn }));
bridge.receive(JSON.stringify({ type: "runtime.chunk", turn_id: turn, text: "I hear you. Let me help" }));
await tick();
check("first complete sentence speaks before runtime done", sent.filter((item) => item instanceof ArrayBuffer).length === 2 &&
  !sent.some((item) => typeof item === "string" && item.includes('"type":"runtime.done"')));
check("odd provider chunks are reframed as even-byte PCM", sent.filter((item) => item instanceof ArrayBuffer).every((item) => (item as ArrayBuffer).byteLength % 2 === 0));
bridge.receive(JSON.stringify({ type: "runtime.done", turn_id: turn }));
await tick();
await tick();
check("runtime completion waits for mouth stream before browser playback settlement", sent.some((item) => typeof item === "string" && item.includes('"type":"runtime.done"')));
bridge.receive(JSON.stringify({ type: "playback.complete" }));
check("observed playback completion settles the turn", bridge.phase === "idle");
check("UsageSink receives neutral STT/LLM/TTS units", ["stt_audio_ms", "llm_turn", "tts_chars"].every((kind) => usage.some((item) => item.kind === kind)));

bridge.receive(new ArrayBuffer(2_560));
const second = JSON.parse(sent.filter((item) => typeof item === "string" && item.includes('"type":"turn.start"')).at(-1) as string).turn_id as string;
check("next observed microphone frame gets a new server turn", second !== turn);
bridge.receive(JSON.stringify({ type: "interrupt" }));
check("interrupt clears local playback and tells runtime to cancel", sent.some((item) => typeof item === "string" && item.includes('"type":"clear_playback"') && item.includes(second)) &&
  sent.some((item) => typeof item === "string" && item.includes('"type":"runtime.cancel"') && item.includes(second)));
bridge.receive(JSON.stringify({ type: "end" }));
check("end is idempotent and does not leave provider ears open", closed === 1 && cancelled === 0);

const denied: string[] = [];
const unavailableBridge = new PaigeLiveRelayBridge({
  sessionId: "session-2", epoch: "epoch-2",
  send(frame) { if (typeof frame === "string") denied.push(frame); },
  close() {},
  openEars: async () => ({ ok: false as const, code: "stt_not_configured" }),
  openMouth: async () => { throw new Error("must_not_open"); },
  usage: { emit() {} },
});
check("provider-not-configured fails honestly before microphone ready", !await unavailableBridge.open() &&
  denied.some((item) => item.includes('"type":"unavailable"') && item.includes("stt_not_configured")) &&
  !denied.some((item) => item.includes('"type":"ready"')));
check("no real network or provider call occurred", networkCalls === 0);

globalThis.fetch = originalFetch;
globalThis.WebSocket = originalWebSocket;
console.log(`\n${pass} passed, ${fail} failed; network/provider calls=${networkCalls}`);
process.exit(fail ? 1 : 0);
