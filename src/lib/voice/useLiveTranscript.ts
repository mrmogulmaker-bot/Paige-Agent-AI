// #140 B2/B3 — live-call transcript + intelligence subscriber.
//
// paige-stt (B1) broadcasts each Deepgram result SERVER-SIDE onto the per-tenant,
// per-call topic `voice-stt:<tenantId>:<callSid>`, event "transcript", with payload
//   { call_sid, stream_sid, transcript, is_final, speech_final, confidence, at }.
// B3 (the intelligence layer) broadcasts FOUR MORE events on the SAME private topic
// (§18 — no new channel, no new RLS): "whisper", "commitment", "at_risk", "draft_ready".
// This hook subscribes to that ONE topic as a PRIVATE channel and turns both streams
// into render-ready shapes. It only RECEIVES — clients never broadcast anything here.
//
// DOCTRINE
//  §9 / #557  Subscribed as a PRIVATE channel (config.private = true) — the EXACT
//     precedent at src/hooks/useRailEvents.ts:136. A private channel is authorized by
//     RLS on realtime.messages (the 20260730120000_voice_stt_realtime_topic_rls.sql
//     policy), so a tenant can ONLY join voice-stt:<theirOwnTenant>:<callSid>. The
//     topic string alone grants nothing; the DB is the wall. B3's four events ride the
//     SAME authorized topic, so a tenant can never see another tenant's intelligence.
//  §13  Honest state, never a fabricated stream. `state` reflects what's actually
//     happening — listening (subscribed, nothing yet), live (frames flowing),
//     reconnecting (transport dropped). A malformed frame (of any event) is dropped,
//     never crashes the call surface — no fabricated whisper/flag/commitment/draft.
//  §22  Deepgram sends INTERIM results (is_final=false) that refine in place, then a
//     FINAL (is_final=true). Interim replaces a single in-progress slot; a final is
//     appended as a committed line — the panel animates only the committed lines.
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { CallIntelligenceAccumulator, EMPTY_CALL_INTELLIGENCE } from "./callIntelligence";
import type { CallIntelligence } from "./callIntelligence";
// Re-export the B3 intelligence contract so consumers keep importing it from this hook.
export {
  EMPTY_CALL_INTELLIGENCE,
  type CallIntelligence,
  type WhisperCard,
  type CommitmentChip,
  type AtRiskFlag,
  type AtRiskLevel,
  type DraftReady,
} from "./callIntelligence";

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

// ── #140 B3 — live-call INTELLIGENCE (same private channel, new event names). The parsing
// + swap/dedupe accumulation lives in the pure, headless-testable module callIntelligence.ts
// (§18 one home, §32 smoke-testable); its types are re-exported from this hook (top of file)
// so existing consumers keep importing from here. ─────────────────────────────────────────

interface TranscriptResult {
  /** Committed finals in arrival order, plus the single live interim line (if any) last. */
  lines: TranscriptLine[];
  state: TranscriptState;
  /** #140 B3 — whisper/commitment/at-risk/draft intelligence for this call. */
  intelligence: CallIntelligence;
}

/** How many committed final lines we retain in memory for a single call. */
const MAX_FINALS = 400;

/** The one B2 transcript event + the four B3 intelligence events, all on the ONE topic. */
const TRANSCRIPT_EVENT = "transcript";
const WHISPER_EVENT = "whisper";
const COMMITMENT_EVENT = "commitment";
const AT_RISK_EVENT = "at_risk";
const DRAFT_READY_EVENT = "draft_ready";

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
  // #140 B3 — intelligence accumulated on the SAME channel. Low-rate (server-debounced),
  // so it lives in refs mirrored to one state object — same reconnect-preserve semantics
  // as the transcript buffers (a retry keeps what was already learned this call).
  const [intelligence, setIntelligence] = useState<CallIntelligence>(EMPTY_CALL_INTELLIGENCE);

  // Committed finals + the current interim slot, kept in refs so a high-rate frame
  // stream doesn't thrash React state through stale closures; we recompute `lines`
  // from them on each frame.
  const finalsRef = useRef<TranscriptLine[]>([]);
  const interimRef = useRef<TranscriptLine | null>(null);
  // De-dupe guard: broadcast frames aren't replayed on a Supabase rejoin, but a stable
  // key set makes a duplicate final (belt-and-suspenders on reconnect) a no-op.
  const seenRef = useRef<Set<string>>(new Set());
  // #140 B3 — the ONE intelligence accumulator for the current call (swap/dedupe live in
  // the pure module). A retry keeps it (same topic); a topic change resets it.
  const intelRef = useRef<CallIntelligenceAccumulator>(new CallIntelligenceAccumulator());
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
      // A new call is a new brain — clear every intelligence buffer (§13, never leak the
      // prior call's whispers/flags/commitments into the next one).
      intelRef.current.reset();
      bufferTopicRef.current = topic;
    }

    if (!topic) {
      setLines([]);
      setState("idle");
      setIntelligence(EMPTY_CALL_INTELLIGENCE);
      return () => {
        mountedRef.current = false;
      };
    }

    // Seed the visible lines from the surviving buffers (empty on a fresh call, the
    // committed finals on a reconnect). Keep "reconnecting" honest until re-subscribed.
    setLines(
      interimRef.current ? [...finalsRef.current, interimRef.current] : [...finalsRef.current],
    );
    // Seed intelligence from the surviving accumulator (empty on a fresh call, retained on
    // a reconnect). snapshot() builds new array identities so React sees the change.
    setIntelligence(intelRef.current.snapshot());
    setState((prev) => (prev === "reconnecting" ? "reconnecting" : "listening"));

    const recompute = () => {
      if (!mountedRef.current) return;
      const next = interimRef.current
        ? [...finalsRef.current, interimRef.current]
        : [...finalsRef.current];
      setLines(next);
    };

    // Publish the accumulator's snapshot (low-rate; called only when an event changed it).
    const recomputeIntel = () => {
      if (!mountedRef.current) return;
      setIntelligence(intelRef.current.snapshot());
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
      // ── #140 B3 — the four intelligence events, on the SAME private channel. Each apply*
      // coerces defensively (a bad frame is dropped, never fabricated — §13) and returns
      // true only on a real state change, so we re-render on deltas, not on dupes. The
      // server can nest one level deeper than a client frame, so we try both payload shapes
      // (the exact `raw ?? raw.payload` fallback the transcript handler uses).
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .on("broadcast" as any, { event: WHISPER_EVENT }, (msg: any) => {
        try {
          if (!mountedRef.current) return;
          const acc = intelRef.current;
          if (acc.applyWhisper(msg?.payload) || acc.applyWhisper(msg?.payload?.payload)) {
            recomputeIntel();
          }
        } catch (err) {
          console.debug("[voice-stt] failed to handle whisper frame", err);
        }
      })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .on("broadcast" as any, { event: COMMITMENT_EVENT }, (msg: any) => {
        try {
          if (!mountedRef.current) return;
          const acc = intelRef.current;
          if (acc.applyCommitment(msg?.payload) || acc.applyCommitment(msg?.payload?.payload)) {
            recomputeIntel();
          }
        } catch (err) {
          console.debug("[voice-stt] failed to handle commitment frame", err);
        }
      })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .on("broadcast" as any, { event: AT_RISK_EVENT }, (msg: any) => {
        try {
          if (!mountedRef.current) return;
          const acc = intelRef.current;
          if (acc.applyAtRisk(msg?.payload) || acc.applyAtRisk(msg?.payload?.payload)) {
            recomputeIntel();
          }
        } catch (err) {
          console.debug("[voice-stt] failed to handle at_risk frame", err);
        }
      })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .on("broadcast" as any, { event: DRAFT_READY_EVENT }, (msg: any) => {
        try {
          if (!mountedRef.current) return;
          const acc = intelRef.current;
          if (acc.applyDraftReady(msg?.payload) || acc.applyDraftReady(msg?.payload?.payload)) {
            recomputeIntel();
          }
        } catch (err) {
          console.debug("[voice-stt] failed to handle draft_ready frame", err);
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

  return { lines, state, intelligence };
}
