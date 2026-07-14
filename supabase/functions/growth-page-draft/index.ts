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
// URL-bearing fields must be a real https URL. Returns "" for anything else (a placeholder
// token like "[PASTE_VIDEO_URL]", an http url, a relative path) so the caller OMITS the
// value/block rather than emitting a dead or unsafe link (§13, blueprint B6).
const httpsUrl = (v: unknown, max = 600): string => {
  const s = trimStr(v, max);
  return /^https:\/\//i.test(s) ? s : "";
};

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
      const imageUrl = httpsUrl(b.image_url); if (imageUrl) block.image_url = imageUrl;
      const quote = trimStr(b.quote, 400); if (quote) block.quote = quote;
      const imgPos = trimStr(b.image_position, 8);
      if (imageUrl && (imgPos === "full" || imgPos === "split")) block.image_position = imgPos;
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
    case "social_proof": {
      const logos = Array.isArray(b.logos) ? b.logos.map((l: any) => {
        const name = trimStr(l?.name, 80);
        if (!name) return null;
        const logo: any = { name };
        const img = httpsUrl(l?.image_url); if (img) logo.image_url = img;
        return logo;
      }).filter(Boolean) : [];
      if (!logos.length) return null;
      const block: any = { type: "social_proof", logos: logos.slice(0, 12) };
      const title = trimStr(b.title, 160); if (title) block.title = title;
      return block;
    }
    case "testimonial": {
      const items = Array.isArray(b.items) ? b.items.map((it: any) => {
        const quote = trimStr(it?.quote, 600);
        if (!quote) return null;
        const t: any = { quote };
        const author = trimStr(it?.author, 80); if (author) t.author = author;
        const role = trimStr(it?.role, 120); if (role) t.role = role;
        const avatar = httpsUrl(it?.avatar_url); if (avatar) t.avatar_url = avatar;
        const rating = Number(it?.rating);
        if (Number.isFinite(rating) && rating >= 1 && rating <= 5) t.rating = Math.round(rating);
        return t;
      }).filter(Boolean) : [];
      if (!items.length) return null;
      return { type: "testimonial", items: items.slice(0, 12) };
    }
    case "pricing": {
      const tiers = Array.isArray(b.tiers) ? b.tiers.map((t: any) => {
        const name = trimStr(t?.name, 80);
        const price = trimStr(t?.price, 40);
        const features = Array.isArray(t?.features)
          ? t.features.map((f: any) => trimStr(f, 160)).filter(Boolean) : [];
        if (!name || !price || !features.length) return null;
        const tier: any = { name, price, features: features.slice(0, 12) };
        const period = trimStr(t?.period, 40); if (period) tier.period = period;
        const ctaLabel = trimStr(t?.cta_label, 60); if (ctaLabel) tier.cta_label = ctaLabel;
        const ctaHref = trimStr(t?.cta_href, 400); if (ctaHref) tier.cta_href = ctaHref;
        if (t?.featured === true) tier.featured = true;
        return tier;
      }).filter(Boolean) : [];
      if (!tiers.length) return null;
      const block: any = { type: "pricing", tiers: tiers.slice(0, 6) };
      const title = trimStr(b.title, 160); if (title) block.title = title;
      return block;
    }
    case "faq": {
      const items = Array.isArray(b.items) ? b.items.map((it: any) => {
        const question = trimStr(it?.question, 300);
        const answer = trimStr(it?.answer, 1500);
        if (!question || !answer) return null;
        return { question, answer };
      }).filter(Boolean) : [];
      if (!items.length) return null;
      const block: any = { type: "faq", items: items.slice(0, 20) };
      const title = trimStr(b.title, 160); if (title) block.title = title;
      return block;
    }
    case "media": {
      // URL-bearing: omit entirely without an allowlisted provider AND a real https url (B6).
      const provider = trimStr(b.provider, 20).toLowerCase();
      const url = httpsUrl(b.url);
      if (!["youtube", "vimeo", "loom", "mp4"].includes(provider) || !url) return null;
      const block: any = { type: "media", provider, url };
      const title = trimStr(b.title, 160); if (title) block.title = title;
      const caption = trimStr(b.caption, 300); if (caption) block.caption = caption;
      return block;
    }
    case "stats": {
      const items = Array.isArray(b.items) ? b.items.map((it: any) => {
        const value = trimStr(it?.value, 40);
        const label = trimStr(it?.label, 120);
        if (!value || !label) return null;
        return { value, label };
      }).filter(Boolean) : [];
      if (!items.length) return null;
      const block: any = { type: "stats", items: items.slice(0, 8) };
      const title = trimStr(b.title, 160); if (title) block.title = title;
      return block;
    }
    case "countdown": {
      // Never invent a date (§15) — require a real, parseable timestamp; omit otherwise.
      const endsAt = trimStr(b.ends_at, 40);
      if (!endsAt || Number.isNaN(Date.parse(endsAt))) return null;
      const block: any = { type: "countdown", ends_at: endsAt };
      const title = trimStr(b.title, 160); if (title) block.title = title;
      const subtitle = trimStr(b.subtitle, 300); if (subtitle) block.subtitle = subtitle;
      const expired = trimStr(b.expired_text, 120); if (expired) block.expired_text = expired;
      return block;
    }
    case "two_column": {
      const heading = trimStr(b.heading, 160);
      const body = trimStr(b.body, 1500);
      if (!heading && !body) return null;
      const block: any = { type: "two_column" };
      if (heading) block.heading = heading;
      if (body) block.body = body;
      const img = httpsUrl(b.image_url); if (img) block.image_url = img;
      const side = trimStr(b.image_side, 8);
      if (side === "left" || side === "right") block.image_side = side;
      const ctaLabel = trimStr(b.cta_label, 60); if (ctaLabel) block.cta_label = ctaLabel;
      const ctaHref = trimStr(b.cta_href, 400); if (ctaHref) block.cta_href = ctaHref;
      return block;
    }
    case "image": {
      // URL-bearing: omit entirely without a real https url (B6).
      const url = httpsUrl(b.url);
      if (!url) return null;
      const block: any = { type: "image", url };
      const alt = trimStr(b.alt, 200); if (alt) block.alt = alt;
      const caption = trimStr(b.caption, 300); if (caption) block.caption = caption;
      return block;
    }
    case "gallery": {
      // URL-bearing: keep only images with a real https url; omit the block if none survive (B6).
      const images = Array.isArray(b.images) ? b.images.map((im: any) => {
        const url = httpsUrl(im?.url);
        if (!url) return null;
        const g: any = { url };
        const alt = trimStr(im?.alt, 200); if (alt) g.alt = alt;
        const caption = trimStr(im?.caption, 300); if (caption) g.caption = caption;
        return g;
      }).filter(Boolean) : [];
      if (!images.length) return null;
      const block: any = { type: "gallery", images: images.slice(0, 12) };
      const title = trimStr(b.title, 160); if (title) block.title = title;
      return block;
    }
    case "steps": {
      const items = Array.isArray(b.items) ? b.items.map((it: any) => {
        const title = trimStr(it?.title, 120);
        const body = trimStr(it?.body, 400);
        if (!title || !body) return null;
        const s: any = { title, body };
        const number = trimStr(it?.number, 8); if (number) s.number = number;
        return s;
      }).filter(Boolean) : [];
      if (!items.length) return null;
      const block: any = { type: "steps", items: items.slice(0, 10) };
      const title = trimStr(b.title, 160); if (title) block.title = title;
      return block;
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

NO FABRICATION (§15): do NOT invent specifics you were not given — no fake dates, times, Zoom/webinar links, prices, testimonial names, quotes, or statistics. When the brief lacks a specific, either omit that element OR write a clearly-labeled editable placeholder token in square brackets, ALL-CAPS with underscores, for the operator to fill, e.g. "[ADD_WEBINAR_DATE]", "[PASTE_REGISTRATION_LINK]", "[ADD_CLIENT_RESULT]". Use that exact ALL_CAPS_UNDERSCORE bracket shape so the publish step can detect an unfilled placeholder. A bracketed editable token is expected and fine; a fabricated concrete fact is not.

OUTPUT — return ONLY a single JSON object, no prose, no markdown fences:
{
  "blocks": GrowthBlock[],
  "seo_json": { "title": string, "description": string }
}

GrowthBlock variants — 17 types (use the exact "type" strings and field names):
- { "type": "hero", "eyebrow"?: string, "title": string, "subtitle"?: string, "cta_label"?: string, "cta_href"?: string, "image_url"?: https-string, "image_position"?: "full"|"split", "quote"?: string }
- { "type": "feature_grid", "title"?: string, "items": [{ "title": string, "body": string }] }
- { "type": "phase_cards", "cards": [{ "phase": string, "title": string, "body": string, "outcome"?: string }] }
- { "type": "cta", "title": string, "body"?: string, "cta_label": string, "cta_href": string }
- { "type": "rich_text", "html": string }   // max 20000 chars
- { "type": "embedded_form", "form_slug": string }
- { "type": "social_proof", "title"?: string, "logos": [{ "name": string, "image_url"?: https-string }] }
- { "type": "testimonial", "items": [{ "quote": string, "author"?: string, "role"?: string, "avatar_url"?: https-string, "rating"?: 1-5 }] }
- { "type": "pricing", "title"?: string, "tiers": [{ "name": string, "price": string, "period"?: string, "features": [string], "cta_label"?: string, "cta_href"?: string, "featured"?: boolean }] }
- { "type": "faq", "title"?: string, "items": [{ "question": string, "answer": string }] }
- { "type": "media", "provider": "youtube"|"vimeo"|"loom"|"mp4", "url": https-string, "title"?: string, "caption"?: string }
- { "type": "stats", "title"?: string, "items": [{ "value": string, "label": string }] }
- { "type": "countdown", "title"?: string, "ends_at": ISO-8601-timestamp, "subtitle"?: string, "expired_text"?: string }
- { "type": "two_column", "heading"?: string, "body"?: string, "image_url"?: https-string, "image_side"?: "left"|"right", "cta_label"?: string, "cta_href"?: string }
- { "type": "image", "url": https-string, "alt"?: string, "caption"?: string }
- { "type": "gallery", "title"?: string, "images": [{ "url": https-string, "alt"?: string, "caption"?: string }] }
- { "type": "steps", "title"?: string, "items": [{ "number"?: string, "title": string, "body": string }] }

URL & DATE RULE (hard, §15/§13): "media", "image", and "gallery" blocks — and any image_url/avatar_url field — need a REAL https:// URL you were actually given. You do NOT have tenant asset URLs. So do NOT emit these blocks (or these fields) with a placeholder, a bracket token, an http link, or a made-up URL — OMIT the whole block/field entirely. Same for "countdown": only include it if the brief gives a real date; never invent one. A page with no real media is correct; a page with a fake video/image link is a defect that will be rejected.

REQUIRED for every page: the FIRST block MUST be a "hero", and the page MUST include exactly one "embedded_form" block (the webinar/lead signup) — set its "form_slug" to a short kebab-case slug describing the signup, e.g. "webinar-signup" or "strategy-call". Do not fabricate the form's fields here; the form is drafted separately. For hero/cta buttons that should scroll to the form, use "cta_href": "#apply". Aim for a hero, two or three supporting blocks chosen from the list above (e.g. feature_grid, phase_cards, testimonial, faq, stats, pricing, steps), a cta, and the embedded_form — tight and premium, not padded. Pull only from the blocks the brief can truthfully support.`;

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
        cta_href: "#apply",
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
