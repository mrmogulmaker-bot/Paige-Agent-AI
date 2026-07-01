-- Seed §189 verification: create an owner-role invite token for the test tenant.
-- User signs up with mrmogulmaker+189test@gmail.com via the invite URL and is
-- auto-assigned tenant_role='owner' on test-tenant-189-verification.
INSERT INTO public.tenant_invite_tokens
  (tenant_id, token, kind, default_role, created_by, expires_at, max_uses)
VALUES
  ('6727ee10-a413-4d54-9d83-8839a588dd72',
   'seed189-' || encode(gen_random_bytes(18), 'hex'),
   'staff',
   'owner'::tenant_role,
   'fb1a09e3-bab2-487e-95bf-40e15b29729a',
   now() + interval '30 days',
   1)
RETURNING token, tenant_id, default_role, expires_at;