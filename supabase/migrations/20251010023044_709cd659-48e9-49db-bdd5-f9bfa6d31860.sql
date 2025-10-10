-- Create subscription plans table
CREATE TABLE public.subscription_plans (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  price numeric NOT NULL,
  features jsonb NOT NULL DEFAULT '[]'::jsonb,
  dispute_limit integer,
  ai_chat_limit integer,
  has_business_credit boolean DEFAULT false,
  has_funding_tools boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

-- Create user subscriptions table
CREATE TABLE public.user_subscriptions (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  plan_slug text NOT NULL,
  status text NOT NULL DEFAULT 'trial',
  trial_ends_at timestamp with time zone,
  current_period_start timestamp with time zone,
  current_period_end timestamp with time zone,
  stripe_subscription_id text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

-- Create usage tracking table
CREATE TABLE public.user_usage (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL UNIQUE,
  disputes_used integer DEFAULT 0,
  ai_chats_used integer DEFAULT 0,
  reset_at timestamp with time zone DEFAULT now(),
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.subscription_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_usage ENABLE ROW LEVEL SECURITY;

-- RLS Policies for subscription_plans
CREATE POLICY "Anyone can view subscription plans"
  ON public.subscription_plans FOR SELECT
  USING (true);

-- RLS Policies for user_subscriptions
CREATE POLICY "Users can view own subscription"
  ON public.user_subscriptions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own subscription"
  ON public.user_subscriptions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own subscription"
  ON public.user_subscriptions FOR UPDATE
  USING (auth.uid() = user_id);

-- RLS Policies for user_usage
CREATE POLICY "Users can view own usage"
  ON public.user_usage FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own usage"
  ON public.user_usage FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own usage"
  ON public.user_usage FOR UPDATE
  USING (auth.uid() = user_id);

-- Insert default subscription plans
INSERT INTO public.subscription_plans (name, slug, price, features, dispute_limit, ai_chat_limit, has_business_credit, has_funding_tools) VALUES
('Free Trial', 'free', 0, '["Personal credit monitoring", "1 dispute", "Basic AI coaching", "A.C.C.E.L. Framework access", "Credit score tracking"]'::jsonb, 1, 10, false, false),
('Starter', 'starter', 47, '["Personal credit monitoring", "5 disputes/month", "A.C.C.E.L. Framework access", "Paige AI coaching", "Email support", "Credit score tracking"]'::jsonb, 5, 50, false, false),
('Professional', 'professional', 97, '["Everything in Starter", "Unlimited disputes", "Business credit building", "B.U.I.L.D. Framework access", "Priority AI coaching", "Priority support", "Fundability assessment"]'::jsonb, NULL, NULL, true, true),
('Premium', 'premium', 197, '["Everything in Professional", "Advanced analytics", "Custom funding strategies", "Dedicated account manager", "Monthly strategy sessions"]'::jsonb, NULL, NULL, true, true),
('Enterprise', 'enterprise', 497, '["Everything in Premium", "3M Framework", "Dedicated success manager", "White-glove service", "Team collaboration", "Personalized training"]'::jsonb, NULL, NULL, true, true);

-- Create trigger to auto-create free trial on user signup
CREATE OR REPLACE FUNCTION public.create_free_trial()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Create free trial subscription (14 days)
  INSERT INTO public.user_subscriptions (user_id, plan_slug, status, trial_ends_at)
  VALUES (NEW.user_id, 'free', 'trial', now() + interval '14 days');
  
  -- Create usage tracking
  INSERT INTO public.user_usage (user_id, disputes_used, ai_chats_used)
  VALUES (NEW.user_id, 0, 0);
  
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_profile_created
  AFTER INSERT ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.create_free_trial();

-- Create updated_at triggers
CREATE TRIGGER update_subscription_plans_updated_at
  BEFORE UPDATE ON public.subscription_plans
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_user_subscriptions_updated_at
  BEFORE UPDATE ON public.user_subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_user_usage_updated_at
  BEFORE UPDATE ON public.user_usage
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();