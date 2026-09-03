-- ISOLATED PostgreSQL fixture only. Never run against a production database.
\set ON_ERROR_STOP on
DO $$ BEGIN
  IF current_database() <> 'notification_policy_contract' THEN
    RAISE EXCEPTION 'This fixture requires the isolated notification_policy_contract database';
  END IF;
END $$;
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN BYPASSRLS;
CREATE TABLE public.paige_admin_notifications (id int PRIMARY KEY, title text, read_at timestamptz);
INSERT INTO public.paige_admin_notifications VALUES (1, 'Synthetic fixture only', NULL);
GRANT ALL ON public.paige_admin_notifications TO anon, authenticated, service_role;
CREATE FUNCTION public.is_platform_operator() RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT coalesce(current_setting('test.actor_role', true), '') IN ('super_admin', 'platform_admin');
$$;
ALTER TABLE public.paige_admin_notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins and coaches view notifications" ON public.paige_admin_notifications FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins and coaches mark read" ON public.paige_admin_notifications FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Notifications read scoped" ON public.paige_admin_notifications FOR SELECT TO authenticated USING (true);
CREATE POLICY "Notifications update own" ON public.paige_admin_notifications FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE PUBLICATION supabase_realtime FOR TABLE public.paige_admin_notifications;
-- Baseline: the vulnerable policy fixture admits an ordinary tenant.
SET ROLE authenticated;
SET test.actor_role = 'admin';
DO $$ BEGIN IF (SELECT count(*) FROM public.paige_admin_notifications) <> 1 THEN RAISE EXCEPTION 'Baseline not reproduced'; END IF; END $$;
RESET ROLE;
\ir ../migrations/20260903224113_platform_notifications_operator_only.sql
\ir ../migrations/20260903224113_platform_notifications_operator_only.sql
SET ROLE authenticated;
DO $$ DECLARE actor text; affected int; BEGIN
  FOREACH actor IN ARRAY ARRAY['user','admin','coach','agency',''] LOOP
    PERFORM set_config('test.actor_role', actor, false);
    IF (SELECT count(*) FROM public.paige_admin_notifications) <> 0 THEN RAISE EXCEPTION 'Tenant read allowed'; END IF;
    UPDATE public.paige_admin_notifications SET read_at = now();
    GET DIAGNOSTICS affected = ROW_COUNT;
    IF affected <> 0 THEN RAISE EXCEPTION 'Tenant update allowed'; END IF;
  END LOOP;
  FOREACH actor IN ARRAY ARRAY['super_admin','platform_admin'] LOOP
    PERFORM set_config('test.actor_role', actor, false);
    IF (SELECT count(*) FROM public.paige_admin_notifications) <> 1 THEN RAISE EXCEPTION 'Operator read denied'; END IF;
    UPDATE public.paige_admin_notifications SET read_at = now();
    GET DIAGNOSTICS affected = ROW_COUNT;
    IF affected <> 1 THEN RAISE EXCEPTION 'Operator mark-read denied'; END IF;
  END LOOP;
END $$;
RESET ROLE;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication_tables WHERE schemaname='public' AND tablename='paige_admin_notifications') THEN RAISE EXCEPTION 'Realtime publication remains'; END IF;
  IF has_table_privilege('anon','public.paige_admin_notifications','SELECT')
    OR has_table_privilege('authenticated','public.paige_admin_notifications','TRUNCATE')
    OR has_table_privilege('authenticated','public.paige_admin_notifications','INSERT')
    OR has_table_privilege('authenticated','public.paige_admin_notifications','DELETE')
    OR has_column_privilege('authenticated','public.paige_admin_notifications','title','UPDATE') THEN
    RAISE EXCEPTION 'Excess privilege remains';
  END IF;
  IF NOT has_table_privilege('service_role','public.paige_admin_notifications','INSERT') THEN RAISE EXCEPTION 'Sender authority changed'; END IF;
END $$;
SELECT 'PASS: tenant refusal, operator access, privilege limits, no publication, idempotence' AS result;
