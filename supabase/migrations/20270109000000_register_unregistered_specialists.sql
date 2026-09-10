-- =============================================================================
-- Stage 2 harmonization — register the REAL specialists that exist as deployed
-- edge functions but have NO registry rows (owner debt finding 2026-09-11:
-- "make it all work harmonically together").
--
-- Why this matters: paige-orchestrator's tool_search/tool_invoke are REGISTRY-
-- DRIVEN — an unregistered function is invisible and uncallable. The chat's
-- auto-delegation instruction points at slug='problem-reverse-engineer', whose
-- function is deployed but resolves to nothing (0 registry rows at survey).
-- Same for paige-deep-research (#165/#166 cited research engine).
--
-- Parenting per the roster: root-cause decomposition = MENTOR (Operations);
-- cited multi-hop research = ZION (Strategy & Vision, competitive intelligence).
-- Idempotent seeds — re-running never overwrites an owner/tenant edit.
-- =============================================================================

insert into public.paige_subagents
  (slug, name, department, domain, description, runtime, edge_function, enabled,
   display_order, rail_display_name, role, goal, backstory, triggers, parent_subagent_slug)
values
  ('problem-reverse-engineer','Problem Reverse-Engineer','owner_ops','operations',
   'Decomposes a stated problem into root causes and concrete next actions. Picks a framework (5-Whys / Fishbone / MECE) from the problem signal and returns a structured root-cause map.',
   'local','paige-problem-reverse-engineer', true,
   110,'Problem Reverse-Engineer',
   'Root-cause specialist',
   'Every "why isn''t this working" gets a real cause, not a guess.',
   'The desk that takes a messy problem statement and hands back a structured map: causes, evidence, and the next action. Powers the chat''s auto-delegation for blocker-type asks.',
   '{}','mentor'),
  ('deep-research','Deep Research','owner_ops','strategy_vision',
   'Universal cited multi-hop research engine (PLAN → SEARCH → READ → GAP-CHECK → one synthesis), with a deterministic anti-fabrication gate: every finding carries a citation that resolves to a real source, or it returns honestly empty.',
   'local','paige-deep-research', true,
   111,'Deep Research',
   'Cited research specialist',
   'Answers needing the open web arrive with sources — never invented.',
   'The research desk behind competitive briefs and due-diligence asks: bounded loop, one synthesis, anti-fabrication gate. Empty findings with an honest note beat a fabricated fact (§13).',
   '{}','zion')
on conflict (slug) do nothing;
