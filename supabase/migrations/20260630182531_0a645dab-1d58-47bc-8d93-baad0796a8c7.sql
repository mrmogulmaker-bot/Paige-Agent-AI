-- Restrict authenticated INSERTs on analytics_events to the caller's own user_id (or anonymous NULL)
DROP POLICY IF EXISTS "analytics_events_authenticated_insert_own" ON public.analytics_events;
CREATE POLICY "analytics_events_authenticated_insert_own"
  ON public.analytics_events
  AS PERMISSIVE
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id IS NULL OR user_id = auth.uid());