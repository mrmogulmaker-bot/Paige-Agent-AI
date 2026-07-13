// growth-page-draft — Paige's landing-page generator (Growth OS / vibe-coding studio #86).
// From one sentence, Paige drafts a branded landing page: a set of GrowthBlocks (a hero +
// an embedded lead/signup form at minimum), a theme seeded from the tenant's real brand
// cascade, and SEO. PURE DRAFT — zero DB writes. Publishing is a separate, approval-gated
// action (§8/§10) handled by the publish RPC, which returns the real resolved URL (§13).
//
// Doctrine:
//   §2  — defaults are coaching-generic (webinar, coaching offer, lead magnet,
//         consultation). NO credit/funding/lending framing unless the brief asks for it.
//   §3  — mogul-direct voice; no "AI-powered/streamline/seamless/empower".
//   §13 — theme_json is seeded from the REAL brand cascade (resolve_tenant_brand), not
//         hallucinated by the model, so what we return is truthful.
//   §15 — the model must NOT invent specifics (dates, Zoom links, testimonial names). When
//         the brief lacks them it uses a clearly-labeled editable prompt the caller fills,
//         never fake data.
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";
import { chatCompletionCompat } from "../_shared/claude.ts";
import { routedChatCompletion } from "../_shared/model-router.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Token floors (match resolve_tenant_brand's COALESCE defaults): --primary indigo, --accent gold.
const PRIMARY_FLOOR = "#150C31";
const ACCENT_FLOOR = "#EBB94C";

function extractJson(text: string): any {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = fenced ? fenced[1] : text;
  const start = raw.indexOf("{"); const end = raw.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("No JSON in model output");
  return JSON.parse(raw.slice(start, end + 1));
}

function slugify(s: string, fallback: string): string {
  const out = String(s || "").toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48);
  return out || fallback;
}

const str = (v: unknown): string => (typeof v === "string" ? v : "");
const trimStr = (v: unknown, max: number): string => str(v).trim().slice(0, max);

// ── Block validation ─────────────────────────────────────────────────────────
// Validate one candidate against the GrowthBlock union (src/lib/growth.ts). Returns a
// cleaned block or null if it doesn't satisfy its variant's required fields. Optional
// fields are only carried through when present & non-empty (keeps the payload tight and
// avoids empty-string CTAs rendering as dead buttons).
function validateBlock(b: any): any | null {
  if (!b || typeof b !== "object") return null;
  switch (b.type) {
    case "hero": {
      const title = trimStr(b.title, 160);
      if (!title) return null;
      const block: any = { type: "hero", title };
      const eyebrow = trimStr(b.eyebrow, 80); if (eyebrow) block.eyebrow = eyebrow;
      const subtitle = trimStr(b.subtitle, 400); if (subtitle) block.subtitle = subtitle;
      const ctaLabel = trimStr(b.cta_label, 60); if (ctaLabel) block.cta_label = ctaLabel;
      const ctaHref = trimStr(b.cta_href, 400); if (ctaHref) block.cta_href = ctaHref;
      const imageUrl = trimStr(b.image_url, 600); if (imageUrl) block.image_url = imageUrl;
      const quote = trimStr(b.quote, 400); if (quote) block.quote = quote;
      return block;
    }
    case "phase_cards": {
      const cards = Array.isArray(b.cards) ? b.cards.map((c: any) => {
        const title = trimStr(c?.title, 120); const body = trimStr(c?.body, 400);
        if (!title || !body) return null;
        const card: any = { phase: trimStr(c?.phase, 40), title, body };
        const outcome = trimStr(c?.outcome, 200); if (outcome) card.outcome = outcome;
        return card;
      }).filter(Boolean) : [];
      if (!cards.length) return null;
      return { type: "phase_cards", cards: cards.slice(0, 8) };
    }
    case "feature_grid": {
      const items = Array.isArray(b.items) ? b.items.map((it: any) => {
        const title = trimStr(it?.title, 120); const body = trimStr(it?.body, 400);
        if (!title || !body) return null;
        return { title, body };
      }).filter(Boolean) : [];
      if (!items.length) return null;
      const block: any = { type: "feature_grid", items: items.slice(0, 9) };
      const title = trimStr(b.title, 160); if (title) block.title = title;
      return block;
    }
    case "cta": {
      const title = trimStr(b.title, 160);
      const ctaLabel = trimStr(b.cta_label, 60);
      const ctaHref = trimStr(b.cta_href, 400);
      if (!title || !ctaLabel || !ctaHref) return null;
      const block: any = { type: "cta", title, cta_label: ctaLabel, cta_href: ctaHref };
      const body = trimStr(b.body, 400); if (body) block.body = body;
      return block;
    }
    case "rich_text": {
      const html = trimStr(b.html, 6000);
      if (!html) return null;
      return { type: "rich_text", html };
    }
    case "embedded_form": {
      const formSlug = slugify(b.form_slug, "");
      if (!formSlug) return null;
      return { type: "embedded_form", form_slug: formSlug };
    }
    default:
      return null;
  }
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
    const brief = String(body?.brief ?? "").trim();
    const tone = String(body?.tone ?? "").trim();
    const tenantId = body?.tenant_id ?? null;
    if (brief.length < 5) {
      return new Response(JSON.stringify({ error: "Give a brief: what's the page for — the offer, the audience, the action you want." }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Pull the tenant's REAL brand cascade so the page is native to their practice and the
    // theme we return is truthful (§13), not whatever the model guessed. resolve_tenant_brand
    // is SECURITY DEFINER and returns token floors (indigo/gold) when a tenant sets nothing.
    let brandName = "";
    let theme: { primary: string; accent: string; font: string | null; logo_url: string | null } = {
      primary: PRIMARY_FLOOR, accent: ACCENT_FLOOR, font: null, logo_url: null,
    };
    if (tenantId) {
      const admin = createClient(supabaseUrl, supabaseServiceKey);
      const { data: b } = await admin.rpc("resolve_tenant_brand", { _tenant_id: tenantId });
      const row = Array.isArray(b) ? b[0] : b;
      if (row) {
        brandName = str(row.product_name) || str(row.tenant_name) || "";
        theme = {
          primary: str(row.primary_color) || PRIMARY_FLOOR,
          accent: str(row.accent_color) || ACCENT_FLOOR,
          font: str(row.font) || null,
          logo_url: str(row.logo_url) || null,
        };
      }
    }

    const SYSTEM = `You are Paige, drafting a high-converting landing page for a client-based service business${brandName ? ` called "${brandName}"` : ""}. You output the page as a structured set of content blocks.

VOICE (§3): direct, confident, mogul-founder. Never use "AI-powered", "streamline", "seamless", or "empower". Write for a broad client-based-services audience — coaches, consultants, agencies, advisors, thought leaders — using inclusive words (practice, business, clients, work) rather than narrowly "coaching".

DEFAULTS (§2): the offer defaults to a coaching-generic play — a webinar/masterclass, a free consultation or strategy call, a coaching program, or a lead magnet. Do NOT introduce credit, funding, lending, loans, financing, or "readiness/funding score" framing UNLESS the brief explicitly asks for it.

NO FABRICATION (§15): do NOT invent specifics you were not given — no fake dates, times, Zoom/webinar links, prices, testimonial names, quotes, or statistics. When the brief lacks a specific, either omit that element OR write a short, clearly-labeled editable prompt in square brackets for the operator to fill, e.g. "[Add webinar date]", "[Paste registration link]", "[Add a client result here]". A bracketed editable prompt is expected and fine; a fabricated concrete fact is not.

OUTPUT — return ONLY a single JSON object, no prose, no markdown fences:
{
  "blocks": GrowthBlock[],
  "seo_json": { "title": string, "description": string }
}

GrowthBlock variants (use the exact "type" strings and field names):
- { "type": "hero", "eyebrow"?: string, "title": string, "subtitle"?: string, "cta_label"?: string, "cta_href"?: string, "quote"?: string }
- { "type": "feature_grid", "title"?: string, "items": [{ "title": string, "body": string }] }
- { "type": "phase_cards", "cards": [{ "phase": string, "title": string, "body": string, "outcome"?: string }] }
- { "type": "cta", "title": string, "body"?: string, "cta_label": string, "cta_href": string }
- { "type": "rich_text", "html": string }
- { "type": "embedded_form", "form_slug": string }

REQUIRED for every page: the FIRST block MUST be a "hero", and the page MUST include exactly one "embedded_form" block (the webinar/lead signup) — set its "form_slug" to a short kebab-case slug describing the signup, e.g. "webinar-signup" or "strategy-call". Do not fabricate the form's fields here; the form is drafted separately. For hero/cta buttons that should scroll to the form, use "cta_href": "#signup". Aim for a hero, one supporting block (feature_grid or phase_cards), a cta, and the embedded_form — tight and premium, not padded.`;

    const messages = [
      { role: "system", content: SYSTEM },
      { role: "user", content: `Brief: ${brief}${tone ? `\nTone: ${tone}` : ""}` },
    ];

    // Drafting is internal first-draft work — route through the model router so it can ride
    // the cheap tier when configured. Claude reasoning is the safety net if the routed draft
    // doesn't parse as our JSON.
    let parsed: any;
    try {
      const data = await routedChatCompletion("internal_first_draft", { messages, response_format: { type: "json_object" } });
      parsed = extractJson(data?.choices?.[0]?.message?.content ?? "");
    } catch {
      const retry = await chatCompletionCompat({ messages, response_format: { type: "json_object" } }, "reasoning");
      parsed = extractJson(retry?.choices?.[0]?.message?.content ?? "");
    }

    // Validate every block against the GrowthBlock union; drop anything malformed.
    const raw = Array.isArray(parsed?.blocks) ? parsed.blocks : [];
    let blocks: any[] = raw.map(validateBlock).filter(Boolean).slice(0, 12);

    // SEO — model-provided, tightened; fall back to a brief-derived line, never empty.
    const seo_json = {
      title: trimStr(parsed?.seo_json?.title, 70) || (brandName ? `${brandName}` : brief.slice(0, 70)),
      description: trimStr(parsed?.seo_json?.description, 200) || brief.slice(0, 200),
    };

    // Phase-1 guarantees: a hero first, and exactly one embedded_form. If the model omitted
    // either, synthesize a minimal, honest fallback (derived from the brief/SEO — no invented
    // specifics) so the caller always gets a renderable, form-bearing page.
    const hasHero = blocks.some((b) => b.type === "hero");
    if (!hasHero) {
      blocks.unshift({
        type: "hero",
        title: seo_json.title,
        subtitle: seo_json.description,
        cta_label: "Save your spot",
        cta_href: "#signup",
      });
    } else {
      // Ensure the hero is the first block.
      const heroIdx = blocks.findIndex((b) => b.type === "hero");
      if (heroIdx > 0) { const [h] = blocks.splice(heroIdx, 1); blocks.unshift(h); }
    }

    const formBlocks = blocks.filter((b) => b.type === "embedded_form");
    if (formBlocks.length === 0) {
      blocks.push({ type: "embedded_form", form_slug: slugify(seo_json.title, "lead-signup") });
    } else if (formBlocks.length > 1) {
      // Keep the first embedded_form only (one signup per Phase-1 page).
      let seen = false;
      blocks = blocks.filter((b) => {
        if (b.type !== "embedded_form") return true;
        if (seen) return false;
        seen = true; return true;
      });
    }

    // Theme comes from the real brand cascade (§13) — accent floors to gold, primary to
    // indigo — not from the model.
    const theme_json = {
      primary: theme.primary || PRIMARY_FLOOR,
      accent: theme.accent || ACCENT_FLOOR,
      font: theme.font,
      logo_url: theme.logo_url,
    };

    return new Response(JSON.stringify({ blocks, theme_json, seo_json }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e: any) {
    console.error("growth-page-draft error:", e);
    return new Response(JSON.stringify({ error: e?.message || "Failed to draft page" }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
