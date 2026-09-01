-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- The catalogue carries the document-filing tool.
--
-- `crm_file_document` is gated at runtime the moment it is classified, and a tool that is gated
-- but absent from `list_tool_autonomy` is governed INVISIBLY: the operator cannot see it, cannot
-- put it on autopilot, and — the half that matters — cannot turn it off. `lint:tool-catalogue`
-- refused the change until this row existed, which is the guard doing exactly its job.
--
-- Read 20261034000000's header before editing this. The function is declared with a literal row
-- list, so a CREATE OR REPLACE that omits a row DELETES it and looks identical to an addition. The
-- list below is 20261034000000's 58 rows, verbatim, plus one. Nothing was removed; the previous
-- file is the diff base if you want to check that rather than take it on trust.
--
-- `crm_list_documents` deliberately gets NO row: it is a read, it is not in the gated set, and a
-- catalogue of things the operator can switch off should not fill up with things that were never
-- switched on. Turning off a read would also be the wrong lever — the tool that touches anything
-- is the one below it.
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
      ('crm_update_contact',            'Update a contact', 'CRM'),
      ('crm_create_contact',            'Add a contact', 'CRM'),
      ('crm_delete_contact',            'Delete a contact', 'CRM'),
      ('crm_update_pipeline_stage',     'Move a client''s stage', 'Pipeline'),
      ('crm_assign_coach',              'Assign a coach', 'CRM'),
      ('crm_assign_contact',            'Assign a contact', 'CRM'),
      ('crm_create_task',               'Create a task', 'Tasks'),
      ('crm_log_activity',              'Log an activity', 'CRM'),
      ('crm_add_note',                  'Add a note to a client', 'CRM'),
      ('crm_file_document',             'File a document on a client', 'CRM'),
      ('pipeline_create',               'Create a pipeline', 'Pipeline'),
      ('pipeline_add_stage',            'Add a pipeline stage', 'Pipeline'),
      ('member_grant_role',             'Grant a staff role', 'Team'),
      ('member_revoke_role',            'Revoke a staff role', 'Team'),
      ('calendar_book_meeting',         'Book a meeting', 'Calendar'),
      ('program_enroll',                'Enroll a client in a program', 'Programs'),
      ('draft_marketing_content',       'Draft marketing content', 'Content'),
      ('generate_image',                'Generate an image', 'Content'),
      ('content_save',                  'Save marketing content', 'Content'),
      ('growth_page_save',              'Save a landing page draft', 'Studio'),
      ('growth_page_publish',           'Publish a landing page', 'Studio'),
      ('growth_funnel_build',           'Build a funnel', 'Studio'),
      ('growth_funnel_publish',         'Publish a funnel', 'Studio'),
      ('action_file',                   'File an action', 'Action bus'),
      ('action_advance',                'Advance an action', 'Action bus'),
      ('update_client_data',            'Save details to a client''s file', 'Client file'),
      ('delegate_to_subagent',          'Hand work to a specialist', 'Paige''s team'),
      ('forge_subagent',                'Create a new specialist', 'Paige''s team'),
      ('save_to_knowledge_base',        'Save something to your knowledge base', 'Knowledge'),
      ('update_business_profile',       'Update your business profile', 'Business'),
      ('deal_create',                   'Add a deal', 'Pipeline'),
      ('deal_move_stage',               'Move a deal''s stage', 'Pipeline'),
      ('document_generate',             'Generate a document', 'Content'),
      ('author_event_kind',             'Add an activity kind', 'Action bus'),
      ('n8n_run_workflow',              'Run an automation', 'Automations'),
      ('n8n_activate_workflow',         'Turn an automation on', 'Automations'),
      ('n8n_deactivate_workflow',       'Turn an automation off', 'Automations'),
      ('n8n_create_workflow',           'Create an automation', 'Automations'),
      ('n8n_update_workflow',           'Change an automation', 'Automations'),
      ('n8n_archive_workflow',          'Archive an automation', 'Automations'),
      ('n8n_delete_workflow',           'Delete an automation permanently', 'Automations'),
      ('zapier_run_action',             'Run a connected app action', 'Automations'),
      ('plan_set_reminder',             'Set a reminder', 'Planning'),
      ('plan_create',                   'Create a plan', 'Planning'),
      ('plan_add_milestone',            'Add a milestone', 'Planning'),
      ('plan_assign_task',              'Assign a task from a plan', 'Planning'),
      ('plan_update_item',              'Change a plan item', 'Planning'),
      ('plan_remove_item',              'Remove a plan item', 'Planning'),
      ('automation_draft',              'Set up a repeatable process', 'Automations'),
      ('automation_set_grant',          'Change how much Paige runs alone', 'Automations'),
      ('automation_set_state',          'Turn a process on or off', 'Automations'),
      ('marketplace_install',           'Install from the marketplace', 'Marketplace'),
      ('marketplace_uninstall',         'Remove a marketplace install', 'Marketplace'),
      ('propose_business_brief_update', 'Propose a business brief update', 'CRM'),
      ('pipeline_configure',            'Configure pipelines and stages', 'Pipeline'),
      ('comms_buy_number',              'Buy a phone number (monthly charge)', 'Comms'),
      ('comms_set_primary_number',      'Change which number you send from', 'Comms'),
      ('comms_name_number',             'Rename a phone number', 'Comms'),
      ('comms_draft_registration',      'Draft your carrier registration', 'Comms')
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
