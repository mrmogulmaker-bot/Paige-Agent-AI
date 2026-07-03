ALTER TABLE public.platform_metered_events_dead_letter
  DROP COLUMN consumer_subscription_id,
  DROP COLUMN consumer_user_id;