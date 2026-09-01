-- S4 — everything the autonomy gate governs is settable by the tenant it governs.
--
-- THE GAP. `paige-ai-chat`'s `MUTATING_TOOLS` decides which tools need a human's approval.
-- `list_tool_autonomy` decides which of them a tenant can actually SEE and SET in Paige's autonomy
-- settings. The gate held 46 tools; the catalogue held 23. The other 23 were governed but
-- invisible: permanently `confirm`, with no way to turn them off and no way to turn them on. A
-- tenant who wanted Paige to stop asking about pipeline stages could do it; a tenant who wanted her
-- never to delete an n8n workflow could not, because that tool was not in the list.
--
-- HOW IT HAPPENED, which is the part worth writing down. Migration 20260716171236 added the Studio
-- tools and its header says it re-declares "everything else verbatim from 20260711200000". It did
-- not: the four n8n rows added in between by 20260711220000 were dropped. A "verbatim" rewrite that
-- silently loses rows is invisible in review — nothing fails, the list is simply shorter. The rest
-- of the gap accumulated the same way, one tool at a time added to the gate and not to the list.
--
-- `src/operator/surfaces/settings/capabilities.v3.test.tsx` MEASURES this gap and asserts its exact
-- size, so it has been visible and quantified for some time. This migration closes it, and that
-- test becomes the invariant it should always have been: nothing the gate governs is invisible.
--
-- §37 — `list_tool_autonomy`'s SIGNATURE, GUARD AND GRANTS ARE UNCHANGED. Only the catalogue rows
-- change, so every caller keeps working and simply sees more rows. `set_tool_autonomy` already
-- accepts any tool key, so no write path needs to change either; the keys below were previously
-- settable in principle and merely unlistable in practice.
--
-- §51 per tier: the function resolves the caller's own tenant and refuses a mismatched
-- `_tenant_id` unless the caller is a platform owner — unchanged. God sees any tenant's rows;
-- Agency, Solo and Sub-account see their own; a Client has no tenant and gets an empty set. No
-- tier gains reach it did not have.

CREATE OR REPLACE FUNCTION public.list_tool_autonomy(_tenant_id uuid DEFAULT NULL)
RETURNS TABLE (
  tool_key    text,
  label       text,
  category    text,
  mode        text,
  is_default  boolean,
  updated_at  timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _caller uuid := auth.uid();
  _tenant uuid;
BEGIN
  IF _caller IS NOT NULL THEN
    _tenant := public.current_user_tenant_id();
    IF _tenant_id IS NOT NULL AND _tenant_id <> _tenant AND NOT public.is_platform_owner() THEN
      RAISE EXCEPTION 'AUTONOMY_FORBIDDEN: tenant mismatch' USING ERRCODE = '42501';
    END IF;
    IF public.is_platform_owner() AND _tenant_id IS NOT NULL THEN _tenant := _tenant_id; END IF;
  ELSE
    _tenant := _tenant_id;
  END IF;

  RETURN QUERY
  WITH catalog(tool_key, label, category) AS (
    VALUES
      -- ── previously listed (23) ──
      ('crm_update_contact',        'Update a contact',                    'CRM'),
      ('crm_create_contact',        'Add a contact',                       'CRM'),
      ('crm_delete_contact',        'Delete a contact',                    'CRM'),
      ('crm_update_pipeline_stage', 'Move a client''s stage',              'Pipeline'),
      ('crm_assign_coach',          'Assign a coach',                      'CRM'),
      ('crm_assign_contact',        'Assign a contact',                    'CRM'),
      ('crm_create_task',           'Create a task',                       'Tasks'),
      ('crm_log_activity',          'Log an activity',                     'CRM'),
      ('pipeline_create',           'Create a pipeline',                   'Pipeline'),
      ('pipeline_add_stage',        'Add a pipeline stage',                'Pipeline'),
      ('member_grant_role',         'Grant a staff role',                  'Team'),
      ('member_revoke_role',        'Revoke a staff role',                 'Team'),
      ('calendar_book_meeting',     'Book a meeting',                      'Calendar'),
      ('program_enroll',            'Enroll a client in a program',        'Programs'),
      ('draft_marketing_content',   'Draft marketing content',             'Content'),
      ('generate_image',            'Generate an image',                   'Content'),
      ('content_save',              'Save marketing content',              'Content'),
      ('growth_page_save',          'Save a landing page draft',           'Studio'),
      ('growth_page_publish',       'Publish a landing page',              'Studio'),
      ('growth_funnel_build',       'Build a funnel',                      'Studio'),
      ('growth_funnel_publish',     'Publish a funnel',                    'Studio'),
      ('action_file',               'File an action',                      'Action bus'),
      ('action_advance',            'Advance an action',                   'Action bus'),

      -- ── governed but INVISIBLE until now (25) ──
      -- The client file. The single most consequential per-client write Paige makes, and it was
      -- not even in the gate until this slice, let alone in this list.
      ('update_client_data',        'Save details to a client''s file',    'Client file'),
      -- Handing work to a specialist. `forge_subagent` (creating one) was listed; the one that
      -- RUNS one was not.
      ('delegate_to_subagent',      'Hand work to a specialist',           'Paige''s team'),
      ('forge_subagent',            'Create a new specialist',             'Paige''s team'),
      ('save_to_knowledge_base',    'Save something to your knowledge base','Knowledge'),
      ('update_business_profile',   'Update your business profile',        'Business'),
      ('deal_create',               'Add a deal',                          'Pipeline'),
      ('deal_move_stage',           'Move a deal''s stage',                'Pipeline'),
      ('document_generate',         'Generate a document',                 'Content'),
      ('author_event_kind',         'Add an activity kind',                'Action bus'),
      -- n8n. Dropped by a "verbatim" re-declaration; `n8n_delete_workflow` is a PERMANENT DELETE
      -- the operator had no way to disable, which is what makes this more than bookkeeping.
      ('n8n_run_workflow',          'Run an automation',                   'Automations'),
      ('n8n_activate_workflow',     'Turn an automation on',               'Automations'),
      ('n8n_deactivate_workflow',   'Turn an automation off',              'Automations'),
      ('n8n_create_workflow',       'Create an automation',                'Automations'),
      ('n8n_update_workflow',       'Change an automation',                'Automations'),
      ('n8n_archive_workflow',      'Archive an automation',               'Automations'),
      ('n8n_delete_workflow',       'Delete an automation permanently',    'Automations'),
      ('zapier_run_action',         'Run a connected app action',          'Automations'),
      -- Planning.
      ('plan_set_reminder',         'Set a reminder',                      'Planning'),
      ('plan_create',               'Create a plan',                       'Planning'),
      ('plan_add_milestone',        'Add a milestone',                     'Planning'),
      ('plan_assign_task',          'Assign a task from a plan',           'Planning'),
      ('plan_update_item',          'Change a plan item',                  'Planning'),
      ('plan_remove_item',          'Remove a plan item',                  'Planning'),
      -- CONTAINMENT TOMBSTONES. Deliberately not registered and not dispatched; they are in the
      -- gate so a future accidental re-registration cannot inherit read semantics. Listed here for
      -- the same reason: if either ever becomes real, it arrives already governable rather than
      -- silently ungoverned. A tenant setting them today changes nothing, which is correct.
      ('marketplace_install',       'Install from the marketplace',        'Marketplace'),
      ('marketplace_uninstall',     'Remove a marketplace install',        'Marketplace')
  )
  SELECT
    c.tool_key,
    c.label,
    c.category,
    COALESCE(t.mode, 'confirm')       AS mode,
    (t.mode IS NULL)                  AS is_default,
    t.updated_at
  FROM catalog c
  LEFT JOIN public.tenant_tool_autonomy t
    ON t.tool_key = c.tool_key AND t.tenant_id = _tenant
  ORDER BY c.category, c.label;
END;
$$;

-- Grant posture preserved exactly (no PUBLIC/anon EXECUTE; the dual-caller guard above trusts
-- auth.uid() and would drop anon into the service branch otherwise).
REVOKE ALL ON FUNCTION public.list_tool_autonomy(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_tool_autonomy(uuid) TO authenticated, service_role;
