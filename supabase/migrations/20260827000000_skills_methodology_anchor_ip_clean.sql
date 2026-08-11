-- Skills — IP-clean methodology_anchor rewrite (owner ruling 2026-08-11).
--
-- Business-strategy MECHANICS are fair game; a PERSON'S NAME and their BRANDED FRAMEWORK TITLE are
-- intellectual property. The S1a backfill (#466) seeded 3 of the 4 shipped skills' methodology_anchor
-- in "Person Name — Branded Framework" form. This rewrites them to MECHANIC-DESCRIPTIVE text — faithful
-- to the proven framework's mechanics, with no name and no branded title. The anchor feeds the
-- interpreter's prompt-forge chain (buildForgeIntent → forge), so the mechanic wording must still
-- produce a coherent expert plan; the rewrites preserve the exact operating steps of each framework.
--
-- verify_business_sos is left unchanged — "KYB standard — Secretary-of-State public-records
-- verification" is already mechanic/industry-generic (no person, no branded title).
--
-- The GOAT registry that maps a mechanic back to WHICH proven framework it models is an INTERNAL
-- crew reference (scratchpad, uncommitted, never tenant-facing) — a name never enters a paige_skills row.

update public.paige_skills
set methodology_anchor = 'Structured goal-coaching sequence — clarify the goal, assess the current reality, surface the options, then commit to a concrete next action.'
where slug = 'build_game_plan';

update public.paige_skills
set methodology_anchor = 'Persuasion-principle framing — reciprocity, commitment and consistency, social proof, authority, liking, and scarcity applied to client communication.'
where slug = 'draft_and_email_document';

update public.paige_skills
set methodology_anchor = 'Answer-first, top-down brief structure — lead with the conclusion, then group mutually-exclusive, collectively-exhaustive (MECE) supporting points in logical order.'
where slug = 'research_to_concept_brief';
