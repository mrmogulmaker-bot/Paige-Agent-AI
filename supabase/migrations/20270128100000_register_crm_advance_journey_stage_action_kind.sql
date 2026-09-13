-- Layer C · C2 — register the native journey-advance action kind on the action bus (SPINE #1).
--
-- WHY (owner-reviewed 2026-09-13): C2's native auto-execute vertical routes on an act's `action_kind`,
-- and `paige_automation_acts.action_kind` is FK-bound to `paige_action_kinds(slug)`. Until this row
-- exists, an act naming `crm.advance_journey_stage` CANNOT be inserted (FK 23503) and one stored as a
-- bare tool_key routes to `unsupported` — so the vertical is DARK in production. Two independent reviews
-- (§39 adversarial + §5 compliance) caught exactly this: a green unit suite masking an unreachable
-- capability. This registration is what makes the built engine path actually reachable.
--
-- It EXTENDS the existing action bus, it does NOT fork it (§18). `crm.advance_journey_stage` is a
-- PLATFORM default (tenant_id NULL), coaching-generic (§2 — advancing a client through their journey is
-- generic to every client-based business; no finance/credit vertical).
--
-- EXECUTOR = 'record_only' (HONEST, §13): advancing a journey stage via `set_journey_stage` is a pure
-- IN-TENANT CRM state write — it records a stage transition, with NO external send (no email/SMS/client
-- surface) and no spend. That is exactly what `record_only` means (cf. the shipped `client.at_risk`,
-- `owner.task`, `owner.daily_brief_item`, all record_only). `action-risk.ts` independently classifies
-- `crm_advance_journey_stage` as `ordinary` (auto-eligible). The schema's `chk_auto_lane_safe`
-- (`default_autonomy_lane <> 'auto' OR executor IN ('record_only','workflow')`) therefore permits the
-- `auto` default here — the owner directive is a native AUTO-execute vertical, and `record_only` is the
-- honest executor that makes that representable at the schema level.
--
-- The `auto` default is a FLOOR, not standing authority: `resolve_automation_autonomy` takes
-- min(process grant, this floor, Trust-Compass ceiling), and the §00 execution-time Spine re-resolves
-- authority/consent/verification on every run. `requires_approval=false` keeps the floor at `auto`
-- (a `true` here would floor the act to `confirm`).
--
-- The slug is DOTTED (`crm.advance_journey_stage`) per the action-kind convention (client.at_risk,
-- owner.task, …); it equals the capability-status manifest key. The underscore identifier
-- `crm_advance_journey_stage` remains the tool/risk/receipt key (resolve_tool_autonomy, action-risk,
-- record_capability_run) — the same dotted-kind ↔ underscore-tool seam every other capability carries.

INSERT INTO public.paige_action_kinds
  (slug, label, description, default_from_department, default_to_department, executor, requires_approval, approval_type, draft_subagent_slug, default_autonomy_lane, default_priority)
VALUES
  ('crm.advance_journey_stage',
   'Advance a client''s journey stage',
   'Move a client to a new stage in their journey and record the transition (an in-tenant CRM state write, no external send).',
   'client_experience', 'owner_ops',
   'record_only', false, 'other', NULL, 'auto', 'normal')
ON CONFLICT (slug) DO NOTHING;
