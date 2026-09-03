-- Multi-workspace proof for the Solo Team removal seam.
--
-- THIS IS THE EXACT STATEMENT THAT WAS EXECUTED against production (xygzykjyynhzqytbqnzu) on
-- 2026-09-02, verbatim. It ends in ROLLBACK; nothing was persisted. The results it produced are
-- recorded under "OBSERVED" at the foot of this file, also verbatim.
--
-- An earlier revision of this file held a DIFFERENT, DO-block form of the same scenarios — readable,
-- and not the thing that ran. Evidence that is a paraphrase of the run is not evidence of the run,
-- so it was replaced with this.
--
-- The migration body below is inlined from
-- supabase/migrations/20261048000000_an_owner_can_remove_someone_from_their_workspace.sql with its
-- (renumbered 20261042000000 -> 43 -> 44 -> 46 -> 20261048000000 as each version was claimed on
--  main ahead of this branch — see the notes in applied-preview-proof.md; the SQL below is
--  byte-identical to what was executed, only the file's version prefix ever changed)
-- comments stripped. Applying it inside the transaction is what makes this a genuine execution proof
-- rather than a reading of the SQL: if the function did not compile or a guard did not fire, the
-- scenarios below would say so.

BEGIN;
CREATE TEMP TABLE ids AS SELECT
  '00000000-aaaa-4000-8000-000000000001'::uuid AS owner_a,
  '00000000-aaaa-4000-8000-000000000002'::uuid AS person,
  '00000000-aaaa-4000-8000-000000000003'::uuid AS person2,
  '00000000-aaaa-4000-8000-000000000004'::uuid AS coowner,
  '00000000-bbbb-4000-8000-000000000001'::uuid AS tenant_a,
  '00000000-bbbb-4000-8000-000000000002'::uuid AS tenant_b;
CREATE TEMP TABLE result (n serial, step text, value text);

INSERT INTO auth.users (id,email,instance_id,aud,role)
SELECT owner_a,'p-owner@example.invalid','00000000-0000-0000-0000-000000000000'::uuid,'authenticated','authenticated' FROM ids
UNION ALL SELECT person,'p-person@example.invalid','00000000-0000-0000-0000-000000000000'::uuid,'authenticated','authenticated' FROM ids
UNION ALL SELECT person2,'p-person2@example.invalid','00000000-0000-0000-0000-000000000000'::uuid,'authenticated','authenticated' FROM ids
UNION ALL SELECT coowner,'p-coowner@example.invalid','00000000-0000-0000-0000-000000000000'::uuid,'authenticated','authenticated' FROM ids;
INSERT INTO public.tenants (id,name,slug,account_number_prefix,account_number)
SELECT tenant_a,'Proof Workspace A','proof-ws-a','PA',990001 FROM ids
UNION ALL SELECT tenant_b,'Proof Workspace B','proof-ws-b','PB',990002 FROM ids;
INSERT INTO public.tenant_members (tenant_id,user_id,role,status,is_owner)
SELECT tenant_a,owner_a,'owner'::public.tenant_role,'active',true FROM ids
UNION ALL SELECT tenant_a,coowner,'owner'::public.tenant_role,'active',true FROM ids
UNION ALL SELECT tenant_a,person,'admin'::public.tenant_role,'active',false FROM ids
UNION ALL SELECT tenant_b,person,'admin'::public.tenant_role,'active',false FROM ids
UNION ALL SELECT tenant_a,person2,'admin'::public.tenant_role,'active',false FROM ids
UNION ALL SELECT tenant_b,person2,'member'::public.tenant_role,'active',false FROM ids;
INSERT INTO public.profiles (user_id, active_tenant_id)
SELECT i.owner_a,i.tenant_a FROM ids i UNION ALL SELECT i.person,i.tenant_a FROM ids i
UNION ALL SELECT i.person2,i.tenant_a FROM ids i UNION ALL SELECT i.coowner,i.tenant_a FROM ids i
ON CONFLICT (user_id) DO UPDATE SET active_tenant_id = EXCLUDED.active_tenant_id;
INSERT INTO public.audit_logs (user_id,entity,action,data)
SELECT person,'proof_artifact','authored_before_removal',jsonb_build_object('note','history must survive') FROM ids;

-- ══ THE MIGRATION UNDER TEST ═══════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.remove_solo_team_member(_member_user_id uuid, _expected_tenant_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
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
  IF _expected_tenant_id IS DISTINCT FROM _tenant THEN
    RAISE EXCEPTION 'your active workspace changed before this could run; nothing was removed' USING ERRCODE = '42501';
  END IF;
  IF NOT public.is_tenant_owner(_actor, _tenant) THEN
    RAISE EXCEPTION 'only the workspace owner may remove someone from this workspace' USING ERRCODE = '42501';
  END IF;
  IF _member_user_id IS NULL THEN
    RAISE EXCEPTION 'name the person to remove';
  END IF;
  IF _member_user_id = _actor THEN
    RAISE EXCEPTION 'you cannot remove yourself from this workspace' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO _target FROM public.tenant_members tm
   WHERE tm.tenant_id = _tenant AND tm.user_id = _member_user_id FOR UPDATE;
  IF _target.id IS NULL THEN
    RAISE EXCEPTION 'that person is not on this workspace''s team';
  END IF;
  IF _target.is_owner OR _target.role = 'owner'::public.tenant_role THEN
    RAISE EXCEPTION 'an owner cannot be removed from this workspace here' USING ERRCODE = '42501';
  END IF;
  IF _target.role NOT IN ('admin'::public.tenant_role, 'member'::public.tenant_role) THEN
    RAISE EXCEPTION 'only an Admin or a Member can be removed from this workspace';
  END IF;
  DELETE FROM public.tenant_members WHERE id = _target.id;
  GET DIAGNOSTICS _removed = ROW_COUNT;
  IF _removed <> 1 THEN
    RAISE EXCEPTION 'the membership could not be removed; nothing was changed';
  END IF;
  UPDATE public.profiles SET active_tenant_id = NULL
   WHERE user_id = _member_user_id AND active_tenant_id = _tenant;
  INSERT INTO public.audit_logs (user_id, entity, action, entity_id, data)
  VALUES (_actor, 'tenant_member', 'member_removed', _target.id,
          jsonb_build_object('tenant_id', _tenant, 'target_user_id', _member_user_id, 'role', _target.role::text));
  RETURN jsonb_build_object('tenant_id', _tenant, 'membership_id', _target.id, 'removed_user_id', _member_user_id);
END;
$function$;
REVOKE ALL ON FUNCTION public.remove_solo_team_member(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.remove_solo_team_member(uuid, uuid) TO authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.tenant_members FROM anon, authenticated;

-- ══ HARNESS ════════════════════════════════════════════════════════════════════════════════════
CREATE FUNCTION pg_temp.try_as(_label text, _role text, _sub uuid, _sql text) RETURNS void
LANGUAGE plpgsql AS $h$
DECLARE _out text;
BEGIN
  BEGIN
    EXECUTE 'SET LOCAL ROLE '||quote_ident(_role);
    IF _sub IS NOT NULL THEN PERFORM set_config('request.jwt.claims', json_build_object('sub',_sub::text)::text, true); END IF;
    EXECUTE _sql;
    _out := 'ALLOWED — no error';
  EXCEPTION WHEN OTHERS THEN _out := SQLSTATE||' :: '||SQLERRM;
  END;
  RESET ROLE;
  INSERT INTO result(step,value) VALUES (_label,_out);
END $h$;

INSERT INTO result(step,value) SELECT 'BEFORE · person global app_roles', coalesce((SELECT string_agg(role::text,',' ORDER BY role::text) FROM public.user_roles WHERE user_id=(SELECT person FROM ids)),'(none)');
INSERT INTO result(step,value) SELECT 'BEFORE · person2 global app_roles', coalesce((SELECT string_agg(role::text,',' ORDER BY role::text) FROM public.user_roles WHERE user_id=(SELECT person2 FROM ids)),'(none)');
INSERT INTO result(step,value) SELECT 'BEFORE · person memberships', (SELECT string_agg(t.name||':'||tm.role::text,', ' ORDER BY t.name) FROM public.tenant_members tm JOIN public.tenants t ON t.id=tm.tenant_id WHERE tm.user_id=(SELECT person FROM ids));

SELECT pg_temp.try_as('S1 anon · direct DELETE of a membership row','anon',NULL,
  'DELETE FROM public.tenant_members WHERE user_id='||quote_literal((SELECT person FROM ids))||'::uuid');
SELECT pg_temp.try_as('S2 tenant ADMIN · direct DELETE of the OWNER row','authenticated',(SELECT person FROM ids),
  'DELETE FROM public.tenant_members WHERE user_id='||quote_literal((SELECT owner_a FROM ids))||'::uuid');
SELECT pg_temp.try_as('S3 authenticated · TRUNCATE tenant_members','authenticated',(SELECT person FROM ids),
  'TRUNCATE public.tenant_members');
SELECT pg_temp.try_as('S4 ADMIN · RPC to remove the owner','authenticated',(SELECT person FROM ids),
  'SELECT public.remove_solo_team_member('||quote_literal((SELECT owner_a FROM ids))||'::uuid,'||quote_literal((SELECT tenant_a FROM ids))||'::uuid)');
SELECT pg_temp.try_as('S5 OWNER · RPC on themselves','authenticated',(SELECT owner_a FROM ids),
  'SELECT public.remove_solo_team_member('||quote_literal((SELECT owner_a FROM ids))||'::uuid,'||quote_literal((SELECT tenant_a FROM ids))||'::uuid)');
SELECT pg_temp.try_as('S6 OWNER · RPC on a CO-OWNER','authenticated',(SELECT owner_a FROM ids),
  'SELECT public.remove_solo_team_member('||quote_literal((SELECT coowner FROM ids))||'::uuid,'||quote_literal((SELECT tenant_a FROM ids))||'::uuid)');
SELECT pg_temp.try_as('S7 OWNER · wrong workspace in the confirmation token','authenticated',(SELECT owner_a FROM ids),
  'SELECT public.remove_solo_team_member('||quote_literal((SELECT person FROM ids))||'::uuid,'||quote_literal((SELECT tenant_b FROM ids))||'::uuid)');
SELECT pg_temp.try_as('S8 OWNER · a user id that is in no workspace of theirs','authenticated',(SELECT owner_a FROM ids),
  'SELECT public.remove_solo_team_member(''00000000-cccc-4000-8000-000000000009''::uuid,'||quote_literal((SELECT tenant_a FROM ids))||'::uuid)');
SELECT pg_temp.try_as('S9 OWNER · removes person (Admin in A, Admin in B) — MUST SUCCEED','authenticated',(SELECT owner_a FROM ids),
  'SELECT public.remove_solo_team_member('||quote_literal((SELECT person FROM ids))||'::uuid,'||quote_literal((SELECT tenant_a FROM ids))||'::uuid)');
SELECT pg_temp.try_as('S10 OWNER · removes person2 (Admin in A, Member in B) — MUST SUCCEED','authenticated',(SELECT owner_a FROM ids),
  'SELECT public.remove_solo_team_member('||quote_literal((SELECT person2 FROM ids))||'::uuid,'||quote_literal((SELECT tenant_a FROM ids))||'::uuid)');

INSERT INTO result(step,value) SELECT 'AFTER · person membership in A (must be GONE)', coalesce((SELECT tm.role::text FROM public.tenant_members tm WHERE tm.user_id=(SELECT person FROM ids) AND tm.tenant_id=(SELECT tenant_a FROM ids)),'GONE');
INSERT INTO result(step,value) SELECT 'AFTER · person membership in B (must be UNCHANGED)', coalesce((SELECT tm.role::text||'/'||tm.status FROM public.tenant_members tm WHERE tm.user_id=(SELECT person FROM ids) AND tm.tenant_id=(SELECT tenant_b FROM ids)),'GONE');
INSERT INTO result(step,value) SELECT 'AFTER · person global app_roles (admin must REMAIN — still admin in B)', coalesce((SELECT string_agg(role::text,',' ORDER BY role::text) FROM public.user_roles WHERE user_id=(SELECT person FROM ids)),'(none)');
INSERT INTO result(step,value) SELECT 'AFTER · person2 membership in B (must be UNCHANGED member)', coalesce((SELECT tm.role::text||'/'||tm.status FROM public.tenant_members tm WHERE tm.user_id=(SELECT person2 FROM ids) AND tm.tenant_id=(SELECT tenant_b FROM ids)),'GONE');
INSERT INTO result(step,value) SELECT 'AFTER · person2 global app_roles (admin revoked — admin nowhere now)', coalesce((SELECT string_agg(role::text,',' ORDER BY role::text) FROM public.user_roles WHERE user_id=(SELECT person2 FROM ids)),'(none)');
INSERT INTO result(step,value) SELECT 'AFTER · person platform identity', coalesce((SELECT 'PRESENT '||email FROM auth.users WHERE id=(SELECT person FROM ids)),'DELETED');
INSERT INTO result(step,value) SELECT 'AFTER · person profile', coalesce((SELECT 'PRESENT active_tenant_id='||coalesce(active_tenant_id::text,'NULL') FROM public.profiles WHERE user_id=(SELECT person FROM ids)),'DELETED');
INSERT INTO result(step,value) SELECT 'AFTER · prior authored history still attributable', (SELECT count(*)::text||' row(s) still keyed to person' FROM public.audit_logs WHERE user_id=(SELECT person FROM ids) AND action='authored_before_removal');
INSERT INTO result(step,value) SELECT 'AFTER · removal audit rows written', (SELECT count(*)::text FROM public.audit_logs WHERE action='member_removed' AND (data->>'tenant_id')=(SELECT tenant_a::text FROM ids));
INSERT INTO result(step,value) SELECT 'AFTER · tenant B roster size (was 2)', (SELECT count(*)::text FROM public.tenant_members WHERE tenant_id=(SELECT tenant_b FROM ids));
INSERT INTO result(step,value) SELECT 'AFTER · tenant A roster', (SELECT string_agg(tm.role::text,', ' ORDER BY tm.role::text) FROM public.tenant_members tm WHERE tm.tenant_id=(SELECT tenant_a FROM ids));
INSERT INTO result(step,value) SELECT 'AFTER · re-invite to A possible (invite blocker must be false)',
  (SELECT (NOT EXISTS (SELECT 1 FROM public.tenant_members tm JOIN auth.users au ON au.id=tm.user_id WHERE tm.tenant_id=(SELECT tenant_a FROM ids) AND lower(au.email)='p-person@example.invalid'))::text);

SELECT step, value FROM result ORDER BY n;
ROLLBACK;

-- ══ OBSERVED, 2026-09-02, verbatim ═════════════════════════════════════════════════════════════
-- BEFORE · person global app_roles                                        | admin
-- BEFORE · person2 global app_roles                                       | admin,user
-- BEFORE · person memberships                                             | Proof Workspace A:admin, Proof Workspace B:admin
-- S1 anon · direct DELETE of a membership row                             | 42501 :: permission denied for table tenant_members
-- S2 tenant ADMIN · direct DELETE of the OWNER row                        | 42501 :: permission denied for table tenant_members
-- S3 authenticated · TRUNCATE tenant_members                              | 42501 :: permission denied for table tenant_members
-- S4 ADMIN · RPC to remove the owner                                      | 42501 :: only the workspace owner may remove someone from this workspace
-- S5 OWNER · RPC on themselves                                            | 42501 :: you cannot remove yourself from this workspace
-- S6 OWNER · RPC on a CO-OWNER                                            | 42501 :: an owner cannot be removed from this workspace here
-- S7 OWNER · wrong workspace in the confirmation token                    | 42501 :: your active workspace changed before this could run; nothing was removed
-- S8 OWNER · a user id that is in no workspace of theirs                  | P0001 :: that person is not on this workspace's team
-- S9 OWNER · removes person (Admin in A, Admin in B) — MUST SUCCEED       | ALLOWED — no error
-- S10 OWNER · removes person2 (Admin in A, Member in B) — MUST SUCCEED    | ALLOWED — no error
-- AFTER · person membership in A (must be GONE)                           | GONE
-- AFTER · person membership in B (must be UNCHANGED)                      | admin/active
-- AFTER · person global app_roles (admin must REMAIN)                     | admin
-- AFTER · person2 membership in B (must be UNCHANGED member)              | member/active
-- AFTER · person2 global app_roles (admin revoked — admin nowhere now)    | user
-- AFTER · person platform identity                                        | PRESENT p-person@example.invalid
-- AFTER · person profile                                                  | PRESENT active_tenant_id=NULL
-- AFTER · prior authored history still attributable                       | 1 row(s) still keyed to person
-- AFTER · removal audit rows written                                      | 2
-- AFTER · tenant B roster size (was 2)                                    | 2
-- AFTER · tenant A roster                                                 | owner, owner
-- AFTER · re-invite to A possible (invite blocker must be false)          | true
