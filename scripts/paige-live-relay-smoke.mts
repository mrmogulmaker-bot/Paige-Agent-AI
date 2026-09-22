import assert from "node:assert/strict";

import {
  createRelayState,
  reduceRelay,
  type EarsAdapter,
  type MouthAdapter,
  type RelayEffect,
  type RelayEvent,
  type RelayFramePayload,
  type RelayState,
  type RuntimeAdapter,
  type UsageEvent,
  type UsageSink,
} from "../supabase/functions/_shared/paige-live-relay-contract.ts";

class VirtualClock {
  #now = 0;
  now(): number { return this.#now; }
  advance(ms: number): number { this.#now += ms; return this.#now; }
}

class FakeEars implements EarsAdapter {
  readonly starts: string[] = [];
  readonly cancels: string[] = [];
  start(turnId: string): void { this.starts.push(turnId); }
  cancel(turnId: string): void { this.cancels.push(turnId); }
}

class FakeRuntime implements RuntimeAdapter {
  readonly turns: Array<{ turnId: string; transcript: string; at: number }> = [];
  readonly cancels: string[] = [];
  private readonly clock: VirtualClock;
  constructor(clock: VirtualClock) { this.clock = clock; }
  dispatch(turnId: string, transcript: string): void { this.turns.push({ turnId, transcript, at: this.clock.now() }); }
  cancel(turnId: string): void { this.cancels.push(turnId); }
}

class FakeMouth implements MouthAdapter {
  readonly speech: Array<{ turnId: string; text: string; at: number }> = [];
  readonly cancels: string[] = [];
  readonly clears: number[] = [];
  private readonly clock: VirtualClock;
  constructor(clock: VirtualClock) { this.clock = clock; }
  synthesize(turnId: string, text: string): void { this.speech.push({ turnId, text, at: this.clock.now() }); }
  cancel(turnId: string): void { this.cancels.push(turnId); }
  clearPlayback(): void { this.clears.push(this.clock.now()); }
}

class RecordingUsageSink implements UsageSink {
  readonly events: UsageEvent[] = [];
  emit(event: UsageEvent): void { this.events.push(event); }
}

class Harness {
  readonly clock = new VirtualClock();
  readonly ears = new FakeEars();
  readonly runtime = new FakeRuntime(this.clock);
  readonly mouth = new FakeMouth(this.clock);
  readonly usage = new RecordingUsageSink();
  state: RelayState = createRelayState({ sessionId: "session-1", epoch: "epoch-1", ticketId: "ticket-1", ticketExpiresAt: 60_000 });

  send(event: RelayEvent): RelayEffect[] {
    const transition = reduceRelay(this.state, event);
    this.state = transition.state;
    for (const effect of transition.effects) this.apply(effect);
    return transition.effects;
  }

  apply(effect: RelayEffect): void {
    switch (effect.kind) {
      case "ears.start": this.ears.start(effect.turnId); break;
      case "ears.cancel": this.ears.cancel(effect.turnId); break;
      case "runtime.dispatch": this.runtime.dispatch(effect.turnId, effect.transcript); break;
      case "runtime.cancel": this.runtime.cancel(effect.turnId); break;
      case "mouth.synthesize": this.mouth.synthesize(effect.turnId, effect.text); break;
      case "mouth.cancel": this.mouth.cancel(effect.turnId); break;
      case "client.clear_playback": this.mouth.clearPlayback(); break;
      case "usage.emit": this.usage.emit(effect.event); break;
      case "governance.review": break;
      case "turn.rejected": break;
    }
  }
}

let passed = 0;
const check = (name: string, condition: unknown): void => {
  assert.ok(condition, name);
  passed += 1;
  console.log(`  ✓ ${name}`);
};

const frame = (h: Harness, turnId: string, source: "ears" | "runtime" | "mouth", seq: number, payload: RelayFramePayload): RelayEvent => ({
  kind: "frame",
  at: h.clock.now(),
  sessionId: h.state.session.sessionId,
  epoch: h.state.session.epoch,
  turnId,
  source,
  seq,
  payload,
});

// The smoke has no provider implementation. These tripwires make any accidental network use fatal.
let networkCalls = 0;
globalThis.fetch = (async () => { networkCalls += 1; throw new Error("network forbidden in relay smoke"); }) as typeof fetch;
Object.defineProperty(globalThis, "WebSocket", {
  configurable: true,
  value: class ForbiddenWebSocket {
    constructor() { networkCalls += 1; throw new Error("WebSocket forbidden in relay smoke"); }
  },
});

console.log("── deterministic relay protocol ──");
const h = new Harness();
const turnStartedAt = h.clock.now();

h.send({ kind: "turn.start", at: h.clock.now(), turnId: "turn-1" });
check("fake ears start the selected turn", h.ears.starts[0] === "turn-1");
h.send(frame(h, "turn-1", "ears", 1, { kind: "audio.observed", durationMs: 160 }));
h.clock.advance(100);
h.send(frame(h, "turn-1", "ears", 2, { kind: "transcript.partial", text: "Tell me" }));
h.send(frame(h, "turn-1", "ears", 3, { kind: "transcript.partial", text: "Tell me the status" }));
h.clock.advance(180);
h.send(frame(h, "turn-1", "ears", 4, { kind: "transcript.final", text: "Tell me the status." }));
check("partial -> final dispatches exactly one runtime turn", h.runtime.turns.length === 1 && h.runtime.turns[0]?.transcript === "Tell me the status.");

h.send(frame(h, "turn-1", "ears", 4, { kind: "transcript.final", text: "duplicate" }));
h.send(frame(h, "turn-1", "ears", 3, { kind: "transcript.final", text: "reordered" }));
const stale = { ...frame(h, "turn-1", "ears", 5, { kind: "transcript.final", text: "stale" }), epoch: "epoch-0" } as RelayEvent;
h.send(stale);
check("duplicate/reordered/stale frames are rejected", h.runtime.turns.length === 1 && h.state.rejections.length === 3);
const spoofEffects = h.send(frame(h, "turn-1", "ears", 5, { kind: "runtime.chunk", text: "spoofed" }));
check("a source cannot spoof another adapter's payload", spoofEffects[0]?.kind === "turn.rejected" && spoofEffects[0].reason === "source_payload_mismatch");
let effects = h.send({ kind: "turn.start", at: h.clock.now(), turnId: "overlap" });
check("an active turn cannot be silently replaced", effects[0]?.kind === "turn.rejected" && effects[0].reason === "active_turn");

h.clock.advance(420);
h.send(frame(h, "turn-1", "runtime", 1, { kind: "runtime.chunk", text: "Here is the first sentence. More" }));
const firstSpeechAt = h.mouth.speech[0]?.at ?? Infinity;
check("first sentence starts before full completion", h.mouth.speech[0]?.text === "Here is the first sentence." && !h.state.currentTurn?.runtimeDone);
check("virtual mic-to-first-speech latency stays under one second", firstSpeechAt - turnStartedAt < 1_000);
h.clock.advance(80);
h.send(frame(h, "turn-1", "runtime", 2, { kind: "runtime.done" }));
check("first audio predates runtime completion", firstSpeechAt < h.clock.now() && h.state.currentTurn?.runtimeDone === true);
check("runtime completion flushes the final non-sentence fragment", h.mouth.speech[1]?.text === "More");
const reusedTurnEffects = h.send({ kind: "turn.start", at: h.clock.now(), turnId: "turn-1" });
check("a completed turn ID cannot be reused", reusedTurnEffects[0]?.kind === "turn.rejected" && reusedTurnEffects[0].reason === "reused_turn");

const usageKinds = h.usage.events.map((event) => event.kind);
check("UsageSink receives neutral STT/LLM/TTS measurements",
  ["stt_audio_ms", "llm_turn", "tts_chars"].every((kind) => usageKinds.includes(kind)));
check("usage measurements carry session and turn identity",
  h.usage.events.every((event) => event.sessionId === "session-1" && event.turnId === "turn-1"));

const bargeAt = h.clock.advance(30);
const bargeEffects = h.send({ kind: "turn.interrupt", at: bargeAt, turnId: "turn-1" });
check("barge-in clears playback and cancels ears/runtime/mouth", bargeEffects.filter((effect) => effect.kind.endsWith(".cancel")).length === 3 && h.mouth.clears.at(-1) === bargeAt);
h.clock.advance(149);
h.send(frame(h, "turn-1", "mouth", 1, { kind: "audio.chunk", bytes: 64 }));
check("barge-in fences stale audio within 150ms", h.state.rejections.at(-1)?.reason === "interrupted_turn" && h.clock.now() - bargeAt <= 150);

h.send({ kind: "turn.start", at: h.clock.now(), turnId: "turn-2" });
h.send(frame(h, "turn-2", "ears", 1, { kind: "transcript.final", text: "Continue." }));
const turnsBeforeLate = h.runtime.turns.length;
h.send({ kind: "turn.interrupt", at: h.clock.now(), turnId: "turn-2" });
h.send(frame(h, "turn-2", "ears", 2, { kind: "transcript.final", text: "Continue." }));
check("final near interruption is neither lost nor doubled", h.runtime.turns.length === turnsBeforeLate && h.runtime.turns.filter((turn) => turn.turnId === "turn-2").length === 1);

const firstCancel = h.send({ kind: "session.cancel", at: h.clock.now(), reason: "owner_end" });
const secondCancel = h.send({ kind: "session.cancel", at: h.clock.now(), reason: "owner_end" });
check("cancel is idempotent across all adapters and local playback", firstCancel.length === 4 && secondCancel.length === 0);

effects = h.send({ kind: "session.reconnect", at: h.clock.now(), epoch: "epoch-1", ticketId: "ticket-1", ticketExpiresAt: 60_000 });
check("reconnect refuses reused epoch/ticket", effects[0]?.kind === "turn.rejected");
effects = h.send({ kind: "session.reconnect", at: h.clock.now(), epoch: "epoch-expired", ticketId: "ticket-expired", ticketExpiresAt: h.clock.now() });
check("reconnect refuses an expired relay ticket", effects[0]?.kind === "turn.rejected" && effects[0].reason === "expired_ticket");
h.send({ kind: "session.reconnect", at: h.clock.now(), epoch: "epoch-2", ticketId: "ticket-2", ticketExpiresAt: h.clock.now() + 60_000 });
check("reconnect requires a fresh epoch and ticket", h.state.session.epoch === "epoch-2" && h.state.session.ticketId === "ticket-2");
const oldEpochFrame = { ...frame(h, "none", "ears", 1, { kind: "transcript.partial", text: "old" }), epoch: "epoch-1" } as RelayEvent;
h.send(oldEpochFrame);
check("old epoch is fenced after reconnect", h.state.rejections.at(-1)?.reason === "stale_epoch");

h.send({ kind: "turn.start", at: h.clock.now(), turnId: "turn-3" });
h.send({ kind: "transport.failure", at: h.clock.now(), turnId: "turn-3", beforeDispatch: true });
check("pre-dispatch failure remains truthfully not dispatched", h.state.currentTurn?.dispatchTruth === "not_dispatched");
const reconnectEffects = h.send({ kind: "session.reconnect", at: h.clock.now(), epoch: "epoch-3", ticketId: "ticket-3", ticketExpiresAt: h.clock.now() + 60_000 });
check("reconnect cancels every active adapter and clears playback", reconnectEffects.filter((effect) => effect.kind.endsWith(".cancel")).length === 3 && reconnectEffects.some((effect) => effect.kind === "client.clear_playback"));
h.send({ kind: "turn.start", at: h.clock.now(), turnId: "turn-4" });
h.send({ kind: "transport.failure", at: h.clock.now(), turnId: "turn-4", beforeDispatch: false });
check("post-dispatch uncertainty remains ambiguous", h.state.currentTurn?.dispatchTruth === "ambiguous");

effects = h.send({ kind: "spoken.intent", at: h.clock.now(), turnId: "turn-4", text: "yes" });
const noExecutionInvariant = (candidate: Array<RelayEffect | { kind: "governance.execute" }>): boolean =>
  !candidate.some((effect) => effect.kind === "governance.execute");
check("spoken yes creates governed review and never executes an action", effects.some((effect) => effect.kind === "governance.review") && noExecutionInvariant(effects));
const mutated = effects.map((effect) => effect.kind === "governance.review" ? { kind: "governance.execute" as const } : effect);
check("load-bearing mutation is killed by the spoken-yes invariant", noExecutionInvariant(mutated) === false);

check("zero network/provider calls", networkCalls === 0);
console.log(`\n✅ paige-live-relay smoke: ${passed} assertions passed; virtual time=${h.clock.now()}ms; network/provider calls=${networkCalls}`);
