
ALTER TABLE public.profiles ADD COLUMN dashboard_mode TEXT NOT NULL DEFAULT 'client';

-- Allow admins to view all profiles (for client management dashboard)
CREATE POLICY "Admins can view all profiles"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

-- Allow coaches to view their clients' profiles
CREATE POLICY "Coaches can view client profiles"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.coach_clients cc
      WHERE cc.coach_user_id = auth.uid()
        AND cc.client_user_id = profiles.user_id
        AND cc.status = 'active'
    )
  );
