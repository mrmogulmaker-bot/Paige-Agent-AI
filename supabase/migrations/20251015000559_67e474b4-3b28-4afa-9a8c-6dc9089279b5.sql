-- Create rate limiting table for edge functions
CREATE TABLE IF NOT EXISTS public.api_rate_limits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  function_name text NOT NULL,
  request_count int NOT NULL DEFAULT 1,
  window_start timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, function_name, window_start)
);

-- Enable RLS
ALTER TABLE public.api_rate_limits ENABLE ROW LEVEL SECURITY;

-- Only service role can manage rate limits
CREATE POLICY "Service role can manage rate limits"
ON public.api_rate_limits
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- Users can view their own rate limit data
CREATE POLICY "Users can view own rate limits"
ON public.api_rate_limits
FOR SELECT
USING (auth.uid() = user_id);

-- Create function to check and increment rate limit
CREATE OR REPLACE FUNCTION public.check_rate_limit(
  _user_id uuid,
  _function_name text,
  _max_requests int DEFAULT 30,
  _window_minutes int DEFAULT 1
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _window_start timestamptz;
  _current_count int;
BEGIN
  -- Calculate window start time
  _window_start := date_trunc('minute', now()) - (EXTRACT(minute FROM now())::int % _window_minutes) * INTERVAL '1 minute';
  
  -- Get current count for this window
  SELECT request_count INTO _current_count
  FROM public.api_rate_limits
  WHERE user_id = _user_id
    AND function_name = _function_name
    AND window_start = _window_start;
  
  -- If no record exists, create one
  IF _current_count IS NULL THEN
    INSERT INTO public.api_rate_limits (user_id, function_name, request_count, window_start)
    VALUES (_user_id, _function_name, 1, _window_start);
    RETURN true;
  END IF;
  
  -- If limit exceeded, return false
  IF _current_count >= _max_requests THEN
    RETURN false;
  END IF;
  
  -- Increment counter
  UPDATE public.api_rate_limits
  SET request_count = request_count + 1
  WHERE user_id = _user_id
    AND function_name = _function_name
    AND window_start = _window_start;
  
  RETURN true;
END;
$$;

-- Enable realtime for user_subscriptions table
ALTER PUBLICATION supabase_realtime ADD TABLE public.user_subscriptions;