
CREATE OR REPLACE FUNCTION public.notify_approval_event()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  _event text;
  _project_url text := 'https://bfmyebsjyuoecmjskqhs.supabase.co';
  _service_key text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status IS NULL OR NEW.status = 'pending' THEN
      _event := 'created';
    ELSE
      RETURN NEW;
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.status = 'changes_requested' AND (OLD.status IS DISTINCT FROM 'changes_requested') THEN
      _event := 'changes_requested';
    ELSE
      RETURN NEW;
    END IF;
  ELSE
    RETURN NEW;
  END IF;

  SELECT value INTO _service_key FROM public._internal_secrets WHERE key = 'service_role_key' LIMIT 1;
  IF _service_key IS NULL THEN
    RAISE WARNING 'notify_approval_event: no service_role_key in _internal_secrets';
    RETURN NEW;
  END IF;

  PERFORM extensions.http_post(
    url := _project_url || '/functions/v1/notify-approval-event',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || _service_key
    ),
    body := jsonb_build_object(
      'event', _event,
      'approval_id', NEW.id,
      'rationale', NEW.decision_rationale
    )::text
  );

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'notify_approval_event failed: %', SQLERRM;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_approval_insert ON public.paige_pending_approvals;
CREATE TRIGGER trg_notify_approval_insert
AFTER INSERT ON public.paige_pending_approvals
FOR EACH ROW EXECUTE FUNCTION public.notify_approval_event();

DROP TRIGGER IF EXISTS trg_notify_approval_changes ON public.paige_pending_approvals;
CREATE TRIGGER trg_notify_approval_changes
AFTER UPDATE OF status ON public.paige_pending_approvals
FOR EACH ROW EXECUTE FUNCTION public.notify_approval_event();
