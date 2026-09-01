-- Paige can now buy a phone number. That has to be a thing you can turn OFF.
--
-- `MUTATING_TOOLS` in paige-ai-chat is the runtime gate; `list_tool_autonomy` is the catalogue
-- the operator's Capabilities surface renders. A tool in the first with no row in the second is
-- governed INVISIBLY: it defaults to `confirm`, and the operator can neither raise it nor — the
-- half that matters — switch it off. `scripts/ci/tool-catalogue-lint.mjs` fails the build for
-- exactly that, and it did, naming all four of these before this migration existed.
--
-- WHY THIS FILE IS DATED AFTER `20261019000500` AND NOT WHEN IT WAS WRITTEN.
-- This catalogue is a VALUES list inside a function body, so every migration that touches it
-- REPLACES the whole list rather than adding to it — which makes the LAST migration to run the
-- only one that decides what the operator can see. This file was first written as
-- `20260901020000`, which sorted BEFORE two migrations that landed on main while this branch was
-- open (`20261019000000` Solo Setup, then `20261019000500`, which exists because the first of
-- those had already clobbered the Pipeline rows once). Merging it at that timestamp would have
-- installed these four rows and then had main's later migrations drop them again — the four
-- Comms tools would be back to governed-but-invisible, silently, with the lint green because the
-- lint reads the last declaration and would have found them missing there.
--
-- So the body below is main's `20261019000500` declaration verbatim, PLUS the four new rows and
-- the new `Comms` category, at a timestamp that sorts after it. If a third branch adds a tool,
-- it does the same thing to this file. The `capabilities.v3` test is what catches it: it reads
-- the LAST declaration on disk, not this one, so an out-of-order catalogue fails there rather
-- than in production.
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
      ('action_advance',                  'Advance an action',                'Action bus'),
      ('comms_buy_number',                'Buy a phone number (monthly charge)', 'Comms'),
      ('comms_set_primary_number',        'Change which number you send from',   'Comms'),
      ('comms_name_number',               'Rename a phone number',               'Comms'),
      ('comms_draft_registration',        'Draft your carrier registration',     'Comms')
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
