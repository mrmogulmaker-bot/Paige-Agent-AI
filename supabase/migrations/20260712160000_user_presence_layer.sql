-- Task #148 — real-time presence, DB layer (§7/§8/§10).
--
-- Two-layer design: the browser drives ephemeral Realtime Presence for instant
-- UI, and ALSO beats a heartbeat into this server-side table so Paige (and any
-- server/agent) can read "who is on the platform right now" — Realtime presence
-- is browser-only and invisible to the backend, so an agent could never answer
-- "is Antonio online?" without this table.
--
-- Liveness is computed from last_seen (never a stale stored 'online' flag), so a
-- crashed tab that never sent go_offline stops counting as present once its
-- heartbeat ages out — no ghost-online.
--
-- Isolation is belt-and-suspenders: every read RPC self-resolves the caller's
-- scope (SECURITY DEFINER, tenant pinned from tenant_members / current_user_tenant_id;
-- only the platform owner may look across tenants), AND the Realtime channel is
-- private with a per-tenant topic RLS policy so the browser layer can't subscribe
-- outside its tenant either.
--
-- profiles.user_id is the auth.users.id (profiles.id is a separate internal PK),
-- and profiles has no tenant_id — so joins use pr.user_id and tenant is resolved
-- via tenant_members.

-- ── Table ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.user_presence (
  user_id      uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  tenant_id    uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  status       text NOT NULL DEFAULT 'online' CHECK (status IN ('online','away')),
  last_seen    timestamptz NOT NULL DEFAULT now(),
  session_meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at   timestamptz NOT NULL DEFAULT now()
);

-- Hot path for "who's present in this tenant in the last N seconds".
CREATE INDEX IF NOT EXISTS user_presence_tenant_last_seen_idx
  ON public.user_presence (tenant_id, last_seen DESC);

ALTER TABLE public.user_presence ENABLE ROW LEVEL SECURITY;

-- No direct table grants to client roles: all access is through the RPCs below,
-- which self-resolve scope. (RLS on + no policy = deny-all for anon/authenticated;
-- SECURITY DEFINER functions bypass it deliberately and gate internally.)
REVOKE ALL ON public.user_presence FROM anon, authenticated;

-- ── Heartbeat: caller stamps their own presence ─────────────────────────────
CREATE OR REPLACE FUNCTION public.presence_heartbeat(
  p_status text DEFAULT 'online',
  p_meta   jsonb DEFAULT '{}'::jsonb
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid    uuid := auth.uid();
  v_tenant uuid := public.current_user_tenant_id();
  v_status text := CASE WHEN p_status IN ('online','away') THEN p_status ELSE 'online' END;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;
  INSERT INTO public.user_presence (user_id, tenant_id, status, last_seen, session_meta, updated_at)
  VALUES (v_uid, v_tenant, v_status, now(), COALESCE(p_meta, '{}'::jsonb), now())
  ON CONFLICT (user_id) DO UPDATE
    SET tenant_id    = EXCLUDED.tenant_id,
        status       = EXCLUDED.status,
        last_seen    = now(),
        session_meta = EXCLUDED.session_meta,
        updated_at   = now();
END $$;
REVOKE ALL ON FUNCTION public.presence_heartbeat(text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.presence_heartbeat(text, jsonb) TO authenticated;

-- ── Go offline: caller clears their own presence on unload/sign-out ─────────
CREATE OR REPLACE FUNCTION public.presence_go_offline()
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RETURN; END IF;
  DELETE FROM public.user_presence WHERE user_id = v_uid;
END $$;
REVOKE ALL ON FUNCTION public.presence_go_offline() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.presence_go_offline() TO authenticated;

-- ── List who is present now (liveness from last_seen) ───────────────────────
-- Scope: platform owner may pass p_tenant_id (NULL = platform-wide, all tenants);
-- everyone else is pinned to their own tenant regardless of what they pass.
CREATE OR REPLACE FUNCTION public.presence_list_online(
  p_tenant_id      uuid DEFAULT NULL,
  p_window_seconds integer DEFAULT 75
) RETURNS TABLE (
  user_id      uuid,
  tenant_id    uuid,
  full_name    text,
  avatar_url   text,
  status       text,
  last_seen    timestamptz,
  session_meta jsonb
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_is_owner boolean := public.is_platform_owner();
  v_scope    uuid;
  v_window   integer := GREATEST(15, LEAST(COALESCE(p_window_seconds, 75), 600));
  v_cutoff   timestamptz;
BEGIN
  IF auth.uid() IS NULL THEN RETURN; END IF;
  v_cutoff := now() - make_interval(secs => v_window);

  -- Non-owners are hard-pinned to their own tenant; the owner chooses (NULL = all).
  IF v_is_owner THEN
    v_scope := p_tenant_id;              -- may be NULL → platform-wide
  ELSE
    v_scope := public.current_user_tenant_id();
    IF v_scope IS NULL THEN RETURN; END IF;
  END IF;

  RETURN QUERY
  SELECT up.user_id,
         up.tenant_id,
         pr.full_name,
         pr.avatar_url,
         up.status,
         up.last_seen,
         up.session_meta
  FROM public.user_presence up
  LEFT JOIN public.profiles pr ON pr.user_id = up.user_id
  WHERE up.last_seen >= v_cutoff
    AND (v_scope IS NULL OR up.tenant_id = v_scope)
  ORDER BY up.last_seen DESC;
END $$;
REVOKE ALL ON FUNCTION public.presence_list_online(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.presence_list_online(uuid, integer) TO authenticated;

-- ── Check a specific person: "is <name/email> online right now?" ────────────
-- Tenant is resolved via tenant_members (profiles has no tenant_id). Non-owners
-- only ever see people who share their tenant.
CREATE OR REPLACE FUNCTION public.presence_check_user(
  p_query          text,
  p_window_seconds integer DEFAULT 75
) RETURNS TABLE (
  user_id    uuid,
  full_name  text,
  avatar_url text,
  is_online  boolean,
  status     text,
  last_seen  timestamptz
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_is_owner boolean := public.is_platform_owner();
  v_scope    uuid    := public.current_user_tenant_id();
  v_window   integer := GREATEST(15, LEAST(COALESCE(p_window_seconds, 75), 600));
  v_cutoff   timestamptz;
  v_q        text;
BEGIN
  IF auth.uid() IS NULL OR p_query IS NULL OR btrim(p_query) = '' THEN RETURN; END IF;
  v_cutoff := now() - make_interval(secs => v_window);
  v_q := '%' || lower(btrim(p_query)) || '%';

  RETURN QUERY
  SELECT pr.user_id,
         pr.full_name,
         pr.avatar_url,
         (up.last_seen IS NOT NULL AND up.last_seen >= v_cutoff) AS is_online,
         COALESCE(up.status, 'offline') AS status,
         up.last_seen
  FROM public.profiles pr
  JOIN auth.users au ON au.id = pr.user_id
  LEFT JOIN public.user_presence up ON up.user_id = pr.user_id
  WHERE (lower(COALESCE(pr.full_name, '')) LIKE v_q OR lower(COALESCE(au.email, '')) LIKE v_q)
    -- Owner sees everyone; members only see people in their own tenant.
    AND (
      v_is_owner
      OR (v_scope IS NOT NULL AND EXISTS (
            SELECT 1 FROM public.tenant_members tm
            WHERE tm.user_id = pr.user_id
              AND tm.tenant_id = v_scope
              AND tm.status = 'active'
          ))
    )
  ORDER BY is_online DESC, pr.full_name ASC
  LIMIT 10;
END $$;
REVOKE ALL ON FUNCTION public.presence_check_user(text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.presence_check_user(text, integer) TO authenticated;
