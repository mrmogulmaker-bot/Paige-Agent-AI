-- One canonical meaning for "is this business fact on file", shared by both readers that report it.
--
-- THE CONTRADICTION, reproduced on production 2026-09-05 as First Sterling Capital's own owner
-- (tenant 7eaf8859), two days and ~55 merges after it was first recorded:
--
--   get_business_context_readiness  website        -> needs_confirmation   (source null, as_of null)
--   get_business_context_readiness  business_phone -> needs_confirmation   (source null, as_of null)
--   tenant_comms_readiness          has_website    -> true
--   tenant_comms_readiness          has_phone      -> true
--
-- Same workspace, same question, opposite answers. Antonio Daniel LLC (e7f1b157) contradicts on
-- website alone. Both hold the value ONLY in the legacy tenants.brand record, with nothing in Setup
-- and therefore no confirmation event.
--
-- NEITHER READER WAS RIGHT, which is why this is not a choice between their answers. Two
-- independent facts had been compressed into one field:
--
--   A -- does a value exist at all?          For these workspaces: YES.
--   B -- did the owner confirm it in Setup?  For these workspaces: NO.
--
-- tenant_comms_readiness answered A and dropped B. get_business_context_readiness answered B and
-- dropped A. Each was locally defensible and each was lossy, so picking a winner would have
-- preserved one true fact by continuing to erase the other. The canonical state carries BOTH, and
-- once it does the two readers stop disagreeing without either being overruled. Nothing here is
-- special-cased to those two workspaces, and nothing is smoothed over in a UI: the distinction is
-- in the server contract.
--
-- THE STATE THE VOCABULARY WAS MISSING is `legacy_sourced` / source `legacy_brand`: present, only
-- in the legacy brand record, never confirmed. It is not a new idea -- this contract already
-- distinguished `connection_sourced`/`connections` from `owner_confirmed`/`setup` for
-- primary_business_email, which is the same shape ("present, not confirmed, and here is where it
-- came from"). This EXTENDS that vocabulary rather than inventing one (§18).
--
-- WHY A RESOLVER AND NOT "ONE READER CALLS THE OTHER". The two readers do not have the same caller
-- authorization, and the difference is load-bearing:
--
--   get_business_context_readiness  is_tenant_admin(resolved tenant) OR is_platform_owner()  -- scoped
--   tenant_comms_readiness          is_platform_operator() OR has_any_role(uid,[admin,coach]) -- global
--
-- Making either call the other would impose one reader's gate on the other's callers and could
-- silently refuse a persona served today (§58). Measured on production: all 9 users who resolve a
-- workspace pass both gates, so the difference is latent -- and a latent difference is not a licence
-- to collapse the two. So both readers derive the identity facts from ONE internal resolver and each
-- keeps its own gate, its own tenant resolution, and its own response shape.
--
-- THE RESOLVER IS UNREACHABLE BY ANY CALLER. It takes a tenant parameter, so EXECUTE is revoked from
-- PUBLIC, anon and authenticated and granted to nobody: only the already-gated SECURITY DEFINER
-- parents (owned by postgres) can invoke it. A caller therefore cannot supply a tenant, a role, a
-- source, a state or a timestamp that bypasses server-resolved scope -- not because a check rejects
-- it, but because the surface that would accept it is not exposed.
--
-- SECOND CORRECTION, SAME DEFECT CLASS, MEASURED NOT ASSUMED. primary_business_email defaulted to
-- `connection_sourced`/`connections` whenever tenants.brand carried a support_email and no
-- provenance had been recorded. On production ALL THREE workspaces with a support_email are in
-- exactly that position (Antonio Daniel LLC and First Sterling Capital have no meta row at all;
-- Mogul Maker Academy has a row whose primary_email_provenance carries no `source` key). So the
-- reader has been naming a connected account as the proof for a value no connection ever wrote --
-- a source invented from missing data, which is the same untruth this migration exists to remove.
-- A recorded `owner_confirmed` and a recorded `connection_sourced` are both preserved exactly; only
-- the invented default changes, to the state that is actually true: legacy_sourced / legacy_brand.
--
-- WHAT CHANGES FOR CONSUMERS, measured across all 14 production tenants before writing this:
--
--   * Systems Check verdicts: ZERO change. Every runner reads status through isConfirmed()
--     (_business-context-readiness.ts:31), which is true only for owner_confirmed, so
--     legacy_sourced grades exactly as needs_confirmation did.
--   * tenant_comms_readiness has_name / has_website / has_phone: ZERO change. They keep their
--     existing meaning (fact A) and are now derived from the resolver's "a value exists" states
--     rather than re-deriving the same coalesce over raw tables.
--   * get_business_context_readiness gains legacy_sourced where a value demonstrably exists:
--     website on 2 tenants, business_phone on 1, industry on 4, business_name on 1 (business_name
--     is resolver-only -- this reader still returns its same four field_keys), plus the
--     primary_business_email correction on 3.
--   * Both readers gain next_action, so a state that needs something now says what.
--
-- ONE BEHAVIOUR DIFFERENCE, DELIBERATE. tenant_comms_readiness compared with nullif(x,'') while
-- get_business_context_readiness used nullif(btrim(x),''), so a whitespace-only value would have
-- read as present in one reader and absent in the other -- the same contradiction in miniature.
-- The resolver btrims, which is the stricter and more truthful rule. Measured: production holds
-- ZERO whitespace-only values in any of these columns, so no tenant's answer moves today.
--
-- WHAT `stale` IS NOT. No source in this domain declares a freshness TTL -- measured, not assumed.
-- So this resolver reports as_of and never asserts staleness. Choosing a threshold here would be
-- manufacturing a readiness fact, which is the thing being fixed. When a source declares a TTL,
-- staleness is emitted from that declaration and from nowhere else.
--
-- STILL DIVERGENT, NAMED RATHER THAN SILENTLY LEFT: get_tenant_a2p_registration_status().profile
-- echoes tenant_legal_profile with no brand fallback, so for these two workspaces it reports a null
-- website_url. It is an A2P registration echo of raw values rather than a readiness contract, it has
-- zero callers in this repository, and A2P is explicitly out of this release's scope -- so it is
-- recorded as a known third answer in docs/delivery/canonical-readiness-contract.md rather than
-- changed here.

-- ── 1. THE RESOLVER ───────────────────────────────────────────────────────────────────────────
-- Internal only. No gate of its own: both callers gate BEFORE they reach it, and neither can be
-- reached without one. Adding a third gate here would be a second answer to a question the parents
-- already answer differently on purpose.

create or replace function public.business_identity_readiness(_tenant uuid)
returns table (
  fact_key text,
  state text,
  source text,
  as_of timestamptz,
  reason text,
  next_action text
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $fn$
declare
  v_legal public.tenant_legal_profile%rowtype;
  v_meta public.tenant_setup_business_context_meta%rowtype;
  v_brand jsonb;
  v_name_setup text;
  v_name_legacy text;
  v_site_setup text;
  v_site_legacy text;
  v_phone_setup text;
  v_phone_legacy text;
  v_ind_setup text;
  v_ind_legacy text;
  v_email text;
  v_email_source text;
  v_name_at timestamptz;
  v_site_at timestamptz;
  v_phone_at timestamptz;
  v_ind_at timestamptz;
  v_email_at timestamptz;
  v_phone text;
  v_phone_ok boolean;
  -- One wording per state, written once so no consumer invents its own for the same state (§18).
  c_confirm_legacy constant text := 'Open Settings → Setup and confirm this value so the record shows the owner entered it.';
  c_confirm_conn constant text := 'Confirm it in Settings → Setup, or replace it with the correct value.';
  c_enter constant text := 'Enter it in Settings → Setup.';
  c_recheck constant text := 'Re-check the value in Settings → Setup; it cannot be used as entered.';
  c_no_action constant text := 'Nothing to act on until this can be read; do not treat it as missing.';
begin
  -- Absent scope is `unknown`, never a fact. Returning the full fact set rather than zero rows is
  -- the point: zero rows is indistinguishable from "nothing to do".
  if _tenant is null then
    return query
    select f.fact_key, 'unknown'::text, null::text, null::timestamptz,
           'workspace not resolved'::text, c_no_action
    from unnest(array['business_name','website','business_phone','industry','primary_business_email'])
      as f(fact_key);
    return;
  end if;

  select * into v_legal from public.tenant_legal_profile lp where lp.tenant_id = _tenant;
  select * into v_meta from public.tenant_setup_business_context_meta m where m.tenant_id = _tenant;
  select coalesce(t.brand, '{}'::jsonb) into v_brand from public.tenants t where t.id = _tenant;

  -- SETUP is the confirmed record; tenants.brand is the LEGACY one. Held apart rather than
  -- coalesced into a single "value", because which one carried it IS the fact that was being lost.
  v_name_setup := nullif(btrim(coalesce(v_legal.legal_business_name, '')), '');
  v_name_legacy := coalesce(
    nullif(btrim(coalesce(v_brand ->> 'business_name', '')), ''),
    nullif(btrim(coalesce(v_brand ->> 'name', '')), ''));
  v_site_setup := nullif(btrim(coalesce(v_legal.website_url, '')), '');
  v_site_legacy := nullif(btrim(coalesce(v_brand ->> 'website', '')), '');
  v_phone_setup := nullif(btrim(coalesce(v_legal.support_phone, '')), '');
  v_phone_legacy := nullif(btrim(coalesce(v_brand ->> 'business_phone', '')), '');
  v_ind_setup := nullif(btrim(coalesce(v_legal.business_industry, '')), '');
  v_ind_legacy := nullif(btrim(coalesce(v_brand ->> 'industry', '')), '');
  v_email := nullif(btrim(coalesce(v_brand ->> 'support_email', '')), '');

  -- Only a RECORDED provenance names a source. An unrecorded one is not a connection (see the
  -- second-correction note in the header) -- it is a value sitting in the legacy brand record.
  v_email_source := nullif(btrim(coalesce(v_meta.primary_email_provenance ->> 'source', '')), '');

  -- The confirmation timestamps Setup itself writes. 'legalName' is the provenance key the save
  -- path uses for the business name (save_solo_setup_identity, 20261046000000 v_legal_keys) --
  -- confirmed against production, not inferred from the column name.
  v_name_at := nullif(v_legal.setup_provenance -> 'legalName' ->> 'confirmedAt', '')::timestamptz;
  v_site_at := nullif(v_legal.setup_provenance -> 'website' ->> 'confirmedAt', '')::timestamptz;
  v_phone_at := nullif(v_legal.setup_provenance -> 'phone' ->> 'confirmedAt', '')::timestamptz;
  v_ind_at := nullif(v_legal.setup_provenance -> 'industry' ->> 'confirmedAt', '')::timestamptz;
  v_email_at := nullif(v_meta.primary_email_provenance ->> 'confirmedAt', '')::timestamptz;

  -- A shape check, not a delivery-grade validator, applied to whichever record actually carries the
  -- number: the same 7-15 digit bound the platform's own E.164 sender check uses
  -- (comms-purchase-number/index.ts), without requiring the leading '+' Setup never asked for.
  v_phone := coalesce(v_phone_setup, v_phone_legacy);
  if v_phone is not null then
    v_phone_ok := char_length(regexp_replace(v_phone, '[^0-9]', '', 'g')) between 7 and 15
                  and v_phone ~ '^[0-9+\-. ()]+$';
  end if;

  return query
  select 'business_name'::text,
    case when v_name_setup is not null then 'owner_confirmed'
         when v_name_legacy is not null then 'legacy_sourced'
         else 'needs_confirmation' end,
    case when v_name_setup is not null then 'setup'
         when v_name_legacy is not null then 'legacy_brand'
         else null end,
    case when v_name_setup is not null then v_name_at else null end,
    null::text,
    case when v_name_setup is not null then null
         when v_name_legacy is not null then c_confirm_legacy
         else c_enter end
  union all
  select 'website'::text,
    case when v_site_setup is not null then 'owner_confirmed'
         when v_site_legacy is not null then 'legacy_sourced'
         else 'needs_confirmation' end,
    case when v_site_setup is not null then 'setup'
         when v_site_legacy is not null then 'legacy_brand'
         else null end,
    case when v_site_setup is not null then v_site_at else null end,
    null::text,
    case when v_site_setup is not null then null
         when v_site_legacy is not null then c_confirm_legacy
         else c_enter end
  union all
  -- invalid_format keeps the REAL source and the REAL time of the value it is judging: the fact
  -- that it is unusable does not erase where it came from.
  select 'business_phone'::text,
    case when v_phone is null then 'needs_confirmation'
         when not v_phone_ok then 'invalid_format'
         when v_phone_setup is not null then 'owner_confirmed'
         else 'legacy_sourced' end,
    case when v_phone is null then null
         when v_phone_setup is not null then 'setup'
         else 'legacy_brand' end,
    case when v_phone_setup is not null then v_phone_at else null end,
    null::text,
    case when v_phone is null then c_enter
         when not v_phone_ok then c_recheck
         when v_phone_setup is not null then null
         else c_confirm_legacy end
  union all
  select 'industry'::text,
    case when v_ind_setup is not null then 'owner_confirmed'
         when v_ind_legacy is not null then 'legacy_sourced'
         else 'needs_confirmation' end,
    case when v_ind_setup is not null then 'setup'
         when v_ind_legacy is not null then 'legacy_brand'
         else null end,
    case when v_ind_setup is not null then v_ind_at else null end,
    null::text,
    case when v_ind_setup is not null then null
         when v_ind_legacy is not null then c_confirm_legacy
         else c_enter end
  union all
  select 'primary_business_email'::text,
    case when v_email is null then 'needs_confirmation'
         when v_email_source = 'owner_confirmed' then 'owner_confirmed'
         when v_email_source = 'connection_sourced' then 'connection_sourced'
         else 'legacy_sourced' end,
    case when v_email is null then null
         when v_email_source = 'owner_confirmed' then 'setup'
         when v_email_source = 'connection_sourced' then 'connections'
         else 'legacy_brand' end,
    case when v_email is null then null
         when v_email_source is null then null
         else v_email_at end,
    null::text,
    case when v_email is null then c_enter
         when v_email_source = 'owner_confirmed' then null
         when v_email_source = 'connection_sourced' then c_confirm_conn
         else c_confirm_legacy end;
end;
$fn$;

comment on function public.business_identity_readiness(uuid) is
  'INTERNAL canonical resolver for business identity readiness: one state + source + as_of + '
  'next_action per fact (business_name, website, business_phone, industry, primary_business_email), '
  'never the underlying value. Deliberately UNREACHABLE by any caller -- EXECUTE is revoked from '
  'PUBLIC, anon and authenticated and granted to nobody, so only the already-gated SECURITY DEFINER '
  'readers that own it can invoke it and no caller can supply the tenant it takes. It carries no '
  'gate of its own because its two callers gate differently on purpose: '
  'get_business_context_readiness is tenant-scoped, tenant_comms_readiness is global (§59). Never '
  'asserts staleness: no source in this domain declares a TTL, and inventing one would manufacture '
  'the kind of readiness fact this resolver exists to stop.';

revoke all on function public.business_identity_readiness(uuid) from public, anon, authenticated;

-- ── 2. get_business_context_readiness -- same gate, same four fields, canonical states ───────────
-- Adding next_action to a `returns table` requires a drop-and-recreate. The gate, the tenant
-- resolution, the refusal shape and the four field_keys are unchanged; next_action is APPENDED so
-- any positional consumer keeps its existing offsets.

drop function if exists public.get_business_context_readiness(uuid);

create or replace function public.get_business_context_readiness(_tenant_id uuid default null)
returns table (
  field_key text,
  status text,
  source text,
  as_of timestamptz,
  reason text,
  tenant_id uuid,
  next_action text
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $fn$
declare
  v_uid uuid := auth.uid();
  v_tenant uuid;
begin
  -- Unchanged (§9/§588): a JWT-authenticated caller's tenant is ALWAYS server-resolved and
  -- _tenant_id is ignored. It is honored only on the service-role path, where auth.uid() is null
  -- and there is no identity to resolve from.
  if v_uid is not null then
    v_tenant := public.current_user_tenant_id();
  else
    v_tenant := _tenant_id;
  end if;

  if v_tenant is null then
    return query
    select f.field_key, 'unavailable'::text, null::text, null::timestamptz,
           'workspace not resolved'::text, null::uuid,
           'Nothing to act on until this can be read; do not treat it as missing.'::text
    from unnest(array['website','business_phone','industry','primary_business_email']) as f(field_key);
    return;
  end if;

  -- ROLE GATE, unchanged from 20261170000000 including its measurement: TENANT-SCOPED on purpose,
  -- because user_roles carries no tenant_id and a global role both wrongly admits (an admin of
  -- workspace X resolving workspace Y) and wrongly refuses (a freshly provisioned Solo owner holds
  -- only the base 'user' role). A refusal is the full four rows as 'unavailable' with a reason, so
  -- it leaks nothing about whether any field is confirmed and is still distinguishable from a
  -- broken read.
  if v_uid is not null
     and not (public.is_tenant_admin(v_tenant) or public.is_platform_owner())
  then
    return query
    select f.field_key, 'unavailable'::text, null::text, null::timestamptz,
           'not permitted for this account'::text, v_tenant,
           'Nothing to act on until this can be read; do not treat it as missing.'::text
    from unnest(array['website','business_phone','industry','primary_business_email']) as f(field_key);
    return;
  end if;

  -- Every fact now comes from the ONE resolver, so this reader and tenant_comms_readiness cannot
  -- derive different answers from the same source. business_name is deliberately NOT surfaced here:
  -- this contract promises exactly these four field_keys and consumers map by key (§58).
  return query
  select r.fact_key, r.state, r.source, r.as_of, r.reason, v_tenant, r.next_action
    from public.business_identity_readiness(v_tenant) r
   where r.fact_key in ('website','business_phone','industry','primary_business_email');
end;
$fn$;

comment on function public.get_business_context_readiness(uuid) is
  'Spine-owned narrow readiness projection over Setup business context (website, business_phone, '
  'industry, primary_business_email): status + provenance + next step only, never the underlying '
  'value. Derives every fact from public.business_identity_readiness, the ONE canonical resolver '
  'tenant_comms_readiness also reads, so the two can no longer disagree about the same workspace. '
  'Each row names the workspace it was resolved for so a Chat caller can prove the rows belong to '
  'the conversation it is in -- get_paige_persona_context() resolves a linked CLIENT''s workspace '
  'ahead of current_user_tenant_id(), so the two can differ (§9). Tenant-authenticated callers are '
  'server-resolved via current_user_tenant_id() and _tenant_id is ignored; the service-role path '
  '(Systems Check runners) is the only caller that may pass _tenant_id, honored only because '
  'auth.uid() is null there (§59). Always returns exactly four rows. Setup owns the underlying '
  'facts and save/edit behavior; this function never writes.';

revoke all on function public.get_business_context_readiness(uuid) from public, anon;
grant execute on function public.get_business_context_readiness(uuid) to authenticated, service_role;

-- ── 3. "A VALUE EXISTS" -- the one place fact A is decided ────────────────────────────────────
-- A pure classifier over a state string: no data access, no tenant, nothing to leak. It exists so
-- the boolean half of the contract is decided once rather than re-listed at each call site, which
-- is how the two halves drifted apart in the first place.

create or replace function public.business_identity_value_present(_state text)
returns boolean
language sql
immutable
as $fn$
  -- invalid_format is TRUE on purpose: a malformed phone is still a phone on file, which is exactly
  -- what this boolean has always meant. needs_confirmation is FALSE (no value anywhere), and
  -- unavailable / unknown are FALSE because a read that did not happen is not an absent value --
  -- the caller distinguishes them by the state itself, which is why the state ships alongside.
  select _state in ('owner_confirmed', 'connection_sourced', 'legacy_sourced', 'invalid_format');
$fn$;

comment on function public.business_identity_value_present(text) is
  'Fact A of the canonical readiness contract: does a value exist at all, decided once from a '
  'business_identity_readiness state. Pure classifier over a string -- no data access, no tenant. '
  'A false answer never means "confirmed"; the state itself distinguishes absent from unreadable.';

-- ── 4. tenant_comms_readiness -- same shape, same gate, plus the half it was missing ──────────
-- CREATE OR REPLACE with no signature change. The credential predicate, the number predicate, the
-- A2P and consent logic, the delivery ledger read, the billing block, blocked_reason and every
-- existing key are untouched. Exactly two things change: the three business booleans are now read
-- from the canonical resolver instead of re-derived from raw tables (same values, measured), and a
-- sibling `business_provenance` block carries the state/source/freshness/next step the booleans
-- structurally could not.
create or replace function public.tenant_comms_readiness()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_tenant        uuid;
  v_sub           record;
  v_num           record;
  v_a2p           record;
  v_consent_count int := 0;
  v_suppressed    int := 0;
  v_identity      jsonb := '{}'::jsonb;
  v_sms_total     int := 0;
  v_sms_failed    int := 0;
  v_sms_delivered int := 0;
  v_last_inbound  timestamptz;
  v_delivery      text;
  v_blocked       text;
  v_billing       record;
  v_metered_30d   int := 0;
begin
  -- CALLER SCOPE ENFORCED IN-BODY (§59). This is SECURITY DEFINER because it
  -- reads tenant_twilio_subaccounts, which authenticated no longer holds a
  -- grant on. The grant is not the guard.
  if auth.uid() is null then
    raise exception 'COMMS_READINESS_UNAUTHENTICATED' using errcode = '42501';
  end if;
  v_tenant := public.current_user_tenant_id();
  if v_tenant is null then
    raise exception 'COMMS_READINESS_NO_TENANT' using errcode = '42501';
  end if;
  if not (public.is_platform_operator()
          or public.has_any_role(auth.uid(), array['admin','coach'])) then
    raise exception 'COMMS_READINESS_FORBIDDEN' using errcode = '42501';
  end if;

  -- Selects the same three credential fields `resolveTwilioCreds` requires. It is
  -- their PRESENCE, not `status`/`active`, that decides whether a send can
  -- authenticate — the creds resolver reads `status` and never uses it. Reporting
  -- "connected" from status alone would let a row with a null api_key_sid render
  -- "Ready to text" while every send returns twilio_subaccount_api_key_missing.
  select tenant_id, status, active,
         (twilio_subaccount_sid is not null
          and auth_token_vault_ref is not null
          and api_key_sid is not null) as creds_complete
    into v_sub
    from public.tenant_twilio_subaccounts
   where tenant_id = v_tenant
   limit 1;

  -- The SAME predicate send-message enforces: active, SMS-capable, primary first.
  select phone_number, status, capabilities into v_num
    from public.tenant_phone_numbers
   where tenant_id = v_tenant
     and status = 'active'
     -- No ::boolean cast: `{"sms":"yes"}` would raise and take the whole read
     -- down. Absent or JSON-null means unspecified, which the send path includes.
     and coalesce(nullif(capabilities->'sms', 'null'::jsonb), 'true'::jsonb) = 'true'::jsonb
   order by is_primary desc, purchased_at desc nulls last
   limit 1;

  select status, brand_status, campaign_status, submitted_at into v_a2p
    from public.tenant_a2p_registrations
   where tenant_id = v_tenant
   limit 1;

  -- How many recipients CURRENTLY consent — the latest event per recipient, which
  -- is what `runPreSend` step 3 evaluates. A raw count of 'granted' rows would
  -- report "ready" for a contact who granted and later texted STOP.
  select count(*) into v_consent_count
    from (
      select distinct on (coalesce(contact_id::text, address_normalized))
             action
        from public.paige_consent_events
       where tenant_id = v_tenant and channel = 'sms'
       order by coalesce(contact_id::text, address_normalized), created_at desc
    ) latest
   where latest.action = 'granted';

  select count(*) into v_suppressed
    from public.paige_suppressions
   where tenant_id = v_tenant and channel = 'sms';

  -- THE ONE canonical resolver, replacing this function's own coalesce over tenants.brand and
  -- tenant_legal_profile. Those two raw reads were how this reader could answer the same question
  -- differently from get_business_context_readiness for the same workspace; now neither reader
  -- derives identity, they both read it. Aggregated into jsonb here because it is rendered as
  -- jsonb below.
  select coalesce(jsonb_object_agg(r.fact_key, jsonb_build_object(
           'state', r.state, 'source', r.source, 'as_of', r.as_of, 'next_action', r.next_action)),
         '{}'::jsonb)
    into v_identity
    from public.business_identity_readiness(v_tenant) r
   where r.fact_key in ('business_name','website','business_phone');

  -- Delivery signal, read from real message rows. This is NOT a claim about
  -- webhook registration — it reports only what the message ledger shows.
  select count(*) filter (where direction = 'outbound'),
         count(*) filter (where direction = 'outbound' and status = 'failed'),
         count(*) filter (where direction = 'outbound' and status = 'delivered'),
         max(sent_at) filter (where direction = 'inbound')
    into v_sms_total, v_sms_failed, v_sms_delivered, v_last_inbound
    from public.messages
   where tenant_id = v_tenant
     and channel_type = 'sms'
     and created_at > now() - interval '30 days';

  v_delivery := case
    when v_sms_total = 0 then 'no_activity'
    when v_sms_failed > 0 and v_sms_delivered = 0 then 'failing'
    when v_sms_failed > 0 then 'mixed'
    -- Sent, but not one delivery receipt has landed. Calling that "delivering"
    -- would be a green health claim built on the ABSENCE of evidence.
    when v_sms_delivered = 0 then 'awaiting_receipts'
    else 'delivering'
  end;

  -- Billing for messaging. Settings -> Connections owns billing setup, so the one
  -- canonical record has to carry it rather than leaving the surface to invent an
  -- answer. Read-only: this REPORTS billing state and never activates, changes or
  -- charges anything.
  --
  -- SCOPED EXPLICITLY to v_tenant. This function is SECURITY DEFINER, so it
  -- bypasses platform_subscriptions' RLS entirely; the `where tenant_id` below IS
  -- the access control, not the policy (§59 — the grant is never the guard).
  --
  -- Returns NO provider identifier. stripe_subscription_id and stripe_customer_id
  -- are deliberately not selected: a Stripe id is a provider payload, and this
  -- record is consumed by surfaces and by PAIGE.
  select ps.status,
         ps.current_period_end,
         coalesce(ps.cancel_at_period_end, false) as cancel_at_period_end,
         pl.name as plan_name
    into v_billing
    from public.platform_subscriptions ps
    left join public.platform_subscription_plans pl on pl.id = ps.plan_id
   where ps.tenant_id = v_tenant
   order by (ps.status = 'active') desc, ps.current_period_end desc nulls last
   limit 1;

  -- Whether messaging usage is actually being RECORDED against that plan. Nothing
  -- has ever written a platform_metered_events row, so for every tenant today this
  -- resolves to not_recording. Reporting "billed" off an active plan alone would
  -- claim metering that demonstrably is not happening (§13).
  select count(*) into v_metered_30d
    from public.platform_metered_events
   where tenant_id = v_tenant
     and created_at > now() - interval '30 days';

  -- The blocking reason, in send-path order, so the surface can name ONE next step.
  --
  -- Billing is deliberately NOT a term here. This resolver's contract is that it
  -- enforces the SAME predicate send-message enforces, and send-message does not
  -- consult billing. Adding it would make can_send_sms disagree with what the send
  -- path actually does — a readiness record that contradicts the runtime is worse
  -- than one that reports less. Billing is reported, never gating.
  v_blocked := case
    when v_sub.tenant_id is null            then 'messaging_account_missing'
    when v_sub.creds_complete is not true    then 'messaging_account_inactive'
    when v_num.phone_number is null         then 'no_sms_number'
    when v_a2p.status is null               then 'registration_absent'
    when v_a2p.status <> 'approved'         then 'registration_not_approved'
    when v_consent_count = 0                then 'no_consent_recorded'
    else null
  end;

  return jsonb_build_object(
    'can_send_sms',   v_blocked is null,
    'blocked_reason', v_blocked,
    'subaccount',     case when v_sub.tenant_id is null then 'absent'
                           when v_sub.creds_complete is not true then 'inactive'
                           when coalesce(v_sub.active,false) and coalesce(v_sub.status,'') = 'active' then 'connected'
                           else 'inactive' end,
    'number',         case when v_num.phone_number is null then 'absent' else 'assigned' end,
    'number_e164',    v_num.phone_number,
    -- FACT A -- "is there a value on file at all". UNCHANGED in meaning and, measured across all
    -- 14 production tenants, unchanged in value for every one of them: the states below are exactly
    -- the ones that mean a value exists, including invalid_format (a malformed phone IS a phone on
    -- file, which is what this boolean has always said). What changes is only that they are read
    -- from the canonical resolver instead of re-derived here.
    'business',       jsonb_build_object(
                        'has_name',    public.business_identity_value_present(v_identity -> 'business_name' ->> 'state'),
                        'has_website', public.business_identity_value_present(v_identity -> 'website' ->> 'state'),
                        'has_phone',   public.business_identity_value_present(v_identity -> 'business_phone' ->> 'state')),
    -- FACT B -- "and where did it come from". This is the half the boolean could never express, and
    -- its absence is why this reader and get_business_context_readiness contradicted each other for
    -- two real workspaces: a value present only in the legacy brand record read here as an
    -- indistinguishable `true`, exactly like an owner-confirmed one -- and so did a FAILED read.
    -- A consumer can now tell those three apart, and both readers now report the same state, source
    -- and freshness for the same workspace because they read the same resolver.
    'business_provenance', v_identity,
    'a2p',            case when v_a2p.status is null then 'absent'
                           when v_a2p.status = 'approved' then 'approved'
                           when v_a2p.submitted_at is not null then 'submitted'
                           else 'prepared' end,
    'consent',        jsonb_build_object(
                        'granted_count',    v_consent_count,
                        'suppressed_count', v_suppressed,
                        'state', case when v_consent_count = 0 then 'none_recorded' else 'ready' end),
    'delivery',       jsonb_build_object(
                        'state',           v_delivery,
                        'sent_30d',        v_sms_total,
                        'delivered_30d',   v_sms_delivered,
                        'failed_30d',      v_sms_failed,
                        -- NOT REPORTED, deliberately: nothing writes an inbound
                        -- SMS row to public.messages (handle-inbound-sms inserts
                        -- into paige_conversations), so this column is
                        -- structurally always null. A definite "no replies
                        -- received" from an unwritten column is the same class of
                        -- lie as a fabricated positive.
                        'last_inbound_at', v_last_inbound,
                        'inbound_reporting', 'unavailable'),
    'billing',        jsonb_build_object(
                        'subscription', case
                                          when v_billing.status is null then 'absent'
                                          when v_billing.status = 'active' then 'active'
                                          else 'inactive' end,
                        'plan_name',            v_billing.plan_name,
                        'period_end',           v_billing.current_period_end,
                        'cancel_at_period_end', coalesce(v_billing.cancel_at_period_end, false),
                        -- Honest today: nothing writes platform_metered_events, so
                        -- this is 'not_recording' for every tenant. It is reported
                        -- rather than hidden so the surface can say messaging usage
                        -- is not being metered instead of implying that it is.
                        'usage_metering', case when v_metered_30d > 0
                                               then 'recording' else 'not_recording' end,
                        'metered_events_30d', v_metered_30d),
    'tenant_id',      v_tenant,
    'resolved_at',    now()
  );
end;
$$;

comment on function public.tenant_comms_readiness() is
  'Canonical comms readiness for the calling workspace, server-resolved via '
  'current_user_tenant_id() and gated in-body (§59). The `business` booleans answer fact A -- a '
  'value is on file -- and the sibling `business_provenance` block answers fact B -- which record '
  'it came from, when it was confirmed, and what to do next. Both are derived from '
  'public.business_identity_readiness, the same resolver get_business_context_readiness reads, so '
  'the two readers can no longer give different answers about the same workspace.';

revoke all on function public.tenant_comms_readiness() from public, anon;
grant execute on function public.tenant_comms_readiness() to authenticated, service_role;
