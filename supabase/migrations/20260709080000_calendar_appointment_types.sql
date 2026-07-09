-- Appointment types (a "service menu" on one booking page). Tenant-authored per
-- calendar (§9): each type is a bookable service with its own name, description,
-- and length — e.g. "15-min intro", "60-min strategy". When a calendar has one
-- or more, the public page asks the guest to pick a service first, and that
-- type's duration drives the slot grid. Empty array = single implicit type
-- (today's behavior). Config-as-data so Paige can author the menu (§10).
-- Column ADDs inherit existing grants.
ALTER TABLE public.calendars
  ADD COLUMN IF NOT EXISTS appointment_types jsonb NOT NULL DEFAULT '[]'::jsonb;

-- The chosen service captured on the booking (id, name, duration_min).
ALTER TABLE public.internal_bookings
  ADD COLUMN IF NOT EXISTS appointment_type jsonb;
