
-- Approval notification trigger
CREATE OR REPLACE FUNCTION public.notify_client_on_readiness_approval()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_linked_user uuid;
  v_first_name text;
BEGIN
  IF NEW.status = 'approved' AND (OLD.status IS DISTINCT FROM 'approved') THEN
    SELECT c.linked_user_id, c.first_name
      INTO v_linked_user, v_first_name
      FROM public.clients c
     WHERE c.id = NEW.contact_id;

    IF v_linked_user IS NOT NULL THEN
      INSERT INTO public.notifications (user_id, type, title, message, action_url, metadata)
      VALUES (
        v_linked_user,
        'system',
        'Your coach has a new readiness update',
        COALESCE(v_first_name, 'Your coach') || ' has a new funding readiness update ready for you to review.',
        '/app',
        jsonb_build_object(
          'source', 'readiness_proposal_approved',
          'proposal_id', NEW.id,
          'tenant_id', NEW.tenant_id
        )
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_readiness_proposal_approval_notify ON public.paige_readiness_proposals;
CREATE TRIGGER trg_readiness_proposal_approval_notify
  AFTER UPDATE ON public.paige_readiness_proposals
  FOR EACH ROW EXECUTE FUNCTION public.notify_client_on_readiness_approval();

REVOKE ALL ON FUNCTION public.notify_client_on_readiness_approval() FROM PUBLIC;

-- Helper: increment scan run counters (called from edge function via RPC)
CREATE OR REPLACE FUNCTION public.increment_readiness_scan_counters(
  _run_id uuid,
  _contacts_scanned int DEFAULT 0,
  _proposals_generated int DEFAULT 0,
  _proposals_insufficient_data int DEFAULT 0,
  _isoftpull_calls int DEFAULT 0,
  _cost_usd numeric DEFAULT 0
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.paige_readiness_scan_runs
     SET contacts_scanned = contacts_scanned + COALESCE(_contacts_scanned, 0),
         proposals_generated = proposals_generated + COALESCE(_proposals_generated, 0),
         proposals_insufficient_data = proposals_insufficient_data + COALESCE(_proposals_insufficient_data, 0),
         isoftpull_calls = isoftpull_calls + COALESCE(_isoftpull_calls, 0),
         cost_usd_total = cost_usd_total + COALESCE(_cost_usd, 0)
   WHERE id = _run_id;
END;
$$;

REVOKE ALL ON FUNCTION public.increment_readiness_scan_counters(uuid, int, int, int, int, numeric) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.increment_readiness_scan_counters(uuid, int, int, int, int, numeric) TO service_role;
