-- business_context.readiness contract: the grant surface, the two caller paths, the role gate,
-- the always-four-rows honesty invariant, and that no raw value ever crosses.
-- Synthetic fixtures; always rolled back.
--
-- The role gate is the reason this file exists in CI rather than only as a local proof. The first
-- draft of get_business_context_readiness had NO role gate: a workspace's own CLIENT is an
-- authenticated user of that same tenant, so current_user_tenant_id() resolved happily and handed
-- them their coach's setup readiness — while the capability declared audience: owner_internal. A
-- local proof that only tested cross-TENANT isolation passed the whole time. These assertions test
-- the role axis explicitly so that class cannot come back silently.
BEGIN;

SELECT plan(18);

-- ── Grant surface (§59 — the grant is never the guard, but it is still the outer boundary) ──
SELECT ok(
  NOT has_function_privilege('anon', 'public.get_business_context_readiness(uuid)', 'EXECUTE'),
  'anonymous callers cannot execute the readiness contract'
);
SELECT ok(
  has_function_privilege('authenticated', 'public.get_business_context_readiness(uuid)', 'EXECUTE'),
  'authenticated callers can reach the readiness contract'
);
SELECT ok(
  has_function_privilege('service_role', 'public.get_business_context_readiness(uuid)', 'EXECUTE'),
  'the service-role path stays open for the Systems Check runners'
);
SELECT ok(
  (SELECT prosecdef FROM pg_proc WHERE oid = 'public.get_business_context_readiness(uuid)'::regprocedure),
  'contract is SECURITY DEFINER'
);
SELECT ok(
  (SELECT proconfig @> ARRAY['search_path=pg_catalog, public']
     FROM pg_proc WHERE oid = 'public.get_business_context_readiness(uuid)'::regprocedure),
  'contract pins its search path'
);

-- ── Fixtures: two tenants; tenant A has a coach AND a client, tenant B has its own coach ──
-- (seat-then-pointer ordering below is required by a real trigger — see the note there)
INSERT INTO auth.users (id, aud, role, email) VALUES
  ('b1000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'bcr-coach-a@tests.invalid'),
  ('b1000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'bcr-client-a@tests.invalid'),
  ('b2000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'bcr-coach-b@tests.invalid');

INSERT INTO public.tenants
  (id, slug, name, status, account_type, account_number_prefix, account_number, features, brand)
VALUES
  ('b1000000-0000-0000-0000-000000001111', 'bcr-contract-a', 'BCR Contract A', 'active', 'standalone', 'BCA', 8300001,
   '{}'::jsonb, jsonb_build_object('support_email', 'owner@bcr-a.invalid')),
  ('b2000000-0000-0000-0000-000000002222', 'bcr-contract-b', 'BCR Contract B', 'active', 'standalone', 'BCB', 8400002,
   '{}'::jsonb, '{}'::jsonb);

-- ORDER MATTERS, and it is not arbitrary (lessons-learned 0d): `trg_guard_active_tenant` refuses
-- an `active_tenant_id` pointed at a workspace where the user holds no seat, so the SEATS are
-- seeded FIRST and the pointer set after. And `INSERT INTO auth.users` already created the
-- `profiles` shell via `handle_new_user`, so the pointer is an UPDATE, never an INSERT.
INSERT INTO public.tenant_members (tenant_id, user_id, role, status, is_owner, joined_at) VALUES
  ('b1000000-0000-0000-0000-000000001111', 'b1000000-0000-0000-0000-000000000001', 'owner', 'active', true, now()),
  ('b1000000-0000-0000-0000-000000001111', 'b1000000-0000-0000-0000-000000000002', 'member', 'active', false, now()),
  ('b2000000-0000-0000-0000-000000002222', 'b2000000-0000-0000-0000-000000000001', 'owner', 'active', true, now());

-- Upsert rather than a bare UPDATE: if `handle_new_user` did create the shell this updates it, and
-- if it did not, a bare UPDATE would touch 0 rows and leave the pointer NULL — a fixture that fails
-- for a reason that has nothing to do with what is under test.
INSERT INTO public.profiles (user_id, active_tenant_id) VALUES
  ('b1000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000001111'),
  ('b1000000-0000-0000-0000-000000000002', 'b1000000-0000-0000-0000-000000001111'),
  ('b2000000-0000-0000-0000-000000000001', 'b2000000-0000-0000-0000-000000002222')
ON CONFLICT (user_id) DO UPDATE SET active_tenant_id = EXCLUDED.active_tenant_id;

-- The client is deliberately given a GLOBAL staff role while being only a 'member' of this
-- workspace. That is the §59 global-role trap in fixture form: a gate written against
-- has_any_role() would ADMIT this caller, because user_roles carries no tenant_id. The
-- tenant-scoped gate must still refuse them. Without this row the refusal assertions below would
-- pass for the wrong reason (no role at all) and could never catch a regression to a global check.
INSERT INTO public.user_roles (user_id, role) VALUES
  ('b1000000-0000-0000-0000-000000000001', 'admin'),
  ('b1000000-0000-0000-0000-000000000002', 'coach'),
  ('b2000000-0000-0000-0000-000000000001', 'admin')
ON CONFLICT DO NOTHING;

-- Tenant A: website + industry owner-confirmed; a phone that is PRESENT but malformed.
-- (legal_business_name is NOT NULL on this table, and tenant_id is UNIQUE rather than the PK.)
INSERT INTO public.tenant_legal_profile
  (tenant_id, legal_business_name, website_url, support_phone, business_industry, setup_provenance)
VALUES
  ('b1000000-0000-0000-0000-000000001111', 'BCR Contract A LLC', 'https://bcr-a.invalid', '12', 'consulting',
   jsonb_build_object(
     'website',  jsonb_build_object('source','owner_confirmed','confidence','confirmed','confirmedAt','2026-09-01T00:00:00Z'),
     'industry', jsonb_build_object('source','owner_confirmed','confidence','confirmed','confirmedAt','2026-09-02T00:00:00Z')))
ON CONFLICT (tenant_id) DO UPDATE SET
  website_url = EXCLUDED.website_url, support_phone = EXCLUDED.support_phone,
  business_industry = EXCLUDED.business_industry, setup_provenance = EXCLUDED.setup_provenance;

-- Tenant B has a legal profile row with NOTHING filled in — the "genuinely empty Setup" case.
INSERT INTO public.tenant_legal_profile (tenant_id, legal_business_name)
VALUES ('b2000000-0000-0000-0000-000000002222', 'BCR Contract B LLC')
ON CONFLICT (tenant_id) DO NOTHING;

INSERT INTO public.tenant_setup_business_context_meta
  (tenant_id, primary_email_snapshot, primary_email_provenance)
VALUES
  ('b1000000-0000-0000-0000-000000001111', 'owner@bcr-a.invalid',
   jsonb_build_object('source','owner_confirmed','confirmedAt','2026-09-01T00:00:00Z'))
ON CONFLICT (tenant_id) DO UPDATE SET
  primary_email_snapshot = EXCLUDED.primary_email_snapshot,
  primary_email_provenance = EXCLUDED.primary_email_provenance;

-- ── The tenant's own coach reads their real status ──────────────────────────────
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"b1000000-0000-0000-0000-000000000001","role":"authenticated"}', true);

CREATE TEMP TABLE bcr_coach AS SELECT * FROM public.get_business_context_readiness();

SELECT is((SELECT count(*)::integer FROM bcr_coach), 4, 'exactly four rows, always — no signal is never an empty result');
SELECT is((SELECT status FROM bcr_coach WHERE field_key = 'website'), 'owner_confirmed', 'a saved website reads as owner-confirmed');
SELECT is((SELECT status FROM bcr_coach WHERE field_key = 'industry'), 'owner_confirmed', 'a saved industry reads as owner-confirmed');
SELECT is((SELECT status FROM bcr_coach WHERE field_key = 'business_phone'), 'invalid_format',
          'a present-but-malformed phone is invalid_format, never "missing" and never a silent pass');
SELECT ok(
  (SELECT row_to_json(bcr_coach)::text FROM bcr_coach WHERE field_key = 'website')
    !~* '(bcr-a\.invalid|https|consulting|owner@)',
  'no raw value crosses — status and provenance only'
);

-- ── The IDOR probe: a caller with an identity may never steer the tenant by argument ──
SELECT is(
  (SELECT status FROM public.get_business_context_readiness('b2000000-0000-0000-0000-000000002222')
    WHERE field_key = 'website'),
  'owner_confirmed',
  'a JWT caller passing another tenant id is ignored and still reads their OWN tenant (§9/§588)'
);

-- ── THE ROLE GATE: the same tenant's CLIENT is refused, and learns nothing ──────
SELECT set_config('request.jwt.claims', '{"sub":"b1000000-0000-0000-0000-000000000002","role":"authenticated"}', true);

CREATE TEMP TABLE bcr_client AS SELECT * FROM public.get_business_context_readiness();

SELECT is((SELECT count(*)::integer FROM bcr_client), 4, 'a refused caller still receives four rows, not an empty set');
SELECT ok(
  (SELECT bool_and(status = 'unavailable') FROM bcr_client),
  'a non-staff caller in the same workspace is refused every field, EVEN holding a global staff '
  'role — the gate is tenant-scoped, not global (§59 global-role trap)'
);
SELECT ok(
  (SELECT bool_and(reason = 'not permitted for this account') FROM bcr_client),
  'the refusal names itself, so a consumer can tell "may not" from "could not"'
);
SELECT ok(
  (SELECT bool_and(source IS NULL) FROM bcr_client),
  'a refusal leaks no provenance either'
);

-- ── Tenant B: genuinely empty Setup reads as needs_confirmation, not as unavailable ──
SELECT set_config('request.jwt.claims', '{"sub":"b2000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
SELECT is(
  (SELECT status FROM public.get_business_context_readiness() WHERE field_key = 'website'),
  'needs_confirmation',
  'nothing entered yet is needs_confirmation — a normal state, distinct from a failed read'
);

-- ── The service-role path (no auth.uid()) is the ONLY one that may name a tenant ──
RESET ROLE;
SET LOCAL ROLE service_role;
SELECT set_config('request.jwt.claims', '', true);

SELECT is(
  (SELECT status FROM public.get_business_context_readiness('b1000000-0000-0000-0000-000000001111')
    WHERE field_key = 'website'),
  'owner_confirmed',
  'the trusted service-role path honours an explicit tenant id (the Systems Check runners)'
);
SELECT is(
  (SELECT reason FROM public.get_business_context_readiness() WHERE field_key = 'website'),
  'workspace not resolved',
  'the service-role path with NO tenant argument refuses rather than guessing a tenant'
);

SELECT * FROM finish();
ROLLBACK;
