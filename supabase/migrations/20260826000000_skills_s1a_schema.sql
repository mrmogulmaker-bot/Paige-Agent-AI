-- Skills Wave S1a — extend paige_skills for the methodology-anchored, tier-gated,
-- autonomy-governed skills engine (owner kickoff 2026-08-11). This is the SCHEMA
-- FOUNDATION only: the switch(slug) skill-runner does NOT read these columns yet, so
-- runtime behavior is byte-identical (§58 protected by construction). The S1b
-- steps-interpreter (deferred to a fresh session per the §5 saturation call) reads them.
--
-- §18 EXTEND (not fork) the existing paige_skills registry (mig 20260630013855).
-- §16 Fork-1 finding: `autonomy_lane` is NOT a shared Postgres enum — the action-bus
--   spine (mig 20260711140000) enforces ('auto','confirm','off') via a duplicated
--   text+CHECK on paige_action_kinds.default_autonomy_lane + paige_actions.autonomy_lane.
--   There is no CREATE TYPE to reuse, so we replicate the same text+CHECK triple here
--   (faithful to the spine; "reuse the enum" was a wrong premise — see §10 correction).
-- §61 Fork-3: `tier_availability` is a per-skill jsonb doc of the §61 Standing Tier
--   Distribution Default. The platform-wide self-use gate lives in tierFeatures.ts
--   (`skills` Feature = god/solo/sub/enterprise); agency's "resell" is a Marketplace
--   concept, NOT a tier Set bit — this column records the intended distribution per skill.

ALTER TABLE public.paige_skills
  ADD COLUMN IF NOT EXISTS methodology_anchor text,
  ADD COLUMN IF NOT EXISTS tier_availability jsonb NOT NULL
    DEFAULT '{"god":"yes","solo":"yes","sub_account":"yes","agency":"resell","enterprise":"yes+resell"}'::jsonb,
  ADD COLUMN IF NOT EXISTS scoping text
    CHECK (scoping IS NULL OR scoping IN ('platform','tenant')),
  ADD COLUMN IF NOT EXISTS autonomy_lane text NOT NULL DEFAULT 'confirm'
    CHECK (autonomy_lane IN ('auto','confirm','off'));

COMMENT ON COLUMN public.paige_skills.methodology_anchor IS
  'S1 (§35): the GOAT/methodology this skill is anchored to — no vibes-based skills. Coaching-generic, §2/§50-clean.';
COMMENT ON COLUMN public.paige_skills.tier_availability IS
  'S1 (§61): per-skill Standing Tier Distribution Default doc {god,solo,sub_account,agency,enterprise} with values yes|resell|yes+resell|no. The platform self-use gate is tierFeatures.ts `skills`; agency resell is a Marketplace concept.';
COMMENT ON COLUMN public.paige_skills.scoping IS
  'S1 (§9/§57): platform-authored (Super Admin default) vs tenant-authored (per-tenant). Existing 4 defaults are platform.';
COMMENT ON COLUMN public.paige_skills.autonomy_lane IS
  'S1 (§16): resolved via paige_resolve_autonomy at run time. Same ("auto","confirm","off") vocab as the action-bus spine (text+CHECK; no shared enum exists to reuse).';

-- Backfill the 4 shipped platform-default skills (§13 — real slugs verified on prod).
UPDATE public.paige_skills SET
  scoping = 'platform',
  methodology_anchor = CASE slug
    WHEN 'build_game_plan'          THEN 'GROW coaching model (John Whitmore) — Goal, Reality, Options, Will'
    WHEN 'draft_and_email_document' THEN 'Robert Cialdini — Influence: The Psychology of Persuasion'
    WHEN 'research_to_concept_brief' THEN 'Barbara Minto — The Pyramid Principle (MECE structured briefs)'
    WHEN 'verify_business_sos'      THEN 'KYB standard — Secretary-of-State public-records verification'
    ELSE methodology_anchor
  END,
  autonomy_lane = CASE risk_level
    WHEN 'read_only'     THEN 'auto'     -- safe reads run autonomously
    WHEN 'draft'         THEN 'confirm'  -- drafts surface for review
    WHEN 'mutating'      THEN 'confirm'
    WHEN 'external_send' THEN 'confirm'  -- external sends always human-approved
    ELSE autonomy_lane
  END
WHERE slug IN ('build_game_plan','draft_and_email_document','research_to_concept_brief','verify_business_sos');
