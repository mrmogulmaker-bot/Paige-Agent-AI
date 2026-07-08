-- Fix: "permission denied for table calendars" / "permission denied for table
-- platform_invites" for authenticated users.
--
-- Both tables enabled RLS and created policies but never granted BASE TABLE
-- privileges to the `authenticated` role. RLS only FILTERS rows — it does not
-- grant table access — so PostgREST rejected every request with a table-level
-- "permission denied" before any policy was evaluated. That broke calendar
-- creation/listing outright and the owner's pending-invite list/cancel.
--
-- The existing RLS policies still gate every row:
--   • calendars / calendar_hosts — creator / platform admin / tenant admin
--   • platform_invites          — is_platform_owner()
-- so these grants only let the request reach the policy; they widen nothing.
-- Public booking reads go through the service role (edge function), so anon
-- needs no grant here.

GRANT SELECT, INSERT, UPDATE, DELETE ON public.calendars TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.calendar_hosts TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.platform_invites TO authenticated;
