-- ============================================================================
-- Blueprints Slice 3 — the SUBSTRATE-HONESTY publish (#164 P0).
--
-- Proves the Blueprint framework carries BOTH a vertical AND a horizontal from
-- DATA ALONE, through the EXISTING marketplace_publish_version seam — the exact
-- template the business_coach Blueprint (20260802150000) established. Zero new
-- install kinds, zero framework code: every Blueprint below is config-only data.
--
--   • Consulting (horizontal)  — consulting v1.0.0. FIRST publish (the seed row
--     existed as "Coming soon"). businessConsultant preset, is_finance=false.
--   • Agency (horizontal)      — agency v1.0.0.     FIRST publish. marketingAgency
--     preset, is_finance=false.
--   • Funding (vertical)       — funding v1.1.0.    EXTENDS the existing funding
--     item (§18: extend the ONE funding home, don't fork a sibling — the item is
--     already is_finance=true, category=verticals, 0 installs so non-destructive).
--     fundingCoach preset. refusal_boundaries DECLARE credit/capital IN-scope; the
--     manifest also sets feature_flag finance_in_scope=true so the #184 generic
--     signal (20260805130000) lights up through DATA on install.
--
-- §2: consulting/agency manifests are credit-clean (is_finance=false, no finance
--     vocabulary → publish finance-warning stays NULL). Funding NAMES credit/capital
--     — allowed because funding is is_finance=true (the guard only warns when finance
--     vocab appears on a NON-is_finance public item) AND it is an OPT-IN preset
--     (default_for_new_tenants=false), never a platform default.
-- §18: publishes into the THREE existing seed rows via the existing operator seam —
--     no new items, no parallel Blueprint system, no new install kind.
-- §12/§9: all opt-in (default_for_new_tenants stays false), reversible via the
--     existing _marketplace_teardown_install (playbook restored, skill/flag/journey
--     removed by install provenance).
--
-- FLAGGED FRAMEWORK GAP (deferred to P2, NOT stubbed here, §13): _marketplace_install_node
--     applies playbook_preset/journey_stages/skill_flag/feature_flag/persona_overlay and
--     hardcodes seeded_refs.portal_surface_slugs='[]'. The funding Blueprint's funding-
--     specific portal routes travel ONLY as playbook_config.portal.modules DATA; there is
--     NO portal_surface install kind that renders them. Carrying the data + flagging the
--     gap is the honest move (§13) — it is not silently stubbed.
--
-- Idempotent: each publish is guarded by NOT EXISTS(version); a fresh-DB replay is a no-op.
-- The service_role claim override clears the operator-authorized publish gate for a
-- migration run (runs as postgres); it auto-resets at COMMIT and is cleared explicitly.
-- ============================================================================

BEGIN;

DO $do$
DECLARE
  _consulting_id uuid;
  _agency_id     uuid;
  _funding_id    uuid;
BEGIN
  SELECT id INTO _consulting_id FROM public.marketplace_items WHERE slug = 'consulting';
  SELECT id INTO _agency_id     FROM public.marketplace_items WHERE slug = 'agency';
  SELECT id INTO _funding_id    FROM public.marketplace_items WHERE slug = 'funding';
  IF _consulting_id IS NULL OR _agency_id IS NULL OR _funding_id IS NULL THEN
    RAISE EXCEPTION 'Blueprints Slice 1 seed rows (consulting/agency/funding) must precede this migration';
  END IF;

  -- Clear the operator-authorized publish gate for this migration transaction.
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);

  -- ── HORIZONTAL 1: Consulting Blueprint (consulting v1.0.0) ─────────────────
  IF NOT EXISTS (SELECT 1 FROM public.marketplace_item_versions
                  WHERE item_id = _consulting_id AND semver = '1.0.0') THEN
    PERFORM public.marketplace_publish_version(
      'consulting', '1.0.0', 'config_only',
      $manifest$
{
  "functions": [
    {
      "kind": "playbook_preset",
      "config": {
        "slug": "consultant",
        "domain": "business consulting",
        "persona": {
          "name": "Paige",
          "role": "your consultant's engagement assistant",
          "tone": "sharp, professional, proactive",
          "domain": "business consulting",
          "greeting": "Hi — I'm Paige, working alongside your consultant to keep the engagement moving. What do you need to make progress on today?"
        },
        "probingQuestions": [
          { "ask": "What's the core outcome this engagement needs to deliver?", "captures": "objective" },
          { "ask": "Who are the key stakeholders and decision-makers involved?", "captures": "stakeholders" },
          { "ask": "What's the biggest thing currently blocking progress?", "captures": "blockers" },
          { "ask": "How will we know this worked — what does success look like in numbers?", "captures": "success_metrics" }
        ],
        "journey": [
          { "key": "consulting_discovery", "label": "Discovery", "description": "Scope, stakeholders, and objectives established." },
          { "key": "consulting_engagement", "label": "Engagement", "description": "Active delivery of the work is underway." },
          { "key": "consulting_delivery", "label": "Delivery", "description": "Outputs and recommendations delivered to the client." },
          { "key": "consulting_review", "label": "Review", "description": "Results reviewed against the goals set at the start." },
          { "key": "consulting_retainer", "label": "Retainer", "description": "Ongoing advisory relationship continues." }
        ],
        "values": [
          "Move the engagement forward every single touchpoint.",
          "Speak the client's business language, never tool-speak.",
          "Surface blockers early — a flagged risk beats a missed deadline.",
          "Report only what actually happened, never a hoped-for result.",
          "Always the consultant's voice, under the consultant's brand."
        ],
        "refusal_boundaries": [
          "Don't give licensed legal, tax, or accounting advice — route those to a qualified professional.",
          "Stay inside this engagement's agreed scope; if the client asks for work beyond it, flag a change order to the team rather than absorbing it silently.",
          "Never commit the consultant to a deliverable, deadline, or price without explicit approval.",
          "Never fabricate a result, a delivered output, or a meeting that didn't happen.",
          "Keep every client's and every engagement's information strictly separate."
        ]
      }
    },
    {
      "kind": "journey_stages",
      "stages": [
        { "slug": "consulting_discovery", "label": "Discovery", "description": "Scope, stakeholders, and objectives established.", "display_order": 1, "color_hex": "#818cf8" },
        { "slug": "consulting_engagement", "label": "Engagement", "description": "Active delivery of the work is underway.", "display_order": 2, "color_hex": "#6366f1" },
        { "slug": "consulting_delivery", "label": "Delivery", "description": "Outputs and recommendations delivered to the client.", "display_order": 3, "color_hex": "#4f46e5" },
        { "slug": "consulting_review", "label": "Review", "description": "Results reviewed against the goals set at the start.", "display_order": 4, "color_hex": "#2563eb" },
        { "slug": "consulting_retainer", "label": "Retainer", "description": "Ongoing advisory relationship continues.", "display_order": 5, "color_hex": "#16a34a" }
      ]
    }
  ]
}
      $manifest$::jsonb,
      'Consulting Blueprint v1.0.0 — a horizontal, tenant-authored consulting persona (domain=business consulting), a 5-stage engagement journey (Discovery -> Retainer), and generic credit-clean refusal_boundaries. Config-only, is_finance=false, opt-in (default_for_new_tenants=false). Proves the framework carries a HORIZONTAL from data alone.'
    );
  END IF;

  -- ── HORIZONTAL 2: Agency Blueprint (agency v1.0.0) ────────────────────────
  IF NOT EXISTS (SELECT 1 FROM public.marketplace_item_versions
                  WHERE item_id = _agency_id AND semver = '1.0.0') THEN
    PERFORM public.marketplace_publish_version(
      'agency', '1.0.0', 'config_only',
      $manifest$
{
  "functions": [
    {
      "kind": "playbook_preset",
      "config": {
        "slug": "agency",
        "domain": "marketing agency",
        "persona": {
          "name": "Paige",
          "role": "your account assistant",
          "tone": "creative, responsive, on-it",
          "domain": "marketing agency",
          "greeting": "Hey — I'm Paige, your account assistant. I keep your campaigns, assets, and approvals moving. What can I get rolling for you?"
        },
        "probingQuestions": [
          { "ask": "What's the main result you want these campaigns to drive?", "captures": "campaign_goal" },
          { "ask": "Which channels matter most to you right now?", "captures": "channels" },
          { "ask": "What monthly budget are we working with?", "captures": "budget" },
          { "ask": "What brand assets and access do you already have ready for us?", "captures": "assets" }
        ],
        "journey": [
          { "key": "agency_onboarding", "label": "Onboarding", "description": "Access, brand, and goals gathered." },
          { "key": "agency_strategy", "label": "Strategy", "description": "Plan and channels defined." },
          { "key": "agency_launch", "label": "Launch", "description": "Campaigns are live." },
          { "key": "agency_optimize", "label": "Optimize", "description": "Testing and iteration underway." },
          { "key": "agency_report", "label": "Report", "description": "Results reported and the relationship renewed." }
        ],
        "values": [
          "Keep every campaign, asset, and approval moving.",
          "Speak the client's marketing language, never tool-speak.",
          "Flag scope creep as a change order, never absorb it silently.",
          "Report only what actually happened, never a hoped-for result.",
          "Always the agency's voice, under the agency's brand."
        ],
        "refusal_boundaries": [
          "Don't give licensed legal, tax, or accounting advice — route those to a qualified professional.",
          "Stay inside the retainer's agreed scope of work; new requests beyond it get flagged as a change order, not quietly absorbed.",
          "Never approve, launch, or spend budget on the client's behalf without explicit sign-off.",
          "Never fabricate a campaign result, a published asset, or an approval that didn't happen.",
          "Keep every client's brand assets, access, and data strictly separate."
        ]
      }
    },
    {
      "kind": "journey_stages",
      "stages": [
        { "slug": "agency_onboarding", "label": "Onboarding", "description": "Access, brand, and goals gathered.", "display_order": 1, "color_hex": "#818cf8" },
        { "slug": "agency_strategy", "label": "Strategy", "description": "Plan and channels defined.", "display_order": 2, "color_hex": "#6366f1" },
        { "slug": "agency_launch", "label": "Launch", "description": "Campaigns are live.", "display_order": 3, "color_hex": "#4f46e5" },
        { "slug": "agency_optimize", "label": "Optimize", "description": "Testing and iteration underway.", "display_order": 4, "color_hex": "#2563eb" },
        { "slug": "agency_report", "label": "Report", "description": "Results reported and the relationship renewed.", "display_order": 5, "color_hex": "#16a34a" }
      ]
    }
  ]
}
      $manifest$::jsonb,
      'Agency Blueprint v1.0.0 — a horizontal, tenant-authored agency persona (domain=marketing agency), a 5-stage campaign journey (Onboarding -> Report), and generic credit-clean refusal_boundaries. Config-only, is_finance=false, opt-in. Proves the framework carries a second HORIZONTAL from data alone.'
    );
  END IF;

  -- ── VERTICAL: Funding Coach Blueprint (funding v1.1.0) ─────────────────────
  -- EXTENDS the existing is_finance=true funding item (§18 one home). refusal_boundaries
  -- DECLARE credit/capital IN-scope (this is what the #184 data-driven persona guard reads
  -- to put finance in scope). skill_flag:funding enables the raw funding capability;
  -- feature_flag finance_in_scope=true lights up the generic #184 signal on install.
  IF NOT EXISTS (SELECT 1 FROM public.marketplace_item_versions
                  WHERE item_id = _funding_id AND semver = '1.1.0') THEN
    PERFORM public.marketplace_publish_version(
      'funding', '1.1.0', 'config_only',
      $manifest$
{
  "functions": [
    {
      "kind": "playbook_preset",
      "config": {
        "slug": "funding",
        "domain": "funding and capital-raising coaching",
        "persona": {
          "name": "Paige",
          "role": "your funding coach's strategist",
          "tone": "sharp, strategic, encouraging",
          "domain": "funding and capital-raising coaching",
          "greeting": "Hi — I'm Paige, working with your coach to get you funding-ready and moving toward the capital you're after. Where do you want to start?"
        },
        "probingQuestions": [
          { "ask": "What are you raising capital for, and roughly how much are you targeting?", "captures": "funding_objective" },
          { "ask": "What timeline are you working toward for the capital?", "captures": "timeline" },
          { "ask": "Where do you feel your business and personal profile stand today?", "captures": "readiness" },
          { "ask": "Are you leaning toward lenders, investors, or a mix?", "captures": "capital_path" }
        ],
        "journey": [
          { "key": "funding_assessment", "label": "Assessment", "description": "Goals, profile, and funding readiness reviewed." },
          { "key": "funding_foundation", "label": "Foundation", "description": "Business credit and fundability strengthened." },
          { "key": "funding_strategy", "label": "Strategy", "description": "Capital plan and target sources set." },
          { "key": "funding_outreach", "label": "Outreach", "description": "Applications and investor conversations underway." },
          { "key": "funding_funded", "label": "Funded", "description": "Capital secured and next moves planned." }
        ],
        "values": [
          "Get every client genuinely funding-ready before they apply.",
          "Speak the client's capital-strategy language plainly, never tool-speak.",
          "Probe the real profile before proposing a funding move.",
          "Report only what actually happened — never a hoped-for approval.",
          "Always the coach's voice, under the coach's brand."
        ],
        "refusal_boundaries": [
          "Credit, business credit, funding, lenders, and capital strategy ARE in scope for this practice — raise them when they genuinely help the client get funding-ready.",
          "You are not a licensed attorney, accountant, or investment advisor — for regulated legal, tax, or securities advice, route the client to a qualified professional.",
          "Never guarantee lender approval, a specific credit-score increase, or a funding amount — outcomes depend on the lender and the client's own profile.",
          "Dispute and credit-repair execution is handled by a separate specialist — refer that work out, don't perform it here.",
          "Never fabricate a submitted application, a lender conversation, or funding secured that didn't happen.",
          "Keep every client's credit and financial information strictly private and separate."
        ],
        "portal": {
          "modules": [
            { "key": "home", "label": "Home" },
            { "key": "funding-journey", "label": "Funding Journey" },
            { "key": "credit", "label": "Credit" },
            { "key": "funding", "label": "Funding" },
            { "key": "financial-profile", "label": "Financial Profile" },
            { "key": "business", "label": "Business" },
            { "key": "agreements", "label": "Agreements" }
          ]
        }
      }
    },
    {
      "kind": "journey_stages",
      "stages": [
        { "slug": "funding_assessment", "label": "Assessment", "description": "Goals, profile, and funding readiness reviewed.", "display_order": 1, "color_hex": "#818cf8" },
        { "slug": "funding_foundation", "label": "Foundation", "description": "Business credit and fundability strengthened.", "display_order": 2, "color_hex": "#6366f1" },
        { "slug": "funding_strategy", "label": "Strategy", "description": "Capital plan and target sources set.", "display_order": 3, "color_hex": "#4f46e5" },
        { "slug": "funding_outreach", "label": "Outreach", "description": "Applications and investor conversations underway.", "display_order": 4, "color_hex": "#2563eb" },
        { "slug": "funding_funded", "label": "Funded", "description": "Capital secured and next moves planned.", "display_order": 5, "color_hex": "#16a34a" }
      ]
    },
    { "kind": "skill_flag", "slug": "funding" },
    { "kind": "feature_flag", "key": "finance_in_scope", "value": true }
  ]
}
      $manifest$::jsonb,
      'Funding Coach Blueprint v1.1.0 — EXTENDS the existing is_finance funding item (§18 one home) into a full vertical Blueprint: tenant-authored funding persona (domain=funding and capital-raising coaching), a 5-stage funding journey (Assessment -> Funded), refusal_boundaries that DECLARE credit/capital in-scope, the raw funding skill_flag, and feature_flag finance_in_scope=true (the #184 generic signal). Opt-in (default_for_new_tenants=false), is_finance=true — NEVER a platform default (§2). Proves the framework carries a VERTICAL from data alone.'
    );
  END IF;

  -- Clear the local claims override (also auto-resets at COMMIT).
  PERFORM set_config('request.jwt.claims', '', true);
END
$do$;

COMMIT;
