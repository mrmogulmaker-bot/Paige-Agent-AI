-- Task #126 Slice 3b (Deliverable 4) — Trust Compass mapping for the public-web browse capability.
--
-- ADDITIVE + NOT load-bearing (§18/§16): this row files "Paige browses a public web page" into the §16
-- department taxonomy (paige_action_kinds) so the capability has a department owner + a default autonomy
-- tier in the org model, exactly like tech.propose_automation. It mirrors the existing seed pattern
-- (20260720200830) — it does NOT alter the skill EXECUTION path: browse_public_url runs through the
-- skill-interpreter's §16 clamp (lane 'auto' + risk 'read_only' → execute), and this action-kind row is
-- the OPTIONAL org-model surfacing, not a gate the run consults. Removing it would not change how the
-- skill runs; adding it keeps the Trust Compass complete (§12 — organize what you create).
--
-- Mapping rationale (per the C-Suite roster, docs/doctrine/paige-c-suite-roster.md): driving a headless
-- browser is a Technology/Automation department capability, so default_to_department='technology_automation'.
-- A read-only page read mutates nothing and sends nothing, so requires_approval=false and the default
-- autonomy lane is 'auto' — matching the browse_public_url skill's own lane and the §16 read_only floor.
-- §2 clean (coaching-generic; zero finance wording). §50 trademark-clean. ON CONFLICT (slug) DO NOTHING —
-- idempotent, re-run-safe, additive-only.

INSERT INTO public.paige_action_kinds
 (slug,label,description,default_from_department,default_to_department,executor,requires_approval,approval_type,draft_subagent_slug,default_autonomy_lane,default_priority) VALUES
 ('tech.browse_public', 'Browse a public web page', 'Technology/Automation reads a public web page on request and reports what is on it (read-only).', 'owner_ops', 'technology_automation', 'record_only', false, 'other', NULL, 'auto', 'low')
ON CONFLICT (slug) DO NOTHING;
