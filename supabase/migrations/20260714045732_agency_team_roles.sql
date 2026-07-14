-- Recovered from the live migration ledger (supabase_migrations.schema_migrations.statements)
-- and committed for durability: this migration is APPLIED on prod but existed in no git file,
-- so a rebuild-from-git would silently drop it (drift audit 2026-07-14, prod-ahead-of-git).
-- SQL is verbatim from the ledger unless a marked adjustment note says otherwise.

BEGIN;

CREATE TABLE IF NOT EXISTS public.agency_team_members (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_tenant_id   uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id            uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  email              text,
  agency_role        text NOT NULL CHECK (agency_role IN
                       ('agency_owner','agency_admin','agency_manager','agency_biller','agency_specialist','agency_viewer')),
  status             text NOT NULL DEFAULT 'active' CHECK (status IN ('active','invited','suspended')),
  scoped_subaccounts uuid[] NOT NULL DEFAULT '{}',
  invited_by         uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  invited_at         timestamptz,
  joined_at          timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS agency_team_members_agency_user_uidx
  ON public.agency_team_members (agency_tenant_id, user_id) WHERE user_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS agency_team_members_agency_email_uidx
  ON public.agency_team_members (agency_tenant_id, lower(email)) WHERE user_id IS NULL AND email IS NOT NULL;
CREATE INDEX IF NOT EXISTS agency_team_members_user_idx ON public.agency_team_members (user_id) WHERE user_id IS NOT NULL;

COMMENT ON TABLE public.agency_team_members IS
  'Agency-tier team roster (§9): people who help run an AGENCY''s book of sub-accounts, with an agency-distinct role taxonomy — separate from tenant/sub-account STAFF_ROLES.';

CREATE OR REPLACE FUNCTION public.tg_agency_team_touch()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END; $$;
DROP TRIGGER IF EXISTS trg_agency_team_touch ON public.agency_team_members;
CREATE TRIGGER trg_agency_team_touch BEFORE UPDATE ON public.agency_team_members
  FOR EACH ROW EXECUTE FUNCTION public.tg_agency_team_touch();

INSERT INTO public.agency_team_members (agency_tenant_id, user_id, agency_role, status, joined_at)
SELECT t.id, m.user_id,
       CASE WHEN m.role = 'owner' THEN 'agency_owner' ELSE 'agency_admin' END,
       'active', COALESCE(m.joined_at, now())
FROM public.tenants t
JOIN public.tenant_members m ON m.tenant_id = t.id
WHERE t.account_type IN ('agency','enterprise')
  AND m.status = 'active'
  AND m.role IN ('owner','admin')
ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION public.agency_current_id(_actor uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT COALESCE(
    (SELECT t.id FROM public.tenant_members m JOIN public.tenants t ON t.id = m.tenant_id
       WHERE m.user_id = _actor AND m.status = 'active' AND m.role IN ('owner','admin')
         AND t.account_type IN ('agency','enterprise')
       ORDER BY m.joined_at ASC NULLS LAST, t.created_at ASC LIMIT 1),
    (SELECT atm.agency_tenant_id FROM public.agency_team_members atm
       WHERE atm.user_id = _actor AND atm.status = 'active'
       ORDER BY atm.joined_at ASC NULLS LAST LIMIT 1)
  );
$$;

CREATE OR REPLACE FUNCTION public.agency_team_role(_agency uuid, _actor uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT CASE
    WHEN EXISTS (SELECT 1 FROM public.tenant_members m
                  WHERE m.tenant_id = _agency AND m.user_id = _actor AND m.status = 'active' AND m.role = 'owner')
      THEN 'agency_owner'
    ELSE COALESCE(
      (SELECT atm.agency_role FROM public.agency_team_members atm
         WHERE atm.agency_tenant_id = _agency AND atm.user_id = _actor AND atm.status = 'active' LIMIT 1),
      (SELECT 'agency_admin' FROM public.tenant_members m
         WHERE m.tenant_id = _agency AND m.user_id = _actor AND m.status = 'active' AND m.role = 'admin' LIMIT 1)
    )
  END;
$$;

CREATE OR REPLACE FUNCTION public.agency_team_can_manage(_agency uuid, _actor uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT public.agency_team_role(_agency, _actor) IN ('agency_owner','agency_admin');
$$;

REVOKE ALL ON FUNCTION public.agency_current_id(uuid)      FROM public;
REVOKE ALL ON FUNCTION public.agency_team_role(uuid, uuid) FROM public;
REVOKE ALL ON FUNCTION public.agency_team_can_manage(uuid, uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.agency_current_id(uuid)      TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.agency_team_role(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.agency_team_can_manage(uuid, uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.agency_can_manage_child(_child uuid, _actor uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT
    EXISTS (
      SELECT 1
      FROM public.tenants child
      JOIN public.tenants parent    ON parent.id = child.parent_tenant_id
      JOIN public.tenant_members pm ON pm.tenant_id = parent.id AND pm.user_id = _actor
      WHERE child.id = _child
        AND parent.account_type IN ('agency', 'enterprise')
        AND pm.status = 'active'
        AND pm.role IN ('owner', 'admin')
    )
    OR EXISTS (
      SELECT 1
      FROM public.tenants child
      JOIN public.agency_team_members atm ON atm.agency_tenant_id = child.parent_tenant_id
      WHERE child.id = _child
        AND atm.user_id = _actor
        AND atm.status = 'active'
        AND (
          atm.agency_role IN ('agency_owner','agency_admin','agency_manager')
          OR (atm.agency_role = 'agency_specialist' AND _child = ANY (atm.scoped_subaccounts))
        )
    );
$$;

ALTER TABLE public.agency_team_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS agency_team_select ON public.agency_team_members;
CREATE POLICY agency_team_select ON public.agency_team_members
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.tenant_members m
      WHERE m.tenant_id = agency_team_members.agency_tenant_id
        AND m.user_id = auth.uid() AND m.status = 'active' AND m.role IN ('owner','admin')
    )
  );

CREATE OR REPLACE FUNCTION public.agency_list_team()
RETURNS TABLE (
  user_id uuid, email text, full_name text, agency_role text, status text,
  scoped_count int, is_you boolean, joined_at timestamptz
)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  _me     uuid := auth.uid();
  _agency uuid := public.agency_current_id(auth.uid());
BEGIN
  IF _me IS NULL OR _agency IS NULL THEN RETURN; END IF;
  IF public.agency_team_role(_agency, _me) IS NULL THEN RETURN; END IF;

  INSERT INTO public.agency_team_members (agency_tenant_id, user_id, agency_role, status, joined_at)
  SELECT _agency, m.user_id, 'agency_owner', 'active', COALESCE(m.joined_at, now())
  FROM public.tenant_members m
  WHERE m.tenant_id = _agency AND m.status = 'active' AND m.role = 'owner'
  ON CONFLICT DO NOTHING;

  RETURN QUERY
  SELECT atm.user_id,
         COALESCE(atm.email, u.email) AS email,
         p.full_name,
         atm.agency_role, atm.status,
         COALESCE(array_length(atm.scoped_subaccounts, 1), 0) AS scoped_count,
         (atm.user_id = _me) AS is_you,
         atm.joined_at
  FROM public.agency_team_members atm
  LEFT JOIN auth.users u   ON u.id = atm.user_id
  LEFT JOIN public.profiles p ON p.user_id = atm.user_id
  WHERE atm.agency_tenant_id = _agency
  ORDER BY
    CASE atm.agency_role
      WHEN 'agency_owner' THEN 0 WHEN 'agency_admin' THEN 1 WHEN 'agency_manager' THEN 2
      WHEN 'agency_biller' THEN 3 WHEN 'agency_specialist' THEN 4 ELSE 5 END,
    p.full_name NULLS LAST, atm.created_at;
END;
$$;

CREATE OR REPLACE FUNCTION public.agency_set_member_role(
  _target_user uuid, _role text, _scoped uuid[] DEFAULT '{}'
)
RETURNS void LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  _me uuid := auth.uid();
  _agency uuid := public.agency_current_id(auth.uid());
BEGIN
  IF _agency IS NULL OR NOT public.agency_team_can_manage(_agency, _me) THEN
    RAISE EXCEPTION 'Only an agency owner or admin can change team roles' USING ERRCODE = '42501';
  END IF;
  IF _role NOT IN ('agency_admin','agency_manager','agency_biller','agency_specialist','agency_viewer') THEN
    RAISE EXCEPTION 'Invalid or non-assignable agency role: %', _role USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM public.tenant_members m
             WHERE m.tenant_id = _agency AND m.user_id = _target_user AND m.status='active' AND m.role='owner') THEN
    RAISE EXCEPTION 'The agency owner''s role cannot be changed here' USING ERRCODE = '42501';
  END IF;

  UPDATE public.agency_team_members
     SET agency_role = _role,
         scoped_subaccounts = CASE WHEN _role = 'agency_specialist' THEN COALESCE(_scoped, '{}') ELSE '{}' END
   WHERE agency_tenant_id = _agency AND user_id = _target_user;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'That person is not on this agency''s team' USING ERRCODE = 'P0002';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.agency_set_member_status(_target_user uuid, _status text)
RETURNS void LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  _me uuid := auth.uid();
  _agency uuid := public.agency_current_id(auth.uid());
BEGIN
  IF _agency IS NULL OR NOT public.agency_team_can_manage(_agency, _me) THEN
    RAISE EXCEPTION 'Only an agency owner or admin can change member status' USING ERRCODE = '42501';
  END IF;
  IF _status NOT IN ('active','suspended') THEN
    RAISE EXCEPTION 'Invalid status: %', _status USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM public.tenant_members m
             WHERE m.tenant_id = _agency AND m.user_id = _target_user AND m.status='active' AND m.role='owner') THEN
    RAISE EXCEPTION 'The agency owner cannot be suspended' USING ERRCODE = '42501';
  END IF;
  UPDATE public.agency_team_members SET status = _status
   WHERE agency_tenant_id = _agency AND user_id = _target_user;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'That person is not on this agency''s team' USING ERRCODE = 'P0002';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.agency_remove_member(_target_user uuid)
RETURNS void LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  _me uuid := auth.uid();
  _agency uuid := public.agency_current_id(auth.uid());
BEGIN
  IF _agency IS NULL OR NOT public.agency_team_can_manage(_agency, _me) THEN
    RAISE EXCEPTION 'Only an agency owner or admin can remove team members' USING ERRCODE = '42501';
  END IF;
  IF _target_user = _me THEN
    RAISE EXCEPTION 'You cannot remove yourself from the agency team' USING ERRCODE = '42501';
  END IF;
  IF EXISTS (SELECT 1 FROM public.tenant_members m
             WHERE m.tenant_id = _agency AND m.user_id = _target_user AND m.status='active' AND m.role='owner') THEN
    RAISE EXCEPTION 'The agency owner cannot be removed' USING ERRCODE = '42501';
  END IF;
  DELETE FROM public.agency_team_members
   WHERE agency_tenant_id = _agency AND user_id = _target_user;
END;
$$;

CREATE OR REPLACE FUNCTION public.agency_my_membership()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT jsonb_build_object(
    'agency_id', a.agency_id,
    'agency_role', CASE WHEN a.agency_id IS NULL THEN NULL ELSE public.agency_team_role(a.agency_id, auth.uid()) END,
    'can_manage_team', CASE WHEN a.agency_id IS NULL THEN false ELSE public.agency_team_can_manage(a.agency_id, auth.uid()) END
  )
  FROM (SELECT public.agency_current_id(auth.uid()) AS agency_id) a;
$$;

REVOKE ALL ON FUNCTION public.agency_list_team()                         FROM public;
REVOKE ALL ON FUNCTION public.agency_set_member_role(uuid, text, uuid[]) FROM public;
REVOKE ALL ON FUNCTION public.agency_set_member_status(uuid, text)       FROM public;
REVOKE ALL ON FUNCTION public.agency_remove_member(uuid)                 FROM public;
REVOKE ALL ON FUNCTION public.agency_my_membership()                     FROM public;
GRANT EXECUTE ON FUNCTION public.agency_list_team()                         TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.agency_set_member_role(uuid, text, uuid[]) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.agency_set_member_status(uuid, text)       TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.agency_remove_member(uuid)                 TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.agency_my_membership()                     TO authenticated, service_role;

COMMIT;
