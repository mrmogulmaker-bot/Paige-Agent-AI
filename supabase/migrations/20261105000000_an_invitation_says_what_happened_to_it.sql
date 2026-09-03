-- An invitation says what happened to it, and can be cleared when it is finished.
--
-- THE REPORT. The owner revoked an invitation on production and it stayed in the list for ever with
-- no action on it, and asked for the thing nobody could answer: was it sent, did it arrive, was it
-- opened, was the link clicked. The screenshot showed "Revoked" next to "0 pending" — so the row was
-- not stuck pending, it was finished and had nowhere to go.
--
-- WHAT WAS ACTUALLY WRONG, measured rather than assumed:
--
--   1. `send-portal-invite` posts to Resend and returns `emailed: res.ok`. That is "the POST was
--      accepted" — not sent, not delivered. It never reads the response body, so Resend's message
--      id, the only handle by which any later event could be matched, was discarded on every send.
--   2. The platform already HAS an email-truth table — `public.email_send_log`, append-only, written
--      by eight edge functions including `send-platform-invite`. The Solo Team invite path is the
--      one that skipped it. So this is wiring, not new infrastructure (§18: one home).
--   3. Resend has ZERO webhooks configured on this account (checked), while `paigeagent.ai` — the
--      domain invitations send from — already has open AND click tracking switched ON. Resend has
--      been recording those events all along and there was nothing listening. No tracking is being
--      newly enabled here; a listener is being added for data that already exists.
--
-- SCOPE NOTE (owner-approved, 2026-09-03). Widening the `email_send_log` status CHECK is a
-- platform-wide change to a table with eight writers. It is additive: every existing status stays
-- legal, so no current writer changes behaviour or breaks. The alternative — a Solo-local events
-- table — was rejected deliberately because it would fork email truth into two places and the
-- benefit would never reach the rest of the platform.

-- ---------------------------------------------------------------------------------------------
-- 1. The statuses an email can actually reach.
-- ---------------------------------------------------------------------------------------------
-- ADDITIVE ONLY. Dropping and re-adding a CHECK is the one moment the old values could be lost, so
-- the new list is the old list plus four, verified against the original definition in
-- 20260318203215_email_infra.sql: pending, sent, suppressed, failed, bounced, complained, dlq.
ALTER TABLE public.email_send_log DROP CONSTRAINT IF EXISTS email_send_log_status_check;
ALTER TABLE public.email_send_log ADD CONSTRAINT email_send_log_status_check
  CHECK (status IN (
    'pending', 'sent', 'suppressed', 'failed', 'bounced', 'complained', 'dlq',
    'delivered', 'delivery_delayed', 'opened', 'clicked'
  ));

COMMENT ON CONSTRAINT email_send_log_status_check ON public.email_send_log IS
  'Append-only lifecycle. delivered/delivery_delayed/opened/clicked arrive from the provider webhook; the earlier values are written by the senders themselves.';

-- How far through the journey each status is. Two events can share a created_at, and without a
-- tiebreak a `sent` row landing beside `delivered` would read as the headline and look like the
-- delivery regressed. Terminal failures outrank the happy path deliberately: a bounce is the most
-- important thing to say about an email, whenever it arrived.
CREATE OR REPLACE FUNCTION public.email_delivery_rank(_status text)
RETURNS integer
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT CASE _status
    WHEN 'pending' THEN 0
    WHEN 'sent' THEN 1
    WHEN 'delivery_delayed' THEN 2
    WHEN 'delivered' THEN 3
    WHEN 'opened' THEN 4
    WHEN 'clicked' THEN 5
    WHEN 'suppressed' THEN 6
    WHEN 'failed' THEN 7
    WHEN 'complained' THEN 8
    WHEN 'bounced' THEN 9
    ELSE -1
  END;
$function$;

-- The webhook matches on provider message id; the workspace read matches on invite id. Both are
-- lookups into a table that grows with every email the platform sends, so both are indexed.
CREATE INDEX IF NOT EXISTS idx_email_send_log_invite
  ON public.email_send_log ((metadata->>'invite_id'))
  WHERE metadata ? 'invite_id';

-- ---------------------------------------------------------------------------------------------
-- 2. An invitation can be cleared from the list without being destroyed.
-- ---------------------------------------------------------------------------------------------
-- NOT a delete. A revoked invitation is evidence that somebody's access was withdrawn, and #799
-- withdrew the browser roles' DELETE on the sibling membership table for exactly that class of
-- reason. Archiving hides the row from the operator's list and leaves the record intact.
ALTER TABLE public.tenant_invite_tokens
  ADD COLUMN IF NOT EXISTS archived_at timestamptz;

COMMENT ON COLUMN public.tenant_invite_tokens.archived_at IS
  'Set when an operator clears a finished invitation from their list. Never set on a live invitation — revoke it first. The row is retained as audit evidence.';

CREATE OR REPLACE FUNCTION public.archive_solo_team_invite(
  _actor uuid,
  _expected_tenant_id uuid,
  _invite_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  _tenant uuid;
  _invite public.tenant_invite_tokens;
BEGIN
  -- The SAME authority resolver the other three invitation writes use (#827). Not a re-derivation:
  -- a second implementation of "may this actor act in this workspace" is a second thing to get
  -- wrong, and the last one that existed here sent a token toward a workspace nobody named.
  _tenant := public.solo_team_invite_authority(_actor, _expected_tenant_id);

  SELECT * INTO _invite FROM public.tenant_invite_tokens
  WHERE id = _invite_id AND tenant_id = _tenant AND kind = 'team'
  FOR UPDATE;

  IF _invite.id IS NULL THEN
    RAISE EXCEPTION 'that invitation is not on this workspace' USING ERRCODE = 'P0001';
  END IF;

  -- A LIVE invitation is a working access grant sitting in somebody's inbox. Hiding it from the
  -- list would leave a token nobody is watching, which is the opposite of what this feature is for.
  IF _invite.uses = 0 AND _invite.revoked_at IS NULL AND _invite.expires_at > now() THEN
    RAISE EXCEPTION 'that invitation is still live; revoke it before clearing it' USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.tenant_invite_tokens
  SET archived_at = COALESCE(archived_at, now()), updated_at = now()
  WHERE id = _invite_id;

  INSERT INTO public.audit_logs (user_id, entity, action, entity_id, data)
  VALUES (_actor, 'tenant_invite', 'team_invite_archived', _invite_id,
          jsonb_build_object('tenant_id', _tenant));
END;
$function$;

-- Same posture as its three siblings: the browser never calls this directly. The edge function
-- holds the service-role client and passes the actor it authenticated.
REVOKE ALL ON FUNCTION public.archive_solo_team_invite(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.archive_solo_team_invite(uuid, uuid, uuid) TO service_role;

-- ---------------------------------------------------------------------------------------------
-- 3. The roster read reports delivery, and hides what was cleared.
-- ---------------------------------------------------------------------------------------------
-- Re-declared in full because Postgres cannot patch one CTE of a function. The body below is the
-- current definition copied verbatim from 20260901001520_solo_team_workspace.sql with exactly two
-- changes, both inside `invitation_rows`: the delivery join, and the archived filter.

CREATE OR REPLACE FUNCTION public.get_solo_team_workspace(
  _search text DEFAULT NULL,
  _permission text DEFAULT 'all',
  _limit integer DEFAULT 25,
  _offset integer DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  _actor uuid := auth.uid();
  _tenant uuid := public.current_user_tenant_id();
  _viewer_role public.tenant_role;
  _viewer_is_owner boolean := false;
  _can_manage boolean := false;
  _limit_safe integer := LEAST(GREATEST(COALESCE(_limit, 25), 1), 100);
  _offset_safe integer := GREATEST(COALESCE(_offset, 0), 0);
  _result jsonb;
BEGIN
  IF _actor IS NULL THEN
    RAISE EXCEPTION 'authentication required' USING ERRCODE = '42501';
  END IF;
  IF _tenant IS NULL THEN
    RAISE EXCEPTION 'no active workspace' USING ERRCODE = '42501';
  END IF;

  SELECT tm.role, (tm.is_owner OR tm.role = 'owner'::public.tenant_role)
    INTO _viewer_role, _viewer_is_owner
  FROM public.tenant_members tm
  WHERE tm.tenant_id = _tenant
    AND tm.user_id = _actor
    AND tm.status = 'active'
  LIMIT 1;

  IF _viewer_role IS NULL THEN
    RAISE EXCEPTION 'team roster access denied' USING ERRCODE = '42501';
  END IF;
  _can_manage := _viewer_is_owner OR _viewer_role = 'admin'::public.tenant_role;

  WITH filtered AS (
    SELECT
      tm.id AS membership_id,
      tm.user_id,
      p.full_name,
      au.email,
      p.avatar_url,
      tm.status,
      tm.role::text AS permission,
      (tm.is_owner OR tm.role = 'owner'::public.tenant_role) AS is_owner,
      tm.job_title,
      tm.responsibilities,
      au.last_sign_in_at
    FROM public.tenant_members tm
    LEFT JOIN public.profiles p ON p.user_id = tm.user_id
    LEFT JOIN auth.users au ON au.id = tm.user_id
    WHERE tm.tenant_id = _tenant
      AND tm.status IN ('active', 'suspended')
      AND (
        COALESCE(NULLIF(lower(trim(_permission)), ''), 'all') = 'all'
        OR CASE
          WHEN tm.is_owner OR tm.role = 'owner'::public.tenant_role THEN 'owner'
          ELSE tm.role::text
        END = lower(trim(_permission))
      )
      AND (
        NULLIF(trim(_search), '') IS NULL
        OR COALESCE(p.full_name, '') ILIKE '%' || trim(_search) || '%'
        OR COALESCE(au.email, '') ILIKE '%' || trim(_search) || '%'
        OR COALESCE(tm.job_title, '') ILIKE '%' || trim(_search) || '%'
        OR COALESCE(tm.responsibilities, '') ILIKE '%' || trim(_search) || '%'
      )
  ), page AS (
    SELECT * FROM filtered
    ORDER BY is_owner DESC, lower(COALESCE(full_name, email, '')), user_id
    LIMIT _limit_safe OFFSET _offset_safe
  ), invitation_rows AS (
    SELECT ti.id, ti.email, ti.default_role::text AS permission, ti.created_at,
           ti.expires_at, ti.revoked_at, ti.uses,
           NULL::text AS token,
           -- DELIVERY, JOINED SERVER-SIDE AND NEVER EXPOSED AS A TABLE. `email_send_log` is
           -- platform-wide and carries every tenant's recipients; a browser must never read it.
           -- The join is inside this SECURITY DEFINER function, filtered to invitations of the
           -- caller's own workspace, so an owner learns about their own invitation and nothing else.
           d.delivery
    FROM public.tenant_invite_tokens ti
    LEFT JOIN LATERAL (
      SELECT jsonb_build_object(
               'status', l.status,
               'at', l.created_at,
               'error', l.error_message,
               -- The full ordered history, so the screen can show a timeline rather than one word.
               'history', COALESCE((
                 SELECT jsonb_agg(jsonb_build_object('status', h.status, 'at', h.created_at)
                                  ORDER BY h.created_at)
                 FROM public.email_send_log h
                 WHERE h.metadata->>'invite_id' = ti.id::text
               ), '[]'::jsonb)
             ) AS delivery
      FROM public.email_send_log l
      WHERE l.metadata->>'invite_id' = ti.id::text
      -- The LATEST event decides the headline status. `created_at DESC` alone is not enough:
      -- two events can share a timestamp, and 'sent' arriving after 'delivered' would then read
      -- as a regression. Rank breaks that tie by how far through the journey each status is.
      ORDER BY l.created_at DESC, public.email_delivery_rank(l.status) DESC
      LIMIT 1
    ) d ON true
    WHERE ti.tenant_id = _tenant AND ti.kind = 'team'
      -- Archived invitations are cleared from the operator's list by their own deliberate act.
      -- The row survives, because a revoked invitation is evidence that access was withdrawn.
      AND ti.archived_at IS NULL
    ORDER BY ti.created_at DESC
    LIMIT 100
  )
  SELECT jsonb_build_object(
    'tenant_id', _tenant,
    'tenant_name', t.name,
    'viewer_permission', CASE WHEN _viewer_is_owner THEN 'owner' ELSE _viewer_role::text END,
    'can_manage_profiles', _can_manage,
    'can_manage_invitations', _can_manage,
    'can_change_permissions', _viewer_is_owner,
    'total_members', (SELECT count(*) FROM filtered),
    'members', COALESCE((SELECT jsonb_agg(to_jsonb(page)) FROM page), '[]'::jsonb),
    'invitations', CASE WHEN _can_manage
      THEN COALESCE((SELECT jsonb_agg(to_jsonb(invitation_rows)) FROM invitation_rows), '[]'::jsonb)
      ELSE '[]'::jsonb END
  ) INTO _result
  FROM public.tenants t
  WHERE t.id = _tenant;

  RETURN _result;
END;
$function$;
