/** The Paige-owned surface is enabled. Provider-backed audio has its own server gate. */
export const PAIGE_LIVE_CONVERSATION_ENABLED = true as const;

export type TruthfulAvailability = "LIVE" | "PARTIAL" | "UNAVAILABLE" | "PROOF OWED";

export type LiveConversationScope = Readonly<{
  threadId: string;
  tenantId: string;
  workspaceId: string;
  contextEpoch: string;
}>;

type CardSource = Readonly<{
  availability: TruthfulAvailability;
  canonicalRef?: string;
  provenanceLabel?: string;
}>;

type BaseCard = Readonly<{
  id: string;
  title: string;
  source: CardSource;
  body?: string;
}>;

export type LiveConversationCard =
  | (BaseCard & { kind: "question"; answerMode?: "spoken-or-text" | "selection"; placeholder?: string })
  | (BaseCard & {
      kind: "choice";
      choices: ReadonlyArray<Readonly<{ id: string; label: string }>>;
    })
  | (BaseCard & {
      kind: "plan";
      recordType: "strategic-play" | "mission" | "campaign-brief" | "canonical-plan";
      statusLabel?: string;
    })
  | (BaseCard & { kind: "evidence-result"; receiptRef?: string; resultLabel?: string })
  | (BaseCard & {
      kind: "governed-action";
      action: Readonly<{
        toolName: string;
        authorityStatus:
          | "unavailable"
          | "denied"
          | "confirmation-required"
          | "authorized"
          | "executing"
          | "verified"
          | "failed";
        receiptRef?: string;
        railEvidenceRef?: string;
        scopeSummary?: string;
        /** Exact server-issued confirmation identities for this displayed action. */
        confirmationFingerprints?: ReadonlyArray<string>;
      }>;
    })
  | (BaseCard & {
      kind: "recap";
      points: ReadonlyArray<Readonly<{ id: string; text: string; ownerConfirmed: boolean }>>;
    });

const CARD_LIMITS = { id: 128, title: 240, body: 4000, label: 500, ref: 512 } as const;
const stringWithin = (value: unknown, max: number, required = true): value is string =>
  typeof value === "string" && value.length <= max && (!required || value.trim().length > 0);
const optionalString = (value: unknown, max: number) => value === undefined || stringWithin(value, max, false);
const availabilityValues = new Set<TruthfulAvailability>(["LIVE", "PARTIAL", "UNAVAILABLE", "PROOF OWED"]);

/** Runtime fail-closed boundary for presentation frames emitted by Paige. */
export function parseLiveConversationCard(value: unknown): LiveConversationCard | null {
  if (!value || typeof value !== "object") return null;
  const card = value as Record<string, unknown>;
  const source = card.source as Record<string, unknown> | undefined;
  if (!stringWithin(card.id, CARD_LIMITS.id) || !stringWithin(card.title, CARD_LIMITS.title)
    || !optionalString(card.body, CARD_LIMITS.body) || !source
    || !availabilityValues.has(source.availability as TruthfulAvailability)
    || !optionalString(source.canonicalRef, CARD_LIMITS.ref)
    || !optionalString(source.provenanceLabel, CARD_LIMITS.label)) return null;
  const base = card as unknown as LiveConversationCard;
  switch (card.kind) {
    case "question":
      return (card.answerMode === undefined || card.answerMode === "spoken-or-text" || card.answerMode === "selection")
        && optionalString(card.placeholder, CARD_LIMITS.label) ? base : null;
    case "choice": {
      const choices = card.choices;
      if (!Array.isArray(choices) || choices.length < 2 || choices.length > 4) return null;
      return choices.every((choice) => choice && typeof choice === "object"
        && stringWithin((choice as Record<string, unknown>).id, CARD_LIMITS.id)
        && stringWithin((choice as Record<string, unknown>).label, CARD_LIMITS.label)) ? base : null;
    }
    case "plan":
      return new Set(["strategic-play", "mission", "campaign-brief", "canonical-plan"]).has(String(card.recordType))
        && optionalString(card.statusLabel, CARD_LIMITS.label) ? base : null;
    case "evidence-result":
      return optionalString(card.receiptRef, CARD_LIMITS.ref) && optionalString(card.resultLabel, CARD_LIMITS.label) ? base : null;
    case "governed-action": {
      const action = card.action as Record<string, unknown> | undefined;
      const statuses = new Set(["unavailable", "denied", "confirmation-required", "authorized", "executing", "verified", "failed"]);
      if (!action || !stringWithin(action.toolName, CARD_LIMITS.label) || !statuses.has(String(action.authorityStatus))
        || !optionalString(action.receiptRef, CARD_LIMITS.ref) || !optionalString(action.railEvidenceRef, CARD_LIMITS.ref)
        || !optionalString(action.scopeSummary, CARD_LIMITS.body)) return null;
      const fingerprints = action.confirmationFingerprints;
      return (fingerprints === undefined || (Array.isArray(fingerprints) && fingerprints.length > 0 && fingerprints.length <= 20
        && fingerprints.every((fingerprint) => stringWithin(fingerprint, CARD_LIMITS.ref)))) ? base : null;
    }
    case "recap": {
      const points = card.points;
      if (!Array.isArray(points) || points.length < 1 || points.length > 20) return null;
      return points.every((point) => point && typeof point === "object"
        && stringWithin((point as Record<string, unknown>).id, CARD_LIMITS.id)
        && stringWithin((point as Record<string, unknown>).text, CARD_LIMITS.body)
        && typeof (point as Record<string, unknown>).ownerConfirmed === "boolean") ? base : null;
    }
    default:
      return null;
  }
}

export type LiveConversationPhase =
  | "requesting-permission"
  | "permission-denied"
  | "connecting"
  | "listening"
  | "thinking"
  | "waiting"
  | "speaking"
  | "interrupted"
  | "held"
  | "reconnecting"
  | "ended";

export type LiveConversationState = Readonly<{
  scope: LiveConversationScope;
  phase: LiveConversationPhase;
  muted: boolean;
  minimized: boolean;
  providerSessionRef: string | null;
  activeCard: LiveConversationCard | null;
  priorCardRefs: ReadonlyArray<Readonly<{ id: string; kind: LiveConversationCard["kind"] }>>;
  failure: Readonly<{ code: string; retryable: boolean }> | null;
}>;

export type LiveConversationEvent =
  | { type: "permission-granted" }
  | { type: "permission-denied" }
  | { type: "provider-connected"; providerSessionRef: string }
  | { type: "paige-thinking" }
  | { type: "paige-waiting" }
  | { type: "paige-speaking" }
  | { type: "owner-interrupted" }
  | { type: "mute-changed"; muted: boolean }
  | { type: "hold" }
  | { type: "resume" }
  | { type: "minimize-changed"; minimized: boolean }
  | { type: "disconnected" }
  | { type: "retry" }
  | { type: "end" }
  | { type: "present-card"; card: LiveConversationCard }
  | { type: "dismiss-card" }
  | { type: "scope-changed"; scope: LiveConversationScope };

export function createInitialLiveConversationState(
  scope: LiveConversationScope,
): LiveConversationState {
  return {
    scope,
    phase: "requesting-permission",
    muted: false,
    minimized: false,
    providerSessionRef: null,
    activeCard: null,
    priorCardRefs: [],
    failure: null,
  };
}

function archiveActiveCard(state: LiveConversationState) {
  return state.activeCard
    ? [...state.priorCardRefs, { id: state.activeCard.id, kind: state.activeCard.kind }]
    : state.priorCardRefs;
}

export function reduceLiveConversation(
  state: LiveConversationState,
  event: LiveConversationEvent,
): LiveConversationState {
  switch (event.type) {
    case "permission-granted":
      return { ...state, phase: "connecting", failure: null };
    case "permission-denied":
      return {
        ...state,
        phase: "permission-denied",
        providerSessionRef: null,
        failure: { code: "microphone_permission_denied", retryable: true },
      };
    case "provider-connected":
      return { ...state, phase: "listening", providerSessionRef: event.providerSessionRef, failure: null };
    case "paige-thinking":
      return { ...state, phase: "thinking" };
    case "paige-waiting":
      return { ...state, phase: "waiting" };
    case "paige-speaking":
      return { ...state, phase: "speaking" };
    case "owner-interrupted":
      return { ...state, phase: "interrupted" };
    case "mute-changed":
      return { ...state, muted: event.muted };
    case "hold":
      return { ...state, phase: "held" };
    case "resume":
      return { ...state, phase: state.providerSessionRef ? "listening" : "reconnecting" };
    case "minimize-changed":
      return { ...state, minimized: event.minimized };
    case "disconnected":
      return {
        ...state,
        phase: "reconnecting",
        providerSessionRef: null,
        failure: { code: "provider_disconnected", retryable: true },
      };
    case "retry":
      return { ...state, phase: "connecting", providerSessionRef: null, failure: null };
    case "end":
      return { ...state, phase: "ended", providerSessionRef: null, muted: false };
    case "present-card":
      return { ...state, priorCardRefs: archiveActiveCard(state), activeCard: event.card };
    case "dismiss-card":
      return { ...state, priorCardRefs: archiveActiveCard(state), activeCard: null };
    case "scope-changed":
      return {
        ...createInitialLiveConversationState(event.scope),
        phase: "ended",
      };
  }
}

export type SpokenCardIntent =
  | Readonly<{ kind: "conversational-selection"; cardId: string; choiceId: string }>
  | Readonly<{ kind: "conversational-answer"; cardId: string; answer: string }>
  | Readonly<{ kind: "governed-review-required"; cardId: string; toolName: string }>
  | Readonly<{ kind: "no-selection"; cardId: string }>;

function spokenChoiceIndex(utterance: string): number | null {
  const normalized = utterance.trim().toLowerCase();
  const words: Record<string, number> = { one: 0, first: 0, two: 1, second: 1, three: 2, third: 2, four: 3, fourth: 3 };
  for (const [word, index] of Object.entries(words)) {
    if (new RegExp(`(?:option|choice)?\\s*${word}\\b`).test(normalized)) return index;
  }
  const digit = normalized.match(/(?:option|choice)?\s*([1-4])\b/);
  return digit ? Number(digit[1]) - 1 : null;
}

export function resolveSpokenCardIntent(
  card: LiveConversationCard,
  utterance: string,
): SpokenCardIntent {
  if (card.kind === "governed-action") {
    return { kind: "governed-review-required", cardId: card.id, toolName: card.action.toolName };
  }
  if (card.kind === "choice") {
    const index = spokenChoiceIndex(utterance);
    const choice = index === null ? undefined : card.choices[index];
    return choice
      ? { kind: "conversational-selection", cardId: card.id, choiceId: choice.id }
      : { kind: "no-selection", cardId: card.id };
  }
  if (card.kind === "question" && utterance.trim()) {
    return { kind: "conversational-answer", cardId: card.id, answer: utterance.trim() };
  }
  return { kind: "no-selection", cardId: card.id };
}

/**
 * A provider transports audio only. It never receives tenant authority, raw tool
 * credentials, a mutation callback, or ownership of Paige conversation state.
 */
export interface PaigeVoiceIoAdapter {
  connect(input: Readonly<{
    shortLivedSessionToken: string;
    providerSessionRef: string;
    signal: AbortSignal;
  }>): Promise<void>;
  sendMicrophoneChunk(chunk: ArrayBuffer): void;
  speakTextChunk(text: string, options?: Readonly<{ flush?: boolean }>): void;
  interruptPlayback(): void;
  close(): Promise<void>;
}
