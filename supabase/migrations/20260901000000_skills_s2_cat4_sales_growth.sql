-- S2 wave · Category 4 (Sales & Growth) — seed 9 platform baseline skills into paige_skills.
--
-- These run through the generic S1b interpreter (default dispatch) — NO bespoke handler code. category =
-- 'sales_growth' (canonical §15, locked by the CHECK in 20260830000000). Each row is IP-CLEAN per §14/§62
-- (mechanic-descriptive only — no anchor-person name, no branded sales-methodology title/acronym, no
-- source-repo name). tier_availability = §61 default; scoping = 'platform'.
--
-- §2 FINANCE-CLEAN (the critical gate for Sales): coaching-generic ONLY — zero credit/funding/lender/loan/
-- financing/FICO wording. Funding is a per-tenant opt-in preset, NEVER a platform default. Verified 0 hits.
--
-- §13 INTERPRETER-HONEST / §18 WRAP-DON'T-DUPLICATE: 3 read-only analysis skills (lead_triage,
-- pipeline_review, revenue_forecast — read_only+auto, persist nothing) + 6 DRAFTERS (draft+confirm); NONE
-- send/mutate. Each names the existing downstream seam in its step desc rather than reimplementing it:
--   • outreach_draft -> apollo-search-people (research) + generate-outreach-draft (existing path) + crm_search_contacts + compose-email (downstream send)
--   • followup_sequence -> crm_search_contacts + compose-email
--   • lead_triage / pipeline_review / revenue_forecast / discovery_call_prep -> crm_search_contacts / apollo-search-people (reads)
-- §18 EXCLUSION: "proposal drafting" is NOT seeded here — it is Cat 2 draft_client_proposal (one home); the
-- sales flow references it. followup_sequence is the MULTI-touch cadence, distinct from Cat 2 draft_followup_email.
--
-- SOURCING LINEAGE (attribution here in the reference ONLY, never in a row, per §14): distilled from the
-- Anthropic Skills registry structure + standard sales-ops mechanics (fit/urgency lead scoring, weighted
-- pipeline forecasting, stale-deal detection, problem-first discovery prep, objection-response framing) —
-- mechanics only, rewritten IP-clean, no branded methodology.
--
-- §1 crew: 2 distillation engineers + adversarial IP-clean/§16/§18/§2 verifier (verdict SHIP; 0 IP
--   violations, 0 finance violations, 0 risk/tool issues; all §18 dedup notes confirm wrap-not-duplicate).
-- ON CONFLICT (slug) DO NOTHING makes this idempotent + safe to re-run.

insert into public.paige_skills (
  slug, name, description, category, trigger_phrases, steps, allowed_tools,
  risk_level, autonomy_lane, methodology_anchor, tier_availability, scoping,
  created_by, status, require_admin_confirm_first_n
) values
  (
    $s$lead_triage$s$, $s$Lead Triage & Ranking$s$, $s$Scores and ranks inbound leads by fit and urgency, returning a prioritized list with the reason behind each lead's placement. Reads lead data only — nothing is saved or sent.$s$,
    $s$sales_growth$s$,
    ARRAY[$s$which leads should I chase first$s$, $s$rank my new leads$s$, $s$score these inbounds$s$]::text[],
    $j$[{"id": "load_leads", "tool": "context", "desc": "Pull the current inbound leads via the crm_search_contacts seam — names, source, recency, engagement signals, and any qualifying fields already captured."}, {"id": "load_fit_criteria", "tool": "rag", "desc": "Retrieve the tenant's ideal-client fit signals and qualifying criteria from their knowledge base so scoring reflects THIS business, not a generic template."}, {"id": "score_and_rank", "tool": "anthropic", "desc": "Score each lead on fit (match to the retrieved criteria) and urgency (recency, intent signals, stated timeline), rank them high-to-low, and give a one-line reason per lead. Returns the ranked list only — saves and sends nothing."}]$j$::jsonb,
    ARRAY[$s$context$s$, $s$rag$s$, $s$anthropic$s$]::text[],
    $s$read_only$s$, $s$auto$s$,
    $s$Rank inbound leads by scoring each against the tenant's ideal-client fit signals and urgency indicators (recency, intent, stated timeline), returning a prioritized list with a stated reason for every lead's placement.$s$,
    $j${"god": "yes", "solo": "yes", "sub_account": "yes", "agency": "resell", "enterprise": "yes+resell"}$j$::jsonb, $s$platform$s$,
    'system', 'active', 0
  ),
  (
    $s$outreach_draft$s$, $s$Personalized Cold Outreach Draft$s$, $s$Drafts a personalized first-touch message (email, connection note, or DM) for a specific prospect, grounded in prospect and account research. Files the draft for approval — Paige does not send it.$s$,
    $s$sales_growth$s$,
    ARRAY[$s$write a cold email to this prospect$s$, $s$draft an intro message for$s$, $s$reach out to this lead$s$]::text[],
    $j$[{"id": "load_prospect", "tool": "context", "desc": "Load the target prospect's record via crm_search_contacts — role, company, prior touches, and any notes already on file."}, {"id": "research", "tool": "firecrawl", "desc": "Enrich with prospect and account context using the apollo-search-people research seam plus public web signals (recent company news, role details) so the opener is specific, not generic."}, {"id": "draft_message", "tool": "anthropic", "desc": "Draft the personalized outreach through the existing generate-outreach-draft path — in the tenant's voice, one clear call to action, grounded in the research from the prior step."}, {"id": "file_for_approval", "tool": "client_memory", "desc": "Save the draft as an internal record filed for the owner's approval. Downstream send is handled by the compose-email seam once approved — this skill never sends."}]$j$::jsonb,
    ARRAY[$s$context$s$, $s$firecrawl$s$, $s$anthropic$s$, $s$client_memory$s$]::text[],
    $s$draft$s$, $s$confirm$s$,
    $s$Ground a personalized first-touch message in researched prospect and account context, match the tenant's voice with a single clear call to action, and file it for human approval rather than sending it.$s$,
    $j${"god": "yes", "solo": "yes", "sub_account": "yes", "agency": "resell", "enterprise": "yes+resell"}$j$::jsonb, $s$platform$s$,
    'system', 'active', 0
  ),
  (
    $s$followup_sequence$s$, $s$Multi-Touch Nurture Cadence$s$, $s$Drafts a multi-touch nurture cadence — a sequence of distinct touches spaced over time — for a warm or cold prospect. Distinct from the single-message draft_followup_email; files the cadence for approval.$s$,
    $s$sales_growth$s$,
    ARRAY[$s$build a nurture sequence for$s$, $s$draft a follow-up cadence$s$, $s$set up a multi-touch follow-up$s$]::text[],
    $j$[{"id": "load_prospect_history", "tool": "context", "desc": "Load the prospect via crm_search_contacts along with prior engagement — what they've already received, opened, or replied to — so the cadence builds on history instead of repeating it."}, {"id": "load_nurture_assets", "tool": "rag", "desc": "Retrieve the tenant's nurture playbook and value-content library from their knowledge base to source the angle and hook for each touch."}, {"id": "draft_cadence", "tool": "anthropic", "desc": "Draft the full multi-touch sequence — each touch a distinct angle and value hook with a proposed send interval between them. This is the MULTI-touch cadence, distinct from the single-message draft_followup_email skill."}, {"id": "file_for_approval", "tool": "client_memory", "desc": "Save the drafted cadence as an internal record filed for the owner's approval. Each approved touch sends downstream through the compose-email seam — this skill never sends."}]$j$::jsonb,
    ARRAY[$s$context$s$, $s$rag$s$, $s$anthropic$s$, $s$client_memory$s$]::text[],
    $s$draft$s$, $s$confirm$s$,
    $s$Sequence a multi-touch nurture cadence over time for a warm or cold prospect — each touch a distinct angle and value hook with deliberate spacing, built on the prospect's prior engagement — and file it for human approval.$s$,
    $j${"god": "yes", "solo": "yes", "sub_account": "yes", "agency": "resell", "enterprise": "yes+resell"}$j$::jsonb, $s$platform$s$,
    'system', 'active', 0
  ),
  (
    $s$pipeline_review$s$, $s$Pipeline Review & Stale-Deal Detection$s$, $s$Reads the deal pipeline to surface stage movement and flag stalled deals — those stuck in a stage too long or missing a next step. Analysis only; nothing is saved or sent.$s$,
    $s$sales_growth$s$,
    ARRAY[$s$review my pipeline$s$, $s$which deals are stuck$s$, $s$check my deal pipeline$s$]::text[],
    $j$[{"id": "load_pipeline", "tool": "context", "desc": "Read open deals across every stage via crm_search_contacts — stage, value, owner, last-activity date, and next-step field."}, {"id": "analyze_movement", "tool": "anthropic", "desc": "Analyze stage movement, flag deals stuck beyond their expected stage duration, and surface deals missing a defined next step. Returns the review summary only — saves and sends nothing."}]$j$::jsonb,
    ARRAY[$s$context$s$, $s$anthropic$s$]::text[],
    $s$read_only$s$, $s$auto$s$,
    $s$Read deals by stage and elapsed time to detect stage movement, stalls beyond expected stage duration, and deals missing a defined next step, returning a review with no writes.$s$,
    $j${"god": "yes", "solo": "yes", "sub_account": "yes", "agency": "resell", "enterprise": "yes+resell"}$j$::jsonb, $s$platform$s$,
    'system', 'active', 0
  ),
  (
    $s$revenue_forecast$s$, $s$Weighted Revenue Forecast$s$, $s$Computes a weighted revenue projection from the pipeline — stage close-probability times deal value — and surfaces it alongside every assumption used. Analysis only; nothing is saved or sent.$s$,
    $s$sales_growth$s$,
    ARRAY[$s$what's my projected revenue$s$, $s$forecast my pipeline$s$, $s$weighted revenue projection$s$]::text[],
    $j$[{"id": "load_open_deals", "tool": "context", "desc": "Read open deals via crm_search_contacts with their value, stage, and expected close date."}, {"id": "compute_forecast", "tool": "anthropic", "desc": "Weight each deal's value by its stage's close probability, sum to an expected-revenue projection (by period where dates allow), and present it with every assumption — the probability used per stage and any deals excluded. Returns the projection only — saves and sends nothing."}]$j$::jsonb,
    ARRAY[$s$context$s$, $s$anthropic$s$]::text[],
    $s$read_only$s$, $s$auto$s$,
    $s$Weight each open deal's value by its stage's close probability to project expected revenue by period, and present the projection with every assumption made explicit.$s$,
    $j${"god": "yes", "solo": "yes", "sub_account": "yes", "agency": "resell", "enterprise": "yes+resell"}$j$::jsonb, $s$platform$s$,
    'system', 'active', 0
  ),
  (
    $s$competitive_battlecard$s$, $s$Competitive Battlecard$s$, $s$Drafts a side-by-side comparison of the tenant's offer against a named competitor — strengths, gaps, positioning angles, and objection responses — in the tenant's voice for review.$s$,
    $s$sales_growth$s$,
    ARRAY[$s$make a battlecard against a competitor$s$, $s$how do we stack up vs them$s$, $s$help me win against this competitor$s$]::text[],
    $j$[{"id": "gather_offer", "tool": "context", "desc": "Gather the tenant's own offer, positioning, pricing, and brand voice from tenant/brand context so the comparison reflects the tenant's real offer, not a generic one."}, {"id": "mine_differentiators", "tool": "rag", "desc": "Search the tenant's knowledge base for documented differentiators, win/loss reasons, and prior competitive notes so the card builds on what the business already knows."}, {"id": "research_rival", "tool": "firecrawl", "desc": "Optionally pull fresh public facts on the named competitor (their site, pricing, positioning) to ground the comparison in current reality; skip when no fresh research is requested."}, {"id": "draft_card", "tool": "anthropic", "desc": "Draft the battlecard — strengths, gaps, positioning angles, and plain-language objection responses — in the tenant's voice, returned as a draft for the owner to review before use."}]$j$::jsonb,
    ARRAY[$s$context$s$, $s$rag$s$, $s$firecrawl$s$, $s$anthropic$s$]::text[],
    $s$draft$s$, $s$confirm$s$,
    $s$Structured competitive comparison: establish the tenant's own offer, gather documented differentiators, research the named rival, then synthesize a side-by-side card with positioning and objection responses.$s$,
    $j${"god": "yes", "solo": "yes", "sub_account": "yes", "agency": "resell", "enterprise": "yes+resell"}$j$::jsonb, $s$platform$s$,
    'system', 'active', 0
  ),
  (
    $s$discovery_call_prep$s$, $s$Discovery Call Prep$s$, $s$Drafts a pre-call brief for a discovery call — account and prospect research, the questions to ask, and the goal of the call — returned for review before the call.$s$,
    $s$sales_growth$s$,
    ARRAY[$s$prep me for my call with this prospect$s$, $s$get me ready for this discovery call$s$, $s$brief me before this sales call$s$]::text[],
    $j$[{"id": "pull_record", "tool": "context", "desc": "Pull the prospect and account record via the crm_search_contacts seam — role, company, prior touchpoints, deal stage — so the brief is grounded in what's already known."}, {"id": "enrich_research", "tool": "firecrawl", "desc": "Research the prospect and their company from public sources (referencing the apollo-search-people enrichment seam) to surface recent news, priorities, and likely needs."}, {"id": "draft_brief", "tool": "anthropic", "desc": "Draft the pre-call brief — the call's goal, the questions to ask, and the situation and needs to probe — returned as a draft for the owner to review before the call."}]$j$::jsonb,
    ARRAY[$s$context$s$, $s$firecrawl$s$, $s$anthropic$s$]::text[],
    $s$draft$s$, $s$confirm$s$,
    $s$Pre-call preparation: assemble known CRM context, enrich with fresh account and prospect research, then structure the call's objective and the sequence of questions that uncover need.$s$,
    $j${"god": "yes", "solo": "yes", "sub_account": "yes", "agency": "resell", "enterprise": "yes+resell"}$j$::jsonb, $s$platform$s$,
    'system', 'active', 0
  ),
  (
    $s$discovery_call_summary$s$, $s$Discovery Call Summary$s$, $s$From call notes or a transcript, drafts the post-call summary — what was learned, the prospect's situation and needs, and concrete next steps with owners — returned for review.$s$,
    $s$sales_growth$s$,
    ARRAY[$s$summarize my discovery call$s$, $s$write up the notes from that call$s$, $s$recap this sales call$s$]::text[],
    $j$[{"id": "read_notes", "tool": "context", "desc": "Read the supplied call notes or transcript alongside the prospect's CRM record (via the crm_search_contacts seam) so the summary is tied to the right deal and prior context."}, {"id": "draft_summary", "tool": "anthropic", "desc": "Draft the post-call summary — what was learned, the prospect's situation and needs, and the concrete next steps with owners — returned as a draft for the owner to review and act on."}]$j$::jsonb,
    ARRAY[$s$context$s$, $s$anthropic$s$]::text[],
    $s$draft$s$, $s$confirm$s$,
    $s$Post-call synthesis: read the raw notes or transcript against the deal record, then distill the learnings, the prospect's situation and needs, and the next steps with clear owners.$s$,
    $j${"god": "yes", "solo": "yes", "sub_account": "yes", "agency": "resell", "enterprise": "yes+resell"}$j$::jsonb, $s$platform$s$,
    'system', 'active', 0
  ),
  (
    $s$objection_handling_guide$s$, $s$Objection Handling Guide$s$, $s$Drafts a guide for responding to common price, timing, and authority objections for the tenant's offer, in the tenant's voice, using plain-words mechanics — returned for review.$s$,
    $s$sales_growth$s$,
    ARRAY[$s$help me handle price objections$s$, $s$what do I say when they push back$s$, $s$build me an objection guide$s$]::text[],
    $j$[{"id": "gather_offer", "tool": "context", "desc": "Gather the tenant's offer, price points, delivery timeline, and brand voice so the responses fit the real offer and sound like the tenant."}, {"id": "mine_objections", "tool": "rag", "desc": "Search the tenant's knowledge base for objections already encountered and the responses that have worked, so the guide builds on real experience rather than generic scripts."}, {"id": "draft_guide", "tool": "anthropic", "desc": "Draft the objection-handling guide — plain-words responses to common price, timing, and authority objections in the tenant's voice — returned as a draft for the owner to review."}]$j$::jsonb,
    ARRAY[$s$context$s$, $s$rag$s$, $s$anthropic$s$]::text[],
    $s$draft$s$, $s$confirm$s$,
    $s$Objection response framework: ground in the tenant's offer and voice, mine documented past objections, then draft plain-language responses for price, timing, and authority concerns.$s$,
    $j${"god": "yes", "solo": "yes", "sub_account": "yes", "agency": "resell", "enterprise": "yes+resell"}$j$::jsonb, $s$platform$s$,
    'system', 'active', 0
  )
on conflict (slug) do nothing;
