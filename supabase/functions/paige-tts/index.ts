// #131 — paige-tts: per-message chat voice PLAYBACK. A JWT-gated HTTP endpoint that synthesizes a
// Paige/assistant message to speech via OpenAI TTS (routed through the ONE TTS home,
// _shared/tts-router.ts, §18/§34) and STREAMS the mp3 back so the client's <audio> element plays it.
//
// FLOW
//   1. §9 GATE — resolve the tenant FROM the JWT (authed.rpc("current_user_tenant_id")), NEVER a
//      body tenant_id. Any authenticated workspace member may play back a message (playback is
//      benign; no role gate).
//   2. Resolve the VOICE (§7 tenant-authored): tenants.features.playbook_config.paige_voice if the
//      tenant authored one; else the subscription-tier default; else the base default. A caller
//      body.voice_id (valid catalog voice) wins. Invalid/custom voices degrade — never a 400 (§15).
//   3. §14 CACHE — key = SHA-256(model:voice:text), path = <tenantId>/<hash>.mp3 in the PRIVATE,
//      tenant-scoped `tts-cache` bucket (§9 — never cross-tenant). HIT → stream the stored bytes
//      (zero OpenAI cost, instant), meter with cache_hit:true. MISS → call OpenAI via the router,
//      TEE the stream (one branch → client, one branch → cache upload), meter with cache_hit:false.
//   4. §17 METER — chars to platform_usage_events { event_type:"tts_char", unit:"char" }, service-role.
//   5. §13 HONEST DEGRADE — OPENAI_API_KEY absent → 503 { error:"tts_not_configured" }; the RESERVED
//      ElevenLabs tier (#132) → 503 { error:"tts_tier_reserved" }. NEVER a fake/empty audio body.
//
// verify_jwt=true (config.toml): a normal authenticated fetch from the chat UI. The Authorization
// header carries the caller's session; the tenant is derived server-side from it.
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";
import {
  planTtsSynthesis,
  resolveVoiceId,
  ttsCacheKey,
  synthesizeSpeechStream,
} from "../_shared/tts-router.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const CACHE_BUCKET = "tts-cache";
const MAX_TEXT_CHARS = 4096; // OpenAI TTS hard limit; cap here so a long message never 400s at OpenAI.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
const audioHeaders = {
  ...corsHeaders,
  "Content-Type": "audio/mpeg",
  "Cache-Control": "no-store", // the mp3 is tenant-private; the durable cache is our Storage bucket
};

/** Best-effort background work that must outlive the streamed response (cache upload + meter). Uses
 *  the edge runtime's waitUntil when present so the write completes after we return; else awaits. */
function runAfter(p: Promise<void>): void {
  const wu = (globalThis as unknown as { EdgeRuntime?: { waitUntil?: (p: Promise<unknown>) => void } }).EdgeRuntime?.waitUntil;
  if (wu) wu(p.catch((e) => console.error("[paige-tts] background task failed:", (e as Error)?.message)));
  else void p.catch((e) => console.error("[paige-tts] background task failed:", (e as Error)?.message));
}

/** §17 meter — chars to platform_usage_events (service-role, tenant-scoped). Never throws into the
 *  request path; a metering failure is logged, not surfaced. */
async function meterChars(
  admin: ReturnType<typeof createClient>,
  tenantId: string,
  chars: number,
  meta: Record<string, unknown>,
): Promise<void> {
  try {
    const { error } = await admin.from("platform_usage_events").insert({
      tenant_id: tenantId,
      event_type: "tts_char",
      quantity: chars,
      unit: "char",
      metadata: meta,
    });
    if (error) console.error("[paige-tts] meter insert failed", { code: error.code, message: error.message, tenantId });
  } catch (e) {
    console.error("[paige-tts] meter insert threw", (e as Error)?.message);
  }
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  try {
    // ── §9 GATE: authenticate + derive tenant FROM the JWT, never the body ──
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "unauthenticated" }, 401);
    const authed = createClient(supabaseUrl, supabaseAnonKey, { global: { headers: { Authorization: authHeader } } });
    const { data: { user }, error: uErr } = await authed.auth.getUser();
    if (uErr || !user) return json({ error: "unauthenticated" }, 401);

    const { data: resolvedTenant, error: tErr } = await authed.rpc("current_user_tenant_id");
    if (tErr) {
      console.error("[paige-tts] tenant resolve failed:", tErr.message);
      return json({ error: "workspace_unresolved" }, 500);
    }
    const tenantId = String(resolvedTenant ?? "").trim();
    if (!tenantId) return json({ error: "workspace_unresolved" }, 400);

    // ── Body ──
    const body = await req.json().catch(() => ({}));
    const text = String(body?.text ?? "").trim();
    const requestedVoice = body?.voice_id != null ? String(body.voice_id) : null;
    if (!text) return json({ error: "empty_text" }, 400);
    const capped = text.length > MAX_TEXT_CHARS ? text.slice(0, MAX_TEXT_CHARS) : text;

    const admin = createClient(supabaseUrl, supabaseServiceKey);

    // ── Resolve the voice (§7 tenant-authored config-as-data) ──
    // playbook_config.paige_voice (authored) + the platform plan slug (tier default). Both are
    // best-effort reads: a missing/unreadable value degrades to the tier/base default, never a 400.
    let playbookVoice: string | null = null;
    let planSlug: string | null = null;
    try {
      const { data: t } = await admin.from("tenants").select("features").eq("id", tenantId).maybeSingle();
      const features = ((t as { features?: unknown } | null)?.features ?? {}) as Record<string, unknown>;
      const pc = (features.playbook_config ?? {}) as Record<string, unknown>;
      if (typeof pc.paige_voice === "string") playbookVoice = pc.paige_voice;
    } catch (e) {
      console.warn("[paige-tts] tenant voice read failed (using tier/default):", (e as Error)?.message);
    }
    try {
      // Join to the plan for its slug (tier default, §7). Active sub only; best-effort.
      const { data: sub } = await admin
        .from("platform_subscriptions")
        .select("status, plan:platform_subscription_plans(slug)")
        .eq("tenant_id", tenantId)
        .eq("status", "active")
        .maybeSingle();
      const s = sub as { status?: string | null; plan?: { slug?: string | null } | null } | null;
      if (s?.plan?.slug) planSlug = s.plan.slug;
    } catch (e) {
      console.warn("[paige-tts] plan read failed (using base default):", (e as Error)?.message);
    }

    const { voice, source: voiceSource } = resolveVoiceId({ requested: requestedVoice, playbookVoice, planSlug });

    // ── Plan the synthesis (honest degrade before any cost) ──
    const plan = planTtsSynthesis("openai-standard", voice);
    if (!plan.ok) {
      if ("needs_config" in plan) {
        console.error("[paige-tts] OPENAI_API_KEY absent — honest needs_config degrade");
        return json({ error: "tts_not_configured" }, 503);
      }
      if ("reserved" in plan) {
        console.warn("[paige-tts] reserved marketplace tier requested (#132) — not wired");
        return json({ error: "tts_tier_reserved" }, 503);
      }
      console.error("[paige-tts] route error:", plan.error);
      return json({ error: "tts_route_error" }, 500);
    }

    const cacheKey = await ttsCacheKey(capped, plan.voice, plan.model);
    const cachePath = `${tenantId}/${cacheKey}.mp3`; // §9 tenant-scoped path

    // ── §14 CACHE LOOKUP — a HIT skips OpenAI entirely ──
    try {
      const { data: cached } = await admin.storage.from(CACHE_BUCKET).download(cachePath);
      if (cached) {
        const buf = await cached.arrayBuffer();
        console.log("[paige-tts] cache HIT", { tenantId, voice: plan.voice, bytes: buf.byteLength });
        runAfter(
          meterChars(admin, tenantId, capped.length, {
            voice: plan.voice,
            model: plan.model,
            tier: plan.provider,
            voice_source: voiceSource,
            cache_hit: true,
          }),
        );
        return new Response(buf, { headers: audioHeaders });
      }
    } catch {
      // Not cached (or bucket read miss) — fall through to synth. Never fatal.
    }

    // ── §14 CACHE MISS — synthesize, TEE (client + cache), meter ──
    let openaiResp: Response;
    try {
      openaiResp = await synthesizeSpeechStream({ model: plan.model, voice: plan.voice }, capped);
    } catch (e) {
      // A live OpenAI failure — honest, never a fake audio body (§13/§32).
      console.error("[paige-tts] OpenAI synth failed:", (e as Error)?.message);
      return json({ error: "tts_synth_failed" }, 502);
    }
    const srcBody = openaiResp.body;
    if (!srcBody) {
      console.error("[paige-tts] OpenAI returned no body");
      return json({ error: "tts_synth_failed" }, 502);
    }

    const [clientStream, cacheStream] = srcBody.tee();

    // Background: drain the cache branch, upload to the tenant-scoped path (upsert), then meter.
    runAfter(
      (async () => {
        const chunks: Uint8Array[] = [];
        const reader = cacheStream.getReader();
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          if (value) chunks.push(value);
        }
        let total = 0;
        for (const c of chunks) total += c.length;
        const bytes = new Uint8Array(total);
        let off = 0;
        for (const c of chunks) { bytes.set(c, off); off += c.length; }
        const { error: upErr } = await admin.storage
          .from(CACHE_BUCKET)
          .upload(cachePath, bytes, { contentType: "audio/mpeg", upsert: true });
        if (upErr) console.error("[paige-tts] cache upload failed", { message: upErr.message, tenantId });
        else console.log("[paige-tts] cache STORED", { tenantId, voice: plan.voice, bytes: bytes.length });
        await meterChars(admin, tenantId, capped.length, {
          voice: plan.voice,
          model: plan.model,
          tier: plan.provider,
          voice_source: voiceSource,
          cache_hit: false,
        });
      })(),
    );

    // Stream the mp3 to the client immediately (progressive — the <audio> plays as it arrives).
    return new Response(clientStream, { headers: audioHeaders });
  } catch (e) {
    console.error("[paige-tts] unhandled error:", (e as Error)?.message);
    return json({ error: "tts_internal_error" }, 500);
  }
});
