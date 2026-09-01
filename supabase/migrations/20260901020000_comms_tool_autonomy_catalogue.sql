-- Paige can now buy a phone number. That has to be a thing you can turn OFF.
--
-- `MUTATING_TOOLS` in paige-ai-chat is the runtime gate; `list_tool_autonomy` is the catalogue
-- the operator's Capabilities surface renders. A tool in the first with no row in the second is
-- governed INVISIBLY: it defaults to `confirm`, and the operator can neither raise it nor — the
-- half that matters — switch it off. `scripts/ci/tool-catalogue-lint.mjs` fails the build for
-- exactly that, and it did, naming all four of these before this migration existed.
--
-- WHY THESE FOUR AND NOT THE OTHER THREE. `comms_list_numbers`, `comms_search_numbers` and
-- `comms_registration_status` read and change nothing, so they are not in `MUTATING_TOOLS` and
-- do not belong here — a catalogue full of read-only rows makes the ones that matter harder to
-- find. The four below all change something real:
--
--   comms_buy_number          starts a MONTHLY CHARGE, immediately
--   comms_set_primary_number  changes the number every future call and text comes FROM,
--                             which is what a client sees on their phone
--   comms_draft_registration  spends a model call AND overwrites saved compliance copy
--   comms_name_number         a label — the mildest of the four, listed so the set is
--                             complete and the operator is never surprised by a change
--                             they had no switch for
--
-- All four inherit the `confirm` default (`resolve_tool_autonomy` returns 'confirm' when no row
-- exists), so Paige proposes before she acts, and nothing here silently becomes autopilot.
--
-- HONEST NOTE ON THE CEILING (§13). The Trust Compass ceiling clamps these at RENDER only —
-- `clampMode` in useToolAutonomy.ts, applied by CapabilitiesSurface. `resolve_tool_autonomy`,
-- which is what the runtime actually consults, reads `tenant_tool_autonomy` and never reads the
-- compass. So the per-tool floor is the enforcement today, and lowering the ceiling changes what
-- the operator SEES rather than what the runtime permits. That gap predates this migration and
-- is not closed by it; it is written down here so nobody reads a catalogue row as proof of a
-- server-side clamp that does not exist.
--
-- The whole function body is re-declared verbatim from the live definition plus the new rows and
-- the new `Comms` category — that is how this catalogue is versioned (20260716171236 did the
-- same), because the rows are literals in a VALUES list, not table data.

CREATE OR REPLACE FUNCTION public.list_tool_autonomy(_tenant_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(tool_key text, label text, category text, mode text, is_default boolean, updated_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
      ('growth_page_save',          'Save a landing page draft',     'Studio'),
      ('growth_page_publish',       'Publish a landing page',        'Studio'),
      ('growth_funnel_build',       'Build a funnel',                'Studio'),
      ('growth_funnel_publish',     'Publish a funnel',              'Studio'),
      ('action_file',               'File an action',                'Action bus'),
      ('action_advance',            'Advance an action',             'Action bus'),
      -- New. The label says what it COSTS where that is the point, because a switch
      -- labelled "Buy a phone number" and one labelled "Buy a phone number (monthly charge)"
      -- are answered differently by the person deciding whether to leave it on.
      ('comms_buy_number',          'Buy a phone number (monthly charge)', 'Comms'),
      ('comms_set_primary_number',  'Change which number you send from',   'Comms'),
      ('comms_name_number',         'Rename a phone number',               'Comms'),
      ('comms_draft_registration',  'Draft your carrier registration',     'Comms')
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
$function$;

REVOKE ALL ON FUNCTION public.list_tool_autonomy(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.list_tool_autonomy(uuid) TO authenticated, service_role;
