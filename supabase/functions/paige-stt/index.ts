// #140 B1 — paige-stt: the KEYSTONE live-call co-pilot streaming pipe. This is the Deno
// WebSocket endpoint a Twilio <Start><Stream> media fork connects to. It:
//   1. accepts the Twilio Media Stream WS (JSON frames: connected → start → media… → stop),
//   2. VALIDATES the signed stream token from the "start" frame's customParameters and derives
//      the tenant FROM the verified token (§9 — never a raw body tenantId),
//   3. opens ONE Deepgram Nova-3 streaming session via the STT router (§34), forwards each
//      μ-law media payload, and
//   4. broadcasts transcripts on a per-tenant Supabase Realtime channel keyed on the call
//      (voice-stt:<tenantId>:<callSid>) — which B2's side panel subscribes to, and
//   5. on "stop" meters the streamed minutes to platform_usage_events (§17, service-role).
//
// DOCTRINE
//  §9  Tenant isolation from a NON-forgeable, HMAC-signed token — voice-twiml already resolved
//      the tenant (outbound = authenticated client identity, inbound = OWNER of the dialed
//      number) and minted a token that ENCODES { tenantId, callSid }. We verify signature +
//      expiry + call-SID match and use the token's tenantId for EVERYTHING (channel, metering).
//      A missing/invalid token ⇒ close the socket, never open Deepgram. Audio never crosses
//      tenants: the channel + the meter row are scoped to the token's tenant.
//  §34 Deepgram is a routable STT commodity BEHIND our router (_shared/stt-router.ts, the ONE
//      home). No second Deepgram client. Honest needs_config degrade when the key is absent.
//  §13 Every degrade/close LOGS its real cause loudly; we never fabricate a transcript stream or
//      a meter row for a call that didn't stream. Deepgram round-trip needs the real key + live
//      audio — owed to a deployed call (§32), not verifiable headless.
//  §32 The crash-prone/pure logic (frame parse, μ-law decode, token verify, route pick) lives in
//      pure _shared modules and is unit-smoked (scripts/voice-stt-smoke.mts). Both sockets are
//      torn down on stop/error/close so no Deepgram socket leaks.
//  §17 A streamed minute → platform_usage_events { event_type:"voice_stt_minute", unit:"minute" }.
//  verify_jwt=false (config.toml): a Twilio media-stream WS cannot present a Supabase JWT; the
//  control is the signed stream token, exactly as voice-twiml's control is the x-twilio-signature.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { verifyStreamToken } from "../_shared/voice-stream-token.ts";
import { parseTwilioFrame, decodeMediaPayload, TWILIO_MEDIA_FRAME_MS } from "../_shared/twilio-media.ts";
import { planSttStream, openDeepgramSocket, extractDeepgramTranscript } from "../_shared/stt-router.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * Broadcast a transcript to a per-tenant Realtime topic via the stateless Realtime HTTP API
 * (no persistent channel to keep alive in a short-lived socket handler). B2 subscribes to
 * topic `voice-stt:<tenantId>:<callSid>`, event `transcript`. §9: the topic is keyed by the
 * token's tenant + call, so a subscriber only ever receives its own tenant's call audio.
 */
async function broadcastTranscript(
  supabaseUrl: string,
  serviceKey: string,
  topic: string,
  payload: Record<string, unknown>,
): Promise<void> {
  try {
    const res = await fetch(`${supabaseUrl.replace(/\/$/, "")}/realtime/v1/api/broadcast`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
      body: JSON.stringify({ messages: [{ topic, event: "transcript", payload }] }),
    });
    if (!res.ok) {
      console.error("[paige-stt] realtime broadcast failed", { status: res.status, topic });
    }
  } catch (e) {
    console.error("[paige-stt] realtime broadcast threw", (e as Error)?.message);
  }
}

Deno.serve((req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const upgrade = (req.headers.get("upgrade") ?? "").toLowerCase();
  if (upgrade !== "websocket") {
    // Not a WS upgrade — this endpoint only speaks the Twilio Media Stream protocol.
    return new Response("expected_websocket", { status: 426, headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const streamSecret = Deno.env.get("VOICE_STREAM_SECRET") ?? "";
  const admin = supabaseUrl && serviceKey ? createClient(supabaseUrl, serviceKey) : null;

  const { socket, response } = Deno.upgradeWebSocket(req);

  // ── Per-connection state ────────────────────────────────────────────────────
  let deepgram: WebSocket | null = null;
  let deepgramOpen = false;
  let authed = false; // the §9 gate passed for this connection
  let tenantId = "";
  let callSid = "";
  let streamSid = "";
  let mediaFrames = 0;
  const pendingAudio: Uint8Array[] = []; // buffer media that arrives before Deepgram opens
  let tornDown = false;

  const closeTwilio = (code: number, reason: string) => {
    try {
      socket.close(code, reason.slice(0, 120));
    } catch { /* already closing */ }
  };

  // Meter the streamed minutes (§17) then close Deepgram. Runs at most once.
  const teardown = async (why: string) => {
    if (tornDown) return;
    tornDown = true;
    console.log("[paige-stt] teardown", { why, tenantId, callSid, mediaFrames });

    // Close Deepgram cleanly, regardless of readyState. On a start-then-immediate-teardown race the
    // Deepgram socket may still be CONNECTING (readyState 0) when we tear down — closing ONLY when
    // OPEN would orphan that half-open handshake (it completes, fires onopen after tornDown, and
    // leaks until Deepgram's idle-timeout reaps it). So: send CloseStream only if OPEN (to flush a
    // final transcript), but call close() whenever the socket isn't already CLOSING/CLOSED.
    if (deepgram) {
      try {
        if (deepgram.readyState === WebSocket.OPEN) {
          try { deepgram.send(JSON.stringify({ type: "CloseStream" })); } catch { /* best effort */ }
        }
        if (deepgram.readyState !== WebSocket.CLOSING && deepgram.readyState !== WebSocket.CLOSED) {
          deepgram.close(1000, "twilio_stop");
        }
      } catch (e) {
        console.error("[paige-stt] deepgram close error", (e as Error)?.message);
      }
      deepgram = null;
    }

    // §17 meter — frame-count basis (each μ-law frame is 20 ms), which excludes pre-bridge ring
    // time a wall-clock would wrongly include. Only meter a REAL stream (authed + audio flowed).
    if (authed && tenantId && callSid && mediaFrames > 0 && admin) {
      const seconds = (mediaFrames * TWILIO_MEDIA_FRAME_MS) / 1000;
      const minutes = Math.round((seconds / 60) * 10000) / 10000;
      try {
        const { error } = await admin.from("platform_usage_events").insert({
          tenant_id: tenantId,
          event_type: "voice_stt_minute",
          quantity: minutes,
          unit: "minute",
          metadata: {
            call_sid: callSid,
            stream_sid: streamSid,
            provider: "deepgram",
            model: "nova-3",
            media_frames: mediaFrames,
            seconds,
          },
        });
        if (error) {
          console.error("[paige-stt] meter insert failed", { code: error.code, message: error.message, tenantId });
        } else {
          console.log("[paige-stt] metered", { tenantId, callSid, minutes, seconds });
        }
      } catch (e) {
        console.error("[paige-stt] meter insert threw", (e as Error)?.message);
      }
    }
  };

  socket.onopen = () => {
    console.log("[paige-stt] twilio media socket open");
  };

  socket.onmessage = async (ev) => {
    const frame = parseTwilioFrame(ev.data as string);

    switch (frame.event) {
      case "connected":
        console.log("[paige-stt] twilio connected", { protocol: frame.protocol, version: frame.version });
        return;

      case "start": {
        streamSid = frame.start.streamSid;
        const cp = frame.start.customParameters;
        const token = cp.streamToken ?? cp.streamtoken ?? "";
        const twilioCallSid = frame.start.callSid;

        // ── §9 GATE ── verify the signed token; derive tenant FROM the token, never the body.
        if (!streamSecret) {
          console.error("[paige-stt] REJECT: VOICE_STREAM_SECRET not set — cannot verify stream token");
          closeTwilio(1011, "server_not_configured");
          return;
        }
        const v = await verifyStreamToken(streamSecret, token, { expectedCallSid: twilioCallSid || undefined });
        if (!v.ok) {
          console.error("[paige-stt] REJECT: invalid stream token", { reason: v.reason, streamSid });
          closeTwilio(1008, `bad_token:${v.reason}`);
          return;
        }
        authed = true;
        tenantId = v.tenantId;
        callSid = v.callSid;
        console.log("[paige-stt] token OK — tenant scoped", { tenantId, callSid, streamSid });

        // ── open ONE Deepgram Nova-3 stream via the router (§34) ──
        const plan = planSttStream("nova-realtime", {});
        if (!plan.ok) {
          if ("needs_config" in plan) {
            console.error("[paige-stt] Deepgram needs_config (DEEPGRAM_API_KEY absent) — honest degrade, closing");
            closeTwilio(1011, "stt_needs_config");
          } else {
            console.error("[paige-stt] STT route error", { error: plan.error });
            closeTwilio(1011, "stt_route_error");
          }
          return;
        }
        deepgram = openDeepgramSocket(plan.url);
        if (!deepgram) {
          console.error("[paige-stt] openDeepgramSocket returned null (key vanished) — closing");
          closeTwilio(1011, "stt_open_failed");
          return;
        }

        deepgram.onopen = () => {
          deepgramOpen = true;
          console.log("[paige-stt] deepgram open", { tenantId, callSid, model: plan.model });
          // Flush any media that arrived during the async connect.
          for (const chunk of pendingAudio) {
            try { deepgram?.send(chunk); } catch { /* dropped on race */ }
          }
          pendingAudio.length = 0;
        };
        deepgram.onmessage = (dgEv) => {
          const t = extractDeepgramTranscript(dgEv.data as string);
          if (!t || !admin) return;
          // §9: topic scoped to the token's tenant + call — B2 subscribes here.
          const topic = `voice-stt:${tenantId}:${callSid}`;
          void broadcastTranscript(supabaseUrl, serviceKey, topic, {
            call_sid: callSid,
            stream_sid: streamSid,
            transcript: t.transcript,
            is_final: t.isFinal,
            speech_final: t.speechFinal,
            confidence: t.confidence ?? null,
            at: new Date().toISOString(),
          });
        };
        deepgram.onerror = (e) => {
          // §32: loud, never silent. A Deepgram fault degrades the co-pilot, not the call —
          // the Twilio bridge is a separate leg and keeps going; we just stop transcribing.
          console.error("[paige-stt] deepgram socket error", { message: (e as ErrorEvent)?.message, tenantId, callSid });
        };
        deepgram.onclose = (e) => {
          deepgramOpen = false;
          console.log("[paige-stt] deepgram closed", { code: e.code, reason: e.reason, tenantId, callSid });
        };
        return;
      }

      case "media": {
        if (!authed) {
          // Media before a valid start/token — never forward audio for an unauthed stream (§9).
          return;
        }
        const bytes = decodeMediaPayload(frame.media.payload);
        if (bytes.length === 0) return;
        mediaFrames++;
        if (deepgram && deepgramOpen && deepgram.readyState === WebSocket.OPEN) {
          try { deepgram.send(bytes); } catch (e) {
            console.error("[paige-stt] deepgram send failed", (e as Error)?.message);
          }
        } else {
          // Deepgram still connecting — buffer (bounded) so the utterance start isn't lost.
          if (pendingAudio.length < 500) pendingAudio.push(bytes); // ~10s cap; drop beyond
        }
        return;
      }

      case "mark":
        return;

      case "stop":
        await teardown("twilio_stop");
        closeTwilio(1000, "stop");
        return;

      case "unknown":
        console.warn("[paige-stt] unknown twilio frame — ignoring");
        return;
    }
  };

  socket.onerror = (e) => {
    console.error("[paige-stt] twilio socket error", { message: (e as ErrorEvent)?.message, tenantId, callSid });
    void teardown("twilio_error");
  };
  socket.onclose = () => {
    console.log("[paige-stt] twilio socket closed", { tenantId, callSid });
    void teardown("twilio_close");
  };

  return response;
});
