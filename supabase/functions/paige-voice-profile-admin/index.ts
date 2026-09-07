// Platform-owner control seam for the server-owned Paige Voice Profile.
// It consumes an independently created canonical verification record; it never inspects secrets,
// calls a voice provider, or returns provider identity to a customer-facing client.
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";
import { z } from "https://esm.sh/zod@3.22.4";

const corsHeaders = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" } });

const requestSchema = z.object({
  action: z.literal("activate-approved-profile"),
  profile_id: z.string().min(1).max(128),
  paige_facing_name: z.string().min(1).max(128),
  revision: z.string().min(1).max(128),
  provider: z.enum(["elevenlabs", "openai"]),
  provider_voice_ref: z.string().min(1).max(256),
  verification_id: z.string().uuid(),
  effective_at: z.string().datetime({ offset: true }),
  speech_policy: z.object({ source: z.enum(["paige-profile", "provider-dashboard"]) }).passthrough().optional(),
});

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ code: "method_not_allowed" }, 405);
  const authorization = req.headers.get("Authorization");
  if (!authorization) return json({ code: "unauthenticated" }, 401);
  const parsed = requestSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return json({ code: "invalid_request" }, 400);

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const caller = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: authorization } } });
  const { data: { user }, error: userError } = await caller.auth.getUser();
  if (userError || !user) return json({ code: "unauthenticated" }, 401);
  const { data: isOwner, error: ownerError } = await caller.rpc("is_platform_owner");
  if (ownerError || isOwner !== true) return json({ code: "platform_owner_required" }, 403);

  const admin = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: proof, error: proofError } = await admin.from("paige_voice_provider_verifications")
    .select("id,provider,provider_voice_ref,key_scope_verified,voice_authorized,retention_policy_approved,zero_retention_confirmed,quota_verified,hard_cost_limit_usd,verified_at,evidence_ref")
    .eq("id", parsed.data.verification_id).maybeSingle();
  const verifiedAt = proof?.verified_at ? new Date(proof.verified_at).getTime() : 0;
  const fresh = verifiedAt >= Date.now() - 5 * 60_000 && verifiedAt <= Date.now() + 60_000;
  if (proofError || !proof || !fresh || proof.provider !== parsed.data.provider || proof.provider_voice_ref !== parsed.data.provider_voice_ref
    || !proof.key_scope_verified || !proof.voice_authorized || !proof.retention_policy_approved || !proof.zero_retention_confirmed
    || !proof.quota_verified || Number(proof.hard_cost_limit_usd) <= 0 || !proof.evidence_ref) {
    return json({ code: "canonical_provider_proof_required" }, 409);
  }

  const { error: readinessError } = await admin.rpc("set_paige_voice_readiness_internal", {
    _transport_enabled: true, _availability: "PARTIAL", _realtime_stt: "PARTIAL", _streaming_tts: "PARTIAL",
    _key_scope_verified: true, _voice_authorized: true, _retention_policy_approved: true,
    _zero_retention_confirmed: true, _quota_verified: true, _hard_cost_limit_usd: proof.hard_cost_limit_usd,
    _provider_verification_id: proof.id, _account_verification_receipt_ref: proof.evidence_ref,
    _account_verified_at: proof.verified_at, _actor_user_id: user.id,
  });
  if (readinessError) return json({ code: "readiness_update_refused" }, 409);
  const { data: result, error: profileError } = await admin.rpc("set_paige_voice_profile_internal", {
    _slot: "active", _profile_id: parsed.data.profile_id, _paige_facing_name: parsed.data.paige_facing_name,
    _revision: parsed.data.revision, _provider: parsed.data.provider, _provider_voice_ref: parsed.data.provider_voice_ref,
    _approved: true, _speech_policy: parsed.data.speech_policy ?? { source: "provider-dashboard" },
    _effective_at: parsed.data.effective_at, _actor_user_id: user.id, _provider_verification_id: proof.id,
    _provider_verified_at: proof.verified_at, _provider_verification_receipt_ref: proof.evidence_ref,
  });
  if (profileError) return json({ code: "profile_update_refused" }, 409);
  return json({ ok: true, paige_facing_name: result?.paige_facing_name ?? parsed.data.paige_facing_name, revision: result?.revision ?? parsed.data.revision, status: "approved" });
});
