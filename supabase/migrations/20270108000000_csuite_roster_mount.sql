-- =============================================================================
-- Stage 2 kickoff — the C-Suite roster mount (docs/doctrine/paige-c-suite-roster.md,
-- owner directive 2026-09-10/11 "mount the named roster first").
--
-- Per the roster's 2026-09-08 owner correction and the "How each VP shows up in code"
-- rule: presentation identities ride the EXISTING paige_subagents/department registry
-- homes — no new agent registry, no new callable seam, no new authority owner. A VP
-- remains callable only through the consistent §10/Spine seam; nothing here grants
-- authority, changes routing, or alters the two-department action bus.
--
-- PAIGE is NOT seeded: she is the primary orchestrator identity (the chat front door),
-- not a delegate in her own registry. The six VPs are.
--
-- Departments per the roster's clusters (audience rule): VPs that work for the
-- business owner mount to owner_ops; CURA — who works for each client — mounts to
-- client_experience. The review-* adversarial crew lands under VERA (Trust &
-- Verification) with ZION/MENTOR taking the strategic/technical reviewers.
-- Specialist→VP parenting is data (reversible), not doctrine: the roster owns scopes;
-- this mapping encodes them.
-- =============================================================================

-- The "sub-specialist forged UNDER a VP" edge (§14 / roster "VP.SubAgent" addressing).
-- Nullable: platform specialists without a VP stay unparented; the column is the one
-- evolution of the existing home, never a second registry.
alter table public.paige_subagents
  add column if not exists parent_subagent_slug text
    references public.paige_subagents(slug) on delete set null;
create index if not exists idx_paige_subagents_parent
  on public.paige_subagents(parent_subagent_slug)
  where parent_subagent_slug is not null;

-- The six VPs (display_order 1-6 sit above every specialist). Idempotent seeds:
-- re-running never overwrites an owner/tenant edit to these rows.
insert into public.paige_subagents
  (slug, name, department, domain, description, runtime, enabled, display_order,
   rail_display_name, role, goal, backstory, triggers)
values
  ('vera','VERA','owner_ops','trust_verification',
   'VP Trust & Verification. All verifications: identity (KYC), consent, document extraction accuracy, integrity boundaries, regulatory (A2P/TCR), payment status, OTP/2FA, signature status. Precise by voice.',
   'soft', true, 1, 'VERA',
   'VP Trust & Verification',
   'Nothing ships unverified — every trust boundary is checked before work executes.',
   'VERA runs the practice''s trust perimeter: identity, consent, documents, and integrity gates. Tenants meet her first at signup; her word is the difference between a claim and a fact.',
   '{}'),
  ('nexus','NEXUS','owner_ops','growth',
   'VP Growth. Content strategy and creation, campaigns, sales sequences, pipeline management, lead scoring, brand voice enforcement, competitive positioning. Energetic, market-aware.',
   'soft', true, 2, 'NEXUS',
   'VP Growth',
   'Grow the tenant''s book — every campaign, sequence, and pipeline motion compounds.',
   'NEXUS owns the growth engine end to end: what the market hears, which leads move, and why deals close. Approved sequences run autonomously; new drafts wait for the owner.',
   '{}'),
  ('cura','CURA','client_experience','client_success',
   'VP Client Success. Client onboarding, retention, community, at-risk detection, churn prevention, the client portal and client-facing Paige. Warm by voice, relentless about the client''s outcome.',
   'soft', true, 3, 'CURA',
   'VP Client Success',
   'Every client feels cared for and reaches their outcome — nobody drifts.',
   'CURA runs the client side of the house: onboarding, nurture, at-risk detection, and the portal experience. Lifecycle nudges run on their own; retention-critical outreach asks first.',
   '{}'),
  ('mentor','MENTOR','owner_ops','operations',
   'VP Operations. Workflows (n8n + native), integrations, infrastructure health, ops-side Systems Check, Vibe Studio agent config, deploy health. Technical and brief.',
   'soft', true, 4, 'MENTOR',
   'VP Operations',
   'The tenant''s systems run themselves — health is the default, not the project.',
   'MENTOR operates the machinery: automations, integrations, and the operational spine. Infrastructure health acts on its own; configuration changes ask first.',
   '{}'),
  ('merit','MERIT','owner_ops','finance_people',
   'VP Finance & People. Money spine (L1-L4), revenue tracking, dunning, refunds, hiring and comp, contracts and IP, Business Vault obligations, entity-type adherence. Stewarding, careful.',
   'soft', true, 5, 'MERIT',
   'VP Finance & People',
   'Money and obligations are never a surprise — tracked, stewarded, and flagged early.',
   'MERIT stewards the tenant''s money and team: retainers, dunning, contracts, and the obligations vault. Money decisions confirm; tracking and reminders run on their own.',
   '{}'),
  ('zion','ZION','owner_ops','strategy_vision',
   'VP Strategy & Vision. Revenue-stage awareness, business-twin scenario modeling, owner analytics with interpretation, strategic Playbook orchestration, long-term positioning. Elevated, directional.',
   'soft', true, 6, 'ZION',
   'VP Strategy & Vision',
   'The tenant always knows what stage they are in and what the next right move is.',
   'ZION holds the altitude: where the business is on the roadmap, what the numbers mean, and which play fires next. Strategy recommends; it never acts alone.',
   '{}')
on conflict (slug) do nothing;

-- Parent the existing specialists under their VP and complete department assignment
-- for the unassigned. Data mapping of roster scopes — reversible, no behavior change.
update public.paige_subagents set
  parent_subagent_slug = case slug
    when 'pipeline-scout'          then 'nexus'
    when 'followup-drafter'        then 'nexus'
    when 'campaign-writer'         then 'nexus'
    when 'design-studio'           then 'nexus'
    when 'retention-sentinel'      then 'cura'
    when 'onboarding-concierge'    then 'cura'
    when 'discovery-interviewer'   then 'cura'
    when 'answer-companion'        then 'cura'
    when 'nurture-companion'       then 'cura'
    when 'email-composer'          then 'cura'
    when 'retainer-steward'        then 'merit'
    when 'daily-brief-anchor'      then 'mentor'
    when 'scheduling-coordinator'  then 'mentor'
    when 'research-scout'          then 'zion'
    when 'review-verifier'             then 'vera'
    when 'review-compliance-officer'   then 'vera'
    when 'review-doctrine-sentinel'    then 'vera'
    when 'review-readback-verifier'    then 'vera'
    when 'review-foundation-checker'   then 'vera'
    when 'review-devils-advocate'      then 'vera'
    when 'review-designer'             then 'mentor'
    when 'review-benchmarker'          then 'zion'
    when 'review-marketplace-analyst'  then 'zion'
    when 'review-alt-direction-proposer' then 'zion'
    else parent_subagent_slug
  end,
  department = coalesce(department, case
    when slug in ('research-scout','design-studio','scheduling-coordinator','email-composer')
      then 'owner_ops'
    when slug like 'review-%'
      then 'owner_ops'
    else department
  end)
where enabled = true;

-- Specialists sit below the VPs in every ordered surface.
update public.paige_subagents set display_order = 100 + display_order
  where slug not in ('vera','nexus','cura','mentor','merit','zion')
    and parent_subagent_slug is not null
    and display_order < 100;
