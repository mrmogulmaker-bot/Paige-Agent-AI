-- Seed §189 verification: create an owner-role invite token for the test tenant.
-- User signs up with mrmogulmaker+189test@gmail.com via the invite URL and is
-- auto-assigned tenant_role='owner' on test-tenant-189-verification.
-- Task #32 guard-in-place: tenant 6727ee10 (test-tenant-189-verification) and the
-- created_by user are created out-of-band on prod (drift — see Task #37), not by any
-- migration, so a fresh rebuild has neither FK target and this seed 23503s. Guard both
-- FKs with WHERE EXISTS so it no-ops on a clean rebuild; on BYO the row arrives via the
-- Phase-2 data import. Prod behaviour unchanged (both FKs present). §213 rescue.
INSERT INTO public.tenant_invite_tokens
  (tenant_id, token, kind, default_role, created_by, expires_at, max_uses)
SELECT
  '6727ee10-a413-4d54-9d83-8839a588dd72'::uuid,
  'seed189-' || encode(gen_random_bytes(18), 'hex'),
  'staff',
  'owner'::tenant_role,
  'fb1a09e3-bab2-487e-95bf-40e15b29729a'::uuid,
  now() + interval '30 days',
  1
WHERE EXISTS (SELECT 1 FROM public.tenants WHERE id = '6727ee10-a413-4d54-9d83-8839a588dd72'::uuid)
  AND EXISTS (SELECT 1 FROM auth.users WHERE id = 'fb1a09e3-bab2-487e-95bf-40e15b29729a'::uuid);