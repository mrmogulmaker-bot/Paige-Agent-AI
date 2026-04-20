-- Create economic_rates_cache table for FRED API data
CREATE TABLE public.economic_rates_cache (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  series_id TEXT NOT NULL UNIQUE,
  series_name TEXT NOT NULL,
  value DECIMAL NOT NULL,
  observation_date DATE NOT NULL,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '6 hours'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.economic_rates_cache ENABLE ROW LEVEL SECURITY;

-- Anyone authenticated can read cached rates (public economic data)
CREATE POLICY "Authenticated users can read economic rates"
ON public.economic_rates_cache
FOR SELECT
TO authenticated
USING (true);

-- Only service role can insert/update (handled by edge function)
CREATE POLICY "Service role can manage economic rates"
ON public.economic_rates_cache
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- Index for fast lookup
CREATE INDEX idx_economic_rates_series_id ON public.economic_rates_cache(series_id);
CREATE INDEX idx_economic_rates_expires_at ON public.economic_rates_cache(expires_at);

-- Trigger for updated_at
CREATE TRIGGER update_economic_rates_cache_updated_at
BEFORE UPDATE ON public.economic_rates_cache
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();