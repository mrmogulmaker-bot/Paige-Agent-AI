-- The existing uq_internal_bookings_host_start_active unique index only
-- rejects two active bookings with the EXACT same start_at for a host. That
-- was sufficient while every booking on a calendar shared one duration (the
-- calendar's), so identical start_at implied the same slot grid. Appointment
-- types (service menu) broke that assumption: two services with different
-- durations produce different grids, so two concurrent creates can land
-- distinct start_at values that still overlap in time — the app-level
-- isFree() check is read-then-insert and can't close that race.
--
-- Fix: a GiST exclusion constraint enforces "no two active bookings for the
-- same host may overlap in time" at the database level, which IS race-safe
-- under concurrent transactions (Postgres serializes the GiST index insert).
-- This subsumes the old unique index (identical start_at is a degenerate
-- overlap) but the index is left in place — harmless, and it still serves
-- point lookups.
CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE public.internal_bookings
  ADD CONSTRAINT internal_bookings_no_overlap
  EXCLUDE USING gist (
    host_user_id WITH =,
    tstzrange(start_at, end_at, '[)') WITH &&
  ) WHERE (status <> 'cancelled');
