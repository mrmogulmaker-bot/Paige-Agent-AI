-- Prevent double-booking a host for the same start time (TOCTOU-safe).
-- The public-booking engine re-validates the slot then inserts; without this
-- index two concurrent bookings for the same open slot could both succeed.
-- Booking-page slots are grid-aligned, so identical start_at = the same slot.
-- Partial: cancelled rows don't block a rebooking of that time.
CREATE UNIQUE INDEX IF NOT EXISTS uq_internal_bookings_host_start_active
  ON public.internal_bookings (host_user_id, start_at)
  WHERE status <> 'cancelled';
