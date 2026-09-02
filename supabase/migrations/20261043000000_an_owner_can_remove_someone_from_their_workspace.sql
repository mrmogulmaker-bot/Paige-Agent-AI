-- An owner can remove an Admin or a Member from their own Solo workspace.
--
-- WHAT THIS IS. One access-changing write, and only that. It ends a person's membership of ONE
-- workspace. It does not delete their Paige account, their profile, anything they authored, or any
-- audit history, and it does not reach another tenant. Ownership transfer, multi-owner rules,
-- granular permissions, and the invitation lifecycle are separate assignments and are untouched here.
--
-- WHY A HARD DELETE RATHER THAN A STATUS FLAG. Verified on production 2026-09-02 (ref
-- xygzykjyynhzqytbqnzu) before choosing:
--   * `trg_sync_tenant_member_to_user_roles` is AFTER INSERT OR UPDATE OR DELETE. Its DELETE branch
--     revokes the mapped global app_role iff no other ACTIVE membership still grants it. Its UPDATE
--     branch requires the OLD and NEW roles to differ, so flipping only `status` would NOT revoke
--     it. A soft removal would therefore leave the person's global role grant standing — the exact
--     thing removal is supposed to end.
--   * `tenant_members` carries UNIQUE (tenant_id, user_id), and both `create_solo_team_invite` and
--     `accept_solo_team_invite` test membership with no status filter. A lingering row would make
--     the person permanently un-re-invitable and the removal a one-way door.
--   * Nothing in the database references `tenant_members.id`, so no history is orphaned. Authored
--     records key on `user_id` and are untouched; this function's own audit row preserves who was
--     removed, by whom, and what they held.
-- `public.agency_remove_member` (20260714045732) already deletes on the agency side, so this is the
-- platform's existing shape for the act, not a new one.
--
-- THE SECOND HALF OF THIS MIGRATION IS WHAT MAKES THE FIRST HALF TRUE. A guarded function is not a
-- boundary while the table underneath it is directly writable by the same browser roles. Measured on
-- production 2026-09-02, before and independently of this change:
--   * `GRANT SELECT, INSERT, UPDATE, DELETE ON public.tenant_members TO authenticated`
--     (20260629175341:62), and the "Tenant admins manage members" policy is FOR ALL with
--     (is_platform_owner() OR is_tenant_admin(tenant_id)). So a tenant ADMIN — who must never remove
--     anyone — could DELETE a membership row straight through PostgREST, including every owner's,
--     leaving a workspace nobody can administer. No BEFORE DELETE trigger exists to stop it.
--   * `anon` AND `authenticated` additionally hold TRUNCATE (from project-level default privileges,
--     not from any migration in this repository).
-- TRUNCATE was not assumed to be covered by RLS; it was tested. On a scratch table carrying a
-- deny-everything policy, DELETE as `authenticated` removed 0 of 3 rows while TRUNCATE as
-- `authenticated` removed all 3. RLS does not gate TRUNCATE — only the privilege does.
-- See `docs/evidence/team-removal/` for both transcripts.
--
-- Revoking these is safe, and that is established rather than hoped: EVERY function on production
-- whose body writes public.tenant_members is SECURITY DEFINER owned by `postgres`
-- (accept_invitation, accept_solo_team_invite, accept_tenant_invite, agency_enter_subaccount,
-- change_user_role, grant_co_owner, grant_tenant_member_role, operator_provision_tenant,
-- provision_tenant, provision_tenant_as, revoke_co_owner, revoke_platform_access,
-- revoke_tenant_member_role, set_solo_team_member_permission, set_solo_team_member_work_profile,
-- sync_user_role_to_tenant_member, and this one) — there is not a single SECURITY INVOKER writer, so
-- none of them runs with these privileges. `grep` across src/ and supabase/functions/ finds no
-- .insert/.update/.upsert/.delete against the table from any client. SELECT is deliberately left
-- exactly as it is: roughly ten browser reads depend on it and none of them is destructive.

CREATE OR REPLACE FUNCTION public.remove_solo_team_member(
  _member_user_id uuid,
  _expected_tenant_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  _actor uuid := auth.uid();
  _tenant uuid := public.current_user_tenant_id();
  _target public.tenant_members;
  _removed integer;
BEGIN
  IF _actor IS NULL OR _tenant IS NULL THEN
    RAISE EXCEPTION 'authentication required in an active workspace' USING ERRCODE = '42501';
  END IF;

  -- The workspace this function acts on is `_tenant`, resolved from the session, and nothing else.
  -- `_expected_tenant_id` is refusal-only: it is never read as a scope, never substituted for
  -- `_tenant`, and can only cause this call to FAIL. It exists because `current_user_tenant_id()`
  -- reads `profiles.active_tenant_id`, and switching workspaces writes that column BEFORE the
  -- browser's own state changes — so a confirmation armed against one roster could otherwise be
  -- executed against another workspace the same person also belongs to. The caller states which
  -- workspace it believed it was looking at; a disagreement is an abort, never a redirection.
  IF _expected_tenant_id IS DISTINCT FROM _tenant THEN
    RAISE EXCEPTION 'your active workspace changed before this could run; nothing was removed'
      USING ERRCODE = '42501';
  END IF;

  -- Authority is settled BEFORE the target is looked up, and that order is load-bearing: "that
  -- person is not on this workspace's team" is information, and answering it for a caller who was
  -- never entitled to ask turns a refusal into a membership oracle.
  IF NOT public.is_tenant_owner(_actor, _tenant) THEN
    RAISE EXCEPTION 'only the workspace owner may remove someone from this workspace'
      USING ERRCODE = '42501';
  END IF;

  IF _member_user_id IS NULL THEN
    RAISE EXCEPTION 'name the person to remove';
  END IF;

  IF _member_user_id = _actor THEN
    RAISE EXCEPTION 'you cannot remove yourself from this workspace' USING ERRCODE = '42501';
  END IF;

  -- Locked, and deliberately NOT filtered by status. UNIQUE (tenant_id, user_id) means at most one
  -- row can match, so a status filter could only hide a row — and a hidden row is both unremovable
  -- here and still counted as "already belongs to the workspace" by the invite functions. The lock
  -- matters because grant_co_owner() could otherwise flip this person to an owner between the read
  -- and the write, and no BEFORE DELETE trigger exists to catch the result.
  SELECT * INTO _target
  FROM public.tenant_members tm
  WHERE tm.tenant_id = _tenant
    AND tm.user_id = _member_user_id
  FOR UPDATE;

  IF _target.id IS NULL THEN
    RAISE EXCEPTION 'that person is not on this workspace''s team';
  END IF;

  -- Every owner is refused, which is what makes "the sole owner is never removable" true without
  -- depending on a count that could be got wrong. Removing a co-owner, and transferring ownership,
  -- are a separate assignment.
  IF _target.is_owner OR _target.role = 'owner'::public.tenant_role THEN
    RAISE EXCEPTION 'an owner cannot be removed from this workspace here' USING ERRCODE = '42501';
  END IF;

  -- Second, independent guard on the same invariant, and the scope line of this slice: the roster
  -- shows legacy specialised permissions truthfully and this surface does not relabel or reassign
  -- them, so it refuses to remove one rather than guessing what that would mean.
  IF _target.role NOT IN ('admin'::public.tenant_role, 'member'::public.tenant_role) THEN
    RAISE EXCEPTION 'only an Admin or a Member can be removed from this workspace';
  END IF;

  DELETE FROM public.tenant_members WHERE id = _target.id;
  GET DIAGNOSTICS _removed = ROW_COUNT;
  IF _removed <> 1 THEN
    RAISE EXCEPTION 'the membership could not be removed; nothing was changed';
  END IF;

  -- The removed person's pointer at this workspace is now stale, and nothing else resets it:
  -- guard_active_tenant_membership fires only when active_tenant_id CHANGES, so it never
  -- revalidates a value left behind. It grants no access on its own (current_user_tenant_id()
  -- requires an active membership), but three invitation RPCs read the column RAW, which is how
  -- somebody removed from this workspace would be told they are not the owner of their own.
  -- NULL is the honest value; inventing a replacement workspace would put them in someone's book.
  -- Setting it to NULL is explicitly permitted by that guard, and operator_exit_tenant() does the
  -- same thing for the same reason.
  UPDATE public.profiles
  SET active_tenant_id = NULL
  WHERE user_id = _member_user_id
    AND active_tenant_id = _tenant;

  -- The global app_role is NOT written here. trg_sync_tenant_member_to_user_roles fires AFTER the
  -- DELETE above and revokes the mapped role iff no other active membership still grants it. A
  -- second writer would revoke a role the person still legitimately holds somewhere else.
  INSERT INTO public.audit_logs (user_id, entity, action, entity_id, data)
  VALUES (_actor, 'tenant_member', 'member_removed', _target.id,
          jsonb_build_object('tenant_id', _tenant,
                             'target_user_id', _member_user_id,
                             'role', _target.role::text));

  RETURN jsonb_build_object(
    'tenant_id', _tenant,
    'membership_id', _target.id,
    'removed_user_id', _member_user_id
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.remove_solo_team_member(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.remove_solo_team_member(uuid, uuid) TO authenticated;

COMMENT ON FUNCTION public.remove_solo_team_member(uuid, uuid) IS
  'Owner-only removal of one Admin or Member from the caller''s own active Solo workspace. Actor and '
  'workspace are derived from the session; the tenant argument is a refusal-only confirmation token '
  'and never selects scope. Owners are refused, so the sole owner is unreachable. Deletes the '
  'membership row only: identity, profile, authored records and audit history are untouched, and the '
  'global app_role is left to trg_sync_tenant_member_to_user_roles. This is the SUPPORTED removal '
  'route, not merely the intended one: the same migration revokes INSERT/UPDATE/DELETE/TRUNCATE on '
  'tenant_members from anon and authenticated, so a tenant admin can no longer bypass it.';

-- ── Least privilege on the membership table ──────────────────────────────────────────────────────
-- Reads are untouched. Every destructive verb is withdrawn from both browser roles, so the guarded
-- function above becomes the supported removal route rather than merely the intended one.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.tenant_members FROM anon, authenticated;

COMMENT ON TABLE public.tenant_members IS
  'Workspace membership. Browser roles (anon, authenticated) hold SELECT only: every write runs '
  'through a SECURITY DEFINER function that re-derives the caller and re-checks authority in its '
  'body. TRUNCATE is revoked explicitly because row-level security does not apply to it — measured, '
  'not assumed. Do not re-grant a write verb to a browser role; add or extend a guarded function.';
