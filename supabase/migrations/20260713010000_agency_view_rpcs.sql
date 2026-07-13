-- Agency View (#26) — BROWSER-CALLABLE, §9-parentage-gated RPCs for the agency tier.
--
-- The agency tools shipped in #25 (list_subaccounts / get_subaccount_metrics /
-- agency_can_manage_child) are actor-EXPLICIT and GRANTed to service_role ONLY,
-- so the browser cannot call them (a forged _actor would be an IDOR hole). The
-- dedicated Agency View surface runs in the user's own session with a normal
-- authenticated Supabase client and therefore needs auth.uid()-keyed entry
-- points that carry NO caller-supplied identity at all.
--
-- Everything here is derived from auth.uid(): an agency sees/manages ONLY the
-- sub-accounts under an Agency/Enterprise tenant it OWNS or ADMINISTERS. Every
-- child-touching function proves parentage via agency_can_manage_child(_child,
-- auth.uid()) BEFORE any read or write — a foreign child, a standalone tenant,
-- or a non-manager all fail that single predicate, closing the cross-agency /
-- arbitrary-tenant IDOR surface (§9, the #1 thing to prevent).
--
-- This is the AGENCY RESELL layer: the catalog is OWNED at the God/platform
-- level; agencies do not create catalog items, they PROVISION God-owned items
-- (skins · features · skills) DOWN onto their own children by writing the
-- child's tenants.features.enabled_skills — the SAME jsonb the tenant-level
-- set_tenant_skill maintains. No service-role, no code change per catalog item.
--
-- Design rules honored:
--   • auth.uid() only — no _actor param on any function here, so a browser
--     client has nothing to forge (§9/§13).
--   • Reuses the audited agency_can_manage_child(_child, _actor) guard and the
--     set_tenant_skill enable/disable jsonb logic — no copy-paste fork of the
--     authority check, no second source of truth (§13).
--   • Funding is a God-owned catalog item like any other: it is resold ONLY as
--     an explicit per-child opt-in (an agency calls provision with _slug
--     'funding', _enabled true for a specific child) — never forced, defaulted,
--     or applied across children (§2).

-- ── (1) agency_list_my_subaccounts — the caller's OWN children, no id in ──────
-- Mirrors list_subaccounts(_actor) but keyed on auth.uid(), so there is no IDOR
-- surface: the result set IS exactly the children of every Agency/Enterprise
-- tenant the CALLER owns/admins. A standalone (non-agency) caller gets an empty
-- set — nothing to leak.
CREATE OR REPLACE FUNCTION public.agency_list_my_subaccounts()
RETURNS TABLE(id uuid, slug text, name text, account_type text, status text, created_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT c.id, c.slug, c.name, c.account_type, c.status::text, c.created_at
  FROM public.tenants c
  JOIN public.tenants p         ON p.id = c.parent_tenant_id
  JOIN public.tenant_members m  ON m.tenant_id = p.id AND m.user_id = auth.uid()
  WHERE p.account_type IN ('agency', 'enterprise')
    AND m.status = 'active'
    AND m.role IN ('owner', 'admin')
  ORDER BY c.created_at DESC;
$$;

-- ── (2) agency_subaccount_metrics — one child, parentage-checked first ────────
-- Same metrics shape as get_subaccount_metrics; the §9 guard runs BEFORE any
-- read, so a child that is not the caller's own raises before a row is touched.
CREATE OR REPLACE FUNCTION public.agency_subaccount_metrics(_child uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  _result jsonb;
BEGIN
  IF NOT public.agency_can_manage_child(_child, auth.uid()) THEN
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

-- ── (3) agency_child_provisioned — what a child already has, parentage-checked ─
-- Read-only mirror the Agency View uses to render each child's currently
-- provisioned catalog items (its tenants.features.enabled_skills). Guard first.
CREATE OR REPLACE FUNCTION public.agency_child_provisioned(_child uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  _skills jsonb;
BEGIN
  IF NOT public.agency_can_manage_child(_child, auth.uid()) THEN
    RAISE EXCEPTION 'agency_scope_forbidden' USING ERRCODE = '42501';
  END IF;
  SELECT COALESCE(t.features -> 'enabled_skills', '[]'::jsonb)
  INTO _skills
  FROM public.tenants t
  WHERE t.id = _child;
  RETURN COALESCE(_skills, '[]'::jsonb);
END;
$$;

-- ── (4) agency_provision_catalog_item — THE agency RESELL seam ────────────────
-- The load-bearing write. An agency provisions (enable) or de-provisions
-- (disable) a God-owned catalog item onto ONE of its OWN children by mutating
-- that child's tenants.features.enabled_skills.
--
--   §9  — parentage-gated: agency_can_manage_child(_child, auth.uid()) is the
--         IDOR guard. An agency may provision ONLY its own child; a foreign
--         child / standalone / arbitrary tenant raises agency_scope_forbidden
--         BEFORE any write. This is the #1 isolation invariant of the surface.
--   §2  — funding is a God-owned catalog item resold as an EXPLICIT per-child
--         opt-in only (caller passes _slug 'funding', _enabled true for a
--         specific child). It is NEVER forced, defaulted, or fanned out across
--         children by this function — one child, one explicit call.
--   §10 — this RPC is the Paige-callable provisioning seam; the Agency View UI
--         is one caller, Paige's agent is another. No logic lives only in React.
--   §13 — reuses set_tenant_skill's exact enable/disable jsonb logic (read the
--         array, drop the slug, re-add iff _enabled) so there is one behavior of
--         record, not a fork.
CREATE OR REPLACE FUNCTION public.agency_provision_catalog_item(_child uuid, _slug text, _enabled boolean)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  _skills jsonb;
BEGIN
  -- (a) slug shape — same allow-list as set_tenant_skill (lowercase/digits/_).
  IF _slug IS NULL OR _slug !~ '^[a-z0-9_]+$' THEN
    RAISE EXCEPTION 'invalid_slug';
  END IF;

  -- (b) §9 IDOR guard — parentage proven BEFORE any read or write.
  IF NOT public.agency_can_manage_child(_child, auth.uid()) THEN
    RAISE EXCEPTION 'agency_scope_forbidden' USING ERRCODE = '42501';
  END IF;

  -- (c) mirror set_tenant_skill's jsonb enable/disable on the CHILD tenant.
  SELECT COALESCE(
           (SELECT jsonb_agg(DISTINCT v)
            FROM jsonb_array_elements_text(COALESCE(t.features -> 'enabled_skills', '[]'::jsonb)) AS v
            WHERE v <> _slug),
           '[]'::jsonb)
  INTO _skills
  FROM public.tenants t WHERE t.id = _child;

  IF _enabled THEN
    _skills := _skills || to_jsonb(_slug);
  END IF;

  UPDATE public.tenants
  SET features = COALESCE(features, '{}'::jsonb) || jsonb_build_object('enabled_skills', _skills)
  WHERE id = _child;

  RETURN _skills;
END;
$$;

-- ── (5) Least privilege — authenticated only, no anon/public ──────────────────
-- Every function keys off auth.uid(), so authenticated is exactly the audience:
-- the caller's own identity IS the scope, and it cannot be forged.
REVOKE ALL ON FUNCTION public.agency_list_my_subaccounts()                          FROM public, anon;
REVOKE ALL ON FUNCTION public.agency_subaccount_metrics(uuid)                       FROM public, anon;
REVOKE ALL ON FUNCTION public.agency_child_provisioned(uuid)                        FROM public, anon;
REVOKE ALL ON FUNCTION public.agency_provision_catalog_item(uuid, text, boolean)    FROM public, anon;

GRANT EXECUTE ON FUNCTION public.agency_list_my_subaccounts()                       TO authenticated;
GRANT EXECUTE ON FUNCTION public.agency_subaccount_metrics(uuid)                    TO authenticated;
GRANT EXECUTE ON FUNCTION public.agency_child_provisioned(uuid)                     TO authenticated;
GRANT EXECUTE ON FUNCTION public.agency_provision_catalog_item(uuid, text, boolean) TO authenticated;
