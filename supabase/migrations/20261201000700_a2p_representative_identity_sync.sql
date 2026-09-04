-- The authorized representative the carrier record requires, actually written.
--
-- WHAT WAS BROKEN. `comms-a2p-register` blocks brand filing until `missingProfile()` is
-- empty, and that list requires `authorized_representative_first_name`,
-- `authorized_representative_email` and `authorized_representative_business_title` on
-- `tenant_legal_profile`. The Setup save path that shipped in 20261020020000 derived all
-- three from the chosen Team member. The persistence repair in 20261046000000 REPLACED
-- `save_solo_setup_identity` and its upsert kept only `authorized_representative_user_id`,
-- `_phone` and `_job_position` — the three derived columns were dropped from both the
-- INSERT and the ON CONFLICT list, and `save_tenant_legal_profile_owner` never wrote them
-- either. Verified 2026-09-04: no function in `supabase/migrations`, and no code path in
-- `src/`, writes those columns today.
--
-- The owner-visible consequence is total, and matches what the owner reported: a workspace
-- names its representative in Setup, saves, and Registration still reports "authorized
-- representative, representative email, representative title" missing — forever. Because
-- `missing_profile_fields` can never empty, the "Business profile" stage never completes
-- and "Start secure brand registration" stays disabled. The registration cannot be filed
-- at all. That is a capability that silently regressed (§58) and a job the owner cannot
-- finish on his own platform (§70).
--
-- WHY A TRIGGER RATHER THAN A FOURTH COPY OF THE UPSERT. These four columns are a
-- denormalisation of a row that is already identified by `authorized_representative_user_id`.
-- Two functions write this table today and a third could tomorrow; re-adding the derivation
-- to each is the arrangement that already drifted once. Deriving it once, at the table, is
-- correct for every producer by construction (§18, §37) and cannot fall out of step with
-- the FK it is derived from.
--
-- SCOPE. Derivation only. This changes no authorization, adds no grant, and creates no new
-- caller. Who may write `tenant_legal_profile` is unchanged: `save_solo_setup_identity`
-- (Owner-only, `solo_setup_access_scope() = 'owner_full'`) and
-- `save_tenant_legal_profile_owner` (Owner or platform owner). The representative must
-- already be an ACTIVE member of the same tenant — the callers check it, and this rechecks
-- it rather than trusting that they did, so a membership that ends stops carrying a name
-- into a carrier filing.

begin;

create or replace function public.sync_a2p_representative_identity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_first text;
  v_last text;
  v_full text;
  v_email text;
  v_title text;
begin
  -- No representative named: carry nothing. Never leave a previous person's name and
  -- email attached to a business that has since chosen someone else, or nobody.
  if new.authorized_representative_user_id is null then
    new.authorized_representative_first_name := null;
    new.authorized_representative_last_name := null;
    new.authorized_representative_email := null;
    new.authorized_representative_business_title := null;
    return new;
  end if;

  -- Same-tenant AND still active. A representative who has left the Team is not a
  -- representative, and their identity must not travel into a carrier record.
  select p.first_name, p.last_name, p.full_name, u.email,
         coalesce(tm.role::text, case when tm.is_owner then 'owner' end)
    into v_first, v_last, v_full, v_email, v_title
    from public.tenant_members tm
    join auth.users u on u.id = tm.user_id
    left join public.profiles p on p.user_id = tm.user_id
   where tm.tenant_id = new.tenant_id
     and tm.user_id = new.authorized_representative_user_id
     and tm.status = 'active'
   order by tm.is_owner desc
   limit 1;

  if not found then
    new.authorized_representative_first_name := null;
    new.authorized_representative_last_name := null;
    new.authorized_representative_email := null;
    new.authorized_representative_business_title := null;
    return new;
  end if;

  -- A single stored full name still has to produce the two the carrier asks for.
  if nullif(btrim(coalesce(v_first,'')),'') is null and nullif(btrim(coalesce(v_full,'')),'') is not null then
    v_first := split_part(btrim(v_full), ' ', 1);
    v_last := nullif(btrim(substr(btrim(v_full), char_length(v_first) + 1)), '');
  end if;

  new.authorized_representative_first_name := nullif(btrim(coalesce(v_first,'')),'');
  new.authorized_representative_last_name := nullif(btrim(coalesce(v_last,'')),'');
  new.authorized_representative_email := nullif(btrim(coalesce(v_email,'')),'');
  new.authorized_representative_business_title := nullif(btrim(coalesce(v_title,'')),'');
  return new;
end;
$$;

comment on function public.sync_a2p_representative_identity() is
  'Derives the carrier-required representative name, email and business title from the named active Team member. Derivation only: it grants nothing and changes no authorization.';

-- No caller may invoke this directly; it exists for the table.
revoke all on function public.sync_a2p_representative_identity() from public, anon, authenticated;

drop trigger if exists trg_sync_a2p_representative_identity on public.tenant_legal_profile;
create trigger trg_sync_a2p_representative_identity
  before insert or update of authorized_representative_user_id, tenant_id
  on public.tenant_legal_profile
  for each row
  execute function public.sync_a2p_representative_identity();

-- Backfill. Every workspace that already named a representative has been blocked from
-- filing since 20261046000000; this is what unblocks the ones that exist today.
--
-- It re-writes `authorized_representative_user_id` to its own value. Naming the column in
-- the SET list is what fires an `UPDATE OF` trigger — Postgres fires on the column being
-- assigned, not on the value changing — so the derivation above is the ONE that runs here
-- too. A backfill that re-implemented the same joins would be a second copy of the logic
-- this migration exists to stop having copies of, and the first to drift.
update public.tenant_legal_profile
   set authorized_representative_user_id = authorized_representative_user_id
 where authorized_representative_user_id is not null
   and (authorized_representative_first_name is null
     or authorized_representative_email is null
     or authorized_representative_business_title is null);

commit;
