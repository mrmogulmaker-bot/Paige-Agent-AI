-- Sprint P.0 — Doctrine §201 weekly language sweep + Layer 4 plan hardening.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'doctrine_201_weekly_sweep') THEN
      PERFORM cron.unschedule('doctrine_201_weekly_sweep');
    END IF;

    PERFORM cron.schedule(
      'doctrine_201_weekly_sweep',
      '17 6 * * 1',
      $cron$
      SELECT net.http_post(
        url := 'https://' || current_setting('app.settings.project_ref', true) || '.supabase.co/functions/v1/doctrine-201-language-sweep',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
        ),
        body := jsonb_build_object('base_url', 'https://paigeagent.ai')
      );
      $cron$
    );
  END IF;
END $$;

ALTER TABLE public.consumer_subscription_plans
  ADD COLUMN IF NOT EXISTS stripe_mode text NOT NULL DEFAULT 'test'
    CHECK (stripe_mode IN ('test','live'));

COMMENT ON COLUMN public.consumer_subscription_plans.stripe_mode IS
  'Sprint P.0: All Layer 4 plans launch in TEST mode. Manual promotion to LIVE requires Antonio to verify signup, upgrade, downgrade, cancel-with-grace, and refund flows first.';

CREATE INDEX IF NOT EXISTS tenant_entity_relationships_contact_idx
  ON public.tenant_entity_relationships(contact_id);
CREATE INDEX IF NOT EXISTS tenant_entity_relationships_entity_idx
  ON public.tenant_entity_relationships(entity_id);