// Paige Live Conversation control plane. Paige owns the session and context; this endpoint does
// not call a voice provider, issue a provider token, request microphone access, or accept a tool.
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";
import { z } from "https://esm.sh/zod@3.22.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" },
});

const requestSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("start"),
    thread_id: z.string().uuid(),
    context_epoch: z.string().min(1).max(512),
    entry_mode: z.enum(["embedded", "existing-popout", "requested-popout"]),
  }),
  z.object({
    action: z.literal("transition"),
    session_id: z.string().uuid(),
    thread_id: z.string().uuid(),
    context_epoch: z.string().min(1).max(512),
    transition: z.enum(["hold", "resume", "minimize", "restore", "retry", "end"]),
  }),
]);

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ code: "method_not_allowed" }, 405);
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ code: "unauthenticated" }, 401);

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const asCaller = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
  const { data: { user }, error: authError } = await asCaller.auth.getUser();
  if (authError || !user) return json({ code: "unauthenticated" }, 401);

  const parsed = requestSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return json({ code: "invalid_request" }, 400);
  const admin = createClient(supabaseUrl, serviceKey);

  const endStaleSession = async () => {
    if (parsed.data.action !== "transition" || parsed.data.transition !== "end") return null;
    const { data, error } = await admin.rpc("paige_live_session_end_stale_internal", {
      _actor_user_id: user.id,
      _session_id: parsed.data.session_id,
    });
    if (error) return json({ code: "session_transition_refused" }, error.code === "42501" ? 403 : 409);
    return json(data);
  };

  // Resolve active tenant and thread for every start and transition. Request scope can only make
  // the call fail; it never selects a tenant. Only explicit end may clean up a stale session.
  const { data: tenantValue, error: tenantError } = await asCaller.rpc("current_user_tenant_id");
  if (tenantError || !tenantValue) return (await endStaleSession()) ?? json({ code: "workspace_unresolved" }, 409);
  const tenantId = String(tenantValue);
  const epochTenant = parsed.data.context_epoch.split("|", 1)[0];
  if (epochTenant !== tenantId) return (await endStaleSession()) ?? json({ code: "stale_context" }, 409);

  const { data: thread, error: threadError } = await asCaller
    .from("paige_chat_threads")
    .select("id,tenant_id,caller_user_id")
    .eq("id", parsed.data.thread_id)
    .eq("tenant_id", tenantId)
    .eq("caller_user_id", user.id)
    .maybeSingle();
  if (threadError) {
    console.error("[paige-live-session] thread scope read failed", { code: threadError.code });
    return json({ code: "workspace_unresolved" }, 500);
  }
  if (!thread) return (await endStaleSession()) ?? json({ code: "thread_scope_mismatch" }, 403);

  if (parsed.data.action === "transition") {
    const { data, error } = await admin.rpc("paige_live_session_transition_internal", {
      _actor_user_id: user.id,
      _tenant_id: tenantId,
      _thread_id: parsed.data.thread_id,
      _context_epoch: parsed.data.context_epoch,
      _session_id: parsed.data.session_id,
      _transition: parsed.data.transition,
    });
    if (error) {
      console.error("[paige-live-session] transition refused", { code: error.code });
      return json({ code: "session_transition_refused" }, error.code === "42501" ? 403 : 409);
    }
    return json(data);
  }

  const { data, error } = await admin.rpc("paige_live_session_start_internal", {
    _actor_user_id: user.id,
    _thread_id: parsed.data.thread_id,
    _context_epoch: parsed.data.context_epoch,
    _entry_mode: parsed.data.entry_mode,
  });
  if (error) {
    console.error("[paige-live-session] start failed closed", { code: error.code });
    return json({
      ok: false,
      session_id: null,
      availability: "UNAVAILABLE",
      code: "control_plane_unavailable",
      explanation: "Paige could not verify live audio setup. Nothing was recorded or sent.",
    });
  }
  return json(data);
});
