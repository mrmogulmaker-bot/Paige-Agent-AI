-- An invitation is sent to the workspace the operator NAMED — never to one the server guessed.
--
-- THE DEFECT. `create_/resend_/revoke_solo_team_invite` read `profiles.active_tenant_id` RAW, while
-- `get_solo_team_workspace` (the read that decides whether the Invite button is even offered) uses
-- `current_user_tenant_id()`. That resolver COALESCEs: when the raw column is null or not entitled,
-- it falls back to the caller's earliest active membership. The two disagree, and the disagreement
-- has a victim: a sole OWNER whose `active_tenant_id` is null reads their own roster perfectly, is
-- offered the Invite button, and is then told
--
--     "only an owner or admin may invite team members"
--
-- about a workspace they own. The statement is false about the person it is addressed to.
--
-- The null-pointer population is real and is manufactured continuously: `operator_provision_tenant`
-- never writes the column, `handle_new_user` inserts a bare shell, `useTenantContext` computes a
-- working value for the UI and then declines to persist it (for a sole-membership owner the
-- would-be write is skipped, so the null survives every login indefinitely), tenant deletion SET
-- NULLs it, and removing somebody from a workspace clears it by design.
--
-- WHY NOT SIMPLY CALL `current_user_tenant_id()`. Because it would break all three functions for
-- every caller, 100% of the time. That resolver keys on `auth.uid()`; these functions are REVOKEd
-- from `authenticated` and granted to `service_role` alone, invoked by the `solo-team-invitations`
-- edge function with a service-role client. Inside them `auth.uid()` is NULL — which is exactly why
-- they already carry an `_actor` parameter. The literal substitution turns a bug that affects some
-- owners into an outage that affects all of them.
--
-- WHY NOT INHERIT ITS FALLBACK EITHER. `current_user_tenant_id()`'s second arm picks the earliest
-- active membership (`ORDER BY joined_at ASC LIMIT 1`). For a roster READ a guess is cheap and
-- self-correcting — the screen shows a name and the person sees where they are. For an INVITATION
-- the same guess emails a stranger a live 7-day access token into a workspace the operator never
-- named, and returns success. A guess is acceptable only where a harmless read can self-correct.
-- (`joined_at` is also not a total order, so two memberships sharing a timestamp make the guess
-- nondeterministic — the defect class recorded as the §51 anchor #588.)
--
-- THE REPAIR. The intended Team flow already knows which workspace it is looking at:
-- `get_solo_team_workspace` returns `tenant_id`, and the screen renders that workspace's name. That
-- identifier is now passed in and VERIFIED — never trusted. `_expected_tenant_id` can only ever
-- REFUSE a call; it can never select a workspace, because authority is proved from
-- `tenant_members` for the named actor in that exact workspace. Missing, wrong-workspace,
-- non-member, non-owner, non-admin, suspended and unknown-actor all fail closed, and a stale
-- `profiles.active_tenant_id` is now structurally incapable of steering an invitation because no
-- invitation function reads it any more.
--
-- §59 NOTE ON THE `_actor` PARAMETER. Trusting a caller-supplied identity is normally a total auth
-- bypass. It is safe here for exactly two reasons, and both must remain true: the functions are
-- unreachable from `authenticated` (service_role EXECUTE only), and their single caller derives
-- `_actor` from a JWT it verified itself (`solo-team-invitations/index.ts` — `getUser()` before any
-- RPC). If either fact ever changes, `_actor` must become `auth.uid()` or the grant must be undone.

-- ── The one home for invitation authority ────────────────────────────────────────────────────────
-- SECURITY INVOKER on purpose. Called from inside the SECURITY DEFINER functions below it runs with
-- their privileges and reads what it needs; called directly by anyone else, RLS applies and it fails
-- closed on its own. It is given no elevated grant of its own to leak.
CREATE OR REPLACE FUNCTION public.solo_team_invite_authority(
  _actor uuid,
  _expected_tenant_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  _tenant uuid;
BEGIN
  IF _actor IS NULL THEN
    RAISE EXCEPTION 'not authorized to manage team invitations' USING ERRCODE = '42501';
  END IF;

  -- The workspace must be NAMED. Falling back to a guess is the defect this function exists to end,
  -- so an unnamed workspace is a refusal rather than an invitation to choose one.
  IF _expected_tenant_id IS NULL THEN
    RAISE EXCEPTION 'the workspace for this invitation was not named' USING ERRCODE = '42501';
  END IF;

  -- Authority is proved in THAT EXACT workspace. This is the whole guard: no COALESCE, no ORDER BY,
  -- no LIMIT, nothing that could resolve to a different workspace than the one passed in.
  SELECT tm.tenant_id INTO _tenant
  FROM public.tenant_members tm
  WHERE tm.tenant_id = _expected_tenant_id
    AND tm.user_id = _actor
    AND tm.status = 'active'
    AND (tm.is_owner OR tm.role IN ('owner'::public.tenant_role, 'admin'::public.tenant_role));

  IF _tenant IS NULL THEN
    RAISE EXCEPTION 'only an owner or admin may manage team invitations in that workspace'
      USING ERRCODE = '42501';
  END IF;

  RETURN _tenant;
END;
$function$;

COMMENT ON FUNCTION public.solo_team_invite_authority(uuid, uuid) IS
  'Resolves and PROVES an actor''s invitation authority in a workspace they named. Refusal-only: the '
  'expected workspace can abort a call and can never select one. Never reads profiles.active_tenant_id.';

REVOKE ALL ON FUNCTION public.solo_team_invite_authority(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.solo_team_invite_authority(uuid, uuid) TO service_role;

-- ── The three invitation functions, re-bodied onto that resolver ─────────────────────────────────
-- The previous signatures are DROPPED, not left beside the new ones. PostgREST resolves an overload
-- by the argument names supplied, so leaving the 5-argument form alive would leave the guessing path
-- callable — the vulnerability would still be one omitted parameter away.
DROP FUNCTION IF EXISTS public.create_solo_team_invite(uuid, text, text, text, text);
DROP FUNCTION IF EXISTS public.resend_solo_team_invite(uuid, uuid);
DROP FUNCTION IF EXISTS public.revoke_solo_team_invite(uuid, uuid);

CREATE OR REPLACE FUNCTION public.create_solo_team_invite(
  _actor uuid,
  _expected_tenant_id uuid,
  _email text,
  _permission text DEFAULT 'member',
  _job_title text DEFAULT NULL,
  _responsibilities text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  _tenant uuid;
  _token text;
  _row public.tenant_invite_tokens;
BEGIN
  _tenant := public.solo_team_invite_authority(_actor, _expected_tenant_id);

  IF lower(trim(_permission)) NOT IN ('admin', 'member') THEN
    RAISE EXCEPTION 'team invitations may grant only Admin or Member';
  END IF;
  IF NULLIF(lower(trim(_email)), '') IS NULL OR trim(_email) !~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' THEN
    RAISE EXCEPTION 'a valid email address is required';
  END IF;
  IF char_length(COALESCE(trim(_job_title), '')) > 120 OR char_length(COALESCE(trim(_responsibilities), '')) > 2000 THEN
    RAISE EXCEPTION 'work profile is too long';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public.tenant_members tm
    JOIN auth.users au ON au.id = tm.user_id
    WHERE tm.tenant_id = _tenant AND lower(au.email) = lower(trim(_email))
  ) THEN
    RAISE EXCEPTION 'this person already belongs to the workspace';
  END IF;

  -- One live invitation per tenant/email. Replacing a pending invite makes its
  -- previous token unusable before the new token is returned.
  UPDATE public.tenant_invite_tokens
  SET revoked_at = now(), updated_at = now()
  WHERE tenant_id = _tenant AND kind = 'team'
    AND lower(email) = lower(trim(_email))
    AND uses = 0 AND revoked_at IS NULL AND expires_at > now();

  _token := replace(replace(replace(encode(extensions.gen_random_bytes(24), 'base64'), '+', '-'), '/', '_'), '=', '');
  INSERT INTO public.tenant_invite_tokens
    (tenant_id, token, kind, default_role, created_by, expires_at, max_uses, email, job_title, responsibilities)
  VALUES
    (_tenant, _token, 'team', lower(trim(_permission))::public.tenant_role, _actor,
     now() + interval '7 days', 1, lower(trim(_email)), NULLIF(trim(_job_title), ''), NULLIF(trim(_responsibilities), ''))
  RETURNING * INTO _row;

  INSERT INTO public.audit_logs (user_id, entity, action, entity_id, data)
  VALUES (_actor, 'tenant_invite', 'team_invite_created', _row.id,
          jsonb_build_object('tenant_id', _tenant, 'permission', lower(trim(_permission))));
  -- `tenant_id` is returned so the caller can prove the invitation landed where it asked. A screen
  -- that sent workspace A and is handed back workspace B has been redirected, and should say so
  -- rather than report a success it cannot vouch for.
  RETURN jsonb_build_object('id', _row.id, 'token', _token, 'email', _row.email,
                            'expires_at', _row.expires_at, 'tenant_id', _tenant);
END;
$function$;

REVOKE ALL ON FUNCTION public.create_solo_team_invite(uuid, uuid, text, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_solo_team_invite(uuid, uuid, text, text, text, text) TO service_role;

CREATE OR REPLACE FUNCTION public.resend_solo_team_invite(
  _actor uuid,
  _expected_tenant_id uuid,
  _invite_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  _tenant uuid;
  _old public.tenant_invite_tokens;
BEGIN
  _tenant := public.solo_team_invite_authority(_actor, _expected_tenant_id);

  -- `tenant_id = _tenant` is what makes an invitation in another workspace invisible here rather
  -- than merely forbidden: a resend cannot reach across a workspace boundary even by id.
  SELECT * INTO _old FROM public.tenant_invite_tokens
  WHERE id = _invite_id AND tenant_id = _tenant AND kind = 'team' FOR UPDATE;
  IF _old.id IS NULL THEN RAISE EXCEPTION 'team invitation not found'; END IF;
  IF _old.uses > 0 THEN RAISE EXCEPTION 'an accepted invitation cannot be resent'; END IF;
  UPDATE public.tenant_invite_tokens SET revoked_at = COALESCE(revoked_at, now()), updated_at = now() WHERE id = _old.id;
  -- The re-entry carries the SAME proved workspace, so a resend can never resolve differently from
  -- the create it delegates to.
  RETURN public.create_solo_team_invite(_actor, _tenant, _old.email, _old.default_role::text, _old.job_title, _old.responsibilities);
END;
$function$;

REVOKE ALL ON FUNCTION public.resend_solo_team_invite(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.resend_solo_team_invite(uuid, uuid, uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.revoke_solo_team_invite(
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
BEGIN
  _tenant := public.solo_team_invite_authority(_actor, _expected_tenant_id);

  UPDATE public.tenant_invite_tokens
  SET revoked_at = COALESCE(revoked_at, now()), updated_at = now()
  WHERE id = _invite_id AND tenant_id = _tenant AND kind = 'team' AND uses = 0;
  IF NOT FOUND THEN RAISE EXCEPTION 'pending team invitation not found'; END IF;
  INSERT INTO public.audit_logs (user_id, entity, action, entity_id, data)
  VALUES (_actor, 'tenant_invite', 'team_invite_revoked', _invite_id, jsonb_build_object('tenant_id', _tenant));
END;
$function$;

REVOKE ALL ON FUNCTION public.revoke_solo_team_invite(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_solo_team_invite(uuid, uuid, uuid) TO service_role;
