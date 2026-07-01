
CREATE OR REPLACE FUNCTION public.map_tenant_role_to_app_role(_tenant_role tenant_role)
RETURNS app_role LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE _tenant_role
    WHEN 'owner'  THEN 'admin'::app_role
    WHEN 'admin'  THEN 'admin'::app_role
    WHEN 'coach'  THEN 'coach'::app_role
    WHEN 'member' THEN 'user'::app_role
  END
$$;

CREATE OR REPLACE FUNCTION public.sync_tenant_member_to_user_roles()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _new_role app_role;
  _old_role app_role;
BEGIN
  IF TG_OP IN ('INSERT','UPDATE') AND NEW.status = 'active' THEN
    _new_role := public.map_tenant_role_to_app_role(NEW.role);
    IF _new_role IS NOT NULL AND EXISTS (SELECT 1 FROM auth.users u WHERE u.id = NEW.user_id) THEN
      INSERT INTO public.user_roles (user_id, role)
      VALUES (NEW.user_id, _new_role)
      ON CONFLICT (user_id, role) DO NOTHING;
    END IF;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    _old_role := public.map_tenant_role_to_app_role(OLD.role);
    IF _old_role IS NOT NULL
       AND (OLD.role <> NEW.role OR NEW.status <> 'active')
       AND _old_role <> COALESCE(public.map_tenant_role_to_app_role(NEW.role), 'user'::app_role)
    THEN
      IF NOT EXISTS (
        SELECT 1 FROM public.tenant_members tm
        WHERE tm.user_id = OLD.user_id AND tm.status = 'active'
          AND tm.id <> OLD.id
          AND public.map_tenant_role_to_app_role(tm.role) = _old_role
      ) THEN
        DELETE FROM public.user_roles WHERE user_id = OLD.user_id AND role = _old_role;
      END IF;
    END IF;
  END IF;

  IF TG_OP = 'DELETE' THEN
    _old_role := public.map_tenant_role_to_app_role(OLD.role);
    IF _old_role IS NOT NULL THEN
      IF NOT EXISTS (
        SELECT 1 FROM public.tenant_members tm
        WHERE tm.user_id = OLD.user_id AND tm.status = 'active'
          AND public.map_tenant_role_to_app_role(tm.role) = _old_role
      ) THEN
        DELETE FROM public.user_roles WHERE user_id = OLD.user_id AND role = _old_role;
      END IF;
    END IF;
    RETURN OLD;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.sync_tenant_member_to_user_roles() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_sync_tenant_member_to_user_roles ON public.tenant_members;
CREATE TRIGGER trg_sync_tenant_member_to_user_roles
AFTER INSERT OR UPDATE OR DELETE ON public.tenant_members
FOR EACH ROW EXECUTE FUNCTION public.sync_tenant_member_to_user_roles();

-- Backfill only for tenant members whose auth user still exists
INSERT INTO public.user_roles (user_id, role)
SELECT DISTINCT tm.user_id, public.map_tenant_role_to_app_role(tm.role)
FROM public.tenant_members tm
JOIN auth.users u ON u.id = tm.user_id
WHERE tm.status = 'active'
  AND public.map_tenant_role_to_app_role(tm.role) IS NOT NULL
ON CONFLICT (user_id, role) DO NOTHING;
