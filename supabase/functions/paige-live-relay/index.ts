// Paige Live Conversation's first-party browser WebSocket boundary.
//
// verify_jwt=false is deliberate: a browser WebSocket cannot set Authorization.
// The only credential is a one-use, 45-second opaque ticket issued by the
// JWT-gated paige-live-session function. Its SHA-256 digest is consumed by an
// atomic conditional UPDATE before upgrade; tenant/thread identity is resolved
// only from that verified database row, never from query/body tenantId.
//
// This provider-free slice does not open ears, runtime, or mouth. It refuses
// audio honestly until separately approved adapters are available; no client
// voice is sent to a vendor or recorded by this function.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";
import { createRelayState, reduceRelay } from "../_shared/paige-live-relay-contract.ts";
import { consumeRelayTicket } from "../_shared/paige-live-ticket.ts";

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

  // Recheck the original caller-owned thread after the atomic claim. The
  // ticket only identifies a server-owned session; it grants no tenant choice.
  const { data: thread, error: threadError } = await admin.from("paige_chat_threads")
    .select("id").eq("id", session.thread_id).eq("tenant_id", session.tenant_id)
    .eq("caller_user_id", session.actor_user_id).maybeSingle();
  if (threadError || !thread) return new Response("thread_scope_mismatch", { status: 403 });

  const { socket, response } = Deno.upgradeWebSocket(req);
  let relay = createRelayState({
    sessionId: session.id, epoch: session.context_epoch, ticketId: "consumed",
    ticketExpiresAt: Date.now(),
  });
  const closed = new Promise<void>((resolve) => {
    socket.onclose = () => {
      relay = reduceRelay(relay, { kind: "session.cancel", at: Date.now(), reason: "socket_closed" }).state;
      resolve();
    };
    socket.onerror = () => { try { socket.close(1011, "relay_unavailable"); } catch { resolve(); } };
  });
  waitUntil(closed);
  socket.onopen = () => {
    socket.send(JSON.stringify({
      type: "unavailable", code: "adapters_not_connected",
      message: "Live audio is not connected yet. You can keep working with Paige in chat.",
    }));
    // The provider-free server never sends ready and never accepts microphone
    // frames. Give the terminal frame a task turn before closing.
    setTimeout(() => socket.close(1013, "adapters_not_connected"), 0);
  };
  socket.onmessage = () => {
    // A client that sends audio before an explicit ready frame violates the
    // contract. Do not parse, log, persist, or relay those bytes.
    try { socket.close(1008, "audio_not_ready"); } catch { /* socket already closed */ }
  };
  return response;
});
