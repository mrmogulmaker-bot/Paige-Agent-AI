-- Collective/Class capacity and cascade-cancel are enforced by
-- create_class_booking / reschedule_class_booking (SECURITY DEFINER RPCs)
-- and by the public-booking/booking-manage edge functions (service_role,
-- which bypasses RLS) -- never by a constraint on internal_bookings itself
-- (an EXCLUDE constraint is pairwise; it can't express "<= N seats per
-- session"). That made the "single row = single class_seat" invariant and
-- the "collective_group_id groups real co-hosts" invariant pure
-- application-layer promises against this table's existing
-- bookings_host_all policy, which grants any authenticated host full
-- INSERT on their own rows with no awareness of booking_kind at all.
--
-- Two concrete gaps that opened: (1) a host could INSERT a class_seat row
-- directly, tied to any class_session_id, skipping the RPC's lock->count
-- capacity check entirely; (2) a host could INSERT a 'collective' row
-- under their own host_user_id with an ARBITRARY collective_group_id, then
-- cancel that self-owned row -- cascade_booking_group_cancel() cascades to
-- every other row sharing that group id with no ownership check, so an
-- attacker who obtains any real collective_group_id (currently never
-- returned to a client, but that's an accident of what other code happens
-- to expose, not an access-control boundary) could cancel a stranger's
-- booking group.
--
-- Fix: split the ALL-command policy so authenticated INSERTs are scoped to
-- booking_kind='single' only. UPDATE/SELECT/DELETE are untouched -- the
-- admin calendar view's own Cancel/No-show buttons on a collective leg or a
-- class_session tile are a real, intended feature (§ the trigger cascade
-- IS how a host cancels a class from that UI) and must keep working. Since
-- a non-single row can now only ever be CREATED through the RPCs/edge
-- functions (both of which run outside this policy -- SECURITY DEFINER and
-- service_role respectively bypass RLS), closing the INSERT path alone
-- removes the attacker's only way to get a self-owned foothold row into an
-- arbitrary group in the first place.
DROP POLICY IF EXISTS bookings_host_all ON public.internal_bookings;

CREATE POLICY bookings_host_select ON public.internal_bookings
  FOR SELECT TO authenticated
  USING (host_user_id = auth.uid());

CREATE POLICY bookings_host_insert ON public.internal_bookings
  FOR INSERT TO authenticated
  WITH CHECK (host_user_id = auth.uid() AND booking_kind = 'single');

CREATE POLICY bookings_host_update ON public.internal_bookings
  FOR UPDATE TO authenticated
  USING (host_user_id = auth.uid())
  WITH CHECK (host_user_id = auth.uid());

CREATE POLICY bookings_host_delete ON public.internal_bookings
  FOR DELETE TO authenticated
  USING (host_user_id = auth.uid());
