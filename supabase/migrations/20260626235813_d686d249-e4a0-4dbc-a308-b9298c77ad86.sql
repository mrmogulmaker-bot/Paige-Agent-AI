
-- Idempotency log for Stripe webhook (any account)
CREATE TABLE IF NOT EXISTS public.stripe_event_log (
  event_id text PRIMARY KEY,
  account_id text,
  type text NOT NULL,
  livemode boolean,
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  payload_digest text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS stripe_event_log_type_idx ON public.stripe_event_log(type);
CREATE INDEX IF NOT EXISTS stripe_event_log_received_at_idx ON public.stripe_event_log(received_at DESC);

GRANT ALL ON public.stripe_event_log TO service_role;
ALTER TABLE public.stripe_event_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role manages stripe_event_log"
  ON public.stripe_event_log FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
CREATE POLICY "admins read stripe_event_log"
  ON public.stripe_event_log FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Canonical tier state per contact (keyed by email for cross-system identity).
-- Mirrors Stripe subscription state and is the source of truth for tier badges
-- shown in Paige UI + sync'd to MMA OS.
CREATE TABLE IF NOT EXISTS public.tier_state (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_email text NOT NULL UNIQUE,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  organization_id uuid,
  tier text NOT NULL DEFAULT 'standard',         -- standard | premium | vip | free
  payment_status text NOT NULL DEFAULT 'unknown', -- active | past_due | canceled | unknown
  source text,                                    -- paige.stripe | mma_os.skool | manual | ghl
  stripe_customer_id text,
  stripe_subscription_id text,
  stripe_price_id text,
  stripe_account_id text,                         -- which Stripe account fired this
  last_payment_at timestamptz,
  current_period_end timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS tier_state_user_id_idx ON public.tier_state(user_id);
CREATE INDEX IF NOT EXISTS tier_state_client_id_idx ON public.tier_state(client_id);
CREATE INDEX IF NOT EXISTS tier_state_stripe_customer_idx ON public.tier_state(stripe_customer_id);
CREATE INDEX IF NOT EXISTS tier_state_org_idx ON public.tier_state(organization_id);

GRANT SELECT ON public.tier_state TO authenticated;
GRANT ALL ON public.tier_state TO service_role;
ALTER TABLE public.tier_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role manages tier_state"
  ON public.tier_state FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "admins read all tier_state"
  ON public.tier_state FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "coaches read assigned tier_state"
  ON public.tier_state FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.clients c
      WHERE c.id = tier_state.client_id
        AND c.assigned_coach_user_id = auth.uid()
    )
  );

CREATE POLICY "users read own tier_state"
  ON public.tier_state FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.tier_state_touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tier_state_set_updated_at ON public.tier_state;
CREATE TRIGGER tier_state_set_updated_at
  BEFORE UPDATE ON public.tier_state
  FOR EACH ROW EXECUTE FUNCTION public.tier_state_touch_updated_at();

-- Enable Realtime so Paige UI flips live on tier changes (sets up Step 4 too).
ALTER TABLE public.tier_state REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.tier_state;
