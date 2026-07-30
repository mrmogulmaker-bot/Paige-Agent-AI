BEGIN;

SELECT plan(17);

SELECT ok(
  NOT has_function_privilege('anon', 'public.ensure_paige_managed_email_connector(uuid)', 'EXECUTE'),
  'anonymous callers cannot provision a managed connector'
);
SELECT ok(
  NOT has_function_privilege('authenticated', 'public.ensure_paige_managed_email_connector(uuid)', 'EXECUTE'),
  'authenticated tenant members cannot mutate channel configuration'
);
SELECT ok(
  has_function_privilege('service_role', 'public.ensure_paige_managed_email_connector(uuid)', 'EXECUTE'),
  'service role owns the explicit maintenance seam'
);
SELECT throws_ok(
  $$ SELECT set_config('request.jwt.claim.role', 'authenticated', true);
     SELECT public.ensure_paige_managed_email_connector('91000000-0000-0000-0000-000000000001'::uuid); $$,
  '42501',
  'TENANT_CONNECTOR_SERVICE_ROLE_REQUIRED',
  'the function body also rejects a non-service JWT role'
);

INSERT INTO public.tenants
  (id, slug, name, status, account_type, account_number_prefix, features)
VALUES
  ('91000000-0000-0000-0000-000000000001', 'test-domain-agency', 'Test Domain Agency', 'active', 'agency', 'TDA', '{}'::jsonb),
  ('91000000-0000-0000-0000-000000000003', 'test-domain-solo', 'Test Domain Solo', 'trial', 'standalone', 'TDS', '{}'::jsonb),
  ('91000000-0000-0000-0000-000000000004', 'test-domain-enterprise', 'Test Domain Enterprise', 'active', 'enterprise', 'TDE', '{}'::jsonb),
  ('91000000-0000-0000-0000-000000000005', 'test-domain-system', 'Test Domain System', 'active', 'standalone', 'TDY', '{"system_workspace": true}'::jsonb),
  ('91000000-0000-0000-0000-000000000006', 'test-domain-inactive', 'Test Domain Inactive', 'active', 'standalone', 'TDI', '{}'::jsonb);

INSERT INTO public.tenants
  (id, slug, name, status, account_type, account_number_prefix, parent_tenant_id, features)
VALUES
  ('91000000-0000-0000-0000-000000000002', 'test-domain-child', 'Test Domain Child', 'active', 'standalone', 'TDC',
   '91000000-0000-0000-0000-000000000001', '{}'::jsonb);

SELECT is(
  (SELECT count(*)::integer FROM public.channel_connectors WHERE tenant_id = '91000000-0000-0000-0000-000000000001' AND config ->> 'managed_default' = 'true'),
  1,
  'agency root receives one independent managed connector'
);
SELECT is(
  (SELECT count(*)::integer FROM public.channel_connectors WHERE tenant_id = '91000000-0000-0000-0000-000000000002' AND config ->> 'managed_default' = 'true'),
  1,
  'agency child receives one connector under the child tenant'
);
SELECT isnt(
  (SELECT from_address FROM public.channel_connectors WHERE tenant_id = '91000000-0000-0000-0000-000000000001' AND config ->> 'managed_default' = 'true'),
  (SELECT from_address FROM public.channel_connectors WHERE tenant_id = '91000000-0000-0000-0000-000000000002' AND config ->> 'managed_default' = 'true'),
  'parent and child never inherit the same sender identity'
);
SELECT is(
  (SELECT count(*)::integer FROM public.channel_connectors WHERE tenant_id = '91000000-0000-0000-0000-000000000003' AND config ->> 'managed_default' = 'true'),
  1,
  'solo workspace receives one managed connector'
);
SELECT is(
  (SELECT count(*)::integer FROM public.channel_connectors WHERE tenant_id = '91000000-0000-0000-0000-000000000004' AND config ->> 'managed_default' = 'true'),
  1,
  'customer enterprise receives one managed connector'
);
SELECT is(
  (SELECT count(*)::integer FROM public.channel_connectors WHERE tenant_id = '91000000-0000-0000-0000-000000000005' AND config ->> 'managed_default' = 'true'),
  0,
  'explicit system workspace is excluded'
);

UPDATE public.tenants SET status = 'canceled' WHERE id = '91000000-0000-0000-0000-000000000006';
SELECT is(
  (SELECT count(*)::integer FROM public.channel_connectors WHERE tenant_id = '91000000-0000-0000-0000-000000000006' AND config ->> 'managed_default' = 'true' AND active),
  0,
  'inactive tenant has no active managed connector'
);

CREATE TEMP TABLE first_connector AS
SELECT public.provision_paige_managed_email_connector('91000000-0000-0000-0000-000000000001') AS id;
SELECT is(
  public.provision_paige_managed_email_connector('91000000-0000-0000-0000-000000000001'),
  (SELECT id FROM first_connector),
  'repeated provisioning returns the same connector id'
);
SELECT is(
  (SELECT count(*)::integer FROM public.channel_connectors WHERE tenant_id = '91000000-0000-0000-0000-000000000001' AND config ->> 'managed_default' = 'true'),
  1,
  'repeated provisioning remains physically idempotent'
);

INSERT INTO public.channel_connectors
  (tenant_id, channel_type, provider, display_name, from_name, from_address, status, active, config)
VALUES
  ('91000000-0000-0000-0000-000000000001', 'email', 'smtp', 'Custom SMTP', 'Agency',
   'owner@custom.example', 'active', true, '{"host":"smtp.custom.example","port":587}'::jsonb);
PERFORM public.provision_paige_managed_email_connector('91000000-0000-0000-0000-000000000001');
SELECT is(
  (SELECT count(*)::integer FROM public.channel_connectors WHERE tenant_id = '91000000-0000-0000-0000-000000000001' AND provider = 'smtp'),
  1,
  'managed provisioning preserves a custom connector'
);
SELECT is(
  (SELECT tenant_id FROM public.channel_connectors WHERE config ->> 'managed_default' = 'true' AND from_address = 'test-domain-child@mail.paigeagent.ai'),
  '91000000-0000-0000-0000-000000000002'::uuid,
  'child sender remains tenant-pinned'
);
SELECT lives_ok(
  $$ SELECT set_config('request.jwt.claim.role', 'service_role', true);
     SELECT public.ensure_paige_managed_email_connector('91000000-0000-0000-0000-000000000003'::uuid); $$,
  'legitimate service-role provisioning succeeds'
);
SELECT is(
  (SELECT count(DISTINCT from_address)::integer FROM public.channel_connectors
    WHERE tenant_id IN ('91000000-0000-0000-0000-000000000001', '91000000-0000-0000-0000-000000000002')
      AND config ->> 'managed_default' = 'true'),
  2,
  'agency and subaccount addresses are distinct'
);

SELECT * FROM finish();
ROLLBACK;
