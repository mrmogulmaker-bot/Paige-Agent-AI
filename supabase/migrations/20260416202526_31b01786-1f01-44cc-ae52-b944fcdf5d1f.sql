-- Push notification subscriptions table
CREATE TABLE public.push_subscriptions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  endpoint TEXT NOT NULL,
  p256dh_key TEXT NOT NULL,
  auth_key TEXT NOT NULL,
  user_agent TEXT,
  device_type TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  last_used_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, endpoint)
);

CREATE INDEX idx_push_subscriptions_user_id ON public.push_subscriptions(user_id);
CREATE INDEX idx_push_subscriptions_active ON public.push_subscriptions(user_id, is_active) WHERE is_active = true;

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own push subscriptions"
ON public.push_subscriptions FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own push subscriptions"
ON public.push_subscriptions FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own push subscriptions"
ON public.push_subscriptions FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own push subscriptions"
ON public.push_subscriptions FOR DELETE
USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all push subscriptions"
ON public.push_subscriptions FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER update_push_subscriptions_updated_at
BEFORE UPDATE ON public.push_subscriptions
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Push notification preferences (per-category toggles)
CREATE TABLE public.push_notification_preferences (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE,
  push_enabled BOOLEAN NOT NULL DEFAULT true,
  notify_dispute_updates BOOLEAN NOT NULL DEFAULT true,
  notify_funding_matches BOOLEAN NOT NULL DEFAULT true,
  notify_credit_score_changes BOOLEAN NOT NULL DEFAULT true,
  notify_task_reminders BOOLEAN NOT NULL DEFAULT true,
  prompt_dismissed_at TIMESTAMPTZ,
  prompt_dismiss_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.push_notification_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own push notification preferences"
ON public.push_notification_preferences FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own push notification preferences"
ON public.push_notification_preferences FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own push notification preferences"
ON public.push_notification_preferences FOR UPDATE
USING (auth.uid() = user_id);

CREATE TRIGGER update_push_notification_preferences_updated_at
BEFORE UPDATE ON public.push_notification_preferences
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Push notification log (audit + delivery tracking)
CREATE TABLE public.push_notification_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  subscription_id UUID REFERENCES public.push_subscriptions(id) ON DELETE SET NULL,
  category TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  url TEXT,
  data JSONB,
  status TEXT NOT NULL DEFAULT 'pending',
  error_message TEXT,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_push_notification_log_user_id ON public.push_notification_log(user_id, created_at DESC);

ALTER TABLE public.push_notification_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own notification log"
ON public.push_notification_log FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all notification logs"
ON public.push_notification_log FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role));