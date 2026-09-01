-- Numbers you can CHANGE, not just buy — and the caller-ID defect that proves why.
--
-- THE DEFECT. `tenant_phone_numbers.is_primary` is READ in two places to choose which of a
-- workspace's numbers the outbound call or text comes from:
--
--   voice-twiml/index.ts:198-202   .order("is_primary", desc).limit(1)     -- no tiebreak at all
--   send-message/index.ts:356-360  .order("is_primary", desc).order("purchased_at", desc)
--
-- and NOTHING in the repository has ever written it. The only `SET is_primary = true` anywhere
-- (20260422162007) is on `public.businesses`, an unrelated table. `comms-purchase-number` inserts
-- with the column's `false` default and never revisits it.
--
-- So every row is false, the ordering is a tie, and `voice-twiml`'s LIMIT 1 resolves to whichever
-- row Postgres feels like returning. A business with two numbers — the exact "a dedicated number
-- for another part of the business" case — calls out from an unpredictable one, and can appear to
-- change which number it calls from between two calls with no change to any data.
--
-- WHAT THIS ADDS
--   1. `tenant_phone_number_set_primary`  — the write seam that did not exist.
--   2. `tenant_phone_number_rename`       — friendly_name, including CLEARING it, which
--                                           `import_tenant_phone_number` cannot do (it coalesces).
--   3. A one-time backfill so no live workspace is left in the tie described above.
--
-- WHAT THIS DELIBERATELY DOES NOT ADD. Releasing a number. `status='released'` is a legal value
-- with no writer, and writing it here would mark a number released in our records while the
-- provider keeps billing for it — a row that lies about money. Releasing needs the provider call
-- first, and that is its own slice.
--
-- §9  Both functions are SECURITY DEFINER and re-enforce the caller's scope IN-BODY (§59): the
--     row must belong to the caller's own tenant, and the caller must be a platform owner or hold
--     admin/coach — the same predicate the table's RLS admits. A service caller (Paige's headless
--     agent, auth.uid() IS NULL) must name the tenant explicitly and can never infer one.
-- §13 Both RAISE with stable hints rather than returning a quiet no-op, so a refusal is legible.

-- ── 1. Set which number this business calls and texts from ──────────────────────────────
create or replace function public.tenant_phone_number_set_primary(
  _id uuid,
  _tenant_id uuid default null
)
returns public.tenant_phone_numbers
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller uuid := auth.uid();
  v_tenant uuid;
  v_row public.tenant_phone_numbers;
begin
  if _id is null then
    raise exception 'NUMBER_ID_REQUIRED' using hint = 'NUMBER_ID_REQUIRED';
  end if;

  if v_caller is null then
    -- Service/trusted context. It must NAME the tenant; there is no session to infer one from,
    -- and guessing would be a cross-tenant write with no caller to blame.
    if _tenant_id is null then
      raise exception 'TENANT_REQUIRED_FOR_SERVICE_CALLER' using hint = 'TENANT_REQUIRED';
    end if;
    v_tenant := _tenant_id;
  else
    v_tenant := public.current_user_tenant_id();
    if v_tenant is null then
      raise exception 'NO_TENANT_FOR_CALLER' using hint = 'NO_TENANT';
    end if;
    -- A caller-supplied tenant is honoured ONLY when it agrees with the session's own, so the
    -- parameter can never be used to point this write at somebody else's workspace (§9).
    if _tenant_id is not null and _tenant_id <> v_tenant and not public.is_platform_owner() then
      raise exception 'TENANT_MISMATCH' using hint = 'TENANT_MISMATCH';
    end if;
    if _tenant_id is not null and public.is_platform_owner() then
      v_tenant := _tenant_id;
    end if;
    if not (public.is_platform_owner()
            or public.has_any_role(v_caller, array['admin','coach'])) then
      raise exception 'FORBIDDEN' using hint = 'FORBIDDEN';
    end if;
  end if;

  -- The row must be THIS tenant's, and it must be usable. Making a released or suspended number
  -- primary would point every outbound call at a number that cannot carry one.
  select * into v_row
  from public.tenant_phone_numbers
  where id = _id and tenant_id = v_tenant
  for update;

  if not found then
    raise exception 'NUMBER_NOT_FOUND' using hint = 'NUMBER_NOT_FOUND';
  end if;
  if v_row.status <> 'active' then
    raise exception 'NUMBER_NOT_ACTIVE' using hint = 'NUMBER_NOT_ACTIVE';
  end if;

  -- Clear first, then set. `uq_tenant_phone_numbers_primary` is a partial UNIQUE on
  -- (tenant_id) WHERE is_primary, so setting before clearing would violate it.
  update public.tenant_phone_numbers
     set is_primary = false, updated_at = now()
   where tenant_id = v_tenant and is_primary and id <> _id;

  update public.tenant_phone_numbers
     set is_primary = true, updated_at = now()
   where id = _id
  returning * into v_row;

  return v_row;
end;
$$;

revoke all on function public.tenant_phone_number_set_primary(uuid, uuid) from public, anon;
grant execute on function public.tenant_phone_number_set_primary(uuid, uuid) to authenticated, service_role;

-- ── 2. Rename a number, including clearing the name ─────────────────────────────────────
create or replace function public.tenant_phone_number_rename(
  _id uuid,
  _friendly_name text,
  _tenant_id uuid default null
)
returns public.tenant_phone_numbers
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller uuid := auth.uid();
  v_tenant uuid;
  v_row public.tenant_phone_numbers;
  v_name text;
begin
  if _id is null then
    raise exception 'NUMBER_ID_REQUIRED' using hint = 'NUMBER_ID_REQUIRED';
  end if;

  if v_caller is null then
    if _tenant_id is null then
      raise exception 'TENANT_REQUIRED_FOR_SERVICE_CALLER' using hint = 'TENANT_REQUIRED';
    end if;
    v_tenant := _tenant_id;
  else
    v_tenant := public.current_user_tenant_id();
    if v_tenant is null then
      raise exception 'NO_TENANT_FOR_CALLER' using hint = 'NO_TENANT';
    end if;
    if _tenant_id is not null and _tenant_id <> v_tenant and not public.is_platform_owner() then
      raise exception 'TENANT_MISMATCH' using hint = 'TENANT_MISMATCH';
    end if;
    if _tenant_id is not null and public.is_platform_owner() then
      v_tenant := _tenant_id;
    end if;
    if not (public.is_platform_owner()
            or public.has_any_role(v_caller, array['admin','coach'])) then
      raise exception 'FORBIDDEN' using hint = 'FORBIDDEN';
    end if;
  end if;

  -- '' CLEARS the name; NULL also clears. This is the difference from
  -- `import_tenant_phone_number`, which coalesces and therefore cannot remove a label someone
  -- no longer wants — a control that can set but never unset is a control that half works.
  v_name := nullif(btrim(coalesce(_friendly_name, '')), '');
  if length(coalesce(v_name, '')) > 120 then
    raise exception 'NAME_TOO_LONG' using hint = 'NAME_TOO_LONG';
  end if;

  update public.tenant_phone_numbers
     set friendly_name = v_name, updated_at = now()
   where id = _id and tenant_id = v_tenant
  returning * into v_row;

  if not found then
    raise exception 'NUMBER_NOT_FOUND' using hint = 'NUMBER_NOT_FOUND';
  end if;
  return v_row;
end;
$$;

revoke all on function public.tenant_phone_number_rename(uuid, text, uuid) from public, anon;
grant execute on function public.tenant_phone_number_rename(uuid, text, uuid) to authenticated, service_role;

-- ── 3. Backfill: no live workspace left in the tie ──────────────────────────────────────
-- Deterministic by (purchased_at, created_at, id) so a replay picks the same row, and scoped to
-- tenants that have an active number and no primary — it can never move a primary someone set.
update public.tenant_phone_numbers t
   set is_primary = true, updated_at = now()
 where t.id in (
   select distinct on (n.tenant_id) n.id
     from public.tenant_phone_numbers n
    where n.status = 'active'
      and not exists (
        select 1 from public.tenant_phone_numbers p
         where p.tenant_id = n.tenant_id and p.is_primary
      )
    order by n.tenant_id, n.purchased_at asc nulls last, n.created_at asc, n.id asc
 );

comment on function public.tenant_phone_number_set_primary(uuid, uuid) is
  'Sets which of a workspace''s numbers outbound calls and texts come from. Clears the previous primary in the same transaction (uq_tenant_phone_numbers_primary is a partial unique). Caller scope is re-enforced in-body (§59).';
comment on function public.tenant_phone_number_rename(uuid, text, uuid) is
  'Renames a workspace number. An empty string clears the name, which import_tenant_phone_number cannot do.';
