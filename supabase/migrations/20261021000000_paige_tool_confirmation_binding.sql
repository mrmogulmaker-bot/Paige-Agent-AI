-- Bind a mutating tool's confirmation to SERVER-HELD state instead of the model's own flag.
--
-- THE DEFECT
-- ----------
-- paige-ai-chat's autonomy gate refuses whenever `gateArgs.confirm !== true`. That is a real gate
-- against a caller that just invokes the tool -- but `gateArgs` is JSON.parse(tc.function.arguments),
-- the MODEL'S OWN OUTPUT. Nothing tied that flag to the needs_confirm that preceded it, or to any
-- human. And because the tool loop dedupes rounds on the exact argument string, `{}` and
-- `{"confirm":true}` are different signatures -- so a model could call, receive needs_confirm, and
-- re-call with confirm:true INSIDE THE SAME HTTP TURN, with no operator message in between.
--
-- 52 tools reach that gate, including member_grant_role, n8n_delete_workflow, zapier_run_action and
-- comms_buy_number (real recurring money).
--
-- WHAT THIS ADDS
-- --------------
-- A proposal record only the server can mint. To execute a confirm-lane tool the runtime must now
-- consume a row that (a) exists, (b) belongs to this requester and tenant, (c) matches a hash of
-- THIS action's arguments, (d) has not expired, (e) has not been spent, and (f) was created BEFORE
-- the current turn began. (f) is what makes the same-turn bypass unreachable.
--
-- THIS IS A BINDING MECHANISM, NOT AN AUTHORIZATION ONE.
-- It can only ever REFUSE. It grants nothing, widens no one's authority, and does not replace any
-- tool's own permission checks -- those are unchanged. A row's existence proves the server issued a
-- proposal; it never proves the requester was entitled to the underlying action.
--
-- SHAPE BORROWED DELIBERATELY (§18)
-- ---------------------------------
-- public.pipeline_archive_confirmations (20260901045935) already does exactly this for ONE tool.
-- This generalizes that pattern rather than forking a rival: same server-minted token, same
-- tenant + requester scoping, same expires_at/used_at, same `for update` claim, same
-- created_at-predates-the-turn check. The pipeline path keeps its stricter checks on top (an exact
-- token echoed back from the confirmation card) and nothing there is relaxed.

create table if not exists public.paige_tool_confirmations(
  token uuid primary key default gen_random_uuid(),
  -- Nullable by design: a platform operator (§53) has no tenant. Matching therefore uses
  -- IS NOT DISTINCT FROM, so a NULL-tenant proposal can only ever be claimed by a NULL-tenant call.
  tenant_id uuid references public.tenants(id) on delete cascade,
  requested_by uuid not null references auth.users(id) on delete cascade,
  tool_key text not null,
  -- SHA-256 of {tool_key, canonicalized args minus `confirm`}. Binds the approval to ONE action so
  -- an approval for X cannot be spent on Y.
  args_hash text not null,
  summary text,
  expires_at timestamptz not null default now() + interval '30 minutes',
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists paige_tool_confirmations_open_idx
  on public.paige_tool_confirmations(requested_by, tool_key, args_hash, created_at)
  where used_at is null;

alter table public.paige_tool_confirmations enable row level security;
-- No client ever reads or writes this directly. The edge runtime reaches it only through the two
-- service-role RPCs below, so there is deliberately no policy for authenticated.
revoke all on public.paige_tool_confirmations from public, anon, authenticated;
grant all on public.paige_tool_confirmations to service_role;

-- ── open ─────────────────────────────────────────────────────────────────────────────────────
-- Record that the SERVER issued a needs_confirm for this exact action.
create or replace function public.paige_tool_confirmation_open(
  _tenant_id uuid, _requested_by uuid, _tool_key text, _args_hash text, _summary text default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare _token uuid;
begin
  if auth.role() <> 'service_role' then raise exception 'TOOL_CONFIRMATION_FORBIDDEN' using errcode = '42501'; end if;
  if _requested_by is null or coalesce(_tool_key,'') = '' or coalesce(_args_hash,'') = '' then
    raise exception 'TOOL_CONFIRMATION_INVALID' using errcode = '22023';
  end if;

  -- Keep the table bounded without a scheduled job: a spent or long-dead proposal for this
  -- requester has no further use. Scoped to the caller so it can never touch anyone else's rows.
  delete from public.paige_tool_confirmations
   where requested_by = _requested_by
     and (used_at is not null or expires_at < now() - interval '1 day');

  insert into public.paige_tool_confirmations(tenant_id, requested_by, tool_key, args_hash, summary)
  values (_tenant_id, _requested_by, _tool_key, _args_hash, left(coalesce(_summary,''), 2000))
  returning token into _token;
  return _token;
end$$;
revoke all on function public.paige_tool_confirmation_open(uuid,uuid,text,text,text) from public, anon, authenticated;
grant execute on function public.paige_tool_confirmation_open(uuid,uuid,text,text,text) to service_role;

-- ── claim ────────────────────────────────────────────────────────────────────────────────────
-- Spend one open proposal, atomically. This is the ONLY thing that may turn a confirm-lane tool
-- call into an execution.
create or replace function public.paige_tool_confirmation_claim(
  _tenant_id uuid, _requested_by uuid, _tool_key text, _args_hash text, _turn_started_at timestamptz
) returns jsonb language plpgsql security definer set search_path = public as $$
declare _row public.paige_tool_confirmations%rowtype; _reason text;
begin
  if auth.role() <> 'service_role' then raise exception 'TOOL_CONFIRMATION_FORBIDDEN' using errcode = '42501'; end if;
  if _requested_by is null or _turn_started_at is null then
    return jsonb_build_object('ok', false, 'reason', 'no_open_confirmation');
  end if;

  -- Every condition is in the WHERE, so a valid row is never passed over because an older
  -- invalid one sorted ahead of it. `skip locked` keeps concurrent turns from blocking.
  select * into _row
    from public.paige_tool_confirmations
   where requested_by = _requested_by
     and tool_key = _tool_key
     and args_hash = _args_hash
     and tenant_id is not distinct from _tenant_id
     and used_at is null
     and expires_at > now()
     and created_at < _turn_started_at      -- the same-turn bypass dies here
   order by created_at asc
   limit 1
     for update skip locked;

  if found then
    update public.paige_tool_confirmations set used_at = now() where token = _row.token;
    return jsonb_build_object('ok', true, 'token', _row.token);
  end if;

  -- Nothing claimable. Classify for the log only -- every failure resolves the same way
  -- (re-propose), so the reason must never become a branch the caller can steer.
  select case
           when bool_or(used_at is not null) then 'already_used'
           when bool_or(created_at >= _turn_started_at) then 'same_turn'
           when bool_or(expires_at <= now()) then 'expired'
           else 'no_open_confirmation'
         end
    into _reason
    from public.paige_tool_confirmations
   where requested_by = _requested_by
     and tool_key = _tool_key
     and args_hash = _args_hash
     and tenant_id is not distinct from _tenant_id;

  return jsonb_build_object('ok', false, 'reason', coalesce(_reason, 'no_open_confirmation'));
end$$;
revoke all on function public.paige_tool_confirmation_claim(uuid,uuid,text,text,timestamptz) from public, anon, authenticated;
grant execute on function public.paige_tool_confirmation_claim(uuid,uuid,text,text,timestamptz) to service_role;

comment on table public.paige_tool_confirmations is
  'Server-minted proposals for confirm-lane Paige tools. A model cannot mint one, so confirm:true alone can no longer execute anything. Binding only -- it grants no authority and replaces no permission check.';
