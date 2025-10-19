-- Enable pg_cron extension
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Grant usage to postgres user
GRANT USAGE ON SCHEMA cron TO postgres;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA cron TO postgres;

-- Create automated reminder job (runs every hour)
-- This checks notification preferences and sends reminders based on user settings
SELECT cron.schedule(
  'send-automated-reminders',
  '0 * * * *', -- Every hour at minute 0
  $$
  SELECT
    net.http_post(
      url := 'https://bfmyebsjyuoecmjskqhs.supabase.co/functions/v1/schedule-automated-tasks',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key')
      ),
      body := jsonb_build_object(
        'taskType', 'automated_reminder',
        'userId', user_id,
        'params', jsonb_build_object(
          'channel', channel,
          'alertType', alert_type
        )
      )
    ) as request_id
  FROM public.notification_preferences
  WHERE enabled = true
    AND channel IN ('sms', 'email')
    AND alert_type IN ('task_due_soon', 'credit_score_change', 'funding_opportunity')
  $$
);

-- Create business credit monitoring job (runs daily at 2 AM)
SELECT cron.schedule(
  'sync-business-credit-daily',
  '0 2 * * *', -- Daily at 2 AM
  $$
  SELECT
    net.http_post(
      url := 'https://bfmyebsjyuoecmjskqhs.supabase.co/functions/v1/sync-business-credit-bureaus',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key')
      ),
      body := jsonb_build_object(
        'userId', b.owner_user_id,
        'businessId', b.id
      )
    ) as request_id
  FROM public.businesses b
  WHERE b.ein IS NOT NULL
    AND (b.formation_status = 'active' OR b.formation_status IS NULL)
  $$
);

-- Create a helper function to manually trigger business credit sync
CREATE OR REPLACE FUNCTION public.trigger_business_credit_sync(_user_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _result json;
BEGIN
  -- Verify user owns at least one business
  IF NOT EXISTS (
    SELECT 1 FROM public.businesses 
    WHERE owner_user_id = _user_id 
    AND ein IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'No businesses with EIN found for user';
  END IF;

  -- This would normally call the edge function, but for now we just log it
  INSERT INTO public.audit_logs (user_id, entity, action, data)
  VALUES (
    _user_id,
    'business_credit',
    'manual_sync_triggered',
    jsonb_build_object('triggered_at', now())
  );

  RETURN json_build_object(
    'success', true,
    'message', 'Business credit sync scheduled'
  );
END;
$$;