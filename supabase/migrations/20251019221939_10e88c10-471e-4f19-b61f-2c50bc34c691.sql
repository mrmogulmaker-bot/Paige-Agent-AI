-- Create coach_clients table for multi-client support
CREATE TABLE IF NOT EXISTS public.coach_clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  client_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'pending')),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(coach_user_id, client_user_id)
);

ALTER TABLE public.coach_clients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Coaches can view own clients"
ON public.coach_clients FOR SELECT
USING (auth.uid() = coach_user_id AND has_role(auth.uid(), 'coach'::app_role));

CREATE POLICY "Coaches can add clients"
ON public.coach_clients FOR INSERT
WITH CHECK (auth.uid() = coach_user_id AND has_role(auth.uid(), 'coach'::app_role));

CREATE POLICY "Coaches can update own clients"
ON public.coach_clients FOR UPDATE
USING (auth.uid() = coach_user_id AND has_role(auth.uid(), 'coach'::app_role));

CREATE POLICY "Clients can view own coaches"
ON public.coach_clients FOR SELECT
USING (auth.uid() = client_user_id);

-- Create certificates table
CREATE TABLE IF NOT EXISTS public.course_certificates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  course_id uuid NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  issued_at timestamptz NOT NULL DEFAULT now(),
  certificate_url text,
  verification_code text UNIQUE NOT NULL DEFAULT encode(gen_random_bytes(16), 'hex'),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, course_id)
);

ALTER TABLE public.course_certificates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own certificates"
ON public.course_certificates FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Anyone can verify certificates"
ON public.course_certificates FOR SELECT
USING (true);

CREATE POLICY "Service role can issue certificates"
ON public.course_certificates FOR INSERT
WITH CHECK (current_setting('role'::text) = 'service_role');

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_coach_clients_coach ON public.coach_clients(coach_user_id);
CREATE INDEX IF NOT EXISTS idx_coach_clients_client ON public.coach_clients(client_user_id);
CREATE INDEX IF NOT EXISTS idx_certificates_verification ON public.course_certificates(verification_code);

-- Add trigger for updated_at
CREATE TRIGGER update_coach_clients_updated_at
  BEFORE UPDATE ON public.coach_clients
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();