-- #130 / #45 Super Admin workstream Slice 1 — let the platform operator
-- (is_platform_owner(), with NO active tenant) open a Paige chat thread. This
-- unblocks the Tier-3 "strategy sessions" capability (Paige-on-Paige).
--
-- Root cause: paige_chat_thread_create's self-mode branch resolves
-- v_tenant_id := current_user_tenant_id() and RAISEs 'self-mode requires caller
-- tenant' when it is NULL — which is exactly the platform owner's state. The
-- lens CHECK already permits 'platform'; the NULL-tenant rejection is the blocker.
--
-- Fix (NULL-sentinel, owner-recommended; §37 reader inventory found no reason to
-- split into a separate table): a platform thread = tenant_id NULL + lens='platform'.
--   1. Drop the NOT NULL on paige_chat_threads.tenant_id (FK is NULL-exempt; the
--      column is in no unique index — safe). NULL is the platform sentinel.
--   2. Add ONE branch to paige_chat_thread_create: p_lens='platform' requires
--      is_platform_owner() FIRST (else RAISE — closes the spoofing vector), then
--      leaves tenant_id NULL. The contact-bound and coach/client self-mode paths
--      ship BYTE-FOR-BYTE UNCHANGED (no is_tenant_admin added, no re-keying on
--      null-contact) so §51 tenant/agency/sub-account tiers are untouched.
--
-- RLS needs NO change: every paige_chat_threads/turns policy already leads with
-- is_platform_owner() (short-circuits TRUE for the operator) OR
-- tenant_id = current_user_tenant_id() (NULL = x → NULL → false for tenant users),
-- so platform threads are visible ONLY to the platform owner and structurally
-- invisible to tenants. Verified live on threads_select_owner_or_admin,
-- threads_tenant_isolation, threads_insert_self, threads_update_self,
-- threads_delete_owner_or_platform, and turns_select_via_thread.
--
-- Idempotent: guarded DROP NOT NULL (no-op if already nullable) + CREATE OR REPLACE.

--------------------------------------------------------------------------------
-- 1) NULL-tenant sentinel for platform threads.
--------------------------------------------------------------------------------
ALTER TABLE public.paige_chat_threads ALTER COLUMN tenant_id DROP NOT NULL;

COMMENT ON COLUMN public.paige_chat_threads.tenant_id IS
  'Owning tenant. NULL is the PLATFORM sentinel (#130): a platform-operator thread (lens=''platform'') that belongs to no tenant. RLS keeps NULL-tenant rows visible ONLY to is_platform_owner().';

--------------------------------------------------------------------------------
-- 2) Platform-auth branch. Body reproduced VERBATIM from prod
--    (pg_get_functiondef); the ONLY change is the new `ELSIF p_lens = 'platform'`
--    branch inserted between the contact and self-mode branches.
--------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.paige_chat_thread_create(
  p_contact_id uuid, p_lens text, p_title text, p_consent_snapshot jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid       uuid := auth.uid();
  v_tenant_id uuid;
  v_thread_id uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;
  IF p_lens NOT IN ('coach','client','platform') THEN RAISE EXCEPTION 'invalid lens'; END IF;

  IF p_contact_id IS NOT NULL THEN
    -- Tenant-scoped, contact-bound thread (UNCHANGED).
    SELECT tenant_id INTO v_tenant_id
      FROM public.clients WHERE id = p_contact_id;
    IF v_tenant_id IS NULL THEN
      RAISE EXCEPTION 'contact not found or has no tenant';
    END IF;
  ELSIF p_lens = 'platform' THEN
    -- PLATFORM thread (#130): the operator's own Paige, NOT tenant-scoped.
    -- The is_platform_owner() gate runs BEFORE tenant_id is left NULL, so a
    -- non-owner can never mint a NULL-tenant platform row (spoof/injection into
    -- the Super Admin surface). Independent of current_user_tenant_id(), so it
    -- works whether or not the operator has any incidental tenant membership.
    IF NOT public.is_platform_owner() THEN
      RAISE EXCEPTION 'platform lens requires platform owner';
    END IF;
    v_tenant_id := NULL;
  ELSE
    -- Self-mode, tenant-scoped coach/client thread (UNCHANGED).
    v_tenant_id := public.current_user_tenant_id();
    IF v_tenant_id IS NULL THEN
      RAISE EXCEPTION 'self-mode requires caller tenant';
    END IF;
  END IF;

  INSERT INTO public.paige_chat_threads
    (caller_user_id, contact_id, tenant_id, lens, title,
     consent_snapshot, auto_delete_at, last_message_at)
  VALUES
    (v_uid, p_contact_id, v_tenant_id, p_lens, p_title,
     p_consent_snapshot, now() + interval '90 days', now())
  RETURNING id INTO v_thread_id;

  RETURN v_thread_id;
END;
$function$;
