-- Shared receipt processing only. No history backfill, sender mutation, or tenant-facing API.
-- Owner-approved rebuild parity: production already has these service-role privileges.
-- SELECT resolves the source; UPDATE permits row locking; INSERT appends its proven outcome.
GRANT SELECT, INSERT, UPDATE ON public.email_send_log TO service_role;
CREATE TABLE IF NOT EXISTS public.resend_receipt_processing (
  receipt_id text PRIMARY KEY CHECK (receipt_id ~ '^[A-Za-z0-9_-]{1,200}$'),
  message_id text NOT NULL CHECK (message_id ~ '^[A-Za-z0-9_-]{1,200}$'),
  status text NOT NULL CHECK (status IN ('sent','delivered','delivery_delayed','opened','clicked','bounced','complained')),
  event_at timestamptz,
  state text NOT NULL DEFAULT 'pending' CHECK (state IN ('pending','processed','unresolved')),
  reason text CHECK (reason IN ('origin_pending','source_mismatch','storage_retry','expired')),
  received_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT now() + interval '48 hours',
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 64),
  source_id uuid,
  outcome_id uuid
);
ALTER TABLE public.resend_receipt_processing ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.resend_receipt_processing FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.resend_receipt_processing TO service_role;
CREATE INDEX IF NOT EXISTS resend_receipt_pending ON public.resend_receipt_processing (next_attempt_at, receipt_id) WHERE state = 'pending';
-- Non-unique: old duplicates remain untouched. Needed to recognize pre-journal retries.
CREATE INDEX IF NOT EXISTS email_send_log_resend_receipt ON public.email_send_log ((metadata->>'svix_id'))
  WHERE metadata->>'via' = 'handle-resend-webhook';
COMMENT ON TABLE public.resend_receipt_processing IS 'Private Resend transport deduplication and bounded reconciliation; not a notification history or tenant read model.';

CREATE OR REPLACE FUNCTION public.process_resend_receipt(_receipt_id text)
RETURNS text LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp AS $function$
DECLARE
  r public.resend_receipt_processing%ROWTYPE;
  origin public.email_send_log%ROWTYPE;
  outcome uuid;
  source_ok boolean := false;
BEGIN
  -- The primary key and this row lock serialize ingestion and scheduled reconciliation.
  SELECT * INTO r FROM public.resend_receipt_processing WHERE receipt_id = _receipt_id FOR UPDATE;
  IF NOT FOUND THEN RETURN 'invalid'; END IF;
  IF r.state = 'processed' THEN RETURN 'duplicate'; END IF;
  IF r.state = 'unresolved' THEN RETURN 'unresolved'; END IF;
  IF r.attempts >= 64 OR r.expires_at <= now() THEN
    UPDATE public.resend_receipt_processing SET state = 'unresolved', reason = 'expired' WHERE receipt_id = r.receipt_id;
    RETURN 'unresolved';
  END IF;
  IF r.next_attempt_at > now() THEN RETURN 'pending'; END IF;
  UPDATE public.resend_receipt_processing
    SET attempts = attempts + 1,
        next_attempt_at = now() + make_interval(secs => LEAST(3600, 60 * power(2, LEAST(attempts, 6))::integer))
    WHERE receipt_id = r.receipt_id;
  BEGIN
    -- Preserve the existing provider-message-id contract, without guessing alternate IDs.
    -- The existing unique sent/message index makes this origin unambiguous.
    SELECT * INTO origin FROM public.email_send_log
      WHERE message_id = r.message_id AND status = 'sent'
        AND metadata->>'via' IN ('send-portal-invite','send-platform-invite','mcp.send_btf_template_email')
      FOR SHARE;
    IF NOT FOUND THEN
      UPDATE public.resend_receipt_processing SET reason = 'origin_pending' WHERE receipt_id = r.receipt_id;
      RETURN 'pending';
    END IF;
    IF origin.metadata->>'via' = 'send-portal-invite' THEN
      PERFORM 1 FROM public.tenant_invite_tokens ti
        WHERE ti.id::text = origin.metadata->>'invite_id'
          AND ti.tenant_id = origin.tenant_id
          AND ti.kind = origin.metadata->>'kind'
          AND origin.template_name = CASE WHEN ti.kind = 'team' THEN 'team_invite' ELSE 'portal_invite' END
          AND (lower(trim(ti.email)) = lower(trim(origin.recipient_email))
            OR (ti.kind <> 'team' AND NULLIF(trim(ti.email),'') IS NULL))
        FOR SHARE;
      source_ok := FOUND;
    ELSE
      -- Known platform sends may legitimately have no tenant. Never assign them one.
      source_ok := origin.metadata->>'invite_id' IS NULL
        AND (origin.metadata->>'via' = 'mcp.send_btf_template_email'
          OR origin.template_name = 'platform_invite');
    END IF;
    IF NOT source_ok THEN
      UPDATE public.resend_receipt_processing SET state = 'unresolved', reason = 'source_mismatch' WHERE receipt_id = r.receipt_id;
      RETURN 'unresolved';
    END IF;
    -- A retry from before this journal existed must not append an old receipt again.
    -- Never alter or collapse the historical rows, including pre-existing duplicates.
    IF EXISTS (SELECT 1 FROM public.email_send_log l
      WHERE l.metadata->>'via' = 'handle-resend-webhook' AND l.metadata->>'svix_id' = r.receipt_id
      AND (l.message_id IS DISTINCT FROM r.message_id OR l.status IS DISTINCT FROM r.status
        OR l.tenant_id IS DISTINCT FROM origin.tenant_id
        OR l.metadata->>'invite_id' IS DISTINCT FROM origin.metadata->>'invite_id'
        OR l.recipient_email IS DISTINCT FROM origin.recipient_email
        OR l.template_name IS DISTINCT FROM origin.template_name)) THEN
      UPDATE public.resend_receipt_processing SET state='unresolved', reason='source_mismatch' WHERE receipt_id=r.receipt_id;
      RETURN 'unresolved';
    END IF;
    SELECT l.id INTO outcome FROM public.email_send_log l
      WHERE l.metadata->>'via' = 'handle-resend-webhook' AND l.metadata->>'svix_id' = r.receipt_id
      ORDER BY l.created_at, l.id LIMIT 1;
    IF outcome IS NOT NULL THEN
      NULL; -- Existing source outcome; identity is already recorded.
    ELSIF r.status = 'sent' THEN
      outcome := origin.id; -- Provider handoff already recorded by sender; do not append.
    ELSE
      INSERT INTO public.email_send_log (template_name, recipient_email, message_id, status, tenant_id, sender_account, metadata)
      VALUES (origin.template_name, origin.recipient_email, r.message_id, r.status, origin.tenant_id, 'platform',
        jsonb_build_object('via','handle-resend-webhook','event','email.' || r.status,
          'svix_id',r.receipt_id,'invite_id',origin.metadata->>'invite_id','provider_created_at',r.event_at))
      RETURNING id INTO outcome;
    END IF;
    UPDATE public.resend_receipt_processing
      SET state = 'processed', reason = NULL, source_id = origin.id, outcome_id = outcome
      WHERE receipt_id = r.receipt_id;
    RETURN 'processed';
  EXCEPTION WHEN OTHERS THEN
    -- This subtransaction rolls back the outcome append. Keep the receipt for a bounded retry.
    -- Never persist or RAISE SQLERRM, SQLSTATE detail, or source data.
    UPDATE public.resend_receipt_processing SET reason = 'storage_retry' WHERE receipt_id = r.receipt_id;
    RETURN 'pending';
  END;
END;
$function$;
REVOKE ALL ON FUNCTION public.process_resend_receipt(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.process_resend_receipt(text) TO service_role;

CREATE OR REPLACE FUNCTION public.ingest_resend_receipt(_receipt_id text, _message_id text, _status text, _event_at timestamptz DEFAULT NULL)
RETURNS text LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp AS $function$
DECLARE r public.resend_receipt_processing%ROWTYPE;
BEGIN
  IF _receipt_id IS NULL OR _receipt_id !~ '^[A-Za-z0-9_-]{1,200}$'
    OR _message_id IS NULL OR _message_id !~ '^[A-Za-z0-9_-]{1,200}$'
    OR _status IS NULL OR _status NOT IN ('sent','delivered','delivery_delayed','opened','clicked','bounced','complained')
    OR (_event_at IS NOT NULL AND NOT isfinite(_event_at)) THEN RETURN 'invalid'; END IF;
  INSERT INTO public.resend_receipt_processing(receipt_id,message_id,status,event_at)
    VALUES (_receipt_id,_message_id,_status,_event_at) ON CONFLICT (receipt_id) DO NOTHING;
  SELECT * INTO r FROM public.resend_receipt_processing WHERE receipt_id = _receipt_id FOR UPDATE;
  IF r.message_id IS DISTINCT FROM _message_id OR r.status IS DISTINCT FROM _status OR r.event_at IS DISTINCT FROM _event_at THEN RETURN 'conflict'; END IF;
  RETURN public.process_resend_receipt(_receipt_id);
END;
$function$;
REVOKE ALL ON FUNCTION public.ingest_resend_receipt(text,text,text,timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ingest_resend_receipt(text,text,text,timestamptz) TO service_role;

CREATE OR REPLACE FUNCTION public.reconcile_resend_receipts()
RETURNS integer LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp AS $function$
DECLARE item record; handled integer := 0;
BEGIN
  FOR item IN SELECT receipt_id FROM public.resend_receipt_processing
    WHERE state = 'pending' AND next_attempt_at <= now()
    ORDER BY next_attempt_at, receipt_id LIMIT 100 FOR UPDATE SKIP LOCKED
  LOOP
    PERFORM public.process_resend_receipt(item.receipt_id);
    handled := handled + 1;
  END LOOP;
  RETURN handled;
END;
$function$;
REVOKE ALL ON FUNCTION public.reconcile_resend_receipts() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reconcile_resend_receipts() TO service_role;
-- No external sends or HTTP calls: process only newly received signed transport facts.
SELECT cron.schedule('resend-receipt-reconciliation', '* * * * *', 'select public.reconcile_resend_receipts()');
