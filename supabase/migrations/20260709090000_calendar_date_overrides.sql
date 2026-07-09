-- Date-specific availability exceptions (block-out days + special hours).
-- Tenant-authored per calendar (§9): an array of
--   { "date": "YYYY-MM-DD", "blocked": true }                       -- whole day off
--   { "date": "YYYY-MM-DD", "windows": [{"start":"09:00","end":"12:00"}] } -- special hours
-- A blocked date yields no slots; a date with windows uses those instead of the
-- weekly pattern. Config-as-data so Paige can set holidays/blackouts (§10).
-- Column ADD inherits existing grants.
ALTER TABLE public.calendars
  ADD COLUMN IF NOT EXISTS date_overrides jsonb NOT NULL DEFAULT '[]'::jsonb;
