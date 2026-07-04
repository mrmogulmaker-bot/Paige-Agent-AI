-- Ship #2 (Task #24 Piece 2a): Platform-level Paige-branding cleanup.
-- MMA tenant row is preserved (Antonio's own tenant on Paige).

-- 1. Drop 24 MMA-scoped btf_* email templates
DELETE FROM public.email_templates
WHERE template_key LIKE 'btf\_%' ESCAPE '\'
  AND tenant_id = 'a25194e0-93c4-4e2c-91d0-66ea012660b2'::uuid;

-- 2. Retire the 2 MMA sender identities.
-- portal.mogulmakeracademy.com is currently is_default=true; retiring it
-- forces MMA-scoped sends to fall back to platform SENDER_DOMAIN
-- (notify.paigeagent.ai), which is the correct behavior post-flip.
DELETE FROM public.tenant_email_domains
WHERE tenant_id = 'a25194e0-93c4-4e2c-91d0-66ea012660b2'::uuid
  AND domain IN ('mogulmakeracademy.com', 'portal.mogulmakeracademy.com');

-- 3. Defense-in-depth anon lockdown on Phase 3.1 tool RPCs.
-- Signatures probed from pg_proc before drafting.
REVOKE EXECUTE ON FUNCTION public.paige_tool_create_task(
  uuid, uuid, text, text, timestamptz, text
) FROM anon;
REVOKE EXECUTE ON FUNCTION public.paige_tool_add_client_note(
  uuid, uuid, text, text
) FROM anon;