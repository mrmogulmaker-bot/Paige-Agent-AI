-- Compound AI System — Phase A: paige_prompt_template (the DNA of every Paige design) + RLS + the
-- 8 platform-default seed templates (CLAUDE.md §26, §7 tenant-authored, §9 platform-vs-tenant).
--
-- A template is a versioned, reusable generation brief with {{placeholders}} the prompt-forge
-- (_shared/prompt-forge.ts) fills with the tenant's brand tokens, the caller's intent, and the
-- standing anti-patterns before calling the EXISTING callModel seam. Two audiences share one table
-- (§9): platform DEFAULTS (is_platform_default = true, coaching-generic, §2-clean, readable by every
-- tenant) and each tenant's OWN authored templates (tenant-scoped). The forge prefers a tenant's own
-- over the default (§7).
--
-- Doctrine:
--   §9  — tenant_id NOT NULL + RLS; a tenant manages only its own rows. Platform defaults are exposed
--         read-only to everyone via a separate is_platform_default policy; the service-role seam (the
--         forge/Paige) drives writes.
--   §2  — the 8 seeds carry ZERO credit/funding/lender language by construction; the runtime finance
--         guard (prompt-forge.assertPromptFinanceClean → the router's finance vocab) is the belt.
--   §3  — every seed body is written in the direct, confident, mogul-founder voice; no "AI-powered",
--         "seamless", "streamline", or "empower".
--   §12 — one home for design DNA; not a per-modality fork.
--
-- Idempotent (IF NOT EXISTS / ON CONFLICT / DROP POLICY IF EXISTS) — safe to re-apply. ADDITIVE only.

-- ── 0) Ensure a canonical platform-defaults tenant exists ────────────────────────────────────
-- tenant_id is NOT NULL (§9), so the platform DEFAULTS must belong to a real operator-owned tenant.
-- This is the single, stable home for platform-default authorship — coaching-generic, §2-clean, and
-- referenced by every default seed below. Idempotent on slug. (INTEGRATOR NOTE: if a canonical
-- God/operator tenant already exists, the defaults can be repointed to it; this row simply guarantees
-- the NOT NULL FK is satisfiable deterministically in any database, fresh or existing.)
INSERT INTO public.tenants (slug, name, brand)
VALUES ('paige-platform-defaults', 'Paige Platform Defaults', '{"name":"Paige Agent AI"}'::jsonb)
ON CONFLICT (slug) DO NOTHING;

-- ── 1) The template table ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.paige_prompt_template (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  modality            text NOT NULL,          -- Modality union: text|image|image-with-text|3d|audio-voice|doc-render
  provider            text NOT NULL,          -- provider slug: anthropic|groq|featherless|gemini|replicate|openai|ideogram|meshy|elevenlabs|doc-render
  template_name       text NOT NULL,          -- stable key within (tenant, modality, provider), e.g. 'logo-wordmark'
  template_body       text NOT NULL,          -- the DNA brief with {{tenant_name}}/{{tenant_palette}}/… placeholders
  is_platform_default boolean NOT NULL DEFAULT false,
  enabled             boolean NOT NULL DEFAULT true,
  description         text,
  metadata            jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by          uuid,                   -- author (actor) stamp; NULL for system/service seeds
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT paige_prompt_template_uniq UNIQUE (tenant_id, modality, provider, template_name)
);

CREATE INDEX IF NOT EXISTS paige_prompt_template_tenant_modality_idx
  ON public.paige_prompt_template (tenant_id, modality);
CREATE INDEX IF NOT EXISTS paige_prompt_template_default_idx
  ON public.paige_prompt_template (modality, provider) WHERE is_platform_default;

ALTER TABLE public.paige_prompt_template ENABLE ROW LEVEL SECURITY;

-- Tenant self-scope: a tenant reads/writes ONLY its OWN NON-DEFAULT rows (§9/§2). The
-- `is_platform_default = false` clause is load-bearing: without it, a tenant could POST directly to
-- PostgREST with {tenant_id:<self>, is_platform_default:true, ...} — the WITH CHECK would pass, and the
-- platform-default READ policy below would then expose that tenant-authored row to EVERY tenant as a
-- "platform default", bypassing BOTH the operator-role gate AND the §2 finance-in-default guard (which
-- live only in the edge-function forge, not at the table). So ONLY the service_role seam can ever write
-- an is_platform_default=true row. USING mirrors WITH CHECK so a tenant also cannot flip an existing
-- own-row into a default.
DROP POLICY IF EXISTS paige_prompt_template_tenant ON public.paige_prompt_template;
CREATE POLICY paige_prompt_template_tenant ON public.paige_prompt_template
  FOR ALL TO authenticated
  USING (tenant_id = public.current_user_tenant_id() AND is_platform_default = false)
  WITH CHECK (tenant_id = public.current_user_tenant_id() AND is_platform_default = false);

-- Platform-default READ: every authenticated tenant may read the shared defaults (read-only — no
-- WITH CHECK, so this policy never authorizes a write). This is what exposes the 8 seeds platform-wide.
DROP POLICY IF EXISTS paige_prompt_template_platform_default_read ON public.paige_prompt_template;
CREATE POLICY paige_prompt_template_platform_default_read ON public.paige_prompt_template
  FOR SELECT TO authenticated
  USING (is_platform_default = true);

-- Service-role seam: the forge / Paige drive writes (seed, tenant-author-on-behalf) via service role.
DROP POLICY IF EXISTS paige_prompt_template_service ON public.paige_prompt_template;
CREATE POLICY paige_prompt_template_service ON public.paige_prompt_template
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

GRANT SELECT, INSERT, UPDATE, DELETE ON public.paige_prompt_template TO authenticated;
GRANT ALL ON public.paige_prompt_template TO service_role;

-- ── 2) The 8 platform-default seed templates ─────────────────────────────────────────────────
-- Senior brand-designer bar; each ends with an explicit "Avoid: {{anti_patterns}}" clause the forge
-- fills from _shared/cheesy-tells.ts. §2-clean (no finance), §3 voice, inclusive (§2 no over-narrowing
-- to "coaching"). Dollar-quoted bodies ($tpl$…$tpl$) so apostrophes need no escaping.
WITH pt AS (
  SELECT id FROM public.tenants WHERE slug = 'paige-platform-defaults'
)
INSERT INTO public.paige_prompt_template
  (tenant_id, modality, provider, template_name, template_body, is_platform_default, enabled, description)
SELECT pt.id, v.modality, v.provider, v.template_name, v.template_body, true, true, v.description
FROM pt, (VALUES

  ('image-with-text', 'ideogram', 'logo-wordmark',
   $tpl$Design a wordmark logotype for {{tenant_name}}, a client-based practice serving {{tenant_target_market}}. Render the full name as clean, custom-tuned lettering — a single horizontal wordmark, letters set on one baseline with even optical spacing and confident negative space. Voice of the mark: {{tenant_voice}}. Palette: {{tenant_palette}} — applied with restraint: one dominant ink and at most one accent, never a rainbow. Typographic direction from the brief: {{user_intent}}. Favor a grotesk or humanist-sans skeleton with subtle proprietary detailing — a cut terminal, a tuned ligature, a balanced counter — so it feels bespoke, not a font pulled off the shelf. Tight, deliberate letter-spacing; crisp vector edges; flawless kerning; legible from a favicon to a billboard. Center the wordmark on a clean, uncluttered field with generous margins. Deliver a flat, production-grade mark: no mockup, no drop shadow, no 3D bevel, no gradient fill. It should read premium, timeless, and instantly ownable. Avoid: {{anti_patterns}}.$tpl$,
   'Platform default — custom-lettered horizontal wordmark logotype (typography-accurate via Ideogram).'),

  ('image-with-text', 'ideogram', 'logo-symbol',
   $tpl$Design a standalone brand symbol — no words — for {{tenant_name}}, a practice serving {{tenant_target_market}}. Build one geometric or organic icon that carries the essence of the brief: {{user_intent}}. It must work as a single-color glyph: solid, balanced, and instantly recognizable at 16px and at wall scale. Voice of the mark: {{tenant_voice}}. Palette: {{tenant_palette}}, used with discipline — one confident color, an optional single accent, strong figure-ground contrast. Favor a memorable, reducible form on a clear grid, with consistent stroke weight, true optical balance, and negative space doing the work. No literal clip-art, no letter hidden inside unless the brief asks, no fussy detail that collapses when small. Deliver a flat vector symbol centered on a clean field with even margins, production-ready — no mockup, no gradient mesh, no bevel, no drop shadow. It should feel proprietary, calm, and premium; a mark the practice can own for a decade. Avoid: {{anti_patterns}}.$tpl$,
   'Platform default — reducible single-color brand symbol / icon (no wordmark).'),

  ('image', 'replicate', 'hero-illustration',
   $tpl$Create a hero illustration for the top of {{tenant_name}}'s landing page, speaking to {{tenant_target_market}}. Concept from the brief: {{user_intent}}. Compose a wide, cinematic scene with a clear focal point and deliberate depth — a foreground subject, a supporting midground, and an atmospheric background — using layered light for dimension, never flat fill. Palette: {{tenant_palette}}, a calm and credible ground with a single disciplined accent reserved for the point of emphasis. Mood and voice: {{tenant_voice}}. Favor an editorial, custom illustrative style — confident linework or soft volumetric shading, tasteful grain, intentional negative space on one side to leave room for a headline. Balanced, asymmetric composition on a clear grid; premium, modern, uncluttered. Lighting is soft and directional; colors are harmonious; contrast holds so any overlaid type stays legible. No mascot clichés, no clip-art, no busy background noise. Deliver a polished, on-brand hero image that reads as one continuous system with a premium product. Avoid: {{anti_patterns}}.$tpl$,
   'Platform default — cinematic editorial hero illustration for a landing page (premium Flux via Replicate).'),

  ('image', 'replicate', 'product-photo',
   $tpl$Create a photorealistic product photograph for {{tenant_name}}, aimed at {{tenant_target_market}}. Subject and scene from the brief: {{user_intent}}. Stage the product as the single hero of the frame on a clean, considered surface, with intentional negative space for later copy. Lighting is soft, directional studio light — a gentle key, a subtle fill, and a controlled specular highlight that reveals material and form; natural, believable shadows ground the object. Palette: {{tenant_palette}}, carried through the set dressing and background, calm and premium, one accent at most. Mood: {{tenant_voice}}. Shoot at a flattering focal length with a shallow, tasteful depth of field, crisp focus on the hero, and true-to-life color and texture. Composition on a deliberate grid — rule of thirds or centered with balance — magazine-grade, uncluttered, aspirational. No harsh on-camera flash, no cluttered props, no plastic CGI sheen, no distracting reflections. Deliver a high-resolution, editorial-quality image that looks like a real premium catalog shot. Avoid: {{anti_patterns}}.$tpl$,
   'Platform default — editorial, studio-lit photorealistic product photograph (premium Flux via Replicate).'),

  ('image', 'gemini', 'social-post',
   $tpl$Create a social post image for {{tenant_name}}, made for {{tenant_target_market}}. Message and occasion from the brief: {{user_intent}}. Design for a small screen first, with a single high-contrast focal shape the eye lands on before it reads a word — one bold idea, strong figure-ground separation, and a calm field around it so it reads in a busy feed at a glance. Compose for both a square 1:1 and a vertical 4:5 / 9:16 export, weighting the subject to a third of the frame and keeping a clean headline-overlay zone with generous margins, well clear of the platform's UI crop. Palette: {{tenant_palette}}, on-brand and confident, with a single accent spent on the one element that carries the call to action; keep everything else restrained so the subject pops, and hold contrast high enough that any overlaid caption stays legible. Voice and tone: {{tenant_voice}}. Favor a modern, editorial brand system — deliberate spacing, one clear subject, tasteful depth from light rather than flat fill — over collage clutter or a stock-template look. No stock-photo cliché, no rainbow gradients, no crammed corners, no watermark. Deliver a polished image that feels native to a premium brand feed. Avoid: {{anti_patterns}}.$tpl$,
   'Platform default — feed-native, crop-safe social post image with a clear focal shape and overlay zone (fast/strong Gemini image).'),

  ('3d', 'meshy', 'product-render',
   $tpl$Model a clean, production-grade 3D render of a product concept for {{tenant_name}}, serving {{tenant_target_market}}. Object from the brief: {{user_intent}}. Build accurate, believable geometry with even topology, crisp edges, and correct proportion — a single hero object at a flattering three-quarter angle that reveals form and depth. Materials read true: physically-based surfacing with honest roughness, subtle micro-detail, and clean UVs — no plastic uniformity. Lighting is a soft studio setup — a directional key, a gentle fill, and a soft rim to separate the object from the ground — with natural contact shadows anchoring it. Palette and finish: {{tenant_palette}}, premium and restrained, one accent material at most. Mood: {{tenant_voice}}. Present on a calm, uncluttered studio ground with intentional negative space, balanced composition, and real depth. No low-poly faceting where it should be smooth, no muddy textures, no blown-out highlights, no busy background. Deliver a polished, catalog-grade render that looks manufactured and real. Avoid: {{anti_patterns}}.$tpl$,
   'Platform default — studio-lit, catalog-grade photoreal 3D product render (text-to-3D via Meshy).'),

  ('text', 'anthropic', 'editorial-long-form',
   $tpl$You are a senior brand writer for {{tenant_name}}, a client-based practice serving {{tenant_target_market}}. Write a long-form editorial piece on the brief: {{user_intent}}. Voice: {{tenant_voice}} — direct, confident, founder-grade; plainspoken, specific, and human, never buzzwordy or hollow. Open with a sharp hook that earns the next line, then build a clear argument with real substance — concrete examples, a genuine point of view, and takeaways the reader can act on. Use short paragraphs, purposeful subheads, and a rhythm that pulls the reader down the page; vary sentence length; cut every filler word. Write to the reader as a peer, respect their time, and land a clear through-line with a confident close that motivates the next step. Let the brand feeling of {{tenant_palette}} show in tone, not in decoration. Keep it inclusive to the practice, business, agency, or advisory it serves — never over-narrow to one niche. Return clean, publication-ready prose with no placeholder brackets and no meta-commentary. Avoid: {{anti_patterns}}.$tpl$,
   'Platform default — publication-ready long-form editorial in the tenant voice (Claude reasoning).'),

  ('text', 'anthropic', 'marketing-headline',
   $tpl$You are a senior direct-response copywriter for {{tenant_name}}, writing to {{tenant_target_market}}. From the brief: {{user_intent}}, craft a set of sharp marketing headlines. Voice: {{tenant_voice}} — direct, confident, mogul-founder; every word earns its place. Lead with the reader's outcome or tension, not the product; make a specific, believable promise; favor concrete nouns and strong verbs over abstraction and hype. Offer a short range of angles — a benefit-led line, a curiosity-led line, and a bold contrarian line — each tight enough to scan in a second and strong enough to stop the scroll. Keep every line in the brand feeling of {{tenant_palette}} through tone, not decoration. Stay inclusive to the practice, business, agency, or advisory served — never over-narrow to one niche. No clickbait that overpromises, no empty superlatives, no jargon. Return only the headlines, each on its own line, publication-ready with no placeholder brackets. Avoid: {{anti_patterns}}.$tpl$,
   'Platform default — direct-response marketing headline set in the tenant voice (Claude reasoning).')

) AS v(modality, provider, template_name, template_body, description)
ON CONFLICT (tenant_id, modality, provider, template_name) DO NOTHING;
