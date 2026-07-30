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

-- Every eligible customer workspace receives one Paige-managed email connector.
-- Agency roots, owned subaccounts, and standalone practices remain independent
-- tenant identities. System workspaces are classified explicitly in features.
UPDATE public.tenants
   SET features = coalesce(features, '{}'::jsonb) || '{"system_workspace": true}'::jsonb
 WHERE slug = 'paige-platform-defaults'
   AND name = 'Paige Platform Defaults';

-- The existing connector trigger normally derives tenant_id from the caller's
-- active workspace. Preserve an explicitly requested managed connector tenant
-- only for service-role/platform work or a caller-owned child workspace.
CREATE OR REPLACE FUNCTION public.set_channel_connector_tenant()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _caller_tenant uuid := public.current_user_tenant_id();
  _is_managed boolean :=
    coalesce(NEW.config ->> 'managed_default', 'false') = 'true'
    AND NEW.config ->> 'source' = 'tenant_domain_spine';
  _may_target boolean := false;
BEGIN
  IF _is_managed AND NEW.tenant_id IS NOT NULL THEN
    _may_target :=
      _caller_tenant IS NULL
      OR NEW.tenant_id = _caller_tenant
      OR coalesce(public.is_platform_owner(), false)
      OR EXISTS (
        SELECT 1
          FROM public.tenants child
         WHERE child.id = NEW.tenant_id
           AND child.parent_tenant_id = _caller_tenant
      );

    IF NOT _may_target THEN
      RAISE EXCEPTION 'CHANNEL_CONNECTOR_TENANT_FORBIDDEN' USING ERRCODE = '42501';
    END IF;
  ELSE
    NEW.tenant_id := coalesce(_caller_tenant, NEW.tenant_id);
  END IF;

  NEW.created_by := coalesce(NEW.created_by, auth.uid());
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.set_channel_connector_tenant() FROM PUBLIC;

-- Fail clearly if an earlier partial rollout ever produced duplicates.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
      FROM public.channel_connectors
     WHERE channel_type = 'email'
       AND provider = 'resend'
       AND config ->> 'managed_default' = 'true'
     GROUP BY tenant_id
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'DUPLICATE_PAIGE_MANAGED_EMAIL_CONNECTORS';
  END IF;
END;
$$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_channel_connectors_paige_managed_email
  ON public.channel_connectors (tenant_id)
  WHERE channel_type = 'email'
    AND provider = 'resend'
    AND config ->> 'managed_default' = 'true';

-- Internal provisioning core. The transaction-scoped advisory lock plus the
-- partial unique index make repeated and concurrent lifecycle calls converge.
CREATE OR REPLACE FUNCTION public.provision_paige_managed_email_connector(p_tenant_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _tenant public.tenants%ROWTYPE;
  _shared_domain text;
  _local_part text;
  _address text;
  _reply_to text;
  _connector_id uuid;
BEGIN
  IF p_tenant_id IS NULL THEN
    RAISE EXCEPTION 'TENANT_CONNECTOR_TENANT_REQUIRED' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('paige-managed-email:' || p_tenant_id::text, 0));

  SELECT * INTO _tenant
    FROM public.tenants
   WHERE id = p_tenant_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'TENANT_CONNECTOR_TENANT_NOT_FOUND' USING ERRCODE = '22023';
  END IF;

  -- account_type + parent_tenant_id classify the topology, not inheritance:
  -- agency roots, child standalones, and solo standalones each own their sender.
  IF _tenant.status NOT IN ('trial'::public.tenant_status, 'active'::public.tenant_status)
     OR _tenant.account_type NOT IN ('agency', 'standalone')
     OR coalesce((_tenant.features ->> 'system_workspace')::boolean, false) THEN
    UPDATE public.channel_connectors
       SET active = false, status = 'disabled'
     WHERE tenant_id = p_tenant_id
       AND channel_type = 'email'
       AND provider = 'resend'
       AND config ->> 'managed_default' = 'true';
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

  IF EXISTS (
    SELECT 1
      FROM public.channel_connectors c
     WHERE c.channel_type = 'email'
       AND lower(c.inbound_address) = lower(_address)
       AND NOT (
         c.tenant_id = p_tenant_id
         AND c.provider = 'resend'
         AND c.config ->> 'managed_default' = 'true'
       )
  ) THEN
    RAISE EXCEPTION 'PAIGE_MANAGED_EMAIL_ADDRESS_CONFLICT: %', _address
      USING ERRCODE = '23505';
  END IF;

  INSERT INTO public.channel_connectors (
    tenant_id, channel_type, provider, inbound_address, inbound_domain,
    display_name, from_name, from_address, reply_to, status, active, config
  ) VALUES (
    p_tenant_id, 'email', 'resend', _address, NULL,
    'Paige email', coalesce(nullif(_tenant.name, ''), 'Paige'), _address, _reply_to,
    'active', true,
    jsonb_build_object(
      'managed_default', true,
      'source', 'tenant_domain_spine',
      'web_hostname', _tenant.slug || '.paigeagent.ai'
    )
  )
  ON CONFLICT (tenant_id)
    WHERE channel_type = 'email'
      AND provider = 'resend'
      AND config ->> 'managed_default' = 'true'
  DO UPDATE SET
    inbound_address = EXCLUDED.inbound_address,
    inbound_domain = NULL,
    display_name = EXCLUDED.display_name,
    from_name = EXCLUDED.from_name,
    from_address = EXCLUDED.from_address,
    reply_to = EXCLUDED.reply_to,
    status = 'active',
    active = true,
    config = coalesce(public.channel_connectors.config, '{}'::jsonb)
      || EXCLUDED.config
  RETURNING id INTO _connector_id;

  RETURN _connector_id;
END;
$$;

REVOKE ALL ON FUNCTION public.provision_paige_managed_email_connector(uuid) FROM PUBLIC;

-- Service-role maintenance seam. Tenant lifecycle triggers call the private core
-- directly; authenticated tenant members cannot reactivate channel configuration.
CREATE OR REPLACE FUNCTION public.ensure_paige_managed_email_connector(p_tenant_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF coalesce(current_setting('request.jwt.claim.role', true), '') <> 'service_role' THEN
    RAISE EXCEPTION 'TENANT_CONNECTOR_SERVICE_ROLE_REQUIRED' USING ERRCODE = '42501';
  END IF;
  RETURN public.provision_paige_managed_email_connector(p_tenant_id);
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_paige_managed_email_connector(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ensure_paige_managed_email_connector(uuid) TO service_role;

COMMENT ON FUNCTION public.ensure_paige_managed_email_connector(uuid) IS
  'Service-role-only idempotent maintenance seam for one Paige-managed email connector.';

CREATE OR REPLACE FUNCTION public.sync_paige_managed_email_connector_on_tenant()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.provision_paige_managed_email_connector(NEW.id);
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.sync_paige_managed_email_connector_on_tenant() FROM PUBLIC;

DROP TRIGGER IF EXISTS trg_tenants_paige_managed_email_connector ON public.tenants;
CREATE TRIGGER trg_tenants_paige_managed_email_connector
AFTER INSERT OR UPDATE OF slug, name, status, account_type, parent_tenant_id, features
ON public.tenants
FOR EACH ROW
EXECUTE FUNCTION public.sync_paige_managed_email_connector_on_tenant();

-- Account-aware backfill: customer agency roots, owned subaccounts, and solo
-- workspaces are independent. Explicit system workspaces and inactive tenants
-- are processed through the same core so stale managed connectors are disabled.
DO $$
DECLARE
  _tenant_id uuid;
BEGIN
  FOR _tenant_id IN SELECT id FROM public.tenants ORDER BY created_at, id
  LOOP
    PERFORM public.provision_paige_managed_email_connector(_tenant_id);
  END LOOP;
END;
$$;
