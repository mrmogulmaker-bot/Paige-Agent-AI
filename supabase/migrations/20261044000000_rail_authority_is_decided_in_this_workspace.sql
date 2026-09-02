-- #804 — a person's authority over client Rail data is decided INSIDE the workspace the data
-- belongs to, and PAIGE Chat receives only the evidence it actually needs.
--
-- THE DEFECT. `get_client_rail` decided the privileged *staff lens* like this:
--
--   v_is_staff := public.is_platform_owner()
--              OR (v_tenant = public.current_user_tenant_id()
--                  AND public.has_any_role(v_uid, ARRAY['admin','super_admin','coach']));
--
-- The first conjunct is sound and is PRESERVED below: `v_tenant` comes from the client's own row
-- and must equal the caller's active workspace. The second is not. `has_any_role()` reads
-- `public.user_roles`, whose columns are (id, user_id, role, created_at) — there is NO `tenant_id`.
-- It asks a GLOBAL question. Meanwhile `current_user_tenant_id()` honours `profiles.active_tenant_id`
-- for ANY active `tenant_members` row at ANY role, a plain `member` included. So both conjuncts are
-- satisfiable by someone who is only a MEMBER of the workspace whose client they are reading, as
-- long as they hold a staff role in some OTHER workspace. This is §59's global-role trap, and it is
-- the same root cause as #794 (`get_solo_rail_activity`, fixed in 20261043000000).
--
-- WHAT IT IS NOT. This is not a cross-tenant read and must not be recorded as one: the tenant
-- equality check does hold. The boundary crossed is MEMBER -> STAFF inside one workspace.
--
-- WHY IT MATTERED. The staff lens is not a cosmetic difference. It returns raw `payload` (producer
-- and provider JSON), `actor_user_id`, `ref_table`/`ref_id`, and it applies NO audience filter — so
-- it includes `visibility='owner_internal'` rows. The client lens nulls every one of those.
--
-- THE PROVEN AUDIENCE POLICY, quoted from this table's own foundation migration
-- (20260712163259_paige_context_rail_step1_foundation.sql:104,113) rather than invented here:
--
--   (1) Staff read: any audience, own tenant only (or platform owner).
--   (2) Client-subject read: only THEIR OWN client-visible events, never owner_internal.
--
-- Both are preserved EXACTLY. Staff continuing to see `owner_internal` rows is the documented
-- intent, not an oversight — `automation.fired`, `owner.action_taken` and `owner.crm_mutation` are
-- all `owner`/`owner_internal` by registry default, so narrowing it would blank most of the rail for
-- a legitimate coach. This migration changes WHO COUNTS AS STAFF, never what staff may see.
--
-- REFUSALS NOW FAIL CLOSED AND LOUD. Every refusal path was a bare `RETURN;`, which hands a denied
-- caller an empty timeline indistinguishable from "nothing has happened for this client" — the same
-- lie #746 exists to end, one layer down. All of them now raise 42501. The "no such contact" path
-- raises the SAME error as the "not allowed" path deliberately: a caller must not be able to
-- distinguish a client that does not exist from one they may not see.
--
-- SEPARATE CONTRACTS BY AUDIENCE. `get_client_rail` keeps its 15-column lens shape, because a
-- client-portal reader is its legitimate future audience. PAIGE Chat is a MODEL-facing surface and
-- gets its own minimal projection below. Verified against the only consumer that exists
-- (`supabase/functions/paige-ai-chat/index.ts:4658` and `:8391`): both read exactly `event_kind`,
-- `title` and `occurred_at` and nothing else, so the narrow projection costs the product nothing.
--
-- NOT CHANGED HERE, deliberately: `get_platform_rail` shares the `RETURN;`-on-refusal shape but has
-- ZERO callers anywhere in the repository and does NOT use the global-role helper; it is parked, not
-- fixed, so this slice stays a security repair rather than a sweep. No grant on the raw
-- `paige_client_events` table is added or restored by this migration.

create or replace function public.get_client_rail(
  p_contact_id uuid,
  p_limit      integer default 50,
  p_lens       text    default 'coach'
)
returns table (
  id              uuid,
  event_kind      text,
  surface         text,
  actor_type      text,
  actor_user_id   uuid,
  audience        text,
  visibility      text,
  from_department text,
  to_department   text,
  title           text,
  summary         text,
  payload         jsonb,
  ref_table       text,
  ref_id          uuid,
  occurred_at     timestamptz
)
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_uid        uuid := auth.uid();
  v_tenant     uuid;
  v_is_staff   boolean;
  v_is_subject boolean;
  v_lens       text;
  v_limit      integer := least(greatest(coalesce(p_limit, 50), 1), 200);
begin
  if v_uid is null then
    raise exception using errcode = '42501', message = 'RAIL_FORBIDDEN';
  end if;

  select c.tenant_id into v_tenant from public.clients c where c.id = p_contact_id;

  -- Same error as a permission refusal, on purpose: a caller must not learn whether a client id
  -- exists by comparing responses.
  if v_tenant is null then
    raise exception using errcode = '42501', message = 'RAIL_FORBIDDEN';
  end if;

  -- THE CORRECTION. The active-workspace boundary is kept, and the role is now read from the
  -- caller's membership OF THAT SAME WORKSPACE, so a role earned elsewhere can no longer satisfy it.
  v_is_staff := public.is_platform_owner()
             or (
                  v_tenant = public.current_user_tenant_id()
                  and exists (
                    select 1
                      from public.tenant_members m
                     where m.user_id   = v_uid
                       and m.tenant_id = v_tenant
                       and m.status    = 'active'
                       and m.role in ('owner', 'admin', 'coach')
                  )
                );

  -- Unchanged, and deliberately preserved: a client reading their own rail is a proven audience.
  v_is_subject := exists (
    select 1 from public.clients c where c.id = p_contact_id and c.linked_user_id = v_uid
  );

  if not v_is_staff and not v_is_subject then
    raise exception using errcode = '42501', message = 'RAIL_FORBIDDEN';
  end if;

  v_lens := case when v_is_staff and p_lens in ('coach','owner','staff') then 'staff' else 'client' end;

  return query
  select e.id, e.event_kind, e.surface, e.actor_type,
         case when v_lens = 'staff' then e.actor_user_id   else null end,
         e.audience,
         case when v_lens = 'staff' then e.visibility       else 'client_visible' end,
         case when v_lens = 'staff' then e.from_department  else null end,
         case when v_lens = 'staff' then e.to_department    else null end,
         e.title, e.summary,
         case when v_lens = 'staff' then e.payload          else '{}'::jsonb end,
         case when v_lens = 'staff' then e.ref_table        else null end,
         case when v_lens = 'staff' then e.ref_id           else null end,
         e.occurred_at
  from public.paige_client_events e
  where e.contact_id = p_contact_id
    and (v_lens = 'staff'
         or (e.audience in ('client','both') and e.visibility = 'client_visible'))
  order by e.occurred_at desc
  limit v_limit;
end
$$;

comment on function public.get_client_rail(uuid, integer, text) is
  'Client Rail reader. #804: the staff-role check is scoped to the caller''s membership of the SAME '
  'workspace the client belongs to, so a role held in another tenant cannot satisfy it; every '
  'refusal raises 42501 rather than returning an empty timeline. Audience policy unchanged.';

-- The model-facing projection. PAIGE Chat renders a label, a title and a relative time; it has no
-- use for a producer payload or an internal identifier, so it is not given one.
create or replace function public.get_client_rail_for_chat(
  p_contact_id uuid,
  p_limit      integer default 25
)
returns table (
  event_kind  text,
  title       text,
  occurred_at timestamptz
)
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_uid        uuid := auth.uid();
  v_tenant     uuid;
  v_is_staff   boolean;
  v_is_subject boolean;
  v_limit      integer := least(greatest(coalesce(p_limit, 25), 1), 200);
begin
  if v_uid is null then
    raise exception using errcode = '42501', message = 'RAIL_FORBIDDEN';
  end if;

  select c.tenant_id into v_tenant from public.clients c where c.id = p_contact_id;

  if v_tenant is null then
    raise exception using errcode = '42501', message = 'RAIL_FORBIDDEN';
  end if;

  v_is_staff := public.is_platform_owner()
             or (
                  v_tenant = public.current_user_tenant_id()
                  and exists (
                    select 1
                      from public.tenant_members m
                     where m.user_id   = v_uid
                       and m.tenant_id = v_tenant
                       and m.status    = 'active'
                       and m.role in ('owner', 'admin', 'coach')
                  )
                );

  v_is_subject := exists (
    select 1 from public.clients c where c.id = p_contact_id and c.linked_user_id = v_uid
  );

  if not v_is_staff and not v_is_subject then
    raise exception using errcode = '42501', message = 'RAIL_FORBIDDEN';
  end if;

  -- Same audience policy as the reader above, so Chat can never see rows a staff caller could not:
  -- staff any audience (proven), a client-subject only their own client-visible events.
  return query
  select e.event_kind, e.title, e.occurred_at
  from public.paige_client_events e
  where e.contact_id = p_contact_id
    and (v_is_staff
         or (e.audience in ('client','both') and e.visibility = 'client_visible'))
  order by e.occurred_at desc
  limit v_limit;
end
$$;

comment on function public.get_client_rail_for_chat(uuid, integer) is
  'Minimum-evidence client Rail projection for the PAIGE Chat tool (#804). Same workspace-scoped '
  'authorization and same 42501 refusal as get_client_rail, but returns only the label, title and '
  'time the model renders — never payload, actor_user_id, ref_table, ref_id or any internal id.';

revoke all     on function public.get_client_rail_for_chat(uuid, integer) from public, anon;
grant  execute on function public.get_client_rail_for_chat(uuid, integer) to authenticated;
