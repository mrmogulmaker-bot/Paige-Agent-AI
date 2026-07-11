-- Per-tenant Workflows & Automations registry (GHL-parity). Every tenant gets a
-- record of the automations in THEIR connected n8n — so the team (and the
-- customer) can see what exists and is active, and so Paige keeps good records of
-- what's running, including the workflows SHE authors. Synced from n8n on every
-- list/test; Paige-created workflows are tagged as such. Folders give GHL-style
-- organization. Tenant-scoped (§9): a tenant only ever sees its own.

CREATE TABLE IF NOT EXISTS public.tenant_workflows (
  tenant_id        uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  n8n_workflow_id  text NOT NULL,
  name             text,
  active           boolean NOT NULL DEFAULT false,
  tags             text[] NOT NULL DEFAULT '{}',
  folder           text,
  source           text NOT NULL DEFAULT 'n8n_sync'
                     CHECK (source IN ('n8n_sync', 'paige_created', 'manual')),
  created_by_paige boolean NOT NULL DEFAULT false,
  notes            text,
  present_in_n8n   boolean NOT NULL DEFAULT true,
  first_seen_at    timestamptz NOT NULL DEFAULT now(),
  last_synced_at   timestamptz NOT NULL DEFAULT now(),
  last_run_at      timestamptz,
  updated_at       timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, n8n_workflow_id)
);

ALTER TABLE public.tenant_workflows ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_workflows_read ON public.tenant_workflows;
CREATE POLICY tenant_workflows_read ON public.tenant_workflows
  FOR SELECT
  USING (tenant_id = public.current_user_tenant_id() OR public.is_platform_owner());

-- ── sync_tenant_workflows — bulk upsert from an n8n list (service-role) ──────────
-- _workflows is a jsonb array of {id, name, active, tags}. Upserts each, marks
-- everything else for the tenant as no longer present_in_n8n (soft-remove so the
-- history/record survives). Called by paige-n8n on list/test.
CREATE OR REPLACE FUNCTION public.sync_tenant_workflows(
  _tenant_id uuid,
  _workflows jsonb
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _ids text[];
  _n   integer := 0;
BEGIN
  IF _tenant_id IS NULL THEN RAISE EXCEPTION 'WF_NO_TENANT' USING ERRCODE = '22023'; END IF;

  SELECT array_agg(w->>'id') INTO _ids
  FROM jsonb_array_elements(COALESCE(_workflows, '[]'::jsonb)) w
  WHERE w->>'id' IS NOT NULL;

  INSERT INTO public.tenant_workflows (tenant_id, n8n_workflow_id, name, active, tags, present_in_n8n, last_synced_at, updated_at)
  SELECT _tenant_id, w->>'id', w->>'name', COALESCE((w->>'active')::boolean, false),
         COALESCE((SELECT array_agg(t) FROM jsonb_array_elements_text(COALESCE(w->'tags','[]'::jsonb)) t), '{}'),
         true, now(), now()
  FROM jsonb_array_elements(COALESCE(_workflows, '[]'::jsonb)) w
  WHERE w->>'id' IS NOT NULL
  ON CONFLICT (tenant_id, n8n_workflow_id) DO UPDATE SET
    name = EXCLUDED.name, active = EXCLUDED.active, tags = EXCLUDED.tags,
    present_in_n8n = true, last_synced_at = now(), updated_at = now();
  GET DIAGNOSTICS _n = ROW_COUNT;

  UPDATE public.tenant_workflows
     SET present_in_n8n = false, updated_at = now()
   WHERE tenant_id = _tenant_id
     AND present_in_n8n
     AND (_ids IS NULL OR n8n_workflow_id <> ALL(_ids));

  RETURN _n;
END;
$$;

-- ── record_paige_workflow — tag a Paige-authored workflow (service-role) ─────────
CREATE OR REPLACE FUNCTION public.record_paige_workflow(
  _tenant_id       uuid,
  _n8n_workflow_id text,
  _name            text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF _tenant_id IS NULL OR _n8n_workflow_id IS NULL THEN
    RAISE EXCEPTION 'WF_BAD_ARGS' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.tenant_workflows (tenant_id, n8n_workflow_id, name, source, created_by_paige, present_in_n8n, last_synced_at, updated_at)
  VALUES (_tenant_id, _n8n_workflow_id, _name, 'paige_created', true, true, now(), now())
  ON CONFLICT (tenant_id, n8n_workflow_id) DO UPDATE SET
    name = COALESCE(EXCLUDED.name, public.tenant_workflows.name),
    source = 'paige_created', created_by_paige = true, updated_at = now();
END;
$$;

-- ── list_tenant_workflows — the registry UI reads this (dual-caller member read) ─
CREATE OR REPLACE FUNCTION public.list_tenant_workflows(
  _tenant_id uuid DEFAULT NULL
)
RETURNS SETOF public.tenant_workflows
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
      RAISE EXCEPTION 'WF_FORBIDDEN: tenant mismatch' USING ERRCODE = '42501';
    END IF;
    IF public.is_platform_owner() AND _tenant_id IS NOT NULL THEN _tenant := _tenant_id; END IF;
    IF NOT (public.is_tenant_member(_tenant) OR public.is_platform_owner()) THEN
      RAISE EXCEPTION 'WF_FORBIDDEN: not a member' USING ERRCODE = '42501';
    END IF;
  ELSE
    _tenant := _tenant_id;
    IF _tenant IS NULL THEN RAISE EXCEPTION 'WF_NO_TENANT' USING ERRCODE = '22023'; END IF;
  END IF;

  RETURN QUERY
  SELECT * FROM public.tenant_workflows
  WHERE tenant_id = _tenant
  ORDER BY present_in_n8n DESC, active DESC, COALESCE(folder, ''), name;
END;
$$;

-- ── set_tenant_workflow_folder — GHL-style organization (dual-caller admin) ──────
CREATE OR REPLACE FUNCTION public.set_tenant_workflow_folder(
  _n8n_workflow_id text,
  _folder          text,
  _tenant_id       uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
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
      RAISE EXCEPTION 'WF_FORBIDDEN: tenant mismatch' USING ERRCODE = '42501';
    END IF;
    IF public.is_platform_owner() AND _tenant_id IS NOT NULL THEN _tenant := _tenant_id; END IF;
    IF NOT (public.is_tenant_admin(_tenant) OR public.is_platform_owner()) THEN
      RAISE EXCEPTION 'WF_FORBIDDEN: admin required' USING ERRCODE = '42501';
    END IF;
  ELSE
    _tenant := _tenant_id;
    IF _tenant IS NULL THEN RAISE EXCEPTION 'WF_NO_TENANT' USING ERRCODE = '22023'; END IF;
  END IF;

  UPDATE public.tenant_workflows
     SET folder = NULLIF(btrim(COALESCE(_folder, '')), ''), updated_at = now()
   WHERE tenant_id = _tenant AND n8n_workflow_id = _n8n_workflow_id;
END;
$$;

REVOKE ALL ON FUNCTION public.sync_tenant_workflows(uuid, jsonb)            FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.record_paige_workflow(uuid, text, text)      FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.list_tenant_workflows(uuid)                  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.set_tenant_workflow_folder(text, text, uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.sync_tenant_workflows(uuid, jsonb)            TO service_role;
GRANT EXECUTE ON FUNCTION public.record_paige_workflow(uuid, text, text)      TO service_role;
GRANT EXECUTE ON FUNCTION public.list_tenant_workflows(uuid)                  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.set_tenant_workflow_folder(text, text, uuid) TO authenticated, service_role;
