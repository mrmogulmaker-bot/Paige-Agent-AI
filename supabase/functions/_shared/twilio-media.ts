// _shared/twilio-media.ts — PURE parser for Twilio Media Stream WebSocket frames (#140 B1).
//
// Twilio sends a fixed sequence of JSON text frames over the Media Stream socket:
//   { event: "connected", protocol, version }
//   { event: "start", start: { streamSid, callSid, accountSid, tracks, customParameters, mediaFormat } }
//   { event: "media", media: { track, chunk, timestamp, payload: <base64 μ-law> } }   (repeated, ~20ms each)
//   { event: "mark",  mark: { name } }
//   { event: "stop",  stop: { accountSid, callSid } }
// Audio is 8 kHz mono μ-law (G.711), base64-encoded in media.payload (160 bytes / 20 ms frame).
//
// WHY PURE (§32): the paige-stt handler cannot be driven by a live Twilio call in CI, so the
// frame-shaping + μ-law/base64 decoding are factored OUT of the Deno.serve/upgradeWebSocket glue
// into these side-effect-free functions. scripts/voice-stt-smoke.mts imports them directly and
// asserts each frame type parses to the right shape and that the base64 payload decodes to the
// exact μ-law bytes — catching a "compiles but mis-parses the stream" defect before it ships.
// No Deno/Node globals beyond atob (present in both runtimes).

export interface TwilioStartData {
  streamSid: string;
  callSid: string;
  accountSid?: string;
  tracks?: string[];
  /** The <Parameter> values voice-twiml stamped into <Stream> (incl. our signed streamToken). */
  customParameters: Record<string, string>;
  mediaFormat?: { encoding?: string; sampleRate?: number; channels?: number };
}

export interface TwilioMediaData {
  track?: string;
  chunk?: string;
  timestamp?: string;
  /** base64-encoded μ-law audio. */
  payload: string;
}

export type TwilioFrame =
  | { event: "connected"; protocol?: string; version?: string }
  | { event: "start"; streamSid: string; start: TwilioStartData }
  | { event: "media"; streamSid: string; media: TwilioMediaData }
  | { event: "mark"; streamSid: string; name: string }
  | { event: "stop"; streamSid: string; callSid?: string }
  | { event: "unknown"; raw: unknown };

function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" ? (v as Record<string, unknown>) : {};
}
function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

/**
 * Parse one Twilio Media Stream frame (a JSON text message). Never throws — malformed or
 * unrecognized input resolves to `{ event: "unknown", raw }` so the caller degrades loudly
 * (§13/§32) instead of crashing the socket. `customParameters` is always an object (never
 * undefined) so the tenant/token lookup downstream is a plain property read.
 */
export function parseTwilioFrame(raw: string | ArrayBuffer | Uint8Array): TwilioFrame {
  let text: string;
  if (typeof raw === "string") text = raw;
  else if (raw instanceof Uint8Array) text = new TextDecoder().decode(raw);
  else text = new TextDecoder().decode(new Uint8Array(raw));

  let obj: unknown;
  try {
    obj = JSON.parse(text);
  } catch {
    return { event: "unknown", raw: text };
  }
  const o = asRecord(obj);
  const event = str(o.event);
  const streamSid = str(o.streamSid);

  switch (event) {
    case "connected":
      return { event: "connected", protocol: str(o.protocol), version: str(o.version) };
    case "start": {
      const s = asRecord(o.start);
      const cpRaw = asRecord(s.customParameters);
      const customParameters: Record<string, string> = {};
      for (const [k, v] of Object.entries(cpRaw)) customParameters[k] = str(v);
      const mf = asRecord(s.mediaFormat);
      return {
        event: "start",
        streamSid: streamSid || str(s.streamSid),
        start: {
          streamSid: str(s.streamSid) || streamSid,
          callSid: str(s.callSid),
          accountSid: str(s.accountSid),
          tracks: Array.isArray(s.tracks) ? (s.tracks as unknown[]).map(str) : undefined,
          customParameters,
          mediaFormat: {
            encoding: str(mf.encoding) || undefined,
            sampleRate: typeof mf.sampleRate === "number" ? mf.sampleRate : undefined,
            channels: typeof mf.channels === "number" ? mf.channels : undefined,
          },
        },
      };
    }
    case "media": {
      const m = asRecord(o.media);
      return {
        event: "media",
        streamSid,
        media: {
          track: str(m.track) || undefined,
          chunk: str(m.chunk) || undefined,
          timestamp: str(m.timestamp) || undefined,
          payload: str(m.payload),
        },
      };
    }
    case "mark": {
      const mk = asRecord(o.mark);
      return { event: "mark", streamSid, name: str(mk.name) };
    }
    case "stop": {
      const st = asRecord(o.stop);
      return { event: "stop", streamSid, callSid: str(st.callSid) || undefined };
    }
    default:
      return { event: "unknown", raw: obj };
  }
}

/**
 * Decode a Twilio media payload (base64 μ-law) to the raw μ-law bytes Deepgram expects on the
 * wire (encoding=mulaw). Returns an empty Uint8Array on malformed base64 (never throws) so one
 * bad frame can't kill the stream. Deepgram wants the RAW μ-law bytes as a binary WS message —
 * we do NOT transcode to PCM; encoding=mulaw&sample_rate=8000 tells Deepgram to decode it.
 */
export function decodeMediaPayload(payloadB64: string): Uint8Array {
  if (!payloadB64) return new Uint8Array(0);
  try {
    const bin = atob(payloadB64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes;
  } catch {
    return new Uint8Array(0);
  }
}

/** Each Twilio μ-law frame is 20 ms of 8 kHz audio (160 bytes). Used to meter streamed minutes
 *  by frame count (§17) — more accurate than wall-clock, which would include pre-bridge ring time. */
export const TWILIO_MEDIA_FRAME_MS = 20;
