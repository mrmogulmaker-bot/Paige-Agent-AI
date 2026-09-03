-- Both readiness reads name the workspace they resolved, so a caller can PROVE the rows belong to
-- the conversation it is in.
--
-- THE DEFECT (found by an independent review of PR #876; latent today, structural and certain to
-- fire). public.get_paige_persona_context() resolves the conversation's tenant CLIENT-LINK FIRST:
--
--     select c.tenant_id into _tid from public.clients c where c.linked_user_id = auth.uid() ...
--     if _tid is null then _tid := public.current_user_tenant_id(); end if;
--
-- so a user who is a linked CLIENT of workspace B and an active TEAM MEMBER of workspace A gets a
-- conversation scoped to B -- B's persona, B's brand, B's voice -- while these readiness reads
-- resolve A through current_user_tenant_id(). The chat call sites gated only on "the persona has
-- SOME tenant", so A's setup status and A's authority could be asserted inside B's conversation and
-- against B's tenant-attributed trace. A cross-workspace statement in the prompt (§9).
--
-- The Team hydration path never had this hole: buildTenantTeamContextBlock compares the payload's
-- tenant_id against personaCtx.tenant_id and returns null on mismatch (_shared/team-context.ts:71).
-- It could do that because get_paige_team_context() RETURNS its tenant. These two reads did not, so
-- there was nothing to compare -- the binding was impossible rather than merely omitted.
--
-- MEASURED BEFORE FIXING, so the severity is not guessed: production carries ZERO rows with
-- clients.linked_user_id set, so the client-link branch never fires and no user can trigger this
-- today. It is latent. It is also certain to stop being latent the moment a client portal user is
-- linked, which is the product's core purpose (§7).
--
-- THE FIX is the smallest one that makes the binding provable rather than assumed: each read now
-- returns the workspace it resolved, and each Chat adapter renders NOTHING when that workspace is
-- not the conversation's. Returning it leaks nothing -- it is the caller's own workspace, and the
-- Team read has always returned it for this exact purpose.
--
-- get_business_context_readiness is LIVE (20261112000000, merge 7ad98cff), so adding a column to a
-- `returns table` requires a drop-and-recreate; the body below was reproduced byte-exactly from the
-- deployed definition (md5 676d4c4f7c2096fd866e264f836d1d4f, 6664 chars) and the only edits are the
-- signature and the six places a row is built. §37 consumers: the Systems Check runner helper maps
-- rows by field_key and picks named fields, so an added column is inert for it; the Chat adapter is
-- updated in the same change.

drop function if exists public.get_business_context_readiness(uuid);

create or replace function public.get_business_context_readiness(_tenant_id uuid default null)
returns table (
  field_key text,
  status text,
  source text,
  as_of timestamptz,
  reason text,
  -- The workspace these rows describe. Returned so a CALLER can prove the rows belong to the
  -- conversation it is in -- see the header note on the persona/current_user_tenant_id divergence.
  -- Leaks nothing: it is the caller's own resolved workspace, and get_paige_team_context() has
  -- always returned it for exactly this purpose.
  tenant_id uuid
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
           'workspace not resolved'::text, null::uuid
    from unnest(array['website','business_phone','industry','primary_business_email']) as f(field_key);
    return;
  end if;

  -- ROLE GATE (§59 — the EXECUTE grant is never the guard). This capability declares
  -- audience: owner_internal, and a workspace's own CLIENTS are authenticated users of that same
  -- tenant: without this gate, current_user_tenant_id() would happily resolve a client-role
  -- caller's tenant and hand them their coach's setup readiness. Whether the business finished its
  -- own setup is staff-internal.
  --
  -- The predicate is TENANT-SCOPED (is_tenant_admin on the RESOLVED tenant), deliberately NOT the
  -- global has_any_role() check the Pipeline reference adapter uses. `user_roles` carries no
  -- tenant_id, so a global role answers the wrong question in both directions (§59's global-role
  -- trap):
  --   * it can WRONGLY ADMIT — someone who is 'admin' because of workspace X passes the gate while
  --     resolving workspace Y, where they may be only a member or a client;
  --   * it can WRONGLY REFUSE — the current deferred-signup path
  --     (record_signup_acceptance / provision_tenant, migration 20260808190000) grants a new owner
  --     the BASE role 'user' and nothing else, so a freshly provisioned Solo owner holds no
  --     'admin'/'coach' row at all. A global gate would silently refuse the exact persona this
  --     capability exists for, and the failure mode is invisible (PAIGE just says nothing).
  -- Measured on prod before choosing (2026-09-03): of the 7 users who resolve a tenant, the global
  -- gate and this tenant-scoped gate admit the SAME 7 — 0 wrongly admitted, 0 wrongly refused. So
  -- this is a no-op for every current user and closes both holes going forward.
  --
  -- Refused, not empty: this contract's promise is exactly four rows on every call, so a refusal is
  -- four 'unavailable' rows with a reason -- which also leaks nothing about whether any field is
  -- actually confirmed. Callers distinguish "we may not tell you" from "the read broke" by reason.
  -- The service-role path (auth.uid() is null) is unaffected: the Systems Check runners have no
  -- JWT identity to hold a role, and their tenant was already resolved safely by the edge
  -- function's own JWT verification before they call.
  if v_uid is not null
     and not (public.is_tenant_admin(v_tenant) or public.is_platform_owner())
  then
    return query
    select f.field_key, 'unavailable'::text, null::text, null::timestamptz,
           'not permitted for this account'::text, v_tenant
    from unnest(array['website','business_phone','industry','primary_business_email']) as f(field_key);
    return;
  end if;

  -- Table-qualified: `tenant_id` is now also an OUT parameter of this function (it is in the
  -- RETURNS TABLE above), so a bare reference here is ambiguous between the column and the variable
  -- and Postgres refuses at RUNTIME, not at create time.
  select * into v_legal from public.tenant_legal_profile
   where tenant_legal_profile.tenant_id = v_tenant;
  select * into v_meta from public.tenant_setup_business_context_meta
   where tenant_setup_business_context_meta.tenant_id = v_tenant;
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
    null::text,
    v_tenant
  union all
  select 'business_phone'::text,
    case
      when v_phone is null then 'needs_confirmation'
      when not v_phone_valid then 'invalid_format'
      else 'owner_confirmed'
    end,
    case when v_phone is not null then 'setup' else null end,
    v_phone_confirmed_at,
    null::text,
    v_tenant
  union all
  select 'industry'::text,
    case when v_industry is not null then 'owner_confirmed' else 'needs_confirmation' end,
    case when v_industry is not null then 'setup' else null end,
    v_industry_confirmed_at,
    null::text,
    v_tenant
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
    null::text,
    v_tenant;
end;
$$;

comment on function public.get_business_context_readiness(uuid) is
  'Spine-owned narrow readiness projection over Setup business context (website, business_phone, '
  'industry, primary_business_email): status + provenance only, never the underlying value. Each row '
  'also names the workspace it was resolved for, so a Chat caller can prove the rows belong to the '
  'conversation it is in -- get_paige_persona_context() resolves a linked CLIENT''s workspace ahead '
  'of current_user_tenant_id(), so the two can differ and an unbound block would speak about the '
  'wrong workspace (§9). Tenant-authenticated callers are server-resolved via current_user_tenant_id() '
  'and _tenant_id is ignored; the service-role path (Systems Check runners) is the only caller that '
  'may pass _tenant_id, honored only because auth.uid() is null there (§59). Always returns exactly '
  'four rows. Setup owns the underlying facts and save/edit behavior; this function never writes.';

revoke all on function public.get_business_context_readiness(uuid) from public, anon;
grant execute on function public.get_business_context_readiness(uuid) to authenticated, service_role;
