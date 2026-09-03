-- Legacy platform alert containment. No record, producer, recipient or history changes.
BEGIN;

ALTER TABLE public.paige_admin_notifications ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.paige_admin_notifications FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.paige_admin_notifications TO authenticated;
GRANT UPDATE (read_at) ON TABLE public.paige_admin_notifications TO authenticated;

DROP POLICY IF EXISTS "Admins and coaches view notifications" ON public.paige_admin_notifications;
DROP POLICY IF EXISTS "Admins and coaches mark read" ON public.paige_admin_notifications;
DROP POLICY IF EXISTS "Notifications read scoped" ON public.paige_admin_notifications;
DROP POLICY IF EXISTS "Notifications update own" ON public.paige_admin_notifications;
DROP POLICY IF EXISTS "Platform notification boundary" ON public.paige_admin_notifications;
DROP POLICY IF EXISTS "Platform notification read" ON public.paige_admin_notifications;
DROP POLICY IF EXISTS "Platform notification mark read" ON public.paige_admin_notifications;

-- Restrictive AND-boundary prevents any older permissive policy from widening access.
CREATE POLICY "Platform notification boundary" ON public.paige_admin_notifications
  AS RESTRICTIVE FOR ALL TO authenticated
  USING ((SELECT public.is_platform_operator()))
  WITH CHECK ((SELECT public.is_platform_operator()));
CREATE POLICY "Platform notification read" ON public.paige_admin_notifications
  FOR SELECT TO authenticated USING ((SELECT public.is_platform_operator()));
CREATE POLICY "Platform notification mark read" ON public.paige_admin_notifications
  FOR UPDATE TO authenticated
  USING ((SELECT public.is_platform_operator()))
  WITH CHECK ((SELECT public.is_platform_operator()));

-- Production currently has no publication membership. Keep that safe state on
-- rebuilds too: Postgres Changes DELETE events do not enforce row policies.
DO $publication$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public'
      AND tablename = 'paige_admin_notifications') THEN
    ALTER PUBLICATION supabase_realtime DROP TABLE public.paige_admin_notifications;
  END IF;
END
$publication$;
COMMIT;
