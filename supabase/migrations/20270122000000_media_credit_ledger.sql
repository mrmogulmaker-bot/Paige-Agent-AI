-- =============================================================================
-- VIBE MEDIA CREDIT LEDGER — the durable, tenant-scoped customer-facing meter
-- for Vibe Media usage (owner build authorization 2026-09-12; economics study
-- same day; adversarial schema review folded in the same day).
--
-- MODEL (append-only, closure semantics — the money-truth M1-a precedent):
--   grant_included  (month-scoped, lazily minted monthly, idempotent per month)
--   grant_purchased (never expires; unique key per grant — no silent pack loss)
--   hold            (reserves credits for a job, included/purchased split recorded)
--   consume         (the actual draw — CLOSES its hold; a low estimate returns
--                    the difference automatically, an overage draws on and is
--                    RETURNED flagged, never silently negative)
--   release         (closes a hold ONLY for jobs that verifiably never reached
--                    the provider — the anti-leakage gate; a submitted job that
--                    failed CONSUMES, because fal already charged)
--   expire          (month rollover: prior-month unconsumed AND unreserved
--                    included credits lapse; purchased never expire)
--   adjust          (owner correction, ADDITIVE ONLY by recorded decision — a
--                    deduction is an owner conversation, never a signed row)
--
-- A hold is CLOSED iff a consume or release row with the same job_id exists.
-- Open holds reserve; consumes draw; releases only close (credits return by
-- closure, so the formula never subtracts releases). Consume/release COPY the
-- hold's month_bucket: included credits belong to the month they were granted
-- from, even when the job closes after rollover.
--
-- APPEND-ONLY IS STRUCTURAL: a trigger raises on UPDATE/DELETE/TRUNCATE — RLS
-- does not stop the table owner, and a SECURITY DEFINER fn runs AS the owner
-- (the money-truth lesson). service_role gets SELECT, INSERT — never
-- UPDATE/DELETE. Parents are RESTRICT: an immutable financial audit blocks
-- hard-deletion of tenants and jobs.
--
-- PLATFORM SPEND GUARD: media_spend_ceiling_usd (admin_app_settings) is the
-- ENFORCED platform-wide daily cap — checked INSIDE media_credit_hold under a
-- global-class advisory lock, so concurrent tenants cannot both spend past it.
-- media_provider_ceiling_usd stays what it always was: a backward-compatible
-- ACTIVATION gate, never a spend cap.
-- =============================================================================

create table if not exists public.paige_media_credit_entries (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null references public.tenants(id) on delete restrict,
  entry_type       text not null check (entry_type in
                     ('grant_included','grant_purchased','hold','consume','release','expire','adjust')),
  -- Magnitude only; direction is implied by entry_type; every real movement is
  -- positive (adjust is additive-only by recorded owner decision).
  credits          int not null check (credits > 0),
  job_id           uuid references public.paige_media_jobs(id) on delete restrict,
  -- One namespace across ALL entry types: 'grant:t:<tenant>:<YYYY-MM>',
  -- 'expire:t:<tenant>:<YYYY-MM>', 'grant:t:<tenant>:purchased:<uuid>',
  -- 'hold:<job>', 'consume:<job>', 'release:<job>'. Same key = one movement.
  idempotency_key  text not null unique,
  -- UTC 'YYYY-MM' for grant_included/expire, and (copied from the hold) for
  -- hold/consume/release. Null for grant_purchased/adjust (all-time pools).
  month_bucket     text,
  included_credits int not null default 0,
  purchased_credits int not null default 0,
  source           text not null default 'system',  -- system | owner | pack:<id>
  reason           text,
  created_by       uuid references auth.users(id) on delete set null,
  created_at       timestamptz not null default now(),
  constraint pmce_month_shape check (
    (entry_type in ('grant_included','expire','hold','consume','release') and month_bucket ~ '^[0-9]{4}-[0-9]{2}$')
    or (entry_type in ('grant_purchased','adjust') and month_bucket is null)
  ),
  constraint pmce_split_sums check (
    entry_type not in ('hold','consume','release')
    or (included_credits >= 0 and purchased_credits >= 0 and included_credits + purchased_credits = credits)
  ),
  constraint pmce_split_zero_on_non_moves check (
    entry_type not in ('grant_purchased','adjust')
    or (included_credits = 0 and purchased_credits = 0)
  ),
  constraint pmce_job_on_moves check (
    entry_type not in ('hold','consume','release') or job_id is not null
  )
);

create index if not exists idx_pmce_tenant_created
  on public.paige_media_credit_entries (tenant_id, created_at desc);
-- Closure scan: a hold is open iff no consume/release shares its job_id.
create index if not exists idx_pmce_moves_by_job
  on public.paige_media_credit_entries (job_id)
  where entry_type in ('hold','consume','release');
-- Balance open-hold scan per tenant+month.
create index if not exists idx_pmce_open_holds
  on public.paige_media_credit_entries (tenant_id, month_bucket)
  where entry_type = 'hold';
-- The platform-wide daily spend scan (media_spend_today_all).
create index if not exists idx_pmj_submitted_day
  on public.paige_media_jobs (submitted_at)
  where submitted_at is not null;

alter table public.paige_media_credit_entries enable row level security;
-- Append-only even for service_role: SELECT + INSERT, never UPDATE/DELETE.
grant select, insert on public.paige_media_credit_entries to service_role;

drop policy if exists pmce_read on public.paige_media_credit_entries;
create policy pmce_read on public.paige_media_credit_entries for select to authenticated
  using (tenant_id = public.current_user_tenant_id());
drop policy if exists pmce_no_direct_insert on public.paige_media_credit_entries;
create policy pmce_no_direct_insert on public.paige_media_credit_entries for insert to authenticated
  with check (false);
drop policy if exists pmce_no_direct_update on public.paige_media_credit_entries;
create policy pmce_no_direct_update on public.paige_media_credit_entries for update to authenticated
  using (false) with check (false);
drop policy if exists pmce_no_direct_delete on public.paige_media_credit_entries;
create policy pmce_no_direct_delete on public.paige_media_credit_entries for delete to authenticated
  using (false);
drop policy if exists pmce_service_append on public.paige_media_credit_entries;
create policy pmce_service_append on public.paige_media_credit_entries for insert to service_role
  with check (true);
drop policy if exists pmce_service_read on public.paige_media_credit_entries;
create policy pmce_service_read on public.paige_media_credit_entries for select to service_role
  using (true);

-- APPEND-ONLY (structural): nobody — including the owner role and SECURITY
-- DEFINER functions — rewrites financial history. TRUNCATE is the statement-
-- level bypass a row trigger misses, so both are covered (money-truth idiom).
create or replace function public.pmce_append_only_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  raise exception 'paige_media_credit_entries is append-only: % is not permitted on the media credit ledger', tg_op
    using errcode = 'restrict_violation';
end;
$$;
revoke all on function public.pmce_append_only_guard() from public, anon, authenticated, service_role;

drop trigger if exists trg_pmce_append_only on public.paige_media_credit_entries;
create trigger trg_pmce_append_only before update or delete on public.paige_media_credit_entries
  for each row execute function public.pmce_append_only_guard();
drop trigger if exists trg_pmce_no_truncate on public.paige_media_credit_entries;
create trigger trg_pmce_no_truncate before truncate on public.paige_media_credit_entries
  for each statement execute function public.pmce_append_only_guard();

-- -----------------------------------------------------------------------------
-- Config-as-data seeds (visible to operators where every other media knob
-- lives; the seam still carries code defaults for absent keys).
-- -----------------------------------------------------------------------------
insert into public.admin_app_settings (key, value)
values ('media_credits_included_monthly', '300'),
       ('media_credit_usd', '0.01'),
       ('media_spend_ceiling_usd', '25')
on conflict (key) do nothing;

-- -----------------------------------------------------------------------------
-- Internals. Every writer serializes on a REAL tenant row (FOR UPDATE — the
-- execution-substrate idiom: the row always exists, needs no lock-class
-- discipline, and releases at commit), then rolls the month, then acts.
-- Failures write NOTHING and return ok:false.
-- -----------------------------------------------------------------------------

create or replace function public.__media_credit_month(ts timestamptz default now())
returns text language sql immutable as $$
  select to_char(ts at time zone 'utc', 'YYYY-MM');
$$;

-- Roll = lazy mint (current month) + lazy expire (ALL prior months lacking an
-- expire row — a tenant dormant three months has three unexpired months).
create or replace function public.__media_credit_roll(_tenant uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  _month text := public.__media_credit_month();
  _allow int;
  _prior text;
  _granted int; _consumed int; _reserved int; _lapse int;
begin
  if _tenant is null then return; end if;
  perform 1 from public.tenants t where t.id = _tenant for update;

  select coalesce(nullif(regexp_replace(coalesce(value::text,''), '[^0-9]', '', 'g'), ''), '0')::int
    into _allow
  from public.admin_app_settings where key = 'media_credits_included_monthly';
  if coalesce(_allow, 0) > 0 then
    insert into public.paige_media_credit_entries
      (tenant_id, entry_type, credits, idempotency_key, month_bucket, included_credits, source)
    values (_tenant, 'grant_included', _allow,
            'grant:t:' || _tenant || ':' || _month, _month, _allow, 'system')
    on conflict (idempotency_key) do nothing;
  end if;

  for _prior in
    select distinct g.month_bucket from public.paige_media_credit_entries g
    where g.tenant_id = _tenant and g.entry_type = 'grant_included' and g.month_bucket < _month
      and not exists (
        select 1 from public.paige_media_credit_entries x
        where x.tenant_id = _tenant and x.entry_type = 'expire'
          and x.idempotency_key = 'expire:t:' || _tenant || ':' || g.month_bucket)
  loop
    select coalesce(sum(credits), 0) into _granted
    from public.paige_media_credit_entries
    where tenant_id = _tenant and entry_type = 'grant_included' and month_bucket = _prior;

    select coalesce(sum(included_credits), 0) into _consumed
    from public.paige_media_credit_entries
    where tenant_id = _tenant and entry_type = 'consume' and month_bucket = _prior;

    select coalesce(sum(h.included_credits), 0) into _reserved
    from public.paige_media_credit_entries h
    where h.tenant_id = _tenant and h.entry_type = 'hold' and h.month_bucket = _prior
      and not exists (
        select 1 from public.paige_media_credit_entries c
        where c.tenant_id = _tenant and c.entry_type in ('consume','release') and c.job_id = h.job_id);

    _lapse := greatest(_granted - _consumed - _reserved, 0);
    if _lapse > 0 then
      insert into public.paige_media_credit_entries
        (tenant_id, entry_type, credits, idempotency_key, month_bucket, included_credits, source, reason)
      values (_tenant, 'expire', _lapse,
              'expire:t:' || _tenant || ':' || _prior, _prior, _lapse, 'system',
              'monthly included allowance lapse')
      on conflict (idempotency_key) do nothing;
    end if;
  end loop;
end;
$$;

-- Derived balance (closure semantics; assumes roll ran under the tenant lock).
-- included = current-month grant − consumes(month) − OPEN holds(month);
-- purchased = grants+adjusts − consumes(all) − OPEN holds(all).
-- Releases never subtract (closure returns them); expires never touch the
-- CURRENT month by construction (roll only writes prior months).
create or replace function public.__media_credit_balance(_tenant uuid)
returns table (included_remaining int, purchased_remaining int, total_remaining int, holds_open int)
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  _month text := public.__media_credit_month();
  _inc int; _pur int; _holds int;
begin
  select
    coalesce((select sum(credits) from public.paige_media_credit_entries e
              where e.tenant_id = _tenant and e.entry_type = 'grant_included' and e.month_bucket = _month), 0)
    - coalesce((select sum(included_credits) from public.paige_media_credit_entries e
              where e.tenant_id = _tenant and e.entry_type = 'consume' and e.month_bucket = _month), 0)
    - coalesce((select sum(h.included_credits) from public.paige_media_credit_entries h
              where h.tenant_id = _tenant and h.entry_type = 'hold' and h.month_bucket = _month
                and not exists (select 1 from public.paige_media_credit_entries c
                                where c.tenant_id = _tenant and c.entry_type in ('consume','release')
                                  and c.job_id = h.job_id)), 0),
    coalesce((select sum(credits) from public.paige_media_credit_entries e
              where e.tenant_id = _tenant and e.entry_type in ('grant_purchased','adjust')), 0)
    - coalesce((select sum(purchased_credits) from public.paige_media_credit_entries e
              where e.tenant_id = _tenant and e.entry_type = 'consume'), 0)
    - coalesce((select sum(h.purchased_credits) from public.paige_media_credit_entries h
              where h.tenant_id = _tenant and h.entry_type = 'hold'
                and not exists (select 1 from public.paige_media_credit_entries c
                                where c.tenant_id = _tenant and c.entry_type in ('consume','release')
                                  and c.job_id = h.job_id)), 0),
    coalesce((select sum(h.credits) from public.paige_media_credit_entries h
              where h.tenant_id = _tenant and h.entry_type = 'hold'
                and not exists (select 1 from public.paige_media_credit_entries c
                                where c.tenant_id = _tenant and c.entry_type in ('consume','release')
                                  and c.job_id = h.job_id)), 0)
  into _inc, _pur, _holds;
  return query select greatest(coalesce(_inc,0), 0)::int, greatest(coalesce(_pur,0), 0)::int,
                      (greatest(coalesce(_inc,0),0) + greatest(coalesce(_pur,0),0))::int,
                      coalesce(_holds, 0)::int;
end;
$$;

-- ── PUBLIC WRITERS (service-role only; jsonb results; failures write nothing) ──

create or replace function public.media_credit_hold(
  _tenant uuid, _job uuid, _credits int, _estimate_usd numeric default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  _month text := public.__media_credit_month();
  _existing int;
  _inc int; _pur int; _tot int;
  _draw_inc int; _draw_pur int;
  _platform numeric; _ceiling numeric;
  _job_tenant uuid;
begin
  if coalesce(_credits, 0) <= 0 or _job is null then
    return jsonb_build_object('ok', false, 'error', 'invalid_hold');
  end if;
  -- The job must exist and belong to THIS tenant — a mismatched job id can
  -- never mint ledger entries against the wrong workspace.
  select tenant_id into _job_tenant from public.paige_media_jobs where id = _job;
  if _job_tenant is null or _job_tenant <> _tenant then
    return jsonb_build_object('ok', false, 'error', 'job_tenant_mismatch');
  end if;

  perform public.__media_credit_roll(_tenant);

  -- Idempotent per job: identical replay is a no-op success; a conflicting
  -- amount for the same job is an error, never a second reservation.
  select credits into _existing from public.paige_media_credit_entries
  where idempotency_key = 'hold:' || _job::text;
  if found then
    if _existing = _credits then
      return jsonb_build_object('ok', true, 'idempotent_replay', true);
    end if;
    return jsonb_build_object('ok', false, 'error', 'hold_conflict');
  end if;

  -- PLATFORM SPEND GUARD (enforced, not advisory): under a global-class lock
  -- so concurrent tenants cannot both pass a nearly-spent platform cap.
  select coalesce(nullif(regexp_replace(coalesce(value::text,''), '[^0-9.]', '', 'g'), ''), '')::numeric
    into _ceiling
  from public.admin_app_settings where key = 'media_spend_ceiling_usd';
  if _ceiling is not null and _ceiling > 0 then
    perform pg_advisory_xact_lock(918273645, 0);
    select public.media_spend_today_all() into _platform;
    if coalesce(_platform, 0) + coalesce(_estimate_usd, 0) > _ceiling then
      return jsonb_build_object('ok', false, 'error', 'platform_spend_guard',
                                'platform_accrued', coalesce(_platform, 0), 'ceiling', _ceiling);
    end if;
  end if;

  select included_remaining, purchased_remaining, total_remaining into _inc, _pur, _tot
  from public.__media_credit_balance(_tenant);

  if coalesce(_tot, 0) < _credits then
    return jsonb_build_object('ok', false, 'insufficient', true,
                              'balance', coalesce(_tot, 0), 'needed', _credits);
  end if;

  _draw_inc := least(_credits, greatest(_inc, 0));
  _draw_pur := _credits - _draw_inc;

  insert into public.paige_media_credit_entries
    (tenant_id, entry_type, credits, job_id, idempotency_key, month_bucket,
     included_credits, purchased_credits, source)
  values (_tenant, 'hold', _credits, _job, 'hold:' || _job::text,
          _month, _draw_inc, _draw_pur, 'system');

  return jsonb_build_object('ok', true, 'included_drawn', _draw_inc, 'purchased_drawn', _draw_pur,
                            'balance_after', _tot - _credits);
end;
$$;

create or replace function public.media_credit_consume(_tenant uuid, _job uuid, _actual int)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  _h record; _draw_inc int; _draw_pur int; _over boolean := false;
begin
  if _job is null then return jsonb_build_object('ok', false, 'error', 'invalid_consume'); end if;
  perform public.__media_credit_roll(_tenant);

  if exists (select 1 from public.paige_media_credit_entries where idempotency_key = 'consume:' || _job::text) then
    return jsonb_build_object('ok', true, 'idempotent_replay', true);
  end if;

  select * into _h from public.paige_media_credit_entries
  where tenant_id = _tenant and entry_type = 'hold' and job_id = _job;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'no_open_hold');
  end if;

  -- Derive the split from the HOLD (never live pools — a rollover must not
  -- steal the new month's included credits): included first, overage to
  -- purchased. Overage is RECORDED and flagged (the provider already charged —
  -- truth + escalation, never rejection), never silently negative on included.
  _draw_inc := least(coalesce(_actual, _h.credits), _h.included_credits);
  _draw_pur := greatest(coalesce(_actual, _h.credits) - _draw_inc, 0);
  if coalesce(_actual, _h.credits) > _h.credits then _over := true; end if;

  insert into public.paige_media_credit_entries
    (tenant_id, entry_type, credits, job_id, idempotency_key, month_bucket,
     included_credits, purchased_credits, source, reason)
  values (_tenant, 'consume', _draw_inc + _draw_pur, _job, 'consume:' || _job::text,
          _h.month_bucket, _draw_inc, _draw_pur, 'system',
          case when _over then 'actual exceeded reserved estimate (overage recorded)' end);

  return jsonb_build_object('ok', true, 'included_consumed', _draw_inc, 'purchased_consumed', _draw_pur,
                            'overage', _over);
end;
$$;

create or replace function public.media_credit_release(_tenant uuid, _job uuid, _reason text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare _h record; _j record;
begin
  if _job is null then return jsonb_build_object('ok', false, 'error', 'invalid_release'); end if;
  perform public.__media_credit_roll(_tenant);

  if exists (select 1 from public.paige_media_credit_entries where idempotency_key = 'release:' || _job::text) then
    return jsonb_build_object('ok', true, 'idempotent_replay', true);
  end if;

  select * into _h from public.paige_media_credit_entries
  where tenant_id = _tenant and entry_type = 'hold' and job_id = _job;
  if not found then
    return jsonb_build_object('ok', true, 'no_open_hold', true);
  end if;

  -- ANTI-LEAKAGE GATE: a release returns credits only for jobs that VERIFIABLY
  -- never reached the provider. A submitted job that failed must CONSUME —
  -- fal already charged, and returning the credits would leak provider cost.
  select state, submitted_at into _j from public.paige_media_jobs where id = _job;
  if _j.submitted_at is not null or coalesce(_j.state, '') not in ('created','blocked','cancelled') then
    return jsonb_build_object('ok', false, 'error', 'release_forbidden_submitted',
                              'hint', 'consume instead: the provider may already have charged');
  end if;

  insert into public.paige_media_credit_entries
    (tenant_id, entry_type, credits, job_id, idempotency_key, month_bucket,
     included_credits, purchased_credits, source, reason)
  values (_tenant, 'release', _h.credits, _job, 'release:' || _job::text,
          _h.month_bucket, _h.included_credits, _h.purchased_credits, 'system',
          coalesce(_reason, 'hold released'));
  return jsonb_build_object('ok', true);
end;
$$;

-- Owner/pack grant (additive only, by recorded decision: no signed adjust rows
-- in Beta — a deduction is an owner conversation, and corrections re-grant with
-- a reason). Unique key per grant: a second pack purchase can never no-op.
create or replace function public.media_credit_grant_purchased(
  _tenant uuid, _credits int, _source text default 'owner', _reason text default null, _actor uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(_credits, 0) <= 0 then return jsonb_build_object('ok', false, 'error', 'invalid_grant'); end if;
  perform public.__media_credit_roll(_tenant);
  insert into public.paige_media_credit_entries
    (tenant_id, entry_type, credits, idempotency_key, purchased_credits, source, reason, created_by)
  values (_tenant, 'grant_purchased', _credits,
          'grant:t:' || _tenant || ':purchased:' || gen_random_uuid()::text,
          _credits, coalesce(_source, 'owner'), _reason, _actor);
  return jsonb_build_object('ok', true, 'granted', _credits);
end;
$$;

-- Settlement companion (the sweeper calls it beside mark_exhausted): closes
-- holds for terminal jobs. failed/cancelled never-submitted -> release;
-- terminal after submission -> consume at the reserved cost (the provider
-- charged; record truth).
create or replace function public.settle_media_credit_holds(_limit int default 50)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare _released int := 0; _consumed int := 0; _h record; _j record;
begin
  for _h in
    select h.id, h.tenant_id, h.job_id, h.credits, h.month_bucket, h.included_credits, h.purchased_credits
    from public.paige_media_credit_entries h
    join public.paige_media_jobs j on j.id = h.job_id
    where h.entry_type = 'hold'
      and j.state in ('failed','cancelled','succeeded')
      and not exists (select 1 from public.paige_media_credit_entries c
                      where c.entry_type in ('consume','release') and c.job_id = h.job_id)
    order by h.created_at
    limit greatest(coalesce(_limit, 50), 1)
    for update of h
  loop
    select state, submitted_at into _j from public.paige_media_jobs where id = _h.job_id;
    if _j.submitted_at is null and _j.state in ('failed','cancelled') then
      insert into public.paige_media_credit_entries
        (tenant_id, entry_type, credits, job_id, idempotency_key, month_bucket,
         included_credits, purchased_credits, source, reason)
      values (_h.tenant_id, 'release', _h.credits, _h.job_id, 'release:' || _h.job_id::text,
              _h.month_bucket, _h.included_credits, _h.purchased_credits, 'system', 'settled: never submitted')
      on conflict (idempotency_key) do nothing;
      _released := _released + 1;
    else
      insert into public.paige_media_credit_entries
        (tenant_id, entry_type, credits, job_id, idempotency_key, month_bucket,
         included_credits, purchased_credits, source, reason)
      values (_h.tenant_id, 'consume', _h.credits, _h.job_id, 'consume:' || _h.job_id::text,
              _h.month_bucket, _h.included_credits, _h.purchased_credits, 'system',
              'settled: terminal after submission (provider charge recorded)')
      on conflict (idempotency_key) do nothing;
      _consumed := _consumed + 1;
    end if;
  end loop;
  return jsonb_build_object('ok', true, 'released', _released, 'consumed', _consumed);
end;
$$;

-- Platform-wide daily media spend (UTC day; the enforced guard's feed).
create or replace function public.media_spend_today_all()
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(sum(coalesce(actual_cost_usd, estimated_cost_usd)), 0)
  from public.paige_media_jobs
  where state <> 'cancelled'
    and submitted_at is not null
    and submitted_at >= date_trunc('day', now() at time zone 'utc');
$$;

revoke all on function public.__media_credit_month(timestamptz) from public, anon, authenticated, service_role;
revoke all on function public.__media_credit_roll(uuid) from public, anon, authenticated;
revoke all on function public.__media_credit_balance(uuid) from public, anon, authenticated;
revoke all on function public.media_credit_hold(uuid, uuid, int, numeric) from public, anon, authenticated;
grant execute on function public.media_credit_hold(uuid, uuid, int, numeric) to service_role;
revoke all on function public.media_credit_consume(uuid, uuid, int) from public, anon, authenticated;
grant execute on function public.media_credit_consume(uuid, uuid, int) to service_role;
revoke all on function public.media_credit_release(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.media_credit_release(uuid, uuid, text) to service_role;
revoke all on function public.media_credit_grant_purchased(uuid, int, text, text, uuid) from public, anon, authenticated;
grant execute on function public.media_credit_grant_purchased(uuid, int, text, text, uuid) to service_role;
revoke all on function public.settle_media_credit_holds(int) from public, anon, authenticated;
grant execute on function public.settle_media_credit_holds(int) to service_role;
revoke all on function public.media_spend_today_all() from public, anon, authenticated;
grant execute on function public.media_spend_today_all() to service_role;

-- -----------------------------------------------------------------------------
-- The Billing read (the get_workspace_ai_usage precedent): R22 owner-only,
-- workspace derived server-side, media usage + ledger state + notice inputs.
-- Chat/automation categories stay on their own meter reads (visible, included
-- in Beta); this RPC owns the MEDIA category and never guesses the others.
-- VOLATILE, deliberately: the read self-heals a stale month via the roll.
-- -----------------------------------------------------------------------------
create or replace function public.get_workspace_media_usage()
returns table(
  tenant_id            uuid,
  usage_state          text,     -- ok | no_workspace | owner_only | not_applicable
  month                text,
  period_start         timestamptz,
  period_end           timestamptz,
  allowance_monthly    int,
  included_remaining   int,
  purchased_remaining  int,
  total_remaining      int,
  holds_open           int,
  image_credits        int,
  image_edit_credits   int,
  video_credits        int,
  other_credits        int,
  jobs_month           int,
  spend_estimate_usd   numeric,
  spend_actual_usd     numeric
)
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  _t uuid; _parent uuid; _owner boolean; _allow int;
  _month text := public.__media_credit_month();
  _inc int; _pur int; _tot int; _holds int;
begin
  _t := public.billing_active_tenant_id();
  if _t is null then
    return query select null::uuid, 'no_workspace'::text, null::text, null::timestamptz, null::timestamptz,
      null::int, null::int, null::int, null::int, null::int,
      null::int, null::int, null::int, null::int, null::int, null::numeric, null::numeric;
    return;
  end if;

  select parent_tenant_id into _parent from public.tenants where id = _t;
  _owner := public.is_tenant_owner(auth.uid(), _t);
  if _parent is not null then
    return query select _t, 'not_applicable'::text, null::text, null::timestamptz, null::timestamptz,
      null::int, null::int, null::int, null::int, null::int,
      null::int, null::int, null::int, null::int, null::int, null::numeric, null::numeric;
    return;
  end if;
  if not _owner then
    return query select _t, 'owner_only'::text, null::text, null::timestamptz, null::timestamptz,
      null::int, null::int, null::int, null::int, null::int,
      null::int, null::int, null::int, null::int, null::int, null::numeric, null::numeric;
    return;
  end if;

  select coalesce(nullif(regexp_replace(coalesce(value::text,''), '[^0-9]', '', 'g'), ''), '0')::int
    into _allow
  from public.admin_app_settings where key = 'media_credits_included_monthly';

  perform public.__media_credit_roll(_t);
  select included_remaining, purchased_remaining, total_remaining, holds_open
    into _inc, _pur, _tot, _holds
  from public.__media_credit_balance(_t);

  return query
  select _t, 'ok'::text, _month,
         date_trunc('month', now()), date_trunc('month', now()) + interval '1 month',
         coalesce(_allow, 0), coalesce(_inc,0), coalesce(_pur,0), coalesce(_tot,0), coalesce(_holds,0),
         c.image_credits, c.edit_credits, c.video_credits, c.other_credits,
         c.jobs_month, c.spend_estimate, c.spend_actual
  from (
    select
      coalesce(sum(case when j.mode = 'image' then cons.included_credits + cons.purchased_credits end), 0)::int as image_credits,
      coalesce(sum(case when j.mode = 'image_edit' then cons.included_credits + cons.purchased_credits end), 0)::int as edit_credits,
      coalesce(sum(case when j.mode = 'video' then cons.included_credits + cons.purchased_credits end), 0)::int as video_credits,
      coalesce(sum(case when j.mode not in ('image','image_edit','video') then cons.included_credits + cons.purchased_credits end), 0)::int as other_credits,
      count(distinct j.id)::int as jobs_month,
      coalesce(sum(j.estimated_cost_usd), 0)::numeric as spend_estimate,
      coalesce(sum(coalesce(j.actual_cost_usd, j.estimated_cost_usd)), 0)::numeric as spend_actual
    from public.paige_media_credit_entries cons
    join public.paige_media_jobs j on j.id = cons.job_id
    where cons.tenant_id = _t
      and cons.entry_type = 'consume'
      and cons.created_at >= date_trunc('month', now() at time zone 'utc')
  ) c;
end;
$$;

revoke all on function public.get_workspace_media_usage() from public, anon;
grant execute on function public.get_workspace_media_usage() to authenticated, service_role;

-- NOT in supabase_realtime, deliberately: the client never subscribes to the
-- ledger (pmj carries job transitions); a financial table gains no broadcast
-- surface it does not need.
