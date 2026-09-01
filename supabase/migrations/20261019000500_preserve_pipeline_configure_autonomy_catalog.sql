-- Preserve both governed PAIGE capabilities when the Solo Setup and Pipeline
-- migrations land together. This forward migration intentionally follows the
-- Setup catalogue replacement and keeps the operator-visible controls additive.

CREATE OR REPLACE FUNCTION public.list_tool_autonomy(
  _tenant_id uuid default null
)
returns table (
  tool_key text,
  label text,
  category text,
  mode text,
  is_default boolean,
  updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  _caller uuid := auth.uid();
  _tenant uuid;
begin
  if _caller is not null then
    _tenant := public.current_user_tenant_id();
    if _tenant_id is not null and _tenant_id <> _tenant and not public.is_platform_owner() then
      raise exception 'AUTONOMY_FORBIDDEN: tenant mismatch' using errcode = '42501';
    end if;
    if public.is_platform_owner() and _tenant_id is not null then _tenant := _tenant_id; end if;
  else
    _tenant := _tenant_id;
  end if;

  return query
  WITH catalog(tool_key, label, category) AS (
    values
      ('crm_update_contact',              'Update a contact',                 'CRM'),
      ('crm_create_contact',              'Add a contact',                    'CRM'),
      ('crm_delete_contact',              'Delete a contact',                 'CRM'),
      ('propose_business_brief_update',   'Propose a business brief update',  'CRM'),
      ('crm_update_pipeline_stage',       'Move a client''s stage',           'Pipeline'),
      ('crm_assign_coach',                'Assign a coach',                   'CRM'),
      ('crm_assign_contact',              'Assign a contact',                 'CRM'),
      ('crm_create_task',                 'Create a task',                    'Tasks'),
      ('crm_log_activity',                'Log an activity',                  'CRM'),
      ('pipeline_create',                 'Create a pipeline',                'Pipeline'),
      ('pipeline_add_stage',              'Add a pipeline stage',             'Pipeline'),
      ('pipeline_configure',              'Configure pipelines and stages',   'Pipeline'),
      ('member_grant_role',               'Grant a staff role',               'Team'),
      ('member_revoke_role',              'Revoke a staff role',              'Team'),
      ('calendar_book_meeting',           'Book a meeting',                   'Calendar'),
      ('program_enroll',                  'Enroll a client in a program',     'Programs'),
      ('draft_marketing_content',         'Draft marketing content',          'Content'),
      ('generate_image',                  'Generate an image',                'Content'),
      ('content_save',                    'Save marketing content',           'Content'),
      ('growth_page_save',                'Save a landing page draft',        'Studio'),
      ('growth_page_publish',             'Publish a landing page',           'Studio'),
      ('growth_funnel_build',             'Build a funnel',                   'Studio'),
      ('growth_funnel_publish',           'Publish a funnel',                 'Studio'),
      ('action_file',                     'File an action',                   'Action bus'),
      ('action_advance',                  'Advance an action',                'Action bus')
  )
  SELECT
    c.tool_key,
    c.label,
    c.category,
    coalesce(t.mode, 'confirm') as mode,
    (t.mode is null) as is_default,
    t.updated_at
  from catalog c
  left join public.tenant_tool_autonomy t
    on t.tool_key = c.tool_key and t.tenant_id = _tenant
  order by c.category, c.label;
end;
$$;

revoke all on function public.list_tool_autonomy(uuid) from public, anon;
grant execute on function public.list_tool_autonomy(uuid) to authenticated, service_role;
