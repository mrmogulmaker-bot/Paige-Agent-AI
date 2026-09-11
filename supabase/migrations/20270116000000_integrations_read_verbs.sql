-- =============================================================================
-- Integrations read verbs (#1140 follow-on): Paige's visibility into what's
-- connected, what's available, and what's healthy.
--
-- list_integration_surface: the caller-scoped read (§59: tenant derived from
-- JWT, never from the wire) that powers integrations.list and
-- integrations.health. Returns the REAL connection state from
-- channel_connectors, never a cached or guessed answer.
-- =============================================================================

create or replace function public.list_integration_surface()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(t), '[]'::jsonb) from (
    select jsonb_build_object(
             'channel', cc.channel_type,
             'provider', cc.provider,
             'status', cc.status,
             'active', cc.active,
             'display_name', cc.display_name,
             'from_address', cc.from_address,
             'inbound_domain', cc.inbound_domain,
             'inbound_address', cc.inbound_address,
             'health', case
               when cc.active = false or cc.status = 'disabled' then 'disconnected'
               when cc.updated_at < now() - interval '7 days' then 'degraded'
               else 'healthy'
             end,
             'last_updated', cc.updated_at
           ) as t
    from public.channel_connectors cc
    where cc.tenant_id = public.current_user_tenant_id()
  ) s;
$$;

revoke all on function public.list_integration_surface() from public, anon;
grant execute on function public.list_integration_surface() to authenticated, service_role;
