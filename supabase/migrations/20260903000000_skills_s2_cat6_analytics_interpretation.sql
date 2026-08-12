-- S2 wave · Category 6 (Analytics Interpretation) — seed 9 platform baseline skills into paige_skills.
--
-- Run through the generic S1b interpreter (default dispatch) — NO bespoke handler. category =
-- 'analytics_interpretation' (canonical §15, locked by the CHECK in 20260830000000). IP-CLEAN per §14/§62.
-- tier_availability = §61 default; scoping = 'platform'. §2 FINANCE-CLEAN verified (0 hits).
--
-- §13 DATA-HONESTY (the key gate for Analytics): these skills READ the metric data the context/metric layer
-- ALREADY exposes and INTERPRET/narrate it — they do NOT compute new metrics from raw events, run SQL, or
-- query a warehouse, and they return an explicit 'not available' where data is absent rather than fabricating
-- a number. 7 are read_only+auto (interpret + surface, persist nothing); the 2 REPORT skills that produce a
-- written document a human reviews (monthly_qbr_draft, quarterly_narrative) are DRAFTERS (draft+confirm, may
-- pdf_render). NONE send/mutate.
--
-- §18 EXCLUSIONS (wrap-don't-duplicate): sales pipeline stale-deal detection is Cat 4 pipeline_review;
-- per-client journey status is Cat 3 milestone_tracking — neither re-seeded here. revenue_trend_read is the
-- HISTORICAL direction read, distinct from Cat 4 revenue_forecast (forward projection).
--
-- SOURCING LINEAGE (attribution here in the reference ONLY, never in a row, per §14): Anthropic Skills
-- registry structure + standard business-analytics reading mechanics (trend read, engagement read, funnel
-- drop-off diagnosis, cohort retention/expansion, churn-signal surfacing, ad-efficiency read, weekly/QBR/
-- quarterly synthesis) — mechanics only, IP-clean.
--
-- §1 crew: 2 distillation engineers + adversarial IP/§16/§18/§2/§13 verifier. Verdict FIX_NEEDED because the
--   verifier CAUGHT + FIXED one §13 honesty overclaim (ad_spend_efficiency originally implied COMPUTING
--   ROAS/CPL from raw inputs → tightened to read the exposed metrics + honest 'not available' fallback); the
--   corrected set this migration ships is honesty-clean (ip/finance/risk-tool = 0; integrator re-verified).
-- ON CONFLICT (slug) DO NOTHING makes this idempotent + safe to re-run.

insert into public.paige_skills (
  slug, name, description, category, trigger_phrases, steps, allowed_tools,
  risk_level, autonomy_lane, methodology_anchor, tier_availability, scoping,
  created_by, status, require_admin_confirm_first_n
) values
  (
    $s$revenue_trend_read$s$, $s$Revenue Trend Read$s$, $s$Reads the revenue metrics already available (MRR/ARR/cash-flow over the recorded periods) and narrates which direction they're moving and what's driving the change — a historical read, not a forward projection.$s$,
    $s$analytics_interpretation$s$,
    ARRAY[$s$how's our revenue trending$s$, $s$read my MRR direction$s$, $s$what's driving the revenue change$s$]::text[],
    $j$[{"id": "read_revenue", "tool": "context", "desc": "Read the available revenue metric series (MRR/ARR/cash-flow by period) from the context seam; if a period's figure isn't present, treat it as not available rather than inferring one."}, {"id": "read_prior_baseline", "tool": "client_memory", "desc": "Read any prior revenue-trend read stored for this business so the narrative can note what changed since last time; skip cleanly if none exists."}, {"id": "narrate_direction", "tool": "anthropic", "desc": "Interpret the read figures into a plain-language finding: the direction (rising/flat/declining), the size of the move, and the most likely contributor visible in the data — never a fabricated number, and explicitly note where data was missing."}]$j$::jsonb,
    ARRAY[$s$context$s$, $s$client_memory$s$, $s$anthropic$s$]::text[],
    $s$read_only$s$, $s$auto$s$,
    $s$Interpret the recorded revenue series to state its historical direction and the visible driver of the change; report honestly on any period without data. Historical direction only — projection is out of scope.$s$,
    $j${"god": "yes", "solo": "yes", "sub_account": "yes", "agency": "resell", "enterprise": "yes+resell"}$j$::jsonb, $s$platform$s$,
    'system', 'active', 0
  ),
  (
    $s$engagement_read$s$, $s$Engagement Read$s$, $s$Reads the engagement metrics already available (email open/click rates, content performance, social/audience growth) and surfaces what's working and what's gone flat.$s$,
    $s$analytics_interpretation$s$,
    ARRAY[$s$how's my audience engagement$s$, $s$what content is working$s$, $s$read my email and social numbers$s$]::text[],
    $j$[{"id": "read_engagement", "tool": "context", "desc": "Read the available engagement metrics (email open/click, content/post performance, follower or list growth) from the context seam; mark any channel with no data present as not available."}, {"id": "surface_signal", "tool": "anthropic", "desc": "Interpret the read metrics to name what's performing well and what's flat or declining by channel, grounded only in the figures present — no invented rates and no channel guessed at when its data is missing."}]$j$::jsonb,
    ARRAY[$s$context$s$, $s$anthropic$s$]::text[],
    $s$read_only$s$, $s$auto$s$,
    $s$Interpret the available engagement metrics across channels to separate what's working from what's flat, keying every statement to a figure that is actually present.$s$,
    $j${"god": "yes", "solo": "yes", "sub_account": "yes", "agency": "resell", "enterprise": "yes+resell"}$j$::jsonb, $s$platform$s$,
    'system', 'active', 0
  ),
  (
    $s$conversion_funnel_diagnosis$s$, $s$Conversion Funnel Diagnosis$s$, $s$Reads the funnel-stage data already available and diagnoses where prospects drop off and the most likely reason for the drop.$s$,
    $s$analytics_interpretation$s$,
    ARRAY[$s$where am I losing prospects$s$, $s$diagnose my funnel$s$, $s$which stage is leaking$s$]::text[],
    $j$[{"id": "read_funnel", "tool": "context", "desc": "Read the available stage-by-stage funnel counts/conversion rates from the context seam; if a stage's data isn't present, say so rather than estimating it."}, {"id": "read_patterns", "tool": "rag", "desc": "Retrieve relevant funnel-diagnosis patterns and common drop-off causes for client-based service businesses to frame the interpretation."}, {"id": "diagnose_dropoff", "tool": "anthropic", "desc": "Interpret the read stage data against the retrieved patterns to name the weakest stage and the likely why, phrased as a grounded hypothesis tied to the figures — never a computed conversion the data doesn't support."}]$j$::jsonb,
    ARRAY[$s$context$s$, $s$rag$s$, $s$anthropic$s$]::text[],
    $s$read_only$s$, $s$auto$s$,
    $s$Interpret the available funnel-stage data to locate the largest drop and hypothesize its cause from known service-business patterns, flagging any stage without data.$s$,
    $j${"god": "yes", "solo": "yes", "sub_account": "yes", "agency": "resell", "enterprise": "yes+resell"}$j$::jsonb, $s$platform$s$,
    'system', 'active', 0
  ),
  (
    $s$cohort_analysis$s$, $s$Cohort Analysis Read$s$, $s$Reads the cohort data already available and describes how retention and expansion differ across acquisition periods.$s$,
    $s$analytics_interpretation$s$,
    ARRAY[$s$how do my cohorts retain$s$, $s$compare client groups by signup month$s$, $s$read my retention by cohort$s$]::text[],
    $j$[{"id": "read_cohorts", "tool": "context", "desc": "Read the available cohort tables (retention and expansion by acquisition period) from the context seam; treat any period lacking data as not available rather than filling it in."}, {"id": "read_prior_read", "tool": "client_memory", "desc": "Read any prior cohort read stored for this business so the description can note shifts across acquisition periods; skip cleanly if none exists."}, {"id": "describe_cohorts", "tool": "anthropic", "desc": "Interpret the read cohort data into a plain description of which acquisition periods retain and expand better or worse, grounded only in the figures present and honest about gaps."}]$j$::jsonb,
    ARRAY[$s$context$s$, $s$client_memory$s$, $s$anthropic$s$]::text[],
    $s$read_only$s$, $s$auto$s$,
    $s$Interpret the available cohort data to describe retention and expansion differences across acquisition periods, keying every comparison to present figures and naming missing periods.$s$,
    $j${"god": "yes", "solo": "yes", "sub_account": "yes", "agency": "resell", "enterprise": "yes+resell"}$j$::jsonb, $s$platform$s$,
    'system', 'active', 0
  ),
  (
    $s$churn_signal_detection$s$, $s$Churn Signal Detection$s$, $s$Reads the client-activity signals already available and surfaces clients at risk of leaving before they do, naming the specific signal behind each flag.$s$,
    $s$analytics_interpretation$s$,
    ARRAY[$s$who's at risk of leaving$s$, $s$flag my churn risks$s$, $s$which clients look like they're slipping$s$]::text[],
    $j$[{"id": "read_activity", "tool": "context", "desc": "Read the available per-client activity signals (declining logins/engagement, missed sessions, drop in usage, sentiment) from the context seam; for any client with no signal data, treat it as not available."}, {"id": "read_risk_patterns", "tool": "rag", "desc": "Retrieve known churn-warning patterns for client-based service businesses to frame which read signals matter most."}, {"id": "surface_at_risk", "tool": "anthropic", "desc": "Interpret the read signals against the retrieved patterns to list clients that look at-risk with the specific signal per client, grounded only in present activity data — no client flagged without an actual signal to cite."}]$j$::jsonb,
    ARRAY[$s$context$s$, $s$rag$s$, $s$anthropic$s$]::text[],
    $s$read_only$s$, $s$auto$s$,
    $s$Interpret the available client-activity signals to surface at-risk clients early, attaching the concrete signal to each flag and never flagging a client whose data is absent.$s$,
    $j${"god": "yes", "solo": "yes", "sub_account": "yes", "agency": "resell", "enterprise": "yes+resell"}$j$::jsonb, $s$platform$s$,
    'system', 'active', 0
  ),
  (
    $s$ad_spend_efficiency$s$, $s$Ad Spend Efficiency Read$s$, $s$Reads the available ad-spend and return metrics and interprets return-on-spend, cost-per-lead, and where budget is producing little return — saying so honestly when no ad data is connected.$s$,
    $s$analytics_interpretation$s$,
    ARRAY[$s$how are our ads doing$s$, $s$is our ad spend paying off$s$, $s$check our cost per lead$s$]::text[],
    $j$[{"id": "read_ad_data", "tool": "context", "desc": "Read the ad efficiency metrics the metric layer already exposes for the period — the return-on-spend and cost-per-lead figures if present, plus spend, leads, conversions, and attributed revenue by campaign/channel where available. If no ad data is connected or present, note that plainly rather than inferring numbers or computing metrics from raw events."}, {"id": "frame_benchmarks", "tool": "rag", "desc": "Retrieve reference guidance on what healthy return-on-spend and cost-per-lead ranges look like for client-based service businesses, to frame the read — do not fabricate targets."}, {"id": "interpret_efficiency", "tool": "anthropic", "desc": "Interpret the read figures against the reference ranges: where return-on-spend and cost-per-lead are provided, narrate them; where only spend and leads are present, note the plain ratio as an observation rather than a computed metric. Surface where spend is generating little return, in plain language, and return an explicit 'not available' for any figure the data does not support."}]$j$::jsonb,
    ARRAY[$s$context$s$, $s$rag$s$, $s$anthropic$s$]::text[],
    $s$read_only$s$, $s$auto$s$,
    $s$Read the ad-spend and return figures already available (preferring the exposed return-on-spend and cost-per-lead metrics), frame them against reference efficiency ranges, and interpret where budget is producing little return — never computing new metrics from raw events, always flagging missing data honestly.$s$,
    $j${"god": "yes", "solo": "yes", "sub_account": "yes", "agency": "resell", "enterprise": "yes+resell"}$j$::jsonb, $s$platform$s$,
    'system', 'active', 0
  ),
  (
    $s$weekly_business_review$s$, $s$Weekly Business Review$s$, $s$Synthesizes the week across the available business metrics into a 5-minute read — what moved and what needs attention — interpreting only what the data supports and persisting nothing.$s$,
    $s$analytics_interpretation$s$,
    ARRAY[$s$give me the weekly review$s$, $s$how did the business do this week$s$, $s$what moved this week$s$]::text[],
    $j$[{"id": "read_week", "tool": "context", "desc": "Read the week's available metrics across revenue trend, client engagement, funnel movement, and other surfaced business figures. Note any metric that isn't present rather than guessing it."}, {"id": "recall_prior_week", "tool": "client_memory", "desc": "Recall the prior week's figures already on record to establish direction (up, down, flat) for each metric that has a comparison point."}, {"id": "interpret_week", "tool": "anthropic", "desc": "Interpret the read into a concise 5-minute narrative of what moved and what needs attention this week; surface only what the data supports and label anything unavailable as 'not available'."}]$j$::jsonb,
    ARRAY[$s$context$s$, $s$client_memory$s$, $s$anthropic$s$]::text[],
    $s$read_only$s$, $s$auto$s$,
    $s$Read the week's available business metrics, compare each against the prior week already on record, and interpret what moved and what needs attention into a short read — synthesizing the available data, never querying or computing raw events, and persisting nothing.$s$,
    $j${"god": "yes", "solo": "yes", "sub_account": "yes", "agency": "resell", "enterprise": "yes+resell"}$j$::jsonb, $s$platform$s$,
    'system', 'active', 0
  ),
  (
    $s$monthly_qbr_draft$s$, $s$Monthly Business Review Draft$s$, $s$Drafts a monthly business-review document — what happened, what changed, and the next-30-days focus — from the available metrics, filed as a written deliverable for human approval.$s$,
    $s$analytics_interpretation$s$,
    ARRAY[$s$draft the monthly review$s$, $s$put together this month's business report$s$, $s$write up the monthly recap$s$]::text[],
    $j$[{"id": "read_month", "tool": "context", "desc": "Read the month's available metrics across revenue trend, engagement, funnel, cohorts, and retention. Record which figures are present and mark any that are not available."}, {"id": "recall_prior_month", "tool": "client_memory", "desc": "Recall the prior month's figures already on record to describe what changed month over month for each comparable metric."}, {"id": "draft_document", "tool": "anthropic", "desc": "Draft the business-review document in the tenant's voice — what happened, what changed, and the focus for the next 30 days — grounded only in the read data and stating 'not available' where a metric is missing."}, {"id": "render_document", "tool": "pdf_render", "desc": "Render the drafted document to a shareable file and file it for the human to review and circulate — no sending, no external mutation."}]$j$::jsonb,
    ARRAY[$s$context$s$, $s$client_memory$s$, $s$anthropic$s$, $s$pdf_render$s$]::text[],
    $s$draft$s$, $s$confirm$s$,
    $s$Read the month's available metrics, compare against the prior month on record, and draft a review document (what happened, what changed, next-30-days focus) rendered for human approval — interpreting available data only, never computing raw events, and filing rather than sending.$s$,
    $j${"god": "yes", "solo": "yes", "sub_account": "yes", "agency": "resell", "enterprise": "yes+resell"}$j$::jsonb, $s$platform$s$,
    'system', 'active', 0
  ),
  (
    $s$quarterly_narrative$s$, $s$Quarterly Narrative Draft$s$, $s$Drafts a quarter's story-level narrative synthesis — the arc behind the numbers, not just the numbers — from the available metrics, filed as a written deliverable for human approval.$s$,
    $s$analytics_interpretation$s$,
    ARRAY[$s$draft the quarterly narrative$s$, $s$tell the story of this quarter$s$, $s$write the quarterly synthesis$s$]::text[],
    $j$[{"id": "read_quarter", "tool": "context", "desc": "Read the quarter's available metrics across revenue trend, engagement, funnel, cohorts, and retention. Note which figures are present and mark any that are not available."}, {"id": "recall_prior_quarters", "tool": "client_memory", "desc": "Recall prior quarters' figures already on record to shape the arc — where the quarter continued, reversed, or broke from earlier trends."}, {"id": "draft_narrative", "tool": "anthropic", "desc": "Draft a story-level narrative in the tenant's voice that interprets what the quarter meant — the themes and turning points behind the figures — grounded only in the read data and stating 'not available' where a metric is missing."}, {"id": "render_narrative", "tool": "pdf_render", "desc": "Render the drafted narrative to a shareable file and file it for the human to review and circulate — no sending, no external mutation."}]$j$::jsonb,
    ARRAY[$s$context$s$, $s$client_memory$s$, $s$anthropic$s$, $s$pdf_render$s$]::text[],
    $s$draft$s$, $s$confirm$s$,
    $s$Read the quarter's available metrics, recall prior quarters on record for the arc, and draft a story-level narrative synthesis rendered for human approval — interpreting the available data into themes and turning points, never computing raw events, and filing rather than sending.$s$,
    $j${"god": "yes", "solo": "yes", "sub_account": "yes", "agency": "resell", "enterprise": "yes+resell"}$j$::jsonb, $s$platform$s$,
    'system', 'active', 0
  )
on conflict (slug) do nothing;
