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
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { verifyStreamToken } from "../_shared/voice-stream-token.ts";
import { parseTwilioFrame, decodeMediaPayload, TWILIO_MEDIA_FRAME_MS } from "../_shared/twilio-media.ts";
import { planSttStream, openDeepgramSocket, extractDeepgramTranscript } from "../_shared/stt-router.ts";
// #140 B3 — the live-call INTELLIGENCE layer. paige-stt is the ONE server-side home for a call's
// verified {tenantId, callSid} (§18): the intelligence runs HERE, driven off the SAME Deepgram
// finals we already broadcast, so it reuses that verified scope with no re-derivation and no new
// edge fn. The heavy seams are wired below into the pure, dep-injected CallCopilot (§13/§32).
import { recallSimilar } from "../_shared/prompt-forge.ts";
import { retrieveTenantKnowledge } from "../_shared/studio-brain.ts";
import { reviewBySpecialists, type SpecialistLens } from "../_shared/reasoning/review.ts";
import { routedChatCompletion } from "../_shared/model-router.ts";
import {
  CallCopilot,
  type CopilotDeps,
  type CopilotEvent,
  type FollowupDraft,
  type WhisperCard,
} from "../_shared/voice-copilot.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// EdgeRuntime.waitUntil shim — lets the end-of-call auto-draft + meter survive the socket close
// (the isolate would otherwise be reclaimed once the WS is gone). Falls back to a no-op off-platform.
const waitUntil = (p: Promise<unknown>): void => {
  const wu = (globalThis as unknown as { EdgeRuntime?: { waitUntil?: (p: Promise<unknown>) => void } }).EdgeRuntime?.waitUntil;
  if (wu) wu(p);
};

// ── #140 B3 intelligence seams (wired to the EXISTING homes; §18 reuse) ──────────────────────────
// The single-minded at-risk reviewer — a CUSTOM lens for reviewBySpecialists (§18: reuse the panel,
// pass one churn/competitor/frustration lens rather than the design-review CORE_PANEL). It declares
// its OWN strict-JSON contract (the panel's JSON_TAIL is not exported) matching parseVerdict.
const AT_RISK_LENS: SpecialistLens = {
  id: "at_risk",
  agentId: "paige-voice-at-risk",
  systemPrompt:
    "You are Paige's live-call AT-RISK detector. You are given a rolling window of a live call " +
    "transcript. Judge ONE thing: is the CLIENT showing signals they may leave, churn, or are " +
    "dissatisfied? Signals include mentioning a competitor, expressing frustration or disappointment, " +
    "asking to cancel or pause, demanding a discount under pressure, or clear disengagement. Do NOT " +
    "flag ordinary questions, neutral discussion, or the coach's own words. Return STRICT JSON with " +
    'exactly these keys: {"verdict": "SHIP" | "ITERATE" | "BLOCK", "blockers": string[], ' +
    '"improvements": string[], "rationale": string}. Use verdict="BLOCK" for a STRONG at-risk signal, ' +
    '"ITERATE" for a MILD or early signal, and "SHIP" when there is NO at-risk signal. Put the specific ' +
    'signal as a short, plain phrase (no jargon) as the FIRST element of "blockers". rationale = one ' +
    "sentence. Output ONLY the JSON object, no prose, no code fence.",
};

/** Extract a {subject?, body} follow-up from the model reply (fenced or prose-wrapped). Null when no
 *  usable body — so a malformed draft degrades to "no draft_ready", never a fabricated one (§13). */
function parseFollowupJson(raw: string): FollowupDraft | null {
  if (!raw || typeof raw !== "string") return null;
  const fenced = raw.replace(/```(?:json)?/gi, "").trim();
  const start = fenced.indexOf("{");
  const end = fenced.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  let obj: unknown;
  try { obj = JSON.parse(fenced.slice(start, end + 1)); } catch { return null; }
  if (!obj || typeof obj !== "object") return null;
  const o = obj as Record<string, unknown>;
  const body = typeof o.body === "string" ? o.body.trim() : "";
  if (!body) return null;
  const subject = typeof o.subject === "string" && o.subject.trim() ? o.subject.trim() : undefined;
  return { body, ...(subject ? { subject } : {}) };
}

/**
 * Build the real, tenant-scoped CopilotDeps for one call. EVERY seam call passes the token-verified
 * tenantId EXPLICITLY (§9) — a JWT body tenant is never involved here; this runs service-role with
 * the tenant paige-stt already proved. Each dep degrades honestly (returns empty/false/null) rather
 * than throwing, so a missing key or a slow RPC never breaks the call (§13).
 */
function buildCopilotDeps(ctx: {
  admin: SupabaseClient;
  supabaseUrl: string;
  serviceKey: string;
  tenantId: string;
  callSid: string;
  streamSid: string;
}): CopilotDeps {
  const { admin, supabaseUrl, serviceKey, tenantId, callSid, streamSid } = ctx;
  const topic = `voice-stt:${tenantId}:${callSid}`;
  return {
    // (1) WHISPER — L6 recall (prior produced artifacts) + tenant knowledge, merged by similarity.
    recallContext: async (query: string): Promise<WhisperCard[]> => {
      const cards: WhisperCard[] = [];
      try {
        const arts = await recallSimilar(query, tenantId, 3);
        arts.forEach((a, i) => cards.push({
          id: `mem-${i}`,
          title: (a.user_intent || "Prior work").slice(0, 80),
          body: (a.prompt_text || "").slice(0, 220),
          source: "Prior work",
          similarity: Number(a.similarity ?? 0),
        }));
      } catch (e) { console.error("[paige-stt] recallSimilar failed", (e as Error)?.message); }
      try {
        const chunks = await retrieveTenantKnowledge(tenantId, query, 3);
        chunks.forEach((c, i) => cards.push({
          id: `kb-${i}`,
          title: (c.title || "From the knowledge base").slice(0, 80),
          body: c.content.slice(0, 220),
          source: "Knowledge base",
          similarity: Number(c.similarity ?? 0),
        }));
      } catch (e) { console.error("[paige-stt] retrieveTenantKnowledge failed", (e as Error)?.message); }
      return cards.sort((a, b) => b.similarity - a.similarity).slice(0, 3);
    },
    // Action bus — file (owner.task commitment, client.at_risk flag, owner.followup_email draft).
    fileAction: async ({ kind, title, summary, contactId, payload, priority, dueAt }) => {
      try {
        const { data, error } = await admin.rpc("file_action", {
          p_action_kind: kind,
          p_title: title,
          p_summary: summary ?? null,
          p_contact_id: contactId ?? null,
          p_payload: { ...(payload ?? {}), call_sid: callSid },
          p_priority: priority ?? null,
          p_due_at: dueAt ?? null,
          p_created_by_agent: "paige_voice_copilot",
          p_tenant_id: tenantId,
        });
        if (error) { console.error("[paige-stt] file_action failed", { code: error.code, message: error.message }); return { ok: false }; }
        const d = data as { ok?: boolean; action_id?: string } | null;
        return { ok: !!d?.ok, actionId: d?.action_id };
      } catch (e) { console.error("[paige-stt] file_action threw", (e as Error)?.message); return { ok: false }; }
    },
    // Action bus — advance to "drafted" (owner.followup_email requires approval → lands a cs_draft).
    advanceAction: async ({ actionId, toStatus, draftContent }) => {
      try {
        const { data, error } = await admin.rpc("advance_action", {
          p_action_id: actionId,
          p_to_status: toStatus,
          p_draft_content: draftContent ?? null,
          p_tenant_id: tenantId,
        });
        if (error) { console.error("[paige-stt] advance_action failed", { code: error.code, message: error.message }); return { ok: false }; }
        const d = data as { ok?: boolean; approval_id?: string | null } | null;
        return { ok: !!d?.ok, approvalId: d?.approval_id ?? null };
      } catch (e) { console.error("[paige-stt] advance_action threw", (e as Error)?.message); return { ok: false }; }
    },
    // (3) AT_RISK — one custom lens over the rolling window (§17 Claude reasoning; never an open model).
    scanAtRisk: async (window: string) => {
      try {
        const review = await reviewBySpecialists({
          task:
            "Assess whether the CLIENT on this live call is showing churn / at-risk signals: competitor " +
            "mentions, frustration, dissatisfaction, cancellation or discount demands, or disengagement. " +
            "Judge ONLY the client's risk of leaving.",
          artifact: window,
          lenses: [AT_RISK_LENS],
          tenantId,
        });
        if (review.degraded) return null; // no real judgment → no fabricated flag (§13)
        const v = review.verdicts.find((x) => !x.degraded);
        const signal = (v?.blockers?.[0] || v?.improvements?.[0] || v?.rationale || "at-risk language").trim();
        if (review.consensus === "BLOCK") return { flagged: true, level: "high", signal };
        if (review.consensus === "ITERATE") return { flagged: true, level: "med", signal };
        return { flagged: false, level: "low", signal: "" };
      } catch (e) { console.error("[paige-stt] scanAtRisk failed", (e as Error)?.message); return null; }
    },
    // (4) AUTO-DRAFT — synthesize the follow-up (Claude reasoning; a draft, human-approved before send).
    draftFollowup: async (transcript: string) => {
      try {
        const resp = await routedChatCompletion("doc_draft", {
          messages: [
            {
              role: "system",
              content:
                "You draft a short, warm follow-up email FROM the coach/consultant/advisor TO the client, " +
                "based on a call transcript. Capture what was discussed and any next steps or commitments. " +
                "Direct, confident, human founder voice. Never use \"AI-powered\", \"streamline\", " +
                "\"seamless\", or \"empower\". Return STRICT JSON: {\"subject\": string, \"body\": string}. " +
                "Output ONLY the JSON object, no prose, no code fence.",
            },
            { role: "user", content: `Call transcript:\n${transcript.slice(0, 6000)}` },
          ],
          temperature: 0.4,
          max_tokens: 700,
        }, { tenant_id: tenantId, agent_id: "paige-voice-followup", job_kind: "doc_draft" });
        return parseFollowupJson(resp?.choices?.[0]?.message?.content ?? "");
      } catch (e) { console.error("[paige-stt] draftFollowup failed", (e as Error)?.message); return null; }
    },
    // Broadcast the 4 contract events on the SAME private topic B1 uses (§18 — no second channel).
    broadcast: (event: CopilotEvent, payload: Record<string, unknown>) => {
      void broadcastEvent(supabaseUrl, serviceKey, topic, event, payload);
    },
    // §17 — meter the call's B3 LLM usage once (same platform_usage_events shape as the B1 minute meter).
    meter: (summary) => {
      if (summary.llmOps <= 0 && summary.commitments <= 0) return; // nothing genuinely spent → no row (§13)
      void admin.from("platform_usage_events").insert({
        tenant_id: tenantId,
        event_type: "voice_copilot_llm",
        quantity: summary.llmOps,
        unit: "operation",
        metadata: {
          call_sid: callSid,
          stream_sid: streamSid,
          cost_estimate_usd: summary.costEstimateUsd, // LABELED estimate, never a bill (§13)
          whispers: summary.whispers,
          at_risk_scans: summary.atRiskScans,
          commitments: summary.commitments,
          at_risk_flags: summary.atRiskFlags,
          draft_filed: summary.draftFiled,
          capped: summary.capped,
        },
      }).then(({ error }) => {
        if (error) console.error("[paige-stt] copilot meter insert failed", error.message);
      });
    },
  };
}

/**
 * Broadcast an event to a per-tenant Realtime topic via the stateless Realtime HTTP API (no
 * persistent channel to keep alive in a short-lived socket handler). B2 subscribes to topic
 * `voice-stt:<tenantId>:<callSid>`; B1 emits event "transcript", B3 emits "whisper" | "commitment"
 * | "at_risk" | "draft_ready" on the SAME topic (§18 — one channel, gated by the #557 RLS). §9: the
 * topic is keyed by the token's tenant + call, so a subscriber only ever receives its own tenant's
 * call intelligence.
 */
async function broadcastEvent(
  supabaseUrl: string,
  serviceKey: string,
  topic: string,
  event: string,
  payload: Record<string, unknown>,
): Promise<void> {
  try {
    const res = await fetch(`${supabaseUrl.replace(/\/$/, "")}/realtime/v1/api/broadcast`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
      body: JSON.stringify({ messages: [{ topic, event, payload }] }),
    });
    if (!res.ok) {
      console.error("[paige-stt] realtime broadcast failed", { status: res.status, topic, event });
    }
  } catch (e) {
    console.error("[paige-stt] realtime broadcast threw", { event, message: (e as Error)?.message });
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

  // #140 B3 — the co-pilot intelligence layer is ON by default (the moat surface), killable via
  // VOICE_COPILOT_ENABLED="false". The HARD per-call cost cap across ALL B3 LLM work is env-tunable.
  const copilotEnabled = (Deno.env.get("VOICE_COPILOT_ENABLED") ?? "true").toLowerCase() !== "false";
  const copilotCostCapUsd = Number(Deno.env.get("VOICE_COPILOT_COST_CAP_USD") ?? "0.5");

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
  let copilot: CallCopilot | null = null; // #140 B3 — armed once the token gates the tenant (below)

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

    // #140 B3 — end-of-call: synthesize the follow-up (→ cs_draft approval + draft_ready), settle any
    // in-flight whisper/at-risk work, and meter B3 usage. Detached under EdgeRuntime.waitUntil so it
    // SURVIVES the socket close (the isolate would otherwise be reclaimed). finalize() is idempotent
    // and never throws (§13), so a second teardown (error+close) can't double-draft or double-meter.
    if (copilot) {
      waitUntil(
        copilot.finalize().catch((e) => console.error("[paige-stt] copilot finalize error", (e as Error)?.message)),
      );
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

        // #140 B3 — arm the co-pilot with the just-verified {tenantId, callSid} (§9: derived FROM
        // the token, never a body). All heavy work rides the pure CallCopilot; seams are wired to
        // their existing homes and are tenant-scoped to THIS tenant. Degrades honestly if a seam key
        // is absent (recall → [], scan → null, draft → null), so it never breaks the call (§13).
        if (copilotEnabled && admin) {
          copilot = new CallCopilot(
            buildCopilotDeps({ admin, supabaseUrl, serviceKey, tenantId, callSid, streamSid }),
            { costCapUsd: copilotCostCapUsd },
          );
          console.log("[paige-stt] voice co-pilot armed (B3)", { tenantId, callSid, costCapUsd: copilotCostCapUsd });
        }

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
          void broadcastEvent(supabaseUrl, serviceKey, topic, "transcript", {
            call_sid: callSid,
            stream_sid: streamSid,
            transcript: t.transcript,
            is_final: t.isFinal,
            speech_final: t.speechFinal,
            confidence: t.confidence ?? null,
            at: new Date().toISOString(),
          });
          // #140 B3 — feed FINAL utterances to the intelligence layer (interim hypotheses never drive
          // a bus write or an LLM call). onTranscript returns immediately; heavy work is fired detached
          // so the audio/WS path stays light. Never throws (§13).
          if (copilot && (t.isFinal || t.speechFinal)) {
            copilot.onTranscript({ transcript: t.transcript, isFinal: t.isFinal, speechFinal: t.speechFinal });
          }
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
