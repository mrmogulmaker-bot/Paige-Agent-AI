
ALTER TABLE public.paige_readiness_scan_runs
  RENAME COLUMN isoftpull_calls TO credit_provider_calls_count;

ALTER TABLE public.paige_readiness_scan_runs
  RENAME COLUMN cost_usd_total TO credit_provider_cost_usd;

ALTER TABLE public.tenant_features
  ADD COLUMN IF NOT EXISTS credit_data_provider text
    CHECK (credit_data_provider IS NULL OR credit_data_provider IN ('isoftpull','smartcredit','nav_com','none'));

UPDATE public.tenant_features
   SET credit_data_provider = 'isoftpull'
 WHERE credit_data_provider IS NULL
   AND credit_services_enabled = true;

DROP FUNCTION IF EXISTS public.increment_readiness_scan_counters(uuid, int, int, int, int, numeric);

CREATE OR REPLACE FUNCTION public.increment_readiness_scan_counters(
  _run_id uuid,
  _contacts_scanned int DEFAULT 0,
  _proposals_generated int DEFAULT 0,
  _proposals_insufficient_data int DEFAULT 0,
  _credit_provider_calls int DEFAULT 0,
  _credit_provider_cost_usd numeric DEFAULT 0
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  UPDATE public.paige_readiness_scan_runs
     SET contacts_scanned = contacts_scanned + COALESCE(_contacts_scanned, 0),
         proposals_generated = proposals_generated + COALESCE(_proposals_generated, 0),
         proposals_insufficient_data = proposals_insufficient_data + COALESCE(_proposals_insufficient_data, 0),
         credit_provider_calls_count = credit_provider_calls_count + COALESCE(_credit_provider_calls, 0),
         credit_provider_cost_usd = credit_provider_cost_usd + COALESCE(_credit_provider_cost_usd, 0)
   WHERE id = _run_id;
END;
$$;

REVOKE ALL ON FUNCTION public.increment_readiness_scan_counters(uuid, int, int, int, int, numeric) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.increment_readiness_scan_counters(uuid, int, int, int, int, numeric) TO service_role;
