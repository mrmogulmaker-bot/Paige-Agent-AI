-- ═════════════════════════════════════════════════════════════════════════════════════════════
-- INT-162 — `tenant_agreement_signings`. The migration is APPLIED inside this transaction and
-- the whole thing is ROLLED BACK, so the database is unchanged when it finishes.
--
-- WHY THE DEFECT-RESTORATION LEGS EXIST, and why they are the point of the file.
--
-- A green assertion proves only that the assertion is satisfied. It does NOT prove the guard it
-- names is what satisfies it — an assertion that would pass with the guard DELETED is vacuous,
-- and vacuous assertions are worse than none, because they retire the question. So three of the
-- guards below are first demonstrated MISSING: the guard is removed, the assertion is shown to
-- FAIL, and the guard is restored and shown to pass again. What that buys is a specific claim —
-- "this predicate is load-bearing" — rather than the general one a green suite always supports.
--
-- MECHANICS, taken from the lesson recorded in `d2-document-routing-proof.sql`. The removals are
-- undone by COMPENSATING WRITES and by re-including the migration, never by ROLLBACK TO
-- SAVEPOINT — a savepoint rollback discards everything since the savepoint, INCLUDING the rows
-- that record what just happened, so the evidence vanishes and the output reads like assertions
-- that were never written.
--
-- FIXTURES are created here and destroyed by the ROLLBACK. Two tenants, an owner in each, a
-- plain member in the first, one client and one offer and one agreement in each. No production
-- row is read or touched.
--
-- THE ACTOR IS ASSERTED AS P0. Every §9 predicate in the migration carries an
-- `is_platform_owner()` escape, so a platform-owner actor would make this entire file vacuous in
-- a way no individual assertion would reveal.
--
-- To run:  psql "$DB_URL" -v ON_ERROR_STOP=1 -f scripts/proofs/int162-signings-proof.sql
-- ═════════════════════════════════════════════════════════════════════════════════════════════

\set ON_ERROR_STOP on

BEGIN;

CREATE TEMP TABLE _p(ord numeric, res text, label text);
GRANT ALL ON _p TO PUBLIC;

CREATE TEMP TABLE _f AS SELECT
  'a0000000-0000-4000-8000-000000000001'::uuid AS tenant_a,
  'b0000000-0000-4000-8000-000000000001'::uuid AS tenant_b,
  'aaaaaaa1-0000-4000-8000-000000000001'::uuid AS admin_a,
  'bbbbbbb1-0000-4000-8000-000000000001'::uuid AS admin_b,
  'aaaaaaa2-0000-4000-8000-000000000001'::uuid AS member_a,
  'c1111111-0000-4000-8000-000000000001'::uuid AS client_a,
  'c2222222-0000-4000-8000-000000000001'::uuid AS client_b,
  '01111111-0000-4000-8000-000000000001'::uuid AS offer_a,
  '02222222-0000-4000-8000-000000000001'::uuid AS offer_b,
  '11111111-0000-4000-8000-000000000001'::uuid AS agreement_a,
  '22222222-0000-4000-8000-000000000001'::uuid AS agreement_b;
GRANT ALL ON _f TO PUBLIC;

-- Raw tokens live ONLY here, for the life of this transaction. The migration returns each one
-- exactly once and never stores it, which is itself asserted below.
CREATE TEMP TABLE _t(label text PRIMARY KEY, signing_id uuid, token text);
GRANT ALL ON _t TO PUBLIC;

-- ─── FIXTURES, as the owning role, so setup never depends on the policy under test ───────────
INSERT INTO auth.users(id, email)
SELECT admin_a,  'harness-owner-a@int162.invalid'  FROM _f UNION ALL
SELECT admin_b,  'harness-owner-b@int162.invalid'  FROM _f UNION ALL
SELECT member_a, 'harness-member-a@int162.invalid' FROM _f;

INSERT INTO public.tenants(id, name, slug)
SELECT tenant_a, 'Harness Workspace A', 'int162-harness-a' FROM _f UNION ALL
SELECT tenant_b, 'Harness Workspace B', 'int162-harness-b' FROM _f;

INSERT INTO public.tenant_members(tenant_id, user_id, role, status)
SELECT tenant_a, admin_a,  'owner'::public.tenant_role,  'active' FROM _f UNION ALL
SELECT tenant_b, admin_b,  'owner'::public.tenant_role,  'active' FROM _f UNION ALL
SELECT tenant_a, member_a, 'member'::public.tenant_role, 'active' FROM _f;

INSERT INTO public.clients(id, tenant_id, created_by, first_name, last_name, email)
SELECT client_a, tenant_a, admin_a, 'Ada', 'Alpha', 'ada@int162.invalid' FROM _f UNION ALL
SELECT client_b, tenant_b, admin_b, 'Bruno', 'Beta', 'bruno@int162.invalid' FROM _f;

INSERT INTO public.tenant_products(id, tenant_id, name, status)
SELECT offer_a, tenant_a, 'Harness Offer A', 'active' FROM _f UNION ALL
SELECT offer_b, tenant_b, 'Harness Offer B', 'active' FROM _f;

INSERT INTO public.tenant_client_agreements
  (id, tenant_id, contact_id, offer_id, term_kind, price_basis,
   agreed_amount_minor, agreed_currency, title)
SELECT agreement_a, tenant_a, client_a, offer_a, 'one_time', 'negotiated',
       250000, 'usd', 'Harness Agreement A' FROM _f UNION ALL
SELECT agreement_b, tenant_b, client_b, offer_b, 'one_time', 'negotiated',
       990000, 'usd', 'Harness Agreement B' FROM _f;

-- ═════════════════════════════ THE MIGRATION UNDER TEST ══════════════════════════════════════
\ir ../../supabase/migrations/20270401000000_tenant_agreement_signings.sql

-- ═════════════════════════════ P0 — the actor is ordinary ════════════════════════════════════
SELECT set_config('request.jwt.claims',
  json_build_object('sub', (SELECT admin_a::text FROM _f), 'role', 'authenticated')::text, true);

INSERT INTO _p SELECT 0,
  CASE WHEN NOT public.is_platform_owner()
        AND public.current_user_tenant_id() = (SELECT tenant_a FROM _f)
        AND public.is_tenant_admin((SELECT tenant_a FROM _f))
       THEN 'ok' ELSE 'FAIL' END,
  'P0 the actor is an ordinary owner of workspace A and NOT a platform owner, so no is_platform_owner() escape is taken anywhere below';

-- ═════════════════════════════ A1 — the §9 IDOR on the contact ═══════════════════════════════
SET LOCAL ROLE authenticated;
DO $$
DECLARE r jsonb; BEGIN
  SELECT public.create_agreement_signing(
    (SELECT tenant_a FROM _f), (SELECT client_b FROM _f), NULL,
    'A1 foreign client', 'tenant_upload', 'body', NULL) INTO r;
  INSERT INTO _p VALUES (1, 'FAIL',
    'A1 a workspace-A owner CREATED a signing against workspace B''s client - the §9 IDOR is OPEN: ' || r::text);
EXCEPTION WHEN others THEN
  INSERT INTO _p VALUES (1, 'ok',
    'A1 a workspace-A owner cannot create a signing for a workspace-B client (refused: ' || SQLERRM || ')');
END $$;
RESET ROLE;

-- ═════════════════════════════ A2 — the §9 IDOR on the agreement ═════════════════════════════
SET LOCAL ROLE authenticated;
DO $$
DECLARE r jsonb; BEGIN
  SELECT public.create_agreement_signing(
    (SELECT tenant_a FROM _f), (SELECT client_a FROM _f), (SELECT agreement_b FROM _f),
    'A2 foreign agreement', 'tenant_upload', 'body', NULL) INTO r;
  INSERT INTO _p VALUES (2, 'FAIL',
    'A2 a workspace-A owner attached workspace B''s AGREEMENT to a signing - the §9 IDOR is OPEN: ' || r::text);
EXCEPTION WHEN others THEN
  INSERT INTO _p VALUES (2, 'ok',
    'A2 a workspace-A owner cannot reference a workspace-B agreement_id (refused: ' || SQLERRM || ')');
END $$;
RESET ROLE;

-- ═════════════════════════════ A3 — the expected-tenant refusal ══════════════════════════════
-- It must REFUSE, never silently write into whichever workspace happens to be active now.
SET LOCAL ROLE authenticated;
DO $$
DECLARE r jsonb; n int; BEGIN
  SELECT public.create_agreement_signing(
    (SELECT tenant_b FROM _f), (SELECT client_a FROM _f), NULL,
    'A3 stale workspace', 'tenant_upload', 'body', NULL) INTO r;
  INSERT INTO _p VALUES (3, 'FAIL',
    'A3 a mismatched _expected_tenant_id was ACCEPTED - the workspace-switch guard is dead: ' || r::text);
EXCEPTION WHEN others THEN
  SELECT count(*) INTO n FROM public.tenant_agreement_signings
   WHERE document_title = 'A3 stale workspace';
  INSERT INTO _p VALUES (3, CASE WHEN SQLSTATE = '42501' AND n = 0 THEN 'ok' ELSE 'FAIL' END,
    'A3 a mismatched _expected_tenant_id refuses with 42501 and writes nothing (got ' || SQLSTATE ||
    ', rows written: ' || n || ')');
END $$;
RESET ROLE;

-- ═════════════════════════════ A4 — a plain member is not an admin ═══════════════════════════
SELECT set_config('request.jwt.claims',
  json_build_object('sub', (SELECT member_a::text FROM _f), 'role', 'authenticated')::text, true);

INSERT INTO _p SELECT 3.5,
  CASE WHEN public.current_user_tenant_id() = (SELECT tenant_a FROM _f)
        AND NOT public.is_tenant_admin((SELECT tenant_a FROM _f))
       THEN 'ok' ELSE 'FAIL' END,
  'A4-pre the member actor really IS an active member of workspace A and really is NOT an admin of it - otherwise A4 would pass for the wrong reason';

SET LOCAL ROLE authenticated;
DO $$
DECLARE r jsonb; BEGIN
  SELECT public.create_agreement_signing(
    (SELECT tenant_a FROM _f), (SELECT client_a FROM _f), NULL,
    'A4 member', 'tenant_upload', 'body', NULL) INTO r;
  INSERT INTO _p VALUES (4, 'FAIL',
    'A4 a NON-ADMIN member created a signing - the authority gate is dead: ' || r::text);
EXCEPTION WHEN others THEN
  INSERT INTO _p VALUES (4, CASE WHEN SQLSTATE = '42501' THEN 'ok' ELSE 'FAIL' END,
    'A4 a non-admin member of the same workspace is refused with 42501 (got ' || SQLSTATE ||
    ': ' || SQLERRM || ')');
END $$;
RESET ROLE;

SELECT set_config('request.jwt.claims',
  json_build_object('sub', (SELECT admin_a::text FROM _f), 'role', 'authenticated')::text, true);

-- ═════════════════════════════ A9 — an NDA has no offer and no price ═════════════════════════
-- Owner ruling 3. Run before A5 because the row it creates is what A5 then tries to lie about.
SET LOCAL ROLE authenticated;
DO $$
DECLARE r jsonb; BEGIN
  SELECT public.create_agreement_signing(
    (SELECT tenant_a FROM _f), (SELECT client_a FROM _f), NULL,
    'Mutual NDA', 'tenant_upload', 'The parties agree to keep it quiet.', NULL) INTO r;
  INSERT INTO _t VALUES ('nda', (r->>'signing_id')::uuid, NULL);
  INSERT INTO _p VALUES (9, CASE WHEN r->>'signature_state' = 'draft' THEN 'ok' ELSE 'FAIL' END,
    'A9 a signing with agreement_id NULL is ACCEPTED and starts in draft (ruling 3 - an NDA has no offer and no price): ' || r::text);
EXCEPTION WHEN others THEN
  INSERT INTO _p VALUES (9, 'FAIL',
    'A9 a NULL agreement_id was REFUSED, so no NDA or scope letter can ever be sent: ' || SQLERRM);
END $$;
RESET ROLE;

-- ═════════════════════════════ A5 — Completed must be evidenced ══════════════════════════════
-- Attempted as the OWNING role, i.e. with RLS out of the way entirely, because the claim is about
-- the CHECK and not about a policy. This is also the exact shape the service-role signing
-- function would write if its upload failed and it carried on regardless.
DO $$
DECLARE n int; BEGIN
  UPDATE public.tenant_agreement_signings
     SET signature_state = 'completed', completed_at = now(),
         signer_name = 'Ada Alpha', consent_read = true, consent_esign = true,
         signed_pdf_path = NULL
   WHERE id = (SELECT signing_id FROM _t WHERE label = 'nda');
  GET DIAGNOSTICS n = ROW_COUNT;
  INSERT INTO _p VALUES (5, 'FAIL',
    'A5 a row was marked COMPLETED with a NULL signed_pdf_path (rows: ' || n ||
    ') - the surface can show a signature whose PDF does not exist');
EXCEPTION WHEN check_violation THEN
  INSERT INTO _p VALUES (5, 'ok',
    'A5 signature_state=completed with signed_pdf_path NULL is REJECTED by the CHECK (' || SQLERRM || ')');
WHEN others THEN
  INSERT INTO _p VALUES (5, 'FAIL', 'A5 expected a check violation, got ' || SQLSTATE || ': ' || SQLERRM);
END $$;

-- ═════════════════════════════ FIXTURE — three signings and their links ══════════════════════
SET LOCAL ROLE authenticated;
DO $$
DECLARE r jsonb; s uuid; BEGIN
  -- The live one, with a real agreement behind it so the peek has an amount to show.
  SELECT public.create_agreement_signing(
    (SELECT tenant_a FROM _f), (SELECT client_a FROM _f), (SELECT agreement_a FROM _f),
    'Coaching engagement letter', 'paige_draft', 'You agree to the engagement.', NULL) INTO r;
  s := (r->>'signing_id')::uuid;
  SELECT public.issue_agreement_signing_link((SELECT tenant_a FROM _f), s, 14) INTO r;
  INSERT INTO _t VALUES ('live', s, r->>'token');

  -- The one that will be voided.
  SELECT public.create_agreement_signing(
    (SELECT tenant_a FROM _f), (SELECT client_a FROM _f), NULL,
    'Withdrawn scope letter', 'tenant_upload', 'Scope, before we changed our mind.', NULL) INTO r;
  s := (r->>'signing_id')::uuid;
  SELECT public.issue_agreement_signing_link((SELECT tenant_a FROM _f), s, 14) INTO r;
  INSERT INTO _t VALUES ('to_void', s, r->>'token');

  -- The one that will be expired.
  SELECT public.create_agreement_signing(
    (SELECT tenant_a FROM _f), (SELECT client_a FROM _f), NULL,
    'Lapsed retainer letter', 'tenant_upload', 'Terms nobody got round to signing.', NULL) INTO r;
  s := (r->>'signing_id')::uuid;
  SELECT public.issue_agreement_signing_link((SELECT tenant_a FROM _f), s, 14) INTO r;
  INSERT INTO _t VALUES ('expired', s, r->>'token');

  -- The one that will be declined.
  SELECT public.create_agreement_signing(
    (SELECT tenant_a FROM _f), (SELECT client_a FROM _f), NULL,
    'Declined proposal letter', 'tenant_upload', 'Terms the client will refuse.', NULL) INTO r;
  s := (r->>'signing_id')::uuid;
  SELECT public.issue_agreement_signing_link((SELECT tenant_a FROM _f), s, 14) INTO r;
  INSERT INTO _t VALUES ('to_decline', s, r->>'token');
END $$;
RESET ROLE;

-- Age the lapsed one past its expiry. Done as the owning role because the product has no
-- "expire this now" seam and inventing one to satisfy a test would be testing the test.
UPDATE public.tenant_agreement_signings
   SET expires_at = now() - interval '1 day'
 WHERE id = (SELECT signing_id FROM _t WHERE label = 'expired');

-- The raw token is returned once and never stored — asserted rather than assumed, because it is
-- the single property that makes a leaked database row useless as a signing credential.
INSERT INTO _p
SELECT 5.5,
  CASE WHEN (SELECT count(*) FROM public.tenant_agreement_signings s, _t t
              WHERE t.label = 'live' AND s.token_hash = t.token) = 0
        AND (SELECT count(*) FROM public.tenant_agreement_signings s, _t t
              WHERE t.label = 'live' AND s.id = t.signing_id
                AND s.token_hash = encode(extensions.digest(t.token, 'sha256'), 'hex')) = 1
       THEN 'ok' ELSE 'FAIL' END,
  'A-token the RAW token appears NOWHERE in the table; the stored value is its SHA-256 and nothing else';

-- ═════════════════════════════ A7 — the valid peek, and what it must not say ═════════════════
SET LOCAL ROLE anon;
DO $$
DECLARE row_ct int; r record; leaked text; BEGIN
  SELECT count(*) INTO row_ct
    FROM public.peek_agreement_signing((SELECT token FROM _t WHERE label = 'live'));
  SELECT * INTO r
    FROM public.peek_agreement_signing((SELECT token FROM _t WHERE label = 'live'));

  -- Not "did it avoid printing the tenant id" but "is there any column that could carry it".
  SELECT string_agg(x, ', ') INTO leaked
    FROM unnest(ARRAY['tenant_id','contact_id','agreement_id','email','support_email','created_by']) x
   WHERE pg_get_function_result('public.peek_agreement_signing(text)'::regprocedure) ILIKE '%' || x || '%';

  INSERT INTO _p VALUES (7,
    CASE WHEN row_ct = 1
          AND r.document_title = 'Coaching engagement letter'
          AND r.document_body IS NOT NULL
          AND r.business_name = 'Harness Workspace A'
          AND r.signer_display_name = 'Ada Alpha'
          AND r.amount_minor = 250000 AND r.amount_currency = 'usd'
          AND r.is_valid
          AND leaked IS NULL
          AND r::text NOT LIKE '%' || (SELECT tenant_a::text FROM _f) || '%'
         THEN 'ok' ELSE 'FAIL' END,
    'A7 a valid token returns the document, the business brand and the signer''s own name, and the function''s RESULT TYPE has no tenant/contact/agreement/email column at all (rows: ' ||
    row_ct || ', forbidden columns: ' || coalesce(leaked, 'none') || ')');

  -- First open moves it to viewed. Asserted separately so a failure here is not read as a leak.
  INSERT INTO _p VALUES (7.5,
    CASE WHEN (SELECT signature_state FROM public.tenant_agreement_signings
                WHERE id = (SELECT signing_id FROM _t WHERE label = 'live')) = 'viewed'
          AND (SELECT viewed_at FROM public.tenant_agreement_signings
                WHERE id = (SELECT signing_id FROM _t WHERE label = 'live')) IS NOT NULL
         THEN 'ok' ELSE 'FAIL' END,
    'A7b the first valid read moves the signing from sent to viewed and stamps viewed_at');
END $$;
RESET ROLE;

-- ═════════════════════════════ A8 — voiding kills the link ═══════════════════════════════════
SET LOCAL ROLE authenticated;
DO $$
DECLARE r jsonb; BEGIN
  SELECT public.void_agreement_signing(
    (SELECT tenant_a FROM _f), (SELECT signing_id FROM _t WHERE label = 'to_void')) INTO r;
  INSERT INTO _p VALUES (8,
    CASE WHEN r->>'signature_state' = 'voided'
          AND (SELECT token_hash FROM public.tenant_agreement_signings
                WHERE id = (SELECT signing_id FROM _t WHERE label = 'to_void')) IS NULL
          AND (SELECT count(*) FROM public.peek_agreement_signing(
                 (SELECT token FROM _t WHERE label = 'to_void'))) = 0
         THEN 'ok' ELSE 'FAIL' END,
    'A8 voiding NULLs the token_hash and the link that was already sent stops resolving - a relabel would have left it working');
EXCEPTION WHEN others THEN
  INSERT INTO _p VALUES (8, 'FAIL', 'A8 void raised ' || SQLSTATE || ': ' || SQLERRM);
END $$;
RESET ROLE;

-- ═════════════════════════════ A6 — no enumeration oracle ════════════════════════════════════
SET LOCAL ROLE anon;
DO $$
DECLARE n_garbage int; n_expired int; n_voided int; n_null int; BEGIN
  SELECT count(*) INTO n_garbage FROM public.peek_agreement_signing(
    'deadbeef00000000000000000000000000000000000000000000000000000000');
  SELECT count(*) INTO n_expired FROM public.peek_agreement_signing(
    (SELECT token FROM _t WHERE label = 'expired'));
  SELECT count(*) INTO n_voided  FROM public.peek_agreement_signing(
    (SELECT token FROM _t WHERE label = 'to_void'));
  SELECT count(*) INTO n_null    FROM public.peek_agreement_signing(NULL);
  INSERT INTO _p VALUES (6,
    CASE WHEN n_garbage = 0 AND n_expired = 0 AND n_voided = 0 AND n_null = 0
         THEN 'ok' ELSE 'FAIL' END,
    'A6 a garbage token, an expired token, a voided token and a null token all return the SAME empty result (' ||
    n_garbage || '/' || n_expired || '/' || n_voided || '/' || n_null ||
    ') - nothing distinguishes "no such link" from "a link you may not use"');
END $$;
RESET ROLE;

-- ═════════════════════════════ A10 — the contract's own CHECK, corrected ═════════════════════
--
-- The contract specified `tas_sent_has_link_ck` as
--   signature_state = 'draft' OR signature_state = 'voided' OR (token_hash IS NOT NULL AND ...)
-- while ALSO requiring decline and completion to NULL the token_hash. Those two cannot both hold.
-- This leg reproduces the contradiction against the literal predicate and then shows the shipped
-- one letting the same call through, so the deviation is evidenced rather than asserted.
ALTER TABLE public.tenant_agreement_signings DROP CONSTRAINT tas_sent_has_link_ck;
ALTER TABLE public.tenant_agreement_signings ADD CONSTRAINT tas_sent_has_link_ck CHECK (
  signature_state = 'draft' OR signature_state = 'voided'
  OR (token_hash IS NOT NULL AND expires_at IS NOT NULL));

SET LOCAL ROLE anon;
DO $$
DECLARE r jsonb; BEGIN
  SELECT public.decline_agreement_signing(
    (SELECT token FROM _t WHERE label = 'to_decline'), 'Not this quarter.') INTO r;
  INSERT INTO _p VALUES (10, 'FAIL',
    'A10a with the CONTRACT''S LITERAL predicate a decline SUCCEEDED (' || r::text ||
    ') - then the deviation shipped in the migration was unnecessary and should be reverted');
EXCEPTION WHEN check_violation THEN
  INSERT INTO _p VALUES (10, 'ok',
    'A10a with the CONTRACT''S LITERAL predicate restored, declining is IMPOSSIBLE - it nulls the token_hash while not being draft or voided (' || SQLERRM || ')');
WHEN others THEN
  INSERT INTO _p VALUES (10, 'FAIL', 'A10a expected a check violation, got ' || SQLSTATE || ': ' || SQLERRM);
END $$;
RESET ROLE;

ALTER TABLE public.tenant_agreement_signings DROP CONSTRAINT tas_sent_has_link_ck;
ALTER TABLE public.tenant_agreement_signings ADD CONSTRAINT tas_sent_has_link_ck CHECK (
  signature_state NOT IN ('sent','viewed')
  OR (token_hash IS NOT NULL AND expires_at IS NOT NULL));

SET LOCAL ROLE anon;
DO $$
DECLARE r jsonb; s public.tenant_agreement_signings; BEGIN
  SELECT public.decline_agreement_signing(
    (SELECT token FROM _t WHERE label = 'to_decline'), 'Not this quarter.') INTO r;
  SELECT * INTO s FROM public.tenant_agreement_signings
   WHERE id = (SELECT signing_id FROM _t WHERE label = 'to_decline');
  INSERT INTO _p VALUES (10.5,
    CASE WHEN (r->>'ok')::boolean AND s.signature_state = 'declined'
          AND s.declined_at IS NOT NULL AND s.token_hash IS NULL
          AND s.decline_reason = 'Not this quarter.'
          AND (SELECT count(*) FROM public.peek_agreement_signing(
                 (SELECT token FROM _t WHERE label = 'to_decline'))) = 0
         THEN 'ok' ELSE 'FAIL' END,
    'A10b with the SHIPPED predicate the same decline lands, records its reason and kills the link');
EXCEPTION WHEN others THEN
  INSERT INTO _p VALUES (10.5, 'FAIL', 'A10b decline raised ' || SQLSTATE || ': ' || SQLERRM);
END $$;
RESET ROLE;

-- Declining twice must not be a second answer. Same {"ok": false} as an unknown token.
SET LOCAL ROLE anon;
DO $$
DECLARE again jsonb; unknown jsonb; BEGIN
  SELECT public.decline_agreement_signing(
    (SELECT token FROM _t WHERE label = 'to_decline'), 'again') INTO again;
  SELECT public.decline_agreement_signing(
    'deadbeef00000000000000000000000000000000000000000000000000000000', 'again') INTO unknown;
  INSERT INTO _p VALUES (10.7,
    CASE WHEN again = unknown AND NOT (again->>'ok')::boolean THEN 'ok' ELSE 'FAIL' END,
    'A10c declining an already-declined link and declining an unknown one return the IDENTICAL value (' ||
    again::text || ' vs ' || unknown::text || ')');
END $$;
RESET ROLE;

-- ╔═══════════════════════════════════════════════════════════════════════════════════════════╗
-- ║  DEFECT RESTORATION. Each guard is removed, shown to be what was doing the work, and put  ║
-- ║  back. An assertion that survives the removal of its own guard is proving nothing.        ║
-- ╚═══════════════════════════════════════════════════════════════════════════════════════════╝

-- ─── V1 — A1's guard, in both of its layers ──────────────────────────────────────────────────
-- Layer one is the RPC's `AND c.tenant_id = _tenant`. Layer two is the table trigger, which
-- exists because `service_role` never runs the RPC at all. Removing them one at a time shows
-- which is doing what, instead of asserting that both matter.
CREATE OR REPLACE FUNCTION public.create_agreement_signing(
  _expected_tenant_id uuid, _contact_id uuid, _agreement_id uuid DEFAULT NULL,
  _document_title text DEFAULT NULL, _document_source text DEFAULT NULL,
  _document_body text DEFAULT NULL, _document_path text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $defect$
DECLARE
  _actor uuid := auth.uid();
  _tenant uuid := public.current_user_tenant_id();
  _row public.tenant_agreement_signings;
BEGIN
  IF _actor IS NULL OR _tenant IS NULL THEN
    RAISE EXCEPTION 'authentication required in an active workspace' USING ERRCODE = '42501';
  END IF;
  IF _expected_tenant_id IS DISTINCT FROM _tenant THEN
    RAISE EXCEPTION 'workspace changed' USING ERRCODE = '42501';
  END IF;
  IF NOT public.is_tenant_admin(_tenant) THEN
    RAISE EXCEPTION 'not an admin' USING ERRCODE = '42501';
  END IF;
  -- THE DEFECT: the `AND c.tenant_id = _tenant` re-check is gone. SECURITY DEFINER means RLS on
  -- `clients` is not there to catch it either.
  PERFORM 1 FROM public.clients c WHERE c.id = _contact_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'that client is not in this workspace'; END IF;
  INSERT INTO public.tenant_agreement_signings
    (tenant_id, contact_id, agreement_id, document_title, document_source,
     document_body, document_path, signature_state, created_by)
  VALUES (_tenant, _contact_id, _agreement_id, _document_title, _document_source,
          _document_body, _document_path, 'draft', _actor)
  RETURNING * INTO _row;
  RETURN jsonb_build_object('signing_id', _row.id, 'signature_state', _row.signature_state);
END;
$defect$;

SET LOCAL ROLE authenticated;
DO $$
DECLARE r jsonb; BEGIN
  SELECT public.create_agreement_signing(
    (SELECT tenant_a FROM _f), (SELECT client_b FROM _f), NULL,
    'V1a foreign client', 'tenant_upload', 'body', NULL) INTO r;
  INSERT INTO _p VALUES (11, 'FAIL',
    'V1a with the RPC guard removed the foreign-tenant row LANDED and the trigger did not catch it - the second layer does not exist: ' || r::text);
EXCEPTION WHEN others THEN
  INSERT INTO _p VALUES (11, CASE WHEN SQLSTATE = '42501' THEN 'ok' ELSE 'FAIL' END,
    'V1a with the RPC''s tenant re-check REMOVED, the table trigger still refuses - the second layer is real (' || SQLERRM || ')');
END $$;
RESET ROLE;

DROP TRIGGER trg_signing_tenant_links ON public.tenant_agreement_signings;

SET LOCAL ROLE authenticated;
DO $$
DECLARE r jsonb; n int; BEGIN
  SELECT public.create_agreement_signing(
    (SELECT tenant_a FROM _f), (SELECT client_b FROM _f), NULL,
    'V1b foreign client', 'tenant_upload', 'body', NULL) INTO r;
  SELECT count(*) INTO n FROM public.tenant_agreement_signings s, _f f
   WHERE s.tenant_id = f.tenant_a AND s.contact_id = f.client_b;
  INSERT INTO _p VALUES (12, CASE WHEN n = 1 THEN 'ok' ELSE 'FAIL' END,
    'V1b with BOTH layers removed, workspace A really can write a signing against workspace B''s client (rows: ' ||
    n || ') - so A1 is not vacuous; something has to stop this and both layers do');
EXCEPTION WHEN others THEN
  INSERT INTO _p VALUES (12, 'FAIL',
    'V1b expected the foreign-tenant write to SUCCEED with every guard removed, but it was refused by something else: ' ||
    SQLSTATE || ' ' || SQLERRM || ' - A1 may be passing for a reason this file has not identified');
END $$;
RESET ROLE;

-- Compensating delete, then restore BOTH layers by re-applying the migration. Re-including it is
-- also the only check in this file that the migration is genuinely re-runnable.
DELETE FROM public.tenant_agreement_signings
 WHERE document_title IN ('V1a foreign client', 'V1b foreign client');
\ir ../../supabase/migrations/20270401000000_tenant_agreement_signings.sql

SET LOCAL ROLE authenticated;
DO $$
DECLARE r jsonb; BEGIN
  SELECT public.create_agreement_signing(
    (SELECT tenant_a FROM _f), (SELECT client_b FROM _f), NULL,
    'V1c foreign client', 'tenant_upload', 'body', NULL) INTO r;
  INSERT INTO _p VALUES (13, 'FAIL', 'V1c the guard did not come back: ' || r::text);
EXCEPTION WHEN others THEN
  INSERT INTO _p VALUES (13, 'ok',
    'V1c both layers restored and the foreign-tenant write is refused again (' || SQLERRM || ')');
END $$;
RESET ROLE;

-- ─── V5 — A5's CHECK ─────────────────────────────────────────────────────────────────────────
ALTER TABLE public.tenant_agreement_signings DROP CONSTRAINT tas_completed_is_evidenced_ck;

DO $$
DECLARE n int; BEGIN
  UPDATE public.tenant_agreement_signings
     SET signature_state = 'completed', completed_at = now(),
         signer_name = 'Ada Alpha', consent_read = true, consent_esign = true,
         signed_pdf_path = NULL
   WHERE id = (SELECT signing_id FROM _t WHERE label = 'nda');
  GET DIAGNOSTICS n = ROW_COUNT;
  INSERT INTO _p VALUES (14, CASE WHEN n = 1 THEN 'ok' ELSE 'FAIL' END,
    'V5 with the CHECK dropped, a row really can say COMPLETED while its signed PDF does not exist (rows: ' ||
    n || ') - so A5 is not vacuous; the constraint is the only thing refusing it');
EXCEPTION WHEN others THEN
  INSERT INTO _p VALUES (14, 'FAIL',
    'V5 expected the unevidenced completion to SUCCEED with the CHECK dropped, got ' || SQLSTATE || ': ' || SQLERRM);
END $$;

-- Compensating write first: the constraint cannot be re-added while the row it forbids exists.
UPDATE public.tenant_agreement_signings
   SET signature_state = 'draft', completed_at = NULL, signer_name = NULL,
       consent_read = false, consent_esign = false
 WHERE id = (SELECT signing_id FROM _t WHERE label = 'nda');
ALTER TABLE public.tenant_agreement_signings ADD CONSTRAINT tas_completed_is_evidenced_ck CHECK (
  signature_state <> 'completed' OR (
    signer_name IS NOT NULL AND consent_read AND consent_esign AND signed_pdf_path IS NOT NULL));

DO $$
BEGIN
  UPDATE public.tenant_agreement_signings
     SET signature_state = 'completed', completed_at = now(), signer_name = 'Ada Alpha',
         consent_read = true, consent_esign = true, signed_pdf_path = NULL
   WHERE id = (SELECT signing_id FROM _t WHERE label = 'nda');
  INSERT INTO _p VALUES (15, 'FAIL', 'V5b the CHECK did not come back');
EXCEPTION WHEN check_violation THEN
  INSERT INTO _p VALUES (15, 'ok', 'V5b the CHECK is restored and refuses the unevidenced completion again');
END $$;

-- ─── V6 — A6's indistinguishability ──────────────────────────────────────────────────────────
-- The defective peek keeps the hash lookup and drops only the expiry and terminal-state guards,
-- which is exactly the version a reasonable person writes first.
CREATE OR REPLACE FUNCTION public.peek_agreement_signing(_token text)
RETURNS TABLE (
  document_title text, document_body text, document_path text, business_name text, brand jsonb,
  signer_display_name text, amount_minor bigint, amount_currency text, term_summary text,
  expires_at timestamptz, signature_state text, is_valid boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $defect$
DECLARE _sig public.tenant_agreement_signings; _rb record; BEGIN
  SELECT * INTO _sig FROM public.tenant_agreement_signings
   WHERE token_hash = encode(extensions.digest(coalesce(_token, ''), 'sha256'), 'hex');
  IF _sig.id IS NULL THEN RETURN; END IF;
  -- THE DEFECT: no expiry check, no terminal-state check. It answers for any row it can find.
  SELECT * INTO _rb FROM public.resolve_tenant_brand(_sig.tenant_id);
  document_title := _sig.document_title; document_body := _sig.document_body;
  document_path := _sig.document_path; business_name := _rb.tenant_name;
  brand := '{}'::jsonb; signer_display_name := NULL;
  amount_minor := NULL; amount_currency := NULL; term_summary := NULL;
  expires_at := _sig.expires_at; signature_state := _sig.signature_state;
  is_valid := _sig.expires_at > now();
  RETURN NEXT;
END;
$defect$;
GRANT EXECUTE ON FUNCTION public.peek_agreement_signing(text) TO anon, authenticated;

SET LOCAL ROLE anon;
DO $$
DECLARE n_garbage int; n_expired int; BEGIN
  SELECT count(*) INTO n_garbage FROM public.peek_agreement_signing(
    'deadbeef00000000000000000000000000000000000000000000000000000000');
  SELECT count(*) INTO n_expired FROM public.peek_agreement_signing(
    (SELECT token FROM _t WHERE label = 'expired'));
  INSERT INTO _p VALUES (16, CASE WHEN n_garbage = 0 AND n_expired = 1 THEN 'ok' ELSE 'FAIL' END,
    'V6 with the expiry and terminal-state guards removed, an EXPIRED token returns ' || n_expired ||
    ' row while a garbage token returns ' || n_garbage ||
    ' - the two are distinguishable, which is the enumeration oracle A6 is asserting the absence of');
END $$;
RESET ROLE;

\ir ../../supabase/migrations/20270401000000_tenant_agreement_signings.sql

SET LOCAL ROLE anon;
DO $$
DECLARE n_garbage int; n_expired int; BEGIN
  SELECT count(*) INTO n_garbage FROM public.peek_agreement_signing(
    'deadbeef00000000000000000000000000000000000000000000000000000000');
  SELECT count(*) INTO n_expired FROM public.peek_agreement_signing(
    (SELECT token FROM _t WHERE label = 'expired'));
  INSERT INTO _p VALUES (17, CASE WHEN n_garbage = 0 AND n_expired = 0 THEN 'ok' ELSE 'FAIL' END,
    'V6b the shipped peek is restored and the two are indistinguishable again (' ||
    n_garbage || '/' || n_expired || ')');
END $$;
RESET ROLE;

-- ═════════════════════════════ RESULTS ═══════════════════════════════════════════════════════
SELECT ord, res, label FROM _p ORDER BY ord;

-- FAILED is tested FIRST and its message does not embed the pass label, for the reason
-- `clean-replay.sh` records: the one mechanism whose whole job is telling PASS from FAIL must not
-- be able to match its own success string inside a failing run's body.
DO $$
DECLARE bad int; BEGIN
  SELECT count(*) INTO bad FROM _p WHERE res <> 'ok';
  IF bad > 0 THEN
    RAISE EXCEPTION E'\n\nINT-162 PROOF FAILED - % assertion(s) did not hold:\n%\n',
      bad, (SELECT string_agg('    ' || ord || ' ' || res || '  ' || label, E'\n' ORDER BY ord)
              FROM _p WHERE res <> 'ok');
  END IF;
  RAISE NOTICE E'\n\nINT-162: EVERY ASSERTION HELD (% of %), including the three defect-restoration legs.\n',
    (SELECT count(*) FROM _p), (SELECT count(*) FROM _p);
END $$;

ROLLBACK;
