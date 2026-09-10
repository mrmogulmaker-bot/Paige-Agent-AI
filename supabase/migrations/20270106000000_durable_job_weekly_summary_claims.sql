-- =============================================================================
-- Durable Job Contract — first adopter: weekly-summary-cron (PR follows
-- docs/brain/paige-durable-job-contract.md, merged 2026-09-10).
--
-- Per-substrate minimal schema, per the contract's adapter-first rule: the seam owns
-- no tables of its own. These columns + one claim RPC give the weekly summary send the
-- mechanics the comms drainer already proves in production
-- (20260726211000_comms_c15_scheduled_drainer.sql): atomic FOR UPDATE SKIP LOCKED
-- claims, a bounded lease that self-heals a crashed tick, an attempts ceiling per
-- idempotency intent, and honest terminal states.
--
-- WHY: weekly-summary-cron currently selects every opted-in user and sends with no
-- dedupe marker at all — a concurrent fire, a manual re-fire, or a scheduler retry
-- re-sends to every user. The claim below makes the weekly send idempotent per user
-- per week and bounds retries.
--
-- §59 note: this RPC is SECURITY DEFINER with a pinned search_path, but resolves no
-- caller scope by design — it is REVOKE ALL … GRANT service_role only (the comms
-- drainer precedent); only the platform cron may call it, so there is no per-caller
-- tenant scope to resolve in-body.
-- =============================================================================

alter table public.communication_preferences
  add column if not exists weekly_summary_last_sent_at timestamptz,
  add column if not exists weekly_summary_claimed_at timestamptz,
  add column if not exists weekly_summary_attempts int not null default 0,
  -- Idempotency intent bucket: the Monday (UTC) this attempt row belongs to.
  add column if not exists weekly_summary_attempt_week text,
  -- Canonical durable-job state for the current intent (claimed/succeeded/failed/…).
  add column if not exists weekly_summary_last_outcome text,
  add column if not exists weekly_summary_last_error text;

create index if not exists idx_comm_prefs_weekly_summary_due
  on public.communication_preferences (weekly_summary_claimed_at)
  where email_enabled is true
    and email_weekly_summary is true
    and unsubscribed_all is false;

-- Atomically lease due weekly-summary rows for one tick.
-- Semantics (docs/brain/paige-durable-job-contract.md §2):
--   idempotency key : ('weekly-summary', user_id, attempt_week) — one send per user per week;
--   atomic claim    : FOR UPDATE SKIP LOCKED — overlapping ticks never share a row;
--   lease           : 15 minutes — a crashed tick's rows self-heal to reclaimable;
--   attempts ceiling: 5 per week intent; a new week resets the intent (fresh attempts);
--   honest states   : claimers stamp 'claimed'; the worker stamps terminal states.
create or replace function public.claim_due_weekly_summaries(_limit integer default 200)
returns setof public.communication_preferences
language sql
security definer
set search_path = public
as $$
  with current_week as (
    select to_char(date_trunc('week', now() at time zone 'utc'), 'YYYY-MM-DD') as week
  ),
  due as (
    select cp.id
    from public.communication_preferences cp, current_week cw
    where cp.email_enabled is true
      and cp.email_weekly_summary is true
      and cp.unsubscribed_all is false
      -- not already sent for this week's intent
      and (cp.weekly_summary_last_sent_at is null
           or cp.weekly_summary_last_sent_at < date_trunc('week', now() at time zone 'utc')::timestamptz)
      -- lease free: never claimed, or the lease expired (self-heal)
      and (cp.weekly_summary_claimed_at is null
           or cp.weekly_summary_claimed_at < now() - interval '15 minutes')
      -- attempts ceiling applies within one week's intent only
      and (cp.weekly_summary_attempt_week is distinct from cw.week
           or cp.weekly_summary_attempts < 5)
    order by cp.id
    limit greatest(coalesce(_limit, 200), 1)
    for update skip locked
  )
  update public.communication_preferences cp
  set weekly_summary_claimed_at  = now(),
      weekly_summary_attempt_week = cw.week,
      weekly_summary_attempts = case
        when cp.weekly_summary_attempt_week = cw.week then cp.weekly_summary_attempts + 1
        else 1 end,
      weekly_summary_last_outcome = 'claimed',
      weekly_summary_last_error = null
  from due, current_week cw
  where cp.id = due.id
  returning cp.*;
$$;

revoke all on function public.claim_due_weekly_summaries(integer) from public, anon, authenticated;
grant execute on function public.claim_due_weekly_summaries(integer) to service_role;

-- Exhausted rows must not linger non-terminal: once a user's week-intent is out of
-- attempts and still unsent, it reads 'failed' for that intent (the next week is a
-- fresh intent and reclaims it). Idempotent; safe on every tick.
create or replace function public.mark_exhausted_weekly_summaries()
returns void
language sql
security definer
set search_path = public
as $$
  update public.communication_preferences cp
  set weekly_summary_last_outcome = 'failed',
      weekly_summary_last_error = coalesce(cp.weekly_summary_last_error, 'attempt_ceiling_reached'),
      weekly_summary_claimed_at = null
  where cp.email_enabled is true
    and cp.email_weekly_summary is true
    and cp.unsubscribed_all is false
    and cp.weekly_summary_attempt_week = to_char(date_trunc('week', now() at time zone 'utc'), 'YYYY-MM-DD')
    and cp.weekly_summary_attempts >= 5
    and (cp.weekly_summary_last_sent_at is null
         or cp.weekly_summary_last_sent_at < date_trunc('week', now() at time zone 'utc')::timestamptz);
$$;

revoke all on function public.mark_exhausted_weekly_summaries() from public, anon, authenticated;
grant execute on function public.mark_exhausted_weekly_summaries() to service_role;
