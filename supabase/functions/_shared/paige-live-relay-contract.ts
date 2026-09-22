/**
 * Pure, provider-neutral protocol for Paige Live Conversation.
 *
 * This file opens no socket, calls no provider, and owns
 * no reasoning or mutation path. A future server relay may interpret its effects
 * through adapters. It intentionally has zero deployed importers in this slice.
 */

export type UsageEvent =
  | { kind: "stt_audio_ms"; sessionId: string; turnId: string; units: number }
  | { kind: "llm_turn"; sessionId: string; turnId: string; units: 1 }
  | { kind: "tts_chars"; sessionId: string; turnId: string; units: number };

/** The only measurement seam: neutral observed units with session/turn identity. */
export interface UsageSink {
  emit(event: UsageEvent): void | Promise<void>;
}

export interface EarsAdapter {
  start(turnId: string): void | Promise<void>;
  cancel(turnId: string): void | Promise<void>;
}

export interface RuntimeAdapter {
  dispatch(turnId: string, transcript: string): void | Promise<void>;
  cancel(turnId: string): void | Promise<void>;
}

export interface MouthAdapter {
  synthesize(turnId: string, text: string): void | Promise<void>;
  cancel(turnId: string): void | Promise<void>;
  clearPlayback(): void | Promise<void>;
}

export interface RelaySessionIdentity {
  sessionId: string;
  epoch: string;
  ticketId: string;
  ticketExpiresAt: number;
}

export type RelayFramePayload =
  | { kind: "audio.observed"; durationMs: number }
  | { kind: "transcript.partial"; text: string }
  | { kind: "transcript.final"; text: string }
  | { kind: "runtime.chunk"; text: string }
  | { kind: "runtime.done" }
  | { kind: "audio.chunk"; bytes: number };

export interface RelayFrame {
  kind: "frame";
  at: number;
  sessionId: string;
  epoch: string;
  turnId: string;
  source: "ears" | "runtime" | "mouth";
  seq: number;
  payload: RelayFramePayload;
}

export type RelayEvent =
  | RelayFrame
  | { kind: "turn.start"; at: number; turnId: string }
  | { kind: "turn.interrupt"; at: number; turnId: string }
  | { kind: "session.cancel"; at: number; reason: string }
  | { kind: "session.reconnect"; at: number; epoch: string; ticketId: string; ticketExpiresAt: number }
  | { kind: "transport.failure"; at: number; turnId: string; beforeDispatch: boolean }
  | { kind: "spoken.intent"; at: number; turnId: string; text: string };

export type RelayRejectionReason =
  | "active_turn"
  | "cancelled_session"
  | "duplicate_or_reordered"
  | "expired_ticket"
  | "interrupted_turn"
  | "invalid_units"
  | "missing_turn"
  | "reused_epoch_or_ticket"
  | "reused_turn"
  | "source_payload_mismatch"
  | "stale_epoch"
  | "stale_session"
  | "stale_turn";

export type RelayEffect =
  | { kind: "ears.start"; turnId: string }
  | { kind: "ears.cancel"; turnId: string }
  | { kind: "runtime.dispatch"; turnId: string; transcript: string }
  | { kind: "runtime.cancel"; turnId: string }
  | { kind: "mouth.synthesize"; turnId: string; text: string }
  | { kind: "mouth.cancel"; turnId: string }
  | { kind: "client.clear_playback"; turnId: string }
  | { kind: "usage.emit"; event: UsageEvent }
  | { kind: "governance.review"; turnId: string; transcript: string }
  | { kind: "turn.rejected"; turnId: string | null; reason: RelayRejectionReason };

export interface RelayTurnState {
  id: string;
  partialTranscript: string;
  finalTranscript: string | null;
  runtimeText: string;
  emittedCharacterCount: number;
  runtimeDone: boolean;
  interrupted: boolean;
  dispatchTruth: "not_dispatched" | "dispatched" | "ambiguous";
  sequence: Record<"ears" | "runtime" | "mouth", number>;
}

export interface RelayRejection {
  at: number;
  turnId: string | null;
  reason: RelayRejectionReason;
}

export interface RelayState {
  session: RelaySessionIdentity;
  usedTicketIds: string[];
  usedEpochs: string[];
  usedTurnIds: string[];
  phase: "idle" | "listening" | "thinking" | "speaking" | "interrupted" | "cancelled";
  currentTurn: RelayTurnState | null;
  cancelled: boolean;
  rejections: RelayRejection[];
}

export interface RelayTransition {
  state: RelayState;
  effects: RelayEffect[];
}

export function createRelayState(session: RelaySessionIdentity): RelayState {
  return {
    session: { ...session },
    usedTicketIds: [session.ticketId],
    usedEpochs: [session.epoch],
    usedTurnIds: [],
    phase: "idle",
    currentTurn: null,
    cancelled: false,
    rejections: [],
  };
}

function copyState(state: RelayState): RelayState {
  return {
    ...state,
    session: { ...state.session },
    usedTicketIds: [...state.usedTicketIds],
    usedEpochs: [...state.usedEpochs],
    usedTurnIds: [...state.usedTurnIds],
    currentTurn: state.currentTurn ? { ...state.currentTurn, sequence: { ...state.currentTurn.sequence } } : null,
    rejections: [...state.rejections],
  };
}

function reject(state: RelayState, at: number, turnId: string | null, reason: RelayRejectionReason): RelayTransition {
  state.rejections.push({ at, turnId, reason });
  return { state, effects: [{ kind: "turn.rejected", turnId, reason }] };
}

function validateFrame(state: RelayState, event: RelayFrame): RelayRejectionReason | null {
  if (event.sessionId !== state.session.sessionId) return "stale_session";
  if (event.epoch !== state.session.epoch) return "stale_epoch";
  if (!state.currentTurn) return "missing_turn";
  if (event.turnId !== state.currentTurn.id) return "stale_turn";
  if (state.currentTurn.interrupted) return "interrupted_turn";
  if (event.seq !== state.currentTurn.sequence[event.source] + 1) return "duplicate_or_reordered";
  const sourceMatches =
    (event.source === "ears" && ["audio.observed", "transcript.partial", "transcript.final"].includes(event.payload.kind)) ||
    (event.source === "runtime" && ["runtime.chunk", "runtime.done"].includes(event.payload.kind)) ||
    (event.source === "mouth" && event.payload.kind === "audio.chunk");
  if (!sourceMatches) return "source_payload_mismatch";
  return null;
}

function firstUnemittedSentence(turn: RelayTurnState): { text: string; consumed: number } | null {
  const remaining = turn.runtimeText.slice(turn.emittedCharacterCount);
  const match = /^([\s\S]*?[.!?])(?:\s|$)/.exec(remaining);
  const raw = match?.[1];
  if (!raw?.trim()) return null;
  let consumed = raw.length;
  while (/\s/.test(remaining.charAt(consumed))) consumed += 1;
  return { text: raw.trim(), consumed };
}

export function reduceRelay(previous: RelayState, event: RelayEvent): RelayTransition {
  const state = copyState(previous);
  const effects: RelayEffect[] = [];

  if (event.kind === "session.reconnect") {
    if (state.usedTicketIds.includes(event.ticketId) || state.usedEpochs.includes(event.epoch)) {
      return reject(state, event.at, null, "reused_epoch_or_ticket");
    }
    if (event.at >= event.ticketExpiresAt) return reject(state, event.at, null, "expired_ticket");
    if (state.currentTurn && !state.currentTurn.interrupted) {
      const turnId = state.currentTurn.id;
      state.currentTurn.interrupted = true;
      effects.push(
        { kind: "ears.cancel", turnId },
        { kind: "runtime.cancel", turnId },
        { kind: "mouth.cancel", turnId },
        { kind: "client.clear_playback", turnId },
      );
    }
    state.session = { ...state.session, epoch: event.epoch, ticketId: event.ticketId, ticketExpiresAt: event.ticketExpiresAt };
    state.usedTicketIds.push(event.ticketId);
    state.usedEpochs.push(event.epoch);
    state.currentTurn = null;
    state.phase = "idle";
    state.cancelled = false;
    return { state, effects };
  }

  if (event.kind === "session.cancel") {
    if (state.cancelled) return { state, effects };
    state.cancelled = true;
    state.phase = "cancelled";
    if (state.currentTurn) {
      const turnId = state.currentTurn.id;
      state.currentTurn.interrupted = true;
      effects.push(
        { kind: "ears.cancel", turnId },
        { kind: "runtime.cancel", turnId },
        { kind: "mouth.cancel", turnId },
        { kind: "client.clear_playback", turnId },
      );
    }
    return { state, effects };
  }

  if (event.kind === "turn.start") {
    if (state.cancelled) return reject(state, event.at, event.turnId, "cancelled_session");
    if (state.usedTurnIds.includes(event.turnId)) return reject(state, event.at, event.turnId, "reused_turn");
    if (state.currentTurn && !state.currentTurn.interrupted && !state.currentTurn.runtimeDone) {
      return reject(state, event.at, event.turnId, "active_turn");
    }
    state.currentTurn = {
      id: event.turnId,
      partialTranscript: "",
      finalTranscript: null,
      runtimeText: "",
      emittedCharacterCount: 0,
      runtimeDone: false,
      interrupted: false,
      dispatchTruth: "not_dispatched",
      sequence: { ears: 0, runtime: 0, mouth: 0 },
    };
    state.usedTurnIds.push(event.turnId);
    state.phase = "listening";
    effects.push({ kind: "ears.start", turnId: event.turnId });
    return { state, effects };
  }

  if (event.kind === "turn.interrupt") {
    if (!state.currentTurn || state.currentTurn.id !== event.turnId) return reject(state, event.at, event.turnId, "stale_turn");
    if (state.currentTurn.interrupted) return { state, effects };
    state.currentTurn.interrupted = true;
    state.phase = "interrupted";
    effects.push(
      { kind: "ears.cancel", turnId: event.turnId },
      { kind: "runtime.cancel", turnId: event.turnId },
      { kind: "mouth.cancel", turnId: event.turnId },
      { kind: "client.clear_playback", turnId: event.turnId },
    );
    return { state, effects };
  }

  if (event.kind === "transport.failure") {
    if (!state.currentTurn || state.currentTurn.id !== event.turnId) return reject(state, event.at, event.turnId, "stale_turn");
    state.currentTurn.dispatchTruth = event.beforeDispatch ? "not_dispatched" : "ambiguous";
    return { state, effects };
  }

  if (event.kind === "spoken.intent") {
    // Speech is input, never authority. Affirmation enters the existing governed
    // review path; this protocol intentionally has no execute effect.
    if (state.cancelled) return reject(state, event.at, event.turnId, "cancelled_session");
    if (!state.currentTurn || state.currentTurn.id !== event.turnId) return reject(state, event.at, event.turnId, "stale_turn");
    if (state.currentTurn.interrupted) return reject(state, event.at, event.turnId, "interrupted_turn");
    effects.push({ kind: "governance.review", turnId: event.turnId, transcript: event.text });
    return { state, effects };
  }

  const invalid = validateFrame(state, event);
  if (invalid) return reject(state, event.at, event.turnId, invalid);
  const turn = state.currentTurn as RelayTurnState;
  turn.sequence[event.source] = event.seq;

  switch (event.payload.kind) {
    case "audio.observed":
      if (!Number.isSafeInteger(event.payload.durationMs) || event.payload.durationMs <= 0) {
        return reject(state, event.at, event.turnId, "invalid_units");
      }
      effects.push({ kind: "usage.emit", event: { kind: "stt_audio_ms", sessionId: state.session.sessionId, turnId: turn.id, units: event.payload.durationMs } });
      break;
    case "transcript.partial":
      turn.partialTranscript = event.payload.text;
      break;
    case "transcript.final":
      if (turn.finalTranscript !== null) return reject(state, event.at, event.turnId, "duplicate_or_reordered");
      turn.finalTranscript = event.payload.text;
      turn.partialTranscript = "";
      turn.dispatchTruth = "dispatched";
      state.phase = "thinking";
      effects.push(
        { kind: "usage.emit", event: { kind: "llm_turn", sessionId: state.session.sessionId, turnId: turn.id, units: 1 } },
        { kind: "runtime.dispatch", turnId: turn.id, transcript: event.payload.text },
      );
      break;
    case "runtime.chunk": {
      turn.runtimeText += event.payload.text;
      for (let sentence = firstUnemittedSentence(turn); sentence; sentence = firstUnemittedSentence(turn)) {
        turn.emittedCharacterCount += sentence.consumed;
        state.phase = "speaking";
        effects.push(
          { kind: "usage.emit", event: { kind: "tts_chars", sessionId: state.session.sessionId, turnId: turn.id, units: sentence.text.length } },
          { kind: "mouth.synthesize", turnId: turn.id, text: sentence.text },
        );
      }
      break;
    }
    case "runtime.done": {
      turn.runtimeDone = true;
      const remainder = turn.runtimeText.slice(turn.emittedCharacterCount).trim();
      if (remainder) {
        turn.emittedCharacterCount = turn.runtimeText.length;
        state.phase = "speaking";
        effects.push(
          { kind: "usage.emit", event: { kind: "tts_chars", sessionId: state.session.sessionId, turnId: turn.id, units: remainder.length } },
          { kind: "mouth.synthesize", turnId: turn.id, text: remainder },
        );
      }
      break;
    }
    case "audio.chunk":
      state.phase = "speaking";
      break;
  }

  return { state, effects };
}
