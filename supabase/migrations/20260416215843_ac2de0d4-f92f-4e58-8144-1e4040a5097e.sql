-- Helper to get the project URL + service key for edge function calls.
-- Stored in vault-like settings to avoid hardcoding.
-- Falls back to current_setting() pattern with a NULLIF guard.

-- =================================================================
-- TRIGGER 1: Dispute status changes -> push notification
-- =================================================================
CREATE OR REPLACE FUNCTION public.notify_dispute_status_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  _title text;
  _body text;
  _project_url text;
  _service_key text;
BEGIN
  -- Only fire when status actually changed
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  -- Map status -> notification copy
  IF NEW.status::text = 'resolved' THEN
    _title := 'Dispute Resolved';
    _body := 'A dispute on your credit file has been resolved. Log in to see the outcome.';
  ELSIF NEW.status::text IN ('under_review', 'investigating') THEN
    _title := 'Dispute Under Review';
    _body := 'The bureau is reviewing your dispute. We will notify you when a decision is made.';
  ELSE
    -- Other status changes: skip
    RETURN NEW;
  END IF;

  _project_url := 'https://bfmyebsjyuoecmjskqhs.supabase.co';
  -- Read service role key from a per-project secret table populated below
  SELECT value INTO _service_key
  FROM public._internal_secrets
  WHERE key = 'service_role_key'
  LIMIT 1;

  IF _service_key IS NULL THEN
    -- Cannot send without key, but never block the dispute update
    RETURN NEW;
  END IF;

  PERFORM extensions.http_post(
    url := _project_url || '/functions/v1/send-push-notification',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || _service_key
    ),
    body := jsonb_build_object(
      'user_id', NEW.user_id,
      'category', 'dispute_updates',
      'title', _title,
      'body', _body,
      'url', '/app/disputes',
      'tag', 'dispute-' || NEW.id::text,
      'data', jsonb_build_object('dispute_id', NEW.id, 'status', NEW.status)
    )::text
  );

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Never fail the dispute update because of notification errors
  RAISE WARNING 'notify_dispute_status_change failed: %', SQLERRM;
  RETURN NEW;
END;
$$;

-- =================================================================
-- TRIGGER 2: New funding match -> push notification (24h dedupe)
-- =================================================================
CREATE OR REPLACE FUNCTION public.notify_new_funding_match()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  _recent_count int;
  _project_url text;
  _service_key text;
BEGIN
  -- Dedupe: skip if any funding_matches push was logged for this user in last 24h
  SELECT COUNT(*) INTO _recent_count
  FROM public.push_notification_log
  WHERE user_id = NEW.user_id
    AND category = 'funding_matches'
    AND status = 'sent'
    AND created_at > now() - interval '24 hours';

  IF _recent_count > 0 THEN
    RETURN NEW;
  END IF;

  _project_url := 'https://bfmyebsjyuoecmjskqhs.supabase.co';
  SELECT value INTO _service_key
  FROM public._internal_secrets
  WHERE key = 'service_role_key'
  LIMIT 1;

  IF _service_key IS NULL THEN
    RETURN NEW;
  END IF;

  PERFORM extensions.http_post(
    url := _project_url || '/functions/v1/send-push-notification',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || _service_key
    ),
    body := jsonb_build_object(
      'user_id', NEW.user_id,
      'category', 'funding_matches',
      'title', 'New Funding Match Found',
      'body', 'A new funding opportunity matching your profile is available. Log in to PaigeAgent to review your options.',
      'url', '/app/funding',
      'tag', 'funding-match-daily'
    )::text
  );

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'notify_new_funding_match failed: %', SQLERRM;
  RETURN NEW;
END;
$$;

-- =================================================================
-- Internal secrets table (used by trigger functions for service role key)
-- Only service_role can read/write; not exposed to clients.
-- =================================================================
CREATE TABLE IF NOT EXISTS public._internal_secrets (
  key text PRIMARY KEY,
  value text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public._internal_secrets ENABLE ROW LEVEL SECURITY;

-- No policies = no client access (service_role bypasses RLS)
-- Revoke explicit grants from authenticated/anon
REVOKE ALL ON public._internal_secrets FROM anon, authenticated;

-- =================================================================
-- Attach triggers
-- =================================================================
DROP TRIGGER IF EXISTS trg_disputes_notify_status_change ON public.disputes;
CREATE TRIGGER trg_disputes_notify_status_change
  AFTER UPDATE OF status ON public.disputes
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_dispute_status_change();

DROP TRIGGER IF EXISTS trg_user_funding_matches_notify ON public.user_funding_matches;
CREATE TRIGGER trg_user_funding_matches_notify
  AFTER INSERT ON public.user_funding_matches
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_new_funding_match();

DROP TRIGGER IF EXISTS trg_funding_matches_notify ON public.funding_matches;
CREATE TRIGGER trg_funding_matches_notify
  AFTER INSERT ON public.funding_matches
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_new_funding_match();