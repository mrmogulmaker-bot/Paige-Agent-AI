-- Anon/public edge-function rate limiting.
--
-- The existing public.check_rate_limit / public.api_rate_limits primitive is keyed
-- on user_id (a uuid FK to auth.users), so it can only throttle AUTHENTICATED
-- callers. The public booking surfaces (public-booking, booking-manage) are
-- anon-callable and have no user to key on — an attacker rotating slugs, hammering
-- the cheap 'availability' action, or replaying a leaked manage token is invisible
-- to that primitive. This adds a sibling counter keyed by an opaque STRING bucket
-- (e.g. "pb:avail:ip:1.2.3.4", "pb:avail:slug:demo", "bm:tok:<id>") so the same
-- primitive serves per-IP, per-slug, or per-token throttles. It complements — does
-- not replace — check_rate_limit; the two coexist for their different key types.
CREATE TABLE IF NOT EXISTS public.public_rate_limits (
  bucket        text        NOT NULL,
  window_start  timestamptz NOT NULL,
  request_count int         NOT NULL DEFAULT 0,
  PRIMARY KEY (bucket, window_start)
);

-- Support cheap pruning of expired windows (a periodic prune can DELETE WHERE
-- window_start < now() - interval '1 hour'; wire it to pg_cron if the table grows).
CREATE INDEX IF NOT EXISTS idx_public_rate_limits_window
  ON public.public_rate_limits (window_start);

ALTER TABLE public.public_rate_limits ENABLE ROW LEVEL SECURITY;

-- Service role only — edge functions call with the service key. These counters are
-- infrastructure, never client-readable; no anon/authenticated policy is granted.
DROP POLICY IF EXISTS "public_rate_limits service role only" ON public.public_rate_limits;
CREATE POLICY "public_rate_limits service role only"
  ON public.public_rate_limits FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- Atomic check-and-increment. One statement (INSERT ... ON CONFLICT ... RETURNING)
-- so concurrent calls can't race past the ceiling — the post-increment count is
-- authoritative. Returns TRUE when the request is ALLOWED (count <= _max within the
-- window) and FALSE when the ceiling is exceeded. The current call is counted, so a
-- limit of N permits exactly N requests per window.
CREATE OR REPLACE FUNCTION public.check_public_rate_limit(
  _bucket text,
  _max int DEFAULT 60,
  _window_seconds int DEFAULT 60
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _win   timestamptz;
  _count int;
BEGIN
  -- Nothing to key on → don't block (the caller's own fail-open safety net).
  IF _bucket IS NULL OR _bucket = '' THEN
    RETURN true;
  END IF;
  IF _window_seconds < 1 THEN
    _window_seconds := 60;
  END IF;
  -- Fixed-width window: floor now() to the window boundary so all calls in the
  -- same window share one counter row.
  _win := to_timestamp(floor(extract(epoch FROM now()) / _window_seconds) * _window_seconds);

  INSERT INTO public.public_rate_limits (bucket, window_start, request_count)
  VALUES (_bucket, _win, 1)
  ON CONFLICT (bucket, window_start)
  DO UPDATE SET request_count = public.public_rate_limits.request_count + 1
  RETURNING request_count INTO _count;

  RETURN _count <= _max;
END;
$$;

GRANT EXECUTE ON FUNCTION public.check_public_rate_limit(text, int, int) TO service_role;
