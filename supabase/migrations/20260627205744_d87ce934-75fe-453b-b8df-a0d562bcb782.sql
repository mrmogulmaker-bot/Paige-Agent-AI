
-- Phase 6: Paige Bridge support

-- a. widen pending_approvals status (add 'stale') and type (add 'qc_finding','milestone')
ALTER TABLE public.paige_pending_approvals DROP CONSTRAINT IF EXISTS paige_pending_approvals_status_check;
ALTER TABLE public.paige_pending_approvals
  ADD CONSTRAINT paige_pending_approvals_status_check
  CHECK (status = ANY (ARRAY['pending','approved','edited','skipped','escalated','stale']));

ALTER TABLE public.paige_pending_approvals DROP CONSTRAINT IF EXISTS paige_pending_approvals_type_check;
ALTER TABLE public.paige_pending_approvals
  ADD CONSTRAINT paige_pending_approvals_type_check
  CHECK (type = ANY (ARRAY['cs_draft','campaign_send','tier_change','qc_finding','milestone','other']));

-- b. metadata jsonb on approvals (open question A — going with it)
ALTER TABLE public.paige_pending_approvals
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

-- c. paige_admin_notifications
CREATE TABLE IF NOT EXISTS public.paige_admin_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  severity text NOT NULL DEFAULT 'info' CHECK (severity IN ('info','warning','urgent')),
  title text NOT NULL,
  body text,
  link_to text,
  source_workflow_key text,
  contact_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, UPDATE ON public.paige_admin_notifications TO authenticated;
GRANT ALL ON public.paige_admin_notifications TO service_role;

ALTER TABLE public.paige_admin_notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins and coaches view notifications" ON public.paige_admin_notifications;
CREATE POLICY "Admins and coaches view notifications"
  ON public.paige_admin_notifications FOR SELECT
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'coach'::app_role));

DROP POLICY IF EXISTS "Admins and coaches mark read" ON public.paige_admin_notifications;
CREATE POLICY "Admins and coaches mark read"
  ON public.paige_admin_notifications FOR UPDATE
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'coach'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'coach'::app_role));

CREATE INDEX IF NOT EXISTS idx_paige_admin_notifications_unread
  ON public.paige_admin_notifications (created_at DESC)
  WHERE read_at IS NULL;

ALTER PUBLICATION supabase_realtime ADD TABLE public.paige_admin_notifications;

-- d. approval queue counts RPC
CREATE OR REPLACE FUNCTION public.get_approval_queue_counts()
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _pending int;
  _by_type jsonb;
BEGIN
  SELECT count(*) INTO _pending
  FROM public.paige_pending_approvals
  WHERE status = 'pending';

  SELECT COALESCE(jsonb_object_agg(type, ct), '{}'::jsonb) INTO _by_type
  FROM (
    SELECT type, count(*) AS ct
    FROM public.paige_pending_approvals
    WHERE status = 'pending'
    GROUP BY type
  ) s;

  RETURN jsonb_build_object('pending', _pending, 'by_type', _by_type);
END;
$$;

REVOKE ALL ON FUNCTION public.get_approval_queue_counts() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_approval_queue_counts() TO service_role;
