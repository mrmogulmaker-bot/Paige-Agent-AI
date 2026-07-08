-- Per-calendar notification settings (GHL "Notifications" tab):
--   confirm_guest / confirm_host — send confirmation on booking
--   reminders — list of {channel, offset_min} fired before the appointment
-- The public-booking engine gates confirmations on this; a reminder cron
-- consumes `reminders` + tracks what's fired in reminder_state.
ALTER TABLE public.calendars
  ADD COLUMN IF NOT EXISTS notify_config jsonb NOT NULL
    DEFAULT '{"confirm_guest":true,"confirm_host":true,"reminders":[{"channel":"email","offset_min":1440}]}'::jsonb;

ALTER TABLE public.internal_bookings
  ADD COLUMN IF NOT EXISTS reminder_state jsonb NOT NULL DEFAULT '{}'::jsonb;
