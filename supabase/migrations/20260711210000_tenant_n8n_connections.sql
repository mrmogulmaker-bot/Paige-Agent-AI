-- Per-tenant n8n connections — each tenant connects THEIR OWN n8n instance so
-- Paige can list, run, activate, and author workflows on their behalf (§9: never
-- a platform default; the operator's own n8n is just their tenant's connection).
--
-- Secrets: the n8n API key and instance URL are stored ENCRYPTED via the
-- platform's pgcrypto helper (platform_encrypt/decrypt, keyed off
-- _internal_secrets.platform_column_key, service_role only) — mirroring how
-- base_url_ct is handled on the legacy global table. The decrypted key is NEVER
-- returned to a browser; only edge functions (service role) can read it, and
-- only to call the tenant's n8n REST API server-side.
--
-- Access mirrors tenant_email_identities: RLS owner-ALL, and all reads/writes go
-- through dual-caller SECURITY DEFINER RPCs (JWT caller pinned to their own
-- tenant + admin-gated; service/Paige path trusts the passed tenant_id).

-- ── 1. Table ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.tenant_n8n_connections (
  tenant_id      uuid PRIMARY KEY REFERENCES public.tenants(id) ON DELETE CASCADE,
  label          text,
  base_url_ct    bytea,                       -- encrypted instance URL (e.g. https://acme.app.n8n.cloud)
  api_key_ct     bytea,                       -- encrypted n8n API key
  api_key_last4  text,                        -- safe display hint, never the key
  status         text NOT NULL DEFAULT 'unconfigured'
                   CHECK (status IN ('unconfigured', 'connected', 'error')),
  last_error     text,
  last_sync_at   timestamptz,
  workflow_count int NOT NULL DEFAULT 0,
  created_by     uuid,
  updated_by     uuid,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.tenant_n8n_connections ENABLE ROW LEVEL SECURITY;

-- Platform owner may operate directly; everyone else goes through the RPCs. No
-- tenant-member SELECT policy exists on purpose — the ciphertext columns must
-- never be exposed to a member row-read; safe status is served by the getter RPC.
DROP POLICY IF EXISTS tenant_n8n_owner_all ON public.tenant_n8n_connections;
CREATE POLICY tenant_n8n_owner_all ON public.tenant_n8n_connections
  FOR ALL
  USING (public.is_platform_owner())
  WITH CHECK (public.is_platform_owner());

-- ── 2. set_tenant_n8n_connection — operator saves/updates their n8n creds ────────
CREATE OR REPLACE FUNCTION public.set_tenant_n8n_connection(
  _base_url  text,
  _api_key   text,
  _label     text DEFAULT NULL,
  _tenant_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _caller uuid := auth.uid();
  _tenant uuid;
  _url    text := btrim(COALESCE(_base_url, ''));
  _key    text := btrim(COALESCE(_api_key, ''));
BEGIN
  IF _url = '' THEN
    RAISE EXCEPTION 'N8N_NO_URL: instance URL is required' USING ERRCODE = '22023';
  END IF;
  IF _url !~* '^https://' THEN
    RAISE EXCEPTION 'N8N_INSECURE_URL: instance URL must be https://' USING ERRCODE = '22023';
  END IF;
  IF _key = '' THEN
    RAISE EXCEPTION 'N8N_NO_KEY: API key is required' USING ERRCODE = '22023';
  END IF;

  IF _caller IS NOT NULL THEN
    _tenant := public.current_user_tenant_id();
    IF _tenant_id IS NOT NULL AND _tenant_id <> _tenant AND NOT public.is_platform_owner() THEN
      RAISE EXCEPTION 'N8N_FORBIDDEN: tenant mismatch' USING ERRCODE = '42501';
    END IF;
    IF public.is_platform_owner() AND _tenant_id IS NOT NULL THEN _tenant := _tenant_id; END IF;
    IF NOT (public.is_tenant_admin(_tenant) OR public.is_platform_owner()) THEN
      RAISE EXCEPTION 'N8N_FORBIDDEN: admin required' USING ERRCODE = '42501';
    END IF;
  ELSE
    _tenant := _tenant_id;
    IF _tenant IS NULL THEN RAISE EXCEPTION 'N8N_NO_TENANT' USING ERRCODE = '22023'; END IF;
  END IF;

  INSERT INTO public.tenant_n8n_connections
    (tenant_id, label, base_url_ct, api_key_ct, api_key_last4, status, last_error, created_by, updated_by, updated_at)
  VALUES
    (_tenant, NULLIF(btrim(COALESCE(_label, '')), ''), public.platform_encrypt(_url),
     public.platform_encrypt(_key), right(_key, 4), 'connected', NULL, _caller, _caller, now())
  ON CONFLICT (tenant_id) DO UPDATE SET
    label         = COALESCE(NULLIF(btrim(COALESCE(_label, '')), ''), public.tenant_n8n_connections.label),
    base_url_ct   = EXCLUDED.base_url_ct,
    api_key_ct    = EXCLUDED.api_key_ct,
    api_key_last4 = EXCLUDED.api_key_last4,
    status        = 'connected',
    last_error    = NULL,
    updated_by    = EXCLUDED.updated_by,
    updated_at    = now();

  RETURN jsonb_build_object('ok', true, 'tenant_id', _tenant, 'status', 'connected', 'api_key_last4', right(_key, 4));
END;
$$;

-- ── 3. get_tenant_n8n_connection — SAFE status for the operator UI (no key) ──────
CREATE OR REPLACE FUNCTION public.get_tenant_n8n_connection(
  _tenant_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _caller uuid := auth.uid();
  _tenant uuid;
  _row    public.tenant_n8n_connections;
BEGIN
  IF _caller IS NOT NULL THEN
    _tenant := public.current_user_tenant_id();
    IF _tenant_id IS NOT NULL AND _tenant_id <> _tenant AND NOT public.is_platform_owner() THEN
      RAISE EXCEPTION 'N8N_FORBIDDEN: tenant mismatch' USING ERRCODE = '42501';
    END IF;
    IF public.is_platform_owner() AND _tenant_id IS NOT NULL THEN _tenant := _tenant_id; END IF;
    IF NOT (public.is_tenant_member(_tenant) OR public.is_platform_owner()) THEN
      RAISE EXCEPTION 'N8N_FORBIDDEN: not a member' USING ERRCODE = '42501';
    END IF;
  ELSE
    _tenant := _tenant_id;
    IF _tenant IS NULL THEN RAISE EXCEPTION 'N8N_NO_TENANT' USING ERRCODE = '22023'; END IF;
  END IF;

  SELECT * INTO _row FROM public.tenant_n8n_connections WHERE tenant_id = _tenant;

  IF _row.tenant_id IS NULL THEN
    RETURN jsonb_build_object('configured', false, 'status', 'unconfigured');
  END IF;

  RETURN jsonb_build_object(
    'configured', _row.api_key_ct IS NOT NULL,
    'label', _row.label,
    'base_url', CASE WHEN _row.base_url_ct IS NOT NULL THEN public.platform_decrypt(_row.base_url_ct) ELSE NULL END,
    'api_key_last4', _row.api_key_last4,
    'status', _row.status,
    'last_error', _row.last_error,
    'last_sync_at', _row.last_sync_at,
    'workflow_count', _row.workflow_count
  );
END;
$$;

-- ── 4. get_tenant_n8n_secret — SERVICE-ROLE ONLY, returns decrypted creds ────────
-- The only path to the decrypted key. Never granted to authenticated; used by the
-- paige-n8n edge function (service role) to call the tenant's n8n REST API.
CREATE OR REPLACE FUNCTION public.get_tenant_n8n_secret(
  _tenant_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _row public.tenant_n8n_connections;
BEGIN
  IF _tenant_id IS NULL THEN RAISE EXCEPTION 'N8N_NO_TENANT' USING ERRCODE = '22023'; END IF;
  SELECT * INTO _row FROM public.tenant_n8n_connections WHERE tenant_id = _tenant_id;
  IF _row.tenant_id IS NULL OR _row.api_key_ct IS NULL OR _row.base_url_ct IS NULL THEN
    RETURN jsonb_build_object('configured', false);
  END IF;
  RETURN jsonb_build_object(
    'configured', true,
    'base_url', public.platform_decrypt(_row.base_url_ct),
    'api_key', public.platform_decrypt(_row.api_key_ct)
  );
END;
$$;

-- ── 5. update_tenant_n8n_sync — SERVICE-ROLE ONLY, edge fn writes test/sync state ─
CREATE OR REPLACE FUNCTION public.update_tenant_n8n_sync(
  _tenant_id      uuid,
  _status         text,
  _last_error     text DEFAULT NULL,
  _workflow_count int  DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF _status IS NOT NULL AND _status NOT IN ('unconfigured', 'connected', 'error') THEN
    RAISE EXCEPTION 'N8N_BAD_STATUS' USING ERRCODE = '22023';
  END IF;
  UPDATE public.tenant_n8n_connections SET
    status         = COALESCE(_status, status),
    last_error     = _last_error,
    workflow_count = COALESCE(_workflow_count, workflow_count),
    last_sync_at   = now(),
    updated_at     = now()
  WHERE tenant_id = _tenant_id;
END;
$$;

-- ── 6. clear_tenant_n8n_connection — operator disconnects ────────────────────────
CREATE OR REPLACE FUNCTION public.clear_tenant_n8n_connection(
  _tenant_id uuid DEFAULT NULL
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
      RAISE EXCEPTION 'N8N_FORBIDDEN: tenant mismatch' USING ERRCODE = '42501';
    END IF;
    IF public.is_platform_owner() AND _tenant_id IS NOT NULL THEN _tenant := _tenant_id; END IF;
    IF NOT (public.is_tenant_admin(_tenant) OR public.is_platform_owner()) THEN
      RAISE EXCEPTION 'N8N_FORBIDDEN: admin required' USING ERRCODE = '42501';
    END IF;
  ELSE
    _tenant := _tenant_id;
    IF _tenant IS NULL THEN RAISE EXCEPTION 'N8N_NO_TENANT' USING ERRCODE = '22023'; END IF;
  END IF;

  UPDATE public.tenant_n8n_connections SET
    base_url_ct = NULL, api_key_ct = NULL, api_key_last4 = NULL,
    status = 'unconfigured', last_error = NULL, workflow_count = 0,
    updated_by = _caller, updated_at = now()
  WHERE tenant_id = _tenant;
END;
$$;

-- ── 7. Grants ────────────────────────────────────────────────────────────────────
REVOKE ALL ON FUNCTION public.set_tenant_n8n_connection(text, text, text, uuid)  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_tenant_n8n_connection(uuid)                    FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_tenant_n8n_secret(uuid)                        FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.update_tenant_n8n_sync(uuid, text, text, int)      FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.clear_tenant_n8n_connection(uuid)                  FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.set_tenant_n8n_connection(text, text, text, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_tenant_n8n_connection(uuid)                   TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.clear_tenant_n8n_connection(uuid)                 TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_tenant_n8n_secret(uuid)                       TO service_role;
GRANT EXECUTE ON FUNCTION public.update_tenant_n8n_sync(uuid, text, text, int)     TO service_role;
