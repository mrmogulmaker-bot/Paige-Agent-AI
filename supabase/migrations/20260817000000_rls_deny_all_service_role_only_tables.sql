-- HOTFIX B — explicit service-role-only RLS policies for two tables flagged by the operator
-- Systems Check (operator_rls_coverage, run 72d2fbf3): RLS ENABLED but ZERO policies.
--
-- §30 diagnosis (grep + prod pg_stat, 2026-08-10):
--   • booking_notifications_sent — a send-dedup LEDGER written ONLY by the service-role `admin`
--     client in booking-manage/index.ts + process-booking-notifications/index.ts (insert/update/
--     delete keyed per booking/notif_key). No frontend reads/writes. (2 live rows.)
--   • user_presence — presence telemetry written by the `presence_heartbeat` SECURITY DEFINER RPC
--     and read by the who-is-online SECURITY DEFINER RPC. Every frontend hook
--     (usePresenceHeartbeat / useWhoIsOnline / useEffectivePresence / useRailEvents) documents it
--     as "deny-all to the browser (RLS on, grants revoked)" by design (Task #148). The high scan
--     count is RPC traffic (definer bypasses RLS), NOT direct JWT access.
--
-- Both are service-role-only. RLS-on + no-policy ALREADY denies JWT callers, but leaves the intent
-- implicit and trips the coverage check. These RESTRICTIVE deny-all policies make the deny-all
-- EXPLICIT + auditable. They apply ONLY to the `authenticated` and `anon` JWT roles and can NEVER
-- open access (§9/§51-safe — a RESTRICTIVE USING(false) only ever further-restricts). service_role
-- and the SECURITY DEFINER RPC owner bypass RLS (neither table is FORCE'd), so the edge functions
-- and presence RPCs are byte-for-byte unaffected (§37).

-- booking_notifications_sent ------------------------------------------------------------------
CREATE POLICY "service_role_only_deny_jwt" ON public.booking_notifications_sent
  AS RESTRICTIVE FOR ALL TO authenticated, anon USING (false) WITH CHECK (false);
COMMENT ON POLICY "service_role_only_deny_jwt" ON public.booking_notifications_sent IS
  'Service-role-only send-dedup ledger (booking-manage / process-booking-notifications). JWT '
  'callers are denied; all writes go through the service-role admin client. RESTRICTIVE deny-all: '
  'makes the pre-existing deny-all explicit for the operator RLS-coverage check and can never open '
  'access (§9/§51). service_role bypasses RLS (table is not FORCE-RLS).';

-- user_presence -------------------------------------------------------------------------------
CREATE POLICY "service_role_only_deny_jwt" ON public.user_presence
  AS RESTRICTIVE FOR ALL TO authenticated, anon USING (false) WITH CHECK (false);
COMMENT ON POLICY "service_role_only_deny_jwt" ON public.user_presence IS
  'Presence telemetry — written by the presence_heartbeat SECURITY DEFINER RPC and read by the '
  'who-is-online SECURITY DEFINER RPC only. "Deny-all to the browser" by design (Task #148). '
  'RESTRICTIVE deny-all makes it explicit for the operator RLS-coverage check; cannot open access '
  '(§9/§51). The definer RPC bypasses RLS, so presence continues to work unchanged.';
