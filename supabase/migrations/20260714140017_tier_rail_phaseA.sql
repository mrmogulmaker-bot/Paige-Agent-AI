-- ============================================================================
-- Tier Rail Spine — PHASE A (security-critical core)
--
-- Closes three live holes found in the 6-surface tier/view audit:
--   (1) Agency-view leak: tier/view was INFERRED from a tenant_members
--       owner/admin row on an agency/enterprise tenant, so a stray/mis-placed
--       admin row silently became agency-console access. Phase A REPOINTS the
--       agency-view gate onto the DECLARED rail (agency_team_members +
--       agency_team_role()), dropping the admin×account_type inference.
--   (2) Privilege escalation via staff invite: accept_tenant_invite's generic
--       ('team'/staff) ELSE branch could grant tenant_members on an agency /
--       enterprise tenant → agency authority by the back door. Phase A RAISES
--       on that branch when the target is an agency/enterprise tenant; agency
--       authority may ONLY be granted through kind='agency_team'.
--   (3) FIVE residual inference surfaces (Phase A.2, below) the §1/§5 adversarial
--       crew found — list_subaccounts, actor_primary_agency, the no-arg
--       agency_exit_subaccount, agency_portfolio_metrics, and the
--       agency_team_select RLS policy — each still read the same admin×account_type
--       inference and are repointed onto the declared rail.
--
-- Accepted, non-blocking (crew nits): agency_current_id resolves rail-FIRST then
-- the owner fallback (was owner-first) — intended, declared authority wins; zero
-- prod impact (single agency tenant today). The pending admin-on-agency invites
-- the clamp now refuses are the §9 leak itself (same pattern as the operator's
-- reported stray-access cases) — refusing them is the fix, not a regression.
--
-- Behavior is IDENTICAL for legit operators: the day-0 seed inserted every
-- prior agency/enterprise owner→agency_owner and admin→agency_admin into
-- agency_team_members. Prod verification (2026-07-14) confirms all current
-- is_agency_manager operators resolve a non-NULL agency_team_role — nobody is
-- locked out.
--
-- Every redefined function preserves its exact REVOKE/GRANT (re-applied below).
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- (1a) agency_current_id(_actor)
--   Rail FIRST: an ACTIVE agency_team_members row is the declared authority.
--   The ONLY tenant_members fallback is the immutable tenant OWNER of an
--   agency/enterprise tenant — never 'admin' (admin must come through the rail).
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.agency_current_id(_actor uuid)
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT COALESCE(
    -- Declared rail: an ACTIVE agency_team_members row.
    (SELECT atm.agency_tenant_id FROM public.agency_team_members atm
       WHERE atm.user_id = _actor AND atm.status = 'active'
       ORDER BY atm.joined_at ASC NULLS LAST LIMIT 1),
    -- Sole inference fallback: the immutable tenant OWNER of an agency/enterprise
    -- tenant. 'admin' is intentionally excluded — admin authority is rail-only.
    (SELECT t.id FROM public.tenant_members m
       JOIN public.tenants t ON t.id = m.tenant_id
       WHERE m.user_id = _actor AND m.status = 'active' AND m.role = 'owner'
         AND t.account_type IN ('agency','enterprise')
       ORDER BY m.joined_at ASC NULLS LAST, t.created_at ASC LIMIT 1)
  );
$function$;

REVOKE ALL ON FUNCTION public.agency_current_id(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.agency_current_id(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.agency_current_id(uuid) TO service_role;

-- ----------------------------------------------------------------------------
-- (1b) agency_switch_context()
--   is_agency_manager is now RAIL-derived: agency_team_role(agency, uid) IS NOT
--   NULL — no tenant_members role IN (owner,admin) × account_type join.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.agency_switch_context()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _uid         uuid := auth.uid();
  _agency_id   uuid;
  _agency_name text;
  _active      uuid;
  _is_mgr      boolean;
BEGIN
  -- Resolve the actor's agency off the declared rail (agency_current_id is now
  -- rail-first), then gate manager status on the rail-derived role.
  _agency_id := public.agency_current_id(_uid);
  _is_mgr := _agency_id IS NOT NULL
             AND public.agency_team_role(_agency_id, _uid) IS NOT NULL;

  IF _is_mgr THEN
    SELECT t.name INTO _agency_name FROM public.tenants t WHERE t.id = _agency_id;
  END IF;

  SELECT active_tenant_id INTO _active FROM public.profiles WHERE user_id = _uid;

  RETURN jsonb_build_object(
    'is_agency_manager', COALESCE(_is_mgr, false),
    'agency_id',         CASE WHEN _is_mgr THEN _agency_id ELSE NULL END,
    'agency_name',       CASE WHEN _is_mgr THEN _agency_name ELSE NULL END,
    'active_tenant_id',  _active
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.agency_switch_context() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.agency_switch_context() TO authenticated;

-- ----------------------------------------------------------------------------
-- (1c) agency_list_my_subaccounts()
--   Gate on agency_team_role(parent, uid) IS NOT NULL (rail) rather than the
--   owner/admin × account_type inference join against tenant_members.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.agency_list_my_subaccounts()
 RETURNS TABLE(id uuid, slug text, name text, account_type text, status text, created_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT c.id, c.slug, c.name, c.account_type, c.status::text, c.created_at
  FROM public.tenants c
  JOIN public.tenants p ON p.id = c.parent_tenant_id
  WHERE p.account_type IN ('agency', 'enterprise')
    AND public.agency_team_role(p.id, auth.uid()) IS NOT NULL
  ORDER BY c.created_at DESC;
$function$;

REVOKE ALL ON FUNCTION public.agency_list_my_subaccounts() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.agency_list_my_subaccounts() TO authenticated;

-- ----------------------------------------------------------------------------
-- (2) accept_tenant_invite(_token)
--   BYTE-IDENTICAL to the live definition EXCEPT the generic ('team'/staff) ELSE
--   branch now RAISES when the target tenant is an agency/enterprise account.
--   Staff invites may only grant tenant_members on a NON-agency tenant; agency
--   authority must come through kind='agency_team'. All other branches
--   (consumer / subaccount_owner / agency_team) are unchanged.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.accept_tenant_invite(_token text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _tok public.tenant_invite_tokens;
  _email text;
  _full text;
  _first text;
  _last text;
  _client_id uuid;
  _existing_tenant uuid;
  _tenant_owner uuid;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'must be signed in to accept an invite';
  END IF;

  SELECT * INTO _tok FROM public.tenant_invite_tokens WHERE token = _token FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'invite token not found'; END IF;
  IF _tok.revoked_at IS NOT NULL THEN RAISE EXCEPTION 'invite has been revoked'; END IF;
  IF _tok.expires_at <= now() THEN RAISE EXCEPTION 'invite has expired'; END IF;
  IF _tok.max_uses IS NOT NULL AND _tok.uses >= _tok.max_uses THEN
    RAISE EXCEPTION 'invite has reached its usage limit';
  END IF;

  IF _tok.kind = 'consumer' THEN
    SELECT email, NULLIF(raw_user_meta_data->>'full_name', '')
      INTO _email, _full FROM auth.users WHERE id = _uid;
    SELECT owner_user_id INTO _tenant_owner FROM public.tenants WHERE id = _tok.tenant_id;
    _first := NULLIF(split_part(COALESCE(_full, ''), ' ', 1), '');
    IF _first IS NULL THEN _first := split_part(COALESCE(_email, 'there'), '@', 1); END IF;
    _last := COALESCE(NULLIF(trim(substr(COALESCE(_full, ''), length(split_part(COALESCE(_full, ''), ' ', 1)) + 1)), ''), '');

    SELECT id, tenant_id INTO _client_id, _existing_tenant
      FROM public.clients WHERE linked_user_id = _uid;
    IF _client_id IS NOT NULL THEN
      IF _existing_tenant IS DISTINCT FROM _tok.tenant_id THEN
        RAISE EXCEPTION 'This account is already registered as a client of another workspace. Please accept this invite with a different email address.';
      END IF;
      UPDATE public.clients
         SET status = 'active',
             onboarding_stage = COALESCE(onboarding_stage, 'invited'),
             updated_at = now()
       WHERE id = _client_id;
    ELSE
      IF _tok.contact_id IS NOT NULL THEN
        SELECT id INTO _client_id FROM public.clients
          WHERE id = _tok.contact_id AND tenant_id = _tok.tenant_id AND linked_user_id IS NULL;
      END IF;
      IF _client_id IS NULL THEN
        SELECT id INTO _client_id FROM public.clients
          WHERE tenant_id = _tok.tenant_id AND linked_user_id IS NULL
            AND email IS NOT NULL
            AND lower(email) = lower(COALESCE(_tok.email, _email))
          ORDER BY created_at ASC LIMIT 1;
      END IF;
      IF _client_id IS NOT NULL THEN
        UPDATE public.clients
           SET linked_user_id = _uid, status = 'active',
               onboarding_stage = COALESCE(onboarding_stage, 'invited'), updated_at = now()
         WHERE id = _client_id;
      ELSE
        INSERT INTO public.clients (tenant_id, created_by, email, first_name, last_name, linked_user_id, onboarding_stage, status)
        VALUES (_tok.tenant_id, COALESCE(_tok.created_by, _tenant_owner, _uid), _email, _first, _last, _uid, 'invited', 'active')
        RETURNING id INTO _client_id;
      END IF;
    END IF;

    INSERT INTO public.user_roles (user_id, role) VALUES (_uid, 'client')
    ON CONFLICT (user_id, role) DO NOTHING;

  ELSIF _tok.kind = 'subaccount_owner' THEN
    SELECT email INTO _email FROM auth.users WHERE id = _uid;
    IF _tok.email IS NOT NULL AND lower(_tok.email) <> lower(COALESCE(_email, '')) THEN
      RAISE EXCEPTION 'This invite was sent to a different email address. Accept it while signed in as %', _tok.email;
    END IF;
    INSERT INTO public.tenant_members (tenant_id, user_id, role, status, joined_at)
    VALUES (_tok.tenant_id, _uid, 'admin', 'active', now())
    ON CONFLICT (tenant_id, user_id) DO UPDATE
      SET role = 'admin',
          status = 'active',
          joined_at = COALESCE(public.tenant_members.joined_at, now()),
          updated_at = now();

  ELSIF _tok.kind = 'agency_team' THEN
    SELECT email INTO _email FROM auth.users WHERE id = _uid;
    IF _tok.email IS NOT NULL AND lower(_tok.email) <> lower(COALESCE(_email, '')) THEN
      RAISE EXCEPTION 'This invite was sent to a different email address. Accept it while signed in as %', _tok.email;
    END IF;
    IF _tok.agency_role IS NULL OR _tok.agency_role NOT IN
       ('agency_admin','agency_manager','agency_biller','agency_specialist','agency_viewer') THEN
      RAISE EXCEPTION 'This agency invite is missing a valid role. Ask the agency to resend it.';
    END IF;

    DELETE FROM public.agency_team_members
     WHERE agency_tenant_id = _tok.tenant_id
       AND user_id IS NULL
       AND email IS NOT NULL
       AND lower(email) = lower(COALESCE(_email, ''));

    UPDATE public.agency_team_members
       SET agency_role = _tok.agency_role,
           status = 'active',
           email = COALESCE(email, _email),
           joined_at = COALESCE(joined_at, now()),
           updated_at = now()
     WHERE agency_tenant_id = _tok.tenant_id AND user_id = _uid;
    IF NOT FOUND THEN
      INSERT INTO public.agency_team_members
        (agency_tenant_id, user_id, email, agency_role, status, invited_by, invited_at, joined_at)
      VALUES
        (_tok.tenant_id, _uid, _email, _tok.agency_role, 'active', _tok.created_by, _tok.created_at, now());
    END IF;

  ELSE
    -- SECURITY (Tier Rail Phase A): a generic staff/'team' invite may only grant
    -- tenant_members on a NON-agency tenant. Agency/enterprise authority must be
    -- granted through kind='agency_team' (→ agency_team_members), never through a
    -- staff-membership row that inference could read as agency-console access.
    IF (SELECT account_type FROM public.tenants WHERE id = _tok.tenant_id)
         IN ('agency','enterprise') THEN
      RAISE EXCEPTION 'Staff invites cannot grant access on an agency or enterprise account. Use an agency team invite instead.';
    END IF;

    INSERT INTO public.tenant_members (tenant_id, user_id, role, status, joined_at)
    VALUES (_tok.tenant_id, _uid, _tok.default_role, 'active', now())
    ON CONFLICT (tenant_id, user_id) DO UPDATE
      SET status = 'active',
          joined_at = COALESCE(public.tenant_members.joined_at, now()),
          updated_at = now();
  END IF;

  UPDATE public.tenant_invite_tokens SET uses = uses + 1, last_used_at = now() WHERE id = _tok.id;
  UPDATE public.profiles SET active_tenant_id = _tok.tenant_id WHERE user_id = _uid;

  RETURN _tok.tenant_id;
END $function$;

REVOKE ALL ON FUNCTION public.accept_tenant_invite(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.accept_tenant_invite(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.accept_tenant_invite(text) TO service_role;

-- ----------------------------------------------------------------------------
-- (1d) actor_manages_any_agency(_actor)
--   Used by paige-mcp deriveTier() to grant the MCP AGENCY tier. It was the 4th
--   inference surface (tenant_members role IN owner/admin × account_type), so a
--   stray admin row would still get agency-tier MCP tools even after the DB gates
--   above were repointed. Repoint it onto the SAME declared rail: an actor
--   "manages an agency" iff agency_current_id resolves — i.e. an ACTIVE
--   agency_team_members row, or the immutable OWNER of an agency/enterprise tenant.
--   Legit operators are unaffected (they hold rail rows); the leak closes on the
--   MCP surface too. Preserves the original grant (service_role only).
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.actor_manages_any_agency(_actor uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT public.agency_current_id(_actor) IS NOT NULL;
$function$;

REVOKE ALL ON FUNCTION public.actor_manages_any_agency(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.actor_manages_any_agency(uuid) TO service_role;

-- ============================================================================
-- Phase A.2 — the FIVE residual inference surfaces the §1/§5 adversarial crew
-- found (two independent crews corroborated). Each still read the OLD
-- tenant_members role IN ('owner','admin') × account_type inference, so a stray
-- admin row on an agency/enterprise tenant could still reach agency-scoped data
-- or view even after the 4 gates above were repointed. Repoint each onto the
-- SAME declared rail (agency_current_id / agency_team_role), preserving grants.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- (3a) list_subaccounts(_actor) — the service_role MCP twin of the (already
--   repointed) agency_list_my_subaccounts(). Was returning children across
--   EVERY agency where the actor held an owner/admin tenant_members row, so a
--   mixed operator (real agency A + stray admin on agency B) saw B's roster over
--   MCP. Gate on the rail per parent, dropping the admin×account_type join.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.list_subaccounts(_actor uuid)
 RETURNS TABLE(id uuid, slug text, name text, account_type text, status text, created_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT c.id, c.slug, c.name, c.account_type, c.status::text, c.created_at
  FROM public.tenants c
  JOIN public.tenants p ON p.id = c.parent_tenant_id
  WHERE p.account_type IN ('agency', 'enterprise')
    AND public.agency_team_role(p.id, _actor) IS NOT NULL
  ORDER BY c.created_at DESC;
$function$;

REVOKE ALL ON FUNCTION public.list_subaccounts(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_subaccounts(uuid) TO service_role;

-- ----------------------------------------------------------------------------
-- (3b) actor_primary_agency(_actor) — the service_role "agency home" resolver
--   behind agency_exit_subaccount(_actor) (paige-mcp exit_subaccount). Was pure
--   inference and, ordered by oldest joined_at, a stray admin row could even
--   OUTRANK the operator's real agency. Repoint to the rail-first resolver; the
--   _actor exit overload that calls this is fixed transitively.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.actor_primary_agency(_actor uuid)
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT public.agency_current_id(_actor);
$function$;

REVOKE ALL ON FUNCTION public.actor_primary_agency(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.actor_primary_agency(uuid) TO service_role;

-- ----------------------------------------------------------------------------
-- (3c) agency_exit_subaccount() (no-arg, authenticated) — the browser-callable
--   "return to /agency" RPC (AccountSwitcher.goToAgency). Resolved the return-to
--   agency by inline inference and set active_tenant_id to it. Repoint onto the
--   rail so a stray/durable child-admin row can't land the actor on an agency.
--   Behavior otherwise identical (same RAISE, same profiles UPDATE, same shape).
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.agency_exit_subaccount()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _agency uuid;
BEGIN
  _agency := public.agency_current_id(auth.uid());
  IF _agency IS NULL THEN
    RAISE EXCEPTION 'not_an_agency_manager' USING ERRCODE = '42501';
  END IF;

  UPDATE public.profiles SET active_tenant_id = _agency WHERE user_id = auth.uid();
  RETURN jsonb_build_object('active_tenant_id', _agency);
END;
$function$;

REVOKE ALL ON FUNCTION public.agency_exit_subaccount() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.agency_exit_subaccount() TO authenticated;

-- ----------------------------------------------------------------------------
-- (3d) agency_portfolio_metrics() (authenticated) — the Agency dashboard KPI
--   rollup. Its AUTHORIZATION gate was the old inference. Two problems: (a) a
--   stray admin passed it (empty rollup, but a 200 "you're an agency manager"
--   signal instead of 42501); (b) REGRESSION — a rail-only operator added via
--   kind='agency_team' (agency_manager/biller/specialist/viewer, or an
--   agency_admin with no legacy tenant_members owner/admin row) FAILED this gate
--   and got agency_scope_forbidden on the KPI header even though the rest of the
--   console worked. Repoint the guard to the rail; the CTE body (which already
--   draws from the rail-gated agency_list_my_subaccounts()) is unchanged.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.agency_portfolio_metrics()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE result jsonb;
BEGIN
  IF public.agency_current_id(auth.uid()) IS NULL THEN
    RAISE EXCEPTION 'agency_scope_forbidden' USING ERRCODE = '42501';
  END IF;
  WITH kids AS (SELECT s.id, s.name, s.status, s.created_at FROM public.agency_list_my_subaccounts() s),
  kid_clients AS (SELECT c.tenant_id, count(*) AS cnt FROM public.clients c WHERE c.tenant_id IN (SELECT id FROM kids) GROUP BY c.tenant_id),
  kid_mrr AS (
    SELECT ps.tenant_id, sum(CASE WHEN ps.billing_period = 'annual' THEN round(pl.annual_price_cents::numeric / 12)::bigint ELSE pl.monthly_price_cents END)::bigint AS mrr
    FROM public.platform_subscriptions ps JOIN public.platform_subscription_plans pl ON pl.id = ps.plan_id
    WHERE ps.tenant_id IN (SELECT id FROM kids) AND ps.status IN ('active', 'trialing') GROUP BY ps.tenant_id),
  kid_dunning AS (SELECT DISTINCT ps.tenant_id FROM public.platform_subscriptions ps WHERE ps.tenant_id IN (SELECT id FROM kids) AND ps.status IN ('past_due', 'unpaid')),
  kid_h AS (
    SELECT k.id, k.name, k.status, k.created_at, COALESCE(kc.cnt, 0) AS client_count, COALESCE(km.mrr, 0) AS mrr_cents,
      CASE WHEN k.status IN ('past_due', 'suspended', 'canceled') OR kd.tenant_id IS NOT NULL THEN 'at_risk'
           WHEN k.status = 'trial' THEN 'watch' ELSE 'healthy' END AS health
    FROM kids k LEFT JOIN kid_clients kc ON kc.tenant_id = k.id LEFT JOIN kid_mrr km ON km.tenant_id = k.id LEFT JOIN kid_dunning kd ON kd.tenant_id = k.id)
  SELECT jsonb_build_object(
    'active_subaccounts',  count(*) FILTER (WHERE status NOT IN ('canceled', 'suspended')),
    'subaccounts_added',   count(*) FILTER (WHERE created_at >= now() - interval '30 days'),
    'subaccounts_churned', count(*) FILTER (WHERE status IN ('canceled', 'suspended')),
    'net_growth', count(*) FILTER (WHERE created_at >= now() - interval '30 days') - count(*) FILTER (WHERE status IN ('canceled', 'suspended')),
    'portfolio_mrr_cents', COALESCE(sum(mrr_cents), 0),
    'at_risk_subaccounts', count(*) FILTER (WHERE health = 'at_risk'),
    'clients_under_mgmt',  COALESCE(sum(client_count), 0),
    'health', jsonb_build_object('healthy', count(*) FILTER (WHERE health = 'healthy'), 'watch', count(*) FILTER (WHERE health = 'watch'), 'at_risk', count(*) FILTER (WHERE health = 'at_risk')),
    'leaderboard', COALESCE((SELECT jsonb_agg(jsonb_build_object('tenant_id', lb.id, 'name', lb.name, 'client_count', lb.client_count, 'mrr_cents', lb.mrr_cents, 'health', lb.health) ORDER BY lb.mrr_cents DESC, lb.client_count DESC)
      FROM (SELECT * FROM kid_h ORDER BY mrr_cents DESC, client_count DESC LIMIT 20) lb), '[]'::jsonb))
  INTO result FROM kid_h;
  RETURN result;
END; $function$;

REVOKE ALL ON FUNCTION public.agency_portfolio_metrics() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.agency_portfolio_metrics() TO authenticated;

-- ----------------------------------------------------------------------------
-- (3e) RLS policy agency_team_select ON agency_team_members — the leak sat on
--   the rail's OWN table: the SELECT policy's inference arm let any stray admin
--   read the WHOLE agency roster (every teammate's user_id, email, agency_role,
--   scoped_subaccounts). Replace the tenant_members owner/admin arm with the
--   rail: you see your own row, or the full roster iff you resolve a role on the
--   rail (agency_team_role handles the immutable owner + active team members).
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS agency_team_select ON public.agency_team_members;
CREATE POLICY agency_team_select ON public.agency_team_members
  FOR SELECT
  USING (
    user_id = auth.uid()
    OR public.agency_team_role(agency_tenant_id, auth.uid()) IS NOT NULL
  );

COMMIT;
