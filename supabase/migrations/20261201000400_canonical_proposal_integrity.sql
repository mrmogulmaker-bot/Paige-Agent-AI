-- CLI scaffold: 20260904061952, forward-ordered after the existing future-dated
-- table/nonce migrations and latest tracked 20261201000300. No applied file edited.
-- Canonical Chat proposals: browser callers may READ their own rows, never issue
-- or rewrite evidence that a privileged server later executes.
begin;
lock table public.paige_pending_confirmations in access exclusive mode;
alter table public.paige_pending_confirmations
  add column if not exists server_issued_at timestamptz;
comment on column public.paige_pending_confirmations.server_issued_at is
  'Set explicitly only by trusted server issuance after browser writes are revoked. NULL legacy/old-runtime proposals are not execution authority: re-propose them. No default or backfill.';
revoke insert,update,delete,truncate,references,trigger
  on public.paige_pending_confirmations from public,anon,authenticated;
-- Column grants survive a table-level REVOKE. Remove every browser write column
-- privilege, including drift, while preserving existing SELECT grants/scope.
do $$
declare _columns text;
begin
  select string_agg(quote_ident(attname),',' order by attnum) into _columns
  from pg_catalog.pg_attribute
  where attrelid='public.paige_pending_confirmations'::regclass
    and attnum>0 and not attisdropped;
  execute format('revoke insert (%1$s), update (%1$s), references (%1$s) on public.paige_pending_confirmations from public,anon,authenticated',_columns);
end$$;
-- Keep the restrictive own-user policy. Replace only the old permissive ALL
-- admission with its same own-user predicate restricted to SELECT.
drop policy if exists paige_pending_confirmations_rw on public.paige_pending_confirmations;
drop policy if exists paige_pending_confirmations_read on public.paige_pending_confirmations;
create policy paige_pending_confirmations_read
  on public.paige_pending_confirmations for select to authenticated
  using (user_id=auth.uid());
-- Legacy live rows stay intact but cannot block a fresh trusted proposal.
drop index if exists public.uq_paige_pending_confirmations_live;
create unique index uq_paige_pending_confirmations_live
  on public.paige_pending_confirmations(user_id,fingerprint)
  where consumed_at is null and server_issued_at is not null;
commit;
