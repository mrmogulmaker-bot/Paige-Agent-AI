-- ============================================================
-- PART 1: Add intake/goal columns to profiles
-- ============================================================
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS intake_completed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS intake_completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS primary_goal text,
  ADD COLUMN IF NOT EXISTS primary_goal_category text,
  ADD COLUMN IF NOT EXISTS goal_timeline text,
  ADD COLUMN IF NOT EXISTS goal_amount integer,
  ADD COLUMN IF NOT EXISTS experience_level text,
  ADD COLUMN IF NOT EXISTS financing_preference text,
  ADD COLUMN IF NOT EXISTS biggest_obstacle text,
  ADD COLUMN IF NOT EXISTS intake_responses jsonb;

-- Validation constraints (loose — allow NULL, enforce values when present)
ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_primary_goal_category_check;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_primary_goal_category_check
  CHECK (primary_goal_category IS NULL OR primary_goal_category IN (
    'real_estate_investment','primary_home_purchase','business_funding',
    'credit_building','business_credit','debt_elimination','wealth_building','other'
  ));

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_goal_timeline_check;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_goal_timeline_check
  CHECK (goal_timeline IS NULL OR goal_timeline IN (
    'immediate','short_term','medium_term','long_term'
  ));

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_experience_level_check;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_experience_level_check
  CHECK (experience_level IS NULL OR experience_level IN (
    'beginner','some_experience','experienced'
  ));

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_financing_preference_check;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_financing_preference_check
  CHECK (financing_preference IS NULL OR financing_preference IN (
    'conventional','fha','sba','hard_money','dscr','cash','unsure'
  ));

-- ============================================================
-- PART 2: client_goals table
-- ============================================================
CREATE TABLE IF NOT EXISTS public.client_goals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  goal_category text NOT NULL,
  goal_description text,
  target_amount integer,
  target_date date,
  status text NOT NULL DEFAULT 'active',
  progress_notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT client_goals_status_check CHECK (status IN ('active','achieved','paused','abandoned')),
  CONSTRAINT client_goals_category_check CHECK (goal_category IN (
    'real_estate_investment','primary_home_purchase','business_funding',
    'credit_building','business_credit','debt_elimination','wealth_building','other'
  ))
);

CREATE INDEX IF NOT EXISTS idx_client_goals_user_id ON public.client_goals(user_id);
CREATE INDEX IF NOT EXISTS idx_client_goals_status ON public.client_goals(status);

ALTER TABLE public.client_goals ENABLE ROW LEVEL SECURITY;

-- Clients: full CRUD on their own goals
DROP POLICY IF EXISTS "Users can view own goals" ON public.client_goals;
CREATE POLICY "Users can view own goals"
  ON public.client_goals FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own goals" ON public.client_goals;
CREATE POLICY "Users can insert own goals"
  ON public.client_goals FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own goals" ON public.client_goals;
CREATE POLICY "Users can update own goals"
  ON public.client_goals FOR UPDATE
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own goals" ON public.client_goals;
CREATE POLICY "Users can delete own goals"
  ON public.client_goals FOR DELETE
  USING (auth.uid() = user_id);

-- Admins & coaches: read all, update status/notes
DROP POLICY IF EXISTS "Admins and coaches can view all goals" ON public.client_goals;
CREATE POLICY "Admins and coaches can view all goals"
  ON public.client_goals FOR SELECT
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'coach'::public.app_role)
  );

DROP POLICY IF EXISTS "Admins and coaches can update goals" ON public.client_goals;
CREATE POLICY "Admins and coaches can update goals"
  ON public.client_goals FOR UPDATE
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'coach'::public.app_role)
  );

-- updated_at trigger
DROP TRIGGER IF EXISTS update_client_goals_updated_at ON public.client_goals;
CREATE TRIGGER update_client_goals_updated_at
  BEFORE UPDATE ON public.client_goals
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();