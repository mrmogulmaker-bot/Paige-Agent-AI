
-- 1. clients additions
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS tier text,
  ADD COLUMN IF NOT EXISTS ghl_contact_id text,
  ADD COLUMN IF NOT EXISTS last_mirrored_at timestamptz,
  ADD COLUMN IF NOT EXISTS mirror_source text;

ALTER TABLE public.clients DROP CONSTRAINT IF EXISTS clients_tier_chk;
ALTER TABLE public.clients ADD CONSTRAINT clients_tier_chk
  CHECK (tier IS NULL OR tier IN ('lead','standard','premium','vip','internal','staff','free'));

ALTER TABLE public.clients DROP CONSTRAINT IF EXISTS clients_mirror_source_chk;
ALTER TABLE public.clients ADD CONSTRAINT clients_mirror_source_chk
  CHECK (mirror_source IS NULL OR mirror_source IN ('mma_os','manual','ghl_legacy','paige_ui'));

CREATE UNIQUE INDEX IF NOT EXISTS clients_ghl_contact_id_uniq
  ON public.clients (ghl_contact_id) WHERE ghl_contact_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_clients_tier ON public.clients (tier) WHERE tier IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_clients_mirror_source ON public.clients (mirror_source) WHERE mirror_source IS NOT NULL;

-- 2. admin notifications: scope/assigned_user already present; just add constraint (include legacy 'admin')
ALTER TABLE public.paige_admin_notifications
  DROP CONSTRAINT IF EXISTS paige_admin_notifications_scope_chk;
ALTER TABLE public.paige_admin_notifications
  ADD CONSTRAINT paige_admin_notifications_scope_chk
  CHECK (scope IN ('global','admin','role','assigned_user'));

CREATE INDEX IF NOT EXISTS idx_admin_notif_assigned_user
  ON public.paige_admin_notifications (assigned_user_id) WHERE assigned_user_id IS NOT NULL;

-- 3. auto-assignment trigger
CREATE OR REPLACE FUNCTION public.auto_assign_on_mirror()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_role text;
BEGIN
  IF NEW.mirror_source IS DISTINCT FROM 'mma_os' THEN RETURN NEW; END IF;
  IF NEW.tier IN ('premium','vip','internal','staff') THEN
    v_role := 'cs_primary';
  ELSE
    RETURN NEW;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.paige_coach_assignments
    WHERE contact_id = NEW.id AND assigned_role = v_role AND active = true
  ) THEN
    INSERT INTO public.paige_coach_assignments (contact_id, assigned_role, rep_user_id, active, metadata)
    VALUES (NEW.id, v_role, NULL, true, jsonb_build_object('auto', true, 'reason', 'mirror_from_mma_os'));
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_clients_auto_assign ON public.clients;
CREATE TRIGGER trg_clients_auto_assign
  AFTER INSERT OR UPDATE OF tier, mirror_source ON public.clients
  FOR EACH ROW EXECUTE FUNCTION public.auto_assign_on_mirror();

-- 4. unassigned queue view
DROP VIEW IF EXISTS public.paige_unassigned_queue;
CREATE VIEW public.paige_unassigned_queue
WITH (security_invoker = true) AS
SELECT
  c.id, c.email, c.first_name, c.last_name, c.tier, c.ghl_contact_id,
  c.created_at, c.last_mirrored_at,
  EXTRACT(EPOCH FROM (now() - c.created_at)) / 3600.0 AS unassigned_for_hours,
  CASE c.tier
    WHEN 'vip' THEN 1 WHEN 'premium' THEN 2
    WHEN 'internal' THEN 3 WHEN 'staff' THEN 3
    WHEN 'standard' THEN 4 WHEN 'lead' THEN 5
    ELSE 6
  END AS priority_rank
FROM public.clients c
WHERE c.status <> 'archived'
  AND NOT EXISTS (
    SELECT 1 FROM public.paige_coach_assignments pca
    WHERE pca.contact_id = c.id AND pca.active = true
      AND pca.assigned_role IN ('lead_owner','cs_primary')
      AND pca.rep_user_id IS NOT NULL
  )
ORDER BY priority_rank, c.created_at DESC;

GRANT SELECT ON public.paige_unassigned_queue TO authenticated;
GRANT SELECT ON public.paige_unassigned_queue TO service_role;

-- 5. helper for bridge: resolve client by email
CREATE OR REPLACE FUNCTION public.resolve_client_id_by_email(_email text)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT id FROM public.clients
  WHERE email IS NOT NULL AND lower(email) = lower(_email)
  ORDER BY created_at ASC LIMIT 1;
$$;
REVOKE EXECUTE ON FUNCTION public.resolve_client_id_by_email(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resolve_client_id_by_email(text) TO service_role;
