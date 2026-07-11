-- ─────────────────────────────────────────────────────────────────────────────
-- Per-tenant live sending identity (#123)
--
-- Problem this closes: today no tenant has a distinct sending identity. Three
-- overlapping resolvers (get_tenant_sender / tenant_sender_identity /
-- require_tenant_brand) disagree — one falls back to no-reply@paigeagent.ai, one
-- RAISES if the tenant has no *verified* custom domain (so those senders are broken
-- for every tenant — zero verified domains exist), and one falls back to a stale
-- owner-brand address (noreply@mail.mogulmakeracademy.com — a §9 leak of one
-- vertical's brand into the platform default).
--
-- The fix: every tenant gets a materialized sending identity on the platform's
-- already-verified shared domain the moment it is created — {local}@paigeagent.ai
-- with the tenant's brand as the From-name — so it can send *immediately*, with a
-- distinct identity, no DNS setup. Bring-your-own-domain (tenant_email_domains) stays
-- the upgrade path; when a custom domain verifies it simply wins the resolver.
--
-- Design (per doctrine):
--   §9  platform vs tenant: the shared domain is a platform (operator) config value,
--       coaching-generic; each identity is tenant-authored/tenant-scoped.
--   §10 governable: the shared domain lives in a config table (not hardcoded), and
--       Paige can read/set a tenant's identity through RPCs — no human-in-the-UI needed.
--   Security: writes go only through SECURITY DEFINER RPCs using the dual-caller guard
--       (JWT callers pinned to their own tenant; the service/Paige path passes p_tenant_id).
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Platform shared-sending config (operator-owned, config-as-data) ──────────
CREATE TABLE IF NOT EXISTS public.platform_email_settings (
  id                boolean PRIMARY KEY DEFAULT true,     -- singleton: exactly one row
  shared_domain     text NOT NULL DEFAULT 'paigeagent.ai',
  default_from_name text NOT NULL DEFAULT 'Paige Agent AI',
  default_reply_to  text NOT NULL DEFAULT 'support@paigeagent.ai',
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT platform_email_settings_singleton CHECK (id = true)
);

INSERT INTO public.platform_email_settings (id) VALUES (true)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.platform_email_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Platform owner manages email settings" ON public.platform_email_settings;
CREATE POLICY "Platform owner manages email settings"
  ON public.platform_email_settings FOR ALL
  USING (public.is_platform_owner()) WITH CHECK (public.is_platform_owner());

-- Every authenticated member may READ the shared domain (senders/resolvers need it).
DROP POLICY IF EXISTS "Authenticated read email settings" ON public.platform_email_settings;
CREATE POLICY "Authenticated read email settings"
  ON public.platform_email_settings FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- ── 2. The registry — one live sending identity per tenant ──────────────────────
CREATE TABLE IF NOT EXISTS public.tenant_email_identities (
  tenant_id        uuid PRIMARY KEY REFERENCES public.tenants(id) ON DELETE CASCADE,
  from_name        text NOT NULL,
  local_part       text NOT NULL,                          -- left of @ on the shared domain
  reply_to         text,                                   -- tenant support inbox, if any
  kind             text NOT NULL DEFAULT 'shared'
                     CHECK (kind IN ('shared', 'custom_domain')),
  custom_domain_id uuid REFERENCES public.tenant_email_domains(id) ON DELETE SET NULL,
  status           text NOT NULL DEFAULT 'active'
                     CHECK (status IN ('active', 'disabled')),
  provisioned_at   timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

-- No two tenants may claim the same local-part on the shared domain.
CREATE UNIQUE INDEX IF NOT EXISTS tenant_email_identities_local_part_uniq
  ON public.tenant_email_identities (lower(local_part))
  WHERE kind = 'shared';

ALTER TABLE public.tenant_email_identities ENABLE ROW LEVEL SECURITY;

-- Mirror tenant_email_domains RLS: platform owner ALL, tenant members read own.
-- Writes flow only through the SECURITY DEFINER RPCs below, so no tenant INSERT/UPDATE policy.
DROP POLICY IF EXISTS "Platform owner full access identities" ON public.tenant_email_identities;
CREATE POLICY "Platform owner full access identities"
  ON public.tenant_email_identities FOR ALL
  USING (public.is_platform_owner()) WITH CHECK (public.is_platform_owner());

DROP POLICY IF EXISTS "Tenant members read own identity" ON public.tenant_email_identities;
CREATE POLICY "Tenant members read own identity"
  ON public.tenant_email_identities FOR SELECT
  USING (tenant_id = public.current_user_tenant_id());

CREATE OR REPLACE FUNCTION public.tenant_email_identities_touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS trg_tenant_email_identities_updated_at ON public.tenant_email_identities;
CREATE TRIGGER trg_tenant_email_identities_updated_at
  BEFORE UPDATE ON public.tenant_email_identities
  FOR EACH ROW EXECUTE FUNCTION public.tenant_email_identities_touch_updated_at();

-- ── 3. Local-part sanitizer + reserved-word guard ──────────────────────────────
-- Reserved locals are the platform's own addresses on the shared domain; a tenant
-- whose slug collides with one gets a "-team" suffix so it can never impersonate them.
CREATE OR REPLACE FUNCTION public.sanitize_email_local_part(_raw text)
RETURNS text
LANGUAGE plpgsql IMMUTABLE
SET search_path TO 'public'
AS $$
DECLARE
  v text;
  reserved text[] := ARRAY[
    'no-reply','noreply','hello','team','support','billing','notifications','notify',
    'calendar','admin','administrator','mcc','onboarding','security','alerts','info',
    'postmaster','abuse','webmaster','contact','mail','sales','help','root','system'
  ];
BEGIN
  v := lower(trim(COALESCE(_raw, '')));
  v := regexp_replace(v, '[^a-z0-9._-]+', '-', 'g'); -- keep RFC-safe local chars
  v := regexp_replace(v, '[-._]{2,}', '-', 'g');     -- collapse runs of separators
  v := regexp_replace(v, '^[-._]+|[-._]+$', '', 'g');-- trim leading/trailing separators
  v := left(v, 40);
  v := regexp_replace(v, '[-._]+$', '', 'g');         -- re-trim after truncation
  IF v = '' THEN v := 'client'; END IF;
  IF v = ANY (reserved) THEN v := v || '-team'; END IF;
  RETURN v;
END; $$;

-- ── 4. Provision one identity for a tenant (idempotent) ─────────────────────────
CREATE OR REPLACE FUNCTION public.provision_tenant_email_identity(_tenant_id uuid)
RETURNS public.tenant_email_identities
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_tenant   public.tenants%ROWTYPE;
  v_existing public.tenant_email_identities%ROWTYPE;
  v_from     text;
  v_base     text;
  v_local    text;
  v_reply    text;
  v_n        int := 1;
  v_attempt  int;
  v_row      public.tenant_email_identities%ROWTYPE;
BEGIN
  IF _tenant_id IS NULL THEN
    RAISE EXCEPTION 'PROVISION_IDENTITY_NO_TENANT' USING ERRCODE = '22023';
  END IF;

  -- Idempotent: never clobber an already-provisioned (possibly tenant-customized) row.
  SELECT * INTO v_existing FROM public.tenant_email_identities WHERE tenant_id = _tenant_id;
  IF FOUND THEN RETURN v_existing; END IF;

  SELECT * INTO v_tenant FROM public.tenants WHERE id = _tenant_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PROVISION_IDENTITY_TENANT_NOT_FOUND: %', _tenant_id USING ERRCODE = 'P0001';
  END IF;

  v_from := NULLIF(TRIM(COALESCE(
    v_tenant.brand ->> 'from_name',
    v_tenant.brand ->> 'sender_name',
    v_tenant.brand ->> 'name',
    v_tenant.name
  )), '');
  IF v_from IS NULL THEN v_from := 'Paige Agent AI'; END IF;
  v_from := NULLIF(TRIM(regexp_replace(v_from, '[[:cntrl:]]', ' ', 'g')), ''); -- no CR/LF header injection
  IF v_from IS NULL THEN v_from := 'Paige Agent AI'; END IF;

  v_base  := public.sanitize_email_local_part(COALESCE(NULLIF(v_tenant.slug, ''), v_tenant.name, 'client'));
  v_local := v_base;
  -- Resolve collisions against other tenants' shared locals (common/sequential case).
  WHILE EXISTS (
    SELECT 1 FROM public.tenant_email_identities
    WHERE kind = 'shared' AND lower(local_part) = lower(v_local) AND tenant_id <> _tenant_id
  ) LOOP
    v_n := v_n + 1;
    v_local := left(v_base, 36) || '-' || v_n::text;
  END LOOP;

  v_reply := NULLIF(TRIM(COALESCE(v_tenant.brand ->> 'support_email', '')), '');
  IF v_reply IS NOT NULL AND v_reply !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN
    v_reply := NULL; -- never seed a malformed Reply-To
  END IF;

  -- Race-safe insert: the WHILE-loop only sees committed rows, so a concurrent
  -- same-local provision could still collide on the partial unique index (which
  -- ON CONFLICT (tenant_id) does NOT cover). Catch that and retry with a bumped
  -- suffix so a lost race never aborts the enclosing tenant INSERT.
  FOR v_attempt IN 1..64 LOOP
    BEGIN
      INSERT INTO public.tenant_email_identities (tenant_id, from_name, local_part, reply_to, kind, status)
      VALUES (_tenant_id, v_from, v_local, v_reply, 'shared', 'active')
      ON CONFLICT (tenant_id) DO NOTHING
      RETURNING * INTO v_row;

      IF v_row.tenant_id IS NULL THEN
        -- tenant_id already had a row (idempotent) — return the existing one
        SELECT * INTO v_row FROM public.tenant_email_identities WHERE tenant_id = _tenant_id;
      END IF;
      RETURN v_row;
    EXCEPTION WHEN unique_violation THEN
      v_n := v_n + 1;
      v_local := left(v_base, 36) || '-' || v_n::text;
    END;
  END LOOP;
  RAISE EXCEPTION 'PROVISION_IDENTITY_LOCAL_PART_EXHAUSTED for tenant %', _tenant_id USING ERRCODE = 'P0001';
END; $$;

-- ── 5. Provision automatically on tenant creation (covers every insert path) ────
CREATE OR REPLACE FUNCTION public.trg_provision_tenant_email_identity()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  PERFORM public.provision_tenant_email_identity(NEW.id);
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_tenants_provision_email_identity ON public.tenants;
CREATE TRIGGER trg_tenants_provision_email_identity
  AFTER INSERT ON public.tenants
  FOR EACH ROW EXECUTE FUNCTION public.trg_provision_tenant_email_identity();

-- ── 6. Backfill every existing tenant ───────────────────────────────────────────
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT id FROM public.tenants LOOP
    PERFORM public.provision_tenant_email_identity(r.id);
  END LOOP;
END $$;

-- ── 7. The single canonical resolver ────────────────────────────────────────────
-- Precedence: verified custom domain → the tenant's shared identity → platform default.
-- Never throws for a "missing domain"; never emits an owner-vertical address.
CREATE OR REPLACE FUNCTION public.resolve_tenant_sender(_tenant_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_tenant   public.tenants%ROWTYPE;
  v_cfg      public.platform_email_settings%ROWTYPE;
  v_ident    public.tenant_email_identities%ROWTYPE;
  v_domain   public.tenant_email_domains%ROWTYPE;
  v_shared   text;
  v_from_name text;
  v_from_addr text;
  v_reply    text;
  v_brand_reply text;
  v_source   text;
  v_kind     text;
BEGIN
  SELECT * INTO v_cfg FROM public.platform_email_settings LIMIT 1;
  v_shared := COALESCE(NULLIF(v_cfg.shared_domain, ''), 'paigeagent.ai');

  IF _tenant_id IS NULL THEN
    RETURN jsonb_build_object(
      'tenant_id', NULL,
      'from_name', COALESCE(NULLIF(v_cfg.default_from_name, ''), 'Paige Agent AI'),
      'from_address', 'team@' || v_shared,
      'reply_to', COALESCE(NULLIF(v_cfg.default_reply_to, ''), 'support@' || v_shared),
      'domain', v_shared, 'kind', 'platform', 'source', 'platform_default'
    );
  END IF;

  SELECT * INTO v_tenant FROM public.tenants WHERE id = _tenant_id;
  SELECT * INTO v_ident FROM public.tenant_email_identities
    WHERE tenant_id = _tenant_id AND status = 'active';

  -- 1) A verified custom domain always wins.
  SELECT * INTO v_domain FROM public.tenant_email_domains
    WHERE tenant_id = _tenant_id AND status = 'verified'
    ORDER BY is_default DESC, verified_at DESC NULLS LAST
    LIMIT 1;

  IF FOUND THEN
    v_from_addr := COALESCE(NULLIF(v_domain.from_email_local, ''), 'no-reply') || '@' || v_domain.domain;
    v_from_name := COALESCE(NULLIF(v_domain.from_name, ''), NULLIF(v_ident.from_name, ''), v_tenant.name, 'Paige Agent AI');
    v_source := 'custom_domain';
    v_kind := 'custom_domain';
  ELSIF v_ident.tenant_id IS NOT NULL THEN
    -- 2) The tenant's shared identity (present for every tenant).
    v_from_addr := v_ident.local_part || '@' || v_shared;
    v_from_name := COALESCE(NULLIF(v_ident.from_name, ''), v_tenant.name, 'Paige Agent AI');
    v_source := 'shared';
    v_kind := 'shared';
  ELSE
    -- 3) Safety net (identity somehow absent). Platform-generic — never a vertical brand.
    v_from_addr := 'team@' || v_shared;
    v_from_name := COALESCE(v_tenant.name, NULLIF(v_cfg.default_from_name, ''), 'Paige Agent AI');
    v_source := 'platform_default';
    v_kind := 'platform';
  END IF;

  -- v_ident.reply_to is already validated at write time; the brand fallback is not,
  -- so validate it here before it can land in a live Reply-To header.
  v_brand_reply := NULLIF(v_tenant.brand ->> 'support_email', '');
  IF v_brand_reply IS NOT NULL AND v_brand_reply !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN
    v_brand_reply := NULL;
  END IF;
  v_reply := COALESCE(
    NULLIF(v_ident.reply_to, ''),
    v_brand_reply,
    NULLIF(v_cfg.default_reply_to, ''),
    'support@' || v_shared
  );

  RETURN jsonb_build_object(
    'tenant_id',    _tenant_id,
    'tenant_slug',  v_tenant.slug,
    'tenant_name',  v_tenant.name,
    'from_name',    v_from_name,
    'from_address', v_from_addr,
    'reply_to',     v_reply,
    'domain',       split_part(v_from_addr, '@', 2),
    'kind',         v_kind,
    'source',       v_source
  );
END; $$;

-- ── 8. Re-point the three legacy resolvers at the canonical one (shapes preserved) ─
-- The ~12 edge-function senders call these RPCs; keeping their exact return shapes
-- means the whole fleet gains per-tenant identities with zero redeploys.

CREATE OR REPLACE FUNCTION public.tenant_sender_identity(_tenant_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE r jsonb; t public.tenants%ROWTYPE;
BEGIN
  r := public.resolve_tenant_sender(_tenant_id);
  SELECT * INTO t FROM public.tenants WHERE id = _tenant_id;
  RETURN jsonb_build_object(
    'tenant_id',     _tenant_id,
    'tenant_name',   t.name,
    'tenant_slug',   t.slug,
    'from_name',     r ->> 'from_name',
    'support_email', t.brand ->> 'support_email',
    'from_address',  r ->> 'from_address',
    'reply_to',      r ->> 'reply_to'
  );
END; $$;

CREATE OR REPLACE FUNCTION public.get_tenant_sender(_tenant_id uuid)
RETURNS TABLE(from_name text, from_email text, source text)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT r ->> 'from_name', r ->> 'from_address', r ->> 'source'
  FROM public.resolve_tenant_sender(_tenant_id) AS r;
$$;

-- require_tenant_brand kept fail-loud ONLY for a genuinely missing tenant; every
-- existing tenant now resolves to at least its shared identity, so it no longer
-- throws TENANT_SENDER_IDENTITY_NOT_CONFIGURED for the common (no custom domain) case.
CREATE OR REPLACE FUNCTION public.require_tenant_brand(p_tenant_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE r jsonb; t public.tenants%ROWTYPE; v_brand text;
BEGIN
  IF p_tenant_id IS NULL THEN
    RAISE EXCEPTION 'TENANT_SENDER_IDENTITY_NOT_CONFIGURED: tenant_id is null' USING ERRCODE = 'P0001';
  END IF;
  SELECT * INTO t FROM public.tenants WHERE id = p_tenant_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'TENANT_SENDER_IDENTITY_NOT_CONFIGURED: tenant % not found', p_tenant_id USING ERRCODE = 'P0001';
  END IF;
  r := public.resolve_tenant_sender(p_tenant_id);
  v_brand := NULLIF(TRIM(COALESCE(t.brand ->> 'name', t.name)), '');
  RETURN jsonb_build_object(
    'tenant_id',   p_tenant_id,
    'brand_name',  COALESCE(v_brand, r ->> 'from_name'),
    'sender_name', r ->> 'from_name',
    'from_email',  r ->> 'from_address',
    'from_name',   r ->> 'from_name',
    'domain',      r ->> 'domain'
  );
END; $$;

-- ── 9. Paige-governable seam: read / set a tenant's identity (dual-caller) ───────
-- VOLATILE (not STABLE): this reader self-heals via provision_...(), and a STABLE
-- frame would not see its own just-inserted row (snapshot) — returning NULL fields
-- on the first read after provisioning.
CREATE OR REPLACE FUNCTION public.get_tenant_email_identity(p_tenant_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE _caller uuid := auth.uid(); _tenant uuid; v_ident public.tenant_email_identities%ROWTYPE;
BEGIN
  IF _caller IS NOT NULL THEN
    _tenant := public.current_user_tenant_id();
    IF p_tenant_id IS NOT NULL AND p_tenant_id <> _tenant AND NOT public.is_platform_owner() THEN
      RAISE EXCEPTION 'IDENTITY_FORBIDDEN: tenant mismatch' USING ERRCODE = '42501';
    END IF;
    IF public.is_platform_owner() AND p_tenant_id IS NOT NULL THEN _tenant := p_tenant_id; END IF;
    IF NOT (public.is_tenant_member(_tenant) OR public.is_platform_owner()) THEN
      RAISE EXCEPTION 'IDENTITY_FORBIDDEN: not a member' USING ERRCODE = '42501';
    END IF;
  ELSE
    _tenant := p_tenant_id;
    IF _tenant IS NULL THEN RAISE EXCEPTION 'IDENTITY_NO_TENANT' USING ERRCODE = '22023'; END IF;
  END IF;

  PERFORM public.provision_tenant_email_identity(_tenant); -- self-heal if missing
  SELECT * INTO v_ident FROM public.tenant_email_identities WHERE tenant_id = _tenant;

  RETURN jsonb_build_object(
    'identity', jsonb_build_object(
      'tenant_id', v_ident.tenant_id, 'from_name', v_ident.from_name,
      'local_part', v_ident.local_part, 'reply_to', v_ident.reply_to,
      'kind', v_ident.kind, 'status', v_ident.status,
      'provisioned_at', v_ident.provisioned_at
    ),
    'live', public.resolve_tenant_sender(_tenant)
  );
END; $$;

CREATE OR REPLACE FUNCTION public.set_tenant_email_identity(
  p_from_name  text DEFAULT NULL,
  p_local_part text DEFAULT NULL,
  p_reply_to   text DEFAULT NULL,
  p_tenant_id  uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _caller uuid := auth.uid();
  _tenant uuid;
  v_local text;
  v_from  text;
  v_reply text;
BEGIN
  IF _caller IS NOT NULL THEN
    _tenant := public.current_user_tenant_id();
    IF p_tenant_id IS NOT NULL AND p_tenant_id <> _tenant AND NOT public.is_platform_owner() THEN
      RAISE EXCEPTION 'IDENTITY_FORBIDDEN: tenant mismatch' USING ERRCODE = '42501';
    END IF;
    IF public.is_platform_owner() AND p_tenant_id IS NOT NULL THEN _tenant := p_tenant_id; END IF;
    IF NOT ((public.is_tenant_member(_tenant)
             AND public.has_any_role(_caller, ARRAY['admin','super_admin','coach']))
            OR public.is_platform_owner()) THEN
      RAISE EXCEPTION 'IDENTITY_FORBIDDEN: admin or coach required' USING ERRCODE = '42501';
    END IF;
  ELSE
    _tenant := p_tenant_id;
    IF _tenant IS NULL THEN RAISE EXCEPTION 'IDENTITY_NO_TENANT' USING ERRCODE = '22023'; END IF;
  END IF;

  PERFORM public.provision_tenant_email_identity(_tenant); -- ensure the row exists

  IF p_from_name IS NOT NULL THEN
    v_from := NULLIF(TRIM(regexp_replace(p_from_name, '[[:cntrl:]]', ' ', 'g')), ''); -- strip CR/LF
    IF v_from IS NULL THEN RAISE EXCEPTION 'IDENTITY_BAD_FROM_NAME' USING ERRCODE = '22023'; END IF;
    v_from := left(v_from, 80);
  END IF;

  IF p_local_part IS NOT NULL THEN
    v_local := public.sanitize_email_local_part(p_local_part);
    IF EXISTS (
      SELECT 1 FROM public.tenant_email_identities
      WHERE kind = 'shared' AND lower(local_part) = lower(v_local) AND tenant_id <> _tenant
    ) THEN
      RAISE EXCEPTION 'IDENTITY_LOCAL_PART_TAKEN: %', v_local USING ERRCODE = '23505';
    END IF;
  END IF;

  IF p_reply_to IS NOT NULL THEN
    v_reply := NULLIF(TRIM(p_reply_to), '');
    IF v_reply IS NOT NULL AND v_reply !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN
      RAISE EXCEPTION 'IDENTITY_BAD_REPLY_TO: %', v_reply USING ERRCODE = '22023';
    END IF;
  END IF;

  UPDATE public.tenant_email_identities
     SET from_name  = COALESCE(v_from, from_name),
         local_part = COALESCE(v_local, local_part),
         reply_to   = CASE WHEN p_reply_to IS NULL THEN reply_to ELSE v_reply END
   WHERE tenant_id = _tenant;

  RETURN public.get_tenant_email_identity(
    CASE WHEN _caller IS NULL OR public.is_platform_owner() THEN _tenant ELSE NULL END
  );
END; $$;

-- ── 10. Operator read for the "see them live" registry surface ──────────────────
CREATE OR REPLACE FUNCTION public.list_tenant_sender_identities()
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE _caller uuid := auth.uid(); v jsonb;
BEGIN
  IF _caller IS NULL OR NOT public.is_platform_owner() THEN
    RAISE EXCEPTION 'IDENTITY_FORBIDDEN: platform owner only' USING ERRCODE = '42501';
  END IF;
  SELECT COALESCE(jsonb_agg(ident_row ORDER BY ident_row ->> 'tenant_name'), '[]'::jsonb) INTO v
  FROM (
    SELECT (public.resolve_tenant_sender(t.id)
            || jsonb_build_object('status', COALESCE(i.status, 'active'),
                                  'created_at', t.created_at)) AS ident_row
    FROM public.tenants t
    LEFT JOIN public.tenant_email_identities i ON i.tenant_id = t.id
  ) q;
  RETURN v;
END; $$;

-- ── 10b. Platform shared-domain config, Paige-governable (§10) ──────────────────
-- The shared sending domain defaults to the platform apex 'paigeagent.ai' because
-- that is the domain already verified in Resend, so every tenant sends live today.
-- FOLLOW-UP (reputation isolation, tracked separately): once a dedicated sending
-- subdomain (e.g. mail.paigeagent.ai) is verified in Resend, switch shared_domain to
-- it via set_platform_email_settings so tenant bulk mail stops riding the auth apex —
-- no code change, config-as-data.
CREATE OR REPLACE FUNCTION public.get_platform_email_settings()
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE _caller uuid := auth.uid(); v public.platform_email_settings%ROWTYPE;
BEGIN
  IF _caller IS NOT NULL AND NOT public.is_platform_owner() THEN
    RAISE EXCEPTION 'EMAIL_SETTINGS_FORBIDDEN: platform owner only' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v FROM public.platform_email_settings LIMIT 1;
  RETURN jsonb_build_object(
    'shared_domain',     v.shared_domain,
    'default_from_name', v.default_from_name,
    'default_reply_to',  v.default_reply_to,
    'updated_at',        v.updated_at
  );
END; $$;

CREATE OR REPLACE FUNCTION public.set_platform_email_settings(
  p_shared_domain     text DEFAULT NULL,
  p_default_from_name text DEFAULT NULL,
  p_default_reply_to  text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE _caller uuid := auth.uid(); v_domain text; v_from text; v_reply text;
BEGIN
  -- Operator-only. The service/Paige path (auth.uid() NULL) is allowed for automation.
  IF _caller IS NOT NULL AND NOT public.is_platform_owner() THEN
    RAISE EXCEPTION 'EMAIL_SETTINGS_FORBIDDEN: platform owner only' USING ERRCODE = '42501';
  END IF;

  IF p_shared_domain IS NOT NULL THEN
    v_domain := lower(NULLIF(TRIM(p_shared_domain), ''));
    IF v_domain IS NULL OR v_domain !~ '^([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$' THEN
      RAISE EXCEPTION 'EMAIL_SETTINGS_BAD_DOMAIN: %', p_shared_domain USING ERRCODE = '22023';
    END IF;
  END IF;
  IF p_default_from_name IS NOT NULL THEN
    v_from := left(NULLIF(TRIM(regexp_replace(p_default_from_name, '[[:cntrl:]]', ' ', 'g')), ''), 80);
  END IF;
  IF p_default_reply_to IS NOT NULL THEN
    v_reply := NULLIF(TRIM(p_default_reply_to), '');
    IF v_reply IS NOT NULL AND v_reply !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN
      RAISE EXCEPTION 'EMAIL_SETTINGS_BAD_REPLY_TO: %', p_default_reply_to USING ERRCODE = '22023';
    END IF;
  END IF;

  UPDATE public.platform_email_settings
     SET shared_domain     = COALESCE(v_domain, shared_domain),
         default_from_name = COALESCE(v_from,   default_from_name),
         default_reply_to  = COALESCE(v_reply,  default_reply_to),
         updated_at        = now()
   WHERE id = true;

  RETURN public.get_platform_email_settings();
END; $$;

-- ── 11. Grants ──────────────────────────────────────────────────────────────────
REVOKE ALL ON FUNCTION public.provision_tenant_email_identity(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.provision_tenant_email_identity(uuid) TO service_role;

-- Trigger functions are invoked by the trigger mechanism, never called directly.
REVOKE ALL ON FUNCTION public.trg_provision_tenant_email_identity() FROM PUBLIC, anon, authenticated;

-- service_role ONLY: the canonical resolver takes an arbitrary tenant id with no
-- per-caller authz, so it must not be reachable by a JWT (cross-tenant read). The
-- guarded wrappers (get_tenant_email_identity / list_...) and the legacy adapters are
-- SECURITY DEFINER and invoke it internally as owner, so nothing else breaks.
REVOKE ALL ON FUNCTION public.resolve_tenant_sender(uuid) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.resolve_tenant_sender(uuid) TO service_role;

REVOKE ALL ON FUNCTION public.get_tenant_email_identity(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_tenant_email_identity(uuid) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.set_tenant_email_identity(text, text, text, uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.set_tenant_email_identity(text, text, text, uuid) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.list_tenant_sender_identities() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.list_tenant_sender_identities() TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.sanitize_email_local_part(text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.sanitize_email_local_part(text) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.get_platform_email_settings() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_platform_email_settings() TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.set_platform_email_settings(text, text, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.set_platform_email_settings(text, text, text) TO authenticated, service_role;
