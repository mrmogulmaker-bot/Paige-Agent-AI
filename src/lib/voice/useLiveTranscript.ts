// #140 B2 — live-call transcript subscriber.
//
// paige-stt (B1) broadcasts each Deepgram result SERVER-SIDE onto the per-tenant,
// per-call topic `voice-stt:<tenantId>:<callSid>`, event "transcript", with payload
//   { call_sid, stream_sid, transcript, is_final, speech_final, confidence, at }.
// This hook subscribes to that topic as a PRIVATE channel and turns the frame stream
// into render-ready lines. It only RECEIVES — clients never broadcast the transcript.
//
// DOCTRINE
//  §9 / #557  Subscribed as a PRIVATE channel (config.private = true) — the EXACT
//     precedent at src/hooks/useRailEvents.ts:136. A private channel is authorized by
//     RLS on realtime.messages (the 20260730120000_voice_stt_realtime_topic_rls.sql
//     policy), so a tenant can ONLY join voice-stt:<theirOwnTenant>:<callSid>. The
//     topic string alone grants nothing; the DB is the wall.
//  §13  Honest state, never a fabricated stream. `state` reflects what's actually
//     happening — listening (subscribed, nothing yet), live (frames flowing),
//     reconnecting (transport dropped). A malformed frame is dropped, never crashes.
//  §22  Deepgram sends INTERIM results (is_final=false) that refine in place, then a
//     FINAL (is_final=true). Interim replaces a single in-progress slot; a final is
//     appended as a committed line — the panel animates only the committed lines.
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/** One rendered transcript line. */
export interface TranscriptLine {
  /** Stable de-dupe key. Finals carry `${at}#${index}`; the interim slot is "interim". */
  key: string;
  text: string;
  /** True once Deepgram committed the segment (appended); false while in progress. */
  isFinal: boolean;
  /**
   * "You" / "Client" when the payload carries a diarized speaker/channel; else null —
   * a single honest stream (the current Twilio mono fork is not diarized, §13). Kept
   * so a future diarized payload lights up attribution with no panel change.
   */
  speaker: string | null;
  /** ISO timestamp the server stamped on the broadcast. */
  at: string;
}

/** What the subscription is actually doing right now (§13 honest states). */
export type TranscriptState = "idle" | "listening" | "live" | "reconnecting";

interface TranscriptResult {
  /** Committed finals in arrival order, plus the single live interim line (if any) last. */
  lines: TranscriptLine[];
  state: TranscriptState;
}

/** How many committed final lines we retain in memory for a single call. */
const MAX_FINALS = 400;

/** The one broadcast event name paige-stt publishes. */
const TRANSCRIPT_EVENT = "transcript";

/**
 * Coerce a broadcast payload into the fields we render. Live telemetry must never
 * throw into the app, so a malformed frame returns null (dropped) rather than crashing.
 * Accepts both the flat REST-broadcast shape and a one-level-nested `payload.payload`
 * (server broadcasts can nest one deeper than a client channel.send frame).
 */
function coerceFrame(raw: unknown):
  | { text: string; isFinal: boolean; speaker: string | null; at: string }
  | null {
  if (!raw || typeof raw !== "object") return null;
  const p = raw as Record<string, unknown>;
  const text = typeof p.transcript === "string" ? p.transcript : null;
  if (text === null) return null;
  const trimmed = text.trim();
  if (trimmed.length === 0) return null; // empty interim — nothing to show

  // Optional, forward-compat diarization. The current mono fork carries none, so this
  // resolves to null (a single honest stream) — never a fabricated "You"/"Client".
  let speaker: string | null = null;
  if (typeof p.speaker === "string" && p.speaker.length > 0) {
    speaker = p.speaker;
  } else if (typeof p.channel === "number") {
    speaker = p.channel === 0 ? "You" : "Client";
  }

  return {
    text: trimmed,
    isFinal: p.is_final === true,
    speaker,
    at: typeof p.at === "string" ? p.at : new Date().toISOString(),
  };
}

/**
 * useLiveTranscript — subscribe to a live call's transcript topic.
 *
 * @param topic  `voice-stt:<tenantId>:<callSid>` while a call is live, or null when
 *               there's nothing to subscribe to (no call / unresolved tenant or SID).
 *               A null topic tears the channel down and resets to idle.
 */
export function useLiveTranscript(topic: string | null): TranscriptResult {
  const [lines, setLines] = useState<TranscriptLine[]>([]);
  const [state, setState] = useState<TranscriptState>("idle");

  // Committed finals + the current interim slot, kept in refs so a high-rate frame
  // stream doesn't thrash React state through stale closures; we recompute `lines`
  // from them on each frame.
  const finalsRef = useRef<TranscriptLine[]>([]);
  const interimRef = useRef<TranscriptLine | null>(null);
  // De-dupe guard: broadcast frames aren't replayed on a Supabase rejoin, but a stable
  // key set makes a duplicate final (belt-and-suspenders on reconnect) a no-op.
  const seenRef = useRef<Set<string>>(new Set());
  const mountedRef = useRef(false);
  // Tracks the topic the current buffers belong to, so a RETRY (same topic) keeps the
  // already-committed transcript while a genuine topic change (new call) resets it.
  const bufferTopicRef = useRef<string | null>(null);
  // Bumped on a hard channel failure to force a clean teardown + resubscribe.
  const [retryTick, setRetryTick] = useState(0);

  useEffect(() => {
    mountedRef.current = true;

    // Reset per-call buffers ONLY on a real topic change (a new call is a new stream).
    // A resubscribe-retry re-runs this effect with the SAME topic and must NOT wipe the
    // finals already committed before the transport blip.
    if (bufferTopicRef.current !== topic) {
      finalsRef.current = [];
      interimRef.current = null;
      seenRef.current = new Set();
      bufferTopicRef.current = topic;
    }

    if (!topic) {
      setLines([]);
      setState("idle");
      return () => {
        mountedRef.current = false;
      };
    }

    // Seed the visible lines from the surviving buffers (empty on a fresh call, the
    // committed finals on a reconnect). Keep "reconnecting" honest until re-subscribed.
    setLines(
      interimRef.current ? [...finalsRef.current, interimRef.current] : [...finalsRef.current],
    );
    setState((prev) => (prev === "reconnecting" ? "reconnecting" : "listening"));

    const recompute = () => {
      if (!mountedRef.current) return;
      const next = interimRef.current
        ? [...finalsRef.current, interimRef.current]
        : [...finalsRef.current];
      setLines(next);
    };

    // Private broadcast channel — receive-only. The realtime.messages RLS policy
    // decides what actually lands here (own tenant's own call only, §9/#557).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const channel = supabase.channel(topic, { config: { private: true } } as any);

    let retryTimer: ReturnType<typeof setTimeout> | null = null;

    channel
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .on("broadcast" as any, { event: TRANSCRIPT_EVENT }, (msg: any) => {
        try {
          const frame = coerceFrame(msg?.payload) ?? coerceFrame(msg?.payload?.payload);
          if (!frame) return;
          if (!mountedRef.current) return;

          if (frame.isFinal) {
            const key = `${frame.at}#${finalsRef.current.length}`;
            const dedupe = `${frame.at}|${frame.text}`;
            if (seenRef.current.has(dedupe)) return; // duplicate final — ignore
            seenRef.current.add(dedupe);
            finalsRef.current = [
              ...finalsRef.current,
              { key, text: frame.text, isFinal: true, speaker: frame.speaker, at: frame.at },
            ].slice(-MAX_FINALS);
            // The utterance committed — clear the in-progress interim it refined from.
            interimRef.current = null;
          } else {
            // Interim result refines a SINGLE in-progress slot (replace, never append).
            interimRef.current = {
              key: "interim",
              text: frame.text,
              isFinal: false,
              speaker: frame.speaker,
              at: frame.at,
            };
          }
          setState("live");
          recompute();
        } catch (err) {
          // Live telemetry: swallow. A bad frame must never break the call surface.
          console.debug("[voice-stt] failed to handle transcript frame", err);
        }
      })
      .subscribe((status: string) => {
        if (!mountedRef.current) return;
        if (status === "SUBSCRIBED") {
          // Subscribed but no audio yet → listening; keep "live" once frames arrive.
          setState((prev) => (prev === "live" ? "live" : "listening"));
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
          // Transport dropped mid-call — surface it honestly (§13) and force a clean
          // resubscribe. supabase-js auto-rejoins the socket, but a hard CHANNEL_ERROR
          // can leave the channel wedged; tearing down + re-adding on a short backoff
          // guarantees the private channel re-authorizes and resumes.
          setState("reconnecting");
          if (!retryTimer) {
            retryTimer = setTimeout(() => {
              if (mountedRef.current) setRetryTick((t) => t + 1);
            }, 2000);
          }
        }
      });

    return () => {
      mountedRef.current = false;
      if (retryTimer) clearTimeout(retryTimer);
      try {
        void supabase.removeChannel(channel);
      } catch (err) {
        console.debug("[voice-stt] failed to remove channel", err);
      }
    };
    // Re-subscribe on topic change OR a forced retry after a hard channel failure.
  }, [topic, retryTick]);

  return { lines, state };
}
