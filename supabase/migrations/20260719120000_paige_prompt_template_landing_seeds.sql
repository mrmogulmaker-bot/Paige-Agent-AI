-- Compound AI System — Phase A expansion: 8 LANDING-PAGE platform-default templates seeded into
-- paige_prompt_template (CLAUDE.md §26 forge DNA, §19 Studio authors landing pages, §7 tenant-authored,
-- §9 platform-vs-tenant). These are the direct-response DNA for the Vibe Studio's page/funnel drafting.
--
-- WHY THESE EXIST (§19): the Studio must draft a REAL working landing page / funnel from one brief, with
-- the copy embedded inside it held to a direct-response bar. A generic "make a landing page" prompt yields
-- generic AI slop. These 8 templates encode the PUBLIC, well-attested conversion patterns of the best
-- direct-response practitioners — assessment/scorecard lead magnets (Hormozi-lineage value-equation
-- thinking), one-question-per-screen mobile quiz funnels (Perspective.co-lineage), long-form story→offer
-- stack→guarantee sales letters (Brunson/DotCom-Secrets-lineage), webinar registration urgency, product
-- pre-launch social proof, and clean opt-in gates — as PATTERN LEARNING, never copied copy. The forge
-- (_shared/prompt-forge.ts) fills {{tenant_name}} / {{tenant_palette}} / {{tenant_voice}} /
-- {{tenant_target_market}} / {{user_intent}} / {{anti_patterns}} with the tenant's real, present-only
-- brand tokens before calling the EXISTING callModel seam. NO other token survives substitution.
--
-- Doctrine:
--   §2  — ZERO credit/funding/lender/loan/financing language by construction; coaching-generic + inclusive
--         (practice · business · agency · consultant · advisor), never over-narrowed to "coaching". The
--         runtime finance guard (assertPromptFinanceClean → financeDefaultPrefilter) is the belt.
--   §3  — direct, confident, mogul-founder voice; NO "AI-powered" / "seamless" / "streamline" / "empower".
--   §9  — is_platform_default = true, owned by the canonical 'paige-platform-defaults' tenant, read-only
--         to every tenant; a tenant's OWN landing template always wins over these (§7, pickTemplate rank).
--   §11 — the hero + gold-restraint clauses forbid painting the accent as background; the accent is spent
--         only on the primary act (the one CTA). The generated CSS/markup honors the gold budget.
--   §12 — one home for landing DNA; not a per-vertical fork.
--   §26 — each body ends with an explicit "Avoid: {{anti_patterns}}" clause (filled from cheesy-tells.ts).
--
-- Idempotent (ON CONFLICT DO NOTHING on the (tenant, modality, provider, template_name) unique key) —
-- ADDITIVE only, safe to re-apply. Depends on 20260718100000_paige_prompt_template.sql (table + the
-- 'paige-platform-defaults' tenant + RLS). Dollar-quoted bodies ($tpl$…$tpl$) so apostrophes need no
-- escaping. metadata carries a version + provenance stamp (§12 organize-what-you-create).

WITH pt AS (
  SELECT id FROM public.tenants WHERE slug = 'paige-platform-defaults'
)
INSERT INTO public.paige_prompt_template
  (tenant_id, modality, provider, template_name, template_body, is_platform_default, enabled, description, metadata)
SELECT pt.id, v.modality, v.provider, v.template_name, v.template_body, true, true, v.description, v.metadata
FROM pt, (VALUES

  -- 1) ASSESSMENT / SCORECARD LEAD MAGNET (Hormozi-lineage value-equation thinking) ─────────────
  ('text', 'anthropic', 'landing-assessment-quiz',
   $tpl$You are a senior direct-response conversion designer building a self-scoring ASSESSMENT landing page for {{tenant_name}}, a client-based practice serving {{tenant_target_market}}. The brief: {{user_intent}}. Voice: {{tenant_voice}} — direct, confident, founder-grade; every line earns its place, no hype, no filler.

The strategy is a diagnostic: instead of a passive "download our guide," the visitor takes a short scored assessment that quantifies the gap between where they are now and the outcome they want, then receives a personalized result that makes the problem specific, urgent, and worth solving. A named scorecard converts far better than a generic opt-in because it promises a personalized answer, not more content.

Build the page in this order:
1. HERO — name the assessment as an ownable asset ("The [Outcome] Scorecard" style, tuned to the brief), then a headline built on the reader's desired outcome and the tension of not knowing where they stand. One subhead that sets the promise: a personalized score and a clear picture of what to fix first. State the honest time cost ("takes about 2 minutes") and the payoff. One primary CTA to begin — the single act, the only place the accent color lands.
2. WHY IT MATTERS — three to five crisp lines naming the concrete stakes of staying stuck, framed as the dream outcome, the likelihood of hitting it, the time it takes, and the effort involved. Make the reader feel the cost of the status quo without fear-mongering.
3. THE ASSESSMENT — 6 to 9 sharp diagnostic questions across the real dimensions that predict success in this practice's world (derive them from the brief). Each question is specific, answerable in seconds, and secretly maps to a scored dimension. Use clear multiple-choice options that ladder from "struggling" to "dialed in." Never ask what you cannot score.
4. RESULT / SCORE REVEAL — describe the scoring model and the tiered result states (e.g. three bands), each with an honest read of where they are, the single highest-leverage next move, and a specific reason the practice is the one to close that gap. The result creates a problem-aware → solution-aware shift.
5. NEXT STEP — gate the full personalized breakdown behind a single email capture, then one confident CTA to the real offer (a call, a plan, the program) matched to their band. No second competing ask.

Write real, embedded copy for every section — headline, subhead, question stems, answer options, result-band language, and CTA microcopy — in the tenant's voice, publication-ready, zero bracketed placeholders. Keep it inclusive to the practice, business, agency, or advisory served; palette feeling from {{tenant_palette}} shows in tone, not decoration, and the accent is spent only on the primary CTA. Return a clean, buildable landing structure with the copy in place. Avoid: {{anti_patterns}}.$tpl$,
   'Platform default — self-scoring assessment/scorecard lead-magnet landing page (Hormozi-lineage value-equation framing) with embedded direct-response copy.',
   '{"version":1,"family":"landing","pattern":"assessment-scorecard","lineage":"hormozi-value-equation","source":"public direct-response patterns — pattern-learning, not copied"}'::jsonb),

  -- 2) MOBILE ONE-QUESTION-PER-SCREEN QUIZ FUNNEL (Perspective.co-lineage) ───────────────────────
  ('text', 'anthropic', 'landing-quiz-funnel-mobile',
   $tpl$You are a senior mobile conversion designer building a ONE-QUESTION-PER-SCREEN quiz funnel for {{tenant_name}}, serving {{tenant_target_market}}. The brief: {{user_intent}}. Voice: {{tenant_voice}} — direct, warm, confident; conversational, never robotic.

Design mobile-first for a story-driven quiz that feels like a guided conversation, not a form. Each step is its own full-screen card with a single decision, a visible progress indicator, and a large thumb-friendly tap target — momentum builds because every tap is a tiny yes that carries the visitor to the next screen. This micro-commitment structure is why interactive quiz funnels out-convert a static page for this audience.

Produce the full step-by-step flow:
1. OPENING SCREEN — a bold, benefit-led hook that promises a personalized outcome ("Find your…", "Discover which…") tuned to the brief, one line of reassurance about how quick it is, and a single START button (the one accent moment on the screen).
2. QUALIFYING / SEGMENTING STEPS — 4 to 7 single-question screens, one decision each, that both engage the visitor and quietly segment them (their situation, their goal, their biggest obstacle, their readiness). Write the question stem and 2–4 tappable answer options per screen, each option in plain, human language. Order them so the easiest, most engaging question comes first and commitment deepens gradually.
3. MICRO-COMMITMENT & VALUE SCREENS — between questions, insert one or two short affirmation/value screens that reflect the visitor's answers back ("Got it — here's what that usually means…") to build trust and reduce drop-off. Keep them to a sentence or two.
4. EMAIL / CONTACT CAPTURE — a single soft-gated screen positioned as "where should we send your result?", framed as the natural next step, not a wall. One field emphasis, honest reassurance.
5. RESULT SCREEN — a personalized outcome that reflects their answers, names the single most useful next move for their segment, and presents one confident CTA into the matched offer. One ask only.

Write every screen's real copy — hook, progress microcopy, each question and its options, transition/value lines, capture prompt, and result variants — in the tenant's voice, publication-ready, no bracketed placeholders. Design for a small screen first: one idea per screen, generous tap targets, strong contrast, the accent spent only on the advancing button. Palette feeling from {{tenant_palette}} lives in tone. Keep it inclusive to the practice, business, or agency served. Avoid: {{anti_patterns}}.$tpl$,
   'Platform default — mobile one-question-per-screen quiz funnel (Perspective.co-lineage micro-commitment flow) with embedded per-screen copy.',
   '{"version":1,"family":"landing","pattern":"quiz-funnel-mobile","lineage":"perspective-co-micro-commitment","source":"public funnel patterns — pattern-learning, not copied"}'::jsonb),

  -- 3) LONG-FORM SALES PAGE — story arc + offer stack + guarantee (Brunson-lineage) ──────────────
  ('text', 'anthropic', 'landing-sales-page-longform',
   $tpl$You are a senior direct-response copywriter and page architect building a LONG-FORM sales page for {{tenant_name}}, serving {{tenant_target_market}}. The brief: {{user_intent}}. Voice: {{tenant_voice}} — direct, confident, mogul-founder; vivid and specific, never hollow or buzzwordy.

A long-form sales page earns a high-consideration yes by carrying the reader through a complete emotional and logical arc, then making the offer so clearly worth it that saying no feels like the expensive choice. Build the full narrative with real embedded copy at every beat:
1. HEADLINE + PROMISE — a big, specific, believable promise centered on the reader's dream outcome; a subhead that sharpens who it's for and what's different. The one primary CTA appears here and repeats down the page — the only place the accent color lands.
2. THE HOOK / STORY — open with a relatable moment of tension or an origin story that mirrors the reader's current struggle. Establish the stakes and earn the read.
3. PROBLEM AGITATION → NEW OPPORTUNITY — name the real problem plainly, agitate the cost of staying there, then pivot to the new vehicle/approach that changes the game (the "there is a better way" turn).
4. THE OFFER STACK — present the core offer, then stack the components and deliverables one by one, assigning honest value to each so the perceived value visibly exceeds the price before price is ever mentioned. Make the transformation, not the features, the hero.
5. PROOF — weave in credible social proof placeholders described in structure (results, testimonials, case snapshots, credentials) and tell the reader exactly what proof belongs here so the tenant can drop in real assets — never fabricate specific numbers or names.
6. PRICE + VALUE JUSTIFICATION — reveal the price only after value is established; anchor it against the cost of the problem and the value of the stack.
7. RISK REVERSAL / GUARANTEE — a clear, confident guarantee that removes the reader's risk and shows the practice stands behind the outcome.
8. URGENCY / REASON TO ACT NOW — an honest reason not to wait (real scarcity, a closing enrollment, a bonus that expires) — never a fake countdown.
9. FAQ + FINAL CLOSE — answer the last three or four real objections, then a confident final CTA that restates the promise and the single next step.

Write publication-ready copy for every beat in the tenant's voice, with clearly marked spots for the tenant's own proof and price — no bracketed placeholders in the persuasive copy itself, and no invented statistics. Keep it inclusive to the practice, business, agency, or advisory served. Palette feeling from {{tenant_palette}} shows in tone; the accent is spent only on the primary CTA, never as a background. Avoid: {{anti_patterns}}.$tpl$,
   'Platform default — long-form story→offer-stack→guarantee sales page (Brunson-lineage) with embedded direct-response copy and honest proof/price slots.',
   '{"version":1,"family":"landing","pattern":"sales-page-longform","lineage":"brunson-value-ladder","source":"public direct-response patterns — pattern-learning, not copied"}'::jsonb),

  -- 4) WEBINAR REGISTRATION — countdown urgency + preview reel ───────────────────────────────────
  ('text', 'anthropic', 'landing-webinar-registration',
   $tpl$You are a senior direct-response designer building a WEBINAR / LIVE-TRAINING registration page for {{tenant_name}}, serving {{tenant_target_market}}. The brief: {{user_intent}}. Voice: {{tenant_voice}} — direct, confident, founder-grade; specific and momentum-driven.

A registration page has one job: convert a cold visitor into a committed attendee. The whole page bends toward the single register action, and honest urgency plus a compelling preview of what they'll walk away with does the lifting. Build it with real embedded copy:
1. HERO — a benefit-led headline naming the specific transformation or "aha" the training delivers, a subhead naming who it's for and the format (live training / workshop / masterclass). Surface the date, time, and time zone clearly, and a genuine countdown to the start (real, never a resetting fake timer). One primary CTA — "Save my seat" style — the single accent moment.
2. WHAT YOU'LL LEARN — a tight list of 3 to 5 concrete takeaways, each phrased as a specific outcome the attendee gets, not a vague topic. Lead with the most surprising or valuable one.
3. THE PREVIEW REEL — describe the structure for a short teaser: a preview of the promise, a glimpse of the method, and the moment of proof, with copy that builds anticipation for the live session. Tell the tenant exactly what belongs in the reel so they can drop in their own footage — never fabricate quotes or clips.
4. WHO'S HOSTING — a confident, credible bio positioning the host as the right person to deliver this outcome, tied to results relevant to the audience (structure the credibility, leave real specifics to the tenant).
5. SOCIAL PROOF + SCARCITY — space for real testimonials or attendance proof, plus an honest reason the seat matters now (limited live capacity, bonus for live attendees, replay window). No fake scarcity.
6. FINAL CTA + LOGISTICS — restate the promise, the date/time, and the single register action; reassure on effort ("bring a notepad, block 60 minutes"). One ask only.

Write publication-ready copy for every section in the tenant's voice — headline, takeaways, reel structure copy, host bio scaffold, urgency lines, and CTA microcopy — with clearly marked slots for the tenant's real date, footage, and proof, and no bracketed placeholders in the persuasive copy. Keep it inclusive to the practice, business, agency, or advisory served. Palette feeling from {{tenant_palette}} shows in tone; the accent is spent only on the register CTA and the live countdown, never as a background wash. Avoid: {{anti_patterns}}.$tpl$,
   'Platform default — webinar/live-training registration page (real countdown urgency + preview-reel structure) with embedded conversion copy.',
   '{"version":1,"family":"landing","pattern":"webinar-registration","lineage":"live-training-urgency","source":"public direct-response patterns — pattern-learning, not copied"}'::jsonb),

  -- 5) PRODUCT LAUNCH — pre-order social proof + waitlist ────────────────────────────────────────
  ('text', 'anthropic', 'landing-product-launch',
   $tpl$You are a senior launch designer building a PRODUCT-LAUNCH / PRE-ORDER + WAITLIST page for {{tenant_name}}, serving {{tenant_target_market}}. The brief: {{user_intent}}. Voice: {{tenant_voice}} — direct, confident, founder-grade; magnetic and anticipation-building.

A launch page manufactures momentum before the thing is fully available: it turns interest into an early, committed list by making the reader feel they're getting in ahead of the crowd. Build it with real embedded copy:
1. HERO — a headline that frames the launch as a new, better way to reach the reader's outcome, a subhead naming exactly what's coming and who it's for, and a clear status signal ("Coming [timeframe]" / "Now in pre-order"). One primary CTA — "Join the waitlist" or "Reserve your spot" — the single accent moment.
2. THE STORY BEHIND IT — a short, honest founder narrative on why this is being built now and the problem it finally solves — anticipation comes from meaning, not hype.
3. WHAT'S INSIDE / WHAT YOU GET — a crisp preview of the core value and the headline deliverables, framed as outcomes; enough to make it real, not so much that the launch has nothing left to reveal.
4. EARLY-ACCESS INCENTIVE — a concrete reason to commit now instead of later (early pricing, a founding-member bonus, first access, a limited first cohort). Keep it honest and specific.
5. SOCIAL PROOF / MOMENTUM — structure for waitlist momentum ("X already reserved" style, populated by real numbers only), plus space for early testimonials, credibility, or a notable name. Tell the tenant what proof belongs here — never invent a count or a quote.
6. FAQ — answer the three or four real pre-purchase questions (timing, what happens after I join, refund/commitment terms) plainly.
7. FINAL CTA — restate the promise and the early-access reason, one waitlist/pre-order action. One ask only.

Write publication-ready copy for every section in the tenant's voice — headline, founder story, value preview, incentive framing, FAQ, and CTA microcopy — with clearly marked slots for real numbers, dates, and proof, and no bracketed placeholders in the persuasive copy or fabricated stats. Keep it inclusive to the practice, business, agency, or advisory served. Palette feeling from {{tenant_palette}} shows in tone; the accent is spent only on the waitlist/pre-order CTA, never as a background. Avoid: {{anti_patterns}}.$tpl$,
   'Platform default — product-launch pre-order + waitlist page (early-access incentive + honest momentum proof) with embedded launch copy.',
   '{"version":1,"family":"landing","pattern":"product-launch-waitlist","lineage":"pre-launch-momentum","source":"public launch patterns — pattern-learning, not copied"}'::jsonb),

  -- 6) LEAD-MAGNET OPT-IN — opt-in → sequence entry ─────────────────────────────────────────────
  ('text', 'anthropic', 'landing-lead-magnet-optin',
   $tpl$You are a senior direct-response designer building a focused LEAD-MAGNET OPT-IN page for {{tenant_name}}, serving {{tenant_target_market}}. The brief: {{user_intent}}. Voice: {{tenant_voice}} — direct, confident, founder-grade; clear and benefit-first.

An opt-in page trades one specific, high-value resource for an email and enters the visitor into a nurture sequence. It wins on focus: one promise, one form, one action, no distractions. The magnet must feel like a genuine shortcut to the reader's outcome — a guide, checklist, template, swipe file, mini-course, or toolkit tuned to the brief. Build it with real embedded copy:
1. HERO — a headline naming the exact result the resource delivers (specific and believable, not "free guide"), a subhead that sharpens who it's for and the single most valuable thing they'll get from it. One primary CTA on the form — "Send it to me" style — the single accent moment. Keep the page tight and above-the-fold-first; no scroll-wall.
2. WHAT'S INSIDE — 3 to 5 bullet lines, each a concrete benefit or "you'll be able to…" outcome from the resource, leading with the strongest. Make the value feel immediate.
3. WHY IT'S CREDIBLE — one or two lines establishing why this practice is the right source for this resource (relevant results or credibility, structured — real specifics left to the tenant).
4. THE FORM — a single low-friction opt-in (name optional, email required), framed as "where should we send it?", with honest reassurance about what they're signing up for and a light privacy note. One field emphasis, one button.
5. WHAT HAPPENS NEXT — a short line setting the expectation that the resource arrives by email and that helpful follow-ups will come — the honest entry into the nurture sequence, never a bait-and-switch.

Write publication-ready copy for every section in the tenant's voice — headline, subhead, benefit bullets, credibility line, form microcopy, and the what-happens-next line — with no bracketed placeholders. Keep it inclusive to the practice, business, agency, or advisory served, and keep the page ruthlessly focused: one promise, one form, one action, nothing competing with the opt-in. Palette feeling from {{tenant_palette}} shows in tone; the accent is spent only on the opt-in button, never as a background. Avoid: {{anti_patterns}}.$tpl$,
   'Platform default — focused lead-magnet opt-in page (one promise, one form) that enters the nurture sequence, with embedded conversion copy.',
   '{"version":1,"family":"landing","pattern":"lead-magnet-optin","lineage":"single-focus-optin","source":"public direct-response patterns — pattern-learning, not copied"}'::jsonb),

  -- 7) HERO TREATMENT — image/ideogram, brand-locked type + gold-restraint clause ────────────────
  ('image-with-text', 'ideogram', 'landing-hero-treatment',
   $tpl$Design a premium landing-page HERO visual — image with integrated typography — for {{tenant_name}}, a practice serving {{tenant_target_market}}. Concept and headline direction from the brief: {{user_intent}}. Mood and voice: {{tenant_voice}}.

Compose a wide, cinematic hero band with a clear focal subject and deliberate depth — a foreground subject, a supporting midground, and an atmospheric background — depth built from layered light and elevation, never a flat fill. Reserve intentional negative space on one side as the headline zone so overlaid or integrated type has room to breathe and stays effortlessly legible against the image. Render the headline lettering as clean, confident, brand-locked type: a single type personality, tight optical spacing, a real weight-and-size hierarchy between headline and subhead, tight negative tracking on the large display line so it reads expensive. Keep the wording short and punchy per the brief; render only the words the brief provides, spelled exactly, with flawless kerning.

Palette: {{tenant_palette}} — a calm, credible ground carried through the scene. GOLD / ACCENT RESTRAINT (load-bearing): the accent color is spent ONLY on the single call-to-action moment — the button, or one deliberate emphasis word — never as a background wash, never sprayed across the whole hero, never a full gold field behind the type. Everything else stays in the calm ground palette so the one accent actually pops; strong figure-ground contrast keeps the headline crisp. Light is soft and directional; composition sits on a deliberate asymmetric grid; the whole band reads as one continuous premium system with the page below it.

Deliver a polished, production-grade hero: no mockup frame, no stock-photo cliché, no rainbow gradient, no heavy drop shadow, no busy background noise competing with the type. It should feel bespoke, modern, and instantly ownable — the kind of hero a world-class brand would ship. Avoid: {{anti_patterns}}.$tpl$,
   'Platform default — premium landing-page hero visual with brand-locked integrated typography and an explicit gold/accent-restraint (accent only on the act) clause (Ideogram, typography-accurate).',
   '{"version":1,"family":"landing","pattern":"hero-treatment","lineage":"premium-brand-hero","gold_budget":"accent-on-the-act-only","source":"public premium-hero patterns — pattern-learning, not copied"}'::jsonb),

  -- 8) CSS + FRAMER MOTION RECIPE for a landing hero (ties to Upgrade 6) ─────────────────────────
  ('text', 'anthropic', 'landing-css-motion-recipe',
   $tpl$You are a senior front-end motion engineer authoring a MOTION RECIPE — production CSS + Framer Motion (React) patterns — for the animated hero and above-the-fold of a landing page for {{tenant_name}}, serving {{tenant_target_market}}. The brief: {{user_intent}}. Voice for any embedded copy: {{tenant_voice}} — direct, confident, founder-grade.

Produce a concrete, buildable recipe (real code patterns, not prose about animation) that makes the hero feel alive and premium while staying disciplined. Cover:
1. ENTRANCE CHOREOGRAPHY — a staggered reveal of the hero headline, subhead, and CTA using Framer Motion variants with a parent `staggerChildren` and spring transitions (not fixed-duration linear easing). Give the actual variant objects and the `motion.*` usage, with spring config that feels weighted, not bouncy for its own sake.
2. AMBIENT LIFE — one tasteful ambient effect for the hero field (e.g. a slow animated gradient/aurora sheen via CSS `@keyframes` on a background layer, or a gentle parallax on scroll via `useScroll` + `useTransform`). Keep it lightweight CSS/transform work — concentrate any heavier spectacle only where it earns its pixels, never smeared across the whole working surface.
3. MICRO-INTERACTIONS — hover/press states for the primary CTA using `whileHover` / `whileTap` with a subtle spring lift and a crisp focus-visible ring; the accent color is spent ONLY on this one act, never on resting borders or backgrounds.
4. REDUCED-MOTION FALLBACK (mandatory, per effect) — every animation MUST honor `prefers-reduced-motion`: show the `useReducedMotion()` hook branch and the CSS `@media (prefers-reduced-motion: reduce)` guard, resolving each effect to a clean instant/static state (gradient speed to zero, stagger to none, parallax to fixed). No effect ships without its own fallback.
5. TOKENS + THEME — use CSS custom properties / design tokens for every color, radius, and timing value — no hardcoded hex; the recipe must hold AA contrast in both light and dark, and read as genuinely light in light mode and genuinely dark in dark mode.

Return clean, copy-pasteable React + CSS with brief inline comments explaining each choice, structured so a developer can drop it into a landing hero. Where headline/CTA copy appears in the example, write it in the tenant's voice, publication-ready, no bracketed placeholders. Keep it inclusive to the practice, business, or agency served; palette feeling from {{tenant_palette}} lives in the token values, with the accent reserved for the single CTA act. Avoid: {{anti_patterns}}.$tpl$,
   'Platform default — production CSS + Framer Motion recipe for an animated, reduced-motion-safe, token-only landing hero (ties Studio Upgrade 6 motion patterns).',
   '{"version":1,"family":"landing","pattern":"css-motion-recipe","lineage":"framer-motion-hero","ties":"studio-upgrade-6","source":"public motion patterns — pattern-learning, not copied"}'::jsonb)

) AS v(modality, provider, template_name, template_body, description, metadata)
ON CONFLICT (tenant_id, modality, provider, template_name) DO NOTHING;
