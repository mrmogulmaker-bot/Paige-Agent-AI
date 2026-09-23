-- =============================================================================
-- Paige's connection READ path moves onto the gateway registry.
--
-- THE DEFECT THIS CLOSES. Asked "what am I connected to?", Paige answers from
-- `integrations_list` → public.list_integration_surface(), which read ONLY
-- public.channel_connectors. It touched no MCP table at all, so every MCP
-- connection a tenant owns — Zapier, n8n, any remote MCP server — was invisible
-- to her. Not stale, not partial: absent. She could not name one, could not say
-- whether one was healthy, and could not tell an owner that the thing they just
-- connected in Settings → Integrations exists.
--
-- WHICH REGISTRY, AND WHY IT MATTERS. There are two. The LEGACY one
-- (public.tenant_mcp_connections) is what Paige's tool-invocation path still
-- resolves against today (call-zapier-action/index.ts:98, via
-- get_tenant_mcp_secret). The GATEWAY one (public.mcp_connections) is the newer
-- registry the mcp-gateway edge function owns. This migration points the READ
-- half at the GATEWAY registry. The invocation half is deliberately NOT moved
-- here — it is blocked on an owner flag (MCP_GATEWAY_EXECUTE_ENABLED, default
-- OFF), on a production drift measurement (scripts/sql/mcp-backfill-drift.sql),
-- and on two gateway doors that do not exist yet. Moving the read half without
-- the write half is the safe half, and it is additive.
--
-- §18 — ONE HOME, NOT A FORK. This does NOT re-implement the connection read.
-- public.get_mcp_connections_v2 already owns it and already gets the hard parts
-- right: the owner_only visibility gate, host-only URL projection (never the
-- secret-bearing full URL), and the `configured` predicate including the
-- url/none exemption. Forking that logic into a second query is how the two
-- drift apart and one of them quietly stops hiding owner_only rows. So this
-- CALLS it and maps its rows into the integration-surface shape.
--
-- §9 / §59 — THE SCOPE ARGUMENT, IN FULL. list_integration_surface is SECURITY
-- DEFINER and therefore bypasses RLS, so the body must re-establish scope
-- itself; the grant is never the guard. It does, twice over:
--   * The channel half is unchanged: WHERE cc.tenant_id = current_user_tenant_id().
--   * The MCP half calls get_mcp_connections_v2() with NO tenant argument, so
--     that function resolves the tenant through _mcp_resolve_tenant(NULL,false),
--     which for any real caller (auth.uid() IS NOT NULL) sets the tenant to
--     public.current_user_tenant_id() — byte-for-byte the SAME resolver the
--     channel half uses — and then refuses a non-member outright. The two halves
--     therefore cannot resolve different tenants. No tenant value is accepted
--     from the wire on either half.
--   * owner_only rows stay hidden from an ordinary member: SECURITY DEFINER
--     changes the executing privilege, NOT auth.uid(), so v2's
--     `_full := auth.uid() IS NULL OR is_tenant_admin(...) OR is_platform_owner()`
--     still evaluates against the REAL caller when invoked from in here.
--
-- §58 — WHY THE MCP HALF IS EXCEPTION-WRAPPED, AND WHY THAT IS NOT SWALLOWING.
-- _mcp_resolve_tenant RAISES where this function today returns an empty array:
-- MCP_FORBIDDEN for an authenticated non-member, MCP_NO_TENANT for a
-- service-role caller with no tenant argument (this function takes none). An
-- unguarded call would convert those into a thrown `integrations_list` tool
-- call, regressing the channel_connectors read that works today for everyone.
-- So the MCP half degrades to an empty array — and RAISES A WARNING when it
-- does (§32: a degrade path that logs nothing turns every fault into the same
-- invisible symptom). It never fabricates a connection and never reports an
-- MCP connection it could not read as healthy.
--
-- §13 — WHY THE GATEWAY ALONE WOULD MAKE PAIGE LIE, AND WHAT THIS DOES INSTEAD.
-- The gateway registry was populated by a ONE-TIME backfill (20270319000000
-- §6a, a DO block whose helper is dropped at :576 so it cannot re-run). No
-- trigger projects legacy→gateway afterwards, and the legacy writers are still
-- the sole live write path for Zapier/n8n connections — the repo says so itself
-- in the table comment at 20270319000000:596 ("remain the sole live path until
-- a later cutover"). So a connection made the legacy way AFTER the backfill
-- exists and works, and is simply absent from mcp_connections.
--
-- Reading the gateway alone would therefore hand Paige a list with a hole in
-- it, and a hole in a list is indistinguishable from an absence: asked "am I
-- connected to Zapier?", she would answer no about a connection that is live.
-- That is a worse failure than today's honest silence, because it is confident.
--
-- So the MCP half is GATEWAY-PREFERRED AND COMPLETE. The gateway answers for
-- every connection it holds — it is the source of truth (§57). The legacy
-- reader fills ONLY the gap, contributing a provider the gateway has no row
-- for. Neither registry's internal name reaches the row: which store answered
-- is an operations concern, measured by scripts/sql/mcp-backfill-drift.sql, not
-- something an owner asking "what am I connected to?" should have to parse.
--
-- §13 — THE HEALTH VOCABULARY GAINS 'unknown', DELIBERATELY. The channel half
-- emits healthy | degraded | disconnected. An MCP connection that no probe has
-- ever touched has health='unknown'; calling that "healthy" is a lie and
-- calling it "degraded" is a false alarm that would send an owner to fix a
-- connection that may be fine. So it reports 'unknown' and the reader labels
-- the freshness. OWED, and named rather than silently skipped: the descriptive
-- factValues in _shared/paige-spine/domains/integrations_surface.ts list
-- health/status/provider/channel value sets that do not yet include 'unknown',
-- 'mcp', or the MCP provider keys. That file is the Platform Reach lane's to
-- edit (spine registration), not this lane's, so it is handed over rather than
-- edited here. Those values are descriptive metadata validated only for
-- non-emptiness by validateSpineRegistry — nothing gates on them at runtime —
-- so this migration is correct and complete without that edit.
-- =============================================================================

create or replace function public.list_integration_surface()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  _channels jsonb;
  _mcp      jsonb := '[]'::jsonb;
  _legacy   jsonb := '[]'::jsonb;
begin
  -- ── Half 1: channel connectors. UNCHANGED from 20270116000000. ───────────
  select coalesce(jsonb_agg(t), '[]'::jsonb) into _channels from (
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

  -- ── Half 2: MCP connections — GATEWAY first (the source of truth). ──────
  begin
    select coalesce(jsonb_agg(
             jsonb_build_object(
               'channel',         'mcp',
               'provider',        c->>'provider_key',
               -- Mapped into the surface's own status vocabulary, not the
               -- gateway's. A turned-off connection is 'disabled' whatever its
               -- last probe said; only a probe-confirmed one is 'active'.
               'status', case
                 when (c->>'enabled')::boolean is not true then 'disabled'
                 when c->>'status' = 'connected'           then 'active'
                 else 'pending'
               end,
               'active',          coalesce((c->>'enabled')::boolean, false),
               'display_name',    c->>'label',
               -- An MCP server is not an inbox: these three carry no meaning
               -- here and are emitted null rather than filled with something
               -- plausible-looking.
               'from_address',    null,
               'inbound_domain',  null,
               'inbound_address', null,
               'health', case
                 when (c->>'enabled')::boolean is not true       then 'disconnected'
                 when (c->>'configured')::boolean is not true    then 'unconfigured'
                 when c->>'status' = 'error'                     then 'degraded'
                 when c->>'health' = 'needs_attention'           then 'degraded'
                 when c->>'health' = 'healthy'                   then 'healthy'
                 else 'unknown'
               end,
               -- observed_at, never presented as "verified now" — carried
               -- through from the gateway row with its truth boundary intact.
               'last_updated',    c->>'last_checked_at',
               -- Host only. v2 already projects this without the path or any
               -- credential material; nothing secret-bearing is added here.
               'server_host',     c->>'server_url_host',
               'tool_count',      c->>'tool_count',
               'approved_count',  c->>'approved_count'
             )
           ), '[]'::jsonb)
      into _mcp
      from jsonb_array_elements(public.get_mcp_connections_v2()) as c;
  exception when others then
    -- Loud, never silent (§32). The channel half still answers; the MCP half
    -- reports nothing rather than guessing.
    raise warning 'list_integration_surface: MCP half unavailable (%): %', sqlstate, sqlerrm;
    _mcp := '[]'::jsonb;
  end;

  -- ── Half 3: legacy MCP connections the backfill never projected. ────────
  -- Gap-fill ONLY: a provider the gateway already holds is skipped, so the
  -- gateway stays the source of truth and nothing is listed twice. Scoped by
  -- the SAME _mcp_resolve_tenant(NULL,false) as Half 2, and the reader returns
  -- host-only + last-4 — no credential material. Separately guarded so a fault
  -- in either registry can never take the other one down.
  begin
    select coalesce(jsonb_agg(
             jsonb_build_object(
               'channel',         'mcp',
               'provider',        v->>'provider',
               'status', case
                 when (v->>'enabled')::boolean is not true then 'disabled'
                 when v->>'status' = 'connected'           then 'active'
                 else 'pending'
               end,
               'active',          coalesce((v->>'enabled')::boolean, false),
               'display_name',    v->>'label',
               'from_address',    null,
               'inbound_domain',  null,
               'inbound_address', null,
               -- Legacy carries no `health` column, so health is derived from
               -- what a probe actually established. Never invented.
               'health', case
                 when (v->>'enabled')::boolean is not true    then 'disconnected'
                 when (v->>'configured')::boolean is not true then 'unconfigured'
                 when v->>'status' = 'error'                  then 'degraded'
                 when v->>'status' = 'connected'              then 'healthy'
                 else 'unknown'
               end,
               'last_updated',    v->>'last_probed_at',
               'server_host',     v->>'server_url_host',
               'tool_count',      v->>'tool_count',
               'approved_count',  jsonb_array_length(coalesce(v->'approved_capabilities','[]'::jsonb))
             )
           ), '[]'::jsonb)
      into _legacy
      from jsonb_each(public.get_tenant_mcp_connections()) as kv(provider_key, v)
     where not exists (
             select 1 from jsonb_array_elements(_mcp) g
              where g->>'provider' = kv.provider_key
           );
  exception when others then
    raise warning 'list_integration_surface: legacy MCP gap-fill unavailable (%): %', sqlstate, sqlerrm;
    _legacy := '[]'::jsonb;
  end;

  return _channels || _mcp || _legacy;
end;
$$;

revoke all on function public.list_integration_surface() from public, anon;
grant execute on function public.list_integration_surface() to authenticated, service_role;
