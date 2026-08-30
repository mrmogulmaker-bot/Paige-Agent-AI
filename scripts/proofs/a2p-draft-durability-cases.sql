-- =============================================================================
-- A2P registration draft — durability, isolation, capability and honesty proof.
--
-- WHY THIS EXISTS. `comms-a2p-draft` GENERATES a registration draft and returns it
-- in the HTTP response. Across its 309 lines it performs two reads (`user_roles`,
-- `tenants`) and NO insert or upsert, so the prepared draft dies with the response.
-- "Prepare a registration" is the one write the Communications surface is meant to
-- support, and nothing persisted it.
--
-- WHAT THE CONTRACT IS, and why it adds no columns. `tenant_a2p_registrations`
-- already owns the campaign fields (use_case, campaign_description,
-- sample_messages, optin_flow). Legal identity is NOT copied onto it: the tenant's
-- legal_business_name already lives on `tenant_legal_profile` and is READ, never
-- duplicated (§18 one home). So this slice adds one RPC and no storage.
--
-- Runs inside one DO block that always RAISEs, so every fixture rolls back. It uses
-- REAL principals rather than minting auth.users rows, because what is under test
-- is authorization against the real role graph.
--
-- FAILING-FIRST: before the migration exists, case 1 fails and stops the run. That
-- is the recorded gap, not a harness error.
-- =============================================================================
DO $proof$
DECLARE
  tA uuid := 'aa000000-0000-4000-8000-0000000000a1';
  tB uuid := 'bb000000-0000-4000-8000-0000000000b1';
  uA uuid := 'aa000000-0000-4000-8000-0000000000a2';   -- admin of tenant A
  uB uuid := 'bb000000-0000-4000-8000-0000000000b2';   -- admin of tenant B
  uNo uuid := 'cc000000-0000-4000-8000-0000000000c2';  -- active member of A, no role
  n bigint; out text := E'\n'; fails int := 0; allowed boolean;
  v_sub timestamptz; v_status text; v_a2p text; v_pay jsonb; v_use text; v_src text;
  SAMPLES constant jsonb := '["Reminder: your session is tomorrow at 2pm. Reply STOP to opt out.",
                              "Thanks for booking. Reply STOP to opt out."]'::jsonb;
BEGIN
  INSERT INTO auth.users (id, aud, role, email) VALUES
    (uA,'authenticated','authenticated','a2p-a@t'),
    (uB,'authenticated','authenticated','a2p-b@t'),
    (uNo,'authenticated','authenticated','a2p-none@t');
  INSERT INTO public.tenants (id, slug, name, account_number_prefix, account_number)
  VALUES (tA,'a2p-a','A2P A','A2A','910001'),(tB,'a2p-b','A2P B','A2B','910002');
  INSERT INTO public.tenant_members (tenant_id,user_id,status,role) VALUES
    (tA,uA,'active','owner'),(tB,uB,'active','owner'),(tA,uNo,'active','member');
  INSERT INTO public.user_roles (user_id,role) VALUES (uA,'admin'),(uB,'admin') ON CONFLICT DO NOTHING;
  DELETE FROM public.user_roles WHERE user_id = uNo;
  INSERT INTO public.tenant_legal_profile (tenant_id, legal_business_name)
  VALUES (tA,'Proof Fixture LLC'),(tB,'Other Fixture LLC');

  -- 1 ── the seam exists
  allowed := to_regprocedure('public.tenant_a2p_registration_save_draft(text,text,jsonb,text,uuid)') IS NOT NULL;
  out := out||format('  1. save-draft seam exists ...................... %s   want t%s', allowed, E'\n');
  IF NOT allowed THEN
    RAISE EXCEPTION 'A2P DRAFT PROOF: 1 ASSERTION(S) FAILED — no durable save seam; cases 2-9 unreachable.%', out;
  END IF;

  -- 1b ── STRUCTURAL PINS on the two guards behaviour cannot isolate.
  --
  --   A pre-existing BEFORE INSERT trigger, trg_tenant_a2p_registrations_tenant,
  --   stamps tenant_id from the caller's own session. It independently defeats a
  --   redirected write, so case 5 proves the SYSTEM is safe but can never prove
  --   THIS function derives the tenant server-side — verified by mutation: making
  --   the JWT branch honour p_tenant_id left case 5 green because the trigger
  --   corrected it. Likewise an unauthenticated caller is refused a second time by
  --   the service-role branch. Both guards are therefore pinned against the shipped
  --   source, the same way the C-7 policy changes had to be.
  SELECT pg_get_functiondef('public.tenant_a2p_registration_save_draft(text,text,jsonb,text,uuid)'::regprocedure)
    INTO v_src;
  allowed := v_src LIKE '%v_tenant := public.current_user_tenant_id();%'
         AND v_src NOT LIKE '%coalesce(p_tenant_id, public.current_user_tenant_id())%';
  out := out||format('  1b. JWT branch derives tenant server-side ..... %s   want t%s', allowed, E'\n');
  IF NOT allowed THEN fails := fails + 1; END IF;
  allowed := v_src LIKE '%if v_uid is null and not v_is_service then%';
  out := out||format('  1c. unauthenticated caller refused in-body .... %s   want t%s', allowed, E'\n');
  IF NOT allowed THEN fails := fails + 1; END IF;

  -- 2 ── an admin of tenant A durably saves a draft
  PERFORM set_config('role','authenticated',true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub',uA,'role','authenticated')::text, true);
  PERFORM public.tenant_a2p_registration_save_draft('customer care',
            'Appointment reminders and replies.', SAMPLES, 'website form', NULL);
  RESET role;
  SELECT count(*) INTO n FROM public.tenant_a2p_registrations WHERE tenant_id = tA;
  out := out||format('  2. draft persisted for the caller''s tenant .... %s   want 1%s', n, E'\n');
  IF n <> 1 THEN fails := fails + 1; END IF;

  -- 3 ── PREPARED, never submitted or approved
  SELECT status, submitted_at, use_case INTO v_status, v_sub, v_use
    FROM public.tenant_a2p_registrations WHERE tenant_id = tA;
  out := out||format('  3. status=%s submitted_at-null=%s use_case=%s   want pending / t / customer care%s',
                     v_status, (v_sub IS NULL), v_use, E'\n');
  IF v_status <> 'pending' OR v_sub IS NOT NULL OR v_use IS DISTINCT FROM 'customer care' THEN fails := fails + 1; END IF;

  -- 4 ── the canonical resolver reports exactly 'prepared'
  PERFORM set_config('role','authenticated',true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub',uA,'role','authenticated')::text, true);
  v_a2p := (public.tenant_comms_readiness() ->> 'a2p');
  RESET role;
  out := out||format('  4. readiness reports a2p ...................... %s   want prepared%s', v_a2p, E'\n');
  IF v_a2p IS DISTINCT FROM 'prepared' THEN fails := fails + 1; END IF;

  -- 5 ── TENANT ISOLATION: tenant B naming tenant A never redirects the write
  PERFORM set_config('role','authenticated',true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub',uB,'role','authenticated')::text, true);
  BEGIN PERFORM public.tenant_a2p_registration_save_draft('marketing','Tenant B copy', SAMPLES, NULL, tA);
  EXCEPTION WHEN OTHERS THEN NULL; END;
  RESET role;
  SELECT use_case INTO v_use FROM public.tenant_a2p_registrations WHERE tenant_id = tA;
  out := out||format('  5. tenant A''s row still its own ............... %s   want customer care%s', v_use, E'\n');
  IF v_use IS DISTINCT FROM 'customer care' THEN fails := fails + 1; END IF;
  -- Non-vacuity: the call must have SUCCEEDED against B's own tenant. Without this a
  -- write that was silently dropped would read exactly like correct isolation.
  SELECT count(*) INTO n FROM public.tenant_a2p_registrations WHERE tenant_id = tB AND use_case = 'marketing';
  out := out||format('     ...and B''s own row WAS written ............ %s   want 1%s', n, E'\n');
  IF n <> 1 THEN fails := fails + 1; END IF;

  -- 6 ── CAPABILITY: a roleless active member is refused, fail-closed
  IF uNo IS NULL THEN
    out := out||format('  6. role-denial ................................ SKIPPED (no roleless active member)%s', E'\n');
  ELSE
    PERFORM set_config('role','authenticated',true);
    PERFORM set_config('request.jwt.claims', json_build_object('sub',uNo,'role','authenticated')::text, true);
    allowed := false;
    BEGIN PERFORM public.tenant_a2p_registration_save_draft('roleless attempt','body', SAMPLES, NULL, NULL); allowed := true;
    EXCEPTION WHEN OTHERS THEN allowed := false; END;
    RESET role;
    out := out||format('  6. roleless member allowed to save ............ %s   want f%s', allowed, E'\n');
    IF allowed THEN fails := fails + 1; END IF;
  END IF;

  -- 7 ── ANON refused
  PERFORM set_config('role','anon',true); PERFORM set_config('request.jwt.claims','',true);
  allowed := false;
  BEGIN PERFORM public.tenant_a2p_registration_save_draft('anon attempt','body', SAMPLES, NULL, NULL); allowed := true;
  EXCEPTION WHEN OTHERS THEN allowed := false; END;
  RESET role;
  out := out||format('  7. anon allowed to save ....................... %s   want f%s', allowed, E'\n');
  IF allowed THEN fails := fails + 1; END IF;

  -- 8 ── a SUBMITTED registration is never silently rewritten by a draft save
  UPDATE public.tenant_a2p_registrations SET submitted_at = now(), status = 'submitted' WHERE tenant_id = tA;
  PERFORM set_config('role','authenticated',true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub',uA,'role','authenticated')::text, true);
  allowed := false;
  BEGIN PERFORM public.tenant_a2p_registration_save_draft('changed','after submit', SAMPLES, NULL, NULL); allowed := true;
  EXCEPTION WHEN OTHERS THEN allowed := false; END;
  RESET role;
  SELECT status, submitted_at, use_case INTO v_status, v_sub, v_use
    FROM public.tenant_a2p_registrations WHERE tenant_id = tA;
  out := out||format('  8. save refused after submission .............. %s   want f (status %s, use_case %s)%s',
                     allowed, v_status, v_use, E'\n');
  IF allowed OR v_sub IS NULL OR v_use IS DISTINCT FROM 'customer care' THEN fails := fails + 1; END IF;

  -- 9 ── PROVENANCE on the EXISTING audit seam, carrying no draft content
  SELECT count(*) INTO n FROM public.paige_audit_log WHERE tenant_id = tA AND action LIKE 'a2p.draft%';
  out := out||format('  9. audit provenance rows ...................... %s   want >=1%s', n, E'\n');
  IF n < 1 THEN fails := fails + 1; END IF;
  SELECT coalesce(jsonb_agg(payload),'[]'::jsonb) INTO v_pay
    FROM public.paige_audit_log WHERE tenant_id = tA AND action LIKE 'a2p.draft%';
  allowed := v_pay::text ILIKE '%Reply STOP%' OR v_pay::text ILIKE '%Appointment reminders%'
          OR v_pay::text ILIKE '%customer care%';
  out := out||format('     payload leaks draft content ................ %s   want f%s', allowed, E'\n');
  IF allowed THEN fails := fails + 1; END IF;

  IF fails = 0 THEN RAISE EXCEPTION 'A2P DRAFT PROOF: ALL ASSERTIONS PASSED (rolled back)%', out;
  ELSE RAISE EXCEPTION 'A2P DRAFT PROOF: % ASSERTION(S) FAILED%', fails, out; END IF;
END $proof$;
