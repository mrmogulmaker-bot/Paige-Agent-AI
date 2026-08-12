-- Housekeeping (owner ruling 2026-08-11): lock paige_skills.category to the 12 canonical §15 categories.
--
-- WHY: the 4 pre-S2 shipped skills used ad-hoc category values (verification/research/strategy) that don't
-- match §15's canonical 12-category taxonomy, and skill-forge previously wrote a free-text LLM category
-- (defaulting to "general"). This (a) recategorizes the 3 mis-labeled rows and (b) adds a CHECK constraint
-- so future seeding/forging can never drift to an ad-hoc value. Side benefit: the S2 dashboard reads the
-- category column deterministically instead of a slug-keyword heuristic.
--
-- §37 PRODUCER INVENTORY (the guard changes the write contract of paige_skills.category):
--   • skill-forge edge fn — the ONLY non-canonical producer; fixed in the SAME PR to clamp the LLM's
--     category to a canonical value via canonicalCategory() (was `draft.category ?? "general"`). Without
--     that clamp this CHECK would reject every forge whose LLM category isn't one of the 12 — the exact
--     "half-hardened is worse than un-hardened" failure §37 exists to prevent.
--   • seed migrations (Cat 1 vision_strategy, Cat 2 documents, this file) — canonical by construction.
--   • No src/ UI producer, no other edge fn, no trigger writes category. Inventory complete.
--
-- ORDERING: recategorize the 3 rows FIRST, THEN add the CHECK (a CHECK added while a row violated it would
-- abort the migration). All other existing rows (Cat 1 vision_strategy, draft_and_email_document=documents,
-- and — on a fresh replay where this applies after Cat 2's 20260829 — Cat 2 documents) are already canonical.
--
-- §32.a rollback-proof GREEN on prod (aborted/rolled back): constraint_exists=1 recat_bad=0
--   bad_value_rejected=true. Persisted-apply confirmed post-merge via deploy-migrations pipeline (§47).

-- (a) recategorize the 3 pre-S2 skills to canonical §15 values (§18 one-taxonomy; these are bespoke skills,
--     so category is display/grouping metadata only — no interpreter/needsFormat behavior keys on them).
update public.paige_skills set category = 'compliance_legal' where slug = 'verify_business_sos'      and category = 'verification';
update public.paige_skills set category = 'vision_strategy'  where slug = 'research_to_concept_brief' and category = 'research';
update public.paige_skills set category = 'client_delivery'  where slug = 'build_game_plan'          and category = 'strategy';

-- (b) lock the taxonomy: category must be one of the 12 canonical §15 values (NULL still allowed — a
--     category-less legacy/forged row is not the drift this guards; the forge now always sets one).
alter table public.paige_skills
  drop constraint if exists paige_skills_category_canonical_chk;
alter table public.paige_skills
  add constraint paige_skills_category_canonical_chk
  check (category is null or category in (
    'vision_strategy', 'client_delivery', 'sales_growth', 'marketing_content', 'documents',
    'analytics_interpretation', 'team_management', 'financial_ops', 'compliance_legal',
    'operations_process', 'agent_orchestration', 'superpowers'
  ));
