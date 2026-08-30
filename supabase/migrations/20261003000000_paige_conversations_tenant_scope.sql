-- =============================================================================
-- C-7 — every inbound SMS row was readable by the admin of EVERY tenant.
-- =============================================================================
--
-- THE LEAK, STATED EXACTLY (verified live, not inferred from source).
--
-- THREE service-role writers insert into public.paige_conversations without a
-- tenant: `handle-inbound-sms` (:379), `handle-inbound-email` (:440, behind
-- LEGACY_DUAL_WRITE which defaults ON), and `send-message`'s outbound mirror
-- (:1234). Each has the tenant in scope and none puts it on the row.
--
-- A tenant-stamping trigger DOES already exist on this table — `trg_stamp_tenant_id`
-- → `stamp_tenant_id()` (20260629180214), which sets `current_user_tenant_id()`.
-- An earlier note of mine said no trigger derived it; that was wrong. The trigger
-- is simply INERT on every path that matters here: it keys on `auth.uid()`, which
-- is NULL for service_role, and it does not raise — it silently leaves NULL. So
-- an authenticated coach INSERT is stamped and all three edge writers are not.
--
-- The live policy set on this table is FIVE policies, not the four the
-- migrations obviously show:
--
--   Admins manage all conversations   PERMISSIVE  ALL     has_any_role(uid,{admin,super_admin})
--   Coaches read/update/write …       PERMISSIVE  R/U/I   has_role(coach) AND can_access_contact(...)
--                                                          AND (tenant_id IS NULL OR tenant_id = current_user_tenant_id() OR is_platform_owner())
--   tenant_isolation                  RESTRICTIVE ALL     is_platform_owner() OR tenant_id IS NULL
--                                                          OR tenant_id = current_user_tenant_id()
--
-- The restrictive one ANDs with whichever permissive one grants, so the true
-- reach is `permissive AND tenant_isolation`. Two consequences, and getting them
-- the right way round matters because the first review of this defect named the
-- wrong mechanism:
--
--   * The COACH path does NOT leak. `can_access_contact()` (20260721020716) is
--     itself tenant-scoped: every one of its EXISTS arms joins the contact to a
--     tenant the caller belongs to, so a row with a contact is reachable only from
--     inside the tenant that owns it. For a NULL contact_id all four arms are
--     false and the function reduces to its first disjunct, `is_super_admin()` —
--     NOT to false, as an earlier version of this comment said. The effect is the
--     same, because a super_admin also satisfies `is_platform_owner()` in the
--     restrictive half, but the precise reading is the point of this file.
--
--   * The ADMIN path DOES. `has_any_role()` reads public.user_roles, which has
--     no tenant_id (the §59 global-role trap), so the permissive half is true for
--     an admin of ANY tenant — and the restrictive half then waves the row
--     through on `tenant_id IS NULL`. A tenant-B admin therefore reads (and, as
--     FOR ALL, updates and deletes) every NULL-tenant row, which is every inbound
--     SMS body of every other tenant.
--
-- Note what the restrictive policy DOES already do: a row that carries a
-- tenant_id is NOT cross-tenant readable, global role or not. The leak is the
-- NULL escape hatch, not unbounded admin reach.
--
-- BLAST RADIUS TODAY: zero rows. `select count(*) from paige_conversations` is 0
-- on prod (xygzykjyynhzqytbqnzu) and 0 on the preview branch, read-only, this
-- session. Nothing is currently exposed and the backfill below is a no-op — the
-- defect is structural and becomes live the moment the first inbound SMS lands.
-- That is also why removing the NULL escape hatch takes no visibility away from
-- anyone (§58): there is nothing for it to hide.
--
-- FOUR CHANGES, smallest sufficient set:
--   1. backfill an existing NULL tenant from its contact, where derivable
--   2. a trigger that derives it on insert, so no writer can reintroduce a NULL
--   3. tenant_isolation stops admitting NULL
--   4. the admin policy gains a tenant clause, so it cannot be the whole story
--
-- (3) alone would close the read. (2) and (4) are there because a single
-- predicate holding the line is how this defect got here.
-- =============================================================================

-- 1 ── Backfill. A conversation's tenant is the tenant of its contact; nothing
--      else on the row identifies it. A row with no contact is NOT derivable and
--      is deliberately left NULL rather than guessed (§13) — after (3) those are
--      visible to the platform operator only, which is the honest resting place
--      for a row we cannot attribute.
update public.paige_conversations pc
   set tenant_id = c.tenant_id
  from public.clients c
 where pc.contact_id = c.id
   and pc.tenant_id is null
   and c.tenant_id is not null;

--      Second pass: inbound EMAIL rows carry the server-derived tenant in
--      metadata (handle-inbound-email writes `metadata.tenant_id` from the
--      connector). That is as authoritative as the column would have been.
update public.paige_conversations
   set tenant_id = (metadata->>'tenant_id')::uuid
 where tenant_id is null
   and metadata ? 'tenant_id'
   and (metadata->>'tenant_id') ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
   and exists (select 1 from public.tenants t where t.id = (metadata->>'tenant_id')::uuid);

--      NOT attempted: recovering an SMS tenant from `metadata->>'to'` via
--      tenant_phone_numbers. That table is keyed on the number's CURRENT owner and
--      the column is globally unique, so a released-and-reprovisioned number would
--      attribute a historical message to the WRONG tenant. A misattributed row is
--      worse than an unattributed one — the same judgement handle-inbound-sms
--      already makes at write time when it refuses to guess a contact.

-- 2 ── Derive on write, from the CONTACT rather than the session.
--
--      This complements `stamp_tenant_id()` rather than replacing it: that one
--      reads the session tenant and is therefore inert for service_role, which is
--      exactly the path that writes these rows. Both are BEFORE INSERT; this one
--      sorts first by name, fills from the contact, and leaves anything it cannot
--      derive for the existing trigger to try from the session.
--
--      It deliberately does NOT raise on an underivable tenant, unlike
--      `set_contact_scoped_tenant()`. Raising here would abort a Twilio webhook
--      insert whose error branch swallows non-23505 errors and returns empty
--      TwiML, so a genuine inbound message would be dropped in silence — trading
--      a scoping defect for a delivery defect.
create or replace function public.paige_conversations_stamp_tenant()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if new.tenant_id is null and new.contact_id is not null then
    select c.tenant_id into new.tenant_id
      from public.clients c
     where c.id = new.contact_id;
  end if;
  return new;
end;
$$;

revoke all on function public.paige_conversations_stamp_tenant() from public, anon, authenticated;

drop trigger if exists trg_paige_conversations_stamp_tenant on public.paige_conversations;
create trigger trg_paige_conversations_stamp_tenant
before insert on public.paige_conversations
for each row execute function public.paige_conversations_stamp_tenant();

-- 3 ── ORDER AND ATOMICITY MATTER HERE, and the obvious way is wrong.
--
--      `db push` does NOT wrap a migration file in a transaction — DDL
--      auto-commits statement by statement (deploy-migrations.yml says so in its
--      own caveats). So a `drop policy` + `create policy` pair on the RESTRICTIVE
--      policy opens a real window: between the two commits the table has NO
--      restrictive policy, while the OLD, un-narrowed admin policy is still live.
--      For that window every tenant admin reads and writes EVERY row — the
--      migration would briefly turn a NULL-row leak into a whole-table one, and
--      if the recreate then failed, it would stay that way until a re-run.
--
--      Two changes close it. Both policies are altered IN PLACE, which is a
--      single atomic statement each and is already the pattern this repo uses
--      (20260721002907). And the PERMISSIVE policy is clamped FIRST, so at no
--      instant is the table wider than it is right now: once the admin policy
--      carries its tenant clause, a momentarily-absent restrictive policy would
--      leak nothing anyway, because the only other permissive policies are the
--      coach ones and `can_access_contact` is itself tenant-scoped.

-- 3a ── The admin policy gains a tenant clause. `has_any_role` is tenant-agnostic
--       by construction (user_roles has no tenant_id), so on its own it says
--       nothing about WHICH tenant's rows an admin may touch. Cross-tenant reach
--       belongs to the operator, never to a tenant-level app_role (§53/§59).
alter policy "Admins manage all conversations" on public.paige_conversations
using (
  public.has_any_role(auth.uid(), ARRAY['admin','super_admin'])
  and (public.is_platform_owner() or tenant_id = public.current_user_tenant_id())
)
with check (
  public.has_any_role(auth.uid(), ARRAY['admin','super_admin'])
  and (public.is_platform_owner() or tenant_id = public.current_user_tenant_id())
);

-- 3b ── The restrictive policy stops admitting NULL. This is the change that
--       actually closes the read; 3a is depth.
alter policy "tenant_isolation" on public.paige_conversations
using (public.is_platform_owner() or tenant_id = public.current_user_tenant_id())
with check (public.is_platform_owner() or tenant_id = public.current_user_tenant_id());

comment on function public.paige_conversations_stamp_tenant() is
  'Derives paige_conversations.tenant_id from the row''s contact when a writer omits it. Service-role callers bypass RLS, so this is the only thing standing between an omitted tenant and a row no policy can scope (C-7).';
