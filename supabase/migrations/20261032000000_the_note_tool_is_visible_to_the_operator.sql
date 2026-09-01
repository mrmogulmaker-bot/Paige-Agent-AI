-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- The autonomy catalogue gains the note tool, so the operator can see and switch it off.
--
-- `list_tool_autonomy` is what the Capabilities surface renders. A tool the runtime gates but the
-- catalogue omits is governed INVISIBLY: it defaults to `confirm` and cannot be set to autopilot
-- or, the half that matters, turned OFF. `lint:tool-catalogue` failed this change until this row
-- existed, which is the guard doing exactly its job.
--
-- The body below is the previous declaration with ONE row added next to its closest sibling; the
-- RPC is CREATE OR REPLACE'd whole, so the newest declaration is what production runs. Generated
-- from `20261025000000` rather than retyped, so nothing else can drift in the copy.
--
-- 52 entries, matching the 52 tools the runtime gates.
-- ─────────────────────────────────────────────────────────────────────────────────────────────

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
      ('crm_add_note',              'Add a note to a client',              'CRM'),
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
      -- ── §67 — THE PROCESS TOOLS (3), added with the slice that introduced them ──
      -- These are listed for a sharper reason than the rest. `automation_set_grant` is how a human
      -- tells Paige how much of a process she may run alone, so a workspace that wants that
      -- decision to stay firmly with a person can set THIS tool to `off` and remove her ability to
      -- change any grant at all — including her own. A governance control that was itself
      -- ungoverned would be the one row in this catalogue that mattered most by its absence.
      ('automation_draft',          'Set up a repeatable process',         'Automations'),
      ('automation_set_grant',      'Change how much Paige runs alone',    'Automations'),
      ('automation_set_state',      'Turn a process on or off',            'Automations'),
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
