-- ─────────────────────────────────────────────────────────────────────────────
-- TIER 1 — per-tenant unique default sender on the VERIFIED subdomain
--
-- Extends the registry from 20260711170000_tenant_email_identity_registry.sql.
-- Do NOT edit that file; this migration is additive.
--
-- Two gaps this closes:
--   (a) shared_domain was the apex 'paigeagent.ai', but the domain actually
--       verified in Resend for sending is the subdomain 'mail.paigeagent.ai'
--       (owner-confirmed; DNS in Vercel). Point the shared default at the
--       authenticated subdomain so every per-tenant default sends from a domain
--       Resend will actually accept (and tenant bulk mail stops riding the auth
--       apex — the reputation-isolation follow-up noted in the registry §10b).
--   (b) resolve_tenant_sender BRANCH 3 (the safety net, when a tenant somehow
--       has no tenant_email_identities row) fell back to a SHARED 'team@' address
--       — so any two identity-less tenants would send from the identical address,
--       an impersonation/deliverability hazard. Make branch 3 compute a UNIQUE
--       per-tenant local-part from the tenant slug, exactly like the primary
--       provisioning path, so no two tenants ever share a default From.
--
-- After this migration every tenant resolves to <slug>@mail.paigeagent.ai
-- (display name = their brand) until they verify their own custom domain.
--
-- Design (per doctrine):
--   §9  the shared domain is a platform (operator) config value; identities are
--       tenant-scoped. §10 config-as-data — the domain lives in a row, not code.
--   §13 branch 3's uniqueness mirrors the collision-safe provisioning helper;
--       no duplicated collision logic (the backfill calls the existing fn).
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Point the shared sending domain at the VERIFIED Resend subdomain ─────────
-- default_reply_to stays 'support@paigeagent.ai': a Reply-To header does not need
-- to be a verified SENDING domain, and support@ is a real monitored inbox — leave
-- it intact. default_from_name is likewise untouched.
UPDATE public.platform_email_settings
   SET shared_domain = 'mail.paigeagent.ai',
       updated_at    = now()
 WHERE id = true
   AND shared_domain IS DISTINCT FROM 'mail.paigeagent.ai';

-- Safety: if the singleton row somehow does not exist yet, create it on the
-- verified subdomain (mirrors the registry's INSERT ... ON CONFLICT DO NOTHING,
-- but with the corrected default).
INSERT INTO public.platform_email_settings (id, shared_domain)
VALUES (true, 'mail.paigeagent.ai')
ON CONFLICT (id) DO NOTHING;

-- ── 2. resolve_tenant_sender — branch 3 gets a UNIQUE per-tenant safety net ──────
-- Copied verbatim from the registry migration; the ONLY change is inside the
-- ELSE (branch 3) block: v_from_addr is now derived from the tenant slug via
-- sanitize_email_local_part instead of the shared 'team@'. Everything else —
-- branch 1 (verified custom domain), branch 2 (stored shared identity, which
-- still wins whenever an identity row is present), the reply-to validation, the
-- _tenant_id IS NULL platform block, the return shape, and the STABLE SECURITY
-- DEFINER + search_path attributes — is unchanged.
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
  v_shared := COALESCE(NULLIF(v_cfg.shared_domain, ''), 'mail.paigeagent.ai');

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
    -- 3) Safety net (identity somehow absent). Derive a UNIQUE per-tenant local
    -- from the slug (falling back to name, then 'client') so two identity-less
    -- tenants never collide on a shared 'team@' address. Platform-generic — never
    -- a vertical brand. Only a truly empty slug AND name yields 'client@'.
    v_from_addr := public.sanitize_email_local_part(
                     COALESCE(NULLIF(v_tenant.slug, ''), v_tenant.name, 'client')
                   ) || '@' || v_shared;
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

-- Preserve the registry's grant posture: service_role only (no per-caller authz
-- inside; the guarded wrappers invoke it as owner). CREATE OR REPLACE keeps
-- existing grants, but restate them so this migration is self-contained.
REVOKE ALL ON FUNCTION public.resolve_tenant_sender(uuid) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.resolve_tenant_sender(uuid) TO service_role;

-- ── 3. Backfill: provision a shared identity for any tenant still lacking one ────
-- Reuse the existing collision-safe helper — do NOT duplicate the suffixing logic.
-- provision_tenant_email_identity(_tenant_id) is idempotent (returns the existing
-- row untouched if one is already present), so this only materializes rows for
-- tenants that have none. New from the registry backfill: those newly-created
-- rows now sit on 'mail.paigeagent.ai' via the resolver, and any tenant that
-- was relying on the old shared 'team@' safety net now gets its own stored
-- <slug>@mail.paigeagent.ai identity.
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT t.id
    FROM public.tenants t
    LEFT JOIN public.tenant_email_identities i ON i.tenant_id = t.id
    WHERE i.tenant_id IS NULL
  LOOP
    PERFORM public.provision_tenant_email_identity(r.id);
  END LOOP;
END $$;

-- ── 4. tenant_sender_identity guard (20260712220000) is intentionally untouched ──
-- That migration CREATE OR REPLACE'd tenant_sender_identity to pin JWT callers to
-- their own tenant. This migration only rewrites resolve_tenant_sender, which the
-- guard calls internally — the guard itself is not redefined here, so its
-- cross-tenant protection remains in force. No regression.
