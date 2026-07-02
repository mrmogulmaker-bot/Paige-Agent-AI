
-- =========================================================
-- Doctrine §205: Metering Safety Net — Fire-and-Forget with
--                 Dead-Letter Reconciliation
-- =========================================================

-- 1) DEAD LETTER TABLE ------------------------------------------------
CREATE TABLE IF NOT EXISTS public.platform_metered_events_dead_letter (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  idempotency_key   TEXT NOT NULL UNIQUE,
  user_id           UUID,
  tenant_id         UUID,
  event_type        TEXT NOT NULL,
  quantity          INTEGER NOT NULL DEFAULT 1,
  unit_amount_cents INTEGER NOT NULL DEFAULT 0,
  payload           JSONB NOT NULL DEFAULT '{}'::jsonb,
  error_class       TEXT,
  error_message     TEXT,
  attempt_count     INTEGER NOT NULL DEFAULT 1,
  status            TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending','requires_manual_review','resolved')),
  next_retry_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  first_failed_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_failed_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at       TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pmedl_status_next_retry
  ON public.platform_metered_events_dead_letter(status, next_retry_at)
  WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_pmedl_event_type
  ON public.platform_metered_events_dead_letter(event_type);

GRANT SELECT ON public.platform_metered_events_dead_letter TO authenticated;
GRANT ALL   ON public.platform_metered_events_dead_letter TO service_role;

ALTER TABLE public.platform_metered_events_dead_letter ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins read dead letter"
  ON public.platform_metered_events_dead_letter FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role)
      OR public.has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "service role manages dead letter"
  ON public.platform_metered_events_dead_letter FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.pmedl_touch_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.pmedl_touch_updated_at() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_pmedl_touch ON public.platform_metered_events_dead_letter;
CREATE TRIGGER trg_pmedl_touch
  BEFORE UPDATE ON public.platform_metered_events_dead_letter
  FOR EACH ROW EXECUTE FUNCTION public.pmedl_touch_updated_at();

-- 2) ADMIN NOTIFICATION TRIGGER ---------------------------------------
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
    title, body, severity, category, metadata
  ) VALUES (
    'Metering dead-letter: ' || NEW.event_type,
    'A metering event failed to write. $' || v_dollars::text || ' at risk. '
      || 'Idempotency key: ' || NEW.idempotency_key
      || '. Error: ' || COALESCE(NEW.error_class,'unknown') || ' — ' || COALESCE(NEW.error_message,''),
    'warning',
    'billing_metering',
    jsonb_build_object(
      'dead_letter_id',  NEW.id,
      'event_type',      NEW.event_type,
      'idempotency_key', NEW.idempotency_key,
      'user_id',         NEW.user_id,
      'tenant_id',       NEW.tenant_id,
      'dollars_at_risk', v_dollars,
      'attempt_count',   NEW.attempt_count,
      'doctrine',        '§205'
    )
  );
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Never let notification failure kill the dead-letter write itself
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.pmedl_notify_admin() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_pmedl_notify_admin ON public.platform_metered_events_dead_letter;
CREATE TRIGGER trg_pmedl_notify_admin
  AFTER INSERT ON public.platform_metered_events_dead_letter
  FOR EACH ROW EXECUTE FUNCTION public.pmedl_notify_admin();

-- 3) RETRY WORKER -----------------------------------------------------
-- Marks rows for the emitter to re-attempt; actual Stripe call happens
-- in the metering edge function which reads pending rows past next_retry_at.
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
  -- Escalate any row that has failed 10+ times
  UPDATE public.platform_metered_events_dead_letter
     SET status = 'requires_manual_review'
   WHERE status = 'pending' AND attempt_count >= 10;
  GET DIAGNOSTICS v_escalated = ROW_COUNT;

  -- Count how many pending rows are due for retry (edge function drains these)
  SELECT COUNT(*) INTO v_picked
    FROM public.platform_metered_events_dead_letter
   WHERE status = 'pending' AND next_retry_at <= now();

  -- Re-notify admins about escalations
  IF v_escalated > 0 THEN
    INSERT INTO public.paige_admin_notifications (title, body, severity, category, metadata)
    VALUES (
      'Metering dead-letter: manual review required',
      v_escalated::text || ' metering event(s) exceeded 10 retry attempts and now require manual reconciliation.',
      'critical',
      'billing_metering',
      jsonb_build_object('escalated_count', v_escalated, 'doctrine', '§205')
    );
  END IF;

  RETURN QUERY SELECT v_picked, v_escalated;
END;
$$;
REVOKE ALL ON FUNCTION public.pmedl_retry_scan() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pmedl_retry_scan() TO service_role;

-- 4) ADMIN OBSERVABILITY RPC ------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_metering_dead_letter_summary()
RETURNS TABLE(
  event_type          TEXT,
  status              TEXT,
  row_count           BIGINT,
  dollars_at_risk     NUMERIC,
  oldest_failure      TIMESTAMPTZ,
  most_recent_failure TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin'::app_role)
       OR public.has_role(auth.uid(), 'super_admin'::app_role)) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  RETURN QUERY
  SELECT
    d.event_type,
    d.status,
    COUNT(*)::bigint,
    ROUND(SUM(COALESCE(d.quantity,1) * COALESCE(d.unit_amount_cents,0))::numeric / 100.0, 2),
    MIN(d.first_failed_at),
    MAX(d.last_failed_at)
  FROM public.platform_metered_events_dead_letter d
  GROUP BY d.event_type, d.status
  ORDER BY d.status, d.event_type;
END;
$$;
REVOKE ALL ON FUNCTION public.admin_metering_dead_letter_summary() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_metering_dead_letter_summary() TO authenticated, service_role;

-- 5) CRON — retry sweep every 15 minutes ------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule('pmedl_retry_scan_every_15m')
      WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'pmedl_retry_scan_every_15m');
    PERFORM cron.schedule(
      'pmedl_retry_scan_every_15m',
      '*/15 * * * *',
      $cron$ SELECT public.pmedl_retry_scan(); $cron$
    );
  END IF;
END $$;
