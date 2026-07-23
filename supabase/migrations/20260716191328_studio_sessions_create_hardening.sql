-- Vibe Studio sessions — create/mutation hardening.
--
-- Two defects in create_studio_session (and its sibling mutation RPCs) surfaced when a real
-- tenant OWNER tried to start a project:
--
--   1. The role gate required ARRAY['admin','super_admin','coach'] — but a tenant's primary
--      user carries role 'owner', which was NOT in that list. A solo owner (the common case)
--      was refused outright; the only reason it ever worked was an account that happened to
--      also hold 'admin' on a second tenant. Add 'owner' so the person who owns the workspace
--      can build in it. (Kept as a staff gate — client/consumer seats still can't author.)
--
--   2. The audit_logs INSERT ran inline in the same transaction as the create. If anything about
--      that write failed (a trigger, a constraint, a future schema change), it took the whole
--      create down with it — an audit-trail nicety must never block the user's actual action
--      (§13). Wrap every audit write in its own exception-swallowing block so a create/mutate
--      succeeds even if the log line can't be written; the failure is raised as a WARNING for
--      diagnosis, never surfaced to the operator.
--
-- Idempotent: CREATE OR REPLACE only; no data change. Safe to re-run.

-- ── create_studio_session ────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.create_studio_session(
  p_title text DEFAULT NULL,
  p_seed_brief text DEFAULT NULL,
  p_transcript jsonb DEFAULT '[]'::jsonb,
  p_is_template boolean DEFAULT false,
  p_tenant_id uuid DEFAULT NULL,
  p_owner_user_id uuid DEFAULT NULL
)
RETURNS public.studio_sessions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _caller uuid := auth.uid(); _tenant uuid; _owner uuid; _row public.studio_sessions;
BEGIN
  IF _caller IS NOT NULL THEN
    IF NOT public.has_any_role(_caller, ARRAY['owner','admin','super_admin','coach']) THEN
      RAISE EXCEPTION 'STUDIO_FORBIDDEN: owner, admin, coach or super_admin required' USING ERRCODE = '42501';
    END IF;
    _tenant := public.current_user_tenant_id();
    _owner  := _caller;
  ELSE
    _tenant := p_tenant_id;
    _owner  := p_owner_user_id;
  END IF;
  IF _tenant IS NULL THEN
    RAISE EXCEPTION 'STUDIO_NO_TENANT: a tenant context is required' USING ERRCODE = '22023';
  END IF;
  IF p_transcript IS NOT NULL AND jsonb_typeof(p_transcript) <> 'array' THEN
    RAISE EXCEPTION 'STUDIO_INVALID_TRANSCRIPT: transcript must be a JSON array' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.studio_sessions
    (tenant_id, owner_user_id, title, seed_brief, transcript, is_template, last_opened_at)
  VALUES (_tenant, _owner,
          coalesce(nullif(btrim(p_title), ''), 'Untitled project'),
          nullif(btrim(p_seed_brief), ''),
          coalesce(p_transcript, '[]'::jsonb), coalesce(p_is_template, false), now())
  RETURNING * INTO _row;

  -- Audit is best-effort — it must never sink the create (§13).
  BEGIN
    INSERT INTO public.audit_logs (user_id, entity, action, entity_id, data)
    VALUES (_caller, 'studio_sessions', 'create_studio_session', _row.id,
            jsonb_build_object('tenant_id', _tenant, 'is_template', _row.is_template));
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'create_studio_session: audit write failed (%): %', SQLSTATE, SQLERRM;
  END;

  RETURN _row;
END; $function$;

REVOKE ALL ON FUNCTION public.create_studio_session(text, text, jsonb, boolean, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_studio_session(text, text, jsonb, boolean, uuid, uuid) TO authenticated, service_role;
