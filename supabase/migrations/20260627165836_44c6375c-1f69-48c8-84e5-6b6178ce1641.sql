
CREATE TABLE IF NOT EXISTS public.mma_os_bridge_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  verb text NOT NULL,
  payload jsonb NOT NULL,
  attempts integer NOT NULL DEFAULT 0,
  last_error text,
  next_retry_at timestamptz NOT NULL DEFAULT now(),
  delivered_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.mma_os_bridge_outbox TO service_role;

ALTER TABLE public.mma_os_bridge_outbox ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_full_access" ON public.mma_os_bridge_outbox;
CREATE POLICY "service_role_full_access"
  ON public.mma_os_bridge_outbox
  FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_mma_os_outbox_pending
  ON public.mma_os_bridge_outbox (next_retry_at)
  WHERE delivered_at IS NULL;

DROP TRIGGER IF EXISTS set_mma_os_outbox_updated_at ON public.mma_os_bridge_outbox;
CREATE TRIGGER set_mma_os_outbox_updated_at
  BEFORE UPDATE ON public.mma_os_bridge_outbox
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Schedule cron flush (pg_cron + pg_net already enabled in this project)
DO $$
BEGIN
  PERFORM cron.unschedule('mma-os-bridge-flush-every-5min');
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

SELECT cron.schedule(
  'mma-os-bridge-flush-every-5min',
  '*/5 * * * *',
  $job$
  SELECT net.http_post(
    url := 'https://bfmyebsjyuoecmjskqhs.supabase.co/functions/v1/mma-os-bridge-flush',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || COALESCE(
        (SELECT value FROM public._internal_secrets WHERE key = 'service_role_key' LIMIT 1),
        ''
      )
    ),
    body := '{}'::jsonb
  );
  $job$
);
