-- The headline delivery status is the furthest-along event, not the last-inserted one.
--
-- FOUND BY AN INDEPENDENT REVIEW OF THE MERGED DIFF (§39), minutes after #850 merged — which is
-- itself the lesson: that PR was marked ready and merged in the same beat, leaving the peer-gate
-- no window to run before the merge. A green CI never waives it.
--
-- THE DEFECT. `get_solo_team_workspace` ordered the delivery LATERAL by `l.created_at DESC` with
-- `email_delivery_rank` only as a tiebreak for identical timestamps. That is correct only while
-- events arrive in order, and delivery webhooks do not: Resend retries, and a retried `delivered`
-- arriving after a genuine `opened` gets the newest insert time and wins. The operator watches the
-- status regress from Opened to Delivered with no explanation. Worse, `created_at` is the time WE
-- inserted the row, not the time the event happened, so it was never the right clock.
--
-- THE FIX is one clause: rank first, `created_at` second. The rank ladder already encodes the
-- lifecycle (sent < delivery_delayed < delivered < opened < clicked, with suppressed/failed/
-- complained/bounced above them all because a failure outranks any happy-path stage). Nothing else
-- in this function changes: the body below is the one shipped by 20261105000000, extracted from
-- that file programmatically and altered at exactly that one ORDER BY, so no clause can be
-- silently dropped in transcription.

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
      -- THE FURTHEST-ALONG EVENT decides the headline, not the most recently inserted one.
      -- This used to sort `created_at DESC` first with rank as a mere tiebreak, which only held
      -- while events arrived in order. They do not: a provider retry of `delivered` after `opened`
      -- lands with the newest insert time and dragged the headline BACKWARDS to Delivered. And
      -- `created_at` is OUR insert time, not the provider's event time, so it cannot arbitrate
      -- ordering at all. Rank is the real ordering — it encodes how far through the journey each
      -- status is, with failures outranking successes because a bounce or a complaint is the most
      -- important thing to say about an email. `created_at` now only breaks ties within one rank.
      ORDER BY public.email_delivery_rank(l.status) DESC, l.created_at DESC
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
