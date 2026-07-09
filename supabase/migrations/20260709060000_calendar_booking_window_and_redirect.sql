-- How far into the future guests may book (rolling window, in days) and an
-- optional URL to send them to after booking (e.g. a community / school page).
-- Both are per-calendar, tenant-authored. Column ADDs inherit existing grants.
ALTER TABLE public.calendars
  ADD COLUMN IF NOT EXISTS booking_horizon_days integer NOT NULL DEFAULT 60,
  ADD COLUMN IF NOT EXISTS redirect_url text;
