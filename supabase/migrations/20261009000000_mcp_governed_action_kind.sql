-- The Action Bus kind for an approved external capability run.
--
-- WHY A NEW KIND AND NOT AN EXISTING ONE
--
-- Every registered kind today describes client communication or an internal task. Running
-- a capability on a connected provider is neither: it is Paige acting on an outside system
-- on the workspace's behalf. Filing it as `owner.task` would mislabel it in every place the
-- bus is read, and the registry exists precisely so a new kind of action can be declared
-- rather than squeezed into the nearest existing label.
--
-- WHY IT REQUIRES NO APPROVAL OF ITS OWN
--
-- The approval already happened. `zapier_run_action` is in the chat's MUTATING_TOOLS, so it
-- passes `resolve_tool_autonomy` and — at the `confirm` lane, which is the safe default —
-- returns `needs_confirm` and waits for the operator before it runs at all. This record is
-- filed AFTER that gate and after the call, so it is the provenance of something that has
-- already been authorised. Making it approvable again would put a second gate in front of a
-- decision the operator already made, and would leave a queue of approvals for actions that
-- have finished.
--
-- `record_only` + `requires_approval = false` is what the table's own
-- `chk_auto_lane_safe` permits at the `auto` lane, and it is the honest description: this
-- row records, it does not execute.
INSERT INTO public.paige_action_kinds
  (slug, label, description, default_from_department, default_to_department,
   executor, requires_approval, approval_type, draft_subagent_slug,
   default_autonomy_lane, default_priority)
VALUES
  ('owner.external_capability',
   'External action run',
   'An approved capability Paige ran on a connected provider, recorded after the fact.',
   'owner_ops', 'owner_ops',
   'record_only', false, 'other', NULL,
   'auto', 'normal')
ON CONFLICT (slug) DO NOTHING;
