
-- Create credit_alerts table
CREATE TABLE public.credit_alerts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES public.profiles(user_id) ON DELETE CASCADE,
  alert_type TEXT NOT NULL,
  alert_severity TEXT NOT NULL CHECK (alert_severity IN ('critical', 'warning', 'informational')),
  alert_title TEXT NOT NULL,
  alert_description TEXT NOT NULL,
  previous_value TEXT,
  new_value TEXT,
  bureau TEXT CHECK (bureau IN ('experian', 'transunion', 'equifax', 'all', NULL)),
  related_account_id UUID,
  is_read BOOLEAN NOT NULL DEFAULT false,
  is_dismissed BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  read_at TIMESTAMPTZ,
  dismissed_at TIMESTAMPTZ,
  dismissed_by UUID REFERENCES public.profiles(user_id)
);

-- Indexes for query performance
CREATE INDEX idx_credit_alerts_client_id ON public.credit_alerts(client_id);
CREATE INDEX idx_credit_alerts_severity ON public.credit_alerts(alert_severity);
CREATE INDEX idx_credit_alerts_is_read ON public.credit_alerts(is_read);
CREATE INDEX idx_credit_alerts_created_at ON public.credit_alerts(created_at DESC);
CREATE INDEX idx_credit_alerts_client_unread ON public.credit_alerts(client_id, is_read) WHERE is_read = false;

-- Enable RLS
ALTER TABLE public.credit_alerts ENABLE ROW LEVEL SECURITY;

-- Clients can read their own alerts
CREATE POLICY "Clients can read own alerts"
  ON public.credit_alerts FOR SELECT
  TO authenticated
  USING (client_id = auth.uid());

-- Clients can update (mark read/dismissed) their own alerts
CREATE POLICY "Clients can update own alerts"
  ON public.credit_alerts FOR UPDATE
  TO authenticated
  USING (client_id = auth.uid())
  WITH CHECK (client_id = auth.uid());

-- Coaches can read alerts for assigned clients
CREATE POLICY "Coaches can read assigned client alerts"
  ON public.credit_alerts FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.coach_clients cc
      WHERE cc.coach_user_id = auth.uid()
        AND cc.client_user_id = credit_alerts.client_id
        AND cc.status = 'active'
    )
  );

-- Admins can read all alerts
CREATE POLICY "Admins can read all alerts"
  ON public.credit_alerts FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Admins can update all alerts
CREATE POLICY "Admins can update all alerts"
  ON public.credit_alerts FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Admins can insert alerts (edge functions use service role, but also allow admin insert)
CREATE POLICY "Admins can insert alerts"
  ON public.credit_alerts FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
