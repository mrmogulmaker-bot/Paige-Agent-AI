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
  tC uuid := 'cc000000-0000-4000-8000-0000000000c3';  -- tenant with NO legal profile
  uC uuid := 'cc000000-0000-4000-8000-0000000000c4';
  tD uuid := 'dd000000-0000-4000-8000-0000000000d1';  -- service-role target, untouched by other cases
  uD uuid := 'dd000000-0000-4000-8000-0000000000d2';
  n bigint; out text := E'\n'; fails int := 0; allowed boolean;
  v_sub timestamptz; v_status text; v_a2p text; v_pay jsonb; v_use text; v_desc_after text; v_optin_after text; v_hint text;
  SAMPLES constant jsonb := '["Reminder: your session is tomorrow at 2pm. Reply STOP to opt out.",
                              "Thanks for booking. Reply STOP to opt out."]'::jsonb;
BEGIN
  INSERT INTO auth.users (id, aud, role, email) VALUES
    (uA,'authenticated','authenticated','a2p-a@t'),
    (uB,'authenticated','authenticated','a2p-b@t'),
    (uNo,'authenticated','authenticated','a2p-none@t'),
    (uC,'authenticated','authenticated','a2p-c@t'),
    (uD,'authenticated','authenticated','a2p-d@t');
  INSERT INTO public.tenants (id, slug, name, account_number_prefix, account_number)
  VALUES (tA,'a2p-a','A2P A','A2A','910001'),(tB,'a2p-b','A2P B','A2B','910002'),
         (tC,'a2p-c','A2P C','A2C','910003'),(tD,'a2p-d','A2P D','A2D','910004');
  INSERT INTO public.tenant_members (tenant_id,user_id,status,role) VALUES
    (tA,uA,'active','owner'),(tB,uB,'active','owner'),(tA,uNo,'active','member'),
    (tC,uC,'active','owner'),(tD,uD,'active','owner');
  -- uD IS IN THIS LIST, and the omission that left it out invalidated four cases.
  -- `has_any_role` reads public.user_roles and NOTHING else — a tenant_members row is a
  -- different table and grants no app_role — so uD failed the save seam's own authority
  -- gate. Cases 15-18 then ran a bare PERFORM with no handler, the FORBIDDEN raise aborted
  -- the whole DO block at case 15, and the two headline guard assertions never executed
  -- while the run still looked like it had something to say. The sibling concurrency proof
  -- got this right for its own second user, which is what makes this an omission rather
  -- than a misunderstanding.
  INSERT INTO public.user_roles (user_id,role)
  VALUES (uA,'admin'),(uB,'admin'),(uC,'admin'),(uD,'admin') ON CONFLICT DO NOTHING;
  DELETE FROM public.user_roles WHERE user_id = uNo;
  INSERT INTO public.tenant_legal_profile (tenant_id, legal_business_name)
  VALUES (tA,'Proof Fixture LLC'),(tB,'Other Fixture LLC'),(tD,'Headless Fixture LLC');   -- tC deliberately has NONE

  -- 1 ── the seam exists, at the SEVEN-FIELD signature, and ONLY that one.
  --      The 5-arg version is dropped rather than left beside the new one: two
  --      overloads make PostgREST's rpc() call ambiguous and let a caller silently
  --      reach the version that drops the three reply fields — the defect being fixed.
  allowed := to_regprocedure('public.tenant_a2p_registration_save_draft(text,text,jsonb,text,uuid,text,text,text)') IS NOT NULL
         AND to_regprocedure('public.tenant_a2p_registration_save_draft(text,text,jsonb,text,uuid)') IS NULL;
  out := out||format('  1. save-draft seam exists (7-field, no overload) %s   want t%s', allowed, E'\n');
  IF NOT allowed THEN
    RAISE EXCEPTION 'A2P DRAFT PROOF: 1 ASSERTION(S) FAILED — no durable save seam; cases 2-9 unreachable.%', out;
  END IF;

  -- 1b ── NO STRUCTURAL PIN. A real cross-tenant authorization test instead.
  --
  --   The previous version asserted on the shipped function TEXT, because
  --   trg_tenant_a2p_registrations_tenant re-stamps tenant_id on INSERT and so
  --   hides a redirected write. An independent review defeated that pin with a
  --   semantically-equivalent rewrite -- it kept the literal the pin matched and
  --   added `if p_tenant_id is not null then v_tenant := p_tenant_id; end if;`
  --   one line later -- and scored 13/13 while running a full cross-tenant IDOR.
  --   The tell was in the output and no assertion cared: tenant B's call wrote an
  --   AUDIT ROW under tenant A's tenant_id, and read A's legal profile and A's
  --   submission state on the way.
  --
  --   So the boundary is now measured, not described. Case 5 below counts EVERY
  --   trace a foreign caller could leave in tenant A -- registration content and
  --   audit rows -- which is what the trigger cannot launder.
  SELECT count(*) INTO n FROM public.paige_audit_log WHERE tenant_id = tA;
  out := out||format('  1b. tenant A audit baseline ................... %s   want 0%s', n, E'\n');
  IF n <> 0 THEN fails := fails + 1; END IF;

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

  -- 5 ── TENANT ISOLATION, measured by EVERY trace a foreign caller can leave.
  PERFORM set_config('role','authenticated',true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub',uB,'role','authenticated')::text, true);
  -- The RESULT is captured, not discarded. PERFORM throws the return value away, and an
  -- escape that READS across the boundary and never writes leaves no row and no audit row
  -- to count -- so every assertion below would pass while the function handed tenant B
  -- tenant A's legal name and registration state. A read-only IDOR is still an IDOR.
  v_pay := NULL;
  BEGIN v_pay := public.tenant_a2p_registration_save_draft('marketing','Tenant B copy', SAMPLES, NULL, tA);
  EXCEPTION WHEN OTHERS THEN NULL; END;
  RESET role;
  SELECT use_case INTO v_use FROM public.tenant_a2p_registrations WHERE tenant_id = tA;
  out := out||format('  5. tenant A''s registration untouched ......... %s   want customer care%s', v_use, E'\n');
  IF v_use IS DISTINCT FROM 'customer care' THEN fails := fails + 1; END IF;
  -- The audit trail is the trace the tenant-stamping trigger does NOT correct, so
  -- it is where a redirected call shows up even when the row itself looks right.
  SELECT count(*) INTO n FROM public.paige_audit_log WHERE tenant_id = tA;
  out := out||format('     ...and left NO audit row in tenant A ...... %s   want 1 (only A''s own save)%s', n, E'\n');
  IF n <> 1 THEN fails := fails + 1; END IF;
  -- Non-vacuity: the call must have SUCCEEDED against B's own tenant. A silently
  -- dropped write would otherwise read exactly like correct isolation.
  SELECT count(*) INTO n FROM public.tenant_a2p_registrations WHERE tenant_id = tB AND use_case = 'marketing';
  out := out||format('     ...and B''s own row WAS written ............ %s   want 1%s', n, E'\n');
  IF n <> 1 THEN fails := fails + 1; END IF;
  -- The payload may carry ONLY these keys. Anything else is data crossing the boundary in
  -- the return value rather than in a row -- the one escape route the row and audit counts
  -- above are structurally blind to.
  SELECT coalesce(string_agg(k, ',' ORDER BY k), '(none)') INTO v_use
    FROM jsonb_object_keys(coalesce(v_pay,'{}'::jsonb)) k;
  out := out||format('     ...and returned ONLY its own keys ......... %s%s   want a2p,ok,registration_id,sample_count%s',
                     v_use, '', E'\n');
  IF v_pay IS NOT NULL AND v_use IS DISTINCT FROM 'a2p,ok,registration_id,sample_count' THEN fails := fails + 1; END IF;
  -- ...and the id it returned is B's OWN registration, never A's.
  SELECT count(*) INTO n FROM public.tenant_a2p_registrations
   WHERE id = (v_pay ->> 'registration_id')::uuid AND tenant_id = tB;
  out := out||format('     ...and the id returned is B''s own ......... %s   want 1%s', n, E'\n');
  IF v_pay IS NOT NULL AND n <> 1 THEN fails := fails + 1; END IF;

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

  -- 7b ── the IN-BODY unauthenticated refusal, which case 7 cannot reach.
  --
  --   Case 7 runs as `anon`, and anon holds no EXECUTE grant — so it is refused by
  --   the GRANT before the function body runs. Verified by mutation: deleting the
  --   in-body `if v_uid is null and not v_is_service then raise` left case 7 green.
  --   §59 is explicit that the grant is never the guard, so the guard needs a caller
  --   that HAS execute and still has no identity: role `authenticated` with a claim
  --   carrying no `sub`. auth.uid() is then null and the claim role is not
  --   service_role, so only the in-body check can refuse it.
  --
  --   It passes p_tenant_id deliberately. Without it, a caller that got past the
  --   guard would be refused a second time by TENANT_REQUIRED and the case would go
  --   green for the wrong reason. With it, removing the guard writes a row to a
  --   tenant the caller never authenticated as — so the assertion pins the hint,
  --   not merely the refusal.
  PERFORM set_config('role','authenticated',true);
  PERFORM set_config('request.jwt.claims', json_build_object('role','authenticated')::text, true);
  allowed := false; v_hint := NULL;
  BEGIN
    PERFORM public.tenant_a2p_registration_save_draft('no-sub attempt','body', SAMPLES, NULL, tB);
    allowed := true;
  EXCEPTION WHEN OTHERS THEN
    allowed := false;
    GET STACKED DIAGNOSTICS v_hint = PG_EXCEPTION_HINT;
  END;
  RESET role;
  out := out||format('  7b. authenticated-but-no-sub refused .......... refused=%s hint=%s   want t / UNAUTHENTICATED%s',
                     NOT allowed, coalesce(v_hint,'(none)'), E'\n');
  IF allowed OR v_hint IS DISTINCT FROM 'UNAUTHENTICATED' THEN fails := fails + 1; END IF;
  -- ...and tenant B's own prepared copy is untouched by the attempt.
  SELECT use_case INTO v_use FROM public.tenant_a2p_registrations WHERE tenant_id = tB;
  out := out||format('      ...and tenant B copy untouched ............ %s   want marketing%s', coalesce(v_use,'(none)'), E'\n');
  IF v_use IS DISTINCT FROM 'marketing' THEN fails := fails + 1; END IF;

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

  -- 10 ── D3: a registration carrying a CARRIER SID is immutable, even when its
  --        status still reads 'pending'. comms-a2p-submit writes pending/null today,
  --        so a guard keyed only on submitted_at could never fire against the real
  --        submit path and a re-draft silently replaced human-reviewed copy.
  UPDATE public.tenant_a2p_registrations
     SET status = 'pending', submitted_at = NULL, brand_sid = 'BN-CARRIER-LINKED',
         use_case = 'human reviewed copy'
   WHERE tenant_id = tA;
  PERFORM set_config('role','authenticated',true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub',uA,'role','authenticated')::text, true);
  allowed := false;
  BEGIN PERFORM public.tenant_a2p_registration_save_draft('re-draft','overwrite', SAMPLES, NULL, NULL); allowed := true;
  EXCEPTION WHEN OTHERS THEN allowed := false; END;
  RESET role;
  SELECT use_case INTO v_use FROM public.tenant_a2p_registrations WHERE tenant_id = tA;
  out := out||format('  10. carrier-linked row re-drafted ............. %s   want f (use_case %s)%s',
                     allowed, v_use, E'\n');
  IF allowed OR v_use IS DISTINCT FROM 'human reviewed copy' THEN fails := fails + 1; END IF;

  -- 11 ── D4: an absent description/opt-in PRESERVES what is stored. Blanking a
  --        field while returning success was its own defect.
  UPDATE public.tenant_a2p_registrations
     SET brand_sid = NULL, status = 'pending', submitted_at = NULL,
         campaign_description = 'EXISTING DESCRIPTION', optin_flow = 'EXISTING OPTIN'
   WHERE tenant_id = tA;
  PERFORM set_config('role','authenticated',true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub',uA,'role','authenticated')::text, true);
  PERFORM public.tenant_a2p_registration_save_draft('still fine', NULL, SAMPLES, NULL, NULL);
  RESET role;
  SELECT campaign_description, optin_flow INTO v_desc_after, v_optin_after
    FROM public.tenant_a2p_registrations WHERE tenant_id = tA;
  out := out||format('  11. absent fields preserved ................... %s / %s   want EXISTING DESCRIPTION / EXISTING OPTIN%s',
                     coalesce(v_desc_after,'(null)'), coalesce(v_optin_after,'(null)'), E'\n');
  IF v_desc_after IS DISTINCT FROM 'EXISTING DESCRIPTION'
     OR v_optin_after IS DISTINCT FROM 'EXISTING OPTIN' THEN fails := fails + 1; END IF;

  -- 12 ── an APPROVED registration is immutable and is never downgraded.
  UPDATE public.tenant_a2p_registrations
     SET status = 'approved', approved_at = now(), brand_sid = 'BN-APPROVED', use_case = 'approved copy'
   WHERE tenant_id = tA;
  PERFORM set_config('role','authenticated',true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub',uA,'role','authenticated')::text, true);
  allowed := false;
  BEGIN PERFORM public.tenant_a2p_registration_save_draft('downgrade','attempt', SAMPLES, NULL, NULL); allowed := true;
  EXCEPTION WHEN OTHERS THEN allowed := false; END;
  RESET role;
  SELECT status, use_case INTO v_status, v_use FROM public.tenant_a2p_registrations WHERE tenant_id = tA;
  out := out||format('  12. approved row downgraded ................... %s   want f (status %s, use_case %s)%s',
                     allowed, v_status, v_use, E'\n');
  IF allowed OR v_status <> 'approved' OR v_use IS DISTINCT FROM 'approved copy' THEN fails := fails + 1; END IF;

  -- 13 ── D1: PRODUCTION-SHAPED FIRST USE. Every tenant on prod today has NO
  --        tenant_legal_profile row (13 tenants, 0 profiles). The first version of
  --        this proof SEEDED one, which is precisely how it certified a function
  --        that would have refused for 100% of real tenants while the edge function
  --        returned 200. Tenant C is deliberately left without a legal profile.
  PERFORM set_config('role','authenticated',true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub',uC,'role','authenticated')::text, true);
  allowed := false; v_hint := NULL;
  BEGIN
    PERFORM public.tenant_a2p_registration_save_draft('first use','no legal profile yet', SAMPLES, NULL, NULL);
    allowed := true;
  EXCEPTION WHEN OTHERS THEN
    allowed := false;
    GET STACKED DIAGNOSTICS v_hint = PG_EXCEPTION_HINT;
  END;
  RESET role;
  out := out||format('  13. first-use tenant WITHOUT a legal profile .. refused=%s hint=%s   want t / LEGAL_PROFILE_REQUIRED%s',
                     NOT allowed, coalesce(v_hint,'(none)'), E'\n');
  IF allowed OR v_hint IS DISTINCT FROM 'LEGAL_PROFILE_REQUIRED' THEN fails := fails + 1; END IF;
  -- ...and nothing was persisted for it. A refusal that still wrote a row would be
  -- the same silent-success defect wearing a different mask.
  SELECT count(*) INTO n FROM public.tenant_a2p_registrations WHERE tenant_id = tC;
  out := out||format('      ...and persisted nothing .................. %s   want 0%s', n, E'\n');
  IF n <> 0 THEN fails := fails + 1; END IF;

  -- 14 ── THE SERVICE-ROLE PATH (§10, Paige headless). This is the highest-privilege
  --        branch in the function — it is the only caller that may name a tenant and
  --        so the only one that can write outside its own scope — and until now it had
  --        NO coverage at all. Two things must hold: it cannot write anonymously into
  --        an unnamed tenant, and when it does name one the write lands there.
  PERFORM set_config('role','service_role',true);
  PERFORM set_config('request.jwt.claims', json_build_object('role','service_role')::text, true);
  allowed := false; v_hint := NULL;
  BEGIN
    PERFORM public.tenant_a2p_registration_save_draft('headless','no tenant named', SAMPLES, NULL, NULL);
    allowed := true;
  EXCEPTION WHEN OTHERS THEN
    allowed := false; GET STACKED DIAGNOSTICS v_hint = PG_EXCEPTION_HINT;
  END;
  out := out||format('  14. service role without a named tenant ....... refused=%s hint=%s   want t / TENANT_REQUIRED%s',
                     NOT allowed, coalesce(v_hint,'(none)'), E'\n');
  IF allowed OR v_hint IS DISTINCT FROM 'TENANT_REQUIRED' THEN fails := fails + 1; END IF;

  -- ...and a NAMED tenant is honoured — Paige can prepare on a tenant's behalf.
  PERFORM public.tenant_a2p_registration_save_draft('headless care','Prepared by Paige.', SAMPLES, 'website form', tD);
  RESET role;
  SELECT use_case, status, submitted_at INTO v_use, v_status, v_sub
    FROM public.tenant_a2p_registrations WHERE tenant_id = tD;
  out := out||format('      ...named tenant written ................... %s / %s / submitted-null=%s   want headless care / pending / t%s',
                     coalesce(v_use,'(none)'), coalesce(v_status,'(none)'), (v_sub IS NULL), E'\n');
  IF v_use IS DISTINCT FROM 'headless care' OR v_status IS DISTINCT FROM 'pending' OR v_sub IS NOT NULL THEN fails := fails + 1; END IF;
  -- ...and it did NOT leak into the other tenants it never named.
  SELECT count(*) INTO n FROM public.tenant_a2p_registrations
   WHERE tenant_id <> tD AND use_case IN ('headless','headless care');
  out := out||format('      ...and no other tenant touched ............ %s   want 0%s', n, E'\n');
  IF n <> 0 THEN fails := fails + 1; END IF;

  -- 15 ── THE THREE CARRIER-FACING REPLIES SURVIVE THE CALL.
  --        comms-a2p-draft generates seven reviewed fields; only four had a column,
  --        so the durable save silently dropped the opt-in confirmation, the STOP
  --        reply and the HELP reply. A2PTab worked around it by folding them into
  --        optin_flow behind labels, which kept the text and destroyed the structure,
  --        so nothing could read them back. Found by independent review of the
  --        already-deployed head.
  PERFORM set_config('role','authenticated',true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub',uD,'role','authenticated')::text, true);
  PERFORM public.tenant_a2p_registration_save_draft(
            'reply coverage', 'Every reviewed field.', SAMPLES, 'website form', NULL,
            'OPTIN REPLY', 'STOP REPLY', 'HELP REPLY');
  RESET role;
  SELECT optin_message||'/'||optout_message||'/'||help_message INTO v_use
    FROM public.tenant_a2p_registrations WHERE tenant_id = tD;
  out := out||format('  15. three replies persisted ................... %s   want OPTIN REPLY/STOP REPLY/HELP REPLY%s',
                     coalesce(v_use,'(none)'), E'\n');
  IF v_use IS DISTINCT FROM 'OPTIN REPLY/STOP REPLY/HELP REPLY' THEN fails := fails + 1; END IF;

  -- ...and an absent reply PRESERVES the stored one, exactly as optin_flow does.
  -- Blanking reviewed compliance copy while reporting success is the same defect
  -- in a narrower place.
  PERFORM set_config('role','authenticated',true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub',uD,'role','authenticated')::text, true);
  PERFORM public.tenant_a2p_registration_save_draft(
            'reply coverage', 'Second pass.', SAMPLES, NULL, NULL, NULL, NULL, NULL);
  RESET role;
  SELECT optin_message||'/'||optout_message||'/'||help_message INTO v_use
    FROM public.tenant_a2p_registrations WHERE tenant_id = tD;
  out := out||format('      ...and absent replies preserved ........... %s   want OPTIN REPLY/STOP REPLY/HELP REPLY%s',
                     coalesce(v_use,'(none)'), E'\n');
  IF v_use IS DISTINCT FROM 'OPTIN REPLY/STOP REPLY/HELP REPLY' THEN fails := fails + 1; END IF;

  -- ...and the audit row still records only SHAPE. Three more fields is three more
  -- chances to leak reviewed copy into a log that was never meant to hold it.
  -- EVERY audit row for this tenant, not just the newest. The second save passes
  -- NULL replies, so a payload that leaks the TEXT leaks it on the FIRST row — and
  -- an assertion that reads only the latest row cannot see it. Verified by mutation.
  SELECT jsonb_agg(payload) INTO v_pay FROM public.paige_audit_log
   WHERE tenant_id = tD AND action = 'a2p.draft.saved';
  out := out||format('      ...audit leaks reply text ................. %s   want f%s',
                     (v_pay::text ILIKE '%%OPTIN REPLY%%'
                      OR v_pay::text ILIKE '%%STOP REPLY%%'
                      OR v_pay::text ILIKE '%%HELP REPLY%%'), E'\n');
  IF v_pay::text ILIKE '%%OPTIN REPLY%%' OR v_pay::text ILIKE '%%STOP REPLY%%'
     OR v_pay::text ILIKE '%%HELP REPLY%%' THEN fails := fails + 1; END IF;

  -- 16 ── A REVIEWED REPLY THE OWNER DELETES STAYS DELETED.
  --        Preserve-on-absent is right for a field the caller never mentioned and wrong
  --        for one a human cleared. Collapsing the two made these columns permanently
  --        un-clearable: the surface said "saved" and the deleted text came back on the
  --        next read. These are carrier-facing compliance replies — a wrong number in a
  --        STOP reply is exactly the thing a business must be able to remove.
  PERFORM set_config('role','authenticated',true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub',uD,'role','authenticated')::text, true);
  PERFORM public.tenant_a2p_registration_save_draft(
            'clear coverage', 'Third pass.', SAMPLES, NULL, NULL, '', '', '');
  RESET role;
  SELECT coalesce(optin_message,'(null)')||'/'||coalesce(optout_message,'(null)')||'/'||coalesce(help_message,'(null)')
    INTO v_use FROM public.tenant_a2p_registrations WHERE tenant_id = tD;
  out := out||format('  16. cleared replies STAY cleared ............. %s   want (null)/(null)/(null)%s',
                     coalesce(v_use,'(none)'), E'\n');
  IF v_use IS DISTINCT FROM '(null)/(null)/(null)' THEN fails := fails + 1; END IF;

  -- ...and clearing did not disturb the fields the caller never mentioned.
  SELECT use_case INTO v_use FROM public.tenant_a2p_registrations WHERE tenant_id = tD;
  out := out||format('      ...and absent fields still preserved ...... %s   want clear coverage%s',
                     coalesce(v_use,'(none)'), E'\n');
  IF v_use IS DISTINCT FROM 'clear coverage' THEN fails := fails + 1; END IF;

  -- ...and optin_flow — genuinely optional — clears too, while campaign_description does
  -- NOT. That asymmetry is deliberate and it is the seam's rule, not an oversight:
  -- comms-a2p-submit refuses an empty description outright (MISSING_DESCRIPTION) and the
  -- UI blocks it, so a database that accepted the clear would disagree with every path
  -- that can reach it. Required fields preserve; optional fields clear.
  PERFORM set_config('role','authenticated',true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub',uD,'role','authenticated')::text, true);
  PERFORM public.tenant_a2p_registration_save_draft('clear coverage', '', SAMPLES, '', NULL);
  RESET role;
  SELECT coalesce(campaign_description,'(null)')||'/'||coalesce(optin_flow,'(null)')
    INTO v_use FROM public.tenant_a2p_registrations WHERE tenant_id = tD;
  out := out||format('      ...optin_flow clears, desc preserved ...... %s   want Third pass./(null)%s',
                     coalesce(v_use,'(none)'), E'\n');
  IF v_use IS DISTINCT FROM 'Third pass./(null)' THEN fails := fails + 1; END IF;

  -- 17 ── the sample cap is the one 20261004010000 shipped. An earlier revision of the
  --       corrective migration silently tightened it 1024 -> 320 under a header claiming
  --       nothing else changed; independent review caught it.
  PERFORM set_config('role','authenticated',true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub',uD,'role','authenticated')::text, true);
  PERFORM public.tenant_a2p_registration_save_draft(
            'cap coverage', 'Fourth pass.', jsonb_build_array(repeat('x', 900)), NULL, NULL);
  RESET role;
  SELECT length(sample_messages->>0) INTO n FROM public.tenant_a2p_registrations WHERE tenant_id = tD;
  out := out||format('  17. a 900-char sample is not truncated ....... %s   want 900%s', n, E'\n');
  IF n <> 900 THEN fails := fails + 1; END IF;

  -- 18 ── SUBMISSION STATE IS SERVER-OWNED (owner-approved policy repair).
  --        The RLS update/insert policies are row-scoped with NO column restriction, so a
  --        tenant admin could reach PostgREST directly and set submitted_at + a brand SID,
  --        making the surface render "Submitted for review" for something never sent. No
  --        governed carrier-submission path exists yet, so every direct caller fails closed.
  PERFORM set_config('role','authenticated',true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub',uD,'role','authenticated')::text, true);
  allowed := false; v_hint := NULL;
  BEGIN
    UPDATE public.tenant_a2p_registrations
       SET submitted_at = now(), brand_sid = 'BN-FORGED', status = 'submitted'
     WHERE tenant_id = tD;
    allowed := true;
  EXCEPTION WHEN OTHERS THEN
    allowed := false; GET STACKED DIAGNOSTICS v_hint = PG_EXCEPTION_HINT;
  END;
  RESET role;
  out := out||format('  18. tenant admin forges submitted state ...... refused=%s hint=%s   want t / SUBMISSION_STATE_PROTECTED%s',
                     NOT allowed, coalesce(v_hint,'(none)'), E'\n');
  IF allowed OR v_hint IS DISTINCT FROM 'SUBMISSION_STATE_PROTECTED' THEN fails := fails + 1; END IF;

  -- ...and the row is untouched, not merely the statement refused.
  SELECT coalesce(submitted_at::text,'(null)')||'/'||coalesce(brand_sid,'(null)')||'/'||status
    INTO v_use FROM public.tenant_a2p_registrations WHERE tenant_id = tD;
  out := out||format('      ...and the row is unchanged ............... %s   want (null)/(null)/pending%s',
                     coalesce(v_use,'(none)'), E'\n');
  IF v_use IS DISTINCT FROM '(null)/(null)/pending' THEN fails := fails + 1; END IF;

  -- ...and a row cannot be BORN submitted either. The insert policy has the same shape.
  PERFORM set_config('role','authenticated',true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub',uC,'role','authenticated')::text, true);
  allowed := false; v_hint := NULL;
  BEGIN
    INSERT INTO public.tenant_a2p_registrations (tenant_id, use_case, submitted_at, brand_sid)
    VALUES (tC, 'forged at birth', now(), 'BN-FORGED-INSERT');
    allowed := true;
  EXCEPTION WHEN OTHERS THEN
    allowed := false; GET STACKED DIAGNOSTICS v_hint = PG_EXCEPTION_HINT;
  END;
  RESET role;
  out := out||format('      ...and cannot be BORN submitted ........... refused=%s hint=%s   want t / SUBMISSION_STATE_PROTECTED%s',
                     NOT allowed, coalesce(v_hint,'(none)'), E'\n');
  IF allowed OR v_hint IS DISTINCT FROM 'SUBMISSION_STATE_PROTECTED' THEN fails := fails + 1; END IF;

  -- ...while ORDINARY DRAFT EDITING through the same direct path still works. A guard that
  -- also froze the draft copy would have broken the flow it is protecting.
  PERFORM set_config('role','authenticated',true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub',uD,'role','authenticated')::text, true);
  allowed := false;
  BEGIN
    UPDATE public.tenant_a2p_registrations
       SET use_case = 'edited directly', campaign_description = 'still editable'
     WHERE tenant_id = tD;
    allowed := true;
  EXCEPTION WHEN OTHERS THEN allowed := false; END;
  RESET role;
  SELECT use_case INTO v_use FROM public.tenant_a2p_registrations WHERE tenant_id = tD;
  out := out||format('      ...draft fields still editable ............ %s / %s   want t / edited directly%s',
                     allowed, coalesce(v_use,'(none)'), E'\n');
  IF NOT allowed OR v_use IS DISTINCT FROM 'edited directly' THEN fails := fails + 1; END IF;

  -- ...but ONCE IT HAS LEFT PREPARATION the draft copy freezes too (20261004040000).
  -- 030000 protected the eight submission columns and left the seven draft columns
  -- unconditionally editable by a direct caller, so a carrier-APPROVED registration's
  -- copy of record could be rewritten while the tab said it was locked. This is the
  -- case that would pass with 040000 deleted, so it is the one that pins it.
  UPDATE public.tenant_a2p_registrations
     SET status = 'approved', brand_sid = 'BN-PROOF-FROZEN'
   WHERE tenant_id = tD;                       -- as the governed owner, which is allowed
  PERFORM set_config('role','authenticated',true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub',uD,'role','authenticated')::text, true);
  allowed := false; v_hint := NULL;
  BEGIN
    UPDATE public.tenant_a2p_registrations
       SET sample_messages = '["rewritten after filing"]'::jsonb
     WHERE tenant_id = tD;
    allowed := true;
  EXCEPTION WHEN OTHERS THEN
    allowed := false; GET STACKED DIAGNOSTICS v_hint = PG_EXCEPTION_HINT;
  END;
  RESET role;
  out := out||format('      ...filed copy frozen to direct writes ..... refused=%s hint=%s   want t / REGISTRATION_IMMUTABLE%s',
                     NOT allowed, coalesce(v_hint,'(none)'), E'\n');
  IF allowed OR v_hint IS DISTINCT FROM 'REGISTRATION_IMMUTABLE' THEN fails := fails + 1; END IF;

  -- Put it back to pending so the governed-seam case below still measures what it says.
  UPDATE public.tenant_a2p_registrations
     SET status = 'pending', brand_sid = NULL
   WHERE tenant_id = tD;

  -- ...and the GOVERNED seam still moves the row, so the guard did not freeze the product.
  PERFORM set_config('role','authenticated',true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub',uD,'role','authenticated')::text, true);
  PERFORM public.tenant_a2p_registration_save_draft('post guard','Saved through the seam.', SAMPLES, NULL, NULL);
  RESET role;
  SELECT use_case||'/'||status INTO v_use FROM public.tenant_a2p_registrations WHERE tenant_id = tD;
  out := out||format('      ...governed seam still writes ............. %s   want post guard/pending%s',
                     coalesce(v_use,'(none)'), E'\n');
  IF v_use IS DISTINCT FROM 'post guard/pending' THEN fails := fails + 1; END IF;

  -- ...and the canonical resolver STILL reports prepared, never submitted.
  PERFORM set_config('role','authenticated',true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub',uD,'role','authenticated')::text, true);
  v_a2p := (public.tenant_comms_readiness() ->> 'a2p');
  RESET role;
  out := out||format('      ...and readiness still says ............... %s   want prepared%s',
                     coalesce(v_a2p,'(none)'), E'\n');
  IF v_a2p IS DISTINCT FROM 'prepared' THEN fails := fails + 1; END IF;

  -- ...and ANON still cannot touch the table at all (the guard is not the only wall).
  PERFORM set_config('role','anon',true); PERFORM set_config('request.jwt.claims','',true);
  allowed := false;
  BEGIN
    UPDATE public.tenant_a2p_registrations SET use_case = 'anon' WHERE tenant_id = tD;
    allowed := (SELECT count(*) FROM public.tenant_a2p_registrations WHERE use_case = 'anon') > 0;
  EXCEPTION WHEN OTHERS THEN allowed := false; END;
  RESET role;
  out := out||format('      ...anonymous still denied ................. %s   want f%s', allowed, E'\n');
  IF allowed THEN fails := fails + 1; END IF;

  IF fails = 0 THEN RAISE EXCEPTION 'A2P DRAFT PROOF: ALL ASSERTIONS PASSED (rolled back)%', out;
  ELSE RAISE EXCEPTION 'A2P DRAFT PROOF: % ASSERTION(S) FAILED%', fails, out; END IF;
END $proof$;
