-- C-7 — the tenant-scope proof for public.paige_conversations.
--
-- WHAT THIS IS. A single DO block that builds two tenants and four callers,
-- measures the boundary, and then RAISES its results. The RAISE is the point:
-- an exception aborts the block's implicit transaction, so every fixture row and
-- every DDL statement is rolled back. Nothing here persists, by construction
-- rather than by remembering to clean up.
--
-- HOW TO RUN. Against a NON-PRODUCTION database — the Supabase preview branch.
-- Paste as one statement. The results come back in the error body.
--
-- Set PROVE_FIX to false to see the leak, true to see it closed. Both were run
-- while writing this; the recorded outputs are in the PR.
--
-- WHAT THIS DOES NOT DO, STATED PLAINLY. The fix block below is a RETYPED
-- approximation of the migration, not the migration itself — psql's \i is not
-- available through the tooling this was run with. Two shipped statements are
-- therefore absent from it: the `revoke all on function …` and the second
-- backfill pass over `metadata->>'tenant_id'`.
--
-- Those were covered separately rather than left unproven: the migration file's
-- own statements were executed verbatim against the preview branch inside an
-- explicit BEGIN … ROLLBACK, and the resulting `pg_policy` rows were read back to
-- confirm the restrictive policy stayed RESTRICTIVE and lost its NULL disjunct.
-- The persisted-apply confirmation (§32.a) comes from `deploy-migrations.yml` at
-- merge, not from this file. Do not read this proof as "the migration ran".
--
-- WHY A LIVE DATABASE AND NOT A UNIT TEST. The defect is the interaction of a
-- PERMISSIVE policy with a RESTRICTIVE one. Reading the migrations is what
-- produced the first, WRONG diagnosis of this defect (the coach policy was
-- blamed; it does not leak). Only Postgres can settle how five policies combine.
DO $proof$
DECLARE
  PROVE_FIX boolean := true;   -- false = demonstrate the leak; true = demonstrate it closed
  tA uuid := '11111111-1111-4111-8111-111111111111';
  tB uuid := '22222222-2222-4222-8222-222222222222';
  uA uuid := 'aaaa1111-1111-4111-8111-111111111111';  -- tenant A admin  (the intended reader)
  uB uuid := 'bbbb2222-2222-4222-8222-222222222222';  -- tenant B admin  (the attacker)
  uC uuid := 'cccc4444-4444-4444-8444-444444444444';  -- tenant B member, no app_role
  uO uuid := 'eeee5555-5555-4555-8555-555555555555';  -- platform operator
  cA uuid := 'dddd3333-3333-4333-8333-333333333333';
  out text := E'\n'; n bigint;
BEGIN
  INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
  VALUES (uA,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','c7a@example.test','x',now(),now()),
         (uB,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','c7b@example.test','x',now(),now()),
         (uC,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','c7c@example.test','x',now(),now()),
         (uO,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','c7o@example.test','x',now(),now());
  INSERT INTO public.tenants (id, slug, name, account_number_prefix, account_number)
  VALUES (tA,'c7-tenant-a','C7 Tenant A','C7A','900001'), (tB,'c7-tenant-b','C7 Tenant B','C7B','900002');
  INSERT INTO public.tenant_members (tenant_id, user_id, status, role)
  VALUES (tA,uA,'active','owner'), (tB,uB,'active','owner'), (tB,uC,'active','member');
  -- Both are ordinary TENANT admins. public.user_roles has no tenant column, which
  -- is why `has_any_role()` cannot tell one tenant's admin from another's (§59).
  INSERT INTO public.user_roles (user_id, role) VALUES (uA,'admin'), (uB,'admin'), (uO,'super_admin')
  ON CONFLICT DO NOTHING;
  DELETE FROM public.user_roles WHERE user_id = uC;
  INSERT INTO public.clients (id, tenant_id, first_name, last_name, created_by) VALUES (cA, tA, 'C7','Contact', uA);
  -- Exactly what the three writers produced before the repair: no tenant_id.
  -- C7-ORPHAN additionally has no contact — what an unresolved sender yields, and
  -- the one row whose tenant is not recoverable from the row itself.
  INSERT INTO public.paige_conversations (channel, contact_id, direction, body, source_message_id, status, metadata)
  VALUES ('sms', cA,   'inbound', 'private message belonging to tenant A', 'C7-PROOF',  'new', '{}'::jsonb),
         ('sms', NULL, 'inbound', 'unattributable inbound',                'C7-ORPHAN', 'new', '{}'::jsonb);

  IF PROVE_FIX THEN
    EXECUTE $x$ update public.paige_conversations pc set tenant_id = c.tenant_id from public.clients c
               where pc.contact_id = c.id and pc.tenant_id is null and c.tenant_id is not null $x$;
    EXECUTE $x$ create or replace function public.paige_conversations_stamp_tenant()
                returns trigger language plpgsql security definer set search_path to 'public' as $f$
                begin if new.tenant_id is null and new.contact_id is not null then
                  select c.tenant_id into new.tenant_id from public.clients c where c.id = new.contact_id;
                end if; return new; end $f$ $x$;
    EXECUTE $x$ drop trigger if exists trg_paige_conversations_stamp_tenant on public.paige_conversations $x$;
    EXECUTE $x$ create trigger trg_paige_conversations_stamp_tenant before insert on public.paige_conversations
                for each row execute function public.paige_conversations_stamp_tenant() $x$;
    EXECUTE $x$ drop policy if exists "tenant_isolation" on public.paige_conversations $x$;
    EXECUTE $x$ create policy "tenant_isolation" on public.paige_conversations as restrictive for all to authenticated
                using (public.is_platform_owner() or tenant_id = public.current_user_tenant_id())
                with check (public.is_platform_owner() or tenant_id = public.current_user_tenant_id()) $x$;
    EXECUTE $x$ drop policy if exists "Admins manage all conversations" on public.paige_conversations $x$;
    EXECUTE $x$ create policy "Admins manage all conversations" on public.paige_conversations for all to authenticated
                using (public.has_any_role(auth.uid(), ARRAY['admin','super_admin'])
                       and (public.is_platform_owner() or tenant_id = public.current_user_tenant_id()))
                with check (public.has_any_role(auth.uid(), ARRAY['admin','super_admin'])
                       and (public.is_platform_owner() or tenant_id = public.current_user_tenant_id())) $x$;
    SELECT count(*) INTO n FROM public.paige_conversations WHERE source_message_id='C7-PROOF' AND tenant_id=tA;
    out := out || format('  backfill stamped the row with tenant A ............ %s   want 1%s', n, E'\n');
  END IF;

  PERFORM set_config('role','authenticated',true);

  PERFORM set_config('request.jwt.claims', json_build_object('sub',uB,'role','authenticated')::text, true);
  SELECT count(*) INTO n FROM public.paige_conversations WHERE source_message_id='C7-PROOF';
  out := out || format('  WRONG-TENANT admin READS tenant A''s message ...... %s   want %s%s', n, CASE WHEN PROVE_FIX THEN 0 ELSE 1 END, E'\n');
  UPDATE public.paige_conversations SET metadata = metadata || '{"tampered":true}'::jsonb WHERE source_message_id='C7-PROOF';
  GET DIAGNOSTICS n = ROW_COUNT;
  out := out || format('  WRONG-TENANT admin WRITES it (policy is FOR ALL) .. %s   want %s%s', n, CASE WHEN PROVE_FIX THEN 0 ELSE 1 END, E'\n');
  SELECT count(*) INTO n FROM public.paige_conversations WHERE source_message_id='C7-ORPHAN';
  out := out || format('  WRONG-TENANT admin sees the contactless row ....... %s   want %s%s', n, CASE WHEN PROVE_FIX THEN 0 ELSE 1 END, E'\n');

  PERFORM set_config('request.jwt.claims', json_build_object('sub',uA,'role','authenticated')::text, true);
  SELECT count(*) INTO n FROM public.paige_conversations WHERE source_message_id='C7-PROOF';
  out := out || format('  INTENDED tenant-A admin READS .................... %s   want 1%s', n, E'\n');
  UPDATE public.paige_conversations SET metadata = metadata || '{"ok":1}'::jsonb WHERE source_message_id='C7-PROOF';
  GET DIAGNOSTICS n = ROW_COUNT;
  out := out || format('  INTENDED tenant-A admin WRITES ................... %s   want 1%s', n, E'\n');

  PERFORM set_config('request.jwt.claims', json_build_object('sub',uC,'role','authenticated')::text, true);
  SELECT count(*) INTO n FROM public.paige_conversations WHERE source_message_id IN ('C7-PROOF','C7-ORPHAN');
  out := out || format('  wrong-tenant MEMBER (no app_role) sees ........... %s   want 0%s', n, E'\n');

  PERFORM set_config('request.jwt.claims', json_build_object('sub',uO,'role','authenticated')::text, true);
  SELECT count(*) INTO n FROM public.paige_conversations WHERE source_message_id IN ('C7-PROOF','C7-ORPHAN');
  out := out || format('  OPERATOR (super_admin) sees both ................. %s   want 2%s', n, E'\n');

  PERFORM set_config('role','anon',true); PERFORM set_config('request.jwt.claims','',true);
  SELECT count(*) INTO n FROM public.paige_conversations WHERE source_message_id IN ('C7-PROOF','C7-ORPHAN');
  out := out || format('  UNAUTHENTICATED sees ............................. %s   want 0%s', n, E'\n');

  RESET role;
  IF PROVE_FIX THEN
    INSERT INTO public.paige_conversations (channel, contact_id, direction, body, source_message_id, status, metadata)
    VALUES ('sms', cA, 'inbound', 'trigger test', 'C7-TRIGGER', 'new', '{}'::jsonb);
    SELECT count(*) INTO n FROM public.paige_conversations WHERE source_message_id='C7-TRIGGER' AND tenant_id=tA;
    out := out || format('  trigger stamps a tenant-less insert .............. %s   want 1%s', n, E'\n');
  END IF;

  RAISE EXCEPTION 'C7 PROOF (PROVE_FIX=%) — all rolled back%', PROVE_FIX, out;
END $proof$;
