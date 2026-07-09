-- Custom intake questions on the booking form. Tenant-authored per calendar
-- (§9): each coach/consultant/agency defines the questions their booking page
-- asks — short text, paragraph, dropdown, single/multi choice, phone, URL,
-- number — and the guest's answers are captured on the booking. Column ADDs
-- inherit existing grants.
ALTER TABLE public.calendars
  ADD COLUMN IF NOT EXISTS intake_questions jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.internal_bookings
  ADD COLUMN IF NOT EXISTS intake_answers jsonb;
