// _shared/stt-router.ts — Paige STT Router (#140 B1). The ONE home for speech-to-text (§18/§34).
//
// Mirrors the model-router ROUTE_TABLE pattern: a keyed table of cells, a pure route-picker, and
// an honest needs_config degrade when the provider is unconfigured — NEVER a wrong-provider
// substitution. §34: Deepgram is a routable STT commodity BEHIND our router; Paige owns the
// orchestration. There is exactly one Deepgram client on the platform, and it lives here — no
// second Deepgram connection anywhere else.
//
// Deepgram Nova-3 streaming STT is a WebSocket:
//   wss://api.deepgram.com/v1/listen?model=nova-3&encoding=mulaw&sample_rate=8000&channels=1&…
// Twilio Media Stream audio is 8 kHz mono μ-law, so encoding=mulaw&sample_rate=8000&channels=1
// hands Deepgram exactly what it needs — no transcoding. Auth: Deno's WebSocket cannot set
// headers, so we use Deepgram's `token` subprotocol — new WebSocket(url, ["token", <API_KEY>]) —
// the documented browser/edge auth path. The key is read HERE via envKey (case-insensitive, §12)
// and NEVER logged or returned.
//
// PURE where it can be (§32): the route-picker, the URL builder, and the config check are pure/
// key-free and unit-smoked in scripts/voice-stt-smoke.mts. Only openDeepgramSocket() touches the
// key + a live socket (can't be exercised headless — owed to a deployed call, §13).

import { envKey } from "./env-key.ts";

/** STT tiers. One real tier today (Deepgram Nova-3 realtime); the table is a Partial<Record> so
 *  a second tier (e.g. a batch/whisper lane) is an ADD, never a fork (§18). A missing cell ⇒
 *  needs_config, exactly like the model-router. */
export type SttTier = "nova-realtime";

export interface SttRouteCell {
  provider: string; // provider slug (audit + honest reporting)
  model: string; // default model id for this cell
  justification: string; // one-line rationale (§11/§13), auditable in code
  host: string; // the wss listen host
}

// The STT route table. Every cell carries its own justification so the choice is auditable in
// code (mirrors model-router's ROUTE_TABLE). A missing cell resolves to a clean needs_config in
// planSttStream — never a silent wrong-provider substitution.
const STT_ROUTE_TABLE: Partial<Record<SttTier, SttRouteCell>> = {
  "nova-realtime": {
    provider: "deepgram",
    model: "nova-3",
    justification:
      "Deepgram Nova-3 streaming STT — lowest-latency real-time transcription for the live-call co-pilot; the routable STT commodity behind Paige's router (§34), never a second client.",
    host: "wss://api.deepgram.com/v1/listen",
  },
};

/** Pure route-picker. Returns the cell for a tier, or undefined (⇒ needs_config downstream). */
export function resolveSttRoute(tier: SttTier = "nova-realtime"): SttRouteCell | undefined {
  return STT_ROUTE_TABLE[tier];
}

/** Streaming parameters. Defaults match Twilio Media Stream audio (8 kHz mono μ-law). */
export interface DeepgramStreamOpts {
  encoding?: string; // default "mulaw"
  sampleRate?: number; // default 8000
  channels?: number; // default 1
  model?: string; // override the cell default
  interimResults?: boolean; // default true (partial transcripts for the live panel)
  punctuate?: boolean; // default true
  smartFormat?: boolean; // default true
  language?: string; // default "en-US"
  /** Deepgram endpointing (ms of silence to finalize an utterance). Omitted when undefined. */
  endpointing?: number;
}

/** PURE builder for the Deepgram Nova-3 streaming URL from a cell + Twilio-shaped defaults. */
export function buildDeepgramStreamUrl(cell: SttRouteCell, opts: DeepgramStreamOpts = {}): string {
  const p = new URLSearchParams();
  p.set("model", opts.model ?? cell.model);
  p.set("encoding", opts.encoding ?? "mulaw");
  p.set("sample_rate", String(opts.sampleRate ?? 8000));
  p.set("channels", String(opts.channels ?? 1));
  p.set("punctuate", String(opts.punctuate ?? true));
  p.set("interim_results", String(opts.interimResults ?? true));
  p.set("smart_format", String(opts.smartFormat ?? true));
  p.set("language", opts.language ?? "en-US");
  if (opts.endpointing !== undefined) p.set("endpointing", String(opts.endpointing));
  return `${cell.host}?${p.toString()}`;
}

/** DEEPGRAM_API_KEY presence (case-insensitive, §12). Never returns/logs the value. */
export function sttConfigured(): boolean {
  return Boolean(envKey("DEEPGRAM_API_KEY"));
}

/** The plan a caller acts on: a ready wss URL (key present) or an HONEST needs_config degrade. */
export type SttStreamPlan =
  | { ok: true; url: string; provider: string; model: string }
  | { ok: false; needs_config: true; provider: "unconfigured" }
  | { ok: false; error: string };

/**
 * Resolve the streaming plan for a tier WITHOUT opening a socket (so it's unit-testable). No cell
 * ⇒ a typed error; a cell but no key ⇒ needs_config (the SAME honest shape a missing model-router
 * cell produces). The URL is built but the key is NOT included in the result — the opener reads
 * the key itself so a plan object can be logged safely (§13).
 */
export function planSttStream(tier: SttTier = "nova-realtime", opts: DeepgramStreamOpts = {}): SttStreamPlan {
  const cell = resolveSttRoute(tier);
  if (!cell) return { ok: false, error: `stt_route_unconfigured_tier:${tier}` };
  if (!sttConfigured()) return { ok: false, needs_config: true, provider: "unconfigured" };
  return { ok: true, url: buildDeepgramStreamUrl(cell, opts), provider: cell.provider, model: opts.model ?? cell.model };
}

/**
 * Open the Deepgram streaming socket for a resolved plan URL. Reads DEEPGRAM_API_KEY HERE and
 * authenticates via the `token` subprotocol (Deno WebSocket can't set an Authorization header).
 * Returns null when the key is absent (honest degrade — the caller closes the Twilio socket and
 * never fabricates a transcript stream, §13). The key is used ONLY as the subprotocol credential
 * and is never logged. This is the ONLY function in the codebase that opens a Deepgram connection.
 */
export function openDeepgramSocket(url: string): WebSocket | null {
  const key = envKey("DEEPGRAM_API_KEY");
  if (!key) return null;
  // Deepgram's documented token-subprotocol auth: ["token", "<DEEPGRAM_API_KEY>"].
  return new WebSocket(url, ["token", key]);
}

/** Shape of a Deepgram streaming `Results` message (the fields we consume for B1). */
export interface DeepgramTranscriptResult {
  transcript: string;
  isFinal: boolean;
  speechFinal: boolean;
  confidence?: number;
  start?: number;
  duration?: number;
}

/**
 * PURE extractor: pull the transcript + finality from a Deepgram streaming message. Deepgram
 * sends { type:"Results", is_final, speech_final, channel:{ alternatives:[{ transcript, confidence }] } }
 * plus non-transcript control messages (Metadata, UtteranceEnd, SpeechStarted). Returns null for
 * a control message or an empty transcript so the caller only broadcasts real words (§13).
 */
export function extractDeepgramTranscript(raw: string | ArrayBuffer | Uint8Array): DeepgramTranscriptResult | null {
  let text: string;
  if (typeof raw === "string") text = raw;
  else if (raw instanceof Uint8Array) text = new TextDecoder().decode(raw);
  else text = new TextDecoder().decode(new Uint8Array(raw));

  let obj: Record<string, unknown>;
  try {
    obj = JSON.parse(text) as Record<string, unknown>;
  } catch {
    return null;
  }
  if (obj.type && obj.type !== "Results") return null; // Metadata / UtteranceEnd / SpeechStarted
  const channel = (obj.channel ?? {}) as Record<string, unknown>;
  const alts = (channel.alternatives ?? []) as Array<Record<string, unknown>>;
  const first = alts[0] ?? {};
  const transcript = typeof first.transcript === "string" ? first.transcript : "";
  if (!transcript) return null;
  return {
    transcript,
    isFinal: Boolean(obj.is_final),
    speechFinal: Boolean(obj.speech_final),
    confidence: typeof first.confidence === "number" ? first.confidence : undefined,
    start: typeof obj.start === "number" ? obj.start : undefined,
    duration: typeof obj.duration === "number" ? obj.duration : undefined,
  };
}
