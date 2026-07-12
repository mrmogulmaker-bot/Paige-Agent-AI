-- MCP Agency Tier (#25) — server-side isolation guards for the agency tool set.
--
-- The MCP endpoint (paige-mcp) gains a four-tier audience model:
--   GOD (platform operator) · AGENCY (parent tenant managing its OWN children) ·
--   TENANT (standalone owner/admin) · CLIENT (self.* portal seat).
-- Tier is derived per-request in the edge function; THIS migration provides the
-- load-bearing §9 row-level isolation that TypeScript must never be trusted to
-- enforce alone: every agency tool proves the target sub-account is genuinely a
-- child of the CALLER's own agency before touching a single row.
--
-- Design rules honored:
--   • The MCP runs as service_role, where auth.uid() is NULL. So the guards take
--     the resolved actor explicitly (_actor uuid) — the same pattern as
--     is_platform_owner(_user_id). Those _actor overloads are REVOKEd from
--     public/anon/authenticated and GRANTed to service_role ONLY, so a browser
--     client can never pass a forged _actor. Authenticated UI paths keep the
--     auth.uid() overloads.
--   • No column is added to paige_mcp_oauth_tokens — tier/tenant are recomputed
--     live every request from tenants.account_type + tenant_members, so a revoked
--     admin or a downgraded agency cannot replay stale authority (§13).
--   • create_subaccount's insert logic is refactored into ONE actor-explicit core
--     shared by both the UI (4-arg, auth.uid()) and the MCP (5-arg, _actor) — no
--     copy-paste fork (§13).

-- ── (1) agency_can_manage_child — the parentage + authority guard ────────────
-- TRUE iff _child is a sub-account whose parent is an Agency/Enterprise tenant
-- that _actor OWNS or ADMINISTERS. This single predicate stops every cross-agency
-- and arbitrary-tenant reach: a foreign child fails the parent JOIN, a standalone
-- tenant fails account_type, a non-manager fails the membership role filter.
CREATE OR REPLACE FUNCTION public.agency_can_manage_child(_child uuid, _actor uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.tenants child
    JOIN public.tenants parent    ON parent.id = child.parent_tenant_id
    JOIN public.tenant_members pm ON pm.tenant_id = parent.id AND pm.user_id = _actor
    WHERE child.id = _child
      AND parent.account_type IN ('agency', 'enterprise')  -- (c) non-agency parent → no reach
      AND pm.status = 'active'
      AND pm.role IN ('owner', 'admin')                    -- authority proven by membership, never a passed-in id
  );
$$;

-- auth.uid() convenience overload for any authenticated (RLS) reuse.
CREATE OR REPLACE FUNCTION public.agency_can_manage_child(_child uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT public.agency_can_manage_child(_child, auth.uid());
$$;

-- ── (2) list_subaccounts — the caller's OWN children only ────────────────────
-- No id is accepted, so there is no IDOR surface: the result set IS exactly the
-- children of every Agency/Enterprise tenant the actor owns/admins. A standalone
-- (non-agency) actor gets an empty set.
CREATE OR REPLACE FUNCTION public.list_subaccounts(_actor uuid)
RETURNS TABLE(id uuid, slug text, name text, account_type text, status text, created_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT c.id, c.slug, c.name, c.account_type, c.status::text, c.created_at
  FROM public.tenants c
  JOIN public.tenants p         ON p.id = c.parent_tenant_id
  JOIN public.tenant_members m  ON m.tenant_id = p.id AND m.user_id = _actor
  WHERE p.account_type IN ('agency', 'enterprise')
    AND m.status = 'active'
    AND m.role IN ('owner', 'admin')
  ORDER BY c.created_at DESC;
$$;

-- ── (3) get_subaccount_metrics — one child, parentage-checked before any read ─
CREATE OR REPLACE FUNCTION public.get_subaccount_metrics(_child uuid, _actor uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  _result jsonb;
BEGIN
  IF NOT public.agency_can_manage_child(_child, _actor) THEN
    RAISE EXCEPTION 'agency_scope_forbidden' USING ERRCODE = '42501';
  END IF;
  SELECT jsonb_build_object(
    'clients',          (SELECT count(*) FROM public.clients                  WHERE tenant_id = _child),
    'active_workflows', (SELECT count(*) FROM public.paige_workflow_registry  WHERE tenant_id = _child AND is_active),
    'members',          (SELECT count(*) FROM public.tenant_members           WHERE tenant_id = _child AND status = 'active')
  ) INTO _result;
  RETURN _result;
END;
$$;

-- ── (4) create_subaccount — actor-explicit core + auth.uid() wrapper ─────────
-- The 5-arg core is the ONE place the insert lives; the pre-existing 4-arg
-- signature is redefined as a thin wrapper that forwards auth.uid(), so the
-- authenticated UI path behaves EXACTLY as before while the MCP calls the core
-- with the actor it resolved from the OAuth token. Owner-only is preserved
-- (creating a whole workspace is an ownership act); an agency ADMIN sees the
-- tool but the RPC returns a truthful 42501.
CREATE OR REPLACE FUNCTION public.create_subaccount(
  _name text,
  _industry text,
  _description text,
  _parent_tenant_id uuid,
  _actor uuid
) RETURNS public.tenants
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  _uid uuid := _actor;
  _parent uuid := _parent_tenant_id;
  _parent_type text;
  _tenant public.tenants;
  _base_slug text;
  _slug text;
  _suffix int := 0;
  _child_count int;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '28000';
  END IF;
  IF _parent IS NULL THEN
    RAISE EXCEPTION 'no parent tenant in context' USING ERRCODE = '22000';
  END IF;
  IF NOT public.is_tenant_owner(_uid, _parent) THEN
    RAISE EXCEPTION 'only the tenant owner may create a sub-account' USING ERRCODE = '42501';
  END IF;

  SELECT account_type INTO _parent_type FROM public.tenants WHERE id = _parent;
  IF _parent_type NOT IN ('agency', 'enterprise') THEN
    RAISE EXCEPTION 'sub-accounts require an Agency or Enterprise account' USING ERRCODE = '42501';
  END IF;

  IF _name IS NULL OR length(trim(_name)) = 0 THEN
    RAISE EXCEPTION 'sub-account name required' USING ERRCODE = '22000';
  END IF;

  SELECT count(*) INTO _child_count FROM public.tenants WHERE parent_tenant_id = _parent;
  IF _child_count >= 100 THEN
    RAISE EXCEPTION 'sub-account limit (100) reached for this workspace' USING ERRCODE = '54000';
  END IF;

  _base_slug := trim(both '-' from regexp_replace(lower(trim(_name)), '[^a-z0-9]+', '-', 'g'));
  IF _base_slug IS NULL OR length(_base_slug) = 0 THEN _base_slug := 'subaccount'; END IF;
  _base_slug := left(_base_slug, 40);
  _slug := _base_slug;
  WHILE EXISTS (SELECT 1 FROM public.tenants WHERE slug = _slug) LOOP
    _suffix := _suffix + 1;
    _slug := _base_slug || '-' || _suffix::text;
  END LOOP;

  -- Children default to 'standalone' — an agency cannot spawn a pre-escalated
  -- sub-agency; upgrading a child is a separate god-only act.
  INSERT INTO public.tenants (slug, name, owner_user_id, parent_tenant_id, status, account_type, brand)
  VALUES (
    _slug, trim(_name), _uid, _parent, 'active', 'standalone',
    jsonb_strip_nulls(jsonb_build_object('industry', _industry, 'about', _description))
  )
  RETURNING * INTO _tenant;

  INSERT INTO public.tenant_members (tenant_id, user_id, role, status, joined_at)
  VALUES (_tenant.id, _uid, 'owner', 'active', now());

  RETURN _tenant;
END;
$$;

-- 4-arg wrapper — preserves the exact authenticated-UI contract (auth.uid()).
CREATE OR REPLACE FUNCTION public.create_subaccount(
  _name text,
  _industry text DEFAULT NULL,
  _description text DEFAULT NULL,
  _parent_tenant_id uuid DEFAULT NULL
) RETURNS public.tenants
LANGUAGE sql SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT public.create_subaccount(
    _name, _industry, _description,
    COALESCE(_parent_tenant_id, public.current_user_tenant_id()),
    auth.uid()
  );
$$;

-- ── (5) Least privilege ──────────────────────────────────────────────────────
-- Actor-explicit overloads are service_role ONLY — a browser client must never
-- pass a forged _actor. The auth.uid() overloads stay available to authenticated
-- (the guard reads auth.uid() itself, so it cannot be spoofed there).
REVOKE ALL ON FUNCTION public.agency_can_manage_child(uuid, uuid)      FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.list_subaccounts(uuid)                   FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_subaccount_metrics(uuid, uuid)       FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.create_subaccount(text, text, text, uuid, uuid) FROM public, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.agency_can_manage_child(uuid, uuid)   TO service_role;
GRANT EXECUTE ON FUNCTION public.list_subaccounts(uuid)                TO service_role;
GRANT EXECUTE ON FUNCTION public.get_subaccount_metrics(uuid, uuid)    TO service_role;
GRANT EXECUTE ON FUNCTION public.create_subaccount(text, text, text, uuid, uuid) TO service_role;

-- auth.uid() overloads keep their existing authenticated grant.
REVOKE ALL ON FUNCTION public.agency_can_manage_child(uuid)            FROM public, anon;
GRANT EXECUTE ON FUNCTION public.agency_can_manage_child(uuid)         TO authenticated;
REVOKE ALL ON FUNCTION public.create_subaccount(text, text, text, uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.create_subaccount(text, text, text, uuid) TO authenticated;
