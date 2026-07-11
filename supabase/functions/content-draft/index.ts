// content-draft — Paige drafts marketing content for a tenant: social posts,
// ad copy, email campaigns, captions, blog outlines, SMS broadcasts. Pure draft
// (no side effects), tenant-branded, in the tenant's voice. Sending anything is a
// separate, approval-gated action (§8). Tenant-generic (§2) — no consumer-finance
// framing unless the tenant's own brief is about it.
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";
import { gatewayCompat } from "../_shared/claude.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type Channel = "social_post" | "ad_copy" | "email_campaign" | "caption" | "blog_outline" | "sms_broadcast";

const CHANNEL_GUIDE: Record<Channel, string> = {
  social_post: "A punchy social post (LinkedIn/Instagram/Facebook). 1–3 short paragraphs, a strong hook first line, 2–4 relevant hashtags at the end.",
  ad_copy: "Paid-ad copy: a scroll-stopping headline (<40 chars), primary text (<125 words), and a clear CTA. Return them labeled.",
  email_campaign: "A marketing email: a subject line, a preheader, and a body (<220 words) with one clear CTA. Return them labeled.",
  caption: "A short, high-energy caption (<220 chars) with 2–4 hashtags.",
  blog_outline: "A blog-post outline: a working title, a one-line angle, and 4–7 H2 section headers each with a one-line note.",
  sms_broadcast: "A single SMS broadcast under 160 characters, with a clear CTA and no links unless asked.",
};

function extractJson(text: string): any {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = fenced ? fenced[1] : text;
  const start = raw.indexOf("{"); const end = raw.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("No JSON in model output");
  return JSON.parse(raw.slice(start, end + 1));
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
    const channel: Channel = (["social_post","ad_copy","email_campaign","caption","blog_outline","sms_broadcast"].includes(body?.channel) ? body.channel : "social_post");
    const brief = String(body?.brief ?? body?.topic ?? "").trim();
    const tone = String(body?.tone ?? "").trim();
    const count = Math.max(1, Math.min(3, Number(body?.variations) || 1));
    const tenantId = body?.tenant_id ?? null;
    if (brief.length < 5) {
      return new Response(JSON.stringify({ error: "Give a brief: what's the content about, and any key points." }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Pull the tenant's brand/voice so the draft sounds like them.
    let brandName = ""; let brandVoice = "";
    if (tenantId) {
      const admin = createClient(supabaseUrl, supabaseServiceKey);
      const { data: t } = await admin.from("tenants").select("name, brand").eq("id", tenantId).maybeSingle();
      brandName = (t as any)?.name ?? "";
      const brand = (t as any)?.brand ?? {};
      brandVoice = brand?.voice ?? brand?.tone ?? "";
    }

    const SYSTEM = `You are Paige, the marketing content writer for a client-based service business${brandName ? ` called "${brandName}"` : ""}. Write high-converting, on-brand marketing content.
${brandVoice ? `Brand voice: ${brandVoice}.` : "Voice: direct, confident, human — never corporate filler."}
CHANNEL: ${CHANNEL_GUIDE[channel]}
RULES: Write for a broad client-based-services audience (coaches, consultants, agencies, advisors) unless the brief says otherwise. Do NOT invent statistics, testimonials, or guarantees. Do NOT introduce consumer-finance/credit/lending framing unless the brief is explicitly about that. Never use "AI-powered", "streamline", "seamless", or "empower".
Return ONLY JSON: {"drafts":[{"title":"short label","content":"the full copy for this channel"}]}. Produce exactly ${count} distinct draft${count > 1 ? "s" : ""}.`;

    const resp = await gatewayCompat("anthropic", {
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: SYSTEM },
          { role: "user", content: `Brief: ${brief}${tone ? `\nTone: ${tone}` : ""}` },
        ],
      }),
    });
    if (!resp.ok) throw new Error(`Draft failed (${resp.status}): ${(await resp.text()).slice(0, 200)}`);
    const data = await resp.json();
    const parsed = extractJson(data?.choices?.[0]?.message?.content ?? "");
    const drafts = Array.isArray(parsed?.drafts) ? parsed.drafts.slice(0, 3).map((d: any) => ({
      title: String(d?.title ?? channel).slice(0, 80),
      content: String(d?.content ?? "").slice(0, 4000),
    })) : [];

    return new Response(JSON.stringify({ channel, drafts }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e: any) {
    console.error("content-draft error:", e);
    return new Response(JSON.stringify({ error: e?.message || "Failed to draft content" }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
