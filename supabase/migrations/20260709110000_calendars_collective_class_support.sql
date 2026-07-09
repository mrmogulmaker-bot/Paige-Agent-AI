-- Calendar-level support for Collective (all hosts must attend) and Class
-- (one host, many guests share a slot up to capacity) booking types. Both
-- values (`collective`, `event`) already exist as pickable options in the
-- CalendarsPanel type-chooser; this finishes the backend the UI already
-- promises. Tenant-authored per calendar (§9); config-as-data (§10).
ALTER TABLE public.calendars
  ADD COLUMN IF NOT EXISTS capacity integer NOT NULL DEFAULT 8;

ALTER TABLE public.calendars
  ADD CONSTRAINT calendars_capacity_chk CHECK (capacity > 0);

-- `type` had no CHECK at all before this — an unrecognized value silently
-- fell through to single-host behavior. Only 'personal' rows exist today
-- (verified before applying), so this is safe to add now.
ALTER TABLE public.calendars
  ADD CONSTRAINT calendars_type_chk
  CHECK (type IN ('personal', 'round_robin', 'collective', 'event'));
