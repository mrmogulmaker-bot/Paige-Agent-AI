-- Publishing spine (#178) — Slice 1: the canonical WEBSITE custom-domain registry +
-- the ONE publish-target resolver every artifact type flows through (§18/§49).
--
-- WHY a new WEBSITE table separate from tenant_email_domains: email verification
-- (Resend DKIM/SPF/DMARC) proves EMAIL-SENDING authority; publishing a website at a
-- host needs control of the A/AAAA/CNAME + the HTTP responder. Those proofs are
-- disjoint — a domain can pass DKIM while its web record points elsewhere — so the
-- web registry carries its OWN platform-minted challenge token and its own lifecycle,
-- and NEVER reuses the email verification as the web-publishing gate (§9/§13).
--
-- WHY it fixes a real §9 collision the email registry has: tenant_email_domains is
-- UNIQUE(tenant_id, domain), so two tenants can both claim example.com. For WEB
-- publishing that would let either tenant's page serve at a contested host, so a
-- VERIFIED web host is made GLOBALLY unique to one tenant (partial unique index).

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. The WEBSITE custom-domain registry (mirrors tenant_email_domains shape/RLS).
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.tenant_web_domains (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  host text NOT NULL,                                    -- normalized: lower, no port, no trailing dot
  verification_token text NOT NULL,                      -- platform-minted per-tenant nonce (NOT Resend's)
  verification_method text NOT NULL DEFAULT 'dns_txt',   -- dns_txt | well_known
  status text NOT NULL DEFAULT 'pending',                -- pending | verifying | verified | failed
  is_default boolean NOT NULL DEFAULT false,
  verified_at timestamptz,
  vercel_domain_id text,                                 -- attachment handle for Vercel wiring (Slice 2)
  last_error text,
  created_by_user_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, host)                                -- mirrors the email registry
);

-- §9: a VERIFIED web host resolves to exactly ONE tenant. A second tenant verifying
-- an already-verified host fails (23505) — this is the collision fix the email
-- registry lacks. Pending/failed rows are NOT constrained (many tenants may attempt).
CREATE UNIQUE INDEX IF NOT EXISTS uq_tenant_web_domains_verified_host
  ON public.tenant_web_domains (host) WHERE status = 'verified';

-- At most one default web domain per tenant (mirrors tenant_email_domains_one_default).
CREATE UNIQUE INDEX IF NOT EXISTS uq_tenant_web_domains_one_default
  ON public.tenant_web_domains (tenant_id) WHERE is_default;

CREATE INDEX IF NOT EXISTS idx_tenant_web_domains_tenant
  ON public.tenant_web_domains (tenant_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.tenant_web_domains TO authenticated;
GRANT ALL ON public.tenant_web_domains TO service_role;

ALTER TABLE public.tenant_web_domains ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Platform owner full access"
  ON public.tenant_web_domains FOR ALL
  TO authenticated
  USING (is_platform_owner())
  WITH CHECK (is_platform_owner());

CREATE POLICY "Tenant admins manage own web domains"
  ON public.tenant_web_domains FOR ALL
  TO authenticated
  USING (tenant_id = current_user_tenant_id() AND has_role(auth.uid(), 'admin'))
  WITH CHECK (tenant_id = current_user_tenant_id() AND has_role(auth.uid(), 'admin'));

CREATE POLICY "Tenant members read own web domains"
  ON public.tenant_web_domains FOR SELECT
  TO authenticated
  USING (tenant_id = current_user_tenant_id());

CREATE TRIGGER trg_tenant_web_domains_updated_at
  BEFORE UPDATE ON public.tenant_web_domains
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

COMMENT ON TABLE public.tenant_web_domains IS
  'Per-tenant WEBSITE custom domains for publishing (distinct from tenant_email_domains). A verified host is globally unique to one tenant; verification uses a platform-minted DNS-TXT/well-known challenge, never email/Resend proof.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Host normalization helper — one definition, reused by resolver + claim RPCs.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.normalize_web_host(p_host text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT NULLIF(lower(trim(trailing '.' FROM split_part(coalesce(p_host, ''), ':', 1))), '');
$$;

COMMENT ON FUNCTION public.normalize_web_host(text) IS
  'Canonical host normalization for the publishing spine: lowercase, strip port, strip trailing dot. Returns NULL for empty input.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. THE canonical resolver — every artifact type builds its public URL here (§18).
--    Kept SEPARATE from resolve_tenant_domain_identity so that RETURNS-TABLE
--    contract is untouched (§37 blast-radius).
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.resolve_publish_target(
  p_artifact_type text,
  p_artifact_ref text,
  p_tenant_id uuid DEFAULT NULL
)
RETURNS TABLE (
  tenant_id uuid,
  tenant_slug text,
  host text,
  path text,
  canonical_url text,
  is_custom_domain boolean,
  is_external_asset boolean
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
  _slug text;
  _custom text;
  _default_host text;
  _host text;
  _path text;
  _type text := lower(coalesce(p_artifact_type, ''));
  _is_external boolean := false;
BEGIN
  -- Tenant is ALWAYS server-derived. A JWT caller can NEVER select another tenant
  -- via p_tenant_id — only a service-role caller (Paige headless) may pass it (§9).
  IF _caller IS NOT NULL THEN
    _tenant := public.current_user_tenant_id();
  ELSIF _jwt_role = 'service_role' THEN
    _tenant := p_tenant_id;
  ELSE
    RAISE EXCEPTION 'PUBLISH_TARGET_AUTH_REQUIRED' USING ERRCODE = '42501';
  END IF;

  IF _tenant IS NULL THEN
    RAISE EXCEPTION 'PUBLISH_TARGET_TENANT_REQUIRED' USING ERRCODE = '22023';
  END IF;

  IF _type NOT IN ('page', 'funnel', 'form', 'image') THEN
    RAISE EXCEPTION 'PUBLISH_TARGET_BAD_TYPE: %', p_artifact_type USING ERRCODE = '22023';
  END IF;

  SELECT t.slug INTO _slug FROM public.tenants t WHERE t.id = _tenant;
  IF _slug IS NULL THEN
    RAISE EXCEPTION 'PUBLISH_TARGET_TENANT_REQUIRED' USING ERRCODE = '22023';
  END IF;

  -- HOST SELECTION — the whole spine in three lines:
  --   OVERRIDE: a status='verified' AND is_default custom domain WINS.
  --   FALLBACK: otherwise the Paige-provided <slug>.paigeagent.ai subdomain.
  -- Unverified/pending rows are excluded by the status filter, so they never win.
  SELECT w.host INTO _custom
    FROM public.tenant_web_domains w
   WHERE w.tenant_id = _tenant
     AND w.status = 'verified'
     AND w.is_default = true
   LIMIT 1;

  _default_host := _slug || '.paigeagent.ai';
  _host := coalesce(_custom, _default_host);

  -- PATH — one grammar for every artifact type (uniform /p|/f/<slug>/<ref>, /form/<id>).
  -- Images are an already-hosted Supabase Storage URL: passthrough, host is irrelevant.
  IF _type = 'page' THEN
    _path := '/p/' || _slug || '/' || p_artifact_ref;
  ELSIF _type = 'funnel' THEN
    _path := '/f/' || _slug || '/' || p_artifact_ref;
  ELSIF _type = 'form' THEN
    _path := '/form/' || p_artifact_ref;
  ELSE -- image
    _is_external := true;
    _path := p_artifact_ref;
  END IF;

  RETURN QUERY
  SELECT
    _tenant,
    _slug,
    CASE WHEN _is_external THEN NULL ELSE _host END,
    _path,
    CASE WHEN _is_external THEN p_artifact_ref            -- storage URL is the artifact
         ELSE 'https://' || _host || _path END,
    (_custom IS NOT NULL) AS is_custom_domain,
    _is_external AS is_external_asset;
END;
$$;

REVOKE ALL ON FUNCTION public.resolve_publish_target(text, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resolve_publish_target(text, text, uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.resolve_publish_target(text, text, uuid) IS
  'The ONE canonical publish-URL resolver for every Studio artifact type (page/funnel/form/image). Verified default custom domain wins, else the Paige subdomain. Host is resolved at read time from current registry state, so verifying a custom domain later changes the URL with zero republish. Tenant is server-derived; a JWT caller can never target another tenant.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Website-ownership CLAIM + MARK-VERIFIED RPCs (SECURITY DEFINER, JWT-derived
--    tenant). The edge fn only does the outbound DNS/HTTP challenge lookup; the
--    WRITES go through these so they can never be driven by a forgeable body
--    tenant_id or an RLS-bypassing service client (§9 threat-model fix).
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.web_domain_claim(p_host text)
RETURNS public.tenant_web_domains
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _tenant uuid := public.current_user_tenant_id();
  _host text := public.normalize_web_host(p_host);
  _token text;
  _row public.tenant_web_domains;
BEGIN
  IF _tenant IS NULL THEN
    RAISE EXCEPTION 'WEB_DOMAIN_AUTH_REQUIRED' USING ERRCODE = '42501';
  END IF;
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'WEB_DOMAIN_ADMIN_REQUIRED' USING ERRCODE = '42501';
  END IF;
  IF _host IS NULL THEN
    RAISE EXCEPTION 'WEB_DOMAIN_HOST_REQUIRED' USING ERRCODE = '22023';
  END IF;
  -- A tenant cannot "claim" the platform wildcard as a custom domain — that host is
  -- the free default and would collide with the wildcard resolver.
  IF _host LIKE '%.paigeagent.ai' OR _host = 'paigeagent.ai' THEN
    RAISE EXCEPTION 'WEB_DOMAIN_RESERVED_HOST: %', _host USING ERRCODE = '22023';
  END IF;
  -- Basic hostname shape (labels of DNS-safe chars, a dot, a TLD).
  IF _host !~ '^([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$' THEN
    RAISE EXCEPTION 'WEB_DOMAIN_HOST_INVALID: %', _host USING ERRCODE = '22023';
  END IF;

  _token := replace(gen_random_uuid()::text, '-', '');

  INSERT INTO public.tenant_web_domains (tenant_id, host, verification_token, status, created_by_user_id)
  VALUES (_tenant, _host, _token, 'pending', auth.uid())
  ON CONFLICT (tenant_id, host) DO UPDATE
    SET verification_token = EXCLUDED.verification_token,
        status = 'pending',
        last_error = NULL,
        updated_at = now()
  RETURNING * INTO _row;

  RETURN _row;
END;
$$;

REVOKE ALL ON FUNCTION public.web_domain_claim(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.web_domain_claim(text) TO authenticated, service_role;

COMMENT ON FUNCTION public.web_domain_claim(text) IS
  'Claim a custom WEBSITE domain for the caller''s own tenant (JWT-derived, admin-only). Mints a per-tenant DNS-TXT challenge token; row starts status=pending. Rejects the platform wildcard. Re-claiming re-mints the token.';

CREATE OR REPLACE FUNCTION public.web_domain_mark_verified(p_host text, p_observed_token text)
RETURNS public.tenant_web_domains
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _tenant uuid := public.current_user_tenant_id();
  _host text := public.normalize_web_host(p_host);
  _row public.tenant_web_domains;
  _make_default boolean;
BEGIN
  IF _tenant IS NULL THEN
    RAISE EXCEPTION 'WEB_DOMAIN_AUTH_REQUIRED' USING ERRCODE = '42501';
  END IF;
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'WEB_DOMAIN_ADMIN_REQUIRED' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO _row
    FROM public.tenant_web_domains
   WHERE tenant_id = _tenant AND host = _host
   FOR UPDATE;

  IF _row.id IS NULL THEN
    RAISE EXCEPTION 'WEB_DOMAIN_NOT_FOUND: %', _host USING ERRCODE = 'P0002';
  END IF;

  -- The observed token (read from the tenant's DNS TXT / .well-known by the edge fn)
  -- must match the platform-minted one bound to THIS tenant's row.
  IF p_observed_token IS NULL OR p_observed_token <> _row.verification_token THEN
    UPDATE public.tenant_web_domains
       SET status = 'failed', last_error = 'challenge token mismatch', updated_at = now()
     WHERE id = _row.id
     RETURNING * INTO _row;
    RETURN _row;
  END IF;

  -- First verified web host for this tenant becomes the default automatically.
  SELECT NOT EXISTS (
    SELECT 1 FROM public.tenant_web_domains
     WHERE tenant_id = _tenant AND is_default = true AND id <> _row.id
  ) INTO _make_default;

  -- The uq_tenant_web_domains_verified_host partial unique index raises 23505 here if
  -- another tenant already verified this host — surfaced by the edge fn as "already
  -- claimed by another workspace" (§9 global-unique fix).
  UPDATE public.tenant_web_domains
     SET status = 'verified',
         verified_at = now(),
         is_default = CASE WHEN _make_default THEN true ELSE is_default END,
         last_error = NULL,
         updated_at = now()
   WHERE id = _row.id
   RETURNING * INTO _row;

  RETURN _row;
END;
$$;

REVOKE ALL ON FUNCTION public.web_domain_mark_verified(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.web_domain_mark_verified(text, text) TO authenticated, service_role;

COMMENT ON FUNCTION public.web_domain_mark_verified(text, text) IS
  'Mark a claimed custom web domain verified for the caller''s own tenant if the observed challenge token matches the minted one. First verified host becomes default. A host already verified by another tenant raises 23505 (globally-unique verified host).';

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Reserved-subdomain drift fix — resolve_tenant_web_host was MISSING
--    operator/dashboard/setup that ARE reserved in src/lib/hostRouting.ts, so a
--    tenant slugged 'operator' rejected client-side but RESOLVED server-side. Bring
--    the SQL array into parity (a unit test guards against future drift).
-- ─────────────────────────────────────────────────────────────────────────────
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
       'cdn','assets','static','docs','blog','mcp','studio','staging','preview',
       'operator','dashboard','setup'
     ])
     AND t.status IN ('trial'::public.tenant_status, 'active'::public.tenant_status)
   LIMIT 1;
$$;

COMMENT ON FUNCTION public.resolve_tenant_web_host(text) IS
  'Validates <tenant-slug>.paigeagent.ai and returns public tenant identity only. Hostname is never authorization. Reserved-label array is kept in parity with src/lib/hostRouting.ts RESERVED_TENANT_SUBDOMAINS (guarded by a unit test).';
