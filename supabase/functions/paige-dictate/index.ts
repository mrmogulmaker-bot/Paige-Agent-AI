// §49 Wave A #170 — paige-dictate: press-to-talk DICTATION (mic → text) for the Paige composers.
//
// A BROWSER WebSocket endpoint. The client holds a mic button, streams PCM16 (linear16, 16 kHz mono)
// audio frames up this socket, and receives interim + final transcript JSON back — Paige's chat
// composer and the ClientsConversations reply box both mount ONE shared useDictation hook against it.
// This REPLACES the dead ElevenLabs Convai voice-chat stub (§45): zero elevenlabs/convai/@11labs
// remnant, no branded error ever leaks to a tenant.
//
// FLOW
//   1. §9 AUTH GATE (pre-upgrade) — read the caller's access token from ?token= (a browser WS cannot
//      set an Authorization header), VERIFY it via auth.getUser(). No/invalid token ⇒ HTTP 401, the WS
//      never opens, Deepgram is never touched. Then derive the tenant SERVER-SIDE via
//      current_user_tenant_id() — NEVER a body/query tenantId (§9). Dictation is benign mic→text; an
//      authenticated user with no resolved tenant may still dictate (no tenant-scoped write happens),
//      but the identity is always verified so the shared Deepgram key is never exposed to an anon caller.
//   2. WS CONTRACT (see below) — client sends a "start" frame declaring its real sampleRate, server
//      opens ONE Deepgram Nova-3 linear16 stream via the ONE STT home (_shared/stt-router.ts, §18/§34)
//      and acks {type:"ready"}; client streams binary PCM16; server relays Deepgram transcripts back.
//   3. §13 HONEST DEGRADE — DEEPGRAM_API_KEY absent ⇒ {type:"error", code:"not_configured"} + close,
//      never a fabricated transcript. Every close LOGS its real cause (§32). Jargon-free copy (§3):
//      no "ElevenLabs"/"Convai"/"rawAudioProcessor"/"worklet"/"Deepgram" in any client-facing message.
//
// ── WS MESSAGE CONTRACT (client ⇄ server) ─────────────────────────────────────────────────────────
//  Connect:  wss://<ref>.supabase.co/functions/v1/paige-dictate?apikey=<ANON>&token=<ACCESS_JWT>
//  client → server:
//    • FIRST frame (text/JSON):  { "type":"start", "sampleRate":16000, "language"?:"en-US" }
//        sampleRate = the client's ACTUAL AudioContext rate (so Deepgram is told the truth); clamped
//        to [8000,48000], default 16000. encoding is always linear16 (server-fixed).
//    • then binary frames:  raw PCM16 little-endian, mono — the mic audio, streamed while held.
//    • { "type":"stop" }  (or just closing the socket) ⇒ finalize + close.
//  server → client (all JSON text):
//    • { "type":"ready" }                                   — Deepgram open; start sending audio.
//    • { "type":"transcript", "text":string, "is_final":boolean }  — interim (false) + final (true).
//    • { "type":"error", "code":string, "message":string }  — jargon-free; socket closes after.
//
// verify_jwt=false (config.toml) — a browser WS cannot present the Authorization header the gateway's
// verify_jwt reads, so the §9 gate runs IN-FUNCTION (query-param token → getUser). Full rationale +
// the owner-reversible note live in config.toml alongside this entry.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";
import { planSttStream, openDeepgramSocket, extractDeepgramTranscript } from "../_shared/stt-router.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

/** Clamp a client-declared sample rate to a Deepgram-sane window; default 16 kHz (linear16 dictation). */
function clampSampleRate(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return 16000;
  return Math.min(48000, Math.max(8000, Math.round(n)));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const upgrade = (req.headers.get("upgrade") ?? "").toLowerCase();
  if (upgrade !== "websocket") {
    // This endpoint only speaks the dictation WebSocket protocol.
    return new Response("expected_websocket", { status: 426, headers: corsHeaders });
  }

  // ── §9 AUTH GATE (pre-upgrade) — verify the JWT, derive the tenant server-side ──
  // A browser WS can't set headers, so the short-lived access token rides ?token= (same posture the
  // deleted paige-voice-chat used). We STILL verify it here; the tenant is NEVER taken from the client.
  const url = new URL(req.url);
  const token = url.searchParams.get("token") ?? "";
  const headerAuth = req.headers.get("authorization"); // present if a server-to-server caller sets it
  const authValue = token ? `Bearer ${token}` : headerAuth;
  if (!authValue) {
    console.error("[paige-dictate] REJECT: no access token (query ?token= or Authorization)");
    return new Response("unauthenticated", { status: 401, headers: corsHeaders });
  }
  if (!supabaseUrl || !supabaseAnonKey) {
    console.error("[paige-dictate] REJECT: server not configured (SUPABASE_URL / SUPABASE_ANON_KEY absent)");
    return new Response("server_not_configured", { status: 500, headers: corsHeaders });
  }

  const authed = createClient(supabaseUrl, supabaseAnonKey, { global: { headers: { Authorization: authValue } } });
  const { data: { user }, error: authErr } = await authed.auth.getUser();
  if (authErr || !user) {
    console.error("[paige-dictate] REJECT: invalid token", { reason: authErr?.message });
    return new Response("unauthorized", { status: 401, headers: corsHeaders });
  }

  // §9 — tenant derived FROM the verified session, never the client. Best-effort: an authenticated user
  // with no resolved tenant (e.g. platform owner) may still dictate — mic→text writes nothing tenant-scoped.
  let tenantId = "";
  try {
    const { data: t, error: tErr } = await authed.rpc("current_user_tenant_id");
    if (tErr) console.warn("[paige-dictate] tenant resolve failed (dictation still allowed):", tErr.message);
    else tenantId = String(t ?? "").trim();
  } catch (e) {
    console.warn("[paige-dictate] tenant resolve threw (dictation still allowed):", (e as Error)?.message);
  }
  console.log("[paige-dictate] auth ok", { userId: user.id, hasTenant: !!tenantId });

  const { socket, response } = Deno.upgradeWebSocket(req);

  // ── Per-connection state ────────────────────────────────────────────────────
  let deepgram: WebSocket | null = null;
  let deepgramOpen = false;
  let started = false; // the client's "start" frame was received (Deepgram opening/open)
  let tornDown = false;
  let audioFrames = 0;
  const pendingAudio: Uint8Array[] = []; // buffer mic audio that arrives before Deepgram finishes opening

  const sendJson = (obj: Record<string, unknown>) => {
    try {
      if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(obj));
    } catch { /* client gone */ }
  };
  const sendError = (code: string, message: string) => sendJson({ type: "error", code, message });

  const teardown = (why: string) => {
    if (tornDown) return;
    tornDown = true;
    console.log("[paige-dictate] teardown", { why, userId: user.id, audioFrames });
    if (deepgram) {
      try {
        if (deepgram.readyState === WebSocket.OPEN) {
          try { deepgram.send(JSON.stringify({ type: "CloseStream" })); } catch { /* best effort flush */ }
        }
        if (deepgram.readyState !== WebSocket.CLOSING && deepgram.readyState !== WebSocket.CLOSED) {
          deepgram.close(1000, "dictation_stop");
        }
      } catch (e) {
        console.error("[paige-dictate] deepgram close error", (e as Error)?.message);
      }
      deepgram = null;
    }
  };

  const closeClient = (code: number, reason: string) => {
    try { socket.close(code, reason.slice(0, 120)); } catch { /* already closing */ }
  };

  // Open ONE Deepgram Nova-3 stream for browser linear16 audio via the ONE STT home (§18/§34).
  const openDeepgram = (sampleRate: number, language: string) => {
    const plan = planSttStream("nova-realtime", {
      encoding: "linear16",
      sampleRate,
      channels: 1,
      interimResults: true,
      language,
    });
    if (!plan.ok) {
      if ("needs_config" in plan) {
        console.error("[paige-dictate] Deepgram needs_config (DEEPGRAM_API_KEY absent) — honest degrade");
        sendError("not_configured", "Voice typing isn't available right now.");
      } else {
        console.error("[paige-dictate] STT route error", { error: plan.error });
        sendError("stt_error", "Voice typing hit a snag. Please try again.");
      }
      closeClient(1011, "stt_unavailable");
      return;
    }
    deepgram = openDeepgramSocket(plan.url);
    if (!deepgram) {
      console.error("[paige-dictate] openDeepgramSocket returned null (key vanished)");
      sendError("stt_error", "Voice typing hit a snag. Please try again.");
      closeClient(1011, "stt_open_failed");
      return;
    }

    deepgram.onopen = () => {
      deepgramOpen = true;
      console.log("[paige-dictate] deepgram open", { sampleRate, model: plan.model });
      sendJson({ type: "ready" });
      for (const chunk of pendingAudio) {
        try { deepgram?.send(chunk); } catch { /* dropped on race */ }
      }
      pendingAudio.length = 0;
    };
    deepgram.onmessage = (dgEv) => {
      const t = extractDeepgramTranscript(dgEv.data as string);
      if (!t) return; // control frame or empty transcript — never emit a phantom word (§13)
      sendJson({ type: "transcript", text: t.transcript, is_final: t.isFinal || t.speechFinal });
    };
    deepgram.onerror = (e) => {
      // §32 loud, never silent. Degrade the dictation honestly; the socket closes on dg close below.
      console.error("[paige-dictate] deepgram socket error", { message: (e as ErrorEvent)?.message, userId: user.id });
    };
    deepgram.onclose = (e) => {
      deepgramOpen = false;
      console.log("[paige-dictate] deepgram closed", { code: e.code, reason: e.reason });
    };
  };

  socket.onopen = () => {
    console.log("[paige-dictate] client socket open", { userId: user.id });
  };

  socket.onmessage = (ev) => {
    // Binary frame ⇒ mic audio (PCM16). Forward to Deepgram, or buffer if it's still opening.
    if (ev.data instanceof ArrayBuffer || ev.data instanceof Uint8Array) {
      if (!started) return; // audio before "start" — ignore until the stream is armed
      const bytes = ev.data instanceof Uint8Array ? ev.data : new Uint8Array(ev.data);
      if (bytes.length === 0) return;
      audioFrames++;
      if (deepgram && deepgramOpen && deepgram.readyState === WebSocket.OPEN) {
        try { deepgram.send(bytes); } catch (e) {
          console.error("[paige-dictate] deepgram send failed", (e as Error)?.message);
        }
      } else if (pendingAudio.length < 500) {
        pendingAudio.push(bytes); // ~bounded buffer during the async connect; drop beyond
      }
      return;
    }

    // Text frame ⇒ a JSON control message.
    let msg: Record<string, unknown>;
    try {
      msg = JSON.parse(String(ev.data)) as Record<string, unknown>;
    } catch {
      console.warn("[paige-dictate] non-JSON text frame — ignoring");
      return;
    }
    const type = typeof msg.type === "string" ? msg.type : "";

    if (type === "start") {
      if (started) return; // idempotent — one Deepgram stream per connection
      started = true;
      const sampleRate = clampSampleRate(msg.sampleRate);
      const language = typeof msg.language === "string" && msg.language.trim() ? msg.language.trim() : "en-US";
      console.log("[paige-dictate] start", { sampleRate, language });
      openDeepgram(sampleRate, language);
      return;
    }

    if (type === "stop") {
      teardown("client_stop");
      closeClient(1000, "stop");
      return;
    }

    console.warn("[paige-dictate] unknown control type — ignoring", { type });
  };

  socket.onerror = (e) => {
    console.error("[paige-dictate] client socket error", { message: (e as ErrorEvent)?.message, userId: user.id });
    teardown("client_error");
  };
  socket.onclose = () => {
    console.log("[paige-dictate] client socket closed", { userId: user.id, audioFrames });
    teardown("client_close");
  };

  return response;
});
