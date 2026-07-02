
CREATE OR REPLACE FUNCTION public.pmedl_notify_admin()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_dollars NUMERIC;
BEGIN
  v_dollars := ROUND((COALESCE(NEW.quantity,1) * COALESCE(NEW.unit_amount_cents,0))::numeric / 100.0, 2);

  INSERT INTO public.paige_admin_notifications (
    title, body, severity, source_workflow_key, scope
  ) VALUES (
    'Metering dead-letter: ' || NEW.event_type,
    'A metering event failed to write. $' || v_dollars::text || ' at risk. '
      || 'Idempotency key: ' || NEW.idempotency_key
      || '. Attempt #' || NEW.attempt_count::text
      || '. Error: ' || COALESCE(NEW.error_class,'unknown') || ' — ' || COALESCE(NEW.error_message,'')
      || ' [doctrine §205, dead_letter_id=' || NEW.id::text || ']',
    'warning',
    'billing_metering',
    'admin'
  );
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.pmedl_retry_scan()
RETURNS TABLE(picked INTEGER, escalated INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_picked INTEGER := 0;
  v_escalated INTEGER := 0;
BEGIN
  UPDATE public.platform_metered_events_dead_letter
     SET status = 'requires_manual_review'
   WHERE status = 'pending' AND attempt_count >= 10;
  GET DIAGNOSTICS v_escalated = ROW_COUNT;

  SELECT COUNT(*) INTO v_picked
    FROM public.platform_metered_events_dead_letter
   WHERE status = 'pending' AND next_retry_at <= now();

  IF v_escalated > 0 THEN
    INSERT INTO public.paige_admin_notifications (title, body, severity, source_workflow_key, scope)
    VALUES (
      'Metering dead-letter: manual review required',
      v_escalated::text || ' metering event(s) exceeded 10 retry attempts and require manual reconciliation. [doctrine §205]',
      'urgent', 'billing_metering', 'admin'
    );
  END IF;

  RETURN QUERY SELECT v_picked, v_escalated;
END;
$$;

REVOKE ALL ON FUNCTION public.pmedl_notify_admin() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.pmedl_retry_scan() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pmedl_retry_scan() TO service_role;
