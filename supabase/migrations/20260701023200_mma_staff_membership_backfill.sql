-- Data repair companion for the live MMA tenant slug (`mma`).
-- Ensures staff-role users that were granted app roles directly also have
-- tenant membership, which tenant-scoped RLS requires for pipeline visibility.

WITH mma AS (
  SELECT id AS tenant_id
  FROM public.tenants
  WHERE id = 'a25194e0-93c4-4e2c-91d0-66ea012660b2'::uuid
     OR slug IN ('mma','mogul-maker-academy')
     OR name = 'Mogul Maker Academy'
  ORDER BY CASE WHEN id = 'a25194e0-93c4-4e2c-91d0-66ea012660b2'::uuid THEN 0 ELSE 1 END
  LIMIT 1
), direct_staff AS (
  SELECT DISTINCT ur.user_id,
         CASE
           WHEN bool_or(ur.role = 'admin'::public.app_role) THEN 'admin'::public.tenant_role
           WHEN bool_or(ur.role = 'coach'::public.app_role) THEN 'coach'::public.tenant_role
           ELSE 'member'::public.tenant_role
         END AS tenant_role
  FROM public.user_roles ur
  JOIN auth.users u ON u.id = ur.user_id
  CROSS JOIN mma
  LEFT JOIN public.tenant_members tm ON tm.tenant_id = mma.tenant_id AND tm.user_id = ur.user_id
  WHERE tm.id IS NULL
    AND ur.role IN ('admin'::public.app_role, 'coach'::public.app_role, 'sales_rep'::public.app_role,
                    'broker'::public.app_role, 'broker_team_member'::public.app_role, 'cs_rep'::public.app_role,
                    'finance'::public.app_role, 'viewer'::public.app_role, 'moderator'::public.app_role)
    AND ur.role <> 'super_admin'::public.app_role
  GROUP BY ur.user_id
), inserted AS (
  INSERT INTO public.tenant_members (tenant_id, user_id, role, status, invited_at, joined_at)
  SELECT mma.tenant_id, ds.user_id, ds.tenant_role, 'active', now(), now()
  FROM direct_staff ds
  CROSS JOIN mma
  ON CONFLICT (tenant_id, user_id) DO NOTHING
  RETURNING tenant_id, user_id
)
UPDATE public.profiles p
   SET active_tenant_id = inserted.tenant_id
  FROM inserted
 WHERE p.user_id = inserted.user_id
   AND p.active_tenant_id IS NULL;
