-- PAIGE Spine foundation: the existing Context Rail stays the durable source.
-- This migration adds no event bus, memory store, approval store, or customer write.
-- It exposes one fixed-field, authenticated, domain-owned evidence projection for
-- Pipeline deal-stage outcomes already emitted by configure_tenant_pipeline.

create or replace function public.get_pipeline_spine_evidence(
  p_client_ref text,
  p_limit integer default 50
)
returns table (
  signal_id uuid,
  kind text,
  tenant_id uuid,
  subject_type text,
  subject_ref text,
  occurred_at timestamptz,
  recorded_at timestamptz,
  source_system text,
  source_record_ref text,
  source_actor_type text,
  availability text,
  classification text,
  lifecycle text,
  safe_summary text,
  facts jsonb,
  audience text,
  schema_version integer,
  expires_at timestamptz,
  outcome_ref text
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_uid uuid := auth.uid();
  v_tenant uuid := public.current_user_tenant_id();
  v_limit integer := least(greatest(coalesce(p_limit, 50), 1), 100);
begin
  if v_uid is null or v_tenant is null then return; end if;
  if nullif(btrim(p_client_ref), '') is null then return; end if;
  if not (public.has_any_role(v_uid, array['admin','super_admin','coach']) or public.is_platform_owner()) then return; end if;

  return query
  select
    e.id as signal_id,
    'pipeline.deal_stage_moved'::text as kind,
    e.tenant_id,
    'client'::text as subject_type,
    c.account_number::text as subject_ref,
    e.occurred_at,
    e.created_at as recorded_at,
    'context_rail'::text as source_system,
    ('rail:' || e.id::text)::text as source_record_ref,
    case when e.actor_type = 'paige_agent' then 'paige' when e.actor_type = 'owner_staff' then 'person' else 'system' end::text as source_actor_type,
    case when e.occurred_at >= now() - interval '30 days' then 'available' else 'stale' end::text as availability,
    'operational'::text as classification,
    'observed'::text as lifecycle,
    'A pipeline stage changed.'::text as safe_summary,
    jsonb_build_object(
      'change_type', 'stage_changed',
      'outcome', 'succeeded',
      'actor', case when e.actor_type = 'paige_agent' then 'paige' else 'person' end
    ) as facts,
    'owner_internal'::text as audience,
    1::integer as schema_version,
    e.occurred_at + interval '365 days' as expires_at,
    ('rail:' || e.id::text)::text as outcome_ref
  from public.paige_client_events e
  join public.clients c on c.id = e.contact_id and c.tenant_id = e.tenant_id
  where e.tenant_id = v_tenant
    and upper(c.account_number) = upper(btrim(p_client_ref))
    and e.event_kind = 'owner.crm_mutation'
    and e.surface = 'campaigns_pipeline'
    and e.ref_table = 'deals'
    and e.audience = 'owner'
    and e.visibility = 'owner_internal'
    and e.actor_type in ('owner_staff', 'paige_agent')
    and e.payload->>'policy_result' = 'allowed'
    and e.payload->>'actor_kind' in ('human', 'paige')
    and e.occurred_at >= now() - interval '365 days'
  order by e.occurred_at desc, e.id desc
  limit v_limit;
end
$$;

revoke all on function public.get_pipeline_spine_evidence(text,integer) from public, anon, service_role;
grant execute on function public.get_pipeline_spine_evidence(text,integer) to authenticated;

comment on function public.get_pipeline_spine_evidence(text,integer) is
  'PAIGE Spine v1 hardened safe evidence lens for existing Pipeline deal-stage Rail outcomes. Direct Rail access stays revoked; returns no raw title, summary, payload, user id, internal deal id, or stage content.';
