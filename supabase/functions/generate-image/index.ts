// generate-image — Paige generates marketing images for a tenant, stores them in the public
// paige-generated bucket, returns URLs. Admin|coach only. Tenant-generic (§2).
//
// PROVIDERS (owner directive 2026-07-15 / 2026-07-18): the studio design agent picks the best
// image model per brief across FOUR providers, all filing to the SAME storage + Content Studio
// library path (§12/§18 — one pipeline, never a fork):
//   • gemini   — Google image generation, the DEFAULT (cheap + fast; strong hero/marketing art).
//   • openai   — gpt-image-1, an alternate style / escalation.
//   • replicate— premium Flux family (photoreal/artistic hero art). May become the owner's MAIN
//                design source. Returns a VENDOR-hosted url, so we RE-HOST it (§13: vendor urls
//                expire — we fetch → bytes → upload to the tenant-owned permanent bucket).
//   • ideogram — text-in-image / logos / typographic posters (legible typography inside the art).
// Every provider is optional at the secret level: whichever key(s) are configured is what's
// actually offered. A request for a provider whose key isn't set FALLS BACK to any configured
// provider and reports which one served it; only when NO provider key is visible do we return an
// honest needs_config. All four are unified to BYTES before the shared storage/library/audit tail
// runs identically for every provider (the content_id it returns is load-bearing for the studio
// session artifact link + canvas).
// Featherless is NOT used here — it is a text-LLM host with no verified image models (§13).
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";
import { envKey } from "../_shared/env-key.ts";
import { replicateRun } from "../_shared/replicate.ts";
import { ideogramImage } from "../_shared/ideogram.ts";
import { assertModelAllowed } from "../_shared/model-allowlist.ts";
import { NeedsConfigError, NotYetConfiguredError } from "../_shared/provider-types.ts";

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

// The studio's size keys → the aspect-ratio string the url-based providers want. Replicate's Flux
// takes an "W:H" aspect_ratio; ideogram.ts maps the same "W:H" string to its ASPECT_ enum. Unknown
// keys default to square so a bad size never fails the whole generation (§13).
const ASPECT_MAP: Record<string, string> = {
  square: "1:1",
  portrait: "9:16",
  landscape: "16:9",
};

type Provider = "gemini" | "openai" | "replicate" | "ideogram";
const KNOWN_PROVIDERS: Provider[] = ["gemini", "openai", "replicate", "ideogram"];
// Fallback preference order when the requested provider's key is absent: the cheap default first,
// then the alternates. The requested provider is always tried first (prepended below).
const FALLBACK_ORDER: Provider[] = ["gemini", "openai", "replicate", "ideogram"];

// A sensible premium Flux default; env-overridable so the owner can pin a different Flux variant
// platform-wide without a code change (§10 config-as-data). A per-call `model` still wins over it.
const DEFAULT_FLUX_MODEL = "black-forest-labs/flux-1.1-pro";

// Decode a base64 image payload (gemini/openai) to raw bytes.
function b64ToBytes(b64: string): Uint8Array {
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

// Fetch a vendor-hosted artifact url and return its bytes (the re-host step for replicate/ideogram,
// §13 — a vendor url can expire, so we own a permanent copy).
async function fetchUrlBytes(url: string): Promise<Uint8Array> {
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`Fetching generated image failed (${resp.status}).`);
  return new Uint8Array(await resp.arrayBuffer());
}

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
    const sizeKey = typeof body?.size === "string" ? body.size : "square";
    const size = SIZE_MAP[sizeKey] ?? "1024x1024";
    const aspect = ASPECT_MAP[sizeKey] ?? "1:1";
    const tenantId = body?.tenant_id ?? null;
    // provider: gemini (default) | openai | replicate | ideogram. An UNKNOWN value 400s so the
    // caller knows their request wasn't honored. A KNOWN provider whose KEY is missing is handled
    // below: it falls back to whichever provider IS configured, reporting which one actually served.
    const requestedProvider = String(body?.provider ?? "gemini").toLowerCase() as Provider;
    if (!KNOWN_PROVIDERS.includes(requestedProvider)) {
      return new Response(JSON.stringify({ error: `Unknown image provider "${requestedProvider}".` }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    // Optional model override (the Flux variant / Ideogram version). Untrusted caller input, so it
    // is validated against the curated per-provider allow-list before it ever reaches a vendor
    // (§13 secure-by-construction; §14 right-model/cost-low) — an unvetted/renamed id is rejected.
    const requestedModel = typeof body?.model === "string" && body.model.trim() ? body.model.trim() : undefined;
    if (prompt.length < 4) {
      return new Response(JSON.stringify({ error: "Describe the image you want." }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const GEMINI_API_KEY = envKey("GEMINI_API_KEY");
    const OPENAI_API_KEY = envKey("OPENAI_API_KEY");
    // Replicate/Ideogram clients read their own keys at call time; here we only need a boolean to
    // know whether to OFFER the provider (fallback selection + the configured{} diagnostic). We use
    // the SAME env names the clients read so the booleans can't disagree with the clients.
    const REPLICATE_KEY = envKey("REPLICATE_API_TOKEN", "REPLICATE_API_KEY");
    const IDEOGRAM_KEY = envKey("IDEOGRAM_API_KEY");
    // Which providers this function can actually SEE at runtime (booleans only — never key values).
    // Returned in the needs_config response so a misconfigured/wrong-scoped secret is self-diagnosing.
    const keyPresent: Record<Provider, boolean> = {
      gemini: !!GEMINI_API_KEY,
      openai: !!OPENAI_API_KEY,
      replicate: !!REPLICATE_KEY,
      ideogram: !!IDEOGRAM_KEY,
    };
    const configured = { ...keyPresent };

    // Attempt order: the requested provider FIRST, then the rest by preference — but only those
    // whose key is visible. A missing requested-provider key never hard-fails when another is ready;
    // we generate with what's live and report which provider served it.
    const candidates: Provider[] = [
      requestedProvider,
      ...FALLBACK_ORDER.filter((p) => p !== requestedProvider),
    ].filter((p) => keyPresent[p]);

    if (candidates.length === 0) {
      console.warn("generate-image: no image provider key set (gemini/openai/replicate/ideogram all absent)");
      return new Response(JSON.stringify({
        error: "Image generation isn't switched on yet — no image provider key is set. Add GEMINI_API_KEY, OPENAI_API_KEY, REPLICATE_API_TOKEN, or IDEOGRAM_API_KEY to this project's Supabase Edge Function secrets.",
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

    // Generate the raw image BYTES for a single provider. gemini/openai return base64 (decoded);
    // replicate/ideogram return a vendor url (re-hosted by fetching → bytes) or, for ideogram,
    // possibly bytes directly. Throws NeedsConfigError when a client can't see its key (folded into
    // the fallback below, never a 500).
    async function generateBytes(provider: Provider): Promise<{ bytes: Uint8Array; model: string }> {
      if (provider === "openai") {
        const oai = await fetch("https://api.openai.com/v1/images/generations", {
          method: "POST",
          headers: { "Authorization": `Bearer ${OPENAI_API_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({ model: "gpt-image-1", prompt, n: 1, size }),
        });
        if (!oai.ok) {
          const errText = await oai.text();
          throw new Error(`OpenAI image model error (${oai.status}): ${errText.slice(0, 300)}`);
        }
        const oaiData = await oai.json();
        const b64 = oaiData?.data?.[0]?.b64_json;
        if (!b64) throw new Error("openai image model returned no image.");
        return { bytes: b64ToBytes(b64), model: "gpt-image-1" };
      }
      if (provider === "gemini") {
        // Gemini image generation (the "nano-banana"-class model): generateContent with an image
        // response modality returns the image inline as base64 in the first candidate's parts.
        // Model id is env-overridable in case Google renames/versions it.
        const geminiModel = Deno.env.get("GEMINI_IMAGE_MODEL") ?? "gemini-2.5-flash-image";
        const gem = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent`,
          {
            method: "POST",
            // Key in the x-goog-api-key header, NOT the URL — a network-level fetch reject echoes the
            // request URL into a TypeError, which would leak ?key=<secret> into logs (§13).
            headers: { "Content-Type": "application/json", "x-goog-api-key": GEMINI_API_KEY! },
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
        const b64 = parts.find((p: any) => p?.inlineData?.data)?.inlineData?.data;
        if (!b64) throw new Error("gemini image model returned no image.");
        return { bytes: b64ToBytes(b64), model: geminiModel };
      }
      if (provider === "replicate") {
        // Premium Flux. `model` (validated) wins; else an env-pinned default; else a sensible Flux.
        const fluxModel = requestedModel || Deno.env.get("STUDIO_REPLICATE_IMAGE_MODEL") || DEFAULT_FLUX_MODEL;
        assertModelAllowed("replicate", requestedModel);
        const r = await replicateRun({ model: fluxModel, input: { prompt, aspect_ratio: aspect } });
        if (!r.artifact_url) throw new Error("replicate returned no image url.");
        return { bytes: await fetchUrlBytes(r.artifact_url), model: r.model ?? fluxModel };
      }
      // ideogram — text-in-image. Returns artifact_bytes OR a vendor url we re-host.
      assertModelAllowed("ideogram", requestedModel);
      const r = await ideogramImage({ prompt, aspect, model: requestedModel });
      if (r.artifact_bytes) return { bytes: r.artifact_bytes, model: r.model ?? "V_2" };
      if (r.artifact_url) return { bytes: await fetchUrlBytes(r.artifact_url), model: r.model ?? "V_2" };
      throw new Error("ideogram returned no image.");
    }

    // Try each candidate in order. A NeedsConfig/NotYetConfigured throw (key not actually visible to
    // the client) folds into the fallback — treat that provider as unavailable and try the next,
    // never a 500. A real API error surfaces (fallback is for missing keys, not vendor outages).
    let bytes: Uint8Array | undefined;
    let served: Provider | undefined;
    let usedModel = "";
    const skipped: Provider[] = [];
    for (const p of candidates) {
      try {
        const out = await generateBytes(p);
        bytes = out.bytes;
        served = p;
        usedModel = out.model;
        break;
      } catch (e) {
        if (e instanceof NeedsConfigError || e instanceof NotYetConfiguredError) {
          console.warn(`generate-image: ${p} reported not-configured, falling back:`, e.message);
          keyPresent[p] = false;
          configured[p] = false;
          skipped.push(p);
          continue;
        }
        throw e;
      }
    }

    if (!bytes || !served) {
      // Every candidate turned out unconfigured at call time — honest needs_config with the refreshed
      // configured{} map (so a provider that reported not-configured now reads false).
      console.warn("generate-image: all candidate providers reported not-configured", skipped);
      return new Response(JSON.stringify({
        error: "Image generation isn't switched on yet — the configured image provider key(s) aren't valid at runtime. Check GEMINI_API_KEY, OPENAI_API_KEY, REPLICATE_API_TOKEN, or IDEOGRAM_API_KEY.",
        needs_config: true,
        configured,
      }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ---- SHARED TAIL (identical for every provider): upload bytes → library → audit → return ----
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
        p_size: sizeKey, p_brief: prompt.slice(0, 500), p_tenant_id: tenantId,
      });
      if (saveErr) console.error("library save failed:", saveErr.message);
      else contentId = (cid as string) ?? null;
    }

    await admin.from("audit_logs").insert({
      user_id: user.id, entity: "generated_image", action: "generate_image", entity_id: contentId,
      data: { tenant_id: tenantId, path, size, provider: served, model: usedModel, prompt: prompt.slice(0, 200) },
    });

    return new Response(JSON.stringify({ url: publicUrl, path, size, provider: served, model: usedModel, content_id: contentId }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e: any) {
    console.error("generate-image error:", e);
    return new Response(JSON.stringify({ error: e?.message || "Failed to generate image" }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
