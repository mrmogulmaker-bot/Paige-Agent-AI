// growth-page-draft — Paige's landing-page generator (Growth OS / Vibe Studio #86).
//
// From one sentence, Paige drafts a branded landing page: a set of GrowthBlocks (a hero +
// an embedded lead/signup form at minimum), a theme seeded from the tenant's real brand
// cascade, and SEO. PURE DRAFT — zero DB writes. Publishing is a separate, approval-gated
// action (§8/§10) handled by growth_page_publish, which returns the real resolved URL (§13).
//
// Sibling: growth-block-edit revises ONE section of a page. This generates the whole page.
// Both bottom out in the SAME 17-type block contract, shared in _shared/growth-blocks.ts —
// one validator, one spec, one set of length caps. (This file used to carry a verbatim fork
// whose rich_text cap was 6000 while the SQL gate and its own prompt said 20000; it silently
// truncated legitimate long-form copy. Migrating to the shared module fixes that.)
//
// ── CONTRACT ────────────────────────────────────────────────────────────────
// POST (JWT or service-role bearer required)
//
//   Request:
//     {
//       brief:      string,   // REQUIRED. >= 5 chars after trim. What the page is for.
//       tone?:      string,   // OPTIONAL. Free text.
//       tenant_id?: string,   // SERVICE-ROLE CALLERS ONLY. IGNORED for JWT callers, whose
//                             //   tenant is resolved server-side (see SECURITY).
//       questionnaire_answer?: string   // OPTIONAL. >= 2 chars after trim to be honored. The
//                             //   operator's own free-text answer to "what should the
//                             //   questionnaire ask" (from the Studio's clarifying step). When
//                             //   present, the model derives a REAL form_schema_json instead of
//                             //   leaving the embedded_form's fields to growth_page_upsert's
//                             //   generic default.
//     }
//
//   200  { blocks: GrowthBlock[], theme_json: GrowthPageTheme, seo_json: { title, description },
//          form_schema_json?: {   // present ONLY when questionnaire_answer was supplied AND the
//                                 // model's proposal survived cleanFormSchema() with >= 1 field.
//            submit_label?: string,
//            sections: [{ title?: string, fields: [{ key, label, type, required?, options?, maps_to? }] }]
//          } }
//        blocks: hero guaranteed FIRST; exactly ONE embedded_form guaranteed.
//   4xx/5xx { error: { code, message } }   // structured, non-2xx, never a 200-with-error
//
//   Error codes:
//     400 BAD_JSON           request body was not JSON
//     400 EMPTY_BRIEF        brief missing or shorter than 5 characters
//     400 INVALID_TENANT_ID  service-role caller passed a malformed tenant_id
//     401 UNAUTHENTICATED    no / invalid bearer token
//     403 FORBIDDEN          JWT caller lacks admin, coach or super_admin
//     422 NO_VALID_BLOCKS    the model produced ZERO blocks that survive GrowthBlock
//                            validation. Handing back a bare hero+form skeleton would dress a
//                            failed generation up as a successful one (§13) — we refuse.
//     502 MODEL_UNAVAILABLE  the model call failed (real cause logged + reported, not swallowed)
//     502 MODEL_BAD_OUTPUT   the model returned something that isn't a JSON object — including
//                            a reply truncated mid-object by the output ceiling
//     500 INTERNAL           anything else — with the real message, never a generic shrug
//
// ── SECURITY (§13 — tenant isolation, least privilege) ──────────────────────
// This function does NOT trust `tenant_id` from a JWT caller. It resolves the tenant
// SERVER-SIDE via current_user_tenant_id() executed in the CALLER's own JWT context — the same
// pin growth_page_upsert / growth_page_edit_blocks use ("JWT callers: client tenant ids
// IGNORED"). It is SECURITY DEFINER over auth.uid(), so it physically cannot return a tenant
// the caller doesn't belong to. Only a service-role bearer — Paige's agent driving this
// headlessly (§10) — may name a tenant explicitly. The service-role key is used ONLY to read
// brand for the tenant WE resolved, never for a tenant the caller named.
// (This closes a live cross-tenant IDOR: the previous revision read `body.tenant_id` at face
// value and fetched that tenant's brand with the service-role key, so any authenticated coach
// could read any tenant's brand by naming its UUID. Owner-approved fix, mirrors growth-block-edit.)
//
// Doctrine:
//   §2  — defaults are coaching-generic (webinar, coaching offer, lead magnet, consultation).
//         We never ADD credit/funding/lending framing. A tenant who asks for a funding page in
//         their brief gets one — their offer is theirs; it is just never a platform default.
//   §3  — mogul-direct voice; no "AI-powered/streamline/seamless/empower".
//   §10 — callable seam: the Studio is one caller, Paige's agent is another.
//   §13 — structured errors, real causes, non-2xx on failure; theme_json is seeded from the
//         REAL brand cascade (resolve_tenant_brand), not hallucinated, so it is truthful.
//   §14 — model-routed, reasoning tier, never a hardcoded model.
//   §15 — the model must NOT invent specifics (dates, Zoom links, testimonial names). When the
//         brief lacks them it emits a clearly-labeled editable token, never fake data.
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";
import { chatCompletionCompat } from "../_shared/claude.ts";
import { routedChatCompletion } from "../_shared/model-router.ts";
import {
  extractJson,
  GROWTH_BLOCK_SPEC,
  slugify,
  str,
  trimStr,
  validateBlock,
} from "../_shared/growth-blocks.ts";
import { cleanFormSchema, GROWTH_FORM_SCHEMA_SPEC, type CleanFormSchema } from "../_shared/growth-forms.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json" };

// Token floors (match resolve_tenant_brand's COALESCE defaults): --primary indigo, --accent gold.
const PRIMARY_FLOOR = "#150C31";
const ACCENT_FLOOR = "#EBB94C";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Output ceiling for the page generation (§13 — the whole feature dies without it).
// _shared/claude.ts defaults `max_tokens` to 2048. This job is now routed to the reasoning
// tier (claude-sonnet-5), which writes LONGER copy than the model this prompt was tuned
// against — and a full page is a BIG single JSON object: hero + feature_grid + faq + pricing +
// steps + cta + embedded_form + seo_json. Under a 2048-token ceiling that object truncates
// mid-write, extractJson throws on the broken JSON, and the retry hits the identical ceiling
// and truncates identically — so the primary path of the entire feature returns "no page,"
// every time, deterministically.
// The number: the sibling growth-block-edit spends 6000 on a SINGLE section (a rich_text block
// alone may legitimately run to 20000 chars of html). A page carries up to 12 sections, so
// anything under that is not a ceiling, it's a cliff. 8192 comfortably clears a maximal
// realistic page while still capping a runaway generation. It is a CEILING, not a spend:
// output tokens are billed on what the model actually writes, so a headroom-generous ceiling
// costs nothing on a normal page and removes this entire failure class.
// Bumped 8192 -> 9216 (questionnaire extension): when questionnaire_answer is supplied the same
// single model call also returns form_schema_json in the same JSON object — headroom for that
// on top of a maximal 12-section page, still a ceiling, not a spend.
const PAGE_MAX_TOKENS = 9216;

/** Structured failure. Never a 200-with-{error}; never a swallowed generic (§13). */
function fail(status: number, code: string, message: string): Response {
  return new Response(JSON.stringify({ error: { code, message } }), { status, headers: jsonHeaders });
}
function ok(payload: unknown): Response {
  return new Response(JSON.stringify(payload), { status: 200, headers: jsonHeaders });
}

/**
 * Read the (already gateway-verified) bearer's claims. verify_jwt=true means the signature is
 * checked upstream; this only tells us WHICH kind of caller it is, so we can decide whether
 * `tenant_id` in the body is even allowed to be read. Mirrors growth-block-edit.
 */
function parseJwtClaims(token: string): Record<string, unknown> | null {
  const parts = token.split(".");
  if (parts.length < 2) return null;
  try {
    const payload = parts[1]
      .replaceAll("-", "+")
      .replaceAll("_", "/")
      .padEnd(Math.ceil(parts[1].length / 4) * 4, "=");
    return JSON.parse(atob(payload)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    // ── 1. Authenticate, and decide which caller this is ─────────────────────
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return fail(401, "UNAUTHENTICATED", "A bearer token is required.");
    }
    const token = authHeader.slice("Bearer ".length).trim();
    const isServiceRole = parseJwtClaims(token)?.role === "service_role";

    // ── 2. Parse + validate the request BEFORE spending a model call ─────────
    let body: any;
    try {
      body = await req.json();
    } catch {
      return fail(400, "BAD_JSON", "Request body must be JSON.");
    }

    const brief = str(body?.brief).trim().slice(0, 4000);
    if (brief.length < 5) {
      return fail(400, "EMPTY_BRIEF",
        "Give a brief: what's the page for — the offer, the audience, the action you want.");
    }
    const tone = str(body?.tone).trim().slice(0, 200);
    const questionnaireAnswer = str(body?.questionnaire_answer).trim().slice(0, 4000);
    const hasQuestionnaireAnswer = questionnaireAnswer.length >= 2;

    // ── 3. Resolve the tenant SERVER-SIDE (the IDOR-safe path) ───────────────
    // JWT caller: role-gate, then pin the tenant to current_user_tenant_id() run in THEIR JWT
    // context. `body.tenant_id` is never read on this path. Service-role caller: Paige's agent
    // running headlessly (§10) may name the tenant.
    let tenantId: string | null = null;

    if (isServiceRole) {
      const named = str(body?.tenant_id).trim();
      if (named) {
        if (!UUID_RE.test(named)) {
          return fail(400, "INVALID_TENANT_ID", "tenant_id must be a UUID.");
        }
        tenantId = named;
      }
    } else {
      const authed = createClient(supabaseUrl, supabaseAnonKey, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: { user }, error: uErr } = await authed.auth.getUser();
      if (uErr || !user) {
        return fail(401, "UNAUTHENTICATED", uErr?.message || "Could not verify this session.");
      }

      const { data: roleRows, error: rErr } = await authed.from("user_roles").select("role").eq("user_id", user.id);
      if (rErr) {
        console.error("growth-page-draft: role lookup failed:", rErr);
        return fail(500, "INTERNAL", `Could not read your roles: ${rErr.message}`);
      }
      const roles = (roleRows || []).map((r: any) => r.role);
      if (!roles.some((r: string) => r === "admin" || r === "super_admin" || r === "coach")) {
        return fail(403, "FORBIDDEN", "Admin or coach access required.");
      }

      // The tenant pin. SECURITY DEFINER over auth.uid(), evaluated as the caller — it cannot
      // return a tenant they don't belong to. May legitimately be null (an operator with no
      // active tenant); that only means "no brand context", never "use whatever tenant they
      // asked for" — we fall through to the token floors below.
      const { data: resolved, error: tErr } = await authed.rpc("current_user_tenant_id");
      if (tErr) {
        console.error("growth-page-draft: tenant resolve failed:", tErr);
        return fail(500, "INTERNAL", `Could not resolve your workspace: ${tErr.message}`);
      }
      tenantId = str(resolved) || null;
    }

    // ── 4. Brand cascade (truthful, §13) — read with the tenant WE resolved ───
    // resolve_tenant_brand is SECURITY DEFINER and returns the token floors (indigo/gold) when
    // a tenant sets nothing, so the theme we hand back is the tenant's REAL brand — never a
    // colour the model guessed.
    let brandName = "";
    let theme: { primary: string; accent: string; font: string | null; logo_url: string | null } = {
      primary: PRIMARY_FLOOR, accent: ACCENT_FLOOR, font: null, logo_url: null,
    };
    if (tenantId) {
      const admin = createClient(supabaseUrl, supabaseServiceKey);
      const { data: b, error: bErr } = await admin.rpc("resolve_tenant_brand", { _tenant_id: tenantId });
      if (bErr) {
        // Non-fatal: a page on the brand floor is still a real page. Log the REAL cause.
        console.warn("growth-page-draft: brand lookup failed, using brand floor:", bErr.message);
      } else {
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
    }

    // ── 5. The draft ─────────────────────────────────────────────────────────
    const SYSTEM = `You are Paige, drafting a high-converting landing page for a client-based service business${brandName ? ` called "${brandName}"` : ""}. You output the page as a structured set of content blocks.

VOICE (§3): direct, confident, mogul-founder. Never use "AI-powered", "streamline", "seamless", or "empower". Write for a broad client-based-services audience — coaches, consultants, agencies, advisors, thought leaders — using inclusive words (practice, business, clients, work) rather than narrowly "coaching".

DEFAULTS (§2): the offer defaults to a coaching-generic play — a webinar/masterclass, a free consultation or strategy call, a coaching program, or a lead magnet. Do NOT introduce credit, funding, lending, loans, financing, or "readiness/funding score" framing UNLESS the brief explicitly asks for it. (If the brief DOES ask for it, that is the operator's own offer and you write it in their voice — the rule is that you never ADD it.)

COPY CRAFT — the direct-response bar this page is held to (the gap between a page that converts and one that doesn't): name a SPECIFIC dream outcome and timeframe in the headline, never a vague benefit — "your first paying client in 30 days" beats "grow your business." Conversion is a ratio: maximize the reader's perceived likelihood of success (a clear mechanism, real specificity, proof) while minimizing their sense of required time and effort — every section should be doing one of those two jobs. Agitate a real, named problem the reader already recognizes in themselves before you resolve it — a claim with no friction behind it reads as filler. Write with an actual point of view, not corporate-anonymous voice; when it fits the brief, frame the offer as the non-obvious move that works, not the obvious path everyone already tried. Every claim is a concrete number or a labeled placeholder token — never a hollow adjective standing in for a number.

TIER CHECK — before you finalize, grade your own draft. Premier / top-level copy is marketplace-scale: a stranger with zero context reads it and feels the specific outcome is real and worth acting on now — sharp enough to sit next to the best-performing page in the category. Low-tier / basic copy is generic filler dressed up as a page — safe, vague, forgettable, written to close the request rather than close the sale. Ask yourself plainly: "is this the kind of copy that actually helps this business sell and grow, or did I just generate something to satisfy the brief?" If any section reads as the latter, rewrite that section before you return the page — never ship the first pass just because it's technically complete.

NO FABRICATION (§15): do NOT invent specifics you were not given — no fake dates, times, Zoom/webinar links, prices, testimonial names, quotes, or statistics. When the brief lacks a specific, either omit that element OR write a clearly-labeled editable placeholder token in square brackets, ALL-CAPS with underscores, for the operator to fill, e.g. "[ADD_WEBINAR_DATE]", "[PASTE_REGISTRATION_LINK]", "[ADD_CLIENT_RESULT]". Use that exact ALL_CAPS_UNDERSCORE bracket shape so the publish step can detect an unfilled placeholder. A bracketed editable token is expected and fine; a fabricated concrete fact is not.

OUTPUT — return ONLY a single JSON object, no prose, no markdown fences:
{
  "blocks": GrowthBlock[],
  "seo_json": { "title": string, "description": string }
}

${GROWTH_BLOCK_SPEC}

URL & DATE RULE (hard, §15/§13): "media", "image", and "gallery" blocks — and any image_url/avatar_url field — need a REAL https:// URL you were actually given. You do NOT have tenant asset URLs. So do NOT emit these blocks (or these fields) with a placeholder, a bracket token, an http link, or a made-up URL — OMIT the whole block/field entirely. Same for "countdown": only include it if the brief gives a real date; never invent one. A page with no real media is correct; a page with a fake video/image link is a defect that will be rejected.

REQUIRED for every page: the FIRST block MUST be a "hero", and the page MUST include exactly one "embedded_form" block (the webinar/lead signup) — set its "form_slug" to a short kebab-case slug describing the signup, e.g. "webinar-signup" or "strategy-call". Do not fabricate the form's fields here; the form is drafted separately. For hero/cta buttons that should scroll to the form, use "cta_href": "#apply". Aim for a hero, two or three supporting blocks chosen from the list above (e.g. feature_grid, phase_cards, testimonial, faq, stats, pricing, steps), a cta, and the embedded_form — tight and premium, not padded. Pull only from the blocks the brief can truthfully support.`;

    const messages = [
      { role: "system", content: SYSTEM },
      { role: "user", content: `Brief: ${brief}${tone ? `\nTone: ${tone}` : ""}` },
    ];

    // Questionnaire extension (§15 — probe, then propose the REAL fields instead of leaving the
    // embedded_form's schema to growth_page_upsert's generic name/email/goal filler). Additive:
    // the SAME single model call below now also returns form_schema_json when this fires.
    if (hasQuestionnaireAnswer) {
      messages.push({
        role: "user",
        content:
          `The operator also described what the signup/questionnaire form itself should ask:\n${questionnaireAnswer}\n\n` +
          `Additionally return "form_schema_json" in the SAME JSON object, following this shape:\n${GROWTH_FORM_SCHEMA_SPEC}\n\n` +
          `Derive the fields from exactly what the operator described — do not invent fields they didn't ask for. ` +
          `If their description doesn't already include a way to capture the respondent's name and email, add ` +
          `"full_name" (text, required) and "email" (email, required, maps_to "clients.email") in addition to what ` +
          `they described — every lead form needs a way to follow up. Never use "ssn4" or "currency" types; use "text".`,
      });
    }

    // Reasoning-tier, deliberately (§14 routing, §3 voice): this copy gets PUBLISHED to real
    // prospects under the tenant's brand, so it is a doc_draft (a draft a human reviews before
    // it ships), never an internal_first_draft — that kind is CHEAP_KINDS and would route the
    // page to an 8B open model. Route through the router, never a hardcoded model. Do not
    // re-cheapen this call.
    let parsed: any = null;
    try {
      let raw = "";
      try {
        const data = await routedChatCompletion("doc_draft", {
          messages,
          response_format: { type: "json_object" },
          max_tokens: PAGE_MAX_TOKENS,
        });
        raw = str(data?.choices?.[0]?.message?.content);
      } catch (routerErr: any) {
        // One retry on the SAME reasoning tier — model calls fail transiently, and losing an
        // operator's page to a blip is worse than one extra call. Same tier, so this can never
        // silently downgrade the model, and the SAME ceiling, so it can never re-truncate for
        // want of headroom. If it fails again we report the REAL cause.
        console.warn("growth-page-draft: router call failed, retrying on reasoning tier:", routerErr?.message);
        const retry = await chatCompletionCompat(
          { messages, response_format: { type: "json_object" }, max_tokens: PAGE_MAX_TOKENS },
          "reasoning",
        );
        raw = str(retry?.choices?.[0]?.message?.content);
      }
      if (!raw.trim()) throw new Error("model returned an empty completion");
      try {
        parsed = extractJson(raw);
      } catch (parseErr: any) {
        // The classic shape of this failure is a reply truncated by the output ceiling: the
        // JSON simply stops mid-object. Log the TAIL, which is where the truncation shows.
        console.error("growth-page-draft: unparseable model output (tail):", raw.slice(-400));
        return fail(502, "MODEL_BAD_OUTPUT", `The model did not return a usable page: ${parseErr?.message}`);
      }
    } catch (modelErr: any) {
      console.error("growth-page-draft: model call failed:", modelErr);
      return fail(502, "MODEL_UNAVAILABLE",
        `Could not reach the model to draft the page: ${modelErr?.message || "unknown error"}`);
    }

    // ── 6. Validate every block against the ONE GrowthBlock contract ──────────
    // Shared with growth-block-edit and STRICTER than the SQL gate on purpose, so anything
    // that survives here is guaranteed to survive growth_page_upsert.
    const candidates = Array.isArray(parsed?.blocks) ? parsed.blocks : [];
    let blocks: any[] = candidates.map(validateBlock).filter(Boolean).slice(0, 12);

    // ZERO blocks survived. The hero/form repairs below would still hand back a two-block
    // skeleton with the brief echoed into it — a failed generation wearing a 200 (§13). Refuse.
    if (!blocks.length) {
      console.error("growth-page-draft: no valid blocks in model output:", JSON.stringify(parsed).slice(0, 400));
      return fail(422, "NO_VALID_BLOCKS",
        "That draft didn't produce a single usable section. Try again, or give the brief a little more to work with — the offer, who it's for, and the action you want.");
    }

    // SEO — model-provided, tightened; falls back to a brief-derived line, never empty.
    const seo_json = {
      title: trimStr(parsed?.seo_json?.title, 70) || brandName || brief.slice(0, 70),
      description: trimStr(parsed?.seo_json?.description, 200) || brief.slice(0, 200),
    };

    // ── 7. Phase-1 guarantees: hero FIRST, exactly ONE embedded_form ─────────
    // These are repairs to a real draft, not a substitute for one (the zero-block case above
    // already bailed). Derived from the draft's own SEO — no invented specifics (§15).
    const heroIdx = blocks.findIndex((b) => b.type === "hero");
    if (heroIdx === -1) {
      blocks.unshift({
        type: "hero",
        title: seo_json.title,
        subtitle: seo_json.description,
        cta_label: "Save your spot",
        cta_href: "#apply",
      });
    } else if (heroIdx > 0) {
      const [h] = blocks.splice(heroIdx, 1);
      blocks.unshift(h);
    }

    const formCount = blocks.filter((b) => b.type === "embedded_form").length;
    if (formCount === 0) {
      blocks.push({ type: "embedded_form", form_slug: slugify(seo_json.title, "lead-signup") });
    } else if (formCount > 1) {
      // Keep the first embedded_form only (one signup per Phase-1 page).
      let seen = false;
      blocks = blocks.filter((b) => {
        if (b.type !== "embedded_form") return true;
        if (seen) return false;
        seen = true;
        return true;
      });
    }

    // Re-run the repaired page through the SAME validator that gates the save. The synthesized
    // hero/form are built from already-validated strings so this should never trip — but "should
    // never" is not "proven" (§13), and a block we hand back that growth_page_upsert would then
    // reject is worse than an honest failure.
    const final: any[] = [];
    for (const b of blocks) {
      const clean = validateBlock(b);
      if (!clean) {
        console.error("growth-page-draft: repaired page failed re-validation:", JSON.stringify(b).slice(0, 300));
        return fail(422, "NO_VALID_BLOCKS",
          "That draft produced a section the page can't save. Try again.");
      }
      final.push(clean);
    }

    // Theme comes from the real brand cascade (§13) — primary floors to indigo, accent to gold —
    // not from the model.
    const theme_json = {
      primary: theme.primary || PRIMARY_FLOOR,
      accent: theme.accent || ACCENT_FLOOR,
      font: theme.font,
      logo_url: theme.logo_url,
    };

    // Questionnaire extension: clean/repair the model's proposed schema so it is GUARANTEED to
    // pass growth_validate_form_schema downstream. No usable schema survives => omit the field
    // entirely, and growth_page_upsert's existing hardcoded 3-field synthesis runs unchanged.
    let form_schema_json: CleanFormSchema | undefined;
    if (hasQuestionnaireAnswer) {
      const cleaned = cleanFormSchema(parsed?.form_schema_json);
      if (cleaned) form_schema_json = cleaned;
      else console.warn("growth-page-draft: questionnaire_answer given but no usable schema produced; falling back to the default.");
    }

    return ok({ blocks: final, theme_json, seo_json, ...(form_schema_json ? { form_schema_json } : {}) });
  } catch (e: any) {
    // Last line: still non-2xx, still the REAL cause (§13 — never a swallowed generic, and
    // never the old 200-with-{error} that made a model outage read as a successful draft).
    console.error("growth-page-draft: unhandled error:", e);
    return fail(500, "INTERNAL", e?.message || "Failed to draft the page.");
  }
});
