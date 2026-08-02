-- ============================================================================
-- Blueprints Slice 2 — Business Coaching Blueprint (business_coach v1.0.0).
--
-- WHAT THIS DOES (two idempotent legs):
--   1. marketplace_item_detail(_slug) — a read RPC that projects a listed item's
--      current-version install_manifest into a pre-install preview (persona greeting,
--      probing, journey labels, skills, KB titles) for the MarketplaceDetailDialog
--      foldout. Platform catalog content only; no tenant data.
--   2. Publishes business_coach v1.0.0 with the composed config-only manifest, which
--      flips the tile from "Coming soon" to installable (current_version_id set).
--
-- NOTE (§18 reconciliation): the tenant-aware read seam get_tenant_journey_stages is
-- defined ONCE, in the write-model migration 20260802160000 (which runs AFTER this and
-- owns the richer signature: slug/label/description/display_order/color_hex/is_tenant/
-- stage_id_global). It is intentionally NOT redefined here — two CREATE OR REPLACE with
-- different RETURNS TABLE signatures would error ("cannot change return type"). This
-- migration does not reference it; paige-mcp calls it at runtime after both are live.
--
-- §2: zero finance/credit/funding/lending vocabulary anywhere in the manifest → is_finance
--     stays false, the publish finance-warning stays NULL. Funding exclusion at runtime is
--     enforced by paige-ai-chat's default STAY-IN-LANE branch (no funding_enabled flag).
-- §9: is_finance=false, default_for_new_tenants=false (opt-in preset, never seeded).
-- §12: reverses cleanly via the existing _marketplace_teardown_install — playbook restored
--     to prior (never delete-to-null), only these 2 skill slugs removed (never clear-to-[]),
--     journey rows deleted by source_install_id.
--
-- Idempotent: CREATE OR REPLACE for the RPC; the publish is guarded by a
-- NOT EXISTS(version) check so a fresh-DB reset re-run is a no-op.
-- ============================================================================

BEGIN;

-- ── Leg 1: pre-install preview RPC for the MarketplaceDetailDialog foldout ───
CREATE OR REPLACE FUNCTION public.marketplace_item_detail(_slug text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _item public.marketplace_items%ROWTYPE;
  _man  jsonb;
  _pb   jsonb;
  _persona jsonb;
BEGIN
  SELECT * INTO _item FROM public.marketplace_items WHERE slug = _slug;
  IF NOT FOUND THEN RETURN NULL; END IF;
  -- Only listed (publicly browsable) items, or anything for the platform owner.
  IF NOT (_item.status = 'listed' OR public.is_platform_owner()) THEN RETURN NULL; END IF;
  IF _item.current_version_id IS NULL THEN
    RETURN jsonb_build_object('slug', _item.slug, 'name', _item.name, 'has_version', false);
  END IF;

  SELECT install_manifest INTO _man
    FROM public.marketplace_item_versions WHERE id = _item.current_version_id;

  SELECT fn->'config' INTO _pb
    FROM jsonb_array_elements(COALESCE(_man->'functions','[]'::jsonb)) fn
   WHERE fn->>'kind' = 'playbook_preset'
   LIMIT 1;
  _persona := COALESCE(_pb->'persona','{}'::jsonb);

  RETURN jsonb_build_object(
    'slug', _item.slug,
    'name', _item.name,
    'has_version', true,
    'version', (SELECT semver FROM public.marketplace_item_versions WHERE id = _item.current_version_id),
    'persona', jsonb_build_object(
      'greeting', _persona->>'greeting',
      'role',     _persona->>'role',
      'domain',   _persona->>'domain',
      'tone',     _persona->>'tone'
    ),
    'values', COALESCE(_pb->'values','[]'::jsonb),
    'probing', (
      SELECT COALESCE(jsonb_agg(q->>'ask'),'[]'::jsonb)
        FROM jsonb_array_elements(COALESCE(_pb->'probingQuestions','[]'::jsonb)) q
    ),
    'journey_stages', (
      SELECT COALESCE(
               jsonb_agg(jsonb_build_object('label', s->>'label',
                                            'display_order', (s->>'display_order')::int)
                         ORDER BY (s->>'display_order')::int),
               '[]'::jsonb)
        FROM jsonb_array_elements(COALESCE(_man->'functions','[]'::jsonb)) fn,
             jsonb_array_elements(fn->'stages') s
       WHERE fn->>'kind' = 'journey_stages'
    ),
    'skills', (
      SELECT COALESCE(jsonb_agg(fn->>'slug'),'[]'::jsonb)
        FROM jsonb_array_elements(COALESCE(_man->'functions','[]'::jsonb)) fn
       WHERE fn->>'kind' = 'skill_flag'
    ),
    'kb_docs', (
      SELECT COALESCE(jsonb_agg(d->>'title'),'[]'::jsonb)
        FROM jsonb_array_elements(COALESCE(_man->'kb_pack'->'docs','[]'::jsonb)) d
    )
  );
END
$function$;
REVOKE ALL ON FUNCTION public.marketplace_item_detail(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.marketplace_item_detail(text) TO authenticated, service_role;

-- ── Leg 2: publish business_coach v1.0.0 (guarded idempotent) ───────────────
-- The publish RPC is gated by _marketplace_operator_authorized() = is_platform_owner()
-- OR _marketplace_is_service_role(). A migration runs as `postgres` (both false), so we
-- set request.jwt.claims = service_role transaction-locally to clear the gate — the RPC
-- then runs its full validation (kind allowlist, semver check, finance guard) + writes the
-- §17 audit row. auth.uid() is NULL here → created_by NULL / audit actor_role='service_role'.
--
-- FRESH-DB-RESET NOTE (§32, satisfied): the live prod marketplace_publish_version allowlist
-- already includes 'playbook_preset' + 'journey_stages', so the real deploy-migrations push
-- succeeds. A from-scratch repo replay would otherwise run an OLDER repo definition whose
-- allowlist predates that expansion — so 20260802145000_reconcile_marketplace_publish_allowlist
-- (ordered before this migration) restores prod's current definition and makes a cold reset
-- green. That reconcile body was diffed against prod's live pg_get_functiondef and is
-- byte-identical (only the allowlist differs from the stale July definition); it is a no-op on
-- the live prod apply.
DO $do$
DECLARE
  _item_id uuid;
BEGIN
  SELECT id INTO _item_id FROM public.marketplace_items WHERE slug = 'business_coach';
  IF _item_id IS NULL THEN
    RAISE EXCEPTION 'business_coach marketplace_items row is missing — the Slice-1 seed (20260725152540) must precede this migration';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.marketplace_item_versions
     WHERE item_id = _item_id AND semver = '1.0.0'
  ) THEN
    PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
    PERFORM public.marketplace_publish_version(
      'business_coach',
      '1.0.0',
      'config_only',
      $manifest$
{
  "functions": [
    {
      "kind": "playbook_preset",
      "config": {
        "slug": "business_coach",
        "domain": "coaching",
        "persona": {
          "name": "Paige",
          "role": "your team's assistant",
          "tone": "warm, direct, and confident — a mogul-founder register, never fluffy",
          "domain": "coaching",
          "greeting": "Hi — I'm Paige. I work alongside your team to keep you moving between sessions: your next steps, your check-ins, and anything you need answered in between. What are you working on today?"
        },
        "probingQuestions": [
          { "ask": "What's the main outcome you're working toward right now?", "captures": "primary_goal" },
          { "ask": "How do you like to work together — how often we meet, how long, and in what format?", "captures": "engagement_shape" },
          { "ask": "Between our sessions, what keeps you accountable and moving?", "captures": "accountability_style" },
          { "ask": "What's the single biggest thing standing in your way?", "captures": "primary_obstacle" },
          { "ask": "Ninety days from now, what would make you say this was absolutely worth it?", "captures": "ninety_day_win" },
          { "ask": "Realistically, how much time each week can you put toward this?", "captures": "weekly_time_commitment" },
          { "ask": "When we reach renewal, what result do you want to point to as the proof?", "captures": "renewal_outcome" }
        ],
        "journey": [
          { "key": "business_coaching_lead", "label": "Lead", "description": "A new prospect has entered the practice's world but hasn't spoken with the team yet." },
          { "key": "business_coaching_discovery_call", "label": "Discovery Call", "description": "A fit conversation is booked or held to understand the prospect's goal and whether the practice can help." },
          { "key": "business_coaching_proposal_sent", "label": "Proposal Sent", "description": "The engagement scope and terms have been sent; the prospect is deciding." },
          { "key": "business_coaching_signed", "label": "Signed", "description": "The prospect has agreed and become a client; the engagement is confirmed." },
          { "key": "business_coaching_onboarding", "label": "Onboarding", "description": "The new client is being set up — intake, goals, expectations, and first-session scheduling." },
          { "key": "business_coaching_active_engagement", "label": "Active Engagement", "description": "Sessions are running on cadence and the client is working the plan between them." },
          { "key": "business_coaching_milestone_review", "label": "Milestone Review", "description": "A checkpoint to measure progress against the goals set at the start and adjust the plan." },
          { "key": "business_coaching_renewal_discussion", "label": "Renewal Discussion", "description": "The engagement is nearing its term and the conversation about continuing is underway." },
          { "key": "business_coaching_renewed_completed", "label": "Renewed / Completed", "description": "The client has renewed for another term or completed the engagement with the outcome delivered." }
        ],
        "values": [
          "Keep every client moving between sessions.",
          "Speak the practitioner's own business language, never tool-speak.",
          "Probe for the specifics before proposing a next step.",
          "Report only what actually happened — never a hoped-for result.",
          "Always the coach's voice, under the coach's brand."
        ],
        "refusal_boundaries": [
          "Don't give licensed medical, legal, tax, or money-management advice — route those to a qualified professional.",
          "Stay inside this practice's stated coaching scope; if a client asks about something this practice doesn't offer, help where you genuinely can or hand them to the team.",
          "Never fabricate progress, a sent message, or a booking that didn't happen.",
          "Never make a binding commitment on the client's or coach's behalf without explicit approval.",
          "Keep every client's and every practice's information strictly separate."
        ]
      }
    },
    {
      "kind": "journey_stages",
      "stages": [
        { "slug": "business_coaching_lead", "label": "Lead", "description": "A new prospect has entered the practice's world but hasn't spoken with the team yet.", "display_order": 1, "color_hex": "#94a3b8" },
        { "slug": "business_coaching_discovery_call", "label": "Discovery Call", "description": "A fit conversation is booked or held to understand the prospect's goal and whether the practice can help.", "display_order": 2, "color_hex": "#818cf8" },
        { "slug": "business_coaching_proposal_sent", "label": "Proposal Sent", "description": "The engagement scope and terms have been sent; the prospect is deciding.", "display_order": 3, "color_hex": "#6366f1" },
        { "slug": "business_coaching_signed", "label": "Signed", "description": "The prospect has agreed and become a client; the engagement is confirmed.", "display_order": 4, "color_hex": "#4f46e5" },
        { "slug": "business_coaching_onboarding", "label": "Onboarding", "description": "The new client is being set up — intake, goals, expectations, and first-session scheduling.", "display_order": 5, "color_hex": "#7c3aed" },
        { "slug": "business_coaching_active_engagement", "label": "Active Engagement", "description": "Sessions are running on cadence and the client is working the plan between them.", "display_order": 6, "color_hex": "#2563eb" },
        { "slug": "business_coaching_milestone_review", "label": "Milestone Review", "description": "A checkpoint to measure progress against the goals set at the start and adjust the plan.", "display_order": 7, "color_hex": "#0891b2" },
        { "slug": "business_coaching_renewal_discussion", "label": "Renewal Discussion", "description": "The engagement is nearing its term and the conversation about continuing is underway.", "display_order": 8, "color_hex": "#d97706" },
        { "slug": "business_coaching_renewed_completed", "label": "Renewed / Completed", "description": "The client has renewed for another term or completed the engagement with the outcome delivered.", "display_order": 9, "color_hex": "#16a34a" }
      ]
    },
    { "kind": "skill_flag", "slug": "draft_and_email_document" },
    { "kind": "skill_flag", "slug": "research_to_concept_brief" }
  ],
  "kb_pack": {
    "docs": [
      {
        "title": "Client Onboarding Framework",
        "category": "onboarding",
        "tags": ["onboarding", "framework"],
        "content": "The first two weeks decide the whole engagement. A client who feels organized, clear on what happens next, and already moving will stay, refer, and renew; a client who feels dropped after signing quietly disengages. Onboarding is not paperwork — it is the moment you convert a buyer into a committed participant.\n\nRun onboarding as a short, guided sequence rather than a single overwhelming call. Start with a welcome that restates the outcome the client bought and the plan to get there, so the goal they said yes to is the first thing they see again. Collect only what you actually need to begin — the current situation, the target, the constraints, and how they prefer to work — and gather it through a simple intake the client can complete in one sitting, not a scavenger hunt across email.\n\nSet the rhythm explicitly. Confirm how often you will meet, how long sessions run, how the client reaches you between them, and what you expect them to do before the next session. Ambiguity here is the number-one cause of early drop-off. Close onboarding by scheduling the first working session and naming one small action the client can complete this week — an early, visible win builds the momentum the rest of the engagement runs on."
      },
      {
        "title": "How to Structure a High-Impact Session",
        "category": "sessions",
        "tags": ["sessions", "delivery"],
        "content": "A high-impact session has a spine: reconnect, review, focus, plan. Open by reconnecting to the client's goal and their state today — one honest question about how the week actually went surfaces more than any status form. Then review what they committed to last time. Reviewing commitments every single session, without exception, is what makes the accountability real; skip it once and the client learns the commitments were optional.\n\nSpend the core of the session on one thing, not ten. The temptation is to cover everything; the discipline is to go deep on the single obstacle or decision that will move the client most between now and the next session. Ask before you advise — the client usually knows more about their own situation than a fast prescription assumes, and a question that helps them reason gets more durable action than an instruction they merely accept.\n\nClose every session the same way: a specific, written commitment for what the client will do before you meet again, with a date and a definition of done. End on their own words about what they're taking away — when the client articulates the next step, they own it, and ownership is what turns a good conversation into a completed one."
      },
      {
        "title": "Tracking Goals & Milestones",
        "category": "outcomes",
        "tags": ["goals", "milestones", "tracking"],
        "content": "You cannot coach what you don't measure, and clients cannot feel progress they can't see. Set the destination goal at the start of the engagement in the client's own terms — the outcome they will point to and call it worth it — then break it into milestones that are close enough to reach in weeks, not months. A goal 90 days out is motivating; a milestone this week is actionable.\n\nWrite milestones so that 'done' is unambiguous. 'Improve marketing' is not a milestone; 'publish the new offer page and send it to the existing list' is. Each milestone should have an owner, a target date, and a plain description of what finishing looks like, so neither you nor the client has to argue later about whether it happened.\n\nReview progress on a fixed cadence and make it visible. At each milestone review, compare where the client is against where the plan said they'd be, name what worked, and adjust the next stretch honestly — a plan that never changes was never really tracking reality. Momentum compounds when the client can look back and see a line of finished milestones behind them; that visible trail is often the single strongest reason a client renews."
      },
      {
        "title": "Accountability Between Sessions",
        "category": "accountability",
        "tags": ["accountability", "retention"],
        "content": "Most of the client's real progress happens in the days between sessions, not during them — which means the space between sessions is where engagements are won or lost. Accountability is not nagging; it is a structure that makes the committed action the easy, expected thing to do, and its absence obvious.\n\nAnchor accountability to the specific commitment made at the end of the last session, not a vague 'keep going.' A short, well-timed check-in — a message that references the exact action, sent when the client said they'd be doing it — does more than a long weekly summary. The tone matters: you are a teammate holding the line with them, not a supervisor collecting homework. Celebrate the completed action as much as you flag the missed one.\n\nMatch the accountability to the client. Some people want a nudge; some want a standing check-in; some want to report in only when they're stuck. Ask how they best stay on track and build the structure around that answer. When a commitment slips, treat it as information, not failure — surface it early, understand what got in the way, and adjust the next commitment so it's realistic. A structure that quietly notices and responds is what keeps a client moving all the way to their outcome."
      },
      {
        "title": "The Renewal Conversation",
        "category": "renewal",
        "tags": ["renewal", "retention"],
        "content": "Renewal is not a pitch at the end — it is the natural result of an engagement where the client saw real progress and knows exactly what's next. The renewal conversation is won across the whole engagement, in every session that reviewed a commitment and every milestone the client actually reached. If those were real, the conversation is easy; if they weren't, no closing technique will save it.\n\nStart the conversation before the term ends, not after. Bring the trail of finished milestones and the goal the client named at the start, and let the progress speak first — remind them where they were, show them where they are, and connect it to the outcome they bought. Then make the next chapter concrete: what the client could achieve in another term, and the specific plan to get there. People renew for a future they can see, built on a past they can feel.\n\nBe honest about fit. If the client has reached what they came for, say so and offer the right next step even when that step is completion rather than continuation — the trust that creates is what drives referrals and future returns. Where continuing genuinely serves the client, ask for the renewal directly and without apology; you have earned it, and a clear ask respects the relationship more than a soft hint does."
      }
    ]
  }
}
      $manifest$::jsonb,
      'Business Coaching Blueprint v1.0.0 — tenant-authored coaching persona (domain=coaching), a 9-stage client journey (Lead -> Renewed/Completed), the two read-gated skills (draft_and_email_document, research_to_concept_brief), and a 5-doc onboarding/session/goals/accountability/renewal knowledge pack. Zero finance/credit/funding, opt-in preset (default_for_new_tenants=false).'
    );
    -- Clear the local claims override so no later statement inherits it (also auto-resets at COMMIT).
    PERFORM set_config('request.jwt.claims', '', true);
  END IF;
END
$do$;

COMMIT;
