-- The public booking engine (public-booking edge function) runs as service_role.
-- service_role has BYPASSRLS, but that does NOT bypass table-level GRANTs — and
-- the calendar tables (created via migration) never received the service_role
-- grant, so the function hit "permission denied for table calendars" (42501)
-- and every /book/:slug page rendered "Booking unavailable". Grant the service
-- role full DML on the calendar tables so the booking engine can read them.
-- (internal_bookings / tenants already carry the default service_role grants.)
GRANT SELECT, INSERT, UPDATE, DELETE ON public.calendars TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.calendar_hosts TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.calendar_groups TO service_role;
