-- =============================================================================
-- Comms #4 — delete_conversation RPC (Option A: Archive-with-Delete-UX)
-- =============================================================================
-- DOCTRINE HEADER
--  OWNER-LOCKED Option A. The Conversations trash icon SOFT-ARCHIVES a thread —
--  "deleted from the inbox" === archived (archived_at = now()). There is NO hard
--  delete of threads or messages rows; the conversation stays recoverable in the
--  archive. This RPC is the server-side seam behind that delete-UX click.
--  §10 Every delete the UI performs also gets a clean, programmatic seam so Paige
--      can drive it from chat ("Paige, delete this conversation") with NO human in
--      the UI. The trash button is one caller of this RPC; Paige (headless) is
--      another. Mirrors the sibling archive_thread / snooze_thread seams.
--  §9  Tenant isolation is enforced INSIDE this SECURITY DEFINER function (which
--      bypasses RLS), IDENTICAL to archive_thread: a JWT caller is HARD-pinned to
--      public.current_user_tenant_id() and must be admin/coach — the body
--      _tenant_id is IGNORED for a JWT caller, so it can never widen scope; a
--      service_role caller (Paige headless, auth.uid() IS NULL) passes the tenant
--      it ALREADY resolved via _tenant_id.
--  §39 Integrity Governance: because the user's intent is "delete" but the DB
--      action is a soft archive, the delete-CLICK itself is recorded to
--      paige_audit_log ('conversation.delete', mode=soft_archive) so the archive
--      trail honestly reflects the user's action server-side, not just an archive.
--  §2  Coaching-generic; zero finance/credit wording.
--  §37 Producer note: NEW additive seam returning boolean — same contract shape as
--      archive_thread. No existing caller's contract changes.
-- =============================================================================

create or replace function public.delete_conversation(
  _thread_id uuid,
  _tenant_id uuid default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_is_service boolean := auth.uid() is null;
  v_tenant uuid;
  v_updated integer;
begin
  v_tenant := case when v_is_service then _tenant_id else public.current_user_tenant_id() end;
  if v_tenant is null then raise exception 'tenant not resolved' using errcode = '42501'; end if;
  if not v_is_service and not (public.is_platform_owner()
                               or public.has_any_role(auth.uid(), array['admin','coach'])) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  update public.threads
     set archived_at = now()
   where id = _thread_id and tenant_id = v_tenant and archived_at is null;
  get diagnostics v_updated = row_count;

  -- Idempotent: a thread already archived (in-tenant) is already "deleted from the inbox" — that's
  -- success, not an error (§13/§36 — never a dishonest "couldn't delete"). No duplicate audit row.
  if v_updated = 0 then
    return exists (select 1 from public.threads where id = _thread_id and tenant_id = v_tenant);
  end if;

  -- §39 Integrity Governance: record the delete-click even though the DB action is a soft archive.
  insert into public.paige_audit_log(actor_user_id, tenant_id, action, target_type, target_id, payload)
  values (auth.uid(), v_tenant, 'conversation.delete', 'thread', _thread_id,
          jsonb_build_object('mode','soft_archive','surface','conversations_delete_ux'));

  return v_updated > 0;
end;
$$;

revoke all on function public.delete_conversation(uuid, uuid) from public, anon;
grant execute on function public.delete_conversation(uuid, uuid) to authenticated, service_role;
