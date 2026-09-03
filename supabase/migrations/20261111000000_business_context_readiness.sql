-- Business Context Readiness — the one safe Spine read Systems Check and PAIGE both consume.
--
-- WHY THIS EXISTS. Setup's current save path (save_solo_setup_context -> save_solo_setup_identity,
-- migration 20261046000000) writes website/phone/industry into tenant_legal_profile columns. Three
-- Systems Check runners (website_connected, company_info_populated, comms_configured) and PAIGE's
-- business-brief prompt section instead read tenants.brand -> 'website' / 'business_phone' /
-- 'industry' / 'business_brief' — a table nothing in the current save path writes. So Systems Check
-- and PAIGE report these fields as missing regardless of what an Owner saves in Setup, because a
-- fresh read still points at the wrong source. This is a missing-source-mapping defect, not a
-- staleness defect (confirmed by tracing every write and every read to file:line before writing this
-- migration) -- and it is the SAME defect at all three call sites, because all three share the one
-- broken pointer.
--
-- Setup remains the sole source of truth and the sole writer. This migration adds exactly one new
-- read: a narrow, tenant-safe status+provenance projection, never the underlying values, so a
-- consumer can learn "website: owner-confirmed" without ever receiving the URL, the phone number, or
-- the email address itself -- deliberately narrower than the eligible-fields list already approved
-- in docs/handoff/solo-setup-business-context-spine-handoff.md, which permits the public website
-- value itself; this contract stays to status+provenance only because every required flow in the
-- brief is satisfiable without a raw value, and the narrower surface is the safer default.
--
-- CALLERS, and why the function has two paths (§59, the codebase's own established pattern: "a
-- service-role/trusted path is the ONLY place a passed actor is honored, and only because
-- auth.uid() is NULL there"):
--   - PAIGE/Mind (paige-ai-chat, paige-mcp) call it through the CALLER's OWN JWT-scoped client,
--     exactly like the existing get_paige_persona_context() call. auth.uid() is set; the tenant is
--     derived from current_user_tenant_id() and any _tenant_id argument is ignored outright. That
--     caller must ALSO hold a staff role in that workspace (see the role gate below).
--   - The Systems Check runners execute under a service-role client with a tenant already resolved
--     safely by the calling edge function's own JWT verification (systems-check-http.ts
--     resolveTenantFromJwt) -- so auth.uid() is NULL there, and passing that already-safe tenant id
--     through _tenant_id is the same trusted-service-role pattern the rest of this codebase uses.
--
-- FIELDS. Exactly four, matching the vocabulary the runners and Setup already use: website,
-- business_phone, industry, primary_business_email. Every other Setup field (legal name, address,
-- tax/registration identifiers, business owners, representatives) stays out of this projection by
-- design -- this is a narrower set than even the already-approved eligible-fields list.
--
-- STATUS VOCABULARY, a strict superset of the vocabulary already approved in
-- docs/handoff/solo-setup-business-context-spine-handoff.md (owner_confirmed / connection_sourced /
-- needs_confirmation), adding exactly two new states this contract's honesty requirements need:
--   - owner_confirmed     -- Setup has this field with owner_confirmed/confirmed provenance
--   - connection_sourced  -- present, sourced from a Connection, not yet owner-adopted (email only)
--   - needs_confirmation  -- the field is genuinely absent; the Owner has not entered it yet
--   - invalid_format      -- present, but fails a basic shape check (business_phone only)
--   - unavailable         -- the READ itself could not be completed (no resolved tenant), with a
--                            reason. Distinct from needs_confirmation: "nothing entered yet" is a
--                            normal, expected state Setup tracks explicitly; "unavailable" means the
--                            contract could not determine an answer at all.
--
-- Always four rows, one per field, every time -- never an empty result -- so a caller never confuses
-- "no signal" with "the read failed silently" (§13).

create or replace function public.get_business_context_readiness(_tenant_id uuid default null)
returns table (
  field_key text,
  status text,
  source text,
  as_of timestamptz,
  reason text
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_uid uuid := auth.uid();
  v_tenant uuid;
  v_legal public.tenant_legal_profile%rowtype;
  v_meta public.tenant_setup_business_context_meta%rowtype;
  v_brand jsonb;
  v_website text;
  v_phone text;
  v_industry text;
  v_email text;
  v_website_confirmed_at timestamptz;
  v_phone_confirmed_at timestamptz;
  v_industry_confirmed_at timestamptz;
  v_digits text;
  v_phone_valid boolean;
begin
  -- The caller may not pass a tenant when a real identity exists (§9/§588): a JWT-authenticated
  -- caller's tenant is ALWAYS server-resolved, never client-supplied. _tenant_id is honored only
  -- for the service-role path, where no JWT identity exists to resolve from.
  if v_uid is not null then
    v_tenant := public.current_user_tenant_id();
  else
    v_tenant := _tenant_id;
  end if;

  if v_tenant is null then
    return query
    select f.field_key, 'unavailable'::text, null::text, null::timestamptz,
           'workspace not resolved'::text
    from unnest(array['website','business_phone','industry','primary_business_email']) as f(field_key);
    return;
  end if;

  -- ROLE GATE (§59 — the EXECUTE grant is never the guard). This capability declares
  -- audience: owner_internal, and a workspace's own CLIENTS are authenticated users of that same
  -- tenant: without this gate, current_user_tenant_id() would happily resolve a client-role
  -- caller's tenant and hand them their coach's setup readiness. Whether the business finished its
  -- own setup is staff-internal, so the same staff-role predicate the Pipeline reference adapter
  -- uses (get_pipeline_spine_evidence, migration 20260902004019) gates this one.
  --
  -- Refused, not empty: this contract's promise is exactly four rows on every call, so a refusal is
  -- four 'unavailable' rows with a reason -- which also leaks nothing about whether any field is
  -- actually confirmed. Callers distinguish "we may not tell you" from "the read broke" by reason.
  -- The service-role path (auth.uid() is null) is unaffected: the Systems Check runners have no
  -- JWT identity to hold a role, and their tenant was already resolved safely by the edge
  -- function's own JWT verification before they call.
  if v_uid is not null
     and not (public.has_any_role(v_uid, array['admin','super_admin','coach']) or public.is_platform_owner())
  then
    return query
    select f.field_key, 'unavailable'::text, null::text, null::timestamptz,
           'not permitted for this account'::text
    from unnest(array['website','business_phone','industry','primary_business_email']) as f(field_key);
    return;
  end if;

  select * into v_legal from public.tenant_legal_profile where tenant_id = v_tenant;
  select * into v_meta from public.tenant_setup_business_context_meta where tenant_id = v_tenant;
  select coalesce(brand, '{}'::jsonb) into v_brand from public.tenants where id = v_tenant;

  v_website := nullif(btrim(coalesce(v_legal.website_url, '')), '');
  v_phone := nullif(btrim(coalesce(v_legal.support_phone, '')), '');
  v_industry := nullif(btrim(coalesce(v_legal.business_industry, '')), '');
  v_email := nullif(btrim(coalesce(v_brand ->> 'support_email', '')), '');

  v_website_confirmed_at := nullif(v_legal.setup_provenance -> 'website' ->> 'confirmedAt', '')::timestamptz;
  v_phone_confirmed_at := nullif(v_legal.setup_provenance -> 'phone' ->> 'confirmedAt', '')::timestamptz;
  v_industry_confirmed_at := nullif(v_legal.setup_provenance -> 'industry' ->> 'confirmedAt', '')::timestamptz;

  -- A basic shape check, not a delivery-grade validator: strip everything but digits and a leading
  -- '+', then require a plausible international digit count. Reuses the same 7-15 digit bound the
  -- platform's own E.164 sender check already applies (comms-purchase-number/index.ts), without
  -- requiring the leading '+' Setup's free-text phone field was never asked to include. No format
  -- validation exists anywhere on the Setup write path today (measured, not assumed) -- this read is
  -- where "malformed" first becomes a real, honestly-reported status.
  if v_phone is not null then
    v_digits := regexp_replace(v_phone, '[^0-9]', '', 'g');
    v_phone_valid := char_length(v_digits) between 7 and 15 and v_phone ~ '^[0-9+\-. ()]+$';
  end if;

  return query
  select 'website'::text,
    case when v_website is not null then 'owner_confirmed' else 'needs_confirmation' end,
    case when v_website is not null then 'setup' else null end,
    v_website_confirmed_at,
    null::text
  union all
  select 'business_phone'::text,
    case
      when v_phone is null then 'needs_confirmation'
      when not v_phone_valid then 'invalid_format'
      else 'owner_confirmed'
    end,
    case when v_phone is not null then 'setup' else null end,
    v_phone_confirmed_at,
    null::text
  union all
  select 'industry'::text,
    case when v_industry is not null then 'owner_confirmed' else 'needs_confirmation' end,
    case when v_industry is not null then 'setup' else null end,
    v_industry_confirmed_at,
    null::text
  union all
  select 'primary_business_email'::text,
    case
      when v_email is null then 'needs_confirmation'
      when coalesce(v_meta.primary_email_provenance ->> 'source', 'connection_sourced') = 'owner_confirmed' then 'owner_confirmed'
      else 'connection_sourced'
    end,
    case
      when v_email is null then null
      when coalesce(v_meta.primary_email_provenance ->> 'source', 'connection_sourced') = 'owner_confirmed' then 'setup'
      else 'connections'
    end,
    nullif(v_meta.primary_email_provenance ->> 'confirmedAt', '')::timestamptz,
    null::text;
end;
$$;

comment on function public.get_business_context_readiness(uuid) is
  'Spine-owned narrow readiness projection over Setup business context (website, business_phone, '
  'industry, primary_business_email): status + provenance only, never the underlying value. '
  'Tenant-authenticated callers (PAIGE/Mind) are server-resolved via current_user_tenant_id() and '
  '_tenant_id is ignored; the service-role path (Systems Check runners) is the only caller that may '
  'pass _tenant_id, honored only because auth.uid() is null there (§59). Always returns exactly four '
  'rows. Setup owns the underlying facts and save/edit behavior; this function never writes.';

revoke all on function public.get_business_context_readiness(uuid) from public, anon;
grant execute on function public.get_business_context_readiness(uuid) to authenticated, service_role;
