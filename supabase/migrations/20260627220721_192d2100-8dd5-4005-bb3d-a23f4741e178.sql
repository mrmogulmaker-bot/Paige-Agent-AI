
-- =========================================================================
-- Wave 3: Journey signal additions
-- =========================================================================

-- A. Referrals -----------------------------------------------------------
CREATE TABLE public.paige_referrals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_contact_id uuid REFERENCES public.clients(id) ON DELETE CASCADE,
  referred_contact_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  referred_email text,
  referred_at timestamptz NOT NULL DEFAULT now(),
  source text,
  status text NOT NULL DEFAULT 'pending',
  conversion_event text,
  credit_amount_cents integer,
  credited_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX paige_referrals_referrer_idx ON public.paige_referrals(referrer_contact_id, referred_at DESC);
CREATE INDEX paige_referrals_status_idx ON public.paige_referrals(status);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.paige_referrals TO authenticated;
GRANT ALL ON public.paige_referrals TO service_role;

ALTER TABLE public.paige_referrals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins and coaches read referrals"
  ON public.paige_referrals FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'coach'));
CREATE POLICY "Admins and coaches write referrals"
  ON public.paige_referrals FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'coach'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'coach'));

-- B. NPS responses -------------------------------------------------------
CREATE TABLE public.paige_nps_responses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid REFERENCES public.clients(id) ON DELETE CASCADE,
  score integer NOT NULL CHECK (score >= 0 AND score <= 10),
  feedback text,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  campaign_or_survey text,
  follow_up_status text NOT NULL DEFAULT 'pending',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX paige_nps_contact_idx ON public.paige_nps_responses(contact_id, submitted_at DESC);
CREATE INDEX paige_nps_submitted_idx ON public.paige_nps_responses(submitted_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.paige_nps_responses TO authenticated;
GRANT ALL ON public.paige_nps_responses TO service_role;

ALTER TABLE public.paige_nps_responses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins and coaches read NPS"
  ON public.paige_nps_responses FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'coach'));
CREATE POLICY "Admins and coaches write NPS"
  ON public.paige_nps_responses FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'coach'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'coach'));

-- C. Health snapshots ----------------------------------------------------
CREATE TABLE public.paige_health_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid REFERENCES public.clients(id) ON DELETE CASCADE,
  score integer NOT NULL CHECK (score >= 0 AND score <= 100),
  components jsonb NOT NULL DEFAULT '{}'::jsonb,
  computed_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX paige_health_contact_idx ON public.paige_health_snapshots(contact_id, computed_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.paige_health_snapshots TO authenticated;
GRANT ALL ON public.paige_health_snapshots TO service_role;

ALTER TABLE public.paige_health_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins and coaches read health"
  ON public.paige_health_snapshots FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'coach'));
CREATE POLICY "Admins and coaches write health"
  ON public.paige_health_snapshots FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'coach'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'coach'));

-- D. Coach assignments ---------------------------------------------------
CREATE TABLE public.paige_coach_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid REFERENCES public.clients(id) ON DELETE CASCADE,
  coach_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  role text,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  unassigned_at timestamptz,
  active boolean NOT NULL DEFAULT true,
  notes text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX paige_coach_assignments_contact_idx ON public.paige_coach_assignments(contact_id, active);
CREATE INDEX paige_coach_assignments_coach_idx ON public.paige_coach_assignments(coach_id, active);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.paige_coach_assignments TO authenticated;
GRANT ALL ON public.paige_coach_assignments TO service_role;

ALTER TABLE public.paige_coach_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins and coaches read coach assignments"
  ON public.paige_coach_assignments FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'coach'));
CREATE POLICY "Admins and coaches write coach assignments"
  ON public.paige_coach_assignments FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'coach'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'coach'));

-- Shared updated_at triggers --------------------------------------------
CREATE TRIGGER trg_paige_referrals_updated_at
  BEFORE UPDATE ON public.paige_referrals
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_paige_nps_responses_updated_at
  BEFORE UPDATE ON public.paige_nps_responses
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_paige_coach_assignments_updated_at
  BEFORE UPDATE ON public.paige_coach_assignments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
