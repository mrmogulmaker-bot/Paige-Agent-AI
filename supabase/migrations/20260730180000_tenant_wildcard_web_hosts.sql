-- Tenant wildcard hosts: <tenant-slug>.paigeagent.ai
-- The hostname is public routing context only. This resolver returns the
-- minimum public identity needed to validate the host and never grants tenant
-- membership, data access, or an authenticated session.

CREATE OR REPLACE FUNCTION public.resolve_tenant_web_host(p_hostname text)
RETURNS TABLE (
  tenant_id uuid,
  tenant_slug text,
  tenant_name text,
  public_brand jsonb
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH normalized AS (
    SELECT lower(trim(trailing '.' FROM split_part(coalesce(p_hostname, ''), ':', 1))) AS hostname
  ),
  candidate AS (
    SELECT split_part(n.hostname, '.', 1) AS slug,
           array_length(string_to_array(n.hostname, '.'), 1) AS labels,
           n.hostname
      FROM normalized n
  )
  SELECT t.id,
         t.slug,
         t.name,
         jsonb_strip_nulls(jsonb_build_object(
           'name', t.brand -> 'name',
           'logo_url', t.brand -> 'logo_url',
           'primary_color', t.brand -> 'primary_color',
           'accent_color', t.brand -> 'accent_color'
         ))
    FROM candidate c
    JOIN public.tenants t ON lower(t.slug) = c.slug
   WHERE c.labels = 3
     AND c.hostname LIKE '%.paigeagent.ai'
     AND c.slug ~ '^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$'
     AND c.slug <> ALL (ARRAY[
       'www','app','api','admin','auth','mail','notify','status','support',
       'cdn','assets','static','docs','blog','mcp','studio','staging','preview'
     ])
     AND t.status IN ('trial'::public.tenant_status, 'active'::public.tenant_status)
   LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.resolve_tenant_web_host(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resolve_tenant_web_host(text) TO anon, authenticated, service_role;

COMMENT ON FUNCTION public.resolve_tenant_web_host(text) IS
  'Validates <tenant-slug>.paigeagent.ai and returns public tenant identity only. Hostname is never authorization.';


-- One canonical outward-facing domain identity contract. Every consumer
-- (Paige chat, Paige MCP, onboarding, settings) reads this seam instead of
-- reconstructing domains independently.
CREATE OR REPLACE FUNCTION public.resolve_tenant_domain_identity(p_tenant_id uuid DEFAULT NULL)
RETURNS TABLE (
  tenant_id uuid,
  tenant_slug text,
  tenant_name text,
  default_web_hostname text,
  default_web_url text,
  default_portal_path text,
  default_email_domain text,
  default_email_sender text,
  default_email_reply_to text,
  default_email_kind text,
  default_email_source text,
  default_email_status text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _caller uuid := auth.uid();
  _tenant uuid;
  _jwt_role text := coalesce(current_setting('request.jwt.claim.role', true), '');
BEGIN
  IF _caller IS NOT NULL THEN
    _tenant := public.current_user_tenant_id();
  ELSIF _jwt_role = 'service_role' THEN
    _tenant := p_tenant_id;
  ELSE
    RAISE EXCEPTION 'DOMAIN_IDENTITY_AUTH_REQUIRED' USING ERRCODE = '42501';
  END IF;

  IF _tenant IS NULL THEN
    RAISE EXCEPTION 'DOMAIN_IDENTITY_TENANT_REQUIRED' USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  SELECT t.id,
         t.slug,
         t.name,
         t.slug || '.paigeagent.ai',
         'https://' || t.slug || '.paigeagent.ai',
         '/portal/' || t.slug,
         sender.identity ->> 'domain',
         sender.identity ->> 'from_address',
         sender.identity ->> 'reply_to',
         sender.identity ->> 'kind',
         sender.identity ->> 'source',
         CASE
           WHEN sender.identity ->> 'source' = 'custom_domain' THEN 'verified'
           ELSE 'ready'
         END
    FROM public.tenants t
    CROSS JOIN LATERAL (
      SELECT public.resolve_tenant_sender(t.id) AS identity
    ) sender
   WHERE t.id = _tenant
   LIMIT 1;
END;
$$;

REVOKE ALL ON FUNCTION public.resolve_tenant_domain_identity(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resolve_tenant_domain_identity(uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.resolve_tenant_domain_identity(uuid) IS
  'Canonical tenant web and email identity for Paige, Conversations, onboarding, and settings. Includes the ready Paige-managed email fallback; authenticated callers are pinned to their own tenant.';

-- Every active/trial tenant receives a Paige-managed email connector immediately.
-- This materializes the existing resolve_tenant_sender() fallback into the canonical
-- Conversations channel rail; custom domains, Gmail, and SMTP remain optional upgrades.
CREATE OR REPLACE FUNCTION public.ensure_paige_managed_email_connector(p_tenant_id uuid DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _tenant_id uuid;
  _tenant public.tenants%ROWTYPE;
  _shared_domain text;
  _local_part text;
  _address text;
  _reply_to text;
  _connector_id uuid;
  _caller_tenant uuid;
BEGIN
  _caller_tenant := public.current_user_tenant_id();
  _tenant_id := coalesce(p_tenant_id, _caller_tenant);

  -- Direct authenticated calls are pinned to the caller. Calls made by the
  -- tenants-table trigger run with pg_trigger_depth() > 0 and use NEW.id.
  IF auth.uid() IS NOT NULL
     AND pg_trigger_depth() = 0
     AND _tenant_id IS DISTINCT FROM _caller_tenant THEN
    RAISE EXCEPTION 'TENANT_CONNECTOR_FORBIDDEN' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO _tenant FROM public.tenants WHERE id = _tenant_id;
  IF NOT FOUND OR _tenant.status NOT IN ('trial'::public.tenant_status, 'active'::public.tenant_status) THEN
    RETURN NULL;
  END IF;

  SELECT coalesce(nullif(shared_domain, ''), 'mail.paigeagent.ai'),
         coalesce(nullif(default_reply_to, ''), 'support@paigeagent.ai')
    INTO _shared_domain, _reply_to
    FROM public.platform_email_settings
   LIMIT 1;

  _shared_domain := coalesce(_shared_domain, 'mail.paigeagent.ai');
  _reply_to := coalesce(_reply_to, 'support@paigeagent.ai');
  _local_part := public.sanitize_email_local_part(coalesce(nullif(_tenant.slug, ''), _tenant.name, 'client'));
  _address := _local_part || '@' || _shared_domain;

  SELECT id INTO _connector_id
    FROM public.channel_connectors
   WHERE tenant_id = _tenant_id
     AND channel_type = 'email'
     AND provider = 'resend'
     AND config ->> 'managed_default' = 'true'
   ORDER BY created_at
   LIMIT 1;

  IF _connector_id IS NULL THEN
    INSERT INTO public.channel_connectors (
      tenant_id, channel_type, provider, inbound_address, inbound_domain,
      display_name, from_name, from_address, reply_to, status, active, config
    ) VALUES (
      _tenant_id, 'email', 'resend', _address, NULL,
      'Paige email', coalesce(nullif(_tenant.name, ''), 'Paige'), _address, _reply_to,
      'active', true,
      jsonb_build_object(
        'managed_default', true,
        'source', 'tenant_domain_spine',
        'web_hostname', _tenant.slug || '.paigeagent.ai'
      )
    )
    RETURNING id INTO _connector_id;

    -- set_channel_connector_tenant() derives from the current workspace on direct
    -- inserts. A tenant lifecycle trigger may be creating a child workspace, so
    -- correct the row to NEW.id before this transaction becomes visible.
    UPDATE public.channel_connectors
       SET tenant_id = _tenant_id
     WHERE id = _connector_id;
  ELSE
    UPDATE public.channel_connectors
       SET inbound_address = _address,
           inbound_domain = NULL,
           display_name = 'Paige email',
           from_name = coalesce(nullif(_tenant.name, ''), 'Paige'),
           from_address = _address,
           reply_to = _reply_to,
           status = 'active',
           active = true,
           config = coalesce(config, '{}'::jsonb) || jsonb_build_object(
             'managed_default', true,
             'source', 'tenant_domain_spine',
             'web_hostname', _tenant.slug || '.paigeagent.ai'
           )
     WHERE id = _connector_id
       AND tenant_id = _tenant_id;
  END IF;

  RETURN _connector_id;
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_paige_managed_email_connector(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ensure_paige_managed_email_connector(uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.ensure_paige_managed_email_connector(uuid) IS
  'Idempotently provisions the caller tenant Paige-managed email connector. Authenticated callers are tenant-pinned; tenant lifecycle triggers may pass NEW.id.';

CREATE OR REPLACE FUNCTION public.sync_paige_managed_email_connector_on_tenant()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status IN ('trial'::public.tenant_status, 'active'::public.tenant_status) THEN
    PERFORM public.ensure_paige_managed_email_connector(NEW.id);
  ELSE
    UPDATE public.channel_connectors
       SET active = false, status = 'disabled'
     WHERE tenant_id = NEW.id
       AND channel_type = 'email'
       AND provider = 'resend'
       AND config ->> 'managed_default' = 'true';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_tenants_paige_managed_email_connector ON public.tenants;
CREATE TRIGGER trg_tenants_paige_managed_email_connector
AFTER INSERT OR UPDATE OF slug, name, status ON public.tenants
FOR EACH ROW
EXECUTE FUNCTION public.sync_paige_managed_email_connector_on_tenant();

-- Existing tenants receive the same included connector in this migration.
DO $$
DECLARE
  _tenant_id uuid;
BEGIN
  FOR _tenant_id IN
    SELECT id
      FROM public.tenants
     WHERE status IN ('trial'::public.tenant_status, 'active'::public.tenant_status)
  LOOP
    PERFORM public.ensure_paige_managed_email_connector(_tenant_id);
  END LOOP;
END;
$$;

