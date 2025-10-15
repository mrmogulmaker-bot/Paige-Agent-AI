-- Add affiliate role to app_role enum
ALTER TYPE app_role ADD VALUE IF NOT EXISTS 'affiliate';

-- Create affiliate_profiles table
CREATE TABLE IF NOT EXISTS public.affiliate_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  company_name TEXT,
  website TEXT,
  social_media_links JSONB DEFAULT '{}',
  application_note TEXT,
  rejection_reason TEXT,
  commission_rate NUMERIC DEFAULT 10.0,
  applied_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  approved_at TIMESTAMP WITH TIME ZONE,
  approved_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(user_id)
);

-- Create referral_codes table
CREATE TABLE IF NOT EXISTS public.referral_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  affiliate_id UUID NOT NULL REFERENCES public.affiliate_profiles(id) ON DELETE CASCADE,
  code TEXT NOT NULL UNIQUE,
  is_active BOOLEAN DEFAULT true,
  clicks INTEGER DEFAULT 0,
  conversions INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create referral_conversions table
CREATE TABLE IF NOT EXISTS public.referral_conversions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referral_code_id UUID NOT NULL REFERENCES public.referral_codes(id) ON DELETE CASCADE,
  affiliate_id UUID NOT NULL REFERENCES public.affiliate_profiles(id) ON DELETE CASCADE,
  referred_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  order_id UUID REFERENCES public.orders(id),
  order_amount NUMERIC NOT NULL,
  commission_amount NUMERIC NOT NULL,
  commission_rate NUMERIC NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'paid', 'cancelled')),
  converted_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create commission_payments table
CREATE TABLE IF NOT EXISTS public.commission_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  affiliate_id UUID NOT NULL REFERENCES public.affiliate_profiles(id) ON DELETE CASCADE,
  amount NUMERIC NOT NULL,
  payment_method TEXT,
  payment_reference TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'paid', 'failed')),
  conversion_ids UUID[] NOT NULL,
  paid_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.affiliate_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.referral_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.referral_conversions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commission_payments ENABLE ROW LEVEL SECURITY;

-- RLS Policies for affiliate_profiles
CREATE POLICY "Users can view own affiliate profile"
  ON public.affiliate_profiles FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own affiliate application"
  ON public.affiliate_profiles FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own pending application"
  ON public.affiliate_profiles FOR UPDATE
  USING (auth.uid() = user_id AND status = 'pending');

CREATE POLICY "Admins can view all affiliate profiles"
  ON public.affiliate_profiles FOR SELECT
  USING (has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update all affiliate profiles"
  ON public.affiliate_profiles FOR UPDATE
  USING (has_role(auth.uid(), 'admin'));

-- RLS Policies for referral_codes
CREATE POLICY "Affiliates can view own referral codes"
  ON public.referral_codes FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.affiliate_profiles
      WHERE affiliate_profiles.id = referral_codes.affiliate_id
        AND affiliate_profiles.user_id = auth.uid()
    )
  );

CREATE POLICY "Affiliates can create own referral codes"
  ON public.referral_codes FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.affiliate_profiles
      WHERE affiliate_profiles.id = referral_codes.affiliate_id
        AND affiliate_profiles.user_id = auth.uid()
        AND affiliate_profiles.status = 'approved'
    )
  );

CREATE POLICY "Affiliates can update own referral codes"
  ON public.referral_codes FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.affiliate_profiles
      WHERE affiliate_profiles.id = referral_codes.affiliate_id
        AND affiliate_profiles.user_id = auth.uid()
    )
  );

CREATE POLICY "Anyone can view active referral codes"
  ON public.referral_codes FOR SELECT
  USING (is_active = true);

-- RLS Policies for referral_conversions
CREATE POLICY "Affiliates can view own conversions"
  ON public.referral_conversions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.affiliate_profiles
      WHERE affiliate_profiles.id = referral_conversions.affiliate_id
        AND affiliate_profiles.user_id = auth.uid()
    )
  );

CREATE POLICY "Admins can view all conversions"
  ON public.referral_conversions FOR SELECT
  USING (has_role(auth.uid(), 'admin'));

CREATE POLICY "System can insert conversions"
  ON public.referral_conversions FOR INSERT
  WITH CHECK (true);

-- RLS Policies for commission_payments
CREATE POLICY "Affiliates can view own payments"
  ON public.commission_payments FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.affiliate_profiles
      WHERE affiliate_profiles.id = commission_payments.affiliate_id
        AND affiliate_profiles.user_id = auth.uid()
    )
  );

CREATE POLICY "Admins can manage all payments"
  ON public.commission_payments FOR ALL
  USING (has_role(auth.uid(), 'admin'));

-- Create updated_at trigger for new tables
CREATE TRIGGER update_affiliate_profiles_updated_at
  BEFORE UPDATE ON public.affiliate_profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_referral_codes_updated_at
  BEFORE UPDATE ON public.referral_codes
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_referral_conversions_updated_at
  BEFORE UPDATE ON public.referral_conversions
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_commission_payments_updated_at
  BEFORE UPDATE ON public.commission_payments
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();