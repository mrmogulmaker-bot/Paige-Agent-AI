-- Communication preferences (one per user)
CREATE TABLE public.communication_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE,
  email_enabled BOOLEAN NOT NULL DEFAULT true,
  sms_enabled BOOLEAN NOT NULL DEFAULT false,
  sms_phone_number TEXT,
  sms_phone_verified BOOLEAN NOT NULL DEFAULT false,
  email_credit_alerts BOOLEAN NOT NULL DEFAULT true,
  email_funding_alerts BOOLEAN NOT NULL DEFAULT true,
  email_score_milestones BOOLEAN NOT NULL DEFAULT true,
  email_coaching_reminders BOOLEAN NOT NULL DEFAULT true,
  email_weekly_summary BOOLEAN NOT NULL DEFAULT true,
  email_onboarding BOOLEAN NOT NULL DEFAULT true,
  sms_credit_alerts BOOLEAN NOT NULL DEFAULT true,
  sms_funding_alerts BOOLEAN NOT NULL DEFAULT true,
  sms_score_milestones BOOLEAN NOT NULL DEFAULT true,
  sms_coaching_reminders BOOLEAN NOT NULL DEFAULT true,
  unsubscribed_all BOOLEAN NOT NULL DEFAULT false,
  unsubscribed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.communication_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own comm preferences"
ON public.communication_preferences FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own comm preferences"
ON public.communication_preferences FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own comm preferences"
ON public.communication_preferences FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all comm preferences"
ON public.communication_preferences FOR SELECT
USING (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE TRIGGER update_communication_preferences_updated_at
BEFORE UPDATE ON public.communication_preferences
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_comm_prefs_user ON public.communication_preferences(user_id);

-- Communication log (append-only audit trail)
CREATE TABLE public.communication_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  channel TEXT NOT NULL CHECK (channel IN ('email','sms')),
  message_type TEXT NOT NULL,
  subject TEXT,
  preview TEXT,
  status TEXT NOT NULL CHECK (status IN ('sent','failed','bounced','unsubscribed','suppressed','queued')),
  provider_message_id TEXT,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.communication_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own comm log"
ON public.communication_log FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all comm log"
ON public.communication_log FOR SELECT
USING (public.has_role(auth.uid(), 'admin'::public.app_role));

-- No INSERT policy: only service-role edge functions write here.

CREATE INDEX idx_comm_log_user_created ON public.communication_log(user_id, created_at DESC);
CREATE INDEX idx_comm_log_channel_created ON public.communication_log(channel, created_at DESC);
CREATE INDEX idx_comm_log_status ON public.communication_log(status);

-- SMS verifications
CREATE TABLE public.sms_verifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  phone_number TEXT NOT NULL,
  verification_code TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  verified_at TIMESTAMPTZ,
  attempts INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.sms_verifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own sms verifications"
ON public.sms_verifications FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own sms verifications"
ON public.sms_verifications FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins can view all sms verifications"
ON public.sms_verifications FOR SELECT
USING (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE INDEX idx_sms_verif_user_phone ON public.sms_verifications(user_id, phone_number, created_at DESC);

-- Auto-create default preferences row on new user signup
CREATE OR REPLACE FUNCTION public.create_default_comm_preferences()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  INSERT INTO public.communication_preferences (user_id)
  VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS create_comm_prefs_on_signup ON auth.users;
CREATE TRIGGER create_comm_prefs_on_signup
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.create_default_comm_preferences();