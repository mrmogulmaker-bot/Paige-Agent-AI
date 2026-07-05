
-- Trigger/cron-only functions: no direct API callers
REVOKE EXECUTE ON FUNCTION public.auto_stub_business_from_contact() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.ensure_client_role_self_heal() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_approval_event() FROM PUBLIC, anon, authenticated;
-- Task #32 guard: email_queue_dispatch() is created out-of-band on prod (schema
-- drift — see Task #37), not by any migration, so a fresh rebuild 42883s here.
-- Guard so the chain rebuilds; BYO gets the function via the Phase-3 bootstrap.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc
    WHERE proname = 'email_queue_dispatch' AND pronamespace = 'public'::regnamespace
  ) THEN
    REVOKE EXECUTE ON FUNCTION public.email_queue_dispatch() FROM PUBLIC, anon, authenticated;
  END IF;
END $$;
REVOKE EXECUTE ON FUNCTION public.enforce_doctrine_120() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enforce_doctrine_120_columns() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enforce_doctrine_120_full() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enforce_proposal_doctrine_120() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enforce_subagent_doctrine_116() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enforce_subagent_doctrine_124() FROM PUBLIC, anon, authenticated;

-- Privileged helpers: strip anon (signed-in users still need them)
REVOKE EXECUTE ON FUNCTION public.coach_can_access_user(uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.client_onboarding_status(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.client_view_ready(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_outstanding_consents(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_user_primary_tenant(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.has_tenant_role(uuid, uuid, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_tenant_owner(uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.match_tenant_knowledge(uuid, extensions.vector, integer) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.revoke_platform_access(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.start_client_impersonation(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.end_client_impersonation(uuid) FROM PUBLIC, anon;

-- Intentionally kept anon-executable (public flows):
--   public.peek_tenant_invite(text)             - invite landing page
--   public.record_communications_consent(...)   - public signup consent capture
--   public.has_email_marketing_consent(text)    - public form gating
--   public.has_sms_consent(text, boolean)       - public form gating
