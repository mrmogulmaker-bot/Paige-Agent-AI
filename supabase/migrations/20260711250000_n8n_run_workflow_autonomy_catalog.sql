-- Add n8n_run_workflow (fire a webhook-triggered automation) to the autonomy
-- catalog so the operator can set it to Ask-first / Autopilot / Off alongside the
-- other Automations tools. This is the tool that lets Paige actually TRIGGER an
-- automation (e.g. a Telegram/GHL send workflow), not just manage it.
CREATE OR REPLACE FUNCTION public.list_tool_autonomy(_tenant_id uuid DEFAULT NULL)
RETURNS TABLE (tool_key text, label text, category text, mode text, is_default boolean, updated_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _caller uuid := auth.uid(); _tenant uuid;
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
      ('crm_update_contact',        'Update a contact',              'CRM'),
      ('crm_create_contact',        'Add a contact',                 'CRM'),
      ('crm_delete_contact',        'Delete a contact',              'CRM'),
      ('crm_update_pipeline_stage', 'Move a client''s stage',        'Pipeline'),
      ('crm_assign_coach',          'Assign a coach',                'CRM'),
      ('crm_assign_contact',        'Assign a contact',              'CRM'),
      ('crm_create_task',           'Create a task',                 'Tasks'),
      ('crm_log_activity',          'Log an activity',               'CRM'),
      ('pipeline_create',           'Create a pipeline',             'Pipeline'),
      ('pipeline_add_stage',        'Add a pipeline stage',          'Pipeline'),
      ('member_grant_role',         'Grant a staff role',            'Team'),
      ('member_revoke_role',        'Revoke a staff role',           'Team'),
      ('calendar_book_meeting',     'Book a meeting',                'Calendar'),
      ('program_enroll',            'Enroll a client in a program',  'Programs'),
      ('draft_marketing_content',   'Draft marketing content',       'Content'),
      ('generate_image',            'Generate an image',             'Content'),
      ('content_save',              'Save marketing content',        'Content'),
      ('action_file',               'File an action',                'Action bus'),
      ('action_advance',            'Advance an action',             'Action bus'),
      ('n8n_run_workflow',          'Fire an automation',            'Automations'),
      ('n8n_activate_workflow',     'Turn on an automation',         'Automations'),
      ('n8n_deactivate_workflow',   'Turn off an automation',        'Automations'),
      ('n8n_create_workflow',       'Create an automation',          'Automations'),
      ('n8n_update_workflow',       'Edit an automation',            'Automations')
  )
  SELECT c.tool_key, c.label, c.category, COALESCE(t.mode, 'confirm') AS mode,
         (t.mode IS NULL) AS is_default, t.updated_at
  FROM catalog c
  LEFT JOIN public.tenant_tool_autonomy t ON t.tool_key = c.tool_key AND t.tenant_id = _tenant
  ORDER BY c.category, c.label;
END; $$;
