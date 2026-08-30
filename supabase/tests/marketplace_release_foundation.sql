-- Marketplace Phase 1A immutable-release and tenant-safe read contract.
-- Synthetic fixtures only; every write rolls back.
-- Run against an isolated replay-proven preview database.

BEGIN;

SELECT plan(40);

SELECT ok(
  has_function_privilege('authenticated', 'public.marketplace_release_catalog()', 'EXECUTE'),
  'authenticated callers can reach the catalogue body gate'
);
SELECT ok(
  has_function_privilege('authenticated', 'public.marketplace_release_detail(text)', 'EXECUTE'),
  'authenticated callers can reach the detail body gate'
);
SELECT ok(
  NOT has_function_privilege('anon', 'public.marketplace_release_catalog()', 'EXECUTE')
  AND NOT has_function_privilege('anon', 'public.marketplace_release_detail(text)', 'EXECUTE'),
  'anonymous callers cannot use either read seam'
);
SELECT ok(
  NOT has_function_privilege('service_role', 'public.marketplace_release_catalog()', 'EXECUTE')
  AND NOT has_function_privilege('service_role', 'public.marketplace_release_detail(text)', 'EXECUTE'),
  'ambient service authority cannot impersonate an authenticated actor'
);
SELECT ok(
  NOT has_table_privilege('authenticated', 'public.marketplace_item_versions', 'SELECT,INSERT,UPDATE,DELETE'),
  'authenticated callers have no raw release-table access'
);
SELECT ok(
  NOT has_table_privilege('authenticated', 'public.marketplace_release_lifecycle_events', 'SELECT,INSERT,UPDATE,DELETE')
  AND NOT has_table_privilege('authenticated', 'public.marketplace_release_read_references', 'SELECT,INSERT,UPDATE,DELETE'),
  'authenticated callers have no raw lifecycle or reference-table access'
);
SELECT ok(
  NOT has_table_privilege('service_role', 'public.marketplace_release_lifecycle_events', 'SELECT,INSERT,UPDATE,DELETE')
  AND NOT has_table_privilege('service_role', 'public.marketplace_release_read_references', 'SELECT,INSERT,UPDATE,DELETE'),
  'service role has no direct lifecycle or reference-table access'
);
SELECT ok(
  (SELECT prosecdef FROM pg_proc WHERE oid = 'public.marketplace_release_catalog()'::regprocedure)
  AND (SELECT prosecdef FROM pg_proc WHERE oid = 'public.marketplace_release_detail(text)'::regprocedure),
  'both public read seams are SECURITY DEFINER functions'
);
SELECT ok(
  (SELECT proconfig @> ARRAY['search_path=pg_catalog, public, extensions']
     FROM pg_proc WHERE oid = 'public.marketplace_release_catalog()'::regprocedure)
  AND (SELECT proconfig @> ARRAY['search_path=pg_catalog, public, extensions']
     FROM pg_proc WHERE oid = 'public.marketplace_release_detail(text)'::regprocedure),
  'both read seams pin the hardened search path'
);

INSERT INTO auth.users (id, aud, role, email) VALUES
  ('81000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'market-owner@tests.invalid'),
  ('81000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'market-member@tests.invalid'),
  ('82000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'market-other@tests.invalid'),
  ('83000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'market-reviewer@tests.invalid');

INSERT INTO public.tenants
  (id, slug, name, status, account_type, account_number_prefix, account_number, features)
VALUES
  ('81000000-0000-0000-0000-000000001111', 'market-contract-a', 'Market Contract A', 'active', 'standalone', 'MCA', 9100001, '{}'::jsonb),
  ('82000000-0000-0000-0000-000000002222', 'market-contract-b', 'Market Contract B', 'active', 'standalone', 'MCB', 9200002, '{}'::jsonb);

INSERT INTO public.profiles (user_id, active_tenant_id) VALUES
  ('81000000-0000-0000-0000-000000000001', '81000000-0000-0000-0000-000000001111'),
  ('81000000-0000-0000-0000-000000000002', '81000000-0000-0000-0000-000000001111'),
  ('82000000-0000-0000-0000-000000000001', '82000000-0000-0000-0000-000000002222'),
  ('83000000-0000-0000-0000-000000000001', NULL)
ON CONFLICT (user_id) DO UPDATE SET active_tenant_id = EXCLUDED.active_tenant_id;

INSERT INTO public.tenant_members (tenant_id, user_id, role, status, is_owner, joined_at) VALUES
  ('81000000-0000-0000-0000-000000001111', '81000000-0000-0000-0000-000000000001', 'owner', 'active', true, now()),
  ('81000000-0000-0000-0000-000000001111', '81000000-0000-0000-0000-000000000002', 'member', 'active', false, now()),
  ('82000000-0000-0000-0000-000000002222', '82000000-0000-0000-0000-000000000001', 'owner', 'active', true, now());

SELECT set_config('request.jwt.claims', '{"sub":"83000000-0000-0000-0000-000000000001","role":"service_role"}', true);

INSERT INTO public.marketplace_vendors
  (id, slug, display_name, origin, status, created_by)
VALUES
  ('83000000-0000-0000-0000-00000000a001', 'contract-verified', 'Verified Contract Creator', 'vendor', 'verified', '83000000-0000-0000-0000-000000000001');

INSERT INTO public.marketplace_items
  (id, slug, item_type, vendor_id, origin, name, tagline, description, category, icon,
   scope, status, pricing_model, price_cents, available_to_tiers, installable_by_role,
   source_type, publisher_tenant_id, publish_status)
VALUES
  ('83000000-0000-0000-0000-00000000b001', 'contract_safe_snapshot', 'kb_pack',
   '83000000-0000-0000-0000-00000000a001', 'vendor', 'Contract Safe Snapshot',
   'SECRET_LEGACY_TAGLINE_RUNTIME_CLAIM', 'SECRET_LEGACY_DESCRIPTION_PROVIDER_TOKEN',
   'operations', 'FileSearch', 'public', 'listed', 'free', 0,
   '["Solo"]'::jsonb, '["tenant_admin"]'::jsonb, 'third_party',
   '81000000-0000-0000-0000-000000001111', 'approved'),
  ('83000000-0000-0000-0000-00000000b002', 'contract_unreviewed_release', 'automation',
   '83000000-0000-0000-0000-00000000a001', 'vendor', 'Contract Unreviewed Release',
   'SECRET_UNREVIEWED_TAGLINE', 'SECRET_UNREVIEWED_DESCRIPTION',
   'operations', 'Workflow', 'public', 'listed', 'free', 0,
   '["Solo"]'::jsonb, '["tenant_admin"]'::jsonb, 'third_party',
   '81000000-0000-0000-0000-000000001111', 'approved');

INSERT INTO public.marketplace_item_versions
  (id, item_id, semver, status, payload_class, install_manifest, code_ref, changelog,
   reviewed_by, approved_at, published_at, publisher_vendor_id, artifact_digest_sha256,
   risk_class, capability_reads, capability_preparations, capability_runtime_operations,
   capability_external_calls, configuration_requirements, capability_prohibited,
   capability_default_deny, supported_tiers, installable_roles, release_scope,
   authorized_by, authorized_at, created_by)
VALUES
  ('83000000-0000-0000-0000-00000000c001', '83000000-0000-0000-0000-00000000b001',
   '1.0.0', 'published', 'config_only',
   '{"provider_token":"SECRET_RAW_PROVIDER_TOKEN","internal":"SECRET_RAW_MANIFEST"}'::jsonb,
   '{"repository":"SECRET_CODE_REFERENCE"}'::jsonb, 'SECRET_CREATOR_CHANGELOG',
   '83000000-0000-0000-0000-000000000001', now(), now(),
   '83000000-0000-0000-0000-00000000a001', repeat('a', 64),
   'read_only_data_snapshot', ARRAY['tenant.records.summary'], ARRAY['snapshot.prepare'],
   ARRAY[]::text[], ARRAY[]::text[], ARRAY['connection.required'],
   ARRAY['credentials.read','provider_tokens.read','tenant.write'], true,
   ARRAY['Solo'], ARRAY['tenant_admin'], 'public',
   '83000000-0000-0000-0000-000000000001', now(),
   '83000000-0000-0000-0000-000000000001'),
  ('83000000-0000-0000-0000-00000000c002', '83000000-0000-0000-0000-00000000b002',
   '2.0.0', 'published', 'config_only', '{"unsafe":"SECRET_UNREVIEWED_MANIFEST"}'::jsonb,
   NULL, 'SECRET_UNREVIEWED_CHANGELOG', NULL, NULL, now(), NULL, NULL, NULL, NULL,
   NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL,
   '83000000-0000-0000-0000-000000000001');

UPDATE public.marketplace_items
   SET current_version_id = CASE id
     WHEN '83000000-0000-0000-0000-00000000b001'::uuid THEN '83000000-0000-0000-0000-00000000c001'::uuid
     ELSE '83000000-0000-0000-0000-00000000c002'::uuid
   END
 WHERE id IN ('83000000-0000-0000-0000-00000000b001', '83000000-0000-0000-0000-00000000b002');

SELECT is(
  (SELECT count(*)::integer FROM public.marketplace_release_lifecycle_events
    WHERE release_id = '83000000-0000-0000-0000-00000000c001'),
  1,
  'review-bound published release records one initial lifecycle event'
);
SELECT is(
  (SELECT to_state FROM public.marketplace_release_lifecycle_events
    WHERE release_id = '83000000-0000-0000-0000-00000000c001'),
  'published',
  'initial lifecycle state is published'
);
SELECT ok(
  (SELECT identity_digest_sha256 ~ '^[0-9a-f]{64}$'
     AND review_bundle_digest_sha256 ~ '^[0-9a-f]{64}$'
     AND manifest_digest_sha256 ~ '^[0-9a-f]{64}$'
     AND capability_declaration_digest_sha256 ~ '^[0-9a-f]{64}$'
   FROM public.marketplace_item_versions WHERE id = '83000000-0000-0000-0000-00000000c001'),
  'server computes the release-bound manifest, declaration, and review digests'
);

CREATE OR REPLACE FUNCTION pg_temp.expect_marketplace_unavailable(p_ref text)
RETURNS boolean LANGUAGE plpgsql AS $$
BEGIN
  PERFORM public.marketplace_release_detail(p_ref);
  RETURN false;
EXCEPTION WHEN SQLSTATE '42501' THEN
  RETURN SQLERRM = 'MARKETPLACE_CAPABILITY_UNAVAILABLE';
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.expect_release_immutable(p_release uuid)
RETURNS boolean LANGUAGE plpgsql AS $$
BEGIN
  UPDATE public.marketplace_item_versions
     SET install_manifest = install_manifest || '{"forged":true}'::jsonb
   WHERE id = p_release;
  RETURN false;
EXCEPTION WHEN SQLSTATE '55000' THEN
  RETURN SQLERRM = 'MARKETPLACE_RELEASE_IMMUTABLE';
END;
$$;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"81000000-0000-0000-0000-000000000001","role":"authenticated"}', true);

CREATE TEMP TABLE marketplace_contract_result AS
SELECT * FROM public.marketplace_release_catalog();

SELECT is((SELECT count(*)::integer FROM marketplace_contract_result), 1, 'catalogue returns only the one active reviewed eligible release');
SELECT is((SELECT item_slug FROM marketplace_contract_result), 'contract_safe_snapshot', 'catalogue returns the proven item identity');
SELECT is((SELECT capability_proof_state FROM marketplace_contract_result), 'LIVE', 'catalogue labels the complete proof state LIVE');
SELECT alike((SELECT capability_ref FROM marketplace_contract_result), 'mktrel_v1_%', 'catalogue returns a versioned opaque detail reference');
SELECT unalike((SELECT capability_ref FROM marketplace_contract_result), '%83000000-0000-0000-0000-00000000c001%', 'opaque reference does not embed the release identifier');
SELECT is((SELECT publisher_class FROM marketplace_contract_result), 'VERIFIED_CREATOR', 'publisher class is server-derived from verified provenance');
SELECT is((SELECT release_version FROM marketplace_contract_result), '1.0.0', 'catalogue binds the exact reviewed release version');

ALTER TABLE marketplace_contract_result ADD COLUMN detail jsonb;
UPDATE marketplace_contract_result SET detail = public.marketplace_release_detail(capability_ref);

SELECT is((SELECT detail ->> 'state' FROM marketplace_contract_result), 'LIVE', 'detail revalidates the same active proof state');
SELECT is((SELECT detail #>> '{release,version}' FROM marketplace_contract_result), '1.0.0', 'detail binds the same exact release version');
SELECT is((SELECT detail #>> '{release,risk_class}' FROM marketplace_contract_result), 'read_only_data_snapshot', 'detail exposes the reviewed risk class');
SELECT is((SELECT detail #>> '{capability_declaration,default_deny}' FROM marketplace_contract_result), 'true', 'detail exposes the release-bound default-deny declaration');
SELECT is((SELECT detail #>> '{capability_declaration,reads,0}' FROM marketplace_contract_result), 'tenant.records.summary', 'detail exposes only the declared safe read token');
SELECT is((SELECT detail #>> '{capability_declaration,preparations,0}' FROM marketplace_contract_result), 'snapshot.prepare', 'detail distinguishes preparation from execution');
SELECT is((SELECT jsonb_array_length(detail #> '{capability_declaration,runtime_operations}') FROM marketplace_contract_result), 0, 'detail truthfully exposes no runtime operation');
SELECT ok(
  (SELECT detail::text FROM marketplace_contract_result) !~* '(SECRET_|tagline|description|install_manifest|code_ref|changelog|provider_token"[[:space:]]*:|reviewed_by|authorized_by|price|rating|install_count)',
  'legacy marketing, raw manifests, secrets, reviewer identity, prices, ratings, and install claims do not cross the boundary'
);
SELECT is(
  (SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys((SELECT detail FROM marketplace_contract_result)) key),
  ARRAY['capability_declaration','capability_ref','catalogue_revision','item','publisher','release','state']::text[],
  'detail returns exactly the curated top-level allowlist'
);

SELECT set_config('request.jwt.claims', '{"sub":"81000000-0000-0000-0000-000000000002","role":"authenticated"}', true);
SELECT is((SELECT count(*)::integer FROM public.marketplace_release_catalog()), 0, 'wrong-role member sees no tenant-admin release');
SELECT ok(pg_temp.expect_marketplace_unavailable((SELECT capability_ref FROM marketplace_contract_result)), 'reference is actor-bound and cannot be replayed by another tenant member');

SELECT set_config('request.jwt.claims', '{"sub":"82000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
SELECT ok(pg_temp.expect_marketplace_unavailable((SELECT capability_ref FROM marketplace_contract_result)), 'cross-tenant reference replay fails with the generic response');

SELECT set_config('request.jwt.claims', '{"sub":"81000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
SELECT ok(pg_temp.expect_marketplace_unavailable('83000000-0000-0000-0000-00000000c001'), 'raw release identifiers are never accepted as detail references');
SELECT ok(pg_temp.expect_marketplace_unavailable('mktrel_v1_' || repeat('0', 64)), 'unknown opaque references fail with the generic response');
SELECT set_config('search_path', 'pg_temp, public, extensions', true);
SELECT extensions.is(
  public.marketplace_release_detail((SELECT capability_ref FROM marketplace_contract_result)) #>> '{item,slug}',
  'contract_safe_snapshot'::text,
  'hostile caller search path cannot shadow resolver dependencies'
);
SELECT set_config('search_path', '"$user", public, extensions', true);

RESET ROLE;
SELECT set_config('request.jwt.claims', '{"sub":"83000000-0000-0000-0000-000000000001","role":"service_role"}', true);
SELECT ok(pg_temp.expect_release_immutable('83000000-0000-0000-0000-00000000c001'), 'review-bound release proof and manifest are immutable');
UPDATE public.marketplace_items SET name = 'SECRET_MUTABLE_IDENTITY_DRIFT' WHERE id = '83000000-0000-0000-0000-00000000b001';
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"81000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
SELECT ok(pg_temp.expect_marketplace_unavailable((SELECT capability_ref FROM marketplace_contract_result)), 'mutable item identity drift invalidates the reviewed release reference');
RESET ROLE;
SELECT set_config('request.jwt.claims', '{"sub":"83000000-0000-0000-0000-000000000001","role":"service_role"}', true);
UPDATE public.marketplace_items SET name = 'Contract Safe Snapshot' WHERE id = '83000000-0000-0000-0000-00000000b001';
UPDATE public.marketplace_item_versions SET status = 'suspended' WHERE id = '83000000-0000-0000-0000-00000000c001';

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"81000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
SELECT is((SELECT count(*)::integer FROM public.marketplace_release_catalog()), 0, 'suspended release disappears from discovery immediately');
SELECT ok(pg_temp.expect_marketplace_unavailable((SELECT capability_ref FROM marketplace_contract_result)), 'suspension invalidates an already-issued detail reference');

RESET ROLE;
SELECT set_config('request.jwt.claims', '{"sub":"83000000-0000-0000-0000-000000000001","role":"service_role"}', true);
UPDATE public.marketplace_item_versions SET status = 'published' WHERE id = '83000000-0000-0000-0000-00000000c001';
UPDATE public.marketplace_item_versions SET status = 'revoked' WHERE id = '83000000-0000-0000-0000-00000000c001';

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"81000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
SELECT is((SELECT count(*)::integer FROM public.marketplace_release_catalog()), 0, 'revoked release remains unavailable to discovery');

RESET ROLE;
SELECT set_config('request.jwt.claims', '{"sub":"83000000-0000-0000-0000-000000000001","role":"service_role"}', true);
UPDATE public.marketplace_item_versions SET status = 'retired' WHERE id = '83000000-0000-0000-0000-00000000c001';
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"81000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
SELECT is((SELECT count(*)::integer FROM public.marketplace_release_catalog()), 0, 'retired release remains unavailable to discovery');
RESET ROLE;
SELECT set_config('request.jwt.claims', '{"sub":"83000000-0000-0000-0000-000000000001","role":"service_role"}', true);
SELECT is(
  (SELECT count(*)::integer FROM public.marketplace_release_lifecycle_events
    WHERE release_id = '83000000-0000-0000-0000-00000000c001'),
  5,
  'published, suspended, republished, revoked, and retired states remain append-only history'
);

SELECT * FROM finish();
ROLLBACK;
