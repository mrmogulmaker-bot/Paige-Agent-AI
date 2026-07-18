// generate-image — Paige generates marketing images for a tenant, stores them in the public
// paige-generated bucket, returns URLs. Admin|coach only. Tenant-generic (§2).
//
// PROVIDER (owner directive 2026-07-15): Google Gemini image generation is the DEFAULT (cheaper,
// stronger visual quality for hero/marketing art per the owner's own evaluation). OpenAI
// gpt-image-1 is the ESCALATION — pass provider:"openai" (or the caller re-requests after a
// customer isn't happy with the Gemini result) to get an alternate style. Both are optional at
// the secret level: whichever key(s) are configured is what's actually offered; a request for a
// provider whose key isn't set returns a clear needs_config error rather than crashing.
// Featherless is NOT used here — it is a text-LLM host (Llama/Qwen/Mistral/Gemma/DeepSeek/Kimi);
// it has no verified image-generation models in its catalog (§13 — do not assume otherwise).
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SIZE_MAP: Record<string, string> = {
  square: "1024x1024",
  portrait: "1024x1536",
  landscape: "1536x1024",
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization header");
    const authed = createClient(supabaseUrl, supabaseAnonKey, { global: { headers: { Authorization: authHeader } } });
    const { data: { user }, error: uErr } = await authed.auth.getUser();
    if (uErr || !user) throw new Error("Unauthorized");
    const { data: roleRows } = await authed.from("user_roles").select("role").eq("user_id", user.id);
    const roles = (roleRows || []).map((r: any) => r.role);
    if (!roles.some((r: string) => r === "admin" || r === "super_admin" || r === "coach")) {
      return new Response(JSON.stringify({ error: "Admin or coach access required." }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const body = await req.json();
    const prompt = String(body?.prompt ?? "").trim();
    const size = SIZE_MAP[body?.size] ?? "1024x1024";
    const tenantId = body?.tenant_id ?? null;
    // provider: "gemini" (default) or "openai" (the escalation path — caller re-requests this
    // when a customer isn't happy with the default result). An UNKNOWN value 400s so the caller
    // knows their request wasn't honored. (A KNOWN provider whose KEY is missing is handled below:
    // it falls back to whichever provider IS configured, reporting which one actually served it.)
    const requestedProvider = String(body?.provider ?? "gemini").toLowerCase();
    if (requestedProvider !== "gemini" && requestedProvider !== "openai") {
      return new Response(JSON.stringify({ error: `Unknown image provider "${requestedProvider}".` }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (prompt.length < 4) {
      return new Response(JSON.stringify({ error: "Describe the image you want." }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
    // Which providers this function can actually SEE at runtime (booleans only — never the key
    // values). Returned in the needs_config response so a misconfigured/wrong-scoped secret is
    // self-diagnosing rather than a mystery ("it says off but I set the key").
    const configured = { gemini: !!GEMINI_API_KEY, openai: !!OPENAI_API_KEY };

    // Honor the requested provider when ITS key is live; otherwise FALL BACK to whichever provider is
    // actually configured. A missing default-provider (Gemini) key must never hard-fail generation when
    // the other provider is ready — we generate with what's live and report which provider served it.
    // Only when NEITHER key is visible do we return an honest needs_config (owner: "OpenAI is set" — so
    // a Gemini-key gap alone should never have blocked the carousel).
    let provider: "gemini" | "openai" = requestedProvider === "openai" ? "openai" : "gemini";
    let providerKey = provider === "openai" ? OPENAI_API_KEY : GEMINI_API_KEY;
    if (!providerKey) {
      if (OPENAI_API_KEY) { provider = "openai"; providerKey = OPENAI_API_KEY; }
      else if (GEMINI_API_KEY) { provider = "gemini"; providerKey = GEMINI_API_KEY; }
    }
    if (!providerKey) {
      console.warn("generate-image: no image provider key set (gemini + openai both absent)");
      return new Response(JSON.stringify({
        error: "Image generation isn't switched on yet — no image provider key is set. Add GEMINI_API_KEY or OPENAI_API_KEY to this project's Supabase Edge Function secrets.",
        needs_config: true,
        configured,
      }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Tenant isolation (§9): the image is stored + filed under tenantId, so the caller
    // must actually belong to that tenant (platform admins excepted). Without this a coach
    // in one tenant could plant objects in another's storage prefix + Content Studio library.
    if (tenantId) {
      const isPlatformAdmin = roles.some((r: string) => r === "admin" || r === "super_admin");
      if (!isPlatformAdmin) {
        const { data: isMember } = await authed.rpc("is_tenant_member", { _tenant: tenantId });
        if (!isMember) {
          return new Response(JSON.stringify({ error: "You don't have access to that workspace." }), {
            status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
      }
    }

    let b64: string | undefined;
    if (provider === "openai") {
      const oai = await fetch("https://api.openai.com/v1/images/generations", {
        method: "POST",
        headers: { "Authorization": `Bearer ${providerKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model: "gpt-image-1", prompt, n: 1, size }),
      });
      if (!oai.ok) {
        const errText = await oai.text();
        throw new Error(`OpenAI image model error (${oai.status}): ${errText.slice(0, 300)}`);
      }
      const oaiData = await oai.json();
      b64 = oaiData?.data?.[0]?.b64_json;
    } else {
      // Gemini image generation (the "nano-banana"-class model): generateContent with an
      // image response modality returns the image inline as base64 in the first candidate's
      // parts. Model id is env-overridable in case Google renames/versions it.
      const geminiModel = Deno.env.get("GEMINI_IMAGE_MODEL") ?? "gemini-2.5-flash-image";
      const gem = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${providerKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { responseModalities: ["IMAGE"] },
          }),
        },
      );
      if (!gem.ok) {
        const errText = await gem.text();
        throw new Error(`Gemini image model error (${gem.status}): ${errText.slice(0, 300)}`);
      }
      const gemData = await gem.json();
      const parts = gemData?.candidates?.[0]?.content?.parts ?? [];
      b64 = parts.find((p: any) => p?.inlineData?.data)?.inlineData?.data;
    }
    if (!b64) throw new Error(`${provider} image model returned no image.`);

    // Decode base64 -> bytes and upload to the public bucket under the tenant path.
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const stamp = Date.now();
    const rand = crypto.randomUUID().slice(0, 8);
    const path = `${tenantId ?? "shared"}/${stamp}-${rand}.png`;

    const admin = createClient(supabaseUrl, supabaseServiceKey);
    const { error: upErr } = await admin.storage.from("paige-generated").upload(path, bytes, {
      contentType: "image/png", upsert: false,
    });
    if (upErr) throw new Error(`Storage upload failed: ${upErr.message}`);
    const { data: pub } = admin.storage.from("paige-generated").getPublicUrl(path);
    const publicUrl = pub?.publicUrl ?? null;

    // Auto-file every generated image into the tenant's Content Studio library (§10),
    // so it's browsable/reusable without a second step. Best-effort — never fail the
    // generation because the library insert hiccuped.
    let contentId: string | null = null;
    if (tenantId && publicUrl) {
      const title = prompt.slice(0, 60) + (prompt.length > 60 ? "…" : "");
      const { data: cid, error: saveErr } = await admin.rpc("save_marketing_content", {
        p_kind: "image", p_title: title, p_image_url: publicUrl, p_image_path: path,
        p_size: body?.size ?? "square", p_brief: prompt.slice(0, 500), p_tenant_id: tenantId,
      });
      if (saveErr) console.error("library save failed:", saveErr.message);
      else contentId = (cid as string) ?? null;
    }

    await admin.from("audit_logs").insert({
      user_id: user.id, entity: "generated_image", action: "generate_image", entity_id: contentId,
      data: { tenant_id: tenantId, path, size, provider, prompt: prompt.slice(0, 200) },
    });

    return new Response(JSON.stringify({ url: publicUrl, path, size, provider, content_id: contentId }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e: any) {
    console.error("generate-image error:", e);
    return new Response(JSON.stringify({ error: e?.message || "Failed to generate image" }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
