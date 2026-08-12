-- Task #126 Slice 3a — paige_browser_usage: append-only audit rail for Paige's browser calls.
--
-- Owner-ruled 2026-08-12 (D1=(c) wildcard + denylist). Every wildcard browse call — allowed OR blocked
-- — records one immutable row here. This is the §17 Engine-2 metered rail's first table (per-tenant
-- rate limits land in Slice 3c on top of it) AND the operator's day-one visibility into what Paige
-- browsed on a tenant's behalf (a load-bearing safety surface for the wildcard capability, §9/§53).
--
-- §9/§34 WRITE PATH: the DB-free Fly browser host NEVER writes here (it holds no Supabase creds — an
-- SSRF/RCE on the browser must not reach the DB). The row is written by the CALLING edge function
-- (Slice 3b's browse_public_url skill dispatch), which resolves tenant_id from the VERIFIED JWT and
-- writes via service_role. The Fly host returns blocked_reason/timing; the caller records them. So in
-- Slice 3a this table ships with ZERO writers yet (§37: the wildcard endpoint has zero producers until
-- 3b) — it is the schema the 3b caller writes to, shipped now for the operator audit rail per the brief.

CREATE TABLE IF NOT EXISTS public.paige_browser_usage (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  called_at       timestamptz NOT NULL DEFAULT now(),
  endpoint        text NOT NULL DEFAULT 'browse-public-url',
  url_requested   text NOT NULL,                 -- raw request URL (kept as-is for audit; never a downstream surface, §13)
  url_resolved    text,                          -- post-redirect final URL if navigation succeeded
  blocked_reason  text,                          -- null = allowed; else ssrf:* / denylist:* / wildcard:disabled
  http_status     int,
  content_bytes   int,
  response_time_ms int,
  created_by      uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.paige_browser_usage IS
  'Append-only audit rail for Paige browser calls (Task #126 Slice 3a). Written by the calling edge function via service_role with the tenant it resolved from the verified JWT; the DB-free Fly browser host never writes here. blocked_reason is null when allowed, else ssrf:*/denylist:*/wildcard:disabled. §17 Engine-2 metered rail begins here.';

-- Tenant-scoped read pattern + time-ordered rate-limit lookups (Slice 3c) hit (tenant_id, called_at).
CREATE INDEX IF NOT EXISTS idx_paige_browser_usage_tenant_called
  ON public.paige_browser_usage (tenant_id, called_at DESC);

ALTER TABLE public.paige_browser_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.paige_browser_usage FORCE ROW LEVEL SECURITY;

-- SELECT (§9/§53): a tenant sees ONLY its own rows; a platform operator (super_admin/platform_admin)
-- sees every tenant's rows for fleet-wide audit. Nothing else can read.
DROP POLICY IF EXISTS paige_browser_usage_select ON public.paige_browser_usage;
CREATE POLICY paige_browser_usage_select ON public.paige_browser_usage
  FOR SELECT TO authenticated
  USING (tenant_id = public.current_user_tenant_id() OR public.is_platform_operator());

-- INSERT: service_role only (the trusted browser edge caller). There is deliberately NO authenticated
-- INSERT policy, so a tenant JWT can never forge or backfill usage rows.
DROP POLICY IF EXISTS paige_browser_usage_insert ON public.paige_browser_usage;
CREATE POLICY paige_browser_usage_insert ON public.paige_browser_usage
  FOR INSERT TO service_role
  WITH CHECK (true);

-- Immutable audit trail: block UPDATE and DELETE for EVERYONE — including service_role, which bypasses
-- RLS but NOT triggers — so history can never be mutated after the fact (§13 audit integrity).
CREATE OR REPLACE FUNCTION public.paige_browser_usage_immutable()
  RETURNS trigger
  LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'paige_browser_usage is append-only (Task #126 Slice 3a); % is not permitted', TG_OP;
END;
$$;

DROP TRIGGER IF EXISTS trg_paige_browser_usage_immutable ON public.paige_browser_usage;
CREATE TRIGGER trg_paige_browser_usage_immutable
  BEFORE UPDATE OR DELETE ON public.paige_browser_usage
  FOR EACH ROW EXECUTE FUNCTION public.paige_browser_usage_immutable();

-- Grants: authenticated may SELECT (RLS narrows to own-tenant / operator); service_role may SELECT +
-- INSERT. No UPDATE/DELETE grant to anyone (the trigger is the hard backstop; the grant is the first
-- line). anon gets nothing.
REVOKE ALL ON TABLE public.paige_browser_usage FROM PUBLIC;
REVOKE ALL ON TABLE public.paige_browser_usage FROM anon;
REVOKE ALL ON TABLE public.paige_browser_usage FROM authenticated;
GRANT SELECT ON TABLE public.paige_browser_usage TO authenticated;
GRANT SELECT, INSERT ON TABLE public.paige_browser_usage TO service_role;
