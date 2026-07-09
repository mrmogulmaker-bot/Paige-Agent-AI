-- Idempotency ledger for scheduled booking emails (reminders + post-meeting
-- follow-ups). One row per (booking, notification) claimed before sending, so a
-- notification is never sent twice even if the cron overlaps. On send failure
-- the worker deletes its claim so the next run retries.
CREATE TABLE IF NOT EXISTS public.booking_notifications_sent (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL REFERENCES public.internal_bookings(id) ON DELETE CASCADE,
  notif_key text NOT NULL,          -- e.g. 'reminder:1440', 'followup'
  recipient_email text,
  status text NOT NULL DEFAULT 'sent',
  sent_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (booking_id, notif_key)
);
CREATE INDEX IF NOT EXISTS booking_notifications_sent_booking_idx
  ON public.booking_notifications_sent (booking_id);

ALTER TABLE public.booking_notifications_sent ENABLE ROW LEVEL SECURITY;
-- service_role (the worker) bypasses RLS but still needs table GRANT.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.booking_notifications_sent TO service_role;
