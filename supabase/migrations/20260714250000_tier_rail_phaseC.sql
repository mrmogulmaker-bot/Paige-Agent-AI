-- ============================================================================
-- Tier Rail Spine — PHASE C: stamp every outbound send with its origin tier,
-- + one unified, god-scoped send ledger.
--
-- The owner's literal ask: "tell me when a client is being sent out from the
-- client portal / from a tenant / from an agency — tell me the difference."
-- Phase C makes that observable. Every invite/email row is stamped, SERVER-SIDE
-- and spoof-proof, with:
--   origin_account_id — which account the send is FROM
--   actor_tier        — WHO initiated it (god|agency|tenant|subaccount|client)
--   target_tier       — WHO it's TO (a client-portal invite → 'client', etc.)
--
-- Stamping is done by BEFORE INSERT triggers (not per-edge-fn edits) because the
-- audit proved a write path (agency-invite-member) bypasses the RPC — a trigger
-- is the ONE place every current and future caller is covered and a caller
-- cannot forge the tier (actor_tier is always OVERWRITTEN from a server-side
-- resolver, never COALESCEd with a request-body value).
--
-- Additive + safe: nullable columns with NO default, CHECKs added NOT VALID then
-- VALIDATEd (never fail on legacy rows), triggers never RAISE. No existing send
-- can break. btf_workspace_invites does not exist in prod, so it is omitted.
-- ============================================================================

BEGIN;

-- ── Helpers ─────────────────────────────────────────────────────────────────

-- account_tier: the ORIGIN tier of a sending account. Never 'god' (god is a user
-- role, not an account_type) and never 'client' (a client has no tenant row here).
CREATE OR REPLACE FUNCTION public.account_tier(_tenant_id uuid)
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT CASE
    WHEN t.account_type IN ('agency','enterprise') THEN 'agency'
    WHEN t.parent_tenant_id IS NOT NULL           THEN 'subaccount'
    ELSE 'tenant'
  END
  FROM public.tenants t WHERE t.id = _tenant_id;
$function$;
REVOKE ALL ON FUNCTION public.account_tier(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.account_tier(uuid) TO authenticated, service_role;

-- resolve_actor_tier: the tier the INITIATOR acted as. A god operating INTO a
-- tenant reads 'god'. Composes the Phase B resolver; falls back to the origin
-- account's tier for system/service sends (no authenticated actor). The ONLY
-- place actor_tier is computed; never reads a caller-supplied value.
CREATE OR REPLACE FUNCTION public.resolve_actor_tier(_actor uuid, _origin uuid)
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _t text;
BEGIN
  IF _actor IS NULL THEN
    RETURN public.account_tier(_origin);
  END IF;
  _t := public.get_actor_access(_actor) ->> 'tier';
  IF _t IS NULL OR _t = 'none' THEN
    RETURN public.account_tier(_origin);
  END IF;
  RETURN _t;
END;
$function$;
REVOKE ALL ON FUNCTION public.resolve_actor_tier(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resolve_actor_tier(uuid, uuid) TO authenticated, service_role;

-- ── (C1) tenant_invite_tokens ───────────────────────────────────────────────
ALTER TABLE public.tenant_invite_tokens
  ADD COLUMN IF NOT EXISTS origin_account_id uuid,
  ADD COLUMN IF NOT EXISTS actor_tier text,
  ADD COLUMN IF NOT EXISTS target_tier text;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='tit_actor_tier_chk') THEN
    ALTER TABLE public.tenant_invite_tokens ADD CONSTRAINT tit_actor_tier_chk
      CHECK (actor_tier IS NULL OR actor_tier IN ('god','agency','tenant','subaccount','client')) NOT VALID;
    ALTER TABLE public.tenant_invite_tokens VALIDATE CONSTRAINT tit_actor_tier_chk;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='tit_target_tier_chk') THEN
    ALTER TABLE public.tenant_invite_tokens ADD CONSTRAINT tit_target_tier_chk
      CHECK (target_tier IS NULL OR target_tier IN ('god','agency','tenant','subaccount','client')) NOT VALID;
    ALTER TABLE public.tenant_invite_tokens VALIDATE CONSTRAINT tit_target_tier_chk;
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_tit_tier ON public.tenant_invite_tokens (actor_tier, target_tier, created_at);

UPDATE public.tenant_invite_tokens SET
  origin_account_id = tenant_id,
  target_tier = CASE kind WHEN 'consumer' THEN 'client' WHEN 'team' THEN 'tenant'
                          WHEN 'subaccount_owner' THEN 'subaccount' WHEN 'agency_team' THEN 'agency' END,
  actor_tier = public.account_tier(tenant_id)
WHERE origin_account_id IS NULL;

CREATE OR REPLACE FUNCTION public.stamp_tier_send_invite()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
BEGIN
  NEW.origin_account_id := NEW.tenant_id;
  NEW.target_tier := CASE NEW.kind WHEN 'consumer' THEN 'client' WHEN 'team' THEN 'tenant'
                                   WHEN 'subaccount_owner' THEN 'subaccount' WHEN 'agency_team' THEN 'agency'
                                   ELSE NEW.target_tier END;
  NEW.actor_tier := public.resolve_actor_tier(auth.uid(), NEW.tenant_id);
  RETURN NEW;
END; $function$;
DROP TRIGGER IF EXISTS trg_stamp_tier_send_invite ON public.tenant_invite_tokens;
CREATE TRIGGER trg_stamp_tier_send_invite BEFORE INSERT ON public.tenant_invite_tokens
  FOR EACH ROW EXECUTE FUNCTION public.stamp_tier_send_invite();

-- ── (C2) invitations (staff/admin) ──────────────────────────────────────────
ALTER TABLE public.invitations
  ADD COLUMN IF NOT EXISTS origin_account_id uuid,
  ADD COLUMN IF NOT EXISTS actor_tier text,
  ADD COLUMN IF NOT EXISTS target_tier text;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='inv_actor_tier_chk') THEN
    ALTER TABLE public.invitations ADD CONSTRAINT inv_actor_tier_chk
      CHECK (actor_tier IS NULL OR actor_tier IN ('god','agency','tenant','subaccount','client')) NOT VALID;
    ALTER TABLE public.invitations VALIDATE CONSTRAINT inv_actor_tier_chk;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='inv_target_tier_chk') THEN
    ALTER TABLE public.invitations ADD CONSTRAINT inv_target_tier_chk
      CHECK (target_tier IS NULL OR target_tier IN ('god','agency','tenant','subaccount','client')) NOT VALID;
    ALTER TABLE public.invitations VALIDATE CONSTRAINT inv_target_tier_chk;
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_inv_tier ON public.invitations (actor_tier, target_tier, created_at);

UPDATE public.invitations SET
  origin_account_id = tenant_id,
  target_tier = COALESCE(target_tier, 'tenant'),
  actor_tier = public.account_tier(tenant_id)
WHERE origin_account_id IS NULL AND tenant_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.stamp_tier_send_invitations()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
BEGIN
  NEW.origin_account_id := NEW.tenant_id;
  NEW.target_tier := COALESCE(NEW.target_tier, 'tenant');
  NEW.actor_tier := public.resolve_actor_tier(auth.uid(), NEW.tenant_id);
  RETURN NEW;
END; $function$;
DROP TRIGGER IF EXISTS trg_stamp_tier_send_invitations ON public.invitations;
CREATE TRIGGER trg_stamp_tier_send_invitations BEFORE INSERT ON public.invitations
  FOR EACH ROW EXECUTE FUNCTION public.stamp_tier_send_invitations();

-- ── (C3) platform_invites (God → platform_admin) ────────────────────────────
ALTER TABLE public.platform_invites
  ADD COLUMN IF NOT EXISTS origin_account_id uuid,
  ADD COLUMN IF NOT EXISTS actor_tier text,
  ADD COLUMN IF NOT EXISTS target_tier text;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='pinv_actor_tier_chk') THEN
    ALTER TABLE public.platform_invites ADD CONSTRAINT pinv_actor_tier_chk
      CHECK (actor_tier IS NULL OR actor_tier IN ('god','agency','tenant','subaccount','client')) NOT VALID;
    ALTER TABLE public.platform_invites VALIDATE CONSTRAINT pinv_actor_tier_chk;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='pinv_target_tier_chk') THEN
    ALTER TABLE public.platform_invites ADD CONSTRAINT pinv_target_tier_chk
      CHECK (target_tier IS NULL OR target_tier IN ('god','agency','tenant','subaccount','client')) NOT VALID;
    ALTER TABLE public.platform_invites VALIDATE CONSTRAINT pinv_target_tier_chk;
  END IF;
END $$;

UPDATE public.platform_invites SET actor_tier='god', target_tier='god' WHERE actor_tier IS NULL;

CREATE OR REPLACE FUNCTION public.stamp_tier_send_platform()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
BEGIN
  -- Only is_platform_owner reaches this table; hard-set both tiers server-side.
  NEW.actor_tier := 'god';
  NEW.target_tier := 'god';
  RETURN NEW;
END; $function$;
DROP TRIGGER IF EXISTS trg_stamp_tier_send_platform ON public.platform_invites;
CREATE TRIGGER trg_stamp_tier_send_platform BEFORE INSERT ON public.platform_invites
  FOR EACH ROW EXECUTE FUNCTION public.stamp_tier_send_platform();

-- ── (C4) email_send_log ─────────────────────────────────────────────────────
ALTER TABLE public.email_send_log
  ADD COLUMN IF NOT EXISTS origin_account_id uuid,
  ADD COLUMN IF NOT EXISTS actor_tier text,
  ADD COLUMN IF NOT EXISTS target_tier text;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='esl_actor_tier_chk') THEN
    ALTER TABLE public.email_send_log ADD CONSTRAINT esl_actor_tier_chk
      CHECK (actor_tier IS NULL OR actor_tier IN ('god','agency','tenant','subaccount','client')) NOT VALID;
    ALTER TABLE public.email_send_log VALIDATE CONSTRAINT esl_actor_tier_chk;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='esl_target_tier_chk') THEN
    ALTER TABLE public.email_send_log ADD CONSTRAINT esl_target_tier_chk
      CHECK (target_tier IS NULL OR target_tier IN ('god','agency','tenant','subaccount','client')) NOT VALID;
    ALTER TABLE public.email_send_log VALIDATE CONSTRAINT esl_target_tier_chk;
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_esl_tier ON public.email_send_log (origin_account_id, actor_tier, created_at);

UPDATE public.email_send_log SET
  origin_account_id = tenant_id,
  actor_tier = public.account_tier(tenant_id)
WHERE origin_account_id IS NULL AND tenant_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.stamp_tier_send_email()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
BEGIN
  NEW.origin_account_id := NEW.tenant_id;
  NEW.actor_tier := public.resolve_actor_tier(auth.uid(), NEW.tenant_id);  -- NULL-safe when tenant_id NULL
  NEW.target_tier := COALESCE(NEW.metadata ->> 'target_tier', NEW.target_tier);
  IF NEW.target_tier IS NOT NULL AND NEW.target_tier NOT IN ('god','agency','tenant','subaccount','client') THEN
    NEW.target_tier := NULL;  -- tolerate junk metadata, never fail the send
  END IF;
  RETURN NEW;
END; $function$;
DROP TRIGGER IF EXISTS trg_stamp_tier_send_email ON public.email_send_log;
CREATE TRIGGER trg_stamp_tier_send_email BEFORE INSERT ON public.email_send_log
  FOR EACH ROW EXECUTE FUNCTION public.stamp_tier_send_email();

-- ── (C5) paige_actions (action bus — the tier Paige/human acted as) ──────────
ALTER TABLE public.paige_actions
  ADD COLUMN IF NOT EXISTS origin_account_id uuid,
  ADD COLUMN IF NOT EXISTS actor_tier text,
  ADD COLUMN IF NOT EXISTS target_tier text;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='pa_actor_tier_chk') THEN
    ALTER TABLE public.paige_actions ADD CONSTRAINT pa_actor_tier_chk
      CHECK (actor_tier IS NULL OR actor_tier IN ('god','agency','tenant','subaccount','client')) NOT VALID;
    ALTER TABLE public.paige_actions VALIDATE CONSTRAINT pa_actor_tier_chk;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='pa_target_tier_chk') THEN
    ALTER TABLE public.paige_actions ADD CONSTRAINT pa_target_tier_chk
      CHECK (target_tier IS NULL OR target_tier IN ('god','agency','tenant','subaccount','client')) NOT VALID;
    ALTER TABLE public.paige_actions VALIDATE CONSTRAINT pa_target_tier_chk;
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_pa_tier ON public.paige_actions (tenant_id, actor_tier, created_at);

UPDATE public.paige_actions SET
  origin_account_id = tenant_id,
  actor_tier = public.account_tier(tenant_id),
  target_tier = public.account_tier(tenant_id)
WHERE origin_account_id IS NULL AND tenant_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.stamp_tier_send_actions()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
BEGIN
  NEW.origin_account_id := NEW.tenant_id;
  NEW.actor_tier := public.resolve_actor_tier(COALESCE(auth.uid(), NEW.created_by), NEW.tenant_id);
  NEW.target_tier := COALESCE(NEW.target_tier, public.account_tier(NEW.tenant_id));
  RETURN NEW;
END; $function$;
DROP TRIGGER IF EXISTS trg_stamp_tier_send_actions ON public.paige_actions;
CREATE TRIGGER trg_stamp_tier_send_actions BEFORE INSERT ON public.paige_actions
  FOR EACH ROW EXECUTE FUNCTION public.stamp_tier_send_actions();

-- ── (C6) Unified read seam: one queryable ledger of every send + its tier ────
CREATE OR REPLACE VIEW public.tier_send_ledger AS
  SELECT 'tenant_invite_tokens'::text AS source_table, t.id AS send_id, t.origin_account_id,
         public.account_tier(t.origin_account_id) AS origin_tier, t.actor_tier, t.target_tier,
         t.kind AS kind_or_role, t.email AS recipient_email,
         CASE WHEN t.revoked_at IS NOT NULL THEN 'revoked'
              WHEN t.expires_at <= now() THEN 'expired'
              WHEN t.max_uses IS NOT NULL AND t.uses >= t.max_uses THEN 'used'
              ELSE 'active' END AS status,
         t.created_by, t.created_at
  FROM public.tenant_invite_tokens t
  UNION ALL
  SELECT 'invitations', i.id, i.origin_account_id,
         public.account_tier(i.origin_account_id), i.actor_tier, i.target_tier,
         i.role::text, i.email,
         CASE WHEN i.accepted_at IS NOT NULL THEN 'accepted'
              WHEN i.expires_at <= now() THEN 'expired' ELSE 'pending' END,
         i.invited_by, i.created_at
  FROM public.invitations i
  UNION ALL
  SELECT 'platform_invites', p.id, p.origin_account_id,
         public.account_tier(p.origin_account_id), p.actor_tier, p.target_tier,
         p.role::text, p.email, p.status, p.invited_by, p.created_at
  FROM public.platform_invites p
  UNION ALL
  SELECT 'email_send_log', e.id, e.origin_account_id,
         public.account_tier(e.origin_account_id), e.actor_tier, e.target_tier,
         e.template_name, e.recipient_email, e.status, NULL::uuid, e.created_at
  FROM public.email_send_log e;

-- (C7) Scoped read RPC: god sees ALL sends; an agency sees its own + subaccounts;
--      a tenant sees only its own origin. Answers the owner's question in one call.
CREATE OR REPLACE FUNCTION public.operator_tier_send_feed(
  _since timestamptz DEFAULT (now() - interval '30 days'),
  _tier text DEFAULT NULL
)
 RETURNS TABLE(source_table text, send_id uuid, origin_account_id uuid, origin_tier text,
               actor_tier text, target_tier text, kind_or_role text, recipient_email text,
               status text, created_by uuid, created_at timestamptz)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _acc  jsonb := public.get_my_access();
  _mine text  := _acc ->> 'tier';
  _acct uuid  := NULLIF(_acc ->> 'account_id','')::uuid;
  _ag   uuid  := NULLIF(_acc ->> 'agency_id','')::uuid;
BEGIN
  RETURN QUERY
  SELECT l.* FROM public.tier_send_ledger l
  WHERE l.created_at >= _since
    AND (_tier IS NULL OR l.actor_tier = _tier OR l.target_tier = _tier OR l.origin_tier = _tier)
    AND (
      _mine = 'god'
      OR (_mine = 'agency' AND (
            l.origin_account_id = COALESCE(_ag, _acct)
            OR l.origin_account_id IN (SELECT c.id FROM public.tenants c WHERE c.parent_tenant_id = COALESCE(_ag, _acct))
         ))
      OR (_mine IN ('tenant','subaccount') AND l.origin_account_id = _acct)
    )
  ORDER BY l.created_at DESC
  LIMIT 500;
END;
$function$;
REVOKE ALL ON FUNCTION public.operator_tier_send_feed(timestamptz, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.operator_tier_send_feed(timestamptz, text) TO authenticated;

COMMIT;
