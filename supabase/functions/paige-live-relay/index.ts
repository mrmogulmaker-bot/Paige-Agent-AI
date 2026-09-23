// Paige Live Conversation's first-party browser WebSocket boundary.
//
// verify_jwt=false is deliberate: a browser WebSocket cannot set Authorization.
// The only credential is a one-use, 45-second opaque ticket issued by the
// JWT-gated paige-live-session function. Its SHA-256 digest is consumed by an
// atomic conditional UPDATE before upgrade; tenant/thread identity is resolved
// only from that verified database row, never from query/body tenantId.
//
// Pilot availability defaults off in the platform-owned table. Only after a
// consumed ticket, current caller-owned thread, standing, and pilot gate do
// server-side ears/mouth adapters open. The canonical paige-ai-chat stream
// remains the sole runtime; this relay never executes a spoken approval.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";
import { APPROVED_PAIGE_ELEVENLABS_VOICE_ID, elevenlabsSpeechStream, resolveElevenLabsModel } from "../_shared/elevenlabs.ts";
import { envKey } from "../_shared/env-key.ts";
import { openFluxEars } from "../_shared/paige-live-flux-ears.ts";
import { LiveRelayAdmission, PaigeLiveRelayBridge } from "../_shared/paige-live-relay-bridge.ts";
import { createLiveRuntimeProof, liveRuntimeDigest } from "../_shared/paige-live-runtime-proof.ts";
import { consumeRelayTicket, hasLiveWorkspaceStanding, isLiveAudioPilotEnabled, isLiveWorkspaceCurrent } from "../_shared/paige-live-ticket.ts";

const waitUntil = (promise: Promise<unknown>): void => {
  const runtime = (globalThis as unknown as { EdgeRuntime?: { waitUntil?: (p: Promise<unknown>) => void } }).EdgeRuntime;
  runtime?.waitUntil?.(promise);
};

Deno.serve(async (req) => {
  if (req.headers.get("upgrade")?.toLowerCase() !== "websocket") {
    return new Response("expected_websocket", { status: 426 });
  }
  const url = new URL(req.url);
  const ticket = url.searchParams.get("ticket") ?? "";
  const sessionId = url.searchParams.get("session") ?? "";
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey) return new Response("relay_unavailable", { status: 503 });
  const admin = createClient(supabaseUrl, serviceKey);

  // The conditional UPDATE is the single-use claim. Concurrent/replayed or
  // expired tickets return no row. No socket or adapter exists before this gate.
  const session = await consumeRelayTicket(ticket, sessionId, {
    async consume(id, storedDigest) {
      const { data, error } = await admin.from("paige_live_sessions")
        .update({ provider_session_ref: null, state: "connecting", updated_at: new Date().toISOString() })
        .eq("id", id).eq("provider_session_ref", storedDigest)
        .in("state", ["connecting", "reconnecting"])
        .select("id,tenant_id,actor_user_id,thread_id,context_epoch").maybeSingle();
      if (error) {
        console.error("[paige-live-relay] ticket claim failed", { code: error.code });
        return null;
      }
      return data;
    },
  });
  if (!session) return new Response("invalid_or_consumed_ticket", { status: 401 });

  const markUnavailable = async (code: string): Promise<boolean> => {
    const { data, error } = await admin.from("paige_live_sessions")
      .update({
        state: "unavailable", availability: "UNAVAILABLE", failure_code: code,
        updated_at: new Date().toISOString(),
      })
      .eq("id", session.id).eq("tenant_id", session.tenant_id)
      .eq("actor_user_id", session.actor_user_id)
      .in("state", ["connecting", "listening", "thinking", "speaking", "interrupted", "held"])
      .select("id").maybeSingle();
    if (error || !data) {
      console.error("[paige-live-relay] terminal state write failed", { code: error?.code });
      return false;
    }
    return true;
  };

  const readProviderAdmission = async () => {
  // Read back the one corrected Jessica candidate. Active read-aloud stays on
  // OpenAI; neither a browser value nor a tenant preference selects a voice.
  const { data: voice, error: voiceError } = await admin.from("paige_voice_profiles")
    .select("provider,provider_voice_ref,revision,active,approved,status,provider_verification_id,provider_verification_receipt_ref,approved_at")
    .eq("slot", "candidate").maybeSingle();
  const voiceReady = !voiceError && voice?.provider === "elevenlabs" &&
    voice.provider_voice_ref === APPROVED_PAIGE_ELEVENLABS_VOICE_ID &&
    voice.revision === "elevenlabs-jessica-take5-r1" && voice.active === false &&
    voice.approved === true && voice.status === "approved" && !!voice.approved_at &&
    !!voice.provider_verification_id && !!voice.provider_verification_receipt_ref;
  const { data: readiness, error: readinessError } = await admin.from("paige_voice_readiness")
    .select("key_scope_verified,voice_authorized,retention_policy_approved,zero_retention_confirmed,provider_verification_id,account_verification_receipt_ref,account_verified_at")
    .eq("singleton", true).maybeSingle();
  const { data: verification, error: verificationError } = voice?.provider_verification_id
    ? await admin.from("paige_voice_provider_verifications")
      .select("provider,provider_voice_ref,evidence_ref,key_scope_verified,voice_authorized,retention_policy_approved,zero_retention_confirmed")
      .eq("id", voice.provider_verification_id).maybeSingle()
    : { data: null, error: null };
  // Pilot rollout is not provider/privacy approval. Reuse the canonical proof
  // records; never infer entitlement or retention from a present API key. No
  // legacy quota/rate/ceiling fields participate: costs belong to the Budget lane.
  const privacyReady = !readinessError && !verificationError &&
    readiness?.provider_verification_id === voice?.provider_verification_id &&
    !!readiness?.account_verification_receipt_ref && !!readiness?.account_verified_at &&
    verification?.provider === "elevenlabs" &&
    verification?.provider_voice_ref === APPROVED_PAIGE_ELEVENLABS_VOICE_ID &&
    verification?.evidence_ref === voice?.provider_verification_receipt_ref &&
    verification?.evidence_ref === readiness?.account_verification_receipt_ref &&
    [readiness, verification].every((row) => row?.key_scope_verified === true &&
      row.voice_authorized === true && row.retention_policy_approved === true && row.zero_retention_confirmed === true);
  const modelReady = resolveElevenLabsModel() !== null;
  // Account-level Deepgram training opt-out is an operational fact, not
  // inferred from the per-request flag. This server-side switch stays OFF
  // until the owner has checked the account setting; no tenant can set it.
  const mipAccountVerified = envKey("DEEPGRAM_MIP_ACCOUNT_VERIFIED") === "true";
  const runtimeSigningKey = envKey("PAIGE_LIVE_STREAM_SIGNING_KEY") ?? "";
  const unavailableCode = !voiceReady ? "approved_voice_unavailable"
    : !privacyReady ? "audio_privacy_not_verified"
    : !modelReady || !envKey("ELEVENLABS_API_KEY") ? "mouth_not_configured"
    : !envKey("DEEPGRAM_API_KEY") ? "ears_not_configured"
    : !mipAccountVerified ? "audio_privacy_not_verified"
    : runtimeSigningKey.length < 32 ? "runtime_not_configured"
    : null;
    return { voice, runtimeSigningKey, unavailableCode };
  };

  const checkCurrentAdmission = async (recheckProvider = true): Promise<Response | null> => {
  // The platform's canonical transport switch is independent of tenant pilot
  // rollout and provider proof. Re-read it on the existing admission monitor,
  // so disabling live audio also stops an already-connected relay.
  const { data: transport, error: transportError } = await admin.from("paige_voice_readiness")
    .select("transport_enabled").eq("singleton", true).maybeSingle();
  if (transportError || transport?.transport_enabled !== true) {
    if (!await markUnavailable("live_audio_not_enabled")) return new Response("relay_unavailable", { status: 503 });
    return new Response("live_audio_not_enabled", { status: 403 });
  }
  const { data: currentSession, error: currentSessionError } = await admin.from("paige_live_sessions")
    .select("id").eq("id", session.id).eq("tenant_id", session.tenant_id)
    .eq("actor_user_id", session.actor_user_id).eq("thread_id", session.thread_id)
    .eq("context_epoch", session.context_epoch)
    .in("state", ["connecting", "listening", "thinking", "speaking", "interrupted", "held"])
    .maybeSingle();
  if (currentSessionError || !currentSession) return new Response("live_admission_changed", { status: 403 });
  // The same resolution is reused before provider open, before ready and
  // throughout capture. Admission is never a once-per-socket privacy decision.
  // Recheck the original caller-owned thread after the atomic claim. The
  // ticket only identifies a server-owned session; it grants no tenant choice.
  const { data: thread, error: threadError } = await admin.from("paige_chat_threads")
    .select("id").eq("id", session.thread_id).eq("tenant_id", session.tenant_id)
    .eq("caller_user_id", session.actor_user_id).maybeSingle();
  if (threadError || !thread) {
    if (!await markUnavailable("thread_scope_mismatch")) return new Response("relay_unavailable", { status: 503 });
    return new Response("thread_scope_mismatch", { status: 403 });
  }
  // A ticket binds the original user, tenant and thread. Recheck the current
  // workspace and the same standing alternatives as current_user_tenant_id()
  // before upgrade; an agency user need not have a child tenant_members row.
  // No role label changes the caller-owned thread or grants tenant writes.
  const { data: profile, error: profileError } = await admin.from("profiles")
    .select("active_tenant_id").eq("user_id", session.actor_user_id).maybeSingle();
  if (profileError) {
    if (!await markUnavailable("workspace_unresolved")) return new Response("relay_unavailable", { status: 503 });
    return new Response("workspace_unresolved", { status: 503 });
  }
  let activeTenantHasStanding = false;
  if (profile?.active_tenant_id) {
    const { data: activeMembership, error: activeMembershipError } = await admin.from("tenant_members")
      .select("id").eq("tenant_id", profile.active_tenant_id)
      .eq("user_id", session.actor_user_id).eq("status", "active").maybeSingle();
    if (activeMembershipError) {
      if (!await markUnavailable("workspace_unresolved")) return new Response("relay_unavailable", { status: 503 });
      return new Response("workspace_unresolved", { status: 503 });
    }
    activeTenantHasStanding = !!activeMembership;
    if (!activeTenantHasStanding) {
      const [activeChildAccess, activeAgencyRole, activePlatformRole] = await Promise.all([
        admin.rpc("agency_can_manage_child", { _child: profile.active_tenant_id, _actor: session.actor_user_id }),
        admin.rpc("agency_team_role", { _agency: profile.active_tenant_id, _actor: session.actor_user_id }),
        admin.rpc("is_platform_admin", { _actor: session.actor_user_id }),
      ]);
      if (activeChildAccess.error || activeAgencyRole.error || activePlatformRole.error) {
        if (!await markUnavailable("workspace_unresolved")) return new Response("relay_unavailable", { status: 503 });
        return new Response("workspace_unresolved", { status: 503 });
      }
      activeTenantHasStanding = hasLiveWorkspaceStanding(false, activeChildAccess.data, activeAgencyRole.data, activePlatformRole.data);
    }
  }
  let fallbackTenantId: string | null = null;
  if (!activeTenantHasStanding) {
    const { data: fallback, error: fallbackError } = await admin.from("tenant_members")
      .select("tenant_id").eq("user_id", session.actor_user_id).eq("status", "active")
      .order("joined_at", { ascending: true }).limit(1).maybeSingle();
    if (fallbackError) {
      if (!await markUnavailable("workspace_unresolved")) return new Response("relay_unavailable", { status: 503 });
      return new Response("workspace_unresolved", { status: 503 });
    }
    fallbackTenantId = fallback?.tenant_id ?? null;
  }
  if (!isLiveWorkspaceCurrent(session.tenant_id, profile?.active_tenant_id, activeTenantHasStanding, fallbackTenantId)) {
    if (!await markUnavailable("stale_context")) return new Response("relay_unavailable", { status: 503 });
    return new Response("stale_context", { status: 403 });
  }
  const { data: membership, error: membershipError } = await admin.from("tenant_members")
    .select("id").eq("tenant_id", session.tenant_id)
    .eq("user_id", session.actor_user_id).eq("status", "active").maybeSingle();
  if (membershipError) {
    if (!await markUnavailable("workspace_unresolved")) return new Response("relay_unavailable", { status: 503 });
    return new Response("workspace_unresolved", { status: 503 });
  }
  let hasStanding = !!membership;
  if (!hasStanding) {
    const [childAccess, agencyRole, platformRole] = await Promise.all([
      admin.rpc("agency_can_manage_child", { _child: session.tenant_id, _actor: session.actor_user_id }),
      admin.rpc("agency_team_role", { _agency: session.tenant_id, _actor: session.actor_user_id }),
      admin.rpc("is_platform_admin", { _actor: session.actor_user_id }),
    ]);
    if (childAccess.error || agencyRole.error || platformRole.error) {
      if (!await markUnavailable("workspace_unresolved")) return new Response("relay_unavailable", { status: 503 });
      return new Response("workspace_unresolved", { status: 503 });
    }
    hasStanding = hasLiveWorkspaceStanding(false, childAccess.data, agencyRole.data, platformRole.data);
  }
  if (!hasStanding) {
    if (!await markUnavailable("membership_inactive")) return new Response("relay_unavailable", { status: 503 });
    return new Response("membership_inactive", { status: 403 });
  }
  const { data: tenantPilot, error: pilotError } = await admin.from("paige_live_tenant_availability")
    .select("enabled").eq("tenant_id", session.tenant_id).maybeSingle();
  const pilotEnabled = !pilotError && isLiveAudioPilotEnabled(tenantPilot);
  if (!pilotEnabled) {
    if (!await markUnavailable("live_audio_not_enabled")) return new Response("relay_unavailable", { status: 503 });
    return new Response("live_audio_not_enabled", { status: 403 });
  }
  // Provider approval is revocable just like workspace authority. Reuse the
  // same canonical proof on every monitor decision and before further speech.
  if (recheckProvider) {
    const { unavailableCode: providerFailure } = await readProviderAdmission();
    if (providerFailure) {
      if (!await markUnavailable(providerFailure)) return new Response("relay_unavailable", { status: 503 });
      return new Response(providerFailure, { status: 403 });
    }
  }
  return null;
  };
  // Initial identity/standing checks still precede upgrade. A provider refusal
  // uses the structured unavailable socket below (browser WS cannot read a
  // failed handshake body). Recurring checks always include provider approval.
  const admissionFailure = await checkCurrentAdmission(false);
  if (admissionFailure) return admissionFailure;
  const { voice, runtimeSigningKey, unavailableCode } = await readProviderAdmission();
  if (unavailableCode) {
    if (!await markUnavailable(unavailableCode)) return new Response("relay_unavailable", { status: 503 });
    const { socket, response } = Deno.upgradeWebSocket(req);
    const closed = new Promise<void>((resolve) => { socket.onclose = () => resolve(); });
    waitUntil(closed);
    socket.onopen = () => {
      socket.send(JSON.stringify({
        type: "unavailable", code: unavailableCode,
        message: "Live audio isn't ready for this workspace yet. You can keep working with Paige in chat.",
      }));
      setTimeout(() => socket.close(1013, "live_audio_unavailable"), 0);
    };
    socket.onmessage = () => { try { socket.close(1008, "audio_not_ready"); } catch { /* closed */ } };
    return response;
  }

  const { socket, response } = Deno.upgradeWebSocket(req);
  const markLive = async (): Promise<boolean> => {
    const { data, error } = await admin.from("paige_live_sessions")
      .update({
        state: "listening", availability: "LIVE", failure_code: null,
        profile_provider: "elevenlabs",
        profile_provider_voice_ref: APPROVED_PAIGE_ELEVENLABS_VOICE_ID,
        profile_revision: voice?.revision,
        updated_at: new Date().toISOString(),
      })
      .eq("id", session.id).eq("tenant_id", session.tenant_id)
      .eq("actor_user_id", session.actor_user_id).eq("state", "connecting")
      .select("id").maybeSingle();
    if (error || !data) {
      console.error("[paige-live-relay] ready state write failed", { code: error?.code });
      return false;
    }
    return true;
  };
  const markFailed = async (code: string): Promise<void> => {
    const { error } = await admin.from("paige_live_sessions")
      .update({
        state: "unavailable", availability: "UNAVAILABLE",
        failure_code: code, updated_at: new Date().toISOString(),
      })
      .eq("id", session.id).eq("tenant_id", session.tenant_id)
      .eq("actor_user_id", session.actor_user_id)
      .in("state", ["connecting", "listening", "thinking", "speaking", "interrupted", "held"]);
    if (error) console.error("[paige-live-relay] failure state write failed", { code: error.code });
  };
  let failureWrite: Promise<void> | null = null;
  let admissionTimer: ReturnType<typeof setInterval> | undefined;
  const admission = new LiveRelayAdmission(
    async () => (await checkCurrentAdmission()) === null,
    () => bridge.unavailable("live_admission_changed"),
  );
  const runtimeProof = createLiveRuntimeProof(runtimeSigningKey);
  const bridge = new PaigeLiveRelayBridge({
    sessionId: session.id, epoch: session.context_epoch,
    send(frame) { if (socket.readyState === WebSocket.OPEN) socket.send(frame); },
    close(code, reason) {
      if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
        try { socket.close(code, reason); } catch { /* already closed */ }
      }
    },
    openEars: (events) => openFluxEars(events),
    async openMouth(text, signal) {
      if (!await admission.check(true)) throw new Error("live_admission_changed");
      const response = await elevenlabsSpeechStream({
        text, voiceId: APPROVED_PAIGE_ELEVENLABS_VOICE_ID,
        modelId: resolveElevenLabsModel() ?? "",
      }, signal);
      if (!response.body) throw new Error("mouth_stream_missing");
      return response.body;
    },
    usage: { emit() { /* Neutral UsageSink seam. Budget lane supplies persistence later. */ } },
    authorize: (force) => admission.check(force),
    runtimeProof: {
      readOutput: async (token) => await admission.check() ? runtimeProof.readOutput(token) : null,
      async issue(turnId, transcript) {
        if (!await admission.check()) throw new Error("live_admission_changed");
        const challenge = await runtimeProof.issue({
          sessionId: session.id, tenantId: session.tenant_id, actorId: session.actor_user_id,
          threadId: session.thread_id, epoch: session.context_epoch, turnId,
        }, transcript);
        // Reuse the service-only one-use slot AFTER the connection ticket was
        // consumed. Renewal returns to connecting and invalidates this challenge.
        const { data, error } = await admin.from("paige_live_sessions")
          .update({ provider_session_ref: `runtime:${await liveRuntimeDigest(challenge.token)}` })
          .eq("id", session.id).eq("tenant_id", session.tenant_id)
          .eq("actor_user_id", session.actor_user_id).eq("context_epoch", session.context_epoch)
          .eq("availability", "LIVE").in("state", ["listening", "thinking", "speaking", "interrupted", "held"])
          .select("id").maybeSingle();
        if (error || !data) throw new Error("live_runtime_admission_changed");
        return challenge;
      },
    },
    onFailure(code) {
      failureWrite = markFailed(code);
      waitUntil(failureWrite);
    },
  });
  const closed = new Promise<void>((resolve) => {
    socket.onclose = () => {
      clearInterval(admissionTimer);
      admission.stop();
      bridge.end();
      // A socket ending is not the user ending their logical conversation:
      // Minimize, hidden windows and reconnect all close the audio transport.
      // The existing authenticated control plane owns durable minimize/end.
      // Never overwrite it (or a renewed socket) from a delayed close callback.
      void Promise.resolve(failureWrite).finally(resolve);
    };
    socket.onerror = () => { try { socket.close(1011, "relay_unavailable"); } catch { resolve(); } };
  });
  waitUntil(closed);
  socket.onopen = () => {
    waitUntil((async () => {
      if (!await bridge.open()) return;
      if (!await admission.check(true)) return;
      if (!await markLive()) {
        bridge.unavailable("live_admission_changed");
        return;
      }
      if (!await admission.check(true)) return;
      bridge.ready();
      admissionTimer = setInterval(() => { waitUntil(admission.check(true)); }, 500);
    })());
  };
  socket.onmessage = (event) => {
    if (typeof event.data === "string" || event.data instanceof ArrayBuffer) {
      bridge.receive(event.data);
    } else {
      try { socket.close(1008, "invalid_audio_frame"); } catch { /* socket already closed */ }
    }
  };
  return response;
});
