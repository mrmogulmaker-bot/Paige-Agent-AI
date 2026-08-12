-- S2 wave · Category 5 (Marketing & Content) — seed 10 platform baseline skills into paige_skills.
--
-- Run through the generic S1b interpreter (default dispatch) — NO bespoke handler. category =
-- 'marketing_content' (canonical §15, locked by the CHECK in 20260830000000). IP-CLEAN per §14/§62
-- (mechanic-descriptive only — no anchor-person name, no branded marketing-framework title, no source-repo
-- name). tier_availability = §61 default; scoping = 'platform'. §2 FINANCE-CLEAN verified (0 hits).
--
-- §13 INTERPRETER-HONEST / §18 WRAP-DON'T-DUPLICATE: 2 read-only (brand_voice_check, seo_audit —
-- read_only+auto, persist nothing) + 8 DRAFTERS (draft+confirm); NONE publish/post/send. The 5 content-
-- drafters (blog/social/newsletter/ad/landing copy) each carry a FORMAT-DISTINCT methodology and produce
-- copy through the existing content-draft seam. landing_page_copy is the COPY only (Studio/growth-page-draft
-- owns page BUILD). seo_audit researches via the web-search/firecrawl seam. §18 EXCLUSIONS:
--   • "Performance report" NOT seeded here — Cat 6 Analytics owns content-performance reads.
--   • email_sequence_design is the MARKETING list/audience arc (launch/nurture/re-engagement/win-back),
--     distinct from Cat 4 followup_sequence (sales prospect nurture) and Cat 2 draft_followup_email (single).
--
-- SOURCING LINEAGE (attribution here in the reference ONLY, never in a row, per §14): Anthropic Skills
-- registry content structure + standard content-marketing mechanics (goal-anchored planning, search-intent
-- long-form, platform-native hook, value-first newsletter, direct-response ad, conversion-copy hierarchy,
-- multi-touch campaign sequencing, content-gap/keyword audit) — mechanics only, IP-clean, no branded framework.
--
-- §1 crew: 2 distillation engineers + adversarial IP-clean/§16/§18/§2 verifier (verdict SHIP; 0 IP, 0
--   finance, 0 risk/tool; all §18 dedup notes confirm wrap-not-duplicate + format-distinctness).
-- ON CONFLICT (slug) DO NOTHING makes this idempotent + safe to re-run.

insert into public.paige_skills (
  slug, name, description, category, trigger_phrases, steps, allowed_tools,
  risk_level, autonomy_lane, methodology_anchor, tier_availability, scoping,
  created_by, status, require_admin_confirm_first_n
) values
  (
    $s$content_strategy$s$, $s$Content Strategy Plan$s$, $s$Drafts a channel-and-cadence content plan tied to the tenant's audience and a stated goal, reading brand and audience context and filing the plan for approval.$s$,
    $s$marketing_content$s$,
    ARRAY[$s$draft a content plan$s$, $s$what should we post this month$s$, $s$plan our content$s$]::text[],
    $j$[{"id": "gather_context", "tool": "context", "desc": "Read the tenant's audience segments, brand positioning, active goal, and channel presence to ground the plan in what this business actually does and who it serves."}, {"id": "pull_knowledge", "tool": "rag", "desc": "Retrieve the tenant's documented offers, past themes, and knowledge-base notes so the plan reflects their real work rather than generic filler."}, {"id": "draft_plan", "tool": "anthropic", "desc": "Generate a content plan mapping topics to channels to a posting cadence, each item tied back to the stated goal and a named audience segment, in the tenant's voice."}, {"id": "file_draft", "tool": "client_memory", "desc": "Save the drafted plan as an internal record filed for the owner's approval — the interpreter files a draft; it does not publish or schedule anything."}]$j$::jsonb,
    ARRAY[$s$context$s$, $s$rag$s$, $s$anthropic$s$, $s$client_memory$s$]::text[],
    $s$draft$s$, $s$confirm$s$,
    $s$Goal-anchored content planning: fix one measurable objective, map each planned piece to a specific audience segment and native channel on a realistic cadence, and sequence themes so every post earns its place against the goal.$s$,
    $j${"god": "yes", "solo": "yes", "sub_account": "yes", "agency": "resell", "enterprise": "yes+resell"}$j$::jsonb, $s$platform$s$,
    'system', 'active', 0
  ),
  (
    $s$brand_voice_check$s$, $s$Brand Voice Check$s$, $s$Checks a supplied draft against the tenant's documented brand voice and returns off-voice lines with suggested fixes. Analysis only — saves and sends nothing.$s$,
    $s$marketing_content$s$,
    ARRAY[$s$does this sound like us$s$, $s$check this against our voice$s$, $s$is this on brand$s$]::text[],
    $j$[{"id": "load_voice", "tool": "context", "desc": "Load the tenant's documented brand-voice attributes — tone, cadence, permitted and banned words, point of view — so the check measures against a real standard, not a guess."}, {"id": "retrieve_examples", "tool": "rag", "desc": "Pull representative on-voice tenant copy as reference exemplars for what the documented voice sounds like in practice."}, {"id": "analyze_draft", "tool": "anthropic", "desc": "Compare the supplied draft line by line to the documented voice, flag each off-voice line with the specific attribute it violates, and propose an in-voice rewrite for each — returned as findings only, with nothing saved or sent."}]$j$::jsonb,
    ARRAY[$s$context$s$, $s$rag$s$, $s$anthropic$s$]::text[],
    $s$read_only$s$, $s$auto$s$,
    $s$Line-level voice conformance: score each line against the documented voice attributes, surface the exact deviating phrase and the rule it breaks, and pair every flag with a concrete in-voice fix so the human can accept or ignore it.$s$,
    $j${"god": "yes", "solo": "yes", "sub_account": "yes", "agency": "resell", "enterprise": "yes+resell"}$j$::jsonb, $s$platform$s$,
    'system', 'active', 0
  ),
  (
    $s$blog_post_draft$s$, $s$Blog Post Draft$s$, $s$Drafts a search-intent-structured long-form blog post on a topic in the tenant's voice through the content-draft seam, and files it for approval.$s$,
    $s$marketing_content$s$,
    ARRAY[$s$write a blog post about$s$, $s$draft an article on$s$, $s$we need a long-form post$s$]::text[],
    $j$[{"id": "gather_context", "tool": "context", "desc": "Read the tenant's brand voice, audience, and the topic and goal for the piece so the draft is native to their business."}, {"id": "research_intent", "tool": "firecrawl", "desc": "Use the web-research seam to gather what searchers actually want on this topic — the questions being asked and the sub-topics that must be covered to satisfy the intent."}, {"id": "draft_post", "tool": "anthropic", "desc": "Draft the long-form post through the existing content-draft seam: an intent-matched headline, an H2 scaffold that answers the query, scannable body sections, and a single CTA — in the tenant's voice."}, {"id": "file_draft", "tool": "client_memory", "desc": "Save the completed draft as an internal record filed for approval — the interpreter files a draft; it never publishes the post."}]$j$::jsonb,
    ARRAY[$s$context$s$, $s$firecrawl$s$, $s$anthropic$s$, $s$client_memory$s$]::text[],
    $s$draft$s$, $s$confirm$s$,
    $s$Search-intent long-form structure: match the dominant intent behind the topic, lead with an intent-answering headline, scaffold H2s that resolve the searcher's real questions, keep the body scannable, and close on one CTA.$s$,
    $j${"god": "yes", "solo": "yes", "sub_account": "yes", "agency": "resell", "enterprise": "yes+resell"}$j$::jsonb, $s$platform$s$,
    'system', 'active', 0
  ),
  (
    $s$social_post_draft$s$, $s$Social Post Draft$s$, $s$Drafts a platform-native social post — for the platform the caller names (LinkedIn, X, Instagram, TikTok, or YouTube) — with a scroll-stopping hook, through the content-draft seam, and files it for approval.$s$,
    $s$marketing_content$s$,
    ARRAY[$s$draft a post for LinkedIn$s$, $s$write a social post$s$, $s$make an Instagram caption$s$]::text[],
    $j$[{"id": "gather_context", "tool": "context", "desc": "Read the tenant's brand voice, audience, the named target platform, and the message or offer so the draft fits both the business and that platform's native pattern."}, {"id": "draft_post", "tool": "anthropic", "desc": "Draft the post through the existing content-draft seam: a scroll-stopping hook in the first line, body shaped to the named platform's native format and length, and one clear CTA — in the tenant's voice."}, {"id": "file_draft", "tool": "client_memory", "desc": "Save the draft as an internal record filed for approval — the interpreter files a draft; it never posts to any platform."}]$j$::jsonb,
    ARRAY[$s$context$s$, $s$anthropic$s$, $s$client_memory$s$]::text[],
    $s$draft$s$, $s$confirm$s$,
    $s$Platform-native scroll-stopper: open with a first-line hook that stops the scroll, shape length and format to the specific platform the caller named, and drive to exactly one CTA rather than a generic cross-platform blob.$s$,
    $j${"god": "yes", "solo": "yes", "sub_account": "yes", "agency": "resell", "enterprise": "yes+resell"}$j$::jsonb, $s$platform$s$,
    'system', 'active', 0
  ),
  (
    $s$email_newsletter_draft$s$, $s$Email Newsletter Draft$s$, $s$Drafts a value-first email newsletter issue with one clear CTA in the tenant's voice through the content-draft seam, and files it for approval.$s$,
    $s$marketing_content$s$,
    ARRAY[$s$draft this week's newsletter$s$, $s$write an email newsletter$s$, $s$put together a newsletter issue$s$]::text[],
    $j$[{"id": "gather_context", "tool": "context", "desc": "Read the tenant's brand voice, subscriber audience, and the theme or update for this issue so the draft leads with what the reader actually values."}, {"id": "draft_issue", "tool": "anthropic", "desc": "Draft the newsletter through the existing content-draft seam: a subject line, a value-first body that gives the subscriber something useful before any ask, and exactly one clear CTA — in the tenant's voice."}, {"id": "file_draft", "tool": "client_memory", "desc": "Save the draft as an internal record filed for approval — the interpreter files a draft; it never sends the email."}]$j$::jsonb,
    ARRAY[$s$context$s$, $s$anthropic$s$, $s$client_memory$s$]::text[],
    $s$draft$s$, $s$confirm$s$,
    $s$Value-first single-CTA newsletter: deliver reader value up front, keep the issue to one primary action, and resist the multi-ask that dilutes the click — the subject earns the open, the body earns the trust, one CTA earns the action.$s$,
    $j${"god": "yes", "solo": "yes", "sub_account": "yes", "agency": "resell", "enterprise": "yes+resell"}$j$::jsonb, $s$platform$s$,
    'system', 'active', 0
  ),
  (
    $s$ad_copy_draft$s$, $s$Ad Copy Draft$s$, $s$Drafts short direct-response ad copy — headline, primary text, and CTA — for a named platform and offer, through the content-draft seam, filed for your approval.$s$,
    $s$marketing_content$s$,
    ARRAY[$s$draft an ad for this offer$s$, $s$write me some ad copy$s$, $s$I need a Facebook ad headline and CTA$s$]::text[],
    $j$[{"id": "gather_brief", "tool": "context", "desc": "Gather the offer, the target audience, and the named ad platform along with its format and character constraints (so the copy fits where it will run)."}, {"id": "pull_voice", "tool": "rag", "desc": "Retrieve the tenant's brand voice and any prior high-performing ad angles to keep the draft native to their business."}, {"id": "draft_copy", "tool": "anthropic", "desc": "Draft headline + primary text + CTA variants through the existing content-draft seam using the short direct-response mechanic: one dominant benefit, a pattern-interrupt opening line, and a single explicit call to action sized to the platform."}]$j$::jsonb,
    ARRAY[$s$context$s$, $s$rag$s$, $s$anthropic$s$]::text[],
    $s$draft$s$, $s$confirm$s$,
    $s$Short-form direct response: lead with one dominant benefit, open on a pattern-interrupt hook, keep to the platform's character and format limits, and close on a single explicit CTA — no multi-message stacking, one action per ad.$s$,
    $j${"god": "yes", "solo": "yes", "sub_account": "yes", "agency": "resell", "enterprise": "yes+resell"}$j$::jsonb, $s$platform$s$,
    'system', 'active', 0
  ),
  (
    $s$landing_page_copy$s$, $s$Landing Page Copy$s$, $s$Drafts the conversion copy that fills a landing page — headline, subhead, value, proof, and CTA — through the content-draft seam. Copy only; the Studio owns the page build.$s$,
    $s$marketing_content$s$,
    ARRAY[$s$write the copy for my landing page$s$, $s$draft landing page conversion copy$s$, $s$I need headline and CTA copy for a sales page$s$]::text[],
    $j$[{"id": "gather_goal", "tool": "context", "desc": "Gather the single conversion goal, the offer, the audience, and the concrete proof points available (results, testimonials, credentials)."}, {"id": "pull_proof", "tool": "rag", "desc": "Retrieve the tenant's brand voice and stored proof assets (testimonials, case outcomes) to ground the value and proof blocks."}, {"id": "draft_blocks", "tool": "anthropic", "desc": "Draft the copy blocks — headline, subhead, value stack, proof, and a repeated CTA — through the existing content-draft seam, organized as a single-conversion-goal message hierarchy. This is the copy that fills a page; it does not build the page (the Studio/growth-page-draft owns the build)."}]$j$::jsonb,
    ARRAY[$s$context$s$, $s$rag$s$, $s$anthropic$s$]::text[],
    $s$draft$s$, $s$confirm$s$,
    $s$Single-conversion-goal message hierarchy: one promise in the headline, a benefit-led subhead, a value stack that answers 'what do I get', proof that removes doubt, and one CTA repeated at each decision point — every block serves the same single action.$s$,
    $j${"god": "yes", "solo": "yes", "sub_account": "yes", "agency": "resell", "enterprise": "yes+resell"}$j$::jsonb, $s$platform$s$,
    'system', 'active', 0
  ),
  (
    $s$campaign_plan$s$, $s$Campaign Plan$s$, $s$Drafts a multi-touch, multi-channel campaign plan for a launch or promotion — the sequence of touches across channels with timing and the goal of each — filed for your approval.$s$,
    $s$marketing_content$s$,
    ARRAY[$s$plan a launch campaign$s$, $s$map out a multi-channel promotion$s$, $s$draft a campaign plan for this offer$s$]::text[],
    $j$[{"id": "gather_scope", "tool": "context", "desc": "Gather the launch or promotion details, the timeline, the audience, and which channels are available to the tenant (email, social, SMS, ads, etc.)."}, {"id": "pull_assets", "tool": "rag", "desc": "Retrieve prior campaign structures and reusable tenant assets to anchor the plan in what has worked before."}, {"id": "draft_plan", "tool": "anthropic", "desc": "Draft the multi-touch schedule through the existing content-draft seam — each touch mapped to a channel, a send/publish time relative to the launch, and one clear objective for that touch — as a phased awareness-to-conversion-to-follow-up arc."}]$j$::jsonb,
    ARRAY[$s$context$s$, $s$rag$s$, $s$anthropic$s$]::text[],
    $s$draft$s$, $s$confirm$s$,
    $s$Phased multi-channel orchestration: sequence touches across awareness, consideration, conversion, and post-purchase follow-up, mapping each touch to a channel, a relative timing anchor, and a single objective so the whole arc builds momentum toward one goal.$s$,
    $j${"god": "yes", "solo": "yes", "sub_account": "yes", "agency": "resell", "enterprise": "yes+resell"}$j$::jsonb, $s$platform$s$,
    'system', 'active', 0
  ),
  (
    $s$email_sequence_design$s$, $s$Email Sequence Design$s$, $s$Drafts a marketing email sequence to a list or audience — launch, nurture, re-engagement, or win-back — as a multi-email arc with the angle of each email, filed for your approval.$s$,
    $s$marketing_content$s$,
    ARRAY[$s$design a nurture email sequence$s$, $s$draft a launch email series for my list$s$, $s$write me a win-back email campaign$s$]::text[],
    $j$[{"id": "gather_type", "tool": "context", "desc": "Gather the sequence type (launch / nurture / re-engagement / win-back), the offer, the audience segment, and the state of the list so the arc and pacing fit."}, {"id": "pull_voice", "tool": "rag", "desc": "Retrieve the tenant's brand voice and any prior email sequences to keep tone and structure consistent with their business."}, {"id": "draft_arc", "tool": "anthropic", "desc": "Draft the email arc through the existing content-draft seam — for each email a distinct angle or objection to address, a subject line, and a body outline — building the sequence toward a single CTA with pacing appropriate to the sequence type."}]$j$::jsonb,
    ARRAY[$s$context$s$, $s$rag$s$, $s$anthropic$s$]::text[],
    $s$draft$s$, $s$confirm$s$,
    $s$Value-first multi-email arc to a list/audience: each email carries one angle or objection, pacing and count set by sequence type (launch cadence vs. slow nurture vs. re-engagement vs. win-back), the whole arc leading to a single CTA — distinct from a one-off follow-up email and from a sales prospect nurture cadence.$s$,
    $j${"god": "yes", "solo": "yes", "sub_account": "yes", "agency": "resell", "enterprise": "yes+resell"}$j$::jsonb, $s$platform$s$,
    'system', 'active', 0
  ),
  (
    $s$seo_audit$s$, $s$SEO Content Audit$s$, $s$Surfaces content gaps and keyword opportunities for the tenant's site or topic by researching through the web-search/firecrawl seam, and returns ranked findings — it saves and sends nothing.$s$,
    $s$marketing_content$s$,
    ARRAY[$s$find content gaps on my site$s$, $s$audit my site for SEO opportunities$s$, $s$what keywords am I missing$s$]::text[],
    $j$[{"id": "gather_topic", "tool": "context", "desc": "Gather the tenant's site or topic and target audience so the research is scoped to the right subject and searcher intent."}, {"id": "research_web", "tool": "firecrawl", "desc": "Research through the web-search/firecrawl seam: crawl the tenant's site and competing content, and surface current keyword coverage alongside the gaps and intent not yet addressed."}, {"id": "synthesize_findings", "tool": "anthropic", "desc": "Synthesize the research into ranked content gaps and keyword opportunities mapped to search intent, and return the findings only — nothing is saved or sent."}]$j$::jsonb,
    ARRAY[$s$context$s$, $s$firecrawl$s$, $s$anthropic$s$]::text[],
    $s$read_only$s$, $s$auto$s$,
    $s$Search-intent gap analysis: crawl the tenant's own content and competing content, map existing keyword coverage against the intents searchers have, and rank the uncovered opportunities by relevance and reachability — analysis returned to the user, persisting and sending nothing.$s$,
    $j${"god": "yes", "solo": "yes", "sub_account": "yes", "agency": "resell", "enterprise": "yes+resell"}$j$::jsonb, $s$platform$s$,
    'system', 'active', 0
  )
on conflict (slug) do nothing;
