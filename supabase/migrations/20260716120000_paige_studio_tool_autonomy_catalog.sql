-- Paige tool autonomy — add the Studio (Vibe Studio) build tools to the governable catalog.
--
-- Context (#272, permission-first): Paige can now build campaign artifacts from her chat —
-- funnels (growth_funnel_build / growth_funnel_publish) on top of the existing landing-page
-- tools. Every one of these is a MUTATING tool already gated at runtime by the autonomy choke
-- point in paige-ai-chat (resolve_tool_autonomy → 'confirm' by default), so nothing here is
-- required for the GATE to work — the gate defaults any unlisted tool to 'confirm' (safe).
--
-- What this migration fixes is VISIBILITY/CONTROL: list_tool_autonomy() powers the operator's
-- autonomy settings surface, and its hardcoded catalog did NOT include the Studio tools — so an
-- operator could not see or flip them to auto/off. That is exactly the "add permissions in the
-- settings" the owner asked for, and it also closes a pre-existing gap where growth_page_save /
-- growth_page_publish were gated at runtime but invisible in settings.
--
-- Governance intent (owner directive 2026-07-16): "we can't let her run so wild that she
-- outgrows us and we have zero control." Building/publishing a live funnel is a real, outward
-- action — it stays 'confirm' by default (Paige proposes, the operator says yes), and the
-- operator can now explicitly see it and choose auto (autopilot) or off (disabled) per tenant.
--
-- CREATE OR REPLACE with the full body re-declared (only the catalog VALUES list changed —
-- a new 'Studio' category added; everything else verbatim from 20260711200000).

CREATE OR REPLACE FUNCTION public.list_tool_autonomy(
  _tenant_id uuid DEFAULT NULL
)
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
      ('action_advance',            'Advance an action',             'Action bus')
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

-- Preserve the exact grant posture of the original (no PUBLIC/anon EXECUTE; the dual-caller
-- guard above trusts auth.uid() and would drop anon into the service branch otherwise).
REVOKE ALL ON FUNCTION public.list_tool_autonomy(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_tool_autonomy(uuid) TO authenticated, service_role;
