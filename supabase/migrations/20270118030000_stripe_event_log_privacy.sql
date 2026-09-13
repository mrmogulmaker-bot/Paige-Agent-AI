BEGIN;

DROP POLICY IF EXISTS "admins read stripe_event_log" ON public.stripe_event_log;
DROP POLICY IF EXISTS stripe_event_log_platform_owner_read ON public.stripe_event_log;
CREATE POLICY stripe_event_log_platform_owner_read ON public.stripe_event_log
  FOR SELECT TO authenticated USING (public.is_platform_owner(auth.uid()));

COMMENT ON TABLE public.stripe_event_log IS
  'Provider event lifecycle and retry evidence. Service role writes; only the platform owner may inspect it. Tenant admins cannot read cross-tenant billing metadata.';

COMMIT;
