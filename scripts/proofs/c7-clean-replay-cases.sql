DO $proof$
DECLARE
  tA uuid := '11111111-1111-4111-8111-111111111111';
  tB uuid := '22222222-2222-4222-8222-222222222222';
  uA uuid := 'aaaa1111-1111-4111-8111-111111111111';
  uB uuid := 'bbbb2222-2222-4222-8222-222222222222';
  uC uuid := 'cccc4444-4444-4444-8444-444444444444';
  uO uuid := 'eeee5555-5555-4555-8555-555555555555';
  cA uuid := 'dddd3333-3333-4333-8333-333333333333';
  out text := E'\n'; n bigint; fails int := 0;
  procedure_note text;
BEGIN
  INSERT INTO auth.users (id, aud, role, email) VALUES
    (uA,'authenticated','authenticated','a@t'),(uB,'authenticated','authenticated','b@t'),
    (uC,'authenticated','authenticated','c@t'),(uO,'authenticated','authenticated','o@t');
  INSERT INTO public.tenants (id, slug, name, account_number_prefix, account_number)
  VALUES (tA,'c7-a','C7 A','C7A','900001'),(tB,'c7-b','C7 B','C7B','900002');
  INSERT INTO public.tenant_members (tenant_id,user_id,status,role)
  VALUES (tA,uA,'active','owner'),(tB,uB,'active','owner'),(tB,uC,'active','member');
  INSERT INTO public.user_roles (user_id,role) VALUES (uA,'admin'),(uB,'admin'),(uO,'super_admin')
  ON CONFLICT DO NOTHING;
  DELETE FROM public.user_roles WHERE user_id = uC;
  INSERT INTO public.clients (id,tenant_id,first_name,last_name,created_by) VALUES (cA,tA,'C7','Contact',uA);

  -- Written the way handle-inbound-sms USED to: no tenant_id. The trigger this
  -- migration adds should derive it from the contact.
  INSERT INTO public.paige_conversations (channel,contact_id,direction,body,source_message_id,status,metadata)
  VALUES ('sms',cA,'inbound','private message belonging to tenant A','C7-PROOF','new','{}'::jsonb),
         ('sms',NULL,'inbound','unattributable inbound','C7-ORPHAN','new','{}'::jsonb);

  SELECT count(*) INTO n FROM public.paige_conversations WHERE source_message_id='C7-PROOF' AND tenant_id=tA;
  out := out||format('  trigger derived the tenant from the contact ....... %s   want 1%s',n,E'\n');
  IF n<>1 THEN fails:=fails+1; END IF;

  PERFORM set_config('role','authenticated',true);

  PERFORM set_config('request.jwt.claims',json_build_object('sub',uB,'role','authenticated')::text,true);
  SELECT count(*) INTO n FROM public.paige_conversations WHERE source_message_id='C7-PROOF';
  out := out||format('  WRONG-TENANT admin READS tenant A''s message ...... %s   want 0  (trigger, not policy)%s',n,E'\n');
  IF n<>0 THEN fails:=fails+1; END IF;
  UPDATE public.paige_conversations SET metadata=metadata||'{"x":1}'::jsonb WHERE source_message_id='C7-PROOF';
  GET DIAGNOSTICS n = ROW_COUNT;
  out := out||format('  WRONG-TENANT admin WRITES it (policy is FOR ALL) .. %s   want 0%s',n,E'\n');
  IF n<>0 THEN fails:=fails+1; END IF;
  SELECT count(*) INTO n FROM public.paige_conversations WHERE source_message_id='C7-ORPHAN';
  out := out||format('  WRONG-TENANT admin sees the contactless row ...... %s   want 0  <- THE policy test%s',n,E'\n');
  IF n<>0 THEN fails:=fails+1; END IF;

  PERFORM set_config('request.jwt.claims',json_build_object('sub',uA,'role','authenticated')::text,true);
  SELECT count(*) INTO n FROM public.paige_conversations WHERE source_message_id='C7-PROOF';
  out := out||format('  INTENDED tenant-A admin READS ................... %s   want 1%s',n,E'\n');
  IF n<>1 THEN fails:=fails+1; END IF;
  UPDATE public.paige_conversations SET metadata=metadata||'{"ok":1}'::jsonb WHERE source_message_id='C7-PROOF';
  GET DIAGNOSTICS n = ROW_COUNT;
  out := out||format('  INTENDED tenant-A admin WRITES .................. %s   want 1%s',n,E'\n');
  IF n<>1 THEN fails:=fails+1; END IF;

  PERFORM set_config('request.jwt.claims',json_build_object('sub',uC,'role','authenticated')::text,true);
  SELECT count(*) INTO n FROM public.paige_conversations WHERE source_message_id IN ('C7-PROOF','C7-ORPHAN');
  out := out||format('  wrong-tenant MEMBER (no app_role) sees ........... %s   want 0%s',n,E'\n');
  IF n<>0 THEN fails:=fails+1; END IF;

  PERFORM set_config('request.jwt.claims',json_build_object('sub',uO,'role','authenticated')::text,true);
  SELECT count(*) INTO n FROM public.paige_conversations WHERE source_message_id IN ('C7-PROOF','C7-ORPHAN');
  out := out||format('  OPERATOR (super_admin) sees both ................ %s   want 2%s',n,E'\n');
  IF n<>2 THEN fails:=fails+1; END IF;

  -- anon: on this clean replay `anon` holds no table GRANT at all, so the read is
  -- refused before RLS is consulted. That is STRICTER than hosted (where the grant
  -- exists and RLS does the refusing), and either way the row count seen is zero.
  PERFORM set_config('role','anon',true); PERFORM set_config('request.jwt.claims','',true);
  BEGIN
    SELECT count(*) INTO n FROM public.paige_conversations WHERE source_message_id IN ('C7-PROOF','C7-ORPHAN');
    procedure_note := 'via RLS';
  EXCEPTION WHEN insufficient_privilege THEN
    n := 0; procedure_note := 'denied at GRANT layer';
  END;
  out := out||format('  UNAUTHENTICATED sees ............................ %s   want 0  (%s)%s',n,procedure_note,E'\n');
  IF n<>0 THEN fails:=fails+1; END IF;

  -- ── FALSIFIABILITY, PER CHANGE. The block above is NOT sufficient on its own,
  --    and saying why matters more than the green.
  --
  --    Once the trigger stamps tenant A onto C7-PROOF, the PRE-EXISTING restrictive
  --    policy already refuses a tenant-B admin — `tA <> tB`, no NULL involved. So
  --    the C7-PROOF read/write zeroes above are produced identically by the
  --    UN-fixed policy set: they prove the trigger, not the policy change. The row
  --    that actually exercises the policy change is C7-ORPHAN, which is contactless
  --    and therefore still legitimately NULL after the fix.
  RESET role;

  -- (a) Revert ONLY the restrictive policy's NULL escape.
  --
  --     I expected this to leak and it does NOT — because the admin policy's new
  --     tenant clause independently refuses a NULL row (`tenant_id = current_user_
  --     tenant_id()` is false when tenant_id is NULL). So the two changes are not
  --     "one load-bearing, one decorative": EITHER ALONE closes this leak for an
  --     admin. Recording the corrected reading rather than the assumption I began
  --     with, and asserting the behaviour that is actually true.
  ALTER POLICY "tenant_isolation" ON public.paige_conversations
    USING (public.is_platform_owner() OR tenant_id IS NULL OR tenant_id = public.current_user_tenant_id())
    WITH CHECK (public.is_platform_owner() OR tenant_id IS NULL OR tenant_id = public.current_user_tenant_id());
  PERFORM set_config('role','authenticated',true);
  PERFORM set_config('request.jwt.claims',json_build_object('sub',uB,'role','authenticated')::text,true);
  SELECT count(*) INTO n FROM public.paige_conversations WHERE source_message_id='C7-ORPHAN';
  out := out||format('%s  EITHER-ALONE — revert ONLY the NULL escape, still refused %s   want 0 (admin clause holds)%s',E'\n',n,E'\n');
  IF n<>0 THEN fails:=fails+1; END IF;
  RESET role;
  ALTER POLICY "tenant_isolation" ON public.paige_conversations
    USING (public.is_platform_owner() OR tenant_id = public.current_user_tenant_id())
    WITH CHECK (public.is_platform_owner() OR tenant_id = public.current_user_tenant_id());

  -- (b) Revert ONLY the admin policy's tenant clause. Also still refused — the
  --     restrictive policy holds on its own. The mirror of (a).
  ALTER POLICY "Admins manage all conversations" ON public.paige_conversations
    USING (public.has_any_role(auth.uid(), ARRAY['admin','super_admin']))
    WITH CHECK (public.has_any_role(auth.uid(), ARRAY['admin','super_admin']));
  PERFORM set_config('role','authenticated',true);
  PERFORM set_config('request.jwt.claims',json_build_object('sub',uB,'role','authenticated')::text,true);
  SELECT count(*) INTO n FROM public.paige_conversations WHERE source_message_id='C7-PROOF';
  out := out||format('  DEPTH-ONLY — revert the admin clause, still refused ...... %s   want 0 (by tenant_isolation)%s',n,E'\n');
  IF n<>0 THEN fails:=fails+1; END IF;

  -- (c) BOTH reverted — the true pre-fix state, and the ONLY configuration in which
  --     the leak returns. This is the block that makes the zeroes above meaningful:
  --     it is the same fixture, the same orphan row, no data touched, and the only
  --     difference is the shipped policy pair. THIS is the falsifiability proof;
  --     (a) and (b) establish that each change independently suffices.
  RESET role;
  ALTER POLICY "tenant_isolation" ON public.paige_conversations
    USING (public.is_platform_owner() OR tenant_id IS NULL OR tenant_id = public.current_user_tenant_id())
    WITH CHECK (public.is_platform_owner() OR tenant_id IS NULL OR tenant_id = public.current_user_tenant_id());
  PERFORM set_config('role','authenticated',true);
  PERFORM set_config('request.jwt.claims',json_build_object('sub',uB,'role','authenticated')::text,true);
  SELECT count(*) INTO n FROM public.paige_conversations WHERE source_message_id='C7-ORPHAN';
  out := out||format('  PRE-FIX STATE — wrong-tenant admin reads the orphan ..... %s   want 1%s',n,E'\n');
  IF n<>1 THEN fails:=fails+1; END IF;
  UPDATE public.paige_conversations SET metadata=metadata||'{"x":1}'::jsonb WHERE source_message_id='C7-ORPHAN';
  GET DIAGNOSTICS n = ROW_COUNT;
  out := out||format('  PRE-FIX STATE — ...and WRITES it (FOR ALL) .............. %s   want 1%s',n,E'\n');
  IF n<>1 THEN fails:=fails+1; END IF;

  RESET role;
  IF fails > 0 THEN
    RAISE EXCEPTION 'C7 CLEAN-REPLAY: % ASSERTION(S) FAILED%', fails, out;
  END IF;
  RAISE EXCEPTION 'C7 CLEAN-REPLAY: ALL ASSERTIONS PASSED (rolled back)%', out;
END $proof$;
