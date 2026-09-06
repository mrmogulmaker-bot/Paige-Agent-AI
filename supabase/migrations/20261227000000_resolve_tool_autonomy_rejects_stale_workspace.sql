-- resolve_tool_autonomy: reject a STALE cross-workspace read (§9/§37/§59)
--
-- WHY. resolve_tool_autonomy is the ceiling/effective-mode source of truth the Trust Compass reads
-- to show a tenant's real posture, and the chat runtime reads to gate a tool. Unlike its siblings
-- set_tool_autonomy and list_tool_autonomy — which RAISE AUTONOMY_FORBIDDEN when a non-owner JWT
-- caller passes a _tenant_id that is not their current tenant — this function SILENTLY discarded the
-- passed _tenant_id for a non-owner and substituted current_user_tenant_id(). So the Trust Compass's
-- ceiling probe (which now passes the viewed workspace, matching the write path) could NOT actually
-- reject a stale read: after an admin switches workspace A→B, switchTenant persists the server-side
-- active tenant before the React surface re-keys, so a probe fired in that window read B's ceiling
-- and the still-mounted A surface derived A's tools' effective posture from B's rung. This closes
-- that gap by adding the SAME mismatch guard the other two functions carry — nothing else changes.
--
-- §37 PRODUCER INVENTORY (every caller of resolve_tool_autonomy, confirmed safe under the guard):
--   1. src/solo/data/useSoloToolGovernance.ts (Trust Compass ceiling probe) — passes the viewed
--      tenant; a legit non-owner passes their OWN current tenant → no raise; the stale case raises,
--      which is the intended new behavior (the surface then flags the ceiling unconfirmed, §13).
--   2. supabase/functions/paige-ai-chat/index.ts:7427 — wraps the call in try/catch with a safe
--      'confirm' default, so even a raise degrades gracefully to the conservative lane (never auto);
--      no chat breakage.
--   3. supabase/functions/studio-learn-from-artifact/index.ts:152 — service-role client
--      (auth.uid() IS NULL) → the guarded branch is skipped entirely (service trusts _tenant_id).
--   4. src/operator/data/useToolAutonomy.ts (operator/God surface) — platform owner →
--      is_platform_owner() true → exempt from the mismatch check.
--   5. SECURITY DEFINER SQL callers (20260904052832 / 20261224000001 pipeline move executors) —
--      pass the deal's own tenant, which for a legit non-owner equals current_user_tenant_id();
--      an owner act-as is exempt; a foreign tenant would already fail the deal lookup.
-- Three-valued logic keeps a membership-less caller safe: current_user_tenant_id() NULL makes the
-- comparison NULL (not TRUE), so the guard does not fire and the existing "_tenant IS NULL → confirm"
-- fallback still applies.
--
-- §32.c: the authenticated multi-workspace live proof (a global-admin/act-as switch mid-read no
-- longer narrows the viewed tenant by another tenant's ceiling) is OWED to a browser-capable session;
-- this migration is a compile-time-safe reproduction of the existing function plus one guard clause.

CREATE OR REPLACE FUNCTION public.resolve_tool_autonomy(
  _tenant_id uuid,
  _tool_key  text
)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _caller uuid := auth.uid();
  _tenant uuid := _tenant_id;
  _mode   text;
  _rung   int;
BEGIN
  IF _caller IS NOT NULL THEN
    -- §9/§37: reject a stale cross-workspace read — a non-owner passing a tenant that is not their
    -- current one is refused, not silently answered for the current tenant (mirrors set/list).
    IF _tenant_id IS NOT NULL AND _tenant_id <> public.current_user_tenant_id() AND NOT public.is_platform_owner() THEN
      RAISE EXCEPTION 'AUTONOMY_FORBIDDEN: tenant mismatch' USING ERRCODE = '42501';
    END IF;
    -- Pin a JWT caller to their own tenant unless they are the platform owner.
    IF NOT public.is_platform_owner() THEN
      _tenant := public.current_user_tenant_id();
    END IF;
  END IF;

  IF _tenant IS NULL OR _tool_key IS NULL THEN
    RETURN 'confirm';
  END IF;

  SELECT mode INTO _mode
  FROM public.tenant_tool_autonomy
  WHERE tenant_id = _tenant AND tool_key = _tool_key;

  _mode := COALESCE(_mode, 'confirm');

  -- ── THE CEILING. §67: effective autonomy is min(grant, floor, ceiling). ──
  -- The tenant's setting is the GRANT. It can only ever narrow from here — a tenant cannot buy
  -- itself more autonomy than the platform is holding, and the platform cannot force a tenant to
  -- accept more than it asked for. Only ever more restrictive, never less.
  _rung := public.trust_effective_rung();
  IF _rung <= 0 THEN
    -- Rung 0: nothing acts unread. Not even a proposal — the point of rung 0 is that Paige is
    -- observing, not offering.
    RETURN 'off';
  ELSIF _rung <= 1 AND _mode = 'auto' THEN
    -- Rung 1: she may draft and ask, never act on her own.
    RETURN 'confirm';
  END IF;

  RETURN _mode;
END;
$$;
