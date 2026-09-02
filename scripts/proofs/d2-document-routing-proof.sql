-- ═════════════════════════════════════════════════════════════════════════════════════════════
-- D2 — document routing. BEFORE/AFTER proof, run in one transaction and rolled back.
--
-- WHY THERE IS A BEFORE LEG. An AFTER-only proof cannot tell "the hole is closed" from "the hole
-- was never open", and a migration that fixes nothing passes one perfectly. So each hole is first
-- demonstrated OPEN against the live policies, then demonstrated closed against the migration's,
-- in the same transaction. The BEFORE leg earned its place on the first run: it proved my written
-- diagnosis of the data-subject function WRONG, which an AFTER-only proof would have hidden.
--
-- MECHANICS, recorded because the first version of this file lost its own evidence. The BEFORE
-- mutations are undone by COMPENSATING WRITES, never ROLLBACK TO SAVEPOINT — a savepoint rollback
-- discards everything since the savepoint, INCLUDING the rows recording what just happened. The
-- first run came back with B1 and B2 simply absent from the output, which reads at a glance like
-- assertions that were never written rather than results that were erased.
--
-- Fixtures are real production rows (two clients in one tenant, one in another). The documents and
-- the note are created here and destroyed by the ROLLBACK; `client_files` and `client_notes` are
-- both empty on production, so nothing pre-existing is touched.
--
-- Actor: b3b0d5a9… — a tenant admin of d8a0a880…, and NOT a platform owner. Asserted as P0,
-- because every clause in these policies has an `is_platform_owner()` escape and an owner actor
-- would make the entire proof vacuous.
--
-- To run: psql "$DB_URL" -v ON_ERROR_STOP=1 -f scripts/proofs/d2-document-routing-proof.sql
-- ═════════════════════════════════════════════════════════════════════════════════════════════

BEGIN;
CREATE TEMP TABLE _p(ord int, res text, label text);
GRANT ALL ON _p TO PUBLIC;

CREATE TEMP TABLE _f AS SELECT
  'b3b0d5a9-1b98-4344-9c0c-5a35616df58b'::uuid AS actor,
  'd8a0a880-1bed-43af-9b5d-e23c4db93106'::uuid AS tenant_a,
  '7eaf8859-91b5-429a-92f1-b78c17eed38f'::uuid AS tenant_b,
  '50695743-902c-4759-816c-51f56ec3d75e'::uuid AS client_a1,
  '53970758-486e-400b-92c5-abe76f24da65'::uuid AS client_a2,
  '3f847a27-e120-4045-a09b-7359e574f5b5'::uuid AS client_b,
  'dddddddd-0000-4000-8000-000000000001'::uuid AS file_1,
  'dddddddd-0000-4000-8000-000000000002'::uuid AS file_up,
  'dddddddd-0000-4000-8000-000000000003'::uuid AS note_1;
GRANT ALL ON _f TO PUBLIC;

-- Fixtures as the owning role, so setup never depends on the policy under test.
INSERT INTO public.client_files (id, contact_id, tenant_id, uploaded_by_user_id, storage_path,
                                 original_filename, mime_type, size_bytes, visibility)
SELECT file_1, client_a1, tenant_a, actor, 'proof/d2/one.pdf', 'D2-PROOF-ONE.pdf', 'application/pdf', 11,
       'internal'::public.client_file_visibility FROM _f
UNION ALL
SELECT file_up, client_a1, tenant_a, actor, 'proof/d2/two.pdf', 'D2-PROOF-CLIENT-UPLOAD.pdf', 'application/pdf', 22,
       'client_upload'::public.client_file_visibility FROM _f;

INSERT INTO public.client_notes (id, contact_id, tenant_id, author_user_id, body)
SELECT note_1, client_a1, tenant_a, actor, 'D2-PROOF-NOTE' FROM _f;

SELECT set_config('request.jwt.claims',
  json_build_object('sub','b3b0d5a9-1b98-4344-9c0c-5a35616df58b','role','authenticated')::text, true);

INSERT INTO _p SELECT 0,
  CASE WHEN NOT public.is_platform_owner()
        AND public.current_user_tenant_id() = (SELECT tenant_a FROM _f)
       THEN 'ok' ELSE 'FAIL' END,
  'P0 the actor is an ordinary tenant admin, not a platform owner - so no clause below is escaped';

-- ═══════════════════════════ BEFORE — the holes, demonstrated open ═══════════════════════════
SET LOCAL ROLE authenticated;

DO $$
DECLARE n int; BEGIN
  UPDATE public.client_files SET contact_id = (SELECT client_b FROM _f)
   WHERE id = (SELECT file_1 FROM _f);
  GET DIAGNOSTICS n = ROW_COUNT;
  INSERT INTO _p VALUES (1, CASE WHEN n = 1 THEN 'ok' ELSE 'FAIL' END,
    'B1 TODAY a document can be moved onto ANOTHER TENANT''s client (rows moved: ' || n || ') - the hole is real');
  UPDATE public.client_files SET contact_id = (SELECT client_a1 FROM _f)
   WHERE id = (SELECT file_1 FROM _f);
EXCEPTION WHEN others THEN
  INSERT INTO _p VALUES (1, 'FAIL', 'B1 expected the move to SUCCEED on the live policy, got ' || SQLSTATE || ' ' || SQLERRM);
END $$;

DO $$
DECLARE n int; BEGIN
  UPDATE public.client_notes SET contact_id = (SELECT client_b FROM _f)
   WHERE id = (SELECT note_1 FROM _f);
  GET DIAGNOSTICS n = ROW_COUNT;
  INSERT INTO _p VALUES (2, CASE WHEN n = 1 THEN 'ok' ELSE 'FAIL' END,
    'B2 TODAY a NOTE can be re-filed onto another tenant''s client too (rows moved: ' || n || ') - D1 closed INSERT only');
  UPDATE public.client_notes SET contact_id = (SELECT client_a1 FROM _f)
   WHERE id = (SELECT note_1 FROM _f);
EXCEPTION WHEN others THEN
  INSERT INTO _p VALUES (2, 'FAIL', 'B2 expected the note re-file to SUCCEED on the live policy, got ' || SQLSTATE || ' ' || SQLERRM);
END $$;

-- A STANDING FINDING, not a before-state: `handle_data_subject_request` is NOT repaired by this
-- migration, and the reasons are written out in full in its header. All four request types fail on
-- the same statement — the `pii_access_log` insert, which runs before the branch on request type —
-- so this is not "the export is broken", it is "the function has never run".
--
-- These assertions are deliberately phrased to go RED when someone repairs it. A proof that keeps
-- passing after the defect is fixed is a proof that has stopped measuring anything, and this one
-- should fail loudly the moment the finding is stale.
--
-- Each iteration is its own sub-block so one failure does not abort the loop.
DO $$
DECLARE r jsonb; t text; ord0 int := 3; BEGIN
  FOREACH t IN ARRAY ARRAY['export','portability','correct','delete'] LOOP
    BEGIN
      r := public.handle_data_subject_request(
            (SELECT tenant_a FROM _f), (SELECT client_a1 FROM _f), t,
            CASE WHEN t = 'correct' THEN '{"city":"D2-PROOF-CITY"}'::jsonb ELSE NULL END, 'd2 proof');
      INSERT INTO _p VALUES (ord0, 'FAIL', 'F1 ' || t || ' NO LONGER RAISES - the finding is stale, update the migration header and delete this assertion');
    EXCEPTION WHEN undefined_column THEN
      INSERT INTO _p VALUES (ord0, 'ok', 'F1 STILL BROKEN (not fixed by this migration): a data-subject ' || t || ' raises 42703 (' || SQLERRM || ')');
    WHEN others THEN
      INSERT INTO _p VALUES (ord0, 'FAIL', 'F1 ' || t || ': expected 42703 undefined_column, got ' || SQLSTATE || ' ' || SQLERRM);
    END;
    ord0 := ord0 + 1;
  END LOOP;
END $$;

-- ═════════════════════════ APPLY THE MIGRATION, IN THIS TRANSACTION ═════════════════════════
RESET ROLE;
\i supabase/migrations/20261036000000_a_document_lands_on_your_own_clients_file.sql

-- ════════════════════════════ AFTER — closed, and still usable ════════════════════════════
SET LOCAL ROLE authenticated;

DO $$
BEGIN
  UPDATE public.client_files SET contact_id = (SELECT client_b FROM _f)
   WHERE id = (SELECT file_1 FROM _f);
  INSERT INTO _p VALUES (10, 'FAIL', 'A1 the cross-tenant move was still allowed');
EXCEPTION WHEN insufficient_privilege THEN
  INSERT INTO _p VALUES (10, 'ok', 'A1 a document can no longer be moved onto another tenant''s client (42501)');
WHEN others THEN
  INSERT INTO _p VALUES (10, 'FAIL', 'A1 expected 42501, got ' || SQLSTATE || ' ' || SQLERRM);
END $$;

DO $$
DECLARE n int; BEGIN
  -- The stamp says tenant B while the destination stays a tenant-A client: the shape that would be
  -- readable by B's admins while attached to A's client.
  UPDATE public.client_files SET tenant_id = (SELECT tenant_b FROM _f)
   WHERE id = (SELECT file_1 FROM _f);
  GET DIAGNOSTICS n = ROW_COUNT;
  INSERT INTO _p VALUES (11, 'FAIL', 'A2 the stamp could still be pointed at another tenant (rows: ' || n || ')');
EXCEPTION WHEN insufficient_privilege THEN
  INSERT INTO _p VALUES (11, 'ok', 'A2 the row''s tenant stamp can no longer disagree with its client''s tenant (42501)');
WHEN others THEN
  INSERT INTO _p VALUES (11, 'FAIL', 'A2 expected 42501, got ' || SQLSTATE || ' ' || SQLERRM);
END $$;

DO $$
DECLARE n int; BEGIN
  UPDATE public.client_files SET contact_id = (SELECT client_a2 FROM _f)
   WHERE id = (SELECT file_1 FROM _f);
  GET DIAGNOSTICS n = ROW_COUNT;
  INSERT INTO _p VALUES (12, CASE WHEN n = 1 THEN 'ok' ELSE 'FAIL' END,
    'A3 a LEGITIMATE re-file within the tenant still works (rows: ' || n || ') - so A1/A2 are not passing because everything is blocked');
EXCEPTION WHEN others THEN
  INSERT INTO _p VALUES (12, 'FAIL', 'A3 the in-tenant re-file was refused: ' || SQLSTATE || ' ' || SQLERRM);
END $$;

DO $$
DECLARE n int; BEGIN
  -- §37: the ContactFilesPanel share toggle. Visibility only, contact unchanged.
  UPDATE public.client_files SET visibility = 'shared' WHERE id = (SELECT file_1 FROM _f);
  GET DIAGNOSTICS n = ROW_COUNT;
  INSERT INTO _p VALUES (13, CASE WHEN n = 1 THEN 'ok' ELSE 'FAIL' END,
    'A4 the existing share toggle in ContactFilesPanel still works (rows: ' || n || ')');
EXCEPTION WHEN others THEN
  INSERT INTO _p VALUES (13, 'FAIL', 'A4 the existing share toggle broke: ' || SQLSTATE || ' ' || SQLERRM);
END $$;

DO $$
BEGIN
  INSERT INTO public.client_files (contact_id, tenant_id, uploaded_by_user_id, storage_path,
                                   original_filename, visibility)
  SELECT client_b, tenant_a, actor, 'proof/d2/foreign.pdf', 'D2-PROOF-FOREIGN.pdf',
         'internal'::public.client_file_visibility FROM _f;
  INSERT INTO _p VALUES (14, 'FAIL', 'A5 a document could still be FILED onto another tenant''s client');
EXCEPTION WHEN insufficient_privilege THEN
  INSERT INTO _p VALUES (14, 'ok', 'A5 a new document cannot be filed onto another tenant''s client (42501)');
WHEN others THEN
  INSERT INTO _p VALUES (14, 'FAIL', 'A5 expected 42501, got ' || SQLSTATE || ' ' || SQLERRM);
END $$;

DO $$
DECLARE n int; BEGIN
  -- §37: the ContactFilesPanel upload path.
  INSERT INTO public.client_files (contact_id, tenant_id, uploaded_by_user_id, storage_path,
                                   original_filename, visibility)
  SELECT client_a2, tenant_a, actor, 'proof/d2/own.pdf', 'D2-PROOF-OWN.pdf',
         'internal'::public.client_file_visibility FROM _f;
  GET DIAGNOSTICS n = ROW_COUNT;
  INSERT INTO _p VALUES (15, CASE WHEN n = 1 THEN 'ok' ELSE 'FAIL' END,
    'A6 the existing upload path still works for the caller''s own client (rows: ' || n || ')');
EXCEPTION WHEN others THEN
  INSERT INTO _p VALUES (15, 'FAIL', 'A6 the existing upload path broke: ' || SQLSTATE || ' ' || SQLERRM);
END $$;

DO $$
BEGIN
  UPDATE public.client_notes SET contact_id = (SELECT client_b FROM _f)
   WHERE id = (SELECT note_1 FROM _f);
  INSERT INTO _p VALUES (16, 'FAIL', 'A7 a note could still be re-filed across tenants');
EXCEPTION WHEN insufficient_privilege THEN
  INSERT INTO _p VALUES (16, 'ok', 'A7 a note can no longer be re-filed onto another tenant''s client (42501)');
WHEN others THEN
  INSERT INTO _p VALUES (16, 'FAIL', 'A7 expected 42501, got ' || SQLSTATE || ' ' || SQLERRM);
END $$;

DO $$
DECLARE n int; BEGIN
  -- §37: the ContactNotesPanel pin toggle.
  UPDATE public.client_notes SET pinned = true WHERE id = (SELECT note_1 FROM _f);
  GET DIAGNOSTICS n = ROW_COUNT;
  INSERT INTO _p VALUES (17, CASE WHEN n = 1 THEN 'ok' ELSE 'FAIL' END,
    'A8 the existing pin toggle in ContactNotesPanel still works (rows: ' || n || ')');
EXCEPTION WHEN others THEN
  INSERT INTO _p VALUES (17, 'FAIL', 'A8 the existing pin toggle broke: ' || SQLSTATE || ' ' || SQLERRM);
END $$;

RESET ROLE;
SELECT res, label FROM _p ORDER BY ord;
ROLLBACK;
