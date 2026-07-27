-- =============================================================================
-- Comms C-1.5 — Scheduled-send DRAINER: claim RPC + cancel RPC + cron heartbeat + bucket.
-- =============================================================================
-- §18 EXTENDS the C-1.5 foundation (20260726210500): reads idx_messages_scheduled_due,
--     re-enters the ONE send-message seam (SEND-MESSAGE-CONTRACT §4). No rival send path.
-- §9  Tenant isolation: claim runs as service role (drainer only); cancel is tenant-gated
--     against current_user_tenant_id() so a staff user can only undo their OWN tenant's row.
-- §12 Reuses the paige-action-worker cron idiom EXACTLY (cron.unschedule guard +
--     net.http_post + x-cron-token via public.cron_token_header()). No new pattern.
-- §13 A due row whose pre-send now BLOCKS/RE-QUEUES on release is correct behavior, not a
--     drain failure — the drainer re-enters the full pipeline and records the true outcome.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. claim_due_scheduled_messages — atomically lease the due rows for ONE tick.
--    FOR UPDATE SKIP LOCKED so two overlapping ticks never grab the same row; a
--    5-minute lease (meta.drain_claimed_at) so a crashed drain self-heals (the row
--    becomes re-claimable) instead of stranding forever. scheduled_for stays intact
--    so the due-index still finds an expired-lease row; the send patches status->'sent'
--    (or re-queues with a fresh scheduled_for + cleared claim). Service-role only.
-- -----------------------------------------------------------------------------
create or replace function public.claim_due_scheduled_messages(_limit integer default 50)
returns setof public.messages
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  update public.messages m
     set meta = coalesce(m.meta, '{}'::jsonb)
                || jsonb_build_object('drain_claimed_at', to_jsonb(now()))
   where m.id in (
     select d.id
       from public.messages d
      where d.status = 'queued'
        and d.scheduled_for is not null
        and d.scheduled_for <= now()
        and (
          d.meta->>'drain_claimed_at' is null
          or (d.meta->>'drain_claimed_at')::timestamptz < now() - interval '5 minutes'
        )
      order by d.scheduled_for asc
      for update skip locked
      limit greatest(1, least(_limit, 200))
   )
  returning m.*;
end;
$$;

revoke all on function public.claim_due_scheduled_messages(integer) from public, anon, authenticated;
grant execute on function public.claim_due_scheduled_messages(integer) to service_role;

-- -----------------------------------------------------------------------------
-- 2. cancel_scheduled_message — the undo-send / cancel-schedule seam (§10 callable).
--    Reverts a still-queued, UNCLAIMED row back to an editable 'draft' and clears
--    scheduled_for, so the drainer can never fire it. Returns false (race lost) if the
--    drainer already claimed/sent it — the composer then says "already sent" (§13).
--    Tenant-gated: only staff of the row's OWN tenant (or the platform owner) may cancel.
-- -----------------------------------------------------------------------------
create or replace function public.cancel_scheduled_message(_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant uuid;
  v_updated integer;
begin
  select tenant_id into v_tenant from public.messages where id = _id;
  if v_tenant is null then
    return false;
  end if;
  if not (
    public.is_platform_owner()
    or (v_tenant = public.current_user_tenant_id()
        and public.has_any_role(auth.uid(), array['admin','coach']))
  ) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  update public.messages
     set status = 'draft',
         scheduled_for = null,
         meta = coalesce(meta, '{}'::jsonb) || jsonb_build_object('undo_cancelled_at', to_jsonb(now()))
   where id = _id
     and status = 'queued'
     and scheduled_for is not null
     and (meta->>'drain_claimed_at') is null;   -- lose the race if the drainer already claimed it
  get diagnostics v_updated = row_count;
  return v_updated > 0;
end;
$$;

revoke all on function public.cancel_scheduled_message(uuid) from public, anon;
grant execute on function public.cancel_scheduled_message(uuid) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 3. Cron heartbeat — every minute, wake the drain edge function. Same idiom as
--    'paige-action-worker' (20260720212838): unschedule guard + net.http_post +
--    x-cron-token from public.cron_token_header(). Idempotent; harmless 404s until
--    the comms-scheduled-drain function is live in prod (CI deploys on merge).
-- -----------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from cron.job where jobname = 'comms-scheduled-drain') then
    perform cron.unschedule('comms-scheduled-drain');
  end if;
end $$;

select cron.schedule(
  'comms-scheduled-drain',
  '* * * * *',
  $$
    select net.http_post(
      url     := 'https://xygzykjyynhzqytbqnzu.supabase.co/functions/v1/comms-scheduled-drain',
      headers := jsonb_build_object(
                   'Content-Type', 'application/json',
                   'x-cron-token', public.cron_token_header()
                 ),
      body    := '{}'::jsonb
    );
  $$
);

-- -----------------------------------------------------------------------------
-- 4. comms-attachments storage bucket — outbound/inbound message attachments. PRIVATE
--    (unlike public growth-assets): comms content is tenant-private (§9/§13). Path prefix
--    <tenant_id>/<uuid>-<name>; writes gated by is_tenant_member(foldername[1]) — the same
--    path-derived membership bar as growth-assets. The send adapter fetches bytes
--    server-side by path with the service role; the composer previews via createSignedUrl.
--    is_platform_owner() always overrides (§9).
-- -----------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'comms-attachments', 'comms-attachments', false, 10485760,
  array['image/jpeg','image/jpg','image/png','image/webp','image/gif',
        'application/pdf','text/plain','text/csv',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']
)
on conflict (id) do update set
  public = false, file_size_limit = 10485760,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "comms_attach member read" on storage.objects;
create policy "comms_attach member read" on storage.objects
  for select to authenticated using (
    bucket_id = 'comms-attachments'
    and (public.is_platform_owner() or public.is_tenant_member(((storage.foldername(name))[1])::uuid))
  );

drop policy if exists "comms_attach member upload" on storage.objects;
create policy "comms_attach member upload" on storage.objects
  for insert to authenticated with check (
    bucket_id = 'comms-attachments'
    and (public.is_platform_owner() or public.is_tenant_member(((storage.foldername(name))[1])::uuid))
  );

drop policy if exists "comms_attach member update" on storage.objects;
create policy "comms_attach member update" on storage.objects
  for update to authenticated using (
    bucket_id = 'comms-attachments'
    and (public.is_platform_owner() or public.is_tenant_member(((storage.foldername(name))[1])::uuid))
  );

drop policy if exists "comms_attach member delete" on storage.objects;
create policy "comms_attach member delete" on storage.objects
  for delete to authenticated using (
    bucket_id = 'comms-attachments'
    and (public.is_platform_owner() or public.is_tenant_member(((storage.foldername(name))[1])::uuid))
  );
