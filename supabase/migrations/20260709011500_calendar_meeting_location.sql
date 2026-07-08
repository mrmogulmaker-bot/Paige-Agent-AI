-- How the meeting happens (GHL "meeting location"):
--   location_type  — in_person | phone | google_meet | zoom | custom | ask_invitee
--   location_value — the address / phone number / meeting link / instructions
-- Shown on the booking page (details step) and stored on the resulting appointment.
ALTER TABLE public.calendars
  ADD COLUMN IF NOT EXISTS location_type text NOT NULL DEFAULT 'google_meet',
  ADD COLUMN IF NOT EXISTS location_value text;

ALTER TABLE public.calendars DROP CONSTRAINT IF EXISTS calendars_location_type_chk;
ALTER TABLE public.calendars ADD CONSTRAINT calendars_location_type_chk
  CHECK (location_type IN ('in_person','phone','google_meet','zoom','custom','ask_invitee'));

ALTER TABLE public.internal_bookings
  ADD COLUMN IF NOT EXISTS location_type text,
  ADD COLUMN IF NOT EXISTS location_value text;
