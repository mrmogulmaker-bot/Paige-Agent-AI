-- §189 verification tenant
INSERT INTO public.tenants (slug, name, status, seat_limit, customer_limit, account_number_prefix, brand)
VALUES (
  'test-tenant-189-verification',
  'Test Tenant §189 Verification',
  'trial',
  5,
  10,
  'T189',
  '{"primary_color":"#666666","name":"§189 Test"}'::jsonb
)
ON CONFLICT (slug) DO NOTHING;

-- Ensure tenant_features row exists with everything FALSE (trigger should have handled it,
-- but assert explicitly for the verification tenant).
INSERT INTO public.tenant_features (tenant_id, credit_services_enabled, coaching_enabled, legal_services_enabled)
SELECT id, false, false, false FROM public.tenants WHERE slug = 'test-tenant-189-verification'
ON CONFLICT (tenant_id) DO UPDATE
  SET credit_services_enabled = false,
      coaching_enabled = false,
      legal_services_enabled = false;