// generate-image — Paige generates marketing images for a tenant (OpenAI
// gpt-image-1), stores them in the public paige-generated bucket, returns URLs.
// Admin|coach only. Requires the OPENAI_API_KEY edge-function secret; returns a
// clear, non-crashing error until it's set. Tenant-generic (§2).
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

    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
    if (!OPENAI_API_KEY) {
      return new Response(JSON.stringify({
        error: "Image generation isn't configured yet. Add the OPENAI_API_KEY edge-function secret in Supabase to enable it.",
        needs_config: true,
      }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const body = await req.json();
    const prompt = String(body?.prompt ?? "").trim();
    const size = SIZE_MAP[body?.size] ?? "1024x1024";
    const tenantId = body?.tenant_id ?? null;
    if (prompt.length < 4) {
      return new Response(JSON.stringify({ error: "Describe the image you want." }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const oai = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: { "Authorization": `Bearer ${OPENAI_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: "gpt-image-1", prompt, n: 1, size }),
    });
    if (!oai.ok) {
      const errText = await oai.text();
      throw new Error(`Image model error (${oai.status}): ${errText.slice(0, 300)}`);
    }
    const oaiData = await oai.json();
    const b64 = oaiData?.data?.[0]?.b64_json;
    if (!b64) throw new Error("Image model returned no image.");

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
      data: { tenant_id: tenantId, path, size, prompt: prompt.slice(0, 200) },
    });

    return new Response(JSON.stringify({ url: publicUrl, path, size, content_id: contentId }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e: any) {
    console.error("generate-image error:", e);
    return new Response(JSON.stringify({ error: e?.message || "Failed to generate image" }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
