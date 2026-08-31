-- Refuse credentials embedded in a stored n8n instance URL.
--
-- WHY
--
-- `paige-n8n` sends the workspace's own n8n API key as `X-N8N-API-KEY` to whatever
-- address this function stored. The setter validated `^https://` and nothing else, so
-- `https://real.n8n.cloud@evil.example/` was storable — and it READS as real.n8n.cloud
-- in Settings while `URL.hostname` is `evil.example`. The edge guard has been repaired
-- to refuse that shape, so nothing is sent there any more; this stops it being STORED
-- in the first place, which is the difference between an admin seeing "that address was
-- refused" at the moment they paste it and a connection that saves cleanly and then
-- fails on every use with no obvious cause.
--
-- The same check the MCP setter already applies. Two layers, deliberately: the edge
-- guard is what protects the key, and this is what keeps an unusable row out of the
-- table.
--
-- Only the URL validation changes. Authority, encryption, and the upsert are as they
-- were, and the function is replaced rather than wrapped so there is one definition.
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
  -- Anything before an `@` in the AUTHORITY is userinfo. Checked on the authority only
  -- (the segment between `://` and the first `/`), so an `@` in a path or query — which
  -- is ordinary and harmless — is not mistaken for one.
  IF split_part(split_part(_url, '://', 2), '/', 1) ~ '@' THEN
    RAISE EXCEPTION 'N8N_URL_CREDENTIALS: remove the credentials from the URL' USING ERRCODE = '22023';
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
