-- =============================================================================
-- Comms Slice C-1.5 — §10 Paige-callable RPCs for Signatures / Snippets / Threads
-- =============================================================================
-- DOCTRINE HEADER
--  §10 Every create/update/delete these tabs perform in the UI also gets a clean
--      programmatic seam so Paige can drive it from chat ("save this as my sign-off",
--      "snooze this thread until Monday", "share a ;intro reply with the team") with
--      NO human in the UI. The UI is one caller of these RPCs; Paige is another.
--  §9  Tenant isolation is enforced INSIDE each SECURITY DEFINER function (which
--      bypasses RLS): a JWT caller is pinned to public.current_user_tenant_id() and
--      must be admin/coach; a service_role caller (Paige headless, auth.uid() IS
--      NULL) passes the tenant it ALREADY resolved via _tenant_id — a JWT caller's
--      _tenant_id is IGNORED, so the body can never widen scope.
--  §7  Scope rules mirror the foundation RLS exactly: practice-default signatures
--      and team-shared snippets (user_id NULL) are admin-only; a personal row
--      (user_id = auth.uid()) is editable by its owner. Paige (service) may author
--      either on a tenant's behalf.
--  §2  Coaching-generic; zero finance/credit wording.
--  §37 Producer note: these RPCs are NEW additive seams — no existing caller's
--      contract changes. The C-1.5 tabs (SignaturesTab/SnippetsTab/inbox) call the
--      tables directly under RLS AND may call these RPCs; both paths land the same
--      rows. paige-mcp / action-bus is the intended service_role producer.
--  §32 Provable in one BEGIN..ROLLBACK: seed a tenant + admin, upsert a signature
--      (returns id), flip its default, upsert a snippet, snooze + archive a thread,
--      delete both — each asserting tenant match; then prove a cross-tenant JWT is
--      rejected with 42501 and a service call with an explicit _tenant_id succeeds.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- helper: resolve the acting tenant + authorize the caller. Inlined per-fn (a
-- shared SQL helper can't RAISE cleanly across all call sites), but the shape is
-- identical everywhere: service path (auth.uid() IS NULL) trusts _tenant_id; JWT
-- path pins to the session tenant and requires admin/coach.
-- -----------------------------------------------------------------------------

-- ============================ SIGNATURES ====================================
create or replace function public.upsert_signature(
  _id         uuid    default null,
  _user_id    uuid    default null,      -- NULL = practice-default (admin-only)
  _name       text    default null,
  _html       text    default null,
  _variables  jsonb   default '{}'::jsonb,
  _is_default boolean default false,
  _tenant_id  uuid    default null       -- honored ONLY on the service path
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_is_service boolean := auth.uid() is null;
  v_tenant     uuid;
  v_result_id  uuid;
begin
  v_tenant := case when v_is_service then _tenant_id else public.current_user_tenant_id() end;
  if v_tenant is null then
    raise exception 'tenant not resolved' using errcode = '42501';
  end if;

  if not v_is_service then
    if not (public.is_platform_owner()
            or public.has_any_role(auth.uid(), array['admin','coach'])) then
      raise exception 'forbidden' using errcode = '42501';
    end if;
    -- practice-default (user_id NULL) is admin-only; a personal row must be the caller's own.
    if _user_id is null and not (public.is_platform_owner()
                                 or public.has_any_role(auth.uid(), array['admin'])) then
      raise exception 'forbidden: practice default is admin-only' using errcode = '42501';
    end if;
    if _user_id is not null and _user_id <> auth.uid()
       and not (public.is_platform_owner() or public.has_any_role(auth.uid(), array['admin'])) then
      raise exception 'forbidden: cannot edit another user''s sign-off' using errcode = '42501';
    end if;
  end if;

  if _name is null or btrim(_name) = '' or _html is null or btrim(_html) = '' then
    raise exception 'name and html are required' using errcode = '22023';
  end if;

  -- At most one default per scope: clear the prior default in-scope first.
  if coalesce(_is_default, false) then
    update public.signatures
       set is_default = false
     where tenant_id = v_tenant
       and is_default
       and _user_id is not distinct from user_id
       and (_id is null or id <> _id);
  end if;

  if _id is null then
    insert into public.signatures (tenant_id, user_id, name, html, variables, is_default)
    values (v_tenant, _user_id, btrim(_name), _html, coalesce(_variables, '{}'::jsonb), coalesce(_is_default, false))
    returning id into v_result_id;
  else
    update public.signatures
       set name = btrim(_name), html = _html,
           variables = coalesce(_variables, '{}'::jsonb),
           is_default = coalesce(_is_default, false)
     where id = _id and tenant_id = v_tenant
    returning id into v_result_id;
    if v_result_id is null then
      raise exception 'sign-off not found in this practice' using errcode = 'P0002';
    end if;
  end if;

  return v_result_id;
end;
$$;

create or replace function public.delete_signature(
  _id uuid,
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
  v_scope_user uuid;
  v_deleted integer;
begin
  v_tenant := case when v_is_service then _tenant_id else public.current_user_tenant_id() end;
  if v_tenant is null then raise exception 'tenant not resolved' using errcode = '42501'; end if;

  select user_id into v_scope_user from public.signatures where id = _id and tenant_id = v_tenant;
  if not found then return false; end if;

  if not v_is_service then
    if not (public.is_platform_owner()
            or public.has_any_role(auth.uid(), array['admin','coach'])) then
      raise exception 'forbidden' using errcode = '42501';
    end if;
    if (v_scope_user is null or v_scope_user <> auth.uid())
       and not (public.is_platform_owner() or public.has_any_role(auth.uid(), array['admin'])) then
      raise exception 'forbidden' using errcode = '42501';
    end if;
  end if;

  delete from public.signatures where id = _id and tenant_id = v_tenant;
  get diagnostics v_deleted = row_count;
  return v_deleted > 0;
end;
$$;

-- ============================ SNIPPETS ======================================
create or replace function public.upsert_snippet(
  _id        uuid  default null,
  _user_id   uuid  default null,          -- NULL = team-shared (admin-only)
  _trigger   text  default null,
  _name      text  default null,
  _body      text  default null,
  _variables jsonb default '{}'::jsonb,
  _tenant_id uuid  default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_is_service boolean := auth.uid() is null;
  v_tenant     uuid;
  v_trigger    text;
  v_result_id  uuid;
begin
  v_tenant := case when v_is_service then _tenant_id else public.current_user_tenant_id() end;
  if v_tenant is null then raise exception 'tenant not resolved' using errcode = '42501'; end if;

  if not v_is_service then
    if not (public.is_platform_owner()
            or public.has_any_role(auth.uid(), array['admin','coach'])) then
      raise exception 'forbidden' using errcode = '42501';
    end if;
    if _user_id is null and not (public.is_platform_owner()
                                 or public.has_any_role(auth.uid(), array['admin'])) then
      raise exception 'forbidden: shared snippet is admin-only' using errcode = '42501';
    end if;
    if _user_id is not null and _user_id <> auth.uid()
       and not (public.is_platform_owner() or public.has_any_role(auth.uid(), array['admin'])) then
      raise exception 'forbidden: cannot edit another user''s snippet' using errcode = '42501';
    end if;
  end if;

  v_trigger := lower(btrim(coalesce(_trigger, '')));
  if v_trigger !~ '^[;/][a-z0-9_-]{1,30}$' then
    raise exception 'shortcut must start with ; or / (e.g. ;intro)' using errcode = '22023';
  end if;
  if _name is null or btrim(_name) = '' or _body is null or btrim(_body) = '' then
    raise exception 'name and body are required' using errcode = '22023';
  end if;

  if _id is null then
    insert into public.snippets (tenant_id, user_id, "trigger", name, body, variables)
    values (v_tenant, _user_id, v_trigger, btrim(_name), _body, coalesce(_variables, '{}'::jsonb))
    returning id into v_result_id;
  else
    update public.snippets
       set "trigger" = v_trigger, name = btrim(_name), body = _body,
           variables = coalesce(_variables, '{}'::jsonb)
     where id = _id and tenant_id = v_tenant
    returning id into v_result_id;
    if v_result_id is null then
      raise exception 'saved reply not found in this practice' using errcode = 'P0002';
    end if;
  end if;

  return v_result_id;
end;
$$;

create or replace function public.delete_snippet(
  _id uuid,
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
  v_scope_user uuid;
  v_deleted integer;
begin
  v_tenant := case when v_is_service then _tenant_id else public.current_user_tenant_id() end;
  if v_tenant is null then raise exception 'tenant not resolved' using errcode = '42501'; end if;

  select user_id into v_scope_user from public.snippets where id = _id and tenant_id = v_tenant;
  if not found then return false; end if;

  if not v_is_service then
    if not (public.is_platform_owner()
            or public.has_any_role(auth.uid(), array['admin','coach'])) then
      raise exception 'forbidden' using errcode = '42501';
    end if;
    if (v_scope_user is null or v_scope_user <> auth.uid())
       and not (public.is_platform_owner() or public.has_any_role(auth.uid(), array['admin'])) then
      raise exception 'forbidden' using errcode = '42501';
    end if;
  end if;

  delete from public.snippets where id = _id and tenant_id = v_tenant;
  get diagnostics v_deleted = row_count;
  return v_deleted > 0;
end;
$$;

-- ============================ THREADS =======================================
-- snooze_thread — hide a conversation until _until (a new INBOUND still wakes it,
-- per the foundation trigger). _until NULL clears the snooze.
create or replace function public.snooze_thread(
  _thread_id uuid,
  _until     timestamptz,
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
     set snoozed_until = _until
   where id = _thread_id and tenant_id = v_tenant;
  get diagnostics v_updated = row_count;
  return v_updated > 0;
end;
$$;

-- archive_thread — move a conversation out of (or back into) the active inbox.
create or replace function public.archive_thread(
  _thread_id uuid,
  _archived  boolean default true,
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
     set archived_at = case when coalesce(_archived, true) then now() else null end
   where id = _thread_id and tenant_id = v_tenant;
  get diagnostics v_updated = row_count;
  return v_updated > 0;
end;
$$;

-- set_thread_labels — apply/replace the tenant-authored label array on a thread (§10 /
-- R4b). Snooze + archive already have callable seams; labels were direct table writes,
-- a §10 dead end for "Paige, label this VIP." The UI keeps its optimistic .update();
-- this RPC is Paige's headless caller. Same §9 tenant-pin as snooze_thread/archive_thread:
-- a JWT caller is HARD-pinned to current_user_tenant_id() (the body _tenant_id is IGNORED,
-- so it can never widen scope) and must be admin/coach; a service_role caller (auth.uid()
-- IS NULL, Paige headless) passes the tenant it already resolved via _tenant_id.
create or replace function public.set_thread_labels(
  _thread_id uuid,
  _labels    jsonb,
  _tenant_id uuid default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_is_service boolean := auth.uid() is null;
  v_tenant     uuid;
  v_updated    integer;
begin
  v_tenant := case when v_is_service then _tenant_id else public.current_user_tenant_id() end;
  if v_tenant is null then raise exception 'tenant not resolved' using errcode = '42501'; end if;
  if not v_is_service and not (public.is_platform_owner()
                               or public.has_any_role(auth.uid(), array['admin','coach'])) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  update public.threads
     set labels = coalesce(_labels, '[]'::jsonb)
   where id = _thread_id and tenant_id = v_tenant;
  get diagnostics v_updated = row_count;
  return v_updated > 0;
end;
$$;

-- -----------------------------------------------------------------------------
-- Grants — locked to authenticated (JWT staff, self-scoped inside the fn) +
-- service_role (Paige headless). NEVER anon/public.
-- -----------------------------------------------------------------------------
revoke all on function public.upsert_signature(uuid, uuid, text, text, jsonb, boolean, uuid) from public, anon;
revoke all on function public.delete_signature(uuid, uuid) from public, anon;
revoke all on function public.upsert_snippet(uuid, uuid, text, text, text, jsonb, uuid) from public, anon;
revoke all on function public.delete_snippet(uuid, uuid) from public, anon;
revoke all on function public.snooze_thread(uuid, timestamptz, uuid) from public, anon;
revoke all on function public.archive_thread(uuid, boolean, uuid) from public, anon;
revoke all on function public.set_thread_labels(uuid, jsonb, uuid) from public, anon;

grant execute on function public.upsert_signature(uuid, uuid, text, text, jsonb, boolean, uuid) to authenticated, service_role;
grant execute on function public.delete_signature(uuid, uuid) to authenticated, service_role;
grant execute on function public.upsert_snippet(uuid, uuid, text, text, text, jsonb, uuid) to authenticated, service_role;
grant execute on function public.delete_snippet(uuid, uuid) to authenticated, service_role;
grant execute on function public.snooze_thread(uuid, timestamptz, uuid) to authenticated, service_role;
grant execute on function public.archive_thread(uuid, boolean, uuid) to authenticated, service_role;
grant execute on function public.set_thread_labels(uuid, jsonb, uuid) to authenticated, service_role;
