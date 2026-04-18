
-- =====================================================
-- Phase B — BUILD Framework data layer
-- =====================================================

-- 1) build_progress: one row per user per track
CREATE TABLE IF NOT EXISTS public.build_progress (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                  uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  track                    text NOT NULL CHECK (track IN ('personal','business')),
  current_phase            text NOT NULL DEFAULT 'B' CHECK (current_phase IN ('B','U','I','L','D','graduated')),
  phase_started_at         timestamptz NOT NULL DEFAULT now(),
  phase_target_completion  timestamptz,
  overall_score            integer NOT NULL DEFAULT 0 CHECK (overall_score BETWEEN 0 AND 100),
  last_assessed_at         timestamptz NOT NULL DEFAULT now(),
  business_id              uuid REFERENCES public.businesses(id) ON DELETE CASCADE,
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, track, business_id)
);

-- 2) build_milestones: catalog of milestones per track + phase
CREATE TABLE IF NOT EXISTS public.build_milestones (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  track               text NOT NULL CHECK (track IN ('personal','business')),
  phase               text NOT NULL CHECK (phase IN ('B','U','I','L','D')),
  milestone_key       text NOT NULL UNIQUE,
  display_name        text NOT NULL,
  description         text,
  weight              numeric(5,4) NOT NULL DEFAULT 0.1,
  verification_type   text NOT NULL CHECK (verification_type IN ('user_attested','data_driven','document_uploaded')),
  required_for_phase  boolean NOT NULL DEFAULT true,
  sort_order          integer NOT NULL DEFAULT 0,
  created_at          timestamptz NOT NULL DEFAULT now()
);

-- 3) user_build_milestones: per-user progress
CREATE TABLE IF NOT EXISTS public.user_build_milestones (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  milestone_id  uuid NOT NULL REFERENCES public.build_milestones(id) ON DELETE CASCADE,
  business_id   uuid REFERENCES public.businesses(id) ON DELETE CASCADE,
  status        text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','in_progress','completed','blocked','skipped')),
  completed_at  timestamptz,
  evidence      jsonb,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, milestone_id, business_id)
);

-- 4) build_recommendations: Paige-generated, BUILD-tagged suggestions
CREATE TABLE IF NOT EXISTS public.build_recommendations (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  track             text NOT NULL CHECK (track IN ('personal','business')),
  phase             text NOT NULL CHECK (phase IN ('B','U','I','L','D')),
  milestone_key     text,
  action_type       text NOT NULL,
  title             text NOT NULL,
  body              text NOT NULL,
  vendor_or_product text,
  external_url      text,
  priority          integer NOT NULL DEFAULT 5 CHECK (priority BETWEEN 1 AND 10),
  status            text NOT NULL DEFAULT 'suggested' CHECK (status IN ('suggested','acted_on','dismissed','expired')),
  created_at        timestamptz NOT NULL DEFAULT now(),
  acted_at          timestamptz
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_build_progress_user             ON public.build_progress(user_id);
CREATE INDEX IF NOT EXISTS idx_build_milestones_track_phase    ON public.build_milestones(track, phase);
CREATE INDEX IF NOT EXISTS idx_user_build_milestones_user      ON public.user_build_milestones(user_id);
CREATE INDEX IF NOT EXISTS idx_user_build_milestones_milestone ON public.user_build_milestones(milestone_id);
CREATE INDEX IF NOT EXISTS idx_build_recommendations_user      ON public.build_recommendations(user_id, status);

-- updated_at triggers
CREATE TRIGGER trg_build_progress_updated_at
  BEFORE UPDATE ON public.build_progress
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trg_user_build_milestones_updated_at
  BEFORE UPDATE ON public.user_build_milestones
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =====================================================
-- RLS
-- =====================================================
ALTER TABLE public.build_progress           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.build_milestones         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_build_milestones    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.build_recommendations    ENABLE ROW LEVEL SECURITY;

-- Catalog: any authenticated user can read; only admins can manage
CREATE POLICY "build_milestones readable by authenticated"
  ON public.build_milestones
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "build_milestones admin manage"
  ON public.build_milestones
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

-- build_progress: self + admin
CREATE POLICY "build_progress self select"
  ON public.build_progress
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "build_progress self insert"
  ON public.build_progress
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "build_progress self update"
  ON public.build_progress
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "build_progress self delete"
  ON public.build_progress
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::public.app_role));

-- user_build_milestones: self + admin
CREATE POLICY "user_build_milestones self select"
  ON public.user_build_milestones
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "user_build_milestones self insert"
  ON public.user_build_milestones
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "user_build_milestones self update"
  ON public.user_build_milestones
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "user_build_milestones self delete"
  ON public.user_build_milestones
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::public.app_role));

-- build_recommendations: self + admin
CREATE POLICY "build_recommendations self select"
  ON public.build_recommendations
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "build_recommendations self insert"
  ON public.build_recommendations
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "build_recommendations self update"
  ON public.build_recommendations
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "build_recommendations self delete"
  ON public.build_recommendations
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::public.app_role));

-- =====================================================
-- Additive columns on lender_products (no row data touched)
-- =====================================================
ALTER TABLE public.lender_products
  ADD COLUMN IF NOT EXISTS min_paydex                 integer,
  ADD COLUMN IF NOT EXISTS min_intelliscore           integer,
  ADD COLUMN IF NOT EXISTS min_dscr                   numeric,
  ADD COLUMN IF NOT EXISTS min_months_clean_reporting integer,
  ADD COLUMN IF NOT EXISTS requires_duns              boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS min_build_phase_personal   text,
  ADD COLUMN IF NOT EXISTS min_build_phase_business   text;

-- Add CHECK constraints for the phase columns (only if not already present)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'lender_products_min_build_phase_personal_check'
  ) THEN
    ALTER TABLE public.lender_products
      ADD CONSTRAINT lender_products_min_build_phase_personal_check
      CHECK (min_build_phase_personal IS NULL OR min_build_phase_personal IN ('B','U','I','L','D'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'lender_products_min_build_phase_business_check'
  ) THEN
    ALTER TABLE public.lender_products
      ADD CONSTRAINT lender_products_min_build_phase_business_check
      CHECK (min_build_phase_business IS NULL OR min_build_phase_business IN ('B','U','I','L','D'));
  END IF;
END$$;
