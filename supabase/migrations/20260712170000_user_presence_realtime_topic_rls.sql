-- Task #148 — private Realtime channel for the browser presence layer.
--
-- Presence broadcasts ride topics named 'presence:tenant:<tenant_id>'. This is
-- the SECOND wall (the RPCs are the first): even the ephemeral browser layer can
-- only subscribe to / broadcast on its OWN tenant's presence topic. The platform
-- owner may additionally ride a platform-wide 'presence:platform' topic.
--
-- realtime.messages is RLS-on with no policies today (deny-all), so these two
-- ADD, they don't loosen anything else.

CREATE OR REPLACE FUNCTION public.can_access_presence_topic(_topic text)
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_tenant uuid := public.current_user_tenant_id();
BEGIN
  IF auth.uid() IS NULL OR _topic IS NULL THEN
    RETURN false;
  END IF;
  -- Platform-wide presence topic: owner only.
  IF _topic = 'presence:platform' THEN
    RETURN public.is_platform_owner();
  END IF;
  -- Per-tenant presence topic must match the caller's own tenant.
  IF v_tenant IS NULL THEN
    RETURN false;
  END IF;
  RETURN _topic = 'presence:tenant:' || v_tenant::text;
END $$;
REVOKE ALL ON FUNCTION public.can_access_presence_topic(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_access_presence_topic(text) TO authenticated;

DROP POLICY IF EXISTS "presence topic read own tenant" ON realtime.messages;
CREATE POLICY "presence topic read own tenant"
  ON realtime.messages FOR SELECT TO authenticated
  USING (
    realtime.topic() LIKE 'presence:%'
    AND public.can_access_presence_topic(realtime.topic())
  );

DROP POLICY IF EXISTS "presence topic write own tenant" ON realtime.messages;
CREATE POLICY "presence topic write own tenant"
  ON realtime.messages FOR INSERT TO authenticated
  WITH CHECK (
    realtime.topic() LIKE 'presence:%'
    AND public.can_access_presence_topic(realtime.topic())
  );
