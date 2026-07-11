-- Paige tool autonomy policy — per-tenant, per-tool control over how much Paige
-- does on her own. This is the "just like we have it set up with you" control the
-- owner asked for: for every mutating action Paige can take, the operator picks a
-- mode —
--   'auto'    → Paige acts on it herself, no confirmation.
--   'confirm' → Paige proposes it, echoes exactly what she's about to do, and
--               waits for the operator's yes before committing (the SAFE DEFAULT).
--   'off'     → the action is disabled for this workspace; Paige can't run it.
--
-- The default for every mutating tool is 'confirm'. Nothing is on autopilot until
-- the operator (or platform owner) explicitly turns it on. This is why Paige
-- "jumping the gun" — creating a pipeline without proposing first — can never
-- happen again once the paige-ai-chat gate reads this policy: with no row, the
-- effective mode is 'confirm', so she must propose and wait.
--
-- Read/written only through the SECURITY DEFINER RPCs below; direct writes are
-- blocked by RLS (members may read their own tenant's policy for the settings UI).

-- ── 1. The policy table ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.tenant_tool_autonomy (
  tenant_id  uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  tool_key   text NOT NULL,
  mode       text NOT NULL DEFAULT 'confirm' CHECK (mode IN ('auto', 'confirm', 'off')),
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, tool_key)
);

ALTER TABLE public.tenant_tool_autonomy ENABLE ROW LEVEL SECURITY;

-- Members read their own tenant's policy (drives the settings UI); the platform
-- owner reads any. Writes go through set_tool_autonomy only — no INSERT/UPDATE
-- policy exists, so RLS denies direct mutation.
DROP POLICY IF EXISTS tenant_tool_autonomy_read ON public.tenant_tool_autonomy;
CREATE POLICY tenant_tool_autonomy_read ON public.tenant_tool_autonomy
  FOR SELECT
  USING (tenant_id = public.current_user_tenant_id() OR public.is_platform_owner());

-- ── 2. resolve_tool_autonomy — the single source of truth the chat gate reads ────
-- Returns the effective mode for one tool in one tenant. Missing row → 'confirm'.
-- Dual-caller: a JWT caller may only resolve their own tenant (or any, if platform
-- owner); the service role (auth.uid() NULL) trusts the passed _tenant_id. A NULL
-- tenant resolves to the safe default 'confirm' — never 'auto'.
CREATE OR REPLACE FUNCTION public.resolve_tool_autonomy(
  _tenant_id uuid,
  _tool_key  text
)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _caller uuid := auth.uid();
  _tenant uuid := _tenant_id;
  _mode   text;
BEGIN
  IF _caller IS NOT NULL THEN
    -- Pin a JWT caller to their own tenant unless they are the platform owner.
    IF NOT public.is_platform_owner() THEN
      _tenant := public.current_user_tenant_id();
    END IF;
  END IF;

  IF _tenant IS NULL OR _tool_key IS NULL THEN
    RETURN 'confirm';
  END IF;

  SELECT mode INTO _mode
  FROM public.tenant_tool_autonomy
  WHERE tenant_id = _tenant AND tool_key = _tool_key;

  RETURN COALESCE(_mode, 'confirm');
END;
$$;

-- ── 3. set_tool_autonomy — operator/owner changes a tool's mode ──────────────────
-- Dual-caller. JWT branch: admin of the tenant (or platform owner) required.
-- Service branch: trusts _tenant_id (used by provisioning / Paige-governed flows).
CREATE OR REPLACE FUNCTION public.set_tool_autonomy(
  _tool_key  text,
  _mode      text,
  _tenant_id uuid DEFAULT NULL
)
RETURNS public.tenant_tool_autonomy
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _caller uuid := auth.uid();
  _tenant uuid;
  _row    public.tenant_tool_autonomy;
BEGIN
  IF _mode IS NULL OR _mode NOT IN ('auto', 'confirm', 'off') THEN
    RAISE EXCEPTION 'AUTONOMY_BAD_MODE: mode must be auto|confirm|off' USING ERRCODE = '22023';
  END IF;
  IF _tool_key IS NULL OR btrim(_tool_key) = '' THEN
    RAISE EXCEPTION 'AUTONOMY_NO_TOOL: tool_key is required' USING ERRCODE = '22023';
  END IF;

  IF _caller IS NOT NULL THEN
    _tenant := public.current_user_tenant_id();
    IF _tenant_id IS NOT NULL AND _tenant_id <> _tenant AND NOT public.is_platform_owner() THEN
      RAISE EXCEPTION 'AUTONOMY_FORBIDDEN: tenant mismatch' USING ERRCODE = '42501';
    END IF;
    IF public.is_platform_owner() AND _tenant_id IS NOT NULL THEN _tenant := _tenant_id; END IF;
    IF NOT (public.is_tenant_admin(_tenant) OR public.is_platform_owner()) THEN
      RAISE EXCEPTION 'AUTONOMY_FORBIDDEN: admin required' USING ERRCODE = '42501';
    END IF;
  ELSE
    _tenant := _tenant_id;
    IF _tenant IS NULL THEN RAISE EXCEPTION 'AUTONOMY_NO_TENANT' USING ERRCODE = '22023'; END IF;
  END IF;

  INSERT INTO public.tenant_tool_autonomy (tenant_id, tool_key, mode, updated_by, updated_at)
  VALUES (_tenant, _tool_key, _mode, _caller, now())
  ON CONFLICT (tenant_id, tool_key)
  DO UPDATE SET mode = EXCLUDED.mode, updated_by = EXCLUDED.updated_by, updated_at = now()
  RETURNING * INTO _row;

  RETURN _row;
END;
$$;

-- ── 4. list_tool_autonomy — every governable tool + its effective mode ───────────
-- Returns one row per known mutating tool (the canonical catalog), with the
-- tenant's explicit mode where set, else the 'confirm' default. Powers the
-- autonomy settings UI so the operator sees the full surface, not only overrides.
CREATE OR REPLACE FUNCTION public.list_tool_autonomy(
  _tenant_id uuid DEFAULT NULL
)
RETURNS TABLE (
  tool_key    text,
  label       text,
  category    text,
  mode        text,
  is_default  boolean,
  updated_at  timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _caller uuid := auth.uid();
  _tenant uuid;
BEGIN
  IF _caller IS NOT NULL THEN
    _tenant := public.current_user_tenant_id();
    IF _tenant_id IS NOT NULL AND _tenant_id <> _tenant AND NOT public.is_platform_owner() THEN
      RAISE EXCEPTION 'AUTONOMY_FORBIDDEN: tenant mismatch' USING ERRCODE = '42501';
    END IF;
    IF public.is_platform_owner() AND _tenant_id IS NOT NULL THEN _tenant := _tenant_id; END IF;
  ELSE
    _tenant := _tenant_id;
  END IF;

  RETURN QUERY
  WITH catalog(tool_key, label, category) AS (
    VALUES
      ('crm_update_contact',        'Update a contact',              'CRM'),
      ('crm_create_contact',        'Add a contact',                 'CRM'),
      ('crm_delete_contact',        'Delete a contact',              'CRM'),
      ('crm_update_pipeline_stage', 'Move a client''s stage',        'Pipeline'),
      ('crm_assign_coach',          'Assign a coach',                'CRM'),
      ('crm_assign_contact',        'Assign a contact',              'CRM'),
      ('crm_create_task',           'Create a task',                 'Tasks'),
      ('crm_log_activity',          'Log an activity',               'CRM'),
      ('pipeline_create',           'Create a pipeline',             'Pipeline'),
      ('pipeline_add_stage',        'Add a pipeline stage',          'Pipeline'),
      ('member_grant_role',         'Grant a staff role',            'Team'),
      ('member_revoke_role',        'Revoke a staff role',           'Team'),
      ('calendar_book_meeting',     'Book a meeting',                'Calendar'),
      ('program_enroll',            'Enroll a client in a program',  'Programs'),
      ('draft_marketing_content',   'Draft marketing content',       'Content'),
      ('generate_image',            'Generate an image',             'Content'),
      ('content_save',              'Save marketing content',        'Content'),
      ('action_file',               'File an action',                'Action bus'),
      ('action_advance',            'Advance an action',             'Action bus')
  )
  SELECT
    c.tool_key,
    c.label,
    c.category,
    COALESCE(t.mode, 'confirm')       AS mode,
    (t.mode IS NULL)                  AS is_default,
    t.updated_at
  FROM catalog c
  LEFT JOIN public.tenant_tool_autonomy t
    ON t.tool_key = c.tool_key AND t.tenant_id = _tenant
  ORDER BY c.category, c.label;
END;
$$;

GRANT EXECUTE ON FUNCTION public.resolve_tool_autonomy(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.set_tool_autonomy(text, text, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.list_tool_autonomy(uuid) TO authenticated, service_role;
