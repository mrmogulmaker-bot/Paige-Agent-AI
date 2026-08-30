-- Contract A: presentation-safe, tenant/account-scoped Systems Check references.
-- Synthetic fixtures only; every write rolls back.
-- Run against an isolated preview database:
--   supabase test db --db-url "$CONTRACT_A_PREVIEW_DB_URL" supabase/tests/systems_check_signal_reference.sql

BEGIN;

SELECT plan(31);

SELECT ok(
  NOT has_function_privilege('anon', 'public.issue_systems_check_signal_reference(bigint,uuid)', 'EXECUTE'),
  'anonymous callers cannot issue Systems Check signal references'
);
SELECT ok(
  NOT has_function_privilege('anon', 'public.resolve_systems_check_signal_reference(bigint,text)', 'EXECUTE'),
  'anonymous callers cannot resolve Systems Check signal references'
);
SELECT ok(
  has_function_privilege('authenticated', 'public.issue_systems_check_signal_reference(bigint,uuid)', 'EXECUTE'),
  'authenticated callers can reach the issuer body gate'
);
SELECT ok(
  has_function_privilege('authenticated', 'public.resolve_systems_check_signal_reference(bigint,text)', 'EXECUTE'),
  'authenticated callers can reach the resolver body gate'
);

INSERT INTO auth.users (id, aud, role, email) VALUES
  ('a1000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'signal-owner@tests.invalid'),
  ('a1000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'signal-admin@tests.invalid'),
  ('a1000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'signal-coach@tests.invalid'),
  ('a1000000-0000-0000-0000-000000000004', 'authenticated', 'authenticated', 'signal-member@tests.invalid'),
  ('a1000000-0000-0000-0000-000000000005', 'authenticated', 'authenticated', 'signal-linked-client@tests.invalid'),
  ('a1000000-0000-0000-0000-000000000006', 'authenticated', 'authenticated', 'signal-no-active@tests.invalid'),
  ('a1000000-0000-0000-0000-000000000007', 'authenticated', 'authenticated', 'signal-inactive@tests.invalid'),
  ('b2000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'signal-other-owner@tests.invalid'),
  ('c3000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'signal-stale-owner@tests.invalid');

INSERT INTO public.tenants
  (id, slug, name, status, account_type, account_number_prefix, account_number, features)
VALUES
  ('a1000000-0000-0000-0000-000000001111', 'signal-contract-a', 'Signal Contract A', 'active', 'standalone', 'SCA', 7100001, '{}'::jsonb),
  ('b2000000-0000-0000-0000-000000002222', 'signal-contract-b', 'Signal Contract B', 'active', 'standalone', 'SCB', 7200002, '{}'::jsonb),
  ('c3000000-0000-0000-0000-000000003333', 'signal-contract-stale', 'Signal Contract Stale', 'active', 'standalone', 'SCS', 7300003, '{}'::jsonb);

INSERT INTO public.profiles (user_id, active_tenant_id) VALUES
  ('a1000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000001111'),
  ('a1000000-0000-0000-0000-000000000002', 'a1000000-0000-0000-0000-000000001111'),
  ('a1000000-0000-0000-0000-000000000003', 'a1000000-0000-0000-0000-000000001111'),
  ('a1000000-0000-0000-0000-000000000004', 'a1000000-0000-0000-0000-000000001111'),
  ('a1000000-0000-0000-0000-000000000005', 'a1000000-0000-0000-0000-000000001111'),
  ('a1000000-0000-0000-0000-000000000006', NULL),
  ('a1000000-0000-0000-0000-000000000007', 'a1000000-0000-0000-0000-000000001111'),
  ('b2000000-0000-0000-0000-000000000001', 'b2000000-0000-0000-0000-000000002222'),
  ('c3000000-0000-0000-0000-000000000001', 'c3000000-0000-0000-0000-000000003333');

INSERT INTO public.tenant_members (tenant_id, user_id, role, status, is_owner, joined_at) VALUES
  ('a1000000-0000-0000-0000-000000001111', 'a1000000-0000-0000-0000-000000000001', 'owner', 'active', true, now()),
  ('a1000000-0000-0000-0000-000000001111', 'a1000000-0000-0000-0000-000000000002', 'admin', 'active', false, now()),
  ('a1000000-0000-0000-0000-000000001111', 'a1000000-0000-0000-0000-000000000003', 'coach', 'active', false, now()),
  ('a1000000-0000-0000-0000-000000001111', 'a1000000-0000-0000-0000-000000000004', 'member', 'active', false, now()),
  ('a1000000-0000-0000-0000-000000001111', 'a1000000-0000-0000-0000-000000000006', 'owner', 'active', true, now()),
  ('a1000000-0000-0000-0000-000000001111', 'a1000000-0000-0000-0000-000000000007', 'admin', 'suspended', false, now()),
  ('b2000000-0000-0000-0000-000000002222', 'b2000000-0000-0000-0000-000000000001', 'owner', 'active', true, now()),
  ('c3000000-0000-0000-0000-000000003333', 'c3000000-0000-0000-0000-000000000001', 'owner', 'active', true, now());

INSERT INTO public.clients
  (id, tenant_id, linked_user_id, created_by, first_name, last_name, email)
VALUES
  ('a1000000-0000-0000-0000-00000000c105', 'a1000000-0000-0000-0000-000000001111',
   'a1000000-0000-0000-0000-000000000005', 'a1000000-0000-0000-0000-000000000001',
   'Linked', 'Client', 'signal-linked-client@tests.invalid');

INSERT INTO public.paige_systems_check_registry
  (check_id, check_name, domain, severity, department, data_source, runner_key,
   remediation_prompt, priority, mvp_locked, enabled_by_default, scope)
VALUES
  ('contract_a_safe_boundary', 'SECRET_CHECK_NAME_DO_NOT_RETURN', 'data_product', 'high',
   NULL, 'native_seam', 'contract_a_safe_boundary', 'SECRET_REMEDIATION_DO_NOT_RETURN',
   999, false, true, 'tenant');

INSERT INTO public.paige_systems_check_run
  (id, tenant_id, scan_flavor, started_at, completed_at, check_count, pass_count, fail_count, triggered_by)
VALUES
  ('a1000000-0000-0000-0000-00000000a001', 'a1000000-0000-0000-0000-000000001111',
   'scheduled', now() - interval '2 hours', now() - interval '119 minutes', 1, 0, 1,
   '{"prompt_preview":"SECRET_SUPERSEDED_TRIGGER"}'::jsonb),
  ('a1000000-0000-0000-0000-00000000a002', 'a1000000-0000-0000-0000-000000001111',
   'scheduled', now() - interval '1 hour', now() - interval '59 minutes', 3, 0, 2,
   '{"prompt_preview":"SECRET_CURRENT_TRIGGER"}'::jsonb),
  ('b2000000-0000-0000-0000-00000000b001', 'b2000000-0000-0000-0000-000000002222',
   'scheduled', now() - interval '1 hour', now() - interval '59 minutes', 1, 0, 1,
   '{"prompt_preview":"SECRET_OTHER_TRIGGER"}'::jsonb),
  ('c3000000-0000-0000-0000-00000000c001', 'c3000000-0000-0000-0000-000000003333',
   'scheduled', now() - interval '26 hours', now() - interval '25 hours', 1, 0, 1,
   '{"prompt_preview":"SECRET_STALE_TRIGGER"}'::jsonb);

INSERT INTO public.paige_systems_check_finding
  (id, run_id, check_id, tenant_id, status, severity_at_finding, evidence,
   paige_interpretation, paige_drafted_fix, resolved_at, resolution, resolution_action_id)
VALUES
  ('a1000000-0000-0000-0000-00000000f001', 'a1000000-0000-0000-0000-00000000a001',
   'contract_a_safe_boundary', 'a1000000-0000-0000-0000-000000001111', 'fail', 'high',
   '{"api_key":"SECRET_SUPERSEDED_EVIDENCE"}'::jsonb, 'SECRET_SUPERSEDED_INTERPRETATION',
   '{"prompt":"SECRET_SUPERSEDED_DRAFT"}'::jsonb, NULL, NULL, NULL),
  ('a1000000-0000-0000-0000-00000000f002', 'a1000000-0000-0000-0000-00000000a002',
   'contract_a_safe_boundary', 'a1000000-0000-0000-0000-000000001111', 'fail', 'high',
   '{"api_key":"SECRET_CURRENT_EVIDENCE","internal_error":"SECRET_INTERNAL_ERROR"}'::jsonb,
   'SECRET_CURRENT_INTERPRETATION', '{"prompt":"SECRET_CURRENT_DRAFT","model":"SECRET_MODEL"}'::jsonb,
   NULL, NULL, NULL),
  ('a1000000-0000-0000-0000-00000000f003', 'a1000000-0000-0000-0000-00000000a002',
   'contract_a_safe_boundary', 'a1000000-0000-0000-0000-000000001111', 'fail', 'high',
   '{"api_key":"SECRET_RESOLVED_EVIDENCE"}'::jsonb, 'SECRET_RESOLVED_INTERPRETATION',
   '{"prompt":"SECRET_RESOLVED_DRAFT"}'::jsonb, now() - interval '10 minutes', 'approved',
   'a1000000-0000-0000-0000-00000000ac03'),
  ('a1000000-0000-0000-0000-00000000f004', 'a1000000-0000-0000-0000-00000000a002',
   'contract_a_safe_boundary', 'a1000000-0000-0000-0000-000000001111', 'skip', 'high',
   '{"reason":"SECRET_UNAVAILABLE_SOURCE"}'::jsonb, 'SECRET_UNAVAILABLE_INTERPRETATION',
   '{"prompt":"SECRET_UNAVAILABLE_DRAFT"}'::jsonb, NULL, NULL, NULL),
  ('b2000000-0000-0000-0000-00000000f001', 'b2000000-0000-0000-0000-00000000b001',
   'contract_a_safe_boundary', 'b2000000-0000-0000-0000-000000002222', 'fail', 'high',
   '{"api_key":"SECRET_OTHER_EVIDENCE"}'::jsonb, 'SECRET_OTHER_INTERPRETATION',
   '{"prompt":"SECRET_OTHER_DRAFT"}'::jsonb, NULL, NULL, NULL),
  ('c3000000-0000-0000-0000-00000000f001', 'c3000000-0000-0000-0000-00000000c001',
   'contract_a_safe_boundary', 'c3000000-0000-0000-0000-000000003333', 'fail', 'high',
   '{"api_key":"SECRET_STALE_EVIDENCE"}'::jsonb, 'SECRET_STALE_INTERPRETATION',
   '{"prompt":"SECRET_STALE_DRAFT"}'::jsonb, NULL, NULL, NULL);

CREATE OR REPLACE FUNCTION pg_temp.expect_signal_unavailable(p_account_number bigint, p_signal_ref text)
RETURNS boolean LANGUAGE plpgsql AS $$
BEGIN
  PERFORM public.resolve_systems_check_signal_reference(p_account_number, p_signal_ref);
  RETURN false;
EXCEPTION WHEN SQLSTATE '42501' THEN
  RETURN SQLERRM = 'SYSTEMS_CHECK_SIGNAL_UNAVAILABLE';
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.expect_issue_unavailable(p_account_number bigint, p_finding_id uuid)
RETURNS boolean LANGUAGE plpgsql AS $$
BEGIN
  PERFORM public.issue_systems_check_signal_reference(p_account_number, p_finding_id);
  RETURN false;
EXCEPTION WHEN SQLSTATE '42501' THEN
  RETURN SQLERRM = 'SYSTEMS_CHECK_SIGNAL_UNAVAILABLE';
END;
$$;

SET LOCAL ROLE authenticated;

SELECT set_config('request.jwt.claims', '{"sub":"a1000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
CREATE TEMP TABLE contract_a_result AS
SELECT
  public.issue_systems_check_signal_reference(7100001, 'a1000000-0000-0000-0000-00000000f002') AS signal_ref;
ALTER TABLE contract_a_result ADD COLUMN payload jsonb;
UPDATE contract_a_result
SET payload = public.resolve_systems_check_signal_reference(7100001, signal_ref);

SELECT like(signal_ref, 'scsig_v1_%', 'owner receives a versioned opaque signal reference') FROM contract_a_result;
SELECT is((payload ->> 'status'), 'fail', 'current own-tenant signal exposes safe status') FROM contract_a_result;
SELECT is((payload ->> 'category'), 'data_product', 'current own-tenant signal exposes safe category') FROM contract_a_result;
SELECT is((payload ->> 'source'), 'tenant_records', 'raw data-source name is mapped to a presentation-safe source') FROM contract_a_result;
SELECT is((payload ->> 'freshness'), 'current', 'current completed run is marked current') FROM contract_a_result;
SELECT is((payload ->> 'coverage'), 'partial', 'skip/error presence makes run coverage partial') FROM contract_a_result;
SELECT is((payload ->> 'next_state'), 'owner_review', 'failed signal stops at owner review') FROM contract_a_result;
SELECT is(
  (SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys((SELECT payload FROM contract_a_result)) key),
  ARRAY['category','coverage','freshness','next_state','signal_ref','source','status']::text[],
  'resolver returns exactly the curated structural allowlist'
);
SELECT ok(
  (SELECT payload::text FROM contract_a_result) !~* '(SECRET_|evidence|interpretation|draft|prompt|internal|model|triggered_by|tenant_id|run_id|check_id|resolution|title|summary|payload)',
  'raw evidence, prompts, internal metadata, identifiers, and secret-like values do not cross the boundary'
);
SELECT unlike(
  (SELECT signal_ref FROM contract_a_result),
  '%a1000000-0000-0000-0000-00000000f002%',
  'opaque reference does not embed the raw finding identifier'
);
SELECT is(
  (SELECT signal_ref FROM contract_a_result),
  public.issue_systems_check_signal_reference(7100001, 'a1000000-0000-0000-0000-00000000f002'),
  'repeated issuance is deterministic for one current source'
);

SELECT set_config('request.jwt.claims', '{"sub":"a1000000-0000-0000-0000-000000000002","role":"authenticated"}', true);
SELECT is(public.issue_systems_check_signal_reference(7100001, 'a1000000-0000-0000-0000-00000000f002'), (SELECT signal_ref FROM contract_a_result), 'active tenant admin may issue the same safe reference');

SELECT set_config('request.jwt.claims', '{"sub":"a1000000-0000-0000-0000-000000000003","role":"authenticated"}', true);
SELECT is(public.issue_systems_check_signal_reference(7100001, 'a1000000-0000-0000-0000-00000000f002'), (SELECT signal_ref FROM contract_a_result), 'active tenant coach may issue the same safe reference');

SELECT set_config('request.jwt.claims', '{"sub":"a1000000-0000-0000-0000-000000000004","role":"authenticated"}', true);
SELECT ok(pg_temp.expect_issue_unavailable(7100001, 'a1000000-0000-0000-0000-00000000f002'), 'ordinary member is denied');

SELECT set_config('request.jwt.claims', '{"sub":"a1000000-0000-0000-0000-000000000005","role":"authenticated"}', true);
SELECT ok(pg_temp.expect_issue_unavailable(7100001, 'a1000000-0000-0000-0000-00000000f002'), 'linked client without staff membership is denied');

SELECT set_config('request.jwt.claims', '{"sub":"a1000000-0000-0000-0000-000000000006","role":"authenticated"}', true);
SELECT ok(pg_temp.expect_issue_unavailable(7100001, 'a1000000-0000-0000-0000-00000000f002'), 'membership fallback cannot replace an explicit active tenant');

SELECT set_config('request.jwt.claims', '{"sub":"a1000000-0000-0000-0000-000000000007","role":"authenticated"}', true);
SELECT ok(pg_temp.expect_issue_unavailable(7100001, 'a1000000-0000-0000-0000-00000000f002'), 'inactive staff membership is denied');

SELECT set_config('request.jwt.claims', '{"sub":"b2000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
SELECT ok(pg_temp.expect_signal_unavailable(7100001, (SELECT signal_ref FROM contract_a_result)), 'cross-tenant resolution is denied with the generic response');

SELECT set_config('request.jwt.claims', '{"sub":"a1000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
SELECT ok(pg_temp.expect_signal_unavailable(7200002, (SELECT signal_ref FROM contract_a_result)), 'wrong account address is denied with the generic response');
SELECT ok(pg_temp.expect_signal_unavailable(7100001, 'scsig_v1_0000000000000000000000000000000000000000000000000000000000000000'), 'missing source is denied with the generic response');
SELECT ok(
  pg_temp.expect_signal_unavailable(
    7100001,
    (SELECT left(signal_ref, length(signal_ref) - 1) || CASE right(signal_ref, 1) WHEN '0' THEN '1' ELSE '0' END FROM contract_a_result)
  ),
  'one-character-mutated reference is denied with the generic response'
);
SELECT ok(pg_temp.expect_signal_unavailable(7100001, 'a1000000-0000-0000-0000-00000000f002'), 'raw finding identifier is not accepted as a reference');
SELECT ok(pg_temp.expect_issue_unavailable(7100001, 'a1000000-0000-0000-0000-00000000f001'), 'superseded source is denied');
SELECT ok(pg_temp.expect_issue_unavailable(7100001, 'a1000000-0000-0000-0000-00000000f003'), 'resolved source is denied');
SELECT ok(pg_temp.expect_issue_unavailable(7100001, 'a1000000-0000-0000-0000-00000000f004'), 'unavailable skip source fails closed');

RESET ROLE;
INSERT INTO public.paige_systems_check_run
  (id, tenant_id, scan_flavor, started_at, completed_at, check_count, pass_count, fail_count, triggered_by)
VALUES
  ('a1000000-0000-0000-0000-00000000a003', 'a1000000-0000-0000-0000-000000001111',
   'change_triggered', now() - interval '1 minute', NULL, 0, 0, 0,
   '{"source":"refresh","prompt_preview":"SECRET_IN_PROGRESS_TRIGGER"}'::jsonb);
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"a1000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
SELECT ok(pg_temp.expect_signal_unavailable(7100001, (SELECT signal_ref FROM contract_a_result)), 'a newer incomplete run supersedes the previously current reference');

SELECT set_config('request.jwt.claims', '{"sub":"c3000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
SELECT ok(pg_temp.expect_issue_unavailable(7300003, 'c3000000-0000-0000-0000-00000000f001'), 'stale source is denied');

SELECT * FROM finish();
ROLLBACK;
