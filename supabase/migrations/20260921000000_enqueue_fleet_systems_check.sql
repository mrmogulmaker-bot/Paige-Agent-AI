-- Systems Check — "Run full sweep" needs a FLEET half (owner ruling B, 2026-08-19: "Both. Single
-- button fires operator-scope sweep AND all-tenant sweeps together.").
--
-- THE GAP THIS CLOSES. The operator half is already reachable from a browser:
--   systems-check-run-operator accepts a super_admin/platform_admin JWT (isOperatorJwt →
--   is_platform_operator()) and returns a real summary. The FLEET half was NOT reachable at all —
--   systems-check-run-scheduled gates on isAuthorizedInternalCaller ONLY (service-role bearer or the
--   vault x-cron-token), so an operator JWT gets a flat 401, and no RPC existed to fire it. The
--   "Run full sweep" control was therefore a deliberately inert <span> (it said so in its own title
--   attribute). This migration supplies the missing seam.
--
-- WHY AN RPC AND NOT A WIDER EDGE GATE (owner-ruled Option B). The alternative was to add an
--   isOperatorJwt branch to systems-check-run-scheduled. Rejected: that function trusts
--   body.tenant_id PRECISELY BECAUSE its only callers are cron/service contexts (the §588 reasoning
--   in its own header), so widening the caller set re-opens that trust and would demand a re-gate of
--   the body. A SECURITY DEFINER RPC instead keeps the vault cron token server-side (never in a
--   browser), takes NO caller-supplied parameters at all (zero body-trust surface), and re-uses the
--   established enqueue shape from 20260818000000_onboarding_systems_check_enqueue.sql VERBATIM
--   (§18 — extend the proven pattern, do not fork a second one).
--
-- §59 — THE GRANT IS NEVER THE GUARD. This function is SECURITY DEFINER, so it bypasses RLS and runs
--   as owner. The caller check lives IN THE BODY (is_platform_operator(), which resolves from the
--   verified JWT's auth.uid(), never from an argument) and RAISEs before doing anything. EXECUTE is
--   granted to `authenticated` only because the browser must be able to invoke it; that grant is not
--   what authorizes the call. anon/PUBLIC are revoked outright.
--
-- §53 — gated on is_platform_operator() (super_admin OR platform_admin), NOT the frozen
--   is_platform_owner(). Firing a read-only health sweep is delegated operator work, not a God-tier
--   integrity action, so it belongs on the widened helper.
--
-- §13 HONEST LIMITS — three of them, all real, none hidden from the operator in the UI copy:
--   (a) FIRE-AND-FORGET. net.http_post queues via pg_net and returns a request id immediately. A
--       non-null request id proves the request was QUEUED, never that the sweep succeeded. The caller
--       must not report "swept" off the back of this — only "started".
--   (b) NOT LITERALLY EVERY TENANT. systems-check-run-scheduled selects tenants `order by created_at
--       asc limit N`, and hard-caps N at 100 (MAX_BATCH). We pass 100 — the most the runner will
--       honour. At today's 13 tenants that IS the whole fleet; past 100 it silently becomes "the 100
--       oldest". Pagination / least-recently-scanned ordering is that function's own outstanding
--       follow-up, not something an RPC can fix from here.
--   (c) ATTRIBUTION. Because we authenticate with the cron token, the resulting rows land with the
--       same triggered_by shape as the nightly cron — a fleet sweep fired by an operator is not
--       currently distinguishable from the scheduled one in paige_systems_check_run. Recording the
--       firing operator is a follow-up (it needs a body key the runner does not read today).
--
-- NOT swallowed. Unlike enqueue_onboarding_systems_check — which must never break tenant signup and
--   therefore logs-and-continues — this call is USER-INITIATED from a button. If it cannot queue, the
--   operator has to be told, so the exception propagates to the client (§13: never a silent no-op
--   behind a control that looks like it worked).

CREATE OR REPLACE FUNCTION public.enqueue_fleet_systems_check()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _request_id bigint;
BEGIN
  -- §59 caller scope, enforced in-body. Resolves from the verified JWT, never from a parameter.
  IF NOT public.is_platform_operator() THEN
    RAISE EXCEPTION 'platform operator privileges required to sweep the fleet'
      USING ERRCODE = '42501';
  END IF;

  SELECT net.http_post(
    url     := 'https://xygzykjyynhzqytbqnzu.supabase.co/functions/v1/systems-check-run-scheduled',
    headers := jsonb_build_object(
                 'Content-Type', 'application/json',
                 'x-cron-token', public.cron_token_header()
               ),
    -- 100 = the runner's own MAX_BATCH ceiling. No caller-supplied value is accepted (see header).
    body    := jsonb_build_object('limit', 100)
  ) INTO _request_id;

  -- `queued`, never `swept` — (a) above.
  RETURN jsonb_build_object(
    'ok', true,
    'queued', true,
    'request_id', _request_id,
    'max_tenants', 100
  );
END;
$$;

REVOKE ALL ON FUNCTION public.enqueue_fleet_systems_check() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.enqueue_fleet_systems_check() TO authenticated, service_role;

COMMENT ON FUNCTION public.enqueue_fleet_systems_check() IS
  'Operator-fired fleet-wide Systems Check sweep (owner ruling B, 2026-08-19). SECURITY DEFINER with '
  'an in-body is_platform_operator() gate (§59 — the EXECUTE grant is not the guard); takes no '
  'parameters, so there is no caller-supplied value to trust. Queues a pg_net POST at '
  'systems-check-run-scheduled using the vault cron token, keeping that token server-side. '
  'FIRE-AND-FORGET: a request_id proves the request was queued, NOT that the sweep passed. Covers at '
  'most the 100 oldest tenants (the runner''s MAX_BATCH).';
